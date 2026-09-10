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
