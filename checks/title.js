// Asserts a tab stops saying "New thread" the moment there is anything to call
// it. The namer needs a finished turn and then a round trip of its own, which
// left the tab unlabelled for seconds while the conversation was already under
// way — so the opening line stands in until the real name arrives.
// See checks/README.md for how to run it.
(async () => {
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
  await sleep(1000)
  log.atBirth = title()
  log.startsUnnamed = log.atBirth === 'New thread'

  // Send, and look immediately — this is the window that used to read New chat.
  set.call(composer(), 'What is the capital of Norway? Answer in one word.')
  composer().dispatchEvent(new Event('input', { bubbles: true }))
  await sleep(200)
  composer().dispatchEvent(
    new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })
  )
  await sleep(400)
  log.rightAfterSend = title()
  log.labelledAtOnce = log.rightAfterSend !== 'New thread'
  log.labelIsTheQuestion = /capital of norway/i.test(log.rightAfterSend)

  // Then the namer replaces the stand-in with a real name.
  await sleep(1500)
  for (let i = 0; i < 90 && busy(); i++) await sleep(1000)
  for (let i = 0; i < 30 && title() === log.rightAfterSend; i++) await sleep(1000)
  log.afterNaming = title()
  log.namerImprovedIt = log.afterNaming !== log.rightAfterSend && log.afterNaming !== 'New thread'

  // And a name, once chosen, is not overwritten by the next message.
  set.call(composer(), 'Now tell me about sourdough fermentation instead.')
  composer().dispatchEvent(new Event('input', { bubbles: true }))
  await sleep(200)
  composer().dispatchEvent(
    new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })
  )
  await sleep(1200)
  log.afterSecondSend = title()
  log.keptItsName = log.afterSecondSend === log.afterNaming

  log.pass =
    log.startsUnnamed &&
    log.labelledAtOnce &&
    log.labelIsTheQuestion &&
    log.namerImprovedIt &&
    log.keptItsName
  return log
})()
