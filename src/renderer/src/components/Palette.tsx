import { useEffect, useMemo, useRef, useState } from 'react'
import type {
  CommentHit,
  LaneDef,
  NoteEntry,
  NoteHit,
  SavedPrompt,
  SkillDef,
  TaskHit,
  ThreadHit,
  ThreadSummary
} from '@shared/types'
import { fold, parseQuery, rank, PHRASE } from '@shared/find'
import { firstLine } from '@shared/prompts'
import { describe } from '@shared/schedule'
import { age } from '../lib/format'
import { laneLabel } from '@shared/lanes'
import { CommentGlyph } from './Comments'

/**
 * What a tab holding this thing is doing — the same three facts its glyph in
 * the strip draws. Null for something no tab holds.
 */
export interface OpenMark {
  answering: boolean
  unseen: boolean
}

export type PalKind = 'all' | 'chats' | 'notes' | 'tasks' | 'comments' | 'waiting' | 'prompts'
export type PalSort = 'recent' | 'az' | 'folder'

export interface PalRow {
  /**
   * `new` and `newChat` are not things to open — they are the offers to MAKE
   * one, which is the other half of what a launcher is for. `task` is an open
   * `- [ ]` line inside a note, which opens the note that holds it. `prompt`
   * is a saved prompt and `skill` one of the vault's skills, and ↵ RUNS either.
   * `review` is the pass over the comments of the note in front, run the same way.
   * `comment` is an open comment in a note, which opens the note at it.
   */
  kind: 'chat' | 'note' | 'new' | 'newChat' | 'task' | 'prompt' | 'skill' | 'review' | 'comment'
  id: string
  title: string
  sub: string
  /** What FOLDER sorts on: a note's folder, or the folder of the lane a chat is in. */
  group: string | null
  /** Sort key for RECENT — touched for a chat, mtime for a note. */
  at: number
  /**
   * When it last changed, where that is KNOWN — what the row prints. Not `at`:
   * `at` is only a sort key, and for a note newer than the list it is a
   * stand-in (`now`) that would print as `1s` about a note nobody has dated.
   */
  changed?: number
  /** A scheduled prompt's schedule, `WEEKDAYS 06:00` — when it next runs by itself. */
  when?: string
  /** Matched on its text rather than its name; `sub` is the matching line. */
  byText?: boolean
  /**
   * How well the NAME answered: the phrase itself, or its words scattered
   * through. Sorted on before anything else, so typing a title in order still
   * puts that title first.
   */
  hit?: number
}

interface Props {
  /**
   * The filter the palette opens on. The empty pane's counted chip says
   * "3 waiting on you" — the palette then has to open showing those three, not
   * everything.
   */
  initialKind?: PalKind
  threads: ThreadSummary[]
  notes: NoteEntry[]
  laneOf: (id: string) => LaneDef | null
  /** Whether there are lanes at all. With none, a thread's row names none — not even UNATTACHED. */
  hasLanes: boolean
  /** "opens in pane B" — the footer always says where ↵ lands. */
  /**
   * Where ↵ will land the CURRENT selection. It depends on the row's kind, not
   * on which pane has focus: panes are role-assigned, so a thread and a note
   * picked from the same list go to different places.
   */
  targetFor: (kind: PalRow['kind']) => string
  /** Opened from a tab strip's `+`, where a new tab is the point. */
  defaultNewTab: boolean
  /**
   * Whether a tab holds this already, and what it is doing. A thread is asked
   * by the id the palette lists it under — its family's root — so a path of it
   * open in a tab answers for the row.
   */
  openOf: (kind: 'chat' | 'note', id: string) => OpenMark | null
  /** Notes matching on their text, fetched by App as the query settles. */
  contentHits: NoteHit[]
  /** Open tasks matching the query, from the same index pass. */
  taskHits: TaskHit[]
  /** Open comments: matching the query, or every one with nothing typed. */
  commentHits: CommentHit[]
  /** A comment, opened: its note, at it. */
  onOpenComment: (hit: CommentHit) => void
  /** Threads matching on what was SAID in them, fetched alongside the rest. */
  threadHits: ThreadHit[]
  onQueryChange: (q: string) => void
  onClose: () => void
  /** A task opens as the note that holds it — that is where its line lives. */
  onPick: (kind: 'chat' | 'note', id: string, newTab: boolean) => void
  /** The prompts kept in Settings — found by their names after a `/`. */
  prompts: SavedPrompt[]
  /** Runs one: sent at once, or — `send` false — left in a new thread's composer. */
  onRunPrompt: (id: string, send: boolean) => void
  /** The vault's skills that are switched on — each one `/id`, with no setup. */
  skills: SkillDef[]
  onRunSkill: (id: string, send: boolean) => void
  /** The note in front, while it has comments open: its pass is offered here. */
  review: { path: string; title: string; count: number } | null
  onReview: (path: string) => void
  /**
   * Makes a note from what was typed and opens it. Resolves with a reason when
   * it refused — a name already taken, the inbox — and null when it made one.
   */
  onCreateNote: (name: string) => Promise<string | null>
  /**
   * Starts a thread with what was typed already in the composer, unsent. A
   * thread has no name until its first message earns one, so this is the only
   * thing "a new thread called X" can mean.
   */
  onCreateChat: (seed: string) => void
  /** Where a name with no folder of its own lands, so the row can say. */
  newInto: string
}

