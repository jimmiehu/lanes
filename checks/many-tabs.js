// A FULL STRIP KEEPS ITS TITLES, AND SCROLLS.
//
// Six tabs was a layout pretending to be a budget: the seventh was not refused,
// it was silently thrown away with its history. Then the strip shed: as it
// filled, tabs collapsed to two-character monograms so none was ever scrolled
// out of sight — and a row of `LO CD AS LP` said nothing about which was which.
// Now every tab keeps a readable title, and past what the row can hold it
// scrolls sideways: a trackpad's swipe, or the wheel. The tab you are in is
// always in view, an edge with more beyond it fades, and the counted chip names
// every tab in the pane whenever anything is out of sight.
//
// Opens ten notes, so it wants a throwaway vault with at least ten of them and
// its own LANES_STATE. See checks/README.md for how to run it.
;(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
  const click = (el, mods = {}) =>
    el && el.dispatchEvent(new MouseEvent('click', { bubbles: true, ...mods }))
  const down = (el) => el && el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
  // The NOTE pane's strip: notes are the kind this check can open ten of
  // without spending ten turns.
  const strip = () => document.querySelector('[data-pane="1"] [data-tabstrip]')
  const tabs = () => (strip() ? [...strip().querySelectorAll('[data-tab]')] : [])
  const monos = () => tabs().filter((t) => t.querySelector('[data-tab-mono]'))
  const activeTab = () => tabs().find((t) => t.getAttribute('data-tab-on') === '1')
  const noteRows = () => [...document.querySelectorAll('[data-rail-row="note"]')]
  const inView = (t) => {
    const box = strip().getBoundingClientRect()
    const b = t.getBoundingClientRect()
    return b.left >= box.left - 1 && b.right <= box.right + 1
  }
  const log = {}
  await sleep(2600)

  /* ---------- 1. ten tabs, and ten tabs stay ---------- */

  const rows = noteRows().slice(0, 10)
  log.notesAvailable = rows.length
  for (const r of rows) {
    // ⌘-click is the gesture that adds a tab rather than replacing one.
    click(r, { metaKey: true })
    await sleep(420)
  }
  await sleep(600)
  log.tabCount = tabs().length
  // Six would mean the old cap ate four of them without saying so.
  log.keptThemAll = log.tabCount === rows.length

  /* ---------- 2. every tab keeps a title, and the row scrolls ---------- */

  log.monogramCount = monos().length
  log.noneShed = log.monogramCount === 0
  log.widths = tabs().map((t) => Math.round(t.getBoundingClientRect().width))
  // A title it keeps is a real one, not `Qu…`: the whole of it, or a tab wide
  // enough to say something — and a short title is not padded out to that.
  log.everyTitleReadable = tabs().every((t) => {
    const words = t.querySelector('[data-tab-title]')
    return t.getBoundingClientRect().width >= 90 || (words && words.scrollWidth <= words.clientWidth + 1)
  })
  log.stripScrolls = strip().scrollWidth > strip().clientWidth + 1
  log.activeInView = Boolean(activeTab()) && inView(activeTab())
  log.someOutOfSight = tabs().some((t) => !inView(t))
  // The edge with more beyond it fades.
  log.fades = /gradient/.test(getComputedStyle(strip()).maskImage || getComputedStyle(strip()).webkitMaskImage || '')

  /* ---------- 3. the wheel scrolls it sideways ---------- */

  strip().scrollLeft = 0
  await sleep(200)
  strip().dispatchEvent(new WheelEvent('wheel', { deltaY: 120, deltaX: 0, bubbles: true, cancelable: true }))
  await sleep(250)
  log.wheelScrolled = strip().scrollLeft > 0

  /* ---------- 4. the chip names every tab ---------- */

  const chip = () => document.querySelector('[data-pane="1"] [data-tab-count]')
  log.countChipShown = Boolean(chip())
  log.countChipSays = chip()?.innerText.trim() ?? ''
  log.chipCountsEveryTab = log.countChipSays === String(log.tabCount)

  click(chip())
  await sleep(500)
  const listRows = () => [...document.querySelectorAll('[data-tab-list-row]')]
  log.listRowCount = listRows().length
  log.listNamesEveryTab = log.listRowCount === log.tabCount
  log.listTitles = listRows()
    .slice(0, 3)
    .map((r) => r.innerText.replace(/×$/, '').trim())
  log.listGivesRealTitles = log.listTitles.every((t) => t.length > 2)
  log.listMarksTheActiveOne =
    listRows().filter((r) => r.getAttribute('data-tab-list-on') === '1').length === 1

  /* ---------- 5. picking one goes there, and brings it into view ---------- */

  // The first tab: scrolled out of sight by the wheel above, or by the active one.
  const wanted = 0
  const wantedTitle = listRows()[wanted]?.innerText.replace(/×$/, '').trim() ?? ''
  down(listRows()[wanted])
  await sleep(900)
  log.listClosed = listRows().length === 0
  log.wentThere = Boolean(activeTab()) && activeTab().innerText.includes(wantedTitle.slice(0, 8))
  log.broughtIntoView = Boolean(activeTab()) && inView(activeTab())

  log.pass =
    log.keptThemAll &&
    log.noneShed &&
    log.everyTitleReadable &&
    log.stripScrolls &&
    log.activeInView &&
    log.someOutOfSight &&
    log.fades &&
    log.wheelScrolled &&
    log.countChipShown &&
    log.chipCountsEveryTab &&
    log.listNamesEveryTab &&
    log.listGivesRealTitles &&
    log.listMarksTheActiveOne &&
    log.listClosed &&
    log.wentThere &&
    log.broughtIntoView
  return JSON.stringify(log, null, 1)
})()
