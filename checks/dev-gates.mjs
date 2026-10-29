// THE DEV DOORS ARE SHUT IN THE PACKAGED APP — read off the source.
//
// Lanes is driven, checked and debugged through the environment: `LANES_VAULT`
// and `LANES_STATE` move the vault and the state file, `LANES_CAPTURE_EXEC`
// runs a script in the page with the whole bridge behind it,
// `ELECTRON_RENDERER_URL` loads whatever page it names with that same bridge,
// `LANES_EXPORT_TO` writes PDFs without asking where. Every one of them was
// live in the packaged app too: anybody who could set an environment variable
// for it could point it anywhere. Red before: each was a raw `process.env`
// read, nineteen of them in five files.
//
// Now every such read goes through one helper, `devEnv` in src/main/dev.ts,
// which answers `undefined` in the packaged app — so the rule is simple enough
// to check by parsing: no `process.env.LANES_…` or `ELECTRON_RENDERER_URL` read
// anywhere in src/ but inside dev.ts, by property, by `['…']` or by
// destructuring. `LANES_CLAUDE` is the one exception, on purpose: a CLI
// installed somewhere unusual is a real user's need, not a developer's.
//
// And the helper's own question — is this the packaged app? — is asked the way
// electron's `app.isPackaged` asks it, by the executable's name, and is proved
// here on the names it will meet. dev.ts may not import electron: notes.ts and
// vaultChooser.ts read their switches through it, and the node checks bundle
// both without one.
//
//   node --experimental-strip-types checks/dev-gates.mjs
import ts from 'typescript'
import { existsSync } from 'node:fs'
import { readFile, readdir } from 'node:fs/promises'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
const src = join(root, 'src')
const HELPER = 'src/main/dev.ts'

let pass = 0
let fail = 0
const ok = (name, good, detail = '') => {
  if (good) pass += 1
  else {
    fail += 1
    console.log(`  FAIL ${name}${detail ? `\n       ${detail}` : ''}`)
  }
}

const gated = (name) => name.startsWith('LANES_') || name === 'ELECTRON_RENDERER_URL'
const excepted = (name) => name === 'LANES_CLAUDE'
const isProcessEnv = (n) =>
  ts.isPropertyAccessExpression(n) && n.name.text === 'env' && ts.isIdentifier(n.expression) && n.expression.text === 'process'

async function* files(dir) {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name)
    if (e.isDirectory()) yield* files(p)
    else if (/\.(ts|tsx|js|mjs|cjs|jsx)$/.test(e.name)) yield p
  }
}

