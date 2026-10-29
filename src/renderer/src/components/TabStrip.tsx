import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { TabState } from '../state/pane'

interface Props {
  tabs: TabState[]
  active: number
  /** The reading measure, so the strip aligns to the column beneath it. */
  measure: number
  /** The pane's own gutter — the same one the head and body use. */
  padX: string
  /** "Thread · Garden — Spring beds", the tab's own tooltip. */
  titleOf: (tab: TabState) => string
  /** Whether the object behind this tab is starred, for the menu's wording. */
  starredOf: (tab: TabState) => boolean
  onSelect: (i: number) => void
  onClose: (i: number) => void
  onCloseOthers: (i: number) => void
  onPlus: () => void
  onTogglePin: (i: number) => void
  onToggleStar: (i: number) => void
  /** Threads only — a note's title is its first heading, and the file's name. */
  onRename: (i: number) => void
  /** Notes only — the note behind the tab, in the Finder. */
  onReveal: (i: number) => void
  /** Reorder within this strip. `to` is an insertion index into the current array. */
  onReorder: (from: number, to: number) => void
}

/**
 * Two characters of mono, which is enough to tell your own parked tabs apart
 * and holds the strip open for the working ones instead of spending 130px on a
 * title you already know.
 */
function monogram(title: string): string {
  const words = String(title)
    .replace(/[^0-9a-z\s]/gi, ' ')
    .trim()
    .split(/\s+/)
  if (!words[0]) return '··'
  if (/\d/.test(words[0]) && words[0].length > 1) return words[0].slice(0, 2).toUpperCase()
  if (words.length > 1 && words[1]) return (words[0][0] + words[1][0]).toUpperCase()
  return words[0].slice(0, 2).toUpperCase()
}

const TITLE_MIN = 96
const GAP = 19
const PIN_GAP = 13
/** How far a press moves before it is a drag rather than a click. */
const SLOP = 5
/** How near an edge a dragged tab scrolls the row. */
const EDGE = 40
/** How long a dropped tab takes to settle into its gap. */
const SETTLE = 140

/** What of the row is out of sight. */
interface View {
  over: boolean
  left: boolean
  right: boolean
  /** The nearest tab past each edge with an answer waiting, by its real index; -1 for none. */
  unseenLeft: number
  unseenRight: number
  /** The row's drawn width, where the right edge's dot goes. */
  width: number
}
const NO_VIEW: View = { over: false, left: false, right: false, unseenLeft: -1, unseenRight: -1, width: 0 }
const sameView = (a: View, b: View): boolean =>
  a.over === b.over &&
  a.left === b.left &&
  a.right === b.right &&
  a.unseenLeft === b.unseenLeft &&
  a.unseenRight === b.unseenRight &&
  a.width === b.width

/** A tab of the dragged group as it stood when the drag began. */
interface Slot {
  key: string
  real: number
  left: number
  width: number
}
/** What the row draws while a tab is dragged. */
interface Drag {
  key: string
  group: Slot[]
  from: number
  /** How far the dragged tab is drawn from where it stood. */
  dx: number
  /** Where it would land, among the others of its group. */
  to: number
  settling: boolean
}
/** The press behind a drag, as the pointer moves. */
interface Grip {
  key: string
  from: number
  group: Slot[]
  startX: number
  startScroll: number
  x: number
  moved: boolean
  to: number
  raf: number
}

/**
 * Where every tab of a group stands once the one at `from` is put at `to`
 * among the others: laid out from the group's first left edge, a gap apart —
 * which is where the row will draw them when the new order is taken.
 */
function lefts(group: Slot[], from: number, to: number): Map<string, number> {
  const others = group.filter((_, k) => k !== from)
  const seq = [...others.slice(0, to), group[from], ...others.slice(to)]
  const out = new Map<string, number>()
  let x = group[0]?.left ?? 0
  for (const s of seq) {
    out.set(s.key, x)
    x += s.width + GAP
  }
  return out
}

