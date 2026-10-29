import React, { useEffect, useMemo, useState } from 'react'
import type { LaneDef, NoteEntry, RailMode, ThreadSummary } from '@shared/types'
import { age, byFolder, fold, folderLabel, folderSegments } from '../lib/format'
import { laneLabel } from '@shared/lanes'
import type { TabKind } from '../state/pane'
import type { UpdateState } from '@shared/update'
import UpdateLine from './UpdateLine'

/**
 * The rail — one 250px column, two stacked cards with the desk showing between
 * them. Not one card with a seam: two separate objects.
 *
 * This replaces three v2 components at once. The vault rail (threads by lane),
 * the note navigator (the whole vault) and the recent shelf were three answers
 * to one question, and the reader had to know which of them to look in. Here
 * the Starred card is what you keep and the browser below it is everything
 * else, in whichever of three shapes the question wants:
 *
 *   Recent   what moved, threads and notes in separate sections
 *   Lanes    what am I working on — while there are lanes to work in
 *   Folders  where does it live
 *
 * Recent is deliberately NOT interleaved. The two kinds open in different
 * panes, so mixing them in one list only asks you to sort them again by eye.
 */

export interface RailRow {
  kind: TabKind
  id: string
}

interface Props {
  threads: ThreadSummary[]
  notes: NoteEntry[]
  /** None is an answer: the rail then has no Lanes mode and names no lane. */
  lanes: LaneDef[]
  mode: RailMode
  onMode: (m: RailMode) => void
  /** Starred OBJECT ids — session ids and vault paths in one store. */
  marks: string[]
  onToggleMark: (id: string) => void
  starredOpen: boolean
  onToggleStarred: () => void
  /**
   * Folder rows the reader OPENED, keyed by full path. Closed is the default
   * below the root: a vault in daily use, opened by default, is a scroll
   * nobody finishes, which is where this parts company with the prototype.
   */
  openDirs: string[]
  onOpenDirs: (next: string[]) => void
  /**
   * Lane bands the reader COLLAPSED. The opposite sense on purpose — a lane is
   * there to be seen, so absence has to mean open.
   */
  collapsedLanes: string[]
  onCollapsedLanes: (next: string[]) => void
  /** Rows past a band's cap that the reader asked to see. */
  moreDirs: string[]
  onMoreDirs: (next: string[]) => void
  perBand: number
  /** Within a band: most recently touched first, or by title. */
  sort: 'recent' | 'az'
  onSort: (next: 'recent' | 'az') => void
  query: string
  onQuery: (q: string) => void
  searchRef: React.RefObject<HTMLInputElement | null>
  loading: boolean
  laneOfChat: (id: string) => LaneDef | null
  /** Things currently showing in a pane — the row goes bold. */
  showing: (kind: TabKind, id: string) => boolean
  titleOfNote: (path: string) => string
  onOpen: (kind: TabKind, id: string, newTab: boolean) => void
  onContext: (e: React.MouseEvent, kind: TabKind, id: string, title: string) => void
  onDrag: (kind: TabKind, id: string) => void
  onDragEnd: () => void
  onHide: () => void
  /** An update build/follow.sh has ready, said at the rail's foot; null when there is none. */
  update: UpdateState | null
  onRestartUpdate: () => void
  onCancelUpdate: () => void
  /** Visible order, so ⌥↑↓ walks exactly what the rail shows. */
  onVisibleOrder: (rows: RailRow[]) => void
}

const MODES: RailMode[] = ['recent', 'lanes', 'folders']
const LABEL: Record<RailMode, string> = {
  recent: 'Recent',
  lanes: 'Lanes',
  folders: 'Folders'
}

function Star({ filled }: { filled: boolean }): React.JSX.Element {
  return (
    <svg
      width="9"
      height="9"
      viewBox="0 0 14 14"
      fill={filled ? 'var(--mute)' : 'none'}
      stroke="var(--mute)"
      strokeWidth="1.2"
      strokeLinejoin="round"
      style={{ flex: 'none' }}
    >
      <path d="M7 2.1l1.5 3.06 3.38.49-2.44 2.38.57 3.36L7 9.8l-3.01 1.59.57-3.36L2.12 5.65l3.38-.49z" />
    </svg>
  )
}

function Caret({ open }: { open: boolean }): React.JSX.Element {
  return (
    <svg
      width="8"
      height="8"
      viewBox="0 0 14 14"
      fill="var(--mute)"
      style={{ flex: 'none', transform: `rotate(${open ? 90 : 0}deg)` }}
    >
      <path d="M4 3l5 4-5 4z" />
    </svg>
  )
}

