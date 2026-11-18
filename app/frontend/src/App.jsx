import { useEffect, useMemo, useRef, useState } from 'react'
import { chat, getMap, getMeta, searchJobs, setPasscode } from './api.js'
import { cityName, describeArgs, postedLabel } from './format.js'
import WorldMap from './WorldMap.jsx'

const SUGGESTIONS = [
  'Backend roles in Austin or Dallas this summer',
  'Remote ML internships, January to June',
  'Best fits for me in the Bay Area',
  'Who’s hiring most in Texas?',
  'AI internships in Bangalore',
  'Posted in the last 3 days',
]

// Safe renderer for **bold** and "- " bullets in AI replies.
function RichText({ text }) {
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

function shortTerms(terms) {
  if (!terms?.length) return 'Dates not stated'
  const t = terms.map((x) => x.replace(/^(Winter|Spring|Summer|Fall) \d{2}(\d{2})$/, (_, s, y) => `${s} ’${y}`))
  return t.length > 2 ? `${t[0]} + ${t.length - 1} more` : t.join(', ')
}

function FitRing({ value }) {
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

function JobRow({ job, onFocus }) {
  const city = cityName(job.locations[0] || (job.remote ? 'Remote' : ''))
  const more = job.locations.length - 1 + (job.more_locations || 0)
  const posted = postedLabel(job.posted)
  const flag = job.sponsorship?.includes('Citizenship') ? 'US citizens only' : null
  const fresh = posted === 'Posted today' || posted === 'Posted yesterday'
  return (
    <li className="job" onMouseEnter={() => onFocus?.(job.id)} onMouseLeave={() => onFocus?.(null)}
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
      <a className="apply" href={job.url} target="_blank" rel="noreferrer">
        Apply<span className="sr"> to {job.title} at {job.company} (opens in a new tab)</span>
      </a>
    </li>
  )
}

function Results({ data, onFocus, limit = 5 }) {
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
        : <ul className="jobs">{shown.map((j) => <JobRow key={j.id} job={j} onFocus={onFocus} />)}</ul>}
      {data.results.length > limit && (
        <button type="button" className="more" onClick={() => setOpen(!open)} aria-expanded={open}>
          {open ? 'Show fewer' : `Show ${data.results.length - limit} more`}
        </button>
      )}
    </div>
  )
}

const toPins = (results = []) =>
  results.flatMap((j) => (j.pins || []).map(([lat, lng]) => ({ lat, lng, key: j.id })))

