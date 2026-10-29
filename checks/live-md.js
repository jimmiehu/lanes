// ONE SURFACE, ALWAYS EDITABLE, MARKDOWN LIVE.
//
// WRITE is a document you can type into — ⌘E from READ, which is what a note
// opens as, and then no block to double-click open, no second editor with
// different keys. The
// markdown is rendered where the caret is not and is back where it is: bold is
// bold, a heading is a heading, a list has bullets and a task has a box, and the
// `**` or `##` that made them appears only while you are standing in them.
//
// And it is ONE document: one field, one selection, one undo, the whole way
// down — which is exactly what the per-block editor could not be.
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
   * A line brought on screen before it is clicked: a click aimed below the
   * window lands nowhere near the line it was aimed at. (This note's last
   * lines sat on screen only while a blank line was a third of a line high.)
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
  const fontPx = (el) => (el ? parseFloat(getComputedStyle(el).fontSize) : 0)
  /**
   * The text a READER SEES on a line. Put-away marks are still in the page —
   * drawn as nothing, so the line breaks where READ's does — and `innerText`
   * may still report them; what is not drawn is not seen, so it is left out
   * here.
   */
  const seen = (line) => {
    if (!line) return ''
    let out = ''
    const walk = document.createTreeWalker(line, NodeFilter.SHOW_TEXT)
    let n
    while ((n = walk.nextNode())) {
      const el = n.parentElement
      const cs = el && getComputedStyle(el)
      if (cs && (cs.display === 'none' || parseFloat(cs.fontSize) === 0 || cs.visibility === 'hidden')) continue
      out += n.data
    }
    return out
  }
  const log = {}

  const BODY = [
    '# Live check',
    '',
    'A plain paragraph with **bold words** and *soft words* and `some code` in it.',
    '',
    '## Section two',
    '',
    '- first item',
    '- second item',
    '- [ ] an open task',
    '- [x] a done task',
    '',
    '### Deeper',
    '',
    '> a quoted line',
    '',
    '[[scratch]] is a wikilink, and [a link](https://example.com) is a link.',
    ''
  ].join('\n')

  // --- seed it, and open it the way a person would: by finding it ---
  const made = await window.lanes.noteCreate('Live check', '_unfiled')
  const PATH = made.path || '_unfiled/live-check.md'
  await window.lanes.noteWrite(PATH, BODY)
  const disk = async () => (await window.lanes.note(PATH))?.body ?? ''
  key('k')
  await sleep(600)
  const box = document.querySelector('[data-palette-input]')
  const setIn = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
  setIn.call(box, 'Live check')
  box.dispatchEvent(new Event('input', { bubbles: true }))
  await sleep(1000)
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
  await sleep(1800)
  // A note opens in READ (`read-default.js`); WRITE is one ⌘E away.
  log.opensInRead = !content()
  key('e')
  for (let i = 0; i < 20 && !content(); i++) await sleep(100)
  await sleep(300)

  // --- WRITE IS ONE FIELD. Nothing double-clicked open, no block to enter. ---
  log.opensInTheEditor = Boolean(content())
  log.contentEditable = content()?.getAttribute('contenteditable') === 'true'
  log.oneField = (pane(1)?.querySelectorAll('.cm-content').length ?? 0) === 1
  log.noBlockField = !document.querySelector('[data-block-field]')
  log.noMirror = !document.querySelector('.ia-field, .ia-mirror')

  // --- THE TITLE IS SAID ONCE, and it is the head's. ---
  const title = pane(1)?.querySelector('[data-note-title]')
  log.titleInHead = title?.textContent.trim() === 'Live check'
  log.titleNotInBody = !lines().some((l) => /^#?\s*Live check\s*$/.test(l.textContent))

  // --- MARKDOWN, RENDERED, with the caret somewhere else entirely ---
  await caretAtEnd('is a link')
  const para = lineWith('bold words')
  log.boldShownBold = Boolean(
    para && [...para.querySelectorAll('*')].some(
      (e) => e.textContent === 'bold words' && Number(getComputedStyle(e).fontWeight) >= 600
    )
  )
  log.syntaxAwayIsHidden =
    Boolean(para) && !seen(para).includes('**') && !seen(para).includes('`')
  const h2 = lineWith('Section two')
  log.headingAwayHidesHashes = Boolean(h2) && !seen(h2).includes('##')
  const h3 = lineWith('Deeper')
  log.h3Px = fontPx(h3)
  log.bodyPx = fontPx(para)
  log.headingIsBigger = log.h3Px > log.bodyPx
  log.bullets = pane(1)?.querySelectorAll('.cm-md-bullet').length ?? 0
  log.boxes = pane(1)?.querySelectorAll('.cm-md-task').length ?? 0
  log.listsAreDrawn = log.bullets >= 2 && log.boxes === 2
  const wiki = lineWith('is a wikilink')
  log.wikiBracketsHidden = Boolean(wiki) && !seen(wiki).includes('[[')
  log.linkUrlHidden = Boolean(wiki) && !seen(wiki).includes('example.com')

  // --- AND BACK WHERE YOU STAND ---
  await caretIn('bold words', 2)
  log.boldRevealedWhereYouAre = seen(lineWith('bold words')).includes('**bold words**')
  // Only THAT mark: the rest of the paragraph stays rendered.
  log.onlyThatMark = !seen(lineWith('bold words')).includes('`some code`')
  await caretIn('Section two', 3)
  log.hashesRevealedWhereYouAre = seen(lineWith('Section two')).includes('##')

  // --- THE SIZE OF THE WORDS. READ's body, not a code font at 15px. ---
  log.notTooBig = log.bodyPx > 0 && log.bodyPx <= 14
  key('e')
  await sleep(700)
  const readPara = [...(pane(1)?.querySelectorAll('[data-md-from]') ?? [])]
    .map((d) => d.firstElementChild)
    .find((d) => d && /bold words/.test(d.textContent))
  log.readPx = fontPx(readPara)
  log.sameSizeInRead = log.readPx > 0 && Math.abs(log.readPx - log.bodyPx) < 0.5
  // READ is for reading: nothing in it opens a field any more.
  log.readHasNoEditor = !content()
  if (readPara) {
    const r = readPara.getBoundingClientRect()
    readPara.dispatchEvent(
      new MouseEvent('dblclick', { bubbles: true, clientX: r.left + 30, clientY: r.top + 8 })
    )
    await sleep(900)
  }
  log.readDoubleClickBlockField = Boolean(document.querySelector('[data-block-field]'))
  // A double-click in READ is a request to write THERE: the editor comes back
  // with the caret in that paragraph.
  log.doubleClickLandsInEditor = Boolean(content()) && document.activeElement === content()
  const sel = window.getSelection()
  log.caretInThatParagraph = Boolean(
    sel?.anchorNode && lineWith('bold words')?.contains(sel.anchorNode)
  )
  if (!content()) {
    key('e')
    await sleep(700)
  }

  // --- A TASK TICKS FROM ITS BOX ---
  const open = [...(pane(1)?.querySelectorAll('.cm-md-task') ?? [])].find(
    (b) => b.closest('.cm-line')?.textContent.includes('an open task')
  )
  if (open) {
    const r = open.getBoundingClientRect()
    const at = { bubbles: true, cancelable: true, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2, button: 0 }
    open.dispatchEvent(new MouseEvent('mousedown', at))
    open.dispatchEvent(new MouseEvent('mouseup', at))
    open.dispatchEvent(new MouseEvent('click', at))
  }
  await sleep(1800)
  log.taskTickedOnDisk = (await disk()).includes('- [x] an open task')

  // --- THE KEYS OF A WRITING SURFACE ---
  await caretAtEnd('second item')
  type(' typed')
  press('Enter')
  await sleep(120)
  type('third item')
  press('Enter')
  await sleep(120)
  // Enter on an item with nothing on it leaves the list rather than laying down
  // another marker nobody asked for.
  press('Enter')
  await sleep(120)
  type('out of the list')
  await sleep(1800)
  const after = await disk()
  log.enterContinuesTheList = after.includes('- second item typed\n- third item\n')
  log.emptyItemLeavesTheList = /- third item\n\n?out of the list/.test(after) && !after.includes('- out of the list')

  // --- AND OUT OF A QUOTE the same way: ↵ on the empty `>` line leaves it.
  // Markdown's own rule would keep you in for a third press, and everything
  // typed before it would land inside the quote. ---
  await caretAtEnd('a quoted line')
  press('Enter')
  await sleep(120)
  press('Enter')
  await sleep(120)
  type('after the quote')
  await sleep(1800)
  // And leaving STICKS: a blank line is left under the quote, because a line
  // typed straight under one is part of it to the markdown underneath, and the
  // next ↵ would carry the `>` on again.
  press('Enter')
  await sleep(120)
  type('and still out')
  await sleep(1800)
  const quoted = await disk()
  log.enterLeavesTheQuote =
    quoted.includes('> a quoted line\n\nafter the quote\nand still out') &&
    !quoted.includes('> after the quote') &&
    !quoted.includes('> and still out')

  // --- THE HEAD OF A LIST LINE. Home and ⌘← go to the start of the WORDS —
  // the bullet is furniture — and ↵ there puts a new item ABOVE, the words
  // staying where they are. A one-item list is left by ↵ ↵ like any other. ---
  await caretAtEnd('and still out')
  press('Enter')
  press('Enter')
  await sleep(100)
  type('- alpha')
  press('Enter')
  await sleep(100)
  type('beta')
  await sleep(150)
  // Home, from the end of an item: to the start of its words.
  press('Home')
  await sleep(150)
  type('H')
  // ⌘←, from the end again: the same place.
  press('End')
  await sleep(100)
  press('ArrowLeft', { metaKey: true })
  await sleep(150)
  type('C')
  // ⌘← to the words' start, and ↵ there: a new, empty item above, and the
  // caret still with the words — so the next letter lands at their start.
  press('ArrowLeft', { metaKey: true })
  await sleep(150)
  press('Enter')
  await sleep(150)
  type('D')
  await sleep(1800)
  const heads = await disk()
  log.headsTail = heads.slice(heads.indexOf('- alpha'), heads.indexOf('- alpha') + 40)
  log.homeGoesToTheWords = !/alpha[HC]|[HC]- /.test(heads) && heads.includes('CHbeta')
  log.enterAtTheWordsMakesAnItemAbove = heads.includes('- alpha\n- \n- DCHbeta')
  await caretAtEnd('DCHbeta')
  press('Enter')
  press('Enter')
  await sleep(120)
  type('- only one')
  press('Enter')
  await sleep(100)
  press('Enter')
  await sleep(120)
  type('prose again')
  await sleep(1800)
  const one = await disk()
  log.oneItemListLeftByTwoEnters = one.includes('- only one\n\nprose again') && !one.includes('- prose again')

  // --- `]]` TYPED OVER, NOT ADDED. `[[` closes itself; closing it again by
  // habit must leave one pair of brackets, not two. ---
  // One key at a time, with the gap a hand leaves: inserts back to back reach
  // the editor as one input of several characters, which is not the second `[`
  // or the `]` it is listening for — and a check typed that way passes with no
  // closing and no stepping over at all.
  await caretAtEnd('prose again')
  type(' see ')
  await sleep(60)
  type('[')
  await sleep(60)
  type('[')
  await sleep(150)
  // The second `[` closed the link, with the caret between — asked of the
  // editor's document, since that is what the step-over below depends on.
  {
    const v = content()?.cmTile?.view ?? content()?.cmView?.view
    const at = v?.state.selection.main.head ?? -1
    const line = v ? v.state.doc.lineAt(at) : null
    log.bracketsCloseThemselves = Boolean(line) && line.text.endsWith('see [[]]') && at === line.to - 2
  }
  type('scratch')
  // Out of the note list the brackets opened — Escape closes it without taking
  // one. Once it is open: an esc with no list to close is the editor's, which
  // is the way out of WRITE now, and asks first since words were written.
  for (let i = 0; i < 20 && !document.querySelector('.cm-tooltip.lanes-complete'); i++) await sleep(100)
  log.noteListOpened = Boolean(document.querySelector('.cm-tooltip.lanes-complete'))
  press('Escape')
  await sleep(150)
  log.escClosedTheListOnly = !document.querySelector('.cm-tooltip.lanes-complete') && !document.querySelector('[data-leave-ask]')
  content()?.focus()
  await sleep(100)
  type(']')
  await sleep(60)
  type(']')
  await sleep(60)
  type(' after')
  await sleep(1800)
  const linked = await disk()
  // The line ENDS there. Brackets added rather than stepped over leave the
  // caret inside the pair the editor closed, and the words after them land
  // between — `see [[scratch]] after]]`, which still contains the right text.
  log.closingBracketsTypedOver = /see \[\[scratch\]\] after$/m.test(linked) && !linked.includes(']]]]')

  // --- A CLICK LANDS WHERE IT IS AIMED, hidden marks or none. A click just
  // past the end of a line that holds a hidden wikilink and a hidden link URL
  // is a click at the line's END — not inside the first hidden thing on it,
  // which is where zero-size marks once sent it. ---
  await caretAtEnd('is a link')
  type('~')
  await sleep(1800)
  log.clickPastHiddenMarksLandsAtTheEnd = (await disk()).includes('is a link.~')

  // --- ONE UNDO, THE WHOLE WAY DOWN. Typing in a list, a tick up in a task and
  // a paragraph under them all walk back as one history to the note as seeded. ---
  content()?.focus()
  for (let i = 0; i < 120; i++) {
    press('z', { metaKey: true })
    await sleep(60)
  }
  await sleep(1800)
  log.undoWalksItAllBack = (await disk()) === BODY

  // --- A REAL NOTE'S SHAPE: frontmatter, a blank line, then the title. The
  // vault is full of these, and READ has always taken that heading as the
  // title — so the editor must hide it too, and the head must write THAT line,
  // not add a second heading above it. ---
  const front = await window.lanes.noteCreate('Frontmatter check', '_unfiled')
  const FPATH = front.path || '_unfiled/frontmatter-check.md'
  await window.lanes.noteWrite(FPATH, '# Frontmatter check\n\nThe words under it.\n')
  // noteWrite keeps what is above the body; the frontmatter and the blank line
  // are written as the file would have them, through a write of the whole body
  // with the blank line leading.
  await window.lanes.noteWrite(FPATH, '\n# Frontmatter check\n\nThe words under it.\n')
  key('k')
  await sleep(600)
  const box2 = document.querySelector('[data-palette-input]')
  setIn.call(box2, 'Frontmatter check')
  box2.dispatchEvent(new Event('input', { bubbles: true }))
  await sleep(1000)
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
  await sleep(1800)
  // It opens in READ; the head's title is a field in WRITE.
  if (!content()) {
    key('e')
    await sleep(900)
  }
  const fTitle = pane(1)?.querySelector('[data-note-title]')
  log.leadingBlankTitleInHead = fTitle?.textContent.trim() === 'Frontmatter check'
  log.leadingBlankTitleNotInBody = !lines().some((l) => /Frontmatter check/.test(l.textContent))
  if (fTitle) {
    fTitle.focus()
    const r = document.createRange()
    r.selectNodeContents(fTitle)
    r.collapse(false)
    window.getSelection().removeAllRanges()
    window.getSelection().addRange(r)
    await sleep(100)
    type(' renamed')
    // ↵ settles it. (Esc is the way out of WRITE now, and with a title typed
    // it asks before it throws that away — `esc-discard.js`.)
    fTitle.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))
  }
  await sleep(2000)
  const fBody = (await window.lanes.note(FPATH))?.body ?? ''
  log.headWritesThatHeading = (fBody.match(/^# /gm) || []).length === 1 && fBody.includes('# Frontmatter check renamed')

  // --- Nothing above was a conflict with the disk. ---
  log.noConflictBanner = !/changed on disk while you were editing/.test(pane(1)?.innerText ?? '')

  log.pass =
    log.opensInTheEditor &&
    log.contentEditable &&
    log.oneField &&
    log.noBlockField &&
    log.noMirror &&
    log.titleInHead &&
    log.titleNotInBody &&
    log.boldShownBold &&
    log.syntaxAwayIsHidden &&
    log.headingAwayHidesHashes &&
    log.headingIsBigger &&
    log.listsAreDrawn &&
    log.wikiBracketsHidden &&
    log.linkUrlHidden &&
    log.boldRevealedWhereYouAre &&
    log.onlyThatMark &&
    log.hashesRevealedWhereYouAre &&
    log.notTooBig &&
    log.sameSizeInRead &&
    log.readHasNoEditor &&
    !log.readDoubleClickBlockField &&
    log.doubleClickLandsInEditor &&
    log.caretInThatParagraph &&
    log.taskTickedOnDisk &&
    log.enterContinuesTheList &&
    log.emptyItemLeavesTheList &&
    log.enterLeavesTheQuote &&
    log.homeGoesToTheWords &&
    log.enterAtTheWordsMakesAnItemAbove &&
    log.oneItemListLeftByTwoEnters &&
    log.bracketsCloseThemselves &&
    log.closingBracketsTypedOver &&
    log.noteListOpened &&
    log.escClosedTheListOnly &&
    log.clickPastHiddenMarksLandsAtTheEnd &&
    log.leadingBlankTitleInHead &&
    log.leadingBlankTitleNotInBody &&
    log.headWritesThatHeading &&
    log.undoWalksItAllBack &&
    log.noConflictBanner
  return log
})()
