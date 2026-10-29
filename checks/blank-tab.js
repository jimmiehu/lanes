// ⌘T in the note pane opens a BLANK TAB — the empty surface with a strip above
// it: start a new note, search for one, or take one of the recent four. No
// document chrome, since there is no document yet. Whatever you pick replaces
// the blank tab in place, because the tab was a question and that is its
// answer.
//
// The New note chip used to open a naming field. It now makes the note at once
// — `untitled.md` in the new-note folder, opened in WRITE with the caret in the
// head's empty title — and that note is what takes the blank tab's place. The
// chip is the empty note pane's too (one surface, drawn by both), and it is the
// one nameless route `jot.js` does not drive; jot holds ⌘N and the +, timed.
//
// Seeds its own notes through the app's IPC. Run against a LANES_VAULT and a
// LANES_STATE that are new for every run, not merely throwaway: it makes
// `blank-tab-anchor.md` by name, and on a second run that name is taken, the
// make is refused and nothing opens. It also expects the new-note folder to be
// the default. See checks/README.md for how to run it.
(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
  // One animation frame — or 50ms, if the window is not being painted and the
  // frame never comes, so a hidden window slows the check rather than hangs it.
  const frame = () =>
    new Promise((r) => {
      requestAnimationFrame(() => r())
      setTimeout(r, 50)
    })
  const click = (el) => el && el.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  const key = (k, extra = {}) =>
    window.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, ...extra }))
  const cmdT = () => key('t', { metaKey: true })
  const pane = (i) => document.querySelector(`[data-pane="${i}"]`)
  const tabs = (i) => [...(pane(i)?.querySelectorAll('[data-tab]') ?? [])]
  const labels = (i) => tabs(i).map((t) => t.textContent.replace(/×$/, '').trim())
  const onTab = (i) =>
    (pane(i)?.querySelector('[data-tab-on="1"]')?.textContent ?? '').replace(/×$/, '').trim()
  const surface = () => document.querySelector('[data-empty-body="note"]')
  const chip = (re) =>
    [...(surface()?.querySelectorAll('div') ?? [])].find(
      (d) => re.test(d.innerText.trim()) && d.style.cursor === 'pointer'
    )
  const content = () => pane(1)?.querySelector('.cm-content')
  const title = () => pane(1)?.querySelector('[data-note-title]')
  const titleFocused = () => {
    const a = document.activeElement
    return Boolean(a?.matches?.('[data-note-title]') && pane(1)?.contains(a))
  }
  // A question needs somewhere to type its answer: a field with the caret in
  // it, or a menu. Looked for by what it does rather than by the old naming
  // field's attribute, which is gone from the app and so could never be found.
  // A field that flashes up and is dismissed is still a question the chip was
  // meant to have stopped asking.
  // A field that ASKS: the + menu, or an input or textarea with the caret in it.
  // Not the invisible holder the typing waits in while the note is made
  // (`lib/typeAhead.ts`) — it asks nothing, and is gone before the note is.
  const naming = () =>
    Boolean(
      document.querySelector('[data-new-menu]') ||
        (document.activeElement?.matches?.('input, textarea') &&
          !document.activeElement.matches('[data-type-ahead]'))
    )
  const setInput = (el, v) => {
    const d = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
    d.call(el, v)
    el.dispatchEvent(new Event('input', { bubbles: true }))
  }
  const body = async (p) => (await window.lanes.note(p))?.body ?? null
  // Where ⌘N puts a nameless note out of the box: the vault root.
  const FOLDER = ''
  /** The nameless notes on disk, asked of each file rather than of the index. */
  const untitledOnDisk = async () => {
    // The app takes the first free slot, so a vault other checks have used can
    // hold a dozen of these already; 200 is far past that, one cheap read each.
    const names = Array.from({ length: 200 }, (_, i) =>
      `${FOLDER ? `${FOLDER}/` : ''}${i === 0 ? 'untitled' : `untitled-${i + 1}`}.md`
    )
    const there = await Promise.all(names.map(async (p) => (await body(p)) !== null))
    return names.filter((_, i) => there[i])
  }
  const log = {}
  await sleep(2500)

  // Two notes for the recent list to offer, neither of them open — picking one
  // that is already in a tab only brings that tab forward, which would leave
  // the blank tab standing and prove nothing about "in place".
  const SEEDS = ['Blank tab seed one', 'Blank tab seed two']
  for (const name of SEEDS) {
    const made = await window.lanes.noteCreate(name, FOLDER)
    if (made?.path) await window.lanes.noteWrite(made.path, `# ${name}\n\nA note to be offered.\n`)
  }

  // A note open first, so the pane has a tab and the blank one is an addition.
  // Made by name through ⌘K, which is also what brings the app's note list up
  // to date — the recent four are read from it, and notes seeded behind the
  // app's back are otherwise not in it until the sweep, up to 30s later.
  key('k', { metaKey: true })
  await sleep(700)
  const box = document.querySelector('[data-palette-input="1"]')
  if (box) setInput(box, 'blank-tab-anchor')
  await sleep(1100)
  click([...document.querySelectorAll('.pal-row')].find((r) => /New note/.test(r.innerText)))
  await sleep(1600)
  const before = tabs(1).length
  log.noteOpen = before > 0 && /blank-tab-anchor/.test(onTab(1))

  // --- ⌘T: a blank tab, showing the empty surface ---
  const threadTabs = tabs(0).length
  cmdT()
  await sleep(800)
  log.tabAdded = tabs(1).length === before + 1
  log.tabIsLastAndNamed = labels(1)[labels(1).length - 1] === 'New note'
  log.showsTheEmptySurface = Boolean(surface())
  const text = surface()?.innerText ?? ''
  log.saysWhatThePaneIsFor = /NOTE PANE/.test(text) && /always open here/.test(text)
  log.offersANewNote = Boolean(chip(/^New note/))
  log.offersSearch = Boolean(chip(/^Search everything/))
  log.offersTheRecentList = /RECENT|STARRED/.test(text)
  log.recentRows = surface()?.querySelectorAll('[data-empty-row="1"]').length ?? 0
  // No document chrome: a blank tab has no note to write in, title, or switch
  // between WRITE and READ — and no composer, which is what a note-kind tab
  // falling through to the chat branch once drew under its NOTE chip.
  log.noDocumentChrome = !pane(1)?.querySelector('.cm-content, [data-note-title], [data-mode], textarea')
  log.noThreadWasMade = tabs(0).length === threadTabs

  // --- a recent row replaces the blank tab in place ---
  const row = [...(surface()?.querySelectorAll('[data-empty-row="1"]') ?? [])].find((r) =>
    SEEDS.includes(r.getAttribute('title'))
  )
  log.recentOffersASeed = Boolean(row)
  const wanted = row?.getAttribute('title') ?? ''
  click(row)
  await sleep(1200)
  log.wanted = wanted
  log.pickedLabels = labels(1)
  log.pickedInPlace = tabs(1).length === before + 1 && !labels(1).includes('New note')
  // The strip truncates a long title; compare on the head of it.
  const picked = onTab(1).replace(/…$/, '').trim()
  log.pickedIsThatNote = picked.length > 3 && wanted.startsWith(picked)
  log.surfaceGone = !surface()

  // --- New note from the blank tab: made at once, and it takes the tab's place ---
  cmdT()
  await sleep(800)
  const withBlank = tabs(1).length
  log.secondBlankTab = Boolean(surface())
  const was = await untitledOnDisk()
  let asked = false
  const t0 = performance.now()
  click(chip(/^New note/))
  while (!titleFocused() && performance.now() - t0 < 3000) {
    await frame()
    if (naming()) asked = true
  }
  log.chipMs = titleFocused() ? Math.round(performance.now() - t0) : null
  await sleep(300)
  log.chipAsksNothing = !asked && !naming()
  let made = null
  for (let i = 0; i < 15 && !made; i++) {
    made = (await untitledOnDisk()).find((p) => !was.includes(p)) ?? null
    if (!made) await sleep(200)
  }
  log.madePath = made
  log.chipMadeANote = Boolean(made)
  log.madeInPlace = tabs(1).length === withBlank && !labels(1).includes('New note')
  // A nameless note is called by its filename, dashes read as spaces:
  // `untitled-2.md` is "untitled 2" on its tab.
  log.madeIsTheFrontTab = /^untitled( \d+)?$/i.test(onTab(1))
  log.madeSurfaceGone = !surface()
  // Ready to write, and ready means the caret is where the next keystroke
  // belongs: in the title, which is empty and says so.
  log.madeInWrite =
    Boolean(content()) && Boolean(pane(1)?.querySelector('[data-mode="WRITE"][data-on="1"]'))
  log.caretInTitle = titleFocused()
  log.titleEmpty = (title()?.textContent ?? 'missing').trim() === ''
  log.saysUntitled = title()?.getAttribute('data-placeholder') === 'Untitled'

  log.pass =
    log.noteOpen &&
    log.tabAdded &&
    log.tabIsLastAndNamed &&
    log.showsTheEmptySurface &&
    log.saysWhatThePaneIsFor &&
    log.offersANewNote &&
    log.offersSearch &&
    log.offersTheRecentList &&
    log.recentRows > 0 &&
    log.noDocumentChrome &&
    log.noThreadWasMade &&
    log.recentOffersASeed &&
    log.pickedInPlace &&
    log.pickedIsThatNote &&
    log.surfaceGone &&
    log.secondBlankTab &&
    log.chipAsksNothing &&
    log.chipMadeANote &&
    log.madeInPlace &&
    log.madeIsTheFrontTab &&
    log.madeSurfaceGone &&
    log.madeInWrite &&
    log.caretInTitle &&
    log.titleEmpty &&
    log.saysUntitled
  return log
})()
