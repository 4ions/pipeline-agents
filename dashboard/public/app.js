const ROLE_ORDER = ['director', 'designer', 'programmer', 'artist', 'tester', 'fixer']
const FRAME_COUNTS = { idle: 3, walk: 4 }
// Researched pixel-art animation standards: idle breathing/blink reads
// well at 4-6fps, walk cycles at 8-12fps — not one blanket rate.
const FPS_BY_STATE = { idle: 6, walk: 10 }
const timelineEl = document.getElementById('timeline')
let lastTimelineLength = 0
let lastHandledIndex = 0

// Per-role sprite animation state — real frame images, swapped by
// changing <img src>, not a CSS background-position slide trick.
const roleAnim = {}
for (const role of ROLE_ORDER) {
  roleAnim[role] = { animState: 'idle', frameIndex: 0, lastTick: 0 }
}

function frameUrl(role, animState, index) {
  return `/sprites/frames/${role}_${animState}_${index}.png`
}

function timeSince(iso) {
  if (!iso) return ''
  const ms = Date.now() - new Date(iso).getTime()
  if (!Number.isFinite(ms) || ms < 0) return ''
  const s = Math.round(ms / 1000)
  if (s < 60) return `${s}s ago`
  const m = Math.round(s / 60)
  if (m < 60) return `${m}m ago`
  return `${Math.round(m / 60)}h ago`
}

function truncate(text, max) {
  if (!text) return ''
  return text.length > max ? `${text.slice(0, max - 1)}…` : text
}

// A role's displayed status comes from the LAST event logged for that
// role — if that event was a "start" with no matching "done" EVER logged
// again for that role (e.g. the agent died mid-task, or a different role
// picked up the next step and nobody closed this one out), it would
// otherwise show "Working now" forever. Cross-checking against
// backlog.json's task status seems like a good way to catch that, but
// it's WRONG for rework: a reopened task's backlog status still reads
// "done" from the previous round right up until its Tester re-verifies
// it, so that check would hide genuinely-in-progress rework. Use time
// since the last event instead — individual agent steps in this pipeline
// take anywhere from under a minute to ~15 minutes; treat "working" as
// stale only past a generous margin beyond that.
const STALE_WORKING_MS = 20 * 60 * 1000

function isStatusStale(info) {
  if (info.status !== 'working' || !info.lastEventTs) return false
  const ms = Date.now() - new Date(info.lastEventTs).getTime()
  return Number.isFinite(ms) && ms > STALE_WORKING_MS
}

function renderRoles(roles) {
  for (const role of ROLE_ORDER) {
    const raw = roles[role] ?? { status: 'idle', taskId: null, detail: null, lastEventTs: null }
    const info = isStatusStale(raw) ? { ...raw, status: 'idle' } : raw
    const room = document.querySelector(`.room[data-role="${role}"]`)
    if (!room) continue
    room.classList.remove('status-idle', 'status-working', 'status-blocked')
    room.classList.add(`status-${info.status}`)

    const label = info.status === 'working' ? 'Working now' : info.status === 'blocked' ? 'Blocked' : 'Idle'
    const detailEl = room.querySelector(':scope > .detail')
    detailEl.textContent = info.detail ? `[${label}${info.taskId ? ` · ${info.taskId}` : ''}] ${info.detail}` : label

    // The speech bubble is the at-a-glance signal — a short version of
    // the same detail, floating over the character instead of buried in
    // a small paragraph at the bottom of the room.
    const bubbleEl = room.querySelector('.speech-bubble')
    if (bubbleEl) {
      if (info.detail) {
        bubbleEl.textContent = truncate(info.detail, 90)
        bubbleEl.classList.add('visible')
      } else {
        bubbleEl.classList.remove('visible')
      }
    }

    let liveBadge = room.querySelector(':scope > .live-badge')
    if (info.status === 'working') {
      if (!liveBadge) {
        liveBadge = document.createElement('div')
        liveBadge.className = 'live-badge'
        liveBadge.innerHTML = '<span class="dot"></span><span>LIVE</span>'
        room.appendChild(liveBadge)
      }
    } else if (liveBadge) {
      liveBadge.remove()
    }

    let sinceEl = room.querySelector(':scope > .since')
    if (!sinceEl) {
      sinceEl = document.createElement('div')
      sinceEl.className = 'since'
      room.appendChild(sinceEl)
    }
    sinceEl.textContent = timeSince(info.lastEventTs)

    const wantState = info.status === 'working' ? 'walk' : 'idle'
    const anim = roleAnim[role]
    if (anim.animState !== wantState) {
      anim.animState = wantState
      anim.frameIndex = 0
    }
  }
}

