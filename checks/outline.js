// The note outline, per its original design: rows read from the
// note's own ## and ### lines, an overlay in the left margin, ticks when it is
// shut, the section you are reading marked on the hairline, and a jump that
// lands the heading at the top.
//
// One OPEN shape, always in a margin. Where the pane has one the document does
// not move at all; where it has none the pane makes one and the column shifts
// right — which is the difference between opening to the left of the words and
// opening on top of them. And it stays until it is sent away: the chevron, or
// escape, and no longer any click that happens to land elsewhere.
//
// WHAT THE REBUILD CHANGED. This ran in READ, which was where a note opened,
// and leaned on READ's drawing: the `data-toc` anchor on every heading, and the
// first block's box as the column. WRITE is now one CodeMirror
// editor, which draws only the lines near the screen — so there is no anchor to
// find, and the outline asks the EDITOR where a line is instead (drawn or not).
// So the whole design is held in WRITE as well as READ: rows that ARE
// the note's own heading lines, the overlay against the editor's column, the
// jump, the mark. READ is still held after ⌘E — one anchor per row, in order,
// the same column as WRITE, the jump 22px under the top — and the two jumps are
// held against each other: the heading's WORDS land at the same height in both,
// since a heading that is somewhere else after ⌘E is the outline disagreeing
// with itself. The column is the words too, not a box: where the first letter
// of a line of prose is drawn, in either mode. Escape is new as well: from the
// editor it is the editor's (it lets go of the caret, and the outline stays),
// and the next one, with nothing holding the caret, sends the outline away.
//
// Seeds its own two notes through the app's IPC, and makes the thread it says
// has no outline (⌘T in the thread pane, left unsent). Run against a throwaway
// LANES_VAULT and LANES_STATE. It runs the wide case in a single pane, so give
// the window room. See checks/README.md.
(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
  const click = (el) => el && el.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  const down = (el) => el && el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
  const key = (k, extra = {}) =>
    window.dispatchEvent(new KeyboardEvent('keydown', { key: k, metaKey: true, bubbles: true, ...extra }))
  const press = (el, k, mods = {}) =>
    el?.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...mods }))
  const notePane = () => document.querySelector('[data-pane="1"]')
  const content = () => notePane()?.querySelector('.cm-content')
  const lines = () => [...(notePane()?.querySelectorAll('.cm-line') ?? [])]
  const lineWith = (s) => lines().find((l) => l.textContent.includes(s))
  const toc = () => document.querySelector('[data-outline="1"]')
  const rows = () => [...(toc()?.querySelectorAll('[data-outline-line]') ?? [])]
  const rowTitled = (re) => rows().find((r) => re.test(r.getAttribute('title') || ''))
  const activeRow = () => toc()?.querySelector('[data-outline-on="1"]')
  const isOpen = () => toc()?.dataset.outlineOpen === '1'
  const chevron = () => toc()?.querySelector('[aria-expanded]')
  const scroller = () => notePane()?.querySelector('[data-find-scope]')
  // READ's anchors. WRITE has none: the editor is asked instead.
  const anchors = () => [...(scroller()?.querySelectorAll('[data-toc^="h"]') ?? [])]
  const box = (el) => el?.getBoundingClientRect()
  /**
   * Where the WORDS start — the number the overlay must never change, and ⌘E
   * must not either. Taken from the first letter of a line of prose, not from
   * the box around it: the editor's column and READ's first block are both the
   * column's edge whatever sits between that edge and the letters, so a padding
   * that pushed the words over in one mode only would leave two boxes agreeing.
   * In WRITE any prose line the editor has drawn will do: they all start where
   * the column does, and it draws only the ones near the screen. NaN when there
   * are no words to measure, so that nothing compared with it can pass.
   */
  const textLeft = () => {
    const prose = content()
      ? lines().filter((l) => !/cm-md-(?!dim)/.test(l.className))
      : [scroller()?.querySelector('[data-md-from]')?.firstElementChild]
    for (const el of prose) {
      if (!el) continue
      const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
      let n
      while ((n = walk.nextNode())) {
        const i = n.data.search(/\S/)
        if (i === -1) continue
        const r = document.createRange()
        r.setStart(n, i)
        r.setEnd(n, i + 1)
        return Math.round(r.getBoundingClientRect().left)
      }
    }
    return NaN
  }
  /** Where the words `s` are drawn inside `el`, from their own glyph box. */
  const wordsTop = (el, s) => {
    if (!el) return NaN
    const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
    let n
    while ((n = walk.nextNode())) {
      const i = n.data.indexOf(s)
      if (i === -1) continue
      const r = document.createRange()
      r.setStart(n, i)
      r.setEnd(n, i + s.length)
      return r.getBoundingClientRect().top
    }
    return NaN
  }
  /** A line of prose on screen now — the kind of place a reader clicks. */
  const visibleProse = () => {
    const b = box(scroller())
    return lines().find((l) => {
      const r = box(l)
      return l.textContent.length > 40 && !/cm-md-h/.test(l.className) && r.top > b.top + 60 && r.bottom < b.bottom - 20
    })
  }
  /**
   * A click in the words, through the editor's own pointer handling — the way
   * a person's click puts the caret there.
   */
  const tapIn = async (el) => {
    if (!el) return
    const r = box(el)
    const at = {
      bubbles: true,
      cancelable: true,
      clientX: r.left + Math.min(40, r.width / 2),
      clientY: r.top + Math.min(10, r.height / 2),
      button: 0,
      detail: 1,
      view: window
    }
    ;(document.elementFromPoint(at.clientX, at.clientY) ?? el).dispatchEvent(new MouseEvent('mousedown', at))
    document.dispatchEvent(new MouseEvent('mouseup', at))
    await sleep(300)
  }
  const settle = async () => {
    let last = -1
    for (let i = 0; i < 40; i += 1) {
      const now = Math.round(scroller().scrollTop)
      if (now === last) return now
      last = now
      await sleep(80)
    }
    return last
  }
  const openIt = async () => {
    if (toc() && !isOpen()) click(chevron())
    await sleep(500)
  }
  const shutIt = async () => {
    if (isOpen()) click(chevron())
    await sleep(600)
  }
  const toggle = () => document.querySelector('[title^="One pane"], [title^="Two panes"]')
  const split = () => /^One pane/.test(toggle()?.getAttribute('title') ?? '')
  /**
   * Open a note the way a person finds one: ⌘K, its name, ↵ (⌘↵ for a tab of
   * its own). Waits until the row ↵ belongs to IS that note — pressed early, ↵
   * takes the offer to make a new note by that name instead.
   */
  const openByName = async (name, newTab = false) => {
    key('k')
    await sleep(600)
    const input = document.querySelector('[data-palette-input]')
    if (!input) return false
    const setIn = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
    setIn.call(input, name)
    input.dispatchEvent(new Event('input', { bubbles: true }))
    for (let i = 0; i < 40; i++) {
      const on = document.querySelector('.pal-row[data-pal-on="1"]')
      const t = on?.textContent.trim().toLowerCase() ?? ''
      if (t.includes(name.toLowerCase()) && !t.startsWith('+')) break
      await sleep(100)
    }
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', metaKey: newTab, bubbles: true }))
    await sleep(1800)
    return true
  }
  const log = {}
  await sleep(1200)

  /* ---------- the fixture ---------- */

  const para = (tag, n) =>
    Array.from({ length: n }, (_, i) => [
      `${tag}, paragraph ${i + 1}. Enough words to fill several lines of the column, so the note is a few screens tall and a jump has somewhere to go rather than finding its heading already on screen. The outline is for notes you cannot see all of at once.`,
      ''
    ]).flat()
  const BODY = [
    '# Outline test',
    '',
    'An introduction, before any section begins.',
    '',
    '## First section',
    '',
    ...para('Opening words', 8),
    '### A first sub-section',
    '',
    ...para('Deeper words', 4),
    '## Second section',
    '',
    ...para('Middle words', 6),
    '```sh',
    '## inside a fence',
    'echo "a comment in a script, not a section"',
    '```',
    '',
    ...para('More middle words', 2),
    '## Third section',
    '',
    ...para('Late words', 8),
    '### A second sub-section',
    '',
    ...para('Later words', 4),
    '## Fourth section',
    '',
    ...para('Last words', 10)
  ].join('\n')
  const HEADS = [
    'First section',
    'A first sub-section',
    'Second section',
    'Third section',
    'A second sub-section',
    'Fourth section'
  ]
  const made = await window.lanes.noteCreate('Outline test', '_unfiled')
  const PATH = made.path || '_unfiled/outline-test.md'
  await window.lanes.noteWrite(PATH, BODY)
  const other = await window.lanes.noteCreate('Outline other', '_unfiled')
  await window.lanes.noteWrite(
    other.path || '_unfiled/outline-other.md',
    '# Outline other\n\n## One\n\nA line.\n\n## Two\n\nAnother line.\n'
  )

  await openByName('Outline test')
  // It opens in READ; ⌘E, since this half is held in WRITE.
  if (!content()) key('e')
  for (let i = 0; i < 20 && !lineWith('An introduction'); i++) await sleep(150)
  log.opensInWrite = Boolean(content())
  // One pane, so the margin is real. One pane shows the pane you are IN, so
  // the note's pane is made that one first.
  if (split()) {
    click(notePane())
    await sleep(300)
    click(toggle())
    await sleep(1000)
  }
  log.onePane = !split() && Boolean(content())

  /* ---------- WRITE: what it is made of ---------- */

  log.shown = Boolean(toc())
  // The labels live on the open rows; the shut ticks carry none.
  await openIt()
  log.labels = rows().map((r) => r.getAttribute('title'))
  log.everyHeadingListed = log.labels.join('|') === HEADS.join('|')
  log.dropsTheH1 = !log.labels.includes('Outline test')
  log.dropsTheFencedHeading = !log.labels.some((l) => /inside a fence/.test(l || ''))
  // Every row names a line of the note that IS that heading — the line the
  // jump asks the editor for, and the one READ anchors. The same numbers in
  // both modes are what let the outline not care which one it is in.
  const src = BODY.split('\n')
  log.rowsAreTheNotesOwnLines =
    rows().length > 0 &&
    rows().every((r) => {
      const l = src[Number(r.dataset.outlineLine)] ?? ''
      return /^#{2,3} /.test(l) && l.replace(/^#{2,3} /, '') === r.getAttribute('title')
    })

  /* ---------- it is an overlay: the document does not move ---------- */

  const openLeft = textLeft()
  const openBox = box(toc())
  log.openTextLeft = openLeft
  log.openPanelWidth = Math.round(openBox.width)
  log.openPanelLeft = getComputedStyle(toc()).left
  log.sitsLeftOfTheText = Math.round(openBox.right) <= openLeft
  click(chevron())
  await sleep(600)
  log.closes = !isOpen()
  log.closedPanelWidth = Math.round(box(toc()).width)
  log.closedPanelLeft = getComputedStyle(toc()).left
  // The ticks themselves, not the box around them: the longest one has to stop
  // clear of the column, or the overview is sitting on the words.
  const tickGap = () =>
    textLeft() - Math.max(...rows().map((r) => Math.round(box(r.firstElementChild ?? r).right)))
  log.closedTickGap = tickGap()
  log.ticksClearTheText = tickGap() >= 8
  log.textDidNotMove = textLeft() === openLeft
  // Closed is still the overview: one tick per heading.
  log.closedKeepsEveryRow = rows().length === log.labels.length
  click(chevron())
  await sleep(600)
  log.opensAgain = isOpen()
  log.textStillDidNotMove = textLeft() === openLeft

  /* ---------- with margin it is furniture: a click elsewhere leaves it alone ---------- */

  await openIt()
  await tapIn(visibleProse())
  log.noteClickTookTheCaret = document.activeElement === content()
  log.wideStaysOnAClickInTheNote = isOpen()
  down(document.querySelector('[data-rail-row="note"]'))
  await sleep(400)
  log.wideStaysOnAClickInTheRail = isOpen()

  /* ---------- the document is clickable through the overlay ---------- */

  const overlay = toc().parentElement.parentElement
  log.overlayLetsClicksThrough = getComputedStyle(overlay).pointerEvents === 'none'
  log.panelTakesItsOwn = getComputedStyle(toc()).pointerEvents === 'auto'

  /* ---------- WRITE: the jump, and the mark ---------- */

  // Reading, not writing: a click on a row takes the focus from the words, and
  // the caret's line would otherwise be drawn with its syntax out.
  if (document.activeElement === content()) content().blur()
  scroller().scrollTop = 0
  await sleep(500)
  const writeBefore = scroller().scrollTop
  click(rowTitled(/third section/i))
  // A smooth scroll can take a frame to start, and a scrollport that has not
  // moved yet reads as one that has settled.
  await sleep(150)
  const writeLanded = await settle()
  // The editor measures the lines it has just drawn; give it that frame.
  await sleep(400)
  log.writeScrolled = writeLanded > writeBefore
  const writeHead = lineWith('Third section')
  log.writeHeadingDrawnAsOne = Boolean(writeHead?.classList.contains('cm-md-h2'))
  // Where it landed is measured here and HELD below, against READ's landing on
  // the same heading. The line's own box is logged but is not the measure: its
  // top is air, not heading.
  if (writeHead) {
    const top = box(scroller()).top
    log.writeLineOffset = Math.round(box(writeHead).top - top)
    log.writeRuleOffset = Math.round(
      box(writeHead).top - top + (parseFloat(getComputedStyle(writeHead).backgroundPositionY) || 0)
    )
    log.writeWordsOffset = Math.round(wordsTop(writeHead, 'Third section') - top)
  }
  // The mark follows the reading, not the click.
  await sleep(400)
  log.writeMarks = activeRow()?.getAttribute('title')
  log.writeMarksTheRightOne = /third section/i.test(log.writeMarks || '')
  scroller().scrollTop = 0
  await sleep(500)
  log.writeMarksTheFirstAtTheTop = /first section/i.test(activeRow()?.getAttribute('title') || '')

  /* ---------- READ, by ⌘E: its anchors, its column, its jump ---------- */

  key('e')
  await sleep(900)
  log.readMode = !content() && Boolean(scroller()?.querySelector('[data-md-from]'))
  // One anchor per row, in the same order: that pairing is what makes the
  // active index need no lookup.
  log.anchorsMatchRows = anchors().length === rows().length
  log.anchorsInOrder =
    anchors()
      .map((a) => a.dataset.toc)
      .join(',') === rows().map((r) => 'h' + r.dataset.outlineLine).join(',')
  // ⌘E moves nothing sideways: the editor's column is READ's column.
  scroller().scrollTop = 0
  await sleep(400)
  log.readTextLeft = textLeft()
  log.sameColumnBothModes = Number.isFinite(log.readTextLeft) && Math.abs(log.readTextLeft - openLeft) <= 1

  const readBefore = scroller().scrollTop
  click(rowTitled(/third section/i))
  await sleep(150)
  const readLanded = await settle()
  log.readScrolled = readLanded > readBefore
  const readHead = anchors().find((a) => /third section/i.test(a.textContent || ''))
  if (readHead) {
    const top = box(scroller()).top
    log.headingOffset = Math.round(box(readHead).top - top)
    log.landedAtTheHeading = Math.abs(log.headingOffset - 22) < 6
    log.readWordsOffset = Math.round(wordsTop(readHead, 'Third section') - top)
  }
  // WRITE's jump, held: the same heading, jumped to in each mode, has its words
  // at the same height — so WRITE lands 22px under the top exactly when READ
  // does. The WORDS, not the boxes: READ's `##` keeps its air as a margin above
  // the box the jump measures, while an editor line cannot have a margin and
  // keeps the same air as padding inside its box. Two boxes both at 22px would
  // be two headings 30px apart, and ⌘E would move the one you just went to.
  log.writeLandedAtTheHeading =
    Number.isFinite(log.writeWordsOffset) &&
    Number.isFinite(log.readWordsOffset) &&
    Math.abs(log.writeWordsOffset - log.readWordsOffset) < 6
  await sleep(400)
  log.readMarks = activeRow()?.getAttribute('title')
  log.readMarksTheRightOne = /third section/i.test(log.readMarks || '')
  scroller().scrollTop = 0
  await sleep(500)
  log.readMarksTheFirstAtTheTop = /first section/i.test(activeRow()?.getAttribute('title') || '')

  // Back to WRITE, where a note is: the rest is held there.
  key('e')
  await sleep(900)
  log.backInWrite = Boolean(content())

  /* ---------- no margin: the split ---------- */

  click(toggle())
  await sleep(1000)
  log.splitPanes = [...document.querySelectorAll('[data-pane]')].map((p) => p.dataset.pane)
  log.survivesTheSplit = Boolean(toc())
  // Where the column sits with the outline SHUT, so the shift it makes when it
  // opens can be measured against it.
  await shutIt()
  const narrowLeft = textLeft()
  log.togglesInTheSplitToo = toc()?.dataset.outlineOpen === '0'

  /* ---------- ONE OPEN SHAPE, IN A MARGIN THE PANE MAKES ---------- */
  //
  // There used to be a second: a floating sheet over the left of the text,
  // which is what a narrow pane got, which is to say what a split always got.
  // It covered the words you had opened it to find, it went away on any click
  // outside itself, and it needed a pin to defeat that. Now the column moves
  // over instead, and the panel is furniture with nothing underneath it.
  await openIt()
  log.splitOpen = isOpen()
  log.splitPanelIsNotASheet =
    getComputedStyle(toc()).backgroundColor === 'rgba(0, 0, 0, 0)' &&
    getComputedStyle(toc()).boxShadow === 'none'
  // The whole point: it opens to the LEFT of the words, not over them.
  log.splitPanelRight = Math.round(box(toc()).right)
  log.splitTextLeft = textLeft()
  log.splitOpensToTheLeft = Math.round(box(toc()).right) <= textLeft() + 1
  // And the words moved to make the room, rather than being covered.
  log.narrowTextMovedForIt = textLeft() > narrowLeft

  /* ---------- it stays until it is sent away ---------- */

  const aRow = rows()[1]
  down(aRow)
  click(aRow)
  await sleep(600)
  log.staysOnItsOwnRows = isOpen()
  await tapIn(visibleProse())
  log.splitNoteClickTookTheCaret = document.activeElement === content()
  log.staysOnAClickInTheNote = isOpen()
  down(document.querySelector('[data-rail-row="note"]'))
  await sleep(400)
  log.staysOnAClickInTheRail = isOpen()
  // Escape in the words is the words': with nothing written it is the way out
  // of WRITE, and the outline beside it is not what was asked to go.
  press(content(), 'Escape')
  await sleep(400)
  log.escapeInTheEditorIsTheEditors = document.activeElement !== content() && isOpen()
  // With nothing holding the caret, escape does what a click no longer does.
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
  await sleep(500)
  log.escapeSendsItAway = toc()?.dataset.outlineOpen === '0'
  // As does the chevron beside CONTENTS, which is the other way out.
  click(chevron())
  await sleep(500)
  log.chevronOpensIt = isOpen()
  click(chevron())
  await sleep(500)
  log.chevronClosesIt = toc()?.dataset.outlineOpen === '0'
  // Nothing is pinned any more, because nothing takes it from you.
  click(chevron())
  await sleep(500)
  log.noPinAnywhere = !toc()?.querySelector('[data-toc-pin]')

  // That esc left WRITE; back into it, where the room below was measured.
  key('e')
  await sleep(900)

  // Shut, the tick stack still clears the text and still sits inside the pane —
  // and the room it was given goes back to the words.
  await shutIt()
  {
    const t = rows().map((r) => box(r.firstElementChild ?? r))
    log.narrowTickGap = textLeft() - Math.max(...t.map((r) => Math.round(r.right)))
    log.narrowTicksClearTheText = log.narrowTickGap >= 8
    log.narrowTicksInsideThePane =
      Math.min(...t.map((r) => Math.round(r.left))) >= Math.round(box(notePane()).left)
  }
  log.shutGivesTheRoomBack = textLeft() === narrowLeft

  /* ---------- the preference is per TAB, and unchosen means "ask the margin" ---------- */

  // Open again: this tab now has a chosen answer to come back to.
  await openIt()
  log.chosenOpen = isOpen()
  // A second note, in a tab of its own: nobody has chosen there, and there is
  // no margin in a split, so it starts closed.
  await openByName('Outline other', true)
  const tabs = () => [...(notePane()?.querySelectorAll('[data-tab]') ?? [])]
  const onTab = () => tabs().find((t) => t.dataset.tabOn === '1')
  log.otherInItsOwnTab =
    tabs().length >= 2 && /Outline other/.test(onTab()?.getAttribute('title') || '')
  log.otherStartsClosed = toc()?.dataset.outlineOpen === '0'
  // Back to the first tab: it still remembers what was chosen there.
  click(tabs().find((t) => /Outline test/.test(t.getAttribute('title') || '')))
  await sleep(900)
  log.backOnTheFirstTab = /Outline test/.test(onTab()?.getAttribute('title') || '')
  log.tabKeepsItsAnswer = isOpen()

  /* ---------- a thread has none ---------- */

  // A thread of its own, made here: a throwaway state has none to click on in
  // the rail, and an empty pane has no outline for a reason that proves nothing.
  // ⌘T makes one in whichever pane you are in, so the thread pane is gone to
  // first. It is left unsent, so no turn is spent.
  click(document.querySelector('[data-pane="0"]'))
  await sleep(300)
  key('t')
  await sleep(1600)
  // Asked of the tab's title, which says what kind of tab it is even when the
  // strip is too narrow for the name and draws a monogram instead.
  const threadOn = document.querySelector('[data-pane="0"] [data-tab-on="1"]')
  log.threadUp = /^Thread\b/.test(threadOn?.getAttribute('title') || '')
  log.threadHasNoOutline =
    log.threadUp &&
    !document.querySelector('[data-pane="0"] [data-outline]') &&
    document.querySelectorAll('[data-pane="0"] [data-toc^="h"]').length === 0

  // Nothing above typed a character into the note.
  log.fileUntouched = ((await window.lanes.note(PATH))?.body ?? '') === BODY

  log.pass =
    log.opensInWrite &&
    log.onePane &&
    log.shown &&
    log.everyHeadingListed &&
    log.dropsTheH1 &&
    log.dropsTheFencedHeading &&
    log.rowsAreTheNotesOwnLines &&
    log.sitsLeftOfTheText &&
    log.closes &&
    log.ticksClearTheText &&
    log.textDidNotMove &&
    log.closedKeepsEveryRow &&
    log.opensAgain &&
    log.textStillDidNotMove &&
    log.noteClickTookTheCaret &&
    log.wideStaysOnAClickInTheNote &&
    log.wideStaysOnAClickInTheRail &&
    log.overlayLetsClicksThrough &&
    log.panelTakesItsOwn &&
    log.writeScrolled &&
    log.writeHeadingDrawnAsOne &&
    log.writeLandedAtTheHeading &&
    log.writeMarksTheRightOne &&
    log.writeMarksTheFirstAtTheTop &&
    log.readMode &&
    log.anchorsMatchRows &&
    log.anchorsInOrder &&
    log.sameColumnBothModes &&
    log.readScrolled &&
    log.landedAtTheHeading &&
    log.readMarksTheRightOne &&
    log.readMarksTheFirstAtTheTop &&
    log.backInWrite &&
    log.survivesTheSplit &&
    log.togglesInTheSplitToo &&
    log.splitOpen &&
    log.splitPanelIsNotASheet &&
    log.splitOpensToTheLeft &&
    log.narrowTextMovedForIt &&
    log.staysOnItsOwnRows &&
    log.splitNoteClickTookTheCaret &&
    log.staysOnAClickInTheNote &&
    log.staysOnAClickInTheRail &&
    log.escapeInTheEditorIsTheEditors &&
    log.escapeSendsItAway &&
    log.chevronOpensIt &&
    log.chevronClosesIt &&
    log.noPinAnywhere &&
    log.narrowTicksClearTheText &&
    log.narrowTicksInsideThePane &&
    log.shutGivesTheRoomBack &&
    log.chosenOpen &&
    log.otherInItsOwnTab &&
    log.otherStartsClosed &&
    log.backOnTheFirstTab &&
    log.tabKeepsItsAnswer &&
    log.threadHasNoOutline &&
    log.fileUntouched
  return log
})()
