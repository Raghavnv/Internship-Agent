import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { projects as P } from '../lib/backend.js'
import { DEGREE_LEVELS, SKILLS, YEARS, toMonth } from '../lib/options.js'
import { useSession } from '../lib/session.jsx'
import { useUserData } from '../lib/userdata.jsx'
import { Section } from '../ProfileSections.jsx'
import ResumeImport from '../ResumeImport.jsx'
import { ChipInput, ChoiceChips, Field, Icon } from '../ui.jsx'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
export const fmtYm = (v) => { if (!v) return ''; const [y, m] = String(v).split('-'); return m ? `${MONTHS[+m - 1]} ${y}` : y }
export const range = (e) => [fmtYm(e.start), e.current ? 'Present' : fmtYm(e.end)].filter(Boolean).join(' – ')

// ── generic list editor (experience, education, certifications, achievements, links) ──
function ListEditor({ items, onChange, fields, addLabel, blank }) {
  const set = (i, k, v) => onChange(items.map((x, j) => (j === i ? { ...x, [k]: v } : x)))
  const move = (i, d) => { const n = [...items]; const [x] = n.splice(i, 1); n.splice(i + d, 0, x); onChange(n) }
  return (
    <div className="list-ed">
      {items.map((it, i) => (
        <div key={i} className="le-item">
          <div className="grid2">
            {fields.map((f) => {
              const id = `le-${f.key}-${i}`
              if (f.type === 'checkbox') return (
                <label key={f.key} className="check-row"><input type="checkbox" checked={Boolean(it[f.key])} onChange={(e) => set(i, f.key, e.target.checked)} />{f.label}</label>
              )
              if (f.type === 'lines') return (
                <Field key={f.key} label={f.label} htmlFor={id} hint="One per line" wide>
                  <textarea id={id} rows={3} value={(it[f.key] || []).join('\n')} onChange={(e) => set(i, f.key, e.target.value.split('\n'))} />
                </Field>
              )
              if (f.type === 'textarea') return (
                <Field key={f.key} label={f.label} htmlFor={id} wide><textarea id={id} rows={2} value={it[f.key] || ''} onChange={(e) => set(i, f.key, e.target.value)} /></Field>
              )
              if (f.type === 'month') return (
                <Field key={f.key} label={f.label} htmlFor={id}>
                  <input id={id} type="month" value={toMonth(it[f.key])} disabled={f.key === 'end' && it.current} onChange={(e) => set(i, f.key, e.target.value || null)} />
                </Field>
              )
              return (
                <Field key={f.key} label={f.label} htmlFor={id} wide={f.wide}>
                  <input id={id} type={f.type || 'text'} value={it[f.key] ?? ''} placeholder={f.placeholder}
                    onChange={(e) => set(i, f.key, f.type === 'number' ? (e.target.value ? Number(e.target.value) : null) : e.target.value)} />
                </Field>
              )
            })}
          </div>
          <div className="le-actions">
            <button type="button" className="link-btn" disabled={i === 0} onClick={() => move(i, -1)}>Move up</button>
            <button type="button" className="link-btn" disabled={i === items.length - 1} onClick={() => move(i, 1)}>Move down</button>
            <button type="button" className="link-btn quiet-btn" onClick={() => onChange(items.filter((_, j) => j !== i))}>Remove</button>
          </div>
        </div>
      ))}
      <button type="button" className="btn btn-ghost btn-sm" onClick={() => onChange([...items, { ...blank }])}><Icon name="plus" size={14} />{addLabel}</button>
    </div>
  )
}

// ── a panel that switches between view and edit ──
function Panel({ id, title, children, editor, onSave, onCancel, empty, count }) {
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  async function save() {
    setSaving(true)
    try { await onSave(); setEditing(false) } finally { setSaving(false) }
  }
  return (
    <section className="panel pf-panel" aria-labelledby={id}>
      <div className="panel-head">
        <h2 id={id}>{title}{count ? <span className="ph-count">{count}</span> : null}</h2>
        {!editing && <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEditing(true)}>{empty ? <><Icon name="plus" size={14} />Add</> : 'Edit'}</button>}
      </div>
      {editing ? (
        <>
          {editor}
          <div className="row-end">
            <button type="button" className="btn btn-text btn-sm" onClick={() => { onCancel?.(); setEditing(false) }}>Cancel</button>
            <button type="button" className="btn btn-primary btn-sm" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
          </div>
        </>
      ) : empty ? <p className="quiet small">{empty}</p> : children}
    </section>
  )
}

