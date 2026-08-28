const ROLE_ORDER = ['director', 'designer', 'programmer', 'artist', 'tester', 'fixer']
const timelineEl = document.getElementById('timeline')
let lastTimelineLength = 0
let lastHandledIndex = 0

function renderRoles(roles) {
  for (const role of ROLE_ORDER) {
    const info = roles[role] ?? { status: 'idle', taskId: null, detail: null }
    const desk = document.querySelector(`.room[data-role="${role}"]`)
    if (!desk) continue
    desk.classList.remove('status-idle', 'status-working', 'status-blocked')
    desk.classList.add(`status-${info.status}`)
    const detailEl = desk.querySelector(':scope > .detail')
    detailEl.textContent = info.detail ?? ''
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

// When a task's "done" event (role A) is followed later in the timeline by
// a "start" event for the SAME taskId on a DIFFERENT role (role B), that's
// a handoff — animate role A's avatar walking to role B's desk and back.
function detectHandoffs(timeline) {
  for (let i = lastHandledIndex; i < timeline.length; i++) {
    const evt = timeline[i]
    if (evt.event !== 'done' || !evt.taskId) continue
    for (let j = i + 1; j < timeline.length; j++) {
      const later = timeline[j]
      if (later.taskId === evt.taskId && later.event === 'start' && later.role !== evt.role) {
        triggerWalk(evt.role, later.role)
        break
      }
    }
  }
  lastHandledIndex = timeline.length
}

function triggerWalk(fromRole, toRole) {
  const fromAvatar = document.querySelector(`.room[data-role="${fromRole}"] .avatar-wrap`)
  const toDesk = document.querySelector(`.room[data-role="${toRole}"]`)
  if (!fromAvatar || !toDesk || fromAvatar.classList.contains('walking')) return

  const fromRect = fromAvatar.getBoundingClientRect()
  const toRect = toDesk.getBoundingClientRect()
  const dx = toRect.left + toRect.width / 2 - (fromRect.left + fromRect.width / 2)
  const dy = toRect.top + toRect.height / 2 - (fromRect.top + fromRect.height / 2)

  fromAvatar.style.setProperty('--walk-dx', `${dx}px`)
  fromAvatar.style.setProperty('--walk-dy', `${dy}px`)
  fromAvatar.classList.add('walking')
  fromAvatar.addEventListener('animationend', () => fromAvatar.classList.remove('walking'), { once: true })
}

async function poll() {
  try {
    const res = await fetch('/api/state')
    const state = await res.json()
    renderRoles(state.roles)
    detectHandoffs(state.timeline)
    renderTimeline(state.timeline)
  } catch {
    // transient fetch failure — try again next tick
  }
  setTimeout(poll, 1500)
}

poll()
