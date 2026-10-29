// A GUARDED YES LASTS ONE CONTINUATION, AND ONLY MAIN'S OWN QUESTION GETS ONE.
//
// Guarded runs the CLI in `manual`: a call is refused, the turn ends, and the
// app asks instead. A yes re-runs the thread with the permission it implied —
// `acceptEdits` for a file, `bypassPermissions` for a shell call — on a
// process of its own, for that one continuation. The docs say the next turn
// asks again. It did not, whenever the continuation ended any way but its own
// `result`: the grant was cleared there and nowhere else, so after Stop, a
// kill, or a CLI that died, the next message ran unasked.
//
// And three ways a setting or a yes reached the CLI that it should not have:
//
// - A safety or effort changed while a turn streamed never reached the
//   process. The options were overwritten before they were compared, so the
//   next message — queued behind the turn, or sent after — went to the old
//   process, still on the old flags.
// - An answer was taken on the page's word. One main never asked was granted;
//   one already answered was granted again; and how wide the grant was came
//   from the `shell` the page sent back, so a yes to a file edit could be
//   turned into a free hand.
// - A safety or effort that is none of the values was handed to the CLI.
//
// Red before (8 pass, 18 fail): after Stop, a kill or a CLI that died, the
// next message ran on `bypassPermissions`; a follow-up to a thread switched
// to Guarded mid-turn reached the same `bypassPermissions` process, at effort
// `medium`, and ran its shell call; a yes to a question never asked, to one
// already answered and to another question's id each started a process
// unasked; a yes to a file edit with `shell` flipped on the way back ran on
// `bypassPermissions`; and there was no `knownFlags` to hold the values to.
//
// And what a restart into an update would cut short (`holding`, read by
// main/update.ts). Red before (30 pass, 4 fail, reading the `running` there
// was then): a question open, and a yes on its way to its continuation, held
// nothing, so a restart went ahead and lost them; and a `claude` that could
// not be started left its thread running for good — every later message
// queued behind a turn that never began, never sent.
//
// Runs main's own `src/main/cli.ts`, bundled for node, against a stand-in
// `claude` this writes into a temporary directory (LANES_CLAUDE). The stand-in
// speaks stream-json, notes every argv it is started with and every message
// it is handed, and behaves by what the message asks: `[shell]` and `[write]`
// want a tool, refused unless the mode allows it; `[slow]` never lands;
// `[wait]` lands after a moment; `[crash]` dies mid-turn. Moved away for a
// moment, it is a `claude` that cannot be started. Spends no turns and
// writes nothing outside its temporary directory.
//
//   node checks/cli-grant.mjs
import { build } from 'esbuild'
import { randomUUID } from 'node:crypto'
import { chmod, mkdir, mkdtemp, readFile, realpath, rename, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const work = await realpath(await mkdtemp(join(tmpdir(), 'lanes-cli-grant-')))
const vault = join(work, 'vault')
await mkdir(join(vault, 'Garden'), { recursive: true })
await mkdir(join(vault, 'Kitchen'), { recursive: true })
const LOG = join(work, 'claude.log')
await writeFile(LOG, '')

/* ---------- the stand-in ---------- */

const STAND_IN = `#!/usr/bin/env node
const { appendFileSync } = require('node:fs')
const argv = process.argv.slice(2)
const flag = (f) => (argv.includes(f) ? argv[argv.indexOf(f) + 1] : null)
const session = flag('--session-id') ?? flag('--resume')
const mode = flag('--permission-mode')
const effort = flag('--effort')
const note = (o) => appendFileSync(${JSON.stringify(LOG)}, JSON.stringify({ pid: process.pid, session, mode, effort, ...o }) + '\\n')
note({ kind: 'spawn', argv })
const out = (o) => process.stdout.write(JSON.stringify(o) + '\\n')
const say = (text) => out({ type: 'assistant', parent_tool_use_id: null, message: { role: 'assistant', content: [{ type: 'text', text }] } })
const land = () => out({ type: 'result', subtype: 'success', duration_ms: 5 })
const allowed = (tool) => mode === 'bypassPermissions' || (mode === 'acceptEdits' && tool === 'Write')
let n = 0
function turn(text) {
  note({ kind: 'said', text })
  n += 1
  const tags = (text.match(/\\[(shell|write|slow|wait|crash)\\]/g) ?? []).join(' ')
  const tool = tags.includes('[shell]') ? 'Bash' : tags.includes('[write]') ? 'Write' : null
  if (tool) {
    const id = 'toolu_' + process.pid + '_' + n
    const input = tool === 'Bash'
      ? { command: 'ls ~/Garden/allotment ' + tags }
      : { file_path: ${JSON.stringify(join(vault, 'Kitchen'))} + '/menu.md', content: tags }
    out({ type: 'assistant', parent_tool_use_id: null, message: { role: 'assistant', content: [{ type: 'tool_use', id, name: tool, input }] } })
    if (!allowed(tool)) {
      out({ type: 'system', subtype: 'permission_denied', tool_name: tool, tool_use_id: id, message: 'Claude requested permissions to use ' + tool + ", but you haven't granted it yet." })
      say('I need a yes for that.')
      land()
      return
    }
    note({ kind: 'ran', tool })
    out({ type: 'user', parent_tool_use_id: null, message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: id, content: 'done' }] } })
  }
  if (tags.includes('[crash]')) {
    say('Partway through')
    setTimeout(() => process.exit(3), 50)
    return
  }
  if (tags.includes('[slow]')) {
    say('Working on it')
    return
  }
  if (tags.includes('[wait]')) {
    say('Thinking about the Kitchen lane')
    setTimeout(() => { say('Done.'); land() }, 400)
    return
  }
  say('ok')
  land()
}
let buf = ''
process.stdin.setEncoding('utf8')
process.stdin.on('data', (c) => {
  buf += c
  let nl
  while ((nl = buf.indexOf('\\n')) !== -1) {
    const line = buf.slice(0, nl)
    buf = buf.slice(nl + 1)
    if (!line.trim()) continue
    const m = JSON.parse(line)
    turn(m.message.content.filter((b) => b.type === 'text').map((b) => b.text).join('\\n'))
  }
})
process.stdin.on('end', () => process.exit(0))
// A stand-in nobody is talking to does not outlive the check.
setTimeout(() => process.exit(0), 30000).unref()
`
const claude = join(work, 'claude')
await writeFile(claude, STAND_IN)
await chmod(claude, 0o755)
process.env.LANES_CLAUDE = claude

/* ---------- main's own session, bundled ---------- */

await build({
  stdin: {
    // `export *`, so a name the code under test does not have is undefined
    // rather than a build that fails before anything is checked.
    contents: "export * from './src/main/cli.ts'\nexport { setVault } from './src/main/config.ts'\n",
    resolveDir: join(here, '..'),
    loader: 'ts'
  },
  bundle: true,
  platform: 'node',
  format: 'esm',
  outfile: join(work, 'cli.mjs'),
  logLevel: 'error',
  plugins: [
    {
      // cli.ts reaches state.ts through windows.ts, and state.ts takes `app`
      // from electron. Nothing here writes state; a userData under the
      // temporary directory makes sure of it.
      name: 'electron-stand-in',
      setup(b) {
        b.onResolve({ filter: /^electron$/ }, () => ({ path: 'electron', namespace: 'stand-in' }))
        b.onLoad({ filter: /.*/, namespace: 'stand-in' }, () => ({
          contents: `export const app = { getPath: () => ${JSON.stringify(work)} }`,
          loader: 'js'
        }))
      }
    }
  ]
})
const cli = await import(pathToFileURL(join(work, 'cli.mjs')).href)
const { CliSession, setVault } = cli
setVault(vault)

let pass = 0
let fail = 0
const ok = (name, got, want) => {
  if (JSON.stringify(got) === JSON.stringify(want)) pass += 1
  else {
    fail += 1
    console.log(`  FAIL ${name}\n       got  ${JSON.stringify(got)}\n       want ${JSON.stringify(want)}`)
  }
}

const sessions = []
/** A session as the renderer would start one, with the events it says. */
function chat(safety, over = {}) {
  const s = new CliSession({ sessionId: randomUUID(), fresh: true, model: 'haiku', effort: 'mid', safety, ...over })
  const waiters = []
  s.on('event', (e) => {
    for (const w of [...waiters]) {
      if (!w.pred(e)) continue
      waiters.splice(waiters.indexOf(w), 1)
      w.done(e)
    }
  })
  // The next event that fits, or null when none comes in time. Asked for
  // BEFORE whatever is meant to cause it.
  s.next = (pred, ms = 5000) =>
    new Promise((done) => {
      const w = { pred, done }
      waiters.push(w)
      setTimeout(() => {
        if (!waiters.includes(w)) return
        waiters.splice(waiters.indexOf(w), 1)
        done(null)
      }, ms)
    })
  sessions.push(s)
  return s
}
const is = (type) => (e) => e.type === type
// `source`, not `text`: after a tool row, the words go into the blocks.
const said = (text) => (e) => e.type === 'patch' && e.message.source.includes(text)
const settle = (ms) => new Promise((r) => setTimeout(r, ms))

/** What the stand-in noted for one session, in order. */
async function heard(s) {
  return (await readFile(LOG, 'utf8'))
    .split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l))
    .filter((l) => l.session === s.sessionId)
}
/** The mode of the process each message reached, by the message's opening words. */
const modeFor = (log, words) => log.find((l) => l.kind === 'said' && l.text.startsWith(words))?.mode ?? null
const modes = (log) => log.filter((l) => l.kind === 'spawn').map((l) => l.mode)

