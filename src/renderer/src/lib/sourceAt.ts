/**
 * FROM WHAT READ DRAWS BACK TO THE SOURCE IT CAME FROM.
 *
 * READ renders markdown, and the renderer swallows characters — markers, list
 * prefixes, link targets, the `**` around a bold word. Two things still need
 * to get from a point in that rendering back to a place in the file: a
 * double-click that asks to write THERE, and a copy across blocks that should
 * hand over the markdown rather than the flattened text.
 */

/**
 * The plain-text offset of a click inside a rendered block, so the caret lands
 * where you pointed rather than at the end of the block.
 */
export function offsetAtPoint(container: HTMLElement, x: number, y: number): number | null {
  let node: Node | null = null
  let off = 0
  type WithCaretRange = Document & { caretRangeFromPoint?: (x: number, y: number) => Range | null }
  type WithCaretPos = Document & {
    caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null
  }
  const dr = (document as WithCaretRange).caretRangeFromPoint
  const dp = (document as WithCaretPos).caretPositionFromPoint
  if (dr) {
    const r = dr.call(document, x, y)
    if (r) {
      node = r.startContainer
      off = r.startOffset
    }
  } else if (dp) {
    const c = dp.call(document, x, y)
    if (c) {
      node = c.offsetNode
      off = c.offset
    }
  }
  if (!node || !container.contains(node)) return null
  let total = 0
  let found = false
  const walk = (n: Node): void => {
    if (found) return
    if (n.nodeType === 3) {
      if (n === node) {
        total += off
        found = true
      } else total += n.nodeValue?.length ?? 0
      return
    }
    for (let i = 0; i < n.childNodes.length && !found; i += 1) walk(n.childNodes[i])
  }
  walk(container)
  return found ? total : null
}

/**
 * Rendered offset → source offset, by walking both and skipping whatever the
 * renderer swallowed — markers, list prefixes, link targets. Cheaper and more
 * robust than tracking token positions through the parser, since none of those
 * characters survive into the rendered text at all.
 *
 * A comment is swallowed whole, and skipped whole: its words are in the source
 * and nowhere in the line, and walked letter by letter a space inside it
 * matched the one after it, which put a click past a comment inside it.
 */
export function plainToRaw(raw: string, plain: string, po: number): number {
  const ws = (c: string): boolean => c === ' ' || c === '\n' || c === '\t'
  let ri = 0
  let pi = 0
  while (ri < raw.length && pi < po && pi < plain.length) {
    if (raw.startsWith('{>>', ri) && !plain.startsWith('{>>', pi)) {
      const close = raw.indexOf('<<}', ri + 3)
      const nl = raw.indexOf('\n', ri + 3)
      if (close !== -1 && (nl === -1 || close < nl)) {
        ri = close + 3
        continue
      }
    }
    if (raw[ri] === plain[pi] || (ws(raw[ri]) && ws(plain[pi]))) {
      ri += 1
      pi += 1
    } else ri += 1
  }
  return ri
}
