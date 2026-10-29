import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { BlockView, ToolGroup } from './Blocks'
import Doc from './Doc'
import { InThread, WikiContext, type Follow } from './Runs'
import PathTicks, { type PathMark } from './PathTicks'
import type { Message, MessageBlock, Seam, ToolBlock } from '@shared/types'

interface Props {
  messages: Message[]
  pending: { verb: string; started: number } | null
  elapsed: string
  padX: string
  /** Changes when the pane shows something else — the cue to jump to the end. */
  streamKey: string
  split: boolean
  /** Settings → keep tool call history. Off, the rows are left out of the read. */
  showTools: boolean
  /** Following a `[[wikilink]]` opens it in the other pane; ⌘-click gives it a tab of its own. */
  onWiki: Follow
  /**
   * Part the thread at a message. `fork` on one of Claude's keeps the exchange
   * and carries on differently under it; `edit` on one of yours folds above it
   * and hands the words back to the composer; `again` cuts in exactly the same
   * place as `edit` and sends those words unchanged.
   *
   * `again` is the one thing the other two could not say. `edit` is for when
   * the QUESTION was wrong; resending is for when the question was fine and the
   * ANSWER was the problem — a tool that misfired, a reply that wandered, a
   * model you have since changed. Retyping your own words to get another go at
   * them is not an edit.
   */
  onBranch: (atMessage: number, mode: 'fork' | 'edit' | 'again') => void
  /**
   * Where this path parts from the others in its thread, by message position.
   * Resolved in main against the transcript, so this only draws them.
   */
  seams: Seam[]
  /** Read another path of this thread. Null while there is nowhere to go. */
  onGo: ((id: string) => void) | null
  /** What a path of this thread is doing while you are not on it. */
  busyOf: (id: string) => 'answering' | 'asking' | null
  /** Right-click a path at a seam: name it, or let it go. */
  onSeamMenu?: (e: React.MouseEvent, id: string, label: string) => void
  /**
   * Which path is on screen. `streamKey` deliberately does NOT change when this
   * does — stepping between two paths of one thread is not opening a different
   * document, and must not throw the reader to the bottom — so this is what the
   * seam-pinning and the per-turn remount hang off instead.
   */
  pathKey: string
  /** The pane head, rendered inside this scroller so it can scroll away. */
  header?: React.ReactNode
  /** Settings → text size. Prose only; chrome never scales with it. */
  textScale: number
}


type Rendered = { kind: 'block'; block: MessageBlock } | { kind: 'tools'; tools: ToolBlock[] }

/**
 * Consecutive tool calls render as one collapsible run. Grouping happens here
 * rather than in the parser so the message keeps a flat, honest block list —
 * this is a reading decision, not a change to what was said.
 */
function group(blocks: MessageBlock[], showTools: boolean): Rendered[] {
  const out: Rendered[] = []
  for (const block of blocks) {
    if (block.kind === 'tool') {
      if (!showTools) continue
      const last = out[out.length - 1]
      if (last?.kind === 'tools') last.tools.push(block)
      else out.push({ kind: 'tools', tools: [block] })
    } else {
      out.push({ kind: 'block', block })
    }
  }
  return out
}

/**
 * What a message can be done to. They live on the label row rather than in a
 * floating overlay: the row is already there, already reserves its height, and
 * already sits on the side the message is on — so nothing moves when they
 * appear.
 */
