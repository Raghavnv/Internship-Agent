import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useUserData } from '../lib/userdata.jsx'
import { ROLE_WORDS } from '../lib/filters.js'
import { getInsights, searchJobs } from '../lib/api.js'
import { toPins, useLocationSuggestions, useMapData } from '../lib/mapdata.js'
import { useSession } from '../lib/session.jsx'
import { JobRow } from '../components.jsx'
import { CountUp, ModeSplit, RankBars, SkeletonRows } from '../charts.jsx'
import WorldMap from '../WorldMap.jsx'
import RefreshBar from '../RefreshBar.jsx'
import { ChipInput, Icon, Spinner } from '../ui.jsx'

const POSTED = [[0, 'Any time'], [3, 'Last 3 days'], [7, 'Last week'], [30, 'Last month']]
const WORK = [['any', 'Any'], ['only', 'Remote'], ['exclude', 'In person']]

const VIEWS = [['all', 'All listings'], ['new', 'New']]
const PAGE = 25
const NEW_HOURS = 48

// "Today", "Yesterday", "Tue 18 Nov" for grouping the New and WhatsApp views
function dayLabel(ts) {
  const d = new Date(ts * 1000); d.setHours(0, 0, 0, 0)
  const t = new Date(); t.setHours(0, 0, 0, 0)
  const diff = Math.round((t - d) / 86400000)
  return diff === 0 ? 'Today' : diff === 1 ? 'Yesterday' : d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })
}

function ByDay({ results, field, onFocus, empty }) {
  if (!results.length) return <div className="empty-state"><p>{empty}</p></div>
  const groups = []
  for (const j of results) {
    const label = dayLabel(j[field] || j.first_seen || 0)
    if (!groups.length || groups[groups.length - 1].label !== label) groups.push({ label, rows: [] })
    groups[groups.length - 1].rows.push(j)
  }
  let n = 0
  return groups.map((g) => (
    <section key={g.label} className="day-group" aria-label={g.label}>
      <h2 className="day-head">{g.label}<span>{g.rows.length}</span></h2>
      <ul className="jobs">{g.rows.map((j) => <JobRow key={j.id} job={j} onFocus={onFocus} index={n++} />)}</ul>
    </section>
  ))
}

const TIER_HEADS = [
  [80, 'Strong fits', 'Match most of what you asked for'],
  [60, 'Good fits', 'Worth a closer look'],
  [-1, 'Other matches', 'Fit some of your filters'],
]

function Grouped({ results, byFit, onFocus }) {
  if (!results.length) return <p className="quiet pad">Nothing matches all of that. Remove a filter or two.</p>
  if (!byFit) return <ul className="jobs">{results.map((j, i) => <JobRow key={j.id} job={j} onFocus={onFocus} index={i} />)}</ul>
  let n = 0
  return TIER_HEADS.map(([min, title, sub], t) => {
    const max = t ? TIER_HEADS[t - 1][0] : 101
    const rows = results.filter((j) => (j.fit ?? 0) >= min && (j.fit ?? 0) < max)
    if (!rows.length) return null
    return (
      <section key={title} className={`tier tier-${t}`} aria-label={title}>
        <header className="tier-head"><i aria-hidden="true" /><h2>{title}</h2><span>{rows.length} shown · {sub}</span></header>
        <ul className="jobs">{rows.map((j) => <JobRow key={j.id} job={j} onFocus={onFocus} index={n++} />)}</ul>
      </section>
    )
  })
}

