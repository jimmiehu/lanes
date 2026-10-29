// READ IS FOR READING, AND A DOUBLE-CLICK IN IT IS WHERE WRITING STARTS.
//
// This used to hold READ's live block editing: a double-click opened one line
// as a field in place, a single click left it alone, the block's marker was
// lifted out of the field, and esc threw the edit away. All of that machinery is
// gone — the block field, its hand-rolled undo, the per-block rooms — because
// one editor now does the writing, and a note opens straight into it.
//
// What survives is the half of those claims that was about the READER, and it
// is asked of the new arrangement instead:
//
// - A note opens in READ, and READ opens nothing — no field, no editor,
//   nothing contenteditable in the document. Writing is asked for.
// - A single click in READ is still reading: it leaves the mode alone, and a
//   click on a task's box still ticks it, from READ, without leaving it.
// - A DOUBLE-click is the request to write THERE. The pane flips to WRITE with
//   the caret on the SOURCE column under the pointer — past the `**` READ
//   swallowed, not at the rendered offset, which would land it four characters
//   early — and a character typed goes down exactly there in the file.
// - "The marker is lifted out" becomes: a double-click at the very start of a
//   task's words puts the caret at the start of the WORDS, never in front of
//   the `- [ ] ` it cannot see, and the editor draws that marker as a box rather
//   than as text.
// - Esc is the way out of WRITE, and with words written it asks first: a
//   second esc is no, and the word stays, on screen and on disk. The rest of
//   that question — discarding, and the ways it cannot happen by accident — is
//   `esc-discard.js`'s.
// - The room under the last block is where you add to a note: a double-click
//   there writes at the very end.
//
// The live markdown itself — marks hidden and revealed, the sizes, one undo
// down the whole document — is `live-md.js`'s to hold.
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
  const textNodes = (el) => {
    const out = []
    const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
    let n
    while ((n = walk.nextNode())) if (n.data.length && !n.parentElement?.closest('[contenteditable="false"]')) out.push(n)
    return out
  }
  const modeOn = (m) =>
    (pane(1)?.querySelector(`[data-mode="${m}"]`) ?? document.querySelector(`[data-mode="${m}"]`))?.dataset.on === '1'
  const toRead = async () => {
    if (!modeOn('READ')) key('e')
    for (let i = 0; i < 15 && !pane(1)?.querySelector('[data-md-from]'); i++) await sleep(100)
    await sleep(300)
  }

  // --- READ, where the pointer is a reader's ---
  /** A READ block by what it says: the `[data-md-from]` wrapper around it. */
  const readBlock = (s) =>
    [...(pane(1)?.querySelectorAll('[data-md-from]') ?? [])].find((d) => d.textContent.includes(s))
  /** The whole READ document: the column the blocks sit in. */
  const readRoot = () => pane(1)?.querySelector('[data-md-from]')?.parentElement ?? null
  /**
   * The point over the left edge of character `at` of `s`, inside `el` — where
   * a pointer resting just before that character would be. The event goes to
   * whatever is actually drawn there, so it bubbles through the same elements a
   * person's would.
   */
  const pointIn = (el, s, at = 0) => {
    const n = el && textNodes(el).find((t) => t.data.includes(s))
    if (!n) return null
    const i = n.data.indexOf(s) + at
    const r = document.createRange()
    r.setStart(n, i)
    r.setEnd(n, i + 1)
    const b = r.getBoundingClientRect()
    const x = b.left + 0.5
    const y = b.top + b.height / 2
    const hit = document.elementFromPoint(x, y)
    return { x, y, target: hit && el.contains(hit) ? hit : el }
  }
  /** One click, as the browser sends it. */
  const single = async (p) => {
    if (!p) return
    const at = { bubbles: true, cancelable: true, clientX: p.x, clientY: p.y, button: 0, detail: 1, view: window }
    p.target.dispatchEvent(new MouseEvent('mousedown', at))
    p.target.dispatchEvent(new MouseEvent('mouseup', at))
    p.target.dispatchEvent(new MouseEvent('click', at))
    await sleep(600)
  }
  /**
   * A double-click, as the browser sends it: both clicks first, then the
   * dblclick. The first click reaching READ as a plain click is part of what is
   * being asked — it must not do anything a double-click then has to undo.
   */
  const dbl = async (p) => {
    if (!p) return
    const at = { bubbles: true, cancelable: true, clientX: p.x, clientY: p.y, button: 0, view: window }
    for (const detail of [1, 2]) {
      p.target.dispatchEvent(new MouseEvent('mousedown', { ...at, detail }))
      p.target.dispatchEvent(new MouseEvent('mouseup', { ...at, detail }))
      p.target.dispatchEvent(new MouseEvent('click', { ...at, detail }))
    }
    p.target.dispatchEvent(new MouseEvent('dblclick', { ...at, detail: 2 }))
    // The mode flips, the editor mounts, and the caret is placed a frame later.
    await sleep(900)
  }
  const log = {}

  // TARGET sits AFTER a bold run on purpose. READ draws `some bold` without its
  // four asterisks, so a caret placed at the rendered offset would land four
  // characters early — "before §the TARGET" — while the source column puts it
  // where the pointer was.
  const BODY = [
    '# Editor check',
    '',
    'A plain paragraph, and then **some bold** before the TARGET word it points at.',
    '',
    '- [ ] an unchecked task',
    '- [ ] a task to tick while reading',
    '',
    '1. a numbered step ~active',
    '',
    'The last paragraph, where the note ends.',
    ''
  ].join('\n')
  const MARK = '§'

  // --- seed it, and open it the way a person would: by finding it ---
  const made = await window.lanes.noteCreate('Editor check', '_unfiled')
  const PATH = made.path || '_unfiled/editor-check.md'
  await window.lanes.noteWrite(PATH, BODY)
  const disk = async () => (await window.lanes.note(PATH))?.body ?? ''
  key('k')
  await sleep(600)
  const box = document.querySelector('[data-palette-input]')
  const setIn = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
  setIn.call(box, 'Editor check')
  box.dispatchEvent(new Event('input', { bubbles: true }))
  await sleep(1000)
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
  await sleep(1800)
  for (let i = 0; i < 15 && !readBlock('TARGET'); i++) await sleep(200)

  // --- IT OPENS IN READ. Writing is the thing you ask for. ---
  log.opensInRead = !content() && modeOn('READ') && Boolean(readBlock('TARGET'))
  if (!log.opensInRead) return { ...log, pass: false }

  await toRead()
  log.readOn = modeOn('READ')
  // READ opens nothing: no editor, and nothing in the document that takes
  // typing. (The old block field was a contenteditable in READ's column, so
  // this is also the line it would trip if it ever came back.)
  const root = readRoot()
  log.readHasNoEditor = !content()
  log.readIsReadOnly =
    Boolean(root) &&
    !root.isContentEditable &&
    !root.querySelector('[contenteditable]:not([contenteditable="false"])')

  // --- ONE CLICK IS READING ---
  await single(pointIn(readBlock('A plain paragraph'), 'plain', 1))
  log.singleClickStaysInRead = modeOn('READ') && !content()

  // A click on a box still ticks it, from READ, and READ stays READ.
  const tickBox = [...(pane(1)?.querySelectorAll('.task-box') ?? [])].find((b) =>
    b.parentElement?.textContent.includes('a task to tick while reading')
  )
  log.foundReadBox = Boolean(tickBox)
  if (tickBox) {
    const r = tickBox.getBoundingClientRect()
    await single({ x: r.left + r.width / 2, y: r.top + r.height / 2, target: tickBox })
  }
  await sleep(1800)
  let expected = BODY.replace('- [ ] a task to tick while reading', '- [x] a task to tick while reading')
  // That box and nothing else: the other task, the lookalike words, all as seeded.
  log.tickedFromRead = (await disk()).replace(/\s+$/, '') === expected.replace(/\s+$/, '')
  log.tickStaysInRead = modeOn('READ') && !content()

  // The status token is a word at the end of the row, not `~text`.
  const step = readBlock('a numbered step')?.textContent ?? ''
  log.statusRendered = /active/.test(step) && !/~active/.test(step)

  // --- A DOUBLE-CLICK WRITES THERE: on the source column under the pointer ---
  await dbl(pointIn(readBlock('TARGET'), 'TARGET', 0))
  log.doubleClickOpensWrite = modeOn('WRITE') && Boolean(content())
  log.caretInTheEditor = document.activeElement === content()
  type(MARK)
  await sleep(1800)
  expected = expected.replace('the TARGET word', `the ${MARK}TARGET word`)
  log.afterTarget = await disk()
  log.landedOnTheSourceColumn = log.afterTarget.includes(`before the ${MARK}TARGET word`)

  // --- AT THE START OF A TASK'S WORDS, THE CARET IS IN THE WORDS ---
  // The marker is furniture the editor draws as a box; a caret in front of it
  // would type into a `- [ ] ` nobody can see and break the task.
  await toRead()
  await dbl(pointIn(readBlock('an unchecked task'), 'an unchecked task', 0))
  log.taskDoubleClickOpensWrite = modeOn('WRITE') && document.activeElement === content()
  type(MARK)
  await sleep(200)
  const taskLine = lineWith('an unchecked task')
  log.markerDrawnNotWritten =
    Boolean(taskLine?.querySelector('.cm-md-task')) && !taskLine?.textContent.includes('[ ]')

  // --- ESC ASKS, AND ESC AGAIN KEEPS WHAT WAS TYPED ---
  // Esc is the way out of WRITE, and with a word written it asks before it
  // throws anything away. Esc in the question is no: the question goes, the
  // word stays, and so does WRITE.
  press('Escape')
  await sleep(300)
  log.escAsks = Boolean(document.querySelector('[data-leave-ask]'))
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))
  await sleep(400)
  log.escAgainKeeps = !document.querySelector('[data-leave-ask]')
  log.escStaysInWrite = modeOn('WRITE') && Boolean(content())
  log.escKeepsItOnScreen = Boolean(lineWith(`${MARK}an unchecked task`))
  await sleep(1800)
  expected = expected.replace('- [ ] an unchecked task', `- [ ] ${MARK}an unchecked task`)
  log.afterTask = await disk()
  log.caretInTheWordsNotTheMarker = log.afterTask.includes(`- [ ] ${MARK}an unchecked task`)
  // Asked apart from where it landed, so a failure says which went wrong: an
  // Esc that threw the character away, or a caret that put it in the marker.
  log.escKeepsItOnDisk = log.afterTask
    .split('\n')
    .some((l) => l.includes('an unchecked task') && l.includes(MARK))

  // --- THE ROOM UNDER THE LAST BLOCK WRITES AT THE END ---
  await toRead()
  const tail = readRoot()?.lastElementChild
  log.foundTail = Boolean(tail) && tail.style.minHeight === '40px'
  if (log.foundTail) {
    const r = tail.getBoundingClientRect()
    await dbl({ x: r.left + 20, y: r.top + r.height / 2, target: tail })
  }
  log.tailOpensWrite = modeOn('WRITE') && document.activeElement === content()
  type('tail words')
  await sleep(1800)
  expected = expected + 'tail words'
  const after = await disk()
  log.tailWritesAtTheEnd = after.replace(/\s+$/, '').endsWith('tail words')

  // --- and nothing else in the file moved on the way ---
  log.nothingElseChanged = after.replace(/\s+$/, '') === expected.replace(/\s+$/, '')
  log.noConflictBanner = !/changed on disk while you were editing/.test(document.body.innerText)

  log.pass =
    log.opensInRead &&
    log.readOn &&
    log.readHasNoEditor &&
    log.readIsReadOnly &&
    log.singleClickStaysInRead &&
    log.foundReadBox &&
    log.tickedFromRead &&
    log.tickStaysInRead &&
    log.statusRendered &&
    log.doubleClickOpensWrite &&
    log.caretInTheEditor &&
    log.landedOnTheSourceColumn &&
    log.taskDoubleClickOpensWrite &&
    log.markerDrawnNotWritten &&
    log.escAsks &&
    log.escAgainKeeps &&
    log.escStaysInWrite &&
    log.escKeepsItOnScreen &&
    log.caretInTheWordsNotTheMarker &&
    log.escKeepsItOnDisk &&
    log.foundTail &&
    log.tailOpensWrite &&
    log.tailWritesAtTheEnd &&
    log.nothingElseChanged &&
    log.noConflictBanner
  return log
})()
