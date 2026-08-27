# auto-game-build: Autonomous Unity Game-Building Pipeline

Date: 2026-08-27
Status: Approved design, pending implementation plan

## Purpose

A reusable, multi-agent pipeline that takes a natural-language game idea and
builds a functional Unity game end-to-end — design, implementation, art
placeholder, and genuine playtesting — with minimal human involvement,
resumable across multiple sessions.

This repo (`auto-game-build`) is the pipeline tool itself. It is not a game
repo. Each invocation targets an external Unity project directory (the game
being built), which owns its own git history and its own `.pipeline/` state
directory.

## Goals

- Given a prompt describing a game (any genre/complexity — no fixed scope
  ceiling), produce a working Unity project without the user needing to
  babysit every step.
- Genuinely verify the game plays correctly — not just "compiles" — by
  having an agent actually operate Play Mode (inputs + game state), with
  vision-based spot checks, at both the individual-feature level (open a
  menu, enter a level, open a door, fight an enemy) and the full-playthrough
  level.
- Survive across multiple Claude Code sessions: all project state is
  file-based and lives in the target game's repo, so a new session can
  resume exactly where a previous one stopped.
- Give the user live visibility into who (which agent) is working on what,
  without reading logs.

## Non-goals

- Judging whether the game is "fun" — success is defined as functional
  completion (plays without breaking, meets each task's testable success
  criterion), not subjective quality. Fun/feel judgment stays with the user.
- Cross-organization agent interoperability (e.g. A2A protocol) — out of
  scope; all agents run inside one Claude Code Workflow.
- Training an RL policy to play the game (ML-Agents-style) — the Tester is
  an LLM-driven agent operating Play Mode directly, not a trained policy.

## Architecture

`auto-game-build` provides a `Workflow` script (the pipeline) that the user
runs, passing the path to a target Unity project (existing or new). The
Workflow is the **Orchestrator**: it is not an LLM agent itself — it is
deterministic script logic that reads/writes the target project's
`.pipeline/` state, decides which phase runs next, dispatches work to
specialized agents via `agent()`/`parallel()`/`pipeline()`, enforces retry
limits, and decides when to stop and notify the user.

Unity editor control goes through MCP (CoplayDev/unity-mcp or Unity's
official MCP server) for building the game, and through a play-mode/input
MCP layer (FunplayAI-style: simulated key/mouse input, Play Mode
enter/exit, screenshot capture) for the Tester's hybrid play loop.

```
auto-game-build/                  (this repo — the tool)
  workflow scripts, agent prompts, dashboard server

<target-unity-project>/           (a separate repo — the game)
  Assets/, ProjectSettings/, ...  (normal Unity project)
  .pipeline/
    vision.md
    gdd.md
    backlog.json
    bugs.json
    activity.json
    progress-log.md
```

## Agent Roster

All agents are dispatched by the Orchestrator via the `Agent` tool (or
`agent()` calls inside the Workflow script). Roles are prompt/context
specializations, not separate persistent processes.

- **Director** — owns the overall vision. Turns the user's prompt into
  `.pipeline/vision.md` (identity, scope, priorities). Reviewed by the
  Designer as the source of truth. Also: first responder when the
  Orchestrator escalates a blocked task — evaluates whether to adjust scope
  or approach before bothering the user; does a final coherence pass before
  the game is marked done (checks the build still matches the vision, not
  just that it works); can reopen backlog tasks if it doesn't.
