import type { FoundFile } from '@shared/types'

/**
 * What can be done to a file or a folder a note or a thread names — from a
 * right-click on the path as it was written.
 *
 * Its own menu, as `PathMenu` is: `ContextMenu` is about the things the rail
 * lists, and a file outside them has exactly two things to say about it. Every
 * place it was found is listed, by its folder, with both under it — a name two
 * folders share is not this menu's to guess between. Nothing found says so,
 * rather than the right-click doing nothing.
 */
export interface FileTarget {
  /** As it was written. */
  text: string
  found: FoundFile[]
  more: number
  x: number
  y: number
}

interface Props {
  target: FileTarget
  onOpen: (f: FoundFile) => void
  onReveal: (f: FoundFile) => void
  onClose: () => void
}

const Item = ({
  children,
  onClick,
  hint
}: {
  children: React.ReactNode
  onClick: () => void
  hint?: string
}): React.JSX.Element => (
  <div
    onClick={onClick}
    className="ctx-item"
    data-file-item="1"
    style={{
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      padding: '6px 11px',
      cursor: 'pointer',
      font: '500 11.5px var(--sans)',
      color: 'var(--ink)',
      whiteSpace: 'nowrap'
    }}
  >
    <div style={{ flex: 1, minWidth: 0 }}>{children}</div>
    {hint ? (
      <div
        style={{
          font: '400 9px var(--mono)',
          color: 'var(--mute)',
          flex: 'none'
        }}
      >
        {hint}
      </div>
    ) : null}
  </div>
)

const Rule = (): React.JSX.Element => (
  <div style={{ height: 1, background: 'var(--div2)', margin: '4px 0' }} />
)

const quiet: React.CSSProperties = {
  font: '400 9px var(--mono)',
  color: 'var(--mute)',
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis'
}

export default function FileMenu(p: Props): React.JSX.Element {
  const { found } = p.target
  const kind = !found.length ? 'PATH' : found.every((f) => f.dir) ? 'FOLDER' : 'FILE'
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
        data-file-menu="1"
        onClick={(e) => e.stopPropagation()}
        style={{
          position: 'absolute',
          left: p.target.x,
          top: p.target.y,
          width: 256,
          background: 'var(--sheet)',
          borderRadius: 6,
          boxShadow: 'var(--sh4)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          padding: '4px 0'
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 7,
            padding: '5px 11px 6px'
          }}
        >
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
            {kind}
          </div>
          <div style={{ ...quiet, flex: 1, minWidth: 0 }}>{p.target.text}</div>
        </div>
        {!found.length ? (
          <div
            data-file-none="1"
            style={{
              padding: '4px 11px 7px',
              font: '400 11.5px var(--sans)',
              color: 'var(--ink3)'
            }}
          >
            Not found on this Mac
          </div>
        ) : (
          found.map((f) => (
            <div key={f.path} data-file-place={f.path} style={{ display: 'flex', flexDirection: 'column' }}>
              <Rule />
              {/* Where it is, always: one place is still a place you may not
                  have expected, and several are only told apart by it. */}
              <div title={f.path} style={{ ...quiet, padding: '3px 11px 2px' }}>
                {f.where}
              </div>
              {f.open === 'none' ? null : (
                <Item onClick={() => p.onOpen(f)} hint={f.open === 'text' ? 'as text' : undefined}>
                  Open
                </Item>
              )}
              <Item onClick={() => p.onReveal(f)}>Show in Finder</Item>
            </div>
          ))
        )}
        {p.target.more ? (
          <div style={{ ...quiet, padding: '4px 11px 3px' }}>and {p.target.more} more of the same name</div>
        ) : null}
      </div>
    </div>
  )
}