function Actions({
  m,
  can,
  onFork,
  onEdit,
  onAgain
}: {
  m: Message
  can: boolean
  onFork: () => void
  onEdit: () => void
  onAgain: () => void
}): React.JSX.Element | null {
  const [copied, setCopied] = useState(false)
  if (!can) return null
  const cell = {
    font: '400 10.5px var(--sans)',
    color: 'var(--mute)',
    cursor: 'pointer'
  } as const
  return (
    <div
      data-acts="1"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 14,
        paddingRight: 3,
        alignSelf: m.role === 'you' ? 'flex-end' : 'flex-start',
        paddingLeft: m.role === 'you' ? 0 : 18
      }}
    >
      <div
        className="msg-action"
        title="Copy this message as markdown"
        style={cell}
        onClick={() => {
          // The markdown it was rendered from, not the blocks it became —
          // parseBlocks joins wrapped lines and drops list markers, so the
          // rendering cannot be turned back into its source.
          void navigator.clipboard.writeText(m.source ?? m.text).then(() => {
            setCopied(true)
            setTimeout(() => setCopied(false), 1200)
          })
        }}
      >
        {copied ? 'copied' : 'copy'}
      </div>
      {/*
        Which verb belongs here is decided by whose turn it is, and that is what
        keeps a path honest: a cut after an answer, or before a question, and
        never in the middle of an exchange. So a path can never open on a
        question nobody answered — which is what forking your own turn used to
        do, silently.
      */}
      {m.role === 'you' ? (
        <>
          <div
            className="msg-action"
            title="Put this back in the composer and ask it differently — this thread keeps the answer it already gave"
            style={cell}
            onClick={onEdit}
          >
            edit
          </div>
          {/*
            LAST, and deliberately so: it is the only one of the three that
            spends a turn on its own. The two beside it hand you something and
            wait — a clipboard, a composer with your words in it — and this one
            has already gone by the time you have read the word.
          */}
          <div
            className="msg-action"
            data-resend="1"
            title="Ask this again, word for word — this thread keeps the answer it already gave"
            style={cell}
            onClick={onAgain}
          >
            resend
          </div>
        </>
      ) : (
        <div
          className="msg-action"
          title="Carry on from here a different way, keeping everything above"
          style={cell}
          onClick={onFork}
        >
          fork
        </div>
      )}
    </div>
  )
}

function MessageView({
  m,
  split,
  showTools,
  textScale,
  canBranch,
  onFork,
  onEdit,
  onAgain
}: {
  m: Message
  split: boolean
  showTools: boolean
  textScale: number
  /** False for a message still streaming, which has no line in a transcript yet. */
  canBranch: boolean
  onFork: () => void
  onEdit: () => void
  onAgain: () => void
}): React.JSX.Element {
  const you = m.role === 'you'
  /*
   * Two shapes, so the speaker is legible from across the room.
   *
   * Claude's turn is a labelled document inset behind a hairline. Yours is a
   * bubble on the right with NO label — the side of the measure already says
   * who spoke, and a label would be the second thing saying it.
   */
  return (
    <div
      className="msg-row"
      data-turn="1"
      data-msg-role={m.role}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: you ? 'flex-end' : 'stretch',
        gap: you ? 7 : 12,
        minWidth: 0
      }}
    >
      {you ? null : (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div
            style={{
              font: '600 9px var(--mono)',
              letterSpacing: '.17em',
              color: 'var(--mute)',
              flex: 'none'
            }}
          >
            CLAUDE
          </div>
        </div>
      )}

      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 13,
          minWidth: 0,
          alignSelf: you ? 'flex-end' : 'stretch',
          maxWidth: you ? (split ? '82%' : '68%') : '100%',
          padding: you ? '11px 15px' : '0 0 0 18px',
          background: you ? 'var(--bubble)' : 'transparent',
          borderRadius: you ? 11 : 0,
          boxShadow: you ? 'none' : 'inset 1px 0 0 var(--hair)'
        }}
      >
        {m.text ? (
          you ? (
            // Your own turn stays literal. What you typed is what you meant,
            // and rendering it as markdown would restructure your own words
            // back at you — a stray `#` is a hash, not a heading.
            <div
              style={{
                font: `400 ${(13.5 * textScale).toFixed(1)}px/1.6 var(--sans)`,
                color: 'var(--body)',
                textWrap: 'pretty',
                whiteSpace: 'pre-wrap',
                // A pasted address has nowhere to break, and literal is no
                // reason to run past the bubble: break it where it must.
                overflowWrap: 'anywhere'
              }}
            >
              {m.text}
            </div>
          ) : (
            <Doc body={m.text} path="" scale={textScale} />
          )
        ) : null}
        {group(m.blocks, showTools).map((r, i) => (
          <div
            key={r.kind === 'tools' ? r.tools[0].id : 'id' in r.block ? r.block.id : i}
            style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}
          >
            {r.kind === 'tools' ? <ToolGroup tools={r.tools} /> : <BlockView block={r.block} scale={textScale} />}
          </div>
        ))}
      </div>

      {/* Under the turn, not floating over it: the row already reserves the
          height, so nothing moves as they appear. */}
      <Actions m={m} can={canBranch} onFork={onFork} onEdit={onEdit} onAgain={onAgain} />

      {m.meta ? (
        <div
          style={{
            font: '400 9px var(--mono)',
            letterSpacing: '.06em',
            color: 'var(--mute)',
            paddingLeft: you ? 0 : 18
          }}
        >
          {m.meta}
        </div>
      ) : null}
    </div>
  )
}

