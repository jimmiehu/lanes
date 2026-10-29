import { app, dialog, type BrowserWindow, type OpenDialogOptions } from 'electron'
import { statSync } from 'node:fs'
import { cp } from 'node:fs/promises'
import { isAbsolute, join } from 'node:path'
import { setVault, VAULT } from './config'
import { devEnv } from './dev'
import { foldersIn, lanesIn } from './ipcGuard'
import { flushNow, loadState, patchState, readVaultSync } from './state'
import type { AppState } from '../shared/types'

/**
 * THE FOLDER LANES WORKS IN IS ASKED FOR, NOT ASSUMED.
 *
 * Every thread runs in it and every note is read from it, so there is no
 * window without one. At launch, before the window, main looks at what the
 * state file says (and, in development, LANES_VAULT): a folder that is there
 * is the answer; none, or one that is gone, and the person is asked — a folder
 * of their own, a copy of the sample vault, or Quit. What they choose is
 * written to the state file at once. Settings' *Change…* asks for another and
 * relaunches on it, since every open thread and the whole note index belong to
 * the folder they were started in.
 *
 * The decision and the words are pure (`vaultNeed`, `chooserText`), and the
 * rest asks electron's dialogs, so checks/vault-chooser.mjs runs all of it in
 * node with the dialogs answering from a script.
 */

export type VaultNeed =
  | { ask: false; vault: string }
  | { ask: true; reason: 'none' }
  | { ask: true; reason: 'missing'; path: string }

/**
 * Whether to ask, and why. LANES_VAULT — development only, and what every
 * driven check runs on — wins over the state file, so a check never meets the
 * question. A folder that is not there is asked about by name: it may only
 * have moved, or be on a drive that is not connected.
 */
export function vaultNeed(
  fromState: string | null,
  fromEnv: string | undefined,
  isFolder: (path: string) => boolean
): VaultNeed {
  const vault = fromEnv || fromState || ''
  if (!vault) return { ask: true, reason: 'none' }
  if (!isFolder(vault)) return { ask: true, reason: 'missing', path: vault }
  return { ask: false, vault }
}

/** An absolute path to a directory that is there. A relative one would be wherever the app was started. */
function isFolder(path: string): boolean {
  try {
    return isAbsolute(path) && statSync(path).isDirectory()
  } catch {
    return false
  }
}

const WHAT = 'Lanes is a place to write in a folder of Markdown notes, with Claude working beside you in the same folder.'
const CALM = 'No account, no cloud, no tracking. Your notes stay in your folder.'
const BUTTONS = ['Choose a folder…', 'Use the sample', 'Quit']
const ACTIONS = ['choose', 'sample', 'quit'] as const

/** What the question says, and its three answers in the order `ACTIONS` reads them. */
export function chooserText(need: VaultNeed & { ask: true }): { message: string; detail: string; buttons: string[] } {
  if (need.reason === 'missing') {
    return {
      message: `Your folder ${need.path} isn’t there.`,
      detail: `It may have moved, or be on a drive that is not connected. Choose it where it is now, or another folder.\n\n${WHAT}\n\n${CALM}`,
      buttons: [...BUTTONS]
    }
  }
  return {
    message: 'Which folder should Lanes work in?',
    detail: `${WHAT} Choose a folder of your own, or try the sample first.\n\n${CALM}`,
    buttons: [...BUTTONS]
  }
}

/** A folder from the system's picker, or null for Cancel. It may make a new one. */
async function pickFolder(parent: BrowserWindow | null, opts: OpenDialogOptions): Promise<string | null> {
  const options: OpenDialogOptions = { ...opts, properties: ['openDirectory', 'createDirectory'] }
  const res = parent ? await dialog.showOpenDialog(parent, options) : await dialog.showOpenDialog(options)
  return res.canceled || !res.filePaths[0] ? null : res.filePaths[0]
}

/**
 * The sample's own setup, as its guide (`Start here.md`) describes it: two
 * lanes, and an inbox that is read only. Given only to a state file with no
 * lanes and no read-only folders of its own — somebody's setup is theirs, and
 * is never written over.
 */
const SAMPLE_SETUP: Pick<AppState, 'lanes' | 'readOnlyFolders'> = {
  lanes: [
    { id: 'garden', name: 'Garden', folder: 'projects/garden' },
    { id: 'kitchen', name: 'Kitchen', folder: 'projects/kitchen' }
  ],
  readOnlyFolders: ['inbox/']
}

