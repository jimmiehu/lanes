// A BUILD OF ONE BRANCH IS KEPT READY — whatever moves it, and from wherever.
//
// `bash build/follow.sh on <branch>` writes a `reference-transaction` hook, so
// each time the branch moves the app is built from it and left ready for Lanes
// to offer (src/main/update.ts) — never installed, nothing quit. Said that way
// it is easy to believe and easy to get subtly wrong, so this runs it, for
// real, against a throwaway repository whose branch is checked out in a second
// worktree, and holds it to what it says:
//
//   - `on` follows the branch the worktree is on, reads the repository it
//     belongs to, carries the checkout's signing identity, and builds at once;
//   - a commit on the branch from its worktree, a merge into it, and a lock
//     file changed (which runs `npm ci`) each build that commit, in a clone of
//     its own and a folder of its own, and say in ready.json what is ready —
//     the commit, the bundle, the branch's commits newest first; a commit on
//     another branch, or a ref "moved" to where it was, builds nothing;
//   - no pass quits anything or installs anything;
//   - a build that failed says so, leaves what was ready as it was, and is not
//     tried again until the branch moves or a pass is asked for by hand;
//   - only the two newest builds are kept;
//   - the GIT_DIR a hook is handed does not reach the pass, which would
//     otherwise point its git at your checkout;
//   - the hook calls a copy of the script that each pass renews from the
//     branch, and never fails a ref update, whatever that copy does;
//   - by default the pass is detached in a session of its own: the commit
//     returns before the build is done, and killing the commit's whole process
//     group — a turn ending, a terminal closing — does not stop it;
//   - `install` hands the ready build to the branch's swap.sh when Lanes is
//     not running; when it is, it only asks Lanes to quit — Lanes installs as
//     it quits, with a swap of its own — from a waiter that is detached, and
//     reopens it once that swap is done, never starting a second one; Lanes
//     that installs nothing as it quits has it installed once it is gone; and
//     a swap Lanes started as it quit, still going, is waited for, not raced;
//   - only the repository followed starts a pass, though another run the hook
//     (a core.hooksPath shared by several), and `on` refuses where
//     core.hooksPath is set;
//   - `on` from a second clone takes the first clone's hook away;
//   - a pass reads the config again: `on` another branch while it builds
//     ends with that branch offered, and `off` stops it, build and all;
//   - `on` leaves a hook that is not its own alone, and `off` takes away only
//     its own — and all the rest that following made: what was ready, the
//     clone, the script's copy, the builds, the logs.
//
// pack.sh, swap.sh, npm, osascript, open, Lanes itself and the notification
// are stand-ins here: nothing is built, quit or installed, and HOME is a
// folder of the check's own.
//
// Red at the commit before: a pass installed what it built, through refresh.sh.
// Red before the review's fixes: `install` started a second swap beside
// Lanes' own; a hook run by another repository started a pass, and `on` wrote
// its hook into core.hooksPath; `on` from a second clone left the first's hook;
// `off` and `on` another branch did not reach a pass already building; and
// `off` left the clone, the builds and the log.
//
//   node checks/follow.mjs
import { spawn, spawnSync } from 'node:child_process'
import { chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(process.argv[2] ?? join(here, '..'))
const script = join(root, 'build/follow.sh')

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
  ok('there is a build/follow.sh', false)
  console.log(`${pass} pass, ${fail} fail`)
  process.exit(1)
}

const box = realpathSync(mkdtempSync(join(tmpdir(), 'lanes-follow-')))
const repo = join(box, 'repo')
const wt = join(box, 'wt')
const state = join(box, 'state')
const builds = join(box, 'builds')
const target = join(box, 'Applications', 'Lanes.app')
const stub = join(box, 'stubs')
const bin = join(box, 'bin')
for (const d of [repo, stub, bin, join(box, 'home')]) mkdirSync(d, { recursive: true })
writeFileSync(join(box, 'gitconfig'), '')

