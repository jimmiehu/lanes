// A note as a PDF, drawn the way READ draws it.
//
// The claim is fidelity BY CONSTRUCTION: the export mounts the same `Doc`
// component the pane mounts, in a hidden window loading the same bundle and the
// same stylesheet, so the PDF cannot drift from the screen — there is only one
// thing in this app that knows what a note looks like. What a check can hold
// that claim to is what surrounds it: that the export happens at all, that it
// waits for the document rather than for the bundle, that the page is paper
// rather than the app's own dark desk, and that nothing is silently left out.
//
// The native save panel is invisible to a renderer script, so this wants
// `LANES_EXPORT_TO=<dir>` — the same shape as LANES_VAULT and LANES_STATE, and
// the same purpose. This half drives the app; `checks/pdf-file.mjs` then reads
// what landed in that directory, because a renderer cannot touch the
// filesystem and the bridge must not grow a method that exists only for a
// check to look through.
//
// Wants the `everything.md` fixture: every block kind, and near the end a
// `<details>` holding prose and a list, plus a nested `<details open>`.
// See checks/README.md.
;(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
  const click = (el) => el && el.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  const log = {}
  await sleep(2600)

  const row = [...document.querySelectorAll('[data-rail-row="note"]')].find((r) =>
    /Everything a note/i.test(r.innerText)
  )
  log.found = Boolean(row)
  if (!row) return JSON.stringify(log, null, 1)
  click(row)
  await sleep(1800)

  /* ---------- 1. the control, where `copy` lives ---------- */

  const ctl = () => document.querySelector('[data-pdf]')
  log.hasControl = Boolean(ctl())
  log.saysPdf = ctl()?.textContent.trim() === 'pdf'
  // It matches the bar's grammar: a lowercase word, no button, no border.
  log.matchesTheBar = ctl()?.className.includes('note-copy')

  /* ---------- 2. it exports ---------- */

  const t0 = performance.now()
  click(ctl())
  await sleep(200)
  log.saysItIsWorking = ctl()?.dataset.pdf === 'making'
  for (let i = 0; i < 160; i += 1) {
    await sleep(250)
    const d = ctl()?.dataset.pdf
    if (d === 'saved' || d === 'failed') break
  }
  log.ms = Math.round(performance.now() - t0)
  log.state = ctl()?.dataset.pdf
  log.exported = log.state === 'saved'
  log.promptly = log.ms < 20000
  // And the word goes back, rather than leaving a badge behind.
  await sleep(2200)
  log.settlesBack = ctl()?.textContent.trim() === 'pdf'

  /* ---------- 3. the file itself is checks/pdf-file.mjs ---------- */

  // A renderer script cannot touch the filesystem, and the bridge must not grow
  // a method that exists only so a check can look. So this half ends here and
  // node reads the PDF that `LANES_EXPORT_TO` just put on disk.

  log.pass =
    log.hasControl &&
    log.saysPdf &&
    log.matchesTheBar &&
    log.saysItIsWorking &&
    log.exported &&
    log.promptly &&
    log.settlesBack
  return JSON.stringify(log, null, 1)
})()
