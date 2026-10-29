/** Types shared across the main process, the preload bridge, and the renderer. */

import type { Usage } from './usage'

/**
 * A lane's id: stable across renames, so what is filed under it — overrides,
 * prompts, per-lane caps — keeps its place when the lane's name changes.
 */
export type LaneId = string

/**
 * A lane: a folder of the vault the person named, and a name for it. Lanes are
 * the person's, kept in state; there are none until somebody makes one. Which
 * lane a path is in is src/shared/lanes.ts.
 */
export interface LaneDef {
  id: LaneId
  /** How the lane is called; the chrome sets it in capitals (`laneLabel`). */
  name: string
  /** The vault-relative folder whose notes, and the threads that work on them, are this lane's. */
  folder: string
  /** A line saying what the lane is for, if the person gave one. */
  purpose?: string
}

/**
 * The stored appearance PREFERENCE. `auto` is a real third state, not a
 * checkbox: it defers to the system rather than storing a value.
 */
export type ThemeId = 'dark' | 'light' | 'auto'

/** What the document actually wears. `auto` is resolved before it gets here. */
export type ResolvedTheme = 'dark' | 'light'

/**
 * Retained so a v2 state file still parses. The palette is achromatic now and
 * nothing reads this; the picker goes in S7 and the field in S8.
 */
export type AccentId = 'cobalt' | 'sage' | 'emerald' | 'brass' | 'clay'

/** The marker colour `==highlights==` are drawn in — picked in Settings. */
export type HighlightId = 'yellow' | 'green' | 'blue' | 'pink' | 'purple' | 'grey'
export const HIGHLIGHTS: { id: HighlightId; name: string }[] = [
  { id: 'yellow', name: 'Yellow' },
  { id: 'green', name: 'Green' },
  { id: 'blue', name: 'Blue' },
  { id: 'pink', name: 'Pink' },
  { id: 'purple', name: 'Purple' },
  { id: 'grey', name: 'Grey' }
]

export type EffortId = 'low' | 'mid' | 'high' | 'xhigh' | 'max'

export type SafetyId = 'guarded' | 'standard' | 'autonomous'

export interface ModelDef {
  id: string
  /** CLI value passed to --model. */
  cliId: string
  /** Display name, uppercase mono, per the design. */
  name: string
  /** One-line note in the model popover. */
  note: string
  dot: string
  window: number
  isCustom?: boolean
}

/* ---------- message blocks ---------- */

export interface TextBlock {
  kind: 'text'
  text: string
}

export interface ListBlock {
  kind: 'list' | 'bullets'
  items: string[]
}

export interface RuleBlock {
  kind: 'rule'
  label: string
  text: string
}

export interface QuoteBlock {
  kind: 'quote'
  label: string
  text: string
}

export interface TableBlock {
  kind: 'table'
  head: string[]
  rows: string[][]
}

export interface ToolBlock {
  kind: 'tool'
  /** Stable id so expand state survives re-renders. */
  id: string
  name: string
  /** The one-line summary shown collapsed. */
  cmd: string
  out: string
  isError?: boolean
  /** Still running — no result has come back yet. */
  running?: boolean
  children: { name: string; cmd: string }[]
}

/**
 * An image in a turn. The CLI takes these on stdin as Anthropic content blocks
 * and the model genuinely sees them — verified against `claude -p
 * --input-format stream-json`, which answered the colour of a solid test PNG.
 * Its own transcripts store them the same way, so history round-trips.
 */
export interface ImageBlock {
  kind: 'image'
  id: string
  /** `image/png`, `image/jpeg`, `image/gif` or `image/webp`. */
  mediaType: string
  /** Base64, no data-URI prefix — the wire form the CLI wants. */
  data: string
  /** What it was called when it was attached, for the alt text and the title. */
  name: string
}

export interface CodeBlock {
  kind: 'code'
  id: string
  name: string
  cmd: string
  out: string
}

export type MessageBlock =
  | TextBlock
  | ListBlock
  | RuleBlock
  | QuoteBlock
  | TableBlock
  | ToolBlock
  | CodeBlock
  | ImageBlock

