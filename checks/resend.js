// RESEND — ask the same question again, sent for you.
//
// The third verb under a turn, and the one the other two could not say. `fork`
// carries on differently under Claude's answer; `edit` hands your words back to
// the composer so you can ask them differently. Neither of them asks the SAME
// question a second time, which is what you want when the answer was the
// problem rather than the question.
//
// So resend cuts where edit cuts — the question and the answer under it go with
// the path you are leaving — and then sends those exact words for you, images
// and quote included. The transcript is the same length afterwards as it was
// before: this is a re-ask, not an append.
//
// Run against a throwaway LANES_VAULT and LANES_STATE, and an empty session
// directory. See checks/README.md.
(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
  const pane = (i) => document.querySelector(`[data-pane="${i}"]`)
  const composer = () => pane(0).querySelector('textarea')
  const rows = () => [...pane(0).querySelectorAll('.msg-row')]
  const rowsBy = (role) => [...pane(0).querySelectorAll(`[data-msg-role="${role}"]`)]
  const click = (el) => el && el.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  const actionIn = (row, label) =>
    [...row.querySelectorAll('.msg-action')].find(
      (d) => d.textContent.trim().toLowerCase() === label
    )
  const seams = () => [...pane(0).querySelectorAll('[data-seam]')]
  const key = (k) =>
    window.dispatchEvent(new KeyboardEvent('keydown', { key: k, metaKey: true, bubbles: true }))
  const log = {}

  // A chat of its own, so the transcript is exactly the turns below.
  key('t')
  await sleep(1200)

  // The send button reads Stop while a turn is in flight — the only honest
  // signal, since a prompt usually contains the word it asks for.
  const busy = () => /\bStop\b/.test(pane(0).innerText)
  const settle = async () => {
    for (let i = 0; i < 90 && busy(); i++) await sleep(1000)
    await sleep(900)
    return !busy()
  }
  const ask = async (text) => {
    const set = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set
    set.call(composer(), text)
    composer().dispatchEvent(new Event('input', { bubbles: true }))
    await sleep(200)
    composer().dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })
    )
    await sleep(1500)
    return settle()
  }

  // Two turns, so there is an answer ABOVE the question we re-ask — a cut with
  // nothing answered before it is not a path, and is refused.
  log.turn1 = await ask('The codeword is ZEPHYR. Reply with just: OK')
  log.turn2 = await ask('Name a colour. Reply with just the colour, one word.')

  const rowsBefore = rows().length
  log.rowsBefore = rowsBefore
  log.seamsBefore = seams().length

  const yourTurn = rowsBy('you').find((r) => /Name a colour/.test(r.innerText))
  log.foundYourTurn = Boolean(yourTurn)
  if (!yourTurn) return { ...log, pass: false }

  // OFFERED WHERE IT MEANS SOMETHING. Resending is something you do to your own
  // question; Claude's turn is not a question and has nothing to re-ask.
  const resend = actionIn(yourTurn, 'resend')
  log.resendOffered = Boolean(resend)
  const anAnswer = rowsBy('claude')[0]
  log.noResendOnClaude = Boolean(anAnswer) && !actionIn(anAnswer, 'resend')
  // It stands beside the other two rather than replacing either.
  log.editStillOffered = Boolean(actionIn(yourTurn, 'edit'))
  if (!resend) return { ...log, pass: false }

  // A draft already in the composer is not ours to throw away: resending sends
  // the OLD words, and leaves what you were typing where it was.
  const setC = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set
  setC.call(composer(), 'a draft nobody asked to send')
  composer().dispatchEvent(new Event('input', { bubbles: true }))
  await sleep(200)

  click(resend)

  // IT SENDS ITSELF. Nothing was typed and no Enter was pressed.
  let started = false
  for (let i = 0; i < 40; i++) {
    if (busy()) {
      started = true
      break
    }
    await sleep(300)
  }
  log.itSentByItself = started
  log.composerKeptTheDraft = /a draft nobody asked to send/.test(composer().value || '')

  log.finished = await settle()

  // A RE-ASK, NOT AN APPEND. The question appears once, and the transcript is
  // the length it was — the old copy and the answer under it went with the path
  // this was cut from.
  const copies = rowsBy('you').filter((r) => /Name a colour/.test(r.innerText)).length
  log.questionAskedOnce = copies === 1
  log.questionCameBack = copies >= 1
  log.rowsAfter = rows().length
  log.sameLength = rows().length === rowsBefore

  // AND A SEAM SAYS WHERE THE OTHER ANSWER WENT.
  log.seamShown = seams().length === 1

  // The path kept its history: the codeword from above the cut is still known.
  log.followUp = await ask('What is the codeword? Reply with just the word.')
  const answers = rowsBy('claude')
  const reply = answers.length
    ? [...answers[answers.length - 1].children]
        .slice(1)
        .map((c) => c.innerText || '')
        .join(' ')
    : ''
  log.reply = reply.slice(0, 60)
  log.keptItsHistory = /ZEPHYR/i.test(reply)

  log.pass =
    log.turn1 &&
    log.turn2 &&
    log.foundYourTurn &&
    log.resendOffered &&
    log.noResendOnClaude &&
    log.editStillOffered &&
    log.itSentByItself &&
    log.composerKeptTheDraft &&
    log.finished &&
    log.questionAskedOnce &&
    log.sameLength &&
    log.seamShown &&
    log.keptItsHistory
  return log
})()
