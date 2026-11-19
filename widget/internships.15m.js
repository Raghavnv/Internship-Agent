#!/usr/bin/osascript -l JavaScript
// <xbar.title>Internship Copilot</xbar.title>
// <xbar.desc>New internships that fit you, straight from your alert agent. Refreshes every 15 minutes.</xbar.desc>
// <xbar.author>Raghav Venkat</xbar.author>
// <xbar.var>string(VAR_DATA_URL="https://raw.githubusercontent.com/Raghavnv/Internship-Agent/data/jobs.json"): Listings published by the alert agent</xbar.var>
// <xbar.var>string(VAR_APP_URL=""): Your deployed Internship Copilot URL (optional)</xbar.var>
// <xbar.var>number(VAR_MIN_FIT=60): Only show roles with at least this fit score</xbar.var>
// <xbar.var>boolean(VAR_NOTIFY=true): Show a Mac notification for new strong matches</xbar.var>
// <xbar.var>number(VAR_NOTIFY_FIT=80): Only notify for new roles with at least this fit score</xbar.var>
// <xbar.var>string(VAR_WATCH=""): Companies to watch, comma separated (e.g. Stripe, Google). You're notified when they open</xbar.var>
// <swiftbar.hideRunInTerminal>true</swiftbar.hideRunInTerminal>
// <swiftbar.hideDisablePlugin>true</swiftbar.hideDisablePlugin>
// <swiftbar.hideSwiftBar>true</swiftbar.hideSwiftBar>
//
// Install: put this file in your SwiftBar plugins folder and make it executable (see widget/README.md).
// Written in JavaScript for macOS (JXA) so it needs nothing installed besides SwiftBar.

if (typeof ObjC !== 'undefined') ObjC.import('Foundation')

const env = (k, d) => {
  const v = $.NSProcessInfo.processInfo.environment.objectForKey(k)
  return v.isNil() ? d : ObjC.unwrap(v)
}

// ── pure logic (also unit-tested with node, see widget/test.js) ──
const SUFFIX = /\b(inc|llc|ltd|limited|corp|corporation|co|company|plc|gmbh|technologies|technology|labs?|group|holdings)\b\.?/g
function companyKey(name) {   // same as agent/signals.py
  return String(name || '').toLowerCase().replace(/&/g, ' and ').replace(/\(.*?\)/g, ' ').replace(SUFFIX, ' ').replace(/[^a-z0-9]+/g, ' ').trim()
}
const DAY = 86400000
const fmtDay = (d) => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })

// When a company usually opens this season: its last two seasons' dates moved into this season's calendar.
function expected(rec, cycle) {
  const past = Object.entries(rec.cycles || {}).filter(([c]) => Number(c) < cycle).slice(-2)
    .map(([c, d]) => { const t = new Date(d + 'T00:00:00'); t.setFullYear(t.getFullYear() + (cycle - Number(c))); return t })
  if (past.length < 2) return null
  const spread = Math.abs(past[0] - past[1]) / DAY
  if (spread > 60) return null                       // too irregular to predict
  return new Date((past[0].getTime() + past[1].getTime()) / 2)
}

function openingsSection(op, opts) {
  if (!op || !op.companies) return { lines: [], justOpened: [] }
  const cycle = Number(op.cycle)
  const today = new Date((opts.now || Date.now() / 1000) * 1000)
  const roles = {}
  for (const j of opts.jobs || []) { const k = companyKey(j.company); roles[k] = (roles[k] || 0) + 1 }
  const lines = [], justOpened = []
  const watch = (opts.watch || []).map((w) => w.trim()).filter(Boolean)
  if (watch.length) {
    lines.push('Watching | size=12 color=#98a2a0')
    for (const w of watch) {
      const rec = op.companies[companyKey(w)]
      const opened = rec && rec.cycles && rec.cycles[String(cycle)]
      if (opened) {
        const n = roles[companyKey(w)] || 0
        lines.push(`${rec.name}: open since ${fmtDay(new Date(opened + 'T00:00:00'))}${n ? `, ${n} role${n === 1 ? '' : 's'}` : ''} | color=#9fcb8c`)
        if ((today - new Date(opened + 'T00:00:00')) / DAY <= 3) justOpened.push({ name: rec.name, key: companyKey(w) })
      } else {
        const e = rec && expected(rec, cycle)
        lines.push(`${rec ? rec.name : w}: ${e ? `usually opens around ${fmtDay(e)}` : 'not open yet'} | color=#98a2a0`)
      }
    }
    lines.push('---')
  }
  const soon = []
  for (const rec of Object.values(op.companies)) {
    if ((rec.cycles || {})[String(cycle)]) continue
    const e = expected(rec, cycle)
    if (!e) continue
    const days = Math.round((e - today) / DAY)
    if (days >= -3 && days <= 7) soon.push({ rec, e, days })
  }
  soon.sort((a, b) => a.e - b.e)
  if (soon.length) {
    lines.push(`Usually opening this week (${soon.length}) | size=12 color=#98a2a0`)
    for (const { rec, e, days } of soon.slice(0, 10)) {
      const when = days < 0 ? 'due now' : days === 0 ? 'today' : `in ${days}d`
      lines.push(`${String(rec.name).replace(/\|/g, '/')}  ·  ~${fmtDay(e)} (${when})${opts.appUrl ? ` | href=${opts.appUrl}/app/openings` : ' | color=#e9e6dd'}`)
    }
    lines.push('---')
  }
  return { lines, justOpened }
}

