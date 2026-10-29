// A two-finger swipe opens and closes the browser rail — right pulls it in,
// left pushes it out — without stealing the gesture from anything that can
// scroll sideways, from a vertical scroll that leaks a little sideways, or
// from itself (one swipe, one toggle).
//
// It drives synthetic wheel events, which is what a trackpad swipe arrives as.
// What it cannot check is the DIRECTION a real trackpad reports; that is
// macOS's natural-scrolling convention, and it is stated in the code.
// See checks/README.md for how to run it.
(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
  const railShown = () => Boolean(document.querySelector('[data-scroll="1"]'))
  const target = () =>
    document.querySelector('[data-pane="0"] [data-find-scope]') ?? document.body
  // A swipe is a run of wheel events, not one: this sends the run.
  const swipe = async (dx, over) => {
    const el = over ?? target()
    for (let i = 0; i < 6; i += 1) {
      el.dispatchEvent(
        new WheelEvent('wheel', { deltaX: dx / 6, deltaY: 0, bubbles: true, cancelable: true })
      )
      await sleep(16)
    }
    await sleep(500)
  }
  const log = {}
  await sleep(3000)

  log.railAtRest = railShown()

  // --- left pushes it out, right pulls it in ---
  await swipe(160)
  log.closedOnSwipeLeft = !railShown()
  await swipe(-160)
  log.openedOnSwipeRight = railShown()

  // --- one swipe is one toggle: a long run does not flap ---
  await swipe(600)
  log.longSwipeClosedOnce = !railShown()
  await swipe(-600)
  log.longSwipeOpenedOnce = railShown()

  // --- a vertical scroll that leaks sideways is left alone ---
  for (let i = 0; i < 8; i += 1) {
    target().dispatchEvent(
      new WheelEvent('wheel', { deltaX: 24, deltaY: 90, bubbles: true, cancelable: true })
    )
    await sleep(16)
  }
  await sleep(500)
  log.verticalScrollIgnored = railShown()

  // --- and the tab strip keeps its own gesture while it has room to scroll ---
  const strip = document.querySelector('[data-tabstrip="1"]')
  log.stripFound = Boolean(strip)
  if (strip) {
    // Make it genuinely scrollable, then swipe over it.
    const wide = document.createElement('div')
    wide.style.cssText = 'width:4000px;height:1px;flex:none'
    strip.appendChild(wide)
    await sleep(200)
    log.stripCanScroll = strip.scrollWidth - strip.clientWidth > 1
    await swipe(300, strip)
    log.stripKeptItsSwipe = railShown()
    wide.remove()
  }

  // Every toggle is read off a rail that was open at rest, so that comes first.
  log.pass =
    log.railAtRest &&
    log.closedOnSwipeLeft &&
    log.openedOnSwipeRight &&
    log.longSwipeClosedOnce &&
    log.longSwipeOpenedOnce &&
    log.verticalScrollIgnored &&
    log.stripFound &&
    log.stripCanScroll &&
    log.stripKeptItsSwipe
  return JSON.stringify(log, null, 1)
})()
