# milestone-build: incremental, roadmap-driven construction on top of auto-game-build

Date: 2026-08-30
Status: Approved design, pending implementation plan

## Purpose

`build-game.js` and `fix-reopened.js` (the pipeline as it exists today) are
tuned for a single-shot, single-scene prototype: one isolated Unity scene,
one backlog batch of ~10-20 tasks, built and verified in one run. That scope
ceiling is deliberate and has been validated repeatedly today — it is NOT
being removed or loosened.

This spec adds a **third, separate workflow** for a different class of
request: building something whose true scope is much larger than one
run can responsibly attempt in a single batch (the motivating example
discussed today was "something like Stardew Valley," built from a large
source document — e.g. a multi-page game design prospectus — rather than a
short `gameIdea` string). The mechanism is **incremental construction across
chained milestones**, reusing every existing role/prompt/quality-gate
mechanism this session already built and validated, at a higher level of
granularity.

This is explicitly NOT an attempt to make `build-game.js` itself build
arbitrarily large games in one shot. It is a new orchestration layer on top
of the same building blocks.

## Non-goals

- Not a rewrite of any existing prompt's core responsibilities (Director,
  Designer, Programmer, Artist, Tester, Critic all keep doing what they do
  today — SENIOR framing, game-context propagation, real multi-frame
  animation, code craftsmanship, varied testing strategy — unchanged).
- Not a guarantee that any given large document is actually achievable —
  the roadmap/escalation mechanism exists specifically because some
  milestones may turn out to need human judgment calls this pipeline
  shouldn't make alone.
- Not full unattended operation forever — bounded by both a milestone cap
  and explicit escalation conditions (see "Chaining and stopping" below).

## New persistent artifacts

Both live in the target project's `.pipeline/` directory, alongside the
existing `vision.md`, `gdd.md`, `backlog.json`, etc. (which continue to be
written per-milestone the same way they are today per-run).

### `.pipeline/roadmap.md` (+ a structured `roadmap.json` the workflow script
carries in memory across the milestone loop, since Workflow scripts have no
filesystem access — agents read/write the `.md` for human readability, but
the loop's own state comes from each agent's structured return value, the
same pattern `backlog.json`/`design.tasks` already uses today)

An ordered list of milestones. Each milestone has: an id, a short
description, a rough scope statement, and which earlier milestone(s) it
depends on. This is a planning artifact, not carved in stone — the whole
point of the "Roadmap Review" phase (below) is that it gets revised as
reality teaches the team something the original plan didn't know.

### `.pipeline/project-map.md`

