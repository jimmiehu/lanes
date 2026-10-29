/**
 * HOW THIS APP DECIDES THAT SOMETHING MATCHES — in one place, for everything
 * that searches: names in the palette, note bodies, transcript text, tasks.
 *
 * It was four places and four answers. The palette filtered names with a plain
 * `includes` of the whole query; the note index folded diacritics and had a
 * word rung; the body scan and the transcript scan took the query as one
 * literal string. So `vienna facts` found nothing at all — not the note called
 * "Vienna water — historical facts for the river essay", whose title holds
 * both words in the wrong order, and not the bodies that say them a sentence
 * apart. Meanwhile `cafe` found Café in a body and not in a title, because
 * only one of the two folded.
 *
 * TWO RUNGS, and the order between them is the whole design.
 *
 * PHRASE first: the query as it was typed, as a substring. A vault is full of
 * hyphenated slugs, paths and quoted phrases, and `companion plant` should
 * find `companion-planting` mid-word the way a reader means it. A phrase
 * hit is a strong claim and always outranks the other kind.
 *
 * WORDS second: every word of the query somewhere in the haystack, in any
 * order. This is what a person means by typing two words — "the thing with
 * vienna and facts in it" — and it is the rung that was missing everywhere.
 * Each word is still a substring, so `vien facts` works too.
 *
 * There is no third rung. Fuzzy subsequence matching (`vfacts`) is the usual
 * next step and it is not taken: on a vault of real size and its threads it
 * returns something for every query, which makes an empty result impossible
 * and therefore makes a result meaningless.
 */

/**
 * `Café` → `cafe`. NFD splits a letter from its accent, the accent is
 * dropped, and what is left is what people actually type. The one fold, used by
 * every corpus here — a title that folded and a body that did not was its own
 * small bug.
 */
export function fold(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
}

/** A query, folded and split once, rather than per candidate. */
export interface Query {
  /** The whole thing, folded, inner whitespace collapsed. */
  phrase: string
  /** Its words, folded. One word means the two rungs are the same test. */
  terms: string[]
  /** Nothing to match — every caller returns early on this. */
  empty: boolean
}

export function parseQuery(raw: string): Query {
  const phrase = fold(raw).trim().replace(/\s+/g, ' ')
  const terms = phrase.split(' ').filter(Boolean)
  return { phrase, terms, empty: !terms.length }
}

/** What a hit is worth. Higher is better, 0 is no match. */
export const PHRASE = 2
export const WORDS = 1

/**
 * How well a folded haystack answers the query.
 *
 * The haystack must already be folded — callers hold big corpora and fold them
 * once, at index time, rather than per keystroke.
 */
export function rank(q: Query, foldedHay: string): 0 | typeof WORDS | typeof PHRASE {
  if (q.empty) return 0
  if (foldedHay.includes(q.phrase)) return PHRASE
  // Single-word queries have already had their only chance above.
  if (q.terms.length < 2) return 0
  return q.terms.every((t) => foldedHay.includes(t)) ? WORDS : 0
}

/**
 * Where to centre a snippet: the first position at which the query has
 * something to show. The phrase if it is there, otherwise the LONGEST word —
 * the most specific one, and the least likely to point at a stray `the`.
 */
export function hitAt(q: Query, foldedHay: string): number {
  const whole = foldedHay.indexOf(q.phrase)
  if (whole !== -1) return whole
  let best = -1
  for (const t of [...q.terms].sort((a, b) => b.length - a.length)) {
    const at = foldedHay.indexOf(t)
    if (at !== -1) return at
  }
  return best
}
