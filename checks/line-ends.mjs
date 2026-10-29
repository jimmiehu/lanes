// A NOTE SAVED ON WINDOWS COMES BACK AS IT WENT — proved.
//
// CodeMirror holds every line break as `\n`: it reads `\r\n`, and a lone `\r`,
// as a break and keeps neither. So a note whose file says `\r\n` is two texts
// at once — `\r\n` on disk and in the body the pane holds, `\n` in the editor —
// and each way between them has to know it.
//
//   IN — the body from disk is applied to an editor that holds it already:
//   every remount of a kept note (⌘E twice, a tab switched back to) and every
//   change from outside. `lib/lineDiff.ts` takes it as the editor will hold it,
//   so the same note is no change at all and a change from outside is only that
//   change. Diffed as it came, it cut a `\r\n` in half and CodeMirror read the
//   `\r` as a line of its own: `a\r\nb\r\nc\r\nd` became `a\nb\nc\n\nd`, with
//   the caret thrown to the top. So this runs on CodeMirror's own document, not
//   on string splicing — the bug was in CodeMirror's reading of the changes.
//
//   OUT — what the editor hands back is `\n` all through, and main writes it
//   in the breaks the file had (`shared/lineEnds.ts`): every break the edit did
//   not touch goes back byte for byte — `\r\n`, `\n`, or a stray `\r` — a break
//   you typed is written the way the note mostly writes them, and a note with
//   no `\r` is written exactly as it came. Held to that by characters, not by
//   lines: matched a line at a time, ⌫ joining a line cut at a stray `\r` wrote
//   the `\r` at the end of the joined line, and READ — for which a lone `\r` is
//   no break — read the heading under it as more of the same line; and a stray
//   `\r` mended on its way out could leave another one above it running into
//   the empty line you had typed, which was lost on disk.
//
//   And READ, the title and the word count read a `\r\n` note as they read the
//   same note with `\n`.
//
// Then every note in $LANES_VAULT (the sample vault if unset, which it only
// reads) with a `\r` in it is opened, reopened, typed into, joined and split,
// and written back.
//
//   node --experimental-strip-types checks/line-ends.mjs
import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { EditorSelection, EditorState } from '@codemirror/state'
import { lineChanges } from '../src/renderer/src/lib/lineDiff.ts'
import { inEndingsOf } from '../src/shared/lineEnds.ts'
import { parseNote } from '../src/shared/doc.ts'
import { firstWords } from '../src/shared/noteTitle.ts'
import { wordCount } from '../src/renderer/src/lib/wordCount.ts'

let failed = 0
const is = (ok, what, detail = '') => {
  if (!ok) {
    failed++
    console.log(`  ✗ ${what}${detail ? `\n      ${detail}` : ''}`)
  }
}
const j = JSON.stringify

/* The pieces of the round trip, as the app runs them. */
/** A note opened in WRITE: CodeMirror builds its document from the body. */
const open = (disk, at = 0) => EditorState.create({ doc: disk, selection: EditorSelection.cursor(at) })
/** The body applied again — a remount of the kept state, or a change from outside. */
const reapply = (st, disk) => {
  const changes = lineChanges(st.doc.toString(), disk)
  return { st: st.update({ changes }).state, changes }
}
/** Typing: a real CodeMirror change, at a place in the editor's text. */
const type = (st, from, to, insert) => st.update({ changes: { from, to, insert } }).state
/** The save: what the editor hands over, written into the file it replaces. */
const save = (disk, st) => inEndingsOf(disk, st.doc.toString())
/** A file as CodeMirror reads it. */
const asEditor = (s) => s.replace(/\r\n?/g, '\n')
/** A file as READ reads it — `parseNote`'s own split, where a lone `\r` is no break. */
const asRead = (s) => s.replace(/\r\n/g, '\n').split('\n')

