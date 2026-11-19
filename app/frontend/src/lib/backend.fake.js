// TEST-ONLY stand-in for ./backend.js that keeps data in localStorage.
// Used only by `vite build --mode e2e` (see vite.config.js) for automated browser tests; never shipped.
const DEMO = true
const sb = null
export const CONFIGURED = true

// ── demo storage helpers ──
const ls = {
  get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d } catch { return d } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)) } catch { /* ignore */ } },
}
const demoUser = () => ls.get('demo-session', null)
const listeners = new Set()
const emit = (s) => listeners.forEach((f) => f(s))
const fail = (e) => { if (e) throw new Error(e.message || String(e)) }
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random()))

// ── auth ────────────────────────────────────────────────────
export const auth = {
  async getSession() {
    if (DEMO) { const u = demoUser(); return u ? { user: u, access_token: 'demo' } : null }
    const { data } = await sb.auth.getSession()
    return data.session
  },
  onChange(fn) {
    if (DEMO) { listeners.add(fn); return () => listeners.delete(fn) }
    const { data } = sb.auth.onAuthStateChange((_e, session) => fn(session))
    return () => data.subscription.unsubscribe()
  },
  async signUp(email, password, fullName) {
    if (DEMO) {
      const user = { id: 'demo-' + email.toLowerCase(), email, user_metadata: { full_name: fullName } }
      ls.set('demo-session', user)
      const key = `demo-profile-${user.id}`
      if (!ls.get(key, null)) ls.set(key, { id: user.id, full_name: fullName, onboarded: false })
      const s = { user, access_token: 'demo' }; emit(s); return { session: s }
    }
    const { data, error } = await sb.auth.signUp({ email, password, options: { data: { full_name: fullName }, emailRedirectTo: `${location.origin}/onboarding` } })
    fail(error)
    return { session: data.session, needsConfirm: !data.session }
  },
  async signIn(email, password) {
    if (DEMO) return auth.signUp(email, password, email.split('@')[0])
    const { data, error } = await sb.auth.signInWithPassword({ email, password })
    fail(error)
    return { session: data.session }
  },
  async updatePassword() { return },
  async resetPassword(email) {
    if (DEMO) return
    const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: `${location.origin}/login` })
    fail(error)
  },
  async signOut() {
    if (DEMO) { localStorage.removeItem('demo-session'); emit(null); return }
    await sb.auth.signOut()
  },
}

// ── profile ─────────────────────────────────────────────────
export async function getProfile(userId) {
  if (DEMO) return ls.get(`demo-profile-${userId}`, { id: userId, onboarded: false })
  const { data, error } = await sb.from('profiles').select('*').eq('id', userId).maybeSingle()
  fail(error)
  return data || { id: userId, onboarded: false }
}

const PROFILE_COLS = ['full_name', 'based_in', 'college', 'degree', 'major', 'degree_level', 'grad_year', 'year_of_study',
  'skills', 'roles', 'avoid_roles', 'locations', 'work_modes', 'remote_from', 'remote_to', 'onsite_from', 'onsite_to',
  'us_work_auth', 'paid_only', 'min_stipend_inr', 'company_types', 'headline', 'bio', 'linkedin', 'github', 'portfolio',
  'resume_path', 'resume_text', 'onboarded', 'phone', 'education', 'experience', 'certifications', 'achievements',
  'spoken_languages', 'other_links', 'resume_updated_at', 'watch_companies', 'digest_email']

export async function saveProfile(userId, fields) {
  const clean = Object.fromEntries(Object.entries(fields).filter(([k]) => PROFILE_COLS.includes(k))
    .map(([k, v]) => [k, v === '' ? null : v]))
  if (DEMO) {
    const next = { ...(await getProfile(userId)), ...clean }
    ls.set(`demo-profile-${userId}`, next)
    return next
  }
  const { data, error } = await sb.from('profiles').upsert({ id: userId, ...clean }).select().single()
  fail(error)
  return data
}

// ── generic per-user tables ────────────────────────────────
function demoTable(name) {
  const key = () => `demo-${name}-${demoUser()?.id}`
  return { all: () => ls.get(key(), []), put: (rows) => ls.set(key(), rows) }
}

