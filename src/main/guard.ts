/**
 * Why a driven check may not start here, or `null` if it may.
 *
 * A driven check (`LANES_CAPTURE_EXEC`) is a script that writes notes and the
 * state file. Started without a state directory and a vault of its own, it
 * would be writing into whoever's Lanes this is — their tabs, their pins and
 * their notes. `checks/run.mjs` always hands it both; a check started by hand
 * has to as well, or it does not start.
 *
 * Pure, and asked of an env rather than of `process`, so the refusal itself is
 * checked in node without ever booting an app that could reach a real state
 * file (`checks/run.mjs --self-test`).
 */
export function driveRefusal(env: Record<string, string | undefined>): string | null {
  if (!env.LANES_CAPTURE_EXEC) return null
  const missing = ['LANES_STATE', 'LANES_VAULT'].filter((k) => !env[k])
  if (!missing.length) return null
  return `lanes: refusing to run a driven check without ${missing.join(' and ')} — run it through checks/run.mjs`
}
