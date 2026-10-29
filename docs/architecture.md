# How it works

The parts of Lanes and where they live: the transport to the CLI, the index of
what every thread worked on, every channel between the window and the main
process and what main checks on each, how the window is held to its own page,
building the app, the limits that are known, how the claims in these docs are
checked, and the switches that exist for development. Back to the
[README](../README.md).

## Where things are

| Path | What lives there |
|---|---|
| `src/main/` | Everything with side effects — CLI child processes, session discovery, notes on disk, state |
| `src/main/index.ts` | The app: the window, the IPC handlers, the sweep, and the rules every web contents is held to |
| `src/main/vaultChooser.ts` | The folder Lanes works in: asked for at first launch (a folder, a copy of the sample, or Quit), and by Settings' *Change…*, which relaunches |
| `src/main/cli.ts` | The transport: one long-lived `claude` process per open session |
| `src/main/which.ts` | Finding the `claude` binary from inside a double-clicked app, and `claude auth status` |
| `src/main/config.ts` | The vault, where its sessions are, and the built-in models |
| `src/main/windows.ts` | The context window the CLI reported for each model, kept across launches |
| `src/main/models.ts` | Asking the CLI whether it knows a model id, before a custom model is added |
| `src/main/sessions.ts` | Reads Claude Code's own `.jsonl` transcripts into threads, and forks them |
| `src/main/threadIndex.ts` | The touched-notes index — the cache, the weighting, and the same edge read backwards as a note's chats |
| `src/main/threadText.ts` | The text of every thread, for ⌘K |
| `src/main/lanes.ts` | A thread's lane, voted from the notes it touched |
| `src/main/notes.ts` | Vault note IO — the note index, wikilinks, the write queue, read-only folders, and `vaultPath` / `notePath`, the guards every note path passes |
| `src/main/skills.ts` | The vault's own `.claude/skills/` — read, edited, and moved to the vault's `.trash/skills/` as real files |
| `src/main/state.ts` | `lanes-state.json` in Application Support — the folder, tabs, stars, titles, lanes, prompts and their runs |
| `src/main/scheduler.ts` | Prompts that run by themselves |
| `src/main/title.ts` | Naming a thread the CLI did not name |
| `src/main/pdf.ts` | A note as a PDF, drawn by the app's own page in a hidden window |
| `src/main/locate.ts` | Where a path written in backticks is on this Mac, and opening or showing it |
| `src/main/open.ts` | The one door out: what a link may open |
| `src/main/update.ts` | An update `build/follow.sh` has ready: offered at the rail's foot, installed on restart or on quit by `build/swap.sh` |
| `src/main/ipcGuard.ts` | What the renderer hands main, checked at the door |
| `src/main/dev.ts` | `DEV`, and `devEnv`, the only way main reads a development switch |
| `src/main/guard.ts` | The refusal of a driven check that was not given a vault and a state of its own |
| `src/preload/` | The contextBridge; the renderer's only route to the main process |
| `src/renderer/` | Pure UI over typed IPC |
| `src/renderer/src/styles/tokens.css` | The whole theme. Every colour in the app resolves here |
| `src/renderer/src/state/pane.ts` | The tab model — what a tab owns, and where every open lands |
| `src/renderer/src/components/Rail.tsx` | The rail — Starred, then Recent, Lanes (when there are lanes) or Folders |
| `src/renderer/src/components/Palette.tsx` | ⌘K over every thread, note, task, comment, prompt and skill |
| `src/renderer/src/components/FindBar.tsx` | ⌘F inside the pane you are looking at |
| `src/renderer/src/components/NoteEditor.tsx` | A note's one editor — CodeMirror, and where its words go and come back from |
| `src/renderer/src/lib/editorLive.ts` | What the editor draws and the keys it answers: live marks, furniture, the hidden title, `[[` |
| `src/renderer/src/lib/lineDiff.ts` | A note edited from outside, applied as the changes that were made |
| `src/renderer/src/lib/layout.ts` | How a pane spends its width: the reading measure |
| `src/shared/` | Types and the markdown → block parser, used by both sides |
| `src/shared/mdLive.ts` | READ's grammar with positions, so the editor draws what READ draws — shared, since main finds a note's comments by it too |
| `src/shared/lanes.ts` | Which lane a path is in — the one rule, for main, the window and the skills list, and the one read-only folders are matched by |
| `src/shared/written.ts` | Reading a path as written, and what Open may do with it |
| `build/` | The icon; `pack.sh`, which builds the app; `sign.sh`, the signing step; `refresh.sh`, which installs it; `follow.sh`, which keeps a build of one branch ready; `swap.sh`, which installs one, shipped in the app |
| `fixtures/` | The sample vault, which ships with the app, and the state the checks start from |
| `checks/` | The checks behind the claims in these docs, `manifest.json`, which says what each one needs, and `run.mjs`, which runs them |

## Transport

Each open session is one persistent child process, started in the vault:

```
claude -p --input-format stream-json --output-format stream-json --verbose \
  --resume <id> --model <m> --effort <e> --permission-mode <p>
```

— `--session-id <id>` in place of `--resume <id>` while the session has no
transcript yet — with `--disallowedTools`, one comma-separated argument, added
for the shell when it is switched off and for each skill switched off. Several
turns run over one process without a respawn, and `--resume` on a fresh process
restores the full history. Model, effort and permission mode are process-level
flags, so changing one respawns the process when it is idle. Reading a thread
spawns nothing; a process starts with the first message sent, and goes when its
tab closes. Closing the window does not end a turn: the CLI keeps going and
keeps writing its transcript, and the answer is read back off disk. Quitting
does end it.

