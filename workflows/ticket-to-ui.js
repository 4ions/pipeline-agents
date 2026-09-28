// GENERATED FILE — do not edit directly.
// Source: ticketToUi.js + ticket-to-ui.body.js
// Regenerate with: node bin/build-workflow.js

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

// Spike: reuses this repo's agentic pattern (Workflow + agent() + schema +
// phase()) for a different domain than the rest of this pipeline — turning
// a ticket description into a UI mockup, NOT a Unity game task.
// Deliberately self-contained (its own schemas, no dependency on
// prompts/schemas.js or any of the Unity-specific prompt files) so this
// spike stays isolated from the game-build pipeline it borrows the pattern
// from.
//
// Two modes, same pipeline: a fresh page (no existingOutputDir arg) or a
// new feature added onto a page this pipeline already built
// (existingOutputDir points at that earlier run's output folder). Each
// render writes layout.json next to the HTML/screenshot specifically so a
// LATER run can load it back and extend the same page consistently
// instead of re-designing it from scratch.
//
// Optional args.figmaFileUrl grounds a FRESH page's design plan in a real
// Figma file's own tokens/typefaces instead of an invented palette — via
// the Figma MCP connector's read-only tools (get_variable_defs /
// get_design_context / get_screenshot; there is no write/create-in-Figma
// tool, so this is one-directional: Figma -> mockup, never the reverse).
// Ignored when existingOutputDir is set — an extend-run's own prior
// design plan wins, for visual continuity with the page it's adding onto.
// Scope is still intentionally minimal — no review/critique loop.

const TICKET_INTAKE_SCHEMA = {
  type: 'object',
  required: ['pageGoal', 'keyContent', 'priorities'],
  properties: {
    pageGoal: { type: 'string', description: 'What this page is and who it is for, 1-2 sentences' },
    keyContent: { type: 'array', items: { type: 'string' }, description: 'Concrete pieces of content/functionality the ticket calls for' },
    priorities: { type: 'array', items: { type: 'string' }, description: 'Ordered list of what matters most if trade-offs are needed' },
  },
}

const UI_SECTION_SCHEMA = {
  type: 'object',
  required: ['id', 'type', 'heading', 'description', 'order'],
  properties: {
    id: { type: 'string' },
    type: { type: 'string', enum: ['nav', 'hero', 'form', 'list', 'card-grid', 'table', 'sidebar', 'cta', 'text', 'footer', 'custom'] },
    heading: { type: 'string' },
    description: { type: 'string', description: 'What this section contains, concrete enough to build directly from this text alone' },
    order: { type: 'number', description: 'Top-to-bottom position on the page, 0-based' },
    status: {
      type: 'string',
      enum: ['new', 'modified', 'unchanged'],
      description: 'Only meaningful when extending an existing page (omit/ignore for a fresh page — treat everything as "new"). "unchanged" = keep this existing section byte-for-byte. "modified" = existing section, description changed by this ticket. "new" = this ticket added it.',
    },
  },
}

const DESIGN_PLAN_SCHEMA = {
  type: 'object',
  required: ['colors', 'typefaces', 'layoutConcept'],
  properties: {
    colors: { type: 'array', items: { type: 'string' }, description: '4-6 named hex tokens, each as "name #hexvalue" (e.g. "ink #1c1f24"), grounded in this page\'s specific subject — not a generic default palette' },
    typefaces: { type: 'array', items: { type: 'string' }, description: 'Each as "role: Font Family" (e.g. "display: Fraunces", "body: Source Sans 3"), loaded from Google Fonts' },
    layoutConcept: { type: 'string', description: 'The layout concept in one or two sentences' },
  },
}

const UI_LAYOUT_SCHEMA = {
  type: 'object',
  required: ['pageTitle', 'layoutNotes', 'sections'],
  properties: {
    pageTitle: { type: 'string' },
    layoutNotes: { type: 'string', description: 'Overall layout approach, e.g. "single column" or "sidebar + main content"' },
    sections: { type: 'array', items: UI_SECTION_SCHEMA },
    designPlan: { ...DESIGN_PLAN_SCHEMA, description: 'Only present once a Render step has run at least once for this page — carried forward so a later extend-run reuses the same palette/type instead of inventing a new one' },
  },
}

