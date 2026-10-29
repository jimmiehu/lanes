# Checks

Scripts for `LANES_CAPTURE_EXEC`. Each one drives the running app and returns a
JSON result, so an interaction claim in the root README can be re-checked rather
than believed.

The app is brought to the FRONT and held there for the length of the run. A
driven check stands in for a person, and a person's app is the front one —
anything the app decides from `document.hasFocus()`, such as whether an answer
counts as seen, is otherwise asked in a state no reader is ever in.

A check is run through `checks/run.mjs`, never by pointing a dev app at a
folder by hand:

```bash
node checks/run.mjs shedding tabs      # the named ones
node checks/run.mjs --smoke            # the ten in manifest.json's "smoke"
node checks/run.mjs --all              # every driven check the manifest runs
node checks/run.mjs --node             # the .mjs ones, below
node checks/run.mjs --dev              # the app on the sample vault, nothing driven — to look
node checks/run.mjs --self-test        # the refusals, proved
```

Each driven run gets a world of its own under `/private/tmp/lanes-check-*`: a
copy of `fixtures/sample-vault` (or the thread fixture, or an empty folder), a
state directory seeded from `fixtures/state/lanes-state.json`, and a stand-in
CLI (`stand-ins/claude-stub.mjs`) — so nothing a check writes lands in anybody's
notes or state, and no check spends a turn unless it is `live` and `--live` is
given. What each check wants is in `manifest.json`; the world is deleted after
the run unless `--keep`, and the app's output is in
`/private/tmp/lanes-check-logs/<name>.log`. A check's verdict is the `pass` in
the JSON it returns. The runner refuses a vault outside `/private/tmp`, and the
app refuses a driven run that was not given both `LANES_STATE` and
`LANES_VAULT` (`src/main/guard.ts`). Driven runs take a lock and go one at a
time, since each holds the front window.

The `.mjs` ones are the exception: they check pure modules, so they want node
rather than a running app. `pathways.mjs` is where the pathway arithmetic is
proved — which whole transcripts make up one visible thread, and the line each
of them parted at. `transcript.mjs` round-trips a note quoted into a chat,
writer against reader, since that format's failure mode is silence.

```bash
node --experimental-strip-types checks/pathways.mjs
node --experimental-strip-types checks/transcript.mjs
node --experimental-strip-types checks/limit.mjs
node --experimental-strip-types checks/session-clock.mjs
node --experimental-strip-types checks/usage.mjs
node --experimental-strip-types checks/schedule.mjs
node --experimental-strip-types checks/details.mjs
node --experimental-strip-types checks/find-rule.mjs
node --experimental-strip-types checks/signin.mjs
node --experimental-strip-types checks/api-error.mjs
node --experimental-strip-types checks/md-live.mjs
node --experimental-strip-types checks/comments.mjs
node --experimental-strip-types checks/update.mjs
node --experimental-strip-types checks/line-diff.mjs
node --experimental-strip-types checks/line-ends.mjs
node --experimental-strip-types checks/written.mjs
node checks/edit-fuzz.mjs
node checks/follow.mjs
node checks/swap.mjs
node checks/note-moves.mjs
node checks/command-turn.mjs
node checks/context-window.mjs
```

`pdf-file.mjs` and `comments-pdf.mjs` read a PDF a driven check saved, so they
are not in that list: the runner runs each once `pdf.js` or `comments-read.js`
has passed, over the PDF that run exported (its `after` in `manifest.json`).

`follow.mjs` runs `build/follow.sh` for real against a throwaway repository —
its branch checked out in a second worktree, HOME a folder of its own, and
pack.sh, swap.sh, npm, osascript and the notification stand-ins, so nothing is
built, quit or installed. It holds what `on` follows and from where, which ways
of moving the branch build it and which build nothing, what ready.json says,
that no pass installs anything, the build that failed, the two builds kept,
the GIT_DIR a hook is handed kept out of the pass, the hook that never fails a
ref update, the pass that outlives the commit's whole process group, and
`install` quitting Lanes only when it runs. `swap.mjs` runs `build/swap.sh` on
small app bundles of its own, signed ad hoc: the new one in the old one's
place and nothing beside it, the wait and the reopen, and a different,
unsigned or tampered app, or one still running, refused with the installed app
left as it was. `update.mjs` holds `readyUpdate`, which decides whether what is
ready is an update for this app and which commits it brings.

`comments.mjs` holds a comment's grammar to itself — and, since a highlight
can hold an anchor and an anchor a highlight, which characters each surface
lights. A comment is CriticMarkup in
the note — `{==the words==}{>>what about them<<}` — and READ, the editor and
every count read it by one grammar said twice, which no vault's notes can check:
the sample's handful of comments is not every shape one can take. So the two
halves are compared over thirty thousand generated lines that mix anchors and
comments with every other token,
nested both ways and with stray marks among them — the same text shown, the
same characters anchored, the same comments in the same order — and
`findComments` over three thousand generated notes, with items, tasks,
headings, quotes, tables, fences and folds, lists exactly the comments READ
draws, each one's offsets slicing back to its marks. It also holds the word
count, which leaves a comment's words out, and a click in READ, which maps back
past a comment rather than into one. Red at the commit before: READ showed the
braces. And it holds the pure half of writing one — where an anchor can go for a
selection, written over six thousand generated lines without changing a word READ
shows and resolved back to the line exactly, and over four thousand generated
notes from wherever a selection starts — a bullet, a blank, a fence, a table's
rule, across cells and blocks — without changing a block READ draws, a pipe in
a cell's comment escaped so the table keeps its cells — and `reviewPrompt`, the pass's
prompt: every comment, numbered, in order, with what it is about and its line as
written, none from a fence, and what to do with each.

`written.mjs` holds the rules a right-click on a path in backticks is read by
(`shared/written.ts`): which code is a path — `sow_check.py`, `inbox/`,
`…/Allotment/Scripts/rotation/next_year`, and not `beanpole`, `TZ=Europe/Vienna`
or `3.5` — how one is read, that `harvest/2026-Q3/Oslo/` means Q3's Oslo and
not Q2's, that the vault's own copy is listed first, how a place is named in
the menu, and that Open never runs anything: a script opens as text, an app or
an installer is only shown.

`how-to-open.mjs` (`node --experimental-strip-types checks/how-to-open.mjs`)
holds Open to documents. What Open may hand to its own app is a list of
documents and media (`howToOpen`, `shared/written.ts`), not a list of what it
may not: a `.webloc`, `.inetloc`, `.html`, `.mobileconfig`, `.shortcut`, a
`.zip` or a kind nobody thought of is only shown in its folder; a `.command`
opens as text even with its exec bit on; an app is shown; a program with no
extension is not run, and a plain file with none, like `/etc/hosts`, is only
shown. A PDF, a note, a picture, a folder and a document kept as a package
still open. Red when the rule was a deny-list: every one of the first group
opened. `file-menu.js` asks the same of main, for `/etc/hosts` found and handed
out.

`open-links.mjs` (`node checks/open-links.mjs`) holds Open to what a path
really is. It bundles main's own `locate.ts` with stand-ins for electron's
`shell` and `child_process` that write down what they are asked and do none
of it, and makes real links in a temporary directory: a `spec.pdf` linking to
a `.command`, a `docs` and a `plan.pdf` linking to an app, a `latest.pdf`
linking to a real PDF, and a folder linking to a folder. None of the first
three reaches `shell.openPath`: the `.command` opens as text, the apps not at
all. The PDF and the folder open, the real ones and not the links, and Show in
Finder still shows the link. Red before: each was classed by its name after
`stat` had followed the link, and the link was handed to the Mac, which
followed it again.

`ipc-paths.mjs` (`node checks/ipc-paths.mjs`) holds every handler that takes a
note's path from the renderer to the vault. It bundles main's own `notes.ts`,
`skills.ts` and `ipcGuard.ts` for node, with a stand-in for electron's `shell`
that only writes down what it is asked and a recorder over `fs`, against a
vault it makes in a temporary directory beside a sibling folder whose name
begins with the vault's. Read, write, the window's last write, trash, show,
mtime, own-change, rename and move are each fed `''`, `.`, `/`, `../x`,
`/etc/hosts`, `~/x`, the sibling's note both ways and a NUL, and must refuse
every one with the shell never asked and no file outside the vault — nor the
vault itself — so much as stat'ed; making a note may not leave the vault
either. A folder is not trashed as a note, the inbox is read only however its
path is spelled, `deleteSkill('..')` and `('.')` are refused with `.claude`
still there, the sibling's note is there and unread, and the same handlers
still take a real note. And at the door: a session id is a UUID (`../x` is
not), and a state patch loses a `safety`, a prompt's `safety`, `lanes`,
`readOnlyFolders` or `newNoteFolder` of the wrong type, and any `vault` at all, while the rest
of it stands. Red before `vaultPath`: `noteTrash('')` asked the shell to trash
the vault, `../Vault-old/x.md` was read and written over, and
`deleteSkill('..')` moved `.claude` into the trash.

`safety-default.mjs` (`node checks/safety-default.mjs`) holds what Lanes
does before anyone has said otherwise. It bundles main's own `state.ts` and
`scheduler.ts` for node, with a stand-in for electron whose userData is a
temporary directory, and `runOf` from `shared/prompts.ts`. A state file that
is not there starts Guarded, and so does a chat started before the state has
arrived; one that says Standard, or Autonomous, is read as it says.
`flags.schedules` left out reads as on only when a saved prompt already runs
by itself, and said off or on it stays what it says; that reading is not
written back — except that a new install scheduling a prompt with the switch
still off has `false` written, so the next launch does not read it as on.
With the switch off a due prompt starts no session and records no run; with
it on, a scheduled run is Autonomous only where that prompt carries
`autonomousConfirmed` — an unconfirmed Autonomous prompt, and one inheriting
the app-wide Autonomous, run Standard — while a run by hand is not clamped.
Red before: a new file was Standard, there was no switch, a due prompt ran,
and every scheduled Autonomous ran Autonomous.

`md-live.mjs` holds the note editor to READ's grammar. The editor draws
markdown live, and it only tells the truth if what it draws is what READ
draws — so it does not speak CommonMark but READ's own rules, restated with
positions, and restating a grammar is a way to fork it. This compares the two
on real text rather than on examples chosen to pass: every line of every note
in `$LANES_VAULT` (the sample vault if that is unset; it only reads) — its
inline runs, its line kinds, and whether it sits in a fence, a table or a fold's
tags, which the editor once took from CommonMark and CommonMark ends elsewhere.
The editor keeps those runs through an edit rather than finding them again, so
four edits are made to every note and the runs kept through them must be the
runs read from scratch, with a keystroke in prose reading only a handful of
lines. On the sample it agrees on 1,146 lines, 431 single-line blocks and 98
lines in a fence, a table or a fold's tags across 27 notes, through 108 edits;
pointed at a large vault in daily use, it agreed on every line.

