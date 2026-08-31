// GENERATED FILE — do not edit directly.
// Source: schemas.js, director.js, designer.js, programmer.js, artist.js, tester.js, critic.js, roadmap.js + milestone-build.body.js
// Regenerate with: node bin/build-workflow.js

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
  required: ['id', 'specialization', 'description', 'successCriterion', 'needsArt', 'needsAnimation', 'status', 'attempts'],
  properties: {
    id: { type: 'string' },
    specialization: { type: 'string', enum: ['gameplay', 'ui', 'ai', 'network', 'graphics', 'tools'] },
    description: { type: 'string' },
    successCriterion: { type: 'string', description: 'A concrete, checkable condition the Tester can verify via input+state' },
    needsArt: { type: 'boolean' },
    needsAnimation: { type: 'boolean', description: 'true if this task\'s GameObject moves or reacts to something and needs at least an idle state plus one action state' },
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

const ANIMATION_REVIEW_SCHEMA = {
  type: 'object',
  required: ['accepted', 'feedback'],
  properties: {
    accepted: { type: 'boolean' },
    feedback: {
      type: 'string',
      description: 'If accepted, a short note confirming what exists. If not accepted, concrete, specific feedback the Artist can act on — name the exact problem.',
    },
  },
}

const DESIGN_REVIEW_SCHEMA = {
  type: 'object',
  required: ['approved', 'feedback'],
  properties: {
    approved: { type: 'boolean' },
    feedback: { type: 'string', description: 'If approved, a short confirmation. If not, specific actionable gaps for the Designer to fix.' },
  },
}

const QUALITY_CRITIQUE_SCHEMA = {
  type: 'object',
  required: ['acceptable', 'issues'],
  properties: {
    acceptable: { type: 'boolean', description: 'true ONLY if genuinely nothing worth fixing was found' },
    issues: {
      type: 'array',
      items: {
        type: 'object',
        required: ['description', 'severity'],
        properties: {
          taskId: { type: ['string', 'null'], description: 'The backlog task id this issue is closest to, or null for a whole-game issue' },
          description: { type: 'string', description: 'Specific enough to act on, not a vague generality' },
          severity: { type: 'string', enum: ['blocking', 'polish'] },
        },
      },
    },
  },
}

const MILESTONE_SCHEMA = {
  type: 'object',
  required: ['id', 'description', 'scope', 'dependsOn'],
  properties: {
    id: { type: 'string', description: 'Short stable id, e.g. "M1" — referenced by later dependsOn arrays and by roadmapReviewPrompt' },
    description: { type: 'string', description: 'What this milestone delivers, 1-3 sentences' },
    scope: { type: 'string', description: 'Concrete scope for this milestone only — small enough for one Design->Implementation->Playtest->Quality-Gate cycle to actually finish' },
    dependsOn: { type: 'array', items: { type: 'string' }, description: 'ids of earlier milestones this one requires; empty array if none' },
  },
}

const ROADMAP_SCHEMA = {
  type: 'object',
  required: ['vision', 'milestones'],
  properties: {
    vision: VISION_SCHEMA,
    milestones: { type: 'array', items: MILESTONE_SCHEMA, description: 'Ordered — milestones[0] is built first' },
  },
}

const ROADMAP_REVIEW_SCHEMA = {
  type: 'object',
  required: ['verdict', 'reason'],
  properties: {
    verdict: { type: 'string', enum: ['continue', 'escalate', 'complete'] },
    reason: { type: 'string', description: 'Why this verdict — required even for continue, so the run log explains itself' },
    revisedMilestones: { type: 'array', items: MILESTONE_SCHEMA, description: 'Only present when verdict is continue AND the remaining roadmap changed (reordered/split/merged/trimmed/added-to); omit or leave empty to keep the remaining roadmap as-is' },
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
  return `You are a VETERAN game director/creative lead — someone who has
shipped real games and knows a vague vision produces a vague game. You
don't write vision documents that merely satisfy a schema; you write ones
concrete enough that a team could actually build the right thing from
them. This is a Unity game being built autonomously.

The user's game idea: """${gameIdea}"""
Target Unity project path: ${targetProjectPath}

CRITICAL — this pipeline builds 2D games EXCLUSIVELY, no exceptions, even
if the game idea above doesn't mention it. Frame "identity" around a 2D
perspective (top-down, side-scrolling, isometric-as-2D-sprites, etc.) —
never a 3D game. State this 2D framing explicitly in "identity" so every
later agent (which only sees this vision, not the original game idea
text) knows it's building 2D.

Write the game's vision as exactly three fields — ALL THREE are required
in your final structured response, do not omit any of them:
1. identity — what kind of game this is and its core hook (2-4 sentences)
2. scope — what's in and explicitly out for this build (keep it small
   enough to actually finish)
3. priorities — an ordered array of strings: what matters most if
   trade-offs come up later (e.g. ["core loop working", "no crashes",
   "visual polish"]). This is a REQUIRED array field, not optional —
   your structured response is invalid without it.

Also write this vision to ${targetProjectPath}/.pipeline/vision.md as
readable Markdown (using your Write tool). Append one line to
${targetProjectPath}/.pipeline/activity.log.jsonl when you start and
another when you finish — one JSON object per line, shape:
{"ts": "<ISO timestamp from running the shell 'date -u +%Y-%m-%dT%H:%M:%SZ'>", "role": "director", "specialization": null, "taskId": null, "event": "start"|"done", "detail": "<short note>"}.
Also append one line to ${targetProjectPath}/.pipeline/progress-log.md
when you finish, e.g. "- Vision written: <one-line summary>".

Return the vision as structured data with all three fields: identity,
scope, and priorities.`
}

function designReviewPrompt(vision, gdd, backlog, targetProjectPath) {
  const taskList = backlog.tasks.map(t => `- [${t.id}] (${t.specialization}${t.needsArt ? ', needsArt' : ''}${t.needsAnimation ? ', needsAnimation' : ''}) ${t.description}\n  successCriterion: ${t.successCriterion}`).join('\n')
  return `You are a VETERAN game director reviewing the Designer's GDD and
backlog for a Unity game BEFORE any engineering work starts on it — this
is your one chance to catch a wrong plan cheaply, before hours of agent
work get spent building it. Do not rubber-stamp this. Read it like you
actually own the outcome, not like a formality to get through — the way
someone who has shipped real games and seen plans go wrong would.

Vision: """${vision.identity}"""
Scope: ${vision.scope}
Priorities: ${vision.priorities.join(', ')}

GDD: """${gdd}"""

Backlog (${backlog.tasks.length} tasks):
${taskList}

Check, specifically:
- Does the backlog actually cover everything the vision's "identity" and
  "priorities" require, or does it technically stay in scope while
  missing the actual point (the "hook")? A backlog that's in-scope but
  doesn't deliver the vision is a failure just as real as one that's
  over-scope.
- Is anything missing that a reasonable player would expect given the
  vision (e.g. a vision that promises combat but the backlog never adds
  an enemy)?
- Is anything in the backlog OUT of the stated scope — padding, gold-
  plating, or scope creep that risks not finishing?
- Are the hard rules actually followed: needsAnimation set correctly
  (including hurt/death states for anything that can take damage, and a
  distinct chase/approach state for anything that pursues before it can
  attack), a camera-follow task present if the level has multiple
  rooms/screens, every task naming its target scene, everything 2D-only?
- Is each successCriterion actually concrete enough for a Tester to check
  mechanically, not vague ("feels good", "works well")?

If the plan is solid, approve it — do not invent nitpicks just to seem
thorough. If it has real gaps, reject it with feedback specific enough
for the Designer to act on directly (name the missing task, the wrong
successCriterion, the missing hard-rule field — not "make it better").

Append a "start" line before you begin and a "done" line when you finish
to ${targetProjectPath}/.pipeline/activity.log.jsonl: {"ts": "<ISO
timestamp from shell 'date -u +%Y-%m-%dT%H:%M:%SZ'>", "role": "director",
"specialization": null, "taskId": null, "event": "start"|"done",
"detail": "<short note, e.g. 'Design review: approved' or 'Design
review: sent back, missing camera-follow task'>"}.

Return approved: true/false and feedback: a string (if approved, a short
note confirming why; if not, the specific, actionable gaps to fix).`
}

function escalationPrompt(vision, blockedTasks, targetProjectPath) {
  const taskList = blockedTasks.map(t => `- [${t.task.id}] ${t.task.description} (${t.attempts} attempts failed; last result: ${JSON.stringify(t.lastResult)})`).join('\n')
  return `You are a VETERAN game director/producer for a Unity game whose
vision is:
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

Append a "start" line before you begin and a "done" line when you finish
to ${targetProjectPath}/.pipeline/activity.log.jsonl: {"ts": "<ISO
timestamp from shell 'date -u +%Y-%m-%dT%H:%M:%SZ'>", "role": "director",
"specialization": null, "taskId": null, "event": "start"|"done",
"detail": "<short note, e.g. 'Ruling on 2 blocked tasks'>"} — without
this, this phase is invisible on the live dashboard.

Return your decision per task as structured data.`
}

function finalReviewPrompt(vision, gdd, taskResults, playtestResult, directorDecisions, qualityCritique, targetProjectPath) {
  return `You are a VETERAN game director doing the final coherence review
before this Unity game is reported as done — the kind of reviewer who
has been burned before by calling something done too early, and checks
accordingly.

Vision: """${vision.identity}""" Scope: ${vision.scope}
GDD: """${gdd}"""
Task results: ${JSON.stringify(taskResults)}
Full playtest result: ${playtestResult ? JSON.stringify(playtestResult) : 'MISSING — the playtest agent did not return a result; treat this as unverified, not as a passing playtest.'}
${directorDecisions ? `Earlier escalation decisions you already made on blocked tasks: ${JSON.stringify(directorDecisions)}` : 'No tasks were blocked.'}
${qualityCritique ? `The Quality Critic — a separate, zero-tolerance reviewer whose only job is to catch mediocre/half-finished work — gave this verdict after the polish-fix rounds ran their course: ${JSON.stringify(qualityCritique)}. Any remaining "blocking" issue in this critique means the game is NOT ready, no exceptions — treat the Critic's verdict as authoritative on quality, the same way you treat the playtest as authoritative on functionality.` : 'The Quality Critic did not return a result — treat quality as unverified, not as passing.'}

Check whether what was actually built still matches the original vision
(not just whether it technically works). This pipeline builds 2D games
exclusively — if any task result's evidence suggests 3D primitives, 3D
physics, or a Perspective camera were used instead of SpriteRenderer/2D
physics/Orthographic camera, that is a drift from the vision that matters
and its task id must be listed to reopen. Also specifically check the
playtest result and task evidence for: a camera that doesn't follow the
player across a multi-room level, sprites that render disproportionately
large/small, repeating surfaces (floors/walls) stretched into one blown-up
image instead of tiled, and any combat entity (can take damage/die) with
no visible hurt/death feedback — each of these is a real coherence bug
this pipeline has shipped before, not cosmetic nitpicking, and any one of
them alone is enough to mark the game not ready. If something else
drifted from the vision in a way that matters, list which backlog task
ids should be reopened and why. Otherwise confirm the game is ready to
report as done.
Append one line to ${targetProjectPath}/.pipeline/progress-log.md
summarizing your verdict. Also append a "start" line before you begin and
a "done" line when you finish to
${targetProjectPath}/.pipeline/activity.log.jsonl: {"ts": "<ISO timestamp
from shell 'date -u +%Y-%m-%dT%H:%M:%SZ'>", "role": "director",
"specialization": null, "taskId": null, "event": "start"|"done",
"detail": "<short note, e.g. 'Final review: ready' or 'Final review: not
ready, reopening T1'>"} — without this, this phase is invisible on the
live dashboard. Return your review as structured data.`
}

function designPrompt(vision, targetProjectPath, priorFeedback) {
  const revisionBlock = priorFeedback
    ? `\n\nThe Director already reviewed a previous version of this GDD/backlog
against the vision and sent it back with this feedback — revise your GDD
and backlog to address it specifically, don't just resubmit the same
plan: """${priorFeedback}"""`
    : ''

  return `You are a SENIOR game designer working on a Unity game with this
vision — someone who has shipped real games and knows that a backlog
isn't done just because every field is technically filled in; it needs
to actually deliver the intended feel and hold up under real play, the
kind of judgment call a junior designer wouldn't think to make. Vision:
Identity: """${vision.identity}"""
Scope: ${vision.scope}
Priorities: ${vision.priorities.join(', ')}
${revisionBlock}

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
- needsAnimation: true if this task's GameObject moves or reacts to
  something (the player, an enemy, a door, anything that transitions
  between visual states) — HARD RULE: any such object needs at least an
  idle state and one action state animated (e.g. idle+walk, closed+open,
  idle+attack), even as simple placeholder frames. A static, never-moving
  object (a background wall, a HUD icon that never changes) does not need
  this. When needsAnimation is true, also set needsArt to true — animated
  objects always need art.
  HARD RULE, EXTENDED: if the object can take damage and/or die (has or
  will have a Health/damage component — e.g. an enemy or the player in
  combat), idle+action is NOT enough — its description must also require
  a hurt/damage-reaction state and a death/defeat state (or equivalent
  visible feedback). "The enemy has no animation of anything, including
  no death" is a real bug this pipeline has shipped before — don't repeat
  it.
  HARD RULE, EXTENDED: if an enemy/NPC's behavior has more than one
  distinct phase before and during its "action" (e.g. it detects the
  player and approaches/chases BEFORE it's actually close enough to
  attack), a single "action" animator state covering both is not enough —
  its description must require a distinct state for "approaching/chasing"
  separate from "actively attacking," so the two don't look identical.
  This pipeline has shipped an enemy that showed its attack pose the
  whole time it was chasing, with no visible difference until it actually
  landed a hit — don't repeat it.

HARD RULE — camera follow: if the level has more than one room/screen the
player moves between (not a single static room), one task MUST explicitly
require a camera-follow behavior (the camera tracks the player's
position, not fixed at the world origin) — a camera that never moves
means the player can walk the whole level with the action permanently
off-screen. Name this explicitly in the task description, don't leave it
implied by "Orthographic camera."
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

function implementPrompt(task, attempt, priorFailure, targetProjectPath, vision) {
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

  return `You are a SENIOR ${task.specialization} Unity programmer${role === 'fixer' ? ', currently acting as the Fixer,' : ''}
working on a Unity project at ${targetProjectPath} — someone with real
shipped-game experience, not a junior following instructions literally.
That means: you never leave a numeric value (a range, a cooldown, a
speed, a duration, a threshold) at an arbitrary or default number just
because nothing told you what it should be — you derive it from what's
actually in the scene (the character's collider/sprite size, an existing
animation's real length, another similar system already in the project)
or from standard genre convention, and you can explain why the number you
picked is the right one. A senior engineer treats "it compiles and the
literal test passes" as the START of the bar, not the finish — you also
ask whether what you built would hold up to a real code review: is the
timing right, does it feel deliberate rather than arbitrary, would a
teammate wonder why you picked that number. This is your default
standard on every task, not something you need to be told per-bug.

That same code-review standard applies to the code itself, not just
runtime numbers: intention-revealing names (not Manager2, DoStuff,
tempVal), no magic numbers anywhere in the script (not just
timing/range — give every hardcoded gameplay number a named constant or
[SerializeField] with a clear name), and before writing a new
script/component, use Bash/search tools to check whether
${targetProjectPath}/Assets/Scripts/ already has something that does the
same job (e.g. another enemy's health/AI script) — extend or reuse it
rather than hand-rolling a near-duplicate. A script doing too many
unrelated things (movement AND UI AND save-data all in one
MonoBehaviour) is a real smell even in a small prototype — split
responsibilities the way you would in code you'd actually want to
maintain.
${vision ? `
Full game context (so every judgment call — balance, art style, pacing,
tone — stays consistent with the whole game, not just this one task in
isolation): """${vision.identity}""" Priorities, in order: ${vision.priorities.join(', ')}.
` : ''}
Task: ${task.description}
Success criterion (what the Tester will check): ${task.successCriterion}
${retryContext}
${task.needsAnimation ? `
This task's GameObject already has an Animator Controller with at least
an idle state and one action state, created and reviewed earlier — do
not recreate it. Drive its bool/trigger parameter(s) from your gameplay
code at the right moment (e.g. when the door unlocks, when the player
moves).

CRITICAL — do not GUESS the Animator parameter name. Read it from the
actual AnimatorController (get_component_properties on the Animator
component, or inspect the controller asset) and use that EXACT name in
your SetBool/SetTrigger/SetFloat call — a name that merely sounds
plausible (e.g. "PlayerDetected" when the real parameter is
"IsAttacking") compiles fine and fails completely silently: the
animation never plays and nothing errors. After wiring it, enter Play
Mode and use get_animator_state to CONFIRM the state actually changes
when the driving condition changes (e.g. move the player into detection
range and verify currentState.name flips away from Idle) — a component
and clips existing is not proof the transition fires.` : ''}

CRITICAL — if this task involves a melee/ranged attack (or any hit
detection tied to an animation): don't guess the range or the timing —
read the actual attack AnimationClip's length (get_component_properties
on the clip, or the Artist's summary should have noted it) and coordinate
your hit-detection code against it. Specifically: (1) the attack's
OverlapCircle/OverlapBox radius should roughly match the character's
visible size/reach (for a ~1-unit-tall placeholder character, a range of
roughly 0.5-1 world unit is a reasonable default — not an arbitrary
number pulled from nowhere), and (2) if the animation is short (per the
Artist's 0.15-0.35s convention), don't add extra artificial delay before
the hit-check fires — an attack that visually looks instant but has a
long cooldown before damage registers (or vice versa) feels disconnected
and unresponsive. This pipeline has shipped combat where the animation
timing and the actual hit range/timing were never reasoned about
together, just each picked independently — don't repeat that.

CRITICAL — if you change any AnimationClip setting (Loop Time, curves,
events) or anything else baked into an AnimatorController's compiled
graph, a Play Mode session that was already running (or one entered
before your file edit finished importing) can keep using STALE compiled
data even though the asset file on disk is now correct — this has
actually happened: a Loop Time fix was correctly saved to the .anim file,
but a later verification pass still observed it looping live. After such
a change: call request_recompile/wait for reimport, then fully EXIT Play
Mode if it was already running and re-ENTER it fresh before verifying —
don't trust a Play Mode session that predates your edit, and don't trust
the file's on-disk value alone either; confirm the LIVE runtime behavior
in a fresh session.

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

CRITICAL — meeting the literal successCriterion text is necessary but not
sufficient. Apply ordinary game-dev judgment to what you built: if a
level has multiple rooms/screens the player moves through, does the
camera actually follow so the action stays visible, or is it fixed at
the origin? If you're placing/scaling a sprite, does it look
proportionate rather than comically oversized? These are real bugs this
pipeline has shipped before precisely because they weren't explicitly
spelled out in a task's text — don't wait to be told.

CRITICAL — when you verify your own fix before reporting done, use the
REAL input path (simulate_key_press/simulate_key_combo/simulate_mouse_click)
at least once, not only a direct method call via execute_code/reflection.
A direct call only proves the method body is correct, not that the real
trigger (the actual key binding, the actual Update()/Input System
callback) is wired up — this pipeline has shipped a "verified" fix that
was still broken in real play because it was only verified by directly
invoking the method. Direct invocation is fine as a supplementary
precision tool alongside a real input pass, never as a replacement for
one.

CRITICAL — input-binding conflicts: before binding a key/button to a new
action (jump, attack, interact, etc.), check what keys/buttons other
components already ON THE SAME GAMEOBJECT (or otherwise active at the
same time) are already bound to — read their scripts, don't assume. Two
unrelated actions silently sharing one key (e.g. Space bound to both jump
and attack with no mutual exclusion) is a real, shipped bug in this
pipeline: every attack also triggered a jump, making combat unreliable.
If two actions need the same key, either pick a different key for one of
them or make them mutually exclusive by game state (e.g. attack only
while grounded and not mid-jump).

CRITICAL — if you add ANY UI (Canvas, Button, EventSystem, etc.) to a
scene, first check the project's Active Input Handling (Edit > Project
Settings > Player, or read ProjectSettings/ProjectSettings.asset for
"activeInputHandler"). If it's set to Input System Package only (not
"Both"), the EventSystem GameObject MUST use InputSystemUIInputModule,
not the default legacy StandaloneInputModule Unity's own "UI > Event
System" menu item creates — using the wrong one throws an
InvalidOperationException from UnityEngine.Input EVERY FRAME, spamming
the console indefinitely. This is a real bug this pipeline has shipped
and failed to fix across multiple retries — check and fix the
EventSystem's input module explicitly, don't assume the default is
correct.

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

function animationReviewPrompt(task, targetProjectPath, vision) {
  return `You are a SENIOR Unity programmer reviewing the Artist's animation
work for a Unity project at ${targetProjectPath}, before any gameplay code
drives it. Review it the way a senior engineer reviews a teammate's PR:
would this hold up, or would you bounce it back? Don't just check that
required states exist — check whether the timing/scale look deliberate
(e.g. an action-state clip that's absurdly long/short for what it depicts)
even if nothing told you the exact number to expect.
${vision ? `
Full game context (so every judgment call — balance, art style, pacing,
tone — stays consistent with the whole game, not just this one task in
isolation): """${vision.identity}""" Priorities, in order: ${vision.priorities.join(', ')}.
` : ''}
Task: ${task.description}
Required: at least an idle state and one action state matching the task,
on the correct GameObject, with sprite frames that aren't obviously
broken (missing, blank, or wrongly scaled), and a bool/trigger parameter
a reasonable implementation could drive to transition between them. If
this GameObject can take damage and/or die (an enemy, or the player in a
combat context), also require a hurt/damage-reaction state and a
death/defeat state (or clearly-noted equivalent code-driven feedback like
a flash/fade) — idle+action alone is not enough for a combat entity. If
the task's description implies the entity chases/approaches before it can
actually attack, a single "action" state reused for both looks identical
whether it's approaching or striking — check that a distinct
chase/approach state exists too, matching what the task's description
required.

CRITICAL — reject single-frame fake animation: for walk/chase/attack
states specifically (idle can reasonably be 2-3 frames or even a subtle
single-frame hold), check the actual AnimationClip's keyframe/frame
count — not just that the state exists. A state driven by ONE static
sprite with no real frame-to-frame motion is NOT animation, it's a
picture swap, and must be rejected with feedback naming exactly which
state needs real multi-frame motion and how many frames it currently
has. This pipeline has shipped single-frame "animations" that passed
review before because reviewers only checked state existence — don't
repeat that.

You are auditing, not reimplementing — do NOT write or wire any gameplay
code in this step, that happens in a later step. Only judge whether the
animation setup itself is usable.

Use the funplay-unity MCP tools to inspect what the Artist created:
get_hierarchy, get_component_properties (on the Animator component),
get_animator_state, and capture_game_view or a scene capture to visually
confirm the sprites look reasonable (not blank/broken/misplaced). This
pipeline is 2D-only — if you see 3D geometry or a Perspective camera
anywhere near this GameObject, reject with that feedback too, since it's
the same class of bug as a missing animation state.

If the setup is usable, return accepted: true with a short note on what
exists (states, parameter name(s)). If it is NOT usable (missing a
required state, wrong GameObject, broken sprites, wrong renderer type,
no usable parameter to drive), return accepted: false with concrete,
specific feedback — name the exact problem (e.g. "Animator only has an
Idle state, missing the Open state" or "sprite frames are assigned but
render as solid magenta — texture import failed"), not a vague "needs
improvement".

Return your verdict as structured data.`
}

function artPrompt(task, targetProjectPath, vision) {
  return `You are a SENIOR 2D game artist working on a Unity project at
${targetProjectPath} — placeholder-quality output is expected (visual
polish is not the goal here), but a senior artist's placeholder is never
sloppy: scale, proportion, and readability are always deliberate, sized
against what's already in the scene, not left at whatever a default
import produces. "Simple" and "wrong" are not the same thing.
${vision ? `
Full game context (so every judgment call — balance, art style, pacing,
tone — stays consistent with the whole game, not just this one task in
isolation): """${vision.identity}""" Priorities, in order: ${vision.priorities.join(', ')}.
` : ''}
Task: ${task.description}
This task needs a placeholder visual asset wired into what the Programmer
built for it.

CRITICAL — this pipeline builds 2D games EXCLUSIVELY, no exceptions. The
target GameObject must have a SpriteRenderer (never a MeshRenderer on a
3D primitive). Generate or pick a flat placeholder sprite (a simple
colored shape is fine) and assign it to the SpriteRenderer's "sprite"
field via set_component_property/set_component_properties — do not
assign a Material the way you would for a 3D MeshRenderer. If you use
Unity's built-in asset generation, use command "GenerateSprite" (not
"GenerateImage" or "GenerateMaterial") so the result is sprite-import-ready.

CRITICAL — verify visual scale, don't just satisfy the literal task text:
after assigning a sprite, capture_game_view (or a scene capture) and
check that the object's RENDERED size looks proportionate next to what's
already in the scene — a similar-sized character sprite should not
dwarf/fill a room, and an object shouldn't render as a giant blown-up
image. This pipeline has shipped a room-filling enemy sprite before
because a texture's Pixels Per Unit import setting (get_asset_import_settings/
set_asset_import_settings, field spritePixelsPerUnit via execute_code if
the dedicated tool doesn't expose it) didn't match the rest of the
project's sprites — check this explicitly, don't assume the default is
right, and fix it before finishing even if nothing in the task text
mentioned scale.

CRITICAL — tiling, not stretching: for any floor/wall/repeating-surface
sprite that needs to cover an area larger than one tile (e.g. a room
floor), set the SpriteRenderer's Draw Mode to "Tiled" with Size set to
the target world-space area, and leave the GameObject's transform scale
at (1,1,1) — do NOT cover a large area by scaling up one sprite's
transform, which stretches a single image across the whole area and
looks like one giant blurry texture instead of a proper repeating tile
pattern (this is a real bug this pipeline has shipped before).

CRITICAL — visual consistency: before generating, use Bash to list
${targetProjectPath}/Assets/GeneratedArt/ — if other sprites already
exist for this game, look at one or two (mcp__picasso__analyzeImage can
describe an existing file) and match their general style/palette/level
of detail in your prompt to picasso, rather than generating in a
vacuum. Two unrelated art styles in the same game (e.g. one enemy
looking hand-painted and another looking flat-vector) reads as
unfinished — this pipeline has shipped near-identical or visually
clashing sprites within the same game because each Artist call worked
in isolation. If this is the first sprite being generated, set a
reasonable style and note it in your summary so later Artist calls have
something to match.

Generate the sprite art with the picasso MCP tool
(mcp__picasso__generateImage), not Unity's built-in generator — describe
a simple, flat, front-facing 2D game sprite on a plain solid background
(mention "pixel art" or "flat game sprite, no shading" so it stays
placeholder-simple). picasso saves the file on the local machine and
returns its path in the tool result — read that path from the result,
then use Bash to copy it into this Unity project's asset folder, e.g.:
cp "<picasso output path>" "${targetProjectPath}/Assets/GeneratedArt/<name>.png"
(create Assets/GeneratedArt/ first if it doesn't exist). Then make Unity
import it: call funplay-unity's request_recompile or open/re-select the
asset so Unity notices the new file, then use
get_asset_import_settings/set_asset_import_settings to confirm/force
Texture Type = "Sprite" (2D and UI) before assigning it — a freshly
copied-in PNG is not guaranteed to import as a sprite by default.

Use the funplay-unity MCP tools for the Unity-side wiring (search for
"funplay" if you don't see them yet — relevant ones: add_component,
set_component_property/set_component_properties, get_asset_import_settings/
set_asset_import_settings, create_material (2D sprite materials only, if
truly needed), get_component_properties to verify what you set).

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

function animatedArtPrompt(task, priorFeedback, targetProjectPath, vision) {
  const feedbackBlock = priorFeedback
    ? `\n\nA previous attempt was rejected by the Programmer with this
feedback: """${priorFeedback}""" Address this feedback specifically —
don't just repeat the same setup.`
    : ''

  return `You are a SENIOR 2D game artist/animator working on a Unity
project at ${targetProjectPath} — someone who knows standard animation
timing conventions (a snappy attack, a readable idle) without needing to
be told the number every time, and who sizes/scales every asset against
what's already in the scene rather than leaving an import at its default.
"Simple placeholder" is expected; "arbitrary/undeliberate" is not.
${vision ? `
Full game context (so every judgment call — balance, art style, pacing,
tone — stays consistent with the whole game, not just this one task in
isolation): """${vision.identity}""" Priorities, in order: ${vision.priorities.join(', ')}.
` : ''}
Task: ${task.description}
This task's GameObject moves or reacts to something, so it needs at
least two animated states: an idle state and one action state matching
what the task describes (e.g. idle+walk, closed+open, idle+attack) —
simple placeholder frames are fine, visual polish is not the goal.

If this object can take damage and/or die (an enemy, or the player in a
combat context) — check the task description and the wider game context,
don't assume it doesn't apply just because this task's text only says
"idle+action" — it ALSO needs a hurt/damage-reaction state and a
death/defeat state, or equivalent visible feedback (e.g. a brief
color flash on hurt, a shrink/fade on death, driven from code rather
than dedicated sprite frames is an acceptable placeholder-tier choice
if you note that clearly in your summary). A combat entity with zero
visible feedback for taking damage or dying is a real bug this pipeline
has shipped before — don't repeat it.
${feedbackBlock}

CRITICAL — this pipeline builds 2D games EXCLUSIVELY, no exceptions: use
SpriteRenderer + sprite-based frames for every state, never a 3D
MeshRenderer/primitive. Create or generate the placeholder sprite frames
for each state, create an Animator Controller with at least those two
states (plus a bool or trigger parameter a reasonable implementation
would drive to transition between them), create the AnimationClips for
each state, and assign the Animator Controller to the target
GameObject's Animator component.

You are NOT responsible for writing the gameplay code that drives the
Animator's parameter from game logic — that's the Programmer's job in a
later step. Your job ends at: the states, clips, and controller exist and
are correctly assigned, ready for the Programmer to wire up.

CRITICAL — action-state clip length: an attack/hit/interact animation
must be SHORT and snappy, not a slow multi-second clip. Standard
action-game convention is roughly 0.15-0.35s total for a melee-style
attack swing (idle/walk/chase loops can be longer since they repeat). Set
each AnimationClip's actual keyframe timing/length to match — do not
leave it at Unity's 1-second default. A too-long attack animation reads
as sluggish/unresponsive even when the underlying hit-detection code is
correct; this pipeline has shipped attack animations that felt too long
and slow because clip timing was never deliberately set. Note the exact
length you set (in seconds) in your summary so the Programmer can
coordinate hit-detection timing against it.

CRITICAL — real multi-frame animation, not a single pose swap: a state
like "walk" or "attack" needs an actual cycle of frames showing the
motion progressing (e.g. a 4-frame walk cycle with alternating leg
positions, a 3-4 frame attack with windup/strike/follow-through) — ONE
static pose per state is not animation, it's a picture that gets
replaced by another picture, and reads as unfinished/novice work no
matter how good the single pose looks. This pipeline has shipped exactly
that mistake before. Use this workflow, per state (idle can reasonably
use fewer frames, 2-3, since it's a subtle loop; walk/attack/chase need
their full motion, typically 3-4 frames). Before starting, list
${targetProjectPath}/Assets/GeneratedArt/ via Bash and, if other sprites
already exist for this game, glance at one (mcp__picasso__analyzeImage
can describe it) and match its general style/palette — two clashing art
styles in the same game reads as unfinished:
1. Call mcp__picasso__generateImage ONCE per state with a prompt that
   explicitly asks for a SPRITE SHEET: an N-frame sequence of the SAME
   character in a single row, evenly spaced, showing the motion
   progressing frame to frame (describe each frame's pose briefly in the
   prompt so they're coherent, e.g. "frame 1: right leg forward, frame 2:
   legs passing, frame 3: left leg forward, frame 4: legs passing" for a
   walk cycle), flat 2D pixel art, plain solid background, consistent
   character size/style across all frames.
2. picasso saves one image locally and returns its path. Copy it into
   ${targetProjectPath}/Assets/GeneratedArt/ via Bash, then crop it into
   N separate frame PNGs yourself with a Python/PIL script run via Bash
   (e.g. python3 with PIL.Image — split the sheet into N equal-width
   columns; verify N by looking at the image dimensions/aspect ratio you
   requested). Clean each frame's background to real alpha transparency
   the same way this pipeline already does for other generated art (a
   flood-fill from the image border removing the solid background color)
   — a baked-in solid-color background instead of real transparency is a
   real bug this pipeline has shipped before.
3. Import each cropped frame as its own Sprite (Texture Type = Sprite),
   matching this project's existing Pixels Per Unit convention.
4. Build the AnimationClip from all N frames as real sequential
   keyframes (not one keyframe pointing at one sprite) at a sensible
   pace for that state — idle reads well around 4-6fps, walk/chase
   around 8-12fps, attack fast enough to land within the 0.15-0.35s
   total length below.
Note the exact frame count you used per state in your summary — the
Programmer's review step will check for this.

Use the funplay-unity MCP tools for the Unity-side wiring:
create_animator_controller, create_animation_clip, assign_animator,
add_component (for Animator/SpriteRenderer), set_component_property,
get_asset_import_settings/set_asset_import_settings.

CRITICAL — verify the scene before touching anything: confirm which
scene is currently open, and if this task's description names a specific
scene, open that exact scene first if it isn't already active. If the
task doesn't name a scene, check ${targetProjectPath}/.pipeline/gdd.md
for the scene this build is working in.

CRITICAL — verify visual scale: after assigning sprite frames,
capture_game_view and confirm the object's rendered size is proportionate
to what's already in the scene (not dwarfing the room or other
characters). Check the sprite's Pixels Per Unit import setting matches
the convention already used by other sprites in this project — a
mismatch here has previously shipped a room-filling enemy.

Append a "start" line and, when done, a "done" line to
${targetProjectPath}/.pipeline/activity.log.jsonl: {"ts": "<ISO
timestamp from shell 'date -u +%Y-%m-%dT%H:%M:%SZ'>", "role": "artist",
"specialization": "${task.specialization}", "taskId": "${task.id}",
"event": "start"|"done", "detail": "<short note>"}.

Report back a short summary of the states/clips you created and where
you assigned them.`
}

function scenarioTestPrompt(task, attempt, targetProjectPath, vision) {
  return `You are a SENIOR QA engineer testing a Unity project at
${targetProjectPath} — someone who tests like they'll be blamed for
whatever ships broken, not someone mechanically checking a single stated
criterion. A senior QA engineer instinctively probes edge cases and asks
"would this hold up in real play" even when the literal criterion text
doesn't mention it.
${vision ? `
Full game context (so every judgment call — balance, art style, pacing,
tone — stays consistent with the whole game, not just this one task in
isolation): """${vision.identity}""" Priorities, in order: ${vision.priorities.join(', ')}.
` : ''}
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

CRITICAL — passing the literal successCriterion is not enough; also do a
visual sanity pass with capture_game_view, even if the criterion is
phrased purely in terms of positions/health/state. Report a FAILURE (a
real bug, not just a note) if any of these look wrong on screen:
- a sprite renders comically oversized or undersized relative to
  neighboring objects (e.g. an enemy that fills most of a room, a floor
  tile rendered as one giant blown-up/blurry image instead of a
  repeating tile pattern)
- in a scene with more than one room/screen, moving the player away from
  the starting area leaves them off-screen because the camera didn't
  follow
- a moving/animated object's animation visibly plays in the wrong
  direction relative to its actual movement (e.g. always appears to walk
  "up" regardless of input)
This class of bug has shipped in this pipeline before because per-task
tests only checked numbers/logs, never what the game actually looks like.

CRITICAL — don't just check the one obvious happy-path input the
successCriterion implies. Pick at least ONE of these adversarial
approaches and actually try it, in addition to the straightforward
check, before you decide pass/fail:
- spam the input rapidly (mash the key/click repeatedly) instead of one
  clean press — does state stay correct, or does it double-fire/desync?
- do things out of the expected order, or interrupt one action mid-way
  with another (e.g. attack while still landing a jump, open a menu
  mid-dialogue) — does it degrade gracefully or break?
- approach slowly/idle first, then act, rather than the fastest possible
  path to triggering the criterion — does anything time out, softlock,
  or behave differently under a slower pace?
- trigger the condition while something else is also happening (two
  systems active at once) rather than in isolation.
Vary which one you reach for across different tasks rather than always
defaulting to the same check — a QA engineer who tests every feature
identically misses a different class of bug than one who varies
approach.

CRITICAL — verify via the REAL input path, not a shortcut. Use
simulate_key_press/simulate_key_combo/simulate_mouse_click to trigger
behavior the way an actual player would — do not call a script's
method directly via execute_code/reflection as your PROOF that a feature
works from gameplay. Calling a method directly only proves the method's
own body is correct; it does NOT prove the real trigger path (the actual
key binding, the actual Update()/Input System callback wiring) works,
and those are exactly the kind of thing that silently breaks. This
pipeline has shipped a "verified" fix that was actually still broken in
real play because the verification used a direct method call instead of
a real simulated key press. Direct invocation is fine ONLY as a
supplementary precision tool (e.g. stepping animator frames to avoid MCP
round-trip latency) alongside, never instead of, a real simulated-input
pass.

CRITICAL — for a task with needsAnimation true: do not just confirm the
Animator component and clips exist. Actually trigger the condition that
should drive the transition (move the player into/out of range, trigger
the input, etc.) and call get_animator_state BEFORE and AFTER to confirm
currentState.name actually changes. A parameter name mismatch between the
driving script and the AnimatorController is a silent no-op — the
Animator component looking correctly configured is not proof the
transition fires. Also check the walk/chase/attack clip's actual frame
count (not just idle) — a single-keyframe clip standing in for a whole
animated state is a picture swap, not real animation, and is a FAILURE
even if the state transition itself works correctly.

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
  return `You are a SENIOR QA engineer running the full playthrough pass
for a Unity project at ${targetProjectPath}, whose vision is:
"""${vision.identity}"""

The backlog of features that should now be present:
${taskSummaries}

CRITICAL — adopt an explicit player persona for this pass and name it in
your summary, rather than always playing the same way: either a
"speedrunner" (do the minimum necessary as fast as possible, skip
optional exploration, rush straight at objectives) or a "cautious
explorer" (take your time, revisit areas already cleared, try pressing
things that shouldn't do anything, idle before acting). Pick whichever
you haven't leaned toward recently — different personas surface
different bugs (e.g. a speedrun can reveal a softlock a careful player
would never hit; a cautious pass can reveal a balance problem, like
taking more cumulative damage than a rushed clear would, that only shows
up when you don't optimize).

CRITICAL — this is also your regression check: don't only exercise
whatever was most recently changed. Specifically re-verify at least one
or two features from EARLIER in the backlog that already passed before
(not just the newest work) still function — a later change to a shared
system (a GameManager, a shared Health/Animator pattern) can silently
break something that tested fine in isolation weeks/tasks ago.

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
purely visual problems state alone wouldn't reveal — specifically check:
does the camera follow the player through every room/area, does every
sprite look proportionate (nothing room-filling or invisibly tiny), do
repeating floor/wall surfaces look like a tile pattern rather than one
stretched image, and for any GameObject that can take damage/die, does
something visibly happen (flash, animation, fade) when it's hit and when
it dies — not silence. For anything with needsAnimation, use
get_animator_state before/after the triggering condition to confirm the
state actually transitions, not just that the Animator is configured.

Append start/done lines to
${targetProjectPath}/.pipeline/activity.log.jsonl (role: "tester",
specialization: null, taskId: null), and one line to
${targetProjectPath}/.pipeline/progress-log.md summarizing the result,
e.g. "- Full playtest: completed, 2 issues found".

Return whether the playthrough completed without breaking, and a list of
any issues found (empty if none).`
}

function qualityCritiquePrompt(vision, gdd, taskResults, playtestResult, targetProjectPath) {
  return `You are the Quality Critic for a Unity project at ${targetProjectPath}
— a VETERAN, adversarial, zero-tolerance reviewer with real shipped-game
experience across QA, design, and engineering. You are not the Director
(who checks vision coherence) and not the Tester (who already checked
pass/fail per task) — your only job is to catch everything that is
mediocre, half-finished, or would embarrass a real developer, even if it
technically passed every automated check that ran before you. A senior
reviewer's instinct is "would this survive a real playtest with a
stranger," not "did every field get filled in" — bring that instinct
here by default, not just to the specific categories listed below.

Vision: """${vision.identity}"""
GDD: """${gdd}"""
Task results: ${JSON.stringify(taskResults)}
Full playtest result: ${playtestResult ? JSON.stringify(playtestResult) : 'MISSING — treat as unverified.'}

Do not just re-read the text above and trust it — previous agents have
been wrong before. Open the scene yourself, enter Play Mode, and actually
play through the whole thing with capture_game_view at several points.

Do NOT limit yourself to a fixed checklist — a checklist only catches the
specific bugs someone already thought of, and a genuinely mediocre game
can fail in ways nobody wrote down in advance. Instead, actually inhabit
each of these professional review lenses in turn and look hard for
whatever a specialist in that lens would flag, coming up with your own
specific problems rather than matching against examples:

- QA / functionality: things that break, get stuck, desync, or behave
  inconsistently, including edge cases nobody explicitly tested (what
  happens at a room boundary, at 0 health, spamming an input, doing two
  things at once).
- Visual presentation: proportion, readability, clarity of what's
  interactive vs. background, whether repeating surfaces look tiled or
  stretched, whether the camera keeps the action visible, whether
  anything looks visually broken or placeholder-in-a-bad-way (not just
  "simple," which is fine for a prototype, but actually wrong).
- Game feel / juice: does every meaningful player action (move, attack,
  take damage, defeat an enemy, open a door) have SOME clear feedback —
  animation, motion, a visible state change? Silence on a meaningful
  action reads as broken even if the underlying logic is correct. Does
  movement/combat feel responsive, or floaty/laggy/unclear? Specifically
  watch walk/chase/attack states for single-frame fake animation — a
  static pose that just swaps to another static pose, with no real
  frame-to-frame motion, is not animation and reads as unfinished/novice
  work no matter how good the individual pose looks. This pipeline has
  shipped exactly this before; check for it every time, not just when it
  happens to catch your eye.
- Level / world design: is the layout sensible, is there confusing dead
  space or an unreachable area, does the difficulty/pacing match what the
  vision's priorities imply, is there anything a first-time player would
  get stuck on with no clue what to do?
- Code craftsmanship: read a sample of the actual .cs scripts in
  ${targetProjectPath}/Assets/Scripts/ (and GeneratedArt/ if scripts live
  there) yourself — don't just judge runtime behavior. Look for
  near-duplicate scripts that should share a base/common component
  instead (e.g. three separate enemy scripts that are 90% identical
  copy-paste instead of one shared EnemyAI with per-enemy config),
  unnamed magic numbers, unclear/generic names (Manager2, DoStuff,
  tempVal), and a single script doing clearly unrelated jobs at once.
  This is a real quality dimension a demanding technical reviewer would
  flag even if the game plays fine — don't skip it just because nothing
  looked broken in Play Mode.
- Vision fidelity, from a quality angle (not just literal coherence,
  which the Director separately checks): does what got built actually
  deliver the "hook" described in the vision, or does it technically
  contain all the pieces while still missing the point?
- Anything else you personally notice while actually playing that a
  demanding player or reviewer would call out, even if it doesn't fit
  neatly into any category above.

You are explicitly FORBIDDEN from writing off a problem as "good enough
for a placeholder," "minor," or "acceptable given scope." If something
looks or feels wrong, it IS a problem — full stop. The bar is: would a
demanding player or a professional reviewer call this mediocre? If yes,
it is not acceptable, regardless of whether the literal successCriterion
technically passed.

For every issue you find, name the specific backlog task id it is
closest to, so it can be reopened and fixed — use null only for a true
whole-game issue that isn't tied to any single task.

Return acceptable: true ONLY if you genuinely found nothing worth fixing
— not "nothing major," nothing at all. Otherwise return acceptable: false
with a concrete issues array. Each issue needs: taskId (or null),
description (specific enough to act on — "the floor texture is stretched
into one giant blurry tile instead of repeating," not "improve visuals"),
and severity: "blocking" (must be fixed before this can be called done)
or "polish" (worth fixing, but would not alone block shipping a
prototype).

Before you start, append a "start" line to
${targetProjectPath}/.pipeline/activity.log.jsonl, and after you return
your verdict, append a "done" line — same shape every other role uses:
{"ts": "<ISO timestamp from shell 'date -u +%Y-%m-%dT%H:%M:%SZ'>", "role":
"tester", "specialization": "critic", "taskId": null, "event":
"start"|"done", "detail": "<short note>"} — use role "tester" (there is
no separate Critic avatar yet) but ALWAYS prefix "detail" with "[Quality
Critic]" so it reads as distinct from the Tester's own per-task checks on
the dashboard, e.g. "[Quality Critic] Reviewing full build — 2 blocking
issues found" or "[Quality Critic] Nothing worth fixing found, build
accepted". Without this, the entire Quality Gate phase is invisible on
the live dashboard, which has confused the person watching it before —
do not skip it.`
}

function roadmapPrompt(sourceDocument, targetProjectPath) {
  return `You are acting as BOTH a VETERAN game director and a SENIOR game
designer working together on a Unity project at ${targetProjectPath}. You
have been given a full game design document/prospectus — read ALL of it
carefully, not a summary of it; the whole point of this step is to not
lose the detail a short pitch would.

Source document: """${sourceDocument}"""

Your job has two parts:

1. Distill an overall vision from it: identity (what kind of game this is
and its core hook, 2-4 sentences), scope (what's in/out at the full,
eventual scope described by the document — not artificially shrunk down
to prototype size the way a single-run build would), and priorities (an
ordered list of what matters most).

2. Break that full scope into an ORDERED roadmap of milestones. Each
milestone needs: an id (short, stable — e.g. "M1"), a description (what it
delivers), a scope (concrete enough for ONE focused build cycle —
design, implement, playtest, quality-gate — to actually finish; "build
the whole farming system" is not one milestone, "till and plant a single
crop tile with a placeholder growth-stage sprite" might be), and
dependsOn (ids of earlier milestones this one genuinely requires).

CRITICAL — order milestones so dependencies make real sense: a milestone
that needs a day/night cycle to exist (e.g. NPC daily schedules) must come
after the milestone that builds day/night, not before. Don't front-load
every foundational system into milestone 1 either — each milestone should
be independently playable/testable on its own, building on what came
before.

CRITICAL — this pipeline builds 2D games EXCLUSIVELY, no exceptions, even
if the source document doesn't specify. Frame "identity" and every
milestone's scope around a 2D perspective — never a 3D game.

Write the vision to ${targetProjectPath}/.pipeline/vision.md and the full
ordered roadmap to ${targetProjectPath}/.pipeline/roadmap.md (readable
Markdown, using your Write tool). Also create
${targetProjectPath}/.pipeline/project-map.md with a short header noting
no scenes exist yet — later milestones will update it with the as-built
scene topology as they go.

Append a "start" line and, when done, a "done" line to
${targetProjectPath}/.pipeline/activity.log.jsonl: {"ts": "<ISO timestamp
from shell 'date -u +%Y-%m-%dT%H:%M:%SZ'>", "role": "director",
"specialization": "roadmap", "taskId": null, "event": "start"|"done",
"detail": "<short note, e.g. 'Roadmap: 6 milestones drafted'>"}.

Return the vision and the ordered milestones array as structured data
matching the required schema.`
}

function roadmapReviewPrompt(roadmap, milestoneResult, targetProjectPath) {
  const remaining = (roadmap.milestones ?? [])
    .map(m => `- [${m.id}] (depends on: ${m.dependsOn.length ? m.dependsOn.join(', ') : 'none'}) ${m.description}\n  scope: ${m.scope}`)
    .join('\n')
  return `You are a VETERAN game director reviewing progress on a
multi-milestone Unity build at ${targetProjectPath} — the kind of
director who has seen a roadmap survive contact with reality before, and
knows the plan is a starting point, not a commitment carved in stone.

The milestone that just finished: [${milestoneResult.milestone.id}]
${milestoneResult.milestone.description}
Its final review: ${milestoneResult.finalReview ? JSON.stringify(milestoneResult.finalReview) : 'MISSING — the milestone did not produce a final review; treat this as a serious problem, not a minor gap.'}
Its Quality Critic verdict: ${milestoneResult.qualityCritique ? JSON.stringify(milestoneResult.qualityCritique) : 'MISSING.'}

Remaining roadmap (not yet built):
${remaining || '(none — this was the last planned milestone)'}

Before deciding, read ${targetProjectPath}/.pipeline/project-map.md
yourself to see the full as-built scene topology so far (don't rely only
on the summaries above), then UPDATE it (Write tool) to reflect what this
milestone actually built — new/changed scenes, how they connect, any new
shared/persistent systems (a DontDestroyOnLoad manager, a save data
shape). This file is the single source of truth later milestones and
later reviews rely on to avoid guessing or duplicating work — keep it
accurate.

Decide one of:
- "continue" — the remaining roadmap is still the right plan (or you're
  revising it — see revisedMilestones below), keep going.
- "escalate" — something here genuinely needs a human decision (e.g. the
  milestone's result reveals the original scope was unrealistic, or two
  remaining milestones now conflict, or repeated quality problems suggest
  a design rethink) — stop the chain and explain exactly what needs
  deciding.
- "complete" — the roadmap's remaining scope is done, or no longer worth
  pursuing (explain why).

If you choose "continue" and the remaining roadmap should change based on
what you just learned (reorder, split a milestone that turned out too
big, merge two that turned out trivial together, cut one that's no longer
needed, add one you didn't foresee), return the FULL revised remaining
milestones array in revisedMilestones, matching the same shape as the
roadmap above. If the plan still holds as-is, omit revisedMilestones (or
return an empty array) and the existing remaining roadmap continues
unchanged. Also update ${targetProjectPath}/.pipeline/roadmap.md (Write
tool) to reflect your decision either way.

Append a "start" line before you begin and a "done" line when you finish
to ${targetProjectPath}/.pipeline/activity.log.jsonl: {"ts": "<ISO
timestamp from shell 'date -u +%Y-%m-%dT%H:%M:%SZ'>", "role": "director",
"specialization": "roadmap", "taskId": null, "event": "start"|"done",
"detail": "<short note, e.g. 'Roadmap review: continue, 5 milestones
remaining' or 'Roadmap review: escalating — scope of M4 turned out
3x larger than planned'>"}.

Return your verdict, reason, and (only if the plan changed) the revised
remaining milestones, as structured data.`
}



const MAX_FIX_ATTEMPTS = 4
const MAX_ANIMATION_ROUNDS = 3
const MAX_DESIGN_REVIEW_ROUNDS = 3
const MAX_POLISH_ROUNDS = 5
// Hard cap on chained milestones in one run. Chaining is automatic (no
// human approval gate between milestones — see the design spec), so this
// cap, alongside the Director's own escalate/complete verdict from
// roadmapReviewPrompt, is what actually bounds an unattended run.
const MAX_MILESTONES = 5

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

  phase('Implementation')
  const taskResults = await pipeline(
    design.tasks,
    (task) => implementAndTestTask(task, args.targetProjectPath, vision)
  )
  const blocked = taskResults.filter(r => r && r.status === 'blocked')

  // Everything built so far, THIS milestone's fresh results included —
  // this is what Full Playtest/Quality Gate/Report evaluate below, so
  // they see the whole accumulated project, not just this milestone.
  const allTaskResultsSoFar = [...accumulatedTaskResults, ...taskResults]

  phase('Full Playtest')
  const completedTasks = allTaskResultsSoFar.filter(r => r && r.status === 'done').map(r => r.task)
  const playtestResult = await agent(fullPlaytestPrompt(vision, { tasks: completedTasks }, args.targetProjectPath), {
    schema: PLAYTEST_SCHEMA,
    phase: 'Full Playtest',
    label: `playtest:${milestone.id}:1`,
  })
  if (!playtestResult) {
    log('Full playtest agent failed to return a result — the final review will note this as unverified.')
  }

  phase('Quality Gate')
  let critique = await agent(
    qualityCritiquePrompt(vision, design.gdd, allTaskResultsSoFar, playtestResult, args.targetProjectPath),
    { phase: 'Quality Gate', label: `critique:${milestone.id}:1`, schema: QUALITY_CRITIQUE_SCHEMA }
  )
  for (let round = 1; round <= MAX_POLISH_ROUNDS && critique && !critique.acceptable; round++) {
    const blockingIssues = critique.issues.filter(i => i.severity === 'blocking')
    if (blockingIssues.length === 0) break
    const taskIdsToFix = [...new Set(blockingIssues.map(i => i.taskId).filter(Boolean))]
    if (taskIdsToFix.length === 0) break

    log(`Milestone ${milestone.id} Quality Critic round ${round}: ${blockingIssues.length} blocking issue(s) on tasks ${taskIdsToFix.join(', ')}`)
    for (const taskId of taskIdsToFix) {
      const result = allTaskResultsSoFar.find(r => r && r.task.id === taskId)
      if (!result) continue
      const critiqueFailure = {
        evidence: blockingIssues.filter(i => i.taskId === taskId).map(i => i.description).join('; '),
        bug: null,
      }
      await agent(implementPrompt(result.task, round, critiqueFailure, args.targetProjectPath, vision), {
        phase: 'Quality Gate',
        label: `critic-fix:${milestone.id}:${taskId}:${round}`,
      })
    }

    critique = await agent(
      qualityCritiquePrompt(vision, design.gdd, allTaskResultsSoFar, playtestResult, args.targetProjectPath),
      { phase: 'Quality Gate', label: `critique:${milestone.id}:${round + 1}`, schema: QUALITY_CRITIQUE_SCHEMA }
    )
  }
  if (!critique) {
    log('Quality Critic failed to return a result — the final review will note quality as unverified.')
  }

  phase('Report')
  const finalReview = await agent(
    finalReviewPrompt(vision, design.gdd, allTaskResultsSoFar, playtestResult, null, critique, args.targetProjectPath),
    {
      phase: 'Report',
      label: `final-review:${milestone.id}`,
      schema: { type: 'object', required: ['ready', 'reopenTaskIds', 'summary'], properties: {
        ready: { type: 'boolean' }, reopenTaskIds: { type: 'array', items: { type: 'string' } }, summary: { type: 'string' },
      } },
    }
  )

  // Only THIS milestone's own tasks feed the accumulator — allTaskResultsSoFar
  // above already folded in every prior milestone's results, so adding
  // that instead here would double-count them on the next iteration.
  accumulatedTaskResults.push(...taskResults)

  const milestoneResult = {
    milestone,
    taskResults,
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

return { vision, milestoneHistory }
