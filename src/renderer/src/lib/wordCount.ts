/**
 * Words, the way a writing app counts them — the one count the head reports,
 * whichever surface the note is on. Code fences are not words; the markdown
 * punctuation around words is not either.
 *
 * ONE PASS, NO COPIES. The count used to be three regex passes, each building a
 * new copy of the note, and it runs on every save — which on a long note was
 * a quarter of a second of frozen window after every pause in the typing.
 * The rule is unchanged, character for character: a fenced block, from one
 * ``` to the next, counts nothing; `#>*_`~[]()|-` separate words the way
 * spaces do; a word is a run of anything else.
 *
 * And a comment, `{>>…<<}` closed on its own line, counts nothing either: its
 * words are about the note, not in it. Not inside a code span, where READ shows
 * it as the characters it is — so a span closed on its line is read through
 * with no comment looked for, as the grammar reads it.
 */
const SEP = new Uint8Array(128)
for (const c of ' \t\n\r\v\f#>*_`~[]()|-') SEP[c.charCodeAt(0)] = 1

const separates = (code: number): boolean =>
  code < 128 ? SEP[code] === 1 : code === 0xa0 || code === 0x1680 || (code >= 0x2000 && code <= 0x200a) || code === 0x2028 || code === 0x2029 || code === 0x202f || code === 0x205f || code === 0x3000 || code === 0xfeff

export function wordCount(body: string): number {
  let words = 0
  let inWord = false
  let i = 0
  const n = body.length
  /** Where the code span being read ends: no comment starts before it. */
  let code = -1
  /** Whether `mark` closes after `from` on the same line, and where. */
  const closes = (mark: string, from: number): number => {
    const close = body.indexOf(mark, from)
    if (close === -1) return -1
    const nl = body.indexOf('\n', from)
    return nl === -1 || close < nl ? close : -1
  }
  while (i < n) {
    const ch = body.charCodeAt(i)
    // A fence opens only where one also closes, as the old pattern required;
    // an unmatched ``` is just three separators.
    if (ch === 96 && body.startsWith('```', i)) {
      const close = body.indexOf('```', i + 3)
      if (close !== -1) {
        inWord = false
        i = close + 3
        continue
      }
    } else if (ch === 96 && i > code) {
      const close = closes('`', i + 1)
      if (close > i + 1) code = close
    } else if (ch === 123 && i > code && body.startsWith('{>>', i)) {
      const close = closes('<<}', i + 3)
      if (close !== -1) {
        inWord = false
        i = close + 3
        continue
      }
    }
    const sep = separates(ch)
    if (!sep && !inWord) words += 1
    inWord = !sep
    i += 1
  }
  return words
}
