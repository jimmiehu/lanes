// ⌘K RUNS A KEPT PROMPT.
//
// A leading `/` asks the palette for prompts and nothing else — Claude Code's
// own convention for a command — and lights the PROMPTS filter, which is the
// same list for browsing. ↵ runs the prompt: a new thread in the thread pane,
// sent at once, named for the prompt and the day (`Standup · Wed 7 Oct`), with
// the effort and lane the prompt keeps written for that thread. ⇧↵ leaves its
// words in a new thread's composer instead, unsent, to change first.
//
// And in ALL a prompt is an offer, not an answer: it sits at the very foot,
// after the offers to make a thread or a note, and is never where ↵ rests. A
// run spends a turn and may write to the vault, so typing the name of a note
// that a prompt shares must still open the note.
//
// Red before: `/` finds nothing. Wants the `slow` stand-in CLI (the run sends),
// a throwaway vault (it seeds a note) and a fresh LANES_STATE.
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
  const box = () => q('[data-palette-input]')
  const rows = () => [...document.querySelectorAll('.pal-row')]
  const footer = () => q('[data-pal-footer]')?.textContent ?? ''
  const onTab = (i) => (pane(i)?.querySelector('[data-tab-on="1"]')?.textContent ?? '').replace(/×$/, '').trim()
  const tabCount = (i) => pane(i)?.querySelectorAll('[data-tab]').length ?? 0
  const palette = async (text) => {
    if (!box()) key('k', { metaKey: true })
    await sleep(600)
    setValue(box(), text)
    await sleep(1300)
  }
  const close = async () => {
    if (box()) key('Escape')
    await sleep(300)
  }
  // The day as a run's title spells it — in English, whatever the locale, since
  // main and the window each have their own.
  const day = (() => {
    const d = new Date()
    const wd = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getDay()]
    const mo = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getMonth()]
    return `${wd} ${d.getDate()} ${mo}`
  })()
  const log = {}
  await sleep(2600)

  // --- a prompt, kept the way a person keeps one ---
  key(',', { metaKey: true })
  await sleep(600)
  click(q('[data-settings-more="1"]'))
  await sleep(600)
  click(q('[data-settings-tab="prompts"]'))
  await sleep(400)
  log.promptsSection = Boolean(q('[data-prompts]'))
  if (!log.promptsSection) return JSON.stringify({ ...log, pass: false }, null, 1)
  click(q('[data-prompt-action="new"]'))
  await sleep(250)
  setValue(q('[data-prompt-field="name"]'), 'Standup')
  setValue(q('[data-prompt-field="text"]'), 'Say standup.')
  await sleep(100)
  click(q('[data-prompt-choice="effort"] [data-choice="low"]'))
  await sleep(50)
  click(q('[data-prompt-choice="lane"] [data-choice="garden"]'))
  await sleep(100)
  click(q('[data-prompt-action="save"]'))
  await sleep(400)
  key('Escape')
  await sleep(500)
  log.kept = (await window.lanes.bootstrap()).state.prompts.map((p) => p.name)

  // And a note that shares its name.
  const note = await window.lanes.noteCreate('Standup', 'notes')
  await window.lanes.noteWrite(note.path, '# Standup\n\nThe standing notes.\n')

  // --- in ALL, the prompt is an offer at the foot, and ↵ opens the note ---
  await palette('standup')
  log.allKinds = rows().map((r) => r.dataset.palKind)
  log.promptAtTheFoot = log.allKinds[log.allKinds.length - 1] === 'prompt'
  log.restsOnTheNote = rows().find((r) => r.dataset.palOn === '1')?.dataset.palKind === 'note'
  const threadsBefore = tabCount(0)
  key('Enter')
  await sleep(1500)
  log.noteOpened = /Standup/.test(onTab(1))
  log.noRunFromAll = tabCount(0) === threadsBefore

  // --- after a `/`, prompts alone, and PROMPTS lit ---
  await palette('/st')
  log.slashKinds = rows().map((r) => r.dataset.palKind)
  log.slashIsPromptsOnly = log.slashKinds.length === 1 && log.slashKinds[0] === 'prompt'
  log.promptsLit = q('[data-pal-seg="prompts"]')?.dataset.palSegOn === '1'
  log.footer = footer()
  log.footerSaysRun = /↵ run it/.test(log.footer) && /⇧↵ open it unsent/.test(log.footer)

  // --- ↵ runs it ---
  key('Enter')
  await sleep(1800)
  log.runTab = onTab(0)
  log.namedForPromptAndDay = log.runTab === `Standup · ${day}`
  const you = [...(pane(0)?.querySelectorAll('[data-msg-role="you"]') ?? [])].map((m) => m.innerText.trim())
  log.sent = you
  log.sentTheWords = you.some((t) => t.includes('Say standup.'))
  const st = (await window.lanes.bootstrap()).state
  const id = Object.keys(st.titleOverrides).find((k) => st.titleOverrides[k] === `Standup · ${day}`)
  log.runRecorded = Boolean(id)
  log.keepsItsEffort = Boolean(id) && st.threadSettings[id]?.effort === 'low'
  log.filedInItsLane = Boolean(id) && st.laneOverrides[id] === 'garden'

  // --- ⇧↵ leaves the words unsent ---
  await palette('/st')
  key('Enter', { shiftKey: true })
  await sleep(1200)
  const composer = pane(0)?.querySelector('textarea')
  log.composerHolds = composer?.value ?? null
  log.unsentInComposer = log.composerHolds === 'Say standup.'
  log.nothingSentThere = !pane(0)?.querySelector('[data-msg-role="you"]')

  // --- `/` alone lists them, and a name nobody kept says so ---
  await palette('/')
  log.slashAloneLists = rows().length === 1 && rows()[0].dataset.palKind === 'prompt'
  await palette('/zz')
  log.noneSays = q('[data-pal-empty]')?.textContent ?? null
  log.noneSaysSo = /No prompt by that name/.test(log.noneSays ?? '')
  await close()

  log.pass = Boolean(
    log.promptAtTheFoot &&
      log.restsOnTheNote &&
      log.noteOpened &&
      log.noRunFromAll &&
      log.slashIsPromptsOnly &&
      log.promptsLit &&
      log.footerSaysRun &&
      log.namedForPromptAndDay &&
      log.sentTheWords &&
      log.keepsItsEffort &&
      log.filedInItsLane &&
      log.unsentInComposer &&
      log.nothingSentThere &&
      log.slashAloneLists &&
      log.noneSaysSo
  )
  return JSON.stringify(log, null, 1)
})()