const ThreadDot = ({ waiting }: { waiting: boolean }): React.JSX.Element => (
  <div
    style={{
      width: 7,
      height: 7,
      borderRadius: 99,
      background: waiting ? 'var(--ink)' : 'var(--dot)',
      flex: 'none'
    }}
  />
)

const NoteBar = (): React.JSX.Element => (
  <div
    style={{ width: 3, height: 11, borderRadius: 1, background: 'var(--faint)', flex: 'none' }}
  />
)

/** What one row in either card needs to draw itself. */
interface Row {
  key: string
  /** A section label or a folder heading: inert, or a disclosure. */
  group?: { open: boolean; toggle: () => void }
  label: string
  /** True for the caps-mono section labels, which take no hover at all. */
  inert?: boolean
  kind?: TabKind
  id?: string
  waiting?: boolean
  sub?: string
  meta?: string
  here?: boolean
  height: number
  padLeft: number
  starrable?: boolean
  /** Folder headings only: 0 is the loud top level, deeper recedes. */
  depth?: number
  /** When this row's thing last moved. What RECENT folds on, and readable. */
  when?: number
  title?: string
}

export default function Rail(p: Props): React.JSX.Element {
  const [hover, setHover] = useState<string | null>(null)
  const marks = useMemo(() => new Set(p.marks), [p.marks])
  const open = useMemo(() => new Set(p.openDirs), [p.openDirs])
  const collapsed = useMemo(() => new Set(p.collapsedLanes), [p.collapsedLanes])
  const more = useMemo(() => new Set(p.moreDirs), [p.moreDirs])
  const q = fold(p.query.trim())
  const narrowing = q.length > 0
  // Lanes are the person's, and until there are some the rail does not offer
  // a way of looking at none of them, nor say UNASSIGNED of every thread.
  const hasLanes = p.lanes.length > 0
  // A rail left on Lanes when the last lane went reads as Recent — at read
  // time, so the setting is still there for when a lane comes back.
  const mode: RailMode = p.mode === 'lanes' && !hasLanes ? 'recent' : p.mode
  /** A thread's lane as the chrome writes it — UNASSIGNED where there are lanes and it is in none. */
  const laneWord = (id: string): string => {
    const lane = p.laneOfChat(id)
    return lane ? laneLabel(lane) : 'UNASSIGNED'
  }

  const toggleDir = (key: string): void =>
    p.onOpenDirs(open.has(key) ? p.openDirs.filter((d) => d !== key) : [...p.openDirs, key])
  const toggleLane = (key: string): void =>
    p.onCollapsedLanes(
      collapsed.has(key) ? p.collapsedLanes.filter((d) => d !== key) : [...p.collapsedLanes, key]
    )
  const toggleMore = (key: string): void =>
    p.onMoreDirs(more.has(key) ? p.moreDirs.filter((d) => d !== key) : [...p.moreDirs, key])

  const threadMatches = useMemo(
    () => (narrowing ? p.threads.filter((t) => fold(t.title).includes(q)) : p.threads),
    [p.threads, q, narrowing]
  )
  // Notes match on their whole path, not just the title: a vault is full of
  // slugged filenames, and `spring-beds-plan` should find the note whose title
  // is a sentence.
  const noteMatches = useMemo(
    () => (narrowing ? p.notes.filter((n) => fold(`${n.title} ${n.path}`).includes(q)) : p.notes),
    [p.notes, q, narrowing]
  )

  /** How a band orders its threads. Recent is the default; A–Z is the other. */
  const byThread = (a: ThreadSummary, b: ThreadSummary): number =>
    p.sort === 'az' ? a.title.localeCompare(b.title) : b.touched - a.touched

  const rows: Row[] = []
  const order: RailRow[] = []

  const threadRow = (t: ThreadSummary, padLeft: number, sub?: string): void => {
    const here = p.showing('chat', t.id)
    // A thread that has been forked is still one thread and one row. The count
    // is the only thing the rail says about it — which path you are on is the
    // transcript's business, and it says so at the seam.
    const paths = t.paths > 1 ? ` · ${t.paths} paths` : ''
    rows.push({
      key: `t:${t.id}`,
      label: t.title,
      kind: 'chat',
      id: t.id,
      waiting: t.state.startsWith('left mid-thought'),
      // Whichever of the two lines this row is using: RECENT puts the lane and
      // the age in a sub-line and leaves the meta empty, LANES does the reverse.
      sub: sub ? `${sub}${paths}` : sub,
      meta: sub ? '' : `${age(t.touched)}${paths}`,
      when: t.touched,
      here,
      height: sub ? 42 : 28,
      padLeft,
      starrable: true,
      title: `Thread${hasLanes ? ` · ${laneWord(t.id)}` : ''} — ${t.title}${paths}`
    })
    order.push({ kind: 'chat', id: t.id })
  }

  const noteRow = (n: NoteEntry, padLeft: number, sub?: string): void => {
    const here = p.showing('note', n.path)
    rows.push({
      key: `n:${n.path}`,
      label: n.title,
      kind: 'note',
      id: n.path,
      sub,
      meta: sub ? '' : age(n.edited),
      when: n.edited,
      here,
      height: sub ? 42 : 28,
      padLeft,
      starrable: true,
      title: `Note · ${folderLabel(n.folder)}`
    })
    order.push({ kind: 'note', id: n.path })
  }

  const label = (text: string): void => {
    rows.push({ key: `l:${text}:${rows.length}`, label: text, inert: true, height: 22, padLeft: 6 })
  }

  if (mode === 'recent') {
    /*
     * The fold is TODAY, not a number: RECENT answers "what have I been in",
     * and a day is the unit that question is asked in. Everything touched
     * today stands above it, most recent first; the rest is one click away.
     *
     * Seven is the floor, for the morning when today holds two things and a
     * shelf of two is no shelf at all. A day of heavy work simply makes it
     * longer, which is the right shape for the day it describes.
     *
     * Folded, but never silently, and the toggle goes BOTH ways — an expander
     * that cannot be put back turns the shelf into the list it was folded for.
     * The fold runs after the filter, so narrowing lifts it: a query that
     * matched something older than today would otherwise have no way to show.
     */
    const FLOOR = 7
    const dayStart = ((): number => {
      const d = new Date()
      d.setHours(0, 0, 0, 0)
      return d.getTime()
    })()
    const section = (
      key: string,
      list: (ThreadSummary | NoteEntry)[],
      title: string,
      when: (item: never) => number,
      row: (item: never, i: number) => void
    ): void => {
      if (!list.length) return
      label(title)
      // The list is already in recency order, so today is a prefix of it.
      const today = list.filter((item) => when(item as never) >= dayStart).length
      const fold = Math.max(FLOOR, today)
      const shown = narrowing || more.has(key)
      const cap = shown ? list.length : fold
      for (const item of list.slice(0, cap)) row(item as never, 0)
      if (!narrowing && list.length > fold)
        rows.push({
          key: `m:${key}`,
          label: shown ? 'Show less' : `${list.length - fold} more`,
          group: { open: shown, toggle: () => toggleMore(key) },
          height: 24,
          padLeft: 8
        })
    }
    section(
      '__recent_threads__',
      [...threadMatches].sort((a, b) => b.touched - a.touched),
      'THREADS',
      (t: ThreadSummary) => t.touched,
      (t: ThreadSummary) =>
        threadRow(t, 8, hasLanes ? `${laneWord(t.id)} · ${age(t.touched)}` : age(t.touched))
    )
    section(
      '__recent_notes__',
      [...noteMatches].sort((a, b) => b.edited - a.edited),
      'NOTES',
      (n: NoteEntry) => n.edited,
      (n: NoteEntry) =>
        noteRow(n, 8, `${(folderSegments(n.folder)[0] || 'VAULT').toUpperCase()} · ${age(n.edited)}`)
    )
  } else if (mode === 'lanes') {
    // Lanes answers "what am I working on", so it is threads only: a lane's
    // notes reach you through the thread that carries them.
    const groups = new Map<string, ThreadSummary[]>()
    for (const t of threadMatches) {
      const key = p.laneOfChat(t.id)?.id ?? '__none__'
      const list = groups.get(key)
      if (list) list.push(t)
      else groups.set(key, [t])
    }
    const bands = [...p.lanes.map((l) => ({ key: l.id, name: laneLabel(l) })), { key: '__none__', name: 'UNATTACHED' }]
    for (const band of bands) {
      const all = (groups.get(band.key) ?? []).sort(byThread)
      if (narrowing && !all.length) continue
      // While narrowing, bands open themselves around their matches: a band
      // that hides the only hits is a rail reporting nothing found.
      const isOpen = narrowing || !collapsed.has(band.key)
      rows.push({
        key: `g:${band.key}`,
        label: band.name,
        group: narrowing ? undefined : { open: isOpen, toggle: () => toggleLane(band.key) },
        inert: narrowing,
        meta: String(all.length),
        height: 28,
        padLeft: 8,
        title: band.name
      })
      if (!isOpen) continue
      const cap = more.has(band.key) ? all.length : p.perBand
      const shown = all.slice(0, cap)
      // The thread you are looking at is the one row the cap may not drop.
      const onScreen = all.findIndex((t) => p.showing('chat', t.id))
      if (onScreen >= cap) shown.push(all[onScreen])
      for (const t of shown) threadRow(t, 25)
      if (all.length > cap) {
        rows.push({
          key: `m:${band.key}`,
          label: `${all.length - cap} more`,
          group: { open: false, toggle: () => toggleMore(band.key) },
          height: 24,
          padLeft: 25,
          inert: false
        })
      }
    }
  } else {
    // The real folder tree, to whatever depth the paths go. Open state is keyed
    // by FULL PATH: a leaf name like `notes` repeats under different parents,
    // and a bare-name key would open every one of them at once.
    interface Node {
      dirs: Map<string, Node>
      notes: NoteEntry[]
    }
    const root: Node = { dirs: new Map(), notes: [] }
    for (const n of noteMatches) {
      let node = root
      const segs = folderSegments(n.folder)
      for (const seg of segs) {
        let next = node.dirs.get(seg)
        if (!next) {
          next = { dirs: new Map(), notes: [] }
          node.dirs.set(seg, next)
        }
        node = next
      }
      node.notes.push(n)
    }
    const deepCount = (node: Node): number =>
      node.notes.length + [...node.dirs.values()].reduce((a, d) => a + deepCount(d), 0)

    const walk = (node: Node, path: string, depth: number): void => {
      // byFolder exists for a vault that numbers its folders: numeric-prefixed first,
      // `_`-prefixed ones as a sink, the root last. Plain alphabetical buries it.
      for (const seg of [...node.dirs.keys()].sort(depth === 0 ? byFolder : undefined)) {
        const child = node.dirs.get(seg)!
        const key = path ? `${path}/${seg}` : seg
        const isOpen = narrowing || open.has(key)
        rows.push({
          key: `d:${key}`,
          label: seg,
          group: narrowing ? undefined : { open: isOpen, toggle: () => toggleDir(key) },
          inert: narrowing,
          // Depth is legible in the type, not only in the indent: the top level
          // is the loud one and everything under it recedes a step.
          depth,
          meta: String(deepCount(child)),
          height: 28,
          padLeft: 8 + depth * 17,
          title: key
        })
        if (!isOpen) continue
        walk(child, key, depth + 1)
        child.notes.sort((a, b) => a.title.localeCompare(b.title))
        // Leaves are capped per folder. In a vault in use an uncapped tree is a
        // scroll nobody finishes; the row that stands in for the rest says so
        // rather than hiding them silently.
        const cap = more.has(key) ? child.notes.length : 40
        for (const n of child.notes.slice(0, cap)) noteRow(n, 8 + (depth + 1) * 17)
        if (child.notes.length > cap)
          rows.push({
            key: `m:${key}`,
            label: `${child.notes.length - cap} more here — ⌘K finds them`,
            group: { open: false, toggle: () => toggleMore(key) },
            height: 24,
            padLeft: 8 + (depth + 1) * 17
          })
      }
      // Notes at the vault root, which `folderSegments` correctly puts here
      // rather than under a folder named after dirname's '.' sentinel. Same cap
      // and same "more" row as any other folder — it is not a special case.
      if (!path) {
        const cap = more.has('__root__') ? node.notes.length : 40
        for (const n of node.notes.slice(0, cap)) noteRow(n, 8)
        if (node.notes.length > cap)
          rows.push({
            key: 'm:__root__',
            label: `${node.notes.length - cap} more here — ⌘K finds them`,
            group: { open: false, toggle: () => toggleMore('__root__') },
            height: 24,
            padLeft: 8
          })
      }
    }
    walk(root, '', 0)
  }

  const { onVisibleOrder } = p
  const orderKey = order.map((o) => `${o.kind}:${o.id}`).join('|')
  React.useEffect(() => {
    onVisibleOrder(order)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderKey, onVisibleOrder])

  /* ---------- the starred card ---------- */
  const starredThreads = p.threads.filter((t) => marks.has(t.id))
  const starredNotes = p.notes.filter((n) => marks.has(n.path))
  const starCount = starredThreads.length + starredNotes.length

  return (
    <div
      data-rail="1"
      style={{
        flex: 1,
        width: 250,
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        minHeight: 0
      }}
    >
      {/* Two separate cards with the desk between them, not one card with a
          seam: what you keep and what there is are different questions. */}
      <div
        style={{
          flex: 'none',
          borderRadius: 10,
          background: 'var(--card)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          padding: 9
        }}
      >
        <div
          onClick={p.onToggleStarred}
          onMouseEnter={() => setHover('__star__')}
          onMouseLeave={() => setHover(null)}
          title="Starred"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            height: 26,
            padding: '0 6px',
            borderRadius: 7,
            cursor: 'pointer',
            flex: 'none',
            background: hover === '__star__' ? 'var(--hov)' : 'transparent'
          }}
        >
          <Star filled />
          <div
            style={{
              flex: 1,
              font: '600 8.5px var(--mono)',
              letterSpacing: '.16em',
              color: 'var(--mute)'
            }}
          >
            STARRED
          </div>
          <div style={{ font: '400 9px var(--mono)', color: 'var(--mute)', flex: 'none' }}>
            {starCount}
          </div>
          <Caret open={p.starredOpen} />
        </div>

        {p.starredOpen ? (
          <div
            data-scroll="1"
            style={{
              maxHeight: 186,
              overflowY: 'auto',
              overflowX: 'hidden',
              display: 'flex',
              flexDirection: 'column',
              gap: 1,
              paddingTop: 2
            }}
          >
            {starCount === 0 ? (
              <div
                style={{
                  padding: '3px 6px 8px',
                  font: '400 11px/1.55 var(--sans)',
                  color: 'var(--mute)',
                  textWrap: 'pretty'
                }}
              >
                Nothing starred yet. Star any thread or note to keep it here.
              </div>
            ) : null}
            {starredThreads.length ? <SectionLabel>THREADS</SectionLabel> : null}
            {starredThreads.map((t) => (
              <StarredRow
                key={`st:${t.id}`}
                label={t.title}
                here={p.showing('chat', t.id)}
                glyph={<ThreadDot waiting={t.state.startsWith('left mid-thought')} />}
                onOpen={(newTab) => p.onOpen('chat', t.id, newTab)}
                onContext={(e) => p.onContext(e, 'chat', t.id, t.title)}
                onUnstar={() => p.onToggleMark(t.id)}
              />
            ))}
            {starredNotes.length ? <SectionLabel>NOTES</SectionLabel> : null}
            {starredNotes.map((n) => (
              <StarredRow
                key={`sn:${n.path}`}
                label={n.title}
                here={p.showing('note', n.path)}
                glyph={<NoteBar />}
                onOpen={(newTab) => p.onOpen('note', n.path, newTab)}
                onContext={(e) => p.onContext(e, 'note', n.path, n.title)}
                onUnstar={() => p.onToggleMark(n.path)}
              />
            ))}
          </div>
        ) : null}
      </div>

      {/* ---------- the browser ---------- */}
      <div
        style={{
          flex: 1,
          minHeight: 0,
          borderRadius: 10,
          background: 'var(--card)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column'
        }}
      >
        <div style={{ flex: 'none', display: 'flex', gap: 3, padding: '11px 9px 9px' }}>
          {MODES.filter((m) => m !== 'lanes' || hasLanes).map((m) => (
            <div
              key={m}
              data-rail-mode={m}
              onClick={() => p.onMode(m)}
              style={{
                padding: '5px 9px',
                borderRadius: 13,
                background: mode === m ? 'var(--chip)' : 'transparent',
                font: `${mode === m ? 600 : 400} 10.5px var(--sans)`,
                color: mode === m ? 'var(--ink)' : 'var(--ink3)',
                cursor: 'pointer',
                whiteSpace: 'nowrap'
              }}
            >
              {LABEL[m]}
            </div>
          ))}
        </div>

        {/*
          Ours, not the design's, which was drawn against nine notes and has no
          filter at all; a vault in use has thousands, where narrowing in place
          and jumping with ⌘K are genuinely different acts. It matches titles
          and paths only — ⌘K is the one that reads the text of every note.
        */}
        <div style={{ flex: 'none', padding: '0 9px 9px' }}>
          <input
            ref={p.searchRef}
            value={p.query}
            onChange={(e) => p.onQuery(e.target.value)}
            onKeyDown={(e) => {
              // Typing must not fire global shortcuts; a ⌘ chord is not typing.
              if (!e.metaKey && !e.ctrlKey) e.stopPropagation()
              if (e.key === 'Escape') {
                e.stopPropagation()
                if (p.query) p.onQuery('')
                else (e.target as HTMLInputElement).blur()
              }
            }}
            placeholder="Filter"
            style={{
              width: '100%',
              height: 26,
              padding: '0 9px',
              borderRadius: 7,
              background: 'var(--sheet)',
              font: '400 11px var(--sans)',
              color: 'var(--ink)'
            }}
          />
        </div>

        <div
          data-scroll="1"
          style={{
            flex: 1,
            minHeight: 0,
            overflowY: 'auto',
            overflowX: 'hidden',
            padding: '0 6px 6px',
            display: 'flex',
            flexDirection: 'column',
            gap: 1
          }}
        >
          {p.loading ? (
            <div style={{ padding: '8px 6px', font: '400 11px var(--sans)', color: 'var(--mute)' }}>
              Reading your sessions…
            </div>
          ) : null}
          {!p.loading && !rows.length ? (
            <div
              style={{
                padding: '8px 6px',
                font: '400 11px/1.55 var(--sans)',
                color: 'var(--mute)',
                textWrap: 'pretty'
              }}
            >
              {narrowing ? `Nothing matches “${p.query}”.` : 'Nothing here yet.'}
            </div>
          ) : null}
          {rows.map((r) => (
            <RowView
              key={r.key}
              row={r}
              starred={r.id ? marks.has(r.id) : false}
              hovered={hover === r.key}
              onHover={(on) => setHover(on ? r.key : null)}
              onOpen={(newTab) => {
                if (r.group) return r.group.toggle()
                if (r.kind && r.id) p.onOpen(r.kind, r.id, newTab)
              }}
              onContext={(e) => {
                if (r.kind && r.id) p.onContext(e, r.kind, r.id, r.label)
              }}
              onDrag={() => {
                if (r.kind && r.id) p.onDrag(r.kind, r.id)
              }}
              onDragEnd={p.onDragEnd}
              onStar={() => {
                if (r.id) p.onToggleMark(r.id)
              }}
            />
          ))}
        </div>

        {p.update ? <UpdateLine update={p.update} onRestart={p.onRestartUpdate} onCancel={p.onCancelUpdate} /> : null}

        <div
          style={{
            flex: 'none',
            display: 'flex',
            alignItems: 'center',
            gap: 9,
            height: 34,
            padding: '0 15px',
            borderTop: '1px solid var(--div)'
          }}
        >
          <div style={{ flex: 1, font: '400 10.5px var(--sans)', color: 'var(--mute)' }}>
            {/* While narrowing this is a ratio, not a total: a footer that keeps
                reporting the whole vault while the list shows a slice of it is
                the one thing on screen saying you are seeing everything. */}
            {narrowing
              ? `${threadMatches.length}/${p.threads.length} threads · ${noteMatches.length}/${p.notes.length} notes`
              : `${p.threads.length} threads · ${p.notes.length} notes`}
          </div>
          <div
            onClick={() => p.onSort(p.sort === 'az' ? 'recent' : 'az')}
            title={p.sort === 'az' ? 'Sorted by title — click for most recent' : 'Sorted by most recent — click for A–Z'}
            style={{
              font: '600 8.5px var(--mono)',
              letterSpacing: '.1em',
              color: 'var(--faint)',
              cursor: 'pointer',
              flex: 'none'
            }}
          >
            {p.sort === 'az' ? 'A–Z' : 'RECENT'}
          </div>
          <HideLink onClick={p.onHide} />
        </div>
      </div>
    </div>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <div
      style={{
        height: 22,
        display: 'flex',
        alignItems: 'center',
        padding: '0 6px',
        font: '600 8.5px var(--mono)',
        letterSpacing: '.14em',
        color: 'var(--faint)'
      }}
    >
      {children}
    </div>
  )
}

