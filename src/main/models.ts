import { spawn } from 'node:child_process'
import { tmpdir } from 'node:os'
import { resolveClaude } from './which'

/**
 * Does the CLI know this model?
 *
 * Asked before a custom model is added, rather than discovered later when a
 * message fails to send. The CLI is the only thing that can answer — the set of
 * ids it accepts depends on its version and on what the account can reach — so
 * this asks it the same way a turn does, with the smallest possible question.
 *
 * A bad id exits 1 and says so in one line ("There's an issue with the selected
 * model (…). It may not exist or you may not have access to it."), which is a
 * better message than anything this app could write, so it is passed through.
 */

const TIMEOUT_MS = 40_000

/** Nothing here needs a tool, and a two-token probe is not worth a vault read. */
const NO_TOOLS = [
  'Bash',
  'Read',
  'Write',
  'Edit',
  'NotebookEdit',
  'Glob',
  'Grep',
  'WebFetch',
  'WebSearch',
  'Task',
  'Agent',
  'Skill'
].join(',')

/**
 * The CLI prints a paragraph about auto-compact for any id it does not have a
 * context window for, which is NOT a failure — an id it does not recognise can
 * still be one the API serves. Only the refusal matters here.
 */
const cleanReason = (out: string): string => {
  const line = out
    .split('\n')
    .map((l) => l.trim())
    .find((l) => /issue with the selected model|does not exist|not have access|invalid/i.test(l))
  return line || out.trim().split('\n')[0] || 'The CLI would not accept that model.'
}

export function checkModel(cliId: string): Promise<{ ok: boolean; reason?: string }> {
  const id = cliId.trim()
  if (!id) return Promise.resolve({ ok: false, reason: 'Give it a model id.' })

  return new Promise((resolve) => {
    let claude: ReturnType<typeof resolveClaude>
    try {
      claude = resolveClaude()
    } catch {
      return resolve({ ok: false, reason: 'Could not find the `claude` command.' })
    }

    const child = spawn(
      claude.bin,
      ['-p', 'Reply with the single word: ok', '--model', id, '--disallowedTools', NO_TOOLS, '--strict-mcp-config'],
      {
        // Deliberately not the vault: a probe has no business there.
        cwd: tmpdir(),
        stdio: ['ignore', 'pipe', 'pipe'],
        env: { ...process.env, PATH: claude.path }
      }
    )

    let out = ''
    let settled = false
    const done = (v: { ok: boolean; reason?: string }): void => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      child.kill()
      resolve(v)
    }
    const timer = setTimeout(
      () => done({ ok: false, reason: 'The CLI did not answer in time. Try again.' }),
      TIMEOUT_MS
    )

    child.stdout.on('data', (d: Buffer) => (out += d.toString()))
    child.stderr.on('data', (d: Buffer) => (out += d.toString()))
    child.on('error', (err) => done({ ok: false, reason: `Could not run claude: ${err.message}` }))
    child.on('close', (code) =>
      done(code === 0 ? { ok: true } : { ok: false, reason: cleanReason(out) })
    )
  })
}
