import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

// Fonts are bundled rather than fetched from a CDN, so the application renders
// as designed with no network access — it has to survive being opened offline.
import '@fontsource/space-grotesk/500.css'
import '@fontsource/space-grotesk/600.css'
import '@fontsource/inter/400.css'
import '@fontsource/inter/500.css'
import '@fontsource/jetbrains-mono/400.css'
import '@fontsource/jetbrains-mono/500.css'

import './index.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
