// THE KEYS OF WRITING, IN THE EDITOR.
//
// This held READ's block field to what ↵ meant there: a paragraph split into a
// new block, ⇧↵ a soft break inside one, a list that went on, and a fresh block
// opened from the room under the last. READ does not edit any more — one editor
// does, for the whole note — so the rules came across and the block did not:
//
//  - ↵ on an item continues it: a bullet with a bullet, a task with an OPEN box
//    whatever the one above says, a quote with `> `, and an ordinal with the
//    next number, renumbering the items under it.
//  - What is an item, a quote or prose is READ's to say, the grammar the page
//    is drawn in — not CommonMark's, which ↵ used to ask. A line of prose
//    typed straight under a quote is prose on the page, so ↵ at its end is a
//    plain new line, not `> ` again (red: CommonMark reads it as more of the
//    quote and put you back in it), and ↵ in the middle of it leaves the rest
//    of the line outside the quote too (red: `> ` in front of it). And a `3.`
//    straight under a sentence is an item on the page, so ↵ after it is `4. `
//    (red: CommonMark lets only a `1.` start a list there, and gave a bare
//    line).
//  - ↵ inside a bold phrase in an item closes it before the break and opens it
//    again after the new marker: `- keep **bold**` / `- **words** now` (red:
//    `**bold` on one item and `words**` on the next, stars on both).
//  - ⌦ at the end of a line brings the next line's WORDS up, and its marker
//    goes: `- ` and `- [ ] ` were furniture on their own line, and came up as
//    text in the middle of this one (red on CodeMirror's own ⌦ and ⌥⌦).
//  - ↵ at the start of an ordinal's words puts the new item ABOVE, with that
//    number, and the item and the ones under it count on — the ones of its own
//    list, passing over what is nested in them and a line of prose straight
//    under one, which ↵ at the END of an item counts through too. The ordinal
//    is text, drawn as typed in WRITE and in READ, so `2.` twice is what a
//    reader would see.
//  - ↵ on an item with nothing on it leaves the list rather than laying down a
//    marker nobody asked for, and leaves one blank line between the list and
//    what comes next: words typed straight under an item are that item's
//    continuation to markdown, and the next ↵ would carry the marker on again.
//    That includes a list of ONE, the list you have just started: markdown's
//    own rule reads an empty second item as a request to space the list out,
//    and keeps you in it.
//  - ⌫ at the start of an item's words takes its marker away.
//  - ⇥ and ⇧⇥ indent and outdent an item, and ⇥ never leaves the editor.
//  - ↵ in the middle of a line still cuts it at the caret, and what was ahead of
//    the caret comes down with it.
//  - The room under the last line is still where you add to a note: a click in
//    it puts the caret at the end.
//  - And what is typed reaches the file as it was typed — every byte of it,
//    and nothing else in the note moved.
//
// ⇧↵ is gone as a gesture of its own. A single ↵ on a paragraph is already a
// line break, and READ draws it as one (`doc.js`); a new paragraph is ↵↵, as in
// any editor. A double-click into WRITE, and the room under READ's last block,
// are `editor.js`'s now.
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
  const type = (text) => document.execCommand('insertText', false, text)
  const modeOn = (m) => pane(1)?.querySelector(`[data-mode="${m}"]`)?.dataset.on === '1'
  /**
   * THE CARET GOES WHERE A CLICK PUTS IT — through the editor's own pointer
   * handling, the way a person's does. Setting the page's selection directly
   * is not the same act: the editor only adopts a DOM selection while its
   * window is the front one, and a driven run cannot promise that.
   */
  const clickAt = async (node, offset, after = false) => {
    const r = document.createRange()
    const a = Math.max(0, Math.min(offset, node.data.length - 1))
    r.setStart(node, a)
    r.setEnd(node, Math.min(node.data.length, a + 1))
    const box = r.getBoundingClientRect()
    const x = after ? box.right + 1 : box.left + 0.5
    const y = box.top + box.height / 2
    const at = { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0, detail: 1, view: window }
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
   * A line brought on screen before it is clicked, if it is not there already:
   * a click aimed at a line below the fold lands on whatever the pointer is
   * over, which is not that line.
   */
  const onScreen = async (line) => {
    const sc = pane(1)?.querySelector('[data-find-scope]')
    if (!line || !sc) return
    const r = line.getBoundingClientRect()
    const v = sc.getBoundingClientRect()
    if (r.top >= v.top && r.bottom <= v.bottom) return
    line.scrollIntoView({ block: 'center' })
    await sleep(200)
  }
  /**
   * The caret just before `word`, on the line whose text holds `anchor` — marks
   * and all, since the page keeps a hidden mark's characters.
   */
  const caretBefore = async (anchor, word) => {
    await onScreen(lineWith(anchor))
    const line = lineWith(anchor)
    const n = line && textNodes(line).find((t) => t.data.includes(word))
    if (!n) return false
    await clickAt(n, n.data.indexOf(word))
    return true
  }
  /** The caret INSIDE a piece of rendered text, `at` characters into it. */
  const caretIn = async (s, at = 1) => {
    await onScreen(lineWith(s))
    const line = lineWith(s)
    const n = line && textNodes(line).find((t) => t.data.includes(s))
    if (!n) return false
    await clickAt(n, n.data.indexOf(s) + at)
    return true
  }
  /** The caret at the very end of the line that shows `s`. */
  const caretAtEnd = async (s) => {
    await onScreen(lineWith(s))
    const line = lineWith(s)
    const nodes = line ? textNodes(line) : []
    const last = nodes[nodes.length - 1]
    if (!last) return false
    await clickAt(last, last.data.length - 1, true)
    return true
  }
  const log = {}
  // Anything a click could not find to aim at. Not part of the verdict — the
  // claim that depended on it fails on its own — but it says which one to look at.
  log.missed = []
  const aim = async (what, placed) => {
    if (!(await placed)) log.missed.push(what)
  }

  // Every list stands on its own, with prose between: a blank line alone does
  // not end a markdown list, and the rules for a FIRST item and a later one
  // differ — which is half of what is being asked here.
  const BODY = [
    '# Keys check',
    '',
    '- Keep the browser',
    '- [x] a done task',
    '',
    '1. alpha',
    '2. beta',
    '3. gamma',
    '',
    '> a quoted line',
    '',
    'A paragraph between two lists.',
    '',
    '1) first ordinal',
    '2) second ordinal',
    '   - under the second',
    '3) third ordinal',
    'carried on under the third',
    '4) fourth ordinal',
    '',
    'A paragraph after the ordinals.',
    '',
    '- Stay aligned',
    '- Tab me in',
    '  - nested already',
    '',
    'Another paragraph between two lists.',
    '',
    '- drop my marker',
    '- [ ] drop my box',
    '',
    'Cut here, and this half comes down.',
    '',
    'A third paragraph, to stand between lists.',
    '',
    '- the only item',
    '',
    '> a quote to leave',
    'words typed under the quote',
    '',
    '> another quote',
    'cut this line midway',
    '',
    'Steps to take:',
    '3. third step',
    '',
    'Join onto me',
    '- the item below',
    '',
    'Join the task',
    '- [ ] a task below',
    '',
    '- keep **bold words** now',
    '',
    'The last paragraph of the note.',
    ''
  ].join('\n')

  // --- seed it, and open it the way a person would: by finding it ---
  const made = await window.lanes.noteCreate('Keys check', '_unfiled')
  const PATH = made.path || '_unfiled/keys-check.md'
  await window.lanes.noteWrite(PATH, BODY)
  const disk = async () => (await window.lanes.note(PATH))?.body ?? ''
  key('k')
  await sleep(600)
  const box = document.querySelector('[data-palette-input]')
  const setIn = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
  setIn.call(box, 'Keys check')
  box.dispatchEvent(new Event('input', { bubbles: true }))
  await sleep(1000)
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
  await sleep(1800)
  // A note opens in READ; writing is asked for, with ⌘E.
  if (!content()) key('e')
  for (let i = 0; i < 15 && !lineWith('Keep the browser'); i++) await sleep(200)

  log.opensInWrite = modeOn('WRITE') && Boolean(content()) && Boolean(lineWith('Keep the browser'))
  if (!log.opensInWrite) return { ...log, pass: false }

  /* ---------- ↵ continues what the line is ---------- */

  // A bullet with a bullet.
  await aim('Keep', caretAtEnd('Keep the browser'))
  press('Enter')
  await sleep(120)
  type('and a new item')
  await sleep(120)

  // A task with an OPEN box — continuing from a done one does not hand the new
  // task a tick it has not earned — and then, on the empty item that follows,
  // out of the list altogether.
  await aim('done task', caretAtEnd('a done task'))
  press('Enter')
  await sleep(120)
  type('a task continued')
  press('Enter')
  await sleep(120)
  press('Enter')
  await sleep(120)
  type('out of the list')
  await sleep(120)

  // An ordinal with the next number, and the ones under it moved up by one.
  await aim('alpha', caretAtEnd('alpha'))
  press('Enter')
  await sleep(120)
  type('inserted')
  await sleep(120)

  // ↵ at the start of an ordinal's words: the new item goes in above with its
  // number, and it and the ones under it count on — `1)` kept, the bullet
  // nested under it left alone, and the line of prose straight under the third
  // passed over rather than taken for the list's end.
  await aim('second ordinal', caretIn('second ordinal', 0))
  press('Enter')
  await sleep(120)

  // A quote with `> `.
  await aim('quote', caretAtEnd('a quoted line'))
  press('Enter')
  await sleep(120)
  type('quoted too')
  await sleep(120)

  /* ---------- ⇥ and ⇧⇥ ---------- */

  await aim('Tab me in', caretIn('Tab me in', 3))
  // A ⇥ the editor did not take would move the focus on, out of the note, and
  // the one thing that stops it is the editor claiming the key. A synthetic key
  // never moves the focus, so where the focus is afterwards proves nothing;
  // whether the editor claimed the key does — the key comes back cancelled.
  log.tabStaysInTheEditor = press('Tab') === false
  await sleep(150)
  await aim('nested', caretIn('nested already', 3))
  press('Tab', { shiftKey: true })
  await sleep(150)

  /* ---------- ⌫ at the start of an item ---------- */

  // A later item first, then the first item of the same list — markdown treats
  // the two differently, and the claim is the same for both: the marker goes.
  await aim('box', caretIn('drop my box', 0))
  press('Backspace')
  await sleep(150)
  await aim('marker', caretIn('drop my marker', 0))
  press('Backspace')
  await sleep(150)

  /* ---------- ↵ mid-line cuts there ---------- */

  // At the space before "this": the line above keeps its head and no trailing
  // blank, and the caret goes down with the tail, at its start.
  await aim('cut', caretIn(' this half', 0))
  press('Enter')
  await sleep(120)
  type('so')
  await sleep(1800)

  const after = await disk()
  log.enterContinuesTheList = after.includes('- Keep the browser\n- and a new item\n- [x] a done task')
  log.enterContinuesATaskOpen = after.includes('- [x] a done task\n- [ ] a task continued\n')
  log.emptyItemLeavesTheList =
    /^- \[ \] a task continued\n\nout of the list$/m.test(after) && !/[-*+] (\[.\] )?out of the list/.test(after)
  log.enterRenumbers = after.includes('1. alpha\n2. inserted\n3. beta\n4. gamma')
  log.enterAboveCountsOn = after.includes(
    '1) first ordinal\n2) \n3) second ordinal\n   - under the second\n4) third ordinal\ncarried on under the third\n5) fourth ordinal\n'
  )
  log.enterContinuesTheQuote = after.includes('> a quoted line\n> quoted too\n')
  log.tabIndents = /^ {2}- Tab me in$/m.test(after)
  log.shiftTabOutdents = /^- nested already$/m.test(after)
  log.backspaceTakesTheBox = /^\s*drop my box$/m.test(after) && !/\[.\]\s*drop my box/.test(after)
  log.backspaceTakesTheMarker = /^drop my marker$/m.test(after)
  // Markdown keeps a later item's place when its marker goes — `- [ ] ` becomes
  // six spaces, so the words stay in the item's column. Said, not judged: READ
  // trims them, and whether the editor should keep them is the product's call.
  log.boxLeftIndent = (/^([ \t]*)drop my box$/m.exec(after)?.[1] ?? '').length
  log.cutAtTheCaret = after.includes('\nCut here, and\nso this half comes down.\n')

  // As typed: the file is the seed with exactly these edits in it, byte for
  // byte, and every line nobody touched is where it was. The indent a later
  // item's ⌫ leaves is let off here — it is reported above, not hidden.
  const EXPECT = BODY.replace('- Keep the browser\n', '- Keep the browser\n- and a new item\n')
    .replace('- [x] a done task\n', '- [x] a done task\n- [ ] a task continued\n\nout of the list\n')
    .replace('1. alpha\n2. beta\n3. gamma', '1. alpha\n2. inserted\n3. beta\n4. gamma')
    .replace(
      '1) first ordinal\n2) second ordinal\n   - under the second\n3) third ordinal\ncarried on under the third\n4) fourth ordinal',
      '1) first ordinal\n2) \n3) second ordinal\n   - under the second\n4) third ordinal\ncarried on under the third\n5) fourth ordinal'
    )
    .replace('> a quoted line\n', '> a quoted line\n> quoted too\n')
    .replace('- Tab me in\n  - nested already', '  - Tab me in\n- nested already')
    .replace('- drop my marker\n- [ ] drop my box', 'drop my marker\ndrop my box')
    .replace('Cut here, and this half', 'Cut here, and\nso this half')
  log.fileIsWhatWasTyped = after.replace(/^[ \t]+(drop my box)$/m, '$1') === EXPECT

  /* ---------- a list of one ---------- */

  // The list you have just begun, and changed your mind about: one item, ↵ for
  // a second, and ↵ again on that empty second item. It leaves the list, the
  // same as an empty third or fourth does — not markdown's loose list, a blank
  // line and another marker, but the list over, a blank line under it and no
  // marker carried down onto the words typed next. Asked on its own, after the
  // file has been read, so that it fails on its own.
  await aim('only item', caretAtEnd('the only item'))
  press('Enter')
  await sleep(120)
  press('Enter')
  await sleep(120)
  type('after the only item')
  await sleep(120)

  /* ---------- by READ's grammar ---------- */

  // Prose under a quote is prose: ↵ at its end is a new line of prose, and ↵
  // in the middle of it cuts it there, with nothing in front of the rest.
  await aim('under the quote', caretAtEnd('words typed under the quote'))
  press('Enter')
  await sleep(120)
  type('a line after it')
  await sleep(120)
  await aim('midway', caretIn('midway', 0))
  press('Enter')
  await sleep(120)
  // A `3.` under a sentence is READ's item, and ↵ carries it on.
  await aim('third step', caretAtEnd('third step'))
  press('Enter')
  await sleep(120)
  type('fourth step')
  await sleep(120)

  // ↵ in a bold phrase in an item: two items, each with a phrase READ can read.
  // The item's `- ` is drawn as its bullet, so the line's text starts at its words.
  await aim('words now', caretBefore('keep **bold', 'words'))
  press('Enter')
  await sleep(120)

  /* ---------- ⌦ brings the words up, not the marker ---------- */

  await aim('Join onto', caretAtEnd('Join onto me'))
  type(' ')
  press('Delete')
  await sleep(120)
  await aim('Join the task', caretAtEnd('Join the task'))
  type(' ')
  press('Delete', { altKey: true })
  await sleep(120)

  /* ---------- the room under the last line ---------- */

  const tail = pane(1)?.querySelector('.lanes-ed-tail')
  log.tailFound = Boolean(tail)
  // The editor has held the focus since the first click. Let go of it first,
  // so that having it back is something the tail did.
  content()?.blur()
  await sleep(100)
  tail?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0, view: window }))
  await sleep(250)
  log.tailTakesTheCaret = document.activeElement === content()
  type('Added at the end.')
  await sleep(1800)

  const later = await disk()
  log.emptySecondItemLeavesTheList =
    /^- the only item\n\nafter the only item$/m.test(later) && !/[-*+] after the only item/.test(later)
  // The file ended in a newline, so what is added there starts a line of its own.
  log.tailWritesAtTheEnd = later.endsWith('\nThe last paragraph of the note.\nAdded at the end.')
  log.enterUnderAQuoteIsProse = later.includes('\n> a quote to leave\nwords typed under the quote\na line after it\n')
  // The space the cut fell after stays where it was: a plain line break moves
  // nothing but what is ahead of the caret.
  log.cutUnderAQuoteStaysOut = /\n> another quote\ncut this line ?\nmidway\n/.test(later)
  log.enterCarriesReadsList = later.includes('\nSteps to take:\n3. third step\n4. fourth step\n')
  log.deleteBringsUpTheWords = later.includes('\nJoin onto me the item below\n')
  log.altDeleteBringsUpTheWords = later.includes('\nJoin the task a task below\n')
  log.enterSplitsAnItemsPhrase = later.includes('\n- keep **bold**\n- **words** now\n')
  // What those lines came to, when one of them did not hold.
  if (!(log.enterUnderAQuoteIsProse && log.cutUnderAQuoteStaysOut && log.enterCarriesReadsList && log.deleteBringsUpTheWords && log.altDeleteBringsUpTheWords))
    log.lateLines = later.slice(later.indexOf('> a quote to leave'), later.indexOf('The last paragraph'))

  log.noConflictBanner = !/changed on disk while you were editing/.test(document.body.innerText)

  log.pass = Boolean(
    log.opensInWrite &&
      log.enterContinuesTheList &&
      log.enterContinuesATaskOpen &&
      log.emptyItemLeavesTheList &&
      log.enterRenumbers &&
      log.enterAboveCountsOn &&
      log.enterContinuesTheQuote &&
      log.tabIndents &&
      log.tabStaysInTheEditor &&
      log.shiftTabOutdents &&
      log.backspaceTakesTheBox &&
      log.backspaceTakesTheMarker &&
      log.cutAtTheCaret &&
      log.fileIsWhatWasTyped &&
      log.emptySecondItemLeavesTheList &&
      log.tailFound &&
      log.tailTakesTheCaret &&
      log.tailWritesAtTheEnd &&
      log.enterUnderAQuoteIsProse &&
      log.cutUnderAQuoteStaysOut &&
      log.enterCarriesReadsList &&
      log.deleteBringsUpTheWords &&
      log.altDeleteBringsUpTheWords &&
      log.enterSplitsAnItemsPhrase &&
      log.noConflictBanner
  )
  return log
})()
