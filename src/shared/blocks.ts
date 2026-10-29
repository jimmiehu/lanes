import type { MessageBlock } from './types'

/**
 * Splits an assistant turn into the things a TRANSCRIPT has that a document
 * does not: tool rows, images, and the prose between them.
 *
 * It no longer parses the prose. There is one document grammar now — see
 * shared/doc.ts — and a thread is a document whose sections happen to be turns:
 * the same headings, lists, tasks, quotes, rules, code and tables, rendered by
 * the same components. Splitting markdown a second time here is what made a
 * heading in a reply come out as a bare paragraph and a `- [ ]` come out as a
 * dash, while the identical text in a note rendered properly.
 *
 * So a run of prose becomes ONE text block carrying its markdown verbatim, and
 * the renderer hands it to the document engine.
 */
export function parseBlocks(md: string, _idPrefix: string): MessageBlock[] {
  const text = md.replace(/\r\n/g, '\n').trim()
  return text ? [{ kind: 'text', text }] : []
}

/** Strips markdown emphasis for the places the design renders plain runs. */
export function plain(s: string): string {
  return s
    .replace(/\{>>.*?<<\}/g, '')
    .replace(/\{==(.+?)==\}/g, '$1')
    .replace(/==([^\s=](?:[^=]*[^\s=])?)==/g, '$1')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/(^|\W)\*(?!\s)(.+?)(?<!\s)\*(?=\W|$)/g, '$1$2')
    .replace(/`([^`]+)`/g, '$1')
}

export interface Run {
  text: string
  bold?: boolean
  italic?: boolean
  code?: boolean
  href?: string
  /** A `[[wikilink]]` target, resolved against the vault when clicked. */
  wiki?: string
  /** Words a comment is about: inside `{==…==}`. */
  anchor?: boolean
  /**
   * Highlighted: inside `==…==`, the marker pen of iA Writer and Obsidian.
   * Words at both ends, no space against a mark — `a == b` is a comparison —
   * and no `==` between, but for an anchor, a comment or a code span whole:
   * a highlight can hold a comment's words, and its marks are not the end of it.
   */
  highlight?: boolean
  /**
   * A comment, `{>>…<<}` — its words, which are NOT the line's: an annotation
   * on the text rather than the text, so `text` is empty and the words are here.
   */
  comment?: string
}

/**
 * Inline markdown, per the original design: **bold**, *italic*, `code`,
 * [label](url), and `[[wikilinks]]` — and CriticMarkup's review marks, which
 * is how a comment is written in a note: `{==the words==}{>>what about them<<}`.
 * Everything else stays literal.
 *
 * Emphasis recurses. The tokenizer scans left to right, so `**bold with a
 * [[link]] in it**` matches the bold first and would otherwise print the
 * wikilink's brackets raw — which is what a vault's notes do constantly
 * wherever a bolded lead-in naming a note is the house style. Code spans do not
 * recurse: markdown inside backticks is meant to stay literal. An anchor
 * recurses as bold does; a comment does not, its words being plain.
 */
/**
 * Splits a markdown table row on its *unescaped* pipes.
 *
 * A pipe inside a cell has to be written `\\|`, and the one place notes
 * do that constantly is a wikilink alias: `[[reading/cities/vienna\\|Vienna]]`.
 * Splitting on every pipe tore those in half — `[[reading/cities/vienna\\`
 * in one cell and `Vienna]]` in the next — so neither half matched the wikilink
 * pattern and both rendered as raw brackets.
 */
export function splitRow(row: string): string[] {
  return row
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split(/(?<!\\)\|/)
    .map((c) => c.replace(/\\\|/g, '|').trim())
}

/**
 * A vault-relative note path written as bare prose — `daily/2026-08-21.md`.
 * Claude announces the files it wrote that way rather than as a `[[wikilink]]`,
 * and "Note written: daily/…md" that you cannot click is a dead end.
 *
 * A slash is required, so a passing mention of `README.md` is left alone: with
 * a folder in it the string is a path, and paths in this app resolve to notes.
 * Anything inside backticks is already safe — code spans do not recurse.
 *
 * The leading slash is part of the match. Claude writes absolute paths as often
 * as relative ones, and without it the run began at "Users/…" — the slash was
 * left outside the link, so the path rendered as though it had lost its root.
 * Turning one back into a vault path is resolveIn's job, which knows where the
 * vault is.
 */
const VAULT_PATH = /^\/?(?:[\w.-]+\/)+[\w.-]+\.md$/

/**
 * WHERE A MARKDOWN LINK GOES, when it is a file rather than a page on the web.
 *
 * `[garden-state.md](projects/garden/garden-state.md)` is how Claude writes the
 * notes it touched as often as it writes `[[…]]`, and drawn as a web link it
 * went nowhere: a relative address resolves against the app's own page, so a
 * click opened a file that is not there and nothing happened. A link with a
 * scheme of its own — `https:`, `mailto:` — is the web's and is left to it;
 * anything else is a path, which this hands back in the form the vault's
 * resolver reads: `file://` taken off, `%20` decoded, a `?query` or `#part` and
 * a `:42` line suffix dropped. `note` says whether it is a note, which opens
 * in the note pane; any other file is shown in the Finder.
 *
 * `file:` is taken with no slashes, one or two, not only as `file://`: written
 * as `file:/x` or `file:x` it read as a scheme of its own and went to the web's
 * handler — straight to the system, which opened whatever was there. The
 * slashes past the scheme's own two are the path's, so `file:///x` and
 * `file:/x` are both `/x`.
 */
