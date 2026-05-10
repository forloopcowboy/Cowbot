import { Navigate, Route, Routes } from 'react-router-dom'
import Layout from './components/Layout'
import ProfilePicker from './pages/ProfilePicker'
import ProfileWizard from './pages/ProfileWizard'
import Settings from './pages/Settings'
import Holdings from './pages/Holdings'
import Reports from './pages/Reports'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<ProfilePicker />} />
      <Route path="/new" element={<ProfileWizard />} />
      <Route path="/p/:name" element={<Layout />}>
        <Route index element={<Navigate to="settings" replace />} />
        <Route path="settings" element={<Settings />} />
        <Route path="holdings" element={<Holdings />} />
        <Route path="reports" element={<Reports />} />
      </Route>
    </Routes>
  )
}
