import { useEffect, useState } from 'react'
import { LIMIT_LABEL, clockAt, countdown, type LimitNotice } from '@shared/limit'

/**
 * A usage limit, drawn as the one thing it actually is: a wait.
 *
 * It used to arrive as stderr — mono, on the code ground, in the box kept for
 * machine output you did not ask for. Which is what it literally is and exactly
 * the wrong thing to say about it. Nothing is broken, there is nothing to fix,
 * and the only fact worth having is WHEN IT LIFTS. So the clock is the biggest
 * thing here, counting down, and the CLI's own sentence sits underneath at the
 * size a footnote deserves.
 *
 * Where the CLI named no time there is no clock. A countdown to a moment nobody
 * said would be an invention, and this is a screen you look at precisely when
 * you need to trust it.
 */
export default function LimitNote({
  limit,
  padX
}: {
  limit: LimitNotice
  padX: string
}): React.JSX.Element {
  const [now, setNow] = useState(Date.now())
  const left = limit.resetsAt === null ? null : limit.resetsAt - now
  const over = left !== null && left <= 0

  // One tick a second, and only while there is something to count.
  useEffect(() => {
    if (limit.resetsAt === null || over) return
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [limit.resetsAt, over])

  return (
    <div style={{ flex: 'none', padding: `0 ${padX} 12px` }}>
      <div
        data-limit={limit.scope}
        style={{
          borderRadius: 9,
          padding: '13px 16px 14px',
          background: 'var(--card)',
          boxShadow: 'inset 0 0 0 1px var(--edge)',
          display: 'flex',
          flexDirection: 'column',
          gap: 9
        }}
      >
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
          <div
            style={{
              font: '600 8.5px var(--mono)',
              letterSpacing: '.18em',
              color: 'var(--mute)',
              flex: 'none'
            }}
          >
            {LIMIT_LABEL[limit.scope]}
          </div>
          <div style={{ flex: 1 }} />
          {left === null ? null : (
            <div
              data-limit-clock={over ? 'ready' : 'counting'}
              style={{
                font: '400 20px/1 var(--mono)',
                // Tabular, or every second shifts the digits beside it and the
                // clock jitters for as long as you look at it.
                fontVariantNumeric: 'tabular-nums',
                letterSpacing: over ? '.1em' : '.01em',
                color: 'var(--ink)',
                flex: 'none'
              }}
            >
              {over ? 'READY' : countdown(left)}
            </div>
          )}
        </div>

        <div style={{ font: '400 12px/1.6 var(--sans)', color: 'var(--ink2)' }}>
          {left === null
            ? 'The CLI did not say when it lifts. Try again in a while.'
            : over
              ? 'The window has reset — send it again.'
              : `Back at ${clockAt(limit.resetsAt as number)}. The thread is where you left it — your message is in it, unanswered, and sending again is all it needs.`}
        </div>

        {/* What was actually said, kept at the size of a footnote. The clock is
            read from it, so it is the evidence for everything above. */}
        <div
          style={{
            font: '400 10px/1.6 var(--mono)',
            color: 'var(--mute)',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis'
          }}
          title={limit.said}
        >
          {limit.said}
        </div>
      </div>
    </div>
  )
}
