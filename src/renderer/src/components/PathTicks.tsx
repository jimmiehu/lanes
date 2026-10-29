/**
 * WHERE THIS THREAD FORKS, down its left margin.
 *
 * A seam — the place a thread's paths part — is drawn in the transcript as a
 * rule with the other paths named on it. That is the right thing to read when
 * you reach it, and no help at all in finding it: on a forty-turn thread the
 * only way to learn there is a fork, or to get back to one, is to scroll until
 * you meet it. This is the map.
 *
 * A hairline standing for the whole thread, with one DOT per seam at the height
 * that seam actually sits at, and the one you last passed filled. Click a dot
 * and the thread goes there.
 *
 * A dot, not a tick. The first cut of this drew the outline's 1px hairline mark,
 * which is right in a note — forty of them stacked read as a column, and you
 * click the panel, not the ticks. Here there are one or two, they are the only
 * way in, and a 1px target is not one: you cannot hit it, and at rest you cannot
 * really see it either. So the mark is a dot with a 15px square of hit area
 * around it, which is a control rather than a decoration.
 *
 * THE HAIRLINE IS NOT DECORATION EITHER. A thread has one fork, or two, and a
 * single dot floating in an empty margin says "something is here" without
 * saying where — it has nothing to be a position ON. The line is the thread;
 * the dot is a place on it.
 *
 * Geometry is the outline's, verbatim and for its reasons (see Outline.tsx): an
 * overlay SIBLING of the scrollport, never in flow beside it — which would
 * shift the measure and re-wrap the words — and never inside it, which would
 * scroll it away. It hangs in the pane's own 26px minimum padding and costs the
 * transcript no width at all, which is why there is no open shape here: seven
 * elements share the chat pane's gutter, and making room for labels would put
 * the tab strip and the composer on a different column from the words. The
 * labels already exist, on the seam itself.
 */

/** One fork, placed. */
export interface PathMark {
  /** How far down the whole transcript it sits, 0–1. */
  frac: number
  /** The ways OUT of this seam, named — not the path you are reading. */
  label: string
  /** What that path is doing while you are not on it. */
  busy: 'answering' | 'asking' | null
}

/** The hit target. The dot inside it is 5px; this is what your mouse gets. */
const HIT = 15
/** The dot itself, and the one you last went past. */
const DOT = 5
const DOT_ON = 7

export default function PathTicks({
  marks,
  active,
  onGo
}: {
  marks: PathMark[]
  /** The seam last passed on the way down, or -1 above the first. */
  active: number
  onGo: (i: number) => void
}): React.JSX.Element | null {
  if (!marks.length) return null
  return (
    <div
      style={{
        position: 'absolute',
        // Clear of the compact bar, which is absolute at top 0 over this.
        top: 64,
        left: 0,
        right: 0,
        bottom: 26,
        display: 'flex',
        justifyContent: 'center',
        // The overlay reproduces the scrollport's own centring so its inner box
        // IS the text column, and the rail hangs off that with a plain negative
        // left rather than any arithmetic.
        padding: '0 26px',
        // The transcript stays clickable through all of this; the ticks take
        // their own events back.
        pointerEvents: 'none'
      }}
    >
      <div style={{ width: '100%', maxWidth: 620, position: 'relative' }}>
        <div
          data-path-ticks="1"
          aria-label="Where this thread forks"
          style={{
            position: 'absolute',
            left: -HIT - 8,
            top: 0,
            bottom: 0,
            width: HIT,
            pointerEvents: 'auto'
          }}
        >
          {/* The thread itself, as a line — and the dots sit ON it, centred. */}
          <div
            style={{
              position: 'absolute',
              left: HIT / 2 - 0.5,
              top: 0,
              bottom: 0,
              width: 1,
              background: 'var(--hair)'
            }}
          />
          {marks.map((m, i) => {
            const on = i === active
            return (
              <button
                type="button"
                key={i}
                className="toc-btn path-tick"
                data-path-tick={i}
                data-path-tick-on={on ? '1' : '0'}
                data-path-tick-busy={m.busy ?? ''}
                onClick={() => onGo(i)}
                title={
                  m.busy === 'answering'
                    ? `Still answering — ${m.label}`
                    : m.busy === 'asking'
                      ? `Waiting on you — ${m.label}`
                      : `Go to where this parts — ${m.label}`
                }
                style={{
                  position: 'absolute',
                  left: 0,
                  // The BUTTON is the hit area and is centred on the fraction;
                  // the dot it draws is the small thing inside it.
                  top: `calc(${(m.frac * 100).toFixed(3)}% - ${HIT / 2}px)`,
                  width: HIT,
                  height: HIT,
                  padding: 0,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: 'transparent'
                }}
              >
                <span
                  className="path-dot"
                  style={{
                    width: on ? DOT_ON : DOT,
                    height: on ? DOT_ON : DOT,
                    borderRadius: 99,
                    // The one you last passed is filled; the rest are outlined,
                    // so a glance says where you are as well as where they are.
                    background: on ? 'var(--ink)' : 'var(--sheet)',
                    boxShadow: on ? 'none' : 'inset 0 0 0 1px var(--rule)',
                    // A path still writing while you are on another one is the
                    // one thing here that is news; today it is invisible until
                    // you scroll to its seam.
                    animation:
                      m.busy === 'answering' ? 'cursorBlink 1.4s ease-in-out infinite' : undefined
                  }}
                />
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
