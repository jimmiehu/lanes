// ⌘K SAYS WHAT IS OPEN, AND WHEN EACH THING LAST CHANGED.
//
// Every row already carried the time RECENT sorts by and never printed it, and
// nothing in the list said which of its rows were already sitting in a tab —
// so finding a thread you had open meant reading the strip, and "is this the
// note I edited this morning" meant opening it (red: no marks, no ages).
//
// So, on every row that can honestly say: when it last changed, at the right,
// in the rail's own unit (`4m`, `3h`, `6d`), with the moment itself on hover.
// Not where the time is only a sort key — a task (`at: 0`), and a note newer
// than the list, whose `at` is "now" for want of anything better: `1s` would be
// a claim about a note nobody has dated. And the row of anything a tab holds
// draws its glyph the way that tab does — the thread's dot in ink, the note's
// page in ink — exactly those rows and no others. A path of a thread open in a
// tab marks the family's row, since the palette lists a family once, under its
// root. With an open row selected the footer says ↵ goes to its tab, which is
// what ↵ does: no second tab.
//
// Wants the thread fixture, laid down fresh, and a fresh LANES_STATE. It forks
// the fixture's thread (a copy of the file, no turn spent) and seeds two notes:
//
//   node checks/thread-fixture.mjs /private/tmp/lanes-pm-vault
//   LANES_VAULT=/private/tmp/lanes-pm-vault LANES_STATE=/tmp/lanes-pm \
//     LANES_CAPTURE=/tmp/pm.png LANES_CAPTURE_EXEC=checks/palette-marks.js npm run dev
;(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
  const SESSION = '5eed0000-0000-4000-8000-00000000f17e'
  const ALPHA = 'notes/alpha-note.md'
  const BETA = 'notes/beta-note.md'
  const pane = (i) => document.querySelector(`[data-pane="${i}"]`)
  const click = (el) => el && el.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  const key = (k) =>
    window.dispatchEvent(new KeyboardEvent('keydown', { key: k, metaKey: true, bubbles: true }))
  const press = (k) => window.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true }))
  const box = () => document.querySelector('[data-palette-input]')
  const footer = () => document.querySelector('[data-pal-footer]')?.textContent ?? ''
  const rowFor = (kind, id) =>
    [...document.querySelectorAll('.pal-row')].find(
      (r) => r.dataset.palKind === kind && r.dataset.palId === id
    )
  const glyphOf = (row) => row?.querySelector('[data-pal-glyph]')?.getAttribute('data-pal-glyph')
  const palette = async () => {
    if (!box()) key('k')
    await sleep(600)
  }
  const close = async () => {
    if (box()) press('Escape')
    await sleep(300)
  }
  const query = async (q) => {
    Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(box(), q)
    box().dispatchEvent(new Event('input', { bubbles: true }))
    // Names answer at once; the text and task hits come from main a moment later.
    await sleep(1300)
  }
  const pick = async (q) => {
    await palette()
    await query(q)
    press('Enter')
    await sleep(1600)
  }
  /** Walks the selection down onto `row()` — the palette's own ↓. */
  const select = async (row) => {
    for (let i = 0; i < 80 && row() && row().dataset.palOn !== '1'; i++) {
      press('ArrowDown')
      await sleep(30)
    }
    return row()?.dataset.palOn === '1'
  }
  const log = {}
  await sleep(2500)

  // --- a note newer than the list prints no age ---
  // First thing, while the list is still the one the app opened with: the
  // sweep re-lists the vault every thirty seconds, and a listed note is dated.
  const fresh = await window.lanes.noteCreate('Zanzibar ledger', 'notes')
  await window.lanes.noteWrite(fresh.path, '# Zanzibar ledger\n\nquokkaword lives only here.\n')
  await palette()
  await query('quokkaword')
  const freshRow = rowFor('note', fresh.path)
  log.unlistedFound = Boolean(freshRow)
  log.unlistedHasNoAge = Boolean(freshRow) && !freshRow.querySelector('[data-pal-age]')
  await close()

  // --- nor does a task ---
  const errands = await window.lanes.noteCreate('Errands', 'notes')
  await window.lanes.noteWrite(errands.path, '# Errands\n\n- [ ] buy the blue tiles\n')
  await palette()
  await query('blue tiles')
  const task = document.querySelector('.pal-row[data-pal-kind="task"]')
  log.taskFound = Boolean(task)
  log.taskHasNoAge = Boolean(task) && !task.querySelector('[data-pal-age]')
  await close()

  // --- a thread and a note, opened ---
  await pick('Thread fixture')
  await pick('Alpha note')
  log.threadTabOpen = /Thread fixture/.test(pane(0)?.innerText ?? '')
  log.noteTabOpen = /Alpha note/.test(pane(1)?.innerText ?? '')

  // --- the palette marks exactly those, and dates every row it can ---
  await palette()
  const open = [...document.querySelectorAll('.pal-row')]
    .filter((r) => r.dataset.palOpen === '1')
    .map((r) => `${r.dataset.palKind}:${r.dataset.palId}`)
  log.openRows = open
  log.exactlyThoseTwo =
    open.length === 2 && open.includes(`chat:${SESSION}`) && open.includes(`note:${ALPHA}`)
  log.glyphs = {
    thread: glyphOf(rowFor('chat', SESSION)),
    alpha: glyphOf(rowFor('note', ALPHA)),
    beta: glyphOf(rowFor('note', BETA))
  }
  log.glyphsSayIt =
    log.glyphs.thread === 'open' && log.glyphs.alpha === 'open' && log.glyphs.beta === 'closed'
  // Ink against the muted page of a note no tab holds.
  const ink = (row) => {
    const g = row?.querySelector('[data-pal-glyph]')
    return g ? getComputedStyle(g).color : null
  }
  log.openPageInkDiffers = ink(rowFor('note', ALPHA)) !== ink(rowFor('note', BETA))

  const notes = await window.lanes.notesList()
  const alphaAge = rowFor('note', ALPHA)?.querySelector('[data-pal-age]')
  const alphaEdited = notes.find((n) => n.path === ALPHA)?.edited
  log.alphaAge = alphaAge?.textContent ?? null
  log.alphaAgeIsItsMtime =
    Boolean(alphaAge) &&
    /^\d+[smhd]$/.test(alphaAge.textContent) &&
    alphaAge.title === new Date(alphaEdited).toLocaleString()
  const threads = await window.lanes.threads()
  const touched = threads.find((t) => t.id === SESSION)?.touched
  const threadAge = rowFor('chat', SESSION)?.querySelector('[data-pal-age]')
  log.threadAge = threadAge?.textContent ?? null
  log.threadAgeIsTouched =
    Boolean(threadAge) && threadAge.title === new Date(touched).toLocaleString()

  // --- the footer says what ↵ will do ---
  log.selectedOpen = await select(() => rowFor('note', ALPHA))
  log.footerOnOpen = footer()
  log.selectedClosed = await select(() => rowFor('note', BETA))
  log.footerOnClosed = footer()
  log.footerSaysIt =
    /go to its tab/.test(log.footerOnOpen) &&
    /↵ open/.test(log.footerOnClosed) &&
    !/go to its tab/.test(log.footerOnClosed)
  // And ↵ on the open one goes to its tab rather than making another.
  await select(() => rowFor('note', ALPHA))
  const noteTabs = () => pane(1)?.querySelectorAll('[data-tab]').length ?? 0
  const before = noteTabs()
  press('Enter')
  await sleep(1200)
  log.noSecondTab = noteTabs() === before

  // --- a path open in a tab marks its family's row ---
  await close()
  const firstAnswer = pane(0)?.querySelectorAll('[data-msg-role="claude"]')[0]
  const fork = firstAnswer
    ? [...firstAnswer.querySelectorAll('.msg-action')].find(
        (d) => d.textContent.trim().toLowerCase() === 'fork'
      )
    : null
  log.forkOffered = Boolean(fork)
  click(fork)
  for (let i = 0; i < 30 && !pane(0)?.querySelector('[data-seam]'); i++) await sleep(300)
  await sleep(800)
  const { state } = await window.lanes.bootstrap()
  const path = Object.keys(state.pathways).find((p) => state.pathways[p].parent === SESSION)
  log.forkedTo = path ?? null
  await palette()
  log.familyRowOpen = rowFor('chat', SESSION)?.dataset.palOpen === '1'
  log.pathNotListedApart = Boolean(path) && !rowFor('chat', path)
  await close()

  log.pass = Boolean(
    log.unlistedHasNoAge &&
      log.taskHasNoAge &&
      log.exactlyThoseTwo &&
      log.glyphsSayIt &&
      log.openPageInkDiffers &&
      log.alphaAgeIsItsMtime &&
      log.threadAgeIsTouched &&
      log.footerSaysIt &&
      log.noSecondTab &&
      log.forkedTo &&
      log.familyRowOpen &&
      log.pathNotListedApart
  )
  return JSON.stringify(log, null, 1)
})()
