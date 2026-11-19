import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { getInsights, searchJobs } from '../lib/api.js'
import { toPins, useLocationSuggestions, useMapData } from '../lib/mapdata.js'
import { useSession } from '../lib/session.jsx'
import { JobRow } from '../components.jsx'
import { CountUp, ModeSplit, RankBars, SkeletonRows } from '../charts.jsx'
import WorldMap from '../WorldMap.jsx'
import RefreshBar from '../RefreshBar.jsx'
import { ChipInput, Icon, Spinner } from '../ui.jsx'

const ROLE_WORDS = {
  'Software Engineering': ['software engineer', 'software develop', 'swe', 'sde'], Backend: ['backend', 'back-end', 'api', 'platform'],
  'Full Stack': ['full stack', 'full-stack', 'fullstack'], Frontend: ['frontend', 'front-end'],
  'AI / ML': ['machine learning', 'ml', 'ai', 'deep learning', 'llm'], 'Data Science': ['data scien', 'data analy'],
  'Data Engineering': ['data engineer'], Mobile: ['mobile', 'ios', 'android'], 'DevOps / Cloud': ['devops', 'cloud', 'sre', 'infrastructure'],
  Security: ['security'], Research: ['research'], 'Forward Deployed': ['forward deploy', 'solutions engineer'], Product: ['product'],
  Quant: ['quant', 'trading'], 'Hardware / Embedded': ['hardware', 'embedded', 'firmware'], 'Design / UX': ['design', 'ux'],
}
const POSTED = [[0, 'Any time'], [3, 'Last 3 days'], [7, 'Last week'], [30, 'Last month']]
const WORK = [['any', 'Any'], ['only', 'Remote'], ['exclude', 'In person']]

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
  const [params] = useSearchParams()
  const map = useMapData()
  const locSuggest = useLocationSuggestions()
  const [focus, setFocus] = useState(null)
  const [mk, setMk] = useState(null)
  const [locations, setLocations] = useState(null)
  const [roles, setRoles] = useState(null)
  const [keyword, setKeyword] = useState(params.get('q') || '')
  const [remote, setRemote] = useState('any')
  const [posted, setPosted] = useState(0)
  const [fitOnly, setFitOnly] = useState(true)
  const [hideStale, setHideStale] = useState(true)
  const [sort, setSort] = useState('fit')
  const [res, setRes] = useState(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [limit, setLimit] = useState(25)
  const [showFilters, setShowFilters] = useState(false)

  useEffect(() => {
    if (profile && locations === null) {
      setLocations((profile.locations || []).filter((l) => !/^remote$/i.test(l)))
      setRoles(profile.roles || [])
    }
  }, [profile])

  useEffect(() => {
    if (locations === null) return
    const t = setTimeout(run, 250)
    return () => clearTimeout(t)
  }, [locations, roles, keyword, remote, posted, fitOnly, hideStale, sort, limit])

  async function run() {
    setBusy(true); setErr('')
    const any = (roles || []).flatMap((r) => ROLE_WORDS[r] || [])
    const f = {
      any_keywords: any.length ? any : undefined, keywords: keyword.trim() ? [keyword.trim()] : undefined,
      locations: locations?.length ? locations : undefined, remote: remote === 'any' ? undefined : remote,
      posted_within_days: posted || undefined, fit_only: fitOnly || undefined, hide_stale: hideStale || undefined, sort, limit,
    }
    try {
      const [r, m] = await Promise.all([searchJobs(f, profile), getInsights({ ...f, sort: undefined, limit: undefined }, profile).catch(() => null)])
      setRes(r); setMk(m)
    } catch (e) { setErr(e.message) } finally { setBusy(false) }
  }

  const reset = () => {
    setLocations((profile?.locations || []).filter((l) => !/^remote$/i.test(l))); setRoles(profile?.roles || [])
    setKeyword(''); setRemote('any'); setPosted(0); setFitOnly(true)
  }
  const nFilters = (locations?.length ? 1 : 0) + (roles?.length ? 1 : 0) + (remote !== 'any') + (posted ? 1 : 0)

  return (
    <main className="page page-wide">
      <header className="page-head">
        <div>
          <h1>Job listings</h1>
          <p className="sub">Every live internship, filtered your way and ranked by how well it fits you. Select one to read the full description.</p>
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
          <button type="button" className="link-btn" onClick={reset}>Reset to my profile</button>
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
          <div className="ex-meta">
            <p className="ex-count" aria-live="polite">
              {res ? <>Showing <strong>{Math.min(limit, res.results.length)}</strong> of {res.total.toLocaleString('en-IN')}</> : null}{busy && <Spinner />}
            </p>
            <label className="ck small">
              <input type="checkbox" checked={fitOnly} onChange={(e) => setFitOnly(e.target.checked)} /><span>Strong fits only</span>
            </label>
            <label className="ck small" title="Listings up for months or reposted again and again">
              <input type="checkbox" checked={hideStale} onChange={(e) => setHideStale(e.target.checked)} /><span>Hide likely ghost listings</span>
            </label>
            <label className="sort">
              <span>Sort</span>
              <select className="select" value={sort} onChange={(e) => setSort(e.target.value)}>
                <option value="fit">Best fit</option><option value="newest">Newest</option><option value="closing">Closing soon</option><option value="relevance">Relevance</option>
              </select>
            </label>
          </div>
          {err && <p className="form-error">{err}</p>}
          {res && sort === 'closing' && res.results.length > 0 && !res.results[0].closes && (
            <p className="quiet small pad-s">None of these listings state an application deadline, so they’re in fit order.</p>
          )}
          {!res && !err && <SkeletonRows n={8} />}
          {res && <div className={busy ? 'is-busy' : ''}><Grouped results={res.results.slice(0, limit)} byFit={sort === 'fit'} onFocus={setFocus} /></div>}
          {res && res.total > res.results.length && res.results.length >= limit && (
            <button type="button" className="btn btn-ghost more-btn" onClick={() => setLimit(Math.min(50, limit + 25))} disabled={limit >= 50}>
              {limit >= 50 ? "Showing the top 50. Narrow the filters to see others." : "Show more"}
            </button>
          )}
        </section>
      </div>
    </main>
  )
}
