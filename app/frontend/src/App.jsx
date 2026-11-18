import { useEffect, useRef, useState } from 'react'
import { chat, getMeta, searchJobs, setPasscode } from './api.js'
import Flap from './Flap.jsx'
import { cityCode, cityName, describeArgs, postedLabel } from './format.js'

const EXAMPLES = [
  'Backend or full stack internships in Austin or Dallas for summer 2027',
  'Remote machine learning internships I could do between January and June',
  'Best fits for me in the Bay Area, newest first',
  'Which companies have the most openings in Texas?',
  'AI internships in Bangalore',
  'Software roles posted in the last 3 days that don’t need a Master’s',
]

// Tiny, safe renderer for **bold** and "- " bullets in AI replies (no HTML injection).
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

function useClock() {
  const fmt = () => new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' }).format(new Date())
  const [t, setT] = useState(fmt)
  useEffect(() => { const id = setInterval(() => setT(fmt()), 15000); return () => clearInterval(id) }, [])
  return t
}

function shortTerms(terms) {
  if (!terms.length) return null
  const t = terms.map((x) => x.replace(/^(Winter|Spring|Summer|Fall) \d{2}(\d{2})$/, (_, s, y) => `${s} ’${y}`))
  return t.length > 2 ? `${t[0]} +${t.length - 1}` : t.join(', ')
}

function Row({ job, index }) {
  const loc = job.locations[0] || (job.remote ? 'Remote' : '')
  const code = cityCode(loc || 'TBA')
  const posted = postedLabel(job.posted)
  const note = job.sponsorship?.includes('Citizenship') ? { t: 'US citizens only', warn: true }
    : job.sponsorship?.includes('Does Not Offer') ? { t: 'No visa sponsorship' } : null
  const fresh = posted === 'Posted today' || posted === 'Posted yesterday'
  const others = job.locations.slice(1).map(cityName)
  return (
    <li className="row">
      <div className="cell-code">
        <Flap text={code.padEnd(3, ' ').slice(0, 3)} size="md" label={cityName(loc) || 'Location not listed'} startDelay={Math.min(index, 8) * 70} />
        <span className="code-city">{cityName(loc) || 'TBA'}</span>
      </div>
      <div className="cell-role">
        <h3>{job.title}</h3>
        <p>
          <span className="co">{job.company}</span>
          {(others.length > 0 || job.more_locations > 0) && (
            <span className="also">{others.length ? `, also ${others.join(', ')}` : ''}{job.more_locations ? `${others.length ? ' and' : ','} ${job.more_locations} more ${job.more_locations === 1 ? 'city' : 'cities'}` : ''}</span>
          )}
        </p>
        {(note || job.stipend) && (
          <p className="row-notes">
            {job.stipend && <span>{job.stipend}</span>}
            {note && <span className={note.warn ? 'warn' : ''}>{note.t}</span>}
          </p>
        )}
      </div>
      <div className="cell-when">
        <span className="k">When</span>
        <span className={shortTerms(job.terms) ? '' : 'dim'}>{shortTerms(job.terms) || 'Not stated'}</span>
      </div>
      <div className="cell-posted">
        <span className="k">Posted</span>
        <span className={fresh ? 'fresh-dot' : ''}>{posted ? posted.replace('Posted ', '') : '—'}</span>
      </div>
      <div className="cell-fit">
        <span className="k">Fit</span>
        {job.fit != null ? <span className="fit" title="How well this matches your profile">{job.fit}</span> : <span className="dim">{'—'}</span>}
      </div>
      <div className="cell-go">
        <a className="apply" href={job.url} target="_blank" rel="noreferrer">
          Apply<span className="sr"> to {job.title} at {job.company} (opens in a new tab)</span>
        </a>
      </div>
    </li>
  )
}

