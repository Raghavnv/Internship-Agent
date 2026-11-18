// The questions asked in onboarding, also used (all at once) on the Profile page.
import { useRef, useState } from 'react'
import { parseResume } from './lib/api.js'
import { projects as P, uploadResume } from './lib/backend.js'
import { fillEmpty } from './lib/resumeMerge.js'
import { COMPANY_TYPES, DEGREE_LEVELS, ROLES, SKILLS, US_AUTH, WORK_MODES, YEARS, fromMonth, toMonth } from './lib/options.js'
import { ChipInput, ChoiceChips, Field, Icon, Spinner } from './ui.jsx'
import { useLocationSuggestions } from './lib/mapdata.js'

export const SECTIONS = [
  { key: 'about', title: 'About you', intro: 'The basics, so we can match your level and background.' },
  { key: 'resume', title: 'Your resume', intro: 'Optional, but it fills in your skills for you and powers resume feedback later.' },
  { key: 'interests', title: 'What you’re looking for', intro: 'Pick the kinds of roles you want. We use these to score every listing.' },
  { key: 'where', title: 'Where and when', intro: 'Cities you’d work in and the months you’re free.' },
  { key: 'eligibility', title: 'Eligibility and preferences', intro: 'So we can flag roles you can’t take before you spend time on them.' },
  { key: 'links', title: 'Your links', intro: 'Used on your portfolio page. Add whatever you have.' },
]

const set = (draft, setDraft) => (k) => (v) => setDraft({ ...draft, [k]: v })

function About({ d, s }) {
  return (
    <div className="grid2">
      <Field label="Full name" htmlFor="f-name"><input id="f-name" value={d.full_name || ''} onChange={(e) => s('full_name')(e.target.value)} autoComplete="name" /></Field>
      <Field label="Where you live now" htmlFor="f-city" hint="City and country, e.g. Bengaluru, India"><input id="f-city" value={d.based_in || ''} onChange={(e) => s('based_in')(e.target.value)} /></Field>
      <Field label="College or university" htmlFor="f-col" wide><input id="f-col" value={d.college || ''} onChange={(e) => s('college')(e.target.value)} /></Field>
      <Field label="Degree" htmlFor="f-deg" hint="e.g. B.E., B.Tech, B.S."><input id="f-deg" value={d.degree || ''} onChange={(e) => s('degree')(e.target.value)} /></Field>
      <Field label="Major" htmlFor="f-maj" hint="e.g. Computer Science"><input id="f-maj" value={d.major || ''} onChange={(e) => s('major')(e.target.value)} /></Field>
      <Field label="Degree level" wide><ChoiceChips single options={DEGREE_LEVELS} value={d.degree_level || 'bachelors'} onChange={s('degree_level')} label="Degree level" /></Field>
      <Field label="Year of study" wide><ChoiceChips single options={YEARS} value={d.year_of_study} onChange={s('year_of_study')} label="Year of study" /></Field>
      <Field label="Graduation year" htmlFor="f-grad">
        <input id="f-grad" type="number" min="2024" max="2035" value={d.grad_year || ''} onChange={(e) => s('grad_year')(e.target.value ? Number(e.target.value) : null)} />
      </Field>
    </div>
  )
}

