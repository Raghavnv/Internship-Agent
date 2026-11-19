// Job panel sections: tailor your resume to this listing, and find someone to refer you.
import { useEffect, useState } from 'react'
import { draftReferral, tailorResume } from './lib/api.js'
import { projects as projectsApi } from './lib/backend.js'
import { CopyButton, Spinner } from './ui.jsx'

let projCache = null
function useProjects() {
  const [list, setList] = useState(projCache)
  useEffect(() => { if (!projCache) projectsApi.list().then((r) => { projCache = r || []; setList(projCache) }).catch(() => setList([])) }, [])
  return list
}

export function Tailor({ job, profile, hasDescription }) {
  const projects = useProjects()
  const [paste, setPaste] = useState('')
  const [showPaste, setShowPaste] = useState(false)
  const [res, setRes] = useState(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  useEffect(() => { setRes(null); setErr(''); setPaste(''); setShowPaste(false) }, [job.id])

  async function run() {
    setBusy(true); setErr('')
    try { setRes(await tailorResume(job, profile, projects, paste)) } catch (e) { setErr(e.message) } finally { setBusy(false) }
  }
  const noResume = !profile?.resume_text && !(profile?.experience || []).length

  return (
    <section className="jp-sec" aria-labelledby="jp-tailor">
      <h3 id="jp-tailor">Tailor your resume</h3>
      {!res && <p className="quiet small">Compare your resume with this listing: the skills it asks for, which you already show, and your bullets reworded for it. Nothing is made up.</p>}
      {noResume && !res && <p className="form-info">Upload your resume first for the best results. Skills from your profile are still checked.</p>}
      {(!hasDescription || showPaste) && !res && (
        <label className="paste">
          <span>{hasDescription ? 'Or paste the description' : 'Paste the job description (optional, makes this much more accurate)'}</span>
          <textarea rows={4} value={paste} onChange={(e) => setPaste(e.target.value)} placeholder="Copy it from the listing page and paste it here" />
        </label>
      )}
      {!res && (
        <div className="row-gap">
          <button type="button" className="btn btn-ghost btn-sm" onClick={run} disabled={busy || projects === null}>
            {busy ? <><Spinner /> Checking…</> : 'Check my resume against this role'}
          </button>
          {hasDescription && !showPaste && <button type="button" className="link-btn" onClick={() => setShowPaste(true)}>Paste a description instead</button>}
        </div>
      )}
      {err && <p className="form-error">{err}</p>}
      {res && (
        <div className="tl">
          {res.coverage != null ? (
            <div className="tl-cover">
              <div className="tl-meter" aria-hidden="true"><i style={{ '--w': `${res.coverage}%` }} /></div>
              <p>You show <strong>{res.matched.length}</strong> of the <strong>{res.matched.length + res.missing.length}</strong> skills this listing mentions.</p>
            </div>
          ) : <p className="quiet small">This listing names no specific skills, so only the bullets were tailored.</p>}
          {res.matched.length > 0 && <div className="tl-row"><span className="tl-k">You have</span><ul className="kw ok">{res.matched.map((k) => <li key={k}>{k}</li>)}</ul></div>}
          {res.missing.length > 0 && <div className="tl-row"><span className="tl-k">Not on your resume</span><ul className="kw miss">{res.missing.map((k) => <li key={k}>{k}</li>)}</ul></div>}
          {res.missing.length > 0 && <p className="hint">Only add these if you’ve genuinely used them, ideally with a project to point to.</p>}
          {res.summary && (
            <div className="tl-block">
              <div className="tl-bh"><h4>Summary line for this role</h4><CopyButton text={res.summary} /></div>
              <p>{res.summary}</p>
            </div>
          )}
          {res.bullets.length > 0 && (
            <div className="tl-block">
              <div className="tl-bh"><h4>Bullets, reworded for this role</h4><CopyButton text={res.bullets.map((b) => `• ${b.rewritten}`).join('\n')} label="Copy all" /></div>
              <ol className="tl-bullets">
                {res.bullets.map((b, i) => (
                  <li key={i}>
                    <p className="tl-src">{b.source}{b.why && <> · {b.why}</>}</p>
                    <p className="tl-old">{b.original}</p>
                    <div className="tl-new"><p>{b.rewritten}</p><CopyButton text={b.rewritten} /></div>
                  </li>
                ))}
              </ol>
            </div>
          )}
          {res.advice.length > 0 && <ul className="tl-advice">{res.advice.map((a) => <li key={a}>{a}</li>)}</ul>}
          {res.error && <p className="form-info">{res.error}</p>}
          <button type="button" className="link-btn" onClick={() => setRes(null)}>Run again</button>
        </div>
      )}
    </section>
  )
}

const li = (q) => `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(q)}`

export function Referral({ job, profile }) {
  const projects = useProjects()
  const [d, setD] = useState(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  useEffect(() => { setD(null); setErr('') }, [job.id])
  const college = profile?.college
  const co = job.company || ''
  async function draft() {
    setBusy(true); setErr('')
    try { setD(await draftReferral(job, profile, projects)) } catch (e) { setErr(e.message) } finally { setBusy(false) }
  }
  return (
    <section className="jp-sec" aria-labelledby="jp-ref">
      <h3 id="jp-ref">Find a referral</h3>
      <p className="quiet small">A referral is the single biggest boost to getting an interview. Start with people who share your college.</p>
      <ul className="ref-links">
        {college && <li><a href={li(`${co} ${college}`)} target="_blank" rel="noreferrer"><strong>{college} alumni at {co}</strong><span>LinkedIn people search</span></a></li>}
        <li><a href={li(`${co} university recruiter`)} target="_blank" rel="noreferrer"><strong>Recruiters at {co}</strong><span>LinkedIn people search</span></a></li>
        <li><a href={li(`${co} ${(job.title || '').replace(/intern(ship)?/ig, '').trim()} engineer`)} target="_blank" rel="noreferrer"><strong>Engineers on similar teams</strong><span>LinkedIn people search</span></a></li>
      </ul>
      {!college && <p className="hint">Add your college to your profile to search for alumni.</p>}
      {!d && (
        <button type="button" className="btn btn-ghost btn-sm" onClick={draft} disabled={busy || projects === null}>
          {busy ? <><Spinner /> Drafting…</> : 'Draft my referral message'}
        </button>
      )}
      {err && <p className="form-error">{err}</p>}
      {d && (
        <div className="ref-drafts">
          <div className="tl-block">
            <div className="tl-bh"><h4>Connection note <span className={d.note.length > 300 ? 'over' : ''}>{d.note.length}/300</span></h4><CopyButton text={d.note} /></div>
            <p>{d.note}</p>
          </div>
          <div className="tl-block">
            <div className="tl-bh"><h4>Message after they accept</h4><CopyButton text={d.message} /></div>
            <p className="pre">{d.message}</p>
          </div>
          <p className="hint">Replace [Name] before sending. LinkedIn connection notes are limited to 300 characters.</p>
          <button type="button" className="link-btn" onClick={draft} disabled={busy}>{busy ? 'Drafting…' : 'Write another version'}</button>
        </div>
      )}
    </section>
  )
}
