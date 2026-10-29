import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { TEXT_LABELS, TEXT_STEPS } from '../lib/theme'
import type {
  AppState,
  EffortId,
  Flags,
  LaneDef,
  LaneId,
  ModelDef,
  PromptRun,
  SafetyId,
  SavedPrompt,
  Schedule,
  SkillDef,
  ThemeId
} from '@shared/types'
import { promptProblem } from '@shared/prompts'
import { laneLabel, slug } from '@shared/lanes'
import { describe, nextSlot, readTime } from '@shared/schedule'

interface Props {
  state: AppState
  models: ModelDef[]
  lanes: LaneDef[]
  /** The folder this window works in, as main resolved it at launch. */
  vault: string
  /** A turn running anywhere — what switching the vault would stop. */
  turnRunning: boolean
  /** The vault's folders a lane can be on: its top-level ones and the ones a level down. */
  folders: string[]
  /** How many threads the rail shows in a lane now, moved there or put there by their notes. */
  threadsIn: (laneId: LaneId) => number
  skills: SkillDef[]
  patch: (p: Partial<AppState>) => void
  onSkillsChanged: () => void
  /** Runs a saved prompt now, in a new thread — Settings closes behind it. */
  onRunPrompt: (id: string) => void
  /** Opens a thread — a scheduled prompt's last run — and closes Settings behind it. */
  onOpenThread: (sessionId: string) => void
  onClose: () => void
}

type TabId = 'threads' | 'models' | 'safety' | 'skills' | 'prompts' | 'interface'

const TABS: { id: TabId; label: string }[] = [
  { id: 'threads', label: 'Notes & lanes' },
  { id: 'models', label: 'Models' },
  { id: 'safety', label: 'Safety' },
  { id: 'skills', label: 'Skills' },
  { id: 'prompts', label: 'Prompts' },
  { id: 'interface', label: 'Interface' }
]

const EFFORTS: { id: EffortId; label: string; title: string }[] = [
  { id: 'low', label: 'LOW', title: 'Answer fast, think little' },
  { id: 'mid', label: 'MID', title: 'The default' },
  { id: 'high', label: 'HIGH', title: 'Think before answering' },
  { id: 'xhigh', label: 'XHIGH', title: 'Think hard' },
  { id: 'max', label: 'MAX', title: 'Everything it has' }
]

const SAFETY: { id: SafetyId; label: string; note: string }[] = [
  {
    id: 'guarded',
    label: 'Guarded',
    note: 'Nothing runs without a yes. Every write, command and external call asks first.'
  },
  {
    id: 'standard',
    label: 'Standard',
    note: 'Reads and edits run freely; writes to load-bearing files and shell commands ask.'
  },
  {
    id: 'autonomous',
    label: 'Autonomous',
    note: 'Runs the whole plan, then reports. Fastest, and the one that can surprise you.'
  }
]

const THREAD_TOGGLES: { key: keyof Flags; label: string; note: string }[] = [
  {
    key: 'wrapFlip',
    label: 'Wrap when stepping the vault',
    note: '⌥↓ on the last row returns to the first instead of stopping.'
  }
]

const SAFETY_TOGGLES: { key: keyof Flags; label: string; note: string }[] = [
  {
    key: 'allowShell',
    label: 'Allow shell commands',
    note: 'Off restricts Claude to reads and edits inside the vault.'
  },
  {
    key: 'redactSecrets',
    label: 'Redact secrets in transcripts',
    note: 'Tokens and keys are masked before a tool call reaches the screen.'
  },
  {
    key: 'logTools',
    label: 'Keep tool call history',
    note: 'Collapsed Bash and Read calls stay in the thread for audit.'
  }
]

const UI_TOGGLES: { key: keyof Flags; label: string; note: string }[] = [
  { key: 'showCtx', label: 'Show the context meter', note: 'The CTX bar in each chat header.' },
  { key: 'showHints', label: 'Show keyboard hints', note: 'The shortcut line along the bottom.' },
  {
    key: 'paneLift',
    label: 'Lift the selected pane',
    note: 'In the split, the pane taking your keys casts a shadow and the other seats into the desk. Off marks it with a thin ring instead.'
  }
]

/** 30×17 pill, brand when on — the one control shape the design specifies exactly. */
function Toggle({ on }: { on: boolean }): React.JSX.Element {
  return (
    <div
      style={{
        width: 30,
        height: 17,
        borderRadius: 99,
        background: on ? 'var(--ink)' : 'var(--track)',
        flex: 'none',
        padding: 2,
        display: 'flex',
        justifyContent: on ? 'flex-end' : 'flex-start',
        marginTop: 1,
        boxSizing: 'border-box'
      }}
    >
      {/* The knob's colour is state-dependent: on an --ink track it has to be
          --knobOn to read at all, and off a track it has to be --knobOff. One
          unconditional colour makes the off state invisible in one theme. */}
      <div
        style={{
          width: 13,
          height: 13,
          borderRadius: '50%',
          background: on ? 'var(--knobOn)' : 'var(--knobOff)',
          boxShadow: 'var(--shk)'
        }}
      />
    </div>
  )
}

function ToggleRow({
  on,
  label,
  note,
  onClick,
  mark
}: {
  on: boolean
  label: string
  note: string
  onClick: () => void
  /** Names the row for the checks: `data-<mark>`, with `data-on`. */
  mark?: string
}): React.JSX.Element {
  return (
    <div
      onClick={onClick}
      {...(mark ? { [`data-${mark}`]: '1', 'data-on': on ? '1' : '0' } : {})}
      style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer' }}
    >
      <Toggle on={on} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
        <div style={{ font: '500 12px var(--sans)' }}>{label}</div>
        <div
          style={{ font: '400 10.5px/1.5 var(--sans)', color: 'var(--ink3)', maxWidth: 420 }}
        >
          {note}
        </div>
      </div>
    </div>
  )
}

function Heading({ children }: { children: React.ReactNode }): React.JSX.Element {
  return <div style={{ font: '600 12.5px var(--sans)' }}>{children}</div>
}

/**
 * A QUESTION BEFORE SOMETHING THAT COSTS — the Delete band's shape, with the
 * weight moved to the answer that loses nothing: Keep is the default and holds
 * the focus, so ↵ or space straight after the opening press keeps; esc closes
 * the question and leaves Settings open; the control that opened it, pressed
 * again, closes it too (its caller toggles). Yes is a click on its own button —
 * never a key you might already be pressing.
 *
 * `mark` names it for the checks: `data-<mark>-ask` on the band, and
 * `data-<mark>="yes"` / `"keep"` on its two answers.
 */
function Ask({
  mark,
  label,
  yesLabel,
  keepLabel,
  onYes,
  onKeep,
  children
}: {
  mark: string
  /** What a screen reader calls the question. */
  label: string
  yesLabel: string
  keepLabel: string
  onYes: () => void
  onKeep: () => void
  /** The sentence that says what yes would do. */
  children: React.ReactNode
}): React.JSX.Element {
  const keep = useRef<HTMLButtonElement>(null)
  const latest = useRef(onKeep)
  latest.current = onKeep
  useLayoutEffect(() => {
    keep.current?.focus()
  }, [])
  useEffect(() => {
    const on = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape') return
      // Ahead of Settings' own esc, which would close all of it.
      e.preventDefault()
      e.stopImmediatePropagation()
      if (!e.repeat) latest.current()
    }
    window.addEventListener('keydown', on, true)
    return () => window.removeEventListener('keydown', on, true)
  }, [])
  const small = { ...button, font: '500 10px var(--sans)', padding: '4px 9px', background: 'transparent' }
  return (
    <div
      {...{ [`data-${mark}-ask`]: '1' }}
      role="alertdialog"
      aria-label={label}
      style={{
        display: 'flex',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: 9,
        padding: '8px 10px',
        borderRadius: 6,
        background: 'color-mix(in srgb, var(--ink) 12%, transparent)',
        border: '1px solid color-mix(in srgb, var(--ink) 34%, transparent)'
      }}
    >
      <div style={{ font: '400 10.5px/1.5 var(--sans)', color: 'var(--ink)', minWidth: 0, flex: '1 1 240px' }}>
        {children}
      </div>
      <button type="button" {...{ [`data-${mark}`]: 'yes' }} className="hoverable" onClick={onYes} style={small}>
        {yesLabel}
      </button>
      <button
        type="button"
        ref={keep}
        {...{ [`data-${mark}`]: 'keep' }}
        onClick={() => latest.current()}
        style={{ ...small, color: 'var(--onInk)', background: 'var(--ink)', borderColor: 'var(--ink)' }}
      >
        {keepLabel}
      </button>
    </div>
  )
}

/** The question Autonomous asks before it is chosen — app-wide, or for one prompt. */
function AutonomousAsk({
  scope,
  keepLabel,
  onYes,
  onKeep
}: {
  /** Who it would apply to, after the sentence that says what it allows. */
  scope: string
  keepLabel: string
  onYes: () => void
  onKeep: () => void
}): React.JSX.Element {
  return (
    <Ask
      mark="autonomous"
      label="Allow Autonomous?"
      yesLabel="Allow Autonomous"
      keepLabel={keepLabel}
      onYes={onYes}
      onKeep={onKeep}
    >
      <b>Autonomous:</b> Claude runs any command and edits any file in this folder without asking. {scope}
    </Ask>
  )
}

/**
 * A new lane's id: its name's slug and four random characters, `reading-k3x9`.
 * Made once and never again — a rename keeps it — because everything that
 * files a thread into a lane by hand (`laneOverrides`), and the per-lane
 * settings, name the lane by it.
 */
