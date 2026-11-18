// Six short steps, each laid out for its own kind of question, with a route rail showing progress.
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { geocode } from '../lib/api.js'
import { useLocationSuggestions, useMapData } from '../lib/mapdata.js'
import { COMPANY_TYPES, DEGREE_LEVELS, ROLES, ROLE_INFO, SKILLS, US_AUTH, US_AUTH_INFO, YEARS, fromMonth, toMonth } from '../lib/options.js'
import { useSession } from '../lib/session.jsx'
import { ResumeUpload } from '../ProfileSections.jsx'
import { ChipInput, ChoiceChips, Icon, Logo } from '../ui.jsx'
import WorldMap from '../WorldMap.jsx'

const STEPS = [
  { key: 'you', title: 'About you', q: 'First, a little about you' },
  { key: 'resume', title: 'Resume', q: 'Have a resume handy?' },
  { key: 'roles', title: 'Roles and skills', q: 'What kind of work are you after?' },
  { key: 'where', title: 'Where and when', q: 'Where, and when are you free?' },
  { key: 'rules', title: 'Eligibility', q: 'A couple of eligibility questions' },
  { key: 'links', title: 'Links', q: 'Last step: your links' },
]
const REQUIRED = {
  you: (d) => (d.full_name?.trim() ? null : 'Add your name to continue.'),
  roles: (d) => ((d.roles || []).length ? null : 'Pick at least one kind of role.'),
  where: (d) => ((d.locations || []).length ? null : 'Add at least one location, or Remote.'),
}

// ── step 1: a sentence you fill in ──
function You({ d, s }) {
  const w = (v, min) => ({ width: `${Math.max(min, (v || '').length + 1)}ch` })
  return (
    <div className="ob-sentence">
      <p>
        My name is <input aria-label="Full name" className="inl" style={w(d.full_name, 10)} value={d.full_name || ''} placeholder="your name"
          onChange={(e) => s('full_name')(e.target.value)} autoComplete="name" /> and I live in{' '}
        <input aria-label="Where you live" className="inl" style={w(d.based_in, 12)} value={d.based_in || ''} placeholder="Bengaluru, India"
          onChange={(e) => s('based_in')(e.target.value)} />.
      </p>
      <p>
        I’m studying <input aria-label="Degree" className="inl" style={w(d.degree, 6)} value={d.degree || ''} placeholder="B.E."
          onChange={(e) => s('degree')(e.target.value)} /> in{' '}
        <input aria-label="Major" className="inl" style={w(d.major, 14)} value={d.major || ''} placeholder="Computer Science"
          onChange={(e) => s('major')(e.target.value)} /> at{' '}
        <input aria-label="College" className="inl" style={w(d.college, 16)} value={d.college || ''} placeholder="your college"
          onChange={(e) => s('college')(e.target.value)} />.
      </p>
      <p>
        I’m in my <select aria-label="Year of study" className="inl" value={d.year_of_study || ''} onChange={(e) => s('year_of_study')(e.target.value || null)}>
          <option value="">year</option>{YEARS.filter((y) => y !== 'Graduated').map((y) => <option key={y}>{y}</option>)}<option>Graduated</option>
        </select> and graduate in{' '}
        <input aria-label="Graduation year" className="inl" type="number" min="2024" max="2035" style={{ width: '6ch' }} value={d.grad_year || ''}
          placeholder="2029" onChange={(e) => s('grad_year')(e.target.value ? Number(e.target.value) : null)} />.
      </p>
      <div className="ob-aside-q">
        <span className="ob-small-label">Degree level</span>
        <ChoiceChips single options={DEGREE_LEVELS} value={d.degree_level || 'bachelors'} onChange={s('degree_level')} label="Degree level" />
      </div>
    </div>
  )
}

// ── step 3: role cards ──
function Roles({ d, s }) {
  const [skip, setSkip] = useState((d.avoid_roles || []).length > 0)
  const on = d.roles || []
  const toggle = (r) => s('roles')(on.includes(r) ? on.filter((x) => x !== r) : [...on, r])
  return (
    <>
      <div className="role-grid" role="group" aria-label="Roles you want">
        {ROLES.map((r) => (
          <button key={r} type="button" className={`role-card${on.includes(r) ? ' on' : ''}`} aria-pressed={on.includes(r)} onClick={() => toggle(r)}>
            <span className="rc-box" aria-hidden="true">{on.includes(r) && <Icon name="check" size={12} />}</span>
            <strong>{r}</strong><span>{ROLE_INFO[r]}</span>
          </button>
        ))}
      </div>
      <div className="ob-block">
        <label className="ob-small-label" htmlFor="f-skills">Your skills</label>
        <ChipInput id="f-skills" value={d.skills || []} onChange={s('skills')} suggestions={SKILLS} placeholder="Type a skill and press Enter, e.g. Python" />
        <p className="hint">Anything goes: languages, frameworks, tools. Suggestions appear as you type.</p>
      </div>
      <div className="ob-block">
        {!skip ? <button type="button" className="link-btn" onClick={() => setSkip(true)}>Anything you’d rather not see?</button> : (
          <>
            <span className="ob-small-label">Roles to push down the list</span>
            <ChoiceChips options={ROLES.filter((r) => !on.includes(r))} value={d.avoid_roles || []} onChange={s('avoid_roles')} label="Roles to skip" />
          </>
        )}
      </div>
    </>
  )
}

