# Notes

How a note is read, written, saved, named, folded, printed and commented on:
the two modes and the one editor behind them, the keys that editor answers,
what happens when something else — usually Claude — edits the note you have
open, and the column the words are set in. The reference for the writing
surface is iA Writer, and it is held to closely. Back to the
[README](../README.md).

A note is **one document**. It opens as READ, the page the note makes, and
nothing in that page is a field. Writing is one keystroke away — ⌘E, or a
double-click where you mean to write — and is one surface too: no block to open,
the markdown drawn where the caret is not and back where it is.

A note's **title is said once**. The head states it in the type a title
deserves, and it is the note's first `# ` line, so that line is not drawn again
underneath it in either mode. An h1 further down is a heading somebody wrote and
stays, and a note whose name comes from its filename has nothing to drop.

## WRITE and READ

A note has two states and one switch between them — `⌘E`, or the pair in the
bar under its title. `⌘E` means the note pane's note whichever pane has focus:
with the split open the caret is usually in the composer beside it, and a mode
switch that only works once you have clicked into the note is a mode switch you
stop reaching for. The mode follows the note rather than the tab it happens to
be in, for as long as the app is up.

**The pair stays in reach.** Scrolled past the note's head, the compact bar that
slides in carries it where that bar's `NOTE` label was — the left edge the pair
already has — so the switch does not go anywhere as you scroll; back at the top
there is one pair again. The bar carries the rest of what the head is reached
for, too: the title, the head's own meta line after it — *edited 4m ago · 812
words* — and, where the head has them, the way back and forward through the
tab's trail, then the star. A note followed to from a link, read halfway down,
is one click from the note it came from. And it is **frosted paper** rather than
a slab of white: the card's warm tone, thinned, over a blur of the words
scrolling under it, with a hairline and a short soft fall for an edge — the flat
sheet-coloured band it was cut the page off at a ruled line, as if the note
stopped there (`checks/sticky-bar.js`). On a narrow pane the meta line steps
aside whole before a letter of the title goes. **And switching keeps your
place.** WRITE and READ draw the same note at different heights — a table is
four source lines in one and a drawn table in the other — so the offset one was
scrolled to was another place in the other, and switching halfway down a long
note landed a screen or more away. The words at the top of the screen are read
in the note's own terms before the switch — which source line, how far into it —
and put back after it, so they are where they were, give or take a few pixels,
by the pair and by ⌘E alike. A table is kept by its row — the first whose words
are on screen — since it is one block in READ and a line a row in WRITE, with
the separator line READ does not draw between its header and its first row;
spread over the whole block, a place inside one came back a row out, 16px.
`checks/sticky-mode.js` holds both.

**READ is what a note opens as.** WRITE draws the markdown and so reads as a
document too, which is an argument for opening in it — but a note beside a
conversation is mostly there to be read from, and an editor with the caret in
it is a page that answers every stray key. Writing is the thing you
ask for. The one exception is a note made a moment ago — by ⌘N, the `+`, the
palette or a link to a note that did not exist — which is there to be written
in and opens in WRITE with the caret ready. The mode is held by the note's
IDENTITY, which a rename keeps: held by path, naming an untitled note — which
renames its file — put it back in READ under the caret.
`checks/read-default.js` holds it.

A note in one of the **read-only folders** — Settings → Notes & lanes, one
folder per line; none unless you name some, and the sample vault's `inbox/`
when you start from the sample — is read only at the main-process boundary:
main refuses to write, rename, move, trash or make a note there. So it has no
pair to switch at all, and its head says *read only — its folder is kept read
only (Settings → Notes & lanes)*. A folder named there is read only at once,
the open note losing its WRITE, with nothing to relaunch.
`checks/read-only-rule.mjs` holds main's rule and `checks/settings-folders.js`
the setting.

