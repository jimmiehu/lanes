// A READ-ONLY FOLDER IS ONE THE PERSON NAMED — and only that folder.
//
// The app used to know one read-only folder, hard-coded by name. In any vault
// without that folder the rule protected nothing and named a folder that is
// not there. Now the folders are a setting (`readOnlyFolders`, empty by
// default), and every place main tested the old prefix asks one rule instead:
// the note's vault-relative path, as the walk spells it, is in a named folder
// — at a folder boundary, case aside, `inbox` and `inbox/` the same folder.
//
// Here, against a vault in a temporary directory: with `inbox` named, a note
// in it reads as read only, and is not written, renamed, moved out, trashed or
// made there, nor moved in from elsewhere — however its path is spelled — and
// a rename elsewhere leaves the links inside it as they were. `inbox-old`
// beside it is an ordinary folder. Nested folders are named the same way. With
// nothing named, nothing is read only.
//
// Runs main's own `src/main/notes.ts`, bundled for node with a stand-in for
// electron's `shell` that only writes down what it was asked.
//
//   node checks/read-only-rule.mjs
import { build } from 'esbuild'
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const work = await realpath(await mkdtemp(join(tmpdir(), 'lanes-read-only-')))
const vault = join(work, 'vault')

const NOTES = {
  'inbox/x.md': '# X\n\nWritten by an automation. See [[notes/a]].\n',
  'inbox/sub/deep.md': '# Deep\n\nFurther in.\n',
  'inbox-old/y.md': '# Y\n\nAn ordinary note beside the inbox.\n',
  'notes/a.md': '# A\n\nAn ordinary note.\n',
  'notes/pointer.md': '# Pointer\n\nSee [[notes/a]].\n',
  'projects/garden/beds.md': '# Beds\n\nRaised, four of them.\n',
  'projects/gardening/tips.md': '# Tips\n\nNot the garden.\n'
}
for (const [rel, text] of Object.entries(NOTES)) {
  await mkdir(dirname(join(vault, rel)), { recursive: true })
  await writeFile(join(vault, rel), text)
}

let failed = 0
let held = 0
const is = (ok, what, detail = '') => {
  held++
  if (ok) return
  failed++
  console.log(`  ✗ ${what}${detail ? `\n      ${detail}` : ''}`)
}
const j = JSON.stringify
const disk = async (rel) => {
  try {
    return await readFile(join(vault, rel), 'utf8')
  } catch {
    return null
  }
}

/* ---------- main's notes module, as main runs it ---------- */

let M = null
try {
  await build({
    stdin: {
      contents: "export * from './src/main/notes.ts'\nexport * from './src/main/config.ts'\n",
      resolveDir: join(here, '..'),
      loader: 'ts'
    },
    bundle: true,
    platform: 'node',
    format: 'esm',
    outfile: join(work, 'notes.mjs'),
    logLevel: 'silent',
    plugins: [
      {
        name: 'electron',
        setup(b) {
          b.onResolve({ filter: /^electron$/ }, () => ({ path: 'electron', namespace: 'stand-in' }))
          b.onLoad({ filter: /.*/, namespace: 'stand-in' }, () => ({
            contents:
              'const asked = (globalThis.__shell ??= [])\n' +
              "export const shell = { trashItem: async (p) => { asked.push(['trashItem', p]) }, showItemInFolder: (p) => { asked.push(['showItemInFolder', p]) } }\n" +
              'export const app = {}\n',
            loader: 'js'
          }))
        }
      }
    ]
  })
  // The old config read LANES_VAULT as it loaded; the new one is told.
  process.env.LANES_VAULT = vault
  M = await import(pathToFileURL(join(work, 'notes.mjs')).href)
  if (typeof M.setVault === 'function') M.setVault(vault)
} catch (err) {
  is(false, 'main’s notes module bundles', String(err.message ?? err).split('\n')[0])
}

const shellLog = () => (globalThis.__shell ??= [])
const refused = (r) => r?.ok === false

