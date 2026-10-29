// THE KEYS THAT CHANGE MARKS NEVER LEAVE ONE ON THE PAGE — over lines nobody
// chose to pass.
//
// ⌘B and ⌘I, a selection deleted or typed over, and ⇧⌥ run into a phrase from
// outside it: each of these takes marks as well as words, and each used to
// leave stars, brackets or a URL on the page — `**bold **whole** words**`,
// `See **alpha data x` with the phrase left open, `See](https://e.com)`. The
// driven checks press them on a few lines; this presses them on tens of
// thousands of random ones, made of READ's own tokens — bold and italic
// phrases, code, links, wikilinks with and without a title — and holds each
// press to what READ will show afterwards:
//
//  - ⌘B / ⌘I: the words READ shows are the same words, in the same order. Only
//    the marks may change — or, on a caret with no word under it, the empty
//    pair put down to type into.
//  - A selection deleted (⌫ or ⌦) or typed over — within a line, or across two
//    or three: READ shows exactly the words that were not selected, and what was
//    typed where the selection's first seen letter was — nothing more, nothing
//    less, no mark on its own.
//  - ⇧⌥← / ⇧⌥→ from a caret outside every token, once to three times, then ⌫,
//    ⌦ or a letter: no stray `*`, `[`, `]`, backtick or URL on the page.
//  - ⌘B / ⌘I over a selection of two or three lines: every line shows the same
//    words it did (red: one pair around all of it, `**- milk\n**- eggs`).
//  - ↵ anywhere in a line — in a phrase, at its edge, inside one of its marks:
//    the two lines show the words the one did, and no mark on its own (red:
//    `**bold ` over `words**`, the stars on both lines).
//  - A paste — of a line break, of marks of its own, or both — at a caret or
//    over a selection: READ shows the words left and the pasted text's own,
//    where the caret or the selection was, and no mark on its own.
//  - ⌘X and ⌘V straight back: READ shows what it showed before (red: the
//    copied `**` pasted back as a stray pair).
//  - Text dragged to somewhere else on the line: READ shows the same letters —
//    none lost, none added — and no mark on its own, at either end of the move
//    (red: the source's half of a pair left behind).
//
// And COMMENTS among the tokens — `{==words==}{>>a comment<<}`, a comment at a
// point, a highlight with none, an anchor round a bold phrase — each with words
// of its own, so it can be followed through every one of the presses above
// and two of its own: the word keys from a caret, once, and keys at a
// comment's edges and in its words. Whatever the press, no comment is ever
// left in part — its words changed from outside them, or a mark of it left on
// the page; one that was anchored stays anchored, and if its anchor's last
// shown word went, it went with it; and none goes but one the press covered
// (red: an anchor's words cut and its comment left about nothing; ⌫ against a
// comment taking its last mark; ⌥⌦ before a comment that ends its line taking
// `{>>` as punctuation; a paste of review marks nesting one anchor in another;
// typed words over a selection that began in a comment landing in it).
//
// Runs the editor's own `src/renderer/src/lib/editorLive.ts` — its keymap, its
// filters, its input handlers — bundled for node, over a stand-in view that
// supplies what layout would (every line visible, no wrapping). Seeded, so a
// failure is the same failure on the next run.
//
//   node checks/edit-fuzz.mjs
import { build } from 'esbuild'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const work = await mkdtemp(join(tmpdir(), 'lanes-edit-fuzz-'))
const entry = join(work, 'entry.ts')
const live = join(here, '../src/renderer/src/lib/editorLive.ts')
await import('node:fs/promises').then((fs) =>
  fs.writeFile(
    entry,
    [
      `export * from ${JSON.stringify(live)}`,
      `export * as md from ${JSON.stringify(join(here, '../src/shared/mdLive.ts'))}`,
      `export * as cm from ${JSON.stringify(join(here, '../src/shared/comments.ts'))}`,
      "export { EditorState, EditorSelection, Transaction } from '@codemirror/state'",
      "export { EditorView, BidiSpan, Direction, runScopeHandlers } from '@codemirror/view'"
    ].join('\n')
  )
)
await build({
  entryPoints: [entry],
  bundle: true,
  platform: 'node',
  format: 'esm',
  outfile: join(work, 'live.mjs'),
  logLevel: 'error',
  nodePaths: [join(here, '../node_modules')],
  plugins: [
    {
      // The drawing, handed out for the stand-in view's use: the marks it puts
      // away are what the word keys step over. Test-only, added to the bundle
      // here and nowhere else.
      name: 'draw',
      setup(b) {
        b.onLoad({ filter: /editorLive\.ts$/ }, async (a) => ({
          contents: (await readFile(a.path, 'utf8')) + '\nexport const __draw = draw\n',
          loader: 'ts'
        }))
      }
    }
  ]
})

