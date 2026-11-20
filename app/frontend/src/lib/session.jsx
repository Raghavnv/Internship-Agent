// Auth + profile context shared by every page.
import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { auth, CONFIGURED, getProfile, saveProfile } from './backend.js'
import { geocode } from './api.js'

const Ctx = createContext(null)
export const useSession = () => useContext(Ctx)

export function SessionProvider({ children }) {
  const [session, setSession] = useState(undefined) // undefined = still loading
  const [profile, setProfile] = useState(null)
  const [home, setHome] = useState(null)

  useEffect(() => {
    if (!CONFIGURED) { setSession(null); return }
    let alive = true
    auth.getSession().then((s) => alive && setSession(s || null))
    const off = auth.onChange((s) => setSession(s || null))
    return () => { alive = false; off() }
  }, [])

  const [loadFailed, setLoadFailed] = useState(false)
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    if (!session?.user) { setProfile(null); return }
    let alive = true
    setLoadFailed(false)
    // retry a few times: a slow or waking database must never look like "this person is new"
    const load = async () => {
      for (let i = 0; i < 4; i++) {
        try {
          const p = await getProfile(session.user.id)
          if (p?.onboarded) rememberOnboarded(session.user.id)
          if (alive) setProfile(p)
          return
        } catch { await new Promise((r) => setTimeout(r, 800 * (i + 1))) }
      }
      if (alive) setLoadFailed(true)
    }
    load()
    return () => { alive = false }
  }, [session?.user?.id, attempt])

  // where the user is, for the map's "you" marker
  useEffect(() => {
    const q = profile?.based_in
    if (!q) { setHome(null); return }
    geocode(q).then(setHome).catch(() => setHome(null))
  }, [profile?.based_in])

  const update = useCallback(async (fields) => {
    const next = await saveProfile(session.user.id, fields)
    if (fields.onboarded || next?.onboarded) rememberOnboarded(session.user.id)
    setProfile(next)
    return next
  }, [session?.user?.id])

  const value = { session, user: session?.user || null, profile, setProfile, update, home, loading: session === undefined,
    loadFailed, retryProfile: () => setAttempt((n) => n + 1) }
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

// A second record of "finished setup" on this device, so a returning user is never sent through
// the questions again even if the saved profile comes back without the flag.
const KEY = (id) => `ic-onboarded:${id}`
function rememberOnboarded(id) { try { localStorage.setItem(KEY(id), '1') } catch { /* private mode */ } }
function rememberedOnboarded(id) { try { return localStorage.getItem(KEY(id)) === '1' } catch { return false } }

/** Setup was completed (explicitly), as opposed to merely having the essentials filled in. */
export const finishedSetup = (p) => Boolean(p && (p.onboarded || rememberedOnboarded(p.id)))

/** Someone has finished setup if they said so, or if their profile already has the essentials. */
export const isOnboarded = (p) => Boolean(p && (p.onboarded || rememberedOnboarded(p.id)
  || (p.roles?.length && p.locations?.length && p.based_in)))
