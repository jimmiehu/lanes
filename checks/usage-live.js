// THE CLOCK READS ITSELF, AND DRAWS WHAT IS USED AS A RING.
//
// Every turn's stream ends with a `rate_limit_event` saying how much of the
// five-hour window and of the week is used, and when each resets. The app
// dropped it, and the top bar asked to be told by hand when the window ends
// (red: still `5h` after a turn that said all of it).
//
// So: a turn sets the clock, with the figures in the state file. The share of
// the window used is a RING before the time left — filled clockwise as far as
// the window is used, plain below 70%, orange from it and red from 90% — and
// the number itself is in the tooltip's words and the card (red at the commit
// before: `17% · 2:15` as text, no ring). The ring's colour is checked against
// the token's own value as the browser resolves it, not against a string the
// code also wrote; plain is the bar's own ink, whatever the time is wearing.
//
// The same check runs at the three shares the stand-in can be told to say —
// STUB_USED=0.17, 0.75 and 0.93 — and reads which from the state file, so each
// run expects plain, orange or red for the share it was given.
//
// A click discloses rather than edits: a card with both windows, each figure in
// the ring's colours at the ring's thresholds, the week's reset with its day,
// and when the figures were said, since they come only with a turn. Before any
// turn the card says there are none yet. Setting by hand is inside it, and is
// still today's field; a clock set by hand to another end draws no ring, since
// the figures are not about that window — and the next turn, which knows, sets
// it back.
//
// Wants the `usage` stand-in CLI (see checks/README.md) and a fresh
// LANES_STATE, once per share:
//
//   STUB_USED=0.75 LANES_CLAUDE=/tmp/stub/usage LANES_STATE=/tmp/lanes-usage \
//     LANES_CAPTURE=/tmp/u.png LANES_CAPTURE_EXEC=checks/usage-live.js npm run dev
;(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
  const pane = () => document.querySelector('[data-pane="0"]')
  const clock = () => document.querySelector('[data-session-clock]')
  const ring = () => clock()?.querySelector('[data-session-ring]')
  const arc = () => ring()?.querySelector('[data-ring-arc]')
  const card = () => document.querySelector('[data-session-card]')
  const field = () => document.querySelector('[data-session-clock="editing"] input')
  const click = (el) => el && el.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  const press = (k, on = window) =>
    on.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }))
  const saved = async () => (await window.lanes.bootstrap()).state
  const send = async (text) => {
    const c = pane().querySelector('textarea')
    Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set.call(c, text)
    c.dispatchEvent(new Event('input', { bubbles: true }))
    await sleep(200)
    press('Enter', c)
  }
  const waitFor = async (test, ms = 15000) => {
    for (let t = 0; t < ms && !test(); t += 250) await sleep(250)
    return test()
  }
  // A token as the browser resolves it, in the form a computed colour comes back
  // in — null for one the theme does not define, which would otherwise resolve
  // to whatever colour it inherited and pass for anything.
  const token = (name) => {
    if (!getComputedStyle(document.documentElement).getPropertyValue(name).trim()) return null
    const probe = document.createElement('div')
    probe.style.color = `var(${name})`
    document.body.appendChild(probe)
    const c = getComputedStyle(probe).color
    probe.remove()
    return c
  }
  const flat = (el) => el?.innerText.replace(/\s+/g, ' ').trim() ?? null
  const log = {}
  await sleep(2600)

  // --- before any turn: nothing has set it, no ring, and the card says so ---
  log.before = clock()?.textContent
  log.restsFaint = clock()?.dataset.sessionClock === 'off' && log.before === '5h' && !ring()
  click(clock())
  await sleep(250)
  log.cardBeforeTurn = flat(card())
  log.saysNoFiguresYet = /No figures yet/.test(log.cardBeforeTurn ?? '')
  press('Escape')
  await sleep(200)
  log.escClosesCard = !card()

  // --- a turn sets it ---
  await send('anything at all')
  log.ringed = await waitFor(() => Boolean(ring()) && /^\d:\d\d$/.test(clock()?.textContent ?? ''))
  log.after = clock()?.textContent
  log.counting = clock()?.dataset.sessionClock === 'counting'
  const st = await saved()
  const used = st.usage?.session?.used ?? null
  log.savedUsage = { session: used, week: st.usage?.week?.used ?? null }
  log.savedBoth = typeof used === 'number' && log.savedUsage.week === 0.02
  log.clockIsTheWindowsEnd =
    st.sessionEndsAt !== null && st.sessionEndsAt === st.usage?.session?.resetsAt

  // What this run was told to say, and so what it expects: the README's rule,
  // by the figure the tooltip and the card show.
  const shown = Math.round((used ?? 0) * 100)
  log.share = `${shown}%`
  log.expect = shown >= 90 ? 'alarm' : shown >= 70 ? 'warn' : 'plain'

  // The time alone is the text; the share is not a number in the bar any more.
  log.readsTimeOnly = /^2:1[45]$/.test(log.after ?? '') && !/%/.test(log.after ?? '')

  // The ring: first, before the time, about the height of the digits, centred on them.
  const rb = ring()?.getBoundingClientRect()
  const cb = clock()?.getBoundingClientRect()
  log.ringBox = rb ? { w: Math.round(rb.width), h: Math.round(rb.height) } : null
  log.ringBeforeTime = Boolean(ring()) && clock()?.firstElementChild === ring()
  log.ringSized = !!rb && rb.height >= 9 && rb.height <= 13 && Math.abs(rb.width - rb.height) < 0.5
  log.ringCentred = !!rb && !!cb && Math.abs(rb.top + rb.height / 2 - (cb.top + cb.height / 2)) <= 1.5

  // Filled clockwise from twelve as far as the window is used.
  const a = arc()
  const r = Number(a?.getAttribute('r'))
  const dash = Number((a?.getAttribute('stroke-dasharray') ?? '').split(/[ ,]+/)[0])
  log.fill = a ? Math.round((dash / (2 * Math.PI * r)) * 1000) / 1000 : null
  log.fillIsTheShare = log.fill !== null && Math.abs(log.fill - Math.min(used ?? 0, 1)) < 0.005
  log.fromTwelve = /rotate\(-90/.test(a?.getAttribute('transform') ?? '')

  // Its colour, against the token's own value.
  const stroke = a ? getComputedStyle(a).stroke : null
  const warn = token('--warn')
  const alarm = token('--alarm')
  log.colours = { stroke, warn, alarm, ink: getComputedStyle(clock()).color }
  log.tone = ring()?.dataset.sessionRing
  log.toneIsExpected = log.tone === log.expect
  log.twoHues = !!warn && !!alarm && warn !== alarm && warn !== token('--findNow') && alarm !== token('--findNow')
  log.wearsItsTone =
    log.expect === 'warn'
      ? stroke === warn
      : log.expect === 'alarm'
        ? stroke === alarm
        : stroke === getComputedStyle(clock()).color && stroke !== warn && stroke !== alarm

  // The number is in the tooltip's words.
  log.tooltip = clock()?.title
  log.tooltipSays = new RegExp(
    `^${shown}% of this session used — 2:1[45] left, resets \\d{1,2}:\\d{2}`
  ).test(log.tooltip ?? '')

  // --- a click discloses both windows, in the ring's colours ---
  click(clock())
  await sleep(250)
  const row = (id) => card()?.querySelector(`[data-usage-row="${id}"]`)
  const figure = (id) => row(id)?.querySelector('[data-usage-figure]')
  log.sessionRow = flat(row('session'))
  log.weekRow = flat(row('week'))
  // The session resets 2:15 from now, which after 21:45 is tomorrow — and a
  // reset on another day names the day (`resets Wed 14 Oct, 01:27`), as the
  // week's row does. Held to exactly that: the day when it is another day,
  // none when it is today.
  const resetsToday = new Date(Date.now() + 8100_000).toDateString() === new Date().toDateString()
  const day = resetsToday ? '' : '\\w{3} \\d{1,2} \\w{3}, '
  log.sessionRowSays = new RegExp(`^SESSION ${shown}% resets ${day}\\d{1,2}:\\d{2}`).test(log.sessionRow ?? '')
  // A reset six days out says its day, not just a time of day.
  log.weekRowSays = /^WEEK 2% resets \S+.*\d{1,2}:\d{2}$/.test(log.weekRow ?? '') && /,/.test(log.weekRow ?? '')
  const sessionFigure = figure('session') ? getComputedStyle(figure('session')).color : null
  const weekFigure = figure('week') ? getComputedStyle(figure('week')).color : null
  log.figures = { session: sessionFigure, week: weekFigure }
  // The session's figure wears the ring's colour; the week, at 2%, is ink.
  log.sessionFigureMatches =
    log.expect === 'plain' ? sessionFigure === token('--ink') : sessionFigure === stroke
  log.weekFigureIsInk = weekFigure === token('--ink')
  log.seen = card()?.querySelector('[data-usage-seen]')?.textContent ?? null
  log.saysWhenSaid = /^as of \d{1,2}:\d{2}/.test(log.seen ?? '')
  // A press outside closes it.
  document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
  await sleep(200)
  log.outsideClosesCard = !card()

  // --- setting by hand is inside it, and is today's field ---
  click(clock())
  await sleep(250)
  click(card()?.querySelector('[data-session-byhand]'))
  await sleep(250)
  log.byHandIsTheField = field()?.value === '5:00' && document.activeElement === field()
  press('Escape', field())
  await sleep(200)
  log.escLeavesItAsItWas = clock()?.textContent === log.after && Boolean(ring())

  // A clock set to another end is not the window the figures are about.
  click(clock())
  await sleep(250)
  click(card()?.querySelector('[data-session-byhand]'))
  await sleep(250)
  const f = field()
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(f, '1:00')
  f.dispatchEvent(new Event('input', { bubbles: true }))
  await sleep(50)
  press('Enter', f)
  await sleep(300)
  log.handSet = clock()?.textContent
  log.handSetDrawsNoRing = log.handSet === '1:00' && !ring() && Boolean(clock())

  // --- and the next turn, which knows, sets it back ---
  await send('and again')
  log.setBack = await waitFor(() => Boolean(ring()) && /^2:1[45]$/.test(clock()?.textContent ?? ''))
  log.afterSecond = clock()?.textContent

  log.pass = Boolean(
    log.restsFaint &&
      log.saysNoFiguresYet &&
      log.escClosesCard &&
      log.ringed &&
      log.readsTimeOnly &&
      log.counting &&
      log.savedBoth &&
      log.clockIsTheWindowsEnd &&
      log.ringBeforeTime &&
      log.ringSized &&
      log.ringCentred &&
      log.fillIsTheShare &&
      log.fromTwelve &&
      log.toneIsExpected &&
      log.twoHues &&
      log.wearsItsTone &&
      log.tooltipSays &&
      log.sessionRowSays &&
      log.weekRowSays &&
      log.sessionFigureMatches &&
      log.weekFigureIsInk &&
      log.saysWhenSaid &&
      log.outsideClosesCard &&
      log.byHandIsTheField &&
      log.escLeavesItAsItWas &&
      log.handSetDrawsNoRing &&
      log.setBack
  )
  return JSON.stringify(log, null, 1)
})()
