// THE BAR THAT STICKS AT THE TOP OF A NOTE CARRIES WHAT YOU REACH FOR THERE —
// and is not a slab of white.
//
// Scrolled past a note's head, the compact bar that slid in held the WRITE |
// READ pair, the title and the star, and nothing else: the way back to the note
// a link was followed from, and the line saying when the note was edited and
// how long it is, scrolled away with the head. And it was the sheet's own
// white, opaque, over the words — a blank band with a ruled edge, the page
// apparently stopping under it. So:
//
// - The way back is there, where the head has it, and goes back.
// - The head's meta line is there, after the title: the same words the head
//   says, "edited … ago · N words".
// - It is frosted paper: the card's warm tone, thinned, over a blur of what
//   scrolls beneath — not opaque, and not the sheet's colour.
//
// Seeds its own two notes through the app's IPC. Run against a throwaway
// LANES_VAULT and LANES_STATE. See checks/README.md.
(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
  const pane = () => document.querySelector('[data-pane="1"]')
  const key = (k, extra = {}) =>
    window.dispatchEvent(new KeyboardEvent('keydown', { key: k, metaKey: true, bubbles: true, ...extra }))
  const sc = () => pane()?.querySelector('[data-find-scope]')
  const bar = () => pane()?.querySelector('[data-compact="1"]')
  const headSays = (s) => (pane()?.querySelector('[data-head="1"]')?.textContent ?? '').includes(s)
  const rgba = (c) => (c.match(/[\d.]+/g) ?? []).map(Number)
  const log = {}
  await sleep(1200)

  const stamp = Date.now().toString(36)
  const START = `Sticky start ${stamp}`
  const LONG = `Sticky long ${stamp}`
  const longSlug = `sticky-long-${stamp}`
  const s = await window.lanes.noteCreate(START, '_unfiled')
  await window.lanes.noteWrite(s.path, `# ${START}\n\nGo on to [[${longSlug}]], and come back.\n`)
  const l = await window.lanes.noteCreate(LONG, '_unfiled')
  await window.lanes.noteWrite(
    l.path,
    [`# ${LONG}`, '', ...Array.from({ length: 60 }, (_, i) => [`Paragraph ${i + 1}, long enough to wrap once across the measure so the note runs well past its head.`, '']).flat()].join('\n')
  )

  key('k')
  await sleep(600)
  const box = document.querySelector('[data-palette-input]')
  Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(box, START)
  box.dispatchEvent(new Event('input', { bubbles: true }))
  for (let i = 0; i < 60; i++) {
    const t = (document.querySelector('.pal-row[data-pal-on="1"]')?.textContent ?? '').trim()
    if (t.includes(START) && !t.startsWith('+')) break
    await sleep(100)
  }
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
  for (let i = 0; i < 30 && !headSays(START); i++) await sleep(100)
  await sleep(500)
  // In READ, where a plain click follows — the note opens there, and the bar
  // is the claim here, so a build that opened it in WRITE is put in READ.
  if (pane()?.querySelector('.cm-content')) {
    key('e')
    await sleep(900)
  }
  // Followed in place, as a plain click does: the tab now has a way back.
  pane()?.querySelector(`[data-wiki="${longSlug}"]`)?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  for (let i = 0; i < 30 && !headSays(LONG); i++) await sleep(100)
  log.followed = headSays(LONG)
  await sleep(500)

  sc().scrollTop = sc().scrollHeight * 0.5
  for (let i = 0; i < 20 && !bar(); i++) await sleep(100)
  await sleep(300)
  log.barShown = Boolean(bar())
  if (!log.barShown) return { ...log, pass: false }

  /* ---------- what it carries ---------- */

  const back = bar().querySelector('[title^="Back"]')
  log.carriesTheWayBack = Boolean(back)
  const headMeta = pane()?.querySelector('[data-meta="1"]')?.firstElementChild?.textContent ?? ''
  const barMeta = bar().querySelector('[data-compact-meta]')?.textContent ?? ''
  log.barMeta = barMeta
  log.carriesTheMetaLine = /^edited .+ ago · \d+ words?$/.test(barMeta) && barMeta === headMeta
  log.stillCarriesThePair = Boolean(bar().querySelector('[data-mode="WRITE"]') && bar().querySelector('[data-mode="READ"]'))

  /* ---------- what it looks like ---------- */

  const cs = getComputedStyle(bar())
  const sheet = rgba(getComputedStyle(pane()).backgroundColor)
  const ground = rgba(cs.backgroundColor)
  log.ground = cs.backgroundColor
  log.backdrop = cs.backdropFilter
  log.frosted = /blur\(/.test(cs.backdropFilter)
  log.seeThrough = ground.length === 4 && ground[3] < 1
  log.notTheSheetsWhite = ground.slice(0, 3).join() !== sheet.slice(0, 3).join()

  /* ---------- and back goes back ---------- */

  back?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  for (let i = 0; i < 30 && !headSays(START); i++) await sleep(100)
  log.backGoesBack = headSays(START)

  log.pass = Boolean(
    log.followed &&
      log.barShown &&
      log.carriesTheWayBack &&
      log.carriesTheMetaLine &&
      log.stillCarriesThePair &&
      log.frosted &&
      log.seeThrough &&
      log.notTheSheetsWhite &&
      log.backGoesBack
  )
  return log
})()
