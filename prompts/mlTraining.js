export function launchTrainingPrompt(task, targetProjectPath, vision) {
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
path, and the build path used — the monitor task (a separate, later
task) reads this file to know what to watch. Use your Read/Write tools
for this, not execute_code.

Append a "start" line and, when the process is confirmed launched (not
when training finishes — that's a different task), a "done" line to
${targetProjectPath}/.pipeline/activity.log.jsonl: {"ts": "<ISO
timestamp from shell 'date -u +%Y-%m-%dT%H:%M:%SZ'>", "role":
"programmer", "specialization": "${task.specialization}", "taskId":
"${task.id}", "event": "start"|"done", "detail": "<short note, e.g.
'Launched training run <run-id>, num-envs=N, max_steps=X'>"}.

Report back the run-id, the logdir path, and confirmation the training
process is actually running (not just that the launch command returned
without error — check the process is alive and the log file is
growing).`
}