const EXP_FIELDS = [
  { key: 'title', label: 'Role' }, { key: 'company', label: 'Company' }, { key: 'location', label: 'Location', wide: true },
  { key: 'start', label: 'Start', type: 'month' }, { key: 'end', label: 'End', type: 'month' },
  { key: 'current', label: 'I currently work here', type: 'checkbox' }, { key: 'bullets', label: 'What you did', type: 'lines' },
]
const EDU_FIELDS = [
  { key: 'school', label: 'School or college', wide: true }, { key: 'degree', label: 'Degree', placeholder: 'B.E., B.Tech, 12th grade…' },
  { key: 'field', label: 'Field of study' }, { key: 'start', label: 'Start', type: 'month' }, { key: 'end', label: 'End (or expected)', type: 'month' },
  { key: 'grade', label: 'Grade or CGPA', placeholder: '8.9 CGPA' },
]
const CERT_FIELDS = [{ key: 'name', label: 'Certification', wide: true }, { key: 'issuer', label: 'Issued by' }, { key: 'year', label: 'Year', type: 'number' }]
const ACH_FIELDS = [{ key: 'title', label: 'Achievement', wide: true }, { key: 'detail', label: 'Details', type: 'textarea' }, { key: 'year', label: 'Year', type: 'number' }]
const LINK_FIELDS = [{ key: 'label', label: 'Label', placeholder: 'LeetCode, Kaggle, blog…' }, { key: 'url', label: 'URL', type: 'url' }]
const PROJ_FIELDS = [{ key: 'title', label: 'Project name' }, { key: 'url', label: 'Link', type: 'url' }, { key: 'description', label: 'What it does and what you built', type: 'textarea' }]

