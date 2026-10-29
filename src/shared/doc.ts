/*
 * `.ts` on the specifier, deliberately. `moduleResolution: "bundler"` allows
 * it and the bundler does not care — but `node --experimental-strip-types`
 * does, and this module has to be runnable under plain node for the checks in
 * checks/ to reach it. The other shared modules get away with extensionless
 * relative imports because theirs are type-only, and those are erased before
 * node ever tries to resolve them. This one imports values.
 */
import { parseRuns, plain, splitRow, type Run } from './blocks.ts'

/**
 * Note markdown, per the original design. Deliberately the supported set and
 * nothing more: headings, bold/italic/code, lists, task lists, blockquotes,
 * rules and links.
 */
/** The source lines a block came from, inclusive. Copying reads these. */
export interface Span {
  from: number
  to: number
}

type Body =
  | { kind: 'heading'; level: 1 | 2 | 3 | 4; runs: Run[] }
  | { kind: 'para'; runs: Run[] }
  /**
   * `status` is the trailing `~done` / `~active` / `~blocked` token an ordered
   * item may carry. It is lifted out of the text and rendered as a word at the
   * right of the row — monotonic by CONTRAST, never hue: active is the loudest,
   * blocked sits mid, done recedes.
   */
  | { kind: 'item'; bullet: string; runs: Run[]; status?: 'done' | 'active' | 'blocked'; depth?: number }
  /** `line` is the index in the source body, so a tick can be written back. */
  | { kind: 'task'; done: boolean; runs: Run[]; line: number; depth?: number }
  | { kind: 'quote'; runs: Run[] }
  | { kind: 'rule' }
  | { kind: 'code'; text: string }
  | { kind: 'table'; head: Run[][]; rows: Run[][][] }
  /** `![[note]]` or `![[note#Heading]]` — transcluded rather than linked. */
  | { kind: 'embed'; target: string; heading: string | null }
  /**
   * `<details><summary>…</summary> … </details>` — the one piece of HTML this
   * parser reads, because it is the one markdown has no syntax for and every
   * markdown host has settled on the same answer to. `blocks` is the body,
   * parsed the same way as everything else, so a collapsed section can hold
   * anything a note can — nested sections included.
   */
  | { kind: 'details'; summary: Run[]; open: boolean; blocks: NoteBlock[] }

/**
 * Every block knows which source lines it came from. That is what lets a
 * selection in the reader be copied back out as the markdown that produced it,
 * rather than as the glyphs it was drawn with.
 */
export type NoteBlock = Body & { span: Span }

/**
 * A block's span moved into its parent's line numbering — and its children's
 * with it.
 *
 * The recursion is the whole point. A fold inside a fold is parsed twice, so
 * its body has already been shifted once, into coordinates that are still
 * relative to the outer fold; shifting only the block's own span left every
 * paragraph in a nested section pointing at the wrong line, which is the line
 * an edit would have spliced.
 */
function shift(b: NoteBlock, by: number): NoteBlock {
  const span = { from: b.span.from + by, to: b.span.to + by }
  /*
   * `line` moves with `span`. A task carries the line its checkbox lives on,
   * separately from the block's span, and ticking one rewrites THAT line — so a
   * task inside a fold whose span had been shifted but whose `line` had not
   * would tick a line of the note it has nothing to do with. Latent until a
   * fold contains a task, which is a matter of time rather than of design.
   */
  const line = 'line' in b && typeof (b as { line?: number }).line === 'number'
    ? { line: (b as { line: number }).line + by }
    : null
  return b.kind === 'details'
    ? { ...b, span, blocks: b.blocks.map((c) => shift(c, by)) }
    : ({ ...b, span, ...line } as NoteBlock)
}

/**
 * The `<summary>` off the front of a folded section's body, and what is left.
 *
 * Written on one line in almost every example anybody copies, so that is the
 * case that has to be right; a tag opened on one line and closed on a later one
 * is read too, because a long summary is exactly when somebody would. A section
 * with no summary at all still folds — the browser's own default is "Details",
 * and saying so is better than showing an empty control.
 */
