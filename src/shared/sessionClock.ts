/**
 * The session clock — how long is left in the five-hour usage window.
 *
 * Nothing in the stream says when the window opened, so this is a clock you set
 * rather than one that is read: you start it when the window starts, and it
 * counts to the moment it resets. What it holds is that moment, an epoch, not
 * a duration — a duration would start again every time the app did.
 *
 * What can be typed into it is said here once, so the field and its check
 * agree on it.
 */

/** The length of one session window. */
export const SESSION_MS = 5 * 3_600_000

/**
 * What the field means, read from what was typed:
 *
 *   `5:00`, `3:20`, `2h30`, `2h 30m`, `90m`       — that much is left
 *   `3`, `45`                                      — hours up to 5, else minutes
 *   `@17:40`, `at 17:40`, `at 5pm`                 — it resets then (next time
 *                                                    the clock reads that)
 *   empty, `0`, `off`, `clear`                     — no clock at all
 *
 * Returns the epoch it ends at, 'off', or null for something it cannot read —
 * which is a no, never a guess: a clock set to a time nobody meant is worse
 * than the clock you had.
 */
export function readSession(text: string, now = Date.now()): number | 'off' | null {
  const t = text.trim().toLowerCase()
  if (t === '' || t === '0' || t === 'off' || t === 'clear') return 'off'

  const at = /^(?:@|at\s+)\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/.exec(t)
  if (at) {
    let h = Number(at[1])
    const m = Number(at[2] ?? 0)
    if (at[3] === 'pm' && h < 12) h += 12
    if (at[3] === 'am' && h === 12) h = 0
    if (h > 23 || m > 59) return null
    const d = new Date(now)
    d.setHours(h, m, 0, 0)
    let ms = d.getTime()
    if (ms <= now) ms += 86_400_000
    return ms
  }

  let mins: number | null = null
  const colon = /^(\d{1,2}):(\d{2})$/.exec(t)
  const hm = /^(?:(\d{1,2})\s*h)?\s*(?:(\d{1,3})\s*m?)?$/.exec(t)
  if (colon) {
    if (Number(colon[2]) > 59) return null
    mins = Number(colon[1]) * 60 + Number(colon[2])
  } else if (/^\d{1,3}$/.test(t)) {
    // A bare number is hours up to the window's own five — "3" left is three
    // hours — and minutes past it, since no window has 45 hours in it.
    mins = Number(t) <= 5 ? Number(t) * 60 : Number(t)
  } else if (hm && (hm[1] || hm[2])) {
    mins = Number(hm[1] ?? 0) * 60 + Number(hm[2] ?? 0)
  }
  if (mins === null || mins <= 0 || mins > 24 * 60) return null
  return now + mins * 60_000
}

/**
 * `4:12` — hours and minutes, rounded UP, so it reads `0:01` through the last
 * minute and `0:00` only once the window has reset.
 */
export function sessionLeft(ms: number): string {
  const mins = Math.max(0, Math.ceil(ms / 60_000))
  return `${Math.floor(mins / 60)}:${String(mins % 60).padStart(2, '0')}`
}
