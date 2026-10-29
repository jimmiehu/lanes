// THE FOLDER IS ASKED FOR, NOT ASSUMED.
//
// Lanes ran every thread in, and read every note from, one folder written into
// the source. Now the folder is the person's, kept in the
// state file. At launch, before there is a window, main asks for it when it
// has none — no `vault` in the state file and, in development, no LANES_VAULT —
// and when the one it has is gone, saying which. The question offers a folder
// of one's own, a copy of the sample vault (put where the person says, never
// over anything), or Quit, which quits and writes nothing. What is chosen is
// written to the state file at once, beside everything already there. And
// Settings' *Change…* asks for a folder, writes it and relaunches — or, asked
// and cancelled, says so and changes nothing.
//
// Runs main's own `src/main/vaultChooser.ts`, bundled for node with a stand-in
// for electron whose dialogs answer from a script and whose userData is a
// temporary directory; the sample is the repository's own fixtures/sample-vault.
//
//   node checks/vault-chooser.mjs
import { build } from 'esbuild'
import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const repo = join(here, '..')
const work = await realpath(await mkdtemp(join(tmpdir(), 'lanes-vault-chooser-')))
globalThis.__repo = repo

let failed = 0
let held = 0
const is = (ok, what, detail = '') => {
  held++
  if (ok) return
  failed++
  console.log(`  ✗ ${what}${detail ? `\n      ${detail}` : ''}`)
}
const j = JSON.stringify
const same = (got, want, what) => is(j(got) === j(want), what, `${j(got)}\n      want ${j(want)}`)

let built = true
try {
  await build({
    stdin: {
      contents:
        "export * from './src/main/vaultChooser.ts'\n" +
        "export { VAULT } from './src/main/config.ts'\n" +
        "export { loadState } from './src/main/state.ts'\n",
      resolveDir: repo,
      loader: 'ts'
    },
    bundle: true,
    platform: 'node',
    format: 'esm',
    outfile: join(work, 'main.mjs'),
    logLevel: 'silent',
    plugins: [
      {
        name: 'electron',
        setup(b) {
          b.onResolve({ filter: /^electron$/ }, () => ({ path: 'electron', namespace: 'stand-in' }))
          // Every dialog answers from globalThis.__ui and writes down what it
          // was shown; the app writes down what it was told to do.
          b.onLoad({ filter: /.*/, namespace: 'stand-in' }, () => ({
            contents:
              // Read once, as each case's copy of main loads: a write still on
              // its way from one case cannot land in the next one's directory.
              'const U = globalThis.__ui\n' +
              'const DIR = globalThis.__userData\n' +
              'const ui = () => U\n' +
              'const opts = (a, b) => (b === undefined ? a : b)\n' +
              'export const dialog = {\n' +
              '  showMessageBox: async (a, b) => { ui().boxes.push(opts(a, b)); return { response: ui().answers.shift() ?? 2, checkboxChecked: false } },\n' +
              '  showOpenDialog: async (a, b) => { ui().opens.push(opts(a, b)); const p = ui().picks.shift(); return p ? { canceled: false, filePaths: [p] } : { canceled: true, filePaths: [] } },\n' +
              '  showErrorBox: (t, c) => { ui().errors.push([t, c]) }\n' +
              '}\n' +
              'export const app = {\n' +
              '  getPath: () => DIR,\n' +
              '  getAppPath: () => globalThis.__repo,\n' +
              '  isPackaged: false,\n' +
              '  quit: () => { ui().did.push("quit") },\n' +
              '  relaunch: () => { ui().did.push("relaunch") },\n' +
              '  exit: (code) => { ui().did.push(`exit ${code}`) },\n' +
              '  focus() {}\n' +
              '}\n' +
              'export const shell = { trashItem: async () => {}, showItemInFolder() {} }\n' +
              'export class BrowserWindow {}\n',
            loader: 'js'
          }))
        }
      }
    ]
  })
} catch (err) {
  built = false
  is(false, 'src/main/vaultChooser.ts bundles', String(err.message ?? err).split('\n')[0])
}

/**
 * A fresh copy of main over its own userData — holding `saved` as its state
 * file, or none — with dialogs that answer `answers` (button indexes) and
 * folder pickers that answer `picks` (a folder, or nothing for Cancel).
 */