// ── step 4: places on a map + two date ranges ──
const geoCache = new Map()
function Where({ d, s, home }) {
  const map = useMapData()
  const suggest = useLocationSuggestions()
  const [pins, setPins] = useState([])
  const locs = d.locations || []
  const key = locs.join('|')
  useEffect(() => {
    let alive = true
    Promise.all(locs.filter((l) => !/remote|anywhere/i.test(l)).map((l) => {
      if (!geoCache.has(l)) geoCache.set(l, geocode(l).catch(() => null))
      return geoCache.get(l)
    })).then((r) => alive && setPins(r.filter(Boolean).map((g, i) => ({ lat: g.lat, lng: g.lng, key: `p${i}` }))))
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])
  const modes = d.work_modes || []
  const toggleMode = (m) => s('work_modes')(modes.includes(m) ? modes.filter((x) => x !== m) : [...modes, m])
  const range = (kind, label, sub) => (
    <div className="when-row">
      <div><strong>{label}</strong><span>{sub}</span></div>
      <label className="sr" htmlFor={`f-${kind}f`}>{label} from</label>
      <input id={`f-${kind}f`} type="month" value={toMonth(d[`${kind}_from`])} onChange={(e) => s(`${kind}_from`)(fromMonth(e.target.value))} />
      <span className="to">to</span>
      <label className="sr" htmlFor={`f-${kind}t`}>{label} until</label>
      <input id={`f-${kind}t`} type="month" value={toMonth(d[`${kind}_to`])} onChange={(e) => s(`${kind}_to`)(fromMonth(e.target.value, true))} />
    </div>
  )
  return (
    <div className="where-grid">
      <div>
        <label className="ob-small-label" htmlFor="f-locs">Places you’d work</label>
        <ChipInput id="f-locs" value={locs} onChange={s('locations')} suggestions={suggest} placeholder="Type a city, e.g. Austin" />
        <p className="hint">Cities, metros, “Anywhere in US”, or Remote.</p>
        <span className="ob-small-label sp">How you’d like to work</span>
        <div className="seg-ctl" role="group" aria-label="Work modes">
          {[['remote', 'Remote'], ['hybrid', 'Hybrid'], ['onsite', 'In person']].map(([v, l]) => (
            <button key={v} type="button" aria-pressed={modes.includes(v)} className={modes.includes(v) ? 'on' : ''} onClick={() => toggleMode(v)}>{l}</button>
          ))}
        </div>
        <span className="ob-small-label sp">When you’re free</span>
        {range('remote', 'Remote', 'e.g. during the semester')}
        {range('onsite', 'In person', 'e.g. over the summer')}
      </div>
      <div className="where-map" aria-hidden="true">
        <WorldMap cities={map.cities} home={home} pins={pins} compact />
        <p>{pins.length ? `${pins.length} ${pins.length === 1 ? 'place' : 'places'} on your map` : 'Places you add appear here'}</p>
      </div>
    </div>
  )
}

// ── step 5: one question per card ──
function Rules({ d, s }) {
  const [more, setMore] = useState((d.company_types || []).length > 0)
  return (
    <>
      <fieldset className="ob-q">
        <legend>Can you work in the US?</legend>
        <div className="radio-cards">
          {US_AUTH.map((o) => (
            <label key={o.value} className={`radio-card${(d.us_work_auth || 'not_applicable') === o.value ? ' on' : ''}`}>
              <input type="radio" name="usauth" checked={(d.us_work_auth || 'not_applicable') === o.value} onChange={() => s('us_work_auth')(o.value)} />
              <span><strong>{o.label}</strong><small>{US_AUTH_INFO[o.value]}</small></span>
            </label>
          ))}
        </div>
      </fieldset>
      <fieldset className="ob-q">
        <legend>Does it need to be paid?</legend>
        <div className="seg-ctl" role="radiogroup" aria-label="Pay">
          {[[false, 'Paid or unpaid is fine'], [true, 'Paid only']].map(([v, l]) => (
            <button key={l} type="button" role="radio" aria-checked={Boolean(d.paid_only) === v} className={Boolean(d.paid_only) === v ? 'on' : ''} onClick={() => s('paid_only')(v)}>{l}</button>
          ))}
        </div>
      </fieldset>
      {!more ? <button type="button" className="link-btn" onClick={() => setMore(true)}>Prefer certain kinds of companies?</button> : (
        <fieldset className="ob-q">
          <legend>Kinds of companies you like <small>Optional</small></legend>
          <ChoiceChips options={COMPANY_TYPES} value={d.company_types || []} onChange={s('company_types')} label="Company types" />
        </fieldset>
      )}
    </>
  )
}

