# Search

What ⌘K finds and in what order: the one rule its searches match by, how a
note's text is searched a moment behind its name, and how the inside of a
thread is searched at all. The keys that reach it are in
[Keys, and getting somewhere](keys.md). Back to the [README](../README.md).

## What counts as a match

One rule, in `src/shared/find.ts`, for everything ⌘K searches: names, note
bodies, transcript text, tasks and comments. The rail's filter and ⌘F are not
⌘K, and each matches what you typed as one phrase — see the end of this page,
and [Keys](keys.md).

Four places with four answers is the alternative, and it fails in plain
sight. A palette that filters names with a plain `includes` of the whole
query, a note index that folds diacritics and has a word rung, and a body scan
and a transcript scan that take the query as one literal string mean that
`vienna facts` finds **nothing at all** — not the note actually called
"Vienna water — historical facts for the river essay", whose title holds both
words with others between them, and not the bodies that say them a sentence
apart. And `cafe` finds Café in a body and not in a title, because only one of
the two folds.

Two rungs, and the order between them is the design:

- **PHRASE** — the query as typed, as a substring. Vaults are full of
  hyphenated slugs, paths and quoted phrases, and `seed-ord` should find
  `seed-order` mid-word the way a reader means it. Always outranks
  the other kind, so typing a title in order puts that title first.
- **WORDS** — every word somewhere in the haystack, in any order, each still a
  substring so `vien facts` works. This is what a person means by typing two
  words.

There is no third rung. Fuzzy subsequence matching (`vfacts`) is the usual next
step and is deliberately not taken: on a vault of a thousand notes or more it
returns something for every query, which makes an empty result impossible and
a result therefore meaningless.

`checks/find-rule.mjs` proves the rule with no app running;
`checks/find-words.js` proves it reaches the palette, the bodies and the
transcripts.

## Searching the vault's text

⌘K matches names instantly and note **text** a moment behind, once three
characters are typed. The text side is a folded copy of every note in one
`Buffer` — NUL-separated, with a byte offset per note — searched with
`Buffer.indexOf`, which is a native memmem.

**A note newer than the list is still found by its name.** The names ⌘K matches
instantly come from the window's note list, which is refreshed when the app makes
a note and when the sweep sees the vault move — so a note Claude wrote a moment
ago can be on disk and in main's index and not yet in that list, for up to
thirty seconds. The text search already finds it, and brings its title with
it, so a text hit on a note the list does not hold yet is ranked by that title
like any other name, as the newest note there is. Without that, typing a
note's exact title would rank it under every note whose name merely shared a
word with it.

The numbers that chose that shape, measured on a vault of about 70MB of
markdown:

| | |
|---|---|
| `grep -r` over the same files | ~1,600ms — far too slow to type against |
| the same text held as JS strings | 257MB of RSS |
| as one Buffer | ~70MB, and outside V8's heap |
| a query against it | **55–67ms** |
| building it | ~650ms, inside a pass that already read every file |

It costs no extra IO. The note index already reads every note to find titles
and resolve backlinks, and would otherwise throw the text away. The build is
folded like the titles are, so `cafe` finds Café in a note's body as well as
in its name, and both spellings return the same hits. Matching is substring
rather than tokens, because vaults are full of hyphenated slugs and quoted
phrases and `seed ord` should find them mid-word.

The phrase is one pass over the whole buffer. The **words** rung is a second
pass, taken only when the phrase did not fill the page and the query has more
than one word — so the common case pays nothing for it. On the same vault:

| | |
|---|---|
| one word | 11ms |
| two words | 78ms |
| a pair that matches nothing | 32ms |

The second pass scans for the **longest** word only, and tests the rest inside
each candidate's own byte range. Scanning every word so as to lead with the
rarest costs a full pass per word, which is exactly what leading with it saves.
And the per-candidate test runs on a `subarray`: `Buffer.indexOf` takes a start
and no end, so asking the shared buffer for a word a note does not contain would
keep scanning through every note after it to the end of the buffer — four
hundred candidates paying that is about 100ms.

Two rules keep the results honest. **Name matches always outrank text matches**,
whatever the sort — typing a filename must not bury its note under whichever
note merely mentions it and was edited more recently. And **text matches keep
twelve slots of their own**: a common phrase can match forty notes by title
alone, and without a reservation every text hit would fall past the cap of
forty rows. Twelve, because four sources share the reservation — a note's
text, a thread's, open tasks and, in ALL, open comments. THREADS and WAITING
are whole lists with no cap, so nothing there needs reserving.

The palette matches a note's whole path, so `garden/compost` finds the note
titled "Compost — the three bays" by the folder it sits in, and the row shows
that path under the title. A note found by its text shows its filename before
the line that matched. Snippets come back lowercase: folding changes byte
lengths, so an offset in the folded buffer cannot be mapped back onto the
original file to recover its case.

### And the inside of a thread

A thread found only by its title is found by a few words: its name, or, until
it has one, the first sixty characters of its opening prompt. Half of what this
app holds is conversation, and the half you most often go back for is a
sentence somebody said in one — the answer about the site visit, the paragraph
you wrote in a chat and never moved into a note.

So transcripts have their own index, in `src/main/threadText.ts`. Measured on
one session directory of a few hundred megabytes:

| | |
|---|---|
| the jsonl it reads | a few hundred MB, a couple of hundred files |
| what anybody actually SAID in it | about 1% of that |
| building that, once | under two seconds, warmed in the background at launch |
| the cache it writes | a few MB, `lanes-said.json`, keyed per file by mtime and size |
| a query against it | **about 5ms** |

It is its own index rather than part of the record layer next door, because
`lanes-index.json` is read on every launch and nothing on the launch path wants
the text: it is first asked for when somebody types three characters into ⌘K.
It is cached to disk because a build of a second or two is worth paying once
rather than at every launch, and warmed in the background because that wait
with the palette open and empty is a different thing from the same wait while
nobody is looking.

Extraction shares the transcript reader's own turn rule — `saidIn`, beside
`buildMessages` — so a sidechain, a `tool_result` and a line the CLI injected
are as invisible to the search as they are on screen. A search that found
phrases nobody can see when they open the thread would be worse than one that
found nothing. **A slash command is not injected**, though it looks it: the CLI
files `/garden-check` in tags of its own, `<command-message>` and
`<command-name>`, which open with the `<` the rule reads as machinery — so a
thread started from ⌘K's `/garden-check` would show its opening turn while it
ran and lose it on being opened again, and a fork is cut by those two
agreeing. `commandTurns` reads such a line as what was typed, `/garden-check`
and its arguments, when the model answered it or nothing has come back for it
yet; `/model`, answered by the CLI's own `<local-command-stdout>` and never by
the model, stays out, since a thread that ended on one would otherwise read as
waiting on you (`checks/command-turn.mjs`). Extraction does not go *through*
`buildMessages`, which parses markdown and carries every pasted image's
base64: that is the difference between an index that can exist and one that
cannot.

Hits are **collapsed by family**. A fork copies its parent's prefix verbatim, so
a phrase said before a fork is in every path of the family — reporting each
would answer "where did I say that?" with five rows saying the same sentence.
The family's root is the row, and picking it lands on whichever path you were
last reading, exactly as picking the thread by name does.

The badge says which claim a row is making: **TEXT** means found *inside* it,
whether it is a note or a thread; **CHAT** and **NOTE** mean found by name.

The rail's filter matches a thread's title, and a note's title and path,
folded, as one phrase — no words rung. It filters the rail; ⌘K is the one that
reads both the vault and the conversations.
