// Six short steps in one compact, centred panel. Saved as you go.
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLocationSuggestions } from '../lib/mapdata.js'
import { COMPANY_TYPES, DEGREE_LEVELS, ROLES, SKILLS, US_AUTH, US_AUTH_INFO, YEARS, fromMonth, toMonth } from '../lib/options.js'
import { useSession } from '../lib/session.jsx'
import { ResumeUpload } from '../ProfileSections.jsx'
import { ChipInput, ChoiceChips, Field, Logo } from '../ui.jsx'

const STEPS = [
  { key: 'you', title: 'About you', sub: 'The basics, so matches fit where you are in your degree.' },
  { key: 'resume', title: 'Your resume', sub: 'Optional. We read it once to fill in your skills and experience.' },
  { key: 'roles', title: 'What you’re looking for', sub: 'Pick the kinds of roles you want and the skills you have.' },
  { key: 'where', title: 'Where and when', sub: 'Places you’d work and when you’re free.' },
  { key: 'rules', title: 'Eligibility', sub: 'So we can rank roles you can actually take.' },
  { key: 'links', title: 'Your links', sub: 'Optional. Used for your portfolio and to autofill applications.' },
]
const REQUIRED = {
  you: (d) => (d.full_name?.trim() ? null : 'Add your name to continue.'),
  roles: (d) => ((d.roles || []).length ? null : 'Pick at least one kind of role.'),
  where: (d) => ((d.locations || []).length ? null : 'Add at least one location, or Remote.'),
}

function You({ d, s }) {
  return (
    <div className="grid2">
      <Field label="Full name" htmlFor="f-name"><input id="f-name" value={d.full_name || ''} onChange={(e) => s('full_name')(e.target.value)} autoComplete="name" /></Field>
      <Field label="Where you live" htmlFor="f-based"><input id="f-based" value={d.based_in || ''} placeholder="Bengaluru, India" onChange={(e) => s('based_in')(e.target.value)} /></Field>
      <Field label="College" htmlFor="f-college" wide><input id="f-college" value={d.college || ''} placeholder="RV College of Engineering" onChange={(e) => s('college')(e.target.value)} /></Field>
      <Field label="Degree" htmlFor="f-degree"><input id="f-degree" value={d.degree || ''} placeholder="B.E." onChange={(e) => s('degree')(e.target.value)} /></Field>
      <Field label="Major" htmlFor="f-major"><input id="f-major" value={d.major || ''} placeholder="Computer Science" onChange={(e) => s('major')(e.target.value)} /></Field>
      <Field label="Year of study" htmlFor="f-year">
        <select id="f-year" className="select" value={d.year_of_study || ''} onChange={(e) => s('year_of_study')(e.target.value || null)}>
          <option value="">Select</option>{YEARS.map((y) => <option key={y}>{y}</option>)}
        </select>
      </Field>
      <Field label="Graduation year" htmlFor="f-grad">
        <input id="f-grad" type="number" min="2024" max="2035" value={d.grad_year || ''} placeholder="2029"
          onChange={(e) => s('grad_year')(e.target.value ? Number(e.target.value) : null)} />
      </Field>
      <div className="field wide">
        <span className="f-label">Degree level</span>
        <ChoiceChips single options={DEGREE_LEVELS} value={d.degree_level || 'bachelors'} onChange={s('degree_level')} label="Degree level" />
      </div>
    </div>
  )
}

function Roles({ d, s }) {
  const [skip, setSkip] = useState((d.avoid_roles || []).length > 0)
  return (
    <>
      <div className="field">
        <span className="f-label">Roles you want</span>
        <ChoiceChips options={ROLES} value={d.roles || []} onChange={s('roles')} label="Roles you want" />
      </div>
      <Field label="Skills" htmlFor="f-skills" hint="Type anything and press Enter. Suggestions appear as you type.">
        <ChipInput id="f-skills" value={d.skills || []} onChange={s('skills')} suggestions={SKILLS} placeholder="Python, React, FastAPI…" />
      </Field>
      {!skip ? <button type="button" className="link-btn" onClick={() => setSkip(true)}>Anything you’d rather not see?</button> : (
        <div className="field">
          <span className="f-label">Roles to push down the list</span>
          <ChoiceChips options={ROLES.filter((r) => !(d.roles || []).includes(r))} value={d.avoid_roles || []} onChange={s('avoid_roles')} label="Roles to skip" />
        </div>
      )}
    </>
  )
}

