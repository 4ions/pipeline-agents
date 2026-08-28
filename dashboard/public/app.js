const ROLE_ORDER = ['director', 'designer', 'programmer', 'artist', 'tester', 'fixer']
const rolesEl = document.getElementById('roles')
const timelineEl = document.getElementById('timeline')
let lastTimelineLength = 0

function renderRoles(roles) {
  rolesEl.innerHTML = ''
  for (const role of ROLE_ORDER) {
    const info = roles[role] ?? { status: 'idle', taskId: null, detail: null }
    const card = document.createElement('div')
    card.className = `role-card status-${info.status}`

    const nameEl = document.createElement('div')
    nameEl.className = 'role-name'
    nameEl.textContent = role

    const statusEl = document.createElement('div')
    statusEl.className = 'role-status'
    statusEl.textContent = info.status

    const detailEl = document.createElement('div')
    detailEl.className = 'role-detail'
    detailEl.textContent = info.detail ?? ''

    card.appendChild(nameEl)
    card.appendChild(statusEl)
    card.appendChild(detailEl)

    rolesEl.appendChild(card)
  }
}

function renderTimeline(timeline) {
  if (timeline.length === lastTimelineLength) return
  timelineEl.innerHTML = ''
  for (const evt of [...timeline].reverse()) {
    const li = document.createElement('li')
    li.className = `timeline-entry event-${evt.event}`
    li.textContent = `${evt.ts} — ${evt.role}${evt.specialization ? `/${evt.specialization}` : ''}: ${evt.detail}`
    timelineEl.appendChild(li)
  }
  lastTimelineLength = timeline.length
}

async function poll() {
  try {
    const res = await fetch('/api/state')
    const state = await res.json()
    renderRoles(state.roles)
    renderTimeline(state.timeline)
  } catch {
    // transient fetch failure — try again next tick
  }
  setTimeout(poll, 1500)
}

poll()