/** The sample as it ships: beside the app when packaged (electron-builder's extraResources), the repository's fixture in development. */
function sampleSource(): string {
  return app.isPackaged
    ? join(process.resourcesPath, 'sample-vault')
    : join(app.getAppPath(), 'fixtures', 'sample-vault')
}

/**
 * A copy of the sample, made inside `where` as `Lanes Sample` — or `Lanes
 * Sample 2`, and on, when that is taken. Never over anything: a sample from
 * last time may have somebody's writing in it by now.
 */
async function copySample(where: string): Promise<string> {
  let target = join(where, 'Lanes Sample')
  for (let n = 2; n < 100; n++) {
    try {
      statSync(target)
    } catch {
      break
    }
    target = join(where, `Lanes Sample ${n}`)
  }
  await cp(sampleSource(), target, { recursive: true, errorOnExist: true, force: false })
  return target
}

/**
 * The folder, into the state file, now — not on the 250ms debounce, since what
 * follows is either a window that reads it or a relaunch that must find it.
 * Only the keys named change; everything else the file holds stays as it was.
 */
async function saveVault(path: string, setup?: Pick<AppState, 'lanes' | 'readOnlyFolders'>): Promise<void> {
  const st = await loadState()
  const patch: Partial<AppState> = { vault: path }
  if (setup && !lanesIn(st.lanes).length && !foldersIn(st.readOnlyFolders).length) Object.assign(patch, setup)
  await patchState(patch)
  await flushNow()
}

/**
 * The question, until it is answered. A picker cancelled is not an answer —
 * the question comes back — and Quit quits, writing nothing. Resolves with the
 * folder, or null after Quit.
 */
export async function chooseVault(need: VaultNeed & { ask: true }): Promise<string | null> {
  const { message, detail, buttons } = chooserText(need)
  for (;;) {
    const { response } = await dialog.showMessageBox({ message, detail, buttons, defaultId: 0, cancelId: 2, noLink: true })
    const action = ACTIONS[response] ?? 'quit'
    if (action === 'quit') {
      app.quit()
      return null
    }
    if (action === 'choose') {
      const picked = await pickFolder(null, { title: 'Choose the folder Lanes works in', buttonLabel: 'Use This Folder' })
      if (!picked) continue
      await saveVault(picked)
      return picked
    }
    const where = await pickFolder(null, {
      title: 'Where should the sample go?',
      message: 'A folder called “Lanes Sample” is made inside the one you choose.',
      buttonLabel: 'Put It Here'
    })
    if (!where) continue
    try {
      const copy = await copySample(where)
      await saveVault(copy, SAMPLE_SETUP)
      return copy
    } catch (err) {
      dialog.showErrorBox('The sample could not be copied there', String(err))
    }
  }
}

/**
 * At launch, before the window: the folder this run works in, asked for if it
 * has to be. False when the person chose Quit — launch goes no further.
 */
export async function ensureVault(): Promise<boolean> {
  const need = vaultNeed(readVaultSync(), devEnv('LANES_VAULT'), isFolder)
  if (!need.ask) {
    setVault(need.vault)
    return true
  }
  const chosen = await chooseVault(need)
  if (chosen === null) return false
  setVault(chosen)
  return true
}

/**
 * Settings' *Change…*: another folder, written to the state file, and the app
 * relaunched on it. Whether a turn is running has been asked already, in the
 * window (a fail-safe confirm is the renderer's); `stop` ends what is running
 * and lands what is still being written before the process goes.
 *
 * Resolves only when nothing changes: the picker cancelled, the same folder
 * picked again, or — in development — LANES_VAULT naming the folder for this
 * run, which a relaunch would only come back to.
 */
export async function changeVault(
  parent: BrowserWindow | null,
  stop?: () => Promise<void>
): Promise<{ ok: boolean; reason?: string }> {
  if (devEnv('LANES_VAULT')) return { ok: false, reason: 'LANES_VAULT' }
  const picked = await pickFolder(parent, {
    title: 'Choose the folder Lanes works in',
    buttonLabel: 'Use This Folder',
    defaultPath: VAULT || undefined
  })
  if (!picked) return { ok: false, reason: 'cancelled' }
  if (picked === VAULT) return { ok: false, reason: 'unchanged' }
  await stop?.()
  await saveVault(picked)
  app.relaunch()
  app.exit(0)
  return { ok: true }
}
