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

**This verification must also cover the spawn side, not just death.**
A newly-spawned agent (via reproduction) also skips the normal
`EndEpisode()` → `OnEpisodeBegin()` cycle. If agent instances are
pooled/reused rather than freshly instantiated each time, whether
`OnEpisodeBegin()` (and any per-episode internal state an Agent
subclass might hold) fires correctly on re-enable is an open question
of the same shape and same risk level as the death-side one.
**Recommendation to sidestep this entirely**: don't pool agent
instances — always `Instantiate()` a fresh GameObject for a new agent
born via reproduction, and `Destroy()` (not disable-and-reuse) on
death. This is simpler to reason about and verify than confirming
pooled-object re-initialization semantics, at the cost of GC/allocation
overhead that a small population of 5-10 agents makes negligible here.

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

  **Exact normalization formula (do not use linear min-max here)**: use
  `tanh(log(power_other / power_self))`, not a raw or linearly-clipped
  ratio. A raw ratio is unbounded (values like 50 sitting next to other
  features scaled to [0,1]/[-1,1] would dominate early gradients
  through the shared network trunk before other features get a fair
  chance to matter), and an arbitrary clip ceiling would silently
  flatten exactly the barely-bigger-vs-overwhelmingly-bigger distinction
  this feature exists to preserve. The log-then-tanh form is naturally
  symmetric under a predator/prey role swap (ratio=1 → 0; reciprocal
  ratios map to negated values), stays bounded without clipping, and —
  most importantly — puts the actual predator/prey decision boundary
  exactly at 0, the representation most likely to let the network learn
  a clean gate on this one feature instead of a smeared, low-confidence
  region around parity.
- Direction and distance to the nearest food resource, if any is within
  perception range (same zeroed-if-absent convention).

**Fixed slots vs. `BufferSensor` — raised from "fallback" to "consider
building first".** Fixed-size zero-padded slots are a legitimate,
simpler-to-debug starting pattern, but they have a specific, checkable
failure signature worth naming precisely: a flat MLP has no structural
prior that slot 1 and slot 3 should implement the same function of
content, so it must learn that redundancy from data — and the concrete
symptom this produces is oscillating/flickering movement at
ranking-swap boundaries (when two similarly-distant agents flip which
slot they occupy step-to-step, the two slot pathways weren't trained
identically, so the policy's output can flicker even though the
underlying world state barely changed). `BufferSensor` (variable-length
entity observations, order-invariant) solves this structurally instead
of requiring the network to learn it by brute force. Given the cost of
discovering the churn problem only after a multi-hour training run
looks mediocre, treat `BufferSensor` as cheap enough to build first
rather than a fallback to revisit later — but if fixed slots are used
for a first pass anyway, add a specific diagnostic (log action variance
conditioned on ranking-swap events) so this failure mode is
distinguishable from other causes of poor convergence during
monitoring, rather than lumped into a generic "didn't converge."

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

