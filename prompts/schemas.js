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
    taskKind: {
      type: 'string',
      enum: ['standard', 'ml-training-launch', 'ml-training-monitor', 'ml-training-integrate-verify'],
      description: 'Defaults to "standard" (the normal Programmer/Artist/Tester implementation cycle) when omitted — every task in every other milestone this pipeline has ever built is "standard". Only set this for a milestone specifically about ML-Agents training: "ml-training-launch" for the task that exports a standalone build and starts an mlagents-learn run in the background; "ml-training-monitor" for the task that polls that run\'s convergence and decides when to stop it; "ml-training-integrate-verify" for the task that assigns the resulting trained model and verifies its measured hunt/evasion success rates via real Play Mode.',
    },
    requiresExclusiveEditor: {
      type: 'boolean',
      description: 'Set true ONLY for a task whose successCriterion itself demands one continuous, uninterrupted Play Mode session end-to-end (a full-loop/whole-game regression pass, e.g. "the entire loop completes in one continuous Play Mode session with zero console errors") — a criterion that is unverifiable if any other task\'s agent enters/exits Play Mode, loads a scene, or triggers a recompile on the same shared Unity Editor at any point during it. All other tasks, including ordinary ones that also use Play Mode to test one feature, default to false/omitted and run in the normal concurrent batch — this flag is specifically about session CONTINUITY being part of the pass/fail condition, not about whether Play Mode is used at all.',
    },
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

export const TRAINING_LAUNCH_SCHEMA = {
  type: 'object',
  required: ['launched', 'detail'],
  properties: {
    launched: {
      type: 'boolean',
      description: 'True ONLY if a live mlagents-learn process was actually verified running (process alive, log file growing) — not merely that the launch command returned without error. False if the standalone build failed, the trainer died on startup, or aliveness could not be confirmed; the workflow blocks the task (and the dependent monitor/integrate tasks) on false rather than letting a later task monitor a run that never started.',
    },
    runId: { type: 'string', description: 'The mlagents-learn --run-id used, matching the run-info json file written for the monitor task.' },
    logdir: { type: 'string', description: 'The results/TensorBoard logdir the convergence-check script will read.' },
    pid: { type: 'number', description: 'PID of the launched mlagents-learn process, so the monitor task can terminate it once it reaches a terminal verdict.' },
    detail: { type: 'string', description: 'What was verified (or, when launched is false, concretely what went wrong).' },
  },
}

export const TRAINING_MONITOR_SCHEMA = {
  type: 'object',
  required: ['verdict', 'action', 'reason'],
  properties: {
    verdict: {
      type: 'string',
      enum: ['plateau', 'plateau_degenerate', 'diverge'],
      description: 'The deterministic convergence-check script\'s own verdict, copied verbatim — never re-derived from raw numbers by the agent itself. "plateau" is a genuine converged, non-degenerate result. "plateau_degenerate" is a flat reward curve with near-zero hunt attempts (the pure-forager equilibrium) — NOT a success even though the reward curve looks fine. "diverge" is reward collapse.',
    },
    action: {
      type: 'string',
      enum: ['proceed_to_integration', 'retry', 'escalate'],
      description: '"proceed_to_integration" only for verdict "plateau". "retry" for "plateau_degenerate" or "diverge" on the FIRST attempt (one adjusted-config retry, per the spec\'s bounded-retry design — mirrors this pipeline\'s existing MAX_MILESTONE_REOPEN_ROUNDS pattern). "escalate" if this is already a retry attempt and it also ended in "plateau_degenerate" or "diverge" — never a second automatic retry.',
    },
    reason: {
      type: 'string',
      description: 'Concrete, numeric — cite the actual observed rolling-mean/std/episode-length/role-balance numbers the script reported, not a vague restatement of the verdict.',
    },
    adjustedConfig: {
      type: 'string',
      description: 'Present only when action is "retry" — the SPECIFIC config change being made (e.g. "widened curriculum stage 1 power-variance range from X-Y to X2-Y2" or "raised hunt-success reward from 0.3 to 0.5"), per the spec\'s constraint that a retry must be a concrete, bounded, documented adjustment, not open-ended re-engineering.',
    },
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
