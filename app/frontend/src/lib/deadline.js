// "Closes in 3 days" from a listing's stated application deadline (unix time, end of that day).
export function closesIn(job) {
  const ts = job?.closes
  if (!ts) return null
  const end = new Date(ts * 1000); end.setHours(0, 0, 0, 0)
  const today = new Date(); today.setHours(0, 0, 0, 0)
  return Math.round((end - today) / 86400000)
}

export function closesLabel(days) {
  if (days == null || days < 0) return null
  if (days === 0) return 'Closes today'
  if (days === 1) return 'Closes tomorrow'
  return `Closes in ${days} days`
}

export const closesLevel = (days) => (days == null ? null : days <= 3 ? 'urgent' : days <= 10 ? 'soon' : 'later')

export const closesDate = (ts) => new Date(ts * 1000).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
