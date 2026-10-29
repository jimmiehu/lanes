import type { Attachment, ContextUsage, Message, PermissionRequest, Seam } from '@shared/types'

/**
 * A pane is a tab strip. Each tab holds either a chat or a note, and owns
 * everything that used to live on the pane itself — including its own history,
 * so switching tabs cannot disturb another tab's trail.
 *
 * PANES ARE ROLE-ASSIGNED. The left pane holds chats, the right pane holds
 * notes, always. Nothing has to be aimed, and the two kinds can never swap
 * places under you: "open" is unambiguous because the target follows the KIND
 * of the thing you opened, never the focus. `paneFor` is the whole rule, and
 * every open goes through it.
 */

export type TabKind = 'chat' | 'note'

export type PaneIndex = 0 | 1

/** The one place the role assignment is written down. */
export const paneFor = (kind: TabKind): PaneIndex => (kind === 'note' ? 1 : 0)

/** What a pane holds when it holds nothing — used for its empty state. */
export const roleOf = (pane: PaneIndex): TabKind => (pane === 1 ? 'note' : 'chat')

/**
 * A history entry names *what* was shown, not just a thread id: notes are in
 * the trail, so back from a note returns to the chat it was opened from.
 */
export interface HistEntry {
  kind: TabKind
  id: string
  /**
   * Carried rather than looked up: the back tooltip names its destination, and
   * a note's title is not derivable from a vault path without a round trip.
   */
  title: string
}

export interface TabState {
  /**
   * Minted on insert and never reused. History is keyed by this rather than by
   * the tab's index, because splicing a tab out would otherwise hand its stack
   * to whichever tab slid into its place.
   */
  key: string
  kind: TabKind
  /** A session id for a chat, a vault-relative path for a note. */
  id: string
  /** No transcript behind `id` yet — the first send creates the session. */
  fresh: boolean
  title: string
  /**
   * The title is a stand-in, not a name anybody chose — either the seed a tab
   * is born with or the first line of its opening message. What decides whether
   * the namer may replace it; gating on the seed text meant a tab that had
   * usefully labelled itself could never be improved on.
   */
  provisional: boolean
  started: number
  messages: Message[]
  /**
   * Where this path parts from the others, as positions in `messages`. Resolved
   * in main when the transcript is read, so the renderer only ever draws them.
   */
  seams: Seam[]
  context: ContextUsage | null
  pending: { verb: string; started: number } | null
  composer: string
  /** Excerpt waiting above the composer, shown as the QUOTING chip. */
  quote: { label: string; text: string } | null
  /** Images waiting to go with the next message, shown as the tray. */
  images: Attachment[]
  error: string | null
  /**
   * A turn finished here while you were somewhere else, and you have not been
   * back since. The strip's own glyph says so — see TabStrip.
   */
  unseen?: boolean
  /** Guarded only: a tool call waiting on a yes or a no. */
  ask: PermissionRequest | null
  hist: { stack: HistEntry[]; i: number }
  /**
   * False for a tab restored on launch that nobody has looked at yet. Only the
   * active tab of each pane is read from disk at startup; the rest fill in when
   * they are first selected, so a six-tab strip does not cost six reads before
   * the first frame.
   */
  hydrated: boolean
  /**
   * Pinned tabs hold the front of the strip, shrink to their icon, and are the
   * last thing the six-tab cap will evict.
   */
  pinned: boolean
}

export interface PaneState {
  tabs: TabState[]
  /** Index into `tabs`. */
  active: number
}

export const HISTORY_DEPTH = 25

/**
 * Past this, the oldest non-active tab is evicted and its history with it.
 *
 * TWELVE, not six. Six was chosen when the strip could only draw six — every
 * tab wore its full title, and a seventh had nowhere to go but off the right
 * edge. The strip now sheds titles to monograms as it fills (see TabStrip), so
 * the row still shows every tab at once at twelve, which is the invariant the
 * cap was really protecting. A cap remains because this is persisted state and
 * every tab is a transcript held in memory — but it should bite when a strip
 * has become a drawer, not while it is still a working set.
 */
