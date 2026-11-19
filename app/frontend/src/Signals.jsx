// Job panel: how crowded the role is likely to be, how fresh the listing looks, and when the company opens.
import { useState } from 'react'
import { useWatch } from './lib/watch.js'
import { Icon } from './ui.jsx'

const fmt = (iso, withYear = false) => new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', ...(withYear ? { year: 'numeric' } : {}) })
const LEVELS = ['very_low', 'low', 'fair', 'good']

export function WatchButton({ company, small }) {
  const { has, toggle } = useWatch()
  const [busy, setBusy] = useState(false)
  const on = has(company)
  return (
    <button type="button" className={`btn btn-ghost ${small ? 'btn-sm' : ''} watch-btn${on ? ' on' : ''}`} aria-pressed={on} disabled={busy}
      onClick={async () => { setBusy(true); try { await toggle(company) } finally { setBusy(false) } }}>
      <Icon name={on ? 'check' : 'plus'} size={14} />{on ? 'Watching' : 'Watch company'}
    </button>
  )
}

export function OpeningLine({ o }) {
  if (!o || o.status === 'unknown') return null
  const past = o.history.filter((h) => h.date).slice(-3).map((h) => `${h.cycle - 1}: ${fmt(h.date)}${h.clipped ? ' or earlier' : ''}`)
  let head
  if (o.status === 'open') {
    const d = o.vs_usual_days
    head = <>Opened Summer {o.cycle} roles on <strong>{fmt(o.opened_on)}</strong>{d != null && Math.abs(d) >= 7 && <>, {Math.abs(d)} days {d > 0 ? 'later' : 'earlier'} than usual</>}.</>
  } else if (o.status === 'expected') {
    head = <>Usually opens around <strong>{fmt(o.expected_on)}</strong>, in {o.days_until} day{o.days_until === 1 ? '' : 's'}.</>
  } else if (o.status === 'due') {
    head = <>Usually opens around <strong>{fmt(o.expected_on)}</strong>, so it could open any day now.</>
  } else {
    head = <>Usually opens around <strong>{fmt(o.expected_on)}</strong> but hasn’t this season yet.</>
  }
  return (
    <div className="open-line">
      <Icon name="calendar" size={16} />
      <div>
        <p>{head}</p>
        {past.length > 0 && <p className="open-past">Previous seasons: {past.join(' · ')}{o.confidence === 'low' ? ' (irregular, so treat as a rough guide)' : ''}</p>}
      </div>
    </div>
  )
}

export function Odds({ signals, referred, onReferred, company }) {
  const [how, setHow] = useState(false)
  if (!signals) return null
  const c = signals.competition, f = signals.freshness
  const idx = LEVELS.indexOf(c.level)
  return (
    <section className="jp-sec" aria-labelledby="jp-odds">
      <h3 id="jp-odds">Your odds</h3>
      <div className="odds">
        <div className={`odd odd-${c.level}`}>
          <p className="odd-k">{c.estimated ? 'Applicants so far (estimate)' : 'Applicants so far'}</p>
          <p className="odd-big">{c.low === c.high ? c.low.toLocaleString('en-IN') : <>~{c.low.toLocaleString('en-IN')}–{c.high.toLocaleString('en-IN')}</>}</p>
          <div className="odd-meter" role="img" aria-label={c.text}>
            {LEVELS.map((l, i) => <i key={l} className={i <= idx ? 'on' : ''} />)}
          </div>
          <p className="odd-text">{c.text}</p>
          <label className="ck small odd-ref">
            <input type="checkbox" checked={referred} onChange={(e) => onReferred(e.target.checked)} /><span>I have a referral</span>
          </label>
        </div>
        <div className={`odd fr-${f.level}`}>
          <p className="odd-k">Listing freshness</p>
          <p className="odd-big fr-label"><i aria-hidden="true" />{f.label}</p>
          <div className="fr-bar" aria-hidden="true"><i style={{ '--w': `${f.score}%` }} /></div>
          <ul className="odd-reasons">{f.reasons.map((r, i) => <li key={i} className={r.ok === false ? 'no' : r.ok ? 'ok' : ''}>{r.text}</li>)}</ul>
        </div>
      </div>
      {(c.boosts.length > 0 || c.tips.length > 0) && (
        <ul className="odd-tips">
          {c.boosts.map((b) => <li key={b} className="ok">{b}</li>)}
          {c.tips.map((t) => <li key={t}>{t}</li>)}
        </ul>
      )}
      <button type="button" className="link-btn" aria-expanded={how} onClick={() => setHow(!how)}>{how ? 'Hide' : 'How this is estimated'}</button>
      {how && (
        <div className="odd-how">
          <p>{c.estimated ? 'Job boards don’t publish applicant counts, so this is an estimate from what drives volume: ' : 'Based on the count the listing shows, plus: '}
            {c.factors.join('; ')}; and it has been up for {c.age_days} day{c.age_days === 1 ? '' : 's'}.</p>
          <p>Recruiters usually read applications in the order they arrive and stop once they have enough to interview, so being early, a strong fit and referred are what move your odds.</p>
        </div>
      )}
      {signals.opening && signals.opening.status !== 'unknown' && (
        <div className="odd-open">
          <OpeningLine o={signals.opening} />
          <WatchButton company={company} small />
        </div>
      )}
    </section>
  )
}
