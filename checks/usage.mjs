// What the usage windows are, read off the CLI's `rate_limit_event`.
//
// The fixture is shaped like the CLI's — the event `claude -p --output-format
// stream-json` (CLI 2.1.285) ends a turn with, its figures made up — and the
// rest are its neighbours: the same event without the `@internal` per-window
// figures, a week-limited one, a per-model week, milliseconds for seconds, and
// garbage. The claim that matters most is the trap: the documented top-level
// reset belongs to whichever window is LIMITING, and a week's reset taken for
// the session's would set the clock days out. If a CLI update moves the shape,
// this is where it shows.
//
// And how a window is coloured, which is said once, in `tone`, so the ring, the
// card and this file cannot disagree about where 70% is: plain below it, orange
// from it, red from 90% — by the figure as SHOWN, whole percent, so nothing that
// reads `70%` is ever drawn plain — and the CLI's own word can only raise it.
//
// A pure module, so node rather than a running app:
//   node --experimental-strip-types checks/usage.mjs
import { live, mergeUsage, percent, readUsage, statusOf, tone } from '../src/shared/usage.ts'

let pass = 0
let fail = 0
const ok = (name, got, want) => {
  if (JSON.stringify(got) === JSON.stringify(want)) pass += 1
  else {
    fail += 1
    console.log(`  FAIL ${name}\n       got  ${JSON.stringify(got)}\n       want ${JSON.stringify(want)}`)
  }
}

const NOW = Date.UTC(2026, 8, 22, 13, 0, 0) // 13:00 UTC, two hours and twenty before the reset
const EVENT = {
  status: 'allowed',
  resetsAt: 1790090400,
  rateLimitType: 'five_hour',
  overageStatus: 'rejected',
  isUsingOverage: false,
  unifiedWindows: {
    five_hour: { utilization: 0.23, resetsAt: 1790090400 },
    seven_day: { utilization: 0.06, resetsAt: 1790434800 }
  }
}
const SESSION_END = 1790090400_000
const WEEK_END = 1790434800_000

// --- the event as the CLI sends it ---
ok('the event: both windows', readUsage(EVENT, NOW), {
  session: { used: 0.23, resetsAt: SESSION_END },
  week: { used: 0.06, resetsAt: WEEK_END },
  status: 'allowed',
  limiting: 'session',
  seen: NOW
})

// --- without the internal figures: the reset still sets the clock, no percentage is made up ---
const { unifiedWindows: _gone, ...documented } = EVENT
ok('documented only: the session from the top level, used unsaid', readUsage(documented, NOW), {
  session: { used: null, resetsAt: SESSION_END },
  week: null,
  status: 'allowed',
  limiting: 'session',
  seen: NOW
})
ok('documented with a utilization: used as said', readUsage({ ...documented, utilization: 0.4 }, NOW).session, {
  used: 0.4,
  resetsAt: SESSION_END
})

// --- THE TRAP: a week-limited event's reset is the week's, never the session's ---
const weekLimited = { status: 'allowed_warning', resetsAt: WEEK_END / 1000, rateLimitType: 'seven_day', utilization: 0.91 }
const wl = readUsage(weekLimited, NOW)
ok('week-limited: no session made of the week', wl.session, null)
ok('week-limited: the week', wl.week, { used: 0.91, resetsAt: WEEK_END })
ok('week-limited: says which window is limiting', [wl.status, wl.limiting], ['allowed_warning', 'week'])
// A per-model week resets on its own clock: it is neither the session nor "the week".
const opus = readUsage({ status: 'allowed_warning', resetsAt: 1790500000, rateLimitType: 'seven_day_opus' }, NOW)
ok('per-model week: neither window claimed', [opus.session, opus.week, opus.limiting], [null, null, 'week'])
ok('rejected is read', readUsage({ ...EVENT, status: 'rejected' }, NOW).status, 'rejected')

// --- units ---
ok('milliseconds read as milliseconds', readUsage({ ...documented, resetsAt: SESSION_END }, NOW).session.resetsAt, SESSION_END)
ok('use past the cap is kept', readUsage({ unifiedWindows: { five_hour: { utilization: 1.04, resetsAt: 1790090400 } } }, NOW).session.used, 1.04)
ok('a negative use is unsaid', readUsage({ unifiedWindows: { five_hour: { utilization: -1, resetsAt: 1790090400 } } }, NOW).session.used, null)

// --- what does not read comes back null, never 0% ---
ok('null', readUsage(null, NOW), null)
ok('a string', readUsage('Claude AI usage limit reached|1790090400', NOW), null)
ok('an array', readUsage([EVENT], NOW), null)
ok('an empty object', readUsage({}, NOW), null)
ok('an unknown status alone', readUsage({ status: 'fine' }, NOW), null)
ok('a window with no reset is no window', readUsage({ status: 'allowed', unifiedWindows: { five_hour: { utilization: 0.2 } } }, NOW).session, null)
ok('a reset that is not a number is no window', readUsage({ rateLimitType: 'five_hour', resetsAt: 'soon', status: 'allowed' }, NOW).session, null)

