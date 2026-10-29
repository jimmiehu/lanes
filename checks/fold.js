// COLLAPSIBLE SECTIONS IN A NOTE, and the things a fold interacts with.
//
// `checks/details.mjs` proves the parse — including the spans, which is the
// part that can go quietly wrong. This proves the rest, in the app.
//
// READ draws a real disclosure rather than the tags, honours `open` from the
// source, and keeps its own open state through a redraw of the note. The
// things that look INSIDE a note still work when part of it is folded away:
// the outline's jump opens the fold it lands in, the reading mark stays on the
// section you are actually reading rather than on a heading nobody can see, and
// ⌘F opens the fold its match is in.
//
// The spans inside a fold are the note's own line numbers, and this asks them
// by line rather than by "somewhere past line 20": they are what a copy turns
// back into markdown and — now that READ edits nothing — what a double-click
// uses to put the caret on the line it asked to write on. So a double-click on
// a paragraph inside a fold lands the editor on THAT line.
//
// And WRITE has nothing to fold. The editor is the source: the tags are lines
// of text you can edit, and what is inside them is on screen, never shut away
// behind a disclosure while you write. A note opens in READ; this starts in
// WRITE, by ⌘E, and presses ⌘E again for READ. Its redraw is a real one: the old version
// ticked an `input[type=checkbox]` READ never draws, so the fold "survived" a
// redraw that never happened.
//
// Seeds its own note through the app's IPC. Run against a throwaway LANES_VAULT
// and LANES_STATE. See checks/README.md.
(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
  const click = (el) => el && el.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  const pane = (i) => document.querySelector(`[data-pane="${i}"]`)
  const key = (k, extra = {}) =>
    window.dispatchEvent(new KeyboardEvent('keydown', { key: k, metaKey: true, bubbles: true, ...extra }))
  const content = () => pane(1)?.querySelector('.cm-content')
  const lines = () => [...(pane(1)?.querySelectorAll('.cm-line') ?? [])]
  const lineWith = (s) => lines().find((l) => l.textContent.includes(s))
  const scroller = () => pane(1)?.querySelector('[data-find-scope]')
  const folds = () => [...(pane(1)?.querySelectorAll('details.fold') ?? [])]
  const summaryOf = (f) => f?.querySelector(':scope > summary') ?? null
  const outline = () => document.querySelector('[data-outline="1"]')
  const mode = (m) => pane(1)?.querySelector(`[data-mode="${m}"]`)?.dataset.on === '1'
  const setIn = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
  const log = {}

  // Filler after the last section, so the note is taller than the pane and the
  // reading mark has somewhere to be scrolled to.
  const FILLER = Array.from(
    { length: 40 },
    (_, i) => `Filler paragraph ${i + 1}, here so the note is taller than the pane and can be scrolled.`
  )
  const BODY = [
    '# Fold check',
    '',
    'Prose above everything, and a task to tick while a section is open.',
    '',
    '- [ ] a task outside the fold',
    '',
    '## Before',
    '',
    'The section the reader is in when the mark is read.',
    '',
    '<details>',
    '<summary>More about it</summary>',
    '',
    'Prose inside the fold.',
    '',
    '- a folded item',
    '- another folded item',
    '',
    '### Inside heading',
    '',
    '<details open>',
    '<summary>Nested and open</summary>',
    '',
    'Nested prose.',
    '',
    '</details>',
    '',
    '</details>',
    '',
    '## After',
    '',
    ...FILLER.flatMap((p) => [p, ''])
  ].join('\n')
  const LINES = BODY.split('\n')
  /** The line a piece of source sits on — what every span has to agree with. */
  const at = (s) => LINES.indexOf(s)

  // --- seed it, and open it the way a person would: by finding it ---
  const made = await window.lanes.noteCreate('Fold check', '_unfiled')
  const PATH = made.path || '_unfiled/fold-check.md'
  await window.lanes.noteWrite(PATH, BODY)
  key('k')
  await sleep(600)
  const box = document.querySelector('[data-palette-input]')
  setIn.call(box, 'Fold check')
  box.dispatchEvent(new Event('input', { bubbles: true }))
  await sleep(1000)
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
  await sleep(1800)
  // A note opens in READ; writing is asked for, with ⌘E.
  if (!content()) key('e')
  for (let i = 0; i < 15 && !lineWith('Prose inside the fold'); i++) await sleep(200)

  /* ---------- 0. WRITE: nothing is folded away while you write ---------- */

  log.opensInTheEditor = Boolean(content())
  log.writeHasNoDisclosure = !pane(1)?.querySelector('details')
  // The tags are lines of text, as written — the only way to edit a fold.
  log.writeShowsTheTags = lineWith('<details>')?.textContent === '<details>' && Boolean(lineWith('</details>'))
  // And what is inside the section is there to write in, nested fold included.
  log.writeShowsWhatIsInside =
    Boolean(lineWith('Prose inside the fold')) && Boolean(lineWith('a folded item')) && Boolean(lineWith('Nested prose'))

  for (let i = 0; i < 2 && !mode('READ'); i++) {
    key('e')
    await sleep(800)
  }
  log.inRead = mode('READ') && !content()
  if (!log.inRead) return { ...log, pass: false }

  /* ---------- 1. READ: a disclosure, not the tags ---------- */

  log.folds = folds().length
  // textContent, not innerText: a closed fold's body is still in the DOM, and
  // a tag left in there would be missed by anything that reads only what shows.
  const drawn = scroller()?.textContent
  log.tagsAreGone = typeof drawn === 'string' && !/<\/?(details|summary)/i.test(drawn)
  log.summary = summaryOf(folds()[0])?.textContent.trim()
  log.summaryIsTheNotes = log.summary === 'More about it'
  log.startsClosed = folds()[0]?.open === false
  // `open` in the source opens it.
  log.nestedStartsOpen = folds()[1]?.open === true
  // The browser's own element, so it is keyboard operable and announced.
  log.isNativeDetails = folds()[0]?.tagName === 'DETAILS'

  /* ---------- 2. its body is the note's, line for line ---------- */

  // The wrapper that holds `s` and is not itself a fold — the block, not the
  // section around it.
  const spanOf = (s) => {
    const w = [...(folds()[0]?.querySelectorAll('[data-md-from]') ?? [])].find(
      (d) => d.textContent.includes(s) && !d.querySelector('details')
    )
    return w ? Number(w.dataset.mdFrom) : -1
  }
  log.spans = {
    para: [spanOf('Prose inside the fold'), at('Prose inside the fold.')],
    item: [spanOf('a folded item'), at('- a folded item')],
    heading: [spanOf('Inside heading'), at('### Inside heading')],
    nested: [spanOf('Nested prose'), at('Nested prose.')]
  }
  // Each one the line it came from in the NOTE — not the folded body's own
  // numbering, which starts again at zero, and not the nested fold's.
  log.spansAreTheNotesOwn = Object.values(log.spans).every(([got, want]) => want > 0 && got === want)

  /* ---------- 3. it keeps its state through a redraw ---------- */

  click(summaryOf(folds()[0]))
  await sleep(500)
  log.opensOnClick = folds()[0]?.open === true
  // Ticking a box rewrites the note and redraws every block. A section must
  // not slam shut because you touched something else.
  const tick = () => scroller()?.querySelector('.task-box')
  click(tick())
  await sleep(1000)
  // The redraw really happened: the box is drawn ticked now.
  log.tickLanded = Boolean(tick()?.querySelector('svg'))
  log.survivesARedraw = log.tickLanded && folds()[0]?.open === true
  click(tick())
  await sleep(800)

  /* ---------- 4. the reading mark, with a heading folded out of sight ---------- */

  click(summaryOf(folds()[0]))
  await sleep(400)
  log.shutAgain = folds()[0]?.open === false

  if (outline()?.dataset.outlineOpen === '0') {
    click(outline().querySelector('.toc-ticks'))
    await sleep(700)
  }
  log.outlineOpen = outline()?.dataset.outlineOpen === '1'

  // `## Before` just above the line the mark is read at, `## After` well below
  // it, and `### Inside heading` — shut in the fold between them — with no box
  // at all. Read as a position, its zeros sit above the line too, and the mark
  // lands on a section nobody can see.
  const sc = scroller()
  const before = sc?.querySelector(`[data-toc="h${at('## Before')}"]`)
  if (sc && before) {
    sc.scrollTop += before.getBoundingClientRect().top - sc.getBoundingClientRect().top - 8
    await sleep(600)
  }
  const on = outline()?.querySelector('[data-outline-on="1"]')
  log.markOn = on ? Number(on.dataset.outlineLine) : null
  log.markStaysOnTheSectionYouAreIn = log.markOn === at('## Before')

  /* ---------- 5. the outline's jump reaches into a closed one ---------- */

  const row = outline()?.querySelector(`.toc-row[data-outline-line="${at('### Inside heading')}"]`)
  log.outlineListsTheFoldedHeading = Boolean(row)
  click(row)
  await sleep(900)
  // Going to a section is asking to see it.
  log.outlineOpenedTheFold = folds()[0]?.open === true

  /* ---------- 6. and so does find ---------- */

  click(summaryOf(folds()[0]))
  await sleep(400)
  log.shutForFind = folds()[0]?.open === false
  key('f')
  await sleep(600)
  const field =
    pane(1)?.querySelector('input[placeholder^="Find"]') ?? document.querySelector('input[placeholder^="Find"]')
  log.findBarInTheNotePane = Boolean(pane(1)?.contains(field))
  if (field) {
    setIn.call(field, 'folded item')
    field.dispatchEvent(new Event('input', { bubbles: true }))
    await sleep(1200)
  }
  // The phrase only exists inside the closed fold, so finding it has to open it.
  log.findOpenedTheFold = folds()[0]?.open === true
  field?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))
  await sleep(400)

  /* ---------- 7. a double-click inside it writes on THAT line ---------- */

  // The span is the whole route from the pointer to the source: a fold that
  // numbered its own lines from zero would put the caret near the top of the
  // note instead.
  const para = [...(folds()[0]?.querySelectorAll('[data-md-from]') ?? [])].find((d) =>
    d.textContent.includes('Prose inside the fold')
  )?.firstElementChild
  if (para) {
    para.scrollIntoView({ block: 'center' })
    await sleep(300)
    const r = para.getBoundingClientRect()
    para.dispatchEvent(
      new MouseEvent('dblclick', {
        bubbles: true,
        cancelable: true,
        clientX: r.left + 20,
        clientY: r.top + r.height / 2,
        detail: 2,
        view: window
      })
    )
    await sleep(1000)
  }
  log.doubleClickWrites = mode('WRITE') && Boolean(content())
  const line = lineWith('Prose inside the fold')
  const sel = window.getSelection()
  log.caretOnThatLine = Boolean(line && sel?.anchorNode && line.contains(sel.anchorNode))
  // Where in the line, for the record; the claim here is the line.
  if (log.caretOnThatLine) {
    const r = document.createRange()
    r.setStart(line, 0)
    r.setEnd(sel.anchorNode, sel.anchorOffset)
    log.caretColumn = r.toString().length
  }

  log.pass =
    log.opensInTheEditor &&
    log.writeHasNoDisclosure &&
    log.writeShowsTheTags &&
    log.writeShowsWhatIsInside &&
    log.inRead &&
    log.folds >= 2 &&
    log.tagsAreGone &&
    log.summaryIsTheNotes &&
    log.startsClosed &&
    log.nestedStartsOpen &&
    log.isNativeDetails &&
    log.spansAreTheNotesOwn &&
    log.opensOnClick &&
    log.survivesARedraw &&
    log.shutAgain &&
    log.outlineOpen &&
    log.markStaysOnTheSectionYouAreIn &&
    log.outlineListsTheFoldedHeading &&
    log.outlineOpenedTheFold &&
    log.shutForFind &&
    log.findOpenedTheFold &&
    log.doubleClickWrites &&
    log.caretOnThatLine
  return log
})()
