# milestone-build resumability

Date: 2026-08-31
Status: Approved design, pending implementation plan

## Purpose

`milestone-build.js` always starts fresh at the Roadmap phase: every
invocation unconditionally regenerates `vision.md`/`roadmap.md`/
`milestone-status.json`/`project-map.md` via `roadmapPrompt`, then runs a
brand-new Design phase for the first milestone. There is no code path that
reads existing `.pipeline` state to skip milestones already built or resume
one that stalled mid-way.

This was confirmed live: a real run against a cozy farming-sim (7-milestone
roadmap) got M1 stuck in a whack-a-mole loop across its reopen rounds
(Ground/Player/Camera bounds fixes each breaking a sibling — the exact class
of bug the same-session `relatedTaskIds`/`relatedTasks` Critic/Fixer
coordination mechanism now exists to prevent), exhausted its reopen-round
budget, and the whole workflow simply stopped with M1 blocked — without even
updating `milestone-status.json` to reflect the stop (it was left showing
`chainStatus: "in_progress"`, M1 `"current"`, hours stale). Relaunching
`milestone-build` today would blindly regenerate the roadmap and redo M1's
Design phase from scratch, discarding the real, mostly-working Farm scene
already built.

This spec adds real resumability: the ability to pick a chained build back
up — skip milestones already done, retry one that stalled — without
rebuilding what already exists, using the same command/args every time.

## Non-goals

- Not a rewrite of the per-milestone build loop itself (Design → Design
  Review → Implementation → [Full Playtest → Quality Gate → Report] →
  Roadmap Review stays the same shape for a milestone actually being built).
- Not a general checkpoint/resume system for `build-game.js` or
  `fix-reopened.js` — those are single-shot by design; this is specific to
  `milestone-build`'s chain.
