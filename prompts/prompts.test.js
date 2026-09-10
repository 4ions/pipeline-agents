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
import { launchTrainingPrompt, monitorConvergencePrompt, trainedModelVerificationPrompt } from './mlTraining.js'

const FIXTURE_VISION = { identity: 'A test game', scope: 'test scope', priorities: ['fun', 'polish'] }
const FIXTURE_TASK = { id: 'task-001', specialization: 'gameplay', description: 'Player can jump', successCriterion: 'Jump works', needsArt: false, needsAnimation: false, status: 'todo', attempts: 0 }
const FIXTURE_ANIMATED_TASK = { ...FIXTURE_TASK, id: 'task-002', description: 'Door opens when key is collected', needsArt: true, needsAnimation: true }
const FIXTURE_TARGET_PATH = '/tmp/fake-project'
const FIXTURE_ML_LAUNCH_TASK = { ...FIXTURE_TASK, id: 'M13-T1', taskKind: 'ml-training-launch', description: 'Export a standalone build and launch ML-Agents training' }

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

test('finalReviewPrompt requires a concrete per-task reason when reopening tasks, not just a bare id list', () => {
  const taskResults = [{ task: FIXTURE_TASK, status: 'done', attempts: 1, lastResult: { passed: true, evidence: 'it worked' } }]
  const result = finalReviewPrompt(FIXTURE_VISION, 'a short GDD', taskResults, null, null, null, FIXTURE_TARGET_PATH)
  assert.ok(result.includes('reopenTasks'))
  assert.ok(result.toLowerCase().includes('reason'))
  assert.ok(result.includes('FRESH agent'))
})

test('finalReviewPrompt instructs the Director not to reopen a task the Critic just explicitly said it could not reproduce', () => {
  const taskResults = [{ task: FIXTURE_TASK, status: 'done', attempts: 1, lastResult: { passed: true, evidence: 'it worked' } }]
  const result = finalReviewPrompt(FIXTURE_VISION, 'a short GDD', taskResults, null, null, null, FIXTURE_TARGET_PATH)
  assert.ok(result.includes("Critic's LATEST verdict overrides older evidence"))
  assert.ok(/could\s+not\s+reproduce/.test(result))
})

test('finalReviewPrompt requires taskId to be a real existing task id, never an invented free-text label', () => {
  const taskResults = [{ task: FIXTURE_TASK, status: 'done', attempts: 1, lastResult: { passed: true, evidence: 'it worked' } }]
  const result = finalReviewPrompt(FIXTURE_VISION, 'a short GDD', taskResults, null, null, null, FIXTURE_TARGET_PATH)
  assert.ok(result.includes('EXACT id'))
  assert.ok(result.includes('player-collision fix'))
  assert.ok(result.includes('taskId: null'))
})

test('finalReviewPrompt instructs the Director to correct a factually-wrong successCriterion rather than let it silently re-litigate', () => {
  const taskResults = [{ task: FIXTURE_TASK, status: 'done', attempts: 1, lastResult: { passed: true, evidence: 'it worked' } }]
  const result = finalReviewPrompt(FIXTURE_VISION, 'a short GDD', taskResults, null, null, null, FIXTURE_TARGET_PATH)
  assert.ok(result.includes('correctedSuccessCriterion'))
  assert.ok(result.includes('KeyCode.A'))
})

