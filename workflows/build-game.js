// GENERATED FILE — do not edit directly.
// Source: schemas.js, mlTraining.js, director.js, designer.js, programmer.js, artist.js, tester.js, critic.js + build-game.body.js
// Regenerate with: node bin/build-workflow.js

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
    taskKind: {
      type: 'string',
      enum: ['standard', 'ml-training-launch', 'ml-training-monitor', 'ml-training-integrate-verify'],
      description: 'Defaults to "standard" (the normal Programmer/Artist/Tester implementation cycle) when omitted — every task in every other milestone this pipeline has ever built is "standard". Only set this for a milestone specifically about ML-Agents training: "ml-training-launch" for the task that exports a standalone build and starts an mlagents-learn run in the background; "ml-training-monitor" for the task that polls that run\'s convergence and decides when to stop it; "ml-training-integrate-verify" for the task that assigns the resulting trained model and verifies its measured hunt/evasion success rates via real Play Mode.',
    },
    requiresExclusiveEditor: {
      type: 'boolean',
      description: 'Set true ONLY for a task whose successCriterion itself demands one continuous, uninterrupted Play Mode session end-to-end (a full-loop/whole-game regression pass, e.g. "the entire loop completes in one continuous Play Mode session with zero console errors") — a criterion that is unverifiable if any other task\'s agent enters/exits Play Mode, loads a scene, or triggers a recompile on the same shared Unity Editor at any point during it. All other tasks, including ordinary ones that also use Play Mode to test one feature, default to false/omitted and run in the normal concurrent batch — this flag is specifically about session CONTINUITY being part of the pass/fail condition, not about whether Play Mode is used at all.',
    },
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
          relatedTaskIds: {
            type: 'array',
            items: { type: 'string' },
            description: 'Only present when this issue is CROSS-CUTTING — the same underlying concept/state is duplicated or inconsistent across more than one task\'s own code (e.g. two scripts each independently computing world bounds). List every OTHER task id (besides taskId) whose code is part of the same root cause, so they get fixed together, not as isolated patches. Omit for an issue confined to one task.',
          },
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

const FINAL_REVIEW_SCHEMA = {
  type: 'object',
  required: ['ready', 'reopenTasks', 'summary'],
  properties: {
    ready: { type: 'boolean' },
    reopenTasks: {
      type: 'array',
      items: {
        type: 'object',
        required: ['taskId', 'reason'],
        properties: {
          taskId: { type: 'string' },
          reason: {
            type: 'string',
            description: 'Concrete, actionable reason this specific task is being reopened — the ONLY context a fresh Fixer with no memory of this review will get, so name the actual problem (and what would fix it, if known) rather than a vague label like "vision drift" or "quality issue". If this reopen is driven by the Quality Critic, reuse the Critic\'s own specific issue text rather than summarizing it away.',
          },
          correctedSuccessCriterion: {
            type: 'string',
            description: 'ONLY set this when the task\'s ORIGINAL successCriterion is itself factually wrong — objectively incompatible with a verified functional constraint (e.g. it names a specific key binding that provably collides with an existing control), not merely hard to satisfy or a matter of taste. Give the corrected criterion text verbatim, ready to replace the stored one. Leave unset for an ordinary reopen (a real bug, a missed detail, a quality issue) where the original criterion is still correct and only the implementation needs to change — setting this for anything less than a proven factual error would let a reopen silently rewrite a task\'s requirements instead of fixing the code.',
          },
        },
      },
    },
    summary: { type: 'string' },
  },
}

const TRAINING_LAUNCH_SCHEMA = {
  type: 'object',
  required: ['launched', 'detail'],
  properties: {
    launched: {
      type: 'boolean',
      description: 'True ONLY if a live mlagents-learn process was actually verified running (process alive, log file growing) — not merely that the launch command returned without error. False if the standalone build failed, the trainer died on startup, or aliveness could not be confirmed; the workflow blocks the task (and the dependent monitor/integrate tasks) on false rather than letting a later task monitor a run that never started.',
    },
    runId: { type: 'string', description: 'The mlagents-learn --run-id used, matching the run-info json file written for the monitor task.' },
    logdir: { type: 'string', description: 'The results/TensorBoard logdir the convergence-check script will read.' },
    pid: { type: 'number', description: 'PID of the launched mlagents-learn process, so the monitor task can terminate it once it reaches a terminal verdict.' },
    detail: { type: 'string', description: 'What was verified (or, when launched is false, concretely what went wrong).' },
  },
}

const TRAINING_MONITOR_SCHEMA = {
  type: 'object',
  required: ['verdict', 'action', 'reason'],
  properties: {
    verdict: {
      type: 'string',
      enum: ['plateau', 'plateau_degenerate', 'diverge'],
      description: 'The deterministic convergence-check script\'s own verdict, copied verbatim — never re-derived from raw numbers by the agent itself. "plateau" is a genuine converged, non-degenerate result. "plateau_degenerate" is a flat reward curve with near-zero hunt attempts (the pure-forager equilibrium) — NOT a success even though the reward curve looks fine. "diverge" is reward collapse.',
    },
    action: {
      type: 'string',
      enum: ['proceed_to_integration', 'retry', 'escalate'],
      description: '"proceed_to_integration" only for verdict "plateau". "retry" for "plateau_degenerate" or "diverge" on the FIRST attempt (one adjusted-config retry, per the spec\'s bounded-retry design — mirrors this pipeline\'s existing MAX_MILESTONE_REOPEN_ROUNDS pattern). "escalate" if this is already a retry attempt and it also ended in "plateau_degenerate" or "diverge" — never a second automatic retry.',
    },
    reason: {
      type: 'string',
      description: 'Concrete, numeric — cite the actual observed rolling-mean/std/episode-length/role-balance numbers the script reported, not a vague restatement of the verdict.',
    },
    adjustedConfig: {
      type: 'string',
      description: 'Present only when action is "retry" — the SPECIFIC config change being made (e.g. "widened curriculum stage 1 power-variance range from X-Y to X2-Y2" or "raised hunt-success reward from 0.3 to 0.5"), per the spec\'s constraint that a retry must be a concrete, bounded, documented adjustment, not open-ended re-engineering.',
    },
  },
}

const MILESTONE_SNAPSHOT_SCHEMA = {
  type: 'object',
  required: ['id', 'gdd', 'tasks'],
  properties: {
    id: { type: 'string', description: 'The milestone id this snapshot belongs to, e.g. "M1"' },
    gdd: { type: 'string', description: 'This milestone\'s own GDD text, as last written' },
    tasks: { type: 'array', items: BACKLOG_SCHEMA.properties.tasks.items, description: 'This milestone\'s own task list, each with its final status/attempts' },
  },
}

const RESUME_STATE_SCHEMA = {
  type: 'object',
  required: ['mode'],
  properties: {
    mode: {
      type: 'string',
      enum: ['fresh', 'resume', 'escalated'],
      description: '"fresh" = no prior state, run the normal roadmap-from-scratch path. "resume" = prior state found, pick the chain back up. "escalated" = the chain is waiting on a human decision, do not touch anything.',
    },
    escalationReason: { type: 'string', description: 'Only present when mode is "escalated" — why the chain needs a human decision' },
    vision: { ...VISION_SCHEMA, description: 'Only present when mode is "resume" — the vision loaded from vision.md' },
    remainingMilestones: {
      type: 'array',
      items: MILESTONE_SCHEMA,
      description: 'Only present when mode is "resume" — every not-yet-done milestone, in roadmap order, the "current" one (if any) first',
    },
    doneMilestones: {
      type: 'array',
      items: MILESTONE_SNAPSHOT_SCHEMA,
      description: 'Only present when mode is "resume" — one entry per milestone already marked "done", loaded from its persisted snapshot',
    },
    currentMilestoneSnapshot: {
      type: ['object', 'null'],
      properties: MILESTONE_SNAPSHOT_SCHEMA.properties,
      description: 'Only present when mode is "resume". The "current" milestone\'s own snapshot if one is usable, otherwise null (meaning: treat it as not-yet-started and design it fresh)',
    },
  },
}

