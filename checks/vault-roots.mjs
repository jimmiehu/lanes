// THE PATHS A SHELL COMMAND NAMES ARE READ AGAINST THE VAULT'S OWN FOLDERS.
//
// Much of a thread's work happens through Bash — `cat`, `grep`, `sed` — and
// the touched-notes index reads which vault files a command named, which feeds
// a thread's lane and its linked notes. It knew a vault file by its first
// folder, from a hard-coded list of top-level folders, so in a vault without
// them no command touched anything. Now the list is the vault's: its
// top-level directories as they are on disk, hidden ones aside, read again on
// every pass of the index — and a folder made since is seen without the
// transcript changing.
//
// Here: a vault with folders `a`, `b c` and `c++` sees `cat 'b c/x.md'`,
// `ls a/`, `cat c++/x.md` and an absolute path inside it, and not a hidden
// folder or a folder that is not there. An empty vault sees nothing and its
// pattern matches nothing. And the index, run twice over one unchanged
// transcript, files the thread under a lane whose folder was made in between.
//
// Runs main's own `src/main/sessions.ts` and `src/main/threadIndex.ts`,
// bundled for node with a stand-in for electron whose userData, and a HOME
// whose `.claude/projects`, are in a temporary directory.
//
//   node checks/vault-roots.mjs
import { build } from 'esbuild'
import { mkdir, mkdtemp, realpath, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const work = await realpath(await mkdtemp(join(tmpdir(), 'lanes-vault-roots-')))
// Transcripts live under HOME; this one's is the temporary directory.
process.env.HOME = work
const userData = join(work, 'userData')
await mkdir(userData)
globalThis.__userData = userData

let failed = 0
let held = 0
const is = (ok, what, detail = '') => {
  held++
  if (ok) return
  failed++
  console.log(`  ✗ ${what}${detail ? `\n      ${detail}` : ''}`)
}
const j = JSON.stringify

let M = null
try {
  await build({
    stdin: {
      contents:
        "export * from './src/main/sessions.ts'\n" +
        "export * from './src/main/config.ts'\n" +
        "export { refresh, threads, setLanes } from './src/main/threadIndex.ts'\n",
      resolveDir: join(here, '..'),
      loader: 'ts'
    },
    bundle: true,
    platform: 'node',
    format: 'esm',
    outfile: join(work, 'main.mjs'),
    logLevel: 'silent',
    plugins: [
      {
        name: 'electron',
        setup(b) {
          b.onResolve({ filter: /^electron$/ }, () => ({ path: 'electron', namespace: 'stand-in' }))
          b.onLoad({ filter: /.*/, namespace: 'stand-in' }, () => ({
            contents:
              'export const app = { getPath: () => globalThis.__userData }\n' +
              'export const shell = { trashItem: async () => {}, showItemInFolder() {} }\n',
            loader: 'js'
          }))
        }
      }
    ]
  })
} catch (err) {
  // The old threadIndex has no setLanes: bundled without it, the rest still says what it can.
  is(false, 'sessions, config and threadIndex bundle with setLanes', String(err.message ?? err).split('\n')[0])
  await build({
    stdin: {
      contents: "export * from './src/main/sessions.ts'\nexport * from './src/main/config.ts'\nexport { refresh, threads } from './src/main/threadIndex.ts'\n",
      resolveDir: join(here, '..'),
      loader: 'ts'
    },
    bundle: true,
    platform: 'node',
    format: 'esm',
    outfile: join(work, 'main.mjs'),
    logLevel: 'silent',
    plugins: [
      {
        name: 'electron',
        setup(b) {
          b.onResolve({ filter: /^electron$/ }, () => ({ path: 'electron', namespace: 'stand-in' }))
          b.onLoad({ filter: /.*/, namespace: 'stand-in' }, () => ({
            contents: 'export const app = { getPath: () => globalThis.__userData }\nexport const shell = {}\n',
            loader: 'js'
          }))
        }
      }
    ]
  })
}

/** A vault in the temporary directory, with these top-level folders. */
const vaultWith = async (name, folders) => {
  const v = join(work, name)
  await mkdir(v)
  for (const f of folders) await mkdir(join(v, f), { recursive: true })
  await writeFile(join(v, 'root.md'), '# Root\n')
  return v
}
const VAULT_A = await vaultWith('Vault A', ['a', 'b c', 'c++', '.hidden', '.claude/skills'])
const EMPTY = await vaultWith('Empty', [])

// The old config read LANES_VAULT as it loaded; the new one is told.
process.env.LANES_VAULT = VAULT_A
M = await import(pathToFileURL(join(work, 'main.mjs')).href)
const point = (v) => {
  if (typeof M.setVault === 'function') M.setVault(v)
  if (typeof M.refreshVaultRoots === 'function') M.refreshVaultRoots()
}

/** One transcript whose thread ran these shell commands. */
let n = 0
const transcript = (commands) => {
  const at = Date.parse('2026-10-07T10:00:00Z')
  const line = (o) => JSON.stringify({ isSidechain: false, uuid: `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`, timestamp: new Date(at + n * 1000).toISOString(), ...o })
  return [
    line({ type: 'user', message: { role: 'user', content: [{ type: 'text', text: 'Look at the notes.' }] } }),
    ...commands.map((command) =>
      line({ type: 'assistant', message: { role: 'assistant', content: [{ type: 'tool_use', id: `t${n}`, name: 'Bash', input: { command } }] } })
    ),
    line({ type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text: 'Looked.' }] } })
  ].join('\n') + '\n'
}
const touchesOf = async (commands) => {
  const file = join(work, `t-${++n}.jsonl`)
  await writeFile(file, transcript(commands))
  const st = await stat(file)
  const rec = await M.distill('5eed0000-0000-4000-8000-00000000a001', file, st.mtimeMs, st.size)
  return rec.touches.map((t) => t.path).sort()
}

