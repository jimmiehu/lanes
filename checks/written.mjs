// A PATH AS WRITTEN IS READ AS ONE — proved.
//
// A right-click on a path in backticks finds it (`shared/written.ts`,
// `main/locate.ts`). These are the pure rules under that, held to the kind of
// paths a note writes — an allotment's `harvest/2026-Q3/Oslo/`,
// `sow_check.py`, `…/Allotment/Scripts/rotation/next_year` — and to the code
// next to them that is not a path: `beanpole`, `TZ=Europe/Vienna`,
// `water.py --all`.
//
//   node --experimental-strip-types checks/written.mjs
import {
  endsIn,
  howToOpen,
  looksLikePath,
  rank,
  readWritten,
  unwanted,
  whereLabel
} from '../src/shared/written.ts'

let failed = 0
const is = (ok, what, detail) => {
  if (ok) return
  failed++
  console.log(`  ✗ ${what}${detail ? `\n      ${detail}` : ''}`)
}
const j = JSON.stringify

/* ---------- which code is a path ---------- */

for (const p of [
  'sow_check.py',
  'sow_check.py.bak-2026-09-14',
  'inbox/',
  'projects/garden/seed-trays/',
  'harvest/2026-Q3/Oslo/',
  'Grünerløkka/plot-12/',
  '2026-Q3/_backup-2026-09-14-before-sowing/',
  'bed-plan.pdf',
  'harvest-2026-Q3.xlsx',
  '_sown.json',
  '.claude/scripts/sort-seeds.py',
  '…/Allotment/Scripts/rotation/next_year',
  '~/Desktop/plot-map.pdf',
  '/Users/someone/file.txt',
  'rotation/next_year/README.md'
]) {
  is(looksLikePath(p), `a path: ${p}`)
}
for (const w of [
  'beanpole',
  'beanpolevienna',
  'SOWING_PERIOD',
  'SOWING_PERIOD=2026-Q3',
  'TZ=Europe/Vienna',
  'water.py --all --bed 12 --dry-run',
  'allotment-rules.md §4',
  'prick_out',
  '1',
  '3.5',
  '1.234,50',
  'https://example.com/a.pdf',
  'mailto:someone@example.com',
  'seed-catalogue.vol12….pdf',
  '*.pdf',
  '.env',
  '/',
  '…/'
]) {
  is(!looksLikePath(w), `not a path: ${w}`)
}

/* ---------- how a written path is read ---------- */

const r = (t) => readWritten(t)
is(j(r('harvest/2026-Q3/Oslo/')) === j({ rest: 'harvest/2026-Q3/Oslo', from: null, elided: false, folder: true, name: 'Oslo' }), 'a folder, said so', j(r('harvest/2026-Q3/Oslo/')))
is(r('…/Allotment/Scripts')?.elided === true && r('…/Allotment/Scripts')?.rest === 'Allotment/Scripts', '`…/` is a head left out')
is(r('.../Allotment/Scripts')?.elided === true, '`.../` too')
is(r('~/Desktop/a.pdf')?.from === 'home' && r('~/Desktop/a.pdf')?.rest === 'Desktop/a.pdf', '`~/` is home')
is(r('/Users/x/a.pdf')?.from === 'root', 'a leading slash is the root')
is(r('./notes/a.txt')?.rest === 'notes/a.txt', '`./` is taken off')
is(r('../secret/a.txt') === null && r('notes/../../a.txt') === null, '`..` is no one place, and walks nowhere')
is(r('beanpole') === null, 'a word is not read as a path')

/* ---------- which places it can mean ---------- */

const oslo = r('harvest/2026-Q3/Oslo/')
const HOME = '/Users/someone'
const Q = `${HOME}/Library/CloudStorage/Dropbox/Allotment/Records/2026`
is(endsIn(`${Q}/harvest/2026-Q3/Oslo`, oslo), 'Q3’s Oslo is the one written')
is(!endsIn(`${Q}/harvest/2026-Q2/Oslo`, oslo), 'Q2’s is not, though it shares the name')
is(!endsIn(`${Q}/harvest/2026-Q3/XOslo`, oslo), 'a longer name ending in it is not it')
is(endsIn(`${Q}/harvest/2026-q3/oslo`, oslo), 'case does not tell two places apart on this disk')

