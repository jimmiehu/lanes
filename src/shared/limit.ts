/**
 * Reading a usage limit out of whatever the CLI said.
 *
 * A limit is the one error that is not a fault. Nothing is broken, nothing
 * needs fixing, and the only useful fact is WHEN IT LIFTS — which is exactly
 * what a wall of stderr on the code ground fails to say. So it is picked out
 * here and drawn as its own thing, with the time counting down.
 *
 * The CLI says it several ways depending on version, plan and which ceiling was
 * hit, so this reads all of them and — this is the important part — returns
 * null for anything it is not sure about. An error wrongly dressed up as a
 * limit is worse than a limit shown as plain stderr: one is ugly, the other is
 * a lie about why your message did not send.
 */

export type LimitScope = 'session' | 'weekly' | 'credit'

export interface LimitNotice {
  scope: LimitScope
  /** Epoch ms when it lifts, or null where the CLI did not say. */
  resetsAt: number | null
  /** The CLI's own sentence, kept for the disclosure. */
  said: string
}

/** Any of these means a ceiling, not a failure. */
const HIT =
  /(usage|spend|credit)\s+limit\s+reached|limit\s+reached|reached\s+your\s+(weekly\s+)?usage\s+limit|credit\s+balance\s+(is\s+)?too\s+low|upgrade\s+to\s+increase\s+your\s+usage\s+limit/i

/**
 * The things that merely mention a limit while meaning something else. Every
 * one of these is a real fault with a real remedy, and none of them lifts on a
 * clock — a countdown over any of them would be a lie.
 */
const NOT_A_LIMIT =
  /(rate.?limit|context|token|output|size|depth|concurrency|budget|nesting|eventcount|subagent|watch)\s*limit|limit\s+reached\b[^\n]*\b(sub)?agents?\b/i

function scopeOf(text: string): LimitScope {
  if (/weekly/i.test(text)) return 'weekly'
  if (/credit|spend|balance/i.test(text)) return 'credit'
  return 'session'
}

/**
 * The moment it lifts. Every shape the CLI is known to use, most specific
 * first, and null rather than a guess: a countdown to a time nobody said is
 * worse than no countdown.
 */
export function resetAt(text: string, now = Date.now()): number | null {
  // `Claude AI usage limit reached|1788282000` — the headless form, and the
  // only one that is exact. Seconds or milliseconds, both seen.
  const piped = /\|\s*(\d{10,13})\b/.exec(text)
  if (piped) {
    const n = Number(piped[1])
    const ms = piped[1].length >= 13 ? n : n * 1000
    if (ms > now - 86_400_000) return ms
  }

  // `resets 2026-08-08 00:00 UTC`, and the ISO the API uses.
  const stamp = /(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2})(?::\d{2})?\s*(Z|UTC|[+-]\d{2}:?\d{2})?/i.exec(
    text
  )
  if (stamp) {
    const zone = stamp[3]
    const iso =
      !zone || /^(Z|UTC)$/i.test(zone)
        ? `${stamp[1]}T${stamp[2]}:00Z`
        : `${stamp[1]}T${stamp[2]}:00${zone.length === 5 ? `${zone.slice(0, 3)}:${zone.slice(3)}` : zone}`
    const ms = Date.parse(iso)
    if (!Number.isNaN(ms)) return ms
  }

  // `resets in 2h 15m`, `try again in 45 minutes`.
  const rel = /\b(?:in|after)\s+(?:(\d+)\s*h(?:ours?)?)?[\s,]*(?:(\d+)\s*m(?:in(?:ute)?s?)?)?/i.exec(
    text
  )
  if (rel && (rel[1] || rel[2])) {
    const ms = (Number(rel[1] ?? 0) * 60 + Number(rel[2] ?? 0)) * 60_000
    if (ms > 0) return now + ms
  }

  /*
   * `resets at 3pm`, `resets at 15:30`. A wall-clock time with no date, which
   * means the next time the clock reads that — today if it is still ahead,
   * tomorrow if it has gone. Read in LOCAL time, since that is the clock the
   * CLI printed it from and the one the reader is looking at.
   */
  const clock = /\b(?:reset|resets|available|back|again)\b[^.\n]{0,24}?\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/i.exec(
    text
  )
  if (clock) {
    let h = Number(clock[1])
    const m = Number(clock[2] ?? 0)
    const half = clock[3]?.toLowerCase()
    if (half === 'pm' && h < 12) h += 12
    if (half === 'am' && h === 12) h = 0
    if (h <= 23 && m <= 59 && (half || clock[2] || h <= 23)) {
      const at = new Date(now)
      at.setHours(h, m, 0, 0)
      let ms = at.getTime()
      if (ms <= now) ms += 86_400_000
      // A window that lifts more than a day out was not a wall clock.
      if (ms - now <= 86_400_000) return ms
    }
  }
  return null
}

/** The limit in `text`, or null if it is not one. */
export function limitIn(text: string | null | undefined, now = Date.now()): LimitNotice | null {
  if (!text) return null
  /*
   * LINE BY LINE, not blob by blob.
   *
   * stderr arrives with whatever else the CLI had to say attached, and both
   * halves of the question get the wrong answer from a blob. A limit whose
   * paragraph happens to mention tokens is still a limit; a subagent-depth
   * error in the same stream as the word "usage" is still not one. So the
   * verdict is taken from ONE line — the first that says a ceiling was hit and
   * is not one of the ceilings that are really faults.
   */
  const lines = text.split('\n').map((l) => l.trim())
  const line = lines.find((l) => HIT.test(l) && !NOT_A_LIMIT.test(l))
  if (!line) return null
  const said = line.replace(/\|\s*\d{10,13}\b/, '').trim() || line
  /*
   * The time may not be on that line — "resets at 3pm" often follows on the
   * next one — so its own line is asked first and the whole blob second.
   */
  return {
    scope: scopeOf(line),
    resetsAt: resetAt(line, now) ?? resetAt(text, now),
    said
  }
}

/** `2:14:03`, and `0:00` once it is up. Tabular, so it does not jitter. */
export function countdown(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  const pad = (n: number): string => String(n).padStart(2, '0')
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`
}

/** "21:30", in the reader's own clock. */
export function clockAt(ms: number): string {
  return new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

/** What the ceiling is called, in the app's own voice. */
export const LIMIT_LABEL: Record<LimitScope, string> = {
  session: 'USAGE LIMIT',
  weekly: 'WEEKLY LIMIT',
  credit: 'CREDIT LIMIT'
}
