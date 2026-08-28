export const TASK_STATUSES = ['todo', 'in_progress', 'done', 'blocked']
export const BUG_STATUSES = ['open', 'fixed', 'closed']

function requireString(obj, field, errors) {
  if (typeof obj[field] !== 'string' || obj[field].length === 0) {
    errors.push(`${field} must be a non-empty string`)
  }
}

export function validateBacklogTask(obj) {
  const errors = []
  if (!obj || typeof obj !== 'object') return { valid: false, errors: ['task must be an object'] }
  requireString(obj, 'id', errors)
  requireString(obj, 'specialization', errors)
  requireString(obj, 'description', errors)
  requireString(obj, 'successCriterion', errors)
  if (!TASK_STATUSES.includes(obj.status)) {
    errors.push(`status must be one of ${TASK_STATUSES.join(', ')}`)
  }
  if (typeof obj.attempts !== 'number' || obj.attempts < 0) {
    errors.push('attempts must be a non-negative number')
  }
  return { valid: errors.length === 0, errors }
}

export function validateBug(obj) {
  const errors = []
  if (!obj || typeof obj !== 'object') return { valid: false, errors: ['bug must be an object'] }
  requireString(obj, 'id', errors)
  requireString(obj, 'taskId', errors)
  requireString(obj, 'description', errors)
  if (!Array.isArray(obj.reproSteps) || obj.reproSteps.length === 0) {
    errors.push('reproSteps must be a non-empty array')
  }
  if (!BUG_STATUSES.includes(obj.status)) {
    errors.push(`status must be one of ${BUG_STATUSES.join(', ')}`)
  }
  return { valid: errors.length === 0, errors }
}
