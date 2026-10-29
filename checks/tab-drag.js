// A DRAGGED TAB MAKES ROOM, AND FORGIVES.
//
// Dragging a tab was the browser's own drag and drop: a ghost image, a 2px line
// to aim, and a drop that counted only over a tab, on the right half or the
// left — miss and nothing moved. Now a press that moves a few pixels picks the
// tab up, it follows the pointer, and the tabs it passes slide aside to show
// where it would land, decided by where the tab is. The pointer can leave the
// row — above it, below it — and the drag goes on; near an edge the row
// scrolls under it; let go and it settles into the gap; esc puts it back; a
// press that does not move is still a click.
//
// Held over ten note tabs in the note pane: one carried right past two others —
// the dragged one drawn under the pointer, the two it passed moved aside, the
// one after them still — and dropped well below the row, lands third; esc
// mid-drag leaves the order as it was; a press without a move selects and
// moves nothing; and one held at the right edge scrolls the row to its end and
// lands last.
//
// Opens ten notes, so it wants a throwaway vault with at least ten of them and
// its own LANES_STATE. See checks/README.md.
;(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
  const click = (el, mods = {}) => el && el.dispatchEvent(new MouseEvent('click', { bubbles: true, ...mods }))
  const strip = () => document.querySelector('[data-pane="1"] [data-tabstrip]')
  const tabs = () => (strip() ? [...strip().querySelectorAll('[data-tab]')] : [])
  const titles = () => tabs().map((t) => t.getAttribute('title'))
  const activeTitle = () => tabs().find((t) => t.dataset.tabOn === '1')?.getAttribute('title')
  const noteRows = () => [...document.querySelectorAll('[data-rail-row="note"]')]
  const at = (el) => {
    const r = el.getBoundingClientRect()
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
  }
  const ev = (type, x, y, extra = {}) =>
    new PointerEvent(type, { bubbles: true, cancelable: true, button: 0, buttons: 1, clientX: x, clientY: y, pointerId: 7, isPrimary: true, ...extra })
  const press = (el, x, y) => el.dispatchEvent(ev('pointerdown', x, y))
  const move = (x, y) => window.dispatchEvent(ev('pointermove', x, y))
  const lift = (x, y) => window.dispatchEvent(ev('pointerup', x, y, { buttons: 0 }))
  /** Moved there in steps, as a hand moves. */
  const glide = async (x0, y0, x1, y1, steps = 12) => {
    for (let k = 1; k <= steps; k++) {
      move(x0 + ((x1 - x0) * k) / steps, y0 + ((y1 - y0) * k) / steps)
      await sleep(16)
    }
  }
  const shiftOf = (el) => new DOMMatrixReadOnly(getComputedStyle(el).transform === 'none' ? undefined : getComputedStyle(el).transform).m41
  const log = {}
  await sleep(2600)

  for (const r of noteRows().slice(0, 10)) {
    click(r, { metaKey: true })
    await sleep(420)
  }
  await sleep(700)
  log.tabCount = tabs().length
  strip().scrollLeft = 0
  await sleep(300)

  /* ---------- carried past two, dropped below the row ---------- */

  const before = titles()
  const [a, b, c, d] = tabs()
  const start = at(a)
  // Where the third tab stands before anything moves: it slides aside as the drag passes it.
  const cx = at(c).x
  press(a, start.x, start.y)
  await glide(start.x, start.y, cx + 12, start.y)
  await sleep(260)
  log.lifted = a.dataset.tabDragging === '1'
  log.followsThePointer = shiftOf(a) > 0
  log.passedMadeRoom = shiftOf(b) < -20 && shiftOf(c) < -20
  log.nextStayed = Math.abs(shiftOf(d)) < 1
  // Far below the row, and further right by a little: still the same drag.
  await glide(cx + 12, start.y, cx + 18, start.y + 180, 6)
  await sleep(120)
  log.stillDraggingBelow = a.dataset.tabDragging === '1'
  lift(cx + 18, start.y + 180)
  await sleep(450)
  const after = titles()
  log.landedThird = after[2] === before[0] && after[0] === before[1] && after[1] === before[2] && after[3] === before[3]
  log.settled = tabs().every((t) => Math.abs(shiftOf(t)) < 1) && !tabs().some((t) => t.dataset.tabDragging)

  /* ---------- esc puts it back ---------- */

  const was = titles()
  const e0 = tabs()[0]
  const s0 = at(e0)
  press(e0, s0.x, s0.y)
  const x3 = at(tabs()[3]).x
  await glide(s0.x, s0.y, x3, s0.y)
  await sleep(150)
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))
  await sleep(450)
  lift(x3, s0.y)
  await sleep(200)
  log.escPutItBack = titles().join('|') === was.join('|')

  /* ---------- a press that does not move is a click ---------- */

  const t2 = tabs()[2]
  const p2 = at(t2)
  press(t2, p2.x, p2.y)
  move(p2.x + 2, p2.y)
  lift(p2.x + 2, p2.y)
  click(t2)
  await sleep(500)
  log.clickSelects = activeTitle() === t2.getAttribute('title')
  log.clickMovedNothing = titles().join('|') === was.join('|')

  /* ---------- held at the right edge: the row scrolls, and it lands last ---------- */

  strip().scrollLeft = 0
  await sleep(300)
  log.overflows = strip().scrollWidth > strip().clientWidth + 1
  const first = tabs()[0]
  const firstTitle = first.getAttribute('title')
  const f0 = at(first)
  const edge = strip().getBoundingClientRect().right - 6
  press(first, f0.x, f0.y)
  await glide(f0.x, f0.y, edge, f0.y, 16)
  const scrolledFrom = strip().scrollLeft
  await sleep(2500)
  log.edgeScrolled = strip().scrollLeft > scrolledFrom + 40
  lift(edge, f0.y)
  await sleep(500)
  log.landedLast = titles()[titles().length - 1] === firstTitle

  log.pass = Boolean(
    log.tabCount >= 8 &&
      log.lifted &&
      log.followsThePointer &&
      log.passedMadeRoom &&
      log.nextStayed &&
      log.stillDraggingBelow &&
      log.landedThird &&
      log.settled &&
      log.escPutItBack &&
      log.clickSelects &&
      log.clickMovedNothing &&
      log.overflows &&
      log.edgeScrolled &&
      log.landedLast
  )
  return JSON.stringify(log, null, 1)
})()
