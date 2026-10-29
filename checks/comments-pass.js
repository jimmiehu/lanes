// THE PASS — a note's comments handed to Claude, who goes through them.
//
// "Go through" on the details panel's Comments row, or the pass ⌘K offers
// while the note is in front: the note's words are written first, then a new
// thread, attached to the note, named `Comments · <note> · <day>`, is sent the
// prompt `reviewPrompt` makes — every open comment listed, what it says and
// what it is about, and what to do with each. Claude answers in the thread,
// edits the note, and takes out what it handled; the edit arrives in the open
// note as a change from outside does, and the count falls. One thread per
// pass, so each review keeps its own record.
//
// Wants the `review` stand-in CLI (see checks/README.md), which reads the
// prompt, clears the first anchored comment in the note it names — its anchor
// unwrapped, its words left — and answers; a throwaway LANES_VAULT and a fresh
// LANES_STATE. Red at the commit before: nothing to press. The safety mode the
// pass runs in is the app's, and a stand-in makes no tool calls to be asked
// about, so Guarded asking for each edit rests on `startOptions`.
;(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
  const key = (k, extra = {}) =>
    window.dispatchEvent(new KeyboardEvent('keydown', { key: k, metaKey: true, bubbles: true, cancelable: true, ...extra }))
  const notePane = () => [...document.querySelectorAll('[data-pane]')].find((p) => p.querySelector('[data-mode]'))
  const threadPane = () => document.querySelector('[data-pane="0"]')
  const block = (s) => [...(notePane()?.querySelectorAll('[data-md-from]') ?? [])].find((d) => d.textContent.includes(s))
  const content = () => notePane()?.querySelector('.cm-content')
  const lineWith = (s) => [...(notePane()?.querySelectorAll('.cm-line') ?? [])].find((l) => l.textContent.includes(s))
  /** The caret at the end of the editor's line holding `s`, put down by a press. */
  const caretAtEnd = async (s) => {
    const line = lineWith(s)
    const walk = line && document.createTreeWalker(line, NodeFilter.SHOW_TEXT)
    let last = null
    for (let n; walk && (n = walk.nextNode()); ) if (n.data.length && !n.parentElement?.closest('[contenteditable="false"]')) last = n
    if (!last) return false
    const r = document.createRange()
    r.setStart(last, last.data.length - 1)
    r.setEnd(last, last.data.length)
    const b = r.getBoundingClientRect()
    const at = { bubbles: true, cancelable: true, clientX: b.right + 1, clientY: b.top + b.height / 2, button: 0, detail: 1, view: window }
    ;(document.elementFromPoint(at.clientX, at.clientY) ?? last.parentElement).dispatchEvent(new MouseEvent('mousedown', at))
    document.dispatchEvent(new MouseEvent('mouseup', at))
    await sleep(250)
    return true
  }
  const meta = () => (notePane()?.querySelector('[data-meta]')?.textContent ?? '').replace(/\s+/g, ' ')
  const flat = (s) => (s ?? '').replace(/\s+/g, ' ').trim()
  const waitFor = async (test, ms = 15000) => {
    for (let t = 0; t < ms && !(await test()); t += 250) await sleep(250)
    return Boolean(await test())
  }
  const log = {}
  await sleep(1500)

  const stamp = Date.now().toString(36)
  const TITLE = `Pass check ${stamp}`
  const BODY = [
    `# ${TITLE}`,
    '',
    'The plan rests on {==crop rotation==}{>>define this before first use?<<} as its frame.',
    '',
    'A second paragraph about {==the association==}{>>which association?<<} and its rent.',
    '',
    'Seed comes from three suppliers{>>which three? name them<<}, weighted by plot size.',
    ''
  ].join('\n')
  const made = await window.lanes.noteCreate(TITLE, '_unfiled')
  const PATH = made.path || `_unfiled/pass-check-${stamp}.md`
  await window.lanes.noteWrite(PATH, BODY)
  const disk = async () => (await window.lanes.note(PATH))?.body ?? ''

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
  log.opened = await waitFor(() => Boolean(block('as its frame')), 5000)
  if (!log.opened) return JSON.stringify({ ...log, pass: false }, null, 1)

  /* ---------- the details panel's Comments row goes through them ---------- */

  log.metaBefore = meta()
  notePane().querySelector('[data-meta]')?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  await sleep(300)
  const go = () => notePane().querySelector('[data-fact-action="Comments"]')
  log.rowSays = flat(notePane().querySelector('[data-fact="Comments"]')?.innerText)
  log.rowOffersThePass = Boolean(go()) && /^Comments 3 go through$/.test(log.rowSays)
  // Words typed in WRITE a moment before, still on their way to disk: the pass
  // reads the note you see, so they are in it.
  key('e')
  for (let i = 0; i < 30 && !content(); i++) await sleep(100)
  await sleep(400)
  await caretAtEnd('as its frame.')
  document.execCommand('insertText', false, ' Quickly.')
  // A beat for the editor to take the keystrokes in — well inside every timer
  // between it and the disk (150ms, 250ms, 500ms), so they are typed, not saved.
  await sleep(60)
  log.notYetOnDisk = !(await disk()).includes('Quickly.')
  const tabsBefore = threadPane()?.querySelectorAll('[data-tab]').length ?? 0
  go()?.dispatchEvent(new MouseEvent('click', { bubbles: true }))

  const passTab = () => threadPane()?.querySelector('[data-tab-on="1"]')
  log.threadMade = await waitFor(() => (threadPane()?.querySelectorAll('[data-tab]').length ?? 0) === tabsBefore + 1)
  // The tab's words, less the × that closes it.
  log.tabTitle = flat(passTab()?.textContent).replace(/\s*×$/, '')
  log.namedForTheNoteAndDay = new RegExp(`^Comments · ${TITLE} · (Sun|Mon|Tue|Wed|Thu|Fri|Sat) \\d{1,2} [A-Z][a-z]{2}`).test(log.tabTitle)

  // The prompt, as sent: every comment, numbered, with what it is about.
  log.sent = await waitFor(() => Boolean(threadPane()?.querySelector('[data-msg-role="you"]')))
  const prompt = flat(threadPane()?.querySelector('[data-msg-role="you"]')?.textContent)
  log.promptHasWhatWasJustTyped = prompt.includes('as its frame. Quickly.')
  log.promptListsEvery =
    prompt.includes('There are 3:') &&
    prompt.includes('1. “define this before first use?” — about “crop rotation”') &&
    prompt.includes('2. “which association?” — about “the association”') &&
    prompt.includes('3. “which three? name them” — at a point in the text') &&
    prompt.includes(PATH)
  log.promptSaysWhatToDo = /answer it here/.test(prompt) && /take it out of the note/.test(prompt) && /Change nothing else in the note/.test(prompt)

  // Claude's answer in the thread, its edit in the note.
  log.answered = await waitFor(() => /Answered here, and cleared from the note/.test(threadPane()?.textContent ?? ''))
  const AFTER = BODY.replace('{==crop rotation==}{>>define this before first use?<<} as its frame.', 'crop rotation as its frame. Quickly.')
  log.noteEdited = await waitFor(async () => (await disk()) === AFTER)
  // In the open note — the editor, still writing — as a change from outside:
  // the words unwrapped, nothing typed lost, no conflict, the count down.
  log.inPlace = await waitFor(() => flat(lineWith('as its frame')?.innerText) === 'The plan rests on crop rotation as its frame. Quickly.')
  log.noConflict = !/changed on disk while you were editing/.test(notePane()?.textContent ?? '')
  log.countFell = await waitFor(() => / · 2 comments\b/.test(meta()))
  log.metaAfter = meta()

  // Attached to the note, which lists it among its chats.
  const tid = passTab()?.dataset.tabId ?? passTab()?.closest('[data-tab-id]')?.dataset.tabId
  const st = (await window.lanes.bootstrap()).state
  const attached = Object.entries(st.attachments ?? {}).filter(([, p]) => p === PATH)
  log.attached = attached.length === 1
  log.titledInState = Object.values(st.titleOverrides ?? {}).some((t) => t === log.tabTitle)
  void tid

  /* ---------- ⌘K offers it while the note is in front, and one thread per pass ---------- */

  // Back to the note, in READ, so it is the one in front.
  notePane()?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  await sleep(200)
  key('e')
  await sleep(500)
  key('k')
  await sleep(600)
  const offer = () => document.querySelector('.pal-row[data-pal-kind="review"]')
  log.paletteOffers = flat(offer()?.textContent)
  log.offerNamesTheNote = new RegExp(`Go through 2 comments in “${TITLE}”`).test(log.paletteOffers)
  log.offerIsNotWhereEnterRests = offer()?.dataset.palOn !== '1'
  // Up to it, and ↵.
  for (let i = 0; i < 6 && offer()?.dataset.palOn !== '1'; i++) {
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true, cancelable: true }))
    await sleep(80)
  }
  log.footerSays = flat(document.querySelector('[data-pal-footer]')?.textContent)
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))
  log.secondThread = await waitFor(() => (threadPane()?.querySelectorAll('[data-tab]').length ?? 0) === tabsBefore + 2)
  const AFTER2 = AFTER.replace('{==the association==}{>>which association?<<}', 'the association')
  log.secondPassEdits = await waitFor(async () => (await disk()) === AFTER2)
  log.secondPromptListsWhatIsLeft = await waitFor(() => {
    const you = [...(threadPane()?.querySelectorAll('[data-msg-role="you"]') ?? [])].pop()
    const t = flat(you?.textContent)
    return t.includes('There are 2:') && !t.includes('define this before first use?')
  })
  log.countFellAgain = await waitFor(() => / · 1 comment\b/.test(meta()))

  log.pass = Boolean(
    log.rowOffersThePass &&
      log.notYetOnDisk &&
      log.promptHasWhatWasJustTyped &&
      log.noConflict &&
      log.threadMade &&
      log.namedForTheNoteAndDay &&
      log.sent &&
      log.promptListsEvery &&
      log.promptSaysWhatToDo &&
      log.answered &&
      log.noteEdited &&
      log.inPlace &&
      log.countFell &&
      log.attached &&
      log.titledInState &&
      log.offerNamesTheNote &&
      log.offerIsNotWhereEnterRests &&
      log.secondThread &&
      log.secondPassEdits &&
      log.secondPromptListsWhatIsLeft &&
      log.countFellAgain
  )
  return JSON.stringify(log, null, 1)
})()
