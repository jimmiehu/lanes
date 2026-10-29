#!/usr/bin/env node
// The one way a check is run.
//
// A driven check is a script the app runs inside its own page — it opens notes,
// types into them, starts threads and writes the state file. Pointed at the
// wrong folder it does all of that to somebody's notes. So every driven run
// here gets a vault and a state directory of its own under /private/tmp, made
// fresh, filled from fixtures/, and deleted afterwards — and the app itself
// refuses a driven run that was not given both (src/main/guard.ts).
//
//   node checks/run.mjs tabs rail          the named driven checks
//   node checks/run.mjs --smoke            the smoke list in checks/manifest.json
//   node checks/run.mjs --all              every driven check the manifest runs
//   node checks/run.mjs --node             the node checks (pure modules, no app)
//   node checks/run.mjs --dev              the app on the sample vault, no script — to look
//   node checks/run.mjs --self-test        proves the refusals
//
//   --live         also run the checks that spend real turns with the real CLI
//   --keep         keep the temp vault and state (their paths are printed)
//   --fixture X    sample | thread | empty, for --dev
//   --seed JSON    merged over the check's own state seed (e.g. '{"theme":"dark"}')
//   --shot DIR     keep each check's capture as DIR/<name>.png
//   --vault DIR    use DIR as the vault instead of a fixture copy; it must be
//                  under /private/tmp unless --real-vault is given as well
//
// A copy of the sample vault comes with eight threads (checks/sample-threads.mjs)
// unless the manifest says `"threads": false` — or fifty-four with `"many"`.
//
// Every check that names no stand-in CLI still gets one (`ok`), so a check
// that sends by accident answers from the stand-in and spends nothing.
// What each check wants — fixture, state seed, stand-in, timeout — is in
// checks/manifest.json. Driven runs take a lock, one at a time: each holds the
// front window, and two would take it from each other.
import { spawn, spawnSync } from 'node:child_process'
import {
  closeSync,
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readFileSync,
  realpathSync,
  rmSync,
  unlinkSync,
  writeFileSync,
  chmodSync,
  utimesSync
} from 'node:fs'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO = resolve(fileURLToPath(new URL('..', import.meta.url)))
const CHECKS = join(REPO, 'checks')
const SAMPLE = join(REPO, 'fixtures', 'sample-vault')
const SEED = join(REPO, 'fixtures', 'state', 'lanes-state.json')
const STUB = join(CHECKS, 'stand-ins', 'claude-stub.mjs')
/** Sample notes made older than today in each copy. Twelve or more stay today's: some checks open ten. */
const AGED = [
  'daily/2026-10-05.md',
  'daily/2026-10-06.md',
  'daily/2026-10-07.md',
  'inbox/allotment-rules.md',
  'people/grace-hopper.md',
  'reading/vienna-water.md',
  '_templates/meeting.md'
]
const TMP = '/private/tmp'
const LOCK = join(TMP, 'lanes-checks.lock')
const LOGS = join(TMP, 'lanes-check-logs')
const LAST = join(TMP, 'lanes-checks-last.json')
const manifest = JSON.parse(readFileSync(join(CHECKS, 'manifest.json'), 'utf8'))

/* ---------- arguments ---------- */
const argv = process.argv.slice(2)
const flag = (f) => argv.includes(f)
const option = (f) => {
  const i = argv.indexOf(f)
  return i >= 0 ? argv[i + 1] : undefined
}
const valued = new Set(['--fixture', '--vault', '--seed', '--shot'])
const names = argv.filter((a, i) => !a.startsWith('--') && !valued.has(argv[i - 1])).map((n) => n.replace(/\.js$/, ''))
const LIVE = flag('--live')
const SEED_OVER = option('--seed') ? JSON.parse(option('--seed')) : {}
const SHOTS = option('--shot') ? resolve(option('--shot')) : null
const KEEP = flag('--keep')

/* ---------- the refusals ---------- */

