import { test } from 'node:test'
import assert from 'node:assert/strict'
import { validateBacklogTask, validateBug, TASK_STATUSES, BUG_STATUSES } from './stateSchemas.js'

test('validateBacklogTask accepts a well-formed task', () => {
  const result = validateBacklogTask({
    id: 'task-001',
    specialization: 'gameplay',
    description: 'Player can jump over a 1-unit obstacle',
    successCriterion: 'Simulate jump input near a 1-unit box; player position ends up past it without collision.',
    status: 'todo',
    attempts: 0,
  })
  assert.equal(result.valid, true)
  assert.deepEqual(result.errors, [])
})

test('validateBacklogTask rejects missing required fields', () => {
  const result = validateBacklogTask({ id: 'task-001' })
  assert.equal(result.valid, false)
  assert.ok(result.errors.some(e => e.includes('specialization')))
  assert.ok(result.errors.some(e => e.includes('description')))
  assert.ok(result.errors.some(e => e.includes('successCriterion')))
})

test('validateBacklogTask rejects an invalid status', () => {
  const result = validateBacklogTask({
    id: 'task-001',
    specialization: 'gameplay',
    description: 'x',
    successCriterion: 'x',
    status: 'not-a-real-status',
    attempts: 0,
  })
  assert.equal(result.valid, false)
  assert.ok(result.errors.some(e => e.includes('status')))
})

test('validateBug accepts a well-formed bug', () => {
  const result = validateBug({
    id: 'bug-001',
    taskId: 'task-001',
    description: 'Player clips through the obstacle instead of stopping',
    reproSteps: ['Enter play mode', 'Move toward obstacle', 'Observe player passes through'],
    status: 'open',
  })
  assert.equal(result.valid, true)
})

test('TASK_STATUSES and BUG_STATUSES export the expected values', () => {
  assert.deepEqual(TASK_STATUSES, ['todo', 'in_progress', 'done', 'blocked'])
  assert.deepEqual(BUG_STATUSES, ['open', 'fixed', 'closed'])
})
