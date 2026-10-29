import type { AppState, EffortId, StartOptions } from './types'

/**
 * Everything the transport needs for one chat: the thread's own model and
 * effort over the app-wide safety mode and tool restrictions.
 *
 * Built in ONE place so a setting cannot reach the composer's send but miss a
 * prompt's run — and shared, because the scheduler builds the very same thing
 * in main, where there is no renderer to ask. The `deny` list is the part that
 * would drift first: a skill switched off in Settings has to be off for a run
 * nobody watched, too.
 */
export function startOptions(
  state: Pick<AppState, 'flags' | 'skillsOff' | 'safety' | 'customModels'> | null,
  thread: { model: string; effort: EffortId },
  over?: Partial<StartOptions>
): StartOptions {
  const deny = [
    ...(state?.flags?.allowShell === false ? ['Bash'] : []),
    ...(state?.skillsOff ?? []).map((sk) => `Skill(${sk})`)
  ]
  const model = over?.model ?? thread.model
  return {
    model,
    effort: thread.effort,
    // Before the state has arrived, the mode a new install starts in: nothing
    // runs without a yes.
    safety: state?.safety ?? 'guarded',
    deny,
    redact: state?.flags?.redactSecrets !== false,
    customModel: state?.customModels?.find((m) => m.id === model),
    ...over
  }
}
