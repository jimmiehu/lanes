import { shell } from 'electron'
import { createHash } from 'node:crypto'
import { mkdir, readdir, readFile, rename, stat, writeFile } from 'node:fs/promises'
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { basename, dirname, extname, isAbsolute, join, relative } from 'node:path'
import { VAULT } from './config'
import { devEnv } from './dev'
import { fold, parseQuery, PHRASE, rank } from '../shared/find'
import { inEndingsOf } from '../shared/lineEnds'
import { firstWords, UNTITLED } from '../shared/noteTitle'
import { findComments } from '../shared/comments'
import { laneOfPath } from '../shared/lanes.ts'
import type {
  CommentHit,
  Note,
  NoteEntry,
  NoteHit,
  NoteLinks,
  NoteRef,
  TaskHit
} from '../shared/types'

/**
 * Vault note IO. Everything here speaks vault-relative paths; absolute paths
 * never cross the IPC boundary.
 */

/**
 * READ-ONLY FOLDERS: the ones the person named in Settings — an inbox an
 * automation fills, say — whose notes are read here and never written, renamed,
 * moved, trashed or made. None by default. Held here as well as in the state
 * file, because the test is asked on every write and loadState is a promise;
 * index.ts sets it at boot and whenever a patch carries the setting.
 */
let readOnly: string[] = []

export function setReadOnlyFolders(folders: readonly string[]): void {
  readOnly = [...folders]
}

/**
 * Whether a note's path is in a read-only folder. `rel` is the path as the walk
 * spells it (vaultPath), so `./inbox/x` is already `inbox/x`. A folder is
 * matched the way a lane's is — it is the same question, "is this path under
 * that folder" (src/shared/lanes.ts): case aside, at a folder boundary, so
 * `inbox-old/` is not in `inbox`, and `inbox`, `inbox/` and `./inbox` name one
 * folder. A folder that names the vault's root is no folder, as with lanes:
 * the vault is not read only by accident of an empty field.
 */
export function isReadOnly(rel: string, folders: readonly string[] = readOnly): boolean {
  if (!folders.length) return false
  return laneOfPath(rel, folders.map((folder) => ({ id: folder, name: folder, folder }))) !== null
}

/** What a refusal says. The renderer shows the note as read only already; this is for a log. */
const READ_ONLY = 'the folder is read only'

const SKIP_DIRS = new Set(['.git', '.obsidian', '.claude', 'node_modules', '.trash'])

interface IndexEntry {
  path: string
  title: string
  /** Lowercased basename without extension, for bare `[[wikilink]]` resolution. */
  slug: string
  /**
   * Title and path, lowercased and stripped of diacritics, for search. A
   * vault fills up with Kraków, Plzeň, Ålesund and Hauptstraße, and nobody
   * types the accents.
   */
  find: string
  /** mtime, for the notes browser's RECENT sort. */
  edited: number
}



/**
 * Every note's text, folded, in one buffer with an offset per note.
 *
 * A Buffer rather than strings: the same 70MB costs ~257MB of RSS as JS strings
 * and about 70MB here, and it lives outside V8's heap. `Buffer.indexOf` is a
 * native memmem, so a query scans the whole vault in tens of milliseconds —
 * against 1.6s for `grep -r` over the same files.
 *
 * It costs no extra IO: the index build already reads every body to find titles
 * and resolve backlinks, and used to throw the text away.
 */
export interface ContentIndex {
  buf: Buffer
  /** Byte offset where each note's text starts, ascending. */
  starts: number[]
  /** Vault-relative path per entry, parallel to `starts`. */
  paths: string[]
}

/** One open task, and the note and line that hold it. */
export interface TaskEntry {
  path: string
  /** The note's title, so a hit can say where it lives without a second lookup. */
  title: string
  line: number
  text: string
  /** Folded, so a search for "krakow" finds Kraków. */
  find: string
}

/** One open comment, and the note that holds it. */
export interface CommentEntry {
  path: string
  title: string
  /** The note's mtime: ⌘K lists the comments in the notes touched last first. */
  edited: number
  text: string
  anchor: string | null
  from: number
  /** Folded: its words, what it is about, and its note's title. */
  find: string
}

export interface NoteIndex {
  content: ContentIndex
  /** Open `- [ ]` lines across the vault — the palette searches these too. */
  tasks: TaskEntry[]
  /** Open review comments across the vault — ⌘K's COMMENTS. */
  comments: CommentEntry[]
  entries: IndexEntry[]
  bySlug: Map<string, string>
  byPath: Map<string, string>
  /** Keyed by the real vault-relative path, for turning a hit into a NoteRef. */
  byRel: Map<string, IndexEntry>
  /** note → the notes its body links out to, resolved, deduped, in body order. */
  outlinks: Map<string, string[]>
  /** note → the notes whose bodies link at it. */
  backlinkSources: Map<string, string[]>
  /** Derived from `backlinkSources`, never tallied separately. */
  backlinks: Map<string, number>
  builtAt: number
  /** What the vault looked like when this was built — see notesChanged. */
  sig: string
}

let index: NoteIndex | null = null
let building: Promise<NoteIndex> | null = null
/** Bumped on every invalidation, so a build begun before one cannot install itself. */
let generation = 0
/** The generation `building` was begun in — see noteIndex. */
let buildingGen = -1

/**
 * Drops the index because the vault it describes has moved on. The generation
 * bump is what a bare `index = null` could not do: a build takes seconds over
 * 70MB, and one that started before the change would otherwise resolve
 * afterwards and install a picture of the vault that predates it.
 */
function invalidate(): void {
  index = null
  generation++
}

async function walk(dir: string, out: string[]): Promise<void> {
  let entries
  try {
    entries = await readdir(dir, { withFileTypes: true })
  } catch {
    return
  }
  for (const e of entries) {
    if (e.name.startsWith('.') || SKIP_DIRS.has(e.name)) continue
    const full = join(dir, e.name)
    if (e.isDirectory()) await walk(full, out)
    else if (extname(e.name) === '.md') out.push(full)
  }
}

/**
 * Whether the walk would ever find this path. A note under `.trash/`, or any
 * other dot or skipped folder, is on disk and never in a build: patched into
 * the index it is a key no rebuild makes and a signature the sweep can never
 * match. Those are dropped for, as before.
 */
function walked(rel: string): boolean {
  return !rel.split('/').some((s) => s.startsWith('.') || SKIP_DIRS.has(s))
}

/**
 * A path from the renderer spelled the way the walk spells it, or null if it
 * climbs out of the vault. `./garden/x`, `garden//x` and `garden/./x` are all
 * `garden/x` on disk, but only that spelling is a key the index and the sweep
 * agree on: grafted as `./garden/x.md`, a note is a phantom `./garden` folder
 * in the tree, a `[[garden/x]]` that misses it, and a signature mismatch on the
 * next tick. The `..` test is the one `startsWith(VAULT)` cannot make —
 * `../Notes-old/x` passes that whenever the sibling folder's name begins with
 * the vault's.
 */
function vaultRel(path: string): string | null {
  const rel = relative(VAULT, join(VAULT, path))
  return rel === '..' || rel.startsWith('../') ? null : rel
}

/**
 * THE ONE GUARD every path from the renderer goes through: a note's path,
 * spelled as the walk spells it, or null when it names no place in the vault.
 *
 * `vaultRel` and more. It hands back `''` for the vault itself — and `''`, `.`
 * and `/` were the vault to the handlers that only asked `startsWith(VAULT)`,
 * so `noteTrash('')` sent the whole of it to the Trash. An absolute path is no
 * vault path even when it happens to point inside, since `join` would quietly
 * read `/etc/hosts` as the vault's `etc/hosts`. A path beginning `~` means
 * home to whoever wrote it, never a vault folder called `~`. And a NUL is
 * where C cuts a string, so what node checks and what the system opens can be
 * two different files.
 *
 * VAULT is read here, at the call, not kept from when the module loaded — and
 * before it is set there is no note at all: `join('', path)` is a path in
 * whatever directory the process was started from.
 */
export function vaultPath(path: string): string | null {
  if (!VAULT) return null
  if (typeof path !== 'string' || !path || path.includes('\0') || isAbsolute(path)) return null
  if (path === '~' || path.startsWith('~/')) return null
  const rel = vaultRel(path)
  return rel ? rel : null
}

/**
 * A NOTE's path, for the handlers that write, trash or move one: `vaultPath`,
 * and a `.md` file the walk would find — not in `.claude/`, `.trash/` or any
 * other hidden or skipped folder. The vault's `.claude/settings.json` is where
 * a Claude session started in the vault reads its hooks from, so a note
 * handler that could write or move it could have a page run commands. Reading
 * stays on `vaultPath`; only what changes the disk is held to being a note.
 */
export function notePath(path: string): string | null {
  const rel = vaultPath(path)
  if (rel === null || extname(rel).toLowerCase() !== '.md' || !walked(rel)) return null
  return rel
}

