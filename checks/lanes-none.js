// NO LANES IS AN ANSWER — AND A LANE MADE LATER SHOWS WITHOUT A RELAUNCH.
//
// Lanes are the person's, kept in state, and a new install has none. With
// `lanes: []` nothing in the window may speak of lanes: the rail offers Recent
// and Folders but no Lanes, its rows and their titles name no lane (no
// UNASSIGNED, no UNATTACHED), the palette's thread rows name none, a thread
// row's menu has no MOVE TO LANE, and a thread's pane chip shows no lane —
// neither in its head nor in its tab's title.
//
// Then a lane arrives in state from outside the window's own patches — as a
// lane made in Settings, or by hand, would — and without a relaunch the rail
// offers Lanes again, and a thread that edited a note under `projects/garden`
// sits under GARDEN.
//
// Red before: the Lanes mode stood in the rail whatever the lanes were, every
// thread said UNASSIGNED or UNATTACHED, and the menu kept its MOVE TO LANE.
// Writes state (the lanes), so a fresh state directory; spends no turns.
;(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
  const click = (el, meta) => el && el.dispatchEvent(new MouseEvent('click', { bubbles: true, metaKey: !!meta }))
  const key = (k, meta) =>
    window.dispatchEvent(new KeyboardEvent('keydown', { key: k, metaKey: !!meta, bubbles: true, cancelable: true }))
  const rightClick = (el) => {
    if (!el) return
    const box = el.getBoundingClientRect()
    el.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: box.left + 8, clientY: box.bottom + 2 }))
  }
  const rail = () => document.querySelector('[data-rail="1"]')
  const rows = (kind) => [...document.querySelectorAll(`[data-rail-row="${kind}"]`)]
  /** A mode chip, by its word: a leaf of the rail that says only that. */
  const mode = (label) =>
    [...(rail()?.querySelectorAll('div') ?? [])].find((d) => d.children.length === 0 && d.textContent.trim() === label)
  /** What would be lane chrome, in the capitals the chrome sets lanes in. */
  const LANE_WORDS = /UNASSIGNED|UNATTACHED|MOVE TO LANE|GARDEN|KITCHEN/
  const until = async (ok, ms) => {
    for (let t = 0; t < ms; t += 250) {
      if (ok()) return true
      await sleep(250)
    }
    return ok()
  }
  const log = {}
  await sleep(2800)

  log.stateLanes = (await window.lanes.patchState({})).lanes ?? null

  // --- the rail ---
  log.modes = ['Recent', 'Lanes', 'Folders'].filter((m) => mode(m))
  log.noLanesMode = !mode('Lanes')
  log.threadRows = rows('chat').length
  // textContent, not innerText: what is written, whatever a style capitalises.
  const railText = rail()?.textContent ?? ''
  const rowTitles = [...(rail()?.querySelectorAll('[data-rail-row]') ?? [])].map((r) => r.title).join('\n')
  log.railQuiet = !LANE_WORDS.test(railText) && !LANE_WORDS.test(rowTitles)
  if (!log.railQuiet) log.railSaid = (railText.match(LANE_WORDS) ?? rowTitles.match(LANE_WORDS))?.[0]

  // --- the palette's threads ---
  key('k', true)
  await sleep(800)
  log.paletteOpened = Boolean(document.querySelector('[data-palette-input="1"]'))
  click(document.querySelector('[data-pal-seg="chats"]'))
  await sleep(700)
  const palThreads = [...document.querySelectorAll('[data-pal-kind="chat"]')]
  log.paletteThreads = palThreads.length
  log.paletteQuiet = !palThreads.some((r) => LANE_WORDS.test(r.textContent))
  if (!log.paletteQuiet) log.paletteSaid = palThreads.map((r) => r.textContent).find((t) => LANE_WORDS.test(t))
  key('Escape')
  await sleep(500)
  log.paletteClosed = !document.querySelector('[data-palette-input="1"]')

  // --- a thread row's menu ---
  const garden = () => rows('chat').find((r) => /spring beds/i.test(r.textContent))
  rightClick(garden() ?? rows('chat')[0])
  await sleep(500)
  const menu = document.querySelector('[data-ctx-menu="1"]')
  log.menuOpened = Boolean(menu)
  log.menuQuiet = !/MOVE TO LANE/i.test(menu?.textContent ?? document.body.textContent)
  // Closed the way a person closes it: a click beside it.
  click(menu?.parentElement)
  await sleep(400)

  // --- a thread pane's chip ---
  click(garden() ?? rows('chat')[0])
  await sleep(1500)
  const pane = document.querySelector('[data-pane="0"]')
  log.chip = pane?.querySelector('[data-place]')?.textContent ?? ''
  const tabTitles = [...(pane?.querySelectorAll('[data-tab]') ?? [])].map((t) => t.title).join('\n')
  log.chipQuiet = !LANE_WORDS.test(log.chip) && !LANE_WORDS.test(tabTitles)
  if (!log.chipQuiet) log.tabSaid = tabTitles

  const noneHalf =
    log.threadRows > 0 &&
    log.noLanesMode &&
    log.modes.join() === 'Recent,Folders' &&
    log.railQuiet &&
    log.paletteOpened &&
    log.paletteThreads > 0 &&
    log.paletteQuiet &&
    log.menuOpened &&
    log.menuQuiet &&
    log.chipQuiet

  // --- a lane, from outside the window's own patches ---
  await window.lanes.patchState({ lanes: [{ id: 'garden', name: 'Garden', folder: 'projects/garden' }] })
  log.lanesModeAppeared = await until(() => Boolean(mode('Lanes')), 6000)
  click(mode('Lanes'))
  await sleep(700)
  /** The thread titles under each band, in the rail's own order. */
  const bands = () => {
    const out = {}
    let at = null
    for (const r of rail()?.querySelectorAll('[data-rail-row]') ?? []) {
      const kind = r.getAttribute('data-rail-row')
      if (kind === 'group') {
        at = r.title
        out[at] = []
      } else if (kind === 'chat' && at !== null) out[at].push(r.textContent.trim())
    }
    return out
  }
  log.gardenHoldsIt = await until(() => (bands().GARDEN ?? []).some((t) => /spring beds/i.test(t)), 8000)
  log.bands = Object.keys(bands())
  log.underGarden = bands().GARDEN ?? null
  log.chipAfter = document.querySelector('[data-pane="0"] [data-place]')?.textContent ?? ''
  log.chipSaysGarden = log.chipAfter === 'GARDEN'

  log.pass = Boolean(noneHalf && log.lanesModeAppeared && log.gardenHoldsIt && log.chipSaysGarden)
  return JSON.stringify(log, null, 1)
})()
