import { useState } from 'react'

// The mark: an arc from you (apricot) to the role (periwinkle).
export const Logo = () => (
  <svg className="logo-svg" viewBox="0 0 24 14" width="24" height="14" aria-hidden="true">
    <defs>
      <linearGradient id="logo-g" x1="0" x2="1" y1="0" y2="0">
        <stop offset="0" stopColor="#ffb38a" /><stop offset=".5" stopColor="#e3a6d6" /><stop offset="1" stopColor="#9aa8ff" />
      </linearGradient>
    </defs>
    <path d="M3 12 Q12 -3 21 12" fill="none" stroke="url(#logo-g)" strokeWidth="2" strokeLinecap="round" />
    <circle cx="3" cy="12" r="2" fill="#ffb38a" /><circle cx="21" cy="12" r="2" fill="#9aa8ff" />
  </svg>
)

const PATHS = {
  overview: 'M3 10.5 10 4l7 6.5V17a1 1 0 0 1-1 1h-3.5v-5h-5v5H4a1 1 0 0 1-1-1z',
  copilot: 'M10 2.5l1.6 4.3 4.4 1.7-4.4 1.7L10 14.5l-1.6-4.3L4 8.5l4.4-1.7zM15.5 13l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7z',
  explore: 'M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16zm3.5-11.5-2 5-5 2 2-5z',
  applications: 'M4 5.5h12a1 1 0 0 1 1 1V16a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6.5a1 1 0 0 1 1-1zM7.5 5.5V4a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1v1.5M3 10h14',
  saved: 'M5.5 3h9a1 1 0 0 1 1 1v13.2l-5.5-3.6-5.5 3.6V4a1 1 0 0 1 1-1z',
  resume: 'M5 2.5h6.5L15.5 6.5V17a.5.5 0 0 1-.5.5H5a.5.5 0 0 1-.5-.5V3a.5.5 0 0 1 .5-.5zM11.5 2.5v4h4M7 10h6M7 13h6',
  portfolio: 'M3 6h14v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1zM3 6l2-3h10l2 3M8 10h4',
  profile: 'M10 10a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM3.5 17.5c.8-3.2 3.4-5 6.5-5s5.7 1.8 6.5 5',
  logout: 'M8 17H4.5a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1H8M13 14l4-4-4-4M17 10H8',
  plus: 'M10 4v12M4 10h12',
  x: 'M5 5l10 10M15 5 5 15',
  check: 'M4.5 10.5 8 14l7.5-8',
  upload: 'M10 13V3.5M6 7.5l4-4 4 4M3.5 13v3a1 1 0 0 0 1 1h11a1 1 0 0 0 1-1v-3',
  menu: 'M3 5.5h14M3 10h14M3 14.5h14',
  arrow: 'M4 10h11M11 5.5 15.5 10 11 14.5',
}

export function Icon({ name, size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" aria-hidden="true" className="ico-s">
      <path d={PATHS[name]} />
    </svg>
  )
}

// Multi-select from a fixed list of options
export function ChoiceChips({ options, value = [], onChange, single = false, label }) {
  const toggle = (o) => {
    if (single) return onChange(o)
    onChange(value.includes(o) ? value.filter((v) => v !== o) : [...value, o])
  }
  return (
    <div className="choices" role="group" aria-label={label}>
      {options.map((o) => {
        const key = typeof o === 'string' ? o : o.value
        const text = typeof o === 'string' ? o : o.label
        const on = single ? value === key : value.includes(key)
        return (
          <button key={key} type="button" className={`choice${on ? ' on' : ''}`} aria-pressed={on} onClick={() => toggle(key)}>
            {on && <Icon name="check" size={14} />}{text}
          </button>
        )
      })}
    </div>
  )
}

// Free-text tags with suggestions
export function ChipInput({ value = [], onChange, suggestions = [], placeholder, id, max = 40 }) {
  const [text, setText] = useState('')
  const add = (raw) => {
    const t = raw.trim().replace(/,$/, '')
    if (!t || value.some((v) => v.toLowerCase() === t.toLowerCase()) || value.length >= max) { setText(''); return }
    onChange([...value, t])
    setText('')
  }
  const left = suggestions.filter((s) => !value.some((v) => v.toLowerCase() === s.toLowerCase()))
  const match = text ? left.filter((s) => s.toLowerCase().includes(text.toLowerCase())).slice(0, 6) : []
  return (
    <div className="chip-input">
      <div className="chip-box">
        {value.map((v) => (
          <span key={v} className="tag">{v}
            <button type="button" aria-label={`Remove ${v}`} onClick={() => onChange(value.filter((x) => x !== v))}><Icon name="x" size={12} /></button>
          </span>
        ))}
        <input id={id} value={text} placeholder={value.length ? '' : placeholder}
          onChange={(e) => { const v = e.target.value; if (v.endsWith(',')) add(v); else setText(v) }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { e.preventDefault(); add(match[0] && text.length > 1 ? match[0] : text) }
            if (e.key === 'Backspace' && !text && value.length) onChange(value.slice(0, -1))
          }}
          onBlur={() => text && add(text)} />
      </div>
      {(match.length > 0 || (!text && left.length > 0)) && (
        <div className="chip-suggest">
          {(match.length ? match : left.slice(0, 10)).map((s) => (
            <button key={s} type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => add(s)}><Icon name="plus" size={12} />{s}</button>
          ))}
        </div>
      )}
    </div>
  )
}

export function Field({ label, hint, htmlFor, children, wide }) {
  return (
    <div className={`field${wide ? ' wide' : ''}`}>
      <label htmlFor={htmlFor}>{label}</label>
      {children}
      {hint && <p className="hint">{hint}</p>}
    </div>
  )
}

export function Spinner({ label = 'Loading' }) {
  return <span className="spinner" role="status"><span className="sr">{label}</span></span>
}