/** Sends, and has the refusal the CLI ends that turn with. */
async function refused(s, text) {
  const asked = s.next(is('permission'))
  const done = s.next(is('done'))
  s.send(text)
  const e = await asked
  await done
  return e?.request ?? null
}

/* ---------- a yes, the continuation it is for, and then the thread's own ---------- */
{
  const s = chat('guarded')
  const req = await refused(s, 'Tidy the allotment notes [shell]')
  ok('a refused shell call is asked about, as a shell call', req && { tool: req.tool, shell: req.shell }, { tool: 'Bash', shell: true })
  const landed = s.next(is('done'))
  await s.answer(req, true)
  await landed
  const after = s.next(is('done'))
  s.send('And the Kitchen lane?')
  await after
  const log = await heard(s)
  ok('the yes runs its continuation unasked', modeFor(log, 'Approved.'), 'bypassPermissions')
  ok('the continuation did what was asked', log.some((l) => l.kind === 'ran' && l.tool === 'Bash'), true)
  ok('the next turn is the thread\'s own again', modeFor(log, 'And the Kitchen lane?'), 'manual')

  // The same question, answered again: it was answered.
  const before = modes(await heard(s)).length
  await s.answer(req, true)
  await settle(600)
  const again = await heard(s)
  ok('a question already answered grants nothing', modes(again).slice(before).filter((m) => m !== 'manual'), [])
}

