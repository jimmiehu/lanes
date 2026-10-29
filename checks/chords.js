// ⌘1–9 is the nth tab; ⌥1 is the browser rail. They were the other way round.
//
// ⌘-digit is the tab shortcut in every browser and every editor, which makes it
// the one chord nobody has to be told. Spending it on a panel meant the thing
// people reach for by muscle memory did nothing, and the jump it displaced sat
// on a modifier nobody guesses.
//
// Both are matched on `code`, never on `key`: Option is a compose modifier on
// macOS, so ⌥1 arrives as '¡', and a ⌘-digit on a non-US layout is not
// guaranteed to report the digit as `key` either. So this check presses the
// PHYSICAL key, which is the only thing the app agrees to read.
//
// Wants nothing but a state directory of its own.
// See checks/README.md for how to run it.
;(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
  const pane = () => document.querySelector('[data-pane="0"]')
  const tabs = () => [...pane().querySelectorAll('[data-tab]')]
  // The selected tab is the one with an ink underline. React set the
  // `borderBottom` shorthand, so ask the computed style, not the inline one.
  const active = () =>
    tabs().findIndex((t) => {
      const c = getComputedStyle(t).borderBottomColor
      return c !== 'rgba(0, 0, 0, 0)' && c !== 'transparent'
    })
  const rail = () => document.querySelector('[data-rail-shell]')
  const railW = () => Math.round(rail()?.getBoundingClientRect().width ?? -1)
  const chord = (code, mods) =>
    window.dispatchEvent(
      new KeyboardEvent('keydown', {
        code,
        key: code.replace('Digit', ''),
        bubbles: true,
        ...mods
      })
    )
  const log = {}
  await sleep(2600)

  // Three tabs to address.
  for (let i = 0; i < 2; i += 1) {
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 't', metaKey: true, bubbles: true }))
    await sleep(600)
  }
  log.tabs = tabs().length

  /* ---------- 1. ⌘-digit addresses tabs ---------- */

  chord('Digit1', { metaKey: true })
  await sleep(500)
  log.cmd1 = active()
  chord('Digit3', { metaKey: true })
  await sleep(500)
  log.cmd3 = active()
  chord('Digit2', { metaKey: true })
  await sleep(500)
  log.cmd2 = active()
  log.cmdAddressesTabs = log.cmd1 === 0 && log.cmd3 === 2 && log.cmd2 === 1

  // A digit past the end of the strip is not an error, it is a no-op.
  chord('Digit9', { metaKey: true })
  await sleep(400)
  log.pastTheEndDoesNothing = active() === 1

  /* ---------- 2. and does not touch the rail ---------- */

  const wide = railW()
  log.railWidth = wide
  chord('Digit1', { metaKey: true })
  await sleep(600)
  log.railUnmovedByCmd = railW() === wide

  /* ---------- 3. ⌥1 is the rail, and does not touch the tabs ---------- */

  const onTab = active()
  chord('Digit1', { altKey: true })
  await sleep(900)
  log.hiddenWidth = railW()
  log.alt1Hides = railW() < wide
  log.tabUnmovedByAlt = active() === onTab
  chord('Digit1', { altKey: true })
  await sleep(900)
  log.alt1ShowsAgain = railW() === wide

  // ⌥2–9 stay what they were for: nothing. Only ⌥1 is the panel.
  chord('Digit2', { altKey: true })
  await sleep(500)
  log.altOtherDigitsAreInert = railW() === wide && active() === onTab

  log.pass =
    log.tabs === 3 &&
    log.cmdAddressesTabs &&
    log.pastTheEndDoesNothing &&
    log.railUnmovedByCmd &&
    log.alt1Hides &&
    log.tabUnmovedByAlt &&
    log.alt1ShowsAgain &&
    log.altOtherDigitsAreInert
  return JSON.stringify(log, null, 1)
})()
