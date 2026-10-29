// Which lane a path is in, now that lanes are folders somebody named.
//
// Three detectors used to answer this — main's from a thread's touched files,
// the renderer's from a note's folder, the skills list's from a skill's name —
// each hardcoding one vault's own folder convention. There is one rule now
// (src/shared/lanes.ts), and lanes come from state: any folder, nested lanes
// with the deepest winning, case aside, at a folder boundary, absolute paths
// only inside the vault, and no lanes at all a valid answer. And main's weighed
// vote over a thread's files reads the same rule.
//
//   node --experimental-strip-types checks/lane-detect.mjs
import { laneOfPath, laneOfSkill, laneLabel, slug } from '../src/shared/lanes.ts'
import { laneFromPaths } from '../src/main/lanes.ts'

let failed = 0
const is = (ok, what, got) => {
  if (!ok) failed++
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}${ok ? '' : `  — got ${JSON.stringify(got)}`}`)
}
const id = (l) => l?.id ?? null

const GARDEN = { id: 'garden', name: 'Garden', folder: 'projects/garden' }
const KITCHEN = { id: 'kitchen', name: 'Kitchen', folder: 'projects/kitchen' }
const ESSAYS = { id: 'essays-x1y2', name: 'Essays', folder: 'Essays' }
const PROJECTS = { id: 'proj', name: 'Projects', folder: 'projects/' }
const NOWHERE = { id: 'nowhere', name: 'Nowhere', folder: '' }
const LANES = [GARDEN, KITCHEN, ESSAYS]

/* ---------- any folder ---------- */
for (const [path, want] of [
  ['projects/garden/beds.md', 'garden'],
  ['projects/kitchen/bread.md', 'kitchen'],
  ['Essays/on-rivers.md', 'essays-x1y2'],
  ['essays/on-rivers.md', 'essays-x1y2'],
  ['PROJECTS/Garden/Beds.md', 'garden'],
  ['./projects/garden/beds.md', 'garden'],
  ['projects//garden/beds.md', 'garden'],
  ['projects/garden', 'garden'],
  ['projects/gardening/x.md', null],
  ['essays-old/x.md', null],
  ['archive/projects/garden/x.md', null],
  ['beds.md', null],
  ['', null]
]) {
  is(id(laneOfPath(path, LANES)) === want, `${JSON.stringify(path)} → ${want}`, id(laneOfPath(path, LANES)))
}

/* ---------- nested: the deepest folder wins, in either order ---------- */
for (const lanes of [
  [PROJECTS, GARDEN],
  [GARDEN, PROJECTS]
]) {
  const order = lanes.map((l) => l.id).join(',')
  is(id(laneOfPath('projects/garden/beds.md', lanes)) === 'garden', `nested [${order}]: the garden note is Garden's`)
  is(id(laneOfPath('projects/shed/roof.md', lanes)) === 'proj', `nested [${order}]: the shed note is Projects'`)
}

/* ---------- absolute paths: inside the vault only ---------- */
const VAULT = '/Users/someone/Notes Vault'
is(id(laneOfPath(`${VAULT}/projects/garden/beds.md`, LANES, VAULT)) === 'garden', 'absolute, inside the vault → its lane')
is(id(laneOfPath(`${VAULT}/projects/garden/beds.md`, LANES, `${VAULT}/`)) === 'garden', 'a vault given with a slash')
is(laneOfPath('/elsewhere/projects/garden/beds.md', LANES, VAULT) === null, 'absolute, outside the vault → none')
is(laneOfPath(`${VAULT}-old/projects/garden/beds.md`, LANES, VAULT) === null, 'the vault’s sibling → none')
is(laneOfPath('/x/projects/garden/beds.md', LANES) === null, 'absolute with no vault to read it against → none')

/* ---------- no lanes, and a lane with no folder ---------- */
is(laneOfPath('projects/garden/beds.md', []) === null, 'no lanes → none')
is(id(laneOfPath('projects/garden/beds.md', [NOWHERE, GARDEN])) === 'garden', 'a lane with no folder holds nothing')
is(laneOfPath('anything.md', [NOWHERE]) === null, 'not even the vault root')

/* ---------- skills, by name ---------- */
is(id(laneOfSkill('garden-check', LANES)) === 'garden', 'garden-check is Garden’s')
is(id(laneOfSkill('kitchen', LANES)) === 'kitchen', 'a skill named for the lane is its')
is(laneOfSkill('gardening-tips', LANES) === null, 'gardening-tips is nobody’s')
is(laneOfSkill('echo-word', LANES) === null, 'a skill naming no lane serves them all')
is(laneOfSkill('garden-check', []) === null, 'no lanes → none')
const CO = { id: 'co', name: 'Kitchen & Co', folder: 'co' }
is(id(laneOfSkill('kitchen-co-list', [KITCHEN, CO])) === 'co', 'the longer name wins: kitchen-co-list is Kitchen & Co’s')
is(slug('Café Ödön') === 'cafe-odon', 'slug folds accents')
is(laneLabel(GARDEN) === 'GARDEN', 'a lane is labelled by its name in capitals')

/* ---------- main's vote over a thread's files ---------- */
const touched = [
  { path: `${VAULT}/projects/kitchen/bread.md`, weight: 2 },
  { path: `${VAULT}/projects/garden/beds.md`, weight: 3 },
  { path: `${VAULT}/projects/garden/compost.md`, weight: 1 },
  { path: '/elsewhere/projects/kitchen/x.md', weight: 9 }
]
is(laneFromPaths(touched, LANES, VAULT) === 'garden', 'main: the heavier lane wins, and a file outside the vault has no vote', laneFromPaths(touched, LANES, VAULT))
is(laneFromPaths(touched, [], VAULT) === null, 'main: no lanes → unassigned')
is(laneFromPaths([{ path: 'projects/kitchen/bread.md', weight: 1 }], LANES, VAULT) === 'kitchen', 'main: a relative path is read as the vault’s')
// Found by running the old and the new rule over a real vault's threads: the
// old rule counted a lane's folder written as a folder (`projects/garden/`)
// and not its bare name, and a shell's escaped space left a backslash on a
// name that is no separator. Kept exactly, so nothing filed then moves now.
is(
  laneFromPaths([{ path: 'projects/garden', weight: 5 }, { path: 'projects/kitchen/bread.md', weight: 1 }], LANES, VAULT) === 'kitchen',
  'main: the lane’s folder itself is no vote; a note in another lane is'
)
is(laneFromPaths([{ path: `${VAULT}/projects/garden/`, weight: 5 }], LANES, VAULT) === 'garden', 'main: the folder written as a folder, `projects/garden/`, does vote — as it always has')
is(id(laneOfPath('projects/garden', LANES, undefined, { inside: true })) === null, '`inside`: the folder itself is not in it')
is(id(laneOfPath('projects/garden/x.md', LANES, undefined, { inside: true })) === 'garden', '`inside`: a note in it is')
is(laneOfPath('projects\\garden', LANES) === null, 'a backslash is a character, not a separator: `projects\\garden` is no folder of the vault')
is(laneOfPath('projects/garden\\', LANES) === null, '`projects/garden\\` is not `projects/garden`')
is(laneFromPaths([{ path: 'projects/garden\\', weight: 5 }], LANES, VAULT) === null, 'main: an escaped name’s backslash does not make it the lane’s folder')

console.log(failed ? `\n${failed} failed` : '\nall passed')
process.exit(failed ? 1 : 0)
