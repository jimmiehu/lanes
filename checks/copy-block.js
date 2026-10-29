// TAKE THIS BLOCK.
//
// The app could already copy a whole note, a whole message, and whatever you
// had selected. What it could not do is the thing you reach for most in a
// transcript full of shell: take THIS block. Selecting a fenced block by
// dragging is fiddly — you catch the line above, or miss the last newline, or
// the pane scrolls out from under the drag — and the place a precise selection
// matters most is the place a rough one is hardest.
//
// So a word in the block's corner, absent until the block is under the pointer,
// costing the document no layout at all. What it puts on the clipboard is the
// block's SOURCE — the thing you would want to paste — not its rendering: every
// line of it, byte for byte, and not the fences around it.
//
// The chip is READ's. In WRITE a code block is its own source, fences and all,
// selected and copied like any other lines (`note-copy.js` holds what the
// editor's copy hands over). A note opens in READ, where the chip is.
// And the old last claim — a click on the chip never opens the block as a
// field — is gone with the fields: READ edits nothing now, and a double-click
// is how you ask to write THERE. So the claim it became is that a double-click
// on the chip is two copies, and never a trip into WRITE. The chip is the
// block card's SIBLING, not its child, so today nothing above it answers a
// double-click at all — which is why the same double-click is then aimed at
// the card itself and must flip to WRITE: without that, a green here could
// only mean the synthetic event reached nothing.
//
// The clipboard is read back where the window allows it. A driven window is not
// always the front one, and a background document may neither write to the
// clipboard nor read it — Chromium refuses both with "Document is not
// focused", which a person clicking the chip never meets, since the window
// they click in is the front one. So what the chip HANDED to the clipboard is
// recorded on the way through, a refusal is noted as `clipboardRefused` and
// swallowed there, and the chip's own `copied` still has to follow.
//
// Seeds its own note through the app's IPC. Run against a throwaway LANES_VAULT
// and LANES_STATE. See checks/README.md.
(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
  const click = (el) => el && el.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  const pane = (i) => document.querySelector(`[data-pane="${i}"]`)
  const key = (k, extra = {}) =>
    window.dispatchEvent(new KeyboardEvent('keydown', { key: k, metaKey: true, bubbles: true, ...extra }))
  const hosts = () => [...(pane(1)?.querySelectorAll('.copy-host') ?? [])]
  const chips = () => [...(pane(1)?.querySelectorAll('[data-copy-chip]') ?? [])]
  const mode = (m) => pane(1)?.querySelector(`[data-mode="${m}"]`)?.dataset.on === '1'
  const setIn = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
  const log = {}

  // The first block is a multi-line shell command: the claim is that EVERY line
  // arrives, so a one-line block would prove less than it looks.
  const FIRST = [
    'rm -rf /tmp/lanes-check && mkdir -p /tmp/lanes-check',
    'LANES_STATE=/tmp/lanes-check \\',
    '  LANES_CAPTURE_EXEC=checks/attach.js npm run dev'
  ].join('\n')
  const BODY = [
    '# Snippet check',
    '',
    'Two blocks of code, the first one several lines long.',
    '',
    '```bash',
    FIRST,
    '```',
    '',
    'And a second, one line long.',
    '',
    '```js',
    "console.log('the second block')",
    '```',
    ''
  ].join('\n')

  // --- seed it, and open it the way a person would: by finding it ---
  const made = await window.lanes.noteCreate('Snippet check', '_unfiled')
  const PATH = made.path || '_unfiled/snippet-check.md'
  await window.lanes.noteWrite(PATH, BODY)
  key('k')
  await sleep(600)
  const box = document.querySelector('[data-palette-input]')
  setIn.call(box, 'Snippet check')
  box.dispatchEvent(new Event('input', { bubbles: true }))
  await sleep(1000)
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
  await sleep(1800)

  log.opensInRead = mode('READ')
  for (let i = 0; i < 2 && !mode('READ'); i++) {
    key('e')
    await sleep(800)
  }
  log.inRead = mode('READ')

  /* ---------- one chip per code block, and nothing else changed ---------- */

  log.hosts = hosts().length
  log.chips = chips().length
  log.oneChipPerBlock = log.chips === log.hosts && log.chips === 2
  // Nothing to measure before the control existed, which is the whole point.
  if (!log.chips) {
    log.noChipsAtAll = 'no code block offers a copy'
    log.pass = false
    return log
  }

  /* ---------- it costs the document no layout ---------- */

  // The chip is absolutely positioned, so the block is laid out exactly as it
  // would be without it. Measured with the chip taken out and then put back —
  // the card (the chip's own sibling) where it sits in the host and how big it
  // is, and the host's own height, which is what a chip in flow would push.
  const host = hosts()[0]
  const card = host.querySelector('div:not(.copy-chip)')
  const chip = chips()[0]
  const layout = () => {
    const c = card.getBoundingClientRect()
    const h = host.getBoundingClientRect()
    return { top: c.top - h.top, width: c.width, height: c.height, host: h.height }
  }
  chip.style.display = 'none'
  const without = layout()
  chip.style.display = ''
  const withChip = layout()
  log.chipIsAButton = chip.tagName === 'BUTTON'
  log.chipIsAbsolute = getComputedStyle(chip).position === 'absolute'
  log.cardUnmoved = Object.keys(without).every((k) => Math.abs(withChip[k] - without[k]) < 0.5)
  if (!log.cardUnmoved) log.layout = { without, withChip }

  /* ---------- absent at rest ---------- */

  // Forty code blocks each wearing a visible control is a toolbar, not a
  // document. `:hover` cannot be driven from a script, so this asks the
  // stylesheet what it computes to when nothing is hovered.
  log.opacityAtRest = getComputedStyle(chip).opacity
  log.hiddenAtRest = log.opacityAtRest === '0'
  log.notClickableAtRest = getComputedStyle(chip).pointerEvents === 'none'

  /* ---------- and it copies the SOURCE ---------- */

  // Recorded on the way through and passed on: the real write still happens.
  // A refusal is the background window's, not the chip's (see the top), so it
  // is logged and swallowed rather than handed back — handed back, it would
  // stop the chip before its `copied` and fail the check for the setup.
  const clip = navigator.clipboard
  const realWrite = clip.writeText.bind(clip)
  let handed = null
  let writes = 0
  const recorder = (text) => {
    handed = text
    writes++
    return realWrite(text).catch((e) => {
      log.clipboardRefused = String(e?.message ?? e)
    })
  }
  clip.writeText = recorder
  // Should the bridge ever refuse the stand-in, the clipboard itself is the
  // only witness left, and the log says which one was asked.
  log.recording = clip.writeText === recorder

  // Revealed the way a hover would, since a synthetic mouse event cannot set
  // :hover — what is being checked here is the click, not the CSS above.
  chip.style.opacity = '1'
  chip.style.pointerEvents = 'auto'
  click(chip)
  await sleep(800)
  try {
    log.clipboard = await navigator.clipboard.readText()
  } catch (e) {
    log.clipboard = `unreadable: ${String(e?.message ?? e)}`
  }
  const got = log.recording ? handed : log.clipboard
  log.handed = handed
  // The first block of the fixture, exactly: every line, newlines included,
  // and nothing else — no fence markers, no language tag, no trailing newline.
  log.handedTheSource = got === FIRST
  log.handedEveryLine = typeof got === 'string' && (got.match(/\n/g) ?? []).length === 2
  log.noFenceMarkers = typeof got === 'string' && !/```/.test(got)
  // Where it can be read, it is what was handed over.
  log.clipboardAgrees = log.clipboard === FIRST || /^unreadable/.test(log.clipboard)

  /* ---------- and says so, visibly ---------- */

  log.saysCopied = /copied/.test(chip.innerText)
  log.staysUpWhileItSays = chip.getAttribute('data-copied') === '1'

  /* ---------- two clicks on the chip are two copies, not a request to write ---------- */

  // A double-click in READ is how you ask to write THERE. The chip sits in the
  // corner of a block that answers it, and must not be a way in. A real
  // double-click is two clicks and then the dblclick, so it is sent that way.
  const dbl = (el) => {
    const r = el.getBoundingClientRect()
    el.dispatchEvent(
      new MouseEvent('dblclick', {
        bubbles: true,
        cancelable: true,
        detail: 2,
        view: window,
        clientX: r.left + r.width / 2,
        clientY: r.top + r.height / 2
      })
    )
  }
  const writesBefore = writes
  click(chip)
  click(chip)
  dbl(chip)
  await sleep(900)
  log.twoCopies = writes - writesBefore === 2 && handed === FIRST
  log.stillReading = mode('READ') && !pane(1)?.querySelector('.cm-editor')

  // The control: the same double-click on the code card itself DOES write.
  // Without it, `stillReading` would hold just as well if a synthetic dblclick
  // reached nothing at all.
  dbl(card)
  await sleep(900)
  log.cardAnswersIt = mode('WRITE') && Boolean(pane(1)?.querySelector('.cm-editor'))

  delete clip.writeText

  log.pass =
    log.opensInRead &&
    log.inRead &&
    log.oneChipPerBlock &&
    log.chipIsAButton &&
    log.chipIsAbsolute &&
    log.cardUnmoved &&
    log.hiddenAtRest &&
    log.notClickableAtRest &&
    log.handedTheSource &&
    log.handedEveryLine &&
    log.noFenceMarkers &&
    log.clipboardAgrees &&
    log.saysCopied &&
    log.staysUpWhileItSays &&
    log.twoCopies &&
    log.stillReading &&
    log.cardAnswersIt
  return log
})()
