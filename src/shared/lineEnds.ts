/**
 * A NOTE KEEPS ITS LINE BREAKS.
 *
 * The editor holds every line break as `\n`. CodeMirror reads `\r\n`, and a
 * lone `\r`, as a break and keeps neither, so a note saved on Windows is `\n`
 * all through once it is on screen — and so is every body the editor hands
 * back. Written as it came, the first letter typed into such a note turned
 * over every line of it on disk, in a store whose one promise is that the
 * file is the note, byte for byte.
 *
 * So the write puts the breaks back, going by where the text stopped being the
 * same. Before the first character that differs from the file, and after the
 * last, nothing was touched, and every break there goes back as it was —
 * `\r\n`, `\n`, or the stray `\r` a converted PDF leaves mid-sentence. A break
 * you typed is written the way the note mostly writes them, `\r\n` or `\n`,
 * and one you took away is simply gone.
 *
 * By characters, not by lines. Paired off a line at a time from each end, the
 * lines either side of a break typed or taken away came out one line apart,
 * and a stray `\r` went with the wrong one: ⌫ joining a line cut at a stray
 * `\r` wrote that `\r` at the end of the joined line in place of the `\n` that
 * was there, and READ, for which a lone `\r` is not a break, took the line
 * under it — a table row, a heading — for more of the same line.
 *
 * Where what changed put in as many breaks as it took out, they are kept, in
 * order, instead: a line pasted over a line, or a word fixed here and one a
 * few lines down before one save came round — which leaves the lines between
 * the two untouched. Where the count changed as well, the breaks between are
 * written the usual way, which in a note with one kind of break is the break
 * they had.
 *
 * A note with no `\r` in it — nearly every note, in a vault in daily use — is
 * written exactly as it came, without being looked at.
 */

/** `body`, as the editor hands it over, in the line breaks of `was` — the body on disk it replaces. */
export function inEndingsOf(was: string, body: string): string {
  if (!was.includes('\r')) return body
  // `was` as the editor holds it, and the break on disk behind each of its `\n`s.
  const ends: string[] = []
  const a = was.replace(/\r\n?|\n/g, (m) => {
    ends.push(m)
    return '\n'
  })
  // A body READ hands over — a box ticked there — still has breaks of its own.
  const b = body.replace(/\r\n?/g, '\n')
  // For a break that is new: `\r\n` or `\n`, whichever the note mostly uses.
  let crlf = 0
  let lf = 0
  for (const e of ends) {
    if (e === '\r\n') crlf += 1
    else if (e === '\n') lf += 1
  }
  const usual = crlf > lf ? '\r\n' : '\n'
  // Where the two stop being the same, from the top and from the bottom.
  const min = Math.min(a.length, b.length)
  let p = 0
  while (p < min && a.charCodeAt(p) === b.charCodeAt(p)) p += 1
  let s = 0
  while (s < min - p && a.charCodeAt(a.length - 1 - s) === b.charCodeAt(b.length - 1 - s)) s += 1
  const above = breaks(a, 0, p)
  const took = breaks(a, p, a.length - s)
  const put = breaks(b, p, b.length - s)
  const text: string[] = []
  const end: string[] = []
  let from = 0
  for (let at = b.indexOf('\n'); at !== -1; at = b.indexOf('\n', at + 1)) {
    const k = end.length
    text.push(b.slice(from, at))
    if (k < above) end.push(ends[k])
    else if (k >= above + put) end.push(ends[k - put + took])
    else end.push(took === put ? ends[k] : usual)
    from = at + 1
  }
  text.push(b.slice(from))
  // A stray `\r` kept just before an empty line's `\n` reads back as one break,
  // not two, and the empty line is lost on disk — so that `\r` is written the
  // usual way. From the bottom up: a `\r` mended so is a `\n` that the `\r`
  // above it, over another empty line, runs into in turn.
  for (let k = end.length - 2; k >= 0; k -= 1) {
    if (end[k] === '\r' && !text[k + 1] && end[k + 1] === '\n') end[k] = usual
  }
  let out = ''
  for (let k = 0; k < end.length; k += 1) out += text[k] + end[k]
  return out + text[end.length]
}

/** How many line breaks `t` has in [from, to). */
function breaks(t: string, from: number, to: number): number {
  let n = 0
  for (let i = t.indexOf('\n', from); i !== -1 && i < to; i = t.indexOf('\n', i + 1)) n += 1
  return n
}
