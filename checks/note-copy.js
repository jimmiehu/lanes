// A COPY HANDS OVER WHAT WAS SELECTED — and across blocks, the markdown.
//
// Two surfaces, one answer. In READ a phrase inside one block is that phrase:
// the app stays out of it and the browser copies the selection itself. A
// selection across blocks is the markdown between the two points, cut at both
// ends — a list pasted as prose has lost the thing that made it a list.
//
// In WRITE the editor copies its own document, which IS the markdown. So the
// same stretch selected there hands over the same text, byte for byte, as
// READ's copy of it — which mode you happened to be in when you copied is not
// something you should have to remember at the paste. Inside a single line it
// is the source too, `**` and all: the marks are only hidden, never gone. And
// ⌘A, ⌘C takes the body you can see, not the title line the head is already
// saying.
//
// This used to lean on a fixture note and on a READ whose blocks opened as
// fields. READ edits nothing now, so it seeds its own note, ⌘E into the
// editor, copies there first, and presses ⌘E for READ's half.
//
// Seeds its own note through the app's IPC. Run against a throwaway LANES_VAULT
// and LANES_STATE. See checks/README.md.
(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
  const pane = (i) => document.querySelector(`[data-pane="${i}"]`)
  const key = (k, extra = {}) =>
    window.dispatchEvent(new KeyboardEvent('keydown', { key: k, metaKey: true, bubbles: true, ...extra }))
  const content = () => pane(1)?.querySelector('.cm-content')
  const lines = () => [...(pane(1)?.querySelectorAll('.cm-line') ?? [])]
  const lineWith = (s) => lines().find((l) => l.textContent.includes(s))
  const press = (k, mods = {}) =>
    content()?.dispatchEvent(
      new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...mods })
    )
  const scroller = () => pane(1)?.querySelector('[data-find-scope]')
  const mode = (m) => pane(1)?.querySelector(`[data-mode="${m}"]`)?.dataset.on === '1'
  const setIn = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set

  /**
   * THE CARET GOES WHERE A CLICK PUTS IT — through the editor's own pointer
   * handling, the way a person's does. Setting the page's selection directly
   * is not the same act: the editor only adopts a DOM selection while its
   * window is the front one, and a driven run cannot promise that. `mods`
   * carries ⇧, which is how a click EXTENDS the selection rather than moving
   * the caret — the second half of selecting a stretch without a drag.
   */
  const clickAt = async (node, offset, mods = {}) => {
    const r = document.createRange()
    const a = Math.max(0, Math.min(offset, node.data.length - 1))
    r.setStart(node, a)
    r.setEnd(node, Math.min(node.data.length, a + 1))
    const box = r.getBoundingClientRect()
    const x = box.left + 0.5
    const y = box.top + box.height / 2
    const at = { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0, detail: 1, view: window, ...mods }
    ;(document.elementFromPoint(x, y) ?? node.parentElement).dispatchEvent(new MouseEvent('mousedown', at))
    document.dispatchEvent(new MouseEvent('mouseup', at))
    await sleep(250)
  }
  const textNodes = (el) => {
    const out = []
    const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
    let n
    while ((n = walk.nextNode())) if (n.data.length && !n.parentElement?.closest('[contenteditable="false"]')) out.push(n)
    return out
  }
  /**
   * A click just before character `at` of the rendered text `s`. Measured when
   * called, never in advance: a selection reveals the marks it touches, and a
   * point worked out before that reflow is a point on a line that has moved.
   */
  const clickIn = async (s, at, mods = {}) => {
    const line = lineWith(s)
    const n = line && textNodes(line).find((t) => t.data.includes(s))
    if (!n) return false
    await clickAt(n, n.data.indexOf(s) + at, mods)
    return true
  }
  /** A copy fired where the selection is, and what it put on the clipboard. */
  const copyOn = (target) => {
    const data = new DataTransfer()
    const ev = new ClipboardEvent('copy', { clipboardData: data, bubbles: true, cancelable: true })
    target?.dispatchEvent(ev)
    return { text: data.getData('text/plain'), handled: ev.defaultPrevented }
  }
  const log = {}

  const BODY = [
    '# Copy check',
    '',
    'A plain paragraph, with **bold words** in it.',
    '',
    '- [ ] an unchecked task',
    '- a bullet under it',
    ''
  ].join('\n')
  // Everything under the title zone: the title line and the blank after it are
  // the head's, not the body's.
  const UNDER_TITLE = BODY.slice(BODY.indexOf('\n\n') + 2)
  // From just before `plain` to just before the `k` of `unchecked`: a stretch
  // that starts mid-line, crosses a blank line and a hidden `**` pair, and
  // stops inside a task. Its source, exactly.
  const ACROSS = 'plain paragraph, with **bold words** in it.\n\n- [ ] an unchec'

  // --- seed it, and open it the way a person would: by finding it ---
  const made = await window.lanes.noteCreate('Copy check', '_unfiled')
  const PATH = made.path || '_unfiled/copy-check.md'
  await window.lanes.noteWrite(PATH, BODY)
  key('k')
  await sleep(600)
  const box = document.querySelector('[data-palette-input]')
  setIn.call(box, 'Copy check')
  box.dispatchEvent(new Event('input', { bubbles: true }))
  await sleep(1000)
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
  await sleep(1800)
  // A note opens in READ; writing is asked for, with ⌘E.
  if (!content()) key('e')
  for (let i = 0; i < 15 && !lineWith('plain paragraph'); i++) await sleep(200)

  log.opensInTheEditor = Boolean(content()) && Boolean(lineWith('plain paragraph'))
  if (!log.opensInTheEditor) return { ...log, pass: false }

  /* ---------- WRITE: across lines, the source between the two points ---------- */

  log.writeAnchorPlaced = await clickIn('plain paragraph', 0)
  log.writeHeadPlaced = await clickIn('an unchecked task', 9, { shiftKey: true })
  const writeAcross = copyOn(content())
  log.writeAcross = writeAcross.text
  log.writeAcrossIsTheSource = writeAcross.text === ACROSS

  /* ---------- WRITE: inside one line, still the source ---------- */

  // The `**` around `bold words` is off screen when the stretch is chosen —
  // and it goes over all the same, because it is in the document.
  await clickIn('with', 0)
  await clickIn('in it.', 0, { shiftKey: true })
  const writeInLine = copyOn(content())
  log.writeInLine = writeInLine.text
  log.writeInLineKeepsTheMarks = /^with \*\*bold words\*\*\s?$/.test(writeInLine.text)

  /* ---------- WRITE: ⌘A, ⌘C is the body, not the title ---------- */

  press('a', { metaKey: true })
  await sleep(250)
  const all = copyOn(content())
  log.selectAllCopiesTheBody = all.text.replace(/\s+$/, '') === UNDER_TITLE.replace(/\s+$/, '')
  log.selectAllLeavesTheTitle = !all.text.includes('# Copy check')

  /* ---------- READ ---------- */

  for (let i = 0; i < 2 && !mode('READ'); i++) {
    key('e')
    await sleep(800)
  }
  log.inRead = mode('READ') && !content()

  const blocks = () => [...(scroller()?.querySelectorAll('[data-md-from]') ?? [])]
  const blockWith = (re) => blocks().find((b) => re.test(b.textContent || ''))?.firstElementChild ?? null
  // The first text node inside a block, which is what a selection anchors in.
  const textNode = (el) => (el ? document.createTreeWalker(el, NodeFilter.SHOW_TEXT).nextNode() : null)
  /** Selects a range in READ and asks the app what it would put on the clipboard. */
  const copyOf = (aNode, aOff, bNode, bOff) => {
    const sel = window.getSelection()
    const r = document.createRange()
    r.setStart(aNode, aOff)
    r.setEnd(bNode, bOff)
    sel.removeAllRanges()
    sel.addRange(r)
    return { ...copyOn(scroller()), selected: r.toString() }
  }

  // --- inside one block: the app stays out of it, so the browser copies the
  // selection itself ---
  const para = textNode(blockWith(/A plain paragraph/))
  const task = textNode(blockWith(/an unchecked task/))
  log.foundBlocks = Boolean(para) && Boolean(task)
  if (!log.foundBlocks) return { ...log, pass: false }
  const inOne = copyOf(para, 2, para, 13)
  log.oneBlockSelected = inOne.selected
  log.oneBlockLeftToTheBrowser = inOne.handled === false && inOne.text === ''

  // --- across blocks: markdown, cut at both ends ---
  const across = copyOf(para, 2, task, 9)
  log.acrossSelected = across.selected
  log.acrossHandled = across.handled
  log.acrossText = across.text
  // It starts where the selection did, not at the head of the paragraph.
  log.cutAtTheStart = !/^A plain/.test(across.text) && across.text.startsWith('plain')
  // It stops where the selection did, not at the end of the task line.
  log.cutAtTheEnd = /an unchec$/.test(across.text.trim())
  // And the markdown survived — the bold's marks and the task's own marker —
  // because that is what the markdown is for.
  log.keptTheMarkdown = /\*\*bold words\*\*/.test(across.text) && /- \[ \] an unchec/.test(across.text)

  // --- and it is the same text WRITE handed over for the same stretch ---
  log.sameInBothModes = across.text === writeAcross.text

  log.pass =
    log.opensInTheEditor &&
    log.writeAnchorPlaced &&
    log.writeHeadPlaced &&
    log.writeAcrossIsTheSource &&
    log.writeInLineKeepsTheMarks &&
    log.selectAllCopiesTheBody &&
    log.selectAllLeavesTheTitle &&
    log.inRead &&
    log.oneBlockLeftToTheBrowser &&
    log.acrossHandled &&
    log.cutAtTheStart &&
    log.cutAtTheEnd &&
    log.keptTheMarkdown &&
    log.sameInBothModes
  return log
})()
