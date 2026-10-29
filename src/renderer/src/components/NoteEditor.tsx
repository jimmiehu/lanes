import React, { useEffect, useLayoutEffect, useRef } from 'react'
import { EditorSelection, EditorState, StateEffect, Transaction } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import {
  beginStretch,
  commentTarget,
  discardStretch,
  editComments,
  findNow,
  liveMarkdown,
  setFind,
  setOptions,
  stretch,
  stretchChanged,
  titleZone,
  wordsStart,
  writing,
  type CommentEdit,
  type FindState
} from '../lib/editorLive'
import type { CommentTarget } from '@shared/comments'
import { titleLineOf } from '@shared/mdLive'
import { lf, lineChanges } from '../lib/lineDiff'
import type { Follow } from './Runs'
import { fileAddress } from '@shared/blocks'

/**
 * THE WRITING SURFACE — one document, always editable, the markdown drawn live.
 *
 * It replaces two surfaces that were each half of a writing tool. READ's
 * double-click editor opened ONE block as a field, rebuilt its own markup on
 * every keystroke and kept a hand-rolled undo for the line it held; you could
 * not select across two paragraphs, and every block was its own little room.
 * WRITE was a textarea with a painted mirror under it, which got the browser's
 * undo and selection for free and paid for them with a rule it could never
 * break: the mirror may change colour and weight and nothing else, or the caret
 * walks away from the words. So a heading was bold rather than big, every `**`
 * was on screen for good, and — with iA Writer's fonts not installed — all of
 * it was set in a code face at 15px.
 *
 * CodeMirror is what lets one surface be both. It lays the text out itself, so
 * a heading can be big, a mark can be hidden and a bullet can be a widget while
 * the caret still lands exactly where it is drawn; and it is still one
 * contenteditable with one selection, one history, native IME, spellcheck and
 * word motion. What it draws is decided in `lib/editorLive.ts`, in READ's own
 * grammar.
 *
 * The file is still the source of truth, byte for byte. Nothing here rewrites a
 * note to suit the editor — its line breaks included: the editor holds each as
 * `\n`, whatever the file used, and main puts the file's own breaks back on
 * the way out (`shared/lineEnds.ts`). The one exception is the line break a note
 * that is nothing but its title line needs to be written in (`roomy`), and that
 * only once something is.
 */

export interface FindEngine {
  /** Search for `q`; returns how many hits. The current one is the first at or after the caret. */
  run: (q: string) => number
  /** The hit that is current after a run — where the bar's counter starts. */
  first: () => number
  /** Make hit `i` current and bring it into view. */
  show: (i: number) => void
  /** The bar is closing on hit `i`: leave it selected, with the caret there. */
  select: (i: number) => void
  clear: () => void
}

export interface NoteEditorHandle {
  /**
   * Take the caret: at the start of the body, its end, a source offset — or
   * `here`, which is wherever it already was.
   */
  focus: (at?: 'body' | 'end' | 'here' | number) => void
  /** Take the caret at a SOURCE line and column — where a double-click in READ was. */
  focusSource: (line: number, col: number) => void
  /** Hand over anything typed that the pane has not heard about yet. */
  flush: () => void
  /**
   * Forget what is owed, without handing it over — the disk's version was asked
   * for. The words typed since the last hand-over come off the screen too, so
   * what you see is what you chose.
   */
  drop: () => void
  /** The client Y of a source line's top, measured or estimated — for the outline. */
  lineTop: (line: number) => number | null
  /** A source line's box in the viewport, measured or estimated. */
  lineBox: (line: number) => { top: number; bottom: number } | null
  /**
   * The source line at a client Y, and its box — or, on a blank line, the first
   * line with words under it: a place kept across ⌘E is the words you were at.
   */
  lineAt: (y: number) => { line: number; top: number; bottom: number } | null
  /**
   * Where a line's WORDS start, in the viewport — its box less the air a
   * heading keeps inside it — and whether it is the line the body opens on.
   * Null for a line the note does not have.
   */
  wordsTop: (line: number) => { y: number; opens: boolean } | null
  /** Write the title line. `# ` + text, inserted at the top if the note has none. */
  setTitle: (text: string) => void
  /** Whether this stretch of writing has changed the note — what esc asks before it leaves. */
  changed: () => boolean
  /**
   * Take the stretch back: the note as it was when it went into WRITE, keeping
   * what arrived from outside since — and hand that over at once.
   */
  discard: () => void
  find: FindEngine
  /**
   * What a comment written now would be about — the selection, or the word at
   * the caret — or the comment already there; with the client Y under the
   * line it is on, where the field opens.
   */
  commentTarget: () => { target: CommentTarget; under: number } | null
  /** A comment written, changed or resolved, as one step of the editor's own undo. */
  comment: (e: CommentEdit) => boolean
}

