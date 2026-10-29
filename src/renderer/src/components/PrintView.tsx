import { useEffect, useState } from 'react'
import Doc from './Doc'
import type { Note } from '@shared/types'

/**
 * THE NOTE, ON PAPER — the whole of what a hidden window shows while a PDF is
 * being made of it.
 *
 * It mounts the REAL `Doc`, the same component READ draws with. That is the
 * entire design: a second renderer written for print would look right the day
 * it was written and drift the next time the heading scale moved, which in this
 * app was last week. There is one document engine and this is it, given a
 * different page to sit on.
 *
 * Five things differ from the pane, and each is a fact about paper rather than
 * a difference of opinion about the note:
 *
 *  - LIGHT, always. The theme is one attribute on the root and this pins it,
 *    because a dark export is either ink you cannot read or — with backgrounds
 *    dropped, which is `printToPDF`'s default — a page that looks blank.
 *  - WHOLE. READ stops at 1,500 blocks and offers you the rest; paper has no
 *    scroll to give up on, so `uncap` is set.
 *  - NO CHROME, and nothing hot. No pane, no rail, no editable blocks: the
 *    document is not somewhere you can click.
 *  - A HEAD. The pane says the note's title above the body and `Doc` drops the
 *    first h1 accordingly. On paper nothing else would say it, so it is drawn
 *    here.
 *  - NO COMMENTS. A review's marks are not the document: an anchor prints as
 *    its words and a comment not at all.
 */
export default function PrintView({ path }: { path: string }): React.JSX.Element {
  const [note, setNote] = useState<Note | null>(null)
  const [failed, setFailed] = useState<string | null>(null)

  useEffect(() => {
    // The theme is one attribute — see lib/theme.ts. Paper is light.
    document.documentElement.setAttribute('data-theme', 'light')
    // And the page is a sheet edge to edge. `html`/`body` carry the DESK in the
    // app, which on paper is a grey border round the column and ink spent on
    // nothing.
    document.documentElement.setAttribute('data-print-page', '1')
    void window.lanes.note(path).then(
      (n) => (n ? setNote(n) : setFailed(`Could not read ${path}`)),
      (e) => setFailed(String(e))
    )
  }, [path])

  /**
   * TELLING MAIN IT IS SAFE TO PRINT.
   *
   * `did-finish-load` is not this signal: it fires when the bundle finished
   * downloading, before React has mounted and before a single effect has run.
   * Nothing else in the page announces "the document is finished" either —
   * `![[embeds]]` resolve through two awaits of their own — so the page says so
   * itself, one frame after the body is on screen and the fonts are settled.
   *
   * Two frames, deliberately: the first lets React commit the document, the
   * second lets layout happen against it. Print is a separate layout pass, but
   * an embed that has not painted has not fetched either.
   */
  /*
   * EVERY FOLD OPEN.
   *
   * Same reasoning as `uncap`: a reader can open a collapsed section, and paper
   * cannot. A PDF that quietly drops what a fold was holding is the silent
   * truncation this app refuses everywhere else — worse here, because nothing
   * on the page would say a section had been left out.
   */
  useEffect(() => {
    if (!note) return
    for (const d of document.querySelectorAll('details')) (d as HTMLDetailsElement).open = true
  }, [note])

  useEffect(() => {
    if (!note && !failed) return
    let alive = true
    void document.fonts.ready.then(() => {
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          if (alive) window.lanes.printReady(failed)
        })
      )
    })
    return () => {
      alive = false
    }
  }, [note, failed])

  if (failed) return <div style={{ padding: 40, font: '400 13px system-ui' }}>{failed}</div>
  if (!note) return <div />

  return (
    <div
      data-print="1"
      style={{
        // The measure, and nothing else on the page. `@page` in global.css owns
        // the paper margins, so this box only has to be the column.
        maxWidth: 640,
        margin: '0 auto',
        padding: '0 0 8px',
        background: 'var(--sheet)',
        color: 'var(--body)'
      }}
    >
      {/* The head the pane draws, in the type it draws it — the title, and the
          one line of provenance that makes a printed page findable again. */}
      <div style={{ paddingBottom: 18 }}>
        <div
          style={{
            font: '600 8.5px var(--mono)',
            letterSpacing: '.18em',
            color: 'var(--mute)',
            paddingBottom: 9
          }}
        >
          {note.path.includes('/') ? note.path.slice(0, note.path.lastIndexOf('/')) : 'VAULT'}
        </div>
        <div
          style={{
            font: '600 25px/1.2 var(--sans)',
            letterSpacing: '-.02em',
            color: 'var(--ink)',
            textWrap: 'pretty'
          }}
        >
          {note.title}
        </div>
        {/* An ABSOLUTE date. The pane says "edited 4m ago", which is true of a
            screen and a lie the moment it is on paper. */}
        <div style={{ font: '400 11px var(--sans)', color: 'var(--mute)', paddingTop: 7 }}>
          {note.path} · {new Date(note.edited).toLocaleDateString(undefined, {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
          })}
        </div>
      </div>

      {/* A review's marks are not the document: on paper an anchor is its
          words and a comment is not there at all. */}
      <Doc body={note.body} path={note.path} scale={1} dropTitle breaks uncap comments="print" />
    </div>
  )
}