export const applications = {
  async list() {
    if (DEMO) return demoTable('applications').all()
    const { data, error } = await sb.from('applications').select('*').order('applied_at', { ascending: false })
    fail(error)
    return data
  },
  async add(job) {
    const row = {
      job_id: job.id, title: job.title, company: job.company, url: job.url,
      location: (job.locations || [])[0] || (job.remote ? 'Remote' : ''), terms: job.terms || [], fit: job.fit ?? null,
      status: 'Applied', notes: '',
    }
    if (DEMO) {
      const t = demoTable('applications'); const rows = t.all()
      if (rows.some((r) => r.job_id === job.id)) return rows.find((r) => r.job_id === job.id)
      const r = { id: uid(), applied_at: new Date().toISOString(), ...row }; t.put([r, ...rows]); return r
    }
    const { data, error } = await sb.from('applications').upsert(row, { onConflict: 'user_id,job_id' }).select().single()
    fail(error)
    return data
  },
  async update(id, fields) {
    if (DEMO) { const t = demoTable('applications'); t.put(t.all().map((r) => r.id === id ? { ...r, ...fields } : r)); return }
    const { error } = await sb.from('applications').update(fields).eq('id', id)
    fail(error)
  },
  async remove(id) {
    if (DEMO) { const t = demoTable('applications'); t.put(t.all().filter((r) => r.id !== id)); return }
    const { error } = await sb.from('applications').delete().eq('id', id)
    fail(error)
  },
  async restore(row) {
    if (DEMO) { const t = demoTable('applications'); t.put([row, ...t.all().filter((r) => r.id !== row.id)]); return row }
    const { user_id: _u, updated_at: _x, ...rest } = row
    const { data, error } = await sb.from('applications').upsert(rest).select().single()
    fail(error)
    return data
  },
}

export const saved = {
  async list() {
    if (DEMO) return demoTable('saved').all()
    const { data, error } = await sb.from('saved_jobs').select('*').order('saved_at', { ascending: false })
    fail(error)
    return data
  },
  async add(job) {
    const row = { job_id: job.id, job }
    if (DEMO) { const t = demoTable('saved'); const rows = t.all().filter((r) => r.job_id !== job.id); t.put([{ ...row, saved_at: new Date().toISOString() }, ...rows]); return }
    const { error } = await sb.from('saved_jobs').upsert(row, { onConflict: 'user_id,job_id' })
    fail(error)
  },
  async remove(jobId) {
    if (DEMO) { const t = demoTable('saved'); t.put(t.all().filter((r) => r.job_id !== jobId)); return }
    const { error } = await sb.from('saved_jobs').delete().eq('job_id', jobId)
    fail(error)
  },
}

export const projects = {
  async list() {
    if (DEMO) return demoTable('projects').all()
    const { data, error } = await sb.from('projects').select('*').order('position').order('created_at')
    fail(error)
    return data
  },
  async save(p) {
    const row = { title: p.title, description: p.description || '', url: p.url || '', tech: p.tech || [], position: p.position ?? 0 }
    if (DEMO) {
      const t = demoTable('projects'); const rows = t.all()
      if (p.id) { t.put(rows.map((r) => r.id === p.id ? { ...r, ...row } : r)); return { ...p, ...row } }
      const r = { id: uid(), ...row }; t.put([...rows, r]); return r
    }
    const q = p.id ? sb.from('projects').update(row).eq('id', p.id) : sb.from('projects').insert(row)
    const { data, error } = await q.select().single()
    fail(error)
    return data
  },
  async remove(id) {
    if (DEMO) { const t = demoTable('projects'); t.put(t.all().filter((r) => r.id !== id)); return }
    const { error } = await sb.from('projects').delete().eq('id', id)
    fail(error)
  },
}

// ── resume file ────────────────────────────────────────────
export async function uploadResume(userId, file) {
  if (DEMO) return `demo/${file.name}`
  const path = `${userId}/resume.pdf`
  const { error } = await sb.storage.from('resumes').upload(path, file, { upsert: true, contentType: 'application/pdf' })
  fail(error)
  return path
}

export async function resumeUrl(path) {
  if (DEMO || !path) return null
  const { data, error } = await sb.storage.from('resumes').createSignedUrl(path, 600)
  fail(error)
  return data.signedUrl
}