**A note is where you left it.** The note pane has one scrollport, and every
note shown in it used to be shown at whatever offset the last one left there —
so going back to a tab put you at a place in the note that was really a place
in the one before it, and a short note opened under a long one opened at its
end. Each note's place is now taken as you leave it, in the note's own terms —
which source line was at the top of the screen, and how far into it — and
given back when it comes back, by its tab, by ⌘[, or opened again from the
rail, in READ and in WRITE alike; a note written to from outside meanwhile
still comes back to the words you were at rather than to the pixel. A note
never shown before opens at its top. `checks/note-scroll.js`.

**READ is for reading.** Nothing in its document opens a field. A
**double-click** is the request to write THERE: the pane switches to WRITE with
the caret on the source line and column that was under the pointer — mapped from
the rendered text back into the source by walking both and skipping whatever the
renderer swallowed, so you double-click the word you meant to change and you are
standing on it. A double-click in the room under the last block puts the caret
at the end, which is where you add to a note. Double, because a single click is
how you follow a link, tick a box or put the pointer down while reading, and
single clicks still do exactly that.

READ draws **a single newline inside a paragraph or a quote as a line break** —
in a note, not in a thread. Notes are written where a newline is one, and the
editor shows it as one; READ joining those lines back into a single run
would be the two surfaces disagreeing about the same text. A blank line is a
whole line in both (see below), and in a thread. A thread keeps markdown's own
rule for a newline, which is how a model writes. The PDF draws a note the same
way, since it is READ on paper.

## One editor

A note is written in **one CodeMirror 6 editor**, and that is what lets one
surface be both a page and a place to write. The two cheaper shapes were each
half a writing tool: a block opened as a field on double-click cannot be
selected across, and a transparent `<textarea>` over a painted mirror may change
colour and weight and nothing else, or the caret walks away from the words — so
a heading there is bold rather than big, and every `**` is on screen for good.
CodeMirror lays the text out itself, so a heading can be big, a mark can be
hidden and a bullet can be a widget while the caret still lands exactly where it
is drawn — and it is still one contenteditable, with one selection, one history,
native IME and dead keys, spellcheck and word-wise motion.
`components/NoteEditor.tsx` holds it; what it draws is decided in
`lib/editorLive.ts`.

**Everything decorates; nothing rewrites.** The note's body is the text in the
editor, byte for byte, and every `**`, `##` and `- [ ]` is still in it — only
how it is DRAWN changes. Line breaks are the one thing the editor holds its
own way: CodeMirror keeps every one as `\n`, so a note saved on Windows is `\n`
on screen, and main puts the file's breaks back on every write. A `\r\n` note
stays `\r\n`, every break you did not touch goes back byte for byte — a stray
`\r` included — and one you type is written the way the note writes them
(`checks/line-ends.mjs`). And a note that is nothing but its `# ` line is handed
to the editor with a line under it to write on, which reaches the file with the
first change written to the note — see the title, below. Frontmatter is not in
the editor at all: main keeps it and puts it back on every write, so no
keystroke can disturb it.

**The type is READ's, size for size** — a 13.5px sans body under Settings' text
size, an 18px h1, `##` as 10.5px tracked mono caps over a hairline, `###` at
14.5, `####` at 12.5 — because ⌘E between the two must not change the size of a
single word. Nor is the editor its own scroller: the pane scrolls it, head and
all, exactly as it scrolls READ.

## What the editor draws

**Syntax is back only where you stand — that piece of it, not the paragraph
around it.** A `**`, a `*`, a backtick, a link's `[` and `](url)`, a wikilink's
`[[` and `]]` and its path or `target|`: each is hidden until the caret touches
that one token, and then only that token's marks come back, faint. Revealing
every mark in a ten-line paragraph the moment you touch one word is the mess
this surface exists to end.

A hidden mark is **gone from the layout, not squeezed to nothing**: `display:
none`, not a zero font size. The zero-size version looks the same and breaks the
one thing a live editor must never break — a click past a hidden `**` asked the
editor for a position and got one forty characters back, because a glyph with
no width still answers for the point beside it. `live-md.js` clicks past a
hidden mark and reads the caret, and fails with the zero-size rule put back.

**The word keys count what is on screen.** `⌥⌫`, `⌥⌦`, `⌘⌫`, `⌘⌦`, `⌥←` and
`⌥→` are CodeMirror's own rule for a word, run over the characters you can see:
a hidden mark is stepped over, never taken as a word of punctuation and never
deleted on its own. Read off the document instead, `⌥⌫` after `**bold** ` took
the space and the `**` and left `**bold` on the page; after a wikilink it took
`]] ` and the target came out of hiding mid-sentence. So a mark stays with
whatever words it still wraps, and a token left wrapping none is taken away
whole — `⌥⌫` twice after `[[projects/x|kickoff notes]] ` leaves nothing of
it in the file. When the last word of a bold phrase goes, the space that goes
with it is the one inside the phrase, so what is left is `**bold** `, which
every markdown reader closes, rather than `**bold **`. `⌥←` lands at the start
of the word and `⇧⌥←` takes the token whole, so `⌫` on it leaves no half of a
pair — a phrase of several words too, over as many presses, although the first
press brings its marks out: while the selection's fixed end is outside a token,
the token's marks count as they are drawn with nothing selected, so the second
press does not stop against the `**` the first one showed. A token the caret
touches has its marks shown, and shown marks are ordinary characters again. An
item's marker is furniture to these keys too: `⌥⌫` or `⌘⌫` at the start of its
words takes the item away as `⌫` does, `⌘⌫` further in clears the words and
keeps the box, and `⌥←` from the start of the words goes to the line above.
`writing.js` presses each of them and reads the file.

**A selection taken away takes what is seen in it — never one mark of a pair.**
A selection that reaches into a bold phrase, a link or a code span from outside
it holds some of its words and one of its marks, and `⌫` used to take the mark
with the words: `**alpha data c** x` with `c** ` selected became `**alpha data
x`, the phrase left open and its stars on the page. So deleting, cutting, typing
or pasting over a selection keeps the marks of anything it only partly covers,
the way a word processor keeps the bold on the words it did not take; what is
typed goes where the selection's first seen letter was, and so takes that
letter's mark; a phrase all of whose words go goes whole rather than leaving
`****`; and a mark left against a space inside its phrase moves past it, since
`**data **` is bold to READ but to no other reader — so double-clicking the
first word of a bold phrase and deleting it leaves the phrase as `**data**` with
the space before it, not `** data**`. The space is kept, just outside. A
selection of nothing but marks is deleted as it is: marks you can see, chosen on
purpose. A caret's `⌫` is never touched — beside a token its marks are shown,
and a shown mark is a character. What is copied keeps its marks whole the same
way: when a selection takes one of a phrase's marks, the part of the phrase it
covers is copied inside both, so `c** x` cut from `**alpha data c** x` is `**c**
x` on the clipboard and pastes back as it was — the bare `**` used to go with it
and run the phrase on into the words after. Words copied from inside a phrase,
no mark taken, are the words, for wherever they go. Text dragged is taken from
where it was as a selection is, and lands out of any mark the pointer came down
on. `checks/edit-fuzz.mjs` holds it over tens of thousands of random selections,
within a line and across lines, deleted, typed over, cut and pasted back and
dragged, to one rule: what READ shows afterwards is exactly the words that
should be there, and no mark on its own.

**A line break never falls inside a phrase.** A bold or italic phrase, a code
span, a link's words and a wikilink's title are each one line to READ, and `↵`
in the middle of one left `**bold ` on one line and `words**` on the next — stars
on both. So the phrase is closed before the break and opened again after it,
`**bold**` over `**words**`, the space either side of the `↵` going with it; at
the start of a phrase's words the break goes in front of the phrase, and at
their end after it. In a list the new item's marker comes between. Text pasted
or dropped into a phrase that brings a line break, or marks of its own that no
phrase can hold, goes in the same way: the phrase closed before it and opened
after, the text as it came.

**A double-click takes the word you pointed at.** The first click puts the
caret in a token and brings its marks out, so the line moves under the pointer
before the second click comes — and read against the moved line, a double-click
on "notes" in `[[projects/x|kickoff notes]]` selected `projects`, a piece of
a target nobody could see, and what was typed next rewrote where the link goes.
The word is taken at the caret the first click put down, which was read against
the line you were looking at. A drag that goes on from it extends by words
against the page as it is by then.

**Nothing jumps.** Revealing syntax must not move the words you are looking at,
so the markers that open a line are drawn as furniture and are never revealed at
all. A bullet is a `–` in a column of its own, as READ draws it; a task is a
box, and a click on the box ticks the `[ ]` in the source without moving the
caret; a quote's `> ` gives way to its rule. The caret can never stand inside one
of them — it is moved to the start of the words whichever way it came in,
because a caret between a dash and its words is standing on something that is
not there, and typing there would push the words out from under their own
bullet. `Home` and `⌘←` land on the words, not before the dash. The one
exception is `←` from the start of an item's words, which means "go back", and
back is the end of the line above. An ordinal is the other way
round: `1.` is the only rendering an ordinal has, so it stays, as text you can
edit.

A caret the app puts down lands at the words too. Opening a note starts the
caret at the top of the body, and no keystroke put it there, so nothing moved it
past the marker: a note that opens with `- [ ] milk`, left for READ and come
back to, took what was typed in front of its box — `eggs - [ ] milk`, a task no
more — and one that opens on `## Section` became `Intro ## Section`. It starts
past the marker now, and past a heading's hashes, and so does `↓` out of the
title. And `⌘Z` puts back the caret it recorded without asking the rules above,
so where the disk had since made a line an item, it put the caret back inside
the new marker; it is moved out of the furniture straight after.

**A heading's hashes hang in the left margin**, the way iA Writer hangs them:
shown on the line you are in, hidden on every other, and never taking room from
the words, so showing them shifts nothing. A `##` stays in caps while you are
on it — the letters changing as the caret crossed the line would flicker under
the eye, and its hashes coming back already say where you are. Only inline
marks take space when they are shown, and only the one you are in.

**A blank line is a line.** Between paragraphs it is drawn at the body's own
line height, as a text file has it and as iA Writer draws it — the space after a
paragraph is the blank line you typed, all of it, so a paragraph reads as one.
Anything less — a third of a line, or only the padding two paragraphs keep —
barely shows on either surface, and any difference between the two moves every
paragraph when you press ⌘E. READ leaves the same whole line wherever a blank
line parts two blocks, so ⌘E moves no paragraph, and a double-click in that
pause writes on the blank line it stands for. A thread does too: a reply's
paragraphs are parted by blank lines like a note's, rather than 4px apart in one
slab (`checks/pause.js`, which measures 24px on all three). A line break inside
a paragraph is a line, with nothing added. Being a whole line already, a blank
line between paragraphs does not move when the caret steps onto it. Beside a
heading a blank line is the heading's own air rather than a pause: the heading
gives up that much of its margin, so the distance from a heading to its words is
READ's — within 2px under a `###`, whose air in READ is less than the blank line
it gives up — and that one, short, opens to a line while the caret stands on it,
so there is room to type into it. A fence's ```` ``` ```` lines fold away and
come back while the caret stands on one, the way a heading's hashes do — not
the moment the caret enters the block. The opening
fence is above the code, so bringing it back then would move every line of the
block down under the pointer that just clicked there, and a double-click on a
word would take the word above it.

**Syntax comes back only while the editor has focus.** With the caret elsewhere
— typing in the thread beside it, say — the last caret position is not somewhere
you are standing, and its marks stay put away. Elsewhere means another element
taking focus, NOT the window losing it: ⌘⇥ to another app and back must not fold
a line's syntax away and unfold it again, reflowing the line twice for a trip
that touched none of it.

Fenced code, tables and a fold's tags are runs of lines, and where they start
and stop is READ's rule too, not CommonMark's. A table ends at the first line
that does not start with `|`, so a sentence written straight under one is a
sentence and not a fourth row; a fence runs from ```` ``` ```` to the next
```` ``` ````, and `~~~` fences nothing; the only HTML drawn as HTML is a fold's
own `<details>`, `<summary>` and `</details>` — a `<br>`, an `<aside>` or a
comment is prose, as it is in READ, and so are the lines under it. Code sits on
the code ground, tables and a fold's tags in the small mono. The runs are found
once for the whole note and kept as it changes: an edit reads from the run
above it until the note is back in step, which in prose is a few lines however
long the note. An edit that leaves a fence open reads on to the end, because
READ runs that fence to the end too — about 2.5ms on a note of tens of
thousands of lines.

An empty body says `Start writing…`, faintly, so an untouched note is not a
blank you have to decode, and a click in the room under the last line puts the
caret at the end.

**The grammar is READ's, not CommonMark's.** The parser underneath speaks
CommonMark, and READ does not: it has no `_underscore_` emphasis, no
strikethrough and no setext headings, and a `##` indented under a list item is
prose to it. An editor that rendered CommonMark would show `_this_` italic while
you wrote it and literal once you pressed ⌘E — the WYSIWYG that does not work,
which is what this surface was rebuilt to end. So which lines are headings,
lists and tasks, and which runs are bold, italic, code and links, comes from
`shared/mdLive.ts`: READ's own `parseRuns` and `parseNote` line tests, and
`parseNote`'s rules for where a fence, a table or a fold runs, restated with
positions. So does what `↵` carries on — see [Keys](#keys). There is no
CommonMark parse underneath: the one thing it would be kept for, `↵`
continuing a list, it gets wrong for this page, and it costs more per keystroke
than everything else the editor does.

Restating a grammar is a way to fork it, so `checks/md-live.mjs` holds the two
against each other on a whole vault rather than on examples chosen to pass —
the sample vault in `fixtures/` by default, or any folder given as
`LANES_VAULT`, which it only reads. Every line's visible text, every
single-line block's kind and every line's place in a fence, a table or a fold's
tags must agree; and through four edits to every note, the runs the editor kept
must be the runs read again from scratch.

**Highlights are a marker.** `==words==` is drawn as iA Writer and Obsidian
draw it: the words on the highlight colour, the marks put away as bold's are,
in READ and WRITE alike — colour only, so nothing moves. It wants words at both
ends, so `a == b` is the comparison it is, and it can hold bold, a link, or a
comment's anchor and its comment whole. The colour is picked in Settings (⌘,):
yellow, green, blue, pink, purple or grey, each with its own value in the dark.
The yellow is lemon rather than find's amber, so a find hit in a highlight
still reads as one.

## The title, typed where it stands

In WRITE the head's title is **a field, not a label**: the note's `# ` line,
editable in the place it has always been said and in the type it always has.
The editor hides that line, and the one blank line under it — the gap between a
title and what follows rather than something anybody wrote — since drawing it
again as the first line of the document is the same words twice, and READ
already refuses to. So ⌘E between the two moves nothing. The title is the
first line that is not blank, as READ has always counted it — plenty of notes
have an empty line under the frontmatter and the heading after it.

The hidden line is **out of reach of everything but the title field**. A
selection dragged up past the first line of the body stops there, `⌫` at the top
goes up into the field rather than joining the words onto a line you cannot see,
`⌥↑` will not move a line into it, and any other edit that would have touched
it is refused whole. Only two things change it: the field, and a body
arriving from disk. The field's writes stay out of the editor's undo history —
a title is renamed in its field, not unpicked a keystroke at a time from the
words below it.

What is hidden is settled when the note opens, and writing below it does not
move it — yours, or a change from outside further down the note; only one that
reaches the top of the note settles it again. Under a title with no blank line
after it, the blank line `↵` opens at the top of the words is one you wrote, so
it stays on screen and `⌫` takes it back. A note that is nothing but its `# `
line — nothing in the app makes one, but a file from outside can be — gets the
line under the title to write on, so the title is still said once and the caret
starts under it; that line break reaches the file with the first change you make
— a word typed there, or a new name in the field — and not before.

Typing in it rewrites the `# ` line live, and inserts one if the note had none.
`↵`, `↓` or `⇥` carries the caret down into the words; `↑` on the first line of
the body, or `←` or `⌫` at its very start, brings it back up. It is one document
with the words under it. The field is plain text only — a title is one line of
words, and a pasted heading must not bring its formatting or its line breaks —
and it commits on `↵` or when you click away, once per settled title. The tab
strip and the rail follow the `# ` line as you type, a moment behind, once the
save has caught up.

`⌘A` in the editor selects the body you can see and not the hidden title line,
because ⌘A and then typing must not quietly replace a line that is not on
screen. In READ the title is what it always was, a label that a double-click
renames, and *Rename…* works in both.

## Keys

The writing rules, all in the editor's own keymap:

- **`↵`** continues a list, a task or a quote, and renumbers an ordered list —
  the line split at the caret, the next one starting with the same marker, a
  task's box empty and an ordinal counted on, the items under it counted on
  too. What is a list and what is prose is READ's to say, as it is for the
  drawing: a line of prose typed straight under a quote is prose on the page,
  so `↵` there is a new line of prose, and a `3.` straight under a sentence is
  an item, so `↵` after it is `4. `. CommonMark's answer, which `↵` used to
  ask, was the other way round on both — it put you back in a quote the page
  showed you had left, and gave a bare line under a list the page drew.
  **`↵` on an empty item leaves the list** rather than laying down another
  marker nobody asked for — a nested one steps out a level first — and leaves a
  blank line behind it, because to any other markdown reader words typed
  straight under an item are part of the item. An empty `>` line leaves a quote
  the same way. `↵` at the start of an item's words puts a new item ABOVE and
  keeps the caret on the words, which is what `↵` at the start of a line does
  anywhere else — an ordinal's new item taking its number, and the items from
  there down that list counting on; at the start of a heading's words it opens
  a line above the heading.
- **`⌫` at the start of an item** takes its marker away. The marker is
  furniture, so this is the way back to prose by keyboard.
- **`⌦` at the end of a line** brings the next line's words up, and its marker
  goes: `- ` and `- [ ] ` were furniture on their own line, and joined as they
  were they came up in the middle of this one as text nobody typed. `⌥⌦` and
  `⌘⌦` there are the same. On an empty line `⌦` takes the line away and the
  item under it keeps its marker.
- **`⇥` and `⇧⇥`** indent and outdent a list item, or the lines a selection
  covers; anywhere else `⇥` types two spaces.
- **`⌘B` and `⌘I`** make the selection bold or italic, and plain again if it
  is already. READ has no bold italic, and no mark inside the other —
  `***word***` is a bold word between two stars there — so on a word with the
  other mark they trade it: `⌘I` makes a bold word italic, `⌘B` an italic one
  bold. In a phrase of several words the phrase is what they act on, as READ
  reads it: a selection of the whole phrase, marks and all as `⇧⌥←` takes it,
  is taken off or traded; a word selected inside the phrase is split out of it
  — `**one** two **three**`. A selection across the edge of a phrase becomes
  one run, and never ends inside a code span, a wikilink or a link's URL, where
  the stars would be drawn as stars. A selection of several lines is marked a
  line at a time, in each line's words only — a run never passes a line break,
  and an item's marker or a heading's hashes are not words: a triple-click takes
  a line and its break, and one pair around both made `**- milk\n**- eggs` of a
  list. They used to read only the stars beside the word, and gave `**bold
  **whole** words**`.

  With nothing selected they work as a word processor's do. In a phrase, the
  phrase: `⌘B` takes the bold off all of it, `⌘I` trades it. Inside a word, the
  word — and the caret stays where it was; the word used to come back selected,
  and the next letter typed replaced it. At a word's edge or between words, a
  pair to type into, which the same key takes back up if nothing went in —
  `⌘B` twice made `****¦****`. And at the end of a phrase's words the key ends
  the phrase: the caret steps out past its closing mark, so `⌘B`, a word, `⌘B`
  and on is a bold word and then plain — the second `⌘B` used to take the bold
  off the word just typed. Just past a phrase, the key steps back in.
- **`⌘↵`** makes the line a task, or ticks it, or unticks it.
- **None of it in code.** In a fenced block a `- ` is a dash, a `# ` a comment
  and a lone `>` a prompt — drawn as written, and edited as the characters they
  are: the caret reaches the start of the line, `⌫` deletes backwards the way a
  code editor does (one character, or one indent among the spaces a line opens
  with), `←` goes one character left, `↵` is a plain newline, `⇥` types two
  spaces, `⌘↵` leaves the line alone, and `[[` is two brackets — no pair
  closing itself, no list of notes. A table's rows and a fold's tags are the
  same. Which lines those are is READ's answer — the runs the drawing paints
  from — so the keys and the page never disagree. HTML is not code to READ, and
  so not to the editor either: a `- ` under a `<div>` is an item in both.
- **`⌥↑` and `⌥↓`** move the line.
- **`⌘Z` and `⇧⌘Z`** are the editor's history over the whole note — typing,
  list keys and ticks alike, one undo the whole way down, which is exactly what
  the block editor could not be. The app's own `⌘Z`, which steps a note's saved
  changes, acts only when no field has focus. A body that arrives from disk is
  kept out of the editor's history: it was not yours to undo.
- **`esc`** is the way out of WRITE, and out means the words written in this
  stretch go — so it asks first. With nothing written (nothing typed, or typed
  and taken out again) it simply leaves for READ. With something written, a
  dialog over the note asks whether to put it back as it was when it went into
  WRITE, and it is built so it cannot be answered by accident: the caret is on
  *Keep writing*, `esc` in the dialog is no — so `esc`, `esc`, `esc` opens it,
  closes it, opens it, and never throws a word away; a held `esc`, the key
  repeating, is one press — `↵` is no as well, and a click on the veil is no.
  Yes is a click on *Discard*, or `⌘⌫`, never a key you might already be
  pressing. What goes is only what this stretch wrote: a change that arrived
  from outside meanwhile — Claude, editing the note beside you — stays, because
  the editor keeps what would undo the stretch as the writing goes and carries
  it over every change from outside (`stretch` in `lib/editorLive.ts`). The
  editor's own history could not answer that: it runs back past the stretch,
  being kept across READ and tabs, and holds a hundred steps. The discard is an
  edit, saved like any other, so `⌘Z` in READ brings the words back, and so
  does the editor's `⌘Z` the next time you write. `⌘E` remains the way out
  that keeps everything. In the head's title `esc` asks the same, and a title
  thrown away names nothing: the field, going away with WRITE, used to commit
  what it held, which on an untitled note is a rename after the very words
  being discarded. `checks/esc-discard.js` holds all of it.
-  **`⌘`-click** opens a wikilink or a vault path in a tab of its own, and an
  ordinary link in the browser. A plain click in the editor is a caret, so
  following has to take the modifier — and `⌘` is the one that means a tab of
  its own everywhere else in the app, which is what following out of a note you
  are writing wants anyway: the note stays in the strip. Holding `⌘` takes a
  link's faint underline to full ink and gives it the pointer. A link to a note
  that does not exist yet makes it, in the new-note folder, and opens it —
  writing `[[a name]]` and `⌘`-clicking it is how a note grows another.

**Typing is not a shortcut.** The window answers keys of its own, and a key
typed into a note must not fire one, so every key without `⌘` or `⌃` stops at
the editor — ahead of the editor's own keymap, since a key that keymap handles
ends the editor's handling there, and a stop placed after it never ran: `⌥↑`
moved the line and then went on to the window, whose `⌥↑` steps the rail to
the row above. `⌘` and `⌃` chords go through to the app, and so do the three
`⌥` chords that are the app's own — `⌥⇥` to the other pane, `⌥1` and `⌥2` to
put a part of the window away.

**`[[` asks which note.** A link to another note is the one thing in a note you
cannot type from memory: the path is `projects/kitchen/kickoff-notes` and what
you remember is "the kickoff". So the second `[` closes itself — `[[` becomes
`[[|]]` with the caret between, and a link is never left open by a thought that
moved on before the brackets did, a `]` typed out of habit steps over the `]]`
rather than adding to it, and `⌫` straight after the `[[` takes the `]]` back
with the `[` it came with — and two letters in, the vault's notes come up by
title, from the same search ⌘K runs, with what you typed drawn in each title it
matched. Taking one writes **the shortest link that lands**: the bare name when
the vault resolves it to that very note, the path only when the name alone would
land somewhere else, aliased with the note's title when the two differ
(`[[kickoff-notes|Kickoff notes]]`) so the page shows the title and never the
slug. The caret lands after the `]]`. The note you are writing in is not
offered — a link from a note to itself is never the one you were reaching for.
A name no note has yet is offered too, as a *new note*: the link is written, and
`⌘`-click makes it. `checks/link-complete.js` holds all of it, two notes of one
name in two folders included. While the list is
open `↵`, `esc` and the arrows are its. It hangs off the page rather than the
pane, because the pane clips its overflow and a list cut off at the pane's edge
is a list you cannot choose from.

**Focus and typewriter** are the writing bar's two aids, and both work in the
editor: focus stands down every paragraph but the one the caret is in, and
typewriter keeps the line you are on at one height — with room left under the
last line to park it, or it would simply stop working over the final screenful.
It parks for the keyboard and not for the pointer: a click is you choosing a
place on the page, and a page that moved under the pointer as you clicked would
fight every drag and every double-click on a word. The next key parks it.
Both are app-wide, because they are how you write rather than facts about a
note.

## Saving, and a note edited from outside

**What you type is local until you pause — or for a few seconds, whichever is
sooner.** The editor hands the pane the document after 150ms of quiet, the pane
hands it to the app 250ms after that, and the app writes the file 500ms later —
each note on timers of its own, so the last words of the note you left go to the
note you left and not to the one you opened. Handing over each character would
mean a store write and a render of the whole window behind it, for a change only
this pane can see. A quiet timer alone would never fire for someone who types
without stopping, so each has a ceiling as well: the editor hands over at least
every two seconds and the app writes at least every three, and a long stretch of
typing is on disk a few seconds behind the caret however long it runs. Leaving
the editor settles what is owed at once, and so does changing mode, changing
note, or the pane going away.

**Words on their way to the file are newer than the file.** A note opened again
before its last words have landed — ⇧⌘T a moment after ⌘W, its row, ⌘[ back to
it — is read from a file that does not have them yet. That read used to be
taken: the note came back as it was before them, out of the editor's history so
⌘Z could not help, the save landed where nothing showed it, and the next
keystroke saved the old text straight back over it. Now whatever is still owed —
on the save's timer, or in the write itself — stands in for the body until it
lands. `note-sync.js` closes a note a breath after a word, reopens it at once,
and reads the word back from the screen and then from the file under the next
word typed.

**Quitting does not wait on a timer.** When the window closes, whatever is still
owed is written synchronously before the page is torn down — an asynchronous
write sent from a page that is going away is a write nobody is left to finish —
and main holds the quit until its queue of writes has drained. `note-sync.js`
types a word and fires the window's way out twenty milliseconds later, far
inside every timer, and reads the word back from the file. That last write
checks the file first, as every other save does: if something wrote to it since
the app last looked — Claude, a moment before the window closed, before any poll
had seen it — the note keeps what it has and the last words go beside it as
`… (conflicted copy).md` — and a second copy is `… (conflicted copy 2).md`, never
the first one written over. A save main had already started when the window's
write jumped the queue — reading the file, or still writing it — does not land
its older words on top of the final ones: one that finishes writing after them
puts them back. And a note renamed with the reply still on its way takes its
last words where it went, rather than making the old file again.

**Writes are queued, and the newest wins.** Main writes notes one at a time, in
the order they were asked for, and a write that has been overtaken by a newer
one for the same note stands down rather than landing late on top of it. Each
write carries the mtime the app last saw the file at, and main will not write
over a file that has changed since: it answers *conflict* and writes nothing. A
read of a note waits out that note's own queued write — a write empties the file
before it fills it, and a note read in that moment came back empty or cut off
mid-sentence — and only that note's, so opening one never waits on another's
save. A file deleted from under an open note is written back, since the words
on screen are the only copy left. A write that fails for any other reason is
retried, and the note's head says *not saved yet — trying again* until it lands.

**Main knows its own changes.** It keeps the mtime of the changes it makes on
its own — a rename's heading, a link a rename rewrote — and a file still at that
mtime has changed only by main's hand, however far the app's idea of it has
fallen behind. It keeps the mtime each of the app's saves left, too, for the
window's last write: closing a moment after a save landed, its reply still on
the way, used to send the last words to a conflicted copy and leave the note
with older ones — now the app says a save is out, and main compares against
what that save left. A rename rewrites the links in the notes that point at the
renamed one, and the renamed note's heading, while an editor may be open on any
of them with words on their way:
those words are saved with the same rewrite made in them — not refused as a
conflict with nobody on the other side, and not writing the dead `[[alpha]]` or
the old heading back — and the editor takes the rewritten words up once nothing
of its own is waiting. The app's poll, seeing the mtime move under words it has
yet to save, asks main whether the change was its own before it calls it a
conflict. Each rewrite stops the first time it finds nothing to change: the
editor has the new words then, and a title written back on purpose stays
written.

**A save follows the note, and never outlives it.** One write of a note is on its
way at a time — a write sent while the last was still in main carried the mtime
from before it, and main took the app's own save for somebody else's: a banner,
and every save after it held. A rename or a move holds the note's saves until it
has landed, and hands them to the new path; and a save main had queued for the
old path before the move goes where the note went — it used to run after the
move, find nothing there and make the file again, a stray `untitled.md` holding
the first sentence while the named note, read back from disk, went on without
it. A note put in the Trash takes everything still owed to it along, the words
the editor and the pane were still holding included, and main stands down any
save of it still queued: the note you had just thrown away used to come back.
`checks/note-moves.mjs` runs main's queue itself through each of these, and
the app's side is `jot.js`, `note-ops.js` and `note-sync.js`.

**Unsaved work is keystrokes, not an open editor.** The note is polled for its
mtime every four seconds, since a vault in a cloud-synced folder delivers no
watch events to rely on. The
poll used to be told "the editor is up", which made every note you were merely
looking at a conflict the moment anything else touched it — and the thing that
touches a note beside a thread is Claude, editing it. Now it is told whether
anything typed here has yet to reach the disk. With nothing owed, the change
**loads into the editor silently, under the caret**; the banner — *This note
changed on disk while you were editing it* — is for the case where both sides
have something to lose, and only that one. It offers both ways out: **Keep
mine** writes what is on screen over the file, and **Load the version on disk**
throws away what was typed here and takes the file's. Until one is chosen,
nothing more is written to that note, and it does not move: *Rename…* and *Move*
are refused, and so is naming an untitled note — a move writes its heading over
the file that changed, and the held words used to follow it to the new name,
over the other side's version. A window closed on a conflict writes the words
on screen beside the note as `… (conflicted copy).md`, the way Dropbox keeps
both sides, rather than over the version that caused it. The conflict belongs
to the note, not to the pane: switching away and back finds it still there, and
any number of notes can be waiting for an answer at once — the app used to hold
one, and a second note's conflict took the first one's banner away. The app
remembers the mtime of its own last write, so its own save is never read back,
one poll later, as somebody else's.

**Asked and handed over in one step.** The poll asks whether anything is owed
and, when nothing is, puts the new body into the editor before it returns — the
window's render, the pane's taking of the body and the editor's all run inside
that one call. Left to React's own time they came a task or two later, and a
key struck in the gap was owed by the time the editor looked: the new body was
passed by as older than the typing, nothing offered it again, and the save of
that key went over Claude's edit with no banner, since the mtime had already
moved on to it. Now a key before the question is owed and gets the banner, and
a key after it lands on top of what arrived; the mtime moves on only once the
words are in, which is when it is true.

**It arrives as the changes that were made.** A body from outside is applied as
edits rather than as a replacement, and the caret is carried through them: a
change above it pushes it down, a change below leaves it alone. That is only as
good as the edits. One hunk from the first difference to the last — the obvious
shortcut — swallows everything between two changes, so Claude adding a
paragraph at the top and a line at the end would throw you out of the sentence
you were in. `lib/lineDiff.ts` sets the common lines at each end aside, diffs
the middle properly (Myers), and trims every hunk to the characters that differ,
so an edit to the very line you are on keeps your place in it too. A middle that
differs in more than a thousand places falls back to one hunk — correct, merely
less careful about the caret, and only on a rewrite of that size.

`checks/line-diff.mjs` proves the diff exact over 5,000 random edits and careful
on the two-edit case, and `checks/note-sync.js` watches it happen in the app:
an outside write reaches the open editor on the next four-second poll, with no
banner and the caret on the same character.

## A note, now

**⌘N is a note, not a question about one.** It is for a thought you want down
before it goes, and "what shall we call it" is the question that loses it. So
the note is made at once, nameless — `untitled.md`, then `untitled-2.md`,
`untitled-3.md`, in the new-note folder (Settings → Notes & lanes, *New notes
go to*: the vault root unless you name a folder, made if it is not there yet,
and the root again if the one named is kept read only) — and opened in WRITE
with the caret in the head's title, which says *Untitled* in grey until you
write over it. `↵` goes down into the words, with a name or without one. The
`+` menu's *Note*, the empty note pane's *New note* and the palette's nameless
*New note* are the same act by other routes.

**The first letters are the new note's, however soon they come.** Making the
note is a round trip to main — behind any save already in its queue — then a
read and a render, and a thought typed straight after ⌘N waits for none of it.
Until the note was on screen the caret was still where you left it, so those
letters went into the note you had been writing, and were saved there. The
keystroke now takes the caret at once, into a field nobody sees, and what is
typed there is typed again into the new note's title the moment it takes the
caret — a `↵` among it going down into the words, as `↵` in the title does.
A real field rather than a key listener, so an input method, a dead key and
`⌫` work in it as they would anywhere, and ⌘ chords pass it by. The hand-over
is made by the note taking the caret, not left to the field's blur — a window
at the back is sent none, and the letters waited out a three-second backstop —
and past a `↵` the words go into the editor as a change to its document, not
to its page, since a render landing in the same instant throws away page
changes the editor has not read yet. If the note cannot be made, the caret goes
back where it was and the letters with it. It holds from anywhere — a note on
screen, a blank tab, a window with no note open at all. With no note on screen,
the head's title field reached the note through a link the pane made a beat
after the letters were handed over, so the title went into the field and
nowhere else, and what followed the `↵` was typed into the title. See
`lib/typeAhead.ts`.

A file before there is a name, because the note is being typed into the moment
it is asked for, and what is typed has to be saved somewhere. It starts as an
empty `# `, which main reads as no title and which gives the naming a line to
write into. **Until it has a title, a note is called by its first line of
writing** — up to sixty characters of it, in its tab, its rail row, the note
list and the head's grey placeholder — because six notes called *Untitled* are
six notes you cannot tell apart, and the first thing written down is nearly
always what the thought was about. The head's field stays empty all the same: a
placeholder is not a title, and nothing is renamed until you write one. The
next nameless
note is the first free number, found by trying to create the file rather than by
asking the index, which can be seconds behind the disk.

**The title names the file** when you commit it — `↵`, a click away, or
leaving it any other way: `⌘1`–`⌘9` or `⌃⇥` out of the field used to read its
words from an element React had already let go of, and name nothing. An
untitled note, and only an untitled one, is renamed to the slug of its title in
the same folder, through the same path a tab's *Rename…* takes, so the heading is
written and every wikilink follows. Everything typed goes to disk first, since
the rename moves the file and a save still in flight would otherwise land after
it. The editor is keyed by the note's identity rather than its path, so naming a
note mid-sentence does not tear the editor down under the caret or take its
history with it. A note that already has a name keeps its filename when its
title is edited, exactly as editing the `# ` line always has; renaming one is
*Rename…*, which says so. A title whose slug is already taken in the folder
takes the next free one — `kickoff-2.md` — rather than leaving the note stuck
as `untitled.md` with a name in its heading and nothing on screen saying why.

**And the details say which file.** The title is what a note is called; the
file is what a terminal, a script or a link Claude writes knows it by, and the
two only usually match. Click the meta line and **File** follows **Folder**:
the filename on its own, since the folder is the row above, in mono — it is a
name the machine knows the note by — and whole. Cut to one line like the other
facts, a long filename lost exactly the end that tells it from its neighbours,
so this one wraps instead. It is selectable, for copying, and it follows a
rename where it stands: `untitled.md` becomes `kickoff.md` without the panel
closing. `checks/note-file.js`.

**A note made and never written in goes when its tab closes.** ⌘N is cheap on
purpose, and a thought abandoned before its first word should not leave
`untitled-7.md` in the vault for somebody to find later and wonder about. Only
an untitled note, only an empty one — nothing typed in its title or under it —
and to the system Trash, from where it can be had back. A nameless note with
words in it stays, named by them.

**Making a note does not rebuild the index.** Throwing the index away on every
new note would mean the note could not open until the note list and the note
itself had built it again — a few milliseconds over a scratch vault, and a
second or more between the keystroke and the page over a vault of seventy
megabytes. So main **grafts** the change
into the live index — the new note, and the notes whose links its name may now
answer — and a rename or a move is patched the same way, since a rebuild paid at
the naming would only move the wait from the making to the naming. **Nothing
waits on a build.** A note made while one is running — the first seconds after
launch, or the sweep rebuilding after Claude wrote to the vault — does not wait
it out: the running build is marked out of date, and the next reader that needs
the index builds one that holds the note, in the background. Opening a note
does not wait either; the index only adds its backlink count, and a note opened
before the index exists shows 0 for a moment rather than nothing for a second.
And the app's own saves patch the index as they land, so thirty seconds after
you stop typing the sweep does not find a changed vault and rebuild all of it.

With that, and the rail redrawing only when what it shows has changed (see
[The rail](threads.md#the-rail)), `checks/jot.js` times **⌘N to the caret in
the new note's title** over a vault seeded with 1,500 notes (about 60MB),
the index warmed before the clock starts, and fails it at 400ms in the
development build.

## The four heading levels

They have to be told apart at skimming speed. A heading smaller and quieter
than the prose under it — a 9px mono `##` in `--mute`, a 12px `###` over a
13.5px body — is less present than the text it is meant to divide, and a
section is then found by reading rather than by scrolling. And `####` is a
heading too: a note that reaches four levels should not see its hashes drawn
as words.

So the headings carry presence, not a new voice. `##` keeps the uppercase
tracked mono the design gives everything structural — it opens a section, and a
section heading is a label for the blocks beneath it — but at full ink, at a
size you can read, **over a hairline that runs the measure**. The rule is what
the eye actually catches: caps alone are a texture, a rule is an edge. Below it
the ladder is sans and descends by size and by weight of colour — 18 / 14.5 /
12.5 against a 13.5px body — each with more air above than below, so a heading
belongs to what follows it rather than floating between two sections. Six hashes
are drawn as four: a note that has reached five levels is not helped by a fifth
size.

The outline went a step louder with them, because it must read as the same
hierarchy at the same volume or it stops looking like the note's own contents.
And the editor sets the same four at the same sizes — `##` in caps over its
rule, except on the line you are writing it — so a heading does not change
size when you press ⌘E. `checks/headings.js` holds all of it.

## Collapsible sections

A note can fold. `<details>` is not markdown, and that is exactly why it is
here: markdown has no syntax for a section you can put away, so every host that
wanted one — GitHub, GitLab, Jekyll — settled on the same scrap of HTML instead.
A vault of long notes wants it, and without it the tags rendered as words in the
middle of the prose.

```markdown
<details>
<summary>What the studio actually claims</summary>

Anything a note can hold goes in here — headings, tables, fences, tasks,
and other folds.

</details>
```

**The tag need not have its line to itself.** `<details><summary>…</summary>`
written on ONE line is the form every example anybody copies uses — a parser
that could not read it would produce no folds at all and show the raw tags as
words in the middle of the prose. What the opening line carries after the tag
is the fold's first body line, and `bodyFrom` moves with it: prepend without
moving it and every block inside the fold claims the line AFTER the one it
came from, which is where a double-click on it would then put the caret. The
depth counter reads the same shapes as the opener, or a one-line fold inside
another closes its parent early.

The `open` attribute is tested against the ATTRIBUTES and never the summary.
Fold the two into one capture and a section labelled "…and the one open
question" would silently start expanded.

What is still not a fold: a tag anywhere but the start of a line. `Use the
<details>` mid-sentence, and `` `<details><summary>…</summary>` `` in backticks,
are both prose, and that anchor is the only thing telling a real fold from
writing about folds.

`<details open>` starts open, and folds nest. The body is parsed by the same
`parseNote` as everything else, which is what makes "anything a note can hold"
true rather than aspirational, and its blocks are shifted back into the note's
OWN line numbering — so a paragraph inside a fold still knows the line it came
from: a double-click on it puts the caret there, and a copy across it hands
over the right markdown. That shift has to recurse, or a fold inside a fold
points at the wrong line.

READ draws the browser's own `<details>`, restyled: a chevron that turns, the
summary, and a rule carrying the eye across so the row reads as a divider. The
body hangs off a hairline the way a blockquote does. Native rather than
hand-rolled because it is keyboard operable and announced correctly for free.
The `open` state is set ONCE on mount and then belongs to the element — handing
React the prop would make every redraw of the note an opinion about which
sections should be open, and a note redraws on every ticked checkbox.

Three things look INSIDE a note in READ, and all three had to learn about
folds: the outline's jump opens the folds in the way, the reading mark skips a
heading with no box rather than treating its zeros as a position, and `⌘F`
opens a fold to show you a hit — which is what the browser's own find does.

The editor does not fold. In WRITE a fold is the source that makes it: the tag
lines are set small, mono and faint, as the scaffolding they are, and what is
between them is written like any other part of the note.
`checks/details.mjs` holds the parse and its spans, and `checks/fold.js` the
rest, in the app.

## A note as a PDF

`pdf`, beside `copy` in the writing bar, or *Export as PDF…* on any note's
context menu — including a note you are not looking at, since main reads it
itself.

**The PDF cannot drift from the screen, by construction.** A hidden window loads
the app's own bundle with `?print=<path>` and mounts the same `Doc` component
the pane mounts, with the same stylesheet. A second renderer written for print
would have looked right the day it was written and been wrong the next time the
heading scale moved — which in this app was the same week. There is one thing
that knows what a note looks like, and this is it, given a different page.

Five things differ, and each is a fact about paper: it is **light** (a dark
export is either ink you cannot read or, with backgrounds dropped, a page that
looks blank); it is **whole** (READ stops at 1,500 blocks and offers you the
rest, and every fold is opened, because paper cannot be expanded and a silently
truncated page says nothing about what it left out); it has **no chrome and
nothing hot**; it carries a **head**, since the pane says the title above the
body and nothing else on paper would; and it has **no comments** — see
[Comments in a note](#comments-in-a-note).

What the main process owns is everything that can go wrong around that, and it
is more than it looks. Measured against Electron 43.4.1 (the lockfile now holds
43.7.10):

- `printToPDF` on a window that has never navigated **crashes the app with
  SIGTRAP**. It is a Chromium CHECK, not an exception — `try/catch` does not
  save you — so nothing reaches the print call unless the load resolved.
- A `data:` URL over ~2MB **wedges the main process**: no error, no
  `did-fail-load`, no timer ever fires again. So the document is never handed
  over as a URL; the window loads the real page and fetches the note through the
  same IPC the app uses.
- `did-finish-load` is not readiness. It fires when the bundle has downloaded,
  before React has mounted and before an `![[embed]]` has resolved. The page
  says when it is done and main waits for that, with a timeout.
- Options **throw rather than clamp**, and margins and page sizes are in
  **inches**. `printBackground` defaults to false and `pageSize` to US Letter,
  so a note exported with the defaults is a Letter page with every ground
  dropped. Both are set explicitly; the page is A4.

The save panel is the honest destination and the one that carries its own macOS
permission grant — and closing it is a decision, not a failure, so nothing is
announced. In a development build `LANES_EXPORT_TO=<dir>` skips it, in the
same shape as `LANES_VAULT` and `LANES_STATE` and for the same reason: a native
panel is invisible to a renderer script, and a claim that cannot be checked is
a claim to be believed.
`checks/pdf.js` drives the app and `checks/pdf-file.mjs` reads the bytes that
land — A4, more than one page, real fonts rather than a picture of text.

## A note too long to draw

A note can parse into tens of thousands of blocks, and drawn whole that is
eight seconds of frozen window, two more of blocked main thread, and then that
many elements to scroll. Parsed again on every
render, it would cost that much on every scroll that moved the outline's mark.

So the parse is memoised, and READ draws **1,500 blocks** and says what it has
not drawn, offering the two things that help: the rest of it, or WRITE. An
outline row past the cap draws the rest and goes there, because a row that does
nothing when clicked is the worst of the possible answers. The one real cost is
that `⌘F` in READ searches what has been drawn — press *Draw the rest anyway*
first, or use WRITE, whose search reads the whole note.

`checks/long-note.js` holds both surfaces over a seeded note of about 10,000
lines and 5,000 blocks: READ opens in under 2.5 seconds, draws no more than
1,500 blocks, says it has stopped and offers the rest and WRITE; WRITE opens as
promptly and keeps only the lines near the screen in the page.

**WRITE has no cap, and needs none.** The editor draws only the lines near the
screen — CodeMirror holds the rest as text and a map of their heights — so a
note's length is no reason to draw it differently. What drawing only the
screenful costs is that the rest of the note is not in the page at all; see
[Known limits](architecture.md#known-limits).

## The outline

**The outline** is a contents overview in the pane's left MARGIN. Rows come
from the note's own `##` and `###` lines — read from the source, not from the
rendered headings, so they stay correct mid-edit and a `## comment` inside a
fence is not a section. Read from the RAW line, too: the
document's own parser wants the `#` at column 0, so an indented `## …` is prose
and not a section, and an outline that trimmed first would list sections the
note does not have and the reader cannot jump to — every indented `##` in a
pasted log, say. A row scrolls to its heading; the section you are reading is
marked on the hairline.

It works in both modes. In READ a row's place is the anchored heading READ
drew; in WRITE it is asked of the editor, which knows where every line is —
including the ones it has not drawn, from its map of heights — so the outline
is the note's rather than a rendering's.

It is an overlay sibling of the scrollport, never in flow and never inside it:
in flow it would shift the measure off centre, and inside it would scroll away
and change the `clientWidth` its own margin measurement reads. The overlay's
inner box is congruent with the text column, so the panel hangs off it with a
plain negative `left` and no arithmetic.

**There is one open shape, and it is always in a margin.** With 172px of gutter
it opens out in the white, needing no ground of its own; where there is no
gutter the PANE MAKES ONE and the column shifts right to give it. Shut, it rests
as a stack of 1px ticks in the padding — still the overview: how many sections,
how they nest, where you are. The collapse is per tab, so the same note can be
open in one pane and closed in the other.

The obvious second shape for the narrow case — a floating sheet dropped over
the left of the text — opens INTO the note and covers the words you opened it
to find. In a split, which is where a note pane is narrow and therefore where
that shape would always appear, it covers them every time. Being over the
words also makes it dismiss on any outside click, and a pin necessary to
defeat that; reading a note WITH the outline becomes impossible, because every
click into the text takes it from you.

So: **it stays until you send it away** — the chevron beside CONTENTS, or
escape, and nothing else. One shape in a margin it does not share needs neither
a sheet nor a pin. The cost is that the column is not centred while it is open,
which is the right way round: a measure sitting slightly left is a smaller loss
than a panel sitting on the first eleven characters of every line.

In its margin the outline is furniture: it stands beside the note costing it
nothing, and furniture does not vanish because you touched the thing next to it.
Escape is claimed only while it is open, and never from a field — the editor
and the composer answer their own. A note with one heading or none has no
outline, and a thread never has one.

## Copying from a note

**A copy is what you selected.** In READ, a phrase inside a block copies as that
phrase — the browser's own copy, untouched. A selection that crosses blocks
copies as the MARKDOWN that produced it, since a list pasted as prose has lost
the thing that made it a list, but cut at both ends to where the selection
actually starts and stops rather than rounding out to whole blocks. In WRITE the
selection is already in the source, so a copy is the source, marks and all —
hidden ones included.

Notes also carry `![[transclusion]]` with cycle detection, `[[note#Heading]]`,
and clickable vault paths in backticks. READ draws them; in WRITE they are the
lines that ask for them, with the link drawn as a link. A path in backticks
that is not a note takes a right-click — see
[A path written in backticks](threads.md#a-path-written-in-backticks).

## Comments in a note

A comment is written **in the note**, in CriticMarkup, the plain-text standard
for review marks:

```
The plan rests on {==crop rotation==}{>>define this before first use?<<} as its frame.
```

`{==…==}` is the **anchor**, the words the comment is about; `{>>…<<}` is the
**comment**. A comment with no anchor is a note at that point. In the file
rather than beside it, because an anchor in the file moves with its words
however the note is edited, and a sidecar anchored by quoted text comes loose
exactly when the paragraph around a comment is rewritten. It is also the file
you are looking at, which is the premise the writing surface holds to.

**One grammar, twice.** `parseRuns` reads both tokens: an anchor recurses as
bold does (`{==**this**==}` is an anchored bold word), a comment's words are
plain, and both are one line, as every inline token is to READ. `inlineTokens`
and `shownText` restate them with positions for the editor, and a comment's
words are not part of the line READ shows: they are an annotation on the text,
not the text. `shared/comments.ts` finds every open comment by that grammar —
not in fenced code, not in a code span, cell by cell in a table as READ reads
one — and every count, and everything after this that reads comments, reads
that one list.

**READ** washes an anchor's words and dots them under, colour only, so nothing
moves. The comment goes in the **margin**, level with its anchor's line, where
the pane has room past the measure; cards stack down the margin where two would
meet, and pointing at a card lights its words. Where there is no room — a split
pane is usually narrower than the measure and a margin — the anchor carries a
small marker, and a click opens the comment as a card under the line; esc or a
press elsewhere closes it. A comment at a point is a marker everywhere, since
there are no washed words to say where it is.

**WRITE** draws the same, and decorates without rewriting: `{==` and `==}` are
put away until the caret touches the anchor, the anchor's words washed, the
comment put away and shown in the margin, or as the marker. With the caret in a
comment its raw `{>>…<<}` comes back, faint, as a link's address does: it is
text you can edit. The margin reads the markers either surface leaves, so it is
one piece of code for both, and in WRITE it follows the editor as it draws more
of the note.

**Counted, not counted, found.** The details panel says **Comments 3** and the
meta line `· 3 comments`, while there are some. A comment's words are not the
note's, so the word count leaves them out. They do not print: a PDF is READ on
paper, and a review's marks are not the document, so an anchor prints as its
words and a comment not at all. They are searched — "where did I ask about X"
is a fair thing to type into ⌘K, and the vault's text search already reads the
raw note. A note in a thread, or embedded in another, shows a comment as a
marker whose words are its tooltip.

**Written through a field, not typed as braces.** Select words in READ or WRITE
and the offer that says `quote` says `comment` beside it; ⌥⌘M does the same, as
in Google Docs. Both open a small field under the words, saying which words it
is about; ↵ writes `{==words==}{>>what you typed<<}` into the note. Commenting is
reading, not writing, so from READ the comment goes through the note's own save
— ⌘Z there takes it back, as it does a ticked box — and READ stays READ. In
WRITE it is one change to the editor's document, one step of its undo, and with
nothing selected it takes the word at the caret: a comment on nothing is hard to
find again. Where there is nothing a comment could be about — a blank line,
a rule, code, a note embedded in this one, drawn or, its note missing, muted —
the offer says so (*Not here — a comment goes on words*) and nothing is
written. An embed's line is never words, whether its note is there or not:
`{==` round it would leave a paragraph where the embed was. In WRITE, ⌥⌘M
with the caret on it opens nothing.

**Wherever the selection has words.** A selection is rarely only words: dragged
in from the left it starts on an item's bullet, dragged down from a paragraph it
starts at that paragraph's end, and it runs on into lists and tables. Each end
is taken back to the note wherever it lands — a bullet, a box or an item's
status to the words beside it — and the comment is about the first words the
selection has, so one that starts on a bullet, a blank, a fence, an embed or
a table's rule goes on to the words after. In a table it is a cell's: its
words, the first cell's when it spans several, and a `|` said in its comment
is written `\|` so the table keeps its cells. In WRITE a table's row is drawn
as written, so a comment there shows as its marks; READ puts it in the margin.

Where an anchor goes is decided the way a bold phrase is (`shared/comments.ts`,
`anchorFor`): one stretch — a line past its marker, or a cell — the space at
either end left out, never inside a code span, a wikilink or a link's address,
never half in a phrase it only reaches part of, and never over a numbered
item's `~done`. Words that already have a comment open it instead; a highlight
with none gets one after it. And a write that would change what READ shows —
marks put down among stray ones of the line's own, pairing with those instead,
or marks that make the line another kind of block — is refused rather than
made.

**Edited and resolved where it is.** A comment pressed — its card, or its marker
in a narrow pane — opens the same field with its words and a ✓. ↵ changes what
it says; ✓ resolves it: the comment goes and its anchor's words stay, unwrapped.
Esc closes the field, and with words typed it asks first, the rule esc keeps in
WRITE: *Keep writing* is the answer the focus rests on, esc in the question is
no, so esc pressed again and again only opens and closes it, and discarding is a
click or ⌘⌫. ⌥⌘M reaches the page: the Window menu is Lanes' own and declares
no Minimize All, so nothing above the page takes the chord first.

**The editing keys know them.** An anchor is a phrase, by bold's rules: a
selection that takes part of it keeps its marks whole, and ⌘B and ⌘I treat an
anchor and its comment as one. A line break never falls inside an anchor or a
comment, or between the two: ↵ there goes after the pair, or in front of the
anchor from the start of its words, and so does a paste of text that has review
marks of its own. A comment is sealed: the word keys step over it whole, ⌫
against its end or ⌦ against its start takes all of it, a selection reaching
into it from outside takes it whole, and with the caret in its words the keys
keep to those words and never take a mark. And an anchor whose last word goes
takes its comment with it — a selection deleted or cut, ⌥⌫, ⌫ letter by letter
— in the same step, so ⌘Z brings both back; a copy of all of an anchor's words
carries its comment too, so a cut pasted back is whole.

**Then Claude goes through them.** *Go through* on the details panel's Comments
row, or the pass ⌘K offers while a note with comments is in front: the note's
words are handed over and written first — words typed a moment ago included —
so Claude reads the note you see. Then a new thread, attached to the note and
filed in its lane, named `Comments · <note> · <day>`: one per pass, so each
review has its own record and the note's chats list them. It is sent the prompt
`reviewPrompt` makes (`shared/comments.ts`), which lists every open comment —
what it says, what it is about, and the line it is in as written, quoted rather
than numbered, since a note's frontmatter would put a body's line numbers out —
and says what to do with each: a question is answered in the thread; a change
asked for is made in the note; a comment handled is taken out of the note, its
anchor unwrapped and its words left; one it could not handle is left in place,
the reason said in the thread. Nothing else in the note is touched, and no
comments of Claude's own are added. Its edits arrive in the open note as the
changes that were made, the caret kept — or the conflict banner, if you are
typing in it at the time — and the count falls as comments go. It runs in the
app's safety mode: Standard makes the edits, Guarded asks for each one.

**Every open comment, from ⌘K.** The note index gathers open comments as it
gathers open tasks, in the pass that already reads every note, and patches them
as a note is written. ⌘K's **COMMENTS**, beside TASKS, is a row per comment:
what it says, and under it its note and what it is about, sixty at most — with
nothing typed, the notes touched last first; typed, the ones whose words,
anchor or note match, and in ALL they are rows among the others once something
is typed. `↵` opens the note at the comment — scrolled to it, a fold it is in
opened, its anchor lit for a moment — and the row offers the note's pass: `⇧↵`
goes through that note's comments, as the footer says.

`checks/comments.mjs` holds the grammar to itself: READ's runs and the editor's
tokens over thirty thousand generated lines, anchors and comments mixed with
every other token and nested both ways, and `findComments` against what READ
draws over three thousand generated notes; and where an anchor can go, written
over six thousand generated lines without changing a word READ shows, and over
five thousand generated notes from wherever a selection starts — a bullet, a
blank, a fence, a table's rule, an embed, across cells and blocks — without
changing a block READ draws, a `|` in a cell's comment escaped; an embed's own
line, its note there or not, never anchored.
`edit-fuzz.mjs` presses every editing key it already pressed over lines with
comments in them, and two more of their own. `comments-read.js` drives both
surfaces over a seeded note, at width and in a split, and `comments-pdf.mjs`
reads the exported PDF's text back out of the file; `comments-write.js` writes,
edits, resolves and discards from READ and from WRITE; `comments-anywhere.js`
comments from an item's bullet, from a paragraph's end on into a list, in a
table's cell and across two, and in WRITE in a table's row, and finds code, an
embedded note and an embed whose note is missing still refused — the last in
READ and with WRITE's caret on its line, and a selection from it about the
prose after; and `comments-pass.js`
runs the pass twice against a stand-in CLI that answers and clears a comment,
`reviewPrompt` itself held in `comments.mjs`; `palette-comments.js` lists,
narrows, lands on and passes from ⌘K's COMMENTS.

## The measure

Content is centred in a pane at the **reading measure** — 620px, or 860 with
"Wide measure" on — and the tab strip, head, body and composer all align to it.
It is applied as the pane's horizontal gutter rather than as a wrapper, so every
child that already honours `padX` lands on the column for free; a wrapper would
have had to go inside the transcript's scroller anyway, or the scrollbar would
sit against the text instead of against the pane.

Everything keys off the pane's own **measured width**, never off `split`: a
single pane with the rail open is narrower than a split pane without it.

As a pane narrows there is almost nothing to shed: the composer's model,
effort, safety and context are one status line that ellipsises, not a row of
controls that drop out one by one. Below the measure a pane stops centring and
keeps a minimum gutter of 26px, and one minimum governs the strip and the head
together; two different minimums put them on two different columns the moment
a pane is narrower than the measure. `checks/shedding.js` holds the column at
every width.

## Text size

The same factor sets a reply in a thread, so it is here rather than under
threads. Small, Default, Large, Larger in Settings → Interface, `⌘+` / `⌘−` to
step and `⌘0` to reset. One factor does it: a reply is drawn by the same `Doc`
as a note, and both take the factor over a 13.5px body — READ, the editor and
a thread alike, so ⌘E never changes the size of a word. `applyTheme` writes it
into `--msg-sm` too, for the smaller text a thread sets around its replies.

Labels, chips and meta deliberately do not scale. Making the reading text bigger
should not reflow the controls around it.
