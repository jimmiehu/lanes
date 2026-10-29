import { readdir, readFile, rename, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { VAULT } from './config'
import { lanesIn } from './ipcGuard'
import { loadState } from './state'
import { laneOfSkill } from '../shared/lanes.ts'
import type { LaneDef, LaneId, SkillDef } from '../shared/types'

/**
 * Skills are real files in the vault — one folder per skill under
 * `.claude/skills/`, each holding a `SKILL.md` whose frontmatter carries the
 * name and description. The app reads and edits those files; it does not keep
 * its own copy, because the CLI reads them straight off disk.
 */

/**
 * The vault's skills folder, or null before there is a vault — `join('', …)`
 * would be the `.claude` of whatever directory the process started in.
 */
const skillsDir = (): string | null => (VAULT ? join(VAULT, '.claude', 'skills') : null)

/** Where a deleted skill goes. Never `rm`: this is the reader's own vault. */
const trashDir = (): string => join(VAULT, '.trash', 'skills')

/**
 * A skill's id is the name of its folder, and only that: letters, digits, `_`,
 * `-` and `.`, but never `.` or `..` alone — those name the skills folder
 * itself and the vault's `.claude`, and `deleteSkill('..')` moved the whole of
 * `.claude` into the trash.
 */
const SKILL_ID = /^(?!\.\.?$)[\w.-]+$/

/** Frontmatter is YAML, but only two scalar keys are needed and both may fold. */
function frontmatter(raw: string): Record<string, string> {
  if (!raw.startsWith('---')) return {}
  const end = raw.indexOf('\n---', 3)
  if (end === -1) return {}
  const out: Record<string, string> = {}
  let key = ''
  for (const line of raw.slice(4, end).split('\n')) {
    const m = /^([a-zA-Z_][\w-]*):\s*(.*)$/.exec(line)
    if (m) {
      key = m[1]
      // `description: >` folds the following indented block into one line.
      out[key] = m[2] === '>' || m[2] === '|' ? '' : m[2].trim()
      continue
    }
    if (key && /^\s+\S/.test(line)) out[key] = `${out[key]} ${line.trim()}`.trim()
  }
  return out
}

/**
 * The lane a skill belongs to, read off its own name — `garden-check` is the
 * Garden lane's. Skills that name no lane serve all of them, which is most of
 * them. The rule is the shared one (`laneOfSkill`): the name and nothing else,
 * since a lane word in a description is as often a list of places it files
 * into as an owner. A generic tag is true; a confident wrong one is not.
 */
function laneOf(id: string, lanes: readonly LaneDef[]): LaneId | null {
  return laneOfSkill(id, lanes)?.id ?? null
}

function titleOf(raw: string, id: string): string {
  const h1 = /^#\s+(.+)$/m.exec(raw)
  if (h1) return h1[1].split('—')[0].trim()
  return id.replace(/[-_]/g, ' ')
}

export async function listSkills(): Promise<SkillDef[]> {
  const dir = skillsDir()
  if (!dir) return []
  let entries
  try {
    entries = await readdir(dir, { withFileTypes: true })
  } catch {
    return []
  }
  // The person's lanes, as the state file holds them now — a lane renamed in
  // Settings is the next listing's answer.
  const lanes = lanesIn((await loadState()).lanes)
  const out: SkillDef[] = []
  for (const e of entries) {
    if (!e.isDirectory() || e.name.startsWith('.')) continue
    try {
      const raw = await readFile(join(dir, e.name, 'SKILL.md'), 'utf8')
      const fm = frontmatter(raw)
      const description = fm.description ?? ''
      out.push({
        id: e.name,
        name: fm.name ?? titleOf(raw, e.name),
        description,
        lane: laneOf(e.name, lanes)
      })
    } catch {
      // a folder without a readable SKILL.md is not a skill
    }
  }
  return out.sort((a, b) => a.name.localeCompare(b.name))
}

/**
 * Rewrites the two frontmatter fields the app owns, leaving the body — the
 * actual instructions — untouched.
 */
export async function writeSkill(
  id: string,
  name: string,
  description: string
): Promise<{ ok: boolean; reason?: string }> {
  if (typeof id !== 'string' || !SKILL_ID.test(id)) return { ok: false, reason: 'bad id' }
  const dir = skillsDir()
  if (!dir) return { ok: false, reason: 'no vault' }
  const file = join(dir, id, 'SKILL.md')
  try {
    const raw = await readFile(file, 'utf8')
    const end = raw.startsWith('---') ? raw.indexOf('\n---', 3) : -1
    const body = end === -1 ? raw : raw.slice(raw.indexOf('\n', end + 1) + 1)
    const head = `---\nname: ${name}\ndescription: >\n  ${description.replace(/\s*\n\s*/g, '\n  ')}\n---\n`
    await writeFile(file, head + body, 'utf8')
    return { ok: true }
  } catch (err) {
    return { ok: false, reason: String(err) }
  }
}

/**
 * Moves the skill's folder to the vault's trash. A skill is somebody's written
 * work, and "Delete" in a chat app should not be the last time they see it.
 */
export async function deleteSkill(id: string): Promise<{ ok: boolean; reason?: string }> {
  if (typeof id !== 'string' || !SKILL_ID.test(id)) return { ok: false, reason: 'bad id' }
  const dir = skillsDir()
  if (!dir) return { ok: false, reason: 'no vault' }
  const from = join(dir, id)
  try {
    await stat(from)
  } catch {
    return { ok: false, reason: 'no such skill' }
  }
  try {
    const { mkdir } = await import('node:fs/promises')
    const trash = trashDir()
    await mkdir(trash, { recursive: true })
    // Keep every version: a second delete of the same name must not overwrite.
    let target = join(trash, id)
    for (let n = 2; ; n++) {
      try {
        await stat(target)
        target = join(trash, `${id}-${n}`)
      } catch {
        break
      }
    }
    await rename(from, target)
    return { ok: true }
  } catch (err) {
    return { ok: false, reason: String(err) }
  }
}