Two rules keep a respawn honest, and the Guarded approval depends on both:

- **A replaced process is no longer heard.** Changing model, effort, or
  granting a request kills one `claude` and starts the next in the same tick.
  The dying one keeps talking while it drains — including a final `result` —
  and heard, that would land on state the new process depends on; a yes would
  be cleared before it was ever used.
- **A respawn does not resume a session the old process still holds.** The
  restart closes stdin and waits for the exit before starting the replacement.

The stream sticks to the newest message only while you are already at the newest
message. Scroll up to read something and a turn can arrive underneath without
moving the page; scroll back to the bottom and it follows again. Opening
something new in a pane always starts at the end. `thread-bottom.js` holds the
opening at the end and the way back down from higher up.

A turn arrives as many stream events and collapses into a single CLAUDE message
whose blocks grow while it runs — tool rows appear as `running` and fill in when
their result lands, so a ten-minute turn shows progress the same way a two-second
one does.

The context meter reads real token accounting from the stream
(`input + cache_creation + cache_read`), never an estimate from characters, and
measures it against the window of the thread's own model — the one the CLI
reports at the end of every turn, kept per model, or the one configured until
it has.

**Finding `claude`.** A Finder-launched app inherits
`/usr/bin:/bin:/usr/sbin:/sbin` and nothing else — not Homebrew, not npm's
global prefix, not nvm or bun — so `spawn('claude')` works in `npm run dev` and
fails with ENOENT in the packaged app. `src/main/which.ts` asks your login
shell what the PATH really is (`$SHELL -lc`, not `-i`, which would run a whole
rc file), adds a list of the usual install directories after it, and hands the
recovered PATH to the child as well, because the CLI shells out itself.
`LANES_CLAUDE=/full/path` names the binary outright when it is there, and is
the one `LANES_*` switch the packaged app honours: a CLI installed somewhere
unusual is a user's need, not a developer's.

## The touched-notes index

A thread's NOTES IN CONTEXT, a note's chats and a thread's lane are all
answered by one index over what every thread has worked on. It has two layers,
and the split is the whole design.

**Records** are per transcript and depend only on the file, so they cache to
disk (`lanes-index.json`, beside the state file) keyed by mtime and size. A
launch stats every transcript — a couple of milliseconds for a hundred or so —
and re-reads only the ones that moved. **Weights** depend on all the records at
once, because what a path is worth depends on how many *other* threads touched
it, so they are held in memory and thrown away whenever a record or the vault's
notes change. A thread's lane is not stored in the record: it is worked out
from the thread's touches each time the threads are listed, so changing your
lanes re-files every thread from what is cached and reads nothing again.

A touch carries a weight and a kind: a thread that *wrote* a note has a stronger
claim on it than one that edited it, then one that read it, then one that named
it in a shell command. Much of the real work in a vault happens through the
shell — `grep`, `sed`, `pdftotext` — so paths are read out of shell commands
too, by verb: `cat`, `grep`, `head` and `pdftotext` mean the file was read;
`sed -i`, `tee`, `cp`, `mv` or a `>` into it mean it was changed; `ls`, `find`
and `cd` name a folder someone looked in and claim nothing about its contents.
A path in a command counts as the vault's when it starts with one of the
vault's own top-level folders, read from the vault on every sweep rather than
assumed — and since a folder made or renamed changes what an unmoved transcript
touched, every record is read again when they change. A tool input written
relative to the session's working directory is resolved against the vault, not
the app's own. Prose `[[wikilinks]]` count as a weak fifth kind, but only from
text the two of you actually wrote: transcripts are full of wikilinks that came
back inside tool output, and those are the note's links, not this thread's.

**Inverse thread-frequency** is what makes the ranking mean anything. A daily
summary or a vault-wide tidy-up touches half the vault, so a path's weight is
scaled by `ln(N/df)` — a file every thread opens scores zero, and a note only
these two touched dominates. Relatedness is the cosine of two threads'
weighted vectors, which squares that scaling for free. Two things frequency
cannot catch go out by name: `_templates/` (a skeleton two threads filled in
is not shared work) and the vault's top-level folders themselves (a top-level
folder is the filesystem, not a subject).

The ranking of related threads (`relatedThreads`, behind `lanes:related`) stays
in main, over the same weights, though no view shows it at present. Its
why-lines are templated from what the index holds, with no model in the loop.
The ladder runs most-specific first — a count of shared notes, then a pair,
then a single note described by what each side did to it, then a shared folder
as the weakest fallback, capped at two rows so a thread with no real neighbours
does not fill the list with the same sentence five times.

> Shares 6 notes with this thread, “Beds, and what grows in them” most of all.
> Both threads read “Vienna water — historical facts for the river essay”.
> Edited “Bread — the weekly loaf” — this thread read it.

Titles are quoted because titles carry em dashes and commas, and an unquoted
one runs straight into the sentence around it.

Upkeep is incremental. The index re-sweeps after every turn and every 30
seconds, so a session run from a terminal beside the app appears in the rail
without a relaunch. The same sweep re-checks the notes, since nothing watches
the vault: a folder kept in sync by a cloud provider delivers no events to rely
on.

## IPC