function newLaneId(name: string, taken: readonly LaneDef[]): string {
  const head = slug(name) || 'lane'
  const abc = 'abcdefghijklmnopqrstuvwxyz0123456789'
  for (;;) {
    const tail = Array.from(crypto.getRandomValues(new Uint8Array(4)), (b) => abc[b % abc.length]).join('')
    const id = `${head}-${tail}`
    if (!taken.some((l) => l.id === id)) return id
  }
}

/** A folder as two lanes would be compared on it: case, edge slashes and `./` aside. */
const folderOf = (f: string): string => f.replace(/^(?:\.\/)+/, '').replace(/^\/+|\/+$/g, '').toLowerCase()

/** One lane's name, renamed where it stands. ↵ or leaving the field keeps it; empty puts the old one back. */
function LaneName({
  lane,
  onName
}: {
  lane: LaneDef
  /** False when the name was not taken — another lane has it — and the field goes back. */
  onName: (name: string) => boolean
}): React.JSX.Element {
  const [draft, setDraft] = useState(lane.name)
  useEffect(() => setDraft(lane.name), [lane.name])
  const commit = (): void => {
    const name = draft.trim()
    if (!name || name === lane.name || !onName(name)) setDraft(lane.name)
  }
  return (
    <input
      data-lane-name="1"
      aria-label={`Name of ${lane.name}`}
      value={draft}
      spellCheck={false}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault()
          commit()
        }
      }}
      className="lane-name"
      style={{ ...field, height: 26, width: 150, flex: 'none', font: '500 12px var(--sans)' }}
    />
  )
}

/**
 * THE LANES, as a list a person keeps: `name · folder`, in the rail's order.
 * Added from the vault's own folders, renamed in place, moved up and down,
 * and taken away after a question that says what it costs — the threads filed
 * in it, counted the way the rail counts them, go back to no lane. The notes
 * and the folder are not touched, and a thread moved into the lane by hand
 * keeps its move on file: a move naming a lane that is gone is ignored, never
 * deleted, so a lane by that id coming back finds it.
 */
function LanesSection({
  lanes,
  folders,
  readOnlyFolders,
  threadsIn,
  onLanes
}: {
  lanes: LaneDef[]
  folders: string[]
  readOnlyFolders: string[]
  threadsIn: (laneId: LaneId) => number
  onLanes: (next: LaneDef[]) => void
}): React.JSX.Element {
  const [name, setName] = useState('')
  const [folder, setFolder] = useState('')
  /** Why the last add or rename did not happen. */
  const [says, setSays] = useState<string | null>(null)
  /** The lane whose × is asking, and how many threads it would let go of. */
  const [asking, setAsking] = useState<{ id: LaneId; threads: number } | null>(null)

  const nameTaken = (n: string, except?: LaneId): LaneDef | undefined =>
    lanes.find((l) => l.id !== except && l.name.trim().toLowerCase() === n.toLowerCase())
  const add = (): void => {
    const n = name.trim()
    if (!n || !folder) return
    const same = nameTaken(n)
    if (same) return setSays(`There is a lane called ${same.name} already.`)
    const on = lanes.find((l) => folderOf(l.folder) === folderOf(folder))
    if (on) return setSays(`${on.name} is on ${on.folder} already.`)
    onLanes([...lanes, { id: newLaneId(n, lanes), name: n, folder }])
    setName('')
    setFolder('')
    setSays(null)
  }
  const rename = (id: LaneId, n: string): boolean => {
    const same = nameTaken(n, id)
    if (same) {
      setSays(`There is a lane called ${same.name} already.`)
      return false
    }
    setSays(null)
    onLanes(lanes.map((l) => (l.id === id ? { ...l, name: n } : l)))
    return true
  }
  const move = (i: number, by: -1 | 1): void => {
    const j = i + by
    if (j < 0 || j >= lanes.length) return
    const next = [...lanes]
    ;[next[i], next[j]] = [next[j], next[i]]
    onLanes(next)
  }
  /** × asks; pressed again, it closes its question rather than answering it. */
  const ask = (id: LaneId): void =>
    setAsking((a) => (a?.id === id ? null : { id, threads: threadsIn(id) }))
  const remove = (id: LaneId): void => {
    setAsking(null)
    onLanes(lanes.filter((l) => l.id !== id))
  }

  /*
   * With none yet, one lane per top-level folder is offered — the shape most
   * vaults already have. Not the hidden ones, not _templates (scaffolding,
   * not work), and not a folder kept read only, which nothing is worked on in.
   */
  const suggested = lanes.length
    ? []
    : folders.filter(
        (f) =>
          !f.includes('/') &&
          !f.startsWith('.') &&
          f !== '_templates' &&
          !readOnlyFolders.some((r) => folderOf(r) === folderOf(f))
      )
  const useSuggested = (): void => {
    const made: LaneDef[] = []
    for (const f of suggested) {
      const n = f.charAt(0).toUpperCase() + f.slice(1)
      made.push({ id: newLaneId(n, made), name: n, folder: f })
    }
    onLanes(made)
  }

  const small: React.CSSProperties = {
    ...button,
    padding: 0,
    width: 22,
    height: 22,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    font: '400 11px var(--mono)',
    background: 'transparent'
  }
  const off: React.CSSProperties = { opacity: 0.3, cursor: 'default' }
  const asked = asking ? lanes.find((l) => l.id === asking.id) : undefined

  return (
    <div data-lanes-editor="1" style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
      <Heading>Lanes</Heading>
      <div style={{ font: '400 10.5px/1.5 var(--sans)', color: 'var(--ink3)', maxWidth: 440 }}>
        A lane is a folder of the vault with a name. A thread is filed in the lane whose notes it
        worked on, and the rail shows the lanes in this order.
      </div>
      {lanes.map((l, i) => (
        <div key={l.id} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div data-lane-row={l.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <LaneName lane={l} onName={(n) => rename(l.id, n)} />
            <div style={{ font: '400 11px var(--mono)', color: 'var(--mute)' }}>·</div>
            <div
              data-lane-folder="1"
              title={l.folder}
              style={{
                flex: 1,
                minWidth: 0,
                font: '400 11px var(--mono)',
                color: 'var(--ink3)',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis'
              }}
            >
              {l.folder}
            </div>
            <div
              data-lane-up="1"
              role="button"
              aria-label={`Move ${l.name} up`}
              aria-disabled={i === 0}
              title="Up"
              className={i === 0 ? undefined : 'hoverable'}
              onClick={() => move(i, -1)}
              style={{ ...small, ...(i === 0 ? off : null) }}
            >
              ↑
            </div>
            <div
              data-lane-down="1"
              role="button"
              aria-label={`Move ${l.name} down`}
              aria-disabled={i === lanes.length - 1}
              title="Down"
              className={i === lanes.length - 1 ? undefined : 'hoverable'}
              onClick={() => move(i, 1)}
              style={{ ...small, ...(i === lanes.length - 1 ? off : null) }}
            >
              ↓
            </div>
            <div
              data-lane-x="1"
              role="button"
              aria-label={`Delete ${l.name}`}
              title="Delete this lane"
              className="hoverable"
              onClick={() => ask(l.id)}
              style={small}
            >
              ×
            </div>
          </div>
          {asking && asked && asking.id === l.id ? (
            <Ask
              mark="lane"
              label={`Delete the lane ${asked.name}?`}
              yesLabel="Delete lane"
              keepLabel="Keep"
              onYes={() => remove(asked.id)}
              onKeep={() => setAsking(null)}
            >
              <b>
                {asking.threads === 0
                  ? `No thread is filed in ${asked.name}.`
                  : asking.threads === 1
                    ? `1 thread is filed in ${asked.name}; it becomes unassigned.`
                    : `${asking.threads} threads are filed in ${asked.name}; they become unassigned.`}
              </b>{' '}
              The folder and its notes stay as they are.
            </Ask>
          ) : null}
        </div>
      ))}
      {suggested.length ? (
        <div
          data-lane-suggest="1"
          style={{ display: 'flex', alignItems: 'center', gap: 9, flexWrap: 'wrap', maxWidth: 520 }}
        >
          <div style={{ font: '400 10.5px/1.5 var(--sans)', color: 'var(--ink3)', flex: '1 1 260px' }}>
            One lane per top-level folder:{' '}
            <span style={{ font: '400 10.5px var(--mono)', color: 'var(--ink)' }}>{suggested.join(' · ')}</span>
          </div>
          <div data-lane-suggest-use="1" className="hoverable" onClick={useSuggested} style={button}>
            Use these
          </div>
        </div>
      ) : null}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingTop: 2 }}>
        <input
          data-lane-new="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') add()
          }}
          placeholder="Name"
          spellCheck={false}
          style={{ ...field, width: 150, flex: 'none', font: '400 12px var(--sans)' }}
        />
        <select
          data-lane-new="folder"
          value={folder}
          onChange={(e) => setFolder(e.target.value)}
          style={{ ...field, flex: 1, minWidth: 0, color: folder ? 'var(--ink)' : 'var(--mute)' }}
        >
          <option value="">{folders.length ? 'Folder…' : 'No folders in the vault yet'}</option>
          {folders.map((f) => (
            <option key={f} value={f}>
              {f}
            </option>
          ))}
        </select>
        <div
          data-lane-add="1"
          role="button"
          aria-disabled={!name.trim() || !folder}
          className={name.trim() && folder ? 'hoverable' : undefined}
          onClick={add}
          style={{ ...button, ...(name.trim() && folder ? null : off) }}
        >
          Add lane
        </div>
      </div>
      {says ? <div style={{ font: '400 10.5px/1.5 var(--sans)', color: 'var(--ink)' }}>{says}</div> : null}
    </div>
  )
}

/**
 * A list of folders, one per line — the read-only ones. Kept as typed while
 * the field has it, and handed over trimmed, without its empty lines, half a
 * second after the typing stops or when the field is left; and on the way out,
 * if Settings closes first.
 */
