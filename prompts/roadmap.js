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

export function roadmapReviewPrompt(roadmap, milestoneResult, targetProjectPath) {
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
