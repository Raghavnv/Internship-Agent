// Map city counts, fetched once and shared.
import { useEffect, useState } from 'react'
import { getMap } from './api.js'

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
