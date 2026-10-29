// AN UPDATE LEFT ALONE GOES IN WHEN YOU QUIT.
//
// "Update ready" is said at the foot of the rail, and nothing is asked of it
// here: the run ends, the app quits as it would at the end of a day, and the
// update goes in then, not reopened. In a development run nothing is swapped,
// so what would have been done is written to the run's follow home, and
// checks/update-plan.mjs, run after the app has quit, holds it to an install
// that does not reopen.
//
// Red at the commit before: nothing was installed on quit. The runner seeds
// ready.json (`"update": true`).
;(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
  const q = (s) => document.querySelector(s)
  await sleep(2600)
  if (q('[data-rail-shell="shut"]')) q('[data-rail-shell="shut"]').dispatchEvent(new MouseEvent('click', { bubbles: true }))
  for (let i = 0; i < 30 && !q('[data-update-line]'); i++) await sleep(100)
  const log = {}
  // Asked safely, so an app without it is a red result rather than a broken run.
  const asked = async () => (typeof window.lanes.update === 'function' ? window.lanes.update() : undefined)
  log.lineShown = Boolean(q('[data-update-line]'))
  log.nothingAsked = (await asked())?.restart === null
  log.pass = log.lineShown && log.nothingAsked
  return JSON.stringify(log, null, 1)
})()
