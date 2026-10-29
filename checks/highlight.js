// ==HIGHLIGHTED== WORDS ARE DRAWN AS A MARKER, IN THE COLOUR YOU PICK.
//
// A note's own `==ripe==` — the marker pen of iA Writer and Obsidian — was
// drawn as it was typed, `==` and all, in READ and in WRITE. Now both draw the
// words on the highlight colour with the marks put away, and leave `a == b`, a
// comparison, as the characters it is. Settings picks the colour; the pick is
// kept, and each colour has its own value in the dark.
//
// Held over a seeded note: in READ, `ripe` on `--hl` (the yellow of a fresh
// state), no `==` on the page but the comparison's, and bold inside a
// highlight still bold and still highlighted; in WRITE, the same words on the
// same colour with the marks out of sight; Settings' Green swatch makes it
// green — READ redrawn, the root's `data-hl`, the state file — and in the dark
// it is the dark theme's own green.
//
// Seeds its own note. Wants a throwaway vault and a fresh state directory.
;(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
  const key = (k, extra = {}) =>
    window.dispatchEvent(new KeyboardEvent('keydown', { key: k, metaKey: true, bubbles: true, ...extra }))
  const click = (el) => el && el.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  const notePane = () => document.querySelector('[data-pane="1"]')
  /** A token as the browser resolves it, as a computed background comes back. */
  const token = (name) => {
    const probe = document.createElement('span')
    probe.style.background = `var(${name})`
    document.body.appendChild(probe)
    const c = getComputedStyle(probe).backgroundColor
    probe.remove()
    return c
  }
  /** The innermost element showing exactly `words`, in `root`. */
  const showing = (root, words) =>
    [...(root?.querySelectorAll('span') ?? [])].filter((s) => s.textContent === words).pop() ?? null
  const bg = (el) => (el ? getComputedStyle(el).backgroundColor : null)
  /** The background drawn under `el` — its own, or the nearest ancestor's that has one. */
  const under = (el) => {
    for (let e = el; e && e !== document.body; e = e.parentElement) {
      const c = getComputedStyle(e).backgroundColor
      if (c && c !== 'rgba(0, 0, 0, 0)' && c !== 'transparent') return c
    }
    return null
  }
  const log = {}
  await sleep(2400)

  const stamp = Date.now().toString(36)
  const TITLE = `Highlight ${stamp}`
  const made = await window.lanes.noteCreate(TITLE, 'notes')
  await window.lanes.noteWrite(
    made.path,
    `# ${TITLE}\n\nIn the garden notes ==ripe== marks what to pick.\n\nAnd ==**sweet** and ready== too, while if a == b and c == d is a comparison.\n`
  )
  key('k')
  await sleep(600)
  const box = document.querySelector('[data-palette-input]')
  Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(box, TITLE)
  box.dispatchEvent(new Event('input', { bubbles: true }))
  for (let i = 0; i < 60; i++) {
    const row = (document.querySelector('.pal-row[data-pal-on="1"]')?.textContent ?? '').trim()
    if (row.includes(TITLE) && !row.startsWith('+')) break
    await sleep(100)
  }
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
  for (let i = 0; i < 40 && !/notes ripe marks/.test(notePane()?.innerText ?? ''); i++) await sleep(150)
  await sleep(400)

  /* ---------- READ ---------- */

  const page = notePane()?.innerText ?? ''
  log.readMarksGone = /garden notes ripe marks/.test(page) && !/==ripe==/.test(page)
  log.comparisonKept = /if a == b and c == d/.test(page)
  log.yellow = token('--hl-yellow')
  log.readRipe = bg(showing(notePane(), 'ripe'))
  log.readOnYellow = log.readRipe === log.yellow && log.yellow !== 'rgba(0, 0, 0, 0)'
  const sweet = showing(notePane(), 'sweet')
  log.boldStillBold = Boolean(sweet) && Number(getComputedStyle(sweet).fontWeight) >= 600
  log.boldOnYellow = bg(sweet) === log.yellow
  log.comparisonPlain = under(showing(notePane(), ' too, while if a == b and c == d is a comparison.')) !== log.yellow

  /* ---------- WRITE ---------- */

  key('e')
  for (let i = 0; i < 30 && !notePane()?.querySelector('.cm-content'); i++) await sleep(100)
  await sleep(600)
  const ed = notePane()?.querySelector('.cm-content')
  const lit = [...(ed?.querySelectorAll('.cm-md-highlight') ?? [])]
  log.writeLit = lit.map((e) => e.textContent)
  log.writeOnYellow = lit.length >= 2 && lit.every((e) => bg(e) === log.yellow)
  log.writeRipe = lit.some((e) => e.textContent === 'ripe')
  // Marks out of sight with the caret elsewhere: the line reads as READ reads it.
  const ripeLine = [...(ed?.querySelectorAll('.cm-line') ?? [])].find((l) => /garden notes/.test(l.textContent))
  log.writeLine = ripeLine?.innerText
  log.writeMarksAway = Boolean(ripeLine) && !/==/.test(ripeLine.innerText)
  key('e')
  await sleep(700)

  /* ---------- Settings: the colour ---------- */

  key(',')
  await sleep(500)
  const swatches = [...document.querySelectorAll('[data-hl-pick]')].map((s) => s.dataset.hlPick)
  log.swatches = swatches
  log.offersColours = swatches.join() === 'yellow,green,blue,pink,purple,grey'
  log.yellowPicked = document.querySelector('[data-hl-pick="yellow"]')?.dataset.on === '1'
  click(document.querySelector('[data-hl-pick="green"]'))
  await sleep(600)
  log.green = token('--hl-green')
  log.rootSaysGreen = document.documentElement.dataset.hl === 'green'
  log.readNowGreen = bg(showing(notePane(), 'ripe')) === log.green && log.green !== log.yellow
  log.kept = (await window.lanes.bootstrap()).state.highlight
  log.keptGreen = log.kept === 'green'
  key(',')
  await sleep(300)

  /* ---------- the dark ---------- */

  const chip = () => document.querySelector('[title^="Appearance:"]')
  for (let i = 0; i < 3 && document.documentElement.dataset.theme !== 'dark'; i++) {
    click(chip())
    await sleep(500)
  }
  log.dark = document.documentElement.dataset.theme === 'dark'
  log.darkGreen = token('--hl-green')
  log.readDarkGreen = bg(showing(notePane(), 'ripe'))
  log.darkHasItsOwn = log.dark && log.readDarkGreen === log.darkGreen && log.darkGreen !== log.green

  log.pass = Boolean(
    log.readMarksGone &&
      log.comparisonKept &&
      log.readOnYellow &&
      log.boldStillBold &&
      log.boldOnYellow &&
      log.comparisonPlain &&
      log.writeOnYellow &&
      log.writeRipe &&
      log.writeMarksAway &&
      log.offersColours &&
      log.yellowPicked &&
      log.rootSaysGreen &&
      log.readNowGreen &&
      log.keptGreen &&
      log.darkHasItsOwn
  )
  return log
})()
