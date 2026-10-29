// A NEW INSTALL STARTS GUARDED, WITH SCHEDULES OFF — AND AN OLD ONE KEEPS WHAT IT HAD.
//
// Three promises about what Lanes does before anyone has said otherwise:
//
// - A state file Lanes has never written starts in Guarded: nothing runs
//   without a yes. A state file that says Standard (or anything else) is read
//   as it says — the loader spreads what was saved over the defaults.
// - Prompts that keep time are off on a new install. A state file from before
//   the switch existed has no `flags.schedules`, and is read as "on if a saved
//   prompt already runs by itself", so an install already running schedules
//   keeps running them. That reading is not written back for its own sake: the
//   file says `schedules` only once leaving it out would read differently —
//   a new install that schedules a prompt without turning the switch on must
//   not find it on at the next launch.
// - A scheduled run is Autonomous only if that prompt was confirmed Autonomous.
//   Anything else that would make it Autonomous — a prompt set so before the
//   confirm existed, or the app-wide mode it inherits — runs it Standard. A
//   prompt run by hand (⌘K, Run now) has someone there, and is not clamped.
//
// Runs main's own `src/main/state.ts` and `src/main/scheduler.ts`, bundled for
// node with a stand-in for electron whose userData is a temporary directory,
// and `runOf` from `src/shared/prompts.ts`. The scheduler is given a stand-in
// session maker, so nothing is ever sent.
//
//   node checks/safety-default.mjs
import { build } from 'esbuild'
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const work = await realpath(await mkdtemp(join(tmpdir(), 'lanes-safety-default-')))

await build({
  stdin: {
    contents:
      "export { loadState, patchState, flushNow } from './src/main/state.ts'\n" +
      "export { startScheduler } from './src/main/scheduler.ts'\n" +
      "export { runOf } from './src/shared/prompts.ts'\n" +
      "export { startOptions } from './src/shared/options.ts'\n",
    resolveDir: join(here, '..'),
    loader: 'ts'
  },
  bundle: true,
  platform: 'node',
  format: 'esm',
  outfile: join(work, 'main.mjs'),
  logLevel: 'error',
  plugins: [
    {
      name: 'electron',
      setup(b) {
        b.onResolve({ filter: /^electron$/ }, () => ({ path: 'electron', namespace: 'stand-in' }))
        // userData is read once, when the module loads: each case loads its
        // own copy of main, so a write still on its way from one case cannot
        // land in the next one's directory.
        b.onLoad({ filter: /.*/, namespace: 'stand-in' }, () => ({
          contents:
            'const dir = globalThis.__userData\n' +
            'export const app = { getPath: () => dir }\n' +
            'export const powerMonitor = { on() {} }\n',
          loader: 'js'
        }))
      }
    }
  ]
})