The renderer reaches main only through the bridge in `src/preload/index.ts`,
and everything it hands across is checked in main before anything is done with
it. The page is the app's own, but it renders text nobody here wrote —
Claude's answers, notes from anywhere — so main does not take its word for a
path, an id or a setting. The guards:

- **`vaultPath`** (`src/main/notes.ts`) — a path into the vault, spelled the
  way the note walk spells it, or nothing. It refuses `''`, `.` and `/` (the
  vault itself), any absolute path, `~` and `~/…`, a NUL, and anything whose
  `..` climbs out — tested with `relative`, not `startsWith`, so a sibling
  folder whose name merely begins with the vault's is outside it.
- **`notePath`** — `vaultPath`, and a `.md` file outside hidden and skipped
  folders. Every handler that writes, moves or trashes a note takes only this:
  the vault's `.claude/settings.json` is where a session started there reads
  its hooks from, and a handler that could write it could have a page run
  commands. Reading stays on `vaultPath`.
- **Read-only folders** are tested on the normalised path, so `./inbox/x` is
  `inbox/x`, and matched the way a lane's folder is: case aside, at a folder
  boundary, so `inbox-old/` is not in `inbox`.
- **`isSessionId`** (`src/main/ipcGuard.ts`) — a UUID, as the CLI mints them.
  A session id becomes a transcript's file name and a `--resume` argument,
  where `../x` would be somebody else's file.
- **`sanitizeStatePatch`** — a state patch with every key of the wrong shape
  dropped (`vault` whatever it holds: main's picker is its one writer): `newNoteFolder` (a string), `lanes` (each an `id`, `name`
  and `folder`), `readOnlyFolders` (strings), `safety` (one of the three
  modes), `prompts` (a list of records, refused whole if anything else is in
  it, since saved short it would delete the prompts it left out; a prompt
  whose own `safety` is no mode loses it rather than the prompt). Other keys
  pass; the rest of a patch still lands.
- **The skill id rule** (`src/main/skills.ts`) — `/^(?!\.\.?$)[\w.-]+$/`:
  letters, digits, `_`, `.` and `-`, and never `.` or `..`, which would name
  the skills folder or `.claude/` itself.

`checks/ipc-paths.mjs` feeds every path handler `''`, `.`, `/`, `../x`,
`/etc/hosts`, `~/x`, a sibling of the vault and a NUL, a bad skill id, a
non-UUID thread id and a state patch of the wrong shape, and expects a refusal
from each.

| Channel | What it does | What main checks |
|---|---|---|
| `lanes:bootstrap` | The vault, the models, the lanes and the state, pruned of fork records whose transcripts are gone | No argument |
| `lanes:state` | The state as saved (registered in main; not on the bridge) | No argument |
| `lanes:patchState` | Merges a patch into the state; pokes the scheduler when prompts or flags change, re-files every thread when lanes change, and takes up new read-only folders at once | `sanitizeStatePatch` |
| `lanes:chooseVault` | Another folder to work in: main opens the folder picker itself, stops every running session, writes every note's last words, saves the choice and relaunches | No argument — the renderer never hands main a folder: the picker is main's, and a `vault` in a state patch is dropped (`sanitizeStatePatch`) |
| `lanes:threads` | Every thread, summarised | No argument |
| `lanes:thread` | One thread's transcript | `isSessionId`, else nothing |
| `lanes:fork` | Copies a transcript into a new session, cut at a message | `isSessionId`; the cut must land on the message the caller saw, or it is refused as moved |
| `lanes:pathTrash` | One path of a thread to the Trash, its children promoted | `isSessionId`, and a recorded path, never a thread's root |
| `lanes:send` | Sends a turn, starting or resuming the session's process | A session id that is not a UUID is dropped and a fresh session made |
| `lanes:configure` | Model, effort, safety for a session | As `send` |
| `lanes:interrupt` | Stops a running turn | Looked up among live sessions; an unknown id does nothing |
| `lanes:close` | Ends a session's process when its tab closes | As `interrupt` |
| `lanes:answer` | Carries a yes or a no back to a refused call | The live session is looked up by the request's session id |
| `lanes:note` | Reads a note | `vaultPath` |
| `lanes:noteWrite` | Writes a note, queued, newest wins | `notePath`; read-only folders; the mtime the app last saw, or *conflict* and nothing written |
| `lanes:noteWriteSync` | The window's last write as it closes (`sendSync`) | As `noteWrite`; a changed file keeps its words and these go to a `(conflicted copy)` beside it |
| `lanes:noteCreate` | A new note from a name, `folder/name` allowed | `vaultPath` on the result; read-only folders; never over an existing file |
| `lanes:noteCreateUntitled` | `untitled.md`, or the first free `untitled-N.md` | `vaultPath`; read-only folders |
| `lanes:noteMtime` | A note's mtime, for the poll | `vaultPath` |
| `lanes:noteOwnChange` | Whether a change was main's own rewrite | `vaultPath` |
| `lanes:noteRename` | Renames a note, its heading and every link to it | `notePath` on both ends; read-only folders |
| `lanes:noteMove` | Moves a note to another folder, links following | `notePath` on both ends; read-only folders |
| `lanes:noteTrash` | A note to the system Trash | `notePath`; read-only folders; a file, never a folder |
| `lanes:reveal` | Shows a note in the Finder | `vaultPath` |
| `lanes:notePdf` | A note as a PDF, to where the save panel says | Vault-relative, not empty, not absolute, and inside the vault |
| `lanes:notesList` | Every note, for the rail | No argument |
| `lanes:resolveLink` | Which note a `[[link]]` lands on | Looked up in the note index; nothing is opened by it |
| `lanes:noteLinks` | A note's links, out and back | As `resolveLink` |
| `lanes:chatsOfNote` | The threads that worked on a note | As `resolveLink` |
| `lanes:linked` | The notes a thread worked on | Looked up in the touched-notes index |
| `lanes:related` | Threads next to a thread | As `linked` |
| `lanes:searchNotes` `lanes:searchContent` `lanes:searchTasks` `lanes:searchComments` `lanes:searchThreads` | ⌘K's searches | A query, matched in memory |
| `lanes:openTasks` | How many open tasks there are | No argument |
| `lanes:locate` | Where a path written in backticks is on this Mac | Stats the candidates and may ask Spotlight under home — metadata only; records each place it hands out |
| `lanes:openFound` | Opens a place `locate` found | Only a place it handed out; judged and opened as the file at the end of any link; documents and media open, a script opens as text, anything else is refused |
| `lanes:revealFound` | Shows a place `locate` found in the Finder | Only a place it handed out |
| `lanes:title` | Names a thread from its opening exchange | Each side clipped to 600 characters; run from a temporary folder with the file, shell, web and agent tools denied |
| `lanes:modelCheck` | Asks the CLI whether it knows a model id | Trimmed and not empty; one argument to the CLI, never through a shell; tools denied, from a temporary folder |
| `lanes:skills` | The vault's skills, read fresh | No argument |
| `lanes:writeSkill` | A skill's name and description | The skill id rule |
| `lanes:deleteSkill` | A skill's folder to the vault's `.trash/skills/` | The skill id rule |
| `lanes:authStatus` | `claude auth status` | No argument |
| `lanes:runShown` | A scheduled run's tab is made | Looked up among the runs main recorded; an unknown prompt changes nothing |
| `lanes:printReady` | The print window saying it has drawn the note (`send`) | Heard only while a PDF is being made, and only from that window |
| `lanes:update` | The update `ready.json` offers this app, or nothing | No argument |
| `lanes:updateRestart` | Restart into it: now, or once no reply is running and no Guarded question is open | No argument — the bundle is the one main read from `ready.json`, never one the window names |
| `lanes:updateCancel` | Calls off a restart that is waiting | No argument |

