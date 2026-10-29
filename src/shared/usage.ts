/**
 * How much of the usage windows is gone, read off the stream.
 *
 * Every turn the CLI runs ends with a `rate_limit_event` — what the API's
 * rate-limit headers said about this account: the five-hour session window and
 * the week, how much of each is used and when each resets. The session clock
 * used to be a clock you set because "nothing in the stream says when a window
 * opened". True, and beside the point: the stream says when it ENDS, which is
 * the one thing the clock holds.
 *
 * Two things bound what may be read from it, and both are here:
 *
 *   - The per-window figures sit under `unifiedWindows`, which the CLI's own
 *     schema marks `@internal`. They are the only place either window's
 *     percentage is said — the top-level `utilization` is usually absent — so
 *     they are read first, and everything still works without them.
 *   - The documented top level (`status`, `resetsAt`, `rateLimitType`) is
 *     about whichever window is LIMITING, which can be the week. Its reset is
 *     the session's only when `rateLimitType` says `five_hour`; taken for the
 *     session's otherwise, the clock would be set days out.
 *
 * And the house rule from `limit.ts`: a figure nobody said is worse than none,
 * so anything that does not read comes back null rather than guessed.
 */

export type UsageStatus = 'allowed' | 'allowed_warning' | 'rejected'

export interface UsageWindow {
  /** The fraction used — 0.17 is 17%. Past 1 is real: use can run over a cap. Null where unsaid. */
  used: number | null
  /** Epoch ms it resets at. */
  resetsAt: number
}

export interface Usage {
  /** The five-hour window. */
  session: UsageWindow | null
  /** The seven-day window. */
  week: UsageWindow | null
  /** The CLI's own word for where the limiting window stands. */
  status: UsageStatus | null
  /** Which window `status` is about. */
  limiting: 'session' | 'week' | null
  /** When it was said. Figures arrive only with a turn, so they are as of this, not of now. */
  seen: number
}

const STATUSES: UsageStatus[] = ['allowed', 'allowed_warning', 'rejected']

const record = (v: unknown): Record<string, unknown> | null =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null

/** Seconds or milliseconds — both are epochs the CLI has used — as ms; null for anything else. */
function epoch(v: unknown): number | null {
  if (typeof v !== 'number' || !Number.isFinite(v) || v <= 0) return null
  return v >= 1e12 ? Math.round(v) : Math.round(v * 1000)
}

function fraction(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null
}

function windowOf(v: unknown): UsageWindow | null {
  const w = record(v)
  const resetsAt = w ? epoch(w.resetsAt) : null
  return w && resetsAt !== null ? { used: fraction(w.utilization), resetsAt } : null
}

/**
 * The `rate_limit_info` of one event, read. Null when nothing in it could be
 * read at all — a malformed event says nothing, rather than "0%".
 */
export function readUsage(info: unknown, now = Date.now()): Usage | null {
  const i = record(info)
  if (!i) return null
  const status = STATUSES.includes(i.status as UsageStatus) ? (i.status as UsageStatus) : null
  const type = typeof i.rateLimitType === 'string' ? i.rateLimitType : null
  const limiting = type === 'five_hour' ? 'session' : type?.startsWith('seven_day') ? 'week' : null
  const unified = record(i.unifiedWindows)
  let session = windowOf(unified?.five_hour)
  let week = windowOf(unified?.seven_day)
  // The documented fields, for the one window they are about — and only the
  // plain seven-day one for the week: a per-model weekly window resets on its
  // own clock, and is not "the week".
  const top = epoch(i.resetsAt)
  if (!session && type === 'five_hour' && top !== null)
    session = { used: fraction(i.utilization), resetsAt: top }
  if (!week && type === 'seven_day' && top !== null)
    week = { used: fraction(i.utilization), resetsAt: top }
  if (!session && !week && !status) return null
  return { session, week, status, limiting, seen: now }
}

/** The window as it stands now — null once it has reset, since its figures were about a window that is over. */
export function live(w: UsageWindow | null | undefined, now = Date.now()): UsageWindow | null {
  return w && w.resetsAt > now ? w : null
}

/**
 * What is known after `next` arrives. Newest wins, window by window: an event
 * that says nothing about the week does not wipe a week that is still running,
 * and a window that has reset is dropped rather than carried.
 */
export function mergeUsage(prev: Usage | null, next: Usage, now = Date.now()): Usage {
  return {
    session: next.session ?? live(prev?.session, now),
    week: next.week ?? live(prev?.week, now),
    status: next.status,
    limiting: next.limiting,
    seen: next.seen
  }
}

/** The share in whole percent — the one rounding the figure is said with and coloured by. */
const whole = (used: number): number => Math.round(used * 100)

/** `17%` — whole percent, never a decimal the CLI did not mean. */
export function percent(used: number): string {
  return `${whole(used)}%`
}

/**
 * The CLI's own word about one window: its `status`, when that window is the
 * one limiting. Anything not the week's is the session's, as the clock has
 * always taken it. Null when the word is about the other window.
 */
export function statusOf(usage: Usage | null | undefined, which: 'session' | 'week'): UsageStatus | null {
  if (!usage?.status) return null
  return (usage.limiting === 'week') === (which === 'week') ? usage.status : null
}

/** How a window's figure is coloured: on the ink ramp, running low, or nearly gone. */
export type Tone = 'plain' | 'warn' | 'alarm'

/** Orange from here, red from there, in whole percent. */
const WARN_AT = 70
const ALARM_AT = 90

/**
 * The colour a window's figure takes, said once, so the ring, the card and
 * their checks cannot disagree about where 70% is.
 *
 * By the share AS SHOWN — whole percent, rounded as `percent` rounds it — so a
 * figure that reads `70%` is never drawn plain beside the words saying so. The
 * CLI's own word can only raise it: a warning is orange at any share, a turn
 * it refused is red. No share and no word is plain.
 */
export function tone(used: number | null, status: UsageStatus | null = null): Tone {
  const shown = used === null ? null : whole(used)
  const byShare: Tone =
    shown === null ? 'plain' : shown >= ALARM_AT ? 'alarm' : shown >= WARN_AT ? 'warn' : 'plain'
  if (status === 'rejected') return 'alarm'
  if (status === 'allowed_warning' && byShare === 'plain') return 'warn'
  return byShare
}
