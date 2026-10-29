// COMMENTS ARE READ BY ONE GRAMMAR — proved over lines nobody chose to pass.
//
// A comment is written in the note, in CriticMarkup: `{==the words==}` is the
// anchor, what a comment is about, and `{>>…<<}` the comment. READ draws them
// from `parseRuns`; the editor draws them from `inlineTokens` and `shownText`,
// the same grammar restated with positions; and every count, the pass and the
// palette read `findComments`. Restating a grammar is a way to fork it, and a
// vault's few comments are no cover of every shape, so `md-live.mjs` agreeing
// over the vault proves little about the new tokens. This holds them to each other here:
//
//   - THE CASES, stated: an anchored comment, a bare one, an anchor around a
//     bold word and a bold phrase around an anchor, a comment in a code span
//     and in a fence (neither is one), one that does not close, a highlight
//     with no comment, two on a line, one in an item, a table cell and a
//     fold's summary — and the line READ shows for each, which never holds a
//     comment's words.
//   - GENERATED LINES — tens of thousands, mixing anchors and comments with
//     every other token, nested both ways, with stray marks among them: the
//     text the editor shows is the text READ shows, character for character;
//     the same characters are anchored; the same comments, in the same order.
//   - GENERATED NOTES — items, tasks, headings, quotes, tables, fences, folds
//     and embeds: `findComments` lists exactly the comments READ draws, in the
//     order it draws them, each one's offsets slicing back to its own marks.
//   - WRITTEN ANYWHERE — a selection over a generated note, from a bullet, a
//     blank, a fence, a table's rule, an embed, across cells and blocks, is
//     about the first words it has, and written on it changes no block READ
//     draws, a pipe in a cell's comment escaped so the table keeps its cells;
//     resolved, the note is as it was. An embed's own line is never anchored,
//     its note there or not: `{==` round it would leave a paragraph in its
//     place (red at 0ee99b6, which wrote one round a missing note's embed).
//   - THE COUNTS: a comment's words are not the note's, so the word count
//     leaves them out — and a click in READ maps back past a comment, never
//     into one.
//
// Red at the commit before: there was no grammar for any of it, and READ
// showed the braces.
//
//   node --experimental-strip-types checks/comments.mjs
import { inlineTokens, shownText } from '../src/shared/mdLive.ts'
import { parseRuns } from '../src/shared/blocks.ts'
import { parseNote } from '../src/shared/doc.ts'
import { anchorFor, applyChanges, editChanges, findAgain, findComments, resolveChanges, reviewPrompt, sayable, sound, writeChanges } from '../src/shared/comments.ts'
import { wordCount } from '../src/renderer/src/lib/wordCount.ts'
import { plainToRaw } from '../src/renderer/src/lib/sourceAt.ts'

let pass = 0
let fail = 0
const fails = []
const ok = (name, got, want) => {
  if (JSON.stringify(got) === JSON.stringify(want)) pass += 1
  else {
    fail += 1
    if (fails.length < 14) fails.push(`  ✗ ${name}\n      got  ${JSON.stringify(got)}\n      want ${JSON.stringify(want)}`)
  }
}

