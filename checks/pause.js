// A blank line is a line: a whole line of air between two paragraphs, in WRITE,
// in READ and in a thread alike — and a line break inside a paragraph is a line.
//
// It was a third of a line in WRITE, 8px under a 24px line, and in READ it was
// less: READ has no blank lines, only the 2px each paragraph keeps above and
// below its words, so two paragraphs sat 4px further apart than two lines of
// one. Then it was half a line in both, which was still too little to read a
// paragraph as a paragraph. Now it is what a blank line is in a text file and
// in iA Writer — a line: the editor draws it at the body's own line height,
// READ leaves the same room between two blocks a blank line parts, and so does
// a thread, whose replies are parted by blank lines like a note and were drawn
// 4px apart. Beside a heading the blank line is the heading's own air, which
// the heading gives up that much of, so no heading moves: the air around a `##`
// or a `###` is what it was, and READ's.
//
// Measured on the words themselves — the top of each line's first glyph — so
// the distances are the ones a reader sees rather than either surface's idea
// of a box. Then the blank lines themselves: one between paragraphs is a whole
// line with the caret nowhere near it, so nothing moves when the caret steps
// onto it; one beside a heading opens to a line when the caret stands on it, so
// there is room to type. And READ's pause is the blank line, drawn — a
// double-click in it writes there, on the blank line, rather than nowhere.
//
// Seeds its own note through the app's IPC. Wants the thread fixture's vault
// (`node checks/thread-fixture.mjs /private/tmp/<vault>`), whose thread is the
// one measured, and a fresh LANES_STATE. See checks/README.md.
(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
  const key = (k, extra = {}) =>
    window.dispatchEvent(new KeyboardEvent('keydown', { key: k, metaKey: true, bubbles: true, ...extra }))
  const pane = (i = 1) => document.querySelector(`[data-pane="${i}"]`)
  const content = () => pane()?.querySelector('.cm-content')
  const lines = () => [...(pane()?.querySelectorAll('.cm-line') ?? [])]
  const lineWith = (s) => lines().find((l) => l.textContent.includes(s))
  /** The document itself: the editor's lines, or READ's column of blocks. */
  const docRoot = (i = 1) =>
    (i === 1 ? content() : null) ?? pane(i)?.querySelector('[data-md-from]')?.parentElement ?? null
  /** Where the first letter of `s` is drawn, from its own glyph box. */
  const topOf = (s, i = 1) => {
    const root = i === 1 ? docRoot(1) : pane(i)?.querySelector('[data-find-scope]')
    if (!root) return NaN
    const walk = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
    let n
    while ((n = walk.nextNode())) {
      const at = n.data.indexOf(s)
      if (at < 0) continue
      const r = document.createRange()
      r.setStart(n, at)
      r.setEnd(n, at + 1)
      const b = r.getBoundingClientRect()
      if (b.height) return b.top
    }
    return NaN
  }
  const round = (n) => Math.round(n * 100) / 100
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
  /** A double-click as the browser sends it: both clicks first, then the dblclick. */
  const dbl = async (target, x, y) => {
    const at = { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0, view: window }
    for (const detail of [1, 2]) {
      target.dispatchEvent(new MouseEvent('mousedown', { ...at, detail }))
      target.dispatchEvent(new MouseEvent('mouseup', { ...at, detail }))
      target.dispatchEvent(new MouseEvent('click', { ...at, detail }))
    }
    target.dispatchEvent(new MouseEvent('dblclick', { ...at, detail: 2 }))
    await sleep(900)
  }
  /** A click on a line's box, through the editor's own pointer handling. */
  const clickLine = async (el) => {
    const b = el.getBoundingClientRect()
    const x = b.left + 4
    const y = b.top + b.height / 2
    const ev = { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0, detail: 1, view: window }
    ;(document.elementFromPoint(x, y) ?? el).dispatchEvent(new MouseEvent('mousedown', ev))
    document.dispatchEvent(new MouseEvent('mouseup', ev))
    await sleep(300)
  }
  const after = (s) => {
    const all = lines()
    return all[all.findIndex((l) => l.textContent.includes(s)) + 1] ?? null
  }

  const log = {}
  await sleep(1200)

  /* ---------- a thread: its paragraphs parted by a line ---------- */

  // The fixture's thread is the one the app opens on, in pane A.
  const threadPara = [...(pane(0)?.querySelectorAll('[data-md-from]') ?? [])].find((d) =>
    d.textContent.includes('Paired paragraph one')
  )
  log.threadFound = Boolean(threadPara)
  if (threadPara) {
    threadPara.scrollIntoView({ block: 'center' })
    await sleep(300)
    const tLine = parseFloat(getComputedStyle(threadPara.firstElementChild ?? threadPara).lineHeight)
    log.threadLine = round(tLine)
    log.threadPause = round(topOf('Paired paragraph two', 0) - topOf('Paired paragraph one', 0) - tLine)
  }

  /* ---------- the note: READ first, which is where it opens ---------- */

  const TITLE = 'A pause, not a row'
  const BODY = [
    `# ${TITLE}`,
    '',
    'Alpha opens the note',
    'Amber follows after a single line break',
    '',
    'Bravo comes after a blank line',
    '',
    '## Charlie section',
    '',
    'Delta sits under the section',
    '',
    '- Echo item',
    '- Foxtrot item',
    '',
    'Golf comes after the list',
    '',
    '### Hotel sub-section',
    '',
    'India sits under the sub-section',
    ''
  ].join('\n')
  const made = await window.lanes.noteCreate(TITLE, '_unfiled')
  const PATH = made.path || '_unfiled/a-pause-not-a-row.md'
  await window.lanes.noteWrite(PATH, BODY)

  await openByName(TITLE)
  for (let i = 0; i < 20 && !topOf('India sits'); i++) await sleep(150)
  log.opensInRead = !content() && Boolean(pane()?.querySelector('[data-md-from]'))
  // The pause is the claim here, so a build that opened it in WRITE is put in
  // READ to be measured; that it opens there is `read-default.js`'s.
  if (content()) {
    key('e')
    for (let i = 0; i < 20 && content(); i++) await sleep(100)
    await sleep(400)
  }

  /** Every distance the claim is about, on whichever surface is showing. */
  const measure = () => {
    const t = Object.fromEntries(
      ['Alpha', 'Amber', 'Bravo', 'Charlie', 'Delta', 'Foxtrot', 'Golf', 'Hotel', 'India'].map((w) => [w, topOf(w)])
    )
    const line = t.Amber - t.Alpha
    return {
      // Two lines of one paragraph, a single newline between them.
      line: round(line),
      // Two paragraphs a blank line parts: what the blank line adds to a line.
      pause: round(t.Bravo - t.Amber - line),
      // From a list to the prose a blank line under it.
      listToProse: round(t.Golf - t.Foxtrot),
      // A heading's air, with a blank line on each side of it.
      toH2: round(t.Charlie - t.Bravo),
      fromH2: round(t.Delta - t.Charlie),
      toH3: round(t.Hotel - t.Golf),
      fromH3: round(t.India - t.Hotel)
    }
  }
  const r = measure()
  log.read = r

  /* ---------- WRITE, by ⌘E ---------- */

  key('e')
  for (let i = 0; i < 20 && !lineWith('India sits'); i++) await sleep(150)
  await sleep(300)
  // The caret is in the editor now — on the first line, with no blank line under it.
  log.writeMode = Boolean(content())
  const w = measure()
  log.write = w
  log.writeLineBreakIsALine = Math.abs(w.line - parseFloat(getComputedStyle(content()).lineHeight)) < 0.5
  // A whole line: what a blank line is.
  log.writePauseIsALine = Math.abs(w.pause - w.line) < 0.75
  log.readLineBreakIsALine = Math.abs(r.line - w.line) < 0.5
  // ⌘E moves no paragraph.
  log.readPauseIsWrites = Math.abs(r.pause - w.pause) < 0.75
  // And no heading: a blank line beside one is the heading's air, not a pause,
  // so the air is what it was. Within 2px rather than to the pixel, because
  // READ keeps 6px under a `###` and the blank line the heading gives up is
  // 8px, which it cannot give up more than all of — a gap older than the pause.
  log.headingAirIsREADs = ['toH2', 'fromH2', 'toH3', 'fromH3'].every((k) => Math.abs(r[k] - w[k]) < 2.5)
  // A thread's paragraphs are parted by the same line.
  log.threadPauseIsALine = log.threadFound && Math.abs(log.threadPause - w.line) < 0.75

  // The blank line between two paragraphs is a whole line with the caret
  // nowhere near it — so the caret stepping onto it moves nothing.
  const pauseLine = after('Amber follows')
  log.pauseLineIsBlank = Boolean(pauseLine?.classList.contains('cm-md-blank'))
  log.pauseLineAtRest = round(pauseLine?.getBoundingClientRect().height ?? NaN)
  if (pauseLine) await clickLine(pauseLine)
  log.pauseLineStoodOn = round(after('Amber follows')?.getBoundingClientRect().height ?? NaN)
  log.pauseLineIsALineAtRest =
    Math.abs(log.pauseLineAtRest - w.line) < 0.5 && Math.abs(log.pauseLineStoodOn - w.line) < 0.5
  // Beside a heading it is the heading's air — short — and opens to a line
  // when the caret stands on it, so there is room to type.
  const byHeading = after('Bravo comes')
  log.byHeadingIsBlank = Boolean(byHeading?.classList.contains('cm-md-blank'))
  log.byHeadingAtRest = round(byHeading?.getBoundingClientRect().height ?? NaN)
  if (byHeading) await clickLine(byHeading)
  log.byHeadingOpened = round(after('Bravo comes')?.getBoundingClientRect().height ?? NaN)
  log.byHeadingOpensToALine = log.byHeadingAtRest < w.line - 4 && Math.abs(log.byHeadingOpened - w.line) < 0.5

  /* ---------- READ again: a double-click in the pause writes on it ---------- */

  document.activeElement?.blur?.()
  await sleep(200)
  key('e')
  await sleep(1200)
  log.backInRead = !content() && Boolean(pane()?.querySelector('[data-md-from]'))
  const gap = pane()?.querySelector('[data-md-pause]')
  log.readDrawsThePause = Boolean(gap)
  if (gap) {
    const b = gap.getBoundingClientRect()
    await dbl(gap, b.left + 40, b.top + b.height / 2)
  }
  log.doubleClickInThePauseWritesOnIt =
    Boolean(content()) && Boolean(after('Amber follows')?.classList.contains('cm-md-here'))

  log.pass = Boolean(
    log.threadFound &&
      log.writeMode &&
      log.writeLineBreakIsALine &&
      log.writePauseIsALine &&
      log.readLineBreakIsALine &&
      log.readPauseIsWrites &&
      log.headingAirIsREADs &&
      log.threadPauseIsALine &&
      log.pauseLineIsBlank &&
      log.pauseLineIsALineAtRest &&
      log.byHeadingIsBlank &&
      log.byHeadingOpensToALine &&
      log.backInRead &&
      log.readDrawsThePause &&
      log.doubleClickInThePauseWritesOnIt
  )
  return JSON.stringify(log, null, 1)
})()
