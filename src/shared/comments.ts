/*
 * `.ts` on the specifier, as in shared/doc.ts: this module imports values, and
 * `node --experimental-strip-types` has to resolve them for the checks.
 */
import { EMBED_LINE, parseNote } from './doc.ts'
import { blockRuns, classify, inlineTokens, shownText, type BlockRun, type Tok } from './mdLive.ts'

/**
 * COMMENTS IN A NOTE, written in the note — CriticMarkup's review marks:
 *
 *   The plan rests on {==crop rotation==}{>>define this?<<} as its frame.
 *
 * `{==…==}` is the ANCHOR, the words a comment is about; `{>>…<<}` is the
 * COMMENT. One with no anchor is a note at that point. In the file rather than
 * beside it, so an anchor moves with its words however the note is edited —
 * by you, or by Claude going through them — and Claude reads them by reading
 * the note.
 *
 * This finds them by READ's own grammar — `inlineTokens`, which is `parseRuns`
 * with offsets — so a comment is exactly what READ draws as one: not in fenced
 * code, not in a code span, and only where it closes on its own line. Every
 * count, the pass that hands them to Claude and the index ⌘K searches read
 * this one list.
 */

export interface NoteComment {
  /** Where the comment's `{>>` starts in the body, and where its `<<}` ends. */
  from: number
  to: number
  /** Its words, as written between the marks. */
  text: string
  /**
   * The `{==…==}` written straight before it — what it is about — with the words
   * READ shows for it. Null for a comment at a point.
   */
  anchor: { from: number; to: number; words: string } | null
  /** The line it is on, 0-based. */
  line: number
  /** In a table's cell, where a `|` in its words is written `\|` — and read back as `|`, as READ reads it. */
  cell?: true
}

/**
 * How a line is read, when not as prose (0): as code (no comments), as a
 * table's row, as one of a fold's tags, as the rule under a table's head —
 * a row to READ's comments, cells of dashes, but nothing a comment can be about
 * — or as an embed, where READ draws another note, or a muted line saying it
 * could not: `{==` round it would leave a paragraph in its place.
 */
const CODE = 1
const ROW = 2
const TAG = 3
const SEP = 4
const EMBED = 5

/** How each of a note's lines is read, by READ's runs. */
function readAs(lines: readonly string[]): Uint8Array {
  const how = new Uint8Array(lines.length)
  const mark = (rs: readonly BlockRun[]): void => {
    for (const r of rs) {
      if (r.k === 'code') for (let i = r.from; i <= r.to; i++) how[i] = CODE
      else if (r.k === 'table') {
        for (let i = r.from; i <= r.to; i++) how[i] = ROW
        how[r.from + 1] = SEP
      } else {
        for (const t of r.tags) how[t] = TAG
        mark(r.inner)
      }
    }
  }
  mark(blockRuns((i) => lines[i], lines.length))
  // By `parseNote`'s own rule, which it asks of every line outside those runs.
  for (let i = 0; i < lines.length; i++) if (!how[i] && EMBED_LINE.test(lines[i])) how[i] = EMBED
  return how
}

/**
 * A table row's cells, as `splitRow` cuts them — on the pipes not escaped —
 * with where each starts in the note. READ reads each cell's runs on its own,
 * so a `{>>` in one cell is words, never the start of a comment in the next.
 */
export function cells(text: string, base: number): [string, number][] {
  let s = 0
  let e = text.length
  while (s < e && /\s/.test(text[s])) s += 1
  while (e > s && /\s/.test(text[e - 1])) e -= 1
  if (text[s] === '|') s += 1
  if (e > s && text[e - 1] === '|') e -= 1
  const out: [string, number][] = []
  let at = s
  for (let i = s; i < e; i++) {
    if (text[i] === '|' && text[i - 1] !== '\\') {
      out.push([text.slice(at, i), base + at])
      at = i + 1
    }
  }
  out.push([text.slice(at, e), base + at])
  return out
}