/* ---------- Stop, mid-continuation ---------- */
{
  const s = chat('guarded')
  const req = await refused(s, 'Water the Garden [shell] [slow]')
  const working = s.next(said('Working on it'))
  await s.answer(req, true)
  ok('the continuation is under way', Boolean(await working), true)
  s.interrupt()
  const done = s.next(is('done'))
  s.send('What is in the Garden lane?')
  await done
  const log = await heard(s)
  ok('after Stop, the next message runs on the thread\'s own mode', modeFor(log, 'What is in the Garden lane?'), 'manual')
}

/* ---------- the CLI dies, mid-continuation ---------- */
{
  const s = chat('guarded')
  const req = await refused(s, 'Prune the allotment [shell] [crash]')
  const gone = s.next(is('exit'))
  await s.answer(req, true)
  ok('the continuation died', Boolean(await gone), true)
  const done = s.next(is('done'))
  s.send('Is the Garden lane tidy?')
  await done
  const log = await heard(s)
  ok('after the process dies, the next message runs on the thread\'s own mode', modeFor(log, 'Is the Garden lane tidy?'), 'manual')
}

/* ---------- killed between the yes and its continuation ---------- */
{
  const s = chat('guarded')
  const req = await refused(s, 'Clear the Kitchen shelf [shell]')
  const answering = s.answer(req, true)
  s.kill()
  await answering
  await settle(300)
  const done = s.next(is('done'))
  s.send('Leave it for now')
  await done
  const log = await heard(s)
  ok('a kill takes the yes with it: nothing ran unasked', modes(log).filter((m) => m !== 'manual'), [])
  ok('and the continuation it was for is not sent', log.some((l) => l.kind === 'said' && l.text.startsWith('Approved.')), false)
}

