export function scenarioTestPrompt(task, attempt, targetProjectPath) {
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

export function fullPlaytestPrompt(vision, backlog, targetProjectPath) {
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
