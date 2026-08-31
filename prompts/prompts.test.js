// prompts/prompts.test.js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { visionPrompt, escalationPrompt, finalReviewPrompt, designReviewPrompt } from './director.js'
import { designPrompt } from './designer.js'
import { implementPrompt, animationReviewPrompt } from './programmer.js'
import { artPrompt, animatedArtPrompt } from './artist.js'
import { scenarioTestPrompt, fullPlaytestPrompt } from './tester.js'
import { qualityCritiquePrompt } from './critic.js'
import { roadmapPrompt, roadmapReviewPrompt, resumeStatePrompt, milestoneSnapshotPrompt } from './roadmap.js'

const FIXTURE_VISION = { identity: 'A test game', scope: 'test scope', priorities: ['fun', 'polish'] }
const FIXTURE_TASK = { id: 'task-001', specialization: 'gameplay', description: 'Player can jump', successCriterion: 'Jump works', needsArt: false, needsAnimation: false, status: 'todo', attempts: 0 }
const FIXTURE_ANIMATED_TASK = { ...FIXTURE_TASK, id: 'task-002', description: 'Door opens when key is collected', needsArt: true, needsAnimation: true }
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
  const result = finalReviewPrompt(FIXTURE_VISION, 'a short GDD', taskResults, null, null, null, FIXTURE_TARGET_PATH)
  assert.equal(typeof result, 'string')
  assert.ok(result.length > 0)
  // Confirm the null-guard fallback text is used instead of a raw JSON.stringify(null)
  assert.ok(!result.includes('"null"'))
  assert.ok(result.includes('MISSING'))
  assert.ok(result.includes(FIXTURE_TARGET_PATH))
})

test('finalReviewPrompt treats a blocking Quality Critic issue as authoritative', () => {
  const taskResults = [{ task: FIXTURE_TASK, status: 'done', attempts: 1, lastResult: { passed: true, evidence: 'it worked' } }]
  const critique = { acceptable: false, issues: [{ taskId: FIXTURE_TASK.id, description: 'enemy sprite fills the room', severity: 'blocking' }] }
  const result = finalReviewPrompt(FIXTURE_VISION, 'a short GDD', taskResults, null, null, critique, FIXTURE_TARGET_PATH)
  assert.ok(result.includes('enemy sprite fills the room'))
  assert.ok(result.includes('authoritative'))
})

test('designPrompt includes the target project path', () => {
  const result = designPrompt(FIXTURE_VISION, FIXTURE_TARGET_PATH)
  assert.equal(typeof result, 'string')
  assert.ok(result.length > 0)
  assert.ok(result.includes(FIXTURE_TARGET_PATH))
})

test('designPrompt includes prior Director feedback on a revision pass', () => {
  const fresh = designPrompt(FIXTURE_VISION, FIXTURE_TARGET_PATH)
  assert.ok(!fresh.includes('already reviewed'))

  const revised = designPrompt(FIXTURE_VISION, FIXTURE_TARGET_PATH, 'Missing a camera-follow task')
  assert.ok(revised.includes('Missing a camera-follow task'))
})

