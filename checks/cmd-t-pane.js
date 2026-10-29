// ⌘T opens a new tab in the pane you are in, and the pane's role decides what
// a new tab is: a fresh thread in the thread pane, a blank tab in the note pane
// — never a yank to the left. blank-tab.js covers what that blank tab offers.
// See checks/README.md for how to run it.
(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
  const click = (el) => el && el.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  const cmdT = () =>
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 't', metaKey: true, bubbles: true }))
  const tabs = (i) => [...(document.querySelector(`[data-pane="${i}"]`)?.querySelectorAll('[data-tab]') ?? [])]
  const labels = (i) => tabs(i).map((t) => t.textContent.replace(/×$/, '').trim())
  const log = {}
  await sleep(3000)

  // --- thread pane: a fresh thread, in place ---
  const before0 = tabs(0).length
  cmdT()
  await sleep(800)
  log.threadPaneGrew = tabs(0).length === before0 + 1
  log.threadTabIsLast = labels(0)[labels(0).length - 1] === 'New thread'

  // --- note pane: a blank tab, not a yank to the left ---
  click(document.querySelector('[data-rail-row="note"]'))
  await sleep(1500)
  log.noteFocused = Boolean(document.querySelector('[data-pane="1"]'))
  const threadsBefore = tabs(0).length
  const notesBefore = tabs(1).length
  cmdT()
  await sleep(800)
  log.notePaneGrew = tabs(1).length === notesBefore + 1
  log.blankTabIsLast = labels(1)[labels(1).length - 1] === 'New note'
  log.showsTheEmptySurface = Boolean(document.querySelector('[data-empty-body="note"]'))
  log.noThreadWasMade = tabs(0).length === threadsBefore

  log.pass =
    log.threadPaneGrew &&
    log.threadTabIsLast &&
    log.noteFocused &&
    log.notePaneGrew &&
    log.blankTabIsLast &&
    log.showsTheEmptySurface &&
    log.noThreadWasMade
  return JSON.stringify(log, null, 1)
})()
