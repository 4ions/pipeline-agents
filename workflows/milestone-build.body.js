// workflows/milestone-build.body.js
// NOT run directly — same generator as the other two workflows: prepend
// prompts/schemas.js, director.js, designer.js, programmer.js, artist.js,
// tester.js, critic.js, roadmap.js above it, write to
// workflows/milestone-build.js. Regenerate with: node bin/build-workflow.js

export const meta = {
  name: 'milestone-build',
  description: 'Build a large-scope game incrementally across chained, roadmap-driven milestones',
  phases: [
    { title: 'Resume' },
    { title: 'Roadmap' },
    { title: 'Design' },
    { title: 'Design Review' },
    { title: 'Implementation' },
    { title: 'Full Playtest' },
    { title: 'Quality Gate' },
    { title: 'Report' },
    { title: 'Snapshot' },
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

async function implementAndTestTask(task, targetProjectPath, vision, reopenReason) {
  if (task.taskKind && task.taskKind !== 'standard') {
    return implementAndVerifyMlTrainingTask(task, targetProjectPath, vision, reopenReason)
  }

  const animationResult = task.needsAnimation ? await animateTask(task, targetProjectPath, vision) : null

  // When this task is being re-run because the Director's final review
  // reopened it (not a fresh task), seed attempt 1 with the reopen reason
  // as a priorFailure — otherwise the Fixer gets no context at all about
  // WHY it was reopened and tends to just re-verify the original,
  // already-passing successCriterion instead of addressing the real
  // complaint.
  let lastResult = reopenReason ? { passed: false, evidence: reopenReason, bug: null } : null
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

// ML-training tasks don't fit the generic Programmer/Artist/Tester
// shape: "launch" and "monitor" have no scenarioTestPrompt-style
// pass/fail cycle at all (launching a background process either
// succeeds or the task is blocked; monitoring runs until the
// deterministic script returns a terminal verdict, per
// docs/superpowers/specs/2026-09-09-ml-agents-training-design.md).
// Only "integrate-verify" has a real Tester-style retry loop, reusing
// MAX_FIX_ATTEMPTS the same way standard tasks do.
async function implementAndVerifyMlTrainingTask(task, targetProjectPath, vision, reopenReason) {
  if (task.taskKind === 'ml-training-launch') {
    await agent(launchTrainingPrompt(task, targetProjectPath, vision), {
      phase: 'Implementation',
      label: `ml-launch:${task.id}`,
    })
    return { task, status: 'done', attempts: 1, lastResult: { passed: true, evidence: 'Training launch task has no pass/fail cycle of its own — its success is implicitly verified by the monitor task actually finding a running training process.' }, animationResult: null }
  }

  if (task.taskKind === 'ml-training-monitor') {
    const firstAttempt = await agent(monitorConvergencePrompt(task, targetProjectPath, vision, 1), {
      phase: 'Implementation',
      label: `ml-monitor:${task.id}:1`,
      schema: TRAINING_MONITOR_SCHEMA,
    })
    const finalVerdict = (firstAttempt && firstAttempt.action === 'retry')
      ? await agent(monitorConvergencePrompt(task, targetProjectPath, vision, 2), {
          phase: 'Implementation',
          label: `ml-monitor:${task.id}:2`,
          schema: TRAINING_MONITOR_SCHEMA,
        })
      : firstAttempt
    const succeeded = !!(finalVerdict && finalVerdict.action === 'proceed_to_integration')
    return {
      task,
      status: succeeded ? 'done' : 'blocked',
      attempts: (firstAttempt && firstAttempt.action === 'retry') ? 2 : 1,
      lastResult: {
        passed: succeeded,
        evidence: finalVerdict ? finalVerdict.reason : 'Monitor task failed to return a result.',
        bug: succeeded ? undefined : { description: finalVerdict ? `Training did not converge usefully: ${finalVerdict.reason}` : 'Monitor agent returned no result.', reproSteps: [] },
      },
      animationResult: null,
    }
  }

  // ml-training-integrate-verify: a real Tester-style retry loop, same
  // shape as the standard-task loop above, using trainedModelVerificationPrompt
  // instead of implementPrompt+scenarioTestPrompt.
  let lastResult = reopenReason ? { passed: false, evidence: reopenReason, bug: null } : null
  for (let attempt = 1; attempt <= MAX_FIX_ATTEMPTS; attempt++) {
    lastResult = await agent(trainedModelVerificationPrompt(task, attempt, targetProjectPath, vision), {
      phase: 'Implementation',
      label: `ml-verify:${task.id}:${attempt}`,
      schema: TEST_RESULT_SCHEMA,
    })
    if (lastResult && lastResult.passed) {
      return { task, status: 'done', attempts: attempt, lastResult, animationResult: null }
    }
  }
  return { task, status: 'blocked', attempts: MAX_FIX_ATTEMPTS, lastResult, animationResult: null }
}

// Every invocation checks for prior state first, using the same
// sourceDocument/targetProjectPath args every time — there is no separate
// "resume" flag. See docs/superpowers/specs/2026-08-31-milestone-build-resumability-design.md.
phase('Resume')
const resumeState = await agent(resumeStatePrompt(args.targetProjectPath), {
  schema: RESUME_STATE_SCHEMA,
  phase: 'Resume',
})
if (resumeState && resumeState.mode === 'escalated') {
  log(`Resume check: chain is escalated, needs a human decision — ${resumeState.escalationReason || '(no reason returned)'}`)
  return { error: 'escalated', reason: resumeState.escalationReason || null }
}
const isResuming = !!(
  resumeState &&
  resumeState.mode === 'resume' &&
  resumeState.vision &&
  Array.isArray(resumeState.remainingMilestones) &&
  resumeState.remainingMilestones.length > 0
)

let vision
let milestones
if (isResuming) {
  vision = resumeState.vision
  milestones = resumeState.remainingMilestones
} else {
  phase('Roadmap')
  const roadmapResult = await agent(roadmapPrompt(args.sourceDocument, args.targetProjectPath), {
    schema: ROADMAP_SCHEMA,
    phase: 'Roadmap',
  })
  if (!roadmapResult || !Array.isArray(roadmapResult.milestones) || roadmapResult.milestones.length === 0) {
    log('Director/Designer failed to produce a usable roadmap — aborting.')
    return { error: 'roadmap_generation_failed' }
  }
  vision = roadmapResult.vision
  milestones = roadmapResult.milestones
}

const milestoneHistory = []
// Flat accumulator of every task result across ALL milestones built so
// far (not just the current one) — fed into Full Playtest/Quality
// Gate/Report below so they evaluate the WHOLE accumulated project each
// time, per the design spec's "Regression across milestones" section.
// Without this, a milestone's playtest/critique would only know about
// that milestone's own tasks and couldn't specifically re-verify earlier
// milestones' features. On a resume, seeded below from resumeState's
// doneMilestones instead of starting empty.
const accumulatedTaskResults = []
// Same accumulation pattern as accumulatedTaskResults, for the same
// reason: qualityCritiquePrompt/finalReviewPrompt need the WHOLE
// project's design context, not just the newest milestone's GDD, or
// earlier milestones' features get judged against a document that never
// mentions them.
const accumulatedGdds = []
// Non-null only on a resume where the "current" milestone has a usable
// snapshot (see resumeStatePrompt) — lets the loop below skip re-running
// Design/Design Review for exactly that one milestone.
const currentMilestoneSnapshot = isResuming && resumeState.currentMilestoneSnapshot && Array.isArray(resumeState.currentMilestoneSnapshot.tasks) && resumeState.currentMilestoneSnapshot.tasks.length > 0 && resumeState.currentMilestoneSnapshot.gdd
  ? resumeState.currentMilestoneSnapshot
  : null

if (isResuming && Array.isArray(resumeState.doneMilestones)) {
  for (const dm of resumeState.doneMilestones) {
    if (!dm || !Array.isArray(dm.tasks)) continue
    accumulatedGdds.push({ id: dm.id, gdd: dm.gdd || '(GDD text unavailable for this milestone)' })
    for (const t of dm.tasks) {
      accumulatedTaskResults.push({ task: t, status: t.status, attempts: t.attempts, lastResult: null, animationResult: null })
    }
  }
}

// Defensive correction: currentMilestoneSnapshot comes from a single,
// targeted file read (resumeStatePrompt Step 4) and is far less prone to
// drift than `milestones` (reconstructed from milestone-status.json's
// list by the same agent call, Step 2) — if milestones[0] doesn't match
// the snapshot's own id, trust the snapshot over the reconstructed list
// and correct milestones[0] in place, rather than silently designing an
// entirely unrelated milestone from scratch. This pipeline has shipped
// exactly that bug: a correctly-loaded current-milestone snapshot sitting
// unused while the remaining-milestones list pointed at a stale, wrong
// milestone id first.
if (isResuming && currentMilestoneSnapshot && milestones.length > 0 && milestones[0].id !== currentMilestoneSnapshot.id) {
  log(`Resume check: milestones[0] ("${milestones[0].id}") doesn't match the loaded current-milestone snapshot ("${currentMilestoneSnapshot.id}") — trusting the snapshot and correcting the remaining-milestones list.`)
  const stillListed = milestones.find(m => m.id === currentMilestoneSnapshot.id)
  const corrected = stillListed ?? { id: currentMilestoneSnapshot.id, description: `(reconstructed from snapshot: ${currentMilestoneSnapshot.id})`, scope: '(reconstructed from snapshot — see its own gdd for real scope)', dependsOn: [] }
  milestones = [corrected, ...milestones.filter(m => m.id !== currentMilestoneSnapshot.id)]
}

if (isResuming) {
  log(`Resume check: resuming — ${resumeState.doneMilestones?.length ?? 0} done milestone(s) loaded, ${milestones.length} remaining, ${currentMilestoneSnapshot ? `current milestone "${currentMilestoneSnapshot.id}" snapshot loaded (${currentMilestoneSnapshot.tasks.length} task(s))` : 'no usable current-milestone snapshot — it will be designed fresh'}.`)
} else if (resumeState && resumeState.mode === 'resume') {
  log('Resume check: mode was "resume" but returned no usable vision/remaining milestones — falling back to a fresh roadmap instead of guessing.')
} else {
  log('Resume check: fresh start.')
}

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

  const isResumingThisMilestone = m === 0 && currentMilestoneSnapshot && currentMilestoneSnapshot.id === milestone.id

  let design
  if (isResumingThisMilestone) {
    design = { gdd: currentMilestoneSnapshot.gdd, tasks: currentMilestoneSnapshot.tasks }
    log(`Milestone ${milestone.id}: resuming from its existing snapshot — skipping Design/Design Review, ${design.tasks.length} task(s) loaded.`)
  } else {
    if (m === 0 && currentMilestoneSnapshot && currentMilestoneSnapshot.id !== milestone.id) {
      log(`Milestone ${milestone.id}: a loaded snapshot exists for "${currentMilestoneSnapshot.id}" but doesn't match this milestone — designing fresh instead.`)
    }
    phase('Design')
    design = await agent(designPrompt(milestoneVision, args.targetProjectPath), {
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

      // Group tasks that share a cross-cutting root cause (relatedTaskIds) so
      // each Fixer sees its siblings instead of patching its own task in
      // isolation and drifting back out of sync with the others — siblings
      // can span earlier milestones too, since allTaskResultsSoFar accumulates.
      const siblingMap = new Map()
      for (const issue of blockingIssues) {
        if (!issue.taskId || !Array.isArray(issue.relatedTaskIds) || issue.relatedTaskIds.length === 0) continue
        const group = new Set([issue.taskId, ...issue.relatedTaskIds])
        for (const id of group) {
          if (!siblingMap.has(id)) siblingMap.set(id, new Set())
          for (const other of group) if (other !== id) siblingMap.get(id).add(other)
        }
      }

      log(`Milestone ${milestone.id} reopen-round ${reopenRound} Quality Critic round ${round}: ${blockingIssues.length} blocking issue(s) on tasks ${taskIdsToFix.join(', ')}`)
      for (const taskId of taskIdsToFix) {
        const result = allTaskResultsSoFar.find(r => r && r.task.id === taskId)
        if (!result) continue
        const critiqueFailure = {
          evidence: blockingIssues.filter(i => i.taskId === taskId).map(i => i.description).join('; '),
          bug: null,
        }
        const siblingIds = siblingMap.get(taskId)
        const relatedTasks = siblingIds && siblingIds.size > 0
          ? [...siblingIds].map(id => {
              const sibling = allTaskResultsSoFar.find(r => r && r.task.id === id)
              return sibling ? { id, description: sibling.task.description } : { id, description: '(unknown task)' }
            })
          : null
        await agent(implementPrompt(result.task, round, critiqueFailure, args.targetProjectPath, vision, relatedTasks), {
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
        schema: FINAL_REVIEW_SCHEMA,
      }
    )

    if (!finalReview || finalReview.ready || !Array.isArray(finalReview.reopenTasks) || finalReview.reopenTasks.length === 0) {
      break
    }
    if (reopenRound === MAX_MILESTONE_REOPEN_ROUNDS) {
      log(`Milestone ${milestone.id}: still not ready after ${MAX_MILESTONE_REOPEN_ROUNDS} reopen rounds — moving on to the milestone-level stop check below rather than looping forever.`)
      break
    }
    log(`Milestone ${milestone.id} reopen round ${reopenRound + 1}: reopening ${finalReview.reopenTasks.map(rt => rt.taskId).join(', ')} — ${finalReview.summary}`)

    phase('Implementation')
    const reasonByTaskId = new Map(finalReview.reopenTasks.map(rt => [rt.taskId, rt.reason]))
    const reopenIds = new Set(reasonByTaskId.keys())
    // The Director can flag a task's OWN stored successCriterion as
    // factually wrong (not just unmet) and supply the corrected text —
    // apply it to the in-memory task now, before dispatch, so this round's
    // Fixer/Tester (and the backlog.json bookkeeping the Tester does) work
    // against the CORRECTED criterion, not the original broken one. Without
    // this, a Fixer reading the task's original text can revert a correct
    // fix back to the broken requirement every time it's touched again.
    const correctedCriterionByTaskId = new Map(
      finalReview.reopenTasks.filter(rt => rt.correctedSuccessCriterion).map(rt => [rt.taskId, rt.correctedSuccessCriterion])
    )
    for (const [taskId, corrected] of correctedCriterionByTaskId) {
      log(`Milestone ${milestone.id} reopen round ${reopenRound + 1}: correcting ${taskId}'s stored successCriterion (Director determined the original was factually wrong) to: "${corrected}"`)
    }
    // finalReview can reopen a task from ANY earlier milestone, not just
    // this one — allTaskResultsSoFar (accumulatedTaskResults +
    // currentTaskResults, computed above) is where those live;
    // currentTaskResults alone silently drops cross-milestone reopens.
    const tasksToReopen = allTaskResultsSoFar
      .filter(r => r && reopenIds.has(r.task.id))
      .map(r => ({
        ...r.task,
        status: 'todo',
        attempts: 0,
        successCriterion: correctedCriterionByTaskId.get(r.task.id) ?? r.task.successCriterion,
      }))
    // The Director is instructed to only return real, existing task ids,
    // but if it ever invents a free-text label instead (e.g. a description
    // of the problem rather than an "M#-T#" id), that id matches nothing
    // above and would otherwise vanish silently — the "bug" then just
    // resurfaces every review with no one ever assigned to fix it. Surface
    // it loudly instead of losing it.
    const matchedIds = new Set(tasksToReopen.map(t => t.id))
    const unmatchedIds = [...reopenIds].filter(id => !matchedIds.has(id))
    if (unmatchedIds.length > 0) {
      log(`WARNING — Milestone ${milestone.id} reopen round ${reopenRound + 1}: the Director's reopenTasks named ${unmatchedIds.length} id(s) that don't match any known task and will NOT be fixed this round: ${unmatchedIds.join(', ')} — reason(s) given: ${unmatchedIds.map(id => `"${reasonByTaskId.get(id)}"`).join('; ')}. This usually means the Director invented a free-text label instead of reusing a real task id.`)
    }
    const freshResults = await pipeline(
      tasksToReopen,
      (task) => implementAndTestTask(task, args.targetProjectPath, vision, reasonByTaskId.get(task.id))
    )
    const freshById = new Map(freshResults.map(r => [r.task.id, r]))
    currentTaskResults = currentTaskResults.map(r => freshById.get(r.task.id) ?? r)
    // A reopened task can belong to an earlier, already-"done" milestone —
    // patch its accumulated result in place too, or the next playtest/
    // critique pass still sees the stale pre-fix result.
    for (let i = 0; i < accumulatedTaskResults.length; i++) {
      const fresh = freshById.get(accumulatedTaskResults[i].task.id)
      if (fresh) accumulatedTaskResults[i] = fresh
    }
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

  phase('Snapshot')
  await agent(milestoneSnapshotPrompt(milestone, currentTaskResults, design.gdd, finalReview, args.targetProjectPath), {
    phase: 'Snapshot',
    label: `snapshot:${milestone.id}`,
  })

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