/** `[[path/to/note|alias]]` and `[[bare-name]]` are both in heavy use. */
export function linkTargets(body: string): string[] {
  const out: string[] = []
  const re = /\[\[([^\]|#]+)(?:[#|][^\]]*)?\]\]/g
  let m: RegExpExecArray | null
  while ((m = re.exec(body)) !== null) out.push(m[1].trim())
  return out
}

function stripFrontmatter(raw: string): string {
  if (!raw.startsWith('---')) return raw
  const end = raw.indexOf('\n---', 3)
  if (end === -1) return raw
  return raw.slice(raw.indexOf('\n', end + 1) + 1)
}

/**
 * The first H1 names the note — even when it is empty, which is what a note
 * made without a name looks like: `# ` and nothing after it, until the reader
 * types one. An empty first H1 falls back to the filename, `untitled`.
 *
 * `[^\S\n]` and not `\s`, because `\s` crosses the line break: `#\s+(.+)` read
 * a nameless note's first line of prose as its title, so the list named it
 * after its opening sentence while the head's title field sat empty. It is
 * also why an empty H1 is not skipped for a later one — the `# Section` a
 * reader writes further down is theirs, not the note's name.
 */
function titleOf(raw: string, rel: string): string {
  const body = stripFrontmatter(raw)
  const h1 = /^#(?:[^\S\n]+(.*))?$/m.exec(body)
  const title = h1?.[1]?.trim()
  if (title) return title
  /*
   * A NOTE NOBODY NAMED is called by what it says. ⌘N makes `untitled.md`, and
   * a thought jotted into it without a title would otherwise sit in the rail as
   * "untitled 7" among six others — the one list where you go looking for it.
   * So it is known by its first line of writing, as a notes app names a note,
   * and "Untitled" only while there is nothing in it at all.
   */
  if (UNTITLED.test(rel)) return firstWords(body) || 'Untitled'
  return basename(rel, '.md').replace(/[-_]/g, ' ')
}


/** Both keys a note answers to in `byPath`: its path with the `.md`, and without. */
function pathKeys(rel: string): string[] {
  return [rel.toLowerCase(), rel.replace(/\.md$/, '').toLowerCase()]
}

/**
 * Open tasks, out of a pass that is already reading the note. The palette
 * indexes TASKS, not just objects: an open `- [ ]` line inside any note is
 * findable by its own words, and lands you in the note that holds it. Closed
 * ones are left out — a done task is not something you are looking for.
 */
function tasksOf(rel: string, title: string, raw: string, into: TaskEntry[]): void {
  const lines = raw.split('\n')
  for (let li = 0; li < lines.length; li += 1) {
    const t = /^\s*[-*+]\s+\[ \]\s+(.+)$/.exec(lines[li])
    if (!t) continue
    const text = t[1].trim()
    if (!text) continue
    into.push({ path: rel, title, line: li, text, find: fold(text) })
    // A vault this size can hold thousands; the cap keeps the index honest
    // about being a search aid rather than a task manager.
    if (into.length >= 4000) break
  }
}

/**
 * Open comments, out of the same pass — found by READ's own grammar
 * (`shared/comments.ts`), in the body as the app holds it, frontmatter off, so
 * where one is matches where the open note has it.
 */
function commentsOf(rel: string, title: string, raw: string, edited: number, into: CommentEntry[]): void {
  if (!raw.includes('{>>')) return
  for (const c of findComments(stripFrontmatter(raw).replace(/\r\n/g, '\n'))) {
    const anchor = c.anchor?.words ?? null
    into.push({ path: rel, title, edited, text: c.text, anchor, from: c.from, find: fold(`${c.text} ${anchor ?? ''} ${title}`) })
    if (into.length >= 4000) break
  }
}

/**
 * Where one body's `[[links]]` land: resolved, deduped, in body order. The one
 * rule for it — the build uses it for every note, and a note patched into the
 * index later uses it too, so the two cannot come to disagree.
 */
function linksOut(idx: NoteIndex, from: string, body: string): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const target of linkTargets(body)) {
    const hit = resolveIn(idx, target)
    // A note that links to itself is not a link anywhere. Daily notes do it in
    // passing, and it used to inflate their own backlink count.
    if (!hit || hit === from || seen.has(hit)) continue
    seen.add(hit)
    out.push(hit)
  }
  return out
}

async function build(): Promise<NoteIndex> {
  const files: string[] = []
  await walk(VAULT, files)

  const entries: IndexEntry[] = []
  const bySlug = new Map<string, string>()
  const byPath = new Map<string, string>()
  const byRel = new Map<string, IndexEntry>()
  const outlinks = new Map<string, string[]>()
  const backlinkSources = new Map<string, string[]>()
  const backlinks = new Map<string, number>()
  const bodies: string[] = []
  const tasks: TaskEntry[] = []
  const comments: CommentEntry[] = []
  const chunks: Buffer[] = []
  const starts: number[] = []
  const contentPaths: string[] = []
  let at = 0

  for (const full of files) {
    const rel = relative(VAULT, full)
    const slug = basename(rel, '.md').toLowerCase()
    let body = ''
    let edited = 0
    try {
      // The stat rides along with a read the build is doing anyway: one a note
      // costs tens of milliseconds in all against the 70MB already being parsed.
      const [raw, st] = await Promise.all([readFile(full, 'utf8'), stat(full)])
      body = raw
      edited = st.mtimeMs
    } catch {
      continue
    }
    const title = titleOf(body, rel)
    // Folded like the titles are, so a content search for "krakow" finds
    // Kraków. Measured at ~650ms over a 70MB vault — worth it, and paid once
    // inside a pass that is already reading every file. Skipping the fold for
    // text with no accents was tried and dropped: most notes carry some
    // non-ASCII (curly quotes, em dashes) and the gate saved 5%.
    // A NUL between notes stops a match spanning the seam between two files.
    const chunk = Buffer.from(`${fold(body)}\0`, 'utf8')
    chunks.push(chunk)
    starts.push(at)
    contentPaths.push(rel)
    at += chunk.length
    const entry: IndexEntry = { path: rel, title, slug, edited, find: fold(`${title}\n${rel}`) }
    entries.push(entry)
    byRel.set(rel, entry)
    // First writer wins, so a shallower path keeps an ambiguous bare name.
    if (!bySlug.has(slug)) bySlug.set(slug, rel)
    for (const key of pathKeys(rel)) byPath.set(key, rel)
    bodies.push(body)
    tasksOf(rel, title, body, tasks)
    commentsOf(rel, title, body, edited, comments)
  }

  // Second pass: resolve every link so backlink counts are real, not guessed.
  const content: ContentIndex = { buf: Buffer.concat(chunks), starts, paths: contentPaths }
  // Let the per-note buffers go now that they are one.
  chunks.length = 0

  // `sig` is filled in on the way out; resolveIn below only needs the maps.
  const partial = {
    content,
    tasks,
    comments,
    entries,
    bySlug,
    byPath,
    byRel,
    outlinks,
    backlinkSources,
    backlinks,
    builtAt: 0,
    sig: ''
  }
  // `bodies` is index-parallel to `entries`: the loop above pushes to both once
  // per file, and its single `continue` — an unreadable file — skips both.
  for (let i = 0; i < bodies.length; i++) {
    const from = entries[i].path
    const out = linksOut(partial, from, bodies[i])
    for (const hit of out) {
      const sources = backlinkSources.get(hit)
      if (sources) sources.push(from)
      else backlinkSources.set(hit, [from])
    }
    if (out.length) outlinks.set(from, out)
  }
  for (const [path, sources] of backlinkSources) backlinks.set(path, sources.length)

  return { ...partial, builtAt: Date.now(), sig: signatureOf(entries) }
}

/**
 * `[[note]]`, `[[people/ada-lovelace]]` and `[[note.md]]` all land on the
 * same file — both conventions are in common use.
 */
export function resolveIn(idx: NoteIndex, target: string): string | null {
  // Claude names files by their full path as readily as by a vault-relative
  // one. The index is keyed relative, so an absolute path inside the vault is
  // made relative first; one outside it is not ours and resolves to nothing
  // rather than falling through to the basename match, which would happily
  // land any /etc/hosts.md on a note that shares its name.
  let rel = target
  // `[[note#Heading]]` names the note, not a file called "note#Heading" — the
  // heading is the reader's business once the note itself is open.
  const hash = rel.indexOf('#')
  if (hash !== -1) rel = rel.slice(0, hash).trim()
  if (rel.startsWith('/')) {
    const root = VAULT.endsWith('/') ? VAULT : `${VAULT}/`
    if (!rel.toLowerCase().startsWith(root.toLowerCase())) return null
    rel = rel.slice(root.length)
  }
  const t = rel.replace(/\.md$/, '').toLowerCase()
  return idx.byPath.get(t) ?? idx.byPath.get(`${t}.md`) ?? idx.bySlug.get(basename(t)) ?? null
}

/**
 * The note at an exact vault path, or null. Deliberately not `resolveIn`: that
 * one falls back to matching a bare name anywhere in the vault, which is right
 * for a `[[wikilink]]` someone typed and wrong for a path a thread touched —
 * it would read the folder `projects/kitchen` as the unrelated note
 * `inbox/transcripts/kitchen.md`.
 */
export function noteAt(idx: NoteIndex, path: string): string | null {
  return idx.byPath.get(path.toLowerCase()) ?? null
}

/**
 * Notes by name. Titles and paths only — a vault in daily use can be 70MB of
 * markdown, which is too much to hold lowercased in memory for matching and
 * too much to re-read on every keystroke. Titles here are the notes' own H1s,
 * so they carry most of what a search is reaching for.
 */
export async function searchNotes(query: string, limit = 12): Promise<NoteRef[]> {
  const q = parseQuery(query)
  if (q.phrase.length < 2) return []
  const idx = await noteIndex()

  const hits: { entry: IndexEntry; score: number }[] = []
  for (const e of idx.entries) {
    const [title, path] = e.find.split('\n')
    let score = 0
    if (title === q.phrase) score = 100
    else if (title.startsWith(q.phrase)) score = 80
    else if (title.includes(q.phrase)) score = 64
    else if (e.slug.includes(q.phrase)) score = 48
    else if (path.includes(q.phrase)) score = 32
    // "beds spring" should still find "Spring beds, March 2026" — the shared
    // WORDS rung, which every other corpus in the app now uses too.
    else if (rank(q, e.find) === 1) score = 40
    if (!score) continue
    // At equal quality a short title is the better match: the query is more of it.
    hits.push({ entry: e, score: score - Math.min(16, e.title.length / 10) })
  }

  return hits
    .sort((a, b) => b.score - a.score || a.entry.title.localeCompare(b.entry.title))
    .slice(0, limit)
    .map(({ entry }) => ({ path: entry.path, title: entry.title, folder: dirname(entry.path) }))
}

/**
 * Every note, for the browser's ALL and TREE views. Titles and paths only —
 * about 220KB across the wire, once, against 70MB of bodies that stay here.
 * The renderer builds the folder tree from this; main has no opinion on it.
 */
export async function listNotes(): Promise<NoteEntry[]> {
  const idx = await noteIndex()
  return idx.entries.map((e) => ({
    path: e.path,
    title: e.title,
    folder: dirname(e.path),
    edited: e.edited
  }))
}

/** Which note a byte offset falls in: the last start at or before it. */
function noteAtOffset(idx: ContentIndex, offset: number): number {
  let lo = 0
  let hi = idx.starts.length - 1
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1
    if (idx.starts[mid] <= offset) lo = mid
    else hi = mid - 1
  }
  return lo
}