export function ResumeUpload({ d, setDraft, userId }) {
  const ref = useRef(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')
  async function onFile(e) {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f) return
    setBusy(true); setErr(''); setMsg('')
    try {
      const [parsed, path, existing] = await Promise.all([parseResume(f), uploadResume(userId, f), P.list().catch(() => [])])
      const found = parsed.profile || {}
      const { patch, newProjects } = fillEmpty(d, existing || [], found)
      for (const [i, p] of newProjects.entries()) await P.save({ ...p, position: (existing || []).length + i })
      setDraft({ ...d, ...patch, resume_path: path, resume_text: parsed.text, resume_updated_at: new Date().toISOString() })
      const bits = [
        (found.skills || []).length && `${found.skills.length} skills`,
        (found.experience || []).length && `${found.experience.length} ${found.experience.length === 1 ? 'role' : 'roles'} of experience`,
        newProjects.length && `${newProjects.length} ${newProjects.length === 1 ? 'project' : 'projects'}`,
        (found.education || []).length && 'your education',
      ].filter(Boolean)
      setMsg(bits.length ? `Read your resume and filled in ${bits.join(', ')}. You can review everything on your Profile later.` : 'Saved your resume. Add your skills on the next step.')
    } catch (ex) {
      setErr(ex.message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="resume-drop">
      <button type="button" className="drop" onClick={() => ref.current?.click()} disabled={busy}>
        {busy ? <Spinner label="Reading your resume" /> : <Icon name="upload" size={22} />}
        <strong>{busy ? 'Reading your resume…' : d.resume_path ? 'Replace resume' : 'Upload your resume'}</strong>
        <span>PDF, up to 5 MB</span>
      </button>
      <input ref={ref} type="file" accept="application/pdf" hidden onChange={onFile} />
      {d.resume_path && !busy && !msg && <p className="form-info">Resume on file.</p>}
      {msg && <p className="form-info" role="status">{msg}</p>}
      {err && <p className="form-error" role="alert">{err}</p>}
    </div>
  )
}

function Interests({ d, s }) {
  return (
    <>
      <Field label="Roles you want" wide><ChoiceChips options={ROLES} value={d.roles || []} onChange={s('roles')} label="Roles you want" /></Field>
      <Field label="Your skills" htmlFor="f-skills" hint="Type anything and press Enter. Suggestions appear as you type." wide>
        <ChipInput id="f-skills" value={d.skills || []} onChange={s('skills')} suggestions={SKILLS} placeholder="Python, React, SQL…" />
      </Field>
      <Field label="Roles to skip" hint="We’ll push these down the list." wide>
        <ChoiceChips options={ROLES.filter((r) => !(d.roles || []).includes(r))} value={d.avoid_roles || []} onChange={s('avoid_roles')} label="Roles to skip" />
      </Field>
    </>
  )
}

function Where({ d, s }) {
  const locSuggest = useLocationSuggestions()
  return (
    <>
      <Field label="Preferred locations" htmlFor="f-locs" hint="Cities, metros, or “Anywhere in US”. Add Remote if you’d work remotely." wide>
        <ChipInput id="f-locs" value={d.locations || []} onChange={s('locations')} suggestions={locSuggest} placeholder="Bay Area, Bangalore…" />
      </Field>
      <Field label="How you’d like to work" wide><ChoiceChips options={WORK_MODES} value={d.work_modes || []} onChange={s('work_modes')} label="Work modes" /></Field>
      <div className="grid2">
        <Field label="Free to intern remotely from" htmlFor="f-rf"><input id="f-rf" type="month" value={toMonth(d.remote_from)} onChange={(e) => s('remote_from')(fromMonth(e.target.value))} /></Field>
        <Field label="until" htmlFor="f-rt"><input id="f-rt" type="month" value={toMonth(d.remote_to)} onChange={(e) => s('remote_to')(fromMonth(e.target.value, true))} /></Field>
        <Field label="Free to intern in person from" htmlFor="f-of"><input id="f-of" type="month" value={toMonth(d.onsite_from)} onChange={(e) => s('onsite_from')(fromMonth(e.target.value))} /></Field>
        <Field label="until" htmlFor="f-ot"><input id="f-ot" type="month" value={toMonth(d.onsite_to)} onChange={(e) => s('onsite_to')(fromMonth(e.target.value, true))} /></Field>
      </div>
    </>
  )
}

function Eligibility({ d, s }) {
  return (
    <>
      <Field label="Can you work in the US?" wide><ChoiceChips single options={US_AUTH} value={d.us_work_auth || 'not_applicable'} onChange={s('us_work_auth')} label="US work authorisation" /></Field>
      <Field label="Pay" wide>
        <ChoiceChips single options={[{ value: 'any', label: 'Paid or unpaid is fine' }, { value: 'paid', label: 'Paid only' }]}
          value={d.paid_only ? 'paid' : 'any'} onChange={(v) => s('paid_only')(v === 'paid')} label="Pay" />
      </Field>
      <Field label="Kinds of companies you like" hint="Optional." wide><ChoiceChips options={COMPANY_TYPES} value={d.company_types || []} onChange={s('company_types')} label="Company types" /></Field>
    </>
  )
}

function Links({ d, s }) {
  return (
    <div className="grid2">
      <Field label="One-line headline" htmlFor="f-head" hint="e.g. CS student building AI-powered full-stack apps" wide><input id="f-head" value={d.headline || ''} onChange={(e) => s('headline')(e.target.value)} /></Field>
      <Field label="LinkedIn" htmlFor="f-li"><input id="f-li" type="url" placeholder="https://linkedin.com/in/…" value={d.linkedin || ''} onChange={(e) => s('linkedin')(e.target.value)} /></Field>
      <Field label="GitHub" htmlFor="f-gh"><input id="f-gh" type="url" placeholder="https://github.com/…" value={d.github || ''} onChange={(e) => s('github')(e.target.value)} /></Field>
      <Field label="Portfolio or website" htmlFor="f-pf" wide><input id="f-pf" type="url" placeholder="https://…" value={d.portfolio || ''} onChange={(e) => s('portfolio')(e.target.value)} /></Field>
    </div>
  )
}

const PARTS = { about: About, resume: ResumeUpload, interests: Interests, where: Where, eligibility: Eligibility, links: Links }

export function Section({ k, draft, setDraft, userId }) {
  const Part = PARTS[k]
  return <Part d={draft} s={set(draft, setDraft)} setDraft={setDraft} userId={userId} />
}
