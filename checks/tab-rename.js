// Right-clicking a tab offers Rename…, and it renames the thing — including
// from a tab you are not currently in. A note's tab offers it too now; what
// that does to the file is checks/note-ops.js.
// See checks/README.md for how to run it.
(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
  const pane = (i = 0) => document.querySelector(`[data-pane="${i}"]`)
  const tabs = (i = 0) => [...(pane(i)?.querySelectorAll('[data-tab]') ?? [])]
  const labels = (i = 0) => tabs(i).map((t) => t.textContent.replace(/×$/, '').trim())
  const activeAt = (i = 0) => tabs(i).findIndex((t) => t.getAttribute('data-tab-on') === '1')
  const field = () => document.querySelector('[data-rename="1"]')
  const click = (el, meta) =>
    el && el.dispatchEvent(new MouseEvent('click', { bubbles: true, metaKey: !!meta }))
  const rightClick = (el) => {
    const box = el.getBoundingClientRect()
    el.dispatchEvent(
      new MouseEvent('contextmenu', {
        bubbles: true,
        clientX: box.left + 8,
        clientY: box.bottom + 2
      })
    )
  }
  // The menu's items act on mousedown, not click.
  const item = (text) =>
    [...document.querySelectorAll('div')].find((d) => d.innerText.trim() === text)
  const press = (el) => el && el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
  const set = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
  const log = {}
  await sleep(2800)

  // Two threads, so there is a tab that is not the active one.
  const rows = [...document.querySelectorAll('[data-rail-row="chat"]')].slice(0, 2)
  for (const r of rows) {
    click(r, true)
    await sleep(800)
  }
  log.strip = labels()
  log.twoTabs = tabs().length >= 2
  // The second is long enough to open past its own head (checks/sample-threads.mjs
  // makes it so); on a thread that fits, the field is on screen whatever the
  // app does, and fieldOnScreen below would pass on nothing.
  log.openedPastItsHead = [...(pane()?.querySelectorAll('div') ?? [])].some(
    (d) => d.scrollTop > 0 && d.scrollHeight > d.clientHeight
  )

  // --- the active tab ---
  rightClick(tabs()[tabs().length - 1])
  await sleep(400)
  log.offersRename = Boolean(item('Rename…'))
  press(item('Rename…'))
  // Straight away, inside the window the field guards: this is the tail of the
  // opening click, which is what a person actually produces — the 600ms wait
  // this used to do was a blur no click could make.
  await sleep(120)
  log.fieldOpened = Boolean(field())
  field()?.blur()
  await sleep(250)
  log.survivesTheOpeningBlur = Boolean(field())
  // Focus proven by use rather than by identity: type, and see it land.
  document.execCommand('insertText', false, 'Z')
  await sleep(200)
  log.tookItsFocusBack = /Z/.test(field()?.value ?? '')

  await sleep(400)
  log.fieldHasTitle = field()?.value?.length > 0
  log.fieldTakesCaret = document.activeElement === field()
  // A transcript opens at its live edge, so the head it lives in has scrolled
  // away — the field has to be on screen, not merely mounted.
  if (field()) {
    const f = field().getBoundingClientRect()
    const box = pane().getBoundingClientRect()
    log.fieldOnScreen = f.height > 0 && f.top >= box.top - 1 && f.bottom <= box.bottom + 1
  }

  // The blur that the opening click's own tail causes must not close it: this
  // is what made renaming look like it did nothing at all.
  const NAME = 'Renamed from the tab'
  if (field()) {
    set.call(field(), NAME)
    field().dispatchEvent(new Event('input', { bubbles: true }))
    field().dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    await sleep(800)
  }
  log.tabRenamed = labels()[labels().length - 1] === NAME
  log.fieldClosed = !field()
  // The name is the thread's, not the tab's: the rail says so too.
  log.railAgrees = [...document.querySelectorAll('[data-rail-row="chat"]')].some((r) =>
    r.innerText.startsWith(NAME)
  )

  // --- a tab you are not in ---
  click(tabs()[tabs().length - 1])
  await sleep(400)
  const other = 0
  rightClick(tabs()[other])
  await sleep(400)
  press(item('Rename…'))
  await sleep(600)
  log.selectsThatTabFirst = activeAt() === other
  log.fieldOnTheRightTab = field()?.value === labels()[other]
  if (field()) {
    field().dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    await sleep(400)
  }
  log.escCancels = !field()

  /*
   * NOT CHECKED HERE: that clicking away commits. Chromium dispatches focus
   * events only while the window itself is focused, and these scripts run with
   * the terminal in front — `blur()` moves `document.activeElement` and fires
   * nothing at all, native listener on the input included. A check that cannot
   * produce the event cannot assert what the event does. ↵ and esc below are
   * keyboard, and answer regardless.
   */

  // --- a note's tab offers it as well: same field, another thing underneath ---
  const note = document.querySelector('[data-rail-row="note"]')
  click(note)
  await sleep(1500)
  const noteTabs = tabs(1)
  log.noteTabFound = noteTabs.length > 0
  if (noteTabs.length) {
    rightClick(noteTabs[noteTabs.length - 1])
    await sleep(400)
    log.noteMenuOpened = Boolean(item('Pin tab') || item('Unpin tab'))
    log.noteTabOffersRename = Boolean(item('Rename…'))
    press(item('Rename…'))
    await sleep(700)
    log.noteFieldOpens = Boolean(field())
    if (field()) {
      field().dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
      await sleep(300)
    }
  }

  // Two tabs, or "a tab you are not in" is the one you are in. The note half
  // follows the header above, not the README's older "not offered it".
  log.pass = Boolean(
    log.twoTabs &&
      log.offersRename &&
      log.fieldOpened &&
      log.survivesTheOpeningBlur &&
      log.tookItsFocusBack &&
      log.fieldHasTitle &&
      log.fieldTakesCaret &&
      log.openedPastItsHead &&
      log.fieldOnScreen &&
      log.tabRenamed &&
      log.fieldClosed &&
      log.railAgrees &&
      log.selectsThatTabFirst &&
      log.fieldOnTheRightTab &&
      log.escCancels &&
      log.noteTabFound &&
      log.noteMenuOpened &&
      log.noteTabOffersRename &&
      log.noteFieldOpens
  )
  return JSON.stringify(log, null, 1)
})()
