// ⌘F finds inside the pane you are in, and ⌘G walks the matches — including
// when the caret has left the field.
//
// And the bar STAYS. It is mounted outside the pane's scrollport wrapper now:
// the compact bar is absolute at that wrapper's top and z-indexed over
// everything in flow, so the moment you scrolled past the head — which is the
// moment you reach the second match — the title bar slid in over the field you
// were typing in. It had not gone anywhere; you could not see or reach it.
//
// The marks are amber, which is the one hue this app allows itself. Grey put a
// match in the same ramp as a code block, a quote, a hover and a selected row.
//
// A NOTE IN WRITE IS SEARCHED THROUGH ITS EDITOR. The editor draws only the
// lines near the screen, so most of a long note is not in the DOM at all, and
// a find that walked the page's text would count a screenful and call it the
// note. The bar hands the query to the editor instead: every line is counted,
// drawn or not; the marks are the editor's own (`.cm-find`, the current one
// `.cm-find-now`) in the same two tokens; and stepping to a hit far down the
// note brings it up, centred, rather than advancing a counter over a mark
// nobody can see. The bar itself — the field, the count, ↵, ⌘G, ⇧⌘G — is the
// one it always was, and READ is still found the way a thread is. The two
// modes agree on the count, and the head's title is counted by neither: it
// is chrome to the bar in READ, and the editor hides that line in WRITE, so a
// hit there would be a "1/5" whose first mark could never be shown.
//
// The thread half wants a transcript that says "the" a few times — the thread
// fixture has one. The note half seeds its own note through the app's IPC, a
// write into whichever vault that is, so the check sends that note to the
// system Trash when it finishes, and leaves a vault as it found it. A run
// that dies part way leaves `_unfiled/lodestar-find-check.md` behind; the next
// run finds the name taken, writes over that same file, and trashes it.
// See checks/README.md for how to run it.
(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
  const pane = (i = 0) => document.querySelector(`[data-pane="${i}"]`)
  // The pane head carries data-find-skip as well, being chrome; the bar is the
  // one with the find field in it.
  const bar = (i = 0) =>
    [...(pane(i)?.querySelectorAll('[data-find-skip="1"]') ?? [])].find((d) =>
      d.querySelector('input[placeholder^="Find"]')
    )
  const field = (i = 0) => bar(i)?.querySelector('input')
  // "3/17" or "none" — the bar's own counter, which is where `at` shows.
  const counter = (i = 0) => {
    const t = bar(i)?.innerText ?? ''
    const m = /(\d+)\/(\d+)/.exec(t)
    return m ? { at: Number(m[1]), total: Number(m[2]) } : null
  }
  const cmd = (k, shift) =>
    window.dispatchEvent(
      new KeyboardEvent('keydown', { key: k, metaKey: true, shiftKey: !!shift, bubbles: true })
    )
  const click = (el) => el && el.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  const set = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
  const content = () => pane(1)?.querySelector('.cm-content')
  const lines = () => [...(pane(1)?.querySelectorAll('.cm-line') ?? [])]
  const lineWith = (s) => lines().find((l) => l.textContent.includes(s))
  const log = {}

  // The note half's note, seeded first so nothing the thread half does waits
  // on it. The needle is in the title as well as the body, on purpose — see
  // the header. Filler between the hits pushes the later ones thousands of
  // pixels below the first screen, where the editor draws nothing.
  const NEEDLE = 'lodestar'
  const NAME = 'Lodestar find check'
  const filler = (from, n) =>
    Array.from({ length: n }, (_, i) => [`Filler paragraph ${from + i}, with nothing in it worth finding.`, ''])
      .flat()
  const BODY = [
    `# ${NAME}`,
    '',
    'The first lodestar is here, and a second lodestar sits beside it.',
    '',
    ...filler(1, 150),
    'MERIDIAN holds the third lodestar, far below the first screen.',
    '',
    ...filler(151, 150),
    'ZENITH holds the fourth lodestar, further down again.',
    '',
    ...filler(301, 40)
  ].join('\n')
  // What a reader would count: the body under the title, not the title.
  const EXPECTED = (BODY.slice(BODY.indexOf('\n\n') + 2).toLowerCase().match(new RegExp(NEEDLE, 'g')) ?? []).length
  const made = await window.lanes.noteCreate(NAME, '_unfiled')
  const PATH = made.path || '_unfiled/lodestar-find-check.md'
  await window.lanes.noteWrite(PATH, BODY)

  await sleep(2800)

  // A thread in pane A, if the state did not restore one.
  const threadText = () => (pane(0)?.querySelector('[data-find-scope]')?.innerText ?? '').length
  if (threadText() < 200) {
    click(document.querySelector('[data-rail-row="chat"]'))
    await sleep(1500)
  }
  log.threadPaneHasText = threadText() >= 200

  log.closedAtRest = !bar()
  cmd('f')
  await sleep(600)
  log.opens = Boolean(bar())
  log.fieldTakesCaret = document.activeElement === field()

  // A word the transcript is sure to hold.
  set.call(field(), 'the')
  field().dispatchEvent(new Event('input', { bubbles: true }))
  await sleep(700)
  const first = counter()
  log.counts = Boolean(first && first.total > 2)
  log.firstMatch = first

  // Enter steps, and so does ⌘G.
  field().dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))
  await sleep(400)
  log.afterEnter = counter()?.at
  cmd('g')
  await sleep(400)
  log.afterCmdG = counter()?.at
  log.cmdGStepped = log.afterCmdG === log.afterEnter + 1

  // ⇧⌘G goes back.
  cmd('g', true)
  await sleep(400)
  log.afterShiftCmdG = counter()?.at
  log.shiftCmdGStepsBack = log.afterShiftCmdG === log.afterEnter

  // The caret leaves the field — ⌘G must still work, which is the whole point.
  document.activeElement?.blur?.()
  const body = pane().querySelector('[data-find-scope]')
  body?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  await sleep(300)
  log.caretLeftTheField = document.activeElement !== field()
  cmd('g')
  await sleep(400)
  log.afterCmdGUnfocused = counter()?.at
  log.stepsWithCaretElsewhere = log.afterCmdGUnfocused === log.afterShiftCmdG + 1

  /* ---------- the bar survives the scroll ---------- */

  // Scroll the pane past its head, which is what brings the compact bar in.
  const scroller = pane()?.querySelector('[data-find-scope]')
  scroller.scrollTop = Math.max(400, scroller.scrollHeight - scroller.clientHeight)
  await sleep(800)
  log.compactBarCameIn = Boolean(pane()?.querySelector('[data-compact]'))
  log.barStillThere = Boolean(bar())
  // On screen is not the same as in the DOM: the bar never left the tree, it was
  // painted over. Ask the document what is actually at the field's own centre.
  const seenAt = (el) => {
    const b = el.getBoundingClientRect()
    const hit = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2)
    return Boolean(hit) && (hit === el || el.contains(hit) || hit.contains(el))
  }
  log.fieldBox = (() => {
    const b = field()?.getBoundingClientRect()
    return b ? { top: Math.round(b.top), h: Math.round(b.height) } : null
  })()
  log.barIsActuallyVisible = Boolean(field()) && seenAt(field())
  // And it is still usable — the count is live and ⌘G still steps.
  const beforeScrollStep = counter()?.at
  cmd('g')
  await sleep(400)
  log.stepsAfterScrolling = counter()?.at !== beforeScrollStep

  /* ---------- and the marks are in a colour ---------- */

  const css = (name) =>
    getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  const rgb = (v) => {
    const el = document.createElement('span')
    el.style.color = v
    document.body.appendChild(el)
    const got = getComputedStyle(el).color
    el.remove()
    const m = /(\d+),\s*(\d+),\s*(\d+)/.exec(got)
    return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null
  }
  const chromatic = (v) => {
    const c = rgb(v)
    // Every other colour in this app is a step on one warm grey ramp, whose
    // channels sit within a few points of each other. A hue does not.
    return Boolean(c) && Math.max(...c) - Math.min(...c) > 40
  }
  log.findColour = css('--find')
  log.findNowColour = css('--findNow')
  log.matchIsChromatic = chromatic(log.findColour)
  log.currentMatchIsChromatic = chromatic(log.findNowColour)
  // Both highlights carry ink of their own — a wash that only repaints the
  // ground would erase near-white body text in the dark theme.
  log.hasInkOfItsOwn = Boolean(css('--onFind')) && Boolean(css('--onFindNow'))
  // The highlights are actually registered, so the tokens are painting something.
  log.highlightsRegistered = Boolean(CSS.highlights?.has('lanes-find'))
  log.currentHighlightRegistered = Boolean(CSS.highlights?.has('lanes-find-current'))
  // The bar's counter wears the mark's colour, so chrome and document agree.
  const same = (a, b) => {
    const x = rgb(a)
    const y = rgb(b)
    return Boolean(x && y) && x.every((n, i) => n === y[i])
  }
  const countEl = bar()?.querySelector('[data-find-count]')
  log.counterColour = countEl ? getComputedStyle(countEl).color : null
  log.counterWearsIt = Boolean(countEl) && same(log.counterColour, css('--findNow'))

  // Esc closes; ⌘G reopens on what was last looked for rather than on nothing.
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
  await sleep(400)
  log.escCloses = !bar()
  cmd('g')
  await sleep(700)
  log.cmdGReopens = Boolean(bar())
  log.rememberedQuery = field()?.value
  log.reopensOnLastQuery = field()?.value === 'the'

  /* ---------- the note pane: found through the editor ---------- */

  // The note pane is the other half of "the pane you are in": ⌘F there searches
  // the note, not the thread that is still open beside it.
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
  await sleep(300)
  cmd('k')
  await sleep(600)
  const box = document.querySelector('[data-palette-input]')
  if (box) {
    set.call(box, NAME)
    box.dispatchEvent(new Event('input', { bubbles: true }))
    await sleep(1000)
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
  }
  await sleep(1800)
  // A note opens in READ; writing is asked for, with ⌘E.
  if (!content()) cmd('e')
  for (let i = 0; i < 15 && !lineWith('The first lodestar'); i++) await sleep(200)
  log.noteOpened = Boolean(pane(1))
  // In WRITE, so this is the editor being searched.
  log.noteOpensInTheEditor = Boolean(content()) && Boolean(lineWith('The first lodestar'))
  cmd('f')
  await sleep(600)
  log.findOpensOnTheNotePane = Boolean(bar(1))
  log.notFindingInTheThreadPane = !bar(0)

  const scope = () => pane(1)?.querySelector('[data-find-scope]')
  const now = () => pane(1)?.querySelector('.cm-find-now')
  /** Wholly inside the pane's scrollport, where a reader can see it. */
  const inView = (el) => {
    const s = scope()
    if (!el || !s) return false
    const r = el.getBoundingClientRect()
    const v = s.getBoundingClientRect()
    return r.height > 0 && r.top >= v.top && r.bottom <= v.bottom
  }
  /** Brought up to the middle of the pane, not merely onto its bottom edge. */
  const centred = (el) => {
    const s = scope()
    if (!el || !s) return false
    const r = el.getBoundingClientRect()
    const v = s.getBoundingClientRect()
    return Math.abs((r.top + r.bottom) / 2 - (v.top + v.bottom) / 2) < v.height / 4
  }
  const nowOn = (s) => Boolean(now()?.closest('.cm-line')?.textContent.includes(s))

  if (field(1)) {
    set.call(field(1), NEEDLE)
    field(1).dispatchEvent(new Event('input', { bubbles: true }))
    await sleep(700)
  }
  log.expected = EXPECTED
  log.noteMatches = counter(1)
  log.findsInsideTheNote = Boolean(counter(1) && counter(1).total >= 1)
  // Every hit in the note, and none in the title the head already says.
  log.countsTheWholeNote = counter(1)?.total === EXPECTED
  // Counted from the text, not the page: the lines holding the later hits are
  // not drawn, and the marks that are drawn are fewer than the count.
  log.drawnMarks = pane(1)?.querySelectorAll('.cm-find').length ?? 0
  log.farLinesNotDrawn = !lineWith('MERIDIAN') && !lineWith('ZENITH')
  log.countsWhatIsNotDrawn =
    log.countsTheWholeNote && log.farLinesNotDrawn && log.drawnMarks >= 1 && log.drawnMarks < EXPECTED
  // The editor's own marks — one current, on the first hit — and not the
  // page-wide highlight laid over them as well.
  log.editorMarksIt =
    (pane(1)?.querySelectorAll('.cm-find-now').length ?? 0) === 1 &&
    (now()?.textContent ?? '').toLowerCase() === NEEDLE &&
    nowOn('The first lodestar')
  log.noPageHighlightOverTheEditor = !CSS.highlights?.has('lanes-find')
  // In the same two colours as everywhere else.
  const other = pane(1)?.querySelector('.cm-find:not(.cm-find-now)')
  log.editorMarkColours = {
    now: now() ? getComputedStyle(now()).backgroundColor : null,
    other: other ? getComputedStyle(other).backgroundColor : null
  }
  log.editorMarksInTheSameHue =
    Boolean(now() && other) &&
    same(log.editorMarkColours.now, css('--findNow')) &&
    same(log.editorMarkColours.other, css('--find'))

  // ⌘G walks it: the second hit sits beside the first, the third is screens
  // down, and it is brought up to where it can be read.
  cmd('g')
  await sleep(500)
  log.noteAfterCmdG = counter(1)?.at
  log.secondBesideTheFirst = log.noteAfterCmdG === 2 && nowOn('The first lodestar')
  cmd('g')
  await sleep(700)
  log.noteThird = counter(1)?.at
  log.farHitDrawnAndCurrent = log.noteThird === 3 && nowOn('MERIDIAN')
  log.farHitInView = inView(now())
  log.farHitCentred = centred(now())
  cmd('g')
  await sleep(700)
  log.noteFourth = counter(1)?.at
  log.fourthHitShown = log.noteFourth === 4 && nowOn('ZENITH') && inView(now())
  // And round again to the top of the note.
  cmd('g')
  await sleep(700)
  log.noteWrapped = counter(1)?.at
  log.wrapsBackToTheFirst = log.noteWrapped === 1 && nowOn('The first lodestar') && inView(now())

  // READ counts the same note to the same number, found the way a thread is.
  // The walk has just wrapped to hit 1 of 4, and READ finds 1 of 4 too, so the
  // toggle changes neither the count nor the position. That is the usual case
  // — ⌘E with the bar open — and it is the one where a bar that only paints
  // when the count or the position moves paints nothing at all. No ⌘G first:
  // a step would repaint and hide exactly that.
  document.activeElement?.blur?.()
  cmd('e')
  await sleep(900)
  log.readHasNoEditor = !content()
  log.readMatches = counter(1)
  log.readCountsTheSame = Boolean(bar(1)) && counter(1)?.total === EXPECTED
  log.readPaintsWithHighlights = Boolean(CSS.highlights?.has('lanes-find'))

  log.pass = Boolean(
    log.threadPaneHasText &&
    log.opens &&
    log.fieldTakesCaret &&
    log.counts &&
    log.cmdGStepped &&
    log.shiftCmdGStepsBack &&
    log.stepsWithCaretElsewhere &&
    log.compactBarCameIn &&
    log.barStillThere &&
    log.barIsActuallyVisible &&
    log.stepsAfterScrolling &&
    log.matchIsChromatic &&
    log.currentMatchIsChromatic &&
    log.hasInkOfItsOwn &&
    log.highlightsRegistered &&
    log.currentHighlightRegistered &&
    log.counterWearsIt &&
    log.escCloses &&
    log.cmdGReopens &&
    log.reopensOnLastQuery &&
    log.noteOpensInTheEditor &&
    log.findOpensOnTheNotePane &&
    log.notFindingInTheThreadPane &&
    log.findsInsideTheNote &&
    log.countsTheWholeNote &&
    log.countsWhatIsNotDrawn &&
    log.editorMarksIt &&
    log.noPageHighlightOverTheEditor &&
    log.editorMarksInTheSameHue &&
    log.secondBesideTheFirst &&
    log.farHitDrawnAndCurrent &&
    log.farHitInView &&
    log.farHitCentred &&
    log.fourthHitShown &&
    log.wrapsBackToTheFirst &&
    log.readHasNoEditor &&
    log.readCountsTheSame &&
    log.readPaintsWithHighlights
  )

  // The seeded note goes to the Trash — recoverable, and out of the vault it
  // was written into. Logged rather than counted in `pass`: it is
  // housekeeping, not a claim about the bar.
  log.trashedSeed = await window.lanes.noteTrash(PATH).then((r) => r.ok, () => false)
  return JSON.stringify(log, null, 1)
})()
