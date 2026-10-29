# Start here

This folder is a sample vault: about thirty invented notes that show what Lanes does with a folder of markdown. Nothing in it is real, and nothing in it matters: read it, write in it, break it. If it came from a clone of the repository, `git checkout -- fixtures/sample-vault` puts it back as it was.

## What Lanes is

Lanes is a Mac app for working with Claude Code beside your notes. It has two kinds of document and two panes to hold them:

- **Threads** are conversations with Claude Code, run by the `claude` CLI in this folder. They always open in the left pane.
- **Notes** are the markdown files in this folder. They always open in the right pane.

The panes have roles, so nothing has to be aimed: a thread goes left and a note goes right however you opened it. Both are drawn by one document engine — the same parser and the same blocks — so a heading, a table or a task looks the same in a reply from Claude as it does in a note.

A note has two states. **READ** is the page, and nothing on it is a field. **WRITE** is one editor with the markdown drawn live, each mark hidden until the caret touches it. ⌘E switches between the two, and a double-click in READ goes into WRITE at the word you clicked.

## How this sample is laid out

| Folder | What is in it |
|---|---|
| `projects/garden/` | The **Garden** lane: five notes about an allotment. |
| `projects/kitchen/` | The **Kitchen** lane: four notes about cooking for a Saturday table. |
| `people/` | [Ada Lovelace](people/ada-lovelace.md) and [Grace Hopper](people/grace-hopper.md), who turn up in the other notes. |
| `daily/` | Five days, one note each, Monday to Friday. |
| `reading/` | Three reading notes, one of them [long](reading/river-walks.md). |
| `links/` | Three notes about how one note points at another. |
| `inbox/` | Two notes another tool might have dropped here. Lanes reads this folder and never writes to it. |
| `_templates/` | A [meeting template](_templates/meeting.md). |

A lane is a folder you are working in. A thread whose work touches notes in a lane's folder is filed under that lane, and the rail's **Lanes** view groups threads that way. This sample comes with two lanes, Garden and Kitchen.

[[everything|Everything a note can hold]] is every kind of block in one note. Open it, press ⌘E, and compare the two states.

## Notes worth opening

- [[autumn-jobs|Autumn jobs]] holds tasks. Every open `- [ ]` in the vault is a row in ⌘K, under TASKS.
- [[saturday-menu|Saturday menu]] has comments in it, written into the note itself.
- [[bread|Bread]] starts with YAML frontmatter, which Lanes keeps and does not draw.
- [[beds|Beds]] uses all four heading levels.
- [[hub|Hub]] shows every way of writing a link, and [[spoke]] lists the notes that point at it.

## Keys worth knowing

| Key | Does |
|---|---|
| ⌘K | The palette: every thread, note, task and comment, and the offer to make a new one |
| ⌘N | A new note, untitled, with the caret in its title |
| ⌘T | A new tab in the pane you are in — a thread on the left, a blank tab on the right |
| ⌘E | WRITE or READ, for the note in front |
| ⌘F | Find in the pane you are in |
| ⌥1 | Show or hide the rail |
| ⌘1–⌘9 | The nth tab of the pane you are in |
| esc | Leave WRITE — it asks first if that would throw words away |
| ⌘, | Settings |

The rest are in docs/keys.md in the Lanes repository.

## Your own notes

Lanes works on one folder at a time. To work on your own notes, choose their folder in Settings; Lanes relaunches on it. This sample is not copied there, and nothing of yours is copied here.

A thread is a Claude Code session in the folder Lanes has open, so Claude reads and writes the notes in that folder — here, only these.
