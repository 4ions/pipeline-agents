// GENERATED FILE — do not edit directly.
// Source: schemas.js, director.js, designer.js, programmer.js, artist.js, tester.js + build-game.body.js
// Regenerate with: node bin/build-workflow.js

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

CRITICAL — this pipeline builds 2D games EXCLUSIVELY, no exceptions, even
if the game idea above doesn't mention it. Frame "identity" around a 2D
perspective (top-down, side-scrolling, isometric-as-2D-sprites, etc.) —
never a 3D game. State this 2D framing explicitly in "identity" so every
later agent (which only sees this vision, not the original game idea
text) knows it's building 2D.

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
(not just whether it technically works). This pipeline builds 2D games
exclusively — if any task result's evidence suggests 3D primitives, 3D
physics, or a Perspective camera were used instead of SpriteRenderer/2D
physics/Orthographic camera, that is a drift from the vision that matters
and its task id must be listed to reopen. If something else drifted from
the vision in a way that matters, list which backlog task ids should be
reopened and why. Otherwise confirm the game is ready to report as done.
Append one line to .pipeline/progress-log.md summarizing your
verdict. Return your review as structured data.`
}

function designPrompt(vision, targetProjectPath) {
  return `You are the Designer for a Unity game with this vision:
Identity: """${vision.identity}"""
Scope: ${vision.scope}
Priorities: ${vision.priorities.join(', ')}

CRITICAL — this pipeline builds 2D games EXCLUSIVELY, no exceptions.
Every task's description MUST specify a 2D implementation approach:
SpriteRenderer-based GameObjects (never 3D primitives like Cube/Capsule/Sphere),
2D physics components (Rigidbody2D, BoxCollider2D/CircleCollider2D/PolygonCollider2D,
never their 3D equivalents), and an Orthographic camera. If a task involves
setting up the scene/camera, its description must say the camera is
Orthographic. Do not write any task that implies or requires 3D geometry,
3D physics, or a Perspective camera.

Write a short Game Design Document (a few short sections: core loop,
mechanics, content scope) and a backlog of concrete, testable tasks that
implement it. Every task MUST have:
- a specialization tag, one of: gameplay, ui, ai, network, graphics, tools
- a successCriterion that is concrete enough for a Tester agent to check
  by simulating input and reading game state (e.g. "player's Y position
  increases by at least 1 unit within 1 second of the jump input", not
  "jumping feels good")
- needsArt: true if the task needs a placeholder visual asset
- description: MUST explicitly name the target Unity scene this task
  works in (not just the first task's description) — e.g. "In the
  LockAndKeyDemo scene, add a player GameObject with...". Programmer,
  Artist, and Tester agents each run as fresh subagents per task with no
  memory of earlier tasks, and Unity MCP commands operate on whichever
  scene happens to be open in the Editor — if a task's description
  doesn't name the scene, an agent can end up editing the wrong scene
  (including an existing, unrelated scene) without realizing it.

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

CRITICAL — verify the scene before touching anything: Unity MCP
scene-editing commands operate on whichever scene is currently open/active
in the Editor, NOT on a scene name you merely have in mind. Before
creating or modifying any GameObject or component, confirm which scene is
currently open (use your Unity MCP tools to check), and if this task's
description names a specific scene, open that exact scene first if it
isn't already the active one. If the task doesn't name a scene, check
${targetProjectPath}/.pipeline/gdd.md for the scene this build is working
in before making any change. Never assume the Editor's current active
scene is the correct one — operating on the wrong scene means editing
content this task was never meant to touch, which is a serious error, not
a minor slip.

CRITICAL — this pipeline builds 2D games EXCLUSIVELY, no exceptions.
Never use 3D primitives (Cube, Sphere, Capsule, Plane) or 3D physics
(Rigidbody, BoxCollider, CapsuleCollider) for gameplay objects, even for a
placeholder. Every visible gameplay object must be a GameObject with a
SpriteRenderer component (a flat-colored placeholder sprite is fine), and
movement/collision must use Rigidbody2D + BoxCollider2D/CircleCollider2D/
PolygonCollider2D. The scene's camera must be Orthographic, not
Perspective — check this and fix it if it's wrong, even if that's not
explicitly what this task asked for, since a Perspective camera makes 2D
sprites render as if the scene were 3D (this exact bug has happened
before: a 2D door was built as a 3D primitive and looked like a wall
floating in perspective instead of a flat 2D sprite).

Use the funplay-unity MCP tools (search for "funplay" if you don't see
them yet — you have full Editor control: create_game_object,
add_component, set_component_property/set_component_properties,
set_transform, create_script/edit_script/patch_script,
create_material/assign_material, request_recompile,
get_compilation_errors, get_hierarchy, get_scene_info, open_scene). Use
add_component with type "SpriteRenderer", "Rigidbody2D", and the
appropriate Collider2D type — do NOT use create_primitive, which creates
3D mesh-based primitives. After editing any .cs script file, call
request_recompile then get_compilation_errors before considering the task
done. Keep the change scoped to this task and to the confirmed correct
scene. When done, append a line to
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
This task needs a placeholder visual asset wired into what the Programmer
built for it. Keep it simple placeholder-quality; visual polish is not
the goal here.

CRITICAL — this pipeline builds 2D games EXCLUSIVELY, no exceptions. The
target GameObject must have a SpriteRenderer (never a MeshRenderer on a
3D primitive). Generate or pick a flat placeholder sprite (a simple
colored shape is fine) and assign it to the SpriteRenderer's "sprite"
field via set_component_property/set_component_properties — do not
assign a Material the way you would for a 3D MeshRenderer. If you use
Unity's built-in asset generation, use command "GenerateSprite" (not
"GenerateImage" or "GenerateMaterial") so the result is sprite-import-ready.

