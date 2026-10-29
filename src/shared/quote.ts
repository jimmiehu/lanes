import type { QuoteBlock } from './types'

/**
 * Quoting a note into a chat, both directions.
 *
 * The excerpt cannot travel as a block: the model reads the text of a turn, not
 * the app's idea of its structure, so a quote is inlined into what is sent and
 * the reader is shown a block built separately. That leaves the transcript
 * holding scaffolding nobody typed — and a turn that streamed as a quote read
 * back, for a long time, as literal `From the note "…":` prose with `>` markers
 * down its left.
 *
 * Writing it and reading it back live here together, in the one module, because
 * they are two halves of a single format. Apart, they drifted.
 */

export function quoteWire(quote: { label: string; text: string }, said: string): string {
  return `From the note "${quote.label}":\n\n> ${quote.text.replace(/\n/g, '\n> ')}\n\n${said}`
}

/*
 * The label is greedy on purpose. A note's title is its own H1 and goes onto
 * the wire unescaped, so a title with a quotation mark in it — `A. A. "Ada"
 * Lovelace`, and plenty of others like it — ended the label group early and
 * failed the whole match, leaving the reader the scaffolding and the thread a
 * name beginning `From the note "`. Greedy is safe here: neither `.` nor
 * `[^\n]` crosses a newline, and the `":` has to be followed by a blank line,
 * so the label cannot reach past the header line it sits on.
 */
const QUOTED = /^From the note "(.+)":\n\n((?:>[^\n]*(?:\n|$))+)\n?([\s\S]*)$/

/** The words back, and the block they were sent under. */
export function unquote(text: string): { said: string; quote: QuoteBlock | null } {
  const m = QUOTED.exec(text)
  if (!m) return { said: text, quote: null }
  const body = m[2]
    .split('\n')
    .filter((l) => l.startsWith('>'))
    .map((l) => l.replace(/^>\s?/, ''))
    .join('\n')
  return { said: m[3].trim(), quote: { kind: 'quote', label: m[1], text: body } }
}
