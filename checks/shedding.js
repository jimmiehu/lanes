// The reading measure, at every width. Replaces the v2 shedding table: the
// redesign collapsed the composer footer into one status line that
// ellipsises, so there is almost nothing left to shed — what remains is that
// content is centred at the measure and never exceeds it. See checks/README.md
// for how to run it.
(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
  const pane = () => document.querySelector('[data-pane="0"]')
  // The row the strip stands on: its tabs scroll inside it, so the row is the column.
  const strip = () => document.querySelector('[data-tabrow]')
  const head = () => document.querySelector('[data-head="1"]')
  const w = (el) => (el ? Math.round(el.getBoundingClientRect().width) : null)
  const paneW = () => w(pane())

  await sleep(2600)
  // One rail (250) plus the shell's chrome: 10px padding each side and one
  // 10px gutter between rail and pane. Tracks paneWidth() in lib/layout.ts.
  const CHROME = 250 + 10 * 2 + 10
  // Tracks MIN_PAD in lib/layout.ts — the design's own pane padding.
  const MIN_PAD = 26
  const MEASURE = 620
  const setPane = async (px) => {
    window.resizeTo(Math.round(px + CHROME), 900)
    await sleep(650)
  }

  const out = []
  for (const target of [1100, 900, 760, 620, 520, 420, 300]) {
    await setPane(target)
    const actual = paneW()
    const want = Math.min(Math.max(0, actual - MIN_PAD * 2), MEASURE)
    const stripW = w(strip())
    const headW = w(head())
    // Both align to the same column, and neither exceeds the pane.
    const ok =
      stripW !== null &&
      headW !== null &&
      Math.abs(stripW - want) <= 2 &&
      Math.abs(headW - want) <= 2 &&
      stripW <= actual &&
      headW <= actual
    out.push({ target, pane: actual, want, strip: stripW, head: headW, ok })
  }
  window.resizeTo(1440, 900)
  await sleep(400)
  const failed = out.filter((o) => !o.ok)
  return JSON.stringify(
    {
      // All seven widths on the one column, none past the pane.
      pass: out.length === 7 && failed.length === 0,
      passed: out.length - failed.length,
      of: out.length,
      failed,
      all: out.map((o) => `pane ${o.pane} → measure ${o.want} (strip ${o.strip}, head ${o.head}) ${o.ok ? 'ok' : 'FAIL'}`)
    },
    null,
    1
  )
})()