function HideLink({ onClick }: { onClick: () => void }): React.JSX.Element {
  const [hov, setHov] = useState(false)
  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      title="Hide · ⌥1"
      style={{
        font: '400 11px var(--sans)',
        color: hov ? 'var(--ink)' : 'var(--mute)',
        cursor: 'pointer',
        flex: 'none'
      }}
    >
      hide
    </div>
  )
}

function StarredRow({
  label,
  here,
  glyph,
  onOpen,
  onContext,
  onUnstar
}: {
  label: string
  here: boolean
  glyph: React.ReactNode
  onOpen: (newTab: boolean) => void
  onContext: (e: React.MouseEvent) => void
  onUnstar: () => void
}): React.JSX.Element {
  const [hov, setHov] = useState(false)
  return (
    <div
      data-row="1"
      onClick={(e) => onOpen(e.metaKey)}
      onContextMenu={onContext}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      title={label}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        height: 27,
        padding: '0 6px',
        borderRadius: 7,
        cursor: 'pointer',
        flex: 'none',
        background: here ? 'var(--sel)' : hov ? 'var(--hov)' : 'transparent'
      }}
    >
      {glyph}
      <div
        style={{
          flex: 1,
          minWidth: 0,
          font: `${here ? 600 : 400} 11.5px var(--sans)`,
          color: here ? 'var(--ink)' : 'var(--ink2)',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis'
        }}
      >
        {label}
      </div>
      <div
        onClick={(e) => {
          e.stopPropagation()
          onUnstar()
        }}
        title="Unstar"
        style={{
          width: 17,
          height: 17,
          borderRadius: 5,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flex: 'none',
          opacity: hov ? 1 : 0.5,
          background: hov ? 'var(--pinhov)' : 'transparent'
        }}
      >
        <Star filled />
      </div>
    </div>
  )
}

