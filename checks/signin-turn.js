// A TURN REFUSED FOR WANT OF A LOGIN IS NOT AN ANSWER.
//
// The CLI reports an API failure as an `assistant` line in the model's voice
// (model `<synthetic>`, flagged `is_api_error_message`) — not on stderr. Read as
// a message, the refusal sat in the thread as
//
//   CLAUDE
//   Failed to authenticate: OAuth session expired and could not be refreshed
//   copy  fork
//
// and, because a message arriving is the proof that lowers the sign-in note,
// the note that says what to do was taken down by the very error it is for.
// `checks/api-error.mjs` proves the reading; this proves the app wires it up.
//
// Wants the REAL CLI with a refused token — it fails before any model is asked,
// so it spends nothing:
//
//   env -i HOME=$HOME PATH=$PATH CLAUDE_CODE_OAUTH_TOKEN=sk-ant-oat01-refused \
//     LANES_STATE=… LANES_VAULT=… LANES_CAPTURE=… \
//     LANES_CAPTURE_EXEC=checks/signin-turn.js npm run dev
;(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
  const pane = () => document.querySelector('[data-pane="0"]')
  const set = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set
  const log = {}
  await sleep(5000)

  const c = pane().querySelector('textarea')
  set.call(c, 'hello')
  c.dispatchEvent(new Event('input', { bubbles: true }))
  await sleep(200)
  c.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))

  // The CLI retries a 401 a couple of times before it gives up.
  for (let i = 0; i < 100; i += 1) {
    await sleep(300)
    if (/authenticate/i.test(pane().innerText)) break
  }
  await sleep(1500)

  const claude = [...pane().querySelectorAll('[data-msg-role="claude"]')]
  log.claudeMessages = claude.length
  log.refusalNotInClaudesVoice = !claude.some((m) => /authenticate/i.test(m.innerText))
  const note = document.querySelector('[data-signin]')
  log.noteShown = Boolean(note)
  log.noteText = (note?.innerText ?? '').replace(/\s+/g, ' ').trim()
  log.showsTheCommand = /claude auth login/.test(log.noteText)
  // The CLI's own sentence stays as evidence, in the note's disclosure.
  log.keepsWhatTheCliSaid = /authenticate/i.test(note?.textContent ?? '')

  log.pass =
    log.refusalNotInClaudesVoice &&
    log.claudeMessages === 0 &&
    log.noteShown &&
    log.showsTheCommand &&
    log.keepsWhatTheCliSaid
  return JSON.stringify(log, null, 1)
})()
