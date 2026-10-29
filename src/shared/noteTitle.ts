/**
 * WHAT A NOTE IS CALLED — one rule, read by main (the index, the rail) and by
 * the renderer (the tab, the head, as you type), so the three never disagree
 * about the same note.
 */

/** A note made by ⌘N and not named yet: `untitled.md`, `untitled-2.md`, … */
export const UNTITLED = /(^|\/)untitled(-\d+)?\.md$/

/**
 * The first line of a note's writing, as a name: markers off, links as their
 * words, cut at a word. What a note nobody named is called — see `titleOf` in
 * main — and what the head's empty title field shows it will be called.
 */
export function firstWords(body: string): string {
  for (const line of body.split('\n')) {
    if (/^#(\s|$)/.test(line)) continue
    const text = line
      .replace(/^\s*([-*+]\s+(\[[ xX]\]\s+)?|\d+[.)]\s+|>\s?)/, '')
      .replace(/\[\[(?:[^\]|]*\|)?([^\]]*)\]\]/g, '$1')
      .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
      .replace(/[*_`~]/g, '')
      .trim()
    if (!text) continue
    if (text.length <= 60) return text
    const cut = text.slice(0, 60)
    const at = cut.lastIndexOf(' ')
    return `${(at > 30 ? cut.slice(0, at) : cut).trimEnd()}…`
  }
  return ''
}