**Memory/recurrence — deliberately not in v1.** A purely reactive
(memory-less) policy will lose track of a target that briefly exits
perception range and likely revert to foraging rather than something
like "search toward last-known heading." This is a real limitation, but
not one to solve upfront: this game's non-episodic agent lifecycle (no
`EndEpisode()`, instances destroyed/respawned independently — see Agent
lifecycle above) means a recurrent hidden state's reset-on-respawn
semantics would be another manual correctness burden of the same shape
as the EndEpisode terminal-transition risk already flagged — getting it
wrong (stale hidden state carried into a newly-spawned, unrelated agent
instance) is a subtle, silent corruption. If Tester verification later
shows hunting behavior specifically "loses track / gives up too
easily," reach for `Stacked Vectors` (2-3 frames) first — same
implementation cost as widening the observation vector, none of
recurrence's sequence-training or hidden-state-lifecycle complexity —
before escalating to an LSTM.

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
  ongoing. **Add hysteresis around the range boundary itself**, or this
  reappears at finer grain: an agent hovering exactly at the edge of a
  predator's catch range can otherwise farm repeated payouts by rapidly
  toggling in/out, each flicker counting as a new "encounter" by the
  letter of the definition above. Require either (a) the agent's
  distance to exceed the catch range by some margin (not merely `>`
  catch range) before the encounter is considered ended, (b) a minimum
  in-range dwell time before an encounter counts as having happened at
  all, or (c) a cooldown between evasion payouts for the same pair of
  agents — pick one before implementing, don't leave the boundary
  condition as a bare `>`/`<` comparison.

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
  **How this composes with the curriculum ramp matters and must be
  specified, not left implicit**: with PPO's on-policy buffer
  continuously refreshed (`buffer_size` 10,240), once the curriculum
  reaches its final, sparse-encounter target lesson, high-density
  experience from earlier lessons ages out of the buffer within a
  handful of updates — meaning the policy spends its LAST, deployment-
  determining stretch of training almost exclusively on the
  low-encounter-rate regime this design already identifies as prone to
  the degenerate forager equilibrium. A one-way ramp risks the trained
  network "forgetting" hunting/evading behavior right before it's
  frozen for deployment. Prevent this explicitly: make randomization
  ranges widen as curriculum stages progress (later-stage ranges are
  supersets of earlier ones, never fully replacing them), and/or
  permanently pin a fraction of the parallel `--num-envs` instances to
  elevated-encounter-rate configurations for the ENTIRE run, not just
  early lessons.
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
  decorrelates the batch). There's a second, independent reason
  `--num-envs` matters specifically for this game: hunting/evading
  encounters are rare events, so even with reward RATE perfectly
  balanced (per the achievability point above), any given PPO
  minibatch will contain very few encounter-derived transitions purely
  because of how infrequent encounters are — meaning gradient signal
  for hunting/evading has inherently higher variance per update than
  foraging's, independent of magnitude or achievability tuning. More
  parallel envs directly raises the odds a given batch actually
  contains encounter transitions. If wall-clock budget forces a
  tradeoff between more `--num-envs` and a longer `time_horizon`,
  favor more envs — it addresses this variance problem directly, which
  `time_horizon` alone doesn't. Bound N by available CPU cores, not an
  arbitrarily large number — verify actual core count on the training
  machine before picking a value rather than guessing.
- Use `mlagents-learn --resume --run-id=<same id>` to continue an
  interrupted training run from its last checkpoint, rather than
  restarting from scratch, if the process is killed or the machine
  restarts mid-training. This pipeline already treats resumability as
  a first-class concern elsewhere (see the milestone-build
  resumability design) — a multi-hour unattended training run needs the
  same treatment, not a silent gap.
- **Unified verdict → action decision tree** (this replaces treating
  "PLATEAU-DEGENERATE" and "ran out of budget without success" as two
  separate, disconnected cases — they're the same decision point and
  need one state machine, not two ad hoc mentions):

  | Verdict (from Convergence monitoring) | Action |
  |---|---|
  | PLATEAU | Proceed to Model integration & verification. |
  | PLATEAU-DEGENERATE | One retry, with an adjusted curriculum/reward config (see below for what "adjusted" means concretely) — not a second attempt with identical settings. |
  | DIVERGE | Same: one retry with an adjusted reward config, not merely "flagged for reconsideration" and left open-ended — the retry IS the concrete next step, using the same reopen-budget mechanism below. |
  | Hits `max_steps` while still CONTINUE (never reached PLATEAU/DIVERGE) | Treat identically to PLATEAU-DEGENERATE — training ending inconclusively is not a silent pass. |
  | Retry itself also ends in PLATEAU-DEGENERATE, DIVERGE, or inconclusive | Escalate to the Director's existing blocked-task escalation path (the same one used elsewhere in this pipeline for a task that exhausts its attempts) — do NOT retry a third time automatically. |

  **What "an adjusted curriculum/reward config" concretely means** for
  the one automatic retry (this needs to be a specific, bounded set of
  knobs the agent can adjust mechanically, not open-ended
  re-engineering): widen the curriculum's early-stage encounter-forcing
  ranges further (higher density/power-variance/scarcer food than the
  first attempt used), and/or increase the hunting/evading reward
  magnitudes relative to foraging (within the already-established
  ≤1.0-magnitude, [-1,1]-per-decision constraints). Document whichever
  specific change was made in the retry's own run-id/config so the
  Director's escalation report (if it still fails) shows what was
  already tried, not just that it failed twice.

  **Retry budget reuses this pipeline's existing pattern, not a new
  one**: cap automatic retries at 1 (mirroring the spirit of
  `MAX_MILESTONE_REOPEN_ROUNDS` used elsewhere in this pipeline for
  bounded, non-infinite retry loops) — this was previously stated only
  as "retry once" in passing; it's now the explicit, load-bearing bound
  for every non-PLATEAU verdict above, not a suggestion.

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
| max_steps | **must be set explicitly — do not leave at the mlagents-learn default of 500,000** | tens of millions (see note) | This spec's own Convergence Monitoring section states comparable ML-Agents multi-agent tasks commonly need tens of millions of steps before a PLATEAU verdict is even meaningful — the default 500,000 is two orders of magnitude short of that and would hard-exit training before the convergence script's minimum-step floor could ever fire. Research the actual step count needed for a comparable multi-agent ML-Agents example (Soccer/Tennis-scale, not a single-agent locomotion example) and set `max_steps` with comfortable headroom above the convergence script's minimum-step floor — the floor is meaningless if the trainer process exits before reaching it. |

