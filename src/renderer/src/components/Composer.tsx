import { useEffect, useRef, useState } from 'react'
import { tokens } from '@shared/contextWindow'
import type { Attachment, ContextUsage, EffortId, ModelDef, SafetyId } from '@shared/types'

const EFFORTS: { id: EffortId; label: string; title: string }[] = [
  { id: 'low', label: 'LOW', title: 'Low — quick answers, minimal tool use' },
  { id: 'mid', label: 'MID', title: 'Mid — the default' },
  { id: 'high', label: 'HIGH', title: 'High — longer reasoning, more tool calls' },
  { id: 'xhigh', label: 'XHIGH', title: 'Extra high — deep reasoning, many tool calls' },
  { id: 'max', label: 'MAX', title: 'Max — no ceiling on reasoning or tool use' }
]

/** One line, and enough that the box stops being an input and becomes a page. */
const MIN_H = 28
const MAX_H = 420

/** What the model can actually be shown. */
const ACCEPT = ['image/png', 'image/jpeg', 'image/gif', 'image/webp']

/**
 * Per message. Each one is a few hundred KB of base64 on the wire and in the
 * transcript, and a turn carrying a dozen screenshots is a context window spent
 * before a word of it is read.
 */
const MAX_IMAGES = 6

interface Props {
  value: string
  onChange: (v: string) => void
  onSend: () => void
  onStop: () => void
  pending: boolean
  active: boolean
  /** This thread's context usage — the status line's own figure. */
  context: ContextUsage | null
  /** Settings → "Show the context meter". Off, the line drops the figure. */
  showCtx: boolean
  /** The pane's own horizontal gutter, which carries the reading measure. */
  padX: string
  models: ModelDef[]
  model: string
  onModel: (id: string) => void
  effort: EffortId
  onEffort: (id: EffortId) => void
  safety: SafetyId
  quote: { label: string; text: string } | null
  onClearQuote: () => void
  /** Persisted composer height; dragged from the top edge. */
  height: number
  onHeight: (h: number) => void
  /** The note the *other* pane is showing, offered as a reference. */
  refNote: { title: string; path: string } | null
  onReference: () => void
  /** Images waiting to go out with the next message. */
  images: Attachment[]
  onImages: (next: Attachment[]) => void
  /** Made a moment ago — it opens with the caret already in it. */
  fresh: number
}

