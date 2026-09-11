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

export function launchTrainingPrompt(task, targetProjectPath, vision, reopenReason) {
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

export function monitorConvergencePrompt(task, targetProjectPath, vision, attemptNumber, reopenReason) {
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

export function trainedModelVerificationPrompt(task, attempt, targetProjectPath, vision) {
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
