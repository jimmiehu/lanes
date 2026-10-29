import React from 'react'
import type { ThemeId } from '@shared/types'
import { ago } from '../lib/format'
import { clockAt } from '@shared/limit'
import { readSession, sessionLeft } from '@shared/sessionClock'
import { live, percent, statusOf, tone, type Tone, type Usage, type UsageWindow } from '@shared/usage'

/**
 * The top bar and status bar — the shell's own furniture.
 *
 * Every glyph here is inline SVG on a 0 0 14 14 viewBox, `fill="none"` with a
 * round linecap. No icon font, no image files: the design ships no assets at
 * all, and the wordmark is three rounded divs.
 */

/**
 * Three rounded bars, then the word. The centre bar is the loud one, and the
 * three stand on a shared baseline — centring them makes the short bars float
 * and the mark stops reading as bars at all.
 */
export function Wordmark(): React.JSX.Element {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 9, flex: 'none' }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 13 }}>
        <div style={{ width: 2.5, height: 8, borderRadius: 1, background: 'var(--faint)' }} />
        <div style={{ width: 2.5, height: 13, borderRadius: 1, background: 'var(--ink)' }} />
        <div style={{ width: 2.5, height: 10, borderRadius: 1, background: 'var(--faint)' }} />
      </div>
      <div style={{ font: '600 12.5px var(--sans)', letterSpacing: '-.008em', color: 'var(--ink)' }}>
        Lanes
      </div>
    </div>
  )
}

/**
 * One 27px chip in the right-hand cluster. Active is a `--chip` fill with an
 * `--ink` glyph; inactive is no fill at all and a `--mute` glyph — the fill is
 * the state, so an inactive chip has nothing to un-draw.
 */
export function TopChip({
  on,
  title,
  onClick,
  testId,
  children
}: {
  on?: boolean
  title: string
  onClick: () => void
  /** Hook for the scripts in checks/, which drive the real app. */
  testId?: string
  children: React.ReactNode
}): React.JSX.Element {
  const [hov, setHov] = React.useState(false)
  return (
    <div
      onClick={onClick}
      title={title}
      {...(testId ? { [`data-${testId}`]: '1' } : {})}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={
        {
          width: 27,
          height: 27,
          flex: 'none',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: 8,
          cursor: 'pointer',
          background: on || hov ? 'var(--chip)' : 'transparent',
          color: on ? 'var(--ink)' : 'var(--mute)',
          WebkitAppRegion: 'no-drag'
        } as React.CSSProperties
      }
    >
      {children}
    </div>
  )
}

const G = {
  fill: 'none',
  stroke: 'currentColor',
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const
}

/** Panel with a sidebar — the rail. */
export function BrowseGlyph(): React.JSX.Element {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" {...G} strokeWidth="1.15">
      <rect x="1.9" y="2.7" width="10.2" height="8.6" rx="1.5" />
      <path d="M5.3 2.7v8.6" />
    </svg>
  )
}

/** Panel divided down the middle — the split. */
export function SplitGlyph(): React.JSX.Element {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" {...G} strokeWidth="1.15">
      <rect x="1.9" y="2.7" width="10.2" height="8.6" rx="1.5" />
      <path d="M7 2.7v8.6" />
    </svg>
  )
}

/**
 * Sun, moon, or a half-filled circle. Auto is a third real state rather than a
 * checkbox — it defers to the system instead of storing a value — so it carries
 * the `--chip` fill the way an active chip does.
 */
export function AppearanceGlyph({ theme }: { theme: ThemeId }): React.JSX.Element {
  if (theme === 'dark')
    return (
      <svg width="14" height="14" viewBox="0 0 14 14" {...G} strokeWidth="1.2">
        <path d="M11.6 8.5A5 5 0 0 1 5.5 2.4a4.8 4.8 0 1 0 6.1 6.1z" />
      </svg>
    )
  if (theme === 'auto')
    return (
      <svg width="14" height="14" viewBox="0 0 14 14" {...G} strokeWidth="1.2">
        <circle cx="7" cy="7" r="4.4" />
        <path d="M7 2.6a4.4 4.4 0 0 1 0 8.8z" fill="currentColor" stroke="none" />
      </svg>
    )
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" {...G} strokeWidth="1.2">
      <circle cx="7" cy="7" r="2.7" />
      <path d="M7 1.4v1.3M7 11.3v1.3M1.4 7h1.3M11.3 7h1.3M3.1 3.1l.9.9M10 10l.9.9M10.9 3.1l-.9.9M4 10l-.9.9" />
    </svg>
  )
}