const exe = (p, body) => {
  writeFileSync(p, body)
  chmodSync(p, 0o755)
}
// pack.sh's stand-in: answers from a queue, says which commit it was handed, and makes the bundle.
exe(
  join(stub, 'pack.sh'),
  `#!/bin/bash
q="$STUB/answers"
a=built
if [ -s "$q" ]; then a="$(head -1 "$q")"; tail -n +2 "$q" >"$q.t"; mv "$q.t" "$q"; fi
printf '%s %s %s %s\\n' "$(git rev-parse HEAD)" "$a" "\${LANES_SIGN_IDENTITY:-none}" "$LANES_BUILD_DIR" >>"$STUB/calls"
case "$a" in
  built) mkdir -p "$LANES_BUILD_DIR/mac-arm64/Lanes.app/Contents/MacOS"; echo "signed: $LANES_BUILD_DIR/mac-arm64/Lanes.app" ;;
  broken) echo "error TS2304: Cannot find name 'x'." >&2; exit 2 ;;
  slow) sleep 3; mkdir -p "$LANES_BUILD_DIR/mac-arm64/Lanes.app/Contents/MacOS"; echo done >>"$STUB/slow" ;;
esac
`
)
exe(join(stub, 'notify.sh'), `#!/bin/bash\nprintf '%s\\n' "$1" >>"$STUB/notes"\n`)
exe(join(bin, 'npm'), `#!/bin/bash\nprintf '%s %s\\n' "$PWD" "$*" >>"$STUB/npm"\nmkdir -p node_modules\n`)
exe(
  join(bin, 'osascript'),
  `#!/bin/bash
printf '%s\\n' "$*" >>"$STUB/osascript"
# Asked to quit, Lanes' stand-in does.
case "$*" in *'quit app'*) pkill -TERM -f "$LANES_FOLLOW_TARGET/Contents/MacOS/" ;; esac
exit 0
`
)
exe(join(bin, 'open'), `#!/bin/bash\nprintf 'open %s\\n' "$*" >>"$STUB/order"\n`)
// What Lanes runs as it quits with an update to install: src/main/update.ts's
// copy of swap.sh, named for the app's pid and handed the bundle it runs from.
// It waits for that pid to be gone, and copying takes a moment.
exe(
  join(stub, 'app-swap.sh'),
  `#!/bin/bash
while kill -0 "$4" 2>/dev/null; do sleep 0.1; done
sleep 1.5
echo "Lanes' own swap, done" >>"$STUB/order"
`
)

