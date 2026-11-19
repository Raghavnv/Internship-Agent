// Set up the browser extension that fills application forms (Workday, Greenhouse, Lever…) from your profile.
import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useSession } from '../lib/session.jsx'
import { CopyButton } from '../ui.jsx'
import { fmtYm, range } from './Profile.jsx'

const US_STATES = /^(AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY|DC)$/

function place(basedIn) {
  const parts = (basedIn || '').split(',').map((s) => s.trim()).filter(Boolean)
  if (!parts.length) return {}
  if (parts.length === 1) return { city: parts[0] }
  if (parts.length === 2) return US_STATES.test(parts[1]) ? { city: parts[0], state: parts[1], country: 'United States' } : { city: parts[0], country: parts[1] }
  return { city: parts[0], state: parts[1], country: parts.at(-1) }
}

// The data the extension fills with. Kept small and plain; it lives only in your browser once pasted.
export function autofillProfile(profile, email) {
  const name = (profile?.full_name || '').trim()
  const [first, ...rest] = name.split(/\s+/)
  const edu = (profile?.education || []).length ? profile.education
    : profile?.college ? [{ school: profile.college, degree: profile.degree, field: profile.major, end: profile.grad_year ? `${profile.grad_year}-06` : null }] : []
  return {
    full_name: name || null, first_name: first || null, last_name: rest.join(' ') || null,
    email: email || null, phone: profile?.phone || null, based_in: profile?.based_in || null, ...place(profile?.based_in),
    linkedin: profile?.linkedin || null, github: profile?.github || null, portfolio: profile?.portfolio || null,
    headline: profile?.headline || null, grad_year: profile?.grad_year || null,
    education: edu.map((e) => ({ school: e.school, degree: e.degree || null, field: e.field || null, start: e.start || null, end: e.end || null, grade: e.grade || null })),
    experience: (profile?.experience || []).map((e) => ({
      title: e.title, company: e.company, location: e.location || null, start: e.start || null, end: e.end || null, current: Boolean(e.current),
      description: (e.bullets || []).filter(Boolean).join('\n'),
    })),
    skills: profile?.skills || [],
  }
}

export function profileCode(data) {
  const json = JSON.stringify({ v: 1, p: data })
  const b64 = btoa(unescape(encodeURIComponent(json))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  return `ICP1.${b64}`
}

export default function Autofill() {
  const { profile, user } = useSession()
  const data = useMemo(() => autofillProfile(profile, user?.email), [profile, user?.email])
  const code = useMemo(() => profileCode(data), [data])
  const missing = [
    !data.phone && 'phone number', !data.experience.length && 'work experience', !data.education.length && 'education',
    !data.linkedin && 'LinkedIn',
  ].filter(Boolean)

  return (
    <main className="page">
      <header className="page-head">
        <div>
          <h1>Autofill applications</h1>
          <p className="sub">A small Chrome extension that fills Workday, Greenhouse, Lever, Ashby and most other application forms from your profile, including your work experience and role descriptions.</p>
        </div>
      </header>

      <div className="af-grid">
        <ol className="af-steps">
          <li>
            <h2>Install the extension</h2>
            <p>It works in Chrome, Edge, Brave and Arc. It only touches a page when you click it, and your profile stays in your browser.</p>
            <a className="btn btn-primary" href="/internship-copilot-autofill.zip" download>Download the extension</a>
            <ol className="af-sub">
              <li>Unzip the download.</li>
              <li>Open <code>chrome://extensions</code> and turn on <b>Developer mode</b> (top right).</li>
              <li>Click <b>Load unpacked</b> and choose the unzipped folder. Pin it from the puzzle-piece menu.</li>
            </ol>
          </li>
          <li>
            <h2>Connect your profile</h2>
            <p>Copy this code, click the extension’s icon and paste it in. Copy it again whenever you update your profile.</p>
            <div className="af-code">
              <code>{code.slice(0, 42)}…</code>
              <CopyButton text={code} label="Copy profile code" className="btn btn-ghost btn-sm" />
            </div>
          </li>
          <li>
            <h2>Fill an application</h2>
            <p>Open the application, click the extension, then <b>Fill this page</b>. Filled fields are outlined so you can check them.</p>
            <ul className="af-tips">
              <li><b>Workday:</b> click <b>Add</b> under Work Experience and Education first, so the empty boxes exist, then fill. Repeat on each step of the form.</li>
              <li>Dropdowns with unusual options and the resume upload are left for you; the extension lists every value with a copy button.</li>
              <li>It never overwrites something you’ve already typed.</li>
            </ul>
          </li>
        </ol>

        <aside className="af-preview" aria-labelledby="af-h">
          <div className="sec-head"><h2 id="af-h">What gets filled</h2><Link to="/app/profile" className="link">Edit profile</Link></div>
          {missing.length > 0 && <p className="form-info">Add your {missing.join(', ')} in your profile so those fields fill too.</p>}
          <dl className="af-kv">
            {[['Name', data.full_name], ['Email', data.email], ['Phone', data.phone], ['Location', [data.city, data.state, data.country].filter(Boolean).join(', ')],
              ['LinkedIn', data.linkedin], ['GitHub', data.github], ['Website', data.portfolio]].map(([k, v]) => (
              <div key={k}><dt>{k}</dt><dd className={v ? '' : 'none'}>{v || 'Not set'}</dd></div>
            ))}
          </dl>
          {data.education.length > 0 && (
            <>
              <h3>Education</h3>
              <ul className="af-list">{data.education.map((e, i) => (
                <li key={i}><strong>{e.school}</strong><span>{[e.degree, e.field].filter(Boolean).join(', ')}{(e.start || e.end) && ` · ${range(e)}`}</span></li>
              ))}</ul>
            </>
          )}
          {data.experience.length > 0 && (
            <>
              <h3>Work experience</h3>
              <ul className="af-list">{data.experience.map((e, i) => (
                <li key={i}>
                  <strong>{e.title}, {e.company}</strong>
                  <span>{e.start ? `${fmtYm(e.start)} to ${e.current ? 'present' : e.end ? fmtYm(e.end) : '?'}` : 'Dates not set'}</span>
                  {e.description && <p className="af-desc">{e.description}</p>}
                </li>
              ))}</ul>
            </>
          )}
        </aside>
      </div>
    </main>
  )
}
