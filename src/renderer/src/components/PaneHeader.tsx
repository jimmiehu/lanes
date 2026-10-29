import React, { useState } from 'react'

/**
 * The pane head, inside the measure: a kind label and where the thing lives,
 * then the title, then a meta line that is also the disclosure for the details
 * panel.
 *
 * The meta line IS the control. Clicking the sentence that describes the thing
 * opens the facts behind it — there is no separate button, because a button
 * would be a second thing saying what the sentence already says.
 */

export interface Fact {
  label: string
  value: string
  /** A proportion, drawn as a 78px track with a mono figure beside it. */
  bar?: number
  /**
   * Shown whole, in mono, and selectable: a name the machine knows the thing by
   * rather than a description of it. Cut to one line like the rest, a filename
   * lost exactly the part that tells it from its neighbours.
   */
  whole?: boolean
  /** Something to do about it, said at the row's end: the Comments row's `go through`. */
  action?: { label: string; run: () => void }
}

export interface LinkRow {
  /** The 44px mono column: a lane for a thread, NOTE, TASK. */
  kind: string
  title: string
  meta: string
  /** `newTab` is the ⌘ on the click, the same one a wikilink in the body takes. */
  onOpen: (newTab: boolean) => void
  /** The right-click a row of the rail takes for the same note or thread. */
  onMenu?: (e: React.MouseEvent) => void
}

interface Props {
  /** THREAD or NOTE — 9px mono, tracked. Ink for a thread, mute for a note. */
  kindLabel: string
  isNote: boolean
  /** The lane a thread belongs to, or the folder a note lives in. */
  place: string
  showPlace: boolean
  /** Notes only: the place is a control, and this is what it opens. */
  onMove?: (() => void) | null
  title: string
  /**
   * A note in WRITE: the title is a field, not a label. See `TitleField`.
   * Absent everywhere else — a thread's title and READ's are what they were.
   */
  titleEdit?: TitleEdit
  /** "8 turns · waiting on you · 4m ago" */
  meta: string
  detailsOpen: boolean
  onToggleDetails: () => void
  facts: Fact[]
  linksLabel: string
  links: LinkRow[]
  canBack: boolean
  canForward: boolean
  onBack: () => void
  onForward: () => void
  starred: boolean
  onToggleStar: () => void
  /** Pane B's ✕. Splitting moved to the top bar, so pane A has no action. */
  onAction: (() => void) | null
  renaming: boolean
  onStartRename: () => void
  onRename: (next: string) => void
  onCancelRename: () => void
}

export function Caret({ dir }: { dir: 'back' | 'forward' }): React.JSX.Element {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 14 14"
      fill="none"
      stroke="var(--mute)"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={dir === 'back' ? 'M8.4 3.2L4.6 7l3.8 3.8' : 'M5.6 3.2L9.4 7l-3.8 3.8'} />
    </svg>
  )
}

export function HeadButton({
  title,
  onClick,
  children
}: {
  title: string
  onClick: () => void
  children: React.ReactNode
}): React.JSX.Element {
  const [hov, setHov] = useState(false)
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
        width: 20,
        height: 20,
        borderRadius: 6,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'pointer',
        flex: 'none',
        background: hov ? 'var(--hov)' : 'transparent'
      }}
    >
      {children}
    </div>
  )
}

