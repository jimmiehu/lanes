/**
 * THE SMALLEST SET OF CHANGES THAT TURNS ONE TEXT INTO ANOTHER — so a note
 * edited from outside can arrive under the caret without moving it.
 *
 * The editor applies a body from disk as changes, not as a replacement, and
 * the caret is carried through them: a change above it pushes it down, a change
 * below leaves it alone. That only works if the changes are the ones that were
 * actually made. One hunk from the first difference to the last — the obvious
 * shortcut — swallows everything in between whenever the file changed in two
 * places, and a caret inside the swallowed part lands at its edge: Claude adds
 * a paragraph at the top and a line at the end, and you are thrown out of the
 * sentence you were in.
 *
 * So: the common lines at each end are set aside, the lines between are diffed
 * properly (Myers), and every hunk is then trimmed to the characters that
 * differ, so an edit to the very line you are on still keeps your place in it.
 * A middle too big to diff cheaply falls back to one hunk — correct, merely
 * less careful about the caret, and only on a rewrite of thousands of lines.
 *
 * The text that arrives is taken as the editor will hold it: every line break
 * a `\n`. CodeMirror reads `\r\n`, and a lone `\r`, as a break and keeps
 * neither, so a note saved on Windows is `\n` all through on screen while the
 * body the pane hands over from disk is still `\r\n`. Diffed as it came,
 * every line differed, and the trim to the characters cut a hunk off between
 * the `\r` and the `\n` of a pair — an insert ending in a lone `\r`, which
 * CodeMirror read as a line of its own. `a\r\nb\r\nc\r\nd` came back from
 * ⌘E twice as `a\nb\nc\n\nd`, the caret thrown to the top and the blank line
 * saved with the next keystroke. Taken as the editor holds it, the same note
 * is no change at all. The breaks go back on the way to disk, not here — see
 * `shared/lineEnds.ts`.
 */

export interface Change {
  from: number
  to: number
  insert: string
}

/** Lines WITH their newlines, so the units concatenate back to the text exactly. */
const units = (s: string): string[] => (s ? s.split(/(?<=\n)/) : [])

/** Past this many differing lines, one hunk: the diff would cost more than it saves. */
const MAX_EDITS = 1000

/** A text as the editor holds it — CodeMirror's own rule for what is a line break. */
export const lf = (s: string): string => s.replace(/\r\n?/g, '\n')

/** From `a`, the editor's text, to `text` — as the editor will hold it. */
export function lineChanges(a: string, text: string): Change[] {
  const b = lf(text)
  if (a === b) return []
  const A = units(a)
  const B = units(b)
  let head = 0
  while (head < A.length && head < B.length && A[head] === B[head]) head += 1
  let tail = 0
  while (tail < A.length - head && tail < B.length - head && A[A.length - 1 - tail] === B[B.length - 1 - tail]) tail += 1

  const offsets: number[] = [0]
  for (const u of A) offsets.push(offsets[offsets.length - 1] + u.length)

  const midA = A.slice(head, A.length - tail)
  const midB = B.slice(head, B.length - tail)
  const script = myers(midA, midB)
  const hunks: { a0: number; a1: number; b0: number; b1: number }[] = script
    ? script
    : [{ a0: 0, a1: midA.length, b0: 0, b1: midB.length }]

  const out: Change[] = []
  for (const h of hunks) {
    let from = offsets[head + h.a0]
    let to = offsets[head + h.a1]
    let insert = midB.slice(h.b0, h.b1).join('')
    // Down to the characters: a hunk that rewrote one line usually changed a
    // few characters of it, and the caret beside them should not move.
    const old = a.slice(from, to)
    let p = 0
    while (p < old.length && p < insert.length && old.charCodeAt(p) === insert.charCodeAt(p)) p += 1
    let q = 0
    while (
      q < old.length - p &&
      q < insert.length - p &&
      old.charCodeAt(old.length - 1 - q) === insert.charCodeAt(insert.length - 1 - q)
    )
      q += 1
    from += p
    to -= q
    insert = insert.slice(p, insert.length - q)
    if (from !== to || insert) out.push({ from, to, insert })
  }
  return out
}

/**
 * Myers' O(ND) diff over two unit arrays, returned as hunks of consecutive
 * edits in the coordinates of the two arrays. Null when the texts differ in
 * more than `MAX_EDITS` places.
 */
function myers(A: string[], B: string[]): { a0: number; a1: number; b0: number; b1: number }[] | null {
  const n = A.length
  const m = B.length
  if (!n && !m) return []
  const max = Math.min(n + m, MAX_EDITS)
  const off = max + 1
  let v = new Int32Array(2 * max + 3)
  const trace: Int32Array[] = []
  let found = -1
  for (let d = 0; d <= max; d += 1) {
    trace.push(v.slice())
    const next = v.slice()
    for (let k = -d; k <= d; k += 2) {
      let x = k === -d || (k !== d && v[off + k - 1] < v[off + k + 1]) ? v[off + k + 1] : v[off + k - 1] + 1
      let y = x - k
      while (x < n && y < m && A[x] === B[y]) {
        x += 1
        y += 1
      }
      next[off + k] = x
      if (x >= n && y >= m) {
        found = d
        break
      }
    }
    v = next
    if (found !== -1) break
  }
  if (found === -1) return null

  // Walk back through the trace, collecting which units were deleted and inserted.
  const del = new Uint8Array(n)
  const ins = new Uint8Array(m)
  let x = n
  let y = m
  for (let d = found; d > 0; d -= 1) {
    const pv = trace[d]
    const k = x - y
    const down = k === -d || (k !== d && pv[off + k - 1] < pv[off + k + 1])
    const pk = down ? k + 1 : k - 1
    const px = pv[off + pk]
    const py = px - pk
    while (x > px && y > py) {
      x -= 1
      y -= 1
    }
    if (down) ins[py] = 1
    else del[px] = 1
    x = px
    y = py
  }

  const hunks: { a0: number; a1: number; b0: number; b1: number }[] = []
  let i = 0
  let j = 0
  while (i < n || j < m) {
    if (i < n && j < m && !del[i] && !ins[j]) {
      i += 1
      j += 1
      continue
    }
    const a0 = i
    const b0 = j
    while (i < n && del[i]) i += 1
    while (j < m && ins[j]) j += 1
    if (i === a0 && j === b0) {
      // Unreachable for a consistent script; step on rather than loop.
      i += 1
      j += 1
      continue
    }
    hunks.push({ a0, a1: i, b0, b1: j })
  }
  return hunks
}
