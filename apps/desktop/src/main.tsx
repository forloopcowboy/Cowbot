import React from 'react'
import ReactDOM from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import { initI18n } from '@investment-plan/i18n'
import { ThemeProvider } from '@investment-plan/ui'
import App from './App'
import './index.css'

initI18n()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ThemeProvider>
      <HashRouter>
        <App />
      </HashRouter>
    </ThemeProvider>
  </React.StrictMode>,
)
