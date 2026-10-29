import { randomUUID } from 'node:crypto'
import { readdirSync, statSync } from 'node:fs'
import { readFile, stat, writeFile } from 'node:fs/promises'
import { isAbsolute, join, relative } from 'node:path'
import { apiErrorIn } from '../shared/apiError'
import { parseBlocks } from '../shared/blocks'
import { pathwaySplits } from '../shared/pathways'
import { typedCommand } from '../shared/command'
import { unquote } from '../shared/quote'
import { windowFor } from '../shared/contextWindow'
import { sessionsDir, VAULT } from './config'
import { TOOL_WEIGHT } from './lanes'
import type {
  ForkCut,
  ForkExpect,
  ImageBlock,
  Message,
  Pathways,
  Seam,
  SessionSnapshot,
  ThreadRecord,
  Touch,
  TouchKind,
  ToolBlock
} from '../shared/types'

/**
 * Reads Claude Code's own session transcripts. The format is internal, so
 * every access is defensive: unknown line types are ignored, malformed lines
 * are skipped, and a file that yields nothing simply does not become a thread.
 *
 * Nothing here caches or ranks: this module turns a file into a record, and
 * `threadIndex.ts` decides when to ask and what the records mean together.
 */

/** How strong a claim a thread has on a path. Bigger wins when both apply. */
export const TOUCH = { mention: 1, shell: 2, read: 3, edit: 4, write: 5 } as const

const TOUCH_KIND: Record<string, TouchKind> = {
  Write: TOUCH.write,
  Edit: TOUCH.edit,
  NotebookEdit: TOUCH.edit,
  Read: TOUCH.read,
  Glob: TOUCH.shell,
  Grep: TOUCH.shell
}

/**
 * Kept per thread. Twelve was enough to guess a lane; relatedness needs the
 * long tail, because the paths two threads share are rarely either one's
 * favourites.
 */
const TOUCH_CAP = 40
const MENTION_CAP = 24

interface Line {
  type?: string
  isSidechain?: boolean
  /** The CLI injected this line; the reader neither wrote it nor saw it. */
  isMeta?: boolean
  timestamp?: string
  message?: { role?: string; content?: unknown; usage?: Record<string, number>; model?: string }
  customTitle?: string
  aiTitle?: string
  [k: string]: unknown
}

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

function summarise(name: string, input: Record<string, unknown>): string {
  const path = (v: unknown): string => (typeof v === 'string' ? relative(VAULT, v) || v : '')
  if (name === 'Bash') return trimCd(String(input.command ?? ''))
  if (name === 'Read' || name === 'Write' || name === 'Edit') return path(input.file_path)
  if (name === 'Grep' || name === 'Glob') return String(input.pattern ?? '')
  if (name === 'Task' || name === 'Agent') return String(input.description ?? '')
  const first =
    input.query ?? input.description ?? input.prompt ?? input.name ?? input.path ?? input.url
  if (typeof first === 'string' && first) return first
  const s = JSON.stringify(input ?? {})
  return s.length > 160 ? s.slice(0, 160) + '…' : s
}

/** The supported four; anything else is not something the model can be shown. */
const IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp'])

/**
 * Images out of a content array. Base64 goes straight through to the renderer
 * — the CLI stores it inline and so does this, which costs a few hundred KB per
 * image against re-reading the transcript to fetch one on demand.
 */
