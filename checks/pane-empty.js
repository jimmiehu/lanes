// The two features of the original pane-and-empty design: selection as
// elevation (the focused pane lifts, the other seats into the desk, and the
// Interface toggle swaps it back to the ring), and the empty pane — ghost,
// copy, a counted action that opens the palette pre-filtered, and the list.
//
// And the empty NOTE pane's first chip, New note, which is the same act as ⌘N
// now. It used to open the + menu's naming field, a question before the note
// existed; since the notes editor it makes an untitled note at once —
// `untitled.md`, or the next free `untitled-N.md`, in the new-note folder — and
// opens it in this pane in WRITE with the caret in the head's empty title,
// where the placeholder says Untitled. No field to name it in, no menu. The
// words typed under it land in the file it made, which is what ties the chip
// to that file rather than to whatever note happened to open. jot.js holds the
// other routes to the same act, timed, down to the title naming the file.
//
// It seeds its own note through the app's IPC: something to open into the
// split, holding an open task for the counted chip to count. A note written
// behind the app's back is counted when the vault sweep reads it, as one a
// turn wrote would be, so in a vault with no other open tasks the chip can
// take up to half a minute to appear. Wants a throwaway LANES_VAULT (it makes
// notes) and a fresh LANES_STATE (it flips the Interface toggle).
// See checks/README.md for how to run it.
(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
  const frame = () =>
    new Promise((r) => {
      requestAnimationFrame(() => r())
      setTimeout(r, 50)
    })
  const click = (el) => el && el.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  const shadowOf = (el) => (el ? getComputedStyle(el).boxShadow : '')
  const seated = (el) => /inset .*9999px|9999px/.test(shadowOf(el))
  const key = (k, opts = {}) =>
    window.dispatchEvent(new KeyboardEvent('keydown', { key: k, metaKey: true, bubbles: true, ...opts }))
  const byText = (re) =>
    [...document.querySelectorAll('div')].find((d) => re.test(d.innerText.trim()) && d.children.length === 0)
  const pane = (i) => document.querySelector(`[data-pane="${i}"]`)
  const content = () => pane(1)?.querySelector('.cm-content')
  const title = () => pane(1)?.querySelector('[data-note-title]')
  const type = (text) => document.execCommand('insertText', false, text)
  const titleFocused = () => {
    const a = document.activeElement
    return Boolean(a?.matches?.('[data-note-title]') && pane(1)?.contains(a))
  }
  const A = () => document.querySelector('[data-pane="0"], [data-pane-empty="chat"]')
  const B = () => document.querySelector('[data-pane="1"], [data-pane-empty="note"]')
  const emptyB = () => document.querySelector('[data-pane-empty="note"]')
  /** Close every note tab, so pane B closes to its empty destination. */
  const emptyTheNotePane = async () => {
    click(B())
    await sleep(300)
    for (let i = 0; i < 8; i += 1) {
      if (emptyB()) break
      // ⌘W is a menu accelerator, so close via the tab's ✕ instead.
      const x = document.querySelector('[data-pane="1"] .tab-x')
      if (!x) break
      click(x)
      await sleep(600)
    }
    return Boolean(emptyB())
  }
  // Where a nameless note lands under a fresh LANES_STATE — the default
  // new-note-folder.js holds the app to.
  // Where a nameless note lands out of the box: the vault root.
  const FOLDER = ''
  const body = async (p) => (await window.lanes.note(p))?.body ?? null
  /**
   * The nameless notes on disk, asked of each file rather than of the note
   * list: making one does not rebuild the index, so the list is not the thing
   * to ask whether it exists.
   */
  const untitledOnDisk = async () => {
    const names = Array.from({ length: 12 }, (_, i) => `${FOLDER ? `${FOLDER}/` : ''}${i === 0 ? 'untitled' : `untitled-${i + 1}`}.md`)
    const there = await Promise.all(names.map(async (p) => (await body(p)) !== null))
    return names.filter((_, i) => there[i])
  }
  const log = {}
  await sleep(3000)

  // --- a note to open, with a task in it ---
  const NAME = 'Empty pane check'
  const made = await window.lanes.noteCreate(NAME, '_unfiled')
  const PATH = made.path || '_unfiled/empty-pane-check.md'
  await window.lanes.noteWrite(PATH, `# ${NAME}\n\n- [ ] a task left open, for the note pane to count\n`)

  // --- elevation, single pane: always lifted ---
  log.soloShadow = Boolean(A()) && shadowOf(A()) !== 'none' && !seated(A())

  // --- elevation in the split: focused lifts, the other seats, click swaps ---
  key('k')
  await sleep(600)
  const box = document.querySelector('[data-palette-input]')
  if (box) {
    Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(box, NAME)
    box.dispatchEvent(new Event('input', { bubbles: true }))
    await sleep(1000)
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
  }
  await sleep(1800)
  log.split = Boolean(A() && B())
  // Opening a note focused pane B.
  log.noteLifted = !seated(B())
  log.threadSeated = seated(A())
  click(A())
  await sleep(500)
  log.swapsOnClick = !seated(A()) && seated(B())

  // --- the empty pane ---
  log.emptyPaneShown = await emptyTheNotePane()
  if (!emptyB()) return JSON.stringify({ ...log, pass: false }, null, 1)

  // An empty pane still participates in selection.
  log.emptyParticipates = shadowOf(emptyB()) !== 'none'
  const text = emptyB().innerText
  log.kicker = /NOTE PANE/.test(text)
  log.headline = /No note open/.test(text)
  log.teaches = /always open here/.test(text)
  log.searchChip = /Search everything/.test(text)
  // The ghost: the page's 38×2 title rule.
  log.ghost = [...emptyB().querySelectorAll('div')].some(
    (d) => d.style.width === '38px' && d.style.height === '2px'
  )

  // --- New note: an untitled note, at once, with the caret in its title ---
  // The chip CONTAINER is the clickable one: the one wearing the pointer.
  const newChip = [...emptyB().querySelectorAll('div')].find(
    (d) => /^New note/.test(d.innerText.trim()) && d.style.cursor === 'pointer'
  )
  log.newChip = Boolean(newChip)
  const before = await untitledOnDisk()
  let asked = false
  click(newChip)
  const t0 = performance.now()
  while (!titleFocused() && performance.now() - t0 < 3000) {
    await frame()
    if (document.querySelector('[data-new-note-field]') || document.querySelector('[data-new-menu]')) asked = true
  }
  log.newChipMs = titleFocused() ? Math.round(performance.now() - t0) : null
  log.noNamingStep = !asked && !document.querySelector('[data-new-note-field]')
  log.opensHereInWrite = Boolean(pane(1)) && !emptyB() && Boolean(content())
  log.caretInItsTitle = titleFocused()
  log.titleEmpty = (title()?.textContent ?? 'missing').trim() === ''
  log.saysUntitled = title()?.getAttribute('data-placeholder') === 'Untitled'
  let untitled = null
  for (let i = 0; i < 20 && !untitled; i++) {
    untitled = (await untitledOnDisk()).find((p) => !before.includes(p)) ?? null
    if (!untitled) await sleep(200)
  }
  log.untitledPath = untitled
  log.madeAnUntitledNote = Boolean(untitled)
  // ↵ goes on into the words, and the words go into the file the chip made.
  title()?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))
  await sleep(300)
  log.enterGoesToBody = Boolean(content()) && document.activeElement === content()
  if (log.enterGoesToBody) type('written from the empty pane')
  await sleep(2600)
  log.wordsLandInThatFile = Boolean(untitled) && ((await body(untitled)) ?? '').includes('written from the empty pane')
  // And back to the empty pane, for the rest.
  log.emptyAgain = await emptyTheNotePane()
  if (!emptyB()) return JSON.stringify({ ...log, pass: false }, null, 1)

  // --- the counted chip ---
  // The chip CONTAINER is the clickable one, and it is the first div whose
  // whole text is the count — its label child matches too, but clicking the
  // child's PARENT row would only bubble up past the handler. It shows only
  // when there is something to count, so it is waited for: see the header.
  const countedChip = () =>
    [...(emptyB()?.querySelectorAll('div') ?? [])].find(
      (d) => /^\d+ open tasks?$/.test(d.innerText.trim()) && d.style.cursor === 'pointer'
    )
  for (let i = 0; i < 90 && !countedChip(); i++) await sleep(500)
  const chip = countedChip()
  log.countedChip = Boolean(chip)
  if (chip) {
    const n = parseInt(chip.innerText, 10)
    log.countIsLive = n > 0
    // It opens the palette pre-filtered to TASKS: the seg control paints the
    // active filter with inline background var(--ink).
    click(chip)
    await sleep(800)
    const seg = (label) =>
      [...document.querySelectorAll('div')].find((d) => d.innerText.trim() === label)
    log.paletteOpensOnTasks = seg('TASKS')?.style.background === 'var(--ink)'
    log.allNotActive = seg('ALL')?.style.background !== 'var(--ink)'
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    await sleep(400)
  }

  // --- the toggle swaps elevation back to the ring ---
  key(',')
  await sleep(600)
  click(byText(/^Models, safety, skills and prompts$/))
  await sleep(800)
  click([...document.querySelectorAll('div')].find((d) => d.innerText.trim() === 'Interface' && d.children.length === 0))
  await sleep(500)
  const row = [...document.querySelectorAll('div')].find(
    (d) => d.innerText.trim() === 'Lift the selected pane' && d.children.length === 0
  )
  log.toggleOffered = Boolean(row)
  if (row) {
    click(row.closest('[style*="cursor"]') ?? row.parentElement)
    await sleep(500)
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    await sleep(500)
    // With the lift off, nobody is seated and the focused pane wears the ring.
    log.liftOffNooneSeated = !seated(A()) && !seated(emptyB())
    const ringed = /0px 0px 0px 1px/.test(shadowOf(A())) || /0px 0px 0px 1px/.test(shadowOf(emptyB()))
    log.liftOffRingsTheFocused = ringed
  }

  log.pass = Boolean(
    log.soloShadow &&
    log.split &&
    log.noteLifted &&
    log.threadSeated &&
    log.swapsOnClick &&
    log.emptyPaneShown &&
    log.emptyParticipates &&
    log.kicker &&
    log.headline &&
    log.teaches &&
    log.searchChip &&
    log.ghost &&
    log.newChip &&
    log.noNamingStep &&
    log.opensHereInWrite &&
    log.caretInItsTitle &&
    log.titleEmpty &&
    log.saysUntitled &&
    log.madeAnUntitledNote &&
    log.enterGoesToBody &&
    log.wordsLandInThatFile &&
    log.emptyAgain &&
    log.countedChip &&
    log.countIsLive &&
    log.paletteOpensOnTasks &&
    log.allNotActive &&
    log.toggleOffered &&
    log.liftOffNooneSeated &&
    log.liftOffRingsTheFocused
  )
  return JSON.stringify(log, null, 1)
})()