/** A tab out of sight with an answer waiting: its dot, at the edge it is past. */
function EdgeDot({ side, at, onClick }: { side: 'left' | 'right'; at: number; onClick: () => void }): React.JSX.Element {
  return (
    <div
      data-tab-edge={side}
      onClick={(e) => {
        e.stopPropagation()
        onClick()
      }}
      title="An answer is waiting in a tab out of sight — show it"
      style={{
        position: 'absolute',
        left: side === 'left' ? at - 9 : at - 3,
        bottom: 6,
        width: 12,
        height: 12,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'pointer',
        zIndex: 3
      }}
    >
      <div
        style={{
          width: 6,
          height: 6,
          borderRadius: 99,
          background: 'var(--ink)',
          boxShadow: '0 0 0 3px color-mix(in srgb, var(--ink) 13%, transparent)',
          animation: 'dotArrive .42s cubic-bezier(.2,.9,.3,1)'
        }}
      />
    </div>
  )
}

/**
 * The tab strip.
 *
 * The underline is the ONLY active mark. Pinned and loose tabs therefore never
 * disagree about what "current" means — which is exactly what a fill would have
 * let them do, since a pinned tab is too narrow to wear one convincingly.
 *
 * Pinned tabs are a group rather than a badge: fixed at the left in pin order,
 * collapsed to a monogram, and carrying no ✕, because closing a parked tab is a
 * right-click decision and not a stray click.
 *
 * TITLES, THEN A SCROLL.
 *
 * The strip used to shed: as it filled, tabs collapsed to two-character
 * monograms so that none was ever scrolled out of sight. That spent the one
 * thing a tab is for — saying which one it is — on exactly the strips that had
 * the most tabs to tell apart. Now a tab keeps its title down to a readable
 * 96px, and past that the row scrolls sideways, by a swipe or the wheel. What
 * shedding protected is kept another way: a tab out of sight with an answer
 * waiting puts its dot at that edge, and the dot takes you to it; an edge with
 * more beyond it fades; and the counted chip — every tab in the pane, by name —
 * is there whenever anything is out of sight. The tab you are in is always in.
 *
 * DRAGGED, IT MAKES ROOM. A press that moves a few pixels picks the tab up: it
 * follows the pointer — wherever the pointer goes, above or below the row — and
 * the tabs it passes slide aside to show where it would land, decided by where
 * the tab is rather than by a precise spot under the pointer. Near an edge the
 * row scrolls under it. Let go and it settles into the gap; esc puts it back.
 * Pinned tabs move among pinned ones, the rest among the rest.
 */
