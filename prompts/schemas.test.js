// prompts/schemas.test.js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { VISION_SCHEMA, BACKLOG_SCHEMA, TEST_RESULT_SCHEMA, PLAYTEST_SCHEMA, QUALITY_CRITIQUE_SCHEMA, DESIGN_REVIEW_SCHEMA, MILESTONE_SCHEMA, ROADMAP_SCHEMA, ROADMAP_REVIEW_SCHEMA } from './schemas.js'
import { validateBacklogTask, TASK_STATUSES } from '../lib/stateSchemas.js'

test('VISION_SCHEMA declares the required top-level fields', () => {
  assert.deepEqual(new Set(VISION_SCHEMA.required), new Set(['identity', 'scope', 'priorities']))
})

test('BACKLOG_SCHEMA requires gdd and a tasks array', () => {
  assert.deepEqual(new Set(BACKLOG_SCHEMA.required), new Set(['gdd', 'tasks']))
})

test('BACKLOG_SCHEMA items match what validateBacklogTask expects, and needsArt/needsAnimation are required', () => {
  const itemSchema = BACKLOG_SCHEMA.properties.tasks.items
  const sample = {
    id: 'task-001',
    specialization: 'gameplay',
    description: 'Player can jump over a 1-unit obstacle',
    successCriterion: 'Jump input near a 1-unit box results in the player past it without collision.',
    needsArt: false,
    needsAnimation: false,
    status: 'todo',
    attempts: 0,
  }
  for (const field of itemSchema.required) {
    assert.ok(field in sample, `sample is missing required field ${field}`)
  }
  assert.ok(itemSchema.required.includes('needsArt'))
  assert.ok(itemSchema.required.includes('needsAnimation'))
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

test('DESIGN_REVIEW_SCHEMA requires approved and feedback', () => {
  assert.deepEqual(new Set(DESIGN_REVIEW_SCHEMA.required), new Set(['approved', 'feedback']))
})

test('QUALITY_CRITIQUE_SCHEMA requires acceptable and issues, and issue severity is blocking/polish only', () => {
  assert.deepEqual(new Set(QUALITY_CRITIQUE_SCHEMA.required), new Set(['acceptable', 'issues']))
  const issueSchema = QUALITY_CRITIQUE_SCHEMA.properties.issues.items
  assert.deepEqual(new Set(issueSchema.required), new Set(['description', 'severity']))
  assert.deepEqual(issueSchema.properties.severity.enum, ['blocking', 'polish'])
})

test('MILESTONE_SCHEMA requires id, description, scope, and dependsOn', () => {
  assert.deepEqual(new Set(MILESTONE_SCHEMA.required), new Set(['id', 'description', 'scope', 'dependsOn']))
  assert.equal(MILESTONE_SCHEMA.properties.dependsOn.type, 'array')
})

test('ROADMAP_SCHEMA requires vision and milestones, and milestones items match MILESTONE_SCHEMA', () => {
  assert.deepEqual(new Set(ROADMAP_SCHEMA.required), new Set(['vision', 'milestones']))
  assert.equal(ROADMAP_SCHEMA.properties.milestones.items, MILESTONE_SCHEMA)
  assert.equal(ROADMAP_SCHEMA.properties.vision, VISION_SCHEMA)
})

test('ROADMAP_REVIEW_SCHEMA requires verdict and reason, and verdict enum is continue/escalate/complete', () => {
  assert.deepEqual(new Set(ROADMAP_REVIEW_SCHEMA.required), new Set(['verdict', 'reason']))
  assert.deepEqual(ROADMAP_REVIEW_SCHEMA.properties.verdict.enum, ['continue', 'escalate', 'complete'])
  assert.equal(ROADMAP_REVIEW_SCHEMA.properties.revisedMilestones.items, MILESTONE_SCHEMA)
})
