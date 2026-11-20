import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { geocode, getInsights, getOpenings, searchJobs } from '../lib/api.js'
import Globe from '../Globe.jsx'
import { useSession } from '../lib/session.jsx'
import { useUserData } from '../lib/userdata.jsx'
import { Results } from '../components.jsx'
import RefreshBar from '../RefreshBar.jsx'
import { CountUp, DayArea, FitSpread, RankBars, SkeletonRows } from '../charts.jsx'
import { Icon } from '../ui.jsx'
import { STATUSES, statusKey } from '../lib/options.js'
import { upcoming } from '../lib/calendar.js'
import { closesIn, closesLabel, closesLevel } from '../lib/deadline.js'


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
  const [ops, setOps] = useState(null)
  const [closing, setClosing] = useState(null)
  const [err, setErr] = useState('')
  const [q, setQ] = useState('')
  const [mode, setMode] = useState('search')
  const [home, setHome] = useState({ lat: 12.972, lng: 77.594 })
  const [nonce, setNonce] = useState(0)

  useEffect(() => {
    if (!profile) return
    searchJobs({ fit_only: true, sort: 'fit', limit: 10 }, profile).then(setTop).catch((e) => setErr(e.message))
    searchJobs({ fit_only: true, posted_within_days: 7, sort: 'newest', limit: 1 }, profile).then(setFresh).catch(() => {})
    getInsights({}, profile).then(setMk).catch(() => {})
    getOpenings(profile.watch_companies || []).then(setOps).catch(() => {})
    searchJobs({ fit_only: true, closing_within_days: 14, sort: 'closing', limit: 4 }, profile).then(setClosing).catch(() => {})
  }, [profile, nonce])

  useEffect(() => {
    if (profile?.based_in) geocode(profile.based_in).then((g) => setHome({ lat: g.lat, lng: g.lng })).catch(() => {})
  }, [profile?.based_in])
  const routes = useMemo(() => (top?.results || []).filter((j) => j.pins?.length).slice(0, 8)
    .map((j) => ({ lat: j.pins[0][0], lng: j.pins[0][1], key: j.id, label: j.company })), [top])

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
      <section className="ov-hero" aria-labelledby="ov-h">
        <div className="ov-hero-copy">
          <div className="ov-hero-top">
            <h1 id="ov-h">{greeting()}{first ? `, ${first}` : ''}</h1>
            <RefreshBar onReload={() => setNonce((n) => n + 1)} />
          </div>
          <p className="sub">{top ? 'Here’s where your search stands today.' : 'Finding roles that fit you…'}</p>
          <dl className="ov-stats">
            <div><dt>Fit your profile</dt><dd><CountUp value={top?.total || 0} /></dd></div>
            <div><dt>New this week</dt><dd className="hl"><CountUp value={fresh?.total || 0} /></dd></div>
            <div><dt>Applied</dt><dd><CountUp value={data.apps.length} /></dd></div>
            <div><dt>Interviewing</dt><dd><CountUp value={byStatus.Interviewing || 0} /></dd></div>
          </dl>
          <form className={`cmd cmd-${mode}`} onSubmit={(e) => {
            e.preventDefault(); const t = q.trim(); if (!t) return
            nav(mode === 'search' ? `/app/search?q=${encodeURIComponent(t)}` : `/app/copilot?q=${encodeURIComponent(t)}`)
          }}>
            <div className="cmd-tabs" role="tablist" aria-label="Search or ask">
              <button type="button" role="tab" aria-selected={mode === 'search'} className={mode === 'search' ? 'on' : ''} onClick={() => setMode('search')}><Icon name="search" size={14} />Search roles</button>
              <button type="button" role="tab" aria-selected={mode === 'ask'} className={mode === 'ask' ? 'on' : ''} onClick={() => setMode('ask')}><Icon name="copilot" size={14} />Ask the Copilot</button>
            </div>
            <div className="cmd-field">
              <label htmlFor="qa" className="sr">{mode === 'search' ? 'Search roles, skills or companies' : 'Ask the AI Copilot'}</label>
              <input id="qa" value={q} onChange={(e) => setQ(e.target.value)} autoComplete="off"
                placeholder={mode === 'search' ? 'A role, skill or company: SDE, React, Stripe, ML Bangalore' : 'Paid ML internships in Bangalore starting June'} />
              <button type="submit" className="btn btn-primary" disabled={!q.trim()}>{mode === 'search' ? 'Search' : 'Ask'}</button>
            </div>
          </form>
        </div>
        <div className="ov-hero-globe">
          <Globe home={home} routes={routes} perRound={4} spin label="Routes from your city to your best matches" />
          <span className="ov-globe-cap"><i className="h" />You<i className="d" />Your best matches</span>
        </div>
      </section>

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

          {closing?.results?.length > 0 && (
            <section className="side-card" aria-labelledby="cl-h">
              <div className="sec-head"><h2 id="cl-h">Closing soon</h2><span className="quiet small">next 2 weeks</span></div>
              <ul className="mini-list">
                {closing.results.map((j) => {
                  const d = closesIn(j)
                  return (
                    <li key={j.id}><button type="button" onClick={() => data.openJob?.(j)}>
                      <strong>{j.company}</strong>
                      <span className={closesLevel(d) === 'urgent' ? 'late' : ''}>{closesLabel(d)} · {j.title}</span></button></li>
                  )
                })}
              </ul>
            </section>
          )}

          {ops && (ops.soon.length > 0 || ops.watching.some((o) => o.status === 'open')) && (
            <section className="side-card" aria-labelledby="os-h">
              <div className="sec-head"><h2 id="os-h">Opening soon</h2><Link to="/app/openings" className="link">All</Link></div>
              <ul className="mini-list">
                {ops.watching.filter((o) => o.status === 'open' && o.open_roles > 0).slice(0, 2).map((o) => (
                  <li key={'w' + o.company}><button type="button" onClick={() => nav(`/app/explore?q=${encodeURIComponent(o.company)}`)}>
                    <strong>{o.company} is open</strong><span className="ok-t">{o.open_roles} role{o.open_roles === 1 ? '' : 's'} · you’re watching it</span></button></li>
                ))}
                {ops.soon.filter((o) => o.days_until >= 0).slice(0, 3).map((o) => (
                  <li key={o.company}><button type="button" onClick={() => nav('/app/openings')}>
                    <strong>{o.company}</strong><span>Usually opens {new Date(o.expected_on).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}{o.days_until === 0 ? ', today' : `, in ${o.days_until}d`}</span></button></li>
                ))}
              </ul>
            </section>
          )}

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
