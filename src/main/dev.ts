import { posix, win32 } from 'node:path'

/**
 * Whether this is the packaged app, asked the way electron's own
 * `app.isPackaged` asks it: by the name of the executable running it. A
 * development run is the stock `Electron` binary started on this folder; the
 * packaged app is `Lanes`.
 *
 * Asked here rather than of `app` because the node checks bundle main's
 * modules without electron (checks/context-window.mjs and its kin), and every
 * one of them reads its switches through this module — importing electron here
 * would take them all down. Outside electron altogether it is a development
 * run by definition: nobody runs Lanes as a node script.
 *
 * Pure, so checks/dev-gates.mjs can ask it about executables it is not.
 */
export function packaged(execPath: string, electron: string | undefined, platform: string): boolean {
  if (!electron) return false
  if (platform === 'win32') return win32.basename(execPath).toLowerCase() !== 'electron.exe'
  return posix.basename(execPath).toLowerCase() !== 'electron'
}

/** Not the packaged app: `electron-vite dev`, a driven check, a node check. */
export const DEV = !packaged(process.execPath, process.versions.electron, process.platform)

/**
 * A development switch from the environment, or `undefined` in the packaged
 * app.
 *
 * Every `LANES_*` variable but one is a door for development: the checks move
 * the vault and the state file with them, run a script in the page with the
 * whole bridge behind it, load the page from a dev server, write PDFs without a
 * save panel. Left live in the packaged app, anybody who can set an
 * environment variable for it could point it anywhere. So every read goes
 * through here, and checks/dev-gates.mjs holds the source to that.
 *
 * The one exception is LANES_CLAUDE (which.ts): a CLI installed somewhere
 * unusual is a user's need, not a developer's.
 */
export function devEnv(name: `LANES_${string}` | 'ELECTRON_RENDERER_URL'): string | undefined {
  return DEV ? process.env[name] : undefined
}
