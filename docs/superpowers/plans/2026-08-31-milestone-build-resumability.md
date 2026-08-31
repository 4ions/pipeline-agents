# milestone-build Resumability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let `milestone-build` resume a chained build from where it stalled — skipping milestones already done and retrying (not re-designing) the one in progress — using the exact same command/args every time.

**Architecture:** A new `resumeStatePrompt` reads `.pipeline/milestone-status.json` at the very start of every run and classifies it as `fresh` (today's behavior, unchanged), `resume` (loads vision + remaining milestones + prior milestones' persisted task snapshots), or `escalated` (stops, tells the human why). A new `milestoneSnapshotPrompt` persists each milestone's own backlog/GDD to `.pipeline/milestones/<id>/` unconditionally at the end of its reopen-loop (whether or not it passed), and marks the chain `"blocked"` in `milestone-status.json` when it didn't — the exact update that's missing today, which is why a stalled chain's status file is currently left lying about being `"in_progress"` forever.

**Tech Stack:** Plain ES modules (no build step), `node --test` for unit tests, the repo's own `Workflow` script format (`agent()`/`pipeline()`/`phase()`/`log()`) for `workflows/*.body.js`.

**Spec:** `docs/superpowers/specs/2026-08-31-milestone-build-resumability-design.md`

## Global Constraints

- `prompts/*.js` files are standalone ES modules with **no cross-file imports** — `bin/build-workflow.js` concatenates them (after stripping `export`) into each generated `workflows/*.js`. Any text shared between prompt functions must be duplicated inline, never imported.
- Workflow body files (`workflows/*.body.js`) have **no filesystem access** — every read or write happens through an `agent()` call whose dispatched agent has real tools. The script itself only branches on the structured data an `agent()` call returns.
- Every `phase(...)` call's title must appear verbatim in that file's `export const meta = { phases: [...] }` array.
- Every new prompt function needs `prompts/prompts.test.js` smoke-test coverage (assert the prompt string contains the key parameters/instructions it must contain). Every new schema needs `prompts/schemas.test.js` shape coverage, matching this repo's existing style exactly (see `MILESTONE_SCHEMA`/`ROADMAP_SCHEMA`/`ROADMAP_REVIEW_SCHEMA` and their tests).
- After any change to `prompts/*.js` or `workflows/*.body.js`, regenerate with `node bin/build-workflow.js` and the full suite (`node --test`) must stay green. It is 61/61 green before this plan starts.
- `MILESTONE_SCHEMA`'s task-id-prefix convention (`designPrompt` already enforces every milestone's task ids are prefixed `"<milestoneId>-"`) is load-bearing for this plan's fallback logic — do not weaken or remove that enforcement.

---

### Task 1: `RESUME_STATE_SCHEMA` and `MILESTONE_SNAPSHOT_SCHEMA`

**Files:**
- Modify: `prompts/schemas.js`
- Test: `prompts/schemas.test.js`

**Interfaces:**
- Consumes: `VISION_SCHEMA`, `MILESTONE_SCHEMA`, `BACKLOG_TASK_SCHEMA` (all already defined earlier in `prompts/schemas.js`).
- Produces: `MILESTONE_SNAPSHOT_SCHEMA` — `{id: string, gdd: string, tasks: BACKLOG_TASK_SCHEMA[]}`. `RESUME_STATE_SCHEMA` — `{mode: "fresh"|"resume"|"escalated", escalationReason?: string, vision?: VISION_SCHEMA, remainingMilestones?: MILESTONE_SCHEMA[], doneMilestones?: MILESTONE_SNAPSHOT_SCHEMA[], currentMilestoneSnapshot?: MILESTONE_SNAPSHOT_SCHEMA|null}`. Task 2 and Task 4 both import/use `RESUME_STATE_SCHEMA` by name (workflow body files reference it as a bare identifier after `bin/build-workflow.js` concatenation — no import statement).

- [ ] **Step 1: Write the failing tests**

Add to `prompts/schemas.test.js`, right after the existing `ROADMAP_REVIEW_SCHEMA` test (end of file) and adding `MILESTONE_SNAPSHOT_SCHEMA, RESUME_STATE_SCHEMA` to the existing import line at the top:

