# Threads

A thread is a Claude Code session whose working directory is your vault, read
from the transcripts the CLI writes. This covers where threads (and notes) are
listed, how the two panes and their tabs behave, what becomes of a link or a
path Claude writes, forks, tool rows, and the two clocks a session runs
against: the usage window and its limit. Back to the [README](../README.md).

## The rail

One 250px column, two stacked cards with the desk showing between them — not
one card with a seam, because what you keep and what there is are different
questions.

**Starred** holds threads and notes in one store, in two labelled sections. A
star belongs to the OBJECT; a pin belongs to a TAB. They are different concepts
and they use different words, because the labels are the only place anyone
meets them.

**The browser** below it takes whichever of three shapes the question wants:

| Mode | Answers |
|---|---|
| `Recent` | What moved — threads and notes in separate sections |
| `Lanes` | What am I working on — threads only, grouped by lane |
| `Folders` | Where does it live — the real tree, to full depth |

Recent is deliberately **not** interleaved. The two kinds open in different
panes, so mixing them in one list only asks you to sort them again by eye.

Lanes is threads only: a lane's notes reach you through the thread that carries
them. The lanes are yours — a name and a vault folder each, none until you
make some or take the sample vault's two (see
[Settings → Notes & lanes](settings.md#notes--lanes)). With none there is
nothing to group by, and the mode is not offered. The bands come in the order
Settings lists the lanes, and after them the **UNATTACHED** band, for the
threads in no lane. A thread is in the lane whose folder holds most of what it
worked on — a write counting for more than a read — or the one you moved it to
from its row's menu, so a question with no files, a session about the whole
vault, lands in UNATTACHED. Lane bands
are open unless you collapse one; folders are closed unless you open one — the
opposite senses on purpose, since a vault has a handful of lanes and hundreds
or thousands of notes.

Folder open-state is keyed by **full path**: a leaf called `notes` repeats under
different parents, and a bare-name key would open every one of them at once.
Top-level folders are ordered by `byFolder` (`src/renderer/src/lib/format.ts`)
— numeric-prefixed first, `_`-prefixed as a sink; the folders under them sort
plainly, notes at the vault root come after every folder, and leaves sort by
title.

Every list is capped and every cap has a visible way past it. Recent shows what
was touched today, and never fewer than seven of each kind; a lane shows as
many threads as *Notes shown per lane* says (Settings → Notes & lanes, 8 unless
changed), the one you are looking at always among them; a folder shows 40
leaves. Past a cap there is an `N more` row — in a folder,
`N more here — ⌘K finds them`. Recent's folds back (*Show less*) as well as
out; a lane's or a folder's opens the rest. **Narrowing opens groups but lifts
no lane's or folder's cap** — lifting them would render the whole vault
synchronously on the first keystroke. Recent's fold is the exception, since it
only hides what is older than today, and a query that matched something older
would otherwise have no way to show it. While a filter is running the footer
reports a ratio rather than the vault's totals, because a footer that keeps
saying the vault's total while the list shows nine is the one thing on screen
claiming you can see everything.

The rail carries a filter. It matches thread titles, and note titles and paths;
⌘K is the one that reads the text of every note. Collapsed, the rail is an 11px
strip holding three dots — still an object on the desk rather than nothing.

**It is redrawn only when what it shows has changed.** The rail is the most
expensive thing in the window to draw — a vault's worth of rows, sorted and
banded — and drawn on every render of the app it would be redrawn on every
keystroke in the composer, every save of a note, the opening of a note it has
nothing to do with: measured over 1,500 notes, 45–60ms a time, three times over
for a single ⌘N. So it is compared on its DATA and not on its callbacks: the app
hands it fresh closures on every render, which would defeat any memo, and a
signature of the state those closures read stands in for them, so a callback
can never go stale behind a rail that did not redraw. What it shows is
deferred as well — when the window is busy it takes those values a render
later, so a note opening is drawn first and the row that bolds for it a moment
after.

## Panes and tabs

`openIn(pane, kind, id, { newTab })` is the single entry point for every open —
rail rows, palette results, wikilinks, backlinks, the empty state's own rows.
**The pane argument is advisory and deliberately ignored**: the target is
`paneFor(kind)` — threads left, notes right. Opening a note also forces the
split on, because a note has nowhere to go in a single pane.

- **Whatever is in front is loaded**, however it got there. A restored tab
  carries its title and nothing else; its transcript or its note is read when it
  reaches the front. Six things move the selection — closing a tab, closing
  the others, trashing a note out from under one, quoting into a chat, opening
  something already open, and the click — and loading at the click alone left
  an unread tab in front of you after the other five (a note in it saying
  `opening…`) until you clicked away and back. So it is an effect watching the
  front tab of each pane rather than a line at each call site, and it is true
  for whatever moves the selection next.
- A plain click **reuses** the current tab and pushes history; ⌘-click, ⌘T and
  the palette's `⌘↵` **add** one. That holds **inside a note** too: a wikilink
  in READ's body and a LINKED FROM row in the head's details both take ⌘,
  which is where it matters most — following a link out of a note is how you
  leave something you were in the middle of, and it should not replace the note
  you were reading when the link's own tooltip promises otherwise. In WRITE a
  plain click is a caret, so ⌘-click is the only way to follow a link there,
  and it too opens a tab of its own: following out of a note you are writing
  never takes it off the screen. A note already in the strip is selected
  rather than opened twice.
- **A link to a note opens the note, however it was written.** Claude writes
  the notes it touched as markdown links as often as it writes `[[…]]` —
  `[beds.md](projects/garden/beds.md)` — and drawn as a web link, a relative
  address resolves against the app's own page, so a click opens a file that is
  not there and nothing at all happens. So a markdown link whose address is a
  path rather than a web address is the vault's: to a `.md` file it is a link
  to that note, drawn, followed and ⌘-clicked like a wikilink, in a thread, in
  READ and in WRITE; to any other file it shows the file in the Finder — what
  it is and where, with nothing run. `https:`, `http:` and `mailto:` go to the
  browser or the mail app, and any other scheme is refused (see
  [Safety](safety.md#links-and-files)). See `fileAddress` in
  `src/shared/blocks.ts`. And in a thread a **bare file name** is a link when
  exactly one note has it: Claude lists what it wrote under a folder it has
  named already — *Files are in projects/garden and daily:* and then
  `spring-beds-plan-2026-10-06.md` on a line of its own — and a name with no
  folder in it would otherwise be words. A name several notes share (a vault
  often has more than one `README.md`) is not guessed between, and stays
  words; so does a name no note has. And a **path to any file in the vault** is
  a link that shows the file where it is, selected in its folder in the Finder
  — Claude ends a turn on the file it made,
  `File: projects/garden/seed-order-2026-10-06.xlsx`. A path is the vault's
  when its first folder is one of the vault's own top-level folders (one that
  holds notes), which is what tells `projects/…` from an address written
  without its scheme, `example.com/blog/x.html`; nothing is opened in another
  app and nothing is run, and a file that is not there says so. Threads only:
  in a note the editor has to draw what READ draws, and it draws no such link
  (`threadLinks` in `src/renderer/src/components/Runs.tsx`).
- **A link that leads nowhere says so.** A note since moved or trashed, a
  `[[name]]` no note answers to from a thread, a file that is not there: a
  click that did nothing would look exactly like a click that missed, and you
  would click again. So the link answers where it stands — *not in the vault*,
  for a moment, under it, moving nothing in the line — and nothing is opened
  or made. A `[[name]]` with no note followed from a NOTE still makes the note,
  as it always has; a markdown link's address is a path to a file, not a name,
  and makes nothing. `checks/thread-links.js` holds both, against a thread laid
  down by `checks/thread-fixture.mjs` rather than one a turn was spent on.
- **An answer that landed while you were elsewhere** marks its tab. Running
  several threads at once is what this app is for, so most answers finish where
  you are not — behind another tab, in the pane the split is hiding, or with the
  whole window in the background. The tab's own dot says so, and it is the
  same 6px dot, not a badge beside it:
  quiet for nothing to report, blinking mid-turn, **ink with a soft ring** for an
  answer you have not been back to, ink for the tab you are on. Arriving at the
  tab is what clears it — by any route, since the rule watches the answer to
  "what is on screen" rather than the eight ways of changing it. Window focus
  counts: an answer that lands while the app is behind another one has not been
  seen even if its tab was already in front, which is most of when this matters.
- **The seam between the panes** is dragged to re-share the split. A drag ends on
  the pointer's own button state, not on hearing a `pointerup`: release outside
  the window, let a gesture take the pointer, lose the capture to a re-render,
  and an "am I dragging" flag waiting for that event is set for good — after
  which merely moving the mouse ACROSS the seam re-lays both panes out on
  every move, with a state write behind each one: an app that seems to resize
  its panes by itself. `pointercancel` and `lostpointercapture` end it too,
  the moves are coalesced to one a frame, and only the release goes to disk.
  Each pane keeps between 20% and 80% of the split, and a double-click evens
  it. The composer's grip works the same way; `checks/seam.js` holds both to
  it.
- Twelve tabs per pane. Past that, the first **unpinned** tab in the strip
  other than the one just opened is closed — a pinned tab is the one thing you
  asked to keep. Twelve is a budget, not a layout; see
  [A full strip keeps its titles](#a-full-strip-keeps-its-titles).
- **⌘T in the note pane opens a blank tab** (in the thread pane it is a new
  thread): the same empty surface an empty note pane shows, under the tab
  strip — *New note*, *Search everything*, the counted chip, and four starred
  or recent notes. A note is a file and which file is the question, so the
  answer is the surface that offers all of them. Whatever you pick **replaces
  it in place**, keeping the tab's key, exactly as a browser's new-tab page
  does — *New note* included, which makes an untitled note there, as ⌘N would.
- A pane may close to empty. Its empty state is a real destination: a
  **ghost** of the missing document
  drawn from the document's own parts (a page for the note pane, a transcript —
  bubble, label rule, inset lines — for the thread pane), a kicker / headline /
  line of guidance where "always open here" teaches the pane's role, a `Search
  everything ⌘K` chip plus **the one thing actually waiting** counted live —
  `N waiting on you` / `N open tasks`, opening the palette pre-filtered to
  Waiting or Tasks, omitted entirely at zero — and four starred-or-recent rows.
- **Selection is elevation**: the focused pane casts a shadow (`--shpOn` —
  rim, contact, one wide cast) and the other seats into the desk (`--shpOff`,
  an inset tint, so the two states share one property and crossfade). A single
  pane is always lifted. The two themes lean on opposite halves — the cast does
  the work in light, the rim in dark. *Lift the selected pane* in Settings →
  Interface turns it off, restoring the thin focus ring.
- History is per **tab**, keyed by tab identity so splicing one cannot hand its
  stack to a neighbour, and holds 25 steps. Notes have it too: a link followed
  out of a note in place is a step, and ⌘[ and ⌘] (or the head's arrows) walk
  it, as they do a thread's.

**A two-finger swipe** opens and closes the browser rail: right pulls it in from
the left edge, left pushes it back out. It arrives as a horizontal `wheel`, so
the whole job is telling it apart from the scrolling it looks exactly like —
anything under the pointer that can still scroll sideways keeps the gesture (the
tab strip, a wide table), a mostly-vertical scroll is left alone
since trackpads leak a little sideways into every one, and a latch closes after
each toggle so one swipe is one toggle.

**A note is a file**, and the three things you do to files are all here. Its tab
and its rail row both offer *Rename…*, which opens the same field a thread's
does — and underneath renames the file, rewrites its `# heading`, and follows
every `[[wikilink]]` aimed at it, keeping the shape each one was written in (a
bare name stays a bare name, a path stays a path, `#heading` and `|alias` ride
along). The **place in the head is the control for moving it**: the folder is
the fact and the fact is the button, and it opens a picker over the vault's own
folders with a new one a keystroke away; the rail row's *Move to…* opens the
same picker. The rail row's menu ends with *Move to Trash* — the system Trash,
recoverable in the Finder, which is why it needs no modal of its own. A rename
or a move keeps the open tabs, the cache, the stars and the attachments pointed
at the note wherever it went. A note in a read-only folder is refused all
three, and the picker does not offer a read-only folder to move into.

A thread's name is a **title override** — what a rename writes and what the
namer writes — and every path that builds a tab reads it, the transcript's own
title being only the CLI's first-line fallback until something better exists.
Without that, reopening a renamed thread, or merely landing on a tab restored
from the last session, would rebuild the tab from the transcript and throw the
name away: the rail would keep it and the tab lose it.

### How a thread gets its name

Three things can name one, in this order. A **rename** you typed. The **CLI's
own name** — a rename made in the CLI, or the name it chose, which it writes
into the transcript a few seconds after the turn it was named by. And failing
both, **Haiku**, from the exchange that opened the thread — the fallback for a
thread the CLI never got to name, because its first turn was interrupted or
quit through. With none of them, a thread goes by the first line of its
opening message, cut at sixty characters.

A tab's name follows its thread wherever it comes from. That sounds obvious,
but the rail and the tab read different things: a name arriving after the tab
was made has to reach the strip as well as the row, or the tab keeps the
opening line of the message that started it for the life of the app.

The namer reads what was said, tool rows left out — not a reply's `text`,
which is a message's LEAD paragraph and only while it leads: the moment a turn
opens with a tool call — a skill, a file read, a search, which is how most
real work begins — the prose lands in `blocks` and `text` stays empty for the
whole message. And it releases its hold when a call comes back empty, so a
name that fails once is tried again rather than given up on until the next
launch.

Haiku is asked through the CLI, not an API of Lanes' own: the first
exchange's excerpt — up to 600 characters of each side — is sent from the
system's temporary folder rather than the vault, with the file, shell, web,
agent and skill tools denied by name and no MCP server loaded, so a title
generator cannot read or edit a note
(`src/main/title.ts`). See [Safety](safety.md#what-leaves-your-mac).

The rename field does **not** commit on the blur that opens it: a rename starts
from a click, and the tail of that same click lands on whatever is underneath a
moment later — clicking anything that cannot hold focus moves focus to the body,
which blurred the field the instant it appeared, committed the title unchanged
and closed again. Renaming then looked like it did nothing at all. A blur inside
the opening window is that tail and never a decision; after it, clicking away
commits as it always did.

**Right-click a tab** for *Rename…*, *Pin tab*, *Star this thread* (or *note*),
*Show in Finder* (notes only — a thread is a transcript in the CLI's store, not
a file you keep), *Close* and, with more than one tab, *Close others*, which
leaves pinned tabs where they are. Rename opens the field in the pane head, so
a right-click on a tab you are not in selects it first; on a note it renames
the file, as above.

The **underline is the only active mark**, so pinned and loose tabs never
disagree about what "current" means. Pinned tabs collect at the left and
collapse to a two-character mono monogram, which is enough to tell your own
parked tabs apart and holds the strip open for the working ones. They carry no
`✕`: closing a parked tab is a right-click decision, not a stray click.

**A pinned tab is the one thing the app may not take.** Two things would take
it if they were let:

- A plain open — ⌘K's `↵`, a rail click — replaces the *active* tab, and the
  pinned tab is very often the one in front. So the gesture is reliably aimed
  at exactly the tab you asked it not to touch, and replacing it would keep the
  **pin** and lose the thing that was pinned: the strip would go on claiming
  something was parked there, and it would be something else. An open aimed at
  a pinned tab appends instead, which is what every browser does and what the
  word means.
- A cap that fell back to evicting a pinned tab when every *other* tab was
  pinned would make "keep this" conditional on how the rest of the strip
  happened to look. It never does. A strip of twelve pins asked for a
  thirteenth simply becomes thirteen — the row scrolls, and can carry it.

What still moves a pinned tab is you: unpin it, close it from its menu, or ⌘W
— *Close others* passes it by. Stepping between two paths of one thread is not
an exception — that is navigation inside the tab the pin is about, not a
different document.

### A full strip keeps its titles

A cap set by how many full titles the reading measure (620px unless changed)
can draw is a layout standing in for a budget, and it throws a tab away,
history and all, the moment the strip is full. A strip that sheds instead —
tabs collapsing to the monogram pinned tabs wear, so that none is ever
scrolled out of sight — spends the one thing a tab is for, saying which one it
is, on exactly the strips with the most tabs to tell apart; a row of
`LO CD AS LP` is a row of guesses. So **a tab keeps its
title**, shrinking to a readable 96px (a short title is never padded out to it),
and past what the row can hold it **scrolls sideways** — a trackpad's swipe, or
the mouse wheel. The tab you are in is always brought into view.

What shedding protected is kept another way. The dot on a tab is how you learn
an answer landed in it, so a tab out of sight with an answer waiting puts **that
dot at the edge** it is past, and the dot brings it into view. An edge with
more beyond it fades. And whenever anything is out of sight, a **counted chip**
at the end of the row opens a list naming every tab in the pane, with its dot,
its `✕` and the active one marked — the row's index, listing the whole strip so
it says the same thing however far it is scrolled.

**A dragged tab makes room.** A press that moves a few pixels picks the tab up:
it follows the pointer — wherever the pointer goes, above the row or below it —
and the tabs it passes slide aside to show where it will land. Where is decided
by the tab, not by a precise spot: a neighbour gives way once the dragged tab's
leading edge is past its middle. Near either edge the row scrolls under it,
faster the nearer. Let go and it settles into the gap; esc puts it back where it
was; a press that does not move is still a click. Pinned tabs move among the
pinned, the rest among the rest — not the browser's drag and drop, with a
ghost, a 2px line to aim, and a drop that misses unless it lands squarely on a
tab.

A tab cannot be dragged between panes — a strip holds one kind, so there is
nothing the move could mean. Dragging a rail row onto a pane opens it, in a tab
of its own and in the pane its kind belongs to.

## A path written in backticks

Claude names the files it worked on in backticks — `reading/`,
`build/pack.sh`, `seed-order.xlsx` — and only a path to a note is a link. Any
other path, in a thread or in a note's READ, takes a **right-click**: Lanes
looks for it and says what it is — FOLDER or FILE — and, for each place it
found (up to four, then how many more share the name), where that is:
`projects/garden`, `~/Downloads`. Each place offers **Open** and **Show in
Finder**; found nowhere, the menu says *Not found on this Mac*. A markdown link
to a file that is not a note takes the same menu.

Where it looks: from the root or your home folder when the path says so (`/…`,
`~/…`); otherwise in the vault, in the note's own folder, and — for a path
written with its head left out, `…/Allotment/Scripts` — in the folders the vault
sits in, below your home folder. A path not written from `/` or `~` and found
nowhere goes to Spotlight (`mdfind`, under your home folder only) for files of
that name, and those whose path ends the way the written one does are kept —
inside the vault first, then nearest to the note. The Trash, `node_modules`,
`.git`, an app's insides and `~/Library` (but not its cloud folders) are left
out. All of this reads file metadata, never contents, and happens on your click
and not before. See [Safety](safety.md#what-leaves-your-mac).

**Open opens documents and media, and nothing else.** A document or a picture,
a sound or a film goes to its own app; a folder opens in the Finder; a script —
or a program with no extension — opens as text in your text editor, since its
own app would run it; anything else — an app, an installer, a `.webloc`, an
`.html` page, a plain file with no extension — is offered only *Show in
Finder*. A list of what may open rather than of what may not, because the
Mac's double-click does more than open, and a deny-list is only as good as the
kinds its author thought of. Main opens or shows only a place it found and
handed out itself, so the page cannot name a file it was never shown
(`src/main/locate.ts`, `howToOpen` in `src/shared/written.ts`;
`checks/file-menu.js`, `checks/how-to-open.mjs`).

## Paths in a thread

A conversation that went two ways is still one conversation. Forking does not
open a tab, and does not make a second thread: it **folds the page**. Everything
below the cut slides away — it belongs to the other path now — and a hairline
**seam** at the fold names what that path goes on to say. Click the name to read
it instead.

**Every path is on the seam, and the one you are reading is marked.** Listing
only the OTHERS — you are reading this one, and the rule says what else leaves
— makes the seam a list with a hole in it: three paths show two names, and
which two depends on where you happen to be standing. All of them, with yours
in ink and the rest as links, turns the rule
into a switch you can read — how many ways this went, which is yours, one click
to any other.

**No two paths on one seam may read the same.** Two open with the same words more
often than not — asking the same question twice differently is most of why anyone
edits one, and a `resend` makes the words identical by definition — and two paths
with nothing written on them are both "unwritten". So
colliding labels, and only those, are stamped: the day it was cut, then the day
and the time, then a plain ordinal, which cannot collide with anything.
Uniqueness is checked at each rung rather than assumed, because three paths cut
from one question in one afternoon all carry the same date.

**Where the forks are is drawn down the left margin.** A seam is the right thing
to read when you reach it and no help at all in finding it: on a long thread the
only way to learn there was a fork, or to get back to one, would be to scroll
until you met it. So a hairline stands for the whole thread with one DOT per
seam at the height that seam actually sits at, the one you last passed filled,
and a click that puts it 22px under the top — the same landing the note outline
uses, so both margins set you down alike. A path still answering while you are
on another one blinks there, which is the case the rail earns itself on: without
it that path is invisible until you scroll to its seam.

A dot, not a tick. The note outline's 1px hairline mark is right in a note —
forty of them stacked read as a column, and you click the panel rather than the
ticks. Here there are one or two, they are the only way in, and a 1px target is
not one: you cannot hit it, and at rest you can barely see it. So the mark is a
dot with a 15px square of hit area around it. The hairline is not decoration
either: a single dot floating in an empty margin says "something is here"
without saying where — the line is the thread, and the dot is a place on it.
There is no open shape and no labels: seven elements share the chat pane's
gutter, so making room for them would put the tab strip and the composer on a
different column from the words — and the labels already exist, on the seam
itself. A thread that never forked, which is most of them, draws nothing and
reads no geometry at all.

Which verb a turn offers is decided by whose turn it is, and that is what keeps
a path honest — a cut lands after an answer or before a question, never in the
middle of an exchange:

- **`fork`**, under one of Claude's turns: carry on from here a different way,
  keeping everything above.
- **`edit`**, on one of yours: fold above the question and hand it back to the
  composer — the words, the images that went with it, and the note it was
  quoting. It is **never sent for you**. Asking again *differently* means
  changing the words first, so they land somewhere you can.
- **`resend`**, on one of yours: the same cut, and then those same words go
  again, unchanged.

`edit` and `resend` cut in the identical place and differ only in what becomes
of the words, because the two reasons for asking twice are not one reason.
`edit` is for when the QUESTION was wrong. `resend` is for when the question was
fine and the **answer** was the problem — a tool that misfired, a reply that
wandered off, a model you have changed since. Retyping your own sentence to get
another go at it is not an edit of anything, and that is what having only the
one verb made you do.

Neither replaces the answer this thread already gave: it is one seam away, the
way it is after any cut. A resend sends the whole turn — the pictures and the
quoted note with the words, not the text alone — and sends it in **the path's
own model and effort**. That last one is not free: a path is milliseconds old
when its resend goes, and its settings are still in flight to the renderer's
state, so asking for them by id would find nothing and quietly answer in the app
default. The record main hands back with the cut is the copy that gets read.

`resend` is also the only one of the three that spends a turn by itself. `copy`
and `edit` hand you something and wait; this one has gone by the time you have
read the word. So it sits last in the row, furthest from where the pointer comes
to rest.

Underneath, nothing about the mechanism changed. A session *is* its `.jsonl`
and `--resume` takes whatever it finds, so a path is still a truncated copy
under a new id. What is new is one record per fork — parent, how many lines
they share, the uuid of the last of them, and when it was cut — from which the
family, its seams and its single rail row are all derived. **No code path
renders two sessions into one column**: you are always reading one ordinary
transcript end to end, which is what makes who-said-what impossible to blur.

- One thread is **one rail row, one tab, one name**. The row says `· 3 paths`,
  the pane head says `path 2 of 3`, and the row reports the family's newest
  member — after a fork the conversation carries on in a child, and a row
  reading *quiet for three days* about a thread you were just in is a lie.
- Opening a thread returns you to **the path you were last on**, at launch too.
- Switching **keeps your place**. Everything above a seam is byte-identical in
  every path, so a reader up there does not move; below one, the seam pins near
  the top — *here is where this path begins*. The draft in the composer belongs
  to the tab, not the path, and survives.
- Right-click a path at its seam to **name it** or **let it go**. Letting go
  means the system Trash, so it can be got back. A thread's root is not offered
  it — that is the conversation, not one of the ways it went — and anything cut
  from a discarded path is promoted rather than swept up with it.
- **A path you leave keeps answering.** Fork, ask both roads the same question,
  and step between them while they work: the seam marks the one still going
  with the same blinking dot the transcript uses for an answer being written,
  and holds it steady for a path that stopped to ask you something. Walking
  back hands you the page you would have been looking at — not a re-read, which
  is the only version of this that cannot show you a turn twice, since the file
  and the stream name messages differently and neither can tell a half-written
  answer on disk from the one still arriving. A path's process is reaped only
  when there is nowhere left to come back to.

Losing the record loses a grouping, never a conversation. Every path is a whole
transcript, so a member whose kinship goes missing — a file deleted from under
the app, a state file that would not write — is an ordinary standalone thread
again. The seam is checked before it is drawn, too: the line count that places
it is only true while the transcript is what it was, and the uuid stored beside
it is how that is tested rather than assumed. A split that no longer sits where
it was cut is simply not drawn. Kinship is never inferred from contents: a
thread with no record is a thread of its own, since guessing risks joining two
that were never related, and a redundant row is the better failure.

## Tool runs in the transcript

A tool row's name is a label, so it is mono caps and quiet; the one-line
summary sits beside it; a click opens its output onto the code ground. A run of
consecutive calls collapses to `2 STEPS TOOLSEARCH · BASH` (`· RUNNING` while
one is), forces itself open while anything inside is running, and settles
closed when the turn lands — unless you touched it, in which case it stays as
you left it.

A failure is the one thing a quieted row still says out loud, and it says it by
**weight**, not by hue: the row's summary set heavier and in ink, and a
collapsed run counting `N FAILED`.

A call that waits on your yes, in Guarded, is a raised card above the composer
rather than a coloured band: ASKS TO, what it wants to do, *Approve* and
*Deny*. Its caveat line is not decoration: headless Claude Code has no channel
to ask a question on, so it denies the call and ends the turn — a yes buys the
rest of a turn that has to be started again, not this one call. What a yes
allows, and for how long, is in [Safety](safety.md#the-approval).

As a turn streams in, tool rows — the call's summary and its output — are
masked before they reach the screen: anything shaped like a credential —
`sk-…`, `ghp_…`, `xox…`, a bearer token, a JWT, a `token=`, `api_key=`,
`secret=` or `password=` assignment — is shown as `••••••`. It is masked in the
main process (`src/main/cli.ts`), so the page never holds it, and it is masking
for the screen, not a security boundary; a thread read back from its transcript
is shown as the transcript has it (see [Safety](safety.md#redaction)). *Redact
secrets in transcripts* in Settings → Safety turns it off.

## When the usage limit is reached

A limit is the one error that is not a fault. Nothing is broken, nothing needs
fixing, and the only useful fact is WHEN IT LIFTS — which is exactly what stderr
on the code ground fails to say. So it is picked out of whatever the CLI said
and drawn as the wait it is: the clock is the biggest thing on the card, ticking
down in tabular figures, with the time it comes back, and the CLI's own sentence
underneath at the size a footnote deserves. When the window passes, the clock
reads READY.

Where the CLI named no time there is no clock, because a countdown to a moment
nobody said would be an invention, and this is a screen you look at precisely
when you need to trust it. `limitIn` (`src/shared/limit.ts`) reads every shape
the CLI is known to use — a piped epoch, a UTC stamp, `in 2h 15m`,
`resets at 3pm` — and answers **null for anything it is not sure about**, which
is what keeps a real error out of a countdown. It decides line by line rather
than over the whole blob: a limit whose paragraph mentions tokens is still a
limit, and a subagent-depth error in the same stream as the word "usage" is
still not one.

`checks/limit.mjs` proves the reading; `checks/limit-live.js` proves the wiring,
run twice — once against the stand-in CLI that reports a limit, once against
the one that reports a fault and must not be dressed up as a wait.

## The session clock

The top bar's right end says how much of the five-hour usage window is gone and
how long is left of it — a ring, then the time: `◔ 4:12`. The ring is a small
circle the height of the digits beside it, filled clockwise from twelve as far
as the window is used. The time is `--mute`, ink for the last quarter hour and
whenever the CLI's last word was a warning or a refusal (`allowed_warning`,
`rejected`); `READY` once the window has reset, and a faint `5h` before
anything has set it.

**The ring colours as the window fills.** On the ink ramp below 70%, like
everything else in the bar — **orange from 70%, red from 90%**. The thresholds
are said once, in `tone` in `src/shared/usage.ts`, and they go by the figure
as it is shown, in whole percent, so a share that reads `70%` is never drawn
plain beside the words saying so. The CLI's own word can only raise it: an
`allowed_warning` about the session turns the ring orange at any share, and a
turn it refused turns it red. A warning about the week leaves the session's ring
alone; the week has its own figure. These are the bar's only colours, and why
they are allowed is under [The palette is achromatic, and where it is
not](settings.md#the-palette-is-achromatic-and-where-it-is-not).

**The number is not gone, only out of the bar.** The ring's tooltip says it in
words — *17% of this session used — 4:12 left, resets 11:40* — and adds the
CLI's own warning or refusal when there is one. The card's SESSION and WEEK
figures take the same colours at the same thresholds, in weight as well as
hue, so a week running out is as plain there as a session. There is no ring
where there is no share to draw: before the first turn, once the window has
reset, while a clock set by hand counts some other window, and when the
stream's figures do not say a share.

**It sets itself.** Nothing in the stream says when a window opened, which is
beside the point: the stream says when it **ends**, and that is the one thing
the clock holds. Every turn of `claude -p --output-format stream-json` closes
with a `rate_limit_event` — what the API's rate-limit headers said about the
account — and `src/shared/usage.ts` reads it: the five-hour window and the week,
how much of each is used and when each resets. The session window's end
becomes the clock's, over whatever was set by hand, since the CLI is the party
that knows; the figures go into the state file with when they were said, so a
relaunch shows what was last known.

Two things bound it, and both are kept to. The per-window figures sit under
`unifiedWindows`, which the CLI's own schema marks `@internal` — they are the
only place either percentage is said, so they are read first, and everything
still works without them: the clock sets itself from the documented top level
and, with no share to draw, draws no ring. And that documented `resetsAt`
belongs to whichever window is **limiting**, which can be the week; it is the
session's only when `rateLimitType` says `five_hour`, because a week's reset
taken for the session's would set the clock days out. Anything that does not
read comes back null, never `0%`.

**A click discloses, it does not edit.** A card under the clock, in the details
panel's voice: SESSION and WEEK, the share used and when each resets — the
week's with its day — and when the figures were said. They only ever arrive
with a turn, so usage spent on claude.ai, in a terminal or by a scheduled job
reaches this card with the next turn here, not before; the "as of" is that
caveat, said where it applies. Esc or a press anywhere outside closes it.

**Setting it by hand is in the card** — `set by hand` — for before a window's
first turn, or an account whose responses carry none of this. It is a field:
`5:00`, selected, so ↵ starts a fresh window; type what is left —
`3:20`, `90m`, `2h30` — or when it resets, `at 17:40`; empty clears it; esc or
clicking away leaves it as it was. A clock set by hand to another end draws no
ring, since the figures are not about that window, and the next turn sets it
back. The clock holds the moment it ends, not a duration, so it survives a
relaunch. And when the CLI refuses a turn on a session limit and says when it
lifts, the clock is set to that moment too; a weekly or credit limit is not this
window and sets nothing. `checks/usage.mjs` holds the reading against the event
the CLI really sent, and `tone` at its edges; `usage-live.js` the clock, its
ring and its card, run at 17%, 75% and 93% to see plain, orange and red;
`session-clock.js` and `session-clock.mjs` the field; and `limit-live.js` the
limit.
