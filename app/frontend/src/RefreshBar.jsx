// "Updated 12 min ago · Refresh", plus a notice when new matching roles arrive while you're on the page.
import { useEffect, useRef, useState } from 'react'
import { ago, useUpdates } from './lib/updates.js'
import { useSession } from './lib/session.jsx'
import { Icon, Spinner } from './ui.jsx'

export default function RefreshBar({ onReload }) {
  const { profile } = useSession()
  const u = useUpdates(profile)
  const [, tick] = useState(0)
  const [note, setNote] = useState('')
  const [fetching, setFetching] = useState(false)
  const alive = useRef(true)
  useEffect(() => {
    alive.current = true
    const t = setInterval(() => tick((n) => n + 1), 60000)
    return () => { alive.current = false; clearInterval(t) }
  }, [])
  const fresh = u.info?.new_fits || 0
  const wait = (ms) => new Promise((ok) => setTimeout(ok, ms))

  async function refresh() {
    setNote('')
    const before = u.info?.updated || 0
    let r = await u.refresh()
    // the server started a fresh check of every job board: wait for it to publish (usually ~1–2 min)
    if (r?.collecting) {
      setFetching(true)
      for (let i = 0; i < 16 && alive.current && r && r.collecting && !(r.updated > before); i++) {
        await wait(15000)
        r = (await u.refresh()) || r
      }
      if (!alive.current) return
      setFetching(false)
    }
    await onReload?.()
    u.acknowledge()
    setNote(!r ? 'Couldn’t check right now. Try again in a minute.'
      : r.new_fits ? `${r.new_fits} new ${r.new_fits === 1 ? 'match' : 'matches'} added.`
      : r.new ? `${r.new} new ${r.new === 1 ? 'listing' : 'listings'}, none a strong fit.` : 'You’re up to date.')
    setTimeout(() => alive.current && setNote(''), 5000)
  }
  const label = fetching ? 'Fetching…' : u.busy ? 'Checking…' : 'Refresh'

  return (
    <div className="refresh-bar" aria-live="polite">
      {fresh > 0 && !u.busy && !fetching && (
        <button type="button" className="new-pill" onClick={refresh}>
          <i aria-hidden="true" />{fresh} new {fresh === 1 ? 'match' : 'matches'} posted · Show
        </button>
      )}
      <span className="rb-when">
        {fetching ? 'Checking every job board for new postings. About a minute.' : note || (u.info ? `Updated ${ago(u.info.updated)}` : '')}
      </span>
      <button type="button" className="btn btn-ghost btn-sm rb-btn" onClick={refresh} disabled={u.busy || fetching}
        title={u.info?.live_fetch ? 'Check every job board for new postings now' : 'Load the newest listings'}>
        {u.busy || fetching ? <Spinner /> : <Icon name="refresh" size={14} />}{label}
      </button>
    </div>
  )
}