Tracks **as-built** reality, not intent: which Unity scenes exist, what
each is for, how they connect to each other (e.g. "MainMenu.unity loads
Farm.unity on Play button via SceneManager.LoadScene"), and what
persistent/shared systems exist (a `DontDestroyOnLoad` GameManager, a save
data structure, a shared Health component other systems build on). This is
what lets a milestone started in a fresh subagent understand the existing
project's shape well enough to extend or connect to it correctly, rather
than guessing or colliding with earlier work.

Critically, the scene topology is NOT assumed by the pipeline itself — a
milestone might extend an existing scene, create a brand-new one, or wire
two existing scenes together (a main menu, a level-select flow, etc.). That
decision is made by the Designer while scoping each milestone, informed by
the current `project-map.md`, the same way today's Designer already decides
per-task scene assignment within a single run.

## New prompts

Two new prompt functions, following the same house style as every existing
one (SENIOR framing, game-context propagation, activity-log start/done
lines, explicit CRITICAL blocks for known failure modes — no new
conventions invented here).

### `roadmapPrompt(sourceDocument, targetProjectPath)`

Director + Designer, collaboratively (or Director drafts, Designer
refines — mirroring today's Vision → Design handoff), read the **full**
source document — not a compressed `vision` — and produce:
- an overall `vision` (same 3-field shape as today, for continuity with
  every existing per-task prompt's `gameContextBlock`-style context), and
- an ordered `roadmap`: milestones with id/description/scope/dependencies.

Writes both to `.pipeline/vision.md` and `.pipeline/roadmap.md`.

### `roadmapReviewPrompt(roadmap, milestoneResult, targetProjectPath)`

Director-only. Runs after each milestone's own Report phase. Takes the
current roadmap and that milestone's structured result (`finalReview`,
`qualityCritique`, task results) as JS values passed through the workflow
script — the same way `vision`/`design` flow through `build-game.body.js`
today. `project-map.md` itself is NOT passed as a parameter: like every
other per-task prompt reading `gdd.md` for scene context today, the agent
reads `.pipeline/project-map.md` directly via `targetProjectPath` (a
Workflow script has no filesystem access, so anything that needs the full
current file content is read by the agent itself, not threaded through the
script as a JS value). Returns a
decision: `continue` (optionally with a revised roadmap — reordered, split,
merged, added to, or trimmed), `escalate` (a specific judgment call that
needs the human — same spirit as today's `escalationPrompt` decision
types), or `complete` (the roadmap's remaining scope is done or no longer
worth pursuing).

## Workflow shape: `workflows/milestone-build.js`

Generated by the same `bin/build-workflow.js` mechanism as the other two,
from the same prompt files (`schemas.js`, `director.js`, `designer.js`,
`programmer.js`, `artist.js`, `tester.js`, `critic.js`) plus a new
`workflows/milestone-build.body.js`.

```
phase('Roadmap')
  vision, roadmap = agent(roadmapPrompt(args.sourceDocument, targetProjectPath))

let milestoneHistory = []
for (let m = 0; m <= MAX_MILESTONES; m++) {
  phase('Design')       // scoped to the CURRENT milestone from the roadmap
  phase('Design Review')
  phase('Implementation')
  phase('Full Playtest')   // exercises the WHOLE accumulated project, not just this milestone — same regression role the Full Playtest already plays today
  phase('Quality Gate')    // same Critic, same bounded polish-fix loop as today
  phase('Report')

  milestoneHistory.push(thisMilestoneResult)

  phase('Roadmap Review')
  decision = agent(roadmapReviewPrompt(...))
  if (decision.verdict === 'escalate') { log(...); break }   // stop, surface to human
  if (decision.verdict === 'complete') { break }
  if (m === MAX_MILESTONES) { log('milestone cap reached'); break }
  roadmap = decision.revisedRoadmap ?? roadmap
}

return { vision, roadmap, milestoneHistory }
```

This deliberately reuses `implementAndTestTask`/`animateTask` and the
Quality Gate's bounded critique-fix loop **verbatim** from
`build-game.body.js` — no new implementation-loop logic, just a new outer
layer above the phases that already exist, exactly like today's
`MAX_REOPEN_ROUNDS` loop but one level up (milestones instead of reopened
tasks).

## Chaining and stopping

Per today's decision: milestones chain automatically within one Workflow
run — no human approval gate between every milestone. Bounded by:
- `MAX_MILESTONES` (a hard cap per run, same spirit as every other bounded
  loop this session already introduced).
- `roadmapReviewPrompt` returning `escalate` — the Director's own judgment
  that something needs a human decision halts the chain immediately.
- A milestone whose own Quality Gate never converges (exhausts its bounded
  polish rounds still unacceptable) also halts the chain rather than
  building the next milestone on a broken foundation.

## Regression across milestones

Unchanged in mechanism from today's `fix-reopened` outer loop: the Full
Playtest and Quality Critic always evaluate the **whole accumulated
project** (via `project-map.md` + the running task/milestone history), not
just the newest milestone's tasks. This is the same safety net that already
caught real regressions today — extending it across milestones instead of
across reopen-rounds requires no new mechanism, just feeding it the growing
project state.

## Explicitly out of scope for this spec

- Any change to `build-game.js` or `fix-reopened.js` themselves.
- Automated cost/token budgeting or estimation before a milestone run
  starts (a human decides whether to launch, same as every run today).
- Multi-user or multi-session concurrency beyond what already exists
  (`.pipeline/` file-based state, one session at a time).
