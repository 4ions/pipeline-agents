// Spike: reuses this repo's agentic pattern (Workflow + agent() + schema +
// phase()) for a different domain than the rest of this pipeline — turning
// a ticket description into a real Figma file, NOT a Unity game task.
// Deliberately self-contained (its own schemas, no dependency on
// prompts/schemas.js or any of the Unity-specific prompt files) so this
// spike stays isolated from the game-build pipeline it borrows the pattern
// from.
//
// Two modes, same pipeline: a fresh page (no existingOutputDir arg) or a
// new feature added onto a page this pipeline already built
// (existingOutputDir points at that earlier run's output folder). Each
// Figma Push writes layout.json (sections, design plan, and the real
// Figma file URL) into outputDir specifically so a LATER run can load it
// back and update the SAME Figma file/frame instead of creating a new
// one. outputDir holds only this bookkeeping JSON — there is no local
// HTML/screenshot artifact; the Figma file itself is the only output.
//
// Optional args.figmaFileUrl grounds a FRESH page's design plan in a real
// Figma file's own tokens/typefaces instead of an invented palette, via
// the Figma MCP connector's read tools (get_variable_defs /
// get_design_context / get_screenshot). Ignored when existingOutputDir is
// set — an extend-run's own prior design plan wins, for visual continuity
// with the page it's adding onto.
//
// Design Review (a Director-style pass over the Layout, bounded retries)
// and a Quality Gate (a Critic-style pass over the pushed Figma frame,
// bounded fix-in-place retries) mirror the auto-game-build pipeline's own
// Design-Review/Quality-Critic loops — same shape, adapted to this
// domain's single-page-per-run model instead of a multi-task backlog.

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
    description: { type: 'string', description: 'What this section contains, concrete enough to build directly from this text alone' },
    order: { type: 'number', description: 'Top-to-bottom position on the page, 0-based' },
    status: {
      type: 'string',
      enum: ['new', 'modified', 'unchanged'],
      description: 'Only meaningful when extending an existing page (omit/ignore for a fresh page — treat everything as "new"). "unchanged" = keep this existing section byte-for-byte. "modified" = existing section, description changed by this ticket. "new" = this ticket added it.',
    },
  },
}

export const DESIGN_PLAN_SCHEMA = {
  type: 'object',
  required: ['colors', 'typefaces', 'layoutConcept'],
  properties: {
    colors: { type: 'array', items: { type: 'string' }, description: '4-6 named hex tokens, each as "name #hexvalue" (e.g. "ink #1c1f24"), grounded in this page\'s specific subject — not a generic default palette' },
    typefaces: { type: 'array', items: { type: 'string' }, description: 'Each as "role: Font Family" (e.g. "display: Fraunces", "body: Source Sans 3")' },
    layoutConcept: { type: 'string', description: 'The layout concept in one or two sentences' },
  },
}

export const UI_LAYOUT_SCHEMA = {
  type: 'object',
  required: ['pageTitle', 'layoutNotes', 'sections'],
  properties: {
    pageTitle: { type: 'string' },
    layoutNotes: { type: 'string', description: 'Overall layout approach, e.g. "single column" or "sidebar + main content"' },
    sections: { type: 'array', items: UI_SECTION_SCHEMA },
    designPlan: { ...DESIGN_PLAN_SCHEMA, description: 'Only present once a Figma Push step has run at least once for this page — carried forward so a later extend-run reuses the same palette/type instead of inventing a new one' },
    figmaFileUrl: { type: 'string', description: 'Only present once a Figma Push step has run at least once for this page — the real Figma file this page lives in, carried forward so a later extend-run UPDATES that same file instead of creating a new one' },
  },
}

export const LAYOUT_REVIEW_SCHEMA = {
  type: 'object',
  required: ['approved', 'feedback'],
  properties: {
    approved: { type: 'boolean' },
    feedback: {
      type: 'string',
      description: 'If approved, a short confirmation. If not, specific, actionable gaps — a missing keyContent item, an invented section the ticket never asked for, a broken/lost existing section on an extend-run — not a vague "make it better."',
    },
  },
}

