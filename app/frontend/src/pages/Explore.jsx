import { useEffect, useState } from 'react'
import { searchJobs } from '../lib/api.js'
import { toPins, useMapData } from '../lib/mapdata.js'
import { LOCATIONS } from '../lib/options.js'
import { useSession } from '../lib/session.jsx'
import { useUserData } from '../lib/userdata.jsx'
import { Results } from '../components.jsx'
import { ChipInput, ChoiceChips, Spinner } from '../ui.jsx'
import WorldMap from '../WorldMap.jsx'

const ROLE_WORDS = {
  'Software Engineering': ['software engineer', 'software develop', 'swe', 'sde'], Backend: ['backend', 'back-end', 'api', 'platform'],
  'Full Stack': ['full stack', 'full-stack', 'fullstack'], Frontend: ['frontend', 'front-end'],
  'AI / ML': ['machine learning', 'ml', 'ai', 'deep learning', 'llm'], 'Data Science': ['data scien', 'data analy'],
  'Data Engineering': ['data engineer'], Mobile: ['mobile', 'ios', 'android'], 'DevOps / Cloud': ['devops', 'cloud', 'sre', 'infrastructure'],
  Security: ['security'], Research: ['research'], 'Forward Deployed': ['forward deploy', 'solutions engineer'], Product: ['product'],
  Quant: ['quant', 'trading'], 'Hardware / Embedded': ['hardware', 'embedded', 'firmware'], 'Design / UX': ['design', 'ux'],
}
const POSTED = [{ value: 0, label: 'Any time' }, { value: 3, label: 'Last 3 days' }, { value: 7, label: 'Last week' }, { value: 30, label: 'Last month' }]
const SORTS = [{ value: 'fit', label: 'Best fit' }, { value: 'newest', label: 'Newest' }, { value: 'relevance', label: 'Relevance' }]

export default function Explore() {
  const { profile, home } = useSession()
  const data = useUserData()
  const map = useMapData()
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
  const [limit, setLimit] = useState(20)
  const [focus, setFocus] = useState(null)

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

  return (
    <div className="explore">
      <div className="ex-map"><WorldMap cities={map.cities} home={home} pins={toPins(res?.results)} focus={focus} compact
        onCity={(c) => setLocations([c])} /></div>
      <main className="page">
        <header className="page-head">
          <div>
            <h1>Explore</h1>
            <p className="sub">Filter every live listing yourself. Click a city on the map to jump there.</p>
          </div>
        </header>
        <div className="filters">
          <div className="f-row">
            <label className="f-label" htmlFor="ex-loc">Where</label>
            <ChipInput id="ex-loc" value={locations || []} onChange={setLocations} suggestions={LOCATIONS} placeholder="Anywhere" />
          </div>
          <div className="f-row">
            <span className="f-label">Roles</span>
            <ChoiceChips options={Object.keys(ROLE_WORDS)} value={roles || []} onChange={setRoles} label="Roles" />
          </div>
          <div className="f-grid">
            <div className="f-row"><label className="f-label" htmlFor="ex-kw">Keyword</label>
              <input id="ex-kw" value={keyword} onChange={(e) => setKeyword(e.target.value)} placeholder="Company or title word" /></div>
            <div className="f-row"><span className="f-label">Work</span>
              <ChoiceChips single options={[{ value: 'any', label: 'Any' }, { value: 'only', label: 'Remote only' }, { value: 'exclude', label: 'In person' }]} value={remote} onChange={setRemote} label="Work mode" /></div>
            <div className="f-row"><span className="f-label">Posted</span><ChoiceChips single options={POSTED} value={posted} onChange={setPosted} label="Posted" /></div>
            <div className="f-row"><span className="f-label">Sort</span><ChoiceChips single options={SORTS} value={sort} onChange={setSort} label="Sort" /></div>
          </div>
          <label className="switch-row">
            <input type="checkbox" checked={fitOnly} onChange={(e) => setFitOnly(e.target.checked)} />
            <span className="switch" aria-hidden="true" />Only strong fits for my profile
          </label>
        </div>

        <div className="ex-results">
          <p className="ex-count" aria-live="polite">
            {busy ? <Spinner /> : res ? <><strong>{res.total.toLocaleString('en-IN')}</strong> {res.total === 1 ? 'internship' : 'internships'}</> : null}
          </p>
          {err && <p className="form-error">{err}</p>}
          {res && <Results data={{ results: res.results }} limit={limit} actions={data} onFocus={setFocus}
            empty="Nothing matches all of that. Remove a filter or two." />}
          {res && res.total > res.results.length && res.results.length >= limit && (
            <button type="button" className="btn btn-ghost" onClick={() => setLimit(Math.min(50, limit + 15))} disabled={limit >= 50}>
              {limit >= 50 ? 'Showing the top 50, narrow the filters to see others' : 'Show more'}
            </button>
          )}
        </div>
      </main>
    </div>
  )
}