function FolderLines({
  value,
  onSave,
  mark,
  placeholder
}: {
  value: string[]
  onSave: (next: string[]) => void
  mark: string
  placeholder: string
}): React.JSX.Element {
  const said = value.join('\n')
  const [draft, setDraft] = useState(said)
  const held = useRef(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const latest = useRef({ draft, said, onSave })
  latest.current = { draft, said, onSave }
  useEffect(() => {
    if (!held.current) setDraft(said)
  }, [said])
  const save = (): void => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
    const { draft: text, said: was, onSave: give } = latest.current
    const next = text
      .split('\n')
      .map((f) => f.trim())
      .filter(Boolean)
    if (next.join('\n') !== was) give(next)
  }
  useEffect(
    () => () => {
      if (timer.current) save()
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  )
  return (
    <textarea
      {...{ [`data-${mark}`]: '1' }}
      value={draft}
      placeholder={placeholder}
      spellCheck={false}
      rows={Math.min(6, Math.max(2, draft.split('\n').length))}
      onFocus={() => (held.current = true)}
      onChange={(e) => {
        setDraft(e.target.value)
        latest.current.draft = e.target.value
        if (timer.current) clearTimeout(timer.current)
        timer.current = setTimeout(save, 500)
      }}
      onBlur={() => {
        held.current = false
        save()
      }}
      style={{ ...field, height: 'auto', width: 260, padding: '7px 10px', lineHeight: 1.5, resize: 'vertical' }}
    />
  )
}

const field: React.CSSProperties = {
  height: 30,
  padding: '0 10px',
  border: '1px solid var(--rule)',
  borderRadius: 6,
  font: '400 11px var(--mono)',
  background: 'var(--sheet)',
  color: 'var(--ink)',
  boxSizing: 'border-box'
}

const button: React.CSSProperties = {
  font: '500 11px var(--sans)',
  color: 'var(--ink)',
  border: '1px solid var(--edge)',
  borderRadius: 6,
  padding: '6px 11px',
  cursor: 'pointer',
  flex: 'none'
}

export default function Settings({
  state,
  models,
  lanes,
  vault,
  turnRunning,
  folders,
  threadsIn,
  skills,
  patch,
  onSkillsChanged,
  onRunPrompt,
  onOpenThread,
  onClose
}: Props): React.JSX.Element {
  const [tab, setTab] = useState<TabId>('threads')
  /**
   * The add form. `cliId` and `label` are two fields because they were one, and
   * one field could not be both: it was uppercased for the row AND handed to
   * `--model`, so a readable entry like "OPUS 4.6 (INTERNAL)" — which is what
   * the placeholder asked for — was sent to the CLI verbatim and refused.
   */
  const [newModel, setNewModel] = useState({ cliId: '', label: '', window: '' })
  const [checking, setChecking] = useState(false)
  const [modelSays, setModelSays] = useState<{ ok: boolean; text: string } | null>(null)
  const [editing, setEditing] = useState<string | null>(null)
  const [draft, setDraft] = useState({ name: '', description: '' })
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  /** Autonomous chosen, and its question open. */
  const [askAuto, setAskAuto] = useState(false)
  /** Change… pressed while a turn runs, and its question open. */
  const [askVault, setAskVault] = useState(false)
  /** Why the folder was not changed, when there is a reason worth saying. */
  const [vaultSays, setVaultSays] = useState<string | null>(null)

  const flags = state.flags
  const setFlag = (key: keyof Flags): void => patch({ flags: { ...flags, [key]: !flags[key] } })
  const allModels = [...models, ...state.customModels]
  /** Autonomous asks first; pressed again, it closes its question. The others are just chosen. */
  const chooseSafety = (id: SafetyId): void => {
    if (id === 'autonomous' && state.safety !== 'autonomous') {
      setAskAuto((a) => !a)
      return
    }
    setAskAuto(false)
    patch({ safety: id })
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      // A held esc is one press: the repeat of the one that closed a question
      // is not a second asking to close Settings.
      if (e.key === 'Escape' && !e.repeat) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  /**
   * Adds a model, once the CLI agrees it exists.
   *
   * Asked BEFORE it is added rather than discovered at send time: the set of
   * ids the CLI accepts depends on its version and on what the account can
   * reach, so it is the only thing that can answer — and its refusal is a
   * better sentence than anything written here, so it is passed through.
   */
  const addModel = async (): Promise<void> => {
    const cliId = newModel.cliId.trim()
    if (!cliId || checking) return
    if ([...models, ...state.customModels].some((m) => m.cliId === cliId)) {
      setModelSays({ ok: false, text: `${cliId} is already on the list.` })
      return
    }
    setChecking(true)
    setModelSays(null)
    const res = await window.lanes.modelCheck(cliId)
    setChecking(false)
    if (!res.ok) {
      setModelSays({ ok: false, text: res.reason ?? 'The CLI would not accept that model.' })
      return
    }
    const label = newModel.label.trim() || cliId
    const k = parseInt(newModel.window.replace(/[^0-9]/g, ''), 10) || 200
    patch({
      customModels: [
        ...state.customModels,
        {
          id: `custom-${cliId.toLowerCase().replace(/\W+/g, '-')}`,
          cliId,
          name: label.toUpperCase(),
          // The row's second column is the fact worth having: what actually
          // goes to `--model`. A label can say anything; this is the truth.
          note: cliId,
          dot: 'var(--mute)',
          window: k * 1000,
          isCustom: true
        }
      ]
    })
    setNewModel({ cliId: '', label: '', window: '' })
    setModelSays({ ok: true, text: `${label.toUpperCase()} added, and offered in the composer.` })
  }

  /**
   * Another folder. Main asks which with the system's own picker, writes it to
   * state and relaunches, so nothing comes back from a folder chosen; what does
   * come back is a cancel or the same folder again, which say nothing, or a
   * reason it could not be used, which is said.
   */
  const chooseVault = (): void => {
    setAskVault(false)
    setVaultSays(null)
    void window.lanes.chooseVault().then((r) => {
      if (r.ok || !r.reason || r.reason === 'cancelled' || r.reason === 'unchanged') return
      setVaultSays(
        r.reason === 'LANES_VAULT'
          ? 'This run’s folder is set by LANES_VAULT, a development switch, so it is not changed from here.'
          : `The folder was not changed: ${r.reason}.`
      )
    })
  }
  /**
   * Change… asks first while a turn is running anywhere, since the relaunch
   * stops it; pressed again, it closes its question rather than answering it.
   */
  const changeVault = (): void => {
    if (turnRunning || askVault) {
      setAskVault((a) => !a)
      return
    }
    chooseVault()
  }

  const on = state.skillsOff ? skills.filter((s) => !state.skillsOff.includes(s.id)).length : 0

  return (
    <div
      onClick={onClose}
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 40,
        background: 'var(--veil)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 34
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 820,
          maxWidth: '100%',
          height: '100%',
          maxHeight: 640,
          background: 'var(--sheet)',
          borderRadius: 8,
          overflow: 'hidden',
          boxShadow: 'var(--sh2)',
          display: 'flex',
          flexDirection: 'column'
        }}
      >
        <div
          style={{
            flex: 'none',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            padding: '15px 20px',
            borderBottom: '1px solid var(--edge)'
          }}
        >
          <div
            style={{
              font: '600 9.5px var(--mono)',
              letterSpacing: '.13em',
              color: 'var(--ink3)'
            }}
          >
            SETTINGS
          </div>
          <div style={{ flex: 1 }} />
          <div className="hoverable" onClick={onClose} style={button}>
            Done
          </div>
        </div>

        <div style={{ flex: 1, minHeight: 0, display: 'flex' }}>
          <div
            style={{
              width: 168,
              flex: 'none',
              borderRight: '1px solid var(--edge)',
              background: 'var(--card)',
              padding: '10px 8px',
              display: 'flex',
              flexDirection: 'column',
              gap: 2
            }}
          >
            {TABS.map((t) => (
              <div
                key={t.id}
                className="hoverable"
                data-settings-tab={t.id}
                onClick={() => {
                  setTab(t.id)
                  setAskAuto(false)
                  setAskVault(false)
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '7px 9px',
                  borderRadius: 6,
                  cursor: 'pointer',
                  background: tab === t.id ? 'var(--sel)' : 'transparent'
                }}
              >
                <div
                  style={{
                    width: 3,
                    height: 11,
                    borderRadius: 2,
                    background: tab === t.id ? 'var(--ink)' : 'transparent',
                    flex: 'none'
                  }}
                />
                <div
                  style={{
                    font: `${tab === t.id ? 600 : 500} 11.5px var(--sans)`,
                    color: tab === t.id ? 'var(--ink)' : 'var(--ink3)',
                    whiteSpace: 'nowrap'
                  }}
                >
                  {t.label}
                </div>
              </div>
            ))}
            <div style={{ flex: 1 }} />
            {/* Which build this is. "Am I actually running the change?" was the
                wrong answer three times before this existed. */}
            <div
              title="The commit this build came from. A trailing + means it was built with uncommitted changes."
              style={{
                font: '400 9px var(--mono)',
                color: 'var(--mute)',
                padding: '0 12px 4px',
                whiteSpace: 'nowrap'
              }}
            >
              build {__BUILD__}
            </div>
          </div>

          <div
            style={{
              flex: 1,
              minWidth: 0,
              overflowY: 'auto',
              overflowX: 'hidden',
              padding: '18px 22px 26px',
              display: 'flex',
              flexDirection: 'column',
              gap: 20
            }}
          >
            {tab === 'threads' ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                {/* The folder everything here is read from and every thread runs
                    in. Changing it is a relaunch, so it asks first while a turn
                    is running: the relaunch would stop it. */}
                <div data-vault-row="1" style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                  <Heading>Vault</Heading>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div
                      data-vault-path="1"
                      title={vault}
                      style={{
                        ...field,
                        flex: 1,
                        minWidth: 0,
                        display: 'flex',
                        alignItems: 'center',
                        background: 'var(--card)',
                        color: vault ? 'var(--ink)' : 'var(--mute)',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        userSelect: 'text'
                      }}
                    >
                      {vault || 'none chosen'}
                    </div>
                    <div data-vault-change="1" className="hoverable" onClick={changeVault} style={button}>
                      Change…
                    </div>
                  </div>
                  {askVault ? (
                    <Ask
                      mark="vault"
                      label="Switch folders while a turn is running?"
                      yesLabel="Switch and stop it"
                      keepLabel="Keep working"
                      onYes={chooseVault}
                      onKeep={() => setAskVault(false)}
                    >
                      <b>A turn is running.</b> Switching folders relaunches Lanes, which stops it where it is.
                    </Ask>
                  ) : null}
                  <div style={{ font: '400 10.5px/1.5 var(--sans)', color: vaultSays ? 'var(--ink)' : 'var(--ink3)', maxWidth: 440 }}>
                    {vaultSays ??
                      'The folder of notes Lanes works in: every note is read from it and every thread runs in it. Another one relaunches Lanes on it.'}
                  </div>
                </div>

                <div style={{ height: 1, background: 'var(--div)' }} />
                <LanesSection
                  lanes={lanes}
                  folders={folders}
                  readOnlyFolders={state.readOnlyFolders ?? []}
                  threadsIn={threadsIn}
                  onLanes={(next) => patch({ lanes: next })}
                />

                <div style={{ height: 1, background: 'var(--div)' }} />
                {/* Folders whose notes are read here and never written — an inbox
                    something else fills. Main holds the rule; a note in one is
                    read only the moment it is named, with nothing to relaunch. */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                  <Heading>Read-only folders</Heading>
                  <FolderLines
                    mark="readonly-folders"
                    value={state.readOnlyFolders ?? []}
                    onSave={(next) => patch({ readOnlyFolders: next })}
                    placeholder="none"
                  />
                  <div style={{ font: '400 10.5px/1.5 var(--sans)', color: 'var(--ink3)', maxWidth: 420 }}>
                    One folder of the vault per line. Its notes open read only: no edits, renames,
                    moves or trash from here, and no new note lands in it.
                  </div>
                </div>

                {/* Where a new note goes when its name carries no folder. One
                    place, set once: a note made in a hurry is exactly the one
                    you later have to go looking for. */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                  <Heading>New notes go to</Heading>
                  <input
                    data-new-note-folder="1"
                    value={state.newNoteFolder ?? ''}
                    onChange={(e) => patch({ newNoteFolder: e.target.value })}
                    placeholder="vault root"
                    spellCheck={false}
                    style={{ ...field, width: 260 }}
                  />
                  <div style={{ font: '400 10.5px/1.5 var(--sans)', color: 'var(--ink3)', maxWidth: 420 }}>
                    A folder in the vault, made if it is not there yet. Empty means the vault
                    root, and typing <span style={{ font: '400 10px var(--mono)' }}>folder/name</span>{' '}
                    when you name a note still overrides it.
                  </div>
                </div>
                <div style={{ height: 1, background: 'var(--div)' }} />
                {lanes.length ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                    <Heading>Notes shown per lane</Heading>
                    <div
                      style={{
                        font: '400 11px/1.5 var(--sans)',
                        color: 'var(--ink3)',
                        maxWidth: 440
                      }}
                    >
                      How many notes each lane shows before the “more notes” link. The rest stay one
                      click away, and the note you are on is always shown whatever this says.
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingTop: 3 }}>
                      <div
                        className="hoverable"
                        onClick={() => patch({ perLane: Math.max(2, state.perLane - 2) })}
                        style={{ ...button, padding: 0, width: 24, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center', font: '400 12px var(--mono)' }}
                      >
                        –
                      </div>
                      <div
                        style={{ minWidth: 34, textAlign: 'center', font: '500 12.5px var(--mono)' }}
                      >
                        {state.perLane}
                      </div>
                      <div
                        className="hoverable"
                        onClick={() => patch({ perLane: Math.min(24, state.perLane + 2) })}
                        style={{ ...button, padding: 0, width: 24, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center', font: '400 12px var(--mono)' }}
                      >
                        +
                      </div>
                    </div>
                  </div>
                ) : null}
                {THREAD_TOGGLES.map((t) => (
                  <ToggleRow
                    key={t.key}
                    on={flags[t.key]}
                    label={t.label}
                    note={t.note}
                    onClick={() => setFlag(t.key)}
                  />
                ))}
              </div>
            ) : null}

            {tab === 'models' ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <Heading>Models</Heading>
                <div style={{ font: '400 11px/1.6 var(--sans)', color: 'var(--ink3)' }}>
                  The dot picks which models the composer offers. The row picks
                  which one a new thread starts on. A thread already set to a
                  model keeps it offered even when it is put away here.
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {allModels.map((m) => {
                    const active = state.defaultModel === m.id
                    const shown = !state.modelsOff.includes(m.id)
                    return (
                      <div
                        key={m.id}
                        className="hoverable"
                        onClick={() => patch({ defaultModel: m.id })}
                        data-model-row={m.id}
                        data-model-default={active ? '1' : '0'}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 10,
                          padding: '9px 11px',
                          border: `1px solid ${active ? 'var(--ink)' : 'var(--edge)'}`,
                          borderRadius: 6,
                          cursor: 'pointer',
                          background: active ? 'var(--chip)' : 'transparent',
                          // Put away is a quieter row, not a hidden one: this is
                          // the page where you go to bring it back.
                          opacity: shown ? 1 : 0.5
                        }}
                      >
                        <div
                          data-model-shown={shown ? '1' : '0'}
                          title={
                            shown
                              ? 'Offered in the composer — click to put it away'
                              : 'Put away — click to offer it again'
                          }
                          onClick={(e) => {
                            e.stopPropagation()
                            /*
                             * The DEFAULT cannot be put away. It is the model
                             * every new thread starts on, so hiding it would
                             * leave the composer unable to name what the thread
                             * is running — make something else the default
                             * first, which this row is also the control for.
                             */
                            if (active) return
                            patch({
                              modelsOff: shown
                                ? [...state.modelsOff, m.id]
                                : state.modelsOff.filter((x) => x !== m.id)
                            })
                          }}
                          style={{
                            width: 10,
                            height: 10,
                            borderRadius: '50%',
                            background: shown ? m.dot : 'transparent',
                            boxShadow: shown ? 'none' : 'inset 0 0 0 1px var(--rule)',
                            cursor: active ? 'default' : 'pointer',
                            flex: 'none'
                          }}
                        />
                        <div
                          style={{
                            font: '500 11px var(--mono)',
                            letterSpacing: '.04em',
                            whiteSpace: 'nowrap'
                          }}
                        >
                          {m.name}
                        </div>
                        <div
                          style={{
                            font: '400 11px var(--sans)',
                            color: 'var(--ink3)',
                            minWidth: 0,
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis'
                          }}
                        >
                          {m.note}
                        </div>
                        <div style={{ flex: 1, minWidth: 4 }} />
                        <div
                          style={{
                            font: '400 9.5px var(--mono)',
                            color: 'var(--mute)',
                            flex: 'none'
                          }}
                        >
                          {Math.round(m.window / 1000)}k
                        </div>
                        {m.isCustom ? (
                          <div
                            className="hoverable"
                            title="Remove this model"
                            onClick={(e) => {
                              e.stopPropagation()
                              patch({
                                customModels: state.customModels.filter((c) => c.id !== m.id),
                                // Or the id lingers in the hidden list and puts
                                // the model away again the moment it is re-added.
                                modelsOff: state.modelsOff.filter((x) => x !== m.id),
                                defaultModel:
                                  state.defaultModel === m.id ? 'sonnet' : state.defaultModel
                              })
                            }}
                            style={{
                              width: 19,
                              height: 19,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              borderRadius: 4,
                              cursor: 'pointer',
                              font: '400 9px var(--mono)',
                              color: 'var(--ink3)',
                              flex: 'none'
                            }}
                          >
                            ✕
                          </div>
                        ) : null}
                      </div>
                    )
                  })}
                </div>

                <Heading>Add a model</Heading>
                <div style={{ font: '400 11px/1.6 var(--sans)', color: 'var(--ink3)' }}>
                  The <b style={{ fontWeight: 600 }}>id</b> is what goes to{' '}
                  <span style={{ font: '400 10.5px var(--mono)' }}>--model</span>, so it has to be
                  one the CLI knows: an alias like{' '}
                  <span style={{ font: '400 10.5px var(--mono)' }}>opus</span>, or a full id like{' '}
                  <span style={{ font: '400 10.5px var(--mono)' }}>claude-opus-4-5</span>. It is
                  checked against the CLI before it is added, so a name it cannot serve is refused
                  here rather than at the moment you press send.
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <input
                    value={newModel.cliId}
                    onChange={(e) => {
                      setNewModel({ ...newModel, cliId: e.target.value })
                      setModelSays(null)
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') void addModel()
                    }}
                    data-model-id-field="1"
                    placeholder="claude-opus-4-5"
                    style={{ ...field, flex: 1, minWidth: 0, font: '400 11.5px var(--mono)' }}
                  />
                  <input
                    value={newModel.label}
                    onChange={(e) => setNewModel({ ...newModel, label: e.target.value })}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') void addModel()
                    }}
                    placeholder="Label (optional)"
                    style={{ ...field, width: 150, flex: 'none' }}
                  />
                  <input
                    value={newModel.window}
                    onChange={(e) => setNewModel({ ...newModel, window: e.target.value })}
                    placeholder="200k"
                    style={{ ...field, width: 58, flex: 'none' }}
                  />
                  <div
                    onClick={() => void addModel()}
                    data-model-add="1"
                    style={{
                      ...button,
                      color: 'var(--onInk)',
                      background: checking ? 'var(--mute)' : 'var(--ink)',
                      border: '1px solid transparent',
                      padding: '8px 12px',
                      pointerEvents: checking ? 'none' : undefined
                    }}
                  >
                    {checking ? 'Checking…' : 'Add'}
                  </div>
                </div>
                {modelSays ? (
                  <div
                    data-model-says={modelSays.ok ? 'ok' : 'no'}
                    style={{
                      font: '400 11px/1.6 var(--sans)',
                      color: modelSays.ok ? 'var(--ink3)' : 'var(--ink)',
                      padding: '8px 10px',
                      borderRadius: 6,
                      background: 'var(--card)',
                      boxShadow: 'inset 0 0 0 1px var(--edge)'
                    }}
                  >
                    {modelSays.text}
                  </div>
                ) : null}

                <div style={{ height: 1, background: 'var(--div)' }} />
                <Heading>Default effort</Heading>
                <div style={{ display: 'flex', alignItems: 'center' }}>
                  {EFFORTS.map((ef, i) => {
                    const active = state.defaultEffort === ef.id
                    return (
                      <div
                        key={ef.id}
                        onClick={() => patch({ defaultEffort: ef.id })}
                        title={ef.title}
                        style={{
                          height: 26,
                          padding: '0 10px',
                          display: 'flex',
                          alignItems: 'center',
                          border: `1px solid ${active ? 'var(--ink)' : 'var(--edge)'}`,
                          borderRightWidth: i === EFFORTS.length - 1 ? 1 : 0,
                          borderRadius:
                            i === 0 ? '6px 0 0 6px' : i === EFFORTS.length - 1 ? '0 6px 6px 0' : 0,
                          background: active ? 'var(--ink)' : 'transparent',
                          color: active ? 'var(--onInk)' : 'var(--ink3)',
                          cursor: 'pointer',
                          font: '500 9.5px var(--mono)',
                          letterSpacing: '.05em'
                        }}
                      >
                        {ef.label}
                      </div>
                    )
                  })}
                </div>
              </div>
            ) : null}

            {tab === 'safety' ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <Heading>Safety mode</Heading>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {SAFETY.map((m) => {
                    const active = state.safety === m.id
                    return (
                      <div key={m.id} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        <div
                          className="hoverable"
                          data-safety-choice={m.id}
                          data-on={active ? '1' : '0'}
                          onClick={() => chooseSafety(m.id)}
                          style={{
                            display: 'flex',
                            alignItems: 'flex-start',
                            gap: 10,
                            padding: '10px 12px',
                            border: `1px solid ${active ? 'var(--ink)' : 'var(--edge)'}`,
                            borderRadius: 6,
                            cursor: 'pointer',
                            background: active ? 'var(--chip)' : 'transparent'
                          }}
                        >
                          <div
                            style={{
                              width: 12,
                              height: 12,
                              borderRadius: '50%',
                              border: `1px solid ${active ? 'var(--ink)' : 'var(--faint)'}`,
                              background: active ? 'var(--ink)' : 'transparent',
                              flex: 'none',
                              marginTop: 2
                            }}
                          />
                          <div
                            style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}
                          >
                            <div style={{ font: '600 11.5px var(--sans)' }}>{m.label}</div>
                            <div
                              style={{
                                font: '400 10.5px/1.5 var(--sans)',
                                color: 'var(--ink3)',
                                maxWidth: 430
                              }}
                            >
                              {m.note}
                            </div>
                          </div>
                        </div>
                        {m.id === 'autonomous' && askAuto ? (
                          <AutonomousAsk
                            scope="Every chat, and any prompt run by hand that sets none of its own. A scheduled run never inherits it."
                            keepLabel={`Keep ${SAFETY.find((x) => x.id === state.safety)?.label ?? 'it'}`}
                            onYes={() => {
                              setAskAuto(false)
                              patch({ safety: 'autonomous' })
                            }}
                            onKeep={() => setAskAuto(false)}
                          />
                        ) : null}
                      </div>
                    )
                  })}
                </div>
                {SAFETY_TOGGLES.map((t) => (
                  <ToggleRow
                    key={t.key}
                    on={flags[t.key]}
                    label={t.label}
                    note={t.note}
                    onClick={() => setFlag(t.key)}
                  />
                ))}
              </div>
            ) : null}

            {tab === 'skills' ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 9 }}>
                  <Heading>Skills</Heading>
                  <div style={{ font: '400 10px var(--mono)', color: 'var(--mute)' }}>
                    {skills.length ? `${on} of ${skills.length} on` : ''}
                  </div>
                </div>
                {skills.length === 0 ? (
                  <div
                    style={{
                      border: '1px dashed var(--edge)',
                      borderRadius: 6,
                      padding: '12px 13px',
                      font: '400 11px/1.6 var(--sans)',
                      color: 'var(--ink3)'
                    }}
                  >
                    No skills in this vault yet. They live in{' '}
                    <span style={{ font: '400 10.5px var(--mono)' }}>.claude/skills/</span>, one
                    folder each, and appear here as soon as one does.
                  </div>
                ) : null}
                {skills.map((sk) => {
                  const isOff = state.skillsOff.includes(sk.id)
                  const isEditing = editing === sk.id
                  const lane = lanes.find((l) => l.id === sk.lane)
                  return (
                    <div
                      key={sk.id}
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 7,
                        padding: '10px 12px',
                        border: '1px solid var(--edge)',
                        borderRadius: 6,
                        background: isOff ? 'var(--card)' : 'transparent'
                      }}
                    >
                      {isEditing ? (
                        <>
                          <input
                            value={draft.name}
                            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                            placeholder="Skill name"
                            style={{ ...field, width: '100%', font: '600 11.5px var(--sans)' }}
                          />
                          <textarea
                            value={draft.description}
                            onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                            placeholder="What it does, and when it fires"
                            style={{
                              ...field,
                              width: '100%',
                              height: 76,
                              padding: '8px 10px',
                              font: '400 11px/1.55 var(--sans)',
                              resize: 'none'
                            }}
                          />
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <div
                              onClick={() => {
                                void window.lanes
                                  .writeSkill(sk.id, draft.name || sk.name, draft.description)
                                  .then(onSkillsChanged)
                                setEditing(null)
                              }}
                              style={{
                                ...button,
                                color: 'var(--onInk)',
                                background: 'var(--ink)',
                                border: '1px solid var(--ink)',
                                font: '500 10.5px var(--sans)',
                                padding: '5px 11px'
                              }}
                            >
                              Save
                            </div>
                            <div
                              className="hoverable"
                              onClick={() => setEditing(null)}
                              style={{ ...button, font: '500 10.5px var(--sans)', padding: '5px 11px' }}
                            >
                              Cancel
                            </div>
                            <div style={{ flex: 1 }} />
                            <div style={{ font: '400 9.5px var(--mono)', color: 'var(--mute)' }}>
                              writes {sk.id}/SKILL.md
                            </div>
                          </div>
                        </>
                      ) : (
                        <>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                            <div
                              onClick={() =>
                                patch({
                                  skillsOff: isOff
                                    ? state.skillsOff.filter((x) => x !== sk.id)
                                    : [...state.skillsOff, sk.id]
                                })
                              }
                              title={isOff ? 'Turn this skill on' : 'Turn this skill off'}
                              style={{ cursor: 'pointer', flex: 'none' }}
                            >
                              <Toggle on={!isOff} />
                            </div>
                            <div
                              style={{
                                font: '600 11.5px var(--sans)',
                                whiteSpace: 'nowrap',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis'
                              }}
                            >
                              {sk.name}
                            </div>
                            {/* Whose skill it is, read off its name — and with no
                                lanes, nobody's, so nothing is said. A lane is a
                                word, not a hue: ink for one, muted for all. */}
                            {lanes.length ? (
                              <div
                                style={{
                                  font: '400 9px var(--mono)',
                                  letterSpacing: '.08em',
                                  color: lane ? 'var(--ink3)' : 'var(--mute)',
                                  flex: 'none'
                                }}
                              >
                                {lane ? laneLabel(lane) : 'ALL'}
                              </div>
                            ) : null}
                            <div style={{ flex: 1, minWidth: 4 }} />
                            <div
                              className="hoverable"
                              onClick={() => {
                                setEditing(sk.id)
                                setDraft({ name: sk.name, description: sk.description })
                              }}
                              style={{ ...button, font: '500 10px var(--sans)', padding: '4px 9px' }}
                            >
                              Edit
                            </div>
                            <div
                              onClick={() => setConfirmDelete(sk.id)}
                              style={{
                                ...button,
                                font: '500 10px var(--sans)',
                                padding: '4px 9px',
                                color: 'var(--ink)',
                                borderColor: 'color-mix(in srgb, var(--ink) 40%, transparent)'
                              }}
                            >
                              Delete
                            </div>
                          </div>
                          <div
                            title={sk.description}
                            style={{
                              font: '400 10.5px/1.5 var(--sans)',
                              color: 'var(--ink3)',
                              // Real skill descriptions run five lines and turn
                              // the panel into a wall; Edit shows the whole thing.
                              display: '-webkit-box',
                              WebkitLineClamp: 3,
                              WebkitBoxOrient: 'vertical',
                              overflow: 'hidden'
                            }}
                          >
                            {sk.description || 'No description in its frontmatter.'}
                          </div>
                          {confirmDelete === sk.id ? (
                            <div
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 9,
                                padding: '8px 10px',
                                borderRadius: 6,
                                background: 'color-mix(in srgb, var(--ink) 12%, transparent)',
                                border: '1px solid color-mix(in srgb, var(--ink) 34%, transparent)'
                              }}
                            >
                              <div
                                style={{ font: '400 10.5px/1.5 var(--sans)', color: 'var(--ink)' }}
                              >
                                Move <b>{sk.id}</b> to the vault’s trash? Nothing is erased — it
                                goes to <span style={{ font: '400 10px var(--mono)' }}>.trash/skills/</span>.
                              </div>
                              <div style={{ flex: 1 }} />
                              <div
                                onClick={() => {
                                  void window.lanes.deleteSkill(sk.id).then(onSkillsChanged)
                                  setConfirmDelete(null)
                                }}
                                style={{
                                  ...button,
                                  font: '500 10px var(--sans)',
                                  padding: '4px 9px',
                                  color: 'var(--onInk)',
                                  background: 'var(--ink)',
                                  borderColor: 'var(--ink)'
                                }}
                              >
                                Move to trash
                              </div>
                              <div
                                className="hoverable"
                                onClick={() => setConfirmDelete(null)}
                                style={{ ...button, font: '500 10px var(--sans)', padding: '4px 9px' }}
                              >
                                Keep
                              </div>
                            </div>
                          ) : null}
                        </>
                      )}
                    </div>
                  )
                })}
              </div>
            ) : null}

            {tab === 'prompts' ? (
              <PromptsSection
                state={state}
                models={allModels.filter((m) => !state.modelsOff.includes(m.id))}
                lanes={lanes}
                patch={patch}
                onRun={onRunPrompt}
                onOpen={onOpenThread}
              />
            ) : null}

            {tab === 'interface' ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <Heading>Theme</Heading>
                <div style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
                  {/* Three segments, because the preference has three states.
                      AUTO is the default, so a two-segment control would show
                      nothing selected on a fresh install and silently strand
                      anyone who touched it — auto would be unreachable here. */}
                  {(['light', 'dark', 'auto'] as ThemeId[]).map((t, i, all) => (
                    <div
                      key={t}
                      onClick={() => patch({ theme: t })}
                      title={
                        t === 'auto' ? 'Follow the system, and keep following it' : undefined
                      }
                      style={{
                        height: 26,
                        padding: '0 12px',
                        display: 'flex',
                        alignItems: 'center',
                        border: `1px solid ${state.theme === t ? 'var(--ink)' : 'var(--edge)'}`,
                        borderRightWidth: i === all.length - 1 ? 1 : 0,
                        borderRadius:
                          i === 0 ? '6px 0 0 6px' : i === all.length - 1 ? '0 6px 6px 0' : 0,
                        background: state.theme === t ? 'var(--ink)' : 'transparent',
                        color: state.theme === t ? 'var(--onInk)' : 'var(--ink3)',
                        cursor: 'pointer',
                        font: '500 9.5px var(--mono)',
                        letterSpacing: '.05em'
                      }}
                    >
                      {t.toUpperCase()}
                    </div>
                  ))}
                </div>

                <Heading>Text size</Heading>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
                      {TEXT_STEPS.map((v, i) => {
                        const on = Math.abs(state.textScale - v) < 0.001
                        return (
                          <div
                            key={v}
                            onClick={() => patch({ textScale: v })}
                            style={{
                              height: 26,
                              padding: '0 11px',
                              display: 'flex',
                              alignItems: 'center',
                              border: `1px solid ${on ? 'var(--ink)' : 'var(--edge)'}`,
                              borderRightWidth: i === TEXT_STEPS.length - 1 ? 1 : 0,
                              borderRadius:
                                i === 0
                                  ? '6px 0 0 6px'
                                  : i === TEXT_STEPS.length - 1
                                    ? '0 6px 6px 0'
                                    : 0,
                              background: on ? 'var(--ink)' : 'transparent',
                              color: on ? 'var(--onInk)' : 'var(--ink3)',
                              cursor: 'pointer',
                              font: '500 9.5px var(--mono)',
                              letterSpacing: '.05em'
                            }}
                          >
                            {TEXT_LABELS[i].toUpperCase()}
                          </div>
                        )
                      })}
                    </div>
                    <div style={{ font: '400 9.5px var(--mono)', color: 'var(--mute)' }}>
                      ⌘+ ⌘− ⌘0
                    </div>
                  </div>
                  {/* The sample reads through --msg-sm, so it is the real thing
                      rather than a mock-up of it. */}
                  <div
                    style={{
                      padding: '10px 12px',
                      border: '1px solid var(--div)',
                      borderRadius: 6,
                      background: 'var(--card)',
                      font: '400 var(--msg-sm)/1.55 var(--sans)',
                      color: 'var(--ink3)'
                    }}
                  >
                    Sample message text — this is what a reply looks like.
                  </div>
                  <div style={{ font: '400 10px/1.5 var(--sans)', color: 'var(--mute)' }}>
                    Message and note text only. Labels, chips and meta stay where they
                    are, so making the reading text bigger does not reflow the controls.
                  </div>
                </div>

                <div style={{ height: 1, background: 'var(--div)' }} />
                {UI_TOGGLES.map((t) => (
                  <ToggleRow
                    key={t.key}
                    on={flags[t.key]}
                    label={t.label}
                    note={t.note}
                    onClick={() => setFlag(t.key)}
                  />
                ))}
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  )
}

