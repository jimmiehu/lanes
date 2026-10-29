# Privacy

Lanes is a window onto two things already on your Mac: a folder of markdown
notes, and the Claude Code CLI you installed and signed in to. It has no
account, no server of its own and no analytics. This file says what it reads,
writes, runs and sends, with paths, so that each line can be checked against
the code named beside it rather than taken on trust.

The first launch says the short version — *No account, no cloud, no tracking.
Your notes stay in your folder.* — and the rest of this file is the long one.

## The network

**Lanes makes no network calls of its own.** Nothing in its code imports a
network module or calls `fetch`, and the page's Content-Security-Policy names
no remote source, so a remote image in a note (`![](https://…)`) is not
fetched. `checks/no-network.mjs` reads both off the source.

What you send to Claude goes through your `claude` CLI to Anthropic, under
your account and Anthropic's terms — the same as typing it in a terminal.
That includes the text of a note you quote into a thread, images you paste,
and whatever Claude reads from your files while it works. What the CLI sends,
and what it keeps, is Claude Code's business and is described in its own
documentation.

A link you click (`https:`, `http:`, `mailto:`) is handed to your browser or
mail app. That is the browser's request, on your click, not Lanes'.

There is no update check: Lanes asks no server whether there is a newer
version. If you turn on `npm run follow` (`build/follow.sh`), it builds your
branch from your own repository on disk — its `git clone` and `git fetch` name
the repository's path, not a remote — but it runs `npm ci` in its clone the
first time and whenever `package-lock.json` changes, and `npm ci` downloads
from the npm registry, and Electron's install step downloads Electron, whatever
is not already in their caches. That is npm, run by a script you turned on,
not the app. Off, nothing runs.

## What Lanes sends through the CLI without your typing it

Four things go to the CLI that you did not type into a composer. Each runs
`claude` the way you would.

- **Thread titles** (`src/main/title.ts`). When the CLI has not named a
  thread itself, Lanes asks for a name, from the thread's first exchange: it
  runs `claude -p` on **Haiku** with the first 600 characters of your opening
  message and the first 600 of Claude's first reply, fenced as data, and asks
  for at most five words. Twelve tools are denied by name (`--disallowedTools
  Bash,Read,Write,Edit,NotebookEdit,Glob,Grep,WebFetch,WebSearch,Task,Agent,Skill`),
  your MCP servers are left out (`--strict-mcp-config`), and it runs in the
  system's temporary folder, not in your vault, so the call has no tool to
  read or change a note with. Like any `claude -p` run, the
  CLI keeps its own transcript of that call, under `~/.claude/projects/` in
  the folder named after the temporary directory; Lanes does not read it.
  There is no switch to turn titling off in 0.1.0.
- **A model check** (`src/main/models.ts`). Adding a model in Settings →
  Models sends `Reply with the single word: ok` to that model, with the same
  tools denied and from the same temporary folder, to learn whether your
  account can reach it.
- **The sign-in check** (`src/main/which.ts`). At launch, and again when you
  press *Check again* on the note that says no `claude` was found, Lanes runs
  `claude auth status` to know whether to show the signed-out note.
- **Scheduled prompts**, once you switch them on. See below.

## What it reads

- **Your vault**: the folder you chose at first launch (or in Settings →
  Notes & lanes). Every `.md` file in it, except in hidden folders (any
  name that starts with a dot: `.git`, `.obsidian`, `.trash`, `.claude`) and
  `node_modules`.
- **The vault's skills**: `<vault>/.claude/skills/*/SKILL.md`.
- **Claude Code's transcripts for that folder**:
  `~/.claude/projects/<the vault's path, with every non-alphanumeric
  character turned into a dash>/*.jsonl`. That is every Claude Code session
  ever run in the vault's folder, including ones you started in a terminal,
  not only the ones Lanes started. They are how Lanes shows threads at all.
- **File metadata outside the vault, on your right-click** — see *The
  right-click menu on a path* below.
- **`~/Library/Application Support/lanes-follow/ready.json`**, which says
  whether an update is ready (`src/main/update.ts`): at launch, when the window
  comes forward, and when the file changes, which it notices by looking at the
  file's metadata every ten seconds. Only `npm run follow` writes it, so
  without that there is nothing to read and nothing is offered. When it is
  there, Lanes also checks that the bundle it names exists, and shows the
  commit subjects and messages it carries.

## What it writes

In the vault:

- The notes you write, create, rename and move. Renaming or moving a note
  also rewrites the `[[links]]` to it in other notes, except notes in a
  read-only folder. A note you delete goes to the system Trash, not straight
  off the disk.
- A skill's `name` and `description`, when you edit them in Settings →
  Skills: its frontmatter is written again holding those two fields, and the
  rest of its `SKILL.md` is left as it is. Any other frontmatter field the
  skill had is not kept. A skill you delete is moved to
  `<vault>/.trash/skills/`, never removed.
