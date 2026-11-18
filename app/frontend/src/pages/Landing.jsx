import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { getMap, getMeta } from '../lib/api.js'
import { useSession } from '../lib/session.jsx'
import HowItWorks from '../HowItWorks.jsx'
import WorldMap from '../WorldMap.jsx'
import { Logo } from '../ui.jsx'

const reduced = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

// Demo scenes the hero plays on a loop: a student somewhere asks, arcs land on matches.
const C = {
  sf: [37.775, -122.419], sj: [37.339, -121.895], mv: [37.386, -122.084], pa: [37.442, -122.143], sv: [37.369, -122.036],
  nyc: [40.714, -74.006], bos: [42.358, -71.06], jc: [40.728, -74.078],
  aus: [30.267, -97.743], dal: [32.783, -96.807], hou: [29.763, -95.363], pla: [33.02, -96.699],
  sea: [47.606, -122.332], red: [47.674, -122.121], bel: [47.61, -122.201],
}
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

function Hero({ meta, cities }) {
  const [i, setI] = useState(0)
  const scene = SCENES[i]
  const typed = useTypewriter(scene.q)
  const done = typed.length === scene.q.length
  useEffect(() => {
    if (reduced()) return
    const id = setTimeout(() => setI((v) => (v + 1) % SCENES.length), 6200)
    return () => clearTimeout(id)
  }, [i])
  const pins = useMemo(() => (done ? scene.to.map((k) => ({ lat: C[k][0], lng: C[k][1], key: `${i}-${k}` })) : []), [done, i])
  const home = { lat: scene.home[0], lng: scene.home[1], city: scene.from }

  return (
    <section className="l-hero">
      <WorldMap cities={cities} home={home} pins={pins} />
      <div className="l-hero-copy">
        <h1>Every internship.<br />One question away.</h1>
        <p className="l-lede">
          Internship Copilot watches {meta ? meta.count.toLocaleString('en-IN') : 'thousands of'} live listings, scores every one
          against your profile, and finds exactly what you ask for.
        </p>
        <div className="l-ctas">
          <Link to="/signup" className="btn btn-primary">Get started free</Link>
          <a href="#how" className="btn btn-ghost">See how it works</a>
        </div>
      </div>
      <div className="l-demo" aria-hidden="true">
        <span className="l-demo-from"><i />A student in {scene.from} asks</span>
        <span className="l-demo-q">{typed}<b className={done ? 'caret off' : 'caret'} /></span>
      </div>
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
  const appLink = user ? (profile?.onboarded ? '/app' : '/onboarding') : null

  return (
    <div className="landing">
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
              <h3>{title}</h3>
              <p>{body}</p>
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
        <h2>Set up your profile in two minutes</h2>
        <p>Tell us what you&rsquo;re looking for once. Every listing gets scored for you from then on.</p>
        <Link to={appLink || '/signup'} className="btn btn-primary">{appLink ? 'Open dashboard' : 'Get started free'}</Link>
      </section>

      <footer className="foot l-foot">
        <span className="wordmark small"><Logo />Internship Copilot</span>
        <p>Listings from SimplifyJobs, Internshala and company career pages, refreshed every 15 minutes. Always check details on the employer&rsquo;s site before applying.</p>
      </footer>
    </div>
  )
}
