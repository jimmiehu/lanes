import { useRef, useState } from 'react'

/**
 * COPY THIS BLOCK.
 *
 * The app could already copy a whole note, a whole message, and whatever you
 * had selected. What it could not do is the thing you actually reach for most
 * often in a transcript full of shell and code: take THIS block. Selecting a
 * fenced block by dragging is a fiddly business — you catch the line above, or
 * miss the last newline, or the pane scrolls out from under the drag — and the
 * one place a precise selection matters most is the one place a rough one is
 * hardest.
 *
 * A WORD, NOT AN ICON, because that is what every other copy in this app is:
 * the note head says `copy` and then `copied`, and so does a message's action
 * row. A clipboard glyph here would be a fourth vocabulary for the third verb.
 *
 * IT COSTS NO LAYOUT. Absolutely positioned in the block's top-right corner and
 * invisible until the block is under the pointer, so a transcript at rest looks
 * exactly as it did — a column of code cards, each wearing a control, is a
 * toolbar rather than a document. It stays visible while it says `copied`,
 * because a confirmation you cannot see has not confirmed anything.
 *
 * The host must be `position: relative`, and — where the block scrolls
 * sideways — the chip belongs to the WRAPPER rather than to the scrolling box,
 * or it slides away with the code it is offering to copy.
 */
export default function CopyChip({
  text,
  title = 'Copy this block',
  label = 'copy'
}: {
  /** The source, not the rendering — what you would want to paste. */
  text: string
  title?: string
  label?: string
}): React.JSX.Element {
  const [copied, setCopied] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  return (
    <button
      type="button"
      className="copy-chip"
      data-copy-chip="1"
      data-copied={copied ? '1' : '0'}
      title={title}
      onClick={(e) => {
        // A click here is a copy, not a click on the block underneath — which
        // in READ would otherwise count toward a double-click that opens WRITE.
        e.stopPropagation()
        void navigator.clipboard.writeText(text).then(() => {
          setCopied(true)
          if (timer.current) clearTimeout(timer.current)
          // The same 1400ms the note head's `copy` waits — one confirmation,
          // one duration, wherever the verb appears.
          timer.current = setTimeout(() => setCopied(false), 1400)
        })
      }}
      // A double-click on a block in READ opens WRITE there; two fast clicks on
      // the chip are two copies, not a request to write.
      onDoubleClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
    >
      {copied ? 'copied' : label}
    </button>
  )
}