/** What READ shows of a line, and which of its characters are anchored — and highlighted. */
const read = (line, lit = false) => {
  const runs = parseRuns(line)
  const out = {
    text: runs.map((r) => r.text).join(''),
    anchored: runs.map((r) => (r.anchor ? '1' : '0').repeat(r.text.length)).join(''),
    comments: runs.filter((r) => r.comment !== undefined).map((r) => r.comment)
  }
  if (lit) out.highlighted = runs.map((r) => (r.highlight ? '1' : '0').repeat(r.text.length)).join('')
  return out
}
/** The same, from the editor's tokens. */
const drawn = (s) => {
  let text = ''
  let anchored = ''
  let highlighted = ''
  const comments = []
  const add = (str, a, h) => {
    text += str
    anchored += (a ? '1' : '0').repeat(str.length)
    highlighted += (h ? '1' : '0').repeat(str.length)
  }
  const walk = (toks, a, b, anch, hl) => {
    let at = a
    for (const t of toks) {
      add(s.slice(at, t.from), anch, hl)
      if (t.k === 'wiki') add(s.slice(t.label[0], t.label[1]), anch, hl)
      else if (t.k === 'bold') walk(t.inner, t.from + 2, t.to - 2, anch, hl)
      else if (t.k === 'italic') walk(t.inner, t.from + 1, t.to - 1, anch, hl)
      else if (t.k === 'code') add(s.slice(t.from + 1, t.to - 1), anch, hl)
      else if (t.k === 'link') walk(t.inner, t.from + 1, t.textTo, anch, hl)
      else if (t.k === 'anchor') walk(t.inner, t.from + 3, t.to - 3, true, hl)
      else if (t.k === 'highlight') walk(t.inner, t.from + 2, t.to - 2, anch, true)
      else if (t.k === 'comment') comments.push(s.slice(t.from + 3, t.to - 3))
      else add(s.slice(t.from, t.to), anch, hl)
      at = t.to
    }
    add(s.slice(at, b), anch, hl)
  }
  walk(inlineTokens(s), 0, s.length, false, false)
  return { text, anchored, comments, highlighted }
}
const agree = (line, what) => {
  const r = read(line, true)
  const d = drawn(line)
  ok(`${what} — shown`, shownText(line), r.text)
  ok(`${what} — drawn`, d, r)
}

/* ---------- the cases, stated ---------- */

const PLAN = 'The plan rests on {==crop rotation==}{>>define this before first use?<<} as its frame.'
ok('an anchored comment: READ shows the line without it', read(PLAN).text, 'The plan rests on crop rotation as its frame.')
ok('an anchored comment: its words are the comment', read(PLAN).comments, ['define this before first use?'])
ok(
  'an anchored comment: the anchor is anchored',
  read(PLAN).anchored,
  '0'.repeat('The plan rests on '.length) + '1'.repeat('crop rotation'.length) + '0'.repeat(' as its frame.'.length)
)
agree(PLAN, 'an anchored comment')
ok('a bare comment', read('Here {>>a note at a point<<} it is.'), { text: 'Here  it is.', anchored: '0'.repeat(12), comments: ['a note at a point'] })
ok('an anchor around bold', parseRuns('{==**this**==}{>>why bold?<<}'), [
  { text: 'this', bold: true, anchor: true },
  { text: '', comment: 'why bold?' }
])
ok('bold around an anchor', parseRuns('**a {==b==} c**'), [
  { text: 'a ', bold: true },
  { text: 'b', anchor: true, bold: true },
  { text: ' c', bold: true }
])
ok('a comment is plain: its stars are not bold', read('x {>>make **this** bold<<} y').comments, ['make **this** bold'])
ok('a comment in a code span is code', read('a `{>>not a comment<<}` b'), { text: 'a {>>not a comment<<} b', anchored: '0'.repeat(23), comments: [] })
ok('a comment that does not close is words', read('a {>>open b').text, 'a {>>open b')
ok('a highlight with no comment: anchored, nothing said', read('{==lone==} words'), { text: 'lone words', anchored: '1111000000', comments: [] })
ok('two on one line', read('one {>>a<<} and {==two==}{>>b<<}').comments, ['a', 'b'])
ok('an empty comment is one', read('x{>><<}y').comments, [''])
ok('a highlight: its words, marked, without its marks', read('a ==ripe== b', true), { text: 'a ripe b', anchored: '00000000', comments: [], highlighted: '00111100' })
ok('a comparison is no highlight', read('if a == b and c == d', true).text, 'if a == b and c == d')
ok('a highlight in an anchor, and an anchor in a highlight', [read('{==a ==b== c==}{>>why<<}', true), read('==a {==b==}{>>why<<} c==', true)], [
  { text: 'a b c', anchored: '11111', comments: ['why'], highlighted: '00100' },
  { text: 'a b c', anchored: '00100', comments: ['why'], highlighted: '11111' }
])
ok('bold in a highlight', parseRuns('==**ripe** and ready=='), [
  { text: 'ripe', bold: true, highlight: true },
  { text: ' and ready', highlight: true }
])
for (const line of [
  'see [the {==docs==}](https://x.y/z){>>which ones?<<} now',
  '==see [[a/b|the note]] here==',
  '`==code==` ==not `code`==',
  '====',
  '== spaced ==',
  '==a==b==c==',
  '{==[[a/b/c|the note]]==}{>>is this the one?<<}',
  '*{==soft==}{>>italic anchor<<}*',
  '{==a ==}{>><<}{==}',
  '{>>a{==b==}c<<}{==d{>>e<<}f==}',
  '`{==code==}`{>>after code<<}',
  'spring-beds/a.md{>>a path<<}',
  '{==spring-beds/a.md==}{>>anchored path<<}'
])
  agree(line, JSON.stringify(line))

