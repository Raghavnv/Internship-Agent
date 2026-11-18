import { useEffect, useState } from 'react'
import { useSession } from '../lib/session.jsx'
import { useUserData } from '../lib/userdata.jsx'
import { SECTIONS, Section } from '../ProfileSections.jsx'

export default function Profile() {
  const { user, profile, update } = useSession()
  const { say } = useUserData()
  const [draft, setDraft] = useState(null)
  const [saving, setSaving] = useState(false)
  useEffect(() => { if (profile && !draft) setDraft(profile) }, [profile])
  if (!draft) return null
  const dirty = JSON.stringify(draft) !== JSON.stringify(profile)

  async function save() {
    setSaving(true)
    try { await update(draft); say('Profile saved. Your matches now use the new answers.') } catch (e) { say(e.message) } finally { setSaving(false) }
  }

  return (
    <main className="page">
      <header className="page-head">
        <div>
          <h1>Profile and preferences</h1>
          <p className="sub">These answers decide which internships you see first. Signed in as {user?.email}.</p>
        </div>
      </header>
      {SECTIONS.filter((s) => s.key !== 'resume').map((s) => (
        <section key={s.key} className="panel" aria-labelledby={`pr-${s.key}`}>
          <div className="panel-head"><h2 id={`pr-${s.key}`}>{s.title}</h2></div>
          <Section k={s.key} draft={draft} setDraft={setDraft} userId={user.id} />
        </section>
      ))}
      <div className={`savebar${dirty ? ' show' : ''}`}>
        <span>You have unsaved changes</span>
        <button type="button" className="btn btn-text btn-sm" onClick={() => setDraft(profile)}>Discard</button>
        <button type="button" className="btn btn-primary btn-sm" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save changes'}</button>
      </div>
    </main>
  )
}