/** An image on its way out, before it is a block in a transcript. */
export interface Attachment {
  mediaType: string
  data: string
  name: string
}

export interface Message {
  id: string
  role: 'you' | 'claude'
  /** Leading prose; further structure lives in `blocks`. */
  text: string
  blocks: MessageBlock[]
  /**
   * The markdown this message was rendered from, kept so it can be copied back
   * out as what it was. `parseBlocks` is lossy on purpose — it joins wrapped
   * lines, drops list markers and demotes headings — so the blocks cannot be
   * turned back into the source they came from.
   */
  source?: string
  /** Where in the transcript this message begins, for forking at it. */
  line?: number
  /** "Steeped for 51s" — set once the turn resolves. */
  meta: string | null
  timestamp: number
}

/* ---------- sessions ---------- */

export interface ContextUsage {
  used: number
  window: number
}

export interface ThreadSummary {
  id: string
  title: string
  /** The title is a name of the thread's own, not the opening prompt. */
  named: boolean
  /** Epoch ms of the first message. */
  started: number
  /** Epoch ms of the most recent activity. */
  touched: number
  messageCount: number
  lane: LaneId | null
  /** The sidebar's second line — "left mid-thought", "quiet for 6 days". */
  state: string
  /**
   * The family this session belongs to: its own id, unless it is a pathway of
   * something else. Every member is still listed — the rail draws one row per
   * family, but a restored tab, a resolved link and the palette all address a
   * pathway by its own id, so hiding members from the index would break each of
   * them for the sake of a list that can filter itself.
   */
  root: string
  /** Sessions in the family. 1 for a thread nobody has forked. */
  paths: number
}

/**
 * A point in one transcript where this thread's paths part, ready to draw: the
 * position is a MESSAGE index, resolved in main during the same parse that
 * built the messages, so the renderer never maps a stored line anchor onto a
 * turn itself. A seam at `messages.length` sits after everything — a path with
 * nothing written on it yet.
 */
export interface Seam {
  at: number
  /**
   * EVERY path that leaves here, the one you are reading included and marked.
   *
   * It used to be only the others, on the reasoning that you are reading this
   * one and the rule says what ELSE leaves. True, and it made the seam a list
   * with a hole in it: three paths showed two names, and which two depended on
   * where you happened to be standing. Showing all of them and marking the one
   * you are on turns the rule into a switch you can read — how many ways this
   * went, which is yours, and one click to any other.
   */
  paths: {
    id: string
    label: string
    active: boolean
    /**
     * The path has no words of its own yet, so its label is a stand-in rather
     * than something it said. Carried separately because a stand-in can still
     * be STAMPED — two unwritten paths on one seam have to be told apart — and
     * "is the label real" and "is the label empty" stop being the same question
     * the moment that happens.
     */
    unwritten: boolean
  }[]
}

export interface SessionSnapshot {
  id: string
  title: string
  started: number
  touched: number
  messages: Message[]
  context: ContextUsage | null
  /** Empty for a thread nobody has forked, which is most of them. */
  seams: Seam[]
}

/* ---------- forking ---------- */

/**
 * Why a fork could not be taken. Each one has something true to say to the
 * reader — a fork that quietly does nothing is the worst of the three answers
 * a click can have.
 */
export type ForkFailure =
  /** The renderer holds a turn the transcript has not caught up with. */
  | 'racing'
  /** Nothing was answered before the cut, which is a new chat, not a fork. */
  | 'nothing-answered'
  /** The message at that position is not the one that was clicked. */
  | 'moved'
  /** The transcript could not be read, or the copy could not be written. */
  | 'unreadable'

/**
 * Where a pathway parted from the one it was cut out of. `sharedLines` is the
 * count of copied prefix lines, which indexes the same bytes in the parent and
 * in every sibling — the copy is line for line identical, and the CLI only ever
 * appends. `forkUuid` is the last of those lines' own id, so the split can be
 * checked against the file rather than assumed to still be where it was left.
 */