/**
 * The last few notes read, by their text. The pane's head, its document and the
 * details panel each ask about the same body, and the window renders often.
 */
const recent: { body: string; found: NoteComment[] }[] = []

/** Every open comment in a note, in the order they are written. Not to be changed: it is shared. */
export function findComments(body: string): NoteComment[] {
  // Most notes have none, and this is asked on every render of a note's head.
  if (!body.includes('{>>')) return []
  for (const r of recent) if (r.body === body) return r.found
  const found = read(body)
  recent.unshift({ body, found })
  if (recent.length > 4) recent.pop()
  return found
}

/**
 * One list of sibling tokens, read into `out`: a comment's anchor is the
 * anchor that ends where it starts. `src` is the text the tokens' offsets are in.
 */
function collect(src: string, toks: readonly Tok[], line: number, out: NoteComment[], cell = false): void {
  toks.forEach((t, n) => {
    if (t.k === 'comment') {
      const prev = toks[n - 1]
      const anchor =
        prev?.k === 'anchor' && prev.to === t.from
          ? { from: prev.from, to: prev.to, words: shownText(src.slice(prev.from + 3, prev.to - 3)) }
          : null
      const text = src.slice(t.from + 3, t.to - 3)
      out.push(
        cell
          ? { from: t.from, to: t.to, text: text.replace(/\\\|/g, '|'), anchor, line, cell: true }
          : { from: t.from, to: t.to, text, anchor, line }
      )
    } else if (t.k === 'bold' || t.k === 'italic' || t.k === 'link' || t.k === 'anchor' || t.k === 'highlight') collect(src, t.inner, line, out, cell)
  })
}

function read(body: string): NoteComment[] {
  const lines = body.split('\n')
  const how = readAs(lines)
  const out: NoteComment[] = []
  let offset = 0
  for (let i = 0; i < lines.length; i++) {
    const text = lines[i]
    if (how[i] !== CODE && text.includes('{>>')) {
      if (how[i] === ROW || how[i] === SEP) for (const [cell, at] of cells(text, offset)) collect(body, inlineTokens(cell, at), i, out, true)
      // A fold's tag as written — its summary is in it. Anything else past an
      // item's marker or a heading's hashes, where READ starts reading its runs.
      else if (how[i] === TAG) collect(body, inlineTokens(text, offset), i, out)
      else {
        const c = classify(text)
        const start = 'markTo' in c ? c.markTo : 0
        collect(body, inlineTokens(text.slice(start), offset + start), i, out)
      }
    }
    offset += text.length + 1
  }
  return out
}

/** `1 comment`, `3 comments` — the words the meta line and the palette say it in. */
export const commentsSaid = (n: number): string => `${n} comment${n === 1 ? '' : 's'}`

/* ---------- writing them ---------- */

/** One edit to a note's text, in its offsets. */
export interface Change {
  from: number
  to: number
  insert: string
}

/** Edits applied to a note's text — given in its offsets, applied last first. */
export function applyChanges(body: string, cs: readonly Change[]): string {
  let out = body
  for (const c of [...cs].sort((x, y) => y.from - x.from || y.to - x.to)) out = out.slice(0, c.from) + c.insert + out.slice(c.to)
  return out
}

/**
 * A comment's words as they can be written: one line of plain text, which is
 * all a comment is, and never `<<}`, which would end it early — nor, in a
 * table's cell, a bare `|`, which would end the cell.
 */
export const sayable = (text: string, cell = false): string => {
  const said = text.replace(/\s*\n\s*/g, ' ').replace(/<<\}/g, '<< }').trim()
  return cell ? said.replace(/(?<!\\)\|/g, '\\|') : said
}

