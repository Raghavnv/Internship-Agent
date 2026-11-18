import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { chat, getMap, getMeta, searchJobs, setPasscode } from './api.js'
import { useApplications } from './applications.js'
import { RichText, Results } from './components.jsx'
import HowItWorks from './HowItWorks.jsx'
import Tracker from './Tracker.jsx'
import WorldMap from './WorldMap.jsx'

const SUGGESTIONS = [
  'Backend roles in Austin or Dallas this summer',
  'Remote ML internships, January to June',
  'Best fits for me in the Bay Area',
  'Who’s hiring most in Texas?',
  'AI internships in Bangalore',
  'Posted in the last 3 days',
]

// The places you said you'd go, and the map cities that make them up.
const MY_CITIES = [
  { name: 'Austin', ask: 'Internships in Austin that fit me', match: ['Austin', 'Round Rock', 'Cedar Park', 'Pflugerville'] },
  { name: 'Dallas', ask: 'Internships in the Dallas area that fit me', match: ['Dallas', 'Irving', 'Plano', 'Frisco', 'Richardson', 'Addison', 'Fort Worth', 'Coppell', 'Carrollton', 'McKinney', 'Allen'] },
  { name: 'Houston', ask: 'Internships in Houston that fit me', match: ['Houston', 'Sugar Land', 'The Woodlands', 'Katy', 'Spring'] },
  { name: 'Bay Area', ask: 'Best fits for me in the Bay Area', match: ['San Francisco', 'South San Francisco', 'San Jose', 'Santa Clara', 'Sunnyvale', 'Mountain View', 'Palo Alto', 'Menlo Park', 'Cupertino', 'Redwood City', 'San Mateo', 'Foster City', 'Fremont', 'Milpitas', 'Oakland', 'Berkeley', 'Emeryville', 'Burlingame', 'San Bruno', 'Los Altos', 'Pleasanton', 'Los Gatos', 'Campbell'] },
  { name: 'Bangalore', ask: 'Internships in Bangalore that fit me', match: ['Bengaluru', 'Bangalore'] },
]

const toPins = (results = []) =>
  results.flatMap((j) => (j.pins || []).map(([lat, lng]) => ({ lat, lng, key: j.id })))

function useRoute() {
  const get = () => (window.location.hash === '#/applications' ? 'applications' : 'search')
  const [route, setRoute] = useState(get)
  useEffect(() => {
    const on = () => setRoute(get())
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])
  const go = (r) => { window.location.hash = r === 'applications' ? '#/applications' : '#/'; window.scrollTo(0, 0) }
  return [route, go]
}

function Toast({ toast, onClose }) {
  useEffect(() => {
    if (!toast) return
    const t = setTimeout(onClose, 5000)
    return () => clearTimeout(t)
  }, [toast, onClose])
  if (!toast) return null
  return (
    <div className="toast" role="status">
      <span>{toast.text}</span>
      {toast.action && <button type="button" onClick={() => { toast.action.run(); onClose() }}>{toast.action.label}</button>}
    </div>
  )
}

