# ML-Agents Training Milestone — Design

## Goal

Add an ML-Agents reinforcement-learning training capability to the
"World" project's milestone-build roadmap, as a follow-on to the
rule-based ecosystem prototype (predator/prey by relative power,
energy/reproduction loop) built in earlier milestones. This milestone
replaces the rule-based AI agent behavior with a trained neural-network
policy, produced by an automated train → monitor → stop → integrate
cycle that a Claude agent runs end-to-end, without a human watching
TensorBoard.

## Non-goals

- Real-time/continuous learning while the player plays. The trained
  policy is fixed (inference-only) once training stops; adaptiveness to
  varied player strategy comes from training against a diverse
  population of simultaneous agents, not from learning during play.
- Cloud/remote infrastructure for running Unity. Training runs locally
  against a standalone build, same machine as the rest of the pipeline.
- Changes to Sub-project A's rule-based systems themselves — this
  milestone only adds a trained alternative behavior source; it doesn't
  redesign energy/reproduction/perception, which stay as already built.

## Placement in the pipeline

A normal milestone in World's roadmap, reached in the regular
auto-continuing milestone-build chain after the ecosystem prototype
milestones are done — not a separately, manually-invoked workflow.
Same Designer → Programmer/Artist → Tester → Quality Critic → Director
cycle as every other milestone; the training-specific steps (launch,
monitor, stop, integrate) are new task types dispatched within that
same cycle, not a parallel process.

## Environment design

### Agent lifecycle — do NOT call EndEpisode() on death

Research finding: in a multi-agent environment where individuals die
and respawn independently (not a synchronized "round" that resets for
everyone at once), calling `Agent.EndEpisode()` when an agent dies is
wrong — it immediately calls `OnEpisodeBegin()` on that agent, which
resets it right away and can desync multi-agent episode bookkeeping.
The correct pattern for our design (agent dies → removed; a new agent
spawns elsewhere via reproduction, unrelated in time) is to disable or
destroy that specific agent GameObject instance directly, without ever
calling `EndEpisode()` for it, and let a coordinating environment
controller (analogous to an `AgentManager`) own spawning new agent
instances for reproduction — episodes are not the unit of "one life,"
they're a training-time bookkeeping concept mostly orthogonal to game
death/respawn.

### Observation space

Per-agent, relative to a limited perception range (matching the
`PerceptionCone` pattern already built in a prior project — vision
radius/angle, nothing outside it is observable):

- Own power/energy (normalized to [0, 1]).
- For up to 4 nearest agents currently inside perception range (a
  starting default — adjustable during tuning, but pick one fixed
  number before implementing, since the observation vector size must
  stay constant), one fixed-size slot each (zeroed if the slot is empty
  this step):
  relative direction and distance (normalized, in agent-relative
  coordinates, not world-absolute), and whether that agent's power is
  greater or lesser than this agent's own (its predator/prey relation
  to me right now).
- Direction and distance to the nearest food resource, if any is within
  perception range (same zeroed-if-absent convention).

Research-backed rules to hold to when implementing this:
- Normalize every component to [-1, +1] or [0, 1] — `normalizedValue =
  (currentValue - minValue) / (maxValue - minValue)`, applied
  per-component (not the same as `Vector3.normalized`, which doesn't
  bound magnitude the way training needs).
- Positional information must be relative to the observing agent, not
  world-absolute coordinates.
- The observation vector passed to `VectorSensor.AddObservation()` must
  always contain the same number of elements, always in the same
  order — the empty-slot-zeroing above exists specifically to keep the
  vector size fixed even when fewer than N agents are in range.
- Include only what's relevant to the decision — no extraneous fields.

### Action space

Continuous, 2 floats: `moveX`, `moveY` — same shape as the player's own
2D movement input, interpreted as a movement direction/speed by the
agent's existing movement code (shared with the rule-based version
where possible, just swapping the decision source). Set the Continuous
Action Size to exactly 2, not larger — an oversized action space
measurably hurts training efficiency per ML-Agents' own guidance.

### Reward function

Intermediate rewards (chosen deliberately over a pure sparse
survive/reproduce-only signal, per the earlier design conversation),
tuned within these research-backed constraints:

