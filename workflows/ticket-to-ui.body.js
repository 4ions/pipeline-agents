// workflows/ticket-to-ui.body.js
// This file is NOT run directly — Task's generator prepends the
// un-exported contents of prompts/ticketToUi.js above it, then writes the
// result to workflows/ticket-to-ui.js. Regenerate after any
// prompts/ticketToUi.js change with: node bin/build-workflow.js
//
// Spike: one ticket -> one mockup. Design Review (a Director-style pass
// over the Layout) and a Quality Gate (a Critic-style pass over the
// rendered mockup) each run bounded, small retry loops — mirroring the
// auto-game-build pipeline's own review loops (see
// prompts/ticketToUi.js header) — but there is still no per-task backlog
// or multi-round polish like that pipeline; this is one page per run.
//
// args.existingOutputDir (optional): a previous run's outputDir, to add a
// new feature onto a page this pipeline already built instead of starting
// from scratch. args.outputDir defaults to existingOutputDir when omitted
// (an in-place update); pass a different one to write the extended page
// elsewhere while still reading the original as reference.
//
// args.figmaFileUrl (optional, ignored when existingOutputDir is set):
// ground a FRESH page's palette/typefaces in a real Figma file's own
// tokens instead of an invented one. Requires the Figma MCP connector to
// be connected for this session.
//
// The local HTML/screenshot render is an intermediate artifact used for
// the Design Review / Quality Gate loop — the actual final deliverable
// is a REAL Figma file, built by the Figma Push phase (create_new_file +
// use_figma). On a fresh page it creates a new file; on an extend-run it
// reads the prior run's figmaFileUrl (persisted in layout.json) and
// updates that same file instead. args.figmaTargetFileUrl overrides which
// file to push into (useful to point a fresh run at a file that already
// exists for another reason); args.figmaPlanKey picks which Figma
// team/org to create a new file under when there's more than one and
// neither was resolvable automatically.

export const meta = {
  name: 'ticket-to-ui',
  description: 'Turn a ticket into a UI mockup — a fresh page, or a new feature added onto one this pipeline already built',
  phases: [
    { title: 'Load Existing' },
    { title: 'Figma Tokens' },
    { title: 'Intake' },
    { title: 'Layout' },
    { title: 'Design Review' },
    { title: 'Render' },
    { title: 'Quality Gate' },
    { title: 'Figma Push' },
    { title: 'Report' },
  ],
}

// One revision round for the Layout (Design Review) and one re-render
// round for the mockup (Quality Gate) — enough to catch the obvious
// misses without turning a spike into an open-ended polish loop.
const MAX_LAYOUT_REVIEW_ROUNDS = 2
const MAX_RENDER_POLISH_ROUNDS = 2

phase('Load Existing')
let existingLayout = null
if (args.existingOutputDir) {
  existingLayout = await agent(existingLayoutPrompt(args.existingOutputDir), {
    schema: UI_LAYOUT_SCHEMA,
    phase: 'Load Existing',
  })
  if (!existingLayout) {
    log(`Could not load an existing layout from ${args.existingOutputDir} — proceeding as a fresh page instead.`)
  }
}

phase('Figma Tokens')
let figmaDesignPlan = null
if (args.figmaFileUrl && !existingLayout) {
  figmaDesignPlan = await agent(figmaTokensPrompt(args.figmaFileUrl), {
    schema: DESIGN_PLAN_SCHEMA,
    phase: 'Figma Tokens',
  })
  if (!figmaDesignPlan) {
    log(`Could not read design tokens from ${args.figmaFileUrl} — falling back to an invented design plan.`)
  }
} else if (args.figmaFileUrl && existingLayout) {
  log('figmaFileUrl was given but this is an extend-run — reusing the existing page\'s own design plan for continuity instead.')
}

phase('Intake')
const intake = await agent(ticketIntakePrompt(args.ticket, existingLayout), {
  schema: TICKET_INTAKE_SCHEMA,
  phase: 'Intake',
})
if (!intake) {
  log('Failed to produce a page intake from the ticket — aborting.')
  return { existingLayout, error: 'intake_failed' }
}