Also specify the **Decision Requester interval** explicitly in the
implementation (how many physics/fixed-update steps pass between the
agent's decisions) — `time_horizon` is measured in decision steps, so
it only means a concrete amount of real time once this is fixed. This
spec doesn't fix a number, but the implementation plan must pick one
and state it, not leave it as whatever Unity defaults to. `summary_freq`
and `checkpoint_interval` are similarly unset here — pick these
together with the Convergence Monitoring section's rolling-window size
(N) and consecutive-check count (M) below, since those are only
meaningful once the real-time spacing between summaries is fixed, not
independently.

Also set `network_settings.normalize: false` deliberately (not by
omission) — this design already manually bounds every observation
component to [0,1]/[-1,1]/[-1,1] via explicit formulas above; ML-Agents'
own running observation normalization stacked on top of already-bounded
inputs is a known, if usually minor, source of early-training
instability, and there's no reason to pay that risk here.

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

1. **Data source — read TensorBoard event files, not console stdout.**
   ML-Agents' default scalars (Mean Reward, Std of Reward, episode
   length) appear in both the console log and TensorBoard event files,
   but custom `StatsRecorder` values (the role-balance telemetry this
   design depends on) are only reliably written to the TensorBoard
   event files (`events.out.tfevents.*`), not plain console output. A
   regex-over-stdout parser — the natural reading of an earlier draft
   of this section — would silently never see the role-balance signal
   the PLATEAU-DEGENERATE gate below depends on. Build the companion
   script (not an LLM call) around a TensorBoard event-file reader
   (e.g., Python's `tensorboard.backend.event_processing.event_accumulator`,
   or an equivalent library) reading ALL needed metrics from that one
   source — Mean Reward, Std of Reward, episode length, and the
   role-balance counters — rather than splitting sources. Event files
   flush asynchronously (not line-by-line like a log), so the script's
   polling needs to tolerate a metric not having a new data point yet
   on a given check, not treat that as a stall.
2. The script computes, over a rolling window of recent summary
   intervals: the rolling mean and standard deviation of Mean Reward,
   the trend of Std of Reward (a cheap divergence tripwire — a spiking
   Std often precedes a visible Mean Reward crash), mean episode
   length (a collapsing episode length — agents dying near-instantly —
   is often an earlier and clearer failure signal than Mean Reward
   itself), and the role-balance telemetry counters (hunt
   attempts/successes, forage/flee/engage step fractions) introduced
   above. Also segment action-output variance/entropy by power-ratio
   bucket (e.g., clearly-predator / near-parity / clearly-prey) if
   feasible — a policy that stays generically low-confidence for
   clearly-lopsided ratios (not just near true parity, where some
   blended behavior is arguably correct) is the observable symptom of
   the "smeared decision boundary" failure mode, and this reuses
   telemetry infrastructure this design is already building rather than
   requiring new instrumentation.
