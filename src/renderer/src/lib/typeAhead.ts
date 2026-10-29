import { EditorView } from '@codemirror/view'

/**
 * THE LETTERS TYPED WHILE A NOTE IS BEING MADE.
 *
 * ⌘N is for a thought you want down before it goes, and the thought does not
 * wait for the file. Making the note is a round trip to main — queued behind
 * any save already on its way — then a read of it and a render, and until
 * that render lands the caret is wherever it was: in the note you were just
 * writing, as often as not. The first letters of the new note went into the
 * OLD one, and were saved there.
 *
 * So the keystroke takes the caret at once, into a field nobody sees, which
 * holds what is typed until the new note takes the caret — and then it is
 * typed again, there. A real field rather than a key listener, so what it
 * holds is what any field would: an input method's words rather than its
 * keystrokes, a dead key's accent, a ⌫ that took a letter back. Keys with ⌘
 * pass it by to the window, as they always did.
 *
 * Handed over by focus, not by a call: whatever takes the caret from the
 * holder is where the words were going. For a nameless note that is its
 * title, and a ↵ among them goes where ↵ in the title goes — down into the
 * body — because it is typed there as the key, not as a line break.
 *
 * If no note comes — the make failed, or nothing took the caret in time — the
 * caret goes back where it was and the words with it, as though ⌘N had never
 * been pressed. They are only lost where there is no field left to take them.
 */

export interface Hold {
  box: HTMLTextAreaElement
  /** Where the caret was, for when no note comes. */
  from: HTMLElement | null
  timer: number
}

let held: Hold | null = null

/** However long making a note takes, a hold never outlasts this. */
const LIMIT_MS = 3000

/** A field of the page with the caret in it — somewhere typing can go. */
function field(): HTMLElement | null {
  const el = document.activeElement
  if (!(el instanceof HTMLElement)) return null
  return el.isContentEditable || el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement ? el : null
}

/**
 * What was held, typed where the caret now is. ↵ goes as the KEY only into a
 * contenteditable — the note's title and its body, where it is theirs to mean
 * something — and as a line break anywhere else: replayed into a composer, a
 * ↵ is a message sent.
 */
function typeAgain(text: string, keys: boolean): void {
  const at = field()
  if (!at) return
  if (!keys || !at.isContentEditable) {
    put(text)
    return
  }
  text.split('\n').forEach((line, i) => {
    if (i > 0) {
      field()?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true, cancelable: true }))
    }
    if (line && field()) put(line)
  })
}

/**
 * Words typed at the caret. Into the note's editor they go as a change to its
 * DOCUMENT, not to its page: CodeMirror reads what the page was given a
 * microtask later, and the render the ↵ above has just queued comes first —
 * mounting the new note's editor settles its options with a transaction, and
 * a transaction throws away whatever the page holds that was not read yet.
 * The title and any plain field take them as typing.
 */
function put(text: string): void {
  const at = field()
  const editor = at ? EditorView.findFromDOM(at) : null
  if (editor) {
    editor.dispatch(editor.state.replaceSelection(text), { userEvent: 'input.type', scrollIntoView: true })
    return
  }
  document.execCommand('insertText', false, text)
}

function end(h: Hold, handOver: boolean): void {
  if (held !== h) return
  held = null
  window.clearTimeout(h.timer)
  /*
   * Read once the caret has settled rather than in the blur: an input method
   * commits what it was composing as the focus leaves, and the render that
   * moved the caret is still running. A microtask is after all of it and
   * before the next key, so nothing typed can land ahead of what was held.
   */
  queueMicrotask(() => {
    const text = h.box.value
    h.box.remove()
    if (text) typeAgain(text, handOver)
  })
}

/**
 * Take the caret for a note that is on its way. Called before anything is
 * awaited — the next key may already be in the queue. A second call while one
 * is held is the same hold.
 */
export function holdTyping(): Hold {
  if (held) return held
  const was = document.activeElement
  const box = document.createElement('textarea')
  box.setAttribute('aria-label', 'New note')
  // Named for what it is, so nothing mistakes it for a field the app put up to
  // ask something — it asks nothing, and is gone before the note is.
  box.dataset.typeAhead = '1'
  box.tabIndex = -1
  box.style.cssText =
    'position:fixed;top:0;left:0;width:1px;height:1px;opacity:0;pointer-events:none;border:0;padding:0;resize:none'
  const h: Hold = {
    box,
    from: was instanceof HTMLElement && was !== document.body ? was : null,
    timer: 0
  }
  // ⇥ would walk the caret out of the holder to whatever is next in the page.
  box.addEventListener('keydown', (e) => {
    if (e.key === 'Tab') e.preventDefault()
  })
  box.addEventListener('blur', () => {
    // The window going to the back blurs the holder too, and leaves it the
    // active element: the caret has not gone anywhere, and comes back to it.
    if (document.activeElement === box) return
    end(h, true)
  })
  document.body.appendChild(box)
  held = h
  h.timer = window.setTimeout(() => {
    // Moved on without a word: a window at the back is sent no blur, so a
    // note that landed there took the caret without the holder hearing of it.
    if (document.activeElement !== box) end(h, true)
    else giveTypingBack(h)
  }, LIMIT_MS)
  box.focus({ preventScroll: true })
  return h
}

/**
 * The note is here and has the caret: what was held goes to it NOW. Called by
 * whatever put the caret in the new note, right after it did — the holder's
 * blur is not enough on its own, because a window at the back is sent no blur,
 * and the words then waited out the whole backstop before they appeared.
 */
export function handTypingOver(): void {
  if (held && document.activeElement !== held.box) end(held, true)
}

/** No note is coming: the caret goes back where it was, and what was typed with it. */
export function giveTypingBack(h: Hold): void {
  if (held !== h) return
  // Ended first, so the blur this causes is not taken for a hand-over.
  end(h, false)
  if (document.activeElement !== h.box) return
  if (h.from?.isConnected) h.from.focus({ preventScroll: true })
  else h.box.blur()
}