- No single reward's magnitude should exceed 1.0, and the total reward
  granted between two consecutive decisions should stay within [-1, 1]
  — values outside that range destabilize training.
- Reward the RESULT (successfully eating, successfully evading, dying,
  reproducing), not actions that merely seem likely to lead there —
  rewarding the wrong proxy is a known way agents learn to game the
  reward instead of the intended behavior.
- Favor positive rewards over negative/punitive ones where there's a
  choice — heavy negative-reward emphasis can suppress an agent from
  learning any coherent behavior at all, per ML-Agents' own guidance.
- A small per-step time penalty (on the order of -0.001, per common
  predator/prey RL examples) is reasonable to discourage stalling, but
  should stay small relative to the event-based rewards below.
- If more than one predator agent could plausibly share credit for the
  same catch (e.g., two agents converge on the same prey in the same
  step), divide that reward among them (reward / n) rather than paying
  it out in full to each — otherwise the reward function inflates for
  free by clustering, which isn't the intended behavior.

Concrete starting shape (tune during training, not fixed in stone):
- Small positive on eating the food resource.
- Small positive on successfully catching/eating a lower-power agent
  (predator role that step).
- Small positive on successfully evading (surviving an encounter with a
  higher-power agent that was in catching range).
- Larger positive on reproducing.
- Negative on dying (starvation or eaten) — smaller in magnitude than
  the reproduction reward, so death isn't disproportionately punishing
  relative to the upside of surviving to reproduce.
- Small constant per-step penalty as above.

## Training architecture

### Shared single policy, not formal self-play

Earlier in this design's discussion, self-play (ML-Agents' `self_play`
trainer block, with Team Id/ELO) was assumed to be the mechanism for
"trains against varied strategies without live learning." Research
during spec-writing found this doesn't actually fit this game's shape:
ML-Agents' self-play is built around exactly two competing teams in
episodic matches with a terminal win/loss/draw signal for ELO — it
explicitly recommends keeping reward shaping minimal specifically
because of how it feeds the ELO calculation. Our game has no fixed
teams (predator/prey is a per-interaction relative-power outcome, not a
team assignment) and no natural "episode ends, someone won" structure —
it's a continuous, open-ended simulation.

The design that actually fits — and is simpler to build — is the
pattern from Unity's own "Food Collector" example: every agent (5-10 of
them) shares ONE Behavior Name / policy, all acting simultaneously in
the same environment. Population diversity of experience (sometimes
being the bigger agent in an encounter, sometimes the smaller one)
emerges naturally from having many agents with varied power values
interacting in one environment, without any formal self-play/Team Id
machinery. No `self_play` config block is needed.

### Execution

- Export a standalone build of the World scene (not the live Editor —
  training needs native simulation speed with no MCP/agent round-trip
  per step, and sidesteps the OS-focus contention issue entirely, since
  a standalone build run via `mlagents-learn` doesn't need real window
  focus the way live Editor Play Mode apparently does in this
  environment).
- Launch `mlagents-learn <trainer-config>.yaml --env=<build path>
  --run-id=<id> --no-graphics` (or with graphics if headless rendering
  turns out to matter for this 2D scene — start with `--no-graphics`
  since nothing about this game needs visual rendering during training)
  as a background process, output redirected to a log file.
- Speed up wall-clock training time: `mlagents-learn` already runs the
  environment at an accelerated `Time.timeScale` by default via
  `engine_settings.time_scale` in the trainer config (default 20x real
  speed) — nobody watches training happen, so there's no reason to run
  at 1x. Set `no_graphics: true` in the same `engine_settings` block
  (equivalent to the `--no-graphics` CLI flag) to skip rendering
  entirely, and consider raising `time_scale` further than the default
  20 for this specific game — it's a simple 2D scene with lightweight
  physics, not something that needs tight real-time coupling to
  simulate correctly at higher multiples. Explicitly set these rather
  than relying on defaults, so a future config change elsewhere doesn't
  silently slow training back down.

### PPO hyperparameters — starting point

(All from current ML-Agents documentation; treat as a starting
configuration to tune against observed training behavior, not fixed
values.)

