// [[ ASKS WHICH NOTE — AND WRITES THE SHORTEST LINK THAT LANDS.
//
// A link to another note is the one thing in a note you cannot type from
// memory, so two letters after `[[` the vault's notes come up by title, from
// the same search ⌘K runs. This holds what the list offers and what taking an
// entry writes:
//
// - The notes whose titles match, each with its folder, and what was typed
//   drawn in the titles it matched.
// - Not the note you are writing in. A link from a note to itself is never the
//   one you were reaching for, and it sat in the list among the ones you were.
// - A name no note has yet, offered last as a *new note*.
// - Taking one writes the bare name when the vault resolves that name to the
//   very note taken, aliased with its title so READ shows the title — and the
//   full path only when the bare name would land on a different note: two notes
//   called the same in two folders, and the one the name does not reach.
// - The caret lands after the `]]`.
// - ⌫ straight after `[[` takes back the `]]` that came with it: `[[¦]]` ⌫ is
//   `[¦`, and ⌫ again leaves nothing. Red while ⌫ took the second `[` and left
//   `]]` on the page.
//
// Seeds its own notes, stamped, through the app's IPC. Run against a throwaway
// LANES_VAULT and LANES_STATE. See checks/README.md.
;(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
  const pane = (i) => document.querySelector(`[data-pane="${i}"]`)
  const key = (k, extra = {}) =>
    window.dispatchEvent(new KeyboardEvent('keydown', { key: k, metaKey: true, bubbles: true, ...extra }))
  const content = () => pane(1)?.querySelector('.cm-content')
  const view = () => content()?.cmTile?.view ?? content()?.cmView?.view ?? null
  const lines = () => [...(pane(1)?.querySelectorAll('.cm-line') ?? [])]
  const lineWith = (s) => lines().find((l) => l.textContent.includes(s))
  const press = (k, mods = {}) =>
    content()?.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...mods }))
  const type = (text) => document.execCommand('insertText', false, text)
  /**
   * One key at a time, with the gap a hand leaves. Two inserts back to back
   * reach the editor as ONE input of two characters — which is not the second
   * `[` it closes a link on, nor the `]` it steps over.
   */
  const typeSlowly = async (text) => {
    for (const ch of text) {
      type(ch)
      await sleep(40)
    }
  }
  /** The caret at the very end of the line that shows `s`, by a click the editor handles itself. */
  const caretAtEnd = async (s) => {
    const line = lineWith(s)
    if (!line) return false
    const walk = document.createTreeWalker(line, NodeFilter.SHOW_TEXT)
    let n
    let last = null
    while ((n = walk.nextNode())) if (n.data.length) last = n
    if (!last) return false
    const r = document.createRange()
    r.setStart(last, last.data.length - 1)
    r.setEnd(last, last.data.length)
    const b = r.getBoundingClientRect()
    const at = { bubbles: true, cancelable: true, clientX: b.right + 1, clientY: b.top + b.height / 2, button: 0, detail: 1, view: window }
    ;(document.elementFromPoint(at.clientX, at.clientY) ?? last.parentElement).dispatchEvent(new MouseEvent('mousedown', at))
    document.dispatchEvent(new MouseEvent('mouseup', at))
    await sleep(250)
    return true
  }
  const list = () => document.querySelector('.cm-tooltip.lanes-complete')
  const options = () =>
    [...(list()?.querySelectorAll('li') ?? [])].map((li) => ({
      label: li.querySelector('.cm-completionLabel')?.textContent ?? '',
      detail: li.querySelector('.cm-completionDetail')?.textContent ?? '',
      matched: Boolean(li.querySelector('.cm-completionMatchedText'))
    }))
  const waitForList = async () => {
    for (let i = 0; i < 40 && !(list() && options().length); i++) await sleep(100)
    await sleep(300)
  }
  /** Take the option at index `i` the way a person does: arrows, then ↵. */
  const take = async (i) => {
    for (let k = 0; k < i; k++) {
      press('ArrowDown')
      await sleep(60)
    }
    press('Enter')
    await sleep(300)
  }
  const log = {}

  const stamp = Date.now().toString(36)
  const TARGET = `Complete target ${stamp}`
  const TWIN = `Twin ${stamp}`
  const HERE = `Complete here ${stamp}`

  // --- seed: a target, two notes of the same name in two folders, and the note typed in ---
  const target = await window.lanes.noteCreate(TARGET, '_unfiled')
  const twinA = await window.lanes.noteCreate(TWIN, '_unfiled')
  const twinB = await window.lanes.noteCreate(TWIN, 'elsewhere')
  const here = await window.lanes.noteCreate(HERE, '_unfiled')
  log.seeded = Boolean(target.path && twinA.path && twinB.path && here.path)
  if (!log.seeded) return { ...log, pass: false }
  await window.lanes.noteWrite(here.path, `# ${HERE}\n\nA line to write under.\n`)
  const disk = async () => (await window.lanes.note(here.path))?.body ?? ''
  // Which of the two the bare name reaches is the vault's answer, asked of it.
  const bareTwin = `twin-${stamp}`
  const reached = await window.lanes.resolveLink(bareTwin)
  const other = reached === twinA.path ? twinB.path : twinA.path
  log.twinReached = reached
  const otherFolder = other.slice(0, other.lastIndexOf('/'))

  // --- open the note typed in, by finding it ---
  key('k')
  await sleep(600)
  const box = document.querySelector('[data-palette-input]')
  Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(box, HERE)
  box.dispatchEvent(new Event('input', { bubbles: true }))
  // Found by its text, which the first search after launch waits on the index
  // for — so given time, and ↵ only once the row it belongs to IS this note:
  // pressed early, ↵ takes the offer to make a new one by that name.
  let found = false
  for (let i = 0; i < 80 && !found; i++) {
    const on = document.querySelector('.pal-row[data-pal-on="1"]')
    const t = (on?.textContent ?? '').trim()
    found = t.includes(HERE) && !t.startsWith('+')
    if (!found) await sleep(100)
  }
  log.foundInPalette = found
  if (!found) return { ...log, pass: false }
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
  await sleep(1500)
  // A note opens in READ; writing is asked for, with ⌘E.
  if (!content()) key('e')
  for (let i = 0; i < 15 && !lineWith('A line to write under'); i++) await sleep(200)
  log.opened = Boolean(content()) && Boolean(lineWith('A line to write under'))
  if (!log.opened) return { ...log, pass: false }

  // --- [[ and the stamp: the list ---
  log.caretPlaced = await caretAtEnd('A line to write under')
  press('Enter')
  await sleep(120)
  type('See ')
  await typeSlowly('[[')
  await sleep(150)
  // Asked of the editor's document, not the page: what is on the line, not how it is drawn.
  {
    const v0 = view()
    const at = v0?.state.selection.main.head ?? -1
    const line = v0 ? v0.state.doc.lineAt(at) : null
    log.bracketsClosed = Boolean(line) && line.text.endsWith('See [[]]') && at === line.to - 2
  }
  await typeSlowly(stamp)
  await waitForList()
  const first = options()
  log.labels = first.map((o) => `${o.label} · ${o.detail}`)
  log.offersTheTarget = first.some((o) => o.label === TARGET)
  log.offersBothTwins = first.filter((o) => o.label === TWIN).length === 2
  log.leavesOutThisNote = !first.some((o) => o.label === HERE)
  log.foldersShown = first.filter((o) => o.label === TWIN).map((o) => o.detail).sort().join(',') ===
    ['_unfiled', 'elsewhere'].sort().join(',')
  const last = first[first.length - 1]
  log.offersANewNoteLast = Boolean(last) && last.label === stamp && last.detail === 'new note'
  log.drawsTheMatch = first.filter((o) => o.label !== stamp).every((o) => o.matched)

  // --- take the target: the bare name, aliased, the caret after the ]] ---
  await take(first.findIndex((o) => o.label === TARGET))
  const wantTarget = `[[complete-target-${stamp}|${TARGET}]]`
  const v = view()
  const doc1 = v ? v.state.doc.toString() : ''
  log.wroteTheBareName = doc1.includes(`See ${wantTarget}`)
  log.caretAfterTheLink = Boolean(v) && v.state.selection.main.head === doc1.indexOf(wantTarget) + wantTarget.length
  log.listClosed = !list()

  // --- the twin the bare name does NOT reach: its path, so the link lands on it ---
  type(' and ')
  await typeSlowly('[[')
  await sleep(150)
  await typeSlowly(stamp)
  await waitForList()
  const second = options()
  await take(second.findIndex((o) => o.label === TWIN && o.detail === otherFolder))
  const wantTwin = `[[${other.replace(/\.md$/, '')}|${TWIN}]]`
  const doc2 = view()?.state.doc.toString() ?? ''
  log.wroteThePathWhereTheNameMisses = doc2.includes(`and ${wantTwin}`)
  log.linkResolvesToIt = (await window.lanes.resolveLink(other.replace(/\.md$/, ''))) === other

  // --- a link begun and thought better of: ⌫ takes the pair back ---
  const lineEnd = () => {
    const v1 = view()
    if (!v1) return ''
    const l = v1.state.doc.lineAt(v1.state.selection.main.head)
    return l.text.slice(0, v1.state.selection.main.head - l.from) + '¦' + l.text.slice(v1.state.selection.main.head - l.from)
  }
  type(' ')
  await typeSlowly('[[')
  await sleep(150)
  log.pairOpened = lineEnd().endsWith(`${wantTwin} [[¦]]`)
  press('Backspace')
  await sleep(120)
  log.backspaceTakesThePair = lineEnd().endsWith(`${wantTwin} [¦`)
  press('Backspace')
  await sleep(120)
  log.backspaceAgainTakesTheRest = lineEnd().endsWith(`${wantTwin} ¦`)

  // --- and it is the file that says so ---
  await sleep(2200)
  const saved = await disk()
  log.savedAsTyped = saved.includes(`See ${wantTarget} and ${wantTwin}`)

  log.pass = Boolean(
    log.opened &&
      log.caretPlaced &&
      log.bracketsClosed &&
      log.offersTheTarget &&
      log.offersBothTwins &&
      log.leavesOutThisNote &&
      log.foldersShown &&
      log.offersANewNoteLast &&
      log.drawsTheMatch &&
      log.wroteTheBareName &&
      log.caretAfterTheLink &&
      log.listClosed &&
      log.wroteThePathWhereTheNameMisses &&
      log.linkResolvesToIt &&
      log.pairOpened &&
      log.backspaceTakesThePair &&
      log.backspaceAgainTakesTheRest &&
      log.savedAsTyped
  )
  return log
})()
