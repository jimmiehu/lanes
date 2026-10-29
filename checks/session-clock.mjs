// What the session clock's field reads, and how it shows what is left.
// A field that guesses is a clock set to a time nobody meant, so everything it
// cannot read must come back null and leave the clock as it was.
//
// A pure module, so node rather than a running app:
//   node --experimental-strip-types checks/session-clock.mjs
import { readSession, sessionLeft, SESSION_MS } from '../src/shared/sessionClock.ts'

let pass = 0
let fail = 0
const ok = (name, got, want) => {
  if (JSON.stringify(got) === JSON.stringify(want)) pass += 1
  else {
    fail += 1
    console.log(`  FAIL ${name}\n       got  ${JSON.stringify(got)}\n       want ${JSON.stringify(want)}`)
  }
}

const NOW = new Date(2026, 9, 6, 14, 0, 0).getTime() // 14:00 local
const M = 60_000

// How much is left.
ok('5:00 is a fresh window', readSession('5:00', NOW), NOW + SESSION_MS)
ok('3:20', readSession('3:20', NOW), NOW + 200 * M)
ok('0:45', readSession('0:45', NOW), NOW + 45 * M)
ok('bare 3 is hours', readSession('3', NOW), NOW + 180 * M)
ok('bare 5 is hours', readSession('5', NOW), NOW + 300 * M)
ok('bare 45 is minutes', readSession('45', NOW), NOW + 45 * M)
ok('90m', readSession('90m', NOW), NOW + 90 * M)
ok('2h30', readSession('2h30', NOW), NOW + 150 * M)
ok('2h 30m', readSession(' 2h 30m ', NOW), NOW + 150 * M)
ok('4h', readSession('4H', NOW), NOW + 240 * M)

// When it resets.
ok('at 17:40 today', readSession('at 17:40', NOW), new Date(2026, 9, 6, 17, 40).getTime())
ok('@17:40', readSession('@17:40', NOW), new Date(2026, 9, 6, 17, 40).getTime())
ok('at 5pm', readSession('at 5pm', NOW), new Date(2026, 9, 6, 17, 0).getTime())
ok('at 9:15 has gone, so tomorrow', readSession('at 9:15', NOW), new Date(2026, 9, 7, 9, 15).getTime())

// No clock.
for (const t of ['', '  ', '0', 'off', 'CLEAR']) ok(`"${t}" clears`, readSession(t, NOW), 'off')

// Not readable — a no, never a guess.
for (const t of ['soon', '3:75', 'at 25:00', '25:00', '2x', 'h', '0:00', 'at']) ok(`"${t}" is refused`, readSession(t, NOW), null)

// What it shows.
ok('five hours', sessionLeft(SESSION_MS), '5:00')
ok('rounds up', sessionLeft(4 * 3_600_000 + 11 * M + 1), '4:12')
ok('last seconds are 0:01', sessionLeft(1_000), '0:01')
ok('reset is 0:00', sessionLeft(0), '0:00')
ok('past is 0:00', sessionLeft(-5 * M), '0:00')

console.log(`${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
