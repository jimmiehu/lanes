// THE DISK AND THE EDITOR AGREE, WITHOUT A FIGHT.
//
// A note sits open beside the thread that is editing it. Claude writes the
// file; the pane is idle — the caret parked in a paragraph, nothing typed. That
// is not a conflict. There is nothing local to lose, so the words on disk simply
// arrive in the editor, and the caret stays in the paragraph it was in rather
// than being thrown to the top, or out of the editor altogether. The banner is
// for the case where both sides have something to lose, and only that one.
//
// And the agreement holds the other way round: a word typed after the reload
// goes down on top of what arrived rather than over it, so the file ends up
// with both — and the app's own save of that word is not then mistaken, one
// poll later, for somebody else's.
//
// And the hand-over has no gap in it. The poll asks whether anything is owed
// and then hands the new body over; a key that goes down between the two is
// owed by the time the pane and the editor look, so they used to pass the body
// by — and the save of that key then went over the outside edit, with the
// mtime already moved on to it and so no banner. A second outside version must
// be on screen by the moment the app records its mtime, and a key struck right
// after that moment must leave the file with both.
//
// And the words typed here are never taken back by a read of the file made
// before they reached it: a note closed mid-sentence and opened again a breath
// later opens with its last word, keeps it once the save lands, and keeps it
// under the next word typed — and main, asked to read a note just after it was
// asked to write it, reads what it wrote, never the text from before or a file
// caught half-written.
//
// And when both sides DO have something to lose — a word typed here, Claude's
// write there — the banner asks which stands, and until it is answered:
// - the note does not move. Rename… from its tab is refused, and the file and
//   Claude's version in it stay as they are (red: the rename went ahead, and
//   the held word followed it to the new name, over Claude's version);
// - a second note in the same state does not take the first one's place. The
//   first keeps its banner and its file, however many conflicts are open (red:
//   the app held one conflict at a time, and the first one's banner went);
// - and a rename is not a disagreement. Another note is renamed, and main
//   rewrites the link to it in this one while a word typed here is still on its
//   way: no banner, the word saved, the link as the rename wrote it — main makes
//   the same rewrite in the word's save — and the editor taking the rewritten
//   link up (red: the save refused as a conflict with nobody on the other side,
//   and "Keep mine" the dead link);
// - and closing the window writes the held words to a `(conflicted copy)`
//   beside the note, never over it — as it does, too, for words typed a moment
//   before Claude wrote, which no poll has seen yet (red: written over it).
//
// The outside paragraph lands ABOVE the caret on purpose. A reload that puts
// the caret back by its offset from the top of the document, instead of mapping
// it through the change, lands it inside the new paragraph — which is exactly
// the jump this is here to catch. A change below the caret would let that
// reload pass.
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
  const type = (text) => document.execCommand('insertText', false, text)
  /**
   * THE CARET GOES WHERE A CLICK PUTS IT — through the editor's own pointer
   * handling, as a person's does. Setting the page's selection directly is not
   * the same act: the editor only adopts a DOM selection while its window is
   * the front one, and a driven run cannot promise that. Clicking the left edge
   * of character `at` puts the caret just before it.
   */
  const caretIn = async (s, at = 1) => {
    const line = lineWith(s)
    if (!line) return false
    const walk = document.createTreeWalker(line, NodeFilter.SHOW_TEXT)
    let n
    while ((n = walk.nextNode())) {
      const i = n.data.indexOf(s)
      if (i === -1) continue
      const r = document.createRange()
      const a = Math.min(i + at, n.data.length - 1)
      r.setStart(n, a)
      r.setEnd(n, a + 1)
      const box = r.getBoundingClientRect()
      const x = i + at >= n.data.length ? box.right + 1 : box.left + 0.5
      const y = box.top + box.height / 2
      const ev = { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0, detail: 1, view: window }
      ;(document.elementFromPoint(x, y) ?? line).dispatchEvent(new MouseEvent('mousedown', ev))
      document.dispatchEvent(new MouseEvent('mouseup', ev))
      await sleep(250)
      return document.activeElement === content()
    }
    return false
  }
  // Where the caret is, counted in characters from the start of `line`; -1 when
  // it is not in that line at all. Counted through a Range rather than off the
  // anchor's own offset, since a redraw is free to split the line into different
  // text nodes and the same character would then read as a different offset.
  const caretAt = (line) => {
    const sel = window.getSelection()
    if (!line || !sel?.anchorNode || !line.contains(sel.anchorNode)) return -1
    const r = document.createRange()
    r.setStart(line, 0)
    r.setEnd(sel.anchorNode, sel.anchorOffset)
    return r.toString().length
  }
  // Anywhere on the page, not just inside the pane: a banner that moved
  // somewhere else would still be a banner.
  const banner = () => /changed on disk while you were editing/.test(document.body.innerText)
  const tabs = () => [...(pane(1)?.querySelectorAll('[data-tab]') ?? [])]
  const tabOf = (re) => tabs().find((t) => re.test(t.textContent ?? ''))
  const item = (text) => [...document.querySelectorAll('div')].find((d) => d.innerText?.trim() === text)
  const rightClick = (el) => {
    const b = el.getBoundingClientRect()
    el.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: b.left + 8, clientY: b.bottom + 2 }))
  }
  /** READ's blocks saying `s` — a note opens in READ, and is written in after ⌘E. */
  const readHas = (s) => [...(pane(1)?.querySelectorAll('[data-md-from]') ?? [])].some((d) => d.textContent.includes(s))
  const openByName = async (name, anchor) => {
    key('k')
    await sleep(600)
    const b = document.querySelector('[data-palette-input]')
    Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(b, name)
    b.dispatchEvent(new Event('input', { bubbles: true }))
    let found = false
    for (let i = 0; i < 60 && !found; i++) {
      const t = (document.querySelector('.pal-row[data-pal-on="1"]')?.textContent ?? '').trim()
      found = t.includes(name) && !t.startsWith('+')
      if (!found) await sleep(100)
    }
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    // It opens in READ; writing is asked for, with ⌘E.
    for (let i = 0; i < 30 && !lineWith(anchor) && !readHas(anchor); i++) await sleep(150)
    if (!lineWith(anchor)) key('e')
    for (let i = 0; i < 30 && !lineWith(anchor); i++) await sleep(150)
    return Boolean(lineWith(anchor))
  }
  /** A word typed, and a write from outside landing on top of it: the banner. */
  const conflictWith = async (at, word, theirLine, path, read) => {
    await caretIn(at, at.length)
    const was = await read()
    type(` ${word}`)
    const theirs = was.replace(/\n*$/, '\n') + theirLine + '\n'
    await window.lanes.noteWrite(path, theirs)
    for (let i = 0; i < 60 && !banner(); i++) await sleep(200)
    return theirs
  }
  const loadDisk = async () => {
    const b = item('Load the version on disk')
    b?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await sleep(600)
    return Boolean(b)
  }
  const log = {}

  // MERIDIAN leads its paragraph and the caret sits just past it, so an
  // offset-from-the-top restore — short of the ninety-odd characters that
  // arrive above — cannot land back in this paragraph by luck.
  const BODY = [
    '# Sync check',
    '',
    'The first paragraph, which nobody touches from either side.',
    '',
    'MERIDIAN is where the caret waits while the file changes underneath it.',
    '',
    'The last paragraph, as it was before anything arrived.',
    ''
  ].join('\n')
  const ABOVE = 'A paragraph written from outside the pane, landing above the caret rather than below it.'
  const APPENDED = 'appended from outside'
  const OUTSIDE = BODY.replace('MERIDIAN is', `${ABOVE}\n\nMERIDIAN is`) + '\n' + APPENDED + '\n'
  const WORD = 'inkwell'

  // --- seed it, and open it the way a person would: by finding it ---
  const made = await window.lanes.noteCreate('Sync check', '_unfiled')
  const PATH = made.path || '_unfiled/sync-check.md'
  await window.lanes.noteWrite(PATH, BODY)
  const disk = async () => (await window.lanes.note(PATH))?.body ?? ''
  key('k')
  await sleep(600)
  const box = document.querySelector('[data-palette-input]')
  const setIn = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
  setIn.call(box, 'Sync check')
  box.dispatchEvent(new Event('input', { bubbles: true }))
  await sleep(1000)
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
  await sleep(1800)
  // A note opens in READ; writing is asked for, with ⌘E.
  if (!content()) key('e')
  for (let i = 0; i < 15 && !lineWith('MERIDIAN'); i++) await sleep(200)

  log.opensInTheEditor = Boolean(content()) && Boolean(lineWith('MERIDIAN'))
  if (!log.opensInTheEditor) return { ...log, pass: false }

  // --- the caret parked in a paragraph, and NOTHING typed ---
  log.caretPlaced = await caretIn('MERIDIAN', 'MERIDIAN'.length)
  log.caretBefore = caretAt(lineWith('MERIDIAN'))
  // Long enough that nothing from the open itself is still in flight when the
  // file changes — the claim is about an editor at rest.
  await sleep(1200)

  // --- the file changes from outside the pane: above the caret, and at the end ---
  // Straight through the IPC, so the app's save path never sees this write and
  // cannot know it was its own. That is what an edit from the thread looks like.
  const t0 = performance.now()
  await window.lanes.noteWrite(PATH, OUTSIDE)
  const arrived = () => (content()?.textContent ?? '').includes(APPENDED)
  // The poll is every 4s, so 10s covers two of them and a slow redraw besides.
  while (!arrived() && performance.now() - t0 < 10000) await sleep(200)
  log.arrivedAfterMs = Math.round(performance.now() - t0)
  // The words showing up is not the reload being over. Putting the caret back
  // is free to be a step of its own — a selection dispatched after the text, an
  // effect, a frame later — and reading it on the tick the text landed would
  // catch the editor between the two and call a jump what is only a reload
  // still finishing. A caret that is back where it was 300ms on is where the
  // reader finds it.
  await sleep(300)

  log.outsideChangeArrived = arrived() && Boolean(lineWith(ABOVE.slice(0, 40)))
  log.noConflictBanner = !banner()
  // Still in the editor, and still in THAT paragraph.
  log.stillFocused = document.activeElement === content()
  log.caretAfter = caretAt(lineWith('MERIDIAN'))
  log.caretStayedPut = log.stillFocused && log.caretAfter !== -1
  // And on the same character: not merely the right paragraph, but the place in
  // it the reader left.
  log.caretSameCharacter = log.caretBefore > 0 && log.caretAfter === log.caretBefore

  // --- then a word, typed where the caret was left ---
  type(` ${WORD}`)
  await sleep(2200)
  const after = await disk()
  log.bothSurvive = after.includes(ABOVE) && after.includes(APPENDED) && after.includes(WORD)
  log.typedAtTheCaret = after.includes(`MERIDIAN ${WORD} is where`)
  // Nothing doubled and nothing dropped: the file is the outside version with
  // exactly one word more.
  const expected = OUTSIDE.replace('MERIDIAN is', `MERIDIAN ${WORD} is`)
  log.nothingElseChanged = after.replace(/\s+$/, '') === expected.replace(/\s+$/, '')

  // --- and one poll later, the app's own save is still the app's own ---
  // Its write moved the mtime too. An editor that only remembers the mtime it
  // loaded, rather than the one it last wrote, reads its own keystroke as
  // someone else's and raises the banner over a note nobody else touched.
  await sleep(4600)
  log.ownSaveIsNotAConflict =
    !banner() && (content()?.textContent ?? '').includes(WORD) && (await disk()).includes(WORD)

  // --- and a key going down the moment the outside version is taken ---
  // The poll asks whether anything is owed and, when nothing is, takes the new
  // version: into the editor, and the note's mtime moved on to it. A key typed
  // after that question and before the editor has the words is the one case
  // neither answer covers — owed by the time the pane and the editor look, so
  // they pass the words by as older than the typing, and the save of that key,
  // its base already the new mtime, goes over them with no banner.
  //
  // The moment is caught where the app records the new mtime. For the length of
  // the race `Map.prototype.set` is watched for this note's path being given a
  // number — with the palette shut, the app's record of mtimes is the one map
  // that does — and at that moment the words must already be on screen: the
  // claim, asked where it is made. A key is then struck in the microtask after
  // it, ahead of any render, effect or task React had yet to run, and has to
  // land on top.
  //
  // Not on the commit that delivers it — a MutationObserver hearing the head's
  // "edited …s ago" change, say. That line is only as new as the window's last
  // render, which can be the save of `inkwell` ten seconds back, so any stray
  // mutation in the pane reads as the new version arriving. And a commit is
  // already too late: a window render left to React's own time comes a task
  // after the question, and a key struck at its commit misses that gap, so a
  // build that still had it would pass.
  const RACED = 'Written from outside in the same breath as a key went down.'
  const STRUCK = 'ember'
  log.raceCaret = await caretIn('MERIDIAN', 'MERIDIAN'.length)
  const beforeRace = await disk()
  const racedBody = beforeRace.replace(/\n*$/, '\n') + RACED + '\n'
  let struckAt = -1
  const t1 = performance.now()
  const mapSet = Map.prototype.set
  Map.prototype.set = function (k, v) {
    if (struckAt === -1 && k === PATH && typeof v === 'number') {
      struckAt = Math.round(performance.now() - t1)
      log.raceOnScreenAsTheMtimeMoved = (content()?.textContent ?? '').includes(RACED)
      queueMicrotask(() => type(` ${STRUCK}`))
    }
    return mapSet.call(this, k, v)
  }
  try {
    await window.lanes.noteWrite(PATH, racedBody)
    while (struckAt === -1 && performance.now() - t1 < 10000) await sleep(100)
  } finally {
    Map.prototype.set = mapSet
  }
  log.raceStruckAfterMs = struckAt
  // Past the three timers and one more poll, so a banner raised late is seen.
  await sleep(5000)
  const afterRace = await disk()
  const onScreen = content()?.textContent ?? ''
  log.raceStruck = struckAt !== -1 && onScreen.includes(STRUCK)
  log.raceOutsideKept = afterRace.includes(RACED) && onScreen.includes(RACED)
  log.raceKeyKept = afterRace.includes(`MERIDIAN ${STRUCK} ${WORD}`)
  log.raceNoBanner = !banner()
  log.raceNothingElseChanged =
    afterRace.replace(/\s+$/, '') === racedBody.replace(`MERIDIAN ${WORD}`, `MERIDIAN ${STRUCK} ${WORD}`).replace(/\s+$/, '')

  // --- closed mid-sentence and opened again at once ---
  // The last words of a note you close are still owed for half a second, on
  // the save's timer, and opening it again inside that half second read the
  // file back without them. The editor took the read for the note — out of its
  // history, so ⌘Z could not bring them back — the save then landed where
  // nothing showed it, and the next word typed saved the old text straight
  // over it. So: a word, the tab's ×, ⇧⌘T a breath later. The word is on
  // screen, it is still there once its save has landed, and a word typed after
  // it goes down beside it in the file.
  const REOPEN = 'lanternfish'
  const AGAIN = 'quillwort'
  log.caretBeforeClose = await caretIn(WORD, WORD.length)
  type(` ${REOPEN}`)
  await sleep(60)
  const noteTab = [...(pane(1)?.querySelectorAll('[data-tab]') ?? [])].find((t) =>
    /Sync check/.test(t.textContent ?? '')
  )
  noteTab?.querySelector('[data-x]')?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  await sleep(60)
  log.closedTheTab = Boolean(noteTab) && !lineWith('MERIDIAN')
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'T', metaKey: true, shiftKey: true, bubbles: true }))
  for (let i = 0; i < 30 && !lineWith('MERIDIAN'); i++) await sleep(50)
  log.reopenedWithTheWord = (content()?.textContent ?? '').includes(REOPEN)
  // And after its save has landed, which nothing on screen used to follow.
  await sleep(1200)
  log.wordStaysOnceSaved =
    (content()?.textContent ?? '').includes(REOPEN) && (await disk()).includes(REOPEN)
  // Typed ahead of both, where it lands with or without the word: the next
  // keystroke is what used to save the old text over it, so it has to happen
  // either way for the file to say what was lost.
  log.caretAfterReopen = await caretIn('MERIDIAN', 'MERIDIAN'.length)
  type(` ${AGAIN}`)
  await sleep(2200)
  const kept = await disk()
  log.meridianOnDisk = kept.split('\n').find((l) => l.startsWith('MERIDIAN')) ?? null
  // The race above left its word after MERIDIAN; this one goes in front of it.
  log.fileKeepsBoth = kept.includes(`MERIDIAN ${AGAIN} ${STRUCK} ${WORD} ${REOPEN} is where`)
  log.noBannerAfterReopen = !banner()

  // --- both sides with something to lose: a word typed, and a write on top ---
  const THEIRS_LINE = 'Claude wrote this while a word was still being typed here.'
  const theirs = await conflictWith('MERIDIAN', 'marginalia', THEIRS_LINE, PATH, disk)
  log.conflictRaised = banner()

  // Rename… from the tab, while the banner is up: refused, and nothing moves.
  const noteTab2 = tabOf(/Sync check/)
  if (noteTab2) {
    rightClick(noteTab2)
    await sleep(400)
  }
  item('Rename…')?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
  await sleep(700)
  const field = document.querySelector('[data-rename="1"]')
  log.renameFieldOpened = Boolean(field)
  field?.focus()
  field?.select?.()
  type('Sync renamed')
  await sleep(200)
  field?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
  // Past the rename, and past every timer a held save could be put back on.
  await sleep(3000)
  const stray = document.querySelector('[data-rename="1"]')
  stray?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
  await sleep(300)
  log.renameRefusedInConflict = (await window.lanes.note('_unfiled/sync-renamed.md')) === null && (await disk()) === theirs
  log.bannerStaysUp = banner()

  // A second note in the same state, in a tab of its own.
  key('t')
  await sleep(500)
  const second = await window.lanes.noteCreate('Sync second', '_unfiled')
  const SECOND = second.path || '_unfiled/sync-second.md'
  await window.lanes.noteWrite(SECOND, '# Sync second\n\nPLUMBLINE is the line the second conflict is typed on.\n')
  log.secondOpened = await openByName('Sync second', 'PLUMBLINE')
  const diskOf = async (p) => (await window.lanes.note(p))?.body ?? ''
  const theirsToo = await conflictWith('PLUMBLINE', 'sounding', 'And Claude wrote to the second note as well.', SECOND, () => diskOf(SECOND))
  log.secondConflictRaised = banner()
  // Back to the first: its banner is still up, and its file is still theirs.
  tabOf(/Sync check/)?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  for (let i = 0; i < 20 && !lineWith('MERIDIAN'); i++) await sleep(150)
  await sleep(600)
  log.firstConflictKept = Boolean(lineWith('MERIDIAN')) && banner() && (await disk()) === theirs
  // Answered, each one: the version on disk.
  log.firstAnswered = await loadDisk()
  tabOf(/Sync second/)?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  for (let i = 0; i < 20 && !lineWith('PLUMBLINE'); i++) await sleep(150)
  await sleep(600)
  log.secondStillAsked = banner()
  log.secondAnswered = await loadDisk()
  log.secondKeptTheirs = (await diskOf(SECOND)) === theirsToo
  tabOf(/Sync check/)?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  for (let i = 0; i < 20 && !lineWith('MERIDIAN'); i++) await sleep(150)
  await sleep(600)
  log.bannersGone = !banner()

  // --- a rename behind the note's back, with a word on its way ---
  const target = await window.lanes.noteCreate('Sync link target', '_unfiled')
  const TARGET = target.path || '_unfiled/sync-link-target.md'
  await window.lanes.noteWrite(TARGET, '# Sync link target\n\nA note another one links to.\n')
  // The link, written to this note from outside, and taken in by the poll.
  await window.lanes.noteWrite(PATH, (await disk()).replace('The last paragraph,', 'The last paragraph [[sync-link-target]],'))
  for (let i = 0; i < 60 && !(content()?.textContent ?? '').includes('sync-link-target'); i++) await sleep(200)
  log.linkArrived = (content()?.textContent ?? '').includes('sync-link-target')
  // A word, and in the same breath the target renamed — by main, which
  // rewrites the link in this note behind the editor's back.
  await caretIn('MERIDIAN', 'MERIDIAN'.length)
  type(' quartz')
  const renamed = await window.lanes.noteRename(TARGET, 'Sync link renamed')
  log.renameRewroteThisNote = renamed.ok && (renamed.relinkedPaths ?? []).includes(PATH)
  // The save, and a poll or two.
  await sleep(9000)
  const relinked = await disk()
  log.renameNoBanner = !banner()
  log.renameKeptTheWord = relinked.includes('MERIDIAN quartz')
  log.renameKeptTheLink = relinked.includes('[[sync-link-renamed]]') && !relinked.includes('[[sync-link-target]]')
  log.editorTookTheLink = (content()?.textContent ?? '').includes('sync-link-renamed')
  if (banner()) await loadDisk()

  // The caret back in the note, where the next section types.
  await caretIn('MERIDIAN', 'MERIDIAN'.length)

  // --- and a read asked for after a write reads what that write wrote ---
  // Main's writes wait in a queue its reads never joined, and a write empties
  // the file before it fills it: a note opened while its last words were being
  // written read back as the text before them, as nothing, or cut off. Asked in
  // that order through the IPC — the order a save and a reopen send them in —
  // the read must see the write. A note of its own, not open anywhere, so the
  // poll has nothing to say about it. Ten rounds: one stale read is the fault.
  const other = await window.lanes.noteCreate('Sync order', '_unfiled')
  const OTHER = other.path || '_unfiled/sync-order.md'
  let seen = 0
  for (let i = 0; i < 10; i++) {
    const next = `# Sync order\n\n${'A line of a note being saved while it is read. '.repeat(400)}\nround ${i}\n`
    const [wrote, read] = await Promise.all([window.lanes.noteWrite(OTHER, next), window.lanes.note(OTHER)])
    if (wrote.ok && read?.body === next) seen += 1
  }
  log.readsSeeTheWriteBeforeThem = `${seen} of 10`

  // --- and the window closing mid-sentence ---
  // Typing reaches the disk on three timers, and closing the window tears all
  // of them down. The last word typed before the window goes must still be in
  // the file: the way out settles the editor and writes synchronously. This
  // fires the same event the window fires on its way out, a breath after the
  // keystroke — far inside every one of those timers.
  const LAST = 'lastword'
  type(` ${LAST}`)
  await sleep(20)
  window.dispatchEvent(new Event('beforeunload'))
  await sleep(30)
  log.lastWordSurvivesTheWindow = (await disk()).includes(LAST)

  // --- and the window closing a moment after Claude wrote to the note ---
  // No poll has seen that write yet, so no banner: the app's last look at the
  // file is from before it. The last words go beside the note, not over it.
  // Settled first, one poll on: the write above moved the file under the app.
  await sleep(4600)
  const CLOSING = 'Claude wrote this a moment before the window closed.'
  const FINAL = 'finalword'
  await caretIn('MERIDIAN', 'MERIDIAN'.length)
  const beforeClose = await disk()
  type(` ${FINAL}`)
  const theirsAtClose = beforeClose.replace(/\n*$/, '\n') + CLOSING + '\n'
  await window.lanes.noteWrite(PATH, theirsAtClose)
  window.dispatchEvent(new Event('beforeunload'))
  await sleep(100)
  const copy = PATH.replace(/\.md$/, ' (conflicted copy).md')
  log.closeKeepsTheirs = (await disk()) === theirsAtClose
  log.closeWritesACopy = ((await window.lanes.note(copy))?.body ?? '').includes(`MERIDIAN ${FINAL}`)

  log.pass =
    log.opensInTheEditor &&
    log.caretPlaced &&
    log.outsideChangeArrived &&
    log.noConflictBanner &&
    log.caretStayedPut &&
    log.caretSameCharacter &&
    log.bothSurvive &&
    log.typedAtTheCaret &&
    log.nothingElseChanged &&
    log.ownSaveIsNotAConflict &&
    log.raceCaret &&
    log.raceOnScreenAsTheMtimeMoved === true &&
    log.raceStruck &&
    log.raceOutsideKept &&
    log.raceKeyKept &&
    log.raceNoBanner &&
    log.raceNothingElseChanged &&
    log.caretBeforeClose &&
    log.closedTheTab &&
    log.reopenedWithTheWord &&
    log.wordStaysOnceSaved &&
    log.caretAfterReopen &&
    log.fileKeepsBoth &&
    log.noBannerAfterReopen &&
    seen === 10 &&
    log.lastWordSurvivesTheWindow &&
    log.conflictRaised &&
    log.renameFieldOpened &&
    log.renameRefusedInConflict &&
    log.bannerStaysUp &&
    log.secondOpened &&
    log.secondConflictRaised &&
    log.firstConflictKept &&
    log.firstAnswered &&
    log.secondStillAsked &&
    log.secondAnswered &&
    log.secondKeptTheirs &&
    log.bannersGone &&
    log.linkArrived &&
    log.renameRewroteThisNote &&
    log.renameNoBanner &&
    log.renameKeptTheWord &&
    log.renameKeptTheLink &&
    log.editorTookTheLink &&
    log.closeKeepsTheirs &&
    log.closeWritesACopy
  return log
})()
