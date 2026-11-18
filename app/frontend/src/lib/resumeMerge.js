// Turns what the AI read from a resume into a reviewable list of changes, then applies the chosen ones.
const norm = (v) => String(v ?? '').trim().toLowerCase()
const same = (a, b) => norm(a) === norm(b)

const FIELDS = [
  ['full_name', 'Name'], ['based_in', 'Location'], ['phone', 'Phone'], ['headline', 'Headline'], ['bio', 'About'],
  ['college', 'College'], ['degree', 'Degree'], ['major', 'Major'], ['grad_year', 'Graduation year'],
  ['linkedin', 'LinkedIn'], ['github', 'GitHub'], ['portfolio', 'Website'],
]
const LEVELS = { high_school: 'High school', bachelors: 'Bachelor’s', masters: 'Master’s', phd: 'PhD', other: 'Other' }

const fmtRange = (e) => [e.start, e.current ? 'now' : e.end].filter(Boolean).join(' to ')

/** Returns [{id, group, label, before?, after, defaultOn}] */
export function proposeChanges(profile = {}, projects = [], found = {}) {
  const out = []
  for (const [k, label] of FIELDS) {
    const v = found[k]
    if (v == null || v === '' || same(v, profile[k])) continue
    out.push({ id: `f:${k}`, group: 'Basics', label, before: profile[k] || null, after: String(v), defaultOn: true })
  }
  if (found.degree_level && found.degree_level !== profile.degree_level) {
    out.push({ id: 'f:degree_level', group: 'Basics', label: 'Degree level', before: LEVELS[profile.degree_level] || null, after: LEVELS[found.degree_level], defaultOn: !profile.degree_level || profile.degree_level === 'bachelors' })
  }
  const newSkills = (found.skills || []).filter((s) => !(profile.skills || []).some((x) => same(x, s)))
  if (newSkills.length) out.push({ id: 'skills', group: 'Skills', label: `Add ${newSkills.length} skills`, chips: newSkills, defaultOn: true })
  const newRoles = (found.roles || []).filter((r) => !(profile.roles || []).includes(r))
  if (newRoles.length) out.push({ id: 'roles', group: 'Skills', label: 'Add role interests', chips: newRoles, defaultOn: true })

  ;(found.experience || []).forEach((e, i) => {
    if ((profile.experience || []).some((x) => same(x.company, e.company) && same(x.title, e.title))) return
    out.push({ id: `exp:${i}`, group: 'Experience', label: `${e.title} at ${e.company}`, after: [fmtRange(e), e.location].filter(Boolean).join(', '), bullets: e.bullets, defaultOn: true })
  })
  ;(found.education || []).forEach((e, i) => {
    if ((profile.education || []).some((x) => same(x.school, e.school))) return
    out.push({ id: `edu:${i}`, group: 'Education', label: e.school, after: [[e.degree, e.field].filter(Boolean).join(' in '), fmtRange(e)].filter(Boolean).join(', '), defaultOn: true })
  })
  ;(found.projects || []).forEach((p, i) => {
    if (projects.some((x) => same(x.title, p.title))) return
    out.push({ id: `proj:${i}`, group: 'Projects', label: p.title, after: p.description, chips: p.tech, defaultOn: true })
  })
  const newCerts = (found.certifications || []).filter((c) => !(profile.certifications || []).some((x) => same(x.name, c.name)))
  if (newCerts.length) out.push({ id: 'certs', group: 'Certifications and achievements', label: `Add ${newCerts.length} ${newCerts.length === 1 ? 'certification' : 'certifications'}`, chips: newCerts.map((c) => c.name), defaultOn: true })
  const newAch = (found.achievements || []).filter((a) => !(profile.achievements || []).some((x) => same(x.title, a.title)))
  if (newAch.length) out.push({ id: 'ach', group: 'Certifications and achievements', label: `Add ${newAch.length} ${newAch.length === 1 ? 'achievement' : 'achievements'}`, chips: newAch.map((a) => a.title), defaultOn: true })
  const newLangs = (found.spoken_languages || []).filter((l) => !(profile.spoken_languages || []).some((x) => same(x, l)))
  if (newLangs.length) out.push({ id: 'langs', group: 'Languages and links', label: 'Add languages', chips: newLangs, defaultOn: true })
  const newLinks = (found.other_links || []).filter((l) => !(profile.other_links || []).some((x) => same(x.url, l.url)))
  if (newLinks.length) out.push({ id: 'links', group: 'Languages and links', label: 'Add links', chips: newLinks.map((l) => l.label), defaultOn: true })
  return out
}

/** Applies the chosen change ids. Returns { patch, newProjects } */
export function applyChanges(profile = {}, projects = [], found = {}, chosen = new Set()) {
  const patch = {}
  for (const [k] of FIELDS) if (chosen.has(`f:${k}`)) patch[k] = k === 'grad_year' ? Number(found[k]) : found[k]
  if (chosen.has('f:degree_level')) patch.degree_level = found.degree_level
  if (chosen.has('skills')) patch.skills = [...(profile.skills || []), ...(found.skills || []).filter((s) => !(profile.skills || []).some((x) => same(x, s)))]
  if (chosen.has('roles')) patch.roles = [...new Set([...(profile.roles || []), ...(found.roles || [])])]
  const exp = (found.experience || []).filter((_, i) => chosen.has(`exp:${i}`))
  if (exp.length) patch.experience = [...exp, ...(profile.experience || [])]
  const edu = (found.education || []).filter((_, i) => chosen.has(`edu:${i}`))
  if (edu.length) patch.education = [...edu, ...(profile.education || [])]
  if (chosen.has('certs')) patch.certifications = [...(profile.certifications || []), ...(found.certifications || []).filter((c) => !(profile.certifications || []).some((x) => same(x.name, c.name)))]
  if (chosen.has('ach')) patch.achievements = [...(profile.achievements || []), ...(found.achievements || []).filter((a) => !(profile.achievements || []).some((x) => same(x.title, a.title)))]
  if (chosen.has('langs')) patch.spoken_languages = [...(profile.spoken_languages || []), ...(found.spoken_languages || []).filter((l) => !(profile.spoken_languages || []).some((x) => same(x, l)))]
  if (chosen.has('links')) patch.other_links = [...(profile.other_links || []), ...(found.other_links || []).filter((l) => !(profile.other_links || []).some((x) => same(x.url, l.url)))]
  const newProjects = (found.projects || []).filter((p, i) => chosen.has(`proj:${i}`) && !projects.some((x) => same(x.title, p.title)))
  return { patch, newProjects }
}

/** Non-destructive version for onboarding: only fills empty fields and adds new list items. */
export function fillEmpty(profile, projects, found) {
  const changes = proposeChanges(profile, projects, found)
  const chosen = new Set(changes.filter((c) => !c.id.startsWith('f:') || !profile[c.id.slice(2)] || c.id === 'f:degree_level').map((c) => c.id))
  return { ...applyChanges(profile, projects, found, chosen), count: changes.length }
}