export interface ForkPoint {
  id: string
  sharedLines: number
  forkUuid: string
}

/**
 * One fork's kinship, keyed by the CHILD's session id — a root never appears as
 * a key, which is what makes "has no record" the definition of a root.
 *
 * This is the whole of what is stored about pathways. The family, its seams and
 * its one rail row are all derived from these pointers by `shared/pathways.ts`,
 * so there is no second copy of the relationship to fall out of step with this
 * one. Losing a record loses a grouping, never a conversation: every pathway is
 * a complete transcript on its own, so a member whose record goes missing is an
 * ordinary standalone thread again.
 */
export interface Pathway {
  parent: string
  sharedLines: number
  forkUuid: string
  created: number
}

export type Pathways = Record<string, Pathway>

/**
 * What the transcript layer can say on its own: the copy was made, and here is
 * where it parted. It knows nothing about kinship — writing that down is a
 * decision about app state, one layer up.
 */
export type ForkCut = { ok: true; at: ForkPoint } | { ok: false; reason: ForkFailure }

/** The cut, once the kinship is recorded — what the renderer actually gets. */
export type ForkResult =
  | {
      ok: true
      at: ForkPoint
      /**
       * The state as main holds it once the record is written, so the renderer
       * takes what was actually recorded rather than reconstructing it.
       */
      state: AppState
    }
  | { ok: false; reason: ForkFailure }

/**
 * What the renderer believed it was cutting at. The cut is named by message
 * index and resolved against the file, and the two can disagree — a queued
 * message, a turn still being written — so main checks the index still means
 * what the reader meant by it instead of cutting somewhere else entirely.
 */
export interface ForkExpect {
  role: 'you' | 'claude'
  /** The first sixty characters of the message's text; empty when it had none. */
  preview: string
  /**
   * How many messages the caller was looking at. An index into a list of a
   * different length cannot mean the turn that was clicked, whatever the role
   * at that position says — and role is often the whole of the rest of the
   * check, since a turn that opens with a tool call has no text to compare.
   */
  total: number
}

/* ---------- guarded approvals ---------- */

/**
 * A tool call the CLI refused in Guarded mode. Headless Claude Code has no
 * channel to ask a question on, so it denies and ends the turn; this is that
 * denial, turned back into the question it was.
 */
export interface PermissionRequest {
  sessionId: string
  /**
   * Which refusal this is. Main keeps its own copy of each one it emits, and an
   * answer is held to that copy by this id: nothing else in an answer is
   * believed (cli.ts, `answer`).
   */
  id?: string
  /** The tool that was refused. */
  tool: string
  /** What it wanted to do, in the same one-line form a tool row shows. */
  summary: string
  /** Shell and network calls need the wider grant than a file edit does. */
  shell: boolean
}

/* ---------- live stream events (main → renderer) ---------- */

export type StreamEvent =
  | { type: 'started'; sessionId: string; verb: string; at: number }
  | { type: 'message'; sessionId: string; message: Message }
  | { type: 'patch'; sessionId: string; messageId: string; message: Message }
  | { type: 'context'; sessionId: string; context: ContextUsage }
  | { type: 'done'; sessionId: string; durationMs: number; meta: string }
  | { type: 'permission'; sessionId: string; request: PermissionRequest }
  | { type: 'error'; sessionId: string; message: string }
  | { type: 'exit'; sessionId: string; code: number | null }
  /** The usage windows as this turn left them — the CLI's `rate_limit_event`, read. */
  | { type: 'usage'; sessionId: string; usage: Usage }

export interface StartOptions {
  /**
   * Always set. The renderer allocates the id for a new chat too, so the pane
   * owns its identity before the first event can arrive — otherwise the turn
   * starts, `started` is emitted, and no pane yet claims that session.
   */
  sessionId?: string
  /** A chat with no transcript yet: `--session-id` rather than `--resume`. */
  fresh?: boolean
  model: string
  effort: EffortId
  safety: SafetyId
  /**
   * Tool names the CLI is told not to use: `Bash` when shell commands are off,
   * `Skill(<id>)` for every skill switched off in Settings. Both verified to
   * take effect — Bash leaves the tool list, a disallowed skill is refused.
   */
  deny?: string[]
  /** Masks token-shaped strings in tool calls before they reach the renderer. */
  redact?: boolean
  /** Set when the chosen model is one added in Settings, which MODELS cannot resolve. */
  customModel?: ModelDef
}

