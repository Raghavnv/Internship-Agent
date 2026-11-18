// Calls to the FastAPI backend. Adds the signed-in user's token automatically.
import { auth } from './backend.js'

const BASE = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '')

async function call(path, options = {}) {
  const session = await auth.getSession()
  const headers = { ...(options.body && !(options.body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}), ...options.headers }
  if (session?.access_token && session.access_token !== 'demo') headers.Authorization = `Bearer ${session.access_token}`
  let res
  try {
    res = await fetch(BASE + path, { ...options, headers })
  } catch {
    throw new Error('Can’t reach the server. If it was idle it may be waking up, so try again in about 30 seconds.')
  }
  if (!res.ok) {
    let detail = ''
    try { detail = (await res.json()).detail } catch { /* not json */ }
    const err = new Error(typeof detail === 'string' && detail ? detail : `Request failed (${res.status})`)
    err.status = res.status
    throw err
  }
  return res.json()
}

// Only the fields the backend uses for scoring and the AI prompt
export function profileForApi(p) {
  if (!p) return null
  const keys = ['full_name', 'based_in', 'college', 'degree', 'major', 'degree_level', 'grad_year', 'year_of_study', 'skills',
    'roles', 'avoid_roles', 'locations', 'work_modes', 'remote_from', 'remote_to', 'onsite_from', 'onsite_to', 'us_work_auth', 'paid_only']
  return Object.fromEntries(keys.filter((k) => p[k] != null && p[k] !== '').map((k) => [k, p[k]]))
}

const json = (body) => ({ method: 'POST', body: JSON.stringify(body) })
export const getMeta = () => call('/api/meta')
export const getMap = () => call('/api/map')
export const geocode = (q) => call(`/api/geocode?q=${encodeURIComponent(q)}`)
export const searchJobs = (filters, profile) => call('/api/search', json({ ...filters, profile: profileForApi(profile) }))
export const chat = (messages, profile) => call('/api/chat', json({ messages, profile: profileForApi(profile) }))
export const getJob = (id, profile) => call('/api/job', json({ id, profile: profileForApi(profile) }))
export const reviewResume = (resume_text, job) => call('/api/resume/review', json({ resume_text, job }))
export function parseResume(file) {
  const fd = new FormData()
  fd.append('file', file)
  return call('/api/resume/parse', { method: 'POST', body: fd })
}
