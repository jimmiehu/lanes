// Opening a new thread: does the caret land in that thread's composer, by
// every route that opens one? See checks/README.md for how to run it.
(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
  const click = (el) => el && el.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  const cmdT = () =>
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 't', metaKey: true, bubbles: true }))
  const field = () => document.activeElement?.tagName === 'TEXTAREA'
  const where = () => {
    const el = document.activeElement
    if (!el) return 'none'
    const ph = el.getAttribute?.('placeholder')
    return `${el.tagName}${ph ? `[${ph}]` : ''}`
  }
  const log = {}
  await sleep(2800)

  // 1. ⌘T, twice over.
  cmdT()
  await sleep(700)
  log.cmdT = where()
  log.cmdTFocused = field()
  cmdT()
  await sleep(700)
  log.cmdTAgain = where()
  log.cmdTAgainFocused = field()

  // 2. The top bar's + → Chat. Blurred first, so a stale caret cannot pass.
  document.activeElement?.blur?.()
  click(document.querySelector('[data-new-button="1"]'))
  await sleep(400)
  const chat = [...document.querySelectorAll('[data-new-menu="1"] .ctx-item')].find((d) =>
    /chat|thread/i.test(d.innerText)
  )
  log.menuOffersChat = Boolean(chat)
  click(chat)
  await sleep(800)
  log.fromMenu = where()
  log.fromMenuFocused = field()

  // 3. A rail row's context menu → new chat on that note.
  document.activeElement?.blur?.()
  const row = document.querySelector('[data-rail-row="note"]')
  log.foundRow = Boolean(row)
  if (row) {
    row.dispatchEvent(
      new MouseEvent('contextmenu', { bubbles: true, clientX: 200, clientY: 200 })
    )
    await sleep(400)
    const item = [...document.querySelectorAll('.ctx-item')].find((d) =>
      /new chat|new thread/i.test(d.innerText)
    )
    log.menuOffersNewChat = Boolean(item)
    click(item)
    await sleep(900)
    log.fromRow = where()
    log.fromRowFocused = field()
    log.fromRowPrefill = document.activeElement?.value ?? ''
    // A note's thread opens with the wikilink already in: the caret belongs
    // after it, not in front of it.
    log.caretPastPrefill =
      document.activeElement?.selectionStart === (document.activeElement?.value ?? '').length
  }

  // Past the wikilink, so there has to be one: an empty composer has its caret
  // "past" nothing.
  log.pass =
    log.cmdTFocused &&
    log.cmdTAgainFocused &&
    log.menuOffersChat &&
    log.fromMenuFocused &&
    log.foundRow &&
    log.menuOffersNewChat &&
    log.fromRowFocused &&
    /\[\[[^\]]+\]\]/.test(log.fromRowPrefill) &&
    log.caretPastPrefill
  return JSON.stringify(log, null, 1)
})()
