# milestone-build Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a third Workflow (`milestone-build.js`) that builds a
large-scope game incrementally across chained, roadmap-driven milestones,
reusing every existing prompt/role/quality-gate mechanism verbatim.

**Architecture:** A new `roadmapPrompt` (Director+Designer read the full
source document and produce a `vision` + ordered `milestones` roadmap) runs
once. Then a bounded loop (`MAX_MILESTONES`) repeats the existing
Design→Design Review→Implementation→Full Playtest→Quality Gate→Report
sequence from `build-game.body.js`, scoped to one milestone at a time, and
ends each iteration with a new `roadmapReviewPrompt` (Director decides
`continue` / `escalate` / `complete`, optionally revising the remaining
roadmap). Two new persistent artifacts (`.pipeline/roadmap.md`,
`.pipeline/project-map.md`) track the plan and the as-built scene topology
across milestones.

**Tech Stack:** Node.js (ESM, zero runtime deps), `node:test`, the Workflow
tool's `agent()`/`pipeline()`/`phase()`/`log()` script API.

**Spec:** `docs/superpowers/specs/2026-08-30-milestone-build-design.md`

## Global Constraints

- No changes to `build-game.js`/`fix-reopened.js` or their `.body.js`
  sources — this plan only adds new files plus one additive extension to
  `bin/build-workflow.js`'s CLI entrypoint.
