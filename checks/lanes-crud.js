// LANES ARE MADE, NAMED, ORDERED AND TAKEN AWAY IN SETTINGS — AND THE RAIL
// FOLLOWS WITHOUT A RELAUNCH.
//
// Settings → Notes & lanes lists the lanes as `name · folder`. Add lane takes a
// name and one of the vault's folders, and the lane it makes has an id of its
// own — the name's slug and four random characters — that nothing later
// changes: renamed in place, Kitchen becomes Cooking under the id it had, so a
// thread moved into it stays moved. ↑ and ↓ order them, and the order in state
// is the rail's. × asks first, in the shape every costly question here has —
// Keep is the default and holds the focus, × pressed again closes the
// question, esc closes the question and not Settings, and the delete is a
// click on its own button — and the question says how many threads become
// unassigned, counting the ones a person moved there as well as the ones
// their notes put there. Deleting leaves laneOverrides as they were: a move
// naming a lane that is gone is ignored, never deleted. And with the last
// lane gone, the list offers one per top-level folder — not _templates, not a
// read-only folder — and "Use these" makes them all in one click.
//
// The sample's lanes are Garden (projects/garden) and Kitchen
// (projects/kitchen); the manifest's seed moves the Ada Lovelace thread, which
// no note files anywhere, into Garden, and one more into a lane that does not
// exist — so Garden holds three, and the overrides have something to keep.
//
// Red before: Settings had no lanes editor; lanes lived in the state file.
// Writes state, so a fresh LANES_STATE; spends no turns.
;(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
  const click = (el) => el && el.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  const key = (k, opts = {}) =>
    window.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...opts }))
  /** Esc where a real one goes: to what has the focus. */
  const esc = () =>
    (document.activeElement ?? document.body).dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
    )
  const set = (el, v) => {
    if (!el) return
    const proto =
      el instanceof HTMLSelectElement
        ? window.HTMLSelectElement
        : el instanceof HTMLTextAreaElement
          ? window.HTMLTextAreaElement
          : window.HTMLInputElement
    Object.getOwnPropertyDescriptor(proto.prototype, 'value').set.call(el, v)
    el.dispatchEvent(new Event(el instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true }))
  }
  const q = (sel) => document.querySelector(sel)
  const state = async () => (await window.lanes.bootstrap()).state
  const until = async (ok, ms) => {
    for (let t = 0; t < ms; t += 250) {
      if (await ok()) return true
      await sleep(250)
    }
    return ok()
  }
  const rail = () => q('[data-rail="1"]')
  /** A mode chip, by its word: a leaf of the rail that says only that. */
  const mode = (label) =>
    [...(rail()?.querySelectorAll('div') ?? [])].find((d) => d.children.length === 0 && d.textContent.trim() === label)
  /**
   * The rail's bands in its own order: name → { the count it says, the ids of
   * the threads under it }. Ids, not a row's text: that ends in the thread's
   * age, which moves on between two looks.
   */
  const bands = () => {
    const out = new Map()
    let at = null
    for (const r of rail()?.querySelectorAll('[data-rail-row]') ?? []) {
      const kind = r.getAttribute('data-rail-row')
      if (kind === 'group' && r.title && !/ more$/.test(r.title)) {
        at = r.title
        out.set(at, { count: Number((r.textContent.match(/(\d+)\s*$/) ?? [])[1] ?? NaN), threads: [] })
      } else if (kind === 'chat' && at !== null) out.get(at).threads.push(r.getAttribute('data-rail-id'))
    }
    return out
  }
  const order = () => [...bands().keys()]
  const editor = () => q('[data-lanes-editor="1"]')
  const row = (id) => q(`[data-lane-row="${id}"]`)
  const ask = () => q('[data-lane-ask]')
  const yes = () => q('[data-lane="yes"]')
  const keep = () => q('[data-lane="keep"]')
  const settingsOpen = () => Boolean(q('[data-settings-tab]'))
  const openSettings = async () => {
    if (settingsOpen()) return
    key(',', { metaKey: true })
    await sleep(600)
    click(q('[data-settings-more="1"]'))
    await sleep(600)
    click(q('[data-settings-tab="threads"]'))
    await sleep(400)
  }
  /** The sample's threads this asks after: one no note files (the seed moves it to Garden), and one in reading/. */
  const ADA = '5a3e0004-0000-4000-8000-000000000004'
  const READING_LIST = '5a3e0005-0000-4000-8000-000000000005'
  const log = {}
  await sleep(2800)

  const before = await state()
  log.startLanes = before.lanes.map((l) => `${l.id}:${l.name}:${l.folder}`)
  const overridesBefore = JSON.stringify(before.laneOverrides)
  log.overridesBefore = before.laneOverrides

  click(mode('Lanes'))
  await sleep(700)
  log.railBefore = order()

  await openSettings()
  log.editorThere = Boolean(editor())
  if (!log.editorThere) {
    log.why = 'no lanes editor in Settings → Notes & lanes'
    log.pass = false
    return JSON.stringify(log, null, 1)
  }
  log.rowsSay = [...editor().querySelectorAll('[data-lane-row]')].map(
    (r) => `${r.querySelector('[data-lane-name]')?.value} ${r.innerText.replace(/\s+/g, ' ').trim()}`
  )

  // --- add: a name and one of the vault's folders ---
  const folderPick = q('[data-lane-new="folder"]')
  log.foldersOffered = [...(folderPick?.options ?? [])].map((o) => o.value).filter(Boolean)
  log.offersTopAndSecond =
    log.foldersOffered.includes('reading') && log.foldersOffered.includes('projects/garden')
  set(q('[data-lane-new="name"]'), 'Reading')
  set(folderPick, 'reading')
  await sleep(200)
  click(q('[data-lane-add="1"]'))
  await until(async () => (await state()).lanes.some((l) => l.name === 'Reading'), 3000)
  const added = (await state()).lanes.find((l) => l.name === 'Reading')
  log.added = added ?? null
  log.addedAsSaid =
    Boolean(added) && /^reading-[a-z0-9]{4}$/.test(added.id) && added.folder === 'reading' && Object.keys(added).length === 3
  log.addedLast = (await state()).lanes.at(-1)?.name === 'Reading'
  log.railShowsReading = await until(() => order().includes('READING'), 5000)
  // The winter reading list read a note in reading/, so main re-files it there.
  log.readingHoldsItsThread = await until(
    () => (bands().get('READING')?.threads ?? []).includes(READING_LIST),
    5000
  )

  // --- rename in place: the id stays ---
  const kitchen = row('kitchen')?.querySelector('[data-lane-name]')
  set(kitchen, 'Cooking')
  kitchen?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))
  await until(async () => (await state()).lanes.some((l) => l.name === 'Cooking'), 3000)
  const renamed = (await state()).lanes.find((l) => l.id === 'kitchen')
  log.renamed = renamed ?? null
  log.renamedSameId = renamed?.name === 'Cooking' && renamed?.folder === 'projects/kitchen'
  log.railShowsCooking = await until(() => order().includes('COOKING') && !order().includes('KITCHEN'), 5000)
  log.settingsStillOpen = settingsOpen()

  // --- reorder: Reading up one ---
  const orderBefore = (await state()).lanes.map((l) => l.name)
  click(row(added?.id)?.querySelector('[data-lane-up]'))
  await until(async () => (await state()).lanes.map((l) => l.name).join() !== orderBefore.join(), 3000)
  log.stateOrder = (await state()).lanes.map((l) => l.name)
  log.reordered = log.stateOrder.join() === 'Garden,Reading,Cooking'
  log.railFollows = await until(() => order().slice(0, 3).join() === 'GARDEN,READING,COOKING', 5000)
  log.railOrder = order()
  log.firstCannotGoUp = row('garden')?.querySelector('[data-lane-up]')?.getAttribute('aria-disabled') === 'true'

  // --- delete: the question, first ---
  const garden = bands().get('GARDEN')
  log.gardenInRail = garden ?? null
  const gardenThreads = garden?.threads ?? []
  log.gardenHoldsTheMovedOne = gardenThreads.includes(ADA)
  const unattachedBefore = bands().get('UNATTACHED')?.count ?? 0
  const x = () => row('garden')?.querySelector('[data-lane-x]')
  click(x())
  await sleep(250)
  log.asks = Boolean(ask())
  log.says = ask()?.innerText.replace(/\s+/g, ' ').trim() ?? null
  const n = garden?.count
  log.saysTheCount =
    Number.isFinite(n) &&
    n >= 3 &&
    new RegExp(`${n} threads are filed in Garden; they become unassigned\\.`).test(log.says ?? '')
  log.keepFocused = Boolean(keep()) && document.activeElement === keep()
  log.notYet = (await state()).lanes.some((l) => l.id === 'garden')

  // --- × again closes it ---
  click(x())
  await sleep(250)
  log.xAgainCloses = !ask() && (await state()).lanes.some((l) => l.id === 'garden')

  // --- esc closes the question, not Settings ---
  click(x())
  await sleep(250)
  const opened = Boolean(ask())
  esc()
  await sleep(250)
  log.escClosesOnlyTheQuestion = opened && !ask() && settingsOpen() && (await state()).lanes.some((l) => l.id === 'garden')

  // --- Keep keeps ---
  click(x())
  await sleep(250)
  click(keep())
  await sleep(250)
  log.keepKeeps = !ask() && (await state()).lanes.some((l) => l.id === 'garden')

  // --- delete is a click on its own button ---
  click(x())
  await sleep(250)
  click(yes())
  await until(async () => !(await state()).lanes.some((l) => l.id === 'garden'), 3000)
  const after = await state()
  log.lanesAfter = after.lanes.map((l) => `${l.id}:${l.name}:${l.folder}`)
  log.deleted = !ask() && !after.lanes.some((l) => l.id === 'garden') && after.lanes.length === 2
  log.overridesAfter = after.laneOverrides
  log.overridesUntouched = JSON.stringify(after.laneOverrides) === overridesBefore
  log.railLosesGarden = await until(() => !order().includes('GARDEN'), 5000)
  await sleep(500)
  const unattached = bands().get('UNATTACHED')
  log.unattachedAfter = unattached ?? null
  log.gardenThreadsUnassigned =
    gardenThreads.length > 0 &&
    gardenThreads.every((t) => (unattached?.threads ?? []).includes(t)) &&
    unattached?.count === unattachedBefore + gardenThreads.length

  // --- none left: one lane per top-level folder, offered ---
  for (const l of after.lanes) {
    click(row(l.id)?.querySelector('[data-lane-x]'))
    await sleep(250)
    click(yes())
    await sleep(400)
  }
  await until(async () => (await state()).lanes.length === 0, 3000)
  const offer = () => q('[data-lane-suggest="1"]')
  log.suggests = offer()?.innerText.replace(/\s+/g, ' ').trim() ?? null
  // The sample's top-level folders, less _templates and the read-only inbox.
  log.suggestsTheFolders = /daily · links · people · projects · reading/.test(log.suggests ?? '')
  click(q('[data-lane-suggest-use="1"]'))
  await until(async () => (await state()).lanes.length > 0, 3000)
  const made = (await state()).lanes
  log.made = made.map((l) => `${l.id}:${l.name}:${l.folder}`)
  log.madeOnePerFolder =
    made.map((l) => `${l.name}:${l.folder}`).join() ===
      'Daily:daily,Links:links,People:people,Projects:projects,Reading:reading' &&
    made.every((l) => new RegExp(`^${l.folder}-[a-z0-9]{4}$`).test(l.id))
  log.offerGone = !offer()
  log.railShowsThem = await until(() => order().slice(0, 5).join() === 'DAILY,LINKS,PEOPLE,PROJECTS,READING', 5000)

  log.pass = Boolean(
    log.offersTopAndSecond &&
      log.addedAsSaid &&
      log.addedLast &&
      log.railShowsReading &&
      log.readingHoldsItsThread &&
      log.renamedSameId &&
      log.railShowsCooking &&
      log.settingsStillOpen &&
      log.reordered &&
      log.railFollows &&
      log.firstCannotGoUp &&
      log.gardenHoldsTheMovedOne &&
      log.asks &&
      log.saysTheCount &&
      log.keepFocused &&
      log.notYet &&
      log.xAgainCloses &&
      log.escClosesOnlyTheQuestion &&
      log.keepKeeps &&
      log.deleted &&
      log.overridesUntouched &&
      log.railLosesGarden &&
      log.gardenThreadsUnassigned &&
      log.suggestsTheFolders &&
      log.madeOnePerFolder &&
      log.offerGone &&
      log.railShowsThem
  )
  return JSON.stringify(log, null, 1)
})()
