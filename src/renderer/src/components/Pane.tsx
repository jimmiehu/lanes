import { Component, useCallback, useDeferredValue, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import Composer from './Composer'
import MessageStream from './MessageStream'
import Doc from './Doc'
import type { Follow } from './Runs'
import NoteEditor, { type NoteEditorHandle } from './NoteEditor'
import { wordCount } from '../lib/wordCount'
import { classify, titleLineOf, titleText } from '@shared/mdLive'
import { firstWords, UNTITLED } from '@shared/noteTitle'
import FindBar from './FindBar'
import PaneHeader, { DetailsPanel, type Fact, type LinkRow } from './PaneHeader'
import { EmptyBody, type EmptySurface } from './EmptyPane'
import LimitNote from './LimitNote'
import SignInNote from './SignInNote'
import { limitIn } from '@shared/limit'
import { signInFaultIn } from '@shared/signin'
import CompactBar, { useScrolledPastHead } from './CompactBar'
import Outline, { TOC_ROOM, type Head } from './Outline'
import { CommentMargin, type FieldView } from './Comments'
import {
  anchorFor,
  applyChanges,
  cells,
  commentsSaid,
  editChanges,
  findAgain,
  findComments,
  resolveChanges,
  writeChanges,
  type CommentTarget
} from '@shared/comments'
import SplitSeam from './SplitSeam'
import TabStrip from './TabStrip'
import { MIN_PAD, paneGutter, paneGutters } from '../lib/layout'
import { plainToRaw } from '../lib/sourceAt'
import { isBlank, type PaneState, type TabState } from '../state/pane'
import type { Attachment, EffortId, ModelDef, Note, SafetyId } from '@shared/types'
import { HEAD_AIR, LAND } from '../lib/headAir'
import { handTypingOver } from '../lib/typeAhead'

/**
 * What a pane's sheet wears, read as paper: the selected one is lifted off the
 * desk and casts, the other is seated into it. A SINGLE pane is always lifted —
 * there is nothing to tell it apart from, and paper on a desk has a shadow
 * regardless. With the lift off, the old 1px ring marks selection instead.
 *
 * One function for both the content pane and the empty one, or the two disagree
 * the moment one side closes.
 */
export function paneShell(lift: boolean, split: boolean, focused: boolean): string {
  if (!lift) return split && focused ? '0 0 0 1px var(--focus)' : ''
  return !split || focused ? 'var(--shpOn)' : 'var(--shpOff)'
}

/**
 * How the pane head reaches the note body beneath it. The title field lives in
 * the head and the words in the body, and the two have to be one document: the
 * field writes the body's title line, ↓ from it lands in the words, and a title
 * committed on an untitled note has to settle every keystroke before the file
 * is renamed out from under them.
 */
interface NoteBridge {
  editor: () => NoteEditorHandle | null
  /** Everything typed, handed to the app now rather than on the next pause. */
  settle: () => void
  /** Everything typed and not yet saved, dropped — the disk's version was asked for. */
  discard: () => void
  /** esc in the title: leave WRITE, asking first when the stretch has written anything. */
  leave: () => void
  /**
   * A stretch is being thrown away. The title field goes with WRITE, and a
   * field going away commits what it holds — which would name the note after
   * the very words being discarded.
   */
  quiet: () => boolean
}

interface Props {
  pane: PaneState
  /** The pane's active tab — what this pane is actually showing. */
  tab: TabState
  index: 0 | 1
  split: boolean
  focused: boolean
  vw: number
  /** Measured, not inferred from `split` — see lib/layout.ts. */
  paneW: number
  textScale: number
  /** Persisted composer height, dragged from its top edge. */
  composerH: number
  onComposerH: (h: number) => void
  /** The note the other pane is showing, offered as a reference in this chat. */
  refNote: { title: string; path: string } | null
  onReference: () => void
  /** Pane A's share of the split; drives flex-grow so the seam can move it. */
  grow: number
  /** Pane B only: dragging its left edge re-shares the split. */
  onRatio: (ratio: number, done: boolean) => void
  showCtx: boolean
  showTools: boolean
  /** What a thread's chip says: its lane, or with no lanes the folder it was started from. */
  threadPlace: string
  navPosition: string
  starred: boolean
  /** Settings → "Lane in the head": show where the open thing belongs. */
  showPlace: boolean
  detailsOpen: boolean
  onToggleDetails: () => void
  /** The details panel's fact rows and its linked section. */
  facts: Fact[]
  linksLabel: string
  links: LinkRow[]
  canBack: boolean
  canForward: boolean
  onBack: () => void
  onForward: () => void
  models: ModelDef[]
  model: string
  effort: EffortId
  safety: SafetyId
  elapsed: string
  onFocus: () => void
  onPrev: () => void
  onNext: () => void
  onToggleStar: () => void
  /** The reading measure, which the strip, head, body and composer all share. */
  measure: number
  /** Selection as elevation — the lifted/seated shells instead of the ring. */
  lift: boolean
  /**
   * What a blank tab shows. The same surface the empty pane draws, so ⌘T in the
   * note pane and closing the last tab land you in the same place.
   */
  empty: EmptySurface
  onSelectTab: (i: number) => void
  onCloseTab: (i: number) => void
  onCloseOthers: (i: number) => void
  /** Pin or unpin a tab in this pane's strip, by index. */
  onTogglePinTab: (i: number) => void
  /** Star or unstar the OBJECT behind a tab — a different store from pinning. */
  onToggleStarTab: (i: number) => void
  /** Rename the thread behind a tab, by index — the field opens in the head. */
  onRenameTab: (i: number) => void
  /** Notes only: open the mover for the note this pane is showing. */
  onMoveNote: () => void
  /** Show the note behind a tab in the Finder, by index. */
  onRevealTab: (i: number) => void
  starredOf: (t: TabState) => boolean
  /** Reorder this pane's strip by dragging. */
  onReorderTab: (from: number, to: number) => void
  /** Chat titles are editable in place — see PaneHeader. */
  renaming: boolean
  onStartRename: () => void
  onRename: (next: string) => void
  onCancelRename: () => void
  onPlus: () => void
  finding: boolean
  findNonce: number
  /** The app's memory of the last query, so ⌘G can reopen on it. */
  findQuery: string
  onFindQuery: (q: string) => void
  onCloseFind: () => void
  dropping: boolean
  onDragOver: (e: React.DragEvent) => void
  onDragLeave: (e: React.DragEvent) => void
  onDrop: (e: React.DragEvent) => void
  onAction: () => void
  onComposer: (v: string) => void
  onSend: () => void
  onStop: () => void
  /** Guarded: the reader's yes or no to the tool call in `tab.ask`. */
  onAnswer: (approved: boolean) => void
  onModel: (id: string) => void
  onEffort: (id: EffortId) => void
  onClearQuote: () => void
  /** The images waiting to go out with the next message. */
  onImages: (next: Attachment[]) => void
  note: Note | null
  /** The launch-time answer to "is the CLI signed in", when it said no. */
  signedOut: boolean
  /** No `claude` to ask at all: Claude Code is not installed. */
  cliMissing: boolean
  /** Asks again whether there is a CLI and whether it is signed in. */
  onCheckCli: () => Promise<void>
  onQuote: (text: string) => void
  onWiki: Follow
  /** Part the thread at a message in this pane's transcript. */
  onBranch: (atMessage: number, mode: 'fork' | 'edit' | 'again') => void
  /** Read another path of the thread in this pane, from a seam. */
  onGoPath?: (id: string) => void
  /** What a path of this thread is doing while you are not on it. */
  busyPath?: (id: string) => 'answering' | 'asking' | null
  /** Right-click a path at a seam: name it, or let it go. */
  onSeamMenu?: (e: React.MouseEvent, id: string, label: string) => void
  /** The id a thread is known by, which its paths share. */
  threadOf?: (id: string) => string
  /** "path 2 of 3" — empty for a thread nobody has forked. */
  pathNote?: string
  onSaveNote: (body: string) => void
  /**
   * The note's identity, which survives a rename: the path it was opened at.
   * The editor is keyed on it, so naming a note does not rebuild the editor.
   */
  noteId: string
  /** The title field settled — ↵ or a click away. Untitled notes take the name as their filename. */
  onCommitTitle: (title: string) => void
  /**
   * A block is open with uncommitted text in it. That IS unsaved work, and the
   * mtime poll has to know: otherwise a change on disk reloads silently and
   * takes the draft with it.
   */
  onEditing: (open: boolean) => void
  /** This note moved on disk while there were unsaved edits in the pane. */
  conflict: boolean
  onReloadNote: () => void
  /** The conflict's other answer: what is on screen goes over the disk. */
  onKeepMine: () => void
  /** Said in the bar when the note's last write has not landed. */
  saveTrouble?: string
  /** The note just created, which opens in WRITE rather than READ. */
  freshNote: string | null
  /** A comment to land on, once its note is in front — see `commentLand` in App. */
  commentLand?: { path: string; from: number; text: string; n: number } | null
  /** WRITE or READ — the note's own markdown, or the document it draws. */
  writing: boolean
  /** Which stretch of writing WRITE is in — see `writeOn` in App. 0 in READ. */
  writeSession: number
  onWriting: (on: boolean) => void
  /** The two writing aids, app-wide: they are how YOU write, not how one note is. */
  write: { focus: boolean; typewriter: boolean }
  onWrite: (next: { focus: boolean; typewriter: boolean }) => void
  /**
   * The outline's collapse preference for THIS TAB, or undefined where nobody
   * has chosen yet — which resolves by the margin, not by a stored default.
   */
  tocPref: boolean | undefined
  onToc: (closed: boolean) => void
  /** Floating only: the outline is kept through the clicks that dismiss it. */
  /**
   * The chat tab just created — its composer takes focus. Carries a count as
   * well as an id, so two new threads in a row are two distinct events.
   */
  freshChat: { id: string; n: number } | null
}


function agoWords(ms: number): string {
  const s = Math.round((Date.now() - ms) / 1000)
  if (s < 60) return `${s}s`
  const m = Math.round(s / 60)
  if (m < 60) return `${m}m`
  const h = Math.round(m / 60)
  if (h < 24) return `${h}h`
  return `${Math.round(h / 24)}d`
}

export default function Pane(p: Props): React.JSX.Element {
  const root = useRef<HTMLDivElement>(null)
  // Measured after commit, never during render, and always from the DOM rather
  // than from a remembered scrollTop.
  const scrolled = useScrolledPastHead(
    () => root.current?.querySelector<HTMLElement>('[data-find-scope]') ?? null,
    () => root.current?.querySelector<HTMLElement>('[data-head="1"]') ?? null,
    [p.tab.key, p.tab.id, p.tab.messages.length]
  )
  const padX = paneGutter(p.measure)
  const { tab } = p
  const noteBridge = useRef<NoteBridge | null>(null)
  const titleEl = useRef<HTMLDivElement | null>(null)
  /** A note you can write in, in WRITE: its head's title is a field. */
  const writingNote = tab.kind === 'note' && Boolean(p.note) && p.writing && !p.note?.readOnly
  /*
   * What the title field shows: the text of the note's `# ` line — empty for a
   * note made without a name, so the field's placeholder can say so rather
   * than the filename pretending to be one. A note with no title line shows
   * the name the vault gives it, and typing there writes one.
   */
  const headTitle = useMemo(() => {
    if (!p.note) return ''
    const lines = p.note.body.split('\n', 40)
    const at = titleLineOf(lines)
    return at === -1 ? p.note.title : titleText(lines[at])
  }, [p.note])
  /*
   * What an empty title field says. A note nobody has named is called by what
   * it says — its first line, as the tab and the rail call it — and the field
   * shows that, faintly, as what the note will be called until you name it.
   * "Untitled" only while there is nothing in it at all.
   */
  const headPlaceholder = useMemo(() => {
    if (!p.note || headTitle) return 'Untitled'
    return (UNTITLED.test(p.note.path) && firstWords(p.note.body)) || 'Untitled'
  }, [p.note, headTitle])
  const focusTitle = useCallback((atEnd: boolean) => {
    const el = titleEl.current
    if (!el) return
    el.focus()
    const r = document.createRange()
    r.selectNodeContents(el)
    r.collapse(!atEnd)
    const sel = window.getSelection()
    sel?.removeAllRanges()
    sel?.addRange(r)
  }, [])

  /**
   * Re-read whenever the error changes, not on a timer: the notice's own clock
   * ticks inside it, and re-parsing the same sentence every second to draw the
   * same verdict is work with a known answer.
   */
  const limit = useMemo(() => limitIn(p.tab.error), [p.tab.error])
  /*
   * A signed-out CLI is a fault with exactly one remedy, so it gets the same
   * treatment a usage limit gets: its own note, saying the thing to do, rather
   * than the CLI's sentence repeated in the stderr box on every message.
   * `signedOut` is the launch-time status check, which knows before you type.
   */
  const signIn = useMemo(() => signInFaultIn(p.tab.error), [p.tab.error])
  const count = tab.messages.length
  const touched = count ? tab.messages[count - 1].timestamp : tab.started
  const isNote = tab.kind === 'note'
  /*
   * The meta line under the title, and the two kinds say different things. A
   * thread reports its turns and when it last moved; a note reports when it was
   * edited and how long it is. Reading a note's line off the tab's MESSAGES —
   * which a note has none of — is how it came to say "0 msg".
   */
  /*
   * The same count the writing surface would give, so the head and the bar
   * under it cannot report two different lengths for one note.
   *
   * Memoised, because this runs two passes over the whole note and this
   * component re-renders on every keystroke in either pane — counting a
   * quarter-megabyte note again because somebody typed a character into the
   * composer beside it is the kind of cost that only shows up as "the editor
   * feels heavy".
   */
  // And deferred: the count is a caption, not something typing should wait
  // on. On a note of megabytes it is a real pass over the text, and it runs
  // after every save — so it runs when the window has nothing better to do.
  const countedBody = useDeferredValue(p.note?.body ?? '')
  const words = useMemo(() => (countedBody ? wordCount(countedBody) : 0), [countedBody])
  // And the comments still open in it, which are not words of the note.
  const comments = useMemo(() => findComments(countedBody).length, [countedBody])
  const meta = isNote
    ? p.note
      ? `edited ${agoWords(p.note.edited)} ago · ${words} word${words === 1 ? '' : 's'}${comments ? ` · ${commentsSaid(comments)}` : ''}`
      : ''
    : [
        `${count} turn${count === 1 ? '' : 's'}`,
        // Derived, never authored: who spoke last is the only thing an app can
        // honestly know about a thread's state.
        tab.pending ? 'answering' : count && tab.messages[count - 1].role === 'you'
          ? 'waiting on you'
          : count
            ? 'answered'
            : '',
        count ? `${agoWords(touched)} ago` : '',
        // Only for a thread that has gone more than one way. Which of its paths
        // you are reading belongs on the line that already says what this is.
        p.pathNote ?? ''
      ]
        .filter(Boolean)
        .join(' · ')

  // The header, the tab fill and the pane ground all key off the tab's kind, so
  // they can never disagree about what this pane is. Only the *body* waits for
  // the note itself to arrive, which is a frame or two behind on a cold start.

  // One head, used by whichever body is showing. It belongs to the document,
  // not to the chrome above it, so it goes INSIDE the scroller — which is also
  // the only way the compact bar's observer can watch it leave.
  const paneHead = (
      <div style={{ flex: 'none', paddingBottom: 4 }}>
      <PaneHeader
        kindLabel={isNote ? 'NOTE' : 'THREAD'}
        isNote={isNote}
        // A thread says which lane it belongs to; a note says which folder it
        // lives in. Same slot, same voice, different fact. With no lanes a
        // thread says the folder it was started from, or nothing.
        place={isNote ? (p.note?.folder ?? '') : p.threadPlace}
        onMove={isNote && p.note ? p.onMoveNote : null}
        showPlace={p.showPlace}
        title={isNote && p.note ? p.note.title : tab.title}
        titleEdit={
          writingNote
            ? {
                id: p.noteId,
                value: headTitle,
                placeholder: headPlaceholder,
                fieldRef: titleEl,
                onInput: (t) => noteBridge.current?.editor()?.setTitle(t),
                onDown: () => noteBridge.current?.editor()?.focus('body'),
                onEscape: () => noteBridge.current?.leave(),
                onCommit: (t) => {
                  if (noteBridge.current?.quiet()) return
                  noteBridge.current?.settle()
                  p.onCommitTitle(t)
                }
              }
            : undefined
        }
        meta={meta}
        // NOT gated on `scrolled`. The head is inside the scroller, so
        // unmounting its panel changes the scroll height, which moves the head,
        // which flips `scrolled` back — a sticky element that changes size is a
        // sticky element that fights the scroll. The bar simply covers it.
        detailsOpen={p.detailsOpen}
        onToggleDetails={p.onToggleDetails}
        facts={p.facts}
        linksLabel={p.linksLabel}
        links={p.links}
        canBack={p.canBack}
        canForward={p.canForward}
        onBack={p.onBack}
        onForward={p.onForward}
        starred={p.starred}
        onToggleStar={p.onToggleStar}
        onAction={p.index === 1 ? p.onAction : null}
        renaming={p.renaming}
        onStartRename={p.onStartRename}
        onRename={p.onRename}
        onCancelRename={p.onCancelRename}
      />
      </div>
  )

  return (
    <div
      data-pane={p.index}
      ref={root}
      onClick={p.onFocus}
      onDragOver={p.onDragOver}
      onDragLeave={p.onDragLeave}
      onDrop={p.onDrop}
      style={{
        flex: `${p.grow} 1 0`,
        minWidth: 0,
        display: 'flex',
        flexDirection: 'column',
        position: 'relative',
        borderRadius: 10,
        overflow: 'hidden',
        // Both panes are sheets on the desk. The kinds no longer need different
        // grounds to be told apart: they are in fixed places, and the desk
        // between them is the seam the inset border used to draw.
        background: 'var(--sheet)',
        /*
         * Assembled as a list JOINED FROM NON-EMPTY PARTS. `box-shadow` has no
         * legal `none` inside a comma list, so concatenating 'none' with a ring
         * silently voids the whole declaration — every shadow on the element,
         * not just the empty one.
         */
        boxShadow: [
          p.dropping ? 'inset 0 0 0 2px var(--ink)' : '',
          paneShell(p.lift, p.split, p.focused)
        ]
          .filter(Boolean)
          .join(', '),
        // The whole animation. No transform, no opacity: a pane is a container
        // the reader is inside of, and moving it costs their place on the page.
        transition: 'box-shadow .2s ease'
      }}
    >
      {p.split && p.index === 1 ? <SplitSeam onRatio={p.onRatio} /> : null}


      <TabStrip
        tabs={p.pane.tabs}
        active={p.pane.active}
        measure={p.measure}
        padX={padX}
        titleOf={(t) =>
          t.kind === 'chat'
            ? `Thread${p.threadPlace ? ` · ${p.threadPlace}` : ''} — ${t.title}`
            : `Note — ${t.title}`
        }
        starredOf={p.starredOf}
        onSelect={p.onSelectTab}
        onClose={p.onCloseTab}
        onCloseOthers={p.onCloseOthers}
        onPlus={p.onPlus}
        onTogglePin={p.onTogglePinTab}
        onToggleStar={p.onToggleStarTab}
        onRename={p.onRenameTab}
        onReveal={p.onRevealTab}
        onReorder={p.onReorderTab}
      />


      {/*
        A blank tab — a note tab with no note picked yet — is the empty surface
        with a strip above it. Everything below reads a document; a blank tab
        has none, so the head, the compact bar, the find bar and the composer
        would all be chrome for a thing that is not there.
      */}
      {isBlank(tab) ? <EmptyBody {...p.empty} /> : (
      <>
      {/*
        THE FIND BAR OWNS THE TOP OF THE PANE while it is open — and it sits
        OUTSIDE the scrollport wrapper below, which is the whole point.

        Inside it, the compact bar is absolute at that wrapper's `top: 0` and
        z-indexed above everything in flow, so the moment you scrolled past the
        head — which is the moment you reach the second match — the bar you were
        typing in was covered by the title bar sliding in over it. It had not
        gone anywhere; you simply could not see or reach it. Out here the
        wrapper starts BELOW it, so the compact bar has nowhere to land but
        under the find field, and the bar stays put however far you scroll.
      */}
      {p.finding ? (
        <FindBar
          scope={() => root.current?.querySelector('[data-find-scope]') ?? null}
          // A note being written is searched through its editor, which knows
          // lines it has not drawn: most of a long note is never in the DOM.
          engine={writingNote ? () => noteBridge.current?.editor()?.find ?? null : undefined}
          contentKey={`${p.tab.key}:${p.tab.id}:${p.tab.messages.length}:${writingNote ? 'w' : 'r'}`}
          focusNonce={p.findNonce}
          initial={p.findQuery}
          onQuery={p.onFindQuery}
          onClose={p.onCloseFind}
        />
      ) : null}

      {/*
        The scrollport. The compact bar is absolute against THIS, not against
        the pane: anchored to the pane root its `top: 0` lands on the tab strip
        and, being opaque and z-indexed above it, silently swallows every tab
        control — select, ✕, +, right-click, drag. A transcript opens at its
        live edge, so that was every thread longer than one screen.
      */}
      <div
        style={{
          position: 'relative',
          flex: 1,
          minHeight: 0,
          display: 'flex',
          flexDirection: 'column'
        }}
      >
      {scrolled ? (
        <CompactBar
          kindLabel={isNote ? 'NOTE' : 'THREAD'}
          isNote={isNote}
          title={isNote && p.note ? p.note.title : tab.title}
          meta={meta}
          detailsOpen={p.detailsOpen}
          onToggleDetails={p.onToggleDetails}
          starred={p.starred}
          onToggleStar={p.onToggleStar}
          canBack={p.canBack}
          canForward={p.canForward}
          onBack={p.onBack}
          onForward={p.onForward}
          padX={padX}
          lead={
            isNote && p.note && !p.note.readOnly ? (
              <ModePair on={p.writing} onWriting={p.onWriting} />
            ) : undefined
          }
        >
          {p.detailsOpen ? (
            <div style={{ paddingTop: 10 }}>
              <DetailsPanel facts={p.facts} label={p.linksLabel} links={p.links} />
            </div>
          ) : null}
        </CompactBar>
      ) : null}

      {isNote ? (
        p.note ? (
          <NotePaneBody
            note={p.note}
            padX={padX}
            scale={p.textScale}
            fresh={p.freshNote === p.note.path}
            land={p.commentLand ?? null}
            writing={p.writing}
            session={p.writeSession}
            onWriting={p.onWriting}
            write={p.write}
            onWrite={p.onWrite}
            conflict={p.conflict}
            onReload={p.onReloadNote}
            onKeepMine={p.onKeepMine}
            saveTrouble={p.saveTrouble}
            onQuote={p.onQuote}
            onWiki={p.onWiki}
            onSave={p.onSaveNote}
            onEditing={p.onEditing}
            measure={p.measure}
            tocPref={p.tocPref}
            onToc={p.onToc}
            header={paneHead}
            bridge={noteBridge}
            focusTitle={focusTitle}
            noteId={p.noteId}
          />
        ) : (
          // The chrome commits to note-ness on the tab's kind, so the body has
          // to as well. Falling through to the chat branch put a transcript and
          // a composer under a NOTE chip on a --sunken ground.
          <div
            style={{
              flex: 1,
              minHeight: 0,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 5,
              padding: `16px ${padX}`
            }}
          >
            <div style={{ font: '400 11px var(--mono)', color: 'var(--mute)' }}>
              {tab.hydrated ? 'this note is not in the vault' : 'opening…'}
            </div>
            <div
              style={{
                font: '400 10px var(--mono)',
                color: 'var(--faint)',
                maxWidth: 420,
                textAlign: 'center',
                overflowWrap: 'anywhere'
              }}
            >
              {tab.id}
            </div>
          </div>
        )
      ) : (
      <>
      <MessageStream
        header={paneHead}
        textScale={p.textScale}
        // The THREAD, not the path: stepping between two paths of one
        // conversation is not opening a different document, so it must not
        // snap the reader to the bottom.
        streamKey={`${tab.key}:${p.threadOf?.(tab.id) ?? tab.id}`}
        messages={tab.messages}
        pending={tab.pending}
        elapsed={p.elapsed}
        padX={padX}
        split={p.split}
        showTools={p.showTools}
        onWiki={p.onWiki}
        onBranch={p.onBranch}
        seams={tab.seams}
        onGo={p.onGoPath ?? null}
        busyOf={p.busyPath ?? (() => null)}
        onSeamMenu={p.onSeamMenu}
        pathKey={tab.id}
      />

      {/*
        Guarded. Headless Claude Code has no channel to ask a question on, so it
        DENIES the call and ends the turn — this bar is that denial turned back
        into the question it was. Which is why the caveat line is not optional:
        the turn is already over, and a yes buys the rest of a turn that has to
        be started again, not this one call.

        A raised card rather than a coloured band. There is no hue left to warn
        with, so it earns attention the way everything else here does: it lifts
        off the page, and what it is asking about is set in ink.
      */}
      {tab.ask ? (
        <div style={{ flex: 'none', padding: `0 ${padX} 12px` }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              padding: '13px 15px',
              borderRadius: 9,
              background: 'var(--sheet)',
              boxShadow: 'var(--sh4)',
              animation: 'riseIn .14s ease-out'
            }}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0, flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                <div
                  style={{
                    font: '600 9px var(--mono)',
                    letterSpacing: '.17em',
                    color: 'var(--mute)',
                    flex: 'none'
                  }}
                >
                  ASKS TO
                </div>
                <div style={{ font: '600 12px var(--sans)', color: 'var(--ink)' }}>
                  {tab.ask.tool === 'Bash' ? 'Run a command' : `Use ${tab.ask.tool}`}
                </div>
              </div>
              <div
                style={{
                  font: '400 11px var(--mono)',
                  color: 'var(--ink3)',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis'
                }}
                title={tab.ask.summary}
              >
                {tab.ask.summary}
              </div>
              {/* The CLI has no per-call grant, so say what a yes actually buys. */}
              <div style={{ font: '400 11px var(--sans)', color: 'var(--mute)' }}>
                {tab.ask.shell
                  ? 'Approving allows commands for the rest of this turn, not just this one.'
                  : 'Approving allows edits for the rest of this turn, not just this one.'}
              </div>
            </div>
            <div
              onClick={() => p.onAnswer(true)}
              style={{
                font: '600 11.5px var(--sans)',
                color: 'var(--onInk)',
                background: 'var(--ink)',
                borderRadius: 7,
                padding: '7px 13px',
                cursor: 'pointer',
                flex: 'none'
              }}
            >
              Approve
            </div>
            <div
              onClick={() => p.onAnswer(false)}
              style={{
                font: '400 11.5px var(--sans)',
                color: 'var(--ink2)',
                boxShadow: 'inset 0 0 0 1px var(--edge)',
                borderRadius: 7,
                padding: '7px 13px',
                cursor: 'pointer',
                flex: 'none'
              }}
            >
              Deny
            </div>
          </div>
        </div>
      ) : null}

      {/*
        A usage limit is not a fault, so it does not get the fault's box. See
        LimitNote — and `limitIn`, which answers null for everything it is not
        certain about, which is what keeps a real error out of a countdown.
      */}
      {limit ? <LimitNote limit={limit} padX={padX} /> : null}

      {/*
        Not signed in. Either a turn came back saying so, or the status check
        said so before a turn was ever spent — the second is the better time,
        and the note says which it was. And ahead of both, no CLI at all: there
        is nothing to sign in to until Claude Code is installed.
      */}
      {p.cliMissing && !limit ? (
        <SignInNote fault={null} padX={padX} missing onCheckAgain={p.onCheckCli} />
      ) : signIn || (p.signedOut && !limit && !tab.error) ? (
        <SignInNote fault={signIn} padX={padX} />
      ) : null}

      {/* stderr, verbatim. On the code ground because that is what it is —
          machine output — and set in ink because it is the one thing on the
          pane you did not ask for. */}
      {tab.error && !limit && !signIn ? (
        <div style={{ flex: 'none', padding: `0 ${padX} 12px` }}>
          <div
            style={{
              background: 'var(--code)',
              borderRadius: 7,
              padding: '10px 14px',
              font: '400 11px/1.7 var(--mono)',
              color: 'var(--ink3)',
              whiteSpace: 'pre-wrap',
              maxHeight: 90,
              overflowY: 'auto',
              overflowX: 'hidden'
            }}
          >
            {tab.error}
          </div>
        </div>
      ) : null}
      </>
      )}
      </div>

      {isNote ? null : (
      <Composer
        padX={padX}
        context={tab.context}
        showCtx={p.showCtx}
        value={tab.composer}
        onChange={p.onComposer}
        onSend={p.onSend}
        onStop={p.onStop}
        pending={Boolean(tab.pending)}
        active={p.focused}
        models={p.models}
        model={p.model}
        onModel={p.onModel}
        effort={p.effort}
        onEffort={p.onEffort}
        safety={p.safety}
        quote={tab.quote}
        onClearQuote={p.onClearQuote}
        height={p.composerH}
        onHeight={p.onComposerH}
        refNote={p.refNote}
        onReference={p.onReference}
        images={tab.images}
        onImages={p.onImages}
        fresh={p.freshChat?.id === tab.id ? p.freshChat.n : 0}
      />
      )}
      </>
      )}
    </div>
  )
}