/** Where a vault may be: a throwaway one, unless the caller says otherwise in so many words. */
export function vaultRefusal(dir, realVault) {
  if (!dir) return null
  let real
  try {
    real = realpathSync(dir)
  } catch {
    real = resolve(dir)
  }
  if (real.startsWith(TMP + '/')) return null
  if (realVault) return null
  return `run.mjs: refusing the vault ${dir} — not under ${TMP}. Checks write notes; give a throwaway copy, or --real-vault if you mean it.`
}

const given = option('--vault') ?? process.env.LANES_VAULT
{
  const no = vaultRefusal(given, flag('--real-vault'))
  if (no) {
    console.error(no)
    process.exit(2)
  }
}

/* ---------- one at a time ---------- */
// Held per check, not per run: a long --all in one checkout and a single check
// in another take turns rather than one waiting out the other.
let held = false
function release() {
  if (!held) return
  held = false
  try {
    if (readFileSync(LOCK, 'utf8') === String(process.pid)) unlinkSync(LOCK)
  } catch {}
}
process.on('exit', release)
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => process.exit(130))

function lock() {
  if (held) return
  let waited = false
  for (;;) {
    try {
      const fd = openSync(LOCK, 'wx')
      writeFileSync(fd, String(process.pid))
      closeSync(fd)
      held = true
      return
    } catch {
      let holder = 0
      try {
        holder = Number(readFileSync(LOCK, 'utf8'))
        process.kill(holder, 0)
      } catch {
        // Nobody is holding it: a run that died without letting go.
        try {
          unlinkSync(LOCK)
        } catch {}
        continue
      }
      if (!waited) console.log(`waiting for the run holding ${LOCK} (pid ${holder})…`)
      waited = true
      spawnSync('sleep', ['2'])
    }
  }
}

/* ---------- one throwaway world ---------- */
const projectDirFor = (cwd) => join(homedir(), '.claude', 'projects', cwd.replace(/[^a-zA-Z0-9]/g, '-'))

function world(name, entry) {
  const dir = mkdtempSync(join(TMP, 'lanes-check-'))
  const vault = given ? realpathSync(given) : join(dir, 'vault')
  const state = join(dir, 'state')
  const exportTo = join(dir, 'export')
  mkdirSync(state, { recursive: true })
  mkdirSync(exportTo, { recursive: true })
  if (!given) {
    const fixture = entry.fixture ?? 'sample'
    if (fixture === 'sample') {
      cpSync(SAMPLE, vault, { recursive: true })
      // A copy is all made today, and a vault where everything is new folds
      // nothing: a few notes are given back their age, days apart.
      AGED.forEach((rel, i) => {
        const t = new Date(Date.now() - (2 + i) * 86_400_000)
        utimesSync(join(vault, rel), t, t)
      })
      // And its threads, unless the check wants a session directory with none.
      if (entry.threads !== false) {
        const args = [join(CHECKS, 'sample-threads.mjs'), vault, ...(entry.threads === 'many' ? ['--many'] : [])]
        const r = spawnSync(process.execPath, args, { encoding: 'utf8' })
        if (r.status !== 0) throw new Error(`sample-threads failed: ${r.stderr || r.stdout}`)
      }
    } else if (fixture === 'empty') mkdirSync(vault, { recursive: true })
    else if (fixture === 'thread') {
      const r = spawnSync(process.execPath, [join(CHECKS, 'thread-fixture.mjs'), vault], { encoding: 'utf8' })
      if (r.status !== 0) throw new Error(`thread-fixture failed: ${r.stderr || r.stdout}`)
    } else throw new Error(`${name}: unknown fixture ${fixture}`)
  }
  if (entry.update) seedUpdate(join(dir, 'follow'))
  const seed = { ...JSON.parse(readFileSync(SEED, 'utf8')), ...(entry.seed ?? {}), ...SEED_OVER }
  writeFileSync(join(state, 'lanes-state.json'), JSON.stringify(seed, null, 2))
  // The stand-in CLI, behind a wrapper that pins its mode and its node.
  const claude = join(dir, 'claude')
  writeFileSync(
    claude,
    `#!/bin/sh\nSTUB_MODE=${JSON.stringify(entry.stub ?? 'ok')} exec ${JSON.stringify(process.execPath)} ${JSON.stringify(STUB)} "$@"\n`
  )
  chmodSync(claude, 0o755)
  return { dir, vault, state, exportTo, claude }
}

