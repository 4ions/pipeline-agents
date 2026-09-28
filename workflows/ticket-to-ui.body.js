// workflows/ticket-to-ui.body.js
// This file is NOT run directly — Task's generator prepends the
// un-exported contents of prompts/ticketToUi.js above it, then writes the
// result to workflows/ticket-to-ui.js. Regenerate after any
// prompts/ticketToUi.js change with: node bin/build-workflow.js
//
// Spike: one ticket -> one mockup, single pass, no review/critique loop by
// design (see prompts/ticketToUi.js header for why this stays isolated
// from the rest of this repo's Unity game-build pipeline).
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

export const meta = {
  name: 'ticket-to-ui',
  description: 'Turn a ticket into a UI mockup — a fresh page, or a new feature added onto one this pipeline already built',
  phases: [
    { title: 'Load Existing' },
    { title: 'Figma Tokens' },
    { title: 'Intake' },
    { title: 'Layout' },
    { title: 'Render' },
    { title: 'Report' },
  ],
}

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
const layout = await agent(uiLayoutPrompt(intake, existingLayout), {
  schema: UI_LAYOUT_SCHEMA,
  phase: 'Layout',
})
if (!layout || !Array.isArray(layout.sections) || layout.sections.length === 0) {
  log('Failed to produce a section layout — aborting.')
  return { existingLayout, intake, error: 'layout_failed' }
}

phase('Render')
const outputDir = args.outputDir || args.existingOutputDir
const render = await agent(
  wireframeRenderPrompt(intake, layout, outputDir, existingLayout ? args.existingOutputDir : null, figmaDesignPlan),
  { schema: RENDER_RESULT_SCHEMA, phase: 'Render' }
)
if (!render) {
  log('Failed to render the mockup — no HTML/screenshot produced.')
}

phase('Report')
return { existingLayout, figmaDesignPlan, intake, layout, render }
