# Safety

What Claude may do in your folder without asking, in each of the three modes;
how Lanes asks on the CLI's behalf, and exactly what a yes allows; what a
prompt running by itself may do with nobody there; what a link or a file in a
note or a thread may open; and what leaves your Mac. Back to the
[README](../README.md).

## The three modes

Lanes runs the `claude` you already have, and the mode is the CLI's own
permission mode, chosen in Settings → Safety:

| Mode | In plain words | The CLI's mode |
|---|---|---|
| **Guarded** | Nothing runs without a yes: every write, command and external call asks first. | `manual` |
| **Standard** | Reads and edits run freely; a shell command, or anything else the CLI does not let through on its own, asks. | `acceptEdits` |
| **Autonomous** | Claude runs any command and edits any file in this folder without asking. | `bypassPermissions` |

**A new install starts Guarded.** A state file that already says a mode is
read as it says, so updating never changes the mode you chose. The mode is a
flag on the CLI process, so a change reaches a thread the next time you send
in it between turns: its process is started again with the new flag before
the message goes.

**Choosing Autonomous asks first.** The choice opens a question under it that
says what it allows — *Claude runs any command and edits any file in this
folder without asking* — and to whom: *Every chat, and any prompt run by hand
that sets none of its own. A scheduled run never inherits it.* It is built so
it cannot be answered by accident: the answer that loses nothing — *Keep
Guarded*, or whichever mode you had — holds the focus, so `↵` or space
straight after the click keeps what you had; pressing Autonomous again closes
the question; `esc` closes the question and not Settings; and yes is a click
on its own button, *Allow Autonomous* — never a key you might already be
pressing. Going back from Autonomous asks nothing. `checks/autonomous-ask.js`
holds it.

Two switches narrow any mode further. *Allow shell commands*, off, denies the
shell tool by name (`--disallowedTools Bash`); every other tool still goes by
the mode. A skill switched off in Settings → Skills is denied the same way,
by name (`Skill(<its folder>)`), to every thread and every run.

## How Guarded asks

Headless Claude Code has no channel to ask a permission question on. In
`--permission-mode manual` it does not ask and wait — it *refuses* the call,
reports `system/permission_denied` naming the tool and the call, and ends the
turn. So Lanes asks on its behalf: the refusal becomes an approval row above
the composer naming the tool and the real target — the command as it would
run, the file it would write. The same happens in Standard for anything
`acceptEdits` does not cover.

## The approval

**Deny** sends Claude *No — do not run that. Carry on without it.* (*do*
rather than *run*, for a tool that is not a shell command), and Claude
carries on without the call, in a new turn.

**Approve** is coarser than one call, and says so on the row: *Approving
allows commands for the rest of this turn, not just this one*, or *edits*
for a file tool. The CLI has no per-call grant in headless mode, so a yes
starts the CLI again in the whole mode the yes implied and tells Claude to
go ahead:

- approving a **file** tool — `Read`, `Write`, `Edit`, `NotebookEdit` — runs
  the rest of that turn in `acceptEdits`, the Standard mode;
- approving **anything else** — a shell command, a web fetch, a tool from an
  MCP server — runs the rest of that turn with **`bypassPermissions`**.

So approving one refused shell command in Guarded runs **that one turn
unguarded**: until the turn lands, Claude may run any command and edit any
file in the folder without asking, not only the one you said yes to. The
grant is dropped the moment the turn lands — that process is ended, and the
next message starts one in the thread's own mode — and the next request asks
again rather than inheriting it. If that is more than you want for a
particular call, deny it and say in the thread what Claude may do instead.

## Prompts that run by themselves