export default function PaneHeader(p: Props): React.JSX.Element {
  return (
    // data-find-skip: the head is chrome. ⌘F searches the document, and now
    // that the head scrolls inside the same scrollport it would otherwise match
    // the title and the meta line too.
    <div data-find-skip="1" style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
      <div data-head="1" style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div
            style={{
              font: '600 9px var(--mono)',
              letterSpacing: '.17em',
              color: p.isNote ? 'var(--mute)' : 'var(--ink)',
              flex: 'none'
            }}
          >
            {p.kindLabel}
          </div>
          {p.showPlace && p.place ? (
            /* A note's place is also where it LIVES, so it is the control for
               moving it: the folder is the fact and the fact is the button. A
               thread's lane is not a folder, so it stays a label. */
            <div
              data-place={p.onMove ? 'move' : 'label'}
              onClick={p.onMove ?? undefined}
              className={p.onMove ? 'head-place' : undefined}
              title={p.onMove ? 'Move this note' : undefined}
              style={{
                font: '400 10.5px var(--sans)',
                color: 'var(--mute)',
                flex: 'none',
                minWidth: 0,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                cursor: p.onMove ? 'pointer' : 'default',
                padding: p.onMove ? '1px 5px' : 0,
                margin: p.onMove ? '0 -5px' : 0,
                borderRadius: 5
              }}
            >
              {p.place}
            </div>
          ) : null}
          <div style={{ flex: 1 }} />
          {/* The tab's own trail: a note followed out of by a link comes back
              this way, as a thread does. The compact bar carries the same two. */}
          {p.canBack ? (
            <HeadButton title="Back · ⌘[" onClick={p.onBack}>
              <Caret dir="back" />
            </HeadButton>
          ) : null}
          {p.canForward ? (
            <HeadButton title="Forward · ⌘]" onClick={p.onForward}>
              <Caret dir="forward" />
            </HeadButton>
          ) : null}
          <HeadButton
            title={p.starred ? 'Unstar' : 'Star — keep it in the rail'}
            onClick={p.onToggleStar}
          >
            <svg
              width="12"
              height="12"
              viewBox="0 0 14 14"
              fill={p.starred ? 'var(--ink)' : 'none'}
              stroke={p.starred ? 'var(--ink)' : 'var(--mute)'}
              strokeWidth="1.15"
              strokeLinejoin="round"
            >
              <path d="M7 2.1l1.5 3.06 3.38.49-2.44 2.38.57 3.36L7 9.8l-3.01 1.59.57-3.36L2.12 5.65l3.38-.49z" />
            </svg>
          </HeadButton>
          {p.onAction ? (
            <HeadButton title="Close this pane · ⌘\" onClick={p.onAction}>
              <svg
                width="12"
                height="12"
                viewBox="0 0 14 14"
                fill="none"
                stroke="var(--mute)"
                strokeWidth="1.4"
                strokeLinecap="round"
              >
                <path d="M3.6 3.6l6.8 6.8M10.4 3.6l-6.8 6.8" />
              </svg>
            </HeadButton>
          ) : null}
        </div>

        {p.renaming ? (
          <RenameField title={p.title} onRename={p.onRename} onCancel={p.onCancelRename} />
        ) : p.titleEdit ? (
          <TitleField key={p.titleEdit.id} {...p.titleEdit} />
        ) : (
          <div
            onDoubleClick={p.onStartRename}
            title="Double-click to rename"
            style={{
              font: '600 21px var(--sans)',
              letterSpacing: '-.022em',
              lineHeight: 1.24,
              color: 'var(--ink)',
              textWrap: 'pretty'
            }}
          >
            {p.title}
          </div>
        )}


        {p.meta ? (
          <div
            data-meta="1"
            onClick={p.onToggleDetails}
            title="Details"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 7,
              cursor: 'pointer',
              alignSelf: 'flex-start',
              maxWidth: '100%'
            }}
          >
            <div
              style={{
                font: '400 11.5px var(--sans)',
                color: 'var(--ink3)',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                minWidth: 0
              }}
            >
              {p.meta}
            </div>
            <svg
              width="9"
              height="9"
              viewBox="0 0 14 14"
              fill="none"
              stroke="var(--faint)"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{ flex: 'none', transform: `rotate(${p.detailsOpen ? 180 : 0}deg)` }}
            >
              <path d="M3 5.5l4 4 4-4" />
            </svg>
          </div>
        ) : null}
      </div>

      {p.detailsOpen ? <DetailsPanel facts={p.facts} label={p.linksLabel} links={p.links} /> : null}
    </div>
  )
}