`schedule.mjs` is when a scheduled prompt runs: a typed time read or refused
(`6`, `6pm`, `06:00` — and `24:00`, `7:60`, `soon` refused rather than guessed),
the last slot and the next, a slot run at most once and only on its own date
(asleep at 6:00 and awake at 7:31 runs today's; Wednesday's missed slot is not
run on Thursday; a week away is one slot, not seven), nothing from before the
schedule was set, paused and dayless never due — pinned to Europe/London through
its clock change on 25 October 2026, where 06:00 stays 06:00 and the hour that
happens twice runs once. And how a schedule reads in a row: `WEEKDAYS 06:00`.

`command-turn.mjs` runs main's own transcript reader, bundled for node, over a
transcript shaped like the one the CLI wrote for a real `/echo-word` on 7
October: the tagged command line, the skill's body as an `isMeta` line, the
answer. Read back, the command is the opening turn, what ⌘K searches has it, and
a thread with no name of its own is called by it — red before, where the turn
vanished on re-reading and the thread took its title from the second message.
And the commands that are not turns stay out: `/model`, answered by the CLI's
`<local-command-stdout>` (the shape the CLI writes for one), and a command
somebody spoke past unanswered; one still in flight, with nothing back for it
yet, is the turn it will be.

`line-diff.mjs` proves the diff a note edited from outside is applied through.
The caret is carried through the changes, so the changes have to be the ones
that were made: one hunk from the first difference to the last would throw a
caret sitting between two edits out of its sentence.

`line-ends.mjs` proves a note saved on Windows comes back as it went. The
editor holds every line break as `\n` — CodeMirror keeps no `\r` — while the
file, and the body the pane holds, still say `\r\n`. Coming in, the same body
applied again (a remount, ⌘E twice) is no change, where it used to arrive with a
blank line and the caret thrown to the top; this runs on CodeMirror's own
document, because the bug was CodeMirror re-reading a `\r` the diff had cut off
its `\n`. Going out, what the editor hands back is written in the file's breaks:
every break the edit did not touch byte for byte, a typed one the note's usual
way — held to exactly that over 20,000 single edits of notes with every kind of
break. By characters, not lines: matched a line at a time, ⌫ joining a line a
stray `\r` had cut wrote the `\r` at the end of the joined line, and READ, for
which a lone `\r` is no break, read the heading under it as more of that line.
Then every note in `$LANES_VAULT` with a `\r` in it is reopened, typed into,
joined and split, and written back. The sample, read when that is unset, has
none; a vault in daily use is where they turn up — `\r\n` lines mixed with `\n`
ones in one note, and stray `\r`s a converted PDF left in the middle of table
rows.

`edit-fuzz.mjs` presses the keys that change marks on lines nobody chose to
pass: tens of thousands of random lines made of READ's own tokens — bold and
italic phrases, code, links, wikilinks with and without a title — seeded, so a
failure repeats. ⌘B and ⌘I must leave READ showing the same words, over one
line or several; a selection deleted or typed over must leave it showing
exactly the words that were not selected, and what was typed where the
selection's first seen letter was; ↵ anywhere must leave the two lines showing
the words the one did; a paste of line breaks or marks, at a caret or over a
selection, must show the words left and the pasted text's own where it went;
⌘X and ⌘V straight back must give back what READ showed; a drag must show the
same letters, none lost or added; and ⇧⌥ run into a token from outside it and
then deleted or typed over must leave no stray mark. It runs the editor's own
`lib/editorLive.ts` — its keymap, its filters, its clipboard filter — bundled for
node with esbuild, over a stand-in view that supplies what layout would, and
asks READ's own `shownText` what the page says. Red on the editor before the
last two reviews: 8,055 of the ⌘B/⌘I presses with the old wrap, 12,825 cases
without the filter that keeps a partly covered phrase's marks, and — on the one
between — 2,772 ⌘B/⌘I presses across lines, 5,438 ↵, 4,289 pastes, 4,477
cuts pasted back and 2,482 drags.

`note-moves.mjs` runs main's own `src/main/notes.ts`, bundled for node with a
stand-in for electron's `shell`, against a vault it makes in a temporary
directory, and puts a save on its way through the three things that can happen
to a note meanwhile. Renamed: the save of the first words under a new title,
queued behind the rename, lands in the renamed file and no `untitled.md` comes
back (red: the stray file held the words and the named note did not). Trashed:
a save queued behind the trash does not make the note again. The window
closing: the synchronous last write goes into a note nothing touched, to a
`(conflicted copy)` beside one written to since the app read it — a second copy
a second file — and into the note, not a copy, when the only change since was
the app's own save whose reply had not come back; a save main had already
started, still reading the file or still writing it (`writeFile` held back on
purpose), does not land its older words over it; and a note renamed with its
reply still on the way takes its last words where it went. And a rename's own
rewrites — the links in a note that points at the renamed one, the renamed
note's heading — are made again in a save sent from before them, which is not
refused as a conflict, and whose reply says what was written; the rename says
which notes it rewrote and the mtime it left. The app's side
of the same — holding saves while a rename is on its way, dropping what a
trashed note is owed, passing the close-time write its mtime — is driven in
`jot.js`, `note-ops.js` and `note-sync.js`; the hold during a rename is the one
piece no driven check can force, since it wants the rename slower than the save,
so it rests on main's side here and on reading the code.

`find-rule.mjs` proves what counts as a match — the phrase rung, the words rung,
the fold, where a snippet points, and that there is deliberately no fuzzy third
rung. Its driven half is `find-words.js`, which proves the rule actually reaches
the palette, the note bodies and the transcripts.

`details.mjs` proves the collapsible-section parse, and above all its SPANS: a
folded body is parsed by a second call to `parseNote`, whose line numbers start
again at zero, and they have to be shifted back into the note's own numbering
recursively or a double-click inside a nested fold puts the caret on the wrong
line. It also proves the shape that was missing — `<details><summary>…</summary>`
on ONE line, which is how everybody writes it — lands with every inner span
still claiming the line it actually came from, and that a tag mid-sentence or in
backticks is still prose.

`session-clock.mjs` holds what the session clock's field reads — time left
(`3:20`, `90m`, `2h30`, a bare `3` as hours and `45` as minutes), a reset time
(`at 17:40`, tomorrow once it has gone), the ways of clearing it — and that
anything else comes back unread rather than guessed.

`limit.mjs` reads a usage limit out of everything the CLI is
known to say, and — the half that matters — refuses to read one out of the
errors that merely mention a limit. A real fault shown as a countdown is a lie
about why your message did not send.

`usage.mjs` reads the usage windows out of the `rate_limit_event` every turn
ends with, starting from one shaped like the CLI's (2.1.285), its figures made
up — and its neighbours: the same without the `@internal` per-window figures
(the clock still set, no percentage made up), a week-limited event whose
top-level reset must never be taken for the session's, a per-model week,
seconds against milliseconds, and garbage, which comes back null rather than
`0%`. If a CLI update moves the shape, this is where it shows. Red at the commit
before: there was no reader at all.

It also holds `tone`, the one place the ring's colours are decided, at its
edges: 69% plain, 70% orange, 89% orange, 90% red, a share past 100%, no share
at all, the CLI's own warning below 70% and past 90%, a refusal, and which
window the CLI's word is about — a week it warns about leaves the session's
ring plain. The thresholds go by the figure as SHOWN, so 69.9%, which reads
`70%`, is orange; a sweep across 0–120% in hundredths of a percent proves no
figure is ever drawn in a colour its own number does not call for. Red at the
commit before: there was no `tone`.

`open-outside.mjs` (`node checks/open-outside.mjs`) holds the one door out of
the app. It bundles main's own `open.ts` for node, with a stand-in for
electron's `shell` that writes down what it is asked, against a vault it makes
in a temporary directory. `https:`, `http:` and `mailto:` go to the system;
`javascript:`, `data:`, `x-apple-…:`, `vbscript:`, `chrome:`, `smb:`, `ftp:`,
`tel:`, an app's own scheme, `file://` with no path, a NUL and anything that
is not an address are refused, with a reason, and the shell never asked. A
`file:` link with three slashes, one or none is a place: a note in the vault
goes back to the window that asked, as a note to open; a script in the vault,
an application, `/etc/hosts`, a sibling folder whose name begins with the
vault's and `../` out of it are shown in the Finder if they are there and
nothing if not — never opened, never run. The window may only go back to its
own page: the dev server's origin, or the built `index.html` with any query.
And the renderer's own rule agrees: `fileAddress` reads `file:/x` and `file:x`
as paths. Red before: there was no decision (every link went to
`shell.openExternal` as it was), and `file:/x` and `file:x` read as schemes of
their own.

`no-network.mjs` (`node checks/no-network.mjs`) holds "Lanes makes no network
calls" to the source. Every file in `src/` is parsed with TypeScript's own
parser, so a URL in a comment or in a link's text is not a call, and none may
import `http`, `https`, `http2`, `net`, `tls`, `dgram`, `dns`, `undici`, `ws`,
`axios` or `node-fetch`, take electron's `net`, `autoUpdater` or
`crashReporter`, or name `fetch`, `XMLHttpRequest`, `WebSocket`,
`EventSource`, `sendBeacon`, `RTCPeerConnection`, `WebTransport` or
`downloadURL`. And the page's Content-Security-Policy: `default-src` and
`script-src` are `'self'`, `object-src`, `frame-src`, `base-uri` and
`form-action` are `'none'`, `connect-src` is left to `default-src`, and no
source anywhere in it names a host, a wildcard or a network scheme. Red before:
the four `'none'`s were not there.

`dev-gates.mjs` (`node --experimental-strip-types checks/dev-gates.mjs`) holds
the dev doors shut in the packaged app. Every `LANES_*` and
`ELECTRON_RENDERER_URL` read in `src/` — by property, by `['…']` or by
destructuring — must go through `devEnv` (`src/main/dev.ts`), which answers
`undefined` in the packaged app; `LANES_CLAUDE` is the one exception, read in
`which.ts` and nowhere else. And `dev.ts`'s own question, whether this is the
packaged app, is asked of executables it will meet: `Lanes.app` is packaged,
the stock `Electron` binary and plain node are not — and `dev.ts` imports no
electron, since `notes.ts` and `vaultChooser.ts` read their switches through it
and the node checks bundle both without one. Main refuses to start if that
answer and electron's `app.isPackaged` ever disagree. Red before: nineteen raw
reads in five files, and no helper.

`lane-detect.mjs` (`node --experimental-strip-types checks/lane-detect.mjs`)
holds the one rule for which lane a path is in (`src/shared/lanes.ts`), now
that lanes are folders somebody named: any folder, case aside, at a folder
boundary (`essays-old/x` is not in `essays`), nested lanes with the deepest
winning in either order, absolute paths only inside the vault, a lane with no
folder holding nothing, and no lanes a valid answer; a skill's lane from its
name; and main's weighed vote over a thread's files (`laneFromPaths(paths,
lanes, vault)`) on the same rule. Red before: main's vote read only one
vault's project folder, against five lanes written into the source.

