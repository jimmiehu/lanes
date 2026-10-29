import React from 'react'
import { paneShell } from './Pane'
import type { TabKind } from '../state/pane'

export interface EmptyRow {
  kind: TabKind
  id: string
  label: string
  meta: string
  /** Threads only: filled when the thread is waiting on you. */
  waiting?: boolean
}

/** What the empty surface offers, whether it is a whole pane or a blank tab. */
export interface EmptySurface {
  role: TabKind
  starred: EmptyRow[]
  recent: EmptyRow[]
  /**
   * The one thing actually waiting, counted live: threads waiting on you for
   * the thread pane, open tasks across every note for the note pane. At zero
   * the chip is omitted entirely — an empty pane is the best place in the app
   * to answer "what next", and the worst place to state that there is nothing.
   */
  pending: number
  onOpen: (kind: TabKind, id: string) => void
  onSearch: () => void
  /** Opens the palette pre-filtered to the pending kind — Waiting, or Tasks. */
  onPending: () => void
  /**
   * Note pane only: a new note, at once — the same untitled note ⌘N makes,
   * named in its own title. Present because this surface is also what ⌘T opens
   * there, and "a new one" is half of what you press ⌘T for.
   */
  onNew?: () => void
}

/**
 * A pane holding nothing, built to the original pane-and-empty design.
 *
 * A destination, not a failure: panes are role-assigned, so an empty one knows
 * exactly what belongs in it and says so. Four parts, top to bottom — a ghost
 * of the missing document, the copy block, up to three real actions, and a
 * short starred-or-recent list.
 *
 * `EmptyBody` below is the same surface without the pane shell, which is what a
 * BLANK TAB shows. One destination, whether you reached it by closing the last
 * tab or by asking for a new one.
 */
export default function EmptyPane({
  focused,
  split,
  lift,
  grow,
  dropping,
  onFocus,
  onDragOver,
  onDragLeave,
  onDrop,
  seam,
  ...surface
}: EmptySurface & {
  focused: boolean
  split: boolean
  /** Selection as elevation — an empty pane still participates in it. */
  lift: boolean
  grow: number
  /** A rail row is hovering over this pane. */
  dropping: boolean
  onFocus: () => void
  onDragOver: (e: React.DragEvent) => void
  onDragLeave: (e: React.DragEvent) => void
  onDrop: (e: React.DragEvent) => void
  /** Pane B's resize handle, so an empty pane is still draggable. */
  seam?: React.ReactNode
}): React.JSX.Element {
  return (
    <div
      onClick={onFocus}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      data-pane-empty={surface.role === 'note' ? 'note' : 'chat'}
      style={{
        flex: `${grow} 1 0`,
        minWidth: 0,
        borderRadius: 10,
        background: 'var(--sheet)',
        display: 'flex',
        flexDirection: 'column',
        // Required: it clips the seated tint to the rounded corners.
        overflow: 'hidden',
        position: 'relative',
        // Assembled from non-empty parts. box-shadow has no legal `none` inside
        // a comma list, so joining 'none' with a ring would silently void the
        // whole declaration.
        boxShadow: [dropping ? 'inset 0 0 0 2px var(--ink)' : '', paneShell(lift, split, focused)]
          .filter(Boolean)
          .join(', '),
        transition: 'box-shadow .2s ease'
      }}
    >
      {seam}
      <EmptyBody {...surface} />
    </div>
  )
}

/**
 * The empty surface itself: ghost, copy, actions, list. Used by the pane that
 * holds nothing and by the blank tab alike, so the two can never drift into
 * being two different answers to the same question.
 */
