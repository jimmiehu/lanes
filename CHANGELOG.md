# Changelog

## 0.1.0 — first public, source-only

The first version anyone but its author can run. There is no download: you
build it yourself (`npm ci && npm run dev`, or `npm run pack` for an app signed
locally or ad hoc). macOS only, with Claude Code installed and signed in;
tested with Claude Code 2.1.285.

What is in it:

- **A workspace of threads and notes, side by side.** Threads on the left,
  notes on the right, always; both drawn by one document engine. Threads are
  your own Claude Code sessions, run through your `claude` CLI in the vault's
  folder — including ones started in a terminal.
- **Notes you write in place**, with WRITE and READ over one file, measured
  against iA Writer.
- **Your folder, chosen at first launch.** *Choose a folder…*, *Use the
  sample* or *Quit*; changed later in Settings → Notes & lanes, which
  relaunches, and asks first while a turn is running. The sample vault ships
  with the app (`fixtures/sample-vault`) and is copied into a folder you pick,
  as `Lanes Sample`; to a setup with no lanes or read-only folders yet it
  brings two lanes, Garden and Kitchen, and `inbox/` read only.
- **Lanes are yours.** None by default. Each is a name and a vault folder, set
  in Settings → Notes & lanes: added from the vault's top two levels of
  folders, renamed in place, ordered as the rail shows them, and deleted only
  after saying how many threads it leaves unassigned. A thread is filed in the
  lane whose folder holds the notes it worked on, the deepest folder winning;
  a skill named `<lane>-…` belongs to that lane. No folder names are assumed.
  Read-only folders are a setting (none by default), and new notes go to a
  folder you choose (the vault root by default). `_templates/` is kept out of
  *related*.
- **Safety modes.** A new install starts Guarded; Standard and Autonomous are
  there, and choosing Autonomous asks first. Approving a refused command in
  Guarded runs the rest of that turn with `bypassPermissions` — the CLI has no
  narrower grant — and the row you approve from says the yes covers the rest
  of the turn.
- **Saved prompts, and schedules that are off until you switch them on** in
  Settings → Prompts. A scheduled run is Autonomous only if that prompt was
  confirmed Autonomous; otherwise Standard at most.
- **Hardening.** Links leave through one door; the window cannot navigate
  away; every permission but writing to the clipboard is denied; the renderer
  is sandboxed under a Content-Security-Policy that names no remote origin;
  development switches do nothing in a packaged build; one Lanes per state
  file. See SECURITY.md.
- **Updates from your own checkout, if you turn them on.** `npm run follow --
  on <branch>` builds each new commit of that branch in a clone outside your
  checkout; Lanes reads what is ready from
  `~/Library/Application Support/lanes-follow/ready.json` and says *Update
  ready* at the foot of the rail. *Restart now* — or quitting, when the build
  is known to be newer than the app — hands the bundle to `build/swap.sh`,
  which installs it only over the same app signed the same way, and one
  install at a time. Nothing is offered unless you ran it; `npm run follow --
  off` stops it and removes all it made.
- **No network calls of its own.** What you send goes through the CLI to
  Anthropic. Naming a thread the CLI has not named sends an excerpt of its
  first exchange to Haiku, with the file, shell and web tools denied. The
  `npm ci` that `npm run follow` runs, if you turn it on, is npm reaching its
  registry, not the app. See PRIVACY.md.
- **Checks.** `node checks/run.mjs` runs them: `--node` the node checks,
  `--smoke` a short list of driven ones, `--all` every driven one, each in a
  throwaway world under `/private/tmp` with a stand-in CLI. Claims are
  checked, not asserted.

Not yet:

- A signed, notarised build to download (no Developer ID yet), and Electron's
  fuses, which are at their defaults.
- An update check. Lanes asks no server for a newer version; the only update
  it offers is one `npm run follow` built from your own checkout.
- Help inside the app. The docs are the help for now.
- Any platform but macOS.
