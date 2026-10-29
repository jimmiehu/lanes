import {
  CharCategory,
  EditorSelection,
  EditorState,
  Prec,
  StateEffect,
  StateField,
  Transaction,
  findClusterBreak,
  ChangeSet,
  type ChangeSpec,
  type Extension,
  type Line,
  type Range,
  type SelectionRange,
  type Text,
  type TransactionSpec
} from '@codemirror/state'
import {
  Decoration,
  EditorView,
  ViewPlugin,
  WidgetType,
  keymap,
  type DecorationSet,
  type KeyBinding,
  type MouseSelectionStyle,
  type ViewUpdate
} from '@codemirror/view'
import {
  history,
  historyKeymap,
  isolateHistory,
  indentLess,
  indentMore,
  insertNewline,
  moveLineDown,
  moveLineUp,
  standardKeymap
} from '@codemirror/commands'
import { indentUnit } from '@codemirror/language'
import { autocompletion, type Completion, type CompletionContext, type CompletionResult } from '@codemirror/autocomplete'
import { tooltips } from '@codemirror/view'
import { blockRuns, blockRunsAfter, classify, cols, inlineTokens, titleLineOf, type BlockRun, type Tok } from '../../../shared/mdLive'
import {
  anchorFor,
  editChanges,
  findAgain,
  resolveChanges,
  writeChanges,
  type CommentTarget
} from '../../../shared/comments'

/**
 * THE LIVE LAYER — what turns a CodeMirror document into a note you write in.
 *
 * Everything here decorates; nothing rewrites. The file on disk is the text in
 * the editor, byte for byte, and every `**`, `##` and `- [ ]` is still in it.
 * What changes is only how the text is DRAWN: marks are hidden where the caret
 * is not, a bullet is a dash in a column, a task is a box, a heading has its
 * size. Stand in a piece of markup and its syntax comes back — that piece, not
 * the paragraph around it, because revealing every mark in a ten-line
 * paragraph the moment you touch one word is the mess this is meant to end.
 *
 * TWO RULES THE REST FOLLOWS.
 *
 * 1. READ's grammar, not markdown's. Which lines are headings, lists and tasks,
 *    and which runs are bold, italic, code and links, comes from `shared/mdLive`,
 *    which is READ's own parser restated with positions and proved against the
 *    whole vault by `checks/md-live.mjs`. So does where fenced code, a table
 *    and a fold's tags start and stop — a table ends here on the line READ
 *    ends it on, not a line further down. And so does what the keys read: ↵
 *    carries on a list or a quote by the same grammar (`continueItem`), so a
 *    line READ draws as prose is prose to ↵ too. There is no CommonMark parse
 *    underneath any more; the one thing it was kept for got that wrong.
 *
 * 2. Nothing jumps. Revealing syntax must not move the words you are looking
 *    at. So the markers that open a line — a bullet, a task box, a quote — are
 *    drawn as furniture and are never revealed at all: they are widgets the
 *    caret steps around, and Backspace at the start of an item takes one away.
 *    A heading's `##` hangs in the left margin, the way iA Writer hangs it, so
 *    showing it on the line you are in shifts nothing. Only inline marks —
 *    `**`, a link's `(url)` — take space when shown, and only the one you are
 *    standing in.
 */

/* ---------- the title, which the head already says ---------- */

/**
 * Where the note's own title line is, when it has one.
 *
 * The head states a note's title, as an editable field that writes this line.
 * Drawing it again as the first line of the document is the same words twice,
 * and READ already refuses to — so the editor hides it too, and the one blank
 * line under it, which is the gap between a title and what follows it rather
 * than something anybody wrote.
 *
 * `lines` is how many lines are hidden (0, 1 or 2); `body` is the first
 * position the caret may stand at.
 */
export interface TitleZone {
  lines: number
  body: number
}

function zoneOf(state: EditorState): TitleZone {
  const doc = state.doc
  const head: string[] = []
  for (let i = 1; i <= Math.min(doc.lines, 40); i += 1) head.push(doc.line(i).text)
  // The first line that is not blank, if it is a `# ` line — blank lines above
  // it included, since the vault is full of frontmatter, an empty line, and
  // then the heading, and READ has always taken that heading as the title.
  const at = titleLineOf(head)
  // Only when there is somewhere to write under it. A note that is nothing but
  // its title line would otherwise draw no lines at all — an editor with no
  // place to put the caret. The editor is never handed one (NoteEditor gives
  // such a note the line under it, see `roomy`); this is for a state made from
  // one anyway, which draws the line rather than nothing.
  if (at < 0 || doc.lines < at + 2) return { lines: 0, body: 0 }
  const title = doc.line(at + 1)
  const next = doc.line(at + 2)
  const both = !next.text.trim() && doc.lines >= at + 3
  const last = both ? next : title
  return { lines: at + (both ? 2 : 1), body: last.to + 1 }
}

/*
 * The zone is decided when the note opens, and afterwards only by the disk and
 * by the title field naming a note that had no title. Typing `# ` at the top of
 * a note that had no title is writing a heading, not naming the note — and
 * hiding the line under the caret the moment its first word arrived would make
 * the words vanish as they were typed.
 *
 * Nor does writing move it, in the body or in the field. The blank under a
 * title is hidden because nobody wrote it; a blank line ↵ opens at the top of
 * the body, in a note with none there, is one somebody just did — and asked
 * afresh on every edit, the zone took it in: the ↵ drew nothing, and the next ⌫
 * went up into the title rather than taking it back. Deleting the words of a
 * first line under a tight title did the same, and the caret jumped to the line
 * below; renaming the note in the field swallowed the line after the fact. So
 * those edits only carry the zone along. An undo that reaches into the hidden
 * lines — an edit made before the field named the note — is the one body edit
 * that can change them, and it asks again.
 *
 * And what the disk decides is the TOP of the note: the hidden lines, and the
 * first line under them, whose being blank is the whole question. A body from
 * outside that changed the note further down — Claude adding a paragraph at the
 * end while you write — is carried through like any other edit. Asked afresh,
 * it took in the blank line you had just opened, and moved the caret off it.
 */
export const titleZone = StateField.define<TitleZone>({
  create: zoneOf,
  update: (was, tr) => {
    if (!tr.docChanged) return was
    const field = tr.isUserEvent('input.title')
    const disk = tr.isUserEvent('external')
    if (!was.lines) return field || disk ? zoneOf(tr.state) : was
    if (!field && tr.changes.touchesRange(0, disk ? was.body : was.body - 1)) return zoneOf(tr.state)
    return { lines: was.lines, body: tr.changes.mapPos(was.body, -1) }
  }
})

/**
 * Nothing but the title field and the disk writes the hidden lines. ⌥⌫ or ⇧⌫ at
 * the top of the body would otherwise delete backwards into a line that is not
 * on screen and fold the first line of writing into the title.
 *
 * Undo and redo never reach this: CodeMirror applies them as recorded, with the
 * filters off, and an undo that reaches the hidden lines is the one body edit
 * `titleZone` asks about again.
 */
const guardTitle = EditorState.transactionFilter.of((tr) => {
  if (!tr.docChanged) return tr
  const zone = tr.startState.field(titleZone)
  if (!zone.lines) return tr
  if (tr.isUserEvent('input.title') || tr.isUserEvent('external')) return tr
  return tr.changes.touchesRange(0, zone.body - 1) ? [] : tr
})

const titleHidden = StateField.define<DecorationSet>({
  create: (s) => hideTitle(s),
  update: (was, tr) => (tr.docChanged ? hideTitle(tr.state) : was),
  provide: (f) => [
    EditorView.decorations.from(f),
    // A range the caret cannot enter, so no arrow, click or drag lands inside
    // a line that is not on screen.
    EditorView.atomicRanges.of((v) => v.state.field(f))
  ]
})

function hideTitle(state: EditorState): DecorationSet {
  const z = state.field(titleZone)
  if (!z.lines) return Decoration.none
  return Decoration.set([Decoration.replace({ block: true }).range(0, z.body - 1)])
}

/* ---------- where the caret may stand ---------- */

/** The part of a line that is furniture: a bullet, a task box, a quote rule. */
function markerZone(text: string): number {
  const c = classify(text)
  if (c.k === 'bullet' || c.k === 'task' || c.k === 'quote') return c.markTo
  return 0
}

/**
 * A LINE THAT IS CODE HAS NO FURNITURE. `- name: foo` in a YAML block is a
 * dash, not a bullet, and `# build` in a shell block is a comment, not a
 * heading; the drawing already knows — it draws those lines as they are
 * written, dash and all — and every rule that reads a line's marker has to
 * know it too. Asked by the text alone, a caret could not reach the start of
 * a `- ` line in code, ⌫ took `  - ` away as if it were an item, and ↵ after
 * the `# ` of a shell comment opened a line above it instead of splitting it.
 *
 * Asked of the same runs `regions` paints from — READ's own fences, tables and
 * folds (see `runs`) — so a line is literal to the keys exactly where it is
 * drawn literal: a line of fenced code, a row of a table, or one of a fold's
 * tags. One answer for the page and the keys, found once per edit for the
 * whole note, and here only looked up: a binary search, on the lines where the
 * text already says marker.
 */
function literal(state: EditorState, line: Line): boolean {
  return literalAt(state.field(runs), line.number - 1)
}

function literalAt(rs: readonly BlockRun[], i: number): boolean {
  let lo = 0
  let hi = rs.length
  while (lo < hi) {
    const m = (lo + hi) >> 1
    if (rs[m].to < i) lo = m + 1
    else hi = m
  }
  const r = rs[lo]
  if (!r || r.from > i) return false
  // A fold's body is prose that READ parses as a note of its own; only its
  // tags, and the runs inside it, are drawn as written.
  if (r.k === 'fold') return r.tags.includes(i) || literalAt(r.inner, i)
  return true
}

/**
 * THE CARET NEVER STANDS INSIDE FURNITURE.
 *
 * A bullet is drawn as a dash in a column, not as `- `, so a caret between the
 * dash and the words would be standing on something that is not there — and
 * typing at the head of the line would push the words out from under their own
 * bullet and end the list. So a caret that lands inside a marker is moved to
 * the start of the words, however it got there: ↑ and ↓, a click, Home, ⌘←. A
 * selection's moving end is moved the same way, so ⇧Home cannot take the
 * marker with it.
 *
 * ← from the start of an item's words is the one move that means something
 * else — "go back", to the end of the line above — and it has a key binding of
 * its own below, rather than being guessed at here from which way the caret
 * moved. Guessing is how Home once jumped to the line above.
 *
 * The hidden title line is the same, but never entered: the head owns it.
 */
const snap = EditorState.transactionFilter.of((tr) => {
  if (!tr.selection && !tr.docChanged) return tr
  const state = tr.state
  const zone = state.field(titleZone)
  let moved = false
  /** A position, moved out of furniture: to the words — or, selecting in from above, to the line's start. */
  const out = (pos: number, anchor?: number): number => {
    let at = pos
    if (zone.lines && at < zone.body) at = zone.body
    const line = state.doc.lineAt(at)
    const m = markerZone(line.text)
    // The runs last: this filter runs on every caret move, and the text has
    // to say marker, with the caret inside it, before they are asked.
    if (m && at < line.from + m && !literal(state, line))
      at = anchor !== undefined && anchor < line.from ? line.from : line.from + m
    return at
  }
  const ranges = state.selection.ranges.map((r) => {
    if (r.empty) {
      const at = out(r.head)
      if (at === r.head) return r
      moved = true
      // The goal column rides along: a caret pushed past a bullet on the way
      // down a list still means to be in the column it started in.
      return EditorSelection.cursor(at, r.assoc, r.bidiLevel ?? undefined, r.goalColumn)
    }
    const anchor = zone.lines && r.anchor < zone.body ? zone.body : r.anchor
    const head = out(r.head, anchor)
    if (anchor === r.anchor && head === r.head) return r
    moved = true
    return EditorSelection.range(anchor, head, r.goalColumn)
  })
  if (!moved) return tr
  return [tr, { selection: EditorSelection.create(ranges, state.selection.mainIndex), sequential: true }]
})

/**
 * WHERE THE WORDS OF THE LINE AT `pos` START — past a bullet, a box, a quote's
 * rule, a heading's hashes or an ordinal: where a caret the app puts down on a
 * line goes, rather than one you put there.
 *
 * A new editor's caret is not a transaction, so `snap` never sees it. Left at
 * the start of the first line, it stood inside the furniture of a note that
 * opens with an item, and the first thing typed went in front of the marker:
 * `- [ ] milk` became `eggs - [ ] milk`, a task no more; `## Section` became
 * `Intro ## Section`. A heading's hashes are text you may stand before, but not
 * where a note you open puts you.
 */
export function wordsStart(state: EditorState, pos: number): number {
  const line = state.doc.lineAt(pos)
  if (literal(state, line)) return pos
  const c = classify(line.text)
  return 'markTo' in c ? Math.max(pos, Math.min(line.to, line.from + c.markTo)) : pos
}

/**
 * Undo and redo put back the caret they recorded, with the filters off — so
 * `snap` never sees it either. What they put back was snapped when it was
 * recorded, but in a note the disk has changed since, it is mapped through
 * those changes, and can come down inside a marker that was not there. So it is
 * looked at again straight after, before anything is drawn, and moved out of
 * the furniture the way every other caret is.
 */
const resnap = ViewPlugin.define((view) => ({
  update(u: ViewUpdate): void {
    if (!u.transactions.some((tr) => tr.isUserEvent('undo') || tr.isUserEvent('redo'))) return
    queueMicrotask(() => {
      try {
        const tr = view.state.update({ selection: view.state.selection })
        if (!tr.newSelection.eq(view.state.selection)) view.dispatch(tr)
      } catch {
        // Torn down in between: nothing left to put right.
      }
    })
  }
}))

/* ---------- a stretch of writing ---------- */

/** A note went into WRITE: what esc would take back starts again from here. */
export const beginStretch = StateEffect.define<number>()

interface Stretch {
  /** Which stretch — the pane's count, so the editor shown again in the same one keeps it. */
  id: number
  /** From the document as it stands back to the document the stretch began with. */
  back: ChangeSet
}

/**
 * WHAT ESC WOULD TAKE BACK: everything written since the note went into WRITE,
 * kept as the one change that undoes it — and kept as the writing goes, so a
 * change from outside meanwhile (Claude, editing the note beside you) is
 * carried through it rather than taken back with it. Discarding is yours to
 * do to your words, not to theirs.
 *
 * The editor's own history cannot answer this. It runs back past the stretch,
 * since it is kept across READ and across tabs, and it holds a hundred steps
 * where a stretch can hold any number. The title field's writes are in here
 * though they are not in that history: a title changed in the stretch is part
 * of what the stretch wrote.
 *
 * A state field, so it goes where the editor's state goes: kept with it when
 * the tab is left and taken up again, still the same stretch, when it comes
 * back.
 */
export const stretch = StateField.define<Stretch>({
  create: (state) => ({ id: 0, back: ChangeSet.empty(state.doc.length) }),
  update(was, tr) {
    for (const e of tr.effects) {
      if (e.is(beginStretch)) return { id: e.value, back: ChangeSet.empty(tr.state.doc.length) }
    }
    if (!tr.docChanged) return was
    if (tr.isUserEvent('external')) return { id: was.id, back: was.back.map(tr.changes) }
    return { id: was.id, back: tr.changes.invert(tr.startState.doc).compose(was.back) }
  }
})

/** Whether the stretch has changed the note — words typed and taken out again have not. */
export function stretchChanged(state: EditorState): boolean {
  const { back } = state.field(stretch)
  return !back.empty && !back.apply(state.doc).eq(state.doc)
}

/**
 * The stretch, taken back: the note as it was when it went into WRITE, with
 * whatever arrived from outside since. With the filters off, as an undo is
 * applied — the title line it may put back is one only the field and the disk
 * may otherwise write — and as one step of the editor's history, so ⌘Z in a
 * later stretch brings it all back.
 */
export function discardStretch(view: EditorView): void {
  const s = view.state.field(stretch)
  view.dispatch({
    changes: s.back,
    effects: beginStretch.of(s.id),
    userEvent: 'undo.discard',
    annotations: isolateHistory.of('full'),
    filter: false
  })
}

/* ---------- widgets ---------- */

/** A list's dash, in its own column. READ draws it as `–`, so it is `–` here. */
class Bullet extends WidgetType {
  constructor(readonly depth: number) {
    super()
  }
  eq(o: Bullet): boolean {
    return o.depth === this.depth
  }
  toDOM(): HTMLElement {
    const el = document.createElement('span')
    el.className = 'cm-md-bullet'
    el.style.width = `calc(var(--ed-li) * ${this.depth + 1})`
    el.style.paddingLeft = `calc(var(--ed-li) * ${this.depth})`
    el.textContent = '–'
    el.setAttribute('aria-hidden', 'true')
    return el
  }
  ignoreEvent(): boolean {
    return false
  }
}