```js
import { VISION_SCHEMA, BACKLOG_SCHEMA, TEST_RESULT_SCHEMA, PLAYTEST_SCHEMA, QUALITY_CRITIQUE_SCHEMA, DESIGN_REVIEW_SCHEMA, MILESTONE_SCHEMA, ROADMAP_SCHEMA, ROADMAP_REVIEW_SCHEMA, MILESTONE_SNAPSHOT_SCHEMA, RESUME_STATE_SCHEMA } from './schemas.js'
```

```js
test('MILESTONE_SNAPSHOT_SCHEMA requires id, gdd, and tasks, and tasks items match BACKLOG_SCHEMA task shape', () => {
  assert.deepEqual(new Set(MILESTONE_SNAPSHOT_SCHEMA.required), new Set(['id', 'gdd', 'tasks']))
  assert.equal(MILESTONE_SNAPSHOT_SCHEMA.properties.tasks.items, BACKLOG_SCHEMA.properties.tasks.items)
})

test('RESUME_STATE_SCHEMA requires only mode, and mode enum is fresh/resume/escalated', () => {
  assert.deepEqual(RESUME_STATE_SCHEMA.required, ['mode'])
  assert.deepEqual(RESUME_STATE_SCHEMA.properties.mode.enum, ['fresh', 'resume', 'escalated'])
})

test('RESUME_STATE_SCHEMA remainingMilestones/doneMilestones/currentMilestoneSnapshot reuse MILESTONE_SCHEMA/MILESTONE_SNAPSHOT_SCHEMA', () => {
  assert.equal(RESUME_STATE_SCHEMA.properties.remainingMilestones.items, MILESTONE_SCHEMA)
  assert.equal(RESUME_STATE_SCHEMA.properties.doneMilestones.items, MILESTONE_SNAPSHOT_SCHEMA)
  assert.deepEqual(new Set(RESUME_STATE_SCHEMA.properties.currentMilestoneSnapshot.type), new Set(['object', 'null']))
  assert.equal(RESUME_STATE_SCHEMA.properties.currentMilestoneSnapshot.properties, MILESTONE_SNAPSHOT_SCHEMA.properties)
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test prompts/schemas.test.js`
Expected: FAIL — `MILESTONE_SNAPSHOT_SCHEMA`/`RESUME_STATE_SCHEMA` are not exported from `./schemas.js` yet.

- [ ] **Step 3: Implement the schemas**

Add to the end of `prompts/schemas.js` (after the existing `PLAYTEST_SCHEMA` export, which is currently the last thing in the file):

```js
export const MILESTONE_SNAPSHOT_SCHEMA = {
  type: 'object',
  required: ['id', 'gdd', 'tasks'],
  properties: {
    id: { type: 'string', description: 'The milestone id this snapshot belongs to, e.g. "M1"' },
    gdd: { type: 'string', description: 'This milestone\'s own GDD text, as last written' },
    tasks: { type: 'array', items: BACKLOG_SCHEMA.properties.tasks.items, description: 'This milestone\'s own task list, each with its final status/attempts' },
  },
}

export const RESUME_STATE_SCHEMA = {
  type: 'object',
  required: ['mode'],
  properties: {
    mode: {
      type: 'string',
      enum: ['fresh', 'resume', 'escalated'],
      description: '"fresh" = no prior state, run the normal roadmap-from-scratch path. "resume" = prior state found, pick the chain back up. "escalated" = the chain is waiting on a human decision, do not touch anything.',
    },
    escalationReason: { type: 'string', description: 'Only present when mode is "escalated" — why the chain needs a human decision' },
    vision: { ...VISION_SCHEMA, description: 'Only present when mode is "resume" — the vision loaded from vision.md' },
    remainingMilestones: {
      type: 'array',
      items: MILESTONE_SCHEMA,
      description: 'Only present when mode is "resume" — every not-yet-done milestone, in roadmap order, the "current" one (if any) first',
    },
    doneMilestones: {
      type: 'array',
      items: MILESTONE_SNAPSHOT_SCHEMA,
      description: 'Only present when mode is "resume" — one entry per milestone already marked "done", loaded from its persisted snapshot',
    },
    currentMilestoneSnapshot: {
      type: ['object', 'null'],
      properties: MILESTONE_SNAPSHOT_SCHEMA.properties,
      description: 'Only present when mode is "resume". The "current" milestone\'s own snapshot if one is usable, otherwise null (meaning: treat it as not-yet-started and design it fresh)',
    },
  },
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test prompts/schemas.test.js`
Expected: PASS, all tests including the 3 new ones.

- [ ] **Step 5: Commit**