/* ---------- persisted app state ---------- */

export interface ThreadSettings {
  model: string
  effort: EffortId
}

/**
 * Settings toggles. Every one of these changes real behaviour — a switch that
 * only looks like a setting is worse than no switch, so a "confirm before
 * writing files" switch was considered and left out: it would promise a diff
 * before every write, and the CLI has no way to show one.
 */
export interface Flags {
  /** ⌥↓ on the last row of the rail returns to the first instead of stopping. */
  wrapFlip: boolean
  /** Off passes --disallowedTools Bash, so the CLI cannot run a shell command. */
  allowShell: boolean
  /** Masks anything token-shaped in a tool call before it reaches the renderer. */
  redactSecrets: boolean
  /** Off hides tool rows in the transcript; Claude Code's own log is untouched. */
  logTools: boolean
  /** The CTX bar in each chat header. */
  showCtx: boolean
  /** The shortcut line along the bottom. */
  showHints: boolean
  /**
   * "Lane in the head" — show which lane or folder the open thing belongs to.
   * Off, the head is just the kind and the title.
   */
  showLane: boolean
  /**
   * "Keep the browser open" — otherwise the rail hides again once you have
   * picked something out of it.
   */
  railSticky: boolean
  /**
   * Pane selection as elevation: the selected pane casts a shadow, the other
   * seats into the desk. Off restores the 1px focus ring.
   */
  paneLift: boolean
  /**
   * Prompts that keep time run at all. Off on a new install: a run starts with
   * the window closed and nobody watching, which is a thing to have asked for.
   * A state file from before the switch is read as on when a prompt already
   * runs by itself (`state.ts`), so an install running schedules keeps them.
   */
  schedules: boolean
}

export const DEFAULT_FLAGS: Flags = {
  wrapFlip: true,
  allowShell: true,
  redactSecrets: true,
  logTools: true,
  showCtx: true,
  showHints: true,
  showLane: true,
  railSticky: true,
  paneLift: true,
  schedules: false
}

/**
 * A prompt kept to be sent again: the name ⌘K finds it by, and the words. Its
 * model, effort, safety and lane, where set, are its own; unset, the app's.
 * Kept in the state file — per Mac, not in the vault — because only the app
 * reads it.
 */
export interface SavedPrompt {
  /** Minted when it is made, never reused. */
  id: string
  /** What ⌘K matches, and what a run's thread is called. Unique. */
  name: string
  /** Sent as written — prose, or a line like `/morning`. */
  text: string
  model?: string
  effort?: EffortId
  safety?: SafetyId
  /**
   * Set only by the yes to the Autonomous question in Settings → Prompts. A
   * scheduled run is Autonomous only with it; a prompt set to Autonomous
   * without it — before the question existed, say — runs Standard on its
   * schedule (`runSafety`).
   */
  autonomousConfirmed?: boolean
  /** The thread a run makes is filed in this lane. */
  lane?: LaneId
  /** When it runs by itself, while the app is up. */
  schedule?: Schedule | null
}

/**
 * Days and a time — "every work day at 6:00", "Mondays at 8:40" — which is all
 * a person says about a routine, and needs no cron. Twice a day is two prompts.
 */
export interface Schedule {
  /** 0–6, Sunday first, as `Date.getDay`. */
  days: number[]
  /** `HH:MM`, in the Mac's own clock. */
  time: string
  /** Paused without being lost. */
  on: boolean
  /**
   * When it was last saved or switched on. A slot before it never runs: saving
   * a 06:00 schedule at 10:05 does not mean "run it now", and switching a
   * paused one back on does not make up what it missed.
   */
  since: number
}

