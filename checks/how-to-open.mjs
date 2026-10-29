// OPEN MEANS OPEN A DOCUMENT — proved.
//
// A right-click on a path offers Open, and Open is `shell.openPath`: whatever
// the Mac does on a double-click. For a document that is its app. For a
// `.webloc` it is a browser sent to a URL nobody read, for an `.html` a page
// run from disk, for a `.mobileconfig` a profile offered for install. So what
// Open may launch is a list of documents and media (`shared/written.ts`,
// `howToOpen`); a script opens as text, an app or a bundle is shown, and
// everything else is shown in its folder and nothing more. Red when the rule
// was a deny-list: all of the first group opened.
//
//   node --experimental-strip-types checks/how-to-open.mjs
import { howToOpen } from '../src/shared/written.ts'

let failed = 0
let held = 0
const is = (ok, what, detail) => {
  held++
  if (ok) return
  failed++
  console.log(`  ✗ ${what}${detail ? `\n      ${detail}` : ''}`)
}
const how = (name, dir = false, exec = false) => howToOpen(`/x/${name}`, dir, exec)

/* ---------- never opened ---------- */

for (const name of [
  'page.webloc',
  'page.inetloc',
  'index.html',
  'index.htm',
  'site.xhtml',
  'profile.mobileconfig',
  'run.shortcut',
  'window.terminal',
  'place.fileloc',
  'link.url',
  'archive.zip',
  'lib.dylib',
  'thing.unknownext'
]) {
  is(how(name) !== 'open', `not opened: ${name}`, how(name))
}
is(how('go.command') === 'text', 'a .command opens as text, never in the Terminal', how('go.command'))
is(how('go.command', false, true) === 'text', 'even with its exec bit on', how('go.command', false, true))
is(how('Lanes.app', true) === 'none', 'an app is shown, never launched', how('Lanes.app', true))
is(how('Lanes.app/', true) === 'none', 'with its slash too', how('Lanes.app/', true))
is(how('tool', false, true) !== 'open', 'a program with no extension is not run', how('tool', false, true))
is(how('hosts') === 'none', 'a file with no extension and no exec bit is only shown', how('hosts'))
is(how('page.html', false, true) !== 'open', 'an exec bit does not make a page a document', how('page.html', false, true))

/* ---------- opened ---------- */

for (const name of ['a.pdf', 'a.md', 'a.PDF', 'notes.txt', 'shot.png', 'data.csv', 'deck.key', 'song.m4a', 'clip.mov', 'book.epub']) {
  is(how(name) === 'open', `opened in its app: ${name}`, how(name))
}
is(how('a.pdf', false, true) === 'open', 'a PDF with an exec bit Dropbox left on it is still a PDF', how('a.pdf', false, true))
is(how('folder', true) === 'open', 'a folder opens in the Finder', how('folder', true))
is(how('Report.pages', true) === 'open', 'a document that is a package opens', how('Report.pages', true))

console.log(failed ? `\n${failed} of ${held} failed` : `\nall ${held} how-to-open assertions hold (documents open, nothing else does)`)
process.exit(failed ? 1 : 0)
