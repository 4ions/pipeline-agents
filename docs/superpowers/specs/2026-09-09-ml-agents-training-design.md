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

**REQUIRED pre-implementation verification**: this pattern is plausible
and has real support in ML-Agents guidance, but its mechanical
consequence hasn't been confirmed against the current package version —
if an agent's GameObject is disabled/destroyed without `EndEpisode()`,
its final in-flight trajectory must be recorded as a true TERMINAL
transition (zero-continuation value target), not a bootstrapped
truncation (as if training merely paused and might continue from that
state). If disabling/destroying the component actually gets treated as
an interruption rather than a terminal state, the death-penalty
reward's value-function signal is silently diluted for the entire
training run, undermining the death/reproduction reward balance this
spec spends real effort tuning. Before writing the environment
controller: either find current-version ML-Agents source/documentation
confirming which case applies, or run a small isolated test (one agent,
forced death, inspect the recorded trajectory) and confirm the terminal
flag before building the full multi-agent version on top of the
assumption. Do not treat this as solved by the citation in Sources
below — it needs its own explicit confirmation step in the
implementation plan.

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
  coordinates, not world-absolute), and a continuous normalized
  power-RATIO relative to this agent's own power (not just a binary
  greater/lesser flag) — a binary flag discards magnitude information
  the policy genuinely needs: "barely bigger" and "much bigger" call
  for different risk calculus (a barely-bigger agent might still be
  worth fighting/fleeing differently than an overwhelmingly bigger
  one), and a continuous ratio lets that emerge from training instead
  of being flattened away.
- Direction and distance to the nearest food resource, if any is within
  perception range (same zeroed-if-absent convention).

Fixed-size zero-padded slots (the design above) are a legitimate
starting pattern, but note for awareness: ML-Agents' `BufferSensor`
(variable-length entity observations, order-invariant) is the more
purpose-built tool for "up to N nearby entities" and avoids two real
issues the fixed-slot design has — slot-reassignment churn (which
physical slot an agent occupies can flip between steps as the
nearest-4 ranking changes, adding noise the network has to learn to
ignore) and the network having no reason to treat slot order as
meaningless. Staying with fixed slots for the first implementation is
fine (simpler, more predictable to debug), but if training struggles to
converge on stable predator/prey behavior at all, revisiting the
observation encoding via `BufferSensor` should be an early hypothesis,
not a last resort.

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
- **Reward frequency/achievability, not just magnitude, must be
  balanced deliberately.** Eating food is passive and easy to trigger
  repeatedly; successfully hunting requires chasing a fleeing,
  matched-skill target and is inherently rarer. Even with a larger
  per-event magnitude for hunting than for foraging, if food is far
  easier to obtain, the expected reward RATE from pure foraging can
  still dominate — magnitude tuning alone cannot fix a rate imbalance.
  This is the concrete mechanism behind the "agent obsesses over the
  cheap frequent reward" risk named below; treat it as a
  frequency/achievability design problem (see the curriculum-learning
  mitigation under Training architecture), not something magnitude
  tuning alone resolves.
- **"Successfully evading" must be a discrete event with defined
  entry/exit, never a per-step condition.** If evasion reward could be
  paid every single step an agent merely happens to be near a threat
  without being caught, an agent can farm it indefinitely by hovering
  at the edge of a predator's catch range without doing anything that
  resembles real evasion. Define it as: an encounter begins when a
  higher-power agent enters this agent's immediate catch/threat range,
  and the evasion reward pays out once, only if the agent subsequently
  leaves that range alive — not on every step the encounter is
  ongoing.

Concrete starting shape (tune during training, not fixed in stone):
- Small positive on eating the food resource.
- Small positive on successfully catching/eating a lower-power agent
  (predator role that step) — larger than the foraging reward, though
  per the achievability point above, magnitude alone won't guarantee
  hunting gets learned; pair with the curriculum approach below.
- Small positive on successfully evading, using the discrete
  encounter-based definition above (never a per-step payout).
- Larger positive on reproducing.
- Negative on dying (starvation or eaten) — smaller in magnitude than
  the reproduction reward, so death isn't disproportionately punishing
  relative to the upside of surviving to reproduce.
- Small constant per-step penalty as above.
- A brief grace period after spawning (both for new agents and for
  agents just born via reproduction) during which the agent cannot die
  from being hunted. Without this, a large fraction of trajectories in
  early training are near-instant deaths right after spawn — very
  short, low-information, and disproportionately noisy for PPO's
  gradient updates relative to what they teach. This is a standard
  mitigation in predator/prey RL setups, not optional polish.

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

