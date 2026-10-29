import { useState, type CSSProperties } from 'react'
import type { MessageBlock, ToolBlock } from '@shared/types'
import Runs from './Runs'
import Doc from './Doc'
import CopyChip from './CopyChip'

/* Every value here is lifted from the prototype markup and is deliberate. */

const S = {
  monoLabel: {
    font: "500 8px var(--mono)",
    letterSpacing: '.16em',
    color: 'var(--ink3)'
  } as CSSProperties,
  badge: {
    flex: 'none',
    padding: '1px 5px',
    borderRadius: 3,
    background: 'var(--ink)',
    font: "500 8px var(--mono)",
    letterSpacing: '.08em',
    color: 'var(--onInk)'
  } as CSSProperties,
  /* A quieted tool call: no card, and a row whose only affordance is the
     opacity lift in .tool-row. Shared so the single call and the grouped run
     cannot drift apart. */
  toolWrap: {
    display: 'flex',
    flexDirection: 'column',
    margin: '3px 0',
    overflow: 'hidden'
  } as CSSProperties,
  toolRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 7,
    padding: '2px 0',
    cursor: 'pointer'
  } as CSSProperties
}

function RuleView({ label, text }: { label: string; text: string }): React.JSX.Element {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
        background: 'var(--sheet)',
        borderRadius: 6,
        boxShadow: 'inset 2px 0 0 var(--ink)',
        padding: '8px 11px',
        margin: '2px 0'
      }}
    >
      {label ? <div style={S.monoLabel}>{label}</div> : null}
      <div style={{ font: '400 var(--msg-sm)/1.6 var(--sans)', color: 'var(--ink)', textWrap: 'pretty' }}>
        <Runs text={text} />
      </div>
    </div>
  )
}

function QuoteView({ label, text }: { label: string; text: string }): React.JSX.Element {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
        background: 'var(--div2)',
        borderRadius: 6,
        boxShadow: 'inset 2px 0 0 var(--edge)',
        padding: '7px 10px',
        margin: '2px 0'
      }}
    >
      <div style={{ ...S.monoLabel, color: 'var(--ink3)' }}>FROM NOTE · {label}</div>
      <div style={{ font: '400 11px/1.6 var(--sans)', color: 'var(--ink2)', textWrap: 'pretty' }}>
        <Runs text={text} />
      </div>
    </div>
  )
}

