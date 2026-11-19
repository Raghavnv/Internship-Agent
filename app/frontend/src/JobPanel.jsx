// Side panel with one listing in full: route from you, key facts, how it fits, and the description.
import { useEffect, useRef, useState } from 'react'
import { getJob } from './lib/api.js'
import { useSession } from './lib/session.jsx'
import { useUserData } from './lib/userdata.jsx'
import { cityCode, cityName, postedLabel } from './format.js'
import { coHue, shortTerms } from './components.jsx'
import { Icon, Spinner } from './ui.jsx'
import { Referral, Tailor } from './Coach.jsx'
import { Odds } from './Signals.jsx'

const km = (a, b) => {
  const r = (d) => (d * Math.PI) / 180
  const h = Math.sin(r(b[0] - a[0]) / 2) ** 2 + Math.cos(r(a[0])) * Math.cos(r(b[0])) * Math.sin(r(b[1] - a[1]) / 2) ** 2
  return Math.round(12742 * Math.asin(Math.sqrt(h)))
}
// consecutive bullet blocks become one list
function Desc({ blocks }) {
  const out = []
  let list = null
  blocks.forEach((b, i) => {
    if (b.type === 'li') { (list ||= []).push(<li key={i}>{b.text}</li>); return }
    if (list) { out.push(<ul key={`u${i}`}>{list}</ul>); list = null }
    out.push(b.type === 'h' ? <h4 key={i}>{b.text}</h4> : <p key={i}>{b.text}</p>)
  })
  if (list) out.push(<ul key="u-end">{list}</ul>)
  return out
}
const host = (url) => { try { return new URL(url).hostname.replace(/^www\./, '') } catch { return '' } }

function Route({ home, job }) {
  const first = (job.locations || [])[0] || ''
  const remote = job.remote || /remote/i.test(first)
  const pin = job.pins?.[0]
  const dist = home && pin && !remote ? km([home.lat, home.lng], pin) : null
  return (
    <div className="jp-route" aria-label={`From ${home?.city || 'you'} to ${remote ? 'remote' : cityName(first)}`}>
      <span className="jp-end"><b>{home ? cityCode(home.city) : 'YOU'}</b><small>{home?.city || 'You'}</small></span>
      <span className="jp-line" aria-hidden="true"><i /></span>
      <span className="jp-end r"><b>{remote ? 'WFH' : cityCode(first)}</b><small>{remote ? 'Remote' : cityName(first) || 'Not listed'}</small></span>
      {dist != null && <span className="jp-dist">{dist.toLocaleString('en-IN')} km</span>}
    </div>
  )
}

