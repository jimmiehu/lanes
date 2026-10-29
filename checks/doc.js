// ONE DOCUMENT ENGINE — and one grammar, whichever surface is drawing it.
//
// A thread and a note in READ are drawn by the same components from the same
// parse, and both carry the span markers (`data-md-from`) that a copy uses to
// turn a selection back into markdown and a double-click uses to find the line
// it asked to write on.
//
// The writing surface is not a second engine with ideas of its own. The editor
// decorates from READ's grammar (`shared/mdLive`, held against the whole vault by
// `checks/md-live.mjs`), so what it draws as bold, italic, a heading, a task or
// a table is exactly what READ draws over the same text — and `_this_` is
// emphasis in neither, where a CommonMark editor would italicise it while you
// typed and READ would contradict it the moment you pressed ⌘E. So is where a
// table or a fence ENDS: a line straight under a table's last row is prose to
// READ and so to the editor, where CommonMark made it a fourth row, and `~~~`
// fences nothing in either. This asks the running app rather than the modules:
// the same note, drawn both ways, the same runs out of each.
//
// A single newline inside a note's paragraph is a line break in READ, because
// it is one in the editor over the same text; READ joining the two lines back
// into one would be the surfaces disagreeing. So the paragraph's span covers
// both lines, and it draws as two.
//
// A note opens in READ; this asks WRITE first, so ⌘E is pressed for it, and
// again for READ. The thread half needs a transcript, which a check cannot make
// without spending a turn: it runs when the vault has a thread to open, and
// when it has none it says so in `threadHalf` rather than passing on nothing.
//
// Seeds its own note through the app's IPC. Run against a throwaway LANES_VAULT
// and LANES_STATE. See checks/README.md.
(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
  const click = (el) => el && el.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  const pane = (i) => document.querySelector(`[data-pane="${i}"]`)
  const key = (k, extra = {}) =>
    window.dispatchEvent(new KeyboardEvent('keydown', { key: k, metaKey: true, bubbles: true, ...extra }))
  const content = () => pane(1)?.querySelector('.cm-content')
  const lines = () => [...(pane(1)?.querySelectorAll('.cm-line') ?? [])]
  const lineWith = (s) => lines().find((l) => l.textContent.includes(s))
  const scroller = () => pane(1)?.querySelector('[data-find-scope]')
  const mode = (m) => pane(1)?.querySelector(`[data-mode="${m}"]`)?.dataset.on === '1'
  const setIn = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b)
  const log = {}

  const UNDER = 'Straight under the table, and prose to READ.'
  const TILDES = 'Between tildes, which READ does not fence.'
  const BODY = [
    '# Engine check',
    '',
    'A paragraph with **bold one** and *soft one*, and _not emphasis_ in either.',
    'A single newline inside it, which a note draws as a line break.',
    '',
    '## A section',
    '',
    '- a bullet with **bold two**',
    '- [ ] an open task',
    '- [x] a done task',
    '',
    '> a quote with *soft two*',
    '',
    '| Item | Deadline |',
    '|---|---|',
    '| one | today |',
    UNDER,
    '',
    '~~~',
    TILDES,
    '~~~',
    ''
  ].join('\n')
  const LINES = BODY.split('\n')
  const at = (s) => LINES.indexOf(s)

  // --- seed it, and open it the way a person would: by finding it ---
  const made = await window.lanes.noteCreate('Engine check', '_unfiled')
  const PATH = made.path || '_unfiled/engine-check.md'
  await window.lanes.noteWrite(PATH, BODY)
  key('k')
  await sleep(600)
  const box = document.querySelector('[data-palette-input]')
  setIn.call(box, 'Engine check')
  box.dispatchEvent(new Event('input', { bubbles: true }))
  await sleep(1000)
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
  await sleep(1800)
  // A note opens in READ; writing is asked for, with ⌘E.
  if (!content()) key('e')
  for (let i = 0; i < 15 && !lineWith('bold one'); i++) await sleep(200)

  /* ---------- WRITE: what the editor draws ---------- */

  log.opensInTheEditor = Boolean(content()) && Boolean(lineWith('bold one'))
  if (!log.opensInTheEditor) return { ...log, pass: false }
  const drawnAs = (sel) =>
    [...(pane(1)?.querySelectorAll(sel) ?? [])].map((e) => e.textContent.trim()).filter(Boolean)
  log.writeBold = drawnAs('.cm-md-strong')
  log.writeItalic = drawnAs('.cm-md-em')
  const under = lineWith('not emphasis')
  log.writeUnderscoresArePlain =
    Boolean(under?.textContent.includes('_not emphasis_')) &&
    !log.writeItalic.some((t) => t.includes('not emphasis'))
  log.writeHeading = Boolean(lineWith('A section')?.classList.contains('cm-md-h2'))
  log.writeTasks = pane(1)?.querySelectorAll('.cm-md-task').length ?? 0
  log.writeDone = pane(1)?.querySelectorAll('.cm-md-task[data-done="1"]').length ?? 0
  log.writeTableLines = pane(1)?.querySelectorAll('.cm-line.cm-md-table').length ?? 0
  // Where a run of lines ends is READ's rule, not CommonMark's: the line under
  // the last row is not a row, and the tildes are not a code card.
  log.writeUnderTableIsProse = Boolean(lineWith(UNDER)) && !lineWith(UNDER).classList.contains('cm-md-table')
  log.writeTildesAreProse = Boolean(lineWith(TILDES)) && !lineWith(TILDES).classList.contains('cm-md-code')
  // The editor is not the document renderer: it keeps its own map of the lines.
  log.writeHasNoSpans = !pane(1)?.querySelector('[data-md-from]')

  /* ---------- READ: what the document engine draws ---------- */

  for (let i = 0; i < 2 && !mode('READ'); i++) {
    key('e')
    await sleep(800)
  }
  log.inRead = mode('READ') && !content()
  if (!log.inRead) return { ...log, pass: false }

  const blocks = () => [...(scroller()?.querySelectorAll('[data-md-from]') ?? [])]
  const runs = (test) =>
    blocks()
      .flatMap((w) => [...w.querySelectorAll('span')])
      .filter(test)
      .map((s) => s.textContent.trim())
      .filter(Boolean)
  log.readBold = runs((s) => s.style.fontWeight === '600')
  log.readItalic = runs((s) => s.style.fontStyle === 'italic')
  const para = blocks().find((w) => w.textContent.includes('bold one'))
  log.readUnderscoresArePlain = Boolean(para?.textContent.includes('_not emphasis_'))
  log.readHeading = scroller()?.querySelector(`[data-toc="h${at('## A section')}"]`)?.textContent.trim() ?? null
  log.readTasks = scroller()?.querySelectorAll('.task-box').length ?? 0
  log.readDone = scroller()?.querySelectorAll('.task-box svg').length ?? 0
  log.readTable = Boolean(scroller()?.querySelector('table th')?.textContent.includes('Item'))
  const readBlock = (s) => blocks().find((w) => w.textContent.includes(s))
  const underRead = readBlock(UNDER)
  log.readUnderTableIsProse =
    Boolean(underRead) && Number(underRead.dataset.mdFrom) === at(UNDER) && !underRead.querySelector('table')
  log.readTildesAreProse = Boolean(readBlock(TILDES)) && !readBlock(TILDES).closest('.copy-host')

  // The spans READ keeps: the source lines each block came from. The title is
  // the head's and is not drawn, so the first block is the paragraph — and it
  // spans BOTH its lines.
  log.noteSpans = blocks().length
  log.paraSpan = para ? [Number(para.dataset.mdFrom), Number(para.dataset.mdTo)] : null
  log.spansAreTheSourceLines = same(log.paraSpan, [2, 3]) && Number(blocks()[0]?.dataset.mdFrom) === 2
  log.noteFindScope = pane(1)?.querySelectorAll('[data-find-scope]').length ?? 0

  // A single newline, drawn as the break it is in the editor.
  log.newlineIsABreak = /either\.\nA single newline/.test(para?.firstElementChild?.innerText ?? '')

  /* ---------- the same runs out of both ---------- */

  log.sameBold = log.readBold.length === 2 && same(log.readBold, log.writeBold)
  log.sameItalic = log.readItalic.length === 2 && same(log.readItalic, log.writeItalic)
  log.sameUnderscores = log.writeUnderscoresArePlain && log.readUnderscoresArePlain
  log.sameHeading = log.writeHeading && log.readHeading === 'A section'
  log.sameTasks = log.writeTasks === 2 && log.readTasks === 2 && log.writeDone === 1 && log.readDone === 1
  log.sameTable = log.writeTableLines === 3 && log.readTable
  log.sameTableEnd = log.writeUnderTableIsProse && log.readUnderTableIsProse
  log.sameTildes = log.writeTildesAreProse && log.readTildesAreProse

  const noteHalf =
    log.opensInTheEditor &&
    log.writeHasNoSpans &&
    log.inRead &&
    log.sameBold &&
    log.sameItalic &&
    log.sameUnderscores &&
    log.sameHeading &&
    log.sameTasks &&
    log.sameTable &&
    log.sameTableEnd &&
    log.sameTildes &&
    log.spansAreTheSourceLines &&
    log.noteFindScope === 1 &&
    log.newlineIsABreak

  /* ---------- a transcript, drawn by the same engine ---------- */

  // The SAME markers appear in a transcript, because it is the same renderer.
  const threads = await window.lanes.threads().catch(() => [])
  const chatRow = document.querySelector('[data-rail-row="chat"]')
  if (!threads.length) {
    log.threadHalf = 'not run: this vault has no thread, and making one would spend a turn'
  } else if (!chatRow) {
    log.threadHalf = 'not run: the vault has threads but no rail row was on screen to open one'
  } else {
    click(chatRow)
    await sleep(1800)
    const chat = pane(0)
    log.chatSpans = chat?.querySelectorAll('[data-md-from]').length ?? 0
    log.chatFindScope = chat?.querySelectorAll('[data-find-scope]').length ?? 0
    log.threadHalf = log.chatSpans > 0 && log.chatFindScope >= 1
  }

  log.pass = Boolean(noteHalf) && log.threadHalf !== false
  return log
})()
