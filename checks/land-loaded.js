// A TAB YOU LAND ON IS LOADED, however you landed on it.
//
// A restored tab carries its title and nothing else; its transcript or its note
// is read when it reaches the front. "Reaches the front" used to mean one thing
// only — the click — and six things move the selection. Close a tab, close the
// others, trash a note out from under one, quote into a chat, open something
// already open: five of those left an unread tab in front of you, showing
// `opening…` and staying there.
//
// It looked like a tab that needed a trip away and back before it would load.
// It did: the trip away was doing the loading, because clicking was the only
// route that asked. Nothing was wrong with the tab; nothing had ever asked.
//
// RUN IT TWICE, against the same throwaway LANES_VAULT and LANES_STATE. An
// unread tab is a RESTORED one — every tab opened inside a session was opened
// by being landed on — so the first pass fills the strip and says so, and the
// second pass, which starts from the state file, is the check. (`location
// .reload()` cannot stand in for the relaunch: it destroys the very context
// this script is running in.)
//
// Wants a throwaway vault of half a dozen notes. See checks/README.md.
;(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
  const click = (el, mods = {}) =>
    el && el.dispatchEvent(new MouseEvent('click', { bubbles: true, ...mods }))
  const ctx = (el) =>
    el &&
    el.dispatchEvent(
      new MouseEvent('contextmenu', { bubbles: true, clientX: 300, clientY: 300 })
    )
  const down = (el) => el && el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
  const pane = () => document.querySelector('[data-pane="1"]')
  const strip = () => pane()?.querySelector('[data-tabstrip]')
  const tabs = () => (strip() ? [...strip().querySelectorAll('[data-tab]')] : [])
  const activeTab = () => tabs().find((t) => t.getAttribute('data-tab-on') === '1')
  const nameOf = (t) => (t?.innerText ?? '').replace(/×$/, '').trim()
  const noteRows = () => [...document.querySelectorAll('[data-rail-row="note"]')]
  /*
   * A note tab with nothing read into it draws a placeholder INSTEAD of the
   * document, so the document's own scroll scope is absent entirely. That is
   * the state this check is about, and it is what `loaded` is false for.
   */
  const body = () => pane()?.querySelector('[data-find-scope]')
  const loaded = () => Boolean(body()) && (body().innerText ?? '').trim().length > 15
  const log = {}
  await sleep(3000)

  /* ---------- pass one: fill the strip, and stop ---------- */

  if (tabs().length < 4) {
    const rows = noteRows().slice(0, 5)
    for (const r of rows) {
      click(r, { metaKey: true })
      await sleep(500)
    }
    // A moment for the tab shape to reach the state file, which is what the
    // next launch restores from.
    await sleep(1500)
    return JSON.stringify({
      pass: null,
      seeded: tabs().length,
      note: 'strip filled — run the same command again, and that run is the check'
    })
  }

  /* ---------- pass two: these tabs were restored, so none has been read ---- */

  log.restoredTabs = tabs().length
  // The one in front is read on arrival — it always was, and it is the control:
  // if this is false the check is measuring the wrong thing.
  log.frontTabLoadedOnItsOwn = loaded()
  log.frontTabIs = nameOf(activeTab())

  /* ---------- 1. land on an unread tab by CLOSING ---------- */

  const before = nameOf(activeTab())
  click(activeTab()?.querySelector('[data-x]'))
  await sleep(1800)
  log.landedOn = nameOf(activeTab())
  log.selectionMoved = log.landedOn !== before
  log.bodyAfterClose = (body()?.innerText ?? '').replace(/\s+/g, ' ').slice(0, 60)
  log.loadedAfterClose = loaded()

  /* ---------- 2. and again, by CLOSE OTHERS ---------- */

  // A tab that is NOT in front, so the one kept is still unread. Right-clicking
  // does not select, which is what makes this the same case again.
  const other = tabs().find((t) => t.getAttribute('data-tab-on') !== '1')
  const keptName = nameOf(other)
  log.willKeep = keptName
  ctx(other)
  await sleep(700)
  const item = [...document.querySelectorAll('div')].find(
    (d) => d.textContent.trim() === 'Close others' && d.children.length === 0
  )
  log.offeredCloseOthers = Boolean(item)
  down(item)
  await sleep(1800)
  log.tabsAfterCloseOthers = tabs().length
  log.nowInFront = nameOf(activeTab())
  log.keptTheRightOne = Boolean(keptName) && log.nowInFront.startsWith(keptName.slice(0, 6))
  log.bodyAfterCloseOthers = (body()?.innerText ?? '').replace(/\s+/g, ' ').slice(0, 60)
  log.loadedAfterCloseOthers = loaded()

  log.pass =
    log.restoredTabs >= 4 &&
    log.frontTabLoadedOnItsOwn &&
    log.selectionMoved &&
    log.loadedAfterClose &&
    log.offeredCloseOthers &&
    log.keptTheRightOne &&
    log.loadedAfterCloseOthers
  return JSON.stringify(log, null, 1)
})()
