// When a scheduled prompt runs.
//
// The rule the scheduler fires by, held in node: the last slot at or before
// now, the next one after it, and when a slot is owed a run. A slot runs at
// most once, only on its own date — a Mac asleep at 6:00 runs the morning
// prompt when it wakes that morning; a slot missed on Wednesday is not run on
// Thursday; a week away is one slot missed, not seven runs owed — and never
// before the schedule was set, so saving a 06:00 schedule at 10:05 does not
// run it on the spot. In the Mac's own clock, through the October clock change:
// 06:00 stays 06:00, and the hour that happens twice runs once.
//
// Pinned to Europe/London, so it reads the same on any Mac: UTC+1 until its
// change, at 02:00 on Sunday 25 October 2026, and UTC+0 after it.
//
//   node --experimental-strip-types checks/schedule.mjs
process.env.TZ = 'Europe/London'
const { describe, dueSlot, lastSlot, nextSlot, readTime, slotKey } = await import('../src/shared/schedule.ts')

let pass = 0
let fail = 0
const ok = (name, got, want) => {
  if (JSON.stringify(got) === JSON.stringify(want)) pass += 1
  else {
    fail += 1
    console.log(`  FAIL ${name}\n       got  ${JSON.stringify(got)}\n       want ${JSON.stringify(want)}`)
  }
}
const local = (y, mo, d, h, mi = 0) => new Date(y, mo - 1, d, h, mi).getTime()

// --- what a typed time means ---
for (const [typed, want] of [
  ['6', '06:00'],
  ['6:00', '06:00'],
  ['06:00', '06:00'],
  ['18:30', '18:30'],
  ['0', '00:00'],
  ['6am', '06:00'],
  ['6 pm', '18:00'],
  ['6:30pm', '18:30'],
  ['12am', '00:00'],
  ['12pm', '12:00'],
  ['24:00', null],
  ['7:60', null],
  ['13pm', null],
  ['', null],
  ['soon', null]
]) ok(`time ${JSON.stringify(typed)}`, readTime(typed), want)

// --- every work day at 6:00, set a week ago ---
const WEEKDAYS = { days: [1, 2, 3, 4, 5], time: '06:00', on: true, since: local(2026, 9, 30, 12) }
// Wednesday 7 October 2026.
ok('a minute before: nothing owed yet', dueSlot(WEEKDAYS, null, local(2026, 10, 7, 5, 59)), null)
ok('at 6:00: today\'s slot', dueSlot(WEEKDAYS, null, local(2026, 10, 7, 6, 0)), '2026-10-07 06:00')
ok('asleep at 6:00, awake at 7:31: today\'s slot, once', dueSlot(WEEKDAYS, null, local(2026, 10, 7, 7, 31)), '2026-10-07 06:00')
ok('already run: nothing', dueSlot(WEEKDAYS, '2026-10-07 06:00', local(2026, 10, 7, 23, 0)), null)
ok('Wednesday\'s slot, missed, is not run on Thursday', dueSlot(WEEKDAYS, '2026-10-06 06:00', local(2026, 10, 8, 0, 30)), null)
ok('a Saturday owes nothing', dueSlot(WEEKDAYS, '2026-10-09 06:00', local(2026, 10, 10, 10, 0)), null)
ok('a week away is one slot, not seven', dueSlot(WEEKDAYS, '2026-10-07 06:00', local(2026, 10, 14, 7, 0)), '2026-10-14 06:00')
ok('the last slot looks back over a weekend', slotKey(lastSlot(WEEKDAYS, local(2026, 10, 11, 9, 0))), '2026-10-09 06:00')

// --- set after the slot: nothing now, and the next one is next ---
const SAVED_LATE = { ...WEEKDAYS, since: local(2026, 10, 7, 10, 5) }
ok('saved at 10:05: today\'s 6:00 is not owed', dueSlot(SAVED_LATE, null, local(2026, 10, 7, 10, 6)), null)
ok('saved at 10:05: next is tomorrow', slotKey(nextSlot(SAVED_LATE, local(2026, 10, 7, 10, 6))), '2026-10-08 06:00')
ok('next from a Friday morning is Monday', slotKey(nextSlot(WEEKDAYS, local(2026, 10, 9, 7, 0))), '2026-10-12 06:00')

// --- what never runs ---
ok('paused', dueSlot({ ...WEEKDAYS, on: false }, null, local(2026, 10, 7, 7)), null)
ok('no days', dueSlot({ ...WEEKDAYS, days: [] }, null, local(2026, 10, 7, 7)), null)
ok('a time that is not one', dueSlot({ ...WEEKDAYS, time: '25:00' }, null, local(2026, 10, 7, 7)), null)
ok('paused has no next', nextSlot({ ...WEEKDAYS, on: false }, local(2026, 10, 7, 7)), null)

// --- the clock goes back at 02:00 on Sunday 25 October ---
const DAILY6 = { days: [0, 1, 2, 3, 4, 5, 6], time: '06:00', on: true, since: local(2026, 10, 1, 0) }
const across = nextSlot(DAILY6, local(2026, 10, 24, 12, 0))
ok('06:00 stays 06:00 across the change', [slotKey(across), new Date(across).getHours()], ['2026-10-25 06:00', 6])
ok('and the day after it', slotKey(nextSlot(DAILY6, local(2026, 10, 25, 12, 0))), '2026-10-26 06:00')
ok('the day the clocks go back looks back to its own 6:00', slotKey(lastSlot(DAILY6, local(2026, 10, 25, 7, 0))), '2026-10-25 06:00')
// 01:30 happens twice that night: at 00:30 and again at 01:30 UTC.
const TWICE = { days: [0], time: '01:30', on: true, since: local(2026, 10, 1, 0) }
const first = Date.UTC(2026, 9, 25, 0, 31)
const second = Date.UTC(2026, 9, 25, 1, 31)
ok('the first 01:30 runs', dueSlot(TWICE, null, first), '2026-10-25 01:30')
ok('the second 01:30 is the same slot, and does not', dueSlot(TWICE, '2026-10-25 01:30', second), null)

// --- how a schedule reads in a row ---
ok('weekdays', describe(WEEKDAYS), 'WEEKDAYS 06:00')
ok('one day', describe({ ...WEEKDAYS, days: [1], time: '08:40' }), 'MON 08:40')
ok('every day', describe(DAILY6), 'DAILY 06:00')
ok('weekends', describe({ ...WEEKDAYS, days: [0, 6], time: '10:00' }), 'WEEKENDS 10:00')
ok('Monday first', describe({ ...WEEKDAYS, days: [0, 1], time: '09:00' }), 'MON SUN 09:00')

console.log(`${pass} pass, ${fail} fail`)
process.exit(fail ? 1 : 0)