/**
 * Notes whose *text* contains the query. Substring, not tokens: a vault is
 * full of hyphenated slugs and quoted phrases, and "distributed gov" should
 * find them mid-word the way a reader means it.
 *
 * The snippet comes back from the folded buffer, so it is lowercase — folding
 * changes byte lengths, so an offset here cannot be mapped back onto the
 * original file to recover its case.
 */
/**
 * Open tasks matching a query. Scored the way the note search is: an exact
 * prefix beats a word-start beats a substring, so typing the first few letters
 * of a task surfaces it rather than everything that merely contains them.
 */
export async function searchTasks(query: string, limit = 20): Promise<TaskHit[]> {
  const q = parseQuery(query)
  if (q.empty) return []
  const idx = await noteIndex()
  const out: { hit: TaskHit; score: number }[] = []
  for (const t of idx.tasks) {
    const got = rank(q, t.find)
    if (!got) continue
    const at = t.find.indexOf(q.phrase)
    // A task whose own words are the query, in order, beats one that merely
    // holds them scattered; within the phrase rung, a prefix beats a word start
    // beats a substring.
    const score =
      got !== PHRASE ? 30 : at === 0 ? 100 : /\s/.test(t.find[at - 1] ?? '') ? 70 : 40
    out.push({
      hit: { path: t.path, title: t.title, folder: dirname(t.path), line: t.line, text: t.text },
      score
    })
  }
  out.sort((a, b) => b.score - a.score || a.hit.text.length - b.hit.text.length)
  return out.slice(0, limit).map((o) => o.hit)
}

/**
 * Open comments, for ⌘K's COMMENTS: matching a query on their words, what they
 * are about and their note's title — or, with nothing typed, all of them, in
 * the notes touched last first and in each note's own order.
 */
export async function searchComments(query: string, limit = 60): Promise<CommentHit[]> {
  const q = parseQuery(query)
  const idx = await noteIndex()
  const scored: { c: CommentEntry; score: number }[] = []
  for (const c of idx.comments) {
    if (q.empty) {
      scored.push({ c, score: 0 })
      continue
    }
    const got = rank(q, c.find)
    if (got) scored.push({ c, score: got })
  }
  scored.sort((a, b) => b.score - a.score || b.c.edited - a.c.edited || (a.c.path === b.c.path ? a.c.from - b.c.from : 0))
  return scored.slice(0, limit).map(({ c }) => ({
    path: c.path,
    title: c.title,
    folder: dirname(c.path),
    text: c.text,
    anchor: c.anchor,
    from: c.from,
    edited: c.edited
  }))
}

/**
 * How many open tasks the vault holds. The index keeps only unchecked `- [ ]`
 * lines — a done task is not something you are looking for — so the count is
 * its length, no second pass.
 */
export async function openTaskCount(): Promise<number> {
  return (await noteIndex()).tasks.length
}

/**
 * One note's text out of the shared buffer, folded already, as a string.
 * Only ever taken for a note that is known to hold something.
 */
function bodyOf(content: ContentIndex, i: number): string {
  const end = i + 1 < content.starts.length ? content.starts[i + 1] : content.buf.length
  return content.buf.subarray(content.starts[i], end).toString('utf8')
}

/** The matched line around an offset, bounded and tidied. */
function lineAround(text: string, at: number): string {
  const lineStart = Math.max(0, text.lastIndexOf('\n', at) + 1)
  const nl = text.indexOf('\n', at)
  const lineEnd = nl === -1 ? text.length : nl
  const from = Math.max(lineStart, at - 90)
  const raw = text
    .slice(from, Math.min(lineEnd, from + 190))
    .replace(/\0/g, ' ')
    .trim()
  return `${from > lineStart ? '…' : ''}${raw}${from + 190 < lineEnd ? '…' : ''}`
}

export async function searchContent(query: string, limit = 20): Promise<NoteHit[]> {
  const q = parseQuery(query)
  if (q.phrase.length < 3) return []
  const idx = await noteIndex()
  const { content } = idx
  const hits: NoteHit[] = []
  const seen = new Set<number>()

  const take = (i: number, at: number, text?: string): void => {
    if (seen.has(i)) return
    seen.add(i)
    const rel = content.paths[i]
    const entry = idx.byRel.get(rel)
    const body = text ?? bodyOf(content, i)
    hits.push({
      path: rel,
      title: entry?.title ?? basename(rel, '.md'),
      folder: dirname(rel),
      snippet: lineAround(body, at)
    })
  }

  /*
   * THE PHRASE, over the whole vault at once. `Buffer.indexOf` is a native
   * memmem, so this is a single pass of 70MB in tens of milliseconds and it is
   * what almost every query is answered by.
   */
  const needle = Buffer.from(q.phrase, 'utf8')
  let from = 0
  while (hits.length < limit) {
    const at = content.buf.indexOf(needle, from)
    if (at === -1) break
    const i = noteAtOffset(content, at)
    from = at + needle.length
    take(i, at - content.starts[i])
  }

  /*
   * THEN THE WORDS, and only if the phrase did not fill the page. `vienna
   * facts` is not a string anybody wrote; it is two things a reader wants in
   * the same note, and until now it returned nothing at all.
   *
   * Costed deliberately. The rarest word is scanned over the whole buffer once
   * — one more pass, not one per word — and only the notes it lands in are read
   * out and tested for the rest. A word that is in half the vault therefore
   * costs half the vault in string reads, which is why the rarest one leads.
   */
  if (hits.length < limit && q.terms.length > 1) {
    const endOf = (i: number): number =>
      i + 1 < content.starts.length ? content.starts[i + 1] : content.buf.length
    /**
     * Where a word sits inside note `i`, or -1 — a native scan, no string cut.
     *
     * ON A SUBARRAY, which is the whole performance of this. `Buffer.indexOf`
     * takes a start and no end, so asking the shared buffer for a word that
     * this note does not contain kept scanning — through every note after it,
     * to the end of 70MB. Four hundred candidates paying that is where a
     * two-word query's 100ms went. `subarray` is a view, not a copy: the same
     * bytes, told where to stop.
     */
    const inNote = (i: number, nd: Buffer): number =>
      content.buf.subarray(content.starts[i], endOf(i)).indexOf(nd)
    const needles = q.terms.map((t) => ({ t, nd: Buffer.from(t, 'utf8') }))

    /*
     * ONE SCAN, on the LONGEST word, and it makes the shortlist.
     *
     * The obvious version scans every word so it can lead with the rarest —
     * and a scan is a pass over 70MB, so picking the rarest cost exactly what
     * leading with it saves: measured, two words took 100ms and three took
     * 156ms, one full pass each. The longest word is the rare one often enough,
     * and being wrong about it now costs nothing, because the other words are
     * tested inside the candidates rather than across the vault.
     */
    const lead = [...needles].sort((a, b) => b.t.length - a.t.length)[0]
    const shortlist: number[] = []
    let cur = 0
    // A word in 400 notes is a word to give up on, not one to test 400 notes
    // for — the other words in the query are what will narrow it anyway.
    while (shortlist.length < 400) {
      const at = content.buf.indexOf(lead.nd, cur)
      if (at === -1) break
      const i = noteAtOffset(content, at)
      cur = at + lead.nd.length
      if (shortlist[shortlist.length - 1] !== i) shortlist.push(i)
    }

    /*
     * Then every word, tested inside each candidate's own byte range.
     *
     * Reading the candidates out as strings and testing those was the first
     * shape this took, and it allocated 400 note bodies to throw away.
     * `Buffer.indexOf` bounded to the note asks the same question without
     * cutting anything up, and only a note that answers yes is ever turned into
     * text — one line of it, for its snippet.
     */
    for (const i of shortlist) {
      if (hits.length >= limit) break
      if (seen.has(i)) continue
      let ok = true
      let lead = -1
      let leadLen = 0
      for (const { t, nd } of needles) {
        const at = inNote(i, nd)
        if (at < 0) {
          ok = false
          break
        }
        // The snippet centres on the longest word — the specific one.
        if (t.length > leadLen) {
          leadLen = t.length
          lead = at
        }
      }
      if (ok) take(i, Math.max(0, lead))
    }
  }

  return hits
}

/** A resolved path as the note modules want it: title and folder, no body read. */
export function refIn(idx: NoteIndex, rel: string): NoteRef {
  const entry = idx.byRel.get(rel)
  return { path: rel, title: entry?.title ?? basename(rel, '.md'), folder: dirname(rel) }
}

/**
 * A cheap description of the vault's shape: every note path with its mtime,
 * hashed. Paths are sorted first so the hash does not depend on the order the
 * directory walk happened to return.
 */
function signatureOf(pairs: { path: string; edited: number }[]): string {
  const h = createHash('sha1')
  for (const p of [...pairs].sort((a, b) => (a.path < b.path ? -1 : 1))) {
    h.update(p.path)
    h.update(String(Math.round(p.edited)))
  }
  return `${pairs.length}:${h.digest('hex')}`
}

/**
 * Whether the vault has changed under us, and if so, drops the index so the
 * next read rebuilds it.
 *
 * Polled rather than watched: a vault can live on a Dropbox CloudStorage mount,
 * which does not deliver file watch events — the same reason noteMtime exists.
 * The probe is directory traversal and one stat per file, which is tens of
 * milliseconds against the 70MB of bodies a rebuild reads, so it is cheap
 * enough to run on a timer where a rebuild would not be.
 *
 * False when there is no index yet: there is nothing stale, and whoever asks
 * first will build it.
 */