/** A task's box. A click on it ticks the source; the caret does not move. */
class Box extends WidgetType {
  constructor(
    readonly depth: number,
    readonly done: boolean
  ) {
    super()
  }
  eq(o: Box): boolean {
    return o.depth === this.depth && o.done === this.done
  }
  toDOM(): HTMLElement {
    const wrap = document.createElement('span')
    wrap.className = 'cm-md-taskcol'
    wrap.style.width = `calc(var(--ed-li) * ${this.depth} + var(--ed-task))`
    wrap.style.paddingLeft = `calc(var(--ed-li) * ${this.depth})`
    const box = document.createElement('span')
    box.className = 'cm-md-task'
    box.dataset.done = this.done ? '1' : '0'
    box.title = this.done ? 'Mark not done' : 'Mark done'
    box.setAttribute('role', 'checkbox')
    box.setAttribute('aria-checked', this.done ? 'true' : 'false')
    wrap.appendChild(box)
    return wrap
  }
  ignoreEvent(): boolean {
    return false
  }
}

/** Width, and nothing else: the room a nested ordinal's indentation takes. */
class Indent extends WidgetType {
  constructor(readonly depth: number) {
    super()
  }
  eq(o: Indent): boolean {
    return o.depth === this.depth
  }
  toDOM(): HTMLElement {
    const el = document.createElement('span')
    el.className = 'cm-md-indent'
    el.style.width = `calc(var(--ed-li) * ${this.depth})`
    return el
  }
}

/**
 * WHERE A COMMENT IS, with the comment put away: the marker READ draws, carrying
 * the comment's words for the margin to show (components/Comments.tsx). Not a
 * place for the caret — a press on it opens the comment, it does not move the
 * caret, so the comment does not come out of hiding under the pointer. With the
 * caret in the comment its raw text is on screen, and the marker is nothing but
 * the place the margin reads.
 */
class CommentAt extends WidgetType {
  constructor(
    readonly key: string,
    readonly text: string,
    readonly bare: boolean,
    readonly shown: boolean
  ) {
    super()
  }
  eq(o: CommentAt): boolean {
    return o.key === this.key && o.text === this.text && o.bare === this.bare && o.shown === this.shown
  }
  toDOM(): HTMLElement {
    const el = document.createElement('span')
    el.className = 'cmt-at'
    el.dataset.cmtAt = this.key
    el.dataset.cmtText = this.text
    if (this.bare) el.dataset.cmtBare = '1'
    el.title = this.text
    el.addEventListener('mousedown', (e) => e.preventDefault())
    if (this.shown) {
      el.style.display = 'inline'
      return el
    }
    const ns = 'http://www.w3.org/2000/svg'
    const svg = document.createElementNS(ns, 'svg')
    for (const [k, v] of Object.entries({ width: '11', height: '11', viewBox: '0 0 14 14', fill: 'none', stroke: 'currentColor', 'stroke-width': '1.3', 'stroke-linejoin': 'round', 'aria-hidden': 'true' }))
      svg.setAttribute(k, v)
    svg.style.display = 'block'
    const path = document.createElementNS(ns, 'path')
    path.setAttribute('d', 'M2.6 3.2h8.8v5.9H6.9l-2.8 2.3V9.1H2.6z')
    svg.appendChild(path)
    el.appendChild(svg)
    return el
  }
  ignoreEvent(): boolean {
    return true
  }
}

/** What an empty body says, so an untouched note is not a blank you have to decode. */
class Hint extends WidgetType {
  eq(): boolean {
    return true
  }
  toDOM(): HTMLElement {
    const el = document.createElement('span')
    el.className = 'cm-md-hint'
    el.textContent = 'Start writing…'
    el.setAttribute('aria-hidden', 'true')
    return el
  }
  ignoreEvent(): boolean {
    return false
  }
}

/* ---------- find ---------- */

export interface FindState {
  hits: { from: number; to: number }[]
  current: number
}
export const setFind = StateEffect.define<FindState | null>()

const findMarks = StateField.define<{ state: FindState | null; deco: DecorationSet }>({
  create: () => ({ state: null, deco: Decoration.none }),
  update(was, tr) {
    let next = was
    if (tr.docChanged && was.state) {
      // Mapped, not re-searched: the bar re-runs on its own schedule, and a hit
      // that slides down a line as you type above it should slide with it.
      const hits = was.state.hits.map((h) => ({
        from: tr.changes.mapPos(h.from, 1),
        to: tr.changes.mapPos(h.to, -1)
      }))
      next = { state: { ...was.state, hits }, deco: was.deco.map(tr.changes) }
    }
    for (const e of tr.effects) {
      if (!e.is(setFind)) continue
      const s = e.value
      if (!s || !s.hits.length) {
        next = { state: s, deco: Decoration.none }
        continue
      }
      next = {
        state: s,
        deco: Decoration.set(
          s.hits
            .filter((h) => h.to > h.from)
            .map((h, i) =>
              Decoration.mark({ class: i === s.current ? 'cm-find cm-find-now' : 'cm-find' }).range(h.from, h.to)
            ),
          true
        )
      }
    }
    return next
  },
  provide: (f) => EditorView.decorations.from(f, (v) => v.deco)
})

/** The find as it stands now — hits mapped through every edit since it ran. */
export const findNow = (state: EditorState): FindState | null => state.field(findMarks, false)?.state ?? null

/** The current find hit, which reveals its markup the way the caret does. */
const findReveal = (state: EditorState): { from: number; to: number }[] => {
  const s = state.field(findMarks, false)?.state
  const h = s?.hits[s.current]
  return h ? [h] : []
}

/* ---------- the drawing ---------- */

interface Options {
  /** Dim every paragraph but the one the caret is in. */
  focus: boolean
}
export const setOptions = StateEffect.define<Options>()
const options = StateField.define<Options>({
  create: () => ({ focus: false }),
  update: (was, tr) => {
    for (const e of tr.effects) if (e.is(setOptions)) return e.value
    return was
  }
})

/** The caret is in this editor — whether or not the window is in front. */
export const writing = (view: EditorView): boolean => view.root.activeElement === view.contentDOM

const touches = (sel: readonly { from: number; to: number }[], a: number, b: number): boolean =>
  sel.some((r) => r.from <= b && r.to >= a)

/**
 * WHERE FENCES, TABLES AND A FOLD'S TAGS RUN — by READ's rules, not the parse
 * tree's.
 *
 * These used to come from the CommonMark parse underneath, and CommonMark ends
 * those runs somewhere else. A table there takes every line under it up to a
 * blank one, so a sentence written straight under a table was drawn as a row —
 * small mono, its `**` showing — while READ drew it as the paragraph it is.
 * `~~~` was code; a comment was HTML, and a `<br>` took the lines under it into
 * HTML with it; a fold's body typed straight under its `<summary>` was HTML
 * too. READ reads none of those that way, and ⌘E then showed a different
 * document.
 *
 * Found for the whole note, because a fence opened at the top settles the
 * question for every line under it — and kept rather than found again: an
 * edit reads from the run above it until the note is back in step, which is a
 * few lines, however long the note (`blockRunsAfter`). An edit inside a long
 * fence reads that fence, and one that leaves a fence or a fold open reads on
 * to the end, since READ runs it to the end too — about 2.5ms on a note of
 * tens of thousands of lines.
 */
const runs = StateField.define<BlockRun[]>({
  create: (s) => blockRuns(reader(s.doc), s.doc.lines),
  update: (was, tr) => {
    if (!tr.docChanged) return was
    // One span, from the first change to the last: whatever lies between two
    // edits is read again too, which is cheap and never wrong.
    let fromA = -1
    let toB = 0
    tr.changes.iterChangedRanges((fa, _ta, _fb, tb) => {
      if (fromA < 0) fromA = fa
      toB = tb
    })
    const doc = tr.state.doc
    const before = tr.startState.doc
    return blockRunsAfter(
      was,
      reader(doc),
      doc.lines,
      before.lineAt(fromA).number - 1,
      doc.lineAt(toB).number - 1,
      doc.lines - before.lines
    )
  }
})

/**
 * Line `i` of a document, 0-based — cheap when asked in order, which is how a
 * scan asks. `doc.line` finds each line from the top of the document's tree,
 * and a fence left open at the top of a long note is ninety thousand of those.
 */
function reader(doc: Text): (i: number) => string {
  let it = doc.iterLines(1)
  let at = -1
  let text = ''
  return (i) => {
    if (i === at) return text
    if (i !== at + 1) it = doc.iterLines(i + 1)
    at = i
    text = it.next().value
    return text
  }
}

/** The runs on lines `a` to `b` (0-based), as line classes keyed by line number. */
function paint(rs: readonly BlockRun[], a: number, b: number, out: Map<number, string>): void {
  // The first run that reaches line `a`. They are in order and never overlap.
  let lo = 0
  let hi = rs.length
  while (lo < hi) {
    const m = (lo + hi) >> 1
    if (rs[m].to < a) lo = m + 1
    else hi = m
  }
  for (let i = lo; i < rs.length && rs[i].from <= b; i += 1) {
    const r = rs[i]
    if (r.k === 'fold') {
      for (const t of r.tags) if (t >= a && t <= b) out.set(t + 1, 'cm-md-html')
      paint(r.inner, a, b, out)
      continue
    }
    for (let l = Math.max(r.from, a); l <= Math.min(r.to, b); l += 1) {
      if (r.k === 'table') {
        out.set(l + 1, 'cm-md-table')
        continue
      }
      // The opening fence, and the closing one if there is one: an unclosed
      // fence's last line is code, not a fence.
      const fence = l === r.from || (r.closed && l === r.to)
      out.set(
        l + 1,
        ['cm-md-code', l === r.from ? 'cm-md-code-first' : '', l === r.to ? 'cm-md-code-last' : '', fence ? 'cm-md-fence' : '']
          .filter(Boolean)
          .join(' ')
      )
    }
  }
}

/** The runs of lines READ draws as blocks, on the lines in view: code, tables, a fold's tags. */
function regions(view: EditorView): Map<number, string> {
  const out = new Map<number, string>()
  const doc = view.state.doc
  const rs = view.state.field(runs)
  for (const { from, to } of view.visibleRanges) paint(rs, doc.lineAt(from).number - 1, doc.lineAt(to).number - 1, out)
  return out
}

/** One inline token's decorations, and its children's. */
const hideMark = Decoration.mark({ class: 'cm-md-hide' })

/**
 * One inline token's decorations, and its children's.
 *
 * A mark that is put away is text drawn as nothing (`display: none`) — NOT a
 * replaced range. A replaced range is an empty widget, and the browser treats a
 * widget as somewhere a line may break: `**groundwater**,` wrapped with the
 * comma alone at the start of the next line. Text with no box breaks nothing,
 * so the line breaks where READ's does. Not zero-SIZE text, either: that still
 * has boxes, at no width, and the editor's click mapping would land a click
 * past the end of a line inside the first of them. The same ranges are atomic
 * (see `live`), so the caret steps over them rather than into them.
 */
function inline(
  t: Tok,
  reveal: readonly { from: number; to: number }[],
  out: Range<Decoration>[],
  slice: (a: number, b: number) => string,
  hidden: Range<Decoration>[],
  /** The tokens either side of it, which is how an anchor and its comment know each other. */
  prev?: Tok,
  next?: Tok
): void {
  const on = touches(reveal, t.from, t.to)
  const mark = (a: number, b: number): void => {
    if (b <= a) return
    if (on) out.push(Decoration.mark({ class: 'cm-md-mark' }).range(a, b))
    else {
      out.push(hideMark.range(a, b))
      hidden.push(hideMark.range(a, b))
    }
  }
  switch (t.k) {
    case 'bold':
      mark(t.from, t.from + 2)
      mark(t.to - 2, t.to)
      if (t.to - 2 > t.from + 2) out.push(Decoration.mark({ class: 'cm-md-strong' }).range(t.from + 2, t.to - 2))
      inlineAll(t.inner, reveal, out, slice, hidden)
      return
    case 'italic':
      mark(t.from, t.from + 1)
      mark(t.to - 1, t.to)
      if (t.to - 1 > t.from + 1) out.push(Decoration.mark({ class: 'cm-md-em' }).range(t.from + 1, t.to - 1))
      inlineAll(t.inner, reveal, out, slice, hidden)
      return
    case 'highlight':
      // Its marks as bold's are; its words on the marker colour, which is
      // colour only, so nothing moves.
      mark(t.from, t.from + 2)
      mark(t.to - 2, t.to)
      if (t.to - 2 > t.from + 2) out.push(Decoration.mark({ class: 'cm-md-highlight' }).range(t.from + 2, t.to - 2))
      inlineAll(t.inner, reveal, out, slice, hidden)
      return
    case 'anchor': {
      // Its marks as bold's are, its words washed — and, when a comment follows
      // it, said to be that comment's, so the margin can light them.
      mark(t.from, t.from + 3)
      mark(t.to - 3, t.to)
      const its = next?.k === 'comment' && next.from === t.to ? `w${next.from}` : null
      if (t.to - 3 > t.from + 3)
        out.push(
          Decoration.mark({ class: 'cm-md-anchor', attributes: its ? { 'data-cmt-anchor': its } : undefined }).range(t.from + 3, t.to - 3)
        )
      inlineAll(t.inner, reveal, out, slice, hidden)
      return
    }
    case 'comment': {
      // Put away whole, as READ puts it away — or, with the caret in it, back
      // as the text it is, faint, as a link's address comes back.
      if (on) out.push(Decoration.mark({ class: 'cm-md-mark cm-md-comment' }).range(t.from, t.to))
      else {
        out.push(hideMark.range(t.from, t.to))
        hidden.push(hideMark.range(t.from, t.to))
      }
      const bare = !(prev?.k === 'anchor' && prev.to === t.from)
      out.push(Decoration.widget({ widget: new CommentAt(`w${t.from}`, slice(t.from + 3, t.to - 3), bare, on), side: -1 }).range(t.from))
      return
    }
    case 'code':
      mark(t.from, t.from + 1)
      mark(t.to - 1, t.to)
      out.push(
        Decoration.mark({
          class: t.path ? 'cm-md-codespan cm-md-wiki' : 'cm-md-codespan',
          attributes: t.path ? { 'data-wiki': t.path, spellcheck: 'false' } : { spellcheck: 'false' }
        }).range(t.from + 1, t.to - 1)
      )
      return
    case 'link':
      mark(t.from, t.from + 1)
      mark(t.textTo, t.to)
      if (t.textTo > t.from + 1)
        out.push(
          Decoration.mark({ class: 'cm-md-link', attributes: { 'data-href': t.href, spellcheck: 'false' } }).range(t.from + 1, t.textTo)
        )
      inlineAll(t.inner, reveal, out, slice, hidden)
      return
    case 'wiki':
      mark(t.from, t.label[0])
      mark(t.label[1], t.to)
      if (t.label[1] > t.label[0])
        out.push(
          Decoration.mark({
            class: 'cm-md-wiki',
            attributes: { 'data-wiki': t.target, spellcheck: 'false', title: `${t.target} · ⌘-click to open it in a tab of its own` }
          }).range(t.label[0], t.label[1])
        )
      return
    case 'path':
      out.push(Decoration.mark({ class: 'cm-md-wiki', attributes: { 'data-wiki': slice(t.from, t.to), spellcheck: 'false' } }).range(t.from, t.to))
      return
  }
}

/** A list of sibling tokens, each drawn knowing its neighbours. */
function inlineAll(
  toks: readonly Tok[],
  reveal: readonly { from: number; to: number }[],
  out: Range<Decoration>[],
  slice: (a: number, b: number) => string,
  hidden: Range<Decoration>[]
): void {
  toks.forEach((t, i) => inline(t, reveal, out, slice, hidden, toks[i - 1], toks[i + 1]))
}

/** Parsed inline tokens by line text: the same line is drawn again on every caret move. */
const tokCache = new Map<string, Tok[]>()
const shiftToks = (toks: Tok[], d: number): Tok[] =>
  toks.map((t) => {
    const u = { ...t, from: t.from + d, to: t.to + d } as Tok
    if (u.k === 'wiki' && t.k === 'wiki') u.label = [t.label[0] + d, t.label[1] + d]
    if (u.k === 'link' && t.k === 'link') {
      u.textTo = t.textTo + d
      u.inner = shiftToks(t.inner, d)
    }
    if (
      (u.k === 'bold' || u.k === 'italic' || u.k === 'anchor' || u.k === 'highlight') &&
      (t.k === 'bold' || t.k === 'italic' || t.k === 'anchor' || t.k === 'highlight')
    )
      u.inner = shiftToks(t.inner, d)
    return u
  })
function tokensOf(text: string, base: number): Tok[] {
  let toks = tokCache.get(text)
  if (!toks) {
    toks = inlineTokens(text, 0)
    if (tokCache.size > 5000) tokCache.clear()
    tokCache.set(text, toks)
  }
  return base ? shiftToks(toks, base) : toks
}

