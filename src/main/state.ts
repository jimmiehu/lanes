import { app } from 'electron'
import { readFileSync } from 'node:fs'
import { readFile, rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { DEFAULT_FLAGS, type AppState, type Flags } from '../shared/types'

/**
 * App metadata — lane overrides, pins, order, per-thread controls. Lives in
 * Application Support, never in the vault: the vault holds notes, not the
 * app's opinions about them.
 */

const FILE = (): string => join(app.getPath('userData'), 'lanes-state.json')

export const DEFAULT_STATE: AppState = {
  // None until it is chosen: the first launch asks (vaultChooser.ts).
  vault: null,
  // The person's. A new install has none, and nothing about a lane is assumed.
  lanes: [],
  readOnlyFolders: [],
  laneOverrides: {},
  attachments: {},
  titleOverrides: {},
  perLane: 8,
  recentOpen: false,
  visited: [],
  // Auto is the design's default: appearance defers to the system until someone
  // says otherwise. A v2 state file carrying 'dark' or 'light' still wins.
  theme: 'auto',
  accent: 'cobalt',
  highlight: 'yellow',
  threadSettings: {},
  // A new install asks before every write and command. A state file that says
  // otherwise keeps what it says: the loader spreads it over these.
  safety: 'guarded',
  defaultModel: 'sonnet',
  defaultEffort: 'mid',
  customModels: [],
  modelsOff: [],
  flags: DEFAULT_FLAGS,
  skillsOff: [],
  marks: [],
  railMode: 'recent',
  starredOpen: true,
  // The vault's root. A state file that names a folder keeps it.
  newNoteFolder: '',
  moreDirs: [],
  collapsedFolders: [],
  notesSort: 'recent',
  openDirs: [],
  hideLeft: false,
  sessionEndsAt: null,
  usage: null,
  prompts: [],
  runs: {},
  writeFocus: false,
  writeTypewriter: false,
  textScale: 1,
  measure: 620,
  composerH: 28,
  splitRatio: 0.5,
  tabs: [[], []],
  activeTab: [0, 0],
  split: false,
  pathways: {},
  pathwayActive: {},
  pathwayLabels: {},
  contextWindows: {}
}

/**
 * The vault the state file names, read before anything else is — index.ts
 * needs it as it loads, before `ready` and before any promise could settle.
 * `app.getPath('userData')` is good this early (after LANES_STATE has moved
 * it). Only the one key, and only read: the state proper is still loaded the
 * one way, below. Null when there is no file, no vault in it, or no reading it.
 */
export function readVaultSync(): string | null {
  try {
    const saved = JSON.parse(readFileSync(FILE(), 'utf8')) as { vault?: unknown }
    return typeof saved?.vault === 'string' && saved.vault ? saved.vault : null
  } catch {
    return null
  }
}

let cache: AppState | null = null
let writeTimer: NodeJS.Timeout | null = null
/**
 * Whether the file says `flags.schedules`. One written before the switch
 * existed does not, and is read as on when a prompt already runs by itself —
 * a reading of the file, not something to write into it on its own account.
 */
let schedulesSaid = false

/** What a file that does not say `flags.schedules` means by it. */
function scheduledAlready(prompts: Partial<AppState>['prompts'] | null): boolean {
  return Array.isArray(prompts) && prompts.some((p) => p?.schedule?.on === true)
}

export async function loadState(): Promise<AppState> {
  if (cache) return cache
  try {
    const raw = await readFile(FILE(), 'utf8')
    // Merge over defaults so a state file written by an older build still opens.
    const saved = JSON.parse(raw) as Partial<AppState>
    // Read before the merge below, where "not said" can no longer be told
    // apart from the default's "off".
    const schedules = saved.flags?.schedules
    schedulesSaid = typeof schedules === 'boolean'
    // Flags merge one level deeper, so a build that adds a toggle does not
    // wipe the ones already set.
    cache = {
      ...DEFAULT_STATE,
      ...saved,
      flags: {
        ...DEFAULT_FLAGS,
        ...saved.flags,
        schedules: typeof schedules === 'boolean' ? schedules : scheduledAlready(saved.prompts)
      },
      notesSort: saved.notesSort ?? 'recent'
    }
  } catch {
    schedulesSaid = false
    cache = { ...DEFAULT_STATE }
  }
  return cache
}

/**
 * The state as the file holds it. A file that never said `flags.schedules`
 * goes on not saying it for as long as leaving it out reads the same, and
 * says it from the moment it would not: the switch turned, or — the case
 * that matters — a new install scheduling a prompt with the switch still
 * off, which the next launch would otherwise read as on.
 */
function onDisk(st: AppState): unknown {
  if (schedulesSaid || st.flags.schedules !== scheduledAlready(st.prompts)) {
    schedulesSaid = true
    return st
  }
  const flags: Partial<Flags> = { ...st.flags }
  delete flags.schedules
  return { ...st, flags }
}

/** Writes via a temp file so a crash mid-write cannot truncate the state. */
async function flush(): Promise<void> {
  if (!cache) return
  const target = FILE()
  const tmp = `${target}.tmp`
  try {
    await writeFile(tmp, JSON.stringify(onDisk(cache), null, 2), 'utf8')
    await rename(tmp, target)
  } catch {
    // A state file we cannot write is a lost preference, not a broken app. Both
    // callers are fire-and-forget, so without this the failure surfaces as an
    // unhandled rejection and takes the quit path with it.
  }
}

export async function patchState(patch: Partial<AppState>): Promise<AppState> {
  const state = await loadState()
  cache = { ...state, ...patch }
  // Flags come whole from the window. One that does not carry the schedules
  // switch has not turned it, so it keeps what it was.
  if (patch.flags && typeof patch.flags.schedules !== 'boolean')
    cache.flags = { ...patch.flags, schedules: state.flags.schedules }
  if (writeTimer) clearTimeout(writeTimer)
  writeTimer = setTimeout(() => {
    void flush()
  }, 250)
  return cache
}

/** Called on quit so a pending debounce is not lost. */
export async function flushNow(): Promise<void> {
  if (writeTimer) {
    clearTimeout(writeTimer)
    writeTimer = null
  }
  await flush()
}
