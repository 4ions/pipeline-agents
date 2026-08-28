import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseActivityLog, reduceToState } from './activityLog.js'

const SAMPLE = [
  '{"ts":"2026-08-27T10:00:00Z","role":"director","specialization":null,"taskId":null,"event":"start","detail":"Writing vision"}',
  '{"ts":"2026-08-27T10:00:05Z","role":"director","specialization":null,"taskId":null,"event":"done","detail":"Vision written"}',
  '{"ts":"2026-08-27T10:00:06Z","role":"programmer","specialization":"gameplay","taskId":"task-001","event":"start","detail":"Implementing jump"}',
  '',
].join('\n')

test('parseActivityLog parses well-formed lines and skips blanks', () => {
  const events = parseActivityLog(SAMPLE)
  assert.equal(events.length, 3)
  assert.equal(events[0].role, 'director')
  assert.equal(events[2].taskId, 'task-001')
})

test('parseActivityLog skips malformed lines without throwing', () => {
  const events = parseActivityLog(SAMPLE + '\nnot json\n')
  assert.equal(events.length, 3)
})

test('reduceToState derives current per-role status from the latest event per role', () => {
  const events = parseActivityLog(SAMPLE)
  const state = reduceToState(events)
  assert.equal(state.roles.director.status, 'idle')
  assert.equal(state.roles.programmer.status, 'working')
  assert.equal(state.roles.programmer.taskId, 'task-001')
  assert.equal(state.timeline.length, 3)
})

test('reduceToState marks a role blocked when its latest event is blocked', () => {
  const events = parseActivityLog(SAMPLE + '\n{"ts":"2026-08-27T10:05:00Z","role":"programmer","specialization":"gameplay","taskId":"task-001","event":"blocked","detail":"3 fix attempts failed"}')
  const state = reduceToState(events)
  assert.equal(state.roles.programmer.status, 'blocked')
})