/* ---------- a safety and an effort changed while a turn streams ---------- */
{
  const s = chat('autonomous')
  const streaming = s.next(said('Thinking about the Kitchen lane'))
  const first = s.next(is('done'))
  s.send('Plan the Kitchen week [wait]')
  await streaming
  // Settings → Safety, mid-turn; then a follow-up, queued behind it.
  s.configure({ safety: 'guarded', effort: 'max' })
  const asked = s.next(is('permission'), 3000)
  s.send('Then sweep the Garden [shell]')
  await first
  const req = await asked
  const log = await heard(s)
  const reached = log.find((l) => l.kind === 'said' && l.text.startsWith('Then sweep the Garden'))
  ok('a safety changed mid-turn reaches the next message', reached?.mode ?? null, 'manual')
  ok('and so does an effort', reached?.effort ?? null, 'max')
  ok('so the shell call is asked about, not run', Boolean(req) && !log.some((l) => l.kind === 'ran'), true)

  // And the same change carried on a send, the way `lanes:send` carries it.
  const t = chat('autonomous')
  const tStreaming = t.next(said('Thinking about the Kitchen lane'))
  const tFirst = t.next(is('done'))
  t.send('Plan the Garden week [wait]')
  await tStreaming
  t.configure({ safety: 'standard' })
  t.send('Then the allotment')
  await tFirst
  await t.next(is('done'))
  ok('a send that carries a new safety is sent on it', modeFor(await heard(t), 'Then the allotment'), 'acceptEdits')
}

/* ---------- an answer main never asked ---------- */
{
  const s = chat('guarded')
  const done = s.next(is('done'))
  s.send('Hello')
  await done
  await s.answer({ sessionId: s.sessionId, id: randomUUID(), tool: 'Bash', summary: 'rm -rf ~/Garden', shell: true }, true)
  await settle(600)
  const log = await heard(s)
  ok('a yes to a question never asked grants nothing', modes(log).filter((m) => m !== 'manual'), [])
  ok('and sends nothing', log.some((l) => l.kind === 'said' && l.text.startsWith('Approved.')), false)
}

/* ---------- a file's yes, widened on the way back ---------- */
{
  const s = chat('guarded')
  const req = await refused(s, 'Write the Kitchen menu [write]')
  ok('a refused edit is asked about, as an edit', req && { tool: req.tool, shell: req.shell }, { tool: 'Write', shell: false })
  const landed = s.next(is('done'))
  await s.answer({ ...req, shell: true }, true)
  await landed
  ok('the grant is as wide as what main asked, not what came back', modeFor(await heard(s), 'Approved.'), 'acceptEdits')

  // Another question's id, while this one is open: refused, and this one
  // still answerable.
  const t = chat('guarded')
  const open = await refused(t, 'Write the Garden plan [write]')
  await t.answer({ ...open, id: 'not-the-one' }, true)
  await settle(400)
  ok('an answer to another question grants nothing', modes(await heard(t)).filter((m) => m !== 'manual'), [])
  const tLanded = t.next(is('done'))
  await t.answer(open, true)
  await tLanded
  ok('and the question asked is still open', modeFor(await heard(t), 'Approved.'), 'acceptEdits')
}

