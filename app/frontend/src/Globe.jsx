import { useEffect, useRef } from 'react'
import { geoEquirectangular, geoGraticule10, geoInterpolate, geoOrthographic, geoPath } from 'd3-geo'
import { feature } from 'topojson-client'
import landTopo from 'world-atlas/land-110m.json'

/**
 * A slowly turning dotted globe. Routes fly from your city (amber) to where roles are (sky blue):
 * each arc lifts off the surface, a bright head travels along it, and the destination pings.
 *
 *  home:   {lat, lng, label}
 *  routes: [{lat, lng, label, key}]   played a few at a time, cycling
 *  cities: [{lat, lng, count}]        faint glow under the dots where listings cluster
 */
const HOME = [255, 176, 92]
const DEST = [124, 196, 255]
const rgba = (c, a) => `rgba(${c[0]},${c[1]},${c[2]},${a})`
const RAD = Math.PI / 180
const reduced = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

let DOTS = null
function landDots() {
  if (DOTS) return DOTS
  // rasterise the land once on a small equirectangular canvas, then sample it on a lat/lng grid
  const W = 720, H = 360
  const c = document.createElement('canvas'); c.width = W; c.height = H
  const ctx = c.getContext('2d')
  const proj = geoEquirectangular().scale(W / (2 * Math.PI)).translate([W / 2, H / 2])
  ctx.fillStyle = '#fff'; ctx.beginPath(); geoPath(proj, ctx)(feature(landTopo, landTopo.objects.land)); ctx.fill()
  const px = ctx.getImageData(0, 0, W, H).data
  const out = []
  for (let lat = -58; lat <= 78; lat += 1.7) {
    const step = 1.7 / Math.max(0.25, Math.cos(lat * RAD))
    for (let lng = -180; lng < 180; lng += step) {
      const x = Math.floor(((lng + 180) / 360) * W), y = Math.floor(((90 - lat) / 180) * H)
      if (px[(y * W + x) * 4] > 128) {
        const p = lat * RAD, l = lng * RAD
        out.push([Math.cos(p) * Math.sin(l), Math.sin(p), Math.cos(p) * Math.cos(l)])
      }
    }
  }
  DOTS = out
  return out
}

const vec = (lat, lng) => { const p = lat * RAD, l = lng * RAD; return [Math.cos(p) * Math.sin(l), Math.sin(p), Math.cos(p) * Math.cos(l)] }