function imagesOf(content: unknown, idPrefix: string): ImageBlock[] {
  if (!Array.isArray(content)) return []
  const out: ImageBlock[] = []
  for (const b of content as any[]) {
    if (b?.type !== 'image') continue
    const src = b.source
    if (src?.type !== 'base64' || typeof src.data !== 'string') continue
    const mediaType = IMAGE_TYPES.has(src.media_type) ? src.media_type : 'image/png'
    out.push({
      kind: 'image',
      id: `${idPrefix}-img-${out.length}`,
      mediaType,
      data: src.data,
      name: `image ${out.length + 1}`
    })
  }
  return out
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
 * Index-aligned with the blank-stripped lines it is given. A line that will not
 * parse becomes an empty record rather than a gap, so a message's `line` always
 * indexes the same array a fork slices — dropping bad lines here would shift
 * every index after one, and the cut would land in the wrong turn.
 */
function readLinesFrom(lines: string[]): Line[] {
  return lines.map((line) => {
    try {
      return JSON.parse(line) as Line
    } catch {
      // tolerate a truncated or half-written line
      return {} as Line
    }
  })
}

async function readLines(file: string): Promise<Line[]> {
  const raw = await readFile(file, 'utf8')
  return readLinesFrom(raw.split('\n').filter((l) => l.trim()))
}

/**
 * The slash commands in a transcript that were TURNS, by line, with what was
 * typed. The CLI files every command in tags that open with `<` (see
 * `typedCommand`), and they are not all alike: `/morning` goes to the model
 * and is answered, while `/model` is a setting changed at the terminal and is
 * answered by the CLI's own `<local-command-stdout>`, never by the model.
 * Shown as a turn, that one would leave a thread that ended on it reading as
 * waiting on you — so a command is a turn when the model answers it, or when
 * nothing has come back for it yet: the last thing in the file, in flight.
 */
function commandTurns(lines: Line[]): Map<number, string> {
  const out = new Map<number, string>()
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i]
    if (l.isSidechain || l.isMeta || l.type !== 'user' || l.message?.role !== 'user') continue
    const typed = typedCommand(textOf(l.message.content).trim())
    if (!typed) continue
    let turn = true
    for (let j = i + 1; j < lines.length; j++) {
      const n = lines[j]
      if (n.isSidechain) continue
      if (n.type === 'assistant' && n.message?.role === 'assistant') break
      if (n.type !== 'user' || n.message?.role !== 'user' || n.isMeta) continue
      const t = textOf(n.message.content).trim()
      // Answered by the CLI rather than the model: a setting, not a turn.
      if (/^<local-command-(stdout|stderr)>/.test(t)) {
        turn = false
        break
      }
      // The CLI's own lines are passed over; anything else is somebody
      // speaking before the model did, so it was never answered.
      if (!t || t.startsWith('<')) continue
      turn = false
      break
    }
    if (turn) out.set(i, typed)
  }
  return out
}

function buildMessages(lines: Line[]): Message[] {
  const messages: Message[] = []
  const tools = new Map<string, ToolBlock>()
  const commands = commandTurns(lines)
  let draft: Message | null = null

  const flush = (): void => {
    if (draft && (draft.text || draft.blocks.length)) messages.push(draft)
    draft = null
  }

  for (let idx = 0; idx < lines.length; idx++) {
    const l = lines[idx]
    if (l.isSidechain) continue
    const at = l.timestamp ? Date.parse(l.timestamp) : Date.now()

    if (l.type === 'user' && l.message?.role === 'user') {
      const content = l.message.content
      const results = Array.isArray(content)
        ? content.filter((b: any) => b?.type === 'tool_result')
        : []
      if (results.length) {
        for (const r of results as any[]) {
          const tool = tools.get(r.tool_use_id)
          if (!tool) continue
          tool.running = false
          tool.isError = Boolean(r.is_error)
          const out = textOf(r.content).trim()
          tool.out = out.length > 4000 ? out.slice(0, 4000) + '\n…' : out
        }
        continue
      }
      const text = textOf(content).trim()
      // Images ride in the same content array, ahead of the text — this is how
      // the CLI records a turn that had one pasted into it, and how this app
      // sends one. Reading only the text meant every image in the history was
      // dropped without trace.
      const shots = imagesOf(content, `u-${messages.length}`)
      /*
       * A turn is what the READER said. `isMeta` marks a line the CLI injected
       * — a hook's feedback, a skill's base directory, "continue from where you
       * left off" — and a line opening with `<` is machinery of the same kind.
       * Neither is shown, and neither ends Claude's turn: the live stream runs
       * one answer straight through them and only starts another when you send
       * something, so this has to as well. Measured across the Lanes-written
       * transcripts of a vault in daily use, this rule agrees with what was
       * actually on screen in every one of them; ending the turn at these lines
       * instead disagreed in a couple of dozen, by a few turns each — and that
       * disagreement IS the index a fork is cut by.
       *
       * Except a slash command, which the CLI files in tags of its own and
       * which opens with `<` for that reason alone: `/morning` is what the
       * reader typed, and the live stream shows it as their turn.
       */
      const typed = commands.get(idx)
      if (l.isMeta || ((!text || (text.startsWith('<') && !typed)) && !shots.length)) continue
      const { said, quote } = typed ? { said: typed, quote: undefined } : unquote(text)
      flush()
      messages.push({
        id: `u-${messages.length}`,
        role: 'you',
        text: said,
        // Images lead, then the quote — the order `youMessage` builds live, so
        // the turn is laid out the same whether it just arrived or was reopened.
        blocks: quote ? [...shots, quote] : shots,
        source: said,
        line: idx,
        meta: null,
        timestamp: at
      })
      continue
    }

    if (l.type === 'assistant' && l.message?.role === 'assistant') {
      // A failed request the CLI wrote down in the model's voice. Not
      // something the model said, so not a message in the thread.
      if (apiErrorIn(l)) continue
      if (!draft) {
        draft = {
          id: `a-${messages.length}`,
          role: 'claude',
          text: '',
          blocks: [],
          source: '',
          line: idx,
          meta: null,
          timestamp: at
        }
      }
      const d: Message = draft
      for (const b of (l.message.content as any[]) ?? []) {
        if (b?.type === 'text' && b.text?.trim()) {
          // Kept as it arrived. parseBlocks is lossy by design — it joins
          // wrapped lines and drops list markers — so copying a message has to
          // read the markdown rather than try to rebuild it from the blocks.
          d.source = d.source ? `${d.source}\n\n${b.text}` : b.text
          const parsed = parseBlocks(b.text, `${d.id}-${d.blocks.length}`)
          if (!d.text && !d.blocks.length && parsed[0]?.kind === 'text') {
            d.text = (parsed.shift() as { text: string }).text
          }
          d.blocks.push(...parsed)
        }
        if (b?.type === 'tool_use') {
          const tool: ToolBlock = {
            kind: 'tool',
            id: b.id,
            name: shortName(b.name),
            cmd: summarise(b.name, b.input ?? {}),
            out: '',
            running: false,
            children: []
          }
          tools.set(b.id, tool)
          d.blocks.push(tool)
        }
      }
    }
  }
  flush()
  return messages
}

