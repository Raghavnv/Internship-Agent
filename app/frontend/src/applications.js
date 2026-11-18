// Saved applications, kept in this browser (localStorage). Export/import for backups.
import { useCallback, useEffect, useState } from 'react'

const KEY = 'copilot-applications-v1'
export const STATUSES = ['Applied', 'Interviewing', 'Offer', 'Rejected']

function load() {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || '[]')
    return Array.isArray(v) ? v : []
  } catch {
    return []
  }
}

function save(list) {
  try { localStorage.setItem(KEY, JSON.stringify(list)) } catch { /* storage full or blocked */ }
}

export function useApplications() {
  const [apps, setApps] = useState(load)

  // keep tabs / Dock app in sync
  useEffect(() => {
    const on = (e) => { if (e.key === KEY) setApps(load()) }
    window.addEventListener('storage', on)
    return () => window.removeEventListener('storage', on)
  }, [])

  const update = useCallback((fn) => {
    setApps((prev) => {
      const next = fn(prev)
      save(next)
      return next
    })
  }, [])

  const add = useCallback((job) => update((prev) => prev.some((a) => a.id === job.id) ? prev : [{
    id: job.id, title: job.title, company: job.company, url: job.url,
    location: (job.locations || [])[0] || (job.remote ? 'Remote' : ''),
    terms: job.terms || [], fit: job.fit ?? null,
    status: 'Applied', appliedAt: new Date().toISOString(), notes: '',
  }, ...prev]), [update])

  const remove = useCallback((id) => update((prev) => prev.filter((a) => a.id !== id)), [update])
  const patch = useCallback((id, fields) => update((prev) => prev.map((a) => a.id === id ? { ...a, ...fields } : a)), [update])
  const replaceAll = useCallback((list) => update(() => list), [update])
  const restore = useCallback((app) => update((prev) => [app, ...prev.filter((a) => a.id !== app.id)]
    .sort((a, b) => (b.appliedAt || '').localeCompare(a.appliedAt || ''))), [update])
  const has = useCallback((id) => apps.some((a) => a.id === id), [apps])

  return { apps, add, remove, patch, replaceAll, restore, has }
}

export function exportFile(apps) {
  const blob = new Blob([JSON.stringify({ version: 1, exported: new Date().toISOString(), applications: apps }, null, 2)],
    { type: 'application/json' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `internship-applications-${new Date().toISOString().slice(0, 10)}.json`
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
}

export async function importFile(file) {
  const data = JSON.parse(await file.text())
  const list = Array.isArray(data) ? data : data.applications
  if (!Array.isArray(list)) throw new Error('That file doesn’t look like an applications backup.')
  return list.filter((a) => a && a.id && a.title).map((a) => ({
    status: 'Applied', notes: '', terms: [], ...a,
  }))
}