export async function notesChanged(): Promise<boolean> {
  if (devEnv('LANES_DEBUG_NOTES')) console.log('[n] notesChanged index=', Boolean(index))
  if (!index) return false
  const was = index.sig
  const files: string[] = []
  await walk(VAULT, files)
  const pairs: { path: string; edited: number }[] = []
  for (const full of files) {
    try {
      pairs.push({ path: relative(VAULT, full), edited: (await stat(full)).mtimeMs })
    } catch {
      /* vanished between the walk and the stat; the next sweep will settle it */
    }
  }
  const now = signatureOf(pairs)
  if (devEnv('LANES_DEBUG_NOTES')) console.log('[n] files=', pairs.length, 'sig same?', now === index?.sig)
  // Checked again, not assumed: the walk above awaits, and a trash or a patch
  // that lost its race can drop the index while it does. Nothing left to
  // compare against is nothing stale, and `index.sig` on it would throw.
  //
  // Nor is an index that moved on while the walk was out. A patch landing
  // mid-walk — a note made in a folder already listed, a rename's relinked
  // mtimes — re-signs the index for a vault the walk saw only half of, and
  // comparing the two would read the app's own patch as a change from outside
  // and throw away the very index it kept. The next tick compares again.
  if (!index || index.sig !== was || now === index.sig) return false
  invalidate()
  return true
}

/** Built lazily — the app opens on a chat, and startup is slow enough already. */
export async function noteIndex(): Promise<NoteIndex> {
  if (index) return index
  /*
   * A build begun before the last invalidation goes only to the readers that
   * were already waiting on it. One arriving after gets a build of its own:
   * the old one may have walked the folder before the change that dropped it —
   * the note just made, the note just trashed — and since it will not install,
   * nothing would ever correct the list it answered with. The sweep would find
   * the next build agreeing with the disk and stay quiet.
   */
  if (!building || buildingGen !== generation) {
    const gen = (buildingGen = generation)
    const run = build().then((i) => {
      // Only its own slot: a superseded build finishing must not clear the
      // one that replaced it, which is still running.
      if (building === run) building = null
      // The caller still gets this one — it is the best that exists — it just
      // does not stick, so the next reader rebuilds against the vault as it is.
      if (gen === generation) index = i
      return i
    })
    building = run
  }
  return building
}

/* ---------- keeping the index, rather than rebuilding it ---------- */

/*
 * Making, renaming or moving a note used to drop the whole index, and the next
 * reader paid for it: the renderer reloads the note list the moment a note is
 * made, `readNote` asks for backlinks, and both waited on a re-read of every
 * note in the vault — one to three seconds over a real one — for a change
 * to one file. So those three now patch the live index in place instead.
 *
 * The bar for a patch is that it leaves the index as a rebuild would: the same
 * entries, keys, text, tasks and links, and a signature that matches the vault
 * — the signature most of all, because the sweep compares against it and a
 * patch that re-signs a wrong picture has hidden it from the one thing that
 * would have caught it. Where a patch cannot be sure (no built index, or the
 * index changed under it while it read) it drops the index exactly as before.
 */

/**
 * Everything that writes a note — making one, saving one, renaming, moving,
 * trashing — runs one at a time, in the order it was asked for.
 *
 * The IPC handlers are async, so the order the renderer calls in is not the
 * order they finish in, and two of these interleaving lose things. A rename
 * reads the note to rewrite its heading; a save in flight lands between that
 * read and its write, and the rename puts the old text back over the last
 * keystrokes — on nearly every new note, whose title is settled while its body
 * is still being typed. Relink does the same to a note that links here and is
 * open. And a patch checks that the index was not dropped or replaced while it
 * read, which says nothing of another patch editing it in place: a move that
 * resolves `[[b]]` before a rename has made `b` leaves out a link a rebuild
 * would find, and signs the index off as matching the disk, so the sweep never
 * looks.
 *
 * One queue rather than a lock per note, because a patch reaches the notes
 * around a note too. A save that waits behind a rename is late, not lost, and
 * nothing on screen waits for it.
 */
let queue: Promise<unknown> = Promise.resolve()

function serial<A extends unknown[], R>(
  f: (...args: A) => Promise<R>
): (...args: A) => Promise<R> {
  return (...args) => {
    const run = queue.then(() => f(...args))
    // Waited out whether it succeeds or fails, and never failing itself: one
    // write that throws must not stop every write queued behind it.
    queue = run.then(
      () => undefined,
      () => undefined
    )
    return run
  }
}

/**
 * A note's mtime, then its text — in that order, deliberately. The sweep only
 * compares mtimes, so the one recorded beside a text must be no newer than the
 * text. Read first and stat second, and a write landing in between is signed
 * off as seen while the index holds the text from before it; nothing would
 * look again. This way round the worst case is an mtime older than the text,
 * which the sweep reads as a change, and rebuilds.
 */
async function snapshot(rel: string): Promise<{ raw: string; edited: number } | null> {
  const full = join(VAULT, rel)
  try {
    const st = await stat(full)
    return { raw: await readFile(full, 'utf8'), edited: st.mtimeMs }
  } catch {
    return null
  }
}

/**
 * The notes whose `[[links]]` might land on `rel` — any link in the vault whose
 * target holds the note's bare name.
 *
 * A note arriving at a name moves OTHER notes' links, and that is the half a
 * patch would quietly miss: a `[[kickoff]]` that dangled until now lands on the
 * note just made called that — the usual reason to make it — and a
 * `[[notes/kickoff]]` that fell back to some other kickoff by its bare name now
 * finds the one at its path. Every way resolveIn reaches a note (path, path
 * without `.md`, absolute path, bare name) spells out its basename, so a target
 * without it cannot be one of them.
 *
 * Read off the folded buffer already in memory: one native scan for `[[` —
 * thousands of them in a vault in daily use — instead of a read of every
 * file. Folded text only narrows it down. The notes it returns are re-read from
 * disk and resolved properly, because resolveIn does not fold, and folding the
 * `Kraków` in a path would find it where resolveIn would not.
 */
function namers(idx: NoteIndex, rel: string): string[] {
  const { buf, paths } = idx.content
  const name = Buffer.from(fold(basename(rel, '.md')), 'utf8')
  const open = Buffer.from('[[', 'utf8')
  const out = new Set<string>()
  let at = buf.indexOf(open)
  while (at !== -1) {
    // A target ends where linkTargets ends it — `]`, `|`, `#` — or at the NUL
    // between two notes.
    let end = at + 2
    while (end < buf.length) {
      const c = buf[end]
      if (c === 0x5d || c === 0x7c || c === 0x23 || c === 0x00) break
      end += 1
    }
    if (buf.subarray(at + 2, end).indexOf(name) !== -1) {
      out.add(paths[noteAtOffset(idx.content, at)])
    }
    at = buf.indexOf(open, end)
  }
  return [...out]
}

/**
 * Backlink lists are replaced, never edited in place: relink walks one across
 * awaits, and should walk the list it started with.
 */
function addBacklink(idx: NoteIndex, target: string, source: string): void {
  const sources = [...(idx.backlinkSources.get(target) ?? []), source]
  idx.backlinkSources.set(target, sources)
  idx.backlinks.set(target, sources.length)
}

function dropBacklink(idx: NoteIndex, target: string, source: string): void {
  const sources = (idx.backlinkSources.get(target) ?? []).filter((s) => s !== source)
  // Absent rather than empty or zero, as build leaves a note nothing links to.
  if (sources.length) {
    idx.backlinkSources.set(target, sources)
    idx.backlinks.set(target, sources.length)
  } else {
    idx.backlinkSources.delete(target)
    idx.backlinks.delete(target)
  }
}

/**
 * One note's outgoing links, resolved again from its text, and the backlinks
 * that go with them moved to match — only the difference, so a note whose
 * links still land where they did touches nothing.
 */
function relinkOut(idx: NoteIndex, from: string, body: string): void {
  const was = idx.outlinks.get(from) ?? []
  const now = linksOut(idx, from, body)
  for (const target of was) if (!now.includes(target)) dropBacklink(idx, target, from)
  for (const target of now) if (!was.includes(target)) addBacklink(idx, target, from)
  if (now.length) idx.outlinks.set(from, now)
  else idx.outlinks.delete(from)
}

/**
 * The content buffer with some notes' text replaced and new notes' appended,
 * in one copy. Every note after a replaced one starts somewhere else now, so
 * the offsets are carried along by how much each replacement grew or shrank.
 * A fresh ContentIndex rather than an edited one: the old one stays whole for
 * anybody still holding it.
 */
function rechunk(content: ContentIndex, texts: Map<string, { raw: string }>): ContentIndex {
  const swap = new Map<number, Buffer>()
  const add: { rel: string; chunk: Buffer }[] = []
  for (const [rel, { raw }] of texts) {
    // Folded and NUL-ended exactly as build writes it.
    const chunk = Buffer.from(`${fold(raw)}\0`, 'utf8')
    const i = content.paths.indexOf(rel)
    if (i === -1) add.push({ rel, chunk })
    else swap.set(i, chunk)
  }
  const n = content.starts.length
  const parts: Buffer[] = []
  const starts: number[] = []
  const paths = [...content.paths]
  let cursor = 0
  let shift = 0
  for (let i = 0; i < n; i += 1) {
    const from = content.starts[i]
    starts.push(from + shift)
    const chunk = swap.get(i)
    if (!chunk) continue
    const to = i + 1 < n ? content.starts[i + 1] : content.buf.length
    parts.push(content.buf.subarray(cursor, from), chunk)
    cursor = to
    shift += chunk.length - (to - from)
  }
  parts.push(content.buf.subarray(cursor))
  let end = content.buf.length + shift
  for (const { rel, chunk } of add) {
    starts.push(end)
    paths.push(rel)
    parts.push(chunk)
    end += chunk.length
  }
  return { buf: Buffer.concat(parts, end), starts, paths }
}

interface Gathered {
  /** Notes this module just wrote: text and mtime, via snapshot. */
  written: Map<string, { raw: string; edited: number }>
  /**
   * Notes whose links may resolve differently now, and nothing more: text
   * only. Their mtimes are not this module's to vouch for — if one changed on
   * disk since the build, the entry keeps the old mtime and the sweep rebuilds.
   */
  others: Map<string, string>
}

/** Everything a patch reads, read before it touches anything. */
async function gather(written: string[], others: string[]): Promise<Gathered | null> {
  const snaps = await Promise.all(written.map((rel) => snapshot(rel)))
  const out: Gathered = { written: new Map(), others: new Map() }
  for (let i = 0; i < written.length; i += 1) {
    const snap = snaps[i]
    // A file this module has just written and cannot read back is not one to
    // guess about.
    if (!snap) return null
    out.written.set(written[i], snap)
  }
  const rest = [...new Set(others)].filter((rel) => !out.written.has(rel))
  const texts = await Promise.all(
    rest.map((rel) => readFile(join(VAULT, rel), 'utf8').catch(() => null))
  )
  for (let i = 0; i < rest.length; i += 1) {
    const raw = texts[i]
    // Gone since the build: the sweep will see it go.
    if (raw !== null) out.others.set(rest[i], raw)
  }
  return out
}

