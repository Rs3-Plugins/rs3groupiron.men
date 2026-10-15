import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles/tokens.css'
import './index.css'
import App from './App.tsx'
import { applyTheme, readUiPrefs } from './lib/uiPrefs'

// Applied before the first paint, so a saved light/dark choice never flashes
// the other theme while React boots.
applyTheme(readUiPrefs().themePref)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