`read-only-rule.mjs` (`node checks/read-only-rule.mjs`) holds the read-only
folders as a setting. It bundles main's `notes.ts` for node against a vault in
a temporary directory, with a stand-in `shell` that only writes down what it
is asked. With `inbox` named, a note in it — or deeper in it — reads as read
only and is not written, written on close, renamed, moved out or trashed,
however its path is spelled (`./inbox/x.md`, `inbox//x.md`,
`notes/../inbox/x.md`), the shell never asked; nothing is moved in or made
there; a rename elsewhere relinks the ordinary notes and leaves the links in
the inbox as they were. `inbox-old` beside it is an ordinary folder, `inbox/`
names the same folder, a nested folder can be named, and with nothing named
nothing is read only. Red before: 34 of 59 failed — the only read-only folder
was one vault's inbox, by name.

`vault-roots.mjs` (`node checks/vault-roots.mjs`) holds which paths in a shell
command are the vault's. It bundles main's `sessions.ts` and `threadIndex.ts`
for node, with a stand-in electron whose userData — and a HOME whose
`.claude/projects` — are in a temporary directory. A vault with folders `a`,
`b c` and `c++` sees `cat 'b c/x.md'`, `ls a/`, `cat c++/x.md`, an escaped
space and an absolute path inside it, and not a hidden folder or one that is
not there; an empty vault sees nothing and its pattern matches nothing. And
the index, run twice over one unchanged transcript, files the thread under a
lane whose folder was made in between. Red before: 7 of 12 failed — commands
were read against one vault's list of folders.

`vault-chooser.mjs` (`node checks/vault-chooser.mjs`) holds the folder being
asked for. It bundles main's `vaultChooser.ts` for node with a stand-in
electron whose dialogs answer from a script and whose userData is a temporary
directory. No `vault` in state and no LANES_VAULT reaches the question; a
folder that is gone is named (`Your folder … isn’t there.`); the question says
no account, no cloud, no tracking, and offers a folder, the sample or Quit.
Quit quits and writes nothing, not even a state file; a cancelled picker asks
again; a folder chosen is written to `state.vault` at once with the rest of the
file kept; the sample is copied to `<picked>/Lanes Sample` — a second time to
`Lanes Sample 2`, the first untouched — with its two lanes and read-only inbox
given only to a state file with none of its own; LANES_VAULT is never asked
about. Settings' *Change…*, cancelled, changes nothing; picked, it stops what is
running, writes the folder and relaunches. Red before: there was no chooser to
bundle.

`install-app.mjs` (`node checks/install-app.mjs`) holds what a newcomer's
first commands say against what they do. electron-builder.yml's
`LSMinimumSystemVersion` is not below the one in Electron's own Info.plist,
and the README's requirements name that macOS; every npm script that runs
`checks/run.mjs` gives it a mode or a check; and `build/refresh.sh`, behind
`npm run install-app`, says things in plain words by hand and fails with exit
1 and the reason on stderr, and under `LANES_HOOK=1` speaks a hook's
`systemMessage` and exits 0. It is tried on its `say` and `fail` lifted out,
never by running the script, which builds and replaces
`/Applications/Lanes.app`; and no failure in it is reported with `say`. Red
before: 11 of 19 failed — the app claimed macOS 11, `npm run checks` ran the
runner bare, and every failed install exited 0 in a hook's JSON.