function RowView({
  row,
  starred,
  hovered,
  onHover,
  onOpen,
  onContext,
  onDrag,
  onDragEnd,
  onStar
}: {
  row: Row
  starred: boolean
  hovered: boolean
  onHover: (on: boolean) => void
  onOpen: (newTab: boolean) => void
  onContext: (e: React.MouseEvent) => void
  onDrag: () => void
  onDragEnd: () => void
  onStar: () => void
}): React.JSX.Element {
  // A section label says what a run of rows IS. It is not a thing you can open,
  // so it takes no hover and keeps the default cursor — offering a pointer for
  // an action that does not exist is the lie a hover state tells.
  if (row.inert && !row.group && !row.depth && !row.meta)
    return (
      <div
        style={{
          height: row.height,
          display: 'flex',
          alignItems: 'center',
          padding: `0 6px 0 ${row.padLeft}px`,
          font: '600 8.5px var(--mono)',
          letterSpacing: '.14em',
          color: 'var(--faint)',
          flex: 'none'
        }}
      >
        {row.label}
      </div>
    )

  const isGroup = Boolean(row.group)
  return (
    <div
      data-row="1"
      data-rail-row={row.kind ?? 'group'}
      data-rail-id={row.id}
      data-when={row.when}
      draggable={Boolean(row.kind && row.id)}
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = 'move'
        onDrag()
      }}
      onDragEnd={onDragEnd}
      onClick={(e) => onOpen(e.metaKey)}
      onContextMenu={onContext}
      onMouseEnter={() => onHover(true)}
      onMouseLeave={() => onHover(false)}
      title={row.title ?? row.label}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        height: row.height,
        padding: `0 6px 0 ${row.padLeft}px`,
        borderRadius: 7,
        background: row.here ? 'var(--sel)' : hovered ? 'var(--hov)' : 'transparent',
        cursor: 'pointer',
        flex: 'none'
      }}
    >
      {row.group ? <Caret open={row.group.open} /> : null}
      {row.kind === 'chat' ? <ThreadDot waiting={Boolean(row.waiting)} /> : null}
      {row.kind === 'note' ? <NoteBar /> : null}

      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            font: `${
              row.here ? 600 : isGroup ? (row.depth ? 500 : 600) : 400
            } 11.5px var(--sans)`,
            color: row.here
              ? 'var(--ink)'
              : isGroup
                ? row.depth
                  ? 'var(--ink2)'
                  : 'var(--ink)'
                : 'var(--ink2)',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis'
          }}
        >
          {row.label}
        </div>
        {row.sub ? (
          <div
            style={{
              font: '600 8.5px var(--mono)',
              letterSpacing: '.12em',
              color: 'var(--mute)',
              paddingTop: 4,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis'
            }}
          >
            {row.sub}
          </div>
        ) : null}
      </div>

      {row.starrable ? (
        <div
          data-pin="1"
          onClick={(e) => {
            e.stopPropagation()
            onStar()
          }}
          title={starred ? 'Unstar' : 'Star'}
          style={{
            width: 17,
            height: 17,
            borderRadius: 5,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flex: 'none',
            // A set star stays visible; an unset one is only offered on hover.
            opacity: starred ? 1 : hovered ? 1 : 0,
            background: 'transparent'
          }}
        >
          <Star filled={starred} />
        </div>
      ) : null}

      {row.meta ? (
        <div style={{ font: '400 9px var(--mono)', color: 'var(--mute)', flex: 'none' }}>
          {row.meta}
        </div>
      ) : null}
    </div>
  )
}