export interface TitleEdit {
  /**
   * Which note the field is the title of. The field is keyed by it: a field
   * shared across notes kept the old note's words while it had focus, so ⌘N
   * from the title carried one note's name into the next.
   */
  id: string
  /** The `# ` line's text; empty for a note that has not been named. */
  value: string
  /** What the empty field says — "Untitled", or what the note's first line calls it. */
  placeholder: string
  fieldRef: React.MutableRefObject<HTMLDivElement | null>
  /** Every keystroke: the note's title line is rewritten to match. */
  onInput: (text: string) => void
  /** ↵, ↓ or ⇥: the caret goes on into the words. */
  onDown: () => void
  /** esc: out of WRITE, as from the words — asking first if the stretch wrote anything. */
  onEscape?: () => void
  /** The title settled — ↵, or a click away. */
  onCommit: (text: string) => void
}

/**
 * A NOTE'S TITLE, WHERE A TITLE IS — AND YOU TYPE INTO IT.
 *
 * In WRITE the head's title is the note's `# ` line, editable where it stands,
 * in the type it always has. Not a double-click away behind a rename field and
 * not repeated as the first line of the document below: said once, in the
 * place it has always been said, so ⌘E between WRITE and READ moves nothing.
 *
 * It is one document with the words under it. ↵, ↓ or ⇥ carries the caret
 * down into them; ↑ or ⌫ at the top of the words brings it back up here. A
 * new note opens with the caret in this field and nothing in it, so the first
 * thing you type names the note, and ↵ starts the note itself.
 *
 * `plaintext-only`: a title is one line of words, and pasting a formatted
 * heading into it must not bring the formatting — or its line breaks.
 */
function TitleField(t: TitleEdit): React.JSX.Element {
  const el = React.useRef<HTMLDivElement | null>(null)
  // Written from outside only while it is not being typed in: a rename from
  // the tab, an undo in the body, a reload from disk. Overwriting it mid-word
  // would put the caret back at the start of the title under your fingers.
  React.useLayoutEffect(() => {
    const node = el.current
    if (!node || document.activeElement === node) return
    if (node.textContent !== t.value) node.textContent = t.value
  }, [t.value])
  const text = (): string => (el.current?.textContent ?? '').replace(/\s+/g, ' ').trim()
  /*
   * Once per settled title. ↵ commits and then carries the caret into the
   * body — which blurs this field, which would commit the same title again,
   * and on an untitled note a commit is a rename: two of them racing each
   * other for one file.
   */
  const settled = React.useRef(t.value.trim())
  React.useEffect(() => {
    if (document.activeElement !== el.current) settled.current = t.value.trim()
  }, [t.value])
  const latest = React.useRef(t)
  latest.current = t
  const commit = (): void => {
    const now = text()
    if (now === settled.current) return
    settled.current = now
    latest.current.onCommit(now)
  }
  // Leaving by any road still settles the title. ⌘1–9 or ⌃⇥ from inside it
  // take the field away without a blur, and a name half-typed into a note that
  // is no longer on screen would otherwise never reach it.
  const commitRef = React.useRef(commit)
  commitRef.current = commit
  React.useEffect(() => () => commitRef.current(), [])
  return (
    <div
      ref={(node) => {
        // Kept past unmounting: the commit on the way out (below) reads the
        // field's words, and React lets go of the node before that runs — so a
        // title left by ⌘1–9 or ⌃⇥ read as empty and never named the note.
        if (node) el.current = node
        t.fieldRef.current = node
      }}
      contentEditable="plaintext-only"
      suppressContentEditableWarning
      role="textbox"
      aria-label="Title"
      data-note-title="1"
      data-placeholder={t.placeholder}
      spellCheck
      onInput={() => {
        const node = el.current
        if (!node) return
        // A newline can still arrive by paste or drop; a title has none.
        if (/\n/.test(node.textContent ?? '')) node.textContent = (node.textContent ?? '').replace(/\n+/g, ' ')
        // Emptied, it must be EMPTY — the browser leaves a stray <br> behind,
        // and the placeholder only shows on a field with nothing in it.
        if (!(node.textContent ?? '').length && node.childNodes.length) node.replaceChildren()
        t.onInput((node.textContent ?? '').replace(/\s+/g, ' '))
      }}
      onKeyDown={(e) => {
        // Typing here is not a shortcut, for the same reason it is not in the
        // body: the window above has single-key chords.
        const app = e.altKey && (e.code === 'Tab' || e.code === 'Digit1' || e.code === 'Digit2')
        if (!e.metaKey && !e.ctrlKey && !app) e.stopPropagation()
        // Not mid-composition: ↵ there is choosing a word in the input method,
        // not leaving the title.
        if (e.nativeEvent.isComposing || e.keyCode === 229) return
        if (e.key === 'Enter' || (e.key === 'Tab' && !e.shiftKey && !e.altKey) || e.key === 'ArrowDown') {
          e.preventDefault()
          if (e.key === 'Enter') commit()
          t.onDown()
          return
        }
        if (e.key === 'Escape') {
          e.preventDefault()
          if (t.onEscape) t.onEscape()
          else el.current?.blur()
        }
      }}
      onBlur={(e) => {
        // Only a blur INSIDE the app is a decision. Switching to another app
        // blurs the field too, and naming the file after whatever half a title
        // was there at that moment is not something anybody asked for.
        if (!document.hasFocus()) return
        // Nor is the caret going to the question esc asks: that is a question
        // about these very words, and "keep writing" brings it straight back.
        if ((e.relatedTarget as Element | null)?.closest?.('[data-leave-ask]')) return
        commit()
      }}
      className="note-title"
      style={{
        font: '600 21px var(--sans)',
        letterSpacing: '-.022em',
        lineHeight: 1.24,
        color: 'var(--ink)',
        textWrap: 'pretty',
        outline: 'none',
        cursor: 'text',
        minHeight: '1.24em'
      }}
    />
  )
}

