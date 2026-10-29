// ⌘K READS THE INSIDE OF A THREAD, not just its name.
//
// The vault's text has been searchable for a while — type three characters and
// the notes that CONTAIN them come back with the line they matched on. A thread
// had nothing of the kind: it was findable only by its title, and a thread's
// title is sixty characters the CLI cut off the opening prompt. Half of what
// this app holds is conversation, and the half you most often go back for is a
// sentence somebody said in one.
//
// So: say something in a thread, take a phrase back OUT of the answer, check
// that phrase is nowhere in the thread's NAME, and then find the thread by it.
// The phrase is lifted from the transcript rather than written into the prompt
// because a thread's name is the first sixty characters of what you asked and
// the namer may improve on that later — any phrase chosen in advance can end up
// in the name, and a name match would pass this while proving nothing.
//
// Spends one turn and writes a transcript, so run it against a throwaway
// LANES_VAULT and LANES_STATE with an empty session directory.
// See checks/README.md.
;(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
  const click = (el) => el && el.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  const pane = () => document.querySelector('[data-pane="0"]')
  const composer = () => pane().querySelector('textarea')
  const busy = () => /\bStop\b/.test(pane().innerText)
  const rows = () => [...document.querySelectorAll('.pal-row')]
  const key = (k, opts = {}) =>
    window.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, ...opts }))
  const setValue = (el, v) => {
    const proto =
      el instanceof window.HTMLTextAreaElement
        ? window.HTMLTextAreaElement.prototype
        : window.HTMLInputElement.prototype
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, v)
    el.dispatchEvent(new Event('input', { bubbles: true }))
  }
  const say = async (text) => {
    setValue(composer(), text)
    await sleep(200)
    composer().dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })
    )
    await sleep(800)
    for (let i = 0; i < 150 && busy(); i++) await sleep(1000)
    await sleep(700)
  }
  const openPalette = async (q) => {
    // ⌘K on an OPEN palette closes it, so start from closed either way.
    if (document.querySelector('[data-palette-input="1"]')) {
      key('Escape')
      await sleep(350)
    }
    key('k', { metaKey: true })
    await sleep(700)
    setValue(document.querySelector('[data-palette-input="1"]'), q)
    // The text index is asked in the main process behind a 180ms debounce, and
    // it re-stats the session directory before answering.
    await sleep(2200)
  }
  const closePalette = async () => {
    key('Escape')
    await sleep(400)
  }
  const log = {}
  await sleep(2600)

  /* ---------- 1. say something, and take the phrase back OUT of it ---------- */

  /*
   * The phrase is lifted from the ANSWER rather than written into the prompt,
   * and it is checked against the tab's title before it is used. A thread's
   * name is the first sixty characters of what you asked, and the namer may
   * improve on that later — so any phrase chosen in advance can quietly end up
   * IN the name, and a name match would then pass this check while proving
   * nothing at all about reading the inside of a thread.
   */
  await say('Write three plain-prose sentences about a disused chalk quarry. No lists, no preamble.')
  log.turnsTaken = pane().querySelectorAll('[data-msg-role="claude"]').length
  const answer = [...pane().querySelectorAll('[data-msg-role="claude"]')]
    .map((r) => r.innerText)
    .join(' ')
  log.answered = answer.trim().length > 60

  const tabTitle = (
    document.querySelector('[data-pane="0"] [data-tab][data-tab-on="1"]')?.innerText ?? ''
  )
    .replace(/×$/, '')
    .trim()
  log.threadIsCalled = tabTitle

  // A run of four words out of the middle of the reply, long enough to be that
  // thread's alone and absent from its name.
  const words = answer.replace(/\s+/g, ' ').trim().split(' ')
  let phrase = ''
  for (let i = Math.floor(words.length / 3); i < words.length - 4 && !phrase; i++) {
    const run = words.slice(i, i + 4).join(' ')
    if (run.length > 14 && !tabTitle.toLowerCase().includes(run.toLowerCase())) phrase = run
  }
  log.phrase = phrase
  log.tookAPhraseFromTheAnswer = Boolean(phrase)
  log.nameDoesNotHoldThePhrase =
    Boolean(phrase) && !tabTitle.toLowerCase().includes(phrase.toLowerCase())

  /* ---------- 2. and the thread comes back for it ---------- */

  await openPalette(phrase)
  // The offers QUOTE the query — `New note "in the lowest cut,"` holds the
  // phrase without being a hit — so they are never what this is looking at.
  const holds = (r) =>
    !/^\+/.test(r.innerText.trim()) &&
    !/NEW (NOTE|THREAD)/.test(r.innerText) &&
    r.innerText.toLowerCase().includes(phrase.toLowerCase())
  const hit = rows().find(holds)
  log.rowCount = rows().length
  log.foundIt = Boolean(hit)
  // The row is badged TEXT: it says WHY it is here, and "found inside it" is a
  // different claim from "called that".
  log.badgeSaysText = /TEXT/.test(hit?.innerText ?? '')
  // And the matching sentence is the row's own subtitle, so you can see it was
  // the right thread before you open it.
  log.rowShowsTheSentence = Boolean(hit) && holds(hit)
  // Named after the thread, not after the hit — a thread renamed here must not
  // be called something else two rows down.
  log.rowIsNamedForTheThread = (hit?.innerText ?? '').includes(tabTitle.slice(0, 12))

  /* ---------- 3. the THREADS filter keeps it, the NOTES filter does not ---------- */

  const chip = (id) => document.querySelector(`[data-pal-seg="${id}"]`)
  const thisThread = () => rows().some((r) => r.innerText.includes(tabTitle.slice(0, 12)))
  click(chip('chats'))
  await sleep(900)
  log.underThreadsFilter = thisThread()
  click(chip('notes'))
  await sleep(900)
  // The phrase is ordinary prose and a big enough vault could hold it in a note
  // too, so what is asserted is that the THREAD is gone — not that nothing is.
  log.underNotesFilter = thisThread()
  log.filteredToItsOwnKind = log.underThreadsFilter && !log.underNotesFilter

  /* ---------- 4. and picking it opens that thread ---------- */

  click(chip('all'))
  await sleep(900)
  click(rows().find(holds))
  await sleep(1600)
  log.openedTheThread = pane().innerText.toLowerCase().includes(phrase.toLowerCase())

  /* ---------- 5. a phrase nobody said finds nothing ---------- */

  await openPalette('marmalade dirigible parliament')
  log.nonsenseRows = rows().filter((r) => !/New (note|thread)/.test(r.innerText)).length
  log.nonsenseFindsNothing = log.nonsenseRows === 0
  await closePalette()

  log.pass =
    log.answered &&
    log.tookAPhraseFromTheAnswer &&
    log.nameDoesNotHoldThePhrase &&
    log.rowIsNamedForTheThread &&
    log.foundIt &&
    log.badgeSaysText &&
    log.rowShowsTheSentence &&
    log.filteredToItsOwnKind &&
    log.openedTheThread &&
    log.nonsenseFindsNothing
  return JSON.stringify(log, null, 1)
})()
