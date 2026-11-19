// "What's new since you last looked": remembers your previous visit and polls for fresher listings.
import { useEffect, useRef, useState } from 'react'
import { getUpdates } from './api.js'

const KEY = 'ic-last-visit'
const read = () => { try { return Number(localStorage.getItem(KEY)) || 0 } catch { return 0 } }
// the previous visit is fixed for this page load; the stored value moves to "now" for next time
const previous = read()
try { localStorage.setItem(KEY, String(Math.floor(Date.now() / 1000))) } catch { /* private mode */ }
export const lastVisit = () => previous
const openedAt = Math.floor(Date.now() / 1000)

export function useUpdates(profile, { every = 5 * 60 * 1000 } = {}) {
  const [info, setInfo] = useState(null)       // newest check, counted from when this page opened
  const [busy, setBusy] = useState(false)
  const [since, setSince] = useState(openedAt) // moves forward when you load the new roles
  const alive = useRef(true)
  const check = async (refresh = false) => {
    if (refresh) setBusy(true)
    try { const r = await getUpdates(since, profile, refresh); if (alive.current) setInfo(r); return r } catch { return null } finally { if (alive.current) setBusy(false) }
  }
  useEffect(() => {
    alive.current = true
    if (!profile) return
    check()
    const t = setInterval(() => { if (document.visibilityState === 'visible') check() }, every)
    return () => { alive.current = false; clearInterval(t) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile, since])
  const acknowledge = () => setSince(Math.floor(Date.now() / 1000))
  return { info, busy, refresh: () => check(true), acknowledge }
}

export function ago(ts) {
  if (!ts) return 'never'
  const m = Math.max(0, Math.round((Date.now() / 1000 - ts) / 60))
  if (m < 1) return 'just now'
  if (m < 60) return `${m} min ago`
  const h = Math.round(m / 60)
  return h < 24 ? `${h} hour${h === 1 ? '' : 's'} ago` : `${Math.round(h / 24)} day${h < 48 ? '' : 's'} ago`
}
