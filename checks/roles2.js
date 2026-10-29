// The S2 review's confirmed defects, as assertions.
(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
  const click = (el, m) => el && el.dispatchEvent(new MouseEvent('click', { bubbles: true, metaKey: !!m }))
  const key = (k, shift) => window.dispatchEvent(
    new KeyboardEvent('keydown', { key: k, metaKey: true, shiftKey: !!shift, bubbles: true }))
  const paneOf = (i) => document.querySelector(`[data-pane="${i}"]`)
  const emptyPanes = () => [...document.querySelectorAll('[data-pane-empty]')]
  const tabsIn = (i) => {
    const p = paneOf(i)
    return p ? [...p.querySelectorAll('[data-tab="1"]')].length : 0
  }
  const log = {}
  await sleep(2600)

  // 1. The note pane boots EMPTY, not holding a stray chat.
  log.paneBEmptyAtBoot = emptyPanes().some((e) => e.getAttribute('data-pane-empty') === 'note')
    || !paneOf(1)

  // 2. ⌘T while the note pane has focus still puts the chat in pane A.
  const noteRow = document.querySelector('[data-rail-row="note"]')
  if (noteRow) { click(noteRow); await sleep(1400) }
  log.noteInB = tabsIn(1) > 0
  const beforeA = tabsIn(0), beforeB = tabsIn(1)
  key('t')
  await sleep(1000)
  log.cmdTAddedToA = tabsIn(0) === beforeA + 1
  log.cmdTLeftBAlone = tabsIn(1) === beforeB

  // 3. ⌘[ on an empty pane must not throw.
  let threw = null
  window.addEventListener('error', (e) => { threw = String(e.message) }, { once: true })
  key('[')
  await sleep(400)
  log.histNoThrow = threw === null

  // 4. Closing every tab leaves a real empty pane rather than refusing the last.
  //    ⌘W itself arrives as a menu-accelerator IPC and cannot be dispatched
  //    from the page, so this drives the ✕, which shares closeTabIn with it.
  for (let n = 0; n < 8; n++) {
    const x = paneOf(0) && paneOf(0).querySelector('[data-tab="1"] [data-x="1"]')
    if (!x) break
    click(x)
    await sleep(400)
  }
  log.cmdWClosesToEmpty = emptyPanes().some((e) => e.getAttribute('data-pane-empty') === 'chat')

  // 5. The empty thread pane offers rows and the ⌘K line.
  const chatEmpty = emptyPanes().find((e) => e.getAttribute('data-pane-empty') === 'chat')
  //    The line has been the `Search everything ⌘K` chip since the empty pane
  //    grew up, so the case is not the claim.
  log.emptyOffersSearch = chatEmpty ? /search everything/i.test(chatEmpty.innerText) : false
  log.emptyLabel = chatEmpty ? (chatEmpty.innerText.match(/STARRED|RECENT/) || [''])[0] : ''

  // 2's two fields stay recorded but out of the verdict: ⌘T has since come to
  // mean a new tab HERE, so from the note pane it is a note tab in B and no
  // thread at all — cmd-t-pane.js holds that. noteInB, its setup, still counts.
  log.pass = Boolean(
    log.paneBEmptyAtBoot &&
    log.noteInB &&
    log.histNoThrow &&
    log.cmdWClosesToEmpty &&
    log.emptyOffersSearch &&
    log.emptyLabel !== ''
  )
  return JSON.stringify(log, null, 1)
})()
