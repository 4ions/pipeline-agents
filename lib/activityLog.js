export function parseActivityLog(text) {
  const events = []
  for (const line of text.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed) continue
    try {
      events.push(JSON.parse(trimmed))
    } catch {
      // skip malformed lines rather than failing the whole dashboard
    }
  }
  return events
}

const STATUS_FOR_EVENT = { start: 'working', done: 'idle', blocked: 'blocked' }

export function reduceToState(events) {
  const roles = {}
  for (const evt of events) {
    roles[evt.role] = {
      status: STATUS_FOR_EVENT[evt.event] ?? 'idle',
      taskId: evt.event === 'done' ? null : evt.taskId,
      detail: evt.detail ?? null,
      lastEventTs: evt.ts,
    }
  }
  return { roles, timeline: events }
}