export default function TabStrip(p: Props): React.JSX.Element {
  const track = useRef<HTMLDivElement>(null)
  const [menu, setMenu] = useState<{ i: number; x: number; y: number } | null>(null)

  // Display order: pinned first, then the rest. Every handler keeps the tab's
  // REAL index, so reordering the display cannot misroute a close or a pin.
  const order = p.tabs
    .map((t, i) => ({ t, i }))
    .sort((a, b) => Number(b.t.pinned) - Number(a.t.pinned))
  const firstLoose = order.findIndex((x) => !x.t.pinned)
  const anyPinned = order.some((x) => x.t.pinned)

  /* ---------- what is out of sight ---------- */

  const [view, setView] = useState<View>(NO_VIEW)
  const look = useCallback((): void => {
    const box = track.current
    if (!box) return
    const room = box.scrollWidth - box.clientWidth
    const at = box.scrollLeft
    let unseenLeft = -1
    let unseenRight = -1
    for (const el of box.querySelectorAll<HTMLElement>('[data-tab]')) {
      if (el.dataset.tabWaiting !== '1') continue
      const mid = el.offsetLeft + el.offsetWidth / 2
      // The nearest on each side: the last one past the left edge, the first past the right.
      if (mid < at) unseenLeft = Number(el.dataset.tabIndex)
      else if (mid > at + box.clientWidth && unseenRight < 0) unseenRight = Number(el.dataset.tabIndex)
    }
    const next: View = { over: room > 1, left: at > 1, right: at < room - 1, unseenLeft, unseenRight, width: box.offsetWidth }
    setView((was) => (sameView(was, next) ? was : next))
  }, [])
  useLayoutEffect(look, [look, p.tabs, p.active])
  useEffect(() => {
    const box = track.current
    if (!box) return
    const ro = new ResizeObserver(look)
    ro.observe(box)
    return () => ro.disconnect()
  }, [look])

  /** Bring a tab into view, a little air past it, without jumping. */
  const reveal = useCallback((el: HTMLElement | null | undefined, smooth = true): void => {
    const box = track.current
    if (!el || !box) return
    const left = el.offsetLeft
    const right = left + el.offsetWidth
    const to =
      left < box.scrollLeft
        ? Math.max(0, left - 24)
        : right > box.scrollLeft + box.clientWidth
          ? right - box.clientWidth + 24
          : null
    if (to !== null) box.scrollTo({ left: to, behavior: smooth ? 'smooth' : 'auto' })
  }, [])

  /** Keep the active tab in view — including when the pane, not the strip, narrows. */
  useEffect(() => {
    reveal(track.current?.querySelector<HTMLElement>('[data-tab-on="1"]'))
  }, [p.active, p.tabs.length, reveal])
  useEffect(() => {
    if (!track.current) return
    const ro = new ResizeObserver(() => reveal(track.current?.querySelector<HTMLElement>('[data-tab-on="1"]'), false))
    ro.observe(track.current)
    return () => ro.disconnect()
  }, [reveal])

  /*
   * A wheel turned over the row scrolls it sideways: a mouse has no sideways
   * wheel, and the row has nothing to scroll the other way. A trackpad's
   * sideways swipe scrolls it as it is.
   */
  useEffect(() => {
    const box = track.current
    if (!box) return
    const onWheel = (e: WheelEvent): void => {
      if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return
      if (box.scrollWidth - box.clientWidth <= 1) return
      box.scrollLeft += e.deltaY
      e.preventDefault()
    }
    box.addEventListener('wheel', onWheel, { passive: false })
    return () => box.removeEventListener('wheel', onWheel)
  }, [])

  /* ---------- the drag ---------- */

  const [drag, setDrag] = useState<Drag | null>(null)
  const grip = useRef<Grip | null>(null)
  /** A press that became a drag is not also a click on the tab it picked up. */
  const dragged = useRef(false)
  const reorder = useRef(p.onReorder)
  reorder.current = p.onReorder

  const press = (e: React.PointerEvent<HTMLElement>, key: string): void => {
    if (e.button !== 0 || grip.current || (e.target as Element).closest('[data-x]')) return
    const box = track.current
    if (!box) return
    const els = [...box.querySelectorAll<HTMLElement>('[data-tab]')]
    const mine = els.find((el) => el.dataset.tabKey === key)
    if (!mine) return
    const pinned = mine.dataset.tabPinned === '1'
    const group = els
      .filter((el) => (el.dataset.tabPinned === '1') === pinned)
      .map((el) => ({
        key: el.dataset.tabKey ?? '',
        real: Number(el.dataset.tabIndex),
        left: el.offsetLeft,
        width: el.offsetWidth
      }))
    const from = group.findIndex((s) => s.key === key)
    const g: Grip = { key, from, group, startX: e.clientX, startScroll: box.scrollLeft, x: e.clientX, moved: false, to: from, raf: 0 }
    grip.current = g

    /** Where the tab is, for where the pointer is now, and where it would land. */
    const place = (): void => {
      const s = g.group[g.from]
      const first = g.group[0]
      const last = g.group[g.group.length - 1]
      // It stays within its own group, so the pointer can wander and the tab cannot.
      const left = Math.max(first.left, Math.min(last.left + last.width - s.width, s.left + g.x - g.startX + box.scrollLeft - g.startScroll))
      // A tab gives way once the dragged one's leading edge is past its middle
      // — not the dragged one's own middle, which a wide tab could never get
      // past a narrow one at the end of the row.
      const right = left + s.width
      g.to = g.group.filter((o, k) => {
        if (k === g.from) return false
        const mid = o.left + o.width / 2
        return k < g.from ? mid <= left : mid < right
      }).length
      setDrag({ key, group: g.group, from: g.from, dx: left - s.left, to: g.to, settling: false })
    }
    /** Near an edge, the row scrolls under the tab: faster the nearer. */
    const edge = (): void => {
      const r = box.getBoundingClientRect()
      const near = g.x < r.left + EDGE ? g.x - (r.left + EDGE) : g.x > r.right - EDGE ? g.x - (r.right - EDGE) : 0
      if (near) {
        const before = box.scrollLeft
        box.scrollLeft += Math.max(-14, Math.min(14, near / 3))
        if (box.scrollLeft !== before) place()
      }
      g.raf = requestAnimationFrame(edge)
    }
    const move = (ev: PointerEvent): void => {
      g.x = ev.clientX
      if (!g.moved) {
        if (Math.abs(g.x - g.startX) < SLOP) return
        g.moved = true
        document.body.style.cursor = 'grabbing'
        g.raf = requestAnimationFrame(edge)
      }
      place()
    }
    const end = (keep: boolean): void => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', cancel)
      window.removeEventListener('keydown', esc, true)
      cancelAnimationFrame(g.raf)
      document.body.style.cursor = ''
      if (!g.moved) {
        grip.current = null
        return
      }
      dragged.current = true
      const to = keep ? g.to : g.from
      const s = g.group[g.from]
      const landed = (lefts(g.group, g.from, to).get(key) ?? s.left) - s.left
      // Settle into the gap, then take the new order — by then every tab is
      // already drawn where the new order puts it, so nothing jumps.
      setDrag({ key, group: g.group, from: g.from, dx: landed, to, settling: true })
      window.setTimeout(() => {
        grip.current = null
        dragged.current = false
        if (to !== g.from) {
          const others = g.group.filter((_, k) => k !== g.from)
          const real = to >= others.length ? others[others.length - 1].real + 1 : others[to].real
          reorder.current(s.real, real)
        }
        setDrag(null)
      }, SETTLE)
    }
    const up = (): void => end(true)
    const cancel = (): void => end(false)
    const esc = (ev: KeyboardEvent): void => {
      if (ev.key !== 'Escape' || !g.moved) return
      ev.preventDefault()
      ev.stopPropagation()
      end(false)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', cancel)
    window.addEventListener('keydown', esc, true)
  }

  /** Where each tab of the dragged group is drawn, as an offset from where it stands. */
  const landing = drag ? lefts(drag.group, drag.from, drag.to) : null
  const shift = (key: string): React.CSSProperties => {
    if (!drag || !landing) return {}
    const k = drag.group.findIndex((s) => s.key === key)
    if (k < 0) return {}
    if (key === drag.key)
      return {
        transform: `translateX(${drag.dx}px)`,
        transition: drag.settling ? `transform ${SETTLE}ms cubic-bezier(.2,.8,.2,1)` : 'none',
        position: 'relative',
        zIndex: 2,
        opacity: drag.settling ? 1 : 0.92,
        cursor: 'grabbing'
      }
    const by = (landing.get(key) ?? drag.group[k].left) - drag.group[k].left
    return { transform: by ? `translateX(${by}px)` : undefined, transition: 'transform 180ms cubic-bezier(.2,.8,.2,1)' }
  }

  /** Where the list hangs: the chip's own bottom-right corner. */
  const [listOpen, setListOpen] = useState<{ x: number; y: number } | null>(null)
  useEffect(() => {
    if (!view.over) setListOpen(null)
  }, [view.over])

  useEffect(() => {
    if (!menu) return
    const off = (): void => setMenu(null)
    window.addEventListener('mousedown', off)
    window.addEventListener('keydown', off)
    return () => {
      window.removeEventListener('mousedown', off)
      window.removeEventListener('keydown', off)
    }
  }, [menu])

  // An edge with more beyond it fades, so a tab half out of sight reads as going on.
  const fade = `linear-gradient(to right, ${view.left ? 'transparent 0, #000 28px' : '#000 0'}, ${view.right ? '#000 calc(100% - 28px), transparent 100%' : '#000 100%'})`

  return (
    <div
      style={{
        flex: 'none',
        display: 'flex',
        justifyContent: 'center',
        padding: `15px ${p.padX} 0`
      }}
    >
      {/* The row: the column the strip stands on. The tabs scroll inside it;
          the chip and the + stay put at its end. */}
      <div
        data-tabrow="1"
        style={{
          width: '100%',
          maxWidth: p.measure,
          display: 'flex',
          alignItems: 'flex-end',
          gap: GAP,
          position: 'relative'
        }}
      >
        <div
          ref={track}
          data-tabstrip="1"
          onScroll={look}
          style={{
            flex: '0 1 auto',
            minWidth: 0,
            display: 'flex',
            alignItems: 'flex-end',
            gap: GAP,
            position: 'relative',
            overflowX: 'auto',
            overflowY: 'hidden',
            userSelect: 'none',
            maskImage: view.left || view.right ? fade : undefined
          }}
        >
          {order.map(({ t, i }, slot) => {
            const on = i === p.active
            const isNote = t.kind === 'note'
            // Pinned tabs wear a monogram; every other tab keeps its words.
            const mono = t.pinned
            return (
              <div
                key={t.key}
                data-tab="1"
                data-tab-on={on ? '1' : '0'}
                data-tab-key={t.key}
                data-tab-index={i}
                data-tab-pinned={t.pinned ? '1' : '0'}
                data-tab-waiting={!on && t.unseen ? '1' : '0'}
                data-tab-dragging={drag?.key === t.key ? '1' : undefined}
                onPointerDown={(e) => press(e, t.key)}
                onClick={() => {
                  if (dragged.current) return
                  p.onSelect(i)
                }}
                onContextMenu={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  setMenu({ i, x: e.clientX, y: e.clientY })
                }}
                title={p.titleOf(t)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  maxWidth: mono ? 'none' : 180,
                  // Held at a readable width as the row fills — but a short
                  // title is never padded out to it.
                  minWidth: mono ? 0 : Math.min(TITLE_MIN, Math.round(40 + [...t.title].length * 6.6)),
                  flex: mono ? '0 0 auto' : '1 1 auto',
                  // Extra air rather than a rule: spacing is how everything else
                  // in this design groups.
                  marginLeft: slot === firstLoose && anyPinned ? PIN_GAP : 0,
                  paddingBottom: 7,
                  borderBottom: `1px solid ${on ? 'var(--ink)' : 'transparent'}`,
                  cursor: 'pointer',
                  ...shift(t.key)
                }}
              >
                {isNote ? (
                  <div
                    style={{
                      width: 3,
                      height: 11,
                      borderRadius: 1,
                      background: on ? 'var(--ink)' : 'var(--dot)',
                      flex: 'none'
                    }}
                  />
                ) : (
                  <div
                    data-tab-unseen={t.unseen ? '1' : '0'}
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: 99,
                      /*
                       * ONE GLYPH, FOUR STATES. The strip has no spare slot at
                       * this width and the dot is the one thing every chat tab
                       * carries, so it says all of it:
                       *
                       *   quiet dot    nothing to report
                       *   blinking     mid-turn
                       *   ink + halo   an answer landed while you were elsewhere
                       *   ink          this is the tab you are on
                       *
                       * The unseen state is the same ink the active tab uses,
                       * with a soft ring around it — loud enough to find by
                       * scanning the strip, quiet enough that a row of them is
                       * not an alarm.
                       */
                      background: on || t.unseen ? 'var(--ink)' : 'var(--dot)',
                      boxShadow: t.unseen
                        ? '0 0 0 3px color-mix(in srgb, var(--ink) 13%, transparent)'
                        : undefined,
                      flex: 'none',
                      animation: t.pending
                        ? 'cursorBlink 1.4s ease-in-out infinite'
                        : t.unseen
                          ? 'dotArrive .42s cubic-bezier(.2,.9,.3,1)'
                          : undefined
                    }}
                  />
                )}

                {mono ? (
                  <div
                    data-tab-mono="1"
                    style={{
                      font: '600 9.5px var(--mono)',
                      letterSpacing: '.06em',
                      color: on ? 'var(--ink)' : t.unseen ? 'var(--ink2)' : 'var(--mute)',
                      flex: 'none'
                    }}
                  >
                    {monogram(t.title)}
                  </div>
                ) : (
                  <div
                    data-tab-title="1"
                    style={{
                      flex: 1,
                      minWidth: 0,
                      font: `${on || t.unseen ? 500 : 400} 11.5px var(--sans)`,
                      // A tab with something waiting on it reads a step nearer
                      // than the ones that have nothing.
                      color: on ? 'var(--ink)' : t.unseen ? 'var(--ink2)' : 'var(--mute)',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis'
                    }}
                  >
                    {t.title}
                  </div>
                )}

                {!mono ? (
                  <div
                    data-x="1"
                    onClick={(e) => {
                      e.stopPropagation()
                      p.onClose(i)
                    }}
                    title="Close · ⌘W"
                    className="tab-x"
                    style={{
                      width: 15,
                      height: 15,
                      borderRadius: 4,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      font: '400 11px var(--sans)',
                      color: 'var(--mute)',
                      flex: 'none'
                    }}
                  >
                    ×
                  </div>
                ) : null}
              </div>
            )
          })}
        </div>

        {/*
         * AN ANSWER OUT OF SIGHT is a dot at that edge — the dot a tab in view
         * would wear — and the dot brings the tab into view.
         */}
        {view.unseenLeft >= 0 ? (
          <EdgeDot
            side="left"
            at={0}
            onClick={() => reveal(track.current?.querySelector<HTMLElement>(`[data-tab-index="${view.unseenLeft}"]`))}
          />
        ) : null}
        {view.unseenRight >= 0 ? (
          <EdgeDot
            side="right"
            at={view.width}
            onClick={() => reveal(track.current?.querySelector<HTMLElement>(`[data-tab-index="${view.unseenRight}"]`))}
          />
        ) : null}

        {/*
         * WHENEVER ANYTHING IS OUT OF SIGHT, the chip says how many tabs the
         * pane holds and opens all of them by name — the row's index.
         */}
        {view.over ? (
          <div
            data-tab-count="1"
            onClick={(e) => {
              e.stopPropagation()
              const box = e.currentTarget.getBoundingClientRect()
              setListOpen((was) => (was ? null : { x: box.right, y: box.bottom + 7 }))
            }}
            title={`${p.tabs.length} tabs — open the list`}
            className="tab-count"
            style={{
              height: 15,
              marginBottom: 7,
              padding: '0 5px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: 4,
              border: `1px solid ${listOpen ? 'var(--ink)' : 'var(--edge)'}`,
              background: listOpen ? 'var(--ink)' : 'transparent',
              color: listOpen ? 'var(--onInk)' : 'var(--mute)',
              font: '500 8.5px var(--mono)',
              letterSpacing: '.08em',
              cursor: 'pointer',
              flex: 'none'
            }}
          >
            {p.tabs.length}
          </div>
        ) : null}

        <div
          onClick={(e) => {
            e.stopPropagation()
            p.onPlus()
          }}
          title="Open something else · ⌘K"
          style={{
            width: 15,
            height: 15,
            marginBottom: 7,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            flex: 'none'
          }}
        >
          <svg
            width="11"
            height="11"
            viewBox="0 0 14 14"
            fill="none"
            stroke="var(--mute)"
            strokeWidth="1.4"
            strokeLinecap="round"
          >
            <path d="M7 3.2v7.6M3.2 7h7.6" />
          </svg>
        </div>
      </div>

      {listOpen ? (
        <TabList
          x={listOpen.x}
          y={listOpen.y}
          order={order}
          active={p.active}
          titleOf={p.titleOf}
          onSelect={(i) => {
            p.onSelect(i)
            setListOpen(null)
          }}
          onClose={(i) => p.onClose(i)}
          onDismiss={() => setListOpen(null)}
        />
      ) : null}

      {menu ? (
        <TabMenu
          x={menu.x}
          y={menu.y}
          pinned={p.tabs[menu.i]?.pinned ?? false}
          starred={p.tabs[menu.i] ? p.starredOf(p.tabs[menu.i]) : false}
          kind={p.tabs[menu.i]?.kind ?? 'chat'}
          many={p.tabs.length > 1}
          onRename={() => {
            p.onRename(menu.i)
            setMenu(null)
          }}
          onReveal={() => {
            p.onReveal(menu.i)
            setMenu(null)
          }}
          onPin={() => {
            p.onTogglePin(menu.i)
            setMenu(null)
          }}
          onStar={() => {
            p.onToggleStar(menu.i)
            setMenu(null)
          }}
          onClose={() => {
            p.onClose(menu.i)
            setMenu(null)
          }}
          onCloseOthers={() => {
            p.onCloseOthers(menu.i)
            setMenu(null)
          }}
        />
      ) : null}
    </div>
  )
}

