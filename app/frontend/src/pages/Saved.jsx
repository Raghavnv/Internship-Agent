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
          <p className="sub">Roles you bookmarked to look at later. Apply from here when you&rsquo;re ready.</p>
        </div>
      </header>
      {data.loaded && jobs.length === 0 ? (
        <div className="empty-state">
          <h2>Nothing saved yet</h2>
          <p>Use the bookmark next to any role to keep it here.</p>
          <Link to="/app/explore" className="btn btn-primary">Explore internships</Link>
        </div>
      ) : <Results data={{ results: jobs }} limit={100} actions={data} />}
    </main>
  )
}