export default function Explore() {
  const { profile, home } = useSession()
  const data = useUserData()
  const [params, setParams] = useSearchParams()
  const view = VIEWS.some(([v]) => v === params.get('view')) ? params.get('view') : 'all'
  const setView = (v) => { const p = new URLSearchParams(params); v === 'all' ? p.delete('view') : p.set('view', v); setParams(p, { replace: true }) }
  const applied = (data?.apps || []).map((a) => a.job_id).filter(Boolean)
  const appliedKey = applied.join(',')
  const [counts, setCounts] = useState({})
  const [more, setMore] = useState(false)
  const map = useMapData()
  const locSuggest = useLocationSuggestions()
  const [focus, setFocus] = useState(null)
  const [mk, setMk] = useState(null)
  const [locations, setLocations] = useState(null)
  const [roles, setRoles] = useState(null)
  const [keyword, setKeyword] = useState(params.get('q') || '')
  const [company, setCompany] = useState(params.get('company') || '')   // exactly one company, from Just opened
  const [remote, setRemote] = useState('any')
  const [posted, setPosted] = useState(0)
  const [fitOnly, setFitOnly] = useState(false)
  const [hideStale, setHideStale] = useState(true)
  const [sort, setSort] = useState('fit')
  const [res, setRes] = useState(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [showFilters, setShowFilters] = useState(false)

  // Start with nothing filtered out: every listing shows, ranked by how well it fits the profile
  // (cities and roles already count toward fit). The profile's cities and roles are one click away.
  useEffect(() => {
    if (profile && locations === null) { setLocations([]); setRoles([]) }
  }, [profile])
  // arriving from a link like ?q=Honeywell: show that company's roles, whatever the other filters were
  useEffect(() => {
    const q = params.get('q'), co = params.get('company')
    if (q != null || co != null) {
      setKeyword(q || ''); setCompany(co || ''); setLocations([]); setRoles([]); setRemote('any'); setPosted(0); setFitOnly(false)
    }
  }, [params.get('q'), params.get('company')])

  useEffect(() => {
    if (locations === null) return
    const t = setTimeout(run, 250)
    return () => clearTimeout(t)
  }, [locations, roles, keyword, company, remote, posted, fitOnly, hideStale, sort, view, appliedKey])

  function filters(v = view) {
    const any = (roles || []).flatMap((r) => ROLE_WORDS[r] || [])
    const f = {
      any_keywords: any.length ? any : undefined, keywords: keyword.trim() ? [keyword.trim()] : undefined,
      locations: locations?.length ? locations : undefined, remote: remote === 'any' ? undefined : remote,
      fit_only: fitOnly || undefined, hide_stale: hideStale || undefined,
      exclude_ids: applied.length ? applied : undefined,
      company_is: company ? [company] : undefined,     // every role of that company, none merged or hidden
    }
    // New: the same filters, limited to what appeared in the last 2 days, newest first
    if (v === 'new') return { ...f, new_within_hours: NEW_HOURS, sort: 'found' }
    return { ...f, posted_within_days: posted || undefined, sort }
  }

  async function run() {
    setBusy(true); setErr('')
    const f = filters()
    try {
      const [r, m, n] = await Promise.all([
        searchJobs({ ...f, limit: PAGE }, profile),
        getInsights({ ...f, sort: undefined }, profile).catch(() => null),
        view === 'new' ? null : searchJobs({ ...filters('new'), limit: 1 }, profile).catch(() => null),
      ])
      setRes(r); setMk(m); setCounts({ new: view === 'new' ? r.total : n?.total })
    } catch (e) { setErr(e.message) } finally { setBusy(false) }
  }

  async function loadMore() {
    setMore(true)
    try {
      const r = await searchJobs({ ...filters(), limit: 50, offset: res.results.length }, profile)
      setRes((x) => ({ ...x, results: [...x.results, ...r.results] }))
    } catch (e) { setErr(e.message) } finally { setMore(false) }
  }

  const useProfile = () => {
    setLocations((profile?.locations || []).filter((l) => !/^remote$/i.test(l))); setRoles(profile?.roles || [])
  }
  const clearCompany = () => {
    setCompany('')
    if (params.get('company') != null) { const p = new URLSearchParams(params); p.delete('company'); setParams(p, { replace: true }) }
  }
  const reset = () => {
    clearCompany(); setLocations([]); setRoles([]); setKeyword(''); setRemote('any'); setPosted(0); setFitOnly(false)
  }
  const nFilters = (company ? 1 : 0) + (locations?.length ? 1 : 0) + (roles?.length ? 1 : 0) + (remote !== 'any') + (posted ? 1 : 0)

  return (
    <main className="page page-wide">
      <header className="page-head">
        <div>
          <h1>Job listings</h1>
          <p className="sub">Every live internship, ranked by how well it fits you. Narrow it down with the filters, or select one to read the full description.</p>
        </div>
        <RefreshBar onReload={run} />
      </header>

      <section className="ex-hero" aria-label="Summary of these results">
        <div className="ex-map">
          <WorldMap cities={map.cities} home={home} pins={toPins(res?.results || [])} focus={focus} compact
            onCity={(c) => setLocations([...(locations || []).filter((l) => l !== c), c])} />
          <span className="ex-map-key"><i className="h" />You<i className="d" />Roles shown</span>
        </div>
        <div className="ex-stats">
          <p className="ex-big"><strong>{res ? <CountUp value={res.total} /> : '–'}</strong>{res?.total === 1 ? 'internship matches' : 'internships match'}</p>
          {mk && <ModeSplit remote={mk.remote} onsite={mk.onsite} />}
          {mk?.cities?.length > 0 && (
            <div className="ex-cities">
              <h3>Top cities <span>select to filter</span></h3>
              <RankBars items={mk.cities.slice(0, 4)} onPick={(c) => setLocations([...(locations || []).filter((l) => l !== c), c])} />
            </div>
          )}
        </div>
      </section>

      <div className="ex">
        <aside className={`ex-filters${showFilters ? ' open' : ''}`} aria-label="Filters">
          <div className="exf">
            <label className="exf-label" htmlFor="ex-loc">Where</label>
            <ChipInput id="ex-loc" value={locations || []} onChange={setLocations} suggestions={locSuggest} placeholder="Anywhere" />
          </div>
          <div className="exf">
            <span className="exf-label">Work</span>
            <div className="seg-ctl" role="radiogroup" aria-label="Work mode">
              {WORK.map(([v, l]) => <button key={v} type="button" role="radio" aria-checked={remote === v} className={remote === v ? 'on' : ''} onClick={() => setRemote(v)}>{l}</button>)}
            </div>
          </div>
          <div className="exf">
            <label className="exf-label" htmlFor="ex-posted">Posted</label>
            <select id="ex-posted" className="select" value={posted} onChange={(e) => setPosted(Number(e.target.value))}>
              {POSTED.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
          <fieldset className="exf">
            <legend className="exf-label">Roles</legend>
            <div className="checklist">
              {Object.keys(ROLE_WORDS).map((r) => (
                <label key={r} className="ck">
                  <input type="checkbox" checked={(roles || []).includes(r)}
                    onChange={(e) => setRoles(e.target.checked ? [...(roles || []), r] : (roles || []).filter((x) => x !== r))} />
                  <span>{r}</span>
                </label>
              ))}
            </div>
          </fieldset>
          <button type="button" className="link-btn" onClick={useProfile}>Use my profile’s cities and roles</button>
          {nFilters > 0 && <button type="button" className="link-btn" onClick={reset}>Clear filters</button>}
        </aside>

        <section className="ex-main" aria-label="Results">
          <div className="ex-bar">
            <div className="search-field">
              <Icon name="explore" size={16} />
              <label htmlFor="ex-kw" className="sr">Search by company or title</label>
              <input id="ex-kw" value={keyword} onChange={(e) => setKeyword(e.target.value)} placeholder="Search company or title" />
            </div>
            <button type="button" className="btn btn-ghost btn-sm ex-toggle" aria-expanded={showFilters} onClick={() => setShowFilters(!showFilters)}>
              Filters{nFilters ? ` (${nFilters})` : ''}
            </button>
          </div>
          {company && (
            <p className="ex-company">
              Showing every role at <strong>{company}</strong>
              <button type="button" className="link-btn" onClick={clearCompany}>Show all companies</button>
            </p>
          )}
          <div className="ex-views" role="tablist" aria-label="Which listings">
            {VIEWS.map(([v, l]) => (
              <button key={v} type="button" role="tab" aria-selected={view === v} className={view === v ? 'on' : ''} onClick={() => setView(v)}>
                {l}{v !== 'all' && counts[v] != null && <em>{counts[v].toLocaleString('en-IN')}</em>}
              </button>
            ))}
          </div>
          {view === 'new' && <p className="quiet small ex-view-note">Every listing that appeared in the last 2 days{nFilters || keyword || fitOnly ? ' and matches your filters' : ''}, newest first. They’re in All listings too.</p>}
          <div className="ex-meta">
            <p className="ex-count" aria-live="polite">
              {res ? <>Showing <strong>{res.results.length.toLocaleString('en-IN')}</strong> of {res.total.toLocaleString('en-IN')}</> : null}{busy && <Spinner />}
            </p>
            <label className="ck small">
              <input type="checkbox" checked={fitOnly} onChange={(e) => setFitOnly(e.target.checked)} /><span>Strong fits only</span>
            </label>
            <label className="ck small" title="Listings up for months or reposted again and again">
              <input type="checkbox" checked={hideStale} onChange={(e) => setHideStale(e.target.checked)} /><span>Hide likely ghost listings</span>
            </label>
            {view === 'all' && <label className="sort">
              <span>Sort</span>
              <select className="select" value={sort} onChange={(e) => setSort(e.target.value)}>
                <option value="fit">Best fit</option><option value="newest">Newest</option><option value="closing">Closing soon</option><option value="relevance">Relevance</option>
              </select>
            </label>}
          </div>
          {err && <p className="form-error">{err}</p>}
          {res && sort === 'closing' && res.results.length > 0 && !res.results[0].closes && (
            <p className="quiet small pad-s">None of these listings state an application deadline, so they’re in fit order.</p>
          )}
          {!res && !err && <SkeletonRows n={8} />}
          {res && (
            <div className={busy ? 'is-busy' : ''}>
              {view === 'all' ? <Grouped results={res.results} byFit={sort === 'fit' && !company} onFocus={setFocus} />
                : <ByDay results={res.results} field="first_seen" onFocus={setFocus}
                  empty="Nothing new matches these filters in the last 2 days. New listings land here within about 10 minutes of being posted." />}
            </div>
          )}
          {res && res.total > res.results.length && (
            <button type="button" className="btn btn-ghost more-btn" onClick={loadMore} disabled={more}>
              {more ? 'Loading…' : `Show more (${(res.total - res.results.length).toLocaleString('en-IN')} left)`}
            </button>
          )}
        </section>
      </div>
    </main>
  )
}
