// An answer that landed while you were looking somewhere else.
//
// Running several threads at once is what this app is for, so most answers
// finish where you are not: behind another tab, in the pane the split is
// hiding, or with the whole window in the background. The strip said nothing
// about any of them, and the only way to find out was to walk the tabs.
//
// Now the tab's own dot does: quiet for nothing to report, blinking mid-turn,
// ink with a soft halo for an answer you have not been back to, ink for the tab
// you are on. Going back to it — by any route — is what clears it.
//
// Wants a stand-in CLI that takes a few seconds and then simply exits, so a
// turn can finish while the check is on another tab. See checks/README.md.
;(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
  const click = (el) => el && el.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  const pane = () => document.querySelector('[data-pane="0"]')
  const tabs = () => [...pane().querySelectorAll('[data-tab]')]
  const marks = () => [...pane().querySelectorAll('[data-tab-unseen]')].map((d) => d.dataset.tabUnseen)
  const key = (k) =>
    window.dispatchEvent(new KeyboardEvent('keydown', { key: k, metaKey: true, bubbles: true }))
  const set = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set
  const log = {}
  await sleep(2600)
  // Everything below turns on whether anybody is looking, so say so plainly —
  // and with nobody looking it proves nothing either way: red, and why.
  log.windowHasFocus = document.hasFocus()
  if (!log.windowHasFocus) return JSON.stringify({ ...log, why: 'the app must be frontmost', pass: false }, null, 1)

  // Send on the first tab.
  const c = pane().querySelector('textarea')
  set.call(c, 'the one that finishes while you are away')
  c.dispatchEvent(new Event('input', { bubbles: true }))
  await sleep(200)
  c.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))
  await sleep(400)

  // Then leave, so the answer lands somewhere nobody is looking.
  key('t')
  await sleep(700)
  log.twoTabs = tabs().length === 2
  // Nothing is claimed while it is still running — that is what the blink says.
  log.nothingWhileItRuns = marks().every((v) => v === '0')

  for (let i = 0; i < 40; i += 1) {
    await sleep(500)
    if (marks().some((v) => v === '1')) break
  }
  log.marks = marks()
  log.exactlyOne = log.marks.filter((v) => v === '1').length === 1
  log.markedTheOneThatRan = log.marks[0] === '1'

  // The glyph, not a badge: same dot, in ink, with a ring around it.
  // The same glyph the other tabs carry, not a badge beside it.
  const dot = pane().querySelector('[data-tab-unseen="1"]')
  const plain = pane().querySelector('[data-tab-unseen="0"]')
  // After the arrival beat has finished, or the dot is measured mid-animation.
  await sleep(700)
  log.dotWidth = dot && Math.round(dot.getBoundingClientRect().width)
  log.plainDotWidth = plain && Math.round(plain.getBoundingClientRect().width)
  log.isTheSameGlyph = Boolean(dot && plain) && log.dotWidth === log.plainDotWidth
  log.sixPx = log.dotWidth === 6
  // In ink: the colour the dot of the tab you are on wears.
  const here = pane().querySelector('[data-tab-on="1"] [data-tab-unseen]')
  log.inInk = Boolean(dot && here) && getComputedStyle(dot).backgroundColor === getComputedStyle(here).backgroundColor
  log.hasARing = Boolean(dot) && getComputedStyle(dot).boxShadow !== 'none'

  // Going back to it is what marks it seen.
  click(tabs()[0])
  await sleep(900)
  log.cleared = marks().every((v) => v === '0')

  log.pass =
    log.windowHasFocus &&
    log.twoTabs &&
    log.nothingWhileItRuns &&
    log.exactlyOne &&
    log.markedTheOneThatRan &&
    log.isTheSameGlyph &&
    log.sixPx &&
    log.inInk &&
    log.hasARing &&
    log.cleared
  return JSON.stringify(log, null, 1)
})()
