// AN UPDATE IS OFFERED ONLY WHEN IT IS ONE, WITH WHAT IT BRINGS.
//
// build/follow.sh says what it built in ready.json: the commit, the bundle,
// and the branch's latest commits, newest first. `readyUpdate`
// (src/shared/update.ts) decides, against the commit the app was built from,
// whether that is an update for this app and which commits to say it brings:
//
//   - nothing readable, a commit that is not one, or a bundle that is not
//     there, is no update — and nor is the commit the app already is, dirty
//     tree or not;
//   - an app among the branch's latest is told the commits newer than itself,
//     newest first, and none of its own or older;
//   - an app that is not among them — built from another branch, or longer
//     ago, or from no commit at all — is told the newest few, and that it
//     cannot be told which are new;
//   - notes that are not commits are left out, and a subject is said without
//     the `Lanes: ` every commit here starts with.
//
// And main's own side (src/main/update.ts, bundled for node): quitting puts
// in only an update known to be newer — one the app cannot place may be
// older, and goes in only by Restart now — and a restart waits for whatever
// it would cut short, a reply running or a Guarded question open, and says
// which.
//
// Red at the commit before: there was no src/shared/update.ts. Red before the
// main side (21 pass, 14 fail): quitting an app it could not place, or one
// built from no commit, put the update in — a downgrade, unasked — and a
// restart waited only on a `busy` that a question open was not.
//
//   node --experimental-strip-types checks/update.mjs
import { build } from 'esbuild'
import { existsSync, readFileSync } from 'node:fs'
import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const mod = join(here, '../src/shared/update.ts')
let pass = 0
let fail = 0
const ok = (name, good, detail = '') => {
  if (good) pass += 1
  else {
    fail += 1
    console.log(`  FAIL ${name}${detail ? `\n       ${detail}` : ''}`)
  }
}
if (!existsSync(mod)) {
  ok('there is a src/shared/update.ts', false)
  console.log(`${pass} pass, ${fail} fail`)
  process.exit(1)
}
const { readyUpdate, said, FEW } = await import(pathToFileURL(mod).href)

const sha = (n) => n.toString(16).padStart(2, '0').repeat(20)
const APP = '/builds/x/mac-arm64/Lanes.app'
const there = (p) => p === APP
const log = Array.from({ length: 12 }, (_, i) => ({ commit: sha(20 - i), subject: `Lanes: change ${20 - i}`, body: i === 0 ? 'Why.' : '' }))
const READY = { commit: sha(20), short: sha(20).slice(0, 7), branch: 'public', app: APP, built: '2026-10-16T12:00:00Z', log }
const own = (n, dirty = false) => sha(n).slice(0, 7) + (dirty ? '+' : '')

/* ---------- no update ---------- */

ok('nothing readable is none', [null, undefined, 3, 'x', [], {}].every((r) => readyUpdate(r, own(15), there) === null))
ok('a commit that is not one is none', readyUpdate({ ...READY, commit: 'abc' }, own(15), there) === null)
ok('a bundle that is not there is none', readyUpdate({ ...READY, app: '/gone/Lanes.app' }, own(15), there) === null)
ok('a bundle that is not an app is none', readyUpdate({ ...READY, app: '/builds/x' }, own(15), () => true) === null)
ok('the commit the app already is, is none', readyUpdate(READY, own(20), there) === null)
ok('and so with a dirty tree', readyUpdate(READY, own(20, true), there) === null)

/* ---------- an app among the branch's latest ---------- */

const u = readyUpdate(READY, own(17), there)
ok('an older app is offered it', u !== null && u.commit === sha(20) && u.short === sha(20).slice(0, 7) && u.branch === 'public' && u.app === APP)
ok('with the commits newer than itself, newest first', JSON.stringify(u?.notes.map((n) => n.subject)) === JSON.stringify(['Lanes: change 20', 'Lanes: change 19', 'Lanes: change 18']), JSON.stringify(u?.notes))
ok('and says it can tell', u?.since === true)
ok('each with its body', u?.notes[0].body === 'Why.' && u?.notes[1].body === '')
ok('a dirty app is placed by its commit', readyUpdate(READY, own(19, true), there)?.notes.length === 1)

/* ---------- an app it cannot place ---------- */

const far = readyUpdate(READY, own(3), there)
ok('an app not among them is offered it', far !== null && far.since === false)
ok('with the newest few', far?.notes.length === FEW && far.notes[0].commit === sha(20), JSON.stringify(far?.notes.map((n) => n.subject)))
const local = readyUpdate(READY, 'local', there)
ok('and so is one built from no commit', local !== null && local.since === false && local.notes.length === FEW)

/* ---------- what is said ---------- */

const odd = readyUpdate({ ...READY, log: [log[0], { commit: 'nope', subject: 'x' }, null, { commit: sha(19) }, log[1], log[2]] }, own(18), there)
ok('notes that are not commits are left out', JSON.stringify(odd?.notes.map((n) => n.commit)) === JSON.stringify([sha(20), sha(19)]), JSON.stringify(odd?.notes))
ok('a subject without the `Lanes: ` it starts with', said('Lanes: the installed app follows a branch') === 'the installed app follows a branch' && said('Plain') === 'Plain')

