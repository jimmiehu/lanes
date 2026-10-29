// A NOTE'S WORDS LAND IN THE NOTE — wherever it went, whatever else wrote it.
//
// Main writes every note through one queue, and three things can happen to a
// note while a save of it is waiting there. Each of these was red:
//
//  - IT IS RENAMED. Naming an untitled note moves its file while the words
//    typed under the title are still being saved, and the rename can wait on
//    the note index for a second or more. A save addressed to `untitled.md`
//    before the rename had answered ran after it, found nothing there and made
//    the file again: a stray `untitled.md` holding the note's first sentence,
//    and the named note, read back from disk, without it. So a save asked for
//    before a move follows the note to where it went — and one asked for after
//    it is for whatever is at the old path by then.
//  - IT IS TRASHED. A save still queued when the note went to the Trash ran
//    after it and made the file again, and the note you had just thrown away
//    came back.
//  - THE WINDOW CLOSES. The last words go to disk synchronously, and that write
//    checks the file first, the way every other save does: if something wrote
//    to it since the app last looked — Claude, in the thread beside it — the
//    words go to a `(conflicted copy)` beside it rather than over it, and a
//    second such copy is a second file, not the first one written over. A
//    change main made itself is no such thing: the app's own save, landed
//    with its reply still on the way, is not taken for somebody else's (red:
//    the last words went to a copy and the note kept older ones). A save main
//    had already started — reading the file, or still writing it — does not
//    land its older words on top of the final ones. And a note renamed with
//    the reply still on its way takes its last words where it went (red: the
//    old file made again).
//  - A RENAME REWRITES OTHER NOTES — the links pointing at the one renamed —
//    and the moved note's own heading, behind the back of an editor that may be
//    open on them. A save sent from before the rewrite is not refused as a
//    conflict (the change was main's), and does not put the old words back: the
//    same rewrite is made in it, and the reply says what was written, so the
//    editor can take it up (red: a conflict banner with nobody on the other
//    side, and then a choice between the dead link and the typing). The move's
//    own mtime comes back with it, for the app to hold the renamed note to.
//
// Runs main's own `src/main/notes.ts`, bundled for node with a stand-in for
// electron's `shell`, against a vault it makes in a temporary directory.
//
//   node checks/note-moves.mjs
import { build } from 'esbuild'
import { mkdtemp, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const work = await mkdtemp(join(tmpdir(), 'lanes-note-moves-'))
const vault = join(work, 'vault')
await mkdir(vault)

// A vault with enough in it that building the index is real work, the way the
// rename meets it in use: a few hundred notes that link to one another.
await mkdir(join(vault, 'notes'))
const filler = 'A line of an ordinary note, which links to [[n1]] and says little else. '.repeat(60)
for (let i = 0; i < 300; i++) await writeFile(join(vault, 'notes', `n${i}.md`), `# N${i}\n\n${filler}\n`)

// Main's notes module, as main runs it, and the setter index.ts gives it its folder with.
await build({
  stdin: {
    contents: "export * from './src/main/notes.ts'\nexport { setVault } from './src/main/config.ts'\n",
    resolveDir: join(here, '..'),
    loader: 'ts'
  },
  bundle: true,
  platform: 'node',
  format: 'esm',
  outfile: join(work, 'notes.mjs'),
  logLevel: 'error',
  plugins: [
    {
      // `writeFile`, held back on request: the moment the window's last write
      // lands while an older one is still being written is otherwise a
      // matter of the disk's timing.
      name: 'slow-write',
      setup(b) {
        b.onResolve({ filter: /^(node:)?fs\/promises$/ }, (a) =>
          a.namespace === 'stand-in' ? undefined : { path: 'fs-promises', namespace: 'stand-in' }
        )
        b.onLoad({ filter: /^fs-promises$/, namespace: 'stand-in' }, () => ({
          contents:
            "import * as real from 'node:fs/promises'\n" +
            'export const { mkdir, readdir, readFile, rename, stat, rm, unlink, copyFile, access, open } = real\n' +
            'export async function writeFile(...a) {\n' +
            '  const hold = globalThis.__holdWrite\n' +
            '  if (hold) await new Promise((r) => setTimeout(r, hold))\n' +
            '  return real.writeFile(...a)\n' +
            '}\n',
          loader: 'js',
          resolveDir: here
        }))
      }
    },
    {
      name: 'electron',
      setup(b) {
        b.onResolve({ filter: /^electron$/ }, () => ({ path: 'electron', namespace: 'stand-in' }))
        b.onLoad({ filter: /.*/, namespace: 'stand-in' }, () => ({
          contents:
            "import { rm } from 'node:fs/promises'\n" +
            'export const shell = { trashItem: (p) => rm(p), showItemInFolder() {} }\n' +
            'export const app = {}\n',
          loader: 'js'
        }))
      }
    }
  ]
})
const M = await import(pathToFileURL(join(work, 'notes.mjs')).href)
M.setVault(vault)

let failed = 0
const is = (ok, what, detail = '') => {
  if (!ok) {
    failed++
    console.log(`  ✗ ${what}${detail ? `\n      ${detail}` : ''}`)
  }
}
const j = JSON.stringify
const disk = async (rel) => {
  try {
    return await readFile(join(vault, rel), 'utf8')
  } catch {
    return null
  }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/* ---------- renamed while a save is on its way ---------- */
{
  // ⌘N, a title, ↵, and the save of the title.
  const made = await M.createUntitled('')
  const at = made.path
  const read = await M.readNote(at)
  const titled = await M.writeNote(at, '# Foo\n\n', read.edited)
  // The rename the title commits, and — before it has answered — the save of
  // the first words typed under it, still addressed to the untitled file. The
  // rename is asked for as a move to a name known to be free, which queues it
  // at once; naming looks for a free name on disk first, and a save sent in
  // that moment would be queued ahead of the move, and never meet it.
  const renamed = M.renameNote(at, 'Foo')
  const words = M.writeNote(at, '# Foo\n\nthe first line of the note\n', titled.edited)
  const [r, w] = await Promise.all([renamed, words])
  is(r.ok && r.path === 'foo.md', 'the note is renamed', j(r))
  is((await disk('foo.md')) === '# Foo\n\nthe first line of the note\n', 'the words are in the renamed note', j(await disk('foo.md')))
  is((await disk(at)) === null, 'no stray untitled file comes back', `${at}: ${j(await disk(at))}`)
  is(w.ok && w.path === 'foo.md', 'the save says where it landed, so the app can follow it', j(w))
  // A save asked for AFTER the move is for whatever is at the old path by then.
  const again = await M.createUntitled('')
  is(again.path === at, 'the freed name is the next untitled note', j(again))
  const next = await M.writeNote(again.path, '# \n\nsomething else\n', (await M.readNote(again.path)).edited)
  is(next.ok && next.path === at && (await disk(at)) === '# \n\nsomething else\n', 'a later save to the old path is that new note', j(next))
  is((await disk('foo.md')) === '# Foo\n\nthe first line of the note\n', 'and does not follow the renamed one', j(await disk('foo.md')))
}

/* ---------- trashed while a save is on its way ---------- */
{
  await writeFile(join(vault, 'trash-me.md'), '# Trash me\n\nwords\n')
  const read = await M.readNote('trash-me.md')
  const trashed = M.trashNote('trash-me.md')
  const late = M.writeNote('trash-me.md', '# Trash me\n\nwords, and a few more\n', read.edited)
  const [t] = await Promise.all([trashed, late])
  is(t.ok, 'the note goes to the Trash', j(t))
  is((await disk('trash-me.md')) === null, 'a save queued behind the trash does not bring it back', j(await disk('trash-me.md')))
}

/* ---------- the window closes ---------- */
{
  // Nothing wrote the file since the app read it: the words go into it.
  await writeFile(join(vault, 'calm.md'), '# Calm\n\nmine\n')
  const calm = await M.readNote('calm.md')
  const c = M.writeNoteSync('calm.md', '# Calm\n\nmine, and the last words\n', calm.edited)
  is(c.ok && c.path === 'calm.md' && (await disk('calm.md')) === '# Calm\n\nmine, and the last words\n', 'unchanged since read: written in place', j(c))

  // Claude wrote to it after the app last looked.
  await writeFile(join(vault, 'closing.md'), '# Closing\n\nmine\n')
  const mine = await M.readNote('closing.md')
  await sleep(30)
  await writeFile(join(vault, 'closing.md'), '# Closing\n\ntheirs\n')
  const s = M.writeNoteSync('closing.md', '# Closing\n\nmine, and the last words\n', mine.edited)
  is((await disk('closing.md')) === '# Closing\n\ntheirs\n', 'changed since read: their version stays in the note', j(await disk('closing.md')))
  is(
    s.ok && s.path === 'closing (conflicted copy).md' && (await disk('closing (conflicted copy).md')) === '# Closing\n\nmine, and the last words\n',
    'and the last words go to a conflicted copy beside it',
    `${j(s)} ${j(await disk('closing (conflicted copy).md'))}`
  )

  // A save main has already started — past its turn in the queue, reading
  // the file — when the window's write jumps ahead of it.
  await writeFile(join(vault, 'late.md'), '# Late\n\none\n')
  await M.drainWrites()
  const late = await M.readNote('late.md')
  const running = M.writeNote('late.md', '# Late\n\none two\n', late.edited)
  await new Promise((r) => setImmediate(r))
  M.writeNoteSync('late.md', '# Late\n\none two three\n', late.edited)
  await running
  is((await disk('late.md')) === '# Late\n\none two three\n', 'an older save already running does not land over the last words', j(await disk('late.md')))
}

/* ---------- the window closes: its own save not taken for someone else's ---------- */
{
  // The app's save lands; its reply — the new mtime — is still on its way when
  // the window closes, so the close-time write carries the mtime from before.
  await writeFile(join(vault, 'own.md'), '# Own\n\none\n')
  const read = await M.readNote('own.md')
  // Long enough that the save's mtime is not the read's.
  await sleep(30)
  await M.writeNote('own.md', '# Own\n\none two\n', read.edited)
  const s = M.writeNoteSync('own.md', '# Own\n\none two three\n', read.edited, true)
  is(s.ok && s.path === 'own.md', "the app's own save is not a conflict at the close", j(s))
  is((await disk('own.md')) === '# Own\n\none two three\n', 'the last words go into the note', j(await disk('own.md')))
  is((await disk('own (conflicted copy).md')) === null, 'and no copy is made', j(await disk('own (conflicted copy).md')))
}

/* ---------- ...and not written under by one still being written ---------- */
{
  await writeFile(join(vault, 'held.md'), '# Held\n\none\n')
  await M.drainWrites()
  const read = await M.readNote('held.md')
  globalThis.__holdWrite = 60
  const running = M.writeNote('held.md', '# Held\n\none two\n', read.edited)
  // Past its reads and into the write, which is held.
  await sleep(25)
  M.writeNoteSync('held.md', '# Held\n\none two three\n', read.edited)
  await running
  globalThis.__holdWrite = 0
  is((await disk('held.md')) === '# Held\n\none two three\n', 'an older save still being written does not land over the last words', j(await disk('held.md')))
}

/* ---------- two copies are two files ---------- */
{
  await writeFile(join(vault, 'twice.md'), '# Twice\n\nmine\n')
  const read = await M.readNote('twice.md')
  await sleep(30)
  await writeFile(join(vault, 'twice.md'), '# Twice\n\ntheirs\n')
  M.writeNoteSync('twice.md', '# Twice\n\nfirst close\n', read.edited)
  M.writeNoteSync('twice.md', '# Twice\n\nsecond close\n', read.edited)
  is((await disk('twice (conflicted copy).md')) === '# Twice\n\nfirst close\n', 'the first copy is kept', j(await disk('twice (conflicted copy).md')))
  is((await disk('twice (conflicted copy 2).md')) === '# Twice\n\nsecond close\n', 'and the second is a file of its own', j(await disk('twice (conflicted copy 2).md')))
  is((await disk('twice.md')) === '# Twice\n\ntheirs\n', 'the note keeps theirs', j(await disk('twice.md')))
}

/* ---------- closing on a rename whose reply is still on its way ---------- */
{
  await M.drainWrites()
  const made = await M.createUntitled('')
  const read = await M.readNote(made.path)
  await M.writeNote(made.path, '# \n\n', read.edited)
  await M.renameNote(made.path, 'Gone Away')
  const s = M.writeNoteSync(made.path, '# Gone Away\n\nthe last words\n', read.edited)
  is(s.ok && s.path === 'gone-away.md', 'the last words go where the note went', j(s))
  is((await disk('gone-away.md')) === '# Gone Away\n\nthe last words\n', 'into the renamed note', j(await disk('gone-away.md')))
  is((await disk(made.path)) === null, 'and the old file is not made again', j(await disk(made.path)))
}

/* ---------- a rename's rewrites, made again in words sent from before them ---------- */
{
  await M.drainWrites()
  await writeFile(join(vault, 'notes', 'alpha.md'), '# Alpha\n\nThe note that is renamed.\n')
  await writeFile(join(vault, 'notes', 'pointer.md'), '# Pointer\n\nSee [[alpha]] for more.\n')
  // The index has to know the link before the rename can follow it: the
  // sweep's own question, asked until it has read the two files.
  for (let i = 0; i < 50; i++) {
    await M.notesChanged()
    if (((await M.noteIndex()).backlinkSources.get('notes/alpha.md') ?? []).includes('notes/pointer.md')) break
    await sleep(20)
  }
  const pointer = await M.readNote('notes/pointer.md')
  const alpha = await M.readNote('notes/alpha.md')
  const r = await M.renameNote('notes/alpha.md', 'Beta')
  is(r.ok && r.path === 'notes/beta.md' && (r.relinkedPaths ?? []).includes('notes/pointer.md'), 'the rename says which notes it rewrote', j(r))
  is(typeof r.edited === 'number' && Math.abs(r.edited - (await stat(join(vault, 'notes', 'beta.md'))).mtimeMs) <= 1, 'and the mtime it left the renamed note with', j(r.edited))
  // The editor open on the pointing note still says `[[alpha]]`, and a word typed there is saved.
  const w = await M.writeNote('notes/pointer.md', '# Pointer\n\nSee [[alpha]] for more, now.\n', pointer.edited)
  is(w.ok, 'a save of a note whose links a rename rewrote is not a conflict', j(w))
  is((await disk('notes/pointer.md')) === '# Pointer\n\nSee [[beta]] for more, now.\n', 'and keeps the rewritten link', j(await disk('notes/pointer.md')))
  is(w.merged === '# Pointer\n\nSee [[beta]] for more, now.\n', 'and says what it wrote, for the editor to take up', j(w.merged))
  // The renamed note's own editor, a word typed before it heard of the rename.
  const own = await M.writeNote('notes/beta.md', '# Alpha\n\nThe note that is renamed, and a word.\n', alpha.edited)
  is(own.ok && (await disk('notes/beta.md')) === '# Beta\n\nThe note that is renamed, and a word.\n', 'the renamed note keeps its new heading under words sent from before it', `${j(own)} ${j(await disk('notes/beta.md'))}`)
  // Once the editor has the new words, it is what it says: a title changed on purpose stays changed.
  await M.writeNote('notes/beta.md', '# Beta\n\nThe note that is renamed, and a word.\n', own.edited)
  const later = await M.readNote('notes/beta.md')
  await M.writeNote('notes/beta.md', '# Alpha\n\nNamed back on purpose.\n', later.edited)
  is((await disk('notes/beta.md')) === '# Alpha\n\nNamed back on purpose.\n', 'and a title written back later on purpose is left as written', j(await disk('notes/beta.md')))
}

// Nothing outside the vault it was given, and nothing left behind.
const left = (await readdir(vault)).filter((f) => f.endsWith('.md')).sort()
is(!left.includes('untitled-2.md'), 'no second untitled note was needed', j(left))
await M.drainWrites()
await rm(work, { recursive: true, force: true })
void stat

if (failed) {
  console.log(`\n${failed} failed`)
  process.exit(1)
}
console.log('all note-moves assertions hold (a rename, a trash and a closing window, each with a save on its way)')
