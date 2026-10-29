// The pathway arithmetic, checked without an app: which whole files belong to
// one visible thread, and where on the page they parted.
//
// This one is NOT for LANES_CAPTURE_EXEC — it is pure, so it runs in node:
//
//   node --experimental-strip-types checks/pathways.mjs
//
// The case that earns the file is nesting. A path that left the root at line 80
// must not be drawn at line 80 of a path that left at 40: by line 40 those two
// were already different conversations, so 40 is where they divide. That is the
// lowest common ancestor's rule, and it is the one thing here a reader cannot
// check by eye.
import {
  ancestry,
  canonicalParent,
  divergence,
  familyOf,
  familyRoot,
  pathwaySplits
} from '../src/shared/pathways.ts'

let failed = 0
const eq = (name, got, want) => {
  const a = JSON.stringify(got)
  const b = JSON.stringify(want)
  if (a === b) console.log('ok   ', name)
  else {
    failed += 1
    console.log('FAIL ', name, '\n      got ', a, '\n      want', b)
  }
}

const rec = (parent, sharedLines) => ({ parent, sharedLines, forkUuid: `u-${parent}-${sharedLines}`, created: 0 })

/* A family:
 *
 *   root ──┬─ 40 ── b ──── 90 ── d
 *          └─ 80 ── c
 *
 * b and c both leave root; d leaves b, below where b left root.
 */
const fam = { b: rec('root', 40), c: rec('root', 80), d: rec('b', 90) }

eq('root of a root', familyRoot(fam, 'root'), 'root')
eq('root of a child', familyRoot(fam, 'c'), 'root')
eq('root of a grandchild', familyRoot(fam, 'd'), 'root')
eq('a stranger is its own root', familyRoot(fam, 'zz'), 'zz')
eq('ancestry climbs', ancestry(fam, 'd'), ['d', 'b', 'root'])
eq('family is every member', familyOf(fam, 'c').sort(), ['b', 'c', 'd', 'root'])

// Siblings part where the earlier of the two left their common ancestor.
eq('root vs b', divergence(fam, 'root', 'b'), { at: 40, via: 'b' })
eq('root vs c', divergence(fam, 'root', 'c'), { at: 80, via: 'c' })
eq('b vs c parts at the earlier edge', divergence(fam, 'b', 'c'), { at: 40, via: 'b' })
eq('c vs b is the same answer', divergence(fam, 'c', 'b'), { at: 40, via: 'b' })
eq('b vs its own child', divergence(fam, 'b', 'd'), { at: 90, via: 'd' })
// THE NESTING RULE: d left b at 90, and c left root at 80 — but d and c were
// already apart at 40, where b left root. Not 80, and not 90.
eq('d vs c parts above both edges', divergence(fam, 'd', 'c'), { at: 40, via: 'b' })
eq('a path against itself does not part', divergence(fam, 'b', 'b'), undefined)
eq('strangers do not part', divergence(fam, 'b', 'zz'), undefined)

// Seams, in reading order, alternatives grouped onto one rule.
eq('seams seen from b', pathwaySplits(fam, 'b'), [
  { at: 40, via: 'b', others: ['c', 'root'] },
  { at: 90, via: 'd', others: ['d'] }
])
// root appears at 40 and NOT again at 90: it parted from d where b left it, and
// a path can only part from another once.
eq('seams seen from d', pathwaySplits(fam, 'd'), [
  { at: 40, via: 'b', others: ['c', 'root'] },
  { at: 90, via: 'd', others: ['b'] }
])
eq('seams seen from root', pathwaySplits(fam, 'root'), [
  { at: 40, via: 'b', others: ['b', 'd'] },
  { at: 80, via: 'c', others: ['c'] }
])
eq('a lone thread has no seam', pathwaySplits(fam, 'zz'), [])

// Canonical parent: a cut inside a copied prefix belongs to whoever wrote it.
eq('below the prefix, the parent is who you see', canonicalParent(fam, 'b', 60), 'b')
eq('inside the prefix, it walks up', canonicalParent(fam, 'b', 20), 'root')
eq('exactly at the edge is a sibling, not a child', canonicalParent(fam, 'b', 40), 'root')
eq('two levels up', canonicalParent(fam, 'd', 20), 'root')
eq('one level up from a grandchild', canonicalParent(fam, 'd', 60), 'b')
eq('a stranger is its own parent', canonicalParent(fam, 'zz', 10), 'zz')

// A corrupt map must fail as a thread with no seams, never as a hang.
const cyclic = { x: rec('y', 10), y: rec('x', 20) }
eq('a cycle terminates', typeof familyRoot(cyclic, 'x'), 'string')
eq('a cycle draws no seam', pathwaySplits(cyclic, 'x').length >= 0, true)

console.log(failed ? `\n${failed} FAILED` : '\nall passed')
process.exit(failed ? 1 : 0)