A saved prompt can run on a schedule, with nobody there to say yes, so it is
held to more than a prompt run by hand. The details are in
[Prompts](prompts.md#running-by-itself); the rules are these:

- **Off on a new install until you switch it on**, in Settings → Prompts →
  *Let prompts run by themselves*: *Runs happen while Lanes is open, even
  with its window closed; quitting stops them.*
- **Never Guarded or DEFAULT on a schedule.** Guarded would stop at the first
  call with nobody to answer it, and DEFAULT could become Guarded later
  without the schedule knowing; a schedule is saved as Standard or
  Autonomous.
- **Autonomous only for a prompt you said yes to.** Choosing Autonomous for a
  prompt asks the same question, naming *Every run of this prompt — a
  scheduled one too, with nobody there*, and the yes is kept on that prompt.
  Main checks it when a scheduled run starts (`runSafety`), so a prompt that
  is Autonomous any other way — set by hand in the state file, say — runs
  Standard, and the app-wide Autonomous never reaches a scheduled run.
  `checks/safety-default.mjs` holds the rule.
- A scheduled run that stops on a refusal waits for your yes in its tab, for
  as long as Lanes is running, and a yes there carries the same coarse grant
  as any other approval.

## Redaction

Anything token-shaped — `sk-…`, `ghp_…`, `xox…`, a bearer token, a JWT, a
`token=` or `password:` assignment — is masked in a tool row and its output
as a turn streams in, before it reaches the screen. It is done in the main
process (`src/main/cli.ts`), before the tool row is sent to the window. It is
**display masking, not a security boundary**: the model saw what the tool
returned, and the transcript on disk is the CLI's, untouched. And it covers
the live turn only: a thread read back from its transcript — after a
relaunch, or a session run from a terminal — shows its tool rows as the
transcript has them, unmasked. A key in a grep result is still a key worth
not showing on screen, whatever the surrounding text called it.

## Links and files

A note may be anybody's text, and a thread is Claude's, so what a link in
either may do is decided in one place (`src/main/open.ts`), by a rule short
enough to read:

- `https:`, `http:` and `mailto:` go to the browser or the mail app;
- `file:`, with any number of slashes, is a place on this Mac: a note in the
  vault opens as a note, in Lanes; anything else is shown in the Finder if it
  is there, and never opened;
- anything else — `javascript:`, a settings pane's `x-apple-…:` scheme, an
  app's own scheme — is refused, and nothing opens.

The window itself cannot be navigated away from its own page, opens no second
window, and is granted no permission but writing to the clipboard, which the
copy buttons need. A path in backticks offers *Open* only for documents and
media — anything else, an app or an installer or a script, is shown in the
Finder or opened as text, never run (see
[A path written in backticks](threads.md#a-path-written-in-backticks)). How
the window is held to this is in [How it works](architecture.md#hardening).

**Read-only folders bind Lanes, not Claude.** A note in a folder named
read-only in Settings → Notes & lanes cannot be written, renamed, moved or
trashed from the app, and no note is made in one, but Claude's own edits go
through the CLI, and what it may change there is this page's question: the
mode, and your answers.

## What leaves your Mac

**Lanes makes no network calls of its own.** There is no account, no
telemetry, no update check and no crash reporter; `checks/no-network.mjs`
scans the source for network modules and APIs and holds the page's content
security policy to its line. **The CLI Lanes drives does** — to Anthropic,
under your own account and terms: everything you send in a thread, and every
file Claude reads to answer it.

Three things Lanes asks of the CLI on its own, each worth knowing:

- **A thread's name.** When the CLI has not named a thread, the first
  exchange's excerpt — up to 600 characters of your message and of the reply
  — is sent to Haiku through the CLI, from the system's temporary folder
  rather than the vault, with the shell, file, search, web, agent and skill
  tools denied by name and no MCP server loaded (`src/main/title.ts`).
- **A model you add** is checked with a one-line question to that model, the
  same way (`src/main/models.ts`).
- **Whether you are signed in** is asked at launch with `claude auth status`,
  which spends no tokens — and again when you press *Check again* on the note
  that says no `claude` was found.

Two things Lanes does on this Mac that reach past the vault, on your click
only:

- **The right-click menu on a path** may look up paths outside the vault —
  under `/` or your home folder when the path says so, and, for a path
  written with its head left out (`…/x`), in the folders the vault sits in up
  to your home folder — and, when none of that finds it, may run a Spotlight
  query (`mdfind`) for that file name under your home folder. It reads
  metadata, never contents, and sends nothing anywhere.
- **Show in Finder** and **Open** hand a file to the Finder or to its own app,
  under the rules above.

**What Lanes reads and writes.** It reads the vault, the vault's
`.claude/skills/`, and the CLI's transcripts for that folder,
`~/.claude/projects/<the folder's path, dashed>/*.jsonl` — every session ever
run there, including ones started from a terminal. It writes notes in the
vault; a forked thread as a new transcript beside the others; a deleted skill
to the vault's `.trash/skills/`; a trashed note or path to the system Trash,
never deleted outright. Its own state lives in
`~/Library/Application Support/Lanes/` — `lanes-state.json` (tabs, stars,
titles, lanes, prompts and their runs, the last usage figures), and two caches
it can rebuild, `lanes-index.json` and `lanes-said.json`. To uninstall, delete
the app and that folder; your notes and your Claude Code sessions are
untouched.
