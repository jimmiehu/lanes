import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import PrintView from './components/PrintView'
import './styles/global.css'

// dev: surface renderer errors to the capture harness
;(window as unknown as { __errs: string[] }).__errs = []
window.addEventListener('error', (e) => (window as unknown as { __errs: string[] }).__errs.push(String(e.message)))
window.addEventListener('unhandledrejection', (e) => (window as unknown as { __errs: string[] }).__errs.push('rejection: ' + String(e.reason)))

/**
 * `?print=<vault-relative path>` mounts the note ALONE, for a hidden window
 * that exists only to be turned into a PDF.
 *
 * The same bundle, the same stylesheet, the same document engine — a print
 * renderer that shared none of those would be a second answer to "what does a
 * note look like", and the two would drift the first time either moved. What
 * this branch skips is the app: no rail, no panes, no transport, nothing that
 * would put chrome on the page or start a CLI session in a window nobody can
 * see.
 *
 * NOT StrictMode. Its double-invoked effects would fire the readiness signal
 * twice and, worse, run the note read twice in a window whose whole life is
 * measured in the milliseconds before `printToPDF`.
 */
const printing = new URLSearchParams(window.location.search).get('print')

createRoot(document.getElementById('root') as HTMLElement).render(
  printing ? (
    <PrintView path={printing} />
  ) : (
    <StrictMode>
      <App />
    </StrictMode>
  )
)