/**
 * A real toothed outline, not a circle with rays. Radial strokes around a small
 * circle draw a sun, and the sun is already spoken for one chip to the left —
 * two adjacent chips must never resolve to the same shape.
 */
export function CogGlyph(): React.JSX.Element {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" {...G} strokeWidth="1.15">
      <path d="M11.15 7.14 L12.58 7.88 L11.57 10.32 L10.04 9.83 L9.83 10.04 L10.32 11.57 L7.88 12.58 L7.14 11.15 L6.86 11.15 L6.12 12.58 L3.68 11.57 L4.17 10.04 L3.96 9.83 L2.43 10.32 L1.42 7.88 L2.85 7.14 L2.85 6.86 L1.42 6.12 L2.43 3.68 L3.96 4.17 L4.17 3.96 L3.68 2.43 L6.12 1.42 L6.86 2.85 L7.14 2.85 L7.88 1.42 L10.32 2.43 L9.83 3.96 L10.04 4.17 L11.57 3.68 L12.58 6.12 L11.15 6.86 Z" />
      <circle cx="7" cy="7" r="1.75" />
    </svg>
  )
}

export function PlusGlyph(): React.JSX.Element {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" {...G} strokeWidth="1.4">
      <path d="M7 3.2v7.6M3.2 7h7.6" />
    </svg>
  )
}

/** `11:40` today, `Wed 14 Oct, 03:00` any other day — a reset a week out needs its day. */
function whenAt(ms: number, now: number): string {
  const d = new Date(ms)
  if (d.toDateString() === new Date(now).toDateString()) return clockAt(ms)
  return `${d.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' })}, ${clockAt(ms)}`
}

/**
 * What is used of the session window, as a ring the height of the digits
 * beside it: a faint track, and over it an arc from twelve o'clock clockwise
 * as far as the window is used — whole past 100%. Plain, the arc is the
 * clock's own ink, whatever the time is wearing; `--warn` and `--alarm` as
 * `tone` says.
 *
 * Butt ends, not the round ones every glyph here has: a round cap reaches past
 * where the arc stops, and at 93% it would close the gap that says it is not
 * 100%.
 */
function UsageRing({ used, tint }: { used: number; tint: Tone }): React.JSX.Element {
  const r = 5
  const round = 2 * Math.PI * r
  const share = Math.min(used, 1)
  return (
    <svg
      data-session-ring={tint}
      width="12"
      height="12"
      viewBox="0 0 14 14"
      style={{ flex: 'none', display: 'block' }}
    >
      <circle cx="7" cy="7" r={r} fill="none" stroke="var(--track)" strokeWidth="2" />
      {share > 0 ? (
        <circle
          data-ring-arc="1"
          cx="7"
          cy="7"
          r={r}
          fill="none"
          stroke={tint === 'plain' ? 'currentColor' : `var(--${tint})`}
          strokeWidth="2"
          strokeDasharray={`${share * round} ${round}`}
          transform="rotate(-90 7 7)"
        />
      ) : null}
    </svg>
  )
}

/**
 * The session clock: how much of the five-hour usage window is gone and how
 * long is left in it, at a glance — a ring, then the time, `◔ 4:12`, on no
 * surface of its own. The ring is the share: plain below 70%, orange from it
 * and red from 90% (`tone`, in shared/usage.ts), with the number in its
 * tooltip and the card. The time is words at the size of the chips beside it:
 * `--mute` while there is time, `--ink` for the last quarter hour and when the
 * CLI itself says `warning`, READY once it has reset, and a faint `5h` when
 * nothing has set it.
 *
 * It sets itself. Every turn's stream says when the window ends and how much
 * of it is used, and App writes both into the state file; the ring is drawn
 * only while the share is about the window the clock is counting.
 *
 * A click discloses rather than edits: a card with both windows — the session
 * and the week — when each resets, and when the figures were said, since they
 * only arrive with a turn. Setting it by hand is in there, `set by hand`, for
 * before a window's first turn or an account whose responses carry none of
 * this: a field holding `5:00`, selected, so ↵ starts a fresh window and typing
 * says how much is left instead (`3:20`, `90m`, `at 17:40`; empty clears it).
 * Esc or clicking away leaves it as it was.
 */