/**
 * A seam: where this thread's paths part.
 *
 * A rule across the measure with the alternatives sitting ON it, in the meta
 * type the actions row already uses. Everything above a seam is the same in
 * every path — the copied prefix is byte for byte identical — and only what is
 * below it differs, so the rule is a landmark you read past rather than a
 * control you operate. No colour, no box, no tree: the paths are named by what
 * they open with, which is a label that cannot go stale.
 *
 * The active path is not listed. You are reading it; the rule says what ELSE
 * leaves from here.
 */
function SeamRow({
  n,
  paths,
  busyOf,
  onGo,
  onMenu
}: {
  /** Which seam this is, counting down the thread — what a dot looks it up by. */
  n: number
  paths: { id: string; label: string; active: boolean; unwritten: boolean }[]
  /** What a path is doing while you are not on it, if anything. */
  busyOf: (id: string) => 'answering' | 'asking' | null
  onGo: ((id: string) => void) | null
  onMenu: ((e: React.MouseEvent, id: string, label: string) => void) | null
}): React.JSX.Element {
  return (
    <div
      data-seam="1"
      /*
       * Identity for the margin rail, ADDED rather than substituted. Three
       * places select on `[data-seam]` and one reads this row's spans by
       * position, so the attribute that is there keeps its value and its
       * markup keeps its shape.
       */
      data-seam-n={n}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '3px 0',
        minWidth: 0
      }}
    >
      <div style={{ height: 1, width: 22, background: 'var(--hair)', flex: 'none' }} />
      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          gap: 9,
          minWidth: 0,
          flexWrap: 'wrap',
          font: '400 10.5px var(--sans)',
          color: 'var(--mute)'
        }}
      >
        <span style={{ letterSpacing: '.02em' }}>from here</span>
        {paths.map((o) => {
          const busy = busyOf(o.id)
          return (
          <span
            key={o.id}
            data-path-active={o.active ? '1' : '0'}
            className={onGo && !o.active ? 'msg-action' : undefined}
            title={
              o.active
                ? `You are reading this path — ${o.label}`
                : onGo
                  ? busy === 'answering'
                    ? `Still answering — ${o.label}`
                    : busy === 'asking'
                      ? `Waiting on you — ${o.label}`
                      : `Read this path instead — ${o.label}`
                  : undefined
            }
            onClick={onGo && !o.active ? () => onGo(o.id) : undefined}
            onContextMenu={onMenu ? (e) => onMenu(e, o.id, o.label) : undefined}
            style={{
              display: 'inline-flex',
              alignItems: 'baseline',
              gap: 6,
              // The one you are on is the loudest thing on the rule and the
              // only one that is not a link. Everything else is a way out.
              color: o.active ? 'var(--ink)' : 'var(--body)',
              fontWeight: o.active ? 600 : 400,
              cursor: onGo && !o.active ? 'pointer' : 'default',
              // A path with nothing on it yet has no words to be named by, and
              // saying so is more use than an empty gap. It can still carry a
              // stamp — two of them on one seam must be told apart — so the
              // slant follows the FACT, not whether the string is empty.
              fontStyle: o.unwritten ? 'italic' : 'normal',
              maxWidth: 260,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap'
            }}
          >
            {/*
              A path carries on without you now, so the seam says which one is
              still going. The blink is the cursor the transcript already uses
              for an answer being written; a path that stopped to ask something
              holds the dot still, because it is not going anywhere until you
              answer it.
            */}
            {busy ? (
              <span
                data-path-busy={busy}
                style={{
                  width: 4,
                  height: 4,
                  borderRadius: 99,
                  flex: 'none',
                  alignSelf: 'center',
                  background: 'var(--ink)',
                  animation:
                    busy === 'answering' ? 'cursorBlink 1.4s ease-in-out infinite' : undefined
                }}
              />
            ) : null}
            {o.label}
          </span>
          )
        })}
      </div>
      <div style={{ height: 1, flex: 1, background: 'var(--hair)', minWidth: 12 }} />
    </div>
  )
}

