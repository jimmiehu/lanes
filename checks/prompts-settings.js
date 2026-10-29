// SETTINGS → PROMPTS: the prompts you send again and again, kept.
//
// A sixth section, after Skills. A prompt is a name ⌘K finds it by and the
// words it sends; its model, effort, safety and lane are DEFAULT until set,
// and DEFAULT is left out of the record so it keeps meaning "the app's, when
// it runs". Saving says what is wrong in words — no name, a name that starts
// with the `/` ⌘K asks for prompts with, nothing to send, a name already kept
// (case aside: ⌘K could not tell the two apart) — rather than greying out.
//
// And the two ways to lose one are guarded. Esc in a field leaves the field —
// Settings closes on esc, and a half-written prompt is words a stray key should
// not throw away. Delete asks first, Keep the answer that loses nothing, and
// Delete pressed again closes the question rather than answering it; a prompt
// lives in the state file, which has no Trash, so even a delete can be taken
// back with Undo, to the place it stood. Every change reaches main's state.
//
// Red before: there is no Prompts section. Writes state, so a fresh
// LANES_STATE; spends no turns.
;(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
  const click = (el) => el && el.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  const key = (k, opts = {}) =>
    window.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, ...opts }))
  const set = (el, v) => {
    const proto = el instanceof HTMLTextAreaElement ? window.HTMLTextAreaElement : window.HTMLInputElement
    Object.getOwnPropertyDescriptor(proto.prototype, 'value').set.call(el, v)
    el.dispatchEvent(new Event('input', { bubbles: true }))
  }
  const q = (sel) => document.querySelector(sel)
  const act = (name, within = document) => within.querySelector(`[data-prompt-action="${name}"]`)
  const fieldOf = (name) => q(`[data-prompt-editor] [data-prompt-field="${name}"]`)
  const choose = (row, id) => click(q(`[data-prompt-editor] [data-prompt-choice="${row}"] [data-choice="${id}"]`))
  const kept = async () => (await window.lanes.bootstrap()).state.prompts
  const cardOf = (name) =>
    [...document.querySelectorAll('[data-prompt-card]')].find(
      (c) => c.querySelector('[data-prompt-name]')?.textContent === name
    )
  const problem = () => q('[data-prompt-problem]')?.textContent ?? null
  const draft = async (name, text) => {
    click(act('new'))
    await sleep(250)
    set(fieldOf('name'), name)
    set(fieldOf('text'), text)
    await sleep(100)
  }
  const log = {}
  await sleep(2600)

  key(',', { metaKey: true })
  await sleep(600)
  click(q('[data-settings-more="1"]'))
  await sleep(600)
  click(q('[data-settings-tab="prompts"]'))
  await sleep(500)
  log.sectionThere = Boolean(q('[data-prompts]'))
  if (!log.sectionThere) return JSON.stringify({ ...log, pass: false }, null, 1)
  log.emptySaysWhere = /in ⌘K after a \//.test(q('[data-prompts]').innerText)

  // --- one kept, with DEFAULT left out of the record ---
  await draft('Standup', 'Say standup.')
  choose('effort', 'low')
  choose('lane', 'garden')
  await sleep(100)
  click(act('save'))
  await sleep(400)
  const first = (await kept())[0]
  log.kept = first ?? null
  log.keptAsWritten =
    first?.name === 'Standup' && first?.text === 'Say standup.' && first?.effort === 'low' && first?.lane === 'garden'
  log.defaultsLeftOut = Boolean(first) && !('model' in first) && !('safety' in first)
  log.cardShown = Boolean(cardOf('Standup'))

  // --- what cannot be saved says why ---
  const refused = async (name, text) => {
    await draft(name, text)
    click(act('save'))
    await sleep(250)
    const said = problem()
    click(act('cancel'))
    await sleep(200)
    return said
  }
  log.sameNameSays = await refused('standup ', 'Something else.')
  log.slashNameSays = await refused('/standup', 'Something else.')
  log.noTextSays = await refused('Quiet', '   ')
  log.noNameSays = await refused('  ', 'Words.')
  log.refusalsSayWhy =
    /already/.test(log.sameNameSays ?? '') &&
    /cannot start with \//.test(log.slashNameSays ?? '') &&
    /something to send/.test(log.noTextSays ?? '') &&
    /needs a name/.test(log.noNameSays ?? '')
  log.refusedNothingKept = (await kept()).length === 1

  // --- edited in place: same id, new words ---
  click(act('edit', cardOf('Standup')))
  await sleep(250)
  set(fieldOf('text'), 'Say standup, then stop.')
  // Esc in the field: the field lets go, Settings stays, the words stay.
  fieldOf('text').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))
  await sleep(300)
  log.escKeepsSettings = Boolean(q('[data-prompts]'))
  log.escKeepsTheWords = fieldOf('text')?.value === 'Say standup, then stop.'
  click(act('save'))
  await sleep(400)
  const edited = (await kept())[0]
  log.editedInPlace = edited?.id === first?.id && edited?.text === 'Say standup, then stop.'

  // --- a second, so Undo has a place to put the first back ---
  await draft('Inbox sweep', 'Sort the inbox.')
  click(act('save'))
  await sleep(400)
  log.twoKept = (await kept()).map((p) => p.name)

  // --- delete asks; Delete again is a no; Keep keeps ---
  click(act('delete', cardOf('Standup')))
  await sleep(200)
  log.asks = Boolean(q('[data-prompt-confirm]'))
  click(act('delete', cardOf('Standup')))
  await sleep(200)
  log.pressedAgainIsNo = !q('[data-prompt-confirm]') && (await kept()).length === 2
  click(act('delete', cardOf('Standup')))
  await sleep(200)
  click(act('keep'))
  await sleep(200)
  log.keepKeeps = !q('[data-prompt-confirm]') && (await kept()).length === 2

  // --- and once it is answered, it can still be taken back ---
  click(act('delete', cardOf('Standup')))
  await sleep(200)
  click(act('confirm-delete'))
  await sleep(300)
  log.deleted = (await kept()).map((p) => p.name)
  log.goneSaysSo = /Deleted Standup/.test(q('[data-prompt-gone]')?.innerText ?? '')
  click(act('undo'))
  await sleep(300)
  const back = await kept()
  log.undone = back.map((p) => p.name)
  log.undoPutsItBack = back[0]?.id === first?.id && back.length === 2

  log.pass = Boolean(
    log.sectionThere &&
      log.emptySaysWhere &&
      log.keptAsWritten &&
      log.defaultsLeftOut &&
      log.cardShown &&
      log.refusalsSayWhy &&
      log.refusedNothingKept &&
      log.escKeepsSettings &&
      log.escKeepsTheWords &&
      log.editedInPlace &&
      log.asks &&
      log.pressedAgainIsNo &&
      log.keepKeeps &&
      log.deleted.length === 1 &&
      log.goneSaysSo &&
      log.undoPutsItBack
  )
  return JSON.stringify(log, null, 1)
})()
