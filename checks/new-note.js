// Asserts making a note BY NAME, from ⌘K: the offer stands last, under what the
// query really found, so ↵ still belongs to the find; taking it makes the file
// at once, in the folder the name carries; and the note opens in WRITE — the
// editor, not the rendered page — with its name in the head and the caret at the
// top of the empty body, so the first thing typed lands straight under the
// heading. And the note is in the index the moment it exists: ⌘K's own search
// finds it and the rail gives it a row, with no rebuild in between.
//
// That last half is what this check used to hold differently. Making a note
// used to DROP the note index, and the weight layer held a reference of its
// own, so the check started a chat on the new note and asked for its count.
// Main now grafts the new note into the live index instead, and the chat count
// that asked went with the old rail (`chatCounts`, `[data-note]`, "New chat on
// this note" are all gone). A thread counts on a note only once it has a
// transcript, so proving the weights now takes a turn; what is held here is the
// half a person meets first — the note can be found, and it has its row.
//
// The nameless routes — ⌘N, the +'s Note, a nameless ⌘K — make `untitled.md`
// with the caret in the head's title. `jot.js` holds those, timed, down to the
// title naming the file. The + no longer asks for a name at all, so its half
// of this check moved there too.
//
// Seeds its own note through the app's IPC. Run against a LANES_VAULT and a
// LANES_STATE that are new for every run, not merely throwaway: it makes
// `projects/Reading/palette-probe.md` by name, and on a second run that name is
// taken, the make is refused and nothing opens. See checks/README.md.
(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
  // One animation frame — or 50ms, if the window is not being painted and the
  // frame never comes, so a hidden window slows the check rather than hangs it.
  const frame = () =>
    new Promise((r) => {
      requestAnimationFrame(() => r())
      setTimeout(r, 50)
    })
  const pane = (i) => document.querySelector(`[data-pane="${i}"]`)
  const key = (k, extra = {}) =>
    window.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, ...extra }))
  const click = (el) => el && el.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  const content = () => pane(1)?.querySelector('.cm-content')
  const lines = () => [...(pane(1)?.querySelectorAll('.cm-line') ?? [])]
  const title = () => pane(1)?.querySelector('[data-note-title]')
  const type = (text) => document.execCommand('insertText', false, text)
  const rows = () => [...document.querySelectorAll('.pal-row')]
  const isOffer = (r) => /New (note|thread)/.test(r?.innerText ?? '')
  const setInput = (el, v) => {
    const d = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
    d.call(el, v)
    el.dispatchEvent(new Event('input', { bubbles: true }))
  }
  const openPalette = async (q) => {
    // ⌘K on an OPEN palette closes it, so start from closed either way.
    if (document.querySelector('[data-palette-input="1"]')) {
      key('Escape')
      await sleep(350)
    }
    key('k', { metaKey: true })
    await sleep(700)
    // The palette's OWN field: the top bar has a search box too, and typing
    // there filters the rail instead — which is how this check once reported no
    // offer at all.
    const box = document.querySelector('[data-palette-input="1"]')
    if (box) setInput(box, q)
    await sleep(1100)
  }
  const disk = async (p) => (await window.lanes.note(p))?.body ?? null
  const log = {}
  await sleep(2500)

  // Something real for the query to find, so "the offer is never first" is a
  // claim about a list with a match in it rather than one about an empty list.
  // A word no other check says: ⌘K reads threads too, and the thread checks
  // all send "The codeword is ZEPHYR" — a vault they ran in has threads that
  // match `codeword` and outrank a note seeded behind the app's back.
  const seed = await window.lanes.noteCreate('Quillwort ledger', '_unfiled')
  if (seed?.path) {
    await window.lanes.noteWrite(
      seed.path,
      '# Quillwort ledger\n\nThe quillwort is written here, so ⌘K has something to find.\n'
    )
  }

  // --- 1. the offer is LAST, so it never takes ↵ from a real match ---
  await openPalette('quillwort')
  const found = rows()
  log.rowsWithHits = found.length
  log.firstRow = (found[0]?.innerText ?? '').replace(/\s+/g, ' ').trim()
  // Found at all, not found first: the order is `offerNotFirst`'s and
  // `enterBelongsToTheFind`'s to hold, and what else the vault holds is not.
  log.foundTheSeed = found.some((r) => /Quillwort ledger/i.test(r.innerText))
  log.offerNotFirst = found.length > 2 && !isOffer(found[0])
  // The row leads with a glyph and ends with its badge, so the label is inside
  // it rather than at either end — and the badge says which kind it makes.
  const last = found[found.length - 1]?.innerText ?? ''
  log.offerIsLast = last.includes('New note') && last.trim().endsWith('NEW NOTE')
  // And ↵ rests on what was found, not on an offer.
  const on = found.findIndex((r) => r.getAttribute('data-pal-on') === '1')
  log.enterBelongsToTheFind = on >= 0 && !isOffer(found[on])

  // --- 2. taking it makes the note at once, where its name says ---
  // Clicked rather than ↵'d: with nothing found, ↵ rests on the first row,
  // which is the thread offer — this check is about the note one.
  const NAME = 'projects/Reading/palette-probe'
  const PATH = 'projects/Reading/palette-probe.md'
  const box = document.querySelector('[data-palette-input="1"]')
  if (box) setInput(box, NAME)
  await sleep(1100)
  const offer = rows().find((r) => /New note/.test(r.innerText))
  log.offered = Boolean(offer)
  // Timed from the click to the caret standing in the new note's editor. The
  // ceiling is loose: this vault is small, and jot.js is the check that makes
  // the vault the size of a real one before it holds a clock to anything.
  const t0 = performance.now()
  click(offer)
  while (!(content() && document.activeElement === content()) && performance.now() - t0 < 3000) {
    await frame()
  }
  log.ms = content() && document.activeElement === content() ? Math.round(performance.now() - t0) : null
  log.madeAtOnce = log.ms !== null && log.ms < 1000
  await sleep(300)
  log.paletteClosed = !document.querySelector('.pal-row')
  log.onDisk = await disk(PATH)
  log.madeWhereTheNameSays = log.onDisk === '# palette-probe\n\n'

  // --- 3. in WRITE, named in the head, the caret under the name ---
  log.opensInWrite =
    Boolean(content()) &&
    content().getAttribute('contenteditable') === 'true' &&
    Boolean(pane(1)?.querySelector('[data-mode="WRITE"][data-on="1"]'))
  log.headSaysTheName = (title()?.textContent ?? '').trim() === 'palette-probe'
  // Named on the way in, so the title is done with: the caret goes to the words.
  log.caretNotInTitle = document.activeElement !== title()
  log.caretInBody = document.activeElement === content()
  // The heading is the head's, so the first line the editor draws is the body's
  // first — and that is where the caret is.
  const sel = window.getSelection()
  const top = lines()[0]
  log.caretOnFirstBodyLine = Boolean(top && sel?.anchorNode && top.contains(sel.anchorNode))
  // An empty page says what it is for, and stops saying it once it is not empty.
  log.saysStartWriting = (pane(1)?.querySelector('.cm-md-hint')?.textContent ?? '') === 'Start writing…'
  if (log.caretInBody) type('first words')
  await sleep(300)
  log.hintGoesWhenTyped = !pane(1)?.querySelector('.cm-md-hint')
  // The save pipeline is ~1.8s end to end; the disk is the truth after it.
  await sleep(2000)
  log.bodyAfterTyping = await disk(PATH)
  log.typedUnderTheHeading = log.bodyAfterTyping === '# palette-probe\n\nfirst words'

  // --- 4. and the index has it without a rebuild ---
  const hits = await window.lanes.searchNotes('palette-probe')
  log.findableAtOnce = hits.some((h) => h.path === PATH)
  // The rail is fed deferred values and may lag the pane by a render, so its
  // row is waited for rather than asked once.
  let row = null
  for (let i = 0; i < 15 && !row; i++) {
    row = document.querySelector(`[data-rail-row="note"][data-rail-id="${PATH}"]`)
    if (!row) await sleep(200)
  }
  log.hasItsRow = Boolean(row)

  log.pass =
    log.foundTheSeed &&
    log.offerNotFirst &&
    log.offerIsLast &&
    log.enterBelongsToTheFind &&
    log.offered &&
    log.madeAtOnce &&
    log.paletteClosed &&
    log.madeWhereTheNameSays &&
    log.opensInWrite &&
    log.headSaysTheName &&
    log.caretNotInTitle &&
    log.caretInBody &&
    log.caretOnFirstBodyLine &&
    log.saysStartWriting &&
    log.hintGoesWhenTyped &&
    log.typedUnderTheHeading &&
    log.findableAtOnce &&
    log.hasItsRow
  return log
})()
