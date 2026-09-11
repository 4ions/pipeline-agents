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
3. If you've changed anything under `prompts/` or
   `workflows/build-game.body.js` since the last run, regenerate the
   workflow script: `node bin/build-workflow.js`.
4. In Claude Code, run the workflow:
   ```
   Workflow({
     scriptPath: "workflows/build-game.js",
     args: { gameIdea: "a short top-down puzzle game about redirecting light beams", targetProjectPath: "/path/to/your-unity-project" }
   })
   ```

## Task kinds (`taskKind`)

Every backlog task carries an optional `taskKind`. Unset (or `"standard"`)
is the normal Programmer → Artist → Tester cycle and covers virtually
every task, including ordinary C# gameplay code. The other three kinds
exist only for an ML-Agents training milestone and are authored as a
chain by the Designer: `"ml-training-launch"` (export a standalone build
and start `mlagents-learn` in the background), `"ml-training-monitor"`
(poll convergence until a terminal verdict, then stop training), and
`"ml-training-integrate-verify"` (assign the trained `.onnx` and verify
measured hunt/evasion rates in Play Mode). Standard tasks still run
concurrently; the ML chain runs strictly after them, one task at a time
in backlog order, and the rest of the chain is skipped if one is blocked.

## `tools/`

`tools/training_convergence_check.py` is the deterministic
convergence-verdict script the monitor task polls — the monitoring agent
never judges a reward curve itself, it only reads this script's
`verdict`. It is intentionally not part of this repo's own Node
dependencies: it runs under the **target Unity project's** ML-Agents
virtualenv (`<target-project>/.venv-mlagents/bin/python3`), which is
where `tensorboard` lives. Its own unit tests are plain `unittest` and
need no TensorBoard install:

```
cd tools && python3 -m unittest training_convergence_check_test -v
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

## Known Limitations

- Concurrent Tester agents each read-modify-write the whole of
  `.pipeline/backlog.json` and `.pipeline/bugs.json` (see
  `prompts/tester.js`), which can lose updates when two Testers finish
  near-simultaneously — the same lost-update hazard `activity.log.jsonl`
  solved by being append-only, not yet applied to these two files. Not
  fixed in this version.
- `finalReview.reopenTaskIds` (backlog tasks the Director flagged for
  reopening) and the full playtest's `issues` array are both returned by
  the workflow but not automatically acted on — no task is actually
  reopened or turned into a new bug from them; a human reading the final
  report is expected to decide what to do with them. (This mirrors the
  existing documented limitation about "simplify" Director decisions not
  automatically re-entering the implement loop — same category of
  "recorded but not auto-acted-on" behavior.)
