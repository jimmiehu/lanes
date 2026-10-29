# Settings

What can be set, and where: the small panel ⌘, opens; the full Settings
behind it — the folder Lanes works in and the lanes you file threads into,
models, safety, skills, prompts and the interface; and the theme, which is
flipped from the top bar rather than kept in the panel. Safety and prompts have
pages of their own: [Safety](safety.md), [Prompts](prompts.md). Back to the
[README](../README.md).

## The panel

⌘, opens a 290px panel, not a modal: three toggles, the highlight colour and
the keyboard map, which is what most days need.

- **Lane in the head** — show which lane or folder the open thing belongs to.
- **Keep the browser open** — otherwise the rail hides again once you pick.
- **Wide measure** — a longer line, for tables and dense notes.
- **Highlight** — the colour `==highlights==` are drawn in: yellow, green,
  blue, pink, purple or grey, each with its own value in the dark.

Everything that changes what the app works on, or how the CLI actually runs,
is one row further in — the panel's *Models, safety, skills and prompts →* —
on six pages: **Notes & lanes**, **Models**, **Safety**, **Skills**,
**Prompts** and **Interface**. Those are settings you set once; the ones above
are the ones you reach for.

A switch is there to change real behaviour. A control that only looks like a
setting is worse than no control. A "confirm before writing files" switch was
considered and left out because it would promise a diff before every write,
and the CLI has no way to show one. One switch falls short of that today; see
Interface, below.

## Notes & lanes

**The folder.** Lanes works in one folder of markdown notes — the vault — and
every thread is a Claude Code session started in it, so the threads you see are
the sessions the CLI has kept for that folder
(`~/.claude/projects/<the folder's path, dashed>/`), including any you ran from
a terminal there. The folder is chosen at first launch, in a dialog that says
what Lanes is and *No account, no cloud, no tracking. Your notes stay in your
folder.*, with three answers: **Choose a folder…**, **Use the sample** and
**Quit**. The sample is copied into a folder you pick, as `Lanes Sample` —
`Lanes Sample 2` when that is taken, never over anything — and, into a state
file with no lanes and no read-only folders of its own, brings its own setup:
the lanes Garden and Kitchen, and `inbox/` read only. The same dialog comes
back at launch, naming the folder, if the folder has gone. The **Vault** row
here shows the folder; *Change…* picks another with the system's folder
picker, and Lanes relaunches in it; nothing in the old folder is touched.
While a turn is running anywhere, *Change…* asks first, since the relaunch
stops it: *A turn is running.*, with *Keep working* the default and *Switch
and stop it* a click of its own. `checks/vault-chooser.mjs`,
`vault-change.js`.

**Lanes** are what you are working on, and they are yours: there are none
until you make one, or take the sample's two. A lane is a **name** and a
**folder** of the vault — `projects/garden`, `Clients/Acme`, `essays` — and
nothing else; no folder name means anything to the app on its own. With lanes:

