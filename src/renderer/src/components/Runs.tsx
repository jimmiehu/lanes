import { createContext, useContext, useEffect, useState } from 'react'
import { fileAddress, parseRuns, type Run } from '@shared/blocks'
import { looksLikePath } from '@shared/written'

/**
 * How a link to a note is followed. `newTab` is the ⌘ on the click. `address`
 * says the target is a path written as an address — a markdown link — rather
 * than a name: a `[[name]]` no note has yet is a note to make, and a path that
 * leads nowhere is not. Answers whether anything opened, where it can know.
 */
export type Follow = (
  target: string,
  newTab?: boolean,
  how?: { address?: boolean }
) => Promise<boolean> | void

/**
 * How a `[[wikilink]]` is followed from wherever it was rendered. Chat prose
 * runs through a dozen block types before it reaches a run, so the handler
 * arrives by context rather than through every one of them.
 */
export const WikiContext = createContext<Follow | null>(null)

/**
 * Right-clicking a `[[wikilink]]` offers the same *Open in pane A / B* menu a
 * row in either rail does. Travels by context for the same reason as above.
 */
export const WikiMenuContext = createContext<
  ((e: React.MouseEvent, target: string) => void) | null
>(null)

/**
 * Right-clicking a path to a file — a link to one, or a path written in
 * backticks — offers to open it or show it in the Finder (see `FileMenu`).
 * `text` is the path as written; the note it was written in comes by
 * `DocPathContext`, since a path is found nearest the note first.
 */
export const FileMenuContext = createContext<
  ((e: React.MouseEvent, text: string, note: string) => void) | null
>(null)

/** The note a document is drawn from, vault-relative; '' in a thread. */
export const DocPathContext = createContext('')

/**
 * Code that names a file or a folder: `build_rules.py`, `inbox/reading/`. It
 * stays code — what was written is shown as written — and a right-click on it
 * finds it. See `looksLikePath`.
 */
export function PathCode({ text, children }: { text: string; children: React.ReactNode }): React.JSX.Element {
  const menu = useContext(FileMenuContext)
  const note = useContext(DocPathContext)
  if (!menu || !looksLikePath(text)) return <>{children}</>
  return (
    <span data-path-code={text} onContextMenu={(e) => menu(e, text, note)}>
      {children}
    </span>
  )
}

/**
 * What a thread's prose is read against for the links it does not spell out:
 * each note's file name, lower-cased, to the one note that has it — names two
 * notes share are left out — and the vault's top-level folders, which are what
 * make a bare path the vault's. The app keeps it from the vault's note list.
 */
export interface VaultNames {
  notes: ReadonlyMap<string, string>
  roots: ReadonlySet<string>
}
export const VaultNamesContext = createContext<VaultNames | null>(null)

/** Set over a thread's transcript: prose where a bare file name or path can be a link. */
export const InThread = createContext(false)

/** A file name with no folder in it — one with a folder is a path, and parseRuns links those. */
const BARE_NAME = /(?<![\p{L}\p{N}_./-])[\p{L}\p{N}_][\p{L}\p{N}_.-]*\.md(?![\p{L}\p{N}_/-])/giu

/**
 * A path with a folder in it and a file at its end: `projects/garden/x.xlsx`.
 * Not inside a longer path or an address — nothing of a name, a dot, a slash,
 * a colon or an `@` right before it.
 */
const FILE_PATH =
  /(?<![\p{L}\p{N}_./:@-])(?:[\p{L}\p{N}_][\p{L}\p{N}_.-]*\/)+[\p{L}\p{N}_][\p{L}\p{N}_.-]*\.[\p{L}\p{N}]{1,8}(?![\p{L}\p{N}_/-])/gu

/** A piece of a thread's prose: words, a note it names, or a file of the vault's. */
export type ThreadPart = { text: string; note?: string; file?: string }

/**
 * A PATH TO A FILE IN THE VAULT IS A LINK — in a thread — that shows the file
 * where it is.
 *
 * Claude ends a turn on the file it made — `File: projects/garden/
 * seed-costs-2026-10-06.xlsx` — and only a path to a NOTE was
 * ever a link, so a spreadsheet, a PDF or a page was words you had to go and
 * find. A path is the vault's when its first folder is one of the vault's own
 * top-level folders: that is what tells `projects/…` from an address written
 * without its scheme, `cal.com/blog/x.html`. A note's path opens the note; any
 * other file is shown selected in its folder in the Finder — nothing opened in
 * another app and nothing run. One that is not there says so.
 *
 * Bare note names are read in the words between (see `bareNotes`). Threads
 * only, for the reason those are. Null when nothing in the text is either,
 * which is nearly always.
 */
