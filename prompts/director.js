export function visionPrompt(gameIdea, targetProjectPath) {
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

export function escalationPrompt(vision, blockedTasks) {
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

export function finalReviewPrompt(vision, gdd, taskResults, playtestResult, directorDecisions) {
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
