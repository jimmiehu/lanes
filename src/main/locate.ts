import { execFile } from 'node:child_process'
import { realpath, stat } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { shell } from 'electron'
import { VAULT } from './config'
import { endsIn, howToOpen, rank, readWritten, unwanted, whereLabel } from '../shared/written'
import type { FoundFile, Located } from '../shared/types'

const HOME = homedir()
/** As many places as a menu lists; the rest are counted. */
const LISTED = 4

/**
 * Every place `locate` has handed the renderer. Open and Show in Finder take a
 * place back only from here: the renderer names a file it was shown, never one
 * it made up.
 */
const handed = new Set<string>()

/**
 * What a path really is: the file at the end of every link in it, the last one
 * too, and how Open would open THAT. A link is classed and opened as what it
 * points at, never as its own name says: `spec.pdf -> ../tools/water.command`
 * is a script, and `docs -> Sprinkler.app` an app. Classed by the name and
 * opened as the link, each was a document handed to the Mac — which followed
 * the link itself, and ran what was at the end. Git keeps links, so a cloned
 * repo beside the vault was enough.
 */
async function really(full: string): Promise<{ real: string; dir: boolean; open: FoundFile['open'] } | null> {
  try {
    const real = await realpath(full)
    const s = await stat(real)
    const dir = s.isDirectory()
    return { real, dir, open: howToOpen(real, dir, !dir && (s.mode & 0o111) !== 0) }
  } catch {
    return null
  }
}

/** A place as the menu lists it: under the name it was found by, opened as what it really is. */
async function place(full: string): Promise<FoundFile | null> {
  const r = await really(full)
  return r && { path: full, where: whereLabel(full, VAULT, HOME), dir: r.dir, open: r.open }
}

/** The files Spotlight knows by this name, under home. Empty when it has none or takes too long. */
function spotlight(name: string): Promise<string[]> {
  // Spotlight's own quoting: `*` is its wildcard, `\` and `"` its marks.
  const q = `kMDItemFSName == "${name.replace(/([\\"*?])/g, '\\$1')}"c`
  return new Promise((done) => {
    execFile('mdfind', ['-0', '-onlyin', HOME, q], { timeout: 2500, maxBuffer: 4 << 20 }, (err, out) => {
      if (err && !out) return done([])
      done(String(out).split('\0').filter(Boolean))
    })
  })
}

/**
 * WHERE A WRITTEN PATH IS, on this Mac.
 *
 * Read from where it says it starts when it says — `/…`, `~/…` — and then from
 * the vault and from the note's own folder, which is how a vault's paths are
 * written: `inbox/reading/`. A path with its head left out,
 * `…/Allotment/Scripts`, is tried against the folders the vault sits in.
 * Found there, that is the answer: the vault's own `inbox/` is the one meant,
 * whatever else shares its name.
 *
 * Otherwise Spotlight is asked for everything with its last part's name, and
 * what ends in the whole written path is kept — `harvest/2026-Q3/Oslo/` is the
 * Oslo folder under a harvest/2026-Q3, not Q2's. Nearest to the note first.
 */
export async function locate(text: string, note: string): Promise<Located> {
  const w = readWritten(text)
  if (!w) return { found: [], more: 0 }
  const from: string[] = []
  if (w.from === 'root') from.push('/')
  else if (w.from === 'home') from.push(HOME)
  else {
    from.push(VAULT)
    if (note) from.push(dirname(join(VAULT, note)))
    if (w.elided) for (let d = dirname(VAULT); d.startsWith(HOME) && d !== HOME; d = dirname(d)) from.push(d)
  }
  const direct: FoundFile[] = []
  for (const base of [...new Set(from)]) {
    const p = await place(join(base, w.rest))
    if (p && (!w.folder || p.dir) && !direct.some((d) => d.path === p.path)) direct.push(p)
  }
  const found: FoundFile[] = direct.slice(0, LISTED)
  let more = direct.length - found.length
  if (!direct.length && !w.from) {
    const near = note ? dirname(join(VAULT, note)) : VAULT
    const hits = (await spotlight(w.name)).filter((f) => endsIn(f, w) && !unwanted(f, HOME))
    for (const f of rank(hits, VAULT, near)) {
      if (found.length === LISTED) {
        more++
        continue
      }
      const p = await place(f)
      if (p && (!w.folder || p.dir)) found.push(p)
    }
  }
  for (const f of found) handed.add(f.path)
  return { found, more }
}

/** Shown selected in its folder. Only a place `locate` handed out. */
export async function revealFound(full: string): Promise<boolean> {
  if (!handed.has(full) || !(await place(full))) return false
  shell.showItemInFolder(full)
  return true
}

/**
 * Opened — a folder in the Finder, a file in its own app, a script as text.
 * Never run: what `howToOpen` says is not to be opened is refused here too.
 * What is opened is the real file `really` classed, not the link to it, so the
 * Mac is never handed a name that means something else at the end.
 */
export async function openFound(full: string): Promise<boolean> {
  if (!handed.has(full)) return false
  const r = await really(full)
  if (!r || r.open === 'none') return false
  if (r.open === 'text') {
    return new Promise((done) => execFile('open', ['-t', r.real], (err) => done(!err)))
  }
  return (await shell.openPath(r.real)) === ''
}
