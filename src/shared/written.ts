/**
 * A PATH AS WRITTEN — in backticks in a note, or in a thread — and where on
 * this Mac it could be.
 *
 * Claude writes the files it touched as code: `harvest/2026-Q3/Oslo/`,
 * `sow_check.py`, `projects/garden/`. Only a path to a NOTE was ever a link,
 * so the rest were words you had to go and find by hand. A right-click on one
 * now finds it. The pure half lives here, where a check can hold it without
 * the app: which code is a path at all, how a written path is read, which of
 * the files that share its name it can mean, in what order, and how a place is
 * named in a menu.
 */

/**
 * Code that names a file or a folder: no spaces, no `=` (an assignment —
 * `TZ=Europe/Vienna`), no scheme, and either a slash in it or a file's
 * extension at its end. `beanpole` and `SOWING_PERIOD` are words;
 * `sow_check.py`, `inbox/` and `…/Allotment/Scripts` are paths.
 * `sow_check.py.bak-2026-09-14` is a backup's name and a file's too, so a
 * dotted part anywhere after the first character counts.
 */
export function looksLikePath(text: string): boolean {
  const t = text.trim()
  if (!t || t.length > 400 || /\s|=|^[a-z][a-z0-9+.-]*:/i.test(t)) return false
  if (/[<>|*?"]/.test(t) || /^[\d.]+$/.test(t)) return false
  // A written-out truncation — `seed-catalogue.vol12….pdf` — names no one file.
  if (/.…/.test(t.replace(/^(?:…|\.\.\.)\//, ''))) return false
  if (t.includes('/')) return /[\p{L}\p{N}_]/u.test(t)
  return /^[^.].*\.[\p{L}\p{N}][\p{L}\p{N}_-]{0,15}$/u.test(t)
}

/** A written path, read: what is left to match once its marks are taken off. */
export interface Written {
  /** The path with its marks taken off: no `./`, no `…/`, no trailing slash. */
  rest: string
  /** Where it begins, when it says: from the root, or from home. */
  from: 'root' | 'home' | null
  /** Began with `…/`: a longer path with its head left out. */
  elided: boolean
  /** Ended in a slash: a folder, said so. */
  folder: boolean
  /** Its last part — the name every place it could be shares. */
  name: string
}

export function readWritten(text: string): Written | null {
  let t = text.trim()
  if (!looksLikePath(t)) return null
  const folder = t.endsWith('/')
  let from: Written['from'] = null
  let elided = false
  if (t.startsWith('~/')) {
    from = 'home'
    t = t.slice(2)
  } else if (t.startsWith('/')) {
    from = 'root'
    t = t.slice(1)
  } else if (/^(?:…|\.\.\.)\//.test(t)) {
    elided = true
    t = t.replace(/^(?:…|\.\.\.)\//, '')
  }
  t = t.replace(/^(?:\.\/)+/, '').replace(/\/+$/, '')
  // `..` would walk out of wherever it is read from; a written path is matched
  // by its END, and an end with `..` in it is not one place.
  if (!t || t.split('/').some((s) => s === '..' || s === '.')) return null
  const name = t.slice(t.lastIndexOf('/') + 1)
  return { rest: t, from, elided, folder, name }
}

/** True when `full` is a place the written path can mean: it ends in it. */
export function endsIn(full: string, w: Written): boolean {
  const f = full.replace(/\/+$/, '').toLowerCase()
  const r = w.rest.toLowerCase()
  return f === r || f.endsWith('/' + r)
}

/**
 * Places nobody means: the Trash, a package's insides, the caches and support
 * files under `~/Library` — but not the clouds that live there too, which is
 * where a synced vault and most of what it names are.
 */
export function unwanted(full: string, home: string): boolean {
  if (/\/\.Trash\/|\/node_modules\/|\/\.git\/|\.app\/Contents\//.test(full)) return true
  const lib = home + '/Library/'
  if (!full.startsWith(lib)) return false
  return !full.startsWith(lib + 'CloudStorage/') && !full.startsWith(lib + 'Mobile Documents/')
}

/**
 * The likely one first: inside the vault, then the nearest to the note it was
 * written in — the most folders shared with the note's own — then the shorter.
 */
export function rank(found: string[], vault: string, near: string): string[] {
  const shared = (p: string): number => {
    const a = p.split('/')
    const b = near.split('/')
    let n = 0
    while (n < a.length && n < b.length && a[n] === b[n]) n++
    return n
  }
  const inVault = (p: string): number => (p === vault || p.startsWith(vault + '/') ? 1 : 0)
  return [...new Set(found)].sort(
    (a, b) => inVault(b) - inVault(a) || shared(b) - shared(a) || a.length - b.length || a.localeCompare(b)
  )
}

/**
 * Where a place is, said short enough for a menu: its folder, from the vault
 * when it is the vault's, from the cloud it lives in when it is in one, from
 * home otherwise — and the middle given up before either end.
 */
export function whereLabel(full: string, vault: string, home: string, room = 44): string {
  const dir = full.replace(/\/+$/, '').replace(/\/[^/]*$/, '') || '/'
  let label: string
  if (dir === vault) label = 'the vault'
  else if (dir.startsWith(vault + '/')) label = dir.slice(vault.length + 1)
  else if (dir.startsWith(home + '/Library/CloudStorage/'))
    label = dir.slice(home.length + '/Library/CloudStorage/'.length)
  else if (dir === home) label = '~'
  else if (dir.startsWith(home + '/')) label = '~/' + dir.slice(home.length + 1)
  else label = dir
  if (label.length <= room) return label
  const parts = label.split('/')
  let tail = parts[parts.length - 1]
  for (let i = parts.length - 2; i > 0; i--) {
    const next = parts[i] + '/' + tail
    if (parts[0].length + 3 + next.length > room) break
    tail = next
  }
  return `${parts[0]}/…/${tail}`
}

/**
 * Files Open must not run. An app, an installer or a disk image is shown, not
 * opened; a script is opened AS TEXT, since its own app would run it — a `.py`
 * double-clicked goes to the Python Launcher, a `.command` to the Terminal.
 */
const SHOW_ONLY =
  /\.(app|pkg|mpkg|dmg|workflow|terminal|prefpane|kext|jar|action|saver|osax|qlgenerator|bundle|plugin)$/i
const AS_TEXT =
  /\.(command|tool|sh|bash|zsh|fish|csh|ksh|py|pyw|rb|pl|php|js|mjs|cjs|ts|lua|tcl|applescript|scpt|scptd|ps1|bat|cmd)$/i
/**
 * What Open may hand to its own app: documents and media, and nothing else.
 * A list of what may open rather than of what may not, because the Mac's
 * double-click does more than open — a `.webloc` sends a browser to a URL
 * nobody read, an `.html` runs a page from disk, a `.mobileconfig` offers a
 * profile for install — and a deny-list is only as good as the kinds its
 * author thought of.
 */
const DOCUMENT =
  /\.(md|markdown|txt|text|rtf|pdf|png|jpe?g|gif|webp|heic|svg|csv|tsv|json|ya?ml|toml|xml|docx?|xlsx?|pptx?|numbers|pages|key|epub|mp3|m4a|wav|mp4|mov)$/i

/**
 * Open's three answers: in its own app, as text, or not at all — shown in its
 * folder, which is all a file that is not a document is offered.
 */
export function howToOpen(full: string, dir: boolean, executable: boolean): 'open' | 'text' | 'none' {
  const path = full.replace(/\/+$/, '')
  if (SHOW_ONLY.test(path)) return 'none'
  // A folder opens in the Finder, and a document kept as a package — a `.pages`
  // or a `.key` can be a folder on disk — in its own app.
  if (dir) return 'open'
  if (AS_TEXT.test(path)) return 'text'
  if (DOCUMENT.test(path)) return 'open'
  // A program with no extension a viewer claims would be run in the Terminal;
  // as text it is read. A plain file with none — `/etc/hosts` — is no document.
  if (executable && !/\.[a-z0-9]{1,8}$/i.test(path.slice(path.lastIndexOf('/') + 1))) return 'text'
  return 'none'
}
