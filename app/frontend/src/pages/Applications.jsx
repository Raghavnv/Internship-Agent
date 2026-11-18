import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useUserData } from '../lib/userdata.jsx'
import { cityName } from '../format.js'
import { coHue, shortTerms } from '../components.jsx'
import { Icon } from '../ui.jsx'

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
  const { apps, loaded, updateApp, removeApp, openJob } = useUserData()
  const [filter, setFilter] = useState('All')
  const counts = Object.fromEntries(STATUSES.map((s) => [s, apps.filter((a) => a.status === s).length]))
  const shown = filter === 'All' ? apps : apps.filter((a) => a.status === filter)

  return (
    <main className="page">
      <header className="page-head">
        <div>
          <h1>Applications</h1>
          <p className="sub">Everything you’ve applied to. Change the status as you hear back.</p>
        </div>
        {apps.length > 0 && <button type="button" className="btn btn-ghost btn-sm" onClick={() => exportCsv(apps)}>Export CSV</button>}
      </header>

      {loaded && apps.length === 0 ? (
        <div className="empty-state">
          <h2>No applications yet</h2>
          <p>Open any role and choose Apply. It’s added here so you can track where you stand.</p>
          <Link to="/app" className="btn btn-primary">See your matches</Link>
        </div>
      ) : (
        <>
          <div className="tabs" role="tablist" aria-label="Filter by status">
            {['All', ...STATUSES].map((s) => (
              <button key={s} type="button" role="tab" aria-selected={filter === s} className={`tab${filter === s ? ' on' : ''}`} onClick={() => setFilter(s)}>
                {s !== 'All' && <i className={`dot-${s.toLowerCase()}`} aria-hidden="true" />}{s}<span>{s === 'All' ? apps.length : counts[s]}</span>
              </button>
            ))}
          </div>
          {shown.length === 0 ? <p className="quiet pad">Nothing marked {filter.toLowerCase()} yet.</p> : (
            <div className="table" role="table" aria-label="Applications">
              <div className="tr th" role="row">
                <span role="columnheader">Role</span><span role="columnheader">Applied</span><span role="columnheader">Status</span><span role="columnheader"><span className="sr">Actions</span></span>
              </div>
              {shown.map((a) => {
                const d = daysSince(a.applied_at)
                return (
                  <div key={a.id} className="tr" role="row">
                    <div className="td role-cell" role="cell">
                      <span className="avatar co-av" style={coHue(a.company)} aria-hidden="true">{(a.company || '?').charAt(0)}</span>
                      <div className="app-main">
                        <button type="button" className="app-title" onClick={() => openJob(a)}>{a.title}</button>
                        <p className="job-sub"><span className="co">{a.company}</span>{a.location && <><span className="sep" aria-hidden="true" />{cityName(a.location)}</>}<span className="sep" aria-hidden="true" />{shortTerms(a.terms)}</p>
                        <Note value={a.notes} onSave={(notes) => updateApp(a.id, { notes })} />
                      </div>
                    </div>
                    <div className="td date-cell" role="cell">
                      {fmtDate(a.applied_at)}<small>{d === 0 ? 'today' : `${d} ${d === 1 ? 'day' : 'days'} ago`}</small>
                      {a.status === 'Applied' && d >= 14 && <small className="nudge">Worth a follow-up</small>}
                    </div>
                    <div className="td" role="cell">
                      <label className="sr" htmlFor={`st-${a.id}`}>Status for {a.title}</label>
                      <span className={`status-wrap st-${a.status.toLowerCase()}`}>
                        <select id={`st-${a.id}`} value={a.status} onChange={(e) => updateApp(a.id, { status: e.target.value })}>
                          {STATUSES.map((s) => <option key={s}>{s}</option>)}
                        </select>
                      </span>
                    </div>
                    <div className="td end" role="cell">
                      <button type="button" className="icon-btn" aria-label={`Remove ${a.title}`} title="Remove" onClick={() => removeApp(a)}><Icon name="x" size={16} /></button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </>
      )}
    </main>
  )
}
