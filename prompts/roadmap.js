export function roadmapPrompt(sourceDocument, targetProjectPath) {
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

HARD RULE — think in complete systems, not isolated mechanics: for every
core mechanic you put in scope, ask what it would take for a player to
actually experience it as a coherent, complete system, not a token
gesture that technically works but stops short of what a real game would
need. Concretely, for each core mechanic ask: where does its
resource/input come from, and is there more than one kind (a "plant a
seed" loop needs an answer for where seeds come from and whether there
is only ever one kind of seed); what range of outcomes or variety does
the player actually encounter once the vision's scope is bigger than a
single-encounter demo (a "fight an enemy" loop needs more than one enemy
shape — different attacks, ranges, and objectives, not one copy-pasted
threat); what does progress or reward look like (drops, upgrades,
unlocks) if the vision implies persistent player growth at all. Don't
stop at "the mechanic technically works" — ask what a player would
expect next from it and make sure the roadmap actually answers that, the
way a real shipped game would need to. Default to this depth whenever
you are defining or extending a GAME's overall scope.

EXCEPTION — this does NOT apply when the source document is itself a
narrow, specific feature request against an existing game (e.g. "add an
AoE attack ability," "add a new enemy type"), rather than a request to
design or extend a game's overall scope. In that case, respect the
narrow scope exactly as asked — do not inflate a specific feature
request into a full system redesign.

Write the vision to ${targetProjectPath}/.pipeline/vision.md and the full
ordered roadmap to ${targetProjectPath}/.pipeline/roadmap.md (readable
Markdown, using your Write tool). Also create
${targetProjectPath}/.pipeline/project-map.md with a short header noting
no scenes exist yet — later milestones will update it with the as-built
scene topology as they go.

CRITICAL — also write ${targetProjectPath}/.pipeline/milestone-status.json
(using your Write tool) — this is what the live progress dashboard reads
to show which milestone is active, since the regular backlog.json only
ever shows the CURRENT milestone's tasks and has no memory of earlier
ones. Its shape: {"chainStatus": "in_progress", "currentMilestoneId":
"<id of milestones[0]>", "milestones": [{"id": "...", "description":
"...", "status": "current"}, {"id": "...", "description": "...",
"status": "pending"}, ...]} — the FIRST milestone in your ordered list
gets status "current", every other one gets "pending". Without this file
the dashboard has no way to show milestone progress at all.

Append a "start" line and, when done, a "done" line to
${targetProjectPath}/.pipeline/activity.log.jsonl: {"ts": "<ISO timestamp
from shell 'date -u +%Y-%m-%dT%H:%M:%SZ'>", "role": "director",
"specialization": "roadmap", "taskId": null, "event": "start"|"done",
"detail": "<short note, e.g. 'Roadmap: 6 milestones drafted'>"}.

Return the vision and the ordered milestones array as structured data
matching the required schema.`
}

export function resumeStatePrompt(targetProjectPath) {
  return `You are checking whether a chained milestone-build run against
${targetProjectPath} is resuming a PRIOR run or starting FRESH — this runs
before anything else, every single time milestone-build is invoked, so it
must read real files rather than guess.

Step 1 — read ${targetProjectPath}/.pipeline/milestone-status.json.
- If it does not exist, or fails to parse as JSON, or its chainStatus is
  "complete": return mode "fresh" immediately — omit every other field
  (vision, remainingMilestones, doneMilestones, currentMilestoneSnapshot).
  The caller will run the normal fresh-roadmap path from here. Do not
  write anything to any file in this case.
- If chainStatus is "escalated": return mode "escalated" with
  escalationReason set to a short explanation of what needs a human
  decision — read ${targetProjectPath}/.pipeline/roadmap.md, which
  roadmapReviewPrompt already writes the escalation reason into, and
  summarize it. Do not write anything, do not read any further files.
- If chainStatus is "in_progress" or "blocked": mode is "resume" —
  continue to Step 2.

Step 2 (only when mode is "resume") — read
${targetProjectPath}/.pipeline/roadmap.md and
${targetProjectPath}/.pipeline/vision.md and reconstruct:
- vision: identity/scope/priorities exactly as written in vision.md.
- remainingMilestones: CRITICAL — milestone-status.json's own "milestones"
  array (already read in Step 1) is the AUTHORITATIVE source for WHICH
  milestone ids remain and in WHAT ORDER, not roadmap.md. Take every
  milestone-status.json entry whose status is NOT "done", in the exact
  order they appear there (the "current" one, if any, is already first).
  roadmap.md can drift out of sync with milestone-status.json — it has
  been observed with a stale, unrelated milestone list (even a different
  id numbering) while milestone-status.json stayed correct — so NEVER let
  roadmap.md's own list of ids or their order override or filter what
  milestone-status.json says remains. Use roadmap.md only to fill in each
  remaining milestone's "scope" and "dependsOn" fields (which
  milestone-status.json doesn't store) by matching on id — if a remaining
  id has no matching entry in roadmap.md at all (exactly the
  drift/staleness case), do not skip it and do not substitute a
  different milestone in its place: keep milestone-status.json's own
  "description" as both description and scope, and dependsOn as an empty
  array, rather than ever silently pulling in a milestone id that
  milestone-status.json didn't list. Getting the FIRST remaining
  milestone's id wrong here is what has caused this pipeline to
  "resume" into designing an entirely different, unrelated milestone
  from scratch while claiming to resume correctly — treat this
  reconstruction as security-critical, not a best-effort merge.

Step 3 (only when mode is "resume") — for EVERY milestone marked "done" in
milestone-status.json, read
${targetProjectPath}/.pipeline/milestones/<id>/backlog.json and
${targetProjectPath}/.pipeline/milestones/<id>/gdd.md (substituting that
milestone's own id for <id>) and add {id, gdd, tasks} to doneMilestones,
tasks being the exact array from that backlog.json file. If either file
is missing for a "done" milestone, skip that one milestone silently
rather than failing the whole load — its history becomes unavailable to
later playtests/critiques, which is a smaller problem than the whole
resume failing outright.

Step 4 (only when mode is "resume") — for the milestone marked "current"
in milestone-status.json (if any):
- First try ${targetProjectPath}/.pipeline/milestones/<id>/backlog.json
  and gdd.md (that milestone's own id). If both exist, use them as
  currentMilestoneSnapshot: {id, gdd, tasks}.
- If they don't exist yet (this milestone's own reopen-loop never reached
  a snapshot write — true for any chain that stalled before this feature
  existed), fall back to reading the TOP-LEVEL
  ${targetProjectPath}/.pipeline/backlog.json and
  ${targetProjectPath}/.pipeline/gdd.md. Check whether EVERY task id in
  that backlog.json starts with the exact prefix "<id>-" (the Designer
  always prefixes every task id with its owning milestone's id, so this
  prefix check is reliable) — if every task id matches, use this
  top-level pair as currentMilestoneSnapshot instead. This is exactly the
  situation for a chain that stalled before the
  ${targetProjectPath}/.pipeline/milestones/ directory convention
  existed: its top-level backlog.json IS that milestone's own backlog,
  simply never copied into the per-milestone path.
- A backlog with ZERO tasks is never a usable snapshot, even if it passes
  the checks above (an empty array vacuously satisfies "every task id
  matches") — if either the per-milestone backlog.json or the top-level
  backlog.json you would otherwise use is an empty array, treat it the
  same as neither source being usable: return currentMilestoneSnapshot as
  null.
- If neither source is usable (missing entirely, or the top-level
  backlog's task ids don't match this milestone's prefix — meaning a
  LATER milestone has already overwritten it), return
  currentMilestoneSnapshot as null. The caller will then treat this
  milestone as not-yet-started and design it fresh, which is the safe
  fallback — never guess or fabricate a snapshot.
- If there is no "current" milestone at all in milestone-status.json,
  also return currentMilestoneSnapshot as null.

Append a "start" line before you begin and a "done" line when you finish
to ${targetProjectPath}/.pipeline/activity.log.jsonl: {"ts": "<ISO
timestamp from shell 'date -u +%Y-%m-%dT%H:%M:%SZ'>", "role": "director",
"specialization": "resume", "taskId": null, "event": "start"|"done",
"detail": "<short note, e.g. 'Resume check: fresh start' or 'Resume
check: resuming at M3, 2 done milestones loaded' or 'Resume check:
escalated, human decision needed'>"}.

Return the mode and, depending on mode, the fields described above as
structured data matching the required schema.`
}

export function milestoneSnapshotPrompt(milestone, taskResults, gdd, finalReview, targetProjectPath) {
  const taskSnapshot = taskResults.map(r => ({
    id: r.task.id,
    specialization: r.task.specialization,
    description: r.task.description,
    successCriterion: r.task.successCriterion,
    needsArt: r.task.needsArt,
    needsAnimation: r.task.needsAnimation,
    status: r.status,
    attempts: r.attempts,
  }))

  const statusUpdateBlock = (!finalReview || !finalReview.ready)
    ? `\n\nThis milestone did NOT pass its final review this round
(${finalReview ? `summary: ${finalReview.summary}` : 'no final review was produced at all'}).
CRITICAL — also update ${targetProjectPath}/.pipeline/milestone-status.json:
read it first (to preserve every OTHER milestone's existing status
untouched — don't lose history), then write it back with chainStatus set
to "blocked" and currentMilestoneId set to "${milestone.id}". This
milestone's own entry in the milestones array stays "status": "current"
(it is not done — a future resume must retry its reopen-loop, not skip
it). This is what lets a future run of this workflow pick this milestone
back up automatically instead of leaving the dashboard showing stale
progress forever.`
    : `\n\nThis milestone's final review passed. Do NOT touch
${targetProjectPath}/.pipeline/milestone-status.json here — the Roadmap
Review step that runs right after this one owns that update.`

  return `You are recording a permanent snapshot of milestone
"${milestone.id}" (${milestone.description}) for the Unity project at
${targetProjectPath} — this runs after every attempt at this milestone's
own reopen-loop, whether or not it passed, so a future run of this
workflow can resume from here instead of re-designing this milestone
from scratch.

Write ${targetProjectPath}/.pipeline/milestones/${milestone.id}/backlog.json
(using your Write tool — create the directory if it doesn't exist) with
exactly this task list: ${JSON.stringify(taskSnapshot)}

Write ${targetProjectPath}/.pipeline/milestones/${milestone.id}/gdd.md
with exactly this text: """${gdd}"""
${statusUpdateBlock}

Append a "start" line before you begin and a "done" line when you finish
to ${targetProjectPath}/.pipeline/activity.log.jsonl: {"ts": "<ISO
timestamp from shell 'date -u +%Y-%m-%dT%H:%M:%SZ'>", "role": "director",
"specialization": "snapshot", "taskId": null, "event": "start"|"done",
"detail": "<short note, e.g. 'Snapshot: M1 saved, 3 tasks (ready)' or
'Snapshot: M2 saved, 5 tasks (blocked, chain paused)'>"}.`
}

export function roadmapReviewPrompt(roadmap, milestoneResult, targetProjectPath) {
  const remaining = (roadmap.milestones ?? [])
    .map(m => `- [${m.id}] (depends on: ${(m.dependsOn ?? []).length ? m.dependsOn.join(', ') : 'none'}) ${m.description}\n  scope: ${m.scope ?? '(not specified)'}`)
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

CRITICAL — also update ${targetProjectPath}/.pipeline/milestone-status.json
(read it first, then write the full updated file — same shape described
when this file was first created: {"chainStatus": "in_progress"|
"escalated"|"complete", "currentMilestoneId": "<id or null>",
"milestones": [{"id","description","status"}, ...]}). Mark
"${milestoneResult.milestone.id}" (the milestone that just finished) as
"status": "done" — keep every already-"done" entry from the existing
file as "done", don't lose history. If your verdict is "continue": set
chainStatus "in_progress", mark the first milestone of your remaining
plan (the revised one if you changed it, otherwise the existing remaining
list) as "current", every other remaining one as "pending", and include
any newly-added milestones too. If "escalate": set chainStatus
"escalated", currentMilestoneId null. If "complete": set chainStatus
"complete", currentMilestoneId null, and mark every still-listed
milestone "pending" (they were never built). This file is what the live
dashboard reads for milestone progress — keep it accurate every time you
run.

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
