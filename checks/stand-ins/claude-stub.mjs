#!/usr/bin/env node
// A STAND-IN `claude`, so that no driven check ever spends a real turn.
//
// One script where the README used to have six shell stubs under /tmp/stub/.
// The runner hands it to the app as LANES_CLAUDE, through a two-line sh
// wrapper that sets STUB_MODE and execs `node checks/stand-ins/claude-stub.mjs
// "$@"`. Plain Node, no dependencies. It writes one thing, ever: `review`'s
// edit, to a note inside the vault it was started in, and only when that vault
// is a throwaway one under the temp directory — the real vault is never a test
// subject, not even by a stand-in pointed at it by mistake.
//
// What the app asks of a `claude`, and what this answers:
//
//   claude auth status           {"loggedIn":true,"authMethod":"stand-in"},
//                                in every mode but `signedout`
//   claude --version             a version line
//   claude -p <prompt> --model…  a one-shot: the namer (title.ts) or the model
//                                probe (models.ts). Answered at once
//   claude -p --input-format     a turn (cli.ts): stream-json in, stream-json
//          stream-json …         out, and what comes out is the MODE's
//
// STUB_MODE, for a turn — the six modes keep the README stubs' bytes, timings
// and exit codes exactly:
//
//   ok        (default) every user line on stdin answered "ok" and a `result`,
//             STUB_DELAY ms after it arrives (300). Stays up for the next line,
//             as the real CLI does, and goes when stdin closes
//   slow      says nothing, exits 0 after 4 s — long enough to be elsewhere
//   limit     the headless usage-limit line on stderr, reset 8,100 s out; exit 1
//   fault     mentions a limit and a reset, and is NOT one; exit 1
//   usage     answers, then a `rate_limit_event`: session 8,100 s out at
//             STUB_USED (0.17), week six days out at 2%
//   review    reads the prompt, takes the first anchored CriticMarkup comment
//             out of the note it names in backticks — anchor unwrapped, words
//             left, rewritten the way `perl -0pi` does — and answers
//   window    a turn on claude-opus-5-5 that sent 828,186 tokens, and a
//             `result` saying each model's window
//   signedout `auth status` says loggedIn false (for signed-out.js), and a
//             turn fails the way a lapsed login does
//
// STUB_DELAY (ms) replaces slow's 4,000, and is a wait before the answer in
// every other turn mode (0 in the README modes, 300 in `ok`). STUB_REPLY is
// what `ok` says. STUB_TITLE is what the namer gets: "Stand-in thread" in
// `ok`, nothing in the README modes — under the shell stubs no thread was ever
// named, and a check written against them must not meet a name it never saw.
// STUB_IDLE (ms, 120,000) is how long it waits on a silent stdin before going:
// a stand-in nobody is talking to must not outlive the check that started it.
//
// The model probe refuses an id with whitespace in it, in the CLI's own words,
// and takes anything else — enough for models.js, which sends `opus 4.` and
// `claude-opus-4-5`.
//
// It writes no transcript. The shell stubs did not either, and none of the
// checks that use them reads one back. The app lists threads from
// ~/.claude/projects/<vault>/*.jsonl, so a thread only a stand-in answered is
// not there after a relaunch; a check that needs one on disk takes the
// `thread` fixture (checks/thread-fixture.mjs).
import {
  chmodSync,
  readFileSync,
  realpathSync,
  renameSync,
  statSync,
  unlinkSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, isAbsolute, join, relative } from 'node:path'

const argv = process.argv.slice(2)
const env = process.env
const MODE = (env.STUB_MODE || 'ok').trim()
const MODES = ['ok', 'slow', 'limit', 'fault', 'usage', 'review', 'window', 'signedout']

const ms = (raw, fallback) => {
  const n = Number(raw)
  return raw !== undefined && raw !== '' && Number.isFinite(n) && n >= 0 ? n : fallback
}
const DELAY = (fallback) => ms(env.STUB_DELAY, fallback)
const IDLE = ms(env.STUB_IDLE, 120_000)
const sleep = (t) => new Promise((r) => setTimeout(r, t))
const now = () => Math.floor(Date.now() / 1000)
const real = (p) => {
  try {
    return realpathSync(p)
  } catch {
    return null
  }
}
const within = (child, parent) => {
  const r = relative(parent, child)
  return r !== '' && !r.startsWith('..') && !isAbsolute(r)
}

// A reader that has gone away — the namer kills its child once it has a title
// — is not an error worth a stack trace on somebody's console.
for (const s of [process.stdout, process.stderr]) {
  s.on('error', (e) => process.exit(e?.code === 'EPIPE' ? (process.exitCode ?? 0) : 1))
}