function Range({ d, s, kind, label }) {
  return (
    <div className="ob-range">
      <span className="ob-range-l">{label}</span>
      <label className="sr" htmlFor={`f-${kind}f`}>{label} from</label>
      <input id={`f-${kind}f`} type="month" value={toMonth(d[`${kind}_from`])} onChange={(e) => s(`${kind}_from`)(fromMonth(e.target.value))} />
      <span className="ob-range-to">to</span>
      <label className="sr" htmlFor={`f-${kind}t`}>{label} until</label>
      <input id={`f-${kind}t`} type="month" value={toMonth(d[`${kind}_to`])} onChange={(e) => s(`${kind}_to`)(fromMonth(e.target.value, true))} />
    </div>
  )
}

function Where({ d, s }) {
  const suggest = useLocationSuggestions()
  const modes = d.work_modes || []
  const toggle = (m) => s('work_modes')(modes.includes(m) ? modes.filter((x) => x !== m) : [...modes, m])
  return (
    <>
      <Field label="Places you’d work" htmlFor="f-locs" hint="Cities, metros, “Anywhere in US”, or Remote.">
        <ChipInput id="f-locs" value={d.locations || []} onChange={s('locations')} suggestions={suggest} placeholder="Austin, Bangalore, Remote…" />
      </Field>
      <div className="field">
        <span className="f-label">How you’d like to work</span>
        <div className="seg-ctl" role="group" aria-label="Work modes">
          {[['remote', 'Remote'], ['hybrid', 'Hybrid'], ['onsite', 'In person']].map(([v, l]) => (
            <button key={v} type="button" aria-pressed={modes.includes(v)} className={modes.includes(v) ? 'on' : ''} onClick={() => toggle(v)}>{l}</button>
          ))}
        </div>
      </div>
      <div className="field">
        <span className="f-label">When you’re free</span>
        <Range d={d} s={s} kind="remote" label="Remote" />
        <Range d={d} s={s} kind="onsite" label="In person" />
      </div>
    </>
  )
}

function Rules({ d, s }) {
  const [more, setMore] = useState((d.company_types || []).length > 0)
  const auth = d.us_work_auth || 'not_applicable'
  return (
    <>
      <fieldset className="field ob-fs">
        <legend className="f-label">Can you work in the US?</legend>
        <div className="ob-radios">
          {US_AUTH.map((o) => (
            <label key={o.value} className={auth === o.value ? 'on' : ''}>
              <input type="radio" name="usauth" checked={auth === o.value} onChange={() => s('us_work_auth')(o.value)} />
              <span><strong>{o.label}</strong><small>{US_AUTH_INFO[o.value]}</small></span>
            </label>
          ))}
        </div>
      </fieldset>
      <div className="field">
        <span className="f-label">Pay</span>
        <div className="seg-ctl" role="radiogroup" aria-label="Pay">
          {[[false, 'Paid or unpaid'], [true, 'Paid only']].map(([v, l]) => (
            <button key={l} type="button" role="radio" aria-checked={Boolean(d.paid_only) === v} className={Boolean(d.paid_only) === v ? 'on' : ''} onClick={() => s('paid_only')(v)}>{l}</button>
          ))}
        </div>
      </div>
      {!more ? <button type="button" className="link-btn" onClick={() => setMore(true)}>Prefer certain kinds of companies?</button> : (
        <div className="field">
          <span className="f-label">Kinds of companies you like</span>
          <ChoiceChips options={COMPANY_TYPES} value={d.company_types || []} onChange={s('company_types')} label="Company types" />
        </div>
      )}
    </>
  )
}

