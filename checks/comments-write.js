// COMMENTS ARE WRITTEN — in READ without leaving it, and in WRITE as one step.
//
// Select words and the offer that says `quote` says `comment` beside it; ⌥⌘M
// does the same. Both open a small field under the words, saying which words
// it is about; ↵ writes `{==words==}{>>what you typed<<}` into the note, and
// esc closes it. In READ the comment goes through the note's own save — READ
// stays READ, and ⌘Z there takes it back, as a ticked box is. In WRITE it is
// one change to the editor's document, one step of its undo; with nothing
// selected it takes the word at the caret, since a comment on nothing is hard
// to find again, and where there is no word it says so and writes nothing.
//
// A comment pressed opens the same field with its words and a ✓: ↵ changes
// what it says, ✓ resolves it — the comment goes and its anchor's words stay,
// unwrapped. Esc with words typed asks first: Keep writing is the answer the
// focus rests on, esc in the question is no, so esc pressed six times opens and
// closes it three times and discards nothing; ⌘⌫ is the discard, and writes
// nothing to the note.
//
// Red at the commit before: no `comment` offer. Seeds its own note; wants a
// throwaway LANES_VAULT and LANES_STATE. See checks/README.md.
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
  const block = (s) => [...(notePane()?.querySelectorAll('[data-md-from]') ?? [])].find((d) => d.textContent.includes(s))
  const mode = (m) => notePane()?.querySelector(`[data-mode="${m}"]`)?.dataset.on === '1'
  const field = () => scroller()?.querySelector('[data-cmt-field]')
  const box = () => field()?.querySelector('textarea')
  const card = (t) => [...(scroller()?.querySelectorAll('[data-cmt-card]') ?? [])].find((c) => c.textContent.trim() === t)
  const flat = (s) => (s ?? '').replace(/\s+/g, ' ').trim()
  /** The words `s` selected in `el`, across however many text nodes draw them, and the page told. */
  const select = async (el, s) => {
    const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
    const nodes = []
    let all = ''
    for (let n; (n = walk.nextNode()); ) {
      nodes.push([n, all.length])
      all += n.data
    }
    const at = all.indexOf(s)
    if (at < 0) return false
    const point = (i) => {
      for (let k = nodes.length - 1; k >= 0; k--) if (nodes[k][1] <= i) return [nodes[k][0], i - nodes[k][1]]
      return [nodes[0][0], 0]
    }
    const r = document.createRange()
    r.setStart(...point(at))
    r.setEnd(...point(at + s.length))
    const sel = window.getSelection()
    sel.removeAllRanges()
    sel.addRange(r)
    document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }))
    await sleep(250)
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
  const TITLE = `Write check ${stamp}`
  const BODY = [
    `# ${TITLE}`,
    '',
    'The plan rests on crop rotation as its frame.',
    '',
    'A second paragraph about the association and its rent.',
    '',
    ''
  ].join('\n')
  const made = await window.lanes.noteCreate(TITLE, '_unfiled')
  const PATH = made.path || `_unfiled/write-check-${stamp}.md`
  await window.lanes.noteWrite(PATH, BODY)
  const disk = async () => (await window.lanes.note(PATH))?.body ?? ''
  const settle = async (want) => {
    for (let i = 0; i < 30 && (await disk()) !== want; i++) await sleep(150)
    return (await disk()) === want
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
  for (let i = 0; i < 40 && !block('as its frame'); i++) await sleep(100)
  log.opened = Boolean(block('as its frame'))
  if (!log.opened) return JSON.stringify({ ...log, pass: false }, null, 1)
  if (document.querySelectorAll('[data-pane]').length > 1) alt('Digit2')
  await sleep(700)

  /* ---------- READ: the offer beside quote, the field, the save ---------- */

  await select(block('as its frame'), 'crop rotation')
  const offer = scroller()?.querySelector('[data-comment-offer]')
  log.offerBesideQuote = Boolean(offer) && Boolean(scroller()?.querySelector('[data-quote-offer]'))
  offer?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  await sleep(300)
  log.fieldOpens = field()?.dataset.cmtField === 'new' && document.activeElement === box()
  log.fieldSaysTheWords = flat(field()?.querySelector('.cmt-field-on')?.textContent) === 'On “crop rotation”'
  const fb = field()?.getBoundingClientRect()
  // The block's box is its contents': its marker is `display: contents`.
  const wr = document.createRange()
  wr.selectNodeContents(block('as its frame'))
  const wb = wr.getBoundingClientRect()
  log.fieldUnderTheWords = Boolean(fb && wb) && fb.top >= wb.top + 10 && fb.top <= wb.bottom + 30
  await type(box(), 'define this?')
  await press(box(), 'Enter')
  const ONE = BODY.replace('crop rotation', '{==crop rotation==}{>>define this?<<}')
  log.writtenToTheNote = await settle(ONE)
  log.stillRead = mode('READ') && !content()
  log.fieldClosed = !field()
  await sleep(300)
  log.cardInTheMargin = Boolean(card('define this?'))

  // ⌘Z in READ takes it back, and ⇧⌘Z gives it again: the note's own save.
  key('z')
  log.undoneInRead = await settle(BODY)
  key('z', { shiftKey: true })
  log.redoneInRead = await settle(ONE)
  await sleep(400)

  /* ---------- pressed: the same field, its words, and ↵ changes them ---------- */

  card('define this?')?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  await sleep(300)
  log.pressOpensIt = field()?.dataset.cmtField === 'old' && box()?.value === 'define this?'
  log.itCanResolve = Boolean(field()?.querySelector('[data-cmt-resolve]'))
  await type(box(), 'define it before first use')
  await press(box(), 'Enter')
  const TWO = ONE.replace('define this?', 'define it before first use')
  log.editedInPlace = await settle(TWO)
  await sleep(300)

  /* ---------- esc asks before it throws words away ---------- */

  card('define it before first use')?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  await sleep(300)
  await type(box(), 'define it before first use, and say why')
  await press(box(), 'Escape')
  const ask = () => field()?.querySelector('[data-cmt-ask]')
  log.escAsks = Boolean(ask())
  log.keepIsTheDefault = document.activeElement === field()?.querySelector('[data-cmt-keep]')
  const seen = []
  for (let i = 0; i < 6; i++) {
    await press(ask() ? field() : box(), 'Escape')
    seen.push(ask() ? 'open' : 'shut')
  }
  log.escToggles = seen.join(' ')
  log.escOnlyEverTogglesIt = log.escToggles === 'shut open shut open shut open'
  log.wordsStillThere = box()?.value === 'define it before first use, and say why'
  await press(field(), 'Backspace', { metaKey: true })
  log.discardClosesIt = !field()
  log.discardWroteNothing = (await disk()) === TWO

  /* ---------- ✓ resolves: the comment goes, its words stay ---------- */

  card('define it before first use')?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  await sleep(300)
  field()?.querySelector('[data-cmt-resolve]')?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  log.resolvedLeavesTheWords = await settle(BODY)
  await sleep(300)
  log.noCardLeft = !card('define it before first use')

  /* ---------- ⌥⌘M in READ ---------- */

  await select(block('the association'), 'the association')
  chordM()
  await sleep(300)
  log.chordOpensIt = field()?.dataset.cmtField === 'new' && flat(field()?.querySelector('.cmt-field-on')?.textContent) === 'On “the association”'
  await type(box(), 'which association?')
  await press(box(), 'Enter')
  const THREE = BODY.replace('the association', '{==the association==}{>>which association?<<}')
  log.chordWrites = await settle(THREE)

  /* ---------- WRITE: the word at the caret, one step of the editor's undo ---------- */

  key('e')
  for (let i = 0; i < 30 && !content(); i++) await sleep(100)
  await sleep(500)
  log.inWrite = Boolean(content())
  log.caretPlaced = await caretIn('rent')
  chordM()
  await sleep(300)
  log.writeTakesTheWord = flat(field()?.querySelector('.cmt-field-on')?.textContent) === 'On “rent”'
  await type(box(), 'how much?')
  await press(box(), 'Enter')
  const FOUR = THREE.replace('rent', '{==rent==}{>>how much?<<}')
  log.writtenInWrite = await settle(FOUR)
  log.stillWrite = mode('WRITE') && Boolean(content())
  log.caretBack = document.activeElement === content()
  // One step of the editor's own undo, and one of its redo.
  content()?.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', metaKey: true, bubbles: true, cancelable: true }))
  log.undoneInWrite = await settle(THREE)
  content()?.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', metaKey: true, shiftKey: true, bubbles: true, cancelable: true }))
  log.redoneInWrite = await settle(FOUR)
  await sleep(400)

  // Pressed and changed in WRITE, then resolved there.
  card('how much?')?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  await sleep(300)
  log.writePressOpensIt = box()?.value === 'how much?'
  await type(box(), 'how much, and for how long?')
  await press(box(), 'Enter')
  const FIVE = FOUR.replace('how much?', 'how much, and for how long?')
  log.editedInWrite = await settle(FIVE)
  await sleep(300)
  card('how much, and for how long?')?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  await sleep(300)
  field()?.querySelector('[data-cmt-resolve]')?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  log.resolvedInWrite = await settle(THREE)

  // Nothing to be about: a blank line says so and writes nothing.
  const blank = [...(notePane()?.querySelectorAll('.cm-line') ?? [])].filter((l) => !l.textContent.trim()).pop()
  if (blank) {
    const b = blank.getBoundingClientRect()
    const at = { bubbles: true, cancelable: true, clientX: b.left + 2, clientY: b.top + b.height / 2, button: 0, detail: 1, view: window }
    ;(document.elementFromPoint(at.clientX, at.clientY) ?? blank).dispatchEvent(new MouseEvent('mousedown', at))
    document.dispatchEvent(new MouseEvent('mouseup', at))
    await sleep(250)
  }
  chordM()
  await sleep(300)
  log.nothingToBeAboutOpensNothing = !field() && (await disk()) === THREE

  log.pass = Boolean(
    log.offerBesideQuote &&
      log.fieldOpens &&
      log.fieldSaysTheWords &&
      log.fieldUnderTheWords &&
      log.writtenToTheNote &&
      log.stillRead &&
      log.fieldClosed &&
      log.cardInTheMargin &&
      log.undoneInRead &&
      log.redoneInRead &&
      log.pressOpensIt &&
      log.itCanResolve &&
      log.editedInPlace &&
      log.escAsks &&
      log.keepIsTheDefault &&
      log.escOnlyEverTogglesIt &&
      log.wordsStillThere &&
      log.discardClosesIt &&
      log.discardWroteNothing &&
      log.resolvedLeavesTheWords &&
      log.noCardLeft &&
      log.chordOpensIt &&
      log.chordWrites &&
      log.inWrite &&
      log.caretPlaced &&
      log.writeTakesTheWord &&
      log.writtenInWrite &&
      log.stillWrite &&
      log.caretBack &&
      log.undoneInWrite &&
      log.redoneInWrite &&
      log.writePressOpensIt &&
      log.editedInWrite &&
      log.resolvedInWrite &&
      log.nothingToBeAboutOpensNothing
  )
  return JSON.stringify(log, null, 1)
})()
