import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { preloadSymbols } from './symbols'

// simbolurile se încarcă înainte de pornire, ca să fie disponibile sincron la desen și export
preloadSymbols().then(() =>
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  ),
)
