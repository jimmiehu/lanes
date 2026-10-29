// A thread the CLI never wrote, for the checks that read one.
//
// `thread-links.js`, `to-start.js` and the thread half of `pause.js` want a
// thread with long answers, paragraphs parted by blank lines, and links of
// every kind Claude writes — a `[[wikilink]]`, a markdown link whose address is
// a note's file, one whose address is a file that is not a note, and links
// to notes and files that are not there. Spending turns to get one would make
// the checks slow, costly and different every run; this lays the transcript
// down instead, where the app looks for the threads of the vault it is given,
// with the notes its links name.
//
// Writes only under the vault it is handed and that vault's directory in
// ~/.claude/projects — both throwaway. Give the RESOLVED path (`/private/tmp`,
// not `/tmp`): the app looks threads up by the path the vault really has.
//
//   node checks/thread-fixture.mjs /private/tmp/thread-vault
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const vault = process.argv[2]
if (!vault || !vault.startsWith('/private/tmp/')) {
  console.error('usage: node checks/thread-fixture.mjs /private/tmp/<throwaway-vault>')
  process.exit(1)
}
const sessions = join(homedir(), '.claude', 'projects', vault.replace(/[^a-zA-Z0-9]/g, '-'))
rmSync(sessions, { recursive: true, force: true })
rmSync(vault, { recursive: true, force: true })
mkdirSync(join(vault, 'notes'), { recursive: true })
mkdirSync(join(vault, 'files'), { recursive: true })
mkdirSync(sessions, { recursive: true })

writeFileSync(join(vault, 'notes', 'alpha-note.md'), '# Alpha note\n\nThe note a markdown link in the thread points at.\n')
writeFileSync(join(vault, 'notes', 'beta-note.md'), '# Beta note\n\nThe note a wikilink in the thread points at.\n')
writeFileSync(join(vault, 'notes', 'gamma-note.md'), '# Gamma note\n\nThe note a bare file name in the thread names.\n')
// Two notes of one file name, so a bare `twice-named.md` names neither.
mkdirSync(join(vault, 'notes', 'other'), { recursive: true })
writeFileSync(join(vault, 'notes', 'twice-named.md'), '# Twice named\n\nOne of two notes with this file name.\n')
writeFileSync(join(vault, 'notes', 'other', 'twice-named.md'), '# Twice named, again\n\nThe other.\n')
writeFileSync(join(vault, 'files', 'brief.txt'), 'Not a note: a file a link can only show in the Finder.\n')
// A file that is not a note, beside the notes — as a spreadsheet Claude made
// sits in a project folder. A path to it is the vault's because its first
// folder is one the vault's notes live in.
writeFileSync(join(vault, 'notes', 'sheet.xlsx'), 'not really a spreadsheet\n')

const SESSION = '5eed0000-0000-4000-8000-00000000f17e'
const prose = (n, word) =>
  Array.from(
    { length: n },
    (_, i) =>
      `${word} paragraph ${i + 1}. ` +
      'It goes on long enough to wrap across the measure more than once, so the thread is tall and the way up has somewhere to go. '.repeat(3)
  ).join('\n\n')

/** A message to send, fenced for copying: longer than the measure, and an indented line. */
const DRAFT = [
  "Quick follow-up now that I've walked past every bed: about 12 have come up so far, ~30 come up this week and the rest by Sunday, so Thursday's counts will still move a little before the planting.",
  '    An indented line keeps its indent.'
].join('\n')

/** A link pasted into your own turn, as a calendar invitation quotes it. */
const INVITE =
  'https://calendar.example.com/calendar/event?action=RESPOND&eid=4IjGKYw4o3Cod6dkuAF748r1Erb6V9SbtUE0Z0pslir0Sjt7t' +
  'vIys3VjmNW8PVsShf8dBCWT8G3JzAXC9eyQJRCB3GsC5UVuWPlhT1H0Go2C0bfDZkQ&rst=1&tok=MjEjYWRhLmxvdmVsYWNl'

const turns = [
  ['user', 'Where did we leave the alpha note?'],
  [
    'assistant',
    [
      'Linked answer opens here.',
      'It is in [alpha-note.md](notes/alpha-note.md), and the other one is [[beta-note]].',
      'These lead nowhere: [gone.md](notes/gone.md), [[notes/never-was]], and [missing.txt](files/missing.txt).',
      'This one is a file and not a note: [brief.txt](files/brief.txt). The web stays the web: [example](https://example.com).',
      // How Claude lists the files it wrote when it has named their folder
      // already: bare names, no folder in them.
      'Files are in notes:\n- gamma-note.md\n- twice-named.md\n- nowhere-at-all.md',
      'Paired paragraph one sits on its own.',
      'Paired paragraph two comes after a blank line.',
      // And a file that is not a note, by its path — on the last line, where
      // Claude puts it: shown where it is. One that is not there, and an
      // address with no scheme that is not the vault's.
      'Not there: notes/gone-away.pdf, and not the vault: example.com/page.html',
      'File: notes/sheet.xlsx'
    ].join('\n\n')
  ],
  ['user', 'And the rest of it?'],
  ['assistant', `Long answer opens here.\n\n${prose(14, 'Long')}`],
  // A pasted invitation: the way a mail client quotes a link, one address
  // longer than the measure with nowhere to break.
  ['user', `One more thing.\n\nYes <${INVITE}>`],
  [
    'assistant',
    // Ends on a draft fenced off for copying — one long line, the way Claude
    // writes a message to send, and an indented one under it.
    `Last answer opens here.\n\n${prose(10, 'Last')}\n\nDraft to send:\n\n\`\`\`\n${DRAFT}\n\`\`\``
  ]
]

let parent = null
const t0 = Date.parse('2026-10-01T09:00:00Z')
const lines = turns.map(([role, text], i) => {
  const uuid = `00000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`
  const line = {
    parentUuid: parent,
    isSidechain: false,
    type: role,
    message:
      role === 'user'
        ? { role: 'user', content: [{ type: 'text', text }] }
        : { role: 'assistant', model: 'claude-sonnet-5', content: [{ type: 'text', text }] },
    uuid,
    timestamp: new Date(t0 + i * 60_000).toISOString(),
    cwd: vault,
    sessionId: SESSION,
    userType: 'external'
  }
  parent = uuid
  return JSON.stringify(line)
})
lines.push(JSON.stringify({ type: 'ai-title', aiTitle: 'Thread fixture', sessionId: SESSION }))
writeFileSync(join(sessions, `${SESSION}.jsonl`), `${lines.join('\n')}\n`)
console.log(JSON.stringify({ vault, sessions, session: SESSION }))
