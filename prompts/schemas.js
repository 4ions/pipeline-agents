export const VISION_SCHEMA = {
  type: 'object',
  required: ['identity', 'scope', 'priorities'],
  properties: {
    identity: { type: 'string', description: 'What kind of game this is and its core hook, 2-4 sentences' },
    scope: { type: 'string', description: 'What is in and explicitly out of scope for this build' },
    priorities: { type: 'array', items: { type: 'string' }, description: 'Ordered list of what matters most if trade-offs are needed' },
  },
}

export const BACKLOG_TASK_SCHEMA = {
  type: 'object',
  required: ['id', 'specialization', 'description', 'successCriterion', 'needsArt', 'needsAnimation', 'status', 'attempts'],
  properties: {
    id: { type: 'string' },
    specialization: { type: 'string', enum: ['gameplay', 'ui', 'ai', 'network', 'graphics', 'tools'] },
    description: { type: 'string' },
    successCriterion: { type: 'string', description: 'A concrete, checkable condition the Tester can verify via input+state' },
    needsArt: { type: 'boolean' },
    needsAnimation: { type: 'boolean', description: 'true if this task\'s GameObject moves or reacts to something and needs at least an idle state plus one action state' },
    status: { type: 'string', enum: ['todo', 'in_progress', 'done', 'blocked'] },
    attempts: { type: 'number' },
  },
}

export const BACKLOG_SCHEMA = {
  type: 'object',
  required: ['gdd', 'tasks'],
  properties: {
    gdd: { type: 'string', description: 'The full Game Design Document text (also written to gdd.md by the Designer) — carried here because the Workflow script cannot read gdd.md itself' },
    tasks: { type: 'array', items: BACKLOG_TASK_SCHEMA },
  },
}

export const TEST_RESULT_SCHEMA = {
  type: 'object',
  required: ['passed', 'evidence'],
  properties: {
    passed: { type: 'boolean' },
    evidence: { type: 'string', description: 'What was observed via input+state (and a screenshot check, if taken) that supports the verdict' },
    bug: {
      type: 'object',
      description: 'Present only if passed is false',
      properties: {
        description: { type: 'string' },
        reproSteps: { type: 'array', items: { type: 'string' } },
      },
    },
  },
}

export const ANIMATION_REVIEW_SCHEMA = {
  type: 'object',
  required: ['accepted', 'feedback'],
  properties: {
    accepted: { type: 'boolean' },
    feedback: {
      type: 'string',
      description: 'If accepted, a short note confirming what exists. If not accepted, concrete, specific feedback the Artist can act on — name the exact problem.',
    },
  },
}

export const DESIGN_REVIEW_SCHEMA = {
  type: 'object',
  required: ['approved', 'feedback'],
  properties: {
    approved: { type: 'boolean' },
    feedback: { type: 'string', description: 'If approved, a short confirmation. If not, specific actionable gaps for the Designer to fix.' },
  },
}

export const QUALITY_CRITIQUE_SCHEMA = {
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
          taskId: { type: ['string', 'null'], description: 'The backlog task id this issue is closest to, or null for a whole-game issue' },
          description: { type: 'string', description: 'Specific enough to act on, not a vague generality' },
          severity: { type: 'string', enum: ['blocking', 'polish'] },
          relatedTaskIds: {
            type: 'array',
            items: { type: 'string' },
            description: 'Only present when this issue is CROSS-CUTTING — the same underlying concept/state is duplicated or inconsistent across more than one task\'s own code (e.g. two scripts each independently computing world bounds). List every OTHER task id (besides taskId) whose code is part of the same root cause, so they get fixed together, not as isolated patches. Omit for an issue confined to one task.',
          },
        },
      },
    },
  },
}

export const MILESTONE_SCHEMA = {
  type: 'object',
  required: ['id', 'description', 'scope', 'dependsOn'],
  properties: {
    id: { type: 'string', description: 'Short stable id, e.g. "M1" — referenced by later dependsOn arrays and by roadmapReviewPrompt' },
    description: { type: 'string', description: 'What this milestone delivers, 1-3 sentences' },
    scope: { type: 'string', description: 'Concrete scope for this milestone only — small enough for one Design->Implementation->Playtest->Quality-Gate cycle to actually finish' },
    dependsOn: { type: 'array', items: { type: 'string' }, description: 'ids of earlier milestones this one requires; empty array if none' },
  },
}

