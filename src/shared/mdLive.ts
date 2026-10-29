/**
 * WHAT THE EDITOR DRAWS, AS POSITIONS — and it is READ's grammar, not markdown's.
 *
 * The writing surface renders markdown live, and there are two grammars it
 * could render: CommonMark, which is what the parser underneath it speaks, and
 * the one READ actually draws, which is `shared/blocks.ts` and `shared/doc.ts`.
 * They are not the same language. READ has no `_underscore_` emphasis, no
 * strikethrough, no setext headings; a `##` indented under a list item is prose
 * to it; a wikilink shows its alias, or the last segment of its path.
 *
 * An editor that rendered CommonMark would show you a document READ then
 * disagrees with — `_this_` italic while you write it and literal once you
 * press ⌘E — and that disagreement is precisely the "WYSIWYG that does not
 * work" this surface exists to end. So the rules below are READ's own,
 * restated with positions: `inlineTokens` is `parseRuns` with offsets,
 * `classify` is `parseNote`'s line tests in `parseNote`'s order, and
 * `blockRuns` is where `parseNote` finds a fence, a table or a fold.
 * `checks/md-live.mjs` holds the two against each other over the whole vault.
 *
 * Pure: no DOM, no CodeMirror. The editor decorates from these; nothing here
 * knows it is being decorated.
 */

/* ---------- inline ---------- */

export type Tok =
  /** `[[target|alias]]`. `label` is what READ shows: the alias, or the last path segment. */
  | { k: 'wiki'; from: number; to: number; target: string; label: [number, number] }
  | { k: 'bold'; from: number; to: number; inner: Tok[] }
  | { k: 'italic'; from: number; to: number; inner: Tok[] }
  /** A code span. `path` when the whole span is a vault path — READ makes that openable. */
  | { k: 'code'; from: number; to: number; path?: string }
  /** `[text](href)` — the text runs from `from + 1` to `textTo`. */
  | { k: 'link'; from: number; to: number; href: string; textTo: number; inner: Tok[] }
  /** A vault path written as bare prose — `daily/2026-08-21.md`. */
  | { k: 'path'; from: number; to: number }
  /** `{==words==}` — what a comment is about. The words run from `from + 3` to `to - 3`. */
  | { k: 'anchor'; from: number; to: number; inner: Tok[] }
  /** `{>>words<<}` — a comment. Its words are not the line's: READ shows none of it in the text. */
  | { k: 'comment'; from: number; to: number }
  /** `==words==` — highlighted. The words run from `from + 2` to `to - 2`. */
  | { k: 'highlight'; from: number; to: number; inner: Tok[] }

/** READ's pattern, character for character. See `parseRuns` in shared/blocks.ts. */
const PATTERN =
  /(\{==.+?==\})|(\{>>.*?<<\})|(==(?=[^\s=])(?:\{==.+?==\}|\{>>.*?<<\}|`[^`]+`|[^=])+?(?<=[^\s={])==)|(\[\[[^\]]+\]\])|(\*\*[^*]+\*\*)|(`[^`]+`)|(\[[^\]]+\]\([^)\s]+\))|(\*[^*\s][^*]*\*)|(\/?(?:[\w.-]+\/)+[\w.-]+\.md)/g
const VAULT_PATH = /^\/?(?:[\w.-]+\/)+[\w.-]+\.md$/

/**
 * `parseRuns`, with offsets. Same scan, same alternation order, same recursion:
 * bold, italic, a highlight, an anchor and a link's text recurse; a code span and a comment
 * do not. `base` is where `s` starts in the document, so every range comes back
 * absolute.
 */
