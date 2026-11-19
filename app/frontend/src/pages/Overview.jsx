import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { getInsights, searchJobs } from '../lib/api.js'
import { useSession } from '../lib/session.jsx'
import { useUserData } from '../lib/userdata.jsx'
import { Results } from '../components.jsx'
import { CountUp, DayArea, FitSpread, RankBars, SkeletonRows } from '../charts.jsx'
import { Icon } from '../ui.jsx'
import { STATUSES, statusKey } from '../lib/options.js'
import { upcoming } from '../lib/calendar.js'


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
  const [mk, setMk] = useState(null)
  const [err, setErr] = useState('')
  const [q, setQ] = useState('')

  useEffect(() => {
    if (!profile) return
    searchJobs({ fit_only: true, sort: 'fit', limit: 10 }, profile).then(setTop).catch((e) => setErr(e.message))
    searchJobs({ fit_only: true, posted_within_days: 7, sort: 'newest', limit: 1 }, profile).then(setFresh).catch(() => {})
    getInsights({}, profile).then(setMk).catch(() => {})
  }, [profile])

  const first = (profile?.full_name || '').split(' ')[0]
  const byStatus = Object.fromEntries(STATUSES.map((s) => [s, data.apps.filter((a) => a.status === s).length]))
  const checks = [
    { ok: Boolean(profile?.resume_path), text: 'Upload your resume', to: '/app/resume' },
    { ok: (profile?.skills || []).length >= 5, text: 'Add at least five skills', to: '/app/profile' },
    { ok: Boolean(profile?.remote_from || profile?.onsite_from), text: 'Say when you’re available', to: '/app/profile' },
    { ok: Boolean(profile?.linkedin || profile?.github), text: 'Add LinkedIn or GitHub', to: '/app/profile' },
  ]
  const todo = checks.filter((c) => !c.ok)
  const soon = upcoming(data.apps)

  return (
    <main className="page">
      <header className="page-head">
        <div>
          <h1>{greeting()}{first ? `, ${first}` : ''}</h1>
          <p className="sub">
            {top ? <><strong><CountUp value={top.total} /></strong> {top.total === 1 ? 'role fits' : 'roles fit'} your profile right now
              {fresh?.total ? <>, and <strong><CountUp value={fresh.total} /></strong> of them were posted this week.</> : '.'}</> : 'Finding roles that fit you…'}
          </p>
        </div>
      </header>

      <form className="quick-ask" onSubmit={(e) => { e.preventDefault(); if (q.trim()) nav(`/app/copilot?q=${encodeURIComponent(q.trim())}`) }}>
        <Icon name="copilot" size={16} />
        <label htmlFor="qa" className="sr">Ask the AI Copilot</label>
        <input id="qa" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ask the Copilot, e.g. paid ML internships in Bangalore" />
        {q.trim() && <button type="submit" className="btn btn-primary btn-sm">Ask</button>}
      </form>

      {mk && mk.total > 0 && (
        <section className="market" aria-labelledby="mk-h">
          <h2 id="mk-h" className="sr">Your market</h2>
          <div className="mk-card mk-wide">
            <div className="mk-head"><h3>New roles that fit you</h3><span>last 30 days</span></div>
            <DayArea data={mk.by_day} start={mk.start} />
          </div>
          <div className="mk-card">
            <div className="mk-head"><h3>Fit spread</h3><span>score /100</span></div>
            <FitSpread bins={mk.fit_bins} />
          </div>
          <div className="mk-card">
            <div className="mk-head"><h3>Hiring most</h3><span>roles that fit</span></div>
            <RankBars items={mk.companies.slice(0, 5)} onPick={(c) => nav(`/app/explore?q=${encodeURIComponent(c)}`)} />
          </div>
        </section>
      )}

      <div className="ov-grid">
        <section className="ov-matches" aria-labelledby="tm-h">
          <div className="sec-head">
            <h2 id="tm-h">Best matches</h2>
            <Link to="/app/explore" className="link">See all listings</Link>
          </div>
          {err && <p className="form-error">{err}</p>}
          {!top && !err && <SkeletonRows n={6} />}
          {top && <Results data={top} limit={10} showChips={false}
            empty="No strong matches yet. Try adding more locations or roles to your profile." />}
        </section>

        <aside className="ov-side">
          <section className="side-card" aria-labelledby="pl-h">
            <div className="sec-head"><h2 id="pl-h">Applications</h2><Link to="/app/applications" className="link">Open</Link></div>
            {data.apps.length === 0 ? <p className="quiet small">Nothing yet. Roles you apply to are tracked here.</p> : (
              <ul className="pipe">
                {STATUSES.map((s) => (
                  <li key={s}><i className={`dot-${statusKey(s)}`} aria-hidden="true" />{s}<strong>{byStatus[s]}</strong></li>
                ))}
              </ul>
            )}
          </section>

          {soon.length > 0 && (
            <section className="side-card" aria-labelledby="up-h">
              <div className="sec-head"><h2 id="up-h">Coming up</h2><Link to="/app/applications" className="link">Board</Link></div>
              <ul className="mini-list">
                {soon.slice(0, 4).map((x) => (
                  <li key={x.kind + x.app.id}>
                    <button type="button" onClick={() => nav('/app/applications')}>
                      <strong>{x.kind === 'interview' ? 'Interview' : 'Follow up'}: {x.app.company}</strong>
                      <span className={x.kind === 'follow' && x.at < Date.now() ? 'late' : ''}>
                        {x.kind === 'interview'
                          ? new Date(x.at).toLocaleString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })
                          : x.at < Date.now() ? `Overdue since ${new Date(x.at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}` : `Due ${new Date(x.at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}`}
                        {' · '}{x.app.title}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {data.saved.length > 0 && (
            <section className="side-card" aria-labelledby="sv-h">
              <div className="sec-head"><h2 id="sv-h">Saved</h2><Link to="/app/saved" className="link">All {data.saved.length}</Link></div>
              <ul className="mini-list">
                {data.saved.slice(0, 4).map((s) => (
                  <li key={s.job_id}>
                    <button type="button" onClick={() => data.openJob({ locations: [], terms: [], ...s.job })}>
                      <strong>{s.job?.title}</strong><span>{s.job?.company}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {todo.length > 0 && (
            <section className="side-card" aria-labelledby="ps-h">
              <div className="sec-head"><h2 id="ps-h">Sharpen your matches</h2><span className="quiet small">{checks.length - todo.length} of {checks.length}</span></div>
              <ul className="checks">
                {todo.map((c) => <li key={c.text}><span className="check-dot" aria-hidden="true" /><Link to={c.to}>{c.text}</Link></li>)}
              </ul>
            </section>
          )}
        </aside>
      </div>
    </main>
  )
}