/** How a run went — said on the prompt's card, in words. */
export type RunOutcome = 'running' | 'done' | 'asked' | 'error' | 'limit'

/**
 * The last run of a scheduled prompt. Written by main alone — the scheduler is
 * the one party that sees a run start and end, window or no window — and
 * handed to the renderer, which never writes it back.
 */
export interface PromptRun {
  /** The slot it ran for, `YYYY-MM-DD HH:MM` local — at most one run each. */
  slot: string
  at: number
  sessionId: string
  outcome: RunOutcome
  finishedAt?: number
  /** What stopped it, where something did: the request waiting on a yes, the error, the reset. */
  note?: string
  /** Stopped on a refusal: the request, so the tab can ask it again whenever it is opened. */
  ask?: PermissionRequest
  /** A tab has been made for it. Until then, the next window to open makes one. */
  shown: boolean
}

/** What the window is told when a scheduled run starts — enough to make its tab before its first event. */
export interface RanNotice {
  promptId: string
  sessionId: string
  title: string
  lane: LaneId | null
  settings: ThreadSettings
  run: PromptRun
}

/** A skill as it exists in the vault: one folder under `.claude/skills/`. */
export interface SkillDef {
  /** The folder name, which is the id the CLI knows it by. */
  id: string
  name: string
  description: string
  /** Inferred from the skill's own name where it names a lane; otherwise every lane. */
  lane: LaneId | null
}

