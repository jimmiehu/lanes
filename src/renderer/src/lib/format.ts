import { laneOfPath as sharedLaneOfPath, type LaneLike } from '@shared/lanes'

/** "4m", "3h", "6d" — the sidebar's age column. */
export function age(ms: number): string {
  const s = Math.round((Date.now() - ms) / 1000)
  if (s < 60) return `${Math.max(1, s)}s`
  const m = Math.round(s / 60)
  if (m < 60) return `${m}m`
  const h = Math.round(m / 60)
  if (h < 24) return `${h}h`
  return `${Math.round(h / 24)}d`
}

/** "4m ago", "yesterday", "3w ago" — how a note says when it was last edited. */
export function ago(ms: number): string {
  const mins = Math.round((Date.now() - ms) / 60000)
  if (mins < 60) return `${Math.max(1, mins)}m ago`
  const h = Math.round(mins / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.round(h / 24)
  if (d === 1) return 'yesterday'
  if (d < 30) return `${d}d ago`
  const w = Math.round(d / 7)
  return w < 9 ? `${w}w ago` : `${Math.round(d / 30)}mo ago`
}

/**
 * How the navigator's TREE stacks its top-level folders. Plain alphabetical
 * order buries a vault that numbers its folders: `_archive` and `_templates`
 * sort above `10-notes`, so the tree opens on its own scaffolding.
 *
 * The numeric prefixes are the vault's own statement of order and are followed
 * rather than re-derived; an underscore is the same convention saying the
 * opposite, so those sink; and the root is not a folder at all, so it sits
 * under the ones that are.
 */
export function byFolder(a: string, b: string): number {
  const rank = (seg: string): number => {
    if (seg === '') return 3
    if (seg.startsWith('_')) return 2
    return /^\d/.test(seg) ? 0 : 1
  }
  return rank(a) - rank(b) || a.localeCompare(b)
}

/**
 * What a row says about where it lives, given the band it is already under.
 * `projects/garden/notes/charter.md` under the Garden band is just "notes" —
 * repeating the band in every one of its rows spends the width on nothing.
 */
export function folderTail(path: string, band: string): string {
  const cut = path.lastIndexOf('/')
  if (cut === -1) return ''
  const dir = path.slice(0, cut)
  if (!band) return dir
  if (dir === band) return ''
  return dir.startsWith(`${band}/`) ? dir.slice(band.length + 1) : dir
}

/** `Café` → `cafe`, so the rail's filter matches what people actually type. */
export const fold = (text: string): string =>
  text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()

/**
 * The lane a note belongs to, read off its folder: the same rule that files a
 * *thread* into a lane, so a note and the chats about it say the same lane.
 * The rule itself — vault-relative, case aside, at a folder boundary, the
 * deepest lane's folder winning — is src/shared/lanes.ts, asked by main too;
 * a path here is vault-relative, and an absolute one is only placed with the
 * vault to take off its front.
 */
export function laneOfPath<T extends LaneLike>(path: string, lanes: readonly T[], vault?: string): T | null {
  return sharedLaneOfPath(path, lanes, vault)
}

/** The same edges a lane's folder is compared by: no `./`, no edge or doubled slashes, case aside. */
const folderKey = (p: string): string =>
  p
    .replace(/\\/g, '/')
    .replace(/\/{2,}/g, '/')
    .replace(/^(?:\.\/)+/, '')
    .replace(/^\/+|\/+$/g, '')
    .toLowerCase()

/**
 * Whether a path — or a folder — sits in one of the folders the person keeps
 * read only: an inbox an automation fills, say. At a folder boundary, so
 * `inbox-old/x.md` is not in `inbox/`, and case aside. None configured, nothing
 * is read only; an empty entry would hold the whole vault, so it holds nothing.
 */
export function isReadOnly(path: string, folders: readonly string[] | undefined): boolean {
  const at = folderKey(path)
  for (const f of folders ?? []) {
    const key = folderKey(f)
    if (key && (at === key || at.startsWith(`${key}/`))) return true
  }
  return false
}

/**
 * What to call a note's folder.
 *
 * `listNotes` sets `folder: dirname(path)`, and node's dirname returns the
 * string `'.'` — not `''` — for a file at the vault root. Every reader has to
 * normalise that or a root note ends up filed under a folder literally named
 * ".", sorting above every real folder and printing as `Note · .`. The note
 * navigator did this and took the knowledge with it when it went.
 */
export const isRoot = (folder: string): boolean => !folder || folder === '.'

export const folderLabel = (folder: string): string =>
  isRoot(folder) ? 'vault root' : folder

/** The path segments of a folder, with the root sentinel meaning "none". */
export const folderSegments = (folder: string): string[] =>
  isRoot(folder) ? [] : folder.split('/')
