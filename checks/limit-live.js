// A usage limit, drawn as the wait it is — and a real error left alone.
//
// The limit used to arrive as stderr: mono, on the code ground, in the box kept
// for machine output you did not ask for. Which is what it literally is and
// exactly the wrong thing to say about it. Nothing is broken and the only fact
// worth having is when it lifts, so the clock is the biggest thing on the card
// and it counts down.
//
// The other half matters more: an error that merely mentions a limit must NOT
// become a countdown. `checks/limit.mjs` proves that against every shape the
// CLI is known to use; this one proves the app wires it up.
//
// And the session clock in the top bar is set from it: a session limit that
// says when it lifts is the real end of the window, so the clock reads that —
// 2:15 for the stub's 8,100 seconds — and the fault leaves the clock alone.
//
// Wants a stand-in CLI. See checks/README.md for the two of them.
;(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
  const pane = () => document.querySelector('[data-pane="0"]')
  const set = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set
  const log = {}
  await sleep(2600)
  const session = () => document.querySelector('[data-session-clock]')
  const sessionBefore = session()?.textContent

  const c = pane().querySelector('textarea')
  set.call(c, 'anything at all')
  c.dispatchEvent(new Event('input', { bubbles: true }))
  await sleep(200)
  c.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))

  for (let i = 0; i < 60; i += 1) {
    await sleep(300)
    if (document.querySelector('[data-limit]') || /limit/i.test(pane().innerText)) break
  }

  const card = document.querySelector('[data-limit]')
  log.sawACard = Boolean(card)
  if (!card) {
    // The stub was the one that reports a FAULT: it must not be dressed up.
    log.noCountdownForAFault = true
    log.showedTheErrorInstead = /limit reached/i.test(pane().innerText)
    log.sessionClockUntouched = session()?.textContent === sessionBefore
    log.pass = log.showedTheErrorInstead && log.sessionClockUntouched
    return JSON.stringify(log, null, 1)
  }

  const clock = document.querySelector('[data-limit-clock]')
  log.scope = card.dataset.limit
  log.counting = clock?.dataset.limitClock === 'counting'
  const first = clock?.textContent
  log.reads = first
  log.looksLikeAClock = /^\d+:\d{2}(:\d{2})?$/.test(first ?? '')
  // Tabular, or the digits shift under each other once a second.
  log.tabular = /tabular-nums/.test(getComputedStyle(clock).fontVariantNumeric)
  await sleep(2200)
  log.ticks = clock?.textContent !== first
  // The stderr box is not shown as well — this replaces it, it does not join it.
  log.stderrBoxGone = !pane().querySelector('[style*="var(--code)"]')
  // And the CLI's own sentence is still on screen, as the evidence for the rest.
  log.keepsWhatTheCliSaid = /usage limit reached/i.test(card.innerText)
  // The top bar's clock now counts to the same moment.
  log.sessionClock = session()?.textContent
  log.sessionClockSetFromIt =
    session()?.dataset.sessionClock === 'counting' && /^2:1[45]$/.test(log.sessionClock ?? '')

  log.pass =
    log.counting &&
    log.looksLikeAClock &&
    log.tabular &&
    log.ticks &&
    log.stderrBoxGone &&
    log.keepsWhatTheCliSaid &&
    log.sessionClockSetFromIt
  return JSON.stringify(log, null, 1)
})()