export function SessionClock({
  endsAt,
  usage,
  onSet
}: {
  endsAt: number | null
  usage: Usage | null
  onSet: (endsAt: number | null) => void
}): React.JSX.Element {
  const [now, setNow] = React.useState(Date.now())
  const [draft, setDraft] = React.useState<string | null>(null)
  const [card, setCard] = React.useState(false)
  const [bad, setBad] = React.useState(false)
  const [hov, setHov] = React.useState(false)
  const wrap = React.useRef<HTMLDivElement>(null)
  const left = endsAt === null ? null : endsAt - now
  const over = left !== null && left <= 0
  const session = live(usage?.session, now)
  const week = live(usage?.week, now)
  // The share of the window the clock is COUNTING — a clock set by hand to
  // some other end is not the window these figures are about.
  const used = !over && session && session.resetsAt === endsAt ? session.used : null
  // The CLI's own word, while the window it was said about is still running.
  const warned =
    (usage?.status === 'allowed_warning' || usage?.status === 'rejected') &&
    Boolean(usage.limiting === 'week' ? week : session)
  // What the CLI said about the session itself, which can colour the ring.
  const said = statusOf(usage, 'session')

  // Minutes are all it shows, so a tick every few seconds is plenty — and
  // only while there is something to count.
  React.useEffect(() => {
    setNow(Date.now())
    if (endsAt === null || over) return
    const t = setInterval(() => setNow(Date.now()), 5_000)
    return () => clearInterval(t)
  }, [endsAt, over])

  // The card goes on esc and on a press anywhere outside it. Esc is the card's
  // alone while it is up — nothing behind it should also take that key.
  React.useEffect(() => {
    if (!card) return
    setNow(Date.now())
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape') return
      e.preventDefault()
      e.stopPropagation()
      setCard(false)
    }
    const onDown = (e: MouseEvent): void => {
      if (!wrap.current?.contains(e.target as Node)) setCard(false)
    }
    window.addEventListener('keydown', onKey, true)
    window.addEventListener('mousedown', onDown, true)
    return () => {
      window.removeEventListener('keydown', onKey, true)
      window.removeEventListener('mousedown', onDown, true)
    }
  }, [card])

  const commit = (): void => {
    const got = readSession(draft ?? '')
    if (got === null) {
      setBad(true)
      return
    }
    onSet(got === 'off' ? null : got)
    setDraft(null)
  }

  const box = {
    height: 27,
    flex: 'none',
    display: 'flex',
    alignItems: 'center',
    borderRadius: 8,
    marginRight: 4,
    WebkitAppRegion: 'no-drag'
  } as React.CSSProperties

  if (draft !== null)
    return (
      <div data-session-clock="editing" style={box}>
        <input
          autoFocus
          value={draft}
          spellCheck={false}
          onFocus={(e) => e.currentTarget.select()}
          onChange={(e) => {
            setDraft(e.target.value)
            setBad(false)
          }}
          onKeyDown={(e) => {
            // Its own keys: nothing here is the window's to act on.
            e.stopPropagation()
            if (e.key === 'Enter') {
              e.preventDefault()
              commit()
            } else if (e.key === 'Escape') {
              e.preventDefault()
              setDraft(null)
            }
          }}
          onBlur={() => setDraft(null)}
          title="Time left — 5:00, 3:20, 90m — or when it resets, at 17:40. Empty clears it."
          style={{
            width: 64,
            height: 23,
            boxSizing: 'border-box',
            padding: '0 8px',
            border: 'none',
            outline: 'none',
            borderRadius: 7,
            background: 'var(--sheet)',
            boxShadow: bad ? 'inset 0 0 0 1px var(--ink)' : 'var(--sh1)',
            font: '400 11px var(--mono)',
            fontVariantNumeric: 'tabular-nums',
            color: 'var(--ink)',
            textAlign: 'center'
          }}
        />
      </div>
    )

  const title =
    left === null
      ? 'Session clock — it sets itself with your next turn. Click for more.'
      : over
        ? 'The session window has reset — the next turn starts a new one'
        : used !== null
          ? `${percent(used)} of this session used — ${sessionLeft(left)} left, resets ${clockAt(endsAt as number)}.${
              said === 'rejected'
                ? ' The CLI refused the last turn.'
                : said === 'allowed_warning'
                  ? ' The CLI says it is running low.'
                  : ''
            } Click for both windows.`
          : `${sessionLeft(left)} left — resets at ${clockAt(endsAt as number)}. Click for both windows.`

  return (
    <div ref={wrap} style={{ position: 'relative', flex: 'none' }}>
      <div
        data-session-clock={left === null ? 'off' : over ? 'ready' : 'counting'}
        data-session-used={used !== null ? percent(used) : undefined}
        title={card ? undefined : title}
        onClick={() => setCard((c) => !c)}
        onMouseEnter={() => setHov(true)}
        onMouseLeave={() => setHov(false)}
        style={{
          ...box,
          gap: 6,
          padding: '0 8px',
          cursor: 'pointer',
          background: hov || card ? 'var(--chip)' : 'transparent',
          // Tabular, so a minute ticking over does not shift the digits.
          fontVariantNumeric: 'tabular-nums',
          ...(over
            ? { font: '600 8.5px var(--mono)', letterSpacing: '.18em', color: 'var(--ink)' }
            : {
                font: '400 11px var(--mono)',
                color:
                  left === null
                    ? 'var(--faint)'
                    : left <= 15 * 60_000 || warned
                      ? 'var(--ink)'
                      : 'var(--mute)'
              })
        }}
      >
        {used !== null ? <UsageRing used={used} tint={tone(used, said)} /> : null}
        {left === null ? '5h' : over ? 'READY' : sessionLeft(left)}
      </div>
      {card ? (
        <UsageCard
          session={session}
          week={week}
          usage={usage}
          now={now}
          onByHand={() => {
            setCard(false)
            setBad(false)
            setDraft('5:00')
          }}
        />
      ) : null}
    </div>
  )
}

