// A THREAD IS MEASURED AGAINST ITS OWN MODEL'S WINDOW.
//
// The meter drew every thread against 200K, so a thread on a long-window model
// read `828K / 200K`, the bar four times over. A turn's `result` says the real
// window for each model it used; the thread is measured against the one that
// answered — not the small one that names threads — and main keeps it for the
// next launch.
//
// Held with the `window` stand-in CLI: a turn on `claude-opus-5-5` that sent
// 828,186 tokens, whose `result` lists that model at 1M and Haiku at 200K. The
// details panel's Context row says `828K / 1M` with its bar under full, and the
// state file keeps `claude-opus-5-5: 1000000`.
//
// Wants the `window` stand-in CLI, a throwaway vault and a fresh state
// directory. See checks/README.md.
;(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
  const pane = () => document.querySelector('[data-pane="0"]')
  const click = (el) => el && el.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  const press = (k, on = window) =>
    on.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }))
  const send = async (text) => {
    const c = pane().querySelector('textarea')
    Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set.call(c, text)
    c.dispatchEvent(new Event('input', { bubbles: true }))
    await sleep(200)
    press('Enter', c)
  }
  const context = () => pane()?.querySelector('[data-fact="Context"]')
  const flat = (el) => el?.innerText.replace(/\s+/g, ' ').trim() ?? null
  const log = {}
  await sleep(2600)

  await send('how much does this hold?')
  for (let t = 0; t < 15000 && !/\bok\b/.test(pane()?.innerText ?? ''); t += 250) await sleep(250)
  await sleep(1500)
  click(pane()?.querySelector('[data-meta="1"]'))
  for (let t = 0; t < 5000 && !context(); t += 250) await sleep(250)

  log.context = flat(context())
  log.saysItsOwnWindow = log.context === 'Context 828K / 1M'
  // The bar is the share drawn, clamped at full: 83%, not pinned at 100.
  const bar = [...(context()?.querySelectorAll('div') ?? [])].find((d) => d.style.width.endsWith('%'))
  log.bar = bar?.style.width ?? null
  log.barUnderFull = Boolean(log.bar) && parseFloat(log.bar) < 100

  const state = (await window.lanes.bootstrap()).state
  log.kept = state.contextWindows ?? null
  log.keptForNextTime = log.kept?.['claude-opus-5-5'] === 1000000

  log.pass = Boolean(log.saysItsOwnWindow && log.barUnderFull && log.keptForNextTime)
  return log
})()
