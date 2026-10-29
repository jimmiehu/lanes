/**
 * AN UPDATE, READY: what `build/follow.sh` built, read for the app.
 *
 * follow.sh builds each commit of the branch it follows and says so in
 * `ready.json` — the commit, the branch, where the bundle is, and the branch's
 * latest commits, newest first. Whether that is an update for THIS app, and
 * what it would bring, is decided here, against the commit the app was built
 * from (`__BUILD__`: a short hash, with a `+` when its tree was dirty).
 *
 * Pure, so `checks/update.mjs` holds it without electron.
 */

/** One commit an update brings: as it was written, so the rail can say it. */
export interface UpdateNote {
  commit: string
  subject: string
  body: string
}

/** An update the app could install — and what has been asked of it. */
export interface UpdateState {
  /** The commit it is, in full, and short. */
  commit: string
  short: string
  /** The branch it was built from. */
  branch: string
  /** The bundle that would be installed. */
  app: string
  /**
   * What it brings, newest first: the commits since this app's own — or, when
   * this app's commit is not among the branch's latest (built from elsewhere,
   * or longer ago), the latest few, with `since` false to say so.
   *
   * Only an update with `since` goes in on quit. Without it, it cannot be told
   * whether the build is newer than this app or older — a commit just made and
   * installed by hand while follow.sh still builds it is offered the one
   * before — so it goes in only when asked for, by Restart now.
   */
  notes: UpdateNote[]
  since: boolean
  /** Restart asked for: waiting for what a restart would cut short, or going now. */
  restart: null | 'waiting' | 'now'
  /** While it waits, what for: so the line can say. */
  waitingFor: Hold | null
}

/**
 * What a restart would cut short: a reply running (or a yes on its way to the
 * continuation it is for), or a Guarded question open — a relaunch has
 * neither the question nor main's record of it, so a yes after it grants
 * nothing.
 */
export type Hold = 'reply' | 'question'

/** How many notes are shown when it cannot be told which are new. */
export const FEW = 5

const FULL = /^[0-9a-f]{40}$/
const SHORT = /^[0-9a-f]{7,40}$/

const str = (v: unknown): v is string => typeof v === 'string'

/**
 * The update `raw` (ready.json, parsed) offers an app built from `own`, or
 * null: nothing readable, a bundle that is not there, or the commit the app
 * already is. `exists` is asked about the bundle.
 */
export function readyUpdate(
  raw: unknown,
  own: string,
  exists: (path: string) => boolean
): Omit<UpdateState, 'restart' | 'waitingFor'> | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const r = raw as Record<string, unknown>
  if (!str(r.commit) || !FULL.test(r.commit) || !str(r.app) || !r.app.endsWith('.app') || !exists(r.app)) return null
  const mine = own.replace(/\+$/, '')
  const known = SHORT.test(mine)
  if (known && r.commit.startsWith(mine)) return null
  const log = (Array.isArray(r.log) ? r.log : []).filter((n: unknown): n is UpdateNote => {
    const o = n as Record<string, unknown> | null
    return Boolean(o) && typeof o === 'object' && str(o!.commit) && FULL.test(o!.commit) && str(o!.subject) && (o!.body === undefined || str(o!.body))
  })
  const at = known ? log.findIndex((n) => n.commit.startsWith(mine)) : -1
  return {
    commit: r.commit,
    short: r.commit.slice(0, 7),
    branch: str(r.branch) ? r.branch : '',
    app: r.app,
    notes: (at >= 0 ? log.slice(0, at) : log.slice(0, FEW)).map((n) => ({ commit: n.commit, subject: n.subject, body: n.body ?? '' })),
    since: at >= 0
  }
}

/** A subject as the rail says it: without the `Lanes: ` every commit here starts with. */
export const said = (subject: string): string => subject.replace(/^Lanes:\s*/, '')
