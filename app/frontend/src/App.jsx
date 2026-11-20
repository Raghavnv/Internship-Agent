import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { CONFIGURED } from './lib/backend.js'
import { useSession, isOnboarded, finishedSetup } from './lib/session.jsx'
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
const Openings = lazy(() => import('./pages/Openings.jsx'))
const Search = lazy(() => import('./pages/Search.jsx'))

const Loading = () => <div className="full-load"><Spinner /></div>

// signed in + profile loaded; optionally require onboarding to be finished
function Guard({ children, onboarded, setup }) {
  const { loading, user, profile, loadFailed, retryProfile } = useSession()
  const loc = useLocation()
  if (!CONFIGURED) return <SetupNeeded />
  if (user && !profile && loadFailed) return <ProfileError retry={retryProfile} />
  if (loading || (user && !profile)) return <Loading />
  if (!user) return <Navigate to="/login" replace state={{ from: loc.pathname }} />
  const done = isOnboarded(profile)
  if (onboarded && !done) return <Navigate to="/onboarding" replace />
  // setup questions are only for new accounts; anyone who's finished goes straight in
  // (Profile is where answers are changed later)
  // (only an explicit "finished" counts here, so saving a step mid-setup doesn't cut the questions short)
  if (setup && finishedSetup(profile) && !new URLSearchParams(loc.search).has('redo')) return <Navigate to="/app" replace />
  return children
}

const ProfileError = ({ retry }) => (
  <div className="full-load">
    <div className="empty-state">
      <h2>Couldn’t load your profile</h2>
      <p>The server didn’t answer. Your answers are safe; try again in a moment.</p>
      <button type="button" className="btn btn-primary" onClick={retry}>Try again</button>
    </div>
  </div>
)

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
        <Route path="/onboarding" element={<Guard setup><Onboarding /></Guard>} />
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
          <Route path="openings" element={<Openings />} />
          <Route path="search" element={<Search />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  )
}