And from main to the window, pushed rather than asked: `lanes:event` (a turn's
stream), `lanes:ran` and `lanes:runs` (a scheduled run started or moved on),
`lanes:threads`, `lanes:notes` and `lanes:swept` (the sweep), `lanes:lanes`
(the lanes, when a patch changed them), `lanes:update` (what is ready, when it
changes), `lanes:closeTab` (⌘W, a menu accelerator) and `lanes:openNote` (a
`file:` link into the vault that reached main, to be opened as a note).

## Hardening

The rules every web contents the app makes is held to — the window, and the
hidden one a PDF is printed from — are set once, on `web-contents-created`
(`src/main/index.ts`):

- **Nowhere to go.** `will-navigate` and `will-redirect` are stopped unless the
  target is the app's own page — the dev server's origin in development, the
  very same `index.html` otherwise — so a dropped file or a stray link cannot
  replace the app, bridge and all.
- **One door out.** A page never opens a window; what a `target=_blank` link
  asked for goes to `openOutside` (`src/main/open.ts`): `https:`, `http:` and
  `mailto:` to the system, `file:` to a note or the Finder, anything else
  refused. `checks/open-outside.mjs` holds the rule.
- **No `<webview>`, and no permission** but `clipboard-sanitized-write`, which
  the copy buttons need.
- **A sandboxed renderer** — `sandbox: true`, `contextIsolation: true`, no node
  integration — with a preload built as CommonJS that uses nothing but
  `contextBridge` and `ipcRenderer`.
- **A strict content security policy** in `index.html`: `default-src 'self'`,
  `script-src 'self'`, styles from the app and inline, images from the app and
  `data:` only, and `object-src`, `frame-src`, `base-uri` and `form-action` all
  `'none'`. `connect-src` falls back to `'self'`, which lets the dev server's
  socket work and nothing else reach anything; `checks/no-network.mjs` holds
  the line, and scans the source for every way to open a connection.