const raw = []
const kept = []
let scanned = 0
for await (const file of files(src)) {
  scanned += 1
  const rel = relative(root, file)
  const text = await readFile(file, 'utf8')
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS)
  const read = (node, name) => {
    const { line } = sf.getLineAndCharacterOfPosition(node.getStart(sf))
    const where = `${rel}:${line + 1} ${name}`
    if (excepted(name)) kept.push(where)
    else if (rel !== HELPER) raw.push(where)
  }
  const visit = (node) => {
    // process.env.LANES_X
    if (ts.isPropertyAccessExpression(node) && isProcessEnv(node.expression) && gated(node.name.text)) read(node, node.name.text)
    // process.env['LANES_X']
    if (
      ts.isElementAccessExpression(node) &&
      isProcessEnv(node.expression) &&
      ts.isStringLiteralLike(node.argumentExpression) &&
      gated(node.argumentExpression.text)
    ) {
      read(node, node.argumentExpression.text)
    }
    // const { LANES_X } = process.env
    if (ts.isVariableDeclaration(node) && node.initializer && isProcessEnv(node.initializer) && ts.isObjectBindingPattern(node.name)) {
      for (const el of node.name.elements) {
        const name = (el.propertyName ?? el.name).getText(sf)
        if (gated(name)) read(el, name)
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(sf)
}
ok(`the source is there to read (${scanned} files)`, scanned > 50)
ok(
  'every LANES_* and ELECTRON_RENDERER_URL read goes through devEnv',
  raw.length === 0,
  raw.length ? `raw reads:\n         ${raw.join('\n         ')}` : ''
)
ok('LANES_CLAUDE is read where the CLI is found, and only there', kept.every((w) => w.startsWith('src/main/which.ts:')), kept.join(', '))

/* ---------- swap.sh, started with nothing of the app's environment ---------- */
// build/swap.sh reads switches of its own — LANES_SWAP_OPEN runs what it
// names in place of `open`, LANES_SWAP_NOTIFY in place of the notification,
// LANES_SWAP_LOG writes where it says — for checks/swap.mjs, which runs the
// script itself. A shell script is out of devEnv's reach, so the door is shut
// where the packaged app starts it (src/main/update.ts, the only place): with
// an environment of its own, a PATH and a HOME, and nothing spread into it.
// Red before: it was started with the app's whole environment.
{
  const UPDATE = 'src/main/update.ts'
  const text = await readFile(join(root, UPDATE), 'utf8')
  const sf = ts.createSourceFile(UPDATE, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
  const starts = []
  const visit = (node) => {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && /^(spawn|spawnSync|exec|execSync|execFile|execFileSync|fork)$/.test(node.expression.text)) {
      starts.push(node)
    }
    ts.forEachChild(node, visit)
  }
  visit(sf)
  const at = (n) => `${UPDATE}:${sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1}`
  const ALLOWED = new Set(['PATH', 'HOME'])
  const unclean = starts.flatMap((call) => {
    const opts = call.arguments.find((a) => ts.isObjectLiteralExpression(a))
    const env = opts?.properties.find((p) => ts.isPropertyAssignment(p) && p.name.getText(sf) === 'env')
    if (!env) return [`${at(call)}: no env of its own`]
    if (!ts.isObjectLiteralExpression(env.initializer)) return [`${at(call)}: env is not spelled out`]
    return env.initializer.properties
      .filter((p) => !(ts.isPropertyAssignment(p) && ALLOWED.has(p.name.getText(sf))))
      .map((p) => `${at(call)}: env carries ${p.getText(sf)}`)
  })
  ok('update.ts starts swap.sh', starts.length > 0)
  ok('with a PATH and a HOME and nothing of its own environment', unclean.length === 0, unclean.join('\n       '))
  ok('and reads nothing of process.env', !/process\.env/.test(text))
}

/* ---------- the helper itself ---------- */

const helper = join(root, HELPER)
ok(`${HELPER} exists`, existsSync(helper))
if (existsSync(helper)) {
  const text = await readFile(helper, 'utf8')
  ok('dev.ts does not import electron', !/from\s+['"]electron['"]|require\(\s*['"]electron['"]\s*\)/.test(text))
  const { packaged, devEnv, DEV } = await import(pathToFileURL(helper).href)
  ok(
    'the packaged app is packaged',
    packaged('/Applications/Lanes.app/Contents/MacOS/Lanes', '43.4.1', 'darwin'),
    'Lanes.app/Contents/MacOS/Lanes read as a development run'
  )
  ok(
    'electron-vite dev is not',
    !packaged('/x/node_modules/electron/dist/Electron.app/Contents/MacOS/Electron', '43.4.1', 'darwin')
  )
  ok('nor is the stock binary on Linux', !packaged('/x/node_modules/electron/dist/electron', '43.4.1', 'linux'))
  ok('on Windows the name has .exe', packaged('C:\\Lanes\\Lanes.exe', '43.4.1', 'win32') && !packaged('C:\\e\\electron.exe', '43.4.1', 'win32'))
  ok('nor is plain node — a check, bundling main', !packaged('/usr/local/bin/node', undefined, 'darwin'))
  ok('this run is a development run', DEV === true)
  process.env.LANES_DEV_GATES_PROBE = 'here'
  ok('in a development run devEnv reads through', devEnv('LANES_DEV_GATES_PROBE') === 'here')
}

console.log(`dev-gates: ${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
