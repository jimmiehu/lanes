/**
 * Reading "you are not signed in" out of whatever the CLI said.
 *
 * The sibling of `limit.ts`, and for the same reason. A usage limit is not a
 * fault; a signed-out CLI is a fault, but it is one with EXACTLY ONE REMEDY,
 * and repeating the CLI's own sentence on every message says none of it. What
 * the reader needs is not `Failed to authenticate: OAuth session expired and
 * could not be refreshed` — it is that Lanes has no credentials of its own, and
 * the one command that fixes it.
 *
 * Lanes never holds a token. It runs the `claude` you already have, with your
 * environment, and reads the transcripts that CLI writes. So a login belongs in
 * a terminal, and this note's whole job is to say so and get out of the way.
 *
 * Like `limitIn`, this returns null for anything it is not sure about. A real
 * fault dressed up as "just sign in again" sends you to a terminal to fix
 * something that was never broken.
 */

export interface SignInFault {
  /** The CLI's own sentence, kept for the disclosure. */
  said: string
  /** Whether a login existed and lapsed, or there was never one. */
  lapsed: boolean
}

/**
 * The shapes the CLI uses when the answer is "sign in". Several, because it
 * depends on version, on whether a token existed, and on which layer refused.
 */
const SIGNED_OUT =
  /failed to authenticate|oauth (session|token)[^\n]{0,40}(expired|invalid|refresh)|could not be refreshed|please run\s+\/?login|run `?\/login`?|not logged in|no valid credentials|authentication_error|invalid api key|credentials?[^\n]{0,20}(expired|missing|not found)/i

/**
 * The things that mention authentication while meaning something else. Each is
 * a real fault with a different remedy, and sending someone to `auth login` for
 * any of them wastes the one instruction this note gets to give.
 *
 * `permission` above all: the CLI's own tool-permission refusals say
 * "permission denied", which is about what a turn may DO, not about who you
 * are — and it is by far the most common thing on this list.
 */
const NOT_SIGN_IN =
  /permission|not allowed|forbidden by|disallowed|sandbox|proxy|certificate|self.signed|ENOTFOUND|ECONNREFUSED|getaddrinfo|network|offline|rate.?limit|overloaded|quota|usage limit/i

/** A login that lapsed reads differently from one that never happened. */
const LAPSED = /expired|could not be refreshed|refresh/i

export function signInFaultIn(text: string | null | undefined): SignInFault | null {
  if (!text) return null
  const said = String(text).trim()
  if (!said) return null
  if (NOT_SIGN_IN.test(said)) return null
  if (!SIGNED_OUT.test(said)) return null
  return { said, lapsed: LAPSED.test(said) }
}

/** The one command. In one place, so the note and the docs cannot drift. */
export const SIGN_IN_COMMAND = 'claude auth login'