/* ---------- generated lines ---------- */

let seed = 20261007
const rnd = () => {
  seed = (seed + 0x6d2b79f5) | 0
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}
const pick = (xs) => xs[Math.floor(rnd() * xs.length)]
const WORDS = ['plan', 'rests', 'on', 'frame', 'alpha', 'data', 'x', 'rotation', 'is']
const say = () => pick(['why?', 'tighten this', 'define **this**', 'see [[a/b]]', 'a `tick`', '', ' spaced ', 'no {== here'])
const seq = (d, n) => Array.from({ length: 1 + Math.floor(rnd() * n) }, () => frag(d)).join(pick([' ', ' ', '', ', ']))
function frag(d) {
  if (d > 2 || rnd() < 0.3) return pick(WORDS)
  switch (Math.floor(rnd() * 12)) {
    case 0:
      return `**${seq(d + 1, 3)}**`
    case 1:
      return `*${seq(d + 1, 2)}*`
    case 2:
      return '`' + pick([...WORDS, '{>>in code<<}', '{==in code==}']) + '`'
    case 3:
      return `[${seq(d + 1, 2)}](https://e.com/${pick(WORDS)})`
    case 4:
      return `[[a/${pick(WORDS)}${rnd() < 0.5 ? '|' + pick(WORDS) : ''}]]`
    case 5:
      return `spring-beds/${pick(WORDS)}.md`
    case 6:
      return `{==${seq(d + 1, 3)}==}`
    case 7:
    case 8:
      return `{==${seq(d + 1, 3)}==}{>>${say()}<<}`
    case 9:
      return `{>>${say()}<<}`
    case 10:
      return `==${seq(d + 1, 3)}==`
    default:
      return pick(['{>>', '<<}', '{==', '==}', '{>> open', '**', '*', '[', ']', '`', '{', '}', '==', '= ='])
  }
}
for (let i = 0; i < 30000; i++) agree(seq(0, 6), `generated line ${i}`)

/* ---------- findComments, stated ---------- */

const one = findComments(PLAN)
ok('findComments: the anchored one', one.map((c) => ({ text: c.text, words: c.anchor?.words, line: c.line })), [
  { text: 'define this before first use?', words: 'crop rotation', line: 0 }
])
ok('findComments: offsets slice back to the marks', [PLAN.slice(one[0]?.from, one[0]?.to), PLAN.slice(one[0]?.anchor?.from, one[0]?.anchor?.to)], [
  '{>>define this before first use?<<}',
  '{==crop rotation==}'
])
ok('findComments: an anchor around bold says the words READ shows', findComments('{==**this**==}{>>bold?<<}')[0]?.anchor?.words, 'this')
ok('findComments: a bare one has no anchor', findComments('a {>>here<<} b')[0]?.anchor, null)
ok('findComments: an anchor apart from it is not its anchor', findComments('{==a==} {>>here<<}')[0]?.anchor, null)
ok('findComments: none in a fence', findComments('```\n{>>code<<}\n```\nafter {>>one<<}').map((c) => [c.text, c.line]), [['one', 3]])
ok('findComments: none in a code span', findComments('a `{>>code<<}` b'), [])
ok('findComments: a task, past its box', findComments('- [ ] ship {==it==}{>>when?<<}').map((c) => [c.text, c.anchor?.words]), [['when?', 'it']])
ok('findComments: a table cell', findComments('| a | b |\n|---|---|\n| c {>>in a cell<<} | d |').map((c) => [c.text, c.line]), [['in a cell', 2]])
ok(
  'findComments: a fold, its summary and its body',
  findComments('<details><summary>More {>>in the summary<<}</summary>\n\nbody {>>in the body<<}\n</details>').map((c) => [c.text, c.line]),
  [
    ['in the summary', 0],
    ['in the body', 2]
  ]
)
ok('findComments: a note with none', findComments('# Title\n\nNo marks at all.'), [])

