import { useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { auth } from '../lib/backend.js'
import { useSession } from '../lib/session.jsx'
import { UserDataProvider, useUserData } from '../lib/userdata.jsx'
import { Icon, Logo } from '../ui.jsx'
import JobPanel from '../JobPanel.jsx'
import SearchBar from '../SearchBar.jsx'
import Backdrop from '../Backdrop.jsx'

const NAV = [
  { to: '/app', end: true, icon: 'overview', label: 'Overview' },
  { to: '/app/search', icon: 'search', label: 'Search' },
  { to: '/app/copilot', icon: 'copilot', label: 'AI Copilot' },
  { to: '/app/explore', icon: 'explore', label: 'Job listings' },
  { to: '/app/openings', icon: 'calendar', label: 'Opening soon' },
  { to: '/app/applications', icon: 'applications', label: 'Applications', count: 'apps' },
  { to: '/app/saved', icon: 'saved', label: 'Saved', count: 'saved' },
  { divider: 'Your profile' },
  { to: '/app/resume', icon: 'resume', label: 'Resume' },
  { to: '/app/portfolio', icon: 'portfolio', label: 'Portfolio' },
  { to: '/app/profile', icon: 'profile', label: 'Profile' },
  { to: '/app/autofill', icon: 'extension', label: 'Autofill' },
]

function Toast() {
  const { toast, closeToast } = useUserData()
  useEffect(() => {
    if (!toast) return
    const t = setTimeout(closeToast, 5000)
    return () => clearTimeout(t)
  }, [toast?.id])
  if (!toast) return null
  return (
    <div className="toast" role="status" key={toast.id}>
      <span>{toast.text}</span>
      {toast.action && <button type="button" onClick={() => { toast.action.run(); closeToast() }}>{toast.action.label}</button>}
    </div>
  )
}

function Sidebar({ open, onClose }) {
  const { user, profile } = useSession()
  const { apps, saved } = useUserData()
  const nav = useNavigate()
  const counts = { apps: apps.length, saved: saved.length }
  const name = profile?.full_name || user?.email || 'You'
  return (
    <aside className={`side${open ? ' open' : ''}`} aria-label="Dashboard">
      <div className="side-top">
        <NavLink to="/" className="wordmark"><Logo />Internship Copilot</NavLink>
        <button type="button" className="icon-btn side-close" aria-label="Close menu" onClick={onClose}><Icon name="x" /></button>
      </div>
      <nav className="side-nav">
        {NAV.map((n, i) => n.divider ? <span key={i} className="side-div">{n.divider}</span> : (
          <NavLink key={n.to} to={n.to} end={n.end} onClick={onClose} className={({ isActive }) => `side-link${isActive ? ' on' : ''}`}>
            <Icon name={n.icon} />{n.label}
            {n.count && counts[n.count] > 0 && <span className="count">{counts[n.count]}</span>}
          </NavLink>
        ))}
      </nav>
      <div className="side-user">
        <span className="avatar round" aria-hidden="true">{name.charAt(0).toUpperCase()}</span>
        <span className="side-user-txt"><strong>{name}</strong><span>{profile?.college || user?.email}</span></span>
        <button type="button" className="icon-btn" aria-label="Log out" title="Log out"
          onClick={async () => { await auth.signOut(); nav('/', { replace: true }) }}><Icon name="logout" /></button>
      </div>
    </aside>
  )
}

export default function DashboardLayout() {
  const [open, setOpen] = useState(false)
  const loc = useLocation()
  useEffect(() => { window.scrollTo(0, 0) }, [loc.pathname])
  return (
    <UserDataProvider key="ud">
      <div className="dash">
        <Backdrop variant="app" />
        <Sidebar open={open} onClose={() => setOpen(false)} />
        {open && <button type="button" className="scrim" aria-label="Close menu" onClick={() => setOpen(false)} />}
        <div className="dash-main">
          <header className="dash-top">
            <button type="button" className="icon-btn dash-menu" aria-label="Open menu" onClick={() => setOpen(true)}><Icon name="menu" /></button>
            <span className="wordmark dash-mark"><Logo />Internship Copilot</span>
            {!loc.pathname.startsWith('/app/search') && loc.pathname !== '/app' && <SearchBar />}
          </header>
          <div className="route" key={loc.pathname}><Outlet /></div>
        </div>
        <JobPanel />
        <Toast />
      </div>
    </UserDataProvider>
  )
}