export const MAX_TABS = 12

let seq = 0
export function tabUid(): string {
  seq += 1
  return `tb${seq}`
}

export function emptyTab(): TabState {
  return {
    key: tabUid(),
    kind: 'chat',
    /**
     * Set from the moment the tab exists, including for a chat with nothing in
     * it yet: per-thread model and effort are keyed by it, and a chat whose id
     * only arrived with the first reply could not carry either.
     */
    id: crypto.randomUUID(),
    fresh: true,
    title: 'New thread',
    provisional: true,
    started: Date.now(),
    messages: [],
    seams: [],
    context: null,
    pending: null,
    composer: '',
    quote: null,
    images: [],
    error: null,
    unseen: false,
    ask: null,
    hist: { stack: [], i: -1 },
    hydrated: true,
    pinned: false
  }
}

/**
 * A note tab holding no note yet — what ⌘T opens in the note pane, and what the
 * empty pane's surface fills. The empty id is the whole signal: every reader of
 * a note tab already resolves its id against the vault, and nothing resolves to
 * `''`, so a blank tab is inert everywhere rather than special everywhere.
 *
 * It is replaced IN PLACE the moment you pick something, exactly as a browser's
 * new-tab page is: `placeTab` with `newTab: false` keeps the key, so the tab
 * you opened is the tab you end up reading.
 */
export function blankNoteTab(): TabState {
  return { ...emptyTab(), kind: 'note', id: '', title: 'New note', hydrated: true }
}

/** True for that tab: a note tab whose note has not been chosen yet. */
export const isBlank = (t: TabState | null): boolean => Boolean(t && t.kind === 'note' && !t.id)

/** The chat pane's resting state: one new chat, ready to type into. */
export function emptyPane(): PaneState {
  return { tabs: [emptyTab()], active: 0 }
}

/**
 * A pane holding nothing. The note pane starts here and returns here, because
 * its empty state is a real destination rather than a failure — there is no
 * reason to keep a last tab hostage to avoid drawing it.
 */
export function blankPane(): PaneState {
  return { tabs: [], active: 0 }
}

/** Null when the pane is empty. Every caller has to mean something by that. */
export const activeTab = (p: PaneState): TabState | null =>
  p.tabs[p.active] ?? p.tabs[0] ?? null

/** Pushes onto a tab's history, dropping any forward entries. */
export function pushHistory(
  hist: TabState['hist'],
  entry: HistEntry
): TabState['hist'] {
  const cur = hist.stack[hist.i]
  if (cur && cur.kind === entry.kind && cur.id === entry.id) return hist
  const stack = [...hist.stack.slice(0, hist.i + 1), entry].slice(-HISTORY_DEPTH)
  return { stack, i: stack.length - 1 }
}

export const canGo = (hist: TabState['hist'], delta: number): boolean => {
  const next = hist.i + delta
  return next >= 0 && next < hist.stack.length
}

export interface Placement {
  pane: PaneState
  /**
   * Chat ids whose tab is gone, so the main process can drop their session.
   * Empty unless a tab was evicted by the cap.
   */
  closed: string[]
  /** The tabs themselves, when a caller needs to remember what it just closed. */
  gone?: TabState[]
}

/**
 * Where every open lands. Selecting a tab that already holds this thing wins
 * over both other paths, so opening the same note twice cannot fill the strip.
 *
 * Otherwise `newTab` decides: false replaces the active tab *in place*, keeping
 * its key so its history continues — a replace is navigation within that tab,
 * and back must return to what it replaced. True appends.
 *
 * A PINNED TAB IS NEVER THE ONE REPLACED. Pinning says "keep this here", and
 * the tab it is said about is very often the one in front — so a plain open
 * from ⌘K or the rail, which replaces whatever is active, was reliably aimed at
 * exactly the tab you had asked it not to touch. It kept the pin and lost the
 * thing that was pinned, which is the worst of both: the strip still claimed
 * something was parked there, and it was something else. An open aimed at a
 * pinned tab appends instead. That is what every browser does, and it is what
 * the word means.
 */
