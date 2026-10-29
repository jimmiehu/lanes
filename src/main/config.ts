import { homedir } from 'node:os'
import { join } from 'node:path'
import type { ModelDef } from '../shared/types'

/**
 * The folder every session runs in and every note is read from — the
 * person's, chosen at first launch and kept in the state file (vaultChooser.ts).
 * Empty until index.ts sets it, which it does before anything asks.
 *
 * A `let`, and read only inside functions: an ES module's export is a live
 * binding, so every reader that asks at the call follows `setVault`. A module
 * that copied it into a constant as it loaded would keep the empty string.
 */
export let VAULT = ''

export function setVault(path: string): void {
  VAULT = path
}

/** Claude Code encodes a project's cwd by replacing every non-alphanumeric run with a dash. */
export function projectDirFor(cwd: string): string {
  return join(homedir(), '.claude', 'projects', cwd.replace(/[^a-zA-Z0-9]/g, '-'))
}

/** Where the CLI keeps the vault's transcripts — asked at the call, for the same reason as VAULT. */
export function sessionsDir(): string {
  return projectDirFor(VAULT)
}

/**
 * Models offered per chat. Names follow the design's uppercase mono treatment;
 * `cliId` is what actually goes to --model.
 *
 * The dots are `--ink`/`--ink3`/`--mute` — three steps of the one achromatic
 * ramp, loudest first. They were `--fg`, `--fg-62` and `--fg-46`, which the
 * new palette dropped: two of the three resolved to nothing and drew no dot
 * at all. Invisible was survivable while a dot was decoration; it is not now
 * that it is the control for whether the model is offered.
 */
export const MODELS: ModelDef[] = [
  {
    id: 'opus',
    cliId: 'claude-opus-5',
    name: 'OPUS 5',
    note: 'deepest reasoning, slowest',
    dot: 'var(--ink)',
    window: 200000
  },
  {
    id: 'sonnet',
    cliId: 'claude-sonnet-5',
    name: 'SONNET 5',
    note: 'balanced — the default',
    dot: 'var(--ink3)',
    window: 200000
  },
  {
    id: 'haiku',
    cliId: 'claude-haiku-4-5-20251001',
    name: 'HAIKU 4.5',
    note: 'fastest, cheapest',
    dot: 'var(--mute)',
    window: 200000
  }
]

export const DEFAULT_MODEL = 'sonnet'

/** The playful verb set from the design; one is picked per turn. */
export const VERBS: { ing: string; past: string }[] = [
  { ing: 'Steeping', past: 'Steeped' },
  { ing: 'Crunching', past: 'Crunched' },
  { ing: 'Toasting', past: 'Toasted' },
  { ing: 'Percolating', past: 'Percolated' },
  { ing: 'Marinating', past: 'Marinated' },
  { ing: 'Whisking', past: 'Whisked' },
  { ing: 'Simmering', past: 'Simmered' },
  { ing: 'Kneading', past: 'Kneaded' },
  { ing: 'Brewing', past: 'Brewed' },
  { ing: 'Reducing', past: 'Reduced' },
  { ing: 'Proofing', past: 'Proofed' }
]
