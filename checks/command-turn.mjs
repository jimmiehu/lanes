// A SLASH COMMAND IS A TURN, read back as well as live.
//
// `/morning` — typed at a terminal, or sent from ⌘K's skill and prompt rows —
// is filed by the CLI in tags of its own:
//
//   <command-message>morning</command-message>
//   <command-name>/morning</command-name>
//
// and the transcript reader dropped every user line opening with `<`, taking
// it for machinery the CLI injected. So a thread started from a skill showed
// its opening turn while it ran and lost it the moment it was opened again —
// and a fork is cut by those two agreeing (red: three messages read back where
// four were on screen, and the opening one missing).
//
// This runs main's own `src/main/sessions.ts`, bundled for node, over a
// transcript shaped exactly like the one the CLI wrote for a real `/echo-word`
// on 7 October: the tagged command line, the skill's body as an `isMeta` line
// (still not a turn), then the answer. Writes only under a throwaway vault's
// own directory in ~/.claude/projects, and removes it after.
//
//   node checks/command-turn.mjs
import { build } from 'esbuild'
import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const work = await realpath(await mkdtemp(join(tmpdir(), 'lanes-command-turn-')))
const vault = join(work, 'vault')
await mkdir(vault)
const sessions = join(homedir(), '.claude', 'projects', vault.replace(/[^a-zA-Z0-9]/g, '-'))
await mkdir(sessions, { recursive: true })

await build({
  stdin: {
    contents:
      "export { typedCommand } from './src/shared/command.ts'\n" +
      "export { setVault } from './src/main/config.ts'\n" +
      "export { loadThread, saidIn } from './src/main/sessions.ts'\n",
    resolveDir: join(here, '..'),
    loader: 'ts'
  },
  bundle: true,
  platform: 'node',
  format: 'esm',
  outfile: join(work, 'reader.mjs'),
  logLevel: 'error'
})
const { typedCommand, loadThread, saidIn, setVault } = await import(pathToFileURL(join(work, 'reader.mjs')).href)
// Main's folder, as index.ts sets it at launch: transcripts are read from its project directory.
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

// --- the tags, read ---
const CAPTURED = '<command-message>echo-word</command-message>\n<command-name>/echo-word</command-name>'
ok('the line the CLI wrote', typedCommand(CAPTURED), '/echo-word')
ok(
  'with its arguments',
  typedCommand('<command-message>morning</command-message>\n<command-name>/morning</command-name>\n<command-args>focus on Garden</command-args>'),
  '/morning focus on Garden'
)
ok('empty arguments', typedCommand('<command-name>/model</command-name>\n<command-message>model</command-message>\n<command-args></command-args>'), '/model')
ok('a command\'s output is not one', typedCommand('<local-command-stdout>Set model to opus</local-command-stdout>'), null)
ok('a reminder is not one', typedCommand('<system-reminder>be brief</system-reminder>'), null)
ok('tags with words beside them are not one', typedCommand('<command-name>/x</command-name> and then some'), null)
ok('plain words are not one', typedCommand('run /morning please'), null)

