import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useUserData } from '../lib/userdata.jsx'
import { downloadIcs, googleCalendarUrl } from '../lib/calendar.js'
import { STATUSES, statusKey } from '../lib/options.js'
import { cityName } from '../format.js'
import { coHue, shortTerms } from '../components.jsx'
import { Icon } from '../ui.jsx'

const DAY = 86400000
const fmtDate = (iso) => new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
const fmtWhen = (iso) => new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })
const daysSince = (iso) => Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / DAY))
const ago = (iso) => { const d = daysSince(iso); return d === 0 ? 'today' : d === 1 ? 'yesterday' : `${d} days ago` }
// <input type="datetime-local"> wants local time without a zone
const toLocalInput = (iso) => { if (!iso) return ''; const d = new Date(iso); return new Date(d - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16) }
const HINTS = {
  Applied: 'Submitted, waiting to hear back',
  'Online assessment': 'Coding test or take-home',
  Interviewing: 'Talking to the team',
  Offer: 'Congratulations',
  Rejected: 'Not this time',
}

function followUp(a) {
  if (!['Applied', 'Online assessment'].includes(a.status)) return null
  const due = a.follow_up_on ? new Date(a.follow_up_on) : a.applied_at ? new Date(new Date(a.applied_at).getTime() + 10 * DAY) : null
  if (!due) return null
  const days = Math.ceil((due - Date.now()) / DAY)
  return { due, days, suggested: !a.follow_up_on }
}

function Card({ a, onMove, onEdit, onOpen, onRemove, dragging, setDragging }) {
  const [open, setOpen] = useState(false)
  const [note, setNote] = useState(a.notes || '')
  const f = followUp(a)
  const iv = a.interview_at && new Date(a.interview_at) > Date.now() - 2 * 3600000 ? a.interview_at : null
  return (
    <li className={`card${dragging === a.id ? ' dragging' : ''}`} draggable
      onDragStart={(e) => { e.dataTransfer.setData('text/plain', a.id); e.dataTransfer.effectAllowed = 'move'; setDragging(a.id) }}
      onDragEnd={() => setDragging(null)}>
      <div className="card-top">
        <span className="avatar co-av" style={coHue(a.company)} aria-hidden="true">{(a.company || '?').charAt(0)}</span>
        <div className="card-main">
          <button type="button" className="card-title" onClick={() => onOpen(a)}>{a.title}</button>
          <p className="card-sub">{a.company}{a.location && <> · {cityName(a.location)}</>}</p>
        </div>
      </div>
      {(iv || (f && f.days <= 2)) && (
        <div className="card-flags">
          {iv && <span className="flag-iv"><Icon name="calendar" size={13} />Interview {fmtWhen(iv)}</span>}
          {f && f.days <= 2 && <span className={`flag-fu${f.days < 0 ? ' late' : ''}`}>{f.days < 0 ? `Follow up (${-f.days}d overdue)` : f.days === 0 ? 'Follow up today' : `Follow up in ${f.days}d`}</span>}
        </div>
      )}
      <div className="card-foot">
        <span>Applied {ago(a.applied_at)}</span>
        <button type="button" className="icon-btn sm" aria-expanded={open} aria-label={`Edit ${a.title}`} onClick={() => setOpen(!open)}>
          <Icon name={open ? 'x' : 'more'} size={15} />
        </button>
      </div>
      {open && (
        <div className="card-edit">
          <label>Stage
            <select className="select" value={a.status} onChange={(e) => onMove(a, e.target.value)}>
              {STATUSES.map((s) => <option key={s}>{s}</option>)}
            </select>
          </label>
          <label>Interview
            <input type="datetime-local" value={toLocalInput(a.interview_at)}
              onChange={(e) => onEdit(a.id, { interview_at: e.target.value ? new Date(e.target.value).toISOString() : null })} />
          </label>
          {a.interview_at && (
            <div className="cal-links">
              <a className="btn btn-ghost btn-sm" href={googleCalendarUrl(a)} target="_blank" rel="noreferrer">Google Calendar</a>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => downloadIcs(a)}>Download .ics</button>
            </div>
          )}
          <label>Follow up on
            <input type="date" value={a.follow_up_on || ''} onChange={(e) => onEdit(a.id, { follow_up_on: e.target.value || null })} />
            {f?.suggested && <small className="hint">Suggested: {fmtDate(f.due)}, ten days after applying.</small>}
          </label>
          <label>Notes
            <textarea rows={2} value={note} placeholder="Recruiter, referral, what they asked…" onChange={(e) => setNote(e.target.value)}
              onBlur={() => note.trim() !== (a.notes || '') && onEdit(a.id, { notes: note.trim() })} />
          </label>
          <div className="card-edit-foot">
            <a className="link" href={a.url} target="_blank" rel="noreferrer">Open listing</a>
            <button type="button" className="link-btn quiet-btn" onClick={() => onRemove(a)}>Remove</button>
          </div>
        </div>
      )}
    </li>
  )
}

