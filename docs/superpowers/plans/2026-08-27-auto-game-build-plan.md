# auto-game-build Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the `auto-game-build` reusable pipeline — a Claude Code `Workflow` script plus supporting state schemas, agent prompt templates, and a local animated progress dashboard — that turns a game idea into a working, genuinely-playtested Unity project.

**Architecture:** A `Workflow` script (`workflows/build-game.js`) orchestrates Director → Designer → Programmer(specialized)/Artist → Tester → Fixer subagents in phases, using `pipeline()` to implement-and-test each backlog task concurrently with a bounded fix-retry loop, then a barrier for Director review of any blocked tasks, a full-playthrough pass, and a final report. Because Workflow scripts have no filesystem access, all `.pipeline/` state files are written by the dispatched subagents themselves (via their own Read/Write/Bash tools), not by the orchestrating script. A separate, plain Node HTTP server (`dashboard/server.js`) — started independently of the Workflow run — serves an animated live-progress page by reading an append-only `.pipeline/activity.log.jsonl` event log.

**Tech Stack:** Plain JavaScript (Workflow script — no TypeScript, no Node APIs inside it), Node.js (dashboard server + CLI tooling, ESM, zero runtime dependencies), Node's built-in `node:test`/`node:assert` for tests, Unity MCP (CoplayDev/unity-mcp or Unity's official MCP server) + a play-mode/input MCP layer (FunplayAI-style) reached via the subagents' own `ToolSearch`.

**Spec:** `docs/superpowers/specs/2026-08-27-auto-game-build-design.md`

## Global Constraints

- Success criterion is functional completion, not "fun" — never build subjective quality judgment into automated pass/fail logic (spec: Non-goals).
- No A2A protocol, no MCP memory-server, no Unity ML-Agents — explicitly out of scope per spec's Technology Choices.
- The `Workflow` script itself has **no filesystem or Node.js API access** — any file read/write for `.pipeline/` state must happen inside a dispatched `agent()` call, never in the script body directly.
- `Date.now()`, `Math.random()`, and argless `new Date()` are unavailable inside the Workflow script body (they break resume) — subagents may still use these via their own tools (e.g. shell `date`), since the restriction is on the script's own JS execution only.
- All pipeline state lives under `.pipeline/` inside the **target Unity project's** repo, never inside `auto-game-build` itself.
- `auto-game-build` has zero npm runtime dependencies — use Node built-ins only (`node:http`, `node:fs/promises`, `node:test`, `node:assert`).

---

## File Structure

```
auto-game-build/
  package.json                      # "type": "module", no dependencies
  lib/
    stateSchemas.js                 # plain-object schema descriptors + hand-rolled validators
    stateSchemas.test.js
    activityLog.js                  # append-event + reduce-to-current-state helpers
    activityLog.test.js
  bin/
    init-pipeline.js                # CLI: scaffolds .pipeline/ in a target project
    init-pipeline.test.js
  dashboard/
    server.js                       # Node http server: static UI + /api/state
    server.test.js
    public/
      index.html
      app.js
      style.css
  prompts/
    director.js                     # exports visionPrompt(), escalationPrompt(), finalReviewPrompt()
    designer.js                     # exports designPrompt()
    programmer.js                   # exports implementPrompt(task, attempt, priorFailure)
    artist.js                       # exports artPrompt(task)
    tester.js                       # exports scenarioTestPrompt(task), fullPlaytestPrompt(vision, backlog)
    schemas.js                      # JSON Schemas passed to agent({schema})
    schemas.test.js
  workflows/
    build-game.js                   # the Workflow script itself
  docs/superpowers/
    specs/2026-08-27-auto-game-build-design.md
    plans/2026-08-27-auto-game-build-plan.md
```

Rationale: `lib/` (schema + activity-log helpers) is shared by `bin/init-pipeline.js` and `dashboard/server.js`, so it's split out rather than duplicated. `prompts/` is one file per role so each stays focused and the Workflow script imports only what it needs. `dashboard/` is fully independent of `workflows/` — it only reads files, never calls agents — matching the "no fs access in Workflow scripts" constraint by construction.

---

### Task 1: State schemas + validation library

**Files:**
- Create: `auto-game-build/package.json`
- Create: `auto-game-build/lib/stateSchemas.js`
- Test: `auto-game-build/lib/stateSchemas.test.js`

**Interfaces:**
- Produces: `validateBacklogTask(obj) -> {valid: boolean, errors: string[]}`, `validateBug(obj) -> {valid: boolean, errors: string[]}`, `TASK_STATUSES = ['todo', 'in_progress', 'done', 'blocked']`, `BUG_STATUSES = ['open', 'fixed', 'closed']` — all consumed by Task 2 (init CLI), Task 3 (activity log), and indirectly by prompt schemas in Task 7.

- [ ] **Step 1: Create package.json**

```json
{
  "name": "auto-game-build",
  "version": "0.1.0",
  "type": "module",
  "private": true,
  "scripts": {
    "test": "node --test"
  }
}
```

- [ ] **Step 2: Write the failing test**

```javascript
// lib/stateSchemas.test.js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { validateBacklogTask, validateBug, TASK_STATUSES, BUG_STATUSES } from './stateSchemas.js'

test('validateBacklogTask accepts a well-formed task', () => {
  const result = validateBacklogTask({
    id: 'task-001',
    specialization: 'gameplay',
    description: 'Player can jump over a 1-unit obstacle',
    successCriterion: 'Simulate jump input near a 1-unit box; player position ends up past it without collision.',
    status: 'todo',
    attempts: 0,
  })
  assert.equal(result.valid, true)
  assert.deepEqual(result.errors, [])
})

test('validateBacklogTask rejects missing required fields', () => {
  const result = validateBacklogTask({ id: 'task-001' })
  assert.equal(result.valid, false)
  assert.ok(result.errors.some(e => e.includes('specialization')))
  assert.ok(result.errors.some(e => e.includes('description')))
  assert.ok(result.errors.some(e => e.includes('successCriterion')))
})

test('validateBacklogTask rejects an invalid status', () => {
  const result = validateBacklogTask({
    id: 'task-001',
    specialization: 'gameplay',
    description: 'x',
    successCriterion: 'x',
    status: 'not-a-real-status',
    attempts: 0,
  })
  assert.equal(result.valid, false)
  assert.ok(result.errors.some(e => e.includes('status')))
})

test('validateBug accepts a well-formed bug', () => {
  const result = validateBug({
    id: 'bug-001',
    taskId: 'task-001',
    description: 'Player clips through the obstacle instead of stopping',
    reproSteps: ['Enter play mode', 'Move toward obstacle', 'Observe player passes through'],
    status: 'open',
  })
  assert.equal(result.valid, true)
})

test('TASK_STATUSES and BUG_STATUSES export the expected values', () => {
  assert.deepEqual(TASK_STATUSES, ['todo', 'in_progress', 'done', 'blocked'])
  assert.deepEqual(BUG_STATUSES, ['open', 'fixed', 'closed'])
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd auto-game-build && node --test lib/stateSchemas.test.js`
Expected: FAIL — `Cannot find module './stateSchemas.js'`

