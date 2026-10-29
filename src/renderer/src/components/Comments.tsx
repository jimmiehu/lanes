import React, { useEffect, useLayoutEffect, useRef, useState } from 'react'

/**
 * A NOTE'S COMMENTS, BESIDE THE WORDS THEY ARE ABOUT.
 *
 * A comment is written in the note — `{==words==}{>>what about them<<}`, see
 * shared/comments.ts — and both surfaces draw it the same way: the anchor's
 * words washed, the comment itself put away, and a marker left at its point
 * carrying its words. This is the one thing that shows them, for READ and for
 * WRITE alike, since it reads nothing but those markers: it does not care which
 * surface drew them.
 *
 * WHERE THE PANE HAS ROOM past the measure, each comment is a card in the right
 * margin, level with its anchor's line, stacked down the margin where two would
 * meet. Where it has none — a split pane is usually narrower than the measure
 * and a margin — the anchor carries the marker instead, and a click on it opens
 * the comment under the line. A comment at a point, with no anchor, is always a
 * marker, since there are no washed words to say where it is.
 *
 * AND IT IS WHERE ONE IS WRITTEN. A comment opened — its card clicked, its
 * marker pressed — is a field holding its words, with a ✓ that resolves it; a
 * new one is a field under the words it will be about. ↵ writes; esc closes,
 * and asks first when there are words typed it would throw away.
 */

/** The margin a pane needs past the measure before its comments go in it. */
export const MARGIN_ROOM = 200
/** Between the words and a card in the margin. */
const GAP = 22
/** A card in the margin at its widest. */
const CARD_MAX = 240
/** Between two cards stacked down the margin. */
const STACK = 8

/** A small speech bubble — where a comment is, in a line that does not show it. */
export function CommentGlyph(): React.JSX.Element {
  return (
    <svg
      width="11"
      height="11"
      viewBox="0 0 14 14"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.3"
      strokeLinejoin="round"
      aria-hidden
      style={{ display: 'block' }}
    >
      <path d="M2.6 3.2h8.8v5.9H6.9l-2.8 2.3V9.1H2.6z" />
    </svg>
  )
}

/** One comment on the page, as its marker says it: which, its words, and where its line is. */
interface Spot {
  key: string
  text: string
  bare: boolean
  /** The top and bottom of the anchor's first line — or the marker's — in the scroller's content. */
  top: number
  bottom: number
}

interface Geo {
  room: boolean
  /** The column's two edges, in the scroller's content. */
  left: number
  right: number
  /** The margin past the column. */
  gutter: number
}

/** The field, while it is open: a new comment, under the words at `top`, or one already written. */
export type FieldView =
  | { kind: 'new'; top: number; words: string }
  | { kind: 'old'; key: string; text: string; words: string | null }

const sameSpots = (a: Spot[], b: Spot[]): boolean =>
  a.length === b.length &&
  a.every((s, i) => s.key === b[i].key && s.text === b[i].text && s.bare === b[i].bare && s.top === b[i].top && s.bottom === b[i].bottom)

