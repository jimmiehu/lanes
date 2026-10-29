import { MIN_PAD, paneGutters } from '../lib/layout'

/**
 * The note outline — a contents overview in the pane's LEFT MARGIN, built to
 * its original design.
 *
 * It is an overlay sibling of the scrollport, never a child of it and never in
 * flow. That is the whole geometry:
 *
 * - In flow, a left column shifts the measure off centre and re-wraps the note
 *   the moment the outline mounts.
 * - Inside the scrollport it scrolls away with the document, and it changes
 *   `clientWidth` — which feeds the gutter measurement that decides whether to
 *   show it at all, a live feedback loop.
 *
 * The inner box is congruent with the text column, which is what makes the
 * arithmetic disappear: the panel hangs off it with a plain negative `left`.
 *
 * Two shapes. OPEN is a hairline column of headings with the section you are
 * reading marked on the rule. CLOSED is a stack of 1px ticks, one per heading,
 * length by level — still the overview: it says how many sections there are,
 * how they nest, and where you are.
 *
 * THE OPEN SHAPE IS ALWAYS IN THE MARGIN, and where there is no margin the PANE
 * MAKES ONE — see `paneGutters`. There used to be a second open shape for that
 * case: a floating sheet dropped over the left of the text, which is to say it
 * opened INTO the note and covered the words you had opened it to find. In a
 * split, which is where a note pane is narrow and therefore where that shape
 * always appeared, it covered them every time.
 *
 * Being over the words is also what made it dismiss on any outside click, and
 * what made a pin necessary to defeat that. One shape in a margin it does not
 * share needs neither: it is furniture, it stays where you put it, and it goes
 * when you say so — the chevron beside CONTENTS, or escape.
 */

export interface Head {
  /** Source line, which is also the anchor the document emits for it. */
  line: number
  level: 2 | 3
  text: string
}

/** The panel, and the gutter it needs before it can hang out in the margin. */
const PANEL_W = 146
const GAP = 26
export const TOC_ROOM = PANEL_W + GAP
/** The closed stack: as wide as its longest tick, and nothing more. */
const TICKS_W = 15