**Important nuance this doesn't solve on its own**: rejecting
`self_play` correctly rejects its team/ELO bookkeeping, but self-play
mechanisms exist to manage non-stationary co-adaptation in general, not
only two-team bookkeeping — and a single shared policy training against
copies of itself is still non-stationary in exactly that sense: as the
shared policy gets better at evading, it simultaneously gets better at
hunting (same weights on both sides of every encounter), which can
oscillate, neglect one skill while the other dominates, or — the most
likely failure mode given the reward-achievability point above —
converge to a stable "avoid all agent interaction, just forage"
equilibrium, since that's a low-variance local optimum for a shared
policy with no external pressure to specialize into predator/prey
roles. "Food Collector" is not a fully apt analogy here specifically
because it has no adversarial pairwise dynamic at all — it doesn't
validate that predator/prey behavior will actually emerge, only that
many agents CAN share one policy mechanically.

To actually counter the cold-start/degenerate-equilibrium risk, add:
- **Reward-based curriculum via ML-Agents `EnvironmentParameters`**:
  start training in a configuration that makes hunting-and-evading
  cheap to encounter — higher agent density, more power variance,
  scarcer food — and ramp toward the target ecosystem balance once a
  behavior/reward threshold is met at each stage. This directly
  counters the risk that hunting never accumulates enough training
  signal to compete with foraging from a cold start.
- **Environment parameter randomization** across episodes (population
  size, food density, spawn power distribution) for robustness — not
  optional polish, standard practice for this class of environment,
  and currently entirely absent from this design.
- **Role-balance telemetry**, fed to the training-milestone's own
  monitoring step (see Convergence monitoring below): custom
  `StatsRecorder` counters for hunt attempts vs. successes, and the
  fraction of steps spent foraging vs. fleeing vs. engaging another
  agent. Mean Reward alone cannot distinguish "coherent predator/prey
  ecosystem" from "everyone forages and ignores everyone else" — both
  can produce a similarly flat, converged-looking reward curve, so the
  monitoring step needs a signal that can actually tell them apart.
- **MA-POCA / group rewards were considered and explicitly rejected**:
  ML-Agents' other flagship multi-agent trainer targets cooperative
  group structures, which this game doesn't have (agents aren't
  working toward a shared team objective) — noted here so its absence
  from this design reads as a deliberate choice, not an oversight.
- **Optional mitigation worth flagging, not committing to yet**: the
  rule-based AI this milestone is replacing is a free source of
  demonstration data. If pure PPO training converges to a degenerate
  policy despite the curriculum above, recording demonstrations from
  the existing rule-based agent via `DemonstrationRecorder` and using
  them for behavioral-cloning pretraining (or GAIL-based reward
  shaping) is a directly-applicable next experiment — not part of the
  first implementation, but worth having in mind rather than
  rediscovering from scratch if the first training run underperforms.

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
- Run multiple parallel environment instances via `mlagents-learn
  --num-envs=<N>` — for a standalone-build approach on one machine,
  this is likely the bigger lever (more than `time_scale` alone) for
  both wall-clock speed and, just as importantly, experience diversity
  for a co-adapting population (more simultaneous independent instances
  decorrelates the batch). Bound N by available CPU cores, not an
  arbitrarily large number — verify actual core count on the training
  machine before picking a value rather than guessing.
- Use `mlagents-learn --resume --run-id=<same id>` to continue an
  interrupted training run from its last checkpoint, rather than
  restarting from scratch, if the process is killed or the machine
  restarts mid-training. This pipeline already treats resumability as
  a first-class concern elsewhere (see the milestone-build
  resumability design) — a multi-hour unattended training run needs the
  same treatment, not a silent gap.
- Define an explicit outcome for "training ran for its allotted budget
  and never produced coherent hunting/evading behavior" (per the
  role-balance telemetry above) — for a fully autonomous milestone, this
  can't be left implicit. Reasonable options: retry once with an
  adjusted curriculum/reward configuration, or escalate to the
  Director's existing blocked-task escalation path rather than silently
  accepting a degenerate policy as "done."

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
| time_horizon | 128-256 (not 64) | 32-2,048 | Should span whatever behavior sequence actually matters. Given this design rewards RESULTS (a completed catch, a completed evasion, a reproduction), not proxies, those sequences plausibly span well beyond 64 decision steps — especially since predator and prey share the same policy/skill level, making a quick catch rare. Start higher than ML-Agents' generic default given this specific reward design; treat 64 as too short here, not a safe default. |

