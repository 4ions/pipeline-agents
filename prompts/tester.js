export function scenarioTestPrompt(task, attempt, targetProjectPath) {
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

export function fullPlaytestPrompt(vision, backlog, targetProjectPath) {
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
