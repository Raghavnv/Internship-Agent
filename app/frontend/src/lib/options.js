export const ROLES = ['Software Engineering', 'Backend', 'Full Stack', 'Frontend', 'AI / ML', 'Data Science', 'Data Engineering',
  'Mobile', 'DevOps / Cloud', 'Security', 'Research', 'Forward Deployed', 'Product', 'Quant', 'Hardware / Embedded', 'Design / UX']

export const ROLE_INFO = {
  'Software Engineering': 'General engineering roles across a product',
  Backend: 'APIs, services, databases',
  'Full Stack': 'Both the interface and the server',
  Frontend: 'Interfaces people use',
  'AI / ML': 'Models, LLMs, applied ML',
  'Data Science': 'Analysis, statistics, experiments',
  'Data Engineering': 'Pipelines and data platforms',
  Mobile: 'iOS, Android, cross-platform',
  'DevOps / Cloud': 'Infrastructure, reliability, cloud',
  Security: 'Application and infrastructure security',
  Research: 'Research teams and labs',
  'Forward Deployed': 'Building alongside customers',
  Product: 'Product management',
  Quant: 'Trading and quantitative research',
  'Hardware / Embedded': 'Chips, firmware, devices',
  'Design / UX': 'Product and interaction design',
}

export const US_AUTH_INFO = {
  citizen: 'Every US role is open to you',
  authorized: 'We’ll still show roles that don’t sponsor visas',
  needs_sponsorship: 'We’ll push down roles that won’t sponsor',
  not_applicable: 'US roles won’t be ranked against this',
}

export const SKILLS = ['Python', 'Java', 'C', 'C++', 'JavaScript', 'TypeScript', 'Go', 'Rust', 'SQL', 'React', 'Next.js', 'Node.js',
  'FastAPI', 'Django', 'Flask', 'Spring', 'PostgreSQL', 'MySQL', 'MongoDB', 'Redis', 'Docker', 'Kubernetes', 'AWS', 'GCP', 'Azure',
  'Git', 'Linux', 'PyTorch', 'TensorFlow', 'scikit-learn', 'Pandas', 'NumPy', 'XGBoost', 'LLMs', 'RAG', 'LangChain', 'Computer Vision',
  'NLP', 'OpenCV', 'Kotlin', 'Swift', 'Flutter', 'React Native', 'Figma', 'Tableau', 'Spark', 'Kafka', 'GraphQL', 'REST APIs']

export const LOCATIONS = ['Remote', 'Bay Area', 'Seattle', 'New York', 'Austin', 'Dallas', 'Houston', 'Boston', 'Chicago', 'Los Angeles',
  'Anywhere in US', 'Bangalore', 'Hyderabad', 'Pune', 'Mumbai', 'Delhi', 'Chennai', 'Anywhere in India', 'Toronto', 'London']

export const DEGREE_LEVELS = [
  { value: 'high_school', label: 'High school' }, { value: 'bachelors', label: 'Bachelor’s' },
  { value: 'masters', label: 'Master’s' }, { value: 'phd', label: 'PhD' }, { value: 'other', label: 'Other' },
]

export const YEARS = ['1st year', '2nd year', '3rd year', '4th year', '5th year', 'Graduated']

export const WORK_MODES = [{ value: 'remote', label: 'Remote' }, { value: 'hybrid', label: 'Hybrid' }, { value: 'onsite', label: 'In person' }]

export const US_AUTH = [
  { value: 'citizen', label: 'US citizen' },
  { value: 'authorized', label: 'Authorised, no sponsorship needed' },
  { value: 'needs_sponsorship', label: 'I’d need visa sponsorship' },
  { value: 'not_applicable', label: 'Not looking at US roles' },
]

export const COMPANY_TYPES = ['Big tech', 'Startups', 'Finance and fintech', 'Research labs', 'Consulting', 'Product companies', 'Non-profits']

// "2027-06" (month input) <-> "2027-06-01" (date column)
export const toMonth = (d) => (d ? String(d).slice(0, 7) : '')
export const fromMonth = (m, end = false) => (m ? `${m}-${end ? '28' : '01'}` : null)