/**
 * The title, open for editing.
 *
 * IT DOES NOT COMMIT ON THE BLUR THAT OPENS IT. A rename starts from a click —
 * on the menu item, or a double-click on the title — and the tail of that same
 * click lands on whatever is underneath a moment later. Clicking a thing that
 * cannot hold focus moves focus to the body, which blurred this field the
 * instant it appeared: it committed the title unchanged and closed again, so
 * renaming looked like it simply did nothing. A blur inside the opening window
 * is that tail, never a decision, and the field takes its focus back.
 *
 * Everything after that window is a decision: clicking away commits, as it did
 * before, and ↵ and esc are unchanged.
 */
function RenameField({
  title,
  onRename,
  onCancel
}: {
  title: string
  onRename: (next: string) => void
  onCancel: () => void
}): React.JSX.Element {
  const ref = React.useRef<HTMLInputElement>(null)
  const openedAt = React.useRef(Date.now())
  React.useEffect(() => {
    openedAt.current = Date.now()
    const el = ref.current
    if (!el) return
    el.focus()
    // A rename usually replaces rather than appends.
    el.select()
  }, [])
  return (
    <input
      ref={ref}
      data-rename="1"
      defaultValue={title}
      onKeyDown={(e) => {
        e.stopPropagation()
        if (e.key === 'Enter') onRename((e.target as HTMLInputElement).value)
        if (e.key === 'Escape') onCancel()
      }}
      onBlur={(e) => {
        if (Date.now() - openedAt.current < 400) {
          // Deferred: a focus() call made while a blur is still being
          // dispatched is discarded, so the field would stay open and empty of
          // focus — open, and unusable without a second click.
          setTimeout(() => ref.current?.focus(), 0)
          return
        }
        onRename(e.target.value)
      }}
      style={{
        font: '600 21px var(--sans)',
        letterSpacing: '-.022em',
        lineHeight: 1.24,
        color: 'var(--ink)',
        width: '100%',
        background: 'var(--washOn)',
        borderRadius: 2
      }}
    />
  )
}

/**
 * A raised card, not a bordered band — and its padding bleeds past the measure
 * (`margin: 0 -18px`) rather than narrowing the column it belongs to.
 */
