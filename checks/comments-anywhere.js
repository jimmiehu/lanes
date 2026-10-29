// A COMMENT GOES WHEREVER THE SELECTION HAS WORDS.
//
// A selection is rarely only words. Dragged in from the left it starts on an
// item's bullet; dragged down from a paragraph it starts at the end of that
// paragraph and runs into a list; in a table it is a cell's. Each of those was
// told "Not here — a comment goes on words" and nothing was written, because
// READ walked the selection back to the source only from inside the words of
// the block it started in, and `anchorFor` read only the selection's first
// line, and no table at all.
//
// Now each end of the selection is walked back wherever it is — a bullet to
// the words beside it, a table's cell to its own words — and the comment is
// about the first words the selection has: the item's, the next block's, the
// cell's. A pipe said in a cell's comment is written `\|`, so the table keeps
// its cells, and read back as `|`, so the comment can be pressed, changed and
// resolved. In WRITE, ⌥⌘M with the caret in a table's row takes the word there.
// Where the selection has nothing a comment can be about — only code, or a
// note embedded in this one, whose lines are another note's — it still says
// so, and writes nothing to either note. An embed whose note is missing is
// drawn muted, with none of another note's blocks in it, but its line is still
// the embed's: a comment there would make READ draw a paragraph in its place.
// So it takes none either, in READ or with WRITE's caret on it, and a selection
// from it on into the prose after is about the prose's words, as from a fence.
//
// Red at the commit before: the bullet, the paragraph's end, the cell and
// WRITE's row each opened no field. The muted embed's part was red at
// 0ee99b6: READ and WRITE each opened a field on “!Nowhere …”, which would
// have written `{==![[Nowhere …]]==}`. Seeds its own notes; wants a throwaway
// LANES_VAULT and LANES_STATE. See checks/README.md.
;(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
  const key = (k, extra = {}) =>
    window.dispatchEvent(new KeyboardEvent('keydown', { key: k, metaKey: true, bubbles: true, cancelable: true, ...extra }))
  const alt = (code) =>
    window.dispatchEvent(new KeyboardEvent('keydown', { key: code.slice(-1), code, altKey: true, bubbles: true, cancelable: true }))
  const chordM = () =>
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'µ', code: 'KeyM', metaKey: true, altKey: true, bubbles: true, cancelable: true }))
  const notePane = () => [...document.querySelectorAll('[data-pane]')].find((p) => p.querySelector('[data-find-scope]') && p.querySelector('[data-mode]'))
  const scroller = () => notePane()?.querySelector('[data-find-scope]')
  const content = () => notePane()?.querySelector('.cm-content')
  const lineWith = (s) => [...(notePane()?.querySelectorAll('.cm-line') ?? [])].find((l) => l.textContent.includes(s))
  const block = (s) => [...(notePane()?.querySelectorAll('[data-md-from]') ?? [])].find((d) => !d.querySelector('[data-md-from]') && d.textContent.includes(s))
  const cell = (s) => [...(notePane()?.querySelectorAll('td, th') ?? [])].find((d) => d.textContent.includes(s))
  const field = () => scroller()?.querySelector('[data-cmt-field]')
  const box = () => field()?.querySelector('textarea')
  const on = () => (field()?.querySelector('.cmt-field-on')?.textContent ?? '').replace(/\s+/g, ' ').trim()
  const card = (t) => [...(scroller()?.querySelectorAll('[data-cmt-card]') ?? [])].find((c) => c.textContent.trim() === t)
  const offer = () => scroller()?.querySelector('[data-comment-offer]')
  /** Every text node in `el`, each with where it starts in `el`'s text. */
  const texts = (el) => {
    const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
    const out = []
    let all = ''
    for (let n; (n = walk.nextNode()); ) {
      out.push([n, all.length])
      all += n.data
    }
    return { nodes: out, all }
  }
  /** The point `i` characters into `el`'s text. */
  const point = (el, i) => {
    const { nodes } = texts(el)
    for (let k = nodes.length - 1; k >= 0; k--) if (nodes[k][1] <= i) return [nodes[k][0], i - nodes[k][1]]
    return [nodes[0][0], 0]
  }
  /** A selection from one point to another, and the page told. */
  const span = async (start, end) => {
    const r = document.createRange()
    r.setStart(...start)
    r.setEnd(...end)
    const sel = window.getSelection()
    sel.removeAllRanges()
    sel.addRange(r)
    document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }))
    await sleep(250)
  }
  /** The words `s` selected in `el`. */
  const select = async (el, s) => {
    const at = texts(el).all.indexOf(s)
    if (at < 0) return false
    await span(point(el, at), point(el, at + s.length))
    return true
  }
  const type = async (el, text) => {
    if (!el) return
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(el, text)
    el.dispatchEvent(new Event('input', { bubbles: true }))
    await sleep(80)
  }
  const press = async (el, k, mods = {}) => {
    el?.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...mods }))
    await sleep(250)
  }
  /** The caret put down in the editor, in the middle of `word` on the line holding it, by a press. */
  const caretIn = async (word) => {
    const line = lineWith(word)
    if (!line) return false
    const walk = document.createTreeWalker(line, NodeFilter.SHOW_TEXT)
    for (let n; (n = walk.nextNode()); ) {
      const i = n.data.indexOf(word)
      if (i < 0) continue
      const r = document.createRange()
      r.setStart(n, i + 2)
      r.setEnd(n, i + 3)
      const b = r.getBoundingClientRect()
      const at = { bubbles: true, cancelable: true, clientX: b.left, clientY: b.top + b.height / 2, button: 0, detail: 1, view: window }
      ;(document.elementFromPoint(at.clientX, at.clientY) ?? n.parentElement).dispatchEvent(new MouseEvent('mousedown', at))
      document.dispatchEvent(new MouseEvent('mouseup', at))
      await sleep(250)
      return true
    }
    return false
  }
  const log = {}
  await sleep(1500)

  const stamp = Date.now().toString(36)
  const OTHER = `Embedded ${stamp}`
  const other = await window.lanes.noteCreate(OTHER, '_unfiled')
  const OTHER_PATH = other.path || `_unfiled/embedded-${stamp}.md`
  const OTHER_BODY = `# ${OTHER}\n\nWords from another note entirely.\n`
  await window.lanes.noteWrite(OTHER_PATH, OTHER_BODY)

  const TITLE = `Anywhere check ${stamp}`
  // A note nobody has, so its embed is drawn muted.
  const NOWHERE = `Nowhere ${stamp}`
  const BODY = [
    `# ${TITLE}`,
    '',
    'A paragraph that ends here.',
    '',
    '- first item words',
    '- second item words',
    '',
    '| Name | Note |',
    '|---|---|',
    '| alpha cell | beta cell |',
    '',
    '```',
    'const code = 1',
    '```',
    '',
    `![[${OTHER_PATH.replace(/\.md$/, '')}]]`,
    '',
    `![[${NOWHERE}]]`,
    '',
    'Last line of prose.',
    ''
  ].join('\n')
  const made = await window.lanes.noteCreate(TITLE, '_unfiled')
  const PATH = made.path || `_unfiled/anywhere-check-${stamp}.md`
  await window.lanes.noteWrite(PATH, BODY)
  const disk = async (p = PATH) => (await window.lanes.note(p))?.body ?? ''
  const settle = async (want) => {
    for (let i = 0; i < 30 && (await disk()) !== want; i++) await sleep(150)
    return (await disk()) === want
  }
  /** ↵ in the field with `text` typed, and the note as it is then. */
  const write = async (text, want) => {
    await type(box(), text)
    await press(box(), 'Enter')
    return settle(want)
  }
  /** ⌘Z in READ, back to the note as it was seeded. */
  const undo = async () => {
    key('z')
    const back = await settle(BODY)
    await sleep(300)
    return back
  }

  key('k')
  await sleep(600)
  const input = document.querySelector('[data-palette-input]')
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, TITLE)
  input.dispatchEvent(new Event('input', { bubbles: true }))
  for (let i = 0; i < 40; i++) {
    const t = (document.querySelector('.pal-row[data-pal-on="1"]')?.textContent ?? '').trim()
    if (t.includes(TITLE) && !t.startsWith('+')) break
    await sleep(100)
  }
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
  for (let i = 0; i < 40 && !(block('ends here') && block('another note') && block('Could not find')); i++) await sleep(100)
  log.opened = Boolean(block('ends here'))
  log.embedDrawn = Boolean(block('another note'))
  log.mutedEmbedDrawn = Boolean(block('Could not find'))
  if (!log.opened) return JSON.stringify({ ...log, pass: false }, null, 1)
  if (document.querySelectorAll('[data-pane]').length > 1) alt('Digit2')
  await sleep(700)

  /* ---------- READ: from an item's bullet, the item's words ---------- */

  const second = block('second item words')
  const bullet = second && texts(second).nodes[0]
  log.bulletIsNotTheWords = Boolean(bullet) && !bullet[0].data.includes('second')
  if (bullet) await span([bullet[0], 0], point(second, texts(second).all.length))
  chordM()
  await sleep(300)
  log.bulletOpensTheField = field()?.dataset.cmtField === 'new'
  log.bulletIsAboutTheItem = on() === 'On “second item words”'
  log.bulletWrites = await write('from the bullet', BODY.replace('- second item words', '- {==second item words==}{>>from the bullet<<}'))
  log.bulletUndone = await undo()

  /* ---------- READ: from a paragraph's end, on into a list ---------- */

  const para = block('ends here')
  const items = block('first item words')
  await span(point(para, texts(para).all.length), point(items, texts(items).all.indexOf('first item') + 'first item'.length))
  chordM()
  await sleep(300)
  log.onwardOpensTheField = field()?.dataset.cmtField === 'new'
  log.onwardIsAboutTheList = on() === 'On “first item”'
  log.onwardWrites = await write('onward', BODY.replace('- first item words', '- {==first item==}{>>onward<<} words'))
  log.onwardUndone = await undo()

  /* ---------- READ: a table's cell, and a pipe said in it ---------- */

  await select(cell('beta cell'), 'beta')
  offer()?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  await sleep(300)
  log.cellOpensTheField = field()?.dataset.cmtField === 'new'
  log.cellIsAboutItsWords = on() === 'On “beta”'
  const PIPED = BODY.replace('| beta cell |', '| {==beta==}{>>this \\| that<<} cell |')
  log.cellWritesThePipeEscaped = await write('this | that', PIPED)
  await sleep(400)
  const rows = [...(notePane()?.querySelectorAll('tbody tr') ?? [])]
  log.tableKeepsItsCells = rows.length === 1 && rows[0].querySelectorAll('td').length === 2
  log.cellCardInTheMargin = Boolean(card('this | that'))
  card('this | that')?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  await sleep(300)
  log.cellCardOpens = field()?.dataset.cmtField === 'old' && box()?.value === 'this | that'
  await type(box(), 'this | that | other')
  await press(box(), 'Enter')
  const CHANGED = BODY.replace('| beta cell |', '| {==beta==}{>>this \\| that \\| other<<} cell |')
  log.cellChangedEscaped = await settle(CHANGED)
  await sleep(400)
  card('this | that | other')?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  await sleep(300)
  field()?.querySelector('[data-cmt-resolve]')?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  log.cellResolves = await settle(BODY)
  await sleep(300)

  // Across two cells, the first one's words from where it starts.
  const alphaCell = cell('alpha cell')
  const betaCell = cell('beta cell')
  await span(point(alphaCell, 0), point(betaCell, 'beta'.length))
  chordM()
  await sleep(300)
  log.acrossCellsIsTheFirst = on() === 'On “alpha cell”'
  await press(box(), 'Escape')
  log.acrossCellsWroteNothing = !field() && (await disk()) === BODY

  /* ---------- READ: still nothing on code, or on another note's lines ---------- */

  await select(block('const code'), 'const code')
  chordM()
  await sleep(300)
  log.codeOpensNothing = !field()
  log.codeSaysSo = (offer()?.textContent ?? '').startsWith('Not here')
  await sleep(1700)
  log.codeWroteNothing = (await disk()) === BODY

  if (log.embedDrawn) {
    await select(block('another note'), 'another note')
    chordM()
    await sleep(300)
    log.embedOpensNothing = !field()
    log.embedWroteNothing = (await disk()) === BODY && (await disk(OTHER_PATH)) === OTHER_BODY
  }

  // Its note missing, the embed is a muted line of its own — still not words.
  if (log.mutedEmbedDrawn) {
    await sleep(1700)
    await select(block('Could not find'), 'Could not find')
    chordM()
    await sleep(300)
    log.mutedEmbedOpensNothing = !field()
    log.mutedEmbedSaysSo = (offer()?.textContent ?? '').startsWith('Not here')
    if (field()) await press(box(), 'Escape')
    await sleep(1700)
    log.mutedEmbedWroteNothing = (await disk()) === BODY

    // From it on into the prose after: the prose's words.
    const muted = block('Could not find')
    const last = block('Last line of prose')
    await span(point(muted, 0), point(last, 'Last line'.length))
    chordM()
    await sleep(300)
    log.fromMutedEmbedIsTheProseAfter = on() === 'On “Last line”'
    await press(box(), 'Escape')
    log.fromMutedEmbedWroteNothing = !field() && (await disk()) === BODY
  }

  /* ---------- WRITE: the caret in a table's row ---------- */

  window.getSelection()?.removeAllRanges()
  key('e')
  for (let i = 0; i < 30 && !content(); i++) await sleep(100)
  await sleep(500)
  log.inWrite = Boolean(content())
  // The embed's line as written, the caret on it: still no comment.
  log.caretInTheEmbed = await caretIn('Nowhere')
  chordM()
  await sleep(300)
  log.embedLineOpensNothing = !field()
  if (field()) await press(box(), 'Escape')
  await sleep(1700)
  log.embedLineWroteNothing = (await disk()) === BODY
  log.caretInTheRow = await caretIn('alpha')
  chordM()
  await sleep(300)
  log.rowTakesTheWord = on() === 'On “alpha”'
  await type(box(), 'which alpha?')
  await press(box(), 'Enter')
  log.rowWrites = await settle(BODY.replace('| alpha cell |', '| {==alpha==}{>>which alpha?<<} cell |'))

  log.pass = Boolean(
    log.opened &&
      log.embedDrawn &&
      log.bulletIsNotTheWords &&
      log.bulletOpensTheField &&
      log.bulletIsAboutTheItem &&
      log.bulletWrites &&
      log.bulletUndone &&
      log.onwardOpensTheField &&
      log.onwardIsAboutTheList &&
      log.onwardWrites &&
      log.onwardUndone &&
      log.cellOpensTheField &&
      log.cellIsAboutItsWords &&
      log.cellWritesThePipeEscaped &&
      log.tableKeepsItsCells &&
      log.cellCardInTheMargin &&
      log.cellCardOpens &&
      log.cellChangedEscaped &&
      log.cellResolves &&
      log.acrossCellsIsTheFirst &&
      log.acrossCellsWroteNothing &&
      log.codeOpensNothing &&
      log.codeSaysSo &&
      log.codeWroteNothing &&
      log.embedOpensNothing &&
      log.embedWroteNothing &&
      log.mutedEmbedDrawn &&
      log.mutedEmbedOpensNothing &&
      log.mutedEmbedSaysSo &&
      log.mutedEmbedWroteNothing &&
      log.fromMutedEmbedIsTheProseAfter &&
      log.fromMutedEmbedWroteNothing &&
      log.inWrite &&
      log.caretInTheEmbed &&
      log.embedLineOpensNothing &&
      log.embedLineWroteNothing &&
      log.caretInTheRow &&
      log.rowTakesTheWord &&
      log.rowWrites
  )
  return JSON.stringify(log, null, 1)
})()
