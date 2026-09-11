import json
import os
import subprocess
import sys
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


class TestMaxStepsExhaustion(unittest.TestCase):
    def _trending_history(self):
        return [make_entry(step=s, mean_reward=0.1 * i, hunt_attempts=15)
                for i, s in enumerate(range(MIN_STEP_FLOOR, MIN_STEP_FLOOR + 400_000, 100_000), start=1)]

    def test_reaching_max_steps_while_still_continue_is_treated_as_plateau_degenerate(self):
        # Training ending inconclusively (no more steps left to run, but
        # the curve never converged) must NOT be a silent pass, and must
        # not leave the monitor looping forever on "continue".
        history = self._trending_history()
        result = compute_verdict(history, MIN_STEP_FLOOR, SLOPE_TOLERANCE, CONSECUTIVE_CHECKS,
                                  DIVERGE_STD_MULTIPLIER, DIVERGE_DROP_FRACTION, HUNT_ATTEMPT_FLOOR,
                                  max_steps=history[-1]["step"])
        self.assertEqual(result["verdict"], "plateau_degenerate")
        self.assertIn("max_steps", result["reason"])

    def test_below_max_steps_still_continues(self):
        history = self._trending_history()
        result = compute_verdict(history, MIN_STEP_FLOOR, SLOPE_TOLERANCE, CONSECUTIVE_CHECKS,
                                  DIVERGE_STD_MULTIPLIER, DIVERGE_DROP_FRACTION, HUNT_ATTEMPT_FLOOR,
                                  max_steps=history[-1]["step"] + 1_000_000)
        self.assertEqual(result["verdict"], "continue")


class TestMissingRoleBalanceTelemetry(unittest.TestCase):
    def test_absent_custom_tags_report_continue_not_a_false_degenerate(self):
        # Tags never written at all (e.g. a StatsRecorder tag-name
        # mismatch) must be distinguishable from a genuinely zero rate.
        history = []
        for s in range(MIN_STEP_FLOOR, MIN_STEP_FLOOR + 400_000, 100_000):
            entry = make_entry(step=s, mean_reward=0.8)
            del entry["hunt_attempts"]
            del entry["hunt_successes"]
            del entry["episodes"]
            history.append(entry)
        result = compute_verdict(history, MIN_STEP_FLOOR, SLOPE_TOLERANCE, CONSECUTIVE_CHECKS,
                                  DIVERGE_STD_MULTIPLIER, DIVERGE_DROP_FRACTION, HUNT_ATTEMPT_FLOOR)
        self.assertEqual(result["verdict"], "continue")
        self.assertIn("NOT FOUND", result["reason"])

    def test_present_but_zero_custom_tags_still_report_plateau_degenerate(self):
        history = [make_entry(step=s, mean_reward=0.8, hunt_attempts=0, hunt_successes=0, episodes=100)
                   for s in range(MIN_STEP_FLOOR, MIN_STEP_FLOOR + 400_000, 100_000)]
        result = compute_verdict(history, MIN_STEP_FLOOR, SLOPE_TOLERANCE, CONSECUTIVE_CHECKS,
                                  DIVERGE_STD_MULTIPLIER, DIVERGE_DROP_FRACTION, HUNT_ATTEMPT_FLOOR)
        self.assertEqual(result["verdict"], "plateau_degenerate")
        self.assertIn("hunt-attempt rate", result["reason"])


class TestDivergeSignals(unittest.TestCase):
    def test_diverge_on_reward_drop_when_the_peak_is_negative(self):
        # Early training under the spec's per-step time penalty routinely
        # has a negative peak reward; drop detection must still work there.
        history = (
            [make_entry(step=s, mean_reward=-0.2, hunt_attempts=15)
             for s in range(MIN_STEP_FLOOR, MIN_STEP_FLOOR + 300_000, 100_000)]
            + [make_entry(step=MIN_STEP_FLOOR + 300_000, mean_reward=-0.8, hunt_attempts=15)]
        )
        result = compute_verdict(history, MIN_STEP_FLOOR, SLOPE_TOLERANCE, CONSECUTIVE_CHECKS,
                                  DIVERGE_STD_MULTIPLIER, DIVERGE_DROP_FRACTION, HUNT_ATTEMPT_FLOOR)
        self.assertEqual(result["verdict"], "diverge")

    def test_episode_length_collapse_alongside_falling_reward_is_diverge(self):
        history = (
            [make_entry(step=s, mean_reward=1.0, episode_length=200, hunt_attempts=15)
             for s in range(MIN_STEP_FLOOR, MIN_STEP_FLOOR + 300_000, 100_000)]
            + [make_entry(step=MIN_STEP_FLOOR + 300_000, mean_reward=0.9, episode_length=40, hunt_attempts=15)]
        )
        result = compute_verdict(history, MIN_STEP_FLOOR, SLOPE_TOLERANCE, CONSECUTIVE_CHECKS,
                                  DIVERGE_STD_MULTIPLIER, DIVERGE_DROP_FRACTION, HUNT_ATTEMPT_FLOOR)
        self.assertEqual(result["verdict"], "diverge")
        self.assertIn("Episode Length", result["reason"])


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
            capture_output=True, text=True, cwd=os.path.dirname(os.path.abspath(__file__)),
        )
        self.assertEqual(result.returncode, 0, result.stderr)
        verdict = json.loads(result.stdout)
        self.assertEqual(verdict["verdict"], "continue")


if __name__ == "__main__":
    unittest.main()
