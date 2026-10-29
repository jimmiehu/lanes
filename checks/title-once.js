// A note's own title is said once, by the head — in both surfaces.
//
// The first line's `# Title` is the note's name, and the head already says it
// two lines above the words, in the type a title has. Saying it again as the
// first line of the document is the same words twice, and the second copy is
// not even the one you rename by. An h1 further down is a heading somebody
// wrote and stays; a note with no h1 loses nothing.
//
// WHAT THE REBUILD CHANGED. This used to be a claim about READ alone, which was
// where a note opened; WRITE was a textarea that showed the `# Title` line like
// any other. WRITE is now one editor, and there the head's title
// is a FIELD bound to that line, and the editor hides the line (and the blank
// under it) so the title is still said once. So this holds it twice: in WRITE,
// the head's field carries the title, no editor line does, and ↑ from the top
// of the words goes up into that field rather than into a hidden line; and in
// READ, after ⌘E, the first h1 block is dropped exactly as before.
//
// Two shapes the vault's own notes are not, but can be. A title with no blank
// line under it: what is hidden is settled when the note opens, so the blank
// line ↵ opens at the top of the words is the writer's — on screen, and taken
// back by ⌫ — rather than folded into the hidden zone, where ↵ drew nothing and
// ⌫ went up into the title instead. It stays the writer's while the note is
// written from outside further down, as Claude writes to a note beside its
// thread: the disk decides only the top of the note. And a note that is NOTHING
// but its title line, as a file from outside can be: the title still said once,
// the caret under it rather than in front of its `#`, and the first word typed
// on a line of its own — with nothing written to the file until then.
//
// Seeds its own four notes through the app's IPC. Run against a throwaway
// LANES_VAULT and LANES_STATE. See checks/README.md.
(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
  const key = (k, extra = {}) =>
    window.dispatchEvent(new KeyboardEvent('keydown', { key: k, metaKey: true, bubbles: true, ...extra }))
  const pane = () => document.querySelector('[data-pane="1"]')
  const head = () => pane()?.querySelector('[data-head="1"]')
  const doc = () => pane()?.querySelector('[data-find-scope]')
  const content = () => pane()?.querySelector('.cm-content')
  const titleField = () => pane()?.querySelector('[data-note-title]')
  const lines = () => [...(pane()?.querySelectorAll('.cm-line') ?? [])]
  const lineWith = (s) => lines().find((l) => l.textContent.includes(s))
  const press = (el, k, mods = {}) =>
    el?.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...mods }))
  // READ's own blocks, without the head that scrolls with them.
  const blocks = () =>
    [...(doc()?.querySelectorAll('[data-md-from]') ?? [])].map((d) => (d.textContent || '').trim())
  /**
   * THE CARET GOES WHERE A CLICK PUTS IT — through the editor's own pointer
   * handling, as a person's does. Setting the page's selection directly is not
   * the same act: the editor only adopts a DOM selection while its window is
   * the front one, and a driven run cannot promise that.
   */
  const clickAt = async (node, offset) => {
    const r = document.createRange()
    const a = Math.max(0, Math.min(offset, node.data.length - 1))
    r.setStart(node, a)
    r.setEnd(node, Math.min(node.data.length, a + 1))
    const box = r.getBoundingClientRect()
    const x = box.left + 0.5
    const y = box.top + box.height / 2
    const at = { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0, detail: 1, view: window }
    ;(document.elementFromPoint(x, y) ?? node.parentElement).dispatchEvent(new MouseEvent('mousedown', at))
    document.dispatchEvent(new MouseEvent('mouseup', at))
    await sleep(250)
  }
  /** The caret just before the first character of the line that shows `s`. */
  const caretAtStart = async (s) => {
    const line = lineWith(s)
    if (!line) return false
    const walk = document.createTreeWalker(line, NodeFilter.SHOW_TEXT)
    let n
    while ((n = walk.nextNode())) {
      if (!n.data.trim() || n.parentElement?.closest('[contenteditable="false"]')) continue
      await clickAt(n, 0)
      return document.activeElement === content()
    }
    return false
  }
  /**
   * Open a note the way a person finds one: ⌘K, its name, ↵. Waits until the
   * row ↵ belongs to IS that note — pressed early, ↵ takes the offer to make a
   * new note by that name instead.
   */
  const openByName = async (name) => {
    key('k')
    await sleep(600)
    const box = document.querySelector('[data-palette-input]')
    if (!box) return false
    const setIn = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
    setIn.call(box, name)
    box.dispatchEvent(new Event('input', { bubbles: true }))
    // Found by its text, which can wait on the index while the vault is being
    // read — so given time, and ↵ only on the row that IS this note: pressed on
    // anything else it opens the wrong note, or makes a new one by that name,
    // and every assertion after it is about a note nobody meant.
    let found = false
    for (let i = 0; i < 80 && !found; i++) {
      const on = document.querySelector('.pal-row[data-pal-on="1"]')
      const t = on?.textContent.trim().toLowerCase() ?? ''
      found = t.includes(name.toLowerCase()) && !t.startsWith('+')
      if (!found) await sleep(100)
    }
    if (!found) {
      log[`notFound_${name}`] = true
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
      await sleep(300)
      return false
    }
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    await sleep(1800)
    // It opens in READ; this is about the head while you write, so ⌘E.
    if (!content()) {
      key('e')
      await sleep(900)
    }
    return true
  }
  // Said once inside the document's own scroller, which holds the head and the
  // words both. The tab strip naming the tab is a different thing saying a
  // different thing, and it is not in here.
  const timesSaid = (s) => (doc()?.innerText ?? '').split(s).length - 1
  const log = {}
  await sleep(1200)

  const TITLE = "The note's own title"
  const BODY = [
    `# ${TITLE}`,
    '',
    'The first paragraph, which is where the document starts.',
    '',
    '## A section',
    '',
    'Some prose under it.',
    '',
    '# A second h1, further down',
    '',
    'And prose after that.',
    ''
  ].join('\n')
  const BARE = [
    'This note opens on prose, and has no heading of its own anywhere.',
    '',
    'A second paragraph.',
    ''
  ].join('\n')

  const made = await window.lanes.noteCreate(TITLE, '_unfiled')
  const PATH = made.path || '_unfiled/the-note-s-own-title.md'
  await window.lanes.noteWrite(PATH, BODY)
  // Made with a name, then written without an h1, which is the note under
  // test. Found below by its words, not that name: a note seeded through the
  // IPC is in main's index but not yet in the window's note list, so ⌘K knows
  // it only by what its text says.
  const bare = await window.lanes.noteCreate('No title check', '_unfiled')
  const BARE_PATH = bare.path || '_unfiled/no-title-check.md'
  await window.lanes.noteWrite(BARE_PATH, BARE)
  // A title with its words straight under it — no blank line between.
  const TIGHT_TITLE = 'Tight title check'
  const TIGHT = [`# ${TIGHT_TITLE}`, 'The words right under the title.', 'And a second line of them.', ''].join('\n')
  const tight = await window.lanes.noteCreate(TIGHT_TITLE, '_unfiled')
  const TIGHT_PATH = tight.path || '_unfiled/tight-title-check.md'
  await window.lanes.noteWrite(TIGHT_PATH, TIGHT)
  // A note that is its title line and nothing else, not even a line break.
  const LONE_TITLE = 'Lone title check'
  const LONE = `# ${LONE_TITLE}`
  const lone = await window.lanes.noteCreate(LONE_TITLE, '_unfiled')
  const LONE_PATH = lone.path || '_unfiled/lone-title-check.md'
  await window.lanes.noteWrite(LONE_PATH, LONE)

  /* ---------- WRITE, by ⌘E from READ, where a note opens ---------- */

  await openByName(TITLE)
  for (let i = 0; i < 20 && !lineWith('The first paragraph'); i++) await sleep(150)
  log.opensInWrite = Boolean(content())
  // The head says it, in a field you can type the title into.
  log.writeHeadSaysIt = titleField()?.textContent.trim() === TITLE
  // No editor line says it — not as `# …`, not as the words alone.
  log.writeTitleNotInTheEditor = !lines().some((l) => l.textContent.includes(TITLE))
  log.writeFirstLine = lines()[0]?.textContent ?? null
  log.writeStartsWithTheProse = Boolean(log.writeFirstLine?.startsWith('The first paragraph'))
  // An h1 further down is somebody's heading, drawn as one.
  log.writeLaterH1Kept = Boolean(lineWith('A second h1, further down')?.classList.contains('cm-md-h1'))
  log.writeSaidOnce = timesSaid(TITLE) === 1

  // The hidden line is not a place the caret can be. ↑ from the top of the
  // words goes to where the title IS — the head — and ↓ comes straight back.
  log.caretInTheWords = await caretAtStart('The first paragraph')
  press(content(), 'ArrowUp')
  await sleep(250)
  log.upGoesToTheHeadsTitle = document.activeElement === titleField()
  press(titleField(), 'ArrowDown')
  await sleep(250)
  log.downComesBackToTheWords = document.activeElement === content()
  // Nothing typed, so nothing renamed or rewritten — and esc, with nothing
  // written, is simply the way out to READ: no question asked.
  press(content(), 'Escape')
  await sleep(1800)
  log.fileUntouched = ((await window.lanes.note(PATH))?.body ?? '') === BODY

  /* ---------- READ, by esc ---------- */

  log.escAskedNothing = !document.querySelector('[data-leave-ask]')
  log.readMode = !content() && blocks().length > 0
  log.readHeadSaysIt = (head()?.innerText ?? '').includes(TITLE)
  log.readBlocks = blocks()
  log.readTitleNotRepeated = !blocks().includes(TITLE)
  log.readStartsWithTheProse = Boolean(blocks()[0]?.startsWith('The first paragraph'))
  log.readLaterH1Kept = blocks().includes('A second h1, further down')
  log.readSaidOnce = timesSaid(TITLE) === 1

  /* ---------- a note with no h1 loses nothing ---------- */

  await openByName('This note opens on prose')
  for (let i = 0; i < 20 && !lineWith('This note opens on prose'); i++) await sleep(150)
  // Nothing hidden: the editor's first line is the note's first line.
  log.bareFirstLine = lines()[0]?.textContent ?? null
  log.bareWriteKeepsTheFirstLine = Boolean(log.bareFirstLine?.startsWith('This note opens on prose'))
  // The head still names it — by the name the vault gives a note with no h1.
  log.bareHead = titleField()?.textContent.trim() ?? null
  log.bareHeadNamesIt = Boolean(log.bareHead)
  key('e')
  await sleep(900)
  log.bareReadBlocks = blocks()
  log.bareReadKeepsTheFirstBlock = Boolean(blocks()[0]?.startsWith('This note opens on prose'))
  key('e')
  await sleep(700)
  log.bareFileUntouched = ((await window.lanes.note(BARE_PATH))?.body ?? '') === BARE

  /* ---------- a title with no blank line under it ---------- */

  await openByName(TIGHT_TITLE)
  for (let i = 0; i < 20 && !lineWith('The words right under'); i++) await sleep(150)
  log.tightTitleNotInTheEditor = !lines().some((l) => l.textContent.includes(TIGHT_TITLE))
  log.tightCaretInTheWords = await caretAtStart('The words right under')
  // ↵ at the top of the words opens a line above them, and it is on screen —
  // not folded into the hidden lines, where it drew nothing at all.
  press(content(), 'Enter')
  await sleep(250)
  log.tightEnterFirstLine = lines()[0]?.textContent ?? null
  log.tightEnterOpensALine =
    lines()[0]?.textContent === '' && Boolean(lines()[1]?.textContent.startsWith('The words right under'))
  // The note written from outside at its END while that line is still empty
  // leaves the line where it is. Straight through the IPC, as an edit from the
  // thread arrives — once the ↵ has reached the file, so that nothing is owed
  // and the change simply loads. Asked afresh on any change from disk, the
  // hidden lines took the empty line in, and ⌫ below went up into the title.
  const OPENED = TIGHT.replace('\n', '\n\n')
  for (let i = 0; i < 40 && ((await window.lanes.note(TIGHT_PATH))?.body ?? '') !== OPENED; i++) await sleep(200)
  // And a breath more, so the app's own save is settled, not in flight.
  await sleep(600)
  const OUTSIDE = 'A line written from outside, at the end.'
  await window.lanes.noteWrite(TIGHT_PATH, `${OPENED}${OUTSIDE}\n`)
  // The poll is every 4s, so 10s covers two of them.
  const t0 = performance.now()
  while (!lineWith(OUTSIDE) && performance.now() - t0 < 10000) await sleep(200)
  await sleep(300)
  log.tightOutsideArrived = Boolean(lineWith(OUTSIDE))
  log.tightOutsideLeavesTheLine =
    lines()[0]?.textContent === '' && Boolean(lines()[1]?.textContent.startsWith('The words right under'))
  // And ⌫ takes it back, rather than going up into the title and leaving it.
  press(content(), 'Backspace')
  await sleep(250)
  log.tightBackspaceTakesItBack =
    document.activeElement === content() && Boolean(lines()[0]?.textContent.startsWith('The words right under'))
  await sleep(1800)
  log.tightFileAsItWas = ((await window.lanes.note(TIGHT_PATH))?.body ?? '') === `${TIGHT}${OUTSIDE}\n`

  /* ---------- a note that is only its title line ---------- */

  await openByName(LONE_TITLE)
  await sleep(600)
  log.loneHeadSaysIt = titleField()?.textContent.trim() === LONE_TITLE
  log.loneTitleNotInTheEditor = !lines().some((l) => l.textContent.includes(LONE_TITLE))
  log.loneSaidOnce = timesSaid(LONE_TITLE) === 1
  // Where the caret starts, asked of the editor itself: on the line under the
  // title, not in front of the `#`.
  {
    const v = content()?.cmTile?.view ?? content()?.cmView?.view
    const head = v ? v.state.selection.main.head : -1
    log.loneCaretStartsUnderIt = Boolean(v) && head >= 0 && v.state.doc.lineAt(head).number > 1
  }
  // Opened and looked at, nothing typed: nothing written.
  await sleep(1800)
  log.loneFileUntouchedOnOpen = ((await window.lanes.note(LONE_PATH))?.body ?? '') === LONE
  // A click on the one line there is, and a word: on a line of its own, under
  // the title — which is still the note's name.
  const first = lines()[0]
  if (first) {
    const r = first.getBoundingClientRect()
    const x = r.left + 2
    const y = r.top + r.height / 2
    const at = { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0, detail: 1, view: window }
    ;(document.elementFromPoint(x, y) ?? first).dispatchEvent(new MouseEvent('mousedown', at))
    document.dispatchEvent(new MouseEvent('mouseup', at))
    await sleep(250)
  }
  document.execCommand('insertText', false, 'Words under a lone title.')
  await sleep(1800)
  log.loneBody = (await window.lanes.note(LONE_PATH))?.body ?? null
  log.loneTypingGoesUnderIt = log.loneBody === `${LONE}\nWords under a lone title.`
  log.loneStillNamed = titleField()?.textContent.trim() === LONE_TITLE

  log.pass =
    log.opensInWrite &&
    log.escAskedNothing &&
    log.writeHeadSaysIt &&
    log.writeTitleNotInTheEditor &&
    log.writeStartsWithTheProse &&
    log.writeLaterH1Kept &&
    log.writeSaidOnce &&
    log.caretInTheWords &&
    log.upGoesToTheHeadsTitle &&
    log.downComesBackToTheWords &&
    log.fileUntouched &&
    log.readMode &&
    log.readHeadSaysIt &&
    log.readTitleNotRepeated &&
    log.readStartsWithTheProse &&
    log.readLaterH1Kept &&
    log.readSaidOnce &&
    log.bareWriteKeepsTheFirstLine &&
    log.bareHeadNamesIt &&
    log.bareReadKeepsTheFirstBlock &&
    log.bareFileUntouched &&
    log.tightTitleNotInTheEditor &&
    log.tightCaretInTheWords &&
    log.tightEnterOpensALine &&
    log.tightOutsideArrived &&
    log.tightOutsideLeavesTheLine &&
    log.tightBackspaceTakesItBack &&
    log.tightFileAsItWas &&
    log.loneHeadSaysIt &&
    log.loneTitleNotInTheEditor &&
    log.loneSaidOnce &&
    log.loneCaretStartsUnderIt &&
    log.loneFileUntouchedOnOpen &&
    log.loneTypingGoesUnderIt &&
    log.loneStillNamed
  return log
})()
