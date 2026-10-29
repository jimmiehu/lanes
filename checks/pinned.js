// A PINNED TAB IS THE ONE THING THE APP MAY NOT TAKE.
//
// Pinning says "keep this here". The tab it is said about is very often the one
// in front — so a plain open from ⌘K or the rail, which replaces whatever is
// active, was reliably aimed at exactly the tab you had asked it not to touch.
// It kept the PIN and lost the thing that was pinned, which is the worst of
// both: the strip went on claiming something was parked there, and it was
// something else.
//
// And the cap used to take one too, when every other tab was pinned — making
// "keep this" conditional on how the rest of the strip happened to look.
//
// So: pin something, then try to lose it. Open in place, open a dozen more,
// and the pinned tab is still holding what it was pinned on. Only a manual
// close moves it.
//
// Wants a throwaway vault of a dozen notes and its own LANES_STATE.
// See checks/README.md for how to run it.
;(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
  const click = (el, mods = {}) =>
    el && el.dispatchEvent(new MouseEvent('click', { bubbles: true, ...mods }))
  const ctx = (el) =>
    el &&
    el.dispatchEvent(
      new MouseEvent('contextmenu', { bubbles: true, clientX: 320, clientY: 320 })
    )
  const down = (el) => el && el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
  const pane = () => document.querySelector('[data-pane="1"]')
  const strip = () => pane()?.querySelector('[data-tabstrip]')
  const tabs = () => (strip() ? [...strip().querySelectorAll('[data-tab]')] : [])
  const activeTab = () => tabs().find((t) => t.getAttribute('data-tab-on') === '1')
  const nameOf = (t) => (t?.innerText ?? '').replace(/×$/, '').trim()
  const noteRows = () => [...document.querySelectorAll('[data-rail-row="note"]')]
  const rowSaying = (re) => noteRows().find((r) => re.test(r.innerText))
  // The pane head names the document actually on screen, which is the only
  // honest way to ask what a pinned tab is holding once it wears a monogram.
  const showing = () =>
    (pane()?.querySelector('[data-find-scope]')?.innerText ?? '').replace(/\s+/g, ' ').slice(0, 80)
  const menuItem = (label) =>
    [...document.querySelectorAll('div')].find(
      (d) => d.textContent.trim() === label && d.children.length === 0
    )
  const log = {}
  await sleep(2800)

  /* ---------- 1. pin the tab you are on ---------- */

  /*
   * Whichever two notes the rail is actually showing. RECENT folds on today and
   * shows seven, so a note named in advance can easily be below the fold — and
   * it re-sorts as you visit, so a row index is not a handle either. The NAMES
   * are, so they are taken once and everything below asks for them by name.
   */
  const titleOfRow = (r) => (r?.innerText ?? '').split('\n')[0].trim()
  log.railNoteRows = noteRows().length
  const KEEP = titleOfRow(noteRows()[0])
  const OTHER = titleOfRow(noteRows()[1])
  log.willPin = KEEP
  log.willOpenInPlace = OTHER
  const holdsKeep = () => showing().toLowerCase().includes(KEEP.toLowerCase().slice(0, 10))
  const holdsOther = () => showing().toLowerCase().includes(OTHER.toLowerCase().slice(0, 10))

  click(rowSaying(new RegExp(KEEP.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i')))
  await sleep(2200)
  log.opened = nameOf(activeTab())
  log.showing = showing()
  log.showsKeep = holdsKeep()

  ctx(activeTab())
  await sleep(600)
  log.offeredPin = Boolean(menuItem('Pin tab'))
  down(menuItem('Pin tab'))
  await sleep(900)
  // A pinned tab is drawn as a monogram and carries no ✕ — closing a parked tab
  // is a decision, not a stray click.
  const pinned = () => tabs().find((t) => t.querySelector('[data-tab-mono]'))
  log.wearsAMonogram = Boolean(pinned())
  log.hasNoCloseButton = Boolean(pinned()) && !pinned().querySelector('[data-x]')
  log.stillShowsKeep = holdsKeep()

  /* ---------- 2. open something IN PLACE — the case that broke it ---------- */

  // A plain rail click is "open here": it replaces the active tab. The active
  // tab is the pinned one, so this is the exact gesture that used to overwrite
  // what was pinned while keeping the pin.
  const before = tabs().length
  click(rowSaying(new RegExp(OTHER.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i')))
  await sleep(1600)
  log.tabsAfterOpenInPlace = tabs().length
  log.openedAlongside = log.tabsAfterOpenInPlace === before + 1
  log.showsTheNewOne = holdsOther()
  // And the pin is still holding what it was pinned ON, not merely still a pin.
  click(pinned())
  await sleep(1200)
  log.pinStillHoldsIt = holdsKeep()

  /* ---------- 3. fill the strip past its cap ---------- */

  for (const r of noteRows().slice(0, 12)) {
    click(r, { metaKey: true })
    await sleep(320)
  }
  log.tabsAfterFilling = tabs().length
  log.pinSurvivedTheCap = Boolean(tabs().find((t) => t.querySelector('[data-tab-mono]')))
  // The pinned one is still first — pinned tabs hold the front of the strip.
  log.pinnedIsFirst = Boolean(tabs()[0]?.querySelector('[data-tab-mono]'))
  click(tabs()[0])
  await sleep(1200)
  log.pinStillHoldsItAfterFilling = holdsKeep()

  /* ---------- 4. and CLOSE OTHERS keeps it, as it always did ---------- */

  const notPinned = tabs().find((t) => !t.querySelector('[data-tab-mono]'))
  ctx(notPinned)
  await sleep(600)
  down(menuItem('Close others'))
  await sleep(1400)
  log.tabsAfterCloseOthers = tabs().length
  log.pinKeptByCloseOthers = Boolean(tabs().find((t) => t.querySelector('[data-tab-mono]')))

  /* ---------- 5. only a manual unpin-and-close lets it go ---------- */

  const stillPinned = tabs().find((t) => t.querySelector('[data-tab-mono]'))
  ctx(stillPinned)
  await sleep(600)
  log.offeredUnpin = Boolean(menuItem('Unpin tab'))
  down(menuItem('Unpin tab'))
  await sleep(900)
  log.unpinned = !tabs().find((t) => t.querySelector('[data-tab-mono]'))

  log.pass =
    log.showsKeep &&
    log.offeredPin &&
    log.wearsAMonogram &&
    log.hasNoCloseButton &&
    log.stillShowsKeep &&
    log.openedAlongside &&
    log.showsTheNewOne &&
    log.pinStillHoldsIt &&
    log.pinSurvivedTheCap &&
    log.pinnedIsFirst &&
    log.pinStillHoldsItAfterFilling &&
    log.pinKeptByCloseOthers &&
    log.offeredUnpin &&
    log.unpinned
  return JSON.stringify(log, null, 1)
})()
