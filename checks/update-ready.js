// "UPDATE READY", AT THE FOOT OF THE RAIL — offered, never forced.
//
// build/follow.sh leaves a build of the branch it follows ready; the app says
// so in one quiet line at the foot of the rail, with how many commits it
// brings. The line opens in place to those commits, newest first, said
// without the `Lanes: ` each starts with — only the ones newer than the app,
// none of its own or older — and a commit opens to its body.
//
// Restart now, with a reply running, does not cut the reply off: it says it
// is waiting for the reply to land, Not now calls that off and leaves the
// update ready, and asked again it goes once the reply has landed. In a
// development run nothing is swapped — the bundle would be Electron's — so
// what would have been done is written to the run's follow home, and
// checks/update-plan.mjs, run after, holds it to a restart that reopens.
//
// Red at the commit before: there was no line. The runner seeds ready.json
// (`"update": true`); the stand-in CLI is `slow`, a reply of four seconds.
;(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
  const click = (el) => el && el.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  const q = (s) => document.querySelector(s)
  const flat = (s) => (s ?? '').replace(/\s+/g, ' ').trim()
  const set = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set
  const log = {}
  // Asked safely, so an app without it is a red result rather than a broken run.
  const asked = async () => (typeof window.lanes.update === 'function' ? window.lanes.update() : undefined)
  await sleep(2600)
  if (q('[data-rail-shell="shut"]')) click(q('[data-rail-shell="shut"]'))
  for (let i = 0; i < 30 && !q('[data-update-line]'); i++) await sleep(100)

  log.line = flat(q('[data-update-line]')?.textContent)
  log.lineSaysIt = log.line === 'Update ready · 2 changes'
  log.lineAboveTheFoot = Boolean(q('[data-update]')?.nextElementSibling?.textContent?.includes('threads'))
  log.closedAtFirst = !q('[data-update-notes]')

  click(q('[data-update-line]'))
  await sleep(250)
  const notes = [...document.querySelectorAll('[data-update-note]')].map((n) => flat(n.textContent))
  log.notes = notes
  log.theNewerOnesNewestFirst = JSON.stringify(notes) === JSON.stringify(['the newest change', 'an older change'])
  click(document.querySelector('[data-update-note] > div'))
  await sleep(200)
  log.aBodyOpens = flat(q('[data-update-body]')?.textContent) === 'Why it changed.'
  const state = await asked()
  log.mainSaysTheSame = state?.since === true && state?.short === 'aaaaaaa' && state?.restart === null

  // A reply running: restart waits for it, and Not now calls that off.
  const c = document.querySelector('[data-pane="0"] textarea')
  set.call(c, 'a reply the restart waits for')
  c.dispatchEvent(new Event('input', { bubbles: true }))
  await sleep(150)
  c.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))
  await sleep(500)
  click(q('[data-update-restart]'))
  await sleep(400)
  log.waitsForTheReply = (await asked())?.restart === 'waiting' && /once the reply running has landed/.test(q('[data-update-notes]')?.textContent ?? '')
  click(q('[data-update-cancel]'))
  await sleep(300)
  log.notNowCallsItOff = (await asked())?.restart === null && Boolean(q('[data-update-restart]'))

  // Asked again, it goes once the reply has landed.
  click(q('[data-update-restart]'))
  await sleep(300)
  log.waitingAgain = (await asked())?.restart === 'waiting'
  let now = null
  for (let i = 0; i < 80; i++) {
    now = (await asked())?.restart
    if (now === 'now') break
    await sleep(100)
  }
  log.goesOnceItHasLanded = now === 'now'
  await sleep(200)
  log.saysItIsRestarting = /Restarting…/.test(q('[data-update-notes]')?.textContent ?? '')

  log.pass = Boolean(
    log.lineSaysIt &&
      log.lineAboveTheFoot &&
      log.closedAtFirst &&
      log.theNewerOnesNewestFirst &&
      log.aBodyOpens &&
      log.mainSaysTheSame &&
      log.waitsForTheReply &&
      log.notNowCallsItOff &&
      log.waitingAgain &&
      log.goesOnceItHasLanded &&
      log.saysItIsRestarting
  )
  return JSON.stringify(log, null, 1)
})()