/**
 * Both windows, disclosed: what is used of each and when each resets, in the
 * details panel's voice. Each figure takes the ring's colours at the ring's
 * thresholds, so a week running out says so as plainly as a session. The
 * figures arrive only with a turn, so the card says when they were said —
 * usage spent on claude.ai or in a terminal is in the next turn's figures, not
 * these.
 */
function UsageCard({
  session,
  week,
  usage,
  now,
  onByHand
}: {
  session: UsageWindow | null
  week: UsageWindow | null
  usage: Usage | null
  now: number
  onByHand: () => void
}): React.JSX.Element {
  const label = {
    width: 58,
    flex: 'none',
    font: '600 8.5px var(--mono)',
    letterSpacing: '.16em',
    color: 'var(--mute)'
  } as React.CSSProperties
  const row = (id: 'session' | 'week', name: string, w: UsageWindow | null): React.JSX.Element => {
    // A window that is not running has no figure, and nothing to colour.
    const t = w ? tone(w.used, statusOf(usage, id)) : 'plain'
    return (
      <div
        data-usage-row={id}
        data-usage-used={w?.used != null ? percent(w.used) : undefined}
        style={{ display: 'flex', alignItems: 'baseline', gap: 10, height: 22 }}
      >
        <div style={label}>{name}</div>
        <div
          data-usage-figure={t}
          style={{
            width: 36,
            flex: 'none',
            // Weight as well as hue, so the two do not rest on colour alone.
            font: `${t === 'plain' ? 400 : 600} 11px var(--mono)`,
            color: t === 'plain' ? 'var(--ink)' : `var(--${t})`,
            fontVariantNumeric: 'tabular-nums',
            textAlign: 'right'
          }}
        >
          {w?.used != null ? percent(w.used) : '—'}
        </div>
        <div
          data-usage-resets="1"
          style={{ flex: 1, minWidth: 0, font: '400 11px var(--sans)', color: 'var(--ink3)' }}
        >
          {w ? `resets ${whenAt(w.resetsAt, now)}` : 'no window running'}
        </div>
      </div>
    )
  }
  return (
    <div
      data-session-card="1"
      style={{
        position: 'absolute',
        top: 33,
        right: 4,
        zIndex: 40,
        width: 270,
        padding: '12px 14px 11px',
        borderRadius: 9,
        background: 'var(--sheet)',
        boxShadow: 'var(--sh2)',
        display: 'flex',
        flexDirection: 'column',
        gap: 2,
        WebkitAppRegion: 'no-drag',
        animation: 'riseIn .15s ease-out'
      } as React.CSSProperties}
    >
      {usage ? (
        <>
          {row('session', 'SESSION', session)}
          {row('week', 'WEEK', week)}
        </>
      ) : (
        <div style={{ font: '400 11px/1.5 var(--sans)', color: 'var(--ink3)', padding: '2px 0 4px' }}>
          No figures yet — the CLI sends them with each turn.
        </div>
      )}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          marginTop: 6,
          paddingTop: 8,
          borderTop: '1px solid var(--div2)'
        }}
      >
        <div data-usage-seen="1" style={{ flex: 1, font: '400 9.5px var(--mono)', color: 'var(--mute)' }}>
          {usage ? `as of ${whenAt(usage.seen, now)}` : ''}
        </div>
        <div
          data-session-byhand="1"
          className="hoverable"
          onClick={onByHand}
          style={{
            flex: 'none',
            font: '400 10.5px var(--sans)',
            color: 'var(--ink2)',
            cursor: 'pointer',
            padding: '2px 6px',
            margin: '-2px -6px',
            borderRadius: 5
          }}
        >
          set by hand
        </div>
      </div>
    </div>
  )
}