/* ---------- what a restart would cut short ---------- */
// "Update ready" (main/update.ts) restarts only once no thread holds it: not
// a reply running, and not a Guarded question either — a relaunch has neither
// the question nor main's record of it, so a yes after it grants nothing. Nor
// a yes between the answer and its continuation, while the old process is
// waited out with no turn running.
const hold = (s) => ('holding' in s ? s.holding : 'no holding to read')
{
  const s = chat('guarded')
  ok('an idle thread holds nothing', hold(s), null)
  const streaming = s.next(said('Thinking about the Kitchen lane'))
  const first = s.next(is('done'))
  s.send('Plan the Kitchen week [wait]')
  await streaming
  ok('a reply running holds a restart', hold(s), 'reply')
  await first
  const req = await refused(s, 'Tidy the allotment notes [shell]')
  ok('so does a question open, once its turn has landed', hold(s), 'question')
  const landed = s.next(is('done'))
  const answering = s.answer(req, true)
  ok('and a yes on its way to its continuation', hold(s), 'reply')
  await answering
  await landed
  ok('which, landed, holds nothing', hold(s), null)
}

/* ---------- no `claude` to start ---------- */
// ENOENT or EACCES: the process never starts, so it never exits either —
// Node says 'error' and 'close', not 'exit'. The turn begun on it is over all
// the same, and nothing may go on waiting for it: not a restart into an
// update, and not the next message, which was queued behind it for good.
{
  const s = chat('guarded')
  await rename(claude, `${claude}.gone`)
  const gone = s.next(is('exit'))
  s.send('Is anything growing in the Garden?')
  ok('a CLI that cannot be started ends the turn', Boolean(await gone), true)
  ok('and holds nothing up', hold(s), null)
  await rename(`${claude}.gone`, claude)
  const done = s.next(is('done'))
  s.send('And now?')
  ok('the next message, once there is a CLI, is sent and lands', Boolean(await done), true)
}

/* ---------- a safety or effort that is none ---------- */
{
  const { knownFlags } = cli
  const base = { sessionId: randomUUID(), model: 'haiku' }
  const pick = (o, ...f) => {
    if (typeof knownFlags !== 'function') return 'no knownFlags'
    const r = knownFlags({ ...base, ...o }, ...f)
    return [r.safety, r.effort]
  }
  ok('values that are values stand', pick({ safety: 'standard', effort: 'high' }, { safety: 'guarded', effort: 'mid' }), ['standard', 'high'])
  ok('ones that are not take the fallback', pick({ safety: 'yolo', effort: 'turbo' }, { safety: 'standard', effort: 'max' }), ['standard', 'max'])
  ok('a name every object has is not one', pick({ safety: 'constructor', effort: '__proto__' }, { safety: 'guarded', effort: 'low' }), ['guarded', 'low'])
  ok('a fallback that is none is passed over', pick({ safety: 1, effort: null }, { safety: 'nope', effort: 'nope' }, { safety: 'autonomous', effort: 'xhigh' }), ['autonomous', 'xhigh'])
  ok('with nothing to fall back to: Guarded, and the default effort', pick({ safety: 'yolo', effort: 'turbo' }), ['guarded', 'mid'])
}

for (const s of sessions) s.kill()
await settle(200)
await rm(work, { recursive: true, force: true })
console.log(`${pass} pass, ${fail} fail`)
process.exit(fail ? 1 : 0)
