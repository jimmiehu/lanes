/**
 * WHICH LANE A PATH IS IN — the one rule, asked by main (a thread's lane, from
 * the notes it worked on), by the renderer (a note's lane, from its folder) and
 * by the skills list (a skill's lane, from its name).
 *
 * A lane is a folder of the vault the person named, not a convention the app
 * assumes: `projects/garden`, `Clients/Acme`, `essays`. A path is in a lane
 * when it sits under that folder — vault-relative, case aside, at a folder
 * boundary so `essays-old/x` is not in `essays` — and when lanes nest, the
 * deepest folder that holds it wins: `projects/garden/beds.md` is Garden's even
 * with a lane on `projects` as well.
 *
 * Main sees absolute paths too (a tool call's `file_path`), so the vault's own
 * prefix is taken off first; a path outside the vault is in no lane.
 */

/** What a lane is to the code that files things into it. */
export interface LaneLike {
  id: string
  name: string
  folder: string
}

/**
 * A folder or a path as compared: no `./`, no doubled or edge slashes, lower
 * case. A backslash is a character of a name on a Mac, not a separator — a
 * shell's escaped `garden\ notes` read off a command is not the folder `garden`.
 */
function norm(p: string): string {
  return p
    .replace(/\/{2,}/g, '/')
    .replace(/^(?:\.\/)+/, '')
    .replace(/^\/+|\/+$/g, '')
    .toLowerCase()
}

/** The vault-relative form of `path`, or null when it is absolute and elsewhere. */
function relative(path: string, vault?: string): string | null {
  if (!path.startsWith('/') && !path.startsWith('~')) return path
  if (!vault) return null
  const root = vault.replace(/\/+$/, '')
  if (path.toLowerCase().startsWith(`${root.toLowerCase()}/`)) return path.slice(root.length + 1)
  return null
}

/**
 * `inside` holds a path to being in the folder — main's vote over a thread's
 * files asks it so. A file in it counts, and so does the folder written as a
 * folder, `projects/garden/`; the bare name `projects/garden` does not. That
 * line is where the rule before lanes were settings drew it, and it is kept so
 * that a thread filed then is filed the same now: run over one vault's three
 * hundred threads, moving it either way re-filed a dozen of them.
 */
export function laneOfPath<T extends LaneLike>(
  path: string,
  lanes: readonly T[],
  vault?: string,
  opts: { inside?: boolean } = {}
): T | null {
  const rel = relative(path, vault)
  if (rel === null) return null
  const at = norm(rel)
  const asFolder = rel.endsWith('/')
  let best: T | null = null
  let bestLen = -1
  for (const lane of lanes) {
    const folder = norm(lane.folder ?? '')
    // A lane with no folder would hold the whole vault, which is no lane.
    if (!folder) continue
    const isIt = at === folder && (!opts.inside || asFolder)
    if ((isIt || at.startsWith(`${folder}/`)) && folder.length > bestLen) {
      best = lane
      bestLen = folder.length
    }
  }
  return best
}

/** A name as a skill or an id would spell it: `Kitchen & Co` → `kitchen-co`. */
export function slug(name: string): string {
  return name
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/**
 * The lane a skill belongs to, read off its own name — `garden-check` is
 * Garden's. Skills that name no lane serve all of them, which is most of them.
 * The name and nothing else: a lane word in a description is too easily a
 * list of places, not an owner.
 */
export function laneOfSkill<T extends LaneLike>(id: string, lanes: readonly T[]): T | null {
  const head = id.toLowerCase()
  let best: T | null = null
  for (const lane of lanes) {
    const key = slug(lane.name)
    if (!key) continue
    if ((head === key || head.startsWith(`${key}-`)) && (!best || key.length > slug(best.name).length)) best = lane
  }
  return best
}

/** How a lane is named in the chrome: its name, in the uppercase the design sets it in. */
export const laneLabel = (lane: { name: string }): string => lane.name.toUpperCase()
