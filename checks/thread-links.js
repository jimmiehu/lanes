// A LINK TO A NOTE OPENS THE NOTE — however it was written — and one that leads
// nowhere says so.
//
// Claude writes the notes it touched as markdown links as often as it writes
// `[[…]]`: `[garden-state.md](projects/Garden/garden-state.md)`, by the
// hundred across a working vault's threads. Those were drawn as web links, and
// a relative address resolves against the app's own page — so a click opened a
// file that is not there, and nothing happened. Neither did anything for a
// `[[link]]` to a note that has since gone: from a thread, an unresolved link
// was silent.
//
// So, in a thread:
//
// - A markdown link whose address is a note's file opens that note, beside the
//   thread in the note pane, in READ — and ⌘ gives it a tab of its own, as a
//   `[[wikilink]]`'s does. A `[[wikilink]]` still does what it did.
// - A link to a note that is not there — markdown or `[[…]]` — opens nothing,
//   makes nothing, and says `not in the vault` where it stands.
// - A markdown link to a file that is not a note is shown in the Finder (only
//   the missing one is clicked here, so no Finder window opens), and the web's
//   own addresses stay web links.
// - In a note it is the same: a markdown link to a note opens it, and one to a
//   note that is not there says so and makes no note — a `[[name]]` with no
//   note still makes one there, as it always has; an address is not a name.
//
// Wants the thread fixture: `node checks/thread-fixture.mjs /private/tmp/<vault>`
// and that vault as LANES_VAULT, with a fresh LANES_STATE. See checks/README.md.
(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
  const pane = (i) => document.querySelector(`[data-pane="${i}"]`)
  const key = (k, extra = {}) =>
    window.dispatchEvent(new KeyboardEvent('keydown', { key: k, metaKey: true, bubbles: true, ...extra }))
  const link = (i, target) => pane(i)?.querySelector(`[data-wiki="${target}"]`)
  const fileLink = (i, path) => pane(i)?.querySelector(`[data-file-link="${path}"]`)
  const noteTabs = () => [...(pane(1)?.querySelectorAll('[data-tab]') ?? [])]
  const headSays = (s) => (pane(1)?.querySelector('[data-head="1"]')?.textContent ?? '').includes(s)
  const click = (el, mods = {}) => el?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, ...mods }))
  const nowhere = (el) => Boolean(el?.querySelector('[data-link-nowhere]'))
  const log = {}
  await sleep(2000)

  /* ---------- the thread ---------- */

  log.threadUp = Boolean(link(0, 'beta-note'))
  if (!log.threadUp) return { ...log, pass: false }

  // A markdown link to a note: drawn as a link to a note, and it opens it.
  const md = link(0, 'notes/alpha-note.md')
  log.markdownLinkIsANoteLink = Boolean(md) && md.dataset.address === '1' && md.tagName !== 'A'
  click(md)
  for (let i = 0; i < 30 && !headSays('Alpha note'); i++) await sleep(100)
  log.markdownLinkOpensTheNote = headSays('Alpha note')
  log.opensInRead = Boolean(pane(1)) && !pane(1).querySelector('.cm-content')

  // A `[[wikilink]]` still does: a plain click replaces the note beside it…
  click(link(0, 'beta-note'))
  for (let i = 0; i < 30 && !headSays('Beta note'); i++) await sleep(100)
  log.wikilinkStillOpens = headSays('Beta note')
  // …and ⌘ gives the markdown link's note a tab of its own.
  const tabsBefore = noteTabs().length
  click(link(0, 'notes/alpha-note.md'), { metaKey: true })
  for (let i = 0; i < 30 && noteTabs().length === tabsBefore; i++) await sleep(100)
  await sleep(300)
  log.cmdClickIsATabOfItsOwn = noteTabs().length === tabsBefore + 1 && headSays('Alpha note')

  // Nowhere: nothing opens, nothing is made, and the link says so.
  const tabsNow = noteTabs().length
  for (const [target, made] of [
    ['notes/gone.md', 'notes/gone.md'],
    ['notes/never-was', 'notes/never-was.md']
  ]) {
    const el = link(0, target)
    click(el)
    for (let i = 0; i < 20 && !nowhere(el); i++) await sleep(100)
    log[`saysNowhere ${target}`] = nowhere(el)
    log[`madeNothing ${target}`] = (await window.lanes.note(made)) === null
  }
  const missingFile = fileLink(0, 'files/missing.txt')
  click(missingFile)
  for (let i = 0; i < 20 && !nowhere(missingFile); i++) await sleep(100)
  log.missingFileSaysNowhere = nowhere(missingFile)
  log.nowhereOpensNothing = noteTabs().length === tabsNow && headSays('Alpha note')
  // And says it for a moment, not for good.
  await sleep(2800)
  log.nowhereGoesAgain = !pane(0)?.querySelector('[data-link-nowhere]')

  // A file that is there and is not a note is the Finder's; the web is the web's.
  log.fileIsTheFinders = Boolean(fileLink(0, 'files/brief.txt'))
  const web = [...(pane(0)?.querySelectorAll('a') ?? [])].find((a) => a.textContent === 'example')
  log.webStaysAWebLink = web?.getAttribute('href') === 'https://example.com' && web.target === '_blank'

  // A bare file name — how Claude lists the files it wrote under a folder it
  // has already named — is a link when exactly one note has that name; two
  // notes of that name are not guessed between, and a name no note has is text.
  const prose = pane(0)?.textContent ?? ''
  const bare = [...(pane(0)?.querySelectorAll('[data-wiki="notes/gamma-note.md"]') ?? [])].find(
    (e) => e.textContent === 'gamma-note.md'
  )
  log.bareNameIsALink = Boolean(bare)
  click(bare)
  for (let i = 0; i < 30 && !headSays('Gamma note'); i++) await sleep(100)
  log.bareNameOpensTheNote = headSays('Gamma note')
  log.twiceNamedStaysText = prose.includes('twice-named.md') && !pane(0)?.querySelector('[data-wiki$="twice-named.md"]')
  log.unknownNameStaysText =
    prose.includes('nowhere-at-all.md') && !pane(0)?.querySelector('[data-wiki$="nowhere-at-all.md"]')

  // A path to a file in the vault that is not a note — `File: notes/sheet.xlsx`,
  // on the reply's last line — is a link that shows the file where it is, in
  // its folder in the Finder (not clicked here: that is a Finder window, and
  // `reveal-and-select.js` holds what the call does). One that is not there
  // says so; an address with no scheme whose first folder is not the vault's is
  // left as words.
  const fileLinks = (path) => [...(pane(0)?.querySelectorAll(`[data-file-link="${path}"]`) ?? [])]
  log.barePathIsAFileLink = fileLinks('notes/sheet.xlsx').some((e) => e.textContent === 'notes/sheet.xlsx')
  const gone = fileLinks('notes/gone-away.pdf').find((e) => e.textContent === 'notes/gone-away.pdf')
  log.missingPathIsALink = Boolean(gone)
  click(gone)
  for (let i = 0; i < 20 && !nowhere(gone); i++) await sleep(100)
  log.missingPathSaysNowhere = nowhere(gone)
  log.notTheVaultsStaysText =
    prose.includes('example.com/page.html') && !pane(0)?.querySelector('[data-file-link*="example.com"]')

  /* ---------- a note ---------- */

  const stamp = Date.now().toString(36)
  const TITLE = `Links in a note ${stamp}`
  const NOTE = await window.lanes.noteCreate(TITLE, 'notes')
  await window.lanes.noteWrite(
    NOTE.path,
    `# ${TITLE}\n\nTo [the alpha note](notes/alpha-note.md), and to [one that is not there](notes/nope-${stamp}.md).\n`
  )
  key('k')
  await sleep(600)
  const box = document.querySelector('[data-palette-input]')
  Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(box, TITLE)
  box.dispatchEvent(new Event('input', { bubbles: true }))
  for (let i = 0; i < 60; i++) {
    const t = (document.querySelector('.pal-row[data-pal-on="1"]')?.textContent ?? '').trim()
    if (t.includes(TITLE) && !t.startsWith('+')) break
    await sleep(100)
  }
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
  for (let i = 0; i < 30 && !headSays(TITLE); i++) await sleep(100)
  await sleep(400)
  const nope = link(1, `notes/nope-${stamp}.md`)
  click(nope)
  for (let i = 0; i < 20 && !nowhere(nope); i++) await sleep(100)
  log.inANoteNowhereSaysSo = nowhere(nope)
  await sleep(1200)
  log.inANoteAnAddressMakesNoNote = (await window.lanes.note(`notes/nope-${stamp}.md`)) === null
  click(link(1, 'notes/alpha-note.md'))
  for (let i = 0; i < 30 && !headSays('Alpha note'); i++) await sleep(100)
  log.inANoteTheLinkOpens = headSays('Alpha note')

  log.pass = Boolean(
    log.threadUp &&
      log.markdownLinkIsANoteLink &&
      log.markdownLinkOpensTheNote &&
      log.opensInRead &&
      log.wikilinkStillOpens &&
      log.cmdClickIsATabOfItsOwn &&
      log['saysNowhere notes/gone.md'] &&
      log['madeNothing notes/gone.md'] &&
      log['saysNowhere notes/never-was'] &&
      log['madeNothing notes/never-was'] &&
      log.missingFileSaysNowhere &&
      log.nowhereOpensNothing &&
      log.nowhereGoesAgain &&
      log.fileIsTheFinders &&
      log.webStaysAWebLink &&
      log.bareNameIsALink &&
      log.bareNameOpensTheNote &&
      log.twiceNamedStaysText &&
      log.unknownNameStaysText &&
      log.barePathIsAFileLink &&
      log.missingPathIsALink &&
      log.missingPathSaysNowhere &&
      log.notTheVaultsStaysText &&
      log.inANoteNowhereSaysSo &&
      log.inANoteAnAddressMakesNoNote &&
      log.inANoteTheLinkOpens
  )
  return log
})()
