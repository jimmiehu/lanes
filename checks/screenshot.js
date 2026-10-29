// Not a claim: the picture in the README. A thread on the left and the note it
// worked on, in READ, on the right, the rail filed by lane — on the sample
// vault, so what it shows is invented. Its verdict only says the picture has
// what it is meant to: both panes, the thread's words, the note's title.
//
//   node checks/run.mjs screenshot --shot docs/img --seed '{"theme":"light"}'
//   node checks/run.mjs screenshot --shot docs/img --seed '{"theme":"dark"}'
(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
  const click = (el) => el && el.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  const rail = () => document.querySelector('[data-rail="1"]')
  const chip = (label) =>
    [...(rail()?.querySelectorAll('div') ?? [])].find((d) => d.textContent.trim() === label && d.children.length === 0)
  const row = (kind, words) =>
    [...document.querySelectorAll(`[data-rail-row="${kind}"]`)].find((r) => r.innerText.includes(words))
  const log = {}
  await sleep(2800)

  // The rail by lane, so the picture says what a lane is.
  click(chip('Lanes'))
  await sleep(700)
  log.lanes = Boolean(document.querySelector('[data-rail-row="group"]'))

  // The thread that worked on the beds note, and then the note itself.
  click(row('chat', 'spring beds'))
  await sleep(1500)
  click(chip('Recent'))
  await sleep(600)
  click(row('note', 'beds') ?? row('note', 'Beds'))
  await sleep(1500)
  click(chip('Lanes'))
  await sleep(600)

  const panes = [...document.querySelectorAll('[data-pane]')]
  log.panes = panes.length
  log.threadShown = /compost/i.test(document.querySelector('[data-pane="0"]')?.innerText ?? '')
  log.noteShown = /what grows in them/.test(document.querySelector('[data-pane="1"]')?.innerText ?? '')
  log.pass = log.panes === 2 && log.threadShown && log.noteShown
  return JSON.stringify(log)
})()
