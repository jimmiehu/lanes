// THE WRITING SURFACE, DRIVEN THE WAY A PERSON DRIVES IT.
//
// This used to hold a textarea to the mirror painted under it: one box, one set
// of metrics, one row per source line — because any character the mirror added
// or dropped moved every character after it out from under the caret. That
// machinery is gone: the mirror, the field, and the browser's own undo that was
// the reason for having a textarea at all. CodeMirror lays the text out itself,
// so the one claim the alignment existed to protect is now asked of the editor
// directly: a click lands on the character drawn under it, however many hidden
// marks sit before it on the line.
//
// The rest is what the surface promises a writer:
//
//  - READ's type, size for size. ⌘E between the two changes the size of no
//    word — body, `##`, `###` and `####` alike.
//  - The markdown drawn live. Every mark is put away but the one token the caret
//    touches; a heading's hashes hang in the margin, so showing them moves
//    nothing; bullets and boxes are furniture the words never shift for; a
//    quote is drawn as a quote with its `> ` put away, a fence as code, and a
//    done task as done. A fence's ``` lines fold away until the caret stands
//    on one — and a click into the code leaves them folded, so nothing moves
//    under the pointer.
//  - ⌘B and ⌘I wrap the word under the caret and unwrap one already marked —
//    and on a word with the OTHER mark, trade it: READ has no bold italic, and
//    `***word***` is drawn there as a bold word between two stars. In a phrase
//    of several words the phrase is what they act on, as READ reads it: ⌘B on a
//    word of `**bold whole words**` takes the bold off all of it, ⌘I on a word
//    of `*aside well made*` the italic, ⌘B on a whole phrase ⇧⌥← has selected
//    takes it off, and ⌘B on one word selected inside a bold phrase splits it
//    out — `**one** two **three**`. Red while they read only the stars beside
//    the word: `**bold **whole** words**`, `*aside *well* made*`,
//    `****bolded** **`, `**one **two** three**` — stars READ shows.
//  - ⌘B over a triple-clicked item — the line and its break — marks the item's
//    words, not its marker and not the next item (red: `**- triple me\n**- leave
//    me`). A pair ⌘B put down is taken back up by ⌘B, and ⌘B, type, ⌘B, type
//    ends the bold where the second ⌘B was (red: `****` stacked, and the second
//    ⌘B took the bold off the word just typed).
//  - ↵ inside a bold phrase closes it before the break and opens it after, and
//    a paste of two lines into one goes in between the two halves (red: stars
//    on both lines). ⌘X of a selection that takes a phrase's closing marks puts
//    the part it took on the clipboard with both of its own, and ⌘V straight
//    back gives back what was there (red: the stray `**` pasted back).
//  - A double-click takes the word you pointed at. The first click brings a
//    token's marks out and the line moves under the pointer; red while the
//    second click was read against the moved line — a double-click on "notes"
//    in a wikilink selected a piece of its hidden target, and typing over it
//    rewrote where the link goes.
//    ⌘↵ makes a line a task, ticks it, and unticks it. ⌥↑ and ⌥↓ move a line.
//  - The word keys count what is SEEN. ⌥⌫ and ⌥⌦ step over a hidden mark
//    rather than taking it as a word of punctuation, and take a token whose
//    words they emptied away whole — no `**` left open, no wikilink target or
//    URL brought out of hiding; ⌥← lands at the word, and ⇧⌥← selects the
//    token whole — a phrase of two words too, over two presses, though the
//    first press brings its marks out (red: the second stopped against the
//    `**` it had just shown, and ⌫ left half the pair). And a selection that
//    reaches only partly into a phrase — one ⇧⌥← into `**bold phrase here** `
//    — takes the words it holds and leaves the marks it only half holds, as a
//    word processor keeps the bold on the words it did not take; what is typed
//    over one goes where its first seen letter was (red: ⌫ took the closing
//    `**` with "here" and left `**bold phrase` open; typing over "here" and the
//    link's hidden `](url)` took the URL). An item's marker is
//    furniture to them: ⌥⌫ at the start of
//    its words takes the item away as ⌫ does, ⌥← from there goes up a line
//    rather than nowhere, and ⌘⌫ clears the words and leaves the box.
//  - ⌘Z walks every one of those back to the note as it was seeded — the
//    editor's history, over the whole document, not the browser's and not a
//    line's.
//  - Focus lights the paragraph the caret is in; typewriter parks its line.
//  - What is typed reaches the FILE, the last characters before ⌘E included,
//    and the words go to the note they were typed into rather than to the one a
//    ⌘-click opens next. That ⌘-click opens the link in a tab of its own and
//    leaves the note you were writing in the strip. READ comes back as a
//    rendered document.
//
// The list keys — ↵, ⌫, ⇥ — are `note-writing.js`'s; the caret never standing
// inside a marker is `editortraps.js`'s.
//
// Seeds its own two notes through the app's IPC and opens the first the way a
// person would, by finding it. Run against a throwaway LANES_VAULT and
// LANES_STATE — it writes to both notes. See checks/README.md.
(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
  const pane = (i) => document.querySelector(`[data-pane="${i}"]`)
  const key = (k, extra = {}) =>
    window.dispatchEvent(new KeyboardEvent('keydown', { key: k, metaKey: true, bubbles: true, ...extra }))
  const content = () => pane(1)?.querySelector('.cm-content')
  const lines = () => [...(pane(1)?.querySelectorAll('.cm-line') ?? [])]
  const lineWith = (s) => lines().find((l) => l.textContent.includes(s))
  const press = (k, mods = {}) =>
    content()?.dispatchEvent(
      new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...mods })
    )
  const type = (text) => document.execCommand('insertText', false, text)
  const click = (el) => el && el.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  const aid = (name) => pane(1)?.querySelector(`[data-aid="${name}"]`)
  const modeOn = (m) => pane(1)?.querySelector(`[data-mode="${m}"]`)?.dataset.on === '1'
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
  /**
   * A line brought on screen before it is clicked — only if it is not there
   * already. A click aimed at a line below the fold lands on whatever the
   * pointer is over, which is not that line; and a line already in view must
   * not move, or the typewriter's click-leaves-the-page-alone means nothing.
   */
  const onScreen = async (line) => {
    const sc = pane(1)?.querySelector('[data-find-scope]')
    if (!line || !sc) return
    const r = line.getBoundingClientRect()
    const v = sc.getBoundingClientRect()
    if (r.top >= v.top && r.bottom <= v.bottom) return
    line.scrollIntoView({ block: 'center' })
    await sleep(200)
  }
  /**
   * The line showing `s`, drawn. The editor draws only the lines near the
   * screen, so a line further down the note is not in the page at all until it
   * is scrolled to — asked of the editor, which knows where every line is.
   * (This note's last lines were inside the drawn margin only while a blank
   * line was a third of a line high; a blank line is a line now.)
   */
  const drawn = async (s) => {
    let line = lineWith(s)
    if (line) return line
    const v = view()
    const sc = pane(1)?.querySelector('[data-find-scope]')
    const at = v ? v.state.doc.toString().indexOf(s) : -1
    if (!v || !sc || at < 0) return null
    sc.scrollTop += v.documentTop + v.lineBlockAt(at).top - sc.getBoundingClientRect().top - sc.clientHeight / 2
    for (let i = 0; i < 12 && !(line = lineWith(s)); i++) await sleep(80)
    return line ?? null
  }
  /** The caret INSIDE a piece of rendered text, `at` characters into it. */
  const caretIn = async (s, at = 1) => {
    await onScreen(await drawn(s))
    const line = lineWith(s)
    const n = line && textNodes(line).find((t) => t.data.includes(s))
    if (!n) return false
    await clickAt(n, n.data.indexOf(s) + at)
    return true
  }
  /** The caret at the very end of the line that shows `s`. */
  const caretAtEnd = async (s) => {
    await onScreen(await drawn(s))
    const line = lineWith(s)
    const nodes = line ? textNodes(line) : []
    const last = nodes[nodes.length - 1]
    if (!last) return false
    await clickAt(last, last.data.length - 1, true)
    return true
  }
  /** Where the first character of `s` is drawn, from the left of the window. */
  const leftOf = (s) => {
    const line = lineWith(s)
    const n = line && textNodes(line).find((t) => t.data.includes(s))
    if (!n) return null
    const r = document.createRange()
    const i = n.data.indexOf(s)
    r.setStart(n, i)
    r.setEnd(n, i + 1)
    return r.getBoundingClientRect().left
  }
  const near = (a, b) => a != null && b != null && Math.abs(a - b) < 0.5
  const view = () => content()?.cmTile?.view ?? content()?.cmView?.view ?? null
  /** What the editor has selected, as text. */
  const selected = () => {
    const v = view()
    const r = v?.state.selection.main
    return v && r ? v.state.sliceDoc(r.from, r.to) : ''
  }
  /**
   * A DOUBLE-CLICK on the word `w` in the line that shows `s`, as a hand makes
   * one: two presses at the same point, the second counted as the second, with
   * the moment between them in which the first one's caret brings a token's
   * marks out and the line moves.
   */
  /**
   * The caret just before `word`, on the line whose text holds `anchor` — marks
   * and all, since the page keeps a hidden mark's characters: a phrase's words
   * and the text after it are two pieces of text, and no one piece holds both.
   */
  const caretBefore = async (anchor, word) => {
    await onScreen(await drawn(anchor))
    const line = lineWith(anchor)
    const n = line && textNodes(line).find((t) => t.data.includes(word))
    if (!n) return false
    await clickAt(n, n.data.indexOf(word))
    return true
  }
  /** Some text pasted at the caret, as the page's paste reaches the editor. */
  const pasteText = (text) => {
    const dt = new DataTransfer()
    dt.setData('text/plain', text)
    content()?.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }))
  }
  /** Three presses at one point on the word `w` of the line that shows `s`: its line, and its break. */
  const tripleClick = async (s, w) => {
    await onScreen(await drawn(s))
    const line = lineWith(s)
    const n = line && textNodes(line).find((t) => t.data.includes(w))
    if (!n) return false
    const r = document.createRange()
    const i = n.data.indexOf(w) + 1
    r.setStart(n, i)
    r.setEnd(n, i + 1)
    const b = r.getBoundingClientRect()
    const x = b.left + b.width / 2
    const y = b.top + b.height / 2
    for (const detail of [1, 2, 3]) {
      const at = { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0, detail, view: window }
      ;(document.elementFromPoint(x, y) ?? n.parentElement).dispatchEvent(new MouseEvent('mousedown', at))
      document.dispatchEvent(new MouseEvent('mouseup', at))
      await sleep(detail === 3 ? 250 : 120)
    }
    return true
  }
  const doubleClick = async (s, w) => {
    await onScreen(await drawn(s))
    const line = lineWith(s)
    const n = line && textNodes(line).find((t) => t.data.includes(w))
    if (!n) return false
    const r = document.createRange()
    const i = n.data.indexOf(w) + 1
    r.setStart(n, i)
    r.setEnd(n, i + 1)
    const b = r.getBoundingClientRect()
    const x = b.left + b.width / 2
    const y = b.top + b.height / 2
    for (const detail of [1, 2]) {
      const at = { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0, detail, view: window }
      ;(document.elementFromPoint(x, y) ?? n.parentElement).dispatchEvent(new MouseEvent('mousedown', at))
      document.dispatchEvent(new MouseEvent('mouseup', at))
      await sleep(detail === 1 ? 150 : 250)
    }
    return true
  }
  /**
   * The type a piece of text is actually set in: the computed font of the
   * element holding its words. Measured on the words rather than on a block,
   * because READ and the editor wrap their blocks differently and a size set on
   * an outer box says nothing about what the words inherit inside it.
   */
  const typeOf = (root, s) => {
    if (!root) return null
    const walk = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
    let n
    while ((n = walk.nextNode())) {
      if (!n.data.includes(s) || !n.parentElement) continue
      const cs = getComputedStyle(n.parentElement)
      return {
        px: parseFloat(cs.fontSize),
        family: cs.fontFamily.split(',')[0].trim().replace(/["']/g, '').toLowerCase()
      }
    }
    return null
  }
  const banner = () => /changed on disk while you were editing/.test(document.body.innerText)
  const log = {}
  // Anything a click could not find to aim at. Not part of the verdict — the
  // claim that depended on it fails on its own — but it says which one to look at.
  log.missed = []
  const aim = async (what, placed) => {
    if (!(await placed)) log.missed.push(what)
  }

  // --- the second note first: the first one links to it by its real path ---
  const OTHER_BODY = ['# Writing other', '', 'A second note, which nothing typed in the first should reach.', ''].join('\n')
  const made2 = await window.lanes.noteCreate('Writing other', '_unfiled')
  const OTHER = made2.path || '_unfiled/writing-other.md'
  await window.lanes.noteWrite(OTHER, OTHER_BODY)

  // Filler at the END, so the lines the claims aim at are all drawn at the top
  // and the typewriter has somewhere lower down to park from.
  const filler = []
  for (let i = 1; i <= 24; i++) filler.push(`Filler paragraph ${i}, here to give the note some length.`, '')
  const BODY = [
    '# Writing check',
    '',
    'A paragraph with **bold words**, *soft words*, `some code`, a [link](https://example.com/a/long/way/off) and then plain words after it.',
    '',
    '## Lists',
    '',
    '- Keep the browser',
    '- Stay aligned',
    '- [ ] an open task',
    '- [x] a done task',
    '',
    '### Also drawn',
    '',
    'A lone paragraph, with one **firm** word, one quiet one and one *gentle* one.',
    '',
    'A **heavy** word to lean, and a *leaning* word to weigh down.',
    '',
    'Make this line a task.',
    '',
    'First of a pair.',
    'Second of a pair.',
    '',
    'Upper of a pair.',
    'Lower of a pair.',
    '',
    'Wordkeys delete back: keep **bold words** here and **vanish** now.',
    'Wordkeys links: a [[nowhere/at-all|linked note]] then a [site](https://example.com/x) after.',
    'Wordkeys forward: this **heavy** stays out.',
    'Wordkeys motion over a **dense** thing.',
    'Wordkeys select the **selectme** gone.',
    '',
    'Above the stuck item',
    '- Stuck item words',
    '- [ ] Task words leave with the item',
    '- [ ] Cmd clears these words',
    '',
    '#### Smaller still',
    '',
    '> A quoted line.',
    '',
    '```',
    'let x = 1',
    '```',
    '',
    // Below the fence, so the lines the first claims read are drawn at the top.
    'Twice over: see **two words** onward.',
    'Twice over: a [[nowhere/else|two titled]] beyond.',
    'Partly: a **bold phrase here** trailing.',
    'Partly typed: the [link text here](https://example.com/p) stays.',
    '',
    'Phrases: keep **bold whole words** here.',
    'Phrases: an *aside well made* there.',
    'Phrases: see **bolded** onto it.',
    'Phrases: split **one two three** apart.',
    '',
    'Double: see [[nowhere/else|kickoff notes]] now.',
    'Double: keep **bold words here** too.',
    '',
    '- triple me',
    '- leave me',
    '',
    'Pairs start here',
    'Break **bold words** apart.',
    'Paste into **bold words** here.',
    'Cut from **alpha data c** x end.',
    '',
    ...filler,
    `The other note is [[${OTHER.replace(/\.md$/, '')}|over here]].`,
    ''
  ].join('\n')

  // --- seed it, and open it the way a person would: by finding it ---
  const made = await window.lanes.noteCreate('Writing check', '_unfiled')
  const PATH = made.path || '_unfiled/writing-check.md'
  await window.lanes.noteWrite(PATH, BODY)
  const disk = async (p = PATH) => (await window.lanes.note(p))?.body ?? ''
  key('k')
  await sleep(600)
  const box = document.querySelector('[data-palette-input]')
  const setIn = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
  setIn.call(box, 'Writing check')
  box.dispatchEvent(new Event('input', { bubbles: true }))
  await sleep(1000)
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
  await sleep(1800)
  // A note opens in READ; writing is asked for, with ⌘E — which hands the
  // editor the caret, taken off it again for the measuring below.
  if (!content()) {
    key('e')
    for (let i = 0; i < 15 && !lineWith('A paragraph with'); i++) await sleep(200)
    await sleep(300)
    content()?.blur()
    await sleep(300)
  }
  for (let i = 0; i < 15 && !lineWith('A paragraph with'); i++) await sleep(200)

  // --- ONE EDITOR, in WRITE ---
  log.opensInWrite =
    modeOn('WRITE') &&
    content()?.getAttribute('contenteditable') === 'true' &&
    (pane(1)?.querySelectorAll('.cm-editor').length ?? 0) === 1 &&
    Boolean(lineWith('A paragraph with'))
  if (!log.opensInWrite) return { ...log, pass: false }

  // Measured now, before anything has the caret: every heading reads as it
  // reads, and READ is asked the same questions at the end.
  const WORDS = ['A paragraph with', 'Lists', 'Also drawn', 'Smaller still']
  const writeType = Object.fromEntries(WORDS.map((s) => [s, typeOf(content(), s)]))

  /* ---------- 1. the markdown, drawn live ---------- */

  // The caret on a line of its own: every mark in the paragraph put away, and
  // what they mark drawn instead.
  await aim('away', caretAtEnd('Make this line a task'))
  const para = () => lineWith('A paragraph with')
  const shown = () => para()?.innerText ?? ''
  log.awayHidesEveryMark = Boolean(para()) && !/[*`[\]]|example\.com/.test(shown())
  log.runsAreDrawn = Boolean(
    para()?.querySelector('.cm-md-strong') &&
      para()?.querySelector('.cm-md-em') &&
      para()?.querySelector('.cm-md-codespan') &&
      para()?.querySelector('.cm-md-link[data-href]')
  )
  // And the kinds a whole line is: a quote drawn as a quote with its `> ` put
  // away, a fence's lines as code, a done task as done. Asked now, before ⌘↵
  // below unticks that task.
  const quote = lineWith('A quoted line')
  log.quoteIsDrawn = Boolean(quote?.classList.contains('cm-md-quote')) && !/^\s*>/.test(quote?.innerText ?? '>')
  log.fenceIsDrawn = Boolean(lineWith('let x = 1')?.classList.contains('cm-md-code'))
  log.doneIsDrawn = Boolean(lineWith('a done task')?.classList.contains('cm-md-done'))

  // A fence's ``` lines fold to nothing with the caret off them, so the block
  // reads as READ draws it — the code in its card. A click INTO the code leaves
  // them folded: the opening fence is above the code, and bringing it back
  // there would move every line of the block down under the pointer — a
  // double-click on a word would take the word above it. Standing on a fence
  // line is what brings that one back. (Red with the fences opened for a
  // caret anywhere in the block.)
  const fences = () => lines().filter((l) => l.classList.contains('cm-md-fence'))
  const folded = (l) => getComputedStyle(l).fontSize === '0px'
  log.fencesFoldAway = fences().length === 2 && fences().every(folded)
  // On screen for the click, and the page put back after it: the claims
  // below aim at the paragraph at the top.
  const page = pane(1)?.querySelector('[data-find-scope]')
  const pageTop = page?.scrollTop ?? 0
  lineWith('let x = 1')?.scrollIntoView({ block: 'center' })
  await sleep(200)
  const codeTop = lineWith('let x = 1')?.getBoundingClientRect().top
  await aim('let x', caretIn('let x = 1', 0))
  log.clickInCodeMovesNothing =
    near(lineWith('let x = 1')?.getBoundingClientRect().top, codeTop) && fences().length === 2 && fences().every(folded)
  // ← from the start of the code is the end of the opening fence line.
  press('ArrowLeft')
  await sleep(150)
  log.fenceBackWhereYouStand = fences().length === 2 && !folded(fences()[0])
  if (page) page.scrollTop = pageTop
  await sleep(200)

  // A click lands on the character drawn under it. Everything to its left —
  // `**`, `*`, two backticks, `[` and a forty-character `](url)` — is hidden
  // at the moment of the click, so an editor that counted a hidden mark as
  // drawn, or a drawn one as hidden, puts this character somewhere else.
  await aim('then', caretIn('then plain', 0))
  type('§')
  await sleep(120)

  // In the link: THAT token comes back, and only it.
  await aim('link', caretIn('link', 2))
  log.linkRevealedWhereYouAre = shown().includes('[link](https://example.com/a/long/way/off)')
  log.onlyThatToken = !shown().includes('**') && !shown().includes('`') && !shown().includes('*soft')

  // And inside a bold word whose `**` is hidden to its left.
  await aim('bold', caretIn('bold words', 2))
  type('§')
  await sleep(120)

  // A heading's hashes hang in the margin: shown on the line you are in, hidden
  // on every other, and never taking room from the words — so the first letter
  // of the heading is where it was.
  const h3 = () => lineWith('Also drawn')
  const hashes = () => h3()?.querySelector('.cm-md-hmark')
  const hashesShown = () =>
    Boolean(hashes()) && !hashes().classList.contains('cm-md-off') && getComputedStyle(hashes()).visibility === 'visible'
  const h0 = leftOf('Also drawn')
  log.hashesHiddenAway = Boolean(hashes()) && !hashesShown()
  await aim('Also drawn', caretIn('Also drawn', 3))
  const h1 = leftOf('Also drawn')
  log.hashesShownWhereYouAre = hashesShown() && /###/.test(hashes()?.textContent ?? '')
  log.hashesHangInTheMargin = hashesShown() && h1 != null && hashes().getBoundingClientRect().right <= h1 + 0.5
  log.headingWordsStayPut = near(h0, h1)

  // Bullets and boxes are furniture: never revealed as `- ` or `[ ]`, not even
  // on the line the caret is in, and the words beside them do not move when it
  // arrives.
  const k0 = leftOf('Keep the browser')
  const t0 = leftOf('an open task')
  await aim('Keep', caretIn('Keep the browser', 2))
  const item = lineWith('Keep the browser')
  log.bulletIsFurniture =
    Boolean(item?.querySelector('.cm-md-bullet')) &&
    !/^\s*[-*+]\s/.test(item?.innerText ?? '') &&
    near(leftOf('Keep the browser'), k0)
  await aim('open task', caretIn('an open task', 3))
  const task = lineWith('an open task')
  log.boxIsFurniture =
    Boolean(task?.querySelector('.cm-md-task')) &&
    !/\[[ xX]\]/.test(task?.innerText ?? '') &&
    near(leftOf('an open task'), t0)

  /* ---------- 2. the keys ---------- */

  // ⌘B and ⌘I with nothing selected take the word under the caret — and on a
  // word already marked, take the marks away again.
  await aim('lone', caretIn('lone', 2))
  press('b', { metaKey: true })
  await sleep(150)
  await aim('firm', caretIn('firm', 2))
  press('b', { metaKey: true })
  await sleep(150)
  await aim('quiet', caretIn('quiet', 2))
  press('i', { metaKey: true })
  await sleep(150)
  await aim('gentle', caretIn('gentle', 2))
  press('i', { metaKey: true })
  await sleep(150)
  // And on a word with the other mark, the mark asked for REPLACES it. Stacked,
  // they are `***heavy***` — which READ draws as a bold word between two stars.
  await aim('heavy', caretIn('heavy', 2))
  press('i', { metaKey: true })
  await sleep(150)
  await aim('leaning', caretIn('leaning', 2))
  press('b', { metaKey: true })
  await sleep(150)

  // In a phrase, the phrase: the caret in one of its words, ⌘B or ⌘I takes the
  // mark off all of it — not a pair of marks more around the one word.
  await aim('whole', caretIn('whole words', 2))
  press('b', { metaKey: true })
  await sleep(150)
  await aim('well made', caretIn('well made', 2))
  press('i', { metaKey: true })
  await sleep(150)
  // A phrase ⇧⌥← took whole, marks and the space after it: ⌘B takes it off.
  await aim('onto it', caretIn('onto it', 0))
  press('ArrowLeft', { altKey: true, shiftKey: true })
  await sleep(150)
  press('b', { metaKey: true })
  await sleep(150)
  // One word selected inside a bold phrase: split out of it, the rest bold.
  await aim('two three', caretIn('two three', 0))
  press('ArrowRight', { altKey: true, shiftKey: true })
  await sleep(150)
  press('b', { metaKey: true })
  await sleep(150)

  // A double-click on a word in a wikilink's title, and on one in a bold
  // phrase: each one's first click brings the token's marks out, and the word
  // selected is still the one pointed at. Each from a caret on a line of its
  // own, so the token starts with its marks put away, as a reader sees it.
  await aim('dbl rest 1', caretAtEnd('Make this line a task'))
  await aim('notes', doubleClick('kickoff notes', 'notes'))
  log.doubleClickInALink = selected()
  type('NOTES')
  await sleep(150)
  await aim('dbl rest 2', caretAtEnd('Make this line a task'))
  await aim('here', doubleClick('bold words here', 'here'))
  log.doubleClickInBold = selected()
  type('HERE')
  await sleep(150)

  // ⌘↵: a plain line becomes a task, an open one is ticked, a done one is not.
  await aim('Make this', caretIn('Make this line a task', 3))
  press('Enter', { metaKey: true })
  await sleep(150)
  await aim('tick', caretIn('an open task', 3))
  press('Enter', { metaKey: true })
  await sleep(150)
  await aim('untick', caretIn('a done task', 3))
  press('Enter', { metaKey: true })
  await sleep(150)

  // ⌥↑ and ⌥↓ carry the line the caret is on past its neighbour — and only
  // that. The window's own ⌥↑ is "the note before this one", and a key the
  // editor handled used to go on up to it: the line moved, and so did you, to
  // another note entirely.
  await aim('Second', caretIn('Second of a pair', 3))
  press('ArrowUp', { altKey: true })
  await sleep(300)
  log.altUpStaysInTheNote = pane(1)?.querySelector('[data-note-title]')?.textContent.trim() === 'Writing check'
  await aim('Upper', caretIn('Upper of a pair', 3))
  press('ArrowDown', { altKey: true })
  await sleep(300)
  log.altDownStaysInTheNote = pane(1)?.querySelector('[data-note-title]')?.textContent.trim() === 'Writing check'

  // The word keys count what is SEEN. Every caret below is placed with the
  // marks around it put away — after a space, never touching a token — which
  // is where ⌥⌫ used to take the hidden `**` or `]] ` as a word of punctuation.
  const alt = { altKey: true }
  await aim('here and', caretIn('here and', 0))
  press('Backspace', alt)
  await sleep(150)
  await aim('now.', caretIn('now.', 0))
  press('Backspace', alt)
  await sleep(150)
  // Twice: the wikilink's title word by word, and then nothing of it is left.
  await aim('then a', caretIn('then a', 0))
  press('Backspace', alt)
  await sleep(150)
  press('Backspace', alt)
  await sleep(150)
  await aim('after.', caretIn('after.', 0))
  press('Backspace', alt)
  await sleep(150)
  await aim('forward: this', caretIn('forward: this', 13))
  press('Delete', alt)
  await sleep(150)
  // ⌥← from after a hidden token lands at the start of its word — the letter
  // typed there goes in front of the whole token, not between its word and
  // its closing `**`, which is where a step that counted the marks stopped.
  await aim('thing.', caretIn('thing.', 0))
  press('ArrowLeft', alt)
  await sleep(150)
  type('Z')
  await sleep(150)
  // ⇧⌥← takes the token whole, so ⌫ on the selection leaves no `**` behind.
  await aim('gone.', caretIn('gone.', 0))
  press('ArrowLeft', { altKey: true, shiftKey: true })
  await sleep(150)
  press('Backspace')
  await sleep(150)
  // ⌘B over a triple-clicked item: its words, and only its words.
  await aim('triple me', tripleClick('triple me', 'triple'))
  log.tripleSelected = selected()
  press('b', { metaKey: true })
  await sleep(150)
  // A pair put down and taken back up; then ⌘B, a word, ⌘B, and on in plain.
  await aim('Pairs', caretAtEnd('Pairs start here'))
  type(' ')
  for (const k of ['b', 'b']) {
    press(k, { metaKey: true })
    await sleep(80)
  }
  type('X ')
  press('b', { metaKey: true })
  await sleep(80)
  type('bold')
  press('b', { metaKey: true })
  await sleep(80)
  type(' plain')
  await sleep(150)
  // ↵ in the middle of a bold phrase.
  await aim('words apart', caretBefore('Break **bold', 'words'))
  press('Enter')
  await sleep(150)
  // Two lines pasted into a bold phrase.
  await aim('words here.', caretBefore('Paste into **bold', 'words'))
  pasteText('AA\nBB')
  await sleep(150)
  // ⌘X of `c** x` — a word and the phrase's closing marks — and ⌘V straight back.
  await aim('x end.', caretIn('x end.', 1))
  press('ArrowLeft', { altKey: true, shiftKey: true })
  await sleep(120)
  press('ArrowLeft', { altKey: true, shiftKey: true })
  await sleep(120)
  log.cutSelected = selected()
  const board = new DataTransfer()
  content()?.dispatchEvent(new ClipboardEvent('cut', { clipboardData: board, bubbles: true, cancelable: true }))
  await sleep(150)
  log.cutClip = board.getData('text/plain')
  content()?.dispatchEvent(new ClipboardEvent('paste', { clipboardData: board, bubbles: true, cancelable: true }))
  await sleep(150)
  // A phrase of two words over two presses, the first of which brings its
  // marks out — a bold one and a wikilink's title.
  log.twiceSelected = []
  for (const at of ['onward.', 'beyond.']) {
    await aim(at, caretIn(at, 0))
    press('ArrowLeft', { altKey: true, shiftKey: true })
    await sleep(150)
    press('ArrowLeft', { altKey: true, shiftKey: true })
    await sleep(150)
    log.twiceSelected.push(selected())
    press('Backspace')
    await sleep(150)
  }
  // One press into a phrase from outside: its last word and its closing marks
  // selected, and ⌫ takes the word and leaves the marks.
  await aim('trailing.', caretIn('trailing.', 0))
  press('ArrowLeft', { altKey: true, shiftKey: true })
  await sleep(150)
  press('Backspace')
  await sleep(150)
  // And typed over, through the page's own input: into a link's last word and
  // past its hidden `](url)` — the words replaced, the link kept.
  await aim('stays.', caretIn('stays.', 0))
  press('ArrowLeft', { altKey: true, shiftKey: true })
  await sleep(150)
  type('HERE ')
  await sleep(150)
  // From the start of an item's words ⌥← goes up to the line above — it used
  // to go to the line's start and be put straight back out of the marker.
  await aim('Stuck item', caretIn('Stuck item', 0))
  press('ArrowLeft', alt)
  await sleep(150)
  type('Y')
  await sleep(150)
  await aim('Task words', caretIn('Task words', 0))
  press('Backspace', alt)
  await sleep(150)
  await aim('Cmd clears', caretAtEnd('Cmd clears these words'))
  press('Backspace', { metaKey: true })
  await sleep(1500)

  const edited = await disk()
  log.clickLandsPastHiddenMarks = edited.includes('(https://example.com/a/long/way/off) and §then plain')
  log.clickLandsInsideBold = edited.includes('**bo§ld words**')
  log.boldWrapsTheWord = edited.includes('A **lone** paragraph')
  log.boldUnwraps = edited.includes('with one firm word') && !edited.includes('**firm**')
  log.italicWrapsTheWord = edited.includes('one *quiet* one')
  log.italicUnwraps = edited.includes('one gentle one.') && !edited.includes('*gentle*')
  log.italicTradesForBold = edited.includes('A *heavy* word to lean')
  log.boldTradesForItalic = edited.includes('a **leaning** word to weigh down.')
  log.marksNeverStack = !edited.includes('***')
  log.cmdEnterMakesATask = /^- \[ \] Make this line a task\.$/m.test(edited)
  log.cmdEnterTicks = /^- \[x\] an open task$/m.test(edited)
  log.cmdEnterUnticks = /^- \[ \] a done task$/m.test(edited)
  log.altUpMovesTheLine = /^Second of a pair\.\nFirst of a pair\.$/m.test(edited)
  log.altDownMovesTheLine = /^Lower of a pair\.\nUpper of a pair\.$/m.test(edited)
  // Red on CodeMirror's own word keys, which read the hidden marks as text:
  // `keep **bold wordshere and **vanishnow.`, `a [[nowhere/at-all|linked then
  // a [site](https://example.com/after.`, `thisheavy** stays out.`,
  // `**denseZ**`, `**selectmegone.`, `- YStuck item words` and `- [ Task words`.
  log.altBackspaceKeepsTheMarks = edited.includes('Wordkeys delete back: keep **bold** here and now.')
  log.altBackspaceTakesALinkWhole = edited.includes('Wordkeys links: a then a after.')
  log.altDeleteTakesATokenWhole = edited.includes('Wordkeys forward: this stays out.')
  log.altLeftStepsOverMarks = edited.includes('Wordkeys motion over a Z**dense** thing.')
  log.shiftAltLeftTakesTheWholeToken = edited.includes('Wordkeys select the gone.')
  log.shiftAltLeftTwiceTakesAPhrase =
    log.twiceSelected[0] === '**two words** ' && edited.includes('Twice over: see onward.')
  log.shiftAltLeftTwiceTakesALink =
    log.twiceSelected[1] === '[[nowhere/else|two titled]] ' && edited.includes('Twice over: a beyond.')
  log.partialSelectionKeepsTheMarks = edited.includes('Partly: a **bold phrase** trailing.')
  log.typingOverKeepsTheLink = edited.includes('Partly typed: the [link text HERE](https://example.com/p) stays.')
  log.boldOffTheWholePhrase = edited.includes('Phrases: keep bold whole words here.')
  log.italicOffTheWholePhrase = edited.includes('Phrases: an aside well made there.')
  log.boldOffASelectedPhrase = edited.includes('Phrases: see bolded onto it.')
  log.boldSplitsAWordOut = edited.includes('Phrases: split **one** two **three** apart.')
  log.doubleClickTakesTheLinkWord =
    log.doubleClickInALink === 'notes' && edited.includes('Double: see [[nowhere/else|kickoff NOTES]] now.')
  log.doubleClickTakesTheBoldWord =
    log.doubleClickInBold === 'here' && edited.includes('Double: keep **bold words HERE** too.')
  log.tripleMarksTheWords = edited.includes('\n- **triple me**\n- leave me\n')
  log.pairTakenBackAndStepOut = edited.includes('\nPairs start here X **bold** plain\n')
  log.enterSplitsThePhrase = edited.includes('\nBreak **bold**\n**words** apart.\n')
  log.pasteGoesBetween = edited.includes('\nPaste into **bold** AA\nBB**words** here.\n')
  log.cutAndBack =
    log.cutSelected === 'c** x' && log.cutClip === '**c** x' && edited.includes('\nCut from **alpha data** **c** x end.\n')
  // What those lines came to, when one of them did not hold.
  log.lateLines = edited.split('\n').filter((l) => /^(Twice over|Partly|Phrases|Double|Pairs|Break|Paste into|Cut from|AA|BB|\*\*words|- triple|- leave)/.test(l))
  log.altLeftLeavesAnItemsWords = edited.includes('Above the stuck Yitem\n- Stuck item words')
  log.altBackspaceTakesTheItem = /^Task words leave with the item$/m.test(edited)
  log.cmdBackspaceKeepsTheBox = /^- \[ \] $/m.test(edited)

  /* ---------- 3. the two aids ---------- */

  // Focus lights the run of lines the caret is in — the whole list, not just
  // the item — and dims everything else. Off, nothing is dimmed.
  click(aid('focus'))
  await sleep(300)
  await aim('focus', caretIn('an open task', 3))
  await sleep(300)
  const dim = (s) => lineWith(s)?.classList.contains('cm-md-dim')
  log.focusLitTheCaretLine = dim('an open task') === false
  log.focusLitItsParagraph = dim('Keep the browser') === false && dim('a done task') === false
  log.focusDimmedTheRest = dim('A paragraph with') === true && dim('Make this line a task') === true
  click(aid('focus'))
  await sleep(300)
  log.focusOffDimsNothing = !pane(1)?.querySelector('.cm-md-dim')

  // Typewriter: the line the caret goes to is brought up to the same height
  // every time — 38% down the pane — by scrolling the pane, since the editor is
  // not a scroller of its own. Aimed at a plain line well below that height
  // and on screen, so there is somewhere to scroll FROM. For the KEYBOARD: a
  // click is you choosing a place on the page, and the page moving under the
  // pointer as you do it fights you for it — a drag, a double-click on a word.
  // So the click leaves the page where it is, and the first key after it parks.
  const scroller = pane(1)?.querySelector('[data-find-scope]')
  if (scroller) scroller.scrollTop = 0
  await sleep(400)
  click(aid('typewriter'))
  await sleep(400)
  if (scroller) {
    const sr = scroller.getBoundingClientRect()
    const want = sr.top + scroller.clientHeight * 0.38
    const plain = (l) => !/cm-md-(h|code|hr|blank|table|html)\b/.test(l.className) && l.textContent.trim().length > 12
    const unique = (l) => lines().filter((m) => m.textContent === l.textContent).length === 1
    const low = lines()
      .filter((l) => {
        const r = l.getBoundingClientRect()
        return plain(l) && unique(l) && r.top > want + 80 && r.bottom < sr.bottom - 4
      })
      .pop()
    log.typewriterHadRoom = Boolean(low)
    if (low) {
      const anchor = low.textContent
      const top0 = scroller.scrollTop
      await aim('typewriter', caretAtEnd(anchor))
      await sleep(500)
      log.typewriterLeavesAClickAlone = Math.abs(scroller.scrollTop - top0) < 2
      press('ArrowLeft')
      await sleep(500)
      log.typewriterScrolled = scroller.scrollTop > top0 + 20
      const at = lineWith(anchor)?.getBoundingClientRect().top
      log.typewriterParkedIt = at != null && Math.abs(at - want) < 40
    }
  }
  click(aid('typewriter'))
  await sleep(300)
  if (scroller) scroller.scrollTop = 0
  await sleep(300)

  /* ---------- 4. one undo, the whole way down ---------- */

  // Every edit above — two typed characters, six marks, three ticks, two moved
  // lines and what the word keys took — is one history, and ⌘Z walks the lot
  // back to the note as seeded.
  // The editor's own history, not the browser's: that was the textarea's reason
  // for being, and it is not what is doing this any more.
  content()?.focus()
  for (let i = 0; i < 60; i++) {
    press('z', { metaKey: true })
    await sleep(50)
  }
  await sleep(1800)
  log.undoWalksItAllBack = (await disk()) === BODY

  /* ---------- 5. and it reaches the file ---------- */

  // The pane holds what is typed and hands it up on a timer, so this is the
  // claim that matters about that: nothing typed is lost, including the last
  // characters before the surface is taken away.
  content()?.focus()
  press('ArrowDown', { metaKey: true })
  await sleep(300)
  type('A SENTENCE TYPED BY THE CHECK.')
  await sleep(1800)
  log.reachedDisk = (await disk()).includes('A SENTENCE TYPED BY THE CHECK.')

  type(' TAIL')
  key('e')
  await sleep(1800)
  log.tailSurvivedTheSwitch = (await disk()).includes('A SENTENCE TYPED BY THE CHECK. TAIL')
  log.noConflictBanner = !banner()

  /* ---------- 6. and back to reading ---------- */

  const readBlocks = () => [...(pane(1)?.querySelectorAll('[data-md-from]') ?? [])]
  const readPara = readBlocks().find((d) => (d.textContent ?? '').includes('A paragraph with'))
  log.backToRead =
    modeOn('READ') &&
    !pane(1)?.querySelector('.cm-editor') &&
    Boolean(readPara) &&
    !/\*\*|\]\(|`/.test(readPara?.innerText ?? '*')

  // Size for size: the same words, set in the same type on both sides of ⌘E.
  const readType = (s) => {
    for (const w of readBlocks()) {
      const t = typeOf(w, s)
      if (t) return t
    }
    return null
  }
  log.sizes = WORDS.map((s) => {
    const w = writeType[s]
    const r = readType(s)
    return `${s}: ${w ? `${w.px}px ${w.family}` : '—'} / ${r ? `${r.px}px ${r.family}` : '—'}`
  })
  log.readsTheSameSize = WORDS.every((s) => {
    const w = writeType[s]
    const r = readType(s)
    return Boolean(w && r) && Math.abs(w.px - r.px) < 0.5 && w.family === r.family
  })

  /* ---------- 7. and into the note it was typed into ---------- */

  // The pane holds the last keystrokes back for a moment, and one of the
  // moments it lets go is the NOTE CHANGING — at which point the obvious
  // implementation writes them to the note just opened. So: type, and in the
  // same breath ⌘-click the link to the other note, then read both files.
  // A plain click in WRITE is a caret, so ⌘ is how you follow — and ⌘ means
  // what it means everywhere in the app, a tab of its own: the other note
  // arrives beside this one, which stays in the strip.
  key('e')
  await sleep(900)
  log.backToWrite = modeOn('WRITE') && Boolean(content())
  content()?.focus()
  press('ArrowDown', { metaKey: true })
  await sleep(400)
  press('Enter')
  await sleep(120)
  type('MARKER-FOR-THIS-NOTE')
  // The link to the other note, by its title — the note has other links in it.
  const wiki = [...(pane(1)?.querySelectorAll('.cm-md-wiki[data-wiki]') ?? [])].find((w) => w.textContent === 'over here')
  log.linkFound = Boolean(wiki)
  const tabCount = () => pane(1)?.querySelectorAll('[data-tab]').length ?? 0
  const tabs0 = tabCount()
  if (wiki) {
    const r = wiki.getBoundingClientRect()
    const at = {
      bubbles: true,
      cancelable: true,
      clientX: r.left + Math.min(4, r.width / 2),
      clientY: r.top + r.height / 2,
      button: 0,
      detail: 1,
      metaKey: true,
      view: window
    }
    wiki.dispatchEvent(new MouseEvent('mousedown', at))
    document.dispatchEvent(new MouseEvent('mouseup', at))
  }
  await sleep(2400)
  // Asked of the head, which says the title in either mode: the note followed
  // to opens in READ, where the title is not a field.
  log.followedToTheOtherNote = (pane(1)?.querySelector('[data-head="1"]')?.textContent ?? '').includes('Writing other')
  log.followedIntoATab = tabs0 > 0 && tabCount() === tabs0 + 1
  log.writtenNoteStayed = [...(pane(1)?.querySelectorAll('[data-tab]') ?? [])].some((t) =>
    /Writing check/.test(t.textContent ?? '')
  )
  log.markerStayedHome = (await disk()).includes('MARKER-FOR-THIS-NOTE')
  log.otherNoteUntouched = (await disk(OTHER)) === OTHER_BODY

  log.pass = Boolean(
    log.opensInWrite &&
      log.awayHidesEveryMark &&
      log.runsAreDrawn &&
      log.quoteIsDrawn &&
      log.fenceIsDrawn &&
      log.fencesFoldAway &&
      log.clickInCodeMovesNothing &&
      log.fenceBackWhereYouStand &&
      log.doneIsDrawn &&
      log.linkRevealedWhereYouAre &&
      log.onlyThatToken &&
      log.hashesHiddenAway &&
      log.hashesShownWhereYouAre &&
      log.hashesHangInTheMargin &&
      log.headingWordsStayPut &&
      log.bulletIsFurniture &&
      log.boxIsFurniture &&
      log.clickLandsPastHiddenMarks &&
      log.clickLandsInsideBold &&
      log.boldWrapsTheWord &&
      log.boldUnwraps &&
      log.italicWrapsTheWord &&
      log.italicUnwraps &&
      log.italicTradesForBold &&
      log.boldTradesForItalic &&
      log.marksNeverStack &&
      log.cmdEnterMakesATask &&
      log.cmdEnterTicks &&
      log.cmdEnterUnticks &&
      log.altUpMovesTheLine &&
      log.altDownMovesTheLine &&
      log.altUpStaysInTheNote &&
      log.altDownStaysInTheNote &&
      log.altBackspaceKeepsTheMarks &&
      log.altBackspaceTakesALinkWhole &&
      log.altDeleteTakesATokenWhole &&
      log.altLeftStepsOverMarks &&
      log.shiftAltLeftTakesTheWholeToken &&
      log.shiftAltLeftTwiceTakesAPhrase &&
      log.shiftAltLeftTwiceTakesALink &&
      log.partialSelectionKeepsTheMarks &&
      log.typingOverKeepsTheLink &&
      log.boldOffTheWholePhrase &&
      log.italicOffTheWholePhrase &&
      log.boldOffASelectedPhrase &&
      log.boldSplitsAWordOut &&
      log.doubleClickTakesTheLinkWord &&
      log.tripleMarksTheWords &&
      log.pairTakenBackAndStepOut &&
      log.enterSplitsThePhrase &&
      log.pasteGoesBetween &&
      log.cutAndBack &&
      log.doubleClickTakesTheBoldWord &&
      log.altLeftLeavesAnItemsWords &&
      log.altBackspaceTakesTheItem &&
      log.cmdBackspaceKeepsTheBox &&
      log.focusLitTheCaretLine &&
      log.focusLitItsParagraph &&
      log.focusDimmedTheRest &&
      log.focusOffDimsNothing &&
      log.typewriterHadRoom &&
      log.typewriterLeavesAClickAlone &&
      log.typewriterScrolled &&
      log.typewriterParkedIt &&
      log.undoWalksItAllBack &&
      log.reachedDisk &&
      log.tailSurvivedTheSwitch &&
      log.noConflictBanner &&
      log.backToRead &&
      log.readsTheSameSize &&
      log.backToWrite &&
      log.linkFound &&
      log.followedToTheOtherNote &&
      log.followedIntoATab &&
      log.writtenNoteStayed &&
      log.markerStayedHome &&
      log.otherNoteUntouched
  )
  return log
})()
