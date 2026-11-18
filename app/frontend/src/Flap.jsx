import { useEffect, useRef, useState } from 'react'

const GLYPHS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
const reduced = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

// One split-flap tile. When `char` changes it riffles through a few glyphs, then settles.
function Tile({ char, delay = 0, size }) {
  // start blank so tiles riffle in when they first appear
  const [shown, setShown] = useState(() => (reduced() ? char : ' '))
  const [flipping, setFlipping] = useState(false)
  const timer = useRef(null)

  useEffect(() => {
    if (reduced() || char === shown) { setShown(char); return }
    let n = 0
    const steps = 5 + Math.floor(Math.random() * 4)
    const start = setTimeout(() => {
      setFlipping(true)
      timer.current = setInterval(() => {
        n += 1
        if (n >= steps) {
          clearInterval(timer.current)
          setShown(char)
          setFlipping(false)
        } else {
          setShown(GLYPHS[Math.floor(Math.random() * GLYPHS.length)])
        }
      }, 55)
    }, delay)
    return () => { clearTimeout(start); clearInterval(timer.current) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [char])

  return (
    <span className={`tile tile-${size}${flipping ? ' flipping' : ''}`} aria-hidden="true">
      <span className="tile-char">{shown === ' ' ? ' ' : shown}</span>
    </span>
  )
}

// A row of tiles. `label` is what screen readers hear.
export default function Flap({ text, size = 'md', label, stagger = 45, startDelay = 0 }) {
  const chars = String(text).toUpperCase().split('')
  return (
    <span className="flap" role="img" aria-label={label || String(text)}>
      {chars.map((c, i) => <Tile key={i} char={c} size={size} delay={startDelay + i * stagger} />)}
    </span>
  )
}