/** What a new comment is about — or, where words already have one, that comment. */
export type CommentTarget =
  /**
   * `lone` is a highlight with no comment yet: the comment goes after it, the
   * anchor is already there. `cell`, it is in a table's cell.
   */
  | { kind: 'new'; a: number; b: number; words: string; lone: boolean; cell?: true }
  | { kind: 'old'; comment: NoteComment }

/** Which comment on the page a token on a line is, by where its `{>>` is. */
const commentFrom = (body: string, from: number): NoteComment | undefined =>
  findComments(body).find((c) => c.from === from)

/**
 * THE WORDS A COMMENT WOULD BE ABOUT, for a selection `[from, to)` in the note.
 *
 * An anchor is a phrase, by bold's rules, and one stretch of runs, as every
 * phrase is to READ: a line past an item's marker or a heading's hashes, or
 * one cell of a table's row. So it is the selection's first stretch that has
 * words in it, its space left out — a selection that starts on a bullet, at the
 * end of the line before, on a blank, a fence or a table's rule goes on to the
 * words after, and one that runs on past them is cut at their stretch's end.
 * Then it is moved out to the edges of what an anchor cannot sit inside: a code
 * span, a wikilink, a path, a link's address, and any phrase it reaches only
 * part of, since `{==` half in a bold phrase would leave READ showing stars.
 * Inside a phrase's words it can sit, as bold can sit inside a link. Words that
 * already have a comment open that comment instead; a highlight with none gets
 * one. Null where nothing selected could be about anything — code, a rule, a
 * blank, a fold's tags.
 */
export function anchorFor(body: string, from: number, to: number): CommentTarget | null {
  if (to < from) [from, to] = [to, from]
  const lines = body.split('\n')
  const how = readAs(lines)
  let ls = 0
  for (let i = 0; i < lines.length && ls <= to; i++) {
    const text = lines[i]
    const le = ls + text.length
    if (le >= from) {
      for (const [s, e] of stretches(text, ls, how[i])) {
        const t = within(body, Math.max(from, s), Math.min(to, e), s, e, how[i] === ROW)
        if (t) return t
      }
    }
    ls = le + 1
  }
  return null
}

/**
 * Where on a line READ reads runs: past its marker, or each of a row's cells —
 * and short of a numbered item's `~done`, which READ draws as the item's status,
 * not its words. None in code, on a rule, a blank, a fold's tag or an embed.
 */
function stretches(text: string, ls: number, how: number): [number, number][] {
  if (how === ROW) return cells(text, ls).map(([c, at]) => [at, at + c.length])
  if (how !== 0) return []
  const c = classify(text)
  if (c.k === 'rule' || c.k === 'blank') return []
  const status = /^\s*\d+[.)]\s/.test(text) ? STATUS.exec(text) : null
  return [[ls + ('markTo' in c ? c.markTo : 0), ls + (status ? status.index : text.length)]]
}

/** A numbered item's status, as READ reads it off the end of the item: `~done`, `~active`, `~blocked`. */
const STATUS = /\s+~(?:done|active|blocked)\s*$/

