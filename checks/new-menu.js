// Asserts the top bar's + asks which kind of thing to make — a Thread or a
// Note — and then asks nothing more. The workspace makes two kinds of thing and
// the button only ever made one of them, so the other had to be found in a rail
// that may not be open.
//
// The Note used to open a naming field inside the menu, and ⌘N opened the same
// field directly. Both now make the note at once — `untitled.md` in the
// new-note folder, opened in the note pane with the caret in the head's title —
// so what is held here is the menu's side of that: nothing asked, the menu
// gone, and a note actually made and open. "Nothing asked" is held by where the
// caret lands — in the new note's title, which is where a naming step would be
// standing if there were one. It used to be held by the naming field's own
// attribute being absent, and with the field gone from the app that absence
// could no longer fail. `jot.js` holds the rest, timed: the title empty, the
// words landing in the file that was made, and a title naming that file.
//
// ⇧⌘N no longer makes a pane. It used to open a new pane with a fresh chat in
// it; with the panes role-assigned there is no such thing — the second pane is
// the note pane, and ⌘\ is how you see it. The pane count alone cannot say
// that once the split is open, so the fresh chat is looked for as well.
//
// Run against a throwaway LANES_VAULT and a fresh LANES_STATE: it writes notes,
// and counts on the new-note folder being the default. See checks/README.md.
(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
  const pane = (i) => document.querySelector(`[data-pane="${i}"]`)
  const tabs = (i) =>
    [...(pane(i)?.querySelectorAll('[data-tab]') ?? [])].map((t) => t.textContent.replace(/×$/, '').trim())
  const onTab = (i) =>
    (pane(i)?.querySelector('[data-tab-on="1"]')?.textContent ?? '').replace(/×$/, '').trim()
  const click = (el) => el && el.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  const btn = () => document.querySelector('[data-new-button]')
  const menu = () => document.querySelector('[data-new-menu]')
  const item = (label) =>
    menu() &&
    [...menu().querySelectorAll('.ctx-item')].find((d) => d.textContent.trim().startsWith(label))
  const key = (k, shift) =>
    window.dispatchEvent(
      new KeyboardEvent('keydown', { key: k, metaKey: true, shiftKey: Boolean(shift), bubbles: true })
    )
  const panes = () => document.querySelectorAll('[data-pane]').length
  // The caret in the note pane's title: where a note made with nothing asked
  // puts it, and where it could not be if a question stood in between.
  const titleFocused = () => Boolean(document.activeElement?.matches?.('[data-pane="1"] [data-note-title]'))
  const body = async (p) => (await window.lanes.note(p))?.body ?? null
  // Where a nameless note lands under a fresh LANES_STATE — the default
  // new-note-folder.js holds the app to.
  // Where a nameless note lands out of the box: the vault root.
  const FOLDER = ''
  /**
   * The nameless notes on disk, asked of each file in turn rather than of the
   * note list: the list is the index, and a new note is grafted into it rather
   * than rebuilt into it — a check that asked the list would be asking the
   * thing under test.
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
  /** The nameless note that was not there in `before`, once it is on disk. */
  const madeSince = async (before) => {
    for (let i = 0; i < 15; i++) {
      const p = (await untitledOnDisk()).find((x) => !before.includes(x))
      if (p) return p
      await sleep(200)
    }
    return null
  }
  const log = {}
  await sleep(2500)

  click(btn())
  await sleep(400)
  log.opens = Boolean(menu())
  // The label is the row's first child; the second is its shortcut hint, which
  // is exactly the kind of thing that changes and should not break this.
  log.offers = menu()
    ? [...menu().querySelectorAll('.ctx-item')].map((d) => d.firstElementChild.textContent.trim())
    : []
  log.offersBoth = JSON.stringify(log.offers) === JSON.stringify(['Thread', 'Note'])

  // esc closes it, the way every other menu in the app does
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
  await sleep(300)
  log.escCloses = !menu()

  // --- Thread ---
  click(btn())
  await sleep(300)
  const before = tabs(0).length
  click(item('Thread'))
  await sleep(900)
  log.threadAddedTab = tabs(0).length === before + 1
  log.closedAfterThread = !menu()

  // --- Note: made at once, with nothing asked ---
  click(btn())
  await sleep(300)
  const onDisk = await untitledOnDisk()
  const noteTabs = tabs(1).length
  click(item('Note'))
  const made = await madeSince(onDisk)
  await sleep(600)
  // The Thread above left the caret in its composer, so this is the caret
  // having MOVED to the new note's title, not one that was already there.
  log.noteAsksNothing = titleFocused()
  log.notePath = made
  log.noteMade = Boolean(made)
  log.closedAfterNote = !menu()
  // Opened in the NOTE pane, as its front tab — the pane roles decide where a
  // note goes, not where the button happens to be.
  // A nameless note is called by its filename, dashes read as spaces:
  // `untitled-2.md` is "untitled 2" on its tab.
  const nameless = /^untitled( \d+)?$/i
  log.noteTab = onTab(1)
  log.noteOpened = tabs(1).length === noteTabs + 1 && nameless.test(log.noteTab)
  log.noteNotInThreadPane = !tabs(0).some((t) => nameless.test(t))

  // --- ⌘N is the same note, without the question in front of it ---
  const onDisk2 = await untitledOnDisk()
  // Out of the last note's title first, or a caret that never moved would
  // read as one that landed.
  document.activeElement?.blur?.()
  key('n')
  await sleep(250)
  log.cmdNSkipsTheMenu = !menu()
  const made2 = await madeSince(onDisk2)
  await sleep(300)
  log.cmdNPath = made2
  log.cmdNMakesANote = Boolean(made2) && made2 !== made
  log.cmdNAsksNothing = titleFocused()

  // --- and the pane ⇧⌘N used to make is not made ---
  const panesBefore = panes()
  // What that pane was made to hold: a fresh chat. The two panes are fixed
  // once the split is open, so a thread tab appearing is the old ⇧⌘N back
  // under another name — and the one sign of it a count of panes would miss.
  const threadTabsBefore = tabs(0).length
  const onDisk3 = await untitledOnDisk()
  key('n', true)
  await sleep(1200)
  log.shiftCmdNMakesNoPane = panes() === panesBefore && tabs(0).length === threadTabsBefore
  log.shiftCmdNOpensNoMenu = !menu()
  // Recorded, not asserted. The shortcut handler matches ⌘N with or without ⇧,
  // so ⇧⌘N makes a nameless note exactly as ⌘N does. This check used to claim
  // the shift variant made nothing at all; whether it should is a decision for
  // the handler, not for a check to settle by itself.
  log.shiftCmdNMadeANote = Boolean(await madeSince(onDisk3))

  log.pass =
    log.opens &&
    log.offersBoth &&
    log.escCloses &&
    log.threadAddedTab &&
    log.closedAfterThread &&
    log.noteAsksNothing &&
    log.noteMade &&
    log.closedAfterNote &&
    log.noteOpened &&
    log.noteNotInThreadPane &&
    log.cmdNSkipsTheMenu &&
    log.cmdNMakesANote &&
    log.cmdNAsksNothing &&
    log.shiftCmdNMakesNoPane &&
    log.shiftCmdNOpensNoMenu
  return log
})()