/**
 * One row of choices, in the palette's segmented voice. `null` is DEFAULT —
 * the prompt takes whatever the app is set to at the time it runs, which is
 * what an unset field has always meant here.
 */
function Choice<T extends string>({
  name,
  items,
  now,
  set,
  defaultIs,
  noDefault
}: {
  name: string
  items: [T, string][]
  now: T | null
  set: (v: T | null) => void
  /** What DEFAULT means right now, for its title. */
  defaultIs?: string
  /** A choice that has to be made — no DEFAULT to leave it at. */
  noDefault?: boolean
}): React.JSX.Element {
  const all: [T | null, string][] = noDefault ? items : [[null, 'DEFAULT'], ...items]
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <div style={{ width: 52, flex: 'none', font: '400 10.5px var(--sans)', color: 'var(--mute)' }}>
        {name}
      </div>
      <div data-prompt-choice={name.toLowerCase()} style={{ display: 'flex', flexWrap: 'wrap', rowGap: 4 }}>
        {all.map(([id, label], i) => {
          const on = now === id
          return (
            <div
              key={id ?? 'default'}
              data-choice={id ?? 'default'}
              data-choice-on={on ? '1' : '0'}
              title={id === null && defaultIs ? `The app's own, when it runs — now ${defaultIs}` : undefined}
              onClick={() => set(id)}
              style={{
                height: 21,
                padding: '0 8px',
                display: 'flex',
                alignItems: 'center',
                border: `1px solid ${on ? 'var(--ink)' : 'var(--edge)'}`,
                borderRightWidth: i === all.length - 1 ? 1 : 0,
                borderRadius: i === 0 ? '4px 0 0 4px' : i === all.length - 1 ? '0 4px 4px 0' : 0,
                background: on ? 'var(--ink)' : 'transparent',
                color: on ? 'var(--onInk)' : 'var(--ink3)',
                cursor: 'pointer',
                font: '500 8.5px var(--mono)',
                letterSpacing: '.08em',
                whiteSpace: 'nowrap'
              }}
            >
              {label}
            </div>
          )
        })}
      </div>
    </div>
  )
}

