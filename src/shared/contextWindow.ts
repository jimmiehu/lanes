/**
 * HOW MUCH A THREAD CAN HOLD — the window its context is measured against.
 *
 * The meter drew every thread against 200K, whatever ran it: a thread on a
 * long-window model read `828K / 200K`, the bar four times over, as if it had
 * broken a limit it never had. The CLI says the real window at the end of
 * every turn (`result.modelUsage[model].contextWindow`), so main keeps what it
 * was told, per model, and a thread is measured against its own model's.
 *
 * Where nothing has said — a model no turn of this app has run yet, a thread
 * read from disk — the configured window stands, but never below what was
 * sent: a context that held 828K was not a 200K one. The next window up is the
 * long one.
 */

export const BASE_WINDOW = 200_000
export const LONG_WINDOW = 1_000_000

export function windowFor(
  model: string | null | undefined,
  used: number,
  learned: Readonly<Record<string, number>>,
  base = BASE_WINDOW
): number {
  const told = model ? learned[model] : undefined
  const w = told && told > 0 ? told : base
  if (used <= w) return w
  return used <= LONG_WINDOW ? LONG_WINDOW : used
}

/** A count of tokens, said short: `828K`, `200K`, `1M`, `1.5M`. */
export function tokens(n: number): string {
  if (n >= 1_000_000) return `${+(n / 1_000_000).toFixed(1)}M`
  return `${Math.round(n / 1000)}K`
}
