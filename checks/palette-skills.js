// THE VAULT'S SKILLS ARE ⌘K ROWS, WITH NO SETUP.
//
// Every skill in `.claude/skills/` that is switched on is a row after a `/`
// and under PROMPTS — `/echo-word`, badged SKILL, its description under it —
// below the prompts somebody chose to keep. ↵ runs it the way a person runs one
// at the terminal: a new thread whose first turn is `/echo-word`, which the CLI
// expands into the skill (verified over stream-json, with a one-line skill,
// before this row existed), named `/echo-word · <day>` and filed in the lane the
// skill's own name points at. ⇧↵ leaves `/echo-word ` in the composer, with
// room after it for what to tell it. A skill switched off in Settings is not a
// row at all; in ALL a skill is an offer at the foot, like a prompt, never
// where ↵ rests.
//
// Red before: `/` lists no skills. Wants the `slow` stand-in CLI, a throwaway
// vault holding three one-line skills, and a fresh state directory seeded with
// `{"skillsOff":["quiet-one"]}` — see checks/README.md.
;(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
  const key = (k, opts = {}) =>
    window.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, ...opts }))
  const q = (sel) => document.querySelector(sel)
  const pane = (i) => q(`[data-pane="${i}"]`)
  const box = () => q('[data-palette-input]')
  const rows = () => [...document.querySelectorAll('.pal-row')]
  const onTab = (i) => (pane(i)?.querySelector('[data-tab-on="1"]')?.textContent ?? '').replace(/×$/, '').trim()
  const palette = async (text) => {
    if (!box()) key('k', { metaKey: true })
    await sleep(600)
    Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(box(), text)
    box().dispatchEvent(new Event('input', { bubbles: true }))
    await sleep(1200)
  }
  // The day as a run's title spells it — in English, whatever the locale, since
  // main and the window each have their own.
  const day = (() => {
    const d = new Date()
    const wd = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getDay()]
    const mo = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getMonth()]
    return `${wd} ${d.getDate()} ${mo}`
  })()
  const log = {}
  await sleep(2600)

  // --- after a `/`, every skill that is on — and not the one switched off ---
  await palette('/')
  const listed = rows().map((r) => [r.dataset.palKind, r.dataset.palId, r.innerText.replace(/\s+/g, ' ').trim()])
  log.listed = listed
  log.bothOnListed =
    listed.some(([k, id]) => k === 'skill' && id === 'echo-word') &&
    listed.some(([k, id]) => k === 'skill' && id === 'garden-check')
  log.offIsNotARow = !listed.some(([, id]) => id === 'quiet-one')
  const echo = listed.find(([, id]) => id === 'echo-word')?.[2] ?? ''
  log.rowReadsAsASkill = /^\/ \/echo-word Replies with one fixed word\. SKILL$/.test(echo)

  // --- in ALL, an offer at the foot ---
  await palette('echo')
  const kinds = rows().map((r) => r.dataset.palKind)
  log.allKinds = kinds
  log.skillAtTheFoot = kinds[kinds.length - 1] === 'skill'
  log.notWhereEnterRests = rows().find((r) => r.dataset.palOn === '1')?.dataset.palKind !== 'skill'
  key('Escape')
  await sleep(300)

  // --- ↵ runs it as the command ---
  await palette('/echo')
  key('Enter')
  await sleep(1800)
  log.runTab = onTab(0)
  log.named = log.runTab === `/echo-word · ${day}`
  const you = [...(pane(0)?.querySelectorAll('[data-msg-role="you"]') ?? [])].map((m) => m.innerText.trim())
  log.sent = you
  log.sentTheCommand = you.includes('/echo-word')

  // --- filed in the lane its name points at ---
  await palette('/garden')
  key('Enter')
  await sleep(1800)
  const st = (await window.lanes.bootstrap()).state
  const garden = Object.keys(st.titleOverrides).find((k) => st.titleOverrides[k] === `/garden-check · ${day}`)
  log.filedInGarden = Boolean(garden) && st.laneOverrides[garden] === 'garden'

  // --- ⇧↵ leaves the command, and room after it ---
  await palette('/echo')
  key('Enter', { shiftKey: true })
  await sleep(1200)
  log.composerHolds = pane(0)?.querySelector('textarea')?.value ?? null
  log.unsentWithRoom = log.composerHolds === '/echo-word '
  log.nothingSent = !pane(0)?.querySelector('[data-msg-role="you"]')

  // --- the one switched off is not there to be asked for ---
  await palette('/quiet')
  log.offSays = q('[data-pal-empty]')?.textContent ?? null
  log.offNotFound = /No prompt or skill by that name/.test(log.offSays ?? '')
  key('Escape')
  await sleep(300)

  log.pass = Boolean(
    log.bothOnListed &&
      log.offIsNotARow &&
      log.rowReadsAsASkill &&
      log.skillAtTheFoot &&
      log.notWhereEnterRests &&
      log.named &&
      log.sentTheCommand &&
      log.filedInGarden &&
      log.unsentWithRoom &&
      log.nothingSent &&
      log.offNotFound
  )
  return JSON.stringify(log, null, 1)
})()
