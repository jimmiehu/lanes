# Everything a note can hold

Every kind of block Lanes draws, in one note. Open it in READ, press ⌘E, and the same note is in the editor — the marks hidden until the caret touches them, and each block where READ put it. It is also what the PDF export is checked against, which is why it runs to a second page.

Lanes reads markdown by one grammar, its own, in READ and in the editor alike. Where that grammar differs from CommonMark, this note says so.

## Words in a line

Plain words, then **bold words**, then *italic words*, then `a code span`. ==A highlight== is drawn on the colour Settings picks, and it can hold ==**bold**, or a [[spoke|link]]==. A highlight wants words at both ends, so a comparison like a == b stays a comparison.

A [[spoke]] wikilink, the same note [[spoke|under words of its own]], a [markdown link to a note](links/rim.md), and [a page on the web](https://example.com). A note's path written as prose — projects/garden/beds.md — is a link as well, because Claude names the files it wrote that way.

What READ leaves alone: _underscores_ are underscores, ~~tildes~~ are tildes, and three stars around a word are a bold word between two stars. A line break inside a paragraph
is a line break,
and nothing more.

## Headings

The note's own title is the first `# ` line, said once, in the head. Below it there are three more levels.

### A third-level heading

A part of the section above it. The ladder goes down from here in size, and each heading has more air above it than below, so it belongs to what follows.

#### A fourth-level heading

The last level with a look of its own. A fifth or sixth is drawn as a fourth.

## Lists

- An item.
- An item with **bold** and a [[hub]] link in it.
  - An item nested one level.
    - And two.
- Back at the top.

1. A numbered item.
2. One that says it is done. ~done
3. One that is under way. ~active
4. One that is waiting on something. ~blocked
5. And a plain one after them.

A numbered list may start anywhere; this one starts at nine.

9. Ninth.
10. Tenth, and the column still lines up.

## Tasks

- [ ] An open task, which ⌘K lists under TASKS.
- [x] A done one, which ⌘K leaves out.
- [ ] A task with a nested one under it:
  - [ ] the nested one.
  - [x] and its done sibling.

## A quote

> A quote is one block however many lines it takes. This one takes two in the file,
> and READ draws them as one quote, with a rule beside it.

## A rule

Above the line.

---

Below it.

## Code

```
A fence with no language.
  Indentation is kept.
A line long enough to run past the measure is wrapped inside its card rather than scrolled sideways, so all of it can be read.
```

```js
// A fence with a language. Markdown inside it is literal.
const beds = ['north', 'south', 'the long one']
for (const bed of beds) console.log(`- [ ] water ${bed}`) // not a task
```

## A table

| Bed | What grows | Sown | Notes |
|---|---|---|---|
| North | Garlic | October | Planted **deep**, see [[beds]] |
| South | Broad beans | November | Under fleece until March |
| The long one | Leeks, then kale | May | Follows the potatoes |
| By the shed | Rhubarb | Never | It was there first |
This line is straight under the table, and it is prose, not another row: a table ends at the first line that does not start with a pipe.

| Ingredient | Amount |
|---|---|
| Flour | 500 g |
| Water | 360 g |
| Salt | 10 g |
| Starter | 100 g |

## Embeds

A note can be shown inside another, whole:

![[spoke]]

Or one heading's section of it:

![[river-walks#Rules for the walks]]

## A longer passage

The point of a note this long is that the export has something to break across pages. A paragraph should not be split mid-line, a heading should not be left alone at the foot of a page, and a table row should arrive whole. Those are the printer's rules, and Lanes leaves them to the printer: the PDF is READ on paper, drawn by the same components the pane uses, with a page size of its own.

What does not print: the comments a note carries. A review's marks are not the document, so an anchor prints as its words and a comment not at all. [[saturday-menu|The Saturday menu]] has some, if you want to see the difference.

The page is A4 and the ground is paper, whatever the theme on screen. A dark desk does not print, and neither does anything that is only there to be clicked: the tabs, the rail, the bar with `pdf` in it.

Long notes are common in a working vault — minutes, drafts, reading notes that only grow. [[river-walks|River walks]] is the long note in this sample, about four hundred lines; the outline at its side lists its sections, and a click on one goes there.

Every block above is drawn the same way in a reply from Claude. A thread is a transcript and a note is a page, but a table is a table in both, and so is a task.

A note is a file. Lanes writes it the way it found it — its line breaks, its frontmatter, the tabs and trailing spaces another editor would tidy — and changes only the line you typed in.

## Collapsible sections

The one piece of HTML Lanes reads is a fold: `<details>` and its `<summary>`. Everything inside is read as the rest of the note is, folds included.

<details>
<summary>A closed section, with prose and a list</summary>

The body of a fold is a note in its own right. This paragraph is inside it, and so is the list under it.

- The outline reaches into a closed fold.
- So does ⌘F, which opens the fold to show what it found.
- And the reading mark, which follows you down the page.

<details open>
<summary>An open section inside it</summary>

A fold inside a fold, written `<details open>`, so it starts open. Its lines keep their own numbers in the note, so a double-click here lands on this line and not the one under it.

</details>

The last words of the outer section.

</details>

That is everything. In WRITE the fold is the source that makes it, tags and all.