function buildMenu(payload, opts) {
  const now = opts.now || Date.now() / 1000
  const minFit = opts.minFit
  // skip likely ghost listings: reposted again and again, or up for four months
  const ghost = (j) => (j.reposts || 0) >= 3 || (j.posted && now - j.posted > 120 * 86400)
  const fits = payload.jobs.filter((j) => j.fit && j.fit.score >= minFit && !ghost(j))
  const dayAgo = now - 86400
  // posting date when the source gives one, otherwise when the agent first saw it
  const isNew = (j) => (j.posted ? j.posted : j.first_seen || 0) >= dayAgo
  const fresh = fits.filter(isNew).sort((a, b) => b.fit.score - a.fit.score)
  const best = fits.filter((j) => !isNew(j)).sort((a, b) => b.fit.score - a.fit.score).slice(0, 10)
  const city = (j) => ((j.locations || [])[0] || 'Remote').split(',')[0]
  const clean = (s) => String(s || '').replace(/\|/g, '/').replace(/\n/g, ' ')
  const line = (j) => {
    const when = (j.terms || []).slice(0, 1).join('') || 'dates not stated'
    return [
      `${clean(j.title)} | href=${j.url} length=60`,
      `--${clean(j.company)}, ${clean(city(j))} | size=12`,
      `--${when}, fit ${j.fit.score}/100 | size=12`,
      `--Apply | href=${j.url}`,
    ]
  }
  const out = []
  out.push(fresh.length ? `${fresh.length} | sfimage=briefcase.fill` : '| sfimage=briefcase')
  out.push('---')
  const upd = new Date(payload.updated * 1000)
  const hh = String(upd.getHours()).padStart(2, '0'), mm = String(upd.getMinutes()).padStart(2, '0')
  out.push(`${payload.count.toLocaleString('en-IN')} live listings, updated ${hh}:${mm} | size=12 color=#8c96ab`)
  out.push('---')
  const ops = openingsSection(opts.openings, { ...opts, jobs: payload.jobs, now })
  out.push(...ops.lines)
  if (fresh.length) {
    out.push(`New in the last 24 hours (${fresh.length}) | size=12 color=#8c96ab`)
    fresh.slice(0, 15).forEach((j) => out.push(...line(j)))
    if (fresh.length > 15) out.push(`…and ${fresh.length - 15} more | size=12 color=#8c96ab`)
  } else {
    out.push('No new strong matches today | size=12 color=#8c96ab')
  }
  out.push('---')
  out.push('Your best fits | size=12 color=#8c96ab')
  best.forEach((j) => out.push(...line(j)))
  out.push('---')
  if (opts.appUrl) out.push(`Open Internship Copilot | href=${opts.appUrl} sfimage=sparkle.magnifyingglass`)
  out.push('Refresh now | refresh=true sfimage=arrow.clockwise')
  return { text: out.join('\n'), fresh, justOpened: ops.justOpened }
}

if (typeof module !== 'undefined') { module.exports = { buildMenu, companyKey } } else { main() }