export interface AppState {
  /**
   * The folder Lanes works in — every thread runs there and every note is read
   * from it. Null until it is chosen at first launch (or in Settings).
   */
  vault: string | null
  /** The person's lanes, in the order the rail shows them. None is a valid answer. */
  lanes: LaneDef[]
  /**
   * Vault-relative folders whose notes are read and never written from here —
   * an inbox an automation fills, say. Empty by default: nothing is read only.
   */
  readOnlyFolders: string[]
  /**
   * Manual "move to lane" decisions, which win over the backfill. One naming a
   * lane that no longer exists is ignored, never deleted: the lane may come back.
   */
  laneOverrides: Record<string, LaneId>
  /**
   * Which note each chat was started on. The touched-notes index learns what a
   * chat is about by reading its transcript, so a chat that has not sent yet
   * belongs to nothing — this is how a chat created on a note is that note's
   * from the moment it exists.
   */
  attachments: Record<string, string>
  /**
   * Thread titles this app named, by session id. The CLI's transcript falls
   * back to the first sixty characters of the opening prompt, which is a
   * sentence rather than a name.
   */
  titleOverrides: Record<string, string>
  /** How many chats a lane band shows before it offers the rest. */
  perLane: number
  recentOpen: boolean
  /** Thread ids most-recently-visited first. */
  visited: string[]
  theme: ThemeId
  accent: AccentId
  /** What `==highlighted==` words are drawn in, in READ and WRITE alike. */
  highlight: HighlightId
  threadSettings: Record<string, ThreadSettings>
  /** Applies to every chat; a chat can still override model and effort. */
  safety: SafetyId
  defaultModel: string
  defaultEffort: EffortId
  /** Added in Settings → Models; they join the per-chat model menu. */
  customModels: ModelDef[]
  /**
   * Models kept OUT of the composer's picker, by id — the same shape as
   * `skillsOff`, and off-by-exception for the same reason: a list of what is
   * hidden survives a new model being added, where a list of what is shown
   * would silently keep it out.
   *
   * The thread's own model is always offered even when hidden, or a thread set
   * to a model you later hid would show a picker that cannot say what it is on.
   */
  modelsOff: string[]
  flags: Flags
  /** Skill ids switched off — the vault keeps the file, the CLI is told not to use it. */
  skillsOff: string[]
  /** Starred notes, by vault path — the shelf's top section and the STARRED view. */
  marks: string[]
  /** Which shape the rail's browser card is in. */
  railMode: RailMode
  /** The Starred card's disclosure. */
  starredOpen: boolean
  /** Folder rows opened past their cap, keyed by full path. */
  moreDirs: string[]
  /** Lane bands the reader collapsed, by lane id (or the uncategorised band). */
  collapsedFolders: string[]
  /**
   * Where a new note lands when its name carries no folder of its own. One
   * place, always, so a note you make in a hurry is somewhere you can find the
   * hurried notes — the vault root by default (empty), and a `folder/name`
   * still overrides it.
   */
  newNoteFolder: string
  /** How the rail sorts within a band: most recently touched, or by title. */
  notesSort: 'recent' | 'az'
  /** Folder rows the reader opened, by path. Closed is the default below the root. */
  openDirs: string[]
  hideLeft: boolean
  /**
   * When the five-hour usage window resets, as an epoch. Set from the stream —
   * every turn's `rate_limit_event` says when the window ends — and by hand
   * from the clock in the top bar before there is a turn to say it. Null is no
   * clock.
   */
  sessionEndsAt: number | null
  /**
   * The last figures the stream gave for both usage windows, with when it gave
   * them. Kept so a relaunch shows what was last known, and how old it is.
   */
  usage: Usage | null
  /** Prompts kept to be run again — from ⌘K, after a `/`. Settings → Prompts. */
  prompts: SavedPrompt[]
  /** The last scheduled run of each prompt, by prompt id. Main writes it; see `PromptRun`. */
  runs: Record<string, PromptRun>
  /**
   * The writing aids, in WRITE. `focus` dims everything but the paragraph the
   * caret is in; `typewriter` keeps that line at one height on screen. App-wide
   * because they are how a person writes, not facts about a note.
   */
  writeFocus: boolean
  writeTypewriter: boolean
  /** Message prose only — 0.92, 1, 1.12 or 1.26. */
  textScale: number
  /**
   * The reading measure in px, 520–860 in steps of 20. Content is centred in a
   * pane at this max-width and the tab strip, head, body and composer all align
   * to it — the panes flex, the measure caps what sits inside them.
   */
  measure: number
  /** Composer height in px, dragged from its top edge. One line is 28. */
  composerH: number
  /** Pane A's share of the split, 0.2–0.8. Dragged from the seam between them. */
  splitRatio: number
  /** Both strips, restored on launch. Contents are not saved — only identity. */
  tabs: [SavedTab[], SavedTab[]]
  activeTab: [number, number]
  split: boolean
  /** Fork kinship, keyed by the child session id. See `shared/pathways.ts`. */
  pathways: Pathways
  /**
   * Names the reader gave individual paths, by session id. Deliberately NOT on
   * the kinship record: a family's first path has no such record — it is the
   * thread's own session — and a name it could not be given while its siblings
   * could would be an asymmetry with nothing behind it. Kept separately, a name
   * also outlives the grouping that occasioned it.
   */
  pathwayLabels: Record<string, string>
  /**
   * Each model's context window, as the CLI said it at the end of a turn
   * (`result.modelUsage`), keyed by the id a transcript records. What a thread
   * read from disk is measured against — see `shared/contextWindow.ts`.
   */
  contextWindows: Record<string, number>
  /**
   * Which member of each family was last shown, keyed by the family's root. A
   * thread opens back onto the path you were last reading rather than always
   * onto the one it started as.
   */
  pathwayActive: Record<string, string>
}

/**
 * Which shape the rail's browser card is in.
 *
 *   recent   what moved, threads and notes in separate sections
 *   lanes    what am I working on — threads only
 *   folders  where does it live — the real tree, to full depth
 */
export type RailMode = 'recent' | 'lanes' | 'folders'


/** One tab as the state file remembers it — identity only, never its contents. */
export interface SavedTab {
  kind: 'chat' | 'note'
  /** A session id for a chat, a vault-relative path for a note. */
  id: string
  /** Pinned tabs come back pinned, and in the same place. */
  pinned?: boolean
}

/* ---------- notes ---------- */

export interface NoteRef {
  path: string
  title: string
  folder: string
}

/** A note matched by its text, with the line it matched on. */
export interface NoteHit extends NoteRef {
  /** Lowercased — the search corpus is folded, so case cannot be recovered. */
  snippet: string
}

