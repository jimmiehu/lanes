// MARKER-SHAPED WORDS ARE WORDS, AND A HEADING IS A LINE YOU WRITE IN.
//
// A task can say "[x] means the box is ticked". Its box is the `[ ]` in front
// of those words, and nothing typed into the line, and no key that acts on
// tasks, may take the words for the box. This was asked of the block field,
// which lifted the marker out and could re-read the whole line as markdown when
// it went back in; it is asked of the editor now, which reads each line's
// marker once, in READ's grammar, and draws it as a box.
//
// So, on `- [ ] [x] means the box is ticked`:
// - the box is drawn OPEN, and the `[x]` stays on the page as text;
// - a character typed at the end of the line leaves the box open, on screen
//   and on disk, byte for byte;
// - ⌘↵ ticks and unticks the REAL box, never the lookalike. (⌘↵ is also the key
//   the block field committed with — the old version of this check pressed it
//   to save. In the editor it is the task key, which is exactly why the trap is
//   asked of it now.)
// - ↵ at the end continues the list with an OPEN box — a copy of the marker,
//   not of the words that look like one.
//
// A heading was editable by double-clicking it open. There is nothing to open
// now: a `##` line is a line of the document, typed into where it stands. Its
// hashes are hidden while the caret is elsewhere and come back when it is on
// the line — in the left margin, so the words do not move when they do. The
// note's h1 is not in the editor at all any more; it is the head's title field,
// which `live-md.js` and `jot.js` hold.
//
// And in CODE a marker is not a marker at all. A `- ` in a fenced block is a
// dash and a `# ` is a shell comment; the editor draws them as written, and the
// keys have to agree with the drawing. Each of these was red while the rules
// read a line's text and never asked whether the line was code:
// - a click at the start of `- first dash in code` puts the caret there — it
//   was moved past the dash, so what was typed landed after it;
// - ⌫ before `second` in `  - second dash in code` takes one space — it took
//   `  - ` away as if it were an item;
// - ← before `third` goes one character left — it went to the line above;
// - ↵ after the `# ` of a comment splits the line — it opened a line above;
// - ↵ at the end of a lone `>`, a prompt waiting in a transcript, keeps it and
//   starts the line under it — it cleared the `>` as if leaving a quote;
// - ⇥ at the end of a `- ` line types two spaces — it indented the line;
// - ⌘↵ on a line of code leaves it alone — it wrote `- [ ] ` into the code;
// - `[[` typed in code is two brackets — it closed itself into a link and
//   offered the vault's notes to put in it;
// - and HTML is not code. READ reads a `<div>` as text and the `- ` line under
//   it as an item, so the editor does too: a click at the start of that line
//   lands on its words, as on any item — the keys follow what is drawn, and
//   what is drawn is READ's.
//
// And a caret the app puts down is held to the same rule as one you put down.
// No transaction put a new editor's caret where it starts, so nothing moved it
// out of a marker: a note whose first line is an item, opened, read, and come
// back to with ⌘E — which only hands the editor the focus back — took what was
// typed in front of its box, `eggs - [ ] milk`, a task no more. Nor would it go
// past a heading's hashes, `Intro ## Section`; ↓ out of the title field, which
// puts the caret at the top of the body, is asked that of a note that opens on
// a heading. And ⌘Z puts back the caret it recorded, past every filter — after
// the disk made the line an item, that caret was inside the new marker, and
// the next key went in front of it. Each was red.
//
// Seeds its own notes through the app's IPC. Run against a throwaway LANES_VAULT
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
  // The words of a line, never the hashes hung beside them: those are text as
  // well, and a click or a measure meant for the words must not land on them.
  const textNodes = (el) => {
    const out = []
    const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
    let n
    while ((n = walk.nextNode()))
      if (
        n.data.length &&
        !n.parentElement?.closest('[contenteditable="false"]') &&
        !n.parentElement?.closest('.cm-md-hmark')
      )
        out.push(n)
    return out
  }
  /** The caret INSIDE a piece of rendered text, `at` characters into it. */
  const caretIn = async (s, at = 1) => {
    const line = lineWith(s)
    const n = line && textNodes(line).find((t) => t.data.includes(s))
    if (!n) return false
    await clickAt(n, n.data.indexOf(s) + at)
    return true
  }
  /** The caret at the very end of the line that shows `s`. */
  const caretAtEnd = async (s) => {
    const line = lineWith(s)
    const nodes = line ? textNodes(line) : []
    const last = nodes[nodes.length - 1]
    if (!last) return false
    await clickAt(last, last.data.length - 1, true)
    return true
  }
  /** Where the first character of `s` is drawn, from the left of the window. */
  const leftOf = (s) => {
    const line = lineWith(s)
    const n = line && textNodes(line).find((t) => t.data.includes(s))
    if (!n) return null
    const r = document.createRange()
    const i = n.data.indexOf(s)
    r.setStart(n, i)
    r.setEnd(n, i + 1)
    return r.getBoundingClientRect().left
  }
  /** The drawn box on the line that shows `s`: '1' ticked, '0' open, '' none. */
  const boxOn = (s) => lineWith(s)?.querySelector('.cm-md-task')?.dataset.done ?? ''
  const log = {}

  const TRAP = '[x] means the box is ticked'
  const HEAD = 'A heading you can write in'
  const CODE = [
    '```',
    '- first dash in code',
    '  - second dash in code',
    '- third dash in code',
    '# a shell comment',
    '>',
    '- tab dash in code',
    'links in code',
    'plain words in code',
    '```',
    '',
    '<div>',
    '- dash in html',
    '</div>'
  ]
  const BODY = [
    '# Traps check',
    '',
    `- [ ] ${TRAP}`,
    '',
    `## ${HEAD}`,
    '',
    'Some prose under the heading, where the caret waits first.',
    '',
    ...CODE,
    ''
  ].join('\n')

  // --- seed it, and open it the way a person would: by finding it ---
  const made = await window.lanes.noteCreate('Traps check', '_unfiled')
  const PATH = made.path || '_unfiled/traps-check.md'
  await window.lanes.noteWrite(PATH, BODY)
  const disk = async () => (await window.lanes.note(PATH))?.body ?? ''
  key('k')
  await sleep(600)
  const box = document.querySelector('[data-palette-input]')
  const setIn = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
  setIn.call(box, 'Traps check')
  box.dispatchEvent(new Event('input', { bubbles: true }))
  await sleep(1000)
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
  await sleep(1800)
  // A note opens in READ; writing is asked for, with ⌘E.
  if (!content()) key('e')
  for (let i = 0; i < 15 && !lineWith(TRAP); i++) await sleep(200)

  log.opened = Boolean(content()) && Boolean(lineWith(TRAP))
  if (!log.opened) return { ...log, pass: false }
  log.before = await disk()

  // --- THE BOX IS THE `[ ]`, AND THE `[x]` IS WORDS ---
  log.drawnOpen = boxOn(TRAP) === '0' && !lineWith(TRAP)?.classList.contains('cm-md-done')
  log.lookalikeStaysText = Boolean(lineWith(TRAP)?.textContent.includes(TRAP))

  // --- typed at the END of the line, it stays exactly what it was, plus one ---
  await caretAtEnd(TRAP)
  log.caretPlaced = document.activeElement === content()
  type('.')
  await sleep(1800)
  log.afterTyping = await disk()
  log.trapLineIntact = log.afterTyping.includes(`- [ ] ${TRAP}.\n`)
  log.nothingElseChanged =
    log.afterTyping.replace(/\s+$/, '') === BODY.replace(`${TRAP}\n`, `${TRAP}.\n`).replace(/\s+$/, '')
  log.stillDrawnOpen = boxOn(TRAP) === '0' && !lineWith(TRAP)?.classList.contains('cm-md-done')

  // --- ⌘↵ TICKS THE BOX, NOT THE WORDS — and back again ---
  press('Enter', { metaKey: true })
  await sleep(1800)
  log.afterTick = await disk()
  log.tickHitTheBox = log.afterTick.includes(`- [x] ${TRAP}.\n`)
  log.tickDrawn = boxOn(TRAP) === '1'
  press('Enter', { metaKey: true })
  await sleep(1800)
  log.afterUntick = await disk()
  log.untickHitTheBox = log.afterUntick.includes(`- [ ] ${TRAP}.\n`)
  log.untickDrawn = boxOn(TRAP) === '0'

  // --- ↵ CONTINUES WITH AN OPEN BOX: the marker is copied, the words are not ---
  // The caret is still at the end of the line: a tick changes the box, not
  // where you are.
  press('Enter')
  await sleep(150)
  type('next one')
  await sleep(1800)
  log.afterEnter = await disk()
  log.continuesOpen = log.afterEnter.includes(`- [ ] ${TRAP}.\n- [ ] next one\n`)
  log.nextDrawnOpen = boxOn('next one') === '0'

  // --- A HEADING IS WRITTEN IN WHERE IT STANDS ---
  await caretIn('Some prose under', 2)
  const hmark = () => lineWith(HEAD)?.querySelector('.cm-md-hmark')
  log.headingIsAHeading = Boolean(lineWith(HEAD)?.classList.contains('cm-md-h2'))
  // Away from it, the hashes are put away...
  log.hashesHiddenAway =
    Boolean(hmark()) && hmark().classList.contains('cm-md-off') && !lineWith(HEAD).innerText.includes('##')
  const wordsAway = leftOf(HEAD)
  await caretAtEnd(HEAD)
  // ...and on it, they are back — in the margin, beside the words rather than
  // in front of them, so the words stay exactly where they were drawn.
  log.hashesRevealed =
    Boolean(hmark()) &&
    !hmark().classList.contains('cm-md-off') &&
    getComputedStyle(hmark()).visibility === 'visible' &&
    Boolean(lineWith(HEAD)?.innerText.includes('##'))
  const wordsHere = leftOf(HEAD)
  log.wordsMovedPx = wordsAway === null || wordsHere === null ? null : Math.round((wordsHere - wordsAway) * 10) / 10
  log.wordsStayPut = log.wordsMovedPx !== null && Math.abs(log.wordsMovedPx) < 0.5
  // In the margin means left of where the column's words begin — the prose
  // line below is the measure. Hashes drawn inline would start at that edge and
  // end past it, so this is not the same claim as the words staying put.
  const column = leftOf('Some prose under')
  log.hashesInTheMargin =
    Boolean(hmark()) && column !== null && hmark().getBoundingClientRect().right <= column + 0.5
  type(' too')
  await sleep(1800)
  log.after = await disk()
  log.headingEdited = log.after.includes(`\n## ${HEAD} too\n`)
  log.stillAHeading = Boolean(lineWith(`${HEAD} too`)?.classList.contains('cm-md-h2'))

  // --- IN CODE, A MARKER IS THE CHARACTERS IT IS ---
  // Drawn as written: no bullet, the dash on the page. This was always so; it
  // is what the keys below have to agree with.
  const inCode = (s) =>
    Boolean(lineWith(s)?.classList.contains('cm-md-code')) && !lineWith(s)?.querySelector('.cm-md-bullet')
  log.codeDrawnAsWritten =
    inCode('first dash in code') &&
    inCode('second dash in code') &&
    inCode('a shell comment') &&
    /^\s*-\s/.test(lineWith('first dash in code')?.innerText ?? '')
  // Each edit is one keystroke on a line of its own, and all of them are read
  // off the disk together.
  await caretIn('- first dash in code', 0)
  type('§')
  await sleep(150)
  await caretIn('second dash in code', 0)
  press('Backspace')
  await sleep(150)
  await caretIn('third dash in code', 0)
  press('ArrowLeft')
  await sleep(150)
  type('¶')
  await sleep(150)
  await caretIn('a shell comment', 0)
  press('Enter')
  await sleep(150)
  // The prompt is the line that is `>` and nothing else — `<div>` and
  // `</div>` have one too.
  const prompt = lines().find((l) => l.textContent === '>')
  const promptText = prompt ? textNodes(prompt)[0] : null
  if (promptText) {
    await clickAt(promptText, 0, true)
    press('Enter')
    await sleep(150)
  }
  await caretAtEnd('tab dash in code')
  press('Tab')
  await sleep(150)
  await caretIn('plain words in code', 3)
  press('Enter', { metaKey: true })
  await sleep(150)
  // `[[` in code: two brackets, no pair closing itself, no list of notes.
  await caretAtEnd('links in code')
  for (const ch of [' ', '[', '[', 't', 'r']) {
    type(ch)
    await sleep(60)
  }
  await sleep(700)
  log.noNoteListInCode = !document.querySelector('.cm-tooltip.lanes-complete')
  if (!log.noNoteListInCode) {
    press('Escape')
    await sleep(100)
  }
  // HTML is READ's text, so the `- ` under the `<div>` is READ's item: drawn as
  // one here, its dash a bullet — and a click ON that bullet lands on the words,
  // as on any item's.
  const htmlLine = lineWith('dash in html')
  log.htmlDrawnAsItem = Boolean(htmlLine?.querySelector('.cm-md-bullet')) && !htmlLine?.classList.contains('cm-md-html')
  const bullet = htmlLine?.querySelector('.cm-md-bullet')
  if (bullet) {
    const r = bullet.getBoundingClientRect()
    const at = { bubbles: true, cancelable: true, clientX: r.left + 1, clientY: r.top + r.height / 2, button: 0, detail: 1, view: window }
    ;(document.elementFromPoint(at.clientX, at.clientY) ?? bullet).dispatchEvent(new MouseEvent('mousedown', at))
    document.dispatchEvent(new MouseEvent('mouseup', at))
    await sleep(250)
  }
  type('¤')
  await sleep(1800)
  log.afterCode = await disk()
  log.caretReachesTheDash = log.afterCode.includes('\n§- first dash in code\n')
  log.backspaceTakesOneSpace = log.afterCode.includes('\n  -second dash in code\n')
  log.leftIsOneCharacter = log.afterCode.includes('\n-¶ third dash in code\n')
  log.enterSplitsTheComment = log.afterCode.includes('\n# \na shell comment\n')
  log.enterKeepsThePrompt = /\n>\n\n\s*- tab dash in code/.test(log.afterCode)
  log.tabTypesTwoSpaces = log.afterCode.includes('\n- tab dash in code  \n')
  log.cmdEnterLeavesCode = log.afterCode.includes('\nplain words in code\n```')
  log.bracketsStayBracketsInCode = log.afterCode.includes('\nlinks in code [[tr\n')
  log.htmlIsReadsItem = log.afterCode.includes('\n- ¤dash in html\n')

  // --- A CARET THE APP PUTS DOWN STANDS AT THE WORDS ---
  const view = () => content()?.cmTile?.view ?? content()?.cmView?.view ?? null
  /** READ's blocks saying `s` — a note opens in READ, and is written in after ⌘E. */
  const readHas = (s) => [...(pane(1)?.querySelectorAll('[data-md-from]') ?? [])].some((d) => d.textContent.includes(s))
  /** Open a note by finding it, and wait for the line that shows `anchor`. */
  const open = async (title, anchor) => {
    key('k')
    await sleep(600)
    const b = document.querySelector('[data-palette-input]')
    setIn.call(b, title)
    b.dispatchEvent(new Event('input', { bubbles: true }))
    // ↵ only once the row it lands on IS this note: pressed early, it takes
    // the offer to make a new one by that name.
    let found = false
    for (let i = 0; i < 60 && !found; i++) {
      const t = (document.querySelector('.pal-row[data-pal-on="1"]')?.textContent ?? '').trim()
      found = t.includes(title) && !t.startsWith('+')
      if (!found) await sleep(100)
    }
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    await sleep(1500)
    // It opens in READ — which makes ⌘E into WRITE the "read, and come back"
    // this asks about, the first time over.
    for (let i = 0; i < 20 && !lineWith(anchor) && !readHas(anchor); i++) await sleep(150)
    if (!lineWith(anchor)) key('e')
    for (let i = 0; i < 20 && !lineWith(anchor); i++) await sleep(200)
    return found && Boolean(lineWith(anchor))
  }
  const ITEM_FIRST = 'Opens on an item'
  const itemFirst = await window.lanes.noteCreate(ITEM_FIRST, '_unfiled')
  const ITEM_PATH = itemFirst.path || '_unfiled/opens-on-an-item.md'
  await window.lanes.noteWrite(ITEM_PATH, `# ${ITEM_FIRST}\n\n- [ ] milk\n\nbread\n`)
  log.itemNoteOpened = await open(ITEM_FIRST, 'milk')
  // Read, and back: ⌘E twice. The second hands the editor the focus and no more.
  key('e')
  await sleep(900)
  key('e')
  for (let i = 0; i < 20 && document.activeElement !== content(); i++) await sleep(100)
  log.focusBackOnWrite = document.activeElement === content()
  type('eggs ')
  await sleep(1800)
  const itemDisk = async () => (await window.lanes.note(ITEM_PATH))?.body ?? ''
  log.itemOpened = await itemDisk()
  log.typedAtTheItemsWords = log.itemOpened.includes('\n- [ ] eggs milk\n')

  // ⌘Z after the disk made a line an item: typed at the start of a plain line,
  // saved, then the file gains `- ` in front of it from outside; ⌘Z takes the
  // typing back and puts the caret back where it was — now inside the marker.
  await caretIn('bread', 0)
  type('x')
  await sleep(2500)
  log.typedBeforeTheOutsideEdit = (await itemDisk()).includes('\nxbread\n')
  await window.lanes.noteWrite(ITEM_PATH, (await itemDisk()).replace('\nxbread\n', '\n- xbread\n'))
  // The poll is every 4s: two of them, and a redraw.
  for (let i = 0; i < 50 && !lineWith('xbread')?.querySelector('.cm-md-bullet'); i++) await sleep(200)
  log.outsideItemArrived = Boolean(lineWith('xbread')?.querySelector('.cm-md-bullet'))
  press('z', { metaKey: true })
  await sleep(200)
  {
    const v = view()
    const r = v?.state.selection.main
    const l = v && r ? v.state.doc.lineAt(r.head) : null
    log.undoCaret = l ? `${l.text.slice(0, r.head - l.from)}¦${l.text.slice(r.head - l.from)}` : ''
  }
  type('y')
  await sleep(1800)
  log.afterUndo = await itemDisk()
  log.undoLeavesTheCaretAtTheWords = log.afterUndo.includes('\n- ybread\n')

  // A note that opens on a heading, and ↓ out of its title into the body.
  const HEAD_FIRST = 'Opens on a heading'
  const headFirst = await window.lanes.noteCreate(HEAD_FIRST, '_unfiled')
  const HEAD_PATH = headFirst.path || '_unfiled/opens-on-a-heading.md'
  await window.lanes.noteWrite(HEAD_PATH, `# ${HEAD_FIRST}\n\n## Section\n\nwords under it\n`)
  log.headNoteOpened = await open(HEAD_FIRST, 'words under it')
  const field = pane(1)?.querySelector('[data-note-title]')
  field?.focus()
  await sleep(150)
  field?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }))
  for (let i = 0; i < 20 && document.activeElement !== content(); i++) await sleep(100)
  log.downIntoTheBody = document.activeElement === content()
  type('Intro ')
  await sleep(1800)
  log.headOpened = (await window.lanes.note(HEAD_PATH))?.body ?? ''
  log.typedAtTheHeadingsWords = log.headOpened.includes('\n## Intro Section\n')

  log.pass =
    log.opened &&
    log.drawnOpen &&
    log.lookalikeStaysText &&
    log.caretPlaced &&
    log.trapLineIntact &&
    log.nothingElseChanged &&
    log.stillDrawnOpen &&
    log.tickHitTheBox &&
    log.tickDrawn &&
    log.untickHitTheBox &&
    log.untickDrawn &&
    log.continuesOpen &&
    log.nextDrawnOpen &&
    log.headingIsAHeading &&
    log.hashesHiddenAway &&
    log.hashesRevealed &&
    log.wordsStayPut &&
    log.hashesInTheMargin &&
    log.headingEdited &&
    log.stillAHeading &&
    log.codeDrawnAsWritten &&
    log.caretReachesTheDash &&
    log.backspaceTakesOneSpace &&
    log.leftIsOneCharacter &&
    log.enterSplitsTheComment &&
    log.enterKeepsThePrompt &&
    log.tabTypesTwoSpaces &&
    log.cmdEnterLeavesCode &&
    log.noNoteListInCode &&
    log.bracketsStayBracketsInCode &&
    log.htmlDrawnAsItem &&
    log.htmlIsReadsItem &&
    log.itemNoteOpened &&
    log.focusBackOnWrite &&
    log.typedAtTheItemsWords &&
    log.typedBeforeTheOutsideEdit &&
    log.outsideItemArrived &&
    log.undoLeavesTheCaretAtTheWords &&
    log.headNoteOpened &&
    log.downIntoTheBody &&
    log.typedAtTheHeadingsWords
  return log
})()
