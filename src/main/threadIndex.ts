import { app } from 'electron'
import { readdir, readFile, rename, stat, writeFile } from 'node:fs/promises'
import { basename, extname, join } from 'node:path'
import { sessionsDir, VAULT } from './config'
import { laneFromPaths } from './lanes'
import { lanesIn } from './ipcGuard'
import { noteAt, noteIndex, refIn, resolveIn, type NoteIndex } from './notes'
import { familyRoot } from '../shared/pathways'
import { distill, refreshVaultRoots, TOUCH } from './sessions'
import type {
  LaneDef,
  LinkedNote,
  Pathways,
  RelatedThread,
  ThreadRecord,
  ThreadSummary,
  TouchKind
} from '../shared/types'

/**
 * The touched-notes index: what every thread worked on, how hard, and what that
 * means about which notes belong to it and which other threads are next to it.
 *
 * Two layers, and the split is the point.
 *
 * **Records** are per-transcript and depend only on the file, so they cache to
 * disk keyed by mtime and size. A launch stats one file per transcript (a few
 * ms) and re-reads only the ones that moved, instead of parsing a few hundred
 * MB of jsonl to show a sidebar it showed identically yesterday.
 *
 * **Weights** are derived from all the records at once — a path's worth depends
 * on how many *other* threads touched it — so they are held in memory and
 * dropped whenever a record changes. Cheap to rebuild, wrong to cache.
 */

/**
 * 3: the parser learned that a turn is what the reader said — lines the CLI
 * injected are neither shown nor counted — and that a quoted note reads back as
 * the block it was sent as. Both change a record for a file that has not moved
 * (its message count, whose turn it ended on, its fallback title), and records
 * are keyed by mtime and size alone.
 *
 * 4: a record says whether its title is the thread's own name or the opening
 * prompt standing in for one. Every cached record predates the question.
 *
 * 5: a slash command is a turn — `/morning` is what the reader typed, though
 * the CLI files it in tags that open with `<`. A file that has not moved
 * counts its turns, and may find its title, differently.
 *
 * 6: the paths a shell command names are read against the vault's own
 * top-level folders (`vaultRootsPattern`, sessions.ts) instead of a list that
 * was one vault's, so a file that has not moved may have touched other notes.
 * The folders themselves are kept beside the records (`roots`), since a folder
 * made or renamed changes the same answer.
 *
 * 7: a record says when its thread last moved (`lastAt`), from its lines'
 * timestamps rather than the file's mtime. Every cached record predates it.
 */
const CACHE_VERSION = 7

const cacheFile = (): string => join(app.getPath('userData'), 'lanes-index.json')

interface CacheFile {
  version: number
  /** Which project directory these records came from; another vault is another one. */
  dir: string
  /** The vault's top-level folders the records' shell touches were read against. */
  roots?: string
  records: ThreadRecord[]
}

const records = new Map<string, ThreadRecord>()
/** The folder pattern every record now held was distilled under; see `sweep`. */
let recordsRoots: string | null = null
let loaded = false
let refreshing: Promise<boolean> | null = null
/** Bumped whenever a record changes, so an in-flight weigh knows it went stale. */
let generation = 0

/* ---------- the record layer: cached, keyed by mtime ---------- */

async function loadCache(): Promise<void> {
  if (loaded) return
  loaded = true
  try {
    const raw = JSON.parse(await readFile(cacheFile(), 'utf8')) as CacheFile
    // A stale schema or a different vault is not worth migrating — the whole
    // thing rebuilds from transcripts in a couple of seconds.
    if (raw.version !== CACHE_VERSION || raw.dir !== sessionsDir()) return
    for (const r of raw.records) records.set(r.id, r)
    recordsRoots = raw.roots ?? null
  } catch {
    // no cache yet, or an unreadable one: the next refresh writes a good one
  }
}

async function persist(): Promise<void> {
  const target = cacheFile()
  const body: CacheFile = {
    version: CACHE_VERSION,
    dir: sessionsDir(),
    roots: recordsRoots ?? undefined,
    records: [...records.values()]
  }
  try {
    await writeFile(`${target}.tmp`, JSON.stringify(body), 'utf8')
    await rename(`${target}.tmp`, target)
  } catch {
    // a cache we cannot write is a slow launch, not a broken one
  }
}

