import { BrowserWindow, dialog, ipcMain } from 'electron'
import { writeFile } from 'node:fs/promises'
import { join, relative, isAbsolute, basename } from 'node:path'
import { VAULT } from './config'
import { devEnv } from './dev'
import { readNote } from './notes'

/**
 * A note as a PDF, drawn the way READ draws it.
 *
 * The whole trick is that nothing here draws anything. A hidden window loads
 * the app's OWN renderer with `?print=<path>`, which mounts the same `Doc`
 * component the pane mounts, with the same stylesheet — so the PDF cannot drift
 * from the screen, because there is only one thing that knows what a note looks
 * like. See components/PrintView.tsx.
 *
 * What this file owns is everything that can go wrong around that, and it is a
 * surprising amount. Measured against this project's own Electron 43.4.1:
 *
 *  - `printToPDF` on a window that has never navigated CRASHES the whole app
 *    with SIGTRAP. It is a Chromium CHECK, not an exception, so try/catch does
 *    not save you. Nothing here reaches the print call unless the load resolved.
 *  - A `data:` URL over ~2MB WEDGES THE MAIN PROCESS — no error, no
 *    `did-fail-load`, no timer ever fires again. So the document is never
 *    handed over as a URL; the window loads the real page and fetches the note
 *    through the same IPC the app uses.
 *  - `did-finish-load` is not readiness. It fires when the bundle has
 *    downloaded, before React has mounted and before an `![[embed]]` has
 *    resolved. The page says when it is done, and this waits for that.
 *  - Options THROW rather than clamp, and margins and page sizes are in INCHES.
 *  - `printBackground` defaults to FALSE and `pageSize` to Letter, so a note
 *    exported with the defaults is a US-Letter page with every ground dropped.
 */

/** 1cm, in the inches `printToPDF` measures margins in. */
const CM = 0.3937

const PAGE: Electron.PrintToPDFOptions = {
  pageSize: 'A4',
  // Or every ground Lanes paints — the sheet, the code block, the table rules —
  // is dropped and the page comes out as ink floating on nothing.
  printBackground: true,
  margins: { top: 1.6 * CM, bottom: 1.6 * CM, left: 1.5 * CM, right: 1.5 * CM },
  // The page geometry is this object's to decide, not the document's.
  preferCSSPageSize: false,
  landscape: false,
  scale: 1
}

/** Long enough for a note with embeds on a busy machine; short enough to fail. */
const READY_MS = 20_000

/**
 * A vault-relative path, resolved and checked.
 *
 * `relative()` rather than the `startsWith(VAULT)` the rest of main uses: VAULT
 * carries no trailing slash, so `startsWith` also accepts a sibling directory
 * whose name merely begins with the vault's — `…/Notes-backup/x.md` passes it.
 * Reading is a smaller hole than writing, and it is still a hole.
 */
function inVault(rel: string): string | null {
  if (!rel || isAbsolute(rel)) return null
  const full = join(VAULT, rel)
  const away = relative(VAULT, full)
  return away && !away.startsWith('..') && !isAbsolute(away) ? full : null
}

/** The note drawn into a hidden window, as PDF bytes. */
async function render(rel: string): Promise<Buffer> {
  const win = new BrowserWindow({
    show: false,
    width: 900,
    height: 1200,
    webPreferences: {
      // The app's own window's settings, sandbox and all: this is the same page.
      preload: join(__dirname, '../preload/index.cjs'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      // The page assembles itself on timers and promises. A throttled hidden
      // window can push a setTimeout out by a second, which is a second added
      // to every export for nothing.
      backgroundThrottling: false
    }
  })

  /*
   * Armed BEFORE the load, because the page can finish drawing a small note
   * before `loadURL` has even resolved — the readiness signal would then arrive
   * with nobody listening and this would wait out the full timeout.
   */
  const ready = new Promise<string | null>((resolve) => {
    const id = win.webContents.id
    const heard = (e: Electron.IpcMainEvent, reason: string | null): void => {
      if (e.sender.id !== id) return
      ipcMain.removeListener('lanes:printReady', heard)
      clearTimeout(timer)
      resolve(reason)
    }
    const timer = setTimeout(() => {
      ipcMain.removeListener('lanes:printReady', heard)
      resolve('The note did not finish drawing in time.')
    }, READY_MS)
    ipcMain.on('lanes:printReady', heard)
  })

  try {
    const q = `print=${encodeURIComponent(rel)}`
    // The same entry the app itself loads — dev serves it, the build ships it.
    const dev = devEnv('ELECTRON_RENDERER_URL')
    if (dev) {
      await win.loadURL(`${dev}?${q}`)
    } else {
      await win.loadFile(join(__dirname, '../renderer/index.html'), { search: q })
    }
    // Past this line the window has navigated, which is the condition that
    // keeps `printToPDF` from taking the app down with it.
    const failed = await ready
    if (failed) throw new Error(failed)
    return await win.webContents.printToPDF(PAGE)
  } finally {
    // Destroying mid-print rejects cleanly, and the throw above is caught by
    // the caller — but the window must go either way.
    if (!win.isDestroyed()) win.destroy()
  }
}

/** `note.md` → `note.pdf`, keeping the name the reader knows it by. */
const pdfName = (rel: string): string => basename(rel).replace(/\.md$/i, '') + '.pdf'

export async function exportNotePdf(
  rel: string
): Promise<{ ok: boolean; path?: string; reason?: string }> {
  const full = inVault(rel)
  if (!full) return { ok: false, reason: 'outside vault' }
  // Read it first: a save panel for a note that cannot be read is a question
  // asked for nothing.
  const note = await readNote(rel)
  if (!note) return { ok: false, reason: 'could not read that note' }

  /*
   * Where it goes. The save panel is the honest answer and the one that carries
   * its own permission grant on macOS — but a native panel is invisible to this
   * project's checks, which are renderer scripts, so `LANES_EXPORT_TO` names a
   * directory and skips it. Same shape as LANES_VAULT and LANES_STATE, and the
   * same purpose: making a claim provable rather than believed — and, like
   * them, read in development only.
   */
  let dest: string
  const to = devEnv('LANES_EXPORT_TO')
  if (to) {
    dest = join(to, pdfName(rel))
  } else {
    const parent = BrowserWindow.getAllWindows().find((w) => !w.isDestroyed() && w.isVisible())
    const asked = await (parent
      ? dialog.showSaveDialog(parent, {
          defaultPath: pdfName(rel),
          filters: [{ name: 'PDF', extensions: ['pdf'] }]
        })
      : dialog.showSaveDialog({
          defaultPath: pdfName(rel),
          filters: [{ name: 'PDF', extensions: ['pdf'] }]
        }))
    // Closing the panel is a decision, not a failure. The caller says nothing.
    if (asked.canceled || !asked.filePath) return { ok: false, reason: 'cancelled' }
    dest = asked.filePath
  }

  try {
    await writeFile(dest, await render(rel))
    return { ok: true, path: dest }
  } catch (err) {
    return { ok: false, reason: String(err instanceof Error ? err.message : err) }
  }
}
