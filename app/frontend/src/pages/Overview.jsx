import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { searchJobs } from '../lib/api.js'
import { useSession } from '../lib/session.jsx'
import { useUserData } from '../lib/userdata.jsx'
import { Results } from '../components.jsx'
import { Icon, Spinner } from '../ui.jsx'

const STATUSES = ['Applied', 'Interviewing', 'Offer', 'Rejected']

function greeting() {
  const h = new Date().getHours()
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'
}

export default function Overview() {
  const { profile } = useSession()
  const data = useUserData()
  const nav = useNavigate()
  const [top, setTop] = useState(null)
  const [fresh, setFresh] = useState(null)
  const [err, setErr] = useState('')
  const [q, setQ] = useState('')

  useEffect(() => {
    if (!profile) return
    searchJobs({ fit_only: true, sort: 'fit', limit: 8 }, profile).then(setTop).catch((e) => setErr(e.message))
    searchJobs({ fit_only: true, posted_within_days: 7, sort: 'newest', limit: 1 }, profile).then(setFresh).catch(() => {})
  }, [profile])

  const first = (profile?.full_name || '').split(' ')[0]
  const byStatus = Object.fromEntries(STATUSES.map((s) => [s, data.apps.filter((a) => a.status === s).length]))
  const checks = [
    { ok: Boolean(profile?.resume_path), text: 'Upload your resume', to: '/app/resume' },
    { ok: (profile?.skills || []).length >= 5, text: 'Add at least 5 skills', to: '/app/profile' },
    { ok: Boolean(profile?.remote_from || profile?.onsite_from), text: 'Set when you’re available', to: '/app/profile' },
    { ok: Boolean(profile?.linkedin || profile?.github), text: 'Add LinkedIn or GitHub', to: '/app/portfolio' },
  ]
  const strength = Math.round((checks.filter((c) => c.ok).length / checks.length) * 100)

  return (
    <main className="page">
      <header className="page-head">
        <div>
          <h1>{greeting()}{first ? `, ${first}` : ''}</h1>
          <p className="sub">Here&rsquo;s what fits you right now.</p>
        </div>
      </header>

      <section className="tiles" aria-label="Your numbers">
        <div className="tile"><strong>{top ? top.total.toLocaleString('en-IN') : '—'}</strong><span>strong matches</span></div>
        <div className="tile"><strong>{fresh ? fresh.total : '—'}</strong><span>new this week</span></div>
        <Link to="/app/applications" className="tile"><strong>{data.apps.length}</strong><span>applications</span></Link>
        <Link to="/app/applications" className="tile"><strong>{byStatus.Interviewing}</strong><span>interviewing</span></Link>
      </section>

      <form className="quick-ask" onSubmit={(e) => { e.preventDefault(); if (q.trim()) nav(`/app/copilot?q=${encodeURIComponent(q.trim())}`) }}>
        <Icon name="copilot" />
        <label htmlFor="qa" className="sr">Ask the AI Copilot</label>
        <input id="qa" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ask anything, e.g. “paid ML internships in Bangalore”" />
        <button type="submit" className="btn btn-primary btn-sm" disabled={!q.trim()}>Ask</button>
      </form>

      <div className="ov-grid">
        <section className="panel ov-matches" aria-labelledby="tm-h">
          <div className="panel-head">
            <h2 id="tm-h">Top matches for you</h2>
            <Link to="/app/explore" className="link">Explore all</Link>
          </div>
          {err && <p className="form-error">{err}</p>}
          {!top && !err && <div className="loading"><Spinner /></div>}
          {top && <Results data={top} limit={8} actions={data}
            empty="No strong matches yet. Try adding more locations or roles in your profile." />}
        </section>

        <div className="ov-side">
          <section className="panel" aria-labelledby="pl-h">
            <div className="panel-head"><h2 id="pl-h">Your pipeline</h2><Link to="/app/applications" className="link">Open</Link></div>
            {data.apps.length === 0 ? <p className="quiet small">Click Apply on any role and it shows up here.</p> : (
              <ul className="pipe">
                {STATUSES.map((s) => (
                  <li key={s}><i className={`dot-${s.toLowerCase()}`} />{s}<strong>{byStatus[s]}</strong></li>
                ))}
              </ul>
            )}
          </section>

          <section className="panel" aria-labelledby="ps-h">
            <div className="panel-head"><h2 id="ps-h">Profile strength</h2><span className="pct">{strength}%</span></div>
            <div className="meter" aria-hidden="true"><span style={{ width: `${strength}%` }} /></div>
            <ul className="checks">
              {checks.map((c) => (
                <li key={c.text} className={c.ok ? 'ok' : ''}>
                  <span className="check-dot">{c.ok && <Icon name="check" size={12} />}</span>
                  {c.ok ? c.text : <Link to={c.to}>{c.text}</Link>}
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>
    </main>
  )
}
