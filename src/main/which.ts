import { execFileSync, spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

/**
 * Finding the `claude` binary from inside a double-clicked app.
 *
 * A packaged app launched from Finder does not inherit a terminal's
 * environment: macOS hands it `/usr/bin:/bin:/usr/sbin:/sbin` and nothing else.
 * Every place a package manager actually puts the CLI — Homebrew, npm's global
 * prefix, nvm, bun, volta — is outside that list, so `spawn('claude')` fails
 * with ENOENT in the packaged app while working perfectly in `npm run dev`.
 *
 * The fix is to ask the user's login shell what it thinks the PATH is, exactly
 * as a terminal would, and to keep a list of the usual suspects for when that
 * fails. The resolved PATH is handed to the child too, because the CLI shells
 * out itself.
 */

const FALLBACK_DIRS = [
  '/opt/homebrew/bin',
  '/usr/local/bin',
  '/opt/local/bin',
  join(homedir(), '.local/bin'),
  join(homedir(), '.bun/bin'),
  join(homedir(), '.volta/bin'),
  join(homedir(), '.npm-global/bin'),
  join(homedir(), '.yarn/bin')
]

export interface Resolved {
  /** Absolute path to the binary, or 'claude' if only the PATH was recovered. */
  bin: string
  /** PATH to hand the child process. */
  path: string
  /** How it was found — surfaced by LANES_DEBUG_CLI. */
  via: string
}

let cached: Resolved | null = null

/** The login shell's PATH, as a terminal would see it. */
function loginShellPath(): string | null {
  const shell = process.env.SHELL
  if (!shell) return null
  try {
    // -l reads the profile, which is where PATH is set. Deliberately not -i:
    // an interactive shell runs the whole rc file, which on a real machine
    // means prompt frameworks and version managers, and can take seconds.
    const out = execFileSync(shell, ['-lc', 'printf %s "$PATH"'], {
      encoding: 'utf8',
      timeout: 5000,
      stdio: ['ignore', 'pipe', 'ignore']
    })
    const path = out.trim()
    return path.includes('/') ? path : null
  } catch {
    return null
  }
}

function firstExisting(dirs: string[], name: string): string | null {
  for (const dir of dirs) {
    const full = join(dir, name)
    if (existsSync(full)) return full
  }
  return null
}

/**
 * Resolves once and caches. `LANES_CLAUDE` names the binary outright, which is
 * the escape hatch for a CLI installed somewhere nobody would guess.
 */
export function resolveClaude(): Resolved {
  if (cached) return cached

  const basePath = process.env.PATH ?? ''
  // Read in the packaged app too, unlike every other LANES_* (see dev.ts).
  const override = process.env.LANES_CLAUDE
  if (override && existsSync(override)) {
    cached = { bin: override, path: basePath, via: 'LANES_CLAUDE' }
    return cached
  }

  const shellPath = loginShellPath()
  const merged = [shellPath, basePath, FALLBACK_DIRS.join(':')]
    .filter(Boolean)
    .join(':')
  // Dedupe, keeping the first mention: the login shell's own order is the one
  // the user arranged, and appending must not shadow it.
  const seen = new Set<string>()
  const path = merged
    .split(':')
    .filter((d) => d && !seen.has(d) && (seen.add(d), true))
    .join(':')

  const dirs = path.split(':').filter(Boolean)
  const bin = firstExisting(dirs, 'claude')
  cached = {
    bin: bin ?? 'claude',
    path,
    via: bin ? (shellPath ? 'login shell PATH' : 'known install dir') : 'not found'
  }
  return cached
}

/** True when nothing on any searched path answers to `claude`. */
export const claudeMissing = (): boolean => resolveClaude().via === 'not found'

/**
 * WHETHER THE CLI IS SIGNED IN — asked before anybody types, not after a
 * message has been composed and lost.
 *
 * `claude auth status` prints JSON, costs no tokens and touches no network, so
 * it is cheap enough to ask at launch and again whenever a turn comes back
 * complaining about authentication. Anything unexpected answers `null`, which
 * means "do not say anything": a status check that cannot be read is not
 * evidence of being signed out, and a sign-in banner shown to somebody who is
 * signed in is worse than no banner at all.
 *
 * `'missing'` is the one thing known for certain: no `claude` anywhere this
 * looked — the login shell's PATH, the app's, the usual install folders — and
 * no LANES_CLAUDE naming one. Then there is nothing to sign in to, and the
 * window says how to install it. Looked for again on every ask while it is
 * missing, so *Check again* after an install finds it without a relaunch.
 */
export async function authStatus(): Promise<{ loggedIn: boolean; method: string } | 'missing' | null> {
  if (cached?.via === 'not found') cached = null
  if (claudeMissing()) return 'missing'
  const claude = resolveClaude()
  return new Promise((done) => {
    let out = ''
    let settled = false
    const finish = (v: { loggedIn: boolean; method: string } | null): void => {
      if (settled) return
      settled = true
      done(v)
    }
    try {
      const child = spawn(claude.bin, ['auth', 'status'], {
        env: { ...process.env, PATH: claude.path },
        stdio: ['ignore', 'pipe', 'ignore']
      })
      // A CLI that hangs on this must not hold the launch open.
      const timer = setTimeout(() => {
        child.kill()
        finish(null)
      }, 6000)
      child.stdout.setEncoding('utf8')
      child.stdout.on('data', (c: string) => {
        out += c
      })
      child.on('error', () => {
        clearTimeout(timer)
        finish(null)
      })
      child.on('close', () => {
        clearTimeout(timer)
        try {
          const j = JSON.parse(out.slice(out.indexOf('{'), out.lastIndexOf('}') + 1)) as {
            loggedIn?: unknown
            authMethod?: unknown
          }
          if (typeof j.loggedIn !== 'boolean') return finish(null)
          finish({ loggedIn: j.loggedIn, method: String(j.authMethod ?? 'unknown') })
        } catch {
          finish(null)
        }
      })
    } catch {
      finish(null)
    }
  })
}