/**
 * Answering. One 5px ink dot on a slow blink beside the label — a cursor, which
 * is the thing everyone already reads as "still going". The three pulsing dots
 * and the sweeping bar it replaces were two indicators saying one thing.
 *
 * The verb and the elapsed seconds stay: they are ours, and they say how long
 * you have been waiting, which a blinking dot cannot.
 */
function Processing({ verb, elapsed }: { verb: string; elapsed: string }): React.JSX.Element {
  return (
    <div data-turn="1" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div
          style={{
            font: '600 9px var(--mono)',
            letterSpacing: '.17em',
            color: 'var(--mute)',
            flex: 'none'
          }}
        >
          CLAUDE
        </div>
        <div
          style={{
            width: 5,
            height: 5,
            borderRadius: 99,
            background: 'var(--ink)',
            animation: 'cursorBlink 1.4s ease-in-out infinite',
            flex: 'none'
          }}
        />
      </div>
      <div
        style={{
          paddingLeft: 18,
          boxShadow: 'inset 1px 0 0 var(--hair)',
          font: '400 9px var(--mono)',
          letterSpacing: '.06em',
          color: 'var(--mute)'
        }}
      >
        {verb} · {elapsed}
      </div>
    </div>
  )
}

/**
 * How close to the end still counts as being at the end. A couple of lines of
 * slack, so a fractional scroll position or a small overshoot does not read as
 * "the reader has scrolled away".
 */
const NEAR_BOTTOM = 64
/**
 * How far up the thread you have to be before the way back down is offered.
 * Deliberately further than NEAR_BOTTOM: a control that appears and disappears
 * around the same pixel the auto-scroll uses would blink on every turn.
 */
const OFFER_BACK = 160
/**
 * Where a jump sets a message down: this far under the top of what you can
 * see, the landing a fork and the note outline use.
 */
const LAND = 22
/** How far the ways up and down stand clear of the words, in a margin wide enough for them. */
const CLEAR = 18

