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

## Ticket → Figma page (spike)

`workflows/ticket-to-ui.js` reuses this repo's agentic pattern (`Workflow`
+ `agent()` + JSON schema + `phase()`) for a different domain: given a raw
ticket description, produce a REAL Figma file — the page's only output.
There is no HTML mockup or local screenshot anywhere in this pipeline; it
shares no code or Unity dependency with the rest of this repo either —
see `prompts/ticketToUi.js` for its (self-contained) prompts/schemas.

Phases: Load Existing → Figma Tokens → Intake → Layout → **Design
Review** → **Figma Push** → **Quality Gate** → Report. Design Review is a
Director-style pass over the Layout (checks it covers every `keyContent`
item, catches invented scope, and — on an extend-run — that no existing
section got silently dropped) before anything gets built in Figma. Figma
Push then creates the file (a fresh page) or updates it in place (an
extend-run, via the `figmaFileUrl` persisted in `layout.json` from the
prior run) using the Figma MCP connector's write tools (`create_new_file`,
`use_figma`) — real editable auto-layout frames/text/fills, never a
flattened screenshot pasted in. Quality Gate is a Critic-style pass that
inspects the pushed Figma frame itself (`get_screenshot` + `get_metadata`)
and triggers one bounded fix-in-place edit if it finds a blocking issue
(each loop capped at 2 rounds) — same shape as `auto-game-build`'s own
Design Review / Quality Critic loops, just without a multi-task backlog
or 5-round polish budget, since this is one page per run.

```
Workflow({
  scriptPath: "workflows/ticket-to-ui.js",
  args: { ticket: "As a user I want a page listing my recent orders...", outputDir: "/tmp/ticket-to-ui-demo" }
})
```

Each Figma Push writes `<outputDir>/layout.json` — the section layout,
the design plan (palette/typefaces), and the real Figma file URL it
pushed to. `outputDir` holds only this bookkeeping JSON, not a rendered
artifact. Pass `existingOutputDir` (pointing at a prior run's
`outputDir`) to add a new feature onto a page this pipeline already
built instead of starting over: it loads that `layout.json`, asks only
what the new ticket adds or changes, and updates the SAME Figma file in
place so the extended page stays visually consistent. Omit `outputDir`
in that case, or set it to write `layout.json` elsewhere while still
reading the original as reference:

```
Workflow({
  scriptPath: "workflows/ticket-to-ui.js",
  args: { ticket: "Also let me search my past orders by date range", existingOutputDir: "/tmp/ticket-to-ui-demo" }
})
```

Pass `figmaFileUrl` (a Figma file/frame URL) on a **fresh** page (ignored
on an extend-run, where the prior page's own design plan wins for
continuity) to ground its palette/typefaces in that file's real
tokens instead of an invented one:

```
Workflow({
  scriptPath: "workflows/ticket-to-ui.js",
  args: { ticket: "...", outputDir: "/tmp/ticket-to-ui-demo", figmaFileUrl: "https://www.figma.com/design/..." }
})
```

This (grounding in an existing file's tokens) requires the Figma MCP
connector connected for the session and only *reads* Figma
(`get_variable_defs`, `get_design_context`, `get_screenshot`) — separate
from the Figma Push phase below, which *writes*.

**Shared design-system catalog.** Left on its own, each fresh page
invents its own unrelated palette — an orders page and a wishlist page
end up looking like different products. Pass `figmaSystemFileUrl`
pointing at one persistent Figma file this pipeline treats as its own
catalog (colors, typefaces, reusable component patterns): every fresh
page is grounded in it (taking precedence over `figmaFileUrl`) instead of
inventing its own, and the Figma Push phase both reuses what's already
there and *adds* anything the page genuinely needs that isn't yet
catalogued — so the catalog grows across runs instead of drifting.
There's no auto-bootstrap: create this file once (any Figma Push run
creates a real file you can point at, or build one by hand) and reuse
its URL on every later run:

```
Workflow({
  scriptPath: "workflows/ticket-to-ui.js",
  args: { ticket: "...", outputDir: "/tmp/ticket-to-ui-demo", figmaSystemFileUrl: "https://www.figma.com/design/<fileKey>/Design-System" }
})
```

Pass `figmaTargetFileUrl` to push into a specific existing Figma file on
a **fresh** run (instead of creating a new one), and `figmaPlanKey` (a
Figma team/org key, e.g. `"team::1234567890"`) if the account has more
than one plan and it isn't resolvable automatically:

```
Workflow({
  scriptPath: "workflows/ticket-to-ui.js",
  args: { ticket: "...", outputDir: "/tmp/ticket-to-ui-demo", figmaTargetFileUrl: "https://www.figma.com/design/<fileKey>/..." }
})
```

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
# pipeline-agents
