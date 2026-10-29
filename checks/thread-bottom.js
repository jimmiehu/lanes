// Two things a thread's title and its scroll owe you: a name that survives the
// tab being rebuilt (a rename and the namer both write an override, and every
// path that opens a thread has to read it), and a way back to the live edge
// once you have read far enough up to lose it.
// See checks/README.md for how to run it.
(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
  const click = (el, meta) =>
    el && el.dispatchEvent(new MouseEvent('click', { bubbles: true, metaKey: !!meta }))
  const pane = () => document.querySelector('[data-pane="0"]')
  const tabs = () => [...(pane()?.querySelectorAll('[data-tab]') ?? [])]
  const labels = () => tabs().map((t) => t.textContent.replace(/×$/, '').trim())
  const sc = () => pane()?.querySelector('[data-find-scope]')
  const arrow = () => document.querySelector('[data-to-bottom]')
  const shown = () => arrow()?.dataset.toBottom === '1'
  const field = () => document.querySelector('[data-rename="1"]')
  const rightClick = (el) => {
    const b = el.getBoundingClientRect()
    el.dispatchEvent(
      new MouseEvent('contextmenu', { bubbles: true, clientX: b.left + 8, clientY: b.bottom + 2 })
    )
  }
  const press = (el) => el && el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
  const item = (text) =>
    [...document.querySelectorAll('div')].find((d) => d.innerText.trim() === text)
  const set = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
  const settle = async () => {
    let last = -1
    for (let i = 0; i < 30; i += 1) {
      const now = Math.round(sc().scrollTop)
      if (now === last) return now
      last = now
      await sleep(80)
    }
    return last
  }
  const log = {}
  await sleep(3000)

  // --- a renamed thread keeps its name through a rebuild of the tab ---
  const NAME = 'a name that must survive'
  rightClick(tabs()[tabs().length - 1])
  await sleep(400)
  press(item('Rename…'))
  await sleep(600)
  set.call(field(), NAME)
  field().dispatchEvent(new Event('input', { bubbles: true }))
  field().dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
  await sleep(900)
  log.renamed = labels().includes(NAME)

  // Close it and open the same thread again: the tab is rebuilt from the
  // transcript, which is exactly where the name used to be lost.
  const renamedRow = [...document.querySelectorAll('[data-rail-row="chat"]')].find((r) =>
    r.innerText.startsWith(NAME)
  )
  log.railKeptIt = Boolean(renamedRow)
  click(tabs()[tabs().length - 1].querySelector('.tab-x'))
  await sleep(800)
  // Gone first, or the name "survives" a rebuild that never happened.
  log.closedFirst = !labels().includes(NAME)
  click(renamedRow, true)
  await sleep(1500)
  log.reopenedAs = labels()[labels().length - 1]
  log.nameSurvivesReopening = log.reopenedAs === NAME

  // --- the way back down ---
  const thread = [...document.querySelectorAll('[data-rail-row="chat"]')].find((r) =>
    /turns|answered|quiet/i.test(r.innerText)
  )
  click(thread)
  await sleep(1600)
  log.opensAtTheLiveEdge = !shown()
  const bottom = Math.round(sc().scrollTop)
  log.scrollable = sc().scrollHeight - sc().clientHeight > 200
  sc().scrollTop = 0
  await sleep(500)
  log.offeredWhenScrolledUp = shown()
  click(arrow())
  const landed = await settle()
  log.wentBackDown = landed >= bottom - 4
  await sleep(400)
  log.hiddenAgainAtTheBottom = !shown()

  log.pass = Boolean(
    log.renamed &&
      log.railKeptIt &&
      log.closedFirst &&
      log.nameSurvivesReopening &&
      log.opensAtTheLiveEdge &&
      log.scrollable &&
      log.offeredWhenScrolledUp &&
      log.wentBackDown &&
      log.hiddenAgainAtTheBottom
  )
  return JSON.stringify(log, null, 1)
})()
