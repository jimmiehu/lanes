// A note is a file, and these are the three things you do to files. Rename it
// from its tab (the field opens in the head, the heading follows, and every
// wikilink aimed at it is rewritten), move it by clicking the place the head
// states, and put it in the Trash from the rail's own menu — straight after
// typing in it, and it stays there: the save of those last words was still on
// its timer, and it used to fire after the trash, find no file and make the
// note again (red).
//
// The notes editor rebuild changed what the head's title IS, so this holds
// that too. In WRITE — where a note opens now — the title is a field onto the
// note's `# ` line, not the double-click label that used to rename the file:
// typing there rewrites the heading, the tab follows it, and the file keeps its
// name (only an `untitled.md` takes its name from its title, which jot.js
// holds). Renaming the FILE is the tab's Rename…, which still opens its field in
// the head, over the title, in either mode. In READ the title is still the
// label, and a double-click on it still opens that same field. And a rename or
// a move is the same note to the editor — the same editor, not one rebuilt
// under the caret with its undo history thrown away.
//
// It seeds its own three notes through the app's IPC, and then waits for the
// index to know that one of them links to another. That wait is the fixture,
// not the claim: a file written behind the app's back is read by the vault
// sweep, every thirty seconds, and a rename only rewrites the links the index
// knows point at it. Wants a throwaway vault and a fresh LANES_STATE — it
// renames, moves and trashes the notes it made.
// See checks/README.md for how to run it.
(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
  const click = (el) => el && el.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  const pane = () => document.querySelector('[data-pane="1"]')
  const tabs = () => [...(pane()?.querySelectorAll('[data-tab]') ?? [])]
  const labels = () => tabs().map((t) => t.textContent.replace(/×$/, '').trim())
  const onTab = () => pane()?.querySelector('[data-tab-on="1"]') ?? tabs()[tabs().length - 1]
  const field = () => document.querySelector('[data-rename="1"]')
  const title = () => pane()?.querySelector('[data-note-title]')
  const editor = () => pane()?.querySelector('.cm-editor')
  const content = () => pane()?.querySelector('.cm-content')
  const type = (text) => document.execCommand('insertText', false, text)
  const cmd = (k) =>
    window.dispatchEvent(new KeyboardEvent('keydown', { key: k, metaKey: true, bubbles: true }))
  const rightClick = (el) => {
    const b = el.getBoundingClientRect()
    el.dispatchEvent(
      new MouseEvent('contextmenu', { bubbles: true, clientX: b.left + 8, clientY: b.bottom + 2 })
    )
  }
  const press = (el) => el && el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
  const item = (text) =>
    [...document.querySelectorAll('div')].find((d) => d.innerText.trim() === text)
  const railRow = (re) =>
    [...document.querySelectorAll('[data-rail-row="note"]')].find((r) => re.test(r.innerText))
  const paths = async () => (await window.lanes.notesList()).map((n) => n.path).sort()
  const bodyOf = async (p) => (await window.lanes.note(p))?.body ?? ''
  const settled = async (want) => {
    for (let i = 0; i < 30; i += 1) {
      const all = await paths()
      if (all.some((p) => p.includes(want))) return all
      await sleep(250)
    }
    return paths()
  }
  const seed = async (name, into, body) => {
    const made = await window.lanes.noteCreate(name, into)
    const at = made.path || `${into}/${name.toLowerCase().replace(/\s+/g, '-')}.md`
    await window.lanes.noteWrite(at, body)
    return at
  }
  const log = {}
  await sleep(3000)

  // --- the vault it works on ---
  const TRIP = await seed('Oslo trip', 'projects', '# Oslo trip\n\nThree days by the fjord, and the ferries.\n')
  const POINTING = await seed(
    'Pointing here',
    'archive',
    [
      '# Pointing here',
      '',
      // One link in each shape a person writes: the bare name, the path, and an
      // alias — plus one aimed at nothing, which must be left exactly as it is.
      'The plan is in [[oslo-trip]], filed at [[projects/oslo-trip]].',
      'The short version is [[oslo-trip|the trip]]; [[nothing-there]] goes nowhere.',
      ''
    ].join('\n')
  )
  const SPARE = await seed('Spare', 'archive', '# Spare\n\nLeft where it is.\n')
  log.seeded = [TRIP, POINTING, SPARE]
  const t0 = performance.now()
  for (let i = 0; i < 90 && !((await window.lanes.note(TRIP))?.backlinks > 0); i++) await sleep(500)
  log.indexKnowsTheLinks = ((await window.lanes.note(TRIP))?.backlinks ?? 0) > 0
  log.waitedForTheSweepMs = Math.round(performance.now() - t0)

  // --- opened, it is the editor, and its head's title is a field ---
  cmd('k')
  await sleep(600)
  const box = document.querySelector('[data-palette-input]')
  if (box) {
    Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(box, 'Oslo trip')
    box.dispatchEvent(new Event('input', { bubbles: true }))
    await sleep(1000)
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
  }
  await sleep(1800)
  // A note opens in READ; writing is asked for, with ⌘E.
  if (!content()) {
    cmd('e')
    await sleep(800)
  }
  log.opened = labels().includes('Oslo trip')
  log.opensInTheEditor = Boolean(content())
  const theEditor = editor()
  log.headTitleIsTheField =
    title()?.textContent.trim() === 'Oslo trip' && title()?.isContentEditable === true
  // A double-click there is a double-click in a text field — it selects a
  // word; it does not turn the title into a rename of the file.
  title()?.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))
  await sleep(400)
  log.fieldIsNotTheRenameLabel = !field()

  // --- typing in the title renames nothing but the heading ---
  const t = title()
  if (t) {
    t.focus()
    const r = document.createRange()
    r.selectNodeContents(t)
    r.collapse(false)
    window.getSelection()?.removeAllRanges()
    window.getSelection()?.addRange(r)
    type(' notes')
    await sleep(150)
    t.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))
  }
  // The save pipeline is ~1.8s; the tab follows the heading on the way.
  await sleep(2400)
  const afterTitle = await paths()
  log.titleRewroteTheHeading = /^# Oslo trip notes$/m.test(await bodyOf(TRIP))
  log.titleKeptTheFile = afterTitle.includes(TRIP) && !afterTitle.some((p) => p.includes('oslo-trip-notes'))
  log.tabFollowedTheTitle = labels().includes('Oslo trip notes')

  // --- rename, from the tab ---
  rightClick(onTab())
  await sleep(400)
  log.tabOffersRename = Boolean(item('Rename…'))
  press(item('Rename…'))
  await sleep(700)
  log.fieldOpened = Boolean(field())
  field()?.focus()
  field()?.select()
  type('Oslo in autumn')
  await sleep(300)
  field()?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
  await sleep(1600)
  const afterRename = await settled('oslo-in-autumn')
  log.fileRenamed = afterRename.includes('projects/oslo-in-autumn.md')
  log.oldPathGone = !afterRename.includes(TRIP)
  log.tabFollowed = labels().includes('Oslo in autumn')
  log.headingFollowed = /^# Oslo in autumn$/m.test(await bodyOf('projects/oslo-in-autumn.md'))
  // The head's field says it too, and it is the same editor it was.
  log.headTitleFollowed = title()?.textContent.trim() === 'Oslo in autumn'
  log.sameEditorAfterRename = Boolean(theEditor) && editor() === theEditor
  // Every wikilink that pointed at it was rewritten, in the shape it was written.
  const links = await bodyOf(POINTING)
  log.links = links
  log.bareLinkFollowed = /\[\[oslo-in-autumn\]\]/.test(links)
  log.pathLinkFollowed = /\[\[projects\/oslo-in-autumn\]\]/.test(links)
  log.aliasKept = /\[\[oslo-in-autumn\|the trip\]\]/.test(links)
  log.otherLinksLeftAlone = /\[\[nothing-there\]\]/.test(links)

  // --- move, by clicking the place in the head ---
  const place = pane().querySelector('[data-place="move"]')
  log.placeIsAControl = Boolean(place)
  log.placeSays = place?.innerText
  click(place)
  await sleep(600)
  log.moverOpened = Boolean(document.querySelector('[data-move-note="1"]'))
  // The mover shows eight folders, A to Z, before anything is typed — so the
  // one this clicks is a name near the top of the alphabet.
  const row = document.querySelector('[data-move-row="archive"]')
  log.offersTheFolders = Boolean(row)
  click(row)
  await sleep(1600)
  const afterMove = await settled('archive/oslo-in-autumn')
  log.fileMoved = afterMove.includes('archive/oslo-in-autumn.md')
  log.tabStillOpen = labels().includes('Oslo in autumn')
  log.placeFollowed = pane().querySelector('[data-place="move"]')?.innerText === 'archive'
  log.sameEditorAfterMove = Boolean(theEditor) && editor() === theEditor
  // Nothing the editor was holding went back over the heading the rename wrote.
  log.headingStillFollowed = /^# Oslo in autumn$/m.test(await bodyOf('archive/oslo-in-autumn.md'))
  // The link that named the old folder followed it there.
  log.pathLinkMoved = /\[\[archive\/oslo-in-autumn\]\]/.test(await bodyOf(POINTING))

  // --- in READ the title is the label, and a double-click opens the field ---
  document.activeElement?.blur?.()
  cmd('e')
  await sleep(800)
  const label = pane()?.querySelector('[title="Double-click to rename"]')
  log.readTitleIsTheLabel = !title() && label?.textContent.trim() === 'Oslo in autumn'
  label?.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))
  await sleep(500)
  log.readDoubleClickOpensTheField = Boolean(field())
  // Esc puts it away and renames nothing.
  field()?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
  await sleep(600)
  log.escClosesIt = !field() && (await paths()).includes('archive/oslo-in-autumn.md')
  cmd('e')
  await sleep(800)
  log.backInTheEditor = Boolean(content())

  // --- trash, from the rail's menu ---
  let target = null
  for (let i = 0; i < 20 && !target; i++) {
    target = railRow(/Oslo in autumn/i)
    if (!target) await sleep(250)
  }
  log.rowFound = Boolean(target)
  // A last thought typed into the note, its save still on the way when the
  // note goes.
  content()?.focus()
  type(' A last thought.')
  await sleep(100)
  if (target) {
    rightClick(target)
    await sleep(300)
  }
  log.rowOffersTrash = Boolean(item('Move to Trash'))
  click(item('Move to Trash'))
  await sleep(1800)
  const afterTrash = await paths()
  log.fileGone = !afterTrash.some((p) => p.includes('oslo-in-autumn'))
  // Past every save timer there is, and asked of the file rather than the
  // list: a note made again behind the index's back is still a file.
  await sleep(3500)
  log.staysTrashed = (await window.lanes.note('archive/oslo-in-autumn.md')) === null
  log.tabClosed = !labels().includes('Oslo in autumn')
  log.spareUntouched = afterTrash.includes(SPARE)

  log.pass = Boolean(
    log.indexKnowsTheLinks &&
    log.opened &&
    log.opensInTheEditor &&
    log.headTitleIsTheField &&
    log.fieldIsNotTheRenameLabel &&
    log.titleRewroteTheHeading &&
    log.titleKeptTheFile &&
    log.tabFollowedTheTitle &&
    log.tabOffersRename &&
    log.fieldOpened &&
    log.fileRenamed &&
    log.oldPathGone &&
    log.tabFollowed &&
    log.headingFollowed &&
    log.headTitleFollowed &&
    log.sameEditorAfterRename &&
    log.bareLinkFollowed &&
    log.pathLinkFollowed &&
    log.aliasKept &&
    log.otherLinksLeftAlone &&
    log.placeIsAControl &&
    log.moverOpened &&
    log.offersTheFolders &&
    log.fileMoved &&
    log.tabStillOpen &&
    log.placeFollowed &&
    log.sameEditorAfterMove &&
    log.headingStillFollowed &&
    log.pathLinkMoved &&
    log.readTitleIsTheLabel &&
    log.readDoubleClickOpensTheField &&
    log.escClosesIt &&
    log.backInTheEditor &&
    log.rowFound &&
    log.rowOffersTrash &&
    log.fileGone &&
    log.staysTrashed &&
    log.tabClosed &&
    log.spareUntouched
  )
  return JSON.stringify(log, null, 1)
})()
