import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useUserData } from '../lib/userdata.jsx'
import { cityName } from '../format.js'
import { shortTerms } from '../components.jsx'

const STATUSES = ['Applied', 'Interviewing', 'Offer', 'Rejected']
const fmtDate = (iso) => new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
const daysSince = (iso) => Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86400000))

function Note({ value, onSave }) {
  const [v, setV] = useState(value || '')
  const [open, setOpen] = useState(Boolean(value))
  if (!open) return <button type="button" className="link-btn" onClick={() => setOpen(true)}>Add a note</button>
  return <textarea className="note" rows={2} value={v} placeholder="Referral, interview date, recruiter name…"
    onChange={(e) => setV(e.target.value)} onBlur={() => v.trim() !== (value || '') && onSave(v.trim())} aria-label="Notes" />
}

function exportCsv(apps) {
  const rows = [['Title', 'Company', 'Location', 'Status', 'Applied', 'Notes', 'Link'],
    ...apps.map((a) => [a.title, a.company, a.location, a.status, (a.applied_at || '').slice(0, 10), a.notes, a.url])]
  const csv = rows.map((r) => r.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\n')
  const link = document.createElement('a')
  link.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
  link.download = `applications-${new Date().toISOString().slice(0, 10)}.csv`
  link.click()
}

export default function Applications() {
  const { apps, loaded, updateApp, removeApp } = useUserData()
  const [filter, setFilter] = useState('All')
  const counts = Object.fromEntries(STATUSES.map((s) => [s, apps.filter((a) => a.status === s).length]))
  const shown = filter === 'All' ? apps : apps.filter((a) => a.status === filter)

  return (
    <main className="page">
      <header className="page-head">
        <div>
          <h1>Applications</h1>
          <p className="sub">Everything you&rsquo;ve applied to. Update the status as you hear back.</p>
        </div>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => exportCsv(apps)} disabled={!apps.length}>Export CSV</button>
      </header>

      {apps.length > 0 && (
        <>
          <div className="funnel" role="img" aria-label={STATUSES.map((s) => `${counts[s]} ${s}`).join(', ')}>
            {STATUSES.map((s) => counts[s] > 0 && <span key={s} className={`seg seg-${s.toLowerCase()}`} style={{ flexGrow: counts[s] }} />)}
          </div>
          <div className="tabs" role="tablist" aria-label="Filter by status">
            {['All', ...STATUSES].map((s) => (
              <button key={s} type="button" role="tab" aria-selected={filter === s} className={`tab${filter === s ? ' on' : ''}`} onClick={() => setFilter(s)}>
                {s !== 'All' && <i className={`dot-${s.toLowerCase()}`} aria-hidden="true" />}{s} <span>{s === 'All' ? apps.length : counts[s]}</span>
              </button>
            ))}
          </div>
        </>
      )}

      {loaded && apps.length === 0 ? (
        <div className="empty-state">
          <svg viewBox="0 0 120 64" aria-hidden="true" className="empty-art"><path d="M14 50 Q60 -6 106 50" className="arc" /><circle cx="14" cy="50" r="5" className="home" /><circle cx="106" cy="50" r="5" className="dest" /></svg>
          <h2>No applications yet</h2>
          <p>When you click Apply on any role, it&rsquo;s saved here so you can track where you stand.</p>
          <Link to="/app" className="btn btn-primary">See your matches</Link>
        </div>
      ) : shown.length === 0 ? (
        <p className="quiet pad">Nothing marked {filter.toLowerCase()} yet.</p>
      ) : (
        <ul className="apps">
          {shown.map((a) => {
            const d = daysSince(a.applied_at)
            return (
              <li key={a.id} className="app-row">
                <span className="avatar" aria-hidden="true">{(a.company || '?').charAt(0)}</span>
                <div className="app-main">
                  <h3><a href={a.url} target="_blank" rel="noreferrer">{a.title}</a></h3>
                  <p className="job-sub"><span className="co">{a.company}</span>{a.location && <><span className="pin" aria-hidden="true" />{cityName(a.location)}</>}</p>
                  <p className="job-meta">
                    <span>Applied {fmtDate(a.applied_at)}{d > 0 ? `, ${d} ${d === 1 ? 'day' : 'days'} ago` : ', today'}</span>
                    <span>{shortTerms(a.terms)}</span>
                    {a.status === 'Applied' && d >= 14 && <span className="nudge">Worth a follow-up</span>}
                  </p>
                  <Note value={a.notes} onSave={(notes) => updateApp(a.id, { notes })} />
                </div>
                <div className="app-side">
                  <label className="sr" htmlFor={`st-${a.id}`}>Status for {a.title}</label>
                  <span className={`status-wrap st-${a.status.toLowerCase()}`}>
                    <select id={`st-${a.id}`} value={a.status} onChange={(e) => updateApp(a.id, { status: e.target.value })}>
                      {STATUSES.map((s) => <option key={s}>{s}</option>)}
                    </select>
                  </span>
                  <button type="button" className="link-btn quiet-btn" onClick={() => removeApp(a)}>Remove</button>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </main>
  )
}