// What the module wants of a page, at the moment it builds its extensions.
const el = () => ({ style: {}, setAttribute() {}, appendChild() {}, dataset: {}, classList: { toggle() {}, remove() {} }, blur() {} })
globalThis.document ??= { body: el(), documentElement: { style: {} }, createElement: el }
globalThis.window ??= { addEventListener() {}, removeEventListener() {}, open() {} }
const B = await import(pathToFileURL(join(work, 'live.mjs')).href)
const { EditorState, EditorSelection, EditorView, BidiSpan, Direction, md, cm, liveMarkdown, __draw } = B
/** What ⌘C and ⌘X put on the clipboard, through the editor's own filter. */
const copied = (v) => {
  const r = v.state.selection.main
  let t = v.state.sliceDoc(r.from, r.to)
  for (const f of v.state.facet(EditorView.clipboardOutputFilter)) t = f(t, v.state)
  return t
}
/** A paste, as the page's paste reaches the editor. */
const paste = (v, text) => v.dispatch(v.state.update(v.state.replaceSelection(text), { userEvent: 'input.paste' }))
const hooks = { exitTop() {}, follow() {}, href() {}, notes: async () => [], resolve: async () => null, escape() {} }

/** A view over `src`, `¦` the caret or `⟦ ⟧` a selection, with focus. */
function mk(src) {
  let doc = src
  let sel
  if (doc.includes('¦')) {
    const at = doc.indexOf('¦')
    doc = doc.replace('¦', '')
    sel = EditorSelection.cursor(at)
  } else {
    const a = doc.indexOf('⟦')
    doc = doc.replace('⟦', '')
    const b = doc.indexOf('⟧')
    doc = doc.replace('⟧', '')
    sel = EditorSelection.range(a, b)
  }
  let st = EditorState.create({ doc, selection: sel, extensions: [liveMarkdown(hooks)] })
  const content = { blur() {} }
  const v = Object.create(EditorView.prototype)
  Object.defineProperties(v, {
    state: { get: () => st, configurable: true },
    visibleRanges: { get: () => [{ from: 0, to: st.doc.length }], configurable: true },
    root: { value: { activeElement: content }, configurable: true },
    contentDOM: { value: content, configurable: true },
    dom: { value: el(), configurable: true },
    hasFocus: { value: true, configurable: true }
  })
  v.dispatch = (...input) => {
    const trs = input.length === 1 && input[0] instanceof B.Transaction ? input : [st.update(...input)]
    for (const tr of trs) st = tr.state
  }
  let drawn = null
  v.plugin = () => {
    if (!drawn || drawn.st !== st) drawn = { st, hidden: __draw(v).hidden }
    return { hidden: drawn.hidden }
  }
  v.bidiSpans = (line) => [new BidiSpan(0, line.length, 0)]
  v.textDirectionAt = () => Direction.LTR
  v.moveToLineBoundary = (r, forward) => {
    const line = st.doc.lineAt(r.head)
    return EditorSelection.cursor(forward ? line.to : line.from, forward ? -1 : 1)
  }
  return v
}
const CODES = { Backspace: 8, Delete: 46, ArrowLeft: 37, ArrowRight: 39 }
/** A key through the editor's own keymap, as its keydown handler runs it. */
const key = (v, k, mods = {}) =>
  B.runScopeHandlers(
    v,
    {
      type: 'keydown',
      key: k,
      keyCode: CODES[k] ?? k.toUpperCase().charCodeAt(0),
      altKey: false,
      ctrlKey: false,
      metaKey: false,
      shiftKey: false,
      ...mods,
      preventDefault() {},
      stopPropagation() {}
    },
    'editor'
  )
/** Typed over whatever is selected, as the page's input reaches the editor. */
const typeOver = (v, text) => v.dispatch(v.state.update(v.state.replaceSelection(text), { userEvent: 'input.type' }))