```bash
git add prompts/schemas.js prompts/schemas.test.js
git commit -m "Add RESUME_STATE_SCHEMA and MILESTONE_SNAPSHOT_SCHEMA for milestone-build resumability"
```

---

### Task 2: `resumeStatePrompt`

**Files:**
- Modify: `prompts/roadmap.js`
- Test: `prompts/prompts.test.js`

**Interfaces:**
- Consumes: no imports (standalone ES module function, per Global Constraints).
- Produces: `resumeStatePrompt(targetProjectPath): string`. Task 4 calls this as `agent(resumeStatePrompt(args.targetProjectPath), { schema: RESUME_STATE_SCHEMA, phase: 'Resume' })`.

- [ ] **Step 1: Write the failing tests**

Add to `prompts/prompts.test.js`, right after the existing `roadmapReviewPrompt` test (end of file), and add `resumeStatePrompt` to the existing roadmap.js import line:

```js
import { roadmapPrompt, roadmapReviewPrompt, resumeStatePrompt } from './roadmap.js'
```

```js
test('resumeStatePrompt includes the target project path and explains all three modes with their trigger conditions', () => {
  const result = resumeStatePrompt(FIXTURE_TARGET_PATH)
  assert.equal(typeof result, 'string')
  assert.ok(result.includes(FIXTURE_TARGET_PATH))
  assert.ok(result.includes('milestone-status.json'))
  assert.ok(result.includes('"fresh"'))
  assert.ok(result.includes('"resume"'))
  assert.ok(result.includes('"escalated"'))
  assert.ok(result.includes('complete'), 'must explain that chainStatus "complete" means fresh, not resume')
})

test('resumeStatePrompt explains the per-milestone snapshot path and the top-level-backlog prefix fallback', () => {
  const result = resumeStatePrompt(FIXTURE_TARGET_PATH)
  assert.ok(result.includes('.pipeline/milestones/'))
  assert.ok(result.includes('backlog.json'))
  assert.ok(result.includes('currentMilestoneSnapshot'))
  assert.ok(result.toLowerCase().includes('prefix'), 'must explain the "<id>-" task-id-prefix fallback check')
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test prompts/prompts.test.js`
Expected: FAIL — `resumeStatePrompt` is not exported from `./roadmap.js` yet.

- [ ] **Step 3: Implement `resumeStatePrompt`**

Add to `prompts/roadmap.js`, after the existing `roadmapPrompt` function and before `roadmapReviewPrompt`:

```js
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
- remainingMilestones: every milestone listed in roadmap.md whose id is
  NOT marked "done" in milestone-status.json, in the SAME order roadmap.md
  lists them (the "current" one, if any, comes first there already).

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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test prompts/prompts.test.js`
Expected: PASS, all tests including the 2 new ones.

- [ ] **Step 5: Commit**

```bash
git add prompts/roadmap.js prompts/prompts.test.js
git commit -m "Add resumeStatePrompt to load prior milestone-build state on resume"
```

---

### Task 3: `milestoneSnapshotPrompt`

**Files:**
- Modify: `prompts/roadmap.js`
- Test: `prompts/prompts.test.js`

