// "Update from resume": upload a PDF, the AI reads it, you review and tick the changes to apply.
import { useEffect, useMemo, useRef, useState } from 'react'
import { parseResume } from './lib/api.js'
import { projects as P, uploadResume } from './lib/backend.js'
import { applyChanges, proposeChanges } from './lib/resumeMerge.js'
import { useSession } from './lib/session.jsx'
import { Icon, Spinner } from './ui.jsx'

export default function ResumeImport({ open, onClose, onApplied }) {
  const { user, profile, update } = useSession()
  const ref = useRef(null)
  const dialog = useRef(null)
  const [stage, setStage] = useState('pick') // pick | reading | review | saving | done
  const [err, setErr] = useState('')
  const [found, setFound] = useState(null)
  const [parsed, setParsed] = useState(null)
  const [projects, setProjects] = useState([])
  const [chosen, setChosen] = useState(new Set())
  const [summary, setSummary] = useState('')

  useEffect(() => {
    const d = dialog.current
    if (!d) return
    if (open && !d.open) { d.showModal(); setStage('pick'); setErr(''); setFound(null) }
    if (!open && d.open) d.close()
  }, [open])

  const changes = useMemo(() => (found ? proposeChanges(profile, projects, found) : []), [found, profile, projects])
  const groups = useMemo(() => changes.reduce((m, c) => ((m[c.group] = m[c.group] || []).push(c), m), {}), [changes])

  async function onFile(e) {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f) return
    if (f.size > 5 * 1024 * 1024) { setErr('Please choose a PDF under 5 MB.'); return }
    setErr(''); setStage('reading')
    try {
      const [res, path, list] = await Promise.all([parseResume(f), uploadResume(user.id, f), P.list().catch(() => [])])
      setParsed({ text: res.text, path })
      setProjects(list || [])
      setFound(res.profile || {})
      const props = proposeChanges(profile, list || [], res.profile || {})
      setChosen(new Set(props.filter((c) => c.defaultOn).map((c) => c.id)))
      setStage('review')
    } catch (ex) {
      setErr(ex.message); setStage('pick')
    }
  }

  async function apply() {
    setStage('saving'); setErr('')
    try {
      const { patch, newProjects } = applyChanges(profile, projects, found, chosen)
      await update({ ...patch, resume_path: parsed.path, resume_text: parsed.text, resume_updated_at: new Date().toISOString() })
      for (const [i, p] of newProjects.entries()) await P.save({ ...p, position: projects.length + i })
      const n = chosen.size
      setSummary(n ? `Applied ${n} ${n === 1 ? 'change' : 'changes'} to your profile and saved your resume.` : 'Saved your resume. Your profile wasn’t changed.')
      setStage('done')
      onApplied?.()
    } catch (ex) {
      setErr(ex.message); setStage('review')
    }
  }

  const toggle = (id) => setChosen((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })
  const allOn = changes.length > 0 && changes.every((c) => chosen.has(c.id))

  return (
    <dialog ref={dialog} className="modal" onClose={onClose} aria-labelledby="ri-h">
      <div className="modal-head">
        <h2 id="ri-h">{stage === 'review' ? 'Review what we found' : stage === 'done' ? 'Profile updated' : 'Update your profile from your resume'}</h2>
        <button type="button" className="icon-btn" aria-label="Close" onClick={onClose}><Icon name="x" /></button>
      </div>

      {(stage === 'pick' || stage === 'reading') && (
        <div className="modal-body">
          <p className="sub">The AI reads your resume and suggests updates to your profile: experience, education, projects, skills and more. You choose what to keep.</p>
          <button type="button" className="drop" onClick={() => ref.current?.click()} disabled={stage === 'reading'}>
            {stage === 'reading' ? <Spinner label="Reading" /> : <Icon name="upload" size={22} />}
            <strong>{stage === 'reading' ? 'Reading your resume…' : 'Choose a PDF'}</strong>
            <span>{stage === 'reading' ? 'This takes about 10 seconds' : 'Up to 5 MB. Kept private to your account.'}</span>
          </button>
          <input ref={ref} type="file" accept="application/pdf" hidden onChange={onFile} />
        </div>
      )}

      {stage === 'review' && (
        <>
          <div className="modal-body">
            {changes.length === 0 ? (
              <p className="sub">Your profile already has everything in this resume. We&rsquo;ll just save the new file.</p>
            ) : (
              <>
                <div className="ri-top">
                  <p className="sub">{changes.length} {changes.length === 1 ? 'update' : 'updates'} found. Untick anything you don&rsquo;t want.</p>
                  <button type="button" className="link-btn" onClick={() => setChosen(allOn ? new Set() : new Set(changes.map((c) => c.id)))}>
                    {allOn ? 'Untick all' : 'Tick all'}
                  </button>
                </div>
                {Object.entries(groups).map(([g, items]) => (
                  <fieldset key={g} className="ri-group">
                    <legend>{g}</legend>
                    {items.map((c) => (
                      <label key={c.id} className={`ri-item${chosen.has(c.id) ? ' on' : ''}`}>
                        <input type="checkbox" checked={chosen.has(c.id)} onChange={() => toggle(c.id)} />
                        <span className="ri-box" aria-hidden="true">{chosen.has(c.id) && <Icon name="check" size={12} />}</span>
                        <span className="ri-txt">
                          <strong>{c.label}</strong>
                          {c.before ? <span className="ri-diff"><s>{c.before}</s><Icon name="arrow" size={12} /><b>{c.after}</b></span>
                            : c.after && c.id.startsWith('f:') ? <span className="ri-diff"><b>{c.after}</b></span>
                            : c.after ? <span className="ri-after">{c.after}</span> : null}
                          {c.bullets?.length > 0 && <ul className="ri-bullets">{c.bullets.slice(0, 2).map((b, i) => <li key={i}>{b}</li>)}</ul>}
                          {c.chips?.length > 0 && <span className="ri-chips">{c.chips.slice(0, 14).map((t) => <i key={t}>{t}</i>)}</span>}
                        </span>
                      </label>
                    ))}
                  </fieldset>
                ))}
              </>
            )}
          </div>
          <div className="modal-foot">
            <button type="button" className="btn btn-text" onClick={onClose}>Cancel</button>
            <button type="button" className="btn btn-primary" onClick={apply}>
              {chosen.size ? `Apply ${chosen.size} ${chosen.size === 1 ? 'change' : 'changes'}` : 'Just save the resume'}
            </button>
          </div>
        </>
      )}

      {stage === 'saving' && <div className="modal-body loading"><Spinner label="Saving" /></div>}

      {stage === 'done' && (
        <>
          <div className="modal-body"><p className="form-info">{summary}</p></div>
          <div className="modal-foot"><button type="button" className="btn btn-primary" onClick={onClose}>Done</button></div>
        </>
      )}
      {err && <p className="form-error modal-err" role="alert">{err}</p>}
    </dialog>
  )
}
