import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { EventEmitter } from 'node:events'
import { existsSync } from 'node:fs'
import { join, relative } from 'node:path'
import { apiErrorIn } from '../shared/apiError'
import { parseBlocks } from '../shared/blocks'
import { quoteWire } from '../shared/quote'
import { readUsage } from '../shared/usage'
import { windowFor } from '../shared/contextWindow'
import type { Hold } from '../shared/update'
import { MODELS, sessionsDir, VAULT, VERBS } from './config'
import { learnWindow, windows } from './windows'
import { resolveClaude } from './which'
import { devEnv } from './dev'
const Q = (m: string): void => { if (devEnv('LANES_DEBUG_QUEUE')) console.log("[q]", m) }

import type {
  Attachment,
  ContextUsage,
  EffortId,
  Message,
  MessageBlock,
  PermissionRequest,
  SafetyId,
  StartOptions,
  StreamEvent,
  ToolBlock
} from '../shared/types'

const EFFORT_FLAG: Record<EffortId, string> = {
  low: 'low',
  mid: 'medium',
  high: 'high',
  xhigh: 'xhigh',
  max: 'max'
}

/**
 * Guarded runs the CLI in `manual`, where nothing is pre-approved. What the CLI
 * does then is *deny* the call and end the turn — headless mode has no channel
 * to ask a question on — so the app reads the denial and asks on its behalf.
 * See `approve()` below for the other half.
 */
const PERMISSION_MODE: Record<SafetyId, string> = {
  guarded: 'manual',
  standard: 'acceptEdits',
  autonomous: 'bypassPermissions'
}

const SAFETIES = Object.keys(PERMISSION_MODE) as SafetyId[]
const EFFORTS = Object.keys(EFFORT_FLAG) as EffortId[]

/**
 * A chat's safety and effort, taken only when each is one the flag tables
 * above have a row for. Anything else is the first of `fallbacks` that is —
 * the thread's own, then the app's — and failing those, Guarded and `mid`,
 * what a new install starts on. The page sends these with every message, and
 * safety is the flag that decides what runs unasked: a value that is none of
 * the three is not a setting to take on its word.
 *
 * Checked against the lists rather than with `in`, which `constructor` passes.
 */
export function knownFlags(
  opts: StartOptions,
  ...fallbacks: (Partial<Pick<StartOptions, 'safety' | 'effort'>> | undefined)[]
): StartOptions {
  const first = <T>(known: readonly T[], said: unknown[], last: T): T =>
    (said.find((v) => known.includes(v as T)) as T | undefined) ?? last
  return {
    ...opts,
    safety: first(SAFETIES, [opts.safety, ...fallbacks.map((f) => f?.safety)], 'guarded'),
    effort: first(EFFORTS, [opts.effort, ...fallbacks.map((f) => f?.effort)], 'mid')
  }
}

/**
 * A refusal as main put it to the reader, with the id an answer has to bring
 * back. Main keeps its own copy: what was asked, and so how wide a yes it
 * takes, is never read off the answer.
 */
type Asked = PermissionRequest & { id: string }

/**
 * Anything shaped like a credential, masked before a tool call reaches the
 * screen. Deliberately shape-based rather than a list of key names: a vault can
 * hold secrets — an API key in a note, a token in a config file — and a `sk-…`
 * in a grep result is a leak whatever the surrounding text called it.
 */
