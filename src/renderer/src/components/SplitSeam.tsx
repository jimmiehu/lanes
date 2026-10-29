import React, { useEffect, useRef } from 'react'

/**
 * The draggable seam between the panes.
 *
 * It lives on pane B's left edge rather than as a flex child between the two,
 * because a child would have to be threaded through App's layout for the same
 * 7px. It measures from pane A's left edge to its OWN pane's right edge, which
 * is why it finds both by query rather than being handed a width — either pane
 * may be empty, and an empty pane is a different component.
 */
export default function SplitSeam({
  onRatio
}: {
  /** `done` is the release: everything before it is the drag, live but unsaved. */
  onRatio: (r: number, done: boolean) => void
}): React.JSX.Element {
  /**
   * The pointer currently dragging, or null. An ID rather than a flag because
   * only the pointer that pressed may drag — a second one arriving mid-drag
   * (a trackpad tap while a mouse is held) used to steer the seam too.
   */
  const held = useRef<number | null>(null)
  /**
   * One update per frame. Pointer moves arrive faster than the app can lay two
   * panes out, and each one is a `setState` over the whole window; without this
   * a fast drag queues frames the render loop never catches up with, which is
   * most of what "the app went unresponsive" was.
   */
  const queued = useRef<number | null>(null)
  const frame = useRef(0)

  useEffect(
    () => () => {
      if (frame.current) cancelAnimationFrame(frame.current)
    },
    []
  )

  const stop = (e: React.PointerEvent): void => {
    if (held.current === null) return
    held.current = null
    if (frame.current) {
      cancelAnimationFrame(frame.current)
      frame.current = 0
    }
    try {
      e.currentTarget.releasePointerCapture(e.pointerId)
    } catch {
      // Capture may already be gone — that is the case this is here to survive.
    }
    // The last frame may never have run, so the release carries the value with
    // it: this is the one that gets written to disk.
    if (queued.current !== null) onRatio(queued.current, true)
    queued.current = null
  }

  return (
    <div
      onPointerDown={(e) => {
        // Anything but the primary button is not a drag — a right-click here
        // used to start one that no button release would ever end.
        if (e.button !== 0) return
        e.preventDefault()
        e.stopPropagation()
        try {
          e.currentTarget.setPointerCapture(e.pointerId)
        } catch {
          // Capture is an optimisation — it keeps a fast drag from outrunning
          // the element. The drag still works without it, and a throw here
          // must not take the line below with it.
        }
        held.current = e.pointerId
      }}
      onPointerMove={(e) => {
        if (held.current !== e.pointerId) return
        /*
         * THE BUTTON IS THE TRUTH. A pointerup that never arrives — released
         * outside the window, swallowed by a gesture, lost with the capture —
         * used to leave this stuck holding, and then merely MOVING THE MOUSE
         * ACROSS THE SEAM resized the panes as if it were being dragged. The
         * pointer's own button state cannot get stuck, so it is asked every
         * move rather than trusted to have been reported.
         */
        if (!(e.buttons & 1)) {
          stop(e)
          return
        }
        const a = document
          .querySelector('[data-pane="0"], [data-pane-empty="chat"]')
          ?.getBoundingClientRect()
        const b = e.currentTarget.parentElement?.getBoundingClientRect()
        if (!a || !b) return
        const total = b.right - a.left
        if (total <= 0) return
        // Clamped rather than free: a pane dragged to nothing is a pane you
        // cannot drag back, and the shedding table gives up below 240px.
        queued.current = Math.min(0.8, Math.max(0.2, (e.clientX - a.left) / total))
        if (frame.current) return
        frame.current = requestAnimationFrame(() => {
          frame.current = 0
          if (held.current !== null && queued.current !== null) onRatio(queued.current, false)
        })
      }}
      onPointerUp={stop}
      // Both of the ways a drag ends without a pointerup. `pointercancel` is the
      // system taking the pointer away — a swipe recognised as a gesture, a
      // context menu, the window going to the background mid-drag — and
      // `lostpointercapture` covers the element being replaced under the
      // pointer, which a re-render during the drag can do.
      onPointerCancel={stop}
      onLostPointerCapture={stop}
      onDoubleClick={(e) => {
        e.stopPropagation()
        onRatio(0.5, true)
      }}
      title="Drag to resize · double-click for an even split"
      className="split-seam"
      style={{
        position: 'absolute',
        left: -8,
        top: 0,
        bottom: 0,
        width: 12,
        cursor: 'col-resize',
        zIndex: 5
      }}
    />
  )
}
