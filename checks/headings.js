// The four heading levels, told apart at skimming speed — and the same four in
// WRITE and in READ.
//
// They were not. `##` was 9px mono in `--mute` — smaller and quieter than the
// body text under it — and `###` was 12px against a 13.5px body, so the two
// headings a long note actually uses were both LESS present than the prose they
// were meant to divide. And `####` was not a heading at all: `#{1,3}` matched
// nothing on a four-hash line, so the note showed the hashes as words.
//
// WHAT THE REBUILD CHANGED. This measured READ, which was where a note opened;
// WRITE was a textarea whose painted mirror could make a heading bold but never
// bigger, or the caret walked away from the words. WRITE is now a
// CodeMirror editor that lays its own lines out — and its type is READ's, size
// for size, so the ladder is held there first: `####` a heading, `###` over the
// prose, `##` mono caps at full ink over a hairline that runs the measure (in
// the editor the rule is painted 30px down the line's own box, which is where
// its air lives), the hashes hidden. Then what only WRITE has: on the line the
// caret is in, the `##` comes back and hangs in the left margin — showing it
// moves no word — and the heading keeps its caps, since a heading that
// changed its letters as the caret crossed it would flicker under the eye,
// until Escape lets go of it and the hashes are put away. (A driven window that is not
// in front cannot see that blur, so there the check asks for the redraw itself
// and says so in `windowInFront`.) Then ⌘E,
// the same ladder in READ, and every level the SAME SIZE in both, since ⌘E must
// not change the size of a single word. The outline still echoes the page.
//
// Seeds its own note through the app's IPC: prose, then `##`, `###` and `####`
// with a paragraph under each, and a second `# h1` further down (the note's own
// title is the head's, so there is no first one to measure). Run against a
// throwaway LANES_VAULT and LANES_STATE. See checks/README.md.
(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
  const click = (el) => el && el.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  const key = (k, extra = {}) =>
    window.dispatchEvent(new KeyboardEvent('keydown', { key: k, metaKey: true, bubbles: true, ...extra }))
  const pane = () => document.querySelector('[data-pane="1"]')
  const content = () => pane()?.querySelector('.cm-content')
  const lines = () => [...(pane()?.querySelectorAll('.cm-line') ?? [])]
  const lineWith = (s) => lines().find((l) => l.textContent.includes(s))
  const px = (el, prop) => (el ? parseFloat(getComputedStyle(el)[prop]) : NaN)
  const css = (el, prop) => (el ? getComputedStyle(el)[prop] : '')
  const press = (el, k, mods = {}) =>
    el?.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...mods }))
  /** The text node inside `el` that holds `s` — the words, not a hidden mark beside them. */
  const wordsIn = (el, s) => {
    if (!el) return null
    const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
    let n
    while ((n = walk.nextNode())) if (n.data.includes(s)) return n
    return null
  }
  /** Where the first letter of `s` is drawn, from its own glyph box. */
  const leftOf = (el, s) => {
    const n = wordsIn(el, s)
    if (!n) return NaN
    const i = n.data.indexOf(s)
    const r = document.createRange()
    r.setStart(n, i)
    r.setEnd(n, i + 1)
    return r.getBoundingClientRect().left
  }
  /**
   * THE CARET GOES WHERE A CLICK PUTS IT — through the editor's own pointer
   * handling, as a person's does. Setting the page's selection directly is not
   * the same act: the editor only adopts a DOM selection while its window is
   * the front one, and a driven run cannot promise that.
   */
  const caretIn = async (s, at = 1) => {
    const n = wordsIn(lineWith(s), s)
    if (!n) return false
    const r = document.createRange()
    const a = n.data.indexOf(s) + at
    r.setStart(n, a)
    r.setEnd(n, a + 1)
    const box = r.getBoundingClientRect()
    const x = box.left + 0.5
    const y = box.top + box.height / 2
    const ev = { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0, detail: 1, view: window }
    ;(document.elementFromPoint(x, y) ?? n.parentElement).dispatchEvent(new MouseEvent('mousedown', ev))
    document.dispatchEvent(new MouseEvent('mouseup', ev))
    await sleep(250)
    return document.activeElement === content()
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
    await sleep(1800)
    return true
  }
  const log = {}
  await sleep(1200)

  const TITLE = 'The shape of a long note'
  const BODY = [
    `# ${TITLE}`,
    '',
    'Prose under the title, before any section begins.',
    '',
    '## The first section',
    '',
    'Prose under the first section, long enough to run the width of the column and wrap onto a second line, so the measure it is compared against is the real one.',
    '',
    '### A sub-section',
    '',
    'Prose under the sub-section.',
    '',
    '#### And one below that',
    '',
    'Prose under the fourth level.',
    '',
    '# A second top-level heading',
    '',
    'Prose after the second h1.',
    ''
  ].join('\n')
  const made = await window.lanes.noteCreate(TITLE, '_unfiled')
  const PATH = made.path || '_unfiled/the-shape-of-a-long-note.md'
  await window.lanes.noteWrite(PATH, BODY)

  await openByName(TITLE)
  // It opens in READ; the editor's half comes first here, so ⌘E.
  if (!content()) key('e')
  for (let i = 0; i < 20 && !lineWith('Prose after the second h1'); i++) await sleep(150)
  log.opensInWrite = Boolean(content())
  if (!log.opensInWrite) return { ...log, pass: false }

  /* ---------- WRITE: the ladder, with the caret somewhere else ---------- */

  // The caret is not in the editor yet, so every mark is put away — which is
  // how a heading reads when you are not standing in it.
  log.writeUnfocused = document.activeElement !== content()
  const w = {
    h1: lineWith('A second top-level heading'),
    h2: lineWith('The first section'),
    h3: lineWith('A sub-section'),
    h4: lineWith('And one below that'),
    body: lineWith('Prose under the first section')
  }
  log.writeMissing = Object.fromEntries(Object.entries(w).map(([k, v]) => [k, !v]))
  log.writeLevels = {
    h1: w.h1?.classList.contains('cm-md-h1'),
    h2: w.h2?.classList.contains('cm-md-h2'),
    h3: w.h3?.classList.contains('cm-md-h3'),
    h4: w.h4?.classList.contains('cm-md-h4')
  }
  log.writeEveryLevelIsAHeading = Object.values(log.writeLevels).every(Boolean)
  // `####` is a heading, and no hashes are on screen anywhere.
  log.writeHashesAreGone = !(content()?.innerText ?? '#').includes('#')

  log.writeSizes = {
    h1: px(w.h1, 'fontSize'),
    h2: px(w.h2, 'fontSize'),
    h3: px(w.h3, 'fontSize'),
    h4: px(w.h4, 'fontSize'),
    body: px(w.body, 'fontSize')
  }
  const ws = log.writeSizes
  log.writeH1IsTheLargest = ws.h1 > ws.h3 && ws.h3 > ws.h4
  log.writeH3OutrunsTheProse = ws.h3 > ws.body
  log.writeEveryHeadingIsBold = [w.h1, w.h2, w.h3, w.h4].every((el) => Number(css(el, 'fontWeight')) >= 600)

  // `##` opens a section: uppercase, tracked, mono — at full ink.
  log.writeH2IsMonoCaps =
    /mono|SF Mono|Menlo|monospace/i.test(css(w.h2, 'fontFamily')) &&
    css(w.h2, 'textTransform') === 'uppercase' &&
    px(w.h2, 'letterSpacing') > 1
  log.writeH2Colour = css(w.h2, 'color')
  log.writeBodyColour = css(w.body, 'color')
  log.writeH2IsNotQuieterThanTheProse = log.writeH2Colour !== log.writeBodyColour
  // The rule. A line in the editor cannot carry a margin — CodeMirror measures
  // line boxes, and a margin is outside them — so the air and the hairline are
  // both inside the line: a 1px band painted down its padding.
  log.writeH2Rule = {
    image: css(w.h2, 'backgroundImage'),
    size: css(w.h2, 'backgroundSize'),
    at: css(w.h2, 'backgroundPositionY')
  }
  log.writeH2HasARule = /gradient/.test(log.writeH2Rule.image) && /1px/.test(log.writeH2Rule.size)
  // The measure is the column the words are set in — the editor's own — not the
  // line beside it: every line in the editor is as wide as every other, so that
  // comparison could never fail.
  log.writeH2RuleRunsTheMeasure =
    Boolean(w.h2 && content()) &&
    /^100%/.test(log.writeH2Rule.size) &&
    Math.abs(w.h2.getBoundingClientRect().width - content().getBoundingClientRect().width) < 2
  log.writeH2HasAirAboveTheRule = parseFloat(log.writeH2Rule.at) >= 20

  /* ---------- WRITE: the heading you are standing in ---------- */

  const wordsLeftAway = leftOf(lineWith('The first section'), 'The first section')
  log.caretOnTheH2 = await caretIn('The first section', 4)
  const here = lineWith('The first section')
  const mark = here?.querySelector('.cm-md-hmark')
  log.hashesShowWhereYouAre = Boolean(here?.innerText.includes('##'))
  // Still in caps: standing in a heading is not a reason for its letters to
  // change under the caret.
  log.keepsItsCapsWhereYouAre = css(here, 'textTransform') === 'uppercase'
  // The hashes hang in the margin, so showing them moves no word.
  const wordsLeftHere = leftOf(here, 'The first section')
  log.wordsLeft = { away: Math.round(wordsLeftAway), here: Math.round(wordsLeftHere) }
  log.showingThemMovesNothing = Math.abs(wordsLeftAway - wordsLeftHere) < 1
  log.hashesHangInTheMargin =
    Boolean(mark) && mark.getBoundingClientRect().right <= wordsLeftHere + 0.5
  // Every other heading keeps its hashes put away.
  log.onlyThatOne = !(lineWith('A sub-section')?.innerText ?? '#').includes('#')
  // The caret let go of: a blur, which is what esc used to be here. Esc is the
  // way out of WRITE now, and this is about the heading in it.
  content()?.blur()
  await sleep(400)
  // What puts the hashes away is the editor seeing that it lost the focus, and
  // it asks the WINDOW as well as the page — so in a driven run whose window is
  // not the front one it never sees it, and draws nothing new. That is the
  // harness, not the note: in front, the blur alone redraws, and is what is
  // held. Behind, the next redraw is asked for by the focus aid, on and off
  // again, which changes nothing but the editor's options — and the claim is
  // the same either way: the line is drawn from where the focus IS, not from
  // where the caret last stood.
  log.windowInFront = document.hasFocus()
  if (!log.windowInFront) {
    const aid = pane()?.querySelector('[data-aid="focus"]')
    click(aid)
    await sleep(200)
    click(aid)
    await sleep(300)
    log.redrawAskedForByTheFocusAid = Boolean(aid)
  }
  log.putAwayWhenYouLeave =
    document.activeElement !== content() && !(lineWith('The first section')?.innerText ?? '#').includes('#')

  /* ---------- READ, by ⌘E: the same ladder, the same sizes ---------- */

  key('e')
  await sleep(900)
  const blocks = [...(pane()?.querySelectorAll('[data-md-from] > *') ?? [])]
  const byText = (re) => blocks.find((b) => re.test(b.textContent || ''))
  // NOT the note's own title: the head says that, so the document drops it.
  // A second h1 further down is a heading somebody wrote, and it stays.
  const r = {
    h1: byText(/^A second top-level heading$/),
    h2: byText(/^The first section$/),
    h3: byText(/^A sub-section$/),
    h4: byText(/^And one below that$/),
    body: byText(/^Prose under the first section/)
  }
  log.readMode = !content() && blocks.length > 0
  log.readMissing = Object.fromEntries(Object.entries(r).map(([k, v]) => [k, !v]))
  // It used to render as a paragraph reading "#### And one below that".
  log.readHashesAreGone = !(pane()?.innerText ?? '').includes('#### ')
  log.readH4Exists = Boolean(r.h4)
  log.readSizes = {
    h1: px(r.h1, 'fontSize'),
    h2: px(r.h2, 'fontSize'),
    h3: px(r.h3, 'fontSize'),
    h4: px(r.h4, 'fontSize'),
    body: px(r.body, 'fontSize')
  }
  const rs = log.readSizes
  log.readH1IsTheLargest = rs.h1 > rs.h3 && rs.h3 > rs.h4
  log.readH3OutrunsTheProse = rs.h3 > rs.body
  log.readEveryHeadingIsBold = [r.h1, r.h2, r.h3, r.h4].every((el) => Number(css(el, 'fontWeight')) >= 600)
  log.readH2IsMonoCaps =
    /mono|SF Mono|Menlo|monospace/i.test(css(r.h2, 'fontFamily')) &&
    css(r.h2, 'textTransform') === 'uppercase' &&
    px(r.h2, 'letterSpacing') > 1
  log.readH2IsNotQuieterThanTheProse = css(r.h2, 'color') !== css(r.body, 'color')
  // The thing the eye actually catches: a rule across the measure.
  log.readH2HasARule = px(r.h2, 'borderTopWidth') >= 1
  // Against the document's column, for the same reason as in WRITE: a block is
  // as wide as the paragraph under it by default. The span marker around each
  // block draws no box, so the column is the one it sits in.
  const readColumn = r.h2?.closest('[data-md-from]')?.parentElement
  log.readH2RuleRunsTheMeasure =
    Boolean(r.h2 && readColumn) &&
    Math.abs(r.h2.getBoundingClientRect().width - readColumn.getBoundingClientRect().width) < 2
  log.readH2HasAirAboveIt = px(r.h2, 'marginTop') >= 20

  // ⌘E does not change the size of a single word.
  log.sameSizeBothModes = ['h1', 'h2', 'h3', 'h4', 'body'].every(
    (k) => ws[k] > 0 && Math.abs(ws[k] - rs[k]) < 0.5
  )

  /* ---------- and the outline reads at the same volume ---------- */

  const o = document.querySelector('[data-outline="1"]')
  if (o && o.dataset.outlineOpen === '0') {
    click(o.querySelector('.toc-ticks'))
    await sleep(700)
  }
  const tocRows = [...document.querySelectorAll('[data-outline="1"] [data-outline-line]')]
  log.outlineRows = tocRows.length
  const tocH2 = tocRows.find((row) => /first section/i.test(row.textContent || ''))
  log.outlineEchoesTheDocument =
    Boolean(tocH2) && css(tocH2.lastElementChild, 'textTransform') === 'uppercase'

  // Back to WRITE, where this tab opened; nothing typed means nothing written.
  key('e')
  await sleep(700)
  log.fileUntouched = ((await window.lanes.note(PATH))?.body ?? '') === BODY

  log.pass =
    log.opensInWrite &&
    log.writeEveryLevelIsAHeading &&
    log.writeHashesAreGone &&
    log.writeH1IsTheLargest &&
    log.writeH3OutrunsTheProse &&
    log.writeEveryHeadingIsBold &&
    log.writeH2IsMonoCaps &&
    log.writeH2IsNotQuieterThanTheProse &&
    log.writeH2HasARule &&
    log.writeH2RuleRunsTheMeasure &&
    log.writeH2HasAirAboveTheRule &&
    log.caretOnTheH2 &&
    log.hashesShowWhereYouAre &&
    log.keepsItsCapsWhereYouAre &&
    log.showingThemMovesNothing &&
    log.hashesHangInTheMargin &&
    log.onlyThatOne &&
    log.putAwayWhenYouLeave &&
    log.readMode &&
    log.readHashesAreGone &&
    log.readH4Exists &&
    log.readH1IsTheLargest &&
    log.readH3OutrunsTheProse &&
    log.readEveryHeadingIsBold &&
    log.readH2IsMonoCaps &&
    log.readH2IsNotQuieterThanTheProse &&
    log.readH2HasARule &&
    log.readH2RuleRunsTheMeasure &&
    log.readH2HasAirAboveIt &&
    log.sameSizeBothModes &&
    log.outlineEchoesTheDocument &&
    log.fileUntouched
  return log
})()
