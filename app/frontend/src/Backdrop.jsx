/**
 * The app's sky: the curve of a huge planet's grid along the bottom, and a few flight paths
 * crossing slowly overhead, each carrying one light from an amber origin to a blue destination.
 * Purely decorative and fixed behind everything; motion stops with "reduce motion".
 */
const ROUTES = [
  { d: 'M-80 640 C 260 260, 760 160, 1180 330', dur: 26, delay: 0 },
  { d: 'M140 980 C 420 620, 980 520, 1540 600', dur: 34, delay: 9 },
  { d: 'M820 -40 C 1040 220, 1260 300, 1560 260', dur: 30, delay: 17 },
]

export default function Backdrop({ variant = 'app' }) {
  // latitude lines of a huge planet whose curve rises just above the bottom of the screen
  const parallels = [0, 1, 2, 3, 4, 5].map((i) => {
    const top = 640 + i * i * 14 + i * 34, rx = 1500 + i * 220
    return `M${720 - rx} ${top + 520} Q 720 ${top - 260}, ${720 + rx} ${top + 520}`
  })
  return (
    <div className={`backdrop bd-${variant}`} aria-hidden="true">
      <svg viewBox="0 0 1440 900" preserveAspectRatio="xMidYMid slice">
        <defs>
          <linearGradient id="bd-route" x1="0" x2="1">
            <stop offset="0" stopColor="#ffb05c" stopOpacity="0.0" />
            <stop offset="0.25" stopColor="#ffb05c" stopOpacity="0.5" />
            <stop offset="1" stopColor="#7cc4ff" stopOpacity="0.55" />
          </linearGradient>
          <radialGradient id="bd-horizon" cx="50%" cy="100%" r="70%">
            <stop offset="0" stopColor="#7cc4ff" stopOpacity="0.10" />
            <stop offset="1" stopColor="#7cc4ff" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="bd-sun" cx="12%" cy="0%" r="50%">
            <stop offset="0" stopColor="#ffb05c" stopOpacity="0.09" />
            <stop offset="1" stopColor="#ffb05c" stopOpacity="0" />
          </radialGradient>
        </defs>
        <rect width="1440" height="900" fill="url(#bd-sun)" />
        <rect width="1440" height="900" fill="url(#bd-horizon)" />
        <g className="bd-grid" fill="none" stroke="#9cc6dc" strokeWidth="1">
          {parallels.map((d, i) => <path key={'p' + i} d={d} />)}
        </g>
        <g className="bd-routes" fill="none">
          {ROUTES.map((r, i) => (
            <g key={i}>
              <path d={r.d} stroke="url(#bd-route)" strokeWidth="1" strokeDasharray="2 7" />
              <circle r="2.2" fill="#e9f5ff" className="bd-plane">
                <animateMotion dur={`${r.dur}s`} begin={`${r.delay}s`} repeatCount="indefinite" path={r.d} keyPoints="0;1" keyTimes="0;1" calcMode="spline" keySplines="0.45 0 0.55 1" />
              </circle>
            </g>
          ))}
        </g>
      </svg>
    </div>
  )
}
