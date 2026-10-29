// Collapsible sections: `<details><summary>…</summary> … </details>`.
//
// The one piece of HTML the note parser reads, because it is the one markdown
// has no syntax for and every markdown host has settled on the same answer to.
// Without it the tags rendered as words in the middle of the prose.
//
// The claim that actually needs proving is the SPANS. Every block knows the
// source lines it came from — that is what lets a selection be copied back out
// as markdown and what an in-place edit splices — and a folded body is parsed
// by a second call to `parseNote`, whose spans start again at zero. They have
// to be shifted back into the note's own numbering, RECURSIVELY, or a paragraph
// inside a fold inside a fold points at the wrong line and an edit there
// rewrites something else.
//
// A pure module, so node rather than a running app:
//   node --experimental-strip-types checks/details.mjs
import { parseNote } from '../src/shared/doc.ts'

let pass = 0
let fail = 0
const ok = (name, got, want) => {
  const same = JSON.stringify(got) === JSON.stringify(want)
  if (same) pass += 1
  else {
    fail += 1
    console.log(`  FAIL ${name}\n       got  ${JSON.stringify(got)}\n       want ${JSON.stringify(want)}`)
  }
}
const text = (runs) => runs.map((r) => r.text).join('')
const kinds = (bs) => bs.map((b) => b.kind).join(',')

/* ---------- 1. the shape the whole world writes ---------- */

const basic = [
  '# Title',
  '',
  'Intro prose.',
  '',
  '<details>',
  '<summary>Click to expand</summary>',
  '',
  '## Inside heading',
  '',
  'Hidden prose.',
  '',
  '- an item',
  '',
  '</details>',
  '',
  'After.'
]
const b = parseNote(basic.join('\n'))
ok('folds into one block among the others', kinds(b), 'heading,para,details,para')
const d = b.find((x) => x.kind === 'details')
ok('the summary is the label', text(d.summary), 'Click to expand')
ok('closed unless told otherwise', d.open, false)
ok('the outer span covers the tags', d.span, { from: 4, to: 13 })
ok('the body is ordinary markdown', kinds(d.blocks), 'heading,para,item')

/* ---------- 2. and every inner span points at the line it came from ---------- */

ok(
  'inner spans are the note’s own line numbers',
  d.blocks.map((x) => x.span.from),
  [7, 9, 11]
)
ok(
  'and the source at those lines is what was parsed',
  d.blocks.map((x) => basic[x.span.from]),
  ['## Inside heading', 'Hidden prose.', '- an item']
)

/* ---------- 3. nesting, which is where the shift has to recurse ---------- */

const nested = [
  '<details>',
  '<summary>Outer</summary>',
  '',
  '<details>',
  '<summary>Inner</summary>',
  '',
  'deep',
  '',
  '</details>',
  '',
  '</details>'
]
const n = parseNote(nested.join('\n'))
ok('one fold at the top', kinds(n), 'details')
ok('holding another', kinds(n[0].blocks), 'details')
ok('with its own label', text(n[0].blocks[0].summary), 'Inner')
// The one that was wrong: shifted once by the inner parse and never again.
ok('a twice-folded span still points home', n[0].blocks[0].blocks[0].span.from, 6)
ok('and that line is the right line', nested[n[0].blocks[0].blocks[0].span.from], 'deep')
ok('the inner fold’s own span too', n[0].blocks[0].span, { from: 3, to: 8 })

/* ---------- 4. the attribute, and the edges ---------- */

ok('open starts open', parseNote('<details open>\n<summary>S</summary>\n\nx\n\n</details>')[0].open, true)
ok(
  'a summary with markdown in it',
  text(parseNote('<details>\n<summary>A **bold** label</summary>\n\nx\n\n</details>')[0].summary),
  'A bold label'
)
const noSummary = parseNote('<details>\n\nbody\n\n</details>')[0]
ok('no summary still folds', noSummary.kind, 'details')
ok('and says so', text(noSummary.summary), 'Details')
ok('keeping its whole body', kinds(noSummary.blocks), 'para')
// A browser swallows the rest of the document too; leaving it as prose would
// show the tag.
const unclosed = parseNote('<details>\n<summary>S</summary>\n\nbody\n')
ok('unclosed still folds', kinds(unclosed), 'details')
ok('and keeps what followed', kinds(unclosed[0].blocks), 'para')
// Everything a note can hold, inside a fold.
ok(
  'tables and fences survive the fold',
  kinds(parseNote('<details>\n<summary>S</summary>\n\n| a | b |\n|---|---|\n| 1 | 2 |\n\n```js\nx\n```\n\n</details>')[0].blocks),
  'table,code'
)

/* ---------- 5. and a note with no folds is untouched ---------- */

ok('plain notes are unchanged', kinds(parseNote('# H\n\np\n\n- i')), 'heading,para,item')
// `<details>` only opens a fold on a line of its own — a mention inside prose
// is prose.
ok(
  'a tag mentioned mid-sentence is not a fold',
  kinds(parseNote('Use the <details> tag for this.')),
  'para'
)

