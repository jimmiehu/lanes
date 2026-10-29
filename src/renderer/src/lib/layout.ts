/**
 * How a pane spends its width.
 *
 * v2 had a shedding table: thirteen controls dropping out at ten thresholds as
 * a pane narrowed. It existed because the composer footer carried a model
 * picker, a safety badge, five effort chips, a context meter and a hint, and at
 * 400px they could not all be there.
 *
 * The redesign collapsed all of that into ONE status line that ellipsises, so
 * there is almost nothing left to shed. What remains is the rule the design
 * actually states: content is centred at the reading measure, and the panes
 * flex.
 * Everything keys off the pane's own MEASURED width — never off `split`, since
 * a single pane with the rail open is narrower than a split pane without it.
 */

/**
 * One rail, 250px. The 322px note column is gone: notes live in their own pane
 * now, and the rail's Folders mode is the tree it used to be.
 */
export const LEFT_RAIL = 250

/**
 * The shell's own chrome, which is not available to any pane: 10px of app
 * padding on each side, plus one 10px gutter per seam in the middle row. A
 * collapsed rail is still 11px of strip, not nothing.
 *
 * This has to be subtracted before the split is divided, or every width the
 * pane computes is wider than the one it was painted at.
 */
export const APP_PAD = 10
export const GUTTER = 10
export const RAIL_STRIP = 11

/**
 * Below this a pane stops centring and just uses its minimum margin. 26px is
 * the design's own pane padding, and it has to be the SAME number the tab strip
 * uses: two different minimums put the strip and the head on two different
 * columns the moment the pane is narrower than the measure.
 */
export const MIN_PAD = 26

export function paneWidth(
  vw: number,
  opts: { hideLeft: boolean; split: boolean; share?: number }
): number {
  const railL = opts.hideLeft ? RAIL_STRIP : LEFT_RAIL
  // Gutters: rail→pane, plus pane→pane when the split is open.
  const gutters = GUTTER * (opts.split ? 2 : 1)
  vw = vw - APP_PAD * 2 - gutters - railL
  // `share` is this pane's fraction of the split, which the seam can drag away
  // from half. A 30/70 split has to measure differently on each side.
  const share = opts.split ? (opts.share ?? 0.5) : 1
  return Math.max(240, vw * share)
}

/**
 * The pane's horizontal gutter, which is how the reading measure is applied.
 *
 * Expressed as padding rather than as a wrapper so every child that already
 * honours it lands on the column for free — a wrapper would have had to go
 * inside the transcript's scroller anyway, or the scrollbar would sit against
 * the text instead of against the pane.
 *
 * And expressed in CSS rather than in JavaScript, because the pane's width is
 * now ANIMATED: the rail slides between 250px and 11px, and a gutter computed
 * from a measured width would jump to its final value on the first frame and
 * sit there while the pane caught up. `calc` against the element's own width is
 * exact at every frame of the slide, by construction rather than by keeping two
 * animations in step.
 */
export function paneGutter(measure: number): string {
  return `max(${MIN_PAD}px, calc((100% - ${measure}px) / 2))`
}

/**
 * The same gutter, with room kept on the LEFT for the note outline.
 *
 * The outline is furniture in the margin. Where the pane is wide the centred
 * gutter is already margin enough and this changes nothing — `max` sees to
 * that. Where it is not, the pane makes the margin by moving its column right,
 * which is the whole of what "open it to the left" means: the panel takes the
 * margin, the words move over, and nothing is covered.
 *
 * The column stops being centred while it is open. That is the trade, and it is
 * the right way round: a reading measure that sits slightly left is a smaller
 * loss than a panel sitting on the first eleven characters of every line.
 */
export function paneGutters(
  measure: number,
  room: number
): { paddingLeft: string; paddingRight: string } {
  const centred = `calc((100% - ${measure}px) / 2)`
  return {
    paddingLeft: `max(${MIN_PAD + room}px, ${centred})`,
    paddingRight: `max(${MIN_PAD}px, ${centred})`
  }
}


