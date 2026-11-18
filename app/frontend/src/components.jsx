import { useState } from 'react'
import { cityName, describeArgs, postedLabel } from './format.js'
import { Icon } from './ui.jsx'
import { useUserData } from './lib/userdata.jsx'

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

// A stable hue per company, so each initial gets its own quiet colour.
export function coHue(name = '') {
  let h = 0
  for (const ch of name.toLowerCase()) h = (h * 31 + ch.charCodeAt(0)) % 360
  return { '--h': h }
}

export function FitRing({ value }) {
  if (value == null) return <span className="fit-none" aria-hidden="true" />
  const tier = value >= 80 ? 'hi' : value >= 60 ? 'mid' : 'lo'
  return (
    <span className={`fit ${tier}`} title="How well this matches your profile, out of 100">
      <span className="fit-num">{value}</span>
      <span className="fit-bar" aria-hidden="true"><i style={{ width: `${value}%` }} /></span>
      <span className="sr">fit score out of 100</span>
    </span>
  )
}

export function JobRow({ job, onFocus }) {
  const data = useUserData()
  const city = cityName(job.locations?.[0] || (job.remote ? 'Remote' : ''))
  const more = (job.locations?.length || 0) - 1 + (job.more_locations || 0)
  const posted = postedLabel(job.posted)
  const flag = job.sponsorship?.includes('Citizenship') ? 'US citizens only'
    : job.sponsorship?.includes('Does Not Offer') ? 'No sponsorship' : null
  const fresh = posted === 'Posted today' || posted === 'Posted yesterday'
  const applied = data?.isApplied?.(job.id)
  const saved = data?.isSaved?.(job.id)
  const open = data?.viewing && (data.viewing.id || data.viewing.job_id) === job.id
  return (
    <li onMouseEnter={() => onFocus?.(job.id)} onMouseLeave={() => onFocus?.(null)}>
      <button type="button" className={`job${open ? ' open' : ''}`} onClick={() => data?.openJob?.(job)}
        onFocus={() => onFocus?.(job.id)} onBlur={() => onFocus?.(null)} aria-label={`${job.title} at ${job.company}. Open details`}>
        <span className="avatar co-av" style={coHue(job.company)} aria-hidden="true">{(job.company || '?').trim().charAt(0)}</span>
        <span className="job-main">
          <span className="job-title">{job.title}</span>
          <span className="job-sub">
            <span className="co">{job.company}</span><span className="sep" aria-hidden="true" />
            {city || 'Location not listed'}{more > 0 && <span className="more-loc"> +{more}</span>}
          </span>
          <span className="job-meta">
            <span>{shortTerms(job.terms)}</span>
            {posted && <span className={fresh ? 'fresh' : ''}>{posted}</span>}
            {job.stipend && <span>{job.stipend}</span>}
            {flag && <span className="flag">{flag}</span>}
          </span>
        </span>
        <span className="job-marks">
          {applied && <span className="mark applied">Applied</span>}
          {saved && !applied && <span className="mark saved" title="Saved"><Icon name="saved" size={14} /><span className="sr">Saved</span></span>}
        </span>
        <FitRing value={job.fit} />
      </button>
    </li>
  )
}

export function Results({ data, onFocus, limit = 5, empty, showChips = true }) {
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
  const chips = showChips && data.args ? describeArgs(data.args) : []
  return (
    <div className="result">
      {chips.length > 0 && (
        <ul className="chips" aria-label="Filters used">
          {chips.map((c, i) => <li key={i} title={c.k}>{c.v}</li>)}
        </ul>
      )}
      {data.results.length === 0
        ? <p className="quiet">{empty || 'Nothing matched. Try a wider area or fewer filters.'}</p>
        : <ul className="jobs">{shown.map((j) => (
          <JobRow key={j.id} job={j} onFocus={onFocus} />
        ))}</ul>}
      {data.results.length > limit && (
        <button type="button" className="more" onClick={() => setOpen(!open)} aria-expanded={open}>
          {open ? 'Show fewer' : `Show ${data.results.length - limit} more`}
        </button>
      )}
    </div>
  )
}
