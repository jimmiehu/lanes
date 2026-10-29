// Both roads at once: a path left mid-answer keeps answering, and coming back
// to it shows the turn once.
//
// Two things this is really asking. That walking away does not stop the turn —
// nothing was reading its events, and its process is only reaped when there is
// nowhere left to come back to. And that walking back does not show the answer
// twice: the file and the stream name messages differently, so a pane that
// re-read the transcript could not tell the half-written answer on disk from
// the one still arriving.
//
// Run against a throwaway LANES_VAULT and LANES_STATE, and an empty session
// directory. See checks/README.md.
(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
  const pane = (i) => document.querySelector(`[data-pane="${i}"]`)
  const composer = () => pane(0).querySelector('textarea')
  const rowsBy = (role) => [...pane(0).querySelectorAll(`[data-msg-role="${role}"]`)]
  const click = (el) => el && el.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  const actionIn = (row, label) =>
    [...row.querySelectorAll('.msg-action')].find(
      (d) => d.textContent.trim().toLowerCase() === label
    )
  const seams = () => [...pane(0).querySelectorAll('[data-seam]')]
  // Every path on the seam EXCEPT the one being read. The seam lists them all
  // now, the active one marked, so "the other paths" is a filter rather than a
  // slice — `.slice(1)` used to drop the "from here" label and happened to be
  // right only because the active path was missing from the list.
  const labels = () =>
    seams()[0]
      ? [...seams()[0].querySelectorAll('[data-path-active="0"]')]
      : []
  /** The one you are reading, which the rule now names too. */
  const activeLabel = () => seams()[0]?.querySelector('[data-path-active="1"]')
  const busyDots = () => [...pane(0).querySelectorAll('[data-path-busy]')]
  const key = (k) =>
    window.dispatchEvent(new KeyboardEvent('keydown', { key: k, metaKey: true, bubbles: true }))
  const busy = () => /\bStop\b/.test(pane(0).innerText)
  const log = {}

  key('t')
  await sleep(1200)

  const type = (text) => {
    const set = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set
    set.call(composer(), text)
    composer().dispatchEvent(new Event('input', { bubbles: true }))
  }
  const send = async (text) => {
    type(text)
    await sleep(200)
    composer().dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })
    )
    await sleep(1200)
  }
  const settle = async () => {
    for (let i = 0; i < 90 && busy(); i++) await sleep(1000)
    await sleep(900)
    return !busy()
  }

  // One turn, so there is an answer to fork under.
  await send('The codeword is ZEPHYR. Reply with just: OK')
  log.firstTurn = await settle()

  const answer = rowsBy('claude')[0]
  const fork = answer && actionIn(answer, 'fork')
  log.forked = Boolean(fork)
  if (!fork) return { ...log, pass: false }
  click(fork)
  for (let i = 0; i < 30 && !seams().length; i++) await sleep(400)
  await sleep(800)
  log.onTheNewPath = seams().length === 1

  // A turn long enough to still be running when we walk away from it.
  await send('Write one paragraph about rivers. Include the word ONYX exactly once.')
  log.turnStarted = busy()
  log.claudeRowsBeforeLeaving = rowsBy('claude').length

  // --- WALK AWAY, mid-answer, by the seam. ---
  const other = labels()[0]
  log.seamOffered = Boolean(other)
  if (!other) return { ...log, pass: false }
  click(other)
  for (let i = 0; i < 30 && !busyDots().length; i++) await sleep(300)
  await sleep(600)

  // We are on the other path, and the seam says the one we left is still going.
  log.switchedAway = !busy()
  log.seamShowsItAnswering = busyDots().some((d) => d.dataset.pathBusy === 'answering')

  // --- IT KEEPS ANSWERING WITHOUT US. Wait it out from over here. ---
  for (let i = 0; i < 90 && busyDots().length; i++) await sleep(1000)
  await sleep(1200)
  log.finishedWhileAway = !busyDots().length

  // --- WALK BACK. The answer is there, and it is there ONCE. ---
  const back = labels()[0]
  log.seamOffersItBack = Boolean(back)
  if (back) {
    click(back)
    for (let i = 0; i < 30 && !/ONYX/i.test(pane(0).innerText); i++) await sleep(300)
    await sleep(700)
    const claude = rowsBy('claude')
    log.claudeRowsOnReturn = claude.length
    log.answerLanded = /ONYX/i.test(pane(0).innerText)
    // Two answers on this path: the one it was forked under, and the one it
    // wrote while we were elsewhere. A third would be the draft counted twice.
    log.noDuplicateTurn = claude.length === log.claudeRowsBeforeLeaving + 1
    // In the ANSWER, not in the pane: the question asked for the word too.
    const said = claude.length ? claude[claude.length - 1].innerText : ''
    log.onyxSaidOnce = (said.match(/ONYX/gi) || []).length === 1
  }

  // --- LETTING GO OF A PATH THAT IS STILL ANSWERING. The seam offers it with
  // the dot still on, so it has to stop the turn as well as trash the file —
  // otherwise a process runs on writing into the Trash, with the page it was
  // keeping unreachable because the seam that was the way back stops naming it.
  const rmb = (el) =>
    el &&
    el.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: 300, clientY: 300 }))
  const kicker = () =>
    [...document.querySelectorAll('div')].find(
      (d) => d.textContent.trim() === 'PATH' && !d.children.length
    )
  const menu = () => kicker()?.parentElement?.parentElement ?? null
  const item = (text) =>
    menu() ? [...menu().querySelectorAll('div')].find((d) => d.innerText.trim() === text) : null

  await send('Write one paragraph about mountains. Include the word BASALT exactly once.')
  log.secondTurnStarted = busy()
  const away2 = labels()[0]
  if (away2) {
    click(away2)
    for (let i = 0; i < 30 && !busyDots().length; i++) await sleep(300)
    await sleep(500)
    log.leftItAnsweringAgain = busyDots().some((d) => d.dataset.pathBusy === 'answering')

    // Find the label for the path that is still going, and let it go.
    const running = labels().find((l) => l.querySelector('[data-path-busy]'))
    log.busyPathOnTheSeam = Boolean(running)
    if (running) {
      rmb(running)
      await sleep(500)
      const trash = item('Let this path go')
      log.busyPathCanBeLetGo = Boolean(trash)
      if (trash) {
        click(trash)
        for (let i = 0; i < 40 && (seams().length || busyDots().length); i++) await sleep(300)
        await sleep(900)
        // Nothing left to come back to, and nothing still marked as running.
        log.seamGone = seams().length === 0
        log.nothingStillRunning = busyDots().length === 0
      }
    }
  }

  log.pass =
    log.firstTurn &&
    log.forked &&
    log.onTheNewPath &&
    log.turnStarted &&
    log.seamOffered &&
    log.switchedAway &&
    log.seamShowsItAnswering &&
    log.finishedWhileAway &&
    log.seamOffersItBack &&
    log.answerLanded &&
    log.noDuplicateTurn &&
    log.onyxSaidOnce &&
    log.secondTurnStarted &&
    log.leftItAnsweringAgain &&
    log.busyPathOnTheSeam &&
    log.busyPathCanBeLetGo &&
    log.seamGone &&
    log.nothingStillRunning
  return log
})()
