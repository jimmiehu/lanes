// ONE UNDO, THE WHOLE WAY DOWN — and the app's own only where no field is.
//
// A note is one CodeMirror document now, so ⌘Z is one history over all of it:
// not the line a block field held, not the block last committed. This holds
// what that has to mean for somebody writing.
//
// - It walks every kind of edit, across lines. A word typed in one paragraph, a
//   box ticked in the list under it, an item's words cleared and one ⌫ too many
//   after that: ⌘Z takes them back one at a time, newest first, to the note
//   exactly as it was opened.
// - And no further. Opening the note is not a step, so ⌘Z can never empty it.
// - Words cleared out of an item, a [[wikilink]] among them, come back as the
//   FILE had them — brackets included, though the brackets were never on
//   screen. An undo that put back what was drawn rather than what was there
//   would return the link as plain words. ⇧⌘Z takes them again.
// - One ⌫ too many on an emptied item is not the item gone. The block field's
//   claim was that the item survived at all; the editor's ⌫ at the head of an
//   item deliberately takes the marker, so what is held now is that it takes
//   the marker and nothing else — the line stays, the items either side are
//   untouched — and that ⌘Z puts it back.
// - The same ⌫ at the head of an item that still has its words — one press too
//   many while clearing up to them — takes the marker and keeps every word,
//   and ⌘Z puts the marker back.
// - What arrived from outside is not yours to undo. Claude writes a paragraph
//   into the file beside a word you typed; ⌘Z takes your word and leaves theirs.
//
// Then the app's own history: the changes a note has SAVED, one step each,
// walked from the window with no field focused — and the editor following, so
// the page shows what the file now says. While the caret is in the editor the
// app keeps out.
//
// - A trip through READ does not cost the editor its history. The note's
//   editor state is kept while READ is up and put back when WRITE returns, so
//   ⌘Z after ⌘E ⌘E still takes back the last words typed, one step at a time.
// - The app keeping out can be seen when the editor has nothing left to undo:
//   a ⌘Z there that changed the note would be the app's history reaching in
//   under the caret. What makes that moment mean something is the next one:
//   ⌘Z from the window, a breath later, does act on this very note — the
//   app's history holds what the editor's undo did, as it holds any other
//   change, and steps back over it, with the editor following.
//
// The app's steps reach the editor as a change from outside, and an outside
// change that removes exactly what an editor step typed takes that step out of
// the editor's history. So the editor half runs first here; the two histories
// are README's Known limits.
//
// Gone with the block field: its hand-rolled history (⌘Z/⇧⌘Z inside an open
// block, ⌘↵ to commit it, esc to throw it away) and the `link-test.md` this
// opened from the rail. CodeMirror's history replaced the first; the notes are
// seeded here.
//
// Seeds its own two notes through the app's IPC. Run against a throwaway
// LANES_VAULT and a fresh LANES_STATE. See checks/README.md.
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
  /*
   * ⌘Z AND ⇧⌘Z CARRY THE KEY CODE A REAL PRESS HAS. With ⌘ and ⇧ both held,
   * macOS does not put the shifted letter in `key`, so the editor reads that
   * chord by its code — and a synthetic ⇧⌘Z without one reads as plain ⌘Z and
   * undoes where it should redo. `keyCodeTaken` in the log says whether this
   * Chromium let the code through at all.
   */
  const UNDO = { metaKey: true, keyCode: 90 }
  const REDO = { metaKey: true, shiftKey: true, keyCode: 90 }
  /** ⌘Z at the window — where it lands when nothing has focus. */
  const appKey = (mods) =>
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', bubbles: true, cancelable: true, ...mods }))
  /**
   * THE CARET GOES WHERE A CLICK PUTS IT — through the editor's own pointer
   * handling, the way a person's does. Setting the page's selection directly
   * is not the same act: the editor only adopts a DOM selection while its
   * window is the front one, and a driven run cannot promise that.
   */
  const pointAt = async (x, y, fallback) => {
    const at = { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0, detail: 1, view: window }
    ;(document.elementFromPoint(x, y) ?? fallback).dispatchEvent(new MouseEvent('mousedown', at))
    document.dispatchEvent(new MouseEvent('mouseup', at))
    await sleep(250)
  }
  const clickAt = async (node, offset, after = false) => {
    const r = document.createRange()
    const a = Math.max(0, Math.min(offset, node.data.length - 1))
    r.setStart(node, a)
    r.setEnd(node, Math.min(node.data.length, a + 1))
    const box = r.getBoundingClientRect()
    await pointAt(after ? box.right + 1 : box.left + 0.5, box.top + box.height / 2, node.parentElement)
  }
  const textNodes = (el) => {
    const out = []
    const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
    let n
    while ((n = walk.nextNode())) if (n.data.length && !n.parentElement?.closest('[contenteditable="false"]')) out.push(n)
    return out
  }
  /** The caret INSIDE a piece of rendered text, `at` characters into it. */
  const caretIn = async (s, at = 1) => {
    const line = lineWith(s)
    const n = line && textNodes(line).find((t) => t.data.includes(s))
    if (!n) return false
    await clickAt(n, n.data.indexOf(s) + at)
    return document.activeElement === content()
  }
  /** The caret at the very end of the line that shows `s`. */
  const caretAtEnd = async (s) => {
    const line = lineWith(s)
    const nodes = line ? textNodes(line) : []
    const last = nodes[nodes.length - 1]
    if (!last) return false
    await clickAt(last, last.data.length - 1, true)
    return document.activeElement === content()
  }
  /**
   * The end of a line with no words on it to click — an emptied item is only
   * its box. The room to the right of the box is still the line, and a click
   * there is the end of it.
   */
  const clickLineEnd = async (line) => {
    const box = line.getBoundingClientRect()
    await pointAt(box.right - 6, box.top + box.height / 2, line)
  }
  /** A task's box, pressed the way a pointer presses it. */
  const tick = async (s) => {
    const b = [...(pane(1)?.querySelectorAll('.cm-md-task') ?? [])].find((x) =>
      x.closest('.cm-line')?.textContent.includes(s)
    )
    if (!b) return false
    const r = b.getBoundingClientRect()
    const at = { bubbles: true, cancelable: true, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2, button: 0, detail: 1, view: window }
    b.dispatchEvent(new MouseEvent('mousedown', at))
    b.dispatchEvent(new MouseEvent('mouseup', at))
    b.dispatchEvent(new MouseEvent('click', at))
    return true
  }
  const boxes = () => pane(1)?.querySelectorAll('.cm-md-task').length ?? 0
  const banner = () => /changed on disk while you were editing/.test(document.body.innerText)

  const bodyOf = async (path) => (await window.lanes.note(path))?.body ?? ''
  /*
   * The disk lags the editor by three debounces — 150ms, 250ms, 500ms. Every
   * read waits that out and then for two reads that agree, or the check is
   * testing its own timing rather than the app's.
   */
  const settled = async (path) => {
    await sleep(1800)
    let last = null
    for (let i = 0; i < 20; i++) {
      const now = await bodyOf(path)
      if (now === last) return now
      last = now
      await sleep(250)
    }
    return last ?? ''
  }
  const seed = async (title, body) => {
    const made = await window.lanes.noteCreate(title, '_unfiled')
    if (!made.ok || !made.path) return null
    await window.lanes.noteWrite(made.path, body)
    return made.path
  }
  /** Open a note the way a person would — by finding it — and write in it. True once it is up, in WRITE. */
  const open = async (title) => {
    key('k')
    await sleep(600)
    const box = document.querySelector('[data-palette-input]')
    if (!box) return false
    const setIn = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
    setIn.call(box, title)
    box.dispatchEvent(new Event('input', { bubbles: true }))
    await sleep(1000)
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    await sleep(1800)
    // It opens in READ; writing is asked for, with ⌘E.
    if (!content()) key('e')
    const shown = () => pane(1)?.querySelector('[data-note-title]')?.textContent.trim() === title
    for (let i = 0; i < 15 && !(shown() && content()); i++) await sleep(200)
    return Boolean(content()) && shown()
  }

  // Stamped, so a vault an earlier run wrote to has nothing in the way.
  const stamp = Date.now().toString(36)
  const log = { stamp, keyCodeTaken: new KeyboardEvent('keydown', { keyCode: 90 }).keyCode === 90 }

  /* ============ THE EDITOR'S HISTORY ============ */

  const A_TITLE = `Undo check ${stamp}`
  const BETA = '- [ ] beta with a [[roundtrip]] link in it'
  const A = [
    `# ${A_TITLE}`,
    '',
    'A paragraph above the list, where a word gets typed.',
    '',
    '- [ ] alpha, the item above',
    BETA,
    '- [ ] gamma, the item below',
    '',
    'A paragraph under the list, for a word typed later.',
    ''
  ].join('\n')
  const BETA_AT = A.split('\n').indexOf(BETA)
  // The note after each edit, in order: typed, ticked, beta's words cleared.
  const S1 = A.replace('where a word gets typed.', 'where a word gets typed. early')
  const S2 = S1.replace('- [ ] gamma', '- [x] gamma')
  const S3 = S2.replace(BETA, '- [ ] ')

  const pathA = await seed(A_TITLE, A)
  log.pathA = pathA
  if (!pathA) return { ...log, pass: false }
  log.openedA = await open(A_TITLE)
  if (!log.openedA) return { ...log, pass: false }

  // --- a word typed, and a box ticked in the list under it ---
  // Each edit stands more than the history's half-second grouping apart from
  // the next, so each is a step of its own and the walk back can be counted.
  log.caretInParagraph = await caretAtEnd('where a word gets typed.')
  type(' early')
  await sleep(700)
  log.foundGammaBox = await tick('gamma, the item below')
  await sleep(700)
  log.typedAndTicked = (await settled(pathA)) === S2

  // --- beta's words cleared, the link among them; the item stays ---
  log.caretInBeta = await caretIn('beta with', 0)
  press('End', { shiftKey: true })
  await sleep(150)
  log.selected = window.getSelection()?.toString() ?? ''
  press('Backspace')
  await sleep(700)
  log.clearedToTheMarker = (await settled(pathA)) === S3

  // --- ⌘Z brings them back as the file had them, and ⇧⌘Z takes them again ---
  press('z', UNDO)
  log.undoBringsTheWordsBack = (await settled(pathA)) === S2
  press('z', REDO)
  log.redoTakesThemAgain = (await settled(pathA)) === S3
  await sleep(700)

  // --- one ⌫ too many: the marker goes, and nothing else does ---
  log.boxesBefore = boxes()
  const emptied = lines().find((l) => l.querySelector('.cm-md-task') && !/alpha|gamma/.test(l.textContent))
  log.foundEmptiedItem = Boolean(emptied)
  if (emptied) await clickLineEnd(emptied)
  press('Backspace')
  await sleep(400)
  log.boxesAfterDemote = boxes()
  const was = S3.split('\n')
  const now = (await settled(pathA)).split('\n')
  log.demotedLine = now[BETA_AT] ?? null
  log.lineStays = now.length === was.length
  // All of the marker, box included: a line left holding `[ ] ` has no dash
  // and draws no box, yet half the marker is still in the file. Space may be
  // left — the editor's ⌫ keeps a later item's column as blanks — but nothing
  // else may.
  log.markerGone = log.lineStays && now[BETA_AT].trim() === ''
  log.nothingElseMoved = log.lineStays && was.every((l, i) => i === BETA_AT || l === now[i])
  log.boxGoneOnScreen = log.boxesAfterDemote === log.boxesBefore - 1

  // --- and back, one step at a time, across lines, to the note as opened ---
  press('z', UNDO)
  log.undoPutsTheMarkerBack = (await settled(pathA)) === S3
  log.boxBackOnScreen = boxes() === log.boxesBefore
  press('z', UNDO)
  log.thenTheWords = (await settled(pathA)) === S2
  press('z', UNDO)
  log.thenTheTick = (await settled(pathA)) === S1
  press('z', UNDO)
  log.thenTheTyping = (await settled(pathA)) === A
  // Opening the note was not an edit. More ⌘Z than there were edits must
  // leave it as it was opened, not walk it back to nothing.
  for (let i = 0; i < 4; i++) {
    press('z', UNDO)
    await sleep(80)
  }
  log.theOpenedNoteIsTheFloor = (await settled(pathA)) === A

  // --- ⌫ at the head of an item's words: the marker goes, the words stay ---
  // One press too many while clearing up to the words is how anybody meets
  // this, and the words are still there, so it must not take any of them.
  const ALPHA = 'alpha, the item above'
  const ALPHA_AT = BETA_AT - 1
  const opened = A.split('\n')
  log.caretAtAlpha = await caretIn(ALPHA, 0)
  press('Backspace')
  const demoted = (await settled(pathA)).split('\n')
  log.alphaLine = demoted[ALPHA_AT] ?? null
  const sameShape = demoted.length === opened.length
  // Trimmed, for the same reason as above: only space may stand where the
  // marker was.
  log.alphaKeepsItsWords = sameShape && demoted[ALPHA_AT].trim() === ALPHA
  log.alphaNothingElseMoved = sameShape && opened.every((l, i) => i === ALPHA_AT || l === demoted[i])
  press('z', UNDO)
  log.undoPutsAlphasMarkerBack = (await settled(pathA)) === A

  // --- what arrived from outside is not yours to undo ---
  const WORD = 'inkblot'
  await caretAtEnd('for a word typed later.')
  type(` ${WORD}`)
  const typed = await settled(pathA)
  log.wordTyped = typed === A.replace('for a word typed later.', `for a word typed later. ${WORD}`)
  const THEIRS = 'A paragraph written into the file from outside, the way Claude writes one.'
  const OUTSIDE = `${typed.replace(/\s+$/, '')}\n\n${THEIRS}\n`
  // Straight through the IPC, so the app's save path never sees this write and
  // cannot know it was its own. That is what an edit from the thread looks like.
  await window.lanes.noteWrite(pathA, OUTSIDE)
  const t0 = performance.now()
  const arrived = () => (content()?.textContent ?? '').includes(THEIRS.slice(0, 40))
  // The disk is polled every 4s, so 10s covers two polls and a slow redraw.
  while (!arrived() && performance.now() - t0 < 10000) await sleep(200)
  log.theirsArrived = arrived()
  await sleep(400)
  // Where the caret is after a reload is note-sync.js's claim, not this one's —
  // noted, and the caret put back if it went, so the undo is still asked.
  log.stillInTheEditor = document.activeElement === content()
  if (!log.stillInTheEditor) await caretAtEnd(WORD)
  press('z', UNDO)
  const afterOutside = await settled(pathA)
  log.undoTakesYourWord = !afterOutside.includes(WORD)
  log.undoLeavesTheirs = afterOutside.includes(THEIRS)
  log.undoTookExactlyYourWord = afterOutside === OUTSIDE.replace(` ${WORD}`, '')

  /* ============ THE APP'S HISTORY, WITH NO FIELD FOCUSED ============ */

  // A note of its own. The app's history is per note and records every change
  // the editor hands it — an editor ⌘Z included — so on the note above its
  // steps would be the check's own undos rather than anything to walk.
  const B_TITLE = `Undo committed ${stamp}`
  const B = [
    `# ${B_TITLE}`,
    '',
    'The first paragraph, which gets a word.',
    '',
    'The second paragraph, which gets another.',
    ''
  ].join('\n')
  const B1 = B.replace('which gets a word.', 'which gets a word. one')
  const B2 = B1.replace('which gets another.', 'which gets another. two')
  const shows = (s, re) => re.test(lineWith(s)?.textContent ?? '')

  const pathB = await seed(B_TITLE, B)
  log.pathB = pathB
  log.openedB = Boolean(pathB) && (await open(B_TITLE))
  if (!log.openedB) return { ...log, pass: false }

  // --- two words, far enough apart to be saved as two changes ---
  await caretAtEnd('which gets a word.')
  type(' one')
  await sleep(1500)
  await caretAtEnd('which gets another.')
  type(' two')
  await sleep(1500)
  press('Escape')
  await sleep(300)
  log.escapeLeftTheEditor = document.activeElement !== content()
  log.bothSaved = (await settled(pathB)) === B2

  // --- READ and back: a new editor on screen, the same history under it ---
  const first = content()
  key('e')
  await sleep(800)
  log.readHoldsNoEditor = !content()
  key('e')
  await sleep(1000)
  log.editorRemounted = Boolean(content()) && content() !== first
  log.caretInTheEditor = await caretIn('first paragraph', 3)
  press('z', UNDO)
  log.historySurvivesRead = (await settled(pathB)) === B1
  log.editorTookTwo = !shows('which gets another', /another\. two/) && shows('which gets another', /another\.$/)
  press('z', UNDO)
  log.thenOne = (await settled(pathB)) === B
  log.editorShowsTheStart =
    shows('which gets a word', /a word\.$/) && shows('which gets another', /another\.$/)

  // --- its history spent, ⌘Z under the caret is still the editor's ---
  // The app has steps it could take here — it recorded each of those undos as
  // it recorded the typing, as the next part shows — and one taken would put
  // a word back into the note while the caret sat in it.
  press('z', UNDO)
  log.appKeepsOut = (await settled(pathB)) === B && shows('which gets a word', /a word\.$/)

  // --- from the window, ⌘Z steps the saved changes, and the editor follows ---
  // What the editor's undo did is a saved change like any other, so the app's
  // first step back is over it: the word it took comes back.
  press('Escape')
  await sleep(300)
  log.escapeLeftTheEditorAgain = document.activeElement !== content()
  appKey(UNDO)
  log.appUndoStepsBack = (await settled(pathB)) === B1
  log.editorFollowsBack = shows('which gets a word', /a word\. one$/) && shows('which gets another', /another\.$/)
  appKey(REDO)
  log.appRedoStepsForward = (await settled(pathB)) === B
  log.editorFollowsForward = shows('which gets a word', /a word\.$/)

  // Nothing above was a conflict with the disk.
  log.noConflictBanner = !banner()

  log.pass = Boolean(
    log.openedA &&
      log.typedAndTicked &&
      log.clearedToTheMarker &&
      log.undoBringsTheWordsBack &&
      log.redoTakesThemAgain &&
      log.lineStays &&
      log.markerGone &&
      log.nothingElseMoved &&
      log.boxGoneOnScreen &&
      log.undoPutsTheMarkerBack &&
      log.boxBackOnScreen &&
      log.thenTheWords &&
      log.thenTheTick &&
      log.thenTheTyping &&
      log.theOpenedNoteIsTheFloor &&
      log.alphaKeepsItsWords &&
      log.alphaNothingElseMoved &&
      log.undoPutsAlphasMarkerBack &&
      log.wordTyped &&
      log.theirsArrived &&
      log.undoTakesYourWord &&
      log.undoLeavesTheirs &&
      log.undoTookExactlyYourWord &&
      log.openedB &&
      log.escapeLeftTheEditor &&
      log.bothSaved &&
      log.readHoldsNoEditor &&
      log.editorRemounted &&
      log.caretInTheEditor &&
      log.historySurvivesRead &&
      log.editorTookTwo &&
      log.thenOne &&
      log.editorShowsTheStart &&
      log.appKeepsOut &&
      log.escapeLeftTheEditorAgain &&
      log.appUndoStepsBack &&
      log.editorFollowsBack &&
      log.appRedoStepsForward &&
      log.editorFollowsForward &&
      log.noConflictBanner
  )
  return log
})()