| Script | What it asserts |
|---|---|
| `make-from-palette.js` | ⌘K makes things as well as finding them — a new thread with the words already in the composer and unsent, a new note by that name opened in WRITE, each badged with its own kind and each kept to its own filter. And both offers are there with NOTHING typed, standing above the list with the selection resting below them, where nameless they mean what the shortcuts mean: an empty thread, and an untitled note with the caret in its title. Plus ⌥2 toggling the second pane on the PHYSICAL key, since Option rewrites the character |
| `palette.js` | The palette indexes tasks: an open `- [ ]` line is findable by its own words, and the five filters are there. Wants a vault holding a note with `- [ ] an unchecked task` |
| `palette-comments.js` | Every open comment, from ⌘K: a COMMENTS filter beside TASKS; with nothing typed it lists all three seeded comments, each row saying what it says, its note, and `on “…”` or `at a point`, badged COMMENT; typed, it narrows to the one that matches, the footer offering `↵ open it there · ⇧↵ go through its note`; ↵ opens the note at the comment, scrolled to it a long way down and its anchor lit, the light fading; in ALL a comment row appears once something is typed, and none with nothing typed; ⇧↵ on a row starts a pass, `Comments · <that note> · <day>` (red at the commit before: no COMMENTS filter). Seeds its own notes; wants the `slow` stand-in CLI, a throwaway vault and a fresh state directory |
| `palette-marks.js` | ⌘K says what is open and when each thing last changed: exactly the rows a tab holds are marked — the thread's dot and the note's page in ink, the rest muted — and a path of a thread open in a tab (forked here, no turn spent) marks its family's row, the path not listed apart; a note's age is its mtime and a thread's its last activity, the moment itself on hover; a task and a note newer than the list print no age; the footer says `↵ go to its tab` on an open row and `↵ open` on a closed one, and ↵ on the open one makes no second tab. Red before: no marks, no ages. Wants the thread fixture, laid down fresh, and a fresh state directory |
| `prompts-settings.js` | Settings → Prompts: a prompt kept with its effort and lane and DEFAULT left out of the record; saving refused in words for a name already kept (case aside), a name starting with `/`, no words, no name — and nothing kept; edited in place under the same id; esc in a field leaves Settings open and the words in it; Delete asks, Delete pressed again closes the question, Keep keeps, and a delete answered can be undone to the place it stood — every change reaching main's state. Two segments chosen in one breath both land (red on the first build: the second click wrote over the first). Red before: no Prompts section. Wants a fresh state directory; spends no turns |
| `prompts-palette.js` | ⌘K runs a kept prompt: in ALL a prompt whose name was typed sits at the very foot, after the offers, and ↵ — resting on the note that shares its name — opens the note and runs nothing; after `/` the list is prompts alone with PROMPTS lit and the footer saying ↵ runs and ⇧↵ opens unsent; ↵ opens `Standup · <day>` in the thread pane with the words sent, its effort and lane written for that thread; ⇧↵ leaves them in a new composer unsent; `/` alone lists them and a name nobody kept says so. Red before: no Prompts section to keep one in. Wants the `slow` stand-in CLI, a throwaway vault and a fresh state directory |
| `palette-skills.js` | The vault's skills are ⌘K rows with no setup: after `/`, every skill that is on, `/echo-word` badged SKILL with its description under it, and not the one switched off; in ALL an offer at the foot, never where ↵ rests; ↵ opens `/echo-word · <day>` with `/echo-word` sent as the opening turn; a skill named for a lane (`garden-check`) files its thread in Garden; ⇧↵ leaves `/echo-word ` in the composer unsent; the switched-off one is not there to ask for. Red before: `/` lists no skills. Wants the `slow` stand-in CLI, a throwaway vault holding three one-line skills (`echo-word`, `garden-check`, `quiet-one` — the sample's) and a fresh state directory whose `lanes-state.json` is seeded `{"skillsOff":["quiet-one"]}` before launch |
| `schedule-live.js` | A prompt that keeps time: "Run it by itself" starts from the work days and Standard, with Guarded and DEFAULT not offered while it is on; a schedule saved for the next minute is run by main's scheduler when the minute comes — once, as `Tick · <day>`, in a tab put behind the one in front, which takes the unseen mark when the answer lands; the run is recorded with its slot, `done`, and its tab made; the card says `last today HH:MM, done in Ns · open`; saving again, unchanged, asks the scheduler at once and the slot does not run twice. Red before: no schedule to set. Wants the `usage` stand-in CLI, a throwaway vault and a fresh state directory, and about two minutes — it waits for a real minute and for the scheduler's own look. A relaunch not running a slot again and a Mac waking into one rest on `schedule.mjs`, since a check can neither quit the app nor put the Mac to sleep; the window-closed path rests on reading the code, since the capture needs its window |
| `autonomous-ask.js` | Autonomous asks before it is chosen, app-wide and for one prompt: Settings → Safety's Autonomous opens a band saying "Claude runs any command and edits any file in this folder without asking", the state still Standard and the focus on Keep; Autonomous pressed again closes it, esc closes it and not Settings (three times over), Keep keeps, and only a click on Allow Autonomous chooses it; Standard chosen back asks nothing. Settings → Prompts carries the switch that lets prompts run by themselves, off on a fresh state and saying "Runs happen while Lanes is open, even with its window closed; quitting stops them.", and turning it reaches main's state; a prompt's own Autonomous asks the same, a yes is kept on the prompt as `autonomousConfirmed`, and setting it back to Standard drops it (red before: Autonomous chosen on the click, no switch). Writes state, so a fresh state directory; spends no turns |
| `outline.js` | The note outline against its original design, in WRITE and in READ alike: rows from the note's own `##`/`###` (no h1, nothing from inside a fence), a jump landing 22px under the top — in WRITE the heading's WORDS landing where READ's do, so ⌘E after a jump moves nothing (red while WRITE landed its line box, whose air is padding inside it), the mark following the reading, ticks that clear the text — in WRITE with the positions asked of the editor, drawn or not. And ONE open shape, always in a margin: where the pane has one the document does not move, where it has none the pane makes one and the column shifts right — so it opens to the LEFT of the words rather than over them. It stays through every click, and goes on escape or the chevron; nothing is pinned any more. Per-tab collapse, and no outline in a thread |
| `note-copy.js` | A copy hands over what was selected, whichever mode you copied in. In WRITE the editor copies its own source — inside a line the `**` and all, and across blocks byte for byte what READ's copy of the same stretch gives — and ⌘A then ⌘C takes the body you can see and not the title line. In READ a phrase inside a block is left to the browser, and a stretch across blocks is the markdown between the two points, cut at both ends |
| `undo.js` | One undo, the whole way down: in the editor ⌘Z and ⇧⌘Z walk the whole note's history — typing, ticks and cleared words alike, newest first — rather than one line's, and never past the note as it was opened. Words cleared out of an item come back as the FILE had them, a wikilink's hidden brackets included; one ⌫ too many on an emptied item takes only its marker, and ⌘Z puts that back; a paragraph that arrived from outside is not yours to undo, so ⌘Z takes your word and leaves theirs. A trip through READ keeps the editor's history, so ⌘Z after ⌘E ⌘E still takes back the last words typed; with that history spent, ⌘Z in the editor still never reaches the app's; and the app's own history of a note's saved changes, walked from the window with no field focused, steps back over what the editor's undo did, the editor following |
| `title-once.js` | A note's title is said once, by the head — and esc with nothing written leaves WRITE without asking: in WRITE as an editable field, with the `# ` line and the blank under it hidden from the editor, and in READ with the first h1 not drawn — while an h1 further down stays, and a note without one loses nothing. Under a title with no blank line after it, the line ↵ opens at the top of the words is on screen — still, once the note has been written from outside at its end — and ⌫ takes it back (red while the hidden zone took the new line in, and ⌫ went up into the title, and while any body from disk decided the hidden lines afresh); and a note that is only its `# ` line opens with the title said once and the caret under it, writes nothing for being opened, and puts the first word typed on a line of its own (red while it drew the title in the body and typed in front of its `#`) |
| `note-writing.js` | The editor's writing keys: ↵ continues a list, a task or a quote and renumbers an ordinal, ↵ at the start of an ordinal's words puts an item above with its number and counts the rest of that list on, `1)` kept, a nested bullet passed over and a line of prose straight under an item counted through, as ↵ at an item's end counts through it (red while it wrote the same number twice, and while that line of prose stopped the count), ↵ on an empty item leaves the list — a list of one included — with one blank line under it, so what is typed next is prose rather than the item's continuation, ⌫ at the start of an item takes its marker away, ⇥ and ⇧⇥ indent and outdent an item without ⇥ leaving the editor, ↵ mid-line cuts the line at the caret, and a click in the room under the last line writes at the end — and what is typed reaches the file as it was typed. What is a list, a quote or prose is READ's grammar: ↵ at the end of a line of prose straight under a quote is a plain new line and ↵ in its middle leaves the rest outside the quote (red: CommonMark read the line as more of the quote and put `> ` in front), and ↵ after a `3.` straight under a sentence is `4. ` (red: a bare line — CommonMark lets only a `1.` start a list there); and ⌦ and ⌥⌦ at the end of a line bring the next line's words up without its `- ` or `- [ ] ` (red: the marker came up as text); and ↵ inside a bold phrase in an item makes `- keep **bold**` and `- **words** now` (red: `**bold` and `words**`, stars on both) |
| `new-note-folder.js` | A new note, nameless or named, lands in the vault root by default, wherever Settings says after that, and a name typed as `folder/name` still overrides both |
| `editor.js` | READ is for reading, and a double-click is the way into writing: nothing in READ's document opens a field, a single click leaves the mode alone and a box still ticks from READ, and a double-click switches to WRITE with the caret on the source line and column that was under the pointer — or at the end, from the room under the last block. A note opens in READ. A double-click at the start of a task's words lands in the words, never in the `- [ ] ` drawn as a box, and esc with a word written asks, and esc again keeps it, on screen and on disk, still in WRITE |
| `editortraps.js` | The traps a live editor can fall into: on a task whose words begin `[x]`, the box stays drawn open and the lookalike stays text, typing in the line leaves the box alone on disk, ⌘↵ ticks and unticks the REAL box and ↵ continues with an open one; and a heading is a line you type in, its hashes hidden with the caret away and back in the margin with it there, the words not moving either way; and in a fenced block a `- ` and a `# ` are the characters they are — a click at the start of a `- ` line puts the caret before the dash, ⌫ before an indented dash's words takes one space, ← there goes one character left, ↵ after a comment's `# ` splits the line, ↵ at the end of a lone `>` keeps it and starts the line under it, ⇥ at the end of a `- ` line types two spaces and ⌘↵ leaves a line of code alone, and `[[` typed in code stays two brackets — no pair closing itself, no list of notes offered (each red while the rules read a line's text without asking whether it was code); while HTML, which READ reads as text, is not code here either — a click at the start of a `- ` line under a `<div>` lands on its words, as on any item. And a caret the app puts down is held to the same rule: a note that opens on `- [ ] milk`, read and come back to with ⌘E, takes what is typed at the words (red: `eggs - [ ] milk`), ↓ out of the title of a note that opens on `## Section` lands past the hashes (red: `Intro ## Section`), and ⌘Z after the disk made a line an item puts the caret past the new marker (red: `y- bread`, the caret restored inside it with every filter off) |
| `roundtrip.js` | Typing in one paragraph of a frontmattered note changes exactly that line on disk and leaves every other byte alone — the hidden title, the furniture and the hidden marks, the tab characters, trailing spaces and table an editor is tempted to tidy, and the frontmatter, which never reaches the body and is still in the file. A box ticked from its widget changes that one character, and a trip to READ and back writes nothing |
| `panechrome.js` | The compact bar does not cover the tab strip, and the composer's model/effort chips are clickable |
| `head.js` | The pane head: the meta line discloses the details panel, and the compact bar takes over once the head scrolls away |
| `note-file.js` | A note's details name its file: **File** right after **Folder**, the filename and not the title, in mono, selectable, and one line of it the same 24px as the row above; a filename too long for the panel wraps, whole, with nothing cut to an ellipsis; and ⌘N's `untitled.md` reads as the new name in the same row once a title is committed, the panel still open. Red before: no File row. Seeds its own notes and makes one, so it wants a throwaway vault and a fresh state directory |
| `sticky-mode.js` | The WRITE \| READ pair stays in reach however far down a note you are: once the head has scrolled away the compact bar carries it where its `NOTE` label was, at the left edge the pair has at rest — asked of `elementFromPoint`, since the writing bar's pair is still in the DOM under that bar — and back at the top there is one pair again. And a switch keeps the place, by the pair and by ⌘E, both ways: the words at the top of the screen before it are within 12px of it after, found as text in either surface rather than as either surface's idea of a line — a table row included, kept by its row (red: nothing in reach once scrolled, and the words 345px away after a switch at 40% of the note, 648px at 70%; and 16px out on a table row while a table was kept as a fraction of its block) |
| `sticky-bar.js` | Scrolled past a note's head, the compact bar carries what the head is reached for: the way back — which goes back, to the note a link was followed from — and the head's own meta line, `edited … ago · N words`, after the title, with the WRITE \| READ pair still there; and it is frosted paper, not a slab of white — a blur behind it, see-through, and not the sheet's colour (red: no way back, no meta line, the sheet's opaque colour and no blur) |
| `read-default.js` | A note opens in READ: found and opened it is the document with the pair on READ and no editor; ⌘E is WRITE, and the mode is the note's — a second note opened beside it opens in READ and the first is still in WRITE when you go back; a note made a moment ago opens in WRITE with the caret in its title, and naming it there keeps it in WRITE, since the mode is held by the note's identity and naming an untitled note renames its file (red: every note opened in WRITE) |
| `note-scroll.js` | A note is where you left it: a note opened for the first time opens at its top whatever the note before it was scrolled to, and back on a tab the words that were at the top of the screen are there again within a few pixels — each of two notes its own, over two switches, in READ and in WRITE (red: B opened at A's offset, and A came back 233px and then 992px from its words) |
| `esc-discard.js` | Esc is the way out of WRITE and asks before it throws anything away: with nothing written it leaves without asking; with a word written a dialog asks, the caret on Keep writing; esc in it is no — esc pressed six times opens and closes it three times, a held esc is one press, and the word is still on disk; Discard (a click, or ⌘⌫) puts the note back as it was when it went into WRITE and goes to READ, keeping a line written from outside meanwhile; ⌘Z in READ brings the words back; and esc in the head's title asks the same, where a title thrown away names nothing (red at HEAD: esc only blurred, and never asked; red with only the title's guard taken out: the untitled note was renamed after the discarded title) |
| `thread-links.js` | A link to a note opens the note however it was written: in a thread a markdown link whose address is a note's file opens that note beside it in READ, ⌘ for a tab of its own, and a `[[wikilink]]` still does; a link to a note or a file that is not there opens nothing, makes nothing, and says `not in the vault` where it stands, for a moment; a file that is not a note is the Finder's, the web's addresses the browser's; a bare file name — `gamma-note.md` listed under a folder named on the line above — is a link to the one note that has it, and a name two notes share, or none, stays words; a path to a file that is not a note — `File: notes/sheet.xlsx`, the reply's last line — is a link that shows it in its folder in the Finder (not clicked: a Finder window), one that is not there says so, and `example.com/page.html`, whose first folder is not the vault's, stays words (red at the commit before: the bare name and both paths were words); and in a note a markdown link opens its note, and one to a note that is not there makes none (red: the markdown links were web links that went nowhere, and nothing said so). Wants the thread fixture |
| `to-start.js` | The way up to where a message starts: nothing to press at the head of a thread; pressed mid-answer, that answer's first line lands 22px under the top of what can be seen; again, the message before; twice within one glide, two messages up; and it stands in the pane's right margin, clear of the words, above the way down and not overlapping it, wherever the margin holds it (red: no such way). Wants the thread fixture |
| `code-wrap.js` | A code block shows all of itself: in a thread, in a note's READ and in WRITE, a fenced line longer than the measure — a message fenced off for copying — is inside its card to its last letter, on more than one row, with nothing to scroll sideways, and an indented line keeps its indent (red at the commit before, in the thread and READ: one row, cut off at the card's edge, scrolled sideways inside it; WRITE always wrapped). Wants the thread fixture |
| `file-menu.js` | A path to a file takes a right-click: in a note's READ, a vault file written in backticks opens a FILE menu that names its folder, with Open and Show in Finder; a folder a FOLDER; a path that is nowhere says `Not found on this Mac`; a word (`beanpole`) and a setting (`TZ=Europe/Vienna`) take none; a markdown link to the file, and the thread's link to it, take the same menu; the details panel's rows — NOTES IN CONTEXT under a thread, LINKED FROM under a note — open the note or thread menu, Show in Finder in it; and main opens or shows only a place it found, refusing `/etc/hosts`. Nothing is opened or shown during the run (red at the commit before: no menu anywhere, no rows' menu). Wants the thread fixture |
| `user-wrap.js` | Your own turn shows all of itself: an address pasted into it with nowhere to break — a calendar invitation's RESPOND link — is broken inside the bubble, its last letter inside, on more than one row, the bubble inside its pane and nothing scrolling sideways (red at the commit before: the link ran out of the bubble and past the pane's edge, and the thread scrolled sideways). Wants the thread fixture |
| `session-clock.js` | The session clock in the top bar, at its right: a faint `5h` with no clock; a click opens the card and its `set by hand` is a field holding `5:00`, selected and focused, and ↵ starts five hours, saved to the state file; esc or clicking away starts nothing; typed `1:30` is what is left; something it cannot read (`soon`) is refused in place and the clock stays as it was; the last quarter hour is drawn in ink; a time already gone today is that time tomorrow (red at the commit before: no clock). Writes state, so wants a fresh `LANES_STATE` |
| `highlight.js` | `==Highlighted==` words are a marker, in the colour you pick: over a seeded note, READ shows `ripe` on `--hl` — the yellow of a fresh state — with no `==` on the page but a comparison's (`if a == b`), which stays plain, and `**sweet**` inside a highlight still bold and still lit; WRITE draws the same words on the same colour with the marks out of sight; Settings offers yellow, green, blue, pink, purple and grey with yellow picked, and Green makes it green — READ redrawn, the root's `data-hl`, the state file; in the dark it is the dark theme's own green (red at the commit before: `==ripe==` as typed in both surfaces, no colour to pick). Seeds its own note; wants a throwaway vault and a fresh state directory seeded `{"theme":"light"}` |
| `context-live.js` | A thread is measured against its own model's window: a turn on `claude-opus-5-5` that sent 828,186 tokens, whose `result` lists that model at 1M and the small one that names threads at 200K, leaves the details panel's Context row saying `828K / 1M`, its bar at 83% — and the state file keeping `claude-opus-5-5: 1000000` for the next launch (red at the commit before: `828K / 200K`, the bar pinned full, nothing kept). Wants the `window` stand-in CLI, a throwaway vault and a fresh state directory |
| `usage-live.js` | The clock reads itself, and draws what is used as a ring: a turn whose stream ends in a `rate_limit_event` sets it, with both windows' figures in the state file and the clock at the window's own end; the top bar reads a ring, then `2:15`, with no number — the ring first, the height of the digits and centred on them, its arc starting at twelve and as long as the share; its colour asked of the browser and held against the token's own resolved value — the bar's own ink below 70%, `--warn` from it, `--alarm` from 90% — and the two tokens defined, apart, and not find's amber; the number in the tooltip's words, `75% of this session used — 2:15 left, resets 22:09`; before any turn no ring and the card says there are no figures yet; a click discloses SESSION and WEEK, the session's figure in the ring's colour and the week's 2% in ink, the week's reset with its day, and when the figures were said; esc and a press outside close it; `set by hand` is still the field; a clock set by hand to another end draws no ring, and the next turn draws it back. At `STUB_USED=0.17`, `0.75` and `0.93`, in both themes: plain, orange, red (red at the commit before: `17% · 2:15` as text, no ring). Wants the `usage` stand-in CLI and a fresh `LANES_STATE`; the runner's entry is the plain case in the light, `--seed '{"theme":"dark"}'` gives the dark, and the other two figures want the entry's `STUB_USED` changed, since one entry holds one |
| `doc.js` | One document engine, and one grammar: over the same note the editor and READ draw the same bold, italic, heading, task and table runs, with `_x_` plain in both, and end a table where READ ends it — a line straight under the last row is prose in both (red while the editor took CommonMark's table, which ran on to the next blank line), and `~~~` is no fence in either; READ keeps its span markers, the editor none, and a note's single newline is a line break inside one paragraph's span. The thread half — the same markers in a transcript — runs only when the vault already has a thread, and says so in `threadHalf` when it has none |
| `rail.js` | The one rail: two cards, the three modes, folders that nest, the filter, and starring |
| `lanes-none.js` | No lanes is an answer. With `lanes: []` in state (its seed) the rail offers Recent and Folders and no Lanes, and neither its rows nor their titles say UNASSIGNED or UNATTACHED; ⌘K's threads name no lane; a thread row's menu has no MOVE TO LANE; a thread's pane chip and its tab's title name none. Then `patchState` writes a lane — Garden, on `projects/garden` — from outside the window's own patches, and without a relaunch the Lanes mode is back, the sample's two garden threads sit under GARDEN and the open one's chip says GARDEN (red before: the Lanes mode stood with no lanes, every thread said UNASSIGNED or UNATTACHED, and the menu kept its heading; the second half needs main's `lanes:lanes` push, `onLanes` on the bridge). Writes state; spends no turns |
| `vault-change.js` | The vault is changed from Settings, and a running turn is asked about first: Settings → Notes & lanes shows the folder Lanes works in with Change…; while a turn runs (the `slow` stand-in, held nine seconds) Change… opens a band saying "A turn is running.", with Switch and stop it and Keep working, the focus on Keep; Change… pressed again closes it, esc closes it and not Settings (three times over), Keep keeps, and none of them reaches main; Switch and stop it does, and main refuses a driven run's folder (LANES_VAULT), which the row says in words. With the turn over, Change… goes straight to main and asks nothing (red before: no vault row). Spends no turns |
| `lanes-crud.js` | Lanes are kept in Settings → Notes & lanes and the rail follows without a relaunch: Add lane takes a name and one of the vault's top- and second-level folders and makes `{ id: <slug>-<4 random [a-z0-9]>, name, folder }` at the end of the list, and Reading's band appears holding the thread that read `reading/`; Kitchen renamed in place to Cooking keeps the id `kitchen` and the rail says COOKING; ↑ on Reading puts it second in state and in the rail (↑ on the first is disabled); × on Garden asks "3 threads are filed in Garden; they become unassigned." — the count as the rail's band has it, the thread the seed moved there included — with Keep focused, × again and esc (not Settings) close it and Keep keeps; Delete lane takes it out of state with `laneOverrides` exactly as they were and its threads under UNATTACHED. With every lane gone it offers one per top-level folder (not `_templates`, not the read-only inbox) and Use these makes all five (red before: no lanes editor). Writes state; spends no turns |
| `settings-folders.js` | The folder rules are set in Settings → Notes & lanes and hold without a relaunch: Read-only folders, one per line, saves `  inbox  ` and a blank line as `['inbox']`, and the open inbox note loses its WRITE at once, main reads it as read only, and opened afresh it is read only too; cleared, WRITE is back. New notes go to is here and no longer under Interface: `daily` sends ⌘N's note to `daily/`, cleared it goes to the vault root (red before: no read-only field, and the new-note field under Interface). Seeds no read-only folder; makes two notes; spends no turns |
| `pane-empty.js` | The pane design: selection as elevation (single pane always lifted, focused lifts and the other seats, click swaps), the empty pane's ghost/kicker/copy/chips/list — its New note making an untitled note at once — the counted chip opening the palette pre-filtered, and the Interface toggle restoring the ring |
| `roles.js` | Threads always land in pane A and notes in pane B, opening a note opens the split, and a pane closes to a real empty destination |
| `shedding.js` | The reading measure at seven pane widths: the strip and the head land on the same column, and neither exceeds the pane |
| `find-bar.js` | ⌘F finds inside the pane you are in — a thread, a note in READ, and a note in WRITE, where the editor searches the whole note, drawn or not, and marks and scrolls the hits itself; ⌘G and ⇧⌘G walk the matches with the caret anywhere, and ⌘G on a closed bar reopens it on the last query. The bar then STAYS once you scroll past the head — asked of `elementFromPoint` at the field's own centre, since it never left the DOM, the compact bar was painted over it — and the marks are in a colour: both highlight tokens chromatic, both carrying ink of their own, and the bar's counter wearing the same amber. ⌘E with the bar open repaints the hits in the other mode even when the count and the position come out the same (red while the paint waited on those two to change). Wants a vault whose session directory holds at least one thread long enough to scroll past its head — with only short ones, `compactBarCameIn` reads false and says nothing about the bar |
| `pane-toggle.js` | The one/two-pane toggle keeps the pane you are in — collapsing while reading a note leaves the note up — and opening a thread still brings its own pane back |
| `reveal-and-select.js` | A note's tab and its rail row both offer Show in Finder (a thread's tab does not), the call behind it takes a note and refuses anything else, and ⌘A selects the pane you are in while a field keeps its own — a note's editor selecting the body you can see |
| `rail-slide.js` | The rail opens and closes as one sliding box: the width travels through the middle rather than jumping, the panes take back exactly what it gives on the same frames, the contents keep their full width and their right edge pinned to the closing one — both ways — and the tree unmounts once it is off screen |
| `rail-swipe.js` | A two-finger swipe opens and closes the browser rail, once per swipe, without taking the gesture from the tab strip or from a vertical scroll that leaks sideways |
| `pane-switch.js` | ⌥⇥ and ⇧⌥⇥ switch the active pane: the selection and its elevation move across in a split, and with the split closed they flip which pane is on screen |
| `note-ops.js` | A note renamed from its tab (file, heading and every wikilink shape following it), moved by clicking the place in the head, and trashed from the rail — with the tab, the head's title and the links keeping up — straight after a word was typed in it, and still gone once every save timer has run out (red: the save of that word, still held by the editor and the pane, was handed over when the tab closed and made the note again) |
| `tab-rename.js` | Right-clicking a thread's tab offers Rename…, which survives the blur its own opening click causes, which selects that tab, opens the field on screen and renames the thread everywhere; a note's tab is offered it too, and opens the same field |
| `tab-order.js` | A new tab opens at the far right of the strip — ⌘T, a ⌘-clicked rail row, threads and notes alike — whichever tab was selected when it was asked for |
| `tabs.js` | The twelve-tab cap, and that two tabs step back through their own histories |
| `land-loaded.js` | A tab you land on is loaded however you landed on it: closing the tab in front of it, and Close others keeping one that was never selected, both leave a document rather than `opening…` — the state five of the six ways the selection moves used to leave you in |
| `pinned.js` | A pinned tab is the one thing the app may not take: opening in place onto it appends beside it instead of overwriting what was pinned, filling the strip past its cap leaves it alone, Close others keeps it, and only unpinning lets it go |
| `find-words.js` | `vienna facts` finds the note called "Vienna water — historical facts…", in either word order, and `cafe` finds a note titled *Café…* by its name, the accent left off — while a phrase still comes first, every word still has to be there, and one word behaves exactly as it did. Runs on the sample and seeds the *Café* note itself |
| `signed-out.js` | A signed-out CLI is said BEFORE you type: the status is asked at launch, the note carries `claude auth login` and copies it, no turn is spent finding out, and the raw stderr box does not also appear |
| `copy-block.js` | A code block offers to copy itself: one chip per block, absent and unclickable at rest, absolutely positioned so the card is exactly as it was, putting the block's SOURCE on the clipboard — every line, no fence markers — and saying `copied` visibly. The chip is READ's, so it presses ⌘E first, and a double-click on the chip is two copies, never a trip into WRITE |
| `new-note.js` | Making a note from ⌘K and from the +: created at once and opened in WRITE — a named one with the caret at the top of its body, a nameless one with the caret in its empty title — and counted on its row |
| `images.js` | An image pastes, sends, renders, and is actually seen — it asks the model to name the colour |
| `path-ticks.js` | Where a thread forks, marked down its left margin: nothing at all before a fork, then one tick per seam at the height that seam really sits at, a click that lands it 22px under the top, and a mark that follows the reading |
| `resend.js` | `resend` under your own turn: the same cut `edit` makes, and then the words go again unchanged — sent by itself with nothing typed, leaving a draft already in the composer where it was. The question ends up on the page once and the transcript is the length it was, so it is a re-ask and not an append; a seam records where the first answer went; and the path still knows what was said above the cut |
| `branch.js` | Forking folds the page instead of opening a tab: the same tab and the same name, the conversation cut back to where you asked, a seam naming what the other path says next, and a click on it reading that path instead. And the verb follows whose turn it is — `fork` under Claude's, `edit` on yours, which folds above the question and hands it back to the composer unsent. Then the seam's own menu: any path can be named, the name shows on the seam, and only a path cut FROM the thread can be let go. And picking the thread out of ⌘K keeps you on the path you were reading rather than yanking you to the one it started as |
| `paths-live.js` | Both roads at once: a path left mid-answer keeps answering, the seam marks it as still going, and walking back shows the turn once rather than twice — and letting go of a path while it is still answering stops it rather than leaving it writing into the Trash |
| `title.js` | A tab names itself the moment it is sent, the namer improves on that, and the name then sticks |
| `title-tools.js` | A thread whose first turn OPENS WITH A TOOL CALL is still named — the case where the reply's `text` is empty and the namer used to find nothing to name |
| `writing.js` | The writing surface is one CodeMirror editor in READ's type, size for size: the markdown drawn live (marks hidden but for the one token the caret touches, hashes hanging in the margin, bullets and boxes as furniture, a fence's ```` ``` ```` lines folded until the caret stands on one — a click into the code leaving them folded and the code where it was, red with the fences opened for a caret anywhere in the block), a click landing on the character drawn under it however many hidden marks sit before it, ⌘B and ⌘I wrapping and unwrapping — and trading, ⌘I making a bold word italic and ⌘B an italic one bold, since READ has no bold italic and `***` shows its stars (red while the marks stacked) — and in a phrase of several words acting on the phrase: the caret in one of its words takes the mark off all of it, a phrase ⇧⌥← selected has its mark taken off, and one word selected inside a bold phrase is split out of it, `**one** two **three**` (red: `**bold **whole** words**`, `*aside *well* made*`, `****bolded** **`, `**one **two** three**`), a double-click selecting the word pointed at in a wikilink's title and in a bold phrase though the first click brought the token's marks out and moved the line (red: `nowhere`, a piece of the hidden target, and a space), ⌘B over a triple-clicked item marking its words and not its marker or the next item (red: `**- triple me\n**- leave me`), a pair ⌘B put down taken back up by ⌘B and ⌘B, a word, ⌘B ending the bold there (red: stacked stars, and the bold taken off the word), ↵ inside a bold phrase closing it before the break and opening it after, two lines pasted into one going between the halves, and ⌘X of a selection that takes a phrase's closing marks putting `**c** x` on the clipboard and ⌘V straight back giving back the line (red: stars on both lines, and the stray `**` pasted back), ⌘↵ making and ticking a task, ⌥↑/⌥↓ moving a line and nothing else (red while the key went on to the window, whose ⌥↑ is the previous note), the word keys counting what is seen (⌥⌫ and ⌥⌦ stepping over hidden marks and taking a token they emptied away whole, ⌥← landing at a word rather than inside its marks, ⇧⌥← selecting a token whole — a two-word bold phrase and a two-word wikilink title over two presses, marks and all (red: the second press stopped against the marks the first had shown, and ⌫ left `**` or `[[x|` behind) — one ⇧⌥← into a phrase from outside and ⌫ taking the word and keeping the phrase's closing marks, and typing over a selection that runs past a link's hidden `](url)` replacing the words and keeping the link (red: ⌫ left `**bold phrase` open; typing took the URL), ⌥⌫ at the start of an item's words taking the item as ⌫ does, ⌥← from there going up a line, ⌘⌫ leaving an item's box — red on CodeMirror's own word keys, which left `**` open, brought a wikilink's target and a link's URL out of hiding, broke `- [ ]` into `- [` and could not ⌥← out of an item at all), ⌘Z walking the whole note, focus lighting the paragraph the caret is in and typewriter parking that line — for the keyboard, never under a click — what was typed reaching the FILE — the last characters before the mode switch included — the words going to the note they were typed into rather than to the one a ⌘-click on a wikilink opens next — in a tab of its own, the note you were writing left in the strip — and READ coming back to a rendered document |
| `link-complete.js` | `[[` asks which note: two letters in, the list offers the vault's notes by title with their folders and the typed text drawn in each — but not the note being written in (red while it did) — and a name no note has, last, as a *new note*; taking one writes the bare name, aliased with the title, when the vault resolves that name to that note, and the full path when the name would land on another (two notes of one name in two folders, the one the name does not reach); the caret lands after the `]]`, and the file says the same; and ⌫ straight after a `[[` that closed itself takes back the `]]` with the `[` (red: `]]` left behind). Seeds its own notes, stamped |
| `comments-read.js` | Comments are read, on both surfaces, over a seeded note with two anchored comments, one at a point and one in a fence: READ shows each line without the braces or the comment's words, the anchor's words washed and dotted under, the fence's as written; with room past the measure every comment is a card in the margin, past the column, level with its anchor's line, none overlapping, and an anchored comment's marker away while the one at a point keeps its own; the meta line says `· 3 comments` and the details panel **Comments 3**; in a split there is no margin, every comment is a marker, a click opens it under its line — in a note that can be written, as the field holding its words — and esc closes it; in WRITE the same line, the anchor washed, the margin there too, the caret in the anchor bringing back `{==` and `==}` and against the comment its raw `{>>…<<}`, faint, and nothing written to disk for any of it; ⌘K finds the note by a comment's words; the word count is the same as for the note with them taken out; and the PDF is saved, for `comments-pdf.mjs` to read — the anchors' words in it and none of the comments, the fence's lookalike printed as code (red at the commit before: the braces on the page, in both surfaces and on paper, and 44 words where there are 31). Seeds its own note; wants a throwaway vault, a fresh state directory and `LANES_EXPORT_TO` |
| `comments-write.js` | Comments are written: a selection in READ is offered `comment` beside `quote`, and the field opens under the words, focused, saying which words; ↵ writes `{==…==}{>>…<<}` into the note and READ stays READ, the card in the margin; ⌘Z in READ takes it back and ⇧⌘Z gives it again; a card pressed opens the field with its words and a ✓, and ↵ changes what it says; with words typed esc asks, Keep writing focused, esc pressed six times only opens and closes the question and the words stay, ⌘⌫ discards and writes nothing; ✓ resolves, the anchor's words left unwrapped; ⌥⌘M opens it on READ's selection; in WRITE ⌥⌘M with no selection takes the word at the caret, writes as one step of the editor's undo (⌘Z and ⇧⌘Z in the editor), returns the caret, and a card pressed there edits and resolves; and on a blank line ⌥⌘M opens nothing and writes nothing (red at the commit before: no `comment` offer). Seeds its own note; wants a throwaway vault and a fresh state directory |
| `comments-anywhere.js` | A comment goes wherever the selection has words: in READ, a selection from an item's bullet is about the item's words, one from a paragraph's end on into a list is about the list's first words, and a table's cell takes one on its own words — a `\|` said in it written `\\|` so the table keeps its cells, its card in the margin saying `\|`, pressed, changed and resolved; across two cells it is the first one's; only code, or a note embedded in this one, still opens nothing and writes nothing to either note; and in WRITE ⌥⌘M with the caret in a table's row takes the word there (red at the commit before: the bullet, the paragraph's end, the cell and the row each opened no field). Seeds its own two notes; wants a throwaway vault and a fresh state directory |
| `update-ready.js` | "Update ready" at the foot of the rail, offered and never forced: one line saying how many commits it brings, above the rail's footer, closed at first; opened, the commits newer than the app, newest first and without their `Lanes: `, none of its own or older, and a commit opened to its body; Restart now with a reply running says it waits for the reply to land, Not now calls that off, and asked again it goes once the reply has landed; and after the app quits, `update-plan.mjs` finds the restart main would have made, reopening (red at the commit before: no line). Wants `"update": true`, which seeds the run's ready.json, and the `slow` stand-in |
| `update-quit.js` | An update left alone goes in when you quit: the line shown, nothing asked of it, and after the app quits `update-plan.mjs` finds the install main would have made, not reopening (red at the commit before: nothing on quit). Wants `"update": true` |
| `comments-pass.js` | The pass: the details panel's Comments row says `Comments 3 go through`; words typed in WRITE a moment before, not yet on disk, are in the note Claude is sent (red with the flush taken out: the prompt without them, and a conflict after); a new thread, attached to the note, named `Comments · <note> · <day>` and its name kept in state; the prompt as sent lists all three comments, numbered, with what each is about, names the note by its path, and says what to do with each; the answer lands in the thread and the stand-in's edit in the note — the first comment taken out, its anchor's words left — arriving in the open editor with nothing typed lost and no conflict, the count down to 2; then ⌘K, the note in front, offers the pass, never where ↵ rests, its footer saying `↵ go through them`, and ↵ on it is a second thread whose prompt lists the two left, the count down to 1 (red at the commit before: nothing to press). Wants the `review` stand-in CLI, a throwaway vault and a fresh state directory |
| `live-md.js` | One surface, always editable, the markdown live: a note opens in READ and ⌘E puts it in one CodeMirror field — no block field, no mirror — with its title said once, in the head; rendered with the caret away (bold bold, marks and hashes hidden, headings bigger, bullets and boxes drawn) and back where it stands, that one mark only; READ's body size; READ holding no editor, and a double-click there landing the caret in that paragraph; a box ticking the file; ↵ continuing a list and an empty item leaving it, a one-item list included, and an empty quote line leaving the quote for good; ↵ at the start of an item's words putting an item above; `Home` and `⌘←` landing on the words; a `]` typed at a link's end stepping over the `]]` — typed one key at a time, since a run inserted whole is not the keystroke the editor listens for (red with the step-over removed); a click past hidden marks landing at the line's end (red with hidden marks squeezed to zero size instead of `display: none`); a title under a leading blank line hidden and written by the head; and ⌘Z walking the whole session back to the note as it was seeded |
| `note-sync.js` | A note written from outside while the editor sits idle loads into it silently: no conflict banner, the caret still in the editor and on the same character though a paragraph arrived above it, a word typed next landing in the file beside what arrived with nothing else changed, and the app's own save not read back as a conflict one poll later. And no gap in the hand-over: at the moment the app records a second outside version's mtime — caught on `Map.prototype.set`, this note's path being given a number — its words are already on screen, and a word struck in the microtask after it lands on top of them, so the file ends up with both and no banner. Red while the window's render was left to React's own time (a task after the poll's question) or the pane and the editor took the body in passive effects: that word was owed by the time they looked, and its save went over the outside edit unannounced. And a note closed a breath after a word and reopened at once with ⇧⌘T opens with the word, keeps it once its save lands, and keeps it in the file under the next word typed (red while the reopen's read of the file, taken before the save landed, was put in the editor and the next keystroke saved it back); and main, asked through the IPC to read a note straight after it was asked to write it, reads what the write wrote ten times out of ten (red while reads did not wait for the note's own queued write). And with both sides holding something — a word typed, and a write from outside on top of it — the banner comes up and, until it is answered, Rename… from the tab is refused and the file keeps the outside version (red: the rename went ahead and the held word followed it, over that version); a second note in the same state leaves the first one's banner and file as they were (red: the app held one conflict, and the first one's banner went); and the window closing a moment after an outside write no poll has seen keeps that write in the note and puts the last words in a `(conflicted copy)` beside it (red: written over it). And a rename that rewrites the link in this note while a word typed here is on its way raises no banner, saves the word, keeps the link as the rename wrote it, and the editor takes the rewritten link up (red: refused as a conflict with nobody on the other side) |
| `jot.js` | ⌘N is a note, now — timed over a vault the size of a real one: no naming step on any frame, the caret in the head's empty title that says Untitled, under 400ms in the dev build; a title and ↵ down into the body renames `untitled.md` to the title's slug in the same folder with the words under it, the tab and the head following; a second ⌘N left without a title stays nameless in a file of its own, called by its first line of writing in its tab, the head's placeholder and the note list; the + menu's Note does the same; letters typed in the same breath as ⌘N, before the note is on screen, are its own — the title, and past a ↵ the body — with the note that had the caret unchanged on disk, and from a blank tab too, with no note on screen to hold them (red: the title went into the field and nowhere else and the rest was typed into the title; and, in the development build's doubled effects, the caret put back in the title after the words had gone on into the body); a title left by ⌘1 with no ↵ still names the note (red: it read the field after React had let it go, and named nothing); and a note made and left empty goes to the Trash when its tab closes, while one with words in it stays |
| `md-live.mjs` | (node) The editor draws READ's grammar, not CommonMark's: for every line of the vault the text left once the editor's marks are hidden is exactly READ's, every single-line block READ finds — heading, task, item, rule — is the same kind, level and done-ness to the editor, and every line is in the same fence, table or fold's tags to both (a line straight under a table is prose, `~~~` fences nothing, a `<br>` or a comment is prose). The runs the editor keeps through an edit are the runs read from scratch, over four edits to every note, and a keystroke in prose reads a handful of lines |
| `line-diff.mjs` | (node) A note edited from outside arrives as the changes that were made: applied, they give the new text exactly over 5,000 random edits, and they touch nothing that did not change — two separated edits leave the paragraph between them alone, and a word changed in a line is that word |
| `edit-fuzz.mjs` | (node) The keys that change marks, over tens of thousands of seeded random lines of READ's tokens: ⌘B and ⌘I leave READ showing the same words, on one line or several; a selection deleted or typed over leaves READ showing exactly the words not selected, and what was typed where its first seen letter was; ↵ anywhere, a paste of line breaks or marks, ⌘X and ⌘V back, and a drag leave READ showing the words they should and no mark on its own; ⇧⌥ run into a token from outside it and then deleted or typed over leaves no stray mark (red on the old ⌘B/⌘I, without the filter that keeps a partly covered phrase's marks, and — across lines, ↵, pastes, cuts and drags — on the editor before the last review). And comments among the tokens, through all of those presses and the word keys and keys at a comment's edges: none left in part, an anchored one still anchored or gone with its anchor's last word, none gone but one the press covered (red with the anchor rule taken out, and with the sealed ⌫ and ⌦ taken out). And highlights among them, holding bold and anchored comments: no `==` left on the page by any press (red when they were added: a space moved past bold's mark onto a highlight's, a highlight left empty round a comment taken with its anchor, a paste in an anchor closing the highlight round it, and a cut from between an anchor and its comment taking the comment) |
| `note-moves.mjs` | (node) Main's own write queue with a save on its way: a rename lands the save in the renamed file with no stray `untitled.md` (red: the stray file held the words), a trash is not undone by a save queued behind it, and the window's synchronous last write goes into an untouched note, to a `(conflicted copy)` beside one written to since it was read — a second copy a file of its own (red: the first written over) — into the note when the only change since was the app's own save (red: a conflicted copy, and the note left with older words), is not overwritten by an older save main had already started, reading or writing (red: lost), and follows a rename whose reply had not come back (red: the old file made again); and a save sent from before a rename's rewrites is not a conflict and gets them — the rewritten link, the new heading — with the reply saying what was written (red: refused) |
| `line-ends.mjs` | (node) A note saved on Windows comes back as it went: its `\r\n` body applied again to the editor that holds it is no change at all — no blank line, the caret where it was — a change from outside is only that change, and what the editor hands back is written in the file's own breaks: every break an edit did not touch byte for byte, a stray `\r` included, and a typed one the note's usual way — a line joined at a stray `\r` loses that `\r` and not the `\n` after it, and no empty line typed under one is lost — over 20,000 single edits, 4,000 random notes and every note in the vault with a `\r` in it |
| `pdf.js` | The export: the `pdf` control where `copy` lives, the word saying what is happening and settling back, and a file on disk within seconds. Its other half is `pdf-file.mjs`, which reads the bytes — A4 rather than the Letter default, more than one page, and real fonts rather than a picture of text |
| `fold.js` | Collapsible sections in READ: a real `<details>` rather than the tags, `open` honoured from the source, the body carrying the note's own spans, the state surviving a redraw, and the outline, the reading mark and ⌘F all reaching into a closed one — while WRITE shows the fold as the source that makes it |
| `headings.js` | The four heading levels told apart at skimming speed, in READ and in the editor alike: `####` is a heading at all, `###` outruns the prose it divides, `##` keeps its uppercase tracked mono but at full ink over a rule that runs the measure — in caps on the caret's line too, where its hashes hang in the margin without moving a word — and the outline echoes the same hierarchy |
| `pause.js` | A blank line is a line — a whole line of air between two paragraphs, in the editor, in READ and in a thread alike, where it was a third of a line in WRITE, 4px in READ and 4px in a thread, and then half a line, still too little (red at HEAD: 8, 4 and 4px): two paragraphs a blank line parts are as far apart on every surface, so ⌘E moves no paragraph, while a line break inside a paragraph stays one line; the blank line is a whole line with the caret away, so the caret stepping on it moves nothing; a blank line beside a heading is still the heading's own air, short until the caret stands on it, so no heading moves (within the 2px READ's air under a `###` has always been short of the editor's); and a double-click in READ's pause writes on the blank line it stands for. Wants the thread fixture |
| `unseen.js` | An answer that landed while you were elsewhere marks its tab — the same 6px glyph, in ink, with a soft ring, exactly one of them — and going back to it clears it |
| `limit-live.js` | A usage limit is drawn as the wait it is: a ticking, tabular countdown in place of the stderr box, with the CLI's own sentence kept underneath, and the session clock in the top bar set to the same moment (`2:15`; red before: still `5h`). Against the `fault` stand-in — the entry's `stub` changed, since one entry holds one — the whole claim is that nothing is dressed up and the session clock is left alone |
| `signin-turn.js` | A turn the CLI refuses for want of a login is not drawn as an answer: no CLAUDE message, and the sign-in note with `claude auth login` instead. Wants the real CLI with a refused token (`CLAUDE_CODE_OAUTH_TOKEN=sk-ant-oat01-refused` under `env -i`), which fails before any model is asked and spends nothing. Red before the fix: one CLAUDE message saying `Failed to authenticate`, and no note. The runner skips it: the stand-in's signed-out turn fails on stderr instead, which would pass without proving the claim |
| `models.js` | Models: an id the CLI does not know is refused in the CLI's own words and not added, one it does know is added and shows its real id, the dot puts a model away and the default cannot be, and the composer offers exactly what is left — and picking one takes on the thread |
| `long-note.js` | A note too long to draw does not hang the window: READ opens promptly, draws a stated number of blocks and says what it has not drawn, the outline lists the note's REAL headings rather than every indented `##`, a row past the cap draws the rest and goes there, and WRITE opens the whole note in the editor, with no cap and no plain mode — and an outline row ten thousand lines down lands there, the jump corrected once the scroll has ended and again until it holds, since the line's place is only estimated until it is drawn |
| `chords.js` | ⌘1–9 addresses the nth tab of the pane you are in and leaves the rail alone; ⌥1 shows and hides the browser and leaves the tabs alone; a digit past the end of the strip is a no-op, and ⌥2–9 are inert. Both matched on the PHYSICAL key, since ⌥1 arrives as `¡` |
| `seam.js` | A drag that ends without a pointerup ends: after a `pointercancel`, and after a release the seam never hears about, crossing it moves nothing. The composer's grip too |
| `thread-bottom.js` | A renamed thread keeps its name when the tab is rebuilt from the transcript, and a thread scrolled up offers the chevron back to the live edge |
| `title-late.js` | A thread whose name was never settled gets one on the next turn it finishes, rather than keeping the CLI's opening line for good |
| `recent-shelf.js` | RECENT folds on today per kind — everything touched today above the fold, never fewer than seven — with a more/less row that goes both ways, leaves the other section alone, and folds back up when the mode is left |
| `cmd-t-pane.js` | ⌘T opens a new tab in the pane you are in: a fresh thread in the thread pane, a blank tab in the note pane, and no thread made from the note side |
| `blank-tab.js` | ⌘T's blank note tab: the empty surface with a strip above it, its New note / Search / recent four, no document chrome — and both a recent row and New note replacing it in place, the second as an untitled note with the caret in its title |
| `new-thread-focus.js` | A new thread takes the caret by every route that opens one — ⌘T, the top bar's + and a note's context menu — and lands it past the wikilink the note route types in |
| `new-menu.js` | The top bar's + offers Thread or Note, and Note makes an untitled note at once with no naming field; ⌘N goes straight to the same note, and ⇧⌘N no longer makes a pane |
| `many-tabs.js` | A full strip keeps its titles, and scrolls: ten tabs all kept, none collapsed to a monogram, every tab either 90px wide or showing its whole title, the row scrolling with some tabs out of sight and the one you are in in view, the edge fading, the wheel scrolling it sideways, and the counted chip whose list names every tab in the pane and goes to the one you pick — bringing it into view (red at the commit before: the row shed to monograms and never scrolled) |
| `tab-drag.js` | A dragged tab makes room, and forgives: over ten note tabs, one carried right past two others is drawn under the pointer with the two it passed slid aside and the next still, stays picked up with the pointer far below the row, and lands third, everything settled; esc mid-drag leaves the order as it was; a press without a move selects and moves nothing; one held at the right edge scrolls the row and lands last (red at the commit before: no tab follows a pointer, nothing moves) |
| `tab-edge.js` | An answer out of sight is a dot at the edge: a turn sent on the first thread tab, then new tabs until the row scrolls it out of sight on the left; nothing at either edge while it runs; when it lands, a dot at the left edge in the unseen dot's ink and ring and none at the right; a click on it brings the tab into view, still unseen, and the dot goes (red at the commit before: no edge dot). Wants the `slow` stand-in CLI, a throwaway vault and a fresh state directory |
| `thread-text.js` | ⌘K reads the INSIDE of a thread: a phrase lifted back out of an answer, checked to be nowhere in the thread's name, finds that thread — badged TEXT, with the matching line as its subtitle, kept to the THREADS filter, and opening the thread it came from. A phrase nobody said finds nothing |
| `note-newtab.js` | ⌘-click on a link inside a note opens a tab of its own, in both modes, and the note it came from stays in the strip. In WRITE a plain click on the link is only a caret — nothing opens — and the link's tooltip says ⌘-click; in READ a plain click still follows, replacing the note, and a ⌘-click on a note already open selects its tab rather than opening it twice. The head's LINKED rows take ⌘ as well. Seeds its own three notes, stamped |