export default function JobPanel() {
  const { profile, home } = useSession()
  const data = useUserData()
  const job = data.viewing
  const [full, setFull] = useState(null)
  const [referred, setReferred] = useState(false)
  const [state, setState] = useState('idle')
  const closeRef = useRef(null)
  const lastFocus = useRef(null)

  useEffect(() => {
    if (!job) return
    lastFocus.current = document.activeElement
    closeRef.current?.focus()
    setFull(null); setState('loading'); setReferred(false)
    let alive = true
    getJob(job.id || job.job_id, profile)
      .then((r) => alive && (setFull(r), setState('ok')))
      .catch((e) => alive && setState(/no longer live|404/i.test(e.message) ? 'gone' : 'error'))
    const onKey = (e) => { if (e.key === 'Escape') data.closeJob() }
    window.addEventListener('keydown', onKey)
    return () => { alive = false; window.removeEventListener('keydown', onKey); lastFocus.current?.focus?.() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [job?.id || job?.job_id])

  if (!job) return null
  const j = { ...job, id: job.id || job.job_id, ...(full?.job || {}) }
  const applied = data.isApplied(j.id)
  const saved = data.isSaved(j.id)
  const posted = postedLabel(j.posted)
  const flag = j.sponsorship?.includes('Citizenship') ? 'US citizens only'
    : j.sponsorship?.includes('Does Not Offer') ? 'No visa sponsorship' : j.sponsorship?.includes('Offers') ? 'Sponsors visas' : null
  const facts = [
    ['Locations', (j.locations || []).length ? j.locations.join(' · ') : j.location || 'Not listed'],
    ['Dates', shortTerms(j.terms)],
    posted && ['Posted', posted],
    j.stipend && ['Stipend', j.stipend],
    (j.degrees || []).length > 0 && ['Degree', j.degrees.join(', ')],
    flag && ['Work authorisation', flag],
    j.category && ['Category', j.category],
  ].filter(Boolean)

  return (
    <>
      <button type="button" className="jp-scrim" aria-label="Close details" onClick={data.closeJob} />
      <aside className="jp" role="dialog" aria-modal="true" aria-labelledby="jp-title">
        <header className="jp-head">
          <span className="avatar co-av" style={coHue(j.company)} aria-hidden="true">{(j.company || '?').trim().charAt(0)}</span>
          <div className="jp-titles">
            <p className="jp-co">{j.company}</p>
            <h2 id="jp-title">{j.title}</h2>
          </div>
          <button ref={closeRef} type="button" className="icon-btn" aria-label="Close" onClick={data.closeJob}><Icon name="x" /></button>
        </header>

        <div className="jp-body">
          <Route home={home} job={j} />

          <div className="jp-actions">
            <a className={`btn ${applied ? 'btn-ghost' : 'btn-primary'}`} href={j.url} target="_blank" rel="noreferrer"
              onClick={() => { if (!applied) data.apply(j) }}>
              {applied ? <><Icon name="check" size={16} />Applied · open listing</> : <>Apply on {host(j.url) || 'the company site'}</>}
            </a>
            <button type="button" className="btn btn-ghost" aria-pressed={saved} onClick={() => data.toggleSave(j)}>
              <Icon name="saved" size={16} />{saved ? 'Saved' : 'Save'}
            </button>
          </div>
          {!applied && <p className="jp-note">Applying opens the listing and adds it to Applications, so you can track it.</p>}

          <dl className="jp-facts">
            {facts.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}
          </dl>

          {state === 'loading' && <div className="jp-loading"><Spinner label="Loading details" /></div>}
          {state === 'gone' && <p className="form-error">This listing has been taken down or filled. What you saved is shown above.</p>}
          {state === 'error' && <p className="form-error">Couldn’t load the full details right now. The listing link still works.</p>}

          {full?.checks?.length > 0 && (
            <section className="jp-sec" aria-labelledby="jp-fit">
              <h3 id="jp-fit">How it fits you{j.fit != null && <span className="jp-score">{j.fit}<small>/100</small></span>}</h3>
              <ul className="jp-checks">
                {full.checks.map((c, i) => (
                  <li key={i} className={c.ok === true ? 'ok' : c.ok === false ? 'no' : 'na'}>
                    <span className="mk" aria-hidden="true">{c.ok === true ? '✓' : c.ok === false ? '×' : '?'}</span>{c.text}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {state === 'ok' && <Odds signals={full.signals} referred={referred} company={j.company}
            onReferred={(v) => { setReferred(v); getJob(j.id, profile, v).then((r) => setFull((f) => ({ ...f, signals: r.signals }))).catch(() => {}) }} />}
          {(state === 'ok' || state === 'gone') && <Tailor job={j} profile={profile} hasDescription={Boolean(full?.description)} />}
          {(state === 'ok' || state === 'gone') && <Referral job={j} profile={profile} />}

          {state === 'ok' && (
            <section className="jp-sec" aria-labelledby="jp-desc">
              <h3 id="jp-desc">Job description</h3>
              {full.description ? (
                <div className="jp-desc">
                  <Desc blocks={full.description.blocks} />
                  <p className="jp-src">From the company’s {full.description.from} listing.</p>
                </div>
              ) : (
                <p className="quiet">The full description isn’t available here for this employer. You can read it on {host(j.url) || 'their site'}.
                  {' '}<a className="link" href={j.url} target="_blank" rel="noreferrer">Open the listing</a></p>
              )}
            </section>
          )}
        </div>
      </aside>
    </>
  )
}