export function CommentMargin({
  scroller,
  version,
  field,
  onOpen,
  onSubmit,
  onResolve,
  onClose
}: {
  /** The pane's scroller, which holds the surface and is the margin's ground. */
  scroller: React.RefObject<HTMLDivElement | null>
  /** Anything that changes what is drawn — the body, the mode — so the margin reads it again. */
  version: string
  /** The field, while it is open. */
  field: FieldView | null
  /** A comment pressed — absent where the note cannot be written, which only shows it. */
  onOpen?: (key: string, text: string) => void
  onSubmit: (text: string) => void
  onResolve: () => void
  onClose: () => void
}): React.JSX.Element | null {
  const [spots, setSpots] = useState<Spot[]>([])
  const [geo, setGeo] = useState<Geo>({ room: false, left: 0, right: 0, gutter: 0 })
  /** A comment shown under its line, where nothing can be written: read-only. */
  const [shown, setShown] = useState<string | null>(null)
  /** The comment being pointed at — its card or its words. */
  const [hot, setHot] = useState<string | null>(null)
  const layer = useRef<HTMLDivElement>(null)
  const cards = useRef(new Map<string, HTMLDivElement>())
  const openRef = useRef(onOpen)
  openRef.current = onOpen

  /** Every marker in the scroller, read off the page. */
  const scan = (): void => {
    const sc = scroller.current
    if (!sc) return
    const cs = getComputedStyle(sc)
    const padL = parseFloat(cs.paddingLeft) || 0
    const padR = parseFloat(cs.paddingRight) || 0
    const room = padR >= MARGIN_ROOM
    // Said on the scroller, for the stylesheet: an anchor's marker shows only
    // where its comment is not in the margin.
    const flag = room ? '1' : '0'
    if (sc.dataset.cmtRoom !== flag) sc.dataset.cmtRoom = flag
    const g = { room, left: padL, right: sc.clientWidth - padR, gutter: padR }
    setGeo((was) => (was.room === g.room && was.left === g.left && was.right === g.right && was.gutter === g.gutter ? was : g))
    const box = sc.getBoundingClientRect()
    const y = (v: number): number => Math.round(v - box.top + sc.scrollTop)
    const next: Spot[] = []
    for (const m of sc.querySelectorAll<HTMLElement>('[data-cmt-at]')) {
      if (layer.current?.contains(m)) continue
      const key = m.dataset.cmtAt ?? ''
      const bare = m.dataset.cmtBare === '1'
      const anchor = bare ? null : sc.querySelector<HTMLElement>(`[data-cmt-anchor="${CSS.escape(key)}"]`)
      const r = (anchor ?? m).getClientRects()[0]
      // Not on the page: in a fold that is shut.
      if (!r || (!r.width && !r.height)) continue
      next.push({ key, text: m.dataset.cmtText ?? '', bare, top: y(r.top), bottom: y(r.bottom) })
    }
    setSpots((was) => (sameSpots(was, next) ? was : next))
  }
  const scanRef = useRef(scan)
  scanRef.current = scan

  // Read again whatever changes the page: what is drawn, the pane's width,
  // the editor drawing more of the note as it is scrolled. A beat later rather
  // than at once, so a burst of changes is read once.
  useLayoutEffect(() => {
    scanRef.current()
  }, [version])
  useEffect(() => {
    const sc = scroller.current
    if (!sc) return
    let due = 0
    const later = (): void => {
      if (due) return
      due = window.setTimeout(() => {
        due = 0
        scanRef.current()
      }, 30)
    }
    const seen = new MutationObserver((ms) => {
      if (ms.every((m) => layer.current?.contains(m.target))) return
      later()
    })
    seen.observe(sc, { childList: true, subtree: true, characterData: true })
    const size = new ResizeObserver(later)
    size.observe(sc)
    sc.addEventListener('scroll', later, { passive: true })
    return () => {
      if (due) clearTimeout(due)
      seen.disconnect()
      size.disconnect()
      sc.removeEventListener('scroll', later)
      delete sc.dataset.cmtRoom
    }
  }, [scroller])

  /** The comment the field holds, when it holds one already written. */
  const editing = field?.kind === 'old' ? field.key : null

  // Down the margin, each card level with its line or, where the one above
  // reaches past that, just under it — the field in its comment's place.
  useLayoutEffect(() => {
    if (!geo.room) return
    let floor = -Infinity
    for (const s of spots) {
      const el = cards.current.get(s.key)
      if (!el) continue
      const top = Math.max(s.top - 3, floor)
      el.style.transform = `translateY(${top}px)`
      floor = top + el.offsetHeight + STACK
    }
  }, [spots, geo, editing])

  // A marker is how a comment is opened where the margin cannot hold it.
  useEffect(() => {
    const sc = scroller.current
    if (!sc) return
    const click = (e: MouseEvent): void => {
      const m = (e.target as Element | null)?.closest?.('[data-cmt-at]') as HTMLElement | null
      if (!m || layer.current?.contains(m)) return
      e.preventDefault()
      const key = m.dataset.cmtAt ?? ''
      if (openRef.current) openRef.current(key, m.dataset.cmtText ?? '')
      else setShown((was) => (was === key ? null : key))
    }
    const over = (e: MouseEvent): void => {
      const a = (e.target as Element | null)?.closest?.('[data-cmt-anchor]') as HTMLElement | null
      setHot(a?.dataset.cmtAnchor ?? null)
    }
    sc.addEventListener('click', click)
    sc.addEventListener('mouseover', over)
    return () => {
      sc.removeEventListener('click', click)
      sc.removeEventListener('mouseover', over)
    }
  }, [scroller])

  // The words of the comment being pointed at, lit — whichever end was pointed at.
  useEffect(() => {
    const sc = scroller.current
    const key = hot ?? editing
    if (!sc || !key) return
    const lit = [...sc.querySelectorAll<HTMLElement>(`[data-cmt-anchor="${CSS.escape(key)}"]`)]
    for (const el of lit) el.classList.add('cmt-hot')
    return () => {
      for (const el of lit) el.classList.remove('cmt-hot')
    }
  }, [hot, editing, scroller, spots])

  // A card shown read-only goes on esc, a press anywhere else, or its comment going.
  useEffect(() => {
    if (!shown) return
    if (!spots.some((s) => s.key === shown)) {
      setShown(null)
      return
    }
    const key = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape') return
      e.preventDefault()
      e.stopPropagation()
      setShown(null)
    }
    const down = (e: MouseEvent): void => {
      const t = e.target as Element | null
      if (layer.current?.contains(t) || t?.closest?.('[data-cmt-at]')) return
      setShown(null)
    }
    window.addEventListener('keydown', key, true)
    window.addEventListener('mousedown', down, true)
    return () => {
      window.removeEventListener('keydown', key, true)
      window.removeEventListener('mousedown', down, true)
    }
  }, [shown, spots])

  // A comment the field holds that has gone — resolved elsewhere, edited away — closes it.
  const editingSpot = editing ? spots.find((s) => s.key === editing) : null
  useEffect(() => {
    if (editing && spots.length && !editingSpot) onClose()
  }, [editing, editingSpot, spots, onClose])

  const width = Math.min(CARD_MAX, geo.gutter - GAP - 18)
  const under = Math.min(380, geo.right - geo.left)
  const read = shown && !geo.room ? spots.find((s) => s.key === shown) : null
  const theField = (old: boolean): React.JSX.Element | null =>
    field ? (
      <CommentField
        key={field.kind === 'old' ? field.key : `new:${field.top}`}
        initial={field.kind === 'old' ? field.text : ''}
        words={field.words}
        old={old}
        onSubmit={onSubmit}
        onResolve={onResolve}
        onClose={onClose}
      />
    ) : null
  if (!spots.length && !field) return null
  return (
    <div ref={layer} data-cmt-layer="1" style={{ position: 'absolute', top: 0, left: 0, width: 0, height: 0, zIndex: 3 }}>
      {geo.room
        ? spots.map((s) => (
            <div
              key={s.key}
              ref={(el) => {
                if (el) cards.current.set(s.key, el)
                else cards.current.delete(s.key)
              }}
              data-cmt-card={s.key}
              className={editing === s.key ? 'cmt-slot' : hot === s.key ? 'cmt-card cmt-card-hot' : 'cmt-card'}
              onMouseEnter={() => setHot(s.key)}
              onMouseLeave={() => setHot((was) => (was === s.key ? null : was))}
              onClick={() => {
                if (editing !== s.key) onOpen?.(s.key, s.text)
              }}
              style={{
                position: 'absolute',
                top: 0,
                left: geo.right + GAP,
                width,
                cursor: onOpen ? 'pointer' : undefined,
                transform: `translateY(${s.top - 3}px)`
              }}
            >
              {editing === s.key ? theField(true) : s.text || <span style={{ color: 'var(--faint)' }}>No words</span>}
            </div>
          ))
        : null}
      {/* Where there is no margin, an opened comment is a field under its line. */}
      {!geo.room && editingSpot ? (
        <div style={{ position: 'absolute', top: editingSpot.bottom + 6, left: geo.left, width: under }}>{theField(true)}</div>
      ) : null}
      {/* A new comment: a field under the words it will be about. */}
      {field?.kind === 'new' ? (
        <div style={{ position: 'absolute', top: field.top + 6, left: geo.left, width: under }}>{theField(false)}</div>
      ) : null}
      {read ? (
        <div
          data-cmt-card={read.key}
          data-cmt-under="1"
          className="cmt-card cmt-card-under"
          style={{ position: 'absolute', top: read.bottom + 6, left: geo.left, width: under }}
        >
          {read.text || <span style={{ color: 'var(--faint)' }}>No words</span>}
        </div>
      ) : null}
    </div>
  )
}

