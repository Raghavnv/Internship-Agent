// Small hand-drawn SVG charts. Each animates in once when its data arrives (skipped with reduced motion).
import { useEffect, useRef, useState } from 'react'

const reduced = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

// Counts a number up from 0 the first time it appears.
export function useCountUp(value, ms = 900) {
  const [shown, setShown] = useState(reduced() ? value : 0)
  const from = useRef(0)
  useEffect(() => {
    if (value == null) return
    if (reduced()) { setShown(value); return }
    const start = performance.now(); const a = from.current
    let raf
    const tick = (t) => {
      const p = Math.min(1, (t - start) / ms)
      const e = 1 - (1 - p) ** 3
      setShown(Math.round(a + (value - a) * e))
      if (p < 1) raf = requestAnimationFrame(tick); else from.current = value
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [value, ms])
  return shown
}

export function CountUp({ value }) {
  const n = useCountUp(value)
  return <>{n.toLocaleString('en-IN')}</>
}

const fmtDay = (iso, offset) => {
  const d = new Date(iso); d.setDate(d.getDate() + offset)
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
}

// Area chart of new roles per day, with a hover readout.
export function DayArea({ data, start, height = 120 }) {
  const [hover, setHover] = useState(null)
  const box = useRef(null)
  const [W, setW] = useState(600)
  useEffect(() => {
    const el = box.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setW(Math.max(200, Math.round(e.contentRect.width))))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const H = height, pad = 4
  const max = Math.max(1, ...data)
  const step = (W - pad * 2) / Math.max(1, data.length - 1)
  const pts = data.map((v, i) => [pad + i * step, H - pad - (v / max) * (H - pad * 2 - 14)])
  // smooth path (Catmull-Rom → Bézier)
  const line = pts.map((p, i) => {
    if (!i) return `M${p[0]},${p[1]}`
    const p0 = pts[i - 2] || pts[i - 1], p1 = pts[i - 1], p3 = pts[i + 1] || p
    const c1 = [p1[0] + (p[0] - p0[0]) / 6, p1[1] + (p[1] - p0[1]) / 6]
    const c2 = [p[0] - (p3[0] - p1[0]) / 6, p[1] - (p3[1] - p1[1]) / 6]
    return `C${c1[0]},${c1[1]} ${c2[0]},${c2[1]} ${p[0]},${p[1]}`
  }).join(' ')
  const area = `${line} L${pts.at(-1)[0]},${H} L${pts[0][0]},${H} Z`
  const week = data.slice(-7).reduce((a, b) => a + b, 0)
  const onMove = (e) => {
    const r = e.currentTarget.getBoundingClientRect()
    const i = Math.round(((e.clientX - r.left) / r.width * W - pad) / step)
    setHover(Math.max(0, Math.min(data.length - 1, i)))
  }
  return (
    <figure className="ch ch-area" ref={box}>
      <figcaption className="sr">New matching roles per day for the last {data.length} days; {week} in the last week.</figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} onMouseMove={onMove} onMouseLeave={() => setHover(null)} aria-hidden="true">
        <defs>
          <linearGradient id="ar-fill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="#86b7d3" stopOpacity="0.28" /><stop offset="1" stopColor="#86b7d3" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0.33, 0.66].map((f) => <line key={f} x1="0" x2={W} y1={H * f} y2={H * f} className="ch-grid" />)}
        <path d={area} fill="url(#ar-fill)" className="ch-area-fill" />
        <path d={line} className="ch-line" pathLength="1" />
        {hover != null && <>
          <line x1={pts[hover][0]} x2={pts[hover][0]} y1="0" y2={H} className="ch-cursor" />
        </>}
      </svg>
      {hover != null && (
        <div className="ch-tip" style={{ left: `${(pts[hover][0] / W) * 100}%`, top: `${(pts[hover][1] / H) * 100}%` }}>
          <strong>{data[hover]}</strong> {data[hover] === 1 ? 'role' : 'roles'}<span>{fmtDay(start, hover)}</span>
        </div>
      )}
      <div className="ch-axis"><span>{fmtDay(start, 0)}</span><span>Today</span></div>
    </figure>
  )
}

const TIERS = [
  { label: 'Under 60', cls: 't0' }, { label: '60s', cls: 't1' }, { label: '70s', cls: 't2' },
  { label: '80s', cls: 't3' }, { label: '90+', cls: 't4' },
]

// Vertical bars of how many roles fall in each fit band.
export function FitSpread({ bins }) {
  const max = Math.max(1, ...bins)
  return (
    <figure className="ch ch-spread">
      <figcaption className="sr">Fit scores: {bins.map((b, i) => `${TIERS[i].label}: ${b}`).join(', ')}</figcaption>
      <div className="sp-bars" aria-hidden="true">
        {bins.map((b, i) => (
          <div key={i} className="sp-col">
            <span className="sp-n">{b}</span>
            <span className={`sp-bar ${TIERS[i].cls}`} style={{ '--h': `${Math.max(3, (b / max) * 100)}%`, '--d': `${i * 70}ms` }} />
            <span className="sp-l">{TIERS[i].label}</span>
          </div>
        ))}
      </div>
    </figure>
  )
}

// Ranked horizontal bars (companies, cities). Rows can be clickable.
export function RankBars({ items, onPick, unit = 'roles' }) {
  const max = Math.max(1, ...items.map((x) => x.count))
  return (
    <ol className="rank">
      {items.map((x, i) => {
        const body = (
          <>
            <span className="rk-name">{x.name}</span>
            <span className="rk-track" aria-hidden="true"><i style={{ '--w': `${(x.count / max) * 100}%`, '--d': `${i * 60}ms` }} /></span>
            <span className="rk-n">{x.count}<span className="sr"> {unit}</span></span>
          </>
        )
        return <li key={x.name}>{onPick ? <button type="button" onClick={() => onPick(x.name)} title={`Filter to ${x.name}`}>{body}</button> : <div>{body}</div>}</li>
      })}
    </ol>
  )
}

// One thin bar split between remote and in-person.
export function ModeSplit({ remote, onsite }) {
  const t = Math.max(1, remote + onsite)
  return (
    <div className="split">
      <div className="split-bar" aria-hidden="true">
        <i className="r" style={{ '--w': `${(remote / t) * 100}%` }} /><i className="o" style={{ '--w': `${(onsite / t) * 100}%` }} />
      </div>
      <div className="split-key">
        <span><i className="r" />Remote <strong>{remote}</strong></span>
        <span><i className="o" />In person <strong>{onsite}</strong></span>
      </div>
    </div>
  )
}

// Placeholder rows while results load.
export function SkeletonRows({ n = 6 }) {
  return (
    <ul className="jobs skel" aria-hidden="true">
      {Array.from({ length: n }, (_, i) => (
        <li key={i}><div className="job"><span className="avatar" /><span className="job-main"><b /><b className="s" /></span><span /><span className="sk-fit" /></div></li>
      ))}
    </ul>
  )
}
