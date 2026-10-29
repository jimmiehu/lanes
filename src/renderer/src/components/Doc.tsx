import { Fragment, useContext, useEffect, useMemo, useRef, useState } from 'react'
import {
  DocPathContext,
  FileLink,
  HrefLink,
  InThread,
  NoteLink,
  PathCode,
  threadLinks,
  VaultNamesContext,
  WikiContext,
  WikiMenuContext,
  type Follow
} from './Runs'
import { parseNote, sliceHeading, type NoteBlock } from '@shared/doc'
import type { Run } from '@shared/blocks'
import { offsetAtPoint, plainToRaw } from '../lib/sourceAt'
import { classify } from '@shared/mdLive'
import { findComments, type NoteComment } from '@shared/comments'
import CopyChip from './CopyChip'
import { CommentGlyph } from './Comments'
import { HEAD_AIR } from '../lib/headAir'

/**
 * A note rendered as markdown. `scale` is 1 in the column and pane, 1.2 in the
 * full-screen view, as the original design has it.
 */

/**
 * Blocks drawn before READ stops and says so. See the note in the component.
 * Chosen against a note of tens of thousands of blocks: 1,500 draws in about
 * 200ms, which is a pause; the whole note took eight seconds, which is a hang.
 */
const CAP = 1500

/**
 * The pause a blank line makes between two blocks: a whole line, the body's
 * 13.5px at 1.78 — the height WRITE draws that blank line at, since a blank
 * line there is simply a line (styles/global.css). Drawn as this less the 2px a
 * paragraph keeps above and below its words.
 */
const PAUSE = 13.5 * 1.78

/**
 * How a document draws its comments. `pane` is the note in its pane: each one
 * a marker the margin reads (components/Comments.tsx), keyed by its place in
 * the note's list (`findComments`). `print` is paper, where a review's marks
 * are not the document: the anchors' words plain, the comments gone. Unset — a
 * thread, a note embedded in another — a marker whose words are its tooltip.
 */
type CommentMode = 'pane' | 'print'

/**
 * The comments one run of inline text draws, as places in the note's list, in
 * order — a block hands each of its runs its own share (`share` in Doc), so a
 * table's cells and a fold's summary each know which of the block's are theirs.
 */
interface BlockComments {
  mode?: CommentMode
  found: readonly NoteComment[]
  ids: readonly number[]
}