function Links({ d, s }) {
  const f = (k, label, ph, type = 'url') => (
    <Field label={label} htmlFor={`f-${k}`}><input id={`f-${k}`} type={type} value={d[k] || ''} placeholder={ph} onChange={(e) => s(k)(e.target.value)} /></Field>
  )
  return (
    <>
      {f('headline', 'One-line headline', 'CS student building AI-powered full-stack apps', 'text')}
      <div className="grid2">
        {f('linkedin', 'LinkedIn', 'https://linkedin.com/in/you')}
        {f('github', 'GitHub', 'https://github.com/you')}
        {f('portfolio', 'Website', 'https://you.dev')}
        {f('phone', 'Phone', '+91 98765 43210', 'tel')}
      </div>
    </>
  )
}

export default function Onboarding() {
  const { user, profile, update } = useSession()
  const nav = useNavigate()
  const [step, setStep] = useState(0)
  const [draft, setDraft] = useState(null)
  const [err, setErr] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (profile && !draft) {
      setDraft({ degree_level: 'bachelors', us_work_auth: 'not_applicable', work_modes: ['remote', 'hybrid', 'onsite'],
        ...profile, full_name: profile.full_name || user?.user_metadata?.full_name || '' })
    }
  }, [profile])

  const s = useMemo(() => (k) => (v) => setDraft((d) => ({ ...d, [k]: v })), [])
  if (!draft) return null
  const sec = STEPS[step]
  const last = step === STEPS.length - 1
  const optional = sec.key === 'resume' || sec.key === 'links'

  async function go(to) {
    const problem = to > step ? REQUIRED[sec.key]?.(draft) : null
    if (problem) { setErr(problem); return }
    setErr(''); setSaving(true)
    try {
      await update({ ...draft, onboarded: to >= STEPS.length ? true : draft.onboarded })
      if (to >= STEPS.length) nav('/app', { replace: true })
      else { setStep(to); window.scrollTo(0, 0) }
    } catch (e) {
      setErr(e.message)
    } finally {
      setSaving(false)
    }
  }

  const body = {
    you: <You d={draft} s={s} />,
    resume: <ResumeUpload d={draft} setDraft={setDraft} userId={user.id} />,
    roles: <Roles d={draft} s={s} />,
    where: <Where d={draft} s={s} />,
    rules: <Rules d={draft} s={s} />,
    links: <Links d={draft} s={s} />,
  }[sec.key]

  return (
    <div className="ob">
      <header className="ob-top">
        <span className="wordmark"><Logo />Internship Copilot</span>
        <span className="ob-count">Step {step + 1} of {STEPS.length}</span>
      </header>

      <main className="ob-panel">
        <ol className="ob-progress" aria-label="Progress">
          {STEPS.map((t, i) => (
            <li key={t.key} className={i < step ? 'done' : i === step ? 'on' : ''}>
              <button type="button" disabled={i > step || saving} onClick={() => go(i)} aria-current={i === step ? 'step' : undefined}>
                <span className="sr">{t.title}</span>
              </button>
            </li>
          ))}
        </ol>

        <h1>{sec.title}</h1>
        <p className="ob-sub">{sec.sub}</p>

        <div className="ob-body" key={sec.key}>{body}</div>

        {err && <p className="form-error" role="alert">{err}</p>}

        <footer className="ob-actions">
          {step > 0 ? <button type="button" className="btn btn-text" onClick={() => go(step - 1)} disabled={saving}>Back</button> : <span />}
          <div className="ob-right">
            {optional && !last && <button type="button" className="btn btn-text" onClick={() => go(step + 1)} disabled={saving}>Skip</button>}
            <button type="button" className="btn btn-primary" onClick={() => go(step + 1)} disabled={saving}>
              {saving ? 'Saving…' : last ? 'Finish' : 'Continue'}
            </button>
          </div>
        </footer>
      </main>
      <p className="ob-foot">Saved as you go. You can change any of this later in your profile.</p>
    </div>
  )
}