/* ---------- IN: the note that came back with a blank line ---------- */
{
  const disk = 'a\r\nb\r\nc\r\nd'
  let st = open(disk, 4)
  const r = reapply(st, disk)
  is(r.changes.length === 0, 'the same CRLF body applied again is no change', j(r.changes))
  is(r.st.doc.toString() === 'a\nb\nc\nd', 'no blank line appears', j(r.st.doc.toString()))
  is(r.st.selection.main.head === 4, 'the caret stays where it was', `head ${r.st.selection.main.head}`)
  // And again: a second ⌘E pair must not compound anything.
  st = reapply(reapply(r.st, disk).st, disk).st
  is(st.doc.toString() === 'a\nb\nc\nd' && st.selection.main.head === 4, 'nor after three remounts', j(st.doc.toString()))
}

/* ---------- IN: a real note, the caret mid-paragraph ---------- */
const NOTE =
  '# Title\r\n\r\nFirst paragraph here.\r\n\r\nSecond paragraph, MERIDIAN the caret.\r\n\r\n- [ ] a task\r\n- item\r\n\r\nThird.\r\n'
{
  let st = open(NOTE)
  const at = st.doc.toString().indexOf('MERIDIAN')
  st = st.update({ selection: EditorSelection.cursor(at) }).state
  const r = reapply(st, NOTE)
  is(r.changes.length === 0, 'a CRLF note reopened is no change', j(r.changes))
  is(r.st.doc.toString() === asEditor(NOTE), 'nothing added at the end or anywhere', j(r.st.doc.toString()))
  is(r.st.selection.main.head === at, 'the caret keeps its place in the paragraph', `${at} → ${r.st.selection.main.head}`)

  // Changed from outside, in the file's own breaks: a paragraph at the top, a
  // line at the end. The paragraph between is untouched and the caret stays in it.
  const OUT = NOTE.replace('First paragraph', 'From outside.\r\n\r\nFirst paragraph') + 'appended\r\n'
  const o = reapply(r.st, OUT)
  is(o.st.doc.toString() === asEditor(OUT), 'a change from outside arrives exactly', j(o.st.doc.toString()))
  is(o.changes.length === 2, 'two edits from outside are two changes', j(o.changes))
  const head = o.st.selection.main.head
  is(o.st.doc.sliceString(head, head + 8) === 'MERIDIAN', 'the caret is carried through them', j(o.st.doc.sliceString(head - 10, head + 10)))
  is(!o.changes.some((c) => /\r/.test(c.insert)), 'no change hands CodeMirror a \\r to reread', j(o.changes))
}

/* ---------- IN: a stray \r mid-line, as a converted PDF leaves them ---------- */
{
  const disk = 'one \rtwo\nthree\n'
  const r = reapply(open(disk), disk)
  is(r.changes.length === 0, 'a stray \\r reopened is no change', j(r.changes))
}