function Inline({
  runs,
  onWiki,
  cmt
}: {
  runs: Run[]
  onWiki?: Follow
  cmt?: BlockComments
}): React.JSX.Element {
  const menu = useContext(WikiMenuContext)
  /*
   * A transcript renders through Doc without handing it an onWiki — its follow
   * handler is published on WikiContext by the message stream, the way it
   * always was. Reading only the prop made every `[[wikilink]]` in a reply
   * inert the moment the document engine took over the transcript.
   */
  const fromContext = useContext(WikiContext)
  const follow = onWiki ?? fromContext ?? undefined
  // In a thread, a bare note name or a path to a vault file is a link — see
  // `threadLinks`.
  const names = useContext(VaultNamesContext)
  const vault = useContext(InThread) ? names : null
  const mode = cmt?.mode
  /*
   * Which comment each comment run is — and, for one with an anchor, the anchor
   * runs that lead to it, so the margin can light the words a comment is about.
   */
  const keys: (string | undefined)[] = []
  if (mode === 'pane' && cmt) {
    let n = 0
    runs.forEach((r, i) => {
      if (r.comment === undefined) return
      const id = cmt.ids[n++]
      if (id === undefined) return
      keys[i] = `r${id}`
      if (cmt.found[id]?.anchor) for (let j = i - 1; j >= 0 && runs[j].anchor; j--) keys[j] = keys[i]
    })
  }
  const piece = (r: Run, i: number): React.ReactNode => {
    if (r.comment !== undefined) {
      if (mode === 'print') return null
      if (mode === 'pane') {
        const id = keys[i]
        return (
          <span
            key={i}
            className="cmt-at"
            data-cmt-at={id}
            data-cmt-text={r.comment}
            data-cmt-bare={id && cmt?.found[Number(id.slice(1))]?.anchor ? undefined : '1'}
            title={r.comment}
          >
            <CommentGlyph />
          </span>
        )
      }
      return (
        <span key={i} className="cmt-at cmt-free" title={r.comment}>
          <CommentGlyph />
        </span>
      )
    }
    const drawn = run(r, i)
    if (!r.anchor || mode === 'print') return drawn
    return (
      <span key={i} className="cmt-anchor" data-cmt-anchor={keys[i]}>
        {drawn}
      </span>
    )
  }
  return <>{runs.map(piece)}</>

  function run(r: Run, i: number): React.ReactNode {
    // A link in a highlight is on the marker colour too.
    const lit = (node: React.ReactNode): React.ReactNode =>
      r.highlight ? (
        <span key={i} style={{ background: 'var(--hl)' }}>
          {node}
        </span>
      ) : (
        node
      )
    if (r.wiki) {
      return lit(
        <NoteLink key={i} target={r.wiki} follow={follow} menu={menu}>
          {r.text}
        </NoteLink>
      )
    }
    if (r.href) {
      // A markdown link is the web's, or — written as a path — a note or a
      // file in the vault. See `fileAddress`.
      return lit(
        <HrefLink key={i} href={r.href} follow={follow} menu={menu}>
          {r.text}
        </HrefLink>
      )
    }
    const style: React.CSSProperties = {
      fontWeight: r.bold ? 600 : undefined,
      fontStyle: r.italic ? 'italic' : undefined,
      fontFamily: r.code ? 'var(--mono)' : undefined,
      fontSize: r.code ? '0.92em' : undefined,
      // A highlight is the marker colour, and nothing that moves a word: WRITE
      // draws it the same. Code in one keeps its own ground.
      background: r.code ? 'var(--div2)' : r.highlight ? 'var(--hl)' : undefined,
      borderRadius: r.code ? 3 : undefined,
      padding: r.code ? '1px 4px' : undefined
    }
    const parts = vault ? threadLinks(r.text, vault) : null
    if (parts) {
      return (
        <Fragment key={i}>
          {parts.map((p, j) =>
            p.note ? (
              <NoteLink key={j} target={p.note} address follow={follow} menu={menu}>
                <span style={style}>{p.text}</span>
              </NoteLink>
            ) : p.file ? (
              <FileLink key={j} path={p.file}>
                <span style={style}>{p.text}</span>
              </FileLink>
            ) : (
              <span key={j} style={style}>
                {p.text}
              </span>
            )
          )}
        </Fragment>
      )
    }
    const drawn = (
      <span key={i} style={style}>
        {r.text}
      </span>
    )
    return r.code ? (
      <PathCode key={i} text={r.text}>
        {drawn}
      </PathCode>
    ) : (
      drawn
    )
  }
}

/**
 * The disclosure itself.
 *
 * `open` is set ONCE, on mount, and never again — after that the element owns
 * its own state. Handing React the `open` prop would make every re-render of
 * the note an opinion about which sections should be open, and a note
 * re-renders on every tick of a checkbox and every keystroke that reaches it:
 * a section would slam shut under the reader for touching something else.
 */
