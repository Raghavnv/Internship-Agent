import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { auth, getProfile } from '../lib/backend.js'
import { useSession } from '../lib/session.jsx'
import { Logo } from '../ui.jsx'
import { getMap, getMeta } from '../lib/api.js'
import Globe from '../Globe.jsx'

function Shell({ children }) {
  return (
    <main className="auth">
      <div className="auth-main">
        <Link to="/" className="wordmark"><Logo />Internship Copilot</Link>
        {children}
      </div>
      <Side />
    </main>
  )
}

// Shown when the site was built without the Supabase settings, instead of a fake login.
export function SetupNeeded() {
  return (
    <Shell>
      <div className="auth-card">
        <h1>Sign-in isn’t connected yet</h1>
        <p className="sub">This site was deployed without its account settings, so nobody can sign in or sign up.</p>
        <p className="setup-help">If you run this site, add these two environment variables in Vercel, then redeploy without the build cache:</p>
        <ul className="setup-list"><li><code>VITE_SUPABASE_URL</code></li><li><code>VITE_SUPABASE_ANON_KEY</code></li></ul>
        <Link to="/" className="btn btn-ghost btn-block">Back to the home page</Link>
      </div>
    </Shell>
  )
}

// Where the "reset your password" email lands. Supabase signs the person in from the link.
export function ResetPassword() {
  const { user, loading } = useSession()
  const nav = useNavigate()
  const [pw, setPw] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function submit(e) {
    e.preventDefault()
    if (pw.length < 8) { setError('Use at least 8 characters for your password.'); return }
    setBusy(true); setError('')
    try { await auth.updatePassword(pw); nav('/app', { replace: true }) } catch (err) { setError(err.message) } finally { setBusy(false) }
  }
  return (
    <Shell>
      <div className="auth-card">
        {loading ? null : user ? (
          <>
            <h1>Choose a new password</h1>
            <p className="sub">For {user.email}.</p>
            <form onSubmit={submit} className="auth-form">
              <label>New password
                <input type="password" value={pw} onChange={(e) => setPw(e.target.value)} required minLength={8} autoComplete="new-password" />
              </label>
              {error && <p className="form-error" role="alert">{error}</p>}
              <button type="submit" className="btn btn-primary btn-block" disabled={busy}>{busy ? 'Saving…' : 'Save password'}</button>
            </form>
          </>
        ) : (
          <>
            <h1>This link has expired</h1>
            <p className="sub">Reset links work once and only for a short time. Ask for a new one from the login page.</p>
            <Link to="/login" className="btn btn-primary btn-block">Go to log in</Link>
          </>
        )}
      </div>
    </Shell>
  )
}

// Right half: the globe, flying routes from Bengaluru to the newest real postings.
function Side() {
  const [meta, setMeta] = useState(null)
  const [cities, setCities] = useState([])
  const [k, setK] = useState(0)
  useEffect(() => {
    getMeta().then(setMeta).catch(() => {})
    getMap().then((m) => setCities(m.cities)).catch(() => {})
  }, [])
  const recent = meta?.recent || []
  useEffect(() => {
    if (!recent.length) return
    const id = setInterval(() => setK((v) => (v + 1) % recent.length), 2600)
    return () => clearInterval(id)
  }, [recent.length])
  const routes = useMemo(() => recent.map((r) => ({ lat: r.lat, lng: r.lng, key: r.company, label: r.city })), [recent])
  const now = recent[k]
  return (
    <aside className="auth-side" aria-hidden="true">
      <Globe home={{ lat: 12.972, lng: 77.594 }} routes={routes} cities={cities} perRound={4} className="auth-globe" />
      <div className="auth-side-copy">
        <h2>Your next internship is already posted somewhere.</h2>
        <p>{meta ? `${meta.count.toLocaleString('en-IN')} live listings, each scored against your profile.` : 'Every live listing, scored against your profile.'}</p>
        {now && (
          <div className="auth-feed" key={now.company}>
            <span className="af-cap"><i />Just posted</span>
            <strong>{now.title}</strong>
            <span>{now.company} · {now.city}</span>
          </div>
        )}
      </div>
    </aside>
  )
}

