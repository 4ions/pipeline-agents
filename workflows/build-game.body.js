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
    { title: 'Implementation' },
    { title: 'Director Review' },
    { title: 'Full Playtest' },
    { title: 'Report' },
  ],
}

// 3 same-strategy retries + 1 alternative-strategy attempt on the 4th —
// see implementPrompt's `attempt >= 4` branch, which must stay in sync
// with this number.
const MAX_FIX_ATTEMPTS = 4

async function implementAndTestTask(task, targetProjectPath) {
  let lastResult = null
  for (let attempt = 1; attempt <= MAX_FIX_ATTEMPTS; attempt++) {
    await agent(implementPrompt(task, attempt, lastResult, targetProjectPath), {
      phase: 'Implementation',
      label: `impl:${task.id}:${attempt}`,
    })
    if (task.needsArt) {
      await agent(artPrompt(task, targetProjectPath), { phase: 'Implementation', label: `art:${task.id}:${attempt}` })
    }
    lastResult = await agent(scenarioTestPrompt(task, attempt, targetProjectPath), {
      phase: 'Implementation',
      label: `test:${task.id}:${attempt}`,
      schema: TEST_RESULT_SCHEMA,
    })
    if (lastResult && lastResult.passed) {
      return { task, status: 'done', attempts: attempt, lastResult }
    }
  }
  return { task, status: 'blocked', attempts: MAX_FIX_ATTEMPTS, lastResult }
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
const design = await agent(designPrompt(vision, args.targetProjectPath), {
  schema: BACKLOG_SCHEMA,
  phase: 'Design',
})
if (!design || !Array.isArray(design.tasks)) {
  log('Designer failed to produce a backlog — aborting.')
  return { vision, error: 'design_generation_failed' }
}

phase('Implementation')
const taskResults = await pipeline(
  design.tasks,
  (task) => implementAndTestTask(task, args.targetProjectPath)
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

phase('Full Playtest')
const playtestResult = await agent(fullPlaytestPrompt(vision, design, args.targetProjectPath), {
  schema: PLAYTEST_SCHEMA,
  phase: 'Full Playtest',
})
if (!playtestResult) {
  log('Full playtest agent failed to return a result — the final review will note this as unverified.')
}

phase('Report')
const finalReview = await agent(
  finalReviewPrompt(vision, design.gdd, taskResults, playtestResult, directorDecisions),
  {
    phase: 'Report',
    schema: { type: 'object', required: ['ready', 'reopenTaskIds', 'summary'], properties: {
      ready: { type: 'boolean' }, reopenTaskIds: { type: 'array', items: { type: 'string' } }, summary: { type: 'string' },
    } },
  }
)

return {
  vision,
  taskResults,
  blocked: blocked.map(b => b.task.id),
  directorDecisions,
  playtestResult,
  finalReview,
}
