import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles/tokens.css'
import './index.css'
import App from './App.tsx'
import { applyTheme, readUiPrefs } from './lib/uiPrefs'

// Applied before the first paint, so a saved light/dark choice never flashes
// the other theme while React boots.
applyTheme(readUiPrefs().themePref)

const RELOAD_KEY = 'chunk-reload-at'
const RELOAD_WINDOW_MS = 10_000

window.addEventListener('vite:preloadError', (event) => {
  const last = Number(sessionStorage.getItem(RELOAD_KEY) ?? 0)
  if (Date.now() - last < RELOAD_WINDOW_MS) return
  sessionStorage.setItem(RELOAD_KEY, String(Date.now()))
  event.preventDefault()
  window.location.reload()
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