// A reopened task carries the Director's own reason for reopening it —
// without it the agent only sees the task's original, already-"met"
// successCriterion and just redoes the same thing (the same failure mode
// fixed for standard tasks in "Carry a concrete per-task reason through
// the final-review reopen loop").
function reopenBlock(reopenReason) {
  return reopenReason
    ? `
CRITICAL — this task is being RE-RUN because the Director's final review
reopened it. The reason given was: """${reopenReason}"""
Address that specific complaint — do not simply repeat the original run
and re-report the same outcome.
`
    : ''
}

function launchTrainingPrompt(task, targetProjectPath, vision, reopenReason) {
  return `You are a SENIOR ${task.specialization} Unity/ML-Agents engineer
working on ${targetProjectPath} — this task exports a standalone Player
build of the current scene and launches an ML-Agents PPO training run
against it in the background, per
${targetProjectPath}/../auto-game-build/docs/superpowers/specs/2026-09-09-ml-agents-training-design.md
("Training architecture" / "Execution").
${vision ? `
Full game context: """${vision.identity}""" Priorities, in order: ${vision.priorities.join(', ')}.
` : ''}
Task: ${task.description}
Success criterion: ${task.successCriterion}
${reopenBlock(reopenReason)}
CRITICAL — export a STANDALONE build, do not train against the live
Editor. Live Editor Play Mode in this environment has a known OS-focus
dependency that a headless training run must not inherit, and training
needs native simulation speed with no MCP/agent round-trip per step.
Use the funplay-unity MCP tools (search for "funplay" if you don't see
them yet) to find a build-export tool; if none exists, use execute_code
to call UnityEditor.BuildPipeline.BuildPlayer with a Windows/Mac/Linux
standalone target matching this machine, output path
${targetProjectPath}/Builds/TrainingPlayer/. Confirm the build actually
produced an executable before proceeding — do not assume BuildPipeline
succeeded just because it returned without throwing.

CRITICAL — launch mlagents-learn with these settings EXPLICITLY set in
the trainer config YAML, not left at defaults:
- engine_settings.time_scale: at least 20 (ML-Agents' own default) —
  raise it further for this lightweight 2D scene if the training
  machine's CPU allows; nobody watches training happen, there's no
  reason to run at 1x.
- engine_settings.no_graphics: true — nothing needs rendering during
  training.
- network_settings.normalize: false — this design's observations are
  already manually bounded to [0,1]/[-1,1] via explicit formulas in the
  spec; stacking ML-Agents' own running normalization on top is an
  unnecessary source of early-training instability.
- max_steps: set from real research into a comparable ML-Agents
  multi-agent example's actual step count (the spec explicitly warns
  the mlagents-learn default of 500,000 is two orders of magnitude too
  low for this task class) — do NOT leave this at default.
Launch via Bash: \`mlagents-learn <config>.yaml --env=<build path>
--run-id=<a stable id derived from "${task.id}"> --num-envs=<N, bounded
by this machine's actual CPU core count — check with
\`sysctl -n hw.ncpu\` or \`nproc\`, don't guess> --no-graphics &\` — run
it as a background process (redirect stdout/stderr to a log file under
${targetProjectPath}/.pipeline/ml-training/), do not block this task
waiting for training to finish; that's the monitor task's job.
If a previous run with the same run-id already has checkpoints (this
task is being re-run after an interruption), pass --resume instead of
starting fresh.

CRITICAL — write ${targetProjectPath}/.pipeline/ml-training/${task.id}-run.json
with the exact run-id, the mlagents-learn results/TensorBoard logdir
path, the build path used, the trainer config's max_steps value, and the
PID of the launched mlagents-learn process (capture it from the shell,
e.g. \`echo $!\` right after backgrounding it, and sanity-check it with
\`ps -p <pid>\` before writing it down) — the monitor task (a separate,
later task) reads this file to know what to watch, what step ceiling to
check against, and which process to terminate when training is done.
Shape: {"runId": "...", "logdir": "...", "buildPath": "...",
"maxSteps": <number>, "pid": <number>}. Use your Read/Write tools for
this, not execute_code. This is the ONLY run-info file for this
milestone — if the monitor task later relaunches training under a new
run-id, it overwrites this same file.

Append a "start" line and, when the process is confirmed launched (not
when training finishes — that's a different task), a "done" line to
${targetProjectPath}/.pipeline/activity.log.jsonl: {"ts": "<ISO
timestamp from shell 'date -u +%Y-%m-%dT%H:%M:%SZ'>", "role":
"programmer", "specialization": "${task.specialization}", "taskId":
"${task.id}", "event": "start"|"done", "detail": "<short note, e.g.
'Launched training run <run-id>, num-envs=N, max_steps=X'>"}.

Report back as structured data: "launched" (true ONLY if you verified
the process is actually alive and its log file is growing — not merely
that the launch command returned without error; report false if the
build failed, mlagents-learn died on startup, or you could not confirm
a live process), "runId", "logdir", "pid", and "detail" explaining what
you verified or what went wrong.`
}

