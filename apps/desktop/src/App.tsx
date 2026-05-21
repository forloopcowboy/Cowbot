import { Navigate, Route, Routes } from 'react-router-dom'
import {
  ApiProvider,
  Holdings,
  Layout,
  ProfilePicker,
  ProfileWizard,
  ReportView,
  Reports,
  Settings,
} from '@investment-plan/ui'

import { api } from './api'

export default function App() {
  return (
    <ApiProvider value={api()}>
      <Routes>
        <Route path="/" element={<Navigate to="/app" replace />} />
        <Route path="/app" element={<ProfilePicker />} />
        <Route path="/app/new" element={<ProfileWizard />} />
        <Route path="/app/p/:name" element={<Layout />}>
          <Route index element={<Navigate to="settings" replace />} />
          <Route path="settings" element={<Settings />} />
          <Route path="holdings" element={<Holdings />} />
          <Route path="reports" element={<Reports />} />
          <Route path="reports/:stem" element={<ReportView />} />
        </Route>
      </Routes>
    </ApiProvider>
  )
}