phase('Layout')
let layout = await agent(uiLayoutPrompt(intake, existingLayout), {
  schema: UI_LAYOUT_SCHEMA,
  phase: 'Layout',
  label: 'layout:1',
})
if (!layout || !Array.isArray(layout.sections) || layout.sections.length === 0) {
  log('Failed to produce a section layout — aborting.')
  return { existingLayout, intake, error: 'layout_failed' }
}

phase('Design Review')
let layoutReview = null
for (let round = 1; round <= MAX_LAYOUT_REVIEW_ROUNDS; round++) {
  layoutReview = await agent(layoutReviewPrompt(intake, layout, existingLayout), {
    schema: LAYOUT_REVIEW_SCHEMA,
    phase: 'Design Review',
    label: `layout-review:${round}`,
  })
  if (!layoutReview) {
    log('Design reviewer failed to return a result — proceeding with the unreviewed layout.')
    break
  }
  if (layoutReview.approved) break
  if (round === MAX_LAYOUT_REVIEW_ROUNDS) {
    log(`Design review round ${round}: still not approved after ${MAX_LAYOUT_REVIEW_ROUNDS} round(s) — proceeding with the latest layout anyway rather than blocking indefinitely.`)
    break
  }
  log(`Design review round ${round}: sent back — ${layoutReview.feedback}`)
  const revised = await agent(uiLayoutPrompt(intake, existingLayout, layoutReview.feedback), {
    schema: UI_LAYOUT_SCHEMA,
    phase: 'Design Review',
    label: `layout:${round + 1}`,
  })
  if (!revised || !Array.isArray(revised.sections) || revised.sections.length === 0) {
    log('Revised layout failed to generate — keeping the previous version.')
    break
  }
  layout = revised
}

phase('Render')
const outputDir = args.outputDir || args.existingOutputDir
let render = await agent(
  wireframeRenderPrompt(intake, layout, outputDir, existingLayout ? args.existingOutputDir : null, figmaDesignPlan),
  { schema: RENDER_RESULT_SCHEMA, phase: 'Render', label: 'render:1' }
)
if (!render) {
  log('Failed to render the mockup — no HTML/screenshot produced.')
}

phase('Quality Gate')
let critique = null
if (render) {
  for (let round = 1; round <= MAX_RENDER_POLISH_ROUNDS; round++) {
    critique = await agent(mockupCritiquePrompt(intake, layout, render), {
      schema: MOCKUP_CRITIQUE_SCHEMA,
      phase: 'Quality Gate',
      label: `critique:${round}`,
    })
    if (!critique) {
      log('Quality Critic failed to return a result — reporting the render as unverified.')
      break
    }
    if (critique.acceptable) break
    const blocking = critique.issues.filter(i => i.severity === 'blocking')
    if (blocking.length === 0) break // only polish-level nitpicks — not worth a re-render
    if (round === MAX_RENDER_POLISH_ROUNDS) {
      log(`Quality gate round ${round}: still has blocking issue(s) after ${MAX_RENDER_POLISH_ROUNDS} round(s) — reporting as-is rather than looping forever.`)
      break
    }
    log(`Quality gate round ${round}: ${blocking.length} blocking issue(s) — re-rendering: ${blocking.map(i => i.description).join('; ')}`)
    const fixed = await agent(
      wireframeRenderPrompt(
        intake, layout, outputDir, existingLayout ? args.existingOutputDir : null, figmaDesignPlan,
        blocking.map(i => i.description).join('; ')
      ),
      { schema: RENDER_RESULT_SCHEMA, phase: 'Quality Gate', label: `render-fix:${round}` }
    )
    if (fixed) render = fixed
  }
}

phase('Figma Push')
const targetFigmaFileUrl = (existingLayout && existingLayout.figmaFileUrl) || args.figmaTargetFileUrl || null
let figmaPush = null
if (render) {
  figmaPush = await agent(
    figmaPushPrompt(intake, layout, render, outputDir, targetFigmaFileUrl, args.figmaPlanKey),
    { schema: FIGMA_PUSH_RESULT_SCHEMA, phase: 'Figma Push' }
  )
  if (!figmaPush) {
    log('Figma Push failed to return a result — the local HTML mockup is the only artifact for this run.')
  }
} else {
  log('No render to push — skipping Figma Push.')
}

phase('Report')
return { existingLayout, figmaDesignPlan, intake, layout, layoutReview, render, critique, figmaPush }
