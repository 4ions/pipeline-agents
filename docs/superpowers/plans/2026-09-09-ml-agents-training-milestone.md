# ML-Agents Training Milestone Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add ML-Agents training as a new kind of milestone task the `auto-game-build` pipeline can build, launch, monitor to convergence, and verify — usable the next time the Designer's roadmap for the "World" project reaches an ML-training milestone.

**Architecture:** A new optional `taskKind` field on a backlog task routes it, inside the existing per-milestone `Implementation` loop, to three new prompt functions (launch training, monitor convergence, integrate+verify the trained model) instead of the generic Programmer/Artist/Tester cycle every other task uses. Convergence judgment is split between a deterministic Python script (reads TensorBoard event files, computes rolling stats, returns a verdict) and a Claude agent that only decides what to DO with that verdict — never eyeballing raw numbers itself.

**Tech Stack:** Node.js (existing pipeline, unchanged), Python 3.10.12 in the `World` project's `.venv-mlagents` venv (already has `tensorboard` installed as an `mlagents` dependency — no new Python packages needed), the existing `funplay-unity` MCP tools plus `execute_code` for anything with no dedicated tool.

**Spec:** `docs/superpowers/specs/2026-09-09-ml-agents-training-design.md` (this plan argues from it — read both; the spec has the full reasoning behind every design choice referenced here in one line).

## Global Constraints

- `prompts/*.js` are standalone ES modules — **zero cross-file imports**. `bin/build-workflow.js` concatenates every `prompts/*.js` file (after stripping `export`) plus `workflows/milestone-build.body.js` into `workflows/milestone-build.js`. A new prompt file just needs adding to the concatenation list in `bin/build-workflow.js`.
- `workflows/*.body.js` have **no filesystem access** — every side effect is an `agent()` dispatch. The workflow script itself may only read/branch on data already returned by a prior `agent()` call.
- Every new prompt function needs a smoke test in `prompts/prompts.test.js` (assert key parameters/instructions appear in the returned string) — follow the exact fixture/assertion style already in that file (see `FIXTURE_TASK`, `FIXTURE_VISION`, `FIXTURE_TARGET_PATH` at its top).
- Every new/changed schema needs shape coverage in `prompts/schemas.test.js`, matching the style of `FINAL_REVIEW_SCHEMA`'s test (assert `required`, assert enum values, assert nested item shapes).
- New optional schema fields must NOT be added to a schema's `required` array — every existing task/prompt in this pipeline constructs `BACKLOG_TASK_SCHEMA`-shaped objects without knowing about this new field, and must keep working unchanged.
- `node bin/build-workflow.js` must be re-run, and `node --test` (currently ~90 tests) must stay green, as the LAST task of this plan — not implied, an explicit task.
- **This plan cannot exercise anything against the live "World" Unity project** — this repo's own session has no MCP connection to it (a different Claude Code session drives that project). Every task below is scoped to be independently verifiable via `node --test` alone; anywhere real Unity/MCP/training behavior can't be verified from here, the task says so explicitly under "Real-world verification still needed" rather than claiming the tests prove the feature works end-to-end.

---

## File Structure

- **Create** `prompts/mlTraining.js` — the three new prompt functions (`launchTrainingPrompt`, `monitorConvergencePrompt`, `trainedModelVerificationPrompt`). New file, not folded into `programmer.js`/`tester.js`, because these are a distinct concern (ML-Agents training orchestration) reused by exactly one new milestone task kind — matches this repo's existing pattern of one file per concern (`artist.js`, `critic.js`, `roadmap.js`, etc.).
- **Create** `tools/training_convergence_check.py` — the deterministic verdict-computing script. Lives outside `prompts/`/`workflows/` (a new top-level `tools/` directory) since it's a real standalone CLI tool invoked via Bash by the dispatched agent, not a Node/Workflow-tool artifact.
- **Create** `tools/training_convergence_check_test.py` — `unittest`-based tests for the script's pure decision logic (no new Python dependency; `unittest` is stdlib).
- **Modify** `prompts/schemas.js` — add `taskKind` to `BACKLOG_TASK_SCHEMA`, add `TRAINING_MONITOR_SCHEMA`.
- **Modify** `prompts/schemas.test.js` — coverage for both.
- **Modify** `prompts/designer.js` — guidance for when/how to author `taskKind`-tagged tasks for an ML-training milestone.
- **Modify** `prompts/prompts.test.js` — smoke tests for every new/changed prompt.
- **Modify** `workflows/milestone-build.body.js` — route `implementAndTestTask` by `task.taskKind`.
- **Modify** `bin/build-workflow.js` — add `prompts/mlTraining.js` to the concatenation list.
- **Regenerate** `workflows/milestone-build.js` (and `build-game.js`, `fix-reopened.js`, which share the same generator and prompt files) via `node bin/build-workflow.js`.

---

### Task 1: `taskKind` field on `BACKLOG_TASK_SCHEMA` + `TRAINING_MONITOR_SCHEMA`

**Files:**
- Modify: `prompts/schemas.js`
- Test: `prompts/schemas.test.js`

**Interfaces:**
- Produces: `BACKLOG_TASK_SCHEMA.properties.taskKind` (optional string enum: `'standard' | 'ml-training-launch' | 'ml-training-monitor' | 'ml-training-integrate-verify'`, NOT in `required`). Produces: `TRAINING_MONITOR_SCHEMA` — the shape `monitorConvergencePrompt` (Task 5) returns.

- [ ] **Step 1: Write the failing tests**

Add to `prompts/schemas.test.js` (place after the existing `BACKLOG_TASK_SCHEMA` test):

```js
test('BACKLOG_TASK_SCHEMA taskKind is optional (not required) and covers all ML-training task kinds', () => {
  assert.ok(!BACKLOG_TASK_SCHEMA.required.includes('taskKind'), 'taskKind must stay optional so every existing task-producing prompt keeps working unchanged')
  assert.deepEqual(
    new Set(BACKLOG_TASK_SCHEMA.properties.taskKind.enum),
    new Set(['standard', 'ml-training-launch', 'ml-training-monitor', 'ml-training-integrate-verify'])
  )
})

test('TRAINING_MONITOR_SCHEMA requires verdict and action, and verdict/action enums match the spec\'s decision tree', () => {
  assert.deepEqual(new Set(TRAINING_MONITOR_SCHEMA.required), new Set(['verdict', 'action', 'reason']))
  assert.deepEqual(
    new Set(TRAINING_MONITOR_SCHEMA.properties.verdict.enum),
    new Set(['plateau', 'plateau_degenerate', 'diverge'])
  )
  assert.deepEqual(
    new Set(TRAINING_MONITOR_SCHEMA.properties.action.enum),
    new Set(['proceed_to_integration', 'retry', 'escalate'])
  )
})
```

Add `TRAINING_MONITOR_SCHEMA` to the existing import line at the top of `prompts/schemas.test.js` (find the line starting `import { VISION_SCHEMA, BACKLOG_SCHEMA, ...} from './schemas.js'` and add `TRAINING_MONITOR_SCHEMA` to the destructured list).

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test prompts/schemas.test.js`
Expected: FAIL — `TRAINING_MONITOR_SCHEMA` is not exported yet, and `BACKLOG_TASK_SCHEMA.properties.taskKind` is `undefined`.

- [ ] **Step 3: Implement**

In `prompts/schemas.js`, add `taskKind` to `BACKLOG_TASK_SCHEMA.properties` (do NOT add it to `required`):

```js
    taskKind: {
      type: 'string',
      enum: ['standard', 'ml-training-launch', 'ml-training-monitor', 'ml-training-integrate-verify'],
      description: 'Defaults to "standard" (the normal Programmer/Artist/Tester implementation cycle) when omitted — every task in every other milestone this pipeline has ever built is "standard". Only set this for a milestone specifically about ML-Agents training: "ml-training-launch" for the task that exports a standalone build and starts an mlagents-learn run in the background; "ml-training-monitor" for the task that polls that run\'s convergence and decides when to stop it; "ml-training-integrate-verify" for the task that assigns the resulting trained model and verifies its measured hunt/evasion success rates via real Play Mode.',
    },
