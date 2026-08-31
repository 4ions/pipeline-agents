// workflows/milestone-build.body.js
// NOT run directly — same generator as the other two workflows: prepend
// prompts/schemas.js, director.js, designer.js, programmer.js, artist.js,
// tester.js, critic.js, roadmap.js above it, write to
// workflows/milestone-build.js. Regenerate with: node bin/build-workflow.js

export const meta = {
  name: 'milestone-build',
  description: 'Build a large-scope game incrementally across chained, roadmap-driven milestones',
  phases: [
    { title: 'Roadmap' },
    { title: 'Design' },
    { title: 'Design Review' },
    { title: 'Implementation' },
    { title: 'Full Playtest' },
    { title: 'Quality Gate' },
    { title: 'Report' },
    { title: 'Roadmap Review' },
  ],
}

// 3 same-strategy retries + 1 alternative-strategy attempt on the 4th —
// see implementPrompt's `attempt >= 4` branch, which must stay in sync
// with this number.
const MAX_FIX_ATTEMPTS = 4
const MAX_ANIMATION_ROUNDS = 3
const MAX_DESIGN_REVIEW_ROUNDS = 3
const MAX_POLISH_ROUNDS = 5
// Hard cap on chained milestones in one run. Chaining is automatic (no
// human approval gate between milestones — see the design spec), so this
// cap, alongside the Director's own escalate/complete verdict from
// roadmapReviewPrompt, is what actually bounds an unattended run.
const MAX_MILESTONES = 5
// Bounded rounds for a SINGLE milestone's own reopen loop (playtest ->
// quality gate -> final review -> if not ready, re-implement whatever the
// Director reopened -> repeat), same pattern as fix-reopened.body.js's
// outer loop — just nested one level deeper, inside the milestone chain,
// so a milestone gets a real chance to fix itself before the whole chain
// gives up on it. Smaller than fix-reopened's own MAX_REOPEN_ROUNDS since
// each round here is already nested inside a 5-milestone cap and cost
// compounds quickly.
const MAX_MILESTONE_REOPEN_ROUNDS = 2

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

phase('Roadmap')
const roadmapResult = await agent(roadmapPrompt(args.sourceDocument, args.targetProjectPath), {
  schema: ROADMAP_SCHEMA,
  phase: 'Roadmap',
})
if (!roadmapResult || !Array.isArray(roadmapResult.milestones) || roadmapResult.milestones.length === 0) {
  log('Director/Designer failed to produce a usable roadmap — aborting.')
  return { error: 'roadmap_generation_failed' }
}

const vision = roadmapResult.vision
let milestones = roadmapResult.milestones
const milestoneHistory = []
// Flat accumulator of every task result across ALL milestones built so
// far (not just the current one) — fed into Full Playtest/Quality
// Gate/Report below so they evaluate the WHOLE accumulated project each
// time, per the design spec's "Regression across milestones" section.
// Without this, a milestone's playtest/critique would only know about
// that milestone's own tasks and couldn't specifically re-verify earlier
// milestones' features.
const accumulatedTaskResults = []
// Same accumulation pattern as accumulatedTaskResults, for the same
// reason: qualityCritiquePrompt/finalReviewPrompt need the WHOLE
// project's design context, not just the newest milestone's GDD, or
// earlier milestones' features get judged against a document that never
// mentions them.
const accumulatedGdds = []

