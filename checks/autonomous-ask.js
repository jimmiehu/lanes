// AUTONOMOUS ASKS FIRST — AND THE SCHEDULES SWITCH SAYS WHAT IT MEANS.
//
// Settings → Safety: choosing Autonomous does not choose it. It asks, saying
// what it allows — Claude runs any command and edits any file in this folder
// without asking — in the shape every question here has that could cost
// something: Keep is the answer that loses nothing and the one the focus is
// on, so ↵ or space straight after keeps; Autonomous pressed again closes the
// question rather than answering it; esc closes the question and not
// Settings; yes is a click on its own button. Standard chosen from Autonomous
// asks nothing.
//
// Settings → Prompts: the same question when a prompt's own safety is set to
// Autonomous, and a yes there is kept on that prompt (`autonomousConfirmed`),
// which is what lets a scheduled run of it be Autonomous; set to anything
// else, the yes goes with it. And the switch that lets prompts keep time at
// all — off on a new install, saying when runs happen.
//
// Red before: Autonomous was chosen on the click, and there was no switch.
// Writes state, so a fresh LANES_STATE; spends no turns.
;(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
  const click = (el) => el && el.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  const key = (k, opts = {}) =>
    window.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...opts }))
  /**
   * Esc where a real one goes: to what has the focus. (Sent to the window
   * itself, its listeners run in the order they were added, capture or not —
   * which no key from the keyboard does.)
   */
  const esc = () =>
    (document.activeElement ?? document.body).dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
    )
  const set = (el, v) => {
    if (!el) return
    const proto = el instanceof HTMLTextAreaElement ? window.HTMLTextAreaElement : window.HTMLInputElement
    Object.getOwnPropertyDescriptor(proto.prototype, 'value').set.call(el, v)
    el.dispatchEvent(new Event('input', { bubbles: true }))
  }
  const q = (sel) => document.querySelector(sel)
  const state = async () => (await window.lanes.bootstrap()).state
  /** A Safety row, by its marker — or, on a build without one, by its label. */
  const safetyRow = (id, label) =>
    q(`[data-safety-choice="${id}"]`) ??
    [...document.querySelectorAll('.hoverable')].find((el) =>
      [...el.querySelectorAll('div')].some((d) => d.textContent === label && d.children.length === 0)
    )
  const ask = () => q('[data-autonomous-ask]')
  const yes = () => q('[data-autonomous="yes"]')
  const keep = () => q('[data-autonomous="keep"]')
  const settingsOpen = () => Boolean(q('[data-settings-tab]'))
  const choice = (id) => q(`[data-prompt-editor] [data-prompt-choice="safety"] [data-choice="${id}"]`)
  const chosen = (id) => choice(id)?.dataset.choiceOn === '1'
  const kept = async (name) => (await state()).prompts.find((p) => p.name === name)
  const log = {}
  await sleep(2600)

  key(',', { metaKey: true })
  await sleep(600)
  click(q('[data-settings-more="1"]'))
  await sleep(600)
  click(q('[data-settings-tab="safety"]'))
  await sleep(400)
  log.startsStandard = (await state()).safety === 'standard'

  // --- Autonomous asks, and says what it allows ---
  click(safetyRow('autonomous', 'Autonomous'))
  await sleep(250)
  log.asks = Boolean(ask())
  log.notChosenYet = (await state()).safety === 'standard'
  log.says = ask()?.innerText ?? null
  log.saysWhatItAllows = /Claude runs any command and edits any file in this folder without asking/.test(log.says ?? '')
  log.keepFocused = Boolean(keep()) && document.activeElement === keep()

  // --- pressed again, it closes the question ---
  click(safetyRow('autonomous', 'Autonomous'))
  await sleep(250)
  log.pressedAgainIsNo = !ask() && (await state()).safety === 'standard'

  // --- esc closes the question, not Settings; six times is three opens and three closes ---
  let escKept = true
  for (let i = 0; i < 3; i++) {
    click(safetyRow('autonomous', 'Autonomous'))
    await sleep(200)
    const opened = Boolean(ask())
    esc()
    await sleep(200)
    escKept = escKept && opened && !ask() && settingsOpen()
  }
  log.escClosesOnlyTheQuestion = escKept && (await state()).safety === 'standard'

  // --- Keep keeps ---
  click(safetyRow('autonomous', 'Autonomous'))
  await sleep(200)
  click(keep())
  await sleep(250)
  log.keepKeeps = !ask() && (await state()).safety === 'standard'

  // --- yes is a click on its own button ---
  click(safetyRow('autonomous', 'Autonomous'))
  await sleep(200)
  click(yes())
  await sleep(300)
  log.yesChooses = !ask() && (await state()).safety === 'autonomous'

  // --- back down asks nothing ---
  click(safetyRow('standard', 'Standard'))
  await sleep(300)
  log.downAsksNothing = !ask() && (await state()).safety === 'standard'

  // --- Settings → Prompts: the switch ---
  // (Open again if an esc above closed Settings, so a red run still says the rest.)
  if (!settingsOpen()) {
    key(',', { metaKey: true })
    await sleep(600)
    click(q('[data-settings-more="1"]'))
    await sleep(600)
  }
  click(q('[data-settings-tab="prompts"]'))
  await sleep(400)
  const sw = () => q('[data-schedules-switch]')
  log.switchThere = Boolean(sw())
  log.switchSays = sw()?.innerText ?? null
  log.switchSaysWhen = /Runs happen while Lanes is open, even with its window closed; quitting stops them\./.test(
    log.switchSays ?? ''
  )
  log.switchStartsOff = (await state()).flags.schedules === false && sw()?.dataset.on === '0'
  click(sw())
  await sleep(300)
  const on = (await state()).flags.schedules
  click(sw())
  await sleep(300)
  log.switchTurns = on === true && (await state()).flags.schedules === false

  // --- a prompt's own Autonomous asks the same ---
  click(q('[data-prompt-action="new"]'))
  await sleep(250)
  set(q('[data-prompt-field="name"]'), 'Sweep')
  set(q('[data-prompt-field="text"]'), 'Sweep the inbox.')
  await sleep(100)
  click(choice('autonomous'))
  await sleep(250)
  log.promptAsks = Boolean(q('[data-prompt-editor] [data-autonomous-ask]'))
  log.promptSays = /Claude runs any command and edits any file in this folder without asking/.test(ask()?.innerText ?? '')
  log.promptNotChosenYet = !chosen('autonomous')
  log.promptKeepFocused = Boolean(keep()) && document.activeElement === keep()
  click(choice('autonomous'))
  await sleep(200)
  log.promptPressedAgainIsNo = !ask() && !chosen('autonomous')
  click(choice('autonomous'))
  await sleep(200)
  esc()
  await sleep(200)
  log.promptEscIsNo = !ask() && !chosen('autonomous') && Boolean(q('[data-prompt-editor]'))
  click(choice('autonomous'))
  await sleep(200)
  click(yes())
  await sleep(200)
  log.promptYesChooses = !ask() && chosen('autonomous')
  click(q('[data-prompt-action="save"]'))
  await sleep(400)
  const saved = await kept('Sweep')
  log.saved = saved ?? null
  log.yesKept = saved?.safety === 'autonomous' && saved?.autonomousConfirmed === true

  // --- set to anything else, the yes goes with it ---
  const card = [...document.querySelectorAll('[data-prompt-card]')].find(
    (c) => c.querySelector('[data-prompt-name]')?.textContent === 'Sweep'
  )
  click(card?.querySelector('[data-prompt-action="edit"]'))
  await sleep(250)
  click(choice('standard'))
  await sleep(200)
  log.downAsksNothingInPrompt = !ask() && chosen('standard')
  click(q('[data-prompt-action="save"]'))
  await sleep(400)
  const after = await kept('Sweep')
  log.after = after ?? null
  log.yesGoesWithIt = after?.safety === 'standard' && !('autonomousConfirmed' in (after ?? {}))

  log.pass = Boolean(
    log.startsStandard &&
      log.asks &&
      log.notChosenYet &&
      log.saysWhatItAllows &&
      log.keepFocused &&
      log.pressedAgainIsNo &&
      log.escClosesOnlyTheQuestion &&
      log.keepKeeps &&
      log.yesChooses &&
      log.downAsksNothing &&
      log.switchThere &&
      log.switchSaysWhen &&
      log.switchStartsOff &&
      log.switchTurns &&
      log.promptAsks &&
      log.promptSays &&
      log.promptNotChosenYet &&
      log.promptKeepFocused &&
      log.promptPressedAgainIsNo &&
      log.promptEscIsNo &&
      log.promptYesChooses &&
      log.yesKept &&
      log.downAsksNothingInPrompt &&
      log.yesGoesWithIt
  )
  return JSON.stringify(log, null, 1)
})()