function Counts({ data }) {
  const max = Math.max(...data.counts.map((c) => c[1]), 1)
  const label = { company: 'Companies', city: 'Cities', country: 'Countries', category: 'Fields', term: 'Terms' }[data.group_by]
  return (
    <div className="counts">
      <h3>{label} with the most matching roles</h3>
      <ol>
        {data.counts.map(([name, n]) => (
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

function stepText(s) {
  const what = describeArgs(s.args).map((c) => c.v).join(', ') || 'all listings'
  const verb = s.tool === 'count_internships' ? 'Counted' : 'Searched'
  return `${verb} ${what}: ${s.total ?? 0} found`
}

export default function App() {
  const [meta, setMeta] = useState(null)
  const [needCode, setNeedCode] = useState(false)
  const [code, setCode] = useState('')
  const [messages, setMessages] = useState([])
  const [board, setBoard] = useState(null)
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const logRef = useRef(null)
  const clock = useClock()

  const loadMeta = () =>
    getMeta().then((m) => {
      setMeta(m)
      setNeedCode(false)
      searchJobs({ fit_only: true, sort: 'fit', limit: 12 })
        .then((r) => setBoard((b) => b || { tool: 'search_internships', ...r, intro: true, key: 'intro' }))
        .catch(() => {})
    }).catch((e) => {
      if (e.status === 401) setNeedCode(true)
      else setError('Can’t reach the server. It may be waking up; try again in 30 seconds.')
    })
  useEffect(() => { loadMeta() }, [])
  useEffect(() => { logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: 'smooth' }) }, [messages, busy])

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
      setMessages([...next, { role: 'assistant', content: res.reply || 'Done.', steps: res.steps }])
      if (res.last) setBoard({ ...res.last, key: Date.now() })
      if (res.meta) setMeta((m) => ({ ...m, ...res.meta }))
    } catch (e) {
      if (e.status === 401) setNeedCode(true)
      setError(e.message)
      setMessages(messages)
      setInput(q)
    } finally {
      setBusy(false)
    }
  }

  if (needCode) {
    return (
      <main className="gate">
        <form onSubmit={(e) => { e.preventDefault(); setPasscode(code); loadMeta() }}>
          <Flap text="GATE" size="lg" label="Internship Copilot" />
          <label htmlFor="pc">Enter the passcode to board</label>
          <input id="pc" type="password" value={code} onChange={(e) => setCode(e.target.value)} autoFocus />
          <button type="submit">Unlock</button>
        </form>
      </main>
    )
  }

  const chips = board && !board.intro ? describeArgs(board.args) : []
  const total = board?.total ?? 0
  const title = !board ? 'Departures' : board.intro ? 'Your best fits right now'
    : board.tool === 'count_internships' ? 'Breakdown' : 'Departures'
  return (
    <div className="shell">
      <header className="top">
        <div className="brand">
          <span className="mark" aria-hidden="true" />
          <h1>Internship Copilot</h1>
        </div>
        <p className="fresh">
          {meta ? <>{meta.count.toLocaleString('en-IN')} live listings, refreshed {meta.updated_human.replace(/^\d+ \w+ \d{4}, /, '')}</> : 'Loading listings…'}
        </p>
        <div className="clock" title="Bangalore time">
          <Flap text={clock.replace(':', '')} size="sm" label={`Bangalore time ${clock}`} stagger={30} />
          <span className="tz">BLR</span>
        </div>
      </header>

      <section className="console" aria-label="Chat">
        <div className="log" ref={logRef} aria-live="polite">
          {messages.length === 0 && (
            <div className="intro">
              <p className="lede">Where do you want to intern next?</p>
              <p className="sub">Ask in plain words. I search every live listing and put the matches on the board.</p>
              <ul className="examples">
                {EXAMPLES.map((ex) => (
                  <li key={ex}><button type="button" onClick={() => ask(ex)}>{ex}</button></li>
                ))}
              </ul>
            </div>
          )}
          {messages.map((m, i) => (
            <div key={i} className={`msg ${m.role}`}>
              {m.role === 'assistant' ? <RichText text={m.content} /> : <p>{m.content}</p>}
              {m.steps?.length > 0 && (
                <ul className="steps">{m.steps.map((s, j) => <li key={j}>{stepText(s)}</li>)}</ul>
              )}
            </div>
          ))}
          {busy && <div className="msg assistant pending"><p>Checking the board{'…'}</p></div>}
        </div>
        {error && <p className="error" role="alert">{error}</p>}
        <form className="composer" onSubmit={(e) => { e.preventDefault(); ask(input) }}>
          <label htmlFor="q" className="sr">Ask about internships</label>
          <textarea id="q" rows={2} value={input} placeholder="ML internships in Houston that start in June"
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); ask(input) } }} />
          <button type="submit" disabled={busy || !input.trim()}>Ask</button>
        </form>
      </section>

      <section className="board" aria-label="Results">
        <div className="board-head">
          <div className="board-title">
            <h2>{title}</h2>
            {board?.results && !board.intro && (
              <p className="tally">
                <Flap key={board.key} text={String(total).padStart(3, ' ')} size="sm" label={`${total} matching`} />
                <span>{total === 1 ? 'internship matches' : 'internships match'}{board.total > board.results.length ? `, top ${board.results.length} shown` : ''}</span>
              </p>
            )}
            {board?.intro && <p className="tally-text">Ranked by your alert agent&rsquo;s fit score. Ask anything to search all {meta?.count.toLocaleString('en-IN')}.</p>}
          </div>
          {chips.length > 0 && (
            <ul className="chips" aria-label="What the search used">
              {chips.map((c, i) => <li key={i}><span>{c.k}</span>{c.v}</li>)}
            </ul>
          )}
        </div>

        {!board && <p className="empty">The board fills in when you ask a question.</p>}
        {board?.counts && <Counts data={board} />}
        {board?.results && board.results.length === 0 && (
          <p className="empty">No departures match that. Try a wider area, more role words, or drop the dates.</p>
        )}
        {board?.results?.length > 0 && (
          <>
            <div className="cols" aria-hidden="true">
              <span>To</span><span>Role</span><span>When</span><span>Posted</span><span>Fit</span><span />
            </div>
            <ol className="rows" key={board.key}>
              {board.results.map((j, i) => <Row key={j.id} job={j} index={i} />)}
            </ol>
          </>
        )}
      </section>
    </div>
  )
}
