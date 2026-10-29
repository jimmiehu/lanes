// The pane head: the details panel it discloses, and the compact bar that
// takes over once it scrolls away. See checks/README.md for how to run it.
(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
  const click = (el) => el && el.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  const pane = () => document.querySelector('[data-pane="0"]')
  const log = {}
  await sleep(2800)

  log.headPresent = Boolean(pane() && pane().querySelector('[data-head="1"]'))

  // The meta line is the disclosure.
  const meta = pane().querySelector('[data-meta="1"]')
  click(meta)
  await sleep(600)
  const text = pane().innerText
  log.detailsOpened = /NOTES IN CONTEXT|Lane|Model|Turns/.test(text)
  log.detailsHasFacts = /Lane|Model/.test(text)
  click(meta)
  await sleep(400)

  // Scrolling the head out brings the compact bar in — and back again.
  const scroller = pane().querySelector('[data-find-scope]')
  log.foundScroller = Boolean(scroller)
  const barNow = () =>
    [...pane().querySelectorAll('div')].some(
      (d) => d.style.position === 'absolute' && d.style.zIndex === '6'
    )
  // A transcript opens at its live edge, so the head has legitimately scrolled
  // away already. Go to the top before asking whether the bar is hidden.
  if (scroller) {
    scroller.scrollTop = 0
    await sleep(900)
  }
  log.barHiddenAtTop = !barNow()
  if (scroller) {
    scroller.scrollTop = scroller.scrollHeight
    await sleep(900)
  }
  log.barShownWhenScrolled = barNow()
  if (scroller) {
    scroller.scrollTop = 0
    await sleep(900)
  }
  log.barHidesAgain = !barNow()

  log.pass =
    log.headPresent &&
    log.detailsOpened &&
    log.detailsHasFacts &&
    log.foundScroller &&
    log.barHiddenAtTop &&
    log.barShownWhenScrolled &&
    log.barHidesAgain
  return JSON.stringify(log, null, 1)
})()