**Interfaces:**
- Consumes: no imports.
- Produces: `milestoneSnapshotPrompt(milestone, taskResults, gdd, finalReview, targetProjectPath): string`, where `milestone` is `{id, description, ...}` (a `MILESTONE_SCHEMA` item), `taskResults` is an array of `{task, status, attempts, ...}` (the shape `currentTaskResults` already has in `workflows/milestone-build.body.js`), `gdd` is a string, `finalReview` is `{ready, reopenTaskIds, summary}` or `null`. Task 4 calls this as `agent(milestoneSnapshotPrompt(milestone, currentTaskResults, design.gdd, finalReview, args.targetProjectPath), { phase: 'Snapshot' })` — no `schema` (pure file-write step, same pattern as e.g. `artPrompt`'s existing schema-less `agent()` calls).

- [ ] **Step 1: Write the failing tests**

Add to `prompts/prompts.test.js`, right after the `resumeStatePrompt` tests added in Task 2, and add `milestoneSnapshotPrompt` to the existing roadmap.js import line:

```js
import { roadmapPrompt, roadmapReviewPrompt, resumeStatePrompt, milestoneSnapshotPrompt } from './roadmap.js'
```

```js
const FIXTURE_MILESTONE = { id: 'M1', description: 'Farm scene & player movement', scope: 'a small top-down farm plot', dependsOn: [] }

test('milestoneSnapshotPrompt includes the milestone id, the task snapshot, and the per-milestone file paths', () => {
  const taskResults = [{ task: FIXTURE_TASK, status: 'done', attempts: 1, lastResult: { passed: true, evidence: 'it worked' } }]
  const result = milestoneSnapshotPrompt(FIXTURE_MILESTONE, taskResults, 'a short GDD', { ready: true, reopenTaskIds: [], summary: 'all good' }, FIXTURE_TARGET_PATH)
  assert.equal(typeof result, 'string')
  assert.ok(result.includes(FIXTURE_TARGET_PATH))
  assert.ok(result.includes(`.pipeline/milestones/${FIXTURE_MILESTONE.id}/backlog.json`))
  assert.ok(result.includes(`.pipeline/milestones/${FIXTURE_MILESTONE.id}/gdd.md`))
  assert.ok(result.includes(FIXTURE_TASK.id))
  assert.ok(result.includes('a short GDD'))
})

test('milestoneSnapshotPrompt instructs updating milestone-status.json to "blocked" only when finalReview is not ready', () => {
  const taskResults = [{ task: FIXTURE_TASK, status: 'blocked', attempts: 4, lastResult: { passed: false, evidence: 'still broken' } }]

  const notReady = milestoneSnapshotPrompt(FIXTURE_MILESTONE, taskResults, 'a short GDD', { ready: false, reopenTaskIds: [FIXTURE_TASK.id], summary: 'still broken' }, FIXTURE_TARGET_PATH)
  assert.ok(notReady.includes('"blocked"'))
  assert.ok(notReady.includes('milestone-status.json'))

  const ready = milestoneSnapshotPrompt(FIXTURE_MILESTONE, taskResults, 'a short GDD', { ready: true, reopenTaskIds: [], summary: 'all good' }, FIXTURE_TARGET_PATH)
  assert.ok(!ready.includes('"blocked"'))

  const missingReview = milestoneSnapshotPrompt(FIXTURE_MILESTONE, taskResults, 'a short GDD', null, FIXTURE_TARGET_PATH)
  assert.ok(missingReview.includes('"blocked"'), 'a missing final review must be treated the same as not-ready')
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test prompts/prompts.test.js`
Expected: FAIL — `milestoneSnapshotPrompt` is not exported from `./roadmap.js` yet.

- [ ] **Step 3: Implement `milestoneSnapshotPrompt`**

Add to `prompts/roadmap.js`, after `resumeStatePrompt` and before `roadmapReviewPrompt`:

```js
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test prompts/prompts.test.js`
Expected: PASS, all tests including the 2 new ones.

- [ ] **Step 5: Commit**

```bash
git add prompts/roadmap.js prompts/prompts.test.js
git commit -m "Add milestoneSnapshotPrompt to persist per-milestone backlog/gdd and chain-blocked status"
```

---

### Task 4: Wire resumability into `workflows/milestone-build.body.js`

**Files:**
- Modify: `workflows/milestone-build.body.js`
- Generated (do not hand-edit): `workflows/milestone-build.js`

**Interfaces:**
- Consumes: `resumeStatePrompt`, `milestoneSnapshotPrompt` (Tasks 2-3), `RESUME_STATE_SCHEMA` (Task 1) — all available as bare identifiers in the generated file (no imports; `bin/build-workflow.js` already concatenates `prompts/roadmap.js` and `prompts/schemas.js` ahead of this body file for `milestone-build.js` — confirmed by the existing top-of-file comment in `workflows/milestone-build.body.js`).
- Produces: nothing new consumed elsewhere — this is the top-level workflow script.

- [ ] **Step 1: Add the two new phases to `meta.phases`**

In `workflows/milestone-build.body.js`, replace:

```js
export const meta = {
  name: 'milestone-build',
  description: 'Build a large-scope game incrementally across chained, roadmap-driven milestones',
  phases: [
    { title: 'Roadmap' },
    { title: 'Design' },
    { title: 'Design Review' },
    { title: 'Implementation' },
    { title: 'Full Playtest' },
    { title: 'Quality Gate' },
    { title: 'Report' },
    { title: 'Roadmap Review' },
  ],
}
```

with:

```js
export const meta = {
  name: 'milestone-build',
  description: 'Build a large-scope game incrementally across chained, roadmap-driven milestones',
  phases: [
    { title: 'Resume' },
    { title: 'Roadmap' },
    { title: 'Design' },
    { title: 'Design Review' },
    { title: 'Implementation' },
    { title: 'Full Playtest' },
    { title: 'Quality Gate' },
    { title: 'Report' },
    { title: 'Snapshot' },
    { title: 'Roadmap Review' },
  ],
}
```

- [ ] **Step 2: Replace the unconditional Roadmap block with Resume-aware setup**

Replace the entire block from `phase('Roadmap')` through the `const accumulatedGdds = []` line (currently these lines, right after the `implementAndTestTask` function definition and before the `for (let m = 0; ...)` loop):

```js
phase('Roadmap')
const roadmapResult = await agent(roadmapPrompt(args.sourceDocument, args.targetProjectPath), {
  schema: ROADMAP_SCHEMA,
  phase: 'Roadmap',
})
if (!roadmapResult || !Array.isArray(roadmapResult.milestones) || roadmapResult.milestones.length === 0) {
  log('Director/Designer failed to produce a usable roadmap — aborting.')
  return { error: 'roadmap_generation_failed' }
}

const vision = roadmapResult.vision
let milestones = roadmapResult.milestones
const milestoneHistory = []
// Flat accumulator of every task result across ALL milestones built so
// far (not just the current one) — fed into Full Playtest/Quality
// Gate/Report below so they evaluate the WHOLE accumulated project each
// time, per the design spec's "Regression across milestones" section.
// Without this, a milestone's playtest/critique would only know about
// that milestone's own tasks and couldn't specifically re-verify earlier
// milestones' features.
const accumulatedTaskResults = []
// Same accumulation pattern as accumulatedTaskResults, for the same
// reason: qualityCritiquePrompt/finalReviewPrompt need the WHOLE
// project's design context, not just the newest milestone's GDD, or
// earlier milestones' features get judged against a document that never
// mentions them.
const accumulatedGdds = []
```

with:

```js
// Every invocation checks for prior state first, using the same
// sourceDocument/targetProjectPath args every time — there is no separate
// "resume" flag. See docs/superpowers/specs/2026-08-31-milestone-build-resumability-design.md.
phase('Resume')
const resumeState = await agent(resumeStatePrompt(args.targetProjectPath), {
  schema: RESUME_STATE_SCHEMA,
  phase: 'Resume',
})
if (resumeState && resumeState.mode === 'escalated') {
  log(`Resume check: chain is escalated, needs a human decision — ${resumeState.escalationReason || '(no reason returned)'}`)
  return { error: 'escalated', reason: resumeState.escalationReason || null }
}
const isResuming = !!(
  resumeState &&
  resumeState.mode === 'resume' &&
  resumeState.vision &&
  Array.isArray(resumeState.remainingMilestones) &&
  resumeState.remainingMilestones.length > 0
)

let vision
let milestones
if (isResuming) {
  vision = resumeState.vision
  milestones = resumeState.remainingMilestones
} else {
  phase('Roadmap')
  const roadmapResult = await agent(roadmapPrompt(args.sourceDocument, args.targetProjectPath), {
    schema: ROADMAP_SCHEMA,
    phase: 'Roadmap',
  })
  if (!roadmapResult || !Array.isArray(roadmapResult.milestones) || roadmapResult.milestones.length === 0) {
    log('Director/Designer failed to produce a usable roadmap — aborting.')
    return { error: 'roadmap_generation_failed' }
  }
  vision = roadmapResult.vision
  milestones = roadmapResult.milestones
}

const milestoneHistory = []
// Flat accumulator of every task result across ALL milestones built so
// far (not just the current one) — fed into Full Playtest/Quality
// Gate/Report below so they evaluate the WHOLE accumulated project each
// time, per the design spec's "Regression across milestones" section.
// Without this, a milestone's playtest/critique would only know about
// that milestone's own tasks and couldn't specifically re-verify earlier
// milestones' features. On a resume, seeded below from resumeState's
// doneMilestones instead of starting empty.
const accumulatedTaskResults = []
// Same accumulation pattern as accumulatedTaskResults, for the same
// reason: qualityCritiquePrompt/finalReviewPrompt need the WHOLE
// project's design context, not just the newest milestone's GDD, or
// earlier milestones' features get judged against a document that never
// mentions them.
const accumulatedGdds = []
// Non-null only on a resume where the "current" milestone has a usable
// snapshot (see resumeStatePrompt) — lets the loop below skip re-running
// Design/Design Review for exactly that one milestone.
const currentMilestoneSnapshot = isResuming && resumeState.currentMilestoneSnapshot ? resumeState.currentMilestoneSnapshot : null

if (isResuming && Array.isArray(resumeState.doneMilestones)) {
  for (const dm of resumeState.doneMilestones) {
    if (!dm || !Array.isArray(dm.tasks)) continue
    accumulatedGdds.push({ id: dm.id, gdd: dm.gdd })
    for (const t of dm.tasks) {
      accumulatedTaskResults.push({ task: t, status: t.status, attempts: t.attempts, lastResult: null, animationResult: null })
    }
  }
  log(`Resume check: resuming — ${resumeState.doneMilestones.length} done milestone(s) loaded, ${milestones.length} remaining, ${currentMilestoneSnapshot ? `current milestone "${currentMilestoneSnapshot.id}" snapshot loaded (${currentMilestoneSnapshot.tasks.length} task(s))` : 'no usable current-milestone snapshot — it will be designed fresh'}.`)
} else {
  log('Resume check: fresh start.')
}
```

- [ ] **Step 3: Skip Design/Design Review for the resumed current milestone**

Inside the `for (let m = 0; m < MAX_MILESTONES; m++) { ... }` loop, replace the block starting at `phase('Design')` and ending at the closing `}` of the Design Review `for` loop (currently everything from `phase('Design')` through the line `design = revised` and its closing braces, right after the `milestoneVision` object literal and right before `const allGddsSoFar = ...`):

```js
  phase('Design')
  let design = await agent(designPrompt(milestoneVision, args.targetProjectPath), {
    schema: BACKLOG_SCHEMA,
    phase: 'Design',
    label: `design:${milestone.id}:1`,
  })
  if (!design || !Array.isArray(design.tasks)) {
    log(`Milestone ${milestone.id}: Designer failed to produce a backlog — stopping the chain rather than guessing.`)
    milestoneHistory.push({ milestone, error: 'design_generation_failed' })
    break
  }

  phase('Design Review')
  let designReview = null
  for (let round = 1; round <= MAX_DESIGN_REVIEW_ROUNDS; round++) {
    designReview = await agent(designReviewPrompt(milestoneVision, design.gdd, design, args.targetProjectPath), {
      schema: DESIGN_REVIEW_SCHEMA,
      phase: 'Design Review',
      label: `design-review:${milestone.id}:${round}`,
    })
    if (!designReview) {
      log('Director failed to return a design review — proceeding with the unreviewed backlog.')
      break
    }
    if (designReview.approved) break
    if (round === MAX_DESIGN_REVIEW_ROUNDS) {
      log(`Design review round ${round}: still not approved after ${MAX_DESIGN_REVIEW_ROUNDS} rounds — proceeding with the Designer's latest backlog anyway rather than blocking indefinitely.`)
      break
    }
    log(`Design review round ${round}: sent back — ${designReview.feedback}`)
    const revised = await agent(designPrompt(milestoneVision, args.targetProjectPath, designReview.feedback), {
      schema: BACKLOG_SCHEMA,
      phase: 'Design Review',
      label: `design:${milestone.id}:${round + 1}`,
    })
    if (!revised || !Array.isArray(revised.tasks)) {
      log('Designer failed to produce a revised backlog — proceeding with the previous version.')
      break
    }
    design = revised
  }