function Board({ apps, onMove, ...rest }) {
  const [dragging, setDragging] = useState(null)
  const [over, setOver] = useState(null)
  // the dragged card re-mounts in its new column, so its own dragend may never fire
  useEffect(() => {
    const end = () => { setDragging(null); setOver(null) }
    document.addEventListener('dragend', end); document.addEventListener('drop', end)
    return () => { document.removeEventListener('dragend', end); document.removeEventListener('drop', end) }
  }, [])
  return (
    <div className="board" role="list" aria-label="Application stages">
      {STATUSES.map((s) => {
        const col = apps.filter((a) => a.status === s)
        return (
          <section key={s} role="listitem" className={`col col-${statusKey(s)}${over === s ? ' over' : ''}`} aria-label={`${s}, ${col.length}`}
            onDragOver={(e) => { e.preventDefault(); setOver(s) }} onDragLeave={() => setOver((o) => (o === s ? null : o))}
            onDrop={(e) => { e.preventDefault(); setOver(null); const a = apps.find((x) => x.id === e.dataTransfer.getData('text/plain')); if (a && a.status !== s) onMove(a, s) }}>
            <header className="col-head">
              <i aria-hidden="true" /><h2>{s}</h2><span className="col-n">{col.length}</span>
            </header>
            <p className="col-hint">{HINTS[s]}</p>
            <ul className="col-cards">
              {col.map((a) => <Card key={a.id} a={a} onMove={onMove} dragging={dragging} setDragging={setDragging} {...rest} />)}
              {!col.length && <li className="col-empty">Drop a card here</li>}
            </ul>
          </section>
        )
      })}
    </div>
  )
}

function List({ apps, onMove, onEdit, onOpen, onRemove }) {
  return (
    <div className="table" role="table" aria-label="Applications">
      <div className="tr th" role="row">
        <span role="columnheader">Role</span><span role="columnheader">Applied</span><span role="columnheader">Stage</span><span role="columnheader"><span className="sr">Actions</span></span>
      </div>
      {apps.map((a) => (
        <div key={a.id} className="tr" role="row">
          <div className="td role-cell" role="cell">
            <span className="avatar co-av" style={coHue(a.company)} aria-hidden="true">{(a.company || '?').charAt(0)}</span>
            <div className="app-main">
              <button type="button" className="app-title" onClick={() => onOpen(a)}>{a.title}</button>
              <p className="job-sub"><span className="co">{a.company}</span>{a.location && <><span className="sep" aria-hidden="true" />{cityName(a.location)}</>}<span className="sep" aria-hidden="true" />{shortTerms(a.terms)}</p>
            </div>
          </div>
          <div className="td date-cell" role="cell">{fmtDate(a.applied_at)}<small>{ago(a.applied_at)}</small></div>
          <div className="td" role="cell">
            <label className="sr" htmlFor={`st-${a.id}`}>Stage for {a.title}</label>
            <span className={`status-wrap st-${statusKey(a.status)}`}>
              <select id={`st-${a.id}`} value={a.status} onChange={(e) => onMove(a, e.target.value)}>
                {STATUSES.map((s) => <option key={s}>{s}</option>)}
              </select>
            </span>
          </div>
          <div className="td end" role="cell">
            <button type="button" className="icon-btn" aria-label={`Remove ${a.title}`} title="Remove" onClick={() => onRemove(a)}><Icon name="x" size={16} /></button>
          </div>
        </div>
      ))}
    </div>
  )
}

function exportCsv(apps) {
  const rows = [['Title', 'Company', 'Location', 'Stage', 'Applied', 'Interview', 'Follow up', 'Notes', 'Link'],
    ...apps.map((a) => [a.title, a.company, a.location, a.status, (a.applied_at || '').slice(0, 10), a.interview_at || '', a.follow_up_on || '', a.notes, a.url])]
  const csv = rows.map((r) => r.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\n')
  const link = document.createElement('a')
  link.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
  link.download = `applications-${new Date().toISOString().slice(0, 10)}.csv`
  link.click()
}

export default function Applications() {
  const { apps, loaded, updateApp, removeApp, openJob } = useUserData()
  const [view, setView] = useState(() => { try { return localStorage.getItem('apps-view') || 'board' } catch { return 'board' } })
  const pick = (v) => { setView(v); try { localStorage.setItem('apps-view', v) } catch { /* ignore */ } }
  const onMove = (a, status) => updateApp(a.id, { status, stage_changed_at: new Date().toISOString() })
  const active = apps.filter((a) => !['Offer', 'Rejected'].includes(a.status)).length

  return (
    <main className={`page ${view === 'board' ? 'page-wide' : ''}`}>
      <header className="page-head">
        <div>
          <h1>Applications</h1>
          <p className="sub">{apps.length ? <><strong>{active}</strong> in progress. Drag a card to a new stage as you hear back.</> : 'Track every application from submitted to offer.'}</p>
        </div>
        {apps.length > 0 && (
          <div className="row-gap">
            <div className="seg-ctl" role="radiogroup" aria-label="View">
              {[['board', 'Board'], ['list', 'List']].map(([v, l]) => <button key={v} type="button" role="radio" aria-checked={view === v} className={view === v ? 'on' : ''} onClick={() => pick(v)}>{l}</button>)}
            </div>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => exportCsv(apps)}>Export CSV</button>
          </div>
        )}
      </header>

      {loaded && apps.length === 0 ? (
        <div className="empty-state">
          <h2>No applications yet</h2>
          <p>Open any role and choose Apply. It’s added here so you can track where you stand.</p>
          <Link to="/app" className="btn btn-primary">See your matches</Link>
        </div>
      ) : view === 'board'
        ? <Board apps={apps} onMove={onMove} onEdit={updateApp} onOpen={openJob} onRemove={removeApp} />
        : <List apps={apps} onMove={onMove} onEdit={updateApp} onOpen={openJob} onRemove={removeApp} />}
    </main>
  )
}