- **A thread is filed in the lane whose folder holds the notes it worked on.**
  The touched-notes index (see [How it
  works](architecture.md#the-touched-notes-index)) knows which vault files each
  thread read, wrote, edited or named in a shell command, weighted so that
  writing a note counts for more than grepping past it; the lane those weights
  point at is the thread's. A path is in a lane when it sits under the lane's
  folder, at a folder boundary and case aside, and when lanes nest the **deepest
  folder wins**: `projects/garden/beds.md` is Garden's even with a lane on
  `projects` as well. A thread that worked on nothing inside any lane is in
  none, and the rail's Lanes mode shows it under UNATTACHED.
  `src/shared/lanes.ts` is the one rule, asked by main and by the window alike;
  `checks/lane-detect.mjs` holds it.
- **A skill belongs to the lane its folder's name starts with**, the lane's
  name lower-cased and hyphenated: `garden-check` is Garden's, and a run of it
  is filed there. A skill that names no lane serves all of them.
- **You can overrule it.** Right-click a thread and pick a lane under *Move to
  lane*. A thread started on a note is filed in the note's lane, and a prompt
  with a lane of its own files its runs there.

The lanes editor lists them as `name · folder`, in the rail's order. **Add
lane** takes a name and a folder picked from the vault's top-level folders and
the ones a level down; a name or a folder another lane has is refused. A lane
is renamed in place, and ↑ and ↓ reorder them, the rail following. A lane's id
— its name's slug and four random characters — is made once and never
changes, so a rename keeps every thread and override filed under it. × asks
first and says what it costs — *3 threads are filed in Garden; they become
unassigned.* — with Keep the default; the folder and its notes stay as they
are, and a thread moved into the lane by hand keeps its move on file, ignored
while the lane is gone. With no lanes, the editor offers one per top-level
folder — not a hidden one, not `_templates`, not one kept read only — and
*Use these* makes them all. Lanes are kept in the state file as
`lanes: [{ "id", "name", "folder" }]`. **Notes shown per lane**, there while
there are lanes, sets how many threads a lane's band in the rail shows before
its `N more` row: 8 to start, from 2 to 24, and the thread you are on is shown
whatever it says. With no lanes, the rail has no Lanes mode, the palette's
thread rows name no lane and the menus have no *Move to lane*.
`checks/lanes-crud.js`, `lanes-none.js`.

**Read-only folders**, one per line, none by default; a folder is matched the
way a lane's is, at a folder boundary and case aside. A note under one opens in
READ with no switch to WRITE, saying *read only — its folder is kept read only
(Settings → Notes & lanes)*, and main refuses to write it, rename it, move it
in or out, put it in the Trash or make a new note there; a rename elsewhere
leaves the links in it alone. It takes hold at once, with nothing to relaunch.
It binds Lanes, not Claude: a session's own edits are the CLI's, and what
Claude may change is the safety mode's question. `checks/read-only-rule.mjs`,
`settings-folders.js`.

**New notes go to** one folder, made if it is not there yet — the vault root
while the field is empty, as its placeholder says, and the root as well when
the folder named is kept read only. A name typed into ⌘K as `folder/name`
still overrides it. `checks/new-note-folder.js`.

**Wrap when stepping the vault**, on to start: ⌥↓ on the rail's last row goes
back to the first, and ⌥↑ on the first to the last. Off, the ends are ends.

**`_templates/`** at the vault's root is a convention rather than a setting:
the touched-notes index leaves it out of a thread's linked notes and out of
"related", since a skeleton two threads filled in is not shared work.

## Models

Two controls on one row. **The dot** picks whether the composer offers that
model at all — a picker with everything in it is a picker you read every time —
and **the row** picks which model a new thread starts on. The default cannot be
put away, since the composer has to be able to name what a thread is running,
and a thread already set to a model keeps it offered even when it is hidden, for
the same reason. The hidden set is stored as `modelsOff`, off-by-exception like
`skillsOff`, so a model added later is offered rather than silently kept out.

**Adding one takes an id and gives back a verdict.** The id is what goes to
`--model` — an alias like `opus`, or a full model id — and it is checked
against the CLI before it is added — the smallest possible question, from a
temporary folder, with the file, shell and web tools denied — so an id it
cannot serve is refused on the spot, in the
CLI's own words, rather than at the moment you press send. The label beside it
is optional and cosmetic, and never sent anywhere; the row's second column
shows the id, because that is the fact worth having. A window can be given
too, in thousands (`200k` when left empty): the size the context meter
measures a thread on that model against, until the CLI has said the real one
at the end of a turn. A model added here is offered in the composer's picker
like the built-in ones, not only as the default. `checks/models.js` holds it.

**Default effort** — LOW, MID, HIGH, XHIGH or MAX, MID to start — is the
effort a new thread starts on.

## Safety, Skills, Interface

**Safety** holds the mode — Guarded, Standard or Autonomous; Guarded on a new
install, and Autonomous asks before it is chosen — and three switches, all on
to start: *Allow shell commands* (off denies the shell outright, leaving reads
and edits), *Redact secrets in transcripts* (anything shaped like a key or a
token in a tool call is masked before it reaches the screen) and *Keep tool
call history* (off hides the tool rows in a thread; the CLI's own transcript
keeps them). What each mode lets Claude do is on its own page,
[Safety](safety.md).

**Skills** lists the vault's own `.claude/skills/`, read from the files
themselves rather than kept as a copy — at launch, and again after an edit or a
delete here. Each can be switched off (it is then denied to every thread and
run, and is not a row in ⌘K), its name and description edited — the two
frontmatter fields the app owns, the instructions under them untouched — or
deleted, which asks first and moves its folder to the vault's `.trash/skills/`
rather than erasing it. With lanes, each row says whose it is: its lane, or
ALL.

**Interface** holds the theme — LIGHT, DARK or AUTO, the same three the top
bar cycles — and the text size — Small, Default, Large, Larger, also `⌘+` /
`⌘−` / `⌘0` — which sizes message and note text and leaves the controls where
they are. Then three switches: the context meter, *Lift the selected pane*,
and *Show keyboard hints*, which changes nothing today: the shortcut line along
the bottom it names is no longer drawn, and nothing reads the switch.

**Updates** have no setting. The *Update ready* line at the foot of the rail
appears only while `npm run follow` has a build of your checkout ready, of a
commit other than the app's own, and `npm run follow -- off` is how it is
turned off (see the [README](../README.md#install-from-source)).

## Theming

`:root` is the light palette and dark is the override, which inverts only the
ground: the desk stays the darkest surface, sheets sit above it, and `--ink`
flips so a filled ink shape is still the loudest thing on the pane.

**Appearance has three states**, cycled from the top bar: light, dark, and
`auto`, which a new install starts on. Auto is a real third state rather than
a checkbox — it defers to the system instead of storing a value, and it
subscribes to `prefers-color-scheme` so the system flipping at dusk actually
reaches the document. What is STORED is the preference; `data-theme` on the
root is only ever the resolved value, because a document cannot wear "auto".

A `prefers-color-scheme` block scoped to `:root:not([data-theme])` covers the
frames before the state file loads, so a dark-system user gets no white flash.

Appearance is deliberately **not** in the ⌘, panel. It is a view state you flip
while working, not a preference you go and configure, so it lives in the top
bar; Settings → Interface has the same three for anyone who looks there.

### The palette is achromatic, and where it is not

There are no accents and no lane hues. Identity is carried by uppercase mono
labels and by contrast — `active` is 600 ink, `blocked` sits mid, `done`
recedes; a failed tool row says so by weight. Two families only, both system
stacks, and no serif: a serif note body was tried in the design and rejected
because the type change read as a different app rather than a different
object.

There are exceptions to the ramp, and it is worth stating the rule that lets
each in rather than treating any as a lapse. **A find match is not part of the
document.** It is a transient answer to a question you just asked: it appears
as you type, it is gone on `esc`, and it belongs to nothing on the page.
Contrast alone cannot carry that. A grey wash sits on the same warm ramp as a
code block, a quote, a hover and a selected row, so on a dense transcript you
would be hunting a slightly different grey among six of them. A hue has no
rank in that ramp and cannot be mistaken for one, which is exactly what a mark
needs.

Amber rather than anything else, because it is the warm paper's own family: it
reads as a highlighter laid on the page rather than as an alert. It lives in
four tokens — `--find` / `--onFind` for every match, `--findNow` / `--onFindNow`
for the current one — with the wash going dark-amber in the dark theme so the
light body text still reads through it.

**The second is the session clock's ring**: orange from 70% of the window, red
from 90%, in `--warn` and `--alarm` — and the card's SESSION and WEEK figures
at the same thresholds. The same argument lets it in. It is not the document
either: it is a fact about the usage window, said in the top bar, and gone at
the next reset, and on the ramp it would be one more grey among the chips
beside it. Both are kept well clear of the amber, orange leaning towards red,
so a ring running low is never read as a search hit. They were chosen beside
the find marks in both themes rather than on their own, and in light they are
dark enough to read as text on a sheet.

**The third is a `==highlight==`, and it is yours.** It is a mark you put on
your own words, the way a highlighter is, in the colour you picked in the
panel. Its yellow is lemon rather than find's amber, so a find hit inside a
highlight still reads as one.

Nothing else gets one. A lane, a state, a role, a tool failure and every other
warning are facts *about* the document, and they stay on the ramp.