function monitorConvergencePrompt(task, targetProjectPath, vision, attemptNumber, reopenReason) {
  const isRetry = attemptNumber >= 2
  return `You are monitoring an ML-Agents training run for
${targetProjectPath}, per
${targetProjectPath}/../auto-game-build/docs/superpowers/specs/2026-09-09-ml-agents-training-design.md
("Convergence monitoring").
${vision ? `
Full game context: """${vision.identity}""" Priorities, in order: ${vision.priorities.join(', ')}.
` : ''}
Task: ${task.description}
Success criterion: ${task.successCriterion}
This is monitoring attempt ${attemptNumber}${isRetry ? ' (the ONE bounded retry after an earlier plateau_degenerate/diverge verdict — see below)' : ' (the first attempt)'}.
${reopenBlock(reopenReason)}
CRITICAL — find the run-info file by PATTERN, not by a guessed task id:
list \`${targetProjectPath}/.pipeline/ml-training/*-run.json\` and read
the MOST RECENTLY MODIFIED one (there is normally exactly one; if a
retry attempt rewrote it, the newest is the live run). Do NOT construct
a filename from a task id — the launch task is not necessarily task 1 of
this milestone, so its id is not predictable from yours. That file gives
you the run-id, the TensorBoard logdir, the config's max_steps, and the
PID of the running mlagents-learn process.

CRITICAL — you NEVER judge convergence by reading raw Mean
Reward/Std/episode-length numbers yourself. Loop: run
\`python3 <path to auto-game-build repo>/tools/training_convergence_check.py
--logdir <logdir from the run-info file> --max-steps <maxSteps from the
run-info file>\` via Bash (use the World project's own venv Python at
.venv-mlagents/bin/python3, which already has tensorboard installed),
wait a reasonable interval (e.g. \`sleep 300\`) between checks so you're
not spamming the filesystem, and repeat until the script's own JSON
output reports a verdict other than "continue" (that field is called
"verdict" in its JSON output — it is the ONLY thing you read to decide
what happened, not the underlying reward numbers). Passing --max-steps
is REQUIRED, not optional: it is what makes the script report a terminal
verdict once the run exhausts its step ceiling instead of saying
"continue" forever.

BOUNDED polling — this can take a genuinely long time (potentially
hours), so keep looping within this same task rather than giving up
after a few checks, but the loop is NOT unbounded: run at most 200
convergence checks in this single task invocation. Count them. If you
reach that cap while the script is still saying "continue", stop
polling, terminate the training process (see below), and return verdict
"plateau_degenerate" with action ${isRetry ? '"escalate"' : '"retry"'}
and a reason stating you hit the 200-check polling cap without a
terminal verdict — same bounded-retry discipline this task's
one-retry-then-escalate rule already follows. Also bail out this same
way if the PID from the run-info file is no longer alive (\`ps -p
<pid>\`) and the script still reports "continue" — the run died without
converging; never keep polling a dead process.

Once the script reports a terminal verdict, decide the action per this
table (this is the ENTIRE decision logic — do not improvise a different
mapping):
- verdict "plateau" -> action "proceed_to_integration".
- verdict "plateau_degenerate" or "diverge"${isRetry ? `, and this IS
  attempt ${attemptNumber} (a retry) -> action "escalate". Do NOT set
  action to "retry" here — the one automatic retry budget for this
  training run is already used; a second automatic retry is never
  allowed, escalate to a human via the Director's existing blocked-task
  path instead.` : ` -> action "retry". Pick ONE concrete, bounded
  adjustment (not open-ended re-engineering) and state it in
  "adjustedConfig": either widen the curriculum's early-stage
  encounter-forcing ranges further than the first attempt used, or
  raise the hunting/evading reward magnitudes relative to foraging
  (staying within the spec's ≤1.0-magnitude, [-1,1]-per-decision
  constraints). Then actually relaunch training with that one change:
  first terminate the CURRENT training process (\`kill <pid from the
  run-info file>\`, then confirm with \`ps -p <pid>\` that it is gone —
  \`kill -9\` if it isn't) so two runs never compete for the machine,
  then start the new run the same way the launch task did, with the
  adjusted config and a NEW run-id.
  CRITICAL — before you return, OVERWRITE the run-info json file you
  read at the start of this task with the new run's runId, logdir,
  maxSteps and pid. The next convergence check finds that file by
  "most recently modified" and would otherwise read the STALE first
  run's logdir and monitor data that can never change again. Verify the
  rewrite by reading the file back and confirming it names the new
  run-id.`}

CRITICAL — stopping training: once you reach a TERMINAL decision
(action "proceed_to_integration" or "escalate"), your LAST action before
returning is to terminate the training process: \`kill <pid from the
run-info file>\`, then confirm with \`ps -p <pid>\` that it is no longer
running (escalate to \`kill -9 <pid>\` if it survives). Nothing else in
this pipeline ever stops mlagents-learn — left running it keeps burning
CPU and writing checkpoints, competing with the Play Mode verification
that runs next. Do NOT kill it when your action is "retry" (that branch
relaunches training on purpose, per above).

Report your decision as structured data: verdict (copied verbatim from
the script), action, reason (cite the script's own numeric reason text,
not a restatement), and adjustedConfig (only when action is "retry").`
}