- Whatever Claude writes, within the safety mode you set. That is the CLI
  working in your folder, not Lanes.

Apart from that trash folder for skills, Lanes keeps nothing of its own in
the vault: no settings file, no index, no cache.

If you choose *Use the sample* at first launch, a copy of the sample vault is
made inside the folder you pick, as `Lanes Sample` (or `Lanes Sample 2`, and
on, if that name is taken) — never over anything already there.

In `~/.claude/projects/<vault folder>/`:

- A forked path is a new transcript file beside the one it forked from.
  Discarding a forked path moves its file to the system Trash.
- The CLI writes its own transcripts there as you talk; Lanes does not
  change them.

In `~/Library/Application Support/Lanes/` — Lanes' own folder, described
under *What is stored where*.

Anywhere you choose: a PDF you export, through the save panel.

Installing an update, only on *Restart now*, or on quitting while one is
ready that is known to be newer than the app (`src/main/update.ts`,
`build/swap.sh`): a copy of `swap.sh` in the system's temporary folder,
`lanes-swap-<process id>.sh`, which is left there; beside the app, a lock
file, `.Lanes-install.lock`, while the install runs, and a folder of the
install's own, `.Lanes-swap.<random>`, which the new bundle is copied into and
the old one moved into, and which is removed once the new one is in place —
so the app Lanes runs from is replaced; and a line in
`~/Library/Logs/lanes-update.log`. A folder left there by an install cut off
part way is removed by the next one, unless there is no app in place, when it
may hold the only copy.

## What it runs on your Mac

- `claude`, for every turn, title, model check and sign-in check above.
- Your login shell (`$SHELL -lc 'printf %s "$PATH"'`), to find `claude` the
  way a terminal would: a Mac app opened from the Finder does not get your
  terminal's `PATH`. Once per launch, and again on each *Check again* while
  no `claude` has been found. Setting `LANES_CLAUDE` to the binary's path
  skips this.
- `mdfind` and `open -t`, only from the right-click menu on a path.
- `/bin/bash` on its copy of `build/swap.sh`, detached so it outlives the app,
  with nothing of the app's environment but a `PATH` and your home folder,
  only on *Restart now* or on quitting with an update ready that is known to
  be newer. It waits for Lanes to be gone, and runs `ps`, `lockf` (which runs
  the script again, holding the lock), `PlistBuddy`, `codesign`, `mktemp`,
  `cp`, `xattr` and `mv`; then `open` to reopen Lanes after *Restart now*, and
  `osascript` for a notification if the install failed.

## Safety modes, and the one approval wider than it looks

A new install starts **Guarded**: Claude asks before it changes a file or
runs a command. **Standard** lets it edit files in the vault without asking;
commands still ask. **Autonomous** lets it do anything the CLI can, without
asking, and choosing it asks first: *Claude runs any command and edits any
file in this folder without asking.*

Headless Claude Code has no way to ask a question mid-turn, so in Guarded it
refuses the call and ends the turn, and Lanes asks you instead. Approving
cannot unlock exactly that one call — headless, the CLI has no per-call
grant — so Lanes re-runs the rest of that turn with the whole mode your yes
implied, and the approval row says so:

- approving a **file tool** (`Read`, `Write`, `Edit`, `NotebookEdit`) runs
  that one turn as Standard (`acceptEdits`);
- approving **anything else** — a shell command, a web fetch, an MCP tool —
  runs that one turn with `bypassPermissions`, which is Autonomous.

The grant ends when the turn does and the next request asks again. But for
that turn, Claude can do more than the one thing you approved.

## Redaction is display masking

Settings → Safety → *Redact secrets in transcripts* is on by default
(`redactSecrets`, `src/main/cli.ts`). While a turn streams in, the main
process replaces anything shaped like a credential in a tool row — the
command line and the tool's output — with dots before it reaches the window:
`sk-…`, `pk-…`, `rk-…` keys, GitHub and Slack tokens, `Bearer` tokens, JWTs,
and `api_key=`, `token:`, `password=` style assignments.

What it does not do:

- It does not touch what Claude or you write in the conversation itself.
- It does not mask a thread read back from disk — reopened later, or after a
  relaunch. Those tool rows show what the transcript holds.
- It does not change the transcript on disk, which the CLI wrote.
- It does not keep the value from Anthropic. The command and its output were
  part of the turn, and reached the model before they were masked for the
  screen.
- It does not catch a secret of any other shape.

It keeps a key off a screen somebody might be looking at. It is not a
security boundary.

## Scheduled prompts

A saved prompt can be given days and a time. **On a new install, schedules
are off until you switch them on** in Settings → Prompts (*Let prompts run by
themselves*), which says: *Runs happen while Lanes is open, even with its
window closed; quitting stops them.* On a Mac, closing the window does not
quit the app, so once schedules are on, a prompt can run — and send to
Anthropic, and spend your plan's usage — with no window open and nobody
watching. ⌘Q stops them all. A time missed while the Mac slept runs once
when it wakes, the same day.

