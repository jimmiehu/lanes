// Asserts an image can be attached, sent, and seen by the model.
//
// The CLI takes Anthropic image content blocks on stdin via --input-format
// stream-json — verified directly before this was built, by asking it the
// colour of a solid PNG. This drives the same path through the app.
//
// Run against a throwaway LANES_VAULT and LANES_STATE. See checks/README.md.
(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
  const pane = () => document.querySelector('[data-pane="0"]')
  const composer = () => pane().querySelector('textarea')
  const click = (el) => el && el.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  const log = {}

  // A 64px solid magenta PNG, built here so the check carries its own fixture.
  const B64 =
    'iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAIAAAAlC+aJAAAATElEQVR42u3PMQkAAAwDsPo3' +
    '3UnoPQjEQNL0tQgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgI' +
    'CAgILAdBp+HSRtACMAAAAABJRU5ErkJggg=='

  // A paste is the way this is meant to happen, so paste is what is tested.
  const bytes = Uint8Array.from(atob(B64), (c) => c.charCodeAt(0))
  const file = new File([bytes], 'probe.png', { type: 'image/png' })
  const dt = new DataTransfer()
  dt.items.add(file)
  composer().dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true }))
  await sleep(900)

  const tray = [...pane().querySelectorAll('div')].filter((d) =>
    (d.getAttribute('title') || '').includes('click to remove')
  )
  log.trayCount = tray.length
  log.attached = tray.length === 1

  // Ask it something only the picture can answer.
  const set = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set
  set.call(composer(), 'Reply with exactly one word: the dominant colour of this image.')
  composer().dispatchEvent(new Event('input', { bubbles: true }))
  await sleep(300)
  composer().dispatchEvent(
    new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })
  )

  // The tray empties with the draft, and the sent turn shows the image.
  await sleep(1200)
  log.trayClearedOnSend =
    [...pane().querySelectorAll('div')].filter((d) =>
      (d.getAttribute('title') || '').includes('click to remove')
    ).length === 0
  const shot = pane().querySelector('img[src^="data:image/png;base64"]')
  log.imageInTranscript = Boolean(shot)
  // Rendered, not merely present: a CSP without `data:` in img-src leaves the
  // element in the DOM showing its alt text, which is how this first shipped.
  await sleep(600)
  log.imageRendered = Boolean(shot && shot.naturalWidth > 0)

  // Then wait for the answer.
  for (let i = 0; i < 60 && !/magenta/i.test(pane().innerText); i++) await sleep(1000)
  log.sawTheImage = /magenta/i.test(pane().innerText)
  log.tail = pane().innerText.slice(-160).replace(/\s+/g, ' ')

  log.pass =
    log.attached &&
    log.trayClearedOnSend &&
    log.imageInTranscript &&
    log.imageRendered &&
    log.sawTheImage
  return log
})()
