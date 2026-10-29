import { useCallback, useEffect, useRef, useState } from 'react'
import type { FindEngine } from './NoteEditor'

interface Props {
  /** The pane this bar belongs to; matches are scoped to its content. */
  scope: () => HTMLElement | null
  /**
   * A surface that finds for itself — the note editor, which draws only the
   * lines near the screen and so cannot be searched through its DOM. When
   * given, the bar asks it for matches and hands it the stepping; the count,
   * the keys and the look of the bar are unchanged.
   */
  engine?: () => FindEngine | null
  /** Changes when the pane shows something else, so the search re-runs. */
  contentKey: string
  /** Bumped on every ⌘F, to refocus and select without losing the query. */
  focusNonce: number
  /** What was last searched for, so ⌘G on a closed bar is still "find again". */
  initial: string
  onQuery: (q: string) => void
  onClose: () => void
}

/**
 * Find inside the pane you are looking at.
 *
 * Highlighting goes through the CSS Custom Highlight API rather than wrapping
 * matches in `<mark>`: no DOM surgery, so the message and note renderers do not
 * have to know that finding exists, and a highlight cannot disturb layout or
 * survive a re-render as stale markup.
 */

const ALL = 'lanes-find'
const CURRENT = 'lanes-find-current'

interface Point {
  node: Text
  offset: number
}

/** Every text node under `root`, as one string plus a map back to nodes. */
function collect(root: HTMLElement): { text: string; at: (i: number) => Point | null } {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: (n) =>
      (n as Text).data.length && !(n.parentElement?.closest('[data-find-skip]'))
        ? NodeFilter.FILTER_ACCEPT
        : NodeFilter.FILTER_REJECT
  })
  const nodes: Text[] = []
  const starts: number[] = []
  let text = ''
  let n: Node | null
  while ((n = walker.nextNode())) {
    nodes.push(n as Text)
    starts.push(text.length)
    text += (n as Text).data
  }
  const at = (i: number): Point | null => {
    if (!nodes.length) return null
    let lo = 0
    let hi = nodes.length - 1
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1
      if (starts[mid] <= i) lo = mid
      else hi = mid - 1
    }
    return { node: nodes[lo], offset: i - starts[lo] }
  }
  return { text, at }
}

function clearHighlights(): void {
  const reg = (CSS as unknown as { highlights?: Map<string, unknown> }).highlights
  reg?.delete(ALL)
  reg?.delete(CURRENT)
}

