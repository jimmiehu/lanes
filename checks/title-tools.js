// A thread whose first turn OPENS WITH A TOOL CALL is still named.
//
// The bug: a message's `text` is its LEAD paragraph, and only while it leads —
// the moment a turn starts with a tool call, the prose that follows lands in
// `blocks` and `text` stays empty for the whole message. The namer read `text`,
// found nothing to name, and returned before it had even marked the thread as
// tried. So it failed again on the next finished turn, and the one after, and
// the tab kept the opening line of the first message for ever. Which is most
// real work: a skill, a file read, a search — anything that acts before it
// speaks.
//
// Spends a turn and runs a shell command, so point it at a throwaway vault with
// its own state directory.
// See checks/README.md for how to run it.
;(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
  const pane = () => document.querySelector('[data-pane="0"]')
  const composer = () => pane().querySelector('textarea')
  const tabs = () =>
    [...pane().querySelectorAll('[data-tab]')].map((t) => t.textContent.replace(/×$/, '').trim())
  const title = () => tabs()[tabs().length - 1]
  const busy = () => /\bStop\b/.test(pane().innerText)
  const key = (k) =>
    window.dispatchEvent(new KeyboardEvent('keydown', { key: k, metaKey: true, bubbles: true }))
  const set = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set
  const log = {}

  key('t')
  await sleep(1200)
  log.atBirth = title()

  set.call(
    composer(),
    'Run the shell command `echo sourdough` and then tell me in one sentence what it printed.'
  )
  composer().dispatchEvent(new Event('input', { bubbles: true }))
  await sleep(200)
  composer().dispatchEvent(
    new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })
  )
  await sleep(600)
  log.standIn = title()
  log.standInIsTheQuestion = /echo sourdough/i.test(log.standIn)

  for (let i = 0; i < 120 && busy(); i++) await sleep(1000)
  log.turnFinished = !busy()

  // The reply led with a tool call, so its own `text` is empty — the whole
  // point of this check. It is the prose in its blocks that names the thread.
  const reply = (() => {
    const t = pane().innerText
    return t.length
  })()
  log.paneHasContent = reply > 0

  for (let i = 0; i < 60 && title() === log.standIn; i++) await sleep(1000)
  log.named = title()
  log.gotARealName = log.named !== log.standIn && log.named !== 'New thread'
  // A name, not a sentence: the opening line ends in a full stop, a name does not.
  log.nameIsAName = /^[^.?]{1,60}$/.test(log.named)

  log.pass = log.standInIsTheQuestion && log.turnFinished && log.gotARealName && log.nameIsAName
  return JSON.stringify(log, null, 1)
})()
