// READING "SIGN IN AGAIN" out of what the CLI said — and refusing to read it
// out of everything else.
//
// The sibling of `limit.mjs`, and the same discipline. A usage limit is not a
// fault; a signed-out CLI is a fault with exactly ONE remedy, and repeating
// `Failed to authenticate: OAuth session expired and could not be refreshed`
// in the stderr box on every message says none of it — not that Lanes holds no
// credentials of its own, not where the login lives, not what to type.
//
// The half that matters is the refusal. A real fault dressed up as "just sign
// in again" sends you to a terminal to fix something that was never broken,
// and the most common thing on that list is a tool PERMISSION denial, which
// says "not allowed" about what a turn may do rather than about who you are.
//
//   node --experimental-strip-types checks/signin.mjs
import { signInFaultIn, SIGN_IN_COMMAND } from '../src/shared/signin.ts'

let failed = 0
const yes = (text, what) => {
  if (!signInFaultIn(text)) {
    failed++
    console.log(`  ✗ should read as signed out — ${what}\n      ${text}`)
  }
}
const no = (text, what) => {
  if (signInFaultIn(text)) {
    failed++
    console.log(`  ✗ must NOT read as signed out — ${what}\n      ${text}`)
  }
}

/* ---------- the ones that mean sign in ---------- */

// The exact sentence this was written for, taken from a real run.
yes(
  'Failed to authenticate: OAuth session expired and could not be refreshed',
  'the reported one'
)
yes('OAuth token expired', 'a bare expiry')
yes('Invalid API key · Please run /login', 'the CLI pointing at /login')
yes('Not logged in. Run `claude auth login`.', 'plainly not logged in')
yes('authentication_error: invalid bearer token', 'the API error type')
yes('No valid credentials found', 'nothing to authenticate with')
yes('credentials expired', 'a lapsed store')

/* ---------- and the ones that do not ---------- */

// The big one. The CLI refuses tool calls with this shape constantly, and it
// has nothing to do with who you are.
no('Permission denied: Bash(rm -rf /)', 'a tool permission refusal')
no('Claude requested permissions to use Write, but you have not granted it yet', 'a grant prompt')
no('This operation is not allowed in the current sandbox', 'a sandbox refusal')
no('Error: connect ECONNREFUSED 127.0.0.1:443', 'the network being down')
no('getaddrinfo ENOTFOUND api.anthropic.com', 'DNS')
no('self-signed certificate in certificate chain', 'a corporate proxy')
no('Claude AI usage limit reached|1788282000', 'a usage limit')
no('Rate limit exceeded, please retry', 'a rate limit')
no('Overloaded', 'the service being busy')
no('', 'nothing at all')
no(null, 'null')
no(undefined, 'undefined')
// A limit and a login mentioned together is a limit: the remedy is to wait.
no('usage limit reached — please run /login later', 'a limit that mentions login')

/* ---------- lapsed reads differently from never ---------- */

const lapsed = signInFaultIn('OAuth session expired and could not be refreshed')
const never = signInFaultIn('Not logged in')
if (lapsed?.lapsed !== true) {
  failed++
  console.log('  ✗ an expired session should read as lapsed')
}
if (never?.lapsed !== false) {
  failed++
  console.log('  ✗ never having logged in should not read as lapsed')
}

/* ---------- the sentence is kept, because it is the evidence ---------- */

const said = 'Failed to authenticate: OAuth session expired and could not be refreshed'
if (signInFaultIn(`  ${said}  `)?.said !== said) {
  failed++
  console.log("  ✗ the CLI's own sentence should be kept, trimmed")
}

/* ---------- one command, in one place ---------- */

if (SIGN_IN_COMMAND !== 'claude auth login') {
  failed++
  console.log(`  ✗ the command drifted: ${SIGN_IN_COMMAND}`)
}

console.log(failed ? `\n${failed} failed` : '\nall signin assertions hold')
process.exit(failed ? 1 : 0)