// Lines of READ's own tokens, seeded.
let seed = 0x1a2e5 >>> 0
const rnd = (n) => {
  seed = (seed + 0x6d2b79f5) >>> 0
  let t = seed
  t = Math.imul(t ^ (t >>> 15), t | 1)
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
  return ((t ^ (t >>> 14)) >>> 0) % n
}
const pick = (a) => a[rnd(a.length)]
const WORDS = ['alpha', 'be', 'c', 'data', 'x1', 'über']
/** A comment's words, never the same twice, so one can be followed through an edit. */
let said = 0
const say = () => `n${(said += 1)}${rnd(2) ? ' ' + pick(WORDS) : ''}`
const piece = () => {
  const w = () => Array.from({ length: 1 + rnd(3) }, () => pick(WORDS)).join(' ')
  switch (rnd(14)) {
    case 12:
      return `==${w()}==`
    case 13:
      return rnd(2) ? `==**${w()}** ${w()}==` : `==${w()} {==${w()}==}{>>${say()}<<}==`
    case 9:
      return `{==${w()}==}{>>${say()}<<}`
    case 10:
      return `{>>${say()}<<}`
    case 11:
      return rnd(2) ? `{==${w()}==}` : `{==**${w()}**==}{>>${say()}<<}`
    case 0:
      return `**${w()}**`
    case 1:
      return `*${w()}*`
    case 2:
      return '`' + pick(WORDS) + '`'
    case 3:
      return `[[${pick(['a/b', 'note'])}${rnd(2) ? '|' + w() : ''}]]`
    case 4:
      return `[${w()}](https://e.com/${pick(WORDS)})`
    case 5:
      return pick(['.', ',', '—', ':'])
    default:
      return pick(WORDS)
  }
}
const line = () => {
  let s = ''
  const n = 2 + rnd(6)
  for (let i = 0; i < n; i++) s += piece() + (rnd(4) ? ' ' : '')
  return s.trimEnd()
}
/** For each character of `text`: is it a mark READ draws as nothing? */
const marksIn = (text) => {
  const m = new Array(text.length).fill(false)
  const walk = (ts) => {
    for (const t of ts) {
      const put = (a, b) => {
        for (let i = a; i < b; i++) m[i] = true
      }
      if (t.k === 'bold') put(t.from, t.from + 2), put(t.to - 2, t.to), walk(t.inner)
      else if (t.k === 'italic') put(t.from, t.from + 1), put(t.to - 1, t.to), walk(t.inner)
      else if (t.k === 'code') put(t.from, t.from + 1), put(t.to - 1, t.to)
      else if (t.k === 'link') put(t.from, t.from + 1), put(t.textTo, t.to), walk(t.inner)
      else if (t.k === 'wiki') put(t.from, t.label[0]), put(t.label[1], t.to)
      else if (t.k === 'anchor') put(t.from, t.from + 3), put(t.to - 3, t.to), walk(t.inner)
      else if (t.k === 'highlight') put(t.from, t.from + 2), put(t.to - 2, t.to), walk(t.inner)
      // A comment is not seen at all: its words are not the line's.
      else if (t.k === 'comment') put(t.from, t.to)
    }
  }
  walk(md.inlineTokens(text, 0))
  return m
}
const shown = (s) => md.shownText(s)
const squash = (s) => s.replace(/\s+/g, ' ')
const marksOnLines = (text) => {
  const out = []
  for (const ln of text.split('\n')) out.push(...marksIn(ln), false)
  out.pop()
  return out
}

/*
 * THE COMMENTS, through an edit. Each is followed by its own words, which no
 * other comment shares. Whatever the edit, none is ever left in part — its
 * words changed by a key that was not in them, or a mark of it left on the page
 * — and one that was anchored stays anchored: if its anchor's words all went,
 * it went with them. `took` says which may go, given what the edit covered.
 */
