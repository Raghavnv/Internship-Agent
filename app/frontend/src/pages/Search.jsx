import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { findJobs } from '../lib/api.js'
import { useSession } from '../lib/session.jsx'
import { useUserData } from '../lib/userdata.jsx'
import { JobRow } from '../components.jsx'
import SearchBar from '../SearchBar.jsx'
import { SkeletonRows } from '../charts.jsx'

const WHERE = [['', 'Anywhere'], ['india', 'India'], ['us', 'United States'], ['remote', 'Remote']]
const SORTS = [['relevance', 'Most relevant'], ['fit', 'Best fit for you'], ['newest', 'Newest']]

export default function Search() {
  const { profile } = useSession()
  const data = useUserData()
  const applied = (data?.apps || []).map((a) => a.job_id).filter(Boolean)
  const nav = useNavigate()
  const [params, setParams] = useSearchParams()
  const q = params.get('q') || ''
  const where = params.get('where') || ''
  const sort = params.get('sort') || 'relevance'
  const [res, setRes] = useState(null)
  const [more, setMore] = useState(false)
  const [err, setErr] = useState('')

  const opts = () => ({
    sort,
    exclude_ids: applied.length ? applied : undefined,
    remote: where === 'remote' ? true : undefined,
    region: where && where !== 'remote' ? where : undefined,
  })

  useEffect(() => {
    if (!q) { setRes(null); return }
    let live = true
    setErr(''); setRes((r) => (r ? { ...r, busy: true } : null))
    findJobs(q, { ...opts(), limit: 30 }, profile)
      .then((r) => live && setRes(r))
      .catch((e) => live && (setErr(e.message), setRes(null)))
    return () => { live = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, where, sort, profile, applied.length])

  const set = (k, v) => { const p = new URLSearchParams(params); v ? p.set(k, v) : p.delete(k); setParams(p, { replace: true }) }

  async function loadMore() {
    setMore(true)
    try {
      const r = await findJobs(q, { ...opts(), offset: res.results.length, limit: 30 }, profile)
      setRes((x) => ({ ...x, results: [...x.results, ...r.results] }))
    } finally { setMore(false) }
  }

  const read = res && (res.understood.length || res.places.length) ? (
    <>
      {res.understood.length > 0 && <>Roles matching <strong>{res.understood.join(' + ')}</strong></>}
      {res.places.length > 0 && <> in <strong>{res.places.join(', ')}</strong></>}
    </>
  ) : null

  return (
    <main className="page search-page">
      <header className="srch-head">
        <h1>Search every listing</h1>
        <p className="sub">Type a role, skill or company. This looks across all live internships, not just the ones in your saved preferences, and still ranks the best fits for you first.</p>
        <SearchBar big autoFocus={!q} onSearch={(t) => set('q', t)} />
      </header>

      {!q && (
        <section className="srch-ideas" aria-label="Try a search">
          {['SDE', 'Machine learning Bangalore', 'Frontend remote', 'Quant', 'Data analyst India', 'Google', 'Embedded', 'Product manager'].map((t) => (
            <button key={t} type="button" className="idea" onClick={() => set('q', t)}>{t}</button>
          ))}
        </section>
      )}

      {q && (
        <div className="srch-tools">
          <div className="seg" role="group" aria-label="Where">
            {WHERE.map(([v, l]) => (
              <button key={v || 'any'} type="button" className={where === v ? 'on' : ''} aria-pressed={where === v} onClick={() => set('where', v)}>{l}</button>
            ))}
          </div>
          <label className="sort"><span>Sort</span>
            <select value={sort} onChange={(e) => set('sort', e.target.value === 'relevance' ? '' : e.target.value)}>
              {SORTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </label>
        </div>
      )}

      {err && <p className="form-error">{err}</p>}
      {q && !res && !err && <SkeletonRows n={8} />}

      {res && (
        <section className={`srch-results${res.busy ? ' is-busy' : ''}`} aria-live="polite">
          {res.unknown?.length > 0 ? (
            <div className="empty-state">
              <h2>No listings mention “{res.unknown.join(' ')}”</h2>
              <p>Try a role (“backend”, “data analyst”), a skill (“React”), a company or a city. Or ask the <Link to={`/app/copilot?q=${encodeURIComponent(q)}`}>AI Copilot</Link>, which understands longer questions.</p>
            </div>
          ) : (
            <>
              <div className="srch-summary">
                <p><strong className="num">{res.total.toLocaleString('en-IN')}</strong> {res.total === 1 ? 'internship' : 'internships'}{read && <span className="quiet"> · {read}</span>}</p>
                {res.top_companies?.length > 1 && (
                  <ul className="srch-cos" aria-label="Companies with the most matches">
                    {res.top_companies.slice(0, 5).map(([c, n]) => (
                      <li key={c}><button type="button" onClick={() => set('q', c)}>{c} <em>{n}</em></button></li>
                    ))}
                  </ul>
                )}
              </div>
              {res.total === 0 ? (
                <div className="empty-state">
                  <h2>Nothing open for that right now</h2>
                  <p>{where ? <>Try <button type="button" className="link" onClick={() => set('where', '')}>anywhere</button> instead, or fewer words.</> : 'Try fewer words, or a broader role like “software” or “data”.'}</p>
                </div>
              ) : (
                <ul className="jobs">{res.results.map((j, i) => <JobRow key={j.id} job={j} index={i} />)}</ul>
              )}
              {res.results.length < res.total && (
                <button type="button" className="btn btn-ghost more-btn" onClick={loadMore} disabled={more}>
                  {more ? 'Loading…' : `Show more (${(res.total - res.results.length).toLocaleString('en-IN')} left)`}
                </button>
              )}
              <p className="quiet small srch-foot">Want it narrower? <button type="button" className="link" onClick={() => nav(`/app/copilot?q=${encodeURIComponent(q)}`)}>Ask the Copilot</button> something like “{q}, paid, starting in June”.</p>
            </>
          )}
        </section>
      )}
    </main>
  )
}