function main() {
  const url = env('VAR_DATA_URL', 'https://raw.githubusercontent.com/Raghavnv/Internship-Agent/data/jobs.json')
  const err = $()
  const raw = $.NSString.stringWithContentsOfURLEncodingError($.NSURL.URLWithString(url), $.NSUTF8StringEncoding, err)
  if (raw.isNil()) {
    console.log('| sfimage=wifi.exclamationmark\n---\nCouldn’t load listings. Check your connection. | color=#f0a58f\nRefresh now | refresh=true')
    return
  }
  const payload = JSON.parse(ObjC.unwrap(raw))
  // openings.json sits next to jobs.json; optional
  let openings = null
  const opRaw = $.NSString.stringWithContentsOfURLEncodingError($.NSURL.URLWithString(url.replace(/[^/]+$/, 'openings.json')), $.NSUTF8StringEncoding, $())
  if (!opRaw.isNil()) { try { openings = JSON.parse(ObjC.unwrap(opRaw)) } catch (e) { openings = null } }
  const appUrl = String(env('VAR_APP_URL', '')).replace(/\/+$/, '')
  const { text, fresh, justOpened } = buildMenu(payload, {
    minFit: Number(env('VAR_MIN_FIT', '60')), appUrl, openings, watch: String(env('VAR_WATCH', '')).split(','),
  })
  console.log(text)
  const notifyOn = String(env('VAR_NOTIFY', 'true')) !== 'false'
  const dataDir = env('SWIFTBAR_PLUGIN_DATA_PATH', ObjC.unwrap($.NSHomeDirectory()) + '/.internship-copilot')

  // a watched company just opened: tell once per company per season
  if (notifyOn && justOpened.length && openings) {
    $.NSFileManager.defaultManager.createDirectoryAtPathWithIntermediateDirectoriesAttributesError(dataDir, true, $(), $())
    const f = dataDir + '/opened.json'
    let told = []
    const prev = $.NSString.stringWithContentsOfFileEncodingError(f, $.NSUTF8StringEncoding, $())
    if (!prev.isNil()) { try { told = JSON.parse(ObjC.unwrap(prev)) } catch (e) { told = [] } }
    const fresh2 = justOpened.filter((c) => !told.includes(`${openings.cycle}:${c.key}`))
    if (fresh2.length) {
      const app = Application.currentApplication(); app.includeStandardAdditions = true
      app.displayNotification(`${fresh2.map((c) => c.name).join(', ')} just opened Summer ${openings.cycle} internships`, { withTitle: 'A company you watch is hiring', soundName: 'Glass' })
      $(JSON.stringify([...fresh2.map((c) => `${openings.cycle}:${c.key}`), ...told].slice(0, 300))).writeToFileAtomicallyEncodingError(f, true, $.NSUTF8StringEncoding, $())
    }
  }

  // notify once per new job
  if (notifyOn && fresh.length) {
    const dir = dataDir
    $.NSFileManager.defaultManager.createDirectoryAtPathWithIntermediateDirectoriesAttributesError(dir, true, $(), $())
    const file = dir + '/notified.json'
    let seen = []
    const prev = $.NSString.stringWithContentsOfFileEncodingError(file, $.NSUTF8StringEncoding, $())
    if (!prev.isNil()) { try { seen = JSON.parse(ObjC.unwrap(prev)) } catch (e) { seen = [] } }
    const notifyFit = Number(env('VAR_NOTIFY_FIT', '80'))
    const unseen = fresh.filter((j) => !seen.includes(j.id))
    const strong = unseen.filter((j) => j.fit.score >= notifyFit)
    // remember everything we've seen, but only ping for strong fits
    if (unseen.length && !strong.length) {
      $(JSON.stringify([...unseen.map((j) => j.id), ...seen].slice(0, 1000))).writeToFileAtomicallyEncodingError(file, true, $.NSUTF8StringEncoding, $())
    }
    if (strong.length) {
      const app = Application.currentApplication()
      app.includeStandardAdditions = true
      const top = strong[0]
      const where = (top.locations || ['Remote'])[0].split(',')[0]
      const body = strong.length === 1
        ? `${top.company}, ${where} · fit ${top.fit.score}`
        : `${top.title} at ${top.company} (fit ${top.fit.score}) and ${strong.length - 1} more. Click the briefcase to see them.`
      app.displayNotification(body, { withTitle: strong.length === 1 ? top.title : `${strong.length} strong new matches`, soundName: 'Glass' })
      const keep = [...unseen.map((j) => j.id), ...seen].slice(0, 1000)
      $(JSON.stringify(keep)).writeToFileAtomicallyEncodingError(file, true, $.NSUTF8StringEncoding, $())
    }
  }
}