let n = 0
const mainOver = async (saved, { answers = [], picks = [], env } = {}) => {
  n += 1
  const dir = join(work, `case-${n}`)
  await mkdir(dir)
  const file = join(dir, 'lanes-state.json')
  if (saved !== undefined) await writeFile(file, JSON.stringify(saved, null, 2))
  globalThis.__userData = dir
  globalThis.__ui = { boxes: [], opens: [], errors: [], did: [], answers: [...answers], picks: [...picks] }
  if (env) process.env.LANES_VAULT = env
  else delete process.env.LANES_VAULT
  const M = await import(`${pathToFileURL(join(work, 'main.mjs')).href}?case=${n}`)
  const onDisk = async () => {
    try {
      return await readFile(file, 'utf8')
    } catch {
      return null
    }
  }
  return { M, ui: globalThis.__ui, onDisk, dir }
}
const folder = async (name) => {
  const p = join(work, name)
  await mkdir(p, { recursive: true })
  return p
}
const CALM = 'No account, no cloud, no tracking. Your notes stay in your folder.'
const said = (box) => `${box?.message ?? ''}\n${box?.detail ?? ''}`

if (built) {
  /* ---------- the decision ---------- */
  {
    const { M } = await mainOver(undefined)
    const yes = () => true
    const no = () => false
    same(M.vaultNeed(null, undefined, yes), { ask: true, reason: 'none' }, 'no vault in state and no LANES_VAULT: ask')
    same(M.vaultNeed('', undefined, yes), { ask: true, reason: 'none' }, 'an empty one is none')
    same(M.vaultNeed('/x/Notes', undefined, no), { ask: true, reason: 'missing', path: '/x/Notes' }, 'a folder that is gone: ask, and say which')
    same(M.vaultNeed('/x/Notes', undefined, yes), { ask: false, vault: '/x/Notes' }, 'a folder that is there: no question')
    same(M.vaultNeed(null, '/tmp/check-vault', yes), { ask: false, vault: '/tmp/check-vault' }, 'LANES_VAULT, in development, is the folder')
    same(M.vaultNeed('/x/Notes', '/tmp/check-vault', (p) => p === '/tmp/check-vault'), { ask: false, vault: '/tmp/check-vault' }, 'and wins over the state file’s')
    same(M.vaultNeed(null, '/tmp/gone', no), { ask: true, reason: 'missing', path: '/tmp/gone' }, 'a LANES_VAULT that is gone is asked about like any other')

    const none = M.chooserText({ ask: true, reason: 'none' })
    is(said(none).includes(CALM), 'the question says no account, no cloud, no tracking', said(none))
    same(none.buttons, ['Choose a folder…', 'Use the sample', 'Quit'], 'and offers a folder, the sample, or Quit')
    is(!said(none).includes('isn’t there'), 'with no folder yet, nothing is said to be missing', said(none))
    const missing = M.chooserText({ ask: true, reason: 'missing', path: '/x/Notes' })
    is(said(missing).includes('Your folder /x/Notes isn’t there.'), 'a missing folder is named', said(missing))
    is(said(missing).includes(CALM), 'and the rest is said too', said(missing))
  }

  /* ---------- at launch: reached, and Quit ---------- */
  {
    const { M, ui, onDisk } = await mainOver(undefined, { answers: [2] })
    const went = await M.ensureVault()
    is(ui.boxes.length === 1, 'no vault in state and no LANES_VAULT: the chooser is reached', j(ui.boxes.length))
    is(went === false, 'Quit: launch does not go on', j(went))
    same(ui.did, ['quit'], 'Quit quits')
    is((await onDisk()) === null, 'and writes nothing — not even a state file', await onDisk())
    same(M.VAULT, '', 'and no folder is set')
  }
  {
    const gone = join(work, 'Gone Notes')
    const saved = { vault: gone, safety: 'standard', tabs: [[], []] }
    const { M, ui, onDisk } = await mainOver(saved, { answers: [2] })
    await M.ensureVault()
    is(said(ui.boxes[0]).includes(`Your folder ${gone} isn’t there.`), 'a folder that is gone: the question says so', said(ui.boxes[0]))
    is((await onDisk()) === JSON.stringify(saved, null, 2), 'Quit leaves the state file exactly as it was', await onDisk())
  }

  /* ---------- a folder of one's own ---------- */
  {
    const mine = await folder('My Notes')
    const saved = { safety: 'standard', laneOverrides: { 'some-thread': 'a-lane-that-is-gone' }, newNoteFolder: '_unfiled' }
    const { M, ui, onDisk } = await mainOver(saved, { answers: [0], picks: [mine] })
    const went = await M.ensureVault()
    is(went === true, 'a folder chosen: launch goes on', j(went))
    const props = ui.opens[0]?.properties ?? []
    is(props.includes('openDirectory') && props.includes('createDirectory'), 'the picker picks a folder, and may make one', j(props))
    const disk = JSON.parse((await onDisk()) ?? '{}')
    same(disk.vault, mine, 'state.vault is written at once')
    same(M.VAULT, mine, 'and the folder is set')
    same([disk.safety, disk.laneOverrides, disk.newNoteFolder], [saved.safety, saved.laneOverrides, saved.newNoteFolder], 'and everything already in the state file is kept, an override for a lane nobody has included')
    same(ui.did, [], 'nothing is quit')
  }
  {
    // Cancel in the picker is not Quit: the question comes back.
    const { M, ui, onDisk } = await mainOver(undefined, { answers: [0, 2], picks: [] })
    await M.ensureVault()
    is(ui.boxes.length === 2 && ui.opens.length === 1, 'a cancelled picker asks the question again', j([ui.boxes.length, ui.opens.length]))
    is((await onDisk()) === null, 'and Quit then still writes nothing', await onDisk())
  }

  /* ---------- the sample, where the person says ---------- */
  {
    const where = await folder('Somewhere')
    const { M, ui, onDisk } = await mainOver(undefined, { answers: [1], picks: [where] })
    const went = await M.ensureVault()
    const copy = join(where, 'Lanes Sample')
    is(went === true, 'the sample chosen: launch goes on', j(went))
    is(existsSync(join(copy, 'Start here.md')), 'the sample is copied to <picked>/Lanes Sample', j(ui.errors))
    is(existsSync(join(copy, 'projects', 'garden', 'beds.md')) && existsSync(join(copy, '.claude', 'skills', 'echo-word', 'SKILL.md')), 'all of it, its skills too')
    const disk = JSON.parse((await onDisk()) ?? '{}')
    same(disk.vault, copy, 'state.vault points at the copy')
    same(M.VAULT, copy, 'and the folder is set')
    same((disk.lanes ?? []).map((l) => [l.name, l.folder]), [['Garden', 'projects/garden'], ['Kitchen', 'projects/kitchen']], 'the sample’s two lanes come with it, as its guide says')
    same(disk.readOnlyFolders, ['inbox/'], 'and its inbox is read only, as its guide says')

    // Again, into the same place: a second copy beside the first, never over it.
    await writeFile(join(copy, 'mine.md'), '# Mine\n\nWritten in the first copy.\n')
    const again = await mainOver({ lanes: [{ id: 'x', name: 'X', folder: 'x' }], readOnlyFolders: [] }, { answers: [1], picks: [where] })
    await again.M.ensureVault()
    const second = join(where, 'Lanes Sample 2')
    is(existsSync(join(second, 'Start here.md')), 'a second sample goes beside the first', j(again.ui.errors))
    is((await readFile(join(copy, 'mine.md'), 'utf8')).includes('Written in the first copy.'), 'and the first is as it was left')
    const disk2 = JSON.parse((await again.onDisk()) ?? '{}')
    same(disk2.vault, second, 'state.vault points at the second')
    same(disk2.lanes, [{ id: 'x', name: 'X', folder: 'x' }], 'lanes somebody already has are theirs: the sample’s are not put over them')
  }

  /* ---------- LANES_VAULT: never asked ---------- */
  {
    const env = await folder('Env Vault')
    const { M, ui, onDisk } = await mainOver(undefined, { env })
    const went = await M.ensureVault()
    is(went === true && ui.boxes.length === 0, 'with LANES_VAULT (a driven run), nothing is asked', j(ui.boxes.length))
    same(M.VAULT, env, 'and that is the folder')
    is((await onDisk()) === null, 'and nothing is written', await onDisk())
  }

  /* ---------- Settings' Change… ---------- */
  {
    const before = await folder('Before')
    const saved = { vault: before, safety: 'standard' }
    const { M, ui, onDisk } = await mainOver(saved, { picks: [] })
    const res = await M.changeVault(null)
    same(res, { ok: false, reason: 'cancelled' }, 'Change…, cancelled, says so')
    is((await onDisk()) === JSON.stringify(saved, null, 2) && !ui.did.length, 'and changes nothing, and relaunches nothing', j(ui.did))
  }
  {
    const before = await folder('Before 2')
    const after = await folder('After')
    let stopped = 0
    const { M, ui, onDisk } = await mainOver({ vault: before, safety: 'standard' }, { picks: [after] })
    await M.changeVault(null, async () => {
      stopped++
    })
    const disk = JSON.parse((await onDisk()) ?? '{}')
    same([disk.vault, disk.safety], [after, 'standard'], 'Change…, a folder picked: state.vault is written, the rest kept')
    is(stopped === 1, 'what is running is stopped first', j(stopped))
    same(ui.did, ['relaunch', 'exit 0'], 'and the app relaunches on it')
  }
}

delete process.env.LANES_VAULT
await rm(work, { recursive: true, force: true })

console.log(
  failed
    ? `\n${failed} of ${held} failed`
    : `all ${held} vault-chooser assertions hold (no folder or a missing one is asked for before the window; Quit writes nothing; a choice is written at once)`
)
process.exit(failed ? 1 : 0)
