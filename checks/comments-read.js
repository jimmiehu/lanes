// COMMENTS ARE READ — in the note they are written in, by both surfaces.
//
// A comment is CriticMarkup in the note: `{==the words==}` the anchor,
// `{>>…<<}` the comment, or the comment alone at a point. Neither surface shows
// the braces or the comment's words in the line (red at the commit before: the
// braces on the page). READ washes the anchor's words; the comment goes in the
// MARGIN, level with its anchor's line, where the pane has room past the
// measure — and where it has none, a marker at the comment's point, which a
// click opens as a card under the line. A comment at a point is a marker
// everywhere. WRITE draws the same: `{==` and `==}` put away until the caret
// touches the anchor, the comment put away and in the margin, and with the
// caret in it its raw `{>>…<<}` back, faint, as text to edit.
//
// Counted, not counted, found: the meta line and the details panel say how
// many; the word count leaves their words out — the same note with them taken
// out counts the same; ⌘K finds a note by a comment's words; and a PDF has the
// anchors' words and none of the comments (`comments-pdf.mjs` reads the file).
//
// Seeds its own note through the app's IPC. Wants a throwaway LANES_VAULT and
// LANES_STATE, and LANES_EXPORT_TO for the PDF. See checks/README.md.
;(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
  const pane = (i) => document.querySelector(`[data-pane="${i}"]`)
  const key = (k, extra = {}) =>
    window.dispatchEvent(new KeyboardEvent('keydown', { key: k, metaKey: true, bubbles: true, cancelable: true, ...extra }))
  const alt = (code) =>
    window.dispatchEvent(new KeyboardEvent('keydown', { key: code.slice(-1), code, altKey: true, bubbles: true, cancelable: true }))
  const notePane = () => [...document.querySelectorAll('[data-pane]')].find((p) => p.querySelector('[data-find-scope]') && p.querySelector('[data-mode]'))
  const scroller = () => notePane()?.querySelector('[data-find-scope]')
  const content = () => notePane()?.querySelector('.cm-content')
  const lines = () => [...(notePane()?.querySelectorAll('.cm-line') ?? [])]
  const lineWith = (s) => lines().find((l) => l.textContent.includes(s))
  const block = (s) => [...(notePane()?.querySelectorAll('[data-md-from]') ?? [])].find((d) => d.textContent.includes(s))
  const cards = () => [...(scroller()?.querySelectorAll('[data-cmt-card]') ?? [])]
  const markers = () => [...(scroller()?.querySelectorAll('[data-cmt-at]') ?? [])].filter((m) => !m.closest('[data-cmt-layer]'))
  const shown = (el) => Boolean(el) && el.getClientRects().length > 0 && getComputedStyle(el).display !== 'none'
  const flat = (s) => (s ?? '').replace(/\s+/g, ' ').trim()
  const box = (el) => el?.getBoundingClientRect()
  const press = (k, mods = {}) =>
    content()?.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...mods }))
  /** A press at the right edge of the last character of `node`'s text — the caret after it. */
  const clickAfter = async (el) => {
    if (!el) return false
    const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
    let last = null
    for (let n; (n = walk.nextNode()); ) if (n.data.length) last = n
    if (!last) return false
    const r = document.createRange()
    r.setStart(last, last.data.length - 1)
    r.setEnd(last, last.data.length)
    const b = r.getBoundingClientRect()
    const at = { bubbles: true, cancelable: true, clientX: b.right - 0.5, clientY: b.top + b.height / 2, button: 0, detail: 1, view: window }
    ;(document.elementFromPoint(at.clientX, at.clientY) ?? last.parentElement).dispatchEvent(new MouseEvent('mousedown', at))
    document.dispatchEvent(new MouseEvent('mouseup', at))
    await sleep(250)
    return true
  }
  const meta = () => flat(notePane()?.querySelector('[data-head="1"]')?.innerText)
  const words = () => Number(/(\d+) words?/.exec(meta())?.[1] ?? NaN)
  const log = {}
  await sleep(1500)

  const stamp = Date.now().toString(36)
  const TITLE = `Comments check ${stamp}`
  const PLAN = 'The plan rests on {==crop rotation==}{>>define this before first use?<<} as its frame.'
  const BODY = [
    `# ${TITLE}`,
    '',
    PLAN,
    '',
    'A second paragraph with a note{>>a note at a point<<} in it.',
    '',
    '- [ ] a task {==with an anchor==}{>>and its comment<<} here',
    '',
    '```',
    'code {>>not a comment<<}',
    '```',
    '',
    'Five words of plain prose.',
    ''
  ].join('\n')
  const made = await window.lanes.noteCreate(TITLE, '_unfiled')
  const PATH = made.path || `_unfiled/comments-check-${stamp}.md`
  await window.lanes.noteWrite(PATH, BODY)
  log.path = PATH

  // Opened through ⌘K, as a person would — which also proves it is found by a
  // comment's words.
  key('k')
  await sleep(600)
  const input = document.querySelector('[data-palette-input]')
  const ask = async (q) => {
    Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(input, q)
    input.dispatchEvent(new Event('input', { bubbles: true }))
    for (let i = 0; i < 60; i++) {
      if ([...document.querySelectorAll('.pal-row')].some((r) => r.textContent.includes(TITLE))) break
      await sleep(100)
    }
  }
  await ask('before first use')
  log.foundByItsCommentsWords = [...document.querySelectorAll('.pal-row')].some((r) => r.textContent.includes(TITLE))
  await ask(TITLE)
  for (let i = 0; i < 40; i++) {
    const t = (document.querySelector('.pal-row[data-pal-on="1"]')?.textContent ?? '').trim()
    if (t.includes(TITLE) && !t.startsWith('+')) break
    await sleep(100)
  }
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
  for (let i = 0; i < 40 && !block('as its frame'); i++) await sleep(100)
  log.opened = Boolean(block('as its frame'))
  if (!log.opened) return JSON.stringify({ ...log, pass: false }, null, 1)

  // One pane, the note's: room in the margin.
  if (document.querySelectorAll('[data-pane]').length > 1) alt('Digit2')
  await sleep(700)

  /* ---------- READ: the line, without the braces or the comment ---------- */

  log.readLine = flat(block('as its frame')?.innerText)
  log.readShowsTheLine = log.readLine === 'The plan rests on crop rotation as its frame.'
  log.noBracesInRead = ![...notePane().querySelectorAll('[data-md-from]')]
    .filter((d) => !/not a comment/.test(d.textContent))
    .some((d) => /\{==|==\}|\{>>|<<\}/.test(d.innerText))
  log.codeIsCode = /\{>>not a comment<<\}/.test(block('not a comment')?.innerText ?? '')
  const anchor = notePane().querySelector('.cmt-anchor[data-cmt-anchor]')
  log.anchorWashed = anchor?.textContent === 'crop rotation' && getComputedStyle(anchor).backgroundColor !== 'rgba(0, 0, 0, 0)'
  log.anchorDotted = /dotted/.test(getComputedStyle(anchor ?? document.body).textDecorationStyle ?? '')

  /* ---------- READ, with room: the comments in the margin ---------- */

  await sleep(300)
  log.room = scroller()?.dataset.cmtRoom
  const readCards = cards().map((c) => flat(c.innerText))
  log.readCards = readCards
  log.everyCommentInTheMargin =
    readCards.length === 3 &&
    ['define this before first use?', 'a note at a point', 'and its comment'].every((t) => readCards.includes(t))
  const col = box(block('as its frame'))
  const card = (t) => cards().find((c) => flat(c.innerText) === t)
  log.inTheMargin = cards().length > 0 && cards().every((c) => box(c).left > (col?.right ?? Infinity) + 8)
  // Level with the line its anchor is on: the card's top within a few pixels of the anchor's.
  log.levelWithTheAnchor = Math.abs((box(card('define this before first use?'))?.top ?? NaN) - (box(anchor)?.top ?? NaN)) <= 6
  const sorted = cards().map(box).sort((a, b) => a.top - b.top)
  log.noneOverlap = sorted.every((b, i) => !i || b.top >= sorted[i - 1].bottom)
  // With the margin holding them, an anchor needs no marker; a comment at a point keeps its own.
  const bare = markers().find((m) => m.dataset.cmtBare === '1')
  log.bareKeepsItsMarker = shown(bare) && markers().filter((m) => m.dataset.cmtBare !== '1').every((m) => !shown(m))

  /* ---------- the counts ---------- */

  log.meta = meta()
  log.metaSaysComments = / · 3 comments\b/.test(log.meta)
  notePane().querySelector('[data-head="1"] [data-meta], [data-details-toggle]')?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  await sleep(300)
  const fact = document.querySelector('[data-fact="Comments"]')
  log.detailsSays = flat(fact?.innerText)
  // The count is the row's own words; `go through`, after it, is the pass the
  // row offers on a note that can be written (comments-pass.js holds that).
  log.detailsSaysComments = /^Comments 3(?: go through)?$/.test(log.detailsSays)
  const withComments = words()
  log.wordsWith = withComments

  /* ---------- narrow: a marker, and a card under the line ---------- */

  alt('Digit2')
  await sleep(900)
  log.narrowRoom = scroller()?.dataset.cmtRoom
  log.narrowHasNoMarginCards = cards().length === 0
  log.narrowMarkers = markers().filter(shown).length
  log.everyCommentAMarker = log.narrowMarkers === 3
  const planMarker = markers().find((m) => m.dataset.cmtText === 'define this before first use?')
  planMarker?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
  await sleep(300)
  // In a note that can be written, what opens is the field holding its words
  // (comments-write.js); a note that cannot shows them read-only.
  const under = scroller()?.querySelector('[data-cmt-field], [data-cmt-under]')
  log.cardUnder = under?.querySelector('textarea')?.value ?? flat(under?.innerText)
  log.clickOpensItUnderTheLine =
    log.cardUnder === 'define this before first use?' && box(under)?.top >= (box(planMarker)?.bottom ?? Infinity) - 1
  // Esc where a real one goes: to what has the focus — the field, when it opened one.
  ;(document.activeElement ?? window).dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))
  await sleep(250)
  log.escClosesIt = !scroller()?.querySelector('[data-cmt-field], [data-cmt-under]')
  alt('Digit2')
  await sleep(900)

  /* ---------- WRITE: the same, decorated, nothing rewritten ---------- */

  key('e')
  for (let i = 0; i < 30 && !content(); i++) await sleep(100)
  await sleep(500)
  log.inWrite = Boolean(content())
  const planLine = () => lineWith('as its frame')
  log.writeLine = flat(planLine()?.innerText)
  log.writeShowsTheLine = log.writeLine === 'The plan rests on crop rotation as its frame.'
  const edAnchor = planLine()?.querySelector('.cm-md-anchor')
  log.writeWashesTheAnchor = edAnchor?.textContent === 'crop rotation'
  log.writeCards = cards().map((c) => flat(c.innerText))
  log.writeHasTheMargin =
    log.writeCards.length === 3 && Math.abs((box(card('define this before first use?'))?.top ?? NaN) - (box(edAnchor)?.top ?? NaN)) <= 6
  // The caret in the anchor: its marks back, the comment still away.
  await clickAfter(edAnchor)
  log.touchedAnchor = flat(planLine()?.innerText)
  log.touchBringsTheMarks = log.touchedAnchor === 'The plan rests on {==crop rotation==} as its frame.'
  // The caret against the comment: its raw text back, faint, to be edited.
  const close = [...(planLine()?.querySelectorAll('.cm-md-mark') ?? [])].find((m) => m.textContent === '==}')
  await clickAfter(close)
  log.touchedComment = flat(planLine()?.innerText)
  log.touchBringsTheComment = log.touchedComment === 'The plan rests on {==crop rotation==}{>>define this before first use?<<} as its frame.'
  const raw = planLine()?.querySelector('.cm-md-comment')
  const probe = document.createElement('span')
  probe.style.color = 'var(--faint)'
  document.body.appendChild(probe)
  const faint = getComputedStyle(probe).color
  probe.remove()
  log.rawIsFaint = Boolean(raw) && getComputedStyle(raw).color === faint
  // Away again, and nothing was written.
  await clickAfter(lineWith('Five words'))
  log.awayAgain = flat(planLine()?.innerText) === 'The plan rests on crop rotation as its frame.'
  log.nothingWritten = (await window.lanes.note(PATH))?.body === BODY
  key('e')
  await sleep(600)

  /* ---------- paper: the anchors' words, none of the comments ---------- */

  // Waited out to the end: the export reads the note from disk, and the note
  // is about to be changed under it.
  const pdf = () => notePane()?.querySelector('[data-pdf]')
  pdf()?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  for (let i = 0; i < 160 && !/saved|failed/.test(pdf()?.dataset.pdf ?? ''); i++) await sleep(250)
  log.pdf = pdf()?.dataset.pdf
  log.pdfSaved = log.pdf === 'saved'
  log.pdfName = PATH.split('/').pop().replace(/\.md$/, '.pdf')

  /* ---------- a word count without them ---------- */

  // Taken out on disk — the fence's lookalike with them, which counts nothing
  // either way and is how the page says the new text has arrived.
  await window.lanes.noteWrite(PATH, BODY.replace(/\{>>.*?<<\}/g, '').replace(/\{==(.*?)==\}/g, '$1'))
  for (let i = 0; i < 60 && /not a comment/.test(block('code')?.innerText ?? ''); i++) await sleep(250)
  await sleep(400)
  log.arrived = !/not a comment/.test(block('code')?.innerText ?? '')
  log.wordsWithout = words()
  log.wordCountLeavesThemOut = log.arrived && Number.isFinite(withComments) && withComments === log.wordsWithout
  log.metaSaysNoneNow = !/comment/.test(meta())

  log.pass = Boolean(
    log.foundByItsCommentsWords &&
      log.readShowsTheLine &&
      log.noBracesInRead &&
      log.codeIsCode &&
      log.anchorWashed &&
      log.anchorDotted &&
      log.room === '1' &&
      log.everyCommentInTheMargin &&
      log.inTheMargin &&
      log.levelWithTheAnchor &&
      log.noneOverlap &&
      log.bareKeepsItsMarker &&
      log.metaSaysComments &&
      log.detailsSaysComments &&
      log.narrowRoom === '0' &&
      log.narrowHasNoMarginCards &&
      log.everyCommentAMarker &&
      log.clickOpensItUnderTheLine &&
      log.escClosesIt &&
      log.writeShowsTheLine &&
      log.writeWashesTheAnchor &&
      log.writeHasTheMargin &&
      log.touchBringsTheMarks &&
      log.touchBringsTheComment &&
      log.rawIsFaint &&
      log.awayAgain &&
      log.nothingWritten &&
      log.pdfSaved &&
      log.wordCountLeavesThemOut &&
      log.metaSaysNoneNow
  )
  return JSON.stringify(log, null, 1)
})()