function TableView({ head, rows }: { head: string[]; rows: string[][] }): React.JSX.Element {
  const flexFor = (i: number): number => (i === 0 ? 1 : 1.4)
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        border: '1px solid var(--edge)',
        borderTop: '1px solid var(--rule)',
        borderRadius: 6,
        overflow: 'hidden',
        margin: '3px 0 2px'
      }}
    >
      <div
        style={{
          display: 'flex',
          borderBottom: '1px solid var(--edge)',
          background: 'var(--card)'
        }}
      >
        {head.map((h, i) => (
          <div
            key={i}
            style={{
              flex: flexFor(i),
              minWidth: 0,
              padding: '5px 9px',
              font: '500 8px var(--mono)',
              letterSpacing: '.12em',
              color: 'var(--ink3)'
            }}
          >
            {h}
          </div>
        ))}
      </div>
      {rows.map((row, r) => (
        <div key={r} style={{ display: 'flex', borderBottom: '1px solid var(--div)' }}>
          {row.map((c, i) => (
            <div
              key={i}
              style={{
                flex: flexFor(i),
                minWidth: 0,
                padding: '6px 9px',
                font: i === 0 ? '400 10px var(--mono)' : '400 var(--msg-sm) var(--sans)',
                color: i === 0 ? 'var(--ink)' : 'var(--ink2)',
                lineHeight: 1.5
              }}
            >
              <Runs text={c} />
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}

function ToolView({ block }: { block: ToolBlock }): React.JSX.Element {
  const [open, setOpen] = useState(false)
  return (
    <div style={S.toolWrap}>
      {/*
        THE COMMAND IS ONLY EVER HERE, and only ever as much of it as one
        ellipsised line holds — opening the row shows the OUTPUT, not the call.
        So this is the one place a copy gives you strictly more than the screen
        does: the whole command, including the part that was cut off. It covers
        that tail while the pointer is on the row, which costs nothing, because
        the tail was already not being shown.
      */}
      <div className="copy-host" style={{ position: 'relative', minWidth: 0 }}>
        <CopyChip text={block.cmd} title="Copy this command" />
      <div
        onClick={() => setOpen((v) => !v)}
        className="tool-row"
        style={S.toolRow}
      >
        <div
          style={{
            flex: 'none',
            font: '600 8.5px var(--mono)',
            letterSpacing: '.13em',
            textTransform: 'uppercase',
            color: 'var(--mute)'
          }}
        >
          {block.name}
        </div>
        <div
          style={{
            flex: 1,
            minWidth: 0,
            font: `${block.isError ? 600 : 400} 9.5px var(--mono)`,
            // A failure is the one thing a quieted row still has to say out
            // loud, and it says it by weight: monotonic by contrast, the same
            // ladder `~blocked` and `~active` use.
            color: block.isError ? 'var(--ink)' : 'var(--ink3)',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis'
          }}
        >
          {block.cmd}
        </div>
        {block.running ? (
          <div style={{ font: '400 9px var(--mono)', color: 'var(--mute)', flex: 'none' }}>···</div>
        ) : null}
      </div>
      </div>
      {open ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: '4px 0 6px' }}>
          <div className="copy-host" style={{ position: 'relative', minWidth: 0 }}>
            {/* Only where there is something to take: `running…` and `no
                output` are this app's words, not the tool's. */}
            {block.out ? <CopyChip text={block.out} title="Copy this output" /> : null}
            <div
              style={{
                background: 'var(--code)',
                borderRadius: 7,
                padding: '12px 14px',
                font: '400 11.5px/1.75 var(--mono)',
                color: 'var(--ink3)',
                whiteSpace: 'pre-wrap',
                overflowX: 'auto'
              }}
            >
              {block.out || (block.running ? 'running…' : 'no output')}
            </div>
          </div>
          {block.children.map((ch, i) => (
            <div
              key={i}
              style={{
                marginLeft: 9,
                paddingLeft: 8,
                display: 'flex',
                alignItems: 'center',
                gap: 7,
                opacity: 0.72
              }}
            >
              <div
                style={{
                  flex: 'none',
                  font: '400 8px var(--mono)',
                  letterSpacing: '.08em',
                  color: 'var(--mute)'
                }}
              >
                {ch.name}
              </div>
              <div
                style={{
                  flex: 1,
                  minWidth: 0,
                  font: '400 9.5px var(--mono)',
                  color: 'var(--mute)',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis'
                }}
              >
                {ch.cmd}
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  )
}

/**
 * A run of consecutive tool calls, collapsed into one row. Expands to the
 * individual rows, each still openable for its own output.
 *
 * It forces itself open while anything inside is still running, so a long turn
 * keeps showing progress; once the turn lands it settles closed again — unless
 * the reader opened it themselves, in which case it stays as they left it.
 *
 * The design has no group — it draws single calls only — so this follows the
 * same quieting by hand rather than being left as the last card standing.
 */
function ToolGroupView({ tools }: { tools: ToolBlock[] }): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const [touched, setTouched] = useState(false)

  const running = tools.filter((t) => t.running).length
  const failed = tools.filter((t) => t.isError).length
  const show = running > 0 && !touched ? true : open

  // Distinct tool names, in the order they ran.
  const names: string[] = []
  for (const t of tools) if (!names.includes(t.name)) names.push(t.name)

  return (
    <div style={S.toolWrap}>
      <div
        onClick={() => {
          setTouched(true)
          setOpen(!show)
        }}
        className="tool-row"
        style={S.toolRow}
      >
        <div
          style={{
            flex: 'none',
            font: '600 8.5px var(--mono)',
            letterSpacing: '.13em',
            color: 'var(--mute)',
            whiteSpace: 'nowrap'
          }}
        >
          {tools.length} STEPS{running ? ' · RUNNING' : ''}
        </div>
        <div
          style={{
            flex: 1,
            minWidth: 0,
            font: '400 9.5px var(--mono)',
            letterSpacing: '.08em',
            color: 'var(--ink3)',
            textTransform: 'uppercase',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis'
          }}
        >
          {names.join(' · ')}
        </div>
        {failed ? (
          <div
            style={{
              flex: 'none',
              font: '600 9px var(--mono)',
              letterSpacing: '.13em',
              color: 'var(--ink)',
              whiteSpace: 'nowrap'
            }}
          >
            {failed} FAILED
          </div>
        ) : null}
      </div>
      {show ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, padding: '2px 0 4px 9px' }}>
          {tools.map((t) => (
            <ToolView key={t.id} block={t} />
          ))}
        </div>
      ) : null}
    </div>
  )
}

export function ToolGroup({ tools }: { tools: ToolBlock[] }): React.JSX.Element {
  // A lone call reads better as itself than as a group of one.
  if (tools.length === 1) return <ToolView block={tools[0]} />
  return <ToolGroupView tools={tools} />
}

function CodeView({
  name,
  cmd,
  out
}: {
  name: string
  cmd: string
  out: string
}): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const firstLine = cmd.split('\n')[0]
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        border: '1px solid var(--edge)',
        borderRadius: 6,
        overflow: 'hidden',
        background: 'var(--sheet)',
        margin: '2px 0'
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '4px 7px',
          borderBottom: '1px solid var(--div2)'
        }}
      >
        <div style={S.badge}>{name}</div>
        <div style={{ flex: 1 }} />
        <div
          onClick={() => setOpen((v) => !v)}
          style={{ font: '400 9px var(--mono)', color: 'var(--mute)', cursor: 'pointer' }}
        >
          {open ? 'hide script' : 'show script'}
        </div>
      </div>
      {open ? (
        <div className="copy-host" style={{ position: 'relative', minWidth: 0 }}>
          <CopyChip text={cmd} title="Copy this script" />
          <div
            style={{
              padding: '7px 9px',
              font: '400 9.5px/1.6 var(--mono)',
              color: 'var(--ink2)',
              whiteSpace: 'pre-wrap',
              overflowX: 'auto'
            }}
          >
            {cmd}
          </div>
        </div>
      ) : (
        <div
          style={{
            padding: '5px 9px',
            font: '400 9.5px var(--mono)',
            color: 'var(--ink3)',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis'
          }}
        >
          {firstLine}
        </div>
      )}
      {out ? (
        <div
          className="copy-host"
          style={{ position: 'relative', minWidth: 0, borderTop: '1px solid var(--div2)' }}
        >
          <CopyChip text={out} title="Copy this output" />
          <div
            style={{
              padding: '6px 9px',
              font: '400 9.5px/1.55 var(--mono)',
              color: 'var(--ink3)',
              whiteSpace: 'pre-wrap'
            }}
          >
            {out}
          </div>
        </div>
      ) : null}
    </div>
  )
}