/**
 * The rail's open and close, as one continuous motion.
 *
 * Before this the rail and the collapsed strip were two components swapped by a
 * ternary: 239px of width vanished in a single frame, and the pane beside it
 * snapped to its new size. Both states now live inside ONE box whose width is
 * transitioned, so the pane is carried along by the same easing rather than
 * jumping to meet it.
 *
 * Two things make it read as sliding rather than squashing:
 *
 * - The rail's contents are held at their full 250px and clipped. A flex child
 *   allowed to reflow would re-wrap every row label thirty times on the way out,
 *   which looks like a stutter and costs a layout pass per frame.
 * - The contents are only mounted while they are on screen or on their way off.
 *   This rail draws a folder tree over thousands of notes; keeping it alive
 *   behind an 11px strip would be paying for it on every unrelated render.
 */
export function RailShell({
  hidden,
  onShow,
  children
}: {
  hidden: boolean
  onShow: () => void
  children: React.ReactNode
}): React.JSX.Element {
  const OPEN = 250
  const SHUT = 11
  const MS = 300
  const EASE = 'cubic-bezier(.4,0,.2,1)'
  // Kept mounted a beat past the close so the contents have something to slide
  // out WITH; unmounted after, so the tree is not rendering behind the strip.
  const [mounted, setMounted] = useState(!hidden)
  const [hov, setHov] = useState(false)
  // Where the contents actually ARE, which is not the same as whether the rail
  // is meant to be hidden. On the way in they have to be mounted at the shut
  // position for one frame first: a node that appears already at its final
  // transform has nothing to transition FROM, so the open would be a reveal —
  // the box widening over contents that never moved — while the close was a
  // slide. Two different motions for one control.
  const [slid, setSlid] = useState(hidden)
  useEffect(() => {
    if (hidden) {
      setSlid(true)
      const t = setTimeout(() => setMounted(false), MS + 40)
      return () => clearTimeout(t)
    }
    setMounted(true)
    let inner = 0
    const outer = requestAnimationFrame(() => {
      inner = requestAnimationFrame(() => setSlid(false))
    })
    return () => {
      cancelAnimationFrame(outer)
      cancelAnimationFrame(inner)
    }
  }, [hidden])

  // Everything the eye sees keys off ONE flag, so the box and its contents
  // start and finish on the same frame. Keying the width off `hidden` and the
  // transform off `slid` put them two frames apart, and two frames is exactly
  // enough for the contents to visibly lag the edge they are supposed to be
  // pinned to. `hidden` still drives what the shell DOES — the click that
  // brings it back is live the instant it is asked for.
  const shifted = hidden || slid

  return (
    <div
      data-rail-shell={hidden ? 'shut' : 'open'}
      onClick={hidden ? onShow : undefined}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      title={hidden ? 'Browse threads and notes · ⌥1' : undefined}
      style={{
        flex: 'none',
        width: shifted ? SHUT : OPEN,
        // The one place in the app with a real duration. Everything else here
        // is a hover; this is a surface arriving.
        //
        // A decelerating curve was the first thing tried and it was wrong: it
        // spent 90% of its travel in the first half and then crept, which reads
        // as a snap with a tail rather than as a slide. This one accelerates
        // out and eases in, so the distance is covered evenly enough to watch.
        transition: `width ${MS}ms ${EASE}`,
        position: 'relative',
        overflow: 'hidden',
        cursor: hidden ? 'pointer' : 'default',
        display: 'flex',
        minHeight: 0
      }}
    >
      {/* The strip, which is what the rail narrows INTO rather than a separate
          thing that replaces it. */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          borderRadius: 6,
          background: hidden && hov ? 'var(--chip)' : 'var(--strip)',
          opacity: shifted ? 1 : 0,
          transition: 'opacity .2s ease-out, background .12s ease',
          pointerEvents: 'none',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              style={{ width: 3, height: 3, borderRadius: 99, background: 'var(--dot)' }}
            />
          ))}
        </div>
      </div>

      {mounted ? (
        <div
          style={{
            // Full width regardless of the box around it: the contents slide
            // out of frame instead of being squeezed through 11px.
            width: OPEN,
            flex: 'none',
            display: 'flex',
            flexDirection: 'column',
            minHeight: 0,
            // The contents travel with the edge rather than being cut off by
            // it. Shrinking the box moves its RIGHT edge left while the left
            // edge stays put, so translating the contents by exactly the same
            // distance pins their right edge to it: they slide out of frame at
            // the speed the frame closes, instead of standing still and being
            // progressively clipped. Same duration and curve, or the two come
            // apart in the middle where it is most visible.
            transform: shifted ? `translateX(${SHUT - OPEN}px)` : 'none',
            // No fade. Fading was tried and it undid the point: the rail was
            // most of the way transparent before it was much of the way out,
            // so what you watched was a dimming, not a departure. Clipping
            // already hides it completely at the end.
            transition: `transform ${MS}ms ${EASE}`,
            pointerEvents: hidden ? 'none' : undefined
          }}
        >
          {children}
        </div>
      ) : null}
    </div>
  )
}

/**
 * THE RAIL, REDRAWN ONLY WHEN WHAT IT SHOWS HAS CHANGED.
 *
 * It is the most expensive thing in the window to draw — a vault's worth of
 * rows, sorted and banded — and it used to be drawn on every render of the app:
 * every keystroke in the composer, every save of a note, the opening of a note
 * it has nothing to do with. Measured over 1,500 notes that was 45–60ms each
 * time, three times over for a single ⌘N.
 *
 * So it is compared on its DATA and not on its callbacks. The app hands it
 * fresh closures on every render, which would defeat any memo; `sig` is how the
 * app says "the state those closures read has changed", so a callback can
 * never go stale behind a rail that did not redraw.
 */
export const RailMemo = React.memo(
  function RailMemo(p: Props & { sig: unknown; showingSig: string }): React.JSX.Element {
    const { sig: _sig, showingSig: _showing, ...rest } = p
    return <Rail {...rest} />
  },
  (a, b) => {
    for (const k of Object.keys(b) as (keyof typeof b)[]) {
      if (typeof b[k] === 'function') continue
      if (a[k] !== b[k]) return false
    }
    return Object.keys(a).length === Object.keys(b).length
  }
)
