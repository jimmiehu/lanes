import { startOptions } from './options'
import { readTime } from './schedule'
import type { AppState, LaneId, SafetyId, SavedPrompt, Schedule, StartOptions, ThreadSettings } from './types'

/**
 * What a run of a saved prompt IS — its options, its title, its lane and the
 * model and effort its thread keeps — said once. ⌘K, Settings' Run now and the
 * scheduler each start runs, and three places deciding what a run is would be
 * three different things by the second release.
 */
export interface Run {
  sessionId: string
  /** The prompt's name and the day it ran: `Standup · Wed 7 Oct`. */
  title: string
  text: string
  /** Fresh: the run is a new session, made by its first send. */
  options: StartOptions
  /** The thread's own model and effort, so a reply in it later goes the same way. */
  settings: ThreadSettings
  lane: LaneId | null
}

/**
 * `Standup · Wed 7 Oct`. A routine's runs are told apart in the rail by when
 * they ran — the namer would otherwise name each day after whatever that
 * day's opening happened to say.
 */
export function runTitle(name: string, now: number): string {
  // Spelled out rather than left to the locale: main and the window are two
  // processes with two default locales — main said `Wed, Oct 7` where the
  // window said `Wed 7 Oct` — and a title is one string, whoever makes it.
  const d = new Date(now)
  return `${name.trim()} · ${WEEKDAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/**
 * The safety mode a run goes in. Run by hand — ⌘K, Run now — it is the
 * prompt's own, else the app's: someone is there, and the thread shows it.
 * On a schedule nobody is, so Autonomous takes a yes said to that prompt in
 * particular (`autonomousConfirmed`, which only the question in Settings →
 * Prompts sets); a prompt set to it without one, or the app-wide Autonomous it
 * would inherit, runs Standard. Said here, where main's scheduler asks, so it
 * holds for a prompt that never met the question: one set to Autonomous by an
 * older build, or by hand in the state file. It asks for the yes, not who said
 * it: a state patch that carries `autonomousConfirmed` is taken at its word,
 * since `sanitizeStatePatch` passes it through.
 */
export function runSafety(prompt: SavedPrompt, state: Pick<AppState, 'safety'>, scheduled: boolean): SafetyId {
  const mode = prompt.safety ?? state.safety
  if (scheduled && mode === 'autonomous' && !(prompt.safety === 'autonomous' && prompt.autonomousConfirmed === true))
    return 'standard'
  return mode
}

export function runOf(
  prompt: SavedPrompt,
  state: AppState,
  sessionId: string,
  now: number,
  how: { scheduled?: boolean } = {}
): Run {
  const settings: ThreadSettings = {
    model: prompt.model ?? state.defaultModel,
    effort: prompt.effort ?? state.defaultEffort
  }
  return {
    sessionId,
    title: runTitle(prompt.name, now),
    text: prompt.text,
    settings,
    lane: prompt.lane ?? null,
    options: startOptions(state, settings, {
      sessionId,
      fresh: true,
      safety: runSafety(prompt, state, how.scheduled === true)
    })
  }
}

/**
 * Why a prompt cannot be saved as it stands, or null. Said in words rather
 * than by a Save that greys out and leaves you to guess.
 */
export function promptProblem(
  draft: { name: string; text: string; safety?: SafetyId; schedule?: Schedule | null },
  all: SavedPrompt[],
  id: string | null
): string | null {
  const name = draft.name.trim()
  if (!name) return 'It needs a name — ⌘K finds it by its name.'
  if (name.startsWith('/')) return 'A name cannot start with / — that is how ⌘K asks for prompts.'
  if (!draft.text.trim()) return 'It needs something to send.'
  const taken = all.find((p) => p.id !== id && p.name.trim().toLowerCase() === name.toLowerCase())
  if (taken) return `“${taken.name}” is a prompt already — ⌘K could not tell the two apart.`
  const s = draft.schedule
  if (s?.on) {
    if (!s.days.length) return 'A schedule needs at least one day.'
    if (!readTime(s.time)) return 'A schedule needs a time it can read — 06:00, 6, 6pm.'
    // Nobody is there to say yes at 6:00: Guarded would stop at the first call,
    // and DEFAULT could become Guarded later without the schedule knowing.
    if (draft.safety !== 'standard' && draft.safety !== 'autonomous')
      return 'A schedule runs with nobody there to say yes — pick Standard or Autonomous.'
  }
  return null
}

/** The line a row shows under the name. */
export function firstLine(text: string): string {
  return text.trim().split('\n')[0]?.trim() ?? ''
}
