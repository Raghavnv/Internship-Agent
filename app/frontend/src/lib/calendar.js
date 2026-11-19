// "Add to calendar" for interviews: a Google Calendar link and a downloadable .ics file.
const stamp = (d) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')

function event(app) {
  const start = new Date(app.interview_at)
  const end = new Date(start.getTime() + 60 * 60 * 1000)
  return {
    title: `Interview: ${app.title} at ${app.company}`,
    details: [`Role: ${app.title}`, `Company: ${app.company}`, app.url && `Listing: ${app.url}`, app.notes && `Notes: ${app.notes}`].filter(Boolean).join('\n'),
    start, end,
  }
}

export function googleCalendarUrl(app) {
  const e = event(app)
  const q = new URLSearchParams({ action: 'TEMPLATE', text: e.title, dates: `${stamp(e.start)}/${stamp(e.end)}`, details: e.details })
  return `https://calendar.google.com/calendar/render?${q}`
}

export function downloadIcs(app) {
  const e = event(app)
  const esc = (s) => s.replace(/[\;,]/g, (m) => `\\${m}`).replace(/\n/g, '\\n')
  const ics = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Internship Copilot//EN', 'BEGIN:VEVENT',
    `UID:${app.id}@internship-copilot`, `DTSTAMP:${stamp(new Date())}`, `DTSTART:${stamp(e.start)}`, `DTEND:${stamp(e.end)}`,
    `SUMMARY:${esc(e.title)}`, `DESCRIPTION:${esc(e.details)}`,
    'BEGIN:VALARM', 'TRIGGER:-PT1H', 'ACTION:DISPLAY', 'DESCRIPTION:Interview in one hour', 'END:VALARM',
    'END:VEVENT', 'END:VCALENDAR'].join('\r\n')
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([ics], { type: 'text/calendar' }))
  a.download = `interview-${(app.company || 'company').toLowerCase().replace(/\W+/g, '-')}.ics`
  a.click()
}

// what needs attention: upcoming interviews and follow-ups that are due
export function upcoming(apps, now = Date.now()) {
  const day = 86400000
  const items = []
  for (const a of apps) {
    if (a.interview_at) {
      const t = new Date(a.interview_at).getTime()
      if (t >= now - 2 * 3600000 && t <= now + 14 * day) items.push({ kind: 'interview', at: t, app: a })
    }
    if (['Applied', 'Online assessment'].includes(a.status)) {
      const due = a.follow_up_on ? new Date(a.follow_up_on).getTime() : a.applied_at ? new Date(a.applied_at).getTime() + 10 * day : null
      if (due && due <= now + 2 * day) items.push({ kind: 'follow', at: due, app: a, suggested: !a.follow_up_on })
    }
  }
  return items.sort((x, y) => x.at - y.at)
}