test('designReviewPrompt includes the backlog tasks and vision', () => {
  const backlog = { gdd: 'a short GDD', tasks: [FIXTURE_TASK, FIXTURE_ANIMATED_TASK] }
  const result = designReviewPrompt(FIXTURE_VISION, backlog.gdd, backlog, FIXTURE_TARGET_PATH)
  assert.equal(typeof result, 'string')
  assert.ok(result.includes(FIXTURE_TASK.id))
  assert.ok(result.includes(FIXTURE_ANIMATED_TASK.id))
  assert.ok(result.includes(FIXTURE_VISION.identity))
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

test('implementPrompt, artPrompt, animatedArtPrompt, animationReviewPrompt, and scenarioTestPrompt include the game vision when passed, and omit it when not', () => {
  const callsWithVision = [
    () => implementPrompt(FIXTURE_TASK, 1, null, FIXTURE_TARGET_PATH, FIXTURE_VISION),
    () => artPrompt(FIXTURE_TASK, FIXTURE_TARGET_PATH, FIXTURE_VISION),
    () => animatedArtPrompt(FIXTURE_ANIMATED_TASK, null, FIXTURE_TARGET_PATH, FIXTURE_VISION),
    () => animationReviewPrompt(FIXTURE_ANIMATED_TASK, FIXTURE_TARGET_PATH, FIXTURE_VISION),
    () => scenarioTestPrompt(FIXTURE_TASK, 1, FIXTURE_TARGET_PATH, FIXTURE_VISION),
  ]
  for (const call of callsWithVision) {
    const result = call()
    assert.ok(result.includes(FIXTURE_VISION.identity), `expected vision identity in: ${result.slice(0, 80)}...`)
  }

  // Omitting vision must not crash and must not leave a stray "undefined".
  const noVision = implementPrompt(FIXTURE_TASK, 1, null, FIXTURE_TARGET_PATH)
  assert.ok(!noVision.includes('undefined'))
})

test('implementPrompt notes an existing Animator when the task needsAnimation', () => {
  const withAnimation = implementPrompt(FIXTURE_ANIMATED_TASK, 1, null, FIXTURE_TARGET_PATH)
  assert.ok(withAnimation.includes('Animator'))

  const withoutAnimation = implementPrompt(FIXTURE_TASK, 1, null, FIXTURE_TARGET_PATH)
  assert.ok(!withoutAnimation.includes('Animator Controller with at least an idle state'))
})

test('implementPrompt includes sibling task info and a coordination instruction when relatedTasks is passed, and omits it when not', () => {
  const relatedTasks = [{ id: 'task-999', description: 'Camera follows the player' }]
  const withSiblings = implementPrompt(FIXTURE_TASK, 2, null, FIXTURE_TARGET_PATH, FIXTURE_VISION, relatedTasks)
  assert.ok(withSiblings.includes('task-999'))
  assert.ok(withSiblings.includes('Camera follows the player'))
  assert.ok(withSiblings.includes('COORDINATED'))

  const withoutSiblings = implementPrompt(FIXTURE_TASK, 2, null, FIXTURE_TARGET_PATH, FIXTURE_VISION)
  assert.ok(!withoutSiblings.includes('COORDINATED'))
  assert.ok(!withoutSiblings.includes('task-999'))
})

test('artPrompt includes the task id', () => {
  const result = artPrompt(FIXTURE_TASK, FIXTURE_TARGET_PATH)
  assert.equal(typeof result, 'string')
  assert.ok(result.length > 0)
  assert.ok(result.includes(FIXTURE_TASK.id))
})

test('animatedArtPrompt includes the task id and, when given feedback, includes it', () => {
  const firstAttempt = animatedArtPrompt(FIXTURE_ANIMATED_TASK, null, FIXTURE_TARGET_PATH)
  assert.equal(typeof firstAttempt, 'string')
  assert.ok(firstAttempt.includes(FIXTURE_ANIMATED_TASK.id))
  assert.ok(!firstAttempt.includes('was rejected'))

  const retry = animatedArtPrompt(FIXTURE_ANIMATED_TASK, 'Missing the Open state entirely', FIXTURE_TARGET_PATH)
  assert.ok(retry.includes('Missing the Open state entirely'))
})

test('animationReviewPrompt includes the task description', () => {
  const result = animationReviewPrompt(FIXTURE_ANIMATED_TASK, FIXTURE_TARGET_PATH)
  assert.equal(typeof result, 'string')
  assert.ok(result.length > 0)
  assert.ok(result.includes(FIXTURE_ANIMATED_TASK.description))
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

test('qualityCritiquePrompt includes the GDD and forbids calling issues minor', () => {
  const taskResults = [{ task: FIXTURE_TASK, status: 'done', attempts: 1, lastResult: { passed: true, evidence: 'it worked' } }]
  const result = qualityCritiquePrompt(FIXTURE_VISION, 'a short GDD', taskResults, null, FIXTURE_TARGET_PATH)
  assert.equal(typeof result, 'string')
  assert.ok(result.includes('a short GDD'))
  assert.ok(result.includes('FORBIDDEN'))
  assert.ok(result.includes(FIXTURE_TARGET_PATH))
})

test('roadmapPrompt includes the source document and target path', () => {
  const doc = 'A cozy farming sim with seasons, NPC relationships, and a mine.'
  const result = roadmapPrompt(doc, FIXTURE_TARGET_PATH)
  assert.equal(typeof result, 'string')
  assert.ok(result.includes(doc))
  assert.ok(result.includes(FIXTURE_TARGET_PATH))
  assert.ok(result.includes('project-map.md'))
})

test('roadmapReviewPrompt includes the remaining roadmap and the milestone result, and explains the verdict options', () => {
  const roadmap = { milestones: [{ id: 'M2', description: 'NPC schedules', scope: 'basic daily NPC movement', dependsOn: ['M1'] }] }
  const milestoneResult = { milestone: { id: 'M1', description: 'Day/night cycle' }, finalReview: { ready: true, summary: 'Day/night cycle works end to end.' } }
  const result = roadmapReviewPrompt(roadmap, milestoneResult, FIXTURE_TARGET_PATH)
  assert.equal(typeof result, 'string')
  assert.ok(result.includes('M2'))
  assert.ok(result.includes('Day/night cycle works end to end.'))
  assert.ok(result.includes('escalate'))
  assert.ok(result.includes('complete'))
  assert.ok(result.includes('project-map.md'))
})

test('resumeStatePrompt includes the target project path and explains all three modes with their trigger conditions', () => {
  const result = resumeStatePrompt(FIXTURE_TARGET_PATH)
  assert.equal(typeof result, 'string')
  assert.ok(result.includes(FIXTURE_TARGET_PATH))
  assert.ok(result.includes('milestone-status.json'))
  assert.ok(result.includes('"fresh"'))
  assert.ok(result.includes('"resume"'))
  assert.ok(result.includes('"escalated"'))
  assert.ok(result.includes('complete'), 'must explain that chainStatus "complete" means fresh, not resume')
  assert.ok(result.includes('"in_progress"') && result.includes('"blocked"'), 'must explain that chainStatus "in_progress" and "blocked" both trigger resume mode')
})

test('resumeStatePrompt explains the per-milestone snapshot path and the top-level-backlog prefix fallback', () => {
  const result = resumeStatePrompt(FIXTURE_TARGET_PATH)
  assert.ok(result.includes('.pipeline/milestones/'))
  assert.ok(result.includes('backlog.json'))
  assert.ok(result.includes('currentMilestoneSnapshot'))
  assert.ok(result.toLowerCase().includes('prefix'), 'must explain the "<id>-" task-id-prefix fallback check')
})

const FIXTURE_MILESTONE = { id: 'M1', description: 'Farm scene & player movement', scope: 'a small top-down farm plot', dependsOn: [] }

test('milestoneSnapshotPrompt includes the milestone id, the task snapshot, and the per-milestone file paths', () => {
  const taskResults = [{ task: FIXTURE_TASK, status: 'done', attempts: 1, lastResult: { passed: true, evidence: 'it worked' } }]
  const result = milestoneSnapshotPrompt(FIXTURE_MILESTONE, taskResults, 'a short GDD', { ready: true, reopenTaskIds: [], summary: 'all good' }, FIXTURE_TARGET_PATH)
  assert.equal(typeof result, 'string')
  assert.ok(result.includes(FIXTURE_TARGET_PATH))
  assert.ok(result.includes(`.pipeline/milestones/${FIXTURE_MILESTONE.id}/backlog.json`))
  assert.ok(result.includes(`.pipeline/milestones/${FIXTURE_MILESTONE.id}/gdd.md`))
  assert.ok(result.includes(FIXTURE_TASK.id))
  assert.ok(result.includes('a short GDD'))
})

test('milestoneSnapshotPrompt instructs updating milestone-status.json to "blocked" only when finalReview is not ready', () => {
  const taskResults = [{ task: FIXTURE_TASK, status: 'done', attempts: 4, lastResult: { passed: false, evidence: 'still broken' } }]

  const notReady = milestoneSnapshotPrompt(FIXTURE_MILESTONE, taskResults, 'a short GDD', { ready: false, reopenTaskIds: [FIXTURE_TASK.id], summary: 'still broken' }, FIXTURE_TARGET_PATH)
  assert.ok(notReady.includes('currentMilestoneId set to'), 'not-ready branch must instruct writing currentMilestoneId')
  assert.ok(notReady.includes('milestone-status.json'))

  const ready = milestoneSnapshotPrompt(FIXTURE_MILESTONE, taskResults, 'a short GDD', { ready: true, reopenTaskIds: [], summary: 'all good' }, FIXTURE_TARGET_PATH)
  assert.ok(!ready.includes('currentMilestoneId set to'), 'ready branch must NOT instruct the blocked-status update')

  const missingReview = milestoneSnapshotPrompt(FIXTURE_MILESTONE, taskResults, 'a short GDD', null, FIXTURE_TARGET_PATH)
  assert.ok(missingReview.includes('currentMilestoneId set to'), 'a missing final review must be treated the same as not-ready')
})
