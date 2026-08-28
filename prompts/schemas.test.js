// prompts/schemas.test.js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { VISION_SCHEMA, BACKLOG_SCHEMA, TEST_RESULT_SCHEMA, PLAYTEST_SCHEMA } from './schemas.js'
import { validateBacklogTask, TASK_STATUSES } from '../lib/stateSchemas.js'

test('VISION_SCHEMA declares the required top-level fields', () => {
  assert.deepEqual(new Set(VISION_SCHEMA.required), new Set(['identity', 'scope', 'priorities']))
})

test('BACKLOG_SCHEMA requires gdd and a tasks array', () => {
  assert.deepEqual(new Set(BACKLOG_SCHEMA.required), new Set(['gdd', 'tasks']))
})

test('BACKLOG_SCHEMA items match what validateBacklogTask expects, and needsArt is required', () => {
  const itemSchema = BACKLOG_SCHEMA.properties.tasks.items
  const sample = {
    id: 'task-001',
    specialization: 'gameplay',
    description: 'Player can jump over a 1-unit obstacle',
    successCriterion: 'Jump input near a 1-unit box results in the player past it without collision.',
    needsArt: false,
    status: 'todo',
    attempts: 0,
  }
  for (const field of itemSchema.required) {
    assert.ok(field in sample, `sample is missing required field ${field}`)
  }
  assert.ok(itemSchema.required.includes('needsArt'))
  const result = validateBacklogTask(sample)
  assert.equal(result.valid, true)
})

test('BACKLOG_TASK_SCHEMA status enum matches TASK_STATUSES exactly', () => {
  const itemSchema = BACKLOG_SCHEMA.properties.tasks.items
  assert.deepEqual(itemSchema.properties.status.enum, TASK_STATUSES)
})

test('TEST_RESULT_SCHEMA requires passed and evidence', () => {
  assert.deepEqual(new Set(TEST_RESULT_SCHEMA.required), new Set(['passed', 'evidence']))
})

test('PLAYTEST_SCHEMA requires completed and issues', () => {
  assert.deepEqual(new Set(PLAYTEST_SCHEMA.required), new Set(['completed', 'issues']))
})
