// Pure helpers (no fs): safe to import from any host, including the plugin sandbox.
const basename = p => String(p).split(/[\\/]/).filter(Boolean).at(-1) ?? ''

export const LINE_MAX = 60

// Order matters: specific token shapes first, generic long runs last.
const SECRETS = [
  /\b(?:Bearer|Basic)\s+[A-Za-z0-9._~+/=-]{8,}/gi,
  /\b(?:sk|pk|rk)-[A-Za-z0-9_-]{8,}/g,
  /\bgh[pousr]_[A-Za-z0-9]{8,}/g,
  /\bgithub_pat_[A-Za-z0-9_]{8,}/g,
  /\bxox[abeprs]-[A-Za-z0-9-]{6,}/g,
  /\b(?:AKIA|ASIA)[A-Z0-9]{12,}/g,
  /\b(?:token|secret|password|passwd|api[_-]?key|auth)\s*[=:]\s*\S+/gi,
  /\b[0-9a-fA-F]{32,}\b/g,
  /[A-Za-z0-9+/_=-]{32,}/g,
]

export function redact(s) {
  let out = String(s)
  for (const re of SECRETS) out = out.replace(re, '[redacted]')
  return out
}

export function squash(s, max = LINE_MAX) {
  const t = redact(s).replace(/\s+/g, ' ').trim()
  return t.length > max ? t.slice(0, max - 1) + '…' : t
}

const FILE_TOOLS = new Set(['Read', 'Edit', 'Write', 'MultiEdit', 'NotebookEdit'])

// One short line for a tool call: name + short target. Never file contents or results.
export function activityLine(name, input = {}) {
  const i = input && typeof input === 'object' ? input : {}
  let target = ''
  if (FILE_TOOLS.has(name)) target = basename(String(i.file_path ?? i.notebook_path ?? i.path ?? ''))
  else if (name === 'Bash') target = i.description || i.command || ''
  else if (name === 'WebSearch') target = i.query || ''
  else if (name === 'WebFetch') target = String(i.url ?? '').split(/[?#]/)[0]
  else if (name === 'Agent' || name === 'Task') target = i.description || i.subagent_type || ''
  else if (name === 'Grep' || name === 'Glob') target = i.pattern || ''
  return squash(`${name}${target ? ' ' + target : ''}`)
}

export function modelName(model = '') {
  const m = model.toLowerCase()
  for (const n of ['haiku', 'sonnet', 'opus', 'fable']) if (m.includes(n)) return n[0].toUpperCase() + n.slice(1)
  return model || ''
}

