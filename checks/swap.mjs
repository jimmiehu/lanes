// AN UPDATE GOES IN WHOLE, OR NOT AT ALL — and never under a running app.
//
// build/swap.sh is the one thing that replaces Lanes.app: the app runs it on
// itself when you restart into an update or quit with one ready, and
// `build/follow.sh install` runs it by hand. Run here for real, on small app
// bundles of the check's own, signed ad hoc, it is held to what it says:
//
//   - the new app takes the old one's place, and nothing is left beside it,
//     even where an earlier run was cut off and left its copy or the old app
//     there;
//   - it waits for the process it is told to before it touches anything, and
//     reopens the app at the end when asked;
//   - it refuses a different app, an unsigned one, and one whose contents do
//     not match its signature, and refuses while anything runs out of the
//     installed bundle — and each time leaves the installed app exactly as it
//     was, says why in a notification, and still reopens it when asked;
//   - a first install, with nothing there yet, is just a copy;
//   - started from inside the bundle it replaces, as the app's own copy would
//     be if it were not copied out first, it still finishes;
//   - one install of a bundle at a time: two swaps set off together, as the
//     app's own on quit and `follow.sh install`'s are, install it once and
//     leave the new app, every time, with nothing beside it; one that finds
//     the lock held touches nothing, and only reopens once it is let go; and
//     `npm run install-app` (build/refresh.sh) copies its build in holding
//     the same lock;
//   - what runs out of the installed bundle is found by its path as it is, so
//     a running "Lanes (2).app" or "Lanes [2.app" is not replaced either.
//
// `open` and the notification are stand-ins; nothing outside the check's own
// folder is touched.
//
// Red at the commit before: there was no build/swap.sh. One at a time, and
// the path as it is: red before them — two swaps at once both failed and left
// the old app, a held lock was not seen, refresh.sh took none, and a running
// "Lanes (2).app" or "Lanes [2.app" was replaced under its process.
//
//   node checks/swap.mjs
import { spawn, spawnSync } from 'node:child_process'
import { chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(process.argv[2] ?? join(here, '..'))
const script = join(root, 'build/swap.sh')

let pass = 0
let fail = 0
const ok = (name, good, detail = '') => {
  if (good) pass += 1
  else {
    fail += 1
    console.log(`  FAIL ${name}${detail ? `\n       ${detail}` : ''}`)
  }
}
if (!existsSync(script)) {
  ok('there is a build/swap.sh', false)
  console.log(`${pass} pass, ${fail} fail`)
  process.exit(1)
}

const box = realpathSync(mkdtempSync(join(tmpdir(), 'lanes-swap-')))
const apps = join(box, 'Applications')
const builds = join(box, 'builds')
mkdirSync(apps)
mkdirSync(builds)
const opened = join(box, 'opened')
const notes = join(box, 'notes')
const exe = (p, body) => {
  writeFileSync(p, body)
  chmodSync(p, 0o755)
}
exe(join(box, 'open.sh'), `#!/bin/bash\nprintf '%s\\n' "$1" >>${JSON.stringify(opened)}\n`)
exe(join(box, 'notify.sh'), `#!/bin/bash\nprintf '%s\\n' "$1" >>${JSON.stringify(notes)}\n`)
const env = { ...process.env, LANES_SWAP_OPEN: join(box, 'open.sh'), LANES_SWAP_NOTIFY: join(box, 'notify.sh'), LANES_SWAP_LOG: join(box, 'swap.log') }
const lines = (f) => (existsSync(f) ? readFileSync(f, 'utf8').split('\n').filter(Boolean) : [])

/** A bundle that says which it is, signed ad hoc unless told not to be. */
const bundle = (at, which, { id = 'com.example.lanes-check', sign = true } = {}) => {
  rmSync(at, { recursive: true, force: true })
  mkdirSync(join(at, 'Contents/MacOS'), { recursive: true })
  mkdirSync(join(at, 'Contents/Resources'), { recursive: true })
  writeFileSync(
    join(at, 'Contents/Info.plist'),
    `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>CFBundleIdentifier</key><string>${id}</string>
<key>CFBundleExecutable</key><string>Lanes</string>
<key>CFBundlePackageType</key><string>APPL</string>
</dict></plist>
`
  )
  // A real executable, so the signature sits in it as an app's does — not in
  // the extended attributes a script's would, which the swap clears.
  copyFileSync('/usr/bin/true', join(at, 'Contents/MacOS/Lanes'))
  writeFileSync(join(at, 'Contents/Resources/which'), which)
  if (sign) {
    const s = spawnSync('codesign', ['--force', '--sign', '-', at], { encoding: 'utf8' })
    if (s.status !== 0) throw new Error(`codesign: ${s.stderr}`)
  }
  return at
}
const which = (at) => (existsSync(join(at, 'Contents/Resources/which')) ? readFileSync(join(at, 'Contents/Resources/which'), 'utf8') : null)
const swap = (from, to, ...more) => spawnSync('/bin/bash', [script, from, to, ...more], { env, encoding: 'utf8' })
const TO = join(apps, 'Lanes.app')
const NEW = join(builds, 'Lanes.app')
// Anything hidden beside the app: a copy, the old app, a lock.
const leftovers = () => readdirSync(apps).filter((n) => n.startsWith('.'))
const reset = () => {
  bundle(TO, 'old')
  bundle(NEW, 'new')
  rmSync(opened, { force: true })
  rmSync(notes, { force: true })
}

/* ---------- in whole ---------- */

reset()
// What a run cut off before would have left beside it — and, from before the
// lock, under the fixed names.
mkdirSync(join(apps, '.Lanes-swap.cutoff'))
bundle(join(apps, '.Lanes-swap.cutoff/old.app'), 'older')
bundle(join(apps, '.Lanes-update.app'), 'half')
bundle(join(apps, '.Lanes-previous.app'), 'older')
const plain = swap(NEW, TO)
ok('the new app takes the old one’s place', plain.status === 0 && which(TO) === 'new', plain.stderr)
ok('and nothing is left beside it', leftovers().length === 0, leftovers().join(', '))
ok('it still verifies where it is', spawnSync('codesign', ['--verify', '--strict', '--deep', TO]).status === 0)
ok('nothing is said, and nothing opened, unasked', lines(notes).length === 0 && lines(opened).length === 0)

reset()
const sleeper = spawn('/bin/sleep', ['1.5'])
const started = Date.now()
const waited = swap(NEW, TO, '--wait', String(sleeper.pid), '--reopen')
ok('it waits for the process it is told to', waited.status === 0 && Date.now() - started >= 1200 && which(TO) === 'new', `${Date.now() - started}ms ${waited.stderr}`)
ok('and reopens the app when asked', JSON.stringify(lines(opened)) === JSON.stringify([TO]), lines(opened).join(' | '))

/* ---------- or not at all ---------- */

const refused = (name, from, extra = []) => {
  rmSync(opened, { force: true })
  rmSync(notes, { force: true })
  const r = swap(from, TO, ...extra, '--reopen')
  ok(`${name}: refused`, r.status !== 0, r.stdout + r.stderr)
  ok(`${name}: the installed app as it was`, which(TO) === 'old' && leftovers().length === 0, `${which(TO)} ${leftovers().join(', ')}`)
  ok(`${name}: said`, /Lanes was not updated/.test(lines(notes)[0] ?? ''), lines(notes).join(' | '))
  ok(`${name}: and reopened as it was`, JSON.stringify(lines(opened)) === JSON.stringify([TO]), lines(opened).join(' | '))
}
reset()
refused('a different app', bundle(join(builds, 'Other.app'), 'other', { id: 'com.example.other' }))
refused('an unsigned app', bundle(join(builds, 'Unsigned.app'), 'unsigned', { sign: false }))
const tampered = bundle(join(builds, 'Tampered.app'), 'new')
writeFileSync(join(tampered, 'Contents/Resources/which'), 'changed after signing')
refused('an app that does not match its signature', tampered)

// Something running out of the installed bundle: its path is all the swap can see of it.
const running = spawn('/usr/bin/perl', ['-e', 'sleep 30', join(TO, 'Contents/MacOS/Lanes')])
await new Promise((r) => setTimeout(r, 300))
refused('the installed app running', NEW)
running.kill()

/* ---------- a first install, and one started from inside ---------- */

rmSync(TO, { recursive: true, force: true })
bundle(NEW, 'new')
// With no app in place, what a run cut off between its two renames left may
// be the only copy of it. The next swap with an app in place clears it.
const cutoff = join(apps, '.Lanes-swap.cutoff/old.app')
mkdirSync(dirname(cutoff), { recursive: true })
bundle(cutoff, 'old')
const first = swap(NEW, TO)
ok('a first install is a copy', first.status === 0 && which(TO) === 'new', first.stderr)
ok('and what a cut-off run left is kept, with no app there to replace', which(cutoff) === 'old', `${which(cutoff)}`)

reset()
const inside = join(TO, 'Contents/Resources/swap.sh')
copyFileSync(script, inside)
spawnSync('codesign', ['--force', '--sign', '-', TO])
const fromInside = spawnSync('/bin/bash', [inside, NEW, TO], { env, encoding: 'utf8' })
ok('started from inside the bundle it replaces, it finishes', fromInside.status === 0 && which(TO) === 'new' && leftovers().length === 0, fromInside.stderr)

/* ---------- one at a time ---------- */

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const ended = (p) => (p.exitCode !== null || p.signalCode !== null ? Promise.resolve() : new Promise((r) => p.on('exit', r)))
/** The swap, not waited for, so that two can run at once. */
const start = (from, to, ...more) =>
  new Promise((done) => {
    const c = spawn('/bin/bash', [script, from, to, ...more], { env })
    let said = ''
    c.stdout.on('data', (d) => (said += d))
    c.stderr.on('data', (d) => (said += d))
    c.on('close', (status) => done({ status, said: said.trim() }))
  })
const verifies = (at) => spawnSync('codesign', ['--verify', '--strict', '--deep', at]).status === 0
const installs = () => lines(join(box, 'swap.log')).filter((l) => / {2}updated /.test(l)).length
const LOCK = join(apps, '.Lanes-install.lock')

// The app starts one when it quits with an update ready, and `follow.sh
// install` quits it and starts one of its own: both wait on the same process,
// so they set off together. Three times, since which comes first is chance.
const rounds = []
for (let round = 0; round < 3; round++) {
  reset()
  const before = installs()
  const quitting = spawn('/bin/sleep', ['0.5'])
  const [onQuit, byHand] = await Promise.all([start(NEW, TO, '--wait', String(quitting.pid)), start(NEW, TO, '--wait', String(quitting.pid), '--reopen')])
  rounds.push({ onQuit, byHand, app: which(TO), whole: verifies(TO), installed: installs() - before, beside: leftovers(), notes: lines(notes), opened: lines(opened) })
}
const every = (f) => rounds.every(f)
const each = (f) => rounds.map(f).join(' | ')
ok('two swaps at once: neither fails', every((r) => r.onQuit.status === 0 && r.byHand.status === 0), each((r) => `${r.onQuit.status}/${r.byHand.status} ${r.onQuit.said} ${r.byHand.said}`))
ok('there is an app at the end, every time, and it is the new one, whole', every((r) => r.app === 'new' && r.whole), each((r) => `${r.app} ${r.whole ? 'verifies' : 'does not verify'}`))
ok('it is installed once, by one of them', every((r) => r.installed === 1), each((r) => r.installed))
ok('nothing is left beside it, not even the lock', every((r) => r.beside.length === 0), each((r) => r.beside.join(', ')))
ok('nothing is said, and the app is reopened once, as one of them asked', every((r) => r.notes.length === 0 && JSON.stringify(r.opened) === JSON.stringify([TO])), each((r) => `${r.notes.join('; ')} opened ${r.opened.length}`))

// Whoever holds the lock is installing: one that finds it held leaves the
// bundle to them, and reopens what is there only once they are done.
reset()
let holder = spawn('/usr/bin/lockf', ['-s', LOCK, '/bin/sleep', '1.5'])
await sleep(300)
let since = Date.now()
const held = await start(NEW, TO, '--reopen')
ok('a swap that finds the lock held touches nothing', held.status === 0 && which(TO) === 'old', `${held.status} ${which(TO)} ${held.said}`)
ok('and reopens the app once the lock is let go', Date.now() - since >= 1000 && JSON.stringify(lines(opened)) === JSON.stringify([TO]), `${Date.now() - since}ms ${lines(opened).join(' | ')}`)
await ended(holder)

// build/refresh.sh, behind `npm run install-app`, quits Lanes to copy a build
// of the checkout over it — and the quit starts the app's own swap when an
// update is ready. refresh.sh itself is never run here (it builds, and quits
// the real Lanes): what runs is its copy, put_in_place, lifted out with the
// line that names its lock, only after it is seen to name nothing else.
const refresh = readFileSync(join(root, 'build/refresh.sh'), 'utf8')
const lockLine = refresh.match(/^LOCK=.*$/m)?.[0]
const put = refresh.match(/^put_in_place\(\) \{\n[\s\S]*?^\}$/m)?.[0]
ok('refresh.sh copies its build in holding a lock', !!lockLine && !!put)
const lifted = `${lockLine}\n${put}`
// The guard that keeps this check from ever doing more than that copy.
const harmless = !!lockLine && !!put && !/\b(npm|pack\.sh|osascript|pgrep|open|Applications)\b/.test(lifted)
if (lockLine && put) ok('what is lifted names nothing that builds, quits, opens or reaches /Applications', harmless, lifted)
if (harmless) {
  const DEV = bundle(join(builds, 'Dev.app'), 'dev')
  const refreshing = () =>
    new Promise((done) => {
      const c = spawn('/bin/bash', ['-c', `${lifted}\nprintf '%s\\n' "$LOCK"\nput_in_place`], { env: { ...env, TARGET: TO, BUILT: DEV, LOG: join(box, 'refresh.log') } })
      let out = ''
      c.stdout.on('data', (d) => (out += d))
      c.on('close', (status) => done({ status, lock: out.trim() }))
    })

  reset()
  holder = spawn('/usr/bin/lockf', ['-s', LOCK, '/bin/sleep', '1.5'])
  await sleep(300)
  since = Date.now()
  const waited = await refreshing()
  ok('it is the lock swap.sh takes', waited.lock === LOCK, waited.lock)
  ok('refresh.sh waits for the lock, then copies its build in', waited.status === 0 && Date.now() - since >= 1000 && which(TO) === 'dev', `${waited.status} ${Date.now() - since}ms ${which(TO)}`)
  await ended(holder)

  reset()
  const [swapped, copied] = await Promise.all([start(NEW, TO), refreshing()])
  ok('a swap and refresh.sh at once: neither fails', swapped.status === 0 && copied.status === 0, `${swapped.status}/${copied.status} ${swapped.said}`)
  ok('and refresh.sh’s build is what is there, whole, with nothing beside it', which(TO) === 'dev' && verifies(TO) && leftovers().length === 0, `${which(TO)} ${leftovers().join(', ')}`)
}

/* ---------- the path as it is ---------- */

// A bundle can be named anything, and a name read as a pattern matches
// nothing, or is no pattern at all: either way the app looked closed.
const odd = async (name) => {
  const to = bundle(join(apps, name), 'old')
  const running = spawn('/usr/bin/perl', ['-e', 'sleep 30', join(to, 'Contents/MacOS/Lanes')])
  await sleep(300)
  const r = await start(NEW, to)
  running.kill()
  return { name, r, app: which(to) }
}
for (const o of await Promise.all([odd('Lanes (2).app'), odd('Lanes [2.app')])) {
  ok(`"${o.name}" running: refused, and left as it was`, o.r.status !== 0 && o.app === 'old', `${o.r.status} ${o.app} ${o.r.said}`)
}

rmSync(box, { recursive: true, force: true })
console.log(`${pass} pass, ${fail} fail`)
process.exit(fail ? 1 : 0)