export function EmptyBody({
  role,
  starred,
  recent,
  pending,
  onOpen,
  onSearch,
  onPending,
  onNew
}: EmptySurface): React.JSX.Element {
  const isNote = role === 'note'
  // Starred is what you keep, so it leads. Recent stands in only when there is
  // nothing kept — an empty labelled list would be a worse answer than a
  // different question.
  const rows = (starred.length ? starred : recent).slice(0, 4)
  const label = starred.length ? 'STARRED' : 'RECENT'
  const pendingLabel = isNote
    ? `${pending} open task${pending === 1 ? '' : 's'}`
    : `${pending} waiting on you`

  return (
    <div
      data-empty-body={isNote ? 'note' : 'chat'}
      style={{
        flex: 1,
        minHeight: 0,
        overflowY: 'auto',
        overflowX: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        // Optically centred by the content, not measured: the list at the
        // bottom is lighter than the ghost at the top.
        justifyContent: 'center',
        padding: '10px 26px 26px'
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 348,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 23,
          animation: 'riseIn .26s ease-out'
        }}
      >
        {/*
          The ghost: a drawing of the document that belongs here, built from the
          document's OWN parts — the same hairline weights, the same bubble, the
          same inset rule the real renderer uses. The moment it is an
          illustration, it dates. The fixed frame with bottom alignment is
          load-bearing: the two ghosts are different heights, and without it the
          headline shifts when you compare the two roles.
        */}
        <div
          style={{
            width: 132,
            height: 80,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'flex-end',
            padding: '0 0 6px'
          }}
        >
          {isNote ? (
            <>
              {/* A page: title rule, then body hairlines. A short 2px dark rule
                  means "a heading" in both ghosts. */}
              <div style={{ width: 38, height: 2, borderRadius: 1, background: 'var(--rule)' }} />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 7, marginTop: 14 }}>
                {['100%', '100%', '78%', '100%', '46%'].map((w, i) => (
                  <div
                    key={i}
                    style={{ width: w, height: 1, borderRadius: 1, background: 'var(--hair)' }}
                  />
                ))}
              </div>
            </>
          ) : (
            <>
              {/* A transcript: your turn as a filled bubble set right, then
                  Claude's label and lines inset behind a hairline — the exact
                  device the real transcript uses. */}
              <div
                style={{
                  alignSelf: 'flex-end',
                  width: 88,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 7,
                  padding: '9px 11px',
                  borderRadius: 9,
                  background: 'var(--bubble)'
                }}
              >
                <div style={{ height: 1, borderRadius: 1, background: 'var(--mark)' }} />
                <div
                  style={{ width: '62%', height: 1, borderRadius: 1, background: 'var(--mark)' }}
                />
              </div>
              <div
                style={{
                  width: 24,
                  height: 2,
                  borderRadius: 1,
                  background: 'var(--rule)',
                  marginTop: 17
                }}
              />
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 7,
                  marginTop: 11,
                  paddingLeft: 11,
                  boxShadow: 'inset 1px 0 0 var(--hair)'
                }}
              >
                {['100%', '100%', '56%'].map((w, i) => (
                  <div
                    key={i}
                    style={{ width: w, height: 1, borderRadius: 1, background: 'var(--hair)' }}
                  />
                ))}
              </div>
            </>
          )}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 9 }}>
          <div
            style={{
              font: '600 8.5px var(--mono)',
              letterSpacing: '.18em',
              color: 'var(--faint)'
            }}
          >
            {isNote ? 'NOTE PANE' : 'THREAD PANE'}
          </div>
          <div
            style={{
              font: '600 19px/1.28 var(--sans)',
              letterSpacing: '-.022em',
              color: 'var(--ink)',
              textAlign: 'center'
            }}
          >
            {isNote ? 'No note open' : 'No thread open'}
          </div>
          {/* "always open here" is doing the teaching: it states the pane's
              role, which is the one thing a new user does not know. */}
          <div
            style={{
              maxWidth: 290,
              font: '400 11.5px/1.7 var(--sans)',
              color: 'var(--mute)',
              textAlign: 'center',
              textWrap: 'pretty'
            }}
          >
            {isNote
              ? 'Notes always open here. Start one, pick one up, follow a link out of a thread, or search.'
              : 'Conversations always open here. Pick one up where you left it, or search.'}
          </div>
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 7 }}>
          {/* A new one first, where there is such a thing: this surface is what
              ⌘T opens in the note pane, and it would be a poor answer to that
              press if the only thing it offered was other people's notes. */}
          {onNew ? (
            <ActionChip
              label="New note"
              keyHint="⌘N"
              title="A new note, here — named by what you type in its title"
              onClick={onNew}
            />
          ) : null}
          <ActionChip
            label="Search everything"
            keyHint="⌘K"
            title="Threads, notes and open tasks"
            onClick={onSearch}
          />
          {pending > 0 ? (
            <ActionChip
              label={pendingLabel}
              title={
                isNote
                  ? 'Unchecked tasks across every note'
                  : 'Threads where the last word was yours'
              }
              onClick={onPending}
            />
          ) : null}
        </div>

        {rows.length ? (
          <div
            style={{
              width: '100%',
              display: 'flex',
              flexDirection: 'column',
              gap: 1,
              paddingTop: 3
            }}
          >
            <div
              style={{
                font: '600 8.5px var(--mono)',
                letterSpacing: '.16em',
                color: 'var(--faint)',
                padding: '0 8px 8px'
              }}
            >
              {label}
            </div>
            {rows.map((r) => (
              <EmptyRowView key={`${r.kind}:${r.id}`} row={r} onOpen={onOpen} />
            ))}
          </div>
        ) : null}
      </div>
    </div>
  )
}

