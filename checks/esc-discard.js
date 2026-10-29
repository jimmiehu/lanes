// ESC IN WRITE IS THE WAY OUT — AND IT ASKS BEFORE IT THROWS ANYTHING AWAY.
//
// Esc used to take the caret out of the editor and nothing else. Now it leaves
// WRITE, and leaving means the words written in this stretch go — so:
//
// - With nothing written (nothing typed, or typed and taken out again) esc is
//   simply the way out to READ, and asks nothing.
// - With something written it asks, in a dialog over the note, and the answer
//   that loses nothing — keep writing — is the one the caret is on.
// - Esc in the dialog is no. So esc, esc, esc opens it, closes it, opens it,
//   and never discards a word; a held esc, the key repeating, is one press.
// - Yes is a click on Discard, or ⌘⌫. The note goes back to what it was when
//   it went into WRITE, and the pane to READ — but a change that arrived from
//   outside meanwhile (Claude, editing the note beside you) stays. Only your
//   words go.
// - It goes as an edit, saved like any other, so the app's ⌘Z in READ brings
//   the words back.
// - Esc in the head's title asks the same, and a title thrown away names
//   nothing: an untitled note whose title was typed and discarded is still
//   untitled on disk (red: the title field, taken away with WRITE, committed
//   what it held and renamed the file after the words being discarded).
//
// Seeds its own note through the app's IPC, and makes one with ⌘N. Run
// against a throwaway LANES_VAULT and LANES_STATE. See checks/README.md.
(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
  const pane = (i) => document.querySelector(`[data-pane="${i}"]`)
  const key = (k, extra = {}) =>
    window.dispatchEvent(new KeyboardEvent('keydown', { key: k, metaKey: true, bubbles: true, cancelable: true, ...extra }))
  const content = () => pane(1)?.querySelector('.cm-content')
  const lines = () => [...(pane(1)?.querySelectorAll('.cm-line') ?? [])]
  const lineWith = (s) => lines().find((l) => l.textContent.includes(s))
  const readHas = (s) => [...(pane(1)?.querySelectorAll('[data-md-from]') ?? [])].some((d) => d.textContent.includes(s))
  const mode = (m) => pane(1)?.querySelector(`[data-mode="${m}"]`)?.dataset.on === '1'
  /** A key the editor hears: on its own content, where its keymap listens. */
  const press = (k, mods = {}) =>
    content()?.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...mods }))
  /** A key with no field to go to — what reaches a dialog listening on the window. */
  const escWin = (extra = {}) =>
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true, ...extra }))
  const type = (text) => document.execCommand('insertText', false, text)
  const ask = () => document.querySelector('[data-leave-ask]')
  const keepBtn = () => document.querySelector('[data-leave="keep"]')
  const tossBtn = () => document.querySelector('[data-leave="discard"]')
  const textNodes = (el) => {
    const out = []
    const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
    let n
    while ((n = walk.nextNode())) if (n.data.length && !n.parentElement?.closest('[contenteditable="false"]')) out.push(n)
    return out
  }
  /** The caret at the end of the line showing `s`, put down by a click as a person's is. */
  const caretAtEnd = async (s) => {
    const line = lineWith(s)
    const nodes = line ? textNodes(line) : []
    const last = nodes[nodes.length - 1]
    if (!last) return false
    const r = document.createRange()
    r.setStart(last, Math.max(0, last.data.length - 1))
    r.setEnd(last, last.data.length)
    const b = r.getBoundingClientRect()
    const x = b.right + 1
    const y = b.top + b.height / 2
    const at = { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0, detail: 1, view: window }
    ;(document.elementFromPoint(x, y) ?? last.parentElement).dispatchEvent(new MouseEvent('mousedown', at))
    document.dispatchEvent(new MouseEvent('mouseup', at))
    await sleep(250)
    return true
  }
  const toWrite = async () => {
    if (!content()) key('e')
    for (let i = 0; i < 30 && !content(); i++) await sleep(100)
    await sleep(300)
    return Boolean(content())
  }
  const log = {}
  await sleep(1200)

  const stamp = Date.now().toString(36)
  const TITLE = `Esc check ${stamp}`
  const BODY = `# ${TITLE}\n\nThe first paragraph stays as it was.\n\nThe second paragraph is where words are typed.\n`
  const made = await window.lanes.noteCreate(TITLE, '_unfiled')
  const PATH = made.path || `_unfiled/esc-check-${stamp}.md`
  await window.lanes.noteWrite(PATH, BODY)
  const disk = async () => (await window.lanes.note(PATH))?.body ?? ''

  key('k')
  await sleep(600)
  const box = document.querySelector('[data-palette-input]')
  Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(box, TITLE)
  box.dispatchEvent(new Event('input', { bubbles: true }))
  for (let i = 0; i < 60; i++) {
    const t = (document.querySelector('.pal-row[data-pal-on="1"]')?.textContent ?? '').trim()
    if (t.includes(TITLE) && !t.startsWith('+')) break
    await sleep(100)
  }
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
  for (let i = 0; i < 40 && !readHas('where words are typed') && !content(); i++) await sleep(100)
  log.opened = readHas('where words are typed') || Boolean(content())
  if (!log.opened) return { ...log, pass: false }

  /* ---------- 1. nothing written: esc is just the way out ---------- */

  log.inWrite = await toWrite()
  press('Escape')
  await sleep(500)
  log.cleanEscAsksNothing = !ask()
  log.cleanEscLeaves = !content() && mode('READ')

  /* ---------- 2. a word written: esc asks, and keep is the default ---------- */

  await toWrite()
  log.caretPlaced = await caretAtEnd('where words are typed.')
  type(' XYZZY')
  await sleep(300)
  press('Escape')
  await sleep(400)
  log.escAsks = Boolean(ask())
  log.keepIsTheDefault = Boolean(keepBtn()) && document.activeElement === keepBtn()
  log.stillWrittenWhileAsked = Boolean(lineWith('XYZZY')) && mode('WRITE')

  /* ---------- 3. esc in the question is no ---------- */

  escWin()
  await sleep(400)
  log.escAgainKeeps = !ask() && mode('WRITE') && Boolean(lineWith('XYZZY'))
  log.caretBackInTheWords = document.activeElement === content()

  /* ---------- 4. esc, esc, esc: it opens and closes, and never discards ---------- */

  const seen = []
  for (let i = 0; i < 6; i++) {
    // In the words esc asks; in the question it is no.
    if (ask()) escWin()
    else press('Escape')
    await sleep(250)
    seen.push(ask() ? 'open' : 'shut')
  }
  log.escToggles = seen.join(' ')
  log.escOnlyEverTogglesIt = log.escToggles === 'open shut open shut open shut'
  // A held esc is one press: the key repeating does not answer what it opened.
  press('Escape')
  await sleep(250)
  for (let i = 0; i < 4; i++) {
    escWin({ repeat: true })
    await sleep(60)
  }
  log.heldEscIsOnePress = Boolean(ask())
  // A click on Keep writing is no, as well.
  keepBtn()?.click()
  await sleep(400)
  log.keepClickKeeps = !ask() && mode('WRITE')
  // On disk, after every timer: the word is there.
  await sleep(2000)
  log.neverDiscarded = (await disk()).includes('XYZZY') && Boolean(lineWith('XYZZY'))

  /* ---------- 5. Discard: your words go, a change from outside stays ---------- */

  // Everything typed is on disk by now, so a write from outside loads silently.
  const THEIRS = 'Claude added this line from outside.'
  const before = await disk()
  await window.lanes.noteWrite(PATH, `${before.replace(/\n*$/, '\n')}\n${THEIRS}\n`)
  for (let i = 0; i < 60 && !lineWith(THEIRS); i++) await sleep(200)
  log.outsideArrived = Boolean(lineWith(THEIRS))
  press('Escape')
  await sleep(400)
  log.asksAgain = Boolean(ask())
  tossBtn()?.click()
  await sleep(700)
  log.discardLeavesWrite = !ask() && !content() && mode('READ')
  await sleep(2000)
  const after = await disk()
  log.afterDiscard = after
  log.yourWordGone = !after.includes('XYZZY')
  log.theirsKept = after.includes(THEIRS)
  log.restAsItWas = after.replace(THEIRS, '').replace(/\s+$/, '') === BODY.replace(/\s+$/, '')
  log.readShowsItAsItWas = readHas('where words are typed.') && !readHas('XYZZY') && readHas(THEIRS)

  /* ---------- 6. ⌘Z in READ brings the words back ---------- */

  document.activeElement?.blur?.()
  await sleep(200)
  key('z')
  await sleep(2200)
  log.undoBringsThemBack = (await disk()).includes('XYZZY')

  /* ---------- 7. ⌘⌫ is yes too ---------- */

  await toWrite()
  await caretAtEnd('stays as it was.')
  type(' QWERTY')
  await sleep(300)
  press('Escape')
  await sleep(400)
  const askedForCmdBackspace = Boolean(ask())
  key('Backspace')
  await sleep(700)
  log.cmdBackspaceDiscards = askedForCmdBackspace && !ask() && !content() && mode('READ')
  await sleep(2000)
  const afterCmd = await disk()
  log.cmdBackspaceTookOnlyThisStretch = !afterCmd.includes('QWERTY') && afterCmd.includes('XYZZY')

  /* ---------- 8. esc in the title asks too, and a discarded title names nothing ---------- */

  key('n')
  const field = () => pane(1)?.querySelector('[data-note-title]')
  for (let i = 0; i < 40 && document.activeElement !== field(); i++) await sleep(100)
  log.newNoteTitleHasTheCaret = Boolean(field()) && document.activeElement === field()
  const NAME = `Never named ${stamp}`
  type(NAME)
  await sleep(500)
  field()?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))
  await sleep(400)
  log.titleEscAsks = Boolean(ask())
  tossBtn()?.click()
  await sleep(2500)
  log.titleDiscardLeavesWrite = !ask() && !content() && mode('READ')
  log.discardedTitleNamedNothing = (await window.lanes.note(`_unfiled/never-named-${stamp}.md`)) === null
  log.headNotNamed = !(pane(1)?.querySelector('[data-head="1"]')?.textContent ?? '').includes(NAME)

  log.pass = Boolean(
    log.opened &&
      log.inWrite &&
      log.cleanEscAsksNothing &&
      log.cleanEscLeaves &&
      log.caretPlaced &&
      log.escAsks &&
      log.keepIsTheDefault &&
      log.stillWrittenWhileAsked &&
      log.escAgainKeeps &&
      log.caretBackInTheWords &&
      log.escOnlyEverTogglesIt &&
      log.heldEscIsOnePress &&
      log.keepClickKeeps &&
      log.neverDiscarded &&
      log.outsideArrived &&
      log.asksAgain &&
      log.discardLeavesWrite &&
      log.yourWordGone &&
      log.theirsKept &&
      log.restAsItWas &&
      log.readShowsItAsItWas &&
      log.undoBringsThemBack &&
      log.cmdBackspaceDiscards &&
      log.cmdBackspaceTookOnlyThisStretch &&
      log.newNoteTitleHasTheCaret &&
      log.titleEscAsks &&
      log.titleDiscardLeavesWrite &&
      log.discardedTitleNamedNothing &&
      log.headNotNamed
  )
  return log
})()
