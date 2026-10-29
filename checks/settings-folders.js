// THE FOLDER RULES ARE SET IN SETTINGS, AND TAKE HOLD WITHOUT A RELAUNCH.
//
// Settings → Notes & lanes: Read-only folders, one per line — what is typed
// reaches main's state trimmed and with its empty lines dropped, and a note in
// a folder named there is read only at once: the open one loses its WRITE, and
// main reads it as read only. Cleared, it is writable again. New notes go to
// moved here from Interface, which no longer has it: "daily" sends ⌘N's note
// to daily/, and cleared it goes back to the vault root.
//
// The seed names no read-only folder, so inbox/ starts writable.
// Red before: there was no read-only field, and the new-note field was under
// Interface. Writes state and makes notes, so a fresh vault and LANES_STATE;
// spends no turns.
;(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
  const click = (el) => el && el.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  const key = (k, opts = {}) =>
    window.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...opts }))
  const set = (el, v) => {
    if (!el) return
    const proto = el instanceof HTMLTextAreaElement ? window.HTMLTextAreaElement : window.HTMLInputElement
    Object.getOwnPropertyDescriptor(proto.prototype, 'value').set.call(el, v)
    el.dispatchEvent(new Event('input', { bubbles: true }))
  }
  const q = (sel) => document.querySelector(sel)
  const state = async () => (await window.lanes.bootstrap()).state
  const until = async (ok, ms) => {
    for (let t = 0; t < ms; t += 200) {
      if (await ok()) return true
      await sleep(200)
    }
    return ok()
  }
  const settingsOpen = () => Boolean(q('[data-settings-tab]'))
  const openSettings = async (tab = 'threads') => {
    if (!settingsOpen()) {
      key(',', { metaKey: true })
      await sleep(600)
      click(q('[data-settings-more="1"]'))
      await sleep(600)
    }
    click(q(`[data-settings-tab="${tab}"]`))
    await sleep(400)
  }
  const closeSettings = async () => {
    if (!settingsOpen()) return
    key('Escape')
    await sleep(600)
  }
  const NOTE = 'inbox/allotment-rules.md'
  const TITLE = 'Allotment rules, as clipped'
  /** The pane the note is open in. */
  const notePane = () => {
    const holding = [...document.querySelectorAll('[data-pane]')].filter((p) => p.textContent.includes(TITLE))
    return holding.find((p) => p.querySelector('[data-mode]') || /read only/.test(p.textContent)) ?? holding[0]
  }
  /** What the note's own header says it is: WRITE offered, or read only. */
  const shows = () => {
    const pane = notePane()
    if (!pane) return 'not open'
    if (pane.querySelector('[data-mode="WRITE"]')) return 'writable'
    if (/read only/.test(pane.textContent)) return 'read only'
    return 'unclear'
  }
  /** ⌘K, its title, ↵ — the way a person opens it. */
  const open = async () => {
    key('k', { metaKey: true })
    await sleep(700)
    const box = q('[data-palette-input]')
    if (!box) return false
    set(box, 'Allotment rules')
    for (let i = 0; i < 40; i++) {
      const t = (q('.pal-row[data-pal-on="1"]')?.textContent ?? '').trim()
      if (t.includes('Allotment') && !t.startsWith('+')) break
      await sleep(100)
    }
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    return until(() => Boolean(notePane()), 4000)
  }
  /** The nameless notes in `folder`, asked of the disk. */
  const untitledIn = async (folder) => {
    const names = Array.from({ length: 40 }, (_, i) =>
      `${folder ? `${folder}/` : ''}${i === 0 ? 'untitled' : `untitled-${i + 1}`}.md`
    )
    const there = await Promise.all(names.map(async (p) => (await window.lanes.note(p)) !== null))
    return names.filter((_, i) => there[i])
  }
  /** ⌘N, and where its note landed — watching the folder it should not be in as well. */
  const nameless = async (expect, other) => {
    const was = await untitledIn(expect)
    const wasOther = await untitledIn(other)
    key('n', { metaKey: true })
    for (let i = 0; i < 20; i++) {
      await sleep(200)
      const here = (await untitledIn(expect)).find((p) => !was.includes(p))
      if (here) return here
      const there = (await untitledIn(other)).find((p) => !wasOther.includes(p))
      if (there) return there
    }
    return '(not found)'
  }
  const log = {}
  await sleep(2800)

  log.startsWith = (await state()).readOnlyFolders
  log.opened = await open()
  await sleep(600)
  log.before = shows()
  log.mainBeforeWritable = (await window.lanes.note(NOTE))?.readOnly === false

  // --- read only, typed in Settings ---
  await openSettings()
  const box = () => q('[data-readonly-folders="1"]')
  log.fieldThere = Boolean(box())
  set(box(), '  inbox  \n\n')
  log.saved = await until(async () => JSON.stringify((await state()).readOnlyFolders) === '["inbox"]', 3000)
  log.savedAs = (await state()).readOnlyFolders
  await closeSettings()
  log.readOnlyOpen = await until(() => shows() === 'read only', 3000)
  log.mainSaysReadOnly = (await window.lanes.note(NOTE))?.readOnly === true
  // And opened afresh, it opens read only too.
  await open()
  await sleep(500)
  log.reopenedReadOnly = shows() === 'read only'

  // --- cleared: writable again ---
  await openSettings()
  log.fieldShowsIt = box()?.value === 'inbox'
  set(box(), '')
  log.cleared = await until(async () => (await state()).readOnlyFolders.length === 0, 3000)
  await closeSettings()
  log.writableAgain = await until(() => shows() === 'writable', 3000)
  log.mainSaysWritable = (await window.lanes.note(NOTE))?.readOnly === false

  // --- new notes go to: here, and not under Interface ---
  await openSettings('interface')
  log.goneFromInterface = !q('input[placeholder="vault root"]')
  await openSettings('threads')
  const folder = q('input[placeholder="vault root"]')
  log.newNoteFieldHere = Boolean(folder)
  set(folder, 'daily')
  log.newNoteSaved = await until(async () => (await state()).newNoteFolder === 'daily', 3000)
  await closeSettings()
  log.namelessThere = await nameless('daily', '')
  log.followsTheSetting = /^daily\/untitled(-\d+)?\.md$/.test(log.namelessThere)

  await openSettings('threads')
  set(q('input[placeholder="vault root"]'), '')
  log.newNoteCleared = await until(async () => (await state()).newNoteFolder === '', 3000)
  await closeSettings()
  log.namelessRoot = await nameless('', 'daily')
  log.backToTheRoot = /^untitled(-\d+)?\.md$/.test(log.namelessRoot)

  log.pass = Boolean(
    log.opened &&
      log.before === 'writable' &&
      log.mainBeforeWritable &&
      log.fieldThere &&
      log.saved &&
      log.readOnlyOpen &&
      log.mainSaysReadOnly &&
      log.reopenedReadOnly &&
      log.fieldShowsIt &&
      log.cleared &&
      log.writableAgain &&
      log.mainSaysWritable &&
      log.goneFromInterface &&
      log.newNoteFieldHere &&
      log.newNoteSaved &&
      log.followsTheSetting &&
      log.newNoteCleared &&
      log.backToTheRoot
  )
  return JSON.stringify(log, null, 1)
})()
