import { app } from 'electron'
import { spawn } from 'node:child_process'
import { chmodSync, copyFileSync, existsSync, readFileSync, watchFile, writeFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import { DEV, devEnv } from './dev'
import { readyUpdate, type Hold, type UpdateState } from '../shared/update'

declare const __BUILD__: string

/*
 * AN UPDATE, OFFERED — never installed under you.
 *
 * `build/follow.sh` builds each commit of the branch it follows and says what
 * is ready in `ready.json`. This reads it — at launch, when the window comes
 * forward, and when the file changes — and tells the window, which says
 * "Update ready" at the foot of the rail with the commits it would bring
 * (shared/update.ts decides which). From there you restart into it; otherwise
 * it goes in when you quit, whenever that is — if it is known to be newer
 * than this app (`since`). One that may be older goes in only when asked for.
 *
 * A restart asked for while a reply is running waits for it to land: quitting
 * kills the CLI, and a build is not worth an answer. So does one asked for
 * while a Guarded question is open, since the relaunch would have neither the
 * question nor main's record of it — and the line says which it waits for,
 * so a question left unanswered is not a restart that never comes for no
 * reason anybody can see. The install itself is
 * build/swap.sh, started detached from a copy outside the bundle, since the
 * bundle is what it replaces; it waits for this process to be gone first.
 *
 * In development there is no bundle of ours to replace — it is Electron's —
 * so nothing is swapped: a check gives the run its own LANES_FOLLOW_HOME, and
 * what would have been done is written there instead (`swap-plan.json`).
 * Without one, a development run offers nothing.
 */

/** Where follow.sh keeps what it built: its default, or a development run's own. */
const HOME = DEV ? devEnv('LANES_FOLLOW_HOME') : join(homedir(), 'Library/Application Support/lanes-follow')
const READY = HOME ? join(HOME, 'ready.json') : null

/** The bundle this app runs from, which an update replaces. Null in development. */
const BUNDLE = DEV ? null : (/^(.*?\.app)\/Contents\/MacOS\/[^/]+$/.exec(process.execPath)?.[1] ?? null)

interface Hooks {
  tell: (channel: string, payload: unknown) => boolean
  /** What a restart now would cut short, if anything (`Hold`). */
  holding: () => Hold | null
}

let hooks: Hooks | null = null
let state: UpdateState | null = null
let waiting: ReturnType<typeof setInterval> | null = null
/** Started already, by a restart or a quit: once is all. */
let swapped = false

function read(): UpdateState | null {
  if (!READY) return null
  let raw: unknown
  try {
    raw = JSON.parse(readFileSync(READY, 'utf8'))
  } catch {
    return null
  }
  const ready = readyUpdate(raw, __BUILD__, existsSync)
  if (!ready) return null
  // What was asked of it carries over while it is the same build.
  const was = state?.commit === ready.commit ? state : null
  return { ...ready, restart: was?.restart ?? null, waitingFor: was?.waitingFor ?? null }
}

function show(next: UpdateState | null): void {
  if (JSON.stringify(next) === JSON.stringify(state)) return
  state = next
  // A newer build replacing the one waited for starts over: the restart was asked of that one.
  if (state?.restart !== 'waiting') stopWaiting()
  hooks?.tell('lanes:update', state)
}

const look = (): void => {
  if (!swapped) show(read())
}

function stopWaiting(): void {
  if (waiting) clearInterval(waiting)
  waiting = null
}

/** Reads what is ready now, and keeps reading: when the file changes, and when the window comes forward. */
export function startUpdates(h: Hooks): void {
  hooks = h
  if (!READY) return
  look()
  watchFile(READY, { interval: 10_000 }, look)
  app.on('browser-window-focus', look)
}

export const currentUpdate = (): UpdateState | null => state

/** Restart into the update: now, or as soon as nothing is left that it would cut short. */
export function restartIntoUpdate(): UpdateState | null {
  if (!state || swapped) return state
  show({ ...state, restart: 'waiting' })
  const go = (): void => {
    if (!state || state.restart !== 'waiting') return stopWaiting()
    const held = hooks?.holding() ?? null
    if (held) return show({ ...state, waitingFor: held })
    stopWaiting()
    show({ ...state, restart: 'now', waitingFor: null })
    install(true)
  }
  stopWaiting()
  waiting = setInterval(go, 1000)
  go()
  return state
}

/** Not now after all: the restart waited for is called off, and the update stays ready. */
export function cancelRestart(): UpdateState | null {
  if (state?.restart === 'waiting') {
    stopWaiting()
    show({ ...state, restart: null, waitingFor: null })
  }
  return state
}

/**
 * Quitting with an update ready: it goes in once the app is gone, and is not
 * reopened — when it is known to be newer. One this app cannot place may be
 * older than it, and a quit is not a yes to going back.
 */
export function installOnQuit(): void {
  if (state?.since && !swapped) install(false)
}

function install(reopen: boolean): void {
  if (!state || swapped) return
  swapped = true
  if (!BUNDLE) {
    if (HOME) writeFileSync(join(HOME, 'swap-plan.json'), JSON.stringify({ from: state.app, reopen, at: Date.now() }))
    return
  }
  try {
    const script = join(tmpdir(), `lanes-swap-${process.pid}.sh`)
    copyFileSync(join(process.resourcesPath, 'swap.sh'), script)
    chmodSync(script, 0o755)
    // Detached is a session of its own: it outlives this process, which is the point.
    const args = [script, state.app, BUNDLE, '--wait', String(process.pid), ...(reopen ? ['--reopen'] : [])]
    spawn('/bin/bash', args, {
      detached: true,
      stdio: 'ignore',
      // Nothing of this app's environment. swap.sh's LANES_SWAP_* switches —
      // one runs what it names — are for checks/swap.mjs, and like every
      // LANES_* door (dev.ts) they stay shut in the packaged app, the only
      // one that gets this far. checks/dev-gates.mjs holds this to it.
      env: { PATH: '/usr/bin:/bin:/usr/sbin:/sbin', HOME: homedir() }
    }).unref()
  } catch (err) {
    console.error('update: could not start the install:', err)
    swapped = false
    if (reopen) show({ ...state, restart: null })
    return
  }
  if (reopen) app.quit()
}
