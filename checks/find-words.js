// TWO WORDS IN THE WRONG ORDER, which used to find nothing at all.
//
// `vienna facts` returned an empty palette. Not the note actually called
// "Vienna water — historical facts for the river essay", whose title holds
// both words the other way round; not the bodies that say them a sentence
// apart; not a thread that discussed them. Every corpus in the app took the
// query as one literal string, so the only queries that worked were the ones
// you could already have typed as a phrase.
//
// The rule itself is proved in `checks/find-rule.mjs`, which needs no app. This
// is the other half: that the rule actually reaches the palette, the note
// bodies and the transcripts, and that a phrase still outranks scattered words
// so typing a title in order puts that title first.
//
// This is ⌘K's rule, and only ⌘K's. The note bodies it proves are the ones the
// palette searches in main. The notes editor rebuild left the matching rule
// itself as it was; what it changed is the index that rule reads, which is now
// patched in place when the app writes a note. The one note this check writes
// reaches ⌘K by that patch, so it leans on it, but that is not what it proves:
// nothing here edits a note the way the editor does. ⌘F's bar inside an open
// note — searched through the editor in WRITE now, see find-bar.js — is
// deliberately still one literal phrase, case aside, with no words rung and no
// accent fold: its hits have to land on the exact characters they came from,
// and folding changes lengths.
//
// Runs on the sample vault, which holds the water note, and seeds one note of
// its own for the accents (see below). Wants a throwaway vault and a fresh
// state directory; see checks/README.md for how to run it.
;(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
  const key = (k, opts = {}) =>
    window.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, ...opts }))
  const rows = () => [...document.querySelectorAll('.pal-row')]
  const found = () => rows().filter((r) => !/NEW (NOTE|THREAD)/.test(r.innerText))
  const texts = () => found().map((r) => r.innerText.replace(/\s+/g, ' ').trim())
  const setValue = (el, v) => {
    Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(el, v)
    el.dispatchEvent(new Event('input', { bubbles: true }))
  }
  const ask = async (q) => {
    if (document.querySelector('[data-palette-input="1"]')) {
      key('Escape')
      await sleep(350)
    }
    key('k', { metaKey: true })
    await sleep(700)
    setValue(document.querySelector('[data-palette-input="1"]'), q)
    // Names are instant; bodies and transcripts come back from main behind a
    // 180ms debounce and a scan.
    await sleep(2400)
  }
  const holds = (re) => found().some((r) => re.test(r.innerText))
  const log = {}
  await sleep(3000)

  /*
   * THE ONE NOTE THE SAMPLE CANNOT GIVE: a title with an accent in it, under a
   * filename without the word it folds to. The sample's café note is called
   * `cafe-hours.md`, so `cafe` finds it by its path whether or not a title
   * folds — and what is being proved is that a title does. `noteCreate` names
   * the file after the name it is given, folded, so it is given another name
   * and the title is written in afterwards.
   */
  const stamp = Date.now().toString(36)
  const made = await window.lanes.noteCreate(`Harbour ${stamp}`, 'reading')
  log.seeded = made.ok ? made.path : made.reason
  if (!made.ok) return JSON.stringify({ ...log, pass: false }, null, 1)
  await window.lanes.noteWrite(
    made.path,
    `# Café by the harbour ${stamp}\n\nThe café with the long bench outside, where the coffee comes black unless you ask. Grace's choice, after the walk along the quay.\n`
  )
  await sleep(600)

  /* ---------- THE CASE ---------- */

  await ask('vienna facts')
  log.viennaFacts = texts().slice(0, 4)
  log.foundTheNote = holds(/historical facts/i)
  log.foundSomething = found().length > 0

  /* ---------- a phrase still outranks scattered words ---------- */

  // The note's own title, in order. It has to come FIRST, not merely appear:
  // a words rung that reorders exact matches is worse than no words rung.
  await ask('vienna water')
  log.viennaWater = texts().slice(0, 3)
  log.phraseComesFirst = /vienna water/i.test(texts()[0] ?? '')

  /* ---------- order does not matter, and neither do accents ---------- */

  await ask('facts vienna')
  log.reversedFindsIt = holds(/historical facts/i)

  // Nobody types the accent. This worked in a note's BODY and not in its
  // title, because only one of the two folded — so the seeded note has to come
  // up as a NOTE, found by its name, and not as TEXT, found inside it.
  await ask('cafe')
  log.cafeFinds = found().length
  const seeded = found().find((r) => r.dataset.palId === made.path)
  log.seededBadge = seeded?.lastElementChild?.textContent.trim() ?? null
  log.foldedNames = log.cafeFinds > 0 && log.seededBadge === 'NOTE'

  /* ---------- a word that is not there is still a no ---------- */

  // The second word has to be one the vault genuinely does not hold anywhere —
  // a word that is somewhere in it brings back a row that is right, and then
  // it is the check that is wrong. AND semantics can only be proved against a
  // word that is really absent, and the sample has no `zarzuela`.
  await ask('vienna zarzuela')
  log.nonsenseRows = found().length
  log.everyWordMustBeThere = log.nonsenseRows === 0

  /* ---------- and a single word behaves exactly as it did ---------- */

  await ask('vienna')
  log.oneWordRows = found().length
  log.oneWordStillWorks = log.oneWordRows > 3

  key('Escape')
  await sleep(300)

  log.pass =
    log.foundTheNote &&
    log.phraseComesFirst &&
    log.reversedFindsIt &&
    log.foldedNames &&
    log.everyWordMustBeThere &&
    log.oneWordStillWorks
  return JSON.stringify(log, null, 1)
})()