/** What a comment on `[a, b)` would be about, inside the stretch of runs `[s, e)` — a cell's, when `cell`: see `anchorFor`. */
function within(body: string, a: number, b: number, s: number, e: number, cell: boolean): CommentTarget | null {
  const space = (i: number): boolean => /\s/.test(body[i] ?? '')
  while (a < b && space(a)) a += 1
  while (b > a && space(b - 1)) b -= 1
  if (a >= b) return null

  // Every token in the stretch, nested ones too, each knowing the one after it.
  const all: { t: Tok; next?: Tok }[] = []
  const gather = (ts: readonly Tok[]): void =>
    ts.forEach((t, i) => {
      all.push({ t, next: ts[i + 1] })
      if (t.k === 'bold' || t.k === 'italic' || t.k === 'link' || t.k === 'anchor' || t.k === 'highlight') gather(t.inner)
    })
  gather(inlineTokens(body.slice(s, e), s))

  for (const { t, next } of all) {
    if (t.to <= a || t.from >= b) continue
    if (t.k === 'comment') {
      const there = commentFrom(body, t.from)
      if (there) return { kind: 'old', comment: there }
    }
    if (t.k === 'anchor') {
      const there = next?.k === 'comment' && next.from === t.to ? commentFrom(body, next.from) : undefined
      if (there) return { kind: 'old', comment: there }
      const lone = { kind: 'new' as const, a: t.from, b: t.to, words: shownText(body.slice(t.from + 3, t.to - 3)), lone: true, ...(cell ? { cell: true as const } : {}) }
      return sound(body, lone, s, e) ? lone : null
    }
  }
  for (let moved = true; moved; ) {
    moved = false
    for (const { t } of all) {
      const words: [number, number] | null =
        t.k === 'bold' || t.k === 'highlight'
          ? [t.from + 2, t.to - 2]
          : t.k === 'italic'
            ? [t.from + 1, t.to - 1]
            : t.k === 'link'
              ? [t.from + 1, t.textTo]
              : null
      if (words && a >= words[0] && b <= words[1]) continue
      if (t.from < a && a < t.to) {
        a = t.from
        moved = true
      }
      if (t.from < b && b < t.to) {
        b = t.to
        moved = true
      }
    }
  }
  const t = { kind: 'new' as const, a, b, words: shownText(body.slice(a, b)), lone: false, ...(cell ? { cell: true as const } : {}) }
  return sound(body, t, s, e) ? t : null
}

/** The comments in one stretch of runs read on its own, at its own offsets. */
function commentsIn(text: string): NoteComment[] {
  const out: NoteComment[] = []
  collect(text, inlineTokens(text, 0), 0, out)
  return out
}

/**
 * Whether writing a comment on `t` leaves READ showing what it showed: the same
 * kind of block, the same words, the same comments as before, and one more,
 * about `t`'s words. Tried on the stretch of runs `[s, e)` itself — the line
 * past its marker, or the cell — since marks put down among stray marks of its
 * own — a `{==` it already held, unclosed — can pair with those instead, and a
 * comment that changes the words on the page is not one this writes. The
 * block is asked of `parseNote` for the stretch's whole line, since a line's
 * kind can hang on all of it — an embed is one only alone on its line.
 */
export function sound(body: string, t: Extract<CommentTarget, { kind: 'new' }>, s: number, e: number, text = 'a comment'): boolean {
  const runs = body.slice(s, e)
  const said = sayable(text, t.cell)
  const after = applyChanges(
    runs,
    writeChanges(t, said).map((c) => ({ ...c, from: c.from - s, to: c.to - s }))
  )
  const ls = body.lastIndexOf('\n', s - 1) + 1
  const nl = body.indexOf('\n', e)
  const le = nl === -1 ? body.length : nl
  const kind = (line: string): string | undefined => parseNote(line)[0]?.kind
  if (kind(body.slice(ls, s) + after + body.slice(e, le)) !== kind(body.slice(ls, le))) return false
  if (shownText(after) !== shownText(runs)) return false
  const was = commentsIn(runs).map((c) => c.text)
  const now = commentsIn(after)
  // Where it lands: at the highlight's end, or past the `{==` and `==}` put round the words.
  const lands = t.b - s + (t.lone ? 0 : 6)
  const mine = now.filter((c) => c.from === lands && c.text === said)
  if (mine.length !== 1 || mine[0].anchor?.words !== t.words) return false
  return JSON.stringify(now.filter((c) => c !== mine[0]).map((c) => c.text)) === JSON.stringify(was)
}

/** The edits that write a comment on a target: around its words, or after a highlight that has none. */
export function writeChanges(t: Extract<CommentTarget, { kind: 'new' }>, text: string): Change[] {
  const said = `{>>${sayable(text, t.cell)}<<}`
  if (t.lone) return [{ from: t.b, to: t.b, insert: said }]
  return [
    { from: t.a, to: t.a, insert: '{==' },
    { from: t.b, to: t.b, insert: `==}${said}` }
  ]
}