/**
 * A pane showing a note. Selecting text offers QUOTE IN CHAT, which drops the
 * excerpt into the *other* pane's composer — quoting into the pane you are
 * reading from would have nowhere to go.
 */
/**
 * WRITE | READ — the two things a note pane can be. Drawn twice: in the writing
 * bar under the head, and in the compact bar once the head has scrolled away,
 * where that bar's kind label was. That is the left edge the pair already has,
 * so scrolling does not take the switch anywhere: it is where it was, stuck.
 */
function ModePair({
  on,
  onWriting
}: {
  /** WRITE is showing. */
  on: boolean
  onWriting: (on: boolean) => void
}): React.JSX.Element {
  return (
    <div style={{ display: 'flex', flex: 'none' }}>
      {(
        [
          ['WRITE', true],
          ['READ', false]
        ] as const
      ).map(([label, writes], i) => (
        <div
          key={label}
          onClick={() => onWriting(writes)}
          title={writes ? 'Write in markdown (⌘E)' : 'Read the document (⌘E)'}
          className="mode-tab"
          data-mode={label}
          data-on={on === writes ? '1' : '0'}
          style={{
            padding: '2px 8px',
            borderRadius: i === 0 ? '4px 0 0 4px' : '0 4px 4px 0',
            boxShadow: 'inset 0 0 0 1px var(--edge)',
            background: on === writes ? 'var(--ink)' : 'transparent',
            color: on === writes ? 'var(--onInk)' : 'var(--mute)',
            font: '500 9px var(--mono)',
            letterSpacing: '.09em',
            cursor: 'pointer',
            userSelect: 'none'
          }}
        >
          {label}
        </div>
      ))}
    </div>
  )
}

