// The other half of checks/comments-read.js: the PDF of a note with comments in
// it — the anchors' words on paper, and none of the comments.
//
// A review's marks are not the document, so an export draws the note as READ
// draws it with its comments taken off: an anchor is its words, and a comment
// is not there at all. The words are read back out of the file itself — every
// glyph Chromium writes is a `Tj` in a font that carries a ToUnicode map, so
// the text on the page can be recovered exactly, no library needed. The fenced
// `{>>not a comment<<}` is there as the control: the reading would see a
// comment's words if they had been printed, because it sees those.
//
//   node --experimental-strip-types checks/comments-pdf.mjs /tmp/pdf-out/<note>.pdf
import { readFileSync } from 'node:fs'
import { inflateSync } from 'node:zlib'

const file = process.argv[2]
if (!file) {
  console.log('usage: node --experimental-strip-types checks/comments-pdf.mjs <file.pdf>')
  process.exit(2)
}
const raw = readFileSync(file)
const s = raw.toString('latin1')

/** Every object: its dictionary, and for a stream its bytes, inflated. */
const objects = new Map()
for (const m of s.matchAll(/(?:^|\n)(\d+) 0 obj\s*/g)) {
  const at = m.index + m[0].length
  const end = s.indexOf('endobj', at)
  const st = s.indexOf('stream', at)
  if (st === -1 || st > end) {
    objects.set(Number(m[1]), { dict: s.slice(at, end), data: null })
    continue
  }
  const dict = s.slice(at, st)
  let from = st + 'stream'.length
  if (s[from] === '\r') from += 1
  if (s[from] === '\n') from += 1
  const len = /\/Length (\d+)(?!\s+\d+\s+R)/.exec(dict)
  const to = len ? from + Number(len[1]) : s.indexOf('endstream', from)
  let data = raw.subarray(from, to)
  if (/FlateDecode/.test(dict)) data = inflateSync(data)
  objects.set(Number(m[1]), { dict, data })
}

/** A ToUnicode map: code (as hex) to the text it stands for. */
const cmap = (text) => {
  const map = new Map()
  const utf16 = (hex) => {
    let out = ''
    for (let i = 0; i < hex.length; i += 4) out += String.fromCharCode(parseInt(hex.slice(i, i + 4), 16))
    return out
  }
  for (const b of text.matchAll(/beginbfchar([\s\S]*?)endbfchar/g))
    for (const p of b[1].matchAll(/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/g)) map.set(p[1].toUpperCase(), utf16(p[2]))
  for (const b of text.matchAll(/beginbfrange([\s\S]*?)endbfrange/g))
    for (const p of b[1].matchAll(/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*(?:<([0-9A-Fa-f]+)>|\[([^\]]*)\])/g)) {
      const lo = parseInt(p[1], 16)
      const hi = parseInt(p[2], 16)
      const listed = p[4] ? [...p[4].matchAll(/<([0-9A-Fa-f]+)>/g)].map((x) => x[1]) : null
      for (let c = lo; c <= hi; c++) {
        const code = c.toString(16).toUpperCase().padStart(p[1].length, '0')
        if (listed) map.set(code, utf16(listed[c - lo] ?? ''))
        else {
          const base = parseInt(p[3], 16) + (c - lo)
          map.set(code, utf16(base.toString(16).padStart(p[3].length, '0')))
        }
      }
    }
  return map
}

/** The fonts a page names, each with how wide its codes are and what they say. */
const fontsOf = (page) => {
  const fonts = new Map()
  const block = /\/Font\s*<<([\s\S]*?)>>/.exec(page)
  for (const f of block ? block[1].matchAll(/\/(\S+?)\s+(\d+) 0 R/g) : []) {
    const dict = objects.get(Number(f[2]))?.dict ?? ''
    const tu = /\/ToUnicode (\d+) 0 R/.exec(dict)
    fonts.set(f[1], {
      width: /\/Subtype \/Type0/.test(dict) ? 4 : 2,
      map: tu ? cmap(objects.get(Number(tu[1]))?.data?.toString('latin1') ?? '') : new Map()
    })
  }
  return fonts
}

/** The text a page shows, in the order it is drawn. */
let text = ''
let pages = 0
for (const { dict } of objects.values()) {
  if (!/\/Type \/Page\b/.test(dict)) continue
  pages += 1
  const fonts = fontsOf(dict)
  const refs = /\/Contents\s*(?:(\d+) 0 R|\[([^\]]*)\])/.exec(dict)
  const nums = refs?.[1] ? [refs[1]] : [...(refs?.[2] ?? '').matchAll(/(\d+) 0 R/g)].map((x) => x[1])
  for (const n of nums) {
    const content = objects.get(Number(n))?.data?.toString('latin1') ?? ''
    let font = null
    for (const op of content.matchAll(/\/(\S+?)\s+[\d.]+\s+Tf|<([0-9A-Fa-f]*)>\s*Tj|\[([^\]]*)\]\s*TJ|\bET\b/g)) {
      if (op[1]) font = fonts.get(op[1]) ?? null
      else if (op[0] === 'ET') text += '\n'
      else {
        const hexes = op[2] !== undefined ? [op[2]] : [...op[3].matchAll(/<([0-9A-Fa-f]*)>/g)].map((x) => x[1])
        for (const hex of hexes)
          for (let i = 0; font && i < hex.length; i += font.width) text += font.map.get(hex.slice(i, i + font.width).toUpperCase()) ?? '?'
      }
    }
  }
}

let pass = 0
let fail = 0
const ok = (name, got, want) => {
  if (JSON.stringify(got) === JSON.stringify(want)) pass += 1
  else {
    fail += 1
    console.log(`  FAIL ${name}\n       got  ${JSON.stringify(got)}\n       want ${JSON.stringify(want)}`)
  }
}
const letters = text.replace(/\s+/g, '')
const has = (words) => letters.includes(words.replace(/\s+/g, ''))

ok('it is a PDF', s.slice(0, 4), '%PDF')
ok('its text reads back', has('The plan rests on'), true)
ok("an anchor's words print", has('crop rotation as its frame.'), true)
ok("a task's anchor prints as its words", has('a task with an anchor here'), true)
ok('an anchored comment does not print', has('define this before first use'), false)
ok('a comment at a point does not print', has('a note at a point'), false)
ok("a task's comment does not print", has('and its comment'), false)
// The control: a comment's shape inside a fence is code, printed as written —
// so the reading above would have seen the others.
ok('code that looks like a comment prints, as code', has('{>>not a comment<<}'), true)
ok('no braces print but the code', (letters.match(/\{>>|\{==/g) ?? []).length, 1)

if (process.env.SHOW) console.log(text)
console.log(`  ${pages} page${pages === 1 ? '' : 's'}, ${text.trim().split('\n').length} lines of text read back`)
console.log(`${pass} pass, ${fail} fail`)
process.exit(fail ? 1 : 0)