const write = (stream, text) => new Promise((done) => stream.write(text, () => done()))
const out = (line) => write(process.stdout, line + '\n')
const err = (line) => write(process.stderr, line + '\n')

/**
 * Every line is awaited onto the pipe as it is written, so by the time this
 * runs everything said has left the process — on macOS a pipe write is
 * asynchronous, and a bare process.exit() after it can drop the tail.
 */
async function exit(code, after = 0) {
  if (after) await sleep(after)
  process.exit(code)
}

/**
 * Lines off stdin, one at a time, until it closes or goes quiet for STUB_IDLE.
 * `onLine` may be async; lines are handled in the order they came.
 */
function readLines(onLine, onEnd) {
  let buf = ''
  let chain = Promise.resolve()
  let ended = false
  let idle
  const end = () => {
    if (ended) return
    ended = true
    clearTimeout(idle)
    process.stdin.pause()
    if (buf) {
      const last = buf
      buf = ''
      chain = chain.then(() => onLine(last))
    }
    void chain.then(onEnd)
  }
  const arm = () => {
    clearTimeout(idle)
    idle = setTimeout(end, IDLE)
  }
  process.stdin.setEncoding('utf8')
  process.stdin.on('data', (chunk) => {
    if (ended) return
    arm()
    buf += chunk
    let nl
    while ((nl = buf.indexOf('\n')) !== -1) {
      const line = buf.slice(0, nl)
      buf = buf.slice(nl + 1)
      chain = chain.then(() => onLine(line))
    }
  })
  process.stdin.on('end', end)
  process.stdin.on('error', end)
  arm()
  return { stop: end }
}

/** The text a stream-json user line carries, or the raw line if it is not one. */
function textOf(line) {
  try {
    const m = JSON.parse(line)
    const c = m?.message?.content
    if (typeof c === 'string') return c
    if (Array.isArray(c)) return c.filter((b) => b?.type === 'text').map((b) => String(b.text ?? '')).join('\n')
  } catch {
    // Not JSON: the shell stub grepped the raw line, so this does too.
  }
  return line
}

/* ---------- not a turn ---------- */

if (argv[0] === 'auth' && argv[1] === 'status') {
  await out(
    MODE === 'signedout'
      ? '{"loggedIn":false,"authMethod":"none"}'
      : '{"loggedIn":true,"authMethod":"stand-in"}'
  )
  await exit(0)
}

if (argv[0] === '--version' || argv[0] === '-v') {
  await out('2.1.285 (Claude Code)')
  await exit(0)
}

if (!MODES.includes(MODE)) {
  await err(`claude-stub: no such STUB_MODE "${MODE}" (one of ${MODES.join(', ')})`)
  await exit(2)
}

const flag = (name) => {
  const i = argv.indexOf(name)
  return i === -1 ? undefined : argv[i + 1]
}
const isTurn = flag('--input-format') === 'stream-json'
const print = argv.includes('-p') || argv.includes('--print')

if (print && !isTurn) {
  const prompt = flag('-p') ?? flag('--print') ?? ''
  const model = flag('--model')
  if (model !== undefined && (!model.trim() || /\s/.test(model))) {
    await err(
      `There's an issue with the selected model (${model}). It may not exist or you may not have access to it.`
    )
    await exit(1)
  }
  if (prompt.includes('<transcript>')) {
    const title = env.STUB_TITLE ?? (MODE === 'ok' ? 'Stand-in thread' : '')
    if (title) await out(title)
  } else {
    await out(env.STUB_REPLY || 'ok')
  }
  await exit(0)
}

if (!isTurn) {
  await err(`claude-stub: nothing to stand in for: claude ${argv.join(' ')}`)
  await exit(2)
}

/* ---------- a turn, by mode ---------- */