```

Add near the bottom of `prompts/schemas.js` (after `FINAL_REVIEW_SCHEMA`):

```js
export const TRAINING_MONITOR_SCHEMA = {
  type: 'object',
  required: ['verdict', 'action', 'reason'],
  properties: {
    verdict: {
      type: 'string',
      enum: ['plateau', 'plateau_degenerate', 'diverge'],
      description: 'The deterministic convergence-check script\'s own verdict, copied verbatim — never re-derived from raw numbers by the agent itself. "plateau" is a genuine converged, non-degenerate result. "plateau_degenerate" is a flat reward curve with near-zero hunt attempts (the pure-forager equilibrium) — NOT a success even though the reward curve looks fine. "diverge" is reward collapse.',
    },
    action: {
      type: 'string',
      enum: ['proceed_to_integration', 'retry', 'escalate'],
      description: '"proceed_to_integration" only for verdict "plateau". "retry" for "plateau_degenerate" or "diverge" on the FIRST attempt (one adjusted-config retry, per the spec\'s bounded-retry design — mirrors this pipeline\'s existing MAX_MILESTONE_REOPEN_ROUNDS pattern). "escalate" if this is already a retry attempt and it also ended in "plateau_degenerate" or "diverge" — never a second automatic retry.',
    },
    reason: {
      type: 'string',
      description: 'Concrete, numeric — cite the actual observed rolling-mean/std/episode-length/role-balance numbers the script reported, not a vague restatement of the verdict.',
    },
    adjustedConfig: {
      type: 'string',
      description: 'Present only when action is "retry" — the SPECIFIC config change being made (e.g. "widened curriculum stage 1 power-variance range from X-Y to X2-Y2" or "raised hunt-success reward from 0.3 to 0.5"), per the spec\'s constraint that a retry must be a concrete, bounded, documented adjustment, not open-ended re-engineering.',
    },
  },
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test prompts/schemas.test.js`
Expected: PASS, all tests including the two new ones.

- [ ] **Step 5: Commit**

```bash
git add prompts/schemas.js prompts/schemas.test.js
git commit -m "Add taskKind to BACKLOG_TASK_SCHEMA and TRAINING_MONITOR_SCHEMA for ML-Agents training tasks"
```

---

### Task 2: Convergence-check script — pure decision logic

**Files:**
- Create: `tools/training_convergence_check.py`
- Test: `tools/training_convergence_check_test.py`

**Interfaces:**
- Produces: `compute_verdict(history, min_step_floor, slope_tolerance, consecutive_checks, diverge_std_multiplier, diverge_drop_fraction, hunt_attempt_floor)` — a pure function taking a list of per-summary-interval metric dicts and returning `{"verdict": "continue"|"plateau"|"plateau_degenerate"|"diverge", "reason": "<string>"}`. This is the part later steps (Step 2 here for tests, Task 3 for the real TensorBoard-reading wrapper) build on.
- Each `history` entry: `{"step": int, "mean_reward": float, "std_reward": float, "episode_length": float, "hunt_attempts": int, "hunt_successes": int}`.

This task deliberately does NOT read real TensorBoard event files yet — that thin I/O layer is Task 3, kept separate so this task's logic is testable with plain Python lists, no `tensorboard` package or real training run needed.

- [ ] **Step 1: Write the failing tests**

Create `tools/training_convergence_check_test.py`:

```python
import unittest
from training_convergence_check import compute_verdict

MIN_STEP_FLOOR = 1_000_000
SLOPE_TOLERANCE = 0.001
CONSECUTIVE_CHECKS = 3
DIVERGE_STD_MULTIPLIER = 3.0
DIVERGE_DROP_FRACTION = 0.5
HUNT_ATTEMPT_FLOOR = 0.02  # hunt_attempts / episode count, minimum to not be "degenerate"


def make_entry(step, mean_reward, std_reward=0.1, episode_length=50, hunt_attempts=10, hunt_successes=3, episodes=100):
    return {
        "step": step,
        "mean_reward": mean_reward,
        "std_reward": std_reward,
        "episode_length": episode_length,
        "hunt_attempts": hunt_attempts,
        "hunt_successes": hunt_successes,
        "episodes": episodes,
    }


class TestComputeVerdict(unittest.TestCase):
    def test_continues_before_minimum_step_floor(self):
        # A flat curve that would otherwise look plateaued must still
        # report "continue" if it hasn't reached the minimum step floor —
        # this is the exact bug the RL review caught in the first draft.
        history = [make_entry(step=s, mean_reward=0.5) for s in range(0, 500_000, 100_000)]
        result = compute_verdict(history, MIN_STEP_FLOOR, SLOPE_TOLERANCE, CONSECUTIVE_CHECKS,
                                  DIVERGE_STD_MULTIPLIER, DIVERGE_DROP_FRACTION, HUNT_ATTEMPT_FLOOR)
        self.assertEqual(result["verdict"], "continue")

    def test_plateau_after_floor_with_flat_reward_and_healthy_hunt_rate(self):
        history = [make_entry(step=s, mean_reward=0.8, hunt_attempts=15, episodes=100)
                   for s in range(MIN_STEP_FLOOR, MIN_STEP_FLOOR + 400_000, 100_000)]
        result = compute_verdict(history, MIN_STEP_FLOOR, SLOPE_TOLERANCE, CONSECUTIVE_CHECKS,
                                  DIVERGE_STD_MULTIPLIER, DIVERGE_DROP_FRACTION, HUNT_ATTEMPT_FLOOR)
        self.assertEqual(result["verdict"], "plateau")

    def test_plateau_degenerate_when_flat_reward_but_hunt_attempts_near_zero(self):
        # This is the "pure forager" equilibrium the spec specifically
        # warns must NOT be reported as a plain "plateau".
        history = [make_entry(step=s, mean_reward=0.8, hunt_attempts=1, episodes=100)
                   for s in range(MIN_STEP_FLOOR, MIN_STEP_FLOOR + 400_000, 100_000)]
        result = compute_verdict(history, MIN_STEP_FLOOR, SLOPE_TOLERANCE, CONSECUTIVE_CHECKS,
                                  DIVERGE_STD_MULTIPLIER, DIVERGE_DROP_FRACTION, HUNT_ATTEMPT_FLOOR)
        self.assertEqual(result["verdict"], "plateau_degenerate")

    def test_still_trending_upward_continues_not_plateau(self):
        history = [make_entry(step=s, mean_reward=0.1 * i, hunt_attempts=15)
                   for i, s in enumerate(range(MIN_STEP_FLOOR, MIN_STEP_FLOOR + 400_000, 100_000), start=1)]
        result = compute_verdict(history, MIN_STEP_FLOOR, SLOPE_TOLERANCE, CONSECUTIVE_CHECKS,
                                  DIVERGE_STD_MULTIPLIER, DIVERGE_DROP_FRACTION, HUNT_ATTEMPT_FLOOR)
        self.assertEqual(result["verdict"], "continue")

    def test_diverge_on_reward_drop_from_rolling_peak(self):
        history = (
            [make_entry(step=s, mean_reward=1.0, hunt_attempts=15)
             for s in range(MIN_STEP_FLOOR, MIN_STEP_FLOOR + 300_000, 100_000)]
            + [make_entry(step=MIN_STEP_FLOOR + 300_000, mean_reward=0.1, std_reward=0.9, hunt_attempts=15)]
        )
        result = compute_verdict(history, MIN_STEP_FLOOR, SLOPE_TOLERANCE, CONSECUTIVE_CHECKS,
                                  DIVERGE_STD_MULTIPLIER, DIVERGE_DROP_FRACTION, HUNT_ATTEMPT_FLOOR)
        self.assertEqual(result["verdict"], "diverge")

    def test_curriculum_lesson_transition_marker_resets_baseline_not_diverge(self):
        # A lesson transition causing a temporary, EXPECTED dip must not
        # be reported as divergence — this is the fix for the RL
        # re-review's curriculum/monitor-disconnect finding.
        history = (
            [make_entry(step=s, mean_reward=1.0, hunt_attempts=15) for s in range(MIN_STEP_FLOOR, MIN_STEP_FLOOR + 200_000, 100_000)]
            + [dict(make_entry(step=MIN_STEP_FLOOR + 200_000, mean_reward=0.3, hunt_attempts=15), lesson_transition=True)]
            + [make_entry(step=s, mean_reward=0.3, hunt_attempts=15) for s in range(MIN_STEP_FLOOR + 300_000, MIN_STEP_FLOOR + 500_000, 100_000)]
        )
        result = compute_verdict(history, MIN_STEP_FLOOR, SLOPE_TOLERANCE, CONSECUTIVE_CHECKS,
                                  DIVERGE_STD_MULTIPLIER, DIVERGE_DROP_FRACTION, HUNT_ATTEMPT_FLOOR)
        self.assertNotEqual(result["verdict"], "diverge")


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd tools && python3 -m unittest training_convergence_check_test -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'training_convergence_check'`.

- [ ] **Step 3: Implement**

Create `tools/training_convergence_check.py`:

```python
"""Deterministic convergence-verdict logic for the ML-Agents training
milestone. See docs/superpowers/specs/2026-09-09-ml-agents-training-design.md
("Convergence monitoring") for the full reasoning behind every threshold
here. This module's compute_verdict() is pure (no file I/O) so it can be
unit-tested with plain Python data — the real TensorBoard-event-file
reader that produces `history` lists like this lives in
read_tensorboard_history() below, added in a later task.
"""

from __future__ import annotations


def _rolling_slope(values: list[float]) -> float:
    """Least-squares slope of `values` against their index — a simple,
    dependency-free trend measure (no numpy needed for this small a
    window)."""
    n = len(values)
    if n < 2:
        return 0.0
    xs = list(range(n))
    mean_x = sum(xs) / n
    mean_y = sum(values) / n
    numerator = sum((x - mean_x) * (y - mean_y) for x, y in zip(xs, values))
    denominator = sum((x - mean_x) ** 2 for x in xs)
    return numerator / denominator if denominator else 0.0


def compute_verdict(
    history: list[dict],
    min_step_floor: int,
    slope_tolerance: float,
    consecutive_checks: int,
    diverge_std_multiplier: float,
    diverge_drop_fraction: float,
    hunt_attempt_floor: float,
) -> dict:
    """Return {"verdict": "continue"|"plateau"|"plateau_degenerate"|"diverge", "reason": str}.

    `history` is ordered oldest-to-newest. Each entry may carry
    `lesson_transition: True` to mark a curriculum-stage change — the
    window used for DIVERGE/PLATEAU checks never spans across a
    transition, so a legitimate difficulty-driven dip is never
    mistaken for reward collapse or a real plateau.
    """
    if not history:
        return {"verdict": "continue", "reason": "No training data yet."}

    latest_step = history[-1]["step"]
    if latest_step < min_step_floor:
        return {
            "verdict": "continue",
            "reason": f"Step {latest_step} is below the minimum floor {min_step_floor} — no verdict is permitted yet regardless of curve shape.",
        }

    # Restrict to the window since the most recent lesson transition (if
    # any), so a transition's expected dip never counts as a slope
    # violation or a reward-drop divergence.
    last_transition_idx = 0
    for i, entry in enumerate(history):
        if entry.get("lesson_transition"):
            last_transition_idx = i
    window = history[last_transition_idx:]

    if len(window) < consecutive_checks:
        return {
            "verdict": "continue",
            "reason": f"Only {len(window)} data point(s) since the last curriculum transition — need at least {consecutive_checks} before any verdict.",
        }

    recent = window[-consecutive_checks:]
    rewards = [e["mean_reward"] for e in recent]
    stds = [e["std_reward"] for e in window]
    peak_reward = max(e["mean_reward"] for e in window)

    # DIVERGE: a std spike relative to its own recent baseline, or a
    # sustained drop from the rolling peak — checked BEFORE plateau, since
    # a diverging curve can look locally "flat-ish" on a short slope test.
    baseline_std = sum(stds[:-1]) / len(stds[:-1]) if len(stds) > 1 else stds[0]
    if baseline_std > 0 and recent[-1]["std_reward"] > baseline_std * diverge_std_multiplier:
        return {
            "verdict": "diverge",
            "reason": f"Std of Reward {recent[-1]['std_reward']:.3f} exceeds {diverge_std_multiplier}x its recent baseline {baseline_std:.3f}.",
        }
    if peak_reward > 0 and recent[-1]["mean_reward"] < peak_reward * (1 - diverge_drop_fraction):
        return {
            "verdict": "diverge",
            "reason": f"Mean Reward {recent[-1]['mean_reward']:.3f} dropped more than {diverge_drop_fraction * 100:.0f}% from its rolling peak {peak_reward:.3f}.",
        }

    # PLATEAU (or PLATEAU-DEGENERATE): slope over the last N points must
    # stay below tolerance for those N consecutive checks.
    slope = _rolling_slope(rewards)
    if abs(slope) > slope_tolerance:
        return {
            "verdict": "continue",
            "reason": f"Mean Reward slope {slope:.5f} still exceeds tolerance {slope_tolerance} over the last {consecutive_checks} checks — still trending, not plateaued.",
        }

    total_episodes = sum(e.get("episodes", 0) for e in recent)
    total_hunt_attempts = sum(e.get("hunt_attempts", 0) for e in recent)
    hunt_rate = (total_hunt_attempts / total_episodes) if total_episodes else 0.0
    if hunt_rate < hunt_attempt_floor:
        return {
            "verdict": "plateau_degenerate",
            "reason": f"Mean Reward plateaued (slope {slope:.5f}) but hunt-attempt rate {hunt_rate:.4f} is below the floor {hunt_attempt_floor} — this looks like the degenerate pure-forager equilibrium, not genuine predator/prey convergence.",
        }

    return {
        "verdict": "plateau",
        "reason": f"Mean Reward plateaued (slope {slope:.5f} over last {consecutive_checks} checks) with a healthy hunt-attempt rate ({hunt_rate:.4f}).",
    }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd tools && python3 -m unittest training_convergence_check_test -v`
Expected: PASS, all 6 tests.

- [ ] **Step 5: Commit**

```bash
git add tools/training_convergence_check.py tools/training_convergence_check_test.py
git commit -m "Add deterministic convergence-verdict logic for ML-Agents training monitoring"
```

**Real-world verification still needed**: the exact numeric defaults for `min_step_floor`, `slope_tolerance`, `consecutive_checks`, `diverge_std_multiplier`, `diverge_drop_fraction`, and `hunt_attempt_floor` are placeholders proven only against synthetic test data here — the spec itself flags these as needing tuning against a real training run's actual numbers (see spec's "Open risks"). Task 3 wires these as CLI arguments with the test values above as defaults so they're easy to override once real data exists, not hardcoded.

---

### Task 3: Convergence-check script — TensorBoard reading + CLI entry point

**Files:**
- Modify: `tools/training_convergence_check.py`
- Test: `tools/training_convergence_check_test.py`

**Interfaces:**
- Consumes: `compute_verdict` (Task 2).
- Produces: `read_tensorboard_history(logdir, custom_tags)` — reads real `events.out.tfevents.*` files via `tensorboard.backend.event_processing.event_accumulator.EventAccumulator`, returns a `history` list in the exact shape `compute_verdict` expects. Produces: a CLI (`python3 training_convergence_check.py --logdir <path> ...`) printing one JSON verdict object to stdout — this is what `launchTrainingPrompt`/`monitorConvergencePrompt` (Tasks 4-5) invoke via Bash.

- [ ] **Step 1: Write the failing test**

Add to `tools/training_convergence_check_test.py`:

```python
import json
import subprocess
import sys


class TestCliEntryPoint(unittest.TestCase):
    def test_cli_prints_valid_json_verdict_for_empty_logdir(self):
        # No real training run needed for this smoke test — an empty/
        # nonexistent logdir must still produce a well-formed "continue"
        # verdict, not crash. Real TensorBoard-reading behavior against
        # an ACTUAL training run's event files cannot be verified from
        # this repo (no live Unity/mlagents-learn run here) — that's a
        # real-world verification step, not something this test proves.
        result = subprocess.run(
            [sys.executable, "training_convergence_check.py", "--logdir", "/tmp/does-not-exist-logdir"],
            capture_output=True, text=True, cwd="tools",
        )
        self.assertEqual(result.returncode, 0, result.stderr)
        verdict = json.loads(result.stdout)
        self.assertEqual(verdict["verdict"], "continue")
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd tools && python3 -m unittest training_convergence_check_test.TestCliEntryPoint -v`
Expected: FAIL — no `if __name__` CLI argument handling exists yet, `--logdir` is not a recognized argument.

- [ ] **Step 3: Implement**

Add to `tools/training_convergence_check.py` (before the existing `if __name__ == "__main__":` guard from Task 2 — replace that guard entirely with the version below):

```python
def read_tensorboard_history(logdir: str, custom_tags: dict[str, str] | None = None) -> list[dict]:
    """Read Mean Reward / Std of Reward / episode length / custom
    role-balance scalars from TensorBoard event files under `logdir`.
    Returns [] if the directory doesn't exist or has no events yet —
    the CLI treats an empty history as "continue", not an error, since
    this runs on a schedule before training may have produced its first
    summary interval.

    custom_tags maps our logical names to the actual StatsRecorder tag
    strings used when this milestone's launch/monitor tasks are
    implemented (e.g. {"hunt_attempts": "Custom/HuntAttempts"}) — kept
    as a parameter rather than hardcoded tag names here, since the exact
    tag strings are decided when the Agent/Academy C# code (a separate,
    "standard"-taskKind task) is written, not by this script.
    """
    import os

    if not os.path.isdir(logdir):
        return []

    from tensorboard.backend.event_processing.event_accumulator import EventAccumulator

    tags = custom_tags or {}
    ea = EventAccumulator(logdir, size_guidance={"scalars": 0})
    ea.Reload()

    def series(tag):
        return {e.step: e.value for e in ea.Scalars(tag)} if tag in ea.Tags().get("scalars", []) else {}

    mean_reward = series("Environment/Cumulative Reward")
    std_reward = series("Environment/Cumulative Reward Std") if "Environment/Cumulative Reward Std" in ea.Tags().get("scalars", []) else {}
    episode_length = series("Environment/Episode Length")
    hunt_attempts = series(tags.get("hunt_attempts", "Custom/HuntAttempts"))
    hunt_successes = series(tags.get("hunt_successes", "Custom/HuntSuccesses"))
    episodes = series(tags.get("episodes", "Custom/Episodes"))
    lesson_transitions = series(tags.get("lesson_transition", "Custom/LessonTransition"))

    history = []
    for step in sorted(mean_reward.keys()):
        entry = {
            "step": step,
            "mean_reward": mean_reward.get(step, 0.0),
            "std_reward": std_reward.get(step, 0.0),
            "episode_length": episode_length.get(step, 0.0),
            "hunt_attempts": hunt_attempts.get(step, 0),
            "hunt_successes": hunt_successes.get(step, 0),
            "episodes": episodes.get(step, 0),
        }
        if lesson_transitions.get(step):
            entry["lesson_transition"] = True
        history.append(entry)
    return history


def main():
    import argparse
    import json as json_module

    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--logdir", required=True, help="mlagents-learn results directory for this run-id")
    parser.add_argument("--min-step-floor", type=int, default=1_000_000)
    parser.add_argument("--slope-tolerance", type=float, default=0.001)
    parser.add_argument("--consecutive-checks", type=int, default=3)
    parser.add_argument("--diverge-std-multiplier", type=float, default=3.0)
    parser.add_argument("--diverge-drop-fraction", type=float, default=0.5)
    parser.add_argument("--hunt-attempt-floor", type=float, default=0.02)
    args = parser.parse_args()

    history = read_tensorboard_history(args.logdir)
    result = compute_verdict(
        history,
        args.min_step_floor,
        args.slope_tolerance,
        args.consecutive_checks,
        args.diverge_std_multiplier,
        args.diverge_drop_fraction,
        args.hunt_attempt_floor,
    )
    print(json_module.dumps(result))


if __name__ == "__main__":
    main()
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd tools && python3 -m unittest training_convergence_check_test -v`
Expected: PASS, all 7 tests (the 6 from Task 2 plus the new CLI test). If `ModuleNotFoundError: No module named 'tensorboard'` occurs, run this with the World project's venv Python instead: `/Users/leovalsan/Unity/World/.venv-mlagents/bin/python3 -m unittest training_convergence_check_test -v` (this repo itself has no Python venv of its own — the script is meant to run inside whichever venv `mlagents` is installed in, which already has `tensorboard`).

- [ ] **Step 5: Commit**

```bash
git add tools/training_convergence_check.py tools/training_convergence_check_test.py
git commit -m "Add TensorBoard event-file reading and CLI entry point to the convergence checker"
```

**Real-world verification still needed**: the actual TensorBoard scalar tag names used (`Environment/Cumulative Reward`, etc.) are ML-Agents' documented defaults but haven't been confirmed against a real run's event files from this repo — and the custom tag names (`Custom/HuntAttempts` etc.) don't exist until the Agent/Academy C# code that calls `StatsRecorder.Add(...)` is written and actually run once. Confirm both against a real `mlagents-learn` run's TensorBoard output before trusting this in production.

---

### Task 4: `launchTrainingPrompt`

**Files:**
- Create: `prompts/mlTraining.js`
- Test: `prompts/prompts.test.js`

**Interfaces:**
- Consumes: `task` (a `BACKLOG_TASK_SCHEMA`-shaped object with `taskKind: 'ml-training-launch'`), `targetProjectPath`, `vision`.
- Produces: a prompt string. No schema — this task's dispatch (Task 8) uses it without structured output, same as `implementPrompt`.

- [ ] **Step 1: Write the failing test**

Add to `prompts/prompts.test.js` (near the other role-prompt tests):

```js
const FIXTURE_ML_LAUNCH_TASK = { ...FIXTURE_TASK, id: 'M13-T1', taskKind: 'ml-training-launch', description: 'Export a standalone build and launch ML-Agents training' }

test('launchTrainingPrompt instructs exporting a standalone build (not the live Editor) and launching mlagents-learn with time_scale/no_graphics/num-envs/resume set explicitly', () => {
  const result = launchTrainingPrompt(FIXTURE_ML_LAUNCH_TASK, FIXTURE_TARGET_PATH, FIXTURE_VISION)
  assert.equal(typeof result, 'string')
  assert.ok(result.includes('standalone build'))
  assert.ok(result.includes('mlagents-learn'))
  assert.ok(result.includes('--num-envs'))
  assert.ok(result.includes('--resume'))
  assert.ok(result.includes('no_graphics'))
  assert.ok(result.includes('time_scale'))
  assert.ok(result.includes('max_steps'))
  assert.ok(result.includes(FIXTURE_TARGET_PATH))
})

test('launchTrainingPrompt instructs writing the run-id/logdir to a file the monitor task can find', () => {
  const result = launchTrainingPrompt(FIXTURE_ML_LAUNCH_TASK, FIXTURE_TARGET_PATH, FIXTURE_VISION)
  assert.ok(result.includes('.pipeline/ml-training/'))
  assert.ok(result.includes(FIXTURE_ML_LAUNCH_TASK.id))
})
```

Add `launchTrainingPrompt` to the import from `./mlTraining.js` at the top of `prompts/prompts.test.js` (new import line, matching the style of the other `import { ... } from './xxx.js'` lines):

```js
import { launchTrainingPrompt, monitorConvergencePrompt, trainedModelVerificationPrompt } from './mlTraining.js'
```

(This imports all three functions now so later tasks in this plan don't need to re-touch this import line.)

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test prompts/prompts.test.js`
Expected: FAIL — `prompts/mlTraining.js` doesn't exist yet (module not found).

- [ ] **Step 3: Implement**

Create `prompts/mlTraining.js`:

```js
export function launchTrainingPrompt(task, targetProjectPath, vision) {
  return `You are a SENIOR ${task.specialization} Unity/ML-Agents engineer
working on ${targetProjectPath} — this task exports a standalone Player
build of the current scene and launches an ML-Agents PPO training run
against it in the background, per
${targetProjectPath}/../auto-game-build/docs/superpowers/specs/2026-09-09-ml-agents-training-design.md
("Training architecture" / "Execution").
${vision ? `
Full game context: """${vision.identity}""" Priorities, in order: ${vision.priorities.join(', ')}.
` : ''}
Task: ${task.description}
Success criterion: ${task.successCriterion}

CRITICAL — export a STANDALONE build, do not train against the live
Editor. Live Editor Play Mode in this environment has a known OS-focus
dependency that a headless training run must not inherit, and training
needs native simulation speed with no MCP/agent round-trip per step.
Use the funplay-unity MCP tools (search for "funplay" if you don't see
them yet) to find a build-export tool; if none exists, use execute_code
to call UnityEditor.BuildPipeline.BuildPlayer with a Windows/Mac/Linux
standalone target matching this machine, output path
${targetProjectPath}/Builds/TrainingPlayer/. Confirm the build actually
produced an executable before proceeding — do not assume BuildPipeline
succeeded just because it returned without throwing.

CRITICAL — launch mlagents-learn with these settings EXPLICITLY set in
the trainer config YAML, not left at defaults:
- engine_settings.time_scale: at least 20 (ML-Agents' own default) —
  raise it further for this lightweight 2D scene if the training
  machine's CPU allows; nobody watches training happen, there's no
  reason to run at 1x.
- engine_settings.no_graphics: true — nothing needs rendering during
  training.
- network_settings.normalize: false — this design's observations are
  already manually bounded to [0,1]/[-1,1] via explicit formulas in the
  spec; stacking ML-Agents' own running normalization on top is an
  unnecessary source of early-training instability.
- max_steps: set from real research into a comparable ML-Agents
  multi-agent example's actual step count (the spec explicitly warns
  the mlagents-learn default of 500,000 is two orders of magnitude too
  low for this task class) — do NOT leave this at default.
Launch via Bash: \`mlagents-learn <config>.yaml --env=<build path>
--run-id=<a stable id derived from "${task.id}"> --num-envs=<N, bounded
by this machine's actual CPU core count — check with
\`sysctl -n hw.ncpu\` or \`nproc\`, don't guess> --no-graphics &\` — run
it as a background process (redirect stdout/stderr to a log file under
${targetProjectPath}/.pipeline/ml-training/), do not block this task
waiting for training to finish; that's the monitor task's job.
If a previous run with the same run-id already has checkpoints (this
task is being re-run after an interruption), pass --resume instead of
starting fresh.

CRITICAL — write ${targetProjectPath}/.pipeline/ml-training/${task.id}-run.json
with the exact run-id, the mlagents-learn results/TensorBoard logdir
path, and the build path used — the monitor task (a separate, later
task) reads this file to know what to watch. Use your Read/Write tools
for this, not execute_code.

Append a "start" line and, when the process is confirmed launched (not
when training finishes — that's a different task), a "done" line to
${targetProjectPath}/.pipeline/activity.log.jsonl: {"ts": "<ISO
timestamp from shell 'date -u +%Y-%m-%dT%H:%M:%SZ'>", "role":
"programmer", "specialization": "${task.specialization}", "taskId":
"${task.id}", "event": "start"|"done", "detail": "<short note, e.g.
'Launched training run <run-id>, num-envs=N, max_steps=X'>"}.

Report back the run-id, the logdir path, and confirmation the training
process is actually running (not just that the launch command returned
without error — check the process is alive and the log file is
growing).`
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test prompts/prompts.test.js`
Expected: the two new `launchTrainingPrompt` tests PASS. The two `monitorConvergencePrompt`/`trainedModelVerificationPrompt` imports will still fail the whole file at import time until Tasks 5-6 add those exports — this is expected and resolved by the end of Task 6, not this task; note it in your test run output but don't treat it as this task's own failure.

- [ ] **Step 5: Commit**

```bash
git add prompts/mlTraining.js prompts/prompts.test.js
git commit -m "Add launchTrainingPrompt for the ML-Agents training milestone"
```

---

### Task 5: `monitorConvergencePrompt`

**Files:**
- Modify: `prompts/mlTraining.js`
- Test: `prompts/prompts.test.js`

**Interfaces:**
- Consumes: `task`, `targetProjectPath`, `vision`, `attemptNumber` (1 for the first attempt, 2 for the one automatic retry — see Task 8's routing).
- Produces: a prompt string; dispatched with `schema: TRAINING_MONITOR_SCHEMA` (Task 1).

- [ ] **Step 1: Write the failing test**

Add to `prompts/prompts.test.js`:

```js
const FIXTURE_ML_MONITOR_TASK = { ...FIXTURE_TASK, id: 'M13-T2', taskKind: 'ml-training-monitor', description: 'Monitor training convergence and decide when to stop' }

test('monitorConvergencePrompt instructs looping the convergence-check script via Bash and consuming its verdict, never reasoning over raw numbers itself', () => {
  const result = monitorConvergencePrompt(FIXTURE_ML_MONITOR_TASK, FIXTURE_TARGET_PATH, FIXTURE_VISION, 1)
  assert.equal(typeof result, 'string')
  assert.ok(result.includes('training_convergence_check.py'))
  assert.ok(result.includes('plateau_degenerate'))
  assert.ok(result.includes('diverge'))
  assert.ok(result.includes('never') && result.toLowerCase().includes('raw'), 'must warn against reasoning over raw numbers directly')
})

test('monitorConvergencePrompt treats attempt 2 as the bounded retry, escalating instead of retrying again on a repeat bad verdict', () => {
  const firstAttempt = monitorConvergencePrompt(FIXTURE_ML_MONITOR_TASK, FIXTURE_TARGET_PATH, FIXTURE_VISION, 1)
  assert.ok(firstAttempt.includes('"retry"'))

  const secondAttempt = monitorConvergencePrompt(FIXTURE_ML_MONITOR_TASK, FIXTURE_TARGET_PATH, FIXTURE_VISION, 2)
  assert.ok(secondAttempt.includes('escalate'))
  assert.ok(secondAttempt.includes('do NOT') || secondAttempt.includes('never'), 'must forbid a second automatic retry')
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test prompts/prompts.test.js`
Expected: FAIL — `monitorConvergencePrompt` is not exported from `prompts/mlTraining.js` yet.

- [ ] **Step 3: Implement**

Add to `prompts/mlTraining.js`:

```js
export function monitorConvergencePrompt(task, targetProjectPath, vision, attemptNumber) {
  const isRetry = attemptNumber >= 2
  return `You are monitoring an ML-Agents training run for
${targetProjectPath}, per
${targetProjectPath}/../auto-game-build/docs/superpowers/specs/2026-09-09-ml-agents-training-design.md
("Convergence monitoring").
${vision ? `
Full game context: """${vision.identity}""" Priorities, in order: ${vision.priorities.join(', ')}.
` : ''}
Task: ${task.description}
Success criterion: ${task.successCriterion}
This is monitoring attempt ${attemptNumber}${isRetry ? ' (the ONE bounded retry after an earlier plateau_degenerate/diverge verdict — see below)' : ' (the first attempt)'}.

Read ${targetProjectPath}/.pipeline/ml-training/${task.id.replace(/-T\d+$/, '')}-T1-run.json
(written by the launch task) for the training run's logdir path.

CRITICAL — you NEVER judge convergence by reading raw Mean
Reward/Std/episode-length numbers yourself. Loop: run
\`python3 <path to auto-game-build repo>/tools/training_convergence_check.py
--logdir <logdir from the run.json>\` via Bash (use the World project's
own venv Python at .venv-mlagents/bin/python3, which already has
tensorboard installed), wait a reasonable interval (e.g. \`sleep 300\`)
between checks so you're not spamming the filesystem, and repeat until
the script's own JSON output reports a verdict other than "continue"
(that field is called "verdict" in its JSON output — it is the ONLY
thing you read to decide what happened, not the underlying reward
numbers). This can take a genuinely long time (potentially hours) —
keep looping within this same task, don't give up early.

Once the script reports a terminal verdict, decide the action per this
table (this is the ENTIRE decision logic — do not improvise a different
mapping):
- verdict "plateau" -> action "proceed_to_integration".
- verdict "plateau_degenerate" or "diverge"${isRetry ? `, and this IS
  attempt ${attemptNumber} (a retry) -> action "escalate". Do NOT set
  action to "retry" here — the one automatic retry budget for this
  training run is already used; a second automatic retry is never
  allowed, escalate to a human via the Director's existing blocked-task
  path instead.` : ` -> action "retry". Pick ONE concrete, bounded
  adjustment (not open-ended re-engineering) and state it in
  "adjustedConfig": either widen the curriculum's early-stage
  encounter-forcing ranges further than the first attempt used, or
  raise the hunting/evading reward magnitudes relative to foraging
  (staying within the spec's ≤1.0-magnitude, [-1,1]-per-decision
  constraints). Then actually relaunch training with that one change
  (same process as the launch task, but with the adjusted config and a
  new run-id) before returning your structured result.`}

Report your decision as structured data: verdict (copied verbatim from
the script), action, reason (cite the script's own numeric reason text,
not a restatement), and adjustedConfig (only when action is "retry").`
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test prompts/prompts.test.js`
Expected: the `monitorConvergencePrompt` tests PASS. `trainedModelVerificationPrompt` import still pending until Task 6.

- [ ] **Step 5: Commit**

```bash
git add prompts/mlTraining.js prompts/prompts.test.js
git commit -m "Add monitorConvergencePrompt with the bounded retry-then-escalate decision tree"
```

---

### Task 6: `trainedModelVerificationPrompt`

**Files:**
- Modify: `prompts/mlTraining.js`
- Test: `prompts/prompts.test.js`

**Interfaces:**
- Consumes: `task`, `attempt`, `targetProjectPath`, `vision` — same signature shape as `scenarioTestPrompt` in `prompts/tester.js`, since this is dispatched the same way (Task 8 routes to it instead of `scenarioTestPrompt` for this task kind).
- Produces: a prompt string; dispatched with `schema: TEST_RESULT_SCHEMA` (reused as-is — `{passed, evidence, bug}` already fits: `evidence` carries the measured success-rate numbers).

- [ ] **Step 1: Write the failing test**

Add to `prompts/prompts.test.js`:

```js
const FIXTURE_ML_VERIFY_TASK = { ...FIXTURE_TASK, id: 'M13-T3', taskKind: 'ml-training-integrate-verify', description: 'Assign the trained model and verify measured hunt/evasion success rates' }

test('trainedModelVerificationPrompt requires a concrete, measured pass/fail band (not qualitative judgment) using EncounterTelemetry', () => {
  const result = trainedModelVerificationPrompt(FIXTURE_ML_VERIFY_TASK, 1, FIXTURE_TARGET_PATH, FIXTURE_VISION)
  assert.equal(typeof result, 'string')
  assert.ok(result.includes('EncounterTelemetry'))
  assert.ok(result.includes('15') || result.includes('20'), 'must specify a concrete minimum encounter count, not a vague amount')
  assert.ok(result.toLowerCase().includes('floor'))
  assert.ok(result.toLowerCase().includes('ceiling') || result.toLowerCase().includes('suspicio'))
  assert.ok(result.includes('inference'))
})

test('trainedModelVerificationPrompt selects the deployed checkpoint by role-balance telemetry, not simply the last one saved', () => {
  const result = trainedModelVerificationPrompt(FIXTURE_ML_VERIFY_TASK, 1, FIXTURE_TARGET_PATH, FIXTURE_VISION)
  assert.ok(result.toLowerCase().includes('checkpoint'))
  assert.ok(result.includes('not') && result.toLowerCase().includes('last'))
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test prompts/prompts.test.js`
Expected: FAIL — `trainedModelVerificationPrompt` is not exported yet. This is the LAST missing export, so this is also the first point the whole `prompts.test.js` file can fully load again since Task 4's import line named all three functions up front.

- [ ] **Step 3: Implement**

Add to `prompts/mlTraining.js`:

```js
export function trainedModelVerificationPrompt(task, attempt, targetProjectPath, vision) {
  return `You are a SENIOR QA engineer verifying a newly-trained
ML-Agents model for ${targetProjectPath}, per
${targetProjectPath}/../auto-game-build/docs/superpowers/specs/2026-09-09-ml-agents-training-design.md
("Model integration & verification").
${vision ? `
Full game context: """${vision.identity}""" Priorities, in order: ${vision.priorities.join(', ')}.
` : ''}
Task: ${task.description}
Success criterion: ${task.successCriterion}
This is check attempt ${attempt} for this task.

CRITICAL — checkpoint selection: do NOT simply use the last/highest-numbered
checkpoint from training. Read the role-balance telemetry (hunt
attempts/successes, forage/flee/engage fractions) for each saved
checkpoint and pick the one with the most balanced, non-degenerate role
distribution — per the spec, the final checkpoint can plausibly
correspond to a moment where hunting/evading signal had already started
thinning out (a one-way curriculum's "forgetting" risk) even if Mean
Reward looks fine there.

Copy the selected checkpoint's exported .onnx into
${targetProjectPath}/Assets/, and assign it to the trained agents'
Behavior Parameters component, model field, in Inference mode (not
Heuristic or Default).

CRITICAL — this is a MEASURED pass/fail, not a qualitative "looks
sensible" judgment. Imperfect behavior (a missed catch, a failed
evasion) is NORMAL and expected from a trained policy — it is NOT
automatically a bug the way it would be for deterministic rule-based
code. Do this instead:
1. Enter Play Mode and observe (or play against, if this involves the
   player) the trained agents for long enough to accumulate at least 15-20
   encounters (an "encounter" is defined the same way as in the reward
   function's EncounterTelemetry component: begins when a higher/lower-power
   agent enters immediate range with the established hysteresis
   margin/dwell-time/cooldown, ends on separation past that margin or on
   a catch) — not a fixed time window, since encounter rate varies and a
   fixed window could accumulate too few data points to mean anything.
2. Read the EncounterTelemetry log/counters via get_console_logs or
   get_component_properties (same tooling you already use for other
   verification tasks in this pipeline).
3. Compute hunt-success rate and evasion-success rate SEPARATELY — they
   are different skills; do not collapse them into one aggregate number,
   since that would hide a model that's only good at one.
4. PASS requires each rate to fall within an expected band: floor
   ~30-40% (below this, the model is barely functional — rule out with
   a FAIL), ceiling near 100% is treated as suspicious, not celebrated
   (investigate whether the encounter-difficulty configuration made that
   skill trivially easy, or something is exploiting the encounter/catch
   logic, before accepting it as a genuinely good result). Both bounds
   are starting points from the spec to tune against this run's actual
   numbers, not fixed truths — if the real observed rates cluster
   somewhere unexpected relative to this band, note that as evidence for
   revising the band, not automatically as a bug in the model.
5. If either rate falls outside the expected band, this is a real FAIL
   — report it with the actual observed numbers (encounters observed,
   successes, computed rate) as evidence, matching this pipeline's
   TEST_RESULT_SCHEMA bug-reporting convention.

Append a "start" line and, when done, a "done" line to
${targetProjectPath}/.pipeline/activity.log.jsonl: {"ts": "<ISO
timestamp from shell 'date -u +%Y-%m-%dT%H:%M:%SZ'>", "role": "tester",
"specialization": "${task.specialization}", "taskId": "${task.id}",
"event": "start"|"done", "detail": "<short note with the measured rates>"}.

You are also the only role that keeps ${targetProjectPath}/.pipeline/backlog.json
current for this task — after you decide pass/fail, read backlog.json,
find the task with id "${task.id}", set "attempts" to ${attempt} and
"status" to "done" if this passed (leave "todo" otherwise), and write
the file back, same as every other Tester task in this pipeline.

Return whether it passed, the measured evidence (both rates, with the
raw counts they're computed from), and — only if it did not pass — a
bug description citing the specific rate(s) outside the expected band.`
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test prompts/prompts.test.js`
Expected: the entire file loads and passes now — all three new prompt functions exist. Run the full suite to confirm nothing else broke: `node --test`.

- [ ] **Step 5: Commit**

```bash
git add prompts/mlTraining.js prompts/prompts.test.js
git commit -m "Add trainedModelVerificationPrompt with a measured, banded pass/fail criterion"
```

---

### Task 7: Designer guidance for ML-training milestones

**Files:**
- Modify: `prompts/designer.js`
- Test: `prompts/prompts.test.js`

**Interfaces:**
- Consumes: nothing new — same `designPrompt(vision, targetProjectPath, priorFeedback)` signature.
- Produces: backlog tasks (via existing `BACKLOG_SCHEMA`/`BACKLOG_TASK_SCHEMA`, now with the optional `taskKind` field from Task 1) shaped correctly for an ML-training milestone.

- [ ] **Step 1: Write the failing test**

Add to `prompts/prompts.test.js`:

```js
test('designPrompt explains taskKind for an ML-Agents training milestone, including the exact three kinds and their order', () => {
  const result = designPrompt(FIXTURE_VISION, FIXTURE_TARGET_PATH)
  assert.ok(result.includes('taskKind'))
  assert.ok(result.includes('ml-training-launch'))
  assert.ok(result.includes('ml-training-monitor'))
  assert.ok(result.includes('ml-training-integrate-verify'))
  assert.ok(result.includes('"standard"'), 'must clarify that every non-ML-training task keeps using the default')
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test prompts/prompts.test.js`
Expected: FAIL — `designPrompt`'s current output has no mention of `taskKind`/`ml-training-*`.

- [ ] **Step 3: Implement**

In `prompts/designer.js`, find the existing bullet list explaining `BACKLOG_TASK_SCHEMA` fields (the block starting with `- needsArt: true if the task needs a placeholder visual asset` per this repo's own earlier grep of this file) and add a new paragraph immediately after that field-explanation block:

```js
CRITICAL — taskKind: leave this unset (it defaults to "standard", the
normal Programmer/Artist/Tester cycle) for every task in every milestone
EXCEPT one specifically about ML-Agents training. If — and only if —
this milestone's scope is training a reinforcement-learning model (the
environment C# code itself, e.g. the Agent/Academy scripts implementing
observation/action/reward, is still a "standard" task; it's just normal
C# game code verified the normal way), author exactly these three
ADDITIONAL tasks in this order, each with the matching taskKind:
1. taskKind "ml-training-launch" — exports a standalone build and starts
   the training run in the background.
2. taskKind "ml-training-monitor" — polls the training run's convergence
   and decides when to stop it (this can take a genuinely long time;
   its successCriterion should describe reaching a definitive stop
   verdict, not a fixed duration).
3. taskKind "ml-training-integrate-verify" — assigns the resulting
   trained model and verifies its measured hunt/evasion success rates
   in real Play Mode.
These three have a real sequential dependency (launch, then monitor,
then integrate) — describe that dependency in each task's description
so it's clear to whoever reads the backlog later, even though this
pipeline's Implementation phase already runs backlog tasks through
its normal pipeline() call in array order.
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test prompts/prompts.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add prompts/designer.js prompts/prompts.test.js
git commit -m "Teach the Designer to author ml-training-* taskKind tasks for an ML-Agents milestone"
```

---

### Task 8: Route `taskKind` in the milestone-build Implementation loop

**Files:**
- Modify: `workflows/milestone-build.body.js`
- Modify: `bin/build-workflow.js`

**Interfaces:**
- Consumes: `launchTrainingPrompt`, `monitorConvergencePrompt`, `trainedModelVerificationPrompt` (Tasks 4-6), `TRAINING_MONITOR_SCHEMA` (Task 1), `TEST_RESULT_SCHEMA` (existing).
- Produces: `implementAndTestTask` now branches on `task.taskKind` before falling through to the existing standard-task logic — no change to its call site (`pipeline(design.tasks, task => implementAndTestTask(...))` stays exactly as-is).

This task has no isolated unit test of its own (the function it modifies isn't unit-testable in isolation — it's part of a generated workflow script executed only by the Workflow tool against a real agent runtime). Verification here is: the full `node --test` suite stays green, `node bin/build-workflow.js` regenerates cleanly with no errors, and a manual read-through confirms the branching logic is correct — flagged explicitly below as real-world-verification-still-needed for actual execution behavior.

- [ ] **Step 1: Add `prompts/mlTraining.js` to the concatenation list**

In `bin/build-workflow.js`, find the array/list of `prompts/*.js` files that get concatenated (look for the existing entries like `'prompts/programmer.js'`, `'prompts/tester.js'`) and add `'prompts/mlTraining.js'` to it, in the same array, anywhere after `'prompts/schemas.js'` (since it uses no schema exports directly, but keeping the ordering convention of schemas-first is consistent with the rest of the list).

- [ ] **Step 2: Add the ML-training branch to `implementAndTestTask`**

In `workflows/milestone-build.body.js`, replace the existing `implementAndTestTask` function (the one starting `async function implementAndTestTask(task, targetProjectPath, vision, reopenReason) {`) with this version, which adds an early branch for non-"standard" task kinds before the existing logic:

```js
async function implementAndTestTask(task, targetProjectPath, vision, reopenReason) {
  if (task.taskKind && task.taskKind !== 'standard') {
    return implementAndVerifyMlTrainingTask(task, targetProjectPath, vision, reopenReason)
  }

  const animationResult = task.needsAnimation ? await animateTask(task, targetProjectPath, vision) : null

  // When this task is being re-run because the Director's final review
  // reopened it (not a fresh task), seed attempt 1 with the reopen reason
  // as a priorFailure — otherwise the Fixer gets no context at all about
  // WHY it was reopened and tends to just re-verify the original,
  // already-passing successCriterion instead of addressing the real
  // complaint.
  let lastResult = reopenReason ? { passed: false, evidence: reopenReason, bug: null } : null
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

// ML-training tasks don't fit the generic Programmer/Artist/Tester
// shape: "launch" and "monitor" have no scenarioTestPrompt-style
// pass/fail cycle at all (launching a background process either
// succeeds or the task is blocked; monitoring runs until the
// deterministic script returns a terminal verdict, per
// docs/superpowers/specs/2026-09-09-ml-agents-training-design.md).
// Only "integrate-verify" has a real Tester-style retry loop, reusing
// MAX_FIX_ATTEMPTS the same way standard tasks do.
async function implementAndVerifyMlTrainingTask(task, targetProjectPath, vision, reopenReason) {
  if (task.taskKind === 'ml-training-launch') {
    await agent(launchTrainingPrompt(task, targetProjectPath, vision), {
      phase: 'Implementation',
      label: `ml-launch:${task.id}`,
    })
    return { task, status: 'done', attempts: 1, lastResult: { passed: true, evidence: 'Training launch task has no pass/fail cycle of its own — its success is implicitly verified by the monitor task actually finding a running training process.' }, animationResult: null }
  }

  if (task.taskKind === 'ml-training-monitor') {
    const firstAttempt = await agent(monitorConvergencePrompt(task, targetProjectPath, vision, 1), {
      phase: 'Implementation',
      label: `ml-monitor:${task.id}:1`,
      schema: TRAINING_MONITOR_SCHEMA,
    })
    const finalVerdict = (firstAttempt && firstAttempt.action === 'retry')
      ? await agent(monitorConvergencePrompt(task, targetProjectPath, vision, 2), {
          phase: 'Implementation',
          label: `ml-monitor:${task.id}:2`,
          schema: TRAINING_MONITOR_SCHEMA,
        })
      : firstAttempt
    const succeeded = !!(finalVerdict && finalVerdict.action === 'proceed_to_integration')
    return {
      task,
      status: succeeded ? 'done' : 'blocked',
      attempts: (firstAttempt && firstAttempt.action === 'retry') ? 2 : 1,
      lastResult: {
        passed: succeeded,
        evidence: finalVerdict ? finalVerdict.reason : 'Monitor task failed to return a result.',
        bug: succeeded ? undefined : { description: finalVerdict ? `Training did not converge usefully: ${finalVerdict.reason}` : 'Monitor agent returned no result.', reproSteps: [] },
      },
      animationResult: null,
    }
  }

  // ml-training-integrate-verify: a real Tester-style retry loop, same
  // shape as the standard-task loop above, using trainedModelVerificationPrompt
  // instead of implementPrompt+scenarioTestPrompt.
  let lastResult = reopenReason ? { passed: false, evidence: reopenReason, bug: null } : null
  for (let attempt = 1; attempt <= MAX_FIX_ATTEMPTS; attempt++) {
    lastResult = await agent(trainedModelVerificationPrompt(task, attempt, targetProjectPath, vision), {
      phase: 'Implementation',
      label: `ml-verify:${task.id}:${attempt}`,
      schema: TEST_RESULT_SCHEMA,
    })
    if (lastResult && lastResult.passed) {
      return { task, status: 'done', attempts: attempt, lastResult, animationResult: null }
    }
  }
  return { task, status: 'blocked', attempts: MAX_FIX_ATTEMPTS, lastResult, animationResult: null }
}
```

- [ ] **Step 3: Regenerate the built workflow files**

Run: `node bin/build-workflow.js`
Expected: `Generated /Users/leovalsan/Trabajo/own/auto-game-build/workflows/build-game.js`, `Generated .../fix-reopened.js`, `Generated .../milestone-build.js` — no errors.

- [ ] **Step 4: Run the full test suite**

Run: `node --test`
Expected: PASS, every test (the ~90 pre-existing ones plus every test added in Tasks 1-7 of this plan).

- [ ] **Step 5: Commit**

```bash
git add workflows/milestone-build.body.js workflows/build-game.js workflows/fix-reopened.js workflows/milestone-build.js bin/build-workflow.js
git commit -m "Route ml-training-* taskKind tasks to the new ML-Agents prompts in the milestone-build loop"
```

**Real-world verification still needed** (the most important gap this plan cannot close from this repo alone):
- Whether the Designer actually produces well-formed `ml-training-*` tasks in practice when it reaches a real ML-training milestone (this plan only proves the PROMPT contains the right instructions, not that a live Designer agent follows them correctly).
- Whether `launchTrainingPrompt`'s build-export instructions actually work against the real `funplay-unity`/`execute_code` tool surface for the World project — no build-related MCP tool has been confirmed to exist yet.
- Whether `monitorConvergencePrompt`'s long-running Bash-loop-within-one-agent-turn pattern behaves well over a genuinely multi-hour training run (context/timeout behavior for a single very long agent turn is unverified).
- The actual TensorBoard scalar tag names (Task 3's real-world-verification note) and the exact `min_step_floor`/threshold values (Task 2's note) against one real training run.
- Whether `EncounterTelemetry`'s C# implementation (a "standard"-taskKind task the Designer authors separately, using the reward function's own discrete-encounter definition from the spec) actually gets built correctly — this plan doesn't author that C# component itself, since it's ordinary game code the existing Programmer/Tester cycle already knows how to build; only the fact that `trainedModelVerificationPrompt` expects it to exist and named it consistently is this plan's responsibility.

---

## Self-Review

**Spec coverage:**
- "Placement in the pipeline" (normal milestone, same cycle) → Task 7 (Designer guidance) + Task 8 (routing inside the existing per-milestone loop, no new workflow). ✅
- "Agent lifecycle" (EndEpisode/pooling), "Observation space", "Action space", "Reward function" (including EncounterTelemetry) → these are ORDINARY C# game code, built by the existing "standard" Programmer/Tester cycle once the Designer authors a task describing them — correctly out of this plan's scope (this plan only builds the NEW pipeline capability, not every game feature the milestone eventually contains). Confirmed intentional, not a gap.
- "Training architecture" (standalone build, num-envs/resume/time_scale/no_graphics/max_steps, curriculum) → Task 4 (`launchTrainingPrompt`). ✅ (curriculum concreteness itself is explicitly still open per the spec's own "Open risks" — not something this plan can resolve without a real training run, correctly left as a prompt-level instruction rather than fabricated concrete numbers.)
- "PPO hyperparameters" table → Task 4 (`launchTrainingPrompt`'s config instructions cite the key ones: max_steps, time_scale, no_graphics, normalize; the full table's tuning is a training-time activity, not a pipeline-code task).
- "Convergence monitoring" (deterministic script + structured verdict + lesson-transition awareness) → Tasks 2, 3, 5. ✅
- "Model integration & verification" (checkpoint selection by telemetry, measured pass/fail band) → Task 6. ✅
- The unified verdict→action decision tree with bounded retry → Tasks 1 (schema), 5 (prompt), 8 (routing/attempt-counting). ✅

**Placeholder scan:** no TBD/TODO; every code block above is complete, runnable code, not sketched.

**Type consistency:** `task.taskKind` (Task 1) is read identically in Task 7 (Designer instructions), Task 8 (routing), and referenced consistently across Tasks 4-6's fixtures (`FIXTURE_ML_LAUNCH_TASK` etc., all built by spreading `FIXTURE_TASK` and overriding `taskKind`+`id`+`description`, matching the existing `FIXTURE_ANIMATED_TASK` pattern already in `prompts.test.js`). `TRAINING_MONITOR_SCHEMA`'s `verdict`/`action` enum values are used identically in Task 1's schema, Task 5's prompt text, and Task 8's routing code (`finalVerdict.action === 'proceed_to_integration'` etc.) — no drift between them.

**Scope check:** this plan is deliberately narrow — new PIPELINE capability only (prompts, schema, routing, the convergence-check tool), not the game-content tasks (Agent/Academy C# code, EncounterTelemetry) a live Designer will author using ordinary "standard" tasks once this capability exists. That split is intentional per the spec's own "Placement in the pipeline" section and keeps this plan's tasks each independently testable via `node --test` alone, which is the hard constraint this repo's own session operates under (no live Unity/MCP access to verify game-content tasks anyway).