/**
 * THE FIELD A COMMENT IS WRITTEN IN. One line of plain text, which is all a
 * comment is: ↵ writes it, and a line break typed or pasted is a space.
 *
 * Esc closes it — with words typed that it would throw away, it asks first,
 * and the answer the focus rests on is the one that loses nothing. Esc in the
 * question is no, so esc, esc, esc opens and closes it and never discards, and
 * a held esc is one press. Discarding is a click, or ⌘⌫. A press anywhere else
 * leaves the way esc does.
 */
function CommentField({
  initial,
  words,
  old,
  onSubmit,
  onResolve,
  onClose
}: {
  initial: string
  words: string | null
  /** A comment already written, which the field can resolve. */
  old: boolean
  onSubmit: (text: string) => void
  onResolve: () => void
  onClose: () => void
}): React.JSX.Element {
  const [text, setText] = useState(initial)
  const [asking, setAsking] = useState(false)
  const box = useRef<HTMLTextAreaElement>(null)
  const keep = useRef<HTMLButtonElement>(null)
  const root = useRef<HTMLDivElement>(null)
  const changed = text.trim() !== initial.trim()
  const leave = (): void => (changed ? setAsking(true) : onClose())
  const leaveRef = useRef(leave)
  leaveRef.current = leave

  useLayoutEffect(() => {
    const el = box.current
    if (!el) return
    el.focus()
    el.setSelectionRange(el.value.length, el.value.length)
  }, [])
  useEffect(() => {
    if (asking) keep.current?.focus()
    else box.current?.focus()
  }, [asking])
  // Its height, its words': a long comment wraps rather than scrolling sideways.
  useLayoutEffect(() => {
    const el = box.current
    if (!el) return
    el.style.height = '0px'
    el.style.height = `${el.scrollHeight}px`
  }, [text])
  // A press anywhere else leaves the way esc does.
  useEffect(() => {
    const down = (e: MouseEvent): void => {
      if (root.current?.contains(e.target as Node)) return
      leaveRef.current()
    }
    window.addEventListener('mousedown', down, true)
    return () => window.removeEventListener('mousedown', down, true)
  }, [])

  const keys = (e: React.KeyboardEvent): void => {
    // Its own keys: nothing here is the note's, or the window's, to act on.
    e.stopPropagation()
    if (asking) {
      if (e.key === 'Escape') {
        e.preventDefault()
        if (!e.repeat) setAsking(false)
      } else if (e.key === 'Backspace' && e.metaKey) {
        e.preventDefault()
        onClose()
      }
      return
    }
    if (e.key === 'Escape') {
      e.preventDefault()
      if (!e.repeat) leave()
    } else if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault()
      if (text.trim()) onSubmit(text)
      else leave()
    }
  }

  return (
    <div ref={root} data-cmt-field={old ? 'old' : 'new'} className="cmt-card cmt-field" onKeyDown={keys}>
      {words ? (
        <div className="cmt-field-on">
          On <span>“{words}”</span>
        </div>
      ) : null}
      <textarea
        ref={box}
        value={text}
        rows={1}
        spellCheck
        placeholder={old ? 'Say something, or resolve it' : 'Comment'}
        onChange={(e) => setText(e.target.value.replace(/\s*\n\s*/g, ' '))}
      />
      <div className="cmt-field-foot">
        {old ? (
          <button type="button" data-cmt-resolve="1" className="cmt-resolve" onClick={onResolve} title="Resolve: the comment goes, its words stay">
            ✓ Resolve
          </button>
        ) : null}
        <span style={{ flex: 1 }} />
        <span className="cmt-field-hint">↵ {old ? 'save' : 'comment'} · esc</span>
      </div>
      {asking ? (
        <div data-cmt-ask="1" role="alertdialog" aria-label="Discard what you wrote?" className="cmt-ask">
          <span>Discard what you wrote?</span>
          <span style={{ flex: 1 }} />
          <button type="button" ref={keep} data-cmt-keep="1" onClick={() => setAsking(false)}>
            Keep writing
          </button>
          <button type="button" data-cmt-discard="1" className="cmt-discard" onClick={onClose}>
            Discard
          </button>
        </div>
      ) : null}
    </div>
  )
}
