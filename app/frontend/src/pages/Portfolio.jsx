import { useEffect, useState } from 'react'
import { projects as P } from '../lib/backend.js'
import { SKILLS } from '../lib/options.js'
import { useSession } from '../lib/session.jsx'
import { useUserData } from '../lib/userdata.jsx'
import { ChipInput, Field, Icon } from '../ui.jsx'

const blank = { title: '', description: '', url: '', tech: [] }

function ProjectForm({ initial, onSave, onCancel }) {
  const [p, setP] = useState(initial)
  return (
    <form className="proj-form" onSubmit={(e) => { e.preventDefault(); if (p.title.trim()) onSave(p) }}>
      <div className="grid2">
        <Field label="Project name" htmlFor="p-t"><input id="p-t" value={p.title} onChange={(e) => setP({ ...p, title: e.target.value })} required /></Field>
        <Field label="Link" htmlFor="p-u" hint="GitHub, live demo or write-up"><input id="p-u" type="url" value={p.url} onChange={(e) => setP({ ...p, url: e.target.value })} /></Field>
        <Field label="What it does and what you built" htmlFor="p-d" wide>
          <textarea id="p-d" rows={3} value={p.description} onChange={(e) => setP({ ...p, description: e.target.value })} />
        </Field>
        <Field label="Tech used" htmlFor="p-tech" wide><ChipInput id="p-tech" value={p.tech} onChange={(tech) => setP({ ...p, tech })} suggestions={SKILLS} placeholder="React, FastAPI…" /></Field>
      </div>
      <div className="row-end">
        <button type="button" className="btn btn-text" onClick={onCancel}>Cancel</button>
        <button type="submit" className="btn btn-primary btn-sm">Save project</button>
      </div>
    </form>
  )
}

export default function Portfolio() {
  const { profile, update } = useSession()
  const { say } = useUserData()
  const [items, setItems] = useState([])
  const [editing, setEditing] = useState(null)
  const [about, setAbout] = useState(null)

  useEffect(() => { P.list().then(setItems).catch((e) => say(e.message)) }, [say])
  useEffect(() => {
    if (profile && !about) setAbout({ headline: profile.headline || '', bio: profile.bio || '', linkedin: profile.linkedin || '', github: profile.github || '', portfolio: profile.portfolio || '' })
  }, [profile])

  async function saveProject(p) {
    try {
      const row = await P.save(p)
      setItems((xs) => (p.id ? xs.map((x) => (x.id === p.id ? row : x)) : [...xs, row]))
      setEditing(null); say('Project saved')
    } catch (e) { say(e.message) }
  }
  async function removeProject(p) {
    setItems((xs) => xs.filter((x) => x.id !== p.id))
    try { await P.remove(p.id) } catch (e) { setItems((xs) => [...xs, p]); say(e.message) }
  }
  async function saveAbout() {
    try { await update(about); say('Portfolio details saved') } catch (e) { say(e.message) }
  }

  if (!about) return null
  const links = [['LinkedIn', about.linkedin], ['GitHub', about.github], ['Website', about.portfolio]].filter(([, u]) => u)
  return (
    <main className="page">
      <header className="page-head">
        <div>
          <h1>Portfolio</h1>
          <p className="sub">Your headline, links and best projects in one place. The AI also uses these when reviewing your resume.</p>
        </div>
      </header>

      <div className="pf-grid">
        <div>
          <section className="panel" aria-labelledby="ab-h">
            <div className="panel-head"><h2 id="ab-h">About you</h2></div>
            <div className="grid2">
              <Field label="Headline" htmlFor="pf-h" wide><input id="pf-h" value={about.headline} onChange={(e) => setAbout({ ...about, headline: e.target.value })} placeholder="CS student building AI-powered full-stack apps" /></Field>
              <Field label="Short bio" htmlFor="pf-b" wide><textarea id="pf-b" rows={3} value={about.bio} onChange={(e) => setAbout({ ...about, bio: e.target.value })} placeholder="What you work on and what you're looking for." /></Field>
              <Field label="LinkedIn" htmlFor="pf-li"><input id="pf-li" type="url" value={about.linkedin} onChange={(e) => setAbout({ ...about, linkedin: e.target.value })} /></Field>
              <Field label="GitHub" htmlFor="pf-gh"><input id="pf-gh" type="url" value={about.github} onChange={(e) => setAbout({ ...about, github: e.target.value })} /></Field>
              <Field label="Website" htmlFor="pf-w" wide><input id="pf-w" type="url" value={about.portfolio} onChange={(e) => setAbout({ ...about, portfolio: e.target.value })} /></Field>
            </div>
            <div className="row-end"><button type="button" className="btn btn-primary btn-sm" onClick={saveAbout}>Save</button></div>
          </section>

          <section className="panel" aria-labelledby="pj-h">
            <div className="panel-head">
              <h2 id="pj-h">Projects</h2>
              {!editing && <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEditing(blank)}><Icon name="plus" size={14} />Add project</button>}
            </div>
            {editing && !editing.id && <ProjectForm initial={editing} onSave={saveProject} onCancel={() => setEditing(null)} />}
            {items.length === 0 && !editing && <p className="quiet">Add 2 or 3 projects you&rsquo;re proud of. Recruiters look here first.</p>}
            <ul className="projects">
              {items.map((p) => editing?.id === p.id ? (
                <li key={p.id}><ProjectForm initial={{ ...blank, ...p }} onSave={saveProject} onCancel={() => setEditing(null)} /></li>
              ) : (
                <li key={p.id} className="proj">
                  <div>
                    <h3>{p.url ? <a href={p.url} target="_blank" rel="noreferrer">{p.title}</a> : p.title}</h3>
                    {p.description && <p>{p.description}</p>}
                    {p.tech?.length > 0 && <ul className="tech">{p.tech.map((t) => <li key={t}>{t}</li>)}</ul>}
                  </div>
                  <div className="proj-actions">
                    <button type="button" className="link-btn" onClick={() => setEditing(p)}>Edit</button>
                    <button type="button" className="link-btn quiet-btn" onClick={() => removeProject(p)}>Delete</button>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        </div>

        <aside className="pf-preview" aria-label="Preview">
          <p className="f-label">Preview</p>
          <div className="pf-card">
            <span className="avatar round big" aria-hidden="true">{(profile.full_name || '?').charAt(0)}</span>
            <h2>{profile.full_name || 'Your name'}</h2>
            <p className="pf-head">{about.headline || 'Add a headline'}</p>
            <p className="quiet small">{[profile.degree, profile.major].filter(Boolean).join(', ')}{profile.college ? ` at ${profile.college}` : ''}</p>
            {about.bio && <p className="pf-bio">{about.bio}</p>}
            {(profile.skills || []).length > 0 && <ul className="tech">{profile.skills.slice(0, 12).map((s) => <li key={s}>{s}</li>)}</ul>}
            {links.length > 0 && <p className="pf-links">{links.map(([l, u]) => <a key={l} href={u} target="_blank" rel="noreferrer">{l}</a>)}</p>}
            {items.length > 0 && <p className="quiet small">{items.length} {items.length === 1 ? 'project' : 'projects'}</p>}
          </div>
        </aside>
      </div>
    </main>
  )
}