export default function FindBar(p: Props): React.JSX.Element {
  const [q, setQ] = useState(p.initial)
  const [total, setTotal] = useState(0)
  const [at, setAt] = useState(0)
  /**
   * Bumped by every rebuild. ⌘E with the bar open finds the same hits in the
   * other mode — 1 of 4 before, 1 of 4 after — and a paint keyed on the count
   * and the position alone never ran for the new page: READ counted its
   * matches and showed none of them.
   */
  const [built, setBuilt] = useState(0)
  const ranges = useRef<Range[]>([])
  const input = useRef<HTMLInputElement>(null)
  /**
   * The parent hands us a fresh `scope` closure on every render, and Pane
   * re-renders on every streamed token. Holding it in a ref keeps it out of the
   * effect deps — with `p` in there, rebuilding reset the current match to the
   * first one continuously and Enter could never advance.
   */
  const scopeRef = useRef(p.scope)
  scopeRef.current = p.scope
  const engineRef = useRef(p.engine)
  engineRef.current = p.engine

  useEffect(() => {
    input.current?.focus()
    input.current?.select()
  }, [p.focusNonce])

  // Rebuild the match set. Case-insensitive, and deliberately not diacritic-
  // folded: folding changes string lengths, and a find bar has to map offsets
  // back onto the text nodes it came from.
  useEffect(() => {
    const engine = engineRef.current?.()
    if (engine) {
      ranges.current = []
      clearHighlights()
      const n = q.length ? engine.run(q) : (engine.clear(), 0)
      setTotal(n)
      // Where the engine put the current hit — the first at or after the caret,
      // which is where a find in a document starts.
      setAt(n ? engine.first() : -1)
      setBuilt((b) => b + 1)
      return () => engine.clear()
    }
    const root = scopeRef.current()
    ranges.current = []
    clearHighlights()
    if (!root || q.length < 1) {
      setTotal(0)
      setAt(0)
      return
    }
    const { text, at: pointAt } = collect(root)
    const hay = text.toLowerCase()
    const needle = q.toLowerCase()
    const found: Range[] = []
    let from = 0
    for (;;) {
      const i = hay.indexOf(needle, from)
      if (i === -1 || found.length >= 2000) break
      const s = pointAt(i)
      const e = pointAt(i + needle.length - 1)
      if (s && e) {
        const r = document.createRange()
        try {
          r.setStart(s.node, s.offset)
          r.setEnd(e.node, e.offset + 1)
          found.push(r)
        } catch {
          /* a node changed under us; skip this one */
        }
      }
      from = i + needle.length
    }
    ranges.current = found
    setTotal(found.length)
    setAt(found.length ? 0 : -1)
    setBuilt((b) => b + 1)
  }, [q, p.contentKey])

  // An engine paints and scrolls for itself; it only needs telling which hit.
  useEffect(() => {
    const engine = engineRef.current?.()
    if (engine && at >= 0 && total) engine.show(at)
  }, [at, total, built])

  // Paint: everything in one highlight, the current match in another above it.
  useEffect(() => {
    if (engineRef.current?.()) return
    const reg = (CSS as unknown as {
      highlights?: Map<string, unknown> & { set: (k: string, v: unknown) => void }
    }).highlights
    const Ctor = (window as unknown as { Highlight?: new (...r: Range[]) => unknown }).Highlight
    if (!reg || !Ctor) return
    const all = ranges.current
    if (!all.length) {
      clearHighlights()
      return
    }
    reg.set(ALL, new Ctor(...all))
    const cur = all[at]
    if (cur) reg.set(CURRENT, new Ctor(cur))
    return () => clearHighlights()
  }, [total, at, built])

  // Bring the current match into view inside the pane's own scroller.
  useEffect(() => {
    if (engineRef.current?.()) return
    const cur = ranges.current[at]
    const root = scopeRef.current()
    if (!cur || !root) return
    /*
     * A match inside a CLOSED fold has no box to bring into view — a collapsed
     * `<details>` is `display:none` inside, so its rect is zeros and the
     * scroller would jump to the top of the document instead. The browser's own
     * find opens a fold to show you a hit; so does this one. Every ancestor,
     * since folds nest.
     */
    const start =
      cur.startContainer.nodeType === 3 ? cur.startContainer.parentElement : (cur.startContainer as HTMLElement)
    let fold = start?.closest('details:not([open])') as HTMLDetailsElement | null
    while (fold) {
      fold.open = true
      fold = fold.parentElement?.closest('details:not([open])') as HTMLDetailsElement | null
    }
    const box = cur.getBoundingClientRect()
    const view = root.getBoundingClientRect()
    if (box.top < view.top + 24 || box.bottom > view.bottom - 24) {
      root.scrollTop += box.top - view.top - view.height / 3
    }
  }, [at, total, built])

  const totalRef = useRef(0)
  totalRef.current = total
  const step = useCallback(
    (d: number) => {
      setAt((i) => {
        const n = engineRef.current?.() ? totalRef.current : ranges.current.length
        return n ? (i + d + n) % n : -1
      })
    },
    []
  )

  /**
   * ⌘G steps without the caret having to be in the field — which is the whole
   * point of it: you find something, click into the transcript to read it, and
   * still want the next one. Listened for here rather than in the app's own
   * keymap because the matches live here; the app only knows a bar is open.
   */
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (!e.metaKey || e.key.toLowerCase() !== 'g') return
      e.preventDefault()
      step(e.shiftKey ? -1 : 1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [step])

  useEffect(() => () => clearHighlights(), [])

  /*
   * Closing the bar leaves you ON the match, the way a browser's find does: in
   * a note being written that means the caret, with the found words selected —
   * not a document with nowhere to type.
   */
  const atRef = useRef(at)
  atRef.current = at
  useEffect(
    () => () => {
      const engine = engineRef.current?.()
      if (engine && atRef.current >= 0) engine.select(atRef.current)
    },
    []
  )

  return (
    <div
      data-find-skip="1"
      onClick={(e) => e.stopPropagation()}
      // In the flow rather than floating: the tab strip and the header's own
      // controls both live at the top right of a pane, and an overlay there
      // covers whichever one the pane happens to be showing. Pane mounts this
      // OUTSIDE its scrollport wrapper, so the compact bar — which is absolute
      // at that wrapper's top — slides in underneath rather than over the field
      // you are typing in. See the comment there.
      style={{
        flex: 'none',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'flex-end',
        gap: 8,
        padding: '5px 12px 5px 14px',
        background: 'var(--strip)',
        boxShadow: 'inset 0 -1px 0 var(--div)'
      }}
    >
      <input
        ref={input}
        value={q}
        onChange={(e) => {
          setQ(e.target.value)
          // Remembered by the app, so closing the bar and asking again does not
          // start from nothing.
          p.onQuery(e.target.value)
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            step(e.shiftKey ? -1 : 1)
          } else if (e.key === 'Escape') {
            e.preventDefault()
            p.onClose()
          }
        }}
        placeholder="Find in this pane"
        style={{ width: 150, font: '400 11.5px var(--sans)', color: 'var(--ink)' }}
      />
      {/*
        The count wears the mark's own colour when there are any. One property,
        and it does two things: it is the loudest "you have hits" signal in a bar
        that is otherwise all grey, and it says which colour out there is this
        bar's doing — the amber in the document and the amber in the chrome are
        one thing.
      */}
      <div
        data-find-count="1"
        style={{
          font: '400 9px var(--mono)',
          color: total ? 'var(--findNow)' : 'var(--faint)',
          whiteSpace: 'nowrap',
          minWidth: 44,
          textAlign: 'right'
        }}
      >
        {q.length === 0 ? '' : total ? `${at + 1}/${total}` : 'none'}
      </div>
      {(['↑', '↓'] as const).map((g, i) => (
        <div
          key={g}
          onClick={() => step(i === 0 ? -1 : 1)}
          title={i === 0 ? 'Previous (⇧↵ · ⇧⌘G)' : 'Next (↵ · ⌘G)'}
          className="tab"
          style={{
            width: 20,
            height: 20,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: 4,
            cursor: 'pointer',
            font: '400 10px var(--mono)',
            color: total ? 'var(--ink3)' : 'var(--dot)'
          }}
        >
          {g}
        </div>
      ))}
      <div
        onClick={p.onClose}
        title="Close (esc)"
        className="tab"
        style={{
          width: 20,
          height: 20,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: 4,
          cursor: 'pointer',
          font: '400 11px var(--mono)',
          color: 'var(--mute)'
        }}
      >
        ×
      </div>
    </div>
  )
}
