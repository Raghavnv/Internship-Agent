import { useEffect, useRef, useState } from 'react'

// Reveal once when scrolled into view (respects reduced motion via CSS).
function useSeen() {
  const ref = useRef(null)
  const [seen, setSeen] = useState(false)
  useEffect(() => {
    if (!('IntersectionObserver' in window)) { setSeen(true); return }
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setSeen(true); io.disconnect() } }, { threshold: 0.08 })
    io.observe(ref.current)
    return () => io.disconnect()
  }, [])
  return [ref, seen]
}

const ArtCollect = () => (
  <svg viewBox="0 0 220 130" aria-hidden="true">
    {[['SimplifyJobs', 22], ['Internshala', 58], ['Career pages', 94]].map(([t, y]) => (
      <g key={t}>
        <rect x="6" y={y - 13} width="92" height="26" rx="7" className="a-pill" />
        <text x="52" y={y + 4} textAnchor="middle" className="a-txt">{t}</text>
        <path d={`M98 ${y} C 135 ${y}, 140 65, 170 65`} className="a-flow" />
      </g>
    ))}
    <circle cx="186" cy="65" r="17" className="a-node" />
    <path d="M186 56 v9 l6 4" className="a-clock" />
  </svg>
)

const ArtScore = () => (
  <svg viewBox="0 0 220 130" aria-hidden="true">
    <circle cx="62" cy="65" r="34" className="a-ring-bg" />
    <circle cx="62" cy="65" r="34" className="a-ring" strokeDasharray="213.6" strokeDashoffset="17" transform="rotate(-90 62 65)" />
    <text x="62" y="71" textAnchor="middle" className="a-big">92</text>
    {[['Python', 22], ['Backend', 48], ['Austin', 74], ['Summer ’27', 100]].map(([t, y], i) => (
      <g key={t} className="a-tag" style={{ '--d': `${i * 90}ms` }}>
        <rect x="118" y={y - 11} width="92" height="22" rx="6" className="a-pill" />
        <circle cx="130" cy={y} r="3" className="a-ok" />
        <text x="140" y={y + 4} className="a-txt">{t}</text>
      </g>
    ))}
  </svg>
)

const ArtAsk = () => (
  <svg viewBox="0 0 220 130" aria-hidden="true">
    <rect x="6" y="14" width="208" height="30" rx="9" className="a-input" />
    <text x="18" y="33" className="a-txt a-q">ML roles in Austin this summer</text>
    <path d="M110 50 v18" className="a-flow" />
    <path d="M105 63 l5 6 5-6" className="a-flow" />
    {[['ml / ai / machine learning', 14, 86, 136], ['Austin, TX', 14, 112, 76], ['May–Aug 2027', 96, 112, 90]].map(([t, x, y, w]) => (
      <g key={t}>
        <rect x={x} y={y - 11} width={w} height="22" rx="6" className="a-chip" />
        <text x={x + 10} y={y + 4} className="a-txt a-chip-t">{t}</text>
      </g>
    ))}
  </svg>
)

const ArtAlert = () => (
  <svg viewBox="0 0 220 130" aria-hidden="true">
    {/* phone */}
    <rect x="18" y="10" width="70" height="112" rx="12" className="a-device" />
    <rect x="26" y="30" width="54" height="38" rx="6" className="a-bubble" />
    <path d="M32 41 h30 M32 50 h40 M32 59 h22" className="a-line" />
    {/* mac menu bar */}
    <rect x="104" y="26" width="108" height="18" rx="4" className="a-device" />
    <rect x="178" y="30" width="26" height="10" rx="3" className="a-badge" />
    <text x="191" y="38" textAnchor="middle" className="a-badge-t">3</text>
    <rect x="128" y="50" width="84" height="62" rx="8" className="a-bubble" />
    <path d="M138 64 h58 M138 78 h48 M138 92 h54" className="a-line" />
  </svg>
)

const STEPS = [
  { art: ArtCollect, title: 'Collects every listing', body: 'Every 15 minutes, your agent checks 5,000+ internships from SimplifyJobs, Internshala and company career pages.' },
  { art: ArtScore, title: 'Scores each one for you', body: 'Roles get a fit score from your skills, cities, dates and degree, so the strongest rise to the top.' },
  { art: ArtAsk, title: 'Understands plain questions', body: 'The AI turns what you type into exact filters and searches the real listings. It never makes up jobs or links.' },
  { art: ArtAlert, title: 'Tells you first', body: 'Strong new matches reach you on WhatsApp and in your Mac’s menu bar within minutes of being posted.' },
]

export default function HowItWorks() {
  const [ref, seen] = useSeen()
  return (
    <section ref={ref} className={`how${seen ? ' seen' : ''}`} aria-labelledby="how-h">
      <div className="section-head">
        <h2 id="how-h">How it works</h2>
        <p>Four steps run on their own, all day. You just ask and apply.</p>
      </div>
      <ol className="steps-grid">
        {STEPS.map(({ art: Art, title, body }, i) => (
          <li key={title} className="step" style={{ '--i': i }}>
            <div className="step-art"><Art /></div>
            <span className="step-n">{i + 1}</span>
            <h3>{title}</h3>
            <p>{body}</p>
          </li>
        ))}
      </ol>
    </section>
  )
}