/**
 * WHAT WAS SAID IN A TRANSCRIPT, as one string — both sides, in order, nothing
 * else. This is what ⌘K searches a thread's text with.
 *
 * It lives HERE, beside `buildMessages`, and applies the same turn rule: a
 * sidechain is not the conversation, a `tool_result` is not a turn, and a line
 * the CLI injected — `isMeta`, or one opening with `<` — was neither written
 * nor read by anybody. A search that ignored that would find phrases nobody can
 * see when they open the thread, which is worse than not finding them.
 *
 * It does NOT go through `buildMessages`. That builds blocks, parses markdown
 * and carries every pasted image's base64 along with it; a session directory
 * in daily use is a few hundred MB of jsonl and about 1% of it is anything
 * anyone said. The
 * cheap pass is the difference between an index that can exist and one that
 * cannot.
 */
export function saidIn(lines: Line[]): string {
  const out: string[] = []
  const commands = commandTurns(lines)
  for (let idx = 0; idx < lines.length; idx++) {
    const l = lines[idx]
    if (l.isSidechain) continue
    if (l.type === 'user' && l.message?.role === 'user') {
      const content = l.message.content
      if (Array.isArray(content) && content.some((b: any) => b?.type === 'tool_result')) continue
      if (l.isMeta) continue
      const text = textOf(content).trim()
      // A slash command is said, in the CLI's tags; see `commandTurns`.
      const typed = commands.get(idx)
      if (!text || (text.startsWith('<') && !typed)) continue
      out.push(typed ?? unquote(text).said)
      continue
    }
    if (l.type === 'assistant' && l.message?.role === 'assistant') {
      if (apiErrorIn(l)) continue
      for (const b of (l.message.content as any[]) ?? []) {
        if (b?.type === 'text' && typeof b.text === 'string' && b.text.trim()) out.push(b.text)
      }
    }
  }
  return out.join('\n')
}

/** The same, read off disk. */
export async function saidInFile(file: string): Promise<string> {
  return saidIn(await readLines(file))
}

/**
 * What the transcript calls itself, and whether that is a NAME or a stand-in.
 *
 * `custom-title` is a rename made in the CLI and `ai-title` is the name the CLI
 * chose for the thread itself; either is the thread's own. Everything else is
 * the opening prompt cut at sixty characters, which is a sentence rather than a
 * name — that is the case the app's own namer exists to improve on, and it can
 * only tell the two apart if the record says which one this is.
 */
