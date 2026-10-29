// Reading a quoted note back out of a transcript.
//
// Pure, so it runs in node rather than against the app:
//
//   node --experimental-strip-types checks/transcript.mjs
//
// A quote goes onto the wire inlined — the model needs the excerpt, not a block
// it cannot see — so this is the only thing standing between a reader and the
// raw `From the note "…":` scaffolding with `>` markers down its left. It is
// worth a check of its own because its failure mode is silence: an unmatched
// payload simply comes back as itself, looking like a message someone typed.
import { quoteWire, unquote } from '../src/shared/quote.ts'

let failed = 0
const eq = (name, got, want) => {
  const a = JSON.stringify(got)
  const b = JSON.stringify(want)
  if (a === b) console.log('ok   ', name)
  else {
    failed += 1
    console.log('FAIL ', name, '\n      got ', a, '\n      want', b)
  }
}

// The real writer, so the two halves are checked against each other rather than
// against a copy of one of them. buildMessages trims what it reads.
const wire = (label, quote, text) => quoteWire({ label, text: quote }, text).trim()

const trip = (name, label, quote, text) =>
  eq(name, unquote(wire(label, quote, text)), {
    said: text.trim(),
    quote: { kind: 'quote', label, text: quote }
  })

trip('one line', 'My Note', 'a single line', 'what do you think?')
trip('several lines', 'Deep Note', 'line one\nline two\nline three', 'and then?')
trip('a blank line inside the excerpt', 'N', 'para one\n\npara two', 'go on')
trip('nothing said under it', 'N', 'just this', '')
trip('blank lines in what was said', 'N', 'q', 'first para\n\nsecond para')
trip('a > in what was said', 'N', 'q', 'compare a > b')
trip('markdown under it', 'N', 'q', '# heading\n\n- a\n- b')

// A note's title is its own H1 and goes onto the wire unescaped. Plenty of
// titles have a quotation mark in them, and the label group used to stop at
// the first one — failing the whole match, so the reader got the scaffolding
// and the thread was named `From the note "`.
trip('a quoted title', 'A. A. "Ada" Lovelace', 'the engine weaves patterns', 'what did she mean?')
trip('a title ending on a quote', 'The Plot Is Smaller Than It Looks from the Gate"', 'x', 'y')
trip('a title that is only quotes', '"AI"', 'x', 'y')
trip('a colon in the title', 'Hopper: "Nanosekunde"', 'x', 'y')
trip('a quoted title and a quoted body', 'A "B" C', 'she said "hello"', 'and "then"?')

// Anything that is not the wrapper comes back untouched.
for (const plain of [
  'just a message',
  'From the note that I read yesterday',
  'From the note "x": no blank line after it',
  '> a bare quote',
  'From the note "x":\n\nno marker on this line',
  ''
]) {
  eq(`left alone: ${JSON.stringify(plain.slice(0, 34))}`, unquote(plain), {
    said: plain,
    quote: null
  })
}

console.log(failed ? `\n${failed} FAILED` : '\nall passed')
process.exit(failed ? 1 : 0)