// --- a transcript shaped like the real one ---
const ID = '5eed0000-0000-4000-8000-0000000c0de0'
let parent = null
let n = 0
const at = Date.parse('2026-10-07T10:00:00Z')
const line = (o) => {
  n += 1
  const uuid = `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
  const l = { parentUuid: parent, isSidechain: false, uuid, timestamp: new Date(at + n * 1000).toISOString(), cwd: vault, sessionId: ID, userType: 'external', ...o }
  parent = uuid
  return JSON.stringify(l)
}
const lines = [
  line({ type: 'user', message: { role: 'user', content: CAPTURED } }),
  line({
    type: 'user',
    isMeta: true,
    message: { role: 'user', content: [{ type: 'text', text: `Base directory for this skill: ${vault}/.claude/skills/echo-word\n\nReply with exactly the word PINEAPPLE and nothing else.\n` }] }
  }),
  line({ type: 'assistant', message: { role: 'assistant', model: 'claude-haiku-4-5', content: [{ type: 'text', text: 'PINEAPPLE' }] } }),
  line({ type: 'user', message: { role: 'user', content: [{ type: 'text', text: 'And again?' }] } }),
  line({ type: 'assistant', message: { role: 'assistant', model: 'claude-haiku-4-5', content: [{ type: 'text', text: 'PINEAPPLE again.' }] } })
]
await writeFile(join(sessions, `${ID}.jsonl`), `${lines.join('\n')}\n`)

const snap = await loadThread(ID)
const turns = (snap?.messages ?? []).map((m) => [m.role, m.text])
ok('read back, the command is the opening turn and the skill body is not one', turns, [
  ['you', '/echo-word'],
  ['claude', 'PINEAPPLE'],
  ['you', 'And again?'],
  ['claude', 'PINEAPPLE again.']
])
ok('a thread with no name of its own is called by what was typed', snap?.title, '/echo-word')
ok('what ⌘K searches has it', saidIn(lines.map((l) => JSON.parse(l))).split('\n'), [
  '/echo-word',
  'PINEAPPLE',
  'And again?',
  'PINEAPPLE again.'
])

// --- `/model` is a setting, not a turn: answered by the CLI, never by the model ---
// Shaped like the transcripts the CLI writes for one: the caveat,
// the command, its stdout — after an exchange that ended with an answer.
const write = async (id, ls) => {
  parent = null
  await writeFile(join(sessions, `${id}.jsonl`), `${ls.map((o) => line({ ...o, sessionId: id })).join('\n')}\n`)
}
const said = (text) => ({ type: 'user', message: { role: 'user', content: [{ type: 'text', text }] } })
const answer = (text) => ({ type: 'assistant', message: { role: 'assistant', model: 'claude-haiku-4-5', content: [{ type: 'text', text }] } })
const MODEL_ID = '5eed0000-0000-4000-8000-0000000c0de1'
await write(MODEL_ID, [
  said('Hi'),
  answer('Hello.'),
  { type: 'user', isMeta: true, message: { role: 'user', content: '<local-command-caveat>Caveat: The messages below were generated by the user while running local commands.</local-command-caveat>' } },
  { type: 'user', message: { role: 'user', content: '<command-name>/model</command-name>\n            <command-message>model</command-message>\n            <command-args></command-args>' } },
  { type: 'user', message: { role: 'user', content: '<local-command-stdout>Set model to claude-opus-4-8</local-command-stdout>' } }
])
const model = await loadThread(MODEL_ID)
ok('a /model answered by the CLI is not a turn', (model?.messages ?? []).map((m) => [m.role, m.text]), [
  ['you', 'Hi'],
  ['claude', 'Hello.']
])

// --- a command still in flight is a turn: nothing has come back for it yet ---
const FLIGHT_ID = '5eed0000-0000-4000-8000-0000000c0de2'
await write(FLIGHT_ID, [
  { type: 'user', message: { role: 'user', content: CAPTURED } },
  { type: 'user', isMeta: true, message: { role: 'user', content: [{ type: 'text', text: 'Base directory for this skill: …' }] } }
])
const flight = await loadThread(FLIGHT_ID)
ok('a command in flight is the turn it will be', (flight?.messages ?? []).map((m) => [m.role, m.text]), [['you', '/echo-word']])

// --- one somebody spoke past, unanswered, is not ---
const PAST_ID = '5eed0000-0000-4000-8000-0000000c0de3'
await write(PAST_ID, [
  { type: 'user', message: { role: 'user', content: CAPTURED } },
  said('Never mind — just say hi.'),
  answer('Hi.')
])
const past = await loadThread(PAST_ID)
ok('a command never answered is not a turn', (past?.messages ?? []).map((m) => [m.role, m.text]), [
  ['you', 'Never mind — just say hi.'],
  ['claude', 'Hi.']
])

await rm(sessions, { recursive: true, force: true })
await rm(work, { recursive: true, force: true })
console.log(`${pass} pass, ${fail} fail`)
process.exit(fail ? 1 : 0)