/* ---------- generated notes: findComments lists what READ draws ---------- */

/** The comments READ draws, in the order it draws them. */
const readComments = (body) => {
  const out = []
  const runs = (rs) => rs.forEach((r) => r.comment !== undefined && out.push(r.comment))
  const walk = (bs) => {
    for (const b of bs) {
      if (b.kind === 'table') {
        b.head.forEach(runs)
        b.rows.forEach((row) => row.forEach(runs))
      } else if (b.kind === 'details') {
        runs(b.summary)
        walk(b.blocks)
      } else if (b.runs) runs(b.runs)
    }
  }
  walk(parseNote(body, { breaks: true }))
  return out
}
const lineOf = () => {
  const words = seq(0, 4)
  switch (Math.floor(rnd() * 13)) {
    case 0:
      return `- ${words}`
    case 1:
      return `- [ ] ${words}`
    case 2:
      return `3. ${words}`
    case 3:
      return `## ${words}`
    case 4:
      return `> ${words}`
    case 5:
      return ''
    case 6:
      // A table whose cells hold no pipe of their own.
      return `| ${seq(0, 2).replace(/\|/g, '')} | b |\n|---|---|\n| ${seq(0, 2).replace(/\|/g, '')} | {>>cell<<} |`
    case 7:
      return '```\n' + `${words} {>>in a fence<<}` + '\n```'
    case 8:
      return `<details><summary>${seq(0, 2)}</summary>\n\n${words}\n</details>`
    case 9:
      // An embed, its note there or not — and `![[…]]` in prose, which is words.
      return pick([`![[a/${pick(WORDS)}]]`, `![[Missing ${pick(WORDS)}]]`, `  ![[a/b#${pick(WORDS)}]]`, `![[a/b]] ${words}`])
    default:
      return words
  }
}
let notes = 0
for (let i = 0; i < 3000; i++) {
  const body = Array.from({ length: 2 + Math.floor(rnd() * 8) }, lineOf).join('\n')
  const found = findComments(body)
  ok(`generated note ${i}: what READ draws`, found.map((c) => c.text), readComments(body))
  const lines = body.split('\n')
  const bad = found.filter(
    (c) =>
      body.slice(c.from, c.from + 3) !== '{>>' ||
      body.slice(c.to - 3, c.to) !== '<<}' ||
      body.slice(c.from + 3, c.to - 3) !== c.text ||
      !lines[c.line].includes(body.slice(c.from, c.to)) ||
      (c.anchor && (c.anchor.to !== c.from || body.slice(c.anchor.from, c.anchor.from + 3) !== '{=='))
  )
  ok(`generated note ${i}: offsets slice back`, bad.length, 0)
  notes += found.length
}
ok('generated notes held comments to compare', notes > 2000, true)

/* ---------- writing one: what it would be about ---------- */

