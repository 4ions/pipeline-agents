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
