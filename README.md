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

## Resuming across sessions

Re-run the same `Workflow` call in a new session with the same
`targetProjectPath`. Because `.pipeline/backlog.json` and
`.pipeline/bugs.json` persist in the target project's own repo, a future
version of this pipeline that reads existing backlog state before writing
a new one will pick up in-progress work rather than starting over (see
"Open Items" in the spec — this initial version always starts a fresh
Vision/Design pass; incremental resume of an in-progress backlog is
follow-up work, not covered by this plan).