export const ROADMAP_SCHEMA = {
  type: 'object',
  required: ['vision', 'milestones'],
  properties: {
    vision: VISION_SCHEMA,
    milestones: { type: 'array', items: MILESTONE_SCHEMA, description: 'Ordered — milestones[0] is built first' },
  },
}

export const ROADMAP_REVIEW_SCHEMA = {
  type: 'object',
  required: ['verdict', 'reason'],
  properties: {
    verdict: { type: 'string', enum: ['continue', 'escalate', 'complete'] },
    reason: { type: 'string', description: 'Why this verdict — required even for continue, so the run log explains itself' },
    revisedMilestones: { type: 'array', items: MILESTONE_SCHEMA, description: 'Only present when verdict is continue AND the remaining roadmap changed (reordered/split/merged/trimmed/added-to); omit or leave empty to keep the remaining roadmap as-is' },
  },
}

export const PLAYTEST_SCHEMA = {
  type: 'object',
  required: ['completed', 'issues'],
  properties: {
    completed: { type: 'boolean', description: 'Whether the full playthrough reached its end without breaking' },
    issues: { type: 'array', items: { type: 'string' }, description: 'Any problems found during the full playthrough, empty if none' },
  },
}

export const FINAL_REVIEW_SCHEMA = {
  type: 'object',
  required: ['ready', 'reopenTasks', 'summary'],
  properties: {
    ready: { type: 'boolean' },
    reopenTasks: {
      type: 'array',
      items: {
        type: 'object',
        required: ['taskId', 'reason'],
        properties: {
          taskId: { type: 'string' },
          reason: {
            type: 'string',
            description: 'Concrete, actionable reason this specific task is being reopened — the ONLY context a fresh Fixer with no memory of this review will get, so name the actual problem (and what would fix it, if known) rather than a vague label like "vision drift" or "quality issue". If this reopen is driven by the Quality Critic, reuse the Critic\'s own specific issue text rather than summarizing it away.',
          },
          correctedSuccessCriterion: {
            type: 'string',
            description: 'ONLY set this when the task\'s ORIGINAL successCriterion is itself factually wrong — objectively incompatible with a verified functional constraint (e.g. it names a specific key binding that provably collides with an existing control), not merely hard to satisfy or a matter of taste. Give the corrected criterion text verbatim, ready to replace the stored one. Leave unset for an ordinary reopen (a real bug, a missed detail, a quality issue) where the original criterion is still correct and only the implementation needs to change — setting this for anything less than a proven factual error would let a reopen silently rewrite a task\'s requirements instead of fixing the code.',
          },
        },
      },
    },
    summary: { type: 'string' },
  },
}

export const MILESTONE_SNAPSHOT_SCHEMA = {
  type: 'object',
  required: ['id', 'gdd', 'tasks'],
  properties: {
    id: { type: 'string', description: 'The milestone id this snapshot belongs to, e.g. "M1"' },
    gdd: { type: 'string', description: 'This milestone\'s own GDD text, as last written' },
    tasks: { type: 'array', items: BACKLOG_SCHEMA.properties.tasks.items, description: 'This milestone\'s own task list, each with its final status/attempts' },
  },
}

export const RESUME_STATE_SCHEMA = {
  type: 'object',
  required: ['mode'],
  properties: {
    mode: {
      type: 'string',
      enum: ['fresh', 'resume', 'escalated'],
      description: '"fresh" = no prior state, run the normal roadmap-from-scratch path. "resume" = prior state found, pick the chain back up. "escalated" = the chain is waiting on a human decision, do not touch anything.',
    },
    escalationReason: { type: 'string', description: 'Only present when mode is "escalated" — why the chain needs a human decision' },
    vision: { ...VISION_SCHEMA, description: 'Only present when mode is "resume" — the vision loaded from vision.md' },
    remainingMilestones: {
      type: 'array',
      items: MILESTONE_SCHEMA,
      description: 'Only present when mode is "resume" — every not-yet-done milestone, in roadmap order, the "current" one (if any) first',
    },
    doneMilestones: {
      type: 'array',
      items: MILESTONE_SNAPSHOT_SCHEMA,
      description: 'Only present when mode is "resume" — one entry per milestone already marked "done", loaded from its persisted snapshot',
    },
    currentMilestoneSnapshot: {
      type: ['object', 'null'],
      properties: MILESTONE_SNAPSHOT_SCHEMA.properties,
      description: 'Only present when mode is "resume". The "current" milestone\'s own snapshot if one is usable, otherwise null (meaning: treat it as not-yet-started and design it fresh)',
    },
  },
}