export const MOCKUP_CRITIQUE_SCHEMA = {
  type: 'object',
  required: ['acceptable', 'issues'],
  properties: {
    acceptable: { type: 'boolean', description: 'true ONLY if genuinely nothing worth fixing was found' },
    issues: {
      type: 'array',
      items: {
        type: 'object',
        required: ['description', 'severity'],
        properties: {
          description: { type: 'string', description: 'Specific enough to act on — name the actual visual/content problem, not a vague generality' },
          severity: { type: 'string', enum: ['blocking', 'polish'] },
        },
      },
    },
  },
}

export const FIGMA_PUSH_RESULT_SCHEMA = {
  type: 'object',
  required: ['figmaFileUrl', 'figmaFileKey', 'figmaNodeId', 'notes'],
  properties: {
    figmaFileUrl: { type: 'string', description: 'A real, openable Figma URL to the page frame, e.g. https://www.figma.com/design/<fileKey>/<name>?node-id=<node-id-with-dash>' },
    figmaFileKey: { type: 'string', description: 'The Figma file key, for a later run to update the same file' },
    figmaNodeId: { type: 'string', description: 'The wrapper frame\'s node id (colon form, e.g. "2:2"), for a later run to update the same frame' },
    notes: { type: 'string', description: 'Anything worth flagging — sections simplified/skipped, font substitutions, whether this created a new file or updated an existing one' },
  },
}

export function figmaTokensPrompt(figmaFileUrl) {
  return `You are grounding this UI page's visual design in a REAL design
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
  "display: <actual family found>", "body: <actual family found>").
- layoutConcept: one or two sentences on this file's own layout
  conventions (spacing scale, card/section treatment) worth carrying into
  the new page.

If the file/URL genuinely can't be read (no access, wrong id, tool
error), still return the schema's required shape, but make every value
plainly say it's a fallback (e.g. "fallback-ink #1c1f24 (Figma file
unreadable)") rather than silently passing off an invented palette as if
it came from the file.`
}

export function existingLayoutPrompt(existingOutputDir) {
  return `Read the JSON file at ${existingOutputDir}/layout.json using your
Read tool — it is a previous run's page layout (design plan and real
Figma file URL included) for a page this pipeline already built. Return
its contents verbatim as structured data matching the required schema
(pageTitle, layoutNotes, sections including each one's status,
designPlan, and figmaFileUrl) — this is existing state to preserve, not
something to redesign or second-guess.`
}

