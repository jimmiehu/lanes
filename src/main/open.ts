import { shell, type WebContents } from 'electron'
import { existsSync } from 'node:fs'
import { isAbsolute, join, normalize, relative, sep } from 'node:path'
import { fileAddress } from '../shared/blocks'
import { VAULT } from './config'

/**
 * ONE DOOR OUT. Everything the app opens beyond its own window goes through
 * here: a `target=_blank` link in a thread or in READ, a ⌘-click in the editor
 * — anything that reaches a window-open handler.
 *
 * That handler used to hand the address to `shell.openExternal` whatever it
 * was, and the system does what the address says: `javascript:`, a settings
 * pane by its `x-apple-…:` scheme, a `file:` onto an application, which it
 * LAUNCHES. The text of a thread is Claude's, and the text of a note may be
 * anybody's, so what a link may do is decided here, by a rule short enough to
 * read:
 *
 *  - `https:`, `http:` and `mailto:` go to the system;
 *  - `file:`, with any number of slashes, is a place on this Mac. A note in the
 *    vault opens as a note, in the window that asked; anything else is shown in
 *    the Finder if it is there, and never opened;
 *  - anything else is refused, and said, and nothing opens. A scheme somebody
 *    really uses joins the list by name, not by default.
 */
export type Outside =
  | { kind: 'external'; url: string }
  /** Vault-relative. */
  | { kind: 'note'; path: string }
  /** Absolute. */
  | { kind: 'reveal'; path: string }
  | { kind: 'refuse'; reason: string }

const WEB = new Set(['https:', 'http:', 'mailto:'])

/**
 * What an address may do. Pure, so checks/open-outside.mjs can ask it about
 * every address it worries about without electron.
 *
 * A `file:` address is read by the renderer's own rule (`fileAddress`), not by
 * `new URL`: the WHATWG parser reads `file:notes/a.md` as `/notes/a.md` and
 * `file://notes/a.md` as a host called `notes`, where Claude means a path in
 * the vault — and the two sides of the bridge have to agree on what a link
 * points at, or a link would open one thing in READ and another here.
 */
export function decideOutside(url: string, vault: string): Outside {
  let u: URL
  try {
    u = new URL(url)
  } catch {
    return { kind: 'refuse', reason: 'not an address' }
  }
  if (WEB.has(u.protocol)) return { kind: 'external', url: u.href }
  if (u.protocol !== 'file:') return { kind: 'refuse', reason: `${u.protocol} links are not opened from Lanes` }

  const local = fileAddress(url)
  if (!local) return { kind: 'refuse', reason: 'a file address with no path' }
  if (local.path.includes('\0')) return { kind: 'refuse', reason: 'a file address with a null in it' }
  const full = isAbsolute(local.path) ? normalize(local.path) : join(vault, local.path)
  // `relative`, not `startsWith(vault)`: a sibling whose name merely begins with
  // the vault's — `…/Notes-old/x.md` — is not in it.
  const rel = relative(vault, full)
  const inside = rel !== '' && rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel)
  if (inside && local.note) return { kind: 'note', path: rel }
  return { kind: 'reveal', path: full }
}

/**
 * Whether a navigation stays on the app's own page. `own` is what the window
 * loaded: the dev server's address in development, the built `index.html` as a
 * `file:` URL otherwise.
 *
 * For the dev server that is its origin. A `file:` URL has no origin worth the
 * name — every one of them is `null` — so there it is the very same file, with
 * whatever query or fragment: the print window is that page with `?print=`.
 */
export function stays(target: string, own: string): boolean {
  let t: URL
  let o: URL
  try {
    t = new URL(target)
    o = new URL(own)
  } catch {
    return false
  }
  if (o.protocol === 'file:') return t.protocol === 'file:' && t.host === o.host && t.pathname === o.pathname
  return t.origin === o.origin
}

/**
 * Does what `decideOutside` decided. `from` is the page that asked, which is
 * where a note goes back to — to be opened the way a link inside the app opens
 * one (App.tsx, `onOpenNote`).
 */
export async function openOutside(
  url: string,
  from?: WebContents | null
): Promise<{ ok: boolean; reason?: string }> {
  const d = decideOutside(url, VAULT)
  if (d.kind === 'external') {
    await shell.openExternal(d.url)
    return { ok: true }
  }
  if (d.kind === 'note') {
    if (!from || from.isDestroyed()) return { ok: false, reason: 'no window to open it in' }
    from.send('lanes:openNote', d.path)
    return { ok: true }
  }
  if (d.kind === 'reveal') {
    // On a path that is not there, the Finder opens a window on nothing.
    if (!existsSync(d.path)) return { ok: false, reason: 'not there' }
    shell.showItemInFolder(d.path)
    return { ok: true }
  }
  console.warn(`lanes: not opened (${d.reason}): ${url.slice(0, 200)}`)
  return { ok: false, reason: d.reason }
}
