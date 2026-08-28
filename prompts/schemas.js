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
  required: ['id', 'specialization', 'description', 'successCriterion', 'needsArt', 'status', 'attempts'],
  properties: {
    id: { type: 'string' },
    specialization: { type: 'string', enum: ['gameplay', 'ui', 'ai', 'network', 'graphics', 'tools'] },
    description: { type: 'string' },
    successCriterion: { type: 'string', description: 'A concrete, checkable condition the Tester can verify via input+state' },
    needsArt: { type: 'boolean' },
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