export default function App() {
  const [route, go] = useRoute()
  const store = useApplications()
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
  const [toast, setToastState] = useState(null)
  const endRef = useRef(null)
  const inputRef = useRef(null)

  const toast_ = useCallback((text, action) => setToastState({ text, action, id: Date.now() }), [])
  const closeToast = useCallback(() => setToastState(null), [])

  const onApply = useCallback((job) => {
    store.add(job)
    toast_(`Saved to My applications: ${job.title} at ${job.company}`, { label: 'Undo', run: () => store.remove(job.id) })
  }, [store, toast_])

  const loadMeta = () =>
    getMeta().then((m) => {
      setMeta(m)
      setNeedCode(false)
      getMap().then(setMapData).catch(() => {})
      searchJobs({ fit_only: true, sort: 'fit', limit: 8 }).then(setPicks).catch(() => {})
    }).catch((e) => {
      if (e.status === 401) setNeedCode(true)
      else setError('The server is waking up. Try again in about 30 seconds.')
    })
  useEffect(() => { loadMeta() }, [])
  useEffect(() => { if (messages.length) endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }) }, [messages, busy])

  const lastResults = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) if (messages[i].last?.results) return messages[i].last.results
    return null
  }, [messages])
  const pins = useMemo(() => toPins(lastResults || (messages.length ? [] : picks?.results)), [lastResults, picks, messages.length])

  const cityCounts = useMemo(() => MY_CITIES.map((c) => ({
    ...c, count: mapData.cities.filter((m) => c.match.includes(m.city)).reduce((s, m) => s + m.count, 0),
  })), [mapData])

  async function ask(text) {
    const q = text.trim()
    if (!q || busy) return
    if (route !== 'search') go('search')
    const next = [...messages, { role: 'user', content: q }]
    setMessages(next)
    setInput('')
    setError('')
    setBusy(true)
    window.scrollTo({ top: 0 })
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

  const landing = route === 'search' && messages.length === 0
  const composer = (
    <form className="composer" onSubmit={(e) => { e.preventDefault(); ask(input) }}>
      <label htmlFor="q" className="sr">Ask about internships</label>
      <textarea id="q" ref={inputRef} rows={1} value={input}
        placeholder={landing ? 'Try “ML internships in Houston that start in June”' : 'Ask a follow-up…'}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); ask(input) } }} />
      <button type="submit" disabled={busy || !input.trim()} aria-label="Send">
        <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 15V5M5.5 9.5 10 5l4.5 4.5" /></svg>
      </button>
    </form>
  )
  const map = (
    <WorldMap cities={mapData.cities} home={mapData.home} pins={pins} focus={focus} compact={!landing}
      onCity={(c) => ask(`Internships in ${c}`)} />
  )
  const nApps = store.apps.length
  const interviewing = store.apps.filter((a) => a.status === 'Interviewing').length
  const resultProps = { onFocus: setFocus, applied: store.has, onApply }

  return (
    <div className={`app ${landing ? 'is-home' : 'is-thread'}${route === 'applications' ? ' is-tracker' : ''}`}>
      <header className="top">
        <button type="button" className="wordmark" onClick={() => { setMessages([]); go('search') }}>
          <span className="logo" aria-hidden="true" />Internship Copilot
        </button>
        <nav className="nav" aria-label="Main">
          <button type="button" className={route === 'search' ? 'on' : ''} aria-current={route === 'search' ? 'page' : undefined}
            onClick={() => go('search')}>Search</button>
          <button type="button" className={route === 'applications' ? 'on' : ''} aria-current={route === 'applications' ? 'page' : undefined}
            onClick={() => go('applications')}>My applications{nApps > 0 && <span className="count">{nApps}</span>}</button>
        </nav>
        {meta && <span className="live"><span className="dot" aria-hidden="true" />Live, updated {meta.updated_human.replace(/^\d+ \w+ \d{4}, /, '')}</span>}
      </header>

      {route === 'applications' ? (
        <Tracker store={store} onFind={() => go('search')} toast={toast_} />
      ) : landing ? (
        <main className="home">
          <section className="hero">
            {map}
            <div className="hero-copy">
              <h1>Where will you<br />intern next?</h1>
              <p className="stats">
                <span><strong>{meta ? meta.count.toLocaleString('en-IN') : '—'}</strong> open internships</span>
                <span><strong>{mapData.cities.length || '—'}</strong> cities</span>
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

          <HowItWorks />

          <section className="cities" aria-labelledby="cities-h">
            <div className="section-head">
              <h2 id="cities-h">Open in your cities</h2>
              <p>Live counts where you said you&rsquo;d go. Pick one to see what fits you there.</p>
            </div>
            <ul className="city-grid">
              {cityCounts.map((c) => (
                <li key={c.name}>
                  <button type="button" className="city" onClick={() => ask(c.ask)}>
                    <span className="city-n">{c.count ? c.count.toLocaleString('en-IN') : '—'}</span>
                    <span className="city-name">{c.name}</span>
                    <span className="city-go">See roles</span>
                  </button>
                </li>
              ))}
            </ul>
          </section>

          {picks?.results?.length > 0 && (
            <section className="picks" aria-labelledby="picks-h">
              <div className="section-head">
                <h2 id="picks-h">You can apply for these now</h2>
                <p>Your strongest matches, ranked by fit. Click Apply and it&rsquo;s saved to My applications.</p>
              </div>
              {nApps > 0 && (
                <button type="button" className="apps-strip" onClick={() => go('applications')}>
                  <span><strong>{nApps}</strong> {nApps === 1 ? 'application' : 'applications'} tracked{interviewing ? `, ${interviewing} interviewing` : ''}</span>
                  <span className="strip-go">Open My applications</span>
                </button>
              )}
              <Results data={{ results: picks.results }} limit={8} {...resultProps} />
            </section>
          )}
          <footer className="foot">
            <p>Listings from SimplifyJobs, Internshala and company career pages. Always check details on the employer&rsquo;s site before applying.</p>
          </footer>
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
                    <Results data={m.last} {...resultProps} />
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
      <Toast key={toast?.id} toast={toast ? { text: toast.text, action: toast.action } : null} onClose={closeToast} />
    </div>
  )
}
