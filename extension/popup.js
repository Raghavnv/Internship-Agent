// Popup: stores the profile code locally (chrome.storage.local, this device only) and fills the current tab on request.
const $ = (id) => document.getElementById(id)

function decode(code) {
  const raw = code.trim().replace(/^ICP1\./, '')
  const json = decodeURIComponent(escape(atob(raw.replace(/-/g, '+').replace(/_/g, '/'))))
  const data = JSON.parse(json)
  if (data.v !== 1 || !data.p) throw new Error('bad version')
  return data.p
}

async function show() {
  const { profile } = await chrome.storage.local.get('profile')
  $('connect').hidden = Boolean(profile)
  $('ready').hidden = !profile
  if (!profile) return
  $('who').textContent = profile.full_name || profile.email || 'you'
  const rows = [
    ['First name', profile.first_name], ['Last name', profile.last_name], ['Email', profile.email], ['Phone', profile.phone],
    ['City', profile.city], ['LinkedIn', profile.linkedin], ['GitHub', profile.github], ['Website', profile.portfolio],
    ...(profile.education || []).slice(0, 2).flatMap((e) => [['School', e.school], ['Degree', [e.degree, e.field].filter(Boolean).join(', ')]]),
    ...(profile.experience || []).slice(0, 3).flatMap((e) => [['Job title', e.title], ['Company', e.company], ['Description', e.description]]),
    ['Skills', (profile.skills || []).join(', ')],
  ].filter(([, v]) => v)
  const ul = $('fields'); ul.textContent = ''
  for (const [k, v] of rows) {
    const li = document.createElement('li')
    li.innerHTML = '<span class="k"></span><span class="v"></span><button type="button">Copy</button>'
    li.querySelector('.k').textContent = k
    li.querySelector('.v').textContent = v
    li.querySelector('.v').title = v
    li.querySelector('button').onclick = async (e) => { await navigator.clipboard.writeText(v); e.target.textContent = 'Copied'; setTimeout(() => (e.target.textContent = 'Copy'), 1200) }
    ul.appendChild(li)
  }
}

$('save').onclick = async () => {
  $('connect-err').hidden = true
  try {
    const profile = decode($('code').value)
    await chrome.storage.local.set({ profile })
    $('code').value = ''
    show()
  } catch {
    $('connect-err').textContent = 'That code didn’t work. Copy it again from the Autofill page and paste the whole thing.'
    $('connect-err').hidden = false
  }
}
$('update').onclick = () => { $('connect').hidden = false; $('ready').hidden = true }
$('forget').onclick = async () => { await chrome.storage.local.remove('profile'); show() }

$('fill').onclick = async () => {
  const st = $('status'); st.className = 'status'; st.textContent = 'Filling…'
  $('fill').disabled = true
  try {
    const { profile } = await chrome.storage.local.get('profile')
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
    await chrome.scripting.executeScript({ target: { tabId: tab.id, allFrames: true }, files: ['filler.js'] })
    const res = await chrome.scripting.executeScript({ target: { tabId: tab.id, allFrames: true }, func: (p) => globalThis.__icFill(p), args: [profile] })
    const total = res.reduce((n, r) => n + (r.result?.filled || 0), 0)
    const review = res.flatMap((r) => r.result?.review || [])
    if (total) {
      st.className = 'status ok'
      st.textContent = `Filled ${total} field${total === 1 ? '' : 's'}. They’re outlined on the page, so check them before you continue.`
      if (review.length) st.textContent += ` Pick ${review.length} dropdown${review.length === 1 ? '' : 's'} yourself.`
    } else {
      st.className = 'status warn'
      st.textContent = 'Nothing to fill here. If the form has more steps, click Fill again on each one.'
    }
  } catch (e) {
    st.className = 'status warn'
    st.textContent = /Cannot access|chrome:\/\//.test(String(e)) ? 'This page can’t be filled (browser pages and the Chrome Web Store are off-limits).' : `Couldn’t fill this page: ${e.message || e}`
  } finally {
    $('fill').disabled = false
  }
}

show()