- No changes to `programmer.js`, `artist.js`, `tester.js`, `critic.js`,
  `designer.js`'s existing function signatures — every existing prompt is
  reused exactly as-is (per spec's Non-goals).
- Workflow body scripts have no filesystem access — anything that needs
  file content mid-run is read by an `agent()` call, never by the script
  itself. Anything the script needs across loop iterations must be a JS
  value returned by a prior `agent()` call.
- Every new/changed file gets `node --test` passing before its commit step.

---

### Task 1: Roadmap and milestone JSON schemas

**Files:**
- Modify: `prompts/schemas.js`
- Test: `prompts/schemas.test.js`

**Interfaces:**
- Produces: `MILESTONE_SCHEMA`, `ROADMAP_SCHEMA`, `ROADMAP_REVIEW_SCHEMA` —
  consumed by Task 2's `roadmap.js` prompts and Task 4's workflow body as
  the `schema:` option on their `agent()` calls.

- [ ] **Step 1: Write the failing tests**

Add to `prompts/schemas.test.js`:

```js
import { MILESTONE_SCHEMA, ROADMAP_SCHEMA, ROADMAP_REVIEW_SCHEMA } from './schemas.js'
```

(add these three names to the existing `import { ... } from './schemas.js'`
line at the top of the file, alongside the ones already imported)

```js
test('MILESTONE_SCHEMA requires id, description, scope, and dependsOn', () => {
  assert.deepEqual(new Set(MILESTONE_SCHEMA.required), new Set(['id', 'description', 'scope', 'dependsOn']))
  assert.equal(MILESTONE_SCHEMA.properties.dependsOn.type, 'array')
})

test('ROADMAP_SCHEMA requires vision and milestones, and milestones items match MILESTONE_SCHEMA', () => {
  assert.deepEqual(new Set(ROADMAP_SCHEMA.required), new Set(['vision', 'milestones']))
  assert.equal(ROADMAP_SCHEMA.properties.milestones.items, MILESTONE_SCHEMA)
  assert.equal(ROADMAP_SCHEMA.properties.vision, VISION_SCHEMA)
})

test('ROADMAP_REVIEW_SCHEMA requires verdict and reason, and verdict enum is continue/escalate/complete', () => {
  assert.deepEqual(new Set(ROADMAP_REVIEW_SCHEMA.required), new Set(['verdict', 'reason']))
  assert.deepEqual(ROADMAP_REVIEW_SCHEMA.properties.verdict.enum, ['continue', 'escalate', 'complete'])
  assert.equal(ROADMAP_REVIEW_SCHEMA.properties.revisedMilestones.items, MILESTONE_SCHEMA)
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test prompts/schemas.test.js`
Expected: FAIL — `MILESTONE_SCHEMA`/`ROADMAP_SCHEMA`/`ROADMAP_REVIEW_SCHEMA` are not exported yet.

- [ ] **Step 3: Implement the schemas**

Add to `prompts/schemas.js`, after `QUALITY_CRITIQUE_SCHEMA` (keep it near
the other review-verdict schemas, matching the file's existing grouping):

```js
export const MILESTONE_SCHEMA = {
  type: 'object',
  required: ['id', 'description', 'scope', 'dependsOn'],
  properties: {
    id: { type: 'string', description: 'Short stable id, e.g. "M1" — referenced by later dependsOn arrays and by roadmapReviewPrompt' },
    description: { type: 'string', description: 'What this milestone delivers, 1-3 sentences' },
    scope: { type: 'string', description: 'Concrete scope for this milestone only — small enough for one Design->Implementation->Playtest->Quality-Gate cycle to actually finish' },
    dependsOn: { type: 'array', items: { type: 'string' }, description: 'ids of earlier milestones this one requires; empty array if none' },
  },
}

export const ROADMAP_SCHEMA = {
  type: 'object',
  required: ['vision', 'milestones'],
  properties: {
    vision: VISION_SCHEMA,
    milestones: { type: 'array', items: MILESTONE_SCHEMA, description: 'Ordered — milestones[0] is built first' },
  },
}

export const ROADMAP_REVIEW_SCHEMA = {
  type: 'object',
  required: ['verdict', 'reason'],
  properties: {
    verdict: { type: 'string', enum: ['continue', 'escalate', 'complete'] },
    reason: { type: 'string', description: 'Why this verdict — required even for continue, so the run log explains itself' },
    revisedMilestones: { type: 'array', items: MILESTONE_SCHEMA, description: 'Only present when verdict is continue AND the remaining roadmap changed (reordered/split/merged/trimmed/added-to); omit or leave empty to keep the remaining roadmap as-is' },
  },
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test prompts/schemas.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add prompts/schemas.js prompts/schemas.test.js
git commit -m "Add roadmap/milestone JSON schemas for milestone-build"
```

---

### Task 2: `roadmapPrompt` and `roadmapReviewPrompt`

**Files:**
- Create: `prompts/roadmap.js`
- Modify: `prompts/prompts.test.js`

**Interfaces:**
- Consumes: `MILESTONE_SCHEMA`/`ROADMAP_SCHEMA`/`ROADMAP_REVIEW_SCHEMA`
  (Task 1) — used only as the `schema:` option by the workflow body (Task
  4), not imported inside `roadmap.js` itself (prompt files in this repo
  are standalone — no cross-file imports; see `prompts/critic.js` for the
  established pattern this follows).
- Produces: `roadmapPrompt(sourceDocument, targetProjectPath)` and
  `roadmapReviewPrompt(roadmap, milestoneResult, targetProjectPath)`,
  both returning prompt strings — consumed by Task 4's workflow body via
  `agent(roadmapPrompt(...), { schema: ROADMAP_SCHEMA, ... })` and
  `agent(roadmapReviewPrompt(...), { schema: ROADMAP_REVIEW_SCHEMA, ... })`.

- [ ] **Step 1: Write the failing tests**

Add to `prompts/prompts.test.js`:

```js
import { roadmapPrompt, roadmapReviewPrompt } from './roadmap.js'
```

(add this import line alongside the existing ones at the top of the file)

```js
test('roadmapPrompt includes the source document and target path', () => {
  const doc = 'A cozy farming sim with seasons, NPC relationships, and a mine.'
  const result = roadmapPrompt(doc, FIXTURE_TARGET_PATH)
  assert.equal(typeof result, 'string')
  assert.ok(result.includes(doc))
  assert.ok(result.includes(FIXTURE_TARGET_PATH))
  assert.ok(result.includes('project-map.md'))
})

test('roadmapReviewPrompt includes the remaining roadmap and the milestone result, and explains the verdict options', () => {
  const roadmap = { milestones: [{ id: 'M2', description: 'NPC schedules', scope: 'basic daily NPC movement', dependsOn: ['M1'] }] }
  const milestoneResult = { milestone: { id: 'M1', description: 'Day/night cycle' }, finalReview: { ready: true, summary: 'Day/night cycle works end to end.' } }
  const result = roadmapReviewPrompt(roadmap, milestoneResult, FIXTURE_TARGET_PATH)
  assert.equal(typeof result, 'string')
  assert.ok(result.includes('M2'))
  assert.ok(result.includes('Day/night cycle works end to end.'))
  assert.ok(result.includes('escalate'))
  assert.ok(result.includes('complete'))
  assert.ok(result.includes('project-map.md'))
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test prompts/prompts.test.js`
Expected: FAIL — cannot find module `./roadmap.js`

- [ ] **Step 3: Implement `prompts/roadmap.js`**

```js
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test prompts/prompts.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add prompts/roadmap.js prompts/prompts.test.js
git commit -m "Add roadmapPrompt and roadmapReviewPrompt"
```

---

### Task 3: Generate all three named workflows from one CLI command

**Files:**
- Modify: `bin/build-workflow.js`

**Interfaces:**
- Consumes: `generateWorkflowScript(promptFiles, bodyFile)` (already
  exported, unchanged — only the CLI entrypoint block at the bottom of the
  file changes).
- Produces: running `node bin/build-workflow.js` (no args) regenerates
  `workflows/build-game.js`, `workflows/fix-reopened.js`, AND (once Task 4
  adds the body file) `workflows/milestone-build.js` — replacing the
  ad-hoc one-off `node -e "..."` command used earlier in this project for
  `fix-reopened.js`.

- [ ] **Step 1: Replace the CLI entrypoint block**

Replace the existing CLI entrypoint block (everything after the
`generateWorkflowScript` function, from `// CLI entrypoint:` to the end of
the file) in `bin/build-workflow.js` with:

```js
// CLI entrypoint: `node bin/build-workflow.js` regenerates every named
// workflow below from its prompt files + body file.
const CORE_PROMPT_FILES = ['schemas.js', 'director.js', 'designer.js', 'programmer.js', 'artist.js', 'tester.js', 'critic.js']

const WORKFLOWS = [
  { name: 'build-game', promptFiles: CORE_PROMPT_FILES },
  { name: 'fix-reopened', promptFiles: CORE_PROMPT_FILES },
  { name: 'milestone-build', promptFiles: [...CORE_PROMPT_FILES, 'roadmap.js'] },
]

if (fileURLToPath(import.meta.url) === path.resolve(process.argv[1] ?? '')) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

  for (const { name, promptFiles } of WORKFLOWS) {
    const resolvedPromptFiles = promptFiles.map(f => path.join(root, 'prompts', f))
    const bodyFile = path.join(root, 'workflows', `${name}.body.js`)
    const outFile = path.join(root, 'workflows', `${name}.js`)

    const script = await generateWorkflowScript(resolvedPromptFiles, bodyFile)
    await writeFile(outFile, script, 'utf8')
    console.log(`Generated ${outFile}`)
  }
}
```

- [ ] **Step 2: Verify existing generator tests still pass**

Run: `node --test bin/build-workflow.test.js`
Expected: PASS (these test `generateWorkflowScript` directly with
temp-dir fixtures — unaffected by the CLI entrypoint change)

- [ ] **Step 3: Verify the CLI regenerates the two existing workflows correctly**

Run: `node bin/build-workflow.js`
Expected: prints `Generated .../workflows/build-game.js` and `Generated
.../workflows/fix-reopened.js`, then FAILS on milestone-build with "ENOENT
... milestone-build.body.js" (expected — Task 4 hasn't created that file
yet). Confirm `git diff workflows/build-game.js workflows/fix-reopened.js`
is empty (byte-identical regeneration) before moving on.

- [ ] **Step 4: Commit**

```bash
git add bin/build-workflow.js
git commit -m "Generate all named workflows from one CLI command"
```

---

### Task 4: `workflows/milestone-build.body.js`

**Files:**
- Create: `workflows/milestone-build.body.js`
- Modify (generated, not hand-edited): `workflows/milestone-build.js`

**Interfaces:**
- Consumes: `roadmapPrompt`, `roadmapReviewPrompt` (Task 2),
  `ROADMAP_SCHEMA`, `ROADMAP_REVIEW_SCHEMA` (Task 1), plus every existing
  prompt function this file reuses verbatim: `designPrompt`,
  `designReviewPrompt`, `implementPrompt`, `artPrompt`,
  `animatedArtPrompt`, `animationReviewPrompt`, `scenarioTestPrompt`,
  `fullPlaytestPrompt`, `qualityCritiquePrompt`, `finalReviewPrompt`, and
  `VISION_SCHEMA`, `BACKLOG_SCHEMA`, `DESIGN_REVIEW_SCHEMA`,
  `TEST_RESULT_SCHEMA`, `ANIMATION_REVIEW_SCHEMA`, `PLAYTEST_SCHEMA`,
  `QUALITY_CRITIQUE_SCHEMA` — all already defined by the time this body's
  content runs, per the generator's concatenation order (Task 3's
  `WORKFLOWS` config lists `roadmap.js` last, after the seven core prompt
  files, matching `CORE_PROMPT_FILES` order).
