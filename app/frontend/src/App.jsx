import { useEffect, useRef, useState } from 'react'
import { chat, getMeta, searchJobs, setPasscode } from './api.js'
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

function Ticket({ job }) {
  const loc = job.locations[0] || (job.remote ? 'Remote' : 'Location not listed')
  const code = cityCode(loc)
  const posted = postedLabel(job.posted)
  const notes = []
  if (job.sponsorship?.includes('Citizenship')) notes.push({ t: 'US citizens only', warn: true })
  else if (job.sponsorship?.includes('Does Not Offer')) notes.push({ t: 'No visa sponsorship' })
  if (!job.terms.length) notes.push({ t: 'Dates not stated' })
  return (
    <article className="ticket">
      <div className="ticket-stub" aria-hidden="true">
        <span className="code">{code}</span>
        <span className="stub-city">{cityName(loc)}</span>
      </div>
      <div className="ticket-body">
        <h3>{job.title}</h3>
        <p className="company">{job.company}</p>
        <dl className="facts">
          <div><dt>Location</dt><dd>{job.locations.join('; ') || loc}{job.more_locations ? ` +${job.more_locations} more` : ''}</dd></div>
          <div><dt>When</dt><dd>{job.terms.slice(0, 3).join(', ') || 'Not stated'}</dd></div>
          {job.stipend && <div><dt>Stipend</dt><dd>{job.stipend}</dd></div>}
        </dl>
        <div className="ticket-foot">
          <div className="notes">
            {posted && <span>{posted}</span>}
            {notes.map((n) => <span key={n.t} className={n.warn ? 'warn' : ''}>{n.t}</span>)}
          </div>
          {job.fit != null && <span className="fit" title="How well this matches your profile">Fit {job.fit}</span>}
          <a className="apply" href={job.url} target="_blank" rel="noreferrer">Apply<span className="sr"> to {job.title} at {job.company}</span></a>
        </div>
      </div>
    </article>
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
  return `${verb}: ${what} (${s.total ?? 0} found)`
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

  const loadMeta = () =>
    getMeta().then((m) => {
      setMeta(m)
      setNeedCode(false)
      // open the board on the roles the alert agent rated as your best fit
      searchJobs({ fit_only: true, sort: 'fit', limit: 12 })
        .then((r) => setBoard((b) => b || { tool: 'search_internships', ...r, intro: true }))
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
      if (res.last) setBoard(res.last)
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
          <h1>Internship Copilot</h1>
          <label htmlFor="pc">Passcode</label>
          <input id="pc" type="password" value={code} onChange={(e) => setCode(e.target.value)} autoFocus />
          <button type="submit">Unlock</button>
        </form>
      </main>
    )
  }

  const chips = board ? describeArgs(board.args) : []
  return (
    <div className="shell">
      <header className="top">
        <h1>Internship Copilot</h1>
        <p className="fresh">
          {meta ? <>{meta.count.toLocaleString('en-IN')} live listings, updated {meta.updated_human}</> : 'Loading listings…'}
        </p>
      </header>

      <section className="chat" aria-label="Chat">
        <div className="log" ref={logRef} aria-live="polite">
          {messages.length === 0 && (
            <div className="intro">
              <p className="lede">Ask for internships the way you&rsquo;d ask a friend who has read every job board.</p>
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
          {busy && <div className="msg assistant pending"><p>Searching the listings…</p></div>}
        </div>
        {error && <p className="error" role="alert">{error}</p>}
        <form className="composer" onSubmit={(e) => { e.preventDefault(); ask(input) }}>
          <label htmlFor="q" className="sr">Ask about internships</label>
          <textarea id="q" rows={2} value={input} placeholder="e.g. ML internships in Houston that start in June"
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); ask(input) } }} />
          <button type="submit" disabled={busy || !input.trim()}>Ask</button>
        </form>
      </section>

      <section className="board" aria-label="Results">
        <div className="board-head">
          <h2>{!board ? 'Departures' : board.intro ? 'Your best fits right now' : board.tool === 'count_internships' ? 'Breakdown' : `${board.total.toLocaleString('en-IN')} matching ${board.total === 1 ? 'internship' : 'internships'}`}</h2>
          {board?.results && board.total > board.results.length && <p className="showing">Showing top {board.results.length}</p>}
        </div>
        {board?.intro && <p className="showing">Ranked by your alert agent&rsquo;s fit score. Ask a question to search everything.</p>}
        {chips.length > 0 && !board?.intro && (
          <ul className="chips" aria-label="What the search used">
            {chips.map((c, i) => <li key={i}><span>{c.k}</span>{c.v}</li>)}
          </ul>
        )}
        {!board && <p className="empty">Results appear here as tickets. Ask a question to start, or pick one of the examples.</p>}
        {board?.counts && <Counts data={board} />}
        {board?.results && board.results.length === 0 && (
          <p className="empty">Nothing matched those filters. Try a wider area, more role words, or drop the dates.</p>
        )}
        <div className="tickets">
          {board?.results?.map((j) => <Ticket key={j.id} job={j} />)}
        </div>
      </section>
    </div>
  )
}
