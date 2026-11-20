import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { getMap, getMeta } from '../lib/api.js'
import { useSession } from '../lib/session.jsx'
import HowItWorks from '../HowItWorks.jsx'
import Globe from '../Globe.jsx'
import Backdrop from '../Backdrop.jsx'
import { Logo } from '../ui.jsx'

const reduced = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

// Demo scenes the hero plays on a loop: a student somewhere asks, arcs land on matches.
const C = {
  sf: [37.775, -122.419], sj: [37.339, -121.895], mv: [37.386, -122.084], pa: [37.442, -122.143], sv: [37.369, -122.036],
  nyc: [40.714, -74.006], bos: [42.358, -71.06], jc: [40.728, -74.078],
  aus: [30.267, -97.743], dal: [32.783, -96.807], hou: [29.763, -95.363], pla: [33.02, -96.699],
  sea: [47.606, -122.332], red: [47.674, -122.121], bel: [47.61, -122.201],
}
const NAMES = { sf: 'San Francisco', sj: 'San Jose', mv: 'Mountain View', pa: 'Palo Alto', sv: 'Sunnyvale', nyc: 'New York',
  bos: 'Boston', jc: 'Jersey City', aus: 'Austin', dal: 'Dallas', hou: 'Houston', pla: 'Plano', sea: 'Seattle', red: 'Redmond', bel: 'Bellevue',
  lon: 'London', ber: 'Berlin', blr: 'Bengaluru', sg: 'Singapore', tor: 'Toronto' }
const SCENES = [
  { from: 'Bengaluru', home: [12.972, 77.594], q: 'ML internships in the Bay Area this summer', to: ['sf', 'sj', 'mv', 'pa', 'sv'] },
  { from: 'Toronto', home: [43.651, -79.383], q: 'Backend roles in New York, remote is fine', to: ['nyc', 'jc', 'bos'] },
  { from: 'Hyderabad', home: [17.385, 78.487], q: 'Software internships anywhere in Texas', to: ['aus', 'dal', 'hou', 'pla'] },
  { from: 'London', home: [51.507, -0.128], q: 'Data science internships in Seattle', to: ['sea', 'red', 'bel'] },
]

function useTypewriter(text, speed = 34) {
  const [n, setN] = useState(0)
  useEffect(() => {
    if (reduced()) { setN(text.length); return }
    setN(0)
    const id = setInterval(() => setN((v) => (v >= text.length ? (clearInterval(id), v) : v + 1)), speed)
    return () => clearInterval(id)
  }, [text, speed])
  return text.slice(0, n)
}

