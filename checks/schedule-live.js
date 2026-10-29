// A PROMPT THAT KEEPS TIME.
//
// Settings → Prompts: a prompt switched to "Run it by itself" starts from the
// work days and from Standard — nobody is there at 6:00 to say yes, so while a
// schedule is on, Guarded and DEFAULT are not offered at all — and saving one
// for the next minute makes main's scheduler run it when the minute comes:
// once, as a new thread named `<prompt> · <day>`, in a tab put BEHIND the one
// you are reading, which takes the strip's unseen mark when the answer lands.
// The run is recorded — its slot, its outcome, that its tab was made — and the
// card says so: `last today 14:03, done in 2s · open`. Saving the prompt again,
// unchanged, asks the scheduler again at once, and the slot that has run does
// not run twice.
//
// Red before: nothing runs by itself. Wants the `usage` stand-in CLI (a turn
// that answers), a throwaway vault and a fresh state directory. Takes about two
// minutes: it waits for a real minute to come round and for the scheduler's
// own thirty-second look. A relaunch not running the slot again, and the Mac
// waking into a slot, rest on `schedule.mjs` — a check cannot quit the app or
// put the Mac to sleep — and the README says so.
;(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
  const click = (el) => el && el.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  const key = (k, opts = {}) =>
    window.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, ...opts }))
  const setValue = (el, v) => {
    const proto = el instanceof HTMLTextAreaElement ? window.HTMLTextAreaElement : window.HTMLInputElement
    Object.getOwnPropertyDescriptor(proto.prototype, 'value').set.call(el, v)
    el.dispatchEvent(new Event('input', { bubbles: true }))
  }
  const q = (sel) => document.querySelector(sel)
  const pane = (i) => q(`[data-pane="${i}"]`)
  const tabs = () => [...(pane(0)?.querySelectorAll('[data-tab]') ?? [])]
  const label = (t) => t.textContent.replace(/×$/, '').trim()
  const onTab = () => pane(0)?.querySelector('[data-tab-on="1"]')
  const state = async () => (await window.lanes.bootstrap()).state
  // The day as a run's title spells it — in English, whatever the locale, since
  // main and the window each have their own.
  const day = (() => {
    const d = new Date()
    const wd = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getDay()]
    const mo = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getMonth()]
    return `${wd} ${d.getDate()} ${mo}`
  })()
  const openPrompts = async () => {
    key(',', { metaKey: true })
    await sleep(600)
    click(q('[data-settings-more="1"]'))
    await sleep(600)
    click(q('[data-settings-tab="prompts"]'))
    await sleep(400)
  }
  const log = {}
  await sleep(2600)

  await openPrompts()
  log.promptsSection = Boolean(q('[data-prompts]'))
  if (!log.promptsSection) return JSON.stringify({ ...log, pass: false }, null, 1)
  click(q('[data-prompt-action="new"]'))
  await sleep(250)
  setValue(q('[data-prompt-field="name"]'), 'Tick')
  setValue(q('[data-prompt-field="text"]'), 'Say tick.')
  await sleep(100)

  // --- "Run it by itself": the work days, Standard, and no Guarded to pick ---
  log.guardedBeforeSchedule = Boolean(q('[data-prompt-choice="safety"] [data-choice="guarded"]'))
  log.scheduleEditor = Boolean(q('[data-schedule-toggle]'))
  if (!log.scheduleEditor) return JSON.stringify({ ...log, pass: false }, null, 1)
  click(q('[data-schedule-toggle]'))
  await sleep(200)
  const daysOn = () => [...document.querySelectorAll('[data-schedule-day]')].filter((d) => d.dataset.dayOn === '1').map((d) => Number(d.dataset.scheduleDay))
  log.startsOnWorkDays = JSON.stringify(daysOn().sort()) === JSON.stringify([1, 2, 3, 4, 5])
  log.startsStandard = q('[data-prompt-choice="safety"] [data-choice="standard"]')?.dataset.choiceOn === '1'
  log.noGuardedWhileScheduled = !q('[data-prompt-choice="safety"] [data-choice="guarded"]')
  log.noDefaultWhileScheduled = !q('[data-prompt-choice="safety"] [data-choice="default"]')
  // Every day, so today is one of them, at the next minute.
  for (const d of [6, 0]) click(q(`[data-schedule-day="${d}"]`))
  await sleep(150)
  const next = new Date(Date.now() + 60_000)
  const hhmm = `${String(next.getHours()).padStart(2, '0')}:${String(next.getMinutes()).padStart(2, '0')}`
  setValue(q('[data-schedule-field="time"]'), hhmm)
  await sleep(100)
  click(q('[data-prompt-action="save"]'))
  await sleep(500)
  const saved = (await state()).prompts.find((p) => p.name === 'Tick')
  log.saved = saved?.schedule ?? null
  log.savedAsSet =
    saved?.safety === 'standard' &&
    saved?.schedule?.on === true &&
    saved?.schedule?.time === hhmm &&
    saved?.schedule?.days.length === 7
  log.cardSaysNext = q('[data-prompt-next]')?.textContent ?? null
  key('Escape')
  await sleep(500)

  // --- the minute comes, and it runs: once, behind what you are reading ---
  const front = onTab() ? label(onTab()) : null
  const before = tabs().length
  const want = `Tick · ${day}`
  let ran = null
  for (let i = 0; i < 230 && !ran; i++) {
    await sleep(500)
    ran = tabs().find((t) => label(t) === want) ?? null
  }
  log.ranAsATab = Boolean(ran)
  log.oneNewTab = tabs().length === before + 1
  log.frontUnchanged = (onTab() ? label(onTab()) : null) === front
  // The stand-in answers in about a second; the strip marks the answer unseen.
  // The mark is the tab's dot, as `unseen.js` reads it.
  const unseen = () => ran?.querySelector('[data-tab-unseen]')?.getAttribute('data-tab-unseen') === '1'
  for (let i = 0; i < 30 && !unseen(); i++) await sleep(300)
  log.unseenWhenItLands = unseen()

  // --- recorded ---
  let st = await state()
  let run = st.runs[saved?.id]
  for (let i = 0; i < 20 && run?.outcome !== 'done'; i++) {
    await sleep(300)
    st = await state()
    run = st.runs[saved?.id]
  }
  log.run = run ? { slot: run.slot, outcome: run.outcome, shown: run.shown } : null
  const today = new Date()
  const slotWant = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')} ${hhmm}`
  log.recorded = run?.slot === slotWant && run?.outcome === 'done' && run?.shown === true
  log.namedForIt = Boolean(run) && st.titleOverrides[run.sessionId] === want

  // --- the card says how it went; saving again does not run the slot twice ---
  await openPrompts()
  log.cardSaysLast = q('[data-prompt-last]')?.textContent.replace(/\s+/g, ' ').trim() ?? null
  log.lastLooksRight = /^· last today \d{2}:\d{2}, done in \d+s · open$/.test(log.cardSaysLast ?? '')
  click(q('[data-prompt-action="edit"]'))
  await sleep(250)
  click(q('[data-prompt-action="save"]'))
  await sleep(2500)
  key('Escape')
  await sleep(400)
  const after = await state()
  log.notTwice =
    after.runs[saved?.id]?.sessionId === run?.sessionId &&
    tabs().filter((t) => label(t) === want).length === 1

  log.pass = Boolean(
    log.guardedBeforeSchedule &&
      log.startsOnWorkDays &&
      log.startsStandard &&
      log.noGuardedWhileScheduled &&
      log.noDefaultWhileScheduled &&
      log.savedAsSet &&
      log.ranAsATab &&
      log.oneNewTab &&
      log.frontUnchanged &&
      log.unseenWhenItLands &&
      log.recorded &&
      log.namedForIt &&
      log.lastLooksRight &&
      log.notTwice
  )
  return JSON.stringify(log, null, 1)
})()
