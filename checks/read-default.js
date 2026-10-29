// A NOTE OPENS IN READ.
//
// It used to open in WRITE, on the argument that WRITE draws the markdown and so
// reads as a document anyway. But a note beside a thread is mostly there to be
// read from, and an editor with the caret in it is a page that answers every
// stray key; writing is the thing you ask for — ⌘E, the pair, or a
// double-click where you mean to write. So:
//
// - A note found and opened is READ: the document, the pair on READ, no editor.
// - ⌘E is WRITE, and the mode is the note's: another note opened beside it
//   opens in READ, and the first is still in WRITE when you go back to it.
// - A note made a moment ago is the exception — it is there to be written in:
//   ⌘N opens it in WRITE, the caret in its title.
// - And naming it there keeps it in WRITE. The mode is held by the note's
//   identity, not its path; held by path, the rename that naming an untitled
//   note is would have put it back in READ under the caret.
//
// Seeds its own two notes through the app's IPC, and makes one with ⌘N. Run
// against a throwaway LANES_VAULT and LANES_STATE. See checks/README.md.
(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
  const pane = () => document.querySelector('[data-pane="1"]')
  const key = (k, extra = {}) =>
    window.dispatchEvent(new KeyboardEvent('keydown', { key: k, metaKey: true, bubbles: true, ...extra }))
  const content = () => pane()?.querySelector('.cm-content')
  const mode = (m) => pane()?.querySelector(`[data-mode="${m}"]`)?.dataset.on === '1'
  const readHas = (s) => [...(pane()?.querySelectorAll('[data-md-from]') ?? [])].some((d) => d.textContent.includes(s))
  const tabs = () => [...(pane()?.querySelectorAll('[data-tab]') ?? [])]
  const tabOf = (name) => tabs().find((t) => (t.getAttribute('title') || t.textContent || '').includes(name))
  const field = () => pane()?.querySelector('[data-note-title]')
  const openByName = async (name, newTab) => {
    key('k')
    await sleep(600)
    const box = document.querySelector('[data-palette-input]')
    Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(box, name)
    box.dispatchEvent(new Event('input', { bubbles: true }))
    for (let i = 0; i < 60; i++) {
      const t = (document.querySelector('.pal-row[data-pal-on="1"]')?.textContent ?? '').trim()
      if (t.includes(name) && !t.startsWith('+')) break
      await sleep(100)
    }
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', metaKey: Boolean(newTab), bubbles: true }))
    await sleep(1800)
  }
  const log = {}
  await sleep(1200)

  const stamp = Date.now().toString(36)
  const A = `Read default ${stamp}`
  const B = `Read default beside ${stamp}`
  for (const name of [A, B]) {
    const m = await window.lanes.noteCreate(name, '_unfiled')
    await window.lanes.noteWrite(m.path, `# ${name}\n\nThe words of ${name}, to be read.\n`)
  }

  /* ---------- found and opened: READ ---------- */

  await openByName(A)
  log.opensInRead = !content() && mode('READ') && readHas(`The words of ${A}`)

  /* ---------- ⌘E is WRITE, and the mode is the note's ---------- */

  key('e')
  for (let i = 0; i < 20 && !content(); i++) await sleep(100)
  log.cmdEWrites = Boolean(content()) && mode('WRITE')
  await openByName(B, true)
  log.besideItOpensInRead = Boolean(tabOf(B)) && !content() && mode('READ')
  tabOf(A)?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  for (let i = 0; i < 20 && !content(); i++) await sleep(100)
  await sleep(300)
  log.firstIsStillWriting = Boolean(content()) && mode('WRITE')

  /* ---------- made a moment ago: WRITE, the caret in its title ---------- */

  key('n')
  for (let i = 0; i < 40 && document.activeElement !== field(); i++) await sleep(100)
  log.madeOpensInWrite = Boolean(content()) && mode('WRITE')
  log.caretInItsTitle = Boolean(field()) && document.activeElement === field()

  /* ---------- named there: still WRITE ---------- */

  const NAME = `Named in writing ${stamp}`
  document.execCommand('insertText', false, NAME)
  await sleep(200)
  field()?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))
  // ⌘N makes it in the new-note folder: the vault root, out of the box.
  const slug = `named-in-writing-${stamp}.md`
  for (let i = 0; i < 40 && !(await window.lanes.note(slug)); i++) await sleep(150)
  log.renamed = Boolean(await window.lanes.note(slug))
  await sleep(1200)
  log.namedStaysInWrite = Boolean(content()) && mode('WRITE') && document.activeElement === content()

  log.pass = Boolean(
    log.opensInRead &&
      log.cmdEWrites &&
      log.besideItOpensInRead &&
      log.firstIsStillWriting &&
      log.madeOpensInWrite &&
      log.caretInItsTitle &&
      log.renamed &&
      log.namedStaysInWrite
  )
  return log
})()