function titleOf(lines: Line[], fallback: string): { title: string; named: boolean } {
  let custom: string | undefined
  let ai: string | undefined
  let firstPrompt: string | undefined
  const commands = commandTurns(lines)
  for (let idx = 0; idx < lines.length; idx++) {
    const l = lines[idx]
    if (l.type === 'custom-title' && l.customTitle) custom = l.customTitle
    if (l.type === 'ai-title' && l.aiTitle) ai = l.aiTitle
    if (!firstPrompt && l.type === 'user' && l.message?.role === 'user' && !l.isSidechain && !l.isMeta) {
      const t = textOf(l.message.content).trim()
      const typed = commands.get(idx)
      // The scaffolding first, or a thread opened by quoting a note is called
      // `From the note "…":` — the wrapper's words rather than any of its own.
      if (t && (typed || !t.startsWith('<')))
        firstPrompt = (typed ?? unquote(t).said).split('\n')[0].slice(0, 60)
    }
  }
  const own = custom || ai
  return { title: own || firstPrompt || fallback, named: Boolean(own) }
}


/** A pattern that matches nothing: what a vault with no folders answers. */
const NEVER = '(?!)'

/**
 * WHICH PATHS IN A SHELL COMMAND ARE THE VAULT'S: those under one of its own
 * top-level folders. A command names files relative to the session's cwd,
 * which is the vault, so `cat 'projects/garden/beds.md'` is a vault file and
 * `cat notes.txt` is anybody's guess — a first folder the vault really has is
 * the evidence. This used to be a list of one vault's folders, written here,
 * and in any other vault no command touched anything.
 *
 * The folders as they are on disk, hidden ones aside (`.claude`, `.git`,
 * `.obsidian` hold no notes), each escaped — a folder may be called `c++` or
 * `Notes (old)` — longest first, and a space may be written `\ ` in a command.
 * A vault with none gets a pattern that matches nothing at all. Read again on
 * every pass of the index (`refreshVaultRoots`), so a folder made today counts
 * today. A folder that is a link to one elsewhere counts too: a command names
 * it the same way.
 */
export function vaultRootsPattern(vault = VAULT): string {
  const folderAt = (name: string): boolean => {
    try {
      return statSync(join(vault, name)).isDirectory()
    } catch {
      return false
    }
  }
  let names: string[] = []
  try {
    names = readdirSync(vault, { withFileTypes: true })
      .filter((e) => !e.name.startsWith('.') && e.name !== 'node_modules')
      .filter((e) => e.isDirectory() || (e.isSymbolicLink() && folderAt(e.name)))
      .map((e) => e.name)
  } catch {
    // a vault that cannot be listed has no folders a command could name
  }
  if (!names.length) return NEVER
  return names
    .sort((a, b) => b.length - a.length || a.localeCompare(b))
    .map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/ /g, '(?:\\\\ | )'))
    .join('|')
}

/** The pattern the index's current pass reads commands with; see `vaultRootsPattern`. */
let roots: string | null = null

/** Reads the vault's folders again, for a new pass of the index, and says what it found. */
export function refreshVaultRoots(): string {
  roots = vaultRootsPattern()
  return roots
}

/**
 * Commands that read the file they name. Measured against the transcripts of
 * a vault in daily use, where shell work is overwhelmingly reading: ls, grep,
 * cat, sed -n, head and pdftotext account for most of it, and a redirect into
 * the vault is a handful in thousands of path mentions.
 */
const READS = new Set([
  'cat', 'head', 'tail', 'less', 'more', 'wc', 'grep', 'rg', 'awk', 'jq', 'diff',
  'shasum', 'md5', 'pdftotext', 'textutil', 'open', 'stat', 'file'
])

/** Commands that change it. Rare here, but a write must not read as a glance. */
const WRITES = new Set(['tee', 'cp', 'mv', 'patch', 'touch', 'rm', 'mkdir', 'pandoc'])

/** `ls`, `find` and `cd` name a folder they are about to look in — no claim on its files. */

/**
 * Vault paths named inside a shell command, with what the command did to them.
 * Much of a thread's real work happens through Bash — grep, sed,
 * pdftotext — rather than the Read and Edit tools, so a backfill that only
 * reads tool inputs sees almost nothing; and one that reads them without
 * looking at the verb cannot tell a file the thread studied from a folder it
 * listed on the way past.
 */