export function fileAddress(href: string): { path: string; note: boolean } | null {
  let h = href.trim()
  const file = /^file:(?:\/\/)?/i.exec(h)
  if (file) h = h.slice(file[0].length)
  else if (/^[a-z][a-z0-9+.-]*:/i.test(h)) return null
  h = h.replace(/[?#].*$/, '')
  try {
    h = decodeURIComponent(h)
  } catch {
    // Not encoded after all — a lone `%` is a character like any other.
  }
  h = h.replace(/^\.\//, '').replace(/:\d+(?::\d+)?$/, '')
  if (!h) return null
  return { path: h, note: /\.md$/i.test(h) }
}

export function parseRuns(input: string): Run[] {
  const runs: Run[] = []
  const pattern =
    /(\{==.+?==\})|(\{>>.*?<<\})|(==(?=[^\s=])(?:\{==.+?==\}|\{>>.*?<<\}|`[^`]+`|[^=])+?(?<=[^\s={])==)|(\[\[[^\]]+\]\])|(\*\*[^*]+\*\*)|(`[^`]+`)|(\[[^\]]+\]\([^)\s]+\))|(\*[^*\s][^*]*\*)|(\/?(?:[\w.-]+\/)+[\w.-]+\.md)/g
  let last = 0
  let m: RegExpExecArray | null

  while ((m = pattern.exec(input)) !== null) {
    if (m.index > last) runs.push({ text: input.slice(last, m.index) })
    const tok = m[0]
    if (tok.startsWith('{==')) {
      for (const r of parseRuns(tok.slice(3, -3))) runs.push({ ...r, anchor: true })
    } else if (tok.startsWith('{>>')) {
      runs.push({ text: '', comment: tok.slice(3, -3) })
    } else if (tok.startsWith('==')) {
      for (const r of parseRuns(tok.slice(2, -2))) runs.push({ ...r, highlight: true })
    } else if (tok.startsWith('[[')) {
      // `[[path/to/note|alias]]` shows the alias, links to the path.
      const inner = tok.slice(2, -2)
      // `\|` as well as `|`: an alias written inside a table carries the escape
      // with it, and a target ending in a stray backslash resolves to nothing.
      const sep = inner.match(/\\?\|/)
      const bar = sep?.index ?? -1
      const target = (bar === -1 ? inner : inner.slice(0, bar)).trim()
      const label =
        bar === -1
          ? (target.split('/').pop() ?? target)
          : inner.slice(bar + (sep?.[0].length ?? 1)).trim()
      runs.push({ text: label, wiki: target })
    } else if (tok.startsWith('**')) {
      for (const r of parseRuns(tok.slice(2, -2))) runs.push({ ...r, bold: true })
    } else if (tok.startsWith('`')) {
      // A code span stays literal — except when the whole of it is a vault
      // path, which is how a note actually gets announced: "**Note created:**
      // `projects/garden/beds/…md`". Backticks are the natural markdown for
      // a filename, so leaving them alone meant the bare-path link almost never
      // fired where it was written to fire. It keeps its code styling; the only
      // thing added is that it can be opened.
      const inner = tok.slice(1, -1)
      if (VAULT_PATH.test(inner)) runs.push({ text: inner, code: true, wiki: inner })
      else runs.push({ text: inner, code: true })
    }
    else if (tok.startsWith('[')) {
      const split = tok.indexOf('](')
      const href = tok.slice(split + 2, -1)
      for (const r of parseRuns(tok.slice(1, split))) runs.push({ ...r, href })
    } else if (VAULT_PATH.test(tok)) {
      // The path stays as written — it is what was announced; it just becomes
      // reachable.
      runs.push({ text: tok, wiki: tok })
    } else {
      for (const r of parseRuns(tok.slice(1, -1))) runs.push({ ...r, italic: true })
    }
    last = pattern.lastIndex
  }
  if (last < input.length) runs.push({ text: input.slice(last) })
  return runs.length ? runs : [{ text: input }]
}
