// node widget/test.js : checks the menu the widget prints, using real listings if available
const { buildMenu } = require('./internships.15m.js')
const fs = require('fs')
const path = process.argv[2] || '/tmp/jobs.json'
const payload = JSON.parse(fs.readFileSync(path, 'utf8'))
const now = payload.updated
// pretend a few strong matches were posted in the last day
let n = 0
for (const j of payload.jobs) if (j.fit && j.fit.score >= 80 && n < 3) { j.posted = now - 3600 * (n + 1); n++ }
const { text, fresh } = buildMenu(payload, { minFit: 60, appUrl: 'https://copilot.example', now })
console.log(text.split('\n').slice(0, 24).join('\n'))
console.log('...')
const lines = text.split('\n')
if (!lines[0].startsWith(`${fresh.length} |`)) throw new Error('title should show the new-match count')
if (fresh.length < 3) throw new Error('expected 3 fresh matches')
if (lines.some((l) => !l.includes('|') && l !== '---')) throw new Error('every line needs params or be a separator')
console.log('OK: fresh =', fresh.length, 'lines =', lines.length)