/**
 * An update build/follow.sh would have left ready, for a check of the rail's
 * "Update ready" (src/main/update.ts): a bundle, and the branch's commits with
 * this checkout's own among them — the commit the dev app says it is — so two
 * are newer than the app and one older.
 */
function seedUpdate(follow) {
  const app = join(follow, 'builds', 'x', 'mac-arm64', 'Lanes.app')
  mkdirSync(join(app, 'Contents', 'MacOS'), { recursive: true })
  const head = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: REPO, encoding: 'utf8' }).stdout.trim()
  const log = [
    { commit: 'a'.repeat(40), subject: 'Lanes: the newest change', body: 'Why it changed.' },
    { commit: 'b'.repeat(40), subject: 'Lanes: an older change', body: '' },
    { commit: head, subject: 'Lanes: the commit this app is', body: '' },
    { commit: 'c'.repeat(40), subject: 'Lanes: one before it', body: '' }
  ]
  const ready = { commit: 'a'.repeat(40), short: 'aaaaaaa', branch: 'public', app, built: new Date().toISOString(), log }
  writeFileSync(join(follow, 'ready.json'), JSON.stringify(ready, null, 2))
}

function cleanup(w) {
  if (KEEP) return
  rmSync(w.dir, { recursive: true, force: true })
  // The CLI's — or the thread fixture's — transcripts for the throwaway vault.
  const sessions = projectDirFor(w.vault)
  if (/\/-private-tmp-lanes-check-[^/]+$/.test(sessions)) rmSync(sessions, { recursive: true, force: true })
}

/** The environment a run gets: never the caller's vault or state, whatever it had set. */
function envFor(w, extra) {
  const env = { ...process.env }
  for (const k of Object.keys(env)) {
    if (k.startsWith('LANES_') || k === 'ELECTRON_RENDERER_URL' || k.startsWith('STUB_')) delete env[k]
  }
  // A follow.sh home of its own, empty unless seeded: no run reads what is ready on this Mac.
  return { ...env, LANES_VAULT: w.vault, LANES_STATE: w.state, LANES_FOLLOW_HOME: join(w.dir, 'follow'), ...extra }
}

/* ---------- reading a result ---------- */

/** The JSON value at the start of `s` — an object, an array or a string — or undefined. */
function leadingJson(s) {
  s = s.trimStart()
  const open = s[0]
  if (open !== '{' && open !== '[' && open !== '"') return undefined
  let depth = 0
  let inStr = false
  let esc = false
  for (let i = 0; i < s.length; i++) {
    const c = s[i]
    if (inStr) {
      if (esc) esc = false
      else if (c === '\\') esc = true
      else if (c === '"') {
        inStr = false
        if (open === '"' && depth === 0) return tryParse(s.slice(0, i + 1))
      }
      continue
    }
    if (c === '"') {
      inStr = true
      continue
    }
    if (c === '{' || c === '[') depth++
    else if (c === '}' || c === ']') {
      depth--
      if (depth === 0) return tryParse(s.slice(0, i + 1))
    }
  }
  return undefined
}
function tryParse(t) {
  try {
    return JSON.parse(t)
  } catch {
    return undefined
  }
}

export function verdictOf(out) {
  const at = out.lastIndexOf('capture script:')
  if (at < 0) {
    const failed = /capture script failed:(.*)/.exec(out)
    return { verdict: 'ERROR', detail: failed ? failed[1].trim().slice(0, 200) : 'no result printed' }
  }
  let result = leadingJson(out.slice(at + 'capture script:'.length))
  if (typeof result === 'string') result = tryParse(result) ?? result
  if (result === undefined || result === null || typeof result !== 'object') {
    return { verdict: 'ERROR', detail: 'result is not JSON' }
  }
  if (result.pass === true) return { verdict: 'PASS', result }
  if (result.pass === false) return { verdict: 'FAIL', result, detail: falsy(result) }
  return { verdict: 'NOVERDICT', result, detail: 'no `pass` in the result' }
}

