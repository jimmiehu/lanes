import { contextBridge, ipcRenderer } from 'electron'
import type {
  AppState,
  Attachment,
  ForkExpect,
  ForkResult,
  LaneDef,
  LinkedNote,
  Located,
  ModelDef,
  Note,
  NoteEntry,
  NoteHit,
  NoteLinks,
  TaskHit,
  CommentHit,
  NoteRef,
  PermissionRequest,
  PromptRun,
  RanNotice,
  RelatedThread,
  SessionSnapshot,
  SkillDef,
  StartOptions,
  StreamEvent,
  ThreadHit,
  ThreadSummary
} from '../shared/types'
import type { UpdateState } from '../shared/update'

/** The renderer's only route to anything with side effects. */
const api = {
  bootstrap: (): Promise<{
    vault: string
    models: ModelDef[]
    lanes: LaneDef[]
    state: AppState
  }> => ipcRenderer.invoke('lanes:bootstrap'),
  patchState: (patch: Partial<AppState>): Promise<AppState> =>
    ipcRenderer.invoke('lanes:patchState', patch),
  threads: (): Promise<ThreadSummary[]> => ipcRenderer.invoke('lanes:threads'),
  /** An update build/follow.sh has ready for this app, or null — and restarting into it, or not. */
  update: (): Promise<UpdateState | null> => ipcRenderer.invoke('lanes:update'),
  updateRestart: (): Promise<UpdateState | null> => ipcRenderer.invoke('lanes:updateRestart'),
  updateCancel: (): Promise<UpdateState | null> => ipcRenderer.invoke('lanes:updateCancel'),
  thread: (id: string): Promise<SessionSnapshot | null> => ipcRenderer.invoke('lanes:thread', id),
  /**
   * Copies a transcript into a session of its own, cut at a message — `keep`
   * decides whether that message survives the cut. `expect` is what the caller
   * believed sat at that index, so a cut cannot land on a different turn than
   * the one that was clicked. Comes back with the split point, or with a reason
   * the caller can say out loud.
   */
  fork: (
    id: string,
    atMessage: number,
    keep: boolean,
    expect?: ForkExpect
  ): Promise<ForkResult> => ipcRenderer.invoke('lanes:fork', id, atMessage, keep, expect),
  /**
   * Sends one path of a thread to the Trash, promoting anything cut from it to
   * a thread of its own. Refuses a thread's root: that is the conversation
   * itself, not one of the ways it went.
   */
  pathTrash: (id: string): Promise<{ ok: boolean; state?: AppState }> =>
    ipcRenderer.invoke('lanes:pathTrash', id),
  send: (
    opts: StartOptions,
    text: string,
    quote?: { label: string; text: string },
    images?: Attachment[]
  ): Promise<string> => ipcRenderer.invoke('lanes:send', opts, text, quote, images),
  configure: (opts: StartOptions): Promise<boolean> => ipcRenderer.invoke('lanes:configure', opts),
  interrupt: (sessionId: string): Promise<boolean> =>
    ipcRenderer.invoke('lanes:interrupt', sessionId),
  /** Drops a chat's process when its tab closes; the transcript is untouched. */
  close: (sessionId: string): Promise<boolean> => ipcRenderer.invoke('lanes:close', sessionId),
  /** Guarded: carries the reader's yes or no back to the refused tool call. */
  answer: (request: PermissionRequest, approved: boolean): Promise<boolean> =>
    ipcRenderer.invoke('lanes:answer', request, approved),
  note: (path: string): Promise<Note | null> => ipcRenderer.invoke('lanes:note', path),
  /**
   * `base` is the mtime the app last read or wrote the note at. Given, a file
   * that has changed since is not overwritten: the reply is `reason: 'conflict'`
   * with the file's new mtime, and nothing is written.
   */
  noteWrite: (
    path: string,
    body: string,
    base?: number
  ): Promise<{ ok: boolean; reason?: string; edited?: number; path?: string; merged?: string }> =>
    ipcRenderer.invoke('lanes:noteWrite', path, body, base),
  noteMtime: (path: string): Promise<number | null> =>
    ipcRenderer.invoke('lanes:noteMtime', path),
  /** The note changed under the app by main's own hand — a rename's rewrite — not somebody else's. */
  noteOwnChange: (path: string): Promise<boolean> => ipcRenderer.invoke('lanes:noteOwnChange', path),
  /** Reveal a note in the Finder. False when the path is not a note in the vault. */
  reveal: (path: string): Promise<boolean> => ipcRenderer.invoke('lanes:reveal', path),
  /**
   * Where a path written in a note or a thread is on this Mac: the vault, the
   * note's folder, then Spotlight. `note` is the note it was written in, or ''.
   */
  locate: (text: string, note: string): Promise<Located> => ipcRenderer.invoke('lanes:locate', text, note),
  /** Open or show a place `locate` found. False for any other path. */
  openFound: (path: string): Promise<boolean> => ipcRenderer.invoke('lanes:openFound', path),
  revealFound: (path: string): Promise<boolean> => ipcRenderer.invoke('lanes:revealFound', path),
  /**
   * The three that move a note on disk. Each returns where it ended up, and how
   * many other notes had their `[[wikilinks]]` rewritten to follow it. For a
   * rename, `free` takes the next free filename when the name's own is taken —
   * what naming an untitled note wants; a rename from the tab does not.
   */
  noteRename: (
    path: string,
    name: string,
    free?: boolean
  ): Promise<{ ok: boolean; path?: string; reason?: string; relinked?: number; relinkedPaths?: string[]; edited?: number }> =>
    ipcRenderer.invoke('lanes:noteRename', path, name, free),
  noteMove: (
    path: string,
    folder: string
  ): Promise<{ ok: boolean; path?: string; reason?: string; relinked?: number; relinkedPaths?: string[]; edited?: number }> =>
    ipcRenderer.invoke('lanes:noteMove', path, folder),
  /** To the system Trash, so it is recoverable in the Finder. */
  noteTrash: (path: string): Promise<{ ok: boolean; reason?: string }> =>
    ipcRenderer.invoke('lanes:noteTrash', path),
  resolveLink: (target: string): Promise<string | null> =>
    ipcRenderer.invoke('lanes:resolveLink', target),
  /** Names a thread from its opening exchange. Null when it could not. */
  title: (ask: string, reply: string): Promise<string | null> =>
    ipcRenderer.invoke('lanes:title', ask, reply),
  /** Asks the CLI whether it knows a model id, before one is added. */
  modelCheck: (cliId: string): Promise<{ ok: boolean; reason?: string }> =>
    ipcRenderer.invoke('lanes:modelCheck', cliId),
  /**
   * A note, as a PDF, drawn the way READ draws it. Resolves once the file is
   * written — or with a reason, including the one that is not a failure: the
   * reader closed the save panel.
   */
  notePdf: (path: string): Promise<{ ok: boolean; path?: string; reason?: string }> =>
    ipcRenderer.invoke('lanes:notePdf', path),
  /**
   * The print window saying it has finished drawing. Not a request — main is
   * waiting on this before it prints, because `did-finish-load` fires long
   * before React has mounted. `reason` is set when the page could not draw the
   * note at all, so main aborts rather than printing an error page.
   */
  printReady: (reason: string | null): void => ipcRenderer.send('lanes:printReady', reason),
  /** Every note, for the browser's ALL and TREE views. */
  notesList: (): Promise<NoteEntry[]> => ipcRenderer.invoke('lanes:notesList'),
  /**
   * A note written before this returns — only for the window closing, when an
   * async write would be torn down with the renderer that sent it. Given a
   * `base` mtime, a file that has moved on since is kept, and the body goes to
   * a `(conflicted copy)` beside it; `path` says where it went.
   */
  noteWriteSync: (
    path: string,
    body: string,
    base?: number,
    pending?: boolean
  ): { ok: boolean; reason?: string; path?: string } => ipcRenderer.sendSync('lanes:noteWriteSync', path, body, base, pending),
  /** Creates a note and returns its path. Refuses to write over an existing one. */
  noteCreate: (
    name: string,
    into: string
  ): Promise<{ ok: boolean; path?: string; reason?: string }> =>
    ipcRenderer.invoke('lanes:noteCreate', name, into),
  /**
   * A note with no name yet, in `into` ('' or '.' for the vault root):
   * `untitled.md`, or the first free `untitled-N.md`. Named later by a rename,
   * once the reader has typed a title.
   */
  noteCreateUntitled: (into: string): Promise<{ ok: boolean; path?: string; reason?: string }> =>
    ipcRenderer.invoke('lanes:noteCreateUntitled', into),
  /** Notes whose *text* contains the query, with the line each matched on. */
  searchContent: (query: string): Promise<NoteHit[]> =>
    ipcRenderer.invoke('lanes:searchContent', query),
  /**
   * Whether the `claude` CLI is signed in — or `'missing'` when there is no CLI
   * to ask. Null when the answer is unreadable.
   */
  authStatus: (): Promise<{ loggedIn: boolean; method: string } | 'missing' | null> =>
    ipcRenderer.invoke('lanes:authStatus'),
  /**
   * Another folder to work in: main asks for it with the system's folder
   * picker, writes it to state and relaunches. Resolves only when nothing was
   * chosen (`reason: 'cancelled'`) or it could not be used.
   */
  chooseVault: (): Promise<{ ok: boolean; reason?: string }> => ipcRenderer.invoke('lanes:chooseVault'),
  /** Threads whose TEXT holds the query — what was said, not what it is called. */
  searchThreads: (query: string): Promise<ThreadHit[]> =>
    ipcRenderer.invoke('lanes:searchThreads', query),
  /** Notes whose title or path matches — what the search box reaches beyond threads. */
  searchNotes: (query: string): Promise<NoteRef[]> =>
    ipcRenderer.invoke('lanes:searchNotes', query),
  /** The notes this thread is about, best first — the touched-notes index. */
  linked: (threadId: string): Promise<LinkedNote[]> =>
    ipcRenderer.invoke('lanes:linked', threadId),
  /** Threads next to this one, each with a line saying what they share. */
  related: (threadId: string): Promise<RelatedThread[]> =>
    ipcRenderer.invoke('lanes:related', threadId),
  /** The same edge as `linked`, read from the note's end: its chats, newest first. */
  chatsOfNote: (path: string): Promise<ThreadSummary[]> =>
    ipcRenderer.invoke('lanes:chatsOfNote', path),
  /** Where a note points, and what points back at it. */
  /** Open tasks across the vault, matched by their own words. */
  searchTasks: (q: string): Promise<TaskHit[]> => ipcRenderer.invoke('lanes:searchTasks', q),
  /** Open review comments matching a query — all of them, the newest notes first, with none. */
  searchComments: (q: string): Promise<CommentHit[]> => ipcRenderer.invoke('lanes:searchComments', q),
  /** Unchecked tasks across every note — the empty note pane's counted chip. */
  openTasks: (): Promise<number> => ipcRenderer.invoke('lanes:openTasks'),
  noteLinks: (path: string): Promise<NoteLinks> => ipcRenderer.invoke('lanes:noteLinks', path),
  /** The vault's own `.claude/skills/` folders, read fresh. */
  skills: (): Promise<SkillDef[]> => ipcRenderer.invoke('lanes:skills'),
  writeSkill: (
    id: string,
    name: string,
    description: string
  ): Promise<{ ok: boolean; reason?: string }> =>
    ipcRenderer.invoke('lanes:writeSkill', id, name, description),
  deleteSkill: (id: string): Promise<{ ok: boolean; reason?: string }> =>
    ipcRenderer.invoke('lanes:deleteSkill', id),
  onEvent: (fn: (e: StreamEvent) => void): (() => void) => {
    const handler = (_e: unknown, payload: StreamEvent): void => fn(payload)
    ipcRenderer.on('lanes:event', handler)
    return () => ipcRenderer.off('lanes:event', handler)
  },
  /** A scheduled prompt has started a run — make its tab before its first event lands. */
  onRan: (fn: (n: RanNotice) => void): (() => void) => {
    const handler = (_e: unknown, payload: RanNotice): void => fn(payload)
    ipcRenderer.on('lanes:ran', handler)
    return () => ipcRenderer.off('lanes:ran', handler)
  },
  /** A scheduled run's record moved: it finished, stopped on a refusal, hit a limit. */
  onRuns: (fn: (u: { promptId: string; run: PromptRun }) => void): (() => void) => {
    const handler = (_e: unknown, payload: { promptId: string; run: PromptRun }): void => fn(payload)
    ipcRenderer.on('lanes:runs', handler)
    return () => ipcRenderer.off('lanes:runs', handler)
  },
  /** The run's tab is made; main notes it so the next window does not make another. */
  runShown: (promptId: string): Promise<PromptRun | null> => ipcRenderer.invoke('lanes:runShown', promptId),
  /** ⌘W, which is a menu accelerator and so never reaches the page itself. */
  onCloseTab: (fn: () => void): (() => void) => {
    const handler = (): void => fn()
    ipcRenderer.on('lanes:closeTab', handler)
    return () => ipcRenderer.off('lanes:closeTab', handler)
  },
  /**
   * A `file:` link into the vault that reached main rather than one of the
   * page's own link handlers: the note it names, vault-relative, to be opened
   * the way a link inside the app opens one. See main's open.ts.
   */
  onOpenNote: (fn: (path: string) => void): (() => void) => {
    const handler = (_e: unknown, path: string): void => fn(path)
    ipcRenderer.on('lanes:openNote', handler)
    return () => ipcRenderer.off('lanes:openNote', handler)
  },
  /** Pushed when a note is created, edited or removed in the vault. */
  onNotes:(fn: (notes: NoteEntry[]) => void): (() => void) => {
    const handler = (_e: unknown, payload: NoteEntry[]): void => fn(payload)
    ipcRenderer.on('lanes:notes', handler)
    return () => ipcRenderer.off('lanes:notes', handler)
  },
  /** Pushed when the index notices a transcript changed on disk. */
  /** Pushed when the lanes in state change — whoever patched them. */
  onLanes: (fn: (lanes: LaneDef[]) => void): (() => void) => {
    const handler = (_e: unknown, payload: LaneDef[]): void => fn(payload)
    ipcRenderer.on('lanes:lanes', handler)
    return () => ipcRenderer.off('lanes:lanes', handler)
  },
  onThreads: (fn: (threads: ThreadSummary[]) => void): (() => void) => {
    const handler = (_e: unknown, payload: ThreadSummary[]): void => fn(payload)
    ipcRenderer.on('lanes:threads', handler)
    return () => ipcRenderer.off('lanes:threads', handler)
  },
  /**
   * Pushed on every sweep, whether or not anything moved. This is what the
   * status bar's "synced" figure means — when we last looked, not when
   * something last changed.
   */
  /** Pushed when what is ready changes: a new build, one installed, a restart waiting or going. */
  onUpdate: (fn: (update: UpdateState | null) => void): (() => void) => {
    const handler = (_e: unknown, payload: UpdateState | null): void => fn(payload)
    ipcRenderer.on('lanes:update', handler)
    return () => ipcRenderer.off('lanes:update', handler)
  },
  onSwept: (fn: (at: number) => void): (() => void) => {
    const handler = (_e: unknown, at: number): void => fn(at)
    ipcRenderer.on('lanes:swept', handler)
    return () => ipcRenderer.off('lanes:swept', handler)
  }
}

contextBridge.exposeInMainWorld('lanes', api)

export type LanesApi = typeof api
