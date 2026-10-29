// YOUR OWN TURN SHOWS ALL OF ITSELF.
//
// Your turn is drawn literally, as typed, and the bubble kept every line whole
// — so a pasted address with nowhere to break, a calendar invitation's
// RESPOND link, ran out of the bubble and past the pane's edge, its end
// visible to no one. Claude's own turns already break such a line. So does
// yours now: the address is broken wherever it has to be, the bubble no wider
// inside than out, and the line it is on still the words you wrote.
//
// Held on the fixture's third turn of yours, which pastes such a link: its last
// letter inside the bubble, on more than one row, nothing scrolling sideways,
// and the bubble inside its pane.
//
// Wants the thread fixture: `node checks/thread-fixture.mjs /private/tmp/<vault>`
// and that vault as LANES_VAULT, with a fresh LANES_STATE. See checks/README.md.
(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
  const START = 'https://calendar.example.com'
  const END = 'tok=MjEjYWRhLmxvdmVsYWNl'
  /** The text node holding `s`, and the box of its character `at`. */
  const glyph = (root, s, at = 0) => {
    const walk = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
    let n
    while ((n = walk.nextNode())) {
      const i = n.data.indexOf(s)
      if (i < 0) continue
      const r = document.createRange()
      r.setStart(n, i + at)
      r.setEnd(n, i + at + 1)
      return { node: n, box: r.getBoundingClientRect() }
    }
    return null
  }
  const log = {}
  await sleep(2000)
  const pane = document.querySelector('[data-pane="0"]')
  const sc = pane?.querySelector('[data-find-scope]')
  const first = pane && glyph(pane, START)
  if (!first) return { pass: false, why: 'no pasted link in the thread: lay the fixture down again' }
  first.node.parentElement.scrollIntoView({ block: 'center' })
  await sleep(500)
  const turn = first.node.parentElement.closest('[data-msg-role="you"]')
  const bubble = first.node.parentElement.parentElement
  const a = glyph(pane, START)
  const end = glyph(pane, END, END.length - 1)
  const b = bubble.getBoundingClientRect()
  const p = (sc ?? pane).getBoundingClientRect()
  log.yours = Boolean(turn)
  log.endInsideBubble = Boolean(end) && end.box.width > 0 && end.box.right <= b.right + 0.5
  log.bubbleInsidePane = b.right <= p.right + 0.5
  log.wraps = Boolean(a && end) && end.box.top > a.box.top + 4
  log.noSidewaysScroll = bubble.scrollWidth <= bubble.clientWidth + 1 && (!sc || sc.scrollWidth <= sc.clientWidth + 1)
  log.pass = Boolean(log.yours && log.endInsideBubble && log.bubbleInsidePane && log.wraps && log.noSidewaysScroll)
  return log
})()
