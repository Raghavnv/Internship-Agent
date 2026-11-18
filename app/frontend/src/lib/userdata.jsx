// Applications + saved jobs for the signed-in user, shared across dashboard pages.
// Updates are optimistic: the UI changes immediately and rolls back if the database says no.
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { applications as A, saved as S } from './backend.js'

const Ctx = createContext(null)
export const useUserData = () => useContext(Ctx)

export function UserDataProvider({ children }) {
  const [apps, setApps] = useState([])
  const [saved, setSaved] = useState([])
  const [loaded, setLoaded] = useState(false)
  const [toast, setToast] = useState(null)
  const [viewing, setViewing] = useState(null)   // the job open in the side panel

  const say = useCallback((text, action) => setToast({ text, action, id: Date.now() }), [])

  useEffect(() => {
    Promise.all([A.list(), S.list()]).then(([a, s]) => { setApps(a || []); setSaved(s || []) })
      .catch((e) => say(`Couldn’t load your data: ${e.message}`)).finally(() => setLoaded(true))
  }, [say])

  const appByJob = useMemo(() => new Map(apps.map((a) => [a.job_id, a])), [apps])
  const savedIds = useMemo(() => new Set(saved.map((s) => s.job_id)), [saved])

  const apply = useCallback(async (job) => {
    if (appByJob.has(job.id)) return
    const temp = { id: `tmp-${job.id}`, job_id: job.id, title: job.title, company: job.company, url: job.url,
      location: (job.locations || [])[0] || '', terms: job.terms || [], fit: job.fit, status: 'Applied', notes: '',
      applied_at: new Date().toISOString() }
    setApps((p) => [temp, ...p])
    try {
      const row = await A.add(job)
      setApps((p) => p.map((a) => (a.id === temp.id ? row : a)))
      say(`Saved to My applications: ${job.title} at ${job.company}`, {
        label: 'Undo', run: async () => { setApps((p) => p.filter((a) => a.id !== row.id)); await A.remove(row.id) },
      })
    } catch (e) {
      setApps((p) => p.filter((a) => a.id !== temp.id))
      say(`Couldn’t save that application: ${e.message}`)
    }
  }, [appByJob, say])

  const updateApp = useCallback(async (id, fields) => {
    const before = apps
    setApps((p) => p.map((a) => (a.id === id ? { ...a, ...fields } : a)))
    try { await A.update(id, fields) } catch (e) { setApps(before); say(`Couldn’t update: ${e.message}`) }
  }, [apps, say])

  const removeApp = useCallback(async (row) => {
    setApps((p) => p.filter((a) => a.id !== row.id))
    try {
      await A.remove(row.id)
      say(`Removed ${row.title}`, {
        label: 'Undo', run: async () => {
          const back = await A.restore(row)
          setApps((p) => [back, ...p].sort((a, b) => (b.applied_at || '').localeCompare(a.applied_at || '')))
        },
      })
    } catch (e) { setApps((p) => [row, ...p]); say(`Couldn’t remove: ${e.message}`) }
  }, [say])

  const toggleSave = useCallback(async (job) => {
    if (savedIds.has(job.id)) {
      setSaved((p) => p.filter((s) => s.job_id !== job.id))
      try { await S.remove(job.id) } catch (e) { say(e.message) }
    } else {
      const { pins: _p, ...snap } = job
      setSaved((p) => [{ job_id: job.id, job: snap, saved_at: new Date().toISOString() }, ...p])
      try { await S.add(snap); say(`Saved ${job.title} for later`) } catch (e) {
        setSaved((p) => p.filter((s) => s.job_id !== job.id)); say(`Couldn’t save: ${e.message}`)
      }
    }
  }, [savedIds, say])

  const value = {
    apps, saved, loaded, toast, closeToast: () => setToast(null), say,
    isApplied: (id) => appByJob.has(id), isSaved: (id) => savedIds.has(id),
    apply, updateApp, removeApp, toggleSave,
    viewing, openJob: setViewing, closeJob: () => setViewing(null),
  }
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}