- [ ] **Step 4: Write minimal implementation**

```javascript
// lib/stateSchemas.js
export const TASK_STATUSES = ['todo', 'in_progress', 'done', 'blocked']
export const BUG_STATUSES = ['open', 'fixed', 'closed']

function requireString(obj, field, errors) {
  if (typeof obj[field] !== 'string' || obj[field].length === 0) {
    errors.push(`${field} must be a non-empty string`)
  }
}

export function validateBacklogTask(obj) {
  const errors = []
  if (!obj || typeof obj !== 'object') return { valid: false, errors: ['task must be an object'] }
  requireString(obj, 'id', errors)
  requireString(obj, 'specialization', errors)
  requireString(obj, 'description', errors)
  requireString(obj, 'successCriterion', errors)
  if (!TASK_STATUSES.includes(obj.status)) {
    errors.push(`status must be one of ${TASK_STATUSES.join(', ')}`)
  }
  if (typeof obj.attempts !== 'number' || obj.attempts < 0) {
    errors.push('attempts must be a non-negative number')
  }
  return { valid: errors.length === 0, errors }
}

export function validateBug(obj) {
  const errors = []
  if (!obj || typeof obj !== 'object') return { valid: false, errors: ['bug must be an object'] }
  requireString(obj, 'id', errors)
  requireString(obj, 'taskId', errors)
  requireString(obj, 'description', errors)
  if (!Array.isArray(obj.reproSteps) || obj.reproSteps.length === 0) {
    errors.push('reproSteps must be a non-empty array')
  }
  if (!BUG_STATUSES.includes(obj.status)) {
    errors.push(`status must be one of ${BUG_STATUSES.join(', ')}`)
  }
  return { valid: errors.length === 0, errors }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd auto-game-build && node --test lib/stateSchemas.test.js`
Expected: PASS — all 5 tests green

- [ ] **Step 6: Commit**

```bash
cd auto-game-build
git add package.json lib/stateSchemas.js lib/stateSchemas.test.js
git commit -m "Add state schema validators for backlog tasks and bugs"
```

---

### Task 2: Pipeline init CLI

**Files:**
- Create: `auto-game-build/bin/init-pipeline.js`
- Test: `auto-game-build/bin/init-pipeline.test.js`

**Interfaces:**
- Consumes: `TASK_STATUSES`, `BUG_STATUSES` from `../lib/stateSchemas.js` (Task 1).
- Produces: `scaffoldPipeline(targetDir) -> Promise<{created: string[]}>` — called by the CLI entrypoint; also directly importable for tests. Creates `<targetDir>/.pipeline/{vision.md,gdd.md,backlog.json,bugs.json,activity.log.jsonl,progress-log.md}` if they don't already exist (never overwrites existing state, so re-running on a project mid-pipeline is safe).

- [ ] **Step 1: Write the failing test**

```javascript
// bin/init-pipeline.test.js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, writeFile, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { scaffoldPipeline } from './init-pipeline.js'

test('scaffoldPipeline creates all expected files with valid initial content', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'agb-'))
  const result = await scaffoldPipeline(dir)

  assert.equal(result.created.length, 6)

  const backlog = JSON.parse(await readFile(path.join(dir, '.pipeline', 'backlog.json'), 'utf8'))
  assert.deepEqual(backlog, [])

  const bugs = JSON.parse(await readFile(path.join(dir, '.pipeline', 'bugs.json'), 'utf8'))
  assert.deepEqual(bugs, [])

  const activityLog = await readFile(path.join(dir, '.pipeline', 'activity.log.jsonl'), 'utf8')
  assert.equal(activityLog, '')

  const vision = await readFile(path.join(dir, '.pipeline', 'vision.md'), 'utf8')
  assert.match(vision, /^# Vision/)
})

test('scaffoldPipeline does not overwrite existing state on a second run', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'agb-'))
  await scaffoldPipeline(dir)
  await mkdir(path.join(dir, '.pipeline'), { recursive: true })
  await writeFile(path.join(dir, '.pipeline', 'backlog.json'), JSON.stringify([{ id: 'keep-me' }]))

  const result = await scaffoldPipeline(dir)
  assert.deepEqual(result.created, [])

  const backlog = JSON.parse(await readFile(path.join(dir, '.pipeline', 'backlog.json'), 'utf8'))
  assert.deepEqual(backlog, [{ id: 'keep-me' }])
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd auto-game-build && node --test bin/init-pipeline.test.js`
Expected: FAIL — `Cannot find module './init-pipeline.js'`

- [ ] **Step 3: Write minimal implementation**

