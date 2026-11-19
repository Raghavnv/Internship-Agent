import { useState } from 'react'

// The mark: a dashed route from you (amber) to the role (slate blue).
export const Logo = () => (
  <svg className="logo-svg" viewBox="0 0 24 14" width="24" height="14" aria-hidden="true">
    <path d="M3 12 Q12 -3 21 12" fill="none" stroke="#e9e6dd" strokeWidth="1.6" strokeDasharray="2.2 2.4" strokeLinecap="round" />
    <circle cx="3" cy="12" r="2.2" fill="#f0a35e" /><circle cx="21" cy="12" r="2.2" fill="#86b7d3" />
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
  calendar: 'M4 5h12a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1zM3 9h14M7 3v4M13 3v4',
  more: 'M5 10h.01M10 10h.01M15 10h.01',
  extension: 'M8 3.5a1.5 1.5 0 0 1 3 0V5h3a1 1 0 0 1 1 1v3h1.5a1.5 1.5 0 0 1 0 3H15v3a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-3h1.5a1.5 1.5 0 0 0 0-3H4V6a1 1 0 0 1 1-1h3z',
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

// Free-text tags. Anything typed is accepted as-is; suggestions only appear in a dropdown while typing.
export function ChipInput({ value = [], onChange, suggestions = [], placeholder, id, max = 40 }) {
  const [text, setText] = useState('')
  const [open, setOpen] = useState(false)
  const [hi, setHi] = useState(0)
  const has = (t) => value.some((v) => v.toLowerCase() === t.toLowerCase())
  const add = (raw) => {
    const t = raw.trim().replace(/,$/, '').trim()
    setText(''); setHi(0)
    if (!t || has(t) || value.length >= max) return
    onChange([...value, t])
  }
  const q = text.trim().toLowerCase()
  const pool = suggestions.map((x) => (typeof x === 'string' ? { value: x } : x)).filter((x) => !has(x.value))
  const ranked = q
    ? [...pool.filter((x) => x.value.toLowerCase().startsWith(q)), ...pool.filter((x) => !x.value.toLowerCase().startsWith(q) && x.value.toLowerCase().includes(q))]
    : pool
  const exact = ranked.find((x) => x.value.toLowerCase() === q)
  const options = [
    ...(q && !exact ? [{ value: text.trim(), typed: true }] : []),
    ...ranked.slice(0, 7),
  ]
  const show = open && q.length > 0 && options.length > 0
  const listId = `${id}-list`
  return (
    <div className="chip-input">
      <div className="chip-box" onClick={(e) => e.currentTarget.querySelector('input')?.focus()}>
        {value.map((v) => (
          <span key={v} className="tag">{v}
            <button type="button" aria-label={`Remove ${v}`} onClick={() => onChange(value.filter((x) => x !== v))}><Icon name="x" size={12} /></button>
          </span>
        ))}
        <input id={id} value={text} placeholder={value.length ? 'Add another' : placeholder} autoComplete="off"
          role="combobox" aria-expanded={show} aria-controls={listId} aria-autocomplete="list"
          aria-activedescendant={show ? `${listId}-${hi}` : undefined}
          onFocus={() => setOpen(true)}
          onChange={(e) => { const v = e.target.value; setOpen(true); setHi(0); if (v.endsWith(',')) add(v); else setText(v) }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown' && show) { e.preventDefault(); setHi((hi + 1) % options.length) }
            else if (e.key === 'ArrowUp' && show) { e.preventDefault(); setHi((hi - 1 + options.length) % options.length) }
            else if (e.key === 'Enter') { e.preventDefault(); add(show && q ? options[hi].value : text) }
            else if (e.key === 'Escape') setOpen(false)
            else if (e.key === 'Backspace' && !text && value.length) onChange(value.slice(0, -1))
          }}
          onBlur={() => { if (text.trim()) add(text); setOpen(false) }} />
      </div>
      {show && (
        <ul className="ac-list" id={listId} role="listbox">
          {options.map((o, i) => (
            <li key={`${o.typed ? 't' : 's'}${o.value}`} id={`${listId}-${i}`} role="option" aria-selected={i === hi}
              className={i === hi ? 'on' : ''} onMouseEnter={() => setHi(i)}
              onMouseDown={(e) => e.preventDefault()} onClick={() => add(o.value)}>
              {o.typed ? <>Add “<strong>{o.value}</strong>”</> : <>{o.value}{o.hint && <span className="ac-hint">{o.hint}</span>}</>}
            </li>
          ))}
        </ul>
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

// Copies text and briefly confirms.
export function CopyButton({ text, label = 'Copy', className = '' }) {
  const [done, setDone] = useState(false)
  return (
    <button type="button" className={`copy-btn ${className}`} onClick={async () => {
      try { await navigator.clipboard.writeText(text) } catch {
        const t = document.createElement('textarea'); t.value = text; document.body.appendChild(t); t.select(); document.execCommand('copy'); t.remove()
      }
      setDone(true); setTimeout(() => setDone(false), 1400)
    }}>{done ? 'Copied' : label}</button>
  )
}
