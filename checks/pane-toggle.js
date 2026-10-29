// The one/two-pane toggle keeps the pane you are in. Collapsing while reading a
// note leaves the note up, not the thread you had left.
// See checks/README.md for how to run it.
(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
  const click = (el, meta) =>
    el && el.dispatchEvent(new MouseEvent('click', { bubbles: true, metaKey: !!meta }))
  const panes = () => [...document.querySelectorAll('[data-pane]')].map((p) => p.dataset.pane)
  // The chip says which state it will move you TO, so its title names the other.
  const toggle = () => document.querySelector('[title^="One pane"], [title^="Two panes"]')
  const noteRows = () => [...document.querySelectorAll('[data-rail-row="note"]')]
  const threadRows = () => [...document.querySelectorAll('[data-rail-row="chat"]')]
  const log = {}
  await sleep(2800)

  log.atRest = panes()

  // Opening a note opens the split and puts you in the note pane.
  click(noteRows()[0], false)
  await sleep(1200)
  log.afterNote = panes()
  log.splitOpened = panes().length === 2

  // Collapse from there: the note pane is the one that stays.
  click(toggle())
  await sleep(800)
  log.afterCollapseOnNote = panes()
  log.keptTheNotePane = panes().length === 1 && panes()[0] === '1'

  // Back to two, and the note pane is still where you are.
  click(toggle())
  await sleep(800)
  log.afterReopen = panes()
  log.reopensToTwo = panes().length === 2

  // Now stand in the thread pane and collapse: that one stays instead.
  click(document.querySelector('[data-pane="0"]'), false)
  await sleep(500)
  click(toggle())
  await sleep(800)
  log.afterCollapseOnThread = panes()
  log.keptTheThreadPane = panes().length === 1 && panes()[0] === '0'

  // And a thread still comes back on its own pane from the note side.
  click(noteRows()[1], false)
  await sleep(1200)
  click(toggle())
  await sleep(800)
  log.soloNoteAgain = panes()
  click(threadRows()[0], false)
  await sleep(1200)
  log.afterOpeningAThread = panes()
  log.threadBringsItsPane = panes().includes('0')

  // The thread only brings its pane back if the note stood alone before it.
  log.pass =
    log.splitOpened &&
    log.keptTheNotePane &&
    log.reopensToTwo &&
    log.keptTheThreadPane &&
    log.soloNoteAgain.length === 1 &&
    log.soloNoteAgain[0] === '1' &&
    log.threadBringsItsPane
  return JSON.stringify(log, null, 1)
})()
