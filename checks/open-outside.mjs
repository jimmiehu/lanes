// ONE DOOR OUT — a link opens what it says, or nothing.
//
// Every `target=_blank` link — Claude's output in a thread, a note's links in
// READ, a ⌘-click in the editor — reached main's window-open handler, and that
// handed the address to `shell.openExternal` whatever it was: `javascript:`,
// `x-apple-…:` (the macOS settings panes), `file:` onto an application, which
// the system then LAUNCHED. And a `file:` link written with one slash, or none,
// slipped past the renderer's own path rule (`fileAddress`) straight into it.
// Red before: there was no decision to ask, and `file:/x` and `file:x` were
// read as schemes of their own.
//
// Now there is one, `src/main/open.ts`:
//
//  - `https:`, `http:` and `mailto:` go to the system, as they always did;
//  - `file:`, written with any number of slashes, is a place on this Mac: a
//    note in the vault opens as a note — handed back to the window that asked —
//    and anything else is SHOWN in the Finder if it is there, never launched;
//  - anything else is refused, said, and nothing opens.
//
// And the window may not leave its own page: a navigation is allowed only back
// onto the page the app itself loaded — the dev server's origin, or the built
// `index.html` with any query — and nowhere else.
//
// Runs main's own `src/main/open.ts`, bundled for node with a stand-in for
// electron's `shell` that records what it was asked, against a vault it makes
// in a temporary directory.
//
//   node checks/open-outside.mjs
import { build } from 'esbuild'
import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const work = await realpath(await mkdtemp(join(tmpdir(), 'lanes-open-outside-')))
const vault = join(work, 'vault')
await mkdir(join(vault, 'notes'), { recursive: true })
await writeFile(join(vault, 'notes', 'a.md'), '# A\n')
await writeFile(join(vault, 'notes', 'run.command'), 'echo hi\n')
const outside = join(work, 'elsewhere.txt')
await writeFile(outside, 'not in the vault\n')

let pass = 0
let fail = 0
const ok = (name, got, want) => {
  if (JSON.stringify(got) === JSON.stringify(want)) pass += 1
  else {
    fail += 1
    console.log(`  FAIL ${name}\n       got  ${JSON.stringify(got)}\n       want ${JSON.stringify(want)}`)
  }
}

/* ---------- the renderer's own rule: a `file:` address is a path ---------- */

// Read as source rather than bundled: blocks.ts is pure and shared.
const blocks = await build({
  entryPoints: [join(here, '../src/shared/blocks.ts')],
  bundle: true,
  platform: 'node',
  format: 'esm',
  write: false,
  logLevel: 'error'
})
const { fileAddress } = await import(
  'data:text/javascript;base64,' + Buffer.from(blocks.outputFiles[0].text).toString('base64')
)
ok('file:/// is a path', fileAddress('file:///Users/x/a.md'), { path: '/Users/x/a.md', note: true })
ok('file:/ is a path too', fileAddress('file:/Users/x/a.md'), { path: '/Users/x/a.md', note: true })
ok('file: with no slash is a path too', fileAddress('file:notes/a.md'), { path: 'notes/a.md', note: true })
ok('FILE: in capitals', fileAddress('FILE:/Users/x/b.pdf'), { path: '/Users/x/b.pdf', note: false })
ok('file:// as Claude writes it, unchanged', fileAddress('file://notes/a.md'), { path: 'notes/a.md', note: true })
ok('the web is the web', fileAddress('https://example.com/a.md'), null)
ok('mail is mail', fileAddress('mailto:someone@example.com'), null)
ok('a bare path is a path', fileAddress('notes/a.md:12'), { path: 'notes/a.md', note: true })

/* ---------- main's decision ---------- */

const calls = []
let M = null
try {
  await build({
    // open.ts, and the setter index.ts gives main its folder with.
    stdin: {
      contents: "export * from './src/main/open.ts'\nexport { setVault } from './src/main/config.ts'\n",
      resolveDir: join(here, '..'),
      loader: 'ts'
    },
    bundle: true,
    platform: 'node',
    format: 'esm',
    outfile: join(work, 'open.mjs'),
    logLevel: 'silent',
    plugins: [
      {
        name: 'electron',
        setup(b) {
          b.onResolve({ filter: /^electron$/ }, () => ({ path: 'electron', namespace: 'stand-in' }))
          b.onLoad({ filter: /.*/, namespace: 'stand-in' }, () => ({
            contents:
              'const calls = (globalThis.__calls ??= [])\n' +
              'export const shell = {\n' +
              "  openExternal: async (u) => { calls.push(['openExternal', u]) },\n" +
              "  openPath: async (p) => { calls.push(['openPath', p]); return '' },\n" +
              "  showItemInFolder: (p) => { calls.push(['showItemInFolder', p]) }\n" +
              '}\n' +
              'export const app = {}\n',
            loader: 'js'
          }))
        }
      }
    ]
  })
  globalThis.__calls = calls
  M = await import(pathToFileURL(join(work, 'open.mjs')).href)
  M.setVault(vault)
} catch (err) {
  fail += 1
  console.log(
    '  FAIL there is no decision to ask: src/main/open.ts does not build —\n' +
      '       every link reaches shell.openExternal as it is (index.ts, setWindowOpenHandler)\n' +
      `       ${String(err?.message ?? err).split('\n')[0]}`
  )
}

