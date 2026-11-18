import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { auth, DEMO, getProfile } from '../lib/backend.js'
import { Icon, Logo } from '../ui.jsx'

export default function AuthPage({ mode }) {
  const signup = mode === 'signup'
  const nav = useNavigate()
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
        : /already registered/i.test(m) ? 'There’s already an account with that email. Log in instead.' : m)
    } finally {
      setBusy(false)
    }
  }

  async function google() {
    setError('')
    try {
      const r = await auth.google()
      if (DEMO && r?.session) await afterLogin(r.session)
    } catch (err) { setError(err.message) }
  }

  async function forgot() {
    if (!email) { setError('Enter your email above first, then click "Forgot password".'); return }
    try { await auth.resetPassword(email.trim()); setInfo(`If ${email} has an account, a reset link is on its way.`) } catch (err) { setError(err.message) }
  }

  return (
    <main className="auth">
      <div className="auth-side" aria-hidden="true">
        <div className="auth-quote">
          <svg viewBox="0 0 240 120" className="auth-art">
            <path d="M24 96 Q120 -10 216 96" className="arc" />
            <circle cx="24" cy="96" r="7" className="home" />
            <circle cx="216" cy="96" r="7" className="dest" />
          </svg>
          <p>From your city to your next internship, with every listing scored for you.</p>
        </div>
      </div>
      <div className="auth-main">
        <Link to="/" className="wordmark"><Logo />Internship Copilot</Link>
        <div className="auth-card">
          <h1>{signup ? 'Create your account' : 'Welcome back'}</h1>
          <p className="sub">{signup ? 'Free, and set up in two minutes.' : 'Log in to see your matches and applications.'}</p>
          {DEMO && <p className="demo-note">Demo mode: accounts are stored in this browser until Supabase is connected.</p>}

          <button type="button" className="btn btn-google" onClick={google}><Icon name="google" />Continue with Google</button>
          <div className="or"><span>or</span></div>

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
      </div>
    </main>
  )
}
