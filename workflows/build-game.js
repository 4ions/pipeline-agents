// GENERATED FILE — do not edit directly.
// Source: schemas.js, director.js, designer.js, programmer.js, artist.js, tester.js + build-game.body.js
// Regenerate with: node bin/build-workflow.js

const VISION_SCHEMA = {
  type: 'object',
  required: ['identity', 'scope', 'priorities'],
  properties: {
    identity: { type: 'string', description: 'What kind of game this is and its core hook, 2-4 sentences' },
    scope: { type: 'string', description: 'What is in and explicitly out of scope for this build' },
    priorities: { type: 'array', items: { type: 'string' }, description: 'Ordered list of what matters most if trade-offs are needed' },
  },
}

const BACKLOG_TASK_SCHEMA = {
  type: 'object',
  required: ['id', 'specialization', 'description', 'successCriterion', 'needsArt', 'status', 'attempts'],
  properties: {
    id: { type: 'string' },
    specialization: { type: 'string', enum: ['gameplay', 'ui', 'ai', 'network', 'graphics', 'tools'] },
    description: { type: 'string' },
    successCriterion: { type: 'string', description: 'A concrete, checkable condition the Tester can verify via input+state' },
    needsArt: { type: 'boolean' },
    status: { type: 'string', enum: ['todo', 'in_progress', 'done', 'blocked'] },
    attempts: { type: 'number' },
  },
}

const BACKLOG_SCHEMA = {
  type: 'object',
  required: ['gdd', 'tasks'],
  properties: {
    gdd: { type: 'string', description: 'The full Game Design Document text (also written to gdd.md by the Designer) — carried here because the Workflow script cannot read gdd.md itself' },
    tasks: { type: 'array', items: BACKLOG_TASK_SCHEMA },
  },
}

const TEST_RESULT_SCHEMA = {
  type: 'object',
  required: ['passed', 'evidence'],
  properties: {
    passed: { type: 'boolean' },
    evidence: { type: 'string', description: 'What was observed via input+state (and a screenshot check, if taken) that supports the verdict' },
    bug: {
      type: 'object',
      description: 'Present only if passed is false',
      properties: {
        description: { type: 'string' },
        reproSteps: { type: 'array', items: { type: 'string' } },
      },
    },
  },
}

const PLAYTEST_SCHEMA = {
  type: 'object',
  required: ['completed', 'issues'],
  properties: {
    completed: { type: 'boolean', description: 'Whether the full playthrough reached its end without breaking' },
    issues: { type: 'array', items: { type: 'string' }, description: 'Any problems found during the full playthrough, empty if none' },
  },
}

function visionPrompt(gameIdea, targetProjectPath) {
  return `You are the Director for a Unity game being built autonomously.

The user's game idea: """${gameIdea}"""
Target Unity project path: ${targetProjectPath}

Write the game's vision: its identity (what kind of game, its core hook),
its scope (what's in and explicitly out for this build — keep it small
enough to actually finish), and priorities (ordered list of what matters
most if trade-offs come up later).

Also write this vision to ${targetProjectPath}/.pipeline/vision.md as
readable Markdown (using your Write tool). Append one line to
${targetProjectPath}/.pipeline/activity.log.jsonl when you start and
another when you finish — one JSON object per line, shape:
{"ts": "<ISO timestamp from running the shell 'date -u +%Y-%m-%dT%H:%M:%SZ'>", "role": "director", "specialization": null, "taskId": null, "event": "start"|"done", "detail": "<short note>"}.
Also append one line to ${targetProjectPath}/.pipeline/progress-log.md
when you finish, e.g. "- Vision written: <one-line summary>".

Return the vision as structured data matching the required schema.`
}

function escalationPrompt(vision, blockedTasks, targetProjectPath) {
  const taskList = blockedTasks.map(t => `- [${t.task.id}] ${t.task.description} (${t.attempts} attempts failed; last result: ${JSON.stringify(t.lastResult)})`).join('\n')
  return `You are the Director for a Unity game whose vision is:
"""${vision.identity}"""
Scope: ${vision.scope}
Priorities: ${vision.priorities.join(', ')}

The following backlog tasks could not be fixed after repeated attempts by
the Fixer, including one attempt at an alternative strategy each:

${taskList}

For each task, decide one of: "descope" (drop it, it's not essential to
the vision), "simplify" (suggest a smaller version of the task that keeps
the spirit but is easier to implement — describe the smaller version
concretely), or "escalate" (this genuinely needs the user's decision).
Every decision, including "descope" and "simplify", must come with a
one-sentence reason.

For each task, also update its entry in
${targetProjectPath}/.pipeline/backlog.json (read the file, find the
matching id, edit it, write the file back) to set "status": "blocked"
and add "directorDecision" (your decision) and "directorReason" (your
reason) fields to that task object. Append one line to
${targetProjectPath}/.pipeline/progress-log.md summarizing your
decisions, e.g. "- Director ruled on N blocked tasks: ...".

Return your decision per task as structured data.`
}