function Signed({ user, profile }) {
  const nav = useNavigate()
  const [busy, setBusy] = useState(false)
  const name = profile?.full_name || user.email
  return (
    <div className="auth-card">
      <h1>You’re already signed in</h1>
      <p className="sub">Signed in as <strong>{name}</strong>{profile?.full_name && user.email ? ` (${user.email})` : ''}.</p>
      <div className="auth-stack">
        <button type="button" className="btn btn-primary btn-block" onClick={() => nav(profile?.onboarded ? '/app' : '/onboarding')}>
          Continue to your dashboard
        </button>
        <button type="button" className="btn btn-ghost btn-block" disabled={busy}
          onClick={async () => { setBusy(true); await auth.signOut(); setBusy(false) }}>
          Sign out and use another account
        </button>
      </div>
    </div>
  )
}

export default function AuthPage({ mode }) {
  const signup = mode === 'signup'
  const nav = useNavigate()
  const { user, profile } = useSession()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')

  async function afterLogin(session) {
    const p = await getProfile(session.user.id)
    nav(p?.onboarded ? '/app' : '/onboarding', { replace: true })
  }

  async function submit(e) {
    e.preventDefault()
    setError(''); setInfo(''); setBusy(true)
    try {
      if (signup) {
        if (password.length < 8) throw new Error('Use at least 8 characters for your password.')
        const r = await auth.signUp(email.trim(), password, name.trim())
        if (r.needsConfirm) { setInfo(`We sent a confirmation link to ${email}. Open it to finish creating your account.`); return }
        await afterLogin(r.session)
      } else {
        const r = await auth.signIn(email.trim(), password)
        await afterLogin(r.session)
      }
    } catch (err) {
      const m = err.message || ''
      setError(/invalid login/i.test(m) ? 'That email and password don’t match. Check them and try again.'
        : /not confirmed/i.test(m) ? 'Confirm your email first: open the link we sent you, then log in.'
        : /rate limit|too many/i.test(m) ? 'Too many attempts. Wait a minute and try again.'
        : /already registered/i.test(m) ? 'There’s already an account with that email. Log in instead.' : m)
    } finally {
      setBusy(false)
    }
  }

  async function forgot() {
    if (!email) { setError('Enter your email above first, then click “Forgot password”.'); return }
    try { await auth.resetPassword(email.trim()); setInfo(`If ${email} has an account, a reset link is on its way.`) } catch (err) { setError(err.message) }
  }

  return (
    <Shell>
        {user ? <Signed user={user} profile={profile} /> : (
          <div className="auth-card">
            <h1>{signup ? 'Create your account' : 'Log in'}</h1>
            <p className="sub">{signup ? 'Free. Takes about two minutes to set up.' : 'Pick up where you left off.'}</p>

            <form onSubmit={submit} className="auth-form">
              {signup && (
                <label>Full name
                  <input value={name} onChange={(e) => setName(e.target.value)} required autoComplete="name" />
                </label>
              )}
              <label>Email
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
              </label>
              <label>
                <span className="label-row">Password
                  {!signup && <button type="button" className="link-btn" onClick={forgot}>Forgot password?</button>}
                </span>
                <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required
                  minLength={signup ? 8 : undefined} autoComplete={signup ? 'new-password' : 'current-password'} />
              </label>
              {error && <p className="form-error" role="alert">{error}</p>}
              {info && <p className="form-info" role="status">{info}</p>}
              <button type="submit" className="btn btn-primary btn-block" disabled={busy}>
                {busy ? 'Please wait…' : signup ? 'Create account' : 'Log in'}
              </button>
            </form>
            <p className="switch">
              {signup ? <>Already have an account? <Link to="/login">Log in</Link></> : <>New here? <Link to="/signup">Create an account</Link></>}
            </p>
          </div>
        )}
    </Shell>
  )
}