export default function MessageStream({
  messages,
  pending,
  elapsed,
  padX,
  split,
  showTools,
  streamKey,
  onWiki,
  onBranch,
  seams,
  onGo,
  busyOf,
  onSeamMenu,
  pathKey,
  header,
  textScale
}: Props): React.JSX.Element {
  const ref = useRef<HTMLDivElement>(null)
  /** Seams by the message they sit above; `messages.length` sits below the last. */
  const seamsAt = useMemo(() => {
    const by = new Map<number, Seam[]>()
    for (const s of seams) {
      const list = by.get(s.at)
      if (list) list.push(s)
      else by.set(s.at, [s])
    }
    return by
  }, [seams])
  /**
   * Each seam's place counting down the thread, which is what a tick in the
   * margin is numbered by. Read from `seamsAt` rather than from `seams` so the
   * numbering follows the ORDER THEY ARE DRAWN IN — two divergence lines can
   * resolve to the same message, and the map holds a list per index for exactly
   * that reason.
   */
  const seamOrder = useMemo(() => {
    const order = new Map<Seam, number>()
    let n = 0
    for (const at of [...seamsAt.keys()].sort((a, b) => a - b)) {
      for (const s of seamsAt.get(at) ?? []) order.set(s, n++)
    }
    return order
  }, [seamsAt])
  /**
   * Whether the reader is sitting at the live edge. Only then does new content
   * scroll the view: reading back through a thread while a turn streams used to
   * yank you to the bottom on every update, which made it impossible to read
   * anything while Claude was talking.
   */
  const stick = useRef(true)
  /**
   * Whether the reader is far enough up to be offered the way back down. State
   * rather than a ref, because unlike `stick` this one has to draw something —
   * and `setAway` with an unchanged value costs nothing, which is what makes it
   * safe to call on every scroll event.
   */
  const [away, setAway] = useState(false)

  /**
   * Whether there is the start of a message above the top of what you can see
   * — the way up is offered only then, so at the head of a thread there is
   * nothing to press.
   */
  const [upward, setUpward] = useState(false)
  /**
   * Where the last jump up was headed, while it is still on its way. A second
   * press during the glide counts from there, not from wherever the glide has
   * got to, so pressing twice is two messages up rather than the same one
   * twice. Let go when the scroll ends, or when you take over.
   */
  const aim = useRef<number | null>(null)

  const measure = (el: HTMLElement): void => {
    const gap = el.scrollHeight - el.scrollTop - el.clientHeight
    stick.current = gap <= NEAR_BOTTOM
    setAway(gap > OFFER_BACK)
    setUpward(startAbove(el, null) !== null)
  }

  const onScroll = (): void => {
    const el = ref.current
    if (el) measure(el)
  }

  /**
   * THE START OF THE MESSAGE ABOVE — the turn whose first line is the last one
   * above the top of what you can see, as a scroll offset that sets it LAND
   * under that top. Reading the middle of a long answer, that is where the
   * answer began; standing at a message's start already, it is the one before.
   * The top of what you can see is under the compact bar once the head has
   * gone. Binary search: a thread is hundreds of turns, and this runs on
   * every scroll.
   */
  const startAbove = (el: HTMLElement, from: number | null): number | null => {
    const turns = el.querySelectorAll<HTMLElement>('[data-turn]')
    if (!turns.length) return null
    const box = el.getBoundingClientRect()
    const bar = el.closest('[data-pane]')?.querySelector('[data-compact="1"]')
    const cover = bar ? Math.max(0, bar.getBoundingClientRect().bottom - box.top) : 0
    // The line in the transcript's own terms: the top of what can be seen.
    const line = (from ?? el.scrollTop) + cover
    const at = (i: number): number => el.scrollTop + (turns[i].getBoundingClientRect().top - box.top)
    let lo = 0
    let hi = turns.length - 1
    let found = -1
    while (lo <= hi) {
      const mid = (lo + hi) >> 1
      if (at(mid) < line - 2) {
        found = mid
        lo = mid + 1
      } else hi = mid - 1
    }
    if (found < 0) return null
    return Math.max(0, at(found) - cover - LAND)
  }

  /**
   * The pane's right margin, measured: the two ways up and down stand in it,
   * clear of the words, wherever there is one wide enough — and only fall back
   * onto the end of the lines in a pane too narrow to have one.
   */
  const [margin, setMargin] = useState(0)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const read = (): void => setMargin(parseFloat(getComputedStyle(el).paddingRight) || 0)
    read()
    const ro = new ResizeObserver(read)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const aside = margin >= 26 + CLEAR + 12

  const toStart = (): void => {
    const el = ref.current
    if (!el) return
    const to = startAbove(el, aim.current)
    if (to === null) return
    // Off the live edge first, as a jump to a fork does: at the edge every
    // token re-pins the scroll to the bottom and would eat the jump.
    stick.current = false
    aim.current = to
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    el.scrollTo({ top: to, behavior: still ? 'auto' : 'smooth' })
  }
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const done = (): void => {
      aim.current = null
    }
    const yours = ['wheel', 'keydown', 'pointerdown'] as const
    el.addEventListener('scrollend', done)
    for (const t of yours) el.addEventListener(t, done, { passive: true })
    return () => {
      el.removeEventListener('scrollend', done)
      for (const t of yours) el.removeEventListener(t, done)
    }
  }, [])

  const toBottom = (): void => {
    const el = ref.current
    if (!el) return
    stick.current = true
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    el.scrollTo({ top: el.scrollHeight, behavior: still ? 'auto' : 'smooth' })
    setAway(false)
  }

  // Opening something new in this pane always starts at the newest message,
  // whatever the previous occupant's scroll position was.
  useEffect(() => {
    const el = ref.current
    if (!el) return
    stick.current = true
    el.scrollTop = el.scrollHeight
    setAway(false)
  }, [streamKey])

  // Assign scrollTop directly; scrollIntoView drags the whole app shell.
  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (stick.current) el.scrollTop = el.scrollHeight
    // A turn that lands while you are reading back makes the thread longer, so
    // the way down has to appear even though you did not move.
    measure(el)
  }, [messages, pending])

  /**
   * Stepping to another path of the same thread. Declared after the effect
   * above so it has the last word on where the reader ends up.
   *
   * Everything above a seam is identical in both paths, so a reader up there
   * has not moved and must not be moved — scrollTop already points at the same
   * words. Below one, the text has changed underneath them, and the seam is the
   * only honest place to set them down: here is where this path begins. A
   * reader who was at the live edge stays at the live edge, which is now this
   * path's.
   */
  const firstPaint = useRef(true)
  useEffect(() => {
    if (firstPaint.current) {
      firstPaint.current = false
      return
    }
    const el = ref.current
    if (!el || stick.current) return
    const top = el.getBoundingClientRect().top
    let above = -1
    for (const node of el.querySelectorAll('[data-seam]')) {
      const at = el.scrollTop + (node.getBoundingClientRect().top - top)
      if (at < el.scrollTop) above = at
    }
    if (above < 0) return
    el.scrollTop = Math.max(0, above - el.clientHeight / 4)
    measure(el)
  }, [pathKey])

  /**
   * WHERE THE FORKS SIT, as fractions of the whole transcript — the map the
   * margin rail draws. See PathTicks.
   *
   * Measured off the seam ROWS rather than off the messages: a path with
   * nothing written on it yet parts below every turn, at `messages.length`,
   * and has no message element to hang a mark on. The rows are the only thing
   * that exists for every seam.
   *
   * Declared AFTER the path-switch effect below, which repositions the reader —
   * measure before it and the marks are computed against a scroll position that
   * is about to change, and the whole rail is a frame stale.
   */
  const [marks, setMarks] = useState<PathMark[]>([])
  const [passed, setPassed] = useState(-1)

  const readTicks = useCallback((): void => {
    const el = ref.current
    // Nearly every thread has never been forked. Those pay one test and never
    // touch the DOM.
    if (!el || !seams.length) {
      setMarks((was) => (was.length ? [] : was))
      return
    }
    const height = el.scrollHeight
    if (!height) return
    const top = el.getBoundingClientRect().top
    const found: PathMark[] = []
    let last = -1
    for (const node of el.querySelectorAll('[data-seam-n]')) {
      const box = node.getBoundingClientRect()
      const at = el.scrollTop + (box.top - top)
      const n = Number((node as HTMLElement).dataset.seamN)
      const seam = seams.find((x) => seamOrder.get(x) === n)
      // The rail names the ways OUT of this seam; the path you are reading is
      // already the thing on screen around it.
      const away = seam?.paths.filter((o) => !o.active) ?? []
      const label = away.map((o) => o.label).join(', ') || 'unwritten'
      const busy = away.map((o) => busyOf(o.id)).find(Boolean) ?? null
      found.push({ frac: Math.min(1, Math.max(0, at / height)), label, busy })
      // The one you last went past, on the same trigger line the outline uses.
      if (at <= el.scrollTop + 40) last = found.length - 1
    }
    // The SAME array unless something actually moved, or an effect with no dep
    // list re-renders on every streamed token for ever.
    setMarks((was) =>
      was.length === found.length &&
      was.every(
        (w, i) =>
          Math.abs(w.frac - found[i].frac) < 0.002 &&
          w.label === found[i].label &&
          w.busy === found[i].busy
      )
        ? was
        : found
    )
    setPassed(last)
  }, [seams, seamOrder, busyOf])

  useEffect(readTicks)

  /**
   * Going to a fork. `stick` is dropped FIRST: at the live edge every token
   * re-pins the scroll to the bottom, which would eat the jump mid-animation.
   */
  const goSeam = useCallback((i: number): void => {
    const el = ref.current
    const node = el?.querySelectorAll('[data-seam-n]')[i] as HTMLElement | undefined
    if (!el || !node) return
    stick.current = false
    const at = el.scrollTop + (node.getBoundingClientRect().top - el.getBoundingClientRect().top)
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    // The same landing the note outline uses, so both margins set you down in
    // the same place: the thing you asked for, 22px under the top.
    el.scrollTo({ top: Math.max(0, at - 22), behavior: still ? 'auto' : 'smooth' })
  }, [])

  return (
    <div style={{ flex: 1, minHeight: 0, position: 'relative', display: 'flex' }}>
    <div
      ref={ref}
      data-find-scope="1"
      onScroll={onScroll}
      style={{
        flex: 1,
        overflowY: 'auto',
        overflowX: 'hidden',
        minHeight: 0,
        padding: `16px ${padX} 22px`,
        // Expanding a tool run adds height; with scroll anchoring on, a reader
        // sitting at the bottom sees everything above jump up instead of the
        // run opening beneath the row they clicked.
        overflowAnchor: 'none'
      }}
    >
      <WikiContext.Provider value={onWiki}>
      {/* Thread prose: a bare note name or a vault path is a link here (see `threadLinks`). */}
      <InThread.Provider value={true}>
      {/* The head scrolls WITH the transcript. That is what the compact bar is
          for — and an IntersectionObserver can only watch a target inside its
          own root, so a head that sat above the scroller could never be seen
          to leave it. */}
      {header}
      <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 13 }}>
        {!messages.length && !pending ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5, paddingTop: 4 }}>
            <div style={{ font: '600 13px var(--sans)', color: 'var(--ink)' }}>
              A new thread, in the vault.
            </div>
            <div
              style={{
                font: '400 var(--msg-sm)/1.65 var(--sans)',
                color: 'var(--ink3)',
                maxWidth: 460
              }}
            >
              It runs where your notes are, so it can read and write them. The first thing you
              send names the thread and files it into a lane.
            </div>
          </div>
        ) : null}
        {messages.map((m, i) => (
          // Keyed by the path as well as the message: positional ids (u-3, a-3)
          // repeat across paths, so without this a switch would hand a turn's
          // open tool rows to whatever turn slid into its place.
          <React.Fragment key={`${pathKey}:${m.id}`}>
            {seamsAt.get(i)?.map((s, k) => (
              <SeamRow
                key={`seam-${i}-${k}`}
                n={seamOrder.get(s) ?? 0}
                paths={s.paths}
                busyOf={busyOf}
                onGo={onGo}
                onMenu={onSeamMenu ?? null}
              />
            ))}
            <MessageView
              m={m}
              split={split}
              showTools={showTools}
              textScale={textScale}
              // Nothing to branch from mid-turn: the transcript is still being
              // written, and the cut is resolved against it.
              canBranch={!pending}
              onFork={() => onBranch(i, 'fork')}
              onEdit={() => onBranch(i, 'edit')}
              onAgain={() => onBranch(i, 'again')}
            />
          </React.Fragment>
        ))}
        {/* A path with nothing written on it yet parts at the very end. */}
        {seamsAt.get(messages.length)?.map((s, k) => (
          <SeamRow
            key={`seam-end-${k}`}
            n={seamOrder.get(s) ?? 0}
            paths={s.paths}
            busyOf={busyOf}
            onGo={onGo}
            onMenu={onSeamMenu ?? null}
          />
        ))}
        {pending ? <Processing verb={pending.verb} elapsed={elapsed} /> : null}
      </div>

      {/*
        The way back to the live edge, when you have read far enough up to have
        lost it. STICKY with no height of its own: it hugs the bottom of the
        scrollport without taking a pixel of the transcript's layout, which an
        absolutely-positioned control could not do from in here — the scroller
        is the thing that scrolls, so anything absolute inside it scrolls away
        with the words.
      */}
      <div
        style={{
          position: 'sticky',
          bottom: 0,
          height: 0,
          display: 'flex',
          justifyContent: 'flex-end',
          pointerEvents: 'none'
        }}
      >
        <div
          data-ways={aside ? 'margin' : 'measure'}
          style={{ position: 'relative', width: 26, height: 0, marginRight: aside ? -(26 + CLEAR) : 0 }}
        >
        {/*
          Up to where a message began — the one you are in the middle of, and
          pressed again, the one before it, and so on up the thread. A long
          answer is read from its first line, and scrolling back to find that
          line by eye is how you lose the end of it on the way.

          Above the way down and quieter than it: a ring and no cast, smaller,
          and only there when there is a start above you to go to. It has its
          own place, so the way down appearing under it moves nothing.
        */}
        <div
          data-to-start={upward ? '1' : '0'}
          onClick={toStart}
          className="to-start"
          title="Up to where this message starts — again for the one before"
          style={{
            position: 'absolute',
            right: 2,
            top: -58,
            width: 22,
            height: 22,
            borderRadius: 99,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'var(--sheet)',
            boxShadow: '0 0 0 1px var(--track)',
            cursor: 'pointer',
            opacity: upward ? 1 : 0,
            pointerEvents: upward ? 'auto' : 'none',
            transition: 'opacity .18s ease'
          }}
        >
          <svg
            width="10"
            height="10"
            viewBox="0 0 14 14"
            fill="none"
            stroke="var(--faint)"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M3.4 2.8h7.2" />
            <path d="M3.6 9.6L7 6.2l3.4 3.4" />
          </svg>
        </div>
        <div
          data-to-bottom={away ? '1' : '0'}
          onClick={toBottom}
          className="to-bottom"
          title="Back to the newest message"
          style={{
            position: 'absolute',
            right: 0,
            top: -30,
            width: 26,
            height: 26,
            borderRadius: 99,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'var(--sheet)',
            boxShadow: '0 0 0 1px var(--track), var(--sh1)',
            cursor: 'pointer',
            // Present or not at all: it fades rather than appearing, and takes
            // no clicks while it is gone.
            opacity: away ? 1 : 0,
            pointerEvents: away ? 'auto' : 'none',
            transition: 'opacity .18s ease'
          }}
        >
          <svg
            width="11"
            height="11"
            viewBox="0 0 14 14"
            fill="none"
            stroke="var(--mute)"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M3 5.5l4 4 4-4" />
          </svg>
        </div>
        </div>
      </div>
      </InThread.Provider>
      </WikiContext.Provider>
    </div>

    {/* A sibling of the scrollport, never in it and never beside it. See
        PathTicks — the wrapper above is always rendered, forked or not, because
        gating it would unmount the scroller and lose the reader's place at
        exactly the moment a thread first forks. */}
    <PathTicks marks={marks} active={passed} onGo={goSeam} />
    </div>
  )
}
