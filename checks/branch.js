// Asserts that forking folds the page rather than opening a tab: the same tab,
// the same thread, the conversation cut back to where you asked, a seam naming
// what the other path said next, and a click on it putting you back.
//
// A session is still its transcript, so the fork is still a truncated copy under
// a new id — the older question, whether the copy carries the right history and
// leaves the original alone, is asked here too, with the codewords.
//
// Run against a throwaway LANES_VAULT and LANES_STATE, and an empty session
// directory. See checks/README.md.
(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
  const pane = (i) => document.querySelector(`[data-pane="${i}"]`)
  const composer = () => pane(0).querySelector('textarea')
  const rows = () => [...pane(0).querySelectorAll('.msg-row')]
  const rowsBy = (role) => [...pane(0).querySelectorAll(`[data-msg-role="${role}"]`)]
  // A row's text begins with its actions on one side and its label on the
  // other, so the role comes off the element rather than out of the text.
  const bodyOf = (r) =>
    [...r.children].slice(1).map((c) => c.innerText || '').join(' ').replace(/\s+/g, ' ').trim()
  const click = (el) => el && el.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  const actionIn = (row, label) =>
    [...row.querySelectorAll('.msg-action')].find(
      (d) => d.textContent.trim().toLowerCase() === label
    )
  const tabs = () =>
    [...pane(0).querySelectorAll('[data-tab]')].map((t) => t.textContent.replace(/×$/, '').trim())
  const seams = () => [...pane(0).querySelectorAll('[data-seam]')]
  const seamWords = () =>
    seams().map((s) => s.innerText.replace(/\s+/g, ' ').trim())
  const key = (k) =>
    window.dispatchEvent(new KeyboardEvent('keydown', { key: k, metaKey: true, bubbles: true }))
  const log = {}

  // A chat of its own, so the transcript is exactly the two turns below and the
  // first answer really is the first answer.
  key('t')
  await sleep(1200)

  // The send button reads Stop while a turn is in flight. Waiting on the text of
  // the answer does not work: a prompt usually contains the word it asks for,
  // so the wait returns before the turn has even started.
  const busy = () => /\bStop\b/.test(pane(0).innerText)
  const ask = async (text) => {
    const set = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set
    set.call(composer(), text)
    composer().dispatchEvent(new Event('input', { bubbles: true }))
    await sleep(200)
    composer().dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })
    )
    await sleep(1500)
    for (let i = 0; i < 90 && busy(); i++) await sleep(1000)
    await sleep(900)
    return !busy()
  }

  // --- two facts, one per turn, so a cut between them is visible ---
  log.turn1 = await ask('The codeword is ZEPHYR. Reply with just: OK')
  log.turn2 = await ask('The second codeword is QUARTZ. Reply with just: DONE')

  const tabsBefore = tabs()
  const titleBefore = tabsBefore[0]
  log.rowsBefore = rows().length
  log.seamsBefore = seams().length

  // --- FORK at the first answer ---
  // The first answer: Claude's, and the earliest one — forking there is what
  // leaves the second codeword behind.
  const firstAnswer = rowsBy('claude')[0]
  if (!firstAnswer) return { ...log, error: 'no first answer row' }
  const fork = actionIn(firstAnswer, 'fork')
  log.forkOffered = Boolean(fork)
  if (!fork) return { ...log, pass: false }
  click(fork)
  for (let i = 0; i < 30 && !seams().length; i++) await sleep(400)
  await sleep(900)

  // IT STAYS HOME. No tab was opened, and the thread kept its name — there is
  // no `Fork · ` anything, because this is the same conversation.
  log.tabsAfterFork = tabs()
  log.noNewTab = tabs().length === tabsBefore.length
  log.keptItsName = tabs()[0] === titleBefore
  log.noForkPrefix = !tabs().some((t) => /^(Fork|Re-run) · /.test(t))

  // THE PAGE FOLDED. Everything under the cut belongs to the other path now.
  log.rowsAfterFork = rows().length
  log.folded = rows().length < log.rowsBefore
  log.quartzGone = !rowsBy('you').some((r) => /QUARTZ/.test(r.innerText))

  // AND A SEAM SAYS SO, naming the other path by what it goes on to say.
  log.seamShown = seams().length === 1
  log.seamWords = seamWords()[0] || ''
  // The label is the other path's opening words, cut to fit a hairline — so
  // this looks for the stem that survives the truncation.
  log.seamNamesTheOther = /QUAR/i.test(log.seamWords)

  // --- THE PALETTE ADDRESSES A THREAD, AND MUST NOT YANK YOU OFF ITS PATH.
  // Every browsing list carries the family's ROOT id; standing on a path, that
  // used to replace the tab in place with the root — and report the path it left
  // as closed, which reaps its process. Resolved to the active path instead. ---
  const pal = () => document.querySelector('input[placeholder*="Search"]')
  key('k')
  await sleep(700)
  log.paletteOpened = Boolean(pal())
  if (pal()) {
    const set = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
    set.call(pal(), 'codeword')
    pal().dispatchEvent(new Event('input', { bubbles: true }))
    await sleep(900)
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    await sleep(1200)
    // Still the path we were reading: the second codeword never comes back.
    log.paletteKeptThePath = !rowsBy('you').some((r) => /QUARTZ/.test(r.innerText))
    log.paletteStillOneTab = tabs().length === tabsBefore.length
  }

  // The copy carries the history it should: the first codeword, not the second.
  const forkKnows = await ask('List every codeword you know, comma separated. If none, say NONE.')
  // The answer alone. A tail slice of the pane also catches the path's own
  // history — which contains the very word being asked about, so it read as a
  // pass whatever the model said.
  const answers = rowsBy('claude')
  const reply = answers.length ? bodyOf(answers[answers.length - 1]) : ''
  log.forkAnswered = forkKnows
  log.forkReply = reply.slice(0, 80)
  log.forkKeptZephyr = /ZEPHYR/i.test(reply)
  log.forkDroppedQuartz = !/QUARTZ/i.test(reply)

  // --- THE SEAM GOES BACK. Clicking the other path's name reads it instead,
  // in the same tab, with the conversation this path never had. ---
  const label =
    seams()[0] && [...seams()[0].querySelectorAll('span')].find((s) => /QUAR/i.test(s.textContent))
  log.seamClickable = Boolean(label)
  if (label) {
    click(label)
    for (let i = 0; i < 30 && !rowsBy('you').some((r) => /QUARTZ/.test(r.innerText)); i++) {
      await sleep(300)
    }
    await sleep(600)
    log.backHasQuartz = rowsBy('you').some((r) => /QUARTZ/.test(r.innerText))
    log.backStillOneTab = tabs().length === tabsBefore.length
    // Standing on the other path, the seam now names the one we came from.
    log.backSeamShown = seams().length === 1
    log.backSeamNamesTheOther = /codeword/i.test(seamWords()[0] || '')
  }

  // --- EDIT hands a question back to the composer rather than asking it again.
  // Standing on the path that has QUARTZ, editing that question folds the page
  // above it and puts the words in the composer, unsent. ---
  const yourTurn = rowsBy('you').find((r) => /second codeword/.test(r.innerText))
  const edit = yourTurn && actionIn(yourTurn, 'edit')
  log.editOffered = Boolean(edit)
  // A fork is not offered on your own turn any more, and an edit is not offered
  // on Claude's: which verb belongs where is decided by whose turn it is.
  log.noForkOnYourTurn = Boolean(yourTurn) && !actionIn(yourTurn, 'fork')
  const anAnswer = rowsBy('claude')[0]
  log.noEditOnClaude = Boolean(anAnswer) && !actionIn(anAnswer, 'edit')
  if (edit) {
    const was = rows().length
    click(edit)
    for (let i = 0; i < 30 && rows().length >= was; i++) await sleep(300)
    await sleep(900)
    log.editFolded = rows().length < was
    log.editQuestionGone = !rowsBy('you').some((r) => /second codeword/.test(r.innerText))
    log.editPrefilled = /second codeword is QUARTZ/i.test(composer().value || '')
    // Never sent for you: the point of asking again is to ask differently.
    log.editDidNotSend = !busy()
  }

  // --- THE PATH MENU. Right-clicking a path at its seam offers the two things
  // there are to say about one: name it, or let it go. No turns are spent here
  // — the family already exists. ---
  const rmb = (el) =>
    el && el.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: 300, clientY: 300 }))
  // Found by its kicker and walked up to the panel: the items change — naming
  // swaps them for a field — so matching on any item's words is not stable.
  const kicker = () =>
    [...document.querySelectorAll('div')].find(
      (d) => d.textContent.trim() === 'PATH' && !d.children.length
    )
  const menu = () => kicker()?.parentElement?.parentElement ?? null
  const labelsOf = (seam) =>
    seam ? [...seam.querySelectorAll('span')].map((x) => x.textContent.trim()).slice(1) : []

  // The paths the seam offers a way OUT to. It lists them all now, the one being
  // read included and marked, so the others are a filter rather than a slice.
  const spansOf = () =>
    seams()[0] ? [...seams()[0].querySelectorAll('[data-path-active="0"]')] : []
  log.seamLabels = spansOf().map((x) => x.textContent.trim())
  // EVERY path is on the rule, the one you are reading included and marked — so
  // the seam says how many ways this went and which one is yours, rather than
  // being a list with a hole in it whose contents depend on where you stand.
  const seamAll = () => (seams()[0] ? [...seams()[0].querySelectorAll('[data-path-active]')] : [])
  log.seamListsEveryPath = seamAll().length === spansOf().length + 1
  log.seamMarksTheActiveOne =
    seamAll().filter((x) => x.dataset.pathActive === '1').length === 1
  log.activeOneIsNotALink = !seamAll()
    .find((x) => x.dataset.pathActive === '1')
    ?.classList.contains('msg-action')

  // Any path can be NAMED, the thread's first one included — a name is about a
  // session, not about the kinship record a first path does not have.
  rmb(spansOf()[0])
  await sleep(500)
  log.menuOpened = Boolean(menu())
  const item = (text) =>
    menu() ? [...menu().querySelectorAll('div')].find((d) => d.innerText.trim() === text) : null
  log.menuOffersName = Boolean(item('Name this path…'))
  if (item('Name this path…')) {
    click(item('Name this path…'))
    await sleep(400)
    const field = menu() && menu().querySelector('input')
    log.nameFieldOpened = Boolean(field)
    if (field) {
      const set = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
      set.call(field, 'the quartz road')
      field.dispatchEvent(new Event('input', { bubbles: true }))
      await sleep(150)
      field.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
      for (let i = 0; i < 30; i++) {
        if (spansOf().some((x) => /quartz road/i.test(x.textContent))) break
        await sleep(300)
      }
      log.seamTookTheName = spansOf().some((x) => /quartz road/i.test(x.textContent))
    }
  }

  // Only a path CUT from the thread can be let go, and which of the labels that
  // is depends on ids — so look for the one that offers it rather than assuming.
  let cut = -1
  for (let i = 0; i < spansOf().length; i++) {
    rmb(spansOf()[i])
    await sleep(400)
    if (item('Let this path go')) {
      cut = i
      break
    }
    click(document.body)
    await sleep(200)
  }
  log.trashOffered = cut >= 0
  // The thread's own first path is offered no way to be thrown away.
  log.rootNotRemovable = spansOf().length > 1 && cut >= 0 && cut < spansOf().length
  if (cut >= 0) {
    const was = spansOf().length
    const going = spansOf()[cut].textContent.trim()
    click(item('Let this path go'))
    for (let i = 0; i < 40 && seams().length && spansOf().length >= was; i++) await sleep(300)
    await sleep(700)
    const now = spansOf().map((x) => x.textContent.trim())
    log.pathLetGo = !seams().length || (now.length < was && !now.includes(going))
  }

  log.pass =
    log.turn1 &&
    log.turn2 &&
    log.forkOffered &&
    log.noNewTab &&
    log.keptItsName &&
    log.noForkPrefix &&
    log.folded &&
    log.quartzGone &&
    log.seamShown &&
    log.seamNamesTheOther &&
    log.paletteOpened &&
    log.paletteKeptThePath &&
    log.paletteStillOneTab &&
    log.forkKeptZephyr &&
    log.forkDroppedQuartz &&
    log.seamClickable &&
    log.backHasQuartz &&
    log.backStillOneTab &&
    log.backSeamShown &&
    log.editOffered &&
    log.noForkOnYourTurn &&
    log.noEditOnClaude &&
    log.editFolded &&
    log.editQuestionGone &&
    log.editPrefilled &&
    log.editDidNotSend &&
    log.menuOpened &&
    log.menuOffersName &&
    log.nameFieldOpened &&
    log.seamTookTheName &&
    log.seamListsEveryPath &&
    log.seamMarksTheActiveOne &&
    log.activeOneIsNotALink &&
    log.trashOffered &&
    log.pathLetGo
  return log
})()