- Consumes at runtime: `args.sourceDocument` (string — the full game
  design document), `args.targetProjectPath` (string).
- Produces: `{ vision, milestoneHistory }` as the workflow's final return
  value — `milestoneHistory` is an array of per-milestone result objects
  (`{ milestone, taskResults, blocked, playtestResult, qualityCritique,
  finalReview }`), the same shape `fix-reopened.body.js` already returns
  per-run, one entry per milestone actually attempted.

- [ ] **Step 1: Create `workflows/milestone-build.body.js`**

```js
// workflows/milestone-build.body.js
// NOT run directly — same generator as the other two workflows: prepend
// prompts/schemas.js, director.js, designer.js, programmer.js, artist.js,
// tester.js, critic.js, roadmap.js above it, write to
// workflows/milestone-build.js. Regenerate with: node bin/build-workflow.js

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

const MAX_FIX_ATTEMPTS = 4
const MAX_ANIMATION_ROUNDS = 3
const MAX_DESIGN_REVIEW_ROUNDS = 3
const MAX_POLISH_ROUNDS = 5
// Hard cap on chained milestones in one run. Chaining is automatic (no
// human approval gate between milestones — see the design spec), so this
// cap, alongside the Director's own escalate/complete verdict from
// roadmapReviewPrompt, is what actually bounds an unattended run.
const MAX_MILESTONES = 5

async function animateTask(task, targetProjectPath, vision) {
  let feedback = null
  for (let round = 1; round <= MAX_ANIMATION_ROUNDS; round++) {
    await agent(animatedArtPrompt(task, feedback, targetProjectPath, vision), {
      phase: 'Implementation',
      label: `art-anim:${task.id}:${round}`,
    })
    const review = await agent(animationReviewPrompt(task, targetProjectPath, vision), {
      phase: 'Implementation',
      label: `review-anim:${task.id}:${round}`,
      schema: ANIMATION_REVIEW_SCHEMA,
    })
    if (review && review.accepted) {
      return { accepted: true, rounds: round, feedback: review.feedback }
    }
    feedback = review
      ? review.feedback
      : 'No review returned — the reviewing agent failed. Try again with a simpler, more conservative animation setup (fewer states, simpler placeholder frames).'
  }
  return { accepted: false, rounds: MAX_ANIMATION_ROUNDS, feedback }
}

async function implementAndTestTask(task, targetProjectPath, vision) {
  const animationResult = task.needsAnimation ? await animateTask(task, targetProjectPath, vision) : null

  let lastResult = null
  for (let attempt = 1; attempt <= MAX_FIX_ATTEMPTS; attempt++) {
    await agent(implementPrompt(task, attempt, lastResult, targetProjectPath, vision), {
      phase: 'Implementation',
      label: `impl:${task.id}:${attempt}`,
    })
    if (task.needsArt && !task.needsAnimation) {
      await agent(artPrompt(task, targetProjectPath, vision), { phase: 'Implementation', label: `art:${task.id}:${attempt}` })
    }
    lastResult = await agent(scenarioTestPrompt(task, attempt, targetProjectPath, vision), {
      phase: 'Implementation',
      label: `test:${task.id}:${attempt}`,
      schema: TEST_RESULT_SCHEMA,
    })
    if (lastResult && lastResult.passed) {
      return { task, status: 'done', attempts: attempt, lastResult, animationResult }
    }
  }
  return { task, status: 'blocked', attempts: MAX_FIX_ATTEMPTS, lastResult, animationResult }
}

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

for (let m = 0; m < MAX_MILESTONES; m++) {
  if (milestones.length === 0) {
    log('Roadmap has no remaining milestones — nothing left to build.')
    break
  }
  const milestone = milestones[0]
  const remainingMilestones = milestones.slice(1)

  // designPrompt is reused completely unchanged (see Global Constraints)
  // — a milestone is scoped by constructing a synthetic vision whose
  // "scope" field narrows the Designer down to just this milestone, while
  // "identity"/"priorities" stay the real whole-game vision so the
  // Designer still has the right tone/priority context (see spec's
  // gameContextBlock precedent — every per-task prompt already gets the
  // real vision this same way).
  const milestoneVision = {
    identity: vision.identity,
    scope: `THIS MILESTONE ONLY (id: ${milestone.id}): ${milestone.scope}