const at = (body, words, n = 0) => {
  let i = -1
  for (let k = 0; k <= n; k++) i = body.indexOf(words, i + 1)
  return [i, i + words.length]
}
const target = (body, words, n) => anchorFor(body, ...at(body, words, n))
const wrote = (body, t, text = 'T') => (t?.kind === 'new' ? applyChanges(body, writeChanges(t, text)) : null)
const PLAIN = 'The plan rests on crop rotation as its frame.'
const t1 = target(PLAIN, 'crop rotation')
ok('anchorFor: the words selected', t1, { kind: 'new', a: 18, b: 31, words: 'crop rotation', lone: false })
ok('writeChanges: the anchor and its comment, round the words', wrote(PLAIN, t1, 'define this?'), 'The plan rests on {==crop rotation==}{>>define this?<<} as its frame.')
ok('anchorFor: the space either side left out', anchorFor(PLAIN, 17, 32)?.words, 'crop rotation')
ok('anchorFor: one line, the first', anchorFor('one two\nthree four', 4, 13)?.words, 'two')
ok('anchorFor: not the marker of a task', anchorFor('- [ ] ship it', 0, 13)?.words, 'ship it')
ok("anchorFor: not a heading's hashes", anchorFor('## The plan', 0, 11)?.words, 'The plan')
ok('anchorFor: inside a bold phrase, inside it', wrote('**a b c**', target('**a b c**', 'b')), '**a {==b==}{>>T<<} c**')
ok('anchorFor: reaching part of a bold phrase, the whole of it', wrote('x **a b** y', target('x **a b** y', 'b** y')), 'x {==**a b** y==}{>>T<<}')
ok('anchorFor: a code span whole', wrote('see `a b` now', target('see `a b` now', 'b')), 'see {==`a b`==}{>>T<<} now')
ok('anchorFor: a wikilink whole', wrote('see [[a/b|the note]] now', target('see [[a/b|the note]] now', 'note')), 'see {==[[a/b|the note]]==}{>>T<<} now')
ok("anchorFor: a link's words, inside", wrote('see [the docs](https://x.y) now', target('see [the docs](https://x.y) now', 'docs')), 'see [the {==docs==}{>>T<<}](https://x.y) now')
ok("anchorFor: a link's address, the whole link", wrote('see [the docs](https://x.y) now', target('see [the docs](https://x.y) now', 'x.y')), 'see {==[the docs](https://x.y)==}{>>T<<} now')
ok('anchorFor: words with a comment open it', anchorFor(PLAN, ...at(PLAN, 'rotation'))?.comment?.text, 'define this before first use?')
ok('anchorFor: a comment itself opens it', anchorFor(PLAN, ...at(PLAN, 'before first'))?.comment?.text, 'define this before first use?')
const LONE = 'a {==highlight==} b'
ok('anchorFor: a highlight with none gets one after it', wrote(LONE, target(LONE, 'light')), 'a {==highlight==}{>>T<<} b')
ok('anchorFor: nothing in a fence', anchorFor('```\ncode here\n```', 4, 8), null)
ok('anchorFor: nothing but space is nothing', anchorFor('a   b', 2, 3), null)

// Wherever a selection starts, the first words it has — and in a table, a cell.
const TABLE = '| a | b |\n|---|---|\n| c | d |'
ok('anchorFor: in a table, the cell', wrote(TABLE, target(TABLE, 'd')), '| a | b |\n|---|---|\n| c | {==d==}{>>T<<} |')
ok('anchorFor: in a table, the header', wrote(TABLE, target(TABLE, 'b')), '| a | {==b==}{>>T<<} |\n|---|---|\n| c | d |')
ok('anchorFor: across cells, the first', target(TABLE, 'c | d')?.words, 'c')
ok("anchorFor: from a table's rule, its first row", anchorFor(TABLE, 10, 23)?.words, 'c')
ok("anchorFor: not on a table's rule", anchorFor(TABLE, 10, 19), null)
const PIPED = wrote(TABLE, target(TABLE, 'd'), 'this | or that')
ok('anchorFor: in a cell, a pipe said is escaped', PIPED, '| a | b |\n|---|---|\n| c | {==d==}{>>this \\| or that<<} |')
const PIPED_ONE = findComments(PIPED ?? '')[0]
ok('editChanges: in a cell, a pipe said is escaped', PIPED_ONE ? applyChanges(PIPED, editChanges(PIPED_ONE, 'p|q')) : null, '| a | b |\n|---|---|\n| c | {==d==}{>>p\\|q<<} |')
ok('anchorFor: from the end of the line before, the words after', anchorFor('one two\nthree four', 7, 13)?.words, 'three')
ok('anchorFor: from a blank, the words after', anchorFor('one\n\nthree four', 4, 15)?.words, 'three four')
ok('anchorFor: across items, the first', anchorFor('- one\n- two', 0, 11)?.words, 'one')
ok('anchorFor: from a fence, the words after it', anchorFor('```\ncode\n```\nafter it', 0, 21)?.words, 'after it')
ok('anchorFor: from a rule, the words after it', anchorFor('a\n\n---\nafter it', 3, 15)?.words, 'after it')
ok("anchorFor: not a numbered item's status", anchorFor('1. ship it ~done', 0, 16)?.words, 'ship it')

