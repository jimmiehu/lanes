import React, { useEffect, useRef, useState } from 'react'
import { HIGHLIGHTS, type AppState, type Flags } from '@shared/types'
import { MEASURE_DEFAULT } from '../lib/theme'

/**
 * Settings (⌘,) — a 290px panel under the top bar, not a modal.
 *
 * Three toggles, the highlight colour, and the keyboard map, which is
 * genuinely all most days need.
 * Appearance is NOT here: it lives in the top bar, because it is a view state
 * you flip while working rather than a preference you go and configure.
 *
 * Everything that changes how the CLI actually runs — models, safety, skills —
 * is real and cannot be dropped, so it lives one row further in. Those are
 * settings you set once; these are the ones you reach for.
 */

const KEYS: [string, string][] = [
  ['⌘K', 'Search threads, notes and tasks'],
  ['⌘T', 'New thread'],
  ['⌘N', 'New note'],
  ['⌘E', 'Write or read the note'],
  ['⌥1', 'Show or hide the browser'],
  ['⌘\\', 'Split'],
  ['⌘W', 'Close tab'],
  ['⇧⌘T', 'Reopen the tab you just closed'],
  ['⌘[ ⌘]', 'Back and forward, per tab'],
  ['⌘1–9', 'Nth tab of this pane'],
  ['⌃⇥', 'Cycle tabs'],
  ['⌥↑ ⌥↓', 'Step the browser'],
  ['⌘F', 'Find in this pane'],
  ['⌘↵', 'Save the open block'],
  ['esc', 'Dismiss — in WRITE, leave it, asking before it discards'],
  ['↵ ⇧↵', 'Send · newline']
]

function Toggle({
  on,
  label,
  note,
  onClick
}: {
  on: boolean
  label: string
  note: string
  onClick: () => void
}): React.JSX.Element {
  return (
    <div
      onClick={onClick}
      style={{ display: 'flex', alignItems: 'flex-start', gap: 12, cursor: 'pointer' }}
    >
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
        <div style={{ font: '500 12.5px var(--sans)', color: 'var(--ink)' }}>{label}</div>
        <div style={{ font: '400 11px/1.5 var(--sans)', color: 'var(--ink3)' }}>{note}</div>
      </div>
      <div
        style={{
          width: 30,
          height: 18,
          borderRadius: 99,
          background: on ? 'var(--ink)' : 'var(--track)',
          flex: 'none',
          padding: 2,
          marginTop: 1,
          display: 'flex',
          justifyContent: on ? 'flex-end' : 'flex-start',
          boxSizing: 'border-box'
        }}
      >
        <div
          style={{
            width: 14,
            height: 14,
            borderRadius: '50%',
            background: on ? 'var(--knobOn)' : 'var(--knobOff)',
            boxShadow: 'var(--shk)'
          }}
        />
      </div>
    </div>
  )
}

export default function SettingsPanel({
  state,
  patch,
  setFlag,
  onMore,
  onClose
}: {
  state: AppState
  patch: (p: Partial<AppState>) => void
  setFlag: (k: keyof Flags) => void
  onMore: () => void
  onClose: () => void
}): React.JSX.Element {
  const wrap = useRef<HTMLDivElement>(null)
  const [hoverMore, setHoverMore] = useState(false)
  useEffect(() => {
    const off = (e: MouseEvent): void => {
      if (!wrap.current?.contains(e.target as Node)) onClose()
    }
    document.addEventListener('mousedown', off)
    return () => document.removeEventListener('mousedown', off)
  }, [onClose])

  const wide = state.measure > MEASURE_DEFAULT

  return (
    <>
      <div
        style={{
          position: 'fixed',
          inset: 0,
          background: 'var(--veil2)',
          zIndex: 40,
          animation: 'veilIn .14s ease-out'
        }}
      />
      <div
        ref={wrap}
        style={{
          position: 'fixed',
          top: 52,
          right: 16,
          width: 290,
          zIndex: 41,
          borderRadius: 12,
          background: 'var(--sheet)',
          boxShadow: 'var(--sh3)',
          padding: '16px 17px 17px',
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
          animation: 'riseIn .14s ease-out'
        }}
      >
        <div
          style={{
            font: '600 8.5px var(--mono)',
            letterSpacing: '.16em',
            color: 'var(--mute)'
          }}
        >
          SETTINGS
        </div>

        <Toggle
          on={state.flags.showLane}
          label="Lane in the head"
          note="Show which lane or folder the open thing belongs to."
          onClick={() => setFlag('showLane')}
        />
        <Toggle
          on={state.flags.railSticky}
          label="Keep the browser open"
          note="Otherwise it hides again after you pick something."
          onClick={() => setFlag('railSticky')}
        />
        <Toggle
          on={wide}
          label="Wide measure"
          note="A longer line, for tables and dense notes."
          onClick={() => patch({ measure: wide ? MEASURE_DEFAULT : 860 })}
        />

        {/* The marker `==highlights==` are drawn in. Each swatch is the colour
            itself, in the theme you are in. */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
          <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
            <div style={{ font: '500 12.5px var(--sans)', color: 'var(--ink)' }}>Highlight</div>
            <div style={{ font: '400 11px/1.5 var(--sans)', color: 'var(--ink3)' }}>
              The colour of <span style={{ background: 'var(--hl)', color: 'var(--ink)' }}>==marked==</span> words.
            </div>
          </div>
          <div style={{ display: 'flex', gap: 5, flex: 'none', marginTop: 2 }}>
            {HIGHLIGHTS.map((h) => {
              const on = (state.highlight ?? 'yellow') === h.id
              return (
                <div
                  key={h.id}
                  data-hl-pick={h.id}
                  data-on={on ? '1' : undefined}
                  title={h.name}
                  onClick={() => patch({ highlight: h.id })}
                  style={{
                    width: 16,
                    height: 16,
                    borderRadius: '50%',
                    cursor: 'pointer',
                    background: `var(--hl-${h.id})`,
                    boxShadow: on ? '0 0 0 1.5px var(--sheet), 0 0 0 3px var(--ink)' : 'inset 0 0 0 1px var(--edge)'
                  }}
                />
              )
            })}
          </div>
        </div>

        <div style={{ height: 1, background: 'var(--div2)' }} />

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {KEYS.map(([k, what]) => (
            <div key={k} style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
              <div
                style={{
                  width: 44,
                  flex: 'none',
                  font: '400 9.5px var(--mono)',
                  color: 'var(--ink3)'
                }}
              >
                {k}
              </div>
              <div style={{ font: '400 11px var(--sans)', color: 'var(--mute)' }}>{what}</div>
            </div>
          ))}
        </div>

        <div style={{ height: 1, background: 'var(--div2)' }} />

        {/* Models, safety and skills change how the CLI actually runs. They are
            not view preferences, so they are not toggles — they are a surface. */}
        <div
          onClick={onMore}
          data-settings-more="1"
          onMouseEnter={() => setHoverMore(true)}
          onMouseLeave={() => setHoverMore(false)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '7px 8px',
            margin: '0 -8px',
            borderRadius: 7,
            cursor: 'pointer',
            background: hoverMore ? 'var(--hov)' : 'transparent'
          }}
        >
          <div style={{ flex: 1, font: '500 12px var(--sans)', color: 'var(--ink)' }}>
            Models, safety, skills and prompts
          </div>
          <div style={{ font: '400 11px var(--sans)', color: 'var(--mute)' }}>→</div>
        </div>
      </div>
    </>
  )
}