if (M) {
  is(typeof M.setReadOnlyFolders === 'function', 'notes.ts is told which folders are read only (setReadOnlyFolders)')
  is(typeof M.isReadOnly === 'function', 'and asks one rule of a path (isReadOnly)')
  const tell = (folders) => (typeof M.setReadOnlyFolders === 'function' ? M.setReadOnlyFolders(folders) : undefined)

  /* ---------- the rule ---------- */
  if (typeof M.isReadOnly === 'function') {
    for (const [rel, folders, want] of [
      ['inbox/x.md', ['inbox'], true],
      ['inbox/x.md', ['inbox/'], true],
      ['inbox/x.md', ['./inbox/'], true],
      ['inbox/x.md', ['/inbox'], true],
      ['Inbox/X.md', ['inbox'], true],
      ['inbox/x.md', ['INBOX/'], true],
      ['inbox/sub/deep.md', ['inbox'], true],
      ['inbox', ['inbox'], true],
      ['inbox-old/y.md', ['inbox'], false],
      ['inboxes/y.md', ['inbox'], false],
      ['notes/inbox/y.md', ['inbox'], false],
      ['notes/a.md', ['inbox'], false],
      ['projects/garden/beds.md', ['projects/garden'], true],
      ['projects/gardening/tips.md', ['projects/garden'], false],
      ['projects/garden/beds.md', ['projects/garden/', 'inbox'], true],
      ['inbox/x.md', [], false],
      ['inbox/x.md', [''], false],
      ['notes/a.md', ['/'], false],
      ['notes/a.md', ['.'], false]
    ]) {
      is(M.isReadOnly(rel, folders) === want, `isReadOnly(${j(rel)}, ${j(folders)}) is ${want}`, j(M.isReadOnly(rel, folders)))
    }
  }

  /* ---------- `inbox` named: its notes are read and never changed ---------- */
  tell(['inbox'])
  const x = await M.readNote('inbox/x.md')
  is(x?.readOnly === true, 'a note in the named folder reads as read only', j(x?.readOnly))
  is((await M.readNote('inbox/sub/deep.md'))?.readOnly === true, 'and one deeper in it', j((await M.readNote('inbox/sub/deep.md'))?.readOnly))
  is((await M.readNote('inbox-old/y.md'))?.readOnly === false, 'the sibling inbox-old is not read only', j((await M.readNote('inbox-old/y.md'))?.readOnly))
  is((await M.readNote('notes/a.md'))?.readOnly === false, 'an ordinary note is not', j((await M.readNote('notes/a.md'))?.readOnly))

  for (const spelled of ['inbox/x.md', './inbox/x.md', 'inbox//x.md', 'notes/../inbox/x.md', 'inbox/sub/deep.md']) {
    const from = shellLog().length
    const w = await M.writeNote(spelled, '# X\n\nOver it.\n', x?.edited)
    is(refused(w), `writeNote(${j(spelled)}) is refused`, j(w))
    is(refused(M.writeNoteSync(spelled, '# X\n\nOver it.\n', x?.edited)), `writeNoteSync(${j(spelled)}) is refused`)
    is(refused(await M.renameNote(spelled, 'Renamed')), `renameNote(${j(spelled)}) is refused`)
    is(refused(await M.moveNote(spelled, 'notes')), `moveNote(${j(spelled)}) out of it is refused`)
    is(refused(await M.trashNote(spelled)), `trashNote(${j(spelled)}) is refused`)
    is(shellLog().length === from, `and the shell was asked for nothing for ${j(spelled)}`, j(shellLog().slice(from)))
  }
  is(refused(await M.moveNote('notes/a.md', 'inbox')), 'a note is not moved into it')
  is(refused(await M.moveNote('notes/a.md', 'inbox/sub')), 'nor into a folder inside it')
  is(refused(await M.createNote('Made', 'inbox')), 'a note is not made in it')
  is(refused(await M.createNote('inbox/Made', '')), 'nor by a name that carries the folder')
  is(refused(await M.createUntitled('inbox')), 'nor an untitled one')
  is(refused(await M.createUntitled('./inbox/')), 'however the folder is spelled')
  await M.drainWrites()
  for (const rel of ['inbox/x.md', 'inbox/sub/deep.md']) {
    is((await disk(rel)) === NOTES[rel], `${rel} is as the automation left it`, j(await disk(rel)))
  }
  is(!existsSync(join(vault, 'inbox', 'made.md')) && !existsSync(join(vault, 'inbox', 'untitled.md')), 'and nothing new is in it')
  is(existsSync(join(vault, 'notes', 'a.md')), 'the note that was not moved in is where it was')

  // A rename elsewhere rewrites the links that point at the renamed note —
  // but not inside a read-only folder.
  const renamed = await M.renameNote('notes/a.md', 'Alpha')
  is(renamed?.ok === true && renamed.path === 'notes/alpha.md', 'an ordinary note is renamed', j(renamed))
  is((await disk('notes/pointer.md'))?.includes('[[notes/alpha]]'), 'the ordinary note pointing at it is relinked', j(await disk('notes/pointer.md')))
  is((await disk('inbox/x.md')) === NOTES['inbox/x.md'], 'the inbox note pointing at it is left as it was', j(await disk('inbox/x.md')))

  // The sibling is an ordinary folder: written, renamed, trashed.
  const y = await M.readNote('inbox-old/y.md')
  const wy = await M.writeNote('inbox-old/y.md', '# Y\n\nWritten here.\n', y?.edited)
  is(wy?.ok === true && (await disk('inbox-old/y.md')) === '# Y\n\nWritten here.\n', 'inbox-old is written', j(wy))
  is((await M.createNote('Made', 'inbox-old'))?.ok === true, 'a note is made in inbox-old')

  /* ---------- `inbox/` is the same folder; a nested folder is named the same way ---------- */
  tell(['inbox/'])
  is((await M.readNote('inbox/x.md'))?.readOnly === true, '`inbox/` names the same folder')
  is(refused(await M.writeNote('inbox/x.md', 'over\n')), 'and refuses the same write')
  tell(['projects/garden'])
  is((await M.readNote('projects/garden/beds.md'))?.readOnly === true, 'a nested folder can be named')
  is((await M.readNote('projects/gardening/tips.md'))?.readOnly === false, 'and its sibling with a longer name is not in it')
  is((await M.readNote('inbox/x.md'))?.readOnly === false, 'and the inbox, no longer named, is not read only')

  /* ---------- nothing named: nothing is read only ---------- */
  tell([])
  const free = await M.readNote('inbox/x.md')
  is(free?.readOnly === false, 'with no folder named, the inbox note is an ordinary note', j(free?.readOnly))
  const wx = await M.writeNote('inbox/x.md', '# X\n\nNow mine.\n', free?.edited)
  is(wx?.ok === true && (await disk('inbox/x.md')) === '# X\n\nNow mine.\n', 'and is written', j(wx))
  is((await M.createUntitled('inbox'))?.ok === true, 'and a note is made there')

  await M.drainWrites()
}
await rm(work, { recursive: true, force: true })

console.log(
  failed
    ? `\n${failed} of ${held} failed`
    : `all ${held} read-only-rule assertions hold (a named folder is never written, moved or trashed; its sibling and an unnamed vault are ordinary)`
)
process.exit(failed ? 1 : 0)
