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
    max_steps: int | None = None,
) -> dict:
    """Return {"verdict": "continue"|"plateau"|"plateau_degenerate"|"diverge", "reason": str}.

    `history` is ordered oldest-to-newest. Each entry may carry
    `lesson_transition: True` to mark a curriculum-stage change — the
    window used for DIVERGE/PLATEAU checks never spans across a
    transition, so a legitimate difficulty-driven dip is never
    mistaken for reward collapse or a real plateau.

    `max_steps` is the trainer config's own step ceiling for this run (as
    recorded by the launch task). A run that reaches its ceiling while the
    curve-shape logic would still say "continue" has ended inconclusively
    — per the spec's decision tree that is treated exactly like
    "plateau_degenerate" (a bounded retry / escalation), never a silent
    pass and never an endless monitoring loop.
    """
    result = _compute_curve_verdict(
        history,
        min_step_floor,
        slope_tolerance,
        consecutive_checks,
        diverge_std_multiplier,
        diverge_drop_fraction,
        hunt_attempt_floor,
    )
    if (
        max_steps is not None
        and result["verdict"] == "continue"
        and history
        and history[-1]["step"] >= max_steps
    ):
        return {
            "verdict": "plateau_degenerate",
            "reason": (
                f"Training reached its max_steps ceiling ({history[-1]['step']} >= {max_steps}) "
                f"without converging normally — no further training progress is possible, so this "
                f"inconclusive ending is treated as plateau_degenerate. Underlying check at the "
                f"ceiling: {result['reason']}"
            ),
        }
    return result


def _compute_curve_verdict(
    history: list[dict],
    min_step_floor: int,
    slope_tolerance: float,
    consecutive_checks: int,
    diverge_std_multiplier: float,
    diverge_drop_fraction: float,
    hunt_attempt_floor: float,
) -> dict:
    """The pure curve-shape logic, with no notion of the run's step
    ceiling — compute_verdict() wraps this with the max_steps-exhaustion
    rule."""
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
    # Absolute-magnitude form, deliberately NOT `latest < peak * (1 - f)`:
    # with this design's per-step time penalty the window's peak reward is
    # routinely negative early in training, and the multiplicative form
    # silently disables drop-based divergence detection for any negative
    # peak (it inverts the comparison).
    latest_reward = recent[-1]["mean_reward"]
    if abs(peak_reward) > 0 and (peak_reward - latest_reward) > abs(peak_reward) * diverge_drop_fraction:
        return {
            "verdict": "diverge",
            "reason": f"Mean Reward {latest_reward:.3f} dropped more than {diverge_drop_fraction * 100:.0f}% of |rolling peak| from its rolling peak {peak_reward:.3f}.",
        }

    # Episode length collapsing alongside a declining reward is often an
    # earlier and clearer failure signal than mean reward alone (agents
    # dying/ending episodes almost immediately), so it reinforces — but
    # never by itself creates — a diverge verdict.
    ep_lengths = [e.get("episode_length", 0.0) for e in window]
    peak_episode_length = max(ep_lengths)
    if (
        peak_episode_length > 0
        and ep_lengths[-1] < peak_episode_length * (1 - diverge_drop_fraction)
        and latest_reward < peak_reward
    ):
        return {
            "verdict": "diverge",
            "reason": f"Episode Length collapsed to {ep_lengths[-1]:.1f} from its rolling peak {peak_episode_length:.1f} (more than {diverge_drop_fraction * 100:.0f}% down) while Mean Reward ({latest_reward:.3f}) also sits below its peak ({peak_reward:.3f}).",
        }

    # PLATEAU (or PLATEAU-DEGENERATE): slope over the last N points must
    # stay below tolerance for those N consecutive checks.
    slope = _rolling_slope(rewards)
    if abs(slope) > slope_tolerance:
        return {
            "verdict": "continue",
            "reason": f"Mean Reward slope {slope:.5f} still exceeds tolerance {slope_tolerance} over the last {consecutive_checks} checks — still trending, not plateaued.",
        }

    # "The custom StatsRecorder tags were never written at all" is NOT the
    # same as "they were written and are genuinely zero". The former means
    # the role-balance gate simply cannot be evaluated yet (most likely a
    # tag-name mismatch between this script and the C# StatsRecorder code,
    # which is written by a separate task) — reporting plateau_degenerate
    # there would be a false negative indistinguishable from a real
    # pure-forager collapse. read_tensorboard_history() omits these keys
    # entirely when the tags are absent from the event files.
    telemetry_present = any(("hunt_attempts" in e) or ("episodes" in e) for e in recent)
    if not telemetry_present:
        return {
            "verdict": "continue",
            "reason": f"Mean Reward plateaued (slope {slope:.5f}) but the role-balance telemetry tags (hunt attempts / episodes) were NOT FOUND in the TensorBoard event data at all — the PLATEAU/degenerate gate cannot be evaluated yet. Check that the C# StatsRecorder tag names match the ones this script reads (Custom/HuntAttempts, Custom/Episodes) before trusting any plateau verdict.",
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
    std_reward = series("Environment/Cumulative Reward Std")
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
        }
        # Only populate the custom role-balance fields when their tags
        # actually exist in the event data — compute_verdict() treats a
        # MISSING key ("never written") differently from a present-but-zero
        # value ("written, and genuinely zero"), so defaulting these to 0
        # here would erase exactly the distinction it needs.
        if hunt_attempts:
            entry["hunt_attempts"] = hunt_attempts.get(step, 0)
        if hunt_successes:
            entry["hunt_successes"] = hunt_successes.get(step, 0)
        if episodes:
            entry["episodes"] = episodes.get(step, 0)
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
    parser.add_argument(
        "--max-steps",
        type=int,
        default=None,
        help="This run's trainer-config max_steps ceiling (from the launch task's run-info json). "
             "Reaching it while the verdict would still be 'continue' reports 'plateau_degenerate' "
             "instead, so an exhausted run never loops the monitor forever nor passes silently.",
    )
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
        args.max_steps,
    )
    print(json_module.dumps(result))


if __name__ == "__main__":
    main()
