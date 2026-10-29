// What a development run would have installed, read after it quit.
//
// src/main/update.ts swaps nothing in development — the bundle would be
// Electron's — and writes what it would have done to its follow home instead.
// update-ready.js and update-quit.js run this after the app has gone, to hold
// that to the install they mean: a restart that reopens, or a quit that does
// not.
//
//   node checks/update-plan.mjs <follow home> reopen|quit
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const [home, want] = process.argv.slice(2)
const file = join(home ?? '', 'swap-plan.json')
const ready = JSON.parse(readFileSync(join(home, 'ready.json'), 'utf8'))
const plan = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : null
const good = plan !== null && plan.from === ready.app && plan.reopen === (want === 'reopen')
console.log(JSON.stringify({ want, plan, pass: good }))
process.exit(good ? 0 : 1)
