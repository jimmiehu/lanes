// A note too long to draw does not hang the window — in either surface.
//
// Two faults met on one long note. READ parsed the note on EVERY render and
// then drew every block it found — tens of thousands of them, eight seconds of
// frozen window and two more of blocked main thread, and then that many
// elements left behind to scroll. And the outline counted any line whose
// TRIMMED text began with `##`, where the document's own parser requires the
// `#` at column 0 — so it listed over a thousand sections the note does not
// have and the reader cannot jump to, nearly all of them indented and every
// one of them the same words.
//
// So: the parse is memoised, READ draws a stated number of blocks and says what
// it has not drawn, and the outline reads headings the way the document does.
//
// WHAT THE REBUILD CHANGED. WRITE is one CodeMirror editor rather than a textarea with a painted mirror under it. The
// mirror had to paint every line it held, so above 8,000 lines WRITE gave up
// and went plain — no bold, no headings, just source. That mode is gone and
// nothing replaces it: the editor draws only the lines near the screen and
// decorates only those, so a note of any length opens in a moment and is live
// markdown all the way down. This now holds THAT, on a note well past the old
// 8,000-line line: ⌘E opens it promptly in the editor, the DOM holds a screenful
// or two rather than the note, the bottom of it is as rendered as the top, and
// an outline row near the end takes you there. READ's cap is unchanged and is
// still held — reached now with ⌘E — along with its way back into WRITE.
//
// Seeds its own notes through the app's IPC: a small one to start from, and a
// long one of sixty `## Section n` headings over ~10,000 lines and ~5,000
// blocks, with INDENTED `  ## …` lines among the prose that are not headings.
// Run against a throwaway LANES_VAULT and LANES_STATE. See checks/README.md.
(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
  const click = (el) => el && el.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  const key = (k, extra = {}) =>
    window.dispatchEvent(new KeyboardEvent('keydown', { key: k, metaKey: true, bubbles: true, ...extra }))
  const pane = () => document.querySelector('[data-pane="1"]')
  const content = () => pane()?.querySelector('.cm-content')
  const lines = () => [...(pane()?.querySelectorAll('.cm-line') ?? [])]
  const lineWith = (s) => lines().find((l) => l.textContent.includes(s))
  // The NOTE pane's scrollport — pane 0 has one of its own.
  const sc = () => pane()?.querySelector('[data-find-scope]')
  const inView = (el) => {
    if (!el || !sc()) return false
    const a = el.getBoundingClientRect()
    const b = sc().getBoundingClientRect()
    return a.bottom > b.top && a.top < b.bottom
  }
  /** A timer that should take 50ms, measured: what is left over is the window being busy. */
  const drift = async () => {
    const t = performance.now()
    await sleep(50)
    return Math.round(performance.now() - t - 50)
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
    for (let i = 0; i < 40; i++) {
      const on = document.querySelector('.pal-row[data-pal-on="1"]')
      const t = on?.textContent.trim().toLowerCase() ?? ''
      if (t.includes(name.toLowerCase()) && !t.startsWith('+')) break
      await sleep(100)
    }
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    return true
  }
  const log = {}
  await sleep(1200)

  /* ---------- the fixture ---------- */

  const SECTIONS = 60
  const PARAS = 70
  const out = ['# The longest note', '', 'Where the long note begins, before any section.', '']
  for (let s = 1; s <= SECTIONS; s++) {
    out.push(`## Section ${s}`, '')
    for (let p = 1; p <= PARAS; p++) {
      // Some bold and some emphasis in every section, so the bottom of the note
      // has styled runs to be asked about as well as the top.
      const mark = p % 10 === 1 ? ` It carries **bold ${s}.${p}** and *soft ${s}.${p}* in it.` : ''
      out.push(
        `Paragraph ${p} of section ${s}. The words run on long enough to wrap, the way prose in a real note does, so each line is the height of a real line.${mark}`,
        ''
      )
      // Not a heading: the `#` is not at column 0. The outline must not count it.
      if (p % 5 === 0) out.push(`  ## not a section, only an indented line (${s}.${p})`, '')
    }
  }
  out.push('THE END OF THE LONG NOTE.', '')
  const BODY = out.join('\n')
  log.fixtureLines = out.length
  log.fixtureChars = BODY.length

  const small = await window.lanes.noteCreate('Small start', '_unfiled')
  await window.lanes.noteWrite(small.path || '_unfiled/small-start.md', '# Small start\n\nA short note to start from.\n')
  const made = await window.lanes.noteCreate('The longest note', '_unfiled')
  const PATH = made.path || '_unfiled/the-longest-note.md'
  await window.lanes.noteWrite(PATH, BODY)

  // Start somewhere small, so the open below is the whole cost of opening it.
  await openByName('Small start')
  await sleep(1800)

  /* ---------- 1. ⌘E opens it in the editor, promptly ---------- */

  // A note opens in READ — capped, which part 4 holds — so WRITE is timed from
  // the ⌘E that asks for it.
  await openByName('The longest note')
  for (let i = 0; i < 100 && !document.querySelector('[data-doc-capped="1"]') && !content(); i++) await sleep(50)
  const t0 = performance.now()
  if (!content()) key('e')
  for (let i = 0; i < 200; i++) {
    if (lineWith('Where the long note begins')) break
    await sleep(50)
  }
  log.msToOpen = Math.round(performance.now() - t0)
  log.writeIsTheEditor =
    Boolean(content()) && pane()?.querySelector('[data-mode="WRITE"]')?.dataset.on === '1'
  log.opensPromptly = log.writeIsTheEditor && log.msToOpen < 2500
  // And the window is its own again.
  log.idleDriftWrite = await drift()
  log.writeLeavesTheThreadFree = log.idleDriftWrite < 250

  // The editor draws what is near the screen, not the note. Ten thousand lines
  // in the DOM would be the old hang in a new place.
  log.linesInTheDom = lines().length
  log.drawsOnlyNearTheScreen = log.linesInTheDom > 0 && log.linesInTheDom < 1000

  // Rendered from the top: a heading is a heading, bold is bold, no syntax.
  const top = lineWith('Section 1')
  log.headingDrawnAtTheTop = Boolean(top?.classList.contains('cm-md-h2'))
  const boldTop = lineWith('bold 1.1')
  log.boldDrawnAtTheTop =
    Boolean(boldTop?.querySelector('.cm-md-strong')) && !boldTop?.innerText.includes('**')

  /* ---------- 2. the outline lists the note's REAL headings ---------- */

  const outline = () => document.querySelector('[data-outline="1"]')
  const rows = () => [...(outline()?.querySelectorAll('[data-outline-line]') ?? [])]
  log.outlineRows = rows().length
  // Sixty, exactly. The indented `##` lines are prose, and there are 840 of them.
  log.outlineIsTheRealHeadings = log.outlineRows === SECTIONS

  /* ---------- 3. WRITE goes to a row near the end, and it is still live there ---------- */

  // Closed in a narrow pane, where the rows are ticks on a button rather than
  // clickable rows. Open it first — the jump is the thing under test.
  if (outline()?.dataset.outlineOpen === '0') {
    click(outline().querySelector('.toc-ticks'))
    await sleep(700)
  }
  const far = rows()[rows().length - 1]
  log.farRowLine = far ? Number(far.dataset.outlineLine) : null
  const writeBefore = sc()?.scrollTop ?? 0
  click(far)
  await sleep(2400)
  log.writeScrolled = (sc()?.scrollTop ?? 0) > writeBefore + 1000
  const farHead = lineWith(`Section ${SECTIONS}`)
  // In view, not merely in the DOM: CodeMirror keeps a margin of lines drawn
  // above and below the screen, and a jump that lands a screen short would
  // still find the heading there. Where it sits is logged, not held — the
  // precise landing is `outline.js`'s claim, on a note of ordinary size.
  log.writeFarOffset = farHead
    ? Math.round(farHead.getBoundingClientRect().top - sc().getBoundingClientRect().top)
    : null
  log.writeWentThere = inView(farHead)
  // As rendered at line 10,000 as at line 1 — what the plain mode was not.
  log.headingDrawnAtTheBottom = Boolean(farHead?.classList.contains('cm-md-h2'))
  const boldFar = lineWith(`bold ${SECTIONS}.1`)
  log.boldDrawnAtTheBottom =
    Boolean(boldFar?.querySelector('.cm-md-strong')) && !boldFar?.innerText.includes('**')

  // And the very last line of the file is in there to be reached. Asked more
  // than once, because the first scroll to the bottom lands on an ESTIMATED
  // bottom: the lines on the way have not been measured yet, and the note's
  // height settles once they are.
  for (let i = 0; i < 4 && !inView(lineWith('THE END OF THE LONG NOTE')); i++) {
    sc().scrollTop = sc().scrollHeight
    await sleep(600)
  }
  log.reachesTheLastLine = inView(lineWith('THE END OF THE LONG NOTE'))
  log.linesInTheDomAtTheEnd = lines().length

  /* ---------- 4. READ, by ⌘E: promptly, and it says what it has not drawn ---------- */

  sc().scrollTop = 0
  await sleep(300)
  const t1 = performance.now()
  key('e')
  for (let i = 0; i < 200; i++) {
    if (document.querySelectorAll('[data-pane="1"] [data-md-from]').length > 50) break
    await sleep(50)
  }
  log.msToRead = Math.round(performance.now() - t1)
  log.readOpensPromptly = log.msToRead < 2500
  log.blocksDrawn = document.querySelectorAll('[data-pane="1"] [data-md-from]').length
  log.drewACappedNumber = log.blocksDrawn > 100 && log.blocksDrawn <= 1500
  log.idleDriftRead = await drift()
  log.readLeavesTheThreadFree = log.idleDriftRead < 250

  log.saysItIsCut = Boolean(document.querySelector('[data-doc-capped="1"]'))
  log.offersWrite = Boolean(document.querySelector('[data-doc-to-write="1"]'))
  log.offersTheRest = Boolean(document.querySelector('[data-doc-show-all="1"]'))
  log.readOutlineRows = rows().length
  log.readOutlineIsTheSame = log.readOutlineRows === SECTIONS

  /* ---------- 5. a READ row past the cap still goes there ---------- */

  // Clicking a row and having nothing happen is the worst possible answer, so
  // asking to go to a section past what has been drawn draws the rest.
  if (outline()?.dataset.outlineOpen === '0') {
    click(outline().querySelector('.toc-ticks'))
    await sleep(700)
  }
  const readFar = rows()[rows().length - 1]
  const readBefore = sc()?.scrollTop ?? 0
  click(readFar)
  await sleep(2400)
  log.drewTheRest = !document.querySelector('[data-doc-capped="1"]')
  log.readScrolled = (sc()?.scrollTop ?? 0) > readBefore + 1000
  const anchor = readFar && sc()?.querySelector(`[data-toc="h${readFar.dataset.outlineLine}"]`)
  log.readWentThere = inView(anchor)

  /* ---------- 6. from the cap, back into WRITE, quickly ---------- */

  // Leaving and coming back puts the cap back: going to a section asked for the
  // rest of THAT visit, not for this note forever. The mode stays READ — it is
  // this tab's, and ⌘E set it.
  await openByName('Small start')
  await sleep(1500)
  await openByName('The longest note')
  for (let i = 0; i < 100 && !document.querySelector('[data-doc-to-write="1"]'); i++) await sleep(50)
  log.cappedAgain = Boolean(document.querySelector('[data-doc-capped="1"]'))

  const t2 = performance.now()
  click(document.querySelector('[data-doc-to-write="1"]'))
  for (let i = 0; i < 100; i++) {
    if (lineWith('Where the long note begins')) break
    await sleep(50)
  }
  log.msToWrite = Math.round(performance.now() - t2)
  log.writeOpened =
    Boolean(content()) && pane()?.querySelector('[data-mode="WRITE"]')?.dataset.on === '1'
  log.writeIsPrompt = log.writeOpened && log.msToWrite < 2500

  // Nothing above typed a character: the file is what was seeded.
  log.fileUntouched = ((await window.lanes.note(PATH))?.body ?? '') === BODY

  log.pass =
    log.writeIsTheEditor &&
    log.opensPromptly &&
    log.writeLeavesTheThreadFree &&
    log.drawsOnlyNearTheScreen &&
    log.headingDrawnAtTheTop &&
    log.boldDrawnAtTheTop &&
    log.outlineIsTheRealHeadings &&
    log.writeScrolled &&
    log.writeWentThere &&
    log.headingDrawnAtTheBottom &&
    log.boldDrawnAtTheBottom &&
    log.reachesTheLastLine &&
    log.readOpensPromptly &&
    log.drewACappedNumber &&
    log.readLeavesTheThreadFree &&
    log.saysItIsCut &&
    log.offersWrite &&
    log.offersTheRest &&
    log.readOutlineIsTheSame &&
    log.drewTheRest &&
    log.readScrolled &&
    log.readWentThere &&
    log.cappedAgain &&
    log.writeOpened &&
    log.writeIsPrompt &&
    log.fileUntouched
  return log
})()