/** Every comment in `text`, line by line as the editor reads them, at its offset in the whole. */
const notesOf = (text) => {
  let at = 0
  return text.split('\n').flatMap((ln) => {
    const base = at
    at += ln.length + 1
    return cm.findComments(ln).map((c) => ({
      ...c,
      from: c.from + base,
      to: c.to + base,
      anchor: c.anchor && { ...c.anchor, from: c.anchor.from + base, to: c.anchor.to + base }
    }))
  })
}
const stray = (text) => /\{>>|<<\}/.test(text.split('\n').map(shown).join('\n'))
const keptComments = (what, src, before, after, took = () => false, brought = '') => {
  // What a paste or a drop brought with it is its own, and may land anywhere.
  const was = new Map([...notesOf(brought), ...notesOf(before)].map((c) => [c.text, c]))
  const now = notesOf(after)
  for (const c of now) {
    const w = was.get(c.text)
    if (!w) return miss(`${what} left a comment in part`, `${JSON.stringify(src)} → ${JSON.stringify(after)}; ${JSON.stringify(c.text)}`)
    if (w.anchor && !c.anchor) return miss(`${what} took a comment's anchor and left the comment`, `${JSON.stringify(src)} → ${JSON.stringify(after)}; ${JSON.stringify(c.text)}`)
  }
  const left = new Set(now.map((c) => c.text))
  for (const w of was.values())
    if (!left.has(w.text) && !took(w)) return miss(`${what} took a comment it did not cover`, `${JSON.stringify(src)} → ${JSON.stringify(after)}; ${JSON.stringify(w.text)}`)
  if (stray(after) && !stray(before)) miss(`${what} left a comment's mark on the page`, `${JSON.stringify(src)} → ${JSON.stringify(after)}`)
}
/** May go: covered whole by `[x, y)`, every shown letter of its anchor in it, or an end of it fell inside the comment. */
const coveredBy = (x, y, text) => (c) => {
  if ((c.from >= x && c.to <= y) || (x > c.from && x < c.to) || (y > c.from && y < c.to)) return true
  if (!c.anchor) return false
  const m = marksOnLines(text)
  let any = false
  for (let i = c.anchor.from + 3; i < c.anchor.to - 3; i++) {
    if (m[i] || /\s/.test(text[i])) continue
    any = true
    if (i < x || i >= y) return false
  }
  return any
}

let failed = 0
const fails = []
const tally = new Map()
const miss = (what, detail) => {
  failed++
  tally.set(what, (tally.get(what) ?? 0) + 1)
  if (fails.length < 8 || (process.env.FUZZ_SHOW && fails.length < 40 && what.includes(process.env.FUZZ_SHOW)))
    fails.push(`  ✗ ${what}\n      ${detail}`)
}

/* ---------- ⌘B and ⌘I ---------- */
let wrapped = 0
for (let t = 0; t < 20000; t++) {
  const text = line()
  const a = rnd(text.length + 1)
  const b = rnd(3) ? a : Math.min(text.length, a + rnd(12))
  const src = text.slice(0, a) + (a === b ? '¦' : '⟦' + text.slice(a, b) + '⟧') + text.slice(b)
  const v = mk(src)
  const k = rnd(2) ? 'b' : 'i'
  key(v, k, { metaKey: true })
  const after = v.state.doc.toString()
  wrapped++
  const pair = k === 'b' ? '****' : '**'
  const typedInto = a === b && after === text.slice(0, a) + pair + text.slice(a)
  if (shown(after) !== shown(text) && !typedInto)
    miss(`⌘${k.toUpperCase()} changed what READ shows`, `${JSON.stringify(src)} → ${JSON.stringify(after)}`)
  // The pair put down to type into is the one thing that may read as something
  // else until it is typed into.
  if (!typedInto) keptComments(`⌘${k.toUpperCase()}`, src, text, after)
}

/* ---------- a selection deleted or typed over ---------- */
let selected = 0
for (let t = 0; t < 20000; t++) {
  const text = line()
  let x = rnd(text.length)
  let y = rnd(text.length + 1)
  if (x === y) continue
  if (x > y) [x, y] = [y, x]
  const m = marksIn(text)
  let seen = false
  for (let i = x; i < y && !seen; i++) seen = !m[i]
  if (!seen) continue
  const v = mk(text.slice(0, x) + '⟦' + text.slice(x, y) + '⟧' + text.slice(y))
  const how = rnd(3)
  const typed = how === 2 ? 'Z' : ''
  if (how === 0) key(v, 'Backspace')
  else if (how === 1) key(v, 'Delete')
  else typeOver(v, typed)
  selected++
  let want = ''
  let put = false
  for (let i = 0; i < text.length; i++) {
    if (m[i]) continue
    if (i >= x && i < y) {
      if (!put) want += typed
      put = true
      continue
    }
    want += text[i]
  }
  const after = v.state.doc.toString()
  keptComments(['⌫', '⌦', 'typing'][how] + ' over a selection', text.slice(0, x) + '⟦' + text.slice(x, y) + '⟧' + text.slice(y), text, after, coveredBy(x, y, text))
  // A space may move across a mark, never appear or go.
  if (squash(shown(after)) !== squash(want))
    miss(
      `${['⌫', '⌦', 'typing'][how]} over a selection left READ showing something else`,
      `${JSON.stringify(text.slice(0, x) + '⟦' + text.slice(x, y) + '⟧' + text.slice(y))} → ${JSON.stringify(after)}; READ ${JSON.stringify(shown(after))}, wanted ${JSON.stringify(want)}`
    )
}

