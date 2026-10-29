// EVERY PATH THE RENDERER HANDS MAIN STAYS IN THE VAULT — proved.
//
// A note crosses the IPC boundary as a vault-relative path, and main turns it
// back into a file. Most handlers made that turn with `startsWith(VAULT)`,
// which is no test at all for the paths that matter: `''`, `.` and `/` are the
// vault itself — `noteTrash('')` sent the whole vault to the Trash — and
// `../Vault-old/x` passes whenever a sibling folder's name begins with the
// vault's. Two handlers checked nothing. The skills' id admitted `..`, and
// `deleteSkill('..')` moved the vault's `.claude` into the trash.
//
// So every handler that takes a note's path goes through one guard
// (`vaultPath`, `main/notes.ts`), a skill's id may not be `.` or `..`, and the
// ids and state patches the renderer sends are checked at the door
// (`main/ipcGuard.ts`). Here each handler is fed the paths that are not notes —
// the vault itself, the root, home, `..`, a sibling folder with a note in it,
// `/etc/hosts`, a NUL — and must refuse every one with nothing touched: the
// stand-in for electron's `shell` is never asked to trash or show anything,
// and no file outside the vault is so much as stat'ed. The sibling's note is
// still there, unread. The same handlers still take a real note, spelled
// either way.
//
// Runs main's own modules, bundled for node with a stand-in for `electron`
// and a recorder over `fs`, against a vault it makes in a temporary directory.
//
//   node checks/ipc-paths.mjs
import { build } from 'esbuild'
import { randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
const work = await realpath(await mkdtemp(join(tmpdir(), 'lanes-ipc-paths-')))
// A sibling whose name begins with the vault's: the case `startsWith` misses.
const vault = join(work, 'Vault')
const sibling = join(work, 'Vault-old')
const SIBLING_NOTE = 'A note that is not in the vault.\n'

await mkdir(join(vault, 'notes'), { recursive: true })
await mkdir(join(vault, 'inbox'), { recursive: true })
await mkdir(join(vault, '.claude', 'skills', 'echo'), { recursive: true })
await mkdir(join(vault, '.claude', 'skills', 'echo-two'), { recursive: true })
await mkdir(sibling, { recursive: true })
await writeFile(join(vault, 'notes', 'a.md'), '# A\n\nThe note the handlers may touch.\n')
await writeFile(join(vault, 'notes', 'b.md'), '# B\n\nThe note that goes to the Trash.\n')
await writeFile(join(vault, 'inbox', 'x.md'), '# X\n\nWritten by an automation.\n')
const skill = (name) => `---\nname: ${name}\ndescription: >\n  A skill.\n---\n\n# ${name}\n`
await writeFile(join(vault, '.claude', 'skills', 'echo', 'SKILL.md'), skill('echo'))
await writeFile(join(vault, '.claude', 'skills', 'echo-two', 'SKILL.md'), skill('echo-two'))
await writeFile(join(sibling, 'x.md'), SIBLING_NOTE)

/* ---------- main's modules, as main runs them ---------- */

/** A module whose functions are the real ones, each call written down first. */
const recorder = (mod, names) =>
  `import * as real from '${mod}'\n` +
  'const log = (globalThis.__fs ??= [])\n' +
  names
    .map((n) => `export const ${n} = (...a) => (log.push([${JSON.stringify(n)}, String(a[0]), typeof a[1] === 'string' ? a[1] : null]), real.${n}(...a))`)
    .join('\n') +
  '\n'
const FS_PROMISES = ['access', 'appendFile', 'copyFile', 'cp', 'lstat', 'mkdir', 'open', 'readFile', 'readdir', 'realpath', 'rename', 'rm', 'stat', 'unlink', 'utimes', 'writeFile']
const FS = ['appendFileSync', 'copyFileSync', 'existsSync', 'lstatSync', 'mkdirSync', 'readFileSync', 'readdirSync', 'realpathSync', 'renameSync', 'rmSync', 'statSync', 'unlinkSync', 'writeFileSync']
const standIns = {
  name: 'stand-ins',
  setup(b) {
    b.onResolve({ filter: /^(node:)?fs(\/promises)?$/ }, (a) =>
      a.namespace === 'stand-in' ? undefined : { path: a.path.replace(/^node:/, ''), namespace: 'stand-in' }
    )
    b.onResolve({ filter: /^electron$/ }, () => ({ path: 'electron', namespace: 'stand-in' }))
    b.onLoad({ filter: /.*/, namespace: 'stand-in' }, (a) => {
      if (a.path === 'fs/promises') return { contents: recorder('node:fs/promises', FS_PROMISES), loader: 'js', resolveDir: here }
      if (a.path === 'fs') return { contents: recorder('node:fs', FS), loader: 'js', resolveDir: here }
      // Asked, never done: what main asks the shell for is the evidence.
      return {
        contents:
          'const asked = (globalThis.__shell ??= [])\n' +
          'export const shell = {\n' +
          "  trashItem: async (p) => { asked.push(['trashItem', p]) },\n" +
          "  showItemInFolder: (p) => { asked.push(['showItemInFolder', p]) },\n" +
          "  openPath: async (p) => { asked.push(['openPath', p]); return '' },\n" +
          "  openExternal: async (p) => { asked.push(['openExternal', p]) }\n" +
          '}\n' +
          'export const app = {}\n',
        loader: 'js'
      }
    })
  }
}
const bundle = async (contents, out) => {
  await build({
    stdin: { contents, resolveDir: root, loader: 'ts' },
    bundle: true,
    platform: 'node',
    format: 'esm',
    outfile: join(work, out),
    logLevel: 'silent',
    plugins: [standIns]
  })
  return import(pathToFileURL(join(work, out)).href)
}

let failed = 0
let held = 0
const is = (ok, what, detail = '') => {
  held++
  if (ok) return
  failed++
  console.log(`  ✗ ${what}${detail ? `\n      ${detail}` : ''}`)
}
const j = (v) => JSON.stringify(v, (_k, x) => (typeof x === 'string' ? x.replaceAll('\0', '\\0') : x))

const N = await bundle(
  "export * from './src/main/notes.ts'\nexport { deleteSkill, writeSkill, listSkills } from './src/main/skills.ts'\nexport { setVault } from './src/main/config.ts'\n",
  'main.mjs'
)
// Told what index.ts tells them at launch — as the sample's state file says,
// that its `inbox/` is read only — and, below, the folder.
N.setReadOnlyFolders(['inbox/'])
// Its own bundle: before it existed, the rest of this was still worth running.
let G = null
try {
  G = await bundle("export * from './src/main/ipcGuard.ts'\n", 'guard.mjs')
} catch (err) {
  is(false, 'main/ipcGuard.ts bundles', String(err.message ?? err).split('\n')[0])
}

const fsLog = () => (globalThis.__fs ??= [])
const shellLog = () => (globalThis.__shell ??= [])
const WRITES = new Set(['appendFile', 'copyFile', 'cp', 'mkdir', 'rename', 'rm', 'unlink', 'utimes', 'writeFile', 'appendFileSync', 'copyFileSync', 'mkdirSync', 'renameSync', 'rmSync', 'unlinkSync', 'writeFileSync'])
/** Where a path the fs was asked about lies: in the vault, the vault itself, or out of it. */
const where = (p) => {
  const r = relative(vault, resolve(p))
  if (r === '') return 'the vault itself'
  return r.startsWith('..') || isAbsolute(r) ? 'outside' : 'inside'
}

/**
 * One call fed a path that is not a note: refused, the shell never asked,
 * nothing written anywhere, and nothing outside the vault — or the vault
 * itself — so much as looked at.
 */
const refuses = async (handler, input, call, refused) => {
  const fsFrom = fsLog().length
  const shellFrom = shellLog().length
  let got
  try {
    got = await call()
  } catch (err) {
    got = { threw: String(err) }
  }
  await N.drainWrites()
  const what = `${handler}(${j(input)})`
  is(refused(got), `${what} is refused`, j(got))
  const asked = shellLog().slice(shellFrom)
  is(!asked.length, `${what} asks the shell for nothing`, j(asked))
  const touched = fsLog()
    .slice(fsFrom)
    .filter(([op, p, to]) => WRITES.has(op) || where(p) !== 'inside' || (to && where(to) !== 'inside'))
  is(!touched.length, `${what} touches nothing, and looks at nothing outside the vault`, j(touched))
}

/* ---------- before there is a folder, nothing is a note ---------- */

// Main is told its folder at launch (index.ts, vaultChooser.ts). Until then a
// note's path is no path at all — not one in whatever directory the process
// happened to start in, where a write lands in somebody's working copy.
for (const [handler, call, refused] of [
  ['readNote', () => N.readNote('notes/a.md'), (r) => r === null],
  ['writeNote', () => N.writeNote('notes/a.md', 'words from nowhere\n'), (r) => r?.ok === false],
  ['writeNoteSync', () => N.writeNoteSync('notes/a.md', 'words from nowhere\n'), (r) => r?.ok === false],
  ['trashNote', () => N.trashNote('notes/b.md'), (r) => r?.ok === false],
  ['revealNote', () => N.revealNote('notes/a.md'), (r) => r === false],
  ['noteMtime', () => N.noteMtime('notes/a.md'), (r) => r === null],
  ['renameNote', () => N.renameNote('notes/a.md', 'Renamed'), (r) => r?.ok === false],
  ['moveNote', () => N.moveNote('notes/a.md', 'later'), (r) => r?.ok === false],
  ['createUntitled', () => N.createUntitled(''), (r) => r?.ok === false],
  ['createNote', () => N.createNote('Made', ''), (r) => r?.ok === false],
  ['writeSkill', () => N.writeSkill('echo', 'Echo', 'Says it back.'), (r) => r?.ok === false],
  ['deleteSkill', () => N.deleteSkill('echo-two'), (r) => r?.ok === false],
  ['listSkills', () => N.listSkills(), (r) => Array.isArray(r) && r.length === 0]
]) {
  await refuses(`${handler}, with no folder yet,`, 'notes/a.md', call, refused)
}
N.setVault(vault)

/* ---------- every note handler, fed what is not a note ---------- */

const NOT_NOTES = [
  '',
  '.',
  './',
  '/',
  '../x',
  '../x.md',
  'notes/../../x.md',
  '/etc/hosts',
  '~/x',
  '~/x.md',
  `${sibling}/x.md`,
  `../${basename(sibling)}/x.md`,
  'a\0b',
  'notes/a.md\0.txt'
]
const HANDLERS = [
  ['readNote', (p) => N.readNote(p), (r) => r === null],
  ['writeNote', (p) => N.writeNote(p, 'words from nowhere\n'), (r) => r?.ok === false],
  ['writeNoteSync', (p) => N.writeNoteSync(p, 'words from nowhere\n'), (r) => r?.ok === false],
  ['trashNote', (p) => N.trashNote(p), (r) => r?.ok === false],
  ['revealNote', (p) => N.revealNote(p), (r) => r === false],
  ['noteMtime', (p) => N.noteMtime(p), (r) => r === null],
  ['noteOwnChange', (p) => N.noteOwnChange(p), (r) => r === false],
  ['renameNote', (p) => N.renameNote(p, 'Renamed'), (r) => r?.ok === false],
  ['moveNote', (p) => N.moveNote(p, 'notes'), (r) => r?.ok === false]
]
for (const [handler, call, refused] of HANDLERS) {
  for (const input of NOT_NOTES) await refuses(handler, input, () => call(input), refused)
}
// A move's target is a path from the renderer too.
for (const folder of ['..', `../${basename(sibling)}`, '~', 'a\0b']) {
  await refuses('moveNote', ['notes/a.md', folder], () => N.moveNote('notes/a.md', folder), (r) => r?.ok === false)
}

// Making a note takes a FOLDER, and there `''`, `.` and `/` are the vault's
// root, as a typed folder means them — see below. What it may not do is leave.
const LEAVING = ['../x', `../${basename(sibling)}`, 'notes/../..', '~/x', '~', 'a\0b']
for (const into of LEAVING) {
  await refuses('createUntitled', into, () => N.createUntitled(into), (r) => r?.ok === false)
  await refuses('createNote', ['Made', into], () => N.createNote('Made', into), (r) => r?.ok === false)
}
await refuses('createNote', '../x/Made', () => N.createNote('../x/Made', ''), (r) => r?.ok === false)

/* ---------- a note is a file, and the inbox is read only however it is spelled ---------- */

await refuses('trashNote', 'notes', () => N.trashNote('notes'), (r) => r?.ok === false)
is(existsSync(join(vault, 'notes', 'a.md')), 'a folder is not trashed as a note: its notes are all still there')
for (const spelled of ['./inbox/x.md', 'notes/../inbox/x.md', 'inbox//x.md']) {
  await refuses('writeNote', spelled, () => N.writeNote(spelled, 'over the inbox\n'), (r) => r?.ok === false)
  await refuses('writeNoteSync', spelled, () => N.writeNoteSync(spelled, 'over the inbox\n'), (r) => r?.ok === false)
  await refuses('trashNote', spelled, () => N.trashNote(spelled), (r) => r?.ok === false)
}
is((await readFile(join(vault, 'inbox', 'x.md'), 'utf8')).includes('Written by an automation.'), 'the inbox note is as the automation left it')

/* ---------- a note is a `.md` file the vault's notes are: not settings, not a hidden folder's ---------- */

// The vault's `.claude/settings.json` is what a Claude session started in the
// vault reads its hooks from; a note handler that would write it would let a
// page run commands. Only a note — a `.md` file outside the hidden folders the
// note walk skips — is written, trashed or moved.
await writeFile(join(vault, '.claude', 'settings.json'), '{}\n')
await writeFile(join(vault, 'notes', 'sheet.csv'), 'a,b\n')
for (const spelled of ['.claude/settings.json', '.claude/skills/echo/SKILL.md', 'notes/sheet.csv', 'notes/script.sh', '.hidden/x.md']) {
  await refuses('writeNote', spelled, () => N.writeNote(spelled, '{"hooks":{}}\n'), (r) => r?.ok === false)
  await refuses('writeNoteSync', spelled, () => N.writeNoteSync(spelled, '{"hooks":{}}\n'), (r) => r?.ok === false)
  await refuses('trashNote', spelled, () => N.trashNote(spelled), (r) => r?.ok === false)
  await refuses('renameNote', spelled, () => N.renameNote(spelled, 'Renamed'), (r) => r?.ok === false)
  await refuses('moveNote', spelled, () => N.moveNote(spelled, 'notes'), (r) => r?.ok === false)
}
await refuses('moveNote', ['notes/a.md', '.claude'], () => N.moveNote('notes/a.md', '.claude'), (r) => r?.ok === false)
is(
  existsSync(join(vault, '.claude', 'settings.json')) && (await readFile(join(vault, '.claude', 'settings.json'), 'utf8')) === '{}\n',
  'the vault’s Claude settings are where and as they were'
)

/* ---------- the skills: an id is a folder's name, never `.` or `..` ---------- */

for (const id of ['..', '.', '', '../..', 'a/b', 'a\0b']) {
  await refuses('deleteSkill', id, () => N.deleteSkill(id), (r) => r?.ok === false)
  await refuses('writeSkill', id, () => N.writeSkill(id, 'Name', 'What it does.'), (r) => r?.ok === false)
}
is(existsSync(join(vault, '.claude', 'skills', 'echo', 'SKILL.md')), 'the vault’s .claude and its skills are all still there')
is(!existsSync(join(vault, '.trash', 'skills')) || !existsSync(join(vault, '.trash', 'skills', '..-2')), 'nothing of .claude went to the skills’ trash')

/* ---------- the sibling's note: there, and never read ---------- */

is((await readFile(join(sibling, 'x.md'), 'utf8')) === SIBLING_NOTE, 'the sibling folder’s note is still there, as it was')
const lookedAt = fsLog().filter(([, p, to]) => p.startsWith(sibling) || (to && to.startsWith(sibling)))
is(!lookedAt.length, 'and nothing in main so much as looked at it', j(lookedAt))
is(!shellLog().length, 'the shell was asked for nothing at all, by any of it', j(shellLog()))

/* ---------- the guard itself ---------- */

if (typeof N.vaultPath !== 'function') is(false, 'notes.ts has one guard, vaultPath')
else {
  for (const p of NOT_NOTES) is(N.vaultPath(p) === null, `vaultPath(${j(p)}) is null`, j(N.vaultPath(p)))
  for (const [p, want] of [
    ['notes/a.md', 'notes/a.md'],
    ['./notes/a.md', 'notes/a.md'],
    ['notes//a.md', 'notes/a.md'],
    ['notes/./a.md', 'notes/a.md'],
    ['other/../notes/a.md', 'notes/a.md']
  ]) {
    is(N.vaultPath(p) === want, `vaultPath(${j(p)}) is ${want}`, j(N.vaultPath(p)))
  }
}

/* ---------- and the same handlers still take a real note ---------- */

const read = await N.readNote('./notes/a.md')
is(read?.path === 'notes/a.md' && read.body.includes('The note the handlers may touch.'), 'a note is read, spelled either way, and answered by its one spelling', j(read?.path))
is(typeof (await N.noteMtime('notes/a.md')) === 'number', 'its mtime is asked')
const wrote = await N.writeNote('notes/a.md', '# A\n\nWritten here.\n', read?.edited)
is(wrote?.ok === true && (await readFile(join(vault, 'notes', 'a.md'), 'utf8')) === '# A\n\nWritten here.\n', 'a note is written', j(wrote))
is((await N.revealNote('notes/a.md')) === true, 'a note is shown in the Finder')
is((await N.trashNote('notes/b.md'))?.ok === true, 'a note goes to the Trash')
const asked = shellLog()
is(
  j(asked) === j([['showItemInFolder', join(vault, 'notes', 'a.md')], ['trashItem', join(vault, 'notes', 'b.md')]]),
  'and the shell is asked for exactly those two, and those files',
  j(asked)
)
const blank = await N.createUntitled('')
is(blank?.ok === true && blank.path === 'untitled.md', 'an untitled note is made at the vault’s root', j(blank))
const rooted = await N.createUntitled('/')
is(rooted?.ok === true && rooted.path === 'untitled-2.md', 'and `/`, as a typed folder, is that root too', j(rooted))
const made = await N.createNote('/notes/Kickoff', '')
is(made?.ok === true && made.path === 'notes/kickoff.md', 'a typed `/notes/…` is the vault’s notes folder', j(made))
const moved = await N.moveNote('notes/kickoff.md', 'later')
is(moved?.ok === true && moved.path === 'later/kickoff.md', 'a note is moved', j(moved))
is((await N.writeSkill('echo', 'Echo', 'Says it back.'))?.ok === true, 'a skill is written')
is((await N.deleteSkill('echo-two'))?.ok === true && existsSync(join(vault, '.trash', 'skills', 'echo-two', 'SKILL.md')), 'a skill goes to the vault’s trash')

/* ---------- ids and state patches, at the door ---------- */

if (G) {
  const { isSessionId, sanitizeStatePatch } = G
  for (const id of ['../x', '', 'x', '../../../../etc/hosts', `${randomUUID()}/..`, `../${randomUUID()}`.slice(0, 36), 42, null, undefined]) {
    is(isSessionId(id) === false, `isSessionId(${j(id)}) is false`)
  }
  const real = randomUUID()
  is(isSessionId(real) === true && isSessionId(real.toUpperCase()) === true, 'a real session id is one', real)

  const same = (got, want, what) => is(j(got) === j(want), what, `${j(got)}\n      want ${j(want)}`)
  const given = { safety: 'yolo', theme: 'dark', marks: ['notes/a.md'] }
  same(sanitizeStatePatch(given), { theme: 'dark', marks: ['notes/a.md'] }, 'a safety that is no safety is dropped; the rest stands untouched')
  same(given.safety, 'yolo', 'and what was given is not changed')
  same(sanitizeStatePatch({ safety: 'guarded' }), { safety: 'guarded' }, 'a real safety stands')
  same(sanitizeStatePatch({ safety: 3 }), {}, 'a number is no safety')
  const prompt = { id: 'p1', name: 'Morning', text: '/morning', safety: 'root' }
  same(
    sanitizeStatePatch({ prompts: [prompt, { id: 'p2', name: 'Evening', text: 'x', safety: 'standard' }] }),
    { prompts: [{ id: 'p1', name: 'Morning', text: '/morning' }, { id: 'p2', name: 'Evening', text: 'x', safety: 'standard' }] },
    'a prompt’s wrong safety is dropped, and the prompt kept'
  )
  same(sanitizeStatePatch({ prompts: 'all of them' }), {}, 'prompts that are not a list are dropped')
  same(sanitizeStatePatch({ prompts: [prompt, 7] }), {}, 'a list with a non-prompt in it is dropped whole, not saved short')
  // The folder Lanes works in is main's to choose, in its own picker: a page's
  // `/` would be relaunched on as the vault, every note guard measured from it.
  same(sanitizeStatePatch({ vault: '/x/Vault' }), {}, 'a vault from the page is dropped')
  same(sanitizeStatePatch({ vault: '/', theme: 'dark' }), { theme: 'dark' }, 'even the root, and the rest of that patch still lands')
  same(sanitizeStatePatch({ vault: 42 }), {}, 'a vault that is not a string is dropped too')
  same(sanitizeStatePatch({ newNoteFolder: '' }), { newNoteFolder: '' }, 'an empty new-note folder is the root, and stands')
  same(sanitizeStatePatch({ newNoteFolder: null }), {}, 'a null one is dropped')
  same(sanitizeStatePatch({ readOnlyFolders: ['inbox/'] }), { readOnlyFolders: ['inbox/'] }, 'read-only folders that are strings stand')
  same(sanitizeStatePatch({ readOnlyFolders: ['inbox/', 1] }), {}, 'read-only folders with a number in them are dropped')
  const lane = { id: 'garden', name: 'Garden', folder: 'projects/garden', purpose: 'Growing things' }
  same(sanitizeStatePatch({ lanes: [lane, { id: 'k', name: 'K', folder: 'k' }] }), { lanes: [lane, { id: 'k', name: 'K', folder: 'k' }] }, 'lanes of the right shape stand')
  same(sanitizeStatePatch({ lanes: [{ id: 'k', name: 'K' }] }), {}, 'a lane with no folder drops the lanes')
  same(sanitizeStatePatch({ lanes: [{ ...lane, purpose: 3 }] }), {}, 'a lane whose purpose is a number drops the lanes')
  same(sanitizeStatePatch({ lanes: 'garden' }), {}, 'lanes that are not a list are dropped')
  for (const p of [null, 'safety', 3, ['x']]) same(sanitizeStatePatch(p), {}, `a patch that is no object (${j(p)}) is nothing`)
}

await N.drainWrites()
await rm(work, { recursive: true, force: true })

console.log(
  failed
    ? `\n${failed} of ${held} failed`
    : `all ${held} ipc-paths assertions hold (every path handler refuses what is not a note, and nothing outside the vault is touched)`
)
process.exit(failed ? 1 : 0)