function trainedModelVerificationPrompt(task, attempt, targetProjectPath, vision) {
  return `You are a SENIOR QA engineer verifying a newly-trained
ML-Agents model for ${targetProjectPath}, per
${targetProjectPath}/../auto-game-build/docs/superpowers/specs/2026-09-09-ml-agents-training-design.md
("Model integration & verification").
${vision ? `
Full game context: """${vision.identity}""" Priorities, in order: ${vision.priorities.join(', ')}.
` : ''}
Task: ${task.description}
Success criterion: ${task.successCriterion}
This is check attempt ${attempt} for this task.

CRITICAL — checkpoint selection: do NOT simply use the last/highest-numbered
checkpoint from training. Read the role-balance telemetry (hunt
attempts/successes, forage/flee/engage fractions) for each saved
checkpoint and pick the one with the most balanced, non-degenerate role
distribution — per the spec, the final checkpoint can plausibly
correspond to a moment where hunting/evading signal had already started
thinning out (a one-way curriculum's "forgetting" risk) even if Mean
Reward looks fine there.

Copy the selected checkpoint's exported .onnx into
${targetProjectPath}/Assets/, and assign it to the trained agents'
Behavior Parameters component, model field, in Inference mode (not
Heuristic or Default).

CRITICAL — this is a MEASURED pass/fail, not a qualitative "looks
sensible" judgment. Imperfect behavior (a missed catch, a failed
evasion) is NORMAL and expected from a trained policy — it is NOT
automatically a bug the way it would be for deterministic rule-based
code. Do this instead:
1. Enter Play Mode and observe (or play against, if this involves the
   player) the trained agents for long enough to accumulate at least 15-20
   encounters (an "encounter" is defined the same way as in the reward
   function's EncounterTelemetry component: begins when a higher/lower-power
   agent enters immediate range with the established hysteresis
   margin/dwell-time/cooldown, ends on separation past that margin or on
   a catch) — not a fixed time window, since encounter rate varies and a
   fixed window could accumulate too few data points to mean anything.
2. Read the EncounterTelemetry log/counters via get_console_logs or
   get_component_properties (same tooling you already use for other
   verification tasks in this pipeline).
3. Compute hunt-success rate and evasion-success rate SEPARATELY — they
   are different skills; do not collapse them into one aggregate number,
   since that would hide a model that's only good at one.
4. PASS requires each rate to fall within an expected band: floor
   ~30-40% (below this, the model is barely functional — rule out with
   a FAIL), ceiling near 100% is treated as suspicious, not celebrated
   (investigate whether the encounter-difficulty configuration made that
   skill trivially easy, or something is exploiting the encounter/catch
   logic, before accepting it as a genuinely good result). Both bounds
   are starting points from the spec to tune against this run's actual
   numbers, not fixed truths — if the real observed rates cluster
   somewhere unexpected relative to this band, note that as evidence for
   revising the band, not automatically as a bug in the model.
5. If either rate falls outside the expected band, this is a real FAIL
   — report it with the actual observed numbers (encounters observed,
   successes, computed rate) as evidence, matching this pipeline's
   TEST_RESULT_SCHEMA bug-reporting convention.

Append a "start" line and, when done, a "done" line to
${targetProjectPath}/.pipeline/activity.log.jsonl: {"ts": "<ISO
timestamp from shell 'date -u +%Y-%m-%dT%H:%M:%SZ'>", "role": "tester",
"specialization": "${task.specialization}", "taskId": "${task.id}",
"event": "start"|"done", "detail": "<short note with the measured rates>"}.

You are also the only role that keeps ${targetProjectPath}/.pipeline/backlog.json
current for this task — after you decide pass/fail, read backlog.json,
find the task with id "${task.id}", set "attempts" to ${attempt} and
"status" to "done" if this passed (leave "todo" otherwise), and write
the file back, same as every other Tester task in this pipeline.

Return whether it passed, the measured evidence (both rates, with the
raw counts they're computed from), and — only if it did not pass — a
bug description citing the specific rate(s) outside the expected band.`
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
- For every task that creates a new scene/area or substantially
  populates one (a town, a hub, any space the player spends real time
  in): does its description name concrete atmosphere/decoration elements
  (specific props, decorative sprites, ground-texture variation), or does
  it just say "placeholder art"/"distinct visual style" and leave the
  actual dressing implicit? A scene with zero named decoration reads as
  "flat colored ground plus the minimum functional objects," not as the
  kind of place the vision describes — reject the backlog for this
  specifically, the same way you'd reject a missing camera-follow task,
  don't wave it through as a later polish concern.
- For every task whose action has an obvious physical impact (watering,
  harvesting, landing a hit, walking through mud/tall grass), does its
  description name a concrete particle/VFX effect (splash, dust puff,
  impact burst), or is that left implicit? Reject the backlog for this
  specifically if it's missing, the same way as missing decoration.
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

CRITICAL — the Critic's LATEST verdict overrides older evidence about the
SAME symptom: "Task results" above is the full accumulated history,
including earlier rounds' evidence text written before a bug was fixed —
that older text can still describe a symptom (e.g. "clipping," "wrong
color," "missing state") that a later fix already resolved. If the
Quality Critic's most recent pass explicitly states it could not
reproduce a specific issue, or reports zero blocking issues where an
earlier round once found one, treat THAT as the current, authoritative
state of that specific issue — do not reopen a task for it by pattern-
matching keywords in older, superseded task-result evidence. This
pipeline has reopened a task for a bug the Critic had just explicitly
reported as not reproducible in the same review, which wastes a reopen
round doing nothing (the Fixer has no live bug to find) and can exhaust
the reopen budget before a real remaining issue gets its turn. Only
reopen a task for a symptom the CURRENT round's Critic pass (or your own
fresh read of the current playtest result) actually still supports.

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
drifted from the vision in a way that matters, or the Quality Critic left
a blocking issue standing, list which backlog task ids should be reopened
and why. Otherwise confirm the game is ready to report as done.

CRITICAL — for every task you reopen, return a concrete, actionable
"reason" alongside its taskId (reopenTasks: [{taskId, reason}], not a
bare list of ids). The Fixer who picks this up next is a FRESH agent with
NO memory of this review and no access to what you're reading right now —
your "reason" text is the ONLY context they get for what to actually
change. "Vision drift" or "quality issue" is not a reason; name the
concrete problem (e.g. "HUD crop/money text has no outline/shadow/backing
panel, washes out against light ground tiles" or "camera never updates
position, player walks off-screen in room 2"), and if you already know
what would fix it, say so. If a task is being reopened because the
Quality Critic flagged it, reuse the Critic's own specific issue
description verbatim rather than paraphrasing it into something vaguer —
this pipeline has previously lost real critique detail this way, causing
the same reopened task to bounce through multiple rounds without the
actual complaint ever being addressed, because the Fixer had nothing
concrete to act on and just re-verified the task's original, already-
passing success criterion instead.

CRITICAL — taskId must be the EXACT id of a real task from the task
results you were given above (e.g. "M4-T4"), copied verbatim — never a
free-text label describing the problem (e.g. "player-collision fix" is
NOT a valid taskId). The reopen mechanism dispatches work by looking up
this exact id; an invented label matches nothing and the fix silently
never happens — the bug just resurfaces every review with no one ever
assigned to it. If a real bug doesn't cleanly belong to any single
existing task (the Quality Critic may have flagged it with taskId: null
for exactly this reason), do NOT invent a label — instead pick the
existing task whose code is most directly responsible for that behavior
and reopen that one, explaining in "reason" that the actual problem is
broader than that task's original successCriterion. Every reopenTasks
entry must resolve to a task id that already appears in the task results
above.

CRITICAL — if the reason you're reopening a task is that its OWN stored
successCriterion is factually wrong, not that the implementation fails
it: set "correctedSuccessCriterion" on that reopenTasks entry to the
corrected text. A criterion is factually wrong when it's objectively
incompatible with a verified functional constraint — e.g. it names a
specific key binding that provably collides with an existing control, so
literally satisfying the criterion as written breaks something else no
matter how it's implemented. This pipeline has lost real time to exactly
this: a task's successCriterion said "bind KeyCode.A", which collides
with WASD move-left; each Fixer who read the ORIGINAL criterion reverted
a working Tab-based fix back to the broken A binding, and the next
Critic/playtest caught it and changed it back — an unresolvable loop,
because no Fixer has authority to rewrite a task's own stored
successCriterion, only its implementation, and the stored text never
changed. Do NOT set correctedSuccessCriterion for an ordinary reopen (a
real bug, a missed detail, a quality issue) where the original criterion
is still correct and only the code needs to change — reserve it for a
proven factual error in the criterion text itself, since setting it
loosely would let a reopen silently rewrite a task's requirements instead
of fixing the implementation.

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
  HARD RULE, EXTENDED: whenever an action has an obvious physical impact
  on the world (watering a plant, harvesting a crop, landing a hit,
  walking across a distinct terrain type like mud or tall grass), its
  description must name a concrete particle/VFX effect to accompany it
  (a splash of droplets, a puff of dust, a burst of sparkles, impact
  particles) — set needsArt: true for it, since the effect needs at
  least a simple particle sprite/texture. Silence on an action with
  obvious physical impact reads as unfinished the same way a missing
  animation state does. Size the effect to the vision's own scope (a
  cozy, minimal game needs a small, simple particle burst, not a
  particle-heavy action-game VFX system) — the bar is "this specific
  action has SOME visible physical feedback," not maximum spectacle.
- CRITICAL — taskKind: leave this unset (it defaults to "standard", the
  normal Programmer/Artist/Tester cycle) for every task in every milestone
  EXCEPT one specifically about ML-Agents training. If — and only if —
  this milestone's scope is training a reinforcement-learning model (the
  environment C# code itself, e.g. the Agent/Academy scripts implementing
  observation/action/reward, is still a "standard" task; it's just normal
  C# game code verified the normal way), author exactly these three
  ADDITIONAL tasks in this order, each with the matching taskKind:
  1. taskKind "ml-training-launch" — exports a standalone build and starts
     the training run in the background.
  2. taskKind "ml-training-monitor" — polls the training run's convergence
     and decides when to stop it (this can take a genuinely long time;
     its successCriterion should describe reaching a definitive stop
     verdict, not a fixed duration).
  3. taskKind "ml-training-integrate-verify" — assigns the resulting
     trained model and verifies its measured hunt/evasion success rates
     in real Play Mode.
  These three have a real sequential dependency (launch, then monitor,
  then integrate) — describe that dependency in each task's description
  so it's clear to whoever reads the backlog later. The workflow enforces
  that sequencing itself: standard tasks still run concurrently through
  the Implementation phase's normal pipeline() call (which does NOT
  respect array order), and only once ALL of them have finished does it
  run the ml-training-* tasks one at a time, in the order you list them,
  skipping the rest of the chain if one comes back blocked. So the
  environment C# "standard" task is guaranteed to be done before the
  launch task starts — but two ml-training-* tasks are never run in
  parallel, and ordering between the three is exactly the order you
  write them in.
