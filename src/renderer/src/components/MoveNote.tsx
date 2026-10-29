import { useEffect, useMemo, useRef, useState } from 'react'

/**
 * Where a note lives, changed from the head that states it.
 *
 * A folder picker rather than a free text field: the vault already has folders,
 * and the ones it has are almost always the answer. Typing filters them, and a
 * name that matches nothing is offered as a new folder — the same shape the
 * palette uses for a note that does not exist yet, because it is the same
 * question ("this, or something new by this name?").
 */
export default function MoveNote({
  title,
  from,
  folders,
  onMove,
  onClose
}: {
  title: string
  /** The folder it is in now, so the list can say which one that is. */
  from: string
  folders: string[]
  onMove: (folder: string) => void
  onClose: () => void
}): React.JSX.Element {
  const [q, setQ] = useState('')
  const [sel, setSel] = useState(0)
  const field = useRef<HTMLInputElement>(null)
  useEffect(() => field.current?.focus(), [])

  const rows = useMemo(() => {
    const query = q.trim().toLowerCase()
    const all = ['', ...folders].filter((f, i, xs) => xs.indexOf(f) === i)
    const hits = query ? all.filter((f) => f.toLowerCase().includes(query)) : all
    const typed = q.trim().replace(/^\/+|\/+$/g, '')
    // A folder nobody has yet is a real answer, and making it is one keystroke.
    const isNew = typed && !all.some((f) => f.toLowerCase() === typed.toLowerCase())
    return [...hits.slice(0, 8).map((f) => ({ folder: f, isNew: false })), ...(isNew ? [{ folder: typed, isNew: true }] : [])]
  }, [q, folders])

  const at = Math.min(sel, Math.max(0, rows.length - 1))
  const label = (f: string): string => f || 'the vault root'

  return (
    <div
      onClick={onClose}
      onContextMenu={(e) => {
        e.preventDefault()
        onClose()
      }}
      style={{ position: 'fixed', inset: 0, zIndex: 60 }}
    >
      <div
        data-move-note="1"
        onClick={(e) => e.stopPropagation()}
        style={{
          position: 'absolute',
          left: '50%',
          top: '22%',
          transform: 'translateX(-50%)',
          width: 340,
          borderRadius: 10,
          background: 'var(--sheet)',
          boxShadow: 'var(--sh2)',
          overflow: 'hidden',
          animation: 'riseIn .14s ease-out'
        }}
      >
        <div style={{ padding: '11px 13px 9px', display: 'flex', flexDirection: 'column', gap: 3 }}>
          <div
            style={{
              font: '600 8.5px var(--mono)',
              letterSpacing: '.16em',
              color: 'var(--faint)'
            }}
          >
            MOVE TO
          </div>
          <div
            style={{
              font: '400 11.5px var(--sans)',
              color: 'var(--ink2)',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis'
            }}
          >
            {title}
          </div>
        </div>
        <div style={{ padding: '0 13px 10px' }}>
          <input
            ref={field}
            value={q}
            onChange={(e) => {
              setQ(e.target.value)
              setSel(0)
            }}
            onKeyDown={(e) => {
              e.stopPropagation()
              if (e.key === 'Escape') onClose()
              if (e.key === 'ArrowDown') setSel((n) => Math.min(rows.length - 1, n + 1))
              if (e.key === 'ArrowUp') setSel((n) => Math.max(0, n - 1))
              if (e.key === 'Enter' && rows[at]) onMove(rows[at].folder)
            }}
            placeholder="A folder, or a new one"
            spellCheck={false}
            style={{
              width: '100%',
              height: 28,
              padding: '0 9px',
              borderRadius: 7,
              background: 'var(--washOn)',
              font: '400 11.5px var(--sans)',
              color: 'var(--ink)'
            }}
          />
        </div>
        <div style={{ maxHeight: 260, overflowY: 'auto', overflowX: 'hidden', padding: '0 5px 6px' }}>
          {rows.map((r, i) => (
            <div
              key={`${r.isNew ? 'new:' : ''}${r.folder}`}
              data-move-row={r.folder}
              onMouseEnter={() => setSel(i)}
              onClick={() => onMove(r.folder)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 9,
                height: 28,
                padding: '0 8px',
                borderRadius: 7,
                cursor: 'pointer',
                background: i === at ? 'var(--quiet)' : 'transparent'
              }}
            >
              <div
                style={{
                  flex: 1,
                  minWidth: 0,
                  font: '400 11.5px var(--sans)',
                  color: r.folder === from ? 'var(--mute)' : 'var(--ink2)',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis'
                }}
              >
                {r.isNew ? `Make “${r.folder}”` : label(r.folder)}
              </div>
              {r.folder === from && !r.isNew ? (
                <div style={{ font: '400 9px var(--mono)', color: 'var(--faint)', flex: 'none' }}>
                  HERE NOW
                </div>
              ) : null}
            </div>
          ))}
          {!rows.length ? (
            <div style={{ padding: '8px 8px 10px', font: '400 11px var(--sans)', color: 'var(--mute)' }}>
              No folder by that name. Type one to make it.
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}
