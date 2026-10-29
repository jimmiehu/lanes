// The usage-limit reader, against every shape the CLI is known to use — and,
// just as importantly, against the errors that merely mention a limit and must
// NOT be dressed up as one. A real error shown as a countdown is a lie about
// why your message did not send.
//
// A pure module, so node rather than a running app:
//   node --experimental-strip-types checks/limit.mjs
import {
  limitIn,
  resetAt,
  countdown,
  clockAt
} from '../src/shared/limit.ts'

let pass = 0
let fail = 0
const ok = (name, got, want) => {
  const same = JSON.stringify(got) === JSON.stringify(want)
  if (same) pass += 1
  else {
    fail += 1
    console.log(`  FAIL ${name}\n       got  ${JSON.stringify(got)}\n       want ${JSON.stringify(want)}`)
  }
}

const NOW = Date.parse('2026-09-01T12:00:00Z')

/* ---------- 1. these ARE limits ---------- */

const limits = [
  ['headless, piped epoch', 'Claude AI usage limit reached|1788285600', 'session'],
  ['prose with a clock', 'Claude usage limit reached. Your limit will reset at 3pm.', 'session'],
  ['five-hour window', '5-hour limit reached ∙ resets 15:30', 'session'],
  ['weekly', 'you have reached your weekly usage limit', 'weekly'],
  ['credit', 'usage credit limit reached', 'credit'],
  ['spend, with a stamp', 'spend limit reached (daily; resets 2026-09-01 18:00 UTC)', 'credit'],
  ['balance', 'Your credit balance is too low to run this request.', 'credit'],
  ['upgrade line', '/upgrade to increase your usage limit.', 'session']
]
for (const [name, text, scope] of limits) {
  const got = limitIn(text, NOW)
  ok(`limit: ${name}`, got && got.scope, scope)
}

/* ---------- 2. and these are NOT ---------- */

const notLimits = [
  ['context window', 'Prompt is too long: 210000 tokens exceeds the context limit'],
  ['subagent depth', 'Subagent nesting limit reached (depth 3 of 3).'],
  ['concurrency', 'Concurrent subagent limit reached. You can run 10 subagents at once.'],
  ['budget', 'Budget limit reached ($5.00 spent of the $5 maximum).'],
  ['events', 'events because eventCountLimit reached'],
  ['a plain error', "There's an issue with the selected model (opus 4.)."],
  ['nothing', ''],
  ['null', null]
]
for (const [name, text] of notLimits) ok(`not a limit: ${name}`, limitIn(text, NOW), null)

/* ---------- 2b. and the verdict survives company ---------- */

// stderr arrives with whatever else the CLI had to say attached. A limit whose
// paragraph mentions tokens is still a limit; a fault in the same stream as the
// word "usage" is still not one.
const noisy = [
  '"opus 4." is not a model this version of Claude Code recognizes, so auto-compact will',
  'keep this session within 200k tokens (the context window it assumes).',
  'Claude AI usage limit reached|1788285600'
].join('\n')
ok('limit survives a paragraph about tokens', limitIn(noisy, NOW)?.scope, 'session')
ok('and still finds the time', limitIn(noisy, NOW)?.resetsAt, 1788285600000)

const faultWithNoise = [
  'Reading your usage for the day.',
  'Concurrent subagent limit reached. You can run 10 subagents at once.'
].join('\n')
ok('a fault is not promoted by nearby words', limitIn(faultWithNoise, NOW), null)

// The time may sit on the line after the one that says it.
const twoLines = 'You have reached your weekly usage limit.\nIt resets 2026-09-03 09:00 UTC.'
ok('time from the next line', limitIn(twoLines, NOW)?.resetsAt, Date.parse('2026-09-03T09:00:00Z'))
ok('scope from the line that says it', limitIn(twoLines, NOW)?.scope, 'weekly')

/* ---------- 3. when it lifts ---------- */

ok('epoch seconds', resetAt('reached|1788285600', NOW), 1788285600000)
ok('epoch millis', resetAt('reached|1788285600000', NOW), 1788285600000)
ok(
  'utc stamp',
  resetAt('resets 2026-09-01 18:00 UTC', NOW),
  Date.parse('2026-09-01T18:00:00Z')
)
ok('relative hours and minutes', resetAt('try again in 2h 15m', NOW), NOW + (135 * 60_000))
ok('relative minutes', resetAt('resets in 45 minutes', NOW), NOW + 45 * 60_000)
ok('no time given', resetAt('you have reached your weekly usage limit', NOW), null)
// A wall clock is read in the READER's zone and always lands ahead of now.
const clock = resetAt('your limit will reset at 3pm', NOW)
ok('wall clock is in the future', clock !== null && clock > NOW, true)
ok('wall clock is within a day', clock !== null && clock - NOW <= 86_400_000, true)
ok('wall clock lands on the hour', clock !== null && new Date(clock).getMinutes(), 0)
ok('wall clock lands at 3pm local', clock !== null && new Date(clock).getHours(), 15)

/* ---------- 4. the sentence kept, without the machine bit ---------- */

ok(
  'said drops the piped epoch',
  limitIn('Claude AI usage limit reached|1788285600', NOW).said,
  'Claude AI usage limit reached'
)
ok(
  'said picks the line that says it',
  limitIn(
    '"opus" is not a model this version recognises, so auto-compact will keep…\nClaude AI usage limit reached|1788285600',
    NOW
  ).said,
  'Claude AI usage limit reached'
)

/* ---------- 5. the clock itself ---------- */

ok('h:mm:ss', countdown(2 * 3600_000 + 14 * 60_000 + 3_000), '2:14:03')
ok('m:ss under an hour', countdown(9 * 60_000 + 5_000), '9:05')
ok('never negative', countdown(-5000), '0:00')
ok('rounds to the second', countdown(1499), '0:01')
ok('a time of day comes back', typeof clockAt(NOW), 'string')

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