/* ---------- THE TAG NEED NOT HAVE ITS LINE TO ITSELF ---------- */

// `<details><summary>…</summary>` on one line is the form every example anybody
// copies is written in, and it was the one form this could not read: a note
// using it produced NO folds and showed the raw tags as words in the prose.
{
  const doc = [
    '# T', '',                              // 0 1
    '<details><summary>S</summary>', '',    // 2 3
    'Body prose here.', '',                 // 4 5
    '- [ ] a task in the fold', '',         // 6 7
    '</details>', '',                       // 8 9
    'After.'                                // 10
  ]
  const blocks = parseNote(doc.join('\n'))
  const fold = blocks.find((b) => b.kind === 'details')
  ok('one-line opener parses at all', Boolean(fold), true)
  ok('the fold spans its own tags', [fold.span.from, fold.span.to], [2, 8])
  ok('the summary is read off the opening line', fold.summary.map((r) => r.text).join(''), 'S')

  // THE CLAIM THAT MATTERS. `span.from` is the line the text is REALLY on, and
  // an in-place edit splices exactly those lines — so an off-by-one here is a
  // silent write to the wrong line of somebody's note, not a cosmetic slip.
  const prose = fold.blocks.find((b) => b.kind === 'para')
  const task = fold.blocks.find((b) => b.kind === 'task')
  ok('inner prose claims its own line', doc[prose.span.from].trim(), 'Body prose here.')
  ok('inner task claims its own line', doc[task.span.from].trim(), '- [ ] a task in the fold')
  // `line` is what ticking a checkbox rewrites, and it is carried separately.
  ok('a task ticks the line it is on', doc[task.line].trim(), '- [ ] a task in the fold')
  ok('the block after the fold is untouched', blocks.at(-1).span.from, 10)
}

// The two-line form, which already worked, still works — and lands identically.
{
  const two = ['<details>', '<summary>S</summary>', '', 'Body.', '', '</details>']
  const f = parseNote(two.join('\n')).find((b) => b.kind === 'details')
  ok('two-line form still parses', Boolean(f), true)
  ok(
    'two-line inner prose claims its own line',
    two[f.blocks.find((b) => b.kind === 'para').span.from].trim(),
    'Body.'
  )
}

// What must still NOT be a fold. The only thing telling a real fold from prose
// about folds is that the tag STARTS the line, so that anchor is load-bearing.
ok(
  'a tag mid-sentence stays prose',
  parseNote('Use the <details><summary>x</summary> tag for this.').filter((b) => b.kind === 'details').length,
  0
)
ok(
  'a tag in backticks stays prose',
  parseNote('Write `<details><summary>…</summary>` for a fold.').filter((b) => b.kind === 'details').length,
  0
)

// The `open` attribute is tested against the ATTRIBUTES, never the summary —
// fold the two into one capture and a section labelled "…the one open question"
// (as ordinary a label as any) would silently start expanded.
{
  const withOpenInLabel = ['<details><summary>Where it stands, and the one open question</summary>', '', 'x', '', '</details>']
  ok(
    'the word "open" in a summary does not open the fold',
    parseNote(withOpenInLabel.join('\n')).find((b) => b.kind === 'details').open,
    false
  )
  ok(
    'but the real attribute does',
    parseNote(['<details open><summary>S</summary>', '', 'x', '', '</details>'].join('\n')).find((b) => b.kind === 'details').open,
    true
  )
}

// Nesting, with the one-line form on both levels. The depth counter reads the
// same shapes as the opener, or a one-line fold inside another closes its
// PARENT early — which corrupts the parent's span as well as leaking a tag.
{
  const nest = ['<details><summary>Outer</summary>', '', '<details><summary>Inner</summary>', '', 'deep', '', '</details>', '', 'tail', '', '</details>']
  const outer = parseNote(nest.join('\n')).find((b) => b.kind === 'details')
  ok('the outer fold survives a one-line fold inside it', outer.span.to, 10)
  const inner = outer.blocks.find((b) => b.kind === 'details')
  ok('the inner fold is found', Boolean(inner), true)
  ok('nested inner prose claims its own line', nest[inner.blocks.find((b) => b.kind === 'para').span.from].trim(), 'deep')
  ok("the outer fold's own tail claims its line", nest[outer.blocks.filter((b) => b.kind === 'para').at(-1).span.from].trim(), 'tail')
}

// A `</summary>` need not end its line either: the fallback branch never
// re-read its own line, so it scanned forward for a tag it had already passed
// and ate the whole body into the label.
ok(
  'trailing text after </summary> does not swallow the body',
  parseNote(['<details>', '<summary>S</summary> and more', '', 'Body.', '', '</details>'].join('\n'))
    .find((b) => b.kind === 'details')
    .blocks.filter((b) => b.kind === 'para').length,
  1
)

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