export function placeTab(
  pane: PaneState,
  kind: TabKind,
  id: string,
  newTab: boolean,
  make: () => TabState,
  /**
   * When two ids are the same thing to a reader. Identity by default; the app
   * passes one that reads a thread's pathways, so a family is one tab however
   * many transcripts it is made of. Kept as an argument rather than a lookup so
   * this module stays a pure function of what it is handed.
   */
  same: (a: string, b: string) => boolean = (a, b) => a === b
): Placement {
  const found = pane.tabs.findIndex((t) => t.kind === kind && same(t.id, id))
  if (found >= 0) {
    if (pane.tabs[found].id === id) return { pane: { ...pane, active: found }, closed: [] }
    // The same thread, a different path of it. One family is one tab, so this
    // moves the tab that is already showing it rather than opening a second one
    // beside it — in place, keeping the key so its history carries on.
    const tabs = pane.tabs.slice()
    const was = tabs[found]
    tabs[found] = { ...make(), key: was.key, hist: was.hist, pinned: was.pinned }
    return {
      pane: { tabs, active: found },
      // Nothing shows the path we just left, so its process has nothing left to
      // talk to. Reading never spawned one; a resume brings it back if you
      // switch home again.
      closed: was.kind === 'chat' && !was.fresh ? [was.id] : []
    }
  }

  const tabs = pane.tabs.slice()
  let at: number
  // `newTab` false means "in place" — but only where there is a place to take.
  const onPinned = Boolean(tabs[Math.min(pane.active, tabs.length - 1)]?.pinned)
  if (!newTab && tabs.length && !onPinned) {
    at = Math.min(pane.active, tabs.length - 1)
    // The replacement inherits the key, so the stack it is joining survives —
    // and `pinned` with it. A replace is navigation INSIDE a tab: the tab did
    // not move, so it cannot have quietly unpinned itself, and every piece of
    // ordering arithmetic here assumes the pinned run stays contiguous.
    tabs[at] = { ...make(), key: tabs[at].key, hist: tabs[at].hist, pinned: tabs[at].pinned }
  } else if (!tabs.length) {
    tabs.push(make())
    at = 0
  } else {
    // The far end of the strip, always. It used to open beside the tab it came
    // from, the way browsers do — but a strip of six is not a browser window of
    // thirty: the whole row is visible at once, so "the new one" is worth more
    // as a fixed place than as a branch off wherever the selection happened to
    // be. Appending also clears the pinned run on its own, since pinned tabs
    // hold the front.
    at = tabs.length
    tabs.push(make())
  }

  const closed: string[] = []
  if (tabs.length > MAX_TABS) {
    /*
     * The cap never takes a pinned tab. It used to fall back to one when every
     * other tab was pinned, which made "keep this" conditional on how the rest
     * of the strip happened to look — and a tab you asked the app to hold on to
     * is not a thing to close on your behalf, ever. A strip of twelve pins that
     * is asked for a thirteenth simply becomes thirteen: the row sheds words
     * rather than tabs and can carry it, and the only thing that closes a
     * pinned tab is you.
     */
    const drop = tabs.findIndex((t, i) => i !== at && !t.pinned)
    if (drop >= 0) {
      const gone = tabs[drop]
      if (gone.kind === 'chat' && !gone.fresh) closed.push(gone.id)
      tabs.splice(drop, 1)
      at = tabs.findIndex((t) => t.kind === kind && t.id === id)
    }
  }

  return { pane: { tabs, active: at }, closed }
}

/**
 * A tab put at the far end of the strip WITHOUT being brought forward — what a
 * scheduled run makes. There is an answer coming in it, but you were reading
 * something else and still are: the strip's own glyph says when it lands. The
 * cap applies as it does to any open, and never takes the tab in front, the
 * new one, or a pinned one. A thing already in a tab is left where it is.
 */