function ago(ts) {
  if (!ts) return ''
  const m = Math.max(1, Math.round((Date.now() / 1000 - ts) / 60))
  return m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago`
}

function Hero({ meta, cities }) {
  const [i, setI] = useState(0)
  const scene = SCENES[i]
  const typed = useTypewriter(scene.q)
  const done = typed.length === scene.q.length
  useEffect(() => {
    if (reduced()) return
    const id = setTimeout(() => setI((v) => (v + 1) % SCENES.length), 7000)
    return () => clearTimeout(id)
  }, [i])
  const routes = useMemo(() => (done ? scene.to.map((k) => ({ lat: C[k][0], lng: C[k][1], key: `${i}-${k}`, label: NAMES[k] })) : []),
    [done, i])
  const home = { lat: scene.home[0], lng: scene.home[1] }

  return (
    <section className="l-hero">
      <div className="l-hero-copy">
        <h1>Every live internship, <span>ranked for you.</span></h1>
        <p className="l-lede">
          Internship Copilot reads {meta ? meta.count.toLocaleString('en-IN') : 'thousands of'} listings from five job boards,
          scores each one against your skills, dates and visa status, and shows you the ones worth applying to.
        </p>
        <div className="l-ctas">
          <Link to="/signup" className="btn btn-primary btn-lg">Get started free</Link>
          <a href="#how" className="btn btn-ghost btn-lg">See how it works</a>
        </div>
        <div className="l-demo" aria-hidden="true">
          <span className="l-demo-from"><i />A student in {scene.from} asks</span>
          <span className="l-demo-q"><svg viewBox="0 0 20 20" className="ico-s" width="16" height="16"><path d="M9 15.5a6.5 6.5 0 1 0 0-13 6.5 6.5 0 0 0 0 13zM13.7 13.7 17.5 17.5" /></svg>
            {typed}<b className={done ? 'caret off' : 'caret'} /></span>
        </div>
      </div>
      <div className="l-globe">
        <Globe home={home} routes={routes} cities={cities} perRound={5} label={`Routes from ${scene.from} to matching internships`} />
      </div>
    </section>
  )
}

function Stats({ meta }) {
  if (!meta) return <div className="l-stats placeholder" />
  const items = [
    [meta.count.toLocaleString('en-IN'), 'live internships'],
    [(meta.companies || 0).toLocaleString('en-IN'), 'companies hiring'],
    [(meta.cities || 0).toLocaleString('en-IN'), 'cities worldwide'],
    ['15 min', 'between checks'],
  ]
  return (
    <section className="l-stats" aria-label="Right now">
      {items.map(([n, l]) => <div key={l}><strong>{n}</strong><span>{l}</span></div>)}
    </section>
  )
}

function JustPosted({ items }) {
  if (!items?.length) return null
  const row = items.map((r) => (
    <li key={r.company + r.title}><b>{r.company}</b><span>{r.title}</span><em>{r.city}</em></li>
  ))
  return (
    <section className="l-ticker" aria-label="Just posted">
      <span className="l-ticker-cap"><i />Just posted</span>
      <div className="l-ticker-track"><ul>{row}</ul><ul aria-hidden="true">{row}</ul></div>
    </section>
  )
}

function MiniChat() {
  return (
    <div className="mini mini-chat" aria-hidden="true">
      <span className="mc-q">Remote AI internships, Jan to June</span>
      <span className="mc-a">Found 31. Three stand out:</span>
      {[['Applied AI Intern', 'DwyerOmega', 88], ['ML Engineer Intern', 'Bask Health', 81]].map(([t, c, f]) => (
        <span key={t} className="mc-row"><b>{c[0]}</b><span><strong>{t}</strong>{c}</span><em>{f}</em></span>
      ))}
    </div>
  )
}
function MiniFit() {
  return (
    <div className="mini mini-fit" aria-hidden="true">
      {[[94, 'Backend Engineer Intern', 'Austin, Summer ’27'], [83, 'Software Engineer Intern', 'Dallas, Summer ’27'], [58, 'QA Intern', 'Chicago, dates not stated']].map(([f, t, m]) => (
        <span key={t} className="mf-row">
          <svg viewBox="0 0 36 36"><circle cx="18" cy="18" r="15" className="ring-bg" /><circle cx="18" cy="18" r="15" className="ring" strokeDasharray="94.2" strokeDashoffset={94.2 * (1 - f / 100)} transform="rotate(-90 18 18)" /><text x="18" y="22" textAnchor="middle">{f}</text></svg>
          <span><strong>{t}</strong>{m}</span>
        </span>
      ))}
    </div>
  )
}
function MiniTrack() {
  const cols = [['Applied', 'applied', 3], ['Interviewing', 'interviewing', 2], ['Offer', 'offer', 1]]
  return (
    <div className="mini mini-track" aria-hidden="true">
      {cols.map(([n, k, c]) => (
        <span key={n} className="mt-col"><span className="mt-h"><i className={`dot-${k}`} />{n}</span>
          {Array.from({ length: c }).map((_, j) => <span key={j} className="mt-card"><b /><b /></span>)}
        </span>
      ))}
    </div>
  )
}
function MiniResume() {
  return (
    <div className="mini mini-resume" aria-hidden="true">
      <span className="mr-doc">
        <b className="w60" /><b className="w90" /><b className="w80 hl" /><b className="w70" /><b className="w85 hl2" /><b className="w50" />
      </span>
      <span className="mr-note">
        <strong>Match 82</strong>
        <span>Strong: FastAPI, PostgreSQL</span>
        <span className="gap">Gap: show a deployed project</span>
      </span>
    </div>
  )
}

const FEATURES = [
  { art: MiniChat, title: 'Ask in plain words', body: 'Type what you want the way you’d say it. The AI turns it into precise filters over every live listing.' },
  { art: MiniFit, title: 'A fit score for every role', body: 'Each internship is scored against your skills, cities, dates, degree and visa status. Best fits come first.' },
  { art: MiniTrack, title: 'Track every application', body: 'Click Apply and it’s saved. Move roles from applied to interviewing to offer, with notes and follow-up nudges.' },
  { art: MiniResume, title: 'Resume feedback per role', body: 'Upload your resume once. Get honest, specific feedback and rewritten bullets for any role you’re eyeing.' },
]

export default function Landing() {
  const { user, profile } = useSession()
  const [meta, setMeta] = useState(null)
  const [cities, setCities] = useState([])
  useEffect(() => {
    getMeta().then(setMeta).catch(() => {})
    getMap().then((m) => setCities(m.cities)).catch(() => {})
  }, [])
  const appLink = user ? '/app' : null   // /app sends brand-new accounts to setup by itself

  return (
    <div className="landing">
      <Backdrop variant="landing" />
      <header className="l-nav">
        <Link to="/" className="wordmark"><Logo />Internship Copilot</Link>
        <nav aria-label="Sections">
          <a href="#how">How it works</a>
          <a href="#features">Features</a>
        </nav>
        <div className="l-nav-cta">
          {appLink ? <Link to={appLink} className="btn btn-primary btn-sm">Open dashboard</Link> : <>
            <Link to="/login" className="btn btn-text btn-sm">Log in</Link>
            <Link to="/signup" className="btn btn-primary btn-sm">Get started</Link>
          </>}
        </div>
      </header>

      <Hero meta={meta} cities={cities} />
      <JustPosted items={meta?.recent} />


      <div id="how"><HowItWorks /></div>

      <section id="features" className="l-features" aria-labelledby="feat-h">
        <div className="section-head">
          <h2 id="feat-h">Everything for the search, in one place</h2>
          <p>From finding the right roles to keeping track after you apply.</p>
        </div>
        <ul className="feat-grid">
          {FEATURES.map(({ art: Art, title, body }) => (
            <li key={title} className="feat">
              <div className="feat-art"><Art /></div>
              <div className="feat-text"><h3>{title}</h3><p>{body}</p></div>
            </li>
          ))}
        </ul>
      </section>

      {meta?.top_companies?.length > 0 && (
        <section className="l-hiring" aria-labelledby="hiring-h">
          <h2 id="hiring-h">Hiring interns right now</h2>
          <ul>
            {meta.top_companies.filter(([c]) => c).map(([c, n]) => <li key={c}><span>{c}</span><em>{n} roles</em></li>)}
          </ul>
        </section>
      )}

      <section className="l-final">
        <div>
          <h2>Set up your profile in two minutes</h2>
          <p>Tell us what you&rsquo;re looking for once. Every listing gets scored for you from then on.</p>
        </div>
        <Link to={appLink || '/signup'} className="btn btn-primary">{appLink ? 'Open dashboard' : 'Get started free'}</Link>
      </section>

      <footer className="foot l-foot">
        <span className="wordmark small"><Logo />Internship Copilot</span>
        <p>Listings from SimplifyJobs, Internshala and company career pages, refreshed every 15 minutes. Always check details on the employer&rsquo;s site before applying.</p>
      </footer>
    </div>
  )
}