Use the funplay-unity MCP tools (search for "funplay" if you don't see
them yet — relevant ones: add_component, set_component_property/
set_component_properties, create_material (2D sprite materials only, if
truly needed), get_component_properties to verify what you set). Also
search for Unity's built-in AI asset-generation tool
(Unity_AssetGeneration_GenerateAsset) if you need to generate new sprite
art rather than just wiring up an existing placeholder shape.

CRITICAL — verify the scene before touching anything: Unity MCP commands
operate on whichever scene is currently open/active in the Editor. Before
assigning a material or wiring an asset to a GameObject, confirm which
scene is currently open, and if this task's description names a specific
scene, open that exact scene first if it isn't already active. If the
task doesn't name a scene, check ${targetProjectPath}/.pipeline/gdd.md for
the scene this build is working in. Never assume the current active scene
is correct — wire assets only onto GameObjects in the confirmed right
scene.

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

CRITICAL — verify the scene before testing: Unity Play Mode and MCP
commands operate on whichever scene is currently open/active in the
Editor. Before entering Play Mode, confirm which scene is currently open,
and if this task's description names a specific scene, open that exact
scene first if it isn't already active. If the task doesn't name a scene,
check ${targetProjectPath}/.pipeline/gdd.md for the scene this build is
working in. Testing the wrong scene produces a meaningless result.

CRITICAL — this pipeline builds 2D games EXCLUSIVELY. If while testing
you observe 3D geometry, a Perspective camera, or objects that look like
they're floating in 3D space instead of flat 2D sprites, that is itself a
FAILURE of this task, regardless of what the success criterion literally
asked — report it as a bug (e.g. "door renders as a 3D primitive under a
perspective camera instead of a flat 2D sprite").

Use the funplay-unity MCP tools (search for "funplay" if you don't see
them yet): enter_play_mode, simulate_key_press/simulate_key_combo for
keyboard input, simulate_mouse_click/simulate_mouse_drag for mouse input,
get_console_logs (check for errors after every action), get_component_properties
or get_game_object_info to read back game state (position, health, score,
etc.), capture_game_view for a screenshot when the criterion has a visual
component the state alone can't confirm (e.g. "the pause menu is
visible"), and exit_play_mode when done. Poll get_reload_recovery_status
after enter_play_mode before your next call, since the connection briefly
drops during a domain reload.

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

This pipeline builds 2D games EXCLUSIVELY — if anything renders as 3D
geometry or the camera is Perspective instead of Orthographic, report
that as an issue even if the gameplay otherwise works.

Use the funplay-unity MCP tools (enter_play_mode, simulate_key_press/
simulate_key_combo, simulate_mouse_click/simulate_mouse_drag,
get_console_logs, capture_game_view, exit_play_mode) to play through the
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