Also specify the **Decision Requester interval** explicitly in the
implementation (how many physics/fixed-update steps pass between the
agent's decisions) — `time_horizon` is measured in decision steps, so
it only means a concrete amount of real time once this is fixed. This
spec doesn't fix a number, but the implementation plan must pick one
and state it, not leave it as whatever Unity defaults to.

## Convergence monitoring (new capability) — REVISED

The original version of this section had the Claude agent read raw
"Mean Reward: X" text lines and eyeball a trend directly. That's not a
sound decision procedure on its own: it has no floor on minimum
training time (nothing stops a premature "plateaued" verdict after only
tens of thousands of steps, when comparable ML-Agents multi-agent tasks
commonly need tens of millions), it relies on a single noisy metric
(PPO's inherent training noise, plus this game's co-adapting predator
vs. prey dynamic, means a temporary dip before a real breakthrough is
expected behavior, not a signal to stop), and Mean Reward specifically
can plateau while a co-adapting arms race is still meaningfully
progressing — an equilibrium that LOOKS converged and one that IS
converged can be indistinguishable on that one metric alone.

**Revised design**: split this into a deterministic tool plus a Claude
judgment layered on top of its output, not Claude reasoning over raw
numbers directly.

1. A companion script (not an LLM call) parses the training log on
   each check and computes, over a rolling window of recent summary
   intervals: the rolling mean and standard deviation of Mean Reward,
   the trend of Std of Reward (a cheap divergence tripwire — a spiking
   Std often precedes a visible Mean Reward crash), and mean episode
   length (a collapsing episode length — agents dying near-instantly —
   is often an earlier and clearer failure signal than Mean Reward
   itself). It also reads the role-balance telemetry counters (hunt
   attempts/successes, forage/flee/engage step fractions) introduced
   above.
2. The script applies explicit, numeric rules, not prose judgment:
   - A hard MINIMUM training-step floor before a PLATEAU verdict is
     even permitted, regardless of what the curve looks like before
     that point (the exact floor is an implementation-time decision,
     informed by how many steps a comparable ML-Agents multi-agent
     example needed — this must be looked up and set deliberately, not
     guessed).
   - PLATEAU requires a regression slope over the last N rolling-window
     points to stay below a small tolerance for M consecutive checks
     (both N and M are tuning parameters to set explicitly, not left
     implicit) — hysteresis against noise, not a single-check trigger.
   - DIVERGE is a separate, explicit numeric condition (e.g., Std of
     Reward exceeding some multiple of its own recent baseline, or Mean
     Reward dropping by more than some threshold from its rolling peak)
     — not inferred from the same slope test as PLATEAU.
   - The role-balance telemetry gates the PLATEAU verdict further: a
     flat, converged Mean Reward with near-zero hunt attempts (the
     degenerate "pure forager" equilibrium named above) must NOT report
     PLATEAU-as-success — it should report something like
     PLATEAU-DEGENERATE, distinct from a genuine converged predator/prey
     equilibrium, since these look identical on Mean Reward alone.
3. The Claude agent consumes this script's STRUCTURED verdict
   (CONTINUE / PLATEAU / PLATEAU-DEGENERATE / DIVERGE, plus the
   supporting numbers) rather than raw log text — its job is deciding
   what to DO with a verdict (proceed to integration, retry with
   adjusted curriculum, escalate), not deriving the verdict itself from
   noisy numbers.

This still reuses the Workflow tool's existing background-process +
periodic-check pattern (the same shape already used elsewhere in this
pipeline for long-running monitored work) — only the judgment step
changes, from "an LLM eyeballs a trend" to "an LLM acts on a
deterministic tool's verdict."

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

- **Reward-frequency/achievability balance and the degenerate-forager
  equilibrium**: addressed above via the curriculum/parameter-
  randomization/role-balance-telemetry additions, but still a real
  tuning risk to watch once training actually runs — the mitigations
  reduce the risk, they don't guarantee it away. Revisit reward
  weights and curriculum stages based on the role-balance telemetry
  from the first real training run, not just the reward curve.
- **Convergence judgment reliability**: improved by the revised
  deterministic-tool-plus-Claude-judgment design above, but still the
  least-proven part of this design overall — no dry run of the actual
  plateau/diverge thresholds has happened yet against a real training
  log from this specific environment. Expect to tune the exact
  minimum-step floor, slope tolerance, and consecutive-check count
  after the first real training run, not to get them right on paper.
- **EndEpisode()/terminal-transition assumption**: needs the explicit
  pre-implementation verification described under Agent lifecycle
  above before the environment controller is built on top of it — flagged
  here again because getting it wrong would silently corrupt the
  death-penalty training signal for an entire run without an obvious
  symptom pointing back to the cause.
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
- Internal expert review (subagent, senior RL/Unity ML-Agents engineer persona) of the first draft of this spec — surfaced the convergence-monitoring redesign, the reward-frequency/degenerate-equilibrium risk, the EndEpisode terminal-transition verification requirement, the time_horizon revision, the discrete-evasion-event fix, and the missing --num-envs/--resume/grace-period/escalation-path items, all incorporated above.
