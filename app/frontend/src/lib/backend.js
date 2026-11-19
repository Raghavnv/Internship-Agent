// Data layer: Supabase auth, Postgres tables and storage.
// Uses this project's Supabase by default; VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY override it (e.g. for a fork).
// The publishable key is meant to be public: row-level security on every table keeps each user's data private.
import { createClient } from '@supabase/supabase-js'

const DEFAULT_URL = 'https://icshgjbbopvofolbubzy.supabase.co'
const DEFAULT_KEY = 'sb_publishable_-n_mclgKx56etZXt61ZX_Q_fganxL1j'
const URL_ = (import.meta.env.VITE_SUPABASE_URL || DEFAULT_URL).trim().replace(/\/+$/, '')
const KEY = (import.meta.env.VITE_SUPABASE_ANON_KEY || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || DEFAULT_KEY).trim()
export const CONFIGURED = Boolean(URL_ && KEY)

const sb = CONFIGURED ? createClient(URL_, KEY, { auth: { persistSession: true, autoRefreshToken: true } }) : null

const fail = (e) => { if (e) throw new Error(e.message || String(e)) }

// ── auth ────────────────────────────────────────────────────
export const auth = {
  async getSession() {
    const { data } = await sb.auth.getSession()
    return data.session
  },
  onChange(fn) {
    const { data } = sb.auth.onAuthStateChange((_e, session) => fn(session))
    return () => data.subscription.unsubscribe()
  },
  async signUp(email, password, fullName) {
    const { data, error } = await sb.auth.signUp({ email, password, options: { data: { full_name: fullName }, emailRedirectTo: `${location.origin}/onboarding` } })
    fail(error)
    return { session: data.session, needsConfirm: !data.session }
  },
  async signIn(email, password) {
    const { data, error } = await sb.auth.signInWithPassword({ email, password })
    fail(error)
    return { session: data.session }
  },
  async resetPassword(email) {
    const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: `${location.origin}/reset-password` })
    fail(error)
  },
  async updatePassword(password) {
    const { error } = await sb.auth.updateUser({ password })
    fail(error)
  },
  async signOut() {
    await sb.auth.signOut()
  },
}

// ── profile ─────────────────────────────────────────────────
export async function getProfile(userId) {
  const { data, error } = await sb.from('profiles').select('*').eq('id', userId).maybeSingle()
  fail(error)
  return data || { id: userId, onboarded: false }
}

const PROFILE_COLS = ['full_name', 'based_in', 'college', 'degree', 'major', 'degree_level', 'grad_year', 'year_of_study',
  'skills', 'roles', 'avoid_roles', 'locations', 'work_modes', 'remote_from', 'remote_to', 'onsite_from', 'onsite_to',
  'us_work_auth', 'paid_only', 'min_stipend_inr', 'company_types', 'headline', 'bio', 'linkedin', 'github', 'portfolio',
  'resume_path', 'resume_text', 'onboarded', 'phone', 'education', 'experience', 'certifications', 'achievements',
  'spoken_languages', 'other_links', 'resume_updated_at', 'watch_companies']

export async function saveProfile(userId, fields) {
  const clean = Object.fromEntries(Object.entries(fields).filter(([k]) => PROFILE_COLS.includes(k))
    .map(([k, v]) => [k, v === '' ? null : v]))
  const { data, error } = await sb.from('profiles').upsert({ id: userId, ...clean }).select().single()
  fail(error)
  return data
}

// ── per-user tables ────────────────────────────────────────
export const applications = {
  async list() {
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
    const { data, error } = await sb.from('applications').upsert(row, { onConflict: 'user_id,job_id' }).select().single()
    fail(error)
    return data
  },
  async update(id, fields) {
    const { error } = await sb.from('applications').update(fields).eq('id', id)
    fail(error)
  },
  async remove(id) {
    const { error } = await sb.from('applications').delete().eq('id', id)
    fail(error)
  },
  async restore(row) {
    const { user_id: _u, updated_at: _x, ...rest } = row
    const { data, error } = await sb.from('applications').upsert(rest).select().single()
    fail(error)
    return data
  },
}

export const saved = {
  async list() {
    const { data, error } = await sb.from('saved_jobs').select('*').order('saved_at', { ascending: false })
    fail(error)
    return data
  },
  async add(job) {
    const row = { job_id: job.id, job }
    const { error } = await sb.from('saved_jobs').upsert(row, { onConflict: 'user_id,job_id' })
    fail(error)
  },
  async remove(jobId) {
    const { error } = await sb.from('saved_jobs').delete().eq('job_id', jobId)
    fail(error)
  },
}

export const projects = {
  async list() {
    const { data, error } = await sb.from('projects').select('*').order('position').order('created_at')
    fail(error)
    return data
  },
  async save(p) {
    const row = { title: p.title, description: p.description || '', url: p.url || '', tech: p.tech || [], position: p.position ?? 0 }
    const q = p.id ? sb.from('projects').update(row).eq('id', p.id) : sb.from('projects').insert(row)
    const { data, error } = await q.select().single()
    fail(error)
    return data
  },
  async remove(id) {
    const { error } = await sb.from('projects').delete().eq('id', id)
    fail(error)
  },
}

// ── resume file ────────────────────────────────────────────
export async function uploadResume(userId, file) {
  const path = `${userId}/resume.pdf`
  const { error } = await sb.storage.from('resumes').upload(path, file, { upsert: true, contentType: 'application/pdf' })
  fail(error)
  return path
}

export async function resumeUrl(path) {
  if (!path) return null
  const { data, error } = await sb.storage.from('resumes').createSignedUrl(path, 600)
  fail(error)
  return data.signedUrl
}
