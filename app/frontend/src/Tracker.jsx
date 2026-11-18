import { useRef, useState } from 'react'
import { STATUSES, exportFile, importFile } from './applications.js'
import { cityName } from './format.js'
import { shortTerms } from './components.jsx'

const fmtDate = (iso) => new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
const daysSince = (iso) => Math.floor((Date.now() - new Date(iso).getTime()) / 86400000)

function Note({ value, onSave }) {
  const [v, setV] = useState(value || '')
  const [open, setOpen] = useState(Boolean(value))
  if (!open) return <button type="button" className="link-btn" onClick={() => setOpen(true)}>Add a note</button>
  return (
    <textarea className="note" rows={2} value={v} placeholder="Referral, interview date, recruiter name…"
      onChange={(e) => setV(e.target.value)} onBlur={() => onSave(v.trim())} aria-label="Notes" />
  )
}

export default function Tracker({ store, onFind, toast }) {
  const { apps, patch, remove, restore, replaceAll } = store
  const [filter, setFilter] = useState('All')
  const fileRef = useRef(null)
  const counts = Object.fromEntries(STATUSES.map((s) => [s, apps.filter((a) => a.status === s).length]))
  const shown = filter === 'All' ? apps : apps.filter((a) => a.status === filter)
  const total = apps.length

  const onImport = async (e) => {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f) return
    try {
      const incoming = await importFile(f)
      const byId = new Map(apps.map((a) => [a.id, a]))
      incoming.forEach((a) => byId.set(a.id, { ...byId.get(a.id), ...a }))
      replaceAll([...byId.values()].sort((a, b) => (b.appliedAt || '').localeCompare(a.appliedAt || '')))
      toast(`Imported ${incoming.length} ${incoming.length === 1 ? 'application' : 'applications'}`)
    } catch (err) {
      toast(err.message || 'Couldn’t read that file.')
    }
  }

  const onRemove = (a) => {
    remove(a.id)
    toast(`Removed ${a.title}`, { label: 'Undo', run: () => restore(a) })
  }

  return (
    <main className="tracker">
      <div className="tracker-head">
        <div>
          <h1>My applications</h1>
          <p className="sub">Saved on this device when you click Apply. Update the status as you hear back.</p>
        </div>
        <div className="tracker-tools">
          <button type="button" className="ghost" onClick={() => exportFile(apps)} disabled={!total}>Export backup</button>
          <button type="button" className="ghost" onClick={() => fileRef.current?.click()}>Import</button>
          <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={onImport} />
        </div>
      </div>

      {total > 0 && (
        <>
          <div className="funnel" role="img" aria-label={STATUSES.map((s) => `${counts[s]} ${s}`).join(', ')}>
            {STATUSES.map((s) => counts[s] > 0 && (
              <span key={s} className={`seg seg-${s.toLowerCase()}`} style={{ flexGrow: counts[s] }} />
            ))}
          </div>
          <div className="tabs" role="tablist" aria-label="Filter by status">
            {['All', ...STATUSES].map((s) => (
              <button key={s} type="button" role="tab" aria-selected={filter === s}
                className={`tab${filter === s ? ' on' : ''}`} onClick={() => setFilter(s)}>
                {s !== 'All' && <i className={`dot-${s.toLowerCase()}`} aria-hidden="true" />}
                {s} <span>{s === 'All' ? total : counts[s]}</span>
              </button>
            ))}
          </div>
        </>
      )}

      {total === 0 ? (
        <div className="empty-state">
          <svg viewBox="0 0 120 64" aria-hidden="true" className="empty-art">
            <path d="M14 50 Q60 -6 106 50" className="arc" />
            <circle cx="14" cy="50" r="5" className="home" />
            <circle cx="106" cy="50" r="5" className="dest" />
          </svg>
          <h2>No applications yet</h2>
          <p>When you click Apply on any role, it&rsquo;s saved here so you can track where you stand.</p>
          <button type="button" className="primary" onClick={onFind}>Find internships</button>
        </div>
      ) : shown.length === 0 ? (
        <p className="quiet pad">Nothing marked {filter.toLowerCase()} yet.</p>
      ) : (
        <ul className="apps">
          {shown.map((a) => {
            const d = daysSince(a.appliedAt)
            return (
              <li key={a.id} className="app-row">
                <span className="avatar" aria-hidden="true">{(a.company || '?').charAt(0)}</span>
                <div className="app-main">
                  <h3><a href={a.url} target="_blank" rel="noreferrer">{a.title}</a></h3>
                  <p className="job-sub">
                    <span className="co">{a.company}</span>
                    {a.location && <><span className="pin" aria-hidden="true" />{cityName(a.location)}</>}
                  </p>
                  <p className="job-meta">
                    <span>Applied {fmtDate(a.appliedAt)}{d > 0 ? `, ${d} ${d === 1 ? 'day' : 'days'} ago` : ', today'}</span>
                    <span>{shortTerms(a.terms)}</span>
                    {a.status === 'Applied' && d >= 14 && <span className="nudge">Worth a follow-up</span>}
                  </p>
                  <Note value={a.notes} onSave={(notes) => patch(a.id, { notes })} />
                </div>
                <div className="app-side">
                  <label className="sr" htmlFor={`st-${a.id}`}>Status for {a.title}</label>
                  <span className={`status-wrap st-${a.status.toLowerCase()}`}>
                    <select id={`st-${a.id}`} value={a.status} onChange={(e) => patch(a.id, { status: e.target.value })}>
                      {STATUSES.map((s) => <option key={s}>{s}</option>)}
                    </select>
                  </span>
                  <button type="button" className="link-btn quiet-btn" onClick={() => onRemove(a)}>Remove</button>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </main>
  )
}
