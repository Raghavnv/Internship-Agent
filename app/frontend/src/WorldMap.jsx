import { useEffect, useMemo, useRef, useState } from 'react'
import { geoEquirectangular, geoPath } from 'd3-geo'
import { feature } from 'topojson-client'
import landTopo from 'world-atlas/land-110m.json'

const LAND = feature(landTopo, landTopo.objects.land)
const DEST = [134, 183, 211]   // chart blue: roles
const HOME = [240, 163, 94]    // amber: you
const rgba = (c, a) => `rgba(${c[0]},${c[1]},${c[2]},${a})`
const reduced = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

/**
 * Dot-matrix world map.
 *  cities: [{lat,lng,city,count}]  base layer, glow size ~ number of listings
 *  pins:   [{lat,lng,key}]         current results: lit up, with arcs from home
 *  focus:  key of the hovered result (pulses)
 */
export default function WorldMap({ cities = [], home, pins = [], focus, onCity, compact }) {
  const wrap = useRef(null)
  const canvas = useRef(null)
  const layer = useRef(null)        // cached land dots
  const glowLayer = useRef(null)    // cached city glows
  const geom = useRef(null)         // projection + sizes
  const arcStart = useRef(0)
  const [tip, setTip] = useState(null)
  const [size, setSize] = useState({ w: 0, h: 0 })

  // stable key for the pin set, so arcs re-animate only when results change
  const pinKey = useMemo(() => pins.map((p) => p.key).join('|'), [pins])
  const uniquePins = useMemo(() => {
    const seen = new Map()
    for (const p of pins) {
      const k = `${p.lat.toFixed(1)},${p.lng.toFixed(1)}`
      if (!seen.has(k)) seen.set(k, { ...p, keys: [p.key] })
      else seen.get(k).keys.push(p.key)
    }
    return [...seen.values()].slice(0, 30)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pinKey])

  useEffect(() => { arcStart.current = performance.now() }, [pinKey])

  // track size
  useEffect(() => {
    const ro = new ResizeObserver(([e]) => setSize({ w: e.contentRect.width, h: e.contentRect.height }))
    ro.observe(wrap.current)
    return () => ro.disconnect()
  }, [])

  // projection + land dot layer
  useEffect(() => {
    const { w, h } = size
    if (!w || !h) return
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    // Full map: whole inhabited world. Compact band: the US-to-India corridor, filling the width.
    const narrow = w < 720
    const [west, east, north, south, centerLat, anchor] = compact
      ? [-128, 100, 60, -5, 30, 0.5]
      : narrow ? [-128, 100, 62, -10, 28, 0.36] : [-168, 158, 72, -48, 16, 0.45]
    const box = { type: 'Feature', geometry: { type: 'Polygon', coordinates: [[[west, north], [west, south], [east, south], [east, north], [west, north]]] } }
    const proj = geoEquirectangular().fitWidth(w, box)
    const [tx, ty] = proj.translate()
    const yc = proj([0, centerLat])[1]
    proj.translate([tx, ty + (h * anchor - yc)])
    const mask = document.createElement('canvas')
    mask.width = w; mask.height = h
    const mctx = mask.getContext('2d', { willReadFrequently: true })
    mctx.fillStyle = '#000'
    mctx.beginPath(); geoPath(proj, mctx)(LAND); mctx.fill()
    const data = mctx.getImageData(0, 0, w, h).data

    const off = document.createElement('canvas')
    off.width = w * dpr; off.height = h * dpr
    const o = off.getContext('2d')
    o.scale(dpr, dpr)
    const step = compact ? 6 : Math.max(6, Math.round(w / 170))
    o.fillStyle = 'rgba(170,186,182,0.22)'
    for (let y = step / 2; y < h; y += step) {
      for (let x = step / 2; x < w; x += step) {
        if (data[(Math.floor(y) * w + Math.floor(x)) * 4 + 3] > 0) {
          o.beginPath(); o.arc(x, y, step * 0.17, 0, Math.PI * 2); o.fill()
        }
      }
    }
    layer.current = off
    geom.current = { proj, w, h, dpr, glow: Math.max(0.45, Math.min(1, w / 1300)) }
    const c = canvas.current
    c.width = w * dpr; c.height = h * dpr
    c.style.width = `${w}px`; c.style.height = `${h}px`
  }, [size, compact])

  // draw loop
  useEffect(() => {
    let raf
    const maxCount = Math.max(1, ...cities.map((c) => c.count))
    const draw = (now) => {
      const g = geom.current
      const c = canvas.current
      if (!g || !c || !layer.current) { raf = requestAnimationFrame(draw); return }
      const ctx = c.getContext('2d')
      const { proj, w, h, dpr, glow } = g
      ctx.setTransform(1, 0, 0, 1, 0, 0)
      ctx.clearRect(0, 0, c.width, c.height)
      ctx.drawImage(layer.current, 0, 0)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      const still = reduced()
      const active = uniquePins.length > 0
      const pulse = still ? 0.5 : (Math.sin(now / 900) + 1) / 2

      // city glows (cached layer, rebuilt only when data / size / mode change)
      const glowKey = `${cities.length}:${w}x${h}:${active}`
      if (!glowLayer.current || glowLayer.current.key !== glowKey) {
        const gl = document.createElement('canvas')
        gl.width = w * dpr; gl.height = h * dpr
        const gx = gl.getContext('2d')
        gx.scale(dpr, dpr)
        gx.globalCompositeOperation = 'lighter'
        for (const city of cities) {
          const [x, y] = proj([city.lng, city.lat])
          const r = 1 + Math.sqrt(city.count / maxCount) * (compact ? 7 : 11) * glow
          const a = (active ? 0.08 : 0.30) * (0.6 + glow * 0.4)
          const grd = gx.createRadialGradient(x, y, 0, x, y, r * 2.2)
          grd.addColorStop(0, rgba(DEST, a + 0.25))
          grd.addColorStop(0.35, rgba(DEST, a))
          grd.addColorStop(1, rgba(DEST, 0))
          gx.fillStyle = grd
          gx.beginPath(); gx.arc(x, y, r * 2.2, 0, Math.PI * 2); gx.fill()
        }
        glowLayer.current = { key: glowKey, canvas: gl }
      }
      ctx.setTransform(1, 0, 0, 1, 0, 0)
      ctx.drawImage(glowLayer.current.canvas, 0, 0)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

      // arcs from home to each result city
      const [hx, hy] = home ? proj([home.lng, home.lat]) : [0, 0]
      const t0 = arcStart.current
      uniquePins.forEach((p, i) => {
        const [x, y] = proj([p.lng, p.lat])
        const dist = Math.hypot(x - hx, y - hy)
        const cx = (x + hx) / 2, cy = Math.min(y, hy) - dist * 0.32
        const dur = 1100, delay = i * 60
        const k = still ? 1 : Math.min(1, Math.max(0, (now - t0 - delay) / dur))
        const e = 1 - Math.pow(1 - k, 3)
        if (e <= 0) return
        const isFocus = focus && p.keys.includes(focus)
        const grad = ctx.createLinearGradient(hx, hy, x, y)
        grad.addColorStop(0, rgba(HOME, isFocus ? 0.9 : 0.45))
        grad.addColorStop(1, rgba(DEST, isFocus ? 1 : 0.75))
        ctx.strokeStyle = grad
        ctx.lineWidth = isFocus ? 1.8 : 1
        ctx.beginPath()
        const N = 48
        for (let s = 0; s <= N * e; s++) {
          const u = s / N
          const px = (1 - u) * (1 - u) * hx + 2 * (1 - u) * u * cx + u * u * x
          const py = (1 - u) * (1 - u) * hy + 2 * (1 - u) * u * cy + u * u * y
          s === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py)
        }
        ctx.stroke()
        if (e >= 1) {
          const rr = isFocus ? 4.5 + pulse * 3 : 2.6
          ctx.fillStyle = rgba(DEST, 1)
          ctx.beginPath(); ctx.arc(x, y, isFocus ? 3.4 : 2.4, 0, Math.PI * 2); ctx.fill()
          ctx.strokeStyle = rgba(DEST, isFocus ? 0.6 : 0.35)
          ctx.lineWidth = 1
          ctx.beginPath(); ctx.arc(x, y, rr + 2, 0, Math.PI * 2); ctx.stroke()
        }
      })

      // home marker
      if (home) {
        ctx.fillStyle = rgba(HOME, 1)
        ctx.beginPath(); ctx.arc(hx, hy, 3, 0, Math.PI * 2); ctx.fill()
        ctx.strokeStyle = rgba(HOME, 0.5 * (1 - pulse) + 0.1)
        ctx.lineWidth = 1
        ctx.beginPath(); ctx.arc(hx, hy, 6 + pulse * 8, 0, Math.PI * 2); ctx.stroke()
      }
      raf = requestAnimationFrame(draw)
    }
    raf = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(raf)
  }, [cities, home, uniquePins, focus, compact])

  // hover / click on cities
  const nearest = (ev) => {
    const g = geom.current
    if (!g) return null
    const r = canvas.current.getBoundingClientRect()
    const mx = ev.clientX - r.left, my = ev.clientY - r.top
    let best = null, bd = 14
    for (const c of cities) {
      const [x, y] = g.proj([c.lng, c.lat])
      const d = Math.hypot(x - mx, y - my)
      if (d < bd) { bd = d; best = { ...c, x, y } }
    }
    return best
  }

  return (
    <div ref={wrap} className={`map${compact ? ' map-compact' : ''}`}>
      <canvas ref={canvas} role="img"
        aria-label={`Map of ${cities.length} cities with open internships${pins.length ? `; ${uniquePins.length} highlighted for your search` : ''}`}
        onMouseMove={(e) => setTip(nearest(e))}
        onMouseLeave={() => setTip(null)}
        onClick={(e) => { const c = nearest(e); if (c && onCity) onCity(c.city) }}
        style={{ cursor: tip ? 'pointer' : 'default' }} />
      {tip && (
        <div className="map-tip" style={{ left: tip.x, top: tip.y }}>
          <strong>{tip.city}</strong> {tip.count} {tip.count === 1 ? 'role' : 'roles'}
        </div>
      )}
    </div>
  )
}
