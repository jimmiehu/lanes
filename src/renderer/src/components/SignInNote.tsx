import { useState } from 'react'
import { SIGN_IN_COMMAND, type SignInFault } from '@shared/signin'

/**
 * Claude Code's own installer and its setup page, as its documentation gives
 * them. Lanes does not run the one or fetch the other: the command is put on
 * the clipboard, and the page opens in the browser through the app's one door
 * out (main's open.ts), like any other link.
 */
const INSTALL_COMMAND = 'curl -fsSL https://claude.ai/install.sh | bash'
const SETUP_PAGE = 'https://code.claude.com/docs/en/setup'

/**
 * The CLI is not signed in, drawn as the one thing it actually is: a command to
 * run somewhere else.
 *
 * It used to arrive as stderr — mono, on the code ground, in the box kept for
 * machine output you did not ask for — saying `Failed to authenticate: OAuth
 * session expired and could not be refreshed`, once per message, for ever. Each
 * word of that is true and none of it is useful: it does not say that Lanes
 * holds no credentials of its own, it does not say where the login lives, and
 * it does not say what to type.
 *
 * So the COMMAND is the biggest thing here, and it is the only thing you have
 * to read. Lanes cannot run it — a login is a password and a browser round
 * trip, and this app deliberately has no business with either — so the one
 * useful act it can offer is to put it on your clipboard.
 */
export default function SignInNote({
  fault,
  padX,
  missing,
  onCheckAgain
}: {
  /** Null when the fault came from a status check rather than a failed turn. */
  fault: SignInFault | null
  padX: string
  /** There is no `claude` to sign in to: the note says how to install it instead. */
  missing?: boolean
  /** Asks again — after the install, in a terminal. */
  onCheckAgain?: () => Promise<void>
}): React.JSX.Element {
  const [copied, setCopied] = useState(false)
  const [checking, setChecking] = useState(false)
  const copy = (text: string): void => {
    void navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1600)
    })
  }
  const small = {
    flex: 'none',
    font: '400 11px var(--sans)',
    border: '1px solid var(--edge)',
    borderRadius: 5,
    padding: '4px 9px',
    cursor: 'pointer'
  } as const
  if (missing) {
    // The same card with the same one act, for the step before signing in:
    // there is no CLI yet, and installing one is a terminal's business too.
    return (
      <div style={{ flex: 'none', padding: `0 ${padX} 12px` }}>
        <div
          data-cli-missing="1"
          style={{
            borderRadius: 9,
            padding: '13px 16px 14px',
            background: 'var(--card)',
            boxShadow: 'inset 0 0 0 1px var(--edge)',
            display: 'flex',
            flexDirection: 'column',
            gap: 9
          }}
        >
          <div style={{ font: '600 8.5px var(--mono)', letterSpacing: '.18em', color: 'var(--mute)' }}>
            NOT INSTALLED
          </div>
          <div style={{ font: '400 12px/1.6 var(--sans)', color: 'var(--ink2)' }}>
            Claude Code isn’t installed — Lanes runs its{' '}
            <code style={{ font: '400 11.5px var(--mono)' }}>claude</code> command, so install it in a terminal,
            then check again.
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div
              data-install-cmd="1"
              style={{
                flex: 1,
                minWidth: 0,
                font: '400 12px/1.5 var(--mono)',
                color: 'var(--ink)',
                background: 'var(--code)',
                borderRadius: 6,
                padding: '7px 10px',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                userSelect: 'text'
              }}
            >
              {INSTALL_COMMAND}
            </div>
            <div
              data-install-copy="1"
              className="tab"
              onClick={() => copy(INSTALL_COMMAND)}
              style={{ ...small, color: copied ? 'var(--ink)' : 'var(--mute)' }}
            >
              {copied ? 'copied' : 'copy'}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, font: '400 11px var(--sans)' }}>
            <a
              data-install-guide="1"
              href={SETUP_PAGE}
              target="_blank"
              rel="noreferrer"
              style={{ color: 'var(--ink2)' }}
            >
              The setup guide
            </a>
            <div style={{ flex: 1 }} />
            <div
              data-cli-check="1"
              className="tab"
              onClick={() => {
                if (checking || !onCheckAgain) return
                setChecking(true)
                void onCheckAgain().finally(() => setChecking(false))
              }}
              style={{ ...small, color: 'var(--ink)' }}
            >
              {checking ? 'Checking…' : 'Check again'}
            </div>
          </div>
        </div>
      </div>
    )
  }
  return (
    <div style={{ flex: 'none', padding: `0 ${padX} 12px` }}>
      <div
        data-signin="1"
        style={{
          borderRadius: 9,
          padding: '13px 16px 14px',
          background: 'var(--card)',
          boxShadow: 'inset 0 0 0 1px var(--edge)',
          display: 'flex',
          flexDirection: 'column',
          gap: 9
        }}
      >
        <div
          style={{
            font: '600 8.5px var(--mono)',
            letterSpacing: '.18em',
            color: 'var(--mute)'
          }}
        >
          {fault?.lapsed === false ? 'NOT SIGNED IN' : 'SIGNED OUT'}
        </div>

        <div style={{ font: '400 12px/1.6 var(--sans)', color: 'var(--ink2)' }}>
          Lanes runs the <code style={{ font: '400 11.5px var(--mono)' }}>claude</code> command you
          already have and keeps no login of its own, so this is fixed in a terminal rather than
          here. Run it, then send again — the thread is where you left it, with your message in it,
          unanswered.
        </div>

        {/* The command, and the one act this app can honestly perform on it. */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div
            data-signin-cmd="1"
            style={{
              flex: 1,
              minWidth: 0,
              font: '400 12px/1.5 var(--mono)',
              color: 'var(--ink)',
              background: 'var(--code)',
              borderRadius: 6,
              padding: '7px 10px',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis'
            }}
          >
            {SIGN_IN_COMMAND}
          </div>
          <div
            data-signin-copy="1"
            className="tab"
            onClick={() => copy(SIGN_IN_COMMAND)}
            style={{ ...small, color: copied ? 'var(--ink)' : 'var(--mute)' }}
          >
            {/* The same word the note head, a message's action row and a code
                block's chip all use. One verb, one vocabulary. */}
            {copied ? 'copied' : 'copy'}
          </div>
        </div>

        {/* What was actually said, kept at the size of a footnote — it is the
            evidence for everything above. Absent when nothing was sent: the
            status check asked before you typed, which is the better time. */}
        {fault ? (
          <div
            style={{
              font: '400 10px/1.6 var(--mono)',
              color: 'var(--mute)',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis'
            }}
            title={fault.said}
          >
            {fault.said}
          </div>
        ) : (
          <div style={{ font: '400 10px/1.6 var(--mono)', color: 'var(--mute)' }}>
            asked before you typed, so nothing was lost
          </div>
        )}
      </div>
    </div>
  )
}