/** The fields that read false, for the table: where to look first. */
function falsy(r) {
  const out = []
  const walk = (o, at) => {
    if (out.length > 8 || !o || typeof o !== 'object') return
    for (const [k, v] of Object.entries(o)) {
      if (k === 'pass') continue
      if (v === false) out.push(at + k)
      else if (v && typeof v === 'object' && !Array.isArray(v)) walk(v, `${at}${k}.`)
    }
  }
  walk(r, '')
  return out.join(', ')
}

/* ---------- running the app ---------- */
function runApp(env, timeoutS, onLine) {
  return new Promise((done) => {
    const bin = join(REPO, 'node_modules', '.bin', 'electron-vite')
    const child = spawn(bin, ['dev'], { cwd: REPO, env, detached: true, stdio: ['ignore', 'pipe', 'pipe'] })
    let out = ''
    let timedOut = false
    const take = (c) => {
      out += c
      onLine?.(c)
    }
    child.stdout.setEncoding('utf8').on('data', take)
    child.stderr.setEncoding('utf8').on('data', take)
    const kill = (sig) => {
      try {
        process.kill(-child.pid, sig)
      } catch {}
    }
    const timer = setTimeout(() => {
      timedOut = true
      kill('SIGTERM')
      setTimeout(() => kill('SIGKILL'), 3000)
    }, timeoutS * 1000)
    child.on('close', (code) => {
      clearTimeout(timer)
      // electron-vite leaves nothing behind when the app quits by itself, but a
      // killed one can: the group goes with it.
      kill('SIGKILL')
      done({ out, code, timedOut })
    })
  })
}

async function runDriven(name) {
  const file = join(CHECKS, `${name}.js`)
  if (!existsSync(file)) return { name, verdict: 'ERROR', detail: 'no such check' }
  const entry = manifest.checks[`${name}.js`]
  if (!entry) return { name, verdict: 'ERROR', detail: 'not in checks/manifest.json' }
  if (entry.skip) return { name, verdict: 'SKIP', detail: entry.skip }
  if (entry.live && !LIVE) return { name, verdict: 'SKIP', detail: 'spends real turns (--live)' }
  const w = world(name, entry)
  const started = Date.now()
  const extra = {
    LANES_CAPTURE: join(w.dir, 'shot.png'),
    LANES_CAPTURE_EXEC: file,
    ...(entry.export ? { LANES_EXPORT_TO: w.exportTo } : {}),
    ...(entry.delay ? { LANES_CAPTURE_DELAY: String(entry.delay) } : {}),
    // A live run is the one place the real CLI is allowed.
    ...(entry.live && LIVE ? {} : { LANES_CLAUDE: w.claude }),
    ...(entry.env ?? {})
  }
  let run
  let log = ''
  for (let i = 0; i < (entry.runs ?? 1); i++) {
    run = await runApp(envFor(w, extra), entry.timeout ?? 90)
    log += `--- run ${i + 1} ---\n${run.out}\n`
    if (run.timedOut) break
  }
  mkdirSync(LOGS, { recursive: true })
  writeFileSync(join(LOGS, `${name}.log`), log)
  let res = run.timedOut ? { verdict: 'TIMEOUT', detail: `over ${entry.timeout ?? 90}s` } : verdictOf(run.out)
  if (res.verdict === 'PASS' && entry.after) {
    const cmd = entry.after.replaceAll('{export}', w.exportTo).replaceAll('{vault}', w.vault).replaceAll('{follow}', join(w.dir, 'follow'))
    const r = spawnSync('sh', ['-c', cmd], { cwd: REPO, encoding: 'utf8', env: envFor(w, {}) })
    writeFileSync(join(LOGS, `${name}.after.log`), `${cmd}\n${r.stdout}\n${r.stderr}`)
    if (r.status !== 0) res = { verdict: 'FAIL', result: res.result, detail: `after: ${cmd.split(' ').slice(-2).join(' ')} exited ${r.status}` }
  }
  if (SHOTS && existsSync(join(w.dir, 'shot.png'))) {
    mkdirSync(SHOTS, { recursive: true })
    cpSync(join(w.dir, 'shot.png'), join(SHOTS, `${name}.png`))
  }
  if (KEEP) console.log(`  kept: ${w.dir}`)
  cleanup(w)
  return { name, ...res, seconds: Math.round((Date.now() - started) / 1000) }
}

