// Models: added against the CLI, chosen per thread, and curated in Settings.
//
// Three faults met in one place. The add form had ONE field doing two jobs —
// uppercased for the row and handed straight to `--model` — so the readable
// entry its own placeholder asked for ("OPUS 4.6 (INTERNAL)") was sent to the
// CLI verbatim and refused, and nothing said so until a message failed to send.
// A model added that way reached the state file and the default-model setting
// and NOTHING ELSE: the composer's picker was handed the built-in three, so it
// could be made the default and never chosen for a single thread. And there was
// no way to say which models the picker should offer.
//
// Spends a couple of two-token turns checking model ids, so point it at a
// throwaway vault with a state directory of its own.
// See checks/README.md for how to run it.
;(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
  const click = (el) => el && el.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  const set = (el, v) => {
    const d = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
    d.call(el, v)
    el.dispatchEvent(new Event('input', { bubbles: true }))
  }
  const key = (k, opts = {}) =>
    window.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, ...opts }))
  const log = {}
  await sleep(2600)

  key(',', { metaKey: true })
  await sleep(600)
  click(document.querySelector('[data-settings-more="1"]'))
  await sleep(600)
  click(document.querySelector('[data-settings-tab="models"]'))
  await sleep(600)
  const rows = () => [...document.querySelectorAll('[data-model-row]')].map((r) => r.dataset.modelRow)
  log.builtIn = rows()
  log.opened = log.builtIn.length === 3
  if (!log.opened) return JSON.stringify(log, null, 1)

  /* ---------- 1. an id the CLI does not know is refused, in its own words ---------- */

  set(document.querySelector('[data-model-id-field="1"]'), 'opus 4.')
  click(document.querySelector('[data-model-add="1"]'))
  for (let i = 0; i < 90; i++) {
    await sleep(500)
    if (document.querySelector('[data-model-says]')) break
  }
  const bad = document.querySelector('[data-model-says]')
  log.badRefused = bad?.dataset.modelSays === 'no'
  log.badSays = bad?.innerText.slice(0, 120)
  log.badQuotesTheCli = /issue with the selected model|not have access|does not exist/i.test(
    log.badSays ?? ''
  )
  log.notAdded = rows().length === 3

  /* ---------- 2. and one it does know is added ---------- */

  set(document.querySelector('[data-model-id-field="1"]'), 'claude-opus-4-5')
  click(document.querySelector('[data-model-add="1"]'))
  for (let i = 0; i < 90; i++) {
    await sleep(500)
    if (document.querySelector('[data-model-says="ok"]')) break
  }
  log.goodAccepted = Boolean(document.querySelector('[data-model-says="ok"]'))
  log.added = rows().length === 4
  const custom = rows().find((r) => r.startsWith('custom-'))
  log.customId = custom
  // The row's second column says what actually goes to --model.
  log.rowShowsTheRealId = /claude-opus-4-5/.test(
    document.querySelector(`[data-model-row="${custom}"]`)?.innerText ?? ''
  )

  /* ---------- 3. the picker is curated here ---------- */

  const dot = (id) => document.querySelector(`[data-model-row="${id}"] [data-model-shown]`)
  click(dot('haiku'))
  await sleep(400)
  log.haikuPutAway = dot('haiku')?.dataset.modelShown === '0'

  // The DEFAULT cannot be put away — the composer must always be able to name
  // what the thread is running.
  const def = document.querySelector('[data-model-default="1"]')
  log.defaultIs = def?.dataset.modelRow
  click(def.querySelector('[data-model-shown]'))
  await sleep(400)
  log.defaultStaysOffered =
    document.querySelector('[data-model-default="1"] [data-model-shown]')?.dataset.modelShown === '1'

  /* ---------- 4. and the composer offers exactly that ---------- */

  key('Escape')
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
  await sleep(700)
  click(document.querySelector('[data-status-line="1"]'))
  await sleep(500)
  const chips = [...document.querySelectorAll('[data-chip="model"]')]
  log.chips = chips.map((c) => c.textContent.trim())
  log.offersTheAddedOne = chips.some((c) => c.dataset.chipId === log.customId)
  log.doesNotOfferWhatIsPutAway = !chips.some((c) => c.dataset.chipId === 'haiku')

  // And picking it takes: the thread's model is per thread, not a default.
  click(chips.find((c) => c.dataset.chipId === log.customId))
  await sleep(700)
  log.statusLine = document.querySelector('[data-status-line="1"]')?.innerText.trim()
  log.threadTookIt = /CLAUDE-OPUS-4-5/i.test(log.statusLine ?? '')

  log.pass =
    log.badRefused &&
    log.badQuotesTheCli &&
    log.notAdded &&
    log.goodAccepted &&
    log.added &&
    log.rowShowsTheRealId &&
    log.haikuPutAway &&
    log.defaultStaysOffered &&
    log.offersTheAddedOne &&
    log.doesNotOfferWhatIsPutAway &&
    log.threadTookIt
  return JSON.stringify(log, null, 1)
})()