// ── step 6: links + a summary of everything ──
function Links({ d, s }) {
  const field = (k, label, ph) => (
    <label className="pre-field">
      <span className="pf-label">{label}</span>
      <span className="pf-box"><input type="url" value={d[k] || ''} placeholder={ph} onChange={(e) => s(k)(e.target.value)} /></span>
    </label>
  )
  const when = (a, b) => (a ? `${new Date(a).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })}${b ? ` to ${new Date(b).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })}` : ''}` : null)
  const summary = [
    ['Roles', (d.roles || []).join(', ')],
    ['Skills', (d.skills || []).slice(0, 8).join(', ') + ((d.skills || []).length > 8 ? ` +${d.skills.length - 8}` : '')],
    ['Places', (d.locations || []).join(', ')],
    ['Remote', when(d.remote_from, d.remote_to)],
    ['In person', when(d.onsite_from, d.onsite_to)],
  ].filter(([, v]) => v)
  return (
    <div className="links-grid">
      <div>
        <label className="pre-field">
          <span className="pf-label">One-line headline</span>
          <span className="pf-box"><input value={d.headline || ''} placeholder="CS student building AI-powered full-stack apps" onChange={(e) => s('headline')(e.target.value)} /></span>
        </label>
        {field('linkedin', 'LinkedIn', 'https://linkedin.com/in/you')}
        {field('github', 'GitHub', 'https://github.com/you')}
        {field('portfolio', 'Website or portfolio', 'https://you.dev')}
      </div>
      <div className="ob-summary">
        <h3>What we’ll match on</h3>
        <dl>{summary.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>
        <p className="hint">You can change any of this later in your profile.</p>
      </div>
    </div>
  )
}

export default function Onboarding() {
  const { user, profile, update, home } = useSession()
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

  async function go(to) {
    const problem = to > step ? REQUIRED[sec.key]?.(draft) : null
    if (problem) { setErr(problem); return }
    setErr(''); setSaving(true)
    try {
      await update({ ...draft, onboarded: to >= STEPS.length ? true : draft.onboarded })  // save as you go
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
    resume: <div className="ob-resume"><ResumeUpload d={draft} setDraft={setDraft} userId={user.id} />
      <p className="hint">We read it once to fill in your skills, experience and projects. You can review everything later.</p></div>,
    roles: <Roles d={draft} s={s} />,
    where: <Where d={draft} s={s} home={home} />,
    rules: <Rules d={draft} s={s} />,
    links: <Links d={draft} s={s} />,
  }[sec.key]

  return (
    <div className="ob">
      <aside className="ob-rail" aria-label="Progress">
        <span className="wordmark"><Logo />Internship Copilot</span>
        <ol>
          {STEPS.map((t, i) => (
            <li key={t.key} className={i === step ? 'on' : i < step ? 'done' : ''}>
              <button type="button" disabled={i > step || saving} onClick={() => go(i)} aria-current={i === step ? 'step' : undefined}>
                <i aria-hidden="true" />{t.title}
              </button>
            </li>
          ))}
        </ol>
        <p className="ob-rail-foot">Saved as you go.</p>
      </aside>

      <main className={`ob-main ob-${sec.key}`}>
        <p className="ob-count">Step {step + 1} of {STEPS.length}</p>
        <h1>{sec.q}</h1>
        <div className="ob-body" key={sec.key}>{body}</div>
        {err && <p className="form-error" role="alert">{err}</p>}
        <div className="ob-actions">
          {step > 0 ? <button type="button" className="btn btn-text" onClick={() => go(step - 1)} disabled={saving}>Back</button> : <span />}
          <div className="ob-right">
            {(sec.key === 'resume' || sec.key === 'links') && !last && (
              <button type="button" className="btn btn-text" onClick={() => go(step + 1)}>Skip</button>
            )}
            <button type="button" className="btn btn-primary" onClick={() => go(step + 1)} disabled={saving}>
              {saving ? 'Saving…' : last ? 'Finish and see my matches' : 'Continue'}
            </button>
          </div>
        </div>
      </main>
    </div>
  )
}