const LIMIT = 40
/**
 * A note's file, said where its folder used to be: `garden/compost-bays.md`.
 * The title is often prose the note gave itself, and the name on disk is what
 * the CLI, Finder and every other app call it — so the row carries both.
 */
const fileOf = (path: string): string => path.slice(path.lastIndexOf('/') + 1)
/**
 * Held back for text matches when there are any, so names cannot crowd them
 * out. Three sources share it now — a note's text, a thread's, and open tasks —
 * so it is wider than the eight it was when only the vault had one.
 */
const TEXT_SLOTS = 12

/**
 * Folded haystacks, remembered.
 *
 * Folding is `normalize('NFD')` plus a unicode regex, and this runs over every
 * note and every thread on every keystroke — thousands, in a vault in use. A
 * given string always folds to the same thing, so the answer is worth keeping;
 * dropped whole rather than evicted one at a time, since the cost of being
 * wrong about which entries to keep is a rebuild nobody notices.
 */
const FOLD_MAX = 20_000
let foldCache = new Map<string, string>()
function foldOnce(raw: string): string {
  const had = foldCache.get(raw)
  if (had !== undefined) return had
  const made = fold(raw)
  if (foldCache.size >= FOLD_MAX) foldCache = new Map()
  foldCache.set(raw, made)
  return made
}

