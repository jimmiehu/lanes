# Known gaps

What v0.1.0 does not do yet, and what is known to be thinner than the rest.
Said here so nobody has to find it out. Back to the [README](../README.md).

## Not built yet

- **No signed, notarised build.** `npm run pack` makes an app signed with your
  own local certificate if you have one set up (`build/sign.sh`), ad hoc if
  not. There is no Developer ID signature and no notarisation, so a build
  copied to another Mac is one macOS will warn about.
- **Electron's fuses are at their defaults.** Run-as-node, `NODE_OPTIONS`,
  `--inspect` and the rest are left on, and the asar is not integrity-checked.
  They are settings on the packaged bundle, and they land with the first
  signed build.
- **No update check, and no help inside the app.** Lanes asks no server for a
  newer version and downloads nothing. The one update it offers is a build of
  your own checkout, made by `npm run follow` once you turn it on (see the
  README), whose `npm ci` downloads packages as any `npm ci` does. What would
  be its help is `docs/`.
- **Mac only, one vault at a time, Claude Code only.** Switching the vault
  relaunches the app.

## Thinner than the rest

- **Redaction is display masking, and only while a turn streams in.** A thread
  read back from its transcript shows its tool rows as the transcript has
  them. Nothing is redacted on disk; the CLI's transcripts are the CLI's.
- **A Guarded approval is coarser than one call.** Approving a refused shell
  command runs that one turn with the CLI's `bypassPermissions`; the next turn
  asks again. The row says so. The CLI has no per-call grant in headless mode.
- **IPC trusts its one window.** Main checks what every channel is handed —
  note paths, thread ids, skill ids, state patches — but not which frame sent
  it, and an approval's `shell` flag is taken as the renderer hands it back.
  There is only ever the app's own page in the window; a frame check is
  belt-and-braces still to add.
- **Clipboard writes are allowed.** Every other permission a page can ask for
  is denied; `clipboard-sanitized-write` is granted, for the copy buttons.
- **A note created with a leading slash** (`/notes/x`) is made under the vault,
  not refused: `''`, `.` and `/` all mean the vault root to the create
  handlers. It cannot leave the vault.
- **A skill's name is written into its `SKILL.md` frontmatter as typed.** A
  name with a line break in it would add a line to the frontmatter.
- **Pathway records in a state patch are not id-checked.** Thread ids handed
  to the thread, fork and trash channels are; the keys of a `pathways` map
  sent whole in a patch are not.
- **A generic top-level folder name can match outside the vault in a shell
  command.** The folders a Bash command's paths are read against are the
  vault's own top-level folders; a folder called `notes` also matches a
  `/notes/…` elsewhere in the same command. Tightening it would lose real
  touches written as `~/…` or `$VAR/…`.
- **The packaged app's View menu has Toggle Developer Tools.** It is
  Electron's standard View menu; the tools reach only what the window
  already can, and only for whoever is at the keyboard.
- **`npm run install-app` usually waits while Lanes is open.** It will not
  quit Lanes under a running turn, and it takes a live `claude` process as
  one — but a thread keeps its CLI between turns, so an open thread reads as
  a turn running and the install waits for Lanes to be quit. `npm run follow`
  offers its update inside the app instead, and waits for the reply itself.
- **One Lanes per state file is not proved by a check.** The lock is there
  (`requestSingleInstanceLock`); proving the second instance quits would mean
  launching two apps outside the runner.
- **The sandbox and the permission handler have no check of their own.**
  Every driven check runs inside them, which proves they do not get in the
  way, not that they hold.
- **An update's signature is compared by name.** `build/swap.sh` takes a
  bundle whose `CFBundleIdentifier` and whose `Authority`, `TeamIdentifier`
  and `Signature` lines from `codesign -dvv` match the installed app's. That
  is not a designated requirement: a certificate with the same names would
  pass, and any two ad-hoc builds with Lanes' identifier match each other.
  Only `npm run follow` writes the `ready.json` that names the bundle, and
  whoever could write it instead can already run code as you.
- **`npm run follow -- install` cuts a running reply short.** With Lanes
  open it asks it to quit, as ⌘Q does, and quitting stops the CLI. *Restart
  now* in the app waits for a reply to land; `build/follow.sh` cannot tell
  whether one is running, since the CLI is kept between turns, and says so
  before it quits Lanes.

## Checks

- **Eight checks spend real turns** (`live` in `checks/manifest.json`) and
  are run only with `--live`: `branch`, `images`, `path-ticks`, `paths-live`,
  `resend`, `thread-text` and `title-tools` — and `title-late`, which is
  skipped as well (below). They were not run for this release. (`models` and
  `title` run on the stand-in CLI, which answers the model check and the
  namer.)
- **Two checks are skipped** (`skip` in the manifest), so not even `--live`
  runs them:
  - `signin-turn.js` wants the real CLI refusing a token in the shape the CLI
    writes, which no stand-in reproduces honestly.
  - `title-late.js` wants a hand-built transcript with no `ai-title` line —
    the thread fixture's has one — and spends a real turn.
- **One manifest entry is one run.** `limit-live.js` against the `fault`
  stand-in and `usage-live.js` at 0.75, 0.93 and in the dark theme are run by
  hand, by editing the entry or with `--seed`.
- **CI runs the driven smoke list without a promise:** a hosted macOS runner
  may have no window server to give the app, so that step may not fail the
  build.
- **`outline.js` holds the wide case only where the window gets its 1440.**
  On a smaller screen, such as a hosted runner's, the single pane is narrow,
  and the check holds it to the narrow case instead (`onePaneWide` in its
  result says which). The overlay that leaves the text where it is is then
  not checked on that machine.
- **No check installs a real update.** `update-ready.js` and `update-quit.js`
  run in development, where main writes down the install it would have
  started (`swap-plan.json`) instead of starting it; `swap.mjs` runs
  `build/swap.sh` on small bundles of its own, signed ad hoc. The packaged
  app copying `swap.sh` out, quitting and being replaced, and a
  certificate-signed install, are not run by any check.