const RENDER_RESULT_SCHEMA = {
  type: 'object',
  required: ['htmlPath', 'screenshotPath', 'designPlan', 'notes'],
  properties: {
    htmlPath: { type: 'string', description: 'Path to the written HTML/CSS mockup file' },
    screenshotPath: { type: 'string', description: 'Path to the PNG screenshot of that HTML file' },
    designPlan: DESIGN_PLAN_SCHEMA,
    notes: { type: 'string', description: 'Anything worth flagging about the render, e.g. sections simplified or skipped' },
  },
}

function figmaTokensPrompt(figmaFileUrl) {
  return `You are grounding this UI mockup's visual design in a REAL design
system instead of inventing one. Use your Figma MCP tools (available via
ToolSearch) against this file: ${figmaFileUrl}

Call get_variable_defs first — prefer its published color/type variables
over anything else. If that returns little or nothing usable, fall back
to get_design_context (and get_screenshot as a last resort) on the file's
top-level frame/page to infer the same information by inspection.

Return, matching the required schema:
- colors: 4-6 named hex tokens actually present in this file, named after
  their real Figma variable/style name where one exists (e.g. "surface
  #ffffff") — not a generic label you invented.
- typefaces: the file's own font families, as "role: Font Family" (e.g.
  "display: <actual family found>", "body: <actual family found>"). Only
  substitute a close Google Fonts match if the exact family genuinely
  isn't loadable outside Figma, and make that substitution visible in the
  string itself (e.g. "body: Source Sans 3 (substituting <original>,
  not available via Google Fonts)").
- layoutConcept: one or two sentences on this file's own layout
  conventions (spacing scale, card/section treatment) worth carrying into
  the mockup.

If the file/URL genuinely can't be read (no access, wrong id, tool
error), still return the schema's required shape, but make every value
plainly say it's a fallback (e.g. "fallback-ink #1c1f24 (Figma file
unreadable)") rather than silently passing off an invented palette as if
it came from the file.`
}

function existingLayoutPrompt(existingOutputDir) {
  return `Read the JSON file at ${existingOutputDir}/layout.json using your
Read tool — it is a previous run's page layout (design plan included) for
a page that was already built and screenshotted at
${existingOutputDir}/wireframe.html. Return its contents verbatim as
structured data matching the required schema (pageTitle, layoutNotes,
sections including each one's status, and designPlan) — this is existing
state to preserve, not something to redesign or second-guess.`
}

function ticketIntakePrompt(ticket, existingLayout) {
  const existingBlock = existingLayout
    ? `\n\nIMPORTANT — this ticket describes a NEW FEATURE for a page that
ALREADY EXISTS, not a brand-new page. The page already covers:
Page: """${existingLayout.pageTitle}"""
Existing sections: ${existingLayout.sections.map(s => `${s.heading} (${s.type})`).join(', ')}
Only identify what this ticket ADDS or CHANGES on top of that — don't
redescribe content the page already has.`
    : ''

  return `You are reading a raw ticket description and pulling out what a UI
designer needs to know before building a page for it. Ticket:
"""${ticket}"""
${existingBlock}

Identify the page's goal and audience, the concrete pieces of
content/functionality the ticket actually calls for (not invented scope),
and what matters most if something has to be cut for time. Return
structured data matching the required schema — no files to write for this
step.`
}

function uiLayoutPrompt(intake, existingLayout) {
  const existingBlock = existingLayout
    ? `\n\nThis page ALREADY EXISTS with this layout — you are EXTENDING it,
not designing from scratch:
${JSON.stringify(existingLayout.sections.map(({ id, type, heading, description, order }) => ({ id, type, heading, description, order })), null, 2)}

Return the FULL section list again: every existing section that this
ticket doesn't touch comes back unchanged (same id/heading/description/
order, status "unchanged"); a section this ticket changes comes back with
the same id but an updated description (status "modified"); anything
genuinely new gets a fresh id (status "new"), inserted at whatever order
position makes sense — renumber orders as needed but keep the existing
sections' relative order stable. Never silently drop an existing section.`
    : `\n\nEvery section you write is being designed fresh for a brand-new
page — set each one's status to "new".`

  return `You are a UI designer turning this page intake into a concrete
section-by-section layout.

Page goal: """${intake.pageGoal}"""
Key content the ticket calls for: ${intake.keyContent.join(', ')}
Priorities: ${intake.priorities.join(', ')}
${existingBlock}

Break the page into an ordered list of sections (nav, hero, form, list,
card-grid, table, sidebar, cta, text, footer, or custom) that together
cover every item in "Key content" — don't invent sections the ticket
doesn't call for, and don't drop any of the listed content either. Each
section needs a short heading and a description concrete enough that
someone could build its markup from it alone (e.g. "3-column card grid,
each card: thumbnail placeholder + title + one line of body text" rather
than "a card grid"). ${existingLayout
    ? 'Carry the existing "designPlan" field through unchanged in your output — don\'t alter it.'
    : 'Leave "designPlan" unset — that only gets attached once a Render step actually builds the page, not before.'
  } Return structured data matching the required schema — no files to
write for this step.`
}

