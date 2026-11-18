#!/usr/bin/osascript -l JavaScript
// <xbar.title>Internship Copilot</xbar.title>
// <xbar.desc>New internships that fit you, straight from your alert agent. Refreshes every 15 minutes.</xbar.desc>
// <xbar.author>Raghav Venkat</xbar.author>
// <xbar.var>string(VAR_DATA_URL="https://raw.githubusercontent.com/Raghavnv/Internship-Agent/data/jobs.json"): Listings published by the alert agent</xbar.var>
// <xbar.var>string(VAR_APP_URL=""): Your deployed Internship Copilot URL (optional)</xbar.var>
// <xbar.var>number(VAR_MIN_FIT=60): Only show roles with at least this fit score</xbar.var>
// <xbar.var>boolean(VAR_NOTIFY=true): Show a Mac notification for new strong matches</xbar.var>
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
function buildMenu(payload, opts) {
  const now = opts.now || Date.now() / 1000
  const minFit = opts.minFit
  const fits = payload.jobs.filter((j) => j.fit && j.fit.score >= minFit)
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
  return { text: out.join('\n'), fresh }
}

if (typeof module !== 'undefined') { module.exports = { buildMenu } } else { main() }

function main() {
  const url = env('VAR_DATA_URL', 'https://raw.githubusercontent.com/Raghavnv/Internship-Agent/data/jobs.json')
  const err = $()
  const raw = $.NSString.stringWithContentsOfURLEncodingError($.NSURL.URLWithString(url), $.NSUTF8StringEncoding, err)
  if (raw.isNil()) {
    console.log('| sfimage=wifi.exclamationmark\n---\nCouldn’t load listings. Check your connection. | color=#f0a58f\nRefresh now | refresh=true')
    return
  }
  const payload = JSON.parse(ObjC.unwrap(raw))
  const { text, fresh } = buildMenu(payload, {
    minFit: Number(env('VAR_MIN_FIT', '60')), appUrl: env('VAR_APP_URL', ''),
  })
  console.log(text)

  // notify once per new job
  if (String(env('VAR_NOTIFY', 'true')) !== 'false' && fresh.length) {
    const dir = env('SWIFTBAR_PLUGIN_DATA_PATH', ObjC.unwrap($.NSHomeDirectory()) + '/.internship-copilot')
    $.NSFileManager.defaultManager.createDirectoryAtPathWithIntermediateDirectoriesAttributesError(dir, true, $(), $())
    const file = dir + '/notified.json'
    let seen = []
    const prev = $.NSString.stringWithContentsOfFileEncodingError(file, $.NSUTF8StringEncoding, $())
    if (!prev.isNil()) { try { seen = JSON.parse(ObjC.unwrap(prev)) } catch (e) { seen = [] } }
    const unseen = fresh.filter((j) => !seen.includes(j.id))
    if (unseen.length) {
      const app = Application.currentApplication()
      app.includeStandardAdditions = true
      const top = unseen[0]
      const body = unseen.length === 1
        ? `${top.company}, ${(top.locations || ['Remote'])[0].split(',')[0]} (fit ${top.fit.score})`
        : `${top.company} and ${unseen.length - 1} more`
      app.displayNotification(body, { withTitle: unseen.length === 1 ? top.title : `${unseen.length} new internships for you`, soundName: 'Glass' })
      const keep = [...unseen.map((j) => j.id), ...seen].slice(0, 500)
      $(JSON.stringify(keep)).writeToFileAtomicallyEncodingError(file, true, $.NSUTF8StringEncoding, $())
    }
  }
}