/**
 * EVERY TAB IN THE PANE, BY NAME.
 *
 * Offered whenever the row is scrolled past something. It lists the whole
 * strip rather than only what is out of sight, so it is one place that always
 * says the same thing rather than a list whose contents depend on how far the
 * row happens to be scrolled.
 *
 * Display order, so the row and the list agree; the active one is marked the
 * same way the strip marks it, in ink.
 */
function TabList({
  x,
  y,
  order,
  active,
  titleOf,
  onSelect,
  onClose,
  onDismiss
}: {
  x: number
  y: number
  order: { t: TabState; i: number }[]
  active: number
  titleOf: (tab: TabState) => string
  onSelect: (i: number) => void
  onClose: (i: number) => void
  onDismiss: () => void
}): React.JSX.Element {
  useEffect(() => {
    const off = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onDismiss()
      }
    }
    window.addEventListener('keydown', off, true)
    return () => window.removeEventListener('keydown', off, true)
  }, [onDismiss])

  const WIDTH = 262
  return (
    <>
      <div style={{ position: 'fixed', inset: 0, zIndex: 50 }} onMouseDown={onDismiss} />
      <div
        data-tab-list="1"
        style={{
          position: 'fixed',
          left: Math.max(8, Math.min(x - WIDTH, window.innerWidth - WIDTH - 8)),
          top: Math.min(y, window.innerHeight - 120),
          zIndex: 51,
          width: WIDTH,
          maxHeight: Math.max(140, window.innerHeight - y - 16),
          overflowY: 'auto',
          borderRadius: 9,
          background: 'var(--sheet)',
          boxShadow: 'var(--sh4)',
          padding: 5,
          animation: 'riseIn .12s ease-out'
        }}
      >
        {order.map(({ t, i }) => (
          <TabListRow
            key={t.key}
            tab={t}
            on={i === active}
            title={titleOf(t)}
            onSelect={() => onSelect(i)}
            onClose={() => onClose(i)}
          />
        ))}
      </div>
    </>
  )
}

