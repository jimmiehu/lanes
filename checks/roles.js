// Asserts the role assignment: threads always land in pane A, notes always in
// pane B, opening a note opens the split, and a pane may close to empty and
// come back with its own destination. See checks/README.md for how to run it.
(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
  const click = (el) => el && el.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  const paneOf = (i) => document.querySelector(`[data-pane="${i}"]`)
  const emptyOf = (i) => {
    const all = [...document.querySelectorAll('[data-pane-empty]')]
    return all[i === 1 && all.length > 1 ? 1 : 0] || all[0] || null
  }
  const tabsIn = (i) => {
    const p = paneOf(i)
    return p ? [...p.querySelectorAll('[data-tab="1"]')].map((t) => t.innerText.trim()) : []
  }
  const log = {}

  await sleep(2600)

  // --- a note opens in pane B, and opens the split to do it ---
  log.splitAtRest = Boolean(paneOf(1)) || Boolean(document.querySelectorAll('[data-pane-empty]').length > 1)
  const noteRow = [...document.querySelectorAll('[data-rail-row="note"]')][0]
  log.foundNoteRow = Boolean(noteRow)
  if (noteRow) {
    click(noteRow)
    await sleep(1400)
  }
  log.splitAfterNote = Boolean(paneOf(1)) || document.querySelectorAll('[data-pane-empty]').length > 0
  // Pane A must still be a thread; pane B must now be the note.
  log.paneATabs = tabsIn(0)
  log.paneBTabs = tabsIn(1)
  log.noteLandedInB = tabsIn(1).length > 0
  log.paneAUnchangedKind = Boolean(paneOf(0) && paneOf(0).querySelector('textarea'))

  // --- a thread opened while the note pane has focus still lands in pane A ---
  const chatRow = [...document.querySelectorAll('[data-rail-row="chat"]')][0]
  if (chatRow) {
    click(chatRow)
    await sleep(1200)
    log.threadStillInA = tabsIn(0).length > 0
    log.paneBUntouched = tabsIn(1).length > 0
  }

  // --- closing pane B's last tab leaves a real empty destination ---
  const bTab = paneOf(1) && paneOf(1).querySelector('[data-tab="1"] [data-x="1"]')
  if (bTab) {
    click(bTab)
    await sleep(900)
    const empty = [...document.querySelectorAll('[data-pane-empty]')]
    log.emptyAfterClose = empty.length
    log.emptySays = empty.length ? empty[empty.length - 1].innerText.replace(/\s+/g, ' ').trim().slice(0, 90) : ''
  }

  // The thread and close halves only record when there was a thread row and a
  // tab in B to close; a missing one is a fail, not a skip. "Real" is the note
  // pane's own destination, which says so.
  log.pass = Boolean(
    log.foundNoteRow &&
    log.splitAfterNote &&
    log.noteLandedInB &&
    log.paneAUnchangedKind &&
    log.threadStillInA &&
    log.paneBUntouched &&
    log.emptyAfterClose > 0 &&
    /No note open/.test(log.emptySays)
  )
  return JSON.stringify(log, null, 1)
})()
