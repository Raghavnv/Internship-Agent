// Auth + profile context shared by every page.
import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { auth, getProfile, saveProfile } from './backend.js'
import { geocode } from './api.js'

const Ctx = createContext(null)
export const useSession = () => useContext(Ctx)

export function SessionProvider({ children }) {
  const [session, setSession] = useState(undefined) // undefined = still loading
  const [profile, setProfile] = useState(null)
  const [home, setHome] = useState(null)

  useEffect(() => {
    let alive = true
    auth.getSession().then((s) => alive && setSession(s || null))
    const off = auth.onChange((s) => setSession(s || null))
    return () => { alive = false; off() }
  }, [])

  useEffect(() => {
    if (!session?.user) { setProfile(null); return }
    getProfile(session.user.id).then(setProfile).catch(() => setProfile({ id: session.user.id, onboarded: false }))
  }, [session?.user?.id])

  // where the user is, for the map's "you" marker
  useEffect(() => {
    const q = profile?.based_in
    if (!q) { setHome(null); return }
    geocode(q).then(setHome).catch(() => setHome(null))
  }, [profile?.based_in])

  const update = useCallback(async (fields) => {
    const next = await saveProfile(session.user.id, fields)
    setProfile(next)
    return next
  }, [session?.user?.id])

  const value = { session, user: session?.user || null, profile, setProfile, update, home, loading: session === undefined }
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}