const SECRET_PATTERNS: RegExp[] = [
  /\b(sk|pk|rk)-[A-Za-z0-9_-]{16,}/g,
  /\bgh[pousr]_[A-Za-z0-9]{16,}/g,
  /\bxox[abposr]-[A-Za-z0-9-]{10,}/g,
  /\bBearer\s+[A-Za-z0-9._-]{16,}/gi,
  /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{6,}/g,
  /\b(?:api[_-]?key|token|secret|password|passwd)\s*[=:]\s*["']?([A-Za-z0-9._~+/-]{12,})["']?/gi
]

function redactSecrets(text: string): string {
  let out = text
  for (const re of SECRET_PATTERNS) {
    out = out.replace(re, (match, captured?: string) =>
      captured ? match.replace(captured, '••••••') : '••••••'
    )
  }
  return out
}

/** Tools whose grant is an edit rather than a free hand. */
const FILE_TOOLS = new Set(['Write', 'Edit', 'NotebookEdit', 'Read'])

/** MCP tools arrive as mcp__<server>__<tool>; the badge only needs the tool. */
function shortName(name: string): string {
  const m = /^mcp__.*?__(.+)$/.exec(name)
  return m ? m[1] : name
}

/** The vault is already the cwd, so a leading `cd <vault> &&` is noise. */
function trimCd(cmd: string): string {
  const escaped = VAULT.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return cmd.replace(new RegExp(`^\\s*cd\\s+["']?${escaped}["']?\\s*&&\\s*`), '')
}

/** The one-line summary a collapsed tool row shows next to its name badge. */
function summarise(name: string, input: Record<string, unknown>): string {
  const path = (v: unknown): string =>
    typeof v === 'string' ? relative(VAULT, v) || v : ''
  switch (name) {
    case 'Bash':
      return trimCd(String(input.command ?? ''))
    case 'Read':
    case 'Write':
    case 'NotebookEdit':
      return path(input.file_path ?? input.notebook_path)
    case 'Edit':
      return path(input.file_path)
    case 'Glob':
      return String(input.pattern ?? '')
    case 'Grep':
      return `${String(input.pattern ?? '')}${input.path ? ' · ' + path(input.path) : ''}`
    case 'WebFetch':
      return String(input.url ?? '')
    case 'WebSearch':
      return String(input.query ?? '')
    case 'ToolSearch':
      return String(input.query ?? '')
    case 'Skill':
      return String(input.skill ?? '')
    case 'Task':
    case 'Agent':
      return String(input.description ?? '')
    case 'TodoWrite':
      return 'todos'
    default: {
      // MCP and unknown tools: prefer whichever human-readable field is there.
      const first =
        input.query ?? input.description ?? input.prompt ?? input.name ?? input.path ?? input.url
      if (typeof first === 'string' && first) return first
      const s = JSON.stringify(input)
      return s.length > 160 ? s.slice(0, 160) + '…' : s
    }
  }
}

function textOf(content: unknown): string {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  return content
    .filter((b) => b && typeof b === 'object' && (b as { type?: string }).type === 'text')
    .map((b) => String((b as { text?: string }).text ?? ''))
    .join('\n')
}

/**
 * One long-lived `claude` child process, one Claude Code session.
 *
 * A turn arrives as several stream events; they collapse into a single CLAUDE
 * message whose blocks grow as tool calls run, so the stream shows progress
 * for a ten-minute turn as readily as a two-second one.
 */
export class CliSession extends EventEmitter {
  readonly sessionId: string
  private child: ChildProcessWithoutNullStreams | null = null
  private buf = ''
  private opts: StartOptions
  private isNew: boolean

  /** The message being assembled for the turn in flight. */
  private draft: Message | null = null
  /** A turn is in flight, so a further send queues rather than interleaving. */
  private busy = false
  private queue: {
    text: string
    quote?: { label: string; text: string }
    images?: Attachment[]
    /** The continuation of a yes, waiting behind a turn: the mode it was given. */
    grant?: SafetyId
  }[] = []
  private toolsById = new Map<string, ToolBlock>()
  /** tool_use_id of a subagent whose child calls nest under it. */
  private parents = new Map<string, ToolBlock>()
  private startedAt = 0
  private verb = VERBS[0]
  /** The thread's own last call — what it sent, and the model that took it. */
  private lastContext: { used: number; model: string | null } | null = null
  /**
   * A yes to a Guarded request, between the answer and the continuation it is
   * for — the wait for the old process to go. Anything that ends the turn in
   * that wait (Stop, a kill) drops it, and the continuation is not sent. The
   * grant itself travels with that one message, never in a field a later
   * spawn could read: it outlived its turn when it did.
   */
  private granted: { mode: SafetyId } | null = null
  /**
   * What the live process was started with: the flags it cannot change, and
   * whether it runs on a grant. Read only while `child` is set; every spawn
   * writes it afresh.
   */
  private live: { flags: string; granted: boolean } = { flags: '', granted: false }
  /** The refusal main last asked the reader about and has had no answer to. */
  private asked: Asked | null = null

  constructor(opts: StartOptions) {
    super()
    this.opts = opts
    this.isNew = opts.fresh ?? !opts.sessionId
    this.sessionId = opts.sessionId ?? randomUUID()
  }

  /** The safety and effort this thread runs on — what a value that is none falls back to. */
  get settings(): Pick<StartOptions, 'safety' | 'effort'> {
    return { safety: this.opts.safety, effort: this.opts.effort }
  }

  /**
   * What a restart into an update would cut short here (main/update.ts waits
   * it out): a turn in flight, or a yes on its way to its continuation — no
   * turn runs while the old process is waited out — or a Guarded question
   * still open, which a relaunch would have no record of. Not whether the
   * process is alive: the CLI is kept between turns, so a live one is most
   * often an idle one.
   */
  get holding(): Hold | null {
    if (this.busy || this.granted) return 'reply'
    return this.asked ? 'question' : null
  }

  /**
   * Whether the CLI has a transcript to resume. `--resume` against an id it has
   * never seen fails the whole turn with "No conversation found with session
   * ID", and there are two ways to arrive at a claim that is not true: a
   * session built by `configure` before its first send (changing the model on a
   * new tab did exactly that, and pinned it to --resume forever), and a tab
   * restored for a transcript that has since been deleted.
   *
   * The file on disk is the only thing that actually knows, so ask it.
   */
  private resumable(): boolean {
    return existsSync(join(sessionsDir(), `${this.sessionId}.jsonl`))
  }

  private args(grant: SafetyId | null): string[] {
    const model =
      MODELS.find((m) => m.id === this.opts.model) ?? this.opts.customModel ?? MODELS[1]
    const args = [
      '-p',
      '--input-format', 'stream-json',
      '--output-format', 'stream-json',
      '--verbose',
        this.isNew || !this.resumable() ? '--session-id' : '--resume',
      this.sessionId,
      '--model', model.cliId,
      '--effort', EFFORT_FLAG[this.opts.effort],
      '--permission-mode', PERMISSION_MODE[grant ?? this.opts.safety]
    ]
    // One comma-separated argument, which is the form the flag documents and
    // the one that cannot swallow the flags after it.
    const deny = this.opts.deny ?? []
    if (deny.length) args.push('--disallowedTools', deny.join(','))
    return args
  }

  private emitEvent(e: StreamEvent): void {
    this.emit('event', e)
  }

  /**
   * Starts the process, on the thread's own safety unless `grant` says
   * otherwise. Only `begin` passes one, for the continuation of a yes — so a
   * grant is spent by the process it was given for, and whatever happens to
   * that process, the next one starts without it.
   */
  spawn(grant: SafetyId | null = null): void {
    if (this.child) return
    const argv = this.args(grant)
    // A packaged app gets Finder's PATH, which has no package manager's bin
    // directory on it. See which.ts — this is the difference between the app
    // working from a terminal and working from the Dock.
    const claude = resolveClaude()
    // LANES_DEBUG_CLI prints the argv, which is the only way to see whether a
    // setting reached the process — it found a toggle that looked wired and was not.
    if (devEnv('LANES_DEBUG_CLI')) {
      console.log('spawn', claude.bin, `(via ${claude.via})`, JSON.stringify(argv))
    }
    const child = spawn(claude.bin, argv, {
      cwd: VAULT,
      stdio: ['pipe', 'pipe', 'pipe'],
      // The CLI shells out itself, so it needs the recovered PATH too.
      env: { ...process.env, PATH: claude.path }
    })
    this.child = child
    this.live = { flags: this.processFlags(this.opts), granted: grant !== null }

    // Without this, a missing binary is an unhandled 'error' event, which takes
    // the whole main process down rather than showing anyone what went wrong.
    child.on('error', (err: NodeJS.ErrnoException) => {
      if (this.child !== child) return
      this.child = null
      // A process that never started never exits either: Node says 'error'
      // and 'close', not 'exit'. So what the exit below would settle is
      // settled here — the turn begun on it is over, and what was queued
      // behind it was written expecting an answer that is not coming. Left
      // set, the thread queued every later message for good, and a restart
      // into an update waited on a reply that did not exist.
      this.buf = ''
      this.busy = false
      this.queue = []
      this.emitEvent({
        type: 'error',
        sessionId: this.sessionId,
        message:
          err.code === 'ENOENT'
            ? `Could not find the \`claude\` command. Lanes looked on your login shell's PATH and in the usual install directories. If it lives somewhere else, set LANES_CLAUDE to its full path.`
            : `Could not start claude: ${err.message}`
      })
      this.emitEvent({ type: 'exit', sessionId: this.sessionId, code: null })
    })
    // The next spawn resumes rather than claiming the id again.
    this.isNew = false

    child.stdout.setEncoding('utf8')
    child.stdout.on('data', (chunk: string) => {
      // A process being replaced keeps talking while it drains — including a
      // final `result` — and that would land on the state its replacement
      // depends on. Once it is not the current child, it is not heard.
      if (this.child !== child) return
      this.buf += chunk
      let nl: number
      while ((nl = this.buf.indexOf('\n')) !== -1) {
        const line = this.buf.slice(0, nl)
        this.buf = this.buf.slice(nl + 1)
        if (!line.trim()) continue
        try {
          this.handle(JSON.parse(line))
        } catch {
          // The session format is internal; tolerate anything unparseable.
        }
      }
    })

    child.stderr.setEncoding('utf8')
    child.stderr.on('data', (c: string) => {
      if (this.child !== child) return
      const msg = c.trim()
      if (msg) this.emitEvent({ type: 'error', sessionId: this.sessionId, message: msg })
    })

    child.on('exit', (code) => {
      // A respawn — changing model, effort, or granting a Guarded request —
      // kills this process and starts the next one in the same tick. Without
      // this guard the dying process's exit clears the live one and the turn
      // that just started is orphaned.
      if (this.child !== child) return
      Q(`EXIT code=${code} queued=${this.queue.length}`)
      this.child = null
      this.buf = ''
      // The process died rather than finishing. Anything queued was written
      // expecting an answer that never came, so it does not get sent blind.
      this.busy = false
      this.queue = []
      this.emitEvent({ type: 'exit', sessionId: this.sessionId, code })
    })
  }

  /**
   * The flags that are baked into the process at spawn and cannot be changed
   * without a new one. Everything else in StartOptions is either read per-send
   * or bookkeeping.
   */
  private processFlags(o: StartOptions): string {
    return JSON.stringify([
      o.model,
      o.customModel?.id ?? null,
      o.effort,
      o.safety,
      (o.deny ?? []).slice().sort()
    ])
  }

  /**
   * Applies a per-chat control change; takes effect on the next message.
   *
   * Compared with what the live process was started with, not with the
   * options a moment ago. Those were overwritten first, so a change made while
   * a turn streamed was compared with itself by the next send and never
   * reached the process at all: a thread switched to Guarded mid-turn went on
   * running unasked. `begin` makes the same comparison before every message.
   */
  configure(patch: Partial<StartOptions>): void {
    this.opts = { ...this.opts, ...patch }
    // A later `fresh` is news: the session may have been created by a configure
    // call that had no opinion, before the tab it belongs to was ever sent.
    if (patch.fresh !== undefined && !this.child) this.isNew = patch.fresh
    // Only when a process-level flag actually moved, and only when no turn is
    // running on it. Every `lanes:send` routes through here, and killing on
    // each one tore down the turn that the send was trying to queue behind —
    // the process was "idle" only because its answer had not started
    // streaming yet. A change made mid-turn waits for `begin`.
    if (this.child && !this.busy && this.live.flags !== this.processFlags(this.opts)) {
      Q('configure -> kill (flags changed)')
      this.kill()
    }
  }

  /**
   * Queue a message rather than interleaving it with a turn already running.
   *
   * The composer has always said "Enter queues your next message"; it was not
   * true. A second send went straight to the CLI's stdin *and* reset this
   * session's turn state on the way past — startedAt, the draft, the tool
   * tables — so the answer still arriving was rendered against the bookkeeping
   * of the message that interrupted it.
   *
   * The queued message is shown immediately, in the order it was typed, and
   * flushed when the current turn lands. It is not re-emitted on flush.
   */
  send(text: string, quote?: { label: string; text: string }, images?: Attachment[]): void {
    this.submit(text, quote, images, null)
  }

  /** `send`, for this class: a yes's continuation carries its grant through the queue. */
  private submit(
    text: string,
    quote: { label: string; text: string } | undefined,
    images: Attachment[] | undefined,
    grant: SafetyId | null
  ): void {
    Q(`send busy=${this.busy} child=${Boolean(this.child)} draft=${Boolean(this.draft)}`)
    if (this.busy) {
      this.queue.push({ text, quote, images, ...(grant ? { grant } : {}) })
      this.emitEvent({
        type: 'message',
        sessionId: this.sessionId,
        message: this.youMessage(text, quote, Date.now(), images)
      })
      return
    }
    this.begin(text, quote, true, images, grant)
  }

  private youMessage(
    text: string,
    quote: { label: string; text: string } | undefined,
    at = Date.now(),
    images?: Attachment[]
  ): Message {
    const blocks: MessageBlock[] = []
    // Shown in the order they were sent: the images, then whatever was typed
    // under them.
    ;(images ?? []).forEach((a, i) =>
      blocks.push({ kind: 'image', id: `img-${at}-${i}`, mediaType: a.mediaType, data: a.data, name: a.name })
    )
    if (quote) blocks.push({ kind: 'quote', label: quote.label, text: quote.text })
    return { id: `u-${at}`, role: 'you', text, blocks, source: text, meta: null, timestamp: at }
  }

  /** The next queued message, if the turn that just ended left one behind. */
  private flush(): void {
    Q(`flush queued=${this.queue.length} child=${Boolean(this.child)}`)
    const next = this.queue.shift()
    if (next) this.begin(next.text, next.quote, false, next.images, next.grant ?? null)
  }

  private begin(
    text: string,
    quote: { label: string; text: string } | undefined,
    emitYou: boolean,
    images?: Attachment[],
    grant: SafetyId | null = null
  ): void {
    Q(`begin emitYou=${emitYou} child=${Boolean(this.child)}`)
    // The flags are the process's, fixed when it started. One that has moved
    // since — a safety changed while the last turn streamed — has not reached
    // it; a process that ran on a grant has spent it; and a grant needs a
    // process of its own. Any of those, and this message goes to a new one.
    if (
      this.child &&
      (grant !== null || this.live.granted || this.live.flags !== this.processFlags(this.opts))
    ) {
      Q('begin -> respawn (flags moved)')
      this.child.kill()
      this.child = null
      this.buf = ''
    }
    this.spawn(grant)
    this.busy = true
    this.startedAt = Date.now()
    this.verb = VERBS[Math.floor(Math.random() * VERBS.length)]
    this.draft = null
    this.toolsById.clear()
    this.parents.clear()

    if (emitYou) {
      this.emitEvent({
        type: 'message',
        sessionId: this.sessionId,
        message: this.youMessage(text, quote, this.startedAt, images)
      })
    }
    this.emitEvent({
      type: 'started',
      sessionId: this.sessionId,
      verb: this.verb.ing,
      at: this.startedAt
    })

    // The model needs the excerpt too, not just the reader.
    const payload = quote ? quoteWire(quote, text) : text

    // Images lead, then the text — the order the CLI's own transcripts use when
    // something is pasted into an interactive session, so a turn this app sends
    // and a turn typed at a terminal are the same shape on disk.
    const content: unknown[] = []
    for (const a of images ?? []) {
      content.push({ type: 'image', source: { type: 'base64', media_type: a.mediaType, data: a.data } })
    }
    content.push({ type: 'text', text: payload })

    this.child?.stdin.write(
      JSON.stringify({
        type: 'user',
        message: { role: 'user', content },
        parent_tool_use_id: null,
        session_id: this.sessionId
      }) + '\n'
    )
  }

  /** Only when the reader asked for it; the pattern set is broad enough to bite. */
  private mask(text: string): string {
    return this.opts.redact === false ? text : redactSecrets(text)
  }

  /**
   * Ends the current process and waits for it to go. Closing stdin first lets
   * `claude -p` finish on its own terms; the signal is the fallback for one
   * that will not. Awaiting matters: the replacement resumes the same session
   * id, and starting it while the old process still holds that session leaves
   * the new one with nothing to say.
   */
  private async restart(): Promise<void> {
    const child = this.child
    if (!child) return
    this.child = null
    this.buf = ''
    await new Promise<void>((resolve) => {
      let settled = false
      const done = (): void => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        resolve()
      }
      const timer = setTimeout(() => {
        child.kill()
        setTimeout(done, 300)
      }, 1500)
      child.once('exit', done)
      child.stdin.end()
    })
  }

  /**
   * The other half of Guarded. The CLI denied the call and ended the turn, so
   * the app asked instead; this carries the answer back. Approving re-runs with
   * the permission the yes implied — `acceptEdits` for a file, bypass for a
   * shell or network call — for that one continuation only.
   *
   * All that is read off the answer is which question it is to. What was
   * asked, and so how wide the yes is, comes from main's own record of the
   * refusal it emitted: the page once sent `shell` back and was believed, so
   * a yes to a file edit could come back as a free hand. An answer to a
   * question main did not ask, or has had its answer to, grants nothing.
   */
  async answer(request: { id?: unknown }, approved: boolean): Promise<void> {
    const asked = this.asked
    if (!asked || request?.id !== asked.id) {
      this.emitEvent({
        type: 'error',
        sessionId: this.sessionId,
        message: 'That question is no longer open, so nothing was approved.'
      })
      // The pane shows a turn starting on a yes. None is, so say it is over —
      // unless one is running, which will say so itself when it lands.
      if (!this.busy) this.emitEvent({ type: 'done', sessionId: this.sessionId, durationMs: 0, meta: '' })
      return
    }
    this.asked = null
    if (!approved) {
      this.send(`No — do not ${asked.tool === 'Bash' ? 'run' : 'do'} that. Carry on without it.`)
      return
    }
    const grant: { mode: SafetyId } = { mode: asked.shell ? 'autonomous' : 'standard' }
    this.granted = grant
    // Permission mode is a process-level flag, so the grant needs a new
    // process — and the old one is waited out, not killed, only when it is
    // idle. A turn still running keeps going, and the continuation queues
    // behind it with its grant.
    if (!this.busy) await this.restart()
    // Stopped in the meantime: the yes went with the turn it was given in.
    if (this.granted !== grant) return
    this.granted = null
    this.submit(`Approved. Go ahead with ${asked.tool}: ${asked.summary}`, undefined, undefined, grant.mode)
  }

  /**
   * Stop. A hard kill rather than a control message, because a killed process
   * is the one guarantee the CLI gives — and the partial answer stays in the
   * thread, marked, rather than vanishing.
   */
  interrupt(): void {
    const running = Boolean(this.child)
    // Settles the turn, the queue and any grant with it — see kill().
    this.kill()
    if (this.draft) {
      this.draft.meta = 'Stopped'
      this.push()
      this.draft = null
    }
    // kill() clears `this.child`, so the process's own exit is ignored by the
    // guard in spawn(). Say so here instead, or the pane keeps its spinner.
    if (running) {
      this.emitEvent({
        type: 'done',
        sessionId: this.sessionId,
        durationMs: Date.now() - this.startedAt,
        meta: 'Stopped'
      })
    }
  }

  /**
   * The process goes, and the turn it was running goes with it. Its own exit
   * is not heard (the guard in spawn()), so what that exit would have settled
   * is settled here: nothing is running, and whatever was queued — a yes's
   * continuation among it — was typed expecting an answer that is not coming.
   * A yes still waiting for the old process to go is dropped too. A grant
   * belongs to the turn it was given in, and it once outlived a Stop: the
   * next message ran unasked.
   */
  kill(): void {
    this.child?.kill()
    this.child = null
    this.buf = ''
    this.busy = false
    this.queue = []
    this.granted = null
  }

  /* ---------- stream handling ---------- */

  private ensureDraft(): Message {
    if (!this.draft) {
      this.draft = {
        id: `a-${this.startedAt}`,
        role: 'claude',
        text: '',
        blocks: [],
        source: '',
        meta: null,
        timestamp: Date.now()
      }
    }
    return this.draft
  }

  /** Re-emits the in-flight message so the pane redraws mid-turn. */
  private push(): void {
    if (!this.draft) return
    this.emitEvent({
      type: 'patch',
      sessionId: this.sessionId,
      messageId: this.draft.id,
      message: structuredClone(this.draft)
    })
  }

  private handle(ev: Record<string, any>): void {
    switch (ev.type) {
      case 'assistant': {
        // A turn that failed before the model spoke comes back as an
        // assistant line too. It is a fault, and goes where faults go — where
        // a lapsed login reads as one and raises the sign-in note.
        const fault = apiErrorIn(ev)
        if (fault) {
          this.emitEvent({ type: 'error', sessionId: this.sessionId, message: fault })
          break
        }
        const draft = this.ensureDraft()
        const parentId: string | null = ev.parent_tool_use_id ?? null
        for (const b of ev.message?.content ?? []) {
          if (b.type === 'text' && b.text?.trim()) {
            if (parentId) continue // subagent prose stays inside its tool row
            /*
             * Kept as it arrived, the way a transcript re-read builds it. This
             * is EVERYTHING the message said, in order, with the tool rows left
             * out — `text` below is only the lead paragraph, and only when it
             * leads, so a turn that opened with a tool call had no prose on it
             * at all. Copying such a message copied nothing, and the namer,
             * which reads what was said, never had anything to name.
             */
            draft.source = draft.source ? `${draft.source}\n\n${b.text}` : b.text
            const parsed = parseBlocks(b.text, `${draft.id}-${draft.blocks.length}`)
            // The lead paragraph becomes the message's own text, but only while
            // nothing else has landed — otherwise prose that follows a tool call
            // would jump above the row that produced it.
            if (!draft.text && !draft.blocks.length && parsed[0]?.kind === 'text') {
              draft.text = (parsed.shift() as { text: string }).text
            }
            draft.blocks.push(...parsed)
          }
          if (b.type === 'tool_use') {
            const tool: ToolBlock = {
              kind: 'tool',
              id: b.id,
              name: shortName(b.name),
              cmd: this.mask(summarise(b.name, b.input ?? {})),
              out: '',
              running: true,
              children: []
            }
            this.toolsById.set(b.id, tool)
            const parent = parentId ? this.parents.get(parentId) : undefined
            if (parent) parent.children.push({ name: tool.name, cmd: tool.cmd })
            else {
              draft.blocks.push(tool)
              if (b.name === 'Task' || b.name === 'Agent') this.parents.set(b.id, tool)
            }
          }
        }
        // The thread's context is its own calls'. A subagent's are another
        // conversation, with a window and a model of their own.
        if (ev.message?.usage && !parentId) this.reportContext(ev.message.usage, ev.message.model)
        this.push()
        break
      }

      case 'user': {
        for (const b of ev.message?.content ?? []) {
          if (b.type !== 'tool_result') continue
          const tool = this.toolsById.get(b.tool_use_id)
          if (!tool) continue
          tool.running = false
          tool.isError = Boolean(b.is_error)
          const out = this.mask(textOf(b.content).trim())
          tool.out = out.length > 4000 ? out.slice(0, 4000) + '\n…' : out
        }
        this.push()
        break
      }

      // Guarded: the CLI refused the call rather than asking, because headless
      // mode has nowhere to ask. Turn the refusal back into the question.
      case 'system': {
        if (ev.subtype !== 'permission_denied') break
        const tool = shortName(String(ev.tool_name ?? 'a tool'))
        const proposed = this.toolsById.get(String(ev.tool_use_id))
        // Kept, so the answer is checked against what was asked rather than
        // against what comes back. A newer refusal replaces it, as it
        // replaces the question on screen.
        const asked: Asked = {
          id: randomUUID(),
          sessionId: this.sessionId,
          tool,
          summary: proposed?.cmd || String(ev.message ?? '').replace(/,? but you haven.t granted it yet\.?$/, ''),
          shell: !FILE_TOOLS.has(tool)
        }
        this.asked = asked
        this.emitEvent({ type: 'permission', sessionId: this.sessionId, request: { ...asked } })
        break
      }

      case 'result': {
        this.readWindow(ev.modelUsage)
        const secs = Math.max(1, Math.round((ev.duration_ms ?? Date.now() - this.startedAt) / 1000))
        const meta = `${this.verb.past} for ${secs}s`
        if (this.draft) {
          this.draft.meta = meta
          this.push()
        }
        this.draft = null
        // A grant lasts exactly one continuation. The permission mode is a
        // process-level flag, so dropping it means the process goes too.
        if (this.live.granted) void this.restart()
        this.emitEvent({
          type: 'done',
          sessionId: this.sessionId,
          durationMs: ev.duration_ms ?? 0,
          meta
        })
        this.busy = false
        this.flush()
        break
      }

      /*
       * How much of the usage windows this turn left — both of them, and when
       * each resets. It was dropped here for as long as the app has existed,
       * while the top bar asked to be told by hand when the window ends.
       */
      case 'rate_limit_event': {
        const usage = readUsage(ev.rate_limit_info)
        if (usage) this.emitEvent({ type: 'usage', sessionId: this.sessionId, usage })
        break
      }

      default:
        break
    }
  }

  /** Real token accounting, not an estimate from characters. */
  private reportContext(usage: Record<string, number>, model?: string): void {
    const used =
      (usage.input_tokens ?? 0) +
      (usage.cache_creation_input_tokens ?? 0) +
      (usage.cache_read_input_tokens ?? 0)
    if (!used) return
    this.lastContext = { used, model: model && model !== '<synthetic>' ? model : null }
    // Same ladder as `args()`: the built-in table, then the model added in
    // Settings, then the default. Without the middle rung a custom model's
    // meter was drawn against Sonnet's window whatever window it was given.
    // What the CLI has said for the model that answered comes first.
    const configured =
      MODELS.find((m) => m.id === this.opts.model) ?? this.opts.customModel ?? MODELS[1]
    const context: ContextUsage = {
      used,
      window: windowFor(this.lastContext.model, used, windows(), configured.window)
    }
    this.emitEvent({ type: 'context', sessionId: this.sessionId, context })
  }

  /**
   * The window the CLI says, at the end of the turn, for the model that
   * answered — kept for the next time, and the meter redrawn against it. The
   * entry is the answering model's, or else the one that took the most: a
   * turn also lists the small model that names threads.
   */
  private readWindow(modelUsage: Record<string, Record<string, number>> | undefined): void {
    if (!modelUsage || typeof modelUsage !== 'object') return
    const last = this.lastContext
    const sent = (u: Record<string, number>): number =>
      (u.inputTokens ?? 0) + (u.cacheReadInputTokens ?? 0) + (u.cacheCreationInputTokens ?? 0)
    const key =
      last?.model && modelUsage[last.model]
        ? last.model
        : Object.keys(modelUsage).sort((a, b) => sent(modelUsage[b]) - sent(modelUsage[a]))[0]
    const window = key ? modelUsage[key]?.contextWindow : undefined
    if (!key || !(typeof window === 'number' && window > 0)) return
    learnWindow([key, ...(last?.model ? [last.model] : [])], window)
    if (last && (!last.model || last.model === key)) {
      this.emitEvent({
        type: 'context',
        sessionId: this.sessionId,
        context: { used: last.used, window: Math.max(window, last.used) }
      })
    }
  }
}

export type { MessageBlock }
