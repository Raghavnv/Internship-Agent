import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { projects as P } from '../lib/backend.js'
import { useSession } from '../lib/session.jsx'
import { range } from './Profile.jsx'

export default function Portfolio() {
  const { user, profile } = useSession()
  const [projects, setProjects] = useState([])
  useEffect(() => { P.list().then((l) => setProjects(l || [])).catch(() => {}) }, [])
  if (!profile) return null
  const exp = profile.experience || []
  const edu = profile.education || []
  const certs = profile.certifications || []
  const ach = profile.achievements || []
  const links = [['LinkedIn', profile.linkedin], ['GitHub', profile.github], ['Website', profile.portfolio], ...(profile.other_links || []).map((l) => [l.label, l.url])].filter(([, u]) => u)
  const thin = !profile.bio && !exp.length && !projects.length

  return (
    <main className="page">
      <header className="page-head no-print">
        <div>
          <h1>Portfolio</h1>
          <p className="sub">Your profile as a recruiter would see it. Everything here comes from your Profile page.</p>
        </div>
        <div className="row-gap">
          <Link to="/app/profile" className="btn btn-ghost btn-sm">Edit profile</Link>
          <button type="button" className="btn btn-primary btn-sm" onClick={() => window.print()}>Download PDF</button>
        </div>
      </header>
      {thin && <p className="form-info no-print">Your portfolio looks empty. Use <Link to="/app/profile">Update from resume</Link> on your Profile to fill it in one go.</p>}

      <article className="folio">
        <header className="folio-head">
          <span className="avatar round big" aria-hidden="true">{(profile.full_name || '?').charAt(0).toUpperCase()}</span>
          <div>
            <h1>{profile.full_name}</h1>
            {profile.headline && <p className="pf-head">{profile.headline}</p>}
            <p className="pf-meta">
              {[profile.based_in, user?.email, profile.phone].filter(Boolean).map((t) => <span key={t}>{t}</span>)}
              {links.map(([l, u]) => <a key={l + u} href={u} target="_blank" rel="noreferrer">{l}</a>)}
            </p>
          </div>
        </header>
        {profile.bio && <p className="folio-bio">{profile.bio}</p>}

        <div className="folio-grid">
          <div>
            {exp.length > 0 && <section><h2>Experience</h2><ol className="timeline">
              {exp.map((e, i) => <li key={i}><h3>{e.title}<span> at {e.company}</span></h3><p className="quiet small">{[range(e), e.location].filter(Boolean).join(', ')}</p>
                {e.bullets?.length > 0 && <ul>{e.bullets.map((b, j) => <li key={j}>{b}</li>)}</ul>}</li>)}
            </ol></section>}
            {projects.length > 0 && <section><h2>Projects</h2><ul className="proj-grid">
              {projects.map((p) => <li key={p.id} className="proj-card"><h3>{p.url ? <a href={p.url} target="_blank" rel="noreferrer">{p.title}</a> : p.title}</h3>
                {p.description && <p>{p.description}</p>}{p.tech?.length > 0 && <ul className="tech">{p.tech.map((t) => <li key={t}>{t}</li>)}</ul>}</li>)}
            </ul></section>}
          </div>
          <aside>
            {edu.length > 0 && <section><h2>Education</h2><ol className="timeline">
              {edu.map((e, i) => <li key={i}><h3>{e.school}</h3><p className="small">{[e.degree, e.field].filter(Boolean).join(' in ')}{e.grade ? `, ${e.grade}` : ''}</p><p className="quiet small">{range(e)}</p></li>)}
            </ol></section>}
            {(profile.skills || []).length > 0 && <section><h2>Skills</h2><ul className="tech big">{profile.skills.map((t) => <li key={t}>{t}</li>)}</ul></section>}
            {(certs.length > 0 || ach.length > 0) && <section><h2>Certifications and awards</h2><ul className="plain">
              {certs.map((c, i) => <li key={`c${i}`}><strong>{c.name}</strong>{[c.issuer, c.year].filter(Boolean).length > 0 && <span className="quiet"> {[c.issuer, c.year].filter(Boolean).join(', ')}</span>}</li>)}
              {ach.map((a, i) => <li key={`a${i}`}><strong>{a.title}</strong>{a.year && <span className="quiet"> {a.year}</span>}</li>)}
            </ul></section>}
            {(profile.spoken_languages || []).length > 0 && <section><h2>Languages</h2><p className="small">{profile.spoken_languages.join(', ')}</p></section>}
          </aside>
        </div>
      </article>
    </main>
  )
}
