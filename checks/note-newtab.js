// ⌘-CLICK A LINK IN A NOTE AND THE NOTE STAYS.
//
// ⌘ means one thing across this app: a tab of its own. A wikilink followed from
// a CHAT has always honoured it, and a note's links now honour it in both of
// the note's modes — which is where it matters most, since following a link
// out of a note is how you leave something you were in the middle of.
//
// The two modes differ in one way only, and on purpose. In READ a plain click
// follows the link (replacing the note in its tab) and ⌘-click opens it beside.
// In WRITE a plain click is where the caret goes — you are writing, and a click
// on a linked word is a click to edit it — so ⌘-click is the only way to follow,
// and it opens beside too: following out of a note you are writing must never
// take it off the screen.
//
// The note head's LINKED rows — the notes that point here — take ⌘ as well.
//
// Seeds its own hub, spoke and rim through the app's IPC. Run against a
// throwaway LANES_VAULT and LANES_STATE. See checks/README.md.
;(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
  const click = (el, mods = {}) =>
    el && el.dispatchEvent(new MouseEvent('click', { bubbles: true, ...mods }))
  const key = (k) => window.dispatchEvent(new KeyboardEvent('keydown', { key: k, metaKey: true, bubbles: true }))
  const notePane = () => document.querySelector('[data-pane="1"]')
  const content = () => notePane()?.querySelector('.cm-content')
  const tabs = () => (notePane() ? [...notePane().querySelectorAll('[data-tab]')] : [])
  // The tab's own title attribute: a crowded strip sheds a tab's words, not its name.
  const label = (t) => t.getAttribute('title') || t.innerText.replace(/×$/, '').trim()
  const titles = () => tabs().map(label)
  const activeTitle = () => titles()[tabs().findIndex((t) => t.getAttribute('data-tab-on') === '1')]
  // Stamped, so no note an earlier run left — and no note in a copy of a real
  // vault — answers to the same names.
  const stamp = Date.now().toString(36)
  const HUB = `Newtab hub ${stamp}`
  const SPOKE = `Newtab spoke ${stamp}`
  const RIM = `Newtab rim ${stamp}`
  const spokeSlug = `newtab-spoke-${stamp}`
  const wiki = () => notePane()?.querySelector(`[data-wiki="${spokeSlug}"]`)
  const is = (name) => (t) => (t ?? '').includes(name)
  const log = { stamp }
  await sleep(2400)

  // --- seed: hub links to spoke; rim links to spoke too, so spoke's head lists both ---
  for (const [name, body] of [
    [HUB, `# ${HUB}\n\nThe hub points at [[${spokeSlug}]] and nothing else.\n`],
    [SPOKE, `# ${SPOKE}\n\nThe spoke.\n`],
    [RIM, `# ${RIM}\n\nThe rim also points at [[${spokeSlug}]].\n`]
  ]) {
    const m = await window.lanes.noteCreate(name, '_unfiled')
    if (m.path) await window.lanes.noteWrite(m.path, body)
  }
  const open = async (q) => {
    key('k')
    await sleep(600)
    const box = document.querySelector('[data-palette-input]')
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(box, q)
    box.dispatchEvent(new Event('input', { bubbles: true }))
    await sleep(900)
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    await sleep(1500)
  }
  /** A click the way the editor receives one: mousedown/mouseup at the link's centre. */
  const press = (el, mods = {}) => {
    if (!el) return
    const r = el.getBoundingClientRect()
    const at = { bubbles: true, cancelable: true, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2, button: 0, detail: 1, view: window, ...mods }
    el.dispatchEvent(new MouseEvent('mousedown', at))
    document.dispatchEvent(new MouseEvent('mouseup', at))
    el.dispatchEvent(new MouseEvent('click', at))
  }

  /* ---------- WRITE: the hub, open in the editor ---------- */
  await open(HUB)
  // It opens in READ; this half is the editor's, so ⌘E.
  if (!content()) {
    key('e')
    await sleep(900)
  }
  log.openedInWrite = Boolean(content())
  log.foundTheLink = Boolean(wiki())
  log.tooltipPromisesIt = /⌘-click/.test(wiki()?.getAttribute('title') ?? '')
  const startW = tabs().length
  // A plain click is the caret, not a journey.
  press(wiki())
  await sleep(1200)
  log.writePlainClickStays = is(HUB)(activeTitle()) && tabs().length === startW
  // ⌘-click opens the spoke BESIDE the hub.
  press(wiki(), { metaKey: true })
  await sleep(1500)
  log.writeMetaClickAddsATab = tabs().length === startW + 1
  log.writeMetaClickWentThere = is(SPOKE)(activeTitle())
  log.writeKeptTheNote = titles().some(is(HUB))

  /* ---------- READ: the same note, ⌘E ---------- */
  click(tabs().find((t) => is(HUB)(label(t))))
  await sleep(900)
  key('e')
  await sleep(800)
  log.inRead = !content() && Boolean(wiki())
  const startR = tabs().length
  click(wiki(), { metaKey: true })
  await sleep(1500)
  // spoke is already open in a tab, so it is selected rather than opened twice.
  log.readMetaClickSelectsTheOpenTab = is(SPOKE)(activeTitle()) && tabs().length === startR
  click(tabs().find((t) => is(HUB)(label(t))))
  await sleep(900)
  const beforePlain = tabs().length
  click(wiki())
  await sleep(1500)
  log.readPlainClickFollows = is(SPOKE)(activeTitle())
  log.readPlainClickReplaces = tabs().length <= beforePlain

  /* ---------- the head's linked rows take ⌘ too ---------- */
  await open(SPOKE)
  const meta = notePane()?.querySelector('[data-meta="1"]')
  click(meta)
  await sleep(800)
  const linkRow = () =>
    [...(notePane()?.querySelectorAll('[data-link-row]') ?? [])].find((r) => is(RIM)(r.innerText))
  log.headListsALink = Boolean(linkRow())
  if (linkRow()) {
    const n = tabs().length
    click(linkRow(), { metaKey: true })
    await sleep(1600)
    log.linkRowAddsATab = tabs().length === n + 1
    log.linkRowWentThere = is(RIM)(activeTitle())
  }

  log.pass =
    log.openedInWrite &&
    log.foundTheLink &&
    log.tooltipPromisesIt &&
    log.writePlainClickStays &&
    log.writeMetaClickAddsATab &&
    log.writeMetaClickWentThere &&
    log.writeKeptTheNote &&
    log.inRead &&
    log.readMetaClickSelectsTheOpenTab &&
    log.readPlainClickFollows &&
    log.headListsALink &&
    log.linkRowAddsATab === true &&
    log.linkRowWentThere === true
  return log
})()
