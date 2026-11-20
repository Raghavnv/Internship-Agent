import { useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { suggestJobs } from './lib/api.js'
import { Icon } from './ui.jsx'

const IDEAS = ['Software engineer', 'Machine learning', 'Data science', 'Backend', 'Frontend', 'Quant', 'Product manager', 'Remote']

/** Keyword search for roles, skills or companies. Press / or ⌘K anywhere in the app to jump here. */
export default function SearchBar({ big = false, autoFocus = false, onSearch }) {
  const nav = useNavigate()
  const [params] = useSearchParams()
  const [q, setQ] = useState(params.get('q') || '')
  const [open, setOpen] = useState(false)
  const [sugg, setSugg] = useState([])
  const [hi, setHi] = useState(-1)
  const input = useRef(null)
  const box = useRef(null)

  useEffect(() => { setQ(params.get('q') || '') }, [params])

  // global shortcut
  useEffect(() => {
    if (big) return
    const onKey = (e) => {
      const typing = /input|textarea|select/i.test(e.target.tagName) || e.target.isContentEditable
      if ((e.key === 'k' && (e.metaKey || e.ctrlKey)) || (e.key === '/' && !typing)) {
        e.preventDefault(); input.current?.focus(); input.current?.select()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [big])

  useEffect(() => {
    const t = q.trim()
    if (t.length < 2) { setSugg([]); return }
    let live = true
    const id = setTimeout(() => suggestJobs(t).then((r) => live && setSugg(r.suggestions || [])).catch(() => {}), 140)
    return () => { live = false; clearTimeout(id) }
  }, [q])

  useEffect(() => {
    const off = (e) => { if (!box.current?.contains(e.target)) setOpen(false) }
    document.addEventListener('pointerdown', off)
    return () => document.removeEventListener('pointerdown', off)
  }, [])

  function go(text) {
    const t = (text ?? q).trim()
    if (!t) return
    setQ(t); setOpen(false); input.current?.blur()
    onSearch ? onSearch(t) : nav(`/app/search?q=${encodeURIComponent(t)}`)
  }

  const items = q.trim().length >= 2 ? sugg : IDEAS.map((t) => ({ kind: 'idea', text: t }))
  function onKeyDown(e) {
    if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setHi((h) => Math.min(items.length - 1, h + 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setHi((h) => Math.max(-1, h - 1)) }
    else if (e.key === 'Enter') { e.preventDefault(); go(hi >= 0 && items[hi] ? items[hi].text : undefined) }
    else if (e.key === 'Escape') { setOpen(false); input.current?.blur() }
  }

  return (
    <div className={`sbar${big ? ' big' : ''}${open ? ' open' : ''}`} ref={box} role="search">
      <form onSubmit={(e) => { e.preventDefault(); go() }} className="sbar-field">
        <Icon name="search" size={big ? 20 : 16} />
        <label htmlFor={big ? 'sbar-big' : 'sbar'} className="sr">Search roles, skills or companies</label>
        <input id={big ? 'sbar-big' : 'sbar'} ref={input} value={q} autoFocus={autoFocus} autoComplete="off"
          role="combobox" aria-expanded={open} aria-controls="sbar-list" aria-autocomplete="list"
          placeholder={big ? 'Search a role, skill or company: “SDE”, “ML Bangalore”, “Stripe”' : 'Search roles, skills, companies'}
          onChange={(e) => { setQ(e.target.value); setOpen(true); setHi(-1) }}
          onFocus={() => setOpen(true)} onKeyDown={onKeyDown} />
        {!big && !q && <kbd className="sbar-kbd" aria-hidden="true">/</kbd>}
        {big && <button type="submit" className="btn btn-primary">Search</button>}
      </form>
      {open && items.length > 0 && (
        <ul className="sbar-list" id="sbar-list" role="listbox">
          {q.trim().length < 2 && <li className="sbar-cap" aria-hidden="true">Popular searches</li>}
          {items.map((s, i) => (
            <li key={s.kind + s.text} role="option" aria-selected={hi === i}>
              <button type="button" className={hi === i ? 'hi' : ''} onMouseEnter={() => setHi(i)} onClick={() => go(s.text)}>
                <Icon name={s.kind === 'company' ? 'building' : 'search'} size={14} />
                <span>{s.text}</span>
                {s.kind === 'company' ? <em>company</em> : s.count ? <em>{s.count} {s.count === 1 ? 'role' : 'roles'}</em> : null}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