export function placeBehind(pane: PaneState, tab: TabState): Placement {
  if (pane.tabs.some((t) => t.kind === tab.kind && t.id === tab.id)) return { pane, closed: [] }
  const front = pane.tabs[pane.active]?.key
  const tabs = [...pane.tabs, tab]
  const closed: string[] = []
  if (tabs.length > MAX_TABS) {
    const drop = tabs.findIndex((t) => t.key !== front && t.key !== tab.key && !t.pinned)
    if (drop >= 0) {
      const gone = tabs[drop]
      if (gone.kind === 'chat' && !gone.fresh) closed.push(gone.id)
      tabs.splice(drop, 1)
    }
  }
  const active = front ? tabs.findIndex((t) => t.key === front) : tabs.length - 1
  return { pane: { tabs, active: Math.max(0, active) }, closed }
}

/**
 * Pin or unpin, and move the tab across the pinned/unpinned boundary — which is
 * the same index either way: the end of the pinned run is the start of the rest.
 * `active` follows the tab by key rather than by index, which the move changes.
 */
export function togglePin(pane: PaneState, i: number): PaneState {
  const target = pane.tabs[i]
  if (!target) return pane
  const activeKey = pane.tabs[pane.active]?.key
  const tabs = pane.tabs.slice()
  tabs.splice(i, 1)
  const boundary = tabs.findIndex((t) => !t.pinned)
  const at = boundary < 0 ? tabs.length : boundary
  tabs.splice(at, 0, { ...target, pinned: !target.pinned })
  const active = tabs.findIndex((t) => t.key === activeKey)
  return { tabs, active: active < 0 ? at : active }
}

/**
 * Reorder within one strip. `to` is an insertion index into the array as it
 * stands *before* the move, which is what a drop position naturally gives you.
 *
 * A tab cannot be dragged across the pinned boundary: crossing it would mean
 * pinning or unpinning, and a drag is a reorder. The destination is clamped
 * into the dragged tab's own run instead of refusing the drop, so dragging a
 * pinned tab to the far right parks it at the end of the pinned run rather
 * than doing nothing.
 */
export function moveTab(pane: PaneState, from: number, to: number): PaneState {
  const moving = pane.tabs[from]
  if (!moving) return pane
  const activeKey = pane.tabs[pane.active]?.key
  const rest = pane.tabs.slice()
  rest.splice(from, 1)
  const boundary = rest.findIndex((t) => !t.pinned)
  const end = boundary < 0 ? rest.length : boundary
  const lo = moving.pinned ? 0 : end
  const hi = moving.pinned ? end : rest.length
  const at = Math.max(lo, Math.min(hi, to > from ? to - 1 : to))
  if (at === from) return pane
  rest.splice(at, 0, moving)
  const active = rest.findIndex((t) => t.key === activeKey)
  return { tabs: rest, active: active < 0 ? at : active }
}

/**
 * A pane may close to empty. Its empty state is a real destination — it names
 * the kind it holds and offers somewhere to go — so there is nothing to be
 * gained by keeping the last tab hostage.
 */
export function closeTab(pane: PaneState, i: number): Placement {
  const gone = pane.tabs[i]
  if (!gone) return { pane, closed: [] }
  const tabs = pane.tabs.slice()
  tabs.splice(i, 1)
  const active = Math.max(
    0,
    Math.min(tabs.length - 1, pane.active > i ? pane.active - 1 : pane.active)
  )
  return {
    pane: { tabs, active },
    closed: gone.kind === 'chat' && !gone.fresh ? [gone.id] : []
  }
}

/**
 * Everything but this one — and everything pinned. A pin is a request to keep
 * the tab, so "close others" cannot be the one command that ignores it; that is
 * what every browser does with the same menu item, for the same reason.
 */
export function closeOthers(pane: PaneState, i: number): Placement {
  const keep = pane.tabs[i]
  if (!keep) return { pane, closed: [] }
  const kept = pane.tabs.filter((t, j) => j === i || t.pinned)
  const gone = pane.tabs.filter((t, j) => j !== i && !t.pinned)
  const closed = gone.filter((t) => t.kind === 'chat' && !t.fresh).map((t) => t.id)
  return { pane: { tabs: kept, active: kept.indexOf(keep) }, closed, gone }
}
