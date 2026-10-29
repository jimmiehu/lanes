// The WRITE | READ switch stays in reach however far down a note you are, and
// using it there keeps your place.
//
// The pair sat in the writing bar under the note's head and scrolled away with
// it: past the first screen of a long note, switching meant scrolling back to
// the top, or knowing ⌘E. The compact bar that slides in once the head has
// gone now carries the same pair, where its kind label was — the left edge the
// pair already had — so the switch is where it was, only stuck. Scrolled back
// up there is one switch again, the writing bar's.
//
// A switch always in reach is a switch used in the MIDDLE of a note, and there
// the scroll offset one surface was at is another place in the other: READ's
// blocks and WRITE's lines are not the same heights — a table most of all. So
// switching keeps the place: the words at the top of the screen before it are
// at the top after it, both ways, by the pair and by ⌘E. Held on the words
// themselves — every line of the fixture carries a token, found as text in
// either surface — rather than on either surface's own idea of a line.
//
// Seeds its own note through the app's IPC. Run against a throwaway
// LANES_VAULT and LANES_STATE. See checks/README.md.
(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
  const click = (el) => el && el.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  const key = (k, extra = {}) =>
    window.dispatchEvent(new KeyboardEvent('keydown', { key: k, metaKey: true, bubbles: true, ...extra }))
  const pane = () => document.querySelector('[data-pane="1"]')
  const sc = () => pane()?.querySelector('[data-find-scope]')
  const compact = () => pane()?.querySelector('[data-compact="1"]')
  const content = () => pane()?.querySelector('.cm-content')
  const mode = (m) => pane()?.querySelector(`[data-mode="${m}"]`)?.dataset.on === '1'
  /** The top of what can be SEEN: under the compact bar when it is there. */
  const viewTop = () =>
    compact() ? compact().getBoundingClientRect().bottom : sc().getBoundingClientRect().top

  /** Drawn, inside the scrollport, and the thing a click at its middle lands on. */
  const reachable = (el) => {
    if (!el || !sc()) return false
    const r = el.getBoundingClientRect()
    if (!r.width || !r.height) return false
    const s = sc().getBoundingClientRect()
    if (r.bottom <= s.top || r.top >= s.bottom) return false
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)
    return Boolean(hit && (hit === el || el.contains(hit)))
  }
  const inReach = (m) => [...(pane()?.querySelectorAll(`[data-mode="${m}"]`) ?? [])].filter(reachable)

  const TOKEN = /k\d+\.\d+/g
  /** Every token drawn in the scrollport, and where its glyphs are. */
  const tokens = () => {
    const out = []
    const walker = document.createTreeWalker(sc(), NodeFilter.SHOW_TEXT)
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const text = n.nodeValue
      TOKEN.lastIndex = 0
      let m
      while ((m = TOKEN.exec(text))) {
        const r = document.createRange()
        r.setStart(n, m.index)
        r.setEnd(n, m.index + m[0].length)
        const b = r.getBoundingClientRect()
        if (b.height) out.push({ t: m[0], top: b.top })
      }
    }
    return out
  }
  /** The first words the eye meets under the top of what can be seen. */
  const topToken = () => {
    const y = viewTop()
    const all = tokens()
      .filter((k) => k.top >= y - 1)
      .sort((a, b) => a.top - b.top)
    return all[0] ? { t: all[0].t, y: Math.round(all[0].top - y) } : null
  }
  const whereIs = (t) => {
    const k = tokens().find((x) => x.t === t)
    return k ? Math.round(k.top - viewTop()) : null
  }
  /** How far the words at the top moved across a switch; null when they left the screen. */
  const across = async (flip, want) => {
    const before = topToken()
    flip()
    for (let i = 0; i < 40 && !mode(want); i++) await sleep(50)
    // The editor draws where it lands a frame or two after it is made.
    await sleep(700)
    const after = before ? whereIs(before.t) : null
    return { token: before?.t, before: before?.y, after, moved: after == null ? null : after - before.y }
  }
  const kept = (r) => r.moved != null && Math.abs(r.moved) <= 12

  const openByName = async (name) => {
    key('k')
    await sleep(600)
    const box = document.querySelector('[data-palette-input]')
    if (!box) return false
    const setIn = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
    setIn.call(box, name)
    box.dispatchEvent(new Event('input', { bubbles: true }))
    for (let i = 0; i < 40; i++) {
      const on = document.querySelector('.pal-row[data-pal-on="1"]')
      const t = on?.textContent.trim().toLowerCase() ?? ''
      if (t.includes(name.toLowerCase()) && !t.startsWith('+')) break
      await sleep(100)
    }
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    return true
  }

  const log = {}
  await sleep(1200)

  /* ---------- the fixture: every kind of block, each line with a token ---------- */

  const out = ['# A note to switch in', '']
  for (let s = 1; s <= 30; s++) {
    out.push(`## Section ${s} k${s}.0`, '')
    out.push(
      `k${s}.1 The first paragraph of section ${s}, whose words run on long enough to wrap onto a second line the way prose in a real note does, and a little further still.`,
      ''
    )
    out.push(`- k${s}.2 an item`, `- k${s}.3 a second item, a little longer than the first`, `- k${s}.4 a third`, '')
    if (s % 3 === 0) {
      out.push(`| k${s}.5 name | value |`, '| --- | --- |', `| k${s}.6 one | 1 |`, `| k${s}.7 two | 2 |`, '')
    }
    if (s % 4 === 0) out.push('```', `// k${s}.8 a line of code`, `// k${s}.9 and another`, '```', '')
    out.push(`> k${s}.10 A quoted line, set off from the rest.`, '')
    out.push(`### A smaller heading k${s}.11`, '')
    out.push(
      `k${s}.12 The last paragraph of the section. It says a little and then stops, so the next section starts under it.`,
      ''
    )
  }
  const made = await window.lanes.noteCreate('A note to switch in', '_unfiled')
  const PATH = made.path || '_unfiled/a-note-to-switch-in.md'
  await window.lanes.noteWrite(PATH, out.join('\n'))
  await openByName('A note to switch in')
  // It opens in READ; this starts from WRITE, so ⌘E.
  for (let i = 0; i < 40 && !content() && !sc()?.querySelector('[data-md-from]'); i++) await sleep(100)
  if (!content()) key('e')
  for (let i = 0; i < 80 && !content()?.textContent.includes('k1.1'); i++) await sleep(100)
  await sleep(600)
  log.opensInWrite = Boolean(content()) && mode('WRITE')

  /* ---------- 1. at rest: one switch, the writing bar's ---------- */

  const rest = inReach('WRITE')
  log.oneSwitchAtRest = rest.length === 1 && !compact()
  const restLeft = rest[0]?.getBoundingClientRect().left ?? NaN

  /* ---------- 2. scrolled: the switch is still there, at the same edge ---------- */

  sc().scrollTop = sc().scrollHeight * 0.4
  await sleep(700)
  log.compactShown = Boolean(compact())
  const stuck = () => ({ write: inReach('WRITE')[0], read: inReach('READ')[0] })
  log.switchInReachScrolled = Boolean(stuck().write && stuck().read)
  log.stuckLeft = Math.round(stuck().write?.getBoundingClientRect().left ?? NaN)
  log.restLeft = Math.round(restLeft)
  log.sameEdge = Math.abs(log.stuckLeft - log.restLeft) <= 1
  log.stuckShowsWrite = stuck().write?.dataset.on === '1'

  /* ---------- 3. the stuck pair switches, and the place is kept ---------- */

  // Without a stuck pair (the red run) ⌘E does the switching, so the place is
  // still measured.
  log.toRead = await across(() => (stuck().read ? click(stuck().read) : key('e')), 'READ')
  log.readByThePair = mode('READ') && Boolean(stuck().read)
  log.stuckShowsRead = stuck().read?.dataset.on === '1'
  log.toWrite = await across(() => (stuck().write ? click(stuck().write) : key('e')), 'WRITE')
  log.writeByThePair = mode('WRITE') && Boolean(content())

  /* ---------- 4. ⌘E further down keeps it too ---------- */

  sc().scrollTop = sc().scrollHeight * 0.7
  await sleep(700)
  log.keyToRead = await across(() => key('e'), 'READ')
  sc().scrollTop -= 333
  await sleep(500)
  log.keyToWrite = await across(() => key('e'), 'WRITE')
  log.placeKept =
    kept(log.toRead) && kept(log.toWrite) && kept(log.keyToRead) && kept(log.keyToWrite)

  /* ---------- 5. back at the top: one switch again ---------- */

  sc().scrollTop = 0
  await sleep(700)
  log.oneSwitchBackAtTop = inReach('WRITE').length === 1 && !compact()

  log.pass =
    log.opensInWrite &&
    log.oneSwitchAtRest &&
    log.compactShown &&
    log.switchInReachScrolled &&
    log.sameEdge &&
    log.stuckShowsWrite &&
    log.readByThePair &&
    log.stuckShowsRead &&
    log.writeByThePair &&
    log.placeKept &&
    log.oneSwitchBackAtTop
  return log
})()
