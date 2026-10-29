import { startTransition, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import {
  AppearanceGlyph,
  BrowseGlyph,
  CogGlyph,
  PlusGlyph,
  SearchPill,
  SessionClock,
  SplitGlyph,
  StatusBar,
  TopChip,
  Wordmark
} from './components/Chrome'
import ContextMenu, { type CtxTarget } from './components/ContextMenu'
import EmptyPane, { type EmptyRow, type EmptySurface } from './components/EmptyPane'
import MoveNote from './components/MoveNote'
import NewMenu from './components/NewMenu'
import Palette, { type OpenMark, type PalKind } from './components/Palette'
import PathMenu, { type PathTarget } from './components/PathMenu'
import FileMenu, { type FileTarget } from './components/FileMenu'
import Pane from './components/Pane'
import { RailMemo, RailShell, type RailRow } from './components/Rail'
import type { Fact, LinkRow } from './components/PaneHeader'
import SplitSeam from './components/SplitSeam'
import { FileMenuContext, VaultNamesContext, WikiMenuContext } from './components/Runs'
import Settings from './components/Settings'
import SettingsPanel from './components/SettingsPanel'
import { tokens } from '@shared/contextWindow'
import { familyOf, familyRoot } from '@shared/pathways'
import { signInFaultIn } from '@shared/signin'
import { limitIn } from '@shared/limit'
import type { UpdateState } from '@shared/update'
import { mergeUsage } from '@shared/usage'
import { findComments, reviewPrompt } from '@shared/comments'
import { startOptions } from '@shared/options'
import { runOf } from '@shared/prompts'
import { firstWords, UNTITLED } from '@shared/noteTitle'
import { age, ago, folderLabel, isReadOnly, laneOfPath } from './lib/format'
import { laneLabel } from '@shared/lanes'
import { paneWidth } from './lib/layout'
import { applyHighlight, applyTheme, cycleTheme, onSystemThemeChange, stepText } from './lib/theme'
import { giveTypingBack, holdTyping } from './lib/typeAhead'
import {
  activeTab,
  canGo,
  closeTab as closeTabAt,
  closeOthers as closeOthersAt,
  emptyPane,
  blankPane,
  blankNoteTab,
  emptyTab,
  MAX_TABS,
  moveTab,
  isBlank,
  paneFor,
  placeBehind,
  placeTab,
  roleOf,
  togglePin,
  tabUid,
  pushHistory,
  type PaneState,
  type TabKind,
  type TabState
} from './state/pane'
import type {
  NoteLinks,
  AppState,
  ContextUsage,
  EffortId,
  ForkFailure,
  ImageBlock,
  LaneDef,
  LinkedNote,
  Message,
  ModelDef,
  Note,
  NoteEntry,
  NoteHit,
  TaskHit,
  CommentHit,
  SavedTab,
  SavedPrompt,
  PermissionRequest,
  PromptRun,
  RanNotice,
  Seam,
  SkillDef,
  StartOptions,
  StreamEvent,
  TextBlock,
  ThreadHit,
  ThreadSummary
} from '@shared/types'

/**
 * M7 — two panes, each a tab strip. A tab holds a chat or a note and owns
 * everything live about it, history included. Every open lands in the focused
 * pane through `openIn`; clicking replaces the active tab, ⌘-clicking adds one.
 */

type PaneIndex = 0 | 1

/**
 * A PATH YOU LEFT WHILE IT WAS STILL ANSWERING.
 *
 * Not a cache of the transcript: the conversation exactly as its pane had it
 * when you stepped away, kept up to date by the same stream that would have
 * been drawing it. Coming back is then not a re-read at all — you are handed
 * what you would have been looking at, which is the only version of "keep both
 * roads open" that cannot show you a turn twice.
 *
 * Reading it back off disk instead was the obvious thing and it does not work.
 * The file and the stream name messages differently — the file by position, the
 * stream by the turn a draft belongs to — so nothing can tell whether the
 * half-written answer on disk and the one arriving are the same answer. This
 * sidesteps that question rather than answering it.
 */
interface Away {
  title: string
  started: number
  messages: Message[]
  seams: Seam[]
  pending: { verb: string; started: number } | null
  ask: PermissionRequest | null
  error: string | null
  context: ContextUsage | null
}

/**
 * What one stream event does to a conversation — whichever conversation. Tabs
 * and left-behind paths take the same steps, because a path that is off screen
 * is not a different kind of thing from one that is on it.
 */
function step(e: StreamEvent) {
  return (s: Pick<Away, 'messages'>): Partial<Away> => {
    switch (e.type) {
      case 'started':
        return { pending: { verb: e.verb, started: e.at }, error: null }
      case 'message':
        return { messages: [...s.messages, e.message] }
      case 'patch': {
        const at = s.messages.findIndex((m) => m.id === e.messageId)
        return {
          messages:
            at === -1
              ? [...s.messages, e.message]
              : s.messages.map((m, k) => (k === at ? e.message : m))
        }
      }
      case 'context':
        return { context: e.context }
      case 'done':
      case 'exit':
        return { pending: null }
      case 'permission':
        // Guarded only. The turn has already ended — the CLI refused the call
        // rather than waiting — so this sits above the composer until answered.
        return { ask: e.request, pending: null }
      case 'error':
        return { error: e.message }
      default:
        return {}
    }
  }
}

/**
 * A label for a chat the moment it has one message in it. The namer needs a
 * finished turn and then a round trip of its own, which is seconds of a tab
 * still reading "New thread" while you are already talking to it. This is what it
 * says in the meantime — the first line of what you asked, which is a sentence
 * rather than a name, but is never nothing.
 */
function openingLabel(text: string, images?: { name: string }[]): string {
  const line = text.split('\n').find((l) => l.trim())?.trim()
  if (!line) return images?.length ? (images[0].name || 'Image') : 'New thread'
  // Long enough to tell two chats apart, short enough for a tab to show it.
  const cut = line.length > 48 ? `${line.slice(0, 47).trimEnd()}…` : line
  return cut
}

/**
 * Everything a message actually SAID, with the tool rows left out.
 *
 * Not `message.text`. That is the LEAD paragraph, and only when it leads: the
 * moment a turn opens with a tool call — a skill, a file read, a search, which
 * is how most real work here begins — the prose that follows lands in `blocks`
 * and `text` stays empty for the whole message. The namer read `text`, found
 * nothing to name, and gave up on every such thread, quietly, on every turn it
 * ever finished.
 */
const saidBy = (m: Message): string =>
  (
    m.source ??
    [m.text, ...m.blocks.filter((b): b is TextBlock => b.kind === 'text').map((b) => b.text)]
      .filter(Boolean)
      .join('\n\n')
  ).trim()

/** A note's filename, for the second or so before the note list can give its title. */
const nameOfPath = (path: string): string =>
  (path.split('/').pop() ?? path).replace(/\.md$/, '')

/** A stable empty array, so the memo below does not re-run every render. */
const EMPTY_MARKS: string[] = []
/** No lanes, as one array: a state that has none yet is not a new answer every render. */
const NO_LANES: LaneDef[] = []

/**
 * Where a new note lands when its name carries no folder of its own: the folder
 * Settings names, the vault root when it names none — and never a folder kept
 * read only, which would refuse the note, so the root then too.
 */
function newNoteHome(s: AppState | null | undefined): string {
  const set = (s?.newNoteFolder ?? '').trim().replace(/^\/+|\/+$/g, '')
  return isReadOnly(set, s?.readOnlyFolders) ? '' : set
}

/**
 * What a refused fork says. It used to say nothing at all — the click landed,
 * main declined, and the reader was left to conclude the action was broken.
 * Each of these is a real state with a way out of it.
 */
const FORK_REFUSED: Record<ForkFailure, string> = {
  racing: 'The transcript is still catching up — try that again in a moment.',
  'nothing-answered': 'Nothing was answered before here, so there is no conversation to carry over.',
  moved: 'This thread has moved on since it was drawn — reopen it and try again.',
  unreadable: 'That transcript could not be copied.'
}

export default function App(): React.JSX.Element {
  const [models, setModels] = useState<ModelDef[]>([])
  const [state, setState] = useState<AppState | null>(null)
  /**
   * The person's lanes, read from state wherever they are asked for — so a lane
   * made, renamed or taken away shows at once, without a relaunch. None is an
   * answer, and the chrome that would name one says nothing instead.
   */
  const lanes = Array.isArray(state?.lanes) ? state.lanes : NO_LANES
  /** The folder this window works in, as main resolved it at launch. */
  const [vault, setVault] = useState('')
  /**
   * EVERY model this app knows: the built-in table plus the ones added in
   * Settings. Custom models used to reach the state file and the default-model
   * setting and nothing else — the composer's picker was handed the built-in
   * three — so a model you had added could be made the default and then never
   * chosen for a single thread.
   */
  const allModels = useMemo(
    () => [...models, ...(state?.customModels ?? [])],
    [models, state?.customModels]
  )
  const [threads, setThreads] = useState<ThreadSummary[]>([])
  /** The list the app shows: transcript titles, with our own names over them. */
  const named = useMemo(() => {
    const over = state?.titleOverrides
    if (!over || !Object.keys(over).length) return threads
    return threads.map((t) => (over[t.id] ? { ...t, title: over[t.id] } : t))
  }, [threads, state?.titleOverrides])
  /**
   * One row per family. Every pathway stays in `named` — a restored tab, a
   * resolved link and the palette all address a path by its own id — but a
   * family is one thread, so the lists a reader browses show it once, under the
   * name and the id it started with.
   */
  const oneEach = useMemo(() => named.filter((t) => t.root === t.id), [named])
  const threadRoots = useMemo(() => new Map(threads.map((t) => [t.id, t.root])), [threads])
  const threadNames = useMemo(
    () => new Set(threads.filter((t) => t.named).map((t) => t.id)),
    [threads]
  )
  const [query, setQuery] = useState('')
  /** What the rail shows, in order — notes and the focused note's chats alike. */
  const [visibleOrder, setVisibleOrder] = useState<RailRow[]>([])
  /** The focused note's chats. */
  /** Where the focused note points and what points back at it. */

  const [panes, setPanes] = useState<[PaneState, PaneState]>([emptyPane(), blankPane()])
  const [split, setSplit] = useState(false)
  const [focus, setFocus] = useState<PaneIndex>(0)
  const [vw, setVw] = useState(window.innerWidth)
  const [now, setNow] = useState(Date.now())
  const [skills, setSkills] = useState<SkillDef[]>([])
  const [settingsOpen, setSettingsOpen] = useState(false)
  /** The full surface: models, safety, skills. Reached from the panel. */
  const [moreSettings, setMoreSettings] = useState(false)
  /** `newTab` is set when the palette was opened from a strip's `+`. */
  const [palette, setPalette] = useState<{ newTab: boolean; kind?: PalKind } | null>(null)
  const [ctx, setCtx] = useState<CtxTarget | null>(null)
  /** The path a seam label was right-clicked on. */
  const [pathCtx, setPathCtx] = useState<PathTarget | null>(null)
  /** The file or folder a path in a note or a thread was right-clicked for. */
  const [fileCtx, setFileCtx] = useState<FileTarget | null>(null)
  /**
   * The top bar's `+` asks which kind of thing. ⌘N opens the same menu already
   * on the note, so one control answers the button and the shortcut both.
   */
  const [newMenu, setNewMenu] = useState(false)
  /**
   * The note made a moment ago. It opens in EDIT rather than READING, and stops
   * being new as soon as anything else is opened — a note is new once, and
   * coming back to it later should read rather than edit.
   */
  const [freshNote, setFreshNote] = useState<string | null>(null)
  /**
   * The chat tab made a moment ago — it opens with the composer already
   * focused. The count is what makes the next one a new event rather than more
   * of the same: the composer is one long-lived field, so an id alone cannot
   * tell "still the fresh tab" from "a second fresh tab".
   */
  const [freshChat, setFreshChat] = useState<{ id: string; n: number } | null>(null)
  /**
   * Whether the note outline is shut, by TAB rather than by note: the same note
   * open in both panes can be open in one and closed in the other, and a tab
   * keeps its answer while you switch away and back. Undefined is "not chosen
   * here yet", which the pane resolves from its own margin.
   *
   * Not persisted — a tab key is minted on insert and means nothing across a
   * relaunch.
   */
  const [tocOff, setTocOff] = useState<Record<string, boolean>>({})
  /**
   * WRITE or READ, by NOTE rather than by tab. A note you have opened the
   * markdown of is one you are working on, and it should still be open when you
   * come back to it a tab or two later — where a mode kept per tab would put
   * you in the wrong one the moment the tab showed something else.
   *
   * Keyed by the note's IDENTITY, which a rename keeps: by path, naming an
   * untitled note mid-sentence would have put it back in READ under the caret.
   *
   * Undefined or 0 is READ, which is what a note opens as: it is mostly there to
   * be read from, beside the thread that is using it, and writing is the thing
   * you ask for — ⌘E, the pair, or a double-click where you mean to write. A
   * note made a moment ago is the exception, and opens in WRITE.
   *
   * In WRITE the number says WHICH stretch of writing this is, counted up each
   * time a note goes into WRITE: esc offers to discard what was written since
   * then, and the editor needs to know whether it is being shown again in the
   * same stretch — a tab switched away and back — or a new one has begun.
   */
  const [writeOn, setWriteOn] = useState<Record<string, number>>({})
  const writeSeq = useRef(0)
  /** The note whose folder is being changed, if any. */
  const [moving, setMoving] = useState<string | null>(null)
  /** Which pane has the find bar open, if any. */
  const [findPane, setFindPane] = useState<PaneIndex | null>(null)
  const [findNonce, setFindNonce] = useState(0)
  /**
   * The last thing looked for. A ref, not state: it changes on every keystroke
   * in the find field and nothing outside that field renders from it — the bar
   * seeds itself from this when it opens, which is what makes ⌘G on a closed
   * bar mean "find that again" rather than "find nothing".
   */
  const findQuery = useRef('')
  /** The palette's query and the text matches it is waiting on. */
  const [palQuery, setPalQuery] = useState('')
  const [palContent, setPalContent] = useState<NoteHit[]>([])
  const [palTasks, setPalTasks] = useState<TaskHit[]>([])
  const [palComments, setPalComments] = useState<CommentHit[]>([])
  /**
   * A comment to land on, once its note is in front: ⌘K's COMMENTS opens the
   * note at it. Counted, so landing on the same one twice is two landings.
   */
  const [commentLand, setCommentLand] = useState<{ path: string; from: number; text: string; n: number } | null>(null)
  const [palThreads, setPalThreads] = useState<ThreadHit[]>([])

  /**
   * Whether the CLI can sign in — asked once at launch and again whenever a
   * turn comes back complaining about it, because that is the moment it may
   * have just been fixed in a terminal. `null` from main means "unreadable",
   * which is not evidence of anything and says nothing on screen. `'missing'`
   * is no CLI at all: nothing to sign in to until Claude Code is installed.
   */
  const [signedOut, setSignedOut] = useState(false)
  const [cliMissing, setCliMissing] = useState(false)
  const askAuth = useCallback(
    (): Promise<void> =>
      window.lanes.authStatus().then((s) => {
        if (s === 'missing') {
          setCliMissing(true)
          setSignedOut(false)
          return
        }
        if (!s) return
        setCliMissing(false)
        setSignedOut(!s.loggedIn)
      }),
    []
  )
  useEffect(() => {
    void askAuth()
  }, [askAuth])
  /** What is being dragged, and which pane is lit up as its destination. */
  const [drag, setDrag] = useState<
    { kind: 'chat' | 'note'; id: string; from?: PaneIndex } | null
  >(null)
  const [dropPane, setDropPane] = useState<PaneIndex | null>(null)
  /** Note bodies behind open note tabs, by vault path. */
  const [noteCache, setNoteCache] = useState<Record<string, Note>>({})
  /** Read by the undo, which needs what the note says NOW, not last render. */
  const noteCacheRef = useRef<Record<string, Note>>({})
  noteCacheRef.current = noteCache
  const [linked, setLinked] = useState<LinkedNote[]>([])
  /** The note pane's backlinks and the chats that touched it — details panel. */
  const [noteBacklinks, setNoteBacklinks] = useState<NoteLinks>({ out: [], back: [] })
  const [noteChats, setNoteChats] = useState<ThreadSummary[]>([])
  /** Per pane: is the details panel disclosed? */
  const [details, setDetails] = useState<[boolean, boolean]>([false, false])
  /** Every note in the vault — titles and paths only, for the notes browser. */
  const [allNotes, setAllNotes] = useState<NoteEntry[]>([])
  /**
   * What a thread's prose is read against for links it does not spell out (see
   * `threadLinks`): each note's file name to the note — only the names exactly
   * one note has, since two notes of one name are not guessed between — and the
   * vault's top-level folders, which make a bare path the vault's.
   */
  const vaultNames = useMemo(() => {
    const notes = new Map<string, string>()
    const twice = new Set<string>()
    const roots = new Set<string>()
    for (const n of allNotes) {
      const parts = n.path.split('/')
      if (parts.length > 1) roots.add(parts[0])
      const name = (parts[parts.length - 1] ?? '').toLowerCase()
      if (!name) continue
      if (notes.has(name)) twice.add(name)
      else notes.set(name, n.path)
    }
    for (const name of twice) notes.delete(name)
    return { notes, roots }
  }, [allNotes])
  /**
   * The folders a lane can be put on, for Settings: every top-level folder of
   * the vault and every one a level below, read off the notes in them — a lane
   * is `projects/garden` or `essays`, rarely deeper. Hidden folders are no
   * one's lane.
   */
  const laneFolders = useMemo(() => {
    const out = new Set<string>()
    for (const n of allNotes) {
      const parts = n.path.split('/').slice(0, -1)
      if (!parts.length || parts.some((p) => p.startsWith('.'))) continue
      out.add(parts[0])
      if (parts.length > 1) out.add(`${parts[0]}/${parts[1]}`)
    }
    return [...out].sort((a, b) => a.localeCompare(b))
  }, [allNotes])
  /** Unchecked tasks across every note — the empty note pane's counted chip. */
  const [openTasks, setOpenTasks] = useState(0)
  const [notesLoading, setNotesLoading] = useState(true)
  /** Bumped when the index reports a change, to re-ask it for the note column. */
  const [indexVersion, setIndexVersion] = useState(0)
  /**
   * Notes whose file moved on under unsaved typing, by path — each held until
   * its person chooses which version stands. A set, not one slot: a second
   * note in conflict used to take the first one's place, and the first one's
   * banner went with it while its held words were written over the version it
   * had conflicted with the moment the window closed.
   */
  const [conflicts, setConflicts] = useState<ReadonlySet<string>>(() => new Set())
  /**
   * Notes whose last write did not land, and what to say about it. Said in the
   * pane's bar — a write that fails silently is words that exist on screen and
   * nowhere else, which is the one thing a writing surface must never hide.
   */
  const [saveTrouble, setSaveTrouble] = useState<Record<string, string>>({})
  const conflictRef = useRef(new Set<string>())
  const markConflict = (path: string): void => {
    conflictRef.current.add(path)
    setConflicts(new Set(conflictRef.current))
  }
  const clearConflict = (path: string): void => {
    if (conflictRef.current.delete(path)) setConflicts(new Set(conflictRef.current))
  }
  /**
   * The mtime this app last read or wrote each note at, by path. What an
   * outside edit is detected against — by the poll, and by main itself, which
   * refuses a write over a file that has moved on since (see `writeNote`).
   */
  const mtimes = useRef(new Map<string, number>())
  /**
   * Notes with a write in flight, which the poll must not mistake for somebody
   * else's — and the body each one carries, which until it lands is newer than
   * anything a read of the file can hand back (see `tabContent`).
   */
  const writing = useRef(new Map<string, { body: string }>())
  const dirtyRef = useRef(false)
  /**
   * Keystrokes typed into the note pane that have not reached the app yet —
   * unsaved work the poll must see. NOT "the editor is open": an open editor
   * with nothing owed has nothing to lose to a change on disk.
   */
  const editingNote = useRef(false)
  /**
   * The writes each note is owed, by path, each on its own timer. One shared
   * timer meant a second note edited within half a second of the first
   * cancelled the first one's save — its last words never reached the disk.
   */
  const saves = useRef(
    new Map<string, { timer: ReturnType<typeof setTimeout> | null; body: string; since: number }>()
  )
  /**
   * Where a renamed note went. A save already on its way, bound to the path it
   * was typed at, would otherwise land on the OLD path after the rename and
   * quietly recreate the file it just left.
   */
  const movedTo = useRef(new Map<string, string>())
  /**
   * A note's identity, which a rename keeps: the path it was first opened at.
   * The editor is keyed on this, so naming a note mid-sentence does not tear
   * the editor down under the caret, taking its undo history with it.
   */
  const noteIds = useRef(new Map<string, string>())
  const noteIdOf = (path: string): string => noteIds.current.get(path) ?? path
  /**
   * A path made new again forgets what it used to be. Naming `untitled.md` frees
   * that name, and the next ⌘N takes it: without this, the new note would
   * inherit the old one's identity (and share its editor, history and all) and
   * every save to it would be redirected into the note that left.
   */
  const freshPath = (path: string): void => {
    movedTo.current.delete(path)
    noteIds.current.set(path, `${path}\u0000${Date.now()}`)
  }
  /**
   * Put a note into WRITE or take it out. Going in starts a new stretch of
   * writing; asking for WRITE while already in it is not one.
   */
  const setWriting = useCallback((path: string, on: boolean): void => {
    const id = noteIds.current.get(path) ?? path
    setWriteOn((was) => {
      if (on) return was[id] ? was : { ...was, [id]: (writeSeq.current += 1) }
      return was[id] ? { ...was, [id]: 0 } : was
    })
  }, [])
  /** Untitled notes being named right now, so one title cannot rename a file twice. */
  const titling = useRef(new Set<string>())

  const searchRef = useRef<HTMLInputElement>(null)
  /** The stream router reads panes without re-subscribing on every keystroke. */
  const panesRef = useRef(panes)
  panesRef.current = panes
  const splitRef = useRef(split)
  splitRef.current = split
  const focusRef = useRef(focus)
  focusRef.current = focus

  /**
   * A conversation you are actually looking at: the ACTIVE tab of a pane that
   * is on screen, in a window that has focus. Everything else is somewhere
   * else, however few clicks away — the other tab, the pane the split is
   * hiding, or this whole window behind another app.
   */
  const watching = useCallback((id: string): boolean => {
    if (!document.hasFocus()) return false
    const on: PaneIndex[] = splitRef.current ? [0, 1] : [focusRef.current]
    return on.some((i) => {
      const pane = panesRef.current[i]
      const t = pane.tabs[pane.active]
      return t?.kind === 'chat' && t.id === id
    })
  }, [])
  const stateRef = useRef<AppState | null>(null)
  /** path → title, for naming a note the wikilink menu just resolved. */
  const noteTitles = useRef(new Map<string, string>())


  /* ---------- one thread, however many paths it is made of ---------- */

  /**
   * The id a thread is KNOWN by — the root of its family. Everything keyed per
   * thread rather than per session goes through here: its name, its star, the
   * row that goes bold. A note path is not a session id and is in no family, so
   * it comes back unchanged.
   */
  /** What family main says each session belongs to. See `rootOf`. */
  const rootsRef = useRef(new Map<string, string>())
  /**
   * Sessions whose transcript carries a name of their own — renamed in the CLI,
   * or named by it. What tells `nameThread` there is nothing left for it to do.
   */
  const ownNames = useRef(new Set<string>())

  /**
   * Paths left mid-answer, by session id. See `Away`. A ref because the stream
   * writes to it many times a second and nothing on screen reads it directly —
   * `awayNow` is the part a seam has to draw, which is only what each of them
   * is doing.
   */
  const away = useRef(new Map<string, Away>())
  const [awayNow, setAwayNow] = useState<Record<string, 'answering' | 'asking'>>({})
  const tellSeams = useCallback(() => {
    const now: Record<string, 'answering' | 'asking'> = {}
    for (const [id, a] of away.current) {
      if (a.pending) now[id] = 'answering'
      else if (a.ask) now[id] = 'asking'
    }
    setAwayNow((was) => {
      const keys = Object.keys(now)
      const same =
        keys.length === Object.keys(was).length && keys.every((k) => was[k] === now[k])
      return same ? was : now
    })
  }, [])

  const rootOf = useCallback(
    (id: string): string => {
      /*
       * Main's answer first. It is the side that knows which transcripts still
       * exist, and it promotes a member whose root has gone — every path of a
       * rootless family becomes a thread of its own. Deriving this here from
       * the records alone would keep pointing at the missing root, and the two
       * sides would disagree the moment a transcript is deleted from under the
       * app: two rail rows, both bold, both opening the same path.
       */
      const known = rootsRef.current.get(id)
      if (known) return known
      const p = stateRef.current?.pathways
      return p ? familyRoot(p, id) : id
    },
    []
  )

  /** Two chat ids are the same thread when they are paths of one family. */
  const sameThread = useCallback(
    (a: string, b: string): boolean => a === b || rootOf(a) === rootOf(b),
    [rootOf]
  )

  /**
   * A thread's paths in the order they came to exist — the one it started as
   * first, then each cut as it was taken. Empty for a thread nobody has forked,
   * which is what keeps the head's meta line quiet in the ordinary case.
   */
  const pathOrder = useCallback(
    (id: string): string[] => {
      const p = stateRef.current?.pathways
      if (!p) return []
      const fam = familyOf(p, id)
      if (fam.length < 2) return []
      const root = familyRoot(p, id)
      return [
        root,
        ...fam
          .filter((x) => x !== root)
          .sort((a, b) => (p[a]?.created ?? 0) - (p[b]?.created ?? 0))
      ]
    },
    []
  )

  /**
   * Which path to actually open for a thread. A family is listed under its root
   * but read on whichever path you were last on, so opening one from the rail
   * returns you to where you were rather than to where it started.
   */
  const pathOf = useCallback(
    (id: string): string => {
      const s = stateRef.current
      if (!s) return id
      const at = s.pathwayActive[familyRoot(s.pathways, id)]
      return at ?? id
    },
    []
  )

  /** Patches one tab by index — a tab, not a pane, is what owns live state. */
  /**
   * The same patch addressed by the tab's own key rather than by where it sits.
   *
   * An index is only true for as long as the strip does not move, and the whole
   * point of an async load is that things happen while it is in flight: close a
   * tab to its left, drag one across, and the reply lands on whichever tab slid
   * into that slot. The key is minted once and never reused, so it cannot.
   */
  const patchTabByKey = useCallback((i: PaneIndex, key: string, patch: Partial<TabState>) => {
    setPanes((prev) => {
      const pane = prev[i]
      const ti = pane.tabs.findIndex((t) => t.key === key)
      if (ti < 0) return prev
      const tabs = pane.tabs.slice()
      tabs[ti] = { ...tabs[ti], ...patch }
      const next = prev.slice() as [PaneState, PaneState]
      next[i] = { ...pane, tabs }
      return next
    })
  }, [])

  const patchTabAt = useCallback((i: PaneIndex, ti: number, patch: Partial<TabState>) => {
    setPanes((prev) => {
      const pane = prev[i]
      if (!pane.tabs[ti]) return prev
      const tabs = pane.tabs.slice()
      tabs[ti] = { ...tabs[ti], ...patch }
      const next = prev.slice() as [PaneState, PaneState]
      next[i] = { ...pane, tabs }
      return next
    })
  }, [])

  const patchTab = useCallback(
    (i: PaneIndex, patch: Partial<TabState>) => patchTabAt(i, panesRef.current[i].active, patch),
    [patchTabAt]
  )

  /**
   * Patches every tab holding one session, across both panes. The same chat can
   * be the active tab of one pane and a background tab of the other, and an
   * event delivered only to the active one leaves the other frozen mid-turn.
   */
  const patchSession = useCallback(
    (sessionId: string, patch: (t: TabState) => Partial<TabState>) => {
      setPanes((prev) => {
        let any = false
        const next = prev.map((pane) => {
          let hit = false
          const tabs = pane.tabs.map((t) => {
            if (t.kind !== 'chat' || t.id !== sessionId) return t
            hit = true
            any = true
            return { ...t, ...patch(t) }
          })
          return hit ? { ...pane, tabs } : pane
        }) as [PaneState, PaneState]
        return any ? next : prev
      })
    },
    []
  )

  /**
   * Drops a chat's process, but only once nothing is still showing it — the
   * same session can be open in both panes, and closing one tab must not
   * silence the other.
   */
  const dropSessions = useCallback((ids: string[], after: [PaneState, PaneState]) => {
    for (const id of ids) {
      const shown = after.some((pane) => pane.tabs.some((t) => t.kind === 'chat' && t.id === id))
      // A turn still being written has not finished with its process merely
      // because nobody is watching it. The whole point of leaving a path
      // running is that it keeps running.
      if (shown || away.current.has(id)) continue
      void window.lanes.close(id)
    }
    // A parked path belongs to a thread. When the last tab of that thread goes
    // — closed, or evicted by the six-tab cap — it goes with it: there is
    // nowhere left to come back to, and its transcript keeps everything it said.
    for (const [id] of away.current) {
      const kin = after.some((pane) =>
        pane.tabs.some((t) => t.kind === 'chat' && sameThread(t.id, id))
      )
      if (kin) continue
      away.current.delete(id)
      void window.lanes.close(id)
    }
    tellSeams()
  }, [sameThread, tellSeams])

  /** Session ids already named, or being named — one attempt per thread. */
  const naming = useRef(new Set<string>())
  /** The chat whose title is being edited in place, if any. */
  const [renaming, setRenaming] = useState<string | null>(null)

  /**
   * Patches every tab showing any PATH of one thread. What names a thread names
   * all of it — the family is one thread with one name — where the live stream
   * addresses exactly one session and must keep doing so.
   */
  const patchThread = useCallback(
    (id: string, patch: (t: TabState) => Partial<TabState>) => {
      setPanes((prev) => {
        let any = false
        const next = prev.map((pane) => {
          let hit = false
          const tabs = pane.tabs.map((t) => {
            if (t.kind !== 'chat' || !sameThread(t.id, id)) return t
            hit = true
            any = true
            return { ...t, ...patch(t) }
          })
          return hit ? { ...pane, tabs } : pane
        }) as [PaneState, PaneState]
        return any ? next : prev
      })
    },
    [sameThread]
  )

  /**
   * A manual rename is the same thing as a generated one — a titleOverride —
   * so it lands in the store the sidebar, the palette and the next launch all
   * already read, and it stops Haiku renaming it later because `nameThread`
   * only fires on a title still reading "New thread".
   *
   * Keyed by the thread rather than the session: one conversation has one name
   * however many paths it has been cut into, and renaming from a path has to
   * rename the thread rather than give that path a private name.
   */
  const renameChat = useCallback(
    (id: string, next: string) => {
      setRenaming(null)
      const title = next.trim()
      if (!title) return
      const root = rootOf(id)
      patchThread(root, () => ({ title, provisional: false }))
      naming.current.add(root)
      setState((prev) =>
        prev ? { ...prev, titleOverrides: { ...prev.titleOverrides, [root]: title } } : prev
      )
      void window.lanes.patchState({
        titleOverrides: { ...(stateRef.current?.titleOverrides ?? {}), [root]: title }
      })
    },
    [patchThread, rootOf]
  )

  /**
   * A thread arrives as "New thread" and, left alone, stays that way: the CLI's
   * own fallback is the first sixty characters of the opening prompt, which is
   * a sentence, not a name. Once a turn finishes, Haiku names it.
   *
   * What counts as unnamed is the THREAD not having a name of its own — no
   * title override, whether Haiku's or a rename by hand — rather than this tab
   * having been born unnamed. Those differ the moment anything interrupts the
   * first turn: a thread whose tab was closed, or that was still working when
   * the app was quit, comes back with `provisional: false` on every later open
   * and used to keep the CLI's opening-line fallback for good. Naming it on the
   * next turn it finishes is how those get their name at last.
   *
   * Best-effort by design — no key, no CLI, a refusal or a slow reply all just
   * leave the tab as it was.
   */
  const nameThread = useCallback(
    async (sessionId: string) => {
      // A thread is named once, under the id it is known by. The turn that
      // earns the name may well finish on a path rather than on the root —
      // after a fork that is where the conversation carries on — so gating on
      // the session would leave a forked thread unnamed for good.
      const root = rootOf(sessionId)
      if (naming.current.has(root)) return
      if (stateRef.current?.titleOverrides?.[root]) return
      /*
       * The CLI names its own threads and writes the name into the transcript.
       * When it has, there is nothing here to improve on and a second model
       * call to say the same thing again is waste — the effect that keeps a
       * tab's name in step with its thread brings that one to the tab. This is
       * the fallback for the threads the CLI never named: a first turn that was
       * interrupted, or quit through.
       */
      if (ownNames.current.has(root) || ownNames.current.has(sessionId)) return
      // The turn that earns a name can finish on a path nobody is looking at,
      // now that a path can be left running — so the conversation is looked for
      // wherever it actually is.
      const tab =
        panesRef.current.flatMap((p) => p.tabs).find((t) => t.kind === 'chat' && t.id === sessionId) ??
        away.current.get(sessionId)
      if (!tab) return
      // Named from the exchange that OPENED the thread, whichever turn we are
      // on now: a name is what the conversation is about, and that was settled
      // by its first question.
      const ask = tab.messages.find((m) => m.role === 'you')
      const reply = tab.messages.find((m) => m.role === 'claude')
      const said = reply ? saidBy(reply) : ''
      if (!ask?.text.trim() || !said) return
      /*
       * Held for the length of the call so two turns landing together cannot
       * both spend one, and RELEASED IF IT COMES BACK EMPTY. A refusal, a
       * timeout or a missing CLI used to mark the thread named-for-good in a
       * set nothing ever cleared, so a thread that failed to be named once
       * stayed unnamed until the app was relaunched.
       */
      naming.current.add(root)
      const title = await window.lanes.title(ask.text, said)
      if (!title) {
        naming.current.delete(root)
        return
      }
      patchThread(root, () => ({ title, provisional: false }))
      // Persisted too, so the sidebar and the next launch agree with the tab.
      setState((prev) =>
        prev ? { ...prev, titleOverrides: { ...prev.titleOverrides, [root]: title } } : prev
      )
      void window.lanes.patchState({
        titleOverrides: { ...(stateRef.current?.titleOverrides ?? {}), [root]: title }
      })
    },
    [patchThread, rootOf]
  )

  /** Patches carrying lanes that main has not answered yet. See `onLanes`. */
  const lanesOnTheWay = useRef(0)
  const patch = useCallback((p: Partial<AppState>) => {
    setState((prev) => (prev ? { ...prev, ...p } : prev))
    if (!('lanes' in p)) {
      void window.lanes.patchState(p)
      return
    }
    lanesOnTheWay.current += 1
    void window.lanes.patchState(p).finally(() => {
      lanesOnTheWay.current -= 1
    })
  }, [])

  /**
   * The split, while it is being dragged. Every frame moves the panes; only the
   * release goes to disk. A `patch` per pointer move put an IPC round trip
   * behind every pixel of a resize, which the state file does not need to hear
   * about until the drag is over.
   */
  const setRatio = useCallback((splitRatio: number, done: boolean) => {
    setState((prev) => (prev ? { ...prev, splitRatio } : prev))
    if (done) void window.lanes.patchState({ splitRatio })
  }, [])


  stateRef.current = state
  rootsRef.current = threadRoots
  ownNames.current = threadNames

  const settingsFor = useCallback(
    (id: string | null): { model: string; effort: EffortId } =>
      (state?.threadSettings ?? {})[id ?? ''] ?? {
        model: state?.defaultModel ?? 'sonnet',
        effort: state?.defaultEffort ?? 'mid'
      },
    [state]
  )

  /**
   * Everything the transport needs for one chat: the thread's own model and
   * effort over the app-wide safety mode and tool restrictions. Built in one
   * place — `startOptions`, shared with a saved prompt's run and with main's
   * scheduler — so a setting cannot reach `send` but miss `configure`, or a run.
   */
  const optionsFor = useCallback(
    (id: string | null, over?: Partial<StartOptions>): StartOptions =>
      startOptions(state, settingsFor(id), { sessionId: id ?? undefined, ...over }),
    [settingsFor, state]
  )

  /* ---------- opening things into tabs ---------- */

  /**
   * What a tab shows, fetched. Everything transient is reset with it: a
   * composer draft belongs to the chat it was typed at, and following it into
   * a replacement would put it in front of the wrong reader.
   */
  const tabContent = useCallback(
    async (kind: TabKind, id: string): Promise<Partial<TabState> | null> => {
      const blank = {
        id,
        fresh: false,
        // Whatever this is, its title came from the transcript or the vault.
        provisional: false,
        pending: null,
        error: null,
        ask: null,
        quote: null,
        composer: '',
        messages: [],
        seams: [],
        context: null
      }
      if (kind === 'chat') {
        const snapshot = await window.lanes.thread(id)
        /*
         * OUR NAME WINS. A title override is what a rename writes and what the
         * namer writes, and it is the answer to "what is this thread called" —
         * the transcript's own title is the CLI's first-line fallback until
         * something better exists.
         *
         * Without this, every path that builds a tab from the transcript threw
         * the name away: reopening a renamed thread, or merely landing on a
         * restored tab, which hydrates through here. The rail kept the name and
         * the tab lost it, so the two disagreed about the same thread — and a
         * name Haiku had just chosen vanished on the next tab switch.
         */
        // Under the thread's own id, not the path's: one conversation, one
        // name, whichever of its paths is on screen.
        const named = stateRef.current?.titleOverrides?.[rootOf(id)]
        /*
         * A path left mid-answer was kept exactly as its pane had it, so coming
         * back is not a re-read: take what you would have been looking at. The
         * transcript is behind by whatever the turn has written since, and it
         * cannot say which half-written answer on disk is the one still
         * arriving — so it is not asked.
         */
        const parked = away.current.get(id)
        if (parked) {
          away.current.delete(id)
          tellSeams()
          const { title, started, ...rest } = parked
          return { ...blank, kind: 'chat', title: named ?? title, started, ...rest }
        }
        return {
          ...blank,
          kind: 'chat',
          title: named ?? snapshot?.title ?? 'New thread',
          started: snapshot?.started ?? Date.now(),
          messages: snapshot?.messages ?? [],
          seams: snapshot?.seams ?? [],
          context: snapshot?.context ?? null
        }
      }
      const n = await window.lanes.note(id)
      if (!n) return null
      /*
       * WORDS ON THEIR WAY TO THE FILE ARE NEWER THAN THE FILE. Close a note
       * mid-sentence and open it again a moment later — ⇧⌘T, its row, ⌘[ back
       * to it — and its last words are still owed: waiting on the save's timer,
       * or in the write itself. The read comes back without them. Taken, it put
       * the note on screen as it was before them, out of the editor's history;
       * the save then landed where nothing showed it, and the next keystroke
       * saved the old text straight back over it. So whatever is still owed
       * stands in for the body, and the file's mtime is left for that write to
       * record — it is the one that moves it.
       */
      const owed = saves.current.get(id) ?? writing.current.get(id)
      /*
       * And keystrokes still in the note pane — typed into this very note and
       * not handed over yet. The note is on screen, so what the app last had
       * stands, and the mtime stays where it was: moved on to this read, it
       * would call a change from outside that nobody has seen yet "seen", and
       * the next save would go over it without a banner.
       */
      const typing = !owed && editingNote.current && watched.current === id
      const cached = noteCacheRef.current[id]
      if (!owed && !typing) mtimes.current.set(id, n.edited)
      const took = owed
        ? { ...n, body: owed.body, title: cached?.title ?? n.title }
        : typing && cached
          ? { ...n, body: cached.body, title: cached.title }
          : n
      setNoteCache((prev) => ({ ...prev, [id]: took }))
      return { ...blank, kind: 'note', title: took.title, started: n.created }
    },
    [rootOf, tellSeams]
  )

  /**
   * The one way anything opens — sidebar click, wikilink, search hit, note row,
   * `+`. `newTab` is the ⌘-click rule: false replaces the active tab in place
   * and continues its history, true appends a tab of its own.
   */
  /**
   * Where every open lands.
   *
   * The caller's pane argument is advisory and DELIBERATELY IGNORED: panes are
   * role-assigned, so the target follows the kind of the thing being opened.
   * Every caller — rail rows, palette results, wikilinks, backlinks, the empty
   * state's own rows — goes through here, which is why "open" never has to be
   * aimed and a note can never appear where a thread was.
   *
   * Opening a note also forces the split on, because a note has nowhere to go
   * in a single pane.
   */
  const openIn = useCallback(
    async (
      _advisory: PaneIndex,
      kind: TabKind,
      id: string,
      opts?: { newTab?: boolean; from?: AppState; fresh?: boolean }
    ) => {
      const target = paneFor(kind)
      /*
       * A thread is LISTED under its root and READ on the path you were last
       * on, and almost every list hands over the root: the palette, the empty
       * pane's rows, a note's chats, a rail row's menu, a dropped row. Resolved
       * here rather than at each of them, because getting it wrong is not a
       * cosmetic miss — `placeTab` would find the family's tab, replace it with
       * the root in place, and report the path it left as closed, which reaps a
       * live process and takes the draft in the composer with it.
       */
      const at = kind === 'chat' ? pathOf(id) : id
      /*
       * A path of this family may be answering in the tab this is about to
       * replace. It is not stopped and it is not lost: parked, so it keeps its
       * process and its page, and hands both back when you return to it.
       */
      if (kind === 'chat') {
        const busy = panesRef.current[paneFor(kind)].tabs.find(
          (t) => t.kind === 'chat' && t.id !== at && (t.pending || t.ask) && sameThread(t.id, at)
        )
        if (busy) {
        away.current.set(busy.id, {
          title: busy.title,
          started: busy.started,
          messages: busy.messages,
          seams: busy.seams,
          pending: busy.pending,
          ask: busy.ask,
          error: busy.error,
          context: busy.context
        })
        tellSeams()
        }
      }
      const content = await tabContent(kind, at)
      if (!content) return
      // A note made a moment ago is marked fresh HERE, in the same batch as the
      // tab that shows it — marking it before the read cost a whole render of
      // the window before the note existed on screen.
      setFreshNote((cur) => (kind === 'note' && (opts?.fresh || at === cur) ? at : null))
      // A note opens in READ — except one made a moment ago, which is there to
      // be written in: it opens in WRITE with the caret ready.
      if (kind === 'note' && opts?.fresh) setWriting(at, true)
      setFreshChat((cur) => (kind === 'chat' && at === cur?.id ? cur : null))
      // A note has nowhere to go in a single pane, so opening one opens the
      // split. Idempotent, and cheaper than reading the current value.
      if (kind === 'note') setSplit(true)
      setFocus(target)

      const { pane, closed } = placeTab(
        panesRef.current[target],
        kind,
        at,
        opts?.newTab ?? false,
        () => ({ ...emptyTab(), ...content }) as TabState,
        sameThread
      )
      const tabs = pane.tabs.slice()
      tabs[pane.active] = {
        ...tabs[pane.active],
        hist: pushHistory(tabs[pane.active].hist, {
          kind,
          id: at,
          title: content.title ?? at
        })
      }
      const placed = { ...pane, tabs }

      setPanes((prev) => {
        const next = prev.slice() as [PaneState, PaneState]
        next[target] = placed
        dropSessions(closed, next)
        return next
      })

      if (kind !== 'chat') return
      const base = opts?.from ?? state
      if (base) {
        // Remembered as the thread, not the path: a trail that listed three
        // paths of one conversation as three separate visits would push
        // everything else out of a list meant to say where you have been.
        const seen = rootOf(id)
        const visited = [seen, ...base.visited.filter((v) => v !== seen)].slice(0, 50)
        if (opts?.from) setState({ ...opts.from, visited })
        patch({ visited })
      }
    },
    [tabContent, dropSessions, patch, state, sameThread, rootOf, pathOf, tellSeams, setWriting]
  )

  /** The common case, kept short because most callers only ever open a chat. */
  const openThread = useCallback(
    (id: string, target: PaneIndex, opts?: { newTab?: boolean; from?: AppState }) =>
      openIn(target, 'chat', id, opts),
    [openIn]
  )

  /**
   * "Edits save as you type", debounced — a write per keystroke would hammer
   * the Dropbox mount for no benefit.
   */
  /**
   * What each note said before each change made in this app, so ⌘Z can put it
   * back. Per note path, in memory, and bounded: this is the session's editing
   * history rather than a document format, and a note edited elsewhere between
   * launches has a past this app never saw.
   */
  const noteHist = useRef<Record<string, { past: string[]; future: string[] }>>({})
  const HIST_DEPTH = 80
  /** And no more than this much text held for it, per note. */
  const HIST_BYTES = 24_000_000

  /**
   * Writes a note. `remember` is what separates an edit from an undo: an edit
   * pushes what the note said onto the past and forks the timeline, an undo is
   * already moving through that history and must not record itself as a step.
   */
  const putNote = useCallback((typedAt: string, body: string, remember: boolean) => {
    let path = typedAt
    for (let i = 0; i < 8 && movedTo.current.has(path); i += 1) path = movedTo.current.get(path) ?? path
    if (remember) {
      const before = noteCacheRef.current[path]?.body
      if (before !== undefined && before !== body) {
        const h = (noteHist.current[path] ??= { past: [], future: [] })
        h.past = [...h.past, before].slice(-HIST_DEPTH)
        // Bounded by size as well as by count. Every step is the whole note,
        // and eighty copies of a note a few MB long is a quarter of a
        // gigabyte held for an undo the editor's own history already gives.
        let bytes = 0
        for (let i = h.past.length - 1; i >= 0; i -= 1) {
          bytes += h.past[i].length
          if (bytes > HIST_BYTES) {
            h.past = h.past.slice(i + 1)
            break
          }
        }
        h.future = []
      }
    }
    dirtyRef.current = true
    /*
     * The title follows the `# ` line AS YOU TYPE IT — main reads it the same
     * way — so the tab and the rail name the note by what it is called now,
     * not by what it was called when it was opened.
     */
    const was = noteCacheRef.current[path]
    // Main's rule exactly: the first `#` line decides, and an EMPTY one — a
    // note not named yet — falls back to the filename. `\s` would run on past
    // the end of `# ` and take the first line of the body for a title.
    const h1 = /^#(?:[^\S\n]+(.*))?$/m.exec(body)?.[1]?.trim()
    // A note nobody named is called by its first line of writing — main's rule,
    // shared, so the tab and the rail agree with the index as you type.
    const title =
      h1 ||
      (UNTITLED.test(path)
        ? firstWords(body) || 'Untitled'
        : (path.split('/').pop() ?? path).replace(/\.md$/, '').replace(/[-_]/g, ' '))
    setNoteCache((prev) => (prev[path] ? { ...prev, [path]: { ...prev[path], body, title } } : prev))
    if (was && was.title !== title) {
      setPanes(
        (prev) =>
          prev.map((pane) => ({
            ...pane,
            tabs: pane.tabs.map((t) => (t.kind === 'note' && t.id === path ? { ...t, title } : t))
          })) as [PaneState, PaneState]
      )
      setAllNotes((prev) => prev.map((n) => (n.path === path ? { ...n, title } : n)))
    }
    const held = saves.current.get(path)
    if (held?.timer) clearTimeout(held.timer)
    // Held while the note is in conflict: the person is choosing which version
    // stands, and writing on a timer would choose for them.
    if (conflictRef.current.has(path)) {
      saves.current.set(path, { body, timer: null, since: held?.since ?? Date.now() })
      return
    }
    /*
     * A pause of half a second, but never more than three from the first
     * unsaved keystroke. A pure debounce never fires while you keep typing, and
     * a long stretch of writing would sit in memory until you stopped.
     */
    const since = held?.since ?? Date.now()
    const wait = Math.max(0, Math.min(500, since + 3000 - Date.now()))
    saves.current.set(path, { body, since, timer: setTimeout(() => void flushSave(path), wait) })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /*
   * THE LAST WORDS BEFORE THE WINDOW GOES. Typing reaches the disk on timers —
   * the editor's, the pane's, this one's — and quitting, or closing the window,
   * tears all three down with the renderer. Up to a second of writing went with
   * them. So on the way out every note pane settles what it holds (synchronous
   * event, handled before this continues), and every note still owed a write
   * gets it synchronously, before the page is allowed to go.
   */
  useEffect(() => {
    const leave = (): void => {
      window.dispatchEvent(new Event('lanes:settle'))
      for (const [path, held] of saves.current) {
        if (held.timer) clearTimeout(held.timer)
        // A note still in conflict is not written over the version that caused
        // it, and not dropped either: what was on screen goes to a copy beside
        // it, the way Dropbox keeps both when two machines disagree.
        const conflicted = conflictRef.current.has(path)
        const to = conflicted ? path.replace(/\.md$/, ' (conflicted copy).md') : path
        // With the mtime it was last seen at: a change nobody has seen yet —
        // Claude's, since the last poll — is kept, and these words go beside it.
        // `pending`: a save of it still on its way back, whose mtime main has and
        // the app does not yet.
        window.lanes.noteWriteSync(to, held.body, conflicted ? undefined : mtimes.current.get(path), writing.current.has(path))
      }
      saves.current.clear()
      dirtyRef.current = false
    }
    window.addEventListener('beforeunload', leave)
    return () => window.removeEventListener('beforeunload', leave)
  }, [])

  /** Notes being renamed or moved right now: their saves wait for the new path (see `flushSave`). */
  const relocating = useRef(new Set<string>())
  /** Each note's write on its way, so the next one waits for it rather than racing it. */
  const flights = useRef(new Map<string, Promise<void>>())
  /** Where a note is now, through the renames and moves the app has heard of. */
  const followPath = (path: string): string => {
    let at = path
    for (let i = 0; i < 8 && movedTo.current.has(at); i += 1) at = movedTo.current.get(at) ?? at
    return at
  }

  /**
   * Write what a note is owed now, rather than when its timer runs out.
   *
   * ONE WRITE OF A NOTE AT A TIME. A write sent while the note's last one was
   * still on its way carried the mtime from before that one, and main — seeing
   * the file had moved on since — refused it as a conflict: the app's own save
   * taken for somebody else's, a banner, and every save after it held. So a
   * write waits for the one before it, and goes with the mtime that one left.
   *
   * And NOT WHILE THE NOTE IS MOVING. A save sent while a rename was on its way
   * went to where the note had been — main made the file again there, a stray
   * copy with the first sentences in it, while the renamed note went on without
   * them. Held instead, it is handed to the new path when the rename lands (see
   * `notePathChanged`), or sent where it was going if the rename does not.
   *
   * Nor while the note is in conflict, unless it is "Keep mine" choosing:
   * writing then would choose for the person.
   */
  const flushSave = useCallback((path: string, force = false): Promise<void> => {
    const now = async (): Promise<void> => {
      const held = saves.current.get(path)
      if (!held) return
      if (held.timer) clearTimeout(held.timer)
      if (relocating.current.has(path) || (conflictRef.current.has(path) && !force)) {
        saves.current.set(path, { ...held, timer: null })
        return
      }
      saves.current.delete(path)
      writing.current.set(path, held)
      const r = await window.lanes
        .noteWrite(path, held.body, force ? undefined : mtimes.current.get(path))
        .catch((err: unknown) => ({ ok: false as const, reason: String(err), edited: undefined, path: undefined }))
      // Only this write's own mark: a newer write of the note can have gone out
      // behind it while it was on its way, and that one is still in flight.
      if (writing.current.get(path) === held) writing.current.delete(path)
      // Where the note is now: it may have been renamed while this was on its
      // way, and main then wrote it there (see `movedAway` in main).
      const at = followPath(r.path ?? path)
      // A newer body queued while this one was in flight is the one that counts;
      // an older one is never put back over it.
      const again = (entry: { body: string; since: number; timer: ReturnType<typeof setTimeout> | null }): void => {
        if (!saves.current.has(at)) saves.current.set(at, entry)
      }
      if (r.ok) {
        if (r.edited) mtimes.current.set(at, r.edited)
        // Main wrote other words than these: a rename's rewrite of a link or a
        // heading, made again in words sent from before it (`rewrites` in
        // main). Taken up as a change from outside is, once nothing newer is
        // on its way — the editor holding words of its own passes it by, and
        // main makes the same rewrite in those.
        if (r.merged !== undefined && !saves.current.has(at) && !writing.current.has(at)) {
          const merged = r.merged
          setNoteCache((prev) => (prev[at] ? { ...prev, [at]: { ...prev[at], body: merged } } : prev))
        }
        setSaveTrouble((was) => {
          if (!(path in was)) return was
          const { [path]: _gone, ...rest } = was
          return rest
        })
      } else if (r.reason === 'conflict') {
        // Refused, not failed: the file moved on under this write. Held, untimed,
        // until the person chooses which version stands.
        again({ body: held.body, since: held.since, timer: null })
        markConflict(at)
      } else {
        again({ body: held.body, since: Date.now(), timer: setTimeout(() => void flushSave(at), 2000) })
        setSaveTrouble((was) => ({ ...was, [at]: 'not saved yet — trying again' }))
      }
      dirtyRef.current = saves.current.size > 0
    }
    const run = (flights.current.get(path) ?? Promise.resolve()).then(now)
    flights.current.set(path, run)
    void run.finally(() => {
      if (flights.current.get(path) === run) flights.current.delete(path)
    })
    return run
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const saveNote = useCallback(
    (path: string, body: string) => putNote(path, body, true),
    [putNote]
  )

  /**
   * ⌘Z and ⇧⌘Z on the note you are looking at. Returns false when there is
   * nothing to step to, so the keymap can leave the event alone rather than
   * swallowing it into nothing.
   */
  const stepNote = useCallback(
    (redo: boolean): boolean => {
      const t = activeTab(panesRef.current[focus])
      if (!t || t.kind !== 'note') return false
      const h = noteHist.current[t.id]
      if (!h) return false
      const from = redo ? h.future : h.past
      const to = redo ? h.past : h.future
      const body = from[from.length - 1]
      if (body === undefined) return false
      const now = noteCacheRef.current[t.id]?.body
      if (now === undefined) return false
      from.pop()
      to.push(now)
      putNote(t.id, body, false)
      return true
    },
    [focus, putNote]
  )

  /** The pane you are looking at — the focused one of two, or the only one. */
  const targetPane = useCallback((): PaneIndex => focus, [focus])

  /**
   * Take the version on disk and drop the local edits. Shared by the pane's
   * conflict banner and anything else showing the note, so the two cannot come
   * what "reload" does.
   */
  const reloadNote = useCallback((path: string) => {
    const held = saves.current.get(path)
    if (held) {
      if (held.timer) clearTimeout(held.timer)
      saves.current.delete(path)
    }
    dirtyRef.current = saves.current.size > 0
    clearConflict(path)
    void window.lanes.note(path).then((fresh) => {
      if (!fresh) return
      mtimes.current.set(fresh.path, fresh.edited)
      setNoteCache((prev) => ({ ...prev, [fresh.path]: fresh }))
    })
  }, [])

  /**
   * The other answer to a conflict: what is on screen stands, and goes over
   * whatever changed on disk. Everything the pane still holds is handed over
   * first, so what is written is what you see.
   */
  const keepMine = useCallback(
    (path: string) => {
      clearConflict(path)
      window.dispatchEvent(new Event('lanes:settle'))
      void flushSave(path, true)
    },
    [flushSave]
  )

  /**
   * Makes a note and opens it. Shared by the navigator's field and the top
   * bar's menu — two places that ask for the same thing, and would otherwise
   * be two chances to disagree about where it lands.
   */
  const createNote = useCallback(
    async (name: string, into: string): Promise<string | null> => {
      const res = await window.lanes.noteCreate(name, into)
      if (!res.ok || !res.path) return res.reason ?? 'could not create it'
      freshPath(res.path)
      // A blank tab is a question — "which note?" — so a note made from one is
      // its answer and takes its place, rather than leaving the question open
      // in the strip beside it.
      const onBlank = isBlank(activeTab(panesRef.current[1]))
      await openIn(targetPane(), 'note', res.path, { newTab: !onBlank, fresh: true })
      // AFTER it is open, never before, and at low priority. The list is for
      // the rail; awaiting it first made every new note wait on it — and it
      // used to mean a rebuild of the whole vault's index before the note
      // could appear.
      void window.lanes.notesList().then((n) => startTransition(() => setAllNotes(n)))
      return null
    },
    [openIn, targetPane]
  )

  /**
   * A NOTE, NOW — with no name asked for.
   *
   * ⌘N is for a thought you want down before it goes, and "what shall we call
   * it" is the question that loses it. So the note is made at once as
   * `untitled.md` (then `-2`, `-3`…), opened with the caret in its title, and
   * named by what you type there — or not at all: ↵ with nothing typed goes
   * straight to the words. The file takes the title as its name when the
   * title is settled. See `commitNoteTitle`.
   *
   * The caret leaves where it was on the keystroke, not when the note lands.
   * Until the note was on screen the caret stayed in whatever you left — the
   * note you were writing, as often as not — and the letters typed straight
   * after ⌘N went into that one and were saved there. They are held instead,
   * and typed into the new note's title once it takes the caret. See
   * `lib/typeAhead.ts`.
   */
  const makeUntitled = useCallback(async (): Promise<void> => {
    const typed = holdTyping()
    const res = await window.lanes.noteCreateUntitled(newNoteHome(stateRef.current))
    if (!res.ok || !res.path) {
      giveTypingBack(typed)
      return
    }
    freshPath(res.path)
    const onBlank = isBlank(activeTab(panesRef.current[1]))
    await openIn(targetPane(), 'note', res.path, { newTab: !onBlank, fresh: true })
    void window.lanes.notesList().then((n) => startTransition(() => setAllNotes(n)))
  }, [openIn, targetPane])

  /**
   * A note's path changed under us — renamed, or moved. Everything that names
   * it by path has to follow: the tabs showing it, the note cache, the marks,
   * the attachments and the overrides. A note is its path here, so a move is a
   * rename of the one thing every other structure keys on.
   */
  const notePathChanged = useCallback((from: string, to: string, edited?: number) => {
    if (from === to) return
    movedTo.current.set(from, to)
    // The new path is a live note now: nothing addressed to it is to be sent
    // on anywhere else, whatever an earlier move once left pointing from it.
    movedTo.current.delete(to)
    // The mtime the move left the file with — a rename writes the heading, and
    // moves it — or, from a main that does not say, the one it had before.
    const known = edited ?? mtimes.current.get(from)
    if (known !== undefined) mtimes.current.set(to, known)
    if (conflictRef.current.has(from)) {
      clearConflict(from)
      markConflict(to)
    }
    noteIds.current.set(to, noteIds.current.get(from) ?? from)
    // The old path gets an identity of its own, never this note's: whatever
    // appears there next — made here, or written by Claude — is a different
    // note and must not be handed this one's editor.
    noteIds.current.set(from, `${from}\u0000moved${Date.now()}`)
    // The redirect is for saves already on their way, which are sub-second. It
    // is not a standing alias: the old path belongs to whatever is made there
    // next, and `freshPath` clears it the moment that happens.
    setTimeout(() => {
      if (movedTo.current.get(from) === to) movedTo.current.delete(from)
    }, 15000)
    // A write still owed under the old path goes to the new one.
    const owedHere = saves.current.get(from)
    if (owedHere) {
      saves.current.delete(from)
      if (owedHere.timer) clearTimeout(owedHere.timer)
      saves.current.set(to, {
        body: owedHere.body,
        since: owedHere.since,
        timer: conflictRef.current.has(to) ? null : setTimeout(() => void flushSave(to), 500)
      })
    }
    setPanes((prev) => {
      const next = prev.map((pane) => ({
        ...pane,
        tabs: pane.tabs.map((t) => (t.kind === 'note' && t.id === from ? { ...t, id: to } : t))
      })) as [PaneState, PaneState]
      return next
    })
    setNoteCache((prev) => {
      const held = prev[from]
      if (!held) return prev
      const { [from]: _gone, ...rest } = prev
      return { ...rest, [to]: { ...held, path: to } }
    })
    /*
     * And then the note itself, read back from where it now is. The id swap
     * above is instant and enough to keep the tab pointing at a real file, but
     * a note's TITLE and FOLDER are facts about its new path — the tab strip
     * and the head both state them, and both would otherwise go on saying what
     * the note used to be called and where it used to live.
     */
    void window.lanes.note(to).then((fresh) => {
      if (!fresh) return
      /*
       * The body from disk carries what the move itself wrote — a renamed
       * note's new heading — so it is taken, EXCEPT when words typed here are
       * still on their way to disk: naming an untitled note happens while you
       * are already writing its first line, and the file read back is then a
       * keystroke or two behind the page.
       */
      const ahead = saves.current.has(to) || writing.current.has(to) || editingNote.current
      setNoteCache((prev) => ({
        ...prev,
        [to]: ahead && prev[to] ? { ...fresh, body: prev[to].body, title: prev[to].title } : fresh
      }))
      mtimes.current.set(to, fresh.edited)
      setPanes(
        (prev) =>
          prev.map((pane) => ({
            ...pane,
            tabs: pane.tabs.map((t) =>
              t.kind === 'note' && t.id === to ? { ...t, title: fresh.title } : t
            )
          })) as [PaneState, PaneState]
      )
    })
    setState((prev) => {
      if (!prev) return prev
      const marks = prev.marks.map((m) => (m === from ? to : m))
      const attachments = Object.fromEntries(
        Object.entries(prev.attachments).map(([k, v]) => [k, v === from ? to : v])
      )
      const patched = { marks, attachments }
      void window.lanes.patchState(patched)
      return { ...prev, ...patched }
    })
    void window.lanes.notesList().then(setAllNotes)
    setIndexVersion((v) => v + 1)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /**
   * A title settled in the head of an UNTITLED note: the file takes it as its
   * name. Everything typed so far goes to disk first — the rename moves the
   * file, and a save still in flight would otherwise arrive after it.
   *
   * Only for `untitled.md` and its numbered siblings. A note that already has a
   * name keeps its filename when its title is edited, exactly as editing the
   * `# ` line always has; renaming one is the tab's Rename, which says so.
   */
  /**
   * The notes a rename rewrote the links in, read again — the ones on screen or
   * kept, and only those with nothing of their own on its way: a word typed
   * into one is sent as it stands, and main makes the same rewrite in it
   * (`rewrites` in main), handing back what it wrote. Left alone, an open note
   * went on saying `[[alpha]]` over a file that says `[[beta]]`, and its next
   * save raised a conflict with nobody but the app on the other side.
   */
  const refreshRelinked = (paths: string[] | undefined): void => {
    for (const p of paths ?? []) {
      if (!noteCacheRef.current[p] || saves.current.has(p) || writing.current.has(p)) continue
      void window.lanes.note(p).then((fresh) => {
        if (!fresh || saves.current.has(p) || writing.current.has(p)) return
        flushSync(() => setNoteCache((prev) => (prev[p] ? { ...prev, [p]: fresh } : prev)))
        mtimes.current.set(p, fresh.edited)
      })
    }
  }

  const commitNoteTitle = useCallback(
    async (path: string, text: string): Promise<void> => {
      const name = text.trim()
      if (!name || !/(^|\/)untitled(-\d+)?\.md$/.test(path) || titling.current.has(path)) return
      // Not while the note is in conflict: the rename writes its heading over a
      // file that has moved on, and the held words would follow it there.
      if (conflictRef.current.has(path)) return
      titling.current.add(path)
      try {
        await flushSave(path)
        if (conflictRef.current.has(path)) return
        relocating.current.add(path)
        const res = await window.lanes.noteRename(path, name, true)
        if (res.ok && res.path) notePathChanged(path, res.path, res.edited)
        if (res.ok) refreshRelinked(res.relinkedPaths)
      } finally {
        titling.current.delete(path)
        relocating.current.delete(path)
        // A rename that did not happen: what was held for it goes where it was going.
        if (saves.current.has(path)) void flushSave(path)
      }
    },
    [flushSave, notePathChanged]
  )

  /*
   * Before a note moves, everything typed into it goes to disk. A rename
   * rewrites the note's heading ON DISK; a save still owed from before it, sent
   * after it, would carry the old heading — and put it back. So the pane hands
   * over what it holds (the same synchronous settle the window uses on its way
   * out), the note's write goes now, and only then is the file moved.
   */
  const settleNote = useCallback(
    async (path: string): Promise<void> => {
      window.dispatchEvent(new Event('lanes:settle'))
      await flushSave(path)
    },
    [flushSave]
  )

  /**
   * A rename or a move, with the note held still around it: settled to disk
   * first, refused while it is in conflict — the move writes over a file that
   * has moved on, and the held words would follow it there — and its saves held
   * while the move is on its way, so none of them goes to where it was.
   */
  const relocateNote = useCallback(
    async (
      path: string,
      move: () => Promise<{ ok: boolean; path?: string; reason?: string; relinked?: number; relinkedPaths?: string[]; edited?: number }>
    ): Promise<{ ok: boolean; path?: string; reason?: string; relinked?: number; relinkedPaths?: string[]; edited?: number }> => {
      const busy = { ok: false, reason: 'this note changed on disk — choose which version stands first' }
      if (conflictRef.current.has(path)) return busy
      await settleNote(path)
      if (conflictRef.current.has(path)) return busy
      relocating.current.add(path)
      try {
        const res = await move()
        if (res.ok && res.path) notePathChanged(path, res.path, res.edited)
        if (res.ok) refreshRelinked(res.relinkedPaths)
        return res
      } finally {
        relocating.current.delete(path)
        if (saves.current.has(path)) void flushSave(path)
      }
    },
    [flushSave, notePathChanged, settleNote]
  )

  const renameNoteTo = useCallback(
    (path: string, name: string) => relocateNote(path, () => window.lanes.noteRename(path, name)),
    [relocateNote]
  )

  const moveNoteTo = useCallback(
    (path: string, folder: string) => relocateNote(path, () => window.lanes.noteMove(path, folder)),
    [relocateNote]
  )

  /**
   * To the system Trash, and the tabs showing it close. Recoverable in the
   * Finder, which is why this is a menu item and not a modal: the app's own
   * confirmation would be asking about something macOS can already undo.
   */
  const trashNoteAt = useCallback(
    async (path: string) => {
      // What is owed to the note goes with it. Left on its timer, the save
      // fired after the trash, found no file and made it again — the note you
      // had just thrown away, back. Put back if the trash does not happen.
      // Settled first: words still held by the editor and the pane come to the
      // app now, to be dropped with the rest — left there, they were handed
      // over when the tab closed, after the trash, and saved.
      window.dispatchEvent(new Event('lanes:settle'))
      const owedHere = saves.current.get(path)
      if (owedHere?.timer) clearTimeout(owedHere.timer)
      saves.current.delete(path)
      const res = await window.lanes.noteTrash(path)
      if (!res.ok) {
        if (owedHere) saves.current.set(path, { ...owedHere, timer: setTimeout(() => void flushSave(path), 500) })
        return res
      }
      clearConflict(path)
      dirtyRef.current = saves.current.size > 0
      setPanes((prev) => {
        const next = prev.map((pane) => {
          const tabs = pane.tabs.filter((t) => !(t.kind === 'note' && t.id === path))
          return {
            tabs,
            active: Math.max(0, Math.min(pane.active, tabs.length - 1))
          }
        }) as [PaneState, PaneState]
        return next
      })
      setNoteCache((prev) => {
        const { [path]: _gone, ...rest } = prev
        return rest
      })
      setState((prev) =>
        prev ? { ...prev, marks: prev.marks.filter((m) => m !== path) } : prev
      )
      void window.lanes.notesList().then(setAllNotes)
      setIndexVersion((v) => v + 1)
      return res
    },
    [flushSave]
  )

  /**
   * Fork a chat at a message, and optionally ask it again.
   *
   * The page FOLDS. A session is its transcript, so the fork is still a
   * truncated copy under a new id — nothing is edited, nothing is lost, and the
   * conversation it was cut from is untouched — but the copy is a path of this
   * thread rather than a thread of its own, so it opens in the tab you are
   * already in. Everything below the cut slides away: it belongs to the other
   * path now, and the seam at the foot of the page says so and takes you back.
   *
   * No new tab, no `Fork · ` name, no second row in the rail. One conversation
   * that happens to have gone two ways is one thread, and the strip is for the
   * things you are holding open, not for the shape of any one of them.
   */
  const branchFrom = useCallback(
    async (i: PaneIndex, atMessage: number, mode: 'fork' | 'edit' | 'again') => {
      const pane = panesRef.current[i]
      const ti = pane.active
      const from = pane.tabs[ti]
      if (!from || from.kind !== 'chat') return
      // What this side believes sits there, so main can refuse an index that
      // has come to mean a different turn than the one under the click.
      const m = from.messages[atMessage]
      const expect = m
        ? { role: m.role, preview: m.text.slice(0, 60), total: from.messages.length }
        : undefined
      // A fork keeps the answer it was taken under. An edit drops the question,
      // which is what leaves it unasked so it can be put differently — and a
      // resend cuts in exactly the same place, for exactly the same reason. The
      // difference between those two is only what happens to the words next.
      const res = await window.lanes.fork(from.id, atMessage, mode === 'fork', expect)
      if (!res.ok) {
        patchTab(i, { error: FORK_REFUSED[res.reason] })
        return
      }
      const id = res.at.id

      // Main has already written the kinship, and everything the new path
      // inherits from the one it was cut out of, so those maps come back from
      // there rather than being rebuilt here. Only the ones it touched are
      // taken: swapping the whole state in would undo anything this side set in
      // the milliseconds the fork was in flight.
      setState((prev) =>
        prev
          ? {
              ...prev,
              pathways: res.state.pathways,
              pathwayActive: res.state.pathwayActive,
              threadSettings: res.state.threadSettings,
              attachments: res.state.attachments,
              laneOverrides: res.state.laneOverrides
            }
          : prev
      )

      // Read from what main just returned, not from `stateRef`: that is only
      // reassigned on the next render, so it still has the kinship this fork
      // created missing — and the path would come up wearing the transcript's
      // own first-line fallback instead of the thread's name.
      const root = familyRoot(res.state.pathways, id)
      const title = res.state.titleOverrides[root] ?? from.title

      /*
       * THE WHOLE TURN, not just its text: what you typed, the images that went
       * with it, and the note you were quoting. The re-send that once lived
       * here took only the words and dropped the rest without saying so, which
       * is what made it worth replacing — so both verbs that reach for a turn
       * again now read it from one place.
       */
      const turn = m
        ? {
            text: m.source ?? m.text,
            images: m.blocks
              .filter((b): b is ImageBlock => b.kind === 'image')
              .map((b) => ({ mediaType: b.mediaType, data: b.data, name: b.name })),
            quote: (() => {
              const q = m.blocks.find((b) => b.kind === 'quote')
              return q ? { label: q.label, text: q.text } : null
            })()
          }
        : null

      /*
       * An edit hands your words back rather than sending them for you: the
       * point of asking DIFFERENTLY is to change them first, so they land in
       * the composer unsent.
       *
       * A resend is the other half of that, and takes the other branch on
       * purpose. Its words are already what you meant, so they go as they are —
       * and whatever draft was in the composer is left exactly where it was,
       * because resending an old turn is not a reason to throw away a new one.
       */
      const again =
        mode === 'edit' && turn
          ? { composer: turn.text, images: turn.images, quote: turn.quote }
          : { composer: from.composer, images: from.images, quote: from.quote }

      const content = await tabContent('chat', id)
      if (!content) return
      setPanes((prev) => {
        const next = prev.slice() as [PaneState, PaneState]
        const tabs = next[i].tabs.slice()
        if (!tabs[ti]) return prev
        tabs[ti] = {
          ...tabs[ti],
          ...content,
          ...again,
          title,
          provisional: false,
          hydrated: true,
          hist: pushHistory(tabs[ti].hist, { kind: 'chat', id, title })
        }
        next[i] = { ...next[i], tabs }
        // The path we cut from is no longer on screen anywhere, so its process
        // has nothing left to talk to. The seam resumes it if you go back.
        dropSessions([from.id], next)
        return next
      })
      setFocus(i)
      // The composer takes the caret, the same way a new thread's does — the
      // words are already in it and waiting to be changed.
      if (mode === 'edit') setFreshChat((was) => ({ id, n: (was?.n ?? 0) + 1 }))

      /*
       * A RESEND SENDS ITSELF — and has to name its model rather than ask for it.
       *
       * `optionsFor` reads a thread's model and effort out of `state`, and this
       * path was created milliseconds ago: its settings are in the `setState`
       * above, which has not been committed to the `state` this closure closed
       * over. Asking by id would find nothing there and fall back to the app
       * defaults — so a thread you had put on Opus would quietly answer in the
       * default model, on the one turn you asked it to try again. Main has just
       * handed back the record it wrote; that is the copy to read.
       *
       * The guard is `send`'s own: a turn with neither words nor pictures is
       * not a message, and there is nothing to ask twice.
       */
      if (mode === 'again' && turn && (turn.text.trim() || turn.images.length)) {
        const cfg = res.state.threadSettings[id] ?? settingsFor(from.id)
        void window.lanes.send(
          optionsFor(id, { fresh: false, model: cfg.model, effort: cfg.effort }),
          turn.text,
          turn.quote ?? undefined,
          turn.images.length ? turn.images : undefined
        )
      }
    },
    [dropSessions, tabContent, patchTab, optionsFor, settingsFor]
  )

  /**
   * Step to another path of the thread this pane is on.
   *
   * The tab does not move and is not replaced — it changes which session it is
   * showing, in place, keeping its key and its history. That is the whole of
   * the mechanism: `tab.id` has always been "the session the composer talks
   * to", so the composer, the stream routing, the context meter and the ask bar
   * all follow without being told.
   *
   * Refused while a turn is running. One live turn per thread is the rule for
   * now: interrupt, or wait. It keeps every event routed to a tab that is
   * actually on screen, which is what the stream layer already assumes.
   */
  /**
   * The seams a pane is drawing were worked out in main when it read the
   * transcript — the labels come out of the SIBLING files, so they are main's
   * answer to give. A change to the FAMILY leaves them describing a thread that
   * has moved on, and nothing else re-reads them: naming a path or letting one
   * go is not a navigation, so no tab re-hydrates on its own.
   */
  const reseam = useCallback(async () => {
    for (const i of [0, 1] as PaneIndex[]) {
      const pane = panesRef.current[i]
      const tab = activeTab(pane)
      if (!tab || tab.kind !== 'chat' || tab.fresh) continue
      const snap = await window.lanes.thread(tab.id)
      if (snap) patchTabAt(i, pane.active, { seams: snap.seams })
    }
    // A path you walked away from draws seams too — it is simply not on screen
    // to draw them yet. Its record froze at the moment you left, so a sibling
    // renamed or let go since would still be named on it when you came back.
    // Fixed here rather than on the way back, so returning stays immediate.
    for (const id of [...away.current.keys()]) {
      const snap = await window.lanes.thread(id)
      // Re-read: the stream may have moved this record on while we were asking,
      // and it may have been returned to and dropped altogether.
      const now = away.current.get(id)
      if (snap && now) away.current.set(id, { ...now, seams: snap.seams })
    }
  }, [patchTabAt])

  const goPath = useCallback(
    async (i: PaneIndex, id: string) => {
      const pane = panesRef.current[i]
      const ti = pane.active
      const was = pane.tabs[ti]
      if (!was || was.kind !== 'chat' || was.id === id) return
      // Answering, or stopped with a question of its own: leave it running, and
      // keep the page it had. Both roads at once is the point of a fork, and a
      // turn you walked away from is exactly the one worth walking back to.
      if (was.pending || was.ask) {
        away.current.set(was.id, {
          title: was.title,
          started: was.started,
          messages: was.messages,
          seams: was.seams,
          pending: was.pending,
          ask: was.ask,
          error: was.error,
          context: was.context
        })
        tellSeams()
      }
      // Asked for directly, because `tabContent` hands back a usable empty shell
      // for a chat that does not exist — which would replace the page the reader
      // is on with a blank thread. A path can be gone for ordinary reasons: a
      // seam drawn a moment before it was let go, a transcript deleted from
      // under the app. Stay put, and re-read what the seams should say.
      const snap = await window.lanes.thread(id)
      if (!snap) {
        // Not leaving after all, so take the parked copy back. Nothing is lost
        // with it: every event that reached the record reached the tab too.
        if (away.current.delete(was.id)) tellSeams()
        void reseam()
        return
      }
      const content = await tabContent('chat', id)
      if (!content) {
        if (away.current.delete(was.id)) tellSeams()
        return
      }

      setPanes((prev) => {
        const next = prev.slice() as [PaneState, PaneState]
        const tabs = next[i].tabs.slice()
        // A half-written message, a quote waiting above it and the images in
        // the tray all belong to the TAB you set them down in, not to the path
        // that happened to be showing when you did.
        tabs[ti] = {
          ...tabs[ti],
          ...content,
          composer: was.composer,
          quote: was.quote,
          images: was.images,
          hydrated: true,
          hist: pushHistory(was.hist, { kind: 'chat', id, title: content.title ?? id })
        }
        next[i] = { ...next[i], tabs }
        // Nothing shows the path we just left, so its process has nothing left
        // to talk to. A switch back resumes it from its transcript.
        dropSessions([was.id], next)
        return next
      })
      setFocus(i)

      // Where this thread is read from now on, until it is told otherwise.
      const root = rootOf(id)
      patch({ pathwayActive: { ...(stateRef.current?.pathwayActive ?? {}), [root]: id } })
    },
    [tabContent, dropSessions, patch, rootOf, reseam, tellSeams]
  )

  /**
   * Naming a path.
   *
   * A path's name is a convenience over its opening words, and it is kept apart
   * from both the kinship record and `titleOverrides`. Not the kinship, because
   * a family's FIRST path has no such record — it is the thread's own session —
   * and a name it alone could not be given would be an asymmetry with nothing
   * behind it. Not `titleOverrides`, because that answers a different question:
   * a thread has one name however many ways it went.
   */
  const namePath = useCallback(
    async (id: string, next: string) => {
      const had = stateRef.current?.pathwayLabels
      if (!had) return
      const label = next.trim()
      // Emptying the field is how a path goes back to being called by its own
      // opening words, so this removes a name as well as setting one — a stored
      // empty string would read as a path called nothing.
      const { [id]: _was, ...rest } = had
      const pathwayLabels = label ? { ...had, [id]: label } : rest
      setState((prev) => (prev ? { ...prev, pathwayLabels } : prev))
      // Awaited rather than fired and forgotten: the seams are re-read FROM
      // main, and asking for them before it has the new name would put the old
      // one straight back on screen.
      await window.lanes.patchState({ pathwayLabels })
      void reseam()
    },
    [reseam]
  )

  /**
   * To the system Trash, so it can be got back — the same answer this app gives
   * for a note, and the reason neither needs a modal asking twice.
   */
  const trashPath = useCallback(
    async (id: string) => {
      // Read now, while the record still exists. Main prunes it, and asking the
      // pruned map which family this path belonged to gets the path itself back
      // — which is the one answer `goPath` refuses, leaving the pane standing on
      // a transcript that has just been thrown away.
      const home = rootOf(id)
      const res = await window.lanes.pathTrash(id)
      if (!res.ok || !res.state) return
      setState((prev) =>
        prev
          ? {
              ...prev,
              pathways: res.state!.pathways,
              pathwayActive: res.state!.pathwayActive,
              pathwayLabels: res.state!.pathwayLabels
            }
          : prev
      )
      setIndexVersion((v) => v + 1)
      // It can be let go while it is still answering: the seam offers it with
      // the dot still on. Its process has just lost the transcript it was
      // writing to, so it stops here rather than running on into the Trash —
      // and the page it was keeping goes with it, since the seam that was the
      // way back to it is about to stop naming it.
      if (away.current.delete(id)) {
        void window.lanes.close(id)
        tellSeams()
      }
      // A pane standing on the path that just went has to be put somewhere real.
      let moved = false
      for (const i of [0, 1] as PaneIndex[]) {
        const tab = activeTab(panesRef.current[i])
        if (tab?.kind === 'chat' && tab.id === id) {
          moved = true
          await goPath(i, home === id ? familyRoot(res.state.pathways, id) : home)
        }
      }
      // A pane that was NOT on it is still drawing a seam that names it — and a
      // label naming a transcript that has gone is one click from replacing the
      // page with nothing.
      if (!moved) void reseam()
    },
    [goPath, reseam, rootOf, tellSeams]
  )

  /**
   * Menu coordinates are measured against the workspace, not the window, so a
   * menu opened near an edge folds back inside instead of being clipped.
   */
  const openCtxAt = useCallback(
    (clientX: number, clientY: number, kind: 'chat' | 'note', id: string, title: string) => {
      const host = document.querySelector('[data-ws]')
      const r = host?.getBoundingClientRect()
      const w = r?.width ?? 1200
      const h = r?.height ?? 800
      const x = Math.min(clientX - (r?.left ?? 0), Math.max(6, w - 214))
      const y = Math.min(clientY - (r?.top ?? 0), Math.max(6, h - 268))
      setCtx({ kind, id, title, x: Math.max(6, x), y: Math.max(6, y) })
    },
    []
  )

  const openCtx = useCallback(
    (e: React.MouseEvent, kind: 'chat' | 'note', id: string, title: string) => {
      e.preventDefault()
      e.stopPropagation()
      openCtxAt(e.clientX, e.clientY, kind, id, title)
    },
    [openCtxAt]
  )

  /**
   * Right-click on a `[[wikilink]]`. The target has to be resolved before the
   * menu can name a note, so the coordinates are read *before* awaiting — the
   * event is long since handled by the time the path comes back.
   */
  const wikiCtx = useCallback(
    (e: React.MouseEvent, target: string) => {
      e.preventDefault()
      e.stopPropagation()
      const { clientX, clientY } = e
      void (async () => {
        const path = await window.lanes.resolveLink(target)
        if (!path) return
        openCtxAt(clientX, clientY, 'note', path, noteTitles.current.get(path) ?? target)
      })()
    },
    [openCtxAt]
  )

  /**
   * Right-click on a path to a file — a link to one, or a path in backticks.
   * Found before the menu opens, as a wikilink's note is, so the menu can say
   * where — or that it is nowhere.
   */
  const fileMenu = useCallback((e: React.MouseEvent, text: string, note: string) => {
    e.preventDefault()
    e.stopPropagation()
    const { clientX, clientY } = e
    void window.lanes.locate(text, note).then(({ found, more }) => {
      const host = document.querySelector('[data-ws]')
      const r = host?.getBoundingClientRect()
      const w = r?.width ?? 1200
      const h = r?.height ?? 800
      // Its height, near enough: a head, then a folder and two rows a place.
      const tall = 40 + Math.max(1, found.length) * 82 + (more ? 22 : 0)
      const x = Math.min(clientX - (r?.left ?? 0), Math.max(6, w - 262))
      const y = Math.min(clientY - (r?.top ?? 0), Math.max(6, h - tall))
      setFileCtx({ text, found, more, x: Math.max(6, x), y: Math.max(6, y) })
    })
  }, [])

  /**
   * "Open in a tab of its own". The pane is no longer the caller's to pick —
   * the kind decides — so this is now only about newTab and dismissing the menu.
   */
  const openInPane = useCallback(
    (pane: PaneIndex, kind: TabKind, id: string) => {
      setCtx(null)
      void openIn(pane, kind, id, { newTab: true })
    },
    [openIn]
  )

  /**
   * Dropping a rail row on a pane still opens it — but the pane you dropped on
   * no longer chooses where it lands, because a note dropped on the thread pane
   * would have to become a thread. Dragging a TAB between panes is gone with
   * the same rule: a strip only ever holds one kind, so there is nothing a
   * cross-pane move could mean.
   */
  const onPaneDrop = useCallback(
    (pane: PaneIndex) => {
      const d = drag
      setDrag(null)
      setDropPane(null)
      if (!d || d.from !== undefined) return
      void openIn(pane, d.kind, d.id, { newTab: true })
    },
    [drag, openIn]
  )

  /**
   * A `[[wikilink]]` behaves like a link: it replaces the tab you clicked from,
   * and back returns to it. The column that used to preview notes is gone.
   *
   * Followed out of a *thread* it does the opposite: the thread is a reference
   * to the note, not the note itself, so the link opens beside it — the other
   * pane's active tab — rather than turning the conversation into it. ⌘-click
   * is the same exception every other row in this app makes for a tab of its
   * own, so a reference you want to keep does not cost you the tab you were on.
   */
  const followWiki = useCallback(
    async (target: string, fromChat?: PaneIndex, newTab?: boolean, address = false): Promise<boolean> => {
      const path = await window.lanes.resolveLink(target)
      if (!path) {
        /*
         * A link to a note that does not exist yet, followed from a NOTE, is a
         * note you are about to write: it is made, by that name, and opened.
         * From a thread it is not — Claude names notes in passing that nobody
         * asked to have made — and nor is a path written as an ADDRESS, a
         * markdown link: that names a file, and the file is not there. Either
         * way the link says so where it stands (see `NoteLink`).
         */
        if (fromChat !== undefined || address) return false
        void createNote(target, newNoteHome(stateRef.current))
        return true
      }
      if (fromChat === undefined) {
        // ⌘ HERE TOO. A wikilink followed from a CHAT has always honoured it;
        // the same link inside a NOTE dropped it and replaced the note you were
        // reading — which is the one case where you most want both, since
        // following a link out of a note is how you leave the thing you were
        // in the middle of.
        void openIn(targetPane(), 'note', path, { newTab: Boolean(newTab) })
        return true
      }
      const other = (1 - fromChat) as PaneIndex
      if (!split) setSplit(true)
      void openIn(other, 'note', path, { newTab: Boolean(newTab) })
      setFocus(other)
      return true
    },
    [openIn, targetPane, split, createNote]
  )

  // A `file:` link into the vault that reached main's door out rather than one
  // of the page's own link handlers: opened as the same link would be, written
  // as an address, in a tab of its own. See main's open.ts.
  useEffect(() => window.lanes.onOpenNote((path) => void followWiki(path, undefined, true, true)), [followWiki])

  /* ---------- bootstrap ---------- */

  useEffect(() => {
    void (async () => {
      const boot = await window.lanes.bootstrap()
      setModels(boot.models)
      setVault(boot.vault ?? '')
      setState(boot.state)
      const list = await window.lanes.threads()
      setThreads(list)
      setSkills(await window.lanes.skills())
      // The last-visited thread may not exist any more — a transcript deleted,
      // or a different vault behind LANES_VAULT — so fall back to the newest
      // rather than opening a pane onto an id nothing answers to.
      const restored = restoreTabs(boot.state, list)
      if (restored) {
        setPanes(restored)
        setSplit(boot.state.split)
        // Only the two tabs actually on screen are read from disk; the rest
        // fill in when they reach the front. Nothing is asked for here — the
        // effect above watches what is in front and does it, which is the one
        // place that knows.
      } else {
        const root = list.find((t) => t.id === boot.state.visited[0])?.id ?? list[0]?.id
        // The trail remembers threads; a thread is read on whichever path you
        // were last on. Falls back to the root if that path has since gone.
        const at = root ? boot.state.pathwayActive[root] : undefined
        const first = at && list.some((t) => t.id === at) ? at : root
        if (first) void openThread(first, 0, { from: boot.state })
      }
      // An attachment can outlive the chat it was made for. Start a chat on a
      // note, close it without sending, and there is no transcript behind its
      // id — nothing else records it, and the note's count would carry it for
      // ever while the row expands to show nothing. A chat with no transcript
      // is not restored either, so anything the thread list does not know about
      // by now is gone.
      const alive = new Set(list.map((t) => t.id))
      const kept: Record<string, string> = {}
      for (const [id, path] of Object.entries(boot.state.attachments)) {
        if (alive.has(id)) kept[id] = path
      }
      if (Object.keys(kept).length !== Object.keys(boot.state.attachments).length) {
        setState((prev) => (prev ? { ...prev, attachments: kept } : prev))
        void window.lanes.patchState({ attachments: kept })
      }
      /*
       * RUNS THAT HAPPENED WITH NO WINDOW. A schedule fires whether or not
       * anything is on screen, so its tab is made here, behind whatever is in
       * front, marked unseen — and asking again, if it stopped on a refusal
       * whose process is still waiting for the yes.
       */
      for (const [promptId, run] of Object.entries(boot.state.runs ?? {})) {
        if (run.shown || !alive.has(run.sessionId)) continue
        placeRun(promptId, run, boot.state.titleOverrides[run.sessionId] ?? 'Scheduled run', false)
      }
      // And one that started while this was booting: live, so its stream fills it.
      for (const n of earlyRuns.current.splice(0)) {
        setState((prev) =>
          prev
            ? {
                ...prev,
                titleOverrides: { ...prev.titleOverrides, [n.sessionId]: n.title },
                threadSettings: { ...prev.threadSettings, [n.sessionId]: n.settings },
                ...(n.lane ? { laneOverrides: { ...prev.laneOverrides, [n.sessionId]: n.lane } } : {}),
                runs: { ...prev.runs, [n.promptId]: n.run }
              }
            : prev
        )
        placeRun(n.promptId, n.run, n.title, true)
      }

      // After the chat is up: building the note index reads the vault, and the
      // browser is not what anyone is looking at on the first frame.
      void window.lanes.notesList().then((n) => {
        setAllNotes(n)
        setNotesLoading(false)
      })
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // The vault is not only ours to change: a turn writes notes, and so does
  // anything else with the folder open. Main pushes when it notices.
  useEffect(() => window.lanes.onNotes(setAllNotes), [])
  // Counted from the same index the note list comes from, so it refreshes on
  // the same signal and cannot say a number the palette's Tasks filter won't.
  useEffect(() => {
    void window.lanes.openTasks().then(setOpenTasks)
  }, [allNotes])

  /**
   * When main last looked at the vault. Pushed on every sweep rather than
   * inferred from the change events above, because "synced" means checked, not
   * changed — a quiet vault is up to date, not stale. The label's own minute
   * ticker lives inside StatusBar so it cannot re-render the whole app.
   */
  const [sweptAt, setSweptAt] = useState(() => Date.now())
  useEffect(() => window.lanes.onSwept(setSweptAt), [])
  // An update build/follow.sh has ready: said at the rail's foot (UpdateLine).
  const [update, setUpdate] = useState<UpdateState | null>(null)
  useEffect(() => {
    void window.lanes.update().then(setUpdate)
    return window.lanes.onUpdate(setUpdate)
  }, [])

  useEffect(() => {
    if (state) applyTheme(state.theme, state.textScale, state.measure)
  }, [state?.theme, state?.textScale, state?.measure, state])

  useEffect(() => applyHighlight(state?.highlight), [state?.highlight])

  // `auto` defers to the system, so the system flipping at dusk has to reach
  // the document. Without this subscription auto would only ever be read once,
  // at launch, and then sit on whatever it resolved to then.
  useEffect(() => {
    if (state?.theme !== 'auto') return
    return onSystemThemeChange(() => applyTheme('auto', state.textScale, state.measure))
  }, [state?.theme, state?.textScale, state?.measure])

  // Text search runs in the main process over a folded copy of the vault. It is
  // debounced harder than the name match because it reads every note's text.
  useEffect(() => {
    if (!palette || palQuery.trim().length < 3) {
      setPalContent([])
      setPalTasks([])
      setPalThreads([])
      return
    }
    const t = setTimeout(() => {
      void window.lanes.searchContent(palQuery).then(setPalContent)
      // Tasks come off the same index pass; two searches, one read of the vault.
      void window.lanes.searchTasks(palQuery).then(setPalTasks)
      // And the transcripts, which are their own index in main — warmed at
      // launch, so this scans folded text main already holds rather than
      // reading the transcripts.
      void window.lanes.searchThreads(palQuery).then(setPalThreads)
    }, 180)
    return () => clearTimeout(t)
  }, [palQuery, palette])

  // Comments are few, so every one of them is listed with nothing typed — and,
  // typed, the ones that match, a beat behind the keys.
  useEffect(() => {
    if (!palette) {
      setPalComments([])
      return
    }
    const t = setTimeout(() => void window.lanes.searchComments(palQuery).then(setPalComments), palQuery ? 150 : 0)
    return () => clearTimeout(t)
  }, [palQuery, palette])

  // The index sweeps the session directory on a timer and after every turn, so
  // a thread run in a terminal beside this app shows up without a relaunch —
  // and so does a note the turn just wrote, via `indexVersion` below.
  useEffect(
    () =>
      window.lanes.onThreads((list) => {
        setThreads(list)
        setIndexVersion((v) => v + 1)
      }),
    []
  )

  /*
   * LANES CHANGED SOMEWHERE ELSE. This window's own changes reach its state
   * through `patch`; a lane written into state by anything else — a check,
   * another window — arrives as a push, the way a run's record does, and the
   * threads re-filed under it follow on `onThreads` above (main weighs a
   * thread's lane, so it is main that says which threads moved). Not while
   * this window has lanes of its own on the way: what comes back then is its
   * own echo, and an echo of the last keystroke but one must not land over
   * the last. The push is asked for by name and may not be on the bridge yet;
   * without it a lane made elsewhere shows at the next launch.
   */
  useEffect(() => {
    const bridge = window.lanes as typeof window.lanes & {
      onLanes?: (fn: (lanes: LaneDef[]) => void) => () => void
    }
    return bridge.onLanes?.((next) => {
      if (lanesOnTheWay.current > 0 || !Array.isArray(next)) return
      setState((prev) =>
        prev && JSON.stringify(prev.lanes) !== JSON.stringify(next) ? { ...prev, lanes: next } : prev
      )
    })
  }, [])

  /**
   * WHAT IS OPEN, as ⌘K asks it: by the id it lists a thing under. A thread is
   * listed under its family's root while a tab may hold any path of it, so a
   * chat tab answers for its root — through `rootOf`, not the thread list,
   * which learns of a fork only at the next refresh while the tab is already
   * on the new path. A blank tab and an unsent thread hold nothing the palette
   * lists, and are left out.
   */
  const openMarks = useMemo(() => {
    const marks = new Map<string, OpenMark>()
    for (const pane of panes) {
      for (const t of pane.tabs) {
        if (!t.id || t.fresh) continue
        const at = `${t.kind}:${t.kind === 'chat' ? rootOf(t.id) : t.id}`
        const had = marks.get(at)
        marks.set(at, {
          answering: Boolean(had?.answering || t.pending),
          unseen: Boolean(had?.unseen || t.unseen)
        })
      }
    }
    return marks
    // `threads` and the pathways move what `rootOf` answers without moving
    // `panes`, so they are asked about too.
  }, [panes, rootOf, threads, state?.pathways])

  // The focused pane's chat decides what LINKED holds. RELATED THREADS left the
  // design with the note column; `related()` stays in main, unsurfaced.
  const focusedTab = activeTab(panes[focus])
  const focusedId = focusedTab?.kind === 'chat' ? focusedTab.id : null
  // The note showing in the note pane, whichever pane has focus — with roles
  // assigned there is only one place a note can be, so this no longer has to
  // ask which pane it is looking at.
  const noteTab = activeTab(panes[1])
  const note = noteTab?.kind === 'note' ? (noteCache[noteTab.id] ?? null) : null
  useEffect(() => {
    if (!focusedId) return
    let live = true
    void window.lanes.linked(focusedId).then((notes) => {
      if (live) setLinked(notes)
    })
    return () => {
      live = false
    }
  }, [focusedId, indexVersion])

  /*
   * Dropbox's mount does not fire watch events, so the note is polled instead.
   *
   * ONE INTERVAL, FOR AS LONG AS THE APP IS UP. It used to be set up again
   * whenever the note object changed — which is every save — so while you were
   * typing it was cleared and restarted before it could ever fire, and a change
   * Claude made to the note in those seconds went unseen until your next save
   * wrote straight over it. It reads the watched note through a ref instead.
   *
   * With nothing owed here, the change on disk simply arrives in the editor.
   * With keystrokes owed, both sides have something to lose, and that — only
   * that — is a conflict.
   */
  const watched = useRef<string | null>(null)
  watched.current = note?.path ?? null
  useEffect(() => {
    const owes = (path: string): boolean => saves.current.has(path) || editingNote.current
    const t = setInterval(() => {
      void (async () => {
        const path = watched.current
        if (!path || writing.current.has(path)) return
        const m = await window.lanes.noteMtime(path)
        const known = mtimes.current.get(path)
        if (m === null || known === undefined || Math.abs(m - known) <= 1) return
        if (writing.current.has(path) || watched.current !== path) return
        if (owes(path)) {
          // Moved by main's own hand — a rename rewriting a link or the heading
          // in this note — which main makes again in the words on their way
          // (`rewrites` in main): not a conflict, and those words go with the
          // mtime the rewrite left.
          if (await window.lanes.noteOwnChange(path)) {
            mtimes.current.set(path, m)
            return
          }
          markConflict(path)
          return
        }
        const fresh = await window.lanes.note(path)
        // Asked again after the read: typing may have started while it ran,
        // and a body read before those keystrokes must not replace them.
        if (!fresh || watched.current !== path || writing.current.has(path)) return
        if (owes(path)) {
          markConflict(path)
          return
        }
        /*
         * HANDED OVER IN THE SAME BREATH AS IT WAS ASKED. "Nothing owed" is
         * only true until the next key goes down, and a render left to React's
         * own time comes a task or two later — the pane taking the body in an
         * effect after that, and the editor in one after that. A key typed in
         * between made both of them pass the body by as older than what was
         * typed, nothing ever offered it again, and with the mtime already
         * moved on to it the next save went over it with no banner: Claude's
         * edit, gone without a word. So the body goes all the way into the
         * editor before this returns — the pane and the editor take it in
         * LAYOUT effects, which run inside this — and nothing typed can land
         * between the question and the answer. A key before it is owed, and
         * the question says conflict; a key after it lands on top of it.
         * The mtime is recorded once the body is in, which is when it is true.
         */
        flushSync(() => setNoteCache((prev) => ({ ...prev, [path]: fresh })))
        mtimes.current.set(path, fresh.edited)
      })()
    }, 4000)
    return () => clearInterval(t)
  }, [])

  useEffect(() => {
    const onResize = (): void => setVw(window.innerWidth)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  /* ---------- the live stream, routed to every tab holding that session ---------- */

  useEffect(() => {
    return window.lanes.onEvent((e: StreamEvent) => {
      const take = step(e)
      // Whatever is on screen showing this session...
      patchSession(e.sessionId, take)
      // ...and the path you left, which is the same conversation with nobody
      // in front of it. Routing only to tabs is what used to drop a permission
      // prompt, and the tail of an answer, for a path you had stepped off.
      const parked = away.current.get(e.sessionId)
      if (parked) {
        away.current.set(e.sessionId, { ...parked, ...take(parked) })
        tellSeams()
      }
      /*
       * The sign-in banner, kept honest without ever spawning anything extra.
       * An error that reads as "not signed in" raises it; a turn that actually
       * produced words is proof it has been fixed, and lowers it. Both answers
       * come from traffic that was going to happen anyway.
       */
      if (e.type === 'error' && signInFaultIn(e.message)) setSignedOut(true)
      /*
       * A session limit that says when it lifts is the end of the window, told
       * by the one party that knows — so the clock in the top bar is set to
       * it, over whatever was set by hand. Read here, as it arrives, because a
       * relative "resets in 2h" only means anything at the moment it was said.
       * A weekly or credit limit is not the five-hour window and sets nothing.
       */
      if (e.type === 'error') {
        const hit = limitIn(e.message)
        if (hit?.scope === 'session' && hit.resetsAt !== null && hit.resetsAt > Date.now())
          patch({ sessionEndsAt: hit.resetsAt })
      }
      /*
       * And every turn says it without being refused: the usage windows as the
       * turn left them. The session window's end is the clock's, over a hand-set
       * one for the same reason a limit's is. Newest wins, window by window, so
       * an event silent on the week does not wipe a week still running.
       */
      if (e.type === 'usage') {
        const now = Date.now()
        const usage = mergeUsage(stateRef.current?.usage ?? null, e.usage, now)
        const ends = usage.session?.resetsAt
        patch({
          usage,
          ...(ends && ends > now && ends !== stateRef.current?.sessionEndsAt
            ? { sessionEndsAt: ends }
            : {})
        })
      }
      // A message that arrived is proof the CLI signed in. Nothing else needs
      // asking, and no second process needs starting to find out.
      if (e.type === 'message' || e.type === 'patch') setSignedOut(false)
      if (e.type === 'done' || e.type === 'exit') {
        void nameThread(e.sessionId)
        /*
         * AN ANSWER THAT LANDED WHILE YOU WERE ELSEWHERE.
         *
         * Running several threads at once is what this app is for, so most
         * answers finish somewhere you are not looking — behind another tab, in
         * the other pane while the split is closed, or with the whole window in
         * the background. The strip said nothing about any of them, and the
         * only way to find out was to go through the tabs.
         *
         * Watched means the ACTIVE tab of a pane that is on screen, in a window
         * that has focus. Anything else is unseen until you go back to it, and
         * `sawIt` below is what clears it.
         */
        if (!watching(e.sessionId)) patchSession(e.sessionId, () => ({ unseen: true }))
        // Its turn is over and nothing is showing it, so the process has
        // nothing left to say. The transcript keeps everything it said.
        const shown = panesRef.current.some((pane) =>
          pane.tabs.some((t) => t.kind === 'chat' && t.id === e.sessionId)
        )
        if (!shown && !away.current.get(e.sessionId)?.ask) void window.lanes.close(e.sessionId)
      }
    })
  }, [patchSession, nameThread, tellSeams, watching, patch])

  /**
   * GOING BACK TO IT IS WHAT MARKS IT SEEN.
   *
   * Not clicking the tab — arriving at it, by whatever route: the strip, ⌘K,
   * ⌥↑↓, ⌃⇥, the rail, a link. So this watches the ANSWER to "what is on
   * screen" rather than any of the ways of changing it, and there is one place
   * that can be wrong instead of eight.
   *
   * Window focus counts. An answer that lands while the app is behind another
   * one has not been seen even if its tab was already in front, which is most
   * of when this matters.
   */
  useEffect(() => {
    const sawIt = (): void => {
      if (!document.hasFocus()) return
      const on: PaneIndex[] = split ? [0, 1] : [focus]
      setPanes((prev) => {
        let any = false
        const next = prev.map((pane, i) => {
          if (!on.includes(i as PaneIndex)) return pane
          const t = pane.tabs[pane.active]
          if (!t?.unseen) return pane
          any = true
          const tabs = pane.tabs.slice()
          tabs[pane.active] = { ...t, unseen: false }
          return { ...pane, tabs }
        }) as [PaneState, PaneState]
        return any ? next : prev
      })
    }
    sawIt()
    window.addEventListener('focus', sawIt)
    return () => window.removeEventListener('focus', sawIt)
  }, [panes, split, focus])

  useEffect(() => {
    if (!panes.some((pane) => pane.tabs.some((t) => t.pending))) return
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [panes])

  /* ---------- navigation ---------- */

  const histGo = useCallback(
    async (i: PaneIndex, delta: number) => {
      const pane = panesRef.current[i]
      const ti = pane.active
      const tab = pane.tabs[ti]
      // An empty pane has no trail to walk.
      if (!tab || !canGo(tab.hist, delta)) return
      const at = tab.hist.i + delta
      const entry = tab.hist.stack[at]
      const content = await tabContent(entry.kind, entry.id)
      if (!content) return
      // Deliberately not through `openIn`: a step back is navigation *within*
      // this tab, not a jump to whichever other tab happens to show that thing.
      patchTabAt(i, ti, { ...content, hist: { ...tab.hist, i: at } })
    },
    [patchTabAt, tabContent]
  )

  /**
   * ⌥↑↓ steps through the rail. It is threads again, but `RailEntry` still
   * carries a `kind` — a pane parked on a note has nothing of its own in the
   * list, so this falls through to the top of it rather than doing nothing.
   */
  const flip = useCallback(
    (i: PaneIndex, delta: number) => {
      if (!visibleOrder.length) return
      const tab = activeTab(panesRef.current[i])
      // The rail lists threads, and the tab may be on any path of one, so where
      // we ARE in the list is a question about the family. Stepping off a path
      // otherwise started from the top of the list every time.
      const at = tab
        ? visibleOrder.findIndex(
            (e) =>
              e.kind === tab.kind &&
              (e.kind === 'chat' ? sameThread(e.id, tab.id) : e.id === tab.id)
          )
        : -1
      const to = at === -1 ? 0 : at + delta
      // Settings → wrap when flipping: off, the ends of the list are ends.
      if (state?.flags.wrapFlip === false && (to < 0 || to >= visibleOrder.length)) return
      const next = visibleOrder[(to + visibleOrder.length) % visibleOrder.length]
      if (next) void openIn(i, next.kind, next.id)
    },
    [visibleOrder, openIn, state, sameThread]
  )

  const send = useCallback(
    (i: PaneIndex) => {
      const tab = activeTab(panesRef.current[i])
      if (!tab || tab.kind !== 'chat') return
      const text = tab.composer.trim()
      // Not gated on `tab.pending`: this is the path the composer's own
      // placeholder advertises — "Enter queues your next message" — and it used
      // to drop the message on the floor instead. The session queues it.
      // An image on its own is a message: "look at this" is most of why one
      // gets attached, and the words for it are usually in the picture.
      if (!text && !tab.images.length) return
      const quote = tab.quote ?? undefined
      const images = tab.images.length ? tab.images : undefined
      patchTab(i, {
        composer: '',
        quote: null,
        images: [],
        fresh: false,
        // Only while the title is still a stand-in, and only for the message
        // that opens the chat: every later one would rename it out from under
        // whatever it had settled on being called.
        ...(tab.provisional && !tab.messages.length
          ? { title: openingLabel(text, images) }
          : {})
      })
      void window.lanes.send(optionsFor(tab.id, { fresh: tab.fresh }), text, quote, images)
    },
    [patchTab, optionsFor]
  )

  /**
   * A quote needs a composer, so it lands on a *chat* tab: the target pane's if
   * it has one, otherwise the other pane's. Quoting into a note pane used to
   * set a chip nothing rendered.
   */
  const quoteInto = useCallback(
    (target: PaneIndex, label: string, text: string) => {
      const excerpt = text.length > 600 ? `${text.slice(0, 600)}…` : text
      const candidates: PaneIndex[] = split ? [target, (1 - target) as PaneIndex] : [0]
      for (const i of candidates) {
        const pane = panesRef.current[i]
        if (!pane.tabs.length) continue
        const ti =
          pane.tabs[pane.active]?.kind === 'chat'
            ? pane.active
            : pane.tabs.map((t) => t.kind).lastIndexOf('chat')
        if (ti < 0) continue
        setPanes((prev) => {
          const next = prev.slice() as [PaneState, PaneState]
          const tabs = next[i].tabs.slice()
          tabs[ti] = { ...tabs[ti], quote: { label, text: excerpt } }
          next[i] = { tabs, active: ti }
          return next
        })
        setFocus(i)
        return
      }
    },
    [split]
  )

  /* ---------- tabs ---------- */

  const hydrate = useCallback(
    async (i: PaneIndex, tab: TabState) => {
      const content = await tabContent(tab.kind, tab.id)
      // By KEY: the read takes a moment, and the strip can be a different shape
      // by the time it lands. `hydrated: true` even when there was nothing to
      // read, so a note that has left the vault settles on saying so instead of
      // being asked for again on every render.
      patchTabByKey(i, tab.key, content ? { ...content, hydrated: true } : { hydrated: true })
    },
    [tabContent, patchTabByKey]
  )

  /**
   * WHATEVER IS IN FRONT GETS LOADED — and this is the only place that says so.
   *
   * A restored tab carries its title and nothing else; its transcript or its
   * note is read when you land on it. "When you land on it" used to mean one
   * thing only: `selectTab`, the click. But six things move the selection —
   * closing a tab, closing the others, trashing a note out from under one,
   * quoting into a chat, a `placeTab` that found the thing already open, and
   * the click — and five of them left an unread tab in front of you.
   *
   * You saw that as a tab that would not load until you clicked away and back:
   * the trip away was doing the loading, because it was the only route that
   * hydrates. Nothing was broken about the tab; nothing had ever asked for it.
   *
   * So it is not asked at the call sites at all. This watches what is actually
   * in front of the reader in each pane and loads it, which is true however the
   * selection got there and stays true for whatever moves it next.
   */
  const hydrating = useRef(new Set<string>())
  useEffect(() => {
    for (const i of [0, 1] as PaneIndex[]) {
      const front = panes[i].tabs[panes[i].active]
      // Guarded by key: this effect re-runs on every streamed token, and a
      // second read of the same tab would race the first one's patch.
      if (!front || front.hydrated || hydrating.current.has(front.key)) continue
      hydrating.current.add(front.key)
      const key = front.key
      void hydrate(i, front).finally(() => hydrating.current.delete(key))
    }
  }, [panes, hydrate])

  const selectTab = useCallback((i: PaneIndex, ti: number) => {
    setPanes((prev) => {
      const next = prev.slice() as [PaneState, PaneState]
      next[i] = { ...next[i], active: ti }
      return next
    })
    setFocus(i)
  }, [])

  /**
   * Tabs closed by hand, newest first, for ⇧⌘T. In memory only, and only the
   * ones there is something to come back to: a chat that never sent has no
   * transcript behind its id, so reopening it would restore an empty shell.
   *
   * Deliberately not fed by the cross-pane drag, which also calls closeTabAt —
   * that is a move, and the tab is still on screen.
   */
  const reopenable = useRef<{ kind: TabKind; id: string; title: string; pane: PaneIndex }[]>([])

  const closeTabIn = useCallback(
    (i: PaneIndex, ti: number) => {
      const gone = panesRef.current[i].tabs[ti]
      if (gone && !isBlank(gone) && !(gone.kind === 'chat' && gone.fresh && !gone.messages.length)) {
        reopenable.current = [
          { kind: gone.kind, id: gone.id, title: gone.title, pane: i },
          ...reopenable.current.filter((t) => !(t.kind === gone.kind && t.id === gone.id))
        ].slice(0, 12)
      }
      const { pane, closed } = closeTabAt(panesRef.current[i], ti)
      setPanes((prev) => {
        const next = prev.slice() as [PaneState, PaneState]
        next[i] = pane
        dropSessions(closed, next)
        return next
      })
    },
    [dropSessions]
  )

  /**
   * ⌘T, the `+` at the end of a strip, and the top bar's brand `+` — all
   * unattached. The navigator's `+` passes a note, and that is the whole
   * difference between a chat that has a home in the vault and one that does
   * not: ⌘T stays instant, because ceremony on a new chat is a tax on the
   * cheapest thing the app does.
   *
   * An attachment is app state rather than something the index derives. The
   * touched-notes index learns from transcripts, and this chat has none yet —
   * it would belong to the note only after its first turn, which is exactly
   * when the reader has stopped looking for it in the spine.
   */
  const newTabIn = useCallback(
    /**
     * `seed` is what the composer opens holding — the words the palette was
     * asked to start a thread with. A thread has no name of its own until its
     * first message earns one, so "make a thread called X" can only mean "make
     * one with X ready to send", which is also why it is not sent: what you
     * typed to FIND something is rarely phrased the way you would ask it.
     */
    (_advisory: PaneIndex, noteId?: string, seed?: string) => {
      // Role-assigned, like every other open. The caller's pane is advisory:
      // a chat belongs in the thread pane, and the usual state when this fires
      // is that you are looking at a note — which is precisely when passing the
      // focused pane would drop a chat into the note strip.
      const i = paneFor('chat')
      const fresh = emptyTab()
      if (noteId) {
        const title = noteTitles.current.get(noteId) ?? nameOfPath(noteId)
        fresh.title = `New thread · ${title}`
        // The note goes in as a wikilink rather than a body: the CLI runs in
        // the vault and can open the path itself. It also puts the note in the
        // transcript, so the index reaches the same conclusion the attachment
        // asserts and the two never drift.
        fresh.composer = `[[${noteId.replace(/\.md$/, '')}]] `
      } else if (seed) {
        fresh.composer = seed
      }
      const { pane, closed } = placeTab(panesRef.current[i], 'chat', fresh.id, true, () => fresh)
      setPanes((prev) => {
        const next = prev.slice() as [PaneState, PaneState]
        next[i] = pane
        dropSessions(closed, next)
        return next
      })
      setFocus(i)
      setFreshChat((was) => ({ id: fresh.id, n: (was?.n ?? 0) + 1 }))
      if (!noteId) return

      const base = stateRef.current
      if (!base) return
      const patched: Partial<AppState> = {
        attachments: { ...base.attachments, [fresh.id]: noteId }
      }
      // A chat inherits the note's lane, so a note and the chats about it
      // still read as one thing. Outside every lane's folder there is no lane
      // to inherit, and the pane's own chat lends its lane rather than none.
      const lane =
        laneOfPath(noteId, lanes)?.id ??
        (() => {
          const host = activeTab(panesRef.current[i])
          if (!host || host.kind !== 'chat') return null
          // The same resolution every other reader uses. Consulting only the
          // override map made this rung dead on any install where nobody had
          // used "move to lane" — which is most of them, since a chat's lane
          // normally comes from the paths its transcript touched. An override
          // naming a lane that is gone is passed over, as `laneOf` passes it.
          const live = (id: string | null | undefined): string | null =>
            id && lanes.some((l) => l.id === id) ? id : null
          return live(base.laneOverrides[rootOf(host.id)]) ?? live(threads.find((t) => t.id === host.id)?.lane)
        })()
      if (lane) patched.laneOverrides = { ...base.laneOverrides, [fresh.id]: lane }
      setState((prev) => (prev ? { ...prev, ...patched } : prev))
      void window.lanes.patchState(patched)
    },
    [dropSessions, lanes, threads, rootOf]
  )

  /**
   * A SAVED PROMPT, RUN: a new thread in the thread pane, sent at once, made by
   * `runOf` — the one place that says what a run is — and named for the prompt
   * and the day. With `send` false it is the words in a new thread's composer,
   * unsent, to change first: exactly the palette's NEW THREAD offer.
   *
   * The send goes through the composer's own transport, not a second one. The
   * tab is put on screen BEFORE it leaves — flushed, not left to React's time —
   * so the turn's first event has a tab to land on.
   */
  const runSaved = useCallback(
    /** `about` is a note the thread is attached to, as the navigator's `+` attaches one. */
    (prompt: SavedPrompt, send: boolean, about?: string) => {
      const base = stateRef.current
      if (!base) return
      const i = paneFor('chat')
      if (!send) {
        newTabIn(i, undefined, prompt.text)
        return
      }
      const tab = emptyTab()
      const run = runOf(prompt, base, tab.id, Date.now())
      // Its name is its own from the start, and its session is made by the send.
      tab.title = run.title
      tab.provisional = false
      tab.fresh = false
      const { pane, closed } = placeTab(panesRef.current[i], 'chat', tab.id, true, () => tab)
      flushSync(() => {
        setPanes((prev) => {
          const next = prev.slice() as [PaneState, PaneState]
          next[i] = pane
          dropSessions(closed, next)
          return next
        })
        setFocus(i)
      })
      const patched: Partial<AppState> = {
        titleOverrides: { ...base.titleOverrides, [tab.id]: run.title },
        threadSettings: { ...base.threadSettings, [tab.id]: run.settings },
        ...(run.lane ? { laneOverrides: { ...base.laneOverrides, [tab.id]: run.lane } } : {}),
        ...(about ? { attachments: { ...base.attachments, [tab.id]: about } } : {})
      }
      setState((prev) => (prev ? { ...prev, ...patched } : prev))
      void window.lanes.patchState(patched)
      void window.lanes.send(run.options, run.text)
    },
    [dropSessions, newTabIn]
  )
  /**
   * GO THROUGH A NOTE'S COMMENTS — the pass.
   *
   * The note's words are handed over and written first, every one of them, so
   * Claude reads the note you see. Then a new thread, attached to the note and
   * filed in its lane, named `Comments · <note> · <day>` — one per pass, so each
   * review has its own record and the note's chats list them — sent the prompt
   * `reviewPrompt` makes, listing every open comment. It runs in the app's
   * safety mode: Standard makes the edits, Guarded asks for each one. Claude's
   * edits come back into the open note the way any change from outside does.
   */
  const goThrough = useCallback(
    async (path: string) => {
      window.dispatchEvent(new Event('lanes:settle'))
      await flushSave(path)
      for (let i = 0; i < 100 && writing.current.has(path); i += 1) await new Promise((r) => setTimeout(r, 20))
      const read = await window.lanes.note(path)
      const body = read?.body ?? noteCacheRef.current[path]?.body ?? ''
      const comments = findComments(body)
      if (!comments.length) return
      // Its title as just read: a note made a moment ago is not in the list yet.
      const title = read?.title ?? noteTitles.current.get(path) ?? nameOfPath(path)
      const lane = laneOfPath(path, lanes)?.id
      runSaved(
        { id: `comments:${path}`, name: `Comments · ${title}`, text: reviewPrompt(path, body, comments), ...(lane ? { lane } : {}) },
        true,
        path
      )
    },
    [flushSave, lanes, runSaved]
  )
  const runPrompt = useCallback(
    (promptId: string, send: boolean) => {
      const prompt = stateRef.current?.prompts.find((p) => p.id === promptId)
      if (prompt) runSaved(prompt, send)
    },
    [runSaved]
  )
  /**
   * A vault skill, run the way a person runs one at the terminal: `/morning`,
   * which the CLI expands into the skill itself — verified over stream-json
   * before this row existed. It is a prompt nobody had to keep: its words are
   * the command, its name says so in the thread's title, and it is filed in
   * the lane its own name points at. ⇧↵ leaves `/morning ` in the composer,
   * with room after it for what to tell it.
   */
  const runSkill = useCallback(
    (id: string, send: boolean) => {
      const skill = skills.find((s) => s.id === id)
      if (!skill) return
      runSaved(
        {
          id: `skill:${id}`,
          name: `/${id}`,
          text: send ? `/${id}` : `/${id} `,
          ...(skill.lane ? { lane: skill.lane } : {})
        },
        send
      )
    },
    [skills, runSaved]
  )

  /**
   * A SCHEDULED RUN'S TAB, made behind whatever is in front: the answer is
   * coming in it, and the strip's own glyph says when it lands. `live` is a run
   * starting now, whose stream fills the tab — so it is put there before the
   * turn's first event, flushed rather than left to React's time. Otherwise it
   * ran with no window, and is read from disk when it reaches the front.
   */
  const placeRun = useCallback(
    (promptId: string, run: PromptRun, title: string, live: boolean) => {
      const tab = emptyTab()
      tab.id = run.sessionId
      tab.title = title
      tab.provisional = false
      tab.fresh = false
      if (!live) {
        tab.hydrated = false
        tab.unseen = true
        if (run.outcome === 'asked' && run.ask) tab.ask = run.ask
      }
      flushSync(() => {
        setPanes((prev) => {
          const i = paneFor('chat')
          const { pane, closed } = placeBehind(prev[i], tab)
          if (pane === prev[i]) return prev
          const next = prev.slice() as [PaneState, PaneState]
          next[i] = pane
          dropSessions(closed, next)
          return next
        })
      })
      void window.lanes.runShown(promptId)
    },
    [dropSessions]
  )

  /*
   * Main's runs, told to the window. What main wrote for the run — its name,
   * its thread's model and effort, its lane, its record — is merged in here,
   * key by key, and never written back: main is the one writer of a run.
   */
  /** Runs told before the window had booted: placed once it has, or the restored tabs would replace them. */
  const earlyRuns = useRef<RanNotice[]>([])
  useEffect(
    () =>
      window.lanes.onRan((n) => {
        if (!stateRef.current) {
          earlyRuns.current.push(n)
          return
        }
        setState((prev) =>
          prev
            ? {
                ...prev,
                titleOverrides: { ...prev.titleOverrides, [n.sessionId]: n.title },
                threadSettings: { ...prev.threadSettings, [n.sessionId]: n.settings },
                ...(n.lane ? { laneOverrides: { ...prev.laneOverrides, [n.sessionId]: n.lane } } : {}),
                runs: { ...prev.runs, [n.promptId]: n.run }
              }
            : prev
        )
        placeRun(n.promptId, n.run, n.title, true)
      }),
    [placeRun]
  )
  useEffect(
    () =>
      window.lanes.onRuns(({ promptId, run }) =>
        setState((prev) => (prev ? { ...prev, runs: { ...prev.runs, [promptId]: run } } : prev))
      ),
    []
  )

  /**
   * A blank tab in the note pane: a note tab with no note in it yet, showing
   * the empty surface. Selecting anything from it REPLACES it — `placeTab` with
   * `newTab: false` keeps the key, so the tab you opened is the tab you read.
   */
  const newBlankTab = useCallback(() => {
    const blank = blankNoteTab()
    const { pane, closed } = placeTab(panesRef.current[1], 'note', blank.id, true, () => blank)
    setPanes((prev) => {
      const next = prev.slice() as [PaneState, PaneState]
      next[1] = pane
      dropSessions(closed, next)
      return next
    })
    setSplit(true)
    setFocus(1)
  }, [dropSessions])

  /**
   * ⌘W. Arrives as an IPC rather than a keydown because it is a menu
   * accelerator (see buildMenu in the main process).
   *
   * It closes the tab, full stop — the same thing the ✕ does and the same thing
   * the tab menu's own row advertises. It used to refuse the last one, back
   * when a pane always had to show something; now a pane may close to empty and
   * its empty state is a real destination, so refusing would make ⌘W the one
   * path that disagrees with the two controls named after it.
   */
  useEffect(() => {
    return window.lanes.onCloseTab(() => {
      const i: PaneIndex = focus
      const pane = panesRef.current[i]
      if (pane.tabs.length) {
        closeTabIn(i, pane.active)
        return
      }
      // Already empty: ⌘W on the note pane closes the split rather than
      // doing nothing at all.
      if (split && i === 1) {
        setSplit(false)
        setFocus(0)
      }
    })
  }, [split, focus, closeTabIn])

  /**
   * ⌃⇥ and ⌃⇧⇥ — step through the focused pane's strip, wrapping at both ends.
   * Routed through `selectTab` rather than setting `active` directly, so a tab
   * restored on launch still hydrates when you land on it.
   */
  const cycleTab = useCallback(
    (i: PaneIndex, delta: number) => {
      const { tabs, active } = panesRef.current[i]
      if (tabs.length < 2) return
      selectTab(i, (active + delta + tabs.length) % tabs.length)
    },
    [selectTab]
  )

  const toggleSplit = useCallback(() => {
    setSplit((was) => {
      // Neither direction moves you. Opening the split brings the other pane
      // into view beside the one you are in; closing it keeps the one you are
      // in — the note pane holds notes and nothing else, so a toggle that
      // always landed on the left was a toggle that threw away what you were
      // reading. The exception is an empty pane, which is not a place to be
      // left alone on screen.
      if (was) setFocus((f) => (panesRef.current[f]?.tabs.length ? f : 0))
      return !was
    })
  }, [])

  /* ---------- the trackpad ---------- */

  /**
   * A two-finger swipe opens and closes the browser rail: right pulls it in
   * from the left edge, left pushes it back out. On macOS that gesture arrives
   * as a `wheel` with horizontal delta, so the whole job is telling it apart
   * from the scrolling it looks exactly like.
   *
   * Three guards, and each one is a thing that would otherwise be stolen:
   *
   * - ANYTHING THAT CAN SCROLL SIDEWAYS keeps its gesture. The tab strip, a wide
   *   code block, a table — walked up from whatever is under the pointer, and
   *   only while it still has somewhere to go in that direction, so a strip
   *   already at its end hands the swipe back rather than swallowing it.
   * - IT HAS TO BE HORIZONTAL. Trackpads leak a little sideways delta into
   *   every vertical scroll, so a gesture is only this one when it is mostly
   *   sideways.
   * - AND DELIBERATE. Deltas accumulate within a gesture and have to reach a
   *   distance no flick of noise reaches; the moment one fires, a latch closes
   *   until the gesture is over, so one swipe is one toggle rather than five.
   */
  useEffect(() => {
    const SIDEWAYS = 1.6
    const FAR_ENOUGH = 90
    const GESTURE_GAP = 220
    const LATCH = 420
    let sum = 0
    let last = 0
    let until = 0

    /** Something under the pointer that can still scroll the way you swiped. */
    const scrolls = (from: EventTarget | null, dx: number): boolean => {
      let el = from instanceof Element ? from : null
      while (el && el !== document.body) {
        const room = el.scrollWidth - el.clientWidth
        if (room > 1) {
          const how = getComputedStyle(el).overflowX
          if (how === 'auto' || how === 'scroll') {
            const at = el.scrollLeft
            if (dx < 0 ? at > 1 : at < room - 1) return true
          }
        }
        el = el.parentElement
      }
      return false
    }

    const onWheel = (e: WheelEvent): void => {
      const now = Date.now()
      if (now - last > GESTURE_GAP) sum = 0
      last = now
      if (now < until) return
      // Nothing behind a palette, a menu or a settings sheet: the gesture would
      // move a rail nobody can see.
      if (palette || settingsOpen || newMenu || moving) return
      if (Math.abs(e.deltaX) <= Math.abs(e.deltaY) * SIDEWAYS) return
      if (scrolls(e.target, e.deltaX)) return
      sum += e.deltaX
      if (Math.abs(sum) < FAR_ENOUGH) return
      // Natural scrolling: fingers to the right move the content right, which
      // is a negative delta — and pulling the rail in from the left edge is
      // what that gesture should mean.
      const show = sum < 0
      sum = 0
      until = now + LATCH
      if (show === Boolean(stateRef.current?.hideLeft)) patch({ hideLeft: !show })
    }

    window.addEventListener('wheel', onWheel, { passive: true })
    return () => window.removeEventListener('wheel', onWheel)
  }, [patch, palette, settingsOpen, newMenu, moving])

  /* ---------- keyboard ---------- */

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.metaKey && e.key === ',') {
        e.preventDefault()
        setSettingsOpen((v) => !v)
        return
      }
      if (e.metaKey && e.key.toLowerCase() === 'f') {
        e.preventDefault()
        // Re-opening on an already-open bar refocuses it, which is what every
        // other find bar does when you hit the shortcut twice.
        setFindPane(focus)
        setFindNonce((n) => n + 1)
        return
      }
      // ⌘G steps the open bar, and the bar itself handles that — it owns the
      // matches. All that is left here is ⌘G with no bar open, which reopens it
      // on what was last looked for rather than doing nothing.
      if (e.metaKey && e.key.toLowerCase() === 'g' && findPane === null) {
        e.preventDefault()
        setFindPane(focus)
        setFindNonce((n) => n + 1)
        return
      }
      /*
       * ⌘Z / ⇧⌘Z on the note you are looking at when no field has the caret —
       * its saved changes, one step each: a task ticked in READ, a save.
       *
       * A field is left alone, as with ⌘A. The composer and the find box have
       * the browser's own undo, and the note's editor has its own history of
       * the whole document — while you are writing, the thing you mean by ⌘Z is
       * your last edit, not the app's record of saves.
       */
      if (e.metaKey && e.key.toLowerCase() === 'z') {
        const el = document.activeElement as HTMLElement | null
        const typing =
          el instanceof HTMLInputElement ||
          el instanceof HTMLTextAreaElement ||
          Boolean(el?.isContentEditable)
        if (typing) return
        if (stepNote(e.shiftKey)) e.preventDefault()
        return
      }
      /*
       * ⌘A selects THE PANE YOU ARE IN. The default is the whole window, which
       * on this layout means the rail, both tab strips, the status bar and both
       * documents at once — a selection nobody could want and, copied, nonsense.
       *
       * A field keeps its own: a composer, the find box, a rename or the note's
       * editor all answer ⌘A themselves, and stealing it there would be worse
       * than the thing this fixes.
       */
      if (e.metaKey && e.key.toLowerCase() === 'a') {
        const el = document.activeElement as HTMLElement | null
        const typing =
          el instanceof HTMLInputElement ||
          el instanceof HTMLTextAreaElement ||
          Boolean(el?.isContentEditable)
        if (typing) return
        const doc = document.querySelector(`[data-pane="${focus}"] [data-find-scope]`)
        if (!doc) return
        e.preventDefault()
        const sel = window.getSelection()
        const r = document.createRange()
        r.selectNodeContents(doc)
        sel?.removeAllRanges()
        sel?.addRange(r)
        return
      }
      if (e.key === 'Escape' && newMenu) {
        setNewMenu(false)
        return
      }
      if (e.key === 'Escape' && findPane !== null) {
        setFindPane(null)
        return
      }
      if (e.metaKey && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        // ⇧ keeps v2's habit alive: the box is still the way to filter the rail.
        if (e.shiftKey) searchRef.current?.focus()
        else setPalette((was) => (was ? null : { newTab: false }))
        return
      }
      if (e.metaKey && e.key === '\\') {
        e.preventDefault()
        toggleSplit()
        return
      }
      /*
       * ⌘E — WRITE or READ, on the note in front of you. Always the NOTE pane's
       * note, whichever pane has focus: with the split open the caret is
       * usually in the composer beside it, and a mode switch that only works
       * when you have first clicked the note is a mode switch you stop reaching
       * for. The note pane is pane B by the role rule, so there is exactly one
       * note it could mean.
       */
      if (e.metaKey && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'e') {
        const t = activeTab(panesRef.current[1])
        if (!t || t.kind !== 'note' || !t.id) return
        e.preventDefault()
        setWriting(t.id, !writeOn[noteIdOf(t.id)])
        return
      }
      if (e.metaKey && (e.key === '[' || e.key === ']')) {
        e.preventDefault()
        void histGo(focus, e.key === '[' ? -1 : 1)
        return
      }
      if (e.metaKey && (e.key === '+' || e.key === '=' || e.key === '-' || e.key === '_')) {
        e.preventDefault()
        patch({ textScale: stepText(state?.textScale ?? 1, e.key === '-' || e.key === '_' ? -1 : 1) })
        return
      }
      if (e.metaKey && e.key === '0') {
        e.preventDefault()
        patch({ textScale: 1 })
        return
      }
      /*
       * ⌥⇥ and ⇧⌥⇥ — the other pane. There are two of them, so both directions
       * land in the same place, and that is the point: one key, held or not,
       * always takes you across.
       *
       * With the split closed there is one pane on screen and it is the one
       * `focus` names, so this flips WHICH pane that is — threads to notes and
       * back, full width, without opening the split to do it.
       *
       * Matched on `code` as well as `key`: `code` is physical, and ⌥ is the
       * modifier that rewrites `key` on macOS.
       */
      if (e.altKey && (e.key === 'Tab' || e.code === 'Tab')) {
        e.preventDefault()
        setFocus((f) => (f === 0 ? 1 : 0))
        return
      }
      // Before the ⌘ block: ⌃⇥, the key every browser cycles tabs with.
      // Matched on `code` as well as `key` — `code` is physical and cannot be
      // remapped by a modifier.
      if (e.ctrlKey && (e.key === 'Tab' || e.code === 'Tab')) {
        e.preventDefault()
        cycleTab(focus, e.shiftKey ? -1 : 1)
        return
      }
      if (e.metaKey && e.key.toLowerCase() === 't') {
        e.preventDefault()
        // ⇧⌘T reopens; plain ⌘T opens a new one. Checked here rather than in a
        // branch above, so the two cannot both fire.
        if (e.shiftKey) {
          const back = reopenable.current.shift()
          if (back) {
            const into = split ? back.pane : 0
            setFocus(into)
            void openIn(into, back.kind, back.id, { newTab: true })
          }
          return
        }
        /*
         * A new tab lands IN THE PANE YOU ARE IN, and the pane's role decides
         * what one is. A thread pane makes a thread, ready to type into. A note
         * pane cannot: a note is a file, and which file is the question — so it
         * opens a BLANK TAB showing the same surface an empty note pane shows,
         * where starting one, opening one and the recent four are all offered.
         * The browser's new-tab page, and it is replaced in place by whatever
         * you pick from it.
         */
        if (focus === 1) newBlankTab()
        else newTabIn(focus)
        return
      }
      if (e.metaKey && !e.shiftKey && e.key.toLowerCase() === 'n') {
        e.preventDefault()
        // ⇧⌘N used to make a new pane with a fresh chat in it. With the panes
        // role-assigned there is no such thing: the second pane holds notes,
        // and "show me the other pane" is ⌘\. And ⌘N no longer asks for a
        // name first — see `makeUntitled`.
        void makeUntitled()
        return
      }
      /*
       * ⌘1–9 IS THE NTH TAB, and ⌥-digit puts a part of the window away: ⌥1 the
       * browser rail, ⌥2 the second pane. The first pair were the other way
       * round.
       *
       * ⌘-digit is the tab shortcut in every browser and every editor, which
       * makes it the one chord nobody has to be told; spending it on a panel
       * meant the thing people reach for by muscle memory did nothing, and the
       * jump it displaced sat on a modifier nobody guesses. The panel is the
       * rarer errand, so it takes the rarer chord.
       *
       * Matched on `code`, never on `key` — for BOTH now. Option is a compose
       * modifier on macOS, so ⌥1 arrives as '¡'; and a ⌘-digit on a non-US
       * layout is not guaranteed to report the digit as `key` either. The
       * physical key is the only stable answer, which is why ⌃⇥ reads `code`
       * too.
       */
      const digit = /^Digit([1-9])$/.exec(e.code)
      if (e.metaKey && !e.altKey && !e.shiftKey && digit) {
        e.preventDefault()
        const i = focus
        const ti = Number(digit[1]) - 1
        if (ti < panesRef.current[i].tabs.length) selectTab(i, ti)
        return
      }
      if (e.altKey && !e.metaKey && e.code === 'Digit1') {
        e.preventDefault()
        patch({ hideLeft: !stateRef.current?.hideLeft })
        return
      }
      // And ⌥2 is the second PANE, which is the same errand one place over:
      // ⌥-digit puts a part of the window away and brings it back.
      if (e.altKey && !e.metaKey && e.code === 'Digit2') {
        e.preventDefault()
        toggleSplit()
        return
      }
      if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
        e.preventDefault()
        flip(focus, e.key === 'ArrowDown' ? 1 : -1)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [
    state,
    patch,
    flip,
    histGo,
    focus,
    split,
    findPane,
    newMenu,
    newTabIn,
    newBlankTab,
    stepNote,
    cycleTab,
    openIn,
    selectTab,
    toggleSplit,
    writeOn,
    setWriting,
    makeUntitled
  ])

  /* ---------- derived ---------- */

  const laneOf = useCallback(
    (id: string | null): LaneDef | null => {
      if (!id) return null
      const t = threads.find((x) => x.id === id)
      // Keyed by the thread: a lane moved from one path would not be found
      // again from another, and every path of a family sits in one lane.
      // A move naming a lane that is gone is passed over, not dropped: the
      // thread shows the lane its notes put it in, or none, and the move is
      // still on file for when a lane by that id comes back.
      const moved = state?.laneOverrides[rootOf(id)]
      return lanes.find((l) => l.id === moved) ?? lanes.find((l) => l.id === t?.lane) ?? null
    },
    [threads, state, lanes]
  )

  /**
   * READ-ONLY FOLDERS CHANGED IN SETTINGS. Main answers every read and write
   * by the new list from the moment the patch lands; a note already open was
   * read under the old one, and says so until it is read again. So the notes
   * held here are re-marked by the same rule at once — the open one loses its
   * WRITE, or gets it back — rather than at the next launch. Not on the first
   * list: that is the one every note held was read under.
   */
  const readOnlyKey = state ? JSON.stringify(state.readOnlyFolders ?? []) : null
  const readOnlyWas = useRef<string | null>(null)
  useEffect(() => {
    if (readOnlyKey === null) return
    const was = readOnlyWas.current
    readOnlyWas.current = readOnlyKey
    if (was === null || was === readOnlyKey) return
    const folders = JSON.parse(readOnlyKey) as string[]
    setNoteCache((prev) => {
      let next: Record<string, Note> | null = null
      for (const [path, n] of Object.entries(prev)) {
        const ro = isReadOnly(path, folders)
        if (Boolean(n.readOnly) === ro) continue
        next ??= { ...prev }
        next[path] = { ...n, readOnly: ro }
      }
      return next ?? prev
    })
  }, [readOnlyKey])

  /**
   * What a thread's chip says where it stands — the pane head, the tab's
   * title. Its lane, while there are lanes to be in; with none, the folder of
   * the note it was started on, which is the nearest thing a thread has to a
   * place, or nothing at all.
   */
  const placeOf = useCallback(
    (id: string | null): string => {
      if (!id) return ''
      if (lanes.length) {
        const lane = laneOf(id)
        return lane ? laneLabel(lane) : 'UNASSIGNED'
      }
      const home = state?.attachments[rootOf(id)] ?? state?.attachments[id]
      if (!home) return ''
      const cut = home.lastIndexOf('/')
      return folderLabel(cut === -1 ? '' : home.slice(0, cut))
    },
    [lanes, laneOf, state, rootOf]
  )

  /**
   * A CHAT TAB'S NAME, KEPT IN STEP WITH THE THREAD.
   *
   * The rail reads the index and the tab did not, so the two drifted the moment
   * anything named a thread after its tab was made: the CLI writes its own name
   * into the transcript a beat after the first turn lands, the rail row picked
   * it up on the next sweep, and the tab went on wearing the opening line of the
   * message that started it — for the life of the app, since nothing else ever
   * reset a live tab's title. Reopening the thread showed the real name, which
   * is what made it look as if the tab updated for no reason.
   *
   * The order of authority is the same one `tabContent` and a restored tab both
   * use: OUR name first — a rename, or one the namer chose — then the thread's
   * own, under its root and then its own id. A thread with neither keeps
   * whatever stand-in the tab already has, so this cannot swap the opening line
   * you just typed for the same line cut differently.
   */
  useEffect(() => {
    if (!threads.length) return
    const over = state?.titleOverrides ?? {}
    const byId = new Map(threads.map((t) => [t.id, t]))
    setPanes((prev) => {
      let any = false
      const next = prev.map((pane) => {
        let hit = false
        const tabs = pane.tabs.map((t) => {
          if (t.kind !== 'chat') return t
          const rec = byId.get(t.id)
          if (!rec) return t
          const real = over[rec.root] ?? over[t.id] ?? (rec.named ? rec.title : null)
          if (!real || real === t.title) return t
          hit = true
          any = true
          return { ...t, title: real, provisional: false }
        })
        return hit ? { ...pane, tabs } : pane
      }) as [PaneState, PaneState]
      return any ? next : prev
    })
  }, [threads, state?.titleOverrides])

  useEffect(() => {
    if (!allNotes.length) return
    const byPath = new Map(allNotes.map((n) => [n.path, n.title]))
    noteTitles.current = byPath
    setPanes((prev) => {
      let any = false
      const next = prev.map((pane) => {
        let hit = false
        const tabs = pane.tabs.map((t) => {
          if (t.kind !== 'note' || t.hydrated) return t
          const real = byPath.get(t.id)
          if (!real || real === t.title) return t
          hit = true
          any = true
          return { ...t, title: real }
        })
        return hit ? { ...pane, tabs } : pane
      }) as [PaneState, PaneState]
      return any ? next : prev
    })
  }, [allNotes])


  /** Every path the vault actually holds, for deciding whether one still does. */
  const notePaths = useMemo(() => new Set(allNotes.map((n) => n.path)), [allNotes])

  /**
   * The note both rails are about. A pane showing a chat still has one, which
   * is what keeps the navigator from blanking every time you look at a
   * conversation — and the fallbacks are a ladder from certain to merely
   * likely:
   *
   * the note in the focused pane · the note that chat was started on · the note
   * that chat is most about, as the index ranks it · a note open in the other
   * pane · the vault's most recently edited note.
   *
   * The design's model gives every chat exactly one note, so its own fallback
   * stops at the second rung. Ours touch many and some were started in a
   * terminal with no attachment at all, so the ranking carries the weight the
   * attachment cannot — and the last rung means the rail is never empty on a
   * fresh launch.
   */
  const focusNote = useMemo((): string | null => {
    // Checked against the note list itself, not against `noteTitles` — that is
    // a ref an effect fills, and an effect commits *after* the render whose memo
    // wants it. On the pass where the note list first lands, the ref is still
    // empty, so both of the good rungs below would be skipped and the rail would
    // settle on whatever was edited most recently instead of the note the chat
    // was started on.
    const known = (path: string | undefined | null): string | null =>
      path && notePaths.has(path) ? path : null

    // An empty pane skips the two rungs that need a tab to read, and falls
    // through to the ones that do not. Returning null here instead would blank
    // the whole note side the moment a pane happened to be empty, which is the
    // opposite of what this ladder exists for.
    const here = activeTab(panes[focus])
    if (here?.kind === 'note') return here.id
    if (here) {
      const attached = known(state?.attachments[here.id])
      if (attached) return attached
      const ranked = known(linked.find((n) => noteTitles.current.has(n.path))?.path)
      if (ranked) return ranked
    }

    const beside = panes
      .flatMap((pane) => pane.tabs)
      .filter((t) => t.kind === 'note')
      .map((t) => t.id)
    if (beside.length) return beside[0]

    let newest: NoteEntry | null = null
    for (const n of allNotes) if (!newest || n.edited > newest.edited) newest = n
    return newest?.path ?? null
  }, [panes, split, focus, state?.attachments, linked, allNotes, notePaths])


  /*
   * The note pane's backlinks and its chats, for the details panel's LINKED FROM
   * section. Fetched against the note actually showing in pane 1, because that
   * is the only place a note can be.
   */
  const detailNote = noteTab?.kind === 'note' ? noteTab.id : null
  useEffect(() => {
    if (!detailNote) {
      setNoteBacklinks({ out: [], back: [] })
      setNoteChats([])
      return
    }
    let live = true
    void window.lanes.noteLinks(detailNote).then((l) => live && setNoteBacklinks(l))
    void window.lanes.chatsOfNote(detailNote).then((c) => live && setNoteChats(c))
    return () => {
      live = false
    }
  }, [detailNote, allNotes, indexVersion])


  /**
   * The focused note as the navigator needs it. Synthesised rather than looked
   * up when the note list has not landed: the rail is the first thing on screen
   * and a blank subject for a second reads as a bug, not as loading.
   */

  /**
   * The focused note's chats, with the ones that have not sent folded in. Those
   * have no transcript, so the index cannot summarise them and does not try —
   * but they are on screen as tabs, and the rail is the first place the person
   * who just started one looks.
   */

  /** Every chat with a tab anywhere — the sidebar marks all of them, not just the two on screen. */
  /**
   * Identity only — never contents. Restoring a strip is a handful of transcript
   * reads, and only for what is actually on screen.
   */
  useEffect(() => {
    if (!state) return
    const shape: [SavedTab[], SavedTab[]] = [
      panes[0].tabs.filter((t) => !t.fresh).map((t) => ({ kind: t.kind, id: t.id, pinned: t.pinned })),
      panes[1].tabs.filter((t) => !t.fresh).map((t) => ({ kind: t.kind, id: t.id, pinned: t.pinned }))
    ]
    const active: [number, number] = [
      Math.min(panes[0].active, Math.max(0, shape[0].length - 1)),
      Math.min(panes[1].active, Math.max(0, shape[1].length - 1))
    ]
    if (
      JSON.stringify(shape) === JSON.stringify(state.tabs) &&
      JSON.stringify(active) === JSON.stringify(state.activeTab) &&
      split === state.split
    ) {
      return
    }
    patch({ tabs: shape, activeTab: active, split })
    // `patch` and `state` would re-fire this on every keystroke elsewhere.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [panes, split])


  // Hooks run before the `!state` guard below: a hook placed after an early
  // return is called on some renders and not others, which is exactly the
  // "rendered more hooks than during the previous render" crash.
  const marks = state?.marks ?? EMPTY_MARKS
  /**
   * What an empty pane offers. Computed once for both panes and filtered by
   * role inside each: the note pane offers notes, the thread pane threads, and
   * neither ever offers the other's kind — that is the same rule the panes
   * themselves keep.
   */
  const emptyRows = useMemo(() => {
    const starredNotes: EmptyRow[] = marks
      .filter((p) => notePaths.has(p))
      .slice(0, 4)
      .map((p) => ({
        kind: 'note' as const,
        id: p,
        // Falls back to the filename: a starred note whose title has not been
        // read yet still has to say something on its row.
        label: noteTitles.current.get(p) ?? (p.split('/').pop() ?? p).replace(/\.md$/, ''),
        meta: ''
      }))
    // The empty note pane leads with the note the open thread is actually
    // about — the attachment it was started on, else the one the touched-notes
    // index ranks it most about. Recency is the fallback, not the answer.
    const recentNotes: EmptyRow[] = [...allNotes]
      .sort((a, b) => {
        if (a.path === focusNote) return -1
        if (b.path === focusNote) return 1
        return b.edited - a.edited
      })
      .slice(0, 4)
      .map((n) => ({
        kind: 'note' as const,
        id: n.path,
        label: n.title,
        meta: n.path === focusNote ? 'in context' : ago(n.edited)
      }))
    const starredChats: EmptyRow[] = oneEach
      .filter((t) => marks.includes(t.id))
      .slice(0, 4)
      .map((t) => ({
        kind: 'chat' as const,
        id: t.id,
        label: t.title,
        meta: age(t.touched),
        waiting: t.state.startsWith('left mid-thought')
      }))
    const recentChats: EmptyRow[] = oneEach
      .slice(0, 4)
      .map((t) => ({
        kind: 'chat' as const,
        id: t.id,
        label: t.title,
        meta: age(t.touched),
        waiting: t.state.startsWith('left mid-thought')
      }))
    return { starredNotes, starredChats, recentNotes, recentChats }
  }, [marks, allNotes, oneEach, notePaths, focusNote])
  /*
   * A NOTE MADE AND NEVER WRITTEN IN goes, once it is no longer open anywhere.
   * ⌘N is cheap on purpose, and a thought abandoned before its first word
   * should not leave `untitled-7.md` in the vault for somebody to find and
   * wonder about. Only an untitled note, only an empty one — nothing but its
   * title line, with no title typed — and to the system Trash, from where it
   * can be had back.
   */
  const openNotes = useRef(new Set<string>())
  useEffect(() => {
    const now = new Set<string>()
    for (const pane of panes) for (const t of pane.tabs) if (t.kind === 'note' && t.id) now.add(t.id)
    const was = openNotes.current
    openNotes.current = now
    for (const path of was) {
      if (now.has(path) || !UNTITLED.test(path) || saves.current.has(path)) continue
      const body = noteCacheRef.current[path]?.body
      if (body === undefined || body.replace(/^#[^\S\n]*$/m, '').trim()) continue
      void window.lanes.noteTrash(path).then((r) => {
        if (r.ok) setAllNotes((prev) => prev.filter((n) => n.path !== path))
      })
    }
  }, [panes])

  /*
   * The rail's callbacks, made STABLE — each one a wrapper that calls whatever
   * the latest render handed it. The rail is memoised on its data; if it were
   * handed these closures directly it would either redraw on every render
   * (fresh closures never compare equal) or, skipped, keep calling closures from
   * the render it last drew in. The tree view's rows learned the second the hard
   * way once already (see checks/target-pane.js). With the wrappers neither can
   * happen: a skipped redraw still acts on the present.
   */
  const railLatest = useRef<Record<string, unknown>>({})
  const railStable = useRef<Record<string, (...a: never[]) => unknown>>({})
  const rf = <F extends (...a: never[]) => unknown>(key: string, fn: F): F => {
    railLatest.current[key] = fn
    return (railStable.current[key] ??= ((...a: never[]) =>
      (railLatest.current[key] as F)(...a)) as F) as F
  }

  /*
   * What the rail draws, deferred. The rail is the most expensive thing in the
   * window to render, and none of it has to be on screen in the same frame as
   * a note opening or a keystroke landing — so it takes these values a render
   * later when the window is busy, and React draws it in the gap.
   */
  const railThreads = useDeferredValue(oneEach)
  const railNotes = useDeferredValue(allNotes)
  const railShowing = useDeferredValue(
    panes
      .map((pane) => {
        const t = activeTab(pane)
        return t ? `${t.kind}:${t.id}` : ''
      })
      .join('\n')
  )
  const railShown = useMemo(
    () =>
      railShowing
        .split('\n')
        .filter(Boolean)
        .map((s) => ({ kind: s.slice(0, s.indexOf(':')), id: s.slice(s.indexOf(':') + 1) })),
    [railShowing]
  )

  if (!state) return <div style={{ height: '100vh', background: 'var(--desk)' }} />

  /**
   * Where a new note lands when its name carries no folder of its own: one
   * place, set once. It used to be "beside the note you are reading", which
   * meant a note made in a hurry landed wherever you happened to be — and the
   * hurried notes are exactly the ones you later have to go looking for. A
   * folder kept read only is never it. See `newNoteHome`.
   */
  const noteInto = newNoteHome(state)

  /**
   * Whether a turn is running anywhere — a tab in front or behind it, a path
   * left answering, a scheduled run. What switching the vault would stop, so
   * Settings asks first.
   */
  const turnRunning =
    panes.some((pane) => pane.tabs.some((t) => Boolean(t.pending))) ||
    Object.values(awayNow).includes('answering') ||
    Object.values(state.runs ?? {}).some((r) => r.outcome === 'running')

  /*
   * The details panel's contents.
   *
   * This is the surface the touched-notes index has been waiting for. A thread
   * lists NOTES IN CONTEXT — what it actually read, wrote and mentioned, ranked
   * by the index rather than asserted by hand. A note lists LINKED FROM: the
   * notes that wikilink to it, and the threads that touched it.
   */
  const chatLinkRows: LinkRow[] = linked.slice(0, 6).map((n) => ({
    kind: 'NOTE',
    title: noteTitles.current.get(n.path) ?? nameOfPath(n.path),
    meta: n.why,
    onOpen: (newTab: boolean) => void openIn(1, 'note', n.path, { newTab }),
    onMenu: (e: React.MouseEvent) => openCtx(e, 'note', n.path, noteTitles.current.get(n.path) ?? nameOfPath(n.path))
  }))

  const noteLinkRows: LinkRow[] = [
    ...noteBacklinks.back.slice(0, 5).map((n) => ({
      kind: 'NOTE',
      title: n.title,
      meta: folderLabel(n.folder),
      onOpen: (newTab: boolean) => void openIn(1, 'note', n.path, { newTab }),
      onMenu: (e: React.MouseEvent) => openCtx(e, 'note', n.path, n.title)
    })),
    ...noteChats.slice(0, 5).map((t) => {
      const lane = laneOf(t.id)
      return {
        kind: lane ? laneLabel(lane) : 'THREAD',
        title: t.title,
        meta: age(t.touched),
        onOpen: (newTab: boolean) => void openIn(0, 'chat', t.id, { newTab }),
        onMenu: (e: React.MouseEvent) => openCtx(e, 'chat', t.id, t.title)
      }
    })
  ]

  const noteFacts: Fact[] = note
    ? [
        { label: 'Folder', value: folderLabel(note.folder) },
        // The name on disk, which the title only usually matches. The folder is
        // the row above, so this is the last segment alone.
        { label: 'File', value: note.path.slice(note.path.lastIndexOf('/') + 1), whole: true },
        { label: 'Created', value: new Date(note.created).toLocaleDateString() },
        { label: 'Edited', value: ago(note.edited) },
        { label: 'Backlinks', value: String(noteBacklinks.back.length) },
        ...(() => {
          // Tasks as a proportion: how much of this note is actually done.
          const lines = note.body.split('\n')
          const all = lines.filter((l) => /^\s*[-*+]\s+\[[ xX]\]/.test(l)).length
          if (!all) return []
          const done = lines.filter((l) => /^\s*[-*+]\s+\[[xX]\]/.test(l)).length
          return [{ label: 'Tasks', value: `${done} / ${all}`, bar: done / all }]
        })(),
        // The comments still open in it — said only when there are some — and
        // the pass that goes through them.
        ...(() => {
          const n = findComments(note.body).length
          if (!n) return []
          const fact: Fact = { label: 'Comments', value: String(n) }
          if (!note.readOnly) fact.action = { label: 'go through', run: () => void goThrough(note.path) }
          return [fact]
        })()
      ]
    : []

  /**
   * One pane shows THE PANE YOU ARE IN, not always the left one. The roles are
   * unchanged — threads left, notes right — but collapsing the split while
   * reading a note used to drop you back on the thread you had left, which is
   * not what "one pane" was asked for. Everything that opens something sets
   * `focus` to that thing's own pane, so a chat still brings the chat pane back
   * with it.
   */
  /**
   * The empty surface for a pane, in one place: the pane that holds nothing
   * draws it, and so does a blank tab inside a pane that holds something. Two
   * descriptions would be two answers to the same question.
   */
  const emptyFor = (i: PaneIndex): EmptySurface => ({
    role: roleOf(i),
    starred: i === 1 ? emptyRows.starredNotes : emptyRows.starredChats,
    recent: i === 1 ? emptyRows.recentNotes : emptyRows.recentChats,
    pending:
      i === 1 ? openTasks : oneEach.filter((t) => t.state.startsWith('left mid-thought')).length,
    onOpen: (kind, id) => void openIn(i, kind, id),
    onSearch: () => setPalette({ newTab: false }),
    onPending: () => setPalette({ newTab: false, kind: i === 1 ? 'tasks' : 'waiting' }),
    // Notes only: a new thread is ⌘T, which is the press that got you here.
    onNew: i === 1 ? () => void makeUntitled() : undefined
  })

  const shown: PaneIndex[] = split ? [0, 1] : [focus]



  // Back/forward live in the top bar now and act on the focused pane's active
  // tab — one pair for the window, not one per pane.
  const ratio = Math.min(0.8, Math.max(0.2, state.splitRatio))
  /** Each pane measures its own width: the seam can be anywhere between them. */
  const paneWof = (i: PaneIndex): number =>
    paneWidth(vw, {
      hideLeft: state.hideLeft,
      split,
      share: i === 0 ? ratio : 1 - ratio
    })
  // Back and forward are keyboard-only between S1 and S5: they left the top
  // bar with the v2 chrome and their designed home is a pair of carets in the
  // pane head, which S5 builds. ⌘[ and ⌘] are unchanged throughout.
  const navPane: PaneIndex = focus

  return (
    // Provided once at the root: a wikilink's menu is reachable from the
    // transcript and the note reader alike.
    <WikiMenuContext.Provider value={wikiCtx}>
    <FileMenuContext.Provider value={fileMenu}>
    <VaultNamesContext.Provider value={vaultNames}>
    <div
      style={{
        height: '100vh',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        padding: 10,
        gap: 10,
        background: 'var(--desk)'
      }}
    >
      {/*
        38px, sitting on the desk with no surface of its own. The left padding
        clears the traffic lights: the window is `hiddenInset`, so they float
        over our own chrome from x=14 and would otherwise land on the wordmark.
      */}
      <div
        style={{
          height: 38,
          flex: 'none',
          display: 'flex',
          alignItems: 'center',
          padding: '0 6px 0 68px',
          WebkitAppRegion: 'drag'
        } as React.CSSProperties}
      >
        <Wordmark />

        {/* Two spacers, so the pill centres against the whole bar rather than
            against whatever the wordmark left of it. */}
        <div style={{ flex: 1, minWidth: 8 }} />
        <SearchPill onClick={() => setPalette({ newTab: false })} />
        <div style={{ flex: 1, minWidth: 8 }} />

        <div
          style={
            {
              display: 'flex',
              alignItems: 'center',
              gap: 2,
              flex: 'none',
              WebkitAppRegion: 'no-drag'
            } as React.CSSProperties
          }
        >
          <SessionClock
            endsAt={state.sessionEndsAt}
            usage={state.usage}
            onSet={(sessionEndsAt) => patch({ sessionEndsAt })}
          />
          {/* Ours: the original design has no creation story at all, and
              ⌘T / ⌘N need a button to be the place the decision is offered. */}
          <TopChip
            title="New thread or note"
            testId="new-button"
            onClick={() => setNewMenu((v) => !v)}
          >
            <PlusGlyph />
          </TopChip>
          <TopChip
            title={state.hideLeft ? 'Show the browser (⌥1)' : 'Hide the browser (⌥1)'}
            on={!state.hideLeft}
            onClick={() => patch({ hideLeft: !state.hideLeft })}
          >
            <BrowseGlyph />
          </TopChip>
          <TopChip
            title={split ? 'One pane (⌘\\)' : 'Two panes side by side (⌘\\)'}
            on={split}
            onClick={toggleSplit}
          >
            <SplitGlyph />
          </TopChip>
          <TopChip
            title={`Appearance: ${state.theme} — click for ${cycleTheme(state.theme)}`}
            on={state.theme === 'auto'}
            onClick={() => patch({ theme: cycleTheme(state.theme) })}
          >
            <AppearanceGlyph theme={state.theme} />
          </TopChip>
          <TopChip title="Settings (⌘,)" onClick={() => setSettingsOpen(true)}>
            <CogGlyph />
          </TopChip>
        </div>
      </div>

      {/* One gutter value everywhere: rail↔pane, pane↔pane, row↔status bar. */}
      <div
        style={{ flex: 1, display: 'flex', minHeight: 0, position: 'relative', gap: 10 }}
        data-ws="1"
      >
        {/*
          One box that slides between 250px and 11px, rather than two
          components swapped by a ternary. The pane beside it is carried by the
          same easing instead of snapping to its new size.
        */}
        <RailShell hidden={state.hideLeft} onShow={() => patch({ hideLeft: false })}>
          <RailMemo
            // What the rail shows lags the rest of the window by a render when
            // the window is busy: opening a note is drawn first, the row that
            // bolds for it a moment later. See RailMemo.
            threads={railThreads}
            notes={railNotes}
            sig={state}
            showingSig={railShowing}
            lanes={lanes}
            mode={state.railMode}
            // Leaving a mode folds it back up. An expansion is a thing you did
            // to answer a question — "what else is in here" — not a shape you
            // chose for the rail, and coming back to RECENT to find yesterday's
            // 150 threads still unfolded is the rail having remembered the
            // wrong thing. The fold is per-visit; the mode is the setting.
            onMode={rf('onMode', (m) => patch({ railMode: m, moreDirs: [] }))}
            marks={state.marks}
            onToggleMark={rf('onToggleMark', (id) =>
              patch({
                marks: state.marks.includes(id)
                  ? state.marks.filter((m) => m !== id)
                  : [...state.marks, id]
              })
            )}
            starredOpen={state.starredOpen}
            onToggleStarred={rf('onToggleStarred', () => patch({ starredOpen: !state.starredOpen }))}
            openDirs={state.openDirs}
            onOpenDirs={rf('onOpenDirs', (dirs) => patch({ openDirs: dirs }))}
            collapsedLanes={state.collapsedFolders}
            onCollapsedLanes={rf('onCollapsedLanes', (l) => patch({ collapsedFolders: l }))}
            moreDirs={state.moreDirs}
            onMoreDirs={rf('onMoreDirs', (dirs) => patch({ moreDirs: dirs }))}
            perBand={Math.max(1, state.perLane)}
            sort={state.notesSort}
            onSort={rf('onSort', (next) => patch({ notesSort: next }))}
            query={query}
            onQuery={rf('onQuery', setQuery)}
            searchRef={searchRef}
            loading={notesLoading}
            laneOfChat={rf('laneOfChat', (id) => laneOf(id))}
            showing={rf('showing', (kind, id) =>
              railShown.some(
                (t) =>
                  // The row is the thread, so any path of it showing is the row
                  // showing — otherwise a thread you are reading loses its bold
                  // the moment you step to another of its paths.
                  t.kind === kind && (kind === 'chat' ? sameThread(t.id, id) : t.id === id)
              )
            )}
            titleOfNote={rf('titleOfNote', (path) => noteTitles.current.get(path) ?? path)}
            onOpen={rf('onOpen', (kind, id, newTab) => {
              void openIn(0, kind, id, { newTab })
              // "Keep the browser open", off: the rail hides again once it has
              // done its job, which is what makes it a browser rather than a
              // permanent column.
              if (!state.flags.railSticky) patch({ hideLeft: true })
            })}
            onContext={rf('onContext', (e, kind, id, title) => openCtx(e, kind, id, title))}
            onDrag={rf('onDrag', (kind, id) => setDrag({ kind, id }))}
            onDragEnd={rf('onDragEnd', () => {
              setDrag(null)
              setDropPane(null)
            })}
            onHide={rf('onHide', () => patch({ hideLeft: true }))}
            update={update}
            onRestartUpdate={rf('onRestartUpdate', () => void window.lanes.updateRestart().then(setUpdate))}
            onCancelUpdate={rf('onCancelUpdate', () => void window.lanes.updateCancel().then(setUpdate))}
            onVisibleOrder={rf('onVisibleOrder', setVisibleOrder)}
          />
        </RailShell>

        {shown.map((i) => {
          const pane = panes[i]
          const tab = activeTab(pane)
          // An empty pane is a destination, not a failure. It names the kind it
          // holds and offers somewhere to go, so it renders instead of a Pane
          // rather than forcing the strip to keep a last tab hostage.
          if (!tab)
            return (
              <EmptyPane
                key={i}
                focused={split ? focus === i : true}
                split={split}
                grow={split ? (i === 0 ? ratio : 1 - ratio) : 1}
                lift={state.flags.paneLift}
                {...emptyFor(i)}
                dropping={dropPane === i}
                onFocus={() => setFocus(i)}
                onDragOver={(e) => {
                  if (!drag) return
                  e.preventDefault()
                  e.dataTransfer.dropEffect = 'move'
                  if (dropPane !== i) setDropPane(i)
                }}
                onDragLeave={(e) => {
                  if (e.currentTarget.contains(e.relatedTarget as Node)) return
                  if (dropPane === i) setDropPane(null)
                }}
                onDrop={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  onPaneDrop(i)
                }}
                seam={
                  split && i === 1 ? (
                    <SplitSeam onRatio={setRatio} />
                  ) : null
                }
              />
            )
          const chatId = tab.kind === 'chat' ? tab.id : null
          const cfg = settingsFor(chatId)
          const at = visibleOrder.findIndex((e) => e.kind === tab.kind && e.id === tab.id)
          return (
            <Pane
              key={i}
              pane={pane}
              tab={tab}
              index={i}
              split={split}
              // Not `focus === i`: with the split closed there is one pane and
              // it is by definition the focused one — it is the one `focus`
              // names, and a lone pane draws no focus ring either way.
              focused={split ? focus === i : true}
              vw={vw}
              lift={state.flags.paneLift}
              empty={emptyFor(i)}
              paneW={paneWof(i)}
              grow={split ? (i === 0 ? ratio : 1 - ratio) : 1}
              onRatio={setRatio}
              textScale={state.textScale}
              composerH={state.composerH}
              onComposerH={(px) => patch({ composerH: px })}
              // Only when the *other* pane is on a note: referencing the note
              // you are looking at from the chat beside it is the whole point.
              refNote={(() => {
                if (!split || tab.kind !== 'chat') return null
                const other = activeTab(panes[(1 - i) as PaneIndex])
                if (!other || other.kind !== 'note') return null
                return { title: noteCache[other.id]?.title ?? other.title, path: other.id }
              })()}
              onReference={() => {
                const other = activeTab(panes[(1 - i) as PaneIndex])
                if (!other || other.kind !== 'note') return
                // A wikilink, not the body: the CLI runs in the vault and can
                // open the path itself, and pasting a whole note into the
                // prompt spends the context window on something already on disk.
                const link = `[[${other.id.replace(/\.md$/, '')}]]`
                const cur = tab.composer
                patchTab(i, {
                  composer: cur ? `${cur.replace(/\s*$/, '')} ${link} ` : `${link} `
                })
              }}
              showCtx={state.flags.showCtx}
              showTools={state.flags.logTools}
              threadPlace={placeOf(chatId)}
              navPosition={
                visibleOrder.length ? (at < 0 ? '–' : `${at + 1}/${visibleOrder.length}`) : ''
              }
              // Starring is about the THREAD, and the rail lists it under its
              // root — so a star set from a row and a star read on a path have
              // to be the same star, or the head shows hollow on a thread the
              // rail shows filled.
              starred={state.marks.includes(rootOf(tab.id))}
              /*
               * What the picker offers: everything, less whatever Settings has
               * put away — plus this thread's OWN model, always, even when it
               * is one of the hidden ones. A picker that cannot show what the
               * thread is set to is a picker that lies about it.
               */
              models={allModels.filter(
                (m) => !state.modelsOff.includes(m.id) || m.id === cfg.model
              )}
              model={cfg.model}
              effort={cfg.effort}
              safety={state.safety}
              elapsed={
                tab.pending
                  ? `${Math.max(0, Math.round((now - tab.pending.started) / 1000))}s`
                  : ''
              }
              measure={state.measure}
              showPlace={state.flags.showLane}
              detailsOpen={details[i]}
              onToggleDetails={() =>
                setDetails((prev) => {
                  const next = prev.slice() as [boolean, boolean]
                  next[i] = !next[i]
                  return next
                })
              }
              facts={
                tab.kind === 'chat'
                  ? [
                      // No lanes, no row for one.
                      ...(lanes.length ? [{ label: 'Lane', value: placeOf(tab.id) }] : []),
                      { label: 'Model', value: allModels.find((m) => m.id === cfg.model)?.name ?? cfg.model },
                      { label: 'Effort', value: cfg.effort.toUpperCase() },
                      { label: 'Turns', value: String(tab.messages.length) },
                      ...(tab.context
                        ? [
                            {
                              label: 'Context',
                              value: `${tokens(tab.context.used)} / ${tokens(tab.context.window)}`,
                              bar: tab.context.used / tab.context.window
                            }
                          ]
                        : [])
                    ]
                  : noteFacts
              }
              linksLabel={tab.kind === 'chat' ? 'NOTES IN CONTEXT' : 'LINKED FROM'}
              links={tab.kind === 'chat' ? chatLinkRows : noteLinkRows}
              canBack={canGo(tab.hist, -1)}
              canForward={canGo(tab.hist, 1)}
              onBack={() => void histGo(i, -1)}
              onForward={() => void histGo(i, 1)}
              starredOf={(t) => state.marks.includes(rootOf(t.id))}
              onCloseOthers={(at) => {
                const { gone } = closeOthersAt(panesRef.current[i], at)
                // Everything closed by hand is reopenable, however many went at
                // once — ⇧⌘T is the undo for this too, not only for one ✕.
                for (const t of (gone ?? []).slice().reverse()) {
                  if (isBlank(t) || (t.kind === 'chat' && t.fresh && !t.messages.length)) continue
                  reopenable.current = [
                    { kind: t.kind, id: t.id, title: t.title, pane: i },
                    ...reopenable.current.filter((r) => !(r.kind === t.kind && r.id === t.id))
                  ].slice(0, 12)
                }
                setPanes((prev) => {
                  const next = prev.slice() as [PaneState, PaneState]
                  const { pane: trimmed, closed } = closeOthersAt(next[i], at)
                  next[i] = trimmed
                  dropSessions(closed, next)
                  return next
                })
              }}
              onToggleStarTab={(at) => {
                // Stars belong to the OBJECT, so this writes the same store the
                // rail's Starred card reads — not the tab's own pin.
                const t = panesRef.current[i].tabs[at]
                if (!t) return
                const star = t.kind === 'chat' ? rootOf(t.id) : t.id
                patch({
                  marks: state.marks.includes(star)
                    ? state.marks.filter((m) => m !== star)
                    : [...state.marks, star]
                })
              }}
              onRevealTab={(at) => {
                const t = panesRef.current[i].tabs[at]
                if (t?.kind === 'note') void window.lanes.reveal(t.id)
              }}
              onRenameTab={(at) => {
                // The field lives in the pane head, which shows the ACTIVE tab
                // — so a right-click on a tab you are not in selects it first,
                // the same way the rail's Rename… opens the thread before it
                // renames it. Notes do not offer the item at all.
                const t = panesRef.current[i].tabs[at]
                if (!t) return
                selectTab(i, at)
                setFocus(i)
                setRenaming(t.id)
              }}
              onSelectTab={(ti) => selectTab(i, ti)}
              onCloseTab={(ti) => closeTabIn(i, ti)}
              /* One field, two things underneath: a thread's name is an
                 override the app keeps, a note's is its heading and its
                 filename. The head does not have to know which. */
              renaming={renaming === tab.id}
              onStartRename={() => setRenaming(tab.id)}
              onRename={(next) => {
                setRenaming(null)
                if (tab.kind === 'chat') renameChat(tab.id, next)
                else if (next.trim()) void renameNoteTo(tab.id, next)
              }}
              onCancelRename={() => setRenaming(null)}
              onMoveNote={() => setMoving(tab.kind === 'note' ? tab.id : null)}
              onReorderTab={(a, b) =>
                setPanes((prev) => {
                  const next = prev.slice() as [PaneState, PaneState]
                  next[i] = moveTab(next[i], a, b)
                  return next
                })
              }
              onTogglePinTab={(ti) =>
                setPanes((prev) => {
                  const next = prev.slice() as [PaneState, PaneState]
                  next[i] = togglePin(next[i], ti)
                  return next
                })
              }
              // The strip's + opens the palette in new-tab mode, which is
              // what its tooltip has always said. ⌘T is the instant new chat;
              // the + is "open something else", and on the note strip a chat
              // is not something it could open anyway.
              onPlus={() => setPalette({ newTab: true })}
              finding={findPane === i}
              findNonce={findNonce}
              findQuery={findQuery.current}
              onFindQuery={(q) => {
                findQuery.current = q
              }}
              onCloseFind={() => setFindPane(null)}
              dropping={dropPane === i}
              onDragOver={(e) => {
                if (!drag) return
                e.preventDefault()
                e.dataTransfer.dropEffect = 'move'
                if (dropPane !== i) setDropPane(i)
              }}
              onDragLeave={(e) => {
                if (e.currentTarget.contains(e.relatedTarget as Node)) return
                if (dropPane === i) setDropPane(null)
              }}
              onDrop={(e) => {
                e.preventDefault()
                e.stopPropagation()
                onPaneDrop(i)
              }}
              onFocus={() => setFocus(i)}
              onPrev={() => flip(i, -1)}
              onNext={() => flip(i, 1)}
              onToggleStar={() => {
                // Threads are starrable too — the Starred card holds both
                // kinds, so a head that refused for one of them was writing to
                // half the store it reads from.
                const star = tab.kind === 'chat' ? rootOf(tab.id) : tab.id
                patch({
                  marks: state.marks.includes(star)
                    ? state.marks.filter((x) => x !== star)
                    : [...state.marks, star]
                })
              }}
              onAction={() => {
                setSplit(false)
                setFocus(0)
              }}
              note={tab.kind === 'note' ? (noteCache[tab.id] ?? null) : null}
              onQuote={(text) =>
                quoteInto(
                  split ? ((1 - i) as PaneIndex) : i,
                  (tab.kind === 'note' ? noteCache[tab.id]?.title : null) ?? 'note',
                  text
                )
              }
              signedOut={signedOut}
              cliMissing={cliMissing}
              onCheckCli={askAuth}
              onWiki={(target, newTab, how) =>
                followWiki(target, tab.kind === 'chat' ? i : undefined, newTab, how?.address)
              }
              onBranch={(at, mode) => void branchFrom(i, at, mode)}
              onGoPath={(id) => void goPath(i, id)}
              busyPath={(id) => awayNow[id] ?? null}
              onSeamMenu={(e, id, label) => {
                e.preventDefault()
                e.stopPropagation()
                const host = document.querySelector('[data-ws]')
                const r = host?.getBoundingClientRect()
                const w = r?.width ?? 1200
                const h = r?.height ?? 800
                setPathCtx({
                  id,
                  label,
                  // A thread's root is the conversation itself, not one of the
                  // ways it went, so it is not something to let go of here.
                  removable: Boolean(state.pathways[id]),
                  x: Math.max(6, Math.min(e.clientX - (r?.left ?? 0), Math.max(6, w - 202))),
                  y: Math.max(6, Math.min(e.clientY - (r?.top ?? 0), Math.max(6, h - 160)))
                })
              }}
              threadOf={rootOf}
              pathNote={(() => {
                if (tab.kind !== 'chat') return ''
                const order = pathOrder(tab.id)
                const at = order.indexOf(tab.id)
                return at < 0 ? '' : `path ${at + 1} of ${order.length}`
              })()}
              onSaveNote={(body) => {
                if (tab.kind === 'note') saveNote(tab.id, body)
              }}
              noteId={tab.kind === 'note' ? noteIdOf(tab.id) : tab.key}
              onCommitTitle={(title) => {
                if (tab.kind === 'note') void commitNoteTitle(tab.id, title)
              }}
              // Its own conflict, not whichever note conflicted last: any number
              // of notes can be held, each until its own person chooses.
              conflict={tab.kind === 'note' && conflicts.has(tab.id)}
              onKeepMine={() => {
                if (tab.kind === 'note') keepMine(tab.id)
              }}
              saveTrouble={tab.kind === 'note' ? saveTrouble[tab.id] : undefined}
              onEditing={(open) => {
                editingNote.current = open
              }}
              onReloadNote={() => {
                if (tab.kind === 'note') reloadNote(tab.id)
              }}
              writing={tab.kind === 'note' ? Boolean(writeOn[noteIdOf(tab.id)]) : false}
              writeSession={tab.kind === 'note' ? (writeOn[noteIdOf(tab.id)] ?? 0) : 0}
              onWriting={(on) => {
                if (tab.kind === 'note') setWriting(tab.id, on)
              }}
              write={{ focus: state.writeFocus, typewriter: state.writeTypewriter }}
              onWrite={(next) => patch({ writeFocus: next.focus, writeTypewriter: next.typewriter })}
              tocPref={tocOff[tab.key]}
              onToc={(shut) => setTocOff((was) => ({ ...was, [tab.key]: shut }))}
              freshNote={freshNote}
              commentLand={commentLand}
              freshChat={freshChat}
              onClearQuote={() => patchTab(i, { quote: null })}
              onImages={(next) => patchTab(i, { images: next })}
              onComposer={(v) => patchTab(i, { composer: v })}
              onSend={() => send(i)}
              onAnswer={(approved) => {
                const ask = tab.ask
                if (!ask) return
                patchTab(i, { ask: null })
                void window.lanes.answer(ask, approved)
                if (approved) patchTab(i, { pending: { verb: 'Steeping', started: Date.now() } })
              }}
              onStop={() => {
                if (chatId) void window.lanes.interrupt(chatId)
                patchTab(i, { pending: null })
              }}
              onModel={(model) => {
                if (!chatId) return
                patch({
                  threadSettings: { ...state.threadSettings, [chatId]: { ...cfg, model } }
                })
                void window.lanes.configure(optionsFor(chatId, { model, fresh: tab.fresh }))
              }}
              onEffort={(effort) => {
                if (!chatId) return
                patch({
                  threadSettings: { ...state.threadSettings, [chatId]: { ...cfg, effort } }
                })
                void window.lanes.configure(optionsFor(chatId, { effort, fresh: tab.fresh }))
              }}
            />
          )
        })}

        {/*
          The note navigator is gone. It was the whole vault of notes in a
          column of its own, and everything it did now has a better home: the
          rail's Folders mode is the tree, its Starred card is what STARRED was,
          the details panel under the pane title carries the identity block and
          its counters, and ⌘K reaches anything none of those surface.
        */}

        {ctx ? (
          <ContextMenu
            ctx={ctx}
            split={split}
            lanes={lanes}
            currentLane={ctx.kind === 'chat' ? (laneOf(ctx.id)?.id ?? null) : null}
            onRename={
              ctx.kind === 'chat'
                ? () => {
                    const id = ctx.id
                    setCtx(null)
                    // Renaming happens in the pane header, so the chat has to be
                    // in a pane first. Already open somewhere counts.
                    const pane = targetPane()
                    const here = panesRef.current[pane].tabs.some(
                      (t) => t.kind === 'chat' && t.id === id
                    )
                    if (!here) void openIn(pane, 'chat', id, { newTab: true })
                    setFocus(pane)
                    setRenaming(id)
                  }
                : null
            }
            marked={state.marks.includes(ctx.id)}
            onRenameNote={() => {
              const id = ctx.id
              setCtx(null)
              if (ctx.kind !== 'note') return
              // The field is in the head, so the note has to be in the pane
              // first — the same move the thread's own Rename… makes.
              const here = panesRef.current[1].tabs.some((t) => t.kind === 'note' && t.id === id)
              if (!here) void openIn(1, 'note', id, { newTab: true })
              setFocus(1)
              setRenaming(id)
            }}
            onMoveNote={() => {
              const id = ctx.id
              setCtx(null)
              if (ctx.kind === 'note') setMoving(id)
            }}
            onTrashNote={() => {
              const id = ctx.id
              setCtx(null)
              if (ctx.kind === 'note') void trashNoteAt(id)
            }}
            onExportPdf={() => {
              const id = ctx.id
              setCtx(null)
              // The note need not be open anywhere — main reads it itself — so
              // there is nothing here to fetch and nothing to repair after.
              if (ctx.kind === 'note') void window.lanes.notePdf(id)
            }}
            onReveal={() => {
              const id = ctx.id
              setCtx(null)
              if (ctx.kind === 'note') void window.lanes.reveal(id)
            }}
            onNewChat={() => {
              const id = ctx.id
              setCtx(null)
              newTabIn(targetPane(), id)
            }}
            onOpen={() => {
              setCtx(null)
              void openIn(0, ctx.kind === 'chat' ? 'chat' : 'note', ctx.id)
            }}
            onOpenNewTab={() =>
              openInPane(0, ctx.kind === 'chat' ? 'chat' : 'note', ctx.id)
            }
            onMoveLane={(lane) => {
              // Under the thread's own id, which is where `laneOf` looks for
              // it: a tab's menu can carry a path, and a lane filed under one
              // would not be found again from any other.
              patch({
                laneOverrides: {
                  ...state.laneOverrides,
                  [ctx.kind === 'chat' ? rootOf(ctx.id) : ctx.id]: lane
                }
              })
              setCtx(null)
            }}
            onToggleMark={() => {
              patch({
                marks: state.marks.includes(ctx.id)
                  ? state.marks.filter((m) => m !== ctx.id)
                  : [...state.marks, ctx.id]
              })
              setCtx(null)
            }}
            onClose={() => setCtx(null)}
          />
        ) : null}

        {pathCtx ? (
          <PathMenu
            target={pathCtx}
            onRead={() => {
              void goPath(0, pathCtx.id)
              setPathCtx(null)
            }}
            onRename={(label) => void namePath(pathCtx.id, label)}
            onTrash={() => {
              void trashPath(pathCtx.id)
              setPathCtx(null)
            }}
            onClose={() => setPathCtx(null)}
          />
        ) : null}

        {fileCtx ? (
          <FileMenu
            target={fileCtx}
            onOpen={(f) => {
              setFileCtx(null)
              void window.lanes.openFound(f.path)
            }}
            onReveal={(f) => {
              setFileCtx(null)
              void window.lanes.revealFound(f.path)
            }}
            onClose={() => setFileCtx(null)}
          />
        ) : null}
      </div>

      <StatusBar
        threads={oneEach.length}
        notes={allNotes.length}
        lanes={lanes.length}
        sweptAt={sweptAt}
      />

      {newMenu ? (
        <NewMenu
          onChat={() => {
            setNewMenu(false)
            newTabIn(navPane)
          }}
          onNote={() => {
            setNewMenu(false)
            void makeUntitled()
          }}
          onClose={() => setNewMenu(false)}
        />
      ) : null}

      {moving ? (
        <MoveNote
          title={noteCache[moving]?.title ?? moving}
          from={noteCache[moving]?.folder ?? moving.split('/').slice(0, -1).join('/')}
          folders={[...new Set(allNotes.map((n) => (n.folder === '.' ? '' : n.folder)))]
            .filter((f) => !isReadOnly(f, state.readOnlyFolders))
            .sort()}
          onMove={(folder) => {
            const id = moving
            setMoving(null)
            void moveNoteTo(id, folder)
          }}
          onClose={() => setMoving(null)}
        />
      ) : null}

      {palette ? (
        <Palette
          threads={oneEach}
          notes={allNotes}
          laneOf={laneOf}
          hasLanes={lanes.length > 0}
          targetFor={(kind) =>
            kind === 'chat' || kind === 'newChat'
              ? 'opens in the thread pane'
              : kind === 'prompt' || kind === 'skill' || kind === 'review'
                ? 'runs in a new thread'
                : kind === 'comment'
                  ? 'opens in the note pane, at it'
                  : 'opens in the note pane'
          }
          prompts={state.prompts}
          review={(() => {
            if (!note || note.readOnly) return null
            const n = findComments(note.body).length
            return n ? { path: note.path, title: note.title, count: n } : null
          })()}
          onReview={(path) => {
            setPalette(null)
            void goThrough(path)
          }}
          onRunPrompt={(id, send) => {
            setPalette(null)
            runPrompt(id, send)
          }}
          skills={skills.filter((s) => !state.skillsOff.includes(s.id))}
          onRunSkill={(id, send) => {
            setPalette(null)
            runSkill(id, send)
          }}
          defaultNewTab={palette.newTab}
          openOf={(kind, id) => openMarks.get(`${kind}:${id}`) ?? null}
          initialKind={palette.kind}
          contentHits={palContent}
          taskHits={palTasks}
          commentHits={palComments}
          onOpenComment={(hit) => {
            setPalette(null)
            void openIn(1, 'note', hit.path, {})
            setCommentLand((was) => ({ path: hit.path, from: hit.from, text: hit.text, n: (was?.n ?? 0) + 1 }))
          }}
          threadHits={palThreads}
          onQueryChange={setPalQuery}
          onClose={() => setPalette(null)}
          newInto={noteInto}
          onCreateNote={(name) => {
            setPalette(null)
            // Nothing typed: a note with no name yet, exactly what ⌘N makes.
            // The name is the first thing asked for once it is open, in its
            // own title — not a question standing between you and the page.
            if (!name.trim()) {
              void makeUntitled()
              return Promise.resolve(null)
            }
            return createNote(name, noteInto)
          }}
          onCreateChat={(seed) => {
            setPalette(null)
            // The pane argument is advisory everywhere else and advisory here:
            // a thread belongs in the thread pane whichever one you were in.
            newTabIn(targetPane(), undefined, seed)
          }}
          onPick={(kind, id, newTab) => {
            setPalette(null)
            void openIn(targetPane(), kind, id, { newTab })
          }}
        />
      ) : null}

      {/* ⌘, opens the panel. The full surface is one row further in — those are
          settings you set once, these are the ones you reach for. */}
      {settingsOpen ? (
        <SettingsPanel
          state={state}
          patch={patch}
          setFlag={(k) => patch({ flags: { ...state.flags, [k]: !state.flags[k] } })}
          onMore={() => {
            setSettingsOpen(false)
            setMoreSettings(true)
          }}
          onClose={() => setSettingsOpen(false)}
        />
      ) : null}

      {moreSettings ? (
        <Settings
          state={state}
          models={models}
          lanes={lanes}
          vault={vault}
          turnRunning={turnRunning}
          folders={laneFolders}
          // Counted as the rail counts a lane's band: one row per family, in
          // the lane it was moved to or the one its notes put it in.
          threadsIn={(id) => oneEach.filter((t) => laneOf(t.id)?.id === id).length}
          skills={skills}
          patch={patch}
          onSkillsChanged={() => void window.lanes.skills().then(setSkills)}
          onRunPrompt={(id) => {
            setMoreSettings(false)
            runPrompt(id, true)
          }}
          onOpenThread={(sessionId) => {
            setMoreSettings(false)
            void openIn(paneFor('chat'), 'chat', sessionId)
          }}
          onClose={() => setMoreSettings(false)}
        />
      ) : null}

    </div>
    </VaultNamesContext.Provider>
    </FileMenuContext.Provider>
    </WikiMenuContext.Provider>
  )
}

/**
 * Rebuilds both strips from the state file. Tabs come back as identity with a
 * title and nothing else — `hydrated: false` — so the strip is fully labelled
 * on the first frame while only the two visible tabs cost a read.
 *
 * A chat whose transcript has gone is dropped rather than restored onto an id
 * nothing answers to; the same guard the last-visited thread has always had.
 */
function restoreTabs(
  state: AppState,
  threads: ThreadSummary[]
): [PaneState, PaneState] | null {
  const live = new Set(threads.map((t) => t.id))
  // Our own name wins here too, or a restored tab reverts to the transcript's
  // first-sixty-characters fallback until something else renames it.
  const over = state.titleOverrides ?? {}
  // Keyed through the family: a SavedTab persists whichever PATH was on screen,
  // and a thread's name is kept under its root — so a tab restored onto a path
  // came back wearing the CLI's own opening-line fallback instead of its name.
  const titles = new Map(threads.map((t) => [t.id, over[t.root] ?? over[t.id] ?? t.title]))
  const make = (t: SavedTab): TabState => ({
    ...emptyTab(),
    key: tabUid(),
    kind: t.kind,
    id: t.id,
    fresh: false,
    hydrated: false,
    // Restored from a transcript that has a title of its own, so there is
    // nothing here for the namer to improve.
    provisional: false,
    pinned: Boolean(t.pinned),
    // A note's real title needs the note list, which is still loading; the
    // filename stands in for the second or so until it lands.
    title:
      t.kind === 'chat'
        ? (titles.get(t.id) ?? 'New thread')
        : (t.id.split('/').pop() ?? t.id).replace(/\.md$/, ''),
    hist: { stack: [{ kind: t.kind, id: t.id, title: titles.get(t.id) ?? t.id }], i: 0 }
  })

  // Sorted by KIND, not by the pane the tab was saved under. Panes are
  // role-assigned now, so a v2 state file — where either strip could hold
  // either kind — has to be re-filed rather than restored verbatim, or the
  // first frame would already break the rule every open keeps.
  const saved = [...(state.tabs?.[0] ?? []), ...(state.tabs?.[1] ?? [])]
  const seen = new Set<string>()
  const kept = saved.filter((t) => {
    if (t.kind === 'chat' && !live.has(t.id)) return false
    const key = `${t.kind}:${t.id}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
  if (!kept.length) return null

  // Which tab was in front in each of the saved strips. Kept so a restore lands
  // where you left it rather than always on the first tab.
  const wasActive = new Set<string>()
  for (const pane of [0, 1] as const) {
    const strip = state.tabs?.[pane] ?? []
    const at = strip[state.activeTab?.[pane] ?? 0]
    if (at) wasActive.add(`${at.kind}:${at.id}`)
  }

  const build = (kind: TabKind): PaneState => {
    // Pinned FIRST, then cap. Capping first would let six loose tabs crowd out
    // a pinned one — the exact tab the reader asked the app to keep.
    const mine = kept
      .filter((t) => t.kind === kind)
      .sort((a, b) => Number(Boolean(b.pinned)) - Number(Boolean(a.pinned)))
      .slice(0, MAX_TABS)
    const tabs = mine.map(make)
    const at = mine.findIndex((t) => wasActive.has(`${t.kind}:${t.id}`))
    return { tabs, active: at < 0 ? 0 : at }
  }

  const chats = build('chat')
  // The chat pane is never empty at rest: with nothing to restore it opens on
  // a new chat, which is what ⌘T would have given you anyway.
  return [chats.tabs.length ? chats : emptyPane(), build('note')]
}
