import { app, BrowserWindow, ipcMain, Menu, shell, type MenuItemConstructorOptions } from 'electron'
import { readdir, readFile, writeFile } from 'node:fs/promises'
import { basename, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { CliSession, knownFlags } from './cli'
import { authStatus, resolveClaude } from './which'
import { canonicalParent, familyRoot } from '../shared/pathways'
import { MODELS, sessionsDir, setVault, VAULT } from './config'
import {
  createNote,
  createUntitled,
  listNotes,
  noteLinks,
  noteMtime,
  noteOwnChange,
  notesChanged,
  openTaskCount,
  moveNote,
  readNote,
  renameNote,
  resolveLink,
  revealNote,
  trashNote,
  searchContent,
  searchTasks,
  searchComments,
  searchNotes,
  setReadOnlyFolders,
  writeNote,
  writeNoteSync,
  drainWrites
} from './notes'
import { forkThread, loadThread } from './sessions'
import { searchThreads, warmThreadText } from './threadText'
import { deleteSkill, listSkills, writeSkill } from './skills'
import { flushNow, loadState, patchState, readVaultSync } from './state'
import { exportNotePdf } from './pdf'
import { locate, openFound, revealFound } from './locate'
import { loadWindows } from './windows'
import { checkModel } from './models'
import { titleFor } from './title'
import { runShown, settleRuns, startScheduler } from './scheduler'
import { driveRefusal } from './guard'
import { DEV, devEnv } from './dev'
import { openOutside, stays } from './open'
import { foldersIn, isSessionId, lanesIn, sanitizeStatePatch } from './ipcGuard'
import { changeVault, ensureVault } from './vaultChooser'
import { cancelRestart, currentUpdate, installOnQuit, restartIntoUpdate, startUpdates } from './update'

/*
 * dev.ts answers "is this the packaged app?" without asking electron, for a
 * reason of its own; here electron is to hand, and the two must agree. Were
 * they ever to differ, either every dev door would be open in a packaged app,
 * or a development run would ignore LANES_STATE and LANES_VAULT and boot on
 * whoever's state file and vault this Mac has. Neither is a way to run.
 */
if (DEV === app.isPackaged) {
  console.error('lanes: cannot tell whether this is the packaged app; refusing to start')
  process.exit(2)
}

/**
 * Where the state file lives. `LANES_STATE=/some/dir` moves it, which is the
 * counterpart to LANES_VAULT: a driven test run shares the installed app's
 * userData otherwise, and will happily overwrite the tabs and pins of whoever
 * has Lanes open at the time. Must run before anything reads app.getPath.
 * Development only, like every LANES_* switch but one (dev.ts).
 */
const stateDir = devEnv('LANES_STATE')
if (stateDir) app.setPath('userData', stateDir)
/*
 * And the hazard that comment names is refused rather than warned about: see
 * guard.ts. Before `whenReady`, so a refused check never gets a window. Only a
 * development run can be driven at all, so only one is asked.
 */
const refusal = DEV ? driveRefusal(process.env) : null
if (refusal) {
  console.error(refusal)
  process.exit(2)
}
/*
 * THE FOLDER, as early as it can be known: LANES_VAULT in development (every
 * driven check), else what the state file says. Read synchronously, before
 * `ready`, so nothing that asks VAULT can ask it empty-handed. Whether it is
 * there at all is the first thing `whenReady` asks (vaultChooser.ts), before
 * there is a window.
 */
setVault(devEnv('LANES_VAULT') || readVaultSync() || '')
/*
 * ONE LANES PER STATE FILE. Two over one are two schedulers over the same
 * prompts, each running every slot, and two writers of one state file, each
 * putting back what the other just changed. The lock belongs to the userData
 * directory, so it is asked for after LANES_STATE has moved that: every check
 * has its own, and a dev run beside the installed app needs one anyway. A
 * second Lanes shows the first (`second-instance`, below) and goes.
 */
if (!app.requestSingleInstanceLock()) {
  app.quit()
  process.exit(0)
}

/**
 * The page this app is: the dev server in development, the built `index.html`
 * otherwise. Both windows load it, and it is the only place either may go.
 */
const RENDERER_URL = devEnv('ELECTRON_RENDERER_URL')
const INDEX = join(__dirname, '../renderer/index.html')
const OWN_PAGE = RENDERER_URL ?? pathToFileURL(INDEX).href

/**
 * The one permission a page here is given: writing to the clipboard, which is
 * what every copy button does (`navigator.clipboard.writeText`). Nothing in
 * the app asks for a camera, a location, notifications or anything else, so
 * nothing else is granted — to the page or to anything that got into it.
 */
const GRANTED = new Set<string>(['clipboard-sanitized-write'])

/**
 * NOWHERE TO GO. Every web contents the app makes — the window, and the hidden
 * one a PDF is printed from — is held to its own page.
 *
 *  - A navigation away is stopped: a dropped file or a plain link would
 *    otherwise replace the app with whatever it pointed at, bridge and all. A
 *    window's first load is not a navigation in this sense (`loadURL` and
 *    `loadFile` never ask), which is why the print window still prints.
 *  - A new window is never made. What a `target=_blank` link asked for goes
 *    through the one door out (open.ts).
 *  - No `<webview>`, and no permission but the one above.
 */
app.on('web-contents-created', (_e, contents) => {
  const stay = (e: Electron.Event<{ url: string }>): void => {
    if (stays(e.url, OWN_PAGE)) return
    e.preventDefault()
    console.warn(`lanes: navigation stopped: ${e.url.slice(0, 200)}`)
  }
  contents.on('will-navigate', stay)
  contents.on('will-redirect', stay)
  contents.on('will-attach-webview', (e) => e.preventDefault())
  contents.setWindowOpenHandler(({ url }) => {
    void openOutside(url, contents)
    return { action: 'deny' }
  })
  contents.session.setPermissionRequestHandler((_wc, permission, grant) => grant(GRANTED.has(permission)))
  contents.session.setPermissionCheckHandler((_wc, permission) => GRANTED.has(permission))
})
import {
  chatsOfNote,
  dropWeights,
  linkedNotes,
  refresh,
  relatedThreads,
  setLanes,
  threads,
  threadsCached
} from './threadIndex'
import type {
  AppState,
  Attachment,
  ForkExpect,
  ForkResult,
  Pathways,
  StartOptions,
  StreamEvent
} from '../shared/types'

/** One live child process per open session. */
const sessions = new Map<string, CliSession>()
let win: BrowserWindow | null = null
let scheduler: { poke: () => void } | null = null
/** Set once there is a folder to work in. Until then there is no window to make. */
let launched = false

// The second Lanes asked for this one: the window, brought forward, or made
// again if it was closed — the app outlives its window on macOS. Not while the
// first launch is still asking which folder to work in.
app.on('second-instance', () => {
  if (!app.isReady() || !launched) return
  if (!win || win.isDestroyed()) {
    createWindow()
    return
  }
  if (win.isMinimized()) win.restore()
  win.show()
  win.focus()
})

/**
 * To the window, if there is one. Closing it does not quit the app on macOS,
 * and a scheduled run fires with no window more often than with one — so
 * "is anybody there" is asked, not assumed.
 */
function tell(channel: string, payload: unknown): boolean {
  if (!win || win.isDestroyed()) return false
  win.webContents.send(channel, payload)
  return true
}

function send(e: StreamEvent): void {
  win?.webContents.send('lanes:event', e)
  // A finished turn has just grown its own transcript; the index wants to know,
  // and so does the sidebar, whose state line for that thread is now wrong.
  if (e.type === 'done' || e.type === 'exit') {
    scheduleRefresh(1500)
    /*
     * And again, later. The CLI names its own thread AFTER the turn it was
     * named by — the `ai-title` line is appended a few seconds behind the
     * `result` — so the sweep that fires on `done` reads a transcript that does
     * not carry the name yet. Without this second look the tab and the rail
     * both waited for the thirty-second sweep to learn what the thread is
     * called, which is a long time to sit under the opening line of your own
     * first message.
     */
    if (titleTimer) clearTimeout(titleTimer)
    titleTimer = setTimeout(() => {
      titleTimer = null
      scheduleRefresh(0)
    }, 9000)
  }
}

/**
 * Incremental upkeep. The sweep stats the session directory and re-reads only
 * the files that moved, which is cheap enough (a couple of milliseconds when
 * nothing changed) to run on a timer without anyone noticing.
 */
const SWEEP_MS = 30_000
let refreshTimer: NodeJS.Timeout | null = null
let sweepTimer: NodeJS.Timeout | null = null
/** The second look after a turn, for the name the CLI writes late. See `send`. */
let titleTimer: NodeJS.Timeout | null = null

function scheduleRefresh(delay: number): void {
  if (refreshTimer) clearTimeout(refreshTimer)
  refreshTimer = setTimeout(() => {
    refreshTimer = null
    // The status bar says "synced 2m ago", and only this tick knows when we
    // last LOOKED. Deriving it in the renderer from the change pushes below
    // would report the age of the last change instead — a quiet vault would
    // read as hours out of date while being re-checked every thirty seconds.
    win?.webContents.send('lanes:swept', Date.now())
    void refresh().then(async (changed) => {
      if (changed) {
        win?.webContents.send('lanes:threads', threadsCached((await loadState()).pathways))
      }
    })
    // The vault moves too, and mostly because a turn just wrote to it. Nothing
    // watches it — a CloudStorage mount delivers no events — so the same tick
    // that re-reads transcripts re-checks the notes.
    if (devEnv('LANES_DEBUG_NOTES')) console.log('[n] sweep tick')
    void notesChanged().then((changed) => {
      if (devEnv('LANES_DEBUG_NOTES')) console.log('[n] changed=', changed)
      if (!changed) return
      // The weights hold the note index they were resolved against, so a note
      // written since the last weigh is invisible to them — and a note's chat
      // count is looked up by note.
      dropWeights()
      void listNotes().then((n) => win?.webContents.send('lanes:notes', n))
    })
  }, delay)
}

/** Catches sessions run outside this app — the CLI in a terminal writes here too. */
function startSweeping(): void {
  sweepTimer = setInterval(() => scheduleRefresh(0), SWEEP_MS)
  /*
   * And the transcript text, built once in the background. Nothing on screen
   * waits for it — it exists so that the FIRST time somebody types three
   * characters into ⌘K, the answer is already there rather than seconds of
   * reading a few hundred megabytes of jsonl with the palette open and empty.
   * Deliberately after the window, and deliberately not awaited.
   */
  warmThreadText()
}

function sessionFor(
  opts: StartOptions,
  ...defaults: (Partial<Pick<StartOptions, 'safety' | 'effort'>> | undefined)[]
): CliSession {
  // A session id becomes a transcript's file name and a `--resume` argument;
  // one that is not an id is dropped, and the session gets a fresh one.
  if (opts.sessionId && !isSessionId(opts.sessionId)) opts = { ...opts, sessionId: undefined }
  const existing = opts.sessionId ? sessions.get(opts.sessionId) : undefined
  // A safety or effort that is none of the values is not taken: the thread
  // keeps its own, and a new one gets the defaults it was handed.
  opts = knownFlags(opts, existing?.settings, ...defaults)
  if (existing) {
    existing.configure(opts)
    return existing
  }
  const s = new CliSession(opts)
  s.on('event', send)
  sessions.set(s.sessionId, s)
  return s
}

/**
 * What a chat the page starts falls back to, for a safety or effort that is
 * none of the values: the thread's saved effort, then the app's own settings.
 */
async function defaultsFor(
  opts: StartOptions
): Promise<Partial<Pick<StartOptions, 'safety' | 'effort'>>[]> {
  const st = await loadState()
  const id = opts?.sessionId
  return [
    { effort: isSessionId(id) ? st.threadSettings?.[id]?.effort : undefined },
    { safety: st.safety, effort: st.defaultEffort }
  ]
}

/**
 * ⌘W has to be taken off the menu before the page can have it: a menu
 * accelerator is resolved before the key ever reaches the renderer, so a
 * keydown handler for it is dead code. Closing the *window* moves to ⇧⌘W.
 *
 * This replaces Electron's default menu, which means the standard roles have
 * to be re-declared rather than assumed — dropping `editMenu` here would take
 * ⌘C, ⌘V and ⌘A with it, in an app whose whole job is text.
 */
function buildMenu(): void {
  const template: MenuItemConstructorOptions[] = [
    { role: 'appMenu' },
    { role: 'editMenu' },
    { role: 'viewMenu' },
    {
      label: 'Window',
      submenu: [
        {
          label: 'Close Tab',
          accelerator: 'CmdOrCtrl+W',
          click: () => win?.webContents.send('lanes:closeTab')
        },
        { role: 'close', label: 'Close Window', accelerator: 'Shift+CmdOrCtrl+W' },
        { role: 'minimize' },
        { type: 'separator' },
        { role: 'front' }
      ]
    }
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

function createWindow(): void {
  win = new BrowserWindow({
    width: 1440,
    height: 900,
    // 900 was sized for two rails totalling 622px. There is one 250px rail now,
    // and the shedding table sheds all the way down to a 300px pane — so the
    // app is meant to work far narrower than it was allowed to be.
    minWidth: 560,
    minHeight: 620,
    show: false,
    backgroundColor: '#f0f0f0',
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 14, y: 18 },
    webPreferences: {
      // Sandboxed, so the page's own process can reach nothing but the bridge
      // the preload hands it. The preload is built as CommonJS for it (see
      // electron.vite.config.ts).
      preload: join(__dirname, '../preload/index.cjs'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      /*
       * Electron throttles a window that is not on screen — timers, rAF and the
       * compositor's own animations, smooth scrolling included. This window is
       * doing real work while you are in another app: a CLI answer streaming in
       * is the whole point of the thing, and it is exactly then that nobody is
       * looking at it. The checks in checks/ meet the same wall from the other
       * side, going green or red on whether the app happened to be frontmost.
       */
      backgroundThrottling: false
    }
  })

  // A renderer that dies at mount leaves a blank window and says nothing to the
  // terminal — and the capture harness runs headless, so there are no devtools
  // to open. LANES_DEBUG_RENDERER pipes the page's console through to stdout,
  // which is the only way to see a mount-time throw from a scripted run.
  if (devEnv('LANES_DEBUG_RENDERER')) {
    win.webContents.on('console-message', (_e, _level, message, line, source) => {
      console.log(`[renderer] ${message}${source ? ` (${source}:${line})` : ''}`)
    })
  }

  win.on('ready-to-show', () => {
    win?.show()
    // Dev affordance: LANES_CAPTURE=<path> renders once, writes a PNG and quits.
    // Used for the side-by-side fidelity pass against the prototype.
    const shot = devEnv('LANES_CAPTURE')
    if (shot) {
      setTimeout(async () => {
        /*
         * FOCUSED BEFORE THE SCRIPT RUNS, not just before the shot.
         *
         * A driven check is standing in for a person, and a person's window has
         * focus. Anything the app decides from `document.hasFocus()` — whether
         * an answer counts as seen, most obviously — was being asked in a state
         * no reader is ever in, and answered the same way every time.
         */
        /*
         * HELD FOCUSED FOR THE WHOLE RUN.
         *
         * A driven check stands in for a person, and a person's app is the
         * front one. `win.focus()` alone is not enough on macOS — the window
         * comes forward inside an application that is still in the background,
         * and the page's `document.hasFocus()` stays false — and a single
         * `app.focus()` does not hold: the shell that launched this takes it
         * back a second or two later, in the middle of the script. So it is
         * re-asserted until the shot, which is the only way anything the app
         * decides from focus can be checked at all.
         */
        win?.show()
        /*
         * AND FOCUSED AS THE PAGE SEES IT, whoever owns the screen. Re-asserting
         * the app's focus works only while macOS lets an app come forward: with
         * the screen locked — an unattended run — `document.hasFocus()` stays
         * false and no focus event fires, and every check of something the app
         * decides from focus fails for a reason that is not the app's. The
         * page's own focus emulation makes it the focused page by itself. Only
         * here, in a driven capture, which only a development run can make.
         */
        try {
          win?.webContents.debugger.attach('1.3')
          await win?.webContents.debugger.sendCommand('Emulation.setFocusEmulationEnabled', { enabled: true })
        } catch (err) {
          console.warn('lanes: focus emulation unavailable:', err)
        }
        const hold = setInterval(() => {
          app.focus({ steal: true })
          win?.focus()
        }, 700)
        app.focus({ steal: true })
        win?.focus()
        await new Promise((r) => setTimeout(r, 400))
        // LANES_CAPTURE_EXEC runs a script in the page first, so a capture can
        // show the app after an interaction rather than only at rest.
        const exec = devEnv('LANES_CAPTURE_EXEC')
        if (exec) {
          try {
            const result = await win?.webContents.executeJavaScript(await readFile(exec, 'utf8'))
            // As JSON when it is not a string already, so checks/run.mjs reads
            // the whole result rather than util.inspect's abbreviation of it.
            if (result !== undefined) {
              console.log('capture script:', typeof result === 'string' ? result : JSON.stringify(result))
            }
          } catch (err) {
            console.error('capture script failed:', err)
          }
        }
        clearInterval(hold)
        // An unfocused window stops compositing, and capturePage then returns a
        // stale frame — so bring it forward and let it paint before shooting.
        win?.show()
        win?.focus()
        await new Promise((r) => setTimeout(r, 700))
        const img = await win?.webContents.capturePage()
        if (img) await writeFile(shot, img.toPNG())
        app.quit()
      }, Number(devEnv('LANES_CAPTURE_DELAY') ?? 3500))
    }
  })

  // Closed is gone. Every `win?.` after this is a no-op rather than a call into
  // a destroyed window — which is what a scheduled run, or a turn left running
  // when the window closed, would otherwise make on every event.
  win.on('closed', () => {
    win = null
  })

  // Where its links go, and where it may itself go, is decided for every
  // window at once: see `web-contents-created`, above.
  if (RENDERER_URL) {
    void win.loadURL(RENDERER_URL)
  } else {
    void win.loadFile(INDEX)
  }
}

/**
 * Kinship records outlive nothing. A pathway whose own transcript has gone is a
 * record pointing at a missing file, and one whose PARENT has gone has nothing
 * left to be a path *of* — both are dropped, which promotes whatever survives
 * to a thread of its own. That is safe precisely because a pathway is a whole
 * transcript: a promoted one loses its grouping and not a word of itself.
 *
 * Runs at bootstrap, so the renderer is never handed a family with a hole in it.
 */
async function prunedState(): Promise<AppState> {
  const state = await loadState()
  const ids = Object.keys(state.pathways)
  if (!ids.length) return state
  let live: Set<string>
  try {
    live = new Set(
      (await readdir(sessionsDir())).filter((f) => f.endsWith('.jsonl')).map((f) => basename(f, '.jsonl'))
    )
  } catch {
    // A session directory we cannot read is not evidence that anything is gone.
    return state
  }
  const pathways: Pathways = {}
  for (const [child, rec] of Object.entries(state.pathways)) {
    if (live.has(child) && live.has(rec.parent)) pathways[child] = rec
  }
  const pathwayLabels: Record<string, string> = {}
  for (const [at, label] of Object.entries(state.pathwayLabels)) {
    if (live.has(at)) pathwayLabels[at] = label
  }
  const pathwayActive: Record<string, string> = {}
  for (const [root, at] of Object.entries(state.pathwayActive)) {
    // Checked against the map this pass just rewrote, not merely against the
    // disk. Dropping a record in the middle of a family — the parent gone, both
    // ends still there — re-roots what is left, and a pointer that survived on
    // its own file's liveness would then aim a thread at a path no longer in it.
    if (live.has(at) && familyRoot(pathways, at) === root) pathwayActive[root] = at
  }
  if (
    Object.keys(pathways).length === ids.length &&
    Object.keys(pathwayActive).length === Object.keys(state.pathwayActive).length &&
    Object.keys(pathwayLabels).length === Object.keys(state.pathwayLabels).length
  ) {
    return state
  }
  return patchState({ pathways, pathwayActive, pathwayLabels })
}

app.whenReady().then(async () => {
  // A folder to work in, before anything else: no folder, or one that is gone,
  // and the person is asked. Quit there is Quit.
  if (!(await ensureVault())) return
  launched = true
  // What main holds of the person's setup, for the questions asked too often
  // to wait on the state file: which lane a thread is in, and which notes are
  // read only. Kept up to date by the patchState handler below.
  {
    const st = await loadState()
    setLanes(st.lanes)
    setReadOnlyFolders(foldersIn(st.readOnlyFolders))
  }
  // Before any turn can report its context: the windows the CLI has said.
  await loadWindows()
  ipcMain.handle('lanes:bootstrap', async () => {
    const state = await prunedState()
    return { vault: VAULT, models: MODELS, lanes: lanesIn(state.lanes), state }
  })

  // An update follow.sh has ready, and restarting into it: see update.ts.
  ipcMain.handle('lanes:update', () => currentUpdate())
  ipcMain.handle('lanes:updateRestart', () => restartIntoUpdate())
  ipcMain.handle('lanes:updateCancel', () => cancelRestart())

  ipcMain.handle('lanes:note', (_e, path: string) => readNote(path))
  ipcMain.handle('lanes:noteWrite', (_e, path: string, body: string, base?: number) => writeNote(path, body, base))
  // The window closing: whatever the renderer still owes a note is written
  // before the reply, because after the reply there is no renderer to wait on.
  ipcMain.on('lanes:noteWriteSync', (e, path: string, body: string, base?: number, pending?: boolean) => {
    e.returnValue = writeNoteSync(path, body, base, pending)
  })
  ipcMain.handle('lanes:noteCreate', async (_e, name: string, into: string) => {
    const res = await createNote(name, into)
    // createNote grafts the new note into the live index so it opens straight
    // away, and that is exactly what stops the sweep noticing: the graft
    // re-signs the index with the new note in it, so the signature the sweep
    // compares matches and it never fires. The weight layer counted chats per
    // note before this one existed, and a note missing from that count reports
    // no chats at all — on the note the reader is looking straight at.
    if (res.ok) dropWeights()
    return res
  })
  // The nameless one ⌘N makes. Grafted the same way, so dropped the same way.
  ipcMain.handle('lanes:noteCreateUntitled', async (_e, into: string) => {
    const res = await createUntitled(into)
    if (res.ok) dropWeights()
    return res
  })
  ipcMain.handle('lanes:noteMtime', (_e, path: string) => noteMtime(path))
  ipcMain.handle('lanes:noteOwnChange', (_e, path: string) => noteOwnChange(path))
  ipcMain.handle('lanes:reveal', (_e, path: string) => revealNote(path))
  // A path as written — in backticks in a note, in a thread — found, then
  // opened or shown. See locate.ts.
  ipcMain.handle('lanes:locate', (_e, text: string, note: string) => locate(text, note))
  ipcMain.handle('lanes:openFound', (_e, path: string) => openFound(path))
  ipcMain.handle('lanes:revealFound', (_e, path: string) => revealFound(path))
  /*
   * The three that move a note around on disk. Each brings the note index up
   * to date itself — a rename or a move patches it in place, a trash drops it —
   * and each hands back the new path so the renderer can follow the note rather
   * than lose the tab that was showing it. The weights are dropped here for the
   * reason noteCreate gives: they count chats per note path, and each of these
   * changes which paths are notes.
   */
  ipcMain.handle('lanes:noteRename', async (_e, path: string, name: string, free?: boolean) => {
    const res = await renameNote(path, name, { freeName: Boolean(free) })
    if (res.ok) dropWeights()
    return res
  })
  ipcMain.handle('lanes:noteMove', async (_e, path: string, folder: string) => {
    const res = await moveNote(path, folder)
    if (res.ok) dropWeights()
    return res
  })
  ipcMain.handle('lanes:noteTrash', async (_e, path: string) => {
    const res = await trashNote(path)
    if (res.ok) dropWeights()
    return res
  })
  ipcMain.handle('lanes:resolveLink', (_e, target: string) => resolveLink(target))
  ipcMain.handle('lanes:title', (_e, ask: string, reply: string) => titleFor(ask, reply))
  ipcMain.handle('lanes:modelCheck', (_e, cliId: string) => checkModel(cliId))
  ipcMain.handle('lanes:notePdf', (_e, path: string) => exportNotePdf(path))
  ipcMain.handle('lanes:searchNotes', (_e, query: string) => searchNotes(query))
  ipcMain.handle('lanes:linked', (_e, threadId: string) => linkedNotes(threadId))
  ipcMain.handle('lanes:related', async (_e, threadId: string) =>
    relatedThreads(threadId, (await loadState()).pathways)
  )
  ipcMain.handle('lanes:noteLinks', (_e, path: string) => noteLinks(path))
  // Attachments live in the state file rather than the index, so they are read
  // here rather than passed across from the renderer — one source, and a
  // renderer that has not loaded yet cannot hand over a half-built map.
  ipcMain.handle('lanes:chatsOfNote', async (_e, path: string) => {
    const { attachments, pathways } = await loadState()
    const attached = Object.entries(attachments)
      .filter(([, note]) => note === path)
      .map(([id]) => id)
    return chatsOfNote(path, attached, pathways)
  })
  ipcMain.handle('lanes:skills', () => listSkills())
  ipcMain.handle('lanes:writeSkill', (_e, id: string, name: string, description: string) =>
    writeSkill(id, name, description)
  )
  ipcMain.handle('lanes:deleteSkill', (_e, id: string) => deleteSkill(id))

  ipcMain.handle('lanes:state', () => loadState())
  ipcMain.handle('lanes:patchState', async (_e, patch: Partial<AppState>) => {
    // Checked at the door: a key of the wrong type is dropped, the rest lands.
    const clean = sanitizeStatePatch(patch)
    const next = await patchState(clean)
    // A prompt saved may be a schedule set, and the switch may have just been
    // turned on: asked now, not in thirty seconds.
    if ('prompts' in clean || 'flags' in clean) scheduler?.poke()
    // Lanes changed in Settings re-file every thread — the lane is worked out
    // from what a thread touched each time the list is made, so the list is
    // made again now rather than at the next sweep.
    if ('lanes' in clean) {
      setLanes(next.lanes)
      // Said to the window whoever patched them, then the threads re-filed.
      tell('lanes:lanes', lanesIn(next.lanes))
      tell('lanes:threads', threadsCached(next.pathways))
    }
    if ('readOnlyFolders' in clean) setReadOnlyFolders(foldersIn(next.readOnlyFolders))
    return next
  })
  // Another folder to work in, from Settings: picked, written, relaunched on.
  // Whatever is running is stopped and every note's last words written first —
  // the window has already asked whether a running turn may be stopped.
  ipcMain.handle('lanes:chooseVault', () =>
    changeVault(win && !win.isDestroyed() ? win : null, async () => {
      for (const s of sessions.values()) s.kill()
      sessions.clear()
      await drainWrites()
    })
  )
  // The window made a scheduled run's tab, so the next one to open need not.
  ipcMain.handle('lanes:runShown', (_e, promptId: string) => runShown(promptId))
  ipcMain.handle('lanes:notesList', () => listNotes())

  ipcMain.handle('lanes:searchTasks', (_e, q: string) => searchTasks(q))
  ipcMain.handle('lanes:searchComments', (_e, q: string) => searchComments(q))
  ipcMain.handle('lanes:openTasks', () => openTaskCount())
  ipcMain.handle('lanes:searchContent', (_e, query: string) => searchContent(query))
  // Cheap, tokenless, and asked at launch: a signed-out CLI should be known
  // before a message is composed, not after one has been lost to it.
  ipcMain.handle('lanes:authStatus', () => authStatus())
  // Threads by what was SAID in them, not by the name the CLI cut off the
  // opening prompt. The family's own pathways collapse a phrase that predates
  // a fork into the one thread that shows it.
  ipcMain.handle('lanes:searchThreads', async (_e, query: string) =>
    searchThreads(query, (await loadState()).pathways)
  )

  ipcMain.handle('lanes:threads', async () => threads((await loadState()).pathways))
  ipcMain.handle('lanes:thread', async (_e, id: string) => {
    if (!isSessionId(id)) return null
    const st = await loadState()
    return loadThread(id, st.pathways, st.pathwayLabels, st.contextWindows)
  })
  /**
   * The fork, and the one record that makes it a path of something rather than
   * a thread of its own.
   *
   * Written here rather than in the renderer because this is the only side that
   * knows where the cut actually fell — and because the copy has to exist before
   * anything claims kinship with it. That order is the whole failure story: a
   * crash between the two leaves a perfectly good standalone thread, which is
   * what forks were before any of this, while the reverse would leave a record
   * pointing at a file that was never written.
   */
  ipcMain.handle(
    'lanes:fork',
    async (
      _e,
      id: string,
      atMessage: number,
      keep: boolean,
      expect?: ForkExpect
    ): Promise<ForkResult> => {
      if (!isSessionId(id)) return { ok: false, reason: 'unreadable' }
      const res = await forkThread(id, atMessage, keep, expect)
      if (!res.ok) return res

      const prev = await loadState()
      const parent = canonicalParent(prev.pathways, id, res.at.sharedLines)
      const root = familyRoot(prev.pathways, parent)
      const patch: Partial<AppState> = {
        pathways: {
          ...prev.pathways,
          [res.at.id]: {
            parent,
            sharedLines: res.at.sharedLines,
            forkUuid: res.at.forkUuid,
            created: Date.now()
          }
        },
        pathwayActive: { ...prev.pathwayActive, [root]: res.at.id }
      }
      // What a pathway inherits from the session it was cut out of. Each of
      // these is keyed by session id and each is as true of the copy as of the
      // original — but they are copied ONCE, not kept in step: from here on each
      // path is its own CLI session and may be answered by a different model.
      const settings = prev.threadSettings[id]
      if (settings) patch.threadSettings = { ...prev.threadSettings, [res.at.id]: settings }
      const note = prev.attachments[id]
      if (note) patch.attachments = { ...prev.attachments, [res.at.id]: note }
      const lane = prev.laneOverrides[id]
      if (lane) patch.laneOverrides = { ...prev.laneOverrides, [res.at.id]: lane }

      const state = await patchState(patch)
      // patchState debounces its write by 250ms. A crash inside that window
      // would leave the copy on disk with nothing recording what it is a path
      // of — recoverable, since it degrades to a standalone thread, but there is
      // no reason to carry the window when closing it costs one write.
      await flushNow()
      return { ok: true, at: res.at, state }
    }
  )

  /**
   * Letting one path go. To the system Trash, not to nothing — a path is a
   * conversation, and the app's answer to deleting one is the same as its
   * answer to deleting a note: recoverable in the Finder, so this can be a menu
   * item rather than a modal.
   *
   * Only a PATH can be let go this way. A family's root is the thread itself,
   * and throwing away a whole conversation is a different question from
   * dropping one of the ways it went.
   *
   * Its own children are promoted, not swept up with it. Every pathway is a
   * complete transcript, so a child that loses its parent has lost a grouping
   * and not a word — it simply becomes a thread of its own.
   */
  ipcMain.handle(
    'lanes:pathTrash',
    async (_e, id: string): Promise<{ ok: boolean; state?: AppState }> => {
      if (!isSessionId(id)) return { ok: false }
      const prev = await loadState()
      if (!prev.pathways[id]) return { ok: false }
      try {
        await shell.trashItem(join(sessionsDir(), `${id}.jsonl`))
      } catch {
        return { ok: false }
      }
      const pathways: Pathways = {}
      for (const [child, rec] of Object.entries(prev.pathways)) {
        if (child === id || rec.parent === id) continue
        pathways[child] = rec
      }
      const pathwayActive: Record<string, string> = {}
      for (const [root, at] of Object.entries(prev.pathwayActive)) {
        if (at !== id && familyRoot(pathways, at) === root) pathwayActive[root] = at
      }
      const { [id]: _gone, ...pathwayLabels } = prev.pathwayLabels
      const state = await patchState({ pathways, pathwayActive, pathwayLabels })
      await flushNow()
      scheduleRefresh(300)
      return { ok: true, state }
    }
  )

  ipcMain.handle(
    'lanes:send',
    async (
      _e,
      opts: StartOptions,
      text: string,
      quote?: { label: string; text: string },
      images?: Attachment[]
    ) => {
      const s = sessionFor(opts, ...(await defaultsFor(opts)))
      s.send(text, quote, images)
      return s.sessionId
    }
  )

  ipcMain.handle('lanes:configure', async (_e, opts: StartOptions) => {
    sessionFor(opts, ...(await defaultsFor(opts)))
    return true
  })

  ipcMain.handle('lanes:interrupt', (_e, sessionId: string) => {
    sessions.get(sessionId)?.interrupt()
    return true
  })

  /**
   * A closed tab's chat has nothing left to talk to. Reading a chat never
   * spawned anything — `spawn()` runs from `send()` alone — so this only bites
   * for a chat that was actually used, and the next open resumes it from the
   * transcript the same way a relaunch does.
   */
  ipcMain.handle('lanes:close', (_e, sessionId: string) => {
    const s = sessions.get(sessionId)
    if (!s) return false
    s.kill()
    sessions.delete(sessionId)
    return true
  })

  /*
   * A yes or a no to a Guarded refusal. Only which session, and which
   * question, are read off what the page sends back: the session checks the
   * id against the refusal it emitted, and how wide a yes is comes from its
   * own record of that refusal, never from the request returned with it.
   */
  ipcMain.handle('lanes:answer', (_e, request: unknown, approved: unknown) => {
    const said = (request ?? {}) as { sessionId?: unknown; id?: unknown }
    if (!isSessionId(said.sessionId)) return false
    void sessions.get(said.sessionId)?.answer({ id: said.id }, approved === true)
    return true
  })

  // Worth printing before anything else: in a packaged app this is the single
  // most likely thing to be wrong, and it is invisible from the UI.
  if (devEnv('LANES_DEBUG_CLI')) {
    const c = resolveClaude()
    console.log(`claude: ${c.bin} (via ${c.via})`)
    console.log(`PATH:   ${c.path}`)
  }

  // Runs a quit left running are said to have stopped before anything reads them.
  await settleRuns()
  buildMenu()
  createWindow()
  startSweeping()
  startUpdates({
    tell,
    // A reply anywhere is said first: it lands on its own, while a question
    // waits for you — and is said once the replies are in.
    holding: () => {
      const held = [...sessions.values()].map((s) => s.holding)
      return held.includes('reply') ? 'reply' : held.includes('question') ? 'question' : null
    }
  })
  scheduler = startScheduler({
    sessionFor,
    close: (id) => {
      sessions.get(id)?.kill()
      sessions.delete(id)
    },
    tell,
    hasWindow: () => Boolean(win && !win.isDestroyed())
  })

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  // Deliberately does NOT kill the sessions. Closing the window used to end
  // every turn in flight; on macOS the app is still running, the CLI keeps
  // going and keeps writing its transcript, and reopening reads the finished
  // answer back off disk. Elsewhere `app.quit()` reaches `before-quit`, which
  // is where the killing belongs.
  if (process.platform !== 'darwin') app.quit()
})

/**
 * Quitting is held open for one write. `patchState` debounces by 250ms, so a
 * synchronous quit tears the process down with the state file still on the
 * threadpool — losing whichever tab move or attachment happened in that window,
 * and an attachment is the only record of which note an unsent chat belongs to.
 *
 * The flag is what makes the second pass through here — the one `app.quit()`
 * below triggers — fall past the preventDefault rather than looping.
 */
let quitting = false

app.on('before-quit', (e) => {
  if (quitting) return
  quitting = true
  // An update ready goes in once this process is gone (update.ts).
  installOnQuit()
  for (const s of sessions.values()) s.kill()
  if (refreshTimer) clearTimeout(refreshTimer)
  if (sweepTimer) clearInterval(sweepTimer)
  e.preventDefault()
  // The notes' writes too, not only the state file: a save handed to main a
  // moment before quitting is still in the queue, and tearing the process
  // down under it is the last few words of a note going nowhere.
  void Promise.allSettled([flushNow(), drainWrites()]).finally(() => app.quit())
})