/**
 * A thread matched by what was SAID in it, rather than by the sixty characters
 * the CLI cut its name from. `id` is the family's root — the thread the palette
 * lists — because a fork copies its parent's prefix and a phrase said before
 * the fork is in every path of the family.
 */
export interface ThreadHit {
  id: string
  /** Lowercased — the search corpus is folded, so case cannot be recovered. */
  snippet: string
}

/**
 * An open task, and where it lives. The palette indexes tasks as well as
 * objects: an open `- [ ]` line inside any note is findable by its own words,
 * and picking it lands you in the note that holds it.
 */
export interface TaskHit extends NoteRef {
  line: number
  text: string
}

/** An open comment in a note, as ⌘K lists it: what it says, what about, and where. */
export interface CommentHit extends NoteRef {
  text: string
  /** The words it is about, as READ shows them — null for a comment at a point. */
  anchor: string | null
  /** Where its `{>>` is in the note's body, to land on it — found again by its words if the note has moved. */
  from: number
  /** When its note last changed. */
  edited: number
}

/** A note as the browser lists it — no body, but enough to sort by recency. */
export interface NoteEntry extends NoteRef {
  edited: number
}

/**
 * A note's links, both ways. Only `out` is written down — a note's body names
 * what it points at — and `back` is the same edges read from the other end, so
 * the two can never disagree with each other.
 */
export interface NoteLinks {
  /** Notes this one links out to, in the order its body names them. */
  out: NoteRef[]
  /** Notes whose bodies link here, by title. */
  back: NoteRef[]
}

export interface Note extends NoteRef {
  body: string
  created: number
  edited: number
  backlinks: number
  /** Under one of `readOnlyFolders`: written by automation; the app never edits it. */
  readOnly: boolean
}

/* ---------- the touched-notes index ---------- */

/**
 * How a thread got hold of a path, strongest wins: 1 named it in prose,
 * 2 passed it through a shell command or a search, 3 read it, 4 edited it,
 * 5 wrote it.
 */
export type TouchKind = 1 | 2 | 3 | 4 | 5

export interface Touch {
  /** Vault-relative. */
  path: string
  /** Summed across every call — reading a file six times counts for more than once. */
  weight: number
  kind: TouchKind
}

/**
 * One transcript as the index remembers it: everything that depends only on
 * the file, keyed by the mtime and size that produced it. Anything relative to
 * *now* is derived when a summary is handed out, never stored.
 */
export interface ThreadRecord {
  id: string
  mtimeMs: number
  size: number
  /**
   * When the thread last moved, by its own lines' timestamps — what RECENT
   * sorts on and "quiet for" counts from. Not `mtimeMs`, which only says when
   * the FILE was last written; see `lastActivity` in sessions.ts.
   */
  lastAt: number
  title: string
  /**
   * The title is the thread's OWN name — renamed in the CLI, or named by it —
   * rather than the opening prompt standing in for one. What tells the app's
   * namer whether there is anything left for it to improve.
   */
  named: boolean
  started: number
  messageCount: number
  lastRole: 'you' | 'claude'
  touches: Touch[]
  /** Prose `[[wikilink]]` targets, unresolved — the note index resolves them. */
  mentions: { target: string; count: number }[]
}

/** A place on this Mac a written path was found — see `src/shared/written.ts`. */
export interface FoundFile {
  /** Where it is, whole. Main hands it out, and takes back only what it handed. */
  path: string
  /** Its folder, said short — `projects/garden`, `Dropbox/…/harvest/2026-Q3`. */
  where: string
  dir: boolean
  /** How Open opens it: in its own app, as text, or not at all. */
  open: 'open' | 'text' | 'none'
}

export interface Located {
  found: FoundFile[]
  /** Further places with the same name, past the ones listed. */
  more: number
}

export interface LinkedNote extends NoteRef {
  /** Templated evidence — "written here", "read 4 times", "mentioned". */
  why: string
}

export interface RelatedThread {
  id: string
  /** One sentence naming what the two threads actually share. */
  why: string
}
