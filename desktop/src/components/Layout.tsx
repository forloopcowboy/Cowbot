import { Outlet, useParams } from 'react-router-dom'
import Sidebar from './Sidebar'

export default function Layout() {
  const { name } = useParams<{ name: string }>()
  return (
    <div className="h-full flex flex-col">
      {/* Custom title bar — draggable. Left side matches sidebar navy, right matches canvas. */}
      <div className="titlebar flex shrink-0 h-9">
        <div className="w-60 bg-navy-900" />
        <div className="flex-1 bg-canvas border-b border-slate-100" />
      </div>
      <div className="flex-1 flex overflow-hidden">
        <Sidebar profileName={name ?? 'unknown'} />
        <main className="flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