```

with:

```js
  const isResumingThisMilestone = m === 0 && currentMilestoneSnapshot && currentMilestoneSnapshot.id === milestone.id

  let design
  if (isResumingThisMilestone) {
    design = { gdd: currentMilestoneSnapshot.gdd, tasks: currentMilestoneSnapshot.tasks }
    log(`Milestone ${milestone.id}: resuming from its existing snapshot — skipping Design/Design Review, ${design.tasks.length} task(s) loaded.`)
  } else {
    phase('Design')
    design = await agent(designPrompt(milestoneVision, args.targetProjectPath), {
      schema: BACKLOG_SCHEMA,
      phase: 'Design',
      label: `design:${milestone.id}:1`,
    })
    if (!design || !Array.isArray(design.tasks)) {
      log(`Milestone ${milestone.id}: Designer failed to produce a backlog — stopping the chain rather than guessing.`)
      milestoneHistory.push({ milestone, error: 'design_generation_failed' })
      break
    }

    phase('Design Review')
    let designReview = null
    for (let round = 1; round <= MAX_DESIGN_REVIEW_ROUNDS; round++) {
      designReview = await agent(designReviewPrompt(milestoneVision, design.gdd, design, args.targetProjectPath), {
        schema: DESIGN_REVIEW_SCHEMA,
        phase: 'Design Review',
        label: `design-review:${milestone.id}:${round}`,
      })
      if (!designReview) {
        log('Director failed to return a design review — proceeding with the unreviewed backlog.')
        break
      }
      if (designReview.approved) break
      if (round === MAX_DESIGN_REVIEW_ROUNDS) {
        log(`Design review round ${round}: still not approved after ${MAX_DESIGN_REVIEW_ROUNDS} rounds — proceeding with the Designer's latest backlog anyway rather than blocking indefinitely.`)
        break
      }
      log(`Design review round ${round}: sent back — ${designReview.feedback}`)
      const revised = await agent(designPrompt(milestoneVision, args.targetProjectPath, designReview.feedback), {
        schema: BACKLOG_SCHEMA,
        phase: 'Design Review',
        label: `design:${milestone.id}:${round + 1}`,
      })
      if (!revised || !Array.isArray(revised.tasks)) {
        log('Designer failed to produce a revised backlog — proceeding with the previous version.')
        break
      }
      design = revised
    }
  }