function draw(view: EditorView): { deco: DecorationSet; hidden: DecorationSet } {
  const { state } = view
  const doc = state.doc
  const zone = state.field(titleZone)
  const opts = state.field(options)
  // Syntax comes back only where you are WRITING. With the caret elsewhere —
  // reading, or typing in the thread beside it — the last caret position is not
  // somewhere you are standing, and the marks around it stay put away.
  //
  // "Elsewhere" is another element taking focus, NOT the window losing it:
  // ⌘⇥ to another app and back must not fold the syntax away and unfold it
  // again, reflowing the line you were in twice for a trip that touched none
  // of it.
  const sel = writing(view) ? state.selection.ranges : []
  const reveal = [...sel, ...findReveal(state)]
  const owned = regions(view)
  const out: Range<Decoration>[] = []

  // The paragraph focus mode leaves lit: the run of non-blank lines the caret is in.
  let litA = -1
  let litB = -1
  if (opts.focus) {
    const at = doc.lineAt(state.selection.main.head).number
    litA = at
    litB = at
    if (doc.line(at).text.trim()) {
      while (litA > zone.lines + 1 && doc.line(litA - 1).text.trim()) litA -= 1
      while (litB < doc.lines && doc.line(litB + 1).text.trim()) litB += 1
    }
  }

  const firstBody = zone.lines + 1
  // A line the switch below draws as a heading: the blank lines beside it are its air.
  const heading = (n: number): boolean =>
    n >= firstBody && n <= doc.lines && !owned.has(n) && classify(doc.line(n).text).k === 'heading'
  // Bounded: this runs on every keystroke, and slicing the whole body to learn
  // whether it is empty is a copy of the note each time.
  const bodyEmpty = doc.length - zone.body <= 400 && !doc.sliceString(zone.body).trim()
  const hidden: Range<Decoration>[] = []
  let last = 0
  for (const { from, to } of view.visibleRanges) {
    for (let pos = from; pos <= to; ) {
      const line = doc.lineAt(pos)
      pos = line.to + 1
      if (line.number <= last) continue
      last = line.number
      if (line.number <= zone.lines) continue

      const classes: string[] = []
      let style = ''
      if (opts.focus && (line.number < litA || line.number > litB)) classes.push('cm-md-dim')
      if (bodyEmpty && line.number === firstBody) {
        out.push(Decoration.widget({ widget: new Hint(), side: 1 }).range(line.from))
      }

      const region = owned.get(line.number)
      if (region) {
        classes.push(region)
        // A fence line (```) is how the block is written, not what it holds:
        // away from the caret it folds to nothing, so the block reads as READ
        // draws it — the code in its card. Stand on it and it is back.
        if (region.includes('cm-md-fence') && !touches(sel, line.from, line.to)) classes.push('cm-md-fence-off')
        const code = region.includes('cm-md-code') || region.includes('cm-md-table') || region.includes('cm-md-html')
        out.push(
          Decoration.line({ class: classes.join(' '), attributes: code ? { spellcheck: 'false' } : undefined }).range(line.from)
        )
        continue
      }

      const text = line.text
      const c = classify(text)
      const here = touches(sel, line.from, line.to)
      let body = line.from
      switch (c.k) {
        case 'blank':
          // A whole line between two blocks, as a text file has it. Beside a
          // heading it is the heading's air rather than a pause, and the
          // heading gives up that much of its own — so it keeps to that, short
          // until the caret is on it, when it opens to a line so starting one
          // does not start it small and grow it under the first letter typed.
          classes.push(here ? 'cm-md-blank cm-md-here' : 'cm-md-blank')
          if (heading(line.number - 1) || heading(line.number + 1)) classes.push('cm-md-by-h')
          break
        case 'heading':
          classes.push('cm-md-h', `cm-md-h${c.level}`)
          if (line.number === firstBody) classes.push('cm-md-top')
          // A blank line beside a heading is already air; the heading gives up
          // that much of its own, so the distance to the words matches READ's
          // and ⌘E moves nothing.
          if (line.number > firstBody && !doc.line(line.number - 1).text.trim()) classes.push('cm-md-gap-above')
          if (line.number < doc.lines && !doc.line(line.number + 1).text.trim()) classes.push('cm-md-gap-below')
          if (here) classes.push('cm-md-here')
          // The hashes hang in the margin — shown on the line you are in,
          // hidden on every other, and never taking room from the words.
          out.push(Decoration.mark({ class: here ? 'cm-md-hmark' : 'cm-md-hmark cm-md-off' }).range(line.from, line.from + c.markTo))
          body = line.from + c.markTo
          break
        case 'rule':
          classes.push(here ? 'cm-md-hr cm-md-here' : 'cm-md-hr')
          body = line.to
          break
        case 'task': {
          const depth = Math.floor(c.indent / 2)
          classes.push('cm-md-li', 'cm-md-taskline')
          if (c.done) classes.push('cm-md-done')
          style = `padding-left: calc(var(--ed-li) * ${depth} + var(--ed-task)); text-indent: calc(0px - var(--ed-li) * ${depth} - var(--ed-task))`
          out.push(Decoration.replace({ widget: new Box(depth, c.done) }).range(line.from, line.from + c.markTo))
          body = line.from + c.markTo
          break
        }
        case 'bullet': {
          const depth = Math.floor(c.indent / 2)
          classes.push('cm-md-li')
          style = `padding-left: calc(var(--ed-li) * ${depth + 1}); text-indent: calc(0px - var(--ed-li) * ${depth + 1})`
          out.push(Decoration.replace({ widget: new Bullet(depth) }).range(line.from, line.from + c.markTo))
          body = line.from + c.markTo
          break
        }
        case 'ordered': {
          const depth = Math.floor(c.indent / 2)
          const lead = text.length - text.trimStart().length
          classes.push('cm-md-li', 'cm-md-ol')
          style = `padding-left: calc(var(--ed-li) * ${depth + 1}); text-indent: calc(0px - var(--ed-li) * ${depth + 1})`
          if (lead) out.push(Decoration.replace({ widget: new Indent(depth) }).range(line.from, line.from + lead))
          // The ordinal is text you can edit — it is the only rendering an
          // ordinal has — so it stays, in the column a bullet's dash would take.
          out.push(Decoration.mark({ class: 'cm-md-olmark' }).range(line.from + lead, line.from + c.markTo))
          body = line.from + c.markTo
          break
        }
        case 'quote':
          classes.push('cm-md-quote')
          out.push(Decoration.replace({}).range(line.from, line.from + c.markTo))
          body = line.from + c.markTo
          break
        case 'para':
          break
      }

      if (classes.length || style) {
        out.push(
          Decoration.line({ class: classes.join(' '), attributes: style ? { style } : undefined }).range(line.from)
        )
      }
      if (body < line.to) {
        const slice = (a: number, b: number): string => doc.sliceString(a, b)
        inlineAll(tokensOf(doc.sliceString(body, line.to), body), reveal, out, slice, hidden)
      }
    }
  }
  return { deco: Decoration.set(out, true), hidden: Decoration.set(hidden, true) }
}

const live = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet
    /** The marks put away — atomic, so the caret steps over them. */
    hidden: DecorationSet
    constructor(view: EditorView) {
      const d = draw(view)
      this.decorations = d.deco
      this.hidden = d.hidden
    }
    update(u: ViewUpdate): void {
      if (
        u.docChanged ||
        u.viewportChanged ||
        u.selectionSet ||
        u.focusChanged ||
        u.transactions.some((tr) => tr.effects.some((e) => e.is(setFind) || e.is(setOptions)))
      ) {
        const d = draw(u.view)
        this.decorations = d.deco
        this.hidden = d.hidden
      }
    }
  },
  {
    decorations: (v) => v.decorations,
    provide: (plugin) => EditorView.atomicRanges.of((view) => view.plugin(plugin)?.hidden ?? Decoration.none)
  }
)

/* ---------- keys ---------- */

export interface Hooks {
  /** ↑, ← or ⌫ at the very top of the body: the caret belongs in the title. */
  exitTop: () => void
  /** A `[[wikilink]]` or a vault path, ⌘-clicked — always into a tab of its own. */
  follow: (target: string, newTab: boolean) => void
  /**
   * A markdown link, ⌘-clicked: the web's to the browser, a path to the note
   * or the file it names — which the pane, not the editor, knows how to reach.
   */
  href: (href: string) => void
  /** Notes whose title or path match — what `[[` offers. The palette's own search. */
  notes: (query: string) => Promise<{ path: string; title: string; folder: string }[]>
  /** Where a link would land — to write the shortest link that lands there. */
  resolve: (target: string) => Promise<string | null>
  /** esc: leave WRITE — asking first, when that would throw away what was written. */
  escape: () => void
}

/** Every token of a line, the ones inside another included — a link's words can hold a bold one. */
function allToks(ts: readonly Tok[], out: Tok[] = []): Tok[] {
  for (const t of ts) {
    out.push(t)
    if (t.k === 'bold' || t.k === 'italic' || t.k === 'link' || t.k === 'anchor' || t.k === 'highlight') allToks(t.inner, out)
  }
  return out
}

type Emph = Extract<Tok, { k: 'bold' | 'italic' }>
const markOf = (t: Emph): string => (t.k === 'bold' ? '**' : '*')

/** Where a line's words start: past a heading's hashes or an item's marker, and nowhere on a rule. */
function wordsOf(line: Line): number {
  const c = classify(line.text)
  return line.from + (c.k === 'rule' ? line.length : 'markTo' in c ? c.markTo : 0)
}

/** A line's inline tokens, nested ones too, and the bold and italic ones among them. */
function lineRuns(line: Line): { all: Tok[]; em: Emph[] } {
  const words = wordsOf(line) - line.from
  const all = allToks(words < line.length ? tokensOf(line.text.slice(words), line.from + words) : [])
  return { all, em: all.filter((t): t is Emph => t.k === 'bold' || t.k === 'italic') }
}

/**
 * `[from, to)` on one line as a mark would take it: the space at either end
 * left out, an end standing in a shown mark moved to that mark's outer edge,
 * and an end inside a code span, a wikilink, a path or a link's target moved
 * out to its edge — READ reads no mark in those. Not out of a link's words:
 * those are where READ reads marks, and a part of them can be bold. `null`
 * when nothing but space is left.
 */
function markable(state: EditorState, line: Line, from: number, to: number): [number, number] | null {
  const { doc } = state
  const { all, em } = lineRuns(line)
  // A comment's words are plain: no mark goes in them.
  if (all.some((t) => t.k === 'comment' && from >= t.from + 3 && to <= t.to - 3)) return null
  const space = (at: number): boolean => /\s/.test(doc.sliceString(at, at + 1))
  let a = from
  let b = to
  const trim = (): void => {
    while (a < b && space(a)) a += 1
    while (b > a && space(b - 1)) b -= 1
  }
  trim()
  for (const t of em) {
    const m = markOf(t).length
    if (a > t.from && a < t.from + m) a = t.from
    if (a > t.to - m && a < t.to) a = t.to
    if (b > t.from && b < t.from + m) b = t.from
    if (b > t.to - m && b < t.to) b = t.to
  }
  trim()
  for (let moved = true; moved; ) {
    moved = false
    for (const t of all) {
      if (t.k === 'bold' || t.k === 'italic') continue
      if (t.k === 'link' && a >= t.from + 1 && b <= t.textTo) continue
      if (t.k === 'anchor' && a >= t.from + 3 && b <= t.to - 3) continue
      if (t.k === 'highlight' && a >= t.from + 2 && b <= t.to - 2) continue
      if (t.from < a && a < t.to) {
        a = t.from
        moved = true
      }
      if (t.from < b && b < t.to) {
        b = t.to
        moved = true
      }
    }
    // An anchor and its comment are one: a run reaching either takes both.
    for (const [x, c] of pairsIn(lineToks(line))) {
      if (b === x.to || (a < c.to && b > c.from && b < c.to)) {
        if (b !== c.to) moved = true
        b = c.to
      }
      if (a === c.from) {
        a = x.from
        moved = true
      }
    }
  }
  trim()
  return a < b ? [a, b] : null
}

/** The phrase `[a, b)` is exactly — its words, or its words and its marks. */
function phraseAt(em: readonly Emph[], a: number, b: number): Emph | undefined {
  return em.find((t) => {
    const m = markOf(t).length
    return a >= t.from && a <= t.from + m && b >= t.to - m && b <= t.to
  })
}

/** `[from, to)` on `line` has `kind` already: it is such a phrase, or lies within one's words. */
function hasMark(state: EditorState, line: Line, from: number, to: number, kind: Emph['k']): boolean {
  const ab = markable(state, line, from, to)
  if (!ab) return false
  const [a, b] = ab
  const { em } = lineRuns(line)
  if (phraseAt(em, a, b)?.k === kind) return true
  return em.some((t) => t.k === kind && a >= t.from + markOf(t).length && b <= t.to - markOf(t).length)
}

/** The whole phrase: its mark taken off, or traded for `mark`. */
function wholePhrase(t: Emph, mark: '**' | '*'): { changes: ChangeSpec[]; content: [number, number] } {
  const m = markOf(t).length
  const put = markOf(t) === mark ? '' : mark
  return {
    changes: [
      { from: t.from, to: t.from + m, insert: put },
      { from: t.to - m, to: t.to, insert: put }
    ],
    content: [t.from + m, t.to - m]
  }
}

/**
 * `[from, to)` on one line, given `mark` or made plain of it: exactly a phrase,
 * that phrase taken off or traded; inside a phrase, split out of it; anything
 * else, one run of the mark, with the marks inside it taken out. `content` is
 * what the mark now wraps, or wrapped, in the positions before the change.
 */
function markPart(
  state: EditorState,
  line: Line,
  from: number,
  to: number,
  mark: '**' | '*'
): { changes: ChangeSpec[]; content: [number, number] } | null {
  const { doc } = state
  const want = mark === '**' ? 'bold' : 'italic'
  const space = (at: number): boolean => /\s/.test(doc.sliceString(at, at + 1))
  const ab = markable(state, line, from, to)
  if (!ab) return null
  let [a, b] = ab
  const { all, em } = lineRuns(line)
  const is = phraseAt(em, a, b)
  if (is) return wholePhrase(is, mark)
  const inside = em.find((t) => a >= t.from + markOf(t).length && b <= t.to - markOf(t).length)
  if (inside) {
    // Split out of the phrase: its mark closed before the part and opened
    // again after it — against the words either side, not the space.
    const tm = markOf(inside)
    const m = tm.length
    let l = a
    while (l > inside.from + m && space(l - 1)) l -= 1
    let o = b
    while (o < inside.to - m && space(o)) o += 1
    const changes: ChangeSpec[] = [
      l > inside.from + m ? { from: l, insert: tm } : { from: inside.from, to: inside.from + m }
    ]
    if (inside.k !== want) changes.push({ from: a, insert: mark }, { from: b, insert: mark })
    changes.push(o < inside.to - m ? { from: o, insert: tm } : { from: inside.to - m, to: inside.to })
    return { changes, content: [a, b] }
  }
  // One run, then: over the whole of any phrase it reaches into — an anchor
  // and its comment together.
  for (let moved = true; moved; ) {
    moved = false
    for (const t of all) {
      if (t.k === 'link' && a >= t.from + 1 && b <= t.textTo) continue
      if (t.k === 'anchor' && a >= t.from + 3 && b <= t.to - 3) continue
      if (t.k === 'highlight' && a >= t.from + 2 && b <= t.to - 2) continue
      if (t.from < a && a < t.to) {
        a = t.from
        moved = true
      }
      if (t.from < b && b < t.to) {
        b = t.to
        moved = true
      }
    }
    for (const [x, c] of pairsIn(lineToks(line))) {
      if (b === x.to) {
        b = c.to
        moved = true
      }
      if (a === c.from) {
        a = x.from
        moved = true
      }
    }
  }
  while (a < b && space(a)) a += 1
  while (b > a && space(b - 1)) b -= 1
  const again = phraseAt(em, a, b)
  if (again) return wholePhrase(again, mark)
  const changes: ChangeSpec[] = [{ from: a, insert: mark }]
  for (const t of em) {
    if (t.from < a || t.to > b) continue
    const m = markOf(t).length
    changes.push({ from: t.from, to: t.from + m }, { from: t.to - m, to: t.to })
  }
  changes.push({ from: b, insert: mark })
  return { changes, content: [a, b] }
}

/**
 * ⌘B AND ⌘I — the selection, or what the caret is in, made bold or italic, or
 * made plain again. Read off READ's own runs, not off the stars that happen to
 * stand next to the caret, because what counts is what READ will show.
 *
 * READ HAS NO BOLD ITALIC, and no mark inside the other: a bold run is `**`,
 * anything but a star, `**`. So the two marks are one choice, never a stack.
 *
 * A SELECTION is marked a line at a time, and only in its words: a run never
 * passes a line break, and an item's marker or a heading's hashes are not
 * words. A triple-click takes a line and its break, and one pair around both
 * made `**- milk\n**- eggs` of a list. If every line's part already has the
 * mark it is taken off; otherwise the parts without it get it. On one line:
 * exactly a phrase — its words, or its words and marks, as ⇧⌥← takes it — and
 * the phrase is taken off or traded; inside a phrase, the part is split out of
 * it, `**one** two **three**`; anything else, one run, the marks inside it
 * taken out, never ending inside a code span, a wikilink or a link's target.
 *
 * WITH THE CARET, as a word processor has it:
 *  - in a pair put down and not typed into yet: the same key takes it up
 *    again, the other trades it — not `****¦****`;
 *  - at the end of a phrase's words: the key ends the phrase, and the caret
 *    steps out past its closing mark, so what is typed next is plain — ⌘B,
 *    type, ⌘B, type; just past that mark, the key steps back in, and the
 *    phrase goes on;
 *  - anywhere else in a phrase: the phrase, taken off or traded;
 *  - inside a word: the word, and the caret stays where it was — selected,
 *    the word went at the next key;
 *  - at a word's edge or between words: a pair to type into — but not in a
 *    wikilink, a code span or a link's target, where READ would show the
 *    stars as stars.
 *
 * A `***word***` the vault holds is a bold word between two stars, so ⌘B
 * leaves `*word*` and ⌘I `**word**`. In code the marks go where they are
 * asked to; nothing there is READ's run.
 */
