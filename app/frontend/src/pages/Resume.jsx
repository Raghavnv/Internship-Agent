import { useRef, useState } from 'react'
import { parseResume, reviewResume } from '../lib/api.js'
import { resumeUrl, uploadResume } from '../lib/backend.js'
import { useSession } from '../lib/session.jsx'
import { useUserData } from '../lib/userdata.jsx'
import { RichText } from '../components.jsx'
import { Icon, Spinner } from '../ui.jsx'

export default function Resume() {
  const { user, profile, update } = useSession()
  const { apps, saved } = useUserData()
  const ref = useRef(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')
  const [target, setTarget] = useState('')
  const [custom, setCustom] = useState({ title: '', company: '', notes: '' })
  const [review, setReview] = useState(null)
  const [reviewing, setReviewing] = useState(false)

  const options = [
    ...saved.map((s) => ({ key: `s:${s.job_id}`, job: s.job, label: `${s.job.title} at ${s.job.company} (saved)` })),
    ...apps.map((a) => ({ key: `a:${a.id}`, job: { title: a.title, company: a.company, locations: [a.location], terms: a.terms }, label: `${a.title} at ${a.company} (applied)` })),
  ]

  async function onFile(e) {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f) return
    setBusy(true); setErr(''); setMsg('')
    try {
      const [parsed, path] = await Promise.all([parseResume(f), uploadResume(user.id, f)])
      const p = parsed.profile || {}
      const newSkills = (p.skills || []).filter((s) => !(profile.skills || []).some((x) => x.toLowerCase() === s.toLowerCase()))
      await update({ resume_path: path, resume_text: parsed.text, skills: [...(profile.skills || []), ...newSkills] })
      setMsg(newSkills.length ? `Resume saved. Added ${newSkills.length} new skills to your profile: ${newSkills.slice(0, 6).join(', ')}${newSkills.length > 6 ? '…' : ''}` : 'Resume saved.')
    } catch (ex) { setErr(ex.message) } finally { setBusy(false) }
  }

  async function open() {
    try { const u = await resumeUrl(profile.resume_path); if (u) window.open(u, '_blank', 'noopener') } catch (ex) { setErr(ex.message) }
  }

  async function runReview() {
    const job = target === 'custom' ? { title: custom.title, company: custom.company, notes: custom.notes } : options.find((o) => o.key === target)?.job
    if (!job?.title) { setErr('Pick a role, or type one in.'); return }
    setReviewing(true); setErr(''); setReview(null)
    try { setReview((await reviewResume(profile.resume_text, job)).review) } catch (ex) { setErr(ex.message) } finally { setReviewing(false) }
  }

  const has = Boolean(profile?.resume_text)
  return (
    <main className="page">
      <header className="page-head">
        <div>
          <h1>Resume</h1>
          <p className="sub">Upload it once. Get honest feedback and rewritten bullets for any role you&rsquo;re considering.</p>
        </div>
      </header>

      <section className="panel resume-panel">
        <div className="rp-file">
          <span className="rp-icon"><Icon name="resume" size={22} /></span>
          <div>
            <strong>{has ? 'Your resume is on file' : 'No resume yet'}</strong>
            <span className="quiet small">{has ? `${profile.resume_text.split(/\s+/).length.toLocaleString('en-IN')} words read` : 'PDF, up to 5 MB. Kept private to your account.'}</span>
          </div>
          <div className="rp-actions">
            {has && profile.resume_path && !profile.resume_path.startsWith('demo/') && <button type="button" className="btn btn-ghost btn-sm" onClick={open}>View</button>}
            <button type="button" className="btn btn-primary btn-sm" onClick={() => ref.current?.click()} disabled={busy}>
              {busy ? 'Reading…' : has ? 'Replace' : 'Upload resume'}
            </button>
            <input ref={ref} type="file" accept="application/pdf" hidden onChange={onFile} />
          </div>
        </div>
        {busy && <p className="quiet small"><Spinner /> Reading your resume and pulling out your skills…</p>}
        {msg && <p className="form-info" role="status">{msg}</p>}
      </section>

      <section className="panel" aria-labelledby="rv-h">
        <div className="panel-head"><h2 id="rv-h">Feedback for a specific role</h2></div>
        {!has ? <p className="quiet">Upload your resume first, then pick a role here.</p> : (
          <>
            <div className="rv-form">
              <label className="f-label" htmlFor="rv-target">Role</label>
              <select id="rv-target" className="select" value={target} onChange={(e) => setTarget(e.target.value)}>
                <option value="">Choose a saved or applied role…</option>
                {options.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
                <option value="custom">Type in a different role</option>
              </select>
              {target === 'custom' && (
                <div className="grid2">
                  <input placeholder="Role title" aria-label="Role title" value={custom.title} onChange={(e) => setCustom({ ...custom, title: e.target.value })} />
                  <input placeholder="Company" aria-label="Company" value={custom.company} onChange={(e) => setCustom({ ...custom, company: e.target.value })} />
                  <textarea className="wide note" rows={4} placeholder="Paste the job description (optional, but gives much better feedback)" aria-label="Job description"
                    value={custom.notes} onChange={(e) => setCustom({ ...custom, notes: e.target.value })} />
                </div>
              )}
              <button type="button" className="btn btn-primary" onClick={runReview} disabled={reviewing || !target}>
                {reviewing ? 'Reviewing…' : 'Get feedback'}
              </button>
            </div>
            {reviewing && <div className="loading"><Spinner label="Reviewing" /></div>}
            {review && <div className="review a"><RichText text={review} /></div>}
          </>
        )}
        {err && <p className="form-error" role="alert">{err}</p>}
      </section>
    </main>
  )
}