function finalReviewPrompt(vision, gdd, taskResults, playtestResult, directorDecisions) {
  return `You are the Director doing the final coherence review before this
Unity game is reported as done.

Vision: """${vision.identity}""" Scope: ${vision.scope}
GDD: """${gdd}"""
Task results: ${JSON.stringify(taskResults)}
Full playtest result: ${playtestResult ? JSON.stringify(playtestResult) : 'MISSING — the playtest agent did not return a result; treat this as unverified, not as a passing playtest.'}
${directorDecisions ? `Earlier escalation decisions you already made on blocked tasks: ${JSON.stringify(directorDecisions)}` : 'No tasks were blocked.'}

Check whether what was actually built still matches the original vision
(not just whether it technically works). If something drifted from the
vision in a way that matters, list which backlog task ids should be
reopened and why. Otherwise confirm the game is ready to report as done.
Append one line to .pipeline/progress-log.md summarizing your
verdict. Return your review as structured data.`
}

function designPrompt(vision, targetProjectPath) {
  return `You are the Designer for a Unity game with this vision:
Identity: """${vision.identity}"""
Scope: ${vision.scope}
Priorities: ${vision.priorities.join(', ')}

Write a short Game Design Document (a few short sections: core loop,
mechanics, content scope) and a backlog of concrete, testable tasks that
implement it. Every task MUST have:
- a specialization tag, one of: gameplay, ui, ai, network, graphics, tools
- a successCriterion that is concrete enough for a Tester agent to check
  by simulating input and reading game state (e.g. "player's Y position
  increases by at least 1 unit within 1 second of the jump input", not
  "jumping feels good")
- needsArt: true if the task needs a placeholder visual asset

Only use specializations the game actually needs — a small prototype
probably only needs gameplay and ui; don't add ai/network/graphics/tools
tasks unless the vision's scope calls for them.

Write the GDD to ${targetProjectPath}/.pipeline/gdd.md and the backlog to
${targetProjectPath}/.pipeline/backlog.json (using your Write tool) with
every task starting at status "todo" and attempts 0. Append start/done
lines to ${targetProjectPath}/.pipeline/activity.log.jsonl the same way
the Director does: {"ts": "<ISO timestamp from shell 'date -u +%Y-%m-%dT%H:%M:%SZ'>", "role": "designer", "specialization": null, "taskId": null, "event": "start"|"done", "detail": "<short note>"}.
Append one line to ${targetProjectPath}/.pipeline/progress-log.md when
you finish, e.g. "- Design complete: N tasks across [specializations]".

Return the GDD text (in the "gdd" field, matching what you wrote to
gdd.md) and the backlog as structured data matching the required schema.`
}

function implementPrompt(task, attempt, priorFailure, targetProjectPath) {
  // Attempt 1 has no priorFailure — it's the Programmer's first pass.
  // Attempts 2+ are retries after a failed test — logged as the Fixer,
  // per the spec's separate Fixer role, so the dashboard can show it.
  const role = priorFailure ? 'fixer' : 'programmer'

  const retryContext = priorFailure
    ? `\n\nThis is retry attempt ${attempt}. A previous attempt failed this way:
Evidence: ${priorFailure.evidence}
${priorFailure.bug ? `Bug: ${priorFailure.bug.description}\nRepro steps: ${priorFailure.bug.reproSteps.join(' -> ')}` : ''}
${attempt >= 4 ? 'This is the last attempt. Try a genuinely different implementation approach this time, not a small tweak on the same one.' : 'Fix the specific problem described above.'}`
    : ''

  return `You are a ${task.specialization} ${role === 'fixer' ? 'programmer, acting as the Fixer,' : 'programmer'}
working on a Unity project at ${targetProjectPath}.

Task: ${task.description}
Success criterion (what the Tester will check): ${task.successCriterion}
${retryContext}

Use the Unity MCP tools available to you (search for them if you don't
see them yet) to write/edit C# scripts and configure the scene/GameObjects
needed. Keep the change scoped to this task. When done, append a line to
${targetProjectPath}/.pipeline/activity.log.jsonl: {"ts": "<ISO timestamp
from shell 'date -u +%Y-%m-%dT%H:%M:%SZ'>", "role": "${role}",
"specialization": "${task.specialization}", "taskId": "${task.id}",
"event": "done", "detail": "<short note>"} — and append a matching
"start" line (same role) before you begin.

Report back a short summary of what you implemented.`
}

