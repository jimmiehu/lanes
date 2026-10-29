// The palette indexes TASKS, not just objects: an open `- [ ]` line inside any
// note is findable by its own words. See checks/README.md for how to run it.
(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
  const click = (el) => el && el.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  const key = (k, meta) =>
    window.dispatchEvent(new KeyboardEvent('keydown', { key: k, metaKey: !!meta, bubbles: true }))
  const pal = () => document.querySelector('input[placeholder*="Search"]')
  const log = {}
  await sleep(2600)

  key('k', true)
  await sleep(700)
  log.opened = Boolean(pal())

  const set = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
  set.call(pal(), 'unchecked')
  pal().dispatchEvent(new Event('input', { bubbles: true }))
  await sleep(1200)

  const modal = pal().closest('div').parentElement.parentElement
  log.filters = ['ALL', 'THREADS', 'NOTES', 'TASKS', 'WAITING'].every((f) =>
    modal.innerText.includes(f)
  )
  log.foundTaskText = /an unchecked task/i.test(modal.innerText)

  // Narrow to TASKS and confirm the row survives.
  const tasksChip = [...modal.querySelectorAll('div')].find(
    (d) => d.textContent.trim() === 'TASKS' && d.children.length === 0
  )
  click(tasksChip)
  await sleep(800)
  log.tasksOnly = /an unchecked task/i.test(modal.innerText)
  log.noNewRowUnderTasks = !/New note/i.test(modal.innerText)

  // ALL offers `New note “unchecked”`, so the last one is also what proves the
  // chip was found and the list really narrowed.
  log.pass =
    log.opened &&
    log.filters &&
    log.foundTaskText &&
    log.tasksOnly &&
    log.noNewRowUnderTasks
  return JSON.stringify(log, null, 1)
})()
