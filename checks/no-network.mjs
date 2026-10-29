// LANES MAKES NO NETWORK CALLS — read off the source, and off the page's policy.
//
// The claim is the README's, and it is unconditional: the app talks to the
// `claude` CLI on this Mac and to the files in the vault, and to nothing else.
// The CLI makes its own calls; the app never does. Two fences hold it:
//
//  - MAIN has no policy around it, so its code is the fence. Every source file
//    in src/ is parsed (TypeScript's own parser — comments and strings are not
//    code, so an `https://` in a sentence or a user-visible link is not a call)
//    and none may import a network module (`http`, `https`, `http2`, `net`,
//    `tls`, `dgram`, `dns`, `undici`, `ws`, `axios`, `node-fetch`), take
//    electron's `net`, `autoUpdater` or `crashReporter`, or name a network
//    API: `fetch`, `XMLHttpRequest`, `WebSocket`, `EventSource`, `sendBeacon`,
//    `RTCPeerConnection`, `WebTransport`, `downloadURL`.
//  - THE PAGE has its Content-Security-Policy (src/renderer/index.html): no
//    source in it names a remote host or a network scheme, and it closes
//    what `default-src` does not reach — `object-src`, `frame-src`,
//    `base-uri` and `form-action` are `'none'`. `connect-src` is left to fall
//    back to `default-src 'self'`, which is what lets Vite's own socket work
//    in development and nothing else. Red before: the four were not there.
//
//   node checks/no-network.mjs
import ts from 'typescript'
import { readFile, readdir } from 'node:fs/promises'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
const src = join(root, 'src')

let pass = 0
let fail = 0
const ok = (name, good, detail = '') => {
  if (good) pass += 1
  else {
    fail += 1
    console.log(`  FAIL ${name}${detail ? `\n       ${detail}` : ''}`)
  }
}

/* ---------- the code ---------- */

const MODULES = new Set(['http', 'https', 'http2', 'net', 'tls', 'dgram', 'dns', 'dns/promises', 'undici', 'ws', 'axios', 'node-fetch'])
const ELECTRON = new Set(['net', 'autoUpdater', 'crashReporter', 'netLog'])
const APIS = new Set([
  'fetch',
  'XMLHttpRequest',
  'WebSocket',
  'EventSource',
  'sendBeacon',
  'RTCPeerConnection',
  'WebTransport',
  'downloadURL',
  'autoUpdater',
  'crashReporter'
])
const network = (spec) => MODULES.has(spec.replace(/^node:/, ''))

async function* files(dir) {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name)
    if (e.isDirectory()) yield* files(p)
    else if (/\.(ts|tsx|js|mjs|cjs|jsx)$/.test(e.name)) yield p
  }
}

const hits = []
let scanned = 0
for await (const file of files(src)) {
  scanned += 1
  const text = await readFile(file, 'utf8')
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS)
  const at = (node, what) => {
    const { line } = sf.getLineAndCharacterOfPosition(node.getStart(sf))
    hits.push(`${relative(root, file)}:${line + 1} ${what}`)
  }
  const visit = (node) => {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
      const spec = node.moduleSpecifier.text
      if (network(spec)) at(node, `imports '${spec}'`)
      if (spec === 'electron' && ts.isImportDeclaration(node)) {
        const named = node.importClause?.namedBindings
        if (named && ts.isNamedImports(named)) {
          for (const el of named.elements) {
            const name = (el.propertyName ?? el.name).text
            if (ELECTRON.has(name)) at(el, `takes electron's '${name}'`)
          }
        }
      }
    }
    if (ts.isCallExpression(node) && node.arguments.length && ts.isStringLiteral(node.arguments[0])) {
      const callee = node.expression
      const loads = callee.kind === ts.SyntaxKind.ImportKeyword || (ts.isIdentifier(callee) && callee.text === 'require')
      if (loads && network(node.arguments[0].text)) at(node, `loads '${node.arguments[0].text}'`)
    }
    if (ts.isIdentifier(node) && APIS.has(node.text)) at(node, `names ${node.text}`)
    if (ts.isPropertyAccessExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'electron' && ELECTRON.has(node.name.text)) {
      at(node, `reaches electron.${node.name.text}`)
    }
    ts.forEachChild(node, visit)
  }
  visit(sf)
}
ok(`the source is there to read (${scanned} files)`, scanned > 50)
ok('no network API anywhere in src/', hits.length === 0, hits.join('\n       '))

/* ---------- the page's policy ---------- */

const html = await readFile(join(src, 'renderer/index.html'), 'utf8')
const meta = html.match(/http-equiv="Content-Security-Policy"\s+content="([^"]*)"/i)
ok('the page carries a Content-Security-Policy', Boolean(meta))
const policy = new Map()
for (const part of (meta?.[1] ?? '').split(';')) {
  const [name, ...sources] = part.trim().split(/\s+/)
  if (name) policy.set(name.toLowerCase(), sources)
}
const says = (name) => JSON.stringify(policy.get(name) ?? null)
ok("default-src is 'self'", says('default-src') === JSON.stringify(["'self'"]), `default-src ${says('default-src')}`)
ok("script-src is 'self'", says('script-src') === JSON.stringify(["'self'"]), `script-src ${says('script-src')}`)
for (const name of ['object-src', 'frame-src', 'base-uri', 'form-action']) {
  ok(`${name} is 'none'`, says(name) === JSON.stringify(["'none'"]), `${name} ${says(name)}`)
}
ok("connect-src falls back to default-src", !policy.has('connect-src') || says('connect-src') === JSON.stringify(["'self'"]), `connect-src ${says('connect-src')}`)
// No source anywhere in it reaches off this machine: no host, no wildcard, no
// network scheme. `data:` (images carried inline) and the quoted keywords are
// the only things a source may be besides 'self'.
const remote = []
for (const [name, sources] of policy) {
  for (const s of sources) {
    if (/^'[\w-]+'$/.test(s) || s === 'data:' || s === 'blob:') continue
    remote.push(`${name} ${s}`)
  }
}
ok('no remote source in the policy', remote.length === 0, remote.join(', '))

console.log(`no-network: ${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
