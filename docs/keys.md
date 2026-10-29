# Keys, and getting somewhere

How you reach a thread or a note — the palette, the rail, find, menus and drag
— what can be copied and how, what the app does when the CLI is signed out,
and the keys in one table at the end. Back to the [README](../README.md).

## Getting somewhere

Four routes — the palette, the rail, a menu and a drag — and they all end in
the same call, `openIn(pane, kind, id, opts)`, whose pane argument is ignored
in favour of `paneFor(kind)`.

**⌘K makes things as well as finding them.** Two rows offer to create what you
are looking for — a **new thread** with those words already in the composer, and
a **new note** by that name. `folder/name` works here as it does in a `[[link]]`
to a note not yet written, and each filter keeps its own offer: THREADS shows
only the thread, NOTES only the note.

They are there **whether or not anything has been typed**. Requiring a first
keystroke would make the two things you reach for most often a trick you had
to know.
Where they sit depends on whether there is an answer for `↵` to belong to:

- **With a query** they go last. The found rows are the answer, and a row that
  makes a file must not be what a stray return key hits. When nothing matched
  they are all there is, so `↵` finds them anyway — the case they were written
  for.
- **With nothing typed** they go first, above a heavier rule. The list below is
  only "everything, most recent first", and an offer buried under forty of those
  is an offer nobody meets. The selection still rests on the first real row, so
  `⌘K ↵` opens what it always opened.

A nameless offer means what the shortcut means. **New note** with no name is
exactly what ⌘N makes — an untitled note with the caret in its title, named by
whatever you type there — and **New thread** with no name is an empty thread
with the caret in it, exactly what ⌘T makes in the thread pane.

The thread is **not sent**. A thread has no name until its first message earns
one, so "a new thread called X" can only mean "one with X ready to go" — and
what you typed to FIND something is rarely phrased the way you would ask it, so
the words land in the composer with the caret after them.

**A new note opens ready to write.** However it was made — ⌘K, ⌘N, the `+` —
the file exists immediately, it opens in WRITE, and the caret is already where
the next keystroke belongs: in the head's empty title for a nameless one, and at
the top of the body, under the heading its name became, for one the palette
named. Filenames stay slugged — an untitled note's too, once its title names
it. See [A note, now](notes.md#a-note-now).

**Hover only counts once the pointer has moved.** A row highlights on
`mouseenter`, and `mouseenter` fires when the ROW moves under a stationary
cursor just as readily as when the cursor moves onto the row — so opening ⌘K
with the pointer anywhere over the middle of the screen would put the
selection on whatever row landed under it, and every keystroke would do it
again: the answer to "what does `↵` do" would be "wherever you left the
mouse". Hover is disarmed whenever the query, the filter or the sort changes,
and armed by a real pointer movement.

**⌘K** opens the palette over every thread, every note, every open task and
every open comment: `ALL` / `THREADS` / `NOTES` / `TASKS` / `COMMENTS` /
`WAITING`, sorted by `RECENT` / `A–Z` / `FOLDER` — and `PROMPTS`, the ones you
keep and the vault's skills, which a leading `/` asks for too (see
[Prompts](prompts.md)). `↵` opens and `⌘↵` opens a tab of its own; the footer
names the destination, which depends on the row's KIND rather than on focus.

