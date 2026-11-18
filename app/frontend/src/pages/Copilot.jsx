import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { chat } from '../lib/api.js'
import { toPins, useMapData } from '../lib/mapdata.js'
import { useSession } from '../lib/session.jsx'
import { useUserData } from '../lib/userdata.jsx'
import { Results, RichText } from '../components.jsx'
import WorldMap from '../WorldMap.jsx'

const SUGGESTIONS = [
  'Best fits for me this summer', 'Remote internships from January to June',
  'Backend roles posted this week', 'Who’s hiring most in my cities?',
]
const KEY = 'copilot-thread'
const loadThread = () => { try { return JSON.parse(sessionStorage.getItem(KEY) || '[]') } catch { return [] } }

export default function Copilot() {
  const { profile, home } = useSession()
  const data = useUserData()
  const map = useMapData()
  const [params, setParams] = useSearchParams()
  const [messages, setMessages] = useState(loadThread)
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [focus, setFocus] = useState(null)
  const endRef = useRef(null)
  const inputRef = useRef(null)

  useEffect(() => { try { sessionStorage.setItem(KEY, JSON.stringify(messages.slice(-30))) } catch { /* ignore */ } }, [messages])
  useEffect(() => { if (messages.length) endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }) }, [messages, busy])
  useEffect(() => {
    const q = params.get('q')
    if (q && profile) { setParams({}, { replace: true }); ask(q) }
  }, [profile])

  const last = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) if (messages[i].last?.results) return messages[i].last.results
    return []
  }, [messages])

  async function ask(text) {
    const q = text.trim()
    if (!q || busy) return
    const next = [...messages, { role: 'user', content: q }]
    setMessages(next); setInput(''); setError(''); setBusy(true)
    try {
      const res = await chat(next.map(({ role, content }) => ({ role, content })), profile)
      setMessages([...next, { role: 'assistant', content: res.reply || 'Done.', last: res.last }])
    } catch (e) {
      setError(e.message); setMessages(messages); setInput(q)
    } finally {
      setBusy(false); inputRef.current?.focus()
    }
  }

  const composer = (
    <form className="composer" onSubmit={(e) => { e.preventDefault(); ask(input) }}>
      <label htmlFor="q" className="sr">Ask about internships</label>
      <textarea id="q" ref={inputRef} rows={1} value={input} placeholder={messages.length ? 'Ask a follow-up…' : 'Ask for any internship…'}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); ask(input) } }} />
      <button type="submit" disabled={busy || !input.trim()} aria-label="Send">
        <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 15V5M5.5 9.5 10 5l4.5 4.5" /></svg>
      </button>
    </form>
  )

  return (
    <div className="copilot">
      <div className="band">
        <WorldMap cities={map.cities} home={home} pins={toPins(last)} focus={focus} compact onCity={(c) => ask(`Internships in ${c} that fit me`)} />
      </div>
      <main className="thread">
        {messages.length === 0 ? (
          <div className="cp-empty">
            <h1>Ask for exactly what you want</h1>
            <p className="sub">Ask in plain words. I search every live listing, score each against your profile and plot the results on the map.</p>
            <ul className="suggest">{SUGGESTIONS.map((s) => <li key={s}><button type="button" onClick={() => ask(s)}>{s}</button></li>)}</ul>
          </div>
        ) : (
          <div className="cp-tools"><button type="button" className="link-btn" onClick={() => setMessages([])}>Start a new chat</button></div>
        )}
        {messages.map((m, i) => (
          <article key={i} className={`turn ${m.role}`}>
            {m.role === 'user' ? <p className="q">{m.content}</p> : (
              <>
                <div className="a"><RichText text={m.content} /></div>
                <Results data={m.last} onFocus={setFocus} />
              </>
            )}
          </article>
        ))}
        {busy && <article className="turn assistant"><p className="thinking"><span /><span /><span /><span className="sr">Searching</span></p></article>}
        {error && <p className="error" role="alert">{error}</p>}
        <div ref={endRef} />
        <div className="dock">{composer}</div>
      </main>
    </div>
  )
}
