import { Link } from 'react-router-dom'
import { useUserData } from '../lib/userdata.jsx'
import { Results } from '../components.jsx'

export default function Saved() {
  const data = useUserData()
  const jobs = data.saved.map((s) => ({ locations: [], terms: [], ...s.job }))
  return (
    <main className="page">
      <header className="page-head">
        <div>
          <h1>Saved</h1>
          <p className="sub">Roles you’re keeping an eye on. Select one to read it in full or apply.</p>
        </div>
      </header>
      {data.loaded && jobs.length === 0 ? (
        <div className="empty-state">
          <h2>Nothing saved yet</h2>
          <p>Open any role and choose Save to keep it here.</p>
          <Link to="/app/explore" className="btn btn-primary">Explore internships</Link>
        </div>
      ) : <Results data={{ results: jobs }} limit={100} showChips={false} />}
    </main>
  )
}