function TabListRow({
  tab,
  on,
  title,
  onSelect,
  onClose
}: {
  tab: TabState
  on: boolean
  title: string
  onSelect: () => void
  onClose: () => void
}): React.JSX.Element {
  const [hov, setHov] = useState(false)
  return (
    <div
      data-tab-list-row="1"
      data-tab-list-on={on ? '1' : '0'}
      onMouseDown={(e) => {
        e.stopPropagation()
        onSelect()
      }}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      title={title}
      style={{
        height: 27,
        display: 'flex',
        alignItems: 'center',
        gap: 9,
        padding: '0 9px',
        borderRadius: 6,
        cursor: 'pointer',
        background: hov ? 'var(--bubble)' : 'transparent'
      }}
    >
      {/* The same two glyphs the strip draws, so a row and its tab match. */}
      {tab.kind === 'note' ? (
        <div
          style={{
            width: 3,
            height: 11,
            borderRadius: 1,
            background: on ? 'var(--ink)' : 'var(--dot)',
            flex: 'none'
          }}
        />
      ) : (
        <div
          style={{
            width: 6,
            height: 6,
            borderRadius: 99,
            background: on || tab.unseen ? 'var(--ink)' : 'var(--dot)',
            boxShadow: tab.unseen
              ? '0 0 0 3px color-mix(in srgb, var(--ink) 13%, transparent)'
              : undefined,
            flex: 'none',
            animation: tab.pending ? 'cursorBlink 1.4s ease-in-out infinite' : undefined
          }}
        />
      )}
      <div
        style={{
          flex: 1,
          minWidth: 0,
          font: `${on || tab.unseen ? 500 : 400} 11.5px var(--sans)`,
          color: on ? 'var(--ink)' : tab.unseen ? 'var(--ink2)' : 'var(--ink2)',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis'
        }}
      >
        {tab.title}
      </div>
      {tab.pinned ? (
        <div style={{ font: '400 8px var(--mono)', letterSpacing: '.12em', color: 'var(--faint)', flex: 'none' }}>
          PINNED
        </div>
      ) : (
        <div
          data-tab-list-x="1"
          onMouseDown={(e) => {
            e.stopPropagation()
            onClose()
          }}
          title="Close · ⌘W"
          className="tab-x"
          style={{
            width: 15,
            height: 15,
            borderRadius: 4,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            font: '400 11px var(--sans)',
            color: 'var(--mute)',
            flex: 'none'
          }}
        >
          ×
        </div>
      )}
    </div>
  )
}

