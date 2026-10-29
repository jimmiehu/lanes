// ⌘K MAKES THINGS, not just finds them — and ⌥2 puts the second pane away.
//
// The palette already offered to make a NOTE from what you had typed. It could
// not make a thread, which is the other half of what this app holds and the one
// you reach for more often. A thread has no name until its first message earns
// one, so "a new thread called X" can only mean "one with X ready to send" —
// and it is NOT sent, because what you typed to find something is rarely
// phrased the way you would ask it.
//
// And both offers are there with NOTHING typed, standing above the list, since
// requiring a first keystroke made the two things you reach for most often a
// trick you had to know. Nameless they mean what the shortcuts mean: the thread
// offer is ⌘T, an empty thread with the caret in it, and the note offer is ⌘N,
// a note made at once as `untitled.md` with the caret in the head's empty title.
//
// The nameless note offer used to open the blank note tab, which asked which
// note — because a note could not be made without a name. It can now: the name
// is the first thing typed into the note once it is open, so the offer makes
// one, the same as ⌘N does. `jot.js` holds that note's title naming its file.
//
// Wants a vault and a state directory new for every run, not merely throwaway
// — it writes two notes, one of them `a-palette-note.md` by name, and on a
// second run that name is taken, the make is refused and nothing opens. It
// expects the new-note folder to be the default. It spends no turns: the
// thread it makes is deliberately left unsent. See checks/README.md.
;(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
  const click = (el) => el && el.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  const pane = (i) => document.querySelector(`[data-pane="${i}"]`)
  const rows = () => [...document.querySelectorAll('.pal-row')]
  const rowSaying = (re) => rows().find((r) => re.test(r.innerText))
  const key = (k, opts = {}) =>
    window.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, ...opts }))
  const setInput = (el, v) => {
    const d = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
    d.call(el, v)
    el.dispatchEvent(new Event('input', { bubbles: true }))
  }
  const openPalette = async (q) => {
    // ⌘K on an OPEN palette closes it, so start from closed either way.
    if (document.querySelector('[data-palette-input="1"]')) {
      key('Escape')
      await sleep(350)
    }
    key('k', { metaKey: true })
    await sleep(700)
    // The palette's OWN field: the app has a rail filter and a top search box
    // too, and `querySelector('input')` finds whichever comes first in the DOM.
    const box = document.querySelector('[data-palette-input="1"]')
    if (q) setInput(box, q)
    await sleep(1200)
  }
  const closePalette = async () => {
    key('Escape')
    await sleep(400)
  }
  const selected = () => rows().findIndex((r) => r.getAttribute('data-pal-on') === '1')
  const body = async (p) => (await window.lanes.note(p))?.body ?? null
  // Where a nameless note lands under a fresh state — the default
  // new-note-folder.js holds the app to.
  // Where a nameless note lands out of the box: the vault root.
  const FOLDER = ''
  /**
   * The nameless notes on disk, asked of each file rather than of the note
   * list: the list is the index, and a new note is grafted into it rather than
   * rebuilt into it, so the disk is the one witness that cannot lag.
   */
  const untitledOnDisk = async () => {
    // The app takes the first free slot, so a vault other checks have used can
    // hold a dozen of these already; 200 is far past that, one cheap read each.
    const names = Array.from({ length: 200 }, (_, i) =>
      `${FOLDER ? `${FOLDER}/` : ''}${i === 0 ? 'untitled' : `untitled-${i + 1}`}.md`
    )
    const there = await Promise.all(names.map(async (p) => (await body(p)) !== null))
    return names.filter((_, i) => there[i])
  }
  const log = {}
  await sleep(2600)

  /* ---------- 1. ⌥2 toggles the split ---------- */

  // Matched on the PHYSICAL key: Option is a compose modifier on macOS, so ⌥2
  // arrives as '™' on a US layout and '²' on a German one. Never as '2'.
  const panes = () => document.querySelectorAll('[data-pane], [data-pane-empty]').length
  log.panesAtRest = panes()
  key('²', { altKey: true, code: 'Digit2' })
  await sleep(800)
  log.panesAfterAlt2 = panes()
  log.alt2Opened = log.panesAfterAlt2 !== log.panesAtRest
  key('™', { altKey: true, code: 'Digit2' })
  await sleep(800)
  log.panesAfterAgain = panes()
  log.alt2Untoggles = log.panesAfterAgain === log.panesAtRest
  // And it is the physical key that did it, not the character.
  key('2', { altKey: true, code: 'KeyQ' })
  await sleep(500)
  log.ignoresTheWrongPhysicalKey = panes() === log.panesAtRest

  /* ---------- 2. ⌘K offers to make BOTH ---------- */

  await openPalette('sturgeon migration notes')
  log.offersANote = Boolean(rowSaying(/New note/))
  log.offersAThread = Boolean(rowSaying(/New thread/))
  // Last, never first: ↵ belongs to whatever the query actually found.
  const all = rows().map((r) => r.innerText)
  // The badge has to say which KIND is being offered: the thread row wore the
  // note's badge, which is the one place a launcher must not be ambiguous.
  log.threadRowBadge = rowSaying(/New thread/)?.innerText.match(/NEW THREAD/) ? 'NEW THREAD' : '?'
  log.noteRowBadge = rowSaying(/New note/)?.innerText.match(/NEW NOTE/) ? 'NEW NOTE' : '?'
  log.badgesSayWhich = log.threadRowBadge === 'NEW THREAD' && log.noteRowBadge === 'NEW NOTE'
  log.offersAreLast =
    /New note/.test(all[all.length - 1] ?? '') || /New thread/.test(all[all.length - 1] ?? '')

  /* ---------- 3. the note offer makes a note by the name typed ---------- */

  // Before the nameless half, on purpose: making a note through the app is also
  // what puts one in the list ⌘K shows with nothing typed. A throwaway vault is
  // empty to the app until then, and "the selection rests below the offers"
  // says nothing about a list that is only offers.
  await openPalette('a palette note')
  const noteRow = rowSaying(/New note/)
  log.stillOffersTheNote = Boolean(noteRow)
  click(noteRow)
  await sleep(2200)
  log.noteOnDisk = (await body(`${FOLDER ? `${FOLDER}/` : ''}a-palette-note.md`)) === '# a palette note\n\n'
  log.noteOpenedByItsName =
    (pane(1)?.querySelector('[data-note-title]')?.textContent ?? '').trim() === 'a palette note'
  log.noteMade = Boolean(
    [...document.querySelectorAll('[data-rail-row="note"]')].find((r) =>
      /a palette note/i.test(r.innerText)
    )
  )

  /* ---------- 4. and with NOTHING typed, which is when you need them ---------- */

  // The offers used to require a first keystroke, which made the two things you
  // reach for most often — a fresh thread, a fresh note — a trick you had to
  // know. With nothing typed they stand ABOVE the list, because there is no
  // found row for ↵ to belong to and an offer buried under forty recents is an
  // offer nobody meets.
  await closePalette()
  await openPalette('')
  const bare = rows().map((r) => r.innerText)
  log.emptyOffersANote = Boolean(rowSaying(/New note/))
  log.emptyOffersAThread = Boolean(rowSaying(/New thread/))
  log.emptyOffersAreFirst = /New thread/.test(bare[0] ?? '') && /New note/.test(bare[1] ?? '')
  // Nameless: there is no query to quote, so the row says what it is rather
  // than New note "".
  log.namelessRowReads = (rowSaying(/New note/)?.innerText ?? '').replace(/\s+/g, ' ').trim()
  log.noEmptyQuotes = !/[“”]/.test(log.namelessRowReads)
  // Recorded, not asserted: the line under the label still says where the row
  // used to take you. The row now makes a note, so a promise of a blank tab is
  // the row describing something it no longer does — a wording fix in the
  // palette, and a line to move into `pass` once it is made.
  log.namelessRowPromisesABlankTab = /blank tab/i.test(log.namelessRowReads)
  // ↵ still opens the top RESULT: nothing is made by a return key that was
  // reaching for the most recent thing.
  log.emptySelection = selected()
  log.selectionRestsBelowTheOffers = log.emptySelection === 2
  log.selectedRowIsNotAnOffer = !/New (note|thread)/.test(bare[log.emptySelection] ?? '')

  // Nameless, the note offer is ⌘N: a note made there and then, called
  // `untitled.md` until its title is typed, with the caret already in that
  // title. It used to open the blank tab that asked which note, because a note
  // could not be made without a name; it can now, so asking would be a step
  // between you and the page that no longer buys anything.
  const noteTabs = () => [...document.querySelectorAll('[data-pane="1"] [data-tab]')].length
  const tabsBefore = noteTabs()
  const was = await untitledOnDisk()
  click(rowSaying(/New note/))
  let made = null
  for (let i = 0; i < 15 && !made; i++) {
    await sleep(200)
    made = (await untitledOnDisk()).find((p) => !was.includes(p)) ?? null
  }
  await sleep(500)
  log.namelessNotePath = made
  log.namelessNoteMade = Boolean(made)
  log.paletteGoneAfterNote = !document.querySelector('.pal-row')
  log.namelessNoteOpened = noteTabs() === tabsBefore + 1
  const head = pane(1)?.querySelector('[data-note-title]')
  log.caretInItsTitle = Boolean(head) && document.activeElement === head
  log.titleEmpty = (head?.textContent ?? 'missing').trim() === ''
  // Made, not asked about: no blank tab standing in for it.
  log.noBlankTab = !document.querySelector('[data-empty-body="note"]')

  // And the nameless thread offer is exactly what ⌘T makes: an empty one.
  await openPalette('')
  click(rowSaying(/New thread/))
  await sleep(1500)
  const bareComposer = pane(0)?.querySelector('textarea')
  log.emptyThreadOpened = Boolean(bareComposer)
  log.emptyThreadComposerIsEmpty = bareComposer?.value === ''

  /* ---------- 5. the thread offer opens one, holding the words ---------- */

  await openPalette('sturgeon migration notes')
  click(rowSaying(/New thread/))
  await sleep(1400)
  log.paletteClosed = !document.querySelector('.pal-row')
  const composer = pane(0)?.querySelector('textarea')
  log.landedInTheThreadPane = Boolean(composer)
  log.composerHoldsTheWords = composer?.value === 'sturgeon migration notes'
  // Not sent: no turn has started.
  log.didNotSend = !/\bStop\b/.test(pane(0)?.innerText ?? '')
  log.noAnswerYet = (pane(0)?.querySelectorAll('[data-msg-role="claude"]').length ?? 0) === 0
  // Held, where it was only ever recorded: a thread opened holding words is
  // one you are about to edit, and every other route that opens a thread puts
  // the caret in it (new-thread-focus.js) — this is the one it did not drive.
  log.caretIsInIt = Boolean(composer) && document.activeElement === composer

  /* ---------- 6. the filters keep each offer to its own kind ---------- */

  await openPalette('something quite unlikely')
  const chip = (id) => document.querySelector(`[data-pal-seg="${id}"]`)
  click(chip('notes'))
  await sleep(600)
  log.notesFilterHidesTheThread = !rowSaying(/New thread/) && Boolean(rowSaying(/New note/))
  click(chip('chats'))
  await sleep(600)
  log.chatsFilterHidesTheNote = !rowSaying(/New note/) && Boolean(rowSaying(/New thread/))

  log.pass =
    log.alt2Opened &&
    log.emptyOffersANote &&
    log.emptyOffersAThread &&
    log.emptyOffersAreFirst &&
    log.noEmptyQuotes &&
    log.selectionRestsBelowTheOffers &&
    log.selectedRowIsNotAnOffer &&
    log.namelessNoteMade &&
    log.paletteGoneAfterNote &&
    log.namelessNoteOpened &&
    log.caretInItsTitle &&
    log.titleEmpty &&
    log.noBlankTab &&
    log.emptyThreadComposerIsEmpty &&
    log.alt2Untoggles &&
    log.ignoresTheWrongPhysicalKey &&
    log.offersANote &&
    log.offersAThread &&
    log.offersAreLast &&
    log.badgesSayWhich &&
    log.paletteClosed &&
    log.landedInTheThreadPane &&
    log.composerHoldsTheWords &&
    log.didNotSend &&
    log.noAnswerYet &&
    log.caretIsInIt &&
    log.stillOffersTheNote &&
    log.noteOnDisk &&
    log.noteOpenedByItsName &&
    log.noteMade &&
    log.notesFilterHidesTheThread &&
    log.chatsFilterHidesTheNote
  return log
})()