- CRITICAL — requiresExclusiveEditor: leave this unset (defaults to false)
  for virtually every task, including ordinary tasks that use Play Mode
  to test one feature — those are fine running concurrently with each
  other against the shared Unity Editor. Set it true ONLY for a task
  whose successCriterion itself requires one continuous, uninterrupted
  Play Mode session end-to-end (a whole-game/full-loop regression pass
  spanning multiple scenes/systems, worded like "the entire loop
  completes in one continuous Play Mode session"). Such a task cannot be
  validly verified while ANY other task's agent is also entering/exiting
  Play Mode, loading a scene, or triggering a recompile on the same
  shared editor mid-session — the workflow runs every requiresExclusiveEditor
  task strictly one at a time, after the rest of that milestone's
  concurrent standard tasks have all finished, specifically so it gets an
  uncontended editor. Do not set this on more than one or two tasks per
  milestone, and never on a task that only needs Play Mode for a single
  feature check.

HARD RULE — shared state gets ONE owner, everyone else reads it: whenever
more than one task will need the same underlying concept (world/level
bounds, a day/night or time-of-day state, an inventory/economy model, a
game-state flag like "is it currently night" or "is the shop open"),
decide explicitly which ONE task creates/owns that value (as a component,
ScriptableObject, or clearly-named static/singleton) and say so in ITS
description, then every OTHER task that needs the same concept must say
in its own description "read/derive this from <the owning task's
GameObject/component>, do not compute or hardcode your own version." This
pipeline has shipped a real bug from skipping this: a task painted a
40x40 ground area and, in the same breath, hardcoded an unrelated 18x18
movement boundary instead of deriving it from the ground it had just
sized — two numbers for the same concept, invented independently, never
reconciled. Do not let two tasks each invent their own version of the
same fact.

HARD RULE — never write a successCriterion that exact-matches a
CONCRETE list/count of dynamic content a future milestone could expand:
things like a named roster of characters ("dropdown options exactly
match {NPC_A, NPC_B, NPC_C}"), a fixed count of locations, or any other
content set this game's own scope implies will grow over time. This
pipeline has shipped exactly this bug: a successCriterion literally
named three placeholder test NPCs; a later milestone replaced them with
a real 10+ resident roster, and the ORIGINAL literal successCriterion
text — never a fact about the feature, just a snapshot of that day's
placeholder data — then failed a re-verification of a feature that
actually worked correctly, because nothing had authority to update the
stored criterion text itself. Instead, phrase it against the LIVE
source of truth, whatever it currently contains — "dropdown options
match the current character roster, however many entries it has" — the
same single-source-of-truth principle as the shared-state rule above,
applied to how you phrase the criterion itself, not just to the code
that will implement it.

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

HARD RULE — environmental richness is not optional polish, it is part of
delivering the vision: whenever a task creates a new scene/area or
substantially populates one (a town, a dungeon floor, a hub, any space
the player spends real time in), that task's description MUST name
concrete atmosphere/decoration elements to add — actual props sized to
the vision (e.g. "add 3-5 placeholder building silhouettes with distinct
window/door shapes," "scatter 6-10 decorative flower/rock/puddle sprites
across the walkable area, non-blocking (no collider)," "add ambient
ground-texture variation so it doesn't read as one flat color") — not
left implicit in a generic "placeholder art" or "distinct visual style"
phrase. A technically-correct empty space that is only differently
colored from its neighbor is a real failure to deliver the vision, even
if every literal successCriterion in the backlog passes — this pipeline
has shipped exactly this (a "town" that was flat ground plus one NPC,
technically distinct from the farm scene's color but with none of the
built-up, lived-in feel implied by "town"). Size the amount of
decoration to the vision's stated scope/priorities (a "cozy, minimal"
game needs a handful of well-placed details, not a dense scene), but
zero named decoration for a real player-facing space is never
acceptable. Purely functional/utility scenes with no player dwell time
(a loading scene, a hidden test harness) are exempt — say so explicitly
in that task's description if you're claiming the exemption, don't just
omit decoration silently.

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

function implementPrompt(task, attempt, priorFailure, targetProjectPath, vision, relatedTasks) {
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

  const relatedTasksBlock = relatedTasks && relatedTasks.length > 0
    ? `\n\nCRITICAL — this fix is part of a COORDINATED group, not an
isolated patch: the Quality Critic identified that this bug's root cause
spans more than one task's code. The other task(s) involved are:
${relatedTasks.map(t => `- [${t.id}] ${t.description}`).join('\n')}
Before you change anything, read the CURRENT code/scene state for all of
them (not just your own task) — the same underlying concept (a bounds
value, a shared game-state flag, a config number, etc.) is being computed
or hardcoded independently in more than one place, and that's the actual
bug. Your fix must make them converge on ONE shared representation — a
single component, ScriptableObject, or clearly-named static/singleton
that every involved script reads from — not another independently-tuned
parallel calculation that will drift out of sync again the next time
something changes. If a shared source of truth doesn't exist yet, create
one and point every related task's code at it (even if that means
editing a file outside this task's own original scope — that IS this
task, for this fix).`
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
${relatedTasksBlock}
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

CRITICAL — never hardcode a value that another component already owns
and could change: if a number/position/rect you're about to write in
code (or bake into a scene field) is derivable from an existing
single-source-of-truth component (a bounds rect, another GameObject's
real Collider2D bounds, another script's public property), read it live
via a reference to that component (GetComponent, a public static
Instance, or an equivalent lookup) instead of copying today's value in
as a literal. This pipeline has shipped this exact bug repeatedly: a
navigation graph authored its walkable-corridor node positions as
hardcoded Vector2 literals instead of deriving them from the level's
shared bounds component and each building's real Collider2D.bounds —
every time the level's footprint changed, the graph silently went stale
(nodes fell short of buildings, whole regions became unreachable) and
had to be manually re-authored from scratch by whoever caught it, more
than once. If you're about to write a number that "matches" another system's
current state, stop and ask whether that other system could ever change
it — if yes, read it from that system at runtime, don't duplicate it.

CRITICAL — if you disable a component (or a whole GameObject) to isolate
something while diagnosing or testing a fix, that is temporary
scaffolding, not part of the fix: restore it to its correct enabled state
before you save the scene and report done. Because other tasks in this
pipeline can be touching the same scene around the same time, a component
left disabled from an isolation step gets baked into the saved scene and
silently inherited by whatever runs next against that scene — this has
shipped repeatedly as the exact same bug (PerceptionCone/PerceptionLog/
CircleCollider2D, then later NpcWaypointFollower, disabled on NPCs and
blocking an unrelated task's test) even after being fixed once, because
each fix's own isolation step re-disabled it and never turned it back on
before saving. Before your final save_scene/report-done, re-check every
component you toggled off during this task's own investigation and
confirm it's back on (unless being off IS the actual intended fix).

NEVER start a Test Runner run (TestRunnerApi.Execute, Tmp/RunEdit, Tmp/RunPlay) or enter Play Mode from code while an open scene is modified: Unity then shows a blocking "Scene(s) Have Been Modified" dialog that freezes the editor and every MCP call until a human clicks it. Before any such start, make the scene clean: save the changes you intend to keep with EditorSceneManager.SaveOpenScenes() (only scenes that already have a path), or discard stray or temporary changes by reloading with EditorSceneManager.OpenScene("Assets/Scenes/Main.unity", OpenSceneMode.Single), and confirm SceneManager.GetActiveScene().isDirty is false. Never leave temporary test values (a lowered populationCap, a changed spawnCount, probe objects) in a scene you save.

NEVER open a native operating-system dialog in Unity. Do NOT call execute_menu_item with any menu path that opens one: File/Open Scene, File/Open Project, File/Save As, File/Save Scene As, File/New Scene on an unsaved scene, Assets/Import Package, Assets/Import New Asset, or any menu entry ending in '...' that asks for a file or folder. Do NOT call EditorUtility.OpenFilePanel, OpenFolderPanel, SaveFilePanel, SaveFolderPanel or DisplayDialog from execute_code. A native dialog freezes the entire Unity editor and every MCP call until a human clicks it, stops the whole pipeline, and has already done so several times. To open the project scene use execute_code with EditorSceneManager.OpenScene("Assets/Scenes/Main.unity", OpenSceneMode.Single); to save use EditorSceneManager.SaveScene(scene) only on a scene that already has a path.

If the funplay MCP tools are missing or disconnected in this session, that is a client-side
glitch and the Unity editor is still running. Do NOT report BLOCKED / NOT TESTED / INCONCLUSIVE
because of it, and do not wait for anyone to reconnect. Call the same tool through Bash from the
project root instead: ./.pipeline/unity-mcp.sh <tool_name> '<json arguments>'
(for example ./.pipeline/unity-mcp.sh get_editor_state; ./.pipeline/unity-mcp.sh --list prints
every tool). It takes the same arguments as the MCP tools and retries by itself while Unity
reloads its domain. Only report Unity as unreachable if that helper itself fails after its retries.

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

NEVER start a Test Runner run (TestRunnerApi.Execute, Tmp/RunEdit, Tmp/RunPlay) or enter Play Mode from code while an open scene is modified: Unity then shows a blocking "Scene(s) Have Been Modified" dialog that freezes the editor and every MCP call until a human clicks it. Before any such start, make the scene clean: save the changes you intend to keep with EditorSceneManager.SaveOpenScenes() (only scenes that already have a path), or discard stray or temporary changes by reloading with EditorSceneManager.OpenScene("Assets/Scenes/Main.unity", OpenSceneMode.Single), and confirm SceneManager.GetActiveScene().isDirty is false. Never leave temporary test values (a lowered populationCap, a changed spawnCount, probe objects) in a scene you save.

NEVER open a native operating-system dialog in Unity. Do NOT call execute_menu_item with any menu path that opens one: File/Open Scene, File/Open Project, File/Save As, File/Save Scene As, File/New Scene on an unsaved scene, Assets/Import Package, Assets/Import New Asset, or any menu entry ending in '...' that asks for a file or folder. Do NOT call EditorUtility.OpenFilePanel, OpenFolderPanel, SaveFilePanel, SaveFolderPanel or DisplayDialog from execute_code. A native dialog freezes the entire Unity editor and every MCP call until a human clicks it, stops the whole pipeline, and has already done so several times. To open the project scene use execute_code with EditorSceneManager.OpenScene("Assets/Scenes/Main.unity", OpenSceneMode.Single); to save use EditorSceneManager.SaveScene(scene) only on a scene that already has a path.

If the funplay MCP tools are missing or disconnected in this session, that is a client-side
glitch and the Unity editor is still running. Do NOT report BLOCKED / NOT TESTED / INCONCLUSIVE
because of it, and do not wait for anyone to reconnect. Call the same tool through Bash from the
project root instead: ./.pipeline/unity-mcp.sh <tool_name> '<json arguments>'
(for example ./.pipeline/unity-mcp.sh get_editor_state; ./.pipeline/unity-mcp.sh --list prints
every tool). It takes the same arguments as the MCP tools and retries by itself while Unity
reloads its domain. Only report Unity as unreachable if that helper itself fails after its retries.

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

NEVER start a Test Runner run (TestRunnerApi.Execute, Tmp/RunEdit, Tmp/RunPlay) or enter Play Mode from code while an open scene is modified: Unity then shows a blocking "Scene(s) Have Been Modified" dialog that freezes the editor and every MCP call until a human clicks it. Before any such start, make the scene clean: save the changes you intend to keep with EditorSceneManager.SaveOpenScenes() (only scenes that already have a path), or discard stray or temporary changes by reloading with EditorSceneManager.OpenScene("Assets/Scenes/Main.unity", OpenSceneMode.Single), and confirm SceneManager.GetActiveScene().isDirty is false. Never leave temporary test values (a lowered populationCap, a changed spawnCount, probe objects) in a scene you save.

NEVER open a native operating-system dialog in Unity. Do NOT call execute_menu_item with any menu path that opens one: File/Open Scene, File/Open Project, File/Save As, File/Save Scene As, File/New Scene on an unsaved scene, Assets/Import Package, Assets/Import New Asset, or any menu entry ending in '...' that asks for a file or folder. Do NOT call EditorUtility.OpenFilePanel, OpenFolderPanel, SaveFilePanel, SaveFolderPanel or DisplayDialog from execute_code. A native dialog freezes the entire Unity editor and every MCP call until a human clicks it, stops the whole pipeline, and has already done so several times. To open the project scene use execute_code with EditorSceneManager.OpenScene("Assets/Scenes/Main.unity", OpenSceneMode.Single); to save use EditorSceneManager.SaveScene(scene) only on a scene that already has a path.

If the funplay MCP tools are missing or disconnected in this session, that is a client-side
glitch and the Unity editor is still running. Do NOT report BLOCKED / NOT TESTED / INCONCLUSIVE
because of it, and do not wait for anyone to reconnect. Call the same tool through Bash from the
project root instead: ./.pipeline/unity-mcp.sh <tool_name> '<json arguments>'
(for example ./.pipeline/unity-mcp.sh get_editor_state; ./.pipeline/unity-mcp.sh --list prints
every tool). It takes the same arguments as the MCP tools and retries by itself while Unity
reloads its domain. Only report Unity as unreachable if that helper itself fails after its retries.

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

NEVER start a Test Runner run (TestRunnerApi.Execute, Tmp/RunEdit, Tmp/RunPlay) or enter Play Mode from code while an open scene is modified: Unity then shows a blocking "Scene(s) Have Been Modified" dialog that freezes the editor and every MCP call until a human clicks it. Before any such start, make the scene clean: save the changes you intend to keep with EditorSceneManager.SaveOpenScenes() (only scenes that already have a path), or discard stray or temporary changes by reloading with EditorSceneManager.OpenScene("Assets/Scenes/Main.unity", OpenSceneMode.Single), and confirm SceneManager.GetActiveScene().isDirty is false. Never leave temporary test values (a lowered populationCap, a changed spawnCount, probe objects) in a scene you save.

NEVER open a native operating-system dialog in Unity. Do NOT call execute_menu_item with any menu path that opens one: File/Open Scene, File/Open Project, File/Save As, File/Save Scene As, File/New Scene on an unsaved scene, Assets/Import Package, Assets/Import New Asset, or any menu entry ending in '...' that asks for a file or folder. Do NOT call EditorUtility.OpenFilePanel, OpenFolderPanel, SaveFilePanel, SaveFolderPanel or DisplayDialog from execute_code. A native dialog freezes the entire Unity editor and every MCP call until a human clicks it, stops the whole pipeline, and has already done so several times. To open the project scene use execute_code with EditorSceneManager.OpenScene("Assets/Scenes/Main.unity", OpenSceneMode.Single); to save use EditorSceneManager.SaveScene(scene) only on a scene that already has a path.

If the funplay MCP tools are missing or disconnected in this session, that is a client-side
glitch and the Unity editor is still running. Do NOT report BLOCKED / NOT TESTED / INCONCLUSIVE
because of it, and do not wait for anyone to reconnect. Call the same tool through Bash from the
project root instead: ./.pipeline/unity-mcp.sh <tool_name> '<json arguments>'
(for example ./.pipeline/unity-mcp.sh get_editor_state; ./.pipeline/unity-mcp.sh --list prints
every tool). It takes the same arguments as the MCP tools and retries by itself while Unity
reloads its domain. Only report Unity as unreachable if that helper itself fails after its retries.

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

CRITICAL — if you disable a component (or a whole GameObject) to isolate
something while testing, that is temporary scaffolding for your own
investigation, not something that belongs in the saved scene: restore it
to its correct enabled state before you finish, even if this task passed.
Other tasks in this pipeline can be touching the same scene around the
same time, and a component left disabled from your isolation step gets
baked into the saved scene and silently inherited by whatever test runs
next against it — this exact pattern (PerceptionCone/PerceptionLog/
CircleCollider2D, then later NpcWaypointFollower, disabled on NPCs and
blocking an unrelated task) has recurred more than once in this pipeline
because a component toggled off to isolate one check was never toggled
back on before the scene was saved.

NEVER start a Test Runner run (TestRunnerApi.Execute, Tmp/RunEdit, Tmp/RunPlay) or enter Play Mode from code while an open scene is modified: Unity then shows a blocking "Scene(s) Have Been Modified" dialog that freezes the editor and every MCP call until a human clicks it. Before any such start, make the scene clean: save the changes you intend to keep with EditorSceneManager.SaveOpenScenes() (only scenes that already have a path), or discard stray or temporary changes by reloading with EditorSceneManager.OpenScene("Assets/Scenes/Main.unity", OpenSceneMode.Single), and confirm SceneManager.GetActiveScene().isDirty is false. Never leave temporary test values (a lowered populationCap, a changed spawnCount, probe objects) in a scene you save.

NEVER open a native operating-system dialog in Unity. Do NOT call execute_menu_item with any menu path that opens one: File/Open Scene, File/Open Project, File/Save As, File/Save Scene As, File/New Scene on an unsaved scene, Assets/Import Package, Assets/Import New Asset, or any menu entry ending in '...' that asks for a file or folder. Do NOT call EditorUtility.OpenFilePanel, OpenFolderPanel, SaveFilePanel, SaveFolderPanel or DisplayDialog from execute_code. A native dialog freezes the entire Unity editor and every MCP call until a human clicks it, stops the whole pipeline, and has already done so several times. To open the project scene use execute_code with EditorSceneManager.OpenScene("Assets/Scenes/Main.unity", OpenSceneMode.Single); to save use EditorSceneManager.SaveScene(scene) only on a scene that already has a path.

If the funplay MCP tools are missing or disconnected in this session, that is a client-side
glitch and the Unity editor is still running. Do NOT report BLOCKED / NOT TESTED / INCONCLUSIVE
because of it, and do not wait for anyone to reconnect. Call the same tool through Bash from the
project root instead: ./.pipeline/unity-mcp.sh <tool_name> '<json arguments>'
(for example ./.pipeline/unity-mcp.sh get_editor_state; ./.pipeline/unity-mcp.sh --list prints
every tool). It takes the same arguments as the MCP tools and retries by itself while Unity
reloads its domain. Only report Unity as unreachable if that helper itself fails after its retries.

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
1. Read backlog.json, find the task with id "${task.id}". If it's
   there: set its "attempts" field to ${attempt}, set its "status" to
   "done" if this passed (leave it "todo" if it failed — the Director
   marks a task "blocked" separately once all attempts are exhausted),
   set its "successCriterion" field to exactly the text given to you
   above ("${task.successCriterion}") if it differs from what's stored,
   and write the file back.

   CRITICAL — if "${task.id}" is NOT in this backlog.json (this happens
   when the Director reopens a task from an EARLIER, already-completed
   milestone — its task lives in that milestone's own historical
   snapshot, not the current active backlog.json), do NOT skip the
   update. Instead, find its actual home: read
   ${targetProjectPath}/.pipeline/milestones/ (one subdirectory per
   milestone id) and check each milestone's own backlog.json for a task
   with this id, then apply the exact same attempts/status/
   successCriterion update to that file and write IT back. Skipping
   this because the task "isn't in backlog.json" leaves a corrected
   successCriterion only fixed in this run's memory — a future resumed
   run reads the stale historical snapshot and the same error can
   resurface, which has actually happened in this pipeline (a
   successCriterion correction that only patched the wrong copy).
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

NEVER start a Test Runner run (TestRunnerApi.Execute, Tmp/RunEdit, Tmp/RunPlay) or enter Play Mode from code while an open scene is modified: Unity then shows a blocking "Scene(s) Have Been Modified" dialog that freezes the editor and every MCP call until a human clicks it. Before any such start, make the scene clean: save the changes you intend to keep with EditorSceneManager.SaveOpenScenes() (only scenes that already have a path), or discard stray or temporary changes by reloading with EditorSceneManager.OpenScene("Assets/Scenes/Main.unity", OpenSceneMode.Single), and confirm SceneManager.GetActiveScene().isDirty is false. Never leave temporary test values (a lowered populationCap, a changed spawnCount, probe objects) in a scene you save.

NEVER open a native operating-system dialog in Unity. Do NOT call execute_menu_item with any menu path that opens one: File/Open Scene, File/Open Project, File/Save As, File/Save Scene As, File/New Scene on an unsaved scene, Assets/Import Package, Assets/Import New Asset, or any menu entry ending in '...' that asks for a file or folder. Do NOT call EditorUtility.OpenFilePanel, OpenFolderPanel, SaveFilePanel, SaveFolderPanel or DisplayDialog from execute_code. A native dialog freezes the entire Unity editor and every MCP call until a human clicks it, stops the whole pipeline, and has already done so several times. To open the project scene use execute_code with EditorSceneManager.OpenScene("Assets/Scenes/Main.unity", OpenSceneMode.Single); to save use EditorSceneManager.SaveScene(scene) only on a scene that already has a path.

If the funplay MCP tools are missing or disconnected in this session, that is a client-side
glitch and the Unity editor is still running. Do NOT report BLOCKED / NOT TESTED / INCONCLUSIVE
because of it, and do not wait for anyone to reconnect. Call the same tool through Bash from the
project root instead: ./.pipeline/unity-mcp.sh <tool_name> '<json arguments>'
(for example ./.pipeline/unity-mcp.sh get_editor_state; ./.pipeline/unity-mcp.sh --list prints
every tool). It takes the same arguments as the MCP tools and retries by itself while Unity
reloads its domain. Only report Unity as unreachable if that helper itself fails after its retries.

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

NEVER start a Test Runner run (TestRunnerApi.Execute, Tmp/RunEdit, Tmp/RunPlay) or enter Play Mode from code while an open scene is modified: Unity then shows a blocking "Scene(s) Have Been Modified" dialog that freezes the editor and every MCP call until a human clicks it. Before any such start, make the scene clean: save the changes you intend to keep with EditorSceneManager.SaveOpenScenes() (only scenes that already have a path), or discard stray or temporary changes by reloading with EditorSceneManager.OpenScene("Assets/Scenes/Main.unity", OpenSceneMode.Single), and confirm SceneManager.GetActiveScene().isDirty is false. Never leave temporary test values (a lowered populationCap, a changed spawnCount, probe objects) in a scene you save.

NEVER open a native operating-system dialog in Unity. Do NOT call execute_menu_item with any menu path that opens one: File/Open Scene, File/Open Project, File/Save As, File/Save Scene As, File/New Scene on an unsaved scene, Assets/Import Package, Assets/Import New Asset, or any menu entry ending in '...' that asks for a file or folder. Do NOT call EditorUtility.OpenFilePanel, OpenFolderPanel, SaveFilePanel, SaveFolderPanel or DisplayDialog from execute_code. A native dialog freezes the entire Unity editor and every MCP call until a human clicks it, stops the whole pipeline, and has already done so several times. To open the project scene use execute_code with EditorSceneManager.OpenScene("Assets/Scenes/Main.unity", OpenSceneMode.Single); to save use EditorSceneManager.SaveScene(scene) only on a scene that already has a path.

If the funplay MCP tools are missing or disconnected in this session, that is a client-side
glitch and the Unity editor is still running. Do NOT fall back to a code-only review because of it,
and do not wait for anyone to reconnect. Call the same tool through Bash from the project root
instead: ./.pipeline/unity-mcp.sh <tool_name> '<json arguments>' (for example
./.pipeline/unity-mcp.sh enter_play_mode or ./.pipeline/unity-mcp.sh capture_game_view
'{"save_to_file":true}'; ./.pipeline/unity-mcp.sh --list prints every tool). It takes the same
arguments as the MCP tools and retries by itself while Unity reloads its domain. Only report Unity
as unreachable if that helper itself fails after its retries.

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
  happens to catch your eye. Also check actions with an obvious physical
  impact (watering, harvesting, landing a hit, walking through mud/tall
  grass) for a matching particle/VFX effect — a splash, a puff of dust,
  an impact burst. An action like this with no particle feedback at all
  reads as unfinished the same way a missing animation state does; flag
  it the same way, sized against the vision's own scope.
- Level / world design: is the layout sensible, is there confusing dead
  space or an unreachable area, does the difficulty/pacing match what the
  vision's priorities imply, is there anything a first-time player would
  get stuck on with no clue what to do? Also specifically: does each
  player-facing space actually feel like the kind of place the vision
  describes (a "town" that reads as a town, a "dungeon" that reads as a
  dungeon), or is it technically distinct from its neighboring scene
  (different ground color, one NPC) while otherwise being an empty flat
  area with none of the decoration/atmosphere/environmental storytelling
  the vision implies? This is a real, blocking-eligible failure to
  deliver the vision, not a cosmetic nitpick — this pipeline has shipped
  exactly this before (a "town" that was flat ground plus a single NPC).
  Judge the amount of decoration against the vision's own stated
  scope/priorities (a minimal/cozy game needs a handful of well-placed
  details, not a dense scene) — the bar is "does this feel like the
  described place," not "does it have the maximum possible decoration."
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
- Shared-state root cause: when you find a bug, ask whether it's actually
  confined to one task's own code, or whether the SAME underlying concept
  (world/level bounds, a day/night or game-state flag, an inventory/economy
  value, anything more than one task's script touches) is computed or
  hardcoded independently in more than one place. A symptom that has come
  back in a slightly different form after being "fixed" before is a strong
  signal of this — each fix patched one side without the other, because
  the concept was never unified into one shared source of truth. This
  pipeline has shipped exactly this: a world-bounds value duplicated
  across a movement script and a camera script, each independently
  "fixed" in turn while the other quietly drifted out of sync. When you
  find this pattern, do NOT report it as a narrow single-task issue —
  name it as cross-cutting and list every task whose code is part of the
  root cause (see relatedTaskIds below), so they get fixed together
  instead of chasing the same bug through another round.
- Vision fidelity, from a quality angle (not just literal coherence,
  which the Director separately checks): does what got built actually
  deliver the "hook" described in the vision, or does it technically
  contain all the pieces while still missing the point? Specifically
  watch for a core mechanic that exists but feels hollow or isolated
  from the ecosystem a real player would expect around it — a "plant a
  seed" loop with only ever one kind of seed and no visible source for
  it, an enemy encounter with only one enemy shape once the vision's
  scope implies more, a reward/progress mechanic with nothing that
  actually drops or unlocks. A mechanic that technically passes its
  successCriterion while stopping short of this is a real, blocking-
  eligible failure to deliver the vision, not a "later polish" item —
  judge the expected depth against the vision's own stated
  scope/priorities, the same way you judge decoration density.
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
prototype). If the issue is cross-cutting (see "Shared-state root cause"
above), also set relatedTaskIds to every OTHER task id involved besides
taskId — this is what lets the fix be dispatched to all of them together
instead of one isolated patch at a time.

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

async function implementAndTestTask(task, targetProjectPath, vision, reopenReason) {
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

    // Group tasks that share a cross-cutting root cause (relatedTaskIds) so
    // each Fixer sees its siblings instead of patching its own task in
    // isolation and drifting back out of sync with the others.
    const siblingMap = new Map()
    for (const issue of blockingIssues) {
      if (!issue.taskId || !Array.isArray(issue.relatedTaskIds) || issue.relatedTaskIds.length === 0) continue
      const group = new Set([issue.taskId, ...issue.relatedTaskIds])
      for (const id of group) {
        if (!siblingMap.has(id)) siblingMap.set(id, new Set())
        for (const other of group) if (other !== id) siblingMap.get(id).add(other)
      }
    }

    log(`Quality Critic reopen-round ${reopenRound} polish-round ${round}: ${blockingIssues.length} blocking issue(s) on tasks ${taskIdsToFix.join(', ')}`)
    for (const taskId of taskIdsToFix) {
      const result = taskResults.find(r => r && r.task.id === taskId)
      if (!result) continue
      const critiqueFailure = {
        evidence: blockingIssues.filter(i => i.taskId === taskId).map(i => i.description).join('; '),
        bug: null,
      }
      const siblingIds = siblingMap.get(taskId)
      const relatedTasks = siblingIds && siblingIds.size > 0
        ? [...siblingIds].map(id => {
            const sibling = taskResults.find(r => r && r.task.id === id)
            return sibling ? { id, description: sibling.task.description } : { id, description: '(unknown task)' }
          })
        : null
      await agent(implementPrompt(result.task, round, critiqueFailure, args.targetProjectPath, vision, relatedTasks), {
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
      schema: FINAL_REVIEW_SCHEMA,
    }
  )

  if (!finalReview || finalReview.ready || !Array.isArray(finalReview.reopenTasks) || finalReview.reopenTasks.length === 0) {
    break
  }
  if (reopenRound === MAX_REOPEN_ROUNDS) {
    log(`Still not ready after ${MAX_REOPEN_ROUNDS} reopen rounds — reporting as-is rather than looping forever.`)
    break
  }
  log(`Final review round ${reopenRound + 1}: reopening ${finalReview.reopenTasks.map(rt => rt.taskId).join(', ')} — ${finalReview.summary}`)

  phase('Implementation')
  const reasonByTaskId = new Map(finalReview.reopenTasks.map(rt => [rt.taskId, rt.reason]))
  const reopenIds = new Set(reasonByTaskId.keys())
  const tasksToReopen = taskResults
    .filter(r => r && reopenIds.has(r.task.id))
    .map(r => ({ ...r.task, status: 'todo', attempts: 0 }))
  const freshResults = await pipeline(
    tasksToReopen,
    (task) => implementAndTestTask(task, args.targetProjectPath, vision, reasonByTaskId.get(task.id))
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
