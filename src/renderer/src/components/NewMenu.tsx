/**
 * What the top bar's `+` asks. The workspace makes two kinds of thing and the
 * button only ever made one of them, so the other had to be found in a rail
 * that may not be open.
 *
 * ⌘T is still a chat with no question asked, and ⌘N is still a note with none:
 * a shortcut is a decision already made; a button is where the decision gets
 * offered. Neither asks for a name any more. A note is named in its own title,
 * once it is open — see `makeUntitled` in App.
 */

interface Props {
  onChat: () => void
  onNote: () => void
  onClose: () => void
}

export default function NewMenu(p: Props): React.JSX.Element {
  const Item = ({
    label,
    hint,
    onClick
  }: {
    label: string
    hint: string
    onClick: () => void
  }): React.JSX.Element => (
    <div
      onClick={onClick}
      className="ctx-item"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '7px 11px',
        cursor: 'pointer',
        font: '500 11.5px var(--sans)',
        color: 'var(--ink)'
      }}
    >
      <div style={{ flex: 1, whiteSpace: 'nowrap' }}>{label}</div>
      <div style={{ font: '400 9px var(--mono)', color: 'var(--mute)', flex: 'none' }}>{hint}</div>
    </div>
  )

  return (
    // Covers the workspace so a click anywhere else closes it, the same way the
    // context menu does.
    <div
      onClick={p.onClose}
      style={{ position: 'fixed', inset: 0, zIndex: 50 }}
      data-new-menu-scrim="1"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === 'Escape') p.onClose()
        }}
        data-new-menu="1"
        style={{
          position: 'absolute',
          top: 46,
          right: 16,
          width: 208,
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
            padding: '5px 11px 6px',
            font: '500 8px var(--mono)',
            letterSpacing: '.12em',
            color: 'var(--mute)'
          }}
        >
          NEW
        </div>
        <Item label="Thread" hint="⌘T" onClick={p.onChat} />
        <Item label="Note" hint="⌘N" onClick={p.onNote} />
      </div>
    </div>
  )
}