/**
 * A place in a note, in the note's own terms: source lines `from`–`to`, `frac`
 * of the way down what they draw, and `px` below the top of the screen when
 * the top falls between blocks rather than in one.
 */
type Place = { from: number; to: number; frac: number; px: number }

/** The top of what can be SEEN in a scrollport: under the compact bar while it is there. */
function seenTop(sc: HTMLElement): number {
  const bar = sc.closest('[data-pane]')?.querySelector('[data-compact="1"]')
  return bar ? bar.getBoundingClientRect().bottom : sc.getBoundingClientRect().top
}

/** A READ block's box. Its marker is `display: contents` and has none of its own. */
function blockBox(el: Element): { top: number; bottom: number } | null {
  let top = Infinity
  let bottom = -Infinity
  for (const c of el.children) {
    const r = c.getBoundingClientRect()
    if (!r.height) continue
    top = Math.min(top, r.top)
    bottom = Math.max(bottom, r.bottom)
  }
  return top < bottom ? { top, bottom } : null
}

/** READ's blocks that hold no others — a fold's own blocks, not the fold. */
function leafBlocks(sc: HTMLElement): HTMLElement[] {
  return [...sc.querySelectorAll<HTMLElement>('[data-md-from]')].filter(
    (el) => !el.querySelector('[data-md-from]')
  )
}

/**
 * A READ table's rows, each with the source line it is. READ draws a table as
 * one block, and the source is a line a row — the header, a separator READ does
 * not draw, then one per row — so a place inside a table is a row, not a
 * fraction of the block: spread over the whole block, it came back a row out.
 * Null for any block that is not a table.
 */
function tableRows(el: Element, from: number): { line: number; top: number; bottom: number }[] | null {
  const table = el.querySelector('table')
  if (!table) return null
  return [...table.querySelectorAll('tr')].map((tr, i) => {
    const r = tr.getBoundingClientRect()
    return { line: i === 0 ? from : from + 1 + i, top: r.top, bottom: r.bottom }
  })
}

/**
 * KEEPS YOUR PLACE ACROSS A SWITCH. WRITE and READ draw the same note at
 * different heights — a table is four source lines in one and a drawn table in
 * the other — so the offset one was scrolled to is another place in the other,
 * and a switch in the middle of a long note landed a screen or two away. With
 * the switch in reach however far down you are, the middle is where it is used.
 *
 * A class for one reason: `getSnapshotBeforeUpdate` is the one moment React
 * offers when the switch has been decided and the surface being left is still
 * on the page. The place is read there, and put back once the new surface is
 * in — after the editor's own layout effects have made it, since this comes
 * after it in the tree.
 */
class KeepPlace extends Component<{
  id: string
  writing: boolean
  take: (inWrite: boolean) => Place | null
  give: (inWrite: boolean, place: Place) => void
}> {
  getSnapshotBeforeUpdate(prev: { id: string; writing: boolean }): Place | null {
    if (prev.writing === this.props.writing || prev.id !== this.props.id) return null
    return this.props.take(prev.writing)
  }
  componentDidUpdate(_prev: unknown, _state: unknown, place: Place | null): void {
    if (place) this.props.give(this.props.writing, place)
  }
  render(): null {
    return null
  }
}