const base = {
  PATH: `${bin}:${dirname(process.execPath)}:/usr/bin:/bin:/usr/sbin:/sbin`,
  HOME: join(box, 'home'),
  STUB: stub,
  LANES_FOLLOW_HOME: state,
  LANES_FOLLOW_BUILDS: builds,
  LANES_FOLLOW_LOG: join(box, 'follow.log'),
  LANES_FOLLOW_PACK: join(stub, 'pack.sh'),
  LANES_FOLLOW_NOTIFY: join(stub, 'notify.sh'),
  LANES_FOLLOW_TARGET: target,
  LANES_FOLLOW_INLINE: '1',
  GIT_CONFIG_GLOBAL: join(box, 'gitconfig'),
  GIT_CONFIG_NOSYSTEM: '1',
  GIT_AUTHOR_NAME: 'Check',
  GIT_AUTHOR_EMAIL: 'check@example.invalid',
  GIT_COMMITTER_NAME: 'Check',
  GIT_COMMITTER_EMAIL: 'check@example.invalid'
}
const run = (cmd, args, { cwd = wt, env = {} } = {}) => spawnSync(cmd, args, { cwd, env: { ...base, ...env }, encoding: 'utf8' })
const git = (cwd, ...args) => run('git', args, { cwd })
const sha = (cwd, ref = 'HEAD') => git(cwd, 'rev-parse', ref).stdout.trim()
const lines = (f) => (existsSync(f) ? readFileSync(f, 'utf8').split('\n').filter(Boolean) : [])
const calls = () => lines(join(stub, 'calls'))
const notes = () => lines(join(stub, 'notes'))
const npm = () => lines(join(stub, 'npm'))
const quits = () => lines(join(stub, 'osascript'))
const swaps = () => lines(join(stub, 'swap'))
const order = () => lines(join(stub, 'order'))
const followLog = () => lines(join(box, 'follow.log'))
const away = { LANES_FOLLOW_INLINE: '' }
const answer = (...as) => writeFileSync(join(stub, 'answers'), as.map((a) => `${a}\n`).join(''))
const ready = () => (existsSync(join(state, 'ready.json')) ? JSON.parse(readFileSync(join(state, 'ready.json'), 'utf8')) : null)
const appFor = (s) => join(builds, s, 'mac-arm64', 'Lanes.app')
const kept = () => (existsSync(builds) ? readdirSync(builds).sort() : [])
const commit = (cwd, file, text, msg, opts = {}) => {
  writeFileSync(join(cwd, file), text)
  run('git', ['add', file], { cwd, ...opts })
  return run('git', ['commit', '-q', '-m', msg], { cwd, ...opts })
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const hookFile = join(repo, '.git', 'hooks', 'reference-transaction')

/* ---------- a repository, its branch in a worktree of its own ---------- */

git(repo, 'init', '-q', '-b', 'other')
mkdirSync(join(repo, 'build'), { recursive: true })
copyFileSync(script, join(repo, 'build/follow.sh'))
// swap.sh's stand-in, as the branch has it: `install` runs the branch's own.
// It says so if it was run while Lanes still ran from the bundle.
exe(
  join(repo, 'build/swap.sh'),
  `#!/bin/bash
printf '%s\\n' "$*" >>"$STUB/swap"
pgrep -f "$LANES_FOLLOW_TARGET/Contents/MacOS/" >/dev/null && echo 'swapped under a live Lanes' >>"$STUB/order"
exit 0
`
)
writeFileSync(join(repo, 'package-lock.json'), '{"v":1}\n')
git(repo, 'add', '-A')
commit(repo, 'notes.txt', 'one\n', 'Lanes: one')
git(repo, 'branch', 'public')
git(repo, 'worktree', 'add', '-q', wt, 'public')
// The checkout's signing identity: per Mac, never committed.
writeFileSync(join(wt, 'build/.sign-identity'), 'ABC123\n')

/* ---------- on: the branch it is on, the repository, a build now ---------- */

const on = run('bash', ['build/follow.sh', 'on'])
ok('`on` succeeds', on.status === 0, on.stderr)
ok('`on` says what it follows', /Following public/.test(on.stdout), on.stdout)
ok('the hook is written, and can run', existsSync(hookFile) && (statSync(hookFile).mode & 0o111) !== 0)
const config = existsSync(join(state, 'config')) ? readFileSync(join(state, 'config'), 'utf8') : ''
ok('it follows the branch the worktree is on', /^BRANCH=public$/m.test(config), config)
ok('of the repository the worktree belongs to', config.includes(`REPO=${repo}`), config)
ok("with the checkout's signing identity", /^SIGN=ABC123$/m.test(config), config)
ok('the hook calls a copy of the script', existsSync(join(state, 'follow.sh')) && readFileSync(join(state, 'follow.sh'), 'utf8') === readFileSync(script, 'utf8'))
ok('it builds at once', calls().length === 1 && calls()[0]?.startsWith(sha(wt)), calls().join(' | '))
ok('signed as the checkout signs, in a folder of its own', calls()[0]?.endsWith(`ABC123 ${join(builds, sha(wt))}`), calls()[0])
ok('in a clone of its own, outside the checkout', sha(join(state, 'src')) === sha(wt) && npm()[0]?.startsWith(join(state, 'src')), npm().join(' | '))
const first = ready()
ok('and says what is ready', first?.commit === sha(wt) && first?.short === sha(wt).slice(0, 7) && first?.branch === 'public' && first?.app === appFor(sha(wt)) && existsSync(first.app), JSON.stringify(first))
ok('with the branch’s commits, newest first', first?.log?.[0]?.commit === sha(wt) && first.log[0].subject === 'Lanes: one', JSON.stringify(first?.log))

/* ---------- what moves it, and what does not ---------- */

writeFileSync(join(wt, 'notes.txt'), 'two\n')
git(wt, 'add', 'notes.txt')
run('git', ['commit', '-q', '-m', 'Lanes: two', '-m', 'Why it is two.'])
ok('a commit on the branch builds it', calls().length === 2 && calls()[1].startsWith(sha(wt)), calls().join(' | '))
const two = ready()
ok('ready.json says the new one', two?.commit === sha(wt) && existsSync(two.app), JSON.stringify(two))
ok('its notes are the branch’s, with their bodies', JSON.stringify(two?.log?.map((n) => [n.subject, n.body])) === JSON.stringify([['Lanes: two', 'Why it is two.'], ['Lanes: one', '']]), JSON.stringify(two?.log))
ok('the same lock file runs no npm ci', npm().length === 1, npm().join(' | '))
ok('nothing is quit, nothing installed', quits().length === 0 && swaps().length === 0 && !existsSync(target), quits().join(' | '))

commit(repo, 'other.txt', 'elsewhere\n', 'on other')
ok('a commit on another branch builds nothing', calls().length === 2, calls().join(' | '))
git(wt, 'update-ref', 'refs/heads/public', sha(wt))
ok('the branch "moved" to where it was builds nothing', calls().length === 2, calls().join(' | '))

const merged = git(wt, 'merge', '-q', '--no-edit', 'other')
ok('a merge into the branch builds it', merged.status === 0 && calls().length === 3 && calls()[2].startsWith(sha(wt)), merged.stderr + calls().join(' | '))

commit(wt, 'package-lock.json', '{"v":2}\n', 'deps')
ok('a lock file changed runs npm ci again, then builds', npm().length === 2 && calls().length === 4, npm().join(' | '))
ok('only the two newest builds are kept', JSON.stringify(kept()) === JSON.stringify([sha(wt, 'HEAD~1'), sha(wt)].sort()), kept().join(', '))

/* ---------- a broken build ---------- */

const before = ready()
answer('broken')
commit(wt, 'notes.txt', 'four\n', 'four')
ok('a broken build is said', /did not build: error TS2304/.test(notes().at(-1) ?? ''), notes().join(' | '))
ok('and leaves what was ready as it was', JSON.stringify(ready()) === JSON.stringify(before) && !existsSync(join(builds, sha(wt))), ready()?.commit)
const count = calls().length
run('bash', [join(state, 'follow.sh'), 'pass'])
ok('and is not tried again while the branch stands', calls().length === count, calls().join(' | '))
run('bash', ['build/follow.sh'])
ok('unless asked for by hand', calls().length === count + 1 && ready()?.commit === sha(wt), calls().join(' | '))
run('bash', [join(state, 'follow.sh'), 'pass'])
ok('and a commit ready is not built again', calls().length === count + 1, calls().join(' | '))

/* ---------- the GIT_DIR a hook is handed stays with the hook ---------- */

const gitDir = git(wt, 'rev-parse', '--absolute-git-dir').stdout.trim()
commit(wt, 'notes.txt', 'six\n', 'six', { env: { GIT_DIR: gitDir, GIT_WORK_TREE: wt } })
ok('a commit made with GIT_DIR set still builds that commit', sha(join(state, 'src')) === sha(wt) && ready()?.commit === sha(wt), calls().at(-1))
ok('and leaves the checkouts on their branches', git(wt, 'symbolic-ref', '--short', 'HEAD').stdout.trim() === 'public' && git(repo, 'symbolic-ref', '--short', 'HEAD').stdout.trim() === 'other')

/* ---------- the copy the hook calls ---------- */

commit(wt, 'build/follow.sh', `${readFileSync(script, 'utf8')}# renewed by the check\n`, 'renew the script')
ok("each pass renews the hook's copy from the branch", readFileSync(join(state, 'follow.sh'), 'utf8').endsWith('# renewed by the check\n'))

const copy = readFileSync(join(state, 'follow.sh'), 'utf8')
exe(join(state, 'follow.sh'), '#!/bin/bash\nexit 7\n')
const failing = commit(wt, 'notes.txt', 'seven\n', 'seven')
ok('a copy that fails fails no commit', failing.status === 0 && git(wt, 'log', '-1', '--format=%s').stdout.trim() === 'seven', failing.stderr)
rmSync(join(state, 'follow.sh'))
const missing = commit(wt, 'notes.txt', 'eight\n', 'eight')
ok('nor does one that is gone', missing.status === 0 && git(wt, 'log', '-1', '--format=%s').stdout.trim() === 'eight', missing.stderr)
exe(join(state, 'follow.sh'), copy)

/* ---------- detached: the commit is not kept waiting, nor the pass killed ---------- */

answer('slow')
writeFileSync(join(wt, 'notes.txt'), 'nine\n')
git(wt, 'add', 'notes.txt')
const started = Date.now()
const child = spawn('git', ['commit', '-q', '-m', 'nine'], {
  cwd: wt,
  env: Object.fromEntries(Object.entries(base).filter(([k]) => k !== 'LANES_FOLLOW_INLINE')),
  detached: true,
  stdio: ['ignore', 'pipe', 'pipe']
})
child.stdout.resume()
child.stderr.resume()
// Done when its output closes, not only when it exits: a pass holding the
// commit's pipe open would keep whatever reads it — a terminal, a tool — waiting.
await new Promise((r) => child.on('close', r))
const took = Date.now() - started
ok('the commit returns before the build is done', took < 2000, `${took}ms`)
try {
  process.kill(-child.pid, 'SIGKILL')
} catch {
  // Nothing left in its group to kill: the pass is in a session of its own.
}
for (let i = 0; i < 100 && ready()?.commit !== sha(wt); i++) await sleep(100)
ok("and the build finishes after the commit's group is killed", lines(join(stub, 'slow')).length === 1 && ready()?.commit === sha(wt), calls().at(-1))

/* ---------- install, by hand ---------- */

const quiet = run('bash', ['build/follow.sh', 'install'])
ok('`install` hands the ready build to the branch’s swap.sh', quiet.status === 0 && swaps().at(-1) === `${ready().app} ${target}`, quiet.stderr + swaps().join(' | '))
ok('and quits nothing when Lanes is not running', quits().length === 0, quits().join(' | '))

// A swap Lanes started as it quit a moment ago, still copying: what goes in
// is that, and a second swap now would copy over the same bundle with it.
let swapsBefore = swaps().length
const gonePid = spawnSync('/usr/bin/true').pid
writeFileSync(join(stub, 'order'), '')
copyFileSync(join(stub, 'app-swap.sh'), join(stub, `lanes-swap-${gonePid}.sh`))
run('/bin/bash', ['-c', 'nohup /bin/bash "$0" ready "$1" --wait "$2" </dev/null >/dev/null 2>&1 &', join(stub, `lanes-swap-${gonePid}.sh`), target, String(gonePid)])
await sleep(300)
const settling = run('bash', ['build/follow.sh', 'install'])
ok('a swap Lanes started as it quit, still going, is waited for and not raced', settling.status === 0 && swaps().length === swapsBefore && order().join() === "Lanes' own swap, done", settling.stderr + swaps().slice(swapsBefore).join(' | ') + ' / ' + order().join(' | '))

// Lanes' stand-in, run from the installed bundle. Quit, it does what
// before-quit does with an update it will install: starts its copy of swap.sh,
// which outlives it. With `lanes-has-nothing` it installs nothing as it quits —
// it has not yet seen the build (it looks every ten seconds), or cannot tell
// the build is newer than itself.
mkdirSync(join(target, 'Contents', 'MacOS'), { recursive: true })
exe(
  join(target, 'Contents/MacOS/Lanes'),
  `#!/bin/bash
gone() {
  if [ ! -e "$STUB/lanes-has-nothing" ]; then
    cp "$STUB/app-swap.sh" "$STUB/lanes-swap-$$.sh"
    nohup /bin/bash "$STUB/lanes-swap-$$.sh" ready "$LANES_FOLLOW_TARGET" --wait $$ </dev/null >/dev/null 2>&1 &
  fi
  exit 0
}
trap gone TERM
while :; do sleep 0.1; done
`
)
// Opened apart from this process, as Finder would, so nothing here has to reap it.
const openLanes = async () => {
  run('/bin/bash', ['-c', 'nohup "$0" </dev/null >/dev/null 2>&1 &', join(target, 'Contents/MacOS/Lanes')])
  await sleep(300)
}

writeFileSync(join(stub, 'order'), '')
await openLanes()
swapsBefore = swaps().length
const busy = run('bash', ['build/follow.sh', 'install'], { env: away })
const atReturn = order()
for (let i = 0; i < 100 && !order().some((l) => l.startsWith('open ')); i++) await sleep(100)
ok('when Lanes is running, it is asked to quit', busy.status === 0 && /quit app "Lanes"/.test(quits().at(-1) ?? ''), busy.stderr + quits().join(' | '))
ok('by a waiter that is detached: `install` returns before Lanes’ install is done, so a reply that ran it inside Lanes does not take the waiter along', atReturn.length === 0, atReturn.join(' | '))
ok('which starts no swap of its own: Lanes installs as it quits, and a second swap would race it', swaps().length === swapsBefore, swaps().slice(swapsBefore).join(' | '))
ok('and reopens Lanes once that install is done', JSON.stringify(order()) === JSON.stringify(["Lanes' own swap, done", `open ${target}`]), order().join(' | '))

writeFileSync(join(stub, 'lanes-has-nothing'), '')
writeFileSync(join(stub, 'order'), '')
await openLanes()
const unseen = run('bash', ['build/follow.sh', 'install'])
ok('Lanes that installs nothing as it quits has it installed once it is gone, and reopened', unseen.status === 0 && swaps().at(-1) === `${ready().app} ${target} --reopen` && order().length === 0, unseen.stderr + swaps().at(-1) + ' / ' + order().join(' | '))
rmSync(join(stub, 'lanes-has-nothing'))

/* ---------- whose hook it is ---------- */

// Another repository whose hooks are this one's — what a core.hooksPath set
// for every repository on the Mac amounts to — committing on a branch of the
// same name.
const elsewhere = join(box, 'elsewhere')
mkdirSync(elsewhere)
git(elsewhere, 'init', '-q', '-b', 'public')
git(elsewhere, 'config', 'core.hooksPath', join(repo, '.git', 'hooks'))
let logged = followLog().length
let built = calls().length
commit(elsewhere, 'x.txt', 'x\n', 'not Lanes')
ok('a repository that is not the one followed starts no pass, though it runs the hook', followLog().length === logged && calls().length === built, followLog().slice(logged).join(' | '))

const shared = join(box, 'shared')
mkdirSync(join(shared, 'build'), { recursive: true })
git(shared, 'init', '-q', '-b', 'main')
copyFileSync(script, join(shared, 'build/follow.sh'))
git(shared, 'add', '-A')
commit(shared, 'a.txt', 'a\n', 'a')
git(shared, 'config', 'core.hooksPath', '.githooks')
const refusedShared = run('bash', ['build/follow.sh', 'on'], { cwd: shared })
ok('`on` refuses where core.hooksPath is set: git would not run a hook of the repository’s own', refusedShared.status !== 0 && /core\.hooksPath/.test(refusedShared.stderr) && !existsSync(join(shared, '.githooks')), refusedShared.stderr)
ok('and follows nothing new', readFileSync(join(state, 'config'), 'utf8').includes(`REPO=${repo}`) && existsSync(hookFile))
git(repo, 'config', 'core.hooksPath', '.githooks')
ok('`status` says so of the repository followed', /core\.hooksPath/.test(run('bash', ['build/follow.sh', 'status']).stdout))
git(repo, 'config', '--unset', 'core.hooksPath')

// A second clone of the same repository, following from there.
const clone = join(box, 'clone')
run('git', ['clone', '-q', '-b', 'public', repo, clone], { cwd: box })
copyFileSync(script, join(clone, 'build/follow.sh'))
const cloneHook = join(clone, '.git', 'hooks', 'reference-transaction')
const moved = run('bash', ['build/follow.sh', 'on'], { cwd: clone })
ok('`on` from a second clone follows that one', moved.status === 0 && readFileSync(join(state, 'config'), 'utf8').includes(`REPO=${clone}`), moved.stderr)
ok('and takes the first clone’s hook away', !existsSync(hookFile) && existsSync(cloneHook))
const back = run('bash', ['build/follow.sh', 'on'])
ok('and back, the second’s', back.status === 0 && existsSync(hookFile) && !existsSync(cloneHook), back.stderr)

/* ---------- a hook not its own ---------- */

const repo2 = join(box, 'repo2')
mkdirSync(join(repo2, 'build'), { recursive: true })
git(repo2, 'init', '-q', '-b', 'main')
copyFileSync(script, join(repo2, 'build/follow.sh'))
git(repo2, 'add', '-A')
commit(repo2, 'a.txt', 'a\n', 'a')
const theirs = join(repo2, '.git/hooks/reference-transaction')
exe(theirs, '#!/bin/bash\n# somebody else\nexit 0\n')
const refused = run('bash', ['build/follow.sh', 'on'], { cwd: repo2 })
ok('`on` leaves a hook that is not its own alone', refused.status !== 0 && readFileSync(theirs, 'utf8').includes('somebody else'), refused.stderr)
ok('and follows nothing new, keeping the hook of what it follows', readFileSync(join(state, 'config'), 'utf8').includes(`REPO=${repo}`) && existsSync(hookFile))

const status = run('bash', ['build/follow.sh', 'status'])
ok('`status` says what it follows, and what is ready', /Following public of /.test(status.stdout) && status.stdout.includes(`Ready to install: ${sha(wt).slice(0, 7)}`), status.stdout)

/* ---------- on another branch, and off, while a pass builds ---------- */

// A commit on the branch, its pass detached as the hook starts it, and a
// slow build begun before the command comes.
const buildingAway = async (text) => {
  answer('slow')
  const n = calls().length
  writeFileSync(join(wt, 'notes.txt'), text)
  git(wt, 'add', 'notes.txt')
  run('git', ['commit', '-q', '-m', text.trim()], { env: away })
  for (let i = 0; i < 50 && calls().length === n; i++) await sleep(100)
}
const settled = async () => {
  for (let i = 0; i < 150 && existsSync(join(state, 'lock')); i++) await sleep(100)
}

git(repo, 'branch', 'feature', 'public')
const featureWt = join(box, 'wt-feature')
git(repo, 'worktree', 'add', '-q', featureWt, 'feature')
commit(featureWt, 'feature.txt', 'f\n', 'Lanes: a feature')

await buildingAway('eleven\n')
const switched = run('bash', ['build/follow.sh', 'on', 'feature'])
await settled()
ok('`on` another branch while a pass builds', switched.status === 0 && /Following feature/.test(switched.stdout), switched.stderr)
ok('ends with that branch offered, not the one the pass was building', ready()?.branch === 'feature' && ready()?.commit === sha(featureWt), JSON.stringify({ branch: ready()?.branch, commit: ready()?.commit, feature: sha(featureWt) }))
run('bash', ['build/follow.sh', 'on'])
ok('and `on` its own branch again offers that', ready()?.branch === 'public' && ready()?.commit === sha(wt), JSON.stringify({ branch: ready()?.branch, commit: ready()?.commit }))

const slowDone = lines(join(stub, 'slow')).length
mkdirSync(join(box, 'home', 'Library', 'Logs'), { recursive: true })
writeFileSync(join(box, 'home', 'Library', 'Logs', 'lanes-update.log'), 'an install\n')
await buildingAway('twelve\n')
const off = run('bash', ['build/follow.sh', 'off'])
await sleep(3500)
ok('`off` succeeds', off.status === 0, off.stderr)
ok('and stops a pass that is building, its build with it, so nothing is offered after', ready() === null && lines(join(stub, 'slow')).length === slowDone && !existsSync(join(state, 'lock')), `ready: ${ready()?.commit}; slow builds finished: ${lines(join(stub, 'slow')).length - slowDone}`)
ok('`off` takes its hook away', !existsSync(hookFile))
ok('and all that following made: the clone, the script’s copy, the stamps, what was ready, the builds, the logs', !existsSync(state) && !existsSync(builds) && !existsSync(join(box, 'follow.log')) && !existsSync(join(box, 'home', 'Library', 'Logs', 'lanes-update.log')), [state, builds, join(box, 'follow.log')].filter((p) => existsSync(p)).map((p) => (existsSync(p) && statSync(p).isDirectory() ? `${p}: ${readdirSync(p).join(', ')}` : p)).join(' | '))
ok('and says what it removed', off.stdout.includes(state) && off.stdout.includes(builds), off.stdout)
const afterOff = calls().length
commit(wt, 'notes.txt', 'ten\n', 'ten')
ok('and the branch moving builds nothing then', calls().length === afterOff, calls().join(' | '))
ok('`status` says so', /Not following/.test(run('bash', ['build/follow.sh', 'status']).stdout))
ok("`off` leaves another repository's hook alone", existsSync(theirs))

// Whatever a failed run left going, out of the way of the next.
spawnSync('pkill', ['-f', box])
rmSync(box, { recursive: true, force: true })
console.log(`${pass} pass, ${fail} fail`)
process.exit(fail ? 1 : 0)