/**
 * An image in a turn, at the size it can be read at rather than the size it
 * was captured at — a screenshot is usually far wider than a pane. Clicking it
 * opens it full size, which is the one thing a thumbnail cannot do for you.
 */
function ImageView({
  mediaType,
  data,
  name
}: {
  mediaType: string
  data: string
  name: string
}): React.JSX.Element {
  const [big, setBig] = useState(false)
  const src = `data:${mediaType};base64,${data}`
  return (
    <>
      <img
        src={src}
        alt={name}
        title={`${name} — click to see it full size`}
        onClick={() => setBig(true)}
        style={{
          display: 'block',
          maxWidth: '100%',
          maxHeight: 320,
          width: 'auto',
          borderRadius: 5,
          border: '1px solid var(--edge)',
          background: 'var(--card)',
          cursor: 'zoom-in',
          margin: '3px 0'
        }}
      />
      {big ? (
        <div
          onClick={() => setBig(false)}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 60,
            background: 'var(--veil)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 32,
            cursor: 'zoom-out'
          }}
        >
          <img
            src={src}
            alt={name}
            style={{
              maxWidth: '100%',
              maxHeight: '100%',
              borderRadius: 6,
              boxShadow: 'var(--sh4)'
            }}
          />
        </div>
      ) : null}
    </>
  )
}

export function BlockView({
  block,
  scale = 1
}: {
  block: MessageBlock
  /** Text size. Prose after a tool call is prose too. */
  scale?: number
}): React.JSX.Element | null {
  switch (block.kind) {
    case 'text':
      // Through the document engine, not a paragraph of its own: a turn is a
      // document, and its headings, lists, tasks and tables are the same ones a
      // note has. Rendering them twice, two ways, is what made a heading in a
      // reply come out as bare prose while the identical text in a note did not.
      return <Doc body={block.text} path="" scale={scale} />
    case 'list':
      return <Doc body={block.items.map((t, i) => `${i + 1}. ${t}`).join('\n')} path="" scale={scale} />
    case 'bullets':
      return <Doc body={block.items.map((t) => `- ${t}`).join('\n')} path="" scale={scale} />
    case 'rule':
      return <RuleView label={block.label} text={block.text} />
    case 'quote':
      return <QuoteView label={block.label} text={block.text} />
    case 'table':
      return <TableView head={block.head} rows={block.rows} />
    case 'tool':
      return <ToolView block={block} />
    case 'code':
      return <CodeView name={block.name} cmd={block.cmd} out={block.out} />
    case 'image':
      return <ImageView mediaType={block.mediaType} data={block.data} name={block.name} />
    default:
      return null
  }
}
