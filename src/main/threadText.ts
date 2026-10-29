import { app } from 'electron'
import { readdir, readFile, stat, writeFile } from 'node:fs/promises'
import { basename, join } from 'node:path'
import { sessionsDir } from './config'
import { saidInFile } from './sessions'
import { familyRoot } from '../shared/pathways'
import { fold, hitAt, parseQuery, rank } from '../shared/find'
import type { Pathways, ThreadHit } from '../shared/types'

/**
 * WHAT THE THREADS SAY, searchable.
 *
 * ⌘K could already read the inside of a note — `searchContent` scans the whole
 * vault's text — but a thread was findable only by its NAME, and a thread's
 * name is sixty characters the CLI cut off the opening prompt. Half of what
 * this app holds is conversation, and the half you most often go looking for is
 * a sentence somebody said in one: the answer you got about the Oslo site
 * visit, the paragraph you wrote and never moved into a note. None of it was
 * reachable, from anywhere.
 *
 * WHY THIS IS ITS OWN INDEX, and not part of the record layer next door.
 * `threadIndex` caches a small record per transcript — title, counts, touched
 * paths — into `lanes-index.json`, which is read on every launch. Over a vault
 * in daily use this one comes out some ten times the size of that file, and
 * nothing on the launch path wants the text: it is asked for the first time
 * somebody types three characters into ⌘K, and never again in a session that
 * only reads and writes.
 *
 * WHY IT IS CACHED TO DISK AT ALL. Extracting it means reading a few hundred
 * MB of jsonl to find the 1% of it anybody said, which takes a second or two.
 * Once. After that a launch stats one file per transcript and re-reads the
 * handful that moved — the same trade the record layer makes, for the same
 * reason. A query then scans the whole corpus in a few milliseconds.
 *
 * FOLDED with the app's one fold — see shared/find.ts, which also decides what
 * counts as a match here and everywhere else: the phrase if it is there, else
 * every word of it somewhere. That makes
 * the snippet lowercase, exactly as the vault's own text hits are: folding
 * changes byte lengths, so an offset in the folded text cannot be mapped back
 * onto the original to recover its case.
 */

/** 1: the first. 2: a slash command is said — `/morning` was typed, in the CLI's tags. */
const CACHE_VERSION = 2

const cacheFile = (): string => join(app.getPath('userData'), 'lanes-said.json')

interface Said {
  mtimeMs: number
  size: number
  /** Folded. See the note above. */
  text: string
}

interface CacheFile {
  version: number
  /** Which project directory this came from; another vault is another one. */
  dir: string
  said: Record<string, Said>
}

const said = new Map<string, Said>()
let loaded = false
let ensuring: Promise<void> | null = null

async function pool<T>(items: T[], limit: number, fn: (item: T) => Promise<void>): Promise<void> {
  let next = 0
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    for (;;) {
      const i = next++
      if (i >= items.length) return
      await fn(items[i])
    }
  })
  await Promise.all(workers)
}

async function loadCache(): Promise<void> {
  if (loaded) return
  loaded = true
  try {
    const raw = JSON.parse(await readFile(cacheFile(), 'utf8')) as CacheFile
    // A stale schema or a different vault is not worth migrating; it rebuilds.
    if (raw.version !== CACHE_VERSION || raw.dir !== sessionsDir()) return
    for (const [id, entry] of Object.entries(raw.said ?? {})) said.set(id, entry)
  } catch {
    // no cache yet, or an unreadable one — both mean build it
  }
}

async function persist(): Promise<void> {
  try {
    const body: CacheFile = {
      version: CACHE_VERSION,
      dir: sessionsDir(),
      said: Object.fromEntries(said)
    }
    await writeFile(cacheFile(), JSON.stringify(body), 'utf8')
  } catch {
    // a cache that cannot be written is a slower launch, not a failure
  }
}

/**
 * Bring the index level with the session directory. Only files whose mtime or
 * size moved are re-read, so the steady state is 205 stats and nothing else.
 */
