// Threads for the sample vault, the CLI never having been asked.
//
// The checks were written against a vault in daily use, threads and all: a rail
// with THREADS in it, tabs to step between, a lane a thread is filed in by the
// notes it worked on. A copy of fixtures/sample-vault has notes and no threads,
// because a thread lives outside the vault — in ~/.claude/projects, under a
// directory named after the vault's path, which a copied vault only gets once
// it has a path. So the runner calls this after copying: eight threads, each a
// whole transcript the way the CLI writes one, two of them reading and editing
// notes in projects/garden and two in projects/kitchen, so each lands in a lane
// once lanes are read from state. Each file is dated by its last line, an hour
// to three days back, so they are not all today's and RECENT, which folds on
// today, has one past its fold; and the second newest runs long enough to
// scroll past its own head.
//
// Writes only under that vault's directory in ~/.claude/projects, and only for
// a vault under /private/tmp. Give the RESOLVED path.
//
//   node checks/sample-threads.mjs /private/tmp/lanes-check-xxxx/vault
//
// With `--many` (manifest `"threads": "many"`), forty-five more, older and
// short, so the list runs past the palette's page of forty; and one transcript
// the way the desktop app leaves a session it hosts: its last line a week old,
// and the file written just now by a `cost-state` line with no timestamp.
import { mkdirSync, utimesSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const vault = process.argv[2]
const many = process.argv.includes('--many')
if (!vault || !vault.startsWith('/private/tmp/')) {
  console.error('usage: node checks/sample-threads.mjs /private/tmp/<throwaway-vault>')
  process.exit(1)
}
const sessions = join(homedir(), '.claude', 'projects', vault.replace(/[^a-zA-Z0-9]/g, '-'))
mkdirSync(sessions, { recursive: true })

const read = (rel) => ({ type: 'tool_use', id: `t-${rel}`, name: 'Read', input: { file_path: join(vault, rel) } })
const edit = (rel) => ({
  type: 'tool_use',
  id: `e-${rel}`,
  name: 'Edit',
  input: { file_path: join(vault, rel), old_string: 'x', new_string: 'y' }
})
const result = (id) => ({ type: 'tool_result', tool_use_id: id, content: 'ok' })

/** Each: an id, a title, and its turns — text, or text with the tools it used. */
const THREADS = [
  {
    id: '5a3e0001-0000-4000-8000-000000000001',
    title: 'Garden — spring beds',
    hoursAgo: 1,
    turns: [
      ['user', 'Which beds still need compost before the spring planting?'],
      ['assistant', 'Reading the bed plan first.', [read('projects/garden/beds.md')]],
      ['assistant', 'Beds two and four. Bed one was done in March, and bed three is fallow this year, so it waits.'],
      ['user', 'Mark them in the note.'],
      ['assistant', 'Done — both are ticked off as "needs compost".', [edit('projects/garden/beds.md')]]
    ]
  },
  {
    id: '5a3e0002-0000-4000-8000-000000000002',
    title: 'Garden — turning the compost',
    hoursAgo: 3,
    turns: [
      ['user', 'Is the compost heap ready to turn?'],
      ['assistant', 'Let me check what the compost note says about the last turn.', [read('projects/garden/compost.md')]],
      ['assistant', 'Yes. It was last turned five weeks ago, and the note says every four to six weeks while the weather is warm.'],
      // Long enough to scroll past its own head: tab-rename.js renames this one
      // as the second tab, and wants the field brought back on screen.
      ['user', 'Walk me through it. I have never turned the middle bay on my own.'],
      [
        'assistant',
        [
          'Start with the right-hand bay, because the middle one has to go somewhere. Dig out whatever is ready, sieve it if you want it fine for seed trays, and barrow it to the beds or into bags. You want the right bay empty down to the soil before you touch anything else.',
          'Then fork the middle bay across into the right one, a layer at a time. Take it from the top and the outside first: that is the material that has had the least heat, and it goes into the middle of the new heap, where it will get the most. What was in the centre ends up on the outside.',
          'Break up any clumps as you go. Grass that went in too thick will have matted into a grey slab that smells of drains; tear it apart and mix it through drier stuff, and it will be fine within a fortnight.',
          'Look at the colour and the smell as you dig. Dark brown and earthy is right. Pale and dry means it has stalled for lack of water or green material. Slimy and sour means too much green, too little air.',
          'Water it as you build, if it needs it, a can every few forkfuls, so it ends up as damp as a wrung-out sponge all the way through rather than wet on top and dust underneath.',
          'Finish with a layer of cardboard or an old carpet over the top, to keep the heat in and the rain off. It should be warm to the hand inside three or four days if it is working.'
        ].join('\n\n')
      ],
      ['user', 'And if it is too wet when I open it up?'],
      [
        'assistant',
        [
          'Add brown as you turn it: torn cardboard, shredded paper, the dry stems from the autumn clear-up, straw if there is any in the shed. Roughly one forkful of brown to every two of the wet stuff, mixed rather than layered.',
          'Leave the cover off for a dry day or two afterwards, and check the bottom of the bay. If water is pooling under the pallets, lift the heap off the soil with a layer of woody prunings so it can drain.',
          'And look at what went in. A wet heap in autumn is nearly always grass and peelings without enough to balance them, so the note about equal amounts green and brown is worth keeping to over the winter as well.'
        ].join('\n\n')
      ],
      ['user', 'What about the right-hand bay once it is full?'],
      [
        'assistant',
        [
          'Leave it alone. Once the material has moved right it is not turned again; it finishes slowly under its cover, and by the spring it is what feeds the beds.',
          'If you need some sooner, take it from the bottom, where it is oldest, and leave the top to carry on. The note says the right-hand bay goes on the beds in November, so that is the next time it needs any thought at all.'
        ].join('\n\n')
      ]
    ]
  },
  {
    id: '5a3e0003-0000-4000-8000-000000000003',
    title: 'Kitchen — bread timings',
    hoursAgo: 5,
    turns: [
      ['user', 'Can the rye starter wait until Sunday?'],
      ['assistant', 'Reading the bread note.', [read('projects/kitchen/bread.md')]],
      ['assistant', 'Yes, fed tonight and kept in the fridge it will hold until Sunday morning. Take it out two hours before mixing.']
    ]
  },
  {
    id: '5a3e0004-0000-4000-8000-000000000004',
    title: 'A question about Ada Lovelace',
    hoursAgo: 26,
    turns: [
      ['user', 'What did Ada Lovelace add to the notes on the Analytical Engine?'],
      [
        'assistant',
        'Her notes — longer than the paper they annotated — describe how the engine could compute Bernoulli numbers, step by step, and argue that it could act on anything whose relations could be expressed symbolically, not only on numbers.'
      ]
    ]
  },
  {
    id: '5a3e0005-0000-4000-8000-000000000005',
    title: 'Reading list for the winter',
    hoursAgo: 50,
    turns: [
      ['user', 'Pick three books from the reading notes for the winter.'],
      ['assistant', 'Looking at what is there.', [read('reading/cafe-hours.md')]],
      ['assistant', 'Three, shortest first: the essay collection, the history of navigation, and the long novel for the holidays.']
    ]
  },
  {
    id: '5a3e0006-0000-4000-8000-000000000006',
    title: 'Kitchen — stock for the week',
    hoursAgo: 8,
    turns: [
      ['user', 'What do I need for the vegetable stock on Sunday?'],
      ['assistant', 'Reading the stock note.', [read('projects/kitchen/stock.md')]],
      ['assistant', 'Onions, carrots, celery, a leek, parsley stalks and a bay leaf. The pantry note says the bay leaves ran out, so add those to the list.'],
      ['user', 'Add them to the pantry list.'],
      ['assistant', 'Added under "to buy".', [edit('projects/kitchen/pantry.md')]]
    ]
  },
  {
    id: '5a3e0007-0000-4000-8000-000000000007',
    title: 'Grace Hopper and the nanosecond',
    hoursAgo: 30,
    turns: [
      ['user', 'Why did Grace Hopper hand out lengths of wire?'],
      [
        'assistant',
        'Each was about thirty centimetres long: the distance light travels in a nanosecond. She used them to show why a signal sent to a satellite takes as long as it does, and why a programmer should not waste microseconds.'
      ]
    ]
  },
  {
    id: '5a3e0008-0000-4000-8000-000000000008',
    title: 'The river walk, second half',
    hoursAgo: 75,
    turns: [
      ['user', 'Where did the second half of the river walk notes stop?'],
      ['assistant', 'Reading the essay notes.', [read('reading/river-walks.md')]],
      ['assistant', 'At the weir below the old mill. The next section heading is there with nothing under it yet.']
    ]
  }
]

if (many) {
  for (let n = 1; n <= 45; n++) {
    THREADS.push({
      id: `5a3e1${String(n).padStart(3, '0')}-0000-4000-8000-000000000000`,
      title: `Filler thread ${n}`,
      hoursAgo: 100 + n,
      turns: [
        ['user', `Filler question ${n}?`],
        ['assistant', `Filler answer ${n}.`]
      ]
    })
  }
  THREADS.push({
    id: '5a3e2001-0000-5000-8000-000000000000',
    title: 'Hosted by the desktop app',
    hoursAgo: 200,
    rewritten: true,
    turns: [
      ['user', 'Started from the phone, a week ago.'],
      ['assistant', 'And answered then.']
    ]
  })
}

for (const t of THREADS) {
  let parent = null
  const t0 = Date.now() - t.hoursAgo * 3_600_000
  const lines = []
  t.turns.forEach(([role, text, tools], i) => {
    const uuid = `${t.id.slice(0, 24)}${String(i + 1).padStart(12, '0')}`
    const content = [{ type: 'text', text }, ...(tools ?? [])]
    lines.push({
      parentUuid: parent,
      isSidechain: false,
      type: role,
      message: role === 'user' ? { role: 'user', content } : { role: 'assistant', model: 'claude-sonnet-5', content },
      uuid,
      timestamp: new Date(t0 + i * 60_000).toISOString(),
      cwd: vault,
      sessionId: t.id,
      userType: 'external'
    })
    parent = uuid
    // The CLI answers each tool call with a result in a user line of its own.
    if (tools?.length) {
      const r = `${t.id.slice(0, 24)}${String(100 + i).padStart(12, '0')}`
      lines.push({
        parentUuid: parent,
        isSidechain: false,
        type: 'user',
        message: { role: 'user', content: tools.map((x) => result(x.id)) },
        uuid: r,
        timestamp: new Date(t0 + i * 60_000 + 20_000).toISOString(),
        cwd: vault,
        sessionId: t.id,
        userType: 'external'
      })
      parent = r
    }
  })
  lines.push({ type: 'ai-title', aiTitle: t.title, sessionId: t.id })
  if (t.rewritten) lines.push({ type: 'cost-state', sessionId: t.id, totalCostUSD: 0.01 })
  const file = join(sessions, `${t.id}.jsonl`)
  writeFileSync(file, `${lines.map((l) => JSON.stringify(l)).join('\n')}\n`)
  // The desktop app's batch rewrite: the file is new, its lines are not.
  if (t.rewritten) continue
  // And the age it says it has. The rail dates a thread by when its transcript
  // was last written, as the CLI leaves it — not by the lines in it — so a file
  // written just now would put all eight in today, whatever their timestamps.
  const last = new Date(Math.max(...lines.filter((l) => l.timestamp).map((l) => Date.parse(l.timestamp))))
  utimesSync(file, last, last)
}
console.log(JSON.stringify({ vault, sessions, threads: THREADS.length }))