function takeSummary(inner: string[]): { summary: string; rest: string[]; used: number } {
  /*
   * The closing tag does NOT have to end the line. It used to have to, and the
   * fallback below then took over — and that branch never re-reads its own line,
   * so it scanned forward for a `</summary>` it had already passed and ate the
   * whole body into the label. Anything after the tag on that line joins the
   * summary rather than becoming a block, because a block whose span starts on a
   * line carrying markup is a block whose edit would splice the markup away.
   */
  const one = /^\s*<summary(?:\s[^>]*)?>([\s\S]*?)<\/summary>(.*)$/i
  for (let i = 0; i < inner.length; i++) {
    if (!inner[i].trim()) continue
    const hit = one.exec(inner[i])
    if (hit) {
      const said = `${hit[1].trim()} ${hit[2].trim()}`.trim()
      return { summary: said || 'Details', rest: inner.slice(i + 1), used: i + 1 }
    }
    if (/^\s*<summary(?:\s[^>]*)?>/i.test(inner[i])) {
      const held: string[] = [inner[i].replace(/^\s*<summary(?:\s[^>]*)?>/i, '')]
      let j = i + 1
      for (; j < inner.length && !/<\/summary>/i.test(inner[j]); j++) held.push(inner[j])
      if (j < inner.length) held.push(inner[j].replace(/<\/summary>.*$/i, ''))
      return { summary: held.join(' ').trim() || 'Details', rest: inner.slice(j + 1), used: j + 1 }
    }
    // The first thing in the body is not a summary, so there is not one.
    break
  }
  return { summary: 'Details', rest: inner, used: 0 }
}

/**
 * An embed on its own line, Obsidian's own rule for telling it apart from a
 * `[[wikilink]]` that merely starts a paragraph with `!` in front of it.
 * Exported so the comments read a line as an embed by this rule and no copy of
 * it: READ draws another note in its place, so nothing on it is words to write
 * a comment into.
 */
export const EMBED_LINE = /^\s*!\[\[([^\]]+)\]\]\s*$/

/**
 * `breaks`: a single newline inside a paragraph or a quote is a line break,
 * kept as `\n` in the run text for the renderer to honour. Notes pass it — the
 * vault is written where a newline IS a break, and the writing surface shows
 * one — and threads do not, keeping markdown's own joining rule.
 */
/**
 * How deep a list item sits, in levels of two spaces — what the writing surface
 * indents it by, so READ draws the same nesting rather than flattening it.
 */
const depthOf = (line: string): number => {
  let n = 0
  for (const c of line) {
    if (c === ' ') n += 1
    else if (c === '\t') n += 4 - (n % 4)
    else break
  }
  return Math.floor(n / 2)
}

