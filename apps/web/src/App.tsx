import { Navigate, Route, Routes } from 'react-router-dom'
import { SessionAuth } from 'supertokens-auth-react/recipe/session'

import {
  AdviceDetail,
  ApiProvider,
  AppHome,
  AskCowbot,
  Holdings,
  Layout,
  ProfileWizard,
  ReportView,
  Reports,
  Settings,
} from '@investment-plan/ui'

import { api, streamQuickAdvice } from './api'
import Home from './pages/Home'
import Auth from './pages/Auth'

export default function App() {
  return (
    <ApiProvider value={api()}>
      <Routes>
        {/* Custom branded sign-in / sign-up */}
        <Route path="/auth" element={<Auth />} />

        {/* Public marketing homepage */}
        <Route path="/" element={<Home />} />

        {/* Public advice-detail page (server enforces viewer scoping) */}
        <Route path="/advice/:id" element={<AdviceDetail />} />

        <Route
          path="/app"
          element={
            <SessionAuth>
              <AppHome to="/" streamQuickAdvice={streamQuickAdvice} />
            </SessionAuth>
          }
        />
        <Route
          path="/app/new"
          element={
            <SessionAuth>
              <ProfileWizard to="/" />
            </SessionAuth>
          }
        />
        <Route
          path="/app/p/:name"
          element={
            <SessionAuth>
              <Layout />
            </SessionAuth>
          }
        >
          <Route index element={<Navigate to="settings" replace />} />
          <Route path="settings" element={<Settings />} />
          <Route path="holdings" element={<Holdings />} />
          <Route path="reports" element={<Reports />} />
          <Route path="reports/:stem" element={<ReportView />} />
          <Route
            path="cowbot"
            element={<AskCowbot streamQuickAdvice={streamQuickAdvice} />}
          />
        </Route>
      </Routes>
    </ApiProvider>
  )
}
