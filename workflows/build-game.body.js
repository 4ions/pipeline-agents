// workflows/build-game.body.js
// This file is NOT run directly — Task 8's generator prepends the
// un-exported contents of prompts/schemas.js, director.js, designer.js,
// programmer.js, artist.js, and tester.js above it, then writes the
// result to workflows/build-game.js. Regenerate after any prompts/*.js
// change with: node bin/build-workflow.js

export const meta = {
  name: 'build-game',
  description: 'Build and genuinely playtest a Unity game from a prompt',
  phases: [
    { title: 'Vision' },
    { title: 'Design' },
    { title: 'Design Review' },
    { title: 'Implementation' },
    { title: 'Director Review' },
    { title: 'Full Playtest' },
    { title: 'Quality Gate' },
    { title: 'Report' },
  ],
}

// 3 same-strategy retries + 1 alternative-strategy attempt on the 4th —
// see implementPrompt's `attempt >= 4` branch, which must stay in sync
// with this number.
const MAX_FIX_ATTEMPTS = 4

// Bounded rounds for the Artist<->Programmer animation review loop —
// separate from MAX_FIX_ATTEMPTS since this is a distinct handoff (art
// review, not a Tester-driven functional fix).
const MAX_ANIMATION_ROUNDS = 3

// Bounded rounds for the Director<->Designer design-review loop — the
// Director must have real say over the plan before engineering time gets
// spent on it, not just a rubber-stamped vision at the start and a
// final-coherence check at the end.
const MAX_DESIGN_REVIEW_ROUNDS = 3

// Bounded rounds for the Quality Critic's polish-fix loop — separate from
// MAX_FIX_ATTEMPTS since a task can be functionally "done" (passed its
// Tester check) and still get reopened here for a quality-only problem
// (wrong scale, no camera follow, etc.) the per-task test never checked.
// Real run data: a genuinely thorough, non-checklist Critic tends to
// surface a DIFFERENT real issue each round rather than just re-confirming
// the same one (observed: death-loop -> facing-direction -> invisible
// player across 3 rounds on one build) — 2 rounds was not enough budget
// for it to actually converge on a clean pass.
const MAX_POLISH_ROUNDS = 5

// Bounded rounds for the OUTER reopen loop: playtest -> quality gate ->
// final review -> (if not ready) re-implement the reopened tasks -> repeat.
// Without this, the pipeline would report "not ready" once and stop,
// requiring a human to manually re-launch another round for whatever the
// Director flagged — exactly the kind of manual babysitting this pipeline
// exists to avoid. Separate from MAX_POLISH_ROUNDS (which only covers the
// Critic's own polish-fix loop within a single reopen round).
const MAX_REOPEN_ROUNDS = 3

async function animateTask(task, targetProjectPath, vision) {
  let feedback = null
  for (let round = 1; round <= MAX_ANIMATION_ROUNDS; round++) {
    await agent(animatedArtPrompt(task, feedback, targetProjectPath, vision), {
      phase: 'Implementation',
      label: `art-anim:${task.id}:${round}`,
    })
    const review = await agent(animationReviewPrompt(task, targetProjectPath, vision), {
      phase: 'Implementation',
      label: `review-anim:${task.id}:${round}`,
      schema: ANIMATION_REVIEW_SCHEMA,
    })
    if (review && review.accepted) {
      return { accepted: true, rounds: round, feedback: review.feedback }
    }
    feedback = review
      ? review.feedback
      : 'No review returned — the reviewing agent failed. Try again with a simpler, more conservative animation setup (fewer states, simpler placeholder frames).'
  }
  return { accepted: false, rounds: MAX_ANIMATION_ROUNDS, feedback }
}

async function implementAndTestTask(task, targetProjectPath, vision) {
  const animationResult = task.needsAnimation ? await animateTask(task, targetProjectPath, vision) : null

  let lastResult = null
  for (let attempt = 1; attempt <= MAX_FIX_ATTEMPTS; attempt++) {
    await agent(implementPrompt(task, attempt, lastResult, targetProjectPath, vision), {
      phase: 'Implementation',
      label: `impl:${task.id}:${attempt}`,
    })
    if (task.needsArt && !task.needsAnimation) {
      await agent(artPrompt(task, targetProjectPath, vision), { phase: 'Implementation', label: `art:${task.id}:${attempt}` })
    }
    lastResult = await agent(scenarioTestPrompt(task, attempt, targetProjectPath, vision), {
      phase: 'Implementation',
      label: `test:${task.id}:${attempt}`,
      schema: TEST_RESULT_SCHEMA,
    })
    if (lastResult && lastResult.passed) {
      return { task, status: 'done', attempts: attempt, lastResult, animationResult }
    }
  }
  return { task, status: 'blocked', attempts: MAX_FIX_ATTEMPTS, lastResult, animationResult }
}