function Fold({
  summary,
  open,
  px,
  children
}: {
  summary: React.ReactNode
  open: boolean
  px: (n: number) => number
  children: React.ReactNode
}): React.JSX.Element {
  const el = useRef<HTMLDetailsElement>(null)
  useEffect(() => {
    if (el.current) el.current.open = open
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return (
    <details ref={el} className="fold" data-fold="1">
      <summary>
        {/* The chevron turns; nothing else moves. */}
        <svg
          className="fold-chev"
          width="9"
          height="9"
          viewBox="0 0 14 14"
          fill="none"
          stroke="var(--mute)"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M5.5 3l4 4-4 4" />
        </svg>
        <span
          className="fold-label"
          style={{ font: `600 ${px(12.5)}px/1.45 var(--sans)`, color: 'var(--ink2)' }}
        >
          {summary}
        </span>
        {/* The rule carries the eye across, and says the row is a divider
            rather than a sentence. */}
        <span className="fold-rule" />
      </summary>
      <div className="fold-body">{children}</div>
    </details>
  )
}

function EmbedShell({
  children,
  muted
}: {
  children: React.ReactNode
  /** Nothing came of it — a missing note, a missing heading, a cycle. */
  muted?: boolean
}): React.JSX.Element {
  // Marked, so a selection running through it is not read as this note's lines.
  return (
    <div
      data-embed="1"
      style={{
        margin: '4px 0',
        padding: muted ? '8px 10px' : '2px 12px',
        borderRadius: 6,
        background: 'var(--card)',
        boxShadow: 'inset 0 0 0 1px var(--edge)',
        font: muted ? '400 10.5px var(--mono)' : undefined,
        color: muted ? 'var(--mute)' : undefined
      }}
    >
      {children}
    </div>
  )
}

/** `![[note]]` / `![[note#Heading]]` — the target's own content, inline. */
function Embed({
  target,
  heading,
  scale,
  onWiki,
  visited
}: {
  target: string
  heading: string | null
  scale: number
  onWiki?: Follow
  visited: readonly string[]
}): React.JSX.Element {
  type Resolved =
    | { kind: 'loading' }
    | { kind: 'missing' }
    | { kind: 'circular' }
    | { kind: 'no-heading' }
    | { kind: 'ready'; path: string; body: string }

  const [resolved, setResolved] = useState<Resolved>({ kind: 'loading' })

  useEffect(() => {
    let live = true
    setResolved({ kind: 'loading' })
    void window.lanes.resolveLink(target).then(async (path) => {
      if (!live) return
      if (!path) return setResolved({ kind: 'missing' })
      if (visited.includes(path)) return setResolved({ kind: 'circular' })
      const note = await window.lanes.note(path)
      if (!live) return
      if (!note) return setResolved({ kind: 'missing' })
      if (!heading) return setResolved({ kind: 'ready', path, body: note.body })
      const section = sliceHeading(note.body, heading)
      if (section == null) return setResolved({ kind: 'no-heading' })
      setResolved({ kind: 'ready', path, body: section })
    })
    return () => {
      live = false
    }
  }, [target, heading, visited])

  const label = heading ? `${target}#${heading}` : target

  if (resolved.kind === 'loading') return <EmbedShell muted>Loading {label}…</EmbedShell>
  if (resolved.kind === 'missing') return <EmbedShell muted>Could not find “{label}”.</EmbedShell>
  if (resolved.kind === 'circular') {
    return <EmbedShell muted>“{label}” embeds this note — stopped here.</EmbedShell>
  }
  if (resolved.kind === 'no-heading') {
    return (
      <EmbedShell muted>
        “{target}” has no heading “{heading}”.
      </EmbedShell>
    )
  }
  return (
    <EmbedShell>
      <Doc
        body={resolved.body}
        path={resolved.path}
        scale={scale}
        onWiki={onWiki}
        visited={[...visited, resolved.path]}
        breaks
      />
    </EmbedShell>
  )
}

export default function Doc({
  body,
  path,
  scale = 1,
  onWiki,
  onToggleTask,
  visited,
  anchors = false,
  dropTitle = false,
  breaks = false,
  onWriteAt,
  onOpenTail,
  onWrite,
  uncap,
  comments
}: {
  body: string
  /** The note this body came from — an embed needs it to catch a cycle. */
  path: string
  scale?: number
  onWiki?: Follow
  /** Absent on a read-only note, which leaves the boxes inert. */
  onToggleTask?: (line: number, done: boolean) => void
  /** Notes already embedding into this one; unset at the top of a pane. */
  visited?: readonly string[]
  /**
   * Emit `data-toc` on the headings that open a section, for the note outline
   * to index and scroll to. LEVEL 2 AND 3 ONLY, and load-bearing: the outline
   * pairs its nth row with the nth anchor, so an h1 in the set would shift
   * every highlight by one. A thread passes nothing — same renderer, no
   * outline — and so does an embedded note, whose lines are another file's.
   */
  anchors?: boolean
  /**
   * Skip the note's own title. The head states it two lines above, in the right
   * type for a title — drawing it again at the top of the document is the same
   * words twice, and the second one is not even the one you can rename.
   */
  dropTitle?: boolean
  /**
   * A single newline inside a paragraph is a line break. True for a note: a
   * note is written in an editor where it is one, and the writing surface
   * shows it as one — READ joining those lines back into a single run would be
   * the two surfaces disagreeing about the same text. A thread passes nothing
   * and keeps markdown's own rule, which is how a model writes.
   */
  breaks?: boolean
  /**
   * A double-click in READ is a request to write THERE: the source line and
   * column under the pointer. Absent where nothing can be written.
   */
  onWriteAt?: (line: number, col: number) => void
  /** The room under the last block: write at the end of the note. */
  onOpenTail?: () => void
  /** Offered when the document is too long to draw whole. See `CAP`. */
  onWrite?: () => void
  /** Draw it whole regardless — what the outline asks for when a row it holds
      is past the cap. Going to a section IS asking for the rest of it. */
  uncap?: boolean
  /** How its comments are drawn — see `CommentMode`. */
  comments?: CommentMode
}): React.JSX.Element {
  // Not rounded: WRITE sets the same sizes as `calc(n * scale)`, and READ must
  // land on exactly the same size at every text size, not a tenth of a pixel off.
  const px = (n: number): number => n * scale
  /*
   * Memoised. This was re-parsing the whole note on every render — every
   * keystroke in a block, every scroll that moved the outline's mark, every
   * render of the pane around it. Over 100ms a time on a long note, for an
   * answer that had not changed.
   */
  const blocks = useMemo(() => parseNote(body, { breaks }), [body, breaks])
  const chain = useMemo(() => visited ?? [path], [visited, path])
  const canEdit = Boolean(onWriteAt)
  /** The note's comments, in its pane: each block draws its own share of them. */
  const found = useMemo(() => (comments === 'pane' ? findComments(body) : []), [body, comments])

  /**
   * A block's comments, handed to its runs in the order they are drawn: each
   * call takes as many as that run of text holds. A block's comments are the
   * ones on its own lines — a fold's are the ones on its tags, its summary's,
   * the blocks inside it having their own.
   */
  const share = (b: NoteBlock): ((runs: Run[]) => BlockComments | undefined) => {
    if (comments !== 'pane') return () => (comments ? { mode: comments, found, ids: [] } : undefined)
    const inner = (l: number): boolean =>
      b.kind === 'details' && b.blocks.some((c) => l >= c.span.from && l <= c.span.to)
    const ids: number[] = []
    found.forEach((c, k) => {
      if (c.line >= b.span.from && c.line <= b.span.to && !inner(c.line)) ids.push(k)
    })
    let n = 0
    return (runs) => {
      const k = runs.reduce((s, r) => s + (r.comment !== undefined ? 1 : 0), 0)
      const mine = ids.slice(n, n + k)
      n += k
      return { mode: comments, found, ids: mine }
    }
  }

  /**
   * HOW MUCH OF A LONG DOCUMENT IS DRAWN AT ONCE.
   *
   * Parsing a note is cheap; drawing it is not. A note can come to tens of
   * thousands of blocks, and rendering one that size took eight seconds of
   * frozen window — and then left as many elements behind to scroll. There is
   * no reading experience in that, so READ draws the first `CAP` and says what
   * it has not drawn.
   *
   * Deliberately a stated cap with a way past it rather than silent windowing:
   * a reader who has scrolled to the end of what is drawn should be told that
   * is what happened, and offered the two things that actually help — the rest
   * of the document, or WRITE, which shows any note whole and opens instantly.
   */
  const [uncapped, setUncapped] = useState(false)
  useEffect(() => setUncapped(false), [path])
  const capped = !uncapped && !uncap && blocks.length > CAP
  const drawn = capped ? blocks.slice(0, CAP) : blocks

  /**
   * The outline's anchor for a heading, on the real box the heading draws —
   * never on the `display: contents` wrapper around it, which generates no box
   * and measures as zeros.
   */
  const anchor = (b: NoteBlock): Record<string, string> =>
    anchors && b.kind === 'heading' && (b.level === 2 || b.level === 3)
      ? { 'data-toc': `h${b.span.from}` }
      : {}

  /**
   * What a block hands its container so a double-click on it writes there.
   *
   * READ does not edit any more — one surface does, and this is the way into
   * it. The pointer's place in the rendered text is walked back to a place in
   * the source (`plainToRaw`, the same walk a copy uses), and the pane flips to
   * WRITE with the caret there: you double-click the word you meant to change
   * and you are standing on it. Double, because a single click is how you
   * follow a link, tick a box, or put the pointer down while reading.
   */
  const hot = (b: NoteBlock): Record<string, unknown> =>
    canEdit
      ? {
          onDoubleClick: (e: React.MouseEvent) => {
            const el = e.currentTarget as HTMLElement
            const lines = body.split('\n')
            const raw = lines.slice(b.span.from, b.span.to + 1).join('\n')
            // The marker is not in what READ drew, so the walk starts after it.
            // Starting before it matched the words against the marker itself
            // wherever they begin alike — `1. 1990…`, `## #tag` — and put the
            // caret inside the ordinal or the hashes.
            const c = classify(lines[b.span.from] ?? '')
            const lead = 'markTo' in c ? c.markTo : 0
            const po = offsetAtPoint(el, e.clientX, e.clientY)
            const at = lead + (po === null ? 0 : plainToRaw(raw.slice(lead), el.textContent ?? '', po))
            const before = raw.slice(0, at).split('\n')
            onWriteAt?.(b.span.from + before.length - 1, before[before.length - 1].length)
          }
        }
      : {}

  /**
   * Each block is wrapped in a marker carrying the source lines it came from.
   * `display: contents` so the wrapper changes no layout, and `closest()` walks
   * to it regardless — that is how a copy turns a selection back into markdown.
   */
  /**
   * A block in its source-span marker. Hoisted out of the top-level map because
   * a folded section renders blocks too, and they need exactly the same
   * treatment — `closest('[data-md-from]')` is how a selection is turned back
   * into markdown, and a paragraph inside a fold is no less copyable for being
   * inside one.
   */
  const wrap = (b: NoteBlock, key: React.Key, prev?: NoteBlock): React.ReactNode => (
    <Fragment key={key}>
      {pause(prev, b)}
      <div data-md-from={b.span.from} data-md-to={b.span.to} style={{ display: 'contents' }}>
        {renderBlock(b, key)}
      </div>
    </Fragment>
  )

  /**
   * A BLANK LINE IS A LINE. Where one parts two blocks, READ leaves the whole
   * line WRITE draws it as, so ⌘E moves no paragraph — it used to leave only
   * the 4px two paragraphs keep, then half a line, and a blank line barely
   * showed on either. Beside a heading the heading's own air is the space, as
   * it is in WRITE, and nothing is added to it.
   *
   * A thread too. A reply's paragraphs are parted by blank lines like a note's,
   * and drawn 4px apart they ran together into one slab of prose; a thread
   * keeps markdown's rule for a newline, but not that.
   *
   * Outside the span markers, so every block is still the one child of its
   * own. It is the blank line, drawn, so in a note a double-click in it writes
   * there.
   */
  const pause = (prev: NoteBlock | undefined, b: NoteBlock): React.ReactNode => {
    if (!prev || b.span.from <= prev.span.to + 1) return null
    if (prev.kind === 'heading' || b.kind === 'heading') return null
    const blank = prev.span.to + 1
    return (
      <div
        aria-hidden
        data-md-pause="1"
        onDoubleClick={
          canEdit
            ? (e) => {
                e.stopPropagation()
                onWriteAt?.(blank, 0)
              }
            : undefined
        }
        style={{ flex: 'none', height: px(PAUSE) - 4 }}
      />
    )
  }

  const page = (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      {drawn.map((b, i) =>
        /*
         * The title, where the head is already saying it. Only the FIRST block
         * and only an h1: an h1 further down is a heading somebody wrote, and a
         * note whose first block is not one has no title of its own to drop —
         * its name comes from the filename, and nothing is doubled.
         */
        dropTitle && i === 0 && b.kind === 'heading' && b.level === 1 ? null : wrap(b, i, drawn[i - 1])
      )}
      {/* What has not been drawn, said plainly, with the two things that help:
          the rest of it, or the surface that shows any note whole. */}
      {capped ? (
        <div
          style={{
            margin: '18px 0 4px',
            padding: '11px 13px',
            borderRadius: 7,
            background: 'var(--card)',
            boxShadow: 'inset 0 0 0 1px var(--edge)',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            flexWrap: 'wrap'
          }}
          data-doc-capped="1"
        >
          <div style={{ font: `400 ${px(12)}px/1.5 var(--sans)`, color: 'var(--ink3)' }}>
            Showing the first {CAP.toLocaleString()} of {blocks.length.toLocaleString()} blocks.
            A note this long is quicker to work in than to render.
          </div>
          <div style={{ flex: 1 }} />
          {onWrite ? (
            <div onClick={onWrite} className="note-copy" data-doc-to-write="1"
              style={{ cursor: 'pointer', flex: 'none', font: `600 ${px(11)}px var(--sans)`, color: 'var(--ink)' }}>
              Open it in WRITE
            </div>
          ) : null}
          <div onClick={() => setUncapped(true)} className="note-copy" data-doc-show-all="1"
            style={{ cursor: 'pointer', flex: 'none', font: `400 ${px(11)}px var(--sans)` }}>
            Draw the rest anyway
          </div>
        </div>
      ) : null}

      {/* The room under the last block: a double-click there writes at the
          end of the note, which is where you add to it. Not while the
          document is cut short — the room under what has been drawn is not
          the end of the note. */}
      {canEdit && !capped ? (
        <div
          onDoubleClick={(e) => {
            e.stopPropagation()
            onOpenTail?.()
          }}
          style={{ minHeight: 40, cursor: 'text' }}
        />
      ) : null}
    </div>
  )
  // The note a path in it is found nearest to. An embed is another note's
  // words, so it says its own.
  return <DocPathContext.Provider value={path}>{page}</DocPathContext.Provider>

  function renderBlock(b: NoteBlock, i: React.Key): React.ReactNode {
    // Called in the order the runs are drawn, which is the order they are written.
    const take = share(b)
    {
        switch (b.kind) {
          case 'heading': {
            /*
             * THE FOUR LEVELS, BUILT TO BE TOLD APART AT SKIMMING SPEED.
             *
             * They were not. `##` was 9px mono in `--mute` — smaller and
             * quieter than the body text under it — and `###` was 12px against
             * a 13.5px body, so the two headings a long note actually uses were
             * both LESS present than the prose they were meant to divide. You
             * could not find a section by scrolling; you had to read for it.
             *
             * What changed is presence, not voice. `##` keeps the uppercase
             * tracked mono the design gives everything structural — it opens a
             * section, and a section heading is a label for the blocks beneath
             * it — but at full ink, a size you can read, and over a hairline
             * that runs the measure. The rule is what the eye actually catches: caps
             * alone are a texture, a rule is an edge.
             *
             * Below it the ladder is sans and descends by size and by weight of
             * colour, each with more air above than below so a heading belongs
             * to what follows it rather than floating between two sections.
             */
            const head = {
              1: {
                font: `600 ${px(18)}px/1.3 var(--sans)`,
                letterSpacing: '-.012em',
                color: 'var(--ink)',
                padding: '10px 0 6px'
              },
              2: {
                font: `600 ${px(10.5)}px/1.4 var(--mono)`,
                letterSpacing: '.16em',
                textTransform: 'uppercase' as const,
                color: 'var(--ink)',
                // The rule and the air around it, in one box: 30 above, the
                // hairline, 13 under it, then the label, then 9 to the prose.
                marginTop: 30,
                // The hairline and the 13px under it: HEAD_AIR, which WRITE
                // lands by as well.
                paddingTop: HEAD_AIR[2] - 1,
                paddingBottom: 9,
                borderTop: '1px solid var(--hr)'
              },
              3: {
                font: `600 ${px(14.5)}px/1.4 var(--sans)`,
                letterSpacing: '-.006em',
                color: 'var(--ink)',
                padding: `${HEAD_AIR[3]}px 0 4px`
              },
              4: {
                font: `600 ${px(12.5)}px/1.45 var(--sans)`,
                letterSpacing: '.005em',
                color: 'var(--ink3)',
                padding: '16px 0 2px'
              }
            }[b.level]

            /*
             * A heading at the very top has nothing to divide, so `##` drops
             * the rule and its 30px of air there — a note that opens on a
             * section otherwise began with a line across the page.
             */
            const first = i === 0 || (dropTitle && i === 1)
            const style =
              b.level === 2 && first
                ? { ...head, marginTop: 0, paddingTop: 0, borderTop: 'none' }
                : head

            return (
              <div
                key={i}
                {...anchor(b)}
                {...hot(b)}
                data-md-runs="1"
                style={{ ...style, textWrap: 'pretty' }}
              >
                <Inline runs={b.runs} onWiki={onWiki} cmt={take(b.runs)} />
              </div>
            )
          }
          /*
           * A COLLAPSIBLE SECTION, drawn with the browser's own `<details>`.
           *
           * Native rather than a hand-rolled disclosure: it is keyboard
           * operable and announced correctly for free, ⌘F finds inside a closed
           * one and opens it, and it prints as whatever state it is in — none
           * of which a div with an onClick would give without being written
           * three more times.
           *
           * A double-click inside the fold writes at the block under the
           * pointer, not at the fold's own tags: its span covers the whole
           * section, and the place you meant is the line you pointed at.
           */
          case 'details':
            return (
              <Fold key={i} open={b.open} px={px} summary={<Inline runs={b.summary} onWiki={onWiki} cmt={take(b.summary)} />}>
                {b.blocks.map((c, j) => wrap(c, `${c.span.from}:${c.span.to}`, b.blocks[j - 1]))}
              </Fold>
            )
          case 'para':
            return (
              <div
                key={i}
                {...hot(b)}
                data-md-runs="1"
                style={{
                  padding: '2px 0',
                  borderRadius: 3,
                  font: `400 ${px(13.5)}px/1.78 var(--sans)`,
                  color: 'var(--body)',
                  textWrap: 'pretty',
                  whiteSpace: breaks ? 'pre-line' : undefined
                }}
              >
                <Inline runs={b.runs} onWiki={onWiki} cmt={take(b.runs)} />
              </div>
            )
          case 'item':
            return (
              <div key={i} style={{ display: 'flex', gap: 8, padding: '1px 0', marginLeft: px(20) * (b.depth ?? 0) }}>
                <div
                  style={{
                    flex: 'none',
                    minWidth: 12,
                    font: `400 ${px(10)}px var(--mono)`,
                    color: 'var(--mute)',
                    paddingTop: 4
                  }}
                >
                  {b.bullet}
                </div>
                <div
                  {...hot(b)}
                  data-md-runs="1"
                  style={{
                    flex: 1,
                    minWidth: 0,
                    borderRadius: 3,
                    font: `400 ${px(13.5)}px/1.7 var(--sans)`,
                    color: 'var(--body)',
                    textWrap: 'pretty'
                  }}
                >
                  <Inline runs={b.runs} onWiki={onWiki} cmt={take(b.runs)} />
                </div>
                {b.status ? (
                  /*
                   * Monotonic by contrast, never hue: `active` is the loudest
                   * thing on the row, `blocked` sits mid, `done` recedes. A
                   * palette with no colour still has three legible steps.
                   */
                  <div
                    style={{
                      flex: 'none',
                      alignSelf: 'baseline',
                      font: `${b.status === 'active' ? 600 : 400} ${px(10.5)}px var(--sans)`,
                      color:
                        b.status === 'active'
                          ? 'var(--ink)'
                          : b.status === 'blocked'
                            ? 'var(--ink3)'
                            : 'var(--mute)',
                      paddingTop: 3
                    }}
                  >
                    {b.status}
                  </div>
                ) : null}
              </div>
            )
          case 'task':
            return (
              <div
                key={i}
                style={{ display: 'flex', gap: 8, padding: '2px 0', alignItems: 'flex-start', marginLeft: px(20) * (b.depth ?? 0) }}
              >
                <div
                  onClick={onToggleTask ? () => onToggleTask(b.line, !b.done) : undefined}
                  title={onToggleTask ? (b.done ? 'Mark not done' : 'Mark done') : undefined}
                  className={onToggleTask ? 'task-box' : undefined}
                  style={{
                    width: 14,
                    height: 14,
                    flex: 'none',
                    marginTop: 4,
                    borderRadius: 3,
                    // A ring when empty, a fill when checked — an inset shadow
                    // rather than a border, so the box does not change size as
                    // it fills and the row never shifts under the pointer.
                    boxShadow: b.done ? 'none' : 'inset 0 0 0 1.5px var(--rule)',
                    // Done is settled, not loud — the quieter fill the editor uses.
                    background: b.done ? 'var(--ink3)' : 'transparent',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: onToggleTask ? 'pointer' : 'default'
                  }}
                >
                  {b.done ? (
                    <svg
                      width="8"
                      height="8"
                      viewBox="0 0 14 14"
                      fill="none"
                      stroke="var(--onInk)"
                      strokeWidth="2.4"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M3 7.4l2.6 2.6L11 4.2" />
                    </svg>
                  ) : null}
                </div>
                <div
                  {...hot(b)}
                  data-md-runs="1"
                  style={{
                    flex: 1,
                    minWidth: 0,
                    borderRadius: 3,
                    font: `400 ${px(13.5)}px/1.78 var(--sans)`,
                    color: b.done ? 'var(--mute)' : 'var(--body)',
                    textWrap: 'pretty'
                  }}
                >
                  <span
                    style={{
                      textDecoration: b.done ? 'line-through' : 'none',
                      textDecorationColor: 'var(--faint)'
                    }}
                  >
                    <Inline runs={b.runs} onWiki={onWiki} cmt={take(b.runs)} />
                  </span>
                </div>
              </div>
            )
          case 'quote':
            return (
              <div
                key={i}
                {...hot(b)}
                data-md-runs="1"
                style={{
                  margin: '3px 0',
                  // A rule, not a card: the design quotes with an inset bar and
                  // italic ink, and gives the ground back to the page.
                  padding: `${px(2)}px 0 ${px(2)}px 18px`,
                  boxShadow: 'inset 2px 0 0 var(--track)',
                  borderRadius: 3,
                  font: `400 ${px(13.5)}px/1.74 var(--sans)`,
                  fontStyle: 'italic',
                  color: 'var(--ink3)',
                  textWrap: 'pretty',
                  whiteSpace: breaks ? 'pre-line' : undefined
                }}
              >
                <Inline runs={b.runs} onWiki={onWiki} cmt={take(b.runs)} />
              </div>
            )
          case 'rule':
            return (
              <div
                key={i}
                {...hot(b)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  height: 11
                }}
              >
                <div style={{ width: '100%', height: 1, background: 'var(--hr)' }} />
              </div>
            )
          case 'embed':
            return (
              <Embed
                key={i}
                target={b.target}
                heading={b.heading}
                scale={scale}
                onWiki={onWiki}
                visited={chain}
              />
            )
          case 'code':
            /*
             * The chip belongs to this WRAPPER and not to the card below it, so
             * nothing the card does can carry it off with the code.
             *
             * THE LINES WRAP. A fenced block used to keep every line on one row
             * and scroll sideways inside its card — so a message Claude fenced
             * for copying, longer than the measure, showed its first few words
             * and a cut-off edge, and the rest only to someone who knew to
             * scroll a card sideways. WRITE never did: the editor wraps every
             * line, code included. Wrapped as written — the spaces kept, so an
             * indent stays an indent, and no line run into the next — and
             * anywhere, since a long path or URL in code has no spaces to break
             * at. The copy is the source either way (`b.text`).
             */
            return (
              <div
                key={i}
                className="copy-host"
                style={{ position: 'relative', margin: '4px 0', minWidth: 0, maxWidth: '100%' }}
              >
                <CopyChip text={b.text} title="Copy this code block" />
                <div
                  {...hot(b)}
                  style={{
                    padding: '12px 14px',
                    borderRadius: 7,
                    background: 'var(--code)',
                    font: `400 ${px(11.5)}px/1.75 var(--mono)`,
                    color: 'var(--ink3)',
                    minWidth: 0,
                    maxWidth: '100%',
                    whiteSpace: 'pre-wrap',
                    overflowWrap: 'anywhere'
                  }}
                >
                  {b.text}
                </div>
              </div>
            )
          case 'table':
            return (
              <div key={i} {...hot(b)} style={{ margin: '5px 0', overflowX: 'auto' }}>
                <table
                  style={{
                    borderCollapse: 'collapse',
                    width: '100%',
                    font: `400 ${px(10.5)}px/1.5 var(--sans)`
                  }}
                >
                  <thead>
                    <tr>
                      {b.head.map((cell, c) => (
                        <th
                          key={c}
                          style={{
                            textAlign: 'left',
                            padding: '5px 8px 5px 0',
                            borderBottom: '1px solid var(--edge)',
                            font: `600 ${px(9.5)}px var(--mono)`,
                            letterSpacing: '.04em',
                            color: 'var(--ink3)',
                            whiteSpace: 'nowrap'
                          }}
                        >
                          <Inline runs={cell} onWiki={onWiki} cmt={take(cell)} />
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {b.rows.map((row, r) => (
                      <tr key={r}>
                        {row.map((cell, c) => (
                          <td
                            key={c}
                            style={{
                              padding: '5px 8px 5px 0',
                              borderBottom: '1px solid var(--div2)',
                              verticalAlign: 'top'
                            }}
                          >
                            <Inline runs={cell} onWiki={onWiki} cmt={take(cell)} />
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
      default:
        return null
    }
    }
  }
}
