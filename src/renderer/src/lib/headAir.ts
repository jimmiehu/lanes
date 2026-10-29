/**
 * THE AIR A HEADING KEEPS INSIDE ITS OWN BOX, above its words, in READ.
 *
 * `##` keeps its hairline and the 13px under it there; the 30px above the rule
 * is margin, outside the box. `###` keeps its 22px of padding. The outline
 * lands a heading's box 22px under the top of the pane, so READ's words land
 * at 22px plus this.
 *
 * WRITE cannot do the same with its boxes: an editor line has no margin, so
 * all of a heading's air is padding inside the line, and landing that box at
 * 22px put the words ten and more pixels lower than READ's — ⌘E after a jump
 * moved the heading you had just gone to. So WRITE lands the WORDS, at 22px
 * plus this, and the two agree. One number for both, so they cannot drift.
 *
 * A `##` that opens the note has no rule and no air in either mode.
 */
export const HEAD_AIR = { 2: 14, 3: 22 } as const

/** Where the outline lands a heading's box in READ, under the pane's top. */
export const LAND = 22