export function threadLinks(text: string, vault: VaultNames): ThreadPart[] | null {
  if (!text.includes('.')) return null
  const out: ThreadPart[] = []
  let any = false
  const words = (s: string): void => {
    if (!s) return
    const parts = bareNotes(s, vault.notes)
    if (parts) {
      out.push(...parts)
      any = true
    } else out.push({ text: s })
  }
  let last = 0
  for (const m of text.matchAll(FILE_PATH)) {
    const at = m.index ?? 0
    if (!vault.roots.has(m[0].split('/')[0])) continue
    words(text.slice(last, at))
    out.push(/\.md$/i.test(m[0]) ? { text: m[0], note: m[0] } : { text: m[0], file: m[0] })
    any = true
    last = at + m[0].length
  }
  words(text.slice(last))
  return any ? out : null
}

/**
 * A BARE FILE NAME THAT NAMES A NOTE IS A LINK TO IT — in a thread.
 *
 * Claude lists the files it wrote under a folder it has named already: "Files
 * are in projects/garden and daily/briefs:" and then
 * `seed-order-preread-2026-10-06.md` on a line of its own. Only a name
 * with a folder in it was ever a link, so a passing `README.md` would not be
 * one; so these were words. A name is a link now when exactly ONE note in the
 * vault has it — the vault holds three `README.md`s, and guessing between them
 * would open the wrong note as readily as the right one — and is left as words
 * when none or several do.
 *
 * Threads only. In a note the editor has to draw what READ draws, and a link
 * that READ draws and the editor does not is the two surfaces disagreeing.
 *
 * The text in pieces, each with the note it names; null when no name in it
 * names one, which is nearly always.
 */
export function bareNotes(text: string, names: ReadonlyMap<string, string>): ThreadPart[] | null {
  if (!names.size || !/\.md/i.test(text)) return null
  const out: ThreadPart[] = []
  let last = 0
  for (const m of text.matchAll(BARE_NAME)) {
    const note = names.get(m[0].toLowerCase())
    if (!note || m.index === undefined) continue
    if (m.index > last) out.push({ text: text.slice(last, m.index) })
    out.push({ text: m[0], note })
    last = m.index + m[0].length
  }
  if (!out.length) return null
  if (last < text.length) out.push({ text: text.slice(last) })
  return out
}

/**
 * A LINK THAT LEADS NOWHERE SAYS SO. A click that did nothing at all looked
 * exactly like a click that missed, so you clicked again, and then again. Now
 * the link answers where it stands: a small note under it, for a moment, and
 * nothing in the line around it moves.
 */
function Nowhere(): React.JSX.Element {
  return (
    <span
      data-link-nowhere="1"
      style={{
        position: 'absolute',
        left: 0,
        top: '100%',
        marginTop: 3,
        zIndex: 3,
        whiteSpace: 'nowrap',
        padding: '2px 7px',
        borderRadius: 5,
        background: 'var(--raise)',
        boxShadow: '0 0 0 1px var(--edge), var(--sh1)',
        font: '400 10px/1.4 var(--mono)',
        letterSpacing: '.02em',
        fontStyle: 'normal',
        fontWeight: 400,
        color: 'var(--mute)',
        textDecoration: 'none',
        pointerEvents: 'none',
        animation: 'riseIn .12s ease-out'
      }}
    >
      not in the vault
    </span>
  )
}

/** Shown for a moment after a click that led nowhere, then gone. */
function useNowhere(): [boolean, () => void] {
  const [on, setOn] = useState(false)
  useEffect(() => {
    if (!on) return
    const t = setTimeout(() => setOn(false), 2400)
    return () => clearTimeout(t)
  }, [on])
  return [on, () => setOn(true)]
}

/**
 * A LINK TO A NOTE, however it was written: a `[[wikilink]]`, a vault path, or
 * a markdown link whose address is a note's file. One element for all three,
 * in threads and notes alike, so they look the same, take ⌘ the same, offer
 * the same menu — and none of them can be a click that silently does nothing.
 */
