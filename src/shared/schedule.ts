import type { Schedule } from './types'

/**
 * When a scheduled prompt runs — all of it pure, so the rule the scheduler fires
 * by and the line Settings shows can be held to the same answers in node.
 *
 * A SLOT is one scheduled moment: a day the schedule names, at its time, in the
 * Mac's own clock. It is known by its local date and time, `2026-10-07 06:00`,
 * rather than by an epoch — the clock change in October repeats an hour, and a
 * slot in it must still be one slot, run once.
 */

/** `HH:MM` from what was typed: `6`, `6:00`, `06:00`, `18:30`, `6am`, `6:30pm`. Null for anything else — a schedule set to a time nobody meant is worse than none. */
export function readTime(text: string): string | null {
  const t = text.trim().toLowerCase().replace(/\s+/g, '')
  const m = /^(\d{1,2})(?::(\d{2}))?(am|pm)?$/.exec(t)
  if (!m) return null
  let h = Number(m[1])
  const min = Number(m[2] ?? 0)
  if (m[3]) {
    if (h < 1 || h > 12) return null
    if (m[3] === 'pm' && h < 12) h += 12
    if (m[3] === 'am' && h === 12) h = 0
  }
  if (h > 23 || min > 59) return null
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`
}

const pad = (n: number): string => String(n).padStart(2, '0')

/** The slot's name: its local date and time. */
export function slotKey(at: number): string {
  const d = new Date(at)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/**
 * `time` on the calendar day `offset` days from the one holding `now`. By the
 * calendar, not by 24-hour steps: the day the clocks go back is 25 hours long,
 * and stepping a day of milliseconds back from its first hour lands on the
 * same date again.
 */
function onDay(now: number, offset: number, time: string): { slot: number; weekday: number } {
  const [h, m] = time.split(':').map(Number)
  const d = new Date(now)
  d.setDate(d.getDate() + offset)
  d.setHours(h, m, 0, 0)
  return { slot: d.getTime(), weekday: d.getDay() }
}

function usable(s: Schedule | null | undefined): s is Schedule {
  return Boolean(s && s.on && s.days.length && readTime(s.time) === s.time)
}

/** The latest slot at or before `now`, looking back a week; null if there is none. */
export function lastSlot(s: Schedule, now: number): number | null {
  for (let back = 0; back <= 7; back++) {
    const { slot, weekday } = onDay(now, -back, s.time)
    if (s.days.includes(weekday) && slot <= now) return slot
  }
  return null
}

/** The first slot after `now`, for saying when it next runs. Null when it never will. */
export function nextSlot(s: Schedule | null | undefined, now: number): number | null {
  if (!usable(s)) return null
  for (let ahead = 0; ahead <= 8; ahead++) {
    const { slot, weekday } = onDay(now, ahead, s.time)
    if (s.days.includes(weekday) && slot > now && slot >= s.since) return slot
  }
  return null
}

/**
 * The slot to run NOW, or null. One that has come, has not run (`ran` is the
 * last slot that did), falls on today's date, and came after the schedule was
 * set. Today's date is the whole catch-up rule: a Mac asleep at 6:00 runs the
 * morning prompt when it wakes at 7:31, one asleep all day does not run it at
 * 23:00 the next, and a week away is one slot missed, not seven runs owed.
 */
export function dueSlot(s: Schedule | null | undefined, ran: string | null | undefined, now: number): string | null {
  if (!usable(s)) return null
  const slot = lastSlot(s, now)
  if (slot === null || slot < s.since) return null
  if (new Date(slot).toDateString() !== new Date(now).toDateString()) return null
  const key = slotKey(slot)
  return key === ran ? null : key
}

const NAMES = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT']

/** `WEEKDAYS 06:00`, `MON 08:40`, `DAILY 07:00` — the schedule in the voice a row labels in. */
export function describe(s: Schedule | null | undefined): string {
  if (!s || !s.days.length) return ''
  const days = [...new Set(s.days)].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7))
  const set = days.join(',')
  const when =
    days.length === 7
      ? 'DAILY'
      : set === '1,2,3,4,5'
        ? 'WEEKDAYS'
        : set === '6,0'
          ? 'WEEKENDS'
          : days.map((d) => NAMES[d]).join(' ')
  return `${when} ${s.time}`
}