// An embed on its own line is another note drawn in its place — or, its note
// missing, a muted line saying so — never this note's words. `{==` round it,
// or round its link, and READ draws a paragraph where the embed was. The line
// is the same whether its note is there or not, so neither is anchored, and a
// selection from one goes on to the words after, as from a fence.
const EMBEDS = ['![[Missing note]]', '![[a/b]]', '![[a/b#Heading]]', '![[a/b#No such heading]]', '![[a/b|shown]]', '  ![[a/b]]  ']
ok('anchorFor: nothing on an embed, its note missing or there', EMBEDS.map((l) => anchorFor(l, 0, l.length)), EMBEDS.map(() => null))
ok("anchorFor: nothing inside an embed's link", anchorFor('![[Missing note]]', 4, 11), null)
ok('anchorFor: from an embed, the words after it', anchorFor('Intro\n\n![[Missing note]]\n\nAfter it', 7, 34)?.words, 'After it')
// An embed is only that on its own line: anywhere else, `![[…]]` is words.
ok('anchorFor: `![[…]]` in prose or an item is words', ['see ![[a/b]] here', '- ![[a/b]]'].map((l) => anchorFor(l, 0, l.length)?.words), ['see !b here', '!b'])
// And `sound`, which says whether a comment leaves READ as it was, says no to
// one that would turn the embed's line into a paragraph, however it is asked.
ok('sound: not round an embed', sound('![[Missing note]]', { kind: 'new', a: 0, b: 17, words: '!Missing note', lone: false }, 0, 17), false)
ok('anchorFor: a selection made backwards', anchorFor(PLAIN, 31, 18)?.words, 'crop rotation')
ok('sayable: one line, never closing early', sayable(' two\nlines <<} ok '), 'two lines << } ok')

// Written over generated lines, a comment never changes what READ shows, lands
// anchored to the words it was given, and resolved gives back the line exactly.
let written = 0
for (let i = 0; i < 6000; i++) {
  const line = seq(0, 6)
  const x = Math.floor(rnd() * (line.length + 1))
  const y = Math.min(line.length, x + Math.floor(rnd() * 14))
  const t = anchorFor(line, x, y)
  if (t?.kind !== 'new') continue
  written += 1
  const after = wrote(line, t, 'NEW')
  const mine = findComments(after).filter((c) => c.text === 'NEW')
  ok(`written ${i}: READ shows the same line`, shownText(after), shownText(line))
  ok(`written ${i}: one new comment, anchored to its words`, mine.map((c) => c.anchor?.words ?? null), [t.words])
  ok(`written ${i}: the others as they were`, findComments(after).filter((c) => c.text !== 'NEW').map((c) => c.text), findComments(line).map((c) => c.text))
  if (!t.lone && mine[0]) ok(`written ${i}: resolved, the line as it was`, applyChanges(after, resolveChanges(mine[0])), line)
  else if (!mine[0]) ok(`written ${i}: it is there`, JSON.stringify(line) + " → " + JSON.stringify(after), "")
}
ok('generated lines took comments', written > 3000, true)

ok('anchorFor: in a cell, read back as READ reads it', PIPED && [findComments(PIPED).map((c) => c.text), readComments(PIPED)], [['this | or that'], ['this | or that']])

/* ---------- written anywhere in a note ---------- */

