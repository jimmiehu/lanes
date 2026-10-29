// WHAT A NEWCOMER'S FIRST COMMANDS SAY IS WHAT THEY DO.
//
// Three things met in the first hour with the repository each said one thing
// and did another. The app told macOS it ran on 11 while Electron needs 12, so
// Big Sur started it into a crash instead of saying it needs a newer macOS,
// and the README named no version at all. `npm run checks` ran the runner bare,
// which prints its usage and fails. And `npm run install-app` spoke only a
// Claude Code hook's JSON, and exited 0 when the build failed, so npm reported
// a failed install as a success.
//
// Here: electron-builder.yml's LSMinimumSystemVersion is not below the one in
// Electron's own Info.plist, and the README's requirement names that macOS;
// every npm script that runs checks/run.mjs gives it something the runner's
// usage line accepts; and build/refresh.sh speaks plain words by hand and
// exits 1 on a failure, and a hook's JSON with exit 0 under LANES_HOOK=1.
//
// refresh.sh itself is never run here: it builds, quits Lanes and replaces
// /Applications/Lanes.app. What runs is what it says with — the switch above
// `ROOT=`, and its `say` and `fail` — lifted out, and only after it is seen to
// name nothing that builds, quits, removes or copies.
//
//   node checks/install-app.mjs           this checkout
//   node checks/install-app.mjs <tree>    another tree, such as an older commit's
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(process.argv[2] ?? join(here, '..'))
const read = (p) => readFileSync(join(root, p), 'utf8')

let pass = 0
let fail = 0
const ok = (name, good, detail = '') => {
  if (good) pass += 1
  else {
    fail += 1
    console.log(`  FAIL ${name}${detail ? `\n       ${detail}` : ''}`)
  }
}

/* ---------- the minimum macOS ---------- */

const below = (a, b) => {
  const x = a.split('.').map(Number)
  const y = b.split('.').map(Number)
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) < (y[i] ?? 0)
  }
  return false
}
const ours = read('electron-builder.yml').match(/^\s*LSMinimumSystemVersion:\s*'?([\d.]+)'?\s*$/m)?.[1]
// Electron's own, from the runtime the build copies in (`electronDist`). An
// older tree handed in as an argument has no node_modules of its own.
const plist = [root, join(here, '..')]
  .map((r) => join(r, 'node_modules/electron/dist/Electron.app/Contents/Info.plist'))
  .find((p) => existsSync(p))
const theirs = plist
  ? readFileSync(plist, 'utf8').match(/<key>LSMinimumSystemVersion<\/key>\s*<string>([\d.]+)<\/string>/)?.[1]
  : undefined
ok("Electron's Info.plist names its minimum macOS", !!theirs, plist ? plist : 'no node_modules/electron/dist/Electron.app: run npm ci first')
ok('electron-builder.yml names one', !!ours)
if (ours && theirs) {
  ok(`the app's minimum, ${ours}, is not below Electron's, ${theirs}`, !below(ours, theirs))
  const said = read('README.md').match(/^- \*\*macOS (\d+)\b[^\n]*/m)
  ok(
    `the README's requirements name macOS ${ours.split('.')[0]}`,
    said?.[1] === ours.split('.')[0],
    said ? said[0] : 'no "- **macOS <version>" line in the README'
  )
}

/* ---------- npm scripts that reach the runner ---------- */