CRITICAL — before writing any task, read ${args.targetProjectPath}/.pipeline/project-map.md
to see what scenes/systems already exist from prior milestones, so tasks
extend/connect to them correctly instead of guessing or duplicating. Do
not design anything beyond this milestone's own scope, even if the wider
game needs it eventually — that belongs to a later milestone.

Full game scope, for continuity/context only — do not build any of this
now, only what THIS MILESTONE ONLY says above: ${vision.scope}`,
    priorities: vision.priorities,
  }

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

  phase('Implementation')
  const taskResults = await pipeline(
    design.tasks,
    (task) => implementAndTestTask(task, args.targetProjectPath, vision)
  )
  const blocked = taskResults.filter(r => r && r.status === 'blocked')

  // Everything built so far, THIS milestone's fresh results included —
  // this is what Full Playtest/Quality Gate/Report evaluate below, so
  // they see the whole accumulated project, not just this milestone.
  const allTaskResultsSoFar = [...accumulatedTaskResults, ...taskResults]

  phase('Full Playtest')
  const completedTasks = allTaskResultsSoFar.filter(r => r && r.status === 'done').map(r => r.task)
  const playtestResult = await agent(fullPlaytestPrompt(vision, { tasks: completedTasks }, args.targetProjectPath), {
    schema: PLAYTEST_SCHEMA,
    phase: 'Full Playtest',
    label: `playtest:${milestone.id}:1`,
  })
  if (!playtestResult) {
    log('Full playtest agent failed to return a result — the final review will note this as unverified.')
  }

  phase('Quality Gate')
  let critique = await agent(
    qualityCritiquePrompt(vision, design.gdd, allTaskResultsSoFar, playtestResult, args.targetProjectPath),
    { phase: 'Quality Gate', label: `critique:${milestone.id}:1`, schema: QUALITY_CRITIQUE_SCHEMA }
  )
  for (let round = 1; round <= MAX_POLISH_ROUNDS && critique && !critique.acceptable; round++) {
    const blockingIssues = critique.issues.filter(i => i.severity === 'blocking')
    if (blockingIssues.length === 0) break
    const taskIdsToFix = [...new Set(blockingIssues.map(i => i.taskId).filter(Boolean))]
    if (taskIdsToFix.length === 0) break

    log(`Milestone ${milestone.id} Quality Critic round ${round}: ${blockingIssues.length} blocking issue(s) on tasks ${taskIdsToFix.join(', ')}`)
    for (const taskId of taskIdsToFix) {
      const result = allTaskResultsSoFar.find(r => r && r.task.id === taskId)
      if (!result) continue
      const critiqueFailure = {
        evidence: blockingIssues.filter(i => i.taskId === taskId).map(i => i.description).join('; '),
        bug: null,
      }
      await agent(implementPrompt(result.task, round, critiqueFailure, args.targetProjectPath, vision), {
        phase: 'Quality Gate',
        label: `critic-fix:${milestone.id}:${taskId}:${round}`,
      })
    }

    critique = await agent(
      qualityCritiquePrompt(vision, design.gdd, allTaskResultsSoFar, playtestResult, args.targetProjectPath),
      { phase: 'Quality Gate', label: `critique:${milestone.id}:${round + 1}`, schema: QUALITY_CRITIQUE_SCHEMA }
    )
  }
  if (!critique) {
    log('Quality Critic failed to return a result — the final review will note quality as unverified.')
  }

  phase('Report')
  const finalReview = await agent(
    finalReviewPrompt(vision, design.gdd, allTaskResultsSoFar, playtestResult, null, critique, args.targetProjectPath),
    {
      phase: 'Report',
      label: `final-review:${milestone.id}`,
      schema: { type: 'object', required: ['ready', 'reopenTaskIds', 'summary'], properties: {
        ready: { type: 'boolean' }, reopenTaskIds: { type: 'array', items: { type: 'string' } }, summary: { type: 'string' },
      } },
    }
  )

  // Only THIS milestone's own tasks feed the accumulator — allTaskResultsSoFar
  // above already folded in every prior milestone's results, so adding
  // that instead here would double-count them on the next iteration.
  accumulatedTaskResults.push(...taskResults)

  const milestoneResult = {
    milestone,
    taskResults,
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

  phase('Roadmap Review')
  const review = await agent(
    roadmapReviewPrompt({ milestones: remainingMilestones }, milestoneResult, args.targetProjectPath),
    { schema: ROADMAP_REVIEW_SCHEMA, phase: 'Roadmap Review', label: `roadmap-review:${milestone.id}` }
  )
  if (!review) {
    log('Director failed to return a roadmap review — stopping the chain rather than guessing whether to continue.')
    break
  }
  if (review.verdict === 'escalate') {
    log(`Roadmap Review: escalating to a human — ${review.reason}`)
    break
  }
  if (review.verdict === 'complete') {
    log(`Roadmap Review: roadmap complete — ${review.reason}`)
    break
  }
  if (m === MAX_MILESTONES - 1) {
    log(`Milestone cap (${MAX_MILESTONES}) reached — stopping and reporting rather than continuing unattended indefinitely.`)
    break
  }
  milestones = (review.revisedMilestones && review.revisedMilestones.length > 0)
    ? review.revisedMilestones
    : remainingMilestones
}

return { vision, milestoneHistory }
```

