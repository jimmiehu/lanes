import type { HighlightId, ThemeId, ResolvedTheme } from '@shared/types'

/**
 * The whole theme switch: one attribute on the root. No component knows which
 * mode it is in — they read variables, and that attribute decides what those
 * variables mean.
 *
 * Appearance is a three-state preference and `auto` is a real third state, not
 * a checkbox: it defers to the system rather than storing a value. A document
 * cannot wear "auto", so we store the PREFERENCE and derive what the document
 * wears — `data-theme` on the root is only ever 'light' or 'dark'.
 */

const DARK = '(prefers-color-scheme: dark)'

export const THEME_ORDER: ThemeId[] = ['light', 'dark', 'auto']

/** The next appearance in the top bar's cycle: light → dark → auto → light. */
export function cycleTheme(current: ThemeId): ThemeId {
  const at = THEME_ORDER.indexOf(current)
  return THEME_ORDER[(at + 1) % THEME_ORDER.length]
}

export function systemTheme(): ResolvedTheme {
  return window.matchMedia(DARK).matches ? 'dark' : 'light'
}

export function resolveTheme(pref: ThemeId): ResolvedTheme {
  return pref === 'auto' ? systemTheme() : pref
}

/**
 * Subscribe to the system flipping at dusk. Without this, `auto` would only be
 * read at launch and the document would keep whatever it resolved to then.
 * Returns the unsubscribe.
 */
export function onSystemThemeChange(fn: (next: ResolvedTheme) => void): () => void {
  const mq = window.matchMedia(DARK)
  const handler = (e: MediaQueryListEvent): void => fn(e.matches ? 'dark' : 'light')
  mq.addEventListener('change', handler)
  return () => mq.removeEventListener('change', handler)
}

export const TEXT_STEPS = [0.92, 1, 1.12, 1.26]
export const TEXT_LABELS = ['Small', 'Default', 'Large', 'Larger']

/** The next step in `dir`, from whichever step the current scale is nearest. */
export function stepText(current: number, dir: number): number {
  const at = TEXT_STEPS.reduce(
    (best, v, j) => (Math.abs(v - current) < Math.abs(TEXT_STEPS[best] - current) ? j : best),
    0
  )
  return TEXT_STEPS[Math.max(0, Math.min(TEXT_STEPS.length - 1, at + dir))]
}

/** The reading measure, in px. Tweakable in Settings; 620 is the default. */
export const MEASURE_MIN = 520
export const MEASURE_MAX = 860
export const MEASURE_STEP = 20
export const MEASURE_DEFAULT = 620

/** The highlight colour: `data-hl` on the root picks `--hl` (styles/tokens.css). */
export function applyHighlight(id: HighlightId | undefined): void {
  const root = document.documentElement
  if (!id || id === 'yellow') delete root.dataset.hl
  else root.dataset.hl = id
}

export function applyTheme(theme: ThemeId, textScale = 1, measure = MEASURE_DEFAULT): void {
  const root = document.documentElement
  root.dataset.theme = resolveTheme(theme)
  root.style.setProperty('--msg-sm', `${(11.5 * textScale).toFixed(2)}px`)
  root.style.setProperty('--measure', `${measure}px`)
  // Accents are cut: the palette is achromatic and identity is carried by
  // uppercase mono labels. Clear any attribute a v2 state file left behind.
  delete root.dataset.accent
}
