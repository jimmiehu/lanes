import { useState } from 'react'
import { said, type UpdateState } from '@shared/update'

/**
 * "UPDATE READY", AT THE FOOT OF THE RAIL.
 *
 * A build of the branch `build/follow.sh` follows is ready (main/update.ts).
 * Said in one quiet line — no dialog, nothing in the way of what you opened
 * the app to do — which opens in place to the commits it brings, newest first,
 * each subject opening to its body. Restart now goes into it: at once, or,
 * with a reply running, once the reply has landed, since quitting would stop
 * it — or, with a Guarded question open, once it is answered, since the
 * relaunch would lose it; it says which. Left alone, it goes in when you quit,
 * if it is known to be newer than this Lanes: one that cannot be placed among
 * the branch's commits may be older, and goes in only by Restart now.
 */
export default function UpdateLine({
  update,
  onRestart,
  onCancel
}: {
  update: UpdateState
  onRestart: () => void
  onCancel: () => void
}): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const [body, setBody] = useState<string | null>(null)
  const n = update.notes.length
  const what = update.since ? `${n} change${n === 1 ? '' : 's'}` : update.short

  return (
    <div data-update={update.short} style={{ flex: 'none', borderTop: '1px solid var(--div)' }}>
      <div
        data-update-line="1"
        role="button"
        tabIndex={0}
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            setOpen(!open)
          }
        }}
        title={open ? 'Hide what it brings' : `Lanes ${update.short}, built from ${update.branch || 'its branch'}: what it brings`}
        style={{ display: 'flex', alignItems: 'center', gap: 8, height: 30, padding: '0 15px', cursor: 'pointer' }}
      >
        <div style={{ width: 5, height: 5, borderRadius: 99, background: 'var(--ink)', flex: 'none' }} />
        <div style={{ flex: 1, font: '500 10.5px var(--sans)', color: 'var(--ink2)' }}>
          Update ready · {what}
        </div>
        <svg width="8" height="8" viewBox="0 0 14 14" fill="var(--mute)" style={{ flex: 'none', transform: `rotate(${open ? 90 : 0}deg)` }}>
          <path d="M4 3l5 4-5 4z" />
        </svg>
      </div>

      {open ? (
        <div data-update-notes="1" style={{ padding: '0 15px 12px' }}>
          {!update.since ? (
            <div style={{ font: '400 10px/1.5 var(--sans)', color: 'var(--mute)', marginBottom: 6 }}>
              Built from {update.branch || 'its branch'} at {update.short}. This Lanes is not among its latest commits, so
              what changed cannot be told apart — these are its newest.
            </div>
          ) : null}
          <div style={{ maxHeight: '38vh', overflowY: 'auto', margin: '0 -4px 10px' }}>
            {update.notes.map((note) => (
              <div key={note.commit} data-update-note={note.commit.slice(0, 7)}>
                <div
                  onClick={() => note.body && setBody(body === note.commit ? null : note.commit)}
                  title={note.commit.slice(0, 7)}
                  style={{
                    padding: '3px 4px',
                    borderRadius: 4,
                    font: '400 10.5px/1.45 var(--sans)',
                    color: 'var(--ink)',
                    cursor: note.body ? 'pointer' : 'default'
                  }}
                >
                  {said(note.subject)}
                </div>
                {body === note.commit ? (
                  <div
                    data-update-body="1"
                    style={{
                      padding: '0 4px 6px',
                      font: '400 10px/1.5 var(--sans)',
                      color: 'var(--mute)',
                      whiteSpace: 'pre-wrap'
                    }}
                  >
                    {note.body}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
          {update.restart === 'waiting' ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ flex: 1, font: '400 10px/1.4 var(--sans)', color: 'var(--ink3)' }}>
                {update.waitingFor === 'question'
                  ? 'Restarting once the question waiting for a yes is answered…'
                  : 'Restarting once the reply running has landed…'}
              </div>
              <button type="button" data-update-cancel="1" onClick={onCancel} className="update-quiet">
                Not now
              </button>
            </div>
          ) : update.restart === 'now' ? (
            <div style={{ font: '400 10px var(--sans)', color: 'var(--ink3)' }}>Restarting…</div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <button type="button" data-update-restart="1" onClick={onRestart} className="update-go">
                Restart now
              </button>
              <div style={{ font: '400 10px/1.4 var(--sans)', color: 'var(--mute)' }}>
                {update.since ? 'or it goes in when you quit' : 'it may be older than this one, so not on quit'}
              </div>
            </div>
          )}
        </div>
      ) : null}
    </div>
  )
}
