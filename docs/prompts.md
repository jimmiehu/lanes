# Prompts

The prompts you send again and again, kept in Settings → Prompts and run from
⌘K; the vault's own skills, which sit beside them; and a prompt that runs by
itself on the days and at the time you give it — which is off until you switch
it on, and never more than Standard unless you said yes to that one prompt
being Autonomous. Back to the [README](../README.md).

## A prompt

A prompt is a **name** ⌘K finds it by and the **words** it sends, prose or a
line like `/garden-check`; its **model, effort, safety and lane** are DEFAULT
until set, and DEFAULT is left out of the record so it keeps meaning "the
app's own, when it runs". They live in the state file, per Mac, not in the
vault: only the app reads them, and a vault synced to two Macs would otherwise
carry one person's shortcuts into another's app.

What a run IS — its options, its title, its lane, its thread's settings — is
one function, `runOf` in `shared/prompts.ts`, over `startOptions` in
`shared/options.ts`, which is the composer's own option-building lifted out of
App so that main can build the same thing. Saving says what is wrong in words —
no name, a name starting with `/`, nothing to send, a name already kept (case
aside), and for a schedule no day, a time it cannot read, or a mode other than
Standard or Autonomous — rather than greying out. Esc in a prompt's field
leaves the field and nothing else, since Settings closes on esc and a
half-written prompt is words a stray key should not lose. **Delete asks
first**, with Keep the answer that loses nothing and Delete pressed again
closing the question rather than answering it; and since the state file has no
Trash, a delete can be taken back with **Undo**, to the place it stood, while
you are still on the page. `checks/prompts-settings.js`,
`prompts-palette.js`.

Choosing **Autonomous** for a prompt asks first, as it does app-wide, and says
what it allows: *Claude runs any command and edits any file in this folder
without asking. Every run of this prompt — a scheduled one too, with nobody
there.* Keep holds the focus, so ↵ or a second press of Autonomous closes the
question without allowing anything; *Allow Autonomous* is a click on its own
button. The yes is that prompt's own, and it is the one thing that lets a
scheduled run of it be Autonomous (below).

## In ⌘K

**They answer to `/`** — Claude Code's own convention for a command — and to
nothing else: after a leading slash the palette lists prompts alone, by name
(never by their words, which would match everything), and lights a PROMPTS
filter that is the same list for browsing. **↵ runs one**: a new thread in the
thread pane, sent at once through the composer's own transport, named for the
prompt and the day — `Standup · Wed 7 Oct`, so a routine's runs are told apart
by when they ran — with the prompt's model and effort written for that thread
and the thread filed in its lane. **⇧↵** leaves the words in a new thread's
composer instead, unsent, to change first. In ALL a prompt whose name you typed
is an offer, not an answer: it sits at the very foot, after the offers to make a
thread or a note, and is never where `↵` rests — a run spends a turn and may
write to the vault, and typing a note's name must still open the note.

Run by hand — from ⌘K, or *Run now* on its card — a prompt runs in its own
safety mode, or the app's when it sets none: somebody is there, and the thread
shows what it does.

**The vault's skills are rows too, with no setup.** Every skill in
`.claude/skills/` that is switched on is under the same `/` and the same PROMPTS
filter — `/garden-check`, badged SKILL, its description under it — below the
prompts somebody chose to keep, and an offer at the foot of ALL like them. `↵`
runs one the way a person runs it at the terminal: a new thread whose first
turn is `/garden-check`, which the CLI expands into the skill, named
`/garden-check · Wed 7 Oct`. It is filed in the lane the skill's own name
points at: a skill whose folder is named `<lane>-…` belongs to that lane, so
`garden-check` is Garden's, and a skill that names no lane serves all of them.
`⇧↵` leaves `/garden-check ` in the composer, with room after it for what to
tell it. A skill switched off in Settings is not a row at all, the same `deny`
that keeps it from a thread. `checks/palette-skills.js`.

## Running by itself

**Nothing runs by itself until you say so.** Settings → Prompts carries one
switch, *Let prompts run by themselves*, off on a new install, with the one
sentence that matters under it: *Runs happen while Lanes is open, even with its
window closed; quitting stops them.* While it is off a scheduled prompt's card
says `held — the switch above is off`, and nothing is run; switched on later
the same day, a slot already gone today runs then, as one missed asleep does.
For compatibility with state files from before 0.1.0, one that does not say
the switch either way but has a schedule on reads as switched on.

**A prompt can run by itself.** *Run it by itself*, in a prompt's editor,
gives it days and a time — the seven days as toggles, a time typed as `06:00`,
`6` or `6pm` — which its card then says as `WEEKDAYS 06:00` or `MON 08:40`,
without cron; twice a day is two prompts. It starts from the work days and from
**Standard**, and while a schedule is on, Guarded and DEFAULT are not offered at
all: nobody is there at 6:00 to say yes, and DEFAULT could become Guarded later
without the schedule knowing. Standard lets reads and edits through and stops
at the first thing beyond them that the vault's Claude Code permissions do not
allow; Autonomous runs it all, and a routine that reaches outside the vault —
mail, a calendar, a command — will want it.

**A scheduled run is Autonomous only if you said yes to that prompt.** Main
decides the mode a run goes in (`runSafety` in `shared/prompts.ts`), not the
window: on a schedule, Autonomous takes the yes said to that prompt in
particular, which only the question in Settings → Prompts records. A prompt set
to Autonomous without it — in a state file edited by hand, say — runs
Standard, and the prompt's editor says so; the app-wide Autonomous is never
inherited by a scheduled run. `checks/safety-default.mjs` holds the rule.

The scheduler lives in **main** (`main/scheduler.ts`), because at 6:00 there is
often no window: closing it does not quit the app on macOS, and main is what is
left. It looks every thirty seconds, at launch, when the Mac wakes, and the
moment a prompt is saved or the switch turned. What is owed is `dueSlot`'s to
say, in `shared/schedule.ts`: a **slot** — a day the schedule names, at its
time, in the Mac's own clock, known by its local date and time so the hour the
October clock change repeats is still one slot — runs at most once, and only on
its own date.
A Mac asleep at 6:00 runs it when it wakes, the same day; a slot missed on
Wednesday is not run on Thursday; a week away owes the day you are back its own
slot, not seven runs. Nothing before the schedule was set runs, either, so
saving a 06:00 schedule at 10:05 does not run it on the spot. A slot that comes
while the prompt's last run is still going waits for that run to end. Lanes not
running means no run — quitting stops it, closing the window does not.

A run is `runOf` again — exactly what ⌘K makes — sent through the one session
map every thread goes through, and its record is written **before** it is sent
and flushed, so a crash between the two cannot run it again on relaunch. It
lands as a **tab behind** the one you are reading, named `<prompt> · <day>`,
and takes the strip's unseen mark when the answer does; with no window, its tab
is made when the window next opens. Main alone writes the run records,
through one queue, and the window merges what main wrote rather than writing it
back. The card says how it went — `next tomorrow 06:00 · last today 06:00,
done in 2m 14s · open` — and a run that stopped on a refusal says what it
wanted a yes for and keeps its process, so the yes given in its tab carries the
run on rather than starting another. A quit ends that
process: at the next launch a run it cut off says `failed — stopped when Lanes
quit`, and one left waiting no longer offers a yes nothing would hear. A switch
on the card pauses a schedule without losing it; switching it back on asks the
same questions a save does. `checks/schedule.mjs` holds the slot arithmetic,
through the clock change; `schedule-live.js` a run end to end, from the save to
the tab behind; `safety-default.mjs` the switch's default and the Autonomous
rule.