Nobody is there to say yes to a scheduled run, so it is never Autonomous
unless that prompt was confirmed Autonomous on its own, in Settings →
Prompts. Otherwise it runs Standard at most, whatever the app-wide mode is.

## The right-click menu on a path

Right-click a path written in backticks, or a link to a file, and Lanes looks
for it before the menu opens, so the menu can say where it is
(`src/main/locate.ts`):

- It checks (`stat`) the path where it says it starts — `/…` from the root,
  `~/…` from your home folder — or else in the vault and the note's folder,
  and, for a path written with its head left out (`…/x`), in each folder the
  vault sits in, up to your home folder. These can be **outside the vault**.
- If that finds nothing, and the path does not start at `/` or `~`, it asks
  Spotlight for files by that name **under your home folder** (`mdfind
  -onlyin ~`), and keeps the ones whose path ends the way the written one
  does.

This happens on your click and on nothing else. It reads **metadata only** —
whether a file is there, whether it is a folder, its name and place — never
the contents, and nothing leaves the Mac. What it finds is listed in the
menu. *Open* opens documents and media in their own app, a folder in the
Finder, and a script as text; anything else — an app, an installer, a disk
image, a file of an unknown kind — is only shown in the Finder. Open and Show
in Finder accept only a path this lookup itself handed out.

## What is stored where

Everything Lanes keeps about you is in **`~/Library/Application
Support/Lanes/`**:

- **`lanes-state.json`** — the vault's path; your lanes (a name and a folder
  each), read-only folders and the folder new notes go to; your settings
  (safety mode, models, switches, skills switched off, theme, text size,
  layout); each thread's model and effort; starred notes and the folders you
  opened, by path; the tabs that were open, by which thread or note they
  showed (not their contents), and the threads you visited last; thread
  titles Lanes gave and lanes you assigned by hand; which note a thread was
  started on; how forked paths are related and what you named them; your
  saved prompts, with their words, schedules and safety, and each one's last
  scheduled run; and the last usage figures and context window sizes the CLI
  reported.
- **`lanes-index.json`** — the thread index, a cache: for each transcript,
  its title, when it started and when it last moved, how many messages, who
  spoke last, the vault paths it touched and the `[[links]]` it mentions; and
  the names of the vault's top-level folders. Delete it and the next launch
  rebuilds it.
- **`lanes-said.json`** — the search cache, for ⌘K: the text of every thread
  in the vault's folder — what you and Claude wrote, without tool output —
  lower-cased. **It is a second copy of your conversations' words**, beside
  the CLI's own. Delete it and the next launch rebuilds it in the background.
- The folders Electron's browser engine keeps there for any app: caches, GPU
  cache, local storage, preferences. Lanes' own code stores nothing in them.

macOS also keeps a small preferences file for the app,
`~/Library/Preferences/com.simonhoeher.lanes.plist`, with things the system
remembers for any app, such as the last folder an Open or Save panel showed.

If you turned on `npm run follow`, `build/follow.sh` keeps its own — the app
writes none of it:

- **`~/Library/Application Support/lanes-follow/`** — what it follows (the
  repository's path, the branch, the signing identity from
  `LANES_SIGN_IDENTITY` or `build/.sign-identity`, the folder `npm` is in),
  a copy of `follow.sh`, a clone of your repository, a few files of its own
  bookkeeping (a lock, the last commit that failed), and `ready.json`: the
  commit ready, where its bundle is, and the subjects and messages of the
  branch's latest forty commits.
- **`~/Library/Caches/lanes-follow/`** — the two newest builds.
- **`~/Library/Logs/lanes-follow.log`** — what each pass did.
- **A `reference-transaction` hook** in your repository's own hooks folder
  (`.git/hooks`), which starts a pass when the branch moves. Turned on from
  another clone, it first takes its hook out of the one it followed.

`npm run follow -- off`, run from your checkout, stops a pass that is running
and removes all of it: the hook, from the repository followed and from the
checkout it is run in; everything above in `lanes-follow/`; the builds; and
`lanes-follow.log` — and `~/Library/Logs/lanes-update.log` with them, which
only an update from it writes. The two `lanes-follow` folders go too, once
nothing else is in them.

## Uninstalling

Delete the app, and delete `~/Library/Application Support/Lanes/` (and, if
you want no trace, the preferences file above, and, if an update was ever
installed, `~/Library/Logs/lanes-update.log` and the copies of `swap.sh` left
in the temporary folder, `lanes-swap-*.sh` in `$TMPDIR`). That is all of
Lanes. If you turned on `npm run follow`, run `npm run follow -- off` from
your checkout first: it removes all that following made, as above.

Your notes are untouched, and so are Claude Code's transcripts in
`~/.claude/projects/` — including the forked paths Lanes wrote there, which
are ordinary Claude Code sessions and stay resumable from a terminal.
