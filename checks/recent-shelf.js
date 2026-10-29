// RECENT folds on today, per kind — everything touched today above the fold,
// never fewer than seven — with a toggle that goes both ways and folds itself
// back up when you leave the mode.
// See checks/README.md for how to run it.
(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
  const click = (el) => el && el.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  // Two cards scroll: the starred shelf and the browser. The browser is the one
  // holding rows.
  const rail = () =>
    [...document.querySelectorAll('[data-scroll="1"]')].find((d) =>
      d.querySelector('[data-rail-row]')
    ) ?? document.querySelector('[data-scroll="1"]')
  // Rows carry their kind and when they last moved; the labels between them are
  // inert and carry neither.
  const rowsOf = (kind) => [...rail().querySelectorAll(`[data-rail-row="${kind}"]`)]
  const whensOf = (kind) => rowsOf(kind).map((r) => Number(r.dataset.when))
  // The two "N more" / "Show less" rows, in section order: threads then notes.
  const toggles = () =>
    [...rail().querySelectorAll('[data-rail-row="group"]')].filter((d) =>
      /more$|Show less/.test(d.innerText.trim())
    )
  const dayStart = new Date().setHours(0, 0, 0, 0)
  const log = {}
  await sleep(2800)

  // RECENT is the default mode, but say so rather than assume it.
  const recent = [...document.querySelectorAll('div')].find(
    (d) => d.innerText === 'Recent' && d.style.borderRadius === '13px'
  )
  click(recent)
  await sleep(600)

  const shelved = { chat: rowsOf('chat').length, note: rowsOf('note').length }
  log.threadsShelved = shelved.chat
  log.notesShelved = shelved.note
  log.twoToggles = toggles().length === 2
  log.toggleLabels = toggles().map((d) => d.innerText.trim())
  // Recency order, not merely a set: the shelf is "what I have been in".
  const ordered = (kind) => whensOf(kind).every((w, i, all) => i === 0 || all[i - 1] >= w)
  log.threadsInOrder = ordered('chat')
  log.notesInOrder = ordered('note')

  // Expanding threads must not expand notes.
  click(toggles()[0])
  await sleep(700)
  log.threadsExpanded = rowsOf('chat').length
  log.threadsGrew = log.threadsExpanded > shelved.chat
  log.notesStayedShelved = rowsOf('note').length === shelved.note

  // With the whole list in hand, the fold can be checked against it rather than
  // against a number this script made up: everything from today, at least seven.
  const wantThreads = Math.max(7, whensOf('chat').filter((w) => w >= dayStart).length)
  log.threadsFoldWanted = wantThreads
  log.threadsFoldOnToday = shelved.chat === wantThreads

  // And it goes back — the point of having the collapse at all.
  click(toggles()[0])
  await sleep(700)
  log.threadsAfterCollapse = rowsOf('chat').length
  log.collapsesAgain = log.threadsAfterCollapse === shelved.chat

  // Notes have their own toggle, and their own today.
  click(toggles()[1])
  await sleep(700)
  log.notesExpanded = rowsOf('note').length
  log.notesGrew = log.notesExpanded > shelved.note
  const wantNotes = Math.max(7, whensOf('note').filter((w) => w >= dayStart).length)
  log.notesFoldWanted = wantNotes
  log.notesFoldOnToday = shelved.note === wantNotes

  // Leaving the mode folds it back up: an expansion answers a question, it is
  // not a shape the rail keeps.
  const mode = (name) =>
    [...document.querySelectorAll('div')].find(
      (d) => d.innerText === name && d.style.borderRadius === '13px'
    )
  log.leftExpanded = { threads: rowsOf('chat').length, notes: rowsOf('note').length }
  click(mode('Lanes'))
  await sleep(700)
  click(mode('Recent'))
  await sleep(900)
  log.backFromLanes = { threads: rowsOf('chat').length, notes: rowsOf('note').length }
  log.foldsBackOnReturn =
    rowsOf('chat').length === shelved.chat && rowsOf('note').length === shelved.note

  // Both kinds have to fold for any of this to have been asked: a vault with
  // nothing past the fold has no toggle, and fails on twoToggles rather than
  // passing on nothing.
  log.pass =
    log.twoToggles &&
    log.threadsInOrder &&
    log.notesInOrder &&
    log.threadsFoldOnToday &&
    log.threadsGrew &&
    log.notesStayedShelved &&
    log.collapsesAgain &&
    log.notesFoldOnToday &&
    log.notesGrew &&
    log.foldsBackOnReturn
  return JSON.stringify(log, null, 1)
})()
