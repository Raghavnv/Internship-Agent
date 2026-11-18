import { useState } from 'react'
import { cityName, describeArgs, postedLabel } from './format.js'

// Safe renderer for **bold** and "- " bullets in AI replies.
export function RichText({ text }) {
  const inline = (s, key) =>
    s.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
      part.startsWith('**') && part.endsWith('**') ? <strong key={`${key}-${i}`}>{part.slice(2, -2)}</strong> : part)
  const blocks = []
  let list = []
  text.split('\n').forEach((line, i) => {
    const m = line.match(/^\s*(?:[-*•]|\d+\.)\s+(.*)/)
    if (m) { list.push(<li key={i}>{inline(m[1], i)}</li>); return }
    if (list.length) { blocks.push(<ul key={`u${i}`}>{list}</ul>); list = [] }
    if (line.trim()) blocks.push(<p key={i}>{inline(line, i)}</p>)
  })
  if (list.length) blocks.push(<ul key="u-end">{list}</ul>)
  return <>{blocks}</>
}

export function shortTerms(terms) {
  if (!terms?.length) return 'Dates not stated'
  const t = terms.map((x) => x.replace(/^(Winter|Spring|Summer|Fall) \d{2}(\d{2})$/, (_, s, y) => `${s} ’${y}`))
  return t.length > 2 ? `${t[0]} + ${t.length - 1} more` : t.join(', ')
}

export function FitRing({ value }) {
  if (value == null) return <span className="fit-none" aria-hidden="true" />
  const r = 15, c = 2 * Math.PI * r
  return (
    <span className="fit" title="How well this matches your profile">
      <svg viewBox="0 0 36 36" aria-hidden="true">
        <circle cx="18" cy="18" r={r} className="ring-bg" />
        <circle cx="18" cy="18" r={r} className="ring" strokeDasharray={c} strokeDashoffset={c * (1 - value / 100)} />
      </svg>
      <span className="fit-num">{value}</span>
      <span className="sr">fit score out of 100</span>
    </span>
  )
}

const Check = () => (
  <svg viewBox="0 0 16 16" aria-hidden="true" className="ico"><path d="M3.5 8.5 6.5 11.5 12.5 5" /></svg>
)

export function JobRow({ job, onFocus, applied, onApply }) {
  const city = cityName(job.locations[0] || (job.remote ? 'Remote' : ''))
  const more = job.locations.length - 1 + (job.more_locations || 0)
  const posted = postedLabel(job.posted)
  const flag = job.sponsorship?.includes('Citizenship') ? 'US citizens only' : null
  const fresh = posted === 'Posted today' || posted === 'Posted yesterday'
  return (
    <li className={`job${applied ? ' is-applied' : ''}`} onMouseEnter={() => onFocus?.(job.id)} onMouseLeave={() => onFocus?.(null)}
      onFocus={() => onFocus?.(job.id)} onBlur={() => onFocus?.(null)}>
      <span className="avatar" aria-hidden="true">{(job.company || '?').trim().charAt(0)}</span>
      <div className="job-main">
        <h3>{job.title}</h3>
        <p className="job-sub">
          <span className="co">{job.company}</span>
          <span className={`pin${job.pins?.length ? '' : ' pin-off'}`} aria-hidden="true" />
          {city || 'Location not listed'}{more > 0 ? <span className="more-loc"> +{more}</span> : ''}
        </p>
        <p className="job-meta">
          <span>{shortTerms(job.terms)}</span>
          {posted && <span className={fresh ? 'fresh' : ''}>{posted}</span>}
          {job.stipend && <span>{job.stipend}</span>}
          {flag && <span className="flag">{flag}</span>}
        </p>
      </div>
      <FitRing value={job.fit} />
      <a className={`apply${applied ? ' done' : ''}`} href={job.url} target="_blank" rel="noreferrer"
        onClick={() => { if (!applied) onApply?.(job) }}>
        {applied ? <><Check />Applied</> : 'Apply'}
        <span className="sr"> {applied ? '(saved in My applications), open' : 'to'} {job.title} at {job.company} (opens in a new tab)</span>
      </a>
    </li>
  )
}

export function Results({ data, onFocus, limit = 5, applied, onApply }) {
  const [open, setOpen] = useState(false)
  if (!data) return null
  if (data.counts) {
    const max = Math.max(...data.counts.map((c) => c[1]), 1)
    return (
      <div className="result counts">
        <ol>
          {data.counts.slice(0, 10).map(([name, n]) => (
            <li key={name}>
              <span className="cname">{name}</span>
              <span className="bar"><span style={{ width: `${(n / max) * 100}%` }} /></span>
              <span className="cnum">{n}</span>
            </li>
          ))}
        </ol>
      </div>
    )
  }
  const shown = open ? data.results : data.results.slice(0, limit)
  const chips = data.args ? describeArgs(data.args) : []
  return (
    <div className="result">
      {chips.length > 0 && (
        <ul className="chips" aria-label="Filters used">
          {chips.map((c, i) => <li key={i} title={c.k}>{c.v}</li>)}
        </ul>
      )}
      {data.results.length === 0
        ? <p className="quiet">Nothing matched. Try a wider area or fewer filters.</p>
        : <ul className="jobs">{shown.map((j) => (
          <JobRow key={j.id} job={j} onFocus={onFocus} applied={applied?.(j.id)} onApply={onApply} />
        ))}</ul>}
      {data.results.length > limit && (
        <button type="button" className="more" onClick={() => setOpen(!open)} aria-expanded={open}>
          {open ? 'Show fewer' : `Show ${data.results.length - limit} more`}
        </button>
      )}
    </div>
  )
}