function commandTouches(cmd: string): Touch[] {
  const stripped = VAULT ? cmd.split(VAULT).join('') : cmd
  // A path runs to the first character a shell would end it at — except an
  // escaped space, which is part of it.
  const re = new RegExp(`(?:^|[\\s"'\`/=(])((?:${roots ?? refreshVaultRoots()})/(?:\\\\ |[^\\s"'\`|;)&<>])*)`, 'g')
  const out = new Map<string, TouchKind>()

  for (const seg of stripped.split(/&&|\|\||[|;\n]/)) {
    // Skip past any leading VAR=value assignments to the command itself.
    const head = /^\s*(?:\w+=\S+\s+)*([\w./-]+)/.exec(seg)?.[1] ?? ''
    const verb = head.split('/').pop() ?? ''
    const rewrites = WRITES.has(verb) || /\bsed\b[^|]*\s-i\b/.test(seg)
    const reads = READS.has(verb)

    let m: RegExpExecArray | null
    re.lastIndex = 0
    while ((m = re.exec(seg)) !== null) {
      const path = m[1].replace(/\\ /g, ' ').replace(/[.,:]+$/, '')
      // A glob names a set, not a file, and `dash-actions*` would sit in the
      // index as a separate thing from the files it stands for. A folder named
      // on its own — `ls a/` — is kept: weighing drops it as furniture, but it
      // is what the command touched.
      if (/[*?[\]{}]/.test(path)) continue
      // `> path` and `>> path` are a write whatever the verb was.
      const redirected = />>?\s*$/.test(seg.slice(0, m.index + 1))
      const kind: TouchKind = redirected || rewrites ? TOUCH.edit : reads ? TOUCH.read : TOUCH.shell
      const prev = out.get(path)
      if (prev === undefined || kind > prev) out.set(path, kind)
    }
  }
  return [...out.entries()].map(([path, kind]) => ({ path, kind, weight: SHELL_WEIGHT[kind] }))
}

/** A shell verb is inferred, so it claims a little less than the matching tool call. */
const SHELL_WEIGHT: Record<TouchKind, number> = {
  [TOUCH.write]: 3,
  [TOUCH.edit]: 3,
  [TOUCH.read]: 2,
  [TOUCH.shell]: 1,
  [TOUCH.mention]: 1
}

/**
 * Prose `[[wikilink]]`s — what the thread *talked about*, as opposed to what it
 * opened. A weak supplement on purpose: transcripts are full of wikilinks that
 * came back inside tool output, so only text the two of you actually wrote
 * counts, and only targets that resolve to a real note survive the index build.
 */