export default function Composer({
  value,
  onChange,
  onSend,
  onStop,
  pending,
  active,
  context,
  showCtx,
  padX,
  models,
  model,
  onModel,
  effort,
  onEffort,
  safety,
  quote,
  onClearQuote,
  height,
  onHeight,
  refNote,
  onReference,
  images,
  onImages,
  fresh
}: Props): React.JSX.Element {
  /**
   * Held locally while dragging and only handed up on release: the persisted
   * value goes through main, and writing it on every pointermove would put a
   * state file write behind every pixel.
   */
  const [h, setH] = useState(height)
  useEffect(() => setH(height), [height])
  const drag = useRef<{ y: number; h: number; id: number } | null>(null)
  const [menu, setMenu] = useState(false)
  const [over, setOver] = useState(false)
  const picker = useRef<HTMLInputElement>(null)
  const field = useRef<HTMLTextAreaElement>(null)

  /**
   * A tab made a moment ago has nothing in it yet, and the next thing anyone
   * does is type — so the caret goes there rather than waiting to be clicked
   * into.
   *
   * A COUNT, not a flag. The composer outlives the tab shown in it, so a
   * boolean that was already true for the last new thread stays true for the
   * next one and the effect never fires again — which is why ⌘T looked fine
   * (focus had never left) while the + menu, which takes focus to open, left
   * the caret on the body. Every new thread bumps the count, so every one of
   * them is a change.
   */
  useEffect(() => {
    if (!fresh) return
    field.current?.focus()
  }, [fresh])

  /**
   * Base64 without the data-URI prefix, which is the form the CLI wants on
   * stdin. `readAsDataURL` is the only reader that gives base64 directly, so
   * the prefix is cut back off rather than round-tripping through bytes.
   */
  const take = (files: File[]): void => {
    const shots = files.filter((f) => ACCEPT.includes(f.type))
    if (!shots.length) return
    void Promise.all(
      shots.map(
        (f) =>
          new Promise<Attachment>((resolve) => {
            const r = new FileReader()
            r.onload = () =>
              resolve({
                mediaType: f.type,
                data: String(r.result).replace(/^data:[^,]*,/, ''),
                name: f.name || 'pasted image'
              })
            r.readAsDataURL(f)
          })
      )
    ).then((next) => onImages([...images, ...next].slice(0, MAX_IMAGES)))
  }
  const wrap = useRef<HTMLDivElement>(null)
  const current = models.find((m) => m.id === model) ?? models[0]

  useEffect(() => {
    if (!menu) return
    const close = (e: MouseEvent): void => {
      if (!wrap.current?.contains(e.target as Node)) setMenu(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [menu])

  const safetyLabel = safety === 'autonomous' ? 'AUTONOMOUS' : safety === 'guarded' ? 'GUARDED' : ''

  /**
   * Every way a drag ends, including the ones that are not a pointerup:
   * `pointercancel` is the system taking the pointer away mid-drag, and
   * `lostpointercapture` covers the element being replaced under it. Without
   * both, a drag that ended off-book left the grip holding for good.
   */
  const endDrag = (e: React.PointerEvent): void => {
    if (!drag.current) return
    drag.current = null
    try {
      e.currentTarget.releasePointerCapture(e.pointerId)
    } catch {
      // Already gone — which is one of the cases this is here to survive.
    }
    onHeight(h)
  }

  /**
   * "SONNET 5 · MEDIUM · GUARDED · 76.4K / 200K" — what this thread is set to,
   * in one line. Safety rides here rather than in a badge of its own: it is a
   * fact about the thread exactly like the other three, and a badge would be a
   * second control saying so.
   */
  const statusLine = [
    current?.name ?? model,
    effort.toUpperCase(),
    safetyLabel,
    showCtx && context
      ? `${(context.used / 1000).toFixed(1)}K / ${tokens(context.window)}`
      : ''
  ]
    .filter(Boolean)
    .join(' · ')

  return (
    <div
      style={{
        flex: 'none',
        position: 'relative',
        borderTop: '1px solid var(--div)',
        padding: `11px ${padX} 13px`,
        display: 'flex',
        flexDirection: 'column',
        gap: 6
      }}
    >
      {/* The composer's top edge is the grab handle. Pointer capture rather
          than window listeners, so a fast drag that outruns the element still
          delivers its moves here — and releases cleanly outside the window. */}
      <div
        onPointerDown={(e) => {
          if (e.button !== 0) return
          e.preventDefault()
          try {
            e.currentTarget.setPointerCapture(e.pointerId)
          } catch {
            // See SplitSeam: capture is an optimisation, not the drag.
          }
          drag.current = { y: e.clientY, h, id: e.pointerId }
        }}
        onPointerMove={(e) => {
          const d = drag.current
          if (!d || d.id !== e.pointerId) return
          // The button is the truth. A pointerup that never arrives — released
          // outside the window, or the capture lost — otherwise leaves this
          // holding, and then merely crossing the grip resizes the composer.
          if (!(e.buttons & 1)) {
            endDrag(e)
            return
          }
          setH(Math.max(MIN_H, Math.min(MAX_H, d.h + (d.y - e.clientY))))
        }}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onLostPointerCapture={endDrag}
        title="Drag to resize"
        className="composer-grip"
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          top: -3,
          height: 7,
          cursor: 'ns-resize',
          zIndex: 2
        }}
      />
      {/*
        The note showing in the other pane, offered as a reference. Ours: the
        design has no such chip because it has no notion of a thread that runs
        where the notes are. Clicking it appends a wikilink rather than the
        body — the CLI runs in the vault and can open the path itself, and
        pasting a whole note spends the context window on something on disk.
      */}
      {refNote ? (
        <div
          onClick={onReference}
          title={`Put a link to ${refNote.path} in this message`}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 7,
            alignSelf: 'flex-start',
            maxWidth: '100%',
            minWidth: 0,
            padding: '4px 8px',
            borderRadius: 7,
            boxShadow: 'inset 0 0 0 1px var(--edge)',
            cursor: 'pointer'
          }}
        >
          <div
            style={{ width: 3, height: 10, borderRadius: 1, background: 'var(--faint)', flex: 'none' }}
          />
          <div
            style={{
              font: '400 10.5px var(--sans)',
              color: 'var(--ink3)',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              minWidth: 0
            }}
          >
            {refNote.title}
          </div>
        </div>
      ) : null}

      {quote ? (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '6px 9px',
            borderRadius: 6,
            background: 'var(--div2)',
            boxShadow: 'inset 2px 0 0 var(--ink)'
          }}
        >
          <div
            style={{
              font: '500 8px var(--mono)',
              letterSpacing: '.16em',
              color: 'var(--ink3)',
              flex: 'none'
            }}
          >
            QUOTING
          </div>
          <div
            style={{
              font: '400 10.5px var(--sans)',
              color: 'var(--ink2)',
              minWidth: 0,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis'
            }}
          >
            {quote.text}
          </div>
          <div
            onClick={onClearQuote}
            title="Drop the quote"
            style={{
              font: '400 10px var(--mono)',
              color: 'var(--mute)',
              cursor: 'pointer',
              flex: 'none'
            }}
          >
            ✕
          </div>
        </div>
      ) : null}

      {images.length ? (
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 6,
            padding: '0 1px 7px',
            minWidth: 0
          }}
        >
          {images.map((a, i) => (
            <div
              key={`${a.name}-${i}`}
              title={`${a.name} — click to remove`}
              onClick={() => onImages(images.filter((_, k) => k !== i))}
              style={{
                position: 'relative',
                width: 46,
                height: 46,
                borderRadius: 5,
                border: '1px solid var(--edge)',
                background: `center / cover no-repeat url("data:${a.mediaType};base64,${a.data}")`,
                cursor: 'pointer',
                flex: 'none'
              }}
            >
              <div
                style={{
                  position: 'absolute',
                  top: -5,
                  right: -5,
                  width: 15,
                  height: 15,
                  borderRadius: '50%',
                  background: 'var(--sheet)',
                  border: '1px solid var(--edge)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  font: '400 9px var(--mono)',
                  color: 'var(--ink3)'
                }}
              >
                ×
              </div>
            </div>
          ))}
        </div>
      ) : null}

      <div
        onDragOver={(e) => {
          // Only for a drag carrying files. An internal tab or note drag has to
          // keep falling through to the pane behind this.
          if (!Array.from(e.dataTransfer.types).includes('Files')) return
          e.preventDefault()
          e.stopPropagation()
          if (!over) setOver(true)
        }}
        onDragLeave={(e) => {
          if (e.currentTarget.contains(e.relatedTarget as Node)) return
          setOver(false)
        }}
        onDrop={(e) => {
          if (!Array.from(e.dataTransfer.types).includes('Files')) return
          e.preventDefault()
          e.stopPropagation()
          setOver(false)
          take(Array.from(e.dataTransfer.files))
        }}
        style={{
          boxSizing: 'border-box',
          width: '100%',
          minWidth: 0,
          display: 'flex',
          alignItems: 'flex-end',
          gap: 10,
          padding: '8px 10px',
          border: `1px solid ${over || active ? 'var(--rule)' : 'var(--edge)'}`,
          borderRadius: 6,
          background: over ? 'var(--chip)' : 'var(--sheet)'
        }}
      >
        <input
          ref={picker}
          type="file"
          accept={ACCEPT.join(',')}
          multiple
          onChange={(e) => {
            take(Array.from(e.target.files ?? []))
            e.target.value = ''
          }}
          style={{ display: 'none' }}
        />
        <div
          onClick={() => picker.current?.click()}
          title="Attach an image — or paste one, or drop one here"
          className="hoverable"
          style={{
            width: 22,
            height: 22,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            border: '1px solid var(--edge)',
            borderRadius: 5,
            background: 'var(--sheet)',
            color: 'var(--ink3)',
            cursor: 'pointer',
            flex: 'none'
          }}
        >
          <svg
            width="12"
            height="12"
            viewBox="0 0 14 14"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.2"
            strokeLinejoin="round"
          >
            <rect x="1.6" y="2.6" width="10.8" height="8.8" rx="1.4" />
            <path d="M1.9 9.2l3-2.8 2.4 2.2 2-1.7 2.4 2.2" />
            <circle cx="5" cy="5.4" r="1" />
          </svg>
        </div>
        <textarea
          ref={field}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onPaste={(e) => {
            const files = Array.from(e.clipboardData.files)
            if (!files.length) return
            // Only when there is actually an image on the clipboard, so pasting
            // text that happens to travel with one still pastes the text.
            if (!files.some((f) => ACCEPT.includes(f.type))) return
            e.preventDefault()
            take(files)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              onSend()
            }
          }}
          placeholder={pending ? 'Claude is working — Enter queues your next message' : 'Reply'}
          rows={1}
          style={{
            flex: 1,
            minWidth: 0,
            height: h,
            // Only worth scrolling once it has been dragged taller than a line.
            overflowY: h > MIN_H ? 'auto' : 'hidden',
            font: '400 12px/1.5 var(--sans)',
            padding: 0,
            background: 'transparent'
          }}
        />
        <div
          onClick={pending ? onStop : onSend}
          style={{
            font: '500 10.5px var(--sans)',
            color: 'var(--onInk)',
            background: 'var(--ink)',
            borderRadius: 5,
            padding: '6px 10px',
            cursor: 'pointer',
            flex: 'none',
            whiteSpace: 'nowrap'
          }}
        >
          {pending ? 'Stop' : 'Send ↵'}
        </div>
      </div>

      {menu ? (
        <div
          ref={wrap}
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 13,
            padding: '14px 16px 15px',
            margin: '0 0 4px',
            borderRadius: 9,
            background: 'var(--sheet)',
            boxShadow: 'var(--sh4)',
            animation: 'riseIn .14s ease-out'
          }}
        >
          <ChipRow
            label="MODEL"
            options={models.map((m) => ({ id: m.id, label: m.name, note: m.note }))}
            value={model}
            onPick={(id) => onModel(id)}
          />
          <ChipRow
            label="EFFORT"
            options={EFFORTS.map((e) => ({ id: e.id, label: e.label, note: e.title }))}
            value={effort}
            onPick={(id) => onEffort(id as EffortId)}
          />
          <div style={{ font: '400 10.5px/1.5 var(--sans)', color: 'var(--mute)' }}>
            Model and effort are per thread. Safety is set for every thread in
            Settings.
          </div>
        </div>
      ) : null}

      {/*
        The status text IS the control.
        
        It collapses the model picker, the effort chips, the safety badge
        and the hint into one line that says what this thread is set to, and
        opens all of it when clicked. Four controls saying four things became
        one sentence saying them together — and it has room for the context
        figure, which had nowhere to live before.
      */}
      <div
        data-status-line="1"
        onClick={() => setMenu((v) => !v)}
        // The dismisser listens on `document`, so without this the line's own
        // mousedown would close the panel a beat before its click reopened it,
        // and the toggle would never toggle off.
        onMouseDown={(e) => e.stopPropagation()}
        title="Model, effort and context for this thread"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          cursor: 'pointer',
          alignSelf: 'flex-start',
          maxWidth: '100%',
          minWidth: 0
        }}
      >
        <div
          style={{
            font: '400 9px var(--mono)',
            letterSpacing: '.11em',
            color: 'var(--mute)',
            fontVariantNumeric: 'tabular-nums',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            minWidth: 0
          }}
        >
          {statusLine}
        </div>
        {showCtx && context ? (
          <div
            style={{
              width: 52,
              height: 2,
              borderRadius: 2,
              background: 'var(--chip)',
              overflow: 'hidden',
              flex: 'none'
            }}
          >
            <div
              style={{
                width: `${Math.min(100, Math.round((context.used / context.window) * 100))}%`,
                height: '100%',
                // Loud only when it is nearly gone: contrast is the ramp, since
                // there is no hue left to warn with.
                background:
                  context.used / context.window >= 0.9 ? 'var(--ink)' : 'var(--mute)'
              }}
            />
          </div>
        ) : null}
      </div>
    </div>
  )
}
/**
 * One labelled row of chips. Selected is an `--ink` fill with `--onInk` on it;
 * everything else is an outline. No hue, so the fill is the whole signal.
 */
function ChipRow({
  label,
  options,
  value,
  onPick
}: {
  label: string
  options: { id: string; label: string; note?: string }[]
  value: string
  onPick: (id: string) => void
}): React.JSX.Element {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div
        style={{
          font: '600 8.5px var(--mono)',
          letterSpacing: '.16em',
          color: 'var(--mute)'
        }}
      >
        {label}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {options.map((o) => {
          const on = o.id === value
          return (
            <div
              key={o.id}
              onClick={(e) => {
                e.stopPropagation()
                onPick(o.id)
              }}
              data-chip={label.toLowerCase()}
              data-chip-id={o.id}
              data-chip-on={on ? '1' : '0'}
              title={o.note}
              style={{
                padding: '6px 11px',
                borderRadius: 7,
                background: on ? 'var(--ink)' : 'transparent',
                boxShadow: on ? 'none' : 'inset 0 0 0 1px var(--edge)',
                font: `${on ? 600 : 400} 11.5px var(--sans)`,
                color: on ? 'var(--onInk)' : 'var(--ink2)',
                cursor: 'pointer',
                whiteSpace: 'nowrap'
              }}
            >
              {o.label}
            </div>
          )
        })}
      </div>
    </div>
  )
}
