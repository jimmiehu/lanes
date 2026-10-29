import { execSync } from 'node:child_process'
import { resolve } from 'node:path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

/**
 * The commit this bundle was built from, baked in at build time.
 *
 * "Is the app actually running my change?" has been the wrong answer three
 * times now, and every time it cost a round trip to find out. An app that can
 * be asked its own build settles it in a glance.
 */
const BUILD = (() => {
  try {
    const sha = execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim()
    const dirty = execSync('git status --porcelain', { encoding: 'utf8' }).trim() ? '+' : ''
    return sha + dirty
  } catch {
    return 'local'
  }
})()

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    // Main asks it too: whether an update is newer than the app (update.ts).
    define: { __BUILD__: JSON.stringify(BUILD) },
    build: { rollupOptions: { input: { index: resolve('src/main/index.ts') } } }
  },
  /*
   * CommonJS, because the windows are sandboxed and a sandboxed preload is not
   * an ES module: it is one script, run with a `require` that knows electron and
   * little else. That is all this preload needs — `contextBridge` and
   * `ipcRenderer`; everything else it names is a type, gone by the time it runs.
   */
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: { index: resolve('src/preload/index.ts') },
        output: { format: 'cjs', entryFileNames: '[name].cjs' }
      }
    }
  },
  renderer: {
    root: 'src/renderer',
    define: { __BUILD__: JSON.stringify(BUILD) },
    resolve: {
      alias: {
        '@': resolve('src/renderer/src'),
        '@shared': resolve('src/shared')
      }
    },
    build: { rollupOptions: { input: { index: resolve('src/renderer/index.html') } } },
    plugins: [react()]
  }
})
