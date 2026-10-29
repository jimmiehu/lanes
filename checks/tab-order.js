// A new tab opens at the far right of the strip, whichever tab was selected
// when it was asked for. See checks/README.md for how to run it.
(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
  const pane = () => document.querySelector('[data-pane="0"]')
  const tabs = () => [...pane().querySelectorAll('[data-tab]')]
  const labels = () => tabs().map((t) => t.textContent.replace(/×$/, '').trim())
  const last = () => labels()[labels().length - 1]
  const activeAt = () => tabs().findIndex((t) => t.getAttribute('data-tab-on') === '1')
  const railThreads = () => [...document.querySelectorAll('[data-rail-row="chat"]')]
  const click = (el, meta) =>
    el && el.dispatchEvent(new MouseEvent('click', { bubbles: true, metaKey: !!meta }))
  const cmd = (k) =>
    window.dispatchEvent(new KeyboardEvent('keydown', { key: k, metaKey: true, bubbles: true }))
  const log = {}
  await sleep(2800)

  // Three threads from the rail, each ⌘-clicked into a tab of its own.
  const rows = railThreads().slice(0, 3)
  log.railRows = rows.length
  const landedLast = []
  for (const r of rows) {
    const want = r.innerText.split('\n')[0].trim()
    click(r, true)
    await sleep(700)
    // Truncated in the strip, so compare on the head of the title.
    landedLast.push(last().startsWith(want.slice(0, 12)))
  }
  log.opened = labels()
  log.eachLandedLast = landedLast.every(Boolean)

  // Select a tab in the MIDDLE — this is where "beside the current tab" and
  // "at the end" part company.
  const middle = Math.max(0, tabs().length - 3)
  click(tabs()[middle], false)
  await sleep(500)
  log.selectedAt = activeAt()
  const before = labels()

  // ⌘T from there.
  cmd('t')
  await sleep(800)
  log.afterNew = labels()
  log.newTabIsLast = last() === 'New thread'
  log.newTabIsActive = activeAt() === tabs().length - 1
  log.othersKeptOrder =
    JSON.stringify(log.afterNew.slice(0, before.length)) === JSON.stringify(before)

  // And the same from the rail, still with a middle tab selected.
  click(tabs()[Math.max(0, tabs().length - 3)], false)
  await sleep(400)
  const spare = railThreads().find((r) => !labels().some((l) => r.innerText.startsWith(l.slice(0, 12))))
  log.foundSpare = Boolean(spare)
  if (spare) {
    const want = spare.innerText.split('\n')[0].trim()
    click(spare, true)
    await sleep(900)
    log.railOpenIsLast = last().startsWith(want.slice(0, 12))
    log.railOpenIsActive = activeAt() === tabs().length - 1
    log.finalStrip = labels()
  }

  // The note pane is the same rule — it is the same placement.
  const notes = () => [...document.querySelectorAll('[data-rail-row="note"]')]
  const notePane = () => document.querySelector('[data-pane="1"]')
  for (const n of notes().slice(0, 2)) {
    click(n, true)
    await sleep(900)
  }
  const noteTabs = () =>
    notePane() ? [...notePane().querySelectorAll('[data-tab]')] : []
  const third = notes()[2]
  if (third && noteTabs().length) {
    // Select the first note tab, then open another: it must still go last.
    click(noteTabs()[0], false)
    await sleep(400)
    const want = third.innerText.split('\n')[0].trim()
    click(third, true)
    await sleep(900)
    const noteLabels = noteTabs().map((t) => t.textContent.replace(/×$/, '').trim())
    log.noteStrip = noteLabels
    log.noteOpenIsLast = noteLabels[noteLabels.length - 1].startsWith(want.slice(0, 12))
  }

  // Held only where the strip had a choice to make: ⌘T asked for with a tab
  // other than the last selected, and a thread left in the rail to ⌘-click
  // from there. Both want threads in the rail — four, for the spare — so a
  // vault without them is red here rather than green on nothing.
  log.pass = Boolean(
    log.railRows > 0 &&
    log.eachLandedLast &&
    log.selectedAt < log.opened.length - 1 &&
    log.newTabIsLast &&
    log.newTabIsActive &&
    log.othersKeptOrder &&
    log.foundSpare &&
    log.railOpenIsLast &&
    log.railOpenIsActive &&
    log.noteOpenIsLast
  )
  return JSON.stringify(log, null, 1)
})()