if (M) {
  const { decideOutside, stays, openOutside } = M
  const d = (url) => decideOutside(url, vault)
  const kind = (url) => d(url).kind

  // The web, and mail: to the system.
  ok('https', d('https://example.com/a?b#c'), { kind: 'external', url: 'https://example.com/a?b#c' })
  ok('http', d('http://example.com'), { kind: 'external', url: 'http://example.com/' })
  ok('mailto', d('mailto:someone@example.com'), { kind: 'external', url: 'mailto:someone@example.com' })
  ok('HTTPS in capitals', kind('HTTPS://EXAMPLE.COM/'), 'external')

  // Everything else: refused, with a reason.
  for (const url of [
    'javascript:alert(1)',
    'JaVaScRiPt:alert(1)',
    ' javascript:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    'x-apple-systempreferences:com.apple.preference.security',
    'x-apple-foo:bar',
    'vbscript:msgbox(1)',
    'chrome://settings',
    'smb://server/share',
    'ftp://example.com/x',
    'obsidian://open?vault=x',
    'tel:123',
    '',
    'not an address',
    'http://[',
    'file://',
    'file:///x%00y'
  ]) {
    const got = d(url)
    ok(`refused: ${JSON.stringify(url)}`, [got.kind, typeof got.reason === 'string' && got.reason.length > 0], ['refuse', true])
  }

  // A place on this Mac: a note in the vault is a note, with any slash count.
  const note = { kind: 'note', path: 'notes/a.md' }
  ok('file:/// into the vault', d(pathToFileURL(join(vault, 'notes/a.md')).href), note)
  ok('file:/ into the vault', d(`file:${join(vault, 'notes/a.md')}`), note)
  ok('file: relative to the vault', d('file:notes/a.md'), note)
  ok('file:// relative to the vault', d('file://notes/a.md'), note)
  ok('with a query and a fragment', d(pathToFileURL(join(vault, 'notes/a.md')).href + '?x=1#y'), note)
  ok('encoded', d('file:notes/a%2Emd'), note)

  // Anything else is shown, never launched.
  ok('file:/// outside', d('file:///etc/hosts'), { kind: 'reveal', path: '/etc/hosts' })
  ok('file:/ outside', d('file:/etc/hosts'), { kind: 'reveal', path: '/etc/hosts' })
  ok('an application', d('file:///Applications/Calculator.app'), { kind: 'reveal', path: '/Applications/Calculator.app' })
  ok('a script inside the vault', d('file:notes/run.command'), { kind: 'reveal', path: join(vault, 'notes/run.command') })
  ok('a sibling of the vault is not the vault', d(`file://${vault}-old/x.md`), { kind: 'reveal', path: `${vault}-old/x.md` })
  ok('out of the vault by ..', d('file:../x.md'), { kind: 'reveal', path: join(work, 'x.md') })

  // The window stays on its own page.
  const dev = 'http://localhost:5173/'
  ok('dev: its own page', stays('http://localhost:5173/?print=a.md', dev), true)
  ok('dev: another port', stays('http://localhost:5174/', dev), false)
  ok('dev: the web', stays('https://example.com/', dev), false)
  ok('dev: a file', stays('file:///etc/hosts', dev), false)
  const built = pathToFileURL('/Applications/Lanes.app/Contents/Resources/app.asar/out/renderer/index.html').href
  ok('built: its own page', stays(built, built), true)
  ok('built: its own page, printing', stays(`${built}?print=notes%2Fa.md`, built), true)
  ok('built: another file beside it', stays(built.replace('index.html', 'other.html'), built), false)
  ok('built: a file elsewhere', stays('file:///etc/hosts', built), false)
  ok('built: the web', stays('https://example.com/', built), false)
  ok('built: javascript', stays('javascript:alert(1)', built), false)
  ok('nonsense', stays('::', built), false)

  // And what actually happens: the shell asked only for what was decided.
  const sent = []
  const from = { isDestroyed: () => false, send: (channel, payload) => sent.push([channel, payload]) }
  const every = []
  const run = async (url) => {
    calls.length = 0
    sent.length = 0
    const res = await openOutside(url, from)
    every.push(...calls)
    return { ok: res.ok, calls: [...calls], sent: [...sent] }
  }
  ok('the web opens', await run('https://example.com/'), {
    ok: true,
    calls: [['openExternal', 'https://example.com/']],
    sent: []
  })
  const js = await run('javascript:alert(1)')
  ok('javascript opens nothing', [js.ok, js.calls, js.sent], [false, [], []])
  const apple = await run('x-apple-systempreferences:com.apple.preference.security')
  ok('a settings pane opens nothing', [apple.ok, apple.calls, apple.sent], [false, [], []])
  ok('a note goes back to the window', await run('file:notes/a.md'), {
    ok: true,
    calls: [],
    sent: [['lanes:openNote', 'notes/a.md']]
  })
  ok('a file outside is shown', await run(pathToFileURL(outside).href), {
    ok: true,
    calls: [['showItemInFolder', outside]],
    sent: []
  })
  ok('a script in the vault is shown, not run', await run('file:notes/run.command'), {
    ok: true,
    calls: [['showItemInFolder', join(vault, 'notes/run.command')]],
    sent: []
  })
  const gone = await run(pathToFileURL(join(work, 'nothing-here.app')).href)
  ok('a file that is not there: nothing', [gone.ok, gone.calls, gone.sent], [false, [], []])
  ok('nothing was ever launched', every.filter((c) => c[0] === 'openPath'), [])
}

await rm(work, { recursive: true, force: true })
console.log(`open-outside: ${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