export function DetailsPanel({
  facts,
  label,
  links
}: {
  facts: Fact[]
  label: string
  links: LinkRow[]
}): React.JSX.Element {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 15,
        padding: '16px 18px 18px',
        margin: '0 -18px',
        borderRadius: 9,
        background: 'var(--sheet)',
        boxShadow: 'var(--sh4)',
        animation: 'riseIn .15s ease-out'
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
        {facts.map((f) => (
          <div
            key={f.label}
            data-fact={f.label}
            style={{
              display: 'flex',
              alignItems: f.whole ? 'flex-start' : 'center',
              gap: 12,
              // A whole value may take a second line, and the row grows with it
              // rather than spilling into the next one. One line of it is the
              // same 24px as every other row: 4 + 16 + 4.
              ...(f.whole ? { minHeight: 24, padding: '4px 0' } : { height: 24 })
            }}
          >
            <div
              style={{
                width: 88,
                flex: 'none',
                font: '400 11px var(--sans)',
                color: 'var(--mute)',
                ...(f.whole ? { lineHeight: '16px' } : {})
              }}
            >
              {f.label}
            </div>
            {f.whole ? (
              <div
                data-fact-value="1"
                style={{
                  flex: 1,
                  minWidth: 0,
                  font: '400 11px/16px var(--mono)',
                  color: 'var(--ink)',
                  overflowWrap: 'anywhere',
                  userSelect: 'text',
                  cursor: 'text'
                }}
              >
                {f.value}
              </div>
            ) : f.bar === undefined ? (
              <div
                style={{
                  flex: 1,
                  minWidth: 0,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10
                }}
              >
                <div
                  style={{
                    minWidth: 0,
                    font: '400 11.5px var(--sans)',
                    color: 'var(--ink)',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis'
                  }}
                >
                  {f.value}
                </div>
                {f.action ? (
                  <div
                    data-fact-action={f.label}
                    className="note-copy"
                    onClick={f.action.run}
                    style={{ flex: 'none', cursor: 'pointer', font: '400 11px var(--sans)' }}
                  >
                    {f.action.label}
                  </div>
                ) : null}
              </div>
            ) : (
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 10 }}>
                <div
                  style={{
                    width: 78,
                    height: 3,
                    borderRadius: 2,
                    background: 'var(--chip)',
                    overflow: 'hidden',
                    flex: 'none'
                  }}
                >
                  <div
                    style={{
                      width: `${Math.min(100, Math.max(0, Math.round(f.bar * 100)))}%`,
                      height: '100%',
                      background: 'var(--ink)'
                    }}
                  />
                </div>
                <div
                  style={{
                    font: '400 11px var(--mono)',
                    color: 'var(--ink)',
                    fontVariantNumeric: 'tabular-nums'
                  }}
                >
                  {f.value}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {links.length ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
          <div
            style={{
              font: '600 8.5px var(--mono)',
              letterSpacing: '.16em',
              color: 'var(--mute)'
            }}
          >
            {label}
          </div>
          {links.map((l, i) => (
            <LinkRowView key={`${l.kind}:${l.title}:${i}`} row={l} />
          ))}
        </div>
      ) : null}
    </div>
  )
}

function LinkRowView({ row }: { row: LinkRow }): React.JSX.Element {
  const [hov, setHov] = useState(false)
  return (
    <div
      data-link-row="1"
      onClick={(e) => row.onOpen(e.metaKey || e.ctrlKey)}
      onContextMenu={row.onMenu}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      title={row.title}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '5px 8px',
        margin: '0 -8px',
        borderRadius: 7,
        cursor: 'pointer',
        background: hov ? 'var(--hov)' : 'transparent'
      }}
    >
      <div
        style={{
          font: '600 8.5px var(--mono)',
          letterSpacing: '.13em',
          color: 'var(--mute)',
          width: 44,
          flex: 'none',
          whiteSpace: 'nowrap',
          overflow: 'hidden'
        }}
      >
        {row.kind}
      </div>
      <div
        style={{
          flex: 1,
          minWidth: 0,
          font: '400 12px var(--sans)',
          color: 'var(--ink2)',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis'
        }}
      >
        {row.title}
      </div>
      <div style={{ font: '400 9px var(--mono)', color: 'var(--mute)', flex: 'none' }}>
        {row.meta}
      </div>
    </div>
  )
}
