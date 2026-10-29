// ⌘K's THREADS is every thread, newest first by what was said in it, and a
// note's row names its file.
//
// The world is `"threads": "many"`: the eight sample threads, forty-five
// fillers older than all of them, and one transcript the way the desktop app
// leaves a session it hosts — its last line eight days old, the file itself
// written just now. Sorted by the file's mtime that one led the list, and with
// a page of forty the oldest fillers were simply not there.
(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
  const click = (el) => el && el.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  const key = (k, meta) =>
    window.dispatchEvent(new KeyboardEvent('keydown', { key: k, metaKey: !!meta, bubbles: true }))
  const pal = () => document.querySelector('[data-palette-input]')
  const log = {}
  await sleep(2600)

  key('k', true)
  await sleep(700)
  log.opened = Boolean(pal())

  click(document.querySelector('[data-pal-seg="chats"]'))
  await sleep(600)
  const chats = [...document.querySelectorAll('.pal-row[data-pal-kind="chat"]')]
  const titles = chats.map((r) => r.innerText.split('\n')[0])
  log.threadRows = chats.length
  log.all = chats.length === 54
  log.lastFiller = titles.includes('Filler thread 45')

  const hosted = titles.indexOf('Hosted by the desktop app')
  log.hostedAt = hosted
  // Older than every filler (101–145 hours) at 200: last, not first.
  log.datedByLines = hosted === titles.length - 1
  log.hostedSays = chats[hosted]?.innerText.split('\n')[1] ?? null
  log.quietForDays = /quiet for (8|9) days/.test(log.hostedSays ?? '')

  click(document.querySelector('[data-pal-seg="notes"]'))
  await sleep(600)
  const beds = document.querySelector('.pal-row[data-pal-id="projects/garden/beds.md"]')
  log.bedsSays = beds?.innerText.split('\n')[1] ?? null
  log.namesFile = log.bedsSays === 'projects/garden/beds.md'

  log.pass = log.opened && log.all && log.lastFiller && log.datedByLines && log.quietForDays && log.namesFile
  return JSON.stringify(log, null, 1)
})()
