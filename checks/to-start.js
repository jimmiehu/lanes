// UP TO WHERE A MESSAGE STARTS.
//
// A long answer is read from its first line, and scrolling back up to find that
// line by eye is how you lose the end of it on the way. So a thread offers the
// way up, above the way down and quieter than it:
//
// - Only where there is a start to go to: at the head of a thread there is
//   nothing above, and nothing to press.
// - Pressed in the middle of an answer, it sets that answer's first line — its
//   CLAUDE label — 22px under the top of what can be seen, which is under the
//   compact bar once the head has gone: the landing the outline and a fork use.
// - Pressed again from there, it goes to the message before, and so on up the
//   thread — your own turns included, since a question is where an answer
//   begins too.
// - Pressed twice while the first jump is still gliding, it goes two messages
//   up, not to the same one twice.
// - It stands in the pane's right margin, clear of the words, wherever the
//   margin is wide enough; only a pane too narrow to have one puts it on the
//   end of the lines, where the way down has always been.
//
// Wants the thread fixture: `node checks/thread-fixture.mjs /private/tmp/<vault>`
// and that vault as LANES_VAULT, with a fresh LANES_STATE. See checks/README.md.
(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
  const pane = () => document.querySelector('[data-pane="0"]')
  const sc = () => pane()?.querySelector('[data-find-scope]')
  const up = () => pane()?.querySelector('[data-to-start]')
  const down = () => pane()?.querySelector('[data-to-bottom]')
  const turns = () => [...(pane()?.querySelectorAll('[data-turn]') ?? [])]
  const turnWith = (s) => turns().find((t) => t.textContent.includes(s))
  const seenTop = () => {
    const bar = pane()?.querySelector('[data-compact="1"]')
    return bar ? bar.getBoundingClientRect().bottom : sc().getBoundingClientRect().top
  }
  /** Where a turn's first line sits, under the top of what can be seen. */
  const under = (s) => Math.round((turnWith(s)?.getBoundingClientRect().top ?? NaN) - seenTop())
  const press = (el) => el?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
  /** Until the scroll has stopped moving. */
  const still = async () => {
    let last = -1
    for (let i = 0; i < 40; i++) {
      await sleep(80)
      const now = sc()?.scrollTop ?? 0
      if (Math.abs(now - last) < 0.5) break
      last = now
    }
    await sleep(150)
  }
  const log = {}
  await sleep(2000)

  log.threadUp = Boolean(turnWith('Long answer opens here'))
  if (!log.threadUp) return { ...log, pass: false }

  /* ---------- at the head of the thread: nothing to press ---------- */

  sc().scrollTop = 0
  await sleep(500)
  log.nothingAtTheHead = up()?.dataset.toStart === '0'

  /* ---------- in the middle of the long answer: to its first line ---------- */

  const long = turnWith('Long answer opens here')
  sc().scrollTop += long.getBoundingClientRect().top - sc().getBoundingClientRect().top + 600
  await still()
  log.offeredMidAnswer = up()?.dataset.toStart === '1'
  press(up())
  await still()
  log.firstPress = under('Long answer opens here')
  log.toTheStartOfThisAnswer = Math.abs(log.firstPress - 22) <= 3

  /* ---------- again: the message before, your own turn ---------- */

  press(up())
  await still()
  log.secondPress = under('And the rest of it?')
  log.toTheMessageBefore = Math.abs(log.secondPress - 22) <= 3

  /* ---------- twice in one glide: two messages up ---------- */

  const last = turnWith('Last answer opens here')
  sc().scrollTop += last.getBoundingClientRect().top - sc().getBoundingClientRect().top + 500
  await still()
  press(up())
  await sleep(40)
  press(up())
  await still()
  log.doublePress = under('One more thing.')
  log.twicePressedIsTwoUp = Math.abs(log.doublePress - 22) <= 3

  /* ---------- in the margin where there is one ---------- */

  const ways = pane()?.querySelector('[data-ways]')
  log.ways = ways?.dataset.ways
  const words = [...(pane()?.querySelectorAll('[data-md-from]') ?? [])].map((d) => d.firstElementChild).filter(Boolean)
  const wordsRight = Math.max(...words.map((e) => e.getBoundingClientRect().right))
  const upBox = up()?.getBoundingClientRect()
  const downBox = down()?.getBoundingClientRect()
  log.clearOfTheWords = ways?.dataset.ways !== 'margin' || (upBox && upBox.left >= wordsRight + 8)
  // The two stand one above the other and do not overlap.
  log.stackedNotOverlapping = Boolean(upBox && downBox && upBox.bottom <= downBox.top)
  // Wide enough for the measure and a margin that holds them — 26px of button,
  // 18 clear of the words and 12 from the edge each side — that is where they are.
  log.paneWidth = sc()?.clientWidth ?? 0
  log.marginWhenThereIsOne = log.paneWidth < 620 + 2 * (26 + 18 + 12) || ways?.dataset.ways === 'margin'

  log.pass = Boolean(
    log.threadUp &&
      log.nothingAtTheHead &&
      log.offeredMidAnswer &&
      log.toTheStartOfThisAnswer &&
      log.toTheMessageBefore &&
      log.twicePressedIsTwoUp &&
      log.clearOfTheWords &&
      log.stackedNotOverlapping &&
      log.marginWhenThereIsOne
  )
  return log
})()
