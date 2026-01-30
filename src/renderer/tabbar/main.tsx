import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import '@/renderer/index.css'
import { TabBar } from './App'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <TabBar />
  </StrictMode>
)
