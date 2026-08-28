// prompts/prompts.test.js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { visionPrompt, escalationPrompt, finalReviewPrompt } from './director.js'
import { designPrompt } from './designer.js'
import { implementPrompt } from './programmer.js'
import { artPrompt } from './artist.js'
import { scenarioTestPrompt, fullPlaytestPrompt } from './tester.js'

const FIXTURE_VISION = { identity: 'A test game', scope: 'test scope', priorities: ['fun', 'polish'] }
const FIXTURE_TASK = { id: 'task-001', specialization: 'gameplay', description: 'Player can jump', successCriterion: 'Jump works', needsArt: false, status: 'todo', attempts: 0 }
const FIXTURE_TARGET_PATH = '/tmp/fake-project'

test('visionPrompt includes the game idea', () => {
  const gameIdea = 'a puzzle game about redirecting light beams'
  const result = visionPrompt(gameIdea, FIXTURE_TARGET_PATH)
  assert.equal(typeof result, 'string')
  assert.ok(result.length > 0)
  assert.ok(result.includes(gameIdea))
})

test('escalationPrompt includes the blocked task id', () => {
  const blockedTasks = [{ task: FIXTURE_TASK, attempts: 4, lastResult: { passed: false, evidence: 'it broke' } }]
  const result = escalationPrompt(FIXTURE_VISION, blockedTasks, FIXTURE_TARGET_PATH)
  assert.equal(typeof result, 'string')
  assert.ok(result.length > 0)
  assert.ok(result.includes(FIXTURE_TASK.id))
})

test('finalReviewPrompt handles a missing playtest result and null directorDecisions without crashing', () => {
  const taskResults = [{ task: FIXTURE_TASK, status: 'done', attempts: 1, lastResult: { passed: true, evidence: 'it worked' } }]
  const result = finalReviewPrompt(FIXTURE_VISION, 'a short GDD', taskResults, null, null)
  assert.equal(typeof result, 'string')
  assert.ok(result.length > 0)
  // Confirm the null-guard fallback text is used instead of a raw JSON.stringify(null)
  assert.ok(!result.includes('"null"'))
  assert.ok(result.includes('MISSING'))
})

test('designPrompt includes the target project path', () => {
  const result = designPrompt(FIXTURE_VISION, FIXTURE_TARGET_PATH)
  assert.equal(typeof result, 'string')
  assert.ok(result.length > 0)
  assert.ok(result.includes(FIXTURE_TARGET_PATH))
})

test('implementPrompt reads as programmer on attempt 1 and fixer on a later retry', () => {
  const programmerResult = implementPrompt(FIXTURE_TASK, 1, null, FIXTURE_TARGET_PATH)
  assert.equal(typeof programmerResult, 'string')
  assert.ok(programmerResult.length > 0)
  assert.ok(!programmerResult.includes('fixer'))

  const fixerResult = implementPrompt(FIXTURE_TASK, 2, { evidence: 'x', bug: null }, FIXTURE_TARGET_PATH)
  assert.equal(typeof fixerResult, 'string')
  assert.ok(fixerResult.length > 0)
  assert.ok(fixerResult.includes('fixer'))
})

test('artPrompt includes the task id', () => {
  const result = artPrompt(FIXTURE_TASK, FIXTURE_TARGET_PATH)
  assert.equal(typeof result, 'string')
  assert.ok(result.length > 0)
  assert.ok(result.includes(FIXTURE_TASK.id))
})

test('scenarioTestPrompt includes the task id and attempt number', () => {
  const attempt = 3
  const result = scenarioTestPrompt(FIXTURE_TASK, attempt, FIXTURE_TARGET_PATH)
  assert.equal(typeof result, 'string')
  assert.ok(result.length > 0)
  assert.ok(result.includes(FIXTURE_TASK.id))
  assert.ok(result.includes(String(attempt)))
})

test('fullPlaytestPrompt includes the backlog task description', () => {
  const backlog = { tasks: [FIXTURE_TASK] }
  const result = fullPlaytestPrompt(FIXTURE_VISION, backlog, FIXTURE_TARGET_PATH)
  assert.equal(typeof result, 'string')
  assert.ok(result.length > 0)
  assert.ok(result.includes(FIXTURE_TASK.description))
})