function runNode(
  list = [
    ...(manifest.node ?? []).map((n) => [n, ['--experimental-strip-types']]),
    ...(manifest.nodeNoStrip ?? []).map((n) => [n, []])
  ],
  dir = CHECKS
) {
  const results = []
  const w = { dir: mkdtempSync(join(TMP, 'lanes-check-')) }
  w.vault = join(w.dir, 'vault')
  w.state = join(w.dir, 'state')
  cpSync(SAMPLE, w.vault, { recursive: true })
  mkdirSync(w.state)
  for (const [entry, flags] of list) {
    const [file, ...args] = entry.split(' ')
    const started = Date.now()
    const r = spawnSync(process.execPath, [...flags, join(dir, file), ...args], {
      cwd: REPO,
      encoding: 'utf8',
      env: envFor(w, {}),
      timeout: 600_000,
      maxBuffer: 64 * 1024 * 1024
    })
    mkdirSync(LOGS, { recursive: true })
    writeFileSync(join(LOGS, `${file}.log`), `${r.stdout}\n${r.stderr}`)
    const last = `${r.stdout}\n${r.stderr}`.trim().split('\n').filter(Boolean).pop() ?? ''
    results.push({
      name: file,
      verdict: r.status === 0 ? 'PASS' : r.error?.code === 'ETIMEDOUT' ? 'TIMEOUT' : 'FAIL',
      detail: r.status === 0 ? '' : last.slice(0, 160),
      seconds: Math.round((Date.now() - started) / 1000)
    })
    console.log(`${results.at(-1).verdict.padEnd(9)} ${file}`)
    // And which of its cases failed, from its own last lines: the log file is
    // gone with the machine on a hosted runner.
    if (r.status !== 0) {
      const own = `${r.stdout}\n${r.stderr}`.trim().split('\n').filter(Boolean)
      for (const l of own.slice(-20)) console.log(`          ${l}`)
    }
  }
  cleanup(w)
  return results
}

function table(results) {
  const w = Math.max(...results.map((r) => r.name.length), 4)
  console.log()
  for (const r of results) {
    const secs = r.seconds !== undefined ? `${String(r.seconds).padStart(4)}s` : '     '
    console.log(`${r.verdict.padEnd(9)} ${r.name.padEnd(w)} ${secs}  ${r.detail ?? ''}`)
  }
  const count = (v) => results.filter((r) => r.verdict === v).length
  console.log(
    `\n${count('PASS')} passed, ${count('FAIL')} failed, ${count('NOVERDICT')} without a verdict, ` +
      `${count('TIMEOUT') + count('ERROR')} broken, ${count('SKIP')} skipped`
  )
  writeFileSync(LAST, JSON.stringify(results, null, 2))
  return results.every((r) => r.verdict === 'PASS' || r.verdict === 'SKIP')
}