function wireframeRenderPrompt(intake, layout, outputDir, existingOutputDir, figmaDesignPlan) {
  const modeBlock = existingOutputDir
    ? `\n\nYou are EXTENDING an existing static HTML mockup, not building a
fresh one. Read the existing file at ${existingOutputDir}/wireframe.html
first (using your Read tool). Reuse its existing CSS tokens/typefaces
exactly as they are — do NOT invent a new design plan; return the SAME
one you were given in this layout's "designPlan" field, verbatim, in your
own designPlan field. Edit the HTML to add/update markup for every
section below whose status is "new" or "modified" (in their listed
order), leaving every "unchanged" section's existing markup exactly as it
is — reuse the same CSS custom properties/classes already defined in the
file rather than redefining them. Write the result to
${outputDir}/wireframe.html (an in-place update if outputDir is the same
as the existing one).`
    : figmaDesignPlan
    ? `\n\nUse this REAL design plan, pulled from the team's own Figma file
— do NOT invent a different one, and return it verbatim in your own
designPlan field:
Colors: ${figmaDesignPlan.colors.join(', ')}
Typefaces: ${figmaDesignPlan.typefaces.join(', ')}
Layout concept: ${figmaDesignPlan.layoutConcept}
Every section below is being built fresh, styled with these exact tokens.`
    : `\n\nBefore writing any code, work out a short design plan grounded in
this specific page's subject — not a generic default:
- Color: 4-6 named hex tokens (background, surface/card, ink/text, one
  deliberately-chosen neutral biased slightly toward your accent instead
  of flat mid-grey, an accent, and separate semantic colors for any named
  states this page has, e.g. order status).
- Type: two typefaces — a display/heading face with some real character
  plus a complementary body face — loaded from Google Fonts
  (<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=...">),
  each with a real fallback stack.
- Layout: one or two sentences, starting from "${layout.layoutNotes}".
Every section below is being built fresh.`

  return `You are rendering the following UI layout as a single static HTML
mockup — plain HTML + inline/embedded CSS only, no build step, no
external framework (a Google Fonts stylesheet link is fine). Use real
content, not lorem ipsum, drawn from the layout below.
${modeBlock}

Page title: ${layout.pageTitle}
Layout approach: ${layout.layoutNotes}
Sections, in order (status shown per section — see mode instructions above):
${layout.sections
  .sort((a, b) => a.order - b.order)
  .map(s => `${s.order}. [${s.type}] (${s.status || 'new'}) ${s.heading} — ${s.description}`)
  .join('\n')}
${existingOutputDir && layout.designPlan ? `\nExisting design plan to reuse verbatim:\nColors: ${layout.designPlan.colors.join(', ')}\nTypefaces: ${layout.designPlan.typefaces.join(', ')}\nLayout concept: ${layout.designPlan.layoutConcept}` : ''}

Page goal (for context, don't render this text literally): """${intake.pageGoal}"""

Design craft, apply throughout:
- Give repeated elements (rows/cards/badges) identical edges/padding/baselines across every instance.
- Encode state in form, not just color — a status is a labeled pill/chip, not a bare color swatch.
- Use tabular-nums for any column of numbers (prices, dates, counts).
- Avoid generic AI-design defaults: no purple-to-blue gradient hero, no
  Inter/Space-Grotesk-as-the-safe-choice, no emoji as section markers,
  nothing centered by default, no rounded-lg-on-everything card treatment.
- This is a demo/utilitarian treatment — make it polished, not maximalist.

Steps:
1. Write (or update) the HTML file to ${outputDir}/wireframe.html using
   your Write/Edit tool.
2. Write ${outputDir}/layout.json containing exactly this layout object
   (pageTitle, layoutNotes, sections with their status, and your
   designPlan) as pretty-printed JSON — this is what a future run reads
   back to extend this same page consistently.
3. Use Playwright (chromium) to open the HTML file and take a full-page
   screenshot, saved to ${outputDir}/wireframe.png. The browser is already
   installed in this environment — do not attempt to install it.
4. Return htmlPath, screenshotPath, designPlan, and a short note on
   anything you simplified or skipped, matching the required schema.`
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