export default function Outline({
  rows,
  active,
  closed,
  measure,
  onToggle,
  onGo
}: {
  rows: Head[]
  /** Index of the section the reader is in, or -1. */
  active: number
  closed: boolean
  /** The document column's own max-width, so the overlay lands on top of it. */
  measure: number
  onToggle: () => void
  onGo: (line: number) => void
}): React.JSX.Element {
  return (
    <div
      style={{
        position: 'absolute',
        top: 64,
        left: 0,
        right: 0,
        bottom: 14,
        display: 'flex',
        justifyContent: 'center',
        /*
         * The overlay's inner box has to BE the text column, because the panel
         * hangs off it with a plain negative `left`. So it reproduces the
         * scrollport's own padding — including the room the pane keeps on the
         * left while this is open, or the panel would hang off a column that is
         * no longer where it thinks.
         */
        ...(closed
          ? { padding: `0 ${MIN_PAD}px` }
          : paneGutters(measure, TOC_ROOM)),
        // What keeps the note clickable through the overlay. The panel takes
        // its events back.
        pointerEvents: 'none'
      }}
    >
      <div style={{ width: '100%', maxWidth: measure, position: 'relative' }}>
        <nav
          aria-label="Contents"
          data-outline="1"
          data-outline-open={closed ? '0' : '1'}
          style={{
            position: 'absolute',
            // −26 rather than the original design's −19, and the tick stack's
            // own 11px indent dropped with it. Both numbers together put the
            // longest tick at −19 + 11 + 15 = +7 — SEVEN PIXELS UNDER THE
            // TEXT, which is the one thing the closed shape is supposed not to
            // do. The intent it states is exact and is what is built here: the
            // stack sits inside the pane's 26px padding, hard against its outer
            // edge, and the longest tick stops 11px clear of the column.
            // One place, both shapes: hard against the outer edge of the
            // margin the pane keeps for it. The panel needs no ground of its
            // own because nothing is underneath it.
            left: closed ? -TICKS_W - 11 : -TOC_ROOM,
            top: 0,
            width: closed ? TICKS_W : PANEL_W,
            maxHeight: '100%',
            overflowY: 'auto',
            pointerEvents: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
            padding: 0,
            background: 'transparent'
          }}
        >
          {closed ? (
            <button
              type="button"
              className="toc-btn toc-ticks"
              onClick={onToggle}
              aria-expanded={false}
              title="Contents"
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 5,
                padding: '5px 0',
                alignSelf: 'flex-start'
              }}
            >
              {rows.map((h, i) => (
                <div
                  key={h.line}
                  data-outline-line={h.line}
                  data-outline-on={i === active ? '1' : '0'}
                  style={{
                    width: i === active ? 15 : h.level === 2 ? 11 : 6,
                    height: 1,
                    background: i === active ? 'var(--mute)' : 'var(--dot)'
                  }}
                />
              ))}
            </button>
          ) : (
            <>
              {/* The one piece of chrome the feature adds, in the smallest type
                  in the app. */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, paddingLeft: 10 }}>
                <button
                  type="button"
                  className="toc-btn toc-head"
                  onClick={onToggle}
                  aria-expanded
                  title="Hide contents"
                  style={{ display: 'flex', alignItems: 'center', gap: 6 }}
                >
                  <svg
                    width="8"
                    height="8"
                    viewBox="0 0 14 14"
                    fill="none"
                    stroke="var(--faint)"
                    strokeWidth="1.7"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    style={{ flex: 'none' }}
                  >
                    <path d="M3 5.5l4 4 4-4" />
                  </svg>
                  <div
                    style={{
                      font: '600 8px var(--mono)',
                      letterSpacing: '.16em',
                      color: 'var(--faint)'
                    }}
                  >
                    CONTENTS
                  </div>
                </button>
              </div>

              {/* No gap: the per-row hairlines must touch, or they stop reading
                  as one rule down the outline. */}
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {rows.map((h, i) => {
                  const here = i === active
                  const h2 = h.level === 2
                  return (
                    <button
                      type="button"
                      key={h.line}
                      className="toc-btn toc-row"
                      data-outline-line={h.line}
                      data-outline-on={here ? '1' : '0'}
                      aria-current={here ? 'true' : undefined}
                      onClick={() => onGo(h.line)}
                      // The label is truncated, and h2 is uppercased, so the
                      // tooltip carries the heading as it was written.
                      title={h.text}
                      style={{ display: 'flex', gap: 9, padding: '1px 0', width: '100%' }}
                    >
                      {/* The section you are reading is a mark on a rule — no
                          highlight, no chip, no background. */}
                      <div
                        style={{
                          width: 1,
                          flex: 'none',
                          alignSelf: 'stretch',
                          background: here ? 'var(--ink)' : 'var(--hair)'
                        }}
                      />
                      <div
                        style={{
                          flex: 1,
                          minWidth: 0,
                          padding: `2px 0 2px ${h2 ? 10 : 20}px`,
                          // h2 is uppercase mono because that is how the
                          // DOCUMENT draws an h2. The outline must not invent a
                          // hierarchy the page does not show.
                          font: h2
                            ? '600 9px/1.5 var(--mono)'
                            : '400 11px/1.5 var(--sans)',
                          letterSpacing: h2 ? '.14em' : '-.002em',
                          textTransform: h2 ? 'uppercase' : 'none',
                          // A step louder than it was, because the DOCUMENT's
                          // headings became a step louder: the outline must
                          // read as the same hierarchy, at the same volume, or
                          // it stops looking like the note's own contents.
                          color: here ? 'var(--ink)' : h2 ? 'var(--ink3)' : 'var(--mute)',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap'
                        }}
                      >
                        {h.text}
                      </div>
                    </button>
                  )
                })}
              </div>
            </>
          )}
        </nav>
      </div>
    </div>
  )
}
