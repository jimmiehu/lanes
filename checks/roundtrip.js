// ONE LINE TYPED IN IS ONE LINE CHANGED IN THE FILE — frontmatter and all.
//
// This used to be about committing one block from READ. That is gone: READ is
// read-only, and the editor saves as you type — the WHOLE document, every time.
// Which makes the claim larger rather than smaller, because every save is now a
// chance for the editor to rewrite something on its way to disk. Typing at the
// end of one paragraph must change that line and not one other byte:
//
// - not the title line and the blank under it, which the editor hides because
//   the head already says them;
// - not the markers it draws as furniture — a bullet's dash, a task's box, a
//   quote's rule — or the marks it hides: `**`, `*`, backticks, a link's
//   `(url)`, a wikilink's brackets;
// - not the things an editor is tempted to tidy: a tab, two trailing spaces
//   that make a break, a non-breaking space, a table, an HTML comment, a fence
//   with odd spacing inside it, and whether the file ends in a newline.
//
// A box ticked from its widget — an edit the editor makes itself, not one
// typed — changes that one character. And a trip to READ and back writes
// nothing at all: not other bytes, and not the same bytes again, so the file's
// mtime does not move either.
//
// THE FRONTMATTER never reaches the editor: main strips it before any renderer
// sees the note and puts it back on every save. So all three are asked. The
// editor never shows it. The body the app reads back never carries it — it
// cannot then have been written into the body, or written twice. And the FILE
// still does, which no reader the renderer has will say directly: `note()`
// strips it by design. The one that sees raw text is the vault's content
// index, which the 30-second sweep rebuilds from disk once a note's mtime
// moves. So the check waits until the index shows the LAST save — the tick —
// and then asks it for every line of the frontmatter, each of which must come
// back whole. That wait is up to half a minute, and it is the honest price of
// reading the file rather than believing it.
//
// Seeds its own note through the app's IPC, stamped per run so nothing an
// earlier run wrote is in the way (a frontmatter a rerun inherited would be
// kept, and doubled). Run against a throwaway LANES_VAULT and a fresh
// LANES_STATE. See checks/README.md.
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
   * handling, the way a person's does. Setting the page's selection directly
   * is not the same act: the editor only adopts a DOM selection while its
   * window is the front one, and a driven run cannot promise that.
   */
  const clickAt = async (node, offset, after = false) => {
    const r = document.createRange()
    const a = Math.max(0, Math.min(offset, node.data.length - 1))
    r.setStart(node, a)
    r.setEnd(node, Math.min(node.data.length, a + 1))
    const box = r.getBoundingClientRect()
    const x = after ? box.right + 1 : box.left + 0.5
    const y = box.top + box.height / 2
    const at = { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0, detail: 1, view: window }
    ;(document.elementFromPoint(x, y) ?? node.parentElement).dispatchEvent(new MouseEvent('mousedown', at))
    document.dispatchEvent(new MouseEvent('mouseup', at))
    await sleep(250)
  }
  const textNodes = (el) => {
    const out = []
    const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
    let n
    while ((n = walk.nextNode())) if (n.data.length && !n.parentElement?.closest('[contenteditable="false"]')) out.push(n)
    return out
  }
  /** The caret at the very end of the line that shows `s`. */
  const caretAtEnd = async (s) => {
    const line = lineWith(s)
    const nodes = line ? textNodes(line) : []
    const last = nodes[nodes.length - 1]
    if (!last) return false
    await clickAt(last, last.data.length - 1, true)
    return document.activeElement === content()
  }
  /** Which lines differ — for reading a failure, not for deciding one. */
  const diff = (a, b) => {
    const x = a.split('\n')
    const y = b.split('\n')
    if (x.length !== y.length) return `line count ${x.length} -> ${y.length}`
    const d = x.map((l, i) => (l === y[i] ? null : i)).filter((i) => i !== null)
    return d.length ? `lines ${d.join(',')}` : 'none'
  }
  const log = {}

  const stamp = Date.now().toString(36)
  const TITLE = `Round trip ${stamp}`
  const CANARY = `velvet-${stamp}`
  /*
   * Every line between the fences carries the stamp, because each is looked up
   * in the index on its own and the index answers twenty notes at most: an
   * earlier run's `aliases:` would otherwise crowd this one out. The stamp on
   * `aliases:` rides in a YAML comment, which keeps the key a real one — and a
   * comment is what a save that parsed and re-wrote the YAML would drop.
   */
  const FRONT_LINES = [
    `tags: [check, roundtrip-${stamp}]`,
    `canary: ${CANARY}`,
    `aliases: # kept as written, ${stamp}`,
    `  - "Round trip ${stamp}, kept"`
  ]
  const FRONT = ['---', ...FRONT_LINES, '---', ''].join('\n')
  const TASK = `the task that gets ticked (${stamp})`
  const BODY = [
    `# ${TITLE}`,
    '',
    'First paragraph, the one that gets typed into.',
    '',
    'Second paragraph with **bold**, *soft*, `code`, a [link](https://example.com) and a [[wikilink]].',
    '',
    '- a bullet',
    '  - an indented bullet',
    `- [ ] ${TASK}`,
    '- [x] a task already done',
    '1. first',
    '2. second',
    '',
    '> a quoted line',
    '',
    '## A heading',
    '',
    '```js',
    'const  spaced =   "kept"  ',
    '```',
    '',
    '| a | b |',
    '|---|---|',
    '| 1 | 2 |',
    '',
    'Two trailing spaces make a break here  ',
    'and the line after it.',
    '\tA line that starts with a tab, and a non-breaking space.',
    '<!-- a comment the page never shows -->',
    'The last line, with no newline after it.'
  ].join('\n')
  const TYPED = ` edited-${stamp}`
  const EDITED = BODY.replace('the one that gets typed into.', `the one that gets typed into.${TYPED}`)
  const TICKED = EDITED.replace(`- [ ] ${TASK}`, `- [x] ${TASK}`)

  // --- seed it: the frontmatter above the body, the way a vault has it ---
  const made = await window.lanes.noteCreate(TITLE, '_unfiled')
  log.path = made.path ?? null
  if (!made.ok || !made.path) return { ...log, reason: made.reason ?? null, pass: false }
  const PATH = made.path
  const bodyOf = async () => (await window.lanes.note(PATH))?.body ?? ''
  /*
   * The disk lags the editor by three debounces — 150ms, 250ms, 500ms. Every
   * read waits that out and then for two reads that agree, or the check is
   * testing its own timing rather than the app's.
   */
  const settled = async () => {
    await sleep(1800)
    let last = null
    for (let i = 0; i < 20; i++) {
      const now = await bodyOf()
      if (now === last) return now
      last = now
      await sleep(250)
    }
    return last ?? ''
  }
  // The file made a moment ago has no frontmatter, so this writes FRONT + BODY
  // as they are. Reading back exactly BODY is main stripping FRONT — which it
  // only does to a block at the very top of the file.
  await window.lanes.noteWrite(PATH, FRONT + BODY)
  log.seeded = (await bodyOf()) === BODY
  if (!log.seeded) return { ...log, pass: false }

  // --- open it the way a person would: by finding it ---
  key('k')
  await sleep(600)
  const box = document.querySelector('[data-palette-input]')
  const setIn = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
  if (box) {
    setIn.call(box, TITLE)
    box.dispatchEvent(new Event('input', { bubbles: true }))
    await sleep(1000)
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    await sleep(1800)
  }
  // A note opens in READ; writing is asked for, with ⌘E.
  if (!content()) key('e')
  for (let i = 0; i < 15 && !lineWith('First paragraph'); i++) await sleep(200)
  log.opened =
    Boolean(lineWith('First paragraph')) &&
    pane(1)?.querySelector('[data-note-title]')?.textContent.trim() === TITLE
  if (!log.opened) return { ...log, pass: false }
  log.frontmatterNotInTheEditor = !(content()?.textContent ?? '').includes(CANARY)

  // --- typed at the end of one paragraph ---
  log.caretPlaced = await caretAtEnd('the one that gets typed into.')
  type(TYPED)
  const afterTyping = await settled()
  log.linesChangedByTyping = diff(BODY, afterTyping)
  log.typingChangedOnlyThatLine = afterTyping === EDITED

  // --- a box ticked from its widget ---
  const taskBox = [...(pane(1)?.querySelectorAll('.cm-md-task') ?? [])].find((b) =>
    b.closest('.cm-line')?.textContent.includes(TASK)
  )
  log.foundBox = Boolean(taskBox)
  if (taskBox) {
    const r = taskBox.getBoundingClientRect()
    const at = { bubbles: true, cancelable: true, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2, button: 0, detail: 1, view: window }
    taskBox.dispatchEvent(new MouseEvent('mousedown', at))
    taskBox.dispatchEvent(new MouseEvent('mouseup', at))
    taskBox.dispatchEvent(new MouseEvent('click', at))
  }
  const afterTick = await settled()
  log.linesChangedByTick = diff(afterTyping, afterTick)
  log.tickChangedOnlyThatBox = afterTick === TICKED

  // --- to READ and back: nothing owed, so nothing written ---
  // The tick has settled, so the mtime now is the last save's. A trip that
  // wrote the same text again would pass the text test and move this.
  const m0 = await window.lanes.noteMtime(PATH)
  key('e')
  await sleep(800)
  log.wentToRead = !content()
  key('e')
  await sleep(1000)
  log.cameBack = Boolean(content())
  const afterTrip = await settled()
  log.mtimeAcrossTheTrip = [m0, await window.lanes.noteMtime(PATH)]
  log.modeTripWroteNothing =
    log.wentToRead &&
    log.cameBack &&
    afterTrip === TICKED &&
    m0 !== null &&
    log.mtimeAcrossTheTrip[1] === m0

  // --- the frontmatter: never in the body... ---
  log.bodyNeverCarriesIt = !afterTrip.startsWith('---') && !afterTrip.includes(CANARY)

  // --- ...and still in the file, asked of the index once it has read the last save ---
  // The ticked line exists in no version of the file before the last save, so
  // an index that finds it read the file after that save — in one read, with
  // whatever frontmatter the file had at the time.
  const PROOF = `[x] ${TASK}`
  const t0 = performance.now()
  let caughtUp = false
  while (performance.now() - t0 < 45000) {
    caughtUp = (await window.lanes.searchContent(PROOF)).some((h) => h.path === PATH)
    if (caughtUp) break
    await sleep(1500)
  }
  log.indexCaughtUpAfterMs = Math.round(performance.now() - t0)
  log.indexReadTheLastSave = caughtUp
  // Each line, whole. The index holds the file folded to lower case and a
  // snippet is its line trimmed, so a line kept byte for byte comes back as
  // exactly that; one a save dropped or rewrote does not.
  log.frontmatterAsIndexed = []
  if (caughtUp) {
    for (const line of FRONT_LINES) {
      const hit = (await window.lanes.searchContent(line)).find((h) => h.path === PATH)
      log.frontmatterAsIndexed.push(hit?.snippet ?? null)
    }
  }
  // In the file and not in the body is in the block main strips — the top.
  log.frontmatterStillInTheFile =
    caughtUp && FRONT_LINES.every((l, i) => log.frontmatterAsIndexed[i] === l.toLowerCase().trim())

  log.noConflictBanner = !/changed on disk while you were editing/.test(document.body.innerText)

  log.pass = Boolean(
    log.seeded &&
      log.opened &&
      log.frontmatterNotInTheEditor &&
      log.typingChangedOnlyThatLine &&
      log.tickChangedOnlyThatBox &&
      log.modeTripWroteNothing &&
      log.bodyNeverCarriesIt &&
      log.indexReadTheLastSave &&
      log.frontmatterStillInTheFile &&
      log.noConflictBanner
  )
  return log
})()
