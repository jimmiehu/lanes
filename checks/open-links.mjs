// OPEN GOES BY WHAT A PATH REALLY IS — proved.
//
// A right-click on a path written in backticks offers Open, and Open decides
// by the file's kind (`howToOpen`, how-to-open.mjs): documents and media open
// in their app, a script as text, an app never. But the kind was read off the
// name as written, after `stat` had followed any link — and then the LINK was
// handed to the Mac, which followed it too. So `spec.pdf -> ../tools/water.command`
// was a PDF and went to the Terminal, and a folder `docs -> Sprinkler.app` was
// a folder and was launched. Git keeps links, so a cloned repo or a synced
// folder next to the vault, and a thread that names the path, was all it took.
// Red before: each of those was classed `open` and handed to `shell.openPath`.
//
// Now the link is followed first, to the file at the end of it, and that file
// is both what is classed and what is opened (`src/main/locate.ts`). A link to
// an app is shown and nothing more; a link to a script opens the script as
// text; a link to a PDF opens the PDF — the real one, not the link.
//
// Runs main's own `src/main/locate.ts`, bundled for node with stand-ins for
// electron's `shell` and for `child_process` that write down what they were
// asked and do none of it, against real links in a temporary directory.
//
//   node checks/open-links.mjs
import { build } from 'esbuild'
import { chmod, mkdir, mkdtemp, realpath, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
const work = await realpath(await mkdtemp(join(tmpdir(), 'lanes-open-links-')))
const vault = join(work, 'Garden')
const tools = join(work, 'tools')
const archive = join(work, 'archive')

await mkdir(join(vault, 'notes'), { recursive: true })
await mkdir(join(tools, 'Sprinkler.app', 'Contents', 'MacOS'), { recursive: true })
await mkdir(archive, { recursive: true })
await writeFile(join(vault, 'notes', 'allotment.md'), '# Allotment\n\nSee `spec.pdf` and `docs/`.\n')
await writeFile(join(tools, 'water.command'), '#!/bin/sh\necho "the allotment is watered"\n')
await chmod(join(tools, 'water.command'), 0o755)
await writeFile(join(tools, 'Sprinkler.app', 'Contents', 'MacOS', 'Sprinkler'), '#!/bin/sh\necho ran\n')
await chmod(join(tools, 'Sprinkler.app', 'Contents', 'MacOS', 'Sprinkler'), 0o755)
await writeFile(join(archive, 'allotment-2026.pdf'), '%PDF-1.4\n')

// The links, relative, as a repo would carry them.
await symlink('../tools/water.command', join(vault, 'spec.pdf'))
await symlink('../tools/Sprinkler.app', join(vault, 'docs'))
await symlink('../tools/Sprinkler.app', join(vault, 'plan.pdf'))
await symlink('../archive/allotment-2026.pdf', join(vault, 'latest.pdf'))
await symlink('../archive', join(vault, 'kitchen'))

/* ---------- main's module, as main runs it ---------- */

const standIns = {
  name: 'stand-ins',
  setup(b) {
    b.onResolve({ filter: /^electron$/ }, () => ({ path: 'electron', namespace: 'stand-in' }))
    b.onResolve({ filter: /^(node:)?child_process$/ }, () => ({ path: 'child_process', namespace: 'stand-in' }))
    b.onLoad({ filter: /.*/, namespace: 'stand-in' }, (a) => {
      // Asked, never done: what main asks for is the evidence, and nothing on
      // this Mac is opened by a check.
      if (a.path === 'child_process')
        return {
          contents:
            'const asked = (globalThis.__exec ??= [])\n' +
            'export const execFile = (file, args, opts, done) => {\n' +
            "  if (typeof opts === 'function') done = opts\n" +
            '  asked.push([file, ...args])\n' +
            "  setImmediate(() => done(null, '', ''))\n" +
            '}\n',
          loader: 'js'
        }
      return {
        contents:
          'const asked = (globalThis.__shell ??= [])\n' +
          'export const shell = {\n' +
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
await build({
  stdin: {
    contents: "export * from './src/main/locate.ts'\nexport { setVault } from './src/main/config.ts'\n",
    resolveDir: root,
    loader: 'ts'
  },
  bundle: true,
  platform: 'node',
  format: 'esm',
  outfile: join(work, 'locate.mjs'),
  logLevel: 'silent',
  plugins: [standIns]
})
const L = await import(pathToFileURL(join(work, 'locate.mjs')).href)
L.setVault(vault)

let failed = 0
let held = 0
const is = (ok, what, detail = '') => {
  held++
  if (ok) return
  failed++
  console.log(`  ✗ ${what}${detail ? `\n      ${detail}` : ''}`)
}
const j = (v) => JSON.stringify(v)
const shellLog = () => (globalThis.__shell ??= [])
const execLog = () => (globalThis.__exec ??= [])

/** Found as written in the allotment note, then Open asked for it: what was found, what Open said, and what was asked. */
const tryOpen = async (written) => {
  const { found } = await L.locate(written, 'notes/allotment.md')
  const place = found[0]
  const shellFrom = shellLog().length
  const execFrom = execLog().length
  const opened = place ? await L.openFound(place.path) : null
  return { place, opened, shell: shellLog().slice(shellFrom), exec: execLog().slice(execFrom) }
}

/* ---------- a link to what must not run: never handed to the Mac to open as it likes ---------- */

for (const [written, name, why] of [
  ['spec.pdf', 'spec.pdf', 'a “PDF” that is a link to a .command'],
  ['docs/', 'docs', 'a folder that is a link to an app'],
  ['plan.pdf', 'plan.pdf', 'a “PDF” that is a link to an app']
]) {
  const r = await tryOpen(written)
  is(r.place?.path === join(vault, name), `${why} is found, under its own name`, j(r.place))
  is(r.place?.open !== 'open', `${why} is not offered as a document`, j(r.place?.open))
  is(!r.shell.length, `${why} is never handed to shell.openPath`, j(r.shell))
  is(
    r.exec.every((a) => a[0] === 'open' && a[1] === '-t'),
    `${why} is opened as text or not at all — never by \`open\` as the Mac likes`,
    j(r.exec)
  )
}

// The script at the end of the link is what opens, and as text: the link's
// own name says PDF, but what TextEdit is given is the script itself.
const script = await tryOpen('spec.pdf')
is(
  script.opened === true && j(script.exec) === j([['open', '-t', join(tools, 'water.command')]]),
  'the link to a .command opens the .command, as text',
  j(script.exec)
)
// An app at the end of a link is shown, never launched: Open refuses it whole.
for (const written of ['docs/', 'plan.pdf']) {
  const r = await tryOpen(written)
  is(r.opened === false && !r.exec.length && !r.shell.length, `Open refuses ${written} (a link to an app) and asks nothing`, j(r))
}

/* ---------- a link to a document or a folder still opens — the real one ---------- */

const pdf = await tryOpen('latest.pdf')
is(pdf.place?.open === 'open', 'a link to a real PDF is offered as one', j(pdf.place))
is(
  pdf.opened === true && j(pdf.shell) === j([['openPath', join(archive, 'allotment-2026.pdf')]]),
  'and opened: the PDF at the end of the link, not the link',
  j(pdf.shell)
)
const folder = await tryOpen('kitchen/')
is(folder.place?.dir === true && folder.place?.open === 'open', 'a link to a folder is a folder, offered to open', j(folder.place))
is(folder.opened === true && j(folder.shell) === j([['openPath', archive]]), 'and the real folder opens in the Finder', j(folder.shell))

/* ---------- Show in Finder still shows the link, where it was written ---------- */

const shownFrom = shellLog().length
is((await L.revealFound(join(vault, 'docs'))) === true, 'a link to an app can still be shown in its folder')
is(j(shellLog().slice(shownFrom)) === j([['showItemInFolder', join(vault, 'docs')]]), 'the link itself, selected', j(shellLog().slice(shownFrom)))

/* ---------- nothing anywhere was opened as the Mac likes ---------- */

const launched = shellLog().filter(([what, p]) => what === 'openPath' && p.startsWith(tools))
is(!launched.length, 'nothing under tools/ was ever handed to shell.openPath', j(launched))
const ran = execLog().filter((a) => a[0] === 'open' && a[1] !== '-t')
is(!ran.length, 'and `open` was never asked without -t', j(ran))

await rm(work, { recursive: true, force: true })

console.log(
  failed
    ? `\n${failed} of ${held} failed`
    : `all ${held} open-links assertions hold (a link opens as what it points at, and an app at the end of one never runs)`
)
process.exit(failed ? 1 : 0)