`reveal-and-select.js` opens one Finder window when it passes — that is the
feature, and the preload bridge is frozen, so there is nothing honest to
intercept it with.

The note-editor checks — `live-md.js`, `note-sync.js`, `jot.js` and the ones
rewritten with the editor — seed the notes they need through the app's own IPC
(`window.lanes.noteCreate` and `noteWrite`) and open them through ⌘K, so what
they want is a throwaway `LANES_VAULT` and a fresh `LANES_STATE`, never anything
real: they write to what they open. A note seeded that way is in main's index at
once but not in the window's note list, which only the app's own making and the
sweep refresh, so ⌘K finds it through its text — by its title when the text
holds the title, which is why the palette ranks such a hit by name. A seeded
note with no heading is found by its opening words. Where one still expects a note to be
waiting in the vault, its header comment says which, and the header is the
authority over anything written here.

`jot.js` wants its vault and state directory new for EVERY run, not merely
throwaway: a `jot-check.md` or `quick-one.md` an earlier run left behind is in
the way of this run's renames, and the nameless notes it left shift the
numbering. An empty vault is seeded with 1,500 notes (~60MB) under `seed/`
before the clock starts, because the cost it exists to catch — the index
rebuilt before a new note can open — is milliseconds over three notes and a
second or more over seventy megabytes. A vault given with `--vault` that already
holds 1,500 notes — a copy of one that size, under `/private/tmp` — is taken
as it is.

