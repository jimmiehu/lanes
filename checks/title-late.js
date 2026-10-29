// A thread whose name was never settled — it finished its first turn with no
// tab open, or the app was quit before Haiku answered — gets named on the next
// turn it finishes, rather than keeping the CLI's opening-line fallback for
// good. Wants a vault holding at least one such thread and a FRESH state
// directory, which is what makes it one: the names live in state, so a state
// directory with none in it is exactly the app that lost them.
// See checks/README.md for how to run it.
(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
  const click = (el) => el && el.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  const pane = () => document.querySelector('[data-pane="0"]')
  const composer = () => pane().querySelector('textarea')
  const title = () => {
    const tabs = [...pane().querySelectorAll('[data-tab]')]
    return tabs[tabs.length - 1]?.textContent.replace(/×$/, '').trim() ?? ''
  }
  const busy = () => /\bStop\b/.test(pane().innerText)
  const set = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set
  const log = {}
  await sleep(3200)

  // The CLI's fallback is the opening prompt cut at sixty characters, so an
  // unnamed thread is the one whose row reads like a sentence.
  const rows = [...document.querySelectorAll('[data-rail-row="chat"]')]
  const row = rows.find((r) => /\?|\.$/.test(r.innerText.split('\n')[0].trim()))
  log.railThreads = rows.length
  log.railLabels = rows.map((r) => r.innerText.split('\n')[0].trim())
  log.foundUnnamed = Boolean(row)
  if (!row) return JSON.stringify(log, null, 1)

  click(row)
  await sleep(2500)
  log.openedAs = title()

  set.call(composer(), 'Thanks. Reply with the single word: done.')
  composer().dispatchEvent(new Event('input', { bubbles: true }))
  await sleep(200)
  composer().dispatchEvent(
    new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })
  )
  await sleep(2000)
  for (let i = 0; i < 90 && busy(); i++) await sleep(1000)
  for (let i = 0; i < 40 && title() === log.openedAs; i++) await sleep(1000)

  log.afterTurn = title()
  log.namedAtLast = log.afterTurn !== log.openedAs && !/\?|\.$/.test(log.afterTurn)
  // The rail agrees with the tab: the name is the thread's, not the tab's.
  log.railAgrees = [...document.querySelectorAll('[data-rail-row="chat"]')].some((r) =>
    r.innerText.startsWith(log.afterTurn)
  )
  // An empty tab is not a name, and every row "starts with" it.
  log.pass = Boolean(
    log.foundUnnamed && log.afterTurn !== '' && log.namedAtLast && log.railAgrees
  )
  return JSON.stringify(log, null, 1)
})()
