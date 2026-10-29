// A NOTE IS WHERE YOU LEFT IT.
//
// The note pane has one scrollport, and every note shown in it used to be shown
// at whatever offset the last one left there: back on a tab, you were at a
// place in the note that was really a place in the one before it, and a note
// opened under one scrolled far down opened at its end, or wherever the
// shorter page clamped it to.
//
// So the place is kept per note, in the note's own terms — which words were at
// the top of the screen — taken as you leave and given back as you arrive:
//
// - A note opened for the first time opens at its top, whatever the note
//   before it was scrolled to.
// - Back on a tab, the words that were at the top of the screen are at the top
//   again, within a few pixels: in READ, and in WRITE, where the editor draws
//   only what is near the screen and the place is found through it.
// - Each note keeps its own: two tabs, switched between twice, each come back
//   to their own words.
//
// Held on the words themselves — every paragraph opens on a token, found as
// text in either surface — rather than on a scroll offset, which is the thing
// that was wrong.
//
// Seeds its own two notes through the app's IPC. Run against a throwaway
// LANES_VAULT and LANES_STATE. See checks/README.md.
(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
  const pane = () => document.querySelector('[data-pane="1"]')
  const key = (k, extra = {}) =>
    window.dispatchEvent(new KeyboardEvent('keydown', { key: k, metaKey: true, bubbles: true, ...extra }))
  const content = () => pane()?.querySelector('.cm-content')
  const sc = () => pane()?.querySelector('[data-find-scope]')
  const tabs = () => [...(pane()?.querySelectorAll('[data-tab]') ?? [])]
  const tabOf = (name) => tabs().find((t) => (t.getAttribute('title') || t.textContent || '').includes(name))
  /** The top of what can be SEEN: under the compact bar while it is there. */
  const seenTop = () => {
    const bar = pane()?.querySelector('[data-compact="1"]')
    return bar ? bar.getBoundingClientRect().bottom : sc().getBoundingClientRect().top
  }
  /** Where token `t` is drawn — the top of its first glyph — or null where it is not drawn. */
  const topOf = (t) => {
    const walk = document.createTreeWalker(sc(), NodeFilter.SHOW_TEXT)
    let n
    while ((n = walk.nextNode())) {
      const at = n.data.indexOf(t)
      if (at < 0) continue
      const r = document.createRange()
      r.setStart(n, at)
      r.setEnd(n, at + 1)
      const b = r.getBoundingClientRect()
      if (b.height) return b.top
    }
    return null
  }
  /** The first token at or below the top of the screen, and how far below it. */
  const place = (tag, n) => {
    const top = seenTop()
    for (let i = 1; i <= n; i++) {
      const t = `${tag}${i}.`
      const y = topOf(`${t} `)
      if (y !== null && y >= top - 2) return { token: t, below: Math.round(y - top) }
    }
    return null
  }
  /** How far the token now sits from where it was: 0 is the same place exactly. */
  const drift = (was) => {
    if (!was) return null
    const y = topOf(`${was.token} `)
    return y === null ? null : Math.round(y - seenTop() - was.below)
  }
  const openByName = async (name, newTab) => {
    key('k')
    await sleep(600)
    const box = document.querySelector('[data-palette-input]')
    Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(box, name)
    box.dispatchEvent(new Event('input', { bubbles: true }))
    for (let i = 0; i < 60; i++) {
      const t = (document.querySelector('.pal-row[data-pal-on="1"]')?.textContent ?? '').trim()
      if (t.includes(name) && !t.startsWith('+')) break
      await sleep(100)
    }
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', metaKey: Boolean(newTab), bubbles: true }))
    await sleep(1800)
  }
  const select = async (name) => {
    tabOf(name)?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await sleep(1200)
  }
  const log = {}
  await sleep(1200)

  const stamp = Date.now().toString(36)
  const A = `Scroll keeper ${stamp}`
  const B = `Scroll other ${stamp}`
  const body = (title, tag) =>
    [`# ${title}`, '']
      .concat(
        ...Array.from({ length: 70 }, (_, i) => [
          `${tag}${i + 1}. A paragraph of the note, long enough to wrap across the measure once or twice, so that the note is many screens tall and a place in it is a place.`,
          ''
        ])
      )
      .join('\n')
  for (const [title, tag] of [
    [A, 'a'],
    [B, 'b']
  ]) {
    const m = await window.lanes.noteCreate(title, '_unfiled')
    await window.lanes.noteWrite(m.path, body(title, tag))
  }

  /* ---------- READ: a place in A, then B opens at its own top ---------- */

  await openByName(A)
  log.aOpened = topOf('a1. ') !== null
  sc().scrollTop = sc().scrollHeight * 0.4
  await sleep(600)
  const aRead = place('a', 70)
  log.aLeftAt = aRead
  await openByName(B, true)
  log.bOpened = Boolean(tabOf(B)) && topOf('b1. ') !== null
  log.bOpensAtItsTop = (sc()?.scrollTop ?? -1) < 4
  sc().scrollTop = sc().scrollHeight * 0.7
  await sleep(600)
  const bRead = place('b', 70)
  log.bLeftAt = bRead

  /* ---------- back and forth: each comes back to its own words ---------- */

  await select(A)
  log.aDriftRead = drift(aRead)
  await select(B)
  log.bDriftRead = drift(bRead)
  await select(A)
  log.aDriftReadAgain = drift(aRead)
  log.readKeepsEachPlace = [log.aDriftRead, log.bDriftRead, log.aDriftReadAgain].every(
    (d) => d !== null && Math.abs(d) <= 12
  )

  /* ---------- WRITE: the same, through the editor ---------- */

  key('e')
  for (let i = 0; i < 30 && !content(); i++) await sleep(100)
  await sleep(600)
  log.aInWrite = Boolean(content())
  sc().scrollTop = sc().scrollHeight * 0.6
  await sleep(700)
  const aWrite = place('a', 70)
  log.aLeftAtInWrite = aWrite
  await select(B)
  log.bStillRead = !content()
  log.bDriftAfterWrite = drift(bRead)
  await select(A)
  await sleep(500)
  log.aBackInWrite = Boolean(content())
  log.aDriftWrite = drift(aWrite)
  log.writeKeepsThePlace = log.aDriftWrite !== null && Math.abs(log.aDriftWrite) <= 12

  log.pass = Boolean(
    log.aOpened &&
      log.bOpened &&
      aRead &&
      bRead &&
      log.bOpensAtItsTop &&
      log.readKeepsEachPlace &&
      log.aInWrite &&
      aWrite &&
      log.bStillRead &&
      log.bDriftAfterWrite !== null &&
      Math.abs(log.bDriftAfterWrite) <= 12 &&
      log.aBackInWrite &&
      log.writeKeepsThePlace
  )
  return log
})()