- **Designer** — converts `vision.md` into `.pipeline/gdd.md` (short GDD)
  and `.pipeline/backlog.json` — a list of concrete, testable tasks. Every
  task carries: a specialization tag (see Programmer below), a description,
  and an explicit success criterion the Tester can check (e.g. "player can
  jump over a 1-unit obstacle").
- **Programmer (specialized dynamically)** — not one monolithic role.
  Real game studios split programming by specialization (Gameplay, UI, AI/NPC,
  Network, Graphics, Engine/Tools), and this pipeline mirrors that: the
  Designer tags each backlog task with the specialization it needs, and the
  Orchestrator invokes a Programmer agent with a prompt/context specialized
  for that tag. A small prototype might only ever trigger Gameplay + UI
  tags; a game with NPCs or multiplayer triggers AI or Network tags too.
  There is no fixed set of "always-on" programmer agents.
- **Artist** — separate from Programmer. Generates/configures placeholder
  assets (sprites, materials, prefabs) for tasks that need them, and wires
  them into what the Programmer builds.
- **Tester** — hybrid verification, per design decision:
  - Fast loop: simulated input + reading game state (position, health,
    score, etc.) via the play-mode MCP layer — no screenshots needed for
    most checks.
  - Spot checks: takes screenshots at key moments to catch purely visual
    bugs (broken UI, glitches) that state alone wouldn't reveal.
  - Runs two kinds of passes: (1) scoped scenario tests per feature, right
    after that feature is implemented (e.g. "open the pause menu", "enter
    level 2", "open door X", "fight enemy Y") — checked against that task's
    success criterion; (2) a full playthrough pass once the backlog is
    mostly closed.
  - Logs failures to `.pipeline/bugs.json` with repro steps.
- **Fixer** — takes bugs from `bugs.json` and fixes them, then hands back
  to the Tester to re-verify.

## Workflow Phases

1. **Vision** — Director produces `vision.md` from the user's prompt.
2. **Design** — Designer produces `gdd.md` + `backlog.json`.
3. **Implementation per task** — Orchestrator walks the backlog; for each
   task, dispatches the tagged Programmer specialization (and Artist, if
   the task has a visual component) via Unity MCP.
4. **Feature test** — immediately after a task is implemented, Tester runs
   that task's scoped scenario. On failure: bug logged, then the
   Tester↔Fixer loop runs (see Escalation below). On success: task marked
   done in `backlog.json`.
5. **Full playtest** — once the backlog is mostly closed, Tester runs an
   end-to-end playthrough pass covering the full game loop.
6. **Director review** — coherence check against `vision.md` before the
   game is marked done; may reopen backlog tasks if something drifted from
   the intended vision.
7. **Report** — summary to the user: what was built, what (if anything) is
   blocked, what needs a decision.

## State & Persistence

All pipeline state lives in `.pipeline/` inside the target game's own repo,
as plain versioned files (not a memory-server MCP — those are built for
semantic conversational recall, not structured project state, so they're
the wrong tool here):

- `vision.md` — Director's output.
- `gdd.md` — Designer's output.
- `backlog.json` — tasks: id, specialization tag, description, success
  criterion, status (`todo` / `in_progress` / `done` / `blocked`), attempt
  count.
- `bugs.json` — open/closed bugs with repro steps, linked task id.
- `activity.json` — live activity feed for the dashboard (see below);
  who's doing what, right now and historically.
- `progress-log.md` — human-readable running log of phase transitions.

Because this is plain files in the game's git repo, resuming in a new
session means: start the Workflow again pointed at the same target project;
the Orchestrator reads `backlog.json`/`bugs.json` to know what's done, in
progress, or blocked, and continues from there. Git history is the audit
trail; no separate database or memory service is needed.

## Escalation Policy (Tester↔Fixer loop)

Per task/bug, bounded retries as agreed:

1. Fixer attempts a fix (up to N attempts, e.g. 3) using its initial
   strategy, re-verified by Tester each time.
2. If still failing, Fixer is explicitly asked to try a different
   approach (not just repeat), one more attempt.
3. If that also fails, the task/bug is marked `blocked` in `backlog.json`,
   the Orchestrator moves on to other unblocked tasks, and the Director
   evaluates whether scope/approach should change.
4. If the Director can't resolve it either, it's surfaced to the user in
   the final report (or sooner, if it blocks a large portion of remaining
   work) with a clear summary of what was tried.

## Live Progress Dashboard

Read-only, local, animated — not log output:

- The Orchestrator starts a lightweight local HTTP server when the
  pipeline starts and opens it in the browser automatically.
- The page polls `.pipeline/activity.json` (updated by the Orchestrator on
  every agent start/stop) every 1-2s and updates in place, with animation
  (no full reloads).
- Shows: a card per role (Director, Designer, Programmer·specialization,
  Artist, Tester, Fixer) with animated state — idle / working (pulse) /
  blocked (alert) — and the specific task each is on right now; a
  timeline/history of who has been involved and when, across the whole
  session; overall backlog progress (done / in-progress / blocked /
  total) and current workflow phase.
- Entirely local — nothing is published or sent anywhere, consistent with
  state living in the game's own repo.

## Technology Choices (from research, 2026-08-27)

- **Unity MCP**: CoplayDev/unity-mcp (or Unity's own official MCP server)
  for editor/scene/script control. Add a play-mode/input/screenshot MCP
  layer (FunplayAI/funplay-unity-mcp or equivalent) specifically for the
  Tester's hybrid loop. Do not build custom Unity-side input plumbing —
  it already exists.
- **Automated playtesting**: LLM-as-tester (not RL) matches current
  practice and this project's "functional, not fun" success criterion.
  Unity's ML-Agents toolkit is explicitly out of scope (RL-training
  focused, wrong tool).
- **Orchestration substrate**: Claude Code's own `Workflow` tool
  (deterministic phase script) and `Agent` tool (subagents), not an
  external protocol. A2A (Agent2Agent) is real but built for
  cross-organization agent interop over a network — not relevant to
  orchestrating subagents inside a single Workflow run; explicitly skipped.
- **Persistent state**: plain structured files versioned in the target
  repo, not an MCP memory server (those solve semantic recall, not backlog
  tracking).

## Testing Strategy Summary

Every backlog task must carry an explicit, checkable success criterion —
this is what makes "genuinely plays" tractable instead of subjective.
Feature-level tests are scoped and fast (single scenario, input+state).
Full playthrough tests run less often (end of a work batch) and are more
expensive. Vision-based screenshot checks are reserved for spot-checking
visual correctness, not the primary pass/fail signal, to keep the loop fast.

## Open Items for the Implementation Plan

- Exact Workflow script structure (phase definitions, `agent()` call
  shapes, schemas for structured agent outputs like backlog tasks and bug
  reports).
- Exact `backlog.json` / `bugs.json` / `activity.json` schemas.
- Choice and pinning of specific MCP server versions (CoplayDev/unity-mcp
  version, play-mode/input MCP layer).
- Dashboard implementation details (server tech, port, HTML/JS/CSS).
- How the Orchestrator determines "backlog mostly closed" as the trigger
  for the full playtest phase.