/* ---------- the same, across lines ---------- */
let across = 0
const shownLines = (text) => text.split('\n').map(shown).join('\n')
for (let t = 0; t < 10000; t++) {
  const text = Array.from({ length: 2 + rnd(2) }, line).join('\n')
  let x = rnd(text.length)
  let y = rnd(text.length + 1)
  if (x > y) [x, y] = [y, x]
  if (!text.slice(x, y).includes('\n')) continue
  const m = marksOnLines(text)
  let seen = false
  for (let i = x; i < y && !seen; i++) seen = !m[i]
  if (!seen) continue
  const v = mk(text.slice(0, x) + '⟦' + text.slice(x, y) + '⟧' + text.slice(y))
  const how = rnd(3)
  const typed = how === 2 ? 'Z' : ''
  if (how === 0) key(v, 'Backspace')
  else if (how === 1) key(v, 'Delete')
  else typeOver(v, typed)
  across++
  let want = ''
  let put = false
  for (let i = 0; i < text.length; i++) {
    if (m[i]) continue
    if (i >= x && i < y) {
      if (!put) want += typed
      put = true
      continue
    }
    want += text[i]
  }
  const after = v.state.doc.toString()
  keptComments(['⌫', '⌦', 'typing'][how] + ' across lines', text.slice(0, x) + '⟦' + text.slice(x, y) + '⟧' + text.slice(y), text, after, coveredBy(x, y, text))
  if (squash(shownLines(after)) !== squash(want))
    miss(
      `${['⌫', '⌦', 'typing'][how]} over a selection across lines left READ showing something else`,
      `${JSON.stringify(text.slice(0, x) + '⟦' + text.slice(x, y) + '⟧' + text.slice(y))} → ${JSON.stringify(after)}`
    )
}

/* ---------- ⌘B and ⌘I across lines ---------- */
let wrappedLines = 0
for (let t = 0; t < 6000; t++) {
  const text = Array.from({ length: 2 + rnd(2) }, line).join('\n')
  let x = rnd(text.length)
  let y = rnd(text.length + 1)
  if (x > y) [x, y] = [y, x]
  if (!text.slice(x, y).includes('\n')) continue
  const v = mk(text.slice(0, x) + '⟦' + text.slice(x, y) + '⟧' + text.slice(y))
  key(v, rnd(2) ? 'b' : 'i', { metaKey: true })
  wrappedLines++
  const after = v.state.doc.toString()
  keptComments('⌘B/⌘I across lines', text.slice(0, x) + '⟦' + text.slice(x, y) + '⟧' + text.slice(y), text, after)
  if (shownLines(after) !== shownLines(text))
    miss('⌘B/⌘I across lines changed what READ shows', `${JSON.stringify(text.slice(0, x) + '⟦' + text.slice(x, y) + '⟧' + text.slice(y))} → ${JSON.stringify(after)}`)
}