/** How long a pause in the typing is before the pane hears about it… */
const EMIT_MS = 150
/** …and how long, at most, it waits while the typing goes on. */
const EMIT_MAX_MS = 2000

/*
 * EACH NOTE'S EDITOR, KEPT. A note's editor is torn down when you switch away
 * from it — to another tab, or to READ — and a new one used to start from
 * nothing: no undo, the caret at the top. The state is kept instead (document,
 * selection, history), keyed by the note's identity, and taken up again when
 * the note comes back. Bounded: the least recently left goes first.
 */
const kept = new Map<string, EditorState>()
const KEEP = 24

/**
 * THE DOCUMENT FOR A BODY: the body — unless it is nothing but its title line,
 * which is given the line under it to write on.
 *
 * The head says a note's title and the editor hides the line, so a note that is
 * only `# Title` has no line left to put the caret on. Drawn instead, the title
 * was said twice, the caret stood in front of its `#`, and the first word typed
 * went there: `Hi# Title`, a note no longer named. Nothing in the app makes one
 * — a new note is `# Title` and a blank line — but a file written from outside
 * can be. The line break goes to the file with the first change made to the
 * note — a word typed under the title, or a new name in the field — and not
 * before: nothing is owed until then, so opening such a note and leaving it
 * writes nothing. Every body the editor is handed comes through here, or a body
 * arriving from outside would take the line away again.
 */
function roomy(body: string): string {
  const at = titleLineOf(body.split('\n', 40))
  return at >= 0 && body.split('\n', at + 2).length === at + 1 ? `${body}\n` : body
}

