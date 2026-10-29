// Where a thread forks, marked down its left margin.
//
// A seam is drawn in the transcript as a rule with the other paths named on it.
// That is the right thing to read when you REACH it and no help at all in
// finding it: on a long thread the only way to learn there is a fork, or to get
// back to one, was to scroll until you met it.
//
// So: a hairline standing for the whole thread with one tick per seam at the
// height that seam actually sits at, the one you last passed drawn longer, and
// a click that goes there. This asserts the map is true — a tick per seam, in
// the right place, that navigates — and that a thread with no fork draws
// nothing at all, which is nearly every thread in a vault in daily use.
//
// Spends turns and forks a thread, so run it against a throwaway LANES_VAULT
// and LANES_STATE with an empty session directory. See checks/README.md.
;(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
  const pane = () => document.querySelector('[data-pane="0"]')
  const composer = () => pane().querySelector('textarea')
  const click = (el) => el && el.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  const busy = () => /\bStop\b/.test(pane().innerText)
  const rowsBy = (role) => [...pane().querySelectorAll(`[data-msg-role="${role}"]`)]
  const actionIn = (row, label) =>
    [...row.querySelectorAll('.msg-action')].find(
      (d) => d.textContent.trim().toLowerCase() === label
    )
  const ticks = () => [...document.querySelectorAll('[data-path-tick]')]
  const seams = () => [...pane().querySelectorAll('[data-seam-n]')]
  const scroller = () => pane().querySelector('[data-find-scope]')
  const set = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set
  const say = async (text) => {
    set.call(composer(), text)
    composer().dispatchEvent(new Event('input', { bubbles: true }))
    await sleep(200)
    composer().dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })
    )
    await sleep(800)
    for (let i = 0; i < 120 && busy(); i++) await sleep(1000)
    await sleep(600)
  }
  const log = {}
  await sleep(2600)

  /* ---------- 1. an unforked thread draws nothing ---------- */

  // Long answers on purpose: a transcript that fits the pane cannot be scrolled,
  // and a jump with nowhere to go proves nothing about a jump.
  const LONG = 'Write eight full sentences about the sea. Plain prose, no lists.'
  await say(LONG)
  await say(LONG)
  await say(LONG)
  log.turns = rowsBy('claude').length
  log.noRailBeforeAFork = ticks().length === 0
  log.noSeamsYet = seams().length === 0

  /* ---------- 2. fork it, and a tick appears ---------- */

  // Fork under the FIRST answer, so the seam lands high up the transcript and
  // its position is something the rail can be wrong about.
  const first = rowsBy('claude')[0]
  click(actionIn(first, 'fork'))
  await sleep(1800)
  await say(LONG)
  await say(LONG)

  log.seamCount = seams().length
  log.tickCount = ticks().length
  log.oneTickPerSeam = log.tickCount === log.seamCount && log.tickCount > 0
  log.railAppeared = Boolean(document.querySelector('[data-path-ticks="1"]'))

  /* ---------- 3. the tick is where the seam is ---------- */

  // The claim the whole thing rests on: a tick's height in the rail is the
  // seam's own position in the transcript, so the map is not a decoration.
  const sc = scroller()
  const rail = document.querySelector('[data-path-ticks="1"]')
  const railBox = rail.getBoundingClientRect()
  const seamNode = seams()[0]
  const seamAt =
    sc.scrollTop + (seamNode.getBoundingClientRect().top - sc.getBoundingClientRect().top)
  const wantFrac = seamAt / sc.scrollHeight
  const gotFrac = (ticks()[0].getBoundingClientRect().top - railBox.top) / railBox.height
  log.seamFraction = Math.round(wantFrac * 100) / 100
  log.tickFraction = Math.round(gotFrac * 100) / 100
  log.tickSitsWhereTheSeamIs = Math.abs(wantFrac - gotFrac) < 0.06

  /* ---------- 4. and clicking it goes there ---------- */

  log.scrollable = sc.scrollHeight - sc.clientHeight
  sc.scrollTop = sc.scrollHeight
  await sleep(500)
  const before = sc.scrollTop
  click(ticks()[0])
  await sleep(1400)
  log.movedTheReader = Math.abs(sc.scrollTop - before) > 40
  const landed =
    seams()[0].getBoundingClientRect().top - sc.getBoundingClientRect().top
  log.landedAt = Math.round(landed)
  // The same landing the note outline uses, so both margins set you down alike.
  log.landedUnderTheTop = Math.abs(landed - 22) < 40

  /* ---------- 5. the mark follows the reading ---------- */

  log.markedAfterTheJump = ticks().filter((t) => t.dataset.pathTickOn === '1').length
  sc.scrollTop = 0
  await sleep(700)
  log.nothingMarkedAboveTheFirstFork =
    ticks().filter((t) => t.dataset.pathTickOn === '1').length === 0

  /* ---------- 6. it is a button, so it is reachable ---------- */

  log.isAButton = ticks()[0].tagName === 'BUTTON'
  // A 1px hairline is not a click target. The mark is a dot with a real square
  // of hit area around it, which is what makes it a control.
  const box = ticks()[0].getBoundingClientRect()
  log.hitArea = [Math.round(box.width), Math.round(box.height)]
  log.bigEnoughToHit = box.width >= 12 && box.height >= 12
  const dot = ticks()[0].querySelector('.path-dot')
  log.drawsADot = Boolean(dot) && getComputedStyle(dot).borderRadius !== '0px'
  log.namesTheOtherPath = /parts|answering|Waiting/.test(ticks()[0].getAttribute('title') ?? '')

  log.pass =
    log.noRailBeforeAFork &&
    log.oneTickPerSeam &&
    log.railAppeared &&
    log.tickSitsWhereTheSeamIs &&
    log.movedTheReader &&
    log.landedUnderTheTop &&
    log.markedAfterTheJump === 1 &&
    log.nothingMarkedAboveTheFirstFork &&
    log.isAButton &&
    log.bigEnoughToHit &&
    log.drawsADot &&
    log.namesTheOtherPath
  return JSON.stringify(log, null, 1)
})()