```javascript
// bin/init-pipeline.js
import { mkdir, writeFile, access } from 'node:fs/promises'
import path from 'node:path'

const INITIAL_FILES = {
  'vision.md': '# Vision\n\n(not yet generated)\n',
  'gdd.md': '# Game Design Document\n\n(not yet generated)\n',
  'backlog.json': '[]\n',
  'bugs.json': '[]\n',
  'activity.log.jsonl': '',
  'progress-log.md': '# Progress Log\n\n',
}

export async function scaffoldPipeline(targetDir) {
  const pipelineDir = path.join(targetDir, '.pipeline')
  await mkdir(pipelineDir, { recursive: true })

  const created = []
  for (const [name, contents] of Object.entries(INITIAL_FILES)) {
    const filePath = path.join(pipelineDir, name)
    try {
      await access(filePath)
    } catch {
      await writeFile(filePath, contents, 'utf8')
      created.push(name)
    }
  }
  return { created }
}

// CLI entrypoint: `node bin/init-pipeline.js <target-project-dir>`
if (import.meta.url === `file://${process.argv[1]}`) {
  const target = process.argv[2]
  if (!target) {
    console.error('Usage: node bin/init-pipeline.js <target-unity-project-dir>')
    process.exit(1)
  }
  const { created } = await scaffoldPipeline(path.resolve(target))
  console.log(created.length ? `Created: ${created.join(', ')}` : 'Pipeline state already exists, nothing to do.')
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd auto-game-build && node --test bin/init-pipeline.test.js`
Expected: PASS — both tests green

- [ ] **Step 5: Commit**

```bash
cd auto-game-build
git add bin/init-pipeline.js bin/init-pipeline.test.js
git commit -m "Add pipeline init CLI to scaffold .pipeline/ in a target project"
```

---

### Task 3: Activity log helpers

**Files:**
- Create: `auto-game-build/lib/activityLog.js`
- Test: `auto-game-build/lib/activityLog.test.js`

**Interfaces:**
- Produces: `parseActivityLog(text) -> Array<{ts, role, specialization, taskId, event, detail}>`, `reduceToState(events) -> {roles: Record<string, {status: 'idle'|'working'|'blocked', taskId: string|null, detail: string|null, lastEventTs: string|null}>, timeline: Array<event>}`. Consumed by Task 4 (dashboard server's `/api/state` endpoint).
- Event shape written by agents (documented here, not enforced at write time since agents write via their own tools — this is the parsing contract): each line is one JSON object `{ts: ISO string, role: string, specialization: string|null, taskId: string|null, event: 'start'|'done'|'blocked', detail: string}`.

- [ ] **Step 1: Write the failing test**

```javascript
// lib/activityLog.test.js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseActivityLog, reduceToState } from './activityLog.js'

const SAMPLE = [
  '{"ts":"2026-08-27T10:00:00Z","role":"director","specialization":null,"taskId":null,"event":"start","detail":"Writing vision"}',
  '{"ts":"2026-08-27T10:00:05Z","role":"director","specialization":null,"taskId":null,"event":"done","detail":"Vision written"}',
  '{"ts":"2026-08-27T10:00:06Z","role":"programmer","specialization":"gameplay","taskId":"task-001","event":"start","detail":"Implementing jump"}',
  '',
].join('\n')

test('parseActivityLog parses well-formed lines and skips blanks', () => {
  const events = parseActivityLog(SAMPLE)
  assert.equal(events.length, 3)
  assert.equal(events[0].role, 'director')
  assert.equal(events[2].taskId, 'task-001')
})

test('parseActivityLog skips malformed lines without throwing', () => {
  const events = parseActivityLog(SAMPLE + '\nnot json\n')
  assert.equal(events.length, 3)
})

test('reduceToState derives current per-role status from the latest event per role', () => {
  const events = parseActivityLog(SAMPLE)
  const state = reduceToState(events)
  assert.equal(state.roles.director.status, 'idle')
  assert.equal(state.roles.programmer.status, 'working')
  assert.equal(state.roles.programmer.taskId, 'task-001')
  assert.equal(state.timeline.length, 3)
})

test('reduceToState marks a role blocked when its latest event is blocked', () => {
  const events = parseActivityLog(SAMPLE + '\n{"ts":"2026-08-27T10:05:00Z","role":"programmer","specialization":"gameplay","taskId":"task-001","event":"blocked","detail":"3 fix attempts failed"}')
  const state = reduceToState(events)
  assert.equal(state.roles.programmer.status, 'blocked')
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd auto-game-build && node --test lib/activityLog.test.js`
Expected: FAIL — `Cannot find module './activityLog.js'`

- [ ] **Step 3: Write minimal implementation**

```javascript
// lib/activityLog.js
export function parseActivityLog(text) {
  const events = []
  for (const line of text.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed) continue
    try {
      events.push(JSON.parse(trimmed))
    } catch {
      // skip malformed lines rather than failing the whole dashboard
    }
  }
  return events
}

const STATUS_FOR_EVENT = { start: 'working', done: 'idle', blocked: 'blocked' }

export function reduceToState(events) {
  const roles = {}
  for (const evt of events) {
    roles[evt.role] = {
      status: STATUS_FOR_EVENT[evt.event] ?? 'idle',
      taskId: evt.event === 'done' ? null : evt.taskId,
      detail: evt.detail ?? null,
      lastEventTs: evt.ts,
    }
  }
  return { roles, timeline: events }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd auto-game-build && node --test lib/activityLog.test.js`
Expected: PASS — all 4 tests green

- [ ] **Step 5: Commit**

```bash
cd auto-game-build
git add lib/activityLog.js lib/activityLog.test.js
git commit -m "Add activity log parsing and state-reduction helpers"
```

---

### Task 4: Dashboard server

**Files:**
- Create: `auto-game-build/dashboard/server.js`
- Test: `auto-game-build/dashboard/server.test.js`

**Interfaces:**
- Consumes: `parseActivityLog`, `reduceToState` from `../lib/activityLog.js` (Task 3).
- Produces: `createServer(pipelineDir) -> http.Server` (not yet listening — caller calls `.listen(port)`). Serves `GET /api/state` (JSON: `reduceToState` output, or `{roles: {}, timeline: []}` if the log doesn't exist yet) and static files from `dashboard/public/` for everything else. Consumed by Task 5 (frontend fetches `/api/state`) and by the CLI entrypoint at the bottom of this file.

- [ ] **Step 1: Write the failing test**

```javascript
// dashboard/server.test.js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { createServer } from './server.js'

async function withServer(pipelineParentDir, fn) {
  const server = createServer(pipelineParentDir)
  await new Promise(resolve => server.listen(0, resolve))
  const { port } = server.address()
  try {
    await fn(`http://127.0.0.1:${port}`)
  } finally {
    await new Promise(resolve => server.close(resolve))
  }
}

test('GET /api/state returns empty state when no activity log exists yet', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'agb-dash-'))
  await withServer(dir, async (base) => {
    const res = await fetch(`${base}/api/state`)
    assert.equal(res.status, 200)
    const body = await res.json()
    assert.deepEqual(body, { roles: {}, timeline: [] })
  })
})

