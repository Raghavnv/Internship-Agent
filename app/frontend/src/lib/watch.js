// Companies the user is watching for new openings (saved on their profile).
import { useSession } from './session.jsx'

const key = (s) => (s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()

export function useWatch() {
  const { profile, update } = useSession()
  const list = profile?.watch_companies || []
  const has = (name) => list.some((x) => key(x) === key(name))
  const toggle = async (name) => {
    const next = has(name) ? list.filter((x) => key(x) !== key(name)) : [...list, name].slice(-100)
    await update({ watch_companies: next })
    return !has(name)
  }
  return { list, has, toggle }
}
