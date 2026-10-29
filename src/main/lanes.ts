import { laneOfPath } from '../shared/lanes.ts'
import type { LaneDef, LaneId } from '../shared/types'

export type { LaneDef }

/**
 * Assigns a thread to the lane its touched notes point at. Weighted so that
 * writing to a file counts for more than grepping past it; a thread that
 * touched nothing in a lane's folder stays unassigned rather than being
 * guessed at.
 *
 * Which lane a path is in is the one shared rule (src/shared/lanes.ts), asked
 * of the person's lanes as main holds them now. A touch is usually
 * vault-relative already; one still absolute is read against `vault`, and a
 * file outside it has no vote.
 */
export function laneFromPaths(
  paths: { path: string; weight: number }[],
  lanes: readonly LaneDef[],
  vault?: string
): LaneId | null {
  if (!lanes.length) return null
  const score = new Map<LaneId, number>()
  for (const { path, weight } of paths) {
    // In the folder, not the folder: `ls projects/garden` is a look, not work.
    const lane = laneOfPath(path, lanes, vault, { inside: true })
    if (!lane) continue
    score.set(lane.id, (score.get(lane.id) ?? 0) + weight)
  }
  let best: LaneId | null = null
  let bestScore = 0
  for (const [id, s] of score) {
    if (s > bestScore) {
      best = id
      bestScore = s
    }
  }
  return best
}

/** Weight a tool call contributes to its file's lane score. */
export const TOOL_WEIGHT: Record<string, number> = {
  Write: 4,
  Edit: 3,
  NotebookEdit: 3,
  Read: 2,
  Glob: 1,
  Grep: 1
}
