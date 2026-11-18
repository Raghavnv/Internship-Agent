// Map city counts, fetched once and shared.
import { useEffect, useMemo, useState } from 'react'
import { getMap } from './api.js'
import { LOCATIONS } from './options.js'

let cache = null
let pending = null
export function useMapData() {
  const [data, setData] = useState(cache || { cities: [] })
  useEffect(() => {
    if (cache) return
    pending = pending || getMap().then((m) => (cache = m)).catch(() => ({ cities: [] }))
    pending.then((m) => setData(m))
  }, [])
  return data
}

export const toPins = (results = []) =>
  results.flatMap((j) => (j.pins || []).map(([lat, lng]) => ({ lat, lng, key: j.id })))

// cities that actually have listings, with counts, plus the aliases search understands
export function useLocationSuggestions() {
  const map = useMapData()
  return useMemo(() => {
    const seen = new Set()
    const out = []
    for (const v of LOCATIONS) { seen.add(v.toLowerCase()); out.push({ value: v }) }
    for (const c of [...(map.cities || [])].sort((a, b) => b.count - a.count)) {
      const k = (c.city || '').toLowerCase()
      if (!k || seen.has(k)) continue
      seen.add(k); out.push({ value: c.city, hint: `${c.count} ${c.count === 1 ? 'role' : 'roles'}` })
    }
    return out
  }, [map.cities])
}

