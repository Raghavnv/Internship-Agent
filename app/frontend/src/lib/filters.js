// Role groups -> title words, shared by Job listings and the dashboard so their counts agree.
export const ROLE_WORDS = {
  'Software Engineering': ['software engineer', 'software develop', 'swe', 'sde'], Backend: ['backend', 'back-end', 'api', 'platform'],
  'Full Stack': ['full stack', 'full-stack', 'fullstack'], Frontend: ['frontend', 'front-end'],
  'AI / ML': ['machine learning', 'ml', 'ai', 'deep learning', 'llm'], 'Data Science': ['data scien', 'data analy'],
  'Data Engineering': ['data engineer'], Mobile: ['mobile', 'ios', 'android'], 'DevOps / Cloud': ['devops', 'cloud', 'sre', 'infrastructure'],
  Security: ['security'], Research: ['research'], 'Forward Deployed': ['forward deploy', 'solutions engineer'], Product: ['product'],
  Quant: ['quant', 'trading'], 'Hardware / Embedded': ['hardware', 'embedded', 'firmware'], 'Design / UX': ['design', 'ux'],
}

/** The filters Job listings starts with: the cities and roles from the profile. */
export function profileFilters(profile) {
  const locations = (profile?.locations || []).filter((l) => !/^remote$/i.test(l))
  const any = (profile?.roles || []).flatMap((r) => ROLE_WORDS[r] || [])
  return { locations: locations.length ? locations : undefined, any_keywords: any.length ? any : undefined }
}