/** `today 06:00`, `tomorrow 06:00`, `yesterday 06:00`, `Mon 12 Oct 06:00`. */
function slotLabel(ms: number, now: number): string {
  const d = new Date(ms)
  const hm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  const off = (n: number): string => {
    const x = new Date(now)
    x.setDate(x.getDate() + n)
    return x.toDateString()
  }
  if (d.toDateString() === off(0)) return `today ${hm}`
  if (d.toDateString() === off(1)) return `tomorrow ${hm}`
  if (d.toDateString() === off(-1)) return `yesterday ${hm}`
  return `${d.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' })} ${hm}`
}

/** `48s`, `2m 14s`, `1h 3m`. */
function took(ms: number): string {
  const sec = Math.max(1, Math.round(ms / 1000))
  if (sec < 60) return `${sec}s`
  const m = Math.floor(sec / 60)
  if (m < 60) return `${m}m ${sec % 60}s`
  return `${Math.floor(m / 60)}h ${m % 60}m`
}

/** How the last run went, in words. */
function ranWords(r: PromptRun): string {
  switch (r.outcome) {
    case 'running':
      return 'running now'
    case 'done':
      return r.finishedAt ? `done in ${took(r.finishedAt - r.at)}` : 'done'
    case 'asked':
      return `stopped — ${r.note ?? 'it wants a yes'}`
    case 'limit':
      return `hit the usage limit${r.note ? ` — ${r.note}` : ''}`
    default:
      return `failed${r.note ? ` — ${r.note}` : ''}`
  }
}

