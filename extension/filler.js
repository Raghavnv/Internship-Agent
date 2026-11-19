// Injected into the application page (every frame) when you click "Fill this page".
// Defines globalThis.__icFill(profile) → { filled, fields: [label…], review: [label…] }.
// Reads each field's label, matches it to your profile, and fills only fields that are empty.
(() => {
  if (globalThis.__icFill) return

  const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december']
  const clean = (s) => (s || '').replace(/\s+/g, ' ').trim()
  const visible = (el) => {
    if (el.disabled || el.readOnly) return false
    const r = el.getBoundingClientRect()
    const st = getComputedStyle(el)
    return r.width > 0 && r.height > 0 && st.visibility !== 'hidden' && st.display !== 'none'
  }

  // Everything that describes a field: its label, aria text, placeholder, name/id, Workday's automation id,
  // and the legend/heading of the group it sits in ("From", "Work Experience 2").
  function describe(el) {
    const bits = []
    const byId = (id) => { const n = id && document.getElementById(id); return n ? n.textContent : '' }
    let labelled = false
    if (el.id) { const l = document.querySelector(`label[for="${CSS.escape(el.id)}"]`); if (l) { bits.push(l.textContent); labelled = true } }
    const wrap = el.closest('label'); if (wrap) { bits.push(wrap.textContent); labelled = true }
    bits.push(el.getAttribute('aria-label'), (el.getAttribute('aria-labelledby') || '').split(' ').map(byId).join(' '))
    bits.push(el.placeholder, el.name, el.id, el.getAttribute('data-automation-id'), el.autocomplete)
    let p = el.parentElement
    for (let i = 0; p && i < 4; i++, p = p.parentElement) {
      const auto = p.getAttribute('data-automation-id'); if (auto) bits.push(auto)
      // a nearby label only counts if it isn't tied to a different field, and only when the field has none of its own
      if (i < 3 && !labelled) {
        const lab = [...p.querySelectorAll(':scope > label, :scope > [data-automation-id="formLabel"]')]
          .find((l) => !l.contains(el) && (!l.htmlFor || l.htmlFor === el.id))
        if (lab && p.querySelectorAll('input, textarea, select').length <= 2) { bits.push(lab.textContent); labelled = true }
      }
    }
    const group = el.closest('fieldset, [role="group"]')
    if (group) bits.push(group.querySelector('legend')?.textContent, group.getAttribute('aria-label'))
    return clean(bits.filter(Boolean).join(' | ')).toLowerCase()
  }

  // Sets a value the way a person typing would, so React/Workday notice it.
  function setValue(el, value) {
    const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
    const setter = Object.getOwnPropertyDescriptor(proto, 'value').set
    el.focus()
    setter.call(el, value)
    el.dispatchEvent(new Event('input', { bubbles: true }))
    el.dispatchEvent(new Event('change', { bubbles: true }))
    el.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: 'Tab' }))
    el.blur()
    el.dispatchEvent(new Event('blur', { bubbles: true }))
  }

  function setSelect(el, value) {
    const want = String(value).toLowerCase()
    const opts = [...el.options]
    const hit = opts.find((o) => o.text.trim().toLowerCase() === want) || opts.find((o) => o.value.toLowerCase() === want)
      || opts.find((o) => o.text.toLowerCase().includes(want)) || (want.length > 3 && opts.find((o) => want.includes(o.text.trim().toLowerCase()) && o.text.trim().length > 2))
      || degreeMatch(opts, want)
    if (!hit) return false
    el.value = hit.value
    el.dispatchEvent(new Event('input', { bubbles: true }))
    el.dispatchEvent(new Event('change', { bubbles: true }))
    return true
  }

  // "Bachelor of Engineering" ↔ "Bachelor's Degree", "B.E." ↔ "Bachelors", "M.Tech" ↔ "Master's"
  function degreeMatch(opts, want) {
    const level = /bachelor|\bb\.?\s?(e|tech|sc|s|a)\b|undergrad/.test(want) ? 'bachelor' : /master|\bm\.?\s?(e|tech|sc|s|a)\b|mba/.test(want) ? 'master'
      : /ph\.?d|doctor/.test(want) ? 'doctor' : /high school|secondary/.test(want) ? 'high school' : null
    return level ? opts.find((o) => o.text.toLowerCase().includes(level)) : null
  }

  const ym = (s) => { const m = /^(\d{4})-(\d{2})/.exec(s || ''); return m ? { y: m[1], m: m[2] } : null }

  // Rules are tried in order; the first whose pattern matches (and whose `not` doesn't) wins.
  const RULES = [
    { key: 'skip', re: /password|captcha|search|referr(al|er) (code|name)|employee id|ssn|social security|salary|signature|coupon|verification code/ },
    { key: 'first', re: /first[\s_-]*name|given[\s_-]*name|\bfname\b|legalnamesection_firstname/, not: /preferred|middle/ },
    { key: 'last', re: /(?<![a-z])last[\s_-]*name|family[\s_-]*name|surname|\blname\b|legalnamesection_lastname/, not: /preferred/ },
    { key: 'full', re: /full[\s_-]*name|^name\b|\byour name|candidate name|legal name/, not: /company|school|first|last|user/ },
    { key: 'email', re: /e-?mail/, not: /confirm|re-?enter/ },
    { key: 'emailConfirm', re: /confirm.*e-?mail|re-?enter.*e-?mail/ },
    { key: 'phone', re: /phone|mobile|\btel\b|contact number/, not: /extension|type|country( phone)? code|device/ },
    { key: 'linkedin', re: /linked\s*in/ },
    { key: 'github', re: /git\s*hub/ },
    { key: 'website', re: /website|portfolio|personal (site|url|page)|other url|blog/, not: /linkedin|github/ },
    { key: 'city', re: /\bcity\b|town|addresssection_city/, not: /school|university/ },
    { key: 'state', re: /\bstate\b|province|region|addresssection_countryregion/, not: /statement|united states/ },
    { key: 'country', re: /\bcountry\b/, not: /phone|code|citizenship|country of birth/ },
    { key: 'location', re: /current location|where are you (based|located)|^location\b|\blocation \(city/, not: /job|work experience|preferred|office/ },
    // education (a school field starts a new entry)
    { key: 'school', re: /school|university|college|institution|educational establishment/, not: /high school graduation/ },
    { key: 'degree', re: /\bdegree\b|qualification/, not: /year|date|level of study/ },
    { key: 'major', re: /major|field of study|fieldofstudy|discipline|specialization|area of study|course of study/ },
    { key: 'gpa', re: /\bgpa\b|cgpa|grade point|overall result/ },
    { key: 'gradYear', re: /graduat\w* (year|date)|expected graduation|year of graduation|class of/ },
    // work experience (a job title field starts a new entry)
    { key: 'jobTitle', re: /job ?title|position title|role title|jobtitle|\btitle\b/, not: /course|project|preferred|salutation|mr|mrs/ },
    { key: 'company', re: /company|employer|organi[sz]ation|companyname/, not: /school|university|how did you hear|referr/ },
    { key: 'jobLocation', re: /location|city/ },
    { key: 'roleDesc', re: /role description|description|responsibilit|duties|what did you do|summary of (your )?work/, not: /how did|cover letter|additional information|anything else/ },
    { key: 'month', re: /\bmonth\b|datesectionmonth|\bmm\b/ },
    { key: 'year', re: /\byear\b|datesectionyear|\byyyy\b/, not: /years? of experience|how many years|\bold\b|\bage\b/ },
    { key: 'date', re: /\bdate\b|startdate|enddate|(^|\|\s*)(from|to)\b/, not: /available|availability|earliest|when can you|birth|today/ },
    { key: 'headline', re: /headline|professional summary|about (you|yourself)|summary/, not: /description/ },
  ]

  function classify(desc) {
    for (const r of RULES) if (r.re.test(desc) && !(r.not && r.not.test(desc))) return r.key
    return null
  }

  globalThis.__icFill = function fill(p) {
    const fields = [...document.querySelectorAll('input, textarea, select')]
      .filter((el) => !['hidden', 'file', 'checkbox', 'radio', 'submit', 'button', 'image', 'reset', 'password', 'range', 'color'].includes(el.type))
      .filter(visible)
    const filled = [], review = []
    let exp = -1, edu = -1, section = null
    const ex = () => (p.experience || [])[Math.max(0, exp)] || null
    const ed = () => (p.education || [])[Math.max(0, edu)] || null

    for (const el of fields) {
      const desc = describe(el)
      let key = classify(desc)
      if (!key || key === 'skip') continue
      // work out which section we're in from the field itself or its surroundings
      if (/work ?experience|employment|workexperience|job history|professional experience/.test(desc)) section = 'work'
      else if (/education|school|university|degree/.test(desc) && key !== 'jobTitle') section = section === 'work' && key === 'company' ? 'work' : 'edu'
      if (key === 'jobTitle') { exp++; section = 'work' }
      if (key === 'school') { edu++; section = 'edu' }
      if (key === 'company' && section !== 'work' && exp < 0) { exp = 0; section = 'work' }
      if ((key === 'location' || key === 'city') && section === 'work' && exp >= 0) key = 'jobLocation'
      if (key === 'jobLocation' && section !== 'work') key = 'city'
      if (key === 'jobLocation' && section === 'work' && exp < 0) continue

      // start or end of a date range: "start"/"from" wins, then "end"/"to"
      const isEnd = !/start|\bfrom\b/.test(desc) && /\bend\b|enddate|(^|\|\s*)to\b|until|through/.test(desc)
      const dateFor = () => {
        if (section === 'work') { const e = ex(); if (!e) return null; return isEnd ? (e.current ? null : ym(e.end)) : ym(e.start) }
        if (section === 'edu') { const e = ed(); if (!e) return null; return isEnd ? ym(e.end) : ym(e.start) }
        return null
      }

      let v = null
      switch (key) {
        case 'first': v = p.first_name; break
        case 'last': v = p.last_name; break
        case 'full': v = p.full_name; break
        case 'email': case 'emailConfirm': v = p.email; break
        case 'phone': v = p.phone; break
        case 'linkedin': v = p.linkedin; break
        case 'github': v = p.github; break
        case 'website': v = p.portfolio || p.github; break
        case 'city': v = p.city; break
        case 'state': v = p.state; break
        case 'country': v = p.country; break
        case 'location': v = p.based_in; break
        case 'school': v = ed()?.school; break
        case 'degree': v = ed()?.degree; break
        case 'major': v = ed()?.field; break
        case 'gpa': v = ed()?.grade; break
        case 'gradYear': v = ym((p.education || [])[0]?.end)?.y || p.grad_year; break
        case 'jobTitle': v = ex()?.title; break
        case 'company': v = section === 'edu' ? null : ex()?.company; break
        case 'jobLocation': v = ex()?.location; break
        case 'roleDesc': v = section === 'work' || exp >= 0 ? ex()?.description : null; break
        case 'headline': v = p.headline; break
        case 'month': case 'year': case 'date': {
          if (!section || (section === 'work' && exp < 0) || (section === 'edu' && edu < 0)) break
          const d = dateFor(); if (!d) break
          if (key === 'month') v = el.tagName === 'SELECT' ? MONTHS[Number(d.m) - 1] : d.m
          else if (key === 'year') v = d.y
          else if (el.type === 'month') v = `${d.y}-${d.m}`
          else if (el.type === 'date') v = `${d.y}-${d.m}-01`
          else v = /mm\s*\/\s*yyyy|month\/year/.test(desc) || /mm\/yyyy/i.test(el.placeholder || '') ? `${d.m}/${d.y}` : `${d.m}/${d.y}`
          break
        }
      }
      if (v == null || v === '') continue
      v = String(v)
      if (el.tagName === 'SELECT') {
        if (el.value && el.selectedIndex > 0) continue
        if (setSelect(el, v)) { filled.push(key); mark(el) } else review.push(key)
        continue
      }
      if (el.value && el.value.trim()) continue          // never overwrite what's there
      if (el.maxLength > 0 && v.length > el.maxLength) v = v.slice(0, el.maxLength)
      setValue(el, v)
      filled.push(key); mark(el)
    }
    return { filled: filled.length, fields: filled, review, frame: location.hostname }
  }

  function mark(el) {
    el.style.outline = '2px solid rgba(240,163,94,.85)'
    el.style.outlineOffset = '1px'
    setTimeout(() => { el.style.outline = ''; el.style.outlineOffset = '' }, 6000)
  }
})()
