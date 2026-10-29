// The rail opens and closes as one sliding box, rather than two components
// swapped by a ternary. What that has to mean, to be worth the code:
//   - the shell's width is somewhere BETWEEN 250 and 11 mid-transition, not at
//     one end or the other;
//   - the pane beside it moves with it, on the same frames;
//   - the contents keep their full width the whole way, so they slide out of
//     frame rather than reflowing thirty times;
//   - the collapsed strip is still clickable, and still brings the rail back;
//   - the tree unmounts once it is off screen, so it is not rendering behind
//     an 11px sliver.
// See checks/README.md for how to run it.
(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
  const click = (el) => el && el.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  const shell = () => document.querySelector('[data-rail-shell]')
  const rail = () => document.querySelector('[data-rail="1"]')
  // Every pane, summed: with the split open the freed width is shared between
  // two of them, so watching one would only ever see half of what the rail gave.
  const panes = () =>
    [...document.querySelectorAll('[data-pane]')].reduce(
      (n, el) => n + el.getBoundingClientRect().width,
      0
    )
  const hider = () => document.querySelector('[title^="Hide"], [data-rail-hide]')
  const w = (el) => (el ? Math.round(el.getBoundingClientRect().width) : null)
  const log = {}
  await sleep(2800)

  // Sample width every frame for the length of the transition, on both the
  // shell and the pane next to it.
  const film = async (ms) => {
    const frames = []
    const t0 = performance.now()
    while (performance.now() - t0 < ms) {
      const sh = shell()
      const inner = rail()
      frames.push({
        rail: w(sh),
        pane: Math.round(panes()),
        inner: w(inner),
        // How far the contents have travelled past the box's own left edge.
        // Zero while open; the full 239 once shut.
        off: sh && inner ? Math.round(sh.getBoundingClientRect().left - inner.getBoundingClientRect().left) : null
      })
      await new Promise((r) => requestAnimationFrame(r))
    }
    return frames
  }

  // The rail's state persists across launches, so start from a known one
  // rather than from whatever the last session left behind.
  if (w(shell()) !== 250) {
    click(shell())
    await sleep(700)
  }
  log.openWidth = w(shell())

  // --- close ---
  const hide = hider()
  log.foundHider = !!hide
  const closing = film(400)
  click(hide)
  const closeFrames = await closing
  const closeRails = closeFrames.map((f) => f.rail)
  // Between, not at an end: at least a few frames strictly inside the range.
  log.closeMidFrames = closeRails.filter((x) => x > 20 && x < 240).length
  log.closeSlides = log.closeMidFrames >= 6
  // Monotonic down, allowing for the odd equal frame.
  log.closeMonotonic = closeRails.every((x, i) => i === 0 || x <= closeRails[i - 1] + 1)
  // The pane grows on the same frames, by about what the rail gave up.
  const dRail = closeRails[0] - closeRails[closeRails.length - 1]
  const dPane = closeFrames[closeFrames.length - 1].pane - closeFrames[0].pane
  log.railGave = dRail
  log.paneTook = dPane
  log.paneFollows = Math.abs(dRail - dPane) < 4
  // The contents never squash: while they are mounted they stay 250 wide.
  const inners = closeFrames.map((f) => f.inner).filter((x) => x !== null)
  log.innerWidths = [...new Set(inners)]
  log.innerHeldFullWidth = inners.every((x) => x === 250)
  // The contents move rather than being cut off: their right edge tracks the
  // box's right edge, so the offset always accounts for the width the box lost.
  const drift = closeFrames
    .filter((f) => f.inner !== null && f.off !== null)
    .map((f) => Math.abs(250 - f.rail - f.off))
  log.worstDrift = drift.length ? Math.max(...drift) : Infinity
  log.contentsTravelWithTheEdge = log.worstDrift <= 3
  log.travelled = Math.max(...closeFrames.map((f) => f.off ?? 0))

  await sleep(600)
  log.shutWidth = w(shell())
  log.shutIsStrip = log.shutWidth === 11
  // And once it is shut, the tree is not rendering behind the strip.
  log.treeUnmounted = rail() === null
  log.stripHasDots = shell().querySelectorAll('div[style*="border-radius: 99"]').length === 3

  // --- open, by clicking the strip itself ---
  const opening = film(400)
  click(shell())
  const openFrames = await opening
  const openRails = openFrames.map((f) => f.rail)
  log.openMidFrames = openRails.filter((x) => x > 20 && x < 240).length
  log.openSlides = log.openMidFrames >= 6
  log.openMonotonic = openRails.every((x, i) => i === 0 || x >= openRails[i - 1] - 1)
  // The contents are there from the first frame of the open — they slide in
  // with the box, they do not appear at the end of it.
  log.innerMountedEarly = openFrames.slice(0, 4).some((f) => f.inner === 250)
  // And they TRAVEL on the way in, rather than the box widening over contents
  // that were already sitting where they belong. Same right-edge test as the
  // close. The first frames are skipped: the box starts moving on the commit
  // that mounts the contents, and they are held one frame at the shut position
  // deliberately, so those two disagree by design.
  const openDrift = openFrames
    .slice(4)
    .filter((f) => f.inner !== null && f.off !== null)
    .map((f) => Math.abs(250 - f.rail - f.off))
  log.worstOpenDrift = openDrift.length ? Math.max(...openDrift) : Infinity
  log.openTravels = log.worstOpenDrift <= 4
  // Not already home on arrival: the contents were genuinely off to the left.
  log.startedOffFrame = openFrames.slice(0, 6).some((f) => (f.off ?? 0) > 200)

  await sleep(600)
  log.reopenedWidth = w(shell())
  log.reopened = w(shell()) === 250 && !!rail()

  log.pass =
    log.foundHider &&
    log.closeSlides &&
    log.closeMonotonic &&
    log.paneFollows &&
    log.innerHeldFullWidth &&
    log.contentsTravelWithTheEdge &&
    log.shutIsStrip &&
    log.treeUnmounted &&
    log.stripHasDots &&
    log.openSlides &&
    log.openMonotonic &&
    log.innerMountedEarly &&
    log.openTravels &&
    log.startedOffFrame &&
    log.reopened

  return log
})()