/* ---------- OUT: written back, byte for byte ---------- */
{
  // Opened, reopened, saved without a keystroke.
  for (const disk of [
    NOTE,
    'a\r\nb\r\nc\r\nd',
    '\r\n\r\nlead\r\n',
    'no final break\r\nat all',
    'mixed\r\nlines\nend\r\nhere\n',
    'one \rtwo\nthree\n',
    'plain\nlf\n'
  ]) {
    const st = reapply(open(disk), disk).st
    is(save(disk, st) === disk, `written back unchanged: ${j(disk)}`, j(save(disk, st)))
  }

  // Typed into one line of a CRLF note: that line changes, every break stays.
  let st = open(NOTE)
  let at = st.doc.toString().indexOf('MERIDIAN')
  st = type(st, at, at + 8, 'the word')
  is(save(NOTE, st) === NOTE.replace('MERIDIAN', 'the word'), 'a word typed is that word, in \\r\\n', j(save(NOTE, st)))

  // Enter in the middle of a line: both halves end as the note's lines do.
  st = open(NOTE)
  at = st.doc.toString().indexOf('here.')
  st = type(st, at, at, '\n')
  is(save(NOTE, st) === NOTE.replace('here.', '\r\nhere.'), 'a new line takes \\r\\n', j(save(NOTE, st)))

  // At the very end, with and without a final break.
  st = open(NOTE)
  st = type(st, st.doc.length, st.doc.length, 'more\n')
  is(save(NOTE, st) === NOTE + 'more\r\n', 'appended at the end', j(save(NOTE, st)))
  const bare = 'one\r\ntwo'
  st = open(bare)
  st = type(st, st.doc.length, st.doc.length, '\nthree')
  is(save(bare, st) === 'one\r\ntwo\r\nthree', 'appended after a last line with no break', j(save(bare, st)))
  st = open(bare)
  st = type(st, 0, st.doc.length, '')
  is(save(bare, st) === '', 'emptied')

  // A mixed note: the break of the line typed in is its own, and so is every other.
  const mixed = 'a\r\nb\r\nlf line\nc\r\nd\r\n'
  st = open(mixed)
  at = st.doc.toString().indexOf('lf line')
  st = type(st, at, at + 2, 'LF')
  is(save(mixed, st) === mixed.replace('lf line', 'LF line'), 'a mixed note keeps each line’s break', j(save(mixed, st)))
  // Enter inside its one `\n` line: the typed break is the note's usual `\r\n`,
  // and the `\n` that ended the line still ends it, after the second half.
  st = open(mixed)
  at = st.doc.toString().indexOf('line')
  st = type(st, at, at, '\n')
  is(save(mixed, st) === mixed.replace('lf line', 'lf \r\nline'), 'Enter in a mixed note types the usual break and moves none', j(save(mixed, st)))

  // A stray \r survives an edit elsewhere in the note.
  const stray = 'intro\nPage 3 \rContinued text\n## Next\nend\n'
  st = open(stray)
  st = type(st, 0, 5, 'Intro')
  is(save(stray, st) === stray.replace('intro', 'Intro'), 'a stray \\r survives an edit elsewhere', j(save(stray, st)))

  // ⌫ at the start of the line a stray \r cut off: the \r is what goes, and the
  // heading under it is still a line of its own to READ.
  st = open(stray)
  at = st.doc.toString().indexOf('Continued')
  st = type(st, at - 1, at, '')
  let out = save(stray, st)
  is(out === stray.replace('\r', ''), 'a line joined at a stray \\r loses that \\r and nothing else', j(out))
  is(asRead(out).includes('## Next'), 'and the heading under it is still a heading to READ', j(asRead(out)))

  // Enter in the middle of a line that ends in a stray \r: to READ, the break
  // lands where it was typed, and the \r stays where it was.
  st = open(stray)
  at = st.doc.toString().indexOf('ge 3')
  st = type(st, at, at, '\n')
  out = save(stray, st)
  is(out === stray.replace('Page 3', 'Pa\nge 3'), 'Enter before a stray \\r is typed where it was typed', j(out))
  // And a word and a line typed at the end of that line: the new break is a
  // break to READ, and the \r still stands before the words it stood before.
  // (Enter alone there is the same text as Enter at the start of the next
  // line, so which of the two breaks is the new one cannot be told.)
  st = open(stray)
  at = st.doc.toString().indexOf('Continued') - 1
  st = type(st, at, at, 'X\nnew words')
  out = save(stray, st)
  is(out === stray.replace('Page 3 ', 'Page 3 X\nnew words'), 'a line typed after a stray \\r is a line to READ', j(out))

  // Enter at the start of the line after a stray \r: kept as `\r` and followed
  // by the new empty line's `\n`, the two would read back as one break.
  st = open(stray)
  at = st.doc.toString().indexOf('Continued')
  st = type(st, at, at, '\n')
  is(asEditor(save(stray, st)) === st.doc.toString(), 'an empty line typed under a stray \\r is still there on disk', j(save(stray, st)))
  // Two strays running into it, one above the other: mending the lower one
  // must not leave the upper one to swallow the line.
  const two = 'x\r\ry\n'
  st = open(two)
  at = st.doc.toString().indexOf('y')
  st = type(st, at, at, '\n')
  is(asEditor(save(two, st)) === st.doc.toString(), 'nor under two strays', `${j(st.doc.toString())} wrote ${j(save(two, st))}`)
  // A last word ending in a stray \r, made a line break: every line is on disk.
  const tail = 'a\n  \rb\r'
  st = open(tail)
  at = st.doc.toString().lastIndexOf('b')
  st = type(st, at, at + 1, '\n')
  is(asEditor(save(tail, st)) === st.doc.toString(), 'a stray \\r at the end mended without losing a line', `${j(st.doc.toString())} wrote ${j(save(tail, st))}`)

  // A note with no \r is written exactly as it came — the very same string.
  const lfBody = 'a\nb\n'
  is(inEndingsOf('x\ny\n', lfBody) === lfBody, 'an LF note is written as it came')
  is(inEndingsOf('', 'new\n') === 'new\n', 'a note made again from nothing is written as it came')

  // READ hands over the body it holds, which still has its \r\n: a task ticked
  // there is written with the same breaks it was read with.
  const ticked = NOTE.replace('- [ ] a task', '- [x] a task')
  is(inEndingsOf(NOTE, ticked) === ticked, 'a body that kept its \\r\\n is written as it came')
}

