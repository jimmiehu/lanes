import { loadState, patchState } from './state'

/**
 * The context windows the CLI has said, per model, kept across launches — see
 * `shared/contextWindow.ts`. Read at once by every turn, so held here as well
 * as in the state file.
 */
let known: Record<string, number> = {}

export async function loadWindows(): Promise<void> {
  known = { ...(await loadState()).contextWindows }
}

export function windows(): Readonly<Record<string, number>> {
  return known
}

/** What a turn's `result` said. Written only when it is news. */
export function learnWindow(models: string[], window: number): void {
  if (!(window > 0)) return
  const fresh = models.filter((m) => m && known[m] !== window)
  if (!fresh.length) return
  for (const m of fresh) known[m] = window
  void patchState({ contextWindows: { ...known } })
}