/** The edit that changes what a comment says. */
export const editChanges = (c: NoteComment, text: string): Change[] => [{ from: c.from + 3, to: c.to - 3, insert: sayable(text, c.cell) }]

/** The edits that resolve a comment: it goes, and its anchor's words stay, unwrapped. */
export function resolveChanges(c: NoteComment): Change[] {
  const out: Change[] = [{ from: c.from, to: c.to, insert: '' }]
  if (c.anchor)
    out.push({ from: c.anchor.from, to: c.anchor.from + 3, insert: '' }, { from: c.anchor.to - 3, to: c.anchor.to, insert: '' })
  return out
}

/* ---------- the pass ---------- */

/** How much of a comment's line the pass quotes either side of it. */
const AROUND = 70

/**
 * The stretch of a comment's line the pass quotes, as written — marks and all,
 * since that is what Claude will find in the file and change. A note's lines
 * are its paragraphs, so a long one is cut to the words around the comment.
 */
function lineOf(body: string, c: NoteComment): string {
  const ls = body.lastIndexOf('\n', c.from - 1) + 1
  let le = body.indexOf('\n', c.to)
  if (le === -1) le = body.length
  const a = Math.max(ls, (c.anchor?.from ?? c.from) - AROUND)
  const b = Math.min(le, c.to + AROUND)
  return `${a > ls ? '…' : ''}${body.slice(a, b).trim()}${b < le ? '…' : ''}`
}

/**
 * THE PASS: WHAT CLAUDE IS ASKED TO DO WITH A NOTE'S COMMENTS.
 *
 * Made in one place, so every way of starting a pass asks the same thing. It
 * lists every open comment — what it says, what it is about, the line it is in
 * as written — so none is missed, and says what to do with each: a question is
 * answered in the thread; a change asked for is made in the note; a comment
 * handled is taken out of the note, its anchor unwrapped and its words left;
 * one it could not handle is left as it is, the reason said in the thread.
 * Nothing else in the note is touched, and no comments of Claude's own are
 * added. The note is named by its path: the CLI runs in the vault.
 */
export function reviewPrompt(path: string, body: string, comments: readonly NoteComment[]): string {
  const n = comments.length
  const items = comments.map((c, i) => {
    const about = c.anchor ? `about “${c.anchor.words}”` : 'at a point in the text'
    return `${i + 1}. “${c.text || '(no words)'}” — ${about}, in this line:\n   ${lineOf(body, c)}`
  })
  return [
    `Go through the review comments in [[${path.replace(/\.md$/, '')}]] — the note at \`${path}\`.`,
    '',
    `They are written in the note in CriticMarkup: \`{==words==}\` marks the words a comment is about, and \`{>>…<<}\` is the comment itself. There ${n === 1 ? 'is one' : `are ${n}`}:`,
    '',
    ...items,
    '',
    'For each one:',
    '- If it asks a question, answer it here, in this thread.',
    '- If it asks for a change, make that change in the note.',
    '- Once a comment is handled, take it out of the note: remove its `{>>…<<}`, and the `{==` and `==}` around its words, leaving the words themselves.',
    '- If you cannot handle one, leave it in the note exactly as it is, and say why here.',
    '',
    'Change nothing else in the note, and add no comments of your own. When you are done, say what you did with each comment, by its number.'
  ].join('\n')
}

/**
 * A comment found again after the note may have moved under it: the one saying
 * the same words, nearest to where it was. Null when it is gone.
 */
export function findAgain(body: string, was: { from: number; text: string }): NoteComment | null {
  let best: NoteComment | null = null
  for (const c of findComments(body))
    if (c.text === was.text && (!best || Math.abs(c.from - was.from) < Math.abs(best.from - was.from))) best = c
  return best
}
