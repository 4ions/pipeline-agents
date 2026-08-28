const ROLE_ORDER = ['director', 'designer', 'programmer', 'artist', 'tester', 'fixer']
const FRAME_COUNTS = { idle: 3, walk: 4 }
const FPS = 60
const timelineEl = document.getElementById('timeline')
let lastTimelineLength = 0
let lastHandledIndex = 0

// Per-role sprite animation state — real frame images, swapped by
// changing <img src>, not a CSS background-position slide trick.
const roleAnim = {}
for (const role of ROLE_ORDER) {
  roleAnim[role] = { animState: 'idle', frameIndex: 0 }
}

function frameUrl(role, animState, index) {
  return `/sprites/frames/${role}_${animState}_${index}.png`
}

function renderRoles(roles) {
  for (const role of ROLE_ORDER) {
    const info = roles[role] ?? { status: 'idle', taskId: null, detail: null }
    const room = document.querySelector(`.room[data-role="${role}"]`)
    if (!room) continue
    room.classList.remove('status-idle', 'status-working', 'status-blocked')
    room.classList.add(`status-${info.status}`)
    const detailEl = room.querySelector(':scope > .detail')
    detailEl.textContent = info.detail ?? ''

    const wantState = info.status === 'working' ? 'walk' : 'idle'
    const anim = roleAnim[role]
    if (anim.animState !== wantState) {
      anim.animState = wantState
      anim.frameIndex = 0
    }
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

// Single shared frame loop: every 1000/FPS ms, advance each role's frame
// index and REPLACE its <img src> outright — a real per-frame image swap,
// not an animated CSS position.
let lastFrameTime = 0
function animationLoop(timestamp) {
  if (timestamp - lastFrameTime >= 1000 / FPS) {
    lastFrameTime = timestamp
    for (const role of ROLE_ORDER) {
      const anim = roleAnim[role]
      const count = FRAME_COUNTS[anim.animState]
      anim.frameIndex = (anim.frameIndex + 1) % count
      const img = document.querySelector(`.room[data-role="${role}"] .avatar`)
      if (img) img.src = frameUrl(role, anim.animState, anim.frameIndex)
    }
  }
  requestAnimationFrame(animationLoop)
}
requestAnimationFrame(animationLoop)

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