/**
 * Pin and star are different concepts and must use different words. PIN belongs
 * to a tab — a strip decision, keyed by the tab. STAR belongs to the object — a
 * library decision, keyed by its id, and what the Starred rail reads. Sharing
 * one verb across both would silently merge them in the only place anyone meets
 * them: these labels.
 */
function TabMenu({
  x,
  y,
  pinned,
  starred,
  kind,
  many,
  onRename,
  onReveal,
  onPin,
  onStar,
  onClose,
  onCloseOthers
}: {
  x: number
  y: number
  pinned: boolean
  starred: boolean
  kind: 'chat' | 'note'
  many: boolean
  onRename: () => void
  onReveal: () => void
  onPin: () => void
  onStar: () => void
  onClose: () => void
  onCloseOthers: () => void
}): React.JSX.Element {
  const items: { label: string; keys?: string; act: () => void }[] = [
    // Both kinds now: a thread's name is an override the app keeps, and a
    // note's is its first heading and its filename — different underneath, the
    // same thing to ask for.
    { label: 'Rename…', act: onRename },
    { label: pinned ? 'Unpin tab' : 'Pin tab', act: onPin },
    {
      label: `${starred ? 'Unstar' : 'Star'} this ${kind === 'note' ? 'note' : 'thread'}`,
      act: onStar
    },
    // Notes only: a thread is a transcript in the CLI's own store, not a thing
    // the reader keeps in a folder.
    ...(kind === 'note' ? [{ label: 'Show in Finder', act: onReveal }] : []),
    { label: 'Close', keys: '⌘W', act: onClose }
  ]
  if (many) items.push({ label: 'Close others', act: onCloseOthers })

  return (
    <>
      {/* A full-viewport catcher, so a click anywhere dismisses rather than
          falling through to whatever it landed on. */}
      <div style={{ position: 'fixed', inset: 0, zIndex: 50 }} onContextMenu={(e) => e.preventDefault()} />
      <div
        style={{
          position: 'fixed',
          left: Math.min(x, window.innerWidth - 190),
          top: Math.min(y, window.innerHeight - 150),
          zIndex: 51,
          minWidth: 172,
          borderRadius: 9,
          background: 'var(--sheet)',
          boxShadow: 'var(--sh4)',
          padding: 5,
          animation: 'riseIn .12s ease-out'
        }}
      >
        {items.map((it) => (
          <MenuItem key={it.label} label={it.label} keys={it.keys} onClick={it.act} />
        ))}
      </div>
    </>
  )
}

function MenuItem({
  label,
  keys,
  onClick
}: {
  label: string
  keys?: string
  onClick: () => void
}): React.JSX.Element {
  const [hov, setHov] = useState(false)
  return (
    <div
      onMouseDown={(e) => {
        e.stopPropagation()
        onClick()
      }}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        height: 27,
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '0 9px',
        borderRadius: 6,
        cursor: 'pointer',
        background: hov ? 'var(--bubble)' : 'transparent'
      }}
    >
      <div style={{ flex: 1, minWidth: 0, font: '400 11.5px var(--sans)', color: 'var(--ink2)' }}>
        {label}
      </div>
      {keys ? (
        <div style={{ font: '400 9.5px var(--mono)', color: 'var(--faint)', flex: 'none' }}>
          {keys}
        </div>
      ) : null}
    </div>
  )
}