- [ ] **Step 2: Regenerate all workflows**

Run: `node bin/build-workflow.js`
Expected: prints `Generated .../workflows/build-game.js`, `Generated
.../workflows/fix-reopened.js`, `Generated .../workflows/milestone-build.js`
— all three succeed now.

- [ ] **Step 3: Sanity-check the generated file**

Run:
```bash
node --check workflows/milestone-build.js 2>&1 | head -5
grep -c "roadmapPrompt\|roadmapReviewPrompt\|MAX_MILESTONES" workflows/milestone-build.js
```
Expected: the `node --check` error (if any) is the same pre-existing
"Illegal return statement" every other generated workflow file also
produces (these are Workflow-tool scripts, not standalone Node modules —
see the identical situation already documented for `build-game.js` and
`fix-reopened.js`), not a new/different error. The `grep -c` count should
be >= 3 (each name appears at least once).

Also confirm `export const meta` is the first statement:
```bash
head -20 workflows/milestone-build.js
```
Expected: `export const meta = {` appears before any prompt-file content,
matching the header comment.

- [ ] **Step 4: Run the full test suite**

Run: `node --test`
Expected: PASS, same count as before this task plus Task 1/2's new tests
— this task adds no new automated tests of its own (the workflow body
isn't unit-testable the way prompt functions are; its correctness is
verified structurally in Step 3, the same way `build-game.body.js` and
`fix-reopened.body.js` were verified when they were written).

- [ ] **Step 5: Commit**

```bash
git add workflows/milestone-build.body.js workflows/milestone-build.js
git commit -m "Add milestone-build workflow: chained, roadmap-driven incremental construction"
```