export default function Palette(p: Props): React.JSX.Element {
  const [q, setQ] = useState('')
  const [kind, setKind] = useState<PalKind>(p.initialKind ?? 'all')
  const [sort, setSort] = useState<PalSort>('recent')
  const [sel, setSel] = useState(0)
  /** Why the last create was refused — a name already taken, or the inbox. */
  const [createErr, setCreateErr] = useState<string | null>(null)
  const listRef = useRef<HTMLDivElement>(null)

  /*
   * A LEADING `/` ASKS FOR PROMPTS, and only for prompts — Claude Code's own
   * convention for a command. What follows the slash is the name. The PROMPTS
   * filter is the same list for browsing, with nothing typed.
   */
  const slash = q.trimStart().startsWith('/')
  const promptsOnly = slash || kind === 'prompts'

  const rows = useMemo(() => {
    const asked = slash ? q.trimStart().slice(1) : q
    const query = asked.trim().toLowerCase()
    const qq = parseQuery(asked)

    /** Saved prompts matching on their NAME — never on their words, which would match everything. */
    const promptRows = (): PalRow[] => {
      const found: PalRow[] = []
      for (const pr of p.prompts) {
        const row: PalRow = {
          kind: 'prompt',
          id: pr.id,
          title: pr.name,
          sub: firstLine(pr.text),
          group: null,
          at: 0,
          ...(pr.schedule?.on ? { when: describe(pr.schedule) } : {})
        }
        if (query) {
          const got = rank(qq, foldOnce(pr.name))
          if (!got) continue
          row.hit = got
        }
        found.push(row)
      }
      return found.sort(
        (a, b) => (b.hit ?? PHRASE) - (a.hit ?? PHRASE) || a.title.localeCompare(b.title)
      )
    }
    /**
     * The vault's skills, each a row with no setup: `/morning`, its description
     * under it. Matched on the id and the name the skill gives itself. After the
     * kept prompts, which somebody chose to keep.
     */
    const skillRows = (): PalRow[] => {
      const found: PalRow[] = []
      for (const sk of p.skills) {
        const row: PalRow = {
          kind: 'skill',
          id: sk.id,
          title: `/${sk.id}`,
          sub: sk.description,
          group: null,
          at: 0
        }
        if (query) {
          const got = rank(qq, foldOnce(`${sk.id} ${sk.name}`))
          if (!got) continue
          row.hit = got
        }
        found.push(row)
      }
      return found.sort(
        (a, b) => (b.hit ?? PHRASE) - (a.hit ?? PHRASE) || a.title.localeCompare(b.title)
      )
    }
    if (promptsOnly) return promptRows().concat(skillRows()).slice(0, LIMIT)

    let out: PalRow[] = []
    if (kind === 'all' || kind === 'chats' || kind === 'waiting') {
      out = out.concat(
        p.threads.map((t) => {
          const lane = p.laneOf(t.id)
          return {
            kind: 'chat' as const,
            id: t.id,
            title: t.title,
            sub: p.hasLanes ? `${lane ? laneLabel(lane) : 'UNATTACHED'} · ${t.state}` : t.state,
            group: lane ? lane.folder : null,
            at: t.touched,
            changed: t.touched
          }
        })
      )
    }
    if (kind === 'all' || kind === 'notes') {
      out = out.concat(
        p.notes.map((n) => ({
          kind: 'note' as const,
          id: n.path,
          title: n.title,
          sub: n.path,
          group: n.folder === '.' ? '' : n.folder,
          at: n.edited,
          changed: n.edited,
          // Matched on the full path, so a filename finds its note even when the
          // title is prose: `spring-beds-plan` and "Spring beds plan" both work.
          hay: `${n.title} ${n.path}`
        }))
      )
      /*
       * A NOTE NEWER THAN THE LIST is still found by its name. The list is
       * refreshed when the app makes a note and when the sweep sees the vault
       * move — every thirty seconds — so a note Claude has just written is on
       * disk and in main's index, and not in here. The text search already
       * finds it, with its title; without this it could only ever rank as a
       * text hit, under every note whose name happens to share a word with
       * what you typed, and typing a note's exact title would not bring it up.
       * Newer than the list, so newer than anything in it.
       */
      if (query) {
        const listed = new Set(p.notes.map((n) => n.path))
        const now = Date.now()
        for (const h of p.contentHits) {
          if (listed.has(h.path)) continue
          const row: PalRow & { hay: string } = {
            kind: 'note',
            id: h.path,
            title: h.title,
            sub: h.path,
            group: h.folder === '.' ? '' : h.folder,
            at: now,
            hay: `${h.title} ${h.path}`
          }
          out.push(row)
        }
      }
    }
    /*
     * Names, on the one rule the whole app now uses: the phrase if it is there,
     * otherwise every word of it somewhere, in any order. `river notes` was
     * one `includes` of the whole string away from finding nothing at all —
     * including the note actually called "River walks — notes for the essay".
     * Folded too, so `cafe` finds Café in a TITLE and not only in a body, which
     * is where it already worked.
     */
    if (query) {
      const scored: PalRow[] = []
      for (const r of out) {
        const raw = (r as { hay?: string }).hay ?? `${r.title} ${r.sub}`
        const got = rank(qq, foldOnce(raw))
        if (got) scored.push({ ...r, hit: got })
      }
      out = scored
    }
    // WAITING is a filter on state, not a kind of thing: the threads whose last
    // word was yours. Derived, never authored — who spoke last is the only
    // thing an app can honestly know.
    if (kind === 'waiting') out = out.filter((r) => r.kind === 'chat' && /mid-thought/.test(r.sub))
    /*
     * COMMENTS: every open one in the vault, a row each — what it says, and
     * under it its note and what it is about. With nothing typed, all of them,
     * the notes touched last first; typed, the ones whose words, anchor or note
     * match. In ALL, only once something is typed, as text found.
     */
    if (kind === 'comments' || (kind === 'all' && query)) {
      for (const c of p.commentHits) {
        out.push({
          kind: 'comment',
          id: `${c.path}#${c.from}`,
          title: c.text || '(no words)',
          sub: `${c.title} · ${c.anchor ? `on “${c.anchor}”` : 'at a point'}`,
          group: c.folder,
          at: c.edited,
          changed: c.edited,
          // A text match among the others in ALL; the list itself under COMMENTS.
          ...(kind === 'all' ? { byText: true } : {})
        })
      }
    }
    // TASKS indexes the lines inside notes, not the notes themselves.
    if (kind === 'all' || kind === 'tasks') {
      for (const t of p.taskHits) {
        out.push({
          kind: 'task',
          id: t.path,
          title: t.text,
          sub: t.title,
          group: t.folder,
          at: 0,
          byText: true
        })
      }
    }
    /*
     * A THREAD FOUND BY WHAT IT SAYS. The vault's text has been searchable for
     * a while; a thread's was not, and it is the half you more often go back
     * for — the answer about the site visit, the paragraph you wrote in a chat
     * and never moved into a note. `title` comes from the list this palette
     * already holds rather than from the hit, so a thread renamed here is not
     * called something else two rows down.
     */
    if (query && (kind === 'all' || kind === 'chats')) {
      const already = new Set(out.filter((r) => r.kind === 'chat').map((r) => r.id))
      const known = new Map(p.threads.map((t) => [t.id, t]))
      for (const h of p.threadHits) {
        if (already.has(h.id)) continue
        const t = known.get(h.id)
        const lane = p.laneOf(h.id)
        out.push({
          kind: 'chat',
          id: h.id,
          title: t?.title ?? 'thread',
          sub: h.snippet,
          group: lane ? lane.folder : null,
          at: t?.touched ?? 0,
          changed: t?.touched,
          byText: true
        })
      }
    }
    // Text matches come from the main process a moment later and fill in behind
    // the name matches, which are instant.
    if (query && (kind === 'all' || kind === 'notes')) {
      const already = new Set(out.filter((r) => r.kind === 'note').map((r) => r.id))
      const edited = new Map(p.notes.map((n) => [n.path, n.edited]))
      const now = Date.now()
      for (const h of p.contentHits) {
        if (already.has(h.path)) continue
        out.push({
          kind: 'note',
          id: h.path,
          title: h.title,
          sub: `${fileOf(h.path)} · ${h.snippet}`,
          group: null,
          // Not in the list is newer than the list — not the oldest thing here.
          at: edited.get(h.path) ?? now,
          // …but how much newer is not known, so nothing is printed for it.
          changed: edited.get(h.path),
          byText: true
        })
      }
    }
    // Name matches always outrank text matches, whatever the sort: typing a
    // filename must not bury its note under whichever note merely mentions it
    // and happens to have been edited more recently.
    const within =
      sort === 'az'
        ? (a: PalRow, b: PalRow) => a.title.localeCompare(b.title)
        : sort === 'folder'
          ? // Sorted by where a thing lives: a note's folder, and for a chat the
            // project folder its lane names. A row with neither sorts last.
            (a: PalRow, b: PalRow) =>
              (a.group ?? '~~').localeCompare(b.group ?? '~~') || a.title.localeCompare(b.title)
          : (a: PalRow, b: PalRow) => b.at - a.at
    // Name matches first, but text matches keep a few slots of their own: a
    // query like "spring beds" can match dozens of notes by title alone and
    // would otherwise push every text hit past the cap and out of sight.
    // A phrase beats scattered words, then the chosen sort decides. Typing a
    // title in order has to put that title first, whatever RECENT thinks.
    const named = out
      .filter((r) => !r.byText)
      .sort((a, b) => (b.hit ?? PHRASE) - (a.hit ?? PHRASE) || within(a, b))
    const texts = out.filter((r) => r.byText).sort(within)
    /*
     * THREADS and WAITING are whole lists, not a page of one. There are a few
     * hundred threads, not thousands of notes, and "every thread, most recent
     * first" that stops at forty is a list where the forty-first looks
     * missing rather than cut.
     */
    const cap = kind === 'chats' || kind === 'waiting' ? Infinity : LIMIT
    const reserved = Math.min(TEXT_SLOTS, texts.length)
    const found: PalRow[] =
      cap === Infinity
        ? named.concat(texts)
        : named.slice(0, cap - reserved).concat(texts.slice(0, reserved))

    /*
     * THE OFFERS, AND WHERE THEY SIT.
     *
     * They are here whether or not anything has been typed. ⌘K is the one
     * gesture that reaches everything this app holds, and a launcher that can
     * only MAKE something once you have typed a name is a launcher you have to
     * know a trick to use — the two things you reach for most often, a fresh
     * thread and a fresh note, were behind an arbitrary first keystroke.
     *
     * With a QUERY they go last: the found rows are the answer, ↵ belongs to
     * them, and a row that makes a file must not be what a stray return key
     * hits. (When nothing matched they are all there is, so ↵ finds them
     * anyway — which is the case they were written for.)
     *
     * With NOTHING TYPED they go first, because there is no answer for ↵ to
     * belong to: the list below is only "everything, most recent first", and an
     * offer buried under forty of those is an offer nobody meets. The selection
     * still rests on the first real row (see `firstPick`), so ⌘K ↵ opens what
     * it always opened and nothing is made by accident.
     *
     * And a nameless offer is a different offer. "New note" with no name is what
     * ⌘N makes — an untitled note, open at once, named in its own title; "New
     * thread" with no name is exactly what ⌘T makes. Typed, they mean what they
     * have always meant.
     */
    const offers: PalRow[] = []
    if (kind === 'all' || kind === 'chats') {
      offers.push({
        kind: 'newChat',
        id: q.trim(),
        title: q.trim(),
        sub: query ? 'ready to send, not sent' : 'empty, with the caret in it',
        group: null,
        at: 0
      })
    }
    if (kind === 'all' || kind === 'notes') {
      offers.push({
        kind: 'new',
        id: q.trim(),
        title: q.trim(),
        sub: query ? p.newInto || 'the vault root' : 'untitled — name it in its title',
        group: null,
        at: 0
      })
    }
    /*
     * THE PASS over the note in front, while it has comments: with the other
     * offers, standing above the list with nothing typed — and, typed, when the
     * words ask for it or name the note. It spends a turn and edits the note,
     * so it is never where ↵ rests.
     */
    if (p.review && (kind === 'all' || kind === 'notes')) {
      const r = p.review
      if (!query || rank(qq, foldOnce(`go through comments review ${r.title}`)))
        offers.push({
          kind: 'review',
          id: r.path,
          title: `Go through ${r.count === 1 ? 'the comment' : `${r.count} comments`} in “${r.title}”`,
          sub: 'a new thread: Claude answers, edits the note, and clears what it handled',
          group: null,
          at: 0
        })
    }
    /*
     * A prompt whose name was typed in ALL comes after the offers, at the very
     * foot. A run spends a turn and may write to the vault, so it is never the
     * row a stray ↵ lands on, and typing a note's name still opens the note.
     */
    const runs = query && kind === 'all' ? promptRows().concat(skillRows()) : []
    return query ? found.concat(offers, runs) : offers.concat(found)
  }, [q, kind, sort, p, slash, promptsOnly])

  /**
   * The rows that are offers rather than answers: never where ↵ rests, and not
   * counted as results. A prompt is an offer in ALL, and the answer after `/`.
   */
  const isRun = (r: PalRow | undefined): boolean => r?.kind === 'prompt' || r?.kind === 'skill' || r?.kind === 'review'
  const isOffer = (r: PalRow): boolean =>
    r.kind === 'new' || r.kind === 'newChat' || r.kind === 'review' || (isRun(r) && !promptsOnly)
  /**
   * Where ↵ rests when the list is rebuilt: the first row that is a FOUND
   * thing rather than an offer. With a query that is row 0 and nothing changes.
   * With nothing typed it steps past the offers standing above the list, so
   * they are in plain sight without being what the return key does.
   */
  const firstPick = Math.max(
    0,
    rows.findIndex((r) => !isOffer(r))
  )

  useEffect(() => setSel(firstPick), [q, kind, sort, firstPick])

  /*
   * HOVER ONLY COUNTS ONCE THE POINTER HAS MOVED.
   *
   * A row highlights on `mouseenter`, and `mouseenter` fires when the ROW moves
   * under a stationary cursor just as readily as when the cursor moves onto the
   * row. So opening ⌘K with the pointer anywhere over the middle of the screen
   * put the selection on whatever row happened to land under it, and typing did
   * it again on every keystroke — the answer to "what does ↵ do" became "wherever
   * you left the mouse". Disarmed whenever the list is rebuilt, armed by a real
   * pointer movement, which is the rule every menu uses.
   */
  const moved = useRef(false)
  useEffect(() => {
    moved.current = false
    const arm = (): void => {
      moved.current = true
    }
    window.addEventListener('mousemove', arm)
    return () => window.removeEventListener('mousemove', arm)
  }, [q, kind, sort])
  useEffect(() => setCreateErr(null), [q])

  const matches = rows.filter((r) => !isOffer(r)).length
  const selRow = rows[sel]
  const selOpen =
    selRow && (selRow.kind === 'chat' || selRow.kind === 'note') ? p.openOf(selRow.kind, selRow.id) : null
  // A name after `/` is looked for among the prompts alone; nothing in the
  // vault's text or the threads' is worth a search for it.
  useEffect(() => p.onQueryChange(promptsOnly ? '' : q), [q, p, promptsOnly])

  useEffect(() => {
    const el = listRef.current?.children[sel] as HTMLElement | undefined
    el?.scrollIntoView({ block: 'nearest' })
  }, [sel])

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.preventDefault()
        p.onClose()
        return
      }
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault()
        if (!rows.length) return
        const d = e.key === 'ArrowDown' ? 1 : -1
        setSel((i) => (i + d + rows.length) % rows.length)
        return
      }
      if (e.key === 'Enter') {
        e.preventDefault()
        const r = rows[sel]
        if (!r) return
        // ↵ runs it; ⇧↵ puts its words in a new thread to change first.
        if (r.kind === 'prompt') {
          p.onRunPrompt(r.id, !e.shiftKey)
          return
        }
        if (r.kind === 'skill') {
          p.onRunSkill(r.id, !e.shiftKey)
          return
        }
        if (r.kind === 'review') {
          p.onReview(r.id)
          return
        }
        if (r.kind === 'comment') {
          const hit = p.commentHits.find((c) => `${c.path}#${c.from}` === r.id)
          // ⇧↵ is the note's pass; ↵ the note, at the comment.
          if (hit && e.shiftKey) p.onReview(hit.path)
          else if (hit) p.onOpenComment(hit)
          return
        }
        if (r.kind === 'new') {
          void p.onCreateNote(r.id).then((reason) => setCreateErr(reason))
          return
        }
        if (r.kind === 'newChat') {
          p.onCreateChat(r.id)
          return
        }
        p.onPick(r.kind === 'chat' ? 'chat' : 'note', r.id, e.metaKey || e.ctrlKey || p.defaultNewTab)
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [rows, sel, p])

  const seg = <T extends string>(
    items: [T, string][],
    now: T,
    set: (v: T) => void
  ): React.JSX.Element => (
    <div style={{ display: 'flex', alignItems: 'center', flex: 'none' }}>
      {items.map(([id, label], i) => {
        const on = now === id
        return (
          <div
            key={id}
            data-pal-seg={id}
            data-pal-seg-on={on ? '1' : '0'}
            onClick={() => set(id)}
            style={{
              height: 20,
              padding: '0 8px',
              display: 'flex',
              alignItems: 'center',
              border: `1px solid ${on ? 'var(--ink)' : 'var(--edge)'}`,
              borderRightWidth: i === items.length - 1 ? 1 : 0,
              borderRadius: i === 0 ? '4px 0 0 4px' : i === items.length - 1 ? '0 4px 4px 0' : 0,
              background: on ? 'var(--ink)' : 'transparent',
              color: on ? 'var(--onInk)' : 'var(--ink3)',
              cursor: 'pointer',
              font: '500 8.5px var(--mono)',
              letterSpacing: '.08em'
            }}
          >
            {label}
          </div>
        )
      })}
    </div>
  )

  return (
    <div
      onClick={p.onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 50,
        background: 'var(--veil)',
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        padding: '74px 34px 34px'
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 620,
          maxWidth: '100%',
          maxHeight: '100%',
          background: 'var(--sheet)',
          borderRadius: 6,
          overflow: 'hidden',
          boxShadow: 'var(--sh2)',
          display: 'flex',
          flexDirection: 'column'
        }}
      >
        <div
          style={{
            flex: 'none',
            display: 'flex',
            alignItems: 'center',
            gap: 11,
            padding: '13px 15px',
            borderBottom: '1px solid var(--div)'
          }}
        >
          <div style={{ font: '400 11px var(--mono)', color: 'var(--mute)', flex: 'none' }}>
            ⌘K
          </div>
          <input
            data-palette-input="1"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search notes and chats — / for prompts and skills"
            autoFocus
            style={{ flex: 1, minWidth: 0, font: '400 14px var(--sans)', color: 'var(--ink)' }}
          />
          <div
            style={{
              font: '400 9px var(--mono)',
              color: 'var(--mute)',
              flex: 'none',
              whiteSpace: 'nowrap'
            }}
          >
            {matches}
            {matches === LIMIT && kind !== 'chats' && kind !== 'waiting' ? '+' : ''} {matches === 1 ? 'result' : 'results'}
          </div>
        </div>

        <div
          style={{
            flex: 'none',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '8px 15px',
            borderBottom: '1px solid var(--div)',
            background: 'var(--card)'
          }}
        >
          {/* The original design's five, and ours. Tasks and Waiting are not
              kinds of THING — they are questions: what is open, and what is on
              me. Prompts are
              not things either: they are what you can set going. A typed `/`
              lights PROMPTS, since that is the list it is showing. */}
          {seg<PalKind>(
            [
              ['all', 'ALL'],
              ['chats', 'THREADS'],
              ['notes', 'NOTES'],
              ['tasks', 'TASKS'],
              ['comments', 'COMMENTS'],
              ['waiting', 'WAITING'],
              ['prompts', 'PROMPTS']
            ],
            slash ? 'prompts' : kind,
            setKind
          )}
          <div style={{ flex: 1 }} />
          <div
            style={{
              font: '400 9px var(--mono)',
              letterSpacing: '.1em',
              color: 'var(--mute)',
              flex: 'none'
            }}
          >
            SORT
          </div>
          {seg<PalSort>(
            [
              ['recent', 'RECENT'],
              ['az', 'A–Z'],
              ['folder', 'FOLDER']
            ],
            sort,
            setSort
          )}
        </div>

        <div ref={listRef} style={{ flex: 1, minHeight: 0, overflowY: 'auto', overflowX: 'hidden' }}>
          {rows.map((r, i) => {
            const mark = r.kind === 'chat' || r.kind === 'note' ? p.openOf(r.kind, r.id) : null
            return (
            <div
              key={`${r.kind}:${r.id}:${i}`}
              onClick={(e) => {
                if (r.kind === 'prompt') {
                  p.onRunPrompt(r.id, !e.shiftKey)
                  return
                }
                if (r.kind === 'skill') {
                  p.onRunSkill(r.id, !e.shiftKey)
                  return
                }
                if (r.kind === 'review') {
                  p.onReview(r.id)
                  return
                }
                if (r.kind === 'comment') {
                  const hit = p.commentHits.find((c) => `${c.path}#${c.from}` === r.id)
                  if (hit && e.shiftKey) p.onReview(hit.path)
                  else if (hit) p.onOpenComment(hit)
                  return
                }
                if (r.kind === 'new') {
                  void p.onCreateNote(r.id).then((reason) => setCreateErr(reason))
                  return
                }
                if (r.kind === 'newChat') {
                  p.onCreateChat(r.id)
                  return
                }
                p.onPick(r.kind === 'chat' ? 'chat' : 'note', r.id, e.metaKey || e.ctrlKey || p.defaultNewTab)
              }}
              onMouseEnter={() => {
                if (moved.current) setSel(i)
              }}
              className="pal-row"
              data-pal-on={i === sel ? '1' : '0'}
              data-pal-kind={r.kind}
              data-pal-id={r.id}
              data-pal-open={mark ? '1' : '0'}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '8px 15px',
                // The offers standing above the list close with the heavier
                // rule, so they read as their own band rather than as two
                // strange rows at the top of the recents.
                borderBottom: `1px solid ${
                  isOffer(r) && !isOffer(rows[i + 1] ?? r) ? 'var(--div)' : 'var(--div2)'
                }`,
                background: i === sel ? 'var(--hov)' : 'transparent',
                boxShadow: i === sel ? 'inset 2px 0 0 var(--ink)' : 'none',
                cursor: 'pointer'
              }}
            >
              {r.kind === 'review' || r.kind === 'comment' ? (
                <div style={{ width: 13, height: 13, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--ink)', flex: 'none' }}>
                  <CommentGlyph />
                </div>
              ) : isRun(r) ? (
                // The slash it is asked for by, in the slot the offers' + takes.
                <div
                  style={{
                    width: 13,
                    height: 13,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    font: '400 12px var(--mono)',
                    color: 'var(--ink)',
                    flex: 'none'
                  }}
                >
                  /
                </div>
              ) : r.kind === 'new' || r.kind === 'newChat' ? (
                <div
                  style={{
                    width: 13,
                    height: 13,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    font: '400 13px var(--mono)',
                    color: 'var(--ink)',
                    flex: 'none'
                  }}
                >
                  +
                </div>
              ) : r.kind === 'task' ? (
                // An unchecked box: this row is a task, and it is open.
                <div
                  style={{
                    width: 11,
                    height: 11,
                    borderRadius: 3,
                    boxShadow: 'inset 0 0 0 1.5px var(--rule)',
                    flex: 'none'
                  }}
                />
              ) : r.kind === 'chat' ? (
                /*
                 * An open thread's dot is drawn the way its tab draws it — ink,
                 * blinking mid-turn, ringed while an answer waits unseen — so
                 * the palette and the strip say the same thing in the same
                 * mark. A thread no tab holds keeps the quiet dot.
                 */
                <div
                  data-pal-glyph={
                    mark ? (mark.answering ? 'answering' : mark.unseen ? 'unseen' : 'open') : 'closed'
                  }
                  style={{
                    width: 9,
                    height: 9,
                    borderRadius: 99,
                    background: mark ? 'var(--ink)' : 'var(--dot)',
                    boxShadow: mark?.unseen
                      ? '0 0 0 3px color-mix(in srgb, var(--ink) 13%, transparent)'
                      : undefined,
                    animation: mark?.answering ? 'cursorBlink 1.4s ease-in-out infinite' : undefined,
                    flex: 'none'
                  }}
                />
              ) : (
                // A note has no dot to fill, so its page goes to ink instead.
                <svg
                  data-pal-glyph={mark ? 'open' : 'closed'}
                  width="13"
                  height="13"
                  viewBox="0 0 12 12"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.1"
                  strokeLinejoin="round"
                  style={{ color: mark ? 'var(--ink)' : 'var(--mute)', flex: 'none' }}
                >
                  <path d="M3 1.4h4l2 2v7.2H3z" />
                  <path d="M6.8 1.5v2.1h2.1" />
                </svg>
              )}
              <div
                style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}
              >
                <div
                  style={{
                    font: `${i === sel ? 600 : 500} 12.5px var(--sans)`,
                    color: 'var(--ink)',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis'
                  }}
                >
                  {r.kind === 'new'
                    ? r.title
                      ? `New note “${r.title}”`
                      : 'New note'
                    : r.kind === 'newChat'
                      ? r.title
                        ? `New thread “${r.title}”`
                        : 'New thread'
                      : r.title}
                </div>
                <div
                  style={{
                    font: '400 9px var(--mono)',
                    color: r.kind === 'new' && createErr ? 'var(--ink)' : 'var(--mute)',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis'
                  }}
                >
                  {r.kind === 'new'
                    ? (createErr ??
                      // Nothing typed means nothing to file, so the row says
                      // where it is taking you rather than where it would put
                      // a name it does not have.
                      (r.title ? `in ${r.sub} — or type folder/name` : r.sub))
                    : r.sub}
                </div>
              </div>
              {/* When it last changed, in the rail's own unit, so the two lists
                  cannot disagree about how old something is. Only where that
                  is known — a task, or a note newer than the list, says none. */}
              {r.when ? (
                <div
                  data-pal-when="1"
                  style={{
                    font: '400 9px var(--mono)',
                    letterSpacing: '.06em',
                    color: 'var(--mute)',
                    flex: 'none'
                  }}
                >
                  {r.when}
                </div>
              ) : null}
              {r.changed ? (
                <div
                  data-pal-age="1"
                  title={new Date(r.changed).toLocaleString()}
                  style={{
                    font: '400 9px var(--mono)',
                    color: 'var(--mute)',
                    fontVariantNumeric: 'tabular-nums',
                    flex: 'none'
                  }}
                >
                  {age(r.changed)}
                </div>
              ) : null}
              <div
                style={{
                  font: '500 8px var(--mono)',
                  letterSpacing: '.12em',
                  color: 'var(--mute)',
                  border: '1px solid var(--edge)',
                  borderRadius: 3,
                  padding: '2px 5px',
                  flex: 'none'
                }}
              >
                {r.kind === 'new'
                  ? 'NEW NOTE'
                  : r.kind === 'newChat'
                    ? 'NEW THREAD'
                    : r.kind === 'prompt'
                      ? 'PROMPT'
                      : r.kind === 'review'
                        ? 'PASS'
                      : r.kind === 'comment'
                        ? 'COMMENT'
                      : r.kind === 'skill'
                        ? 'SKILL'
                      : // TEXT means "found inside it" whichever it is: the badge
                      // answers why this row is here, and a thread matched on a
                      // sentence is not the same claim as one matched on its name.
                      r.byText
                      ? 'TEXT'
                      : r.kind === 'chat'
                        ? 'CHAT'
                        : 'NOTE'}
              </div>
            </div>
            )
          })}
          {matches === 0 && rows.length === 0 ? (
            <div
              data-pal-empty="1"
              style={{ padding: '22px 15px', font: '400 11.5px var(--sans)', color: 'var(--mute)' }}
            >
              {/* Asked for prompts and there are none: say where they are made. */}
              {promptsOnly && !p.prompts.length && !p.skills.length
                ? 'No prompts yet — keep one in Settings → Prompts, and it is here after a /.'
                : promptsOnly
                  ? p.skills.length
                    ? 'No prompt or skill by that name.'
                    : 'No prompt by that name.'
                  : 'Nothing matches that.'}
            </div>
          ) : null}
        </div>

        <div
          style={{
            flex: 'none',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            padding: '8px 15px',
            borderTop: '1px solid var(--div)',
            font: '400 9px var(--mono)',
            color: 'var(--mute)'
          }}
        >
          <div data-pal-footer="1" style={{ flex: 'none' }}>
            {/* Something a tab already holds is not opened again, here or in a
                new tab — ↵ and ⌘↵ alike go to that tab — so the line says so. */}
            {selRow?.kind === 'review'
              ? '↑↓ move · ↵ go through them · esc close'
              : selRow?.kind === 'comment'
              ? '↑↓ move · ↵ open it there · ⇧↵ go through its note · esc close'
              : isRun(selRow)
              ? '↑↓ move · ↵ run it · ⇧↵ open it unsent · esc close'
              : selOpen
                ? '↑↓ move · ↵ go to its tab · esc close'
                : `↑↓ move · ↵ open ${p.defaultNewTab ? 'in a new tab' : 'here'} · ⌘↵ new tab · esc close`}
          </div>
          <div style={{ flex: 1 }} />
          <div style={{ flex: 'none' }}>{p.targetFor(rows[sel]?.kind ?? 'note')}</div>
        </div>
      </div>
    </div>
  )
}