export function ticketIntakePrompt(ticket, existingLayout) {
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

export function uiLayoutPrompt(intake, existingLayout, reviewFeedback) {
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

  const reviewBlock = reviewFeedback
    ? `\n\nA reviewer already looked at a previous version of this layout and
sent it back with this feedback — revise to address it specifically,
don't just resubmit the same layout: """${reviewFeedback}"""`
    : ''

  return `You are a UI designer turning this page intake into a concrete
section-by-section layout.

Page goal: """${intake.pageGoal}"""
Key content the ticket calls for: ${intake.keyContent.join(', ')}
Priorities: ${intake.priorities.join(', ')}
${existingBlock}
${reviewBlock}

Break the page into an ordered list of sections (nav, hero, form, list,
card-grid, table, sidebar, cta, text, footer, or custom) that together
cover every item in "Key content" — don't invent sections the ticket
doesn't call for, and don't drop any of the listed content either. Each
section needs a short heading and a description concrete enough that
someone could build it directly from it alone (e.g. "3-column card grid,
each card: thumbnail placeholder + title + one line of body text" rather
than "a card grid"). ${existingLayout
    ? 'Carry the existing "designPlan" and "figmaFileUrl" fields through unchanged in your output — don\'t alter either.'
    : 'Leave "designPlan" and "figmaFileUrl" unset — those only get attached once the Figma Push step actually builds the page, not before.'
  } Return structured data matching the required schema — no files to
write for this step.`
}

export function layoutReviewPrompt(intake, layout, existingLayout) {
  const extendBlock = existingLayout
    ? `\n\nThis is an EXTEND-run — check specifically that every section from
the existing layout below is still present (status "unchanged" or
"modified", never silently dropped), and that any status "new"/"modified"
sections are genuinely justified by the ticket, not scope creep:
${JSON.stringify(existingLayout.sections.map(s => ({ id: s.id, heading: s.heading })), null, 2)}`
    : ''

  return `You are a SENIOR product designer reviewing a junior designer's
page layout before it gets built — the kind of review that catches a
missing requirement or invented scope before engineering time is spent on
it, not a rubber stamp.

Page goal: """${intake.pageGoal}"""
Key content the ticket calls for: ${intake.keyContent.join(', ')}
Priorities: ${intake.priorities.join(', ')}
${extendBlock}

Proposed layout:
Page title: ${layout.pageTitle}
Layout approach: ${layout.layoutNotes}
Sections:
${layout.sections
  .sort((a, b) => a.order - b.order)
  .map(s => `${s.order}. [${s.type}] (${s.status || 'new'}) ${s.heading} — ${s.description}`)
  .join('\n')}

Check: does every item in "Key content" map to a concrete section? Is any
section pure invented scope the ticket never asked for? Is any section's
description too vague to build from as-is? On an extend-run, was any
existing section dropped or overwritten without the ticket asking for it?
Approve only if none of these problems exist. Return structured data
matching the required schema — no files to write for this step.`
}

export function figmaPushPrompt(intake, layout, outputDir, existingFigmaFileUrl, figmaPlanKey, fixFeedback) {
  const modeBlock = existingFigmaFileUrl
    ? `\n\nThis page already has a REAL Figma file — you are UPDATING it, not
creating a new one: ${existingFigmaFileUrl}
Parse its fileKey from the URL. Use get_metadata (or a read-only
use_figma script) to inspect the existing wrapper frame's structure
first. Then, following the sections list below, ADD or UPDATE the nodes
for every section whose status is "new" or "modified" (in their listed
order) and leave every "unchanged" section's existing nodes exactly as
they are — reuse the same colors/fonts already present in the file
rather than re-deriving them. Load the figma-use skill (and
figma-generate-design if building a full new section) before any
use_figma call, per that tool's own requirement.`
    : `\n\nThis page has NO Figma file yet — create one from scratch.
Load the figma-create-new-file skill, then:
1. Resolve planKey: ${figmaPlanKey ? `use "${figmaPlanKey}" directly` : 'call whoami; if there is exactly one plan, use its key; if there are several, pick the first and say so in your notes (this is a non-interactive run, so ask-the-user is not available) — do not fail the run over this'}.
2. Call create_new_file with fileName "${layout.pageTitle}", the resolved
   planKey, and editorType "design".
3. Load the figma-use skill (mandatory before any use_figma call) and,
   since this is a full composed page, also figma-generate-design.
4. Build the page as a single top-level auto-layout wrapper frame
   containing one child section per entry below, using
   figma.createAutoLayout / figma.createText / figma.createRectangle per
   the figma-use skill's rules (font loading via listAvailableFontsAsync
   first — never guess a style name; colors in 0-1 range; append to an
   auto-layout parent before setting HUG/FILL). This is a from-scratch
   file with no published design system to import from, so build
   manually — do not spend time on search_design_system.
Work in retry-safe batches per the figma-use skill (e.g. one call for the
wrapper + first couple of sections, a further call per remaining group of
sections) rather than one giant script — a script this size is a common
cause of silent truncation/timeouts.`

  const fixBlock = fixFeedback
    ? `\n\nA quality reviewer already looked at THIS file (the one at
${existingFigmaFileUrl}) and found real problems — inspect the existing
frame first (get_metadata / get_screenshot), then fix ONLY these specific
issues in place with targeted use_figma edits. Do not rebuild the frame
from scratch and do not touch anything the issues below don't mention:
"""${fixFeedback}"""`
    : ''

  return `You are building this page's design as a REAL Figma file — this
is the pipeline's ONLY output for this page, there is no HTML mockup or
local screenshot anywhere in this pipeline; do not create one.
${modeBlock}
${fixBlock}

Page title: ${layout.pageTitle}
Layout approach: ${layout.layoutNotes}
Design plan to use for colors/typefaces: ${layout.designPlan ? `Colors: ${layout.designPlan.colors.join(', ')} | Typefaces: ${layout.designPlan.typefaces.join(', ')} | Layout concept: ${layout.designPlan.layoutConcept}` : '(none recorded — work out a short design plan grounded in this specific page\'s subject: 4-6 named hex tokens, not a generic default palette, plus two typefaces with real character, and note what you chose)'}
Sections, in order (status shown per section):
${layout.sections
  .sort((a, b) => a.order - b.order)
  .map(s => `${s.order}. [${s.type}] (${s.status || 'new'}) ${s.heading} — ${s.description}`)
  .join('\n')}

Page goal (for context, don't render this text literally): """${intake.pageGoal}"""

Design craft, apply throughout:
- Give repeated elements (rows/cards/badges) identical edges/padding/baselines across every instance.
- HARD RULE — a row/grid of repeated cards (a product grid, a list of
  order rows, anything with more than one sibling of the same shape)
  MUST end up the exact same total height on every card, even when their
  text content varies in length (e.g. one product name wraps to 2 lines,
  another to 1) — never let per-card height vary with its own content.
  Do this with the correct auto-layout sequence, not by forcing FILL
  everywhere (that's circular and breaks silently): (1) build every card
  first with its OWN natural/HUG height (don't touch its
  layoutSizingVertical yet); (2) read back each built card's actual
  .height; (3) take the max across all of them and, in a follow-up call,
  set every card's height explicitly to that max via resize() +
  layoutSizingVertical = 'FIXED' (not 'FILL' — a card is never a FILL
  child of a HUG-sized grid); (4) only then set each card's inner content
  container to layoutSizingVertical = 'FILL' (now valid, since its parent
  card is FIXED) with a spacer node (layoutGrow = 1) between the
  info block and the action buttons, so buttons land at the same y
  position on every card regardless of how much text is above them.
- Encode state in form, not just color — a status is a labeled pill/chip, not a bare color swatch.
- Avoid generic AI-design defaults: no purple-to-blue gradient hero, no
  Inter used with no apparent reason, no emoji as section markers,
  nothing centered by default, no rounded-corners-on-everything treatment.
- This is a demo/utilitarian treatment — make it polished, not maximalist.

When done, take ONE screenshot of the top-level wrapper frame to confirm
it looks right (cropped/overlapping text, wrong colors) and fix anything
broken with one targeted follow-up call rather than rebuilding.

Finally, using your Read/Write tools, update ${outputDir}/layout.json:
read its current contents (or start from the sections/designPlan given
above if the file doesn't exist yet), set/overwrite its "figmaFileUrl"
field to the real URL you ended up with (node-id query param included),
and write it back — this is what a LATER run reads to update this same
Figma file instead of creating a new one.

Return figmaFileUrl (a real openable URL including a node-id query param
for the wrapper frame), figmaFileKey, figmaNodeId, and notes — matching
the required schema.`
}

export function figmaCritiquePrompt(intake, layout, figmaPush) {
  return `You are a SENIOR product designer doing final QA on a Figma
design before it ships to a demo — the kind of review that catches a
missing section or a broken layout, not a rubber stamp.

Page goal: """${intake.pageGoal}"""
Sections this Figma frame is supposed to contain, in order:
${layout.sections
  .sort((a, b) => a.order - b.order)
  .map(s => `${s.order}. [${s.type}] ${s.heading} — ${s.description}`)
  .join('\n')}

Inspect the real Figma frame at fileKey "${figmaPush.figmaFileKey}",
nodeId "${figmaPush.figmaNodeId}" (${figmaPush.figmaFileUrl}) using your
Figma MCP tools: call get_screenshot to see it, and get_metadata to check
its actual node structure/counts. Check for:
- Any section above that's missing, empty, or clearly not what its
  description called for.
- Visual bugs: cropped/clipped text, overlapping elements, placeholder
  text left un-filled ("Lorem ipsum", "Title", "Heading").
- Content that contradicts the page goal or looks obviously wrong (a
  status badge with the wrong color mapping, a number that doesn't make
  sense).
- Generic AI-design smells: a purple-to-blue gradient hero, everything
  centered, Inter used with no apparent reason, emoji as section markers.
- Anything that isn't real editable Figma structure (text/frame/shape
  nodes) — a flattened image pasted in as if it were the design is itself
  a blocking issue, not a stylistic nitpick.
- In any row/grid of repeated cards: do they all end up the exact same
  total height? Uneven card heights (almost always caused by one card's
  text — a wrapped title, a longer description — pushing its own content
  taller than its siblings) is a BLOCKING issue, not polish — it reads as
  broken/unfinished in a demo the moment there's more than one card.

Mark each real problem "blocking" if it would embarrass this in a demo,
"polish" if it's a minor nitpick not worth a fix-in-place edit over.
Return acceptable: true ONLY if you genuinely found nothing worth
flagging. Return structured data matching the required schema — no files
to write for this step.`
}