is(unwanted(`${HOME}/.Trash/sow_check.py`, HOME), 'the Trash is nobody’s meaning')
is(unwanted(`${HOME}/Library/Caches/x/sow_check.py`, HOME), 'nor a cache')
is(!unwanted(`${HOME}/Library/CloudStorage/Dropbox/x/sow_check.py`, HOME), 'a cloud under ~/Library is wanted')
is(!unwanted(`${HOME}/Library/Mobile Documents/x/sow_check.py`, HOME), 'iCloud too')
is(unwanted(`${HOME}/code/app/node_modules/x/README.md`, HOME), 'a package’s insides are not')

const VAULT = `${HOME}/Library/CloudStorage/Dropbox/Writing/Notes`
const near = `${VAULT}/projects/garden/beds`
const order = rank(
  [
    `${Q}/harvest/2026-Q3/runner-beans/bed-plan.pdf`,
    `${VAULT}/projects/garden/seed-trays/bed-plan.pdf`,
    `${HOME}/Downloads/bed-plan.pdf`,
    `${VAULT}/projects/garden/seed-trays/bed-plan.pdf`
  ],
  VAULT,
  near
)
is(order[0] === `${VAULT}/projects/garden/seed-trays/bed-plan.pdf`, 'the vault’s own first', order[0])
is(order.length === 3, 'a place listed once', j(order))
is(order[1].includes('/Dropbox/'), 'then the nearest to the note: the same Dropbox before Downloads', order[1])

/* ---------- how a place is named ---------- */

is(whereLabel(`${VAULT}/projects/garden/seed-trays/bed-plan.pdf`, VAULT, HOME) === 'projects/garden/seed-trays', 'in the vault, from the vault')
is(whereLabel(`${VAULT}/inbox`, VAULT, HOME) === 'the vault', 'a top folder is in the vault')
is(whereLabel(`${HOME}/Library/CloudStorage/Dropbox/Allotment/Scripts/rotation/sow_check.py`, VAULT, HOME) === 'Dropbox/Allotment/Scripts/rotation', 'a cloud by its own name')
is(whereLabel(`${HOME}/Downloads/a.pdf`, VAULT, HOME) === '~/Downloads', 'home as ~')
const long = whereLabel(`${Q}/harvest/2026-Q3/runner-beans/bed-plan.pdf`, VAULT, HOME)
is(long.length <= 44 && long.startsWith('Dropbox/…/') && long.endsWith('/2026-Q3/runner-beans'), 'the middle given up, both ends kept', long)

/* ---------- Open never runs anything ---------- */

is(howToOpen('/x/a.pdf', false, false) === 'open', 'a PDF opens in its app')
is(howToOpen('/x/a.pdf', false, true) === 'open', 'even with an exec bit Dropbox left on it')
is(howToOpen('/x/folder', true, true) === 'open', 'a folder opens in the Finder')
for (const s of ['sow_check.py', 'run.sh', 'go.command', 'x.zsh', 'a.rb', 'b.applescript'])
  is(howToOpen(`/x/${s}`, false, false) === 'text', `a script opens as text: ${s}`)
is(howToOpen('/x/tool', false, true) === 'text', 'a program with no extension opens as text')
is(howToOpen('/x/notes', false, false) === 'none', 'a plain file with no extension is no document: shown, not opened')
for (const s of ['Lanes.app', 'Lanes.app/', 'setup.pkg', 'disk.dmg', 'flow.workflow', 'x.jar'])
  is(howToOpen(`/x/${s}`, s.includes('.app'), false) === 'none', `shown, never opened: ${s}`)

console.log(failed ? `\n${failed} failed` : '\nall written-path assertions hold')
process.exit(failed ? 1 : 0)