for (let m = 0; m < MAX_MILESTONES; m++) {
  if (milestones.length === 0) {
    log('Roadmap has no remaining milestones — nothing left to build.')
    break
  }
  const milestone = milestones[0]
  const remainingMilestones = milestones.slice(1)

  // designPrompt is reused completely unchanged (see Global Constraints)
  // — a milestone is scoped by constructing a synthetic vision whose
  // "scope" field narrows the Designer down to just this milestone, while
  // "identity"/"priorities" stay the real whole-game vision so the
  // Designer still has the right tone/priority context (see spec's
  // gameContextBlock precedent — every per-task prompt already gets the
  // real vision this same way).
  const milestoneVision = {
    identity: vision.identity,
    scope: `THIS MILESTONE ONLY (id: ${milestone.id}): ${milestone.scope}

CRITICAL — before writing any task, read ${args.targetProjectPath}/.pipeline/project-map.md
to see what scenes/systems already exist from prior milestones, so tasks
extend/connect to them correctly instead of guessing or duplicating. Do
not design anything beyond this milestone's own scope, even if the wider
game needs it eventually — that belongs to a later milestone.

CRITICAL — every task id in this backlog MUST be prefixed with "${milestone.id}-" (e.g. "${milestone.id}-T1", "${milestone.id}-T2") so it can never collide with a task id from an earlier milestone — task ids are compared across the WHOLE accumulated project, not just this milestone, and a collision would cause a later fix to silently edit the wrong milestone's task.

Full game scope, for continuity/context only — do not build any of this
now, only what THIS MILESTONE ONLY says above: ${vision.scope}`,
    priorities: vision.priorities,
  }

  phase('Design')
  let design = await agent(designPrompt(milestoneVision, args.targetProjectPath), {
    schema: BACKLOG_SCHEMA,
    phase: 'Design',
    label: `design:${milestone.id}:1`,
  })
  if (!design || !Array.isArray(design.tasks)) {
    log(`Milestone ${milestone.id}: Designer failed to produce a backlog — stopping the chain rather than guessing.`)
    milestoneHistory.push({ milestone, error: 'design_generation_failed' })
    break
  }

  phase('Design Review')
  let designReview = null
  for (let round = 1; round <= MAX_DESIGN_REVIEW_ROUNDS; round++) {
    designReview = await agent(designReviewPrompt(milestoneVision, design.gdd, design, args.targetProjectPath), {
      schema: DESIGN_REVIEW_SCHEMA,
      phase: 'Design Review',
      label: `design-review:${milestone.id}:${round}`,
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
    const revised = await agent(designPrompt(milestoneVision, args.targetProjectPath, designReview.feedback), {
      schema: BACKLOG_SCHEMA,
      phase: 'Design Review',
      label: `design:${milestone.id}:${round + 1}`,
    })
    if (!revised || !Array.isArray(revised.tasks)) {
      log('Designer failed to produce a revised backlog — proceeding with the previous version.')
      break
    }
    design = revised
  }

  const allGddsSoFar = [...accumulatedGdds, { id: milestone.id, gdd: design.gdd }]
  const combinedGdd = allGddsSoFar.map(g => `## Milestone ${g.id}\n${g.gdd}`).join('\n\n')

  phase('Implementation')
  let currentTaskResults = await pipeline(
    design.tasks,
    (task) => implementAndTestTask(task, args.targetProjectPath, vision)
  )

  let playtestResult = null
  let critique = null
  let finalReview = null

  for (let reopenRound = 0; reopenRound <= MAX_MILESTONE_REOPEN_ROUNDS; reopenRound++) {
    // Everything built so far, THIS milestone's current results included —
    // this is what Full Playtest/Quality Gate/Report evaluate below, so
    // they see the whole accumulated project, not just this milestone.
    const allTaskResultsSoFar = [...accumulatedTaskResults, ...currentTaskResults]

    phase('Full Playtest')
    const completedTasks = allTaskResultsSoFar.filter(r => r && r.status === 'done').map(r => r.task)
    playtestResult = await agent(fullPlaytestPrompt(vision, { tasks: completedTasks }, args.targetProjectPath), {
      schema: PLAYTEST_SCHEMA,
      phase: 'Full Playtest',
      label: `playtest:${milestone.id}:${reopenRound + 1}`,
    })
    if (!playtestResult) {
      log('Full playtest agent failed to return a result — the final review will note this as unverified.')
    }

    phase('Quality Gate')
    critique = await agent(
      qualityCritiquePrompt(vision, combinedGdd, allTaskResultsSoFar, playtestResult, args.targetProjectPath),
      { phase: 'Quality Gate', label: `critique:${milestone.id}:${reopenRound}:1`, schema: QUALITY_CRITIQUE_SCHEMA }
    )
    for (let round = 1; round <= MAX_POLISH_ROUNDS && critique && !critique.acceptable; round++) {
      const blockingIssues = critique.issues.filter(i => i.severity === 'blocking')
      if (blockingIssues.length === 0) break
      const taskIdsToFix = [...new Set(blockingIssues.map(i => i.taskId).filter(Boolean))]
      if (taskIdsToFix.length === 0) break

      log(`Milestone ${milestone.id} reopen-round ${reopenRound} Quality Critic round ${round}: ${blockingIssues.length} blocking issue(s) on tasks ${taskIdsToFix.join(', ')}`)
      for (const taskId of taskIdsToFix) {
        const result = allTaskResultsSoFar.find(r => r && r.task.id === taskId)
        if (!result) continue
        const critiqueFailure = {
          evidence: blockingIssues.filter(i => i.taskId === taskId).map(i => i.description).join('; '),
          bug: null,
        }
        await agent(implementPrompt(result.task, round, critiqueFailure, args.targetProjectPath, vision), {
          phase: 'Quality Gate',
          label: `critic-fix:${milestone.id}:${reopenRound}:${taskId}:${round}`,
        })
      }

      critique = await agent(
        qualityCritiquePrompt(vision, combinedGdd, allTaskResultsSoFar, playtestResult, args.targetProjectPath),
        { phase: 'Quality Gate', label: `critique:${milestone.id}:${reopenRound}:${round + 1}`, schema: QUALITY_CRITIQUE_SCHEMA }
      )
    }
    if (!critique) {
      log('Quality Critic failed to return a result — the final review will note quality as unverified.')
    }

    phase('Report')
    const blocked = currentTaskResults.filter(r => r && r.status === 'blocked')
    const directorContext = blocked.length > 0
      ? {
          note: 'No escalation/decision phase exists in this milestone-build workflow yet — these tasks are simply unresolved, not deliberately descoped or simplified.',
          blockedTasks: blocked.map(b => ({ id: b.task.id, description: b.task.description, attempts: b.attempts })),
        }
      : null
    finalReview = await agent(
      finalReviewPrompt(vision, combinedGdd, allTaskResultsSoFar, playtestResult, directorContext, critique, args.targetProjectPath),
      {
        phase: 'Report',
        label: `final-review:${milestone.id}:${reopenRound + 1}`,
        schema: { type: 'object', required: ['ready', 'reopenTaskIds', 'summary'], properties: {
          ready: { type: 'boolean' }, reopenTaskIds: { type: 'array', items: { type: 'string' } }, summary: { type: 'string' },
        } },
      }
    )

    if (!finalReview || finalReview.ready || !Array.isArray(finalReview.reopenTaskIds) || finalReview.reopenTaskIds.length === 0) {
      break
    }
    if (reopenRound === MAX_MILESTONE_REOPEN_ROUNDS) {
      log(`Milestone ${milestone.id}: still not ready after ${MAX_MILESTONE_REOPEN_ROUNDS} reopen rounds — moving on to the milestone-level stop check below rather than looping forever.`)
      break
    }
    log(`Milestone ${milestone.id} reopen round ${reopenRound + 1}: reopening ${finalReview.reopenTaskIds.join(', ')} — ${finalReview.summary}`)

    phase('Implementation')
    const reopenIds = new Set(finalReview.reopenTaskIds)
    const tasksToReopen = currentTaskResults
      .filter(r => r && reopenIds.has(r.task.id))
      .map(r => ({ ...r.task, status: 'todo', attempts: 0 }))
    const freshResults = await pipeline(
      tasksToReopen,
      (task) => implementAndTestTask(task, args.targetProjectPath, vision)
    )
    const freshById = new Map(freshResults.map(r => [r.task.id, r]))
    currentTaskResults = currentTaskResults.map(r => freshById.get(r.task.id) ?? r)
  }

  const blocked = currentTaskResults.filter(r => r && r.status === 'blocked')

  // Only THIS milestone's own (post-reopen-loop) tasks feed the
  // accumulator — the per-round allTaskResultsSoFar above already folded
  // in every prior milestone's results, so adding that instead here would
  // double-count them on the next milestone's iteration.
  accumulatedTaskResults.push(...currentTaskResults)
  accumulatedGdds.push({ id: milestone.id, gdd: design.gdd })

  const milestoneResult = {
    milestone,
    taskResults: currentTaskResults,
    blocked: blocked.map(b => b.task.id),
    playtestResult,
    qualityCritique: critique,
    finalReview,
  }
  milestoneHistory.push(milestoneResult)

  if (!finalReview || !finalReview.ready) {
    log(`Milestone ${milestone.id} did not pass its own final review — stopping the chain rather than building the next milestone on a broken foundation.`)
    break
  }

  phase('Roadmap Review')
  const review = await agent(
    roadmapReviewPrompt({ milestones: remainingMilestones }, milestoneResult, args.targetProjectPath),
    { schema: ROADMAP_REVIEW_SCHEMA, phase: 'Roadmap Review', label: `roadmap-review:${milestone.id}` }
  )
  if (!review) {
    log('Director failed to return a roadmap review — stopping the chain rather than guessing whether to continue.')
    break
  }
  if (review.verdict === 'escalate') {
    log(`Roadmap Review: escalating to a human — ${review.reason}`)
    break
  }
  if (review.verdict === 'complete') {
    log(`Roadmap Review: roadmap complete — ${review.reason}`)
    break
  }
  if (m === MAX_MILESTONES - 1) {
    log(`Milestone cap (${MAX_MILESTONES}) reached — stopping and reporting rather than continuing unattended indefinitely.`)
    break
  }
  milestones = (review.revisedMilestones && review.revisedMilestones.length > 0)
    ? review.revisedMilestones
    : remainingMilestones
}

return { vision, roadmap: milestones, milestoneHistory }