It indexes **tasks**, not just objects: an open `- [ ]` line inside any note is
findable by its own words and lands you in the note that holds it. And
**comments**, the same way — see [Comments in a
note](notes.md#comments-in-a-note). WAITING is a question rather than a kind —
the threads whose last word was yours, derived from who spoke last, never
authored.

**Every row says when it last changed, and which ones are open.** The time
RECENT sorts by — a thread's last activity, a note's mtime — is printed at the
right, before the badge, in the
rail's own unit — `4m`, `3h`, `6d` — so the two lists cannot disagree about how
old something is, with the moment itself on hover. Only where it is known: a
task has no time of its own, and a note newer than the list (written by Claude
a moment ago, not yet swept in) sorts as "now" for want of anything better, so
neither prints one — `1s` there would be a claim about a note nobody has dated.
And a row a tab already holds draws its glyph the way that tab does: a thread's
dot in ink, blinking while it answers and ringed while an answer waits unseen,
a note's page in ink. A thread is listed once, under its family's root, so a
path of it open in a tab marks that row. With an open row selected the footer
says `↵ go to its tab`, because that is what `↵` does there — and `⌘↵` with it;
nothing is opened twice. `checks/palette-marks.js`.

Note and thread **text**, and open tasks, are searched too — once three
characters are typed, a moment behind the names — with twelve slots reserved
so a broad title match cannot crowd the text hits out. See [Search](search.md).

**⌘F** finds inside the focused pane. `↵` and `⇧↵` walk the matches, and so do
`⌘G` and `⇧⌘G` — which work with the caret anywhere, so you can click into what
you found and keep going. `esc` closes; ⌘F again refocuses the field without
losing what you typed, and ⌘G on a closed bar reopens it on the last query.

**The bar stays.** It is mounted outside the pane's scrollport wrapper, above
it, so the whole document lives below the field. Inside that wrapper the compact
bar is absolute at `top: 0` and z-indexed over everything in flow — so the
moment you scrolled past the head, which is the moment you reach the second
match, the title bar would slide in over the field you were typing in. Out
here the wrapper begins below it and the compact bar has nowhere to land but
underneath.

Highlighting goes through the **CSS Custom Highlight API** rather than wrapping
matches in `<mark>`. Nothing is inserted into the transcript or the note, so the
renderers do not have to know that finding exists, a highlight cannot disturb
layout, and closing the bar cannot leave stale markup behind.

**A note in WRITE finds for itself.** The editor draws only the lines near the
screen, so the page cannot be searched for what is in the note — most of it is
not there. The bar hands the query to the editor instead, which searches the
whole document, drawn or not, marks the hits as its own decorations in the same
amber, and scrolls the current one to the middle of the pane. The count, the
keys and the look of the bar are unchanged, and the current hit reveals its
markup the way the caret does, so a match inside a hidden link target is
visible where it is.

**The marks are amber, a hue kept for find alone** — see [The palette is
achromatic, and where it is
not](settings.md#the-palette-is-achromatic-and-where-it-is-not). A note's own
`==highlights==` are a pale yellow, or whichever marker you pick in Settings,
none of them amber, so a match inside one still shows. A match is a wash of
amber, the current one a solid block of it, and both set their own ink as well
as their ground: a highlight only repaints what is under text that keeps
whatever colour it had, so a pale wash under near-white body text in the dark
theme would have erased the very words it was pointing at. The find bar's
counter wears the same amber while there are hits, so the marks in the document
and the chrome that made them read as one thing. Matching is case-insensitive
but deliberately *not* diacritic-folded, unlike ⌘K: folding changes string
lengths, and a find bar has to map offsets back onto the text nodes they came
from. The pane head carries `data-find-skip` — it shares the scrollport with
the document, and it is chrome.

A thread scrolled up from its live edge offers a small round **chevron** at the
bottom right of the transcript — sticky with no height of its own, so it hugs
the scrollport without taking a pixel of layout, and fading rather than
appearing. It shows further up than the auto-scroll's own threshold, or it would
blink on every turn.

Above it stands the **way up to where a message starts**, smaller and quieter —
a ring and no cast — and only when there is a start above you to go to. A long
answer is read from its first line, and scrolling back up to find that line by
eye is how you lose the end of it on the way. Pressed in the middle of an
answer it sets that answer's `CLAUDE` label 22px under the top of what can be
seen — under the compact bar, once the head has gone — the landing the outline
and a fork use; pressed again from there it goes to the message before, your
own turns included, and so on up the thread. Pressed twice while the first
jump is still gliding, it counts from where that jump is going, so it goes two
messages up rather than to the same one twice. Both stand in the pane's right
margin, clear of the words, wherever the margin is wide enough to hold them;
only a pane too narrow to have one puts them on the end of the lines.
`checks/to-start.js`.

**The top bar's `+`** asks which kind of thing: a thread, or a note — and the
note is made on the spot, untitled, exactly as ⌘N makes one, with nothing asked
about its name. ⌘T stays a thread with nothing asked and **⌘N** a note with
nothing asked: a shortcut is a decision already made, and the button is where
the decision is offered. The tab strip's own `+` — `Open something else · ⌘K`,
its tooltip says — opens the palette with `↵` set to open in a new tab.

**⌥↑↓** steps the rail; rail rows carry their own kind, so stepping onto a note
opens a note. In a note's editor ⌥↑↓ is the editor's, and moves the line you
are on.

**A new note goes to one place**, set once in Settings → Notes & lanes under
*New notes go to*: the vault root, unless you name a folder there — and never a
folder kept read only, which sends it to the root instead. Landing beside the
note you were reading would send a note made in a hurry wherever you happened
to be, and the hurried notes are exactly the ones you later have to go looking
for. A name typed into ⌘K as `folder/name` still overrides it, and the
palette's row says where a name with no folder of its own will go. A nameless
note always goes to the setting — it has no name to carry a folder in.

**Right-click** a thread for *Open*, *Open in a new tab*, *Rename…*, *Star this
thread* and, when you have lanes, the lanes to move it to; a note for *Open*,
*Open in a new tab*, *New thread on this note*, *Rename…*, *Move to…*, *Star*,
*Show in Finder* (the same item its tab has), *Export as PDF…* and *Move to
Trash*. There is one open row, not two: panes are role-assigned, so there is no
pane left to choose, and two rows doing the same thing would be the menu lying
about what it can do.

**Drag** a thread or a note onto either pane and it opens where its kind
belongs, in a tab of its own. A tab is not dragged between panes: a strip holds
one kind.

## When the CLI is signed out

Lanes runs the `claude` you already have and **keeps no login of its own**. It
inherits your environment, reads the transcripts that CLI writes, and never
holds a token — so an expired OAuth session is not something this app can fix.
What it can do is say so well. Left alone, the CLI's sentence arrives as
stderr, in the box kept for machine output you did not ask for, once per
message, for ever.

> Failed to authenticate: OAuth session expired and could not be refreshed

Every word of that is true and none of it is useful. It does not say that Lanes
holds no credentials, it does not say where the login lives, and it does not say
what to type. So it gets the same treatment a usage limit gets — its own note,
with the one thing you have to read set biggest:

```
claude auth login
```

The app cannot run it. A login is a password and a browser round trip, and this
app deliberately has no business with either, so the one useful act it offers is
to put the command on your clipboard.

**Asked before you type.** `claude auth status` prints JSON, costs no tokens and
touches no network, so it is asked once at launch — the note is up before a
message has been composed and lost to it. After that it is kept honest without
spawning anything else: an error that reads as "not signed in" raises it, and a
message that actually arrived is proof it has been fixed and lowers it.

`signInFaultIn` follows `limitIn`'s discipline and returns null for anything it
is not sure about. The refusals matter more than the matches: a tool PERMISSION
denial, a sandbox refusal, a proxy certificate, DNS, a rate limit and a usage
limit all mention authorisation or waiting while meaning something else, and
sending you to a terminal for any of them wastes the one instruction this note
gets to give.

## Copying

Four things can be copied, and they all say the same word — `copy`, then
`copied` — because they are all the same verb:

| | |
|---|---|
| a **note** | its whole markdown, from the head beside `pdf` |
| a **message** | the markdown it was rendered from, from its action row |
| a **selection** | what you selected, cut at both ends — see [Copying from a note](notes.md#copying-from-a-note) |
| a **block** | this code block, this script, this output |

The last one is the one you reach for most in a transcript full of shell.
Selecting a fenced block by dragging is fiddly — you catch the
line above, or miss the last newline, or the pane scrolls out from under the
drag — and the place a precise selection matters most is the place a rough one
is hardest.

So a word in the block's top-right corner, **absent until the block is under the
pointer**. Absent rather than dim: a transcript can be forty code blocks long,
and forty visible controls is a toolbar rather than a document. It is absolutely
positioned, so the document is laid out exactly as it was without it, and it
stays up for its 1400ms while it says `copied` — a confirmation you cannot see
has not confirmed anything. `pointer-events` are off while it is hidden, or the
corner of every block would be an invisible click target; keyboard focus does
not go through pointer-events, so Tab still reaches it.

It appears on four surfaces, all of them things you would paste somewhere else:
a fenced **code block** in a note or a reply, a tool's **output**, a `show
script` **script**, and a tool row's **command** — that last one gives you
strictly more than the screen does, since the row only ever shows one ellipsised
line of it and opening the row shows the output instead.

What it copies is the **source**, not the rendering: the text inside the fence,
without the fence markers, newlines and all.

**And a code block shows all of itself.** Its lines wrap, as written — the
spaces kept, so an indent stays an indent, and no line run into the next — and
the card never scrolls sideways. A card that kept every line on one row and
scrolled inside itself would show a message Claude fenced off for copying,
longer than the measure, as a first few words and a cut-off edge: the rest
there only for someone who knew to scroll a card sideways. The editor wraps
every line, code included, so READ and a thread draw a block the way the
editor does. A long path or URL with no spaces in it breaks
anywhere rather than running past the edge (`checks/code-wrap.js`).

**⌘A** selects the pane you are in, not the window. A field keeps its own: a
composer, the find box, a rename or a note's editor all answer ⌘A themselves —
the editor with the body you can see.

## The keyboard, in full

| Key | Does |
|---|---|
| `⌘K` | Palette — threads, notes, tasks and comments, and the offer to MAKE a thread or a note; after a `/`, the prompts you keep and the vault's skills — `↵` runs one, `⇧↵` opens it unsent |
| `⌘T` | New tab in the pane you are in — a thread in the thread pane, a blank tab in the note pane |
| `⌘N` | New note — untitled, at once, with the caret in its title |
| `⌘E` | WRITE or READ, for the note pane's note, whichever pane has focus |
| `⌥1` | Show or hide the browser — matched on `code`, since ⌥1 arrives as `¡` |
| `⌥2` | Show or hide the second pane — the same errand one place over |
| `⌘\` | Show or hide the second pane, as `⌥2` does |
| swipe ⇢ ⇠ | Two fingers: the browser rail in and out |
| `⌥⇥` `⇧⌥⇥` | The other pane — focus, in a split; which pane is on screen, without one |
| `⌘W` | Close tab — on an empty note pane, the split (a menu accelerator, so never a keydown) |
| `⇧⌘W` | Close the window |
| `⇧⌘T` | Reopen the tab you just closed |
| `⌘[` `⌘]` | Back and forward, per tab |
| `⌘1`–`⌘9` | Nth tab of this pane — the chord every browser and editor uses, so nobody has to be told |
| `⌃⇥` `⌃⇧⇥` | Next · previous tab in this pane |
| `⌥↑` `⌥↓` | Step the browser — in a note's editor, move the line instead |
| `⇧⌘K` | Focus the rail's filter |
| `⌘F` | Find in this pane |
| `⌘G` `⇧⌘G` | Next · previous match |
| `⌘A` | Select this pane — in a note's editor, the body you can see |
| `⌘Z` `⇧⌘Z` | Undo · redo — in a note's editor, its own history over the whole note; elsewhere, the note's saved changes |
| `⌘,` | Settings |
| `⌘+` `⌘−` `⌘0` | Text size |
| `⌘B` `⌘I` | In WRITE: bold · italic — the selection, or the word the caret is in; between words, a pair to type into; again to take it off |
| `⌘↵` | In WRITE: make the line a task, tick it, untick it |
| `⌥⌘M` | In a note: comment on the selection — in WRITE, or on the word at the caret |
| `⇥` `⇧⇥` | In WRITE: indent · outdent a list item (`⇥` is two spaces anywhere else); in the title, `⇥` goes down into the words |
| `⌘`-click | On a link in a note: follow it, a note into a tab of its own (in WRITE, where a click places the caret, the only way to follow one) |
| `esc` | Dismiss — in a note's editor, leave WRITE, asking first if that would throw words away (`esc` in the question is no; `⌘⌫` there is yes) |
| `↵` `⇧↵` | In the composer: send · newline |