function wrap(mark: '**' | '*') {
  return (view: EditorView): boolean => {
    const { state } = view
    const tr = state.changeByRange((r) => (r.empty ? markAtCaret(state, r.head, mark) : markRange(state, r, mark)))
    view.dispatch(state.update(tr, { userEvent: 'input.format', scrollIntoView: true }))
    return true
  }
}

function markRange(state: EditorState, r: SelectionRange, mark: '**' | '*') {
  const { doc } = state
  const kind = mark === '**' ? 'bold' : 'italic'
  const first = doc.lineAt(r.from)
  const last = doc.lineAt(r.to)
  if (first.number === last.number && literal(state, first)) {
    const c = state.changes([
      { from: r.from, insert: mark },
      { from: r.to, insert: mark }
    ])
    return { changes: c, range: EditorSelection.range(c.mapPos(r.from, 1), c.mapPos(r.to, -1)) }
  }
  const parts: { line: Line; a: number; b: number }[] = []
  for (let n = first.number; n <= last.number; n++) {
    const line = doc.line(n)
    if (literal(state, line)) continue
    const a = Math.max(r.from, wordsOf(line))
    const b = Math.min(r.to, line.to)
    if (b > a && /\S/.test(doc.sliceString(a, b))) parts.push({ line, a, b })
  }
  const marked = parts.map((p) => hasMark(state, p.line, p.a, p.b, kind))
  const off = marked.every(Boolean)
  const specs: ChangeSpec[] = []
  let content: [number, number] | null = null
  parts.forEach((p, i) => {
    if (!off && marked[i]) return
    const m = markPart(state, p.line, p.a, p.b, mark)
    if (!m) return
    specs.push(...m.changes)
    if (parts.length === 1) content = m.content
  })
  if (!specs.length) return { range: r }
  const c = state.changes(specs)
  const [x, y] = content ?? [r.from, r.to]
  return { changes: c, range: EditorSelection.range(c.mapPos(x, 1), c.mapPos(y, -1)) }
}

function markAtCaret(state: EditorState, head: number, mark: '**' | '*') {
  const { doc } = state
  const kind = mark === '**' ? 'bold' : 'italic'
  const line = doc.lineAt(head)
  const stay = { range: EditorSelection.cursor(head) }
  const pair = () => ({
    changes: state.changes({ from: head, insert: mark + mark }),
    range: EditorSelection.cursor(head + mark.length)
  })
  if (literal(state, line)) {
    const w = state.wordAt(head)
    if (!w || w.from === head || w.to === head) return pair()
    const c = state.changes([
      { from: w.from, insert: mark },
      { from: w.to, insert: mark }
    ])
    return { changes: c, range: EditorSelection.cursor(c.mapPos(head, 1)) }
  }
  const { all, em } = lineRuns(line)
  // A comment's words are plain, and the key leaves them as they are.
  if (all.some((t) => t.k === 'comment' && t.from < head && head < t.to)) return stay
  // A pair put down and not typed into: taken up again, or traded.
  const bare = (n: number): boolean =>
    doc.sliceString(head - n, head + n) === '*'.repeat(2 * n) &&
    doc.sliceString(head - n - 1, head - n) !== '*' &&
    doc.sliceString(head + n, head + n + 1) !== '*' &&
    !all.some((t) => t.from < head + n && t.to > head - n)
  const n = bare(2) ? 2 : bare(1) ? 1 : 0
  if (n) {
    const put = (n === 2 ? 'bold' : 'italic') === kind ? '' : mark + mark
    return {
      changes: state.changes({ from: head - n, to: head + n, insert: put }),
      range: EditorSelection.cursor(head - n + put.length / 2)
    }
  }
  // At the end of the phrase's words: the phrase ends, and the caret steps out.
  // Just past its end: the phrase goes on, and the caret steps back in.
  const ending = em.find((t) => t.k === kind && head === t.to - markOf(t).length)
  if (ending) return { range: EditorSelection.cursor(ending.to) }
  const ended = em.find((t) => t.k === kind && head === t.to)
  if (ended) return { range: EditorSelection.cursor(ended.to - markOf(ended).length) }
  const inside = em.find((t) => t.from < head && head < t.to)
  if (inside) {
    const w = wholePhrase(inside, mark)
    const c = state.changes(w.changes)
    return { changes: c, range: EditorSelection.cursor(Math.min(c.mapPos(head, 1), c.mapPos(w.content[1], -1))) }
  }
  const w = state.wordAt(head)
  if (w && w.from < head && head < w.to) {
    const m = markPart(state, line, w.from, w.to, mark)
    if (m) {
      const c = state.changes(m.changes)
      return { changes: c, range: EditorSelection.cursor(c.mapPos(head, 1)) }
    }
  }
  const sealed = all.some(
    (t) =>
      t.from < head &&
      head < t.to &&
      !(t.k === 'link' && head <= t.textTo) &&
      !(t.k === 'anchor' && head >= t.from + 3 && head <= t.to - 3) &&
      !(t.k === 'highlight' && head >= t.from + 2 && head <= t.to - 2)
  )
  return sealed ? stay : pair()
}

/**
 * ↵ ON AN EMPTY QUOTE LINE LEAVES THE QUOTE — the way ↵ on an empty item
 * leaves a list.
 *
 * Markdown's own rule keeps you in: an empty `>` line is a blank line INSIDE
 * the quote, so it takes a third ↵ to get out, and everything typed before
 * that third press lands in the quote. READ has no quote of several paragraphs
 * to protect — it draws a run of `>` lines as one quote — so the empty marker is
 * cleared instead, and what you type next is yours again.
 */
function leaveQuote(view: EditorView): boolean {
  const r = view.state.selection.main
  if (!r.empty || view.state.selection.ranges.length > 1) return false
  const line = view.state.doc.lineAt(r.head)
  if (!/^\s*>\s*$/.test(line.text) || r.head !== line.to || literal(view.state, line)) return false
  // Cleared AND a blank left behind it. READ ends a quote at its last `>` line,
  // but to CommonMark — the file anywhere else — a line typed straight under a
  // quote is more of the quote, so the gap is what makes leaving it hold there.
  view.dispatch({
    changes: { from: line.from, to: line.to, insert: '\n' },
    selection: EditorSelection.cursor(line.from + 1),
    userEvent: 'input'
  })
  return true
}

/**
 * The ordinals from line `at` down, each counted on by one: an item has gone in
 * above them and taken the first one's number. This list's items at this depth
 * only — a line indented under an item is the item's own and is passed over,
 * and so is a line of prose straight under the list's lines, with no blank
 * between: markdown reads that as the item above carrying on, so a list with a
 * note written under one of its items is still one list, counted through. The
 * count stops at anything shallower, at anything else at this depth — prose
 * after a blank line included, which is where markdown's list ends — at an
 * ordinal in the other style (`1)` under `1.` is a list of its own), and at the
 * first item that does not follow on from the one above it: a list that skips
 * was numbered that way by hand. The same count for ↵ at the start of an item
 * (`enterItem`) and at its end (`continueItem`).
 *
 * `below`: from the line after `at` — an item has gone in straight under it,
 * with the number after its own.
 */
