// Backend base URL: empty in dev (Vite proxies /api), set VITE_API_URL on Vercel.
const BASE = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '')

let passcode = ''
try { passcode = localStorage.getItem('copilot-passcode') || '' } catch { /* storage unavailable */ }

export function setPasscode(p) {
  passcode = p
  try { localStorage.setItem('copilot-passcode', p) } catch { /* ignore */ }
}

async function call(path, options = {}) {
  const res = await fetch(BASE + path, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(passcode ? { 'x-passcode': passcode } : {}), ...options.headers },
  })
  if (!res.ok) {
    let detail = ''
    try { detail = (await res.json()).detail } catch { /* not json */ }
    const err = new Error(detail || `Request failed (${res.status})`)
    err.status = res.status
    throw err
  }
  return res.json()
}

export const getMeta = () => call('/api/meta')
export const chat = (messages) => call('/api/chat', { method: 'POST', body: JSON.stringify({ messages }) })
export const searchJobs = (filters) => call('/api/search', { method: 'POST', body: JSON.stringify(filters) })
export const getMap = () => call('/api/map')
