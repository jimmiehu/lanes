// THE EDITOR AND READ SPEAK ONE GRAMMAR — proved against every line of the vault.
//
// The writing surface draws markdown live, and the only way that is honest is
// if what it draws is what READ draws. A surface that renders `_this_` italic
// while you type it, and READ then shows the underscores, is the WYSIWYG that
// does not work — the thing this editor was rebuilt to end. So the editor does
// not speak CommonMark; it speaks READ's own grammar, restated with positions
// in `src/shared/mdLive.ts`.
//
// Restating a grammar is a way to fork it. This holds the two against each
// other on real text rather than on examples chosen to pass:
//
//   INLINE — for every line of every note, the text the editor leaves visible
//   once its markers are hidden (`shownText`) is exactly the text READ's
//   `parseRuns` produces. Same bold, same italic, same code, same link text,
//   same wikilink label (the alias, or the last segment of the path).
//
//   LINES — for every single-line block READ finds (heading, task, item, rule),
//   the editor's `classify` puts that line in the same kind, at the same level,
//   with the same done-ness.
//
//   RUNS — for every line of every note, READ and the editor's `blockRuns`
//   agree on whether it is fenced code, a table, one of a fold's own tags, or
//   none of those. CommonMark ends those runs elsewhere — a table there runs on
//   to the next blank line, `~~~` is a fence, a comment is HTML and a `<br>`
//   takes the lines under it into HTML with it — and the editor once asked
//   CommonMark.
//
//   AND AFTER AN EDIT — the editor does not find the runs again on every
//   keystroke. It reads from the run above an edit until the note is back in
//   step (`blockRunsAfter`), and that shortcut is held here to reading the whole
//   note again, over edits made to every note in the vault: the same runs, and
//   a keystroke in prose reading a handful of lines however long the note.
//
// Read-only. Walks $LANES_VAULT, or the sample vault in fixtures/ if unset:
//
//   node --experimental-strip-types checks/md-live.mjs
import { readdir, readFile } from 'node:fs/promises'
import { join, extname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { inlineTokens, shownText, classify, blockRuns, blockRunsAfter } from '../src/shared/mdLive.ts'
import { parseRuns } from '../src/shared/blocks.ts'
import { parseNote } from '../src/shared/doc.ts'

const VAULT = process.env.LANES_VAULT ?? fileURLToPath(new URL('../fixtures/sample-vault', import.meta.url))
const SKIP = new Set(['.git', '.obsidian', '.claude', 'node_modules', '.trash'])

async function walk(dir, out) {
  let es
  try {
    es = await readdir(dir, { withFileTypes: true })
  } catch {
    return
  }
  for (const e of es) {
    if (e.name.startsWith('.') || SKIP.has(e.name)) continue
    const full = join(dir, e.name)
    if (e.isDirectory()) await walk(full, out)
    else if (extname(e.name) === '.md') out.push(full)
  }
}

let failed = 0
const fails = []
const miss = (what, detail) => {
  failed++
  if (fails.length < 12) fails.push(`  ✗ ${what}\n      ${detail}`)
}

/* ---------- the cases the rules exist for, stated first ---------- */

const same = (line, what) => {
  const want = parseRuns(line).map((r) => r.text).join('')
  const got = shownText(line)
  if (got !== want) miss(what, `${JSON.stringify(line)}\n      editor ${JSON.stringify(got)}\n        read ${JSON.stringify(want)}`)
}
same('plain words', 'prose is prose')
same('A **bold [[a/b/note]] lead** then *soft* and `code`.', 'bold recurses into a wikilink')
same('[[reading/cities/oslo\\|Oslo]] in a table cell', 'an escaped alias pipe')
same('[[a/b/c]] shows its last segment', 'a bare wikilink reads as its last segment')
same('_underscores_ are literal in READ', 'no underscore emphasis')
same('~~strike~~ is literal in READ', 'no strikethrough')
same('see [the **docs**](https://x.y/z) now', 'link text recurses')
same('Note written: daily/2026-08-21.md', 'a bare vault path')
same('`projects/garden/seed-trays/a.md` in backticks', 'a vault path in a code span')

const kind = (line, want, what) => {
  const got = classify(line)
  const ok = Object.entries(want).every(([k, v]) => got[k] === v)
  if (!ok) miss(what, `${JSON.stringify(line)} → ${JSON.stringify(got)}, want ${JSON.stringify(want)}`)
}
kind('## Section', { k: 'heading', level: 2, markTo: 3 }, 'a heading')
kind('###### six', { k: 'heading', level: 4 }, 'six hashes draw as four')
kind('  ## indented', { k: 'para' }, 'an indented ## is prose')
kind('#tag', { k: 'para' }, 'a hashtag is not a heading')
kind('- [ ] open', { k: 'task', done: false }, 'an open task')
kind('  * [X] done', { k: 'task', done: true, indent: 2 }, 'a done task, nested')
kind('12. twelfth', { k: 'ordered' }, 'an ordinal')
kind('- item', { k: 'bullet', markTo: 2 }, 'a bullet')
kind('---', { k: 'rule' }, 'a rule')
kind('> quoted', { k: 'quote', markTo: 2 }, 'a quote')

/**
 * What each line is to READ — `c` fenced code, `t` a table, `h` one of a fold's
 * own tags, `.` none of those — from `parseNote`'s spans. A fold's tags are its
 * lines that none of its blocks came from, and always its `<details>` line.
 */
const readRuns = (lines) => {
  const k = lines.map(() => '.')
  const last = lines.length - 1
  const walk = (bs) => {
    for (const b of bs) {
      const to = Math.min(b.span.to, last)
      if (b.kind === 'code' || b.kind === 'table') for (let i = b.span.from; i <= to; i++) k[i] = b.kind[0]
      if (b.kind !== 'details') continue
      walk(b.blocks)
      const inner = new Set()
      for (const c of b.blocks) for (let i = c.span.from; i <= Math.min(c.span.to, last); i++) inner.add(i)
      for (let i = b.span.from; i <= to; i++) if (i === b.span.from || (!inner.has(i) && lines[i].trim())) k[i] = 'h'
    }
  }
  walk(parseNote(lines.join('\n')))
  return k.join('')
}
/** The same, from the editor's runs — which must also be in order and never overlap. */
const editorRuns = (lines, runs = blockRuns((i) => lines[i], lines.length)) => {
  const k = lines.map(() => '.')
  let ordered = true
  const put = (rs) => {
    let after = -1
    for (const r of rs) {
      if (r.from <= after || r.to < r.from) ordered = false
      after = r.to
      if (r.k !== 'fold') for (let i = r.from; i <= r.to; i++) k[i] = r.k[0]
      else {
        put(r.inner)
        for (const t of r.tags) k[t] = 'h'
      }
    }
  }
  put(runs)
  return ordered ? k.join('') : 'out of order'
}
const runs = (lines, want, what) => {
  const read = readRuns(lines)
  const got = editorRuns(lines)
  if (read !== want || got !== want)
    miss(what, `${JSON.stringify(lines)}\n      editor ${got}\n        read ${read}\n        want ${want}`)
}
runs(['| a | b |', '|---|---|', '| 1 | 2 |', 'A **sentence** straight under it'], 'ttt.', 'a table ends at the first line without a pipe')
runs(['| a | b | c |', '|---|---|', '| 1 | 2 |'], 'ttt', 'a rule with fewer columns is still a table')
runs(['a | b', '---|---', '1 | 2'], '...', 'a table without outer pipes is prose')
runs(['<br>', 'Words **under** it', '- an item'], '...', 'a <br> line is prose, and so is what follows it')
runs(['<!-- a comment', '- with a list in it -->'], '..', 'a comment is prose')
runs(['<aside>', '💡', '</aside>'], '...', 'HTML that is not a fold is prose')
runs(['~~~', 'not code', '~~~'], '...', '~~~ is not a fence')
runs(['```', 'code', '```js', 'prose again'], 'ccc.', 'any ``` closes a fence')
runs(['```', 'never closed', '', 'still code'], 'cccc', 'an unclosed fence runs to the end')
runs(['> ```', '> quoted'], '..', 'a fence in a quote is a quote')
runs(['<details><summary>Fold</summary>', '- an item', '## A heading', '', '</details>'], 'h...h', "a fold's body straight under its summary is markdown")
runs(['<details>', '', '<summary>', 'Two lines', '</summary>', '| a |', '|---|', '</details>'], 'h.hhhtth', 'a summary over several lines, and a table in the body')
runs(['<details>', '<summary>Out</summary>', '<details><summary>In</summary>', '```', 'x', '```', '</details>', '</details>', 'after'], 'hhhccchh.', 'a fold in a fold, with a fence in it')
runs(['<details>', 'never closed', '```'], 'h.c', 'an unclosed fold runs to the end')

/** The runs kept through one edit, from `before` to `after`, against a fresh read. */
const kept = (before, after, what) => {
  let a = 0
  while (a < before.length && a < after.length && before[a] === after[a]) a++
  let same = 0
  while (same < before.length - a && same < after.length - a && before[before.length - 1 - same] === after[after.length - 1 - same]) same++
  const last = Math.max(a, after.length - 1 - same)
  const was = blockRuns((i) => before[i], before.length)
  const got = blockRunsAfter(was, (i) => after[i], after.length, a, last, after.length - before.length)
  const want = blockRuns((i) => after[i], after.length)
  if (JSON.stringify(got) !== JSON.stringify(want)) miss(what, `kept ${JSON.stringify(got)}\n      want ${JSON.stringify(want)}`)
}
kept(['| a |', 'x', 'prose'], ['| a |', '|---|', 'prose'], 'a rule typed under a row makes the row above it a table')
kept(['| a |', '|---|', '| 1 |', 'prose', 'more'], ['| a |', '|---|', '| 1 |', '| 2 |', 'more'], 'a row typed under a table joins it')
kept(['p', '| a |', '|---|', 'q', '```', 'x', '```'], ['```', '| a |', '|---|', 'q', '```', 'x', '```'], 'a fence opened above a table swallows it')
kept(['```', 'a', 'b', 'c', 'd'], ['```', 'a', '```', 'c', 'd'], 'a fence closed far above the end')
kept(['<details>', '<summary>S</summary>', 'x', '</details>', '```', 'y', '```'], ['<details>', '<summary>S</summary>', 'x', '', '```', 'y', '```'], "a fold's closing tag taken away")

/* ---------- and then the vault, every line of it ---------- */

/*
 * One edit to a note, the way the editor reports it: `a` the first line it
 * touched, `last` the last as it reads after. A fixed seed, so a failure is the
 * same failure the next time.
 */
let seed = 7
const rand = (n) => {
  seed = (seed * 1103515245 + 12345) % 2147483648
  return seed % n
}
const HOT = ['```', '```js', '| a | b |', '|---|---|', '| 1 | 2 |', '<details>', '<details><summary>S</summary>', '<summary>S</summary>', '</details>', '', 'prose', '~~~', '> quote']
function edit(text) {
  const starts = [0]
  for (let i = 0; i < text.length; i++) if (text[i] === '\n') starts.push(i + 1)
  const n = starts.length
  const lineOf = (s, pos) => {
    let k = 0
    for (let i = 0; i < pos; i++) if (s[i] === '\n') k++
    return k
  }
  const L = rand(n)
  const from = starts[L]
  const end = L + 1 < n ? starts[L + 1] - 1 : text.length
  let a = from
  let b = from
  let insert = ''
  let what
  switch (rand(5)) {
    case 0:
      what = 'a line rewritten'
      b = end
      insert = HOT[rand(HOT.length)]
      break
    case 1:
      what = 'a line put in'
      insert = HOT[rand(HOT.length)] + '\n'
      break
    case 2:
      what = 'lines taken out'
      b = starts[Math.min(n - 1, L + 1 + rand(3))] ?? text.length
      if (b <= a) b = end
      break
    case 3:
      what = 'a block pasted'
      insert = ['```\ncode\n```\n', '| x | y |\n|---|---|\n| 1 | 2 |\n', '<details><summary>S</summary>\nbody\n</details>\n'][rand(3)]
      break
    default:
      what = 'a letter typed'
      a = b = end
      insert = 'x'
  }
  const out = text.slice(0, a) + insert + text.slice(b)
  return { text: out, a: lineOf(text, a), last: lineOf(out, a + insert.length), what, line: L }
}

const files = []
await walk(VAULT, files)
let lines = 0
let blocks = 0
let ranLines = 0
let edits = 0
let proseKeys = 0
let mostRead = 0
for (const f of files) {
  let raw
  try {
    raw = await readFile(f, 'utf8')
  } catch {
    continue
  }
  const body = raw.startsWith('---') ? raw.slice(raw.indexOf('\n', raw.indexOf('\n---', 3) + 1) + 1) : raw
  const src = body.split('\n')
  for (const line of src) {
    lines++
    // A line with nothing READ would style is the overwhelming majority; the
    // comparison is cheap, so every line goes through it regardless.
    const want = parseRuns(line).map((r) => r.text).join('')
    const got = shownText(line)
    if (got !== want) miss(`inline text differs in ${f.slice(VAULT.length + 1)}`, `${JSON.stringify(line.slice(0, 140))}\n      editor ${JSON.stringify(got.slice(0, 140))}\n        read ${JSON.stringify(want.slice(0, 140))}`)
    // Every token range must lie inside the line and in order — a range that
    // runs past its line would decorate the next one.
    let at = 0
    for (const t of inlineTokens(line)) {
      if (t.from < at || t.to > line.length || t.from >= t.to) {
        miss(`a token outside its line in ${f.slice(VAULT.length + 1)}`, JSON.stringify(line.slice(0, 140)))
        break
      }
      at = t.to
    }
  }
  const walkBlocks = (bs) => {
    for (const b of bs) {
      if (b.kind === 'details') {
        walkBlocks(b.blocks)
        continue
      }
      if (b.span.from !== b.span.to) continue
      const line = src[b.span.from]
      if (line === undefined) continue
      const c = classify(line)
      const expect =
        b.kind === 'heading'
          ? c.k === 'heading' && c.level === b.level
          : b.kind === 'task'
            ? c.k === 'task' && c.done === b.done
            : b.kind === 'item'
              ? c.k === 'bullet' || c.k === 'ordered'
              : b.kind === 'rule'
                ? c.k === 'rule'
                : true
      if (['heading', 'task', 'item', 'rule'].includes(b.kind)) blocks++
      if (!expect) miss(`line kind differs in ${f.slice(VAULT.length + 1)}:${b.span.from + 1}`, `${JSON.stringify(line.slice(0, 120))}: READ ${b.kind}${b.level ? b.level : ''}, editor ${JSON.stringify(c)}`)
    }
  }
  walkBlocks(parseNote(body))

  // RUNS: every line, the same kind to both.
  const read = readRuns(src)
  const ran = blockRuns((i) => src[i], src.length)
  const drawn = editorRuns(src, ran)
  for (const c of drawn) if (c !== '.') ranLines++
  if (drawn !== read) {
    const at = [...read].findIndex((c, i) => c !== drawn[i])
    miss(`runs differ in ${f.slice(VAULT.length + 1)}:${at + 1}`, `${JSON.stringify((src[at] ?? '').slice(0, 120))}: READ ${read[at]}, editor ${drawn[at] ?? drawn}`)
  }

  // AND AFTER AN EDIT: four edits to every note, each the kind that moves a run,
  // at a place chosen by a fixed seed — the runs kept through them must be the
  // runs read from scratch.
  let text = body
  let was = ran
  for (let e = 0; e < 4; e++) {
    const at = edit(text)
    const next = at.text.split('\n')
    let reads = 0
    const got = blockRunsAfter(was, (i) => (reads++, next[i]), next.length, at.a, at.last, next.length - text.split('\n').length)
    const fresh = blockRuns((i) => next[i], next.length)
    edits++
    if (JSON.stringify(got) !== JSON.stringify(fresh)) {
      miss(`runs kept through an edit differ in ${f.slice(VAULT.length + 1)}`, `${at.what} at line ${at.a + 1}`)
      break
    }
    // A letter on a line of prose, under a line of prose: what the claim is about.
    const inRun = (x) => was.some((r) => r.from <= x && x <= r.to)
    if (at.what === 'a letter typed' && !inRun(at.line) && !inRun(at.line - 1)) {
      proseKeys++
      mostRead = Math.max(mostRead, reads)
    }
    text = at.text
    was = got
  }
}
if (mostRead > 8) miss('a keystroke in prose read too much', `${mostRead} lines read to keep the runs through one letter`)

for (const f of fails) console.log(f)
console.log(
  `\n${files.length} notes · ${lines.toLocaleString()} lines · ${blocks.toLocaleString()} single-line blocks compared`
)
console.log(
  `${ranLines.toLocaleString()} lines in a fence, a table or a fold's tags · ${edits.toLocaleString()} edits kept through · ${proseKeys.toLocaleString()} keystrokes in prose, each reading at most ${mostRead} lines`
)
console.log(failed ? `${failed} disagreements` : 'the editor and READ agree on every line')
process.exit(failed ? 1 : 0)