3. **Curriculum lesson transitions must be visible to this script, not
   silently absorbed into the rolling window.** A lesson change
   legitimately shifts the reward regime (a harder lesson causing a
   temporary dip is expected, not degeneration) — without lesson
   boundaries marked in the log stream, the DIVERGE condition (a drop
   from rolling peak) cannot tell a real collapse apart from an
   intentional difficulty increase. Tag each lesson transition in the
   telemetry stream and either reset the rolling-window baseline at
   each transition, or make the hysteresis window lesson-aware
   (require enough post-transition history before DIVERGE/PLATEAU can
   fire again).
4. The script applies explicit, numeric rules, not prose judgment:
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
5. The Claude agent consumes this script's STRUCTURED verdict
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

Once training stops, select which checkpoint to deploy using the
role-balance telemetry (hunt attempts/successes, forage/flee/engage
fractions), not simply "whichever checkpoint was saved last" — per the
curriculum/randomization risk above, the final checkpoint could
plausibly correspond to a moment where hunting/evading signal had
already started thinning out even though Mean Reward looks fine. Pick
the checkpoint whose telemetry shows the most balanced, non-degenerate
role distribution, not necessarily the highest-numbered one.

The resulting `.onnx` is copied into the Unity
project's `Assets/`, assigned to the trained agents' `Behavior
Parameters` component in Inference mode.

### Concrete, measured pass/fail criterion — not qualitative judgment

"Trained agents should visibly chase, flee, and seek food sensibly" is
exactly the kind of vague language this pipeline's own Director/Critic
rules elsewhere explicitly reject as unactionable — and for a TRAINED
model specifically, qualitative judgment is even less appropriate than
usual: imperfect behavior (a missed catch, a failed evasion) is
NORMAL and expected from a stochastic policy, not automatically a bug
the way it would be in a deterministic rule-based system. Without a
numeric bar, the Tester has no principled way to tell "a well-trained
model with normal misses" apart from "a poorly-trained model" — it
could reject a genuinely good model, or wave through a mediocre one,
on impression alone.

**Also**: the role-balance telemetry that gates training-time verdicts
(hunt attempts/successes, etc.) is measured DURING training, on a
policy that's still exploring (sampling actions, not always taking the
greedy/highest-probability action) — this is not the same thing as how
the exported `.onnx` behaves running in pure inference mode. The
deployed model's actual behavior needs its own, separate, post-hoc
measurement; training-time telemetry looking healthy does not by
itself guarantee the deployed model will.

**Concrete design — build a runtime encounter-telemetry component,
reused across both training and verification**: implement a small
MonoBehaviour (e.g. `EncounterTelemetry`) using the SAME discrete
encounter definition already established in the Reward function
section above (an encounter begins when a higher/lower-power agent
enters immediate range, with the same hysteresis margin/dwell-time/
cooldown fix already specified there, and ends when the pair separates
past that margin or the encounter resolves in a catch). This component
logs each encounter's outcome (predator caught prey / prey escaped) to
the console/activity log any time Play Mode runs — not just during
Python-side `mlagents-learn` training, where the equivalent counters
only exist as `StatsRecorder` values Python-side. Using one shared
definition for both training-time reward logic and this
verification-time counter keeps "what counts as a hunt/evasion" from
drifting into two different implementations that could disagree.

The Tester's verification pass then does this concretely, not
impressionistically:
1. Run a real Play Mode session (real simulated input if the player is
   involved, or a pure AI-vs-AI observation window otherwise) long
   enough to accumulate a minimum number of encounters — pick a
   concrete number (e.g., at least 15-20 encounters observed) rather
   than a fixed time window, since encounter rate itself varies; a
   fixed-time window could pass by accumulating too few data points to
   mean anything.
2. Read the `EncounterTelemetry` log/counters via the same
   console-log/`get_component_properties` tooling the Tester already
   uses elsewhere in this pipeline.
3. Compute the observed hunt-success rate and evasion-success rate
   separately (a predator role and a prey role are different skills;
   collapsing them into one aggregate number would hide a model that's
   only good at one).
