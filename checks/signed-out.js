// A SIGNED-OUT CLI, SAID BEFORE YOU TYPE.
//
// Lanes runs the `claude` you already have and keeps no login of its own, so a
// lapsed OAuth session is not something the app can fix — but it is something
// the app was handling badly. The CLI's sentence arrived as stderr, in the box
// kept for machine output you did not ask for, once per message, for ever:
// `Failed to authenticate: OAuth session expired and could not be refreshed`.
// Every word true, none of it useful. It does not say Lanes holds no
// credentials, does not say where the login lives, does not say what to type.
//
// So: the status is asked at LAUNCH, which costs no tokens and touches no
// network, and the answer is a note with the command in it — before a message
// has been composed and lost to it.
//
// ONLY MEANINGFUL WHILE THE CLI IS ACTUALLY SIGNED OUT. Check first:
//
//   claude auth status        # {"loggedIn": false, ...}
//
// If it says true, this check reports `notApplicable` and asserts nothing —
// which is the honest answer, not a pass. Run it against a throwaway
// LANES_STATE. See checks/README.md.
;(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
  const pane = () => document.querySelector('[data-pane="0"]')
  const note = () => document.querySelector('[data-signin]')
  const log = {}
  // The status check spawns `claude auth status` and waits for it, so this
  // waits longer than the usual settle.
  await sleep(5000)

  // Before the status check existed there was nothing to ask, which is the
  // whole point — the app could only find out by spending a turn.
  log.canAsk = typeof window.lanes.authStatus === 'function'
  log.status = log.canAsk ? await window.lanes.authStatus() : null
  if (!log.canAsk) {
    log.noteShown = Boolean(note())
    log.pass = false
    return JSON.stringify(log, null, 1)
  }
  if (!log.status || log.status.loggedIn) {
    log.notApplicable = 'the CLI is signed in — nothing for this to look at'
    log.pass = null
    return JSON.stringify(log, null, 1)
  }

  /* ---------- the note is there, unprompted ---------- */

  log.noteShown = Boolean(note())
  log.noteText = (note()?.innerText ?? '').replace(/\s+/g, ' ').trim()
  // The command is the biggest thing in it and the only thing you must read.
  log.showsTheCommand = /claude auth login/.test(log.noteText)
  log.saysLanesHoldsNoLogin = /keeps no login of its own/i.test(log.noteText)
  // Nothing was spent to learn this. Counted in the pane the app opens on, so
  // it wants a vault with no thread to open (the manifest's `"threads": false`):
  // on one with threads that pane opens the newest, and its answers are not a
  // turn this launch spent.
  log.saysNothingWasLost = /before you typed/i.test(log.noteText)
  log.turnsSpent = pane()?.querySelectorAll('[data-msg-role="claude"]').length ?? 0
  log.spentNothing = log.turnsSpent === 0

  /* ---------- and it can be copied, since the app cannot run it ---------- */

  // Recorded on the way through and passed on, as copy-block.js does: the real
  // write still happens. A driven run's window is not always the front one, and
  // a page here may write the clipboard but never read it (index.ts grants
  // `clipboard-sanitized-write` and nothing else) — so what the note HANDED the
  // clipboard is the witness, and the clipboard itself agrees wherever it can
  // be read. A refusal is the harness's, not the note's: logged and swallowed,
  // or it would stop the note before its `copied` and fail it for the setup.
  const clip = navigator.clipboard
  const realWrite = clip.writeText.bind(clip)
  let handed = null
  clip.writeText = (text) => {
    handed = text
    return realWrite(text).catch((e) => {
      log.clipboardRefused = String(e?.message ?? e)
    })
  }

  const copy = document.querySelector('[data-signin-copy]')
  log.offersCopy = Boolean(copy)
  copy?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  await sleep(700)
  // The same lowercase word every other copy in this app uses.
  log.copySaysCopied = /copied/.test(copy?.innerText ?? '')
  try {
    log.clipboard = await navigator.clipboard.readText()
  } catch (e) {
    log.clipboard = `unreadable: ${String(e?.message ?? e)}`
  }
  log.handed = handed
  log.copiedTheCommand =
    handed === 'claude auth login' &&
    (log.clipboard === handed || /^unreadable/.test(log.clipboard))

  /* ---------- the raw stderr box does NOT also appear ---------- */

  // Two boxes saying the same thing, one of them useless, is what this replaces.
  const code = [...(pane()?.querySelectorAll('div') ?? [])].filter((d) =>
    /Failed to authenticate/.test(d.textContent ?? '')
  )
  log.rawStderrBoxes = code.length
  log.noRawBox = !/OAuth session expired/.test(
    [...(pane()?.querySelectorAll('div') ?? [])]
      .filter((d) => getComputedStyle(d).fontFamily.includes('mono'))
      .map((d) => d.textContent ?? '')
      .join(' ')
      .replace(log.noteText, '')
  )

  log.pass =
    log.noteShown &&
    log.showsTheCommand &&
    log.saysLanesHoldsNoLogin &&
    log.saysNothingWasLost &&
    log.spentNothing &&
    log.offersCopy &&
    log.copySaysCopied &&
    log.copiedTheCommand
  return JSON.stringify(log, null, 1)
})()
