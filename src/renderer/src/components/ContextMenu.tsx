import type { LaneDef, LaneId } from '@shared/types'
import { laneLabel } from '@shared/lanes'

export interface CtxTarget {
  kind: 'chat' | 'note'
  id: string
  title: string
  x: number
  y: number
}

interface Props {
  ctx: CtxTarget
  split: boolean
  /** None is an answer: the menu then offers no move. */
  lanes: LaneDef[]
  /** The chat's current lane, so the menu can tick it. */
  currentLane: LaneId | null
  /** Starred, the one word for the one store. */
  marked: boolean
  /** Open it where its kind belongs, reusing the current tab. */
  onOpen: () => void
  /** Same target, in a tab of its own. */
  onOpenNewTab: () => void
  /** Chats only — a note's name is its file's. */
  onRename: (() => void) | null
  onMoveLane: (lane: LaneId) => void
  onToggleMark: () => void
  /** Notes only — starts a chat attached to this note, in the focused pane. */
  onNewChat: () => void
  /** Notes only — a note is a file, and sometimes the file is the point. */
  onReveal: () => void
  /** The note as a PDF, drawn the way READ draws it. Opens a save panel. */
  onExportPdf: () => void
  /** Notes only — the file, its heading and every wikilink aimed at it. */
  onRenameNote: () => void
  onMoveNote: () => void
  /** Notes only — to the system Trash, where it can be got back. */
  onTrashNote: () => void
  onClose: () => void
}

const Item = ({
  children,
  onClick,
  hint,
  color = 'var(--ink)',
  pad = '6px 11px'
}: {
  children: React.ReactNode
  onClick: () => void
  hint?: string
  color?: string
  pad?: string
}): React.JSX.Element => (
  <div
    onClick={onClick}
    className="ctx-item"
    style={{
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      padding: pad,
      cursor: 'pointer',
      font: '500 11.5px var(--sans)',
      color
    }}
  >
    <div style={{ flex: 1, minWidth: 0, whiteSpace: 'nowrap' }}>{children}</div>
    {hint ? (
      <div style={{ font: '400 9px var(--mono)', color: 'var(--mute)', flex: 'none' }}>{hint}</div>
    ) : null}
  </div>
)

const Rule = (): React.JSX.Element => (
  <div style={{ height: 1, background: 'var(--div2)', margin: '4px 0' }} />
)

export default function ContextMenu(p: Props): React.JSX.Element {
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
        data-ctx-menu="1"
        onClick={(e) => e.stopPropagation()}
        style={{
          position: 'absolute',
          left: p.ctx.x,
          top: p.ctx.y,
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
            {p.ctx.kind === 'chat' ? 'CHAT' : 'NOTE'}
          </div>
          <div
            style={{
              flex: 1,
              minWidth: 0,
              font: '400 9px var(--mono)',
              color: 'var(--mute)',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis'
            }}
          >
            {p.ctx.title}
          </div>
        </div>

        {/*
          One row, not two. Panes are role-assigned now, so there is no pane to
          choose: a thread opens in the thread pane and a note in the note pane,
          whichever of them you asked from. Two rows that did the same thing
          would be the menu lying about what it can do.
        */}
        <Item onClick={() => p.onOpen()} hint={p.ctx.kind === 'note' ? 'note pane' : 'thread pane'}>
          Open
        </Item>
        <Item onClick={() => p.onOpenNewTab()} hint="new tab">
          Open in a new tab
        </Item>

        {p.ctx.kind === 'note' ? (
          <>
            <Rule />
            <Item onClick={p.onNewChat}>New thread on this note</Item>
            <Rule />
            <Item onClick={p.onRenameNote}>Rename…</Item>
            <Item onClick={p.onMoveNote}>Move to…</Item>
            <Rule />
            <Item onClick={p.onToggleMark}>{p.marked ? 'Unstar' : 'Star'}</Item>
            <Item onClick={p.onReveal}>Show in Finder</Item>
            <Item onClick={p.onExportPdf}>Export as PDF…</Item>
            {/* Last, after a rule, and named for where it goes: the Trash is
                recoverable, and saying so is the difference between a delete
                you can undo and one you have to be sure about. */}
            <Rule />
            <Item onClick={p.onTrashNote}>Move to Trash</Item>
          </>
        ) : (
          <>
            <Rule />
            {p.onRename ? <Item onClick={p.onRename}>Rename…</Item> : null}
            {/* Threads are starrable too now: the Starred card holds both kinds,
                so a menu that offered this only for notes was hiding half the
                store it writes to. */}
            <Item onClick={p.onToggleMark}>
              {p.marked ? 'Unstar this thread' : 'Star this thread'}
            </Item>
            {/* With no lanes there is nowhere to move it, so no heading over nothing. */}
            {p.lanes.length ? (
              <>
                <Rule />
                <div
                  style={{
                    padding: '4px 11px 5px',
                    font: '500 8.5px var(--mono)',
                    letterSpacing: '.13em',
                    color: 'var(--mute)'
                  }}
                >
                  MOVE TO LANE
                </div>
              </>
            ) : null}
            {p.lanes.map((l) => (
              <div
                key={l.id}
                onClick={() => p.onMoveLane(l.id)}
                className="ctx-item"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '5px 11px',
                  cursor: 'pointer',
                  font: '500 11.5px var(--sans)',
                  color: l.id === p.currentLane ? 'var(--ink)' : 'var(--ink2)'
                }}
              >
                {/* A lane is a word now, not a hue. The tick is what says
                    which one this thread is in. */}
                <div
                  style={{
                    flex: 1,
                    minWidth: 0,
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis'
                  }}
                >
                  {laneLabel(l)}
                </div>
                <div style={{ font: '400 9px var(--mono)', color: 'var(--ink)', flex: 'none' }}>
                  {l.id === p.currentLane ? '✓' : ''}
                </div>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  )
}
