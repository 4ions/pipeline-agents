export function implementPrompt(task, attempt, priorFailure, targetProjectPath) {
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

Use the Unity MCP tools available to you (search for them if you don't
see them yet) to write/edit C# scripts and configure the scene/GameObjects
needed. Keep the change scoped to this task and to the confirmed correct
scene. When done, append a line to
${targetProjectPath}/.pipeline/activity.log.jsonl: {"ts": "<ISO timestamp
from shell 'date -u +%Y-%m-%dT%H:%M:%SZ'>", "role": "${role}",
"specialization": "${task.specialization}", "taskId": "${task.id}",
"event": "done", "detail": "<short note>"} — and append a matching
"start" line (same role) before you begin.

Report back a short summary of what you implemented.`
}
