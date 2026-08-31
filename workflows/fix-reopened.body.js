// workflows/fix-reopened.body.js
// NOT run directly — same generator as build-game: prepend
// prompts/schemas.js, director.js, designer.js, programmer.js, artist.js,
// tester.js, critic.js above it, write to workflows/fix-reopened.js.
// Regenerate with: node bin/build-workflow.js --body fix-reopened

export const meta = {
  name: 'fix-reopened',
  description: 'Re-run implement+test for specific reopened backlog tasks, then re-verify with a full playtest and the Quality Gate',
  phases: [
    { title: 'Implementation' },
    { title: 'Full Playtest' },
    { title: 'Quality Gate' },
    { title: 'Report' },
  ],
}

const MAX_FIX_ATTEMPTS = 4
const MAX_ANIMATION_ROUNDS = 3
const MAX_POLISH_ROUNDS = 5
// Outer loop: playtest -> quality gate -> final review -> (if not ready)
// re-implement whatever the Director reopened -> repeat, without a human
// having to manually re-launch another round each time.
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

phase('Implementation')
log(`Re-running ${args.reopenTasks.length} reopened task(s): ${args.reopenTasks.map(t => t.id).join(', ')}`)
const reopenedResults = await pipeline(
  args.reopenTasks,
  (task) => implementAndTestTask(task, args.targetProjectPath, args.vision)
)

// Merge: everything from allTasks, with the reopened ones replaced by their
// fresh result (so the playtest/critique/report below see the whole game,
// not just the 6 tasks that got touched this round).
const resultById = new Map(reopenedResults.map(r => [r.task.id, r]))
const taskResults = args.allTasks.map(t =>
  resultById.get(t.id) ?? { task: t, status: t.status === 'done' ? 'done' : 'blocked', attempts: t.attempts ?? 1, lastResult: null, animationResult: null }
)

let playtestResult = null
let critique = null
let finalReview = null

for (let reopenRound = 0; reopenRound <= MAX_REOPEN_ROUNDS; reopenRound++) {
  phase('Full Playtest')
  const completedTasks = taskResults.filter(r => r && r.status === 'done').map(r => r.task)
  playtestResult = await agent(fullPlaytestPrompt(args.vision, { tasks: completedTasks }, args.targetProjectPath), {
    schema: PLAYTEST_SCHEMA,
    phase: 'Full Playtest',
    label: `playtest:${reopenRound + 1}`,
  })
  if (!playtestResult) {
    log('Full playtest agent failed to return a result — the final review will note this as unverified.')
  }

  phase('Quality Gate')
  critique = await agent(
    qualityCritiquePrompt(args.vision, args.gdd, taskResults, playtestResult, args.targetProjectPath),
    { phase: 'Quality Gate', label: `critique:${reopenRound}:1`, schema: QUALITY_CRITIQUE_SCHEMA }
  )

  for (let round = 1; round <= MAX_POLISH_ROUNDS && critique && !critique.acceptable; round++) {
    const blockingIssues = critique.issues.filter(i => i.severity === 'blocking')
    if (blockingIssues.length === 0) break
    const taskIdsToFix = [...new Set(blockingIssues.map(i => i.taskId).filter(Boolean))]
    if (taskIdsToFix.length === 0) break

    log(`Quality Critic reopen-round ${reopenRound} polish-round ${round}: ${blockingIssues.length} blocking issue(s) on tasks ${taskIdsToFix.join(', ')}`)
    for (const taskId of taskIdsToFix) {
      const result = taskResults.find(r => r && r.task.id === taskId)
      if (!result) continue
      const critiqueFailure = {
        evidence: blockingIssues.filter(i => i.taskId === taskId).map(i => i.description).join('; '),
        bug: null,
      }
      await agent(implementPrompt(result.task, round, critiqueFailure, args.targetProjectPath, args.vision), {
        phase: 'Quality Gate',
        label: `critic-fix:${reopenRound}:${taskId}:${round}`,
      })
    }

    critique = await agent(
      qualityCritiquePrompt(args.vision, args.gdd, taskResults, playtestResult, args.targetProjectPath),
      { phase: 'Quality Gate', label: `critique:${reopenRound}:${round + 1}`, schema: QUALITY_CRITIQUE_SCHEMA }
    )
  }
  if (!critique) {
    log('Quality Critic failed to return a result — the final review will note quality as unverified.')
  }

  phase('Report')
  finalReview = await agent(
    finalReviewPrompt(args.vision, args.gdd, taskResults, playtestResult, null, critique, args.targetProjectPath),
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
    (task) => implementAndTestTask(task, args.targetProjectPath, args.vision)
  )
  const freshById = new Map(freshResults.map(r => [r.task.id, r]))
  for (let i = 0; i < taskResults.length; i++) {
    const fresh = freshById.get(taskResults[i].task.id)
    if (fresh) taskResults[i] = fresh
  }
}

return {
  taskResults,
  blocked: taskResults.filter(r => r && r.status === 'blocked').map(r => r.task.id),
  playtestResult,
  qualityCritique: critique,
  finalReview,
}