export function parseNote(md: string, opts: { breaks?: boolean } = {}): NoteBlock[] {
  const glue = opts.breaks ? '\n' : ' '
  /*
   * With breaks, each LINE is read for its bold, italics and links on its own,
   * and the lines are joined by the break. The writing surface reads a line at a
   * time — it has to, it draws a line at a time — and a `**` that opened on one
   * line and closed on the next was bold here and literal there: the two
   * surfaces disagreeing about the same text, which is the one thing they must
   * not do.
   */
  const runsOf = (parts: string[]): Run[] => {
    const text = parts.join(glue).trim()
    if (!opts.breaks) return parseRuns(text)
    return text.split('\n').flatMap((l, n) => (n ? [{ text: '\n' }, ...parseRuns(l)] : parseRuns(l)))
  }
  const lines = md.replace(/\r\n/g, '\n').split('\n')
  const out: NoteBlock[] = []
  let para: string[] = []
  let paraFrom = 0
  let paraTo = 0
  // The line the current block started on; `i` is where it ends, after any
  // inner loop (code fence, blockquote, table) has run it forward.
  let from = 0

  const add = (b: Body, span: Span): void => {
    out.push({ ...b, span } as NoteBlock)
  }

  const flush = (): void => {
    const text = para.join(glue).trim()
    const span = { from: paraFrom, to: paraTo }
    const runs = text ? runsOf(para) : []
    para = []
    if (text) add({ kind: 'para', runs }, span)
  }

  for (let i = 0; i < lines.length; i++) {
    from = i
    const line = lines[i]

    /*
     * A COLLAPSIBLE SECTION.
     *
     * `<details>` is not markdown, and that is exactly why it is here: markdown
     * has no syntax for a section you can fold, so every host that wanted one —
     * GitHub, GitLab, Jekyll — settled on the same scrap of HTML instead. A
     * vault full of long notes wants it, and without this the tags rendered as
     * words in the middle of the prose.
     *
     * Matched to its OWN closing tag by depth, so sections nest. The body is
     * parsed by `parseNote` itself, which is what lets a folded section hold
     * anything a note can hold, and the inner spans are shifted back into the
     * note's own line numbering — a paragraph inside a fold is still a
     * paragraph you can open and edit, and it must splice the line it actually
     * came from.
     */
    /*
     * THE TAG NEED NOT HAVE ITS LINE TO ITSELF.
     *
     * `<details><summary>…</summary>` on one line is the form every example
     * anybody copies is written in, and the one an agent writes when asked for
     * a fold — and it was the one form this could not read.
     * A note using it produced NO folds at all and showed the raw tags as words
     * in the middle of the prose.
     *
     * Two captures, and they must stay separate. Group 1 is the attributes,
     * which is the only thing `open` may be tested against: fold the summary
     * into that capture and a section whose label happens to contain the word
     * "open" — "the one open question", say — would silently start expanded.
     */
    const open = /^\s*<details(\s[^>]*?)?>(.*)$/i.exec(line)
    if (open) {
      flush()
      const trailing = open[2] ?? ''
      let depth = 1
      const inner: string[] = []
      /*
       * WHAT THE OPENING LINE CARRIES IS THE FIRST BODY LINE — which is why
       * `bodyFrom` moves with it. `inner[k]` must be `lines[bodyFrom + k]`, and
       * that invariant, not the arithmetic, is what every inner span depends on:
       * prepend without moving `bodyFrom` and every block inside the fold claims
       * the line after the one it came from, which an in-place edit then splices.
       */
      const sameLine = Boolean(trailing.trim())
      if (sameLine) inner.push(trailing)
      const bodyFrom = sameLine ? i : i + 1
      let j = i + 1
      for (; j < lines.length && depth > 0; j++) {
        // The nested test has to read the same shapes as the outer one, or a
        // one-line fold inside another closes its PARENT early. A line that
        // opens and closes on itself is neither, and is left as content.
        const opens = /^\s*<details(\s[^>]*?)?>/i.test(lines[j]) && !/<\/details>/i.test(lines[j])
        if (opens) depth++
        else if (/^\s*<\/details>\s*$/.test(lines[j])) {
          depth--
          if (!depth) break
        }
        inner.push(lines[j])
      }
      // An unclosed `<details>` swallows the rest of the note, which is what a
      // browser does with it too — and leaving it as prose would show the tag.
      const { summary, rest, used } = takeSummary(inner)
      // Where `rest[0]` actually sits in the NOTE, which is what every inner
      // span has to be shifted by.
      const at = bodyFrom + used
      const blocks = parseNote(rest.join('\n'), opts).map((b) => shift(b, at))
      add(
        {
          kind: 'details',
          summary: parseRuns(summary),
          open: /\bopen\b/.test(open[1] ?? ''),
          blocks
        },
        { from, to: Math.min(j, lines.length - 1) }
      )
      i = j
      continue
    }

    const embed = EMBED_LINE.exec(line)
    if (embed) {
      flush()
      const inner = embed[1].trim()
      const hash = inner.indexOf('#')
      const target = (hash === -1 ? inner : inner.slice(0, hash)).trim()
      const heading = hash === -1 ? null : inner.slice(hash + 1).trim()
      add({ kind: 'embed', target, heading }, { from, to: i })
      continue
    }

    // Tables are not in the original design's supported set, but notes in use
    // are full of them, and the alternative is a wall of raw pipes. Same shape
    // the chat renderer already uses.
    if (/^\s*\|/.test(line) && i + 1 < lines.length && /^\s*\|[\s:|-]+\|\s*$/.test(lines[i + 1])) {
      flush()
      const cells = (r: string): Run[][] => splitRow(r).map((c) => parseRuns(c))
      const head = cells(line)
      const rows: Run[][][] = []
      i += 2
      while (i < lines.length && /^\s*\|/.test(lines[i])) rows.push(cells(lines[i++]))
      i--
      add({ kind: 'table', head, rows }, { from, to: i })
      continue
    }

    const fence = /^\s*```/.exec(line)
    if (fence) {
      flush()
      const body: string[] = []
      i++
      while (i < lines.length && !/^\s*```/.test(lines[i])) body.push(lines[i++])
      add({ kind: 'code', text: body.join('\n') }, { from, to: i })
      continue
    }

    /*
     * Up to six hashes, drawn as four. `#{1,3}` matched nothing at all on a
     * `#### line` — the greedy run took three hashes and then wanted whitespace
     * where the fourth was — so it fell through to the paragraph branch and the
     * note showed the hashes as words. Anything deeper than four is drawn as
     * four: a note that has reached five levels is not helped by a fifth size.
     */
    const heading = /^(#{1,6})\s+(.+)$/.exec(line)
    if (heading) {
      flush()
      add(
        {
          kind: 'heading',
          level: Math.min(4, heading[1].length) as 1 | 2 | 3 | 4,
          runs: parseRuns(heading[2].trim())
        },
        { from, to: i }
      )
      continue
    }

    if (/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
      flush()
      add({ kind: 'rule' }, { from, to: i })
      continue
    }

    const task = /^\s*[-*+]\s+\[([ xX])\]\s+(.*)$/.exec(line)
    if (task) {
      flush()
      add(
        { kind: 'task', done: task[1].toLowerCase() === 'x', runs: parseRuns(task[2]), line: i, depth: depthOf(line) },
        { from, to: i }
      )
      continue
    }

    const numbered = /^\s*(\d+)[.)]\s+(.*)$/.exec(line)
    if (numbered) {
      flush()
      const tail = /^(.*?)\s+~(done|active|blocked)\s*$/.exec(numbered[2])
      const body = tail ? tail[1] : numbered[2]
      const status = tail ? (tail[2] as 'done' | 'active' | 'blocked') : undefined
      add(
        // The ordinal is zero-padded to two digits: the mono gutter is a column,
        // and `9.` beside `10.` is a column that does not line up.
        {
          kind: 'item',
          depth: depthOf(line),
          bullet: String(numbered[1]).padStart(2, '0'),
          runs: parseRuns(body),
          status
        },
        { from, to: i }
      )
      continue
    }

    const bullet = /^\s*[-*+]\s+(.*)$/.exec(line)
    if (bullet) {
      flush()
      add({ kind: 'item', bullet: '–', runs: parseRuns(bullet[1]), depth: depthOf(line) }, { from, to: i })
      continue
    }

    if (/^\s*>\s?/.test(line)) {
      flush()
      const body: string[] = []
      while (i < lines.length && /^\s*>\s?/.test(lines[i])) body.push(lines[i++].replace(/^\s*>\s?/, ''))
      i--
      add({ kind: 'quote', runs: runsOf(body) }, { from, to: i })
      continue
    }

    if (!line.trim()) flush()
    else {
      if (!para.length) paraFrom = i
      paraTo = i
      para.push(line.trim())
    }
  }
  flush()
  return out
}

/**
 * The lines of one heading's section, for `![[note#Heading]]` — an embed
 * transcludes only what the heading owns. Runs to the next heading at the
 * same level or shallower, or the end of the note; `null` if nothing in the
 * body matches, which the embed renders as a broken reference rather than
 * silently falling back to the whole note.
 */
export function sliceHeading(body: string, heading: string): string | null {
  const lines = body.replace(/\r\n/g, '\n').split('\n')
  const want = heading.trim().toLowerCase()
  let start = -1
  let level = 0
  for (let i = 0; i < lines.length; i++) {
    const m = /^(#{1,6})\s+(.+?)\s*$/.exec(lines[i])
    if (m && plain(m[2]).trim().toLowerCase() === want) {
      start = i
      level = m[1].length
      break
    }
  }
  if (start === -1) return null
  let end = lines.length
  for (let i = start + 1; i < lines.length; i++) {
    const m = /^(#{1,6})\s+/.exec(lines[i])
    if (m && m[1].length <= level) {
      end = i
      break
    }
  }
  return lines.slice(start, end).join('\n')
}