/* ---------- main's side: what goes in on quit, and what a restart waits for ---------- */
// src/main/update.ts, bundled for node with a stand-in for electron's `app`.
// Outside electron it is a development run, which swaps nothing and writes
// what it would have done to its follow home (`swap-plan.json`) — so each
// app below gets a home of its own, with the ready.json above in it, and a
// fresh copy of the module, whose state is its own.

const work = await realpath(await mkdtemp(join(tmpdir(), 'lanes-update-')))
await mkdir(join(work, 'Lanes.app'))
await build({
  entryPoints: [join(here, '../src/main/update.ts')],
  bundle: true,
  platform: 'node',
  format: 'esm',
  outfile: join(work, 'update.mjs'),
  logLevel: 'error',
  // The commit the app was built from, set per app below.
  define: { __BUILD__: 'globalThis.__LANES_BUILD__' },
  plugins: [
    {
      name: 'electron-stand-in',
      setup(b) {
        b.onResolve({ filter: /^electron$/ }, () => ({ path: 'electron', namespace: 'stand-in' }))
        b.onLoad({ filter: /.*/, namespace: 'stand-in' }, () => ({ contents: 'export const app = { on() {}, quit() {} }', loader: 'js' }))
      }
    }
  ]
})
// A module that throws from its own timer is a failure here, not the end of the run.
process.on('uncaughtException', (err) => ok('nothing throws', false, String(err?.stack ?? err)))

let apps = 0
/** main/update.ts in an app built from `commit`, with READY (its bundle under `work`) ready. */
async function appAt(commit) {
  apps += 1
  const home = join(work, `follow-${apps}`)
  await mkdir(home)
  await writeFile(join(home, 'ready.json'), JSON.stringify({ ...READY, app: join(work, 'Lanes.app') }))
  process.env.LANES_FOLLOW_HOME = home
  globalThis.__LANES_BUILD__ = commit
  const main = await import(`${pathToFileURL(join(work, 'update.mjs')).href}?${apps}`)
  let holding = null
  main.startUpdates({ tell: () => true, holding: () => holding })
  const plan = () => (existsSync(join(home, 'swap-plan.json')) ? JSON.parse(readFileSync(join(home, 'swap-plan.json'), 'utf8')) : null)
  return { main, plan, hold: (h) => (holding = h) }
}
const tick = () => new Promise((r) => setTimeout(r, 1150))
const tried = (f) => {
  try {
    return f()
  } catch (err) {
    return `threw: ${err.message}`
  }
}

// Quitting puts in only an update known to be newer. One the app cannot place
// — its own commit not among the branch's latest — may be older than it: a
// build of the commit just made, installed while follow.sh still builds it,
// is offered the commit before. Offered still, but put in only when asked.
{
  const a = await appAt(own(17))
  ok('an app among the latest is offered the update', a.main.currentUpdate()?.since === true)
  a.main.installOnQuit()
  ok('and quitting puts it in, not reopened', JSON.stringify(a.plan()) !== 'null' && a.plan().reopen === false, JSON.stringify(a.plan()))

  for (const [what, commit] of [['an app it cannot place', own(3)], ['an app built from no commit', 'local']]) {
    const b = await appAt(commit)
    ok(`${what} is offered it, saying it cannot tell`, b.main.currentUpdate()?.since === false)
    b.main.installOnQuit()
    ok(`but quitting ${what} puts nothing in`, b.plan() === null, JSON.stringify(b.plan()))
  }

  const c = await appAt(own(3))
  tried(() => c.main.restartIntoUpdate())
  ok('Restart now puts it in all the same, reopened', c.plan()?.reopen === true, JSON.stringify(c.plan()))
}

// A restart waits for whatever it would cut short, and says which: a reply
// running, or a Guarded question open — the relaunch would have neither it
// nor its answer.
{
  const a = await appAt(own(17))
  a.hold('question')
  const asked = tried(() => a.main.restartIntoUpdate())
  ok('a question open holds the restart', asked?.restart === 'waiting' && a.plan() === null, JSON.stringify(asked))
  ok('and it says so', asked?.waitingFor === 'question', JSON.stringify(asked?.waitingFor))
  a.hold('reply')
  await tick()
  ok('a reply running, the same', a.main.currentUpdate()?.restart === 'waiting' && a.main.currentUpdate()?.waitingFor === 'reply' && a.plan() === null, JSON.stringify(a.main.currentUpdate()))
  a.hold(null)
  await tick()
  ok('with nothing held, it goes', a.main.currentUpdate()?.restart === 'now' && a.plan()?.reopen === true, JSON.stringify(a.plan()))

  const b = await appAt(own(17))
  b.hold('question')
  tried(() => b.main.restartIntoUpdate())
  const off = tried(() => b.main.cancelRestart())
  ok('Not now calls it off, and nothing is waited for', off?.restart === null && off?.waitingFor === null, JSON.stringify(off))
  b.hold(null)
  await tick()
  ok('so nothing goes once it is clear', b.plan() === null, JSON.stringify(b.plan()))
}

await rm(work, { recursive: true, force: true })
console.log(`${pass} pass, ${fail} fail`)
process.exit(fail ? 1 : 0)