/**
 * What `gather` read, written into the index. Synchronous from end to end, so
 * no reader sees the index half way through a patch — and only ever called
 * once the caller has checked that the index it read from is still the live
 * one, with an entry already there for every written note.
 */
function apply(idx: NoteIndex, got: Gathered): void {
  const { written, others } = got
  for (const [rel, { raw, edited }] of written) {
    const entry = idx.byRel.get(rel)!
    entry.title = titleOf(raw, rel)
    entry.find = fold(`${entry.title}\n${rel}`)
    entry.edited = edited
  }
  // A rewritten note's tasks are taken again whole: lines move when text does,
  // and each one carries the note's title, which may have just changed.
  idx.tasks = idx.tasks.filter((t) => !written.has(t.path))
  for (const [rel, { raw }] of written) tasksOf(rel, idx.byRel.get(rel)!.title, raw, idx.tasks)
  // And its comments, which go as they are handled.
  idx.comments = idx.comments.filter((c) => !written.has(c.path))
  for (const [rel, { raw, edited }] of written) commentsOf(rel, idx.byRel.get(rel)!.title, raw, edited, idx.comments)
  idx.content = rechunk(idx.content, written)
  // Links last: they resolve through byPath and bySlug, which have to say
  // where every note is now before anything is resolved against them.
  for (const [rel, { raw }] of written) relinkOut(idx, rel, raw)
  for (const [rel, raw] of others) if (idx.byRel.has(rel)) relinkOut(idx, rel, raw)
  idx.sig = signatureOf(idx.entries)
}

/**
 * One new note, put into the live index — what the build would have learned
 * from it, learned from it alone, plus the notes whose links its name may now
 * answer (see namers).
 *
 * With no built index and none being built there is nothing to patch, and the
 * file is left to whichever build comes next.
 *
 * A build already running is another matter: it may have listed the note's
 * folder before the file was there or after, and nothing says which. Dropping
 * it for that was the old answer, and it bought a second full build straight
 * behind the first — the very wait a graft exists to spare, landing on every
 * note made while the sweep rebuilds. So it is waited out, and the graft then
 * patches what it missed. Through noteIndex rather than `building` itself: a
 * build begun before some other invalidation will not install, and waiting on
 * that one would leave nothing here to patch.
 */
async function graft(rel: string): Promise<void> {
  if (!walked(rel)) return invalidate()
  /*
   * NEVER WAIT ON A BUILD. Making a note used to wait out any rebuild in
   * flight — a second or three, while the caret was meant to be in the new
   * note already. With no index to patch, the build under way is told it is
   * out of date (the generation moves) and the next reader builds one that
   * holds this note. That costs a second build in the background; it costs
   * the person making the note nothing.
   */
  const waited = false
  const idx = index
  if (!idx) return invalidate()
  // Already there, having waited, is the build having walked past the file —
  // patched again all the same, off a fresh read, since the build may have
  // caught it between `wx` making it and the heading going in. Already there
  // otherwise means the index is wrong about this path — deleted outside the
  // app, and the sweep has not caught up. Not a case to patch around.
  const had = idx.byRel.has(rel)
  if (had && !waited) return invalidate()
  const got = await gather([rel], namers(idx, rel))
  if (!got || index !== idx || idx.byRel.has(rel) !== had) return invalidate()
  if (!had) {
    const slug = basename(rel, '.md').toLowerCase()
    const entry: IndexEntry = { path: rel, title: '', slug, edited: 0, find: '' }
    idx.entries.push(entry)
    idx.byRel.set(rel, entry)
    // First writer wins, as in build, and a new note is the last writer there
    // is: an ambiguous bare name stays with the note that already had it.
    if (!idx.bySlug.has(slug)) idx.bySlug.set(slug, rel)
    for (const key of pathKeys(rel)) idx.byPath.set(key, rel)
  }
  apply(idx, got)
}

/**
 * A note's identity, renamed everywhere the index holds it, without looking at
 * any text: afterwards every structure says `to` wherever it said `from`, and
 * the index is exactly as consistent as it was. What the move CHANGED — the
 * heading, the relinked notes, a bare name that now belongs to someone else —
 * is apply's to read off the files after this.
 *
 * The entry keeps its place in `entries`, `content` and the rest, so the order
 * build met the notes in is the order they are still in.
 */
function rekey(idx: NoteIndex, from: string, to: string): void {
  const entry = idx.byRel.get(from)!
  const was = entry.slug
  const slug = basename(to, '.md').toLowerCase()
  entry.path = to
  entry.slug = slug
  entry.find = fold(`${entry.title}\n${to}`)
  idx.byRel.delete(from)
  idx.byRel.set(to, entry)
  for (const key of pathKeys(from)) if (idx.byPath.get(key) === from) idx.byPath.delete(key)
  for (const key of pathKeys(to)) idx.byPath.set(key, to)
  if (idx.bySlug.get(was) === from) {
    if (slug === was) {
      // A move that keeps the filename keeps the bare name with it.
      idx.bySlug.set(slug, to)
    } else {
      // The old bare name goes where build would have put it had this note
      // never held it: the next note of that name in the order build met them.
      // Deleting it instead would strand a `[[name]]` that a rebuild resolves.
      const heir = idx.entries.find((e) => e !== entry && e.slug === was)
      if (heir) idx.bySlug.set(was, heir.path)
      else idx.bySlug.delete(was)
    }
  }
  // The new one only if nobody holds it: a `[[name]]` that already lands on
  // some other note keeps landing there.
  if (!idx.bySlug.has(slug)) idx.bySlug.set(slug, to)
  const at = idx.content.paths.indexOf(from)
  if (at !== -1) idx.content.paths[at] = to
  for (const t of idx.tasks) if (t.path === from) t.path = to
  for (const c of idx.comments) if (c.path === from) c.path = to
  const out = idx.outlinks.get(from)
  if (out) {
    idx.outlinks.delete(from)
    idx.outlinks.set(to, out)
    for (const target of out) {
      const sources = idx.backlinkSources.get(target)
      if (sources) idx.backlinkSources.set(target, sources.map((s) => (s === from ? to : s)))
    }
  }
  const back = idx.backlinkSources.get(from)
  if (back) {
    idx.backlinkSources.delete(from)
    idx.backlinkSources.set(to, back)
    idx.backlinks.delete(from)
    idx.backlinks.set(to, back.length)
    for (const source of back) {
      const links = idx.outlinks.get(source)
      if (links) idx.outlinks.set(source, links.map((l) => (l === from ? to : l)))
    }
  }
}

/**
 * The index, told a note moved — rather than dropped because one did.
 *
 * Three kinds of note can read differently afterwards, and each is re-read:
 * the note itself (its heading may have been rewritten); every note that
 * pointed at it, from `pointing`, taken off the index before relink touched
 * anything — the relinked ones now name the new path, and the ones relink
 * skipped (the read-only inbox, a file it could not write) now land on
 * whichever note inherits the old name, or nowhere, which is what a rebuild
 * would make of them too; and every note whose links might name the new path
 * (namers). The first two kinds were written here, so their mtimes are
 * re-signed; the third was only read.
 */
async function follow(
  idx: NoteIndex,
  from: string,
  to: string,
  relinked: string[],
  pointing: string[]
): Promise<void> {
  if (!walked(to) || index !== idx || !idx.byRel.has(from) || idx.byRel.has(to)) {
    return invalidate()
  }
  const others = [...pointing, ...namers(idx, to)].filter((p) => p !== from)
  const got = await gather([to, ...relinked], others)
  // Re-checked after the reads: a sweep may have dropped the index while they
  // were out, or a build replaced it. Another patch cannot have — see serial.
  if (!got || index !== idx || !idx.byRel.has(from) || idx.byRel.has(to)) return invalidate()
  if (relinked.some((rel) => !idx.byRel.has(rel))) return invalidate()
  rekey(idx, from, to)
  apply(idx, got)
}

export async function resolveLink(target: string): Promise<string | null> {
  return resolveIn(await noteIndex(), target)
}

/**
 * Where a note points and what points back at it — the `[[wikilink]]` graph the
 * navigator walks, read off the bodies themselves rather than a map kept beside
 * them.
 *
 * `noteAt` rather than `resolveIn`: this is a path the app already holds, not a
 * name someone typed, and the bare-name fallback would land a folder on an
 * unrelated note that happens to share its last segment.
 */
export async function noteLinks(rel: string): Promise<NoteLinks> {
  const idx = await noteIndex()
  const at = noteAt(idx, rel)
  if (!at) return { out: [], back: [] }
  const refs = (paths: string[]): NoteRef[] => paths.map((p) => refIn(idx, p))
  return {
    out: refs(idx.outlinks.get(at) ?? []),
    // Body order means something going out and nothing coming in, so the
    // backlinks are sorted into the order the rail reads them in.
    back: refs(idx.backlinkSources.get(at) ?? []).sort((a, b) => a.title.localeCompare(b.title))
  }
}

