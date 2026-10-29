import type { Pathways } from './types'

/**
 * A thread is a family of sessions that share a prefix.
 *
 * Every pathway is a whole `.jsonl` of its own — the truncated copy `forkThread`
 * writes — so nothing here ever splices two files together. All this module
 * does is read the parent pointers that say which whole files belong to one
 * visible thread, and where on the page they parted.
 *
 * Everything is a pure function of the record map. That is deliberate: the
 * split the reader sees is arithmetic over four integers, so it can be checked
 * without a disk, a session, or a running app.
 */

/**
 * A family is a handful of files, so any honest walk ends almost immediately.
 * The cap is for a corrupt map — a cycle would otherwise hang the render, and a
 * thread that draws no divider is a far better failure than one that hangs.
 */
const MAX_WALK = 64

/** The session a family is named by: walk up until nothing claims a parent. */
export function familyRoot(pathways: Pathways, id: string): string {
  let at = id
  for (let i = 0; i < MAX_WALK; i += 1) {
    const rec = pathways[at]
    if (!rec || !rec.parent || rec.parent === at) return at
    at = rec.parent
  }
  return at
}

/** Every id from `id` up to its root, `id` first. */
export function ancestry(pathways: Pathways, id: string): string[] {
  const out = [id]
  let at = id
  for (let i = 0; i < MAX_WALK; i += 1) {
    const rec = pathways[at]
    if (!rec || !rec.parent || rec.parent === at) break
    at = rec.parent
    out.push(at)
  }
  return out
}

/** Every member of the family `id` belongs to, including `id` itself. */
export function familyOf(pathways: Pathways, id: string): string[] {
  const root = familyRoot(pathways, id)
  const out = [root]
  for (const child of Object.keys(pathways)) {
    if (child !== root && familyRoot(pathways, child) === root) out.push(child)
  }
  return out
}

/**
 * Who a new pathway should record as its parent.
 *
 * A cut taken inside the copied prefix is a cut into a stretch the displayed
 * session did not write. Recording the displayed session there would be true
 * but not canonical: two paths cut from different siblings at the same point
 * would each hang off the sibling that happened to be on screen, and would not
 * come out as the siblings of each other that they are. So the pointer walks up
 * to whichever ancestor actually authored the line before the cut.
 */
export function canonicalParent(pathways: Pathways, from: string, sharedLines: number): string {
  let at = from
  for (let i = 0; i < MAX_WALK; i += 1) {
    const rec = pathways[at]
    // At exactly the point where `at` parted from its own parent, the new path
    // shares that prefix with both of them — which makes it their sibling, not
    // `at`'s child.
    if (!rec || !rec.parent || rec.parent === at || sharedLines > rec.sharedLines) return at
    at = rec.parent
  }
  return at
}

/**
 * Where `a` and `b` stop being the same conversation, in the line coordinates
 * both of them share. Undefined when they are the same pathway, or when they
 * are not kin at all.
 *
 * The rule is the lowest common ancestor's: a path that parted from the root at
 * line 80 must not be drawn at line 80 of a path that left at 40 — by line 40
 * the two were already different conversations, so 40 is where they divide.
 */
export function divergence(
  pathways: Pathways,
  a: string,
  b: string
): { at: number; via: string } | undefined {
  if (a === b) return undefined
  if (familyRoot(pathways, a) !== familyRoot(pathways, b)) return undefined
  const up = ancestry(pathways, a)
  const mine = new Map(up.map((id, i) => [id, i]))
  // Walk b upwards until it meets a's line of descent. The first meeting point
  // is the lowest common ancestor.
  let at = b
  let below = b
  for (let i = 0; i < MAX_WALK; i += 1) {
    if (mine.has(at)) break
    const rec = pathways[at]
    if (!rec || !rec.parent || rec.parent === at) return undefined
    below = at
    at = rec.parent
  }
  // The two edges leaving the common ancestor: the one b came down, and the one
  // a came down. Whichever left first is where the two parted.
  const aAt = mine.get(at)
  const aVia = aAt !== undefined && aAt > 0 ? up[aAt - 1] : undefined
  const bVia = below === at ? undefined : below
  const edges: { at: number; via: string }[] = []
  for (const via of [aVia, bVia]) {
    const n = via ? pathways[via]?.sharedLines : undefined
    if (via && typeof n === 'number') edges.push({ at: n, via })
  }
  if (!edges.length) return undefined
  // `via` is the record whose own cut defined this line, which is what carries
  // the uuid the split can be checked against — a line count alone would move
  // silently if a transcript were ever rewritten under it.
  return edges.reduce((lo, e) => (e.at < lo.at ? e : lo))
}

export interface Split {
  /** The shared-prefix line the paths part at — where the seam is drawn. */
  at: number
  /** The record whose cut defined this line, and so the uuid to check it by. */
  via: string
  /** Family members whose conversation continues elsewhere from this point. */
  others: string[]
}

/**
 * Every seam the active pathway should show, in reading order.
 *
 * One per distinct divergence line: the alternatives that leave at the same
 * point are alternatives to each other, and belong on the same rule.
 */
export function pathwaySplits(pathways: Pathways, activeId: string): Split[] {
  const by = new Map<number, { via: string; others: string[] }>()
  for (const member of familyOf(pathways, activeId)) {
    const d = divergence(pathways, activeId, member)
    if (!d) continue
    const group = by.get(d.at)
    if (group) group.others.push(member)
    else by.set(d.at, { via: d.via, others: [member] })
  }
  return [...by.entries()]
    .sort((x, y) => x[0] - y[0])
    .map(([at, g]) => ({ at, via: g.via, others: g.others.sort() }))
}
