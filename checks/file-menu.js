// A PATH TO A FILE TAKES A RIGHT-CLICK: OPEN, OR SHOW IN FINDER.
//
// Claude writes the files it touched in backticks — `projects/garden/`,
// `sow_check.py` — and only a path to a NOTE was ever a link, so the rest
// were words to go and find. A right-click on one now finds it and offers
// both. So does a link to a file that is not a note, which a click only ever
// showed. And the details panel's rows — NOTES IN CONTEXT under a thread,
// LINKED FROM under a note — take the right-click a rail row takes, Show in
// Finder among it.
//
// Held in a note's READ: a vault file in backticks is a FILE menu that says
// where it is, with Open and Show in Finder; a folder is a FOLDER; a path that
// is nowhere says so; a word and a setting take no menu; a markdown link to the
// file takes the same menu. In the thread: its link to a file does too. The
// details rows of both panes open the note or thread menu. And main opens or
// shows only what it found — a path it never handed out is refused — and opens
// only a document: `/etc/hosts`, found, is still not opened.
//
// Nothing is opened or shown: a run would put Finder windows over the app.
//
// Wants the thread fixture: `node checks/thread-fixture.mjs /private/tmp/<vault>`
// and that vault as LANES_VAULT, with a fresh LANES_STATE. See checks/README.md.
;(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
  const pane = (i) => document.querySelector(`[data-pane="${i}"]`)
  const key = (k, extra = {}) =>
    window.dispatchEvent(new KeyboardEvent('keydown', { key: k, metaKey: true, bubbles: true, ...extra }))
  const click = (el) => el && el.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  const rightClick = (el) => {
    if (!el) return false
    const r = el.getBoundingClientRect()
    el.dispatchEvent(
      new MouseEvent('contextmenu', {
        bubbles: true,
        cancelable: true,
        button: 2,
        clientX: r.left + r.width / 2,
        clientY: r.top + r.height / 2
      })
    )
    return true
  }
  const fileMenu = () => document.querySelector('[data-file-menu]')
  /** What the open file menu says, then closes it. */
  const readMenu = async () => {
    for (let i = 0; i < 30 && !fileMenu(); i++) await sleep(100)
    const m = fileMenu()
    if (!m) return null
    const out = {
      kind: m.firstElementChild?.firstElementChild?.textContent?.trim(),
      places: [...m.querySelectorAll('[data-file-place]')].map((p) => ({
        where: p.children[1]?.textContent?.trim(),
        items: [...p.querySelectorAll('[data-file-item]')].map((x) => x.textContent.trim())
      })),
      none: Boolean(m.querySelector('[data-file-none]'))
    }
    click(m.parentElement)
    await sleep(200)
    return out
  }
  const bothItems = (p) => Boolean(p) && p.items.includes('Open') && p.items.includes('Show in Finder')
  /** The note or thread menu a rail row opens: its items' words, then closed. */
  const readCtx = async () => {
    await sleep(500)
    const items = [...document.querySelectorAll('.ctx-item')]
    const words = items.map((x) => x.textContent.trim())
    if (items[0]) click(items[0].parentElement.parentElement)
    await sleep(200)
    return words
  }
  const log = {}
  await sleep(2000)

  /* ---------- a note, in READ ---------- */

  const stamp = Date.now().toString(36)
  const TITLE = `File menu ${stamp}`
  const made = await window.lanes.noteCreate(TITLE, 'notes')
  await window.lanes.noteWrite(
    made.path,
    `# ${TITLE}\n\nThe brief is \`files/brief.txt\`, the notes are in \`notes/\`, and \`nowhere-${stamp}/at-all.pdf\` is nowhere. \`beanpole\` is a word and \`TZ=Europe/Vienna\` a setting.\n\nA link to it: [the brief](files/brief.txt). And [[beta-note]].\n`
  )
  key('k')
  await sleep(600)
  const box = document.querySelector('[data-palette-input]')
  Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(box, TITLE)
  box.dispatchEvent(new Event('input', { bubbles: true }))
  for (let i = 0; i < 60; i++) {
    const row = (document.querySelector('.pal-row[data-pal-on="1"]')?.textContent ?? '').trim()
    if (row.includes(TITLE) && !row.startsWith('+')) break
    await sleep(100)
  }
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
  const code = (t) => pane(1)?.querySelector(`[data-path-code="${t}"]`)
  for (let i = 0; i < 40 && !code('files/brief.txt'); i++) await sleep(150)
  await sleep(300)

  rightClick(code('files/brief.txt'))
  log.file = await readMenu()
  log.fileOffersBoth =
    log.file?.kind === 'FILE' && log.file.places.length === 1 && bothItems(log.file.places[0])
  log.fileSaysWhere = log.file?.places[0]?.where === 'files'

  rightClick(code('notes/'))
  log.folder = await readMenu()
  log.folderOffersBoth = log.folder?.kind === 'FOLDER' && bothItems(log.folder.places[0])

  rightClick(code(`nowhere-${stamp}/at-all.pdf`))
  log.nowhere = await readMenu()
  log.nowhereSaysSo = Boolean(log.nowhere?.none) && log.nowhere.kind === 'PATH' && !log.nowhere.places.length

  // Words and settings are code, not paths: no menu on them.
  const span = (t) =>
    [...(pane(1)?.querySelectorAll('span') ?? [])].find((s) => s.textContent === t && !s.children.length)
  log.wordIsNoPath = Boolean(span('beanpole')) && !code('beanpole') && !code('TZ=Europe/Vienna')

  const link = pane(1)?.querySelector('[data-file-link="files/brief.txt"]')
  rightClick(link)
  log.noteLink = await readMenu()
  log.noteLinkOffersBoth = log.noteLink?.kind === 'FILE' && bothItems(log.noteLink.places[0])

  /* ---------- the thread: its link to a file ---------- */

  const tlink = pane(0)?.querySelector('[data-file-link="files/brief.txt"]')
  tlink?.scrollIntoView({ block: 'center' })
  await sleep(300)
  rightClick(tlink)
  log.threadLink = await readMenu()
  log.threadLinkOffersBoth = log.threadLink?.kind === 'FILE' && bothItems(log.threadLink.places[0])

  /* ---------- the details panel's rows ---------- */

  click(pane(0)?.querySelector('[data-meta="1"]'))
  await sleep(900)
  const threadRow = pane(0)?.querySelector('[data-link-row]')
  log.threadRow = threadRow?.textContent
  rightClick(threadRow)
  log.threadRowMenu = await readCtx()
  log.threadRowShows =
    log.threadRowMenu.includes('Show in Finder') && log.threadRowMenu.some((w) => w.startsWith('Open'))

  // beta-note is linked from the note above: its LINKED FROM row is that note.
  key('k')
  await sleep(600)
  const box2 = document.querySelector('[data-palette-input]')
  Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(box2, 'Beta note')
  box2.dispatchEvent(new Event('input', { bubbles: true }))
  await sleep(900)
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
  await sleep(1500)
  click(pane(1)?.querySelector('[data-meta="1"]'))
  await sleep(900)
  const noteRow = [...(pane(1)?.querySelectorAll('[data-link-row]') ?? [])].find((r) =>
    r.textContent.includes(TITLE)
  )
  log.noteRow = noteRow?.textContent
  rightClick(noteRow)
  log.noteRowMenu = await readCtx()
  log.noteRowShows = log.noteRowMenu.includes('Show in Finder')

  /* ---------- main takes back only what it found ---------- */

  log.refusesTheUnfound =
    typeof window.lanes.openFound === 'function' &&
    (await window.lanes.openFound('/etc/hosts')) === false &&
    (await window.lanes.revealFound('/etc/hosts')) === false &&
    (await window.lanes.openFound('/private/tmp')) === false

  // Found is not opened: Open is for documents. `/etc/hosts`, written whole
  // from the root, is a place main hands out — Show in Finder would take it —
  // but no document, so Open is refused. Main is asked only once the menu has
  // said so, so that a rule gone wrong fails here rather than opening the file.
  const hosts = await window.lanes.locate('/etc/hosts', made.path)
  log.hostsFound = hosts.found.map((f) => ({ path: f.path, open: f.open }))
  const hostsOffered = hosts.found.find((f) => f.path === '/etc/hosts')
  log.hostsIsNoDocument =
    hostsOffered?.open === 'none' && (await window.lanes.openFound('/etc/hosts')) === false

  log.pass = Boolean(
    log.fileOffersBoth &&
      log.fileSaysWhere &&
      log.folderOffersBoth &&
      log.nowhereSaysSo &&
      log.wordIsNoPath &&
      log.noteLinkOffersBoth &&
      log.threadLinkOffersBoth &&
      log.threadRowShows &&
      log.noteRowShows &&
      log.refusesTheUnfound &&
      log.hostsIsNoDocument
  )
  return log
})()
