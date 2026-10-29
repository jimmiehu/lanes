// The other half of checks/pdf.js: the PDF that landed on disk.
//
// A renderer script cannot read a file, and the preload bridge must not grow a
// method whose only caller is a check. So the app run writes the PDF (with
// `LANES_EXPORT_TO`) and this reads it — no library, just the bytes, because
// every claim worth making here is visible in them.
//
//   node --experimental-strip-types checks/pdf-file.mjs <path-to.pdf>
import { readFileSync } from 'node:fs'

const file = process.argv[2]
if (!file) {
  console.log('usage: node --experimental-strip-types checks/pdf-file.mjs <file.pdf>')
  process.exit(2)
}
const raw = readFileSync(file)
const text = raw.toString('latin1')

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

ok('it is a PDF', text.slice(0, 4), '%PDF')

// A4 is 595.28 x 841.89pt. The Electron default is US Letter (612 x 792), so
// this is the assertion that proves the export chose its own geometry rather
// than taking what it was given.
const boxes = [...new Set([...text.matchAll(/\/MediaBox\s*\[([^\]]*)\]/g)].map((m) => m[1].trim()))]
const [x0, y0, x1, y1] = (boxes[0] ?? '0 0 0 0').split(/\s+/).map(Number)
const w = (x1 - x0) / 72
const h = (y1 - y0) / 72
console.log(`  page: ${w.toFixed(2)} x ${h.toFixed(2)} in  (A4 = 8.27 x 11.69, Letter = 8.5 x 11)`)
ok('one page size throughout', boxes.length, 1)
ok('A4 wide', Math.abs(w - 8.27) < 0.05, true)
ok('A4 tall', Math.abs(h - 11.69) < 0.05, true)

const pages = [...text.matchAll(/\/Type\s*\/Page[^s]/g)].length
console.log(`  pages: ${pages}`)
ok('more than one page', pages >= 2, true)

// Real text, not a picture of text: a PDF of glyphs carries font objects.
ok('carries fonts, so the text is text', /\/Type\s*\/Font/.test(text), true)

// The grounds Lanes paints have to survive. `printBackground` defaults to
// FALSE, which would drop every one of them and leave ink floating on nothing.
ok('backgrounds were printed', /\/Type\s*\/ExtGState|re\s*f/.test(text), true)

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
