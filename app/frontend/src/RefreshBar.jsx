// "Updated 12 min ago · Refresh", plus a notice when new matching roles arrive while you're on the page.
import { useEffect, useState } from 'react'
import { ago, useUpdates } from './lib/updates.js'
import { useSession } from './lib/session.jsx'
import { Icon, Spinner } from './ui.jsx'

export default function RefreshBar({ onReload }) {
  const { profile } = useSession()
  const u = useUpdates(profile)
  const [, tick] = useState(0)
  const [note, setNote] = useState('')
  useEffect(() => { const t = setInterval(() => tick((n) => n + 1), 60000); return () => clearInterval(t) }, [])
  const fresh = u.info?.new_fits || 0

  async function refresh() {
    setNote('')
    const r = await u.refresh()
    await onReload?.()
    u.acknowledge()
    setNote(!r ? 'Couldn’t check right now. Try again in a minute.'
      : r.new_fits ? `${r.new_fits} new ${r.new_fits === 1 ? 'match' : 'matches'} added.` : 'You’re up to date.')
    setTimeout(() => setNote(''), 4000)
  }

  return (
    <div className="refresh-bar" aria-live="polite">
      {fresh > 0 && !u.busy && (
        <button type="button" className="new-pill" onClick={refresh}>
          <i aria-hidden="true" />{fresh} new {fresh === 1 ? 'match' : 'matches'} posted · Show
        </button>
      )}
      <span className="rb-when">{note || (u.info ? `Updated ${ago(u.info.updated)}` : '')}</span>
      <button type="button" className="btn btn-ghost btn-sm rb-btn" onClick={refresh} disabled={u.busy} title="Check for newer listings">
        {u.busy ? <Spinner /> : <Icon name="refresh" size={14} />}{u.busy ? 'Checking…' : 'Refresh'}
      </button>
    </div>
  )
}
