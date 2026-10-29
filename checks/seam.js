// A drag that ends without a pointerup ENDS.
//
// The bug this pins down: the seam remembered it was being dragged in a flag
// that only a `pointerup` on the seam itself could clear. Release outside the
// window, let the system take the pointer for a gesture, lose the capture to a
// re-render — any of those and the flag stayed set for good, after which simply
// MOVING THE MOUSE ACROSS THE SEAM re-laid the panes out on every mouse move,
// with an IPC write behind each one. That is what "the app went unresponsive
// and kept resizing the panes on its own" was.
//
// So: drag it, end the drag the wrong way, and prove that crossing it after
// that does nothing. Twice — once for a pointercancel, once for a pointerup
// that never arrives at all. The composer's grip carried the same bug and is
// checked the same way.
// See checks/README.md for how to run it.
;(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
  const log = {}
  const pane = (i) => document.querySelector(`[data-pane="${i}"], [data-pane-empty="${i ? 'note' : 'chat'}"]`)
  const widthOf = (i) => Math.round(pane(i)?.getBoundingClientRect().width ?? 0)
  const key = (k) =>
    window.dispatchEvent(new KeyboardEvent('keydown', { key: k, metaKey: true, bubbles: true }))

  /** A real PointerEvent, so React's own handlers see what a mouse would send. */
  const point = (el, type, x, buttons) =>
    el.dispatchEvent(
      new PointerEvent(type, {
        bubbles: true,
        cancelable: true,
        pointerId: 1,
        pointerType: 'mouse',
        isPrimary: true,
        button: buttons ? 0 : -1,
        buttons,
        clientX: x,
        clientY: el.getBoundingClientRect().top + 40
      })
    )

  await sleep(2200)
  // Two panes, or there is no seam.
  if (!document.querySelector('.split-seam')) key('\\')
  await sleep(700)
  const seam = document.querySelector('.split-seam')
  log.foundSeam = Boolean(seam)
  if (!seam) return JSON.stringify(log, null, 1)

  const x0 = Math.round(seam.getBoundingClientRect().left + 6)
  log.startWidth = widthOf(0)

  /* ---------- 1. a drag still drags ---------- */
  point(seam, 'pointerdown', x0, 1)
  point(seam, 'pointermove', x0 - 120, 1)
  await sleep(260)
  log.afterDrag = widthOf(0)
  log.dragMovedIt = Math.abs(log.afterDrag - log.startWidth) > 40

  /* ---------- 2. pointercancel ends it ---------- */
  point(seam, 'pointercancel', x0 - 120, 0)
  await sleep(120)
  const parked = widthOf(0)
  // Now cross it, with nothing held down.
  point(seam, 'pointermove', x0 + 160, 0)
  point(seam, 'pointermove', x0 + 220, 0)
  await sleep(300)
  log.afterCancelAndCross = widthOf(0)
  log.cancelStoppedIt = widthOf(0) === parked

  /* ---------- 3. and so does a pointerup that never comes ---------- */
  const x1 = Math.round(document.querySelector('.split-seam').getBoundingClientRect().left + 6)
  point(document.querySelector('.split-seam'), 'pointerdown', x1, 1)
  point(document.querySelector('.split-seam'), 'pointermove', x1 + 80, 1)
  await sleep(260)
  const held = widthOf(0)
  log.secondDragMovedIt = held !== parked
  // The mouse comes back over the seam with the button already released, and
  // no pointerup was ever delivered. The button state is the only truth left.
  const s2 = document.querySelector('.split-seam')
  point(s2, 'pointermove', x1 - 200, 0)
  await sleep(120)
  point(s2, 'pointermove', x1 - 260, 0)
  point(s2, 'pointermove', x1 - 300, 0)
  await sleep(300)
  log.afterLostUp = widthOf(0)
  log.lostUpStoppedIt = Math.abs(widthOf(0) - held) < 2

  /* ---------- 4. the composer's grip, same shape ---------- */
  const grip = document.querySelector('.composer-grip')
  log.foundGrip = Boolean(grip)
  if (grip) {
    const box = () => Math.round(grip.parentElement.getBoundingClientRect().height)
    const gy = grip.getBoundingClientRect().top
    const drop = (type, dy, buttons) =>
      grip.dispatchEvent(
        new PointerEvent(type, {
          bubbles: true,
          cancelable: true,
          pointerId: 2,
          pointerType: 'mouse',
          isPrimary: true,
          button: buttons ? 0 : -1,
          buttons,
          clientX: grip.getBoundingClientRect().left + 40,
          clientY: gy + dy
        })
      )
    const h0 = box()
    drop('pointerdown', 0, 1)
    drop('pointermove', -90, 1)
    await sleep(260)
    const h1 = box()
    log.gripDragged = h1 > h0 + 40
    drop('pointercancel', -90, 0)
    await sleep(120)
    drop('pointermove', 200, 0)
    drop('pointermove', 260, 0)
    await sleep(300)
    log.gripStopped = Math.abs(box() - h1) < 3
  }

  log.pass =
    log.dragMovedIt &&
    log.cancelStoppedIt &&
    log.secondDragMovedIt &&
    log.lostUpStoppedIt &&
    log.gripDragged &&
    log.gripStopped
  return JSON.stringify(log, null, 1)
})()