const WEEK: [number, string][] = [
  [1, 'M'],
  [2, 'T'],
  [3, 'W'],
  [4, 'T'],
  [5, 'F'],
  [6, 'S'],
  [0, 'S']
]

type PromptDraft = Omit<SavedPrompt, 'id'>

/**
 * PROMPTS: the ones you send again and again, kept here and run from ⌘K —
 * type `/` and the name. A card per prompt in the Skills section's idiom: its
 * name, its words, and the model, effort, safety and lane its runs take, each
 * DEFAULT until set. Edit in place; Run now; Delete asks first, and can be
 * taken back — a prompt lives in the state file, which has no Trash.
 */
function PromptsSection({
  state,
  models,
  lanes,
  patch,
  onRun,
  onOpen
}: {
  state: AppState
  models: ModelDef[]
  lanes: LaneDef[]
  patch: (p: Partial<AppState>) => void
  onRun: (id: string) => void
  onOpen: (sessionId: string) => void
}): React.JSX.Element {
  const prompts = state.prompts
  /** The prompt being edited — its id, or `new` for one not made yet. */
  const [editing, setEditing] = useState<string | null>(null)
  const [draft, setDraft] = useState<PromptDraft>({ name: '', text: '' })
  const [problem, setProblem] = useState<string | null>(null)
  const [confirm, setConfirm] = useState<string | null>(null)
  /** The last one deleted, and where it stood — for Undo. */
  const [gone, setGone] = useState<{ prompt: SavedPrompt; at: number } | null>(null)
  /** Autonomous chosen for the draft, and its question open. */
  const [askAuto, setAskAuto] = useState(false)

  const nameOf = (id: string | undefined, fallback: string): string =>
    (id && models.find((m) => m.id === id)?.name) || fallback
  // A lane no lane carries any more is passed over — shown as none, kept on
  // the prompt — the way a thread's moved lane is.
  const laneName = (id: LaneId | undefined): string => {
    const lane = lanes.find((l) => l.id === id)
    return lane ? laneLabel(lane) : 'NO LANE'
  }
  const defaultModel = nameOf(state.defaultModel, state.defaultModel.toUpperCase())

  const start = (p: SavedPrompt | null): void => {
    setConfirm(null)
    setProblem(null)
    setAskAuto(false)
    setEditing(p ? p.id : 'new')
    setDraft(
      p
        ? {
            name: p.name,
            text: p.text,
            model: p.model,
            effort: p.effort,
            safety: p.safety,
            autonomousConfirmed: p.autonomousConfirmed,
            lane: p.lane,
            schedule: p.schedule ? { ...p.schedule, days: [...p.schedule.days] } : null
          }
        : { name: '', text: '' }
    )
  }
  const save = (): void => {
    const id = editing === 'new' ? null : editing
    const why = promptProblem(draft, prompts, id)
    setProblem(why)
    if (why) return
    // Unset stays unset: absent from the record, so DEFAULT keeps meaning
    // "whatever the app is set to when it runs".
    const clean: PromptDraft = { name: draft.name.trim(), text: draft.text.trim() }
    if (draft.model) clean.model = draft.model
    if (draft.effort) clean.effort = draft.effort
    if (draft.safety) clean.safety = draft.safety
    // The yes said to Autonomous is kept with it, and goes when it does.
    if (draft.safety === 'autonomous' && draft.autonomousConfirmed) clean.autonomousConfirmed = true
    if (draft.lane) clean.lane = draft.lane
    if (draft.schedule) {
      const time = readTime(draft.schedule.time) ?? draft.schedule.time
      const days = [...new Set(draft.schedule.days)].sort((a, b) => a - b)
      const was = id ? prompts.find((p) => p.id === id)?.schedule : null
      // Unchanged keeps the moment it was set; anything else is set now, so a
      // slot already gone today is not run because of an edit.
      const same =
        was && was.on === draft.schedule.on && was.time === time && was.days.join() === days.join()
      clean.schedule = { days, time, on: draft.schedule.on, since: same ? was.since : Date.now() }
    }
    patch({
      prompts: id
        ? prompts.map((p) => (p.id === id ? { id, ...clean } : p))
        : [...prompts, { id: crypto.randomUUID(), ...clean }]
    })
    setEditing(null)
    setAskAuto(false)
  }
  const remove = (p: SavedPrompt): void => {
    setGone({ prompt: p, at: prompts.findIndex((x) => x.id === p.id) })
    setConfirm(null)
    patch({ prompts: prompts.filter((x) => x.id !== p.id) })
  }
  const undo = (): void => {
    if (!gone) return
    const next = prompts.slice()
    next.splice(Math.min(gone.at, next.length), 0, gone.prompt)
    patch({ prompts: next })
    setGone(null)
  }

  /**
   * Autonomous asks first, as it does app-wide — and the yes is this prompt's
   * own, the one thing that lets a scheduled run of it be Autonomous. Pressed
   * again, Autonomous closes its question. The others are just chosen.
   */
  const chooseSafety = (v: SafetyId | null): void => {
    if (v === 'autonomous' && !(draft.safety === 'autonomous' && draft.autonomousConfirmed)) {
      setAskAuto((a) => !a)
      return
    }
    setAskAuto(false)
    setDraft((d) => ({ ...d, safety: v ?? undefined }))
  }

  /** Switched on, a schedule starts from the work days and from Standard: nobody is there to say yes. */
  const toggleSchedule = (): void =>
    setDraft((d) => {
      const on = !d.schedule?.on
      const schedule: Schedule = {
        days: d.schedule?.days?.length ? d.schedule.days : [1, 2, 3, 4, 5],
        time: d.schedule?.time ?? '',
        on,
        since: d.schedule?.since ?? 0
      }
      const safety: SafetyId | undefined =
        on && d.safety !== 'standard' && d.safety !== 'autonomous' ? 'standard' : d.safety
      return { ...d, schedule, safety }
    })
  const toggleDay = (day: number): void =>
    setDraft((d) => {
      if (!d.schedule) return d
      const has = d.schedule.days.includes(day)
      return { ...d, schedule: { ...d.schedule, days: has ? d.schedule.days.filter((x) => x !== day) : [...d.schedule.days, day] } }
    })
  /** Paused or running again from the card. Running again is asked the same questions a save is. */
  const togglePause = (p: SavedPrompt): void => {
    if (!p.schedule) return
    const on = !p.schedule.on
    const next: SavedPrompt = { ...p, schedule: { ...p.schedule, on, since: on ? Date.now() : p.schedule.since } }
    if (on && promptProblem(next, prompts, p.id)) {
      start(next)
      setProblem(promptProblem(next, prompts, p.id))
      return
    }
    patch({ prompts: prompts.map((x) => (x.id === p.id ? next : x)) })
  }

  /*
   * Esc in a field leaves the field and nothing else. Settings closes on esc,
   * and a half-written prompt is words a stray key should not throw away.
   */
  const keepEsc = (e: React.KeyboardEvent<HTMLElement>): void => {
    if (e.key !== 'Escape') return
    e.stopPropagation()
    e.currentTarget.blur()
  }

  const small = { ...button, font: '500 10px var(--sans)', padding: '4px 9px' }
  const chip = {
    font: '500 8.5px var(--mono)',
    letterSpacing: '.1em',
    color: 'var(--mute)',
    border: '1px solid var(--edge)',
    borderRadius: 3,
    padding: '2px 5px',
    flex: 'none'
  } as React.CSSProperties

  const editor = (
    <div
      data-prompt-editor="1"
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        padding: '10px 12px',
        border: '1px solid var(--ink)',
        borderRadius: 6
      }}
    >
      <input
        data-prompt-field="name"
        value={draft.name}
        autoFocus
        onChange={(e) => {
          const name = e.target.value
          setDraft((d) => ({ ...d, name }))
        }}
        onKeyDown={keepEsc}
        placeholder="Name — what ⌘K finds it by, after a /"
        style={{ ...field, width: '100%', font: '600 11.5px var(--sans)' }}
      />
      <textarea
        data-prompt-field="text"
        value={draft.text}
        onChange={(e) => {
          const text = e.target.value
          setDraft((d) => ({ ...d, text }))
        }}
        onKeyDown={keepEsc}
        placeholder="What it sends — the words, or a line like /morning"
        style={{
          ...field,
          width: '100%',
          height: 92,
          padding: '8px 10px',
          font: '400 11px/1.55 var(--sans)',
          resize: 'vertical'
        }}
      />
      <Choice
        name="Model"
        items={models.map((m) => [m.id, m.name] as [string, string])}
        now={draft.model ?? null}
        set={(v) => setDraft((d) => ({ ...d, model: v ?? undefined }))}
        defaultIs={defaultModel}
      />
      <Choice
        name="Effort"
        items={EFFORTS.map((x) => [x.id, x.label] as [EffortId, string])}
        now={draft.effort ?? null}
        set={(v) => setDraft((d) => ({ ...d, effort: v ?? undefined }))}
        defaultIs={state.defaultEffort.toUpperCase()}
      />
      <Choice
        name="Safety"
        items={SAFETY.filter((x) => !draft.schedule?.on || x.id !== 'guarded').map(
          (x) => [x.id, x.label.toUpperCase()] as [SafetyId, string]
        )}
        now={draft.safety ?? null}
        set={chooseSafety}
        defaultIs={state.safety.toUpperCase()}
        noDefault={Boolean(draft.schedule?.on)}
      />
      {askAuto ? (
        <AutonomousAsk
          scope="Every run of this prompt — a scheduled one too, with nobody there."
          keepLabel={
            draft.safety === 'autonomous'
              ? 'Not now'
              : `Keep ${draft.safety ? (SAFETY.find((x) => x.id === draft.safety)?.label ?? draft.safety) : 'Default'}`
          }
          onYes={() => {
            setAskAuto(false)
            setDraft((d) => ({ ...d, safety: 'autonomous', autonomousConfirmed: true }))
          }}
          onKeep={() => setAskAuto(false)}
        />
      ) : draft.safety === 'autonomous' && !draft.autonomousConfirmed ? (
        <div
          data-autonomous-unconfirmed="1"
          style={{ font: '400 10.5px/1.5 var(--sans)', color: 'var(--ink3)', maxWidth: 470 }}
        >
          Set to Autonomous before it asked: on a schedule it runs Standard until Autonomous is chosen again and
          allowed.
        </div>
      ) : null}
      {lanes.length ? (
        <Choice
          name="Lane"
          items={lanes.map((l) => [l.id, laneLabel(l)] as [LaneId, string])}
          now={draft.lane ?? null}
          set={(v) => setDraft((d) => ({ ...d, lane: v ?? undefined }))}
          defaultIs="none — the lane its words lead to"
        />
      ) : null}
      <div
        data-schedule-editor="1"
        style={{ display: 'flex', flexDirection: 'column', gap: 7, paddingTop: 8, borderTop: '1px solid var(--div2)' }}
      >
        <div
          data-schedule-toggle="1"
          onClick={toggleSchedule}
          style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}
        >
          <Toggle on={Boolean(draft.schedule?.on)} />
          <div style={{ font: '500 11.5px var(--sans)' }}>Run it by itself</div>
        </div>
        {draft.schedule?.on ? (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 52, flex: 'none', font: '400 10.5px var(--sans)', color: 'var(--mute)' }}>
                Days
              </div>
              <div style={{ display: 'flex' }}>
                {WEEK.map(([day, letter], i) => {
                  const on = Boolean(draft.schedule?.days.includes(day))
                  return (
                    <div
                      key={day}
                      data-schedule-day={day}
                      data-day-on={on ? '1' : '0'}
                      onClick={() => toggleDay(day)}
                      style={{
                        width: 24,
                        height: 21,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        border: `1px solid ${on ? 'var(--ink)' : 'var(--edge)'}`,
                        borderRightWidth: i === WEEK.length - 1 ? 1 : 0,
                        borderRadius: i === 0 ? '4px 0 0 4px' : i === WEEK.length - 1 ? '0 4px 4px 0' : 0,
                        background: on ? 'var(--ink)' : 'transparent',
                        color: on ? 'var(--onInk)' : 'var(--ink3)',
                        cursor: 'pointer',
                        font: '500 9px var(--mono)'
                      }}
                    >
                      {letter}
                    </div>
                  )
                })}
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 52, flex: 'none', font: '400 10.5px var(--sans)', color: 'var(--mute)' }}>
                At
              </div>
              <input
                data-schedule-field="time"
                value={draft.schedule.time}
                onChange={(e) => {
                  const time = e.target.value
                  setDraft((d) => (d.schedule ? { ...d, schedule: { ...d.schedule, time } } : d))
                }}
                onKeyDown={keepEsc}
                placeholder="06:00"
                style={{ ...field, width: 84, height: 24 }}
              />
            </div>
            <div style={{ font: '400 10.5px/1.55 var(--sans)', color: 'var(--ink3)', maxWidth: 470 }}>
              While Lanes is running — closing the window does not stop it, quitting does. A time missed while
              the Mac slept runs once when it wakes, the same day. Nobody is there to say yes: Standard stops at
              the first thing outside the vault’s allow-list, and Autonomous runs it all.
            </div>
          </>
        ) : null}
      </div>
      {problem ? (
        <div data-prompt-problem="1" style={{ font: '400 10.5px/1.5 var(--sans)', color: 'var(--ink)' }}>
          {problem}
        </div>
      ) : null}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div
          data-prompt-action="save"
          onClick={save}
          style={{ ...small, color: 'var(--onInk)', background: 'var(--ink)', borderColor: 'var(--ink)' }}
        >
          Save
        </div>
        <div
          data-prompt-action="cancel"
          className="hoverable"
          onClick={() => {
            setEditing(null)
            setProblem(null)
            setAskAuto(false)
          }}
          style={small}
        >
          Cancel
        </div>
      </div>
    </div>
  )

  return (
    <div data-prompts="1" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 9 }}>
        <Heading>Prompts</Heading>
        <div style={{ font: '400 10px var(--mono)', color: 'var(--mute)' }}>
          {prompts.length ? `${prompts.length} kept` : ''}
        </div>
        <div style={{ flex: 1 }} />
        <div data-prompt-action="new" className="hoverable" onClick={() => start(null)} style={small}>
          + New prompt
        </div>
      </div>
      <div style={{ font: '400 10.5px/1.6 var(--sans)', color: 'var(--ink3)', maxWidth: 470 }}>
        The ones you send again and again. Each is a row in ⌘K — type{' '}
        <span style={{ font: '400 10px var(--mono)' }}>/</span> and its name — and ↵ runs it in a new
        thread, named for it and the day; ⇧↵ puts its words in the composer to change first. And one
        can run by itself, on the days and at the time you give it, while Lanes is running.
      </div>
      <ToggleRow
        mark="schedules-switch"
        on={state.flags.schedules}
        label="Let prompts run by themselves"
        note="Runs happen while Lanes is open, even with its window closed; quitting stops them."
        onClick={() => patch({ flags: { ...state.flags, schedules: !state.flags.schedules } })}
      />

      {gone ? (
        <div
          data-prompt-gone="1"
          style={{ display: 'flex', alignItems: 'center', gap: 9, font: '400 10.5px var(--sans)', color: 'var(--ink3)' }}
        >
          <div>
            Deleted <b style={{ color: 'var(--ink)' }}>{gone.prompt.name}</b>.
          </div>
          <div data-prompt-action="undo" className="hoverable" onClick={undo} style={small}>
            Undo
          </div>
        </div>
      ) : null}

      {editing === 'new' ? editor : null}

      {prompts.length === 0 && editing !== 'new' ? (
        <div
          style={{
            border: '1px dashed var(--edge)',
            borderRadius: 6,
            padding: '12px 13px',
            font: '400 11px/1.6 var(--sans)',
            color: 'var(--ink3)'
          }}
        >
          No prompts yet. Keep one here and it is in ⌘K after a{' '}
          <span style={{ font: '400 10.5px var(--mono)' }}>/</span>.
        </div>
      ) : null}

      {prompts.map((p) =>
        editing === p.id ? (
          <div key={p.id}>{editor}</div>
        ) : (
          <div
            key={p.id}
            data-prompt-card={p.id}
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 7,
              padding: '10px 12px',
              border: '1px solid var(--edge)',
              borderRadius: 6
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div
                data-prompt-name="1"
                style={{
                  font: '600 11.5px var(--sans)',
                  minWidth: 0,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap'
                }}
              >
                {p.name}
              </div>
              <div style={{ flex: 1, minWidth: 4 }} />
              <div data-prompt-action="run" className="hoverable" onClick={() => onRun(p.id)} style={small}>
                Run now
              </div>
              <div data-prompt-action="edit" className="hoverable" onClick={() => start(p)} style={small}>
                Edit
              </div>
              <div
                data-prompt-action="delete"
                // Pressed again, it closes the question — it never answers it.
                onClick={() => setConfirm((c) => (c === p.id ? null : p.id))}
                style={{
                  ...small,
                  color: 'var(--ink)',
                  borderColor: 'color-mix(in srgb, var(--ink) 40%, transparent)'
                }}
              >
                Delete
              </div>
            </div>
            <div
              title={p.text}
              style={{
                font: '400 10.5px/1.5 var(--sans)',
                color: 'var(--ink3)',
                whiteSpace: 'pre-wrap',
                display: '-webkit-box',
                WebkitLineClamp: 3,
                WebkitBoxOrient: 'vertical',
                overflow: 'hidden'
              }}
            >
              {p.text}
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
              <div style={chip}>{p.model ? nameOf(p.model, p.model) : `MODEL · ${defaultModel}`}</div>
              <div style={chip}>{p.effort ? p.effort.toUpperCase() : `EFFORT · ${state.defaultEffort.toUpperCase()}`}</div>
              <div style={chip}>{(p.safety ?? state.safety).toUpperCase()}{p.safety ? '' : ' · APP'}</div>
              {lanes.length ? <div style={chip}>{laneName(p.lane)}</div> : null}
            </div>
            {p.schedule ? (
              <div
                data-prompt-schedule="1"
                style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', rowGap: 4 }}
              >
                <div
                  data-prompt-pause="1"
                  title={p.schedule.on ? 'Pause it' : 'Let it run again'}
                  onClick={() => togglePause(p)}
                  style={{ cursor: 'pointer', flex: 'none' }}
                >
                  <Toggle on={p.schedule.on} />
                </div>
                <div style={{ font: '500 9px var(--mono)', letterSpacing: '.06em', color: 'var(--ink)' }}>
                  {describe(p.schedule)}
                </div>
                <div data-prompt-next="1" style={{ font: '400 10.5px var(--sans)', color: 'var(--ink3)' }}>
                  {(() => {
                    if (!p.schedule.on) return 'paused'
                    if (!state.flags.schedules) return 'held — the switch above is off'
                    const next = nextSlot(p.schedule, Date.now())
                    return next ? `next ${slotLabel(next, Date.now())}` : 'nothing ahead'
                  })()}
                </div>
                {state.runs[p.id] ? (
                  <div data-prompt-last="1" style={{ font: '400 10.5px var(--sans)', color: 'var(--ink3)' }}>
                    · last {slotLabel(state.runs[p.id].at, Date.now())}, {ranWords(state.runs[p.id])} ·{' '}
                    <span
                      data-prompt-open-run="1"
                      className="hoverable"
                      onClick={() => onOpen(state.runs[p.id].sessionId)}
                      style={{ color: 'var(--ink)', cursor: 'pointer', textDecoration: 'underline' }}
                    >
                      open
                    </span>
                  </div>
                ) : null}
              </div>
            ) : null}
            {confirm === p.id ? (
              <div
                data-prompt-confirm="1"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 9,
                  padding: '8px 10px',
                  borderRadius: 6,
                  background: 'color-mix(in srgb, var(--ink) 12%, transparent)',
                  border: '1px solid color-mix(in srgb, var(--ink) 34%, transparent)'
                }}
              >
                <div style={{ font: '400 10.5px/1.5 var(--sans)', color: 'var(--ink)' }}>
                  Delete <b>{p.name}</b>? It is kept nowhere else — Undo brings it back while you are here.
                </div>
                <div style={{ flex: 1 }} />
                <div
                  data-prompt-action="confirm-delete"
                  onClick={() => remove(p)}
                  style={{ ...small, color: 'var(--onInk)', background: 'var(--ink)', borderColor: 'var(--ink)' }}
                >
                  Delete
                </div>
                <div data-prompt-action="keep" className="hoverable" onClick={() => setConfirm(null)} style={small}>
                  Keep
                </div>
              </div>
            ) : null}
          </div>
        )
      )}
    </div>
  )
}
