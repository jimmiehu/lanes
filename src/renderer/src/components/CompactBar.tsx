import React, { useEffect, useRef, useState } from 'react'
import { Caret, HeadButton } from './PaneHeader'

/**
 * The title bar that appears once the real head has scrolled out of the
 * scrollport.
 *
 * Driven by an IntersectionObserver rooted at the scroller, NOT by a scroll
 * handler. The offset changes for reasons that fire no scroll event at all —
 * the browser clamping scrollTop when you switch to a shorter document, the
 * pane resizing as the rail opens, several offsets coalescing into one event —
 * and a handler would miss every one of them.
 *
 * The flag is also never derived from its own previous value. Hysteresis that
 * reads its own output is an edge detector feeding its own input: one missed
 * crossing and it is stuck inverted for good.
 */
export function useScrolledPastHead(
  scroller: () => HTMLElement | null,
  head: () => HTMLElement | null,
  deps: unknown[]
): boolean {
  const [past, setPast] = useState(false)
  const raf = useRef<number | null>(null)

  useEffect(() => {
    // The elements are found after commit, never during render.
    const start = (): void => {
      const root = scroller()
      const target = head()
      if (!root || !target) {
        raf.current = requestAnimationFrame(start)
        return
      }
      const io = new IntersectionObserver(
        // A pure function of the observation, so a missed frame self-corrects
        // on the next one instead of latching.
        //
        // No rootMargin: the plain question — "is any part of the head still in
        // the scrollport?" — is exactly the question the bar answers. Shrinking
        // the root to a zero-height line at its top edge instead made the head
        // miss it at rest, so the bar was showing before anything had scrolled.
        ([entry]) => setPast(!entry.isIntersecting),
        { root, threshold: 0 }
      )
      io.observe(target)
      cleanup.current = () => io.disconnect()
    }
    const cleanup = { current: null as null | (() => void) }
    start()
    return () => {
      if (raf.current !== null) cancelAnimationFrame(raf.current)
      cleanup.current?.()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)

  return past
}

/**
 * THE HEAD, FOLDED TO ONE LINE — so what you reach for at the top of a note is
 * still there halfway down it: the WRITE | READ pair, the title, the line that
 * says when it was edited and how long it is, the way back, and the star.
 *
 * Frosted rather than a slab of white. It lies over the words as they scroll,
 * and a flat sheet-coloured band cut them off at a hard edge, as if the page
 * stopped there; through the frost you can still see that it goes on under
 * the bar. The edge is a hairline with a short soft fall under it — the bar is
 * raised a little off the page, not ruled onto it.
 *
 * Opening details from here drops the panel out of the bar, and the panel is
 * the card that casts the shadow.
 */
export default function CompactBar({
  kindLabel,
  isNote,
  title,
  meta,
  detailsOpen,
  onToggleDetails,
  starred,
  onToggleStar,
  canBack,
  canForward,
  onBack,
  onForward,
  padX,
  lead,
  children
}: {
  kindLabel: string
  isNote: boolean
  title: string
  /** The head's meta line — "edited 4m ago · 812 words" — said after the title. */
  meta?: string
  detailsOpen: boolean
  onToggleDetails: () => void
  starred: boolean
  onToggleStar: () => void
  /** The tab's trail, the head's two buttons — shown when there is somewhere to go. */
  canBack?: boolean
  canForward?: boolean
  onBack?: () => void
  onForward?: () => void
  padX: string
  /**
   * What stands where the kind label does. A note you can write in puts its
   * WRITE | READ pair there: the left edge the pair has in the writing bar, so
   * the switch stays where it was once the head has scrolled away.
   */
  lead?: React.ReactNode
  /** The details panel, when it is open — it drops out of the bar. */
  children?: React.ReactNode
}): React.JSX.Element {
  return (
    <div
      data-compact="1"
      className="compact-bar"
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 6,
        padding: `9px ${padX} 8px`
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
        {lead ?? (
          <div
            style={{
              font: '600 9px var(--mono)',
              letterSpacing: '.17em',
              color: isNote ? 'var(--mute)' : 'var(--ink)',
              flex: 'none'
            }}
          >
            {kindLabel}
          </div>
        )}
        {/* The title and the meta line are the head's disclosure for details,
            as they are at rest. */}
        <div
          onClick={onToggleDetails}
          title="Details"
          style={{
            flex: '0 1 auto',
            minWidth: 0,
            display: 'flex',
            alignItems: 'baseline',
            gap: 9,
            cursor: 'pointer'
          }}
        >
          <div
            style={{
              flex: '0 1 auto',
              font: '600 13px var(--sans)',
              letterSpacing: '-.008em',
              color: 'var(--ink)',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              minWidth: 0
            }}
          >
            {title}
          </div>
          {meta ? (
            // Gives way first: the title is what the bar is for, and on a
            // narrow pane the line goes before a letter of it does.
            <div
              data-compact-meta="1"
              className="compact-meta"
              style={{
                flex: '0 1000 auto',
                minWidth: 0,
                font: '400 11px var(--sans)',
                color: 'var(--ink3)',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis'
              }}
            >
              {meta}
            </div>
          ) : null}
          <svg
            width="9"
            height="9"
            viewBox="0 0 14 14"
            fill="none"
            stroke="var(--faint)"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ flex: 'none', alignSelf: 'center', transform: `rotate(${detailsOpen ? 180 : 0}deg)` }}
          >
            <path d="M3 5.5l4 4 4-4" />
          </svg>
        </div>
        <div style={{ flex: 1 }} />
        {/* Where the head has them, so the hand does not have to learn a second
            place: the trail, then the star. */}
        {canBack && onBack ? (
          <HeadButton title="Back · ⌘[" onClick={onBack}>
            <Caret dir="back" />
          </HeadButton>
        ) : null}
        {canForward && onForward ? (
          <HeadButton title="Forward · ⌘]" onClick={onForward}>
            <Caret dir="forward" />
          </HeadButton>
        ) : null}
        <HeadButton title={starred ? 'Unstar' : 'Star — keep it in the rail'} onClick={onToggleStar}>
          <svg
            width="12"
            height="12"
            viewBox="0 0 14 14"
            fill={starred ? 'var(--ink)' : 'none'}
            stroke={starred ? 'var(--ink)' : 'var(--mute)'}
            strokeWidth="1.15"
            strokeLinejoin="round"
          >
            <path d="M7 2.1l1.5 3.06 3.38.49-2.44 2.38.57 3.36L7 9.8l-3.01 1.59.57-3.36L2.12 5.65l3.38-.49z" />
          </svg>
        </HeadButton>
      </div>
      {children}
    </div>
  )
}
