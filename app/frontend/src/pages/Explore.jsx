import { useEffect, useState } from 'react'
import { searchJobs } from '../lib/api.js'
import { useLocationSuggestions } from '../lib/mapdata.js'
import { useSession } from '../lib/session.jsx'
import { Results } from '../components.jsx'
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

export default function Explore() {
  const { profile } = useSession()
  const locSuggest = useLocationSuggestions()
  const [locations, setLocations] = useState(null)
  const [roles, setRoles] = useState(null)
  const [keyword, setKeyword] = useState('')
  const [remote, setRemote] = useState('any')
  const [posted, setPosted] = useState(0)
  const [fitOnly, setFitOnly] = useState(true)
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
  }, [locations, roles, keyword, remote, posted, fitOnly, sort, limit])

  async function run() {
    setBusy(true); setErr('')
    const any = (roles || []).flatMap((r) => ROLE_WORDS[r] || [])
    const f = {
      any_keywords: any.length ? any : undefined, keywords: keyword.trim() ? [keyword.trim()] : undefined,
      locations: locations?.length ? locations : undefined, remote: remote === 'any' ? undefined : remote,
      posted_within_days: posted || undefined, fit_only: fitOnly || undefined, sort, limit,
    }
    try { setRes(await searchJobs(f, profile)) } catch (e) { setErr(e.message) } finally { setBusy(false) }
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
          <h1>Explore</h1>
          <p className="sub">Every live listing, filtered your way. Select a role to read the full description.</p>
        </div>
      </header>

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
              {busy ? <Spinner /> : res ? <><strong>{res.total.toLocaleString('en-IN')}</strong> {res.total === 1 ? 'internship' : 'internships'}</> : null}
            </p>
            <label className="ck small">
              <input type="checkbox" checked={fitOnly} onChange={(e) => setFitOnly(e.target.checked)} /><span>Strong fits only</span>
            </label>
            <label className="sort">
              <span>Sort</span>
              <select className="select" value={sort} onChange={(e) => setSort(e.target.value)}>
                <option value="fit">Best fit</option><option value="newest">Newest</option><option value="relevance">Relevance</option>
              </select>
            </label>
          </div>
          {err && <p className="form-error">{err}</p>}
          {res && <Results data={{ results: res.results }} limit={limit} showChips={false}
            empty="Nothing matches all of that. Remove a filter or two." />}
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