/* ---------- OUT: one edit, every break it did not touch as it was ---------- */
// A file is characters and breaks, each break carrying its bytes; the editor
// sees each break as one `\n`. One edit takes some of them out and puts some
// in, and the file it means is exactly that: every break outside it as it
// was, a typed one written the usual way — or, where the edit put in as many
// breaks as it took out, the ones it took, in order — and one mend, a kept
// stray `\r` just above an empty line's `\n`, written the usual way. Edits
// whose place is ambiguous (the same letters on both sides of it) are left out:
// which of two equal breaks is the new one cannot be told from the text.
const rng = (seed) => (n) => {
  seed = (seed * 1103515245 + 12345) & 0x7fffffff
  // The high bits: the low ones of this generator repeat in short cycles.
  return (seed >>> 8) % n
}
{
  const rnd = rng(5)
  const KINDS = [['\r\n'], ['\n', '\n', '\r'], ['\r\n', '\r\n', '\n', '\r'], ['\n', '\r', '\r']]
  const LETTERS = ['a', ' ', '-', '#']
  const isBreak = (t) => t[0] === '\r' || t[0] === '\n'
  let runs = 0
  for (let i = 0; i < 200000 && runs < 20000; i++) {
    const kind = KINDS[rnd(KINDS.length)]
    let disk = ''
    for (let n = 1 + rnd(12), k = 0; k < n; k++) {
      for (let c = rnd(4); c > 0; c--) disk += LETTERS[rnd(LETTERS.length)]
      if (k < n - 1 || rnd(2)) disk += kind[rnd(kind.length)]
    }
    if (!disk.includes('\r')) continue
    // CodeMirror's reading: one token per character of its text.
    const toks = disk.match(/\r\n?|\n|[^\r\n]/g)
    const usual = toks.filter((t) => t === '\r\n').length > toks.filter((t) => t === '\n').length ? '\r\n' : '\n'
    const from = rnd(toks.length + 1)
    const to = Math.min(toks.length, from + rnd(4))
    const insert = ['', 'Q', '\n', 'Q\nQ', '\n\n', 'QQ\n', '\nQ'][rnd(7)]
    const st = type(open(disk), from, to, insert)
    const text = st.doc.toString()
    const was = asEditor(disk)
    if (was === text) continue
    let p = 0
    while (p < Math.min(was.length, text.length) && was[p] === text[p]) p++
    let s = 0
    while (s < Math.min(was.length, text.length) - p && was[was.length - 1 - s] === text[text.length - 1 - s]) s++
    if (p !== from || s !== was.length - to) continue
    runs++
    const taken = toks.slice(from, to).filter(isBreak)
    const typed = [...insert]
    const same = taken.length === typed.filter((c) => c === '\n').length
    let q = 0
    const file = [...toks.slice(0, from), ...typed.map((c) => (c !== '\n' ? c : same ? taken[q++] : usual)), ...toks.slice(to)]
    for (let k = file.length - 2; k >= 0; k--) if (file[k] === '\r' && file[k + 1] === '\n') file[k] = usual
    const want = file.join('')
    const got = save(disk, st)
    if (got !== want) {
      is(false, `one edit, run ${runs}: the breaks it did not touch are as they were`, `${j(disk)} [${from},${to})→${j(insert)}: want ${j(want)}, wrote ${j(got)}`)
      break
    }
  }
  console.log(`  ${runs} single edits written back break for break`)
}