export function inlineTokens(s: string, base = 0): Tok[] {
  const out: Tok[] = []
  const re = new RegExp(PATTERN.source, 'g')
  let m: RegExpExecArray | null
  while ((m = re.exec(s)) !== null) {
    const tok = m[0]
    const from = base + m.index
    const to = from + tok.length
    if (tok.startsWith('{==')) {
      out.push({ k: 'anchor', from, to, inner: inlineTokens(tok.slice(3, -3), from + 3) })
    } else if (tok.startsWith('{>>')) {
      out.push({ k: 'comment', from, to })
    } else if (tok.startsWith('==')) {
      out.push({ k: 'highlight', from, to, inner: inlineTokens(tok.slice(2, -2), from + 2) })
    } else if (tok.startsWith('[[')) {
      const inner = tok.slice(2, -2)
      const sep = inner.match(/\\?\|/)
      const bar = sep?.index ?? -1
      const rawTarget = bar === -1 ? inner : inner.slice(0, bar)
      const target = rawTarget.trim()
      let label: [number, number]
      if (bar === -1) {
        // The last path segment, as READ shows it: `[[a/b/c]]` reads `c`.
        const lead = rawTarget.length - rawTarget.trimStart().length
        const slash = target.lastIndexOf('/')
        const a = from + 2 + lead + slash + 1
        label = [a, from + 2 + lead + target.length]
      } else {
        const after = inner.slice(bar + (sep?.[0].length ?? 1))
        const lead = after.length - after.trimStart().length
        const a = from + 2 + bar + (sep?.[0].length ?? 1) + lead
        label = [a, a + after.trim().length]
      }
      out.push({ k: 'wiki', from, to, target, label })
    } else if (tok.startsWith('**')) {
      out.push({ k: 'bold', from, to, inner: inlineTokens(tok.slice(2, -2), from + 2) })
    } else if (tok.startsWith('`')) {
      const inner = tok.slice(1, -1)
      out.push(VAULT_PATH.test(inner) ? { k: 'code', from, to, path: inner } : { k: 'code', from, to })
    } else if (tok.startsWith('[')) {
      const split = tok.indexOf('](')
      out.push({
        k: 'link',
        from,
        to,
        href: tok.slice(split + 2, -1),
        textTo: from + split,
        inner: inlineTokens(tok.slice(1, split), from + 1)
      })
    } else if (VAULT_PATH.test(tok)) {
      out.push({ k: 'path', from, to })
    } else {
      out.push({ k: 'italic', from, to, inner: inlineTokens(tok.slice(1, -1), from + 1) })
    }
  }
  return out
}

/**
 * The text READ would show for a line of inline markdown, rebuilt from the
 * tokens — the same string `parseRuns` produces when its runs are joined. It
 * exists to be compared: it is what proves the two grammars agree.
 */
export function shownText(s: string): string {
  const walk = (toks: Tok[], a: number, b: number): string => {
    let out = ''
    let at = a
    for (const t of toks) {
      out += s.slice(at, t.from)
      if (t.k === 'wiki') out += s.slice(t.label[0], t.label[1])
      else if (t.k === 'bold') out += walk(t.inner, t.from + 2, t.to - 2)
      else if (t.k === 'italic') out += walk(t.inner, t.from + 1, t.to - 1)
      else if (t.k === 'code') out += s.slice(t.from + 1, t.to - 1)
      else if (t.k === 'link') out += walk(t.inner, t.from + 1, t.textTo)
      else if (t.k === 'anchor') out += walk(t.inner, t.from + 3, t.to - 3)
      else if (t.k === 'highlight') out += walk(t.inner, t.from + 2, t.to - 2)
      // A comment's words are an annotation on the line, not part of it.
      else if (t.k === 'comment') out += ''
      else out += s.slice(t.from, t.to)
      at = t.to
    }
    return out + s.slice(at, b)
  }
  return walk(inlineTokens(s), 0, s.length)
}

/* ---------- lines ---------- */

export type LineKind =
  /** `markTo` is the offset just past `## ` — the part that hangs in the margin. */
  | { k: 'heading'; level: 1 | 2 | 3 | 4; markTo: number }
  | { k: 'rule' }
  /** `markTo` is just past `- [ ] `; `indent` is the leading whitespace's width in columns. */
  | { k: 'task'; indent: number; markTo: number; done: boolean; box: number }
  /** `markTo` is just past `1. ` — the ordinal stays on screen, it IS the rendering. */
  | { k: 'ordered'; indent: number; markTo: number }
  | { k: 'bullet'; indent: number; markTo: number }
  | { k: 'quote'; markTo: number }
  | { k: 'blank' }
  | { k: 'para' }

/** How many columns a run of leading whitespace fills, a tab reaching the next stop of four. */
export const cols = (ws: string): number => {
  let n = 0
  for (const c of ws) n += c === '\t' ? 4 - (n % 4) : 1
  return n
}

/**
 * What kind of line this is, by `parseNote`'s tests in `parseNote`'s order —
 * heading, rule, task, ordinal, bullet, quote. Fences, tables and `<details>`
 * are not decided here: they are runs of lines, and `blockRuns` below finds
 * those, from the top of the note, the way `parseNote` does.
 *
 * A heading must start at column 0, exactly as READ requires. An indented `##`
 * is prose there — the outline learned that the hard way — so it is prose here.
 */
