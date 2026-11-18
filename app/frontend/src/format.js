// Airport-style city codes for the ticket stubs.
const CODES = [
  [/remote|work from home|wfh|anywhere/i, 'WFH'],
  [/austin|round rock|cedar park/i, 'AUS'],
  [/dallas|irving|plano|frisco|richardson|fort worth|addison|mckinney|carrollton/i, 'DFW'],
  [/houston|sugar land|woodlands|katy/i, 'IAH'],
  [/san jose|santa clara|sunnyvale|milpitas|cupertino|campbell|los gatos/i, 'SJC'],
  [/mountain view|palo alto|menlo park|redwood city|san mateo|foster city|burlingame/i, 'PAO'],
  [/\bsf\b|san francisco|oakland|berkeley|emeryville/i, 'SFO'],
  [/bangalore|bengaluru/i, 'BLR'],
  [/hyderabad/i, 'HYD'], [/pune/i, 'PNQ'], [/mumbai/i, 'BOM'], [/delhi|gurgaon|gurugram|noida/i, 'DEL'],
  [/chennai/i, 'MAA'], [/new york|nyc|brooklyn|manhattan|jersey city/i, 'NYC'],
  [/seattle|redmond|bellevue|kirkland/i, 'SEA'], [/boston|cambridge, ma|waltham/i, 'BOS'],
  [/chicago/i, 'ORD'], [/los angeles|santa monica|culver city|el segundo|irvine/i, 'LAX'],
  [/san diego/i, 'SAN'], [/atlanta/i, 'ATL'], [/denver|boulder/i, 'DEN'], [/washington|arlington, va|mclean|reston/i, 'DCA'],
  [/toronto/i, 'YYZ'], [/london/i, 'LHR'], [/\bindia\b/i, 'IND'], [/usa|united states|\bus\b/i, 'USA'],
]

export function cityCode(loc = '') {
  for (const [re, code] of CODES) if (re.test(loc)) return code
  const city = loc.split(',')[0].replace(/[^a-z]/gi, '')
  return (city.slice(0, 3) || '???').toUpperCase()
}

export function cityName(loc = '') {
  return loc.split(',')[0].trim() || loc
}

export function postedLabel(iso) {
  if (!iso) return null
  const days = Math.round((Date.now() - new Date(iso + 'T12:00:00').getTime()) / 86400000)
  if (days <= 0) return 'Posted today'
  if (days === 1) return 'Posted yesterday'
  if (days < 30) return `Posted ${days} days ago`
  return `Posted ${new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}`
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const ym = (s) => { const [y, m] = String(s).split('-'); return `${MONTHS[(+m || 1) - 1]} ${y}` }

// Human-readable chips for what the AI searched for.
export function describeArgs(a = {}) {
  const chips = []
  const words = [...(a.keywords || []), ...(a.any_keywords || [])]
  if (words.length) chips.push({ k: 'Role', v: words.slice(0, 4).join(' / ') + (words.length > 4 ? ' …' : '') })
  if (a.locations?.length) chips.push({ k: 'Where', v: a.locations.join(', ') })
  if (a.remote === 'only') chips.push({ k: 'Where', v: 'Remote only' })
  if (a.remote === 'exclude') chips.push({ k: 'Where', v: 'Not remote' })
  if (a.start_month || a.end_month) chips.push({ k: 'When', v: `${a.start_month ? ym(a.start_month) : '…'} to ${a.end_month ? ym(a.end_month) : '…'}` })
  if (a.terms?.length) chips.push({ k: 'Term', v: a.terms.join(', ') })
  if (a.companies?.length) chips.push({ k: 'Company', v: a.companies.join(', ') })
  if (a.categories?.length) chips.push({ k: 'Field', v: a.categories.join(', ') })
  if (a.posted_within_days) chips.push({ k: 'Posted', v: `last ${a.posted_within_days} days` })
  if (a.exclude_keywords?.length) chips.push({ k: 'Excluding', v: a.exclude_keywords.join(', ') })
  if (a.undergrad_only) chips.push({ k: 'Degree', v: 'Undergrad OK' })
  if (a.needs_sponsorship) chips.push({ k: 'Visa', v: 'Sponsorship possible' })
  if (a.fit_only) chips.push({ k: 'Fit', v: 'Matches my profile' })
  if (a.include_undated === false) chips.push({ k: 'Dates', v: 'Stated only' })
  if (a.sort && a.sort !== 'relevance') chips.push({ k: 'Sort', v: a.sort === 'fit' ? 'Best fit' : 'Newest' })
  return chips
}
