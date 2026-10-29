import type { AppState, LaneDef, SafetyId } from '../shared/types'

/**
 * WHAT THE RENDERER HANDS MAIN, CHECKED AT THE DOOR.
 *
 * The renderer is our own page, but it renders text nobody here wrote —
 * Claude's answers, notes from anywhere — and whatever it hands across the
 * bridge main turns into files and settings. So what arrives is checked for
 * the shape it has to have before anything is done with it. A note's path has
 * its own guard, beside the notes (`vaultPath`, notes.ts); these are the rest.
 *
 * Pure, with no electron in it, so checks/ipc-paths.mjs can hold it in node.
 */

/**
 * A session id, as the CLI mints them: a UUID, and so a file name with no
 * slash or dot in it. `lanes:thread`, `lanes:fork` and `lanes:pathTrash` each
 * join one onto the transcripts' folder, where `../x` would be a file of
 * somebody else's.
 */
export function isSessionId(id: unknown): id is string {
  return typeof id === 'string' && /^[0-9a-f-]{36}$/i.test(id)
}

const SAFETY: readonly SafetyId[] = ['guarded', 'standard', 'autonomous']
const isString = (v: unknown): v is string => typeof v === 'string'
const isSafety = (v: unknown): v is SafetyId => SAFETY.includes(v as SafetyId)
const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)
const isLane = (v: unknown): boolean =>
  isRecord(v) &&
  isString(v.id) &&
  isString(v.name) &&
  isString(v.folder) &&
  (v.purpose === undefined || isString(v.purpose))

/**
 * The keys a wrong type in would do harm: which folders are lanes and which
 * are read-only, where a new note lands, and how much Claude may do unasked.
 */
const SHAPES: Record<string, (v: unknown) => boolean> = {
  lanes: (v) => Array.isArray(v) && v.every(isLane),
  readOnlyFolders: (v) => Array.isArray(v) && v.every(isString),
  newNoteFolder: isString,
  safety: isSafety,
  // A list with anything but prompts in it is refused whole: saved short, it
  // would quietly delete the prompts it left out.
  prompts: (v) => Array.isArray(v) && v.every(isRecord)
}

/**
 * Keys the page never sets, whatever they hold. `vault` is the folder every
 * note guard is measured from and every session runs in, and main's own
 * picker is its one writer (vaultChooser.ts): a `/` patched in from the page
 * would be relaunched on as the vault, the whole disk a note's folder.
 */
const MAIN_ONLY = ['vault']

/**
 * A state patch from the renderer, with every key of the wrong type dropped —
 * dropped, not thrown on: the rest of the patch is a person's tab move or
 * setting and still lands. A key only main writes is dropped too; keys not
 * named above go through untouched. The patch handed in is not changed.
 *
 * A saved prompt's own `safety` is the one the scheduler runs it with, with
 * nobody there, so a prompt carrying one that is no safety at all loses it
 * and falls back to the app's, rather than the prompt being lost.
 */
export function sanitizeStatePatch(patch: unknown): Partial<AppState> {
  if (!isRecord(patch)) return {}
  const out: Record<string, unknown> = { ...patch }
  for (const key of MAIN_ONLY) delete out[key]
  for (const [key, fits] of Object.entries(SHAPES)) {
    if (key in out && !fits(out[key])) delete out[key]
  }
  if (Array.isArray(out.prompts)) {
    out.prompts = (out.prompts as Record<string, unknown>[]).map((p) => {
      if (p.safety === undefined || isSafety(p.safety)) return p
      const { safety: _wrong, ...kept } = p
      return kept
    })
  }
  return out as Partial<AppState>
}

/**
 * The lanes a state file holds, as main reads them: the ones of the right
 * shape. The state file is the person's to edit by hand, so a lane missing its
 * folder is passed over here rather than met as a crash later — and passed
 * over, not removed: what the file says stays what it says.
 */
export function lanesIn(v: unknown): LaneDef[] {
  return Array.isArray(v) ? (v.filter(isLane) as LaneDef[]) : []
}

/** The read-only folders a state file holds, read the same way: the strings among them. */
export function foldersIn(v: unknown): string[] {
  return Array.isArray(v) ? v.filter(isString) : []
}
