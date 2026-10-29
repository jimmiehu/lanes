// The compact bar must not eat the tab strip, and the model/effort chips must
// actually be clickable. See checks/README.md for how to run it.
(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
  const click = (el) => el && el.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  const down = (el) => el && el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
  const pane = () => document.querySelector('[data-pane="0"]')
  const log = {}
  await sleep(2800)

  // The transcript opens at its live edge, so the bar is up from the start.
  const bar = [...pane().querySelectorAll('div')].find(
    (d) => d.style.position === 'absolute' && d.style.zIndex === '6'
  )
  log.barShowing = Boolean(bar)

  // The tab, its ✕ and the trailing + must all be hit-testable.
  const tab = pane().querySelector('[data-tab="1"]')
  log.tabPresent = Boolean(tab)
  const hit = (el) => {
    if (!el) return 'missing'
    const b = el.getBoundingClientRect()
    const top = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2)
    return el.contains(top) || top === el ? 'reachable' : (top && top.tagName) || 'covered'
  }
  log.tabReachable = hit(tab)
  log.closeReachable = hit(tab && tab.querySelector('[data-x="1"]'))
  // The row's last child is the +; the tabs scroll in a track of their own before it.
  const strip = pane().querySelector('[data-tabrow]')
  log.plusReachable = hit(strip && strip.lastElementChild)

  // The composer's status line opens a panel whose chips can be clicked.
  const status = pane().querySelector('[data-status-line="1"]')
  log.statusFound = Boolean(status)
  // HIGH is not the default effort, so only the chip can make the line say it.
  log.effortWasHigh = /·\s*HIGH/.test((status || {}).textContent || '')
  down(status)
  click(status)
  await sleep(600)
  const effortChip = [...pane().querySelectorAll('div')].find(
    (d) => d.textContent.trim() === 'HIGH' && d.children.length === 0
  )
  log.panelOpened = Boolean(effortChip)
  if (effortChip) {
    // A mousedown anywhere used to close the panel before the click landed.
    down(effortChip)
    click(effortChip)
    await sleep(700)
  }
  log.effortTook = /·\s*HIGH/.test(
    (pane().querySelector('[data-status-line="1"]') || {}).textContent || ''
  )

  log.pass =
    log.barShowing &&
    log.tabPresent &&
    log.tabReachable === 'reachable' &&
    log.closeReachable === 'reachable' &&
    log.plusReachable === 'reachable' &&
    log.statusFound &&
    log.panelOpened &&
    !log.effortWasHigh &&
    log.effortTook
  return JSON.stringify(log, null, 1)
})()
