// The one rail: its two cards, its three modes, the filter, and starring.
// See checks/README.md for how to run it.
(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
  const click = (el) => el && el.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  const rail = () => document.querySelector('[data-rail="1"]')
  const rows = (kind) => [...document.querySelectorAll(`[data-rail-row="${kind}"]`)]
  const groups = () => [...document.querySelectorAll('[data-rail-row="group"]')]
  const chip = (label) =>
    [...rail().querySelectorAll('div')].find(
      (d) => d.textContent.trim() === label && d.children.length === 0
    )
  const log = {}
  await sleep(2600)

  // --- Recent: two sections, threads and notes, never interleaved ---
  log.recentThreads = rows('chat').length
  log.recentNotes = rows('note').length
  const labels = [...rail().querySelectorAll('div')]
    .filter((d) => /^(THREADS|NOTES)$/.test(d.textContent.trim()) && d.children.length === 0)
    .map((d) => d.textContent.trim())
  log.recentSections = labels
  // Not interleaved: every thread row precedes every note row in the DOM.
  const all = [...document.querySelectorAll('[data-rail-row]')]
    .map((d) => d.getAttribute('data-rail-row'))
    .filter((k) => k !== 'group')
  log.notInterleaved = all.join(',').indexOf('note,chat') === -1

  // --- Lanes: threads only, grouped, collapsible ---
  click(chip('Lanes'))
  await sleep(700)
  log.lanesGroups = groups().length
  log.lanesHasNoNotes = rows('note').length === 0
  // Fold a band that holds threads: the first lane may be empty, and an empty
  // band folds with nothing to show for it. A band's last child is its count.
  const band = groups().find((g) => Number(g.lastElementChild?.textContent) > 0) || groups()[0]
  const beforeCollapse = rows('chat').length
  click(band)
  await sleep(500)
  log.laneCollapses = rows('chat').length !== beforeCollapse

  // --- Folders: a real tree to depth ---
  click(chip('Folders'))
  await sleep(900)
  log.folderGroups = groups().length
  log.foldersClosedByDefault = new Set(
    groups().map((g) => parseInt(g.style.paddingLeft, 10) || 0)
  ).size === 1
  // Open the first folder that has children, and confirm the tree goes deeper
  // than one level — the whole point of Folders over the old flat browser.
  // Which folder that is is asked of the vault; a folder row's title is its path.
  const nesting = new Set(
    (await window.lanes.notesList())
      .map((n) => n.path.split('/'))
      .filter((segs) => segs.length > 2)
      .map((segs) => segs[0])
  )
  const openable = groups().find((g) => nesting.has(g.title)) || groups()[0]
  click(openable)
  await sleep(900)
  const pads = groups().map((g) => parseInt(g.style.paddingLeft, 10) || 0)
  log.folderDepths = [...new Set(pads)].sort((a, b) => a - b).slice(0, 5)
  log.folderNests = new Set(pads).size > 1
  log.folderShowsNotes = rows('note').length > 0

  // --- the filter narrows in place ---
  // On a word the rail is already showing, a note's file name, so it holds on
  // any vault: something matches, and less than the whole vault does.
  log.notesInVault = (await window.lanes.notesList()).length
  const shown = rows('note')[0]
  log.filterQuery = shown
    ? shown.getAttribute('data-rail-id').split('/').pop().replace(/\.md$/i, '')
    : ''
  const box = rail().querySelector('input')
  const set = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
  set.call(box, log.filterQuery)
  box.dispatchEvent(new Event('input', { bubbles: true }))
  await sleep(700)
  const narrowed = rows('note').length
  log.filterNarrows =
    Boolean(log.filterQuery) && narrowed > 0 && narrowed < 200 && narrowed < log.notesInVault
  set.call(box, '')
  box.dispatchEvent(new Event('input', { bubbles: true }))
  await sleep(500)

  // --- starring a row puts it in the Starred card ---
  click(chip('Recent'))
  await sleep(700)
  const starredNow = () => (rail().innerText.match(/STARRED\s*\n?\s*(\d+)/) || [])[1] || '0'
  log.starredBefore = starredNow()
  // A thread's star; a note's on a vault that has no threads yet.
  const star =
    document.querySelector('[data-rail-row="chat"] [data-pin="1"]') ??
    document.querySelector('[data-rail-row="note"] [data-pin="1"]')
  click(star)
  await sleep(700)
  log.starredCount = starredNow()

  // Threads are the vault's to have or not: a vault with none has no THREADS
  // section and no band whose folding shows, and the verdict says only what
  // this run could see. Everything else holds on any vault with nested notes.
  log.pass = Boolean(
    log.recentNotes > 0 &&
      log.recentSections.join() === (log.recentThreads > 0 ? 'THREADS,NOTES' : 'NOTES') &&
      log.notInterleaved &&
      log.lanesGroups > 0 &&
      log.lanesHasNoNotes &&
      (log.laneCollapses || log.recentThreads === 0) &&
      log.folderGroups > 0 &&
      log.foldersClosedByDefault &&
      log.folderNests &&
      log.folderShowsNotes &&
      log.filterNarrows &&
      Number(log.starredCount) > Number(log.starredBefore)
  )
  return JSON.stringify(log, null, 1)
})()
