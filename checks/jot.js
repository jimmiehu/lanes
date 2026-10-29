// A THOUGHT, WRITTEN DOWN, IN TWO KEYSTROKES.
//
// ⌘N is a note, now — not a question about one. No name asked for first, no
// popover to answer, no folder to pick: the file is made nameless, as
// `untitled.md` and then `untitled-2.md`, and the caret is already in the
// head's title, which says Untitled in grey until you write over it. ↵ goes
// down into the body. A title, once committed, names the file and heads it; a
// note left without one keeps its placeholder name, and the next nameless note
// does not land on top of it. The + menu's Note is the same act by mouse.
//
// Until it has a title a note is called by its first line of writing — in its
// tab, in the head's grey placeholder and in the note list — because six notes
// all called Untitled are six notes you cannot tell apart. And a note made and
// never written in is gone once its tab closes, to the Trash, while one with
// words in it stays.
//
// And the first letters are the new note's, however soon they come. Making the
// note is a round trip to main and a render, and until it was on screen the
// caret was still in the note you left, which took what you typed and saved
// it. So one run here types in the same breath as ⌘N — nothing awaited between
// the two — and wants those letters in the new note's title, what follows a ↵
// in its body, and the note that had the caret unchanged on disk.
//
// And from a BLANK TAB too, where there is no note on screen at all. The head's
// title field reaches the note through a link the pane makes when the note is
// drawn, and that link was made a beat after the held letters were handed over:
// the title went into the field and nowhere else, the ↵ named nothing, and what
// came after it was typed into the title (red).
//
// And a title left by ⌘1–9 — no ↵, no click away — still names the note. The
// field settles the title as it goes, and it read its words from an element
// React had already let go of: nothing, so the note stayed untitled (red).
//
// It is timed, because the claim is that it is instant, and a name asked for
// up front was only ever a way of hiding how long the making took. The note
// index is warmed before the clock starts, so what is measured is making a note
// rather than the first index build, which is a different cost paid once.
// 400ms is the ceiling in the dev build; production is quicker.
//
// And the vault is made the size of a real one before the clock starts. The
// cost this is here to catch — the index thrown away by every new note and
// rebuilt before the note can open — is a few milliseconds over a scratch
// vault of three notes and a second or more over seventy megabytes, so against
// an empty vault the timing would pass a build that still pays it.
//
// Wants a throwaway LANES_VAULT nothing has run in — empty, or a copy of one
// that size — and a fresh LANES_STATE, both new for every run: a `jot-check.md`
// or `quick-one.md` an earlier run left behind is in the way of this run's
// renames, and its nameless notes shift the numbering. An empty vault gets
// 1,500 notes (~60MB) seeded into `seed/` first. See checks/README.md.
(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
  // One animation frame — or 50ms, if the window is not being painted and the
  // frame never comes, so a hidden window slows the check rather than hangs it.
  const frame = () =>
    new Promise((r) => {
      requestAnimationFrame(() => r())
      setTimeout(r, 50)
    })
  const pane = (i) => document.querySelector(`[data-pane="${i}"]`)
  const key = (k, extra = {}) =>
    window.dispatchEvent(new KeyboardEvent('keydown', { key: k, metaKey: true, bubbles: true, ...extra }))
  const click = (el) => el && el.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  const content = () => pane(1)?.querySelector('.cm-content')
  const title = () => pane(1)?.querySelector('[data-note-title]')
  const type = (text) => document.execCommand('insertText', false, text)
  const titleFocused = () => {
    const a = document.activeElement
    return Boolean(a?.matches?.('[data-note-title]') && pane(1)?.contains(a))
  }
  const inBody = () => Boolean(content()) && document.activeElement === content()
  const empty = () => (title()?.textContent ?? 'missing').trim() === ''
  const placeholder = () => title()?.getAttribute('data-placeholder') === 'Untitled'
  // The naming field and the + menu: either one on screen after ⌘N is a
  // question the keystroke was supposed to have made unnecessary.
  const asking = () =>
    Boolean(document.querySelector('[data-new-note-field]') || document.querySelector('[data-new-menu]'))
  const enterOn = (el) =>
    el?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))
  const onTab = () =>
    (pane(1)?.querySelector('[data-tab-on="1"]')?.textContent ?? '').replace(/×$/, '').trim()
  const menuItem = (label) => {
    const m = document.querySelector('[data-new-menu]')
    return m && [...m.querySelectorAll('.ctx-item')].find((d) => d.textContent.trim().startsWith(label))
  }
  const paths = async () => (await window.lanes.notesList()).map((n) => n.path)
  const body = async (p) => (await window.lanes.note(p))?.body ?? null
  // Where a nameless note lands under a fresh LANES_STATE — the default
  // new-note-folder.js holds the app to: the vault root, the folder named ''.
  const FOLDER = ''
  /**
   * The nameless notes on disk, asked of each file in turn rather than of the
   * note list. That list IS the index, and making a note without rebuilding the
   * index is part of the claim — so a new note the index has not caught up with
   * yet, until the sweep comes round, is one this still has to see.
   */
  const untitledOnDisk = async () => {
    const names = Array.from({ length: 12 }, (_, i) =>
      `${FOLDER ? `${FOLDER}/` : ''}${i === 0 ? 'untitled' : `untitled-${i + 1}`}.md`
    )
    const there = await Promise.all(names.map(async (p) => (await body(p)) !== null))
    return names.filter((_, i) => there[i])
  }
  /** The nameless note that was not there in `before`, once it is on disk. */
  const madeSince = async (before) => {
    for (let i = 0; i < 20; i++) {
      const p = (await untitledOnDisk()).find((x) => !before.includes(x))
      if (p) return p
      await sleep(200)
    }
    return null
  }
  /**
   * Fires `act` and waits, frame by frame, for the caret to land in the head's
   * title. Returns how long that took, and whether a naming field or the menu
   * showed itself on any frame along the way — a popover that flashes up and is
   * dismissed is still a popover.
   */
  const timed = async (act) => {
    let flashed = false
    const t0 = performance.now()
    act()
    while (!titleFocused() && performance.now() - t0 < 3000) {
      await frame()
      if (asking()) flashed = true
    }
    const ms = titleFocused() ? Math.round(performance.now() - t0) : null
    return { ms, flashed }
  }
  const log = {}

  // The app as it opens, left to settle.
  await sleep(2500)

  // A vault the size of the real one: 1,500 notes of ~40KB each. Curly quotes,
  // dashes and an accent in the prose, because the build folds those and a
  // vault of plain ASCII would build quicker than any real one; a task and a
  // link in each, because it gathers those too. A vault already this big —
  // given as --vault — is taken as it is.
  const SEEDS = 1500
  if ((await paths()).length < SEEDS) {
    const para =
      'A paragraph of the ordinary kind a vault is made of — “quoted”, with a dash, set in Kraków. '
    const prose = para.repeat(Math.ceil(40000 / para.length))
    for (let i = 0; i < SEEDS; i += 50) {
      await Promise.all(
        Array.from({ length: Math.min(50, SEEDS - i) }, async (_, j) => {
          const n = i + j + 1
          const made = await window.lanes.noteCreate(`Seed ${n}`, 'seed')
          if (!made?.ok || !made.path) return
          const next = (n % SEEDS) + 1
          await window.lanes.noteWrite(
            made.path,
            `# Seed ${n}\n\n- [ ] a task that points at [[seed-${next}]]\n\n${prose}\n`
          )
        })
      )
    }
  }

  // And the index built over all of it — the clock below is for making a note,
  // not for the vault being read for the first time. `vault` is every note
  // there before the first ⌘N, seeds included.
  const vault = await paths()
  const first = await untitledOnDisk()

  // --- ⌘N: a note, with the caret in its title ---
  const one = await timed(() => key('n'))
  log.ms = one.ms
  await sleep(300)
  log.noNamingPopover = !one.flashed && !asking()
  log.titleFocused = titleFocused()
  log.titleEmpty = empty()
  log.saysUntitled = placeholder()
  log.editorPresent = Boolean(content())
  log.fastEnough = log.ms !== null && log.ms < 400
  const untitled = await madeSince(first)
  log.untitledPath = untitled
  log.madeUntitled = Boolean(untitled)

  // --- a title, then ↵ down into the body ---
  if (log.titleFocused) type('Jot check')
  await sleep(150)
  log.titleTyped = (title()?.textContent ?? '').trim() === 'Jot check'
  enterOn(title())
  await sleep(300)
  log.enterGoesToBody = inBody()
  if (log.enterGoesToBody) type('first thought')
  // The rename happens on commit and the save pipeline is ~1.8s; both have to
  // have landed before the disk is worth asking.
  await sleep(2600)

  let jot = null
  for (let i = 0; i < 15 && !jot; i++) {
    // Anchored on the file name, and new since the run began: a `jot-check.md`
    // already in the vault would otherwise stand in for the rename this run
    // was supposed to make — and be the reason that rename was refused.
    jot = (await paths()).find((p) => /(^|\/)jot-check\.md$/.test(p) && !vault.includes(p)) ?? null
    if (!jot) await sleep(300)
  }
  log.jotPath = jot
  log.renamedToTitle = Boolean(jot)
  // Renamed, not copied: the untitled file is gone rather than left behind
  // beside the named one. Asked of the disk, like its making was.
  log.untitledGone = Boolean(untitled) && (await body(untitled)) === null
  // A rename names; it does not move.
  log.sameFolder =
    Boolean(jot && untitled) && jot.slice(0, jot.lastIndexOf('/') + 1) === untitled.slice(0, untitled.lastIndexOf('/') + 1)
  const jotBody = jot ? await body(jot) : null
  log.jotBody = jotBody
  // The title first and the thought under it, and nothing else. How many blank
  // lines sit between them is the editor's business: neither the shape a
  // nameless file starts as nor the line ↵ lands on is fixed anywhere, and
  // `# Jot check` straight over its first line is as right as one with a gap.
  log.bodyIsTitleAndThought = jotBody !== null && /^# Jot check\n+first thought\n*$/.test(jotBody)
  log.tab = onTab()
  log.tabSaysJotCheck = /Jot check/.test(log.tab)
  log.headSaysJotCheck = (title()?.textContent ?? '').trim() === 'Jot check'

  // --- a SECOND ⌘N, and no title at all ---
  const second = await untitledOnDisk()
  const two = await timed(() => key('n'))
  log.ms2 = two.ms
  await sleep(150)
  log.againNoPopover = !two.flashed && !asking()
  log.againTitleFocused = titleFocused()
  log.againTitleEmpty = empty()
  // ↵ straight away: nothing to commit, so nothing to rename.
  enterOn(title())
  await sleep(300)
  log.againEnterGoesToBody = inBody()
  if (log.againEnterGoesToBody) type('no title here')
  await sleep(2600)
  const nameless = await madeSince(second)
  log.namelessPath = nameless
  // It stays nameless, and it is its own file: the first note's `untitled.md`
  // was freed by the rename, but the words have to have gone to THIS one.
  log.namelessStaysNameless = Boolean(nameless) && ((await body(nameless)) ?? '').includes('no title here')
  log.firstNoteUntouched = jot !== null && (await body(jot)) === jotBody
  // Called by its words, everywhere it is named, while the head's title field
  // stays empty — a placeholder is not a title, and nothing was renamed.
  log.tabIsItsFirstLine = /no title here/.test(onTab())
  log.headOffersItsFirstLine = title()?.getAttribute('data-placeholder') === 'no title here' && empty()
  let listed = null
  for (let i = 0; i < 10 && listed !== 'no title here'; i++) {
    listed = (await window.lanes.notesList()).find((n) => n.path === nameless)?.title ?? null
    if (listed !== 'no title here') await sleep(300)
  }
  log.listedTitle = listed
  log.listIsItsFirstLine = listed === 'no title here'

  // --- typed before the note is there: the first letters are still its own ---
  //
  // The keystroke and the typing in ONE synchronous run, before anything here
  // is awaited: whatever has the caret at that moment is where a person's next
  // letters land while the note is being made. That is the nameless note just
  // written in, and without the holder the letters were typed, and saved, into
  // it. The ↵ goes in the way a field takes one — a line break — and has to
  // come out the other end as ↵ in the title: down into the body.
  if (!inBody()) content()?.focus()
  log.aheadFromABody = inBody()
  const leftAs = nameless ? await body(nameless) : null
  key('n')
  type('Quick one\nand the rest')
  // Until the NEW note's head says it: the old note's editor, still on screen
  // for a frame or two, would hold the words too if they went astray.
  for (let i = 0; i < 60 && !((title()?.textContent ?? '').trim() === 'Quick one' && inBody()); i++) await frame()
  await sleep(300)
  log.aheadTitle = (title()?.textContent ?? '').trim()
  log.aheadNamedTheNewNote = log.aheadTitle === 'Quick one'
  log.aheadRestInItsBody = inBody() && /and the rest/.test(content()?.textContent ?? '')
  await sleep(2600)
  let quick = null
  for (let i = 0; i < 15 && !quick; i++) {
    quick = (await paths()).find((p) => /(^|\/)quick-one\.md$/.test(p) && !vault.includes(p)) ?? null
    if (!quick) await sleep(300)
  }
  log.aheadPath = quick
  const quickBody = quick ? await body(quick) : null
  log.aheadBody = quickBody
  // Named by its title and renamed for it, like any other — so the letters
  // were the note's own, not pasted over it afterwards.
  log.aheadInItsOwnFile = quickBody !== null && /^# Quick one\n+and the rest\n*$/.test(quickBody)
  log.aheadLeftTheLastNoteAlone = leftAs !== null && (await body(nameless)) === leftAs

  // --- typed before the note is there, from a blank tab: nothing on screen to hold it ---
  key('t')
  for (let i = 0; i < 40 && !document.querySelector('[data-empty-body="note"]'); i++) await frame()
  log.blankTabOpen = Boolean(document.querySelector('[data-empty-body="note"]'))
  key('n')
  type('Blank start\nand what follows')
  for (let i = 0; i < 60 && !((title()?.textContent ?? '').trim() === 'Blank start' && inBody()); i++) await frame()
  await sleep(300)
  log.blankAheadTitle = (title()?.textContent ?? '').trim()
  log.blankAheadRestInItsBody = inBody() && /and what follows/.test(content()?.textContent ?? '')
  await sleep(2600)
  let blank = null
  for (let i = 0; i < 15 && !blank; i++) {
    blank = (await paths()).find((p) => /(^|\/)blank-start\.md$/.test(p) && !vault.includes(p)) ?? null
    if (!blank) await sleep(300)
  }
  const blankBody = blank ? await body(blank) : null
  log.blankAheadBody = blankBody
  log.blankAheadInItsOwnFile = blankBody !== null && /^# Blank start\n+and what follows\n*$/.test(blankBody)

  // --- a title left by ⌘1: no ↵, no click away, and still the note's name ---
  const numbered = await untitledOnDisk()
  const five = await timed(() => key('n'))
  log.ms5 = five.ms
  const leftBy = await madeSince(numbered)
  if (titleFocused()) type('Left by number')
  await sleep(200)
  // By the physical key, as the app reads it: `key` alone is not ⌘1.
  key('1', { code: 'Digit1' })
  await sleep(2600)
  let byNumber = null
  for (let i = 0; i < 15 && !byNumber; i++) {
    byNumber = (await paths()).find((p) => /(^|\/)left-by-number\.md$/.test(p) && !vault.includes(p)) ?? null
    if (!byNumber) await sleep(300)
  }
  log.leftByNumberPath = byNumber
  log.leftByNumberNamed = Boolean(byNumber) && /^# Left by number\n/.test((await body(byNumber)) ?? '')
  log.leftByNumberUntitledGone = Boolean(leftBy) && (await body(leftBy)) === null

  // --- the + menu's Note is the same act ---
  const third = await untitledOnDisk()
  click(document.querySelector('[data-new-button]'))
  await sleep(300)
  const noteItem = menuItem('Note')
  log.plusOffersNote = Boolean(noteItem)
  const three = await timed(() => click(noteItem))
  log.ms3 = three.ms
  await sleep(300)
  // The menu itself was on screen until the click, so only the naming field
  // counts against this one — and the menu has to have gone after it.
  log.plusNoNamingField = !document.querySelector('[data-new-note-field]')
  log.plusMenuClosed = !document.querySelector('[data-new-menu]')
  log.plusTitleFocused = titleFocused()
  log.plusTitleEmpty = empty()
  // A few words into it, because an empty title is what the second note shows
  // too: a + that made one file and opened another would pass every line above.
  // Words that land in the file it made are what tie the two together.
  enterOn(title())
  await sleep(300)
  log.plusEnterGoesToBody = inBody()
  if (log.plusEnterGoesToBody) type('third words')
  await sleep(2600)
  const plus = await madeSince(third)
  log.plusPath = plus
  // Nothing collided: a third nameless note is a third file, and the second
  // still holds its words — and only its own.
  log.plusMadeItsOwn = Boolean(plus) && plus !== nameless
  log.plusOpenedWhatItMade = Boolean(plus) && ((await body(plus)) ?? '').includes('third words')
  const secondBody = (nameless && (await body(nameless))) ?? ''
  log.secondNoteUntouched = secondBody.includes('no title here') && !secondBody.includes('third words')

  // --- a note made and left empty goes when its tab closes; one with words stays ---
  const closeTab = (match) => {
    const tab = [...(pane(1)?.querySelectorAll('[data-tab]') ?? [])].find(match)
    click(tab?.querySelector('[data-x]'))
    return Boolean(tab)
  }
  const fourth = await untitledOnDisk()
  const four = await timed(() => key('n'))
  log.ms4 = four.ms
  const abandoned = await madeSince(fourth)
  log.abandonedPath = abandoned
  await sleep(300)
  log.closedTheEmptyOne = closeTab((t) => t.getAttribute('data-tab-on') === '1')
  let gone = false
  for (let i = 0; i < 15 && !gone; i++) {
    await sleep(200)
    gone = Boolean(abandoned) && (await body(abandoned)) === null
  }
  log.emptyNoteGoes = gone
  // By the name the tab carries, not the words drawn on it: a crowded strip
  // draws a tab as its initials.
  log.closedTheWrittenOne = closeTab((t) => /no title here/.test(t.getAttribute('title') ?? t.textContent ?? ''))
  await sleep(1500)
  log.writtenNoteStays = Boolean(nameless) && ((await body(nameless)) ?? '').includes('no title here')

  log.pass =
    log.noNamingPopover &&
    log.titleFocused &&
    log.titleEmpty &&
    log.saysUntitled &&
    log.editorPresent &&
    log.fastEnough &&
    log.madeUntitled &&
    log.titleTyped &&
    log.enterGoesToBody &&
    log.renamedToTitle &&
    log.untitledGone &&
    log.sameFolder &&
    log.bodyIsTitleAndThought &&
    log.tabSaysJotCheck &&
    log.headSaysJotCheck &&
    log.againNoPopover &&
    log.againTitleFocused &&
    log.againTitleEmpty &&
    log.againEnterGoesToBody &&
    log.namelessStaysNameless &&
    log.firstNoteUntouched &&
    log.tabIsItsFirstLine &&
    log.headOffersItsFirstLine &&
    log.listIsItsFirstLine &&
    log.aheadFromABody &&
    log.aheadNamedTheNewNote &&
    log.aheadRestInItsBody &&
    log.aheadInItsOwnFile &&
    log.aheadLeftTheLastNoteAlone &&
    log.blankTabOpen &&
    log.blankAheadRestInItsBody &&
    log.blankAheadInItsOwnFile &&
    log.leftByNumberNamed &&
    log.leftByNumberUntitledGone &&
    log.plusOffersNote &&
    log.plusNoNamingField &&
    log.plusMenuClosed &&
    log.plusTitleFocused &&
    log.plusTitleEmpty &&
    log.plusEnterGoesToBody &&
    log.plusMadeItsOwn &&
    log.plusOpenedWhatItMade &&
    log.secondNoteUntouched &&
    log.closedTheEmptyOne &&
    log.emptyNoteGoes &&
    log.closedTheWrittenOne &&
    log.writtenNoteStays
  return log
})()
