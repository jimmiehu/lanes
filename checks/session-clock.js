// The session clock in the top bar: how long is left in the five-hour window.
// A faint `5h` with no clock. It sets itself from the stream (usage-live.js);
// setting it by hand is the card's `set by hand` — a click on the clock opens
// the card — and that is a field holding `5:00`, selected, where ↵ starts five
// hours and typing says how much is left instead. A stray click, esc or
// clicking away starts nothing and changes nothing, so a clock you were
// counting on is never restarted by accident. What it is set to is in the
// state file, so it outlasts the app.
// Writes state, so wants a fresh LANES_STATE. See checks/README.md.
(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
  const clock = () => document.querySelector('[data-session-clock]')
  const field = () => document.querySelector('[data-session-clock="editing"] input')
  const read = () => ({ kind: clock()?.dataset.sessionClock, text: clock()?.textContent })
  // The clock, then the card's `set by hand`: the two clicks it takes now.
  const open = async () => {
    clock().dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await sleep(150)
    document
      .querySelector('[data-session-byhand]')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await sleep(150)
  }
  const type = async (text) => {
    const f = field()
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(f, text)
    f.dispatchEvent(new Event('input', { bubbles: true }))
    await sleep(50)
  }
  const key = async (k) => {
    field().dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true }))
    await sleep(200)
  }
  const saved = async () => (await window.lanes.bootstrap()).state.sessionEndsAt
  const log = {}
  await sleep(2500)
  // `selected` and the blur below are focus events, and Chromium sends those
  // only to a focused window: where this reads false, so do they, and it is the
  // harness that is out of front (a locked screen, another app), not the field.
  log.windowHasFocus = document.hasFocus()

  // It is in the top bar, at its right.
  const bar = clock()?.getBoundingClientRect()
  log.inTheTopBar = !!bar && bar.top < 50 && bar.left > window.innerWidth / 2

  // Clear whatever an earlier run left, the way a person would: empty and ↵.
  await open()
  await type('')
  await key('Enter')
  log.atRest = read()
  log.restsAsFaint5h = log.atRest.kind === 'off' && log.atRest.text === '5h'

  // A click is a field holding 5:00, selected, so ↵ is all a fresh window takes.
  await open()
  const f = field()
  log.fieldHolds = f?.value
  log.selected = f && f.selectionStart === 0 && f.selectionEnd === f.value.length
  log.focused = document.activeElement === f

  // Esc and clicking away start nothing.
  await key('Escape')
  log.escStartsNothing = read().kind === 'off' && (await saved()) === null
  await open()
  field().blur()
  await sleep(150)
  log.blurStartsNothing = read().kind === 'off' && (await saved()) === null

  // ↵ starts five hours.
  await open()
  const t0 = Date.now()
  await key('Enter')
  log.started = read()
  const end = await saved()
  log.startsFiveHours =
    log.started.kind === 'counting' &&
    log.started.text === '5:00' &&
    Math.abs(end - (t0 + 5 * 3_600_000)) < 5_000

  // Typing says how much is left instead.
  await open()
  await type('1:30')
  await key('Enter')
  log.setTo = read()
  log.setsWhatIsLeft = log.setTo.text === '1:30'

  // Something it cannot read is refused in place, and the clock stays.
  const before = await saved()
  await open()
  await type('soon')
  await key('Enter')
  log.refusedStaysOpen = !!field()
  await key('Escape')
  log.refusalKeepsTheClock = read().text === '1:30' && (await saved()) === before

  // The last quarter hour is drawn in ink, not mute.
  const mute = getComputedStyle(clock()).color
  await open()
  await type('10m')
  await key('Enter')
  log.lastQuarterInInk = read().text === '0:10' && getComputedStyle(clock()).color !== mute

  // A time already gone today is that time tomorrow.
  await open()
  await type('at ' + new Date(Date.now() - 60_000).toTimeString().slice(0, 5))
  await key('Enter')
  log.atAPastTimeIsTomorrow = (await saved()) > Date.now() + 23 * 3_600_000

  // Leave it as a fresh window, which is what a person would have running.
  await open()
  await key('Enter')
  log.endsCounting = read()

  log.pass = Boolean(
    log.inTheTopBar &&
    log.restsAsFaint5h &&
    log.fieldHolds === '5:00' &&
    log.selected &&
    log.focused &&
    log.startsFiveHours &&
    log.escStartsNothing &&
    log.blurStartsNothing &&
    log.setsWhatIsLeft &&
    log.refusedStaysOpen &&
    log.refusalKeepsTheClock &&
    log.lastQuarterInInk &&
    log.atAPastTimeIsTomorrow
  )
  return JSON.stringify(log, null, 1)
})()
