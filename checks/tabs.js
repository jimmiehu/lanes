// Asserts the tab cap and per-tab history independence.
//
// TWELVE now, not six. Six was a layout pretending to be a budget: the strip
// could draw six full titles and the seventh tab was silently thrown away with
// its history. A full strip keeps its titles and scrolls — and the cap now
// bites when a strip has become a drawer rather than while it is still a
// working set.
//
// See checks/README.md for how to run it.
(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
  const strip = () => document.querySelectorAll('[data-tabstrip]')[0]
  const tabs = () => [...strip().querySelectorAll('[data-tab]')]
  const labels = () => tabs().map((t) => t.textContent.replace(/×$/, '').trim())
  // The active tab is marked by its underline now, not by a brand top-line, so
  // read the flag the strip publishes rather than inferring it from a style.
  const activeLabel = () =>
    labels()[tabs().findIndex((t) => t.getAttribute('data-tab-on') === '1')]
  // `[data-thread]` — what this used to ask for — has not been in the rail for
  // several shells, so every query returned nothing and the whole script was
  // vacuously green. The rail publishes its rows as `data-rail-row` (the kind)
  // and `data-rail-id` (the thread or path).
  const rows = () => [...document.querySelectorAll('[data-rail-row="chat"]')]
  // Guarded: RECENT re-sorts as you visit, so a row this script asked for a
  // moment ago can have moved off the shelf by the time it is clicked.
  const click = (el, m) =>
    el && el.dispatchEvent(new MouseEvent('click', { bubbles: true, metaKey: !!m }))
  const key = (k) =>
    window.dispatchEvent(new KeyboardEvent('keydown', { key: k, metaKey: true, bubbles: true }))
  const byId = (id) => document.querySelector(`[data-rail-row="chat"][data-rail-id="${id}"]`)

  const ids = rows().map((r) => r.getAttribute('data-rail-id'))
  const uniq = [...new Set(ids)]
  const log = {}

  // --- per-tab history ---
  //
  // FIRST, while the strip is still small. One family is one tab, so a thread
  // already open somewhere in the strip is SELECTED rather than navigated to —
  // fill the strip first and every "walk" below turns into a tab switch and the
  // trails never build. (The version of this that ran before walked off the end
  // of a shorter rail and did nothing at all, quietly.)
  const walk = async (tabIndex, ids) => {
    click(tabs()[tabIndex], false)
    await sleep(300)
    const seen = []
    for (const id of ids) {
      const row = byId(id)
      if (!row) continue
      click(row, false)
      await sleep(420)
      seen.push(activeLabel())
    }
    return seen
  }
  // A second tab to walk, and two disjoint pairs of threads — so neither tab's
  // trail can be mistaken for the other's, and neither walk lands on a thread
  // the other tab is already holding.
  click(byId(uniq[3]), true)
  await sleep(500)
  const tab1Trail = await walk(0, uniq.slice(0, 2))
  const tab2Trail = await walk(1, uniq.slice(4, 6))

  click(tabs()[0], false)
  await sleep(300)
  log.tab1Before = activeLabel()
  key('[')
  await sleep(700)
  log.tab1AfterBack = activeLabel()
  log.tab1SteppedBack =
    tab1Trail.length > 1 && log.tab1AfterBack === tab1Trail[tab1Trail.length - 2]

  click(tabs()[1], false)
  await sleep(300)
  log.tab2Before = activeLabel()
  key('[')
  await sleep(700)
  log.tab2AfterBack = activeLabel()
  log.tab2SteppedBack =
    tab2Trail.length > 1 && log.tab2AfterBack === tab2Trail[tab2Trail.length - 2]
  // The whole claim: each tab walked back through ITS OWN trail, not a shared one.
  log.trailsAreSeparate = log.tab1AfterBack !== log.tab2AfterBack
  log.trails = { tab1: tab1Trail, tab2: tab2Trail }

  // --- the cap: more chats than it holds, ⌘-clicked so each adds a tab ---
  //
  // RECENT re-sorts as you visit, so a row can move or fall off the shelf under
  // the loop. Only the ones still on screen are clicked, and how many landed is
  // what the cap is judged against.
  const CAP = 12
  log.available = uniq.length
  let asked = 0
  for (const id of uniq.slice(0, CAP + 3)) {
    const row = byId(id)
    if (!row) continue
    click(row, true)
    asked++
    await sleep(320)
  }
  log.asked = asked
  log.tabCount = labels().length
  log.cappedAtTwelve = log.tabCount === Math.min(CAP, asked)
  log.kept = labels()
  // The seventh no longer costs you the first: past six is just more tabs.
  log.pastSixIsFine = log.tabCount > 6 || asked <= 6

  log.pass =
    log.cappedAtTwelve &&
    log.pastSixIsFine &&
    log.tab1SteppedBack &&
    log.tab2SteppedBack &&
    log.trailsAreSeparate
  return JSON.stringify(log, null, 1)
})()