phase('Vision')
const vision = await agent(visionPrompt(args.gameIdea, args.targetProjectPath), {
  schema: VISION_SCHEMA,
  phase: 'Vision',
})
if (!vision) {
  log('Director failed to produce a vision — aborting.')
  return { error: 'vision_generation_failed' }
}

phase('Design')
let design = await agent(designPrompt(vision, args.targetProjectPath), {
  schema: BACKLOG_SCHEMA,
  phase: 'Design',
  label: 'design:1',
})
if (!design || !Array.isArray(design.tasks)) {
  log('Designer failed to produce a backlog — aborting.')
  return { vision, error: 'design_generation_failed' }
}

phase('Design Review')
let designReview = null
for (let round = 1; round <= MAX_DESIGN_REVIEW_ROUNDS; round++) {
  designReview = await agent(designReviewPrompt(vision, design.gdd, design, args.targetProjectPath), {
    schema: DESIGN_REVIEW_SCHEMA,
    phase: 'Design Review',
    label: `design-review:${round}`,
  })
  if (!designReview) {
    log('Director failed to return a design review — proceeding with the unreviewed backlog.')
    break
  }
  if (designReview.approved) break
  if (round === MAX_DESIGN_REVIEW_ROUNDS) {
    log(`Design review round ${round}: still not approved after ${MAX_DESIGN_REVIEW_ROUNDS} rounds — proceeding with the Designer's latest backlog anyway rather than blocking indefinitely.`)
    break
  }
  log(`Design review round ${round}: sent back — ${designReview.feedback}`)
  const revised = await agent(designPrompt(vision, args.targetProjectPath, designReview.feedback), {
    schema: BACKLOG_SCHEMA,
    phase: 'Design Review',
    label: `design:${round + 1}`,
  })
  if (!revised || !Array.isArray(revised.tasks)) {
    log('Designer failed to produce a revised backlog — proceeding with the previous version.')
    break
  }
  design = revised
}

phase('Implementation')
// KNOWN LIMITATION: concurrent Tester agents each read-modify-write the
// whole of backlog.json/bugs.json (see prompts/tester.js), which can lose
// updates under concurrent completion — the same hazard activity.log.jsonl
// solved by being append-only, not yet applied here. Not fixed in this
// version; see docs/superpowers/plans/2026-08-27-auto-game-build-plan.md.
const taskResults = await pipeline(
  design.tasks,
  (task) => implementAndTestTask(task, args.targetProjectPath, vision)
)

phase('Director Review')
const blocked = taskResults.filter(r => r && r.status === 'blocked')
let directorDecisions = null
if (blocked.length > 0) {
  log(`${blocked.length} task(s) blocked after ${MAX_FIX_ATTEMPTS} attempts each — asking the Director`)
  directorDecisions = await agent(escalationPrompt(vision, blocked, args.targetProjectPath), {
    phase: 'Director Review',
    schema: { type: 'object', required: ['decisions'], properties: { decisions: { type: 'array', items: {
      type: 'object', required: ['taskId', 'decision', 'reason'],
      properties: { taskId: { type: 'string' }, decision: { type: 'string', enum: ['descope', 'simplify', 'escalate'] }, reason: { type: 'string' } },
    } } } },
  })
  if (directorDecisions) {
    // Fold the Director's ruling into taskResults so the final report
    // reflects it — the Director already wrote 'blocked' + the decision
    // into backlog.json itself (see escalationPrompt), this just keeps
    // the in-memory result consistent with what's on disk.
    const decisionById = new Map(directorDecisions.decisions.map(d => [d.taskId, d]))
    for (const result of taskResults) {
      if (!result || result.status !== 'blocked') continue
      const decision = decisionById.get(result.task.id)
      if (decision) {
        result.directorDecision = decision.decision
        result.directorReason = decision.reason
      }
    }
  } else {
    log('Director failed to return escalation decisions — blocked tasks stay blocked with no ruling recorded.')
  }
}

let playtestResult = null
let critique = null
let finalReview = null