`many-tabs.js` and `tab-drag.js` want a throwaway vault of a dozen or so notes,
two of which — `hub.md` and `rim.md` — carry a `[[spoke]]` wikilink, plus the
`spoke.md` they point at; each opens ten of them. `note-newtab.js` seeds its own.

`thread-text.js` spends one turn, so it is `live`: the phrase it searches by is
lifted out of a real answer's transcript, and the stand-in writes none.

`pinned.js` wants the same throwaway vault as `many-tabs.js`. It pins whichever
notes the rail is actually showing rather than ones named in advance — RECENT
folds on today and re-sorts as you visit, so neither a name nor a row index is a
handle.

`find-words.js` runs on the sample vault and seeds one note of its own: a title
with an accent, under a filename without the word it folds to. The sample's
`cafe-hours.md` cannot prove that a title folds — its filename already says
`cafe`.

`signin.mjs` proves what reads as "sign in again" and — the half that matters —
what does not: a tool permission denial, a sandbox refusal, a proxy certificate,
DNS, a rate limit and a usage limit all mention authorisation or waiting while
meaning something else. Its driven half, `signed-out.js`, is only meaningful
while the CLI says it is signed out, which the runner's `signedout` stand-in
does; against a CLI whose `claude auth status` says `true` the check reports
`notApplicable` and asserts nothing, which is the honest answer rather than a
pass.