```

- [ ] **Step 4: Always write the per-milestone snapshot, before the ready/not-ready break**

Replace:

```js
  const milestoneResult = {
    milestone,
    taskResults: currentTaskResults,
    blocked: blocked.map(b => b.task.id),
    playtestResult,
    qualityCritique: critique,
    finalReview,
  }
  milestoneHistory.push(milestoneResult)

  if (!finalReview || !finalReview.ready) {
    log(`Milestone ${milestone.id} did not pass its own final review — stopping the chain rather than building the next milestone on a broken foundation.`)
    break
  }
```

with:

```js
  const milestoneResult = {
    milestone,
    taskResults: currentTaskResults,
    blocked: blocked.map(b => b.task.id),
    playtestResult,
    qualityCritique: critique,
    finalReview,
  }
  milestoneHistory.push(milestoneResult)

  phase('Snapshot')
  await agent(milestoneSnapshotPrompt(milestone, currentTaskResults, design.gdd, finalReview, args.targetProjectPath), {
    phase: 'Snapshot',
    label: `snapshot:${milestone.id}`,
  })

  if (!finalReview || !finalReview.ready) {
    log(`Milestone ${milestone.id} did not pass its own final review — stopping the chain rather than building the next milestone on a broken foundation.`)
    break
  }
```

- [ ] **Step 5: Regenerate the workflow and run the full suite**

Run: `node bin/build-workflow.js`
Expected: prints `Generated .../workflows/build-game.js`, `Generated .../workflows/fix-reopened.js`, `Generated .../workflows/milestone-build.js` with no errors — this confirms `export const meta = {...}` is still the literal first statement in `milestone-build.body.js` (the generator's brace-counting extraction requires this) and every `phase(...)` title matches an entry in `meta.phases`.

Run: `node --test`
Expected: PASS, all tests green (61 existing + 3 from Task 1 + 2 from Task 2 + 2 from Task 3 = 68 total).

- [ ] **Step 6: Commit**

```bash
git add workflows/milestone-build.body.js workflows/milestone-build.js
git commit -m "Wire resume detection, per-milestone snapshotting, and blocked-chain status into milestone-build"
```

---

## Final Verification

After Task 4:
- `node bin/build-workflow.js` regenerates all three workflows with no errors.
- `node --test` passes in full (68/68).
- Manually re-read `docs/superpowers/specs/2026-08-31-milestone-build-resumability-design.md` against the final diff: every section ("State contract additions", "Resuming: loading prior state", "Loading the current milestone", "How this resolves the M1 case specifically") has corresponding code — Task 1 covers the schema additions, Task 2+4-Step-2 cover the resume-loader and its wiring, Task 3+4-Step-4 cover the snapshot writer and the `"blocked"` status update, Task 4-Step-3 covers skipping Design/Design Review for the resumed current milestone (including the top-level-backlog-prefix fallback, which lives entirely inside `resumeStatePrompt`'s instructions from Task 2 — no separate code path needed for it since the fallback logic is something the dispatched agent performs, not the workflow script).