/**
 * The centred search pill. `cursor: text` because it looks like a field — but
 * it opens the palette, which is the thing that actually searches.
 */
export function SearchPill({ onClick }: { onClick: () => void }): React.JSX.Element {
  const [hov, setHov] = React.useState(false)
  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={
        {
          width: 300,
          maxWidth: '100%',
          height: 30,
          flex: 'none',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '0 12px',
          borderRadius: 15,
          background: 'var(--sheet)',
          boxShadow: hov ? 'var(--sh1h)' : 'var(--sh1)',
          cursor: 'text',
          WebkitAppRegion: 'no-drag'
        } as React.CSSProperties
      }
    >
      <svg
        width="12"
        height="12"
        viewBox="0 0 14 14"
        fill="none"
        stroke="var(--mute)"
        strokeWidth="1.3"
        strokeLinecap="round"
        style={{ flex: 'none' }}
      >
        <circle cx="6.2" cy="6.2" r="4" />
        <path d="M9.2 9.2l2.6 2.6" />
      </svg>
      <div
        style={{
          flex: 1,
          minWidth: 0,
          font: '400 11.5px var(--sans)',
          color: 'var(--mute)',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis'
        }}
      >
        Search threads and notes
      </div>
      <div style={{ font: '400 9.5px var(--mono)', color: 'var(--faint)', flex: 'none' }}>⌘K</div>
    </div>
  )
}

/**
 * 30px, radius 9, on `--card`. Counts at the left, freshness at the right.
 *
 * The minute ticker lives HERE rather than in App: nothing else on the screen
 * changes when a figure goes from "2m" to "3m", and driving it from the root
 * would re-render the whole tree — transcripts, note bodies and all — twice a
 * minute for one line of text that nothing else reads.
 */
export function StatusBar({
  threads,
  notes,
  lanes,
  sweptAt
}: {
  threads: number
  notes: number
  lanes: number
  /** When main last *looked*, which is what "synced" honestly means. */
  sweptAt: number
}): React.JSX.Element {
  const [, tick] = React.useState(0)
  React.useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 30_000)
    return () => clearInterval(t)
  }, [])
  const synced = Date.now() - sweptAt < 45_000 ? 'synced just now' : `synced ${ago(sweptAt)}`
  return (
    <div
      style={{
        height: 30,
        flex: 'none',
        display: 'flex',
        alignItems: 'center',
        padding: '0 14px',
        borderRadius: 9,
        background: 'var(--card)',
        font: '400 11px var(--sans)',
        color: 'var(--mute)'
      }}
    >
      <div style={{ flex: 1, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {threads} {threads === 1 ? 'thread' : 'threads'} · {notes}{' '}
        {notes === 1 ? 'note' : 'notes'}
        {/* "across 0 lanes" would be a count of something nobody has made. */}
        {lanes ? ` across ${lanes} ${lanes === 1 ? 'lane' : 'lanes'}` : null}
      </div>
      <div style={{ flex: 'none', whiteSpace: 'nowrap' }}>{synced}</div>
    </div>
  )
}