/* ---------- ↵ anywhere ---------- */
let broken = 0
for (let t = 0; t < 8000; t++) {
  const text = line()
  const at = 1 + rnd(Math.max(1, text.length - 1))
  const v = mk(text.slice(0, at) + '¦' + text.slice(at))
  key(v, 'Enter')
  broken++
  const after = v.state.doc.toString()
  keptComments('↵', text.slice(0, at) + '¦' + text.slice(at), text, after)
  const got = shownLines(after)
  if (got.replace(/\s+/g, '') !== shown(text).replace(/\s+/g, '') || /[*[\]`]|==/.test(got) || after.split('\n').length !== 2)
    miss('↵ left READ showing something else, or a mark on its own', `${JSON.stringify(text.slice(0, at) + '¦' + text.slice(at))} → ${JSON.stringify(after)}; READ ${JSON.stringify(got)}`)
}

/* ---------- a paste of breaks or marks, at a caret or over a selection ---------- */
let pasted = 0
for (let t = 0; t < 12000; t++) {
  const text = line()
  let x = rnd(text.length + 1)
  let y = rnd(4) ? x : rnd(text.length + 1)
  if (x > y) [x, y] = [y, x]
  const m = marksIn(text)
  let seen = x === y
  for (let i = x; i < y && !seen; i++) seen = !m[i]
  if (!seen) continue
  // Inside a mark, a caret has nowhere READ would call a place: left out.
  if (x === y && x > 0 && x < text.length && m[x - 1] && m[x]) continue
  const clip = rnd(2) ? `${pick(WORDS)}\n${pick(WORDS)}` : piece() + ' ' + piece() + (rnd(2) ? '\n' + piece() : '')
  // Text an anchor or a comment cannot hold — a line break, review marks of its
  // own — is put after the pair, or in front of the anchor from the start of its
  // words, rather than splitting either. Over a selection reaching into one,
  // where it lands is the selection's taking first: not worked out here.
  const anchors = []
  const walkA = (ts) => ts.forEach((t, i) => {
    if (t.k === 'anchor') anchors.push({ t, c: ts[i + 1]?.k === 'comment' && ts[i + 1].from === t.to ? ts[i + 1] : null })
    if (t.inner) walkA(t.inner)
  })
  walkA(md.inlineTokens(text, 0))
  const breaks = clip.includes('\n') || /\{==|==\}|\{>>|<<\}/.test(clip)
  const inPair = (p) => anchors.some(({ t, c }) => (t.from < p && p < t.to) || (c && p > t.to - 1 && p < c.to)) || notesOf(text).some((c) => c.from < p && p < c.to)
  if (breaks && x !== y && (inPair(x) || inPair(y))) continue
  if (breaks && x === y) {
    for (const { t, c } of anchors) {
      if (t.from < x && x < t.to) x = y = !text.slice(t.from + 3, x).trim() ? t.from : (c ? c.to : t.to)
      else if (c && x === t.to) x = y = c.to
    }
    for (const c of notesOf(text)) if (c.from < x && x < c.to) x = y = c.to
  }
  const v = mk(text.slice(0, x) + (x === y ? '¦' : '⟦' + text.slice(x, y) + '⟧') + text.slice(y))
  paste(v, clip)
  pasted++
  keptComments('a paste', text.slice(0, x) + (x === y ? '¦' : '⟦' + text.slice(x, y) + '⟧') + text.slice(y), text, v.state.doc.toString(), coveredBy(x, y, text), clip)
  // The seen text outside the selection, with the clip's own seen text where
  // the selection's first seen letter was.
  let want = ''
  let put = false
  const insert = () => {
    if (!put) want += shownLines(clip)
    put = true
  }
  for (let i = 0; i < text.length; i++) {
    if (i === x) insert()
    if (m[i]) continue
    if (i >= x && i < y) continue
    want += text[i]
  }
  insert()
  const after = v.state.doc.toString()
  if (squash(shownLines(after)).replace(/ ?\n ?/g, '\n') !== squash(want).replace(/ ?\n ?/g, '\n'))
    miss(
      'a paste left READ showing something else',
      `${JSON.stringify(text.slice(0, x) + (x === y ? '¦' : '⟦' + text.slice(x, y) + '⟧') + text.slice(y))} + ${JSON.stringify(clip)} → ${JSON.stringify(after)}; READ ${JSON.stringify(shownLines(after))}, wanted ${JSON.stringify(want)}`
    )
}

/* ---------- ⌘X, and ⌘V straight back ---------- */
let roundTrips = 0
for (let t = 0; t < 8000; t++) {
  const text = line()
  let x = rnd(text.length)
  let y = rnd(text.length + 1)
  if (x === y) continue
  if (x > y) [x, y] = [y, x]
  const m = marksIn(text)
  let seen = false
  for (let i = x; i < y && !seen; i++) seen = !m[i]
  if (!seen) continue
  const v = mk(text.slice(0, x) + '⟦' + text.slice(x, y) + '⟧' + text.slice(y))
  const clip = copied(v)
  v.dispatch(v.state.update({ changes: { from: x, to: y }, userEvent: 'delete.cut' }))
  paste(v, clip)
  roundTrips++
  const after = v.state.doc.toString()
  // Not from inside a review mark: the caret is there only with the marks out,
  // and then they are characters like any other.
  // Nor from the edge of an anchor's words — nothing but marks between there
  // and the anchor's own — where the caret has those marks out too.
  const mk2 = marksOnLines(text)
  const onlyMarks = (i, j) => {
    for (let k = i; k < j; k++) if (!mk2[k]) return false
    return true
  }
  const inMark = (p) =>
    notesOf(text).some(
      (c) =>
        (p > c.from && p < c.to) ||
        (c.anchor && p > c.anchor.from && p < c.anchor.to && (onlyMarks(c.anchor.from, p) || onlyMarks(p, c.anchor.to)))
    )
  if (!inMark(x) && !inMark(y))
    keptComments('⌘X and ⌘V back', text.slice(0, x) + '⟦' + text.slice(x, y) + '⟧' + text.slice(y), text, after, () => false)
  if (squash(shown(after)) !== squash(shown(text)))
    miss('⌘X and ⌘V back did not give back what READ showed', `${JSON.stringify(text.slice(0, x) + '⟦' + text.slice(x, y) + '⟧' + text.slice(y))} copied ${JSON.stringify(clip)} → ${JSON.stringify(after)}; READ ${JSON.stringify(shown(after))}`)
}

/* ---------- text dragged within the line ---------- */
let dragged = 0
const letters = (t) => [...t.replace(/\s+/g, '')].sort().join('')
for (let t = 0; t < 8000; t++) {
  const text = line()
  let x = rnd(text.length)
  let y = rnd(text.length + 1)
  if (x === y) continue
  if (x > y) [x, y] = [y, x]
  const m = marksIn(text)
  let seen = false
  for (let i = x; i < y && !seen; i++) seen = !m[i]
  if (!seen) continue
  let drop = rnd(text.length + 1)
  if (drop > x && drop < y) continue
  // A pointer comes down on what is drawn, and a comment's words are not.
  if (notesOf(text).some((c) => drop > c.from && drop < c.to)) continue
  const v = mk(text.slice(0, x) + '⟦' + text.slice(x, y) + '⟧' + text.slice(y))
  // As CodeMirror's own drop builds it: the text as the clipboard filters
  // hand it out, taken from where it was and put where it lands, one move.
  const clip = copied(v)
  const changes = v.state.changes([{ from: x, to: y }, { from: drop, insert: clip }])
  v.dispatch(
    v.state.update({ changes, selection: { anchor: changes.mapPos(drop, -1), head: changes.mapPos(drop, 1) }, userEvent: 'move.drop' })
  )
  dragged++
  const after = v.state.doc.toString()
  const got = shownLines(after)
  if (letters(got) !== letters(shown(text)) || /[*[\]`]|==/.test(got))
    miss(
      'a drag left READ showing other letters, or a mark on its own',
      `${JSON.stringify(text.slice(0, x) + '⟦' + text.slice(x, y) + '⟧' + text.slice(y))} to ${drop} → ${JSON.stringify(after)}; READ ${JSON.stringify(got)}`
    )
}

