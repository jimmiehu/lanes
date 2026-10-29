// ⌥⇥ and ⇧⌥⇥ switch the active pane: the selection (and its elevation) moves
// across in the split, and with the split closed it flips which pane is on
// screen. See checks/README.md for how to run it.
(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
  const click = (el) => el && el.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  const altTab = (shift) =>
    window.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'Tab',
        code: 'Tab',
        altKey: true,
        shiftKey: !!shift,
        bubbles: true
      })
    )
  const panes = () =>
    [...document.querySelectorAll('[data-pane], [data-pane-empty]')].map(
      (p) => p.dataset.pane ?? (p.dataset.paneEmpty === 'note' ? '1' : '0')
    )
  const el = (i) =>
    document.querySelector(`[data-pane="${i}"]`) ??
    document.querySelector(`[data-pane-empty="${i === 1 ? 'note' : 'chat'}"]`)
  // The seated pane wears the inset tint; the selected one does not.
  const seated = (i) => /9999px/.test(getComputedStyle(el(i)).boxShadow)
  const log = {}
  await sleep(3000)

  // --- one pane: it flips which one is on screen ---
  log.soloAtRest = panes()
  altTab()
  await sleep(600)
  log.soloAfterAltTab = panes()
  log.flipsTheSoloPane = panes()[0] === '1' && panes().length === 1
  altTab(true)
  await sleep(600)
  log.soloAfterShiftAltTab = panes()
  log.andBackAgain = panes()[0] === '0'

  // --- split: the selection moves, and the elevation with it ---
  click(document.querySelector('[data-rail-row="note"]'))
  await sleep(1600)
  log.split = panes().length === 2
  // Opening a note selects the note pane.
  log.noteSelected = !seated(1) && seated(0)
  altTab()
  await sleep(600)
  log.movedToTheThreadPane = !seated(0) && seated(1)
  altTab(true)
  await sleep(600)
  log.shiftMovesBack = !seated(1) && seated(0)
  // Both panes are still there: this selects, it does not close anything.
  log.bothPanesStand = panes().length === 2

  // The flip is asked against where it started — a ⌥⇥ that did nothing from a
  // note pane at rest is no flip — and both ways it leaves one pane, not two.
  log.pass =
    log.soloAtRest.length === 1 &&
    log.soloAtRest[0] !== log.soloAfterAltTab[0] &&
    log.flipsTheSoloPane &&
    log.soloAfterShiftAltTab.length === 1 &&
    log.andBackAgain &&
    log.split &&
    log.noteSelected &&
    log.movedToTheThreadPane &&
    log.shiftMovesBack &&
    log.bothPanesStand
  return JSON.stringify(log, null, 1)
})()
