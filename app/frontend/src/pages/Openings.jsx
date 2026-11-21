// When companies open their internships, predicted from the last few seasons of listings.
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { getOpenings } from '../lib/api.js'
import { useWatch } from '../lib/watch.js'
import { SkeletonRows } from '../charts.jsx'
import { OpeningLine, WatchButton } from '../Signals.jsx'
import { coHue } from '../components.jsx'
import { Icon } from '../ui.jsx'

const day = (iso) => new Date(iso).toLocaleDateString('en-IN', { day: 'numeric' })
const mon = (iso) => new Date(iso).toLocaleDateString('en-IN', { month: 'short' })
const fmt = (iso) => new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })

function when(o) {
  if (o.status === 'open') return { cls: 'open', text: `Open since ${fmt(o.opened_on)}` }
  if (o.status === 'due') return { cls: 'due', text: 'Due now' }
  if (o.status === 'late') return { cls: 'late', text: `Usually by ${fmt(o.expected_on)}` }
  if (o.status === 'expected') return { cls: 'soon', text: o.days_until === 0 ? 'Expected today' : `In ${o.days_until} day${o.days_until === 1 ? '' : 's'}` }
  return { cls: 'none', text: 'No history yet' }
}

function SoonRow({ o }) {
  const w = when(o)
  return (
    <li className="op-row">
      <div className={`op-date ${w.cls}`} aria-hidden="true"><b>{day(o.expected_on)}</b><span>{mon(o.expected_on)}</span></div>
      <div className="op-main">
        <p className="op-co">{o.company}{o.confidence === 'high' && <span className="op-conf" title="Opened within three weeks of the same date in recent seasons">Regular</span>}</p>
        <p className="op-past">{o.history.slice(-3).map((h) => `${h.cycle - 1}: ${fmt(h.date)}`).join(' · ')}</p>
      </div>
      <span className={`op-when ${w.cls}`}>{w.text}</span>
      <WatchButton company={o.company} small />
    </li>
  )
}

export default function Openings() {
  const watch = useWatch()
  const [data, setData] = useState(null)
  const [err, setErr] = useState('')
  const [q, setQ] = useState('')
  const [look, setLook] = useState(null)
  const watchKey = watch.list.join('|')

  useEffect(() => { getOpenings(watch.list).then(setData).catch((e) => setErr(e.message)) }, [watchKey])

  async function lookup(e) {
    e.preventDefault()
    if (!q.trim()) return
    setLook('loading')
    try { const r = await getOpenings([q.trim()]); setLook(r.watching[0]) } catch (er) { setLook({ error: er.message }) }
  }

  const groups = useMemo(() => {
    const g = { due: [], week: [], fortnight: [], later: [] }
    for (const o of data?.soon || []) {
      if (o.days_until < 0) g.due.push(o)
      else if (o.days_until <= 7) g.week.push(o)
      else if (o.days_until <= 21) g.fortnight.push(o)
      else g.later.push(o)
    }
    return g
  }, [data])

  return (
    <main className="page page-wide">
      <header className="page-head">
        <div>
          <h1>Opening soon</h1>
          <p className="sub">When companies open their Summer {data?.cycle || ''} internships, predicted from when they opened in past seasons. Being in the first few days of a posting makes the biggest difference.</p>
        </div>
      </header>

      <form className="op-look" onSubmit={lookup}>
        <Icon name="explore" size={16} />
        <label htmlFor="op-q" className="sr">Look up a company</label>
        <input id="op-q" value={q} onChange={(e) => setQ(e.target.value)} placeholder="When does Stripe open? Type a company" />
        <button type="submit" className="btn btn-ghost btn-sm" disabled={!q.trim()}>Look up</button>
      </form>
      {look && look !== 'loading' && (
        <div className="op-result">
          {look.error ? <p className="form-error">{look.error}</p> : look.status === 'unknown'
            ? <p className="quiet">No past openings on record for “{look.company}”. Try the exact company name.</p>
            : <><OpeningLine o={look} /><div className="row-gap"><WatchButton company={look.company} small />
              {look.open_roles > 0 && <Link className="btn btn-ghost btn-sm" to={`/app/explore?company=${encodeURIComponent(look.company)}`}>See {look.open_roles} open role{look.open_roles === 1 ? '' : 's'}</Link>}</div></>}
        </div>
      )}

      {err && <p className="form-error">{err}</p>}
      {!data && !err && <SkeletonRows n={6} />}

      {data && (
        <div className="op-grid">
          <div>
            {data.watching.length > 0 && (
              <section className="op-sec" aria-labelledby="w-h">
                <h2 id="w-h">Watching</h2>
                <ul className="op-list">
                  {data.watching.map((o) => {
                    const w = when(o)
                    return (
                      <li key={o.company} className="op-row">
                        <span className="avatar co-av" style={coHue(o.company)} aria-hidden="true">{o.company.charAt(0)}</span>
                        <div className="op-main">
                          <p className="op-co">{o.company}</p>
                          {o.expected_on && o.status !== 'open' && <p className="op-past">Usually around {fmt(o.expected_on)}</p>}
                          {o.status === 'open' && o.open_roles > 0 && <p className="op-past"><Link to={`/app/explore?company=${encodeURIComponent(o.company)}`}>{o.open_roles} open role{o.open_roles === 1 ? '' : 's'}</Link></p>}
                        </div>
                        <span className={`op-when ${w.cls}`}>{w.text}</span>
                        <button type="button" className="icon-btn" aria-label={`Stop watching ${o.company}`} onClick={() => watch.toggle(o.company)}><Icon name="x" size={15} /></button>
                      </li>
                    )
                  })}
                </ul>
              </section>
            )}

            {[['due', 'Usually open by now', 'These opened around now in past seasons but haven’t yet. Could be any day.'],
              ['week', 'This week', null], ['fortnight', 'In the next three weeks', null], ['later', 'Later', null]].map(([k, title, note]) =>
              groups[k].length > 0 && (
                <section key={k} className="op-sec" aria-label={title}>
                  <h2>{title}</h2>
                  {note && <p className="op-note">{note}</p>}
                  <ul className="op-list">{groups[k].map((o) => <SoonRow key={o.company} o={o} />)}</ul>
                </section>
              ))}
            {!data.soon.length && <p className="quiet pad">No companies are due to open in the next two months.</p>}
          </div>

          <aside className="op-side" aria-labelledby="jo-h">
            <h2 id="jo-h">Just opened</h2>
            <p className="op-note">First Summer {data.cycle} postings in the last three weeks.</p>
            <ul className="op-opened">
              {data.opened.slice(0, 18).map((o) => (
                <li key={o.company}>
                  <Link to={`/app/explore?company=${encodeURIComponent(o.company)}`}>
                    <span className="avatar co-av" style={coHue(o.company)} aria-hidden="true">{o.company.charAt(0)}</span>
                    <span className="oo-main"><strong>{o.company}</strong><span>{fmt(o.opened_on)} · {o.open_roles} role{o.open_roles === 1 ? '' : 's'}</span></span>
                    {o.vs_usual_days != null && Math.abs(o.vs_usual_days) >= 7 && <span className={`oo-vs ${o.vs_usual_days > 0 ? 'late' : 'early'}`}>{Math.abs(o.vs_usual_days)}d {o.vs_usual_days > 0 ? 'late' : 'early'}</span>}
                  </Link>
                </li>
              ))}
            </ul>
          </aside>
        </div>
      )}
    </main>
  )
}
