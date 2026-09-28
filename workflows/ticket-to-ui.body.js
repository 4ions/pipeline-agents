// workflows/ticket-to-ui.body.js
// This file is NOT run directly — Task's generator prepends the
// un-exported contents of prompts/ticketToUi.js above it, then writes the
// result to workflows/ticket-to-ui.js. Regenerate after any
// prompts/ticketToUi.js change with: node bin/build-workflow.js
//
// Spike: one ticket -> one wireframe, single pass, no review/critique loop
// by design (see prompts/ticketToUi.js header for why this stays isolated
// from the rest of this repo's Unity game-build pipeline).

export const meta = {
  name: 'ticket-to-ui',
  description: 'Turn a ticket description into a quick visual wireframe mockup',
  phases: [
    { title: 'Intake' },
    { title: 'Layout' },
    { title: 'Render' },
    { title: 'Report' },
  ],
}

phase('Intake')
const intake = await agent(ticketIntakePrompt(args.ticket), {
  schema: TICKET_INTAKE_SCHEMA,
  phase: 'Intake',
})
if (!intake) {
  log('Failed to produce a page intake from the ticket — aborting.')
  return { error: 'intake_failed' }
}

phase('Layout')
const layout = await agent(uiLayoutPrompt(intake), {
  schema: UI_LAYOUT_SCHEMA,
  phase: 'Layout',
})
if (!layout || !Array.isArray(layout.sections) || layout.sections.length === 0) {
  log('Failed to produce a section layout — aborting.')
  return { intake, error: 'layout_failed' }
}

phase('Render')
const render = await agent(wireframeRenderPrompt(intake, layout, args.outputDir), {
  schema: RENDER_RESULT_SCHEMA,
  phase: 'Render',
})
if (!render) {
  log('Failed to render the wireframe — no HTML/screenshot produced.')
}

phase('Report')
return { intake, layout, render }