/* ---------- self-test ---------- */
async function selfTest() {
  const results = []
  const say = (name, ok, detail = '') => {
    results.push({ name, verdict: ok ? 'PASS' : 'FAIL', detail })
  }
  // The runner's own refusal.
  say('runner refuses a vault outside /private/tmp', Boolean(vaultRefusal(homedir(), false)))
  say('runner takes a throwaway vault', vaultRefusal(join(TMP, 'lanes-check-x', 'vault'), false) === null)
  const r = spawnSync(process.execPath, [fileURLToPath(import.meta.url), '--vault', homedir(), 'tabs'], {
    encoding: 'utf8'
  })
  say('runner exits on --vault ~', r.status === 2 && /refusing the vault/.test(r.stderr), r.stderr.trim())

  // A node check that fails says which of its cases did, in the runner's own
  // output: a hosted runner keeps no log file to read afterwards.
  const broken = mkdtempSync(join(TMP, 'lanes-selftest-'))
  writeFileSync(
    join(broken, 'broken.mjs'),
    "console.log('  FAIL the one case that broke')\nconsole.log('broken: 1 passed, 1 failed')\nprocess.exit(1)\n"
  )
  const said = []
  const log = console.log
  console.log = (...a) => said.push(a.join(' '))
  try {
    runNode([['broken.mjs', []]], broken)
  } finally {
    console.log = log
    rmSync(broken, { recursive: true, force: true })
  }
  say(
    'a failing node check names its failing case',
    said.some((l) => l.includes('FAIL the one case that broke')),
    said.join(' | ').slice(0, 160)
  )

  // Main's refusal, as a function: every combination, without booting anything
  // that could reach a real state file.
  const guard = await import(join(REPO, 'src', 'main', 'guard.ts'))
  const ask = (env) => guard.driveRefusal(env)
  say('main refuses EXEC without STATE', /LANES_STATE/.test(ask({ LANES_CAPTURE_EXEC: 'x', LANES_VAULT: '/v' }) ?? ''))
  say('main refuses EXEC without VAULT', /LANES_VAULT/.test(ask({ LANES_CAPTURE_EXEC: 'x', LANES_STATE: '/s' }) ?? ''))
  say('main refuses EXEC with neither', /LANES_STATE and LANES_VAULT/.test(ask({ LANES_CAPTURE_EXEC: 'x' }) ?? ''))
  say('main allows EXEC with both', ask({ LANES_CAPTURE_EXEC: 'x', LANES_STATE: '/s', LANES_VAULT: '/v' }) === null)
  say('main allows a plain launch', ask({}) === null)

  // And main's refusal in the running app, booted the one way that is harmless
  // even if the guard were broken: a state directory of its own, HOME moved into
  // the temp dir (so the default vault is nobody's), no vault given, and a
  // script that touches nothing.
  const dir = mkdtempSync(join(TMP, 'lanes-selftest-'))
  const script = join(dir, 'noop.js')
  writeFileSync(script, "JSON.stringify({ pass: false, reached: 'the guard let a driven run through' })")
  mkdirSync(join(dir, 'state'))
  const env = { ...process.env }
  for (const k of Object.keys(env)) if (k.startsWith('LANES_')) delete env[k]
  Object.assign(env, {
    HOME: dir,
    LANES_STATE: join(dir, 'state'),
    LANES_CAPTURE: join(dir, 'shot.png'),
    LANES_CAPTURE_EXEC: script,
    LANES_CLAUDE: '/usr/bin/false'
  })
  lock()
  const run = await runApp(env, 90)
  say(
    'the app refuses a driven run without LANES_VAULT',
    /refusing to run a driven check without LANES_VAULT/.test(run.out) && !/capture script:/.test(run.out),
    run.timedOut ? 'timed out' : ''
  )
  rmSync(dir, { recursive: true, force: true })
  return table(results)
}

/* ---------- main ---------- */
let ok
if (flag('--self-test')) {
  ok = await selfTest()
} else if (flag('--node')) {
  ok = table(runNode())
} else if (flag('--dev')) {
  lock()
  const w = world('dev', { fixture: option('--fixture') ?? 'sample' })
  console.log(`vault ${w.vault}\nstate ${w.state}`)
  const env = envFor(w, { LANES_CLAUDE: w.claude })
  const child = spawn(join(REPO, 'node_modules', '.bin', 'electron-vite'), ['dev'], { cwd: REPO, env, stdio: 'inherit' })
  ok = await new Promise((done) => child.on('close', (code) => done(code === 0)))
  cleanup(w)
} else {
  const list = flag('--all')
    ? Object.keys(manifest.checks).map((n) => n.replace(/\.js$/, ''))
    : flag('--smoke')
      ? manifest.smoke
      : names
  if (!list.length) {
    console.error('usage: node checks/run.mjs <check…> | --smoke | --all | --node | --dev | --self-test  [--live] [--keep]')
    process.exit(2)
  }
  const results = []
  for (const name of list) {
    lock()
    const r = await runDriven(name)
    release()
    // A breath between, so a run waiting in another checkout gets its turn.
    if (list.length > 1) spawnSync('sleep', ['3'])
    console.log(`${r.verdict.padEnd(9)} ${name}${r.detail ? `  ${r.detail}` : ''}`)
    results.push(r)
  }
  ok = table(results)
}
process.exit(ok ? 0 : 1)