function NotePaneBody({
  note,
  padX,
  scale,
  fresh,
  writing,
  session,
  onWriting,
  write,
  onWrite,
  conflict,
  onReload,
  onKeepMine,
  saveTrouble,
  onQuote,
  onWiki,
  onSave,
  onEditing,
  measure,
  tocPref,
  onToc,
  header,
  bridge,
  focusTitle,
  noteId,
  land
}: {
  note: Note
  padX: string
  scale: number
  /** A comment to land on: this note's, scrolled to, its anchor flashed. */
  land: { path: string; from: number; text: string; n: number } | null
  /** Made a moment ago, so it opens with the caret ready — in the title if it has none. */
  fresh: boolean
  writing: boolean
  /** Which stretch of writing — handed to the editor, which keeps what esc would take back. */
  session: number
  onWriting: (on: boolean) => void
  write: { focus: boolean; typewriter: boolean }
  onWrite: (next: { focus: boolean; typewriter: boolean }) => void
  /** The file moved on disk while there were unsaved edits in here. */
  conflict: boolean
  onReload: () => void
  onKeepMine: () => void
  saveTrouble?: string
  onQuote: (text: string) => void
  /** `newTab` is the ⌘ on the click — the same one a chat's wikilinks carry. */
  onWiki: Follow
  onSave: (body: string) => void
  onEditing: (open: boolean) => void
  measure: number
  tocPref: boolean | undefined
  onToc: (closed: boolean) => void
  header?: React.ReactNode
  /** What the head reaches this body through: the editor, and a way to settle it. */
  bridge: React.MutableRefObject<NoteBridge | null>
  /** Put the caret in the head's title field. */
  focusTitle: (atEnd: boolean) => void
  noteId: string
}): React.JSX.Element {
  const readOnly = note.readOnly
  /** WRITE, and only where writing is possible at all. */
  const write_on = writing && !readOnly
  const writer = useRef<NoteEditorHandle | null>(null)
  /*
   * The draft, TAGGED WITH THE NOTE IT IS A DRAFT OF. Switching notes renders
   * this body with the new note before any effect has run; an untagged draft
   * still held the note you left for that render, so the new note's editor
   * mounted with the old note's text — a frame of the wrong words, and a caret
   * placed against them. A draft of another note is simply not used.
   */
  const [held, setHeld] = useState({ id: noteId, body: note.body })
  const draft = held.id === noteId ? held.body : note.body
  // Tagged with THIS render's note, deliberately not a ref to the current one:
  // the editor being torn down by a switch hands over its last words through
  // the closure it was given, and those words belong to the note it showed.
  // By IDENTITY, not path: a rename is the same note, and resetting the draft
  // to the stored body on a rename rewound the last keystrokes under the caret.
  const setDraft = (body: string): void => setHeld({ id: noteId, body })
  const [selection, setSelection] = useState('')
  const [copied, setCopied] = useState(false)
  /** The export, while it is happening — see the `pdf` control in the bar. */
  const [pdf, setPdf] = useState<'making' | 'saved' | 'failed' | null>(null)
  /** READ was asked for the whole document — see `tocGo` and Doc's own `CAP`. */
  const [drawAll, setDrawAll] = useState(false)
  const bodyRef = useRef<HTMLDivElement>(null)

  // The note on disk wins whenever it changes underneath us, except while
  // something typed here is still on its way to it.
  useEffect(() => {
    setDraft(note.body)
    setDrawAll(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [noteId])
  /*
   * WRITING GOES UP ON A TIMER, NOT ON EVERY KEYSTROKE.
   *
   * Handing each character to the app means a store write and a render of the
   * whole window behind it — the rail, both panes, the head's own word count —
   * for a change only this pane can see. Measured on a 3,000-line note that was
   * most of the cost of typing in it.
   *
   * The draft is local and immediate, so the words appear as fast as they are
   * typed; the app hears about them a quarter-second later. Nothing can be lost
   * to it: whatever is still owed is flushed when the field is left, when the
   * mode changes, when the note changes, and when this unmounts.
   */
  /*
   * WHAT IS OWED CARRIES ITS OWN WAY OF PAYING IT.
   *
   * `onSave` is bound to the note the pane was showing when it was made, and
   * one of the moments this flushes is the note CHANGING — at which point the
   * current `onSave` writes to the new note. Holding the save alongside the
   * body means the last words of the note you left go to the note you left,
   * rather than being poured into the one you opened.
   */
  const owed = useRef<{ save: (body: string) => void; body: string } | null>(null)
  const owedTimer = useRef(0)
  /*
   * UNSAVED WORK IS KEYSTROKES, NOT AN OPEN EDITOR.
   *
   * The disk poll asks this before it calls a change on disk a conflict. It
   * used to be told "WRITE is up", which made every note you were merely
   * looking at in the editor a conflict the moment anything else touched it —
   * and the thing that touches a note beside a thread is Claude, editing it.
   * Now it is told the truth: whether anything typed here has yet to reach the
   * app. With nothing owed, a change on disk simply arrives under the caret.
   */
  const editorOwes = useRef(false)
  const onEditingRef = useRef(onEditing)
  onEditingRef.current = onEditing
  const report = useCallback(() => {
    onEditingRef.current(editorOwes.current || owed.current !== null)
  }, [])
  const flush = useCallback(() => {
    if (owedTimer.current) {
      clearTimeout(owedTimer.current)
      owedTimer.current = 0
    }
    const due = owed.current
    owed.current = null
    due?.save(due.body)
    report()
  }, [report])
  const writeBody = (next: string): void => {
    setDraft(next)
    owed.current = { save: onSave, body: next }
    report()
    if (owedTimer.current) return
    owedTimer.current = window.setTimeout(() => {
      owedTimer.current = 0
      flush()
    }, 250)
  }
  useEffect(() => flush, [flush, note.path, write_on])

  // A LAYOUT effect, so that a body from disk reaches the editor in the same
  // step the app handed it over in (see the poll in App). As a passive effect
  // it ran a task later, and a key typed in that gap made it look like the
  // stale version below — so the file's new words were passed by, and the next
  // save went over them.
  useLayoutEffect(() => {
    // Not while something typed here has yet to reach the store: `note.body`
    // is then the version BEFORE the last keystroke or two, and taking it would
    // be the editor undoing the writer.
    if (owed.current || editorOwes.current) return
    // Nor when the draft already says it: the echo of this pane's own save,
    // which is most of what arrives here. Taken anyway, from a layout effect,
    // it is a second render of the pane run at once — flushing every effect of
    // the window's render of that save along with it — inside the save's own
    // task and ahead of the frame, on every save while you type.
    if (draft === note.body) return
    setDraft(note.body)
  }, [note.body])

  /*
   * What the head reaches this body through. The title field lives up there,
   * the words down here, and a title that is committed has to be able to say
   * "everything typed, to disk, now" before the file is renamed under it.
   *
   * A LAYOUT effect, and declared before the fresh-note one below: that one
   * hands a new note the letters typed while it was being made, and they are
   * typed into the title at once — through this. As a passive effect it was
   * not there yet whenever the pane had shown no note before (a blank tab, the
   * split closed), and the title typed then never reached the note.
   */
  useLayoutEffect(() => {
    bridge.current = {
      editor: () => writer.current,
      settle: () => {
        writer.current?.flush()
        flush()
      },
      discard: () => {
        if (owedTimer.current) clearTimeout(owedTimer.current)
        owedTimer.current = 0
        owed.current = null
        writer.current?.drop()
        editorOwes.current = false
        report()
      },
      leave: () => leaveRef.current(),
      quiet: () => quiet.current
    }
    return () => {
      bridge.current = null
    }
  }, [bridge, flush, report])

  /*
   * ESC IN WRITE IS THE WAY OUT OF IT — and out means the words written in
   * this stretch go, so it asks first.
   *
   * Only when there is something to lose: a stretch that has changed nothing
   * (nothing typed, or typed and taken out again) simply leaves for READ. With
   * something written, a dialog asks, and esc in it is no — so esc, esc, esc
   * opens it, closes it, opens it, and never throws a word away. Discarding is
   * a click on Discard, or ⌘⌫; ⌘E remains the way out that keeps everything.
   *
   * What goes is what THIS stretch wrote, since the note went into WRITE: a
   * change that arrived from outside meanwhile stays (see `stretch` in
   * lib/editorLive.ts). And it goes as an edit, saved like any other, so the
   * app's ⌘Z in READ — and the editor's, next time you write — bring it back.
   */
  const [asking, setAsking] = useState(false)
  /** Set while a stretch is being thrown away — see `quiet` on the bridge. */
  const quiet = useRef(false)
  /** Where the caret was when esc asked, to go back to on "keep writing". */
  const askedFrom = useRef<HTMLElement | null>(null)
  const leave = (): void => {
    if (!write_on || asking) return
    if (writer.current?.changed()) {
      askedFrom.current = document.activeElement as HTMLElement | null
      setAsking(true)
      return
    }
    onWriting(false)
  }
  const leaveRef = useRef(leave)
  leaveRef.current = leave
  const keepWriting = (): void => {
    setAsking(false)
    const was = askedFrom.current
    askedFrom.current = null
    requestAnimationFrame(() => {
      if (was?.isConnected && was.dataset.noteTitle) focusTitle(true)
      else writer.current?.focus('here')
    })
  }
  const throwAway = (): void => {
    setAsking(false)
    askedFrom.current = null
    quiet.current = true
    writer.current?.discard()
    flush()
    onWriting(false)
    // Well past the commit that takes the title field away with WRITE, and its
    // effects — however React schedules the render this asks for.
    window.setTimeout(() => {
      quiet.current = false
    }, 250)
  }
  // A dialog about one note does not outlive it: another tab, or READ by any
  // other road, and the question is gone with what it was about.
  useEffect(() => {
    setAsking(false)
  }, [noteId, write_on])

  // A selection belongs to the surface it was made on. Switching modes throws
  // that surface away, so the QUOTE button must not outlive it.
  useEffect(() => setSelection(''), [write_on])

  /*
   * WHEN THE QUOTE OFFER SHOWS. In READ, a selection IS the question — you
   * select to quote — so it shows at once. In WRITE you select to bold a word,
   * to cut a sentence, to retype a line, and a loud button leaping up under
   * every one of those is chrome in the way of writing. So there it waits for
   * the selection to settle, and it is quiet when it comes.
   */
  const [quoteReady, setQuoteReady] = useState(false)
  useEffect(() => {
    if (!write_on) {
      setQuoteReady(Boolean(selection))
      return
    }
    setQuoteReady(false)
    if (!selection) return
    const t = window.setTimeout(() => setQuoteReady(true), 600)
    return () => clearTimeout(t)
  }, [selection, write_on])

  /*
   * THE COMMENT FIELD, while it is open: a new comment about `target`, under
   * the words at `top`; or one already written, found again by its words.
   * See components/Comments.tsx for the field, shared/comments.ts for where
   * an anchor can go.
   */
  type Field =
    | { kind: 'new'; target: Extract<CommentTarget, { kind: 'new' }>; top: number }
    | { kind: 'old'; key: string; was: { from: number; text: string }; words: string | null }
  const [field, setField] = useState<Field | null>(null)
  /** Said for a moment where a comment cannot go. */
  const [noComment, setNoComment] = useState(false)
  // A field belongs to the surface it was opened on, and to the note.
  useEffect(() => setField(null), [noteId, write_on])

  /** A client Y as a place in the scroller's content, where the margin draws. */
  const inContent = (y: number): number => {
    const sc = bodyRef.current
    return sc ? Math.round(y - sc.getBoundingClientRect().top + sc.scrollTop) : y
  }

  /**
   * WHAT A COMMENT FROM READ'S SELECTION WOULD BE ABOUT — each end walked back
   * to the source as a double-click is (`plainToRaw`): in a block's words or a
   * table's cell, to the letter; on a bullet, a box or an item's status, to the
   * edge of the words beside it; between blocks, or on one with no words, to
   * the edge of the block. Then asked of `anchorFor` like WRITE's, which takes
   * the first words the selection has, so one that starts on a bullet or runs
   * on into a list or a table is still about something.
   */
  const readTarget = (): { target: CommentTarget; under: number } | null => {
    const sel = window.getSelection()
    const sc = bodyRef.current
    if (!sel || !sel.rangeCount || sel.isCollapsed || !sc) return null
    const range = sel.getRangeAt(0)
    // This note's blocks — not those of a note embedded in it, which are another note's lines.
    const blocks = leafBlocks(sc).filter((el) => !el.closest('[data-embed]') && range.intersectsNode(el))
    if (!blocks.length) return null
    const lines = draft.split('\n')
    const starts: number[] = []
    for (let i = 0, at = 0; i < lines.length; i++) {
      starts.push(at)
      at += lines[i].length + 1
    }
    /** The plain characters of `el` before a point — or, for a point outside it, before or after all of them. */
    const upTo = (el: Element, node: Node, off: number): number => {
      const plain = el.textContent?.length ?? 0
      if (!el.contains(node)) {
        const r = document.createRange()
        r.selectNodeContents(el)
        return r.comparePoint(node, off) < 0 ? 0 : plain
      }
      const r = document.createRange()
      r.selectNodeContents(el)
      try {
        r.setEnd(node, off)
      } catch {
        return 0
      }
      return r.toString().length
    }
    /** One end of the selection, as a place in the note. */
    const at = (block: HTMLElement, node: Node, off: number, end: boolean): number => {
      const a = Number(block.dataset.mdFrom)
      const b = Number(block.dataset.mdTo)
      const edge = end ? starts[b] + lines[b].length : starts[a]
      const el = (node.nodeType === 3 ? node.parentElement : (node as Element)) as Element | null
      // A table's cell: its row is a line, the header then one past the rule READ does not draw.
      const cell = el?.closest('td, th') as HTMLTableCellElement | null
      if (cell && block.contains(cell)) {
        const r = [...block.querySelectorAll('tr')].indexOf(cell.parentElement as HTMLTableRowElement)
        const line = r === 0 ? a : a + 1 + r
        const got = cells(lines[line] ?? '', starts[line] ?? 0)[cell.cellIndex]
        if (!got) return edge
        return got[1] + plainToRaw(got[0], cell.textContent ?? '', upTo(cell, node, off))
      }
      const host = block.querySelector('[data-md-runs]')
      if (!host) return edge
      const c = classify(lines[a] ?? '')
      const lead = 'markTo' in c ? c.markTo : 0
      const raw = lines.slice(a, b + 1).join('\n').slice(lead)
      return starts[a] + lead + plainToRaw(raw, host.textContent ?? '', upTo(host, node, off))
    }
    const head = blocks[0]
    const tail = blocks[blocks.length - 1]
    const from = head.contains(range.startContainer) ? at(head, range.startContainer, range.startOffset, false) : at(head, head, 0, false)
    const to = tail.contains(range.endContainer) ? at(tail, range.endContainer, range.endOffset, true) : at(tail, tail, tail.childNodes.length, true)
    const target = anchorFor(draft, from, to)
    if (!target) return null
    // Under the words it is about: where the selection starts, or — when it
    // started on something with none — the first line of the block they are in.
    const about = target.kind === 'new' ? target.a : (target.comment.anchor?.from ?? target.comment.from)
    let line = 0
    while (line + 1 < starts.length && starts[line + 1] <= about) line += 1
    const there = blocks.find((el) => Number(el.dataset.mdFrom) <= line && line <= Number(el.dataset.mdTo)) ?? head
    const rect = ((): DOMRect => {
      if (there === head && head.contains(range.startContainer)) return range.getClientRects()[0] ?? range.getBoundingClientRect()
      const a = Number(there.dataset.mdFrom)
      const tr = there.querySelectorAll('tr')[line === a ? 0 : line - a - 1]
      if (tr) return tr.getBoundingClientRect()
      const r = document.createRange()
      r.selectNodeContents(there.querySelector('[data-md-runs]') ?? there)
      return r.getClientRects()[0] ?? r.getBoundingClientRect()
    })()
    return { target, under: rect.bottom }
  }

  /** A comment's key on the surface that is up — READ's place in the list, or WRITE's offset. */
  const keyOf = (c: { from: number }): string => {
    if (write_on) return `w${c.from}`
    const k = findComments(draft).findIndex((d) => d.from === c.from)
    return `r${k}`
  }

  /** Open the field on a comment already written, by the key its marker carries. */
  const openOld = (key: string, text: string): void => {
    if (readOnly) return
    const from = key.startsWith('w') ? Number(key.slice(1)) : (findComments(draft)[Number(key.slice(1))]?.from ?? -1)
    if (from < 0) return
    const c = findAgain(draft, { from, text })
    setField({ kind: 'old', key, was: { from, text }, words: c?.anchor?.words ?? null })
  }

  /** ⌘⌥M, or `comment` beside `quote`: a field for a new comment on what is selected — or, in WRITE, the word at the caret. */
  const openNew = (): void => {
    if (readOnly) return
    const got = write_on ? writer.current?.commentTarget() : readTarget()
    if (!got) {
      setNoComment(true)
      window.setTimeout(() => setNoComment(false), 1600)
      return
    }
    setSelection('')
    if (got.target.kind === 'old') {
      const c = got.target.comment
      setField({ kind: 'old', key: keyOf(c), was: { from: c.from, text: c.text }, words: c.anchor?.words ?? null })
      return
    }
    window.getSelection()?.removeAllRanges()
    setField({ kind: 'new', target: got.target, top: inContent(got.under) })
  }
  const openNewRef = useRef(openNew)
  openNewRef.current = openNew

  /** The note with a comment change made — through the editor in WRITE, the note's own save in READ. */
  const commentDone = (): void => {
    setField(null)
    if (write_on) requestAnimationFrame(() => writer.current?.focus('here'))
  }
  const submitComment = (text: string): void => {
    if (!field) return
    if (write_on) {
      const ok =
        field.kind === 'new'
          ? writer.current?.comment({ kind: 'write', target: field.target, text })
          : writer.current?.comment({ kind: 'edit', was: field.was, text })
      if (ok) commentDone()
      return
    }
    let changes
    if (field.kind === 'new') {
      // Still the words it was about, in the note as it is now.
      const t = anchorFor(draft, field.target.a, field.target.b)
      if (t?.kind !== 'new' || t.a !== field.target.a || t.b !== field.target.b) return setField(null)
      changes = writeChanges(t, text)
    } else {
      const c = findAgain(draft, field.was)
      if (!c) return setField(null)
      changes = editChanges(c, text)
    }
    const next = applyChanges(draft, changes)
    setDraft(next)
    onSave(next)
    commentDone()
  }
  const resolveComment = (): void => {
    if (field?.kind !== 'old') return
    if (write_on) {
      if (writer.current?.comment({ kind: 'resolve', was: field.was })) commentDone()
      return
    }
    const c = findAgain(draft, field.was)
    if (!c) return setField(null)
    const next = applyChanges(draft, resolveChanges(c))
    setDraft(next)
    onSave(next)
    commentDone()
  }
  const closeField = useCallback((): void => {
    setField(null)
    if (write_on) requestAnimationFrame(() => writer.current?.focus('here'))
  }, [write_on])

  // ⌘⌥M, as in Google Docs: on the selection in this pane — READ's, or the
  // editor's when the caret is in it.
  useEffect(() => {
    if (readOnly) return
    const onKey = (e: KeyboardEvent): void => {
      if (!(e.metaKey && e.altKey && !e.ctrlKey && !e.shiftKey && e.code === 'KeyM')) return
      const sc = bodyRef.current
      const sel = window.getSelection()
      const ours = write_on
        ? Boolean(sc && document.activeElement && sc.contains(document.activeElement))
        : Boolean(sc && sel?.anchorNode && sc.contains(sel.anchorNode) && !sel.isCollapsed)
      if (!ours) return
      e.preventDefault()
      e.stopPropagation()
      openNewRef.current()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [readOnly, write_on])

  /*
   * LANDING ON A COMMENT — ⌘K's COMMENTS opens a note at one: scrolled to a
   * third of the way down, its anchor flashed. Found again by its words, since
   * the note may have moved since the index read it; past what READ draws, the
   * rest is drawn first, and in WRITE its line is brought into view so the
   * editor draws it. A beat after the note arrives, so the place a note keeps
   * (`KeepScroll`) has been given back and is not given back over this.
   */
  const landed = useRef(0)
  useEffect(() => {
    if (!land || land.path !== note.path || landed.current === land.n) return
    const c = findAgain(draft, { from: land.from, text: land.text })
    if (!c) return
    const key = write_on ? `w${c.from}` : `r${findComments(draft).findIndex((d) => d.from === c.from)}`
    const n = land.n
    let tries = 0
    let timer = 0
    const go = (): void => {
      const sc = bodyRef.current
      if (!sc || landed.current === n) return
      const sel = `[data-cmt-anchor="${CSS.escape(key)}"], [data-cmt-at="${CSS.escape(key)}"]`
      const lit = [...sc.querySelectorAll<HTMLElement>(sel)].filter((el) => !el.closest('[data-cmt-layer]'))
      const seen = lit.find((el) => el.getClientRects().length)
      if (!seen) {
        if (!write_on && !drawAll) setDrawAll(true)
        if (write_on) {
          const top = writer.current?.lineTop(draft.slice(0, c.from).split('\n').length - 1)
          if (top != null) sc.scrollTop += top - sc.getBoundingClientRect().top - sc.clientHeight / 3
        }
        // A fold it is in is opened: going to a comment is asking to see it.
        for (const el of lit) {
          let fold = el.closest('details:not([open])') as HTMLDetailsElement | null
          while (fold) {
            fold.open = true
            fold = fold.parentElement?.closest('details:not([open])') as HTMLDetailsElement | null
          }
        }
        if (++tries < 25) timer = window.setTimeout(go, 60)
        return
      }
      landed.current = n
      const r = seen.getBoundingClientRect()
      sc.scrollTop += r.top - sc.getBoundingClientRect().top - sc.clientHeight / 3
      for (const el of lit) {
        el.classList.remove('cmt-flash')
        void el.offsetWidth
        el.classList.add('cmt-flash')
      }
      timer = window.setTimeout(() => lit.forEach((el) => el.classList.remove('cmt-flash')), 1700)
    }
    timer = window.setTimeout(go, 80)
    return () => clearTimeout(timer)
  }, [land, note.path, draft, write_on, drawAll])

  /** What the margin shows of the field. */
  const fieldView: FieldView | null = field
    ? field.kind === 'new'
      ? { kind: 'new', top: field.top, words: field.target.words }
      : { kind: 'old', key: field.key, text: field.was.text, words: field.words }
    : null

  useEffect(() => () => onEditingRef.current(false), [])

  /*
   * The window is closing: everything typed here goes to the app NOW, while
   * there is still an app to take it. Synchronous on purpose — the app writes
   * what it is owed straight after this returns. See `lanes:settle` in App.
   */
  useEffect(() => {
    const settle = (): void => {
      writer.current?.flush()
      flush()
    }
    window.addEventListener('lanes:settle', settle)
    return () => window.removeEventListener('lanes:settle', settle)
  }, [flush])

  /*
   * The outline's rows, read from the note's SOURCE rather than from the
   * headings the renderer drew. Source rows stay correct mid-edit; DOM rows lag
   * a render behind and desync the moment a block is open. `##` and `###` only
   * — an h1 is the note's title, which the head above already says — and a
   * fence is tracked, so a `## comment` inside code is not a section.
   */
  const toc: Head[] = useMemo(() => {
    const out: Head[] = []
    let fence = false
    draft.split('\n').forEach((l, i) => {
      const t = l.trim()
      if (t.startsWith('```')) {
        fence = !fence
        return
      }
      if (fence) return
      /*
       * Matched against the RAW line, not the trimmed one. The document's own
       * parser requires the `#` at column 0, so an indented `## …` — inside a
       * list item, a continuation, an indented block — is not a heading and is
       * drawn as prose. Trimming first made the outline invent sections the
       * note does not have and the reader cannot jump to: one long note listed
       * over a thousand, nearly all indented and every one the same words.
       */
      const m = /^(#{2,3})\s+(.*)$/.exec(l)
      const text = m?.[2].trim()
      if (m && text) out.push({ line: i, level: m[1].length as 2 | 3, text })
    })
    return out
  }, [draft])

  /**
   * The two facts the outline needs, read fresh from the DOM in one pass and
   * never remembered: how much gutter the pane actually has, and which heading
   * currently sits nearest the top of the scrollport.
   *
   * The gutter is MEASURED, never taken from `split` — a wide window in a split
   * can have more margin than a narrow window without one. It is the margin
   * the pane HAS — its width, less the measure, less the minimum padding — and
   * not the padding it happens to be showing: an open outline makes its own
   * room by widening that padding, and reading it back as margin let every open
   * outline find room for itself, so a tab opened after one started open in a
   * split with no margin at all, over the words.
   */
  const readGeo = (): { gut: number; act: number } => {
    const sc = bodyRef.current
    if (!sc) return { gut: 0, act: -1 }
    // The padding's % is of the box around the scrollport, so that is the width.
    const width = sc.parentElement?.clientWidth ?? sc.clientWidth
    const gut = Math.max(0, Math.round((width - measure) / 2 - MIN_PAD))
    /*
     * Where the headings ARE, which depends on the mode. READ draws anchored
     * heading elements. WRITE asks the editor, which knows where every line
     * is — including the ones it has not drawn, since it only draws what is
     * near the screen. The outline is the note's, not a rendering's, so it
     * keeps working in both.
     */
    const ed = write_on ? writer.current : null
    const tops: number[] = ed
      ? toc.map((h) => ed.lineTop(h.line) ?? Infinity)
      : [...sc.querySelectorAll('[data-toc^="h"]')].map((el) => {
          const r = el.getBoundingClientRect()
          // A heading inside a CLOSED fold has no box at all. Reading its
          // zeros as a position puts the mark on a section nobody can see.
          return r.height ? r.top : NaN
        })
    // The trigger line: 40px below the top of the scrollport.
    const line = sc.getBoundingClientRect().top + 40
    let act = tops.length ? 0 : -1
    for (let i = 0; i < tops.length; i += 1) {
      if (Number.isNaN(tops[i])) continue
      if (tops[i] <= line) act = i
      else break
    }
    return { gut, act }
  }

  const [geo, setGeo] = useState({ gut: 0, act: -1 })
  /** Keeps the SAME object when nothing differs, so this cannot loop. */
  const sync = (): void =>
    setGeo((was) => {
      const next = readGeo()
      return was.gut === next.gut && was.act === next.act ? was : next
    })
  /*
   * On scroll, on resize, and after every render. The last one is what makes a
   * rail opening, a split toggling or a tab switch recompute the margin with no
   * wiring of their own — all three change the gutter without touching the
   * scroll position. Not behind requestAnimationFrame: rAF does not run in a
   * window that is not on screen, and a scroll event already arrives at most
   * once a frame.
   */
  useEffect(sync)
  useEffect(() => {
    const sc = bodyRef.current
    if (!sc) return
    sc.addEventListener('scroll', sync, { passive: true })
    window.addEventListener('resize', sync)
    return () => {
      sc.removeEventListener('scroll', sync)
      window.removeEventListener('resize', sync)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /*
   * Room in the margin also sets the default: open where it costs nothing,
   * closed where opening would cover the text. `undefined` is "not chosen yet",
   * which is why the toggle writes an explicit value rather than flipping the
   * stored one — flipping undefined gives `true` in both directions, and the
   * outline then looks stuck shut in a narrow pane.
   */
  const tocRoom = geo.gut >= TOC_ROOM
  const tocClosed = tocPref === undefined ? !tocRoom : tocPref

  /*
   * THE OUTLINE STAYS UNTIL IT IS SENT AWAY. The chevron beside CONTENTS, or
   * escape, and nothing else.
   *
   * It used to go on any click outside itself, and a pin existed to defeat
   * that. Both were consequences of the shape it no longer has: a sheet lying
   * over the words is a popover, and a popover that survives the click that
   * dismissed everything else is in the way. In its own margin it is furniture,
   * and furniture does not vanish because you touched the thing beside it —
   * which is exactly what made reading a note WITH the outline impossible, since
   * every click into the text took it from you.
   *
   * Escape is claimed only while it is open, and never from a field: a composer
   * or the note's editor answers its own escape.
   */
  useEffect(() => {
    if (tocClosed || toc.length < 2) return
    const shut = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape' || e.defaultPrevented) return
      const el = document.activeElement
      if (
        el instanceof HTMLInputElement ||
        el instanceof HTMLTextAreaElement ||
        (el as HTMLElement | null)?.isContentEditable
      )
        return
      e.preventDefault()
      onToc(true)
    }
    window.addEventListener('keydown', shut)
    return () => window.removeEventListener('keydown', shut)
  }, [tocClosed, toc.length, onToc])

  const tocGo = (line: number, again = false): void => {
    const sc = bodyRef.current
    if (!sc) return
    // Same rule as `readGeo`: in WRITE the editor says where the line is.
    if (write_on) {
      const head = toc.find((h) => h.line === line)
      // The WORDS land where READ's land: see HEAD_AIR for why not the box.
      const off = (): number | null => {
        const w = writer.current?.wordsTop(line)
        if (!w || !head) return null
        const air = head.level === 2 && w.opens ? 0 : HEAD_AIR[head.level]
        return w.y - sc.getBoundingClientRect().top - (LAND + air)
      }
      const dy0 = off()
      if (dy0 == null) return
      const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches
      sc.scrollTo({ top: sc.scrollTop + dy0, behavior: still ? 'auto' : 'smooth' })
      /*
       * A line far from the screen has an ESTIMATED place until it is drawn,
       * and drawing the lines around it moves it again. So once the scroll has
       * ENDED — not at a guess of when, since a smooth scroll a thousand lines
       * long outlasts any guess, and correcting it mid-flight is how the jump
       * landed wrong — the landing is corrected to the real line, and again
       * until it holds.
       */
      let tries = 0
      let begun = false
      const fix = (): void => {
        const dy = off()
        if (dy == null || Math.abs(dy) <= 2 || ++tries > 8) return
        sc.scrollTop += dy
        window.setTimeout(fix, 40)
      }
      const settle = (): void => {
        if (begun) return
        begun = true
        sc.removeEventListener('scrollend', settle)
        fix()
      }
      sc.addEventListener('scrollend', settle)
      // A jump to where you already are scrolls nothing and never ends.
      window.setTimeout(settle, still ? 60 : 1500)
      return
    }
    const el = sc.querySelector(`[data-toc="h${line}"]`)
    /*
     * The section may be inside a collapsed fold, where it has no box to scroll
     * to. Asking to GO somewhere is asking to see it, so the folds in the way
     * open — all of them, since folds nest.
     */
    let fold = (el as HTMLElement | null)?.closest?.('details:not([open])') as HTMLDetailsElement | null
    while (fold) {
      fold.open = true
      fold = fold.parentElement?.closest('details:not([open])') as HTMLDetailsElement | null
    }
    if (!el) {
      /*
       * The heading is past what READ has drawn. Clicking a row and having
       * nothing happen is the worst of the possible answers, and going TO a
       * section is asking for the part of the document it is in — so the rest
       * is drawn and the jump retried once the render has landed.
       */
      if (!write_on && !drawAll && !again) {
        setDrawAll(true)
        requestAnimationFrame(() => requestAnimationFrame(() => tocGo(line, true)))
      }
      return
    }
    // Rect delta, not offsetTop: the scrollport is a flex container and is not
    // the offset parent. Never scrollIntoView.
    const dy = el.getBoundingClientRect().top - sc.getBoundingClientRect().top
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    sc.scrollTo({ top: sc.scrollTop + dy - 22, behavior: still ? 'auto' : 'smooth' })
  }

  /** A checkbox in READ rewrites ONLY the marker on its line. */
  const toggleTask = (line: number, done: boolean): void => {
    if (readOnly) return
    const lines = draft.split('\n')
    if (!lines[line]) return
    lines[line] = lines[line].replace(/\[[ xX]\]/, done ? '[x]' : '[ ]')
    const joined = lines.join('\n')
    setDraft(joined)
    onSave(joined)
  }

  /**
   * A NOTE MADE A MOMENT AGO OPENS READY TO WRITE — and ready means the caret is
   * already where the next keystroke belongs. A note with no title yet puts it
   * in the head's title field, so the first thing typed names it; one that was
   * named on the way in puts it at the top of the body, under that name.
   */
  const placed = useRef<string | null>(null)
  useLayoutEffect(() => {
    if (!fresh || readOnly || !write_on) {
      placed.current = null
      return
    }
    // Once for each arrival: a fresh note in WRITE gets its caret put down one
    // time. React in development runs a layout effect a second time straight
    // after the first, as though the pane had been taken down and put back,
    // and by then the words typed ahead had been handed over — the title they
    // named, and the body the ↵ among them went on into — so the second run put
    // the caret back in the title, under the next key.
    if (placed.current === note.path) return
    placed.current = note.path
    // The note's own body, not `draft`: on a tab switch this runs in the same
    // commit that resets the draft, so `draft` still holds the note you left.
    const lines = note.body.split('\n', 40)
    const at = titleLineOf(lines)
    const named = at === -1 ? true : Boolean(titleText(lines[at]))
    // In the same commit that draws the note, not a frame after it. The editor
    // mounted in its own layout effect, which ran first — a child's always
    // does — so it is there to take the caret, and the note appears with the
    // caret already in it rather than a beat before.
    if (named) writer.current?.focus('body')
    else focusTitle(false)
    // And whatever was typed while the note was being made goes in after it,
    // where the caret now is (see `lib/typeAhead.ts`).
    handTypingOver()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fresh, note.path, write_on])

  /*
   * WHERE A DOUBLE-CLICK IN READ ASKED TO WRITE. READ is for reading now; a
   * double-click in it is the request to write THERE, so the mode flips and the
   * caret lands on the source line and column the pointer was over, once the
   * editor exists to take it.
   */
  const landAt = useRef<{ line: number; col: number } | 'end' | null>(null)
  const wasWriting = useRef(write_on)
  useEffect(() => {
    const entered = write_on && !wasWriting.current
    wasWriting.current = write_on
    // Back from READ with ⌘E or the pill: that is asking to write, so the
    // caret goes back into the note — where it was, since the editor kept it.
    if (entered && !landAt.current && !fresh) {
      const t = requestAnimationFrame(() => writer.current?.focus('here'))
      return () => cancelAnimationFrame(t)
    }
    if (!write_on || !landAt.current) return
    const at = landAt.current
    landAt.current = null
    const t = requestAnimationFrame(() => {
      if (at === 'end') writer.current?.focus('end')
      else writer.current?.focusSource(at.line, at.col)
    })
    return () => cancelAnimationFrame(t)
  }, [write_on])
  const writeAt = (line: number, col: number): void => {
    if (readOnly) return
    landAt.current = { line, col }
    onWriting(true)
  }

  /*
   * WHERE YOU ARE, as the note's lines — see `KeepPlace`. Null while the head
   * is still on screen: there the head is the place, and it stands where it
   * stood in both modes.
   */
  const takePlace = (inWrite: boolean): Place | null => {
    const sc = bodyRef.current
    if (!sc) return null
    const top = seenTop(sc)
    const head = sc.querySelector('[data-head="1"]')
    if (head && head.getBoundingClientRect().bottom > top) return null
    const place = (from: number, to: number, box: { top: number; bottom: number }): Place => {
      const h = box.bottom - box.top
      return {
        from,
        to,
        frac: h > 0 ? Math.max(0, Math.min(1, (top - box.top) / h)) : 0,
        px: Math.max(0, box.top - top)
      }
    }
    if (inWrite) {
      const at = writer.current?.lineAt(top)
      return at ? place(at.line, at.line, at) : null
    }
    // In document order, so the first block reaching past the top is the one.
    for (const el of leafBlocks(sc)) {
      const box = blockBox(el)
      if (!box || box.bottom <= top) continue
      const from = Number(el.dataset.mdFrom)
      // A table by the first row whose words are on screen — the row the eye
      // is on. Its rows are not the same heights on both surfaces, and WRITE
      // has the separator line between the header and the first row, so a
      // place a way into a row half scrolled off put the next row out.
      const rows = tableRows(el, from)
      const row = rows?.find((r) => r.top >= top - 1) ?? rows?.find((r) => r.bottom > top)
      if (row) return place(row.line, row.line, row)
      return place(from, Number(el.dataset.mdTo), box)
    }
    return null
  }
  const givePlace = (inWrite: boolean, at: Place): void => {
    const sc = bodyRef.current
    if (!sc) return
    /** The place as a client Y on the surface now showing — null where it cannot say. */
    const find = (): number | null => {
      if (inWrite) {
        const a = writer.current?.lineBox(at.from)
        const b = writer.current?.lineBox(at.to)
        return a && b ? a.top + at.frac * (b.bottom - a.top) : null
      }
      for (const el of leafBlocks(sc)) {
        const from = Number(el.dataset.mdFrom)
        const to = Number(el.dataset.mdTo)
        if (to < at.from) continue
        const box = blockBox(el)
        if (!box) continue
        // A line READ draws nothing for — a blank one — is where the next block starts.
        if (from > at.from) return box.top
        // A table's line is its row — the separator, drawn as nothing, stands
        // for the row under it.
        const row = tableRows(el, from)?.find((r) => r.line >= at.from)
        if (row) return row.line === at.from ? row.top + at.frac * (row.bottom - row.top) : row.top
        // One block here can be a line apiece there — a list, a fence — so the
        // place is spread over the block's lines.
        const f = (at.from - from + at.frac * (at.to - at.from + 1)) / (to - from + 1)
        return box.top + Math.min(1, f) * (box.bottom - box.top)
      }
      // Past what READ has drawn: nowhere to keep.
      return null
    }
    /*
     * Once now, before anything is painted, and again for a few frames: the
     * editor has only ESTIMATED the lines it has not drawn, and drawing the
     * ones it lands on moves them. Until you scroll or type yourself — a
     * place is kept for you, not from you.
     */
    let frames = inWrite ? 8 : 2
    const yours = ['wheel', 'keydown', 'pointerdown'] as const
    const stop = (): void => {
      frames = -1
      for (const t of yours) sc.removeEventListener(t, stop)
    }
    for (const t of yours) sc.addEventListener(t, stop, { passive: true })
    const put = (): void => {
      const y = frames < 0 ? null : find()
      if (y == null) return stop()
      const dy = y - (seenTop(sc) + at.px)
      if (Math.abs(dy) > 1) sc.scrollTop += dy
      if (frames-- > 0) requestAnimationFrame(put)
      else stop()
    }
    put()
  }

  /*
   * QUOTE IN THE THREAD, from a selection — and where the selection lives
   * depends on which mode this is. A rendered document puts it in the window's
   * own selection. The editor has its own, which it reports as SOURCE — the
   * `**` and the `[[` of what you selected, not the flattened text — so in
   * WRITE this listener stands down and the editor's report is the one used.
   */
  useEffect(() => {
    if (write_on) return
    const onUp = (): void => {
      const sel = window.getSelection()
      const text = sel?.toString().trim() ?? ''
      if (!text || !bodyRef.current || !sel?.anchorNode) return setSelection('')
      setSelection(bodyRef.current.contains(sel.anchorNode) ? text : '')
    }
    document.addEventListener('mouseup', onUp)
    return () => document.removeEventListener('mouseup', onUp)
  }, [write_on])

  /** What state the note is in, in the fewest words that say it. */
  const metaHint = readOnly
    ? 'read only — its folder is kept read only (Settings → Notes & lanes)'
    : write_on
      ? // Nothing to say while every word is on disk — a label saying "saves as
        // you type" forever is chrome the eye has to step over. Said only when
        // it stops being true.
        (saveTrouble ?? '')
      : 'double-click to write there'

  return (
    /*
     * The outline is a SIBLING of the scrollport, laid over the pane's own
     * margin — never in flow beside it, which would shift the measure off
     * centre, and never inside it, which would scroll it away and change the
     * clientWidth its own gutter measurement reads.
     */
    <div style={{ flex: 1, minHeight: 0, position: 'relative', display: 'flex' }}>
    <div
      ref={bodyRef}
      data-find-scope="1"
      style={{
        flex: 1,
        minHeight: 0,
        overflowY: 'auto',
        overflowX: 'hidden',
        position: 'relative',
        // The outline is furniture in the margin, and where there is no margin
        // this is what makes one. See `paneGutters`.
        ...(tocClosed
          ? { padding: `0 ${padX} 26px` }
          : { ...paneGutters(measure, TOC_ROOM), paddingBottom: 26, paddingTop: 0 })
      }}
      onCopy={(e) => {
        /*
         * A copy is WHAT YOU SELECTED. Two words out of a paragraph are two
         * words — this used to hand over the paragraph they were in, and across
         * blocks it handed over both whole blocks, because it worked in source
         * LINES and a line is not a selection.
         *
         * Within one block there is nothing to do: the browser's own copy is
         * already exactly the selected text, so it is left alone.
         *
         * Across blocks the markdown still matters — a list you paste as prose
         * has lost the thing that made it a list — so the source is what goes
         * over, but cut at both ends to where the selection actually starts and
         * stops. `plainToRaw` is what maps a rendered offset back into it, the
         * same walk that puts the caret where you clicked.
         */
        const sel = window.getSelection()
        if (!sel || sel.isCollapsed || !sel.rangeCount) return
        const range = sel.getRangeAt(0)
        const blockOf = (n: Node | null): HTMLElement | null =>
          ((n?.nodeType === 3 ? n.parentElement : (n as Element | null))?.closest(
            '[data-md-from]'
          ) as HTMLElement | null) ?? null
        const head = blockOf(range.startContainer)
        const tail = blockOf(range.endContainer)
        if (!head || !tail || head === tail) return

        const lines = draft.split('\n')
        const src = (el: HTMLElement): string =>
          lines
            .slice(Number(el.dataset.mdFrom), Number(el.dataset.mdTo) + 1)
            .join('\n')
        /** How many rendered characters of `el` come before a point in it. */
        const upTo = (el: HTMLElement, node: Node, offset: number): number => {
          const r = document.createRange()
          r.selectNodeContents(el)
          try {
            r.setEnd(node, offset)
          } catch {
            return 0
          }
          return r.toString().length
        }
        const a = Number(head.dataset.mdFrom)
        const b = Number(tail.dataset.mdTo)
        if (Number.isNaN(a) || Number.isNaN(b) || b < a) return

        const headSrc = src(head)
        const tailSrc = src(tail)
        const from = plainToRaw(
          headSrc,
          head.textContent ?? '',
          upTo(head, range.startContainer, range.startOffset)
        )
        const to = plainToRaw(
          tailSrc,
          tail.textContent ?? '',
          upTo(tail, range.endContainer, range.endOffset)
        )
        const middle = lines.slice(Number(head.dataset.mdTo) + 1, Number(tail.dataset.mdFrom))
        const parts = [headSrc.slice(from), ...middle, tailSrc.slice(0, to)]
        // A selection that begins at the very end of one block, or ends at the
        // very start of another, contributes nothing from it but a blank line.
        if (parts.length && !parts[0].trim()) parts.shift()
        if (parts.length && !parts[parts.length - 1].trim()) parts.pop()
        e.clipboardData.setData('text/plain', parts.join('\n'))
        e.preventDefault()
      }}
    >
      {header}

      {conflict ? (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '8px 10px',
            marginBottom: 12,
            borderRadius: 7,
            background: 'var(--chip)'
          }}
        >
          <div style={{ font: '400 10.5px/1.5 var(--sans)', color: 'var(--ink)' }}>
            This note changed on disk while you were editing it.
          </div>
          <div style={{ flex: 1 }} />
          <div
            onClick={onKeepMine}
            title="Write what is on screen over the version on disk"
            style={{
              font: '400 10.5px var(--sans)',
              color: 'var(--ink3)',
              cursor: 'pointer',
              flex: 'none',
              whiteSpace: 'nowrap'
            }}
          >
            Keep mine
          </div>
          <div
            onClick={() => {
              // Asking for the disk's version is asking to drop what is typed
              // here — so it is dropped first, or the save still on its way
              // would land on top of the version you just chose.
              bridge.current?.discard()
              onReload()
            }}
            style={{
              font: '600 10.5px var(--sans)',
              color: 'var(--ink)',
              cursor: 'pointer',
              flex: 'none',
              whiteSpace: 'nowrap'
            }}
          >
            Load the version on disk
          </div>
        </div>
      ) : null}

      {/*
        THE WRITING BAR. The mode pair on the left, because WRITE and READ are
        the two things this pane can be and the switch between them is the one
        control that has to be found without looking. The aids sit beside it and
        only in WRITE, since neither means anything over a rendered document.
      */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          paddingBottom: 12,
          font: '400 11px var(--sans)',
          color: 'var(--mute)'
        }}
      >
        {readOnly ? null : <ModePair on={write_on} onWriting={onWriting} />}
        <div style={{ minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {metaHint}
        </div>
        <div style={{ flex: 1 }} />
        {write_on
          ? (
              [
                ['focus', write.focus, () => onWrite({ ...write, focus: !write.focus }), 'Dim everything but the paragraph you are in'],
                ['typewriter', write.typewriter, () => onWrite({ ...write, typewriter: !write.typewriter }), 'Keep the line you are on at the same height']
              ] as const
            ).map(([label, on, hit, why]) => (
              <div
                key={label}
                onClick={hit}
                title={why}
                className="note-copy"
                data-aid={label}
                data-on={on ? '1' : '0'}
                style={{
                  cursor: 'pointer',
                  flex: 'none',
                  font: '400 11px var(--sans)',
                  color: on ? 'var(--ink)' : undefined,
                  textDecoration: on ? 'underline' : undefined,
                  textDecorationColor: 'var(--rule)',
                  textUnderlineOffset: 3
                }}
              >
                {label}
              </div>
            ))
          : null}
        {/*
          Beside `copy`, because it is the same verb: hand this note to somebody
          who is not in this app. The word says what happened rather than a
          badge appearing — the same 1400ms confirmation `copy` uses.
        */}
        <div
          onClick={() => {
            if (pdf === 'making') return
            setPdf('making')
            void window.lanes.notePdf(note.path).then((res) => {
              // Closing the save panel is a decision, not a failure: the word
              // goes back to what it was and nothing is announced.
              setPdf(res.ok ? 'saved' : res.reason === 'cancelled' ? null : 'failed')
              if (res.ok || res.reason !== 'cancelled') setTimeout(() => setPdf(null), 1800)
            })
          }}
          className="note-copy"
          data-pdf={pdf ?? 'idle'}
          title="Save this note as a PDF, drawn the way it reads here"
          style={{ cursor: 'pointer', flex: 'none', font: '400 11px var(--sans)' }}
        >
          {pdf === 'making' ? 'making…' : pdf === 'saved' ? 'saved' : pdf === 'failed' ? 'failed' : 'pdf'}
        </div>
        <div
          onClick={() => {
            void navigator.clipboard.writeText(draft).then(() => {
              setCopied(true)
              setTimeout(() => setCopied(false), 1400)
            })
          }}
          className="note-copy"
          style={{ cursor: 'pointer', flex: 'none', font: '400 11px var(--sans)' }}
        >
          {copied ? 'copied' : 'copy'}
        </div>
      </div>

      {write_on ? (
        <NoteEditor
          // Keyed by the note's identity, which a rename keeps: naming an
          // untitled note mid-sentence must not tear the editor down under
          // the caret, taking its history with it.
          key={noteId}
          cacheKey={noteId}
          path={note.path}
          editorRef={writer}
          body={draft}
          scale={scale}
          focusMode={write.focus}
          typewriter={write.typewriter}
          scroller={bodyRef}
          onSelect={setSelection}
          onChange={writeBody}
          onPending={(owes) => {
            editorOwes.current = owes
            report()
          }}
          onExitTop={() => focusTitle(true)}
          onEscape={() => leaveRef.current()}
          stretch={session}
          onWiki={onWiki}
        />
      ) : (
        <Doc
          body={draft}
          path={note.path}
          scale={scale}
          anchors
          dropTitle
          breaks
          onWiki={onWiki}
          onToggleTask={readOnly ? undefined : toggleTask}
          onWriteAt={readOnly ? undefined : writeAt}
          onOpenTail={
            readOnly
              ? undefined
              : () => {
                  landAt.current = 'end'
                  onWriting(true)
                }
          }
          onWrite={readOnly ? undefined : () => onWriting(true)}
          uncap={drawAll}
          comments="pane"
        />
      )}
      {/* The note's comments, beside the words they are about — read off
          whichever surface is up. */}
      <CommentMargin
        scroller={bodyRef}
        version={`${noteId}:${write_on ? 'w' : 'r'}:${draft.length}`}
        field={fieldView}
        onOpen={readOnly ? undefined : openOld}
        onSubmit={submitComment}
        onResolve={resolveComment}
        onClose={closeField}
      />
      {/* After the editor, so the editor is made by the time it is asked. */}
      <KeepPlace id={noteId} writing={write_on} take={takePlace} give={givePlace} />
      <KeepScroll id={noteId} writing={write_on} scroller={bodyRef} take={takePlace} give={givePlace} />

      {selection && quoteReady && !field ? (
        <div style={{ position: 'sticky', bottom: 0, display: 'inline-flex', gap: 6, width: 'fit-content' }}>
        <div
          // preventDefault on mousedown, or pressing this collapses the
          // selection and unmounts the very button being pressed.
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => {
            onQuote(selection)
            setSelection('')
          }}
          data-quote-offer="1"
          style={
            write_on
              ? {
                  position: 'sticky',
                  bottom: 0,
                  alignSelf: 'flex-start',
                  display: 'inline-flex',
                  alignItems: 'center',
                  padding: '5px 10px',
                  borderRadius: 6,
                  background: 'var(--raise)',
                  color: 'var(--ink3)',
                  boxShadow: '0 0 0 1px var(--edge), var(--sh1)',
                  font: '500 10.5px var(--sans)',
                  cursor: 'pointer'
                }
              : {
                  position: 'sticky',
                  bottom: 0,
                  alignSelf: 'flex-start',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '7px 13px',
                  borderRadius: 7,
                  background: 'var(--ink)',
                  color: 'var(--onInk)',
                  font: '600 10.5px var(--sans)',
                  cursor: 'pointer'
                }
          }
        >
          {write_on ? 'Quote in the thread →' : 'QUOTE IN THE THREAD →'}
        </div>
        {readOnly ? null : (
          <div
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => openNew()}
            data-comment-offer="1"
            title="Comment on these words — ⌥⌘M"
            style={
              write_on
                ? {
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '5px 10px',
                    borderRadius: 6,
                    background: 'var(--raise)',
                    color: 'var(--ink3)',
                    boxShadow: '0 0 0 1px var(--edge), var(--sh1)',
                    font: '500 10.5px var(--sans)',
                    cursor: 'pointer'
                  }
                : {
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '7px 13px',
                    borderRadius: 7,
                    background: 'var(--raise)',
                    color: 'var(--ink)',
                    boxShadow: '0 0 0 1px var(--edge), var(--sh1)',
                    font: '600 10.5px var(--sans)',
                    cursor: 'pointer'
                  }
            }
          >
            {noComment ? 'Not here — a comment goes on words' : write_on ? 'Comment' : 'COMMENT'}
            <span style={{ font: '400 9.5px var(--mono)', color: 'var(--faint)' }}>⌥⌘M</span>
          </div>
        )}
        </div>
      ) : null}
    </div>

    {/* A note with one heading or none has no outline; a thread never has one
        at all, since only this body renders anchors for it. */}
    {toc.length > 1 ? (
      <Outline
        rows={toc}
        active={geo.act}
        closed={tocClosed}
        measure={measure}
        onToggle={() => onToc(!tocClosed)}
        onGo={tocGo}
      />
    ) : null}
    {asking && write_on ? (
      <DiscardAsk
        title={note.title}
        over={bodyRef.current?.closest('[data-pane]') ?? null}
        onKeep={keepWriting}
        onDiscard={throwAway}
      />
    ) : null}
    </div>
  )
}

/**
 * WHERE EACH NOTE WAS LEFT, by the note's identity, for as long as the app is
 * up. Bounded: the least recently left goes first.
 */
const leftAt = new Map<string, { top: number; place: Place | null }>()

/**
 * A NOTE IS WHERE YOU LEFT IT. The note pane has one scrollport, and every note
 * shown in it is shown at whatever offset the last one left there — so going
 * back to a tab put you at a place in the note that was really a place in the
 * one before it, and a short note opened under a long one opened at its end.
 *
 * The place is taken as you leave, in the note's own terms where it can be
 * (`take`: which source line, how far into it), and given back as you arrive —
 * a note written to from outside meanwhile still comes back to the words you
 * were at, not to the pixel. A note never left before opens at its top.
 *
 * A class for the same reason as `KeepPlace`: `getSnapshotBeforeUpdate` is the
 * one moment the note being left is still the one on the page. And kept as the
 * pane unmounts — a tab still `opening…`, the split closed — so the note shown
 * after that comes back too.
 */
class KeepScroll extends Component<{
  id: string
  writing: boolean
  scroller: React.RefObject<HTMLDivElement | null>
  take: (inWrite: boolean) => Place | null
  give: (inWrite: boolean, place: Place) => void
}> {
  private keep(id: string, writing: boolean): void {
    const sc = this.props.scroller.current
    if (!sc) return
    leftAt.delete(id)
    leftAt.set(id, { top: sc.scrollTop, place: this.props.take(writing) })
    while (leftAt.size > 200) leftAt.delete(leftAt.keys().next().value as string)
  }
  private arrive(): void {
    const sc = this.props.scroller.current
    if (!sc) return
    const was = leftAt.get(this.props.id)
    // The offset first — the top, for a note never left — and the words over
    // it: a place the note no longer has leaves the offset standing.
    sc.scrollTop = was?.top ?? 0
    if (was?.place) this.props.give(this.props.writing, was.place)
  }
  componentDidMount(): void {
    this.arrive()
  }
  getSnapshotBeforeUpdate(prev: { id: string; writing: boolean }): boolean {
    if (prev.id === this.props.id) return false
    this.keep(prev.id, prev.writing)
    return true
  }
  componentDidUpdate(_prev: unknown, _state: unknown, moved: boolean): void {
    if (moved) this.arrive()
  }
  componentWillUnmount(): void {
    this.keep(this.props.id, this.props.writing)
  }
  render(): null {
    return null
  }
}

/**
 * THE QUESTION ESC ASKS when leaving WRITE would throw words away.
 *
 * Built so it cannot be answered by accident. Esc is no, so esc pressed again
 * and again opens it and closes it and never discards; ↵ is no as well, since
 * the default is the answer that loses nothing; a click on the veil is no.
 * Yes is a click on Discard, or ⌘⌫ — never a key you might already be
 * pressing. Every other key stops here while it is up, so ⌘K or a tab switch
 * cannot happen behind it.
 *
 * Over the note it is about, on a veil across the window: it is a modal
 * because the choice is about everything written, and nothing else should be
 * going on while it is made.
 */
function DiscardAsk({
  title,
  over,
  onKeep,
  onDiscard
}: {
  title: string
  /** The pane the note is in — the card stands over it. */
  over: Element | null
  onKeep: () => void
  onDiscard: () => void
}): React.JSX.Element {
  const keep = useRef<HTMLButtonElement>(null)
  const toss = useRef<HTMLButtonElement>(null)
  const latest = useRef({ onKeep, onDiscard })
  latest.current = { onKeep, onDiscard }
  useLayoutEffect(() => {
    keep.current?.focus()
  }, [])
  useEffect(() => {
    const on = (e: KeyboardEvent): void => {
      e.stopImmediatePropagation()
      if (e.key === 'Escape') {
        e.preventDefault()
        if (!e.repeat) latest.current.onKeep()
        return
      }
      if (e.metaKey && e.key === 'Backspace') {
        e.preventDefault()
        latest.current.onDiscard()
        return
      }
      if (e.key === 'Tab') {
        // Two buttons, and the focus stays between them.
        e.preventDefault()
        ;(document.activeElement === keep.current ? toss : keep).current?.focus()
        return
      }
      // ↵ and space press the focused button, as they do anywhere. Everything
      // else is swallowed — a chord behind a modal is a chord nobody meant.
      if (e.key !== 'Enter' && e.key !== ' ') e.preventDefault()
    }
    window.addEventListener('keydown', on, true)
    return () => window.removeEventListener('keydown', on, true)
  }, [])
  const box = over?.getBoundingClientRect()
  const button = {
    appearance: 'none',
    border: 0,
    borderRadius: 7,
    padding: '7px 12px',
    cursor: 'pointer',
    display: 'inline-flex',
    alignItems: 'baseline',
    gap: 8,
    font: '500 11.5px var(--sans)'
  } as const
  const hint = { font: '400 9.5px var(--mono)', letterSpacing: '.04em', opacity: 0.6 } as const
  return createPortal(
    <div
      data-leave-ask="1"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) {
          e.preventDefault()
          latest.current.onKeep()
        }
      }}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 60,
        background: 'var(--veil2)',
        animation: 'veilIn .12s ease-out'
      }}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="leave-ask-q"
        style={{
          position: 'absolute',
          left: box ? box.left + box.width / 2 : '50%',
          top: box ? box.top + box.height * 0.36 : '36%',
          transform: 'translate(-50%, -50%)',
          width: 'min(360px, calc(100vw - 48px))',
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
          padding: '17px 19px 15px',
          borderRadius: 12,
          background: 'var(--sheet)',
          boxShadow: 'var(--sh3)'
        }}
      >
        <div style={{ font: '600 8.5px var(--mono)', letterSpacing: '.16em', color: 'var(--mute)' }}>
          DISCARD CHANGES
        </div>
        <div
          id="leave-ask-q"
          style={{ font: '500 13px/1.5 var(--sans)', color: 'var(--ink)', textWrap: 'pretty' }}
        >
          Put “{title}” back as it was when you started writing, and leave WRITE?
        </div>
        <div style={{ font: '400 11px/1.5 var(--sans)', color: 'var(--ink3)', textWrap: 'pretty' }}>
          Changes that arrived from elsewhere meanwhile stay. ⌘E leaves and keeps yours.
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, paddingTop: 6 }}>
          <button
            ref={toss}
            data-leave="discard"
            className="leave-btn"
            onClick={() => latest.current.onDiscard()}
            style={{ ...button, background: 'transparent', color: 'var(--ink2)', boxShadow: 'inset 0 0 0 1px var(--edge)' }}
          >
            Discard <span style={hint}>⌘⌫</span>
          </button>
          <button
            ref={keep}
            data-leave="keep"
            className="leave-btn"
            onClick={() => latest.current.onKeep()}
            style={{ ...button, background: 'var(--ink)', color: 'var(--onInk)', fontWeight: 600 }}
          >
            Keep writing <span style={hint}>esc</span>
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}