function mentionsIn(lines: Line[]): Map<string, number> {
  const out = new Map<string, number>()
  const re = /\[\[([^\]|#\n]{1,90})(?:[#|][^\]\n]*)?\]\]/g
  for (const l of lines) {
    if (l.isSidechain) continue
    const content = l.message?.content
    let prose = ''
    if (typeof content === 'string') prose = content
    else if (Array.isArray(content)) {
      // Only `text` blocks: a tool_result carries the note's own links, not this
      // thread's mention of it.
      for (const b of content as any[]) {
        if (b?.type === 'text' && typeof b.text === 'string') prose += `${b.text}\n`
      }
    }
    if (!prose.includes('[[')) continue
    let m: RegExpExecArray | null
    re.lastIndex = 0
    while ((m = re.exec(prose)) !== null) {
      const target = m[1].trim().replace(/\\+$/, '')
      if (target.length < 2) continue
      out.set(target, (out.get(target) ?? 0) + 1)
    }
  }
  return out
}

function touchedPaths(lines: Line[]): Touch[] {
  const score = new Map<string, { weight: number; kind: TouchKind }>()
  const add = (rel: string, weight: number, kind: TouchKind): void => {
    if (!rel || rel.startsWith('..')) return
    const prev = score.get(rel)
    if (prev) {
      prev.weight += weight
      if (kind > prev.kind) prev.kind = kind
    } else {
      score.set(rel, { weight, kind })
    }
  }

  for (const l of lines) {
    const content = l.message?.content
    if (!Array.isArray(content)) continue
    for (const b of content as any[]) {
      if (b?.type !== 'tool_use') continue

      if (b.name === 'Bash' && typeof b.input?.command === 'string') {
        for (const t of commandTouches(b.input.command)) add(t.path, t.weight, t.kind)
        continue
      }

      const weight = TOOL_WEIGHT[b.name]
      if (!weight) continue
      const raw = b.input?.file_path ?? b.input?.notebook_path ?? b.input?.path
      if (typeof raw !== 'string' || !raw) continue
      // Tool inputs are usually absolute, but roughly one in six is written
      // relative to the session's cwd — which is the vault — and running those
      // through `relative()` would resolve them against this process's cwd and
      // throw away a real touch.
      add(isAbsolute(raw) ? relative(VAULT, raw) : raw, weight, TOUCH_KIND[b.name] ?? TOUCH.shell)
    }
  }
  return [...score.entries()]
    .map(([path, { weight, kind }]) => ({ path, weight, kind }))
    .sort((a, b) => b.weight - a.weight)
}

/**
 * One transcript, distilled to what the index keeps. Everything here is stable
 * for a given file — anything relative to *now* (the sidebar's state line) is
 * derived at read time instead, so a cached record never goes stale.
 *
 * A file that yields no messages still comes back as a record, with a count of
 * zero: it is not a thread, but remembering that it is not one is what stops
 * every launch from re-reading it.
 */
/**
 * When anything last happened in the thread: the newest timestamp on a line of
 * its own, not the file's mtime. The desktop app rewrites the transcripts of
 * the sessions it hosts — a remote one, started from a phone, is one of them —
 * appending a `cost-state` line with no timestamp, in batches, long after the
 * last turn. Sorted by mtime, twenty threads from last week jumped to "just
 * now" in the same second and pushed the ones actually in use out of the
 * recents. The mtime only stands in when no line says.
 */
function lastActivity(lines: Line[], mtimeMs: number): number {
  let last = 0
  for (const l of lines) {
    if (l.isSidechain || !l.timestamp) continue
    const at = Date.parse(l.timestamp)
    if (at > last) last = at
  }
  return last || mtimeMs
}

export async function distill(
  id: string,
  file: string,
  mtimeMs: number,
  size: number
): Promise<ThreadRecord> {
  const lines = await readLines(file)
  const messages = buildMessages(lines)
  const empty = { id, mtimeMs, size, lastAt: mtimeMs, title: '', named: false, started: 0, messageCount: 0, lastRole: 'claude' as const, touches: [], mentions: [] }
  if (!messages.length) return empty
  const paths = touchedPaths(lines)
  const { title, named } = titleOf(lines, 'Untitled thread')
  return {
    id,
    mtimeMs,
    size,
    lastAt: lastActivity(lines, mtimeMs),
    title,
    named,
    started: messages[0].timestamp,
    messageCount: messages.length,
    /** Whose turn it ended on — "left mid-thought" when it was yours. */
    lastRole: messages[messages.length - 1].role,
    touches: paths.slice(0, TOUCH_CAP),
    mentions: [...mentionsIn(lines).entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, MENTION_CAP)
      .map(([target, count]) => ({ target, count }))
  }
}

/* ---------- pathways: where a transcript parts from its kin ---------- */

/** Long enough to tell two paths apart, short enough to sit on a hairline. */
const LABEL_CHARS = 28

/** What a path is called when nobody has named it: the words it opens with. */
function openingWords(m: Message | undefined): string {
  if (!m) return ''
  const line = m.text.split('\n').find((l) => l.trim())?.trim()
  if (!line) return m.blocks.some((b) => b.kind === 'image') ? 'an image' : ''
  return line.length > LABEL_CHARS ? `${line.slice(0, LABEL_CHARS - 1).trimEnd()}…` : line
}

/**
 * A path's opening words, keyed by the file and the line it begins after, and
 * held against that file's mtime. A family is a handful of transcripts and only
 * the ones on a seam are read, but a transcript is not small and a seam is
 * drawn on every hydrate — so the second look at an unchanged file is free.
 */
const labelCache = new Map<string, { mtimeMs: number; label: string }>()

async function pathLabel(id: string, fromLine: number): Promise<string> {
  const key = `${id}:${fromLine}`
  try {
    const file = join(sessionsDir(), `${id}.jsonl`)
    const st = await stat(file)
    const have = labelCache.get(key)
    if (have && have.mtimeMs === st.mtimeMs) return have.label
    const messages = buildMessages(await readLines(file))
    const label = openingWords(messages.find((m) => (m.line ?? 0) >= fromLine))
    labelCache.set(key, { mtimeMs: st.mtimeMs, label })
    return label
  } catch {
    return ''
  }
}

/**
 * The seams to draw down this transcript: one per point where the family's
 * paths part, given as MESSAGE positions rather than line numbers, so the
 * renderer never has to map a stored anchor onto a turn itself.
 *
 * Every seam is checked before it is drawn. The line count that locates it is
 * only true while the transcript is what it was — the CLI appends and never
 * rewrites, so it holds today — and the uuid recorded beside it is how that
 * assumption is tested rather than trusted. A split that no longer sits behind
 * the line it was cut behind is simply not drawn: the paths stay whole and
 * separately readable, which is the one thing that must never depend on this.
 */
async function seamsIn(
  id: string,
  lines: Line[],
  messages: Message[],
  pathways: Pathways,
  labels: Record<string, string>
): Promise<Seam[]> {
  const splits = pathwaySplits(pathways, id)
  if (!splits.length) return []

  // The same walk `forkThread` used to record it: the last line of the prefix
  // that has an id of its own, since metadata lines carry none.
  const anchorOf = (upTo: number): string => {
    for (let i = Math.min(upTo, lines.length) - 1; i >= 0; i -= 1) {
      const u = lines[i]?.uuid
      if (typeof u === 'string') return u
    }
    return ''
  }

  const out: Seam[] = []
  for (const s of splits) {
    if (s.at < 1 || s.at > lines.length) continue
    const want = pathways[s.via]?.forkUuid
    if (want && anchorOf(s.at) !== want) continue
    const at = messages.findIndex((m) => (m.line ?? 0) >= s.at)
    /*
     * The path being read is listed too, first and marked. `pathwaySplits`
     * leaves it out — correctly, since it answers "what diverges from me" — so
     * it is put back here, where the question is "what leaves this seam", and
     * the answer to that includes the road you are standing on.
     */
    const paths = await Promise.all(
      [id, ...s.others].map(async (other) => {
        const said = labels[other] || (await pathLabel(other, s.at))
        return { id: other, label: said || 'unwritten', active: other === id, unwritten: !said }
      })
    )
    /*
     * NO TWO PATHS ON ONE SEAM MAY READ THE SAME.
     *
     * Two paths open with the same words more often than not — asking the same
     * question twice differently is most of why anyone edits one — and two
     * paths with nothing written on them yet are both "unwritten". A rule that
     * names two ways out identically is a rule you cannot navigate by, which is
     * the whole job of the thing.
     *
     * So colliding labels, and only those, are stamped: the day it was cut,
     * then the day and the time if a day is not enough, then a plain ordinal,
     * which cannot collide with anything. Uniqueness is CHECKED at each rung
     * rather than assumed — three paths cut from one question in one afternoon
     * all carry the same date, which is exactly the case the old one-rung
     * version left ambiguous.
     */
    const cut = (o: { id: string }): Date | null => {
      const rec = pathways[o.id]
      return rec ? new Date(rec.created) : null
    }
    const said = paths.map((o) => o.label)
    const distinct = (): boolean => new Set(paths.map((o) => o.label)).size === paths.length
    const rungs: ((o: { id: string }) => string)[] = [
      (o) => cut(o)?.toLocaleDateString() ?? 'first',
      (o) =>
        cut(o)?.toLocaleString([], {
          month: 'numeric',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit'
        }) ?? 'first'
    ]
    const clashes = new Map<string, number>()
    for (const l of said) clashes.set(l, (clashes.get(l) ?? 0) + 1)
    for (const rung of rungs) {
      if (distinct()) break
      // Only the ones that actually clash: a label that was already its own
      // gains nothing from a timestamp.
      paths.forEach((o, k) => {
        o.label = (clashes.get(said[k]) ?? 0) > 1 ? `${said[k]} · ${rung(o)}` : said[k]
      })
    }
    if (!distinct()) paths.forEach((o, k) => (o.label = `${said[k]} · ${k + 1}`))
    out.push({ at: at === -1 ? messages.length : at, paths })
  }
  return out
}

export async function loadThread(
  id: string,
  pathways: Pathways = {},
  labels: Record<string, string> = {},
  windows: Record<string, number> = {}
): Promise<SessionSnapshot | null> {
  const file = join(sessionsDir(), `${id}.jsonl`)
  try {
    const lines = await readLines(file)
    const messages = buildMessages(lines)
    if (!messages.length) return null

    // Context comes from the newest usage record in the transcript, measured
    // against the window of the model that made it.
    let used = 0
    let model: string | null = null
    for (const l of lines) {
      const u = l.message?.usage
      if (!u) continue
      const total =
        (u.input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0)
      if (total) {
        used = total
        const m = l.message?.model
        if (m && m !== '<synthetic>') model = m
      }
    }

    return {
      id,
      title: titleOf(lines, 'Untitled thread').title,
      started: messages[0].timestamp,
      touched: messages[messages.length - 1].timestamp,
      messages,
      context: used ? { used, window: windowFor(model, used, windows) } : null,
      seams: await seamsIn(id, lines, messages, pathways, labels)
    }
  } catch {
    return null
  }
}

/**
 * Forks a transcript into a session of its own, cut at a message.
 *
 * There is no CLI flag for this. A session *is* its `.jsonl`, and `--resume`
 * takes whatever it finds, so a fork is a truncated copy under a new id.
 * Verified end to end before it was built: a three-turn session was cut after
 * turn one, resumed, and asked what it knew — it had the first codeword and not
 * the second.
 *
 * The cut is named by *message*, not by line, and resolved here. The renderer's
 * copy of a conversation is whatever streamed into it, and a message that
 * arrived live has no line in a file it was not read from — so asking the
 * renderer for a line means the actions only work in a chat you reopened.
 * Main owns the transcript; main can count.
 *
 * `keep` decides which side of the message the cut falls on: true keeps it, for
 * a fork, and false drops it, for a re-run that wants to ask it again.
 *
 * A message boundary is the only safe place to cut. A tool call and its result
 * are two lines, an `assistant` and a `user`, and a result never begins a
 * message — so cutting where a message begins cannot orphan a tool call.
 *
 * `sessionId` is repointed on every line. The CLI resumed happily without it,
 * but this app's own index reads that field, and a transcript that disagrees
 * with its filename is a bug waiting for someone else to find.
 *
 * `expect` is what the renderer believed it was cutting at. The index it sends
 * and the file main counts can disagree, so the position is checked before it
 * is used: cutting at a message the reader did not click is the one failure
 * that would be silent afterwards, because the copy it produced would look
 * perfectly well-formed.
 */
export async function forkThread(
  id: string,
  atMessage: number,
  keep: boolean,
  expect?: ForkExpect
): Promise<ForkCut> {
  const src = join(sessionsDir(), `${id}.jsonl`)
  try {
    const raw = await readFile(src, 'utf8')
    const lines = raw.split('\n').filter((l) => l.trim())
    const messages = buildMessages(readLinesFrom(lines))

    // Past the end means the renderer is holding something the transcript has
    // not caught up with — a queued message, or a turn whose last lines are
    // still being written. The CLI appends asynchronously, so this is a real
    // race and not a hypothetical one.
    //
    // For a fork that is harmless: "everything up to here" and "everything" are
    // the same answer when here is the end. For a re-run it is not — dropping a
    // message the file does not have yet would keep it and then ask it a second
    // time, so refuse instead and let the caller try again.
    // Before anything about the position: do the two sides even agree on the
    // list it indexes? If they hold a different number of turns they are not
    // counting the same conversation, and no index means the same thing in
    // both. Reopening the thread rebuilds it through this very parser, which is
    // why the reader is told to do exactly that.
    if (expect && typeof expect.total === 'number' && expect.total !== messages.length) {
      return { ok: false, reason: 'moved' }
    }
    if (atMessage >= messages.length) {
      if (!keep) return { ok: false, reason: 'racing' }
    } else if (expect) {
      // The index still has to mean what the reader meant by it. Role is the
      // strong half — a cut is defined by which side of a turn it falls on —
      // and the opening words settle the rest. Text is only compared when both
      // sides have some: a turn that is all image or all tool call has none,
      // and its role is the whole of what there is to check.
      const m = messages[atMessage]
      const mine = m.text.slice(0, 60)
      if (m.role !== expect.role) return { ok: false, reason: 'moved' }
      if (mine && expect.preview && mine !== expect.preview) return { ok: false, reason: 'moved' }
    }

    const cutAt =
      atMessage >= messages.length
        ? undefined
        : keep
          ? messages[atMessage + 1]?.line
          : messages[atMessage].line

    const kept = cutAt === undefined ? lines : lines.slice(0, Math.max(0, cutAt))
    // Nothing answered before the cut is not a fork, it is a new chat — and the
    // caller has one of those already.
    if (!kept.some((l) => l.includes('"type":"assistant"'))) {
      return { ok: false, reason: 'nothing-answered' }
    }

    const next = randomUUID()
    let forkUuid = ''
    const out = kept.map((l) => {
      try {
        const o = JSON.parse(l) as Record<string, unknown>
        if (typeof o.sessionId === 'string') o.sessionId = next
        if (typeof o.session_id === 'string') o.session_id = next
        // The last line of the prefix that has an id of its own. Metadata lines
        // carry none, so this walks past them to the last real turn — the thing
        // the split is actually behind.
        if (typeof o.uuid === 'string') forkUuid = o.uuid
        return JSON.stringify(o)
      } catch {
        return l
      }
    })
    await writeFile(join(sessionsDir(), `${next}.jsonl`), out.join('\n') + '\n', 'utf8')
    return { ok: true, at: { id: next, sharedLines: kept.length, forkUuid } }
  } catch {
    return { ok: false, reason: 'unreadable' }
  }
}