function countOn(doc: Text, at: number, below = false): { from: number; to: number; insert: string }[] {
  const ORDINAL = /^(\s*)(\d+)([.)])/
  const first = ORDINAL.exec(doc.line(at).text)
  if (!first) return []
  const depth = cols(first[1])
  const out: { from: number; to: number; insert: string }[] = []
  let want = Number(first[2]) + (below ? 1 : 0)
  /** The line above was not blank: prose on this one is the item's, carried on. */
  let open = below
  for (let i = below ? at + 1 : at; i <= doc.lines; i += 1) {
    const line = doc.line(i)
    if (!line.text.trim()) {
      open = false
      continue
    }
    const lazy = open
    open = true
    const lead = cols(/^\s*/.exec(line.text)![0])
    if (lead > depth) continue
    const kind = classify(line.text).k
    // Not a fence or an HTML block: those end an item's words rather than carry them on.
    if (lazy && kind === 'para' && !/^\s*(```|~~~|<)/.test(line.text)) continue
    const o = kind === 'ordered' ? ORDINAL.exec(line.text) : null
    if (!o || lead < depth || o[3] !== first[3] || Number(o[2]) !== want) break
    const from = line.from + o[1].length
    out.push({ from, to: from + o[2].length, insert: String(want + 1) })
    want += 1
  }
  return out
}

/**
 * ↵ ON AN ITEM, where carrying its marker on is not the answer — everywhere
 * else it is, and `continueItem` does that.
 *
 *  - An EMPTY item: nested, it steps out a level; at the top, it leaves the
 *    list, with a blank line under the list so what you type next is prose —
 *    typed straight under an item it would be read as part of the item.
 *  - At the START of an item's words: a new empty item goes in ABOVE, and the
 *    words stay where they are with the caret on them — what ↵ at the start of
 *    a line does anywhere else. CommonMark's command, which ↵ used to run,
 *    split the marker from the words and left a stray marker line behind. An ordinal's new item takes
 *    this one's number, and this one and those after it count on (`countOn`):
 *    the ordinal is text, drawn as typed in both surfaces, so `2.` twice is
 *    what a reader would see.
 *  - At the start of a heading's words: a blank line above, the heading kept.
 *
 * None of it in code: a `- ` or a `# ` there is text, and ↵ is a newline.
 */
function enterItem(view: EditorView): boolean {
  const r = view.state.selection.main
  if (!r.empty || view.state.selection.ranges.length > 1) return false
  const line = view.state.doc.lineAt(r.head)
  if (literal(view.state, line)) return false
  const c = classify(line.text)
  if (c.k === 'bullet' || c.k === 'task' || c.k === 'ordered') {
    if (!line.text.slice(c.markTo).trim()) {
      if (c.indent >= 2) return indentLess(view)
      view.dispatch({
        changes: { from: line.from, to: line.to, insert: '\n' },
        selection: EditorSelection.cursor(line.from + 1),
        userEvent: 'input'
      })
      return true
    }
    if (r.head === line.from + c.markTo) {
      const marker = line.text.slice(0, c.markTo).replace(/\[[xX]\]/, '[ ]')
      const changes = view.state.changes([
        { from: line.from, insert: `${marker}\n` },
        ...(c.k === 'ordered' ? countOn(view.state.doc, line.number) : [])
      ])
      view.dispatch({
        changes,
        selection: EditorSelection.cursor(changes.mapPos(r.head, 1)),
        scrollIntoView: true,
        userEvent: 'input'
      })
      return true
    }
    return false
  }
  if (c.k === 'heading' && r.head === line.from + c.markTo) {
    view.dispatch({
      changes: { from: line.from, insert: '\n' },
      selection: EditorSelection.cursor(r.head + 1),
      scrollIntoView: true,
      userEvent: 'input'
    })
    return true
  }
  return false
}

/**
 * A LINE BREAK INSIDE A PHRASE — or text that brings marks of its own.
 *
 * A bold or italic phrase, a code span, a link's words and a wikilink's title
 * are each one line to READ: `**bold ` on one line and `words**` on the next are
 * two lines of stars. ↵ in the middle of a phrase used to leave exactly that.
 * So the phrase is closed before the break and opened again after it —
 * `**bold**` / `**words**` — the space either side of a ↵ going with it, since
 * a line neither ends nor starts with one. At the start of a phrase's words the
 * break goes in front of the phrase instead, and at their end after it, so no
 * line is left holding an empty pair. Phrases inside phrases the same, the
 * inner one closed first and opened last.
 *
 * Text pasted or dropped there that has a line break, or marks of its own —
 * which no phrase can hold, READ's runs having no stars or brackets inside
 * them — goes in the same way: the phrase closed before it and opened after it,
 * the text as it came, and the space around it kept, outside the marks.
 *
 * `drop` is the ↵: the space either side of the break goes, in a phrase or not.
 * `phrased` says whether a phrase had anything to do with it.
 */
function breakAt(
  state: EditorState,
  at: number,
  text: string,
  drop: boolean
): { changes: { from: number; to: number; insert: string }; caret: number; phrased: boolean } {
  const { doc } = state
  const line = doc.lineAt(at)
  const floor = wordsOf(line)
  const ws = (x: number): boolean => /\s/.test(doc.sliceString(x, x + 1))
  const toks = literal(state, line) ? [] : toksAcross(state, at, at).filter((t) => t.k !== 'path')
  let p = at
  // A position in a shown mark belongs at that mark's outer edge.
  p = outOfMarks(state, p)
  let moved = p !== at
  /*
   * AN ANCHOR IS ONE LINE, AND A COMMENT TOO, and the two are one thing: what
   * would break inside either, or between them, goes after the pair — or in
   * front of the anchor, from the start of its words — and neither is closed
   * and opened again round it, as a phrase is. A comment split in two is two
   * comments about different halves of a sentence nobody wrote that way.
   */
  const pairs = literal(state, line) ? [] : pairsIn(lineToks(line))
  const pairEnd = (t: Tok): number => pairs.find(([a]) => a === t)?.[1].to ?? t.to
  // Words and stars can go in an anchor, which reads its words as bold reads
  // its own; a line break, or review marks of the text's own, cannot.
  const outside = text.includes('\n') || /\{==|==\}|\{>>|<<\}/.test(text)
  for (const t of toks) {
    if ((t.k !== 'anchor' && t.k !== 'comment') || !(t.from < p && p < t.to)) continue
    if (t.k === 'anchor' && !outside) continue
    p = t.k === 'anchor' && !shownIn(t, doc).some((q) => q < p) ? t.from : pairEnd(t)
    moved = true
  }
  for (const [a, c] of pairs) {
    if (p !== a.to) continue
    p = c.to
    moved = true
  }
  let close = ''
  let open = ''
  // Text staying in an anchor's words closes only the phrases inside them: one
  // round the anchor closed there would end inside the anchor, and part it.
  const holders = toks.filter((t) => t.k === 'anchor' && t.from < p && p < t.to)
  const around = toks.filter((t) => {
    if (t.k === 'anchor' || t.k === 'comment') return false
    if (holders.some((x) => t.from <= x.from && x.to <= t.to)) return false
    const [wa, wb] = tokWords(t)
    return wa <= p && p <= wb
  })
  for (const t of around.reverse()) {
    const [wa, wb] = tokWords(t)
    if (p < wa || p > wb) continue
    if (!doc.sliceString(wa, p).trim()) {
      p = t.from
      moved = true
      continue
    }
    if (!doc.sliceString(p, wb).trim()) {
      p = t.to
      moved = true
      continue
    }
    const [[oa, ob], [ca, cb]] = tokMarks(t)
    close += doc.sliceString(ca, cb)
    open = doc.sliceString(oa, ob) + open
  }
  let a = p
  let b = p
  if (close || drop) {
    while (a > floor && ws(a - 1)) a -= 1
    while (b < line.to && ws(b)) b += 1
  }
  const insert = drop ? close + text + open : close + doc.sliceString(a, p) + text + doc.sliceString(p, b) + open
  return {
    changes: { from: a, to: b, insert },
    caret: drop ? a + insert.length : a + close.length + (p - a) + text.length,
    phrased: Boolean(close) || moved
  }
}

/** `at` moved out of any shown mark it stands in, to that mark's outer edge. */
function outOfMarks(state: EditorState, at: number): number {
  const line = state.doc.lineAt(at)
  if (literal(state, line)) return at
  let p = at
  for (const t of toksAcross(state, at, at)) {
    const m = tokMarks(t)
    if (!m.length) continue
    const [[oa, ob], [ca, cb]] = m
    if (p > oa && p < ob) p = oa
    else if (p > ca && p < cb) p = cb
  }
  return p
}

/** ↵ in a phrase — see `breakAt`. Anywhere else ↵ is CodeMirror's own line break. */
function breakLine(view: EditorView): boolean {
  const { state } = view
  const r = state.selection.main
  if (!r.empty || state.selection.ranges.length > 1) return false
  const b = breakAt(state, r.head, '\n', true)
  if (!b.phrased) return false
  view.dispatch({ changes: b.changes, selection: EditorSelection.cursor(b.caret), scrollIntoView: true, userEvent: 'input' })
  return true
}

/**
 * ↵ IN AN ITEM OR A QUOTE CARRIES IT ON — by READ's grammar, which is the one
 * the page is drawn in.
 *
 * The line says what it is: `- `, `- [ ] `, `3. ` or `> ` at its head, and not
 * in code. It is split at the caret, and the next line starts with the same
 * marker — a task's box empty, an ordinal counted on, and the ordinals under
 * it counted on too (`countOn`). The space either side of the split goes: the
 * marker brings its own. A phrase the split falls in is closed and opened again
 * around it (`breakAt`). Any other line gets a line break, whatever is above
 * it.
 *
 * CommonMark's own command decided this by its own parse, and was wrong both
 * ways for a page drawn by READ's. A line of prose typed under a quote is more
 * of the quote to CommonMark, so ↵ on it put you back in the quote the page
 * showed you had left, and ↵ in the middle of it moved the rest of the line
 * into the quote. And a list READ draws — under an HTML line, in a fold, after
 * a `~~~` line, a `3.` straight under a sentence — was no list to it, so ↵ at
 * its end gave a bare line.
 */
function continueItem(view: EditorView): boolean {
  const { state } = view
  const r = state.selection.main
  if (!r.empty || state.selection.ranges.length > 1) return false
  const line = state.doc.lineAt(r.head)
  const c = classify(line.text)
  if (c.k !== 'bullet' && c.k !== 'task' && c.k !== 'ordered' && c.k !== 'quote') return false
  if (r.head < line.from + c.markTo || literal(state, line)) return false
  let marker = line.text.slice(0, c.markTo)
  if (c.k === 'task') marker = marker.replace(/\[[xX]\]/, '[ ]')
  if (c.k === 'ordered') marker = marker.replace(/\d+/, (n) => String(Number(n) + 1))
  // Split where READ can read both halves: a phrase the caret is in is closed
  // before the break and opened again after the new marker (see `breakAt`).
  const b = breakAt(state, r.head, `\n${marker}`, true)
  const changes = state.changes([b.changes, ...(c.k === 'ordered' ? countOn(state.doc, line.number, true) : [])])
  view.dispatch({
    changes,
    selection: EditorSelection.cursor(b.caret),
    scrollIntoView: true,
    userEvent: 'input'
  })
  return true
}

/**
 * ⌫ AT THE START OF AN ITEM'S WORDS TAKES THE ITEM AWAY — marker, box and
 * indent together — and leaves the words as prose.
 *
 * The marker is furniture: the caret cannot stand inside it, so this is the
 * only way to remove it by keyboard, and it has to remove all of it. Markdown's
 * own command swaps the marker for spaces, keeping the words indented as a
 * continuation of the item above — a shape READ does not have, which is how a
 * line ended up indented in WRITE and flush in READ.
 */
function leaveItem(view: EditorView): boolean {
  const r = view.state.selection.main
  if (!r.empty || view.state.selection.ranges.length > 1) return false
  const line = view.state.doc.lineAt(r.head)
  const c = classify(line.text)
  if (c.k !== 'bullet' && c.k !== 'task' && c.k !== 'quote' && c.k !== 'ordered') return false
  if (r.head !== line.from + c.markTo || literal(view.state, line)) return false
  view.dispatch({
    changes: { from: line.from, to: line.from + c.markTo },
    selection: EditorSelection.cursor(line.from),
    userEvent: 'delete.backward'
  })
  return true
}

/**
 * ⌫ IN A LINK NOTHING HAS BEEN TYPED INTO TAKES BACK THE `[` THAT OPENED IT —
 * and the `]]` that came with it. The second `[` brought its own `]]`
 * (`closeLink`), so ⌫ right after it has to take that away too, or changing
 * your mind about a link left `]]` on the page for you to find.
 */
function unpair(view: EditorView): boolean {
  const { state } = view
  const r = state.selection.main
  if (!r.empty || state.selection.ranges.length > 1) return false
  if (state.sliceDoc(r.head - 2, r.head + 2) !== '[[]]') return false
  if (literal(state, state.doc.lineAt(r.head))) return false
  view.dispatch({
    changes: { from: r.head - 1, to: r.head + 2 },
    selection: EditorSelection.cursor(r.head - 1),
    userEvent: 'delete.backward'
  })
  return true
}

/**
 * ⌦ AT THE END OF A LINE BRINGS UP THE NEXT LINE'S WORDS — not its marker.
 *
 * Joined as nothing but the line break, the bullet, box or quote rule that was
 * furniture on its own line came up as `- [ ] ` in the middle of this one:
 * characters nobody typed, drawn as text for the first time. So the words come
 * up, and the marker goes — an ordinal and a heading's hashes too, which were
 * the line's shape rather than its words. On an empty line ⌦ takes the line
 * away and the item below keeps its marker.
 */
function joinNext(view: EditorView): boolean {
  const { state } = view
  const r = state.selection.main
  if (!r.empty || state.selection.ranges.length > 1) return false
  const line = state.doc.lineAt(r.head)
  if (r.head !== line.to || line.number >= state.doc.lines || !line.text.trim()) return false
  const next = state.doc.line(line.number + 1)
  if (literal(state, line) || literal(state, next)) return false
  const c = classify(next.text)
  if (!('markTo' in c)) return false
  view.dispatch({
    changes: { from: line.to, to: next.from + c.markTo },
    selection: EditorSelection.cursor(line.to),
    scrollIntoView: true,
    userEvent: 'delete.forward'
  })
  return true
}

/* ---------- a word at a time, over what is seen ---------- */

/*
 * ⌥⌫, ⌥⌦, ⌘⌫, ⌘⌦, ⌥← AND ⌥→ COUNT WHAT IS ON SCREEN, not the markdown under it.
 *
 * CodeMirror's word keys read the document, and in this document a word can be
 * wrapped in marks that are drawn as nothing. So ⌥⌫ after `**bold** ` took the
 * space and then the hidden `**` as a word of punctuation: one press, and
 * "bold" on screen became "**bold", the opening mark left with nothing to close
 * it. After a wikilink it took `]] ` and the target came out of hiding
 * mid-sentence; after a link, `) ` and the URL. ⌥← from the same place stopped
 * between the word and its hidden marks, having visibly moved one space.
 *
 * So these keys run CodeMirror's own rule for a group — letters, or other
 * marks, or space — over the characters that are SEEN. A put-away mark is
 * stepped over: it is not a word, it does not end one, and it is not deleted.
 * It stays with whatever text it still wraps, and a token left wrapping nothing
 * is taken away whole, marks and all, so ⌥⌫ after a wikilink leaves no
 * `[[projects/x|]]` behind to find later. A token the caret touches has its
 * marks shown, and shown marks are ordinary characters again, as they are to the
 * eye. The marker at the head of an item is furniture, not text: these keys
 * stop at the words, and ⌥⌫ or ⌘⌫ at the words' start takes the item away the
 * way ⌫ does.
 */

interface Seen {
  line: Line
  /** Where the words start: an item's marker is furniture, and never taken. */
  floor: number
  /** Where they end — the line's end, or, editing a comment, the end of its words. */
  ceil: number
  /** The comment whose words the caret is in, editing them: the keys stay inside it. */
  box: { from: number; to: number } | null
  /** The marks drawn as nothing right now — the same set the caret steps over. */
  hidden: DecorationSet
  /** The line's inline tokens, as `draw` reads them. */
  toks: Tok[]
}

function seenLine(view: EditorView, pos: number): Seen {
  const line = view.state.doc.lineAt(pos)
  // A line drawn as written — code, a table's row, a fold's tag — has no
  // marker to stop at and no runs: a `- ` there is a dash and `**` two stars.
  if (literal(view.state, line))
    return { line, floor: line.from, ceil: line.to, box: null, hidden: Decoration.none, toks: [] }
  const c = classify(line.text)
  // Past a heading's hashes or an item's marker, and nowhere on a rule —
  // where `draw` starts reading a line's runs.
  const words = c.k === 'rule' ? line.length : 'markTo' in c ? c.markTo : 0
  const toks = words < line.length ? tokensOf(line.text.slice(words), line.from + words) : []
  const s: Seen = { line, floor: line.from + markerZone(line.text), ceil: line.to, box: null, hidden: view.plugin(live)?.hidden ?? Decoration.none, toks }
  /*
   * A COMMENT IS SEALED. To the word keys it is one thing, stepped over whole
   * whether it is put away or not — unless the caret is in its words, editing
   * them, when the keys keep to those words and never take its marks.
   */
  const sealed: Range<Decoration>[] = []
  for (const t of allToks(toks)) {
    if (t.k !== 'comment') continue
    if (pos >= t.from + 3 && pos <= t.to - 3) {
      s.floor = t.from + 3
      s.ceil = t.to - 3
      s.box = { from: t.from, to: t.to }
    } else sealed.push(hideMark.range(t.from, t.to))
  }
  if (sealed.length) s.hidden = s.hidden.update({ add: sealed, sort: true })
  return s
}

/** Past the one hidden mark that starts (forward) or ends (backward) at `pos` — or `pos`. */
function overMark(hidden: DecorationSet, pos: number, forward: boolean): number {
  let at = pos
  hidden.between(pos, pos, (a, b) => {
    if (forward ? a === pos && b > pos : b === pos && a < pos) {
      at = forward ? b : a
      return false
    }
    return undefined
  })
  return at
}

function pastMarks(hidden: DecorationSet, pos: number, forward: boolean): number {
  for (let at = pos; ; ) {
    const next = overMark(hidden, at, forward)
    if (next === at) return at
    at = next
  }
}

interface Step {
  /** Where the step ends. */
  pos: number
  /** The line ran out with nothing crossed but space. */
  edge: boolean
  /** Where ⌥⌫'s one space at the caret was, when it took one first. */
  took: number | null
  /** A put-away mark lay inside the step. */
  crossed: boolean
  /** The space the step stopped at, beyond its group, if it stopped at one. */
  gap: number | null
}

/**
 * One step from `head` over what is seen, never leaving the line. `del` is
 * ⌥⌫'s version of the rule — one space at the caret comes along, then one group
 * — and without it ⌥←'s, which crosses any amount of space and then one group.
 * `cat` is where a step carried over from the line before left off.
 */
function seenStep(
  view: EditorView,
  s: Seen,
  head: number,
  forward: boolean,
  del: boolean,
  cat: CharCategory | null = null
): Step {
  const { line, hidden } = s
  const end = forward ? s.ceil : s.floor
  const categorize = view.state.charCategorizer(head)
  const out: Step = { pos: head, edge: false, took: null, crossed: false, gap: null }
  let pos = head
  for (;;) {
    const at = pastMarks(hidden, pos, forward)
    if (forward ? at >= end : at <= end) {
      out.edge = cat === null || cat === CharCategory.Space
      break
    }
    const next = findClusterBreak(line.text, at - line.from, forward) + line.from
    const ch = line.text.slice(Math.min(at, next) - line.from, Math.max(at, next) - line.from)
    const c = categorize(ch)
    if (del) {
      if (cat !== null && c !== cat) {
        if (ch === ' ') out.gap = Math.min(at, next)
        break
      }
      if (ch === ' ' && pos === head) out.took = Math.min(at, next)
      else cat = c
    } else {
      if (cat !== null && cat !== CharCategory.Space && c !== cat) break
      cat = c
    }
    if (at !== pos) out.crossed = true
    pos = next
  }
  if (!del && !out.edge) {
    // Over the marks of the token just crossed, not to the inside of them: a
    // word ⇧⌥← selected is then the whole token, `**` and all, and ⌫ on it
    // leaves no half of a pair behind.
    const ends = new Set<number>()
    const walk = (ts: Tok[]): void => {
      for (const t of ts) {
        ends.add(forward ? t.to : t.from)
        if (t.k === 'bold' || t.k === 'italic' || t.k === 'link' || t.k === 'anchor' || t.k === 'highlight') walk(t.inner)
      }
    }
    walk(s.toks)
    for (;;) {
      const q = overMark(hidden, pos, forward)
      if (q === pos || !ends.has(q)) break
      pos = q
    }
  }
  out.pos = pos
  return out
}

/** ⌥⌫ and ⌥⌦ (`whole` false), ⌘⌫ and ⌘⌦ (`whole` true), over what is seen. */
function deleteSeen(view: EditorView, forward: boolean, whole: boolean): boolean {
  const { state } = view
  const r = state.selection.main
  if (!r.empty || state.selection.ranges.length > 1) return false
  const s = seenLine(view, r.head)
  const { hidden } = s
  const head = r.head
  // At the line's edge the key joins it to the next, as it always has — and
  // the title's own guard keeps that out of the hidden title. At the edge of
  // a comment's words it takes nothing: the marks are not words.
  if (forward ? head >= s.ceil : head <= s.floor) return Boolean(s.box)
  let to: number
  let took: number | null = null
  let swap: number | null = null
  if (whole) {
    // To where the line is drawn to start or end, a wrap point included — but
    // never into an item's marker. The line is drawn starting at its bullet,
    // and the marker is furniture, which only ⌫ at the words' start takes.
    const edge = view.moveToLineBoundary(r, forward).head
    to = forward ? Math.min(edge, s.ceil) : Math.max(edge, s.floor)
    if (forward ? to <= head : to >= head) return false
  } else {
    const step = seenStep(view, s, head, forward, true)
    to = step.pos
    /*
     * THE SPACE A WORD LEAVES IS THE ONE OUTSIDE THE MARKS. ⌥⌫ takes a word and
     * the one space at the caret — and when that word ends a bold phrase, a
     * link's words or a wikilink's title, there are two spaces on screen it
     * could be: the one after the phrase, and the one inside it before the
     * word. They look the same. Taking the outer one leaves `**bold **`, which
     * is bold here and in READ but nowhere else (no CommonMark reader closes
     * emphasis on a space), and leaves the caret touching the token, so its
     * marks come out and the line reflows under the key. So the inner one
     * goes, and the outer one stays with the caret. ⌥⌦ is the same, mirrored.
     */
    if (step.took !== null && step.crossed && step.gap !== null) {
      took = step.took
      swap = step.gap
    }
  }
  const lo = forward ? head : to
  const hi = forward ? to : head

  /** The seen stretches of `[a, b)`: everything in it but the put-away marks. */
  const seenIn = (a: number, b: number): [number, number][] => {
    const out: [number, number][] = []
    let at = a
    hidden.between(a, b, (x, y) => {
      if (y <= a || x >= b) return
      if (x > at) out.push([at, x])
      at = Math.max(at, y)
    })
    if (at < b) out.push([at, b])
    return out
  }
  const merged = (rs: [number, number][]): [number, number][] => {
    const out: [number, number][] = []
    for (const [a, b] of [...rs].sort((p, q) => p[0] - q[0])) {
      const last = out[out.length - 1]
      if (last && a <= last[1]) last[1] = Math.max(last[1], b)
      else out.push([a, b])
    }
    return out
  }
  const gone = merged(
    took === null || swap === null ? seenIn(lo, hi) : [...seenIn(lo, took), ...seenIn(took + 1, hi), [swap, swap + 1]]
  )
  // A token nothing seen is left of goes whole. One that was nothing but marks
  // to begin with goes only if the step walked over it.
  const cut = [...gone]
  const emptied = (ts: Tok[]): void => {
    for (const t of ts) {
      // A comment stepped over is kept: its words were never the ones taken.
      if (t.k === 'comment') continue
      const own = seenIn(t.from, t.to)
      const none = own.length
        ? own.every(([a, b]) => gone.some(([x, y]) => x <= a && y >= b))
        : t.from >= lo && t.to <= hi
      if (none) cut.push([t.from, t.to])
      else if (t.k === 'bold' || t.k === 'italic' || t.k === 'link' || t.k === 'anchor' || t.k === 'highlight') emptied(t.inner)
    }
  }
  emptied(s.toks)
  const changes = state.changes(merged(cut).map(([from, to]) => ({ from, to })))
  // Nothing taken, with a sealed comment against the caret: the key is spent
  // on it rather than handed on, since CodeMirror's own would take its marks.
  if (changes.empty) return pastMarks(hidden, head, forward) !== head
  // Backward, the caret goes where the word was — inside a token that keeps
  // some of its words, so what is typed next is in it — or, when the outer
  // space stayed, after that space.
  const at = forward ? changes.mapPos(head, -1) : changes.mapPos(swap === null ? to : head, -1)
  view.dispatch({
    changes,
    selection: EditorSelection.cursor(at, forward ? 1 : -1),
    scrollIntoView: true,
    userEvent: forward ? 'delete.forward' : 'delete.backward'
  })
  return true
}

/** A token's two marks — the ones `draw` puts away — as `[from, to)` ranges. */
function tokMarks(t: Tok): [number, number][] {
  switch (t.k) {
    case 'bold':
    case 'highlight':
      return [
        [t.from, t.from + 2],
        [t.to - 2, t.to]
      ]
    case 'italic':
    case 'code':
      return [
        [t.from, t.from + 1],
        [t.to - 1, t.to]
      ]
    case 'link':
      return [
        [t.from, t.from + 1],
        [t.textTo, t.to]
      ]
    case 'wiki':
      return [
        [t.from, t.label[0]],
        [t.label[1], t.to]
      ]
    // An anchor's marks are three characters, as are a comment's — whose
    // words are put away with them, so it is sealed as a code span is.
    case 'anchor':
    case 'comment':
      return [
        [t.from, t.from + 3],
        [t.to - 3, t.to]
      ]
    case 'path':
      return []
  }
}

/** What a token shows between its marks. */
function tokWords(t: Tok): [number, number] {
  const m = tokMarks(t)
  return m.length ? [m[0][1], m[1][0]] : [t.from, t.to]
}

/**
 * The marks of `toks` as they are with nothing revealed — but for the tokens
 * `keep` stands inside, whose marks are shown to it.
 */
function marksOf(toks: readonly Tok[], keep: number, out: Range<Decoration>[] = []): Range<Decoration>[] {
  for (const t of toks) {
    const inside = t.from < keep && keep < t.to
    // A comment is put away whole, its words with its marks — sealed — unless
    // `keep` is in its words.
    if (t.k === 'comment') {
      if (keep < t.from + 3 || keep > t.to - 3) out.push(hideMark.range(t.from, t.to))
    } else if (!inside) for (const [a, b] of tokMarks(t)) if (b > a) out.push(hideMark.range(a, b))
    if (t.k === 'bold' || t.k === 'italic' || t.k === 'link' || t.k === 'anchor' || t.k === 'highlight') marksOf(t.inner, keep, out)
  }
  return out
}

/**
 * The inline tokens at the two ends of `[from, to]`, nested ones too — none on a
 * line drawn as written. Only the ends: a token never runs past its line, so
 * every token on a line between them lies wholly inside the range, and ⌘A over
 * a long note would otherwise read every line of it to learn nothing.
 */
function toksAcross(state: EditorState, from: number, to: number): Tok[] {
  const out: Tok[] = []
  const first = state.doc.lineAt(from)
  const last = state.doc.lineAt(to)
  for (const line of first.number === last.number ? [first] : [first, last]) {
    if (literal(state, line)) continue
    const c = classify(line.text)
    const words = c.k === 'rule' ? line.length : 'markTo' in c ? c.markTo : 0
    if (words < line.length) allToks(tokensOf(line.text.slice(words), line.from + words), out)
  }
  return out
}

/**
 * A SELECTION TAKEN AWAY TAKES WHAT IS SEEN IN IT — never one mark of a pair.
 *
 * A selection that reaches into a bold phrase, a link or a code span from
 * outside it holds some of its words and one of its marks: the `**` that
 * closes it, the `[` that opens it. ⌫ took the mark with the words — `See
 * **alpha data c** x` with `c** ` selected became `See **alpha data x`, the
 * phrase left open and its stars on the page — and so did ⌦, ⌘X, and typing
 * or pasting over it. So the marks of anything the selection only partly
 * covers stay where they are and the rest goes, the way a word processor keeps
 * the bold on the words it did not take. What is typed over the selection goes
 * where its first seen character was, and so takes that character's mark. A
 * phrase all of whose words go goes whole, rather than leaving `****` behind.
 * And a mark left against a space inside its phrase is moved past it — the
 * space is still there, now just outside — since `**data **` is bold to READ
 * but to no other reader: double-clicking the first word of a bold phrase and
 * deleting it left `** data**`.
 *
 * A selection of nothing but marks is taken as it is: marks you can see,
 * chosen on purpose. And a caret's ⌫ and ⌦ are never touched — a caret beside
 * a token has its marks shown, and a mark on screen is a character like any
 * other (`deleteSeen` is the word keys' own).
 */
/**
 * `[from, to)` taken away — or typed over with `text` — keeping the marks of
 * what it only partly covers. `null` when nothing here has a say: code, a
 * stretch with no token at either end, or a selection of nothing but marks.
 * `step` is the edit, `swaps` the marks moved past the space left against them
 * (after `step`), `caret` where it ends up.
 */
function keepIn(
  state: EditorState,
  from: number,
  to: number,
  text: string
): { step: ChangeSet; swaps: { from: number; to: number; insert: string }[]; caret: number; same: boolean } | null {
  const asked = from
  from = pastComment(state, from, to)
  // Started past a comment: the edit is this one, whatever else has a say.
  const plain = (): ReturnType<typeof keepIn> =>
    from === asked
      ? null
      : { step: state.changes({ from, to, insert: text }), swaps: [], caret: from + text.length, same: false }
  // Code is edited as the characters it is, and so is a stretch reaching into it.
  for (let pos = from; pos <= to; ) {
    const line = state.doc.lineAt(pos)
    if (literal(state, line)) return plain()
    pos = line.to + 1
  }
  const toks = toksAcross(state, from, to).filter((t) => t.k !== 'path')
  if (!toks.length) return plain()

  let a = from
  let b = to
  // A comment is taken whole or not at all: a selection reaching into one
  // from outside its words takes all of it, its marks with its words.
  for (const t of toks) {
    if (t.k !== 'comment') continue
    const inWords = (x: number): boolean => x >= t.from + 3 && x <= t.to - 3
    if (inWords(a) && inWords(b)) continue
    if (a > t.from && a < t.to) a = t.from
    if (b > t.from && b < t.to) b = t.to
  }
  // What is typed goes where the first character on screen was — inside every
  // phrase that character was in. A comment's words are not on screen.
  const marks = toks.flatMap((t): [number, number][] => (t.k === 'comment' ? [[t.from, t.to]] : tokMarks(t)))
  let seen = a
  while (seen < b && marks.some(([x, y]) => x <= seen && seen < y)) seen += 1
  // A phrase all of whose words go, goes whole, its marks with them — unless
  // what is typed is going into it.
  for (let moved = true; moved; ) {
    moved = false
    for (const t of toks) {
      const [wa, wb] = tokWords(t)
      if (text.length && wa <= seen && seen < wb) continue
      if (wb > wa && wa >= a && wb <= b && (t.from < a || t.to > b)) {
        a = Math.min(a, t.from)
        b = Math.max(b, t.to)
        moved = true
      }
    }
  }
  // The marks of what it only partly covers, as far as they lie inside it.
  const keep: [number, number][] = []
  for (const t of toks) {
    if (t.to <= a || t.from >= b || (t.from >= a && t.to <= b)) continue
    for (const [ma, mb] of tokMarks(t)) {
      const x = Math.max(ma, a)
      const y = Math.min(mb, b)
      if (x < y) keep.push([x, y])
    }
  }
  keep.sort((p, q) => p[0] - q[0])
  // The stretches that go, between the marks that stay.
  const gone: [number, number][] = []
  let at = a
  for (const [x, y] of keep) {
    if (x > at) gone.push([at, x])
    at = Math.max(at, y)
  }
  if (at < b) gone.push([at, b])
  if (!gone.length) return plain()
  // The typed text, at that first character — which is where the first stretch
  // starts, unless what went first was nothing on screen: a comment, or marks.
  const host = gone.findIndex(([x, y]) => x <= seen && seen < y)
  const specs = gone.map(([x, y]) => ({ from: x, to: y, insert: '' }))
  let put = gone[0][0]
  if (host >= 0 && seen > gone[host][0] && text) {
    specs.splice(host, 1, { from: gone[host][0], to: seen, insert: '' }, { from: seen, to: gone[host][1], insert: text })
    put = seen
  } else if (host >= 0 && text) {
    specs[host].insert = text
    put = gone[host][0]
  } else specs[0].insert = text
  const step = state.changes(specs)
  let caret = step.mapPos(put, -1) + text.length

  // A mark against a space inside its phrase moves past it — asked of the
  // phrases as they were, carried through the edit: `* data*` is no italic to
  // READ, so the text the edit leaves could not say it was one.
  const doc = step.apply(state.doc)
  const lo = step.mapPos(a, -1)
  const hi = step.mapPos(b, 1)
  const ws = (x: number): boolean => /\s/.test(doc.sliceString(x, x + 1))
  const swaps: { from: number; to: number; insert: string }[] = []
  const free = (x: number, y: number): boolean => swaps.every((w) => y <= w.from || x >= w.to)
  const near = (x: number, y: number): boolean => y >= lo && x <= hi
  const spans: { oa: number; ob: number; ca: number; cb: number }[] = []
  for (const t of toks) {
    // A wikilink too: READ trims its title, so a space left inside the
    // brackets is a space gone from the page. Not a comment, whose words are
    // the characters they are, as code's are; nor an anchor, whose closing
    // marks moved past a space would part it from its comment.
    if (t.k === 'code' || t.k === 'comment' || t.k === 'anchor') continue
    if (t.from >= a && t.to <= b) continue
    const [[oa0, ob0], [ca0, cb0]] = tokMarks(t)
    const oa = step.mapPos(oa0, 1)
    const ob = step.mapPos(ob0, -1)
    const ca = step.mapPos(ca0, 1)
    const cb = step.mapPos(cb0, -1)
    if (ob - oa !== ob0 - oa0 || cb - ca !== cb0 - ca0 || ca <= ob) continue
    spans.push({ oa, ob, ca, cb })
  }
  /*
   * Phrases that open or close on the same character move as one: the space
   * goes past every mark of the run, not just the innermost — `==**x1 **==`
   * is `==**x1**== `, since `**x1** ==` would only hand the space on to the
   * highlight's mark, and `x1 ==` is no highlight to READ.
   */
  const runs = (ends: (p: (typeof spans)[number]) => [number, number]): (typeof spans)[] => {
    const out: (typeof spans)[] = []
    for (const p of [...spans].sort((x, y) => ends(x)[0] - ends(y)[0])) {
      const last = out[out.length - 1]
      if (last && ends(last[last.length - 1])[1] === ends(p)[0]) last.push(p)
      else out.push([p])
    }
    return out
  }
  for (const run of runs((p) => [p.oa, p.ob])) {
    // Outermost first: the innermost phrase's words are where the space is.
    const inner = run[run.length - 1]
    const oa = run[0].oa
    const ob = inner.ob
    let e = ob
    while (e < inner.ca && ws(e)) e += 1
    if (e > ob && e < inner.ca && near(oa, ob) && free(oa, e)) {
      // `** data**` → ` **data**`, the caret before the space it was before.
      swaps.push({ from: oa, to: e, insert: doc.sliceString(ob, e) + doc.sliceString(oa, ob) })
      if (caret > oa && caret < e) caret = oa
    }
  }
  for (const run of runs((p) => [p.ca, p.cb])) {
    // Innermost first.
    const inner = run[0]
    const ca = inner.ca
    const cb = run[run.length - 1].cb
    let s = ca
    while (s > inner.ob && ws(s - 1)) s -= 1
    if (s < ca && s > inner.ob && near(ca, cb) && free(s, cb)) {
      // `**data **` → `**data** `, the caret after the space it was after.
      swaps.push({ from: s, to: cb, insert: doc.sliceString(ca, cb) + doc.sliceString(s, ca) })
      if (caret > s && caret <= cb) caret = cb
    }
  }
  return { step, swaps, caret, same: !swaps.length && !keep.length && a === asked && b === to }
}

/** Text that cannot go inside a phrase as it is: a line break, or marks of its own — review and highlight marks too. */
const breaksPhrases = (text: string): boolean => /[\n*`[\]]|==|\{>>|<<\}/.test(text)

const keepMarks = EditorState.transactionFilter.of((tr) => {
  if (!tr.docChanged) return tr
  const ev = tr.annotation(Transaction.userEvent) ?? ''
  const state = tr.startState
  const changes: { from: number; to: number; text: string }[] = []
  tr.changes.iterChanges((from, to, _fb, _tb, text) => changes.push({ from, to, text: text.toString() }))

  // Text dragged within the note: its source taken away as a selection is, and
  // what lands, landing as a paste does — its marks balanced on the way out
  // (see `balanced`), and a phrase it lands in closed around it.
  if (ev === 'move.drop') {
    const sel = state.selection.main
    // Dropped against its own edge, the move and the landing come as one
    // change over the text itself: moved nowhere, it stays as it is.
    if (changes.length === 1 && changes[0].from === sel.from && changes[0].to === sel.to) return { selection: state.selection }
    const del = changes.find((c) => c.to > c.from && !c.text)
    const ins = changes.find((c) => c.to === c.from && c.text)
    if (changes.length !== 2 || !del || !ins || (ins.from > del.from && ins.from < del.to)) return tr
    const k = keepIn(state, del.from, del.to, '')
    const step = k?.step ?? state.changes({ from: del.from, to: del.to })
    let mid = state.update({ changes: step, filter: false }).state
    let at = step.mapPos(ins.from, -1)
    const specs: TransactionSpec[] = [{ changes: step, userEvent: ev }]
    if (k?.swaps.length) {
      const sw = mid.changes(k.swaps)
      mid = mid.update({ changes: sw, filter: false }).state
      at = sw.mapPos(at, -1)
      specs.push({ changes: sw, sequential: true })
    }
    // Only text a phrase cannot hold is placed around one; the rest lands
    // where it was dropped — out of a mark, where a pointer can come down on a
    // shown one — and reads as what it landed in.
    let land = outOfMarks(mid, at)
    // Landing against a phrase's own mark, text with space at that end goes
    // outside it: `* dat` is no italic to READ, and `**word **` none to anyone else.
    // Out past every mark it lands against: `==**` is two phrases' marks.
    for (let moved = true; moved; ) {
      moved = false
      for (const t of toksAcross(mid, land, land)) {
        if (t.k !== 'bold' && t.k !== 'italic' && t.k !== 'highlight') continue
        const m = t.k === 'highlight' ? 2 : markOf(t).length
        if (land === t.from + m && /^\s/.test(ins.text)) (land = t.from), (moved = true)
        else if (land === t.to - m && /\s$/.test(ins.text)) (land = t.to), (moved = true)
      }
    }
    const b = breaksPhrases(ins.text)
      ? breakAt(mid, at, ins.text, false)
      : { changes: { from: land, to: land, insert: ins.text }, caret: land + ins.text.length }
    specs.push({
      changes: b.changes,
      selection: EditorSelection.range(b.caret - ins.text.length, b.caret),
      scrollIntoView: tr.scrollIntoView,
      sequential: true
    })
    return specs
  }

  if (!(ev === 'input' || ev === 'input.type' || ev === 'input.paste' || ev === 'input.drop' || ev.startsWith('delete'))) return tr
  if (changes.length !== 1) return tr
  const { from, to, text } = changes[0]
  const sel = state.selection
  // Typed text is typing; a paste, a drop or a ↵ over a selection is placed.
  const split = ev !== 'input.type' && breaksPhrases(text)

  // A caret's paste or drop: only where it goes.
  if (from === to) {
    if (ev === 'input.drop' && !split) {
      const land = outOfMarks(state, from)
      if (land === from) return tr
      return { changes: { from: land, insert: text }, selection: EditorSelection.range(land, land + text.length), userEvent: ev, scrollIntoView: tr.scrollIntoView }
    }
    if (!split || (ev !== 'input.paste' && ev !== 'input.drop')) return tr
    const b = breakAt(state, from, text, false)
    if (!b.phrased) return tr
    return {
      changes: b.changes,
      // A drop selects what it dropped, as CodeMirror's does; a paste leaves the caret after it.
      selection: ev === 'input.drop' ? EditorSelection.range(b.caret - text.length, b.caret) : EditorSelection.cursor(b.caret),
      userEvent: ev,
      scrollIntoView: tr.scrollIntoView
    }
  }

  if (sel.ranges.length > 1 || sel.main.empty || from !== sel.main.from || to !== sel.main.to) return tr
  const k = keepIn(state, from, to, split ? '' : text)
  if (!k) return tr
  if (!split) {
    if (k.same) return tr
    const selection = EditorSelection.cursor(k.caret)
    if (!k.swaps.length) return { changes: k.step, selection, effects: tr.effects, scrollIntoView: tr.scrollIntoView, userEvent: ev }
    return [
      { changes: k.step, effects: tr.effects, userEvent: ev },
      { changes: k.swaps, selection, scrollIntoView: tr.scrollIntoView, sequential: true }
    ]
  }
  // A line break or marks, over a selection: the selection taken away first,
  // then the text placed where it went, as a paste at a caret is.
  let mid = state.update({ changes: k.step, filter: false }).state
  const specs: TransactionSpec[] = [{ changes: k.step, effects: tr.effects, userEvent: ev }]
  if (k.swaps.length) {
    const sw = mid.changes(k.swaps)
    mid = mid.update({ changes: sw, filter: false }).state
    specs.push({ changes: sw, sequential: true })
  }
  let b = breakAt(mid, k.caret, text, text === '\n')
  // Nowhere near a phrase: the text goes where the selection was, as it came.
  if (!b.phrased) b = { changes: { from: k.caret, to: k.caret, insert: text }, caret: k.caret + text.length, phrased: false }
  specs.push({ changes: b.changes, selection: EditorSelection.cursor(b.caret), scrollIntoView: tr.scrollIntoView, sequential: true })
  return specs
})

type Anchor = Extract<Tok, { k: 'anchor' }>
type Comment = Extract<Tok, { k: 'comment' }>

/** Where an anchor's words show a character — not its marks, not those of anything in it, not space. */
function shownIn(t: Anchor, doc: Text): number[] {
  const hid: [number, number][] = []
  const walk = (ts: readonly Tok[]): void => {
    for (const k of ts) {
      if (k.k === 'comment') hid.push([k.from, k.to])
      else hid.push(...tokMarks(k))
      if (k.k === 'bold' || k.k === 'italic' || k.k === 'link' || k.k === 'anchor' || k.k === 'highlight') walk(k.inner)
    }
  }
  walk(t.inner)
  const out: number[] = []
  const text = doc.sliceString(t.from + 3, t.to - 3)
  for (let p = t.from + 3; p < t.to - 3; p++)
    if (/\S/.test(text[p - t.from - 3]) && !hid.some(([x, y]) => x <= p && p < y)) out.push(p)
  return out
}

/** Each anchor among `ts`, nested ones too, with the comment written straight after it. */
function pairsIn(ts: readonly Tok[], out: [Anchor, Comment][] = []): [Anchor, Comment][] {
  ts.forEach((t, i) => {
    const c = ts[i + 1]
    if (t.k === 'anchor' && c?.k === 'comment' && c.from === t.to) out.push([t, c])
    if (t.k === 'bold' || t.k === 'italic' || t.k === 'link' || t.k === 'anchor' || t.k === 'highlight') pairsIn(t.inner, out)
  })
  return out
}

/**
 * AN ANCHOR WHOSE LAST WORD GOES TAKES ITS COMMENT WITH IT.
 *
 * A comment is about the words it is anchored to, and with them gone it is
 * about nothing: a comment nobody can place. So whatever takes the last of an
 * anchor's words — a selection deleted or cut, ⌫ letter by letter, ⌥⌫ — takes
 * what is left of the anchor and its comment too, in the same step, so ⌘Z
 * brings all of it back at once. Words typed over its words are its words, and
 * keep it.
 */
const keepComments = EditorState.transactionFilter.of((tr) => {
  if (!tr.docChanged) return tr
  const ev = tr.annotation(Transaction.userEvent) ?? ''
  if (!(ev.startsWith('input') || ev.startsWith('delete')) || ev === 'input.comment') return tr
  const state = tr.startState
  const gone: [number, number][] = []
  let lo = Infinity
  let hi = -1
  tr.changes.iterChanges((fa, ta) => {
    if (ta > fa) gone.push([fa, ta])
    lo = Math.min(lo, fa)
    hi = Math.max(hi, ta)
  })
  if (!gone.length) return tr
  gone.sort((p, q) => p[0] - q[0])
  const taken = (at: number): boolean => gone.some(([x, y]) => x <= at && at < y)
  const after = tr.state
  const also: { from: number; to: number; insert?: string }[] = []
  for (let n = state.doc.lineAt(lo).number; n <= state.doc.lineAt(hi).number; n++) {
    const line = state.doc.line(n)
    if (literal(state, line)) continue
    for (const [a, c] of pairsIn(lineToks(line))) {
      // Every word it showed, taken.
      const words = shownIn(a, state.doc)
      if (!words.length || !words.every(taken)) continue
      // Its comment still there, as it was...
      const cf = tr.changes.mapPos(c.from, 1)
      const ct = tr.changes.mapPos(c.to, -1)
      if (after.doc.sliceString(cf, ct) !== state.doc.sliceString(c.from, c.to)) continue
      // ...and about nothing now: no words typed into the anchor kept one before it.
      const now = after.doc.lineAt(cf)
      if (!literal(after, now) && pairsIn(lineToks(now)).some(([, d]) => d.from === cf)) continue
      also.push({ from: cf, to: ct })
      // What is left of the anchor's marks, if anything is.
      for (const [x, y, mark] of [[a.from, a.from + 3, '{=='], [a.to - 3, a.to, '==}']] as const) {
        const mf = tr.changes.mapPos(x, 1)
        const mt = tr.changes.mapPos(y, -1)
        if (mt - mf === 3 && after.doc.sliceString(mf, mt) === mark) also.push({ from: mf, to: mt })
      }
      // The phrases round the pair — innermost first — as `keepIn` leaves a
      // phrase it reaches into: with no words left, it goes whole; with a
      // space left against a mark, the mark moves past it. `==x {==y==}{>>c<<}==`
      // with `y` taken is `==x== `, not `==x ==`, which is no highlight to READ.
      const round = allToks(lineToks(line))
        .filter((t) => (t.k === 'bold' || t.k === 'italic' || t.k === 'highlight') && t.from < a.from && c.to <= t.to)
        .sort((p, q) => p.to - p.from - (q.to - q.from))
      for (const t of round) tidy(t)
    }
  }
  function tidy(t: Tok): void {
    const [[oa0, ob0], [ca0, cb0]] = tokMarks(t)
    const oa = tr.changes.mapPos(oa0, 1)
    const ob = tr.changes.mapPos(ob0, -1)
    const ca = tr.changes.mapPos(ca0, 1)
    const cb = tr.changes.mapPos(cb0, -1)
    if (ob - oa !== ob0 - oa0 || cb - ca !== cb0 - ca0 || ca < ob) return
    const going = (p: number): boolean => also.some((r) => r.from <= p && p < (r.to ?? r.from))
    if (going(oa) || going(ca)) return
    const kept: number[] = []
    for (let p = ob; p < ca; p++) if (!going(p)) kept.push(p)
    const seen = kept.filter((p) => !/\s/.test(after.doc.sliceString(p, p + 1)))
    if (!seen.length) {
      also.push({ from: oa, to: ob }, { from: ca, to: cb })
      return
    }
    // A phrase closed and opened again round text that went in where the pair
    // was leaves an empty one at an end once the pair goes: `==a==b====`.
    const mark = after.doc.sliceString(ca, cb)
    const spells = (ps: number[]): boolean =>
      ps.length === mark.length && ps.every((p, i) => i === 0 || p === ps[i - 1] + 1) && ps.map((p) => after.doc.sliceString(p, p + 1)).join('') === mark
    const tail = kept.slice(-mark.length)
    if (kept.length > mark.length && spells(tail) && tail[0] > seen[0]) {
      also.push({ from: tail[0], to: cb })
      return
    }
    const head = kept.slice(0, mark.length)
    if (kept.length > mark.length && spells(head) && head[head.length - 1] < seen[seen.length - 1]) {
      also.push({ from: oa, to: head[head.length - 1] + 1 })
      return
    }
    const first = seen[0]
    const last = seen[seen.length - 1] + 1
    if (kept[0] < first) also.push({ from: oa, to: ob }, { from: first, to: first, insert: after.doc.sliceString(oa, ob) })
    if (kept[kept.length - 1] >= last) also.push({ from: last, to: last, insert: after.doc.sliceString(ca, cb) }, { from: ca, to: cb })
  }
  also.sort((p, q) => p.from - q.from)
  return also.length ? [tr, { changes: also, sequential: true }] : tr
})

/**
 * A selection that starts where an anchor's words end starts past its comment.
 * The comment is put away there, out of sight, and it is the anchor's: taken
 * from beside the words it is about — and, in a highlight, copied inside the
 * highlight's marks — it came back on its own, about nothing.
 */
function pastComment(state: EditorState, from: number, to: number): number {
  if (from >= to) return from
  const line = state.doc.lineAt(from)
  if (literal(state, line)) return from
  for (const [a, c] of pairsIn(lineToks(line))) if (a.to === from && c.to < to) return c.to
  return from
}

/** A line's inline tokens as READ reads them, outermost only. */
function lineToks(line: Line): Tok[] {
  const words = wordsOf(line) - line.from
  return words < line.length ? tokensOf(line.text.slice(words), line.from + words) : []
}

/**
 * WHAT IS COPIED KEEPS ITS MARKS WHOLE.
 *
 * A selection that reaches partly into a phrase holds one of its marks and not
 * the other, and copied as it stood that was half a pair: ⌘X left the `**` in
 * the note, where it belongs (`keepMarks`), and on the clipboard too, and ⌘V
 * then ran the phrase on into the words after it. So when a selection takes
 * one of a phrase's marks, the part of the phrase it covers is copied inside
 * both — `**alpha data ⟦c** x⟧` copies as `**c** x`. Words selected from inside
 * a phrase, no mark taken, are copied as the words they are, for wherever they
 * go next. Text dragged leaves by the same road.
 */
function balanced(state: EditorState, from: number, to: number): string {
  const { doc } = state
  from = pastComment(state, from, to)
  const emit = (ts: readonly Tok[], a: number, b: number): string => {
    let s = ''
    let at = a
    for (const [i, t] of ts.entries()) {
      if (t.to <= a || t.from >= b) continue
      if (t.from > at) s += doc.sliceString(at, t.from)
      const marks = tokMarks(t)
      // An anchor whose words are all taken takes its comment with it, here as
      // in the cut that goes with a copy.
      const c = ts[i + 1]
      const shown = t.k === 'anchor' ? shownIn(t, doc) : []
      const carries =
        t.k === 'anchor' && c?.k === 'comment' && c.from === t.to && c.to > b && shown.length > 0 && shown.every((q) => q >= a && q < b)
      if ((t.from >= a && t.to <= b) || !marks.length) {
        s += doc.sliceString(Math.max(a, t.from), Math.min(b, t.to))
        at = Math.min(b, t.to)
        if (carries) s += doc.sliceString(c.from, c.to)
        continue
      }
      // A comment is copied whole or not at all, as it is cut.
      if (t.k === 'comment') {
        s += doc.sliceString(t.from, t.to)
        at = Math.min(b, t.to)
        continue
      }
      const [wa, wb] = tokWords(t)
      const x = Math.max(a, wa)
      const y = Math.min(b, wb)
      if (x < y) {
        const inner =
          t.k === 'bold' || t.k === 'italic' || t.k === 'link' || t.k === 'anchor' || t.k === 'highlight' ? emit(t.inner, x, y) : doc.sliceString(x, y)
        // Wrapped only where the selection took one of the phrase's marks:
        // words copied from inside a phrase are words, for wherever they go.
        const [[oa, ob], [ca, cb]] = marks
        const half = (a < ob && b > oa) || (a < cb && b > ca)
        const lead = /^\s*/.exec(inner)![0]
        const core = inner.slice(lead.length).replace(/\s+$/, '')
        const trail = inner.slice(lead.length + core.length)
        // Wrapped, too, where its comment comes along: the comment is about it.
        const wrap = (half || carries) && core
        s += wrap ? lead + doc.sliceString(oa, ob) + core + doc.sliceString(ca, cb) + trail : inner
        if (carries && wrap) s += doc.sliceString(c.from, c.to)
      }
      at = Math.min(b, t.to)
    }
    if (at < b) s += doc.sliceString(at, b)
    return s
  }
  const out: string[] = []
  for (let n = doc.lineAt(from).number; n <= doc.lineAt(to).number; n++) {
    const line = doc.line(n)
    const a = Math.max(from, line.from)
    const b = Math.min(to, line.to)
    out.push(literal(state, line) ? doc.sliceString(a, b) : emit(lineToks(line), a, b))
  }
  return out.join(state.lineBreak)
}

const copyWhole = EditorView.clipboardOutputFilter.of((text, state) => {
  const r = state.selection.main
  if (state.selection.ranges.length > 1 || r.empty || text !== state.sliceDoc(r.from, r.to)) return text
  return balanced(state, r.from, r.to)
})
/**
 * ⌥← and ⌥→, and with ⇧ the selection's end, over what is seen.
 *
 * WITH ⇧, A TOKEN THE SELECTION REACHES INTO FROM OUTSIDE IS TAKEN WHOLE. Its
 * marks are shown the moment the selection touches it — and read as shown, the
 * second ⇧⌥← over `**bold words** ` stopped against the `**` it had just
 * brought out, so ⌫ took one mark of the pair and left `See **` behind. So
 * while the selection's fixed end is outside a token, the token's marks count
 * as they are drawn with nothing selected: stepped over, and taken whole with
 * the words when the step crosses its last word. A selection that starts
 * inside a token reads that token's marks as the characters they are, since
 * it has them on screen from the start.
 */
function moveSeen(view: EditorView, forward: boolean, extend: boolean): boolean {
  const { state } = view
  const r = state.selection.main
  if (state.selection.ranges.length > 1 || (!extend && !r.empty)) return false
  const top = state.field(titleZone).lines + 1
  const seen = (pos: number): Seen => {
    const s = seenLine(view, pos)
    return extend ? { ...s, hidden: Decoration.set(marksOf(s.toks, r.anchor), true) } : s
  }
  let s = seen(r.head)
  let step = seenStep(view, s, r.head, forward, false)
  // From the edge of a comment's words, out past its marks.
  if (s.box && step.pos === r.head) {
    const out = forward ? s.box.to : s.box.from
    view.dispatch({
      selection: extend ? EditorSelection.range(r.anchor, out) : EditorSelection.cursor(out, forward ? -1 : 1),
      scrollIntoView: true,
      userEvent: 'select'
    })
    return true
  }
  // Nothing but space before the line ran out: the step goes on into the next
  // line, as a line break is space — from the far end of it, or from the start
  // of its words, the marker at the head of an item being furniture and not
  // where a step stops. From the start of an item's words ⌥← used to go nowhere
  // at all: to the line's start, and straight back out of the marker.
  while (step.edge) {
    const n = s.line.number + (forward ? 1 : -1)
    if (n < top || n > state.doc.lines) break
    s = seen(state.doc.line(n).from)
    step = seenStep(view, s, forward ? s.floor : s.line.to, forward, false, CharCategory.Space)
  }
  let to = step.pos
  // A sealed comment the line ends on is still a thing to step over.
  if (to === r.head) to = pastMarks(seen(r.head).hidden, r.head, forward)
  if (to === r.head) return false
  view.dispatch({
    selection: extend ? EditorSelection.range(r.anchor, to) : EditorSelection.cursor(to, forward ? -1 : 1),
    scrollIntoView: true,
    userEvent: 'select'
  })
  return true
}

/**
 * ⌫ AND ⌦ KNOW A COMMENT IS SEALED. Against its end ⌫ takes it whole, as ⌦
 * does against its start — the thing beside the caret is the comment, not its
 * last mark. With the caret in its words, editing them, they take its words
 * and stop at their edge: half a `{>>` is a comment nobody can read.
 */
function sealedDelete(forward: boolean) {
  return (view: EditorView): boolean => {
    const { state } = view
    const r = state.selection.main
    if (!r.empty || state.selection.ranges.length > 1) return false
    const line = state.doc.lineAt(r.head)
    if (literal(state, line)) return false
    const at = r.head
    const all = allToks(lineToks(line)).filter((t): t is Comment => t.k === 'comment' && t.from <= at && at <= t.to)
    // Two side by side meet at one place: the one the key faces.
    const t = all.find((c) => (forward ? c.from === at : c.to === at)) ?? all.find((c) => c.from < at && at < c.to)
    if (!t) return false
    if (forward ? at === t.from : at === t.to) {
      view.dispatch({
        changes: { from: t.from, to: t.to },
        selection: EditorSelection.cursor(t.from),
        scrollIntoView: true,
        userEvent: forward ? 'delete.forward' : 'delete.backward'
      })
      return true
    }
    return forward ? at >= t.to - 3 : at <= t.from + 3
  }
}

/** ⌘↵ — make this line a task, or tick it, or untick it. */
function toggleTask(view: EditorView): boolean {
  const { state } = view
  const seen = new Set<number>()
  const changes: { from: number; to?: number; insert: string }[] = []
  for (const r of state.selection.ranges) {
    for (let pos = r.from; pos <= r.to; ) {
      const line = state.doc.lineAt(pos)
      pos = line.to + 1
      if (seen.has(line.number)) continue
      seen.add(line.number)
      // A line of code is not a task, and not about to become one.
      if (literal(state, line)) continue
      const c = classify(line.text)
      if (c.k === 'task') {
        const at = line.from + c.box + 1
        changes.push({ from: at, to: at + 1, insert: c.done ? ' ' : 'x' })
      } else if (c.k === 'bullet') {
        changes.push({ from: line.from + c.markTo, insert: '[ ] ' })
      } else if (c.k === 'blank' || c.k === 'para') {
        const lead = line.text.length - line.text.trimStart().length
        changes.push({ from: line.from + lead, insert: '- [ ] ' })
      }
    }
  }
  if (!changes.length) return false
  view.dispatch({ changes, userEvent: 'input.toggle', scrollIntoView: true })
  return true
}

function keys(hooks: Hooks): Extension {
  const atTop = (view: EditorView): boolean => {
    const z = view.state.field(titleZone)
    const r = view.state.selection.main
    return r.empty && r.head === z.body
  }
  const back = (view: EditorView, extend: boolean): boolean => {
    const z = view.state.field(titleZone)
    const r = view.state.selection.main
    if (!extend && !r.empty) return false
    if (!extend && atTop(view)) {
      hooks.exitTop()
      return true
    }
    const line = view.state.doc.lineAt(r.head)
    const m = markerZone(line.text)
    if (!m || r.head !== line.from + m || literal(view.state, line)) return false
    if (line.from <= z.body) {
      if (!extend && z.lines) hooks.exitTop()
      return true
    }
    view.dispatch({
      selection: extend ? EditorSelection.range(r.anchor, line.from - 1) : EditorSelection.cursor(line.from - 1),
      scrollIntoView: true,
      userEvent: 'select'
    })
    return true
  }
  const onFirstLine = (view: EditorView): boolean => {
    const z = view.state.field(titleZone)
    const r = view.state.selection.main
    if (!r.empty) return false
    if (view.state.doc.lineAt(r.head).number !== z.lines + 1) return false
    const up = view.moveVertically(r, false)
    return up.head === r.head || up.head < z.body
  }
  const bindings: KeyBinding[] = [
    {
      key: 'ArrowUp',
      run: (v) => {
        if (!onFirstLine(v)) return false
        hooks.exitTop()
        return true
      }
    },
    {
      // ← from the start of an item's words is "go back": to the end of the
      // line above — or up into the title from the body's first line — never
      // to the invisible start of this one. With ⇧, the selection goes the
      // same way instead of sticking at the marker.
      key: 'ArrowLeft',
      run: (v) => back(v, false),
      shift: (v) => back(v, true)
    },
    {
      key: 'Backspace',
      run: (v) => {
        if (!atTop(v)) return false
        hooks.exitTop()
        return true
      }
    },
    { key: 'Backspace', run: sealedDelete(false) },
    { key: 'Delete', run: sealedDelete(true) },
    { key: 'Backspace', run: (v) => leaveItem(v) || unpair(v) },
    { key: 'Delete', run: joinNext },
    // The word keys, over what is SEEN — see `deleteSeen` and `moveSeen`. At
    // the start of an item's words, ⌥⌫ and ⌘⌫ are ⌫: the item goes, not half
    // of its marker; at the end of a line ⌥⌦ and ⌘⌦ are ⌦.
    { key: 'Mod-Backspace', mac: 'Alt-Backspace', run: (v) => leaveItem(v) || deleteSeen(v, false, false), preventDefault: true },
    { key: 'Mod-Delete', mac: 'Alt-Delete', run: (v) => deleteSeen(v, true, false) || joinNext(v), preventDefault: true },
    { mac: 'Mod-Backspace', run: (v) => leaveItem(v) || deleteSeen(v, false, true), preventDefault: true },
    { mac: 'Mod-Delete', run: (v) => deleteSeen(v, true, true) || joinNext(v), preventDefault: true },
    {
      key: 'Mod-ArrowLeft',
      mac: 'Alt-ArrowLeft',
      run: (v) => moveSeen(v, false, false),
      shift: (v) => moveSeen(v, false, true),
      preventDefault: true
    },
    {
      key: 'Mod-ArrowRight',
      mac: 'Alt-ArrowRight',
      run: (v) => moveSeen(v, true, false),
      shift: (v) => moveSeen(v, true, true),
      preventDefault: true
    },
    { key: 'Enter', run: (v) => enterItem(v) || leaveQuote(v) || continueItem(v) || breakLine(v) || insertNewline(v) },
    {
      key: 'Tab',
      run: (v) => {
        const line = v.state.doc.lineAt(v.state.selection.main.head)
        const c = classify(line.text)
        const item = (c.k === 'bullet' || c.k === 'task' || c.k === 'ordered') && !literal(v.state, line)
        if (item || !v.state.selection.main.empty) return indentMore(v)
        v.dispatch(v.state.replaceSelection('  '))
        return true
      },
      shift: (v) => {
        indentLess(v)
        return true
      }
    },
    { key: 'Mod-b', run: wrap('**'), preventDefault: true },
    { key: 'Mod-i', run: wrap('*'), preventDefault: true },
    { key: 'Mod-Enter', run: toggleTask, preventDefault: true },
    {
      // Everything you can SEE — the title is the head's, and ⌘A then typing
      // must not quietly replace a line that is not on screen.
      key: 'Mod-a',
      run: (v) => {
        const z = v.state.field(titleZone)
        v.dispatch({ selection: EditorSelection.range(z.body, v.state.doc.length), userEvent: 'select' })
        return true
      }
    },
    {
      key: 'Alt-ArrowUp',
      run: (v) => {
        const z = v.state.field(titleZone)
        if (v.state.doc.lineAt(v.state.selection.main.from).number <= z.lines + 1) return true
        return moveLineUp(v)
      }
    },
    { key: 'Alt-ArrowDown', run: moveLineDown },
    {
      // Not a blur any more: esc is the way out of WRITE, and what that means
      // for the words written is the pane's to ask (see `escape`). The `[[`
      // list answers its own esc first — it sits above this keymap.
      key: 'Escape',
      run: () => {
        hooks.escape()
        return true
      }
    }
  ]
  return [keymap.of(bindings), keymap.of(historyKeymap), keymap.of(standardKeymap)]
}

/* ---------- linking to a note ---------- */

/**
 * `[[` IS A QUESTION — which note? — and the vault answers it.
 *
 * A link to another note is the one thing in a note you cannot type from
 * memory: the path is `projects/garden/kickoff-notes`, and what you remember is
 * "the kickoff". So two letters after `[[` bring up the vault's notes by title
 * — the same search ⌘K runs — and taking one writes the link READ resolves
 * without guessing: the full path, aliased with the note's title, so the page
 * shows the title and never the slug.
 */
function linkSource(hooks: Hooks) {
  return async (ctx: CompletionContext): Promise<CompletionResult | null> => {
    const typed = ctx.matchBefore(/\[\[[^\][|#\n]*$/)
    if (!typed) return null
    // `[[` in code is two brackets — an array, a shell test — not a link.
    if (literal(ctx.state, ctx.state.doc.lineAt(ctx.pos))) return null
    const q = typed.text.slice(2)
    if (q.trim().length < 2) return null
    const refs = await hooks.notes(q)
    if (ctx.aborted) return null
    /*
     * THE SHORTEST LINK THAT LANDS. The bare name when the vault resolves it to
     * this very note, the full path only when it would land somewhere else —
     * so standing in the link later shows `[[kickoff-notes|Kickoff notes]]`
     * rather than a folder path in the middle of the sentence. The alias keeps
     * READ showing the title, not the filename.
     */
    const targets = await Promise.all(
      refs.map(async (r) => {
        const full = r.path.replace(/\.md$/, '')
        const bare = full.split('/').pop() ?? full
        return (await hooks.resolve(bare).catch(() => null)) === r.path ? bare : full
      })
    )
    if (ctx.aborted) return null
    const insert = (target: string) => (view: EditorView, _c: Completion, from: number, to: number) => {
      const closed = view.state.sliceDoc(to, to + 2) === ']]'
      view.dispatch({
        changes: { from, to, insert: closed ? target : `${target}]]` },
        selection: { anchor: from + target.length + 2 },
        userEvent: 'input.complete'
      })
    }
    const options: Completion[] = refs.map((r, i) => ({
      label: r.title,
      detail: r.folder === '.' ? '' : r.folder,
      apply: insert(targets[i] === r.title ? targets[i] : `${targets[i]}|${r.title}`)
    }))
    // A name nothing has yet is still a link worth writing: it lands once a
    // note by that name exists — ⌘-click it to make one.
    const name = q.trim()
    if (!refs.some((r) => r.title.toLowerCase() === name.toLowerCase())) {
      options.push({ label: name, detail: 'new note', apply: insert(name), boost: -99 })
    }
    return {
      from: typed.from + 2,
      filter: false,
      options,
      // What you typed, drawn in the titles it matched — the list says why
      // each one is there.
      getMatch: (c: Completion) => {
        const at = c.label.toLowerCase().indexOf(name.toLowerCase())
        return at < 0 ? [] : [at, at + name.length]
      }
    }
  }
}

/**
 * The second `[` closes itself: `[[` becomes `[[|]]`, the caret between, so a
 * link is never left open by a thought that moved on before the brackets did.
 */
const closeLink = EditorView.inputHandler.of((view, from, to, text) => {
  // Not in code, where `[[` is two brackets and `]` is a bracket.
  if ((text === '[' || text === ']') && literal(view.state, view.state.doc.lineAt(from))) return false
  // `]` where the auto-closed `]]` already stands is typed over, not added:
  // closing the link by habit must not leave `]]]]` behind.
  if (text === ']' && from === to && view.state.sliceDoc(from, from + 1) === ']') {
    const line = view.state.doc.lineAt(from)
    const before = line.text.slice(0, from - line.from)
    if (before.lastIndexOf('[[') > before.lastIndexOf(']]')) {
      view.dispatch({ selection: EditorSelection.cursor(from + 1), userEvent: 'select' })
      return true
    }
  }
  if (text !== '[' || from !== to) return false
  const { state } = view
  if (state.sliceDoc(from - 1, from) !== '[' || state.sliceDoc(from - 2, from - 1) === '[') return false
  if (state.sliceDoc(to, to + 2) === ']]') return false
  view.dispatch({
    changes: { from, to, insert: '[]]' },
    selection: { anchor: from + 1 },
    userEvent: 'input.type'
  })
  return true
})

/* ---------- the pointer ---------- */

function pointer(hooks: Hooks): Extension {
  return EditorView.domEventHandlers({
    mousedown(e, view) {
      const el = e.target as HTMLElement | null
      if (!el || e.button !== 0) return false
      const box = el.closest('.cm-md-task') as HTMLElement | null
      if (box) {
        // A tick is not a place to put the caret — nothing moves but the box.
        e.preventDefault()
        const line = view.state.doc.lineAt(view.posAtDOM(box))
        const c = classify(line.text)
        if (c.k !== 'task') return true
        const at = line.from + c.box + 1
        view.dispatch({ changes: { from: at, to: at + 1, insert: c.done ? ' ' : 'x' }, userEvent: 'input.toggle' })
        return true
      }
      if (!(e.metaKey || e.ctrlKey)) return false
      const wiki = el.closest('[data-wiki]') as HTMLElement | null
      if (wiki) {
        e.preventDefault()
        // ⌘ means what it means everywhere in this app: a tab of its own. In
        // READ a plain click follows and ⌘-click keeps the note you were on;
        // here a plain click is the caret, so the only way to follow is ⌘ —
        // and following out of a note you are WRITING must not take it away.
        hooks.follow(wiki.dataset.wiki || wiki.textContent || '', true)
        return true
      }
      const link = el.closest('[data-href]') as HTMLElement | null
      if (link?.dataset.href) {
        e.preventDefault()
        hooks.href(link.dataset.href)
        return true
      }
      return false
    }
  })
}

/**
 * A DOUBLE-CLICK TAKES THE WORD YOU POINTED AT — the one under the pointer when
 * the first click came down, not whatever is under it by the second.
 *
 * The first click puts the caret in a token, and a token the caret is in has
 * its marks shown: `**` either side, a wikilink's target, a link's `(url)`. So
 * the line reflows under the pointer between the two clicks, and CodeMirror
 * reads the second one against the line as it is by then — a double-click on
 * "notes" in `[[projects/x|kickoff notes]]` selected `projects`, in a target
 * nobody could see, and what was typed next rewrote where the link goes. The
 * caret the first click put down was read against the line you were looking
 * at, so the word is taken there. A drag that goes on from the double-click
 * extends by words against the page as it is by then, which is what you are
 * looking at while you drag.
 */
function wordClick(view: EditorView, e: MouseEvent): MouseSelectionStyle | null {
  if (e.detail !== 2 || e.button !== 0 || e.shiftKey || e.altKey || e.metaKey || e.ctrlKey) return null
  const sel = view.state.selection
  if (sel.ranges.length > 1 || !sel.main.empty) return null
  let word = view.state.wordAt(sel.main.head)
  if (!word) return null
  return {
    update: (u) => {
      if (!u.docChanged || !word) return
      const from = u.changes.mapPos(word.from, 1)
      word = EditorSelection.range(from, Math.max(from, u.changes.mapPos(word.to, -1)))
    },
    get: (cur) => {
      const w = word as SelectionRange
      // Still where the clicks came down, a trembling hand included: on the
      // reflowed line a pixel is a different word.
      if (Math.abs(cur.clientX - e.clientX) + Math.abs(cur.clientY - e.clientY) < 6) return EditorSelection.create([w])
      const at = view.posAndSideAtCoords({ x: cur.clientX, y: cur.clientY }, false).pos
      const there = view.state.wordAt(at) ?? EditorSelection.cursor(at)
      return EditorSelection.create([
        there.from < w.from ? EditorSelection.range(w.to, there.from) : EditorSelection.range(w.from, Math.max(w.to, there.to))
      ])
    }
  }
}

/**
 * TYPING IS NOT A SHORTCUT. The window above has single-key chords, and a
 * letter typed into a note must not fire one. A ⌘ or ⌃ chord is not typing,
 * and a few ⌥ chords are the app's own — ⌥⇥ to the other pane, ⌥1 and ⌥2 to
 * put a part of the window away — so those go through, and the app's own
 * handler keeps them from typing a character.
 *
 * Ahead of every keymap, not beside them. A key the editor's own keymap
 * handles ends the editor's handling there, and a stop placed after the keymap
 * never ran for it: ⌥↑ moved the line AND went on up to the window, whose ⌥↑
 * is "the note before this one" — so moving a line up took you to another note.
 */
const keepKeys = Prec.highest(
  EditorView.domEventHandlers({
    keydown(e) {
      const app = e.altKey && (e.code === 'Tab' || e.code === 'Digit1' || e.code === 'Digit2')
      if (!e.metaKey && !e.ctrlKey && !app) e.stopPropagation()
      return false
    }
  })
)

/** ⌘ held: links show that they can be followed. */
const metaHeld = ViewPlugin.fromClass(
  class {
    constructor(readonly view: EditorView) {
      window.addEventListener('keydown', this.on)
      window.addEventListener('keyup', this.on)
      window.addEventListener('blur', this.off)
    }
    on = (e: KeyboardEvent): void => {
      this.view.dom.classList.toggle('cm-meta', e.metaKey || e.ctrlKey)
    }
    off = (): void => {
      this.view.dom.classList.remove('cm-meta')
    }
    destroy(): void {
      window.removeEventListener('keydown', this.on)
      window.removeEventListener('keyup', this.on)
      window.removeEventListener('blur', this.off)
    }
  }
)

/* ---------- comments, written ---------- */

/**
 * WHAT A COMMENT WRITTEN NOW WOULD BE ABOUT: the selection — or, with none,
 * the word at the caret, since a comment about nothing is hard to find again —
 * on the note as it stands. Or the comment those words already have.
 */
export function commentTarget(state: EditorState): CommentTarget | null {
  const r = state.selection.main
  let { from, to } = r
  if (r.empty) {
    const w = state.wordAt(r.head) ?? (r.head > 0 ? state.wordAt(r.head - 1) : null)
    if (!w) return null
    from = w.from
    to = w.to
  }
  return anchorFor(state.doc.toString(), from, to)
}

/** A comment written, what one says changed, or one resolved — found again by its words. */
export type CommentEdit =
  | { kind: 'write'; target: Extract<CommentTarget, { kind: 'new' }>; text: string }
  | { kind: 'edit'; was: { from: number; text: string }; text: string }
  | { kind: 'resolve'; was: { from: number; text: string } }

/**
 * ONE COMMENT CHANGE, ONE STEP — in the editor's own undo, and never reshaped by
 * the editing keys' filters, whose rules are for what keys do. A new comment
 * leaves the caret at the end of the words it is about. False when the note no
 * longer has what it was about: the words changed under the field, or the
 * comment went.
 */
export function editComments(view: EditorView, e: CommentEdit): boolean {
  const doc = view.state.doc.toString()
  let changes
  let caret: number | null = null
  if (e.kind === 'write') {
    const t = anchorFor(doc, e.target.a, e.target.b)
    if (t?.kind !== 'new' || t.a !== e.target.a || t.b !== e.target.b || t.words !== e.target.words) return false
    changes = view.state.changes(writeChanges(t, e.text))
    caret = changes.mapPos(t.b, -1)
  } else {
    const c = findAgain(doc, e.was)
    if (!c) return false
    changes = view.state.changes(e.kind === 'edit' ? editChanges(c, e.text) : resolveChanges(c))
  }
  view.dispatch({
    changes,
    ...(caret === null ? {} : { selection: EditorSelection.cursor(caret) }),
    userEvent: 'input.comment'
  })
  return true
}

/* ---------- everything, in one ---------- */

export function liveMarkdown(hooks: Hooks): Extension {
  return [
    indentUnit.of('  '),
    history(),
    stretch,
    titleZone,
    titleHidden,
    guardTitle,
    options,
    findMarks,
    snap,
    resnap,
    // Transaction filters run last first: the anchor rule is listed ahead of
    // `keepMarks` so that it reads what `keepMarks` made of the edit.
    keepComments,
    keepMarks,
    copyWhole,
    runs,
    live,
    metaHeld,
    keys(hooks),
    keepKeys,
    pointer(hooks),
    EditorView.mouseSelectionStyle.of(wordClick),
    closeLink,
    autocompletion({
      override: [linkSource(hooks)],
      activateOnTyping: true,
      icons: false,
      tooltipClass: () => 'lanes-complete'
    }),
    // On the page, not inside the pane: the pane clips its overflow, and a list
    // of notes cut off at the pane's edge is a list you cannot choose from.
    tooltips({ parent: document.body }),
    EditorView.lineWrapping,
    EditorView.contentAttributes.of({ spellcheck: 'true', autocorrect: 'on', 'aria-label': 'Note' })
  ]
}