switch (MODE) {
  case 'slow':
    // printf '#!/bin/sh\nsleep 4\nexit 0\n'
    await exit(0, DELAY(4000))
    break

  case 'limit':
    await sleep(DELAY(0))
    await err(`Claude AI usage limit reached|${now() + 8100}`)
    await exit(1)
    break

  case 'fault':
    await sleep(DELAY(0))
    await err('Subagent nesting limit reached (depth 3 of 3). Reset and try again.')
    await exit(1)
    break

  case 'signedout':
    await sleep(DELAY(0))
    await err('Failed to authenticate: OAuth session expired and could not be refreshed')
    await exit(1)
    break

  case 'usage': {
    await sleep(DELAY(0))
    const n = now()
    const s = n + 8100
    const w = n + 518400
    // ${STUB_USED:-0.17}: printed as given, unset or empty both meaning 0.17.
    const u = env.STUB_USED || '0.17'
    await out('{"type":"assistant","message":{"role":"assistant","content":[{"type":"text","text":"ok"}]}}')
    await out(
      `{"type":"rate_limit_event","rate_limit_info":{"status":"allowed","resetsAt":${s},"rateLimitType":"five_hour","overageStatus":"rejected","isUsingOverage":false,"unifiedWindows":{"five_hour":{"utilization":${u},"resetsAt":${s}},"seven_day":{"utilization":0.02,"resetsAt":${w}}}},"uuid":"u","session_id":"s"}`
    )
    await out('{"type":"result","subtype":"success","duration_ms":800}')
    await exit(0, 1000)
    break
  }

  case 'window':
    await sleep(DELAY(0))
    await out(
      '{"type":"assistant","message":{"role":"assistant","model":"claude-opus-5-5","content":[{"type":"text","text":"ok"}],"usage":{"input_tokens":6,"cache_creation_input_tokens":2180,"cache_read_input_tokens":826000,"output_tokens":40}}}'
    )
    await out(
      '{"type":"result","subtype":"success","duration_ms":700,"modelUsage":{"claude-opus-5-5":{"inputTokens":6,"cacheReadInputTokens":826000,"cacheCreationInputTokens":2180,"contextWindow":1000000},"claude-haiku-4-5-20251001":{"inputTokens":900,"cacheReadInputTokens":0,"cacheCreationInputTokens":0,"contextWindow":200000}}}'
    )
    await exit(0, 1000)
    break

  case 'review': {
    // `read -r line`: the first line, or whatever there was when stdin closed.
    let first = null
    await new Promise((done) => {
      const r = readLines(
        (line) => {
          if (first === null) {
            first = line
            r.stop()
          }
        },
        done
      )
    })
    await sleep(DELAY(0))
    const path = /`[^`]*\.md`/.exec(textOf(first ?? ''))?.[0].replace(/`/g, '')
    const refused = path ? unwrapFirstComment(path) : null
    if (refused) await err(refused)
    await out(
      '{"type":"assistant","message":{"role":"assistant","content":[{"type":"text","text":"1. Answered here, and cleared from the note.\\n2. Left in place: I cannot tell which one is meant."}]}}'
    )
    await out('{"type":"result","subtype":"success","duration_ms":900}')
    await exit(0, 1000)
    break
  }

  case 'ok':
  default: {
    const reply = JSON.stringify(env.STUB_REPLY || 'ok')
    readLines(
      async (line) => {
        let msg
        try {
          msg = JSON.parse(line)
        } catch {
          return
        }
        if (msg?.type !== 'user') return
        const t0 = Date.now()
        await sleep(DELAY(300))
        await out(`{"type":"assistant","message":{"role":"assistant","content":[{"type":"text","text":${reply}}]}}`)
        await out(`{"type":"result","subtype":"success","duration_ms":${Date.now() - t0}}`)
      },
      () => exit(0)
    )
    break
  }
}

/**
 * perl -0pi -e 's/\{==((?:(?!==\}).)+)==\}\{>>.*?<<\}/$1/' "$path"
 *
 * Byte for byte: read as latin1 so every byte is one character, `.` as
 * "anything but \n" the way Perl has it without /s, the first match only, and
 * the file always rewritten — through a work file renamed over it, which is
 * what `perl -i` has done since 5.28, so a new inode either way. `[ -f ]` first.
 *
 * The one thing the shell stub did not ask: whose note this is. A note outside
 * the vault, or a vault outside the temp directory, is left alone and the
 * reason returned, to be said on stderr — where the app shows it.
 */
function unwrapFirstComment(path) {
  let st
  try {
    st = statSync(path)
  } catch {
    return null
  }
  if (!st.isFile()) return null
  const vault = real(process.cwd())
  const note = real(path)
  const temp = [real('/private/tmp'), real(tmpdir())].filter(Boolean)
  if (!vault || !note || !within(note, vault) || !temp.some((t) => within(vault, t))) {
    return `claude-stub: review edits a note only inside a throwaway vault under ${temp.join(' or ')}; left ${path} alone (cwd ${process.cwd()})`
  }
  const body = readFileSync(path, 'latin1')
  const next = body.replace(/\{==((?:(?!==\})[^\n])+)==\}\{>>[^\n]*?<<\}/, '$1')
  const work = join(dirname(path), `.${basename(path)}.stub-${process.pid}`)
  try {
    writeFileSync(work, next, 'latin1')
    chmodSync(work, st.mode & 0o7777)
    renameSync(work, path)
  } catch {
    try {
      unlinkSync(work)
    } catch {
      // nothing to tidy
    }
  }
  return null
}