test('scenarioTestPrompt instructs the Tester to persist the (possibly corrected) successCriterion back to backlog.json', () => {
  const result = scenarioTestPrompt(FIXTURE_TASK, 1, FIXTURE_TARGET_PATH)
  assert.ok(result.includes('"successCriterion" field'))
  assert.ok(result.includes(FIXTURE_TASK.successCriterion))
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

test('designPrompt forbids exact-matching a successCriterion against dynamic content a later milestone could expand', () => {
  const result = designPrompt(FIXTURE_VISION, FIXTURE_TARGET_PATH)
  assert.ok(result.includes('NPC_A, NPC_B, NPC_C'))
  assert.ok(result.includes('live source of truth') || result.toLowerCase().includes('however many'))
})

test('designPrompt requires atmosphere/decoration to be named explicitly for player-facing scenes', () => {
  const result = designPrompt(FIXTURE_VISION, FIXTURE_TARGET_PATH)
  assert.ok(result.includes('environmental richness'))
  assert.ok(result.toLowerCase().includes('decoration'))
  assert.ok(/never\s+acceptable/.test(result))
})

test('designReviewPrompt checks the backlog for named decoration on player-facing scenes', () => {
  const backlog = { gdd: 'a short GDD', tasks: [FIXTURE_TASK, FIXTURE_ANIMATED_TASK] }
  const result = designReviewPrompt(FIXTURE_VISION, backlog.gdd, backlog, FIXTURE_TARGET_PATH)
  assert.ok(result.toLowerCase().includes('decoration'))
  assert.ok(result.includes('reject the backlog'))
})

test('designPrompt requires a particle/VFX effect for actions with obvious physical impact', () => {
  const result = designPrompt(FIXTURE_VISION, FIXTURE_TARGET_PATH)
  assert.ok(result.includes('splash of droplets'))
  assert.ok(result.includes('puff of dust'))
  assert.ok(result.includes('needsArt: true'))
})

test('designPrompt explains taskKind for an ML-Agents training milestone, including the exact three kinds and their order', () => {
  const result = designPrompt(FIXTURE_VISION, FIXTURE_TARGET_PATH)
  assert.ok(result.includes('taskKind'))
  assert.ok(result.includes('ml-training-launch'))
  assert.ok(result.includes('ml-training-monitor'))
  assert.ok(result.includes('ml-training-integrate-verify'))
  assert.ok(result.includes('"standard"'), 'must clarify that every non-ML-training task keeps using the default')
})

test('designReviewPrompt checks the backlog for named VFX on physical-impact actions', () => {
  const backlog = { gdd: 'a short GDD', tasks: [FIXTURE_TASK, FIXTURE_ANIMATED_TASK] }
  const result = designReviewPrompt(FIXTURE_VISION, backlog.gdd, backlog, FIXTURE_TARGET_PATH)
  assert.ok(result.includes('particle/VFX effect'))
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

test('implementPrompt forbids hardcoding a value another component already owns', () => {
  const result = implementPrompt(FIXTURE_TASK, 1, null, FIXTURE_TARGET_PATH)
  assert.ok(result.includes('never hardcode a value that another component already owns'))
  assert.ok(result.includes('read it from that system at runtime'))
})

test('implementPrompt requires restoring components disabled for isolation before saving the scene', () => {
  const result = implementPrompt(FIXTURE_TASK, 1, null, FIXTURE_TARGET_PATH)
  assert.ok(result.includes('restore it to its correct enabled state'))
  assert.ok(result.includes('NpcWaypointFollower'))
})

test('scenarioTestPrompt requires restoring components disabled for isolation before finishing', () => {
  const result = scenarioTestPrompt(FIXTURE_TASK, 1, FIXTURE_TARGET_PATH)
  assert.ok(/restore it\s+to its\s+correct enabled state/.test(result))
  assert.ok(result.includes('NpcWaypointFollower'))
})

test('scenarioTestPrompt instructs updating the correct historical milestone snapshot when the task is not in the active backlog.json', () => {
  const result = scenarioTestPrompt(FIXTURE_TASK, 1, FIXTURE_TARGET_PATH)
  assert.ok(result.includes('.pipeline/milestones/'))
  assert.ok(result.toLowerCase().includes('not') && result.includes('backlog.json'))
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

test('qualityCritiquePrompt treats a decoration-free player-facing space as a real, blocking-eligible failure', () => {
  const taskResults = [{ task: FIXTURE_TASK, status: 'done', attempts: 1, lastResult: { passed: true, evidence: 'it worked' } }]
  const result = qualityCritiquePrompt(FIXTURE_VISION, 'a short GDD', taskResults, null, FIXTURE_TARGET_PATH)
  assert.ok(result.toLowerCase().includes('decoration'))
  assert.ok(result.includes('not a cosmetic nitpick'))
})

test('qualityCritiquePrompt checks physical-impact actions for a matching particle/VFX effect', () => {
  const taskResults = [{ task: FIXTURE_TASK, status: 'done', attempts: 1, lastResult: { passed: true, evidence: 'it worked' } }]
  const result = qualityCritiquePrompt(FIXTURE_VISION, 'a short GDD', taskResults, null, FIXTURE_TARGET_PATH)
  assert.ok(result.toLowerCase().includes('particle'))
  assert.ok(result.includes('puff of dust'))
})

test('qualityCritiquePrompt treats a hollow/isolated core mechanic as a real, blocking-eligible failure', () => {
  const taskResults = [{ task: FIXTURE_TASK, status: 'done', attempts: 1, lastResult: { passed: true, evidence: 'it worked' } }]
  const result = qualityCritiquePrompt(FIXTURE_VISION, 'a short GDD', taskResults, null, FIXTURE_TARGET_PATH)
  assert.ok(result.includes('hollow or isolated'))
  assert.ok(result.includes('blocking-\n  eligible') || result.includes('blocking-eligible'))
})

test('roadmapPrompt includes the source document and target path', () => {
  const doc = 'A cozy farming sim with seasons, NPC relationships, and a mine.'
  const result = roadmapPrompt(doc, FIXTURE_TARGET_PATH)
  assert.equal(typeof result, 'string')
  assert.ok(result.includes(doc))
  assert.ok(result.includes(FIXTURE_TARGET_PATH))
  assert.ok(result.includes('project-map.md'))
})

test('roadmapPrompt requires complete-systems thinking with a narrow-feature-request exception', () => {
  const doc = 'A cozy farming sim with seasons, NPC relationships, and a mine.'
  const result = roadmapPrompt(doc, FIXTURE_TARGET_PATH)
  assert.ok(result.includes('think in complete systems'))
  assert.ok(result.includes('EXCEPTION'))
  assert.ok(result.includes('AoE attack ability'))
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

test('resumeStatePrompt derives remainingMilestones from milestone-status.json, not from roadmap.md, to survive roadmap.md drift', () => {
  const result = resumeStatePrompt(FIXTURE_TARGET_PATH)
  assert.ok(result.includes('AUTHORITATIVE source for WHICH'))
  assert.ok(result.includes('NEVER let'))
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

test('launchTrainingPrompt instructs exporting a standalone build (not the live Editor) and launching mlagents-learn with time_scale/no_graphics/num-envs/resume set explicitly', () => {
  const result = launchTrainingPrompt(FIXTURE_ML_LAUNCH_TASK, FIXTURE_TARGET_PATH, FIXTURE_VISION)
  assert.equal(typeof result, 'string')
  assert.ok(result.includes('standalone build'))
  assert.ok(result.includes('mlagents-learn'))
  assert.ok(result.includes('--num-envs'))
  assert.ok(result.includes('--resume'))
  assert.ok(result.includes('no_graphics'))
  assert.ok(result.includes('time_scale'))
  assert.ok(result.includes('max_steps'))
  assert.ok(result.includes(FIXTURE_TARGET_PATH))
})

test('launchTrainingPrompt instructs writing the run-id/logdir to a file the monitor task can find', () => {
  const result = launchTrainingPrompt(FIXTURE_ML_LAUNCH_TASK, FIXTURE_TARGET_PATH, FIXTURE_VISION)
  assert.ok(result.includes('.pipeline/ml-training/'))
  assert.ok(result.includes(FIXTURE_ML_LAUNCH_TASK.id))
})

const FIXTURE_ML_MONITOR_TASK = { ...FIXTURE_TASK, id: 'M13-T2', taskKind: 'ml-training-monitor', description: 'Monitor training convergence and decide when to stop' }

test('monitorConvergencePrompt instructs looping the convergence-check script via Bash and consuming its verdict, never reasoning over raw numbers itself', () => {
  const result = monitorConvergencePrompt(FIXTURE_ML_MONITOR_TASK, FIXTURE_TARGET_PATH, FIXTURE_VISION, 1)
  assert.equal(typeof result, 'string')
  assert.ok(result.includes('training_convergence_check.py'))
  assert.ok(result.includes('plateau_degenerate'))
  assert.ok(result.includes('diverge'))
  assert.ok(result.toLowerCase().includes('never') && result.toLowerCase().includes('raw'), 'must warn against reasoning over raw numbers directly')
})

test('monitorConvergencePrompt treats attempt 2 as the bounded retry, escalating instead of retrying again on a repeat bad verdict', () => {
  const firstAttempt = monitorConvergencePrompt(FIXTURE_ML_MONITOR_TASK, FIXTURE_TARGET_PATH, FIXTURE_VISION, 1)
  assert.ok(firstAttempt.includes('"retry"'))

  const secondAttempt = monitorConvergencePrompt(FIXTURE_ML_MONITOR_TASK, FIXTURE_TARGET_PATH, FIXTURE_VISION, 2)
  assert.ok(secondAttempt.includes('escalate'))
  assert.ok(secondAttempt.includes('do NOT') || secondAttempt.includes('never'), 'must forbid a second automatic retry')
})

const FIXTURE_ML_VERIFY_TASK = { ...FIXTURE_TASK, id: 'M13-T3', taskKind: 'ml-training-integrate-verify', description: 'Assign the trained model and verify measured hunt/evasion success rates' }

test('trainedModelVerificationPrompt requires a concrete, measured pass/fail band (not qualitative judgment) using EncounterTelemetry', () => {
  const result = trainedModelVerificationPrompt(FIXTURE_ML_VERIFY_TASK, 1, FIXTURE_TARGET_PATH, FIXTURE_VISION)
  assert.equal(typeof result, 'string')
  assert.ok(result.includes('EncounterTelemetry'))
  assert.ok(result.includes('15') || result.includes('20'), 'must specify a concrete minimum encounter count, not a vague amount')
  assert.ok(result.toLowerCase().includes('floor'))
  assert.ok(result.toLowerCase().includes('ceiling') || result.toLowerCase().includes('suspicio'))
  assert.ok(result.toLowerCase().includes('inference'))
})

test('trainedModelVerificationPrompt selects the deployed checkpoint by role-balance telemetry, not simply the last one saved', () => {
  const result = trainedModelVerificationPrompt(FIXTURE_ML_VERIFY_TASK, 1, FIXTURE_TARGET_PATH, FIXTURE_VISION)
  assert.ok(result.toLowerCase().includes('checkpoint'))
  assert.ok(result.includes('not') && result.toLowerCase().includes('last'))
})
