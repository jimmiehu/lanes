// A NOTE'S DETAILS NAME ITS FILE.
//
// The title is what a note is called; the file is what it IS, on disk, in a
// terminal, in a link Claude writes. The two usually match and often do not —
// a heading edited since, a note named before it had a title — and the details
// panel said Folder, Created, Edited and never the one name a script or a
// person at the shell would need (red: no File row at all).
//
// So: File, after Folder, the last segment of the path alone. In mono, since it
// is a name the machine knows it by. WHOLE — a long one wraps instead of being
// cut to an ellipsis, because the end of a filename is the part that tells it
// from its neighbours — and selectable, because it gets copied. And it follows a
// rename: ⌘N's `untitled.md`, once a title is committed, reads as the new name
// in the same row, without the panel being closed and opened again.
//
// Seeds its own notes through the app's IPC and makes one with ⌘N, so it wants
// a throwaway vault and a fresh LANES_STATE. See checks/README.md.
;(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
  const pane = () => document.querySelector('[data-pane="1"]')
  const click = (el) => el && el.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  const key = (k) =>
    window.dispatchEvent(new KeyboardEvent('keydown', { key: k, metaKey: true, bubbles: true }))
  const type = (text) => document.execCommand('insertText', false, text)
  const title = () => pane()?.querySelector('[data-note-title]')
  const content = () => pane()?.querySelector('.cm-content')
  const fileRow = () => pane()?.querySelector('[data-fact="File"]')
  const fileValue = () => fileRow()?.querySelector('[data-fact-value]')
  const factOrder = () => [...(pane()?.querySelectorAll('[data-fact]') ?? [])].map((f) => f.dataset.fact)
  const paths = async () => (await window.lanes.notesList()).map((n) => n.path)
  const open = async (q) => {
    key('k')
    await sleep(600)
    const box = document.querySelector('[data-palette-input]')
    if (!box) return false
    Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(box, q)
    box.dispatchEvent(new Event('input', { bubbles: true }))
    await sleep(1000)
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    await sleep(1500)
    return true
  }
  /** The panel, open — the meta line is its disclosure, and it stays open per pane. */
  const details = async () => {
    if (fileRow() || pane()?.querySelector('[data-fact]')) return
    click(pane()?.querySelector('[data-meta="1"]'))
    await sleep(500)
  }
  const log = {}
  await sleep(2500)

  // --- a note whose title is not its filename ---
  const short = await window.lanes.noteCreate('Water notes', 'reading')
  const SHORT = short.path
  await window.lanes.noteWrite(
    SHORT,
    '# Oslo water — historical facts and contexts for the river essay\n\nThe fjord, the rivers.\n'
  )
  // And one whose NAME is too long for the panel's width, so it has to wrap.
  const longName =
    'Minutes of the autumn allotment meeting with every plot holder and both treasurers present'
  const long = await window.lanes.noteCreate(longName, 'reading')
  const LONG = long.path
  await window.lanes.noteWrite(LONG, `# Association minutes\n\nWho said what.\n`)
  log.seeded = [SHORT, LONG]

  await open('Oslo water')
  await details()
  log.fileRow = Boolean(fileRow())
  log.fileReads = fileValue()?.textContent ?? null
  log.isTheFilename = log.fileReads === 'water-notes.md'
  log.notTheTitle = !/Oslo/.test(log.fileReads ?? '')
  // After Folder, which holds the rest of the path.
  const order = factOrder()
  log.order = order
  log.afterFolder = order.indexOf('File') === order.indexOf('Folder') + 1 && order.includes('File')
  const v = fileValue()
  if (v) {
    const cs = getComputedStyle(v)
    log.mono = /mono|Mono|Menlo|SF Mono|monospace/i.test(cs.fontFamily)
    log.selectable = cs.userSelect === 'text'
    // One line of it keeps the panel's rhythm: the same height as the row above.
    const folder = pane()?.querySelector('[data-fact="Folder"]')
    log.rowHeights = [folder, fileRow()].map((r) => Math.round(r?.getBoundingClientRect().height ?? 0))
    log.sameRhythm = log.rowHeights[0] > 0 && log.rowHeights[0] === log.rowHeights[1]
  }

  // --- a long one wraps, whole ---
  await open('Association minutes')
  await details()
  const lv = fileValue()
  const want = LONG.slice(LONG.lastIndexOf('/') + 1)
  log.longReads = lv?.textContent ?? null
  log.longWhole = log.longReads === want
  if (lv) {
    const cs = getComputedStyle(lv)
    const line = parseFloat(cs.lineHeight) || 16
    log.longWraps = lv.getBoundingClientRect().height > line * 1.5
    // Nothing hidden past the edge: what is there to read is all there is.
    log.nothingCut = lv.scrollWidth <= lv.clientWidth + 1 && cs.textOverflow !== 'ellipsis'
  }

  // --- it follows a rename ---
  const before = await paths()
  key('n')
  for (let i = 0; i < 30 && document.activeElement !== title(); i++) await sleep(100)
  await sleep(400)
  await details()
  log.untitledReads = fileValue()?.textContent ?? null
  log.startsUntitled = /^untitled(-\d+)?\.md$/.test(log.untitledReads ?? '')
  if (document.activeElement === title()) type('Kickoff check')
  await sleep(150)
  title()?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))
  await sleep(300)
  if (content() && document.activeElement === content()) type('first words')
  let renamed = null
  for (let i = 0; i < 30 && !renamed; i++) {
    await sleep(300)
    renamed = (await paths()).find((p) => /(^|\/)kickoff-check\.md$/.test(p) && !before.includes(p)) ?? null
  }
  log.renamedOnDisk = renamed
  for (let i = 0; i < 20 && fileValue()?.textContent !== 'kickoff-check.md'; i++) await sleep(200)
  log.afterRenameReads = fileValue()?.textContent ?? null
  log.followsRename = log.afterRenameReads === 'kickoff-check.md'
  log.panelStayedOpen = Boolean(fileRow())

  log.pass = Boolean(
    log.isTheFilename &&
      log.notTheTitle &&
      log.afterFolder &&
      log.mono &&
      log.selectable &&
      log.sameRhythm &&
      log.longWhole &&
      log.longWraps &&
      log.nothingCut &&
      log.startsUntitled &&
      log.followsRename
  )
  return JSON.stringify(log, null, 1)
})()
