import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { CONFIGURED } from './lib/backend.js'
import { useSession } from './lib/session.jsx'
import AuthPage, { ResetPassword, SetupNeeded } from './pages/AuthPage.jsx'
import Landing from './pages/Landing.jsx'
import Onboarding from './pages/Onboarding.jsx'
import { Spinner } from './ui.jsx'

const DashboardLayout = lazy(() => import('./pages/DashboardLayout.jsx'))
const Overview = lazy(() => import('./pages/Overview.jsx'))
const Copilot = lazy(() => import('./pages/Copilot.jsx'))
const Explore = lazy(() => import('./pages/Explore.jsx'))
const Applications = lazy(() => import('./pages/Applications.jsx'))
const Saved = lazy(() => import('./pages/Saved.jsx'))
const Resume = lazy(() => import('./pages/Resume.jsx'))
const Portfolio = lazy(() => import('./pages/Portfolio.jsx'))
const Profile = lazy(() => import('./pages/Profile.jsx'))
const Autofill = lazy(() => import('./pages/Autofill.jsx'))

const Loading = () => <div className="full-load"><Spinner /></div>

// signed in + profile loaded; optionally require onboarding to be finished
function Guard({ children, onboarded }) {
  const { loading, user, profile } = useSession()
  if (!CONFIGURED) return <SetupNeeded />
  const loc = useLocation()
  if (loading || (user && !profile)) return <Loading />
  if (!user) return <Navigate to="/login" replace state={{ from: loc.pathname }} />
  if (onboarded && !profile.onboarded) return <Navigate to="/onboarding" replace />
  return children
}

// The login page stays reachable when signed in: it offers to continue or switch account.
function GuestOnly({ children }) {
  const { loading, user, profile } = useSession()
  if (!CONFIGURED) return <SetupNeeded />
  if (loading || (user && !profile)) return <Loading />
  return children
}

export default function App() {
  return (
    <Suspense fallback={<Loading />}>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/login" element={<GuestOnly><AuthPage mode="login" /></GuestOnly>} />
        <Route path="/signup" element={<GuestOnly><AuthPage mode="signup" /></GuestOnly>} />
        <Route path="/reset-password" element={CONFIGURED ? <ResetPassword /> : <SetupNeeded />} />
        <Route path="/onboarding" element={<Guard><Onboarding /></Guard>} />
        <Route path="/app" element={<Guard onboarded><DashboardLayout /></Guard>}>
          <Route index element={<Overview />} />
          <Route path="copilot" element={<Copilot />} />
          <Route path="explore" element={<Explore />} />
          <Route path="applications" element={<Applications />} />
          <Route path="saved" element={<Saved />} />
          <Route path="resume" element={<Resume />} />
          <Route path="portfolio" element={<Portfolio />} />
          <Route path="profile" element={<Profile />} />
          <Route path="autofill" element={<Autofill />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  )
}