export async function readNote(path: string): Promise<Note | null> {
  const rel = vaultPath(path)
  if (rel === null) return null
  const full = join(VAULT, rel)
  /*
   * NOT HALFWAY THROUGH OUR OWN WRITE. Writes wait in a queue that reads never
   * joined, and a write empties the file before it fills it again — so a note
   * opened a moment after its last words were sent read back as the text from
   * before them, as nothing at all, or cut off mid-sentence, and the editor
   * took that for the note. A write of THIS note, queued or running, is waited
   * out first. Only this note's: a note is not to wait on another's save to open.
   */
  await landing.get(rel)?.then(
    () => undefined,
    () => undefined
  )
  try {
    // The index only adds the backlink count here, and a note is not to wait
    // for a rebuild of the whole vault to open. Whatever index exists answers;
    // with none, one is started for the next reader and the count is 0 for now.
    //
    // The mtime FIRST, then the words — never both at once. Read together, a
    // write landing between the two paired the old words with the new mtime:
    // the poll took the old words as the note, recorded the new mtime as seen,
    // and the next save went over the change it had never shown. Stat first,
    // the mtime can only be older than the words, and an older mtime is one the
    // next poll reads again.
    const st = await stat(full)
    const raw = await readFile(full, 'utf8')
    const idx = index
    if (!idx) void noteIndex().catch(() => null)
    return {
      path: rel,
      title: titleOf(raw, rel),
      // Not trimmed: the body is written straight back, so trimming here would
      // silently eat leading blank lines from the file on the first edit.
      body: stripFrontmatter(raw),
      created: st.birthtimeMs || st.mtimeMs,
      edited: st.mtimeMs,
      backlinks: idx?.backlinks.get(rel) ?? 0,
      readOnly: isReadOnly(rel),
      folder: dirname(rel)
    }
  } catch {
    return null
  }
}

/**
 * Writes the body back, preserving whatever frontmatter was there — the app
 * edits prose, it does not own a note's metadata.
 */
/**
 * Creates a note and returns its vault path.
 *
 * `writeNote` cannot do this: it reads the file first to preserve frontmatter,
 * so a path that does not exist yet fails at the read. Creating is a different
 * operation and gets its own guards — chiefly that it refuses to write over
 * something. A "new note" that silently replaces a note you already had is a
 * much worse thing than one that tells you the name is taken.
 *
 * `name` may carry a folder: "garden/kickoff" lands in the folder, "kickoff" in
 * `into`. The filename is slugged; the title is kept as typed, because it is
 * the H1 and that is what the vault reads titles from.
 */
/** A title as a filename: the one rule, shared by making a note and renaming one. */
function slugOf(title: string): string {
  return title
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

/**
 * Rewrites every `[[wikilink]]` that pointed at `from` so it points at `to`.
 *
 * A note that moves or is renamed takes its own links with it and leaves
 * everything aimed AT it behind — so this runs on the notes the index already
 * knows link there, and nowhere else. Each target is resolved the way the app
 * resolves it when you click it, so only links that actually landed on this
 * note are touched; a `[[oslo]]` that resolved somewhere else is left alone.
 *
 * The SHAPE the author wrote is kept: a bare name stays a bare name, a path
 * stays a path, and `#heading` and `|alias` ride along untouched. Rewriting a
 * bare name into a full path would be correct and unreadable.
 *
 * Returns the notes it rewrote, rather than how many: those are notes whose
 * text changed under the index, and it re-reads them (see follow).
 */
async function relink(idx: NoteIndex, from: string, to: string): Promise<string[]> {
  const sources = idx.backlinkSources.get(from) ?? []
  const bare = basename(to).replace(/\.md$/, '')
  const full = to.replace(/\.md$/, '')
  const touched: string[] = []
  /** The names that reached the note before it moved — asked of the index now, while it still knows. */
  const names = new Map<string, boolean>()
  const lands = (name: string): boolean => {
    const n = name.trim()
    if (!names.has(n)) names.set(n, resolveIn(idx, n) === from)
    return names.get(n) ?? false
  }
  const rewrite = (text: string): string =>
    text.replace(/(!?\[\[)([^\]]+)(\]\])/g, (whole, open, inner: string, close) => {
      // `target#heading|alias`, and a pipe may be escaped inside a table cell.
      const pipe = inner.search(/(?<!\\)\|/)
      const target = pipe === -1 ? inner : inner.slice(0, pipe)
      const rest = pipe === -1 ? '' : inner.slice(pipe)
      const hash = target.indexOf('#')
      const name = hash === -1 ? target : target.slice(0, hash)
      const heading = hash === -1 ? '' : target.slice(hash)
      if (!lands(name)) return whole
      return `${open}${name.includes('/') ? full : bare}${heading}${rest}${close}`
    })
  for (const src of sources) {
    // A note in a read-only folder keeps the link it was written with: a
    // rename here is no licence to write there.
    if (src === from || isReadOnly(src)) continue
    const file = join(VAULT, src)
    if (!file.startsWith(VAULT)) continue
    let raw: string
    try {
      raw = await readFile(file, 'utf8')
    } catch {
      continue
    }
    const next = rewrite(raw)
    if (next === raw) continue
    try {
      await writeFile(file, next, 'utf8')
      ownMtime.set(src, (await stat(file)).mtimeMs)
      // Done behind the note's editor, which may be open with words on their
      // way: the same rewrite is made in whatever the app writes to it next.
      rewriteAlso(src, rewrite)
      touched.push(src)
    } catch {
      /* a note we cannot write is a link left pointing at the old name */
    }
  }
  return touched
}

/**
 * Move a note to another path, links and all: the file, the `# heading` if it
 * is the note's name rather than something the reader wrote, and every
 * `[[wikilink]]` aimed at it.
 *
 * Renaming and moving are ONE operation with two callers — a rename changes the
 * filename, a move changes the folder, and both are "this note now lives at a
 * different path". Splitting them would be two chances to forget the links.
 */