export function classify(line: string): LineKind {
  if (!line.trim()) return { k: 'blank' }
  const h = /^(#{1,6})\s+(?=\S)/.exec(line)
  if (h) return { k: 'heading', level: Math.min(4, h[1].length) as 1 | 2 | 3 | 4, markTo: h[0].length }
  if (/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) return { k: 'rule' }
  const t = /^(\s*)[-*+]\s+\[([ xX])\]\s+/.exec(line)
  // READ requires text after the box; a box with nothing after it is still the
  // task you are about to type, so it is drawn as one while you type it.
  if (t || /^(\s*)[-*+]\s+\[[ xX]\]\s*$/.test(line)) {
    const e = t ?? (/^(\s*)[-*+]\s+\[([ xX])\]\s*/.exec(line) as RegExpExecArray)
    return {
      k: 'task',
      indent: cols(e[1]),
      markTo: e[0].length,
      done: e[2].toLowerCase() === 'x',
      box: e[0].indexOf('[')
    }
  }
  const o = /^(\s*)\d+[.)]\s+/.exec(line)
  if (o) return { k: 'ordered', indent: cols(o[1]), markTo: o[0].length }
  const b = /^(\s*)[-*+]\s+/.exec(line)
  if (b) return { k: 'bullet', indent: cols(b[1]), markTo: b[0].length }
  const q = /^\s*>\s?/.exec(line)
  if (q) return { k: 'quote', markTo: q[0].length }
  return { k: 'para' }
}

/* ---------- runs of lines ---------- */

/**
 * A block READ reads as a run of lines, by line index, `from` and `to`
 * inclusive.
 *
 * `closed` is false for a fence nothing closes, which READ runs to the end of
 * the note. A fold is `<details>` to its own `</details>`: `tags` are the lines
 * that are its HTML — the `<details>` line, the `<summary>`, the closing tag —
 * and `inner` the runs in its body, which READ parses as a note of its own.
 */
export type BlockRun =
  | { k: 'code'; from: number; to: number; closed: boolean }
  | { k: 'table'; from: number; to: number }
  | { k: 'fold'; from: number; to: number; tags: number[]; inner: BlockRun[] }

/** `parseNote`'s own patterns, character for character. See shared/doc.ts. */
const DETAILS = /^\s*<details(\s[^>]*?)?>(.*)$/i
const DETAILS_NESTED = /^\s*<details(\s[^>]*?)?>/i
const DETAILS_END = /^\s*<\/details>\s*$/
const TABLE_ROW = /^\s*\|/
const TABLE_RULE = /^\s*\|[\s:|-]+\|\s*$/
const FENCE = /^\s*```/
/** Every run starts on one of these, so most lines are passed over on one test. */
const MAYBE = /^\s*[<|`]/

/** How many of a fold's first lines its `<summary>` takes — `takeSummary`'s `used`. */
function summaryLines(inner: readonly string[]): number {
  for (let i = 0; i < inner.length; i++) {
    if (!inner[i].trim()) continue
    if (/^\s*<summary(?:\s[^>]*)?>([\s\S]*?)<\/summary>(.*)$/i.test(inner[i])) return i + 1
    if (/^\s*<summary(?:\s[^>]*)?>/i.test(inner[i])) {
      let j = i + 1
      while (j < inner.length && !/<\/summary>/i.test(inner[j])) j++
      return j + 1
    }
    break
  }
  return 0
}

/**
 * The run that starts at line `i`, if `parseNote` would start one there.
 *
 * `line(i)` is the note's line `i` and `n` how many there are — asked for one
 * line at a time rather than as an array, so the editor can hand over its own
 * document without copying tens of thousands of lines to learn about three.
 */