export default function Globe({ home, routes = [], cities = [], spin = true, perRound = 5, className = '', label }) {
  const wrap = useRef(null)
  const cv = useRef(null)
  const state = useRef({ rot: [-(home?.lng ?? 78) + 35, -18], drag: null, t0: performance.now(), round: 0 })
  const data = useRef({ home, routes, cities })
  data.current = { home, routes, cities }

  useEffect(() => {
    const canvas = cv.current, ctx = canvas.getContext('2d')
    const dots = landDots()
    const still = reduced()
    let raf, w = 0, h = 0, dpr = 1
    const resize = () => {
      if (!wrap.current) return
      const r = wrap.current.getBoundingClientRect()
      dpr = Math.min(window.devicePixelRatio || 1, 2)
      w = r.width; h = r.height
      canvas.width = w * dpr; canvas.height = h * dpr
      canvas.style.width = w + 'px'; canvas.style.height = h + 'px'
    }
    resize()
    const ro = new ResizeObserver(resize); ro.observe(wrap.current)
    const S = state.current
    const grat = geoGraticule10()
    const proj = geoOrthographic().clipAngle(90).precision(0.6)
    let last = performance.now()

    function frame(now) {
      const dt = Math.min(64, now - last); last = now
      const R = Math.min(w, h) * 0.4, cx = w / 2, cy = h / 2
      // camera: face the flights being shown (home to the first destination), drifting gently;
      // with nothing to show, just turn
      const { home: H0, routes: rs } = data.current
      const live = rs.filter((r) => r && Number.isFinite(r.lat) && Number.isFinite(r.lng))
      if (!S.drag) {
        if (H0 && live.length) {
          const cycle = 5200, n = Math.min(perRound, live.length)
          const first = live[(Math.floor((still ? 3000 : Math.max(0, now - S.t0)) / cycle) * n) % live.length]
          const [mlng, mlat] = geoInterpolate([H0.lng, H0.lat], [first.lng, first.lat])(0.5)
          const tl = -mlng + (still ? 0 : Math.sin(now / 5000) * 6), tp = -Math.max(-35, Math.min(45, mlat)) * 0.8
          let d = ((tl - S.rot[0] + 540) % 360) - 180
          const ease = still ? 1 : Math.min(1, dt * 0.0022)
          S.rot[0] += d * ease
          S.rot[1] += (tp - S.rot[1]) * ease
        } else if (spin && !still) S.rot[0] += dt * 0.0042
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, w, h)
      // atmosphere
      const g = ctx.createRadialGradient(cx, cy, R * 0.92, cx, cy, R * 1.22)
      g.addColorStop(0, rgba(DEST, 0.16)); g.addColorStop(1, rgba(DEST, 0))
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, R * 1.22, 0, 7); ctx.fill()
      const body = ctx.createRadialGradient(cx - R * 0.35, cy - R * 0.4, R * 0.1, cx, cy, R)
      body.addColorStop(0, '#16232b'); body.addColorStop(1, '#0b1216')
      ctx.fillStyle = body; ctx.beginPath(); ctx.arc(cx, cy, R, 0, 7); ctx.fill()
      ctx.strokeStyle = rgba(DEST, 0.22); ctx.lineWidth = 1; ctx.stroke()

      proj.scale(R).translate([cx, cy]).rotate([S.rot[0], S.rot[1]])
      ctx.beginPath(); geoPath(proj, ctx)(grat); ctx.strokeStyle = 'rgba(160,190,205,0.06)'; ctx.stroke()

      // rotation as a matrix, applied to unit vectors
      const l0 = S.rot[0] * RAD, p0 = S.rot[1] * RAD
      const cl = Math.cos(l0), sl = Math.sin(l0), cp = Math.cos(p0), sp = Math.sin(p0)
      const project = (v, k = 1) => {
        // rotate around the y axis (longitude), then the x axis (latitude)
        const x1 = v[0] * cl + v[2] * sl, z1 = -v[0] * sl + v[2] * cl
        const y2 = v[1] * cp + z1 * sp, z2 = -v[1] * sp + z1 * cp
        return [cx + x1 * R * k, cy - y2 * R * k, z2, x1 * k, y2 * k]
      }

      // land dots, brighter toward the viewer
      for (let i = 0; i < dots.length; i++) {
        const p = project(dots[i])
        if (p[2] <= 0) continue
        ctx.fillStyle = `rgba(190,212,222,${0.12 + p[2] * 0.5})`
        ctx.fillRect(p[0] - 0.8, p[1] - 0.8, 1.6, 1.6)
      }
      // where listings cluster
      for (const c of data.current.cities.slice(0, 160)) {
        const p = project(vec(c.lat, c.lng))
        if (p[2] <= 0.05) continue
        const s = Math.min(5, 1.2 + Math.sqrt(c.count) * 0.35)
        ctx.fillStyle = rgba(DEST, 0.22 * p[2]); ctx.beginPath(); ctx.arc(p[0], p[1], s, 0, 7); ctx.fill()
      }

      const hm = data.current.home
      const all = live
      if (hm) {
        const hv = vec(hm.lat, hm.lng)
        // play the routes a few at a time
        const cycle = 5200
        const el = still ? 3000 : Math.max(0, now - S.t0)
        const round = Math.floor(el / cycle)
        const local = el - round * cycle
        const n = all.length ? Math.min(perRound, all.length) : 0
        const start = all.length ? (round * n) % all.length : 0
        const set = Array.from({ length: n }, (_, i) => all[(start + i) % all.length])
        set.forEach((r, i) => {
          const t = Math.max(0, Math.min(1, (local - i * 260) / 1500))
          const fade = local > cycle - 700 ? Math.max(0, (cycle - local) / 700) : 1
          if (t <= 0 || fade <= 0) return
          const interp = geoInterpolate([hm.lng, hm.lat], [r.lng, r.lat])
          const dist = Math.acos(Math.max(-1, Math.min(1, hv[0] * vec(r.lat, r.lng)[0] + hv[1] * vec(r.lat, r.lng)[1] + hv[2] * vec(r.lat, r.lng)[2])))
          const lift = 0.06 + dist * 0.16
          const N = 48, upto = Math.ceil(N * t)
          let prev = null
          for (let s = 0; s <= upto; s++) {
            const f = s / N
            const [lng, lat] = interp(f)
            const k = 1 + lift * Math.sin(Math.PI * f)
            const p = project(vec(lat, lng), k)
            const behind = p[2] < 0 && Math.hypot(p[3], p[4]) < 1
            if (prev && !behind && !prev.behind) {
              const mix = f
              const col = [HOME[0] + (DEST[0] - HOME[0]) * mix, HOME[1] + (DEST[1] - HOME[1]) * mix, HOME[2] + (DEST[2] - HOME[2]) * mix]
              ctx.strokeStyle = rgba(col, 0.75 * fade); ctx.lineWidth = 1.4
              ctx.beginPath(); ctx.moveTo(prev.x, prev.y); ctx.lineTo(p[0], p[1]); ctx.stroke()
            }
            prev = { x: p[0], y: p[1], behind }
          }
          if (prev && !prev.behind && t < 1) {        // the travelling head
            ctx.fillStyle = rgba([255, 255, 255], 0.95 * fade)
            ctx.shadowColor = rgba(DEST, 0.9); ctx.shadowBlur = 10
            ctx.beginPath(); ctx.arc(prev.x, prev.y, 2.1, 0, 7); ctx.fill(); ctx.shadowBlur = 0
          }
          if (t >= 1) {                                // landed: ping + label
            const d = project(vec(r.lat, r.lng))
            if (d[2] > 0) {
              const since = (local - i * 260 - 1500) / 1000
              const ring = (since % 1.6) / 1.6
              ctx.strokeStyle = rgba(DEST, (1 - ring) * 0.8 * fade); ctx.lineWidth = 1.2
              ctx.beginPath(); ctx.arc(d[0], d[1], 3 + ring * 12, 0, 7); ctx.stroke()
              ctx.fillStyle = rgba(DEST, fade); ctx.beginPath(); ctx.arc(d[0], d[1], 2.6, 0, 7); ctx.fill()
              if (r.label && i < 3 && w > 360) {
                ctx.font = '500 11px "IBM Plex Sans Variable", system-ui, sans-serif'
                const tw = ctx.measureText(r.label).width
                const lx = d[0] + 8, ly = d[1] - 8
                ctx.fillStyle = `rgba(10,16,20,${0.82 * fade})`
                ctx.fillRect(lx - 4, ly - 11, tw + 8, 16)
                ctx.fillStyle = `rgba(238,240,234,${fade})`; ctx.fillText(r.label, lx, ly + 1)
              }
            }
          }
        })
        const hp = project(hv)
        if (hp[2] > 0) {
          const pulse = still ? 0 : ((now / 1000) % 2) / 2
          ctx.strokeStyle = rgba(HOME, 0.7 * (1 - pulse)); ctx.lineWidth = 1.2
          ctx.beginPath(); ctx.arc(hp[0], hp[1], 4 + pulse * 14, 0, 7); ctx.stroke()
          ctx.fillStyle = rgba(HOME, 1); ctx.beginPath(); ctx.arc(hp[0], hp[1], 3.4, 0, 7); ctx.fill()
        }
      }
      if (!still && raf) raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)

    // drag to turn
    const down = (e) => { S.drag = { x: e.clientX, y: e.clientY, rot: [...S.rot] }; canvas.setPointerCapture(e.pointerId) }
    const move = (e) => {
      if (!S.drag) return
      S.rot[0] = S.drag.rot[0] + (e.clientX - S.drag.x) * 0.3
      S.rot[1] = Math.max(-50, Math.min(50, S.drag.rot[1] - (e.clientY - S.drag.y) * 0.3))
      if (still) requestAnimationFrame(frame)
    }
    const up = () => { S.drag = null }
    canvas.addEventListener('pointerdown', down)
    canvas.addEventListener('pointermove', move)
    canvas.addEventListener('pointerup', up)
    canvas.addEventListener('pointercancel', up)
    return () => { cancelAnimationFrame(raf); ro.disconnect(); raf = 0 }
  }, [spin, perRound])

  // a new route set starts a fresh round
  const key = routes.map((r) => r.key).join('|')
  useEffect(() => { state.current.t0 = performance.now() }, [key])

  return (
    <div ref={wrap} className={`globe ${className}`} role="img" aria-label={label || 'Globe with routes from your city to where internships are'}>
      <canvas ref={cv} />
    </div>
  )
}