| Parameter | Starting value | Valid range | Notes |
|---|---|---|---|
| batch_size | ~1024 (continuous-action default range) | 512-5,120 (continuous) | Must be several times smaller than buffer_size. |
| buffer_size | 10,240 | 2,048-409,600 | Several times larger than batch_size. |
| learning_rate | 3e-4 | 1e-5-1e-3 | Lower if training looks unstable. |
| beta (entropy) | 5.0e-3 | 1e-4-1e-2 | Raise if entropy collapses too fast; lower if it doesn't shrink at all. |
| epsilon | 0.2 | 0.1-0.3 | Lower = more stable but slower. |
| num_epoch | 3 | 3-10 | More epochs OK with a bigger batch size. |
| time_horizon | 64 | 32-2,048 | Should span whatever behavior sequence actually matters (an encounter, not just one step). |

## Convergence monitoring (new capability)

A Claude agent — not a human watching TensorBoard — tails the plain-text
console output `mlagents-learn` already produces at each summary
interval (it periodically prints a "Mean Reward: X" line; no need to
parse the binary TensorBoard event files or take screenshots of a UI).
The agent reviews the trend across recent summary intervals and decides:

- Still trending upward → keep waiting, check again later.
- Plateaued for several consecutive summary intervals → send an
  interrupt to the `mlagents-learn` process (graceful stop, which
  triggers ML-Agents to save the final checkpoint and export the
  `.onnx` model) and proceed to integration.
- Reward collapsing/diverging → stop and flag for reward-function
  reconsideration rather than proceeding to integration with a broken
  policy.

This reuses the Workflow tool's existing background-process +
periodic-check pattern (the same shape already used elsewhere in this
pipeline for long-running monitored work), applied to a numeric reward
trend instead of a pass/fail test result.

## Model integration & verification

Once training stops, the resulting `.onnx` is copied into the Unity
project's `Assets/`, assigned to the trained agents' `Behavior
Parameters` component in Inference mode. The existing Tester/Critic
roles then verify it with the SAME rigor already established elsewhere
in this pipeline (real Play Mode, real simulated input, not just
"component looks configured") — trained agents should visibly chase,
flee, and seek food sensibly when actually played against, not just
"the model loaded without errors."

## Open risks

- **Reward-shaping balance**: multiple intermediate rewards (eat, hunt,
  evade, reproduce, die, per-step) risk the agent "obsessing" over one
  cheap, frequent reward (e.g., eating food) over the intended
  higher-value behavior (successfully hunting or evading) if weights
  aren't tuned carefully — this was flagged as a real tradeoff when the
  intermediate-rewards approach was chosen over a pure sparse
  survive/reproduce signal, and remains a tuning risk to watch for once
  training actually runs, not something resolved by this spec alone.
- **Convergence judgment reliability**: an agent deciding "this plateaued,
  stop" from a text log is the least-proven part of this design — a
  wrong call wastes real training time (stopping too early) or wastes
  compute (running well past convergence). No dry run of this specific
  judgment has happened yet; expect to revisit the plateau-detection
  heuristic after the first real training run.
- **Standalone build export step** is new to this pipeline (every other
  milestone has worked against the live Editor) — the exact MCP/build
  tooling to trigger a build export headlessly hasn't been verified
  against this project's actual MCP tool surface yet.

## Sources consulted

- [Learning-Environment-Design-Agents.md (main)](https://github.com/Unity-Technologies/ml-agents/blob/main/docs/Learning-Environment-Design-Agents.md) — reward magnitude/range, observation normalization, action sizing, consistency requirements.
- [Training-Configuration-File.md (main)](https://github.com/Unity-Technologies/ml-agents/blob/main/docs/Training-Configuration-File.md) — self-play config fields and constraints, PPO hyperparameter ranges.
- Unity Blog — [Training intelligent adversaries using self-play with ML-Agents](https://blog.unity.com/engine-platform/training-intelligent-adversaries-using-self-play-with-ml-agents) — self-play's two-team/episodic assumptions.
- Predator/prey RL reward-shaping examples (search-aggregated, multiple sources) — concrete reward magnitudes and the shared-catch credit-division gotcha.
- ML-Agents GitHub issues/docs on individual agent death/respawn vs. `EndEpisode()` semantics in multi-agent environments.