function renderNowBanner(timeline) {
  const nowText = document.getElementById('now-text')
  if (!timeline || timeline.length === 0) {
    nowText.textContent = 'Starting up…'
    return
  }
  const last = timeline[timeline.length - 1]
  const verb = last.event === 'start' ? 'is working on' : last.event === 'blocked' ? 'is BLOCKED on' : 'just finished'
  nowText.innerHTML = ''
  const roleSpan = document.createElement('span')
  roleSpan.className = 'now-role'
  roleSpan.textContent = last.role ?? 'someone'
  const rest = document.createElement('span')
  rest.textContent = ` ${verb}: ${truncate(last.detail ?? last.message ?? '', 140)}`
  const ago = document.createElement('span')
  ago.className = 'now-ago'
  ago.textContent = timeSince(last.ts)
  nowText.append(roleSpan, rest, ago)
}

const STATUS_ICON = { done: '✅', todo: '⭕', in_progress: '⏳', blocked: '🚨' }

function renderProgress(backlog, roles) {
  const summaryEl = document.getElementById('progress-summary')
  const listEl = document.getElementById('task-list')
  const fillEl = document.getElementById('progress-fill')
  if (!backlog || !Array.isArray(backlog) || backlog.length === 0) {
    summaryEl.textContent = 'No backlog yet'
    listEl.innerHTML = ''
    fillEl.style.width = '0%'
    return
  }

  // backlog.json only reflects a task's status as of its last Tester
  // verification — a reopened task still reads "done" from the PREVIOUS
  // round right up until it's re-verified. Cross-check live role activity
  // so rework-in-progress shows as "in_progress" here too, not a stale
  // "done" that hides what's actually happening right now.
  const liveTaskIds = new Set()
  if (roles) {
    for (const role of Object.keys(roles)) {
      const info = roles[role]
      if (info && info.taskId && !isStatusStale(info)) liveTaskIds.add(info.taskId)
    }
  }

  const counts = { done: 0, todo: 0, in_progress: 0, blocked: 0 }
  for (const t of backlog) {
    const status = liveTaskIds.has(t.id) ? 'in_progress' : t.status
    counts[status] = (counts[status] ?? 0) + 1
  }
  summaryEl.textContent = `${counts.done}/${backlog.length} done` +
    (counts.blocked ? ` · ${counts.blocked} blocked` : '') +
    (counts.in_progress ? ` · ${counts.in_progress} reworking` : '') +
    (counts.todo ? ` · ${counts.todo} left` : '')
  fillEl.style.width = `${Math.round((counts.done / backlog.length) * 100)}%`

  listEl.innerHTML = ''
  for (const t of backlog) {
    const status = liveTaskIds.has(t.id) ? 'in_progress' : t.status
    const li = document.createElement('li')
    li.className = `task-${status}`
    li.textContent = `${STATUS_ICON[status] ?? '•'} ${t.id}${t.attempts ? ` (${t.attempts})` : ''}`
    li.title = t.description ?? ''
    listEl.appendChild(li)
  }
}

const EVENT_ICON = { start: '⚙️', done: '✅', blocked: '🚨' }

function renderTimeline(timeline) {
  if (timeline.length === lastTimelineLength) return
  timelineEl.innerHTML = ''
  for (const evt of [...timeline].reverse()) {
    const li = document.createElement('li')
    li.className = `timeline-entry event-${evt.event}`
    const icon = document.createElement('span')
    icon.className = 'icon'
    icon.textContent = EVENT_ICON[evt.event] ?? '•'
    const text = document.createElement('span')
    text.textContent = `${evt.ts} — ${evt.role}${evt.specialization ? `/${evt.specialization}` : ''}: ${evt.detail}`
    li.append(icon, text)
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

// Shared frame loop, but each role advances at ITS current state's own
// fps (idle vs walk), not one blanket rate — each role's <img src> is
// REPLACED outright when its turn comes, a real per-frame image swap.
function animationLoop(timestamp) {
  for (const role of ROLE_ORDER) {
    const anim = roleAnim[role]
    const interval = 1000 / FPS_BY_STATE[anim.animState]
    if (timestamp - anim.lastTick >= interval) {
      anim.lastTick = timestamp
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
    renderProgress(state.backlog, state.roles)
    renderNowBanner(state.timeline)
    detectHandoffs(state.timeline)
    renderTimeline(state.timeline)
  } catch {
    // transient fetch failure — try again next tick
  }
  setTimeout(poll, 1500)
}

poll()