- Not a fix for every possible mid-run crash (e.g. a crash mid-Design-phase,
  before that milestone ever produces a backlog) — that case is handled by
  falling back to treating the milestone as not-yet-started (see "Loading
  the current milestone" below), not by trying to recover partial Design
  output.

## Trigger: same command, detected automatically

No new CLI flag or `args` field. `milestone-build` is invoked exactly as
before (same `sourceDocument`, `targetProjectPath`). At the very start, a
lightweight step reads `.pipeline/milestone-status.json` from
`targetProjectPath` and decides:

- Missing, unparseable, or `chainStatus: "complete"` → **fresh start**,
  today's behavior unchanged (Roadmap phase runs, everything regenerates).
- `chainStatus: "in_progress"` or `"blocked"` → **resume mode** (see below).
- `chainStatus: "escalated"` → the workflow does NOT auto-resume. It logs
  the escalation reason (from `roadmap.md`, where `roadmapReviewPrompt`
  already writes it) and returns immediately without touching any state.
  Escalation exists specifically so a human makes the call; auto-resuming
  through it would defeat that. To continue after addressing whatever was
  escalated, edit `milestone-status.json`'s `chainStatus` back to
  `"in_progress"` (and adjust the roadmap/backlog by hand if the escalation
  called for a plan change) — then the next run resumes normally.

## State contract additions

1. **Per-milestone snapshots.** When a milestone's reopen-loop finishes
   (whether or not `finalReview.ready`), it writes
   `${targetProjectPath}/.pipeline/milestones/<id>/backlog.json` (the
   milestone's own task list, each task's final `status`/`attempts`) and
   `${targetProjectPath}/.pipeline/milestones/<id>/gdd.md` (that milestone's
   GDD text). The top-level `.pipeline/backlog.json`/`gdd.md` continue to be
   written exactly as today (mirroring only the milestone currently being
   built) — nothing reads or writes them differently. This is a pure
   addition, not a migration of the existing file pair.

2. **`chainStatus: "blocked"`.** A fourth value alongside the existing
   `"in_progress"`/`"escalated"`/`"complete"`. Set when a milestone's own
   reopen-loop exhausts `MAX_MILESTONE_REOPEN_ROUNDS` without
   `finalReview.ready` and the chain stops as a result — the exact situation
   that left M1's status file stale today. `currentMilestoneId` stays
   pointing at that milestone (it is not "done"), so resume knows to retry
   its reopen-loop rather than skip it. This status write happens
   unconditionally as part of the per-milestone snapshot step (item 1),
   independent of whether Roadmap Review ever runs — today the file update
   only happens inside `roadmapReviewPrompt`, which is skipped entirely when
   `!finalReview.ready` (the workflow `break`s before reaching that phase),
   which is exactly why the file was left stale.

## Resuming: loading prior state

A new prompt, `resumeStatePrompt(targetProjectPath)` (added to
`prompts/roadmap.js`, following its existing pattern), dispatched as a short
new phase (`"Resume"`) that runs only in resume mode, before the
per-milestone loop:

- Reads `roadmap.md`, `vision.md`, and `milestone-status.json`.
- For every milestone marked `"done"` in the status file, reads
  `.pipeline/milestones/<id>/backlog.json` + `gdd.md` and returns them as a
  `{id, gdd, tasks}` entry.
- For the milestone marked `"current"` (if any), attempts the same read at
  `.pipeline/milestones/<id>/backlog.json` + `gdd.md`. If that doesn't exist
  yet (the milestone never reached a snapshot write under this new scheme —
  true for any chain that stalled before this feature shipped, M1's
  farming-sim run included), it falls back to reading the top-level
  `.pipeline/backlog.json`/`gdd.md` and checking whether every task id there
  is prefixed `<id>-` (the Designer already enforces this prefix on every
  task, specifically so this check is reliable) — if so, treats that as the
  milestone's snapshot. If neither exists or the prefix doesn't match,
  returns `null` for this field, meaning "no usable snapshot" — see below.
- Returns structured data: `{ vision, remainingMilestones, doneMilestones:
  [{id, gdd, tasks}], currentMilestoneSnapshot: {id, gdd, tasks} | null }`.
  `remainingMilestones` is read directly off `roadmap.md`'s ordered list,
  filtered to drop anything already `"done"`.

Back in the workflow script:

- `vision` = the loaded vision (skips `roadmapPrompt` entirely).
- `milestones` = `remainingMilestones` (current milestone first, if any,
  then pending ones — same order the fresh-start path already produces from
  `roadmapResult.milestones`).
- `accumulatedTaskResults` seeds from `doneMilestones`, each task mapped to
  `{task, status: task.status, attempts: task.attempts, lastResult: null,
  animationResult: null}` — synthetic result objects. This is a deliberate
  simplification: `lastResult`/`animationResult` were never persisted
  per-task, only `status`/`attempts` (backlog.json's own fields). Consumers
  of `accumulatedTaskResults` (`fullPlaytestPrompt`, which only needs
  `task`; `qualityCritiquePrompt`/`finalReviewPrompt`, which get the array
  for context but — per their existing design — re-inspect the live Unity
  project directly rather than trusting stored text) tolerate this fine.
- `accumulatedGdds` seeds from `doneMilestones` the same way it does today
  from milestones built earlier in the same run.

## Loading the current milestone

In the per-milestone loop, when `m === 0` and `currentMilestoneSnapshot` is
non-null and its `id` matches `milestones[0].id`: skip the Design and Design
Review phases entirely. Set `design = { gdd: currentMilestoneSnapshot.gdd,
tasks: currentMilestoneSnapshot.tasks }` directly and proceed straight to
Implementation with the loop's existing logic unchanged — which, since every
task's `status` is whatever it last was (`"done"`, `"blocked"`, or `"todo"`
if it never got attempted), re-runs `implementAndTestTask` for it via the
same `pipeline(design.tasks, ...)` call already in the loop today (this
call doesn't currently check status before re-running a task — that stays
true here too; a `"done"` task still gets re-verified this round rather than
blindly trusted, which is consistent with the loop always re-running Full
Playtest/Quality Gate against everything regardless of prior status).

If `currentMilestoneSnapshot` is `null` (missing snapshot AND the top-level
fallback didn't match), the milestone is treated exactly like a fresh
`"pending"` one — Design runs normally. This only happens for a chain that
crashed before its first milestone ever produced any backlog at all.

`"blocked"` always leaves a `"current"` entry by construction (see the state
contract above), so the no-`"current"`-entry case is only reachable when the
prior run's last action was a completed Roadmap Review that advanced past
the last `"done"` milestone without yet designing the next one. There, the
loop simply starts at `milestones[0]` (the first `"pending"` entry), same as
fresh start.

## How this resolves the M1 case specifically

M1's farming-sim run never wrote a per-milestone snapshot (the feature
didn't exist yet), but its own top-level `.pipeline/backlog.json` is still
M1's own backlog — nothing overwrote it, since the chain never advanced past
M1. Its task ids are already `M1-T1`/`M1-T2`/`M1-T3` (the Designer's
existing prefix rule). So the top-level fallback in "Resuming: loading prior
state" picks it up directly: relaunching `milestone-build` with the exact
same command it was originally run with will detect `chainStatus:
"in_progress"`, resume, load M1's existing backlog via the fallback, skip
Design, and re-enter M1's reopen-loop — now with the `relatedTasks`
coordination mechanism already in place to actually converge instead of
whack-a-moling between Ground/Player/Camera fixes. No separate
`fix-reopened` run is needed for this case.

## Testing

- `resumeStatePrompt` gets the same prompt-smoke-test coverage as the rest
  of `roadmap.js` (`prompts.test.js`): includes the target path, mentions
  the fallback-prefix check, omits nothing required by
  `RESUME_STATE_SCHEMA`.
- A new `RESUME_STATE_SCHEMA` (in `schemas.js`) with `vision`,
  `remainingMilestones` (array of `MILESTONE_SCHEMA`), `doneMilestones`
  (array of `{id, gdd, tasks}`), `currentMilestoneSnapshot` (nullable
  `{id, gdd, tasks}`) — covered by the same schema-shape tests
  `schemas.test.js` already uses for the other schemas in this file.
- Full regeneration (`node bin/build-workflow.js`) and `node --test` must
  stay green, same as every other change to this codebase.
