import { powerMonitor } from 'electron'
import { randomUUID } from 'node:crypto'
import { clockAt, limitIn } from '../shared/limit'
import { runOf } from '../shared/prompts'
import { dueSlot } from '../shared/schedule'
import type { PromptRun, RanNotice, SavedPrompt, StartOptions, StreamEvent } from '../shared/types'
import type { CliSession } from './cli'
import { flushNow, loadState, patchState } from './state'

/**
 * PROMPTS THAT KEEP TIME, run from main.
 *
 * Main because at 6:00 there is often no window: closing it does not quit the
 * app on macOS, and main is what is left. It looks every thirty seconds, at
 * launch, when the Mac wakes, and whenever a prompt is saved; WHAT is owed is
 * `dueSlot`'s to say, in `shared/schedule.ts`, where node can hold it to it.
 *
 * A run is `runOf` — the very thing ⌘K and Run now make — sent through the one
 * session map every thread goes through. Its record is written before it is
 * sent and flushed, for the reason the fork gives: a crash between the two
 * must not run it again on relaunch. Main alone writes `runs`, through one
 * queue, so the renderer saying a run's tab was made cannot land between a
 * read and a write of an outcome.
 */

interface Deps {
  sessionFor: (opts: StartOptions) => CliSession
  /** Ends a session's process — for a run that is over with no window to show it. */
  close: (sessionId: string) => void
  /** Sends to the window if there is one; false if there is not. */
  tell: (channel: string, payload: unknown) => boolean
  hasWindow: () => boolean
}

const TICK_MS = 30_000

/** One at a time: every change to `runs` reads and writes the latest. */
let queue: Promise<unknown> = Promise.resolve()
function serial<T>(job: () => Promise<T>): Promise<T> {
  const next = queue.then(job, job)
  queue = next.catch(() => undefined)
  return next
}

async function writeRun(promptId: string, patch: Partial<PromptRun>): Promise<PromptRun | null> {
  return serial(async () => {
    const st = await loadState()
    const cur = st.runs[promptId]
    if (!cur) return null
    const run = { ...cur, ...patch }
    await patchState({ runs: { ...st.runs, [promptId]: run } })
    return run
  })
}

/**
 * Before anything reads them: a run left `running`, or waiting on a yes, by a
 * quit is neither — its process went with the app. Said so, rather than
 * offering a yes nothing is left to hear.
 */
export async function settleRuns(): Promise<void> {
  await serial(async () => {
    const st = await loadState()
    let moved = false
    const runs = { ...st.runs }
    for (const [id, r] of Object.entries(runs)) {
      if (r.outcome === 'running') {
        runs[id] = { ...r, outcome: 'error', note: 'stopped when Lanes quit', ask: undefined }
        moved = true
      } else if (r.ask) {
        runs[id] = { ...r, ask: undefined }
        moved = true
      }
    }
    if (moved) await patchState({ runs })
  })
}

/** The renderer made the run's tab. */
export function runShown(promptId: string): Promise<PromptRun | null> {
  return writeRun(promptId, { shown: true })
}

export function startScheduler(deps: Deps): { poke: () => void } {
  /** Prompts with a run in flight: their next slot waits for it. */
  const live = new Set<string>()
  let looking = false

  const tellRun = (promptId: string, run: PromptRun | null): void => {
    if (run) deps.tell('lanes:runs', { promptId, run })
  }

  const fire = async (prompt: SavedPrompt, slot: string): Promise<void> => {
    const sessionId = randomUUID()
    const now = Date.now()
    const run: PromptRun = { slot, at: now, sessionId, outcome: 'running', shown: false }
    let made: ReturnType<typeof runOf> | null = null
    await serial(async () => {
      const st = await loadState()
      // Scheduled: Autonomous only where this prompt was confirmed so.
      made = runOf(prompt, st, sessionId, now, { scheduled: true })
      await patchState({
        titleOverrides: { ...st.titleOverrides, [sessionId]: made.title },
        threadSettings: { ...st.threadSettings, [sessionId]: made.settings },
        ...(made.lane ? { laneOverrides: { ...st.laneOverrides, [sessionId]: made.lane } } : {}),
        runs: { ...st.runs, [prompt.id]: run }
      })
      await flushNow()
    })
    const r = made as ReturnType<typeof runOf> | null
    if (!r) return
    live.add(prompt.id)

    // Told first: the window makes the run's tab before the turn's first event.
    const notice: RanNotice = {
      promptId: prompt.id,
      sessionId,
      title: r.title,
      lane: r.lane,
      settings: r.settings,
      run
    }
    deps.tell('lanes:ran', notice)

    const s = deps.sessionFor(r.options)
    let outcome: PromptRun['outcome'] = 'running'
    const update = (patch: Partial<PromptRun>): void => {
      if (patch.outcome) outcome = patch.outcome
      void writeRun(prompt.id, patch).then((next) => tellRun(prompt.id, next))
    }
    const over = (): void => {
      s.off('event', onEvent)
      live.delete(prompt.id)
      // Nobody is looking and nothing is waiting on a yes: the process has
      // nothing left to say. The transcript keeps everything it said.
      if (!deps.hasWindow()) deps.close(sessionId)
    }
    const onEvent = (e: StreamEvent): void => {
      if (e.sessionId !== sessionId) return
      switch (e.type) {
        // A yes given to a run that stopped on a refusal carries it on.
        case 'started':
          if (outcome === 'asked') update({ outcome: 'running', ask: undefined, note: undefined })
          break
        case 'permission':
          update({
            outcome: 'asked',
            ask: e.request,
            note: `wants a yes for ${e.request.tool}: ${e.request.summary}`
          })
          break
        case 'error': {
          const hit = limitIn(e.message)
          update(
            hit
              ? { outcome: 'limit', note: hit.resetsAt ? `resets ${clockAt(hit.resetsAt)}` : hit.said }
              : { outcome: 'error', note: e.message.split('\n')[0].slice(0, 200) }
          )
          break
        }
        case 'done':
          // The turn a refusal ended is not the run's end: it waits on the yes.
          if (outcome === 'asked') break
          if (outcome === 'running') update({ outcome: 'done', finishedAt: Date.now() })
          over()
          break
        case 'exit':
          if (outcome === 'asked') break
          if (outcome === 'running')
            update({ outcome: 'error', note: 'the CLI stopped before it answered', finishedAt: Date.now() })
          over()
          break
        default:
          break
      }
    }
    s.on('event', onEvent)
    s.send(r.text)
  }

  const look = async (): Promise<void> => {
    if (looking) return
    looking = true
    try {
      const st = await loadState()
      // Off until asked (Settings → Prompts). Turned on later the same day, a
      // slot already gone today runs then, as one missed asleep does.
      if (!st.flags.schedules) return
      const now = Date.now()
      for (const p of st.prompts) {
        if (!p.schedule?.on || live.has(p.id)) continue
        const slot = dueSlot(p.schedule, st.runs[p.id]?.slot, now)
        if (slot) await fire(p, slot)
      }
    } finally {
      looking = false
    }
  }

  setInterval(() => void look(), TICK_MS)
  // A Mac asleep through a slot owes it the moment it wakes — the same day.
  powerMonitor.on('resume', () => setTimeout(() => void look(), 2000))
  // And at launch, once the window has had a moment to be there for it.
  setTimeout(() => void look(), 4000)
  return { poke: () => void look() }
}