function ActionChip({
  label,
  keyHint,
  title,
  onClick
}: {
  label: string
  keyHint?: string
  title: string
  onClick: () => void
}): React.JSX.Element {
  const [hov, setHov] = React.useState(false)
  return (
    <div
      onClick={(e) => {
        e.stopPropagation()
        onClick()
      }}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      title={title}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 9,
        padding: '7px 13px',
        borderRadius: 7,
        boxShadow: `inset 0 0 0 1px ${hov ? 'var(--rule)' : 'var(--track)'}`,
        background: hov ? 'var(--quiet)' : 'transparent',
        cursor: 'pointer'
      }}
    >
      <div style={{ font: '400 11.5px var(--sans)', color: 'var(--ink2)' }}>{label}</div>
      {keyHint ? (
        <div style={{ font: '400 9px var(--mono)', color: 'var(--faint)' }}>{keyHint}</div>
      ) : null}
    </div>
  )
}

function EmptyRowView({
  row,
  onOpen
}: {
  row: EmptyRow
  onOpen: (kind: TabKind, id: string) => void
}): React.JSX.Element {
  const [hov, setHov] = React.useState(false)
  const isNote = row.kind === 'note'
  return (
    <div
      onClick={(e) => {
        e.stopPropagation()
        onOpen(row.kind, row.id)
      }}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      title={row.label}
      data-empty-row="1"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 11,
        height: 30,
        padding: '0 8px',
        borderRadius: 7,
        cursor: 'pointer',
        flex: 'none',
        background: hov ? 'var(--quiet)' : 'transparent'
      }}
    >
      {/* The app's kind vocabulary, unchanged: notes a short bar, threads a dot
          in the thread's state colour. */}
      {isNote ? (
        <div
          style={{ width: 3, height: 11, borderRadius: 1, background: 'var(--faint)', flex: 'none' }}
        />
      ) : (
        <div
          style={{
            width: 7,
            height: 7,
            borderRadius: 99,
            background: row.waiting ? 'var(--ink)' : 'var(--dot)',
            flex: 'none'
          }}
        />
      )}
      <div
        style={{
          flex: 1,
          minWidth: 0,
          font: '400 11.5px var(--sans)',
          color: 'var(--ink2)',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis'
        }}
      >
        {row.label}
      </div>
      <div style={{ font: '400 9px var(--mono)', color: 'var(--mute)', flex: 'none' }}>
        {row.meta}
      </div>
    </div>
  )
}