`land-loaded.js` is RUN TWICE against the same vault and state directory. An
unread tab is a restored one — every tab opened inside a session was opened by
being landed on — so the first pass fills the strip and says so, and the second
pass, which starts from the state file, is the check. `location.reload()` cannot
stand in for the relaunch: it destroys the context the script itself runs in.

`models.js` asks the CLI about model ids in two two-token turns and writes
custom models into state. It is not `live`: the stand-in answers those turns,
refusing an id with a space in it in the CLI's own words and taking any other,
which is all it asks. Nor is `title.js`: the stand-in answers its turn and its
namer's, and a name back is all that one asks.

`pdf.js` opens the sample's `everything.md`, whose title begins *Everything a
note*, since that is the rail row it opens — every block kind, and near the end
a `<details>` holding prose and a list, with a nested `<details open>` inside
it. It also wants `LANES_EXPORT_TO` — the native save panel is invisible to a
renderer script, and the preload bridge must not grow a method whose only
caller is a check — which the runner points at a directory of the run's own,
and reads what landed there with `pdf-file.mjs` once the app half has passed:

```bash
node checks/run.mjs pdf            # the app half, then pdf-file.mjs over its PDF
node checks/run.mjs pdf --keep     # the same, the PDF kept under the printed path
```

No driven check spends a real turn unless it is marked `live` in
`manifest.json` and `--live` is given. `checks/run.mjs` hands every other run a
STAND-IN CLI as `LANES_CLAUDE`: `checks/stand-ins/claude-stub.mjs`, behind a
two-line wrapper that sets `STUB_MODE` from the check's `stub` in
`manifest.json`. A check that names no stub gets `ok`, which answers every
message "ok" 300ms after it arrives, names threads "Stand-in thread", and
accepts any model id without whitespace in it. The rest are named by the
checks that want them. `slow` says nothing for 4s and exits 0, long enough for
a turn to finish while you are on another tab (`unseen.js`, `tab-edge.js`).
`limit` is the headless usage-limit line with a reset 8,100s out (`2:15`).
`fault` mentions a limit and a reset and is NOT one (both for `limit-live.js`).
`usage` answers,
then says what the windows are: the session at `STUB_USED` (17% unless told
otherwise) and the week six days out at 2% (`usage-live.js`, run at 0.17, 0.75
and 0.93). `review` takes the first anchored comment out of the note the prompt
names, anchor unwrapped and words left, but only in a throwaway vault under the
temp directory (`comments-pass.js`). `window` is a turn on `claude-opus-5-5`
that sent 828,186 tokens, with a `result` that says each model's window
(`context-live.js`). `signedout` makes `claude auth status` say what a lapsed
login says (`signed-out.js`). `STUB_DELAY` (ms) stretches any of them, and
`auth status` answers signed in everywhere else. The stand-in writes no
transcript, so a check that needs a thread on disk takes the `thread` fixture,
or the sample's own threads (`sample-threads.mjs` lays eight down beside every
copy of the sample vault). To see it work without the app:

```bash
printf '{"type":"user","message":{"role":"user","content":[{"type":"text","text":"hi"}]}}\n' \
  | STUB_MODE=usage node checks/stand-ins/claude-stub.mjs -p --input-format stream-json
```

`chords.js` and `seam.js` want nothing but a state directory of their own.

`make-from-palette.js` writes notes — the nameless offer makes one as well as
the named one — so give it a throwaway vault and state directory. It spends no turns: the thread it makes is deliberately left unsent.

`path-ticks.js` spends five turns and forks a thread, so it is `live`. Its
answers are deliberately long: a transcript that fits the pane cannot be
scrolled, and a jump with nowhere to go proves nothing about a jump.

`title-tools.js` spends a turn and runs a shell command, so it is `live`; it
wants a state directory of its own, as every run gets — the names live in
state, and a directory with none in it is the app that has never seen this
thread.

`editor.js`, `note-copy.js`, `editortraps.js`, `undo.js`, `roundtrip.js`,
`note-writing.js`, `writing.js`, `title-once.js`, `doc.js`, `copy-block.js`,
`fold.js`, `headings.js`, `long-note.js`, `outline.js`, `read-default.js`,
`note-scroll.js`, `esc-discard.js` and `sticky-bar.js` seed every note they
touch — `roundtrip.js`'s with frontmatter, since frontmatter left alone is half
its claim, and `long-note.js`'s several thousand blocks long — so a throwaway
vault and a fresh state directory are all they want.

`pause.js`, `thread-links.js`, `to-start.js`, `code-wrap.js`, `user-wrap.js` and
`file-menu.js` read a thread as well, and want one that is the same every run: `thread-fixture.mjs` lays one down — a
transcript where the app looks for the threads of the vault it is given, with
long answers, paragraphs parted by blank lines, links of every kind Claude
writes, and the notes and the file those links name. No turn is spent. It
writes only under that throwaway vault and its directory in
`~/.claude/projects`, and wants the RESOLVED path — `/private/tmp/…`, not
`/tmp/…`, since the CLI names a project directory after the path it actually
ran in, and a vault given as `/tmp/x` comes back with no threads at all. The
runner lays it down fresh for every check whose entry in `manifest.json` says
`"fixture": "thread"`, since a run leaves notes of its own in the vault:

```bash
node checks/run.mjs thread-links                  # one check on a fresh fixture
node checks/run.mjs --dev --fixture thread        # the same world, nothing driven — to look
```

It also serves `doc.js`'s thread half, `find-bar.js`'s long thread, `head.js`,
`panechrome.js`, `pane-toggle.js`, `roles.js`, `thread-bottom.js` and
`palette-marks.js`, which forks the fixture's thread.
`new-note-folder.js` wants an EMPTY throwaway vault — it makes three notes and
reads back where they landed. `outline.js` runs the wide case in a single pane,
so give the window room.

Every script that writes state wants a state directory of its own, and a **fresh
one per run** — they leave the split open, rails hidden, or a note starred, and
the next script reads that as the world it was given. Running two against one
directory is how `shedding.js` came back 0 of 10 with nothing wrong. The runner
makes a new vault and state directory for every check it runs:

```bash
node checks/run.mjs shedding tabs      # two worlds, one after the other
```

`new-note.js` and `new-menu.js` write a note, which the runner's copy of the
sample takes. `images.js`, `branch.js`, `resend.js` and `paths-live.js` spend
real turns, so like the others above they are `live`: run only with `--live`,
on the real CLI, in a throwaway world of their own. The last three each start
a thread with ⌘T and cut only that one: `branch.js` and `paths-live.js` fork an
answer in it, and `resend.js` asks one of its questions again:

```bash
node checks/run.mjs branch resend paths-live --live
```

`title-late.js` wants a thread that has no name of its own — no `ai-title` in
its transcript — which is what a thread whose first turn was interrupted looks
like, and it spends a real turn naming it. No fixture lays one down (the thread
fixture's has its `ai-title`), so the runner skips it, and `manifest.json` says
why.

`shedding.js` runs the whole table in one configuration — single pane, both
rails shown — because every width it needs then lands between 900 and 1500px.
Reaching the wide end by making the *window* wide instead runs into the screen,
and `resizeTo` silently clamps.

## Driving the note editor

**A note opens in READ.** A seeded note found through ⌘K is the document, not
the editor: ⌘E (or a double-click) is how a check gets to the editor, as it is
how a person does. A note the app makes — ⌘N, the `+`, the palette's offer —
opens in WRITE. And esc in the editor is no longer a blur: it leaves WRITE, or
asks first if something was written. To let go of the caret and stay, blur the
editor (`content().blur()`).

The editor is CodeMirror, and it does not believe everything a script tells the
page. Four things were learned the hard way:

- **Place the caret with a click, not a selection.** Even though the app is
  brought to the front, a driven run often does not hold the OS's focus
  (`document.hasFocus()` is false), and CodeMirror ignores a DOM selection set
  with `window.getSelection().collapse(…)` while its window is not the focused
  one. Its own pointer handling is what a person's caret goes through, so a
  check goes through it too: a `mousedown` with `button: 0` and `detail: 1` at
  the left edge of the target character — a one-character Range's
  `getBoundingClientRect()`, or its right edge + 1 for the end of a line — on
  `document.elementFromPoint(x, y)`, then a `mouseup` on `document`, then about
  250ms. `caretIn`, `caretAtEnd` and `clickAt` in `live-md.js` are the ones to
  copy.
- **Type with `document.execCommand('insertText', false, text)`** once the caret
  is placed. Keys the editor handles itself — ↵, ⌫, ⇥, `z` with `metaKey` —
  are a `keydown` with `bubbles` and `cancelable` dispatched on `.cm-content`,
  where its keymap hears it. App chords (⌘K, ⌘E, ⌘N) go to `window`.
- **Only the lines near the viewport are in the DOM.** A long note read off the
  page is a note with most of it missing. The truth is the file:
  `(await window.lanes.note(path)).body`, read at least 1,800ms after the last
  keystroke, which is what the save pipeline — 150ms, 250ms, 500ms and the
  write — takes to land.
- **The title is not in the editor.** The note's `# ` line is hidden there and
  said by `[data-note-title]` in the head, so a check looking for the title
  among `.cm-line`s finds nothing, correctly.