- **Development switches are closed in the packaged app** — see
  [Dev affordances](#dev-affordances). Main also refuses to start if its two
  ways of asking "is this the packaged app?" ever disagree, since either
  answer wrong is a way to run that nobody wants.
- **One Lanes per state file.** A second instance on the same state shows the
  first and quits: two would be two schedulers running every slot over the same
  prompts, and two writers of one state file.

## Building the app

`npm run pack` runs `build/pack.sh`: the typecheck and the bundle
(`npm run build`), electron-builder, then `build/sign.sh`. The app lands in
`dist/mac-arm64/Lanes.app`, or in `$LANES_BUILD_DIR/mac-arm64/Lanes.app` when
that is set; it is built for Apple Silicon only. There is no Developer ID and
no notarisation yet, so the app is for the Mac that built it. The signing
script signs the helpers and frameworks first and the bundle last, or the outer
signature is computed over unsigned insides.

It signs with a local certificate when you have one — `LANES_SIGN_IDENTITY`,
or the SHA-1 in `build/.sign-identity`, which stays out of the repo — and ad
hoc otherwise, or when the identity named is not one this Mac can sign with.
Apple Silicon will not run an unsigned binary, and electron-builder's
`identity: null` does not sign at all: it leaves the Electron binary's own
signature over contents that no longer match, which macOS rejects. A
certificate is better than ad hoc because macOS identifies an ad-hoc app by the
hash of that exact build, so every rebuild is a stranger to its privacy
database and every Allow is asked again; a certificate-backed signature is
identified by the certificate, so the answers stick.

The build cannot land inside a synced folder. A file provider such as Dropbox
stamps every file it syncs with `com.apple.fileprovider` extended attributes,
and re-applies them faster than `xattr -c` strips them, and `codesign` refuses
a bundle carrying any. So `pack.sh` refuses an output under
`~/Library/CloudStorage/` or iCloud Drive's `~/Library/Mobile Documents/` and
asks for `LANES_BUILD_DIR`, a folder outside them —
`LANES_BUILD_DIR=$HOME/Library/Caches/lanes-build npm run pack` will do.

`npm run install-app` runs `build/refresh.sh`: it packs again only when
something that reaches the bundle has changed — `src/`, `build/`,
`package.json`, the build configs, or the commit — and copies the app to
`/Applications/Lanes.app`. A Lanes that is running is quit and reopened around
the copy, except while a turn is running, when the new build waits for the
next run. The copy is made holding the lock `build/swap.sh` takes for the
bundle (below), since quitting Lanes can start its own install of an update:
whichever comes second waits, and this build is the one left in place.

`npm run follow -- on <branch>` runs `build/follow.sh`, which writes a
`reference-transaction` hook into the repository's own hooks folder
(`<git-common-dir>/hooks`) — refusing, and following nothing, if a hook that
is not its own is there, or if `core.hooksPath` is set, since git would not
run that one and a hook in the folder it names would run for every repository
that uses it. Turned on from another clone, it first takes its hook out of the
one it followed. Git runs the hook after every ref update, and when the
followed branch of the followed repository moved it starts a pass, detached
in a session of its own. The pass reads the branch into a clone
outside the synced folder (`~/Library/Application Support/lanes-follow/src`),
cloned and fetched from the repository's own path on disk, never a remote;
runs `npm ci` there the first time and whenever `package-lock.json` changed —
the step that reaches the network: npm's registry, and Electron's download, for
whatever their caches lack; builds the commit with `pack.sh` into a folder
of its own under `~/Library/Caches/lanes-follow/`, keeping the two newest; and
says so in `~/Library/Application Support/lanes-follow/ready.json` — the
commit, the branch, the bundle, when it was built, and the branch's latest
forty commits. It installs nothing. A pass reads the config again each time
round, and once more before it says a build is ready, so an `off` or an `on`
of another branch made while it builds is what holds: a build for a following
that ended, or moved to another branch, is neither offered nor kept. A hook
and not a launchd timer, because a launchd job cannot read a checkout in
Dropbox or iCloud Drive — macOS refuses it — while git runs a hook inside
whatever ran git, which can. The hook calls
a copy of `follow.sh` kept beside the clone, renewed from the branch by each
pass, and always exits 0. `npm run follow -- off` stops a pass that is
running, with the npm and the build it started, and removes all that following
made: the hook, the config, `ready.json`, the clone, the script's copy, its
stamps, the builds, `lanes-follow.log` and `swap.sh`'s `lanes-update.log`.
`npm run follow -- install` puts the ready build in now; with Lanes running it
only asks it to quit, waits for the install Lanes does as it quits and reopens
it, and starts a swap of its own only if Lanes started none.

The app reads `ready.json` (`src/main/update.ts`) at launch, when its window
comes forward, and when the file changes — `watchFile`, every ten seconds —
and offers the build it names, unless that is the commit the app was built
from (`__BUILD__`), in a line at the foot of the rail with the commits it
brings (`src/shared/update.ts` decides which). With no `ready.json`, which
only `follow.sh` writes, nothing is offered. *Restart now* waits for whatever
a restart would cut short — a reply running, a yes on its way to its
continuation, or a Guarded question open, which a relaunch would have no
record of — and the line says which it waits for; *Not now* calls it off.
Then it starts `build/swap.sh`, shipped in the bundle, from a copy in the
temporary folder that is left there, with a `PATH` and a `HOME` and nothing
else of the app's environment, and quits. Quitting starts it too, without the
reopen, but only for an update known to be newer: one whose log has the app's
own commit in it (`since`). One the app cannot place — built from another
branch, from no commit, or more than forty commits back — may be older, so it
goes in only by *Restart now*, and the line says so. A development run swaps
nothing: there the bundle is Electron's, and main writes `swap-plan.json`
into `LANES_FOLLOW_HOME` instead.

`swap.sh` waits for the app to be gone and for nothing to run out of its
bundle's `MacOS` or `Frameworks` — the bundle's path matched as text, and a
process list it cannot read counting as something running. The install runs
holding a lock beside the bundle, `.Lanes-install.lock`, which `refresh.sh`
takes too: the kernel's, through `lockf`, so it is let go however its holder
ends. A swap that finds it held touches nothing; it waits for it to be let go,
and then only reopens, if asked to, what the holder put there. Holding it,
`swap.sh` takes the new bundle only if its `CFBundleIdentifier` and the
`Authority`, `TeamIdentifier` and `Signature` lines `codesign -dvv` reports
match the installed app's — the same certificate names, or both ad hoc,
compared as text rather than as a designated requirement; copies it beside
the old one, into a folder of this install's own (`.Lanes-swap.XXXXXX`), and
checks it there with `codesign --verify --strict --deep`; and puts it in place
with two renames, the old app left where it was if anything fails before the
second. What an install cut off part way left beside the bundle is cleared by
the next, unless there is no app in place, when it may hold the only copy.
With no app at the target, which only `follow.sh install` can ask for, it is a
plain copy.

## Known limits

- **Every list is capped.** The palette shows 40 rows and says `40+` when there
  are more — it is a jump-to, not a result set, and a narrower query is the
  answer; only its thread lists are whole. In the rail, a lane shows as many
  threads as Settings says (8 to start) and a folder 40 notes. Each says so on
  the row that stands in for the rest; nothing is hidden silently.
- **A thread that has not sent yet is in the rail but not in the index.** It
  has no transcript to summarise, so the rail merges it in from its own tabs.
  Close that tab before sending and the thread is gone — there was never
  anything on disk behind it — though its attachment to a note stays in the
  state file until the next launch prunes it.
- **In WRITE, most of a long note is not in the page.** The editor draws only
  the lines near the screen, so anything that reads the DOM rather than asking
  the editor — the browser's own find, a selection made by a script, a driven
  check — sees only the part that is drawn. `⌘F` is not fooled, since in WRITE
  it asks the editor; a check that wants the truth reads the file.
- **The app's ⌘Z and the editor's are two histories.** The editor's covers
  what was typed in it, kept across READ and across tabs; the app's steps a
  note's saved changes from the window, with no field focused. They are told
  apart by focus and never both act on one press, but they are not one record:
  a step taken from the window reaches the editor as a change from outside, and
  an outside change that removes exactly what an editor step typed takes that
  step out of the editor's history. So ⌘Z from the window and then ⌘Z in the
  editor can undo one step further back than you expected. `undo.js` holds
  where each one acts.
- **The measure is long for prose.** The column is 620px of 13.5px type —
  READ's measure, which the editor shares so that ⌘E moves nothing. Long
  passages read better on a shorter line, and Settings' only other choice is
  wider (*Wide measure*, 860px). A narrower one is a single number, `measure`
  in the state file, but it is the whole app's column, threads included, so it
  is a design decision rather than an editor fix.
- **`###` and `####` hashes can touch the outline.** They hang in the left
  margin, and with the outline open in a narrow pane its ticks sit in the same
  26px; three or four hashes can overlap them on the line you are in.
- **WRITE's vertical rhythm is close to READ's, not identical.** Sizes, the
  column and the air around headings match; the space between other blocks does
  not quite. READ spaces blocks by padding inside each one — a list item 25px, a
  task 28px — and the editor draws lines, 26px for an item or a task. Two
  paragraphs a blank line parts are the same on both, a whole line apart, and
  so is that line under a list; it is the items themselves that differ. ⌘E
  keeps the words at the top of the screen where they were, and below them a
  long list can shift by a few pixels; no word moves across.
- **An ordinal is drawn two ways.** WRITE keeps `1.` as typed, since it is the
  only rendering an ordinal has there; READ sets ordered items as `01`, `02`.
- **An input method composing over a selection is left alone.** Deleting or
  typing over a selection keeps the marks of a phrase it only partly covers —
  except while an input method is composing, which the editor leaves entirely to
  the browser: a composition started over a selection that reaches into a bold
  phrase replaces the marks it covers with everything else.
- **No capture from outside the app.** ⌘N is a note in two keystrokes once
  Lanes is in front; there is no global hotkey that opens one from anywhere.
- **The first launch reads every transcript.** Building the cache from cold
  takes a couple of seconds for a couple of hundred transcripts, and the rail
  says *Reading your sessions…* while it does. Every launch after that skips the
  transcripts that have not moved. The cache is disposable: delete
  `lanes-index.json` and the next launch rebuilds it, as a launch on another
  folder does.
- **A Guarded approval is coarser than one call.** Approving a refused shell
  command runs the rest of that turn with `bypassPermissions`; see
  [Safety](safety.md#the-approval).
- **Redaction covers the live turn only.** A thread read back from its
  transcript shows tool rows as the transcript has them; see
  [Safety](safety.md#redaction).
- **Read-only folders bind Lanes, not Claude.** See
  [Settings](settings.md#notes--lanes).
- **Relatedness needs a corpus.** Inverse thread-frequency is meaningless with
  a handful of threads — a path both of two threads touched is, correctly,
  worth nothing. It sharpens as sessions accumulate; at a hundred or so it
  separates real neighbours from shared furniture by two orders of magnitude.
- **Lanes reads the CLI's session files, which are an internal format.** A
  Claude Code update can change them. These docs describe Lanes against Claude
  Code 2.1.285.
- **A change from outside is seen by polling.** An open note is checked every
  four seconds and the vault and the transcripts every thirty, since a synced
  folder delivers no watch events to rely on.
- **One vault at a time, on a Mac.** Switching folders relaunches the app.

What is not built yet, or was deliberately left for later, is in
[known-gaps.md](known-gaps.md).

## Verified behaviour

Claims are checked, not asserted. An interaction claim in these docs is held by
a check that drives the running app through `LANES_CAPTURE_EXEC`, not by eye,
and a claim about a pure module by a node check — and each was seen to fail on
the code before the change it describes. They live in [`checks/`](../checks/)
so they can be re-run rather than believed, and one runner runs them:

```bash
node checks/run.mjs tabs rail      # the named driven checks
node checks/run.mjs --smoke        # the smoke list in checks/manifest.json
node checks/run.mjs --all          # every driven check the manifest runs
node checks/run.mjs --node         # the node checks: pure modules, no app
node checks/run.mjs --dev          # the app on the sample vault, nothing driven — to look
node checks/run.mjs --self-test    # proves the runner's and the app's refusals
```

`npm run checks` is the runner's `--smoke`, and `npm run checks:node` its
`--node`; run bare, the runner prints its usage and runs nothing. Beside
those:

| Flag | Does |
|---|---|
| `--live` | Also runs the checks that spend real turns with the real CLI |
| `--keep` | Keeps each run's vault and state, and prints where they are |
| `--fixture X` | `sample`, `thread` or `empty`, for `--dev` |
| `--seed JSON` | Merged over the check's own state seed, e.g. `'{"theme":"dark"}'` |
| `--shot DIR` | Keeps each check's capture as `DIR/<name>.png` |
| `--vault DIR` | Uses `DIR` as the vault instead of a fixture copy; refused outside `/private/tmp` unless `--real-vault` is given as well |

**A check runs in a world of its own.** Each driven run gets a fresh vault and
state directory under `/private/tmp/lanes-check-*` — a copy of
`fixtures/sample-vault` with eight canned threads, the thread fixture, or an
empty folder, as `checks/manifest.json` says — a state seeded from
`fixtures/state/lanes-state.json`, and a stand-in CLI
(`checks/stand-ins/claude-stub.mjs`) that answers in stream-json and spends
nothing. The world is deleted afterwards unless `--keep`; the app's output is
in `/private/tmp/lanes-check-logs/<name>.log`. A check's verdict is the `pass`
in the JSON it returns. The runner refuses a vault outside `/private/tmp`
unless told `--real-vault`, and the app itself refuses a driven run that was
not given both `LANES_STATE` and `LANES_VAULT`, so no check can reach your
notes or your state. Driven runs take a lock and go one at a time, since each
holds the front window.

CI (`.github/workflows/ci.yml`) runs the typecheck and the node checks on every
push to `main` and every pull request, and the driven smoke list after them —
but a hosted runner promises no GUI session, so a driven failure there is
reported and does not fail the build.

**Some checks spend real turns**, against the real CLI, and run only with
`--live`. `paths-live.js` runs the two roads at once: a turn started on one
path, walked away from mid-answer, seen through to the end from the other path
by the seam's own mark, and walked back to — with the answer present exactly
once, which is the claim that took the design. `branch.js` runs the fork
claims with two codewords a turn apart: no tab is opened, the thread keeps its
name, the page folds back to the cut, the second codeword leaves the page, one
seam names the other path by its opening words, and the model itself confirms
the copy knows the first codeword and not the second. `resend.js` runs the
third verb the same way. With a draft deliberately left in the composer it
clicks `resend` on a question that has already been answered, and asserts what
separates it from the other two: the turn goes **by itself**, with nothing
typed and no Enter pressed; the draft is still sitting in the composer
afterwards, untouched; the question appears **once** and the transcript is the
length it was, which is what makes it a re-ask rather than an append; a seam
records where the first answer went; and the model confirms the path still
knows a codeword set above the cut.

**Some checks want node rather than the app**, because what they check is
pure. `pathways.mjs` proves the arithmetic behind a seam — including the case a
reader cannot verify by eye, that a path which left the root at line 80 must
not be drawn at line 80 of a path that left at 40 — and `transcript.mjs`
round-trips a quoted note, writer against reader, since that format fails
silently. The hardening has its own: `open-outside.mjs`, `how-to-open.mjs`, `open-links.mjs`,
`ipc-paths.mjs`, `safety-default.mjs`, `no-network.mjs` and `dev-gates.mjs`.
So does the setup that is the person's: `vault-chooser.mjs` (the folder asked
for, the sample copied, *Change…*), `lane-detect.mjs` (which lane a path is
in), `read-only-rule.mjs` (a named folder and only that folder) and
`vault-roots.mjs` (shell paths read against the vault's own folders).

**The notes editor has checks of its own.** `live-md.js` drives it the way a
person would, on a note it seeds and finds through ⌘K: the note opens in READ
and ⌘E puts it in one editable field, with no block field and no mirror
anywhere, and its title in the head rather than in the body; with the caret
elsewhere bold is bold, the marks and hashes are hidden, a heading is bigger
than the prose and lists have their bullets and boxes; the caret brings back
that one mark and nothing else around it; the body is READ's size; READ holds
no editor, and a double-click in it lands the caret in that paragraph; a box
ticks the file; ↵ continues a list and an empty item leaves it, a one-item list
included, and an empty quote line leaves the quote for good; ↵ at the start of
an item's words puts an item above; `Home` and `⌘←` land on the words; `[[`
closes itself, opens the note list that esc closes on its own, and `]]` typed
at the end steps over the pair rather than adding one; a click past hidden
marks lands at the end of the line, which it did not when hidden marks were
squeezed to zero size rather than removed from the layout; a title under a
blank line is still hidden and still written by the head; and ⌘Z walks the
whole session back to the note as it was seeded.

`note-sync.js` writes the file from outside while the editor sits idle with its
caret below the change: the words arrive with no banner and the caret on the
same character, a word typed next lands in the file beside what arrived, the
app's own save is not taken for a conflict one poll later, a second outside
version is on screen by the moment the app records its mtime and a word struck
right after that moment lands on top of it — the file ends up with both, and no
banner — a note closed a breath after a word and reopened at once with ⇧⌘T
opens with that word and keeps it under the next one typed, a read asked for
straight after a write reads what that write wrote, and a word typed a breath
before the window closes is in the file. Where both sides did change the note
it asks, refuses a rename until it is answered, and a window closed on it
leaves your words in a copy beside the note.

`jot.js` times ⌘N over a vault it first makes the size of a real one — an
empty vault would pass a build that still threw the index away — and follows
the note through its title: no naming step on any frame, the caret in an empty
field that says Untitled, ↵ down into the body, the file renamed to its title
in the same folder, a second nameless note staying nameless in a file of its
own and called by its first line in its tab, its head and the note list, the
`+` menu's Note doing the same, letters typed in the same breath as ⌘N landing
in the new note's title and body rather than in the note that had the caret,
and a note made and left empty going to the Trash when its tab closes while
one with words in it stays.

`undo.js` holds the two histories apart: the editor's survives a trip through
READ, ⌘Z in the editor never reaches the app's even with nothing left to undo,
and the app's ⌘Z from the window steps over what the editor's undo did.
`note-newtab.js` holds ⌘-click on a link in a note — a tab of its own in WRITE
and in READ, with the note you were in left in the strip. `esc-discard.js`
holds the way out of WRITE: esc with nothing written leaves without a word,
with something written it asks, and esc pressed any number of times — held,
even — only opens and closes the question; Discard takes this stretch's words
and keeps a line Claude wrote meanwhile, ⌘Z in READ brings them back, and a
title thrown away renames nothing.

And four of the node checks are the editor's: `md-live.mjs` is the parity proof
of the grammar the editor draws, over every line of a vault and every run of
lines — fences, tables, folds — kept exact through edits; `line-diff.mjs`
proves the diff that carries the caret through an outside edit — exact over
thousands of random edits, and touching nothing that did not change;
`edit-fuzz.mjs` presses ⌘B, ⌘I, ⇧⌥ and ⌫ over a selection on tens of thousands
of random lines and holds READ to showing exactly the words that should be
left; and `note-moves.mjs` runs main's own write queue through a rename, a
trash and a closing window, each with a save on its way.

## Dev affordances

**Every `LANES_*` switch but one works only in a development run** — `npm run
dev`, `npm start`, or a check run through `checks/run.mjs`, anything on the
stock Electron binary. In the packaged app they are not read at all: main reads
each one through `devEnv` (`src/main/dev.ts`), which answers `undefined` when
the app is packaged, and `checks/dev-gates.mjs` holds the source to that, so no
environment variable can point the packaged app at another folder, run a
script in its page, or load it from another address. The one exception is
`LANES_CLAUDE`, which names the `claude` binary and is a user's need, not a
developer's.

| Switch | Does, in a development run |
|---|---|
| `LANES_VAULT=/path` | Works in that folder instead of the one in the state file, never asking for one; Settings' *Change…* leaves it alone |
| `LANES_STATE=/dir` | Keeps the state file (and the caches) in that directory, so a dev run never shares the installed app's |
| `LANES_CAPTURE=/path/shot.png` | Renders once, writes a PNG and quits |
| `LANES_CAPTURE_DELAY=<ms>` | How long to wait before that, default 3500 |
| `LANES_CAPTURE_EXEC=/path/script.js` | With `LANES_CAPTURE`, runs a script in the page first and prints what it returns — a driven check. Refused without `LANES_STATE` and `LANES_VAULT` |
| `LANES_EXPORT_TO=/dir` | Writes a PDF there without the save panel |
| `LANES_DEBUG_CLI=1` | Prints the resolved `claude` path and the PATH it was found on at startup, then the argv of every spawn |
| `LANES_DEBUG_RENDERER=1` | Pipes the page's console to stdout, the only way to see a mount-time throw from a scripted run |
| `LANES_DEBUG_NOTES=1` `LANES_DEBUG_QUEUE=1` | Log the note sweep and a session's send queue |
| `LANES_FOLLOW_HOME=/dir` | Where to read `ready.json` and write `swap-plan.json`; without it a development run offers no update |
| `ELECTRON_RENDERER_URL` | The dev server's address, set by `electron-vite dev` |
| `LANES_CLAUDE=/full/path` | The `claude` binary to run — **in the packaged app too** |

`LANES_CAPTURE` with `LANES_CAPTURE_EXEC` is how every interaction claim in
these docs is checked: the app comes to the front and is held there for the
run, since a check stands in for a person and a person's app is the front one,
and the page's own focus emulation is turned on, so it counts as focused even
with the screen locked. `LANES_DEBUG_CLI` is the only way to see whether a
setting actually reached the process, and it once found a switch that looked
wired and was not.

`LANES_BUILD_DIR` and `LANES_SIGN_IDENTITY` are not switches of the app but of
its build — see [Building the app](#building-the-app) — and the
`LANES_FOLLOW_*` that `build/follow.sh` reads are its own, for
`checks/follow.mjs`. So are the `LANES_SWAP_LOG`, `LANES_SWAP_OPEN` and
`LANES_SWAP_NOTIFY` that `build/swap.sh` reads, for `checks/swap.mjs`; the
script ships in the app, but the app starts it with a `PATH` and a `HOME` and
nothing else of its environment, so none of them reaches it there, and
`checks/dev-gates.mjs` holds `src/main/update.ts` to that.

A dev app beside the installed one needs a `LANES_STATE` of its own: two
Lanes over one state file are refused, and should be.
