// Spike: reuses this repo's agentic pattern (Workflow + agent() + schema +
// phase()) for a different domain than the rest of this pipeline — turning
// a ticket description into a quick visual wireframe mockup, NOT a Unity
// game task. Deliberately self-contained (its own schemas, no dependency on
// prompts/schemas.js or any of the Unity-specific prompt files) so this
// spike stays isolated from the game-build pipeline it borrows the pattern
// from. Scope is intentionally minimal — one pass (intake -> layout ->
// render), no review/critique loop, no Unity dependency at all.

export const TICKET_INTAKE_SCHEMA = {
  type: 'object',
  required: ['pageGoal', 'keyContent', 'priorities'],
  properties: {
    pageGoal: { type: 'string', description: 'What this page is and who it is for, 1-2 sentences' },
    keyContent: { type: 'array', items: { type: 'string' }, description: 'Concrete pieces of content/functionality the ticket calls for' },
    priorities: { type: 'array', items: { type: 'string' }, description: 'Ordered list of what matters most if trade-offs are needed' },
  },
}

export const UI_SECTION_SCHEMA = {
  type: 'object',
  required: ['id', 'type', 'heading', 'description', 'order'],
  properties: {
    id: { type: 'string' },
    type: { type: 'string', enum: ['nav', 'hero', 'form', 'list', 'card-grid', 'table', 'sidebar', 'cta', 'text', 'footer', 'custom'] },
    heading: { type: 'string' },
    description: { type: 'string', description: 'What this section contains, concrete enough to sketch as a wireframe block' },
    order: { type: 'number', description: 'Top-to-bottom position on the page, 0-based' },
  },
}

export const UI_LAYOUT_SCHEMA = {
  type: 'object',
  required: ['pageTitle', 'layoutNotes', 'sections'],
  properties: {
    pageTitle: { type: 'string' },
    layoutNotes: { type: 'string', description: 'Overall layout approach, e.g. "single column" or "sidebar + main content"' },
    sections: { type: 'array', items: UI_SECTION_SCHEMA },
  },
}

export const RENDER_RESULT_SCHEMA = {
  type: 'object',
  required: ['htmlPath', 'screenshotPath', 'notes'],
  properties: {
    htmlPath: { type: 'string', description: 'Path to the written HTML/CSS wireframe file' },
    screenshotPath: { type: 'string', description: 'Path to the PNG screenshot of that HTML file' },
    notes: { type: 'string', description: 'Anything worth flagging about the render, e.g. sections simplified or skipped' },
  },
}

export function ticketIntakePrompt(ticket) {
  return `You are reading a raw ticket description and pulling out what a UI
designer needs to know before sketching a page for it. Ticket:
"""${ticket}"""

Identify the page's goal and audience, the concrete pieces of
content/functionality the ticket actually calls for (not invented scope),
and what matters most if something has to be cut for time. Return
structured data matching the required schema — no files to write for this
step.`
}

export function uiLayoutPrompt(intake) {
  return `You are a UI designer turning this page intake into a concrete
section-by-section layout for a WIREFRAME (not a polished visual design —
gray boxes, labels, and placeholder text are expected at this stage).

Page goal: """${intake.pageGoal}"""
Key content the ticket calls for: ${intake.keyContent.join(', ')}
Priorities: ${intake.priorities.join(', ')}

Break the page into an ordered list of sections (nav, hero, form, list,
card-grid, table, sidebar, cta, text, footer, or custom) that together
cover every item in "Key content" — don't invent sections the ticket
doesn't call for, and don't drop any of the listed content either. Each
section needs a short heading and a description concrete enough that
someone could sketch its wireframe block from it alone (e.g. "3-column
card grid, each card: thumbnail placeholder + title + one line of body
text" rather than "a card grid"). Return structured data matching the
required schema — no files to write for this step.`
}

export function wireframeRenderPrompt(intake, layout, outputDir) {
  return `You are rendering the following UI layout as a single static HTML
wireframe — plain HTML + inline/embedded CSS only, no build step, no
external dependencies. This is a WIREFRAME, not a finished visual design:
use gray/neutral placeholder boxes for images, simple borders to delineate
sections, and real (not lorem-ipsum) but clearly-labeled placeholder text
drawn from the layout below. Keep it a single self-contained .html file.

Page title: ${layout.pageTitle}
Layout approach: ${layout.layoutNotes}
Sections, in order:
${layout.sections
  .sort((a, b) => a.order - b.order)
  .map(s => `${s.order}. [${s.type}] ${s.heading} — ${s.description}`)
  .join('\n')}

Page goal (for context, don't render this text literally): """${intake.pageGoal}"""

Steps:
1. Write the HTML file to ${outputDir}/wireframe.html using your Write tool.
2. Use Playwright (chromium) to open that file and take a full-page
   screenshot, saved to ${outputDir}/wireframe.png. The browser is already
   installed in this environment — do not attempt to install it.
3. Return the two file paths and a short note on anything you simplified
   or skipped, matching the required schema.`
}