export default function Profile() {
  const { user, profile, update } = useSession()
  const { say } = useUserData()
  const [d, setD] = useState(null)
  const [projects, setProjects] = useState([])
  const [projDraft, setProjDraft] = useState([])
  const [importing, setImporting] = useState(false)

  const loadProjects = () => P.list().then((l) => { setProjects(l || []); setProjDraft(l || []) }).catch(() => {})
  useEffect(() => { loadProjects() }, [])
  useEffect(() => { if (profile) setD(profile) }, [profile])
  if (!d) return null

  const s = (k) => (v) => setD((x) => ({ ...x, [k]: v }))
  const reset = () => setD(profile)
  const save = (keys) => async () => {
    const patch = Object.fromEntries(keys.map((k) => [k, d[k]]))
    if (keys.includes('experience')) patch.experience = (d.experience || []).map((e) => ({ ...e, bullets: (e.bullets || []).map((b) => b.trim()).filter(Boolean) })).filter((e) => e.title || e.company)
    if (keys.includes('education')) {
      patch.education = (d.education || []).filter((e) => e.school)
      const top = patch.education.find((e) => e.degree) || patch.education[0]
      if (top) Object.assign(patch, { college: top.school, degree: top.degree, major: top.field, grad_year: top.end ? Number(String(top.end).slice(0, 4)) : d.grad_year })
    }
    for (const k of ['certifications', 'achievements', 'other_links']) if (keys.includes(k)) patch[k] = (d[k] || []).filter((x) => x.name || x.title || x.url)
    try { await update(patch); say('Saved') } catch (e) { say(e.message); throw e }
  }
  async function saveProjects() {
    try {
      const keep = new Set(projDraft.filter((p) => p.id).map((p) => p.id))
      for (const p of projects) if (!keep.has(p.id)) await P.remove(p.id)
      for (const [i, p] of projDraft.entries()) if (p.title?.trim()) await P.save({ ...p, position: i })
      await loadProjects(); say('Projects saved')
    } catch (e) { say(e.message); throw e }
  }

  const exp = profile.experience || []
  const edu = profile.education || []
  const certs = profile.certifications || []
  const ach = profile.achievements || []
  const links = [['LinkedIn', profile.linkedin], ['GitHub', profile.github], ['Website', profile.portfolio], ...(profile.other_links || []).map((l) => [l.label, l.url])].filter(([, u]) => u)
  const filled = [profile.headline, profile.bio, exp.length, edu.length, projects.length, (profile.skills || []).length >= 5, links.length, profile.resume_path].filter(Boolean).length
  const pct = Math.round((filled / 8) * 100)

  return (
    <main className="page profile-page">
      <section className="pf-hero">
        <span className="avatar round big" aria-hidden="true">{(profile.full_name || '?').charAt(0).toUpperCase()}</span>
        <div className="pf-hero-main">
          <h1>{profile.full_name || 'Your name'}</h1>
          <p className="pf-head">{profile.headline || <span className="quiet">Add a one-line headline</span>}</p>
          <p className="pf-meta">
            {[profile.based_in, profile.college && `${profile.degree ? `${profile.degree}, ` : ''}${profile.college}`, profile.grad_year && `Class of ${profile.grad_year}`].filter(Boolean).map((t) => <span key={t}>{t}</span>)}
          </p>
          <p className="pf-meta">
            <span>{user?.email}</span>{profile.phone && <span>{profile.phone}</span>}
            {links.map(([l, u]) => <a key={l + u} href={u} target="_blank" rel="noreferrer">{l}</a>)}
          </p>
        </div>
        <div className="pf-hero-side">
          <button type="button" className="btn btn-primary btn-sm" onClick={() => setImporting(true)}><Icon name="upload" size={15} />Update from resume</button>
          <Link to="/app/portfolio" className="btn btn-ghost btn-sm">View as portfolio</Link>
          <div className="pf-complete"><span>Profile {pct}% complete</span><span className="meter" aria-hidden="true"><span style={{ width: `${pct}%` }} /></span></div>
        </div>
      </section>
      {profile.resume_updated_at && <p className="quiet small pf-resume-note">Last updated from your resume on {new Date(profile.resume_updated_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}.</p>}

      <Panel id="p-basics" title="Basics and contact" onSave={save(['full_name', 'headline', 'based_in', 'phone'])} onCancel={reset}
        editor={<div className="grid2">
          <Field label="Full name" htmlFor="b-n"><input id="b-n" value={d.full_name || ''} onChange={(e) => s('full_name')(e.target.value)} /></Field>
          <Field label="Location" htmlFor="b-l" hint="City, country"><input id="b-l" value={d.based_in || ''} onChange={(e) => s('based_in')(e.target.value)} /></Field>
          <Field label="Headline" htmlFor="b-h" wide><input id="b-h" value={d.headline || ''} onChange={(e) => s('headline')(e.target.value)} placeholder="CS student building AI-powered full-stack apps" /></Field>
          <Field label="Phone" htmlFor="b-p"><input id="b-p" type="tel" value={d.phone || ''} onChange={(e) => s('phone')(e.target.value)} /></Field>
          <Field label="Email" htmlFor="b-e" hint="Your sign-in email"><input id="b-e" value={user?.email || ''} disabled /></Field>
        </div>}>
        <dl className="kv">
          <div><dt>Name</dt><dd>{profile.full_name || '—'}</dd></div>
          <div><dt>Location</dt><dd>{profile.based_in || '—'}</dd></div>
          <div><dt>Email</dt><dd>{user?.email}</dd></div>
          <div><dt>Phone</dt><dd>{profile.phone || '—'}</dd></div>
        </dl>
      </Panel>

      <Panel id="p-about" title="About" onSave={save(['bio'])} onCancel={reset} empty={!profile.bio && 'A few sentences about who you are and what you build.'}
        editor={<Field label="About you" htmlFor="a-b" hint="2 or 3 sentences, in your own voice."><textarea id="a-b" rows={4} value={d.bio || ''} onChange={(e) => s('bio')(e.target.value)} /></Field>}>
        <p className="pf-bio">{profile.bio}</p>
      </Panel>

      <Panel id="p-exp" title="Experience" count={exp.length} onSave={save(['experience'])} onCancel={reset} empty={!exp.length && 'Internships, jobs, research or freelance work.'}
        editor={<ListEditor items={d.experience || []} onChange={s('experience')} fields={EXP_FIELDS} addLabel="Add experience" blank={{ bullets: [] }} />}>
        <ol className="timeline">
          {exp.map((e, i) => (
            <li key={i}>
              <h3>{e.title}<span> at {e.company}</span></h3>
              <p className="quiet small">{[range(e), e.location].filter(Boolean).join(', ')}</p>
              {e.bullets?.length > 0 && <ul>{e.bullets.map((b, j) => <li key={j}>{b}</li>)}</ul>}
            </li>
          ))}
        </ol>
      </Panel>

      <Panel id="p-edu" title="Education" count={edu.length} onSave={save(['education', 'degree_level', 'year_of_study', 'grad_year'])} onCancel={reset} empty={!edu.length && 'Your college and school.'}
        editor={<>
          <ListEditor items={d.education || []} onChange={s('education')} fields={EDU_FIELDS} addLabel="Add education" blank={{}} />
          <div className="grid2 le-extra">
            <Field label="Degree level" wide><ChoiceChips single options={DEGREE_LEVELS} value={d.degree_level || 'bachelors'} onChange={s('degree_level')} label="Degree level" /></Field>
            <Field label="Year of study" wide><ChoiceChips single options={YEARS} value={d.year_of_study} onChange={s('year_of_study')} label="Year of study" /></Field>
          </div>
        </>}>
        <ol className="timeline">
          {edu.map((e, i) => (
            <li key={i}>
              <h3>{e.school}</h3>
              <p className="small">{[e.degree, e.field].filter(Boolean).join(' in ')}{e.grade ? `, ${e.grade}` : ''}</p>
              <p className="quiet small">{range(e)}</p>
            </li>
          ))}
        </ol>
        {profile.year_of_study && <p className="quiet small">Currently in {profile.year_of_study}</p>}
      </Panel>

      <Panel id="p-proj" title="Projects" count={projects.length} onSave={saveProjects} onCancel={() => setProjDraft(projects)} empty={!projects.length && 'Two or three projects you’re proud of. Recruiters look here first.'}
        editor={<>
          <ListEditor items={projDraft} onChange={setProjDraft} fields={PROJ_FIELDS} addLabel="Add project" blank={{ title: '', description: '', url: '', tech: [] }} />
          {projDraft.map((p, i) => (
            <Field key={i} label={`Tech used in ${p.title || `project ${i + 1}`}`} htmlFor={`pt-${i}`}>
              <ChipInput id={`pt-${i}`} value={p.tech || []} onChange={(tech) => setProjDraft(projDraft.map((x, j) => (j === i ? { ...x, tech } : x)))} suggestions={SKILLS} placeholder="React, FastAPI…" />
            </Field>
          ))}
        </>}>
        <ul className="proj-grid">
          {projects.map((p) => (
            <li key={p.id} className="proj-card">
              <h3>{p.url ? <a href={p.url} target="_blank" rel="noreferrer">{p.title}</a> : p.title}</h3>
              {p.description && <p>{p.description}</p>}
              {p.tech?.length > 0 && <ul className="tech">{p.tech.map((t) => <li key={t}>{t}</li>)}</ul>}
            </li>
          ))}
        </ul>
      </Panel>

      <Panel id="p-skills" title="Skills and interests" onSave={save(['skills', 'roles', 'avoid_roles'])} onCancel={reset}
        editor={<Section k="interests" draft={d} setDraft={setD} userId={user.id} />}>
        <p className="f-label">Skills</p>
        {(profile.skills || []).length ? <ul className="tech big">{profile.skills.map((t) => <li key={t}>{t}</li>)}</ul> : <p className="quiet small">No skills yet.</p>}
        <p className="f-label sp">Looking for</p>
        <ul className="tech big">{(profile.roles || []).map((t) => <li key={t} className="accent">{t}</li>)}</ul>
      </Panel>

      <Panel id="p-cert" title="Certifications and achievements" count={certs.length + ach.length} onSave={save(['certifications', 'achievements'])} onCancel={reset}
        empty={!certs.length && !ach.length && 'Courses, certifications, hackathons, awards, scholarships.'}
        editor={<>
          <p className="f-label">Certifications</p>
          <ListEditor items={d.certifications || []} onChange={s('certifications')} fields={CERT_FIELDS} addLabel="Add certification" blank={{}} />
          <p className="f-label sp">Achievements</p>
          <ListEditor items={d.achievements || []} onChange={s('achievements')} fields={ACH_FIELDS} addLabel="Add achievement" blank={{}} />
        </>}>
        <ul className="plain">
          {certs.map((c, i) => <li key={`c${i}`}><strong>{c.name}</strong>{[c.issuer, c.year].filter(Boolean).length > 0 && <span className="quiet"> {[c.issuer, c.year].filter(Boolean).join(', ')}</span>}</li>)}
          {ach.map((a, i) => <li key={`a${i}`}><strong>{a.title}</strong>{a.year && <span className="quiet"> {a.year}</span>}{a.detail && <p className="quiet small">{a.detail}</p>}</li>)}
        </ul>
      </Panel>

      <Panel id="p-links" title="Languages and links" onSave={save(['spoken_languages', 'linkedin', 'github', 'portfolio', 'other_links'])} onCancel={reset}
        editor={<>
          <Field label="Languages you speak" htmlFor="l-langs"><ChipInput id="l-langs" value={d.spoken_languages || []} onChange={s('spoken_languages')} suggestions={['English', 'Hindi', 'Kannada', 'Tamil', 'Telugu', 'Marathi', 'Bengali', 'Spanish', 'French', 'German']} placeholder="English, Hindi…" /></Field>
          <div className="grid2">
            <Field label="LinkedIn" htmlFor="l-li"><input id="l-li" type="url" value={d.linkedin || ''} onChange={(e) => s('linkedin')(e.target.value)} /></Field>
            <Field label="GitHub" htmlFor="l-gh"><input id="l-gh" type="url" value={d.github || ''} onChange={(e) => s('github')(e.target.value)} /></Field>
            <Field label="Website" htmlFor="l-w" wide><input id="l-w" type="url" value={d.portfolio || ''} onChange={(e) => s('portfolio')(e.target.value)} /></Field>
          </div>
          <p className="f-label sp">Other links</p>
          <ListEditor items={d.other_links || []} onChange={s('other_links')} fields={LINK_FIELDS} addLabel="Add link" blank={{}} />
        </>}>
        <dl className="kv">
          <div><dt>Languages</dt><dd>{(profile.spoken_languages || []).join(', ') || '—'}</dd></div>
          {links.map(([l, u]) => <div key={l + u}><dt>{l}</dt><dd><a href={u} target="_blank" rel="noreferrer">{u.replace(/^https?:\/\/(www\.)?/, '')}</a></dd></div>)}
        </dl>
      </Panel>

      <Panel id="p-prefs" title="Internship preferences" onSave={save(['locations', 'work_modes', 'remote_from', 'remote_to', 'onsite_from', 'onsite_to', 'us_work_auth', 'paid_only', 'company_types'])} onCancel={reset}
        editor={<><Section k="where" draft={d} setDraft={setD} userId={user.id} /><Section k="eligibility" draft={d} setDraft={setD} userId={user.id} /></>}>
        <dl className="kv">
          <div><dt>Locations</dt><dd>{(profile.locations || []).join(', ') || '—'}</dd></div>
          <div><dt>Work</dt><dd>{(profile.work_modes || []).map((m) => ({ remote: 'Remote', hybrid: 'Hybrid', onsite: 'In person' }[m])).join(', ') || 'Any'}</dd></div>
          <div><dt>Remote</dt><dd>{profile.remote_from ? `${fmtYm(toMonth(profile.remote_from))} – ${fmtYm(toMonth(profile.remote_to))}` : '—'}</dd></div>
          <div><dt>In person</dt><dd>{profile.onsite_from ? `${fmtYm(toMonth(profile.onsite_from))} – ${fmtYm(toMonth(profile.onsite_to))}` : '—'}</dd></div>
          <div><dt>US work</dt><dd>{{ citizen: 'US citizen', authorized: 'Authorised, no sponsorship needed', needs_sponsorship: 'Needs sponsorship', not_applicable: 'Not looking at US roles' }[profile.us_work_auth] || '—'}</dd></div>
          <div><dt>Pay</dt><dd>{profile.paid_only ? 'Paid only' : 'Paid or unpaid'}</dd></div>
        </dl>
      </Panel>

      <ResumeImport open={importing} onClose={() => setImporting(false)} onApplied={loadProjects} />
    </main>
  )
}
