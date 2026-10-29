// A new note goes where the setting says — the vault root out of the box,
// whatever Settings says after that — and a name carrying its own folder still
// overrides both.
//
// Held over both ways a note is made now. ⌘N makes one with no name at all,
// `untitled.md`, so the setting is the only thing deciding where it goes. ⌘K
// makes one by the name you typed, and there `folder/name` is still how you
// say somewhere else. Both used to go through the +'s naming field, which is
// gone: its placeholder was where the folder was stated before you typed, and
// the palette's offer row says it now — `in the vault root — or type
// folder/name`.
//
// Wants an EMPTY throwaway vault and a fresh LANES_STATE: it makes notes and
// reads back where they landed, and it sets the folder and puts it back. Run
// twice on one vault it goes red on purpose: its names are taken the second
// time, and last run's notes are not allowed to answer for this run's.
// See checks/README.md for how to run it.
(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
  const click = (el) => el && el.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  const key = (k, extra = {}) =>
    window.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, ...extra }))
  const set = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
  const setInput = (el, v) => {
    set.call(el, v)
    el.dispatchEvent(new Event('input', { bubbles: true }))
  }
  const body = async (p) => (await window.lanes.note(p))?.body ?? null
  /**
   * The nameless notes in `folder`, asked of the disk file by file. The note
   * list is the index, and a new note is grafted into it rather than rebuilt
   * into it — asking the list would be asking the thing that might lag.
   */
  const untitledIn = async (folder) => {
    // The app takes the first free slot, so a vault other checks have used can
    // hold a dozen of these already; 200 is far past that, one cheap read each.
    // The vault root is the folder named '' — its notes have no folder in front.
    const names = Array.from({ length: 200 }, (_, i) =>
      `${folder ? `${folder}/` : ''}${i === 0 ? 'untitled' : `untitled-${i + 1}`}.md`
    )
    const there = await Promise.all(names.map(async (p) => (await body(p)) !== null))
    return names.filter((_, i) => there[i])
  }
  /**
   * ⌘N, and where its note landed: the folder it was expected in is watched
   * and so is the one it should NOT be in, since a note in the wrong place is
   * the failure this check exists to see — and "not found" would hide it.
   */
  const nameless = async (expect, other) => {
    const was = await untitledIn(expect)
    const wasOther = await untitledIn(other)
    key('n', { metaKey: true })
    for (let i = 0; i < 20; i++) {
      await sleep(200)
      const here = (await untitledIn(expect)).find((p) => !was.includes(p))
      if (here) return here
      const there = (await untitledIn(other)).find((p) => !wasOther.includes(p))
      if (there) return there
    }
    return '(not found)'
  }
  /**
   * ⌘K, a name, and the offer to make it. Clicked rather than ↵'d: with
   * nothing found ↵ rests on the first row, which is the thread offer. Returns
   * what the offer row said about where it would go, and where the note is —
   * only a note that was not there before the click counts: a refused make
   * closes the palette too and says nothing on screen, and a same-named note
   * left by an earlier run would otherwise stand in for it.
   */
  const named = async (name) => {
    const before = new Set((await window.lanes.notesList()).map((n) => n.path))
    if (document.querySelector('[data-palette-input="1"]')) {
      key('Escape')
      await sleep(350)
    }
    key('k', { metaKey: true })
    await sleep(700)
    const box = document.querySelector('[data-palette-input="1"]')
    if (!box) return null
    setInput(box, name)
    await sleep(1100)
    const offer = [...document.querySelectorAll('.pal-row')].find((r) => /New note/.test(r.innerText))
    const says = (offer?.innerText ?? '').replace(/\s+/g, ' ').trim()
    click(offer)
    await sleep(1600)
    const file = `${name.split('/').pop()}.md`
    const notes = await window.lanes.notesList()
    const made = notes.find(
      (n) => !before.has(n.path) && (n.path === file || n.path.endsWith(`/${file}`))
    )
    return { says, path: made?.path ?? '(not found)' }
  }
  const log = {}
  await sleep(3000)

  // --- the default ---
  log.namelessPath = await nameless('', 'daily')
  log.namelessDefaultIsTheRoot = /^untitled(-\d+)?\.md$/.test(log.namelessPath)
  const a = await named('lands-at-the-root')
  log.offerSays = a?.says
  log.offerSaysWhere = /in the vault root/.test(a?.says ?? '')
  log.namedDefaultIsTheRoot = a?.path === 'lands-at-the-root.md'

  // --- a name with its own folder still wins ---
  const b = await named('reading/lands-where-told')
  log.ownFolderWins = b?.path === 'reading/lands-where-told.md'

  // --- and the setting decides the rest, set the way a person sets it ---
  // Under Notes & lanes, beside the other folder rules (it was under Interface).
  key(',', { metaKey: true })
  await sleep(600)
  click(document.querySelector('[data-settings-more]'))
  await sleep(800)
  click(document.querySelector('[data-settings-tab="threads"]'))
  await sleep(600)
  const folder = document.querySelector('input[placeholder="vault root"]')
  log.settingOffered = Boolean(folder)
  if (folder) {
    setInput(folder, 'daily')
    await sleep(600)
  }
  key('Escape')
  await sleep(700)
  log.settingsClosed = !document.querySelector('[data-settings-tab]')

  log.namelessBySettingPath = await nameless('daily', '')
  log.namelessFollowsTheSetting = /^daily\/untitled(-\d+)?\.md$/.test(log.namelessBySettingPath)
  const c = await named('lands-by-setting')
  log.offerFollowsTheSetting = /in daily/.test(c?.says ?? '')
  log.namedFollowsTheSetting = c?.path === 'daily/lands-by-setting.md'

  // --- and the name's own folder beats the setting too, not just the default ---
  const d = await named('reading/overrides-the-setting')
  log.ownFolderBeatsTheSetting = d?.path === 'reading/overrides-the-setting.md'

  await window.lanes.patchState({ newNoteFolder: '' })

  log.pass =
    log.namelessDefaultIsTheRoot &&
    log.offerSaysWhere &&
    log.namedDefaultIsTheRoot &&
    log.ownFolderWins &&
    log.settingOffered &&
    log.settingsClosed &&
    log.namelessFollowsTheSetting &&
    log.offerFollowsTheSetting &&
    log.namedFollowsTheSetting &&
    log.ownFolderBeatsTheSetting
  return log
})()
