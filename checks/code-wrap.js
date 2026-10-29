// A CODE BLOCK SHOWS ALL OF ITSELF.
//
// Claude fences a message to send so it can be copied whole — and a fenced
// block kept every line on one row and scrolled sideways inside its card, so a
// draft longer than the measure was a first few words and a cut-off edge; the
// rest was there only for someone who knew to scroll a card sideways. WRITE
// never did this: the editor wraps every line, code included. So READ and a
// thread wrap a code block's lines too, as written — the indentation kept, no
// line reflowed into another — and the card never scrolls sideways.
//
// Held in a thread (the fixture's last answer ends on such a draft), in a
// note's READ and, for the same block, in WRITE: the whole of the long line
// inside its card, the card no wider inside than out, the line on more than
// one row, and the indented line still indented.
//
// Wants the thread fixture: `node checks/thread-fixture.mjs /private/tmp/<vault>`
// and that vault as LANES_VAULT, with a fresh LANES_STATE. See checks/README.md.
(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
  const pane = (i) => document.querySelector(`[data-pane="${i}"]`)
  const key = (k, extra = {}) =>
    window.dispatchEvent(new KeyboardEvent('keydown', { key: k, metaKey: true, bubbles: true, ...extra }))
  const LONG = "Quick follow-up now that I've walked past every bed"
  const LAST = 'before the planting.'
  const INDENTED = 'An indented line keeps its indent.'
  /** The first text node under `root` holding `s`, and the box of `s`'s character `at`. */
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
  /** What a reader can see of the block that holds `LONG`, wherever it is drawn. */
  const read = (root, card) => {
    if (!root || !card) return null
    const first = glyph(root, LONG)
    const end = glyph(root, LAST, LAST.length - 1)
    const indented = glyph(root, INDENTED)
    const c = card.getBoundingClientRect()
    return {
      // Nothing to scroll sideways: the card holds its widest line.
      noSidewaysScroll: card.scrollWidth <= card.clientWidth + 1,
      // The long line's last letter is inside the card, not past its edge.
      endInside: Boolean(end) && end.box.right <= c.right + 0.5 && end.box.width > 0,
      // On more than one row.
      wraps: Boolean(first && end) && end.box.top > first.box.top + 4,
      // And the indented line is still indented.
      indentKept: Boolean(first && indented) && indented.box.left - first.box.left > 12
    }
  }
  const ok = (r) => Boolean(r && r.noSidewaysScroll && r.endInside && r.wraps && r.indentKept)
  const log = {}
  await sleep(2000)

  /* ---------- a thread ---------- */

  const sc0 = pane(0)?.querySelector('[data-find-scope]')
  if (sc0) sc0.scrollTop = sc0.scrollHeight
  await sleep(600)
  const t = glyph(pane(0), LONG)
  log.thread = read(pane(0), t?.node.parentElement)
  log.threadShowsItAll = ok(log.thread)

  /* ---------- a note: READ, then WRITE ---------- */

  const stamp = Date.now().toString(36)
  const TITLE = `Code wrap ${stamp}`
  const made = await window.lanes.noteCreate(TITLE, 'notes')
  await window.lanes.noteWrite(
    made.path,
    `# ${TITLE}\n\nDraft to send:\n\n\`\`\`\n${LONG}: about 12 have come up so far, ~30 come up this week and the rest by Sunday, so Thursday's counts will still move a little ${LAST}\n    ${INDENTED}\n\`\`\`\n`
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
  for (let i = 0; i < 30 && !glyph(pane(1) ?? document.body, LONG); i++) await sleep(150)
  await sleep(400)
  const r = glyph(pane(1), LONG)
  log.read = read(pane(1), r?.node.parentElement)
  log.readShowsItAll = ok(log.read)

  key('e')
  for (let i = 0; i < 30 && !pane(1)?.querySelector('.cm-content'); i++) await sleep(100)
  await sleep(500)
  const content = pane(1)?.querySelector('.cm-content')
  // In WRITE the block is lines of the editor; the "card" is the editor itself.
  log.write = read(content, content)
  log.writeShowsItAll = ok(log.write)

  log.pass = Boolean(log.threadShowsItAll && log.readShowsItAll && log.writeShowsItAll)
  return log
})()
