import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { SuperTokensWrapper } from 'supertokens-auth-react'

import { initI18n } from '@investment-plan/i18n'
import { ThemeProvider, logoUrl } from '@investment-plan/ui'
import App from './App'
import { initSuperTokensWeb } from './auth/supertokens'
import './index.css'

initI18n()
initSuperTokensWeb()

const favicon = document.createElement('link')
favicon.rel = 'icon'
favicon.type = 'image/svg+xml'
favicon.href = logoUrl
document.head.appendChild(favicon)

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <SuperTokensWrapper>
      <ThemeProvider>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </ThemeProvider>
    </SuperTokensWrapper>
  </React.StrictMode>,
)