test('GET /api/state reflects the current activity log contents', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'agb-dash-'))
  await mkdir(path.join(dir, '.pipeline'), { recursive: true })
  await writeFile(
    path.join(dir, '.pipeline', 'activity.log.jsonl'),
    '{"ts":"2026-08-27T10:00:00Z","role":"director","specialization":null,"taskId":null,"event":"start","detail":"Writing vision"}\n'
  )
  await withServer(dir, async (base) => {
    const res = await fetch(`${base}/api/state`)
    const body = await res.json()
    assert.equal(body.roles.director.status, 'working')
  })
})

test('GET / serves the static dashboard index page', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'agb-dash-'))
  await withServer(dir, async (base) => {
    const res = await fetch(`${base}/`)
    assert.equal(res.status, 200)
    const body = await res.text()
    assert.match(body, /<html/i)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd auto-game-build && node --test dashboard/server.test.js`
Expected: FAIL — `Cannot find module './server.js'`

- [ ] **Step 3: Write minimal implementation**

```javascript
// dashboard/server.js
import http from 'node:http'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseActivityLog, reduceToState } from '../lib/activityLog.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PUBLIC_DIR = path.join(__dirname, 'public')
const CONTENT_TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' }

export function createServer(pipelineParentDir) {
  return http.createServer(async (req, res) => {
    if (req.url === '/api/state') {
      let events = []
      try {
        const text = await readFile(path.join(pipelineParentDir, '.pipeline', 'activity.log.jsonl'), 'utf8')
        events = parseActivityLog(text)
      } catch {
        // no log yet — return empty state
      }
      const body = JSON.stringify(reduceToState(events))
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(body)
      return
    }

    const reqPath = req.url === '/' ? '/index.html' : req.url
    const filePath = path.join(PUBLIC_DIR, reqPath)
    if (!filePath.startsWith(PUBLIC_DIR)) {
      res.writeHead(403)
      res.end('Forbidden')
      return
    }
    try {
      const contents = await readFile(filePath)
      const ext = path.extname(filePath)
      res.writeHead(200, { 'Content-Type': CONTENT_TYPES[ext] ?? 'application/octet-stream' })
      res.end(contents)
    } catch {
      res.writeHead(404)
      res.end('Not found')
    }
  })
}

// CLI entrypoint: `node dashboard/server.js <target-unity-project-dir> [port]`
if (import.meta.url === `file://${process.argv[1]}`) {
  const target = process.argv[2]
  const port = Number(process.argv[3] ?? 4173)
  if (!target) {
    console.error('Usage: node dashboard/server.js <target-unity-project-dir> [port]')
    process.exit(1)
  }
  const server = createServer(path.resolve(target))
  server.listen(port, () => console.log(`Dashboard running at http://localhost:${port}`))
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd auto-game-build && node --test dashboard/server.test.js`
Expected: FAIL initially on the third test (`GET /` — no `public/index.html` exists yet)

- [ ] **Step 5: Create a minimal placeholder index so the server test passes**

```html
<!-- dashboard/public/index.html -->
<!doctype html>
<html><head><title>auto-game-build dashboard</title></head>
<body><div id="app">Loading…</div></body></html>
```

- [ ] **Step 6: Run test to verify it passes**

Run: `cd auto-game-build && node --test dashboard/server.test.js`
Expected: PASS — all 3 tests green

- [ ] **Step 7: Commit**

```bash
cd auto-game-build
git add dashboard/server.js dashboard/server.test.js dashboard/public/index.html
git commit -m "Add local dashboard server with /api/state endpoint"
```

---

### Task 5: Dashboard frontend (animated live view)

**Files:**
- Modify: `auto-game-build/dashboard/public/index.html`
- Create: `auto-game-build/dashboard/public/app.js`
- Create: `auto-game-build/dashboard/public/style.css`

**Interfaces:**
- Consumes: `GET /api/state` from Task 4, shaped `{roles: Record<string, {status, taskId, detail, lastEventTs}>, timeline: Array<{ts, role, specialization, taskId, event, detail}>}`.

This task is a visual/animated UI — there is no meaningful automated test for animation and layout. Verify manually in a browser per the steps below, per the project instruction to test UI changes live rather than only relying on type/lint checks.

- [ ] **Step 1: Write the full page shell**

```html
<!-- dashboard/public/index.html -->
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>auto-game-build dashboard</title>
  <link rel="stylesheet" href="/style.css" />
</head>
<body>
  <h1>auto-game-build — live progress</h1>
  <div id="roles"></div>
  <h2>Timeline</h2>
  <ul id="timeline"></ul>
  <script src="/app.js" type="module"></script>
</body>
</html>
```

- [ ] **Step 2: Write the polling + rendering logic**

```javascript
// dashboard/public/app.js
const ROLE_ORDER = ['director', 'designer', 'programmer', 'artist', 'tester', 'fixer']
const rolesEl = document.getElementById('roles')
const timelineEl = document.getElementById('timeline')
let lastTimelineLength = 0

function renderRoles(roles) {
  rolesEl.innerHTML = ''
  for (const role of ROLE_ORDER) {
    const info = roles[role] ?? { status: 'idle', taskId: null, detail: null }
    const card = document.createElement('div')
    card.className = `role-card status-${info.status}`
    card.innerHTML = `
      <div class="role-name">${role}</div>
      <div class="role-status">${info.status}</div>
      <div class="role-detail">${info.detail ?? ''}</div>
    `
    rolesEl.appendChild(card)
  }
}

function renderTimeline(timeline) {
  if (timeline.length === lastTimelineLength) return
  timelineEl.innerHTML = ''
  for (const evt of [...timeline].reverse()) {
    const li = document.createElement('li')
    li.className = `timeline-entry event-${evt.event}`
    li.textContent = `${evt.ts} — ${evt.role}${evt.specialization ? `/${evt.specialization}` : ''}: ${evt.detail}`
    timelineEl.appendChild(li)
  }
  lastTimelineLength = timeline.length
}

async function poll() {
  try {
    const res = await fetch('/api/state')
    const state = await res.json()
    renderRoles(state.roles)
    renderTimeline(state.timeline)
  } catch {
    // transient fetch failure — try again next tick
  }
  setTimeout(poll, 1500)
}

poll()
```

- [ ] **Step 3: Write the animated styling**

```css
/* dashboard/public/style.css */
:root { color-scheme: light dark; font-family: system-ui, sans-serif; }
body { margin: 2rem; }
#roles { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 1rem; }
.role-card {
  border-radius: 10px;
  padding: 1rem;
  border: 2px solid #888;
  transition: border-color 0.3s ease, transform 0.2s ease;
}
.role-card.status-working { border-color: #3b82f6; animation: pulse 1.4s ease-in-out infinite; }
.role-card.status-blocked { border-color: #ef4444; animation: shake 0.4s ease-in-out; }
.role-card.status-idle { opacity: 0.6; }
.role-name { font-weight: 700; text-transform: capitalize; }
.role-status { font-size: 0.85rem; opacity: 0.8; }
.role-detail { font-size: 0.8rem; margin-top: 0.4rem; }

@keyframes pulse {
  0%, 100% { box-shadow: 0 0 0 0 rgba(59, 130, 246, 0.4); }
  50% { box-shadow: 0 0 0 8px rgba(59, 130, 246, 0); }
}
@keyframes shake {
  0%, 100% { transform: translateX(0); }
  25% { transform: translateX(-4px); }
  75% { transform: translateX(4px); }
}

#timeline { list-style: none; padding: 0; max-height: 300px; overflow-y: auto; }
.timeline-entry { padding: 0.3rem 0; border-bottom: 1px solid #ccc3; font-size: 0.85rem; }
.timeline-entry.event-blocked { color: #ef4444; }
```

- [ ] **Step 4: Manual verification**

Run: `cd auto-game-build && node dashboard/server.js /tmp/fake-project 4173` (create `/tmp/fake-project/.pipeline/activity.log.jsonl` with a couple of sample lines from Task 3's test fixture first)
Open `http://localhost:4173` in a browser. Confirm: role cards render for all six roles, the card matching an event with `"event":"start"` shows a pulsing blue border, appending a `"event":"blocked"` line to the log file and waiting ~2s shows that card turn red or shake, and the timeline list updates without a full page reload.

- [ ] **Step 5: Commit**

```bash
cd auto-game-build
git add dashboard/public/index.html dashboard/public/app.js dashboard/public/style.css
git commit -m "Add animated dashboard frontend for live pipeline progress"
```

---

### Task 6: Director & Designer prompts and schemas

**Files:**
- Create: `auto-game-build/prompts/schemas.js`
- Create: `auto-game-build/prompts/director.js`
- Create: `auto-game-build/prompts/designer.js`
- Test: `auto-game-build/prompts/schemas.test.js`

**Interfaces:**
- Produces: `VISION_SCHEMA`, `BACKLOG_SCHEMA` (JSON Schema objects, for `agent(..., {schema})`); `visionPrompt(gameIdea)`, `escalationPrompt(vision, blockedTasks)`, `finalReviewPrompt(vision, gdd, taskResults, playtestResult)` from `director.js`; `designPrompt(vision)` from `designer.js`. All prompt functions return plain strings. Consumed by Task 8 (the Workflow script).
- Consumes: `validateBacklogTask` from `../lib/stateSchemas.js` (Task 1) inside the test, to cross-check that a sample object matching `BACKLOG_SCHEMA` also passes the hand-rolled validator (keeps the two in sync).

- [ ] **Step 1: Write the failing test**

```javascript
// prompts/schemas.test.js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { VISION_SCHEMA, BACKLOG_SCHEMA } from './schemas.js'
import { validateBacklogTask } from '../lib/stateSchemas.js'

test('VISION_SCHEMA declares the required top-level fields', () => {
  assert.deepEqual(new Set(VISION_SCHEMA.required), new Set(['identity', 'scope', 'priorities']))
})

test('BACKLOG_SCHEMA items match what validateBacklogTask expects', () => {
  const itemSchema = BACKLOG_SCHEMA.properties.tasks.items
  const sample = {
    id: 'task-001',
    specialization: 'gameplay',
    description: 'Player can jump over a 1-unit obstacle',
    successCriterion: 'Jump input near a 1-unit box results in the player past it without collision.',
    status: 'todo',
    attempts: 0,
  }
  for (const field of itemSchema.required) {
    assert.ok(field in sample, `sample is missing required field ${field}`)
  }
  const result = validateBacklogTask(sample)
  assert.equal(result.valid, true)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd auto-game-build && node --test prompts/schemas.test.js`
Expected: FAIL — `Cannot find module './schemas.js'`

- [ ] **Step 3: Write the schemas**

```javascript
// prompts/schemas.js
export const VISION_SCHEMA = {
  type: 'object',
  required: ['identity', 'scope', 'priorities'],
  properties: {
    identity: { type: 'string', description: 'What kind of game this is and its core hook, 2-4 sentences' },
    scope: { type: 'string', description: 'What is in and explicitly out of scope for this build' },
    priorities: { type: 'array', items: { type: 'string' }, description: 'Ordered list of what matters most if trade-offs are needed' },
  },
}

export const BACKLOG_TASK_SCHEMA = {
  type: 'object',
  required: ['id', 'specialization', 'description', 'successCriterion', 'status', 'attempts'],
  properties: {
    id: { type: 'string' },
    specialization: { type: 'string', enum: ['gameplay', 'ui', 'ai', 'network', 'graphics', 'tools'] },
    description: { type: 'string' },
    successCriterion: { type: 'string', description: 'A concrete, checkable condition the Tester can verify via input+state' },
    needsArt: { type: 'boolean' },
    status: { type: 'string', enum: ['todo', 'in_progress', 'done', 'blocked'] },
    attempts: { type: 'number' },
  },
}

export const BACKLOG_SCHEMA = {
  type: 'object',
  required: ['tasks'],
  properties: {
    tasks: { type: 'array', items: BACKLOG_TASK_SCHEMA },
  },
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd auto-game-build && node --test prompts/schemas.test.js`
Expected: PASS — both tests green

- [ ] **Step 5: Write the Director prompts**

```javascript
// prompts/director.js
export function visionPrompt(gameIdea, targetProjectPath) {
  return `You are the Director for a Unity game being built autonomously.

The user's game idea: """${gameIdea}"""
Target Unity project path: ${targetProjectPath}

Write the game's vision: its identity (what kind of game, its core hook),
its scope (what's in and explicitly out for this build — keep it small
enough to actually finish), and priorities (ordered list of what matters
most if trade-offs come up later).

Also write this vision to ${targetProjectPath}/.pipeline/vision.md as
readable Markdown (using your Write tool), and append one line to
${targetProjectPath}/.pipeline/activity.log.jsonl recording that you
started and finished this work — one JSON object per line, shape:
{"ts": "<ISO timestamp from running the shell 'date -u +%Y-%m-%dT%H:%M:%SZ'>", "role": "director", "specialization": null, "taskId": null, "event": "start"|"done", "detail": "<short note>"}.

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
the spirit but is easier to implement — describe it concretely), or
"escalate" (this genuinely needs the user's decision — explain why in one
sentence). Return your decision per task as structured data.`
}

export function finalReviewPrompt(vision, gdd, taskResults, playtestResult) {
  return `You are the Director doing the final coherence review before this
Unity game is reported as done.

Vision: """${vision.identity}""" Scope: ${vision.scope}
GDD: """${gdd}"""
Task results: ${JSON.stringify(taskResults)}
Full playtest result: ${JSON.stringify(playtestResult)}

Check whether what was actually built still matches the original vision
(not just whether it technically works). If something drifted from the
vision in a way that matters, list which backlog task ids should be
reopened and why. Otherwise confirm the game is ready to report as done.
Return your review as structured data.`
}
```

- [ ] **Step 6: Write the Designer prompt**

```javascript
// prompts/designer.js
export function designPrompt(vision, targetProjectPath) {
  return `You are the Designer for a Unity game with this vision:
Identity: """${vision.identity}"""
Scope: ${vision.scope}
Priorities: ${vision.priorities.join(', ')}

Write a short Game Design Document (a few short sections: core loop,
mechanics, content scope) and a backlog of concrete, testable tasks that
implement it. Every task MUST have:
- a specialization tag, one of: gameplay, ui, ai, network, graphics, tools
- a successCriterion that is concrete enough for a Tester agent to check
  by simulating input and reading game state (e.g. "player's Y position
  increases by at least 1 unit within 1 second of the jump input", not
  "jumping feels good")
- needsArt: true if the task needs a placeholder visual asset

Only use specializations the game actually needs — a small prototype
probably only needs gameplay and ui; don't add ai/network/graphics/tools
tasks unless the vision's scope calls for them.

Write the GDD to ${targetProjectPath}/.pipeline/gdd.md and the backlog to
${targetProjectPath}/.pipeline/backlog.json (using your Write tool) with
every task starting at status "todo" and attempts 0. Append start/done
lines to ${targetProjectPath}/.pipeline/activity.log.jsonl the same way
the Director does (role: "designer").

Return the backlog as structured data matching the required schema.`
}
```

- [ ] **Step 7: Commit**

```bash
cd auto-game-build
git add prompts/schemas.js prompts/schemas.test.js prompts/director.js prompts/designer.js
git commit -m "Add Director and Designer prompt templates and schemas"
```

---

### Task 7: Programmer, Artist, Tester, Fixer prompts and schemas

**Files:**
- Modify: `auto-game-build/prompts/schemas.js`
- Create: `auto-game-build/prompts/programmer.js`
- Create: `auto-game-build/prompts/artist.js`
- Create: `auto-game-build/prompts/tester.js`
- Modify: `auto-game-build/prompts/schemas.test.js`

**Interfaces:**
- Produces: `TEST_RESULT_SCHEMA`, `PLAYTEST_SCHEMA` added to `schemas.js`; `implementPrompt(task, attempt, priorFailure, targetProjectPath)` from `programmer.js`; `artPrompt(task, targetProjectPath)` from `artist.js`; `scenarioTestPrompt(task, targetProjectPath)` and `fullPlaytestPrompt(vision, backlog, targetProjectPath)` from `tester.js`. The Fixer reuses `implementPrompt` with `priorFailure` set (a Fixer call IS an implement call with failure context — no separate fixer.js needed, keeping this DRY). Consumed by Task 8.

- [ ] **Step 1: Extend the schema test**

```javascript
// prompts/schemas.test.js — add these two tests to the existing file
test('TEST_RESULT_SCHEMA requires passed and evidence', () => {
  assert.deepEqual(new Set(TEST_RESULT_SCHEMA.required), new Set(['passed', 'evidence']))
})

test('PLAYTEST_SCHEMA requires completed and issues', () => {
  assert.deepEqual(new Set(PLAYTEST_SCHEMA.required), new Set(['completed', 'issues']))
})
```

Add the corresponding import at the top: `import { VISION_SCHEMA, BACKLOG_SCHEMA, TEST_RESULT_SCHEMA, PLAYTEST_SCHEMA } from './schemas.js'`

- [ ] **Step 2: Run test to verify it fails**

Run: `cd auto-game-build && node --test prompts/schemas.test.js`
Expected: FAIL — `TEST_RESULT_SCHEMA is not defined` / import error

- [ ] **Step 3: Add the new schemas**

```javascript
// prompts/schemas.js — append to the existing file
export const TEST_RESULT_SCHEMA = {
  type: 'object',
  required: ['passed', 'evidence'],
  properties: {
    passed: { type: 'boolean' },
    evidence: { type: 'string', description: 'What was observed via input+state (and a screenshot check, if taken) that supports the verdict' },
    bug: {
      type: 'object',
      description: 'Present only if passed is false',
      properties: {
        description: { type: 'string' },
        reproSteps: { type: 'array', items: { type: 'string' } },
      },
    },
  },
}

export const PLAYTEST_SCHEMA = {
  type: 'object',
  required: ['completed', 'issues'],
  properties: {
    completed: { type: 'boolean', description: 'Whether the full playthrough reached its end without breaking' },
    issues: { type: 'array', items: { type: 'string' }, description: 'Any problems found during the full playthrough, empty if none' },
  },
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd auto-game-build && node --test prompts/schemas.test.js`
Expected: PASS — all schema tests green

- [ ] **Step 5: Write the Programmer prompt (also used for Fixer retries)**

```javascript
// prompts/programmer.js
export function implementPrompt(task, attempt, priorFailure, targetProjectPath) {
  const retryContext = priorFailure
    ? `\n\nThis is retry attempt ${attempt}. A previous attempt failed this way:
Evidence: ${priorFailure.evidence}
${priorFailure.bug ? `Bug: ${priorFailure.bug.description}\nRepro steps: ${priorFailure.bug.reproSteps.join(' -> ')}` : ''}
${attempt >= 3 ? 'Try a genuinely different implementation approach this time, not a small tweak on the same one.' : 'Fix the specific problem described above.'}`
    : ''

  return `You are a ${task.specialization} programmer working on a Unity
project at ${targetProjectPath}.

Task: ${task.description}
Success criterion (what the Tester will check): ${task.successCriterion}
${retryContext}

Use the Unity MCP tools available to you (search for them if you don't
see them yet) to write/edit C# scripts and configure the scene/GameObjects
needed. Keep the change scoped to this task. When done, append a line to
${targetProjectPath}/.pipeline/activity.log.jsonl: {"ts": "<ISO timestamp
from shell 'date -u +%Y-%m-%dT%H:%M:%SZ'>", "role": "programmer",
"specialization": "${task.specialization}", "taskId": "${task.id}",
"event": "done", "detail": "<short note>"} — and append a matching
"start" line before you begin.

Report back a short summary of what you implemented.`
}
```

- [ ] **Step 6: Write the Artist prompt**

```javascript
// prompts/artist.js
export function artPrompt(task, targetProjectPath) {
  return `You are the Artist for a Unity project at ${targetProjectPath}.

Task: ${task.description}
This task needs a placeholder visual asset (sprite, material, or simple
prefab — whatever fits) wired into what the Programmer built for it. Use
the Unity MCP tools available to you. Keep it simple placeholder-quality;
visual polish is not the goal here.

Append start/done lines to
${targetProjectPath}/.pipeline/activity.log.jsonl the same way the
Programmer does, with "role": "artist" and this task's specialization.

Report back a short summary of what you created and wired up.`
}
```

- [ ] **Step 7: Write the Tester prompts**

```javascript
// prompts/tester.js
export function scenarioTestPrompt(task, targetProjectPath) {
  return `You are the Tester for a Unity project at ${targetProjectPath}.

Task under test: ${task.description}
Success criterion: ${task.successCriterion}

Use the play-mode/input MCP tools available to you (search for them if
you don't see them yet — look for Play Mode control, simulated
input/key-press, and screenshot capture tools) to actually operate the
game and check this criterion: enter Play Mode, simulate the relevant
input(s), and read back game state (position, health, score, etc.) to
verify the criterion. Take a screenshot only if the criterion has a
visual component the state alone can't confirm (e.g. "the pause menu is
visible").

Append start/done lines to
${targetProjectPath}/.pipeline/activity.log.jsonl the same way other
roles do, with "role": "tester" and this task's specialization.

Return whether it passed, the evidence you observed, and — only if it
did not pass — a bug description with concrete repro steps.`
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
specialization: null, taskId: null).

Return whether the playthrough completed without breaking, and a list of
any issues found (empty if none).`
}
```

- [ ] **Step 8: Commit**

```bash
cd auto-game-build
git add prompts/schemas.js prompts/schemas.test.js prompts/programmer.js prompts/artist.js prompts/tester.js
git commit -m "Add Programmer, Artist, and Tester prompt templates and schemas"
```

---

### Task 8: The Workflow orchestration script

**Files:**
- Create: `auto-game-build/workflows/build-game.js`
- Create: `auto-game-build/README.md`

**Interfaces:**
- Consumes: everything from Tasks 6-7 (`prompts/director.js`, `prompts/designer.js`, `prompts/programmer.js`, `prompts/artist.js`, `prompts/tester.js`, `prompts/schemas.js`) plus `TASK_STATUSES`/`BUG_STATUSES` conceptually (status strings are used directly, not imported — the Workflow script has no filesystem/module access at runtime beyond what the `Workflow` tool itself resolves, so these prompt modules are inlined into the script file rather than imported — see Step 1 note).

This task's script cannot be driven through `node --test` — it only runs
inside the `Workflow` tool, which spawns real subagents against a real
Unity project. There is no cheap, deterministic automated test for it.
Verification here is an explicit manual smoke run, called out as such
rather than skipped.

- [ ] **Step 1: Inline the prompt/schema modules into one script file**

The `Workflow` tool takes a single self-contained script via `script` or
`scriptPath` — it does not resolve `import` statements against the repo's
other files. Concatenate the contents of `prompts/schemas.js`,
`prompts/director.js`, `prompts/designer.js`, `prompts/programmer.js`,
`prompts/artist.js`, and `prompts/tester.js` (function bodies only, with
their `export` keywords removed) into the top of `workflows/build-game.js`,
above the `meta` export. This keeps `prompts/*.js` as the single
source of truth that's unit-tested in Tasks 6-7, and this step is a
mechanical copy that should be re-run any time those files change — note
that requirement in a comment at the top of `build-game.js`.

- [ ] **Step 2: Write the orchestration script**

```javascript
// workflows/build-game.js
// NOTE: the functions/constants above this line are copied from
// prompts/schemas.js, prompts/director.js, prompts/designer.js,
// prompts/programmer.js, prompts/artist.js, prompts/tester.js (Step 1).
// Re-copy them here whenever those files change — this script cannot
// import them at runtime.

export const meta = {
  name: 'build-game',
  description: 'Build and genuinely playtest a Unity game from a prompt',
  phases: [
    { title: 'Vision' },
    { title: 'Design' },
    { title: 'Implementation' },
    { title: 'Director Review' },
    { title: 'Full Playtest' },
    { title: 'Report' },
  ],
}

const MAX_FIX_ATTEMPTS = 4 // 3 same-strategy retries + 1 alternative-strategy attempt

async function implementAndTestTask(task, targetProjectPath) {
  let lastResult = null
  for (let attempt = 1; attempt <= MAX_FIX_ATTEMPTS; attempt++) {
    await agent(implementPrompt(task, attempt, lastResult, targetProjectPath), {
      phase: 'Implementation',
      label: `impl:${task.id}`,
    })
    if (task.needsArt) {
      await agent(artPrompt(task, targetProjectPath), { phase: 'Implementation', label: `art:${task.id}` })
    }
    lastResult = await agent(scenarioTestPrompt(task, targetProjectPath), {
      phase: 'Implementation',
      label: `test:${task.id}`,
      schema: TEST_RESULT_SCHEMA,
    })
    if (lastResult && lastResult.passed) {
      return { task, status: 'done', attempts: attempt, lastResult }
    }
  }
  return { task, status: 'blocked', attempts: MAX_FIX_ATTEMPTS, lastResult }
}

phase('Vision')
const vision = await agent(visionPrompt(args.gameIdea, args.targetProjectPath), {
  schema: VISION_SCHEMA,
  phase: 'Vision',
})

phase('Design')
const design = await agent(designPrompt(vision, args.targetProjectPath), {
  schema: BACKLOG_SCHEMA,
  phase: 'Design',
})

phase('Implementation')
const taskResults = await pipeline(
  design.tasks,
  (task) => implementAndTestTask(task, args.targetProjectPath)
)

phase('Director Review')
const blocked = taskResults.filter(r => r && r.status === 'blocked')
let directorDecisions = null
if (blocked.length > 0) {
  log(`${blocked.length} task(s) blocked after ${MAX_FIX_ATTEMPTS} attempts each — asking the Director`)
  directorDecisions = await agent(escalationPrompt(vision, blocked), {
    phase: 'Director Review',
    schema: { type: 'object', required: ['decisions'], properties: { decisions: { type: 'array', items: {
      type: 'object', required: ['taskId', 'decision', 'reason'],
      properties: { taskId: { type: 'string' }, decision: { type: 'string', enum: ['descope', 'simplify', 'escalate'] }, reason: { type: 'string' } },
    } } } },
  })
}

phase('Full Playtest')
const playtestResult = await agent(fullPlaytestPrompt(vision, design, args.targetProjectPath), {
  schema: PLAYTEST_SCHEMA,
  phase: 'Full Playtest',
})

phase('Report')
const finalReview = await agent(
  finalReviewPrompt(vision, design.tasks.map(t => t.description).join('\n'), taskResults, playtestResult),
  {
    phase: 'Report',
    schema: { type: 'object', required: ['ready', 'reopenTaskIds', 'summary'], properties: {
      ready: { type: 'boolean' }, reopenTaskIds: { type: 'array', items: { type: 'string' } }, summary: { type: 'string' },
    } },
  }
)

return {
  vision,
  taskResults,
  blocked: blocked.map(b => b.task.id),
  directorDecisions,
  playtestResult,
  finalReview,
}
```

- [ ] **Step 3: Write the README with usage instructions**

```markdown
# auto-game-build

Reusable multi-agent pipeline that builds and genuinely playtests a Unity
game from a prompt. See `docs/superpowers/specs/2026-08-27-auto-game-build-design.md`
for the full design.

## Running the pipeline

1. Point it at a Unity project (existing or freshly created) and scaffold
   its `.pipeline/` state:
   ```
   node bin/init-pipeline.js /path/to/your-unity-project
   ```
2. Start the live dashboard (optional, but this is the "who's working on
   what" view — do this before or during the run):
   ```
   node dashboard/server.js /path/to/your-unity-project 4173
   ```
   Then open `http://localhost:4173`.
3. In Claude Code, run the workflow:
   ```
   Workflow({
     scriptPath: "workflows/build-game.js",
     args: { gameIdea: "a short top-down puzzle game about redirecting light beams", targetProjectPath: "/path/to/your-unity-project" }
   })
   ```

## Resuming across sessions

Re-run the same `Workflow` call in a new session with the same
`targetProjectPath`. Because `.pipeline/backlog.json` and
`.pipeline/bugs.json` persist in the target project's own repo, a future
version of this pipeline that reads existing backlog state before writing
a new one will pick up in-progress work rather than starting over (see
"Open Items" in the spec — this initial version always starts a fresh
Vision/Design pass; incremental resume of an in-progress backlog is
follow-up work, not covered by this plan).
```

- [ ] **Step 4: Manual smoke-run verification**

This step requires a real (even if trivial) Unity project and a
Unity MCP server connected in the session, so it cannot be scripted into
an automated test. Verify manually:

1. Create or point at a minimal Unity project with Unity MCP connected.
2. Run `node bin/init-pipeline.js <project>` and confirm `.pipeline/` appears.
3. Start `node dashboard/server.js <project>` and open it in a browser.
4. Invoke the workflow with a deliberately tiny `gameIdea` (e.g. "a single
   scene where pressing space makes a cube jump") so the run is cheap.
5. Confirm: the dashboard shows role cards animating as agents run, a
   `.pipeline/vision.md` and `.pipeline/gdd.md` appear with real content,
   `.pipeline/backlog.json` has at least one task, and the workflow
   returns a `finalReview.summary` describing what happened.
6. If a task's Tester check fails, confirm `.pipeline/bugs.json`-worthy
   detail shows up in the returned `taskResults` evidence, and that a
   `blocked` task (if any) triggers the Director Review phase rather than
   silently stalling.

- [ ] **Step 5: Commit**

```bash
cd auto-game-build
git add workflows/build-game.js README.md
git commit -m "Add build-game Workflow script wiring the full pipeline"
```

---

## Self-Review Notes

- **Spec coverage:** Architecture (Task 8 + file structure), Agent Roster (Tasks 6-7), Workflow Phases (Task 8), State & Persistence (Tasks 1-3), Escalation Policy (Task 8's `implementAndTestTask` + Director Review phase), Live Dashboard (Tasks 4-5), Technology Choices (prompts instruct agents to reach Unity MCP / play-mode MCP via their own `ToolSearch`, per the spec's decision not to hardcode a specific server). Open Items from the spec (exact MCP server pinning, incremental-resume-of-in-progress-backlog) are explicitly called out as follow-up, not silently dropped.
- **Placeholder scan:** No TBD/TODO markers; every step has real code or an explicit, justified reason automated testing doesn't apply (Tasks 5 and 8's UI/workflow-only steps).
- **Type consistency:** `task.id`/`task.specialization`/`task.needsArt`/`task.successCriterion` used consistently from `BACKLOG_TASK_SCHEMA` (Task 6) through `programmer.js`/`artist.js`/`tester.js` (Task 7) into `build-game.js` (Task 8). `TEST_RESULT_SCHEMA`'s `passed`/`evidence`/`bug` fields match how `implementAndTestTask` reads `lastResult.passed` and passes `lastResult` back into `implementPrompt`'s `priorFailure` parameter.
