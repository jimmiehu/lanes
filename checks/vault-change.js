// THE VAULT IS CHANGED FROM SETTINGS — AND A RUNNING TURN IS ASKED ABOUT FIRST.
//
// Settings → Notes & lanes shows the folder Lanes works in, with Change…. While
// a turn runs anywhere, Change… changes nothing: it asks, in the shape every
// question here has that could cost something — "A turn is running.", Keep
// working the default and the one the focus is on, Switch and stop it a click
// of its own. Change… pressed again closes the question rather than answering
// it; esc closes it and not Settings. Switch and stop it then asks main for
// another folder, which a driven run refuses — its folder is LANES_VAULT's —
// and the row says so in words. With no turn running, Change… goes straight
// to main, asking nothing.
//
// Red before: Settings had no vault row.
// Wants the `slow` stand-in, held open by STUB_DELAY; spends no turns.
;(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
  const click = (el) => el && el.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  const key = (k, opts = {}) =>
    window.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...opts }))
  /** Esc where a real one goes: to what has the focus. */
  const esc = () =>
    (document.activeElement ?? document.body).dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
    )
  const q = (sel) => document.querySelector(sel)
  const ask = () => q('[data-vault-ask]')
  const keep = () => q('[data-vault="keep"]')
  const yes = () => q('[data-vault="yes"]')
  const change = () => q('[data-vault-change="1"]')
  const row = () => q('[data-vault-row="1"]')
  const settingsOpen = () => Boolean(q('[data-settings-tab]'))
  /** Main was asked: in a driven run it refuses, and the row says why. */
  const refused = () => /LANES_VAULT/.test(row()?.innerText ?? '')
  const openSettings = async () => {
    key(',', { metaKey: true })
    await sleep(600)
    click(q('[data-settings-more="1"]'))
    await sleep(600)
    click(q('[data-settings-tab="threads"]'))
    await sleep(400)
  }
  const log = {}
  await sleep(2600)

  // A turn, held open by the stand-in.
  const c = q('[data-pane="0"] textarea')
  const set = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set
  set.call(c, 'a turn that takes its time')
  c.dispatchEvent(new Event('input', { bubbles: true }))
  await sleep(200)
  c.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))
  const sent = Date.now()
  await sleep(600)

  await openSettings()
  log.row = Boolean(row())
  log.path = q('[data-vault-path="1"]')?.textContent ?? null
  log.showsTheFolder = Boolean(log.path) && log.path.startsWith('/')

  // --- a running turn: Change… asks ---
  click(change())
  await sleep(250)
  log.asks = Boolean(ask())
  log.says = ask()?.innerText ?? null
  log.saysATurnIsRunning = /A turn is running\./.test(log.says ?? '')
  log.answers = [yes()?.textContent, keep()?.textContent]
  log.namedAnswers = log.answers.join() === 'Switch and stop it,Keep working'
  log.keepFocused = Boolean(keep()) && document.activeElement === keep()

  // --- pressed again, it closes the question ---
  click(change())
  await sleep(250)
  log.pressedAgainIsNo = !ask() && !refused()

  // --- esc closes the question, not Settings, three times over ---
  let escKept = true
  for (let i = 0; i < 3; i++) {
    click(change())
    await sleep(200)
    const opened = Boolean(ask())
    esc()
    await sleep(200)
    escKept = escKept && opened && !ask() && settingsOpen()
  }
  log.escClosesOnlyTheQuestion = escKept && !refused()

  // --- Keep keeps ---
  click(change())
  await sleep(200)
  click(keep())
  await sleep(250)
  log.keepCloses = !ask() && settingsOpen() && !refused()

  // --- Switch and stop it reaches main, which refuses a driven run's folder in words ---
  click(change())
  await sleep(200)
  click(yes())
  await sleep(800)
  log.yesClosesTheQuestion = !ask()
  log.after = row()?.innerText ?? ''
  log.refusalSaid = refused()
  log.stillOpen = settingsOpen()

  // --- with the turn over, Change… goes straight to main ---
  // Settings closed and opened again, so the row starts with nothing said.
  esc()
  await sleep(400)
  log.closedForNow = !settingsOpen()
  const wait = 14000 - (Date.now() - sent)
  if (wait > 0) await sleep(wait)
  await openSettings()
  log.freshRowSaysNothing = Boolean(row()) && !refused()
  click(change())
  await sleep(800)
  log.noTurnNoQuestion = !ask()
  log.straightToMain = refused()

  log.pass = Boolean(
    log.row &&
      log.showsTheFolder &&
      log.asks &&
      log.saysATurnIsRunning &&
      log.namedAnswers &&
      log.keepFocused &&
      log.pressedAgainIsNo &&
      log.escClosesOnlyTheQuestion &&
      log.keepCloses &&
      log.yesClosesTheQuestion &&
      log.refusalSaid &&
      log.stillOpen &&
      log.closedForNow &&
      log.freshRowSaysNothing &&
      log.noTurnNoQuestion &&
      log.straightToMain
  )
  return JSON.stringify(log, null, 1)
})()