const usage = read('checks/run.mjs').match(/usage: node checks\/run\.mjs ([^'`\n]+)/)?.[1]
ok("the runner has a usage line to read its modes from", !!usage)
const modes = new Set(
  (usage ?? '')
    .split('[')[0]
    .split('|')
    .map((m) => m.trim())
    .filter((m) => m.startsWith('--'))
)
const scripts = Object.entries(JSON.parse(read('package.json')).scripts ?? {})
for (const [name, line] of scripts) {
  const at = line.match(/node checks\/run\.mjs\b(.*)/)
  if (!at) continue
  const args = at[1].trim().split(/\s+/).filter(Boolean)
  // A mode, or the name of a check: either runs something. Bare, or with only
  // `--live` or `--keep`, the runner prints its usage and fails.
  const runs = args.some((a) => modes.has(a) || !a.startsWith('-'))
  ok(`npm run ${name} gives the runner something to run`, runs, `"${line}"`)
}

/* ---------- build/refresh.sh, behind npm run install-app ---------- */

const sh = read('build/refresh.sh')
const parse = spawnSync('bash', ['-n', join(root, 'build/refresh.sh')], { encoding: 'utf8' })
ok('refresh.sh parses', parse.status === 0, parse.stderr.trim())

// The preamble is the switches; say and fail are taken from wherever they are,
// so an older script's say is tried as it was.
const cut = sh.indexOf('\nROOT=')
const fn = (name) => sh.match(new RegExp(`^${name}\\(\\) \\{\\n[\\s\\S]*?^\\}$`, 'm'))?.[0]
const before = cut >= 0 ? sh.slice(0, cut) : ''
const preamble = [before, ...['say', 'fail'].map(fn).filter((f) => f && !before.includes(f))].join('\n')
const code = preamble
  .split('\n')
  .filter((l) => !/^\s*#/.test(l))
  .join('\n')
ok('refresh.sh has a say and a fail', !!fn('say') && !!fn('fail'))
// The guard that keeps this check from ever doing what the script does.
const harmless = !/\b(npm|pack\.sh|osascript|pgrep|rm|cp|open|xattr|Applications)\b/.test(code)
ok('what is lifted names nothing that builds, quits, removes or copies', harmless)

// --norc: a bash given -c, a socket for stdin (which is what Node hands it)
// and no SHLVL takes itself to be run by sshd and reads ~/.bashrc first, and
// whatever that prints lands in what say and fail are held to. (A hosted
// runner's .bashrc runs brew.) refresh.sh is run as a file, which never does.
const run = (hook, line) =>
  spawnSync('bash', ['--norc', '-c', `${preamble}\n${line}\necho after`], {
    encoding: 'utf8',
    env: { PATH: process.env.PATH, HOME: process.env.HOME, ...(hook ? { LANES_HOOK: '1' } : {}) }
  })
const json = (s) => {
  try {
    return JSON.parse(s)
  } catch {
    return undefined
  }
}
if (harmless) {
  const MSG = 'Lanes not installed: "the build" failed \\ see refresh.log'

  let r = run(false, 'say "Lanes.app updated (abc1234)."')
  ok('by hand, say is a plain line', r.stdout === 'Lanes.app updated (abc1234).\nafter\n', JSON.stringify(r.stdout))

  r = run(false, `fail '${MSG}'`)
  ok('by hand, fail exits 1', r.status === 1, `exit ${r.status}`)
  ok('by hand, fail says why on stderr, in plain words', r.stderr === `${MSG}\n`, JSON.stringify(r.stderr))
  ok('by hand, fail stops the script', !r.stdout.includes('after'), JSON.stringify(r.stdout))

  r = run(true, `say '${MSG}'`)
  ok('as a hook, say is a systemMessage', json(r.stdout.split('\n')[0])?.systemMessage === MSG, JSON.stringify(r.stdout))

  r = run(true, `fail '${MSG}'`)
  ok('as a hook, fail exits 0, so a broken build does not fail the hook', r.status === 0, `exit ${r.status}`)
  ok('as a hook, fail says why as a systemMessage', json(r.stdout.trim())?.systemMessage === MSG, JSON.stringify(r.stdout))
  ok('as a hook, fail stops the script', !r.stdout.includes('after'), JSON.stringify(r.stdout))
}

// And the body reports each failure through fail. `say` exits 0 by hand, so a
// failure said with it reads to npm as an install that worked.
const body = cut >= 0 ? sh.slice(cut) : sh
const saidFailures = body
  .split('\n')
  .filter((l) => /^\s*say\b/.test(l) && /fail|not installed|would not|could not/i.test(l))
ok('no failure in refresh.sh is reported with say', saidFailures.length === 0, saidFailures.map((l) => l.trim()).join('\n       '))

console.log(`install-app: ${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