let pass = 0
let fail = 0
const ok = (name, got, want) => {
  if (JSON.stringify(got) === JSON.stringify(want)) pass += 1
  else {
    fail += 1
    console.log(`  FAIL ${name}\n       got  ${JSON.stringify(got)}\n       want ${JSON.stringify(want)}`)
  }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/** A fresh copy of main over its own userData, holding `saved` (or nothing) as its state file. */
let n = 0
const mainOver = async (saved) => {
  n += 1
  const dir = join(work, `case-${n}`)
  await mkdir(dir)
  if (saved !== undefined) await writeFile(join(dir, 'lanes-state.json'), JSON.stringify(saved))
  globalThis.__userData = dir
  const M = await import(`${pathToFileURL(join(work, 'main.mjs')).href}?case=${n}`)
  const onDisk = async () => JSON.parse(await readFile(join(dir, 'lanes-state.json'), 'utf8'))
  return { M, dir, onDisk }
}

const EVERY_DAY = [0, 1, 2, 3, 4, 5, 6]
/** Due now: every day at midnight, set long ago, never run. */
const due = (id, extra = {}) => ({
  id,
  name: id,
  text: `Say ${id}.`,
  schedule: { days: EVERY_DAY, time: '00:00', on: true, since: 0 },
  ...extra
})
const paused = (id) => ({ ...due(id), schedule: { ...due(id).schedule, on: false } })

/* ---------- the safety mode a state file starts in ---------- */
{
  const { M, onDisk } = await mainOver(undefined)
  const st = await M.loadState()
  ok('a new state file starts Guarded', st.safety, 'guarded')
  ok('a new state file starts with schedules off', st.flags.schedules, false)
  ok(
    'before the state has arrived, a chat starts Guarded too',
    M.startOptions(null, { model: 'sonnet', effort: 'mid' }).safety,
    'guarded'
  )
  await M.patchState({ perLane: 9 })
  await M.flushNow()
  ok('a new file does not write the switch it was never given', 'schedules' in ((await onDisk()).flags ?? {}), false)
}
{
  const { M } = await mainOver({ safety: 'standard' })
  ok('a state file that says Standard stays Standard', (await M.loadState()).safety, 'standard')
}
{
  const { M } = await mainOver({ safety: 'autonomous', perLane: 5 })
  const st = await M.loadState()
  ok('a state file that says Autonomous is read as it says', [st.safety, st.perLane], ['autonomous', 5])
}

/* ---------- schedules: absent, derived; said, kept ---------- */
{
  const { M } = await mainOver({ prompts: [paused('quiet'), { id: 'plain', name: 'plain', text: 'Hi.' }] })
  ok('absent, and no prompt runs by itself: off', (await M.loadState()).flags.schedules, false)
}
{
  const { M, onDisk } = await mainOver({ flags: { wrapFlip: false }, prompts: [paused('quiet'), due('standup')] })
  const st = await M.loadState()
  ok('absent, and a prompt already runs by itself: on', st.flags.schedules, true)
  ok('the other flags are still what was saved, over the defaults', [st.flags.wrapFlip, st.flags.allowShell], [false, true])
  await M.patchState({ perLane: 7 })
  await M.flushNow()
  const disk = await onDisk()
  ok('the derived reading is not written back', [disk.perLane, 'schedules' in disk.flags], [7, false])
}
{
  const { M } = await mainOver({ flags: { schedules: false }, prompts: [due('standup')] })
  ok('said off stays off, whatever is scheduled', (await M.loadState()).flags.schedules, false)
}
{
  const { M } = await mainOver({ flags: { schedules: true }, prompts: [] })
  ok('said on stays on, with nothing scheduled', (await M.loadState()).flags.schedules, true)
}
{
  // A new install schedules a prompt and never touches the switch. Read on the
  // next launch without `schedules`, the file would now say "on".
  const { M, dir, onDisk } = await mainOver(undefined)
  await M.loadState()
  await M.patchState({ prompts: [due('standup')] })
  await M.flushNow()
  ok('a prompt scheduled with the switch off: the file says off', (await onDisk()).flags?.schedules, false)
  globalThis.__userData = dir
  n += 1
  const again = await import(`${pathToFileURL(join(work, 'main.mjs')).href}?case=${n}`)
  ok('…so the next launch still reads off', (await again.loadState()).flags.schedules, false)
}

/* ---------- the scheduler: nothing when off ---------- */
const sessions = []
const deps = {
  sessionFor: (opts) => {
    sessions.push(opts)
    return { on() {}, off() {}, send() {} }
  },
  close() {},
  tell: () => false,
  hasWindow: () => false
}
/** Lets the scheduler look, and waits for it to have sent `want` runs, or for `ms`. */
const looked = async (poke, want, ms) => {
  poke()
  const until = Date.now() + ms
  while (Date.now() < until && sessions.length < want) await sleep(25)
  // And a moment more, for a run it should not have made.
  await sleep(150)
}
{
  sessions.length = 0
  const { M } = await mainOver({ flags: { schedules: false }, safety: 'standard', prompts: [due('standup', { safety: 'standard' })] })
  const { poke } = M.startScheduler(deps)
  await looked(poke, 1, 600)
  ok('off: a prompt that is due starts no session', sessions.length, 0)
  const st = await M.loadState()
  ok('off: and no run is recorded', st.runs, {})
}
{
  sessions.length = 0
  const { M } = await mainOver({
    flags: { schedules: true },
    safety: 'autonomous',
    prompts: [
      due('unconfirmed', { safety: 'autonomous' }),
      due('confirmed', { safety: 'autonomous', autonomousConfirmed: true }),
      due('inherits')
    ]
  })
  const { poke } = M.startScheduler(deps)
  await looked(poke, 3, 3000)
  // Which prompt a session was for, by the run each prompt recorded.
  const st = await M.loadState()
  const bySession = Object.fromEntries(Object.entries(st.runs).map(([id, r]) => [r.sessionId, id]))
  const modes = Object.fromEntries(sessions.map((o) => [bySession[o.sessionId], o.safety]))
  ok('on: every due prompt starts its session', sessions.length, 3)
  ok(
    'on: Autonomous only where that prompt was confirmed; the app-wide Autonomous is not a confirm',
    modes,
    { unconfirmed: 'standard', confirmed: 'autonomous', inherits: 'standard' }
  )
  await M.flushNow()
}

/* ---------- runOf: the clamp, said once ---------- */
{
  const { M } = await mainOver({ safety: 'autonomous' })
  const st = await M.loadState()
  const now = Date.now()
  const mode = (prompt, how, state = st) => M.runOf(prompt, state, 'id', now, how).options.safety
  ok('scheduled, Autonomous, not confirmed: Standard', mode(due('a', { safety: 'autonomous' }), { scheduled: true }), 'standard')
  ok(
    'scheduled, Autonomous, confirmed: Autonomous',
    mode(due('a', { safety: 'autonomous', autonomousConfirmed: true }), { scheduled: true }),
    'autonomous'
  )
  ok('scheduled, the app-wide Autonomous: Standard', mode(due('a'), { scheduled: true }), 'standard')
  ok('scheduled, Standard stays Standard', mode(due('a', { safety: 'standard' }), { scheduled: true }), 'standard')
  ok('scheduled, Guarded is under the clamp, and stays', mode(due('a'), { scheduled: true }, { ...st, safety: 'guarded' }), 'guarded')
  ok('run by hand, someone is there: not clamped', mode(due('a', { safety: 'autonomous' })), 'autonomous')
}

await rm(work, { recursive: true, force: true })
console.log(`${pass} pass, ${fail} fail — safety default, schedules switch, scheduled-Autonomous clamp`)
process.exit(fail ? 1 : 0)
