import { useState } from 'react'

/**
 * What can be done to one path of a thread, from the seam that names it.
 *
 * Its own menu rather than a third kind in `ContextMenu`: that one is about
 * OBJECTS — a chat, a note, the things the rail lists — and a path is not one of
 * those. It is a way a conversation went, and there are exactly two things to
 * say about it.
 */
export interface PathTarget {
  id: string
  /** What the seam calls it: its opening words, or a name it was given. */
  label: string
  /** True for a path that can be let go — a thread's own first one cannot. */
  removable: boolean
  x: number
  y: number
}

interface Props {
  target: PathTarget
  onRead: () => void
  /** Empty clears the name, and the path goes back to its opening words. */
  onRename: (label: string) => void
  onTrash: () => void
  onClose: () => void
}

const Item = ({
  children,
  onClick,
  color = 'var(--ink)'
}: {
  children: React.ReactNode
  onClick: () => void
  color?: string
}): React.JSX.Element => (
  <div
    onClick={onClick}
    className="ctx-item"
    style={{
      padding: '6px 11px',
      cursor: 'pointer',
      font: '500 11.5px var(--sans)',
      color,
      whiteSpace: 'nowrap'
    }}
  >
    {children}
  </div>
)

export default function PathMenu(p: Props): React.JSX.Element {
  const [naming, setNaming] = useState(false)
  // A path that has a name of its own offers it to be edited; one that is going
  // by its opening words starts empty, since those are not a name to correct.
  const [draft, setDraft] = useState('')
  return (
    <div
      onClick={p.onClose}
      onContextMenu={(e) => {
        e.preventDefault()
        p.onClose()
      }}
      style={{ position: 'absolute', inset: 0, zIndex: 45 }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          position: 'absolute',
          left: p.target.x,
          top: p.target.y,
          width: 196,
          background: 'var(--sheet)',
          borderRadius: 6,
          boxShadow: 'var(--sh4)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          padding: '4px 0'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '5px 11px 6px' }}>
          <div
            style={{
              font: '500 8px var(--mono)',
              letterSpacing: '.12em',
              color: 'var(--mute)',
              border: '1px solid var(--edge)',
              borderRadius: 3,
              padding: '1px 4px',
              flex: 'none'
            }}
          >
            PATH
          </div>
          <div
            style={{
              flex: 1,
              minWidth: 0,
              font: '400 9px var(--mono)',
              color: 'var(--mute)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap'
            }}
          >
            {p.target.label || 'unwritten'}
          </div>
        </div>
        <div style={{ height: 1, background: 'var(--div2)', margin: '4px 0' }} />
        {naming ? (
          /*
           * The field opens inside the menu rather than out on the seam. A seam
           * is a hairline with words sitting on it — there is nowhere on it to
           * put a field without the rule moving, and a landmark that jumps when
           * you right-click it is worse than one you name somewhere else.
           */
          <input
            autoFocus
            value={draft}
            placeholder="Its opening words"
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                p.onRename(draft)
                p.onClose()
              }
              if (e.key === 'Escape') setNaming(false)
              e.stopPropagation()
            }}
            style={{
              margin: '2px 8px 6px',
              padding: '4px 6px',
              background: 'var(--well)',
              border: '1px solid var(--edge)',
              borderRadius: 4,
              outline: 'none',
              font: '400 11.5px var(--sans)',
              color: 'var(--ink)'
            }}
          />
        ) : (
          <>
            <Item onClick={p.onRead}>Read this path</Item>
            <Item onClick={() => setNaming(true)}>Name this path…</Item>
          </>
        )}
        {/*
          Absent rather than disabled for a thread's root: a menu item nobody
          can use is a question the reader has to answer every time they see it.
        */}
        {p.target.removable ? (
          <>
            <div style={{ height: 1, background: 'var(--div2)', margin: '4px 0' }} />
            <Item onClick={p.onTrash} color="var(--ink)">
              Let this path go
            </Item>
          </>
        ) : null}
      </div>
    </div>
  )
}