// --- a window that has reset is over, and so are its figures ---
ok('live before the reset', live({ used: 0.23, resetsAt: SESSION_END }, SESSION_END - 1), { used: 0.23, resetsAt: SESSION_END })
ok('not live at the reset', live({ used: 0.23, resetsAt: SESSION_END }, SESSION_END), null)

// --- newest wins, window by window ---
const before = readUsage(EVENT, NOW)
const later = readUsage(documented, NOW + 60_000)
const merged = mergeUsage(before, later, NOW + 60_000)
ok('merge: an event silent on the week keeps the running week', merged.week, { used: 0.06, resetsAt: WEEK_END })
ok('merge: the newer session wins', merged.session, { used: null, resetsAt: SESSION_END })
ok('merge: as of the newer event', merged.seen, NOW + 60_000)
const afterWeek = mergeUsage(before, later, WEEK_END + 1)
ok('merge: a week that has reset is not carried', afterWeek.week, null)
ok('merge: from nothing', mergeUsage(null, before, NOW), before)

// --- how it is said ---
ok('23%', percent(0.23), '23%')
ok('104%', percent(1.04), '104%')
ok('0%', percent(0.004), '0%')

// --- the colour, at its edges ---
ok('23%: plain', tone(0.23), 'plain')
ok('69%: plain', [percent(0.694), tone(0.694)], ['69%', 'plain'])
// 69.9% is SAID as 70%, so it is orange: a figure and its colour never disagree.
ok('69.9% reads 70%: orange', [percent(0.699), tone(0.699)], ['70%', 'warn'])
ok('70%: orange', tone(0.7), 'warn')
ok('89%: orange', [percent(0.894), tone(0.894)], ['89%', 'warn'])
ok('89.9% reads 90%: red', [percent(0.899), tone(0.899)], ['90%', 'alarm'])
ok('90%: red', tone(0.9), 'alarm')
ok('100%: red', tone(1), 'alarm')
ok('a share past 100%: red', tone(1.04), 'alarm')
ok('0%: plain', tone(0), 'plain')
ok('no share at all: plain', tone(null), 'plain')

// The whole range, a hundredth of a percent at a time: the colour is the one the
// figure on screen calls for, every time.
const called = (shown) => (shown >= 90 ? 'alarm' : shown >= 70 ? 'warn' : 'plain')
const disagree = []
for (let i = 0; i <= 12000; i += 1) {
  const used = i / 10000
  if (tone(used) !== called(Number(percent(used).slice(0, -1)))) disagree.push(used)
}
ok('a figure and its colour agree from 0% to 120%', disagree.slice(0, 5), [])

// --- the CLI's own word raises it, never lowers it ---
ok('a warning below 70%: orange', tone(0.23, 'allowed_warning'), 'warn')
ok('a warning at 75%: orange', tone(0.75, 'allowed_warning'), 'warn')
ok('a warning past 90%: still red', tone(0.95, 'allowed_warning'), 'alarm')
ok('a refusal at 23%: red', tone(0.23, 'rejected'), 'alarm')
ok('a refusal with no share: red', tone(null, 'rejected'), 'alarm')
ok('a warning with no share: orange', tone(null, 'allowed_warning'), 'warn')
ok('allowed changes nothing', [tone(0.23, 'allowed'), tone(0.75, 'allowed'), tone(0.93, 'allowed')], [
  'plain',
  'warn',
  'alarm'
])

// --- and that word is about the window that is limiting, never the other ---
ok('the event: the word is the session’s', [statusOf(before, 'session'), statusOf(before, 'week')], ['allowed', null])
ok('week-limited: the word is the week’s', [statusOf(wl, 'session'), statusOf(wl, 'week')], [null, 'allowed_warning'])
// A week the CLI warns about does not turn the SESSION orange — the week has its own figure.
const weekWarned = {
  session: { used: 0.23, resetsAt: SESSION_END },
  week: { used: 0.5, resetsAt: WEEK_END },
  status: 'allowed_warning',
  limiting: 'week',
  seen: NOW
}
ok('week warned at 50%: the session plain, the week orange', [
  tone(weekWarned.session.used, statusOf(weekWarned, 'session')),
  tone(weekWarned.week.used, statusOf(weekWarned, 'week'))
], ['plain', 'warn'])
// Unsaid which window: the session's, as the clock always took it.
ok('no window named: the word is the session’s', statusOf({ ...before, status: 'allowed_warning', limiting: null }, 'session'), 'allowed_warning')
ok('nothing known: no word', [statusOf(null, 'session'), statusOf(undefined, 'week')], [null, null])

console.log(`${pass} pass, ${fail} fail`)
process.exit(fail ? 1 : 0)
