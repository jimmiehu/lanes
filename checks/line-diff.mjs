// A NOTE EDITED FROM OUTSIDE ARRIVES AS THE CHANGES THAT WERE MADE — proved.
//
// The editor applies a body from disk as a set of changes and carries the
// caret through them. That is only as good as the changes: one hunk from the
// first difference to the last swallows everything between two edits, and a
// caret inside the swallowed part is thrown to its edge. `lib/lineDiff.ts`
// diffs properly. This holds it to two things:
//
//   EXACT — applying the changes to the old text gives the new text, byte for
//   byte, over thousands of random edits of every shape (inserts, deletes,
//   rewrites, at the ends and in the middle, with and without a final newline).
//
//   CAREFUL — the changes touch nothing that did not change. Claude adding a
//   paragraph at the top and a line at the end leaves the paragraph between
//   untouched, which is what keeps the caret in it; and an edit to one word of
//   a line touches that word, not the line.
//
//   node --experimental-strip-types checks/line-diff.mjs
import { lineChanges } from '../src/renderer/src/lib/lineDiff.ts'

let failed = 0
const is = (ok, what, detail = '') => {
  if (!ok) {
    failed++
    console.log(`  ✗ ${what}${detail ? `\n      ${detail}` : ''}`)
  }
}
/** Changes are relative to the ORIGINAL text and must not overlap — CodeMirror's contract. */
const apply = (a, cs) => {
  let out = ''
  let at = 0
  for (const c of cs) {
    if (c.from < at) throw new Error('overlapping or unsorted changes')
    out += a.slice(at, c.from) + c.insert
    at = c.to
  }
  return out + a.slice(at)
}
const touches = (cs, a, b) => cs.some((c) => c.from < b && c.to > a)

/* ---------- the case the sync check caught ---------- */
const BODY = '# Sync check\n\nThe first paragraph.\n\nMERIDIAN is where the caret waits.\n\nThe last paragraph.\n'
const OUT = BODY.replace('MERIDIAN is', 'A paragraph from outside.\n\nMERIDIAN is') + '\nappended from outside\n'
const cs = lineChanges(BODY, OUT)
is(apply(BODY, cs) === OUT, 'two separated edits apply exactly')
const m = BODY.indexOf('MERIDIAN')
is(!touches(cs, m, m + 'MERIDIAN is where the caret waits.'.length), 'the paragraph between two edits is untouched', JSON.stringify(cs))
is(cs.length === 2, 'two edits are two changes', JSON.stringify(cs))

/* ---------- down to the characters ---------- */
const one = lineChanges('alpha beta gamma\n', 'alpha BETA gamma\n')
is(one.length === 1 && one[0].from === 6 && one[0].to === 10 && one[0].insert === 'BETA', 'a word in a line is that word', JSON.stringify(one))
is(lineChanges('same', 'same').length === 0, 'no change is no changes')
is(apply('', lineChanges('', 'new\n')) === 'new\n', 'from empty')
is(apply('gone\n', lineChanges('gone\n', '')) === '', 'to empty')
is(apply('a\nb', lineChanges('a\nb', 'a\nb\n')) === 'a\nb\n', 'a final newline added')
is(apply('a\nb\n', lineChanges('a\nb\n', 'a\nb')) === 'a\nb', 'a final newline removed')

/* ---------- and random edits of every shape ---------- */
let seed = 7
const rnd = (n) => {
  seed = (seed * 1103515245 + 12345) & 0x7fffffff
  return seed % n
}
const WORDS = ['alpha', 'beta', '', '- item', '## head', 'x', 'long line of prose here', '> q']
const text = () => {
  const n = rnd(40)
  const lines = Array.from({ length: n }, () => WORDS[rnd(WORDS.length)])
  return lines.join('\n') + (rnd(2) ? '\n' : '')
}
const mutate = (s) => {
  const lines = s.split('\n')
  for (let e = rnd(6); e >= 0; e--) {
    const at = rnd(lines.length + 1)
    const op = rnd(4)
    if (op === 0) lines.splice(at, 0, WORDS[rnd(WORDS.length)])
    else if (op === 1 && lines.length) lines.splice(Math.min(at, lines.length - 1), 1)
    else if (op === 2 && lines.length) lines[Math.min(at, lines.length - 1)] += WORDS[rnd(WORDS.length)]
    else lines.splice(at, 0, WORDS[rnd(WORDS.length)], WORDS[rnd(WORDS.length)])
  }
  return lines.join('\n')
}
let runs = 0
for (let i = 0; i < 5000; i++) {
  const a = text()
  const b = rnd(5) ? mutate(a) : text()
  let got
  try {
    got = apply(a, lineChanges(a, b))
  } catch (err) {
    is(false, `changes are sorted and disjoint (run ${i})`, String(err))
    continue
  }
  runs++
  if (got !== b) {
    is(false, `random edit ${i} applies exactly`, `${JSON.stringify(a)} → ${JSON.stringify(b)}, got ${JSON.stringify(got)}`)
    break
  }
}

console.log(failed ? `\n${failed} failed` : `\nall line-diff assertions hold (${runs} random edits applied exactly)`)
process.exit(failed ? 1 : 0)