/**
 * What READ draws of a note, its comments left out: the blocks, with each
 * run's anchor forgotten and the runs an anchor parted joined again.
 */
const isRuns = (x) => Array.isArray(x) && x.length > 0 && x.every((r) => r && typeof r === 'object' && typeof r.text === 'string' && !('kind' in r))
const drawnNote = (x) => {
  if (isRuns(x)) {
    const out = []
    for (const r of x) {
      if (r.comment !== undefined) continue
      const { anchor, ...rest } = r
      const prev = out[out.length - 1]
      if (prev && JSON.stringify({ ...prev, text: '' }) === JSON.stringify({ ...rest, text: '' })) prev.text += rest.text
      else out.push({ ...rest })
    }
    return out.filter((r) => r.text !== '')
  }
  if (Array.isArray(x)) return x.map(drawnNote)
  if (x && typeof x === 'object') return Object.fromEntries(Object.entries(x).map(([k, v]) => [k, drawnNote(v)]))
  return x
}
const lineAt = (body, i) => body.slice(0, i).split('\n').length - 1
// A selection anywhere in a generated note — from a bullet, a blank, a fence,
// a table's rule, an embed, across cells and blocks — written on, never changes what READ
// draws, lands on the words it said, and resolved gives back the note exactly.
let anywhere = 0
let inCells = 0
let onward = 0
let fromEmbeds = 0
/** Whether READ draws line `i` of a note as an embed. */
const embedOn = (body, i) => parseNote(body, { breaks: true }).some((b) => b.kind === 'embed' && b.span.from === i)
for (let i = 0; i < 5000; i++) {
  const body = Array.from({ length: 2 + Math.floor(rnd() * 8) }, lineOf).join('\n')
  const x = Math.floor(rnd() * (body.length + 1))
  const y = Math.min(body.length, x + Math.floor(rnd() * 40))
  const t = anchorFor(body, x, y)
  if (t?.kind !== 'new') continue
  anywhere += 1
  if (t.cell) inCells += 1
  if (lineAt(body, t.a) > lineAt(body, x)) onward += 1
  if (embedOn(body, lineAt(body, x))) fromEmbeds += 1
  const after = wrote(body, t, 'NEW | it')
  const mine = findComments(after).filter((c) => c.text === 'NEW | it')
  ok(`anywhere ${i}: READ draws the same note`, drawnNote(parseNote(after, { breaks: true })), drawnNote(parseNote(body, { breaks: true })))
  ok(`anywhere ${i}: one new comment, on its words`, mine.map((c) => c.anchor?.words ?? null), [t.words])
  ok(`anywhere ${i}: the others as they were`, findComments(after).filter((c) => c !== mine[0]).map((c) => c.text), findComments(body).map((c) => c.text))
  ok(`anywhere ${i}: READ draws it`, readComments(after), findComments(after).map((c) => c.text))
  ok(`anywhere ${i}: in the lines selected`, lineAt(body, t.a) >= lineAt(body, x) && lineAt(body, t.b) <= lineAt(body, y), true)
  if (!t.lone && mine[0]) ok(`anywhere ${i}: resolved, the note as it was`, applyChanges(after, resolveChanges(mine[0])), body)
}
ok('anywhere: generated notes took comments', anywhere > 1500, true)
ok('anywhere: some in a table cell', inCells > 100, true)
ok('anywhere: some past a first line with no words', onward > 100, true)
ok('anywhere: some from an embed, on to the words after', fromEmbeds > 20, true)

/* ---------- editing and resolving one ---------- */

const c0 = findComments(PLAN)[0]
ok('editChanges: what it says, changed', applyChanges(PLAN, editChanges(c0, 'say it once\nplainly')), PLAN.replace('define this before first use?', 'say it once plainly'))
ok('resolveChanges: the comment gone, its words unwrapped', applyChanges(PLAN, resolveChanges(c0)), PLAIN)
ok('resolveChanges: a bare one, gone', applyChanges('a {>>x<<} b', resolveChanges(findComments('a {>>x<<} b')[0])), 'a  b')
const moved = 'A new first line.\n' + PLAN
ok('findAgain: the same comment, moved', findAgain(moved, { from: c0.from, text: c0.text })?.from, c0.from + 'A new first line.\n'.length)
ok('findAgain: gone is gone', findAgain(PLAIN, { from: c0.from, text: c0.text }), null)