const relocate = serial(async (
  path: string,
  target: string,
  heading: string | null
): Promise<{ ok: boolean; path?: string; reason?: string; relinked?: number; relinkedPaths?: string[]; edited?: number }> => {
  // Both as the walk spells them, before anything is checked against them: the
  // index is keyed that way, follow patches under `to`, and `./inbox/x` is in
  // a read-only `inbox` all the same. See vaultPath. Out of a read-only folder
  // and into one are both refused: either way a note there changes.
  const rel = notePath(path)
  const to = notePath(target)
  if (rel === null || to === null) return { ok: false, reason: 'outside vault' }
  if (isReadOnly(rel) || isReadOnly(to)) return { ok: false, reason: READ_ONLY }
  const from = join(VAULT, rel)
  const dest = join(VAULT, to)
  if (from === dest) return { ok: true, path: rel, relinked: 0 }
  try {
    await stat(dest)
    return { ok: false, reason: 'a note is already there' }
  } catch {
    /* the good case: nothing in the way */
  }
  // The links are rewritten BEFORE the move, while the index still resolves
  // the old path — it is the thing that says which notes point here. Who that
  // is gets kept aside too, before anything is rewritten: follow re-reads them.
  const idx = await noteIndex()
  const pointing = idx.backlinkSources.get(rel) ?? []
  let relinked: string[] = []
  try {
    relinked = await relink(idx, rel, to)
  } catch {
    /* a link left behind is worth less than the move itself failing */
  }
  /** The heading line the move replaced, if it wrote one. */
  let renamedFrom: string | null = null
  try {
    if (heading !== null) {
      const raw = await readFile(from, 'utf8')
      // Below the frontmatter, which is kept byte for byte: a `# comment` in
      // YAML is not the note's name.
      const body = stripFrontmatter(raw)
      const lines = body.split('\n')
      // The line titleOf names the note from: the first H1, EMPTY OR NOT. An
      // empty one is how a nameless note starts, and it is exactly the line a
      // rename has to fill — skipping it would overwrite the first `# ` further
      // down instead, a heading the reader wrote.
      const at = lines.findIndex((l) => /^#(?:\s|$)/.test(l))
      if (at !== -1) {
        renamedFrom = lines[at].replace(/\r$/, '')
        // Up to the line's first `\r`, not all of it: in a note whose lines end
        // `\r\n` that is the `\r` the split left on it, and a stray `\r` is a
        // break to the editor — the words after it are a line of their own.
        lines[at] = lines[at].replace(/^[^\r]*/, () => `# ${heading}`)
        await writeFile(from, raw.slice(0, raw.length - body.length) + lines.join('\n'), 'utf8')
      }
    }
    await mkdir(dirname(dest), { recursive: true })
    await rename(from, dest)
  } catch (err) {
    return { ok: false, reason: String(err) }
  }
  // Writes already asked for under the old path follow the note, rather than
  // make a file there again (see `movedAway`).
  movedAway.set(rel, { to, seq: writeSeq })
  movedAway.delete(to)
  // The move's own mtime — the heading it wrote moved it — so the app's next
  // save of the note is not taken for somebody else's change.
  let edited: number | undefined
  try {
    edited = (await stat(dest)).mtimeMs
    ownMtime.set(to, edited)
  } catch {
    /* gone again already: the next save finds out */
  }
  ownMtime.delete(rel)
  const kept = rewrites.get(rel)
  rewrites.delete(rel)
  if (kept) rewrites.set(to, kept)
  // The heading the move wrote, in words sent from before it too — when it
  // replaced one. Naming an untitled note fills an empty `# `, which the words
  // typed into the title field already say.
  if (renamedFrom !== null && heading !== null && renamedFrom.replace(/^#+/, '').trim()) {
    const was = renamedFrom
    rewriteAlso(to, (text) => {
      const body = stripFrontmatter(text)
      const lines = body.split('\n')
      const at = lines.findIndex((l) => /^#(?:\s|$)/.test(l))
      if (at === -1 || lines[at].replace(/\r$/, '').trim() !== was.trim()) return text
      lines[at] = lines[at].replace(/^[^\r]*/, () => `# ${heading}`)
      return text.slice(0, text.length - body.length) + lines.join('\n')
    })
  }
  // Patched, not dropped: a rename is the second half of making a note — the
  // untitled one gets its name — and paying a rebuild here would only move the
  // wait from the making to the naming.
  await follow(idx, rel, to, relinked, pointing)
  return { ok: true, path: to, relinked: relinked.length, relinkedPaths: relinked, edited }
})

/** Rename a note: a new name, the same folder. */
export async function renameNote(
  path: string,
  name: string,
  opts: { freeName?: boolean } = {}
): Promise<{ ok: boolean; path?: string; reason?: string; relinked?: number; relinkedPaths?: string[]; edited?: number }> {
  const title = name.trim()
  if (!title) return { ok: false, reason: 'no name' }
  const slug = slugOf(title)
  if (!slug) return { ok: false, reason: 'no name' }
  // Guarded before the free name is looked for: that looks on disk, beside
  // wherever the path says the note is.
  const rel = notePath(path)
  if (rel === null) return { ok: false, reason: 'outside vault' }
  const dir = dirname(rel)
  const at = (s: string): string => (dir === '.' ? `${s}.md` : `${dir}/${s}.md`)
  let to = at(slug)
  /*
   * NAMING A NOTE THAT HAD NONE never fails on the filename. A title is what
   * you called the note; the filename is only where it lives, so when another
   * note already lives at `jot-check.md` this one takes `jot-check-2.md` and
   * keeps the title exactly as typed. A deliberate rename from the tab is
   * different — it is asking for that file — and still says the name is taken.
   */
  if (opts.freeName) {
    for (let n = 2; n < 1000 && to !== rel; n += 1) {
      try {
        await stat(join(VAULT, to))
      } catch {
        break
      }
      to = at(`${slug}-${n}`)
    }
  }
  // The heading goes with it: a note's name is what its first `# ` says, and a
  // rename that left that behind would rename only the file.
  return relocate(rel, to, title)
}

/** Move a note: the same name, another folder. */
export async function moveNote(
  rel: string,
  folder: string
): Promise<{ ok: boolean; path?: string; reason?: string; relinked?: number; relinkedPaths?: string[]; edited?: number }> {
  const dir = folder.trim().replace(/^\/+|\/+$/g, '')
  const to = dir && dir !== '.' ? `${dir}/${basename(rel)}` : basename(rel)
  return relocate(rel, to, null)
}

/**
 * A note to the Trash — the system one, so it is recoverable in the Finder.
 * Deleting outright would make this the one irreversible thing in the app.
 */
export const trashNote = serial(async (path: string): Promise<{ ok: boolean; reason?: string }> => {
  const rel = notePath(path)
  if (rel === null) return { ok: false, reason: 'outside vault' }
  if (isReadOnly(rel)) return { ok: false, reason: READ_ONLY }
  const full = join(VAULT, rel)
  // A note is a file. A folder handed over here would go to the Trash with
  // every note in it, and nothing in the app throws a folder away.
  try {
    if (!(await stat(full)).isFile()) return { ok: false, reason: 'not a note' }
  } catch {
    return { ok: false, reason: 'no such note' }
  }
  try {
    await shell.trashItem(full)
  } catch (err) {
    return { ok: false, reason: String(err) }
  }
  // Anything still queued to write this note stands down: written after the
  // trash, a save made the file again — "file gone from under the editor" —
  // and the note you had just thrown away came back.
  newestWrite.set(rel, ++writeSeq)
  movedAway.delete(rel)
  ownMtime.delete(rel)
  saved.delete(rel)
  rewrites.delete(rel)
  lastSync.delete(rel)
  invalidate()
  return { ok: true }
})

export const createNote = serial(async (
  name: string,
  into: string
): Promise<{ ok: boolean; path?: string; reason?: string }> => {
  const typed = name.trim()
  if (!typed) return { ok: false, reason: 'no name' }
  const cut = typed.lastIndexOf('/')
  const title = (cut === -1 ? typed : typed.slice(cut + 1)).trim()
  const folder = cut === -1 ? into : typed.slice(0, cut)
  if (!title) return { ok: false, reason: 'no name' }
  const slug = slugOf(title)
  if (!slug) return { ok: false, reason: 'no name' }
  // As the walk spells it, before the read-only test and not after: the graft
  // below keys the index by it, the renderer opens the path handed back, and
  // `./inbox/x` is in a read-only `inbox` all the same. See vaultPath. A folder
  // typed with a slash in front — `/garden/kickoff` — means the vault's own
  // `garden`, as it always has; it is the path's other ways out that are refused.
  const under = folder.replace(/^\/+/, '')
  const rel = vaultPath(under && under !== '.' ? `${under}/${slug}.md` : `${slug}.md`)
  if (rel === null) return { ok: false, reason: 'outside vault' }
  if (isReadOnly(rel)) return { ok: false, reason: READ_ONLY }
  const full = join(VAULT, rel)
  try {
    await stat(full)
    return { ok: false, reason: 'a note with that name is already there' }
  } catch {
    /* the good case: nothing there */
  }
  try {
    await mkdir(dirname(full), { recursive: true })
    // `wx` fails if it appeared between the stat above and now.
    await writeFile(full, `# ${title}\n\n`, { encoding: 'utf8', flag: 'wx' })
  } catch (err) {
    return { ok: false, reason: String(err) }
  }
  // The index describes a vault this note was not in. It is grafted in rather
  // than waited for — the whole point is that it opens now — and grafted rather
  // than dropped, because a dropped index is a rebuild of the whole vault
  // before the note list or the note itself can answer.
  //
  // The weight layer counted chats per note before this one existed, and cannot
  // be reached from here without a cycle, so whoever calls this drops that too.
  // Skipping it is not merely slow: the graft re-signs the index, so the sweep
  // finds the vault and the index agreeing and never fires to drop it either.
  await graft(rel)
  return { ok: true, path: rel }
})

/**
 * A note with no name yet: `untitled.md` in `into`, or `untitled-2.md`,
 * `untitled-3.md`… — the first that is free. Its name arrives later, from the
 * title the reader types, by way of a rename.
 *
 * Why a file at all before there is a name: the note is open and being typed
 * into the moment it is asked for, and what is being typed has to be saved
 * somewhere. A name asked for up front is a dialog between the reader and the
 * thought they opened a note to write down.
 *
 * The body is an empty H1, `# `, which titleOf reads as no title — so the note
 * is called by its filename until it has one — and which gives the rename a
 * line to write the name into. A rename only ever rewrites a heading that is
 * there; a note that started without one would be renamed on disk and left
 * with no name inside it.
 */
export const createUntitled = serial(async (
  into: string
): Promise<{ ok: boolean; path?: string; reason?: string }> => {
  // A folder, as the setting holds it: `''`, `.` and `/` are the vault's root.
  const dir = into.trim().replace(/^\/+|\/+$/g, '')
  const folder = dir === '.' ? '' : dir
  // The key the walk would give this file, not merely a string that names it:
  // `a//b` or `a/./b` from the renderer would otherwise be indexed under a path
  // the sweep never sees, and the index would be dropped on the next tick. And
  // the one guard every path here gets — a `..` that climbs out into a sibling
  // folder whose name merely starts the same way is refused with the rest.
  const probe = vaultPath(folder ? `${folder}/untitled.md` : 'untitled.md')
  if (probe === null) return { ok: false, reason: 'outside vault' }
  if (isReadOnly(probe)) return { ok: false, reason: READ_ONLY }
  const at = (name: string): string => join(dirname(probe), name)
  try {
    await mkdir(dirname(join(VAULT, probe)), { recursive: true })
  } catch (err) {
    return { ok: false, reason: String(err) }
  }
  // Bounded only so that a filesystem answering EEXIST to everything cannot
  // hold the caller forever; nobody has a thousand untitled notes in a folder.
  for (let n = 1; n <= 1000; n += 1) {
    const rel = at(n === 1 ? 'untitled.md' : `untitled-${n}.md`)
    try {
      // `wx` is the test for free, not a stat before it: the file either did
      // not exist and is now ours, or did and is left alone. The index is not
      // asked — it can be seconds behind the disk.
      await writeFile(join(VAULT, rel), '# \n\n', { encoding: 'utf8', flag: 'wx' })
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'EEXIST') continue
      return { ok: false, reason: String(err) }
    }
    await graft(rel)
    return { ok: true, path: rel }
  }
  return { ok: false, reason: 'no free untitled name' }
})

/**
 * THE NEWEST WRITE OF A NOTE WINS — whichever road it came by.
 *
 * Writes queue behind one another (see `serial`), and each carries the whole
 * body, so only the last one asked for matters: an older write still waiting
 * when a newer one arrives is skipped rather than run. That is what makes the
 * synchronous write below safe. It is for the moment the window closes, when an
 * async write may still be queued with the body from a second ago — and without
 * this, that stale body would land AFTER the final one and put the last words
 * back out of the file.
 */
const newestWrite = new Map<string, number>()
let writeSeq = 0

/**
 * THE MTIME A CHANGE OF MAIN'S OWN LEFT A NOTE AT — a rename's heading, a link
 * a rename rewrote: changes main made on its own, behind the app's back. A file
 * still at that mtime has changed only by main's hand, however far the app's
 * idea of it has fallen behind, and the app's next save is not a conflict (see
 * `rewrites`). Not the app's saves: those the app knows of, and anything else
 * that writes the note is somebody else.
 */
const ownMtime = new Map<string, number>()

/**
 * The mtime the app's last save of each note left it at — for the window's
 * last write, when that save's reply may not have reached the app yet.
 */
const saved = new Map<string, number>()
/** `mtime` is one main gave `rel` itself — and there is one to compare it with. */
const ours = (rel: string, mtime: number): boolean => {
  const own = ownMtime.get(rel)
  return own !== undefined && Math.abs(mtime - own) <= 1
}

/**
 * WHAT A RENAME CHANGED IN A NOTE BEHIND ITS EDITOR'S BACK — the links in the
 * notes that point at it, `[[alpha]]` made `[[beta]]`, and the moved note's own
 * heading. Either note may be open with words on their way, written before the
 * rename and saved after it: the same change is made in whatever the app writes
 * to the note next, rather than that save being refused as a conflict (the
 * change was main's; see `ownMtime`) or putting the old words back — a link
 * pointing at nothing, a heading that no longer names the file. Each change
 * only finds what it changed: a link that still reaches the old name, a
 * heading still the old one. The reply carries the words as written, for the
 * editor to take up.
 */
const rewrites = new Map<string, (text: string) => string>()
const rewriteAlso = (rel: string, f: (text: string) => string): void => {
  let live = true
  const until = (t: string): string => {
    if (!live) return t
    const out = f(t)
    // Nothing of the old words left to change: the editor has taken the new
    // ones up, and what it sends from here is what it means.
    if (out === t) live = false
    return out
  }
  const was = rewrites.get(rel)
  rewrites.set(rel, was ? (t) => until(was(t)) : until)
}

/**
 * THE WINDOW'S LAST WRITE OF A NOTE, kept for a save main had already begun
 * writing when it came: that save's older words land after it, and put back.
 */
const lastSync = new Map<string, { seq: number; content: string }>()

/**
 * WHERE A NOTE WENT, for the writes already on their way to where it was.
 *
 * Naming an untitled note moves its file while its words are still being
 * saved. A save the app sent to `untitled.md` before it heard the rename had
 * happened used to run after it, find nothing there, and make the file again —
 * a stray copy holding the note's first sentences, while the renamed note, read
 * back from disk, went on without them. So a rename or a move leaves word of
 * where the note went, and the write sequence at that moment: a write asked for
 * BEFORE it goes where the note is now; one asked for after it is for whatever
 * is at the old path by then, a new untitled note included.
 */
const movedAway = new Map<string, { to: string; seq: number }>()

/** Where a write asked for at `seq` to `rel` belongs: through every move made since. */
function followMoves(rel: string, seq: number): string {
  let at = rel
  for (let i = 0; i < 8; i++) {
    const m = movedAway.get(at)
    if (!m || m.seq < seq) return at
    at = m.to
  }
  return at
}

/**
 * Each note's newest write, queued or running — what a read of that note waits
 * out first (see `readNote`). The newest is enough: the queue runs in order, so
 * every older write of the note has finished by the time it has.
 */
const landing = new Map<string, Promise<unknown>>()

function headOf(raw: string): string {
  if (!raw.startsWith('---')) return ''
  const end = raw.indexOf('\n---', 3)
  return end === -1 ? '' : raw.slice(0, raw.indexOf('\n', end + 1) + 1)
}

const writeQueued = serial(async (
  rel: string,
  body: string,
  seq: number,
  base: number | undefined
): Promise<{ ok: boolean; reason?: string; edited?: number; path?: string; merged?: string }> => {
  if (newestWrite.get(rel) !== seq) return { ok: true }
  // Asked for before the note moved: it goes where the note is now. The move
  // itself rewrote the heading and moved the mtime, so the base it was sent
  // with says nothing about the file it now lands in.
  const target = followMoves(rel, seq)
  if (target !== rel) {
    if ((newestWrite.get(target) ?? 0) > seq) return { ok: true, path: target }
    newestWrite.set(target, seq)
    rel = target
    base = undefined
  }
  const full = join(VAULT, rel)
  try {
    let raw = ''
    try {
      /*
       * NOT OVER SOMEBODY ELSE'S WRITE. `base` is the mtime the app last read or
       * wrote this note at. If the file has moved on since — Claude, in the
       * thread beside it, or another machine through Dropbox — writing now
       * would silently throw their change away. So it is refused and handed
       * back as a conflict, and the person decides which version stands.
       */
      const now = await stat(full)
      if (base !== undefined && Math.abs(now.mtimeMs - base) > 1 && !ours(rel, now.mtimeMs)) {
        return { ok: false, reason: 'conflict', edited: now.mtimeMs }
      }
      raw = await readFile(full, 'utf8')
    } catch (err) {
      // Gone from under the editor — moved or deleted outside the app. The
      // words on screen are the only copy left, so the file is made again
      // rather than everything typed since going nowhere.
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err
      await mkdir(dirname(full), { recursive: true })
    }
    // Still the newest, asked again after the reads above: a write made
    // meanwhile — the synchronous one the window's close sends, which jumps
    // this queue — is newer, and this one must not land over it.
    if (newestWrite.get(rel) !== seq) return { ok: true }
    const rewrite = rewrites.get(rel)
    const words = rewrite ? rewrite(body) : body
    // The body in the note's own line breaks, which the editor does not keep.
    const head = headOf(raw)
    await writeFile(full, head + inEndingsOf(raw.slice(head.length), words), 'utf8')
    // And one that came while this was being written — the window's, which
    // no queue holds back — landed under it: put back on top.
    const later = lastSync.get(rel)
    if (later && later.seq > seq && newestWrite.get(rel) === later.seq) writeFileSync(full, later.content, 'utf8')
    const st = await stat(full)
    saved.set(rel, st.mtimeMs)
    await refresh(rel)
    // Where it landed, so the app can follow a note that moved while this was on its way.
    return { ok: true, edited: st.mtimeMs, path: rel, ...(words !== body ? { merged: words } : {}) }
  } catch (err) {
    return { ok: false, reason: String(err) }
  }
})

/**
 * The note just written, brought up to date in the live index — its title, its
 * tasks, its text for search and its links — instead of being left for the
 * sweep.
 *
 * Left for the sweep, the app's OWN saves were a vault that had changed: thirty
 * seconds after you stopped typing, the sweep saw a new mtime, dropped the
 * index and rebuilt all of it — a second or three over a real vault, during which
 * making a note or opening one waited on it. So the note you type into is
 * patched as it is saved, the signature moves with it, and the sweep finds
 * nothing to do. Inside the write queue, so no other patch interleaves.
 */
async function refresh(rel: string): Promise<void> {
  const idx = index
  if (!idx || !idx.byRel.has(rel)) return
  const got = await gather([rel], [])
  if (!got || index !== idx || !idx.byRel.has(rel)) return
  apply(idx, got)
}

export function writeNote(
  path: string,
  body: string,
  base?: number
): Promise<{ ok: boolean; reason?: string; edited?: number; path?: string; merged?: string }> {
  // The read-only test on the path as the walk spells it: `./inbox/x` is in `inbox`.
  const rel = notePath(path)
  if (rel === null) return Promise.resolve({ ok: false, reason: 'outside vault' })
  if (isReadOnly(rel)) return Promise.resolve({ ok: false, reason: READ_ONLY })
  const seq = ++writeSeq
  newestWrite.set(rel, seq)
  const run = writeQueued(rel, body, seq, base)
  landing.set(rel, run)
  const landed = (): void => {
    if (landing.get(rel) === run) landing.delete(rel)
  }
  void run.then(landed, landed)
  return run
}

/** Every write already asked for, on disk — what quitting waits for. */
export function drainWrites(): Promise<unknown> {
  return queue
}

/**
 * The same write, done NOW — for the window closing, when there is no later to
 * wait for. It jumps the queue on purpose, and marks itself newest so that
 * anything older still queued for this note stands down.
 */
export function writeNoteSync(
  path: string,
  body: string,
  base?: number,
  pending = false
): { ok: boolean; reason?: string; path?: string } {
  let rel = notePath(path)
  if (rel === null) return { ok: false, reason: 'outside vault' }
  if (isReadOnly(rel)) return { ok: false, reason: READ_ONLY }
  // Moved while its words were on their way, the reply not in yet: they go
  // where the note went, rather than making the old file again.
  if (!existsSync(join(VAULT, rel)) && movedAway.has(rel)) {
    const moved = followMoves(rel, -1)
    if (moved !== rel && existsSync(join(VAULT, moved))) {
      rel = moved
      base = undefined
    }
  }
  const full = join(VAULT, rel)
  // A save of the note still on its way back when the window closed: its reply
  // is the mtime the app would have had, and main already has it. Taken from
  // before that save, the app's own words read as somebody else's change, the
  // last words went to a conflicted copy, and the note kept older ones.
  if (pending && base !== undefined && saved.has(rel)) base = saved.get(rel)
  const seq = ++writeSeq
  newestWrite.set(rel, seq)
  let to = rel
  try {
    let raw = ''
    try {
      /*
       * NOT OVER A CHANGE NOBODY HAS SEEN, even on the way out. `base` is the
       * mtime the app last read or wrote the note at. A file that has moved on
       * since — Claude wrote to it after the last poll — keeps what it has, and
       * the words on screen go to a copy beside it, the way Dropbox keeps both
       * sides of a disagreement. Closing the window is no time to choose. A
       * change main made itself is no disagreement (see `ownMtime`), and a copy
       * never lands on an earlier one: the next free name is taken.
       */
      const now = statSync(full).mtimeMs
      if (base !== undefined && Math.abs(now - base) > 1 && !ours(rel, now)) {
        for (let n = 1; n < 1000; n++) {
          to = rel.replace(/\.md$/, n === 1 ? ' (conflicted copy).md' : ` (conflicted copy ${n}).md`)
          if (!existsSync(join(VAULT, to))) break
        }
        newestWrite.set(to, ++writeSeq)
      }
      // The note as it is, either way: its frontmatter and its line breaks go
      // with the words, into the note or into the copy beside it.
      raw = readFileSync(full, 'utf8')
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err
      mkdirSync(dirname(full), { recursive: true })
    }
    const rewrite = to === rel ? rewrites.get(rel) : undefined
    const head = headOf(raw)
    const content = head + inEndingsOf(raw.slice(head.length), rewrite ? rewrite(body) : body)
    writeFileSync(join(VAULT, to), content, 'utf8')
    if (to === rel) {
      lastSync.set(rel, { seq: newestWrite.get(rel) ?? seq, content })
      saved.set(rel, statSync(full).mtimeMs)
    }
    return { ok: true, path: to }
  } catch (err) {
    return { ok: false, reason: String(err) }
  }
}

/**
 * Show a note in the Finder. Guarded like every other path the renderer hands
 * over — a note is a vault-relative path, and anything that resolves outside
 * the vault is not one — and it checks the file is there first, because
 * `showItemInFolder` on a path that does not exist opens a window on nothing.
 */
export async function revealNote(path: string): Promise<boolean> {
  const rel = vaultPath(path)
  if (rel === null) return false
  const full = join(VAULT, rel)
  try {
    await stat(full)
  } catch {
    return false
  }
  shell.showItemInFolder(full)
  return true
}

/**
 * The note's file is as main last left it, holding a change main made itself —
 * a rename rewriting a link in it, or its heading — which main makes again in
 * the words the app sends next (see `rewrites`). Not somebody else's change: the
 * app's poll, seeing the mtime move under words it has yet to save, asks this
 * before it calls it a conflict.
 */
export async function noteOwnChange(path: string): Promise<boolean> {
  const rel = vaultPath(path)
  if (rel === null || !rewrites.has(rel)) return false
  try {
    return ours(rel, (await stat(join(VAULT, rel))).mtimeMs)
  } catch {
    return false
  }
}

/** mtime only — Dropbox's CloudStorage mount does not deliver file watch events. */
export async function noteMtime(path: string): Promise<number | null> {
  const rel = vaultPath(path)
  if (rel === null) return null
  try {
    return (await stat(join(VAULT, rel))).mtimeMs
  } catch {
    return null
  }
}