/* ---------- a vault's own folders ---------- */
is(typeof M.vaultRootsPattern === 'function', 'sessions.ts builds the pattern from the vault (vaultRootsPattern)')
point(VAULT_A)
const COMMANDS = [
  "cat 'b c/x.md'",
  'ls a/',
  'cat c++/x.md',
  `cat "${VAULT_A}/a/deep/y.md"`,
  'cat .hidden/secret.md',
  'cat .claude/skills/s/SKILL.md',
  'cat zz/nowhere.md',
  'grep -n word b\\ c/escaped.md'
]
const seen = await touchesOf(COMMANDS)
for (const want of ['b c/x.md', 'a/', 'c++/x.md', 'a/deep/y.md', 'b c/escaped.md']) {
  is(seen.includes(want), `a command naming ${j(want)} touched it`, j(seen))
}
for (const not of ['.hidden/secret.md', '.claude/skills/s/SKILL.md', 'zz/nowhere.md']) {
  is(!seen.some((p) => p.startsWith(not.split('/')[0])), `${j(not)} is no vault folder’s, and touched nothing`, j(seen))
}
if (typeof M.vaultRootsPattern === 'function') {
  const re = new RegExp(`^(?:${M.vaultRootsPattern(VAULT_A)})/`)
  is(re.test('a/x') && re.test('b c/x') && re.test('c++/x'), 'the pattern holds each folder, escaped', M.vaultRootsPattern(VAULT_A))
  is(!re.test('.hidden/x') && !re.test('.claude/x') && !re.test('root.md/x'), 'and no hidden folder, and no file', M.vaultRootsPattern(VAULT_A))
}

/* ---------- an empty vault: none ---------- */
point(EMPTY)
const none = await touchesOf(COMMANDS.map((c) => c.replace(VAULT_A, EMPTY)))
is(none.length === 0, 'in a vault with no folders, no command touches anything', j(none))
if (typeof M.vaultRootsPattern === 'function') {
  const p = M.vaultRootsPattern(EMPTY)
  const re = new RegExp(`(?:${p})`)
  is(!['', 'a', 'a/x', 'x/', '/'].some((s) => re.test(s)), 'and its pattern matches nothing at all', j(p))
}

/* ---------- read again per pass: a folder made since is seen ---------- */
const LIVE = await vaultWith('Live', ['a'])
point(LIVE)
const sessions = join(work, '.claude', 'projects', LIVE.replace(/[^a-zA-Z0-9]/g, '-'))
await mkdir(sessions, { recursive: true })
const ID = '5eed0000-0000-4000-8000-00000000a002'
await writeFile(join(sessions, `${ID}.jsonl`), transcript(["cat 'd e/plan.md'", "sed -n 1,9p 'd e/plan.md'"]))
if (typeof M.setLanes === 'function') M.setLanes([{ id: 'de', name: 'D E', folder: 'd e' }])
const laneOf = async () => (await M.threads({})).find((t) => t.id === ID)?.lane ?? null
is((await laneOf()) === null, 'before the folder exists, the thread is in no lane', j(await laneOf()))
await mkdir(join(LIVE, 'd e'))
is((await laneOf()) === 'de', 'once it is made, the next pass files the unchanged transcript under its lane', j(await laneOf()))

await new Promise((r) => setTimeout(r, 100))
await rm(work, { recursive: true, force: true })

console.log(
  failed
    ? `\n${failed} of ${held} failed`
    : `all ${held} vault-roots assertions hold (a command's paths are read against the vault's own top-level folders, read again each pass)`
)
process.exit(failed ? 1 : 0)
