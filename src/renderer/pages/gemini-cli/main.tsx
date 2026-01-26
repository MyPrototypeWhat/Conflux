import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import '@/index.css'
import { initTheme } from '@/hooks'
import App from './App'

// Initialize theme before render to prevent flash
initTheme()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
)