export default function App() {
  const [meta, setMeta] = useState(null)
  const [mapData, setMapData] = useState({ cities: [], home: null })
  const [picks, setPicks] = useState(null)
  const [needCode, setNeedCode] = useState(false)
  const [code, setCode] = useState('')
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [focus, setFocus] = useState(null)
  const endRef = useRef(null)
  const inputRef = useRef(null)

  const loadMeta = () =>
    getMeta().then((m) => {
      setMeta(m)
      setNeedCode(false)
      getMap().then(setMapData).catch(() => {})
      searchJobs({ fit_only: true, sort: 'fit', limit: 6 }).then(setPicks).catch(() => {})
    }).catch((e) => {
      if (e.status === 401) setNeedCode(true)
      else setError('The server is waking up. Try again in about 30 seconds.')
    })
  useEffect(() => { loadMeta() }, [])
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }) }, [messages, busy])

  const lastResults = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) if (messages[i].last?.results) return messages[i].last.results
    return null
  }, [messages])
  const pins = useMemo(() => toPins(lastResults || (messages.length ? [] : picks?.results)), [lastResults, picks, messages.length])

  async function ask(text) {
    const q = text.trim()
    if (!q || busy) return
    const next = [...messages, { role: 'user', content: q }]
    setMessages(next)
    setInput('')
    setError('')
    setBusy(true)
    try {
      const res = await chat(next.map(({ role, content }) => ({ role, content })))
      setMessages([...next, { role: 'assistant', content: res.reply || 'Done.', last: res.last }])
      if (res.meta) setMeta((m) => ({ ...m, ...res.meta }))
    } catch (e) {
      if (e.status === 401) setNeedCode(true)
      setError(e.message)
      setMessages(messages)
      setInput(q)
    } finally {
      setBusy(false)
      inputRef.current?.focus()
    }
  }

  if (needCode) {
    return (
      <main className="gate">
        <form onSubmit={(e) => { e.preventDefault(); setPasscode(code); loadMeta() }}>
          <h1>Internship Copilot</h1>
          <label htmlFor="pc">Passcode</label>
          <div className="gate-row">
            <input id="pc" type="password" value={code} onChange={(e) => setCode(e.target.value)} autoFocus />
            <button type="submit">Unlock</button>
          </div>
        </form>
      </main>
    )
  }

  const home = messages.length === 0
  const composer = (
    <form className="composer" onSubmit={(e) => { e.preventDefault(); ask(input) }}>
      <label htmlFor="q" className="sr">Ask about internships</label>
      <textarea id="q" ref={inputRef} rows={1} value={input}
        placeholder={home ? 'Try “ML internships in Houston that start in June”' : 'Ask a follow-up…'}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); ask(input) } }} />
      <button type="submit" disabled={busy || !input.trim()} aria-label="Send">
        <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 15V5M5.5 9.5 10 5l4.5 4.5" /></svg>
      </button>
    </form>
  )
  const nCities = mapData.cities.length
  const map = (
    <WorldMap cities={mapData.cities} home={mapData.home} pins={pins} focus={focus} compact={!home}
      onCity={(c) => ask(`Internships in ${c}`)} />
  )

  return (
    <div className={`app ${home ? 'is-home' : 'is-thread'}`}>
      <header className="top">
        <span className="wordmark"><span className="logo" aria-hidden="true" />Internship Copilot</span>
        {meta && <span className="live"><span className="dot" aria-hidden="true" />Live, updated {meta.updated_human.replace(/^\d+ \w+ \d{4}, /, '')}</span>}
      </header>

      {home ? (
        <main className="home">
          <section className="hero">
            {map}
            <div className="hero-copy">
              <h1>Where will you<br />intern next?</h1>
              <p className="stats">
                <span><strong>{meta ? meta.count.toLocaleString('en-IN') : '—'}</strong> open internships</span>
                <span><strong>{nCities || '—'}</strong> cities</span>
                <span><strong>15 min</strong> refresh</span>
              </p>
            </div>
            <div className="legend" aria-hidden="true">
              <span><i className="lg-home" />You, Bangalore</span>
              <span><i className="lg-dest" />Open roles</span>
            </div>
          </section>
          <div className="ask">
            {composer}
            {error && <p className="error" role="alert">{error}</p>}
            <ul className="suggest">
              {SUGGESTIONS.map((s) => <li key={s}><button type="button" onClick={() => ask(s)}>{s}</button></li>)}
            </ul>
          </div>
          {picks?.results?.length > 0 && (
            <section className="picks" aria-labelledby="picks-h">
              <div className="section-head">
                <h2 id="picks-h">Picked for you</h2>
                <p>Your strongest matches right now, ranked by the alert agent. Hover one to see it on the map.</p>
              </div>
              <Results data={{ results: picks.results }} onFocus={setFocus} limit={6} />
            </section>
          )}
        </main>
      ) : (
        <>
          <div className="band">{map}</div>
          <main className="thread">
            {messages.map((m, i) => (
              <article key={i} className={`turn ${m.role}`}>
                {m.role === 'user' ? <p className="q">{m.content}</p> : (
                  <>
                    <div className="a"><RichText text={m.content} /></div>
                    <Results data={m.last} onFocus={setFocus} />
                  </>
                )}
              </article>
            ))}
            {busy && <article className="turn assistant"><p className="thinking"><span /><span /><span /><span className="sr">Searching</span></p></article>}
            {error && <p className="error" role="alert">{error}</p>}
            <div ref={endRef} />
            <div className="dock">{composer}</div>
          </main>
        </>
      )}
    </div>
  )
}
