// AN API ERROR IS NOT AN ANSWER.
//
// When a turn fails before the model says anything — a lapsed login, a usage
// limit, a 5xx — the CLI does not say so on stderr. It writes an `assistant`
// line with model `<synthetic>` whose text is the error sentence, and marks it:
// `error` plus `is_api_error_message` on the stream, `isApiErrorMessage` in the
// transcript. Read as a message, that put
//
//   CLAUDE
//   Failed to authenticate: OAuth session expired and could not be refreshed
//
// in the thread as if the model had said it, with copy and fork under it — and,
// since a message that arrived is taken as proof the CLI is signed in, it also
// LOWERED the sign-in note that should have been the whole answer.
//
// The lines below are verbatim shapes, captured from `claude -p --output-format
// stream-json --verbose` with a refused token, and from a transcript on disk.
//
//   node --experimental-strip-types checks/api-error.mjs
import { apiErrorIn } from '../src/shared/apiError.ts'
import { signInFaultIn } from '../src/shared/signin.ts'

let failed = 0
const is = (got, want, what) => {
  if (got !== want) {
    failed++
    console.log(`  ✗ ${what}\n      got  ${JSON.stringify(got)}\n      want ${JSON.stringify(want)}`)
  }
}

const synthetic = (text) => ({
  role: 'assistant',
  model: '<synthetic>',
  type: 'message',
  stop_reason: 'stop_sequence',
  content: [{ type: 'text', text }]
})

const said = 'Failed to authenticate: OAuth session expired and could not be refreshed'

// The live stream.
const live = {
  type: 'assistant',
  message: synthetic(said),
  parent_tool_use_id: null,
  error: 'authentication_failed',
  is_api_error_message: true
}
is(apiErrorIn(live), said, 'a live api-error line reads as an error')
is(Boolean(signInFaultIn(apiErrorIn(live))), true, '…and that error raises the sign-in note')

// The transcript on disk, camel-cased.
const onDisk = {
  type: 'assistant',
  message: synthetic('API Error: Rate limit reached'),
  error: 'rate_limit',
  isApiErrorMessage: true
}
is(apiErrorIn(onDisk), 'API Error: Rate limit reached', 'a transcript api-error line reads as an error')

// Marked by model and error alone, in case a version drops the flag.
is(apiErrorIn({ type: 'assistant', message: synthetic(said), error: 'unknown' }), said, 'a <synthetic> line with an error reads as an error')
// But `<synthetic>` by itself is the CLI's own quiet line, not a fault.
is(apiErrorIn({ type: 'assistant', message: synthetic('No response requested.') }), null, 'a <synthetic> line without an error is not one')

// And never an answer. These are the model speaking, whatever they say.
const real = {
  type: 'assistant',
  message: {
    role: 'assistant',
    model: 'claude-opus-5-5',
    content: [{ type: 'text', text: 'Failed to authenticate is what the CLI says when…' }]
  }
}
is(apiErrorIn(real), null, 'a real answer that quotes the error is still an answer')
is(apiErrorIn({ type: 'user', message: { role: 'user', content: said } }), null, 'a user line is not an api error')
is(apiErrorIn({}), null, 'an unparseable line is not an api error')
is(apiErrorIn(null), null, 'nothing is not an api error')

console.log(failed ? `\n${failed} failed` : '✓ api-error')
process.exit(failed ? 1 : 0)