export function NoteLink({
  target,
  address = false,
  code = false,
  follow,
  menu,
  children
}: {
  target: string
  /** Written as an address — a markdown link — rather than a name. */
  address?: boolean
  /** A path written in backticks keeps looking like one. */
  code?: boolean
  follow?: Follow
  menu?: ((e: React.MouseEvent, target: string) => void) | null
  children: React.ReactNode
}): React.JSX.Element {
  const [nowhere, sayNowhere] = useNowhere()
  return (
    <span
      data-wiki={target}
      data-address={address ? '1' : undefined}
      onClick={
        follow
          ? (e) => {
              const went = follow(target, e.metaKey || e.ctrlKey, address ? { address: true } : undefined)
              if (went) void went.then((ok) => (ok ? undefined : sayNowhere()))
            }
          : undefined
      }
      onContextMenu={menu ? (e) => menu(e, target) : undefined}
      title={follow ? `Open ${target} · ⌘-click for a tab of its own` : target}
      style={{
        position: 'relative',
        color: 'var(--ink)',
        cursor: follow ? 'pointer' : 'default',
        textDecoration: 'underline',
        textDecorationColor: 'color-mix(in srgb, var(--ink) 35%, transparent)',
        textUnderlineOffset: 2,
        fontFamily: code ? 'var(--mono)' : undefined,
        fontSize: code ? '0.92em' : undefined,
        background: code ? 'var(--div2)' : undefined,
        borderRadius: code ? 3 : undefined,
        padding: code ? '1px 4px' : undefined
      }}
    >
      {children}
      {nowhere ? <Nowhere /> : null}
    </span>
  )
}

/**
 * A markdown link to a file in the vault that is not a note — a PDF, a page, a
 * script. Shown in the Finder: what it is, where it is, and nothing run.
 */
export function FileLink({ path, children }: { path: string; children: React.ReactNode }): React.JSX.Element {
  const [nowhere, sayNowhere] = useNowhere()
  const menu = useContext(FileMenuContext)
  const note = useContext(DocPathContext)
  return (
    <span
      data-file-link={path}
      onClick={() => {
        void window.lanes.reveal(path).then((ok) => (ok ? undefined : sayNowhere()))
      }}
      onContextMenu={menu ? (e) => menu(e, path, note) : undefined}
      title={`Show ${path} in the Finder`}
      style={{
        position: 'relative',
        color: 'var(--ink)',
        cursor: 'pointer',
        textDecoration: 'underline',
        textDecorationColor: 'color-mix(in srgb, var(--ink) 35%, transparent)',
        textUnderlineOffset: 2
      }}
    >
      {children}
      {nowhere ? <Nowhere /> : null}
    </span>
  )
}

/**
 * A markdown link: the web's in the browser, a note in the note pane, any
 * other file in the Finder. See `fileAddress`.
 */
export function HrefLink({
  href,
  follow,
  menu,
  children
}: {
  href: string
  follow?: Follow
  menu?: ((e: React.MouseEvent, target: string) => void) | null
  children: React.ReactNode
}): React.JSX.Element {
  const local = fileAddress(href)
  if (!local) {
    return (
      <a href={href} target="_blank" rel="noreferrer">
        {children}
      </a>
    )
  }
  if (local.note) {
    return (
      <NoteLink target={local.path} address follow={follow} menu={menu}>
        {children}
      </NoteLink>
    )
  }
  return <FileLink path={local.path}>{children}</FileLink>
}

/**
 * Inline markdown runs. Wikilinks resolve against the vault's own filename
 * convention, so `[[Ada-Lovelace]]` and `[[people/Ada-Lovelace]]`
 * both land on the same note.
 */
export default function Runs({
  text,
  onWiki
}: {
  text: string
  onWiki?: Follow
}): React.JSX.Element {
  const fromContext = useContext(WikiContext)
  const menu = useContext(WikiMenuContext)
  const follow = onWiki ?? fromContext ?? undefined
  return (
    <>
      {parseRuns(text).map((r: Run, i) => {
        if (r.wiki) {
          // A path written in backticks stays looking like one. It is still
          // the filename it was announced as; it is only reachable now as well.
          return (
            <NoteLink key={i} target={r.wiki} code={r.code} follow={follow} menu={menu}>
              {r.text}
            </NoteLink>
          )
        }
        if (r.href) {
          return (
            <HrefLink key={i} href={r.href} follow={follow} menu={menu}>
              {r.text}
            </HrefLink>
          )
        }
        const drawn = (
          <span
            key={i}
            style={{
              fontWeight: r.bold ? 600 : undefined,
              fontStyle: r.italic ? 'italic' : undefined,
              fontFamily: r.code ? 'var(--mono)' : undefined,
              fontSize: r.code ? '0.92em' : undefined,
              background: r.code ? 'var(--div2)' : r.highlight ? 'var(--hl)' : undefined,
              borderRadius: r.code ? 3 : undefined,
              padding: r.code ? '1px 4px' : undefined
            }}
          >
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
      })}
    </>
  )
}