for (let reopenRound = 0; reopenRound <= MAX_REOPEN_ROUNDS; reopenRound++) {
  phase('Full Playtest')
  const completedTasks = taskResults.filter(r => r && r.status === 'done').map(r => r.task)
  playtestResult = await agent(fullPlaytestPrompt(vision, { tasks: completedTasks }, args.targetProjectPath), {
    schema: PLAYTEST_SCHEMA,
    phase: 'Full Playtest',
    label: `playtest:${reopenRound + 1}`,
  })
  if (!playtestResult) {
    log('Full playtest agent failed to return a result — the final review will note this as unverified.')
  }

  phase('Quality Gate')
  // The Critic checks the whole build, not just tasks that already passed
  // their functional test — a task can be "done" and still be mediocre.
  critique = await agent(
    qualityCritiquePrompt(vision, design.gdd, taskResults, playtestResult, args.targetProjectPath),
    { phase: 'Quality Gate', label: `critique:${reopenRound}:1`, schema: QUALITY_CRITIQUE_SCHEMA }
  )

  for (let round = 1; round <= MAX_POLISH_ROUNDS && critique && !critique.acceptable; round++) {
    const blockingIssues = critique.issues.filter(i => i.severity === 'blocking')
    if (blockingIssues.length === 0) break // only polish-level nitpicks left — not worth looping over
    const taskIdsToFix = [...new Set(blockingIssues.map(i => i.taskId).filter(Boolean))]
    if (taskIdsToFix.length === 0) break // whole-game issue with no task to reopen — nothing to re-run here

    log(`Quality Critic reopen-round ${reopenRound} polish-round ${round}: ${blockingIssues.length} blocking issue(s) on tasks ${taskIdsToFix.join(', ')}`)
    for (const taskId of taskIdsToFix) {
      const result = taskResults.find(r => r && r.task.id === taskId)
      if (!result) continue
      const critiqueFailure = {
        evidence: blockingIssues.filter(i => i.taskId === taskId).map(i => i.description).join('; '),
        bug: null,
      }
      await agent(implementPrompt(result.task, round, critiqueFailure, args.targetProjectPath, vision), {
        phase: 'Quality Gate',
        label: `critic-fix:${reopenRound}:${taskId}:${round}`,
      })
    }

    critique = await agent(
      qualityCritiquePrompt(vision, design.gdd, taskResults, playtestResult, args.targetProjectPath),
      { phase: 'Quality Gate', label: `critique:${reopenRound}:${round + 1}`, schema: QUALITY_CRITIQUE_SCHEMA }
    )
  }
  if (!critique) {
    log('Quality Critic failed to return a result — the final review will note quality as unverified.')
  }

  phase('Report')
  finalReview = await agent(
    finalReviewPrompt(vision, design.gdd, taskResults, playtestResult, directorDecisions, critique, args.targetProjectPath),
    {
      phase: 'Report',
      label: `final-review:${reopenRound + 1}`,
      schema: { type: 'object', required: ['ready', 'reopenTaskIds', 'summary'], properties: {
        ready: { type: 'boolean' }, reopenTaskIds: { type: 'array', items: { type: 'string' } }, summary: { type: 'string' },
      } },
    }
  )

  if (!finalReview || finalReview.ready || !Array.isArray(finalReview.reopenTaskIds) || finalReview.reopenTaskIds.length === 0) {
    break
  }
  if (reopenRound === MAX_REOPEN_ROUNDS) {
    log(`Still not ready after ${MAX_REOPEN_ROUNDS} reopen rounds — reporting as-is rather than looping forever.`)
    break
  }
  log(`Final review round ${reopenRound + 1}: reopening ${finalReview.reopenTaskIds.join(', ')} — ${finalReview.summary}`)

  phase('Implementation')
  const reopenIds = new Set(finalReview.reopenTaskIds)
  const tasksToReopen = taskResults
    .filter(r => r && reopenIds.has(r.task.id))
    .map(r => ({ ...r.task, status: 'todo', attempts: 0 }))
  const freshResults = await pipeline(
    tasksToReopen,
    (task) => implementAndTestTask(task, args.targetProjectPath, vision)
  )
  const freshById = new Map(freshResults.map(r => [r.task.id, r]))
  for (let i = 0; i < taskResults.length; i++) {
    const fresh = freshById.get(taskResults[i].task.id)
    if (fresh) taskResults[i] = fresh
  }
}

return {
  vision,
  designReview,
  taskResults,
  blocked: taskResults.filter(r => r && r.status === 'blocked').map(r => r.task.id),
  directorDecisions,
  playtestResult,
  qualityCritique: critique,
  finalReview,
}
