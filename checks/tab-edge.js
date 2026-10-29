// AN ANSWER OUT OF SIGHT IS A DOT AT THE EDGE.
//
// A strip that scrolls can hold a tab out of sight, and the dot on a tab is how
// you learn an answer landed in it. So a tab past an edge with an answer waiting
// puts that dot at the edge it is past — the same ink and ring — and the dot
// brings the tab into view.
//
// Held in the thread pane: a turn sent on the first tab, then enough new tabs
// that the row scrolls it out of sight on the left; when the answer lands, a
// dot at the left edge and none at the right; a click on it and the tab is in
// view — still waiting, since nobody has opened it — and the dot gone with it.
//
// Wants the `slow` stand-in CLI, a throwaway vault and a fresh state directory.
// See checks/README.md.
;(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
  const click = (el) => el && el.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  const pane = () => document.querySelector('[data-pane="0"]')
  const strip = () => pane()?.querySelector('[data-tabstrip]')
  const tabs = () => [...(strip()?.querySelectorAll('[data-tab]') ?? [])]
  const edge = (side) => pane()?.querySelector(`[data-tab-edge="${side}"]`)
  const key = (k) => window.dispatchEvent(new KeyboardEvent('keydown', { key: k, metaKey: true, bubbles: true }))
  const set = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set
  const inView = (t) => {
    const box = strip().getBoundingClientRect()
    const b = t.getBoundingClientRect()
    return b.left >= box.left - 1 && b.right <= box.right + 1
  }
  const log = {}
  await sleep(2600)
  // Whether an answer counts as seen is asked of the window's focus, so a window
  // that has none cannot show this at all — red, and why, rather than no verdict.
  log.windowHasFocus = document.hasFocus()
  if (!log.windowHasFocus) return JSON.stringify({ ...log, why: 'the app must be frontmost', pass: false }, null, 1)

  const c = pane().querySelector('textarea')
  set.call(c, 'the one that finishes out of sight')
  c.dispatchEvent(new Event('input', { bubbles: true }))
  await sleep(200)
  c.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))
  await sleep(400)

  // Enough new tabs that the first is scrolled out of sight: each is the active
  // one, at the far right, kept in view.
  for (let i = 0; i < 9 && !(strip().scrollWidth > strip().clientWidth + 1 && !inView(tabs()[0])); i++) {
    key('t')
    await sleep(500)
  }
  log.tabCount = tabs().length
  log.firstOutOfSight = !inView(tabs()[0])
  log.noDotWhileItRuns = !edge('left') && !edge('right')

  for (let i = 0; i < 40 && !edge('left'); i += 1) await sleep(500)
  log.leftDot = Boolean(edge('left'))
  log.noRightDot = !edge('right')
  // The unseen dot's own ink and ring: the edge's glyph is measured against the
  // mark on the tab it stands for, not merely for having a ring at all.
  const dot = edge('left')?.firstElementChild
  const mark = tabs()[0]?.querySelector('[data-tab-unseen="1"]')
  const look = (el) => el && { ink: getComputedStyle(el).backgroundColor, ring: getComputedStyle(el).boxShadow }
  log.edgeDot = look(dot)
  log.tabMark = look(mark)
  log.sameInk = Boolean(dot && mark) && log.edgeDot.ink === log.tabMark.ink
  log.sameRing = Boolean(dot && mark) && log.edgeDot.ring !== 'none' && log.edgeDot.ring === log.tabMark.ring

  click(edge('left'))
  await sleep(900)
  log.broughtIntoView = inView(tabs()[0])
  log.stillWaiting = tabs()[0].querySelector('[data-tab-unseen]')?.dataset.tabUnseen === '1'
  log.dotGone = !edge('left')

  log.pass = Boolean(
    log.firstOutOfSight &&
      log.noDotWhileItRuns &&
      log.leftDot &&
      log.noRightDot &&
      log.sameInk &&
      log.sameRing &&
      log.broughtIntoView &&
      log.stillWaiting &&
      log.dotGone
  )
  return JSON.stringify(log, null, 1)
})()