export default function NoteEditor(p: {
  body: string
  /** The note's identity — which kept state is this note's. */
  cacheKey: string
  /** Where the note is now — what `[[` leaves out of the notes it offers. */
  path: string
  onChange: (next: string) => void
  /**
   * Whether keystrokes exist that the pane has not been handed yet. The disk
   * poll asks this — not "is the editor open" — before it calls a change on
   * disk a conflict. An open editor with nothing owed has nothing to lose, and
   * a note Claude just edited should simply update under the caret.
   */
  onPending: (owed: boolean) => void
  /** What is selected, for the quote button. Empty when nothing is. */
  onSelect: (text: string) => void
  /** ↑, ← or ⌫ at the top of the body: the caret goes up into the title. */
  onExitTop: () => void
  /** esc — the way out of WRITE, which the pane asks about first when there is something to lose. */
  onEscape: () => void
  /**
   * Which stretch of writing this is: counted up by the app each time the note
   * goes into WRITE. The editor shown again with the same count — the tab left
   * and come back to — is the same stretch, and keeps what esc would take back.
   */
  stretch: number
  onWiki: Follow
  scale: number
  focusMode: boolean
  typewriter: boolean
  /** The pane's scrollport — the editor is not its own scroller. */
  scroller: React.RefObject<HTMLDivElement | null>
  editorRef?: React.MutableRefObject<NoteEditorHandle | null>
}): React.JSX.Element {
  const host = useRef<HTMLDivElement>(null)
  const view = useRef<EditorView | null>(null)
  const latest = useRef(p)
  latest.current = p
  /** The body the pane last heard from us, or last handed us from outside. */
  const known = useRef(p.body)
  /** What the pane was last HANDED — where a dropped draft goes back to. */
  const handed = useRef(p.body)
  const owed = useRef(false)
  const owedSince = useRef(0)
  /**
   * The body the last body effect took in — what makes a run of that effect
   * NEWS. React may run an effect again with nothing changed (StrictMode does,
   * in development, straight after a mount), and a body that has not changed
   * is not a body from outside, however it compares to what was typed since.
   */
  const lastBody = useRef(p.body)
  /**
   * Set by this editor's own teardown, for the setup that may follow at once
   * on the same component: its props are then a render behind the words the
   * teardown just handed over, and must not be laid back over them — and if it
   * had the caret, the caret is to be where it was, not dropped on the page.
   */
  const leftOwn = useRef<{ focused: boolean } | null>(null)
  const timer = useRef(0)
  const findState = useRef<FindState | null>(null)

  const setOwed = (v: boolean): void => {
    if (owed.current === v) return
    owed.current = v
    latest.current.onPending(v)
  }

  /** Pay what is owed: the document as it stands, to the pane, now. */
  const emit = (): void => {
    if (timer.current) {
      clearTimeout(timer.current)
      timer.current = 0
    }
    const v = view.current
    if (!v || !owed.current) return
    const text = v.state.doc.toString()
    known.current = text
    handed.current = text
    setOwed(false)
    latest.current.onChange(text)
  }

  /** Typewriter: the caret's line parked at the same height every time. */
  const park = (v: EditorView): void => {
    if (!latest.current.typewriter) return
    const head = v.state.selection.main.head
    v.requestMeasure({
      read: (vv) => vv.coordsAtPos(head),
      write: (at) => {
        const sc = latest.current.scroller.current
        if (!at || !sc) return
        const want = sc.getBoundingClientRect().top + sc.clientHeight * 0.38
        const dy = at.top - want
        if (Math.abs(dy) > 2) sc.scrollTop += dy
      }
    })
  }

  useLayoutEffect(() => {
    const parent = host.current
    if (!parent) return
    const extensions = [
      liveMarkdown({
        exitTop: () => latest.current.onExitTop(),
        follow: (target, newTab) => void latest.current.onWiki(target, newTab),
        href: (href) => {
          // A path is a note to open or a file to show, as it is in READ; only
          // the web's own addresses go to the browser, by main's window-open
          // handler. See `fileAddress`.
          const local = fileAddress(href)
          if (local?.note) void latest.current.onWiki(local.path, true, { address: true })
          else if (local) void window.lanes.reveal(local.path)
          else window.open(href, '_blank')
        },
        // Not the note being written in: a link from a note to itself is never
        // the one you were reaching for, and it sat among the ones you were.
        notes: async (q) => (await window.lanes.searchNotes(q)).filter((n) => n.path !== latest.current.path),
        resolve: (target) => window.lanes.resolveLink(target),
        escape: () => latest.current.onEscape()
      }),
      EditorView.updateListener.of((u) => {
        if (u.docChanged && u.transactions.some((tr) => tr.docChanged && !tr.isUserEvent('external'))) {
          if (!owed.current) owedSince.current = Date.now()
          setOwed(true)
          if (timer.current) clearTimeout(timer.current)
          const wait = Math.max(0, Math.min(EMIT_MS, owedSince.current + EMIT_MAX_MS - Date.now()))
          timer.current = window.setTimeout(emit, wait)
        }
        if (u.selectionSet || u.docChanged || u.focusChanged) {
          const r = u.state.selection.main
          latest.current.onSelect(writing(u.view) && !r.empty ? u.state.sliceDoc(r.from, r.to).trim() : '')
          // Parked for the keyboard, never for the pointer: a click or a drag
          // is you choosing a place on the page, and the page moving under the
          // pointer while you do it fights you for it.
          const pointer = u.transactions.some((tr) => tr.isUserEvent('select.pointer'))
          if (writing(u.view) && !pointer && (u.selectionSet || u.docChanged)) park(u.view)
        }
        // Leaving the field settles what is owed at once: the timer is for
        // the pauses between words, not for work left hanging.
        if (u.focusChanged && !u.view.hasFocus) emit()
      })
    ]
    const cached = kept.get(p.cacheKey)
    let state: EditorState
    if (cached) {
      // The same note's state, with THIS mount's extensions: the old ones close
      // over the component that is gone. History and the selection are state
      // fields that survive the swap.
      state = cached.update({ effects: StateEffect.reconfigure.of(extensions) }).state
    } else {
      // The caret starts where writing does — under the title, never inside the
      // line the head is showing. Counted in the editor's text, not the file's:
      // a `\r\n` counted as two put the caret two letters into the first line.
      // And `roomy`: a note that is only its title gets a line to write on.
      const body = roomy(lf(p.body))
      const lines = body.split('\n', 40)
      const at = titleLineOf(lines)
      let start = 0
      if (at >= 0 && lines.length > at + 1) {
        for (let i = 0; i <= at; i += 1) start += lines[i].length + 1
        if (lines.length > at + 2 && !lines[at + 1].trim()) start += lines[at + 1].length + 1
      }
      state = EditorState.create({
        doc: body,
        selection: EditorSelection.cursor(Math.min(start, body.length)),
        extensions
      })
      // And at the words of that line: past an item's marker or a heading's
      // hashes, where typing is writing rather than breaking the line's shape.
      // No transaction put this caret down, so nothing else would move it.
      const words = wordsStart(state, state.selection.main.head)
      if (words !== state.selection.main.head) {
        state = state.update({ selection: EditorSelection.cursor(words), annotations: Transaction.addToHistory.of(false) }).state
      }
    }
    const v = new EditorView({ parent, state })
    view.current = v
    // The body is laid over the kept state when it is news from outside: a
    // change made while the note was not on screen. Not when this is the same
    // editor set up again a moment after its own teardown — then the body in
    // its props is from before the words that teardown just handed over, and
    // laying it back would take them away (see `leftOwn`).
    const again = leftOwn.current
    leftOwn.current = null
    if (again?.focused) v.focus()
    if (cached && !again) {
      const cur = v.state.doc.toString()
      const want = roomy(lf(p.body))
      if (cur !== want) {
        v.dispatch({ changes: lineChanges(cur, want), userEvent: 'external', annotations: Transaction.addToHistory.of(false) })
      }
    }
    v.dispatch({ effects: setOptions.of({ focus: latest.current.focusMode }) })
    const key = p.cacheKey
    return () => {
      /*
       * What the page holds that the editor has not read yet — a keystroke
       * whose DOM change is still waiting on CodeMirror's observer, which reads
       * it a microtask later. Torn down first, the observer is disconnected and
       * those characters are gone: never in the document, never handed over,
       * never kept. `forceFlush` reads them now. It is not public API, so it is
       * asked for, not assumed.
       */
      ;(v as unknown as { observer?: { forceFlush?: () => void } }).observer?.forceFlush?.()
      emit()
      leftOwn.current = { focused: v.hasFocus || writing(v) }
      kept.delete(key)
      kept.set(key, v.state)
      while (kept.size > KEEP) kept.delete(kept.keys().next().value as string)
      v.destroy()
      view.current = null
    }
    // Made once per mount. The pane keys this component by the note's identity,
    // so a different note is a different editor with its own history — and the
    // same note renamed is the same editor.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /*
   * A BODY FROM OUTSIDE — the disk changed and the pane took it, or the app's
   * own undo stepped the note. Applied as the changes that were actually made
   * (`lib/lineDiff.ts`), so the caret, the scroll and your place are carried
   * through them rather than reset: the one edit you cannot see coming should
   * not also lose your line.
   *
   * Not while keystrokes are owed. Those are newer than anything the pane could
   * be handing back, and the conflict banner is the honest answer to a disk
   * that moved underneath them — not a silent overwrite either way.
   *
   * Out of the undo history: it was not yours to undo.
   *
   * In a LAYOUT effect, so a body the pane has just taken is in the document
   * before another key can go down. The app hands a body from disk over
   * synchronously once it has asked that nothing is owed (see the poll in
   * App); a passive effect ran a task after that, and a key typed in the gap
   * made the body look like one the typing had already overtaken — so it was
   * passed by, and the next save wrote over it.
   */
  useLayoutEffect(() => {
    const v = view.current
    // Only a body that changed is news. Run again with the same one — as React
    // does in development straight after a mount — it is a body from before
    // whatever has been typed since, not a change from outside.
    if (p.body === lastBody.current) return
    lastBody.current = p.body
    if (!v || p.body === known.current) return
    if (owed.current) return
    const cur = v.state.doc.toString()
    known.current = p.body
    handed.current = p.body
    const want = roomy(lf(p.body))
    if (cur === want) return
    v.dispatch({
      changes: lineChanges(cur, want),
      userEvent: 'external',
      annotations: Transaction.addToHistory.of(false)
    })
  }, [p.body])

  /*
   * A NEW STRETCH OF WRITING begins where the note went into WRITE — and not
   * where the same stretch is merely shown again, a tab left and come back to,
   * which keeps what esc would take back. After the mount, so a body from
   * outside laid over a kept state belongs to the stretch it arrived in; and a
   * layout effect, so no key can go down before the stretch has begun.
   */
  useLayoutEffect(() => {
    const v = view.current
    if (v && v.state.field(stretch).id !== p.stretch) v.dispatch({ effects: beginStretch.of(p.stretch) })
  }, [p.stretch])

  useEffect(() => {
    view.current?.dispatch({ effects: setOptions.of({ focus: p.focusMode }) })
  }, [p.focusMode])

  useEffect(() => {
    const v = view.current
    if (!v) return
    // The type is sized from a custom property; the editor has to be told its
    // lines changed height, or its map of where everything is goes stale.
    v.requestMeasure()
    if (p.typewriter && v.hasFocus) park(v)
  }, [p.scale, p.typewriter])

  // A LAYOUT effect, so the handle exists in the same commit the editor does.
  // The pane focuses a new note's body from its own layout effect, which runs
  // after this one; handed out a frame later, that focus found nothing to hold.
  useLayoutEffect(() => {
    if (!p.editorRef) return
    const bodyStart = (v: EditorView): number => v.state.field(titleZone).body
    const handle: NoteEditorHandle = {
      focus: (at) => {
        const v = view.current
        if (!v) return
        v.focus()
        if (at === 'here') return
        const pos = at === undefined || at === 'body' ? wordsStart(v.state, bodyStart(v)) : at === 'end' ? v.state.doc.length : at
        v.dispatch({
          selection: EditorSelection.cursor(Math.max(bodyStart(v), Math.min(pos, v.state.doc.length))),
          scrollIntoView: true,
          userEvent: 'select'
        })
      },
      focusSource: (line, col) => {
        const v = view.current
        if (!v) return
        const doc = v.state.doc
        const l = doc.line(Math.max(1, Math.min(doc.lines, line + 1)))
        v.focus()
        v.dispatch({
          selection: EditorSelection.cursor(Math.min(l.to, l.from + Math.max(0, col))),
          effects: EditorView.scrollIntoView(l.from, { y: 'center' }),
          userEvent: 'select.pointer'
        })
      },
      flush: emit,
      drop: () => {
        if (timer.current) clearTimeout(timer.current)
        timer.current = 0
        setOwed(false)
        const v = view.current
        if (v) {
          const cur = v.state.doc.toString()
          const want = roomy(handed.current)
          if (cur !== want) {
            v.dispatch({
              changes: lineChanges(cur, want),
              userEvent: 'external',
              annotations: Transaction.addToHistory.of(false)
            })
          }
        }
        // Whatever arrives next is to be taken, even if it matches what the
        // pane last heard from here.
        known.current = '\u0000'
      },
      lineTop: (line) => {
        const v = view.current
        if (!v) return null
        const doc = v.state.doc
        if (line + 1 > doc.lines) return null
        const block = v.lineBlockAt(doc.line(line + 1).from)
        return v.documentTop + block.top
      },
      lineBox: (line) => {
        const v = view.current
        if (!v) return null
        const doc = v.state.doc
        if (line < 0 || line + 1 > doc.lines) return null
        const block = v.lineBlockAt(doc.line(line + 1).from)
        return { top: v.documentTop + block.top, bottom: v.documentTop + block.bottom }
      },
      lineAt: (y) => {
        const v = view.current
        if (!v) return null
        const doc = v.state.doc
        let block = v.lineBlockAtHeight(y - v.documentTop)
        while (!doc.lineAt(block.from).text.trim() && block.to < doc.length) block = v.lineBlockAt(block.to + 1)
        return {
          line: doc.lineAt(block.from).number - 1,
          top: v.documentTop + block.top,
          bottom: v.documentTop + block.bottom
        }
      },
      wordsTop: (line) => {
        const v = view.current
        if (!v) return null
        const doc = v.state.doc
        if (line + 1 > doc.lines) return null
        const at = doc.line(line + 1)
        const block = v.lineBlockAt(at.from)
        // The padding is read off the drawn line. A line not drawn yet has an
        // estimated place anyway, and whoever asks asks again once it is.
        let pad = 0
        if (at.from >= v.viewport.from && at.from <= v.viewport.to) {
          const node = v.domAtPos(at.from).node
          const el = (node.nodeType === 1 ? (node as Element) : node.parentElement)?.closest('.cm-line')
          if (el) pad = parseFloat(getComputedStyle(el).paddingTop) || 0
        }
        return { y: v.documentTop + block.top + pad, opens: line + 1 === v.state.field(titleZone).lines + 1 }
      },
      setTitle: (text) => {
        const v = view.current
        if (!v) return
        const doc = v.state.doc
        const lines: string[] = []
        for (let i = 1; i <= Math.min(doc.lines, 40); i += 1) lines.push(doc.line(i).text)
        const at = titleLineOf(lines)
        const clean = text.replace(/[\r\n]+/g, ' ')
        // Out of the body's history. The title field has an undo of its own,
        // and a title typed a letter at a time is not thirty steps ⌘Z in the
        // body should walk back through before it reaches your writing.
        const quiet = Transaction.addToHistory.of(false)
        if (at >= 0) {
          const line = doc.line(at + 1)
          const next = `# ${clean}`
          if (line.text === next) return
          v.dispatch({ changes: { from: line.from, to: line.to, insert: next }, userEvent: 'input.title', annotations: quiet })
        } else {
          v.dispatch({ changes: { from: 0, insert: `# ${clean}\n\n` }, userEvent: 'input.title', annotations: quiet })
        }
      },
      changed: () => {
        const v = view.current
        return Boolean(v && stretchChanged(v.state))
      },
      discard: () => {
        const v = view.current
        if (!v) return
        discardStretch(v)
        emit()
      },
      commentTarget: () => {
        const v = view.current
        if (!v) return null
        const target = commentTarget(v.state)
        if (!target) return null
        const at = target.kind === 'new' ? target.b : target.comment.from
        const box = v.coordsAtPos(at, -1) ?? v.coordsAtPos(at, 1)
        const line = v.lineBlockAt(at)
        return { target, under: box ? box.bottom : v.documentTop + line.bottom }
      },
      comment: (e) => {
        const v = view.current
        if (!v) return false
        const done = editComments(v, e)
        if (done) emit()
        return done
      },
      find: {
        run: (q) => {
          const v = view.current
          if (!v) return 0
          if (!q) {
            findState.current = null
            v.dispatch({ effects: setFind.of(null) })
            return 0
          }
          // Case-insensitive through the pattern rather than by lower-casing
          // the text, which can change a string's length and move every offset
          // after the first character that does.
          const z = v.state.field(titleZone)
          const text = v.state.doc.toString()
          const re = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'giu')
          re.lastIndex = z.body
          const hits: { from: number; to: number }[] = []
          for (let m = re.exec(text); m && hits.length < 2000; m = re.exec(text)) {
            if (m.index < z.body) continue
            hits.push({ from: m.index, to: m.index + m[0].length })
            if (!m[0].length) re.lastIndex += 1
          }
          // From the caret, the way a find in a document starts: the first hit
          // at or after where you are, not the first one in the note.
          const head = v.state.selection.main.head
          const after = hits.findIndex((h) => h.from >= head)
          const s = { hits, current: hits.length ? (after === -1 ? 0 : after) : -1 }
          findState.current = s
          v.dispatch({
            effects: [
              setFind.of(s),
              ...(hits.length ? [EditorView.scrollIntoView(hits[s.current].from, { y: 'center' })] : [])
            ]
          })
          return hits.length
        },
        first: () => findState.current?.current ?? 0,
        show: (i) => {
          const v = view.current
          // Read from the editor, not from what was found: the hits there have
          // moved with every keystroke and every change from outside since.
          const s = (v && findNow(v.state)) ?? findState.current
          if (!v || !s || !s.hits[i]) return
          const next = { ...s, current: i }
          findState.current = next
          v.dispatch({ effects: [setFind.of(next), EditorView.scrollIntoView(s.hits[i].from, { y: 'center' })] })
        },
        select: (i) => {
          const v = view.current
          const s = (v && findNow(v.state)) ?? findState.current
          const h = s?.hits[i]
          if (!v || !h) return
          v.focus()
          v.dispatch({ selection: EditorSelection.range(h.from, h.to), scrollIntoView: true, userEvent: 'select' })
        },
        clear: () => {
          findState.current = null
          view.current?.dispatch({ effects: setFind.of(null) })
        }
      }
    }
    p.editorRef.current = handle
    return () => {
      if (p.editorRef) p.editorRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.editorRef])

  return (
    <div
      className="lanes-ed"
      data-note-editor="1"
      style={
        {
          '--s': p.scale,
          // Room to park the last line partway up the pane; without it
          // typewriter mode simply stops working over the final screenful.
          paddingBottom: p.typewriter ? '55vh' : 0
        } as React.CSSProperties
      }
    >
      <div ref={host} />
      {/*
        The room under the last line is where you ADD to a note, so a click in
        it puts the caret at the end rather than doing nothing.
      */}
      <div
        className="lanes-ed-tail"
        onMouseDown={(e) => {
          e.preventDefault()
          const v = view.current
          if (!v) return
          v.focus()
          const end = v.state.doc.length
          // Onto a line of its own: a click under the last line is somewhere
          // new to write, and a note that ends without a newline would
          // otherwise glue the first word typed there onto its last sentence.
          const last = v.state.doc.lineAt(end)
          if (last.text.trim() && last.number > v.state.field(titleZone).lines) {
            v.dispatch({ changes: { from: end, insert: '\n' }, selection: EditorSelection.cursor(end + 1), scrollIntoView: true, userEvent: 'input' })
          } else {
            v.dispatch({ selection: EditorSelection.cursor(end), scrollIntoView: true, userEvent: 'select' })
          }
        }}
      />
    </div>
  )
}