/** Reads are IO-bound; a few at a time is meaningfully faster on a cold cache. */
async function pool<T>(items: T[], limit: number, fn: (item: T) => Promise<void>): Promise<void> {
  let next = 0
  const worker = async (): Promise<void> => {
    while (next < items.length) await fn(items[next++])
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
}

/**
 * Brings the records in line with what is on disk. Returns whether anything
 * moved, so a caller can skip pushing an identical thread list at the renderer.
 */
export async function refresh(): Promise<boolean> {
  refreshing ??= (async () => {
    try {
      return await sweep()
    } finally {
      refreshing = null
    }
  })()
  return refreshing
}

async function sweep(): Promise<boolean> {
  await loadCache()
  let files: string[]
  try {
    files = (await readdir(sessionsDir())).filter((f) => f.endsWith('.jsonl'))
  } catch {
    return false
  }

  /*
   * The vault's top-level folders, read again every pass. A shell command's
   * paths are only vault files under one of them, so a folder made or renamed
   * since the records were distilled changes what an unchanged transcript
   * touched — and a record is keyed by its file's mtime and size, which did
   * not move. So when the folders did, every record is read again: rare, and
   * the same couple of seconds a cold cache costs. Read again in place, not
   * dropped first, so a listing asked for meanwhile is never an empty rail.
   */
  const roots = refreshVaultRoots()
  const stale = recordsRoots !== roots
  recordsRoots = roots

  const seen = new Set<string>()
  let changed = false

  await pool(files, 8, async (f) => {
    const id = basename(f, '.jsonl')
    seen.add(id)
    const full = join(sessionsDir(), f)
    try {
      const st = await stat(full)
      const have = records.get(id)
      if (!stale && have && have.mtimeMs === st.mtimeMs && have.size === st.size) return
      const rec = await distill(id, full, st.mtimeMs, st.size)
      records.set(id, rec)
      changed = true
    } catch {
      // an unreadable file is simply not a thread
    }
  })

  for (const id of records.keys()) {
    if (seen.has(id)) continue
    records.delete(id)
    changed = true
  }

  if (changed) {
    weights = null
    generation++
    void persist()
  }
  return changed
}

/* ---------- the person's lanes ---------- */

/**
 * The lanes a thread is filed under, as the state file holds them now. Set at
 * boot and again whenever Settings changes them (index.ts) — not read from the
 * state on every listing, which is a sidebar's worth of calls.
 *
 * No record holds a lane: a record holds what its thread touched, and the lane
 * is worked out from that each time the threads are listed (`summarise`). So a
 * lane renamed, added or moved to another folder re-files every thread on the
 * next listing, with nothing cached to throw away.
 */
let lanes: LaneDef[] = []

export function setLanes(next: unknown): void {
  lanes = lanesIn(next)
}

/* ---------- the weight layer: derived, in memory ---------- */

/** Inverse thread-frequency does the suppressing; this is only the floor under it. */
const MIN_IDF = 0.0001

/**
 * The two things frequency cannot catch.
 *
 * A template is scaffolding, not a subject: two threads that filled in the same
 * skeleton are not working on the same thing, and `_templates/{ Title } ({ year
 * })` is nobody's linked note.
 *
 * A top-level folder is the vault's furniture. A reference folder at the top
 * is touched by threads that share nothing, and its frequency never gets high
 * enough for the idf to zero it, so every top-level folder goes out by rule.
 * Anything deeper — `projects/garden/` — is a real corner of the work and stays.
 *
 * `_templates/` is the one folder known by name: the convention a template
 * folder follows in Obsidian and its kin, and the one the sample vault keeps.
 * A vault with no such folder loses nothing by it.
 */
const SCAFFOLDING = /^_templates\//

/** `reading/` and `projects`, but not `Start here.md` — a root *file* is a real note. */
function isTopFolder(path: string): boolean {
  const p = path.replace(/\/$/, '')
  return !p.includes('/') && !extname(p)
}

/** A prose `[[mention]]` is worth less than opening the file. */
const MENTION_WEIGHT = 1.5

interface Vector {
  /** path → normalised weight and the strongest way this thread touched it. */
  by: Map<string, { w: number; kind: TouchKind }>
  /** Paths by weight, best first. */
  order: string[]
}

interface Weights {
  vectors: Map<string, Vector>
  /** path → threads that touched it, for finding candidates without an all-pairs sweep. */
  threadsByPath: Map<string, string[]>
  /**
   * The same edge keyed by the *note* rather than by the path a transcript
   * happened to name it with. `threadsByPath` cannot answer "which chats belong
   * to this note": its keys are raw touched paths, so a transcript that wrote
   * `Projects/foo.md` for `projects/foo.md` files under a key no note lookup
   * would ever produce.
   */
  chatsByNote: Map<string, string[]>
  notes: NoteIndex
}

let weights: Weights | null = null
let weighing: Promise<Weights> | null = null

/**
 * Inverse thread-frequency. `ln(N/df)` and not the smoothed variant, because
 * the smoothed one leaves a path that half the vault's threads touched with
 * 40% of a unique path's pull, which is exactly the touch-everything noise
 * this is here to remove. A path every thread touched scores zero.
 */
function idfOf(df: number, n: number): number {
  return Math.max(MIN_IDF, Math.log(n / Math.max(1, df)))
}

/**
 * Sublinear, so a thread that read an index note nine times does not outrank
 * one that wrote a note once.
 */
function damp(weight: number): number {
  return 1 + Math.log(Math.max(1, weight))
}

async function weigh(): Promise<Weights> {
  const notes = await noteIndex()
  const live = [...records.values()].filter((r) => r.messageCount > 0)
  const n = live.length

  // Raw touches, with prose mentions resolved against the vault and folded in.
  const raw = new Map<string, Map<string, { w: number; kind: TouchKind }>>()
  for (const r of live) {
    const m = new Map<string, { w: number; kind: TouchKind }>()
    for (const t of r.touches) {
      if (SCAFFOLDING.test(t.path) || isTopFolder(t.path)) continue
      m.set(t.path, { w: t.weight, kind: t.kind })
    }
    for (const { target, count } of r.mentions) {
      const hit = resolveIn(notes, target)
      if (!hit || SCAFFOLDING.test(hit)) continue
      const prev = m.get(hit)
      // A mention adds weight to a file the thread also opened, but never
      // downgrades the claim — mention is the weakest kind there is.
      if (prev) prev.w += MENTION_WEIGHT * count
      else m.set(hit, { w: MENTION_WEIGHT * count, kind: TOUCH.mention })
    }
    raw.set(r.id, m)
  }

  const df = new Map<string, number>()
  for (const m of raw.values()) for (const p of m.keys()) df.set(p, (df.get(p) ?? 0) + 1)

  const vectors = new Map<string, Vector>()
  const threadsByPath = new Map<string, string[]>()
  const chatsByNote = new Map<string, string[]>()
  for (const [id, m] of raw) {
    const scored = new Map<string, { w: number; kind: TouchKind }>()
    let norm = 0
    for (const [p, { w, kind }] of m) {
      const score = damp(w) * idfOf(df.get(p) ?? 1, n)
      scored.set(p, { w: score, kind })
      norm += score * score
    }
    // L2, so a thread that touched sixty files is not related to everything.
    norm = Math.sqrt(norm) || 1
    for (const v of scored.values()) v.w /= norm
    const order = [...scored.entries()].sort((a, b) => b[1].w - a[1].w).map(([p]) => p)
    vectors.set(id, { by: scored, order })
    for (const p of order) {
      const list = threadsByPath.get(p)
      if (list) list.push(id)
      else threadsByPath.set(p, [id])
      const note = noteAt(notes, p)
      if (!note) continue
      const chats = chatsByNote.get(note)
      // One thread is appended contiguously, so a second path of its own that
      // resolves to the same note is always the entry just written.
      if (!chats) chatsByNote.set(note, [id])
      else if (chats[chats.length - 1] !== id) chats.push(id)
    }
  }

  return { vectors, threadsByPath, chatsByNote, notes }
}

/**
 * Drops the derived layer because the *vault* moved, not because a transcript
 * did. `weigh` captures the note index it resolved against, so a note written
 * since is not in it: `noteAt` returns null for a path that plainly exists, and
 * a rail row for a brand-new note reads zero chats forever. The sweep that
 * notices the vault changed calls this.
 */
export function dropWeights(): void {
  weights = null
  generation++
}

async function weighted(): Promise<Weights> {
  if (weights) return weights
  if (!weighing) {
    // A sweep landing mid-weigh must not be overwritten by the result it
    // invalidated — the caller still gets these weights, they just do not stick.
    const gen = generation
    weighing = weigh().then((w) => {
      weighing = null
      if (gen === generation) weights = w
      return w
    })
  }
  return weighing
}

/* ---------- what the app asks it ---------- */

function humanGap(ms: number): string {
  const mins = Math.max(1, Math.round(ms / 60000))
  if (mins < 60) return `${mins} minute${mins === 1 ? '' : 's'}`
  const hours = Math.round(mins / 60)
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'}`
  const days = Math.round(hours / 24)
  if (days < 30) return `${days} day${days === 1 ? '' : 's'}`
  const months = Math.round(days / 30)
  return `${months} month${months === 1 ? '' : 's'}`
}

/** The sidebar's second line. Chats waiting for you are out of scope for v1. */
function stateLine(r: ThreadRecord): string {
  if (r.lastRole === 'you') return 'left mid-thought'
  return `quiet for ${humanGap(Date.now() - r.lastAt)}`
}

/**
 * Records as the app lists them, with the pathway families folded in.
 *
 * Every session stays in the list; only the rail collapses a family to one row.
 * The join happens here rather than in the record layer because kinship is app
 * state, not a property of a transcript — which is what keeps `ThreadRecord` a
 * pure function of its file, and the on-disk record cache valid across a fork.
 *
 * A root's row reports the family's NEWEST member. Once forking folds the page,
 * the conversation carries on in a child session, and a row saying "quiet for
 * three days" about a thread you were talking to a minute ago is simply untrue.
 * The row keeps the root's id and name — one thread, one name — and borrows
 * only its liveness.
 */
function summarise(pathways: Pathways): ThreadSummary[] {
  const live = [...records.values()].filter((r) => r.messageCount > 0)
  /**
   * A family whose root has no record — its transcript deleted outside the app,
   * before the next prune — has no row to gather under. Every member is a whole
   * transcript, so each simply stands as a thread of its own instead.
   */
  const rootOf = (id: string): string => {
    const root = familyRoot(pathways, id)
    return records.has(root) ? root : id
  }

  const newest = new Map<string, ThreadRecord>()
  const size = new Map<string, number>()
  for (const r of live) {
    const root = rootOf(r.id)
    size.set(root, (size.get(root) ?? 0) + 1)
    const have = newest.get(root)
    if (!have || r.lastAt > have.lastAt) newest.set(root, r)
  }

  return live
    .map((r) => {
      const root = rootOf(r.id)
      const face = r.id === root ? (newest.get(root) ?? r) : r
      return {
        id: r.id,
        title: r.title,
        named: r.named,
        started: r.started,
        touched: face.lastAt,
        messageCount: face.messageCount,
        lane: laneFromPaths(r.touches, lanes, VAULT),
        state: stateLine(face),
        root,
        paths: size.get(root) ?? 1
      }
    })
    .sort((a, b) => b.touched - a.touched)
}

export async function threads(pathways: Pathways): Promise<ThreadSummary[]> {
  await refresh()
  return summarise(pathways)
}

/** Reads whatever is already cached, without going to disk. For the periodic sweep. */
export function threadsCached(pathways: Pathways): ThreadSummary[] {
  return summarise(pathways)
}

/* ---------- LINKED NOTES ---------- */

const LINKED_CAP = 8

/** What the thread did with the note, for the row's mono meta line. */
const EVIDENCE: Record<TouchKind, string> = {
  [TOUCH.write]: 'written',
  [TOUCH.edit]: 'edited',
  [TOUCH.read]: 'read',
  [TOUCH.shell]: 'in a command',
  [TOUCH.mention]: 'mentioned'
}

/**
 * The notes this thread is actually about. Ordered by weight rather than by
 * when they were touched, so a note the thread wrote outranks the index note it
 * read on the way past — and inverse thread-frequency means the files every
 * thread opens fall out on their own.
 */
export async function linkedNotes(id: string): Promise<LinkedNote[]> {
  const w = await weighted()
  const vec = w.vectors.get(id)
  if (!vec) return []

  const out: LinkedNote[] = []
  for (const path of vec.order) {
    if (out.length >= LINKED_CAP) break
    const hit = noteAt(w.notes, path)
    if (!hit || out.some((n) => n.path === hit)) continue
    out.push({ ...refIn(w.notes, hit), why: EVIDENCE[vec.by.get(path)!.kind] })
  }
  return out
}

/* ---------- A NOTE'S CHATS ---------- */

/**
 * The chats that belong to a note, newest first. This is `linkedNotes` read from
 * the other end: that one asks a chat what it worked on, this asks a note what
 * worked on it. One stored edge, two directions — the count and the list can
 * never disagree because there is nothing to keep in step.
 *
 * `attached` carries the chats *started* on this note, which the index cannot
 * know about on its own: it learns from transcripts, and a chat that has not
 * sent yet has none. A chat that is both attached and has touched the note is
 * one chat.
 *
 * Chats with no transcript behind them are not here — there is no record to
 * summarise. They are on screen as tabs, and the rail merges those in itself.
 */
export async function chatsOfNote(
  path: string,
  attached: string[] = [],
  pathways: Pathways = {}
): Promise<ThreadSummary[]> {
  // `threads()` refreshes and these do not, so a rail that renders before the
  // first thread list would otherwise show every note as having no chats.
  await refresh()
  const w = await weighted()
  const ids = new Set(attached)
  const note = noteAt(w.notes, path)
  if (note) for (const id of w.chatsByNote.get(note) ?? []) ids.add(id)

  // One row per thread. A family's paths all carry the copied prefix, so they
  // all touched this note — but they are one conversation, and a note that
  // listed three of them would be counting the same chat three times.
  const by = new Map(summarise(pathways).map((s) => [s.id, s]))
  const out = new Map<string, ThreadSummary>()
  for (const id of ids) {
    const s = by.get(id)
    if (!s) continue
    const have = out.get(s.root)
    // The root's own row is the family's; failing that, whichever member the
    // note saw most recently stands for it.
    if (!have || s.id === s.root || (have.id !== have.root && s.touched > have.touched)) {
      out.set(s.root, by.get(s.root) ?? s)
    }
  }
  return [...out.values()].sort((a, b) => b.touched - a.touched)
}

/* ---------- RELATED THREADS ---------- */

const RELATED_CAP = 5

/**
 * How many rows may rest on nothing but a shared folder. A thread whose only
 * neighbours are folder-deep produced five rows reading *Working the same
 * corner of the vault — projects/garden.* one under the other, which tells
 * a reader less than two of them do.
 */
const FOLDER_CAP = 2

/**
 * Below this two threads share nothing but the vault's furniture. Measured
 * across every overlapping pair in a real vault's sessions, similarity
 * spreads over two orders of magnitude — the top decile sits near .12, where a
 * pair really did work the same note, and the bottom decile near .003, where
 * they both read one common file once. The floor sits just above the median,
 * which matters for the threads with few candidates: without it they fill five
 * rows with whatever they can find.
 */
const RELATED_FLOOR = 0.02

const VERB: Record<TouchKind, string> = {
  [TOUCH.write]: 'wrote',
  [TOUCH.edit]: 'edited',
  [TOUCH.read]: 'read',
  [TOUCH.shell]: 'touched',
  [TOUCH.mention]: 'mentioned'
}

interface Shared {
  path: string
  /** This path's contribution to the pair's similarity. */
  score: number
  mine: TouchKind
  theirs: TouchKind
  /** The note's title, when the path resolves to one. */
  title: string | null
}

/**
 * Titles go in quotes, and not for decoration: a vault's own note titles
 * carry em dashes and commas, so an unquoted one runs straight into the
 * sentence around it — *Mentioned River walks — notes for the essay — this
 * thread touched it.* Quotes also let a long title be cut without the sentence
 * losing its shape.
 */
function quoted(title: string, max = 48): string {
  const t = title.length > max ? `${title.slice(0, max - 1).trimEnd()}…` : title
  return `“${t}”`
}

/** Two titles in one sentence get half the room each, or the row runs four lines deep. */
const PAIR = 30

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

/** The shell-path extraction yields folders too, with and without a trailing slash. */
function isFolder(path: string): boolean {
  return path.endsWith('/') || !extname(path)
}

/**
 * Why these two threads sit next to each other, templated from what the index
 * actually holds — no model in the loop. The ladder runs most-specific first:
 * a count of shared notes beats a single note, and a single note is described
 * by what each side did to it.
 */
function whyLine(shared: Shared[]): { why: string; weak: boolean } {
  const notes = shared.filter((s) => s.title)

  const strong = (why: string): { why: string; weak: boolean } => ({ why, weak: false })

  if (notes.length >= 3) {
    return strong(
      `Shares ${notes.length} notes with this thread, ${quoted(notes[0].title!)} most of all.`
    )
  }
  if (notes.length === 2) {
    return strong(
      `Also worked on ${quoted(notes[0].title!, PAIR)} and ${quoted(notes[1].title!, PAIR)}.`
    )
  }
  if (notes.length === 1) {
    const { mine, theirs, title } = notes[0]
    const t = quoted(title!)
    if (mine === theirs) return strong(`Both threads ${VERB[mine]} ${t}.`)
    return strong(`${cap(VERB[theirs])} ${t} — this thread ${VERB[mine]} it.`)
  }

  const folder = shared.find((s) => isFolder(s.path))
  if (folder) {
    return { why: `Working the same corner of the vault — ${folder.path.replace(/\/$/, '')}.`, weak: true }
  }

  const file = shared[0]
  if (file) return strong(`Also touched ${basename(file.path)}.`)
  return { why: 'Surfaced by overlap with this thread.', weak: true }
}

/**
 * Threads next to this one. Similarity is the cosine of the two weighted
 * vectors, so it already squares the inverse thread-frequency: a note only
 * these two touched dominates, and one both of them merely read alongside
 * ninety others contributes almost nothing.
 */
/**
 * A family's paths share a copied prefix, so they touched the same files and
 * would each report the others as its closest neighbour — which is true and
 * useless: they are one conversation, and the reader has a seam for stepping
 * between them. Kin are dropped here, at the presentation layer, and the weight
 * layer is left alone: a path's touches are real, and pretending otherwise
 * would change what every OTHER thread is measured against.
 */
export async function relatedThreads(
  id: string,
  pathways: Pathways = {}
): Promise<RelatedThread[]> {
  const w = await weighted()
  const mine = w.vectors.get(id)
  if (!mine) return []

  const home = familyRoot(pathways, id)
  const seen = new Set<string>([home])
  const scores = new Map<string, number>()
  for (const [path, { w: weight }] of mine.by) {
    for (const other of w.threadsByPath.get(path) ?? []) {
      if (other === id || familyRoot(pathways, other) === home) continue
      const theirs = w.vectors.get(other)?.by.get(path)
      if (!theirs) continue
      scores.set(other, (scores.get(other) ?? 0) + weight * theirs.w)
    }
  }

  const ranked = [...scores.entries()]
    .filter(([, score]) => score >= RELATED_FLOOR)
    .sort((a, b) => b[1] - a[1])

  const out: RelatedThread[] = []
  let weak = 0
  for (const [other] of ranked) {
    if (out.length >= RELATED_CAP) break
    // One row per thread, not per path of one: the highest-scoring member
    // arrives first and stands for its family.
    const root = familyRoot(pathways, other)
    if (seen.has(root)) continue
    seen.add(root)
    const theirs = w.vectors.get(other)!
    const shared: Shared[] = []
    for (const [path, { w: weight, kind }] of mine.by) {
      const t = theirs.by.get(path)
      if (!t) continue
      const hit = noteAt(w.notes, path)
      shared.push({
        path,
        score: weight * t.w,
        mine: kind,
        theirs: t.kind,
        title: hit ? refIn(w.notes, hit).title : null
      })
    }
    shared.sort((a, b) => b.score - a.score)
    const line = whyLine(shared)
    if (line.weak && ++weak > FOLDER_CAP) continue
    out.push({ id: other, why: line.why })
  }
  return out
}