async function ensureOnce(): Promise<void> {
  await loadCache()
  let files: string[]
  try {
    files = (await readdir(sessionsDir())).filter((f) => f.endsWith('.jsonl'))
  } catch {
    return
  }

  const seen = new Set<string>()
  let changed = false

  await pool(files, 8, async (f) => {
    const id = basename(f, '.jsonl')
    seen.add(id)
    const full = join(sessionsDir(), f)
    try {
      const st = await stat(full)
      const have = said.get(id)
      if (have && have.mtimeMs === st.mtimeMs && have.size === st.size) return
      said.set(id, { mtimeMs: st.mtimeMs, size: st.size, text: fold(await saidInFile(full)) })
      changed = true
    } catch {
      // an unreadable file is simply not a thread
    }
  })

  for (const id of said.keys()) {
    if (seen.has(id)) continue
    said.delete(id)
    changed = true
  }

  if (changed) await persist()
}

/** Serialised: two searches landing together must not both read the directory. */
export async function ensureThreadText(): Promise<void> {
  ensuring ??= (async () => {
    try {
      await ensureOnce()
    } finally {
      ensuring = null
    }
  })()
  return ensuring
}

/**
 * Warm the index in the background, so the first search does not pay for the
 * first build — the 1.7s above happens while nobody is waiting rather than with
 * the palette open and empty. Fire and forget: nothing waits on it, and a
 * search that arrives mid-build simply joins the same promise.
 */
export function warmThreadText(): void {
  void ensureThreadText().catch(() => {})
}

/**
 * Around the hit, bounded — a transcript holds pasted files and minified lines,
 * and a row is one line of 9px mono.
 *
 * THE MATCH HAS TO SURVIVE THE TRIM. The obvious shape — take a wide window,
 * then cut it to length — puts the match at the far end and then cuts the far
 * end off: searching a transcript for `grace is back from leave` returned a
 * snippet ending `…office@ is passing it on to the board this week. grac`. So the
 * window is built to the final width in one go, and a long query eats into its
 * own lead-in rather than into itself.
 */
const SNIPPET = 190
function snippetAt(text: string, at: number, needle: number): string {
  const lineStart = Math.max(0, text.lastIndexOf('\n', at) + 1)
  const nl = text.indexOf('\n', at)
  const lineEnd = nl === -1 ? text.length : nl
  const lead = Math.max(0, Math.min(60, SNIPPET - needle - 40))
  const from = Math.max(lineStart, at - lead)
  const to = Math.min(lineEnd, from + SNIPPET)
  // Ellipses only where something was actually cut, so a short line reads whole.
  return `${from > lineStart ? '…' : ''}${text.slice(from, to).trim()}${to < lineEnd ? '…' : ''}`
}

/**
 * Threads whose text holds the query. Substring, like the vault's own text
 * search and for the same reason: this is a corpus of slugs, paths and quoted
 * phrases, and `distributed gov` should find them mid-word the way a reader
 * means it.
 *
 * COLLAPSED BY FAMILY. A fork copies its parent's prefix verbatim, so a phrase
 * said before the fork is in every path of the family — and reporting each one
 * would answer "where did I say that?" with five rows saying the same sentence.
 * The family's root is the thread the palette lists, so that is what comes back;
 * picking it lands on whichever path you were last reading, exactly as picking
 * the thread by name does.
 */
export async function searchThreads(
  query: string,
  pathways: Pathways,
  limit = 12
): Promise<ThreadHit[]> {
  const q = parseQuery(query)
  if (q.phrase.length < 3) return []
  await ensureThreadText()

  const hits: ThreadHit[] = []
  const seen = new Set<string>()
  // Most recently written first, so the thread you were just in outranks the
  // one you said the same thing in two years ago.
  const order = [...said.entries()].sort((a, b) => b[1].mtimeMs - a[1].mtimeMs)
  /*
   * Two passes, phrase before words, so a thread that said the sentence is
   * never buried under one that merely used all the words. Both walk a few MB
   * of folded text, which is nothing — the note index's two passes are costed
   * carefully because they are over every note in the vault; this one is not.
   */
  for (const want of [2, 1] as const) {
    if (hits.length >= limit) break
    if (want === 1 && q.terms.length < 2) break
    for (const [id, entry] of order) {
      if (hits.length >= limit) break
      if (rank(q, entry.text) !== want) continue
      const root = familyRoot(pathways, id)
      if (seen.has(root)) continue
      seen.add(root)
      const at = hitAt(q, entry.text)
      hits.push({ id: root, snippet: snippetAt(entry.text, at, q.phrase.length) })
    }
  }
  return hits
}
