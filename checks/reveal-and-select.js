// Two small things a note owes you: its file, and a select-all that means this
// pane. Right-clicking a note — its tab, or its row in the folder tree —
// offers Show in Finder; ⌘A selects the pane you are in and nothing else.
//
// With the notes editor, "a field keeps its own" reaches further than the
// composer: the note's body IS a field now, in WRITE, and so is the head's
// title. ⌘A with the caret in the body is the editor's, and it selects the
// body you can see — every line of it, down to the last, and not the title,
// which the head says and the editor hides. Asked of the file as well as the
// page: ⌘A then ⌫ leaves the note its `# ` line and nothing else, and ⌘Z
// brings the rest back. ⌘A in the head's title is the title's own; the app
// does not reach in and select the pane around it. With nothing focused, ⌘A
// is still the pane's, as it was.
//
// This one opens a Finder window when it passes. That is the feature, and the
// bridge is frozen, so there is nothing honest to intercept it with.
//
// It seeds its own note through the app's IPC and writes to it (and puts it
// back), so run it against a throwaway LANES_VAULT and LANES_STATE. In a vault
// with no threads it makes an empty one from the + to ask the thread tab. In
// a vault nothing has run in, the rail only learns of the seeded note on the
// vault sweep, so the rail-row half can wait up to half a minute for its row.
// See checks/README.md for how to run it.
(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
  const click = (el, meta) =>
    el && el.dispatchEvent(new MouseEvent('click', { bubbles: true, metaKey: !!meta }))
  const rightClick = (el) => {
    const box = el.getBoundingClientRect()
    el.dispatchEvent(
      new MouseEvent('contextmenu', {
        bubbles: true,
        clientX: box.left + 8,
        clientY: box.bottom + 2
      })
    )
  }
  const item = (text) =>
    [...document.querySelectorAll('div')].find((d) => d.innerText.trim() === text)
  /*
   * Both menus have to be sent away the way they each listen for it — the
   * rail's closes on a click of its own scrim, the strip's on any mousedown —
   * or a stale menu answers the next question asked of the document.
   */
  const dismiss = () => {
    const scrim = [...document.querySelectorAll('div')].find(
      (d) => d.style.zIndex === '45' && d.style.inset === '0px'
    )
    if (scrim) scrim.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    window.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
  }
  const cmd = (k) =>
    window.dispatchEvent(new KeyboardEvent('keydown', { key: k, metaKey: true, bubbles: true }))
  const pane = (i) => document.querySelector(`[data-pane="${i}"]`)
  const tabsOf = (i) => [...(pane(i)?.querySelectorAll('[data-tab]') ?? [])]
  const content = () => pane(1)?.querySelector('.cm-content')
  const lineWith = (s) => [...(pane(1)?.querySelectorAll('.cm-line') ?? [])].find((l) => l.textContent.includes(s))
  // Keys the editor answers go to the editor's own element, the way a
  // keystroke in it arrives; they bubble on to the window from there.
  const press = (k, mods = {}) =>
    content()?.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...mods }))
  /**
   * THE CARET GOES WHERE A CLICK PUTS IT — through the editor's own pointer
   * handling, the way a person's does. Setting the page's selection directly
   * is not the same act: the editor only adopts a DOM selection while its
   * window is the front one, and a driven run cannot promise that.
   */
  const caretIn = async (s, at = 1) => {
    const line = lineWith(s)
    if (!line) return false
    const walk = document.createTreeWalker(line, NodeFilter.SHOW_TEXT)
    let n
    while ((n = walk.nextNode())) {
      const i = n.data.indexOf(s)
      if (i === -1) continue
      const r = document.createRange()
      r.setStart(n, i + at)
      r.setEnd(n, i + at + 1)
      const box = r.getBoundingClientRect()
      const x = box.left + 0.5
      const y = box.top + box.height / 2
      const ev = { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0, detail: 1, view: window }
      ;(document.elementFromPoint(x, y) ?? line).dispatchEvent(new MouseEvent('mousedown', ev))
      document.dispatchEvent(new MouseEvent('mouseup', ev))
      await sleep(250)
      return document.activeElement === content()
    }
    return false
  }
  const sel = () => window.getSelection()
  const within = (i) => {
    const s = sel()
    if (!s || !s.rangeCount) return false
    const scope = pane(i)?.querySelector('[data-find-scope]')
    return Boolean(scope && scope.contains(s.getRangeAt(0).commonAncestorContainer))
  }
  const log = {}

  /*
   * The item is not clicked. Reveal is the one action here whose whole effect
   * is outside the app — it opens a Finder window on the machine running the
   * check — and the bridge is frozen, so there is nothing to intercept it with.
   * What is checkable is checked instead: that the menus offer it where a file
   * exists to show and nowhere else, and that the call behind it accepts a note
   * and refuses everything else.
   */
  await sleep(2800)

  // --- the note: seeded, and opened the way a person would, by finding it ---
  const NAME = 'Select check'
  const BODY = [
    `# ${NAME}`,
    '',
    'FIRSTLINE opens the body of the note.',
    '',
    'A middle paragraph, with nothing special in it.',
    '',
    'LASTLINE closes the body of the note.',
    ''
  ].join('\n')
  const made = await window.lanes.noteCreate(NAME, '_unfiled')
  const PATH = made.path || '_unfiled/select-check.md'
  await window.lanes.noteWrite(PATH, BODY)
  const disk = async () => (await window.lanes.note(PATH))?.body ?? ''
  cmd('k')
  await sleep(600)
  const box = document.querySelector('[data-palette-input]')
  if (box) {
    Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(box, NAME)
    box.dispatchEvent(new Event('input', { bubbles: true }))
    await sleep(1000)
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
  }
  await sleep(1800)
  // A note opens in READ; writing is asked for, with ⌘E.
  if (!content()) cmd('e')
  for (let i = 0; i < 15 && !lineWith('FIRSTLINE'); i++) await sleep(200)
  log.opensInTheEditor = Boolean(content()) && Boolean(lineWith('FIRSTLINE'))

  // --- the tab ---
  const noteTabs = tabsOf(1)
  log.noteTabFound = noteTabs.length > 0
  const noteTab = pane(1)?.querySelector('[data-tab-on="1"]') ?? noteTabs[noteTabs.length - 1]
  if (noteTab) rightClick(noteTab)
  await sleep(400)
  log.tabOffersReveal = Boolean(item('Show in Finder'))
  dismiss()
  await sleep(400)
  log.tabMenuDismissed = !item('Show in Finder')

  // What the item calls, checked at the boundary rather than through the menu.
  log.revealExists = typeof window.lanes.reveal === 'function'
  log.revealTakesTheNote = (await window.lanes.reveal(PATH)) === true
  log.revealRefusesMissing = (await window.lanes.reveal('no-such-note-here.md')) === false
  log.revealRefusesOutsideTheVault =
    (await window.lanes.reveal('../../../../etc/hosts')) === false

  // --- ⌘A, with nothing focused: the pane you are in ---
  // The note pane is pane 1 and the thread pane is pane 0.
  click(pane(1))
  await sleep(300)
  document.activeElement?.blur?.()
  cmd('a')
  await sleep(300)
  log.selectedSomething = (sel()?.toString() ?? '').length > 20
  log.selectionIsTheNotePane = within(1)
  log.selectionIsNotTheThreadPane = !within(0)
  // And nothing from the rail came with it.
  log.railNotSelected = !/Recent|Filter|STARRED/.test(sel()?.toString() ?? '')

  // --- ⌘A in the body: the editor's, and the body only ---
  log.caretInTheEditor = await caretIn('middle paragraph', 3)
  press('a', { metaKey: true })
  await sleep(300)
  const s = sel()
  const all = s?.toString() ?? ''
  log.editorSelection = all
  log.editorSelectsTheBody =
    Boolean(s?.anchorNode && s?.focusNode) &&
    Boolean(content()?.contains(s.anchorNode) && content()?.contains(s.focusNode)) &&
    all.includes('FIRSTLINE') &&
    all.includes('LASTLINE')
  // Not the pane: the head's title and its meta line are not in it.
  log.editorSelectionIsNotThePane = !all.includes(NAME) && !/edited .* ago/.test(all)
  // And the file agrees: the title survives select-all and delete, and nothing
  // else does — the lines the page is not drawing included.
  press('Backspace')
  await sleep(2000)
  const cleared = await disk()
  log.afterSelectAllDelete = cleared
  log.selectAllSparesTheTitle = /^# Select check\n*$/.test(cleared)
  // ⌘Z puts back what the delete took. Pressed twice for a slow frame: the
  // delete is the only thing in this editor's history, so a second press has
  // nothing further to take back, and the app's own ⌘Z stays out of a field.
  press('z', { metaKey: true })
  await sleep(80)
  press('z', { metaKey: true })
  await sleep(2000)
  log.undoPutsItBack = (await disk()) === BODY

  // --- ⌘A in the head's title: the title's own ---
  const title = pane(1)?.querySelector('[data-note-title]')
  if (title) {
    title.focus()
    const r = document.createRange()
    r.selectNodeContents(title)
    r.collapse(false)
    sel()?.removeAllRanges()
    sel()?.addRange(r)
    title.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', metaKey: true, bubbles: true, cancelable: true }))
    await sleep(300)
  }
  log.titleKeepsItsOwn =
    Boolean(title) &&
    document.activeElement === title &&
    Boolean(sel()?.anchorNode && title.contains(sel().anchorNode)) &&
    (sel()?.toString() ?? '').length <= (title.textContent ?? '').length
  title?.blur()
  await sleep(300)

  // --- a thread's tab is not offered it — a transcript is not a file you keep ---
  const chatRow = document.querySelector('[data-rail-row="chat"]')
  if (chatRow) click(chatRow)
  else {
    // A vault with no threads: the +'s Thread makes one, unsent, which is a
    // thread's tab all the same.
    click(document.querySelector('[data-new-button]'))
    await sleep(300)
    const menu = document.querySelector('[data-new-menu]')
    click(menu && [...menu.querySelectorAll('.ctx-item')].find((d) => d.textContent.trim().startsWith('Thread')))
  }
  await sleep(1500)
  const chatTabs = tabsOf(0)
  log.threadTabFound = chatTabs.length > 0
  if (chatTabs.length) rightClick(chatTabs[chatTabs.length - 1])
  await sleep(400)
  log.threadTabHasNoReveal = log.threadTabFound && !item('Show in Finder')
  dismiss()
  await sleep(300)

  // In the other pane, ⌘A means that one instead.
  click(pane(0))
  await sleep(300)
  document.activeElement?.blur?.()
  cmd('a')
  await sleep(300)
  log.thenTheThreadPane = within(0)

  // A field keeps its own select-all: the composer answers ⌘A itself.
  const composer = pane(0)?.querySelector('textarea')
  composer?.focus()
  await sleep(200)
  const before = sel()?.toString() ?? ''
  cmd('a')
  await sleep(300)
  log.composerKeepsItsOwn =
    Boolean(composer) && ((sel()?.toString() ?? '') === before || document.activeElement === composer)

  // --- the rail row ---
  // Last, because a note seeded behind the app's back reaches the rail on the
  // vault sweep, and everything above has used up some of that wait.
  let noteRow = null
  for (let i = 0; i < 80 && !noteRow; i++) {
    noteRow = document.querySelector('[data-rail-row="note"]')
    if (!noteRow) await sleep(500)
  }
  log.foundRow = Boolean(noteRow)
  if (noteRow) rightClick(noteRow)
  await sleep(400)
  log.rowOffersReveal = Boolean(item('Show in Finder'))
  dismiss()
  await sleep(400)
  log.rowMenuDismissed = !item('Show in Finder')

  log.pass = Boolean(
    log.opensInTheEditor &&
    log.noteTabFound &&
    log.tabOffersReveal &&
    log.tabMenuDismissed &&
    log.revealExists &&
    log.revealTakesTheNote &&
    log.revealRefusesMissing &&
    log.revealRefusesOutsideTheVault &&
    log.selectedSomething &&
    log.selectionIsTheNotePane &&
    log.selectionIsNotTheThreadPane &&
    log.railNotSelected &&
    log.caretInTheEditor &&
    log.editorSelectsTheBody &&
    log.editorSelectionIsNotThePane &&
    log.selectAllSparesTheTitle &&
    log.undoPutsItBack &&
    log.titleKeepsItsOwn &&
    log.threadTabHasNoReveal &&
    log.thenTheThreadPane &&
    log.composerKeepsItsOwn &&
    log.foundRow &&
    log.rowOffersReveal &&
    log.rowMenuDismissed
  )
  return JSON.stringify(log, null, 1)
})()