function artPrompt(task, targetProjectPath) {
  return `You are the Artist for a Unity project at ${targetProjectPath}.

Task: ${task.description}
This task needs a placeholder visual asset (sprite, material, or simple
prefab — whatever fits) wired into what the Programmer built for it. Use
the Unity MCP tools available to you. Keep it simple placeholder-quality;
visual polish is not the goal here.

Append a "start" line and, when done, a "done" line to
${targetProjectPath}/.pipeline/activity.log.jsonl: {"ts": "<ISO
timestamp from shell 'date -u +%Y-%m-%dT%H:%M:%SZ'>", "role": "artist",
"specialization": "${task.specialization}", "taskId": "${task.id}",
"event": "start"|"done", "detail": "<short note>"}.

Report back a short summary of what you created and wired up.`
}

function scenarioTestPrompt(task, attempt, targetProjectPath) {
  return `You are the Tester for a Unity project at ${targetProjectPath}.

Task under test: ${task.description}
Success criterion: ${task.successCriterion}
This is check attempt ${attempt} for this task.

Use the play-mode/input MCP tools available to you (search for them if
you don't see them yet — look for Play Mode control, simulated
input/key-press, and screenshot capture tools) to actually operate the
game and check this criterion: enter Play Mode, simulate the relevant
input(s), and read back game state (position, health, score, etc.) to
verify the criterion. Take a screenshot only if the criterion has a
visual component the state alone can't confirm (e.g. "the pause menu is
visible").

Append a "start" line and, when done, a "done" line to
${targetProjectPath}/.pipeline/activity.log.jsonl: {"ts": "<ISO
timestamp from shell 'date -u +%Y-%m-%dT%H:%M:%SZ'>", "role": "tester",
"specialization": "${task.specialization}", "taskId": "${task.id}",
"event": "start"|"done", "detail": "<short note>"}.

You are also the only role that keeps ${targetProjectPath}/.pipeline/backlog.json
and ${targetProjectPath}/.pipeline/bugs.json current — after you decide
pass/fail, do all of the following with your Read/Write tools:
1. Read backlog.json, find the task with id "${task.id}", set its
   "attempts" field to ${attempt}, and set its "status" to "done" if
   this passed (leave it "todo" if it failed — the Director marks a
   task "blocked" separately once all attempts are exhausted). Write
   the file back.
2. If it failed: read bugs.json, append a new object
   {"id": "bug-<short unique suffix>", "taskId": "${task.id}",
   "description": "<what's wrong>", "reproSteps": ["<step 1>", "..."],
   "status": "open"}, and write the file back.
3. If it passed AND bugs.json has an "open" bug whose taskId is
   "${task.id}" from a previous failed attempt, set that bug's status
   to "fixed" and write the file back.

Return whether it passed, the evidence you observed, and — only if it
did not pass — a bug description with concrete repro steps (matching
what you wrote to bugs.json).`
}

function fullPlaytestPrompt(vision, backlog, targetProjectPath) {
  const taskSummaries = backlog.tasks.map(t => `- ${t.description}`).join('\n')
  return `You are the Tester running the full playthrough pass for a
Unity project at ${targetProjectPath}, whose vision is:
"""${vision.identity}"""

The backlog of features that should now be present:
${taskSummaries}

Use the play-mode/input MCP tools available to you to play through the
game's core loop end-to-end, the way a player actually would — not just
touching each feature in isolation. Watch for: crashes, getting stuck
with no way to proceed, and features that worked in isolation but break
when combined. Take spot-check screenshots at a few key moments to catch
purely visual problems state alone wouldn't reveal.

Append start/done lines to
${targetProjectPath}/.pipeline/activity.log.jsonl (role: "tester",
specialization: null, taskId: null), and one line to
${targetProjectPath}/.pipeline/progress-log.md summarizing the result,
e.g. "- Full playtest: completed, 2 issues found".

Return whether the playthrough completed without breaking, and a list of
any issues found (empty if none).`
}

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
// KNOWN LIMITATION: concurrent Tester agents each read-modify-write the
// whole of backlog.json/bugs.json (see prompts/tester.js), which can lose
// updates under concurrent completion — the same hazard activity.log.jsonl
// solved by being append-only, not yet applied here. Not fixed in this
// version; see docs/superpowers/plans/2026-08-27-auto-game-build-plan.md.
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
const completedTasks = taskResults.filter(r => r && r.status === 'done').map(r => r.task)
const playtestResult = await agent(fullPlaytestPrompt(vision, { tasks: completedTasks }, args.targetProjectPath), {
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
