import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSession } from '../lib/session.jsx'
import { SECTIONS, Section } from '../ProfileSections.jsx'
import { Logo } from '../ui.jsx'

const REQUIRED = {
  about: (d) => (d.full_name ? null : 'Add your name to continue.'),
  interests: (d) => ((d.roles || []).length ? null : 'Pick at least one kind of role.'),
  where: (d) => ((d.locations || []).length ? null : 'Add at least one location (or Remote).'),
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

  if (!draft) return null
  const sec = SECTIONS[step]
  const last = step === SECTIONS.length - 1

  async function next() {
    const problem = REQUIRED[sec.key]?.(draft)
    if (problem) { setErr(problem); return }
    setErr(''); setSaving(true)
    try {
      await update({ ...draft, onboarded: last ? true : draft.onboarded })  // save as you go
      if (last) nav('/app', { replace: true })
      else { setStep(step + 1); window.scrollTo(0, 0) }
    } catch (e) {
      setErr(e.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <main className="onboard">
      <header className="ob-top">
        <span className="wordmark"><Logo />Internship Copilot</span>
        <span className="ob-count">Step {step + 1} of {SECTIONS.length}</span>
      </header>
      <div className="ob-progress" aria-hidden="true"><span style={{ width: `${((step + 1) / SECTIONS.length) * 100}%` }} /></div>
      <ol className="ob-steps" aria-label="Steps">
        {SECTIONS.map((s, i) => (
          <li key={s.key} className={i === step ? 'on' : i < step ? 'done' : ''}>
            <button type="button" disabled={i > step} onClick={() => setStep(i)}>{s.title}</button>
          </li>
        ))}
      </ol>
      <section className="ob-card" aria-labelledby="ob-h">
        <h1 id="ob-h">{sec.title}</h1>
        <p className="sub">{sec.intro}</p>
        <div className="ob-body"><Section k={sec.key} draft={draft} setDraft={setDraft} userId={user.id} /></div>
        {err && <p className="form-error" role="alert">{err}</p>}
        <div className="ob-actions">
          {step > 0 ? <button type="button" className="btn btn-ghost" onClick={() => setStep(step - 1)}>Back</button> : <span />}
          <div className="ob-right">
            {(sec.key === 'resume' || sec.key === 'links') && !last && (
              <button type="button" className="btn btn-text" onClick={() => setStep(step + 1)}>Skip for now</button>
            )}
            <button type="button" className="btn btn-primary" onClick={next} disabled={saving}>
              {saving ? 'Saving…' : last ? 'Finish and see my matches' : 'Continue'}
            </button>
          </div>
        </div>
      </section>
    </main>
  )
}
