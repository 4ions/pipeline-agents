// workflows/ticket-to-ui.body.js
// This file is NOT run directly — Task's generator prepends the
// un-exported contents of prompts/ticketToUi.js above it, then writes the
// result to workflows/ticket-to-ui.js. Regenerate after any
// prompts/ticketToUi.js change with: node bin/build-workflow.js
//
// Spike: one ticket -> one real Figma file. NO HTML mockup and NO local
// screenshot anywhere in this pipeline — Figma is the only output.
// Design Review (a Director-style pass over the Layout) and a Quality
// Gate (a Critic-style pass over the pushed Figma frame, with a bounded
// fix-in-place retry) mirror the auto-game-build pipeline's own review
// loops (see prompts/ticketToUi.js header), adapted to a single page per
// run rather than a multi-task backlog.
//
// args.existingOutputDir (optional): a previous run's outputDir, to add a
// new feature onto a page this pipeline already built instead of starting
// from scratch. args.outputDir defaults to existingOutputDir when omitted.
// outputDir holds only layout.json (sections, design plan, and the real
// Figma file URL) — bookkeeping so an extend-run finds the same Figma
// file/frame to update, not a rendered artifact itself.
//
// args.figmaFileUrl (optional, ignored when existingOutputDir is set):
// ground a FRESH page's palette/typefaces in a real Figma file's own
// tokens instead of an invented one.
//
// args.figmaSystemFileUrl (optional): this pipeline's own persistent
// design-system catalog (colors, typefaces, reusable component patterns)
// that EVERY page — not just one — is grounded in and contributes back
// to, so unrelated pages built on different runs still look like one
// product family. Takes precedence over figmaFileUrl for grounding a
// fresh page, and is passed to every Figma Push call (initial and
// fix-in-place) so it's consulted before inventing anything and grown
// when a page needs a genuinely new pattern. There is no auto-bootstrap:
// create this file once (a normal Figma Push run, or by hand) and pass
// its URL on every subsequent run to keep pages consistent.
//
// args.figmaTargetFileUrl (optional): push a fresh run into a specific
// existing Figma file instead of creating a new one.
// args.figmaPlanKey (optional): which Figma team/org to create a new file
// under, when the account has more than one plan.

export const meta = {
  name: 'ticket-to-ui',
  description: 'Turn a ticket into a real Figma page — a fresh file, or a new feature added onto one this pipeline already built',
  phases: [
    { title: 'Load Existing' },
    { title: 'Figma Tokens' },
    { title: 'Intake' },
    { title: 'Layout' },
    { title: 'Design Review' },
    { title: 'Figma Push' },
    { title: 'Quality Gate' },
    { title: 'Report' },
  ],
}

// One revision round for the Layout (Design Review) and one fix-in-place
// round for the Figma frame (Quality Gate) — enough to catch the obvious
// misses without turning a spike into an open-ended polish loop.
const MAX_LAYOUT_REVIEW_ROUNDS = 2
const MAX_FIGMA_POLISH_ROUNDS = 2

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
const tokensSourceUrl = args.figmaSystemFileUrl || args.figmaFileUrl || null
if (tokensSourceUrl && !existingLayout) {
  figmaDesignPlan = await agent(figmaTokensPrompt(tokensSourceUrl), {
    schema: DESIGN_PLAN_SCHEMA,
    phase: 'Figma Tokens',
  })
  if (!figmaDesignPlan) {
    log(`Could not read design tokens from ${tokensSourceUrl} — falling back to an invented design plan.`)
  } else if (args.figmaSystemFileUrl) {
    log(`Grounded this fresh page in the shared design-system catalog at ${args.figmaSystemFileUrl}.`)
  }
} else if (tokensSourceUrl && existingLayout) {
  log('figmaFileUrl/figmaSystemFileUrl was given but this is an extend-run — reusing the existing page\'s own design plan for continuity instead.')
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
if (figmaDesignPlan && !layout.designPlan) layout.designPlan = figmaDesignPlan

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
  if (figmaDesignPlan && !layout.designPlan) layout.designPlan = figmaDesignPlan
}

phase('Figma Push')
const outputDir = args.outputDir || args.existingOutputDir
const targetFigmaFileUrl = (existingLayout && existingLayout.figmaFileUrl) || args.figmaTargetFileUrl || null
let figmaPush = await agent(
  figmaPushPrompt(intake, layout, outputDir, targetFigmaFileUrl, args.figmaPlanKey, undefined, args.figmaSystemFileUrl),
  { schema: FIGMA_PUSH_RESULT_SCHEMA, phase: 'Figma Push', label: 'figma-push:1' }
)
if (!figmaPush) {
  log('Figma Push failed to return a result — no Figma output produced for this run.')
}

phase('Quality Gate')
let critique = null
if (figmaPush) {
  for (let round = 1; round <= MAX_FIGMA_POLISH_ROUNDS; round++) {
    critique = await agent(figmaCritiquePrompt(intake, layout, figmaPush), {
      schema: MOCKUP_CRITIQUE_SCHEMA,
      phase: 'Quality Gate',
      label: `critique:${round}`,
    })
    if (!critique) {
      log('Quality Critic failed to return a result — reporting the Figma push as unverified.')
      break
    }
    if (critique.acceptable) break
    const blocking = critique.issues.filter(i => i.severity === 'blocking')
    if (blocking.length === 0) break // only polish-level nitpicks — not worth a fix-in-place edit
    if (round === MAX_FIGMA_POLISH_ROUNDS) {
      log(`Quality gate round ${round}: still has blocking issue(s) after ${MAX_FIGMA_POLISH_ROUNDS} round(s) — reporting as-is rather than looping forever.`)
      break
    }
    log(`Quality gate round ${round}: ${blocking.length} blocking issue(s) — fixing in place: ${blocking.map(i => i.description).join('; ')}`)
    const fixed = await agent(
      figmaPushPrompt(intake, layout, outputDir, figmaPush.figmaFileUrl, args.figmaPlanKey, blocking.map(i => i.description).join('; '), args.figmaSystemFileUrl),
      { schema: FIGMA_PUSH_RESULT_SCHEMA, phase: 'Quality Gate', label: `figma-fix:${round}` }
    )
    if (fixed) figmaPush = fixed
  }
}

phase('Report')
return { existingLayout, figmaDesignPlan, intake, layout, layoutReview, figmaPush, critique }
