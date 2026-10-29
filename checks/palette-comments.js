// EVERY OPEN COMMENT, FROM ⌘K.
//
// The note index gathers open comments the way it gathers open tasks, and ⌘K
// has a COMMENTS filter beside TASKS: a row per comment, what it says, and under
// it its note and what it is about. With nothing typed, every one of them;
// typed, the ones whose words, anchor or note match — and in ALL, once
// something is typed, a comment row among the others. ↵ opens the note at the
// comment: scrolled to it, its anchor lit for a moment. And the row offers the
// note's pass: ⇧↵ goes through that note's comments, as the footer says.
//
// Seeds its own notes; wants a throwaway LANES_VAULT and LANES_STATE, and the
// `slow` stand-in CLI for the pass it starts. Red at the commit before: no
// COMMENTS filter.
;(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
  const key = (k, extra = {}) =>
    window.dispatchEvent(new KeyboardEvent('keydown', { key: k, metaKey: true, bubbles: true, cancelable: true, ...extra }))
  const press = (k, extra = {}) =>
    window.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...extra }))
  const flat = (s) => (s ?? '').replace(/\s+/g, ' ').trim()
  const notePane = () => [...document.querySelectorAll('[data-pane]')].find((p) => p.querySelector('[data-mode]'))
  const threadPane = () => document.querySelector('[data-pane="0"]')
  const rows = () => [...document.querySelectorAll('.pal-row')]
  const commentRows = () => rows().filter((r) => r.dataset.palKind === 'comment')
  const input = () => document.querySelector('[data-palette-input]')
  const ask = async (q) => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input(), q)
    input().dispatchEvent(new Event('input', { bubbles: true }))
    await sleep(500)
  }
  const waitFor = async (test, ms = 8000) => {
    for (let t = 0; t < ms && !(await test()); t += 150) await sleep(150)
    return Boolean(await test())
  }
  const log = {}
  await sleep(1500)

  const stamp = Date.now().toString(36)
  const ONE = `Comments one ${stamp}`
  const TWO = `Comments two ${stamp}`
  // A long note, its comment near the end: landing on it has to scroll.
  const filler = Array.from({ length: 70 }, (_, i) => `Paragraph ${i + 1} of the background, which says nothing anyone will comment on.`)
  const BODY_ONE = [
    `# ${ONE}`,
    '',
    'The plan rests on {==crop rotation==}{>>define this before first use?<<} as its frame.',
    '',
    ...filler.flatMap((l) => [l, '']),
    `And {==the last clause==}{>>is this still true ${stamp}?<<} closes it.`,
    ''
  ].join('\n')
  const BODY_TWO = [`# ${TWO}`, '', `Seed comes from three suppliers{>>which three? ${stamp}<<}, weighted by plot size.`, ''].join('\n')
  const a = await window.lanes.noteCreate(ONE, '_unfiled')
  const b = await window.lanes.noteCreate(TWO, '_unfiled')
  await window.lanes.noteWrite(a.path, BODY_ONE)
  await window.lanes.noteWrite(b.path, BODY_TWO)
  await sleep(600)

  /* ---------- the filter: every open comment, with nothing typed ---------- */

  key('k')
  await sleep(600)
  const seg = document.querySelector('[data-pal-seg="comments"]')
  log.hasTheFilter = Boolean(seg)
  log.besideTasks = seg?.previousElementSibling?.dataset.palSeg === 'tasks'
  seg?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  await waitFor(() => commentRows().length >= 3)
  const mine = () => commentRows().filter((r) => r.textContent.includes(stamp) || r.textContent.includes(ONE) || r.textContent.includes(TWO))
  log.everyOne = mine().map((r) => flat(r.textContent))
  log.listsAllThree = mine().length === 3
  const last = () => mine().find((r) => r.textContent.includes(`is this still true ${stamp}?`))
  log.rowSaysWhatAndWhere =
    Boolean(last()) && flat(last()?.textContent).includes(`${ONE} · on “the last clause”`) && /COMMENT$/.test(flat(last()?.textContent))
  log.pointSaysSo = mine().some((r) => flat(r.textContent).includes(`${TWO} · at a point`))

  /* ---------- typed: the ones that match ---------- */

  await ask(`still true ${stamp}`)
  log.typedNarrows = commentRows().length === 1 && Boolean(last())
  log.footer = flat(document.querySelector('[data-pal-footer]')?.textContent)
  log.footerOffersThePass = log.footer === '↑↓ move · ↵ open it there · ⇧↵ go through its note · esc close'

  /* ---------- ↵: the note, at the comment, its anchor lit ---------- */

  press('Enter')
  log.opened = await waitFor(() => Boolean(notePane()?.textContent.includes('closes it.')))
  const sc = () => notePane()?.querySelector('[data-find-scope]')
  const anchorEl = () => [...(sc()?.querySelectorAll('.cmt-anchor') ?? [])].find((e) => e.textContent === 'the last clause')
  log.lit = await waitFor(() => anchorEl()?.classList.contains('cmt-flash'), 3000)
  const ar = anchorEl()?.getBoundingClientRect()
  const sr = sc()?.getBoundingClientRect()
  log.scrolledTo = Boolean(ar && sr) && ar.top >= sr.top && ar.bottom <= sr.bottom && sc().scrollTop > 400
  log.litFades = await waitFor(() => anchorEl() && !anchorEl().classList.contains('cmt-flash'), 3000)

  /* ---------- ALL: a comment row among the others, once typed ---------- */

  key('k')
  await sleep(600)
  await ask(`which three ${stamp}`)
  log.inAll = rows().some((r) => r.dataset.palKind === 'comment' && r.textContent.includes(`which three? ${stamp}`))
  await ask('')
  log.notInAllUntyped = !rows().some((r) => r.dataset.palKind === 'comment')

  /* ---------- ⇧↵: the note's pass ---------- */

  document.querySelector('[data-pal-seg="comments"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  await ask(`which three ${stamp}`)
  const tabsBefore = threadPane()?.querySelectorAll('[data-tab]').length ?? 0
  press('Enter', { shiftKey: true })
  log.passStarted = await waitFor(() => (threadPane()?.querySelectorAll('[data-tab]').length ?? 0) === tabsBefore + 1)
  log.passTitle = flat(threadPane()?.querySelector('[data-tab-on="1"]')?.textContent).replace(/\s*×$/, '')
  log.passIsTheNotes = log.passTitle.startsWith(`Comments · ${TWO} · `)

  log.pass = Boolean(
    log.hasTheFilter &&
      log.besideTasks &&
      log.listsAllThree &&
      log.rowSaysWhatAndWhere &&
      log.pointSaysSo &&
      log.typedNarrows &&
      log.footerOffersThePass &&
      log.opened &&
      log.lit &&
      log.scrolledTo &&
      log.litFades &&
      log.inAll &&
      log.notInAllUntyped &&
      log.passStarted &&
      log.passIsTheNotes
  )
  return JSON.stringify(log, null, 1)
})()