/* ---------- the pass: what Claude is asked ---------- */

const NOTE = [
  '# Rotation plan',
  '',
  PLAN,
  '',
  'Seed comes from three suppliers{>>which three? name them<<}, weighted by plot size.',
  '',
  '```',
  'code {>>not a comment<<}',
  '```',
  '',
  '- [ ] draft the {==charter==}{>>tighten this — one page at most<<} by Friday',
  ''
].join('\n')
const asked = reviewPrompt('projects/garden/rotation-plan.md', NOTE, findComments(NOTE))
ok('reviewPrompt: names the note by its path', asked.includes('`projects/garden/rotation-plan.md`') && asked.includes('[[projects/garden/rotation-plan]]'), true)
ok('reviewPrompt: says how many', asked.includes('There are 3:'), true)
ok('reviewPrompt: every comment, numbered, in order', [...asked.matchAll(/^(\d)\. “([^”]*)”/gm)].map((m) => [m[1], m[2]]), [
  ['1', 'define this before first use?'],
  ['2', 'which three? name them'],
  ['3', 'tighten this — one page at most']
])
ok('reviewPrompt: what each is about', [...asked.matchAll(/— (about “[^”]*”|at a point in the text), in this line/g)].map((m) => m[1]), [
  'about “crop rotation”',
  'at a point in the text',
  'about “charter”'
])
ok('reviewPrompt: the line each is in, as written', asked.includes('   The plan rests on {==crop rotation==}{>>define this before first use?<<} as its frame.'), true)
ok('reviewPrompt: nothing from a fence', asked.includes('not a comment'), false)
ok('reviewPrompt: what to do with each', [
  'answer it here, in this thread',
  'make that change in the note',
  'take it out of the note',
  'leaving the words themselves',
  'leave it in the note exactly as it is, and say why here',
  'Change nothing else in the note, and add no comments of your own'
].every((w) => asked.includes(w)), true)
ok('reviewPrompt: one comment is one', reviewPrompt('a.md', 'x {>>y<<}', findComments('x {>>y<<}')).includes('There is one:'), true)
const long = 'w '.repeat(200) + '{==it==}{>>c<<}' + ' z'.repeat(200)
const cut = reviewPrompt('a.md', long, findComments(long)).split('\n').find((l) => l.startsWith('   '))
ok('reviewPrompt: a long line cut to the words around it', cut.length < 200 && cut.includes('{==it==}{>>c<<}') && cut.trim().startsWith('…') && cut.endsWith('…'), true)

/* ---------- the counts ---------- */

ok('words: a comment is not words', wordCount('The plan {==rests on==}{>>a b c d<<} it.'), 5)
ok('words: a bare comment is not words', wordCount('one {>>two three<<} four'), 2)
ok('words: two on a line', wordCount('a {>>x<<} b {>>y z<<} c'), 3)
// Not a comment, so counted by the rule that was: `>` parts words, so `{` is one.
ok('words: in a code span it is words, as it was', wordCount('`{>>code<<}`'), 2)
ok('words: in a fence nothing is', wordCount('```\n{>>x y<<}\n```'), 0)
ok('words: one that does not close is words, as it was', wordCount('a {>>b c'), 4)
ok('words: a note with none, as it was', wordCount('# Title\n\n- [ ] one two\n**three** four'), 5)

// A double-click in READ lands on the words it was over, never inside a comment.
const raw = 'a {>>x y<<} b'
ok('a click past a comment lands past it', plainToRaw(raw, read(raw).text, 3), raw.indexOf('b'))
ok('a click before it lands before it', plainToRaw(raw, read(raw).text, 1), 1)

console.log(`${pass} pass, ${fail} fail`)
if (fails.length) console.log(fails.join('\n'))
process.exit(fail ? 1 : 0)