/* ---------- ⇧⌥ from outside a token, then away ---------- */
let extended = 0
for (let t = 0; t < 20000; t++) {
  const text = line()
  const at = rnd(text.length + 1)
  if (md.inlineTokens(text, 0).some((k) => k.from < at && at < k.to)) continue
  const v = mk(text.slice(0, at) + '¦' + text.slice(at))
  const forward = rnd(2) === 1
  for (let i = 0, n = 1 + rnd(3); i < n; i++) key(v, forward ? 'ArrowRight' : 'ArrowLeft', { altKey: true, shiftKey: true })
  if (v.state.selection.main.empty) continue
  const how = rnd(3)
  if (how === 0) key(v, forward ? 'Delete' : 'Backspace')
  else if (how === 1) key(v, forward ? 'Backspace' : 'Delete')
  else typeOver(v, 'Z')
  extended++
  const after = v.state.doc.toString()
  if (/\{==|==\}|\{>>|<<\}/.test(shown(after)) && !/\{==|==\}|\{>>|<<\}/.test(shown(text)))
    miss('⇧⌥ and then away left a review mark on the page', `${JSON.stringify(text.slice(0, at) + '¦' + text.slice(at))} → ${JSON.stringify(after)}; READ ${JSON.stringify(shown(after))}`)
  if (/[*[\]`]|https|==/.test(shown(after)))
    miss('⇧⌥ and then away left a mark on the page', `${JSON.stringify(text.slice(0, at) + '¦' + text.slice(at))} → ${JSON.stringify(after)}; READ ${JSON.stringify(shown(after))}`)
}

/* ---------- ⌥⌫, ⌥⌦ and ⌘⌫ from a caret, over comments ---------- */
let wordDeletes = 0
for (let t = 0; t < 12000; t++) {
  const text = line()
  const at = rnd(text.length + 1)
  // From a caret touching no token, as the ⇧⌥ runs are — a token the caret
  // touches has its marks out, and those are characters to every key. Against
  // a comment it may stand: a comment is sealed, out or not.
  if (md.inlineTokens(text, 0).some((k) => k.k !== 'comment' && k.from <= at && at <= k.to)) continue
  if (md.inlineTokens(text, 0).some((k) => k.k === 'comment' && k.from < at && at < k.to)) continue
  const v = mk(text.slice(0, at) + '¦' + text.slice(at))
  const how = rnd(4)
  if (how === 0) key(v, 'Backspace', { altKey: true })
  else if (how === 1) key(v, 'Delete', { altKey: true })
  else if (how === 2) key(v, 'Backspace', { metaKey: true })
  else key(v, 'Backspace')
  wordDeletes++
  const after = v.state.doc.toString()
  // What went is seen words, and a comment goes only with its anchor's last word — or, ⌫ against it, whole.
  keptComments(['⌥⌫', '⌥⌦', '⌘⌫', '⌫'][how], text.slice(0, at) + '¦' + text.slice(at), text, after, (c) => how === 3 || Boolean(c.anchor))
  if (/\{==|==\}|\{>>|<<\}/.test(shown(after)) && !/\{==|==\}|\{>>|<<\}/.test(shown(text)))
    miss('a word key left a review mark on the page', `${JSON.stringify(text.slice(0, at) + '¦' + text.slice(at))} → ${JSON.stringify(after)}`)
}

/* ---------- keys at a comment and in its words ---------- */
let atComments = 0
for (let t = 0; t < 12000; t++) {
  const text = line()
  const cs = notesOf(text)
  if (!cs.length) continue
  const c = pick(cs)
  // At its start, at its end, at the edge of its words, or in them.
  const spots = [c.from, c.to, c.from + 3, c.to - 3, c.from + 3 + rnd(Math.max(1, c.to - c.from - 5))]
  const at = pick(spots)
  // Against a token whose marks the caret brings out, a key takes them as the
  // characters they then are: that is the marks' rule, not a comment's.
  if (md.inlineTokens(text, 0).some((k) => k.k !== 'comment' && k.k !== 'anchor' && k.from <= at && at <= k.to)) continue
  const v = mk(text.slice(0, at) + '¦' + text.slice(at))
  const keys = [
    ['Backspace', {}],
    ['Delete', {}],
    ['Backspace', { altKey: true }],
    ['Delete', { altKey: true }],
    ['Backspace', { metaKey: true }],
    ['ArrowLeft', { altKey: true }],
    ['ArrowRight', { altKey: true }]
  ]
  const [k, mods] = pick(keys)
  const n = 1
  for (let i = 0; i < n; i++) key(v, k, mods)
  if (rnd(2)) typeOver(v, 'Z')
  atComments++
  const after = v.state.doc.toString()
  // The comment is whole or gone: its marks never parted from it. Its words may
  // have changed only where the caret was in them.
  const inWords = at >= c.from + 3 && at <= c.to - 3
  const mine = cm.findComments(after).filter((d) => d.from <= c.from + 3 + 6 && d.to >= c.from)
  const opens = (after.match(/\{>>/g) ?? []).length
  const closes = (after.match(/<<\}/g) ?? []).length
  if (opens !== closes || opens !== cm.findComments(after).length + (text.match(/\{>>/g) ?? []).length - cs.length)
    miss('a key at a comment left half of one', `${JSON.stringify(text.slice(0, at) + '¦' + text.slice(at))} ${k}${mods.altKey ? '⌥' : mods.metaKey ? '⌘' : ''}×${n} → ${JSON.stringify(after)}`)
  else if (!inWords && notesOf(after).some((d) => !notesOf(text).some((w) => w.text === d.text)))
    miss('a key at a comment changed its words from outside them', `${JSON.stringify(text.slice(0, at) + '¦' + text.slice(at))} ${k}×${n} → ${JSON.stringify(after)}`)
  void mine
}

await rm(work, { recursive: true, force: true })
if (failed) {
  console.log(fails.join('\n'))
  console.log([...tally].sort((p, q) => q[1] - p[1]).map(([w, n]) => `  ${n}  ${w}`).join('\n'))
  console.log(`\n${failed} failed (of ${wrapped} ⌘B/⌘I, ${wrappedLines} across lines, ${selected} selections, ${across} across lines, ${broken} ↵, ${pasted} pastes, ${roundTrips} cut and paste back, ${dragged} drags, ${extended} ⇧⌥ runs, ${wordDeletes} word deletes, ${atComments} keys at comments)`)
  process.exit(1)
}
console.log(
  `all edit-fuzz assertions hold: ${wrapped} ⌘B/⌘I presses and ${wrappedLines} over several lines, ${selected} selections deleted or typed over and ${across} more across lines, ${broken} ↵, ${pasted} pastes, ${roundTrips} cuts pasted straight back, ${dragged} drags, ${extended} ⇧⌥ runs into and out of tokens, ${wordDeletes} word deletes over comments, ${atComments} keys at and in comments`
)