4. **PASS requires each rate to fall within an expected band, not
   above a bare minimum and not at/near 100%**: a floor rules out "the
   trained model barely does anything coherent" (e.g., below ~30-40%
   success, tune during the first real run), and a ceiling flags
   suspicion rather than celebration (a rate at or near 100% on either
   skill is a signal to investigate — either the encounter-difficulty
   curriculum's final target configuration made that skill trivially
   easy, or something is exploiting a bug in the encounter/catch logic
   itself — not proof of a great model). Both thresholds are starting
   points to tune against the first real training run's actual
   numbers, not values to treat as correct on paper.
5. If the measured rates fall outside the expected band, this is a
   real FAIL, reported with the actual observed numbers as evidence —
   feed it back into the retry/escalation decision tree above (this
   counts toward the same 1-retry budget, it isn't a separate infinite
   loop of its own) rather than treating training-time convergence
   alone as sufficient to call this milestone done.

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
- **Curriculum concreteness**: the curriculum section names the
  mechanism (`EnvironmentParameters` ramp, completion threshold,
  superset randomization ranges) but not the exact stage count, the
  specific parameter values per stage, or which telemetry metric gates
  advancement to the next stage — this can't be directly transcribed
  into a curriculum YAML without a design decision the implementation
  plan still needs to make, not something resolvable on paper here.
- **`max_steps` and the convergence script's minimum-step floor are
  each independently unset** (both explicitly require research into a
  comparable ML-Agents multi-agent example's real step count) — treat
  picking these as one coupled decision in the implementation plan, not
  two independent guesses, since the floor is meaningless if `max_steps`
  doesn't comfortably exceed it.
- **Post-training verification success-rate band (30-40% floor,
  near-100% ceiling) is a starting guess, not a validated number** —
  same status as the convergence script's thresholds: expect to tune
  both bounds against the first real training run's actual observed
  hunt/evasion success rates, not treat the numbers in this spec as
  correct on paper. If real trained-model numbers cluster somewhere
  unexpected relative to this band, that's information to revise the
  band with, not necessarily evidence the model itself is bad.

## Sources consulted

- [Learning-Environment-Design-Agents.md (main)](https://github.com/Unity-Technologies/ml-agents/blob/main/docs/Learning-Environment-Design-Agents.md) — reward magnitude/range, observation normalization, action sizing, consistency requirements.
- [Training-Configuration-File.md (main)](https://github.com/Unity-Technologies/ml-agents/blob/main/docs/Training-Configuration-File.md) — self-play config fields and constraints, PPO hyperparameter ranges.
- Unity Blog — [Training intelligent adversaries using self-play with ML-Agents](https://blog.unity.com/engine-platform/training-intelligent-adversaries-using-self-play-with-ml-agents) — self-play's two-team/episodic assumptions.
- Predator/prey RL reward-shaping examples (search-aggregated, multiple sources) — concrete reward magnitudes and the shared-catch credit-division gotcha.
- ML-Agents GitHub issues/docs on individual agent death/respawn vs. `EndEpisode()` semantics in multi-agent environments.
- Internal expert review (subagent, senior RL/Unity ML-Agents engineer persona) of the first draft of this spec — surfaced the convergence-monitoring redesign, the reward-frequency/degenerate-equilibrium risk, the EndEpisode terminal-transition verification requirement, the time_horizon revision, the discrete-evasion-event fix, and the missing --num-envs/--resume/grace-period/escalation-path items, all incorporated above.
- Internal expert re-review (subagent, same persona) of the revised spec — surfaced the missing `max_steps` value, the TensorBoard-vs-console-log data-source ambiguity for custom telemetry, the curriculum/convergence-monitor lesson-transition disconnect, the finer-grained evasion-boundary farming exploit, and the spawn-side EndEpisode/pooling gap, all incorporated above.
- Internal expert review (subagent, senior deep-learning/training-dynamics engineer persona) of the revised spec — surfaced the missing power-ratio normalization formula (log-ratio + tanh), the one-way-curriculum forgetting risk and its fix (superset randomization ranges, pinned high-encounter envs, telemetry-based checkpoint selection), the case for prioritizing `BufferSensor` over fixed slots, the second independent reason `--num-envs` matters (encounter-transition batch scarcity), the power-ratio-bucketed entropy diagnostic, and the reasoning for deliberately deferring recurrence/memory to a later iteration, all incorporated above.