/* ---------- OUT: random notes, random typing ---------- */
{
  const rnd = rng(11)
  const WORDS = ['alpha', '', '- item', '## head', 'x', '> q', 'long line of prose here']
  const ENDS = [
    ['\r\n', '\r\n', '\r\n', '\n', '\r'],
    // Strays and empty lines together, where one mend can call for another.
    ['\n', '\r', '\r']
  ]
  let runs = 0
  for (let i = 0; i < 4000; i++) {
    const pure = rnd(2) === 0
    const ends = ENDS[rnd(ENDS.length)]
    const n = 1 + rnd(30)
    let disk = ''
    for (let k = 0; k < n; k++) disk += WORDS[rnd(WORDS.length)] + (k < n - 1 || rnd(2) ? (pure ? '\r\n' : ends[rnd(ends.length)]) : '')
    let st = open(disk)
    // Reopened first: whatever the file, that is no change.
    const r = reapply(st, disk)
    if (r.changes.length) {
      is(false, `random note ${i} reopened is no change`, `${j(disk)} → ${j(r.changes)}`)
      break
    }
    st = r.st
    for (let e = rnd(4); e >= 0; e--) {
      const a = rnd(st.doc.length + 1)
      const b = Math.min(st.doc.length, a + rnd(6))
      st = type(st, a, b, ['', 'Z', '\n', 'new line\n', 'xy', '\n\n'][rnd(6)])
    }
    const text = st.doc.toString()
    const out = save(disk, st)
    runs++
    if (asEditor(out) !== text) {
      is(false, `random note ${i}: what is written is what was typed`, `${j(disk)} + typing → ${j(text)}, wrote ${j(out)}`)
      break
    }
    if (pure && disk.includes('\r') && out !== text.replace(/\n/g, '\r\n')) {
      is(false, `random note ${i}: a \\r\\n note stays \\r\\n all through`, `${j(disk)} → ${j(out)}`)
      break
    }
    // And the file read back is the editor's text again, no change to apply.
    if (lineChanges(text, out).length) {
      is(false, `random note ${i}: the file written reads back as no change`, j(out))
      break
    }
  }
  console.log(`  ${runs} random notes typed into and written back`)
}

/* ---------- READ, the title, the words ---------- */
{
  const lf = asEditor(NOTE)
  is(j(parseNote(NOTE, { breaks: true })) === j(parseNote(lf, { breaks: true })), 'READ reads \\r\\n as \\n')
  is(firstWords(NOTE) === firstWords(lf), 'the first words are the same', `${j(firstWords(NOTE))} vs ${j(firstWords(lf))}`)
  is(wordCount(NOTE) === wordCount(lf), 'the word count is the same', `${wordCount(NOTE)} vs ${wordCount(lf)}`)
  // Main's title rule (notes.ts titleOf), as App restates it as you type.
  const h1 = (s) => /^#(?:[^\S\n]+(.*))?$/m.exec(s)?.[1]?.trim()
  is(h1(NOTE) === 'Title', 'the title is read without its \\r', j(h1(NOTE)))
}

