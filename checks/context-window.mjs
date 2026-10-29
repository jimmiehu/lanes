// A THREAD READ FROM DISK IS MEASURED AGAINST ITS OWN MODEL'S WINDOW — proved.
//
// A thread opened from its transcript drew its context against a 200K written
// into the reader, whatever model ran it: the real thread behind the report,
// on `claude-opus-5-5`, read `828K / 200K`. Now the reader takes the model the
// newest usage line names and the window the CLI has said for it
// (`contextWindows` in the state), and, where nothing has said, never a window
// smaller than what was sent (`shared/contextWindow.ts`).
//
// Runs main's own `src/main/sessions.ts`, bundled for node, over transcripts
// shaped like the CLI's — the 828,186 tokens of that thread's last call among
// them. Writes only under a throwaway vault's own directory in
// ~/.claude/projects, and removes it after.
//
//   node checks/context-window.mjs
import { build } from 'esbuild'
import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const work = await realpath(await mkdtemp(join(tmpdir(), 'lanes-context-window-')))
const vault = join(work, 'vault')
await mkdir(vault)
const sessions = join(homedir(), '.claude', 'projects', vault.replace(/[^a-zA-Z0-9]/g, '-'))
await mkdir(sessions, { recursive: true })

await build({
  stdin: {
    contents:
      "export { windowFor, tokens } from './src/shared/contextWindow.ts'\n" +
      "export { setVault } from './src/main/config.ts'\n" +
      "export { loadThread } from './src/main/sessions.ts'\n",
    resolveDir: join(here, '..'),
    loader: 'ts'
  },
  bundle: true,
  platform: 'node',
  format: 'esm',
  outfile: join(work, 'reader.mjs'),
  logLevel: 'error'
})
const { windowFor, tokens, loadThread, setVault } = await import(pathToFileURL(join(work, 'reader.mjs')).href)
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

/* ---------- the rule ---------- */

ok('nothing said, little sent: the base window', windowFor('claude-haiku-4-5', 30_000, {}), 200_000)
ok('nothing said, 828K sent: not a 200K window', windowFor('claude-opus-5-5', 828_186, {}), 1_000_000)
ok('what the CLI said stands', windowFor('claude-opus-5-5', 40_000, { 'claude-opus-5-5': 1_000_000 }), 1_000_000)
ok('a said 200K stands too', windowFor('claude-haiku-4-5', 150_000, { 'claude-haiku-4-5': 200_000 }), 200_000)
ok('another model’s window is not this one’s', windowFor('claude-sonnet-5', 40_000, { 'claude-opus-5-5': 1_000_000 }), 200_000)
ok('a configured window is the fallback', windowFor(null, 40_000, {}, 500_000), 500_000)
ok('no window is smaller than what went through it', windowFor('m', 300_000, { m: 200_000 }), 1_000_000)
ok('said short', [tokens(828_186), tokens(200_000), tokens(1_000_000), tokens(1_500_000)], ['828K', '200K', '1M', '1.5M'])

/* ---------- a thread, read from disk ---------- */

let n = 0
const at = Date.parse('2026-10-08T09:00:00Z')
const thread = async (id, model, used) => {
  let parent = null
  const line = (o) => {
    const uuid = `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`
    const l = { parentUuid: parent, isSidechain: false, uuid, timestamp: new Date(at + n * 1000).toISOString(), cwd: vault, sessionId: id, userType: 'external', ...o }
    parent = uuid
    return JSON.stringify(l)
  }
  const lines = [
    line({ type: 'user', message: { role: 'user', content: 'Where were we?' } }),
    line({
      type: 'assistant',
      message: {
        role: 'assistant',
        model,
        content: [{ type: 'text', text: 'Here.' }],
        usage: { input_tokens: 6, cache_creation_input_tokens: 2180, cache_read_input_tokens: used - 2186, output_tokens: 40 }
      }
    }),
    // What the CLI writes after an interruption: no tokens, and no model of note.
    line({ type: 'assistant', message: { role: 'assistant', model: '<synthetic>', content: [{ type: 'text', text: 'No response requested.' }], usage: { input_tokens: 0, output_tokens: 0 } } })
  ]
  await writeFile(join(sessions, `${id}.jsonl`), `${lines.join('\n')}\n`)
  return (await loadThread(id, {}, {}, LEARNED))?.context
}

let LEARNED = {}
ok('the reported thread, nothing said yet', await thread('aaaaaaaa-0000-4000-8000-000000000001', 'claude-opus-5-5', 828_186), { used: 828_186, window: 1_000_000 })
LEARNED = { 'claude-opus-5-5': 1_000_000 }
ok('a short thread on that model, once it is said', await thread('aaaaaaaa-0000-4000-8000-000000000002', 'claude-opus-5-5', 40_000), { used: 40_000, window: 1_000_000 })
ok('a short Haiku thread keeps 200K', await thread('aaaaaaaa-0000-4000-8000-000000000003', 'claude-haiku-4-5-20251001', 30_000), { used: 30_000, window: 200_000 })

await rm(sessions, { recursive: true, force: true })
await rm(work, { recursive: true, force: true })
console.log(`${pass} pass, ${fail} fail`)
process.exit(fail ? 1 : 0)