function runAt(line: (i: number) => string, n: number, i: number): BlockRun | null {
  const text = line(i)
  if (!MAYBE.test(text)) return null
  const open = DETAILS.exec(text)
  if (open) {
    // Matched to its own closing tag by depth, exactly as READ matches it —
    // an unclosed one runs to the end of the note.
    let depth = 1
    let j = i + 1
    for (; j < n; j++) {
      const t = line(j)
      if (DETAILS_NESTED.test(t) && !/<\/details>/i.test(t)) depth++
      else if (DETAILS_END.test(t)) {
        depth--
        if (!depth) break
      }
    }
    const trailing = open[2] ?? ''
    const sameLine = Boolean(trailing.trim())
    const inner: string[] = sameLine ? [trailing] : []
    for (let k = i + 1; k < j; k++) inner.push(line(k))
    const used = summaryLines(inner)
    // Where the body starts in the note: READ's `at`.
    const body = (sameLine ? i : i + 1) + used
    const tags = [i]
    for (let k = i + 1; k < Math.min(body, j); k++) if (line(k).trim()) tags.push(k)
    if (j < n) tags.push(j)
    const rest = inner.slice(used)
    // The body, as READ reads it: a note of its own. The `<details>` line is
    // a tag whatever else it carries, so nothing inside may claim it.
    const runs = blockRuns((k) => rest[k], rest.length)
      .map((r) => moved(r, body))
      .filter((r) => r.to > i)
      .map((r) => (r.from > i ? r : { ...r, from: i + 1 }))
    return { k: 'fold', from: i, to: Math.min(j, n - 1), tags, inner: runs }
  }
  if (TABLE_ROW.test(text) && i + 1 < n && TABLE_RULE.test(line(i + 1))) {
    let k = i + 2
    while (k < n && TABLE_ROW.test(line(k))) k++
    return { k: 'table', from: i, to: k - 1 }
  }
  if (FENCE.test(text)) {
    let k = i + 1
    while (k < n && !FENCE.test(line(k))) k++
    return { k: 'code', from: i, to: Math.min(k, n - 1), closed: k < n }
  }
  return null
}

/** Every run in a note, in order. None overlaps another. */
export function blockRuns(line: (i: number) => string, n: number): BlockRun[] {
  const out: BlockRun[] = []
  for (let i = 0; i < n; ) {
    const r = runAt(line, n, i)
    if (r) out.push(r)
    i = r ? r.to + 1 : i + 1
  }
  return out
}

/** A run moved down `d` lines — up, if `d` is negative — with everything inside it. */
function moved(r: BlockRun, d: number): BlockRun {
  if (!d) return r
  if (r.k !== 'fold') return { ...r, from: r.from + d, to: r.to + d }
  return { ...r, from: r.from + d, to: r.to + d, tags: r.tags.map((t) => t + d), inner: r.inner.map((c) => moved(c, d)) }
}

/**
 * THE RUNS AGAIN AFTER AN EDIT — reading only what the edit can have moved.
 *
 * A run depends on nothing above its first line, and a line outside every run
 * is where `parseNote` stands with nothing open. So the runs above an edit are
 * kept as they were, and the reading starts again at the line before the edit
 * — a row is a table's first only because of the rule under it — or at the
 * start of the run that line is in. It stops at the first line past the edit
 * where the old reading ALSO stood outside every run: from there on the text is
 * the same text, read from the same place, and the old runs are the answer,
 * moved by the lines the edit added or took away. A keystroke in a note of
 * tens of thousands of lines reads a few lines, not all of them.
 *
 * `a` is the first line the edit touched, `last` the last one as it now reads,
 * and `shift` how many lines the note gained. `checks/md-live.mjs` holds this to
 * `blockRuns` read from scratch, over thousands of edits.
 */
export function blockRunsAfter(
  was: readonly BlockRun[],
  line: (i: number) => string,
  n: number,
  a: number,
  last: number,
  shift: number
): BlockRun[] {
  let start = Math.max(0, a - 1)
  let keep = 0
  while (keep < was.length && was[keep].to < start) keep++
  if (keep < was.length && was[keep].from < start) start = was[keep].from
  const out = was.slice(0, keep)
  let old = keep
  for (let i = start; i < n; ) {
    if (i > last) {
      const o = i - shift
      while (old < was.length && was[old].to < o) old++
      if (old === was.length || was[old].from >= o) {
        for (; old < was.length; old++) out.push(moved(was[old], shift))
        return out
      }
    }
    const r = runAt(line, n, i)
    if (r) out.push(r)
    i = r ? r.to + 1 : i + 1
  }
  return out
}

/** The line that carries a note's title, when it is the first one: `# Title`. */
export const TITLE_LINE = /^#(?:\s|$)/

/**
 * Which line carries the note's title, or -1: the first line that is not blank,
 * if it is a `# ` line. Blank lines before it are allowed because the vault is
 * full of them — frontmatter, then an empty line, then the heading — and READ,
 * which counts blocks rather than lines, has always taken that heading as the
 * title. The editor must agree, or the same title shows twice.
 */
export function titleLineOf(lines: readonly string[]): number {
  let i = 0
  while (i < lines.length && !lines[i].trim()) i += 1
  return i < lines.length && TITLE_LINE.test(lines[i]) ? i : -1
}

/** The text of a title line, `# Title` → `Title`. */
export const titleText = (line: string): string => line.replace(/^#\s*/, '').trim()