/* ---------- the vault's own ---------- */
const VAULT = process.env.LANES_VAULT ?? fileURLToPath(new URL('../fixtures/sample-vault', import.meta.url))
const SKIP = new Set(['.git', '.obsidian', '.claude', 'node_modules', '.trash'])
async function walk(dir, out) {
  let es
  try {
    es = await readdir(dir, { withFileTypes: true })
  } catch {
    return out
  }
  for (const e of es) {
    if (SKIP.has(e.name)) continue
    const p = join(dir, e.name)
    if (e.isDirectory()) await walk(p, out)
    else if (e.name.endsWith('.md')) out.push(p)
  }
  return out
}
const headOf = (raw) => {
  if (!raw.startsWith('---')) return ''
  const end = raw.indexOf('\n---', 3)
  return end === -1 ? '' : raw.slice(0, raw.indexOf('\n', end + 1) + 1)
}
/** Where a place in the editor's text is in the file: every `\r\n` before it is one character more. */
const onDisk = (disk, pos) => {
  let at = 0
  for (let k = 0; k < pos; k++) at += disk.startsWith('\r\n', at) ? 2 : 1
  return at
}
let real = 0
for (const file of await walk(VAULT, [])) {
  const raw = await readFile(file, 'utf8')
  if (!raw.includes('\r')) continue
  real++
  const name = file.slice(VAULT.length + 1)
  const disk = raw.slice(headOf(raw).length)
  const n = (re) => (disk.match(re) ?? []).length
  console.log(`  ${name}: ${n(/\r\n/g)} \\r\\n · ${n(/(?<!\r)\n/g)} \\n · ${n(/\r(?!\n)/g)} stray \\r`)
  const opened = reapply(open(disk), disk).st
  is(save(disk, opened) === disk, `${name}: reopened and written back byte for byte`)
  // A word typed at the start of the middle line: only that line changes.
  const mid = opened.doc.line(Math.ceil(opened.doc.lines / 2))
  let st = type(opened, mid.from, mid.from, 'Z')
  let out = save(disk, st)
  const was = disk.split(/(?<=\r\n|\r(?!\n)|\n)/)
  const now = out.split(/(?<=\r\n|\r(?!\n)|\n)/)
  const differ = was.filter((l, i) => l !== now[i]).length
  is(was.length === now.length && differ === 1, `${name}: a letter typed changes one line on disk`, `${differ} lines differ`)
  // Enter in the middle of a line of words: the note's usual break, there,
  // and not one other byte.
  const usual = n(/\r\n/g) > n(/(?<!\r)\n/g) ? '\r\n' : '\n'
  let words = mid
  while (words.length < 2 && words.number < opened.doc.lines) words = opened.doc.line(words.number + 1)
  if (words.length >= 2) {
    const cut = words.from + Math.floor(words.length / 2)
    out = save(disk, type(opened, cut, cut, '\n'))
    const d = onDisk(disk, cut)
    is(out === disk.slice(0, d) + usual + disk.slice(d), `${name}: Enter mid-line is that one break on disk`, `${j(out.slice(d - 20, d + 20))}`)
  }
  // ⌫ joining two lines of words, at the first break of each kind the note
  // has: that break goes, and nothing else.
  for (const [kind, re] of [
    ['\\r\\n', /(?<=[^\r\n])\r\n(?=[^\r\n])/],
    ['stray \\r', /(?<=[^\r\n])\r(?=[^\r\n])/],
    ['\\n', /(?<=[^\r\n])\n(?=[^\r\n])/]
  ]) {
    const i = disk.search(re)
    if (i === -1) continue
    const len = disk.startsWith('\r\n', i) ? 2 : 1
    const pos = asEditor(disk.slice(0, i)).length
    out = save(disk, type(opened, pos, pos + 1, ''))
    is(out === disk.slice(0, i) + disk.slice(i + len), `${name}: two lines joined at a ${kind} lose that break and nothing else`, `${j(out.slice(i - 20, i + 20))}`)
  }
}

console.log(
  failed
    ? `\n${failed} failed`
    : `\nall line-ending assertions hold (${real} note${real === 1 ? '' : 's'} with a \\r in ${VAULT} round-tripped)`
)
process.exit(failed ? 1 : 0)
