// Host-agnostic core: finds Claude Code subagent transcripts and turns them into
// plain worker records. Reads local files only. No network, no model calls.
import { closeSync, openSync, readFileSync, readSync, readdirSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import { activityLine, modelName, squash } from './activity.mjs'

export { activityLine, modelName, redact } from './activity.mjs'

export const PROJECTS = join(homedir(), '.claude', 'projects')
export const QUIET_MS = 10 * 60_000 // no transcript writes this long: not counted as working
export const KEEP_DONE_MS = 3 * 60_000
export const DROP_QUIET_MS = 30 * 60_000
export const KEEP_LINES = 3

// Folds one parsed JSONL record into the running state c. Pure; exported for tests.
export function applyRecord(c, d) {
  if (!c.startedAt && d.timestamp) c.startedAt = Date.parse(d.timestamp)
  const msg = d.message
  if (d.type !== 'assistant' || !msg) return c
  if (msg.model) c.model = msg.model
  for (const part of Array.isArray(msg.content) ? msg.content : []) {
    if (part?.type !== 'tool_use') continue
    c.tools += 1
    c.lastTool = part.name ?? ''
    c.lines.push(activityLine(c.lastTool, part.input))
    if (c.lines.length > KEEP_LINES) c.lines.shift()
  }
  return c
}

export const newState = () => ({ offset: 0, tools: 0, lastTool: '', model: '', startedAt: 0, rest: '', lines: [] })

// Parses a whole JSONL string (used by tests and one-shot reads).
export function parseTranscript(text) {
  const c = newState()
  for (const line of text.split('\n')) {
    if (!line) continue
    try {
      applyRecord(c, JSON.parse(line))
    } catch {}
  }
  return c
}

function safeReaddir(dir) {
  try {
    return readdirSync(dir)
  } catch {
    return []
  }
}

export function projectLabel(dir) {
  const parts = basename(dir).split('-').filter(Boolean)
  return parts.at(-1) || basename(dir)
}

// Reads only the bytes appended since the last call.
function follow(cache, path, size) {
  let c = cache.get(path) ?? newState()
  if (size < c.offset) c = newState()
  if (size > c.offset) {
    const fd = openSync(path, 'r')
    const buf = Buffer.alloc(size - c.offset)
    readSync(fd, buf, 0, buf.length, c.offset)
    closeSync(fd)
    c.offset = size
    const lines = (c.rest + buf.toString('utf8')).split('\n')
    c.rest = lines.pop() ?? ''
    for (const line of lines) {
      if (!line) continue
      try {
        applyRecord(c, JSON.parse(line))
      } catch {}
    }
  }
  cache.set(path, c)
  return c
}

// Scanner keeps its own caches so several hosts can each own one.
export function createScanner({ root = PROJECTS, maxRows = 10 } = {}) {
  const cache = new Map()
  let activeDirs = []
  let lastRescan = 0

  function rescan(now) {
    activeDirs = []
    for (const project of safeReaddir(root)) {
      const projectDir = join(root, project)
      for (const session of safeReaddir(projectDir)) {
        const sub = join(projectDir, session, 'subagents')
        try {
          if (now - statSync(sub).mtimeMs < 2 * 3600_000) activeDirs.push(sub)
        } catch {}
      }
    }
    lastRescan = now
  }

  return function collect(now = Date.now()) {
    if (now - lastRescan > 30_000) rescan(now)
    const workers = []
    for (const dir of activeDirs) {
      for (const file of safeReaddir(dir)) {
        if (!file.endsWith('.meta.json')) continue
        const jsonl = join(dir, file.replace('.meta.json', '.jsonl'))
        let meta, st
        try {
          meta = JSON.parse(readFileSync(join(dir, file), 'utf8'))
          st = statSync(jsonl)
        } catch {
          continue
        }
        const age = now - st.mtimeMs
        const status = meta.finished ? 'done' : age > QUIET_MS ? 'quiet' : 'running'
        if (status === 'done' && age > KEEP_DONE_MS) continue
        if (status === 'quiet' && age > DROP_QUIET_MS) continue
        const c = follow(cache, jsonl, st.size)
        workers.push({
          id: file.replace('.meta.json', ''),
          description: squash(meta.description || meta.agentType || 'worker', 80),
          type: meta.agentType || '',
          model: modelName(c.model || meta.model),
          project: projectLabel(dirname(dirname(dir))),
          startedAt: c.startedAt || st.birthtimeMs,
          endedAt: status === 'running' ? 0 : st.mtimeMs,
          tools: c.tools,
          lastTool: c.lastTool,
          lines: [...c.lines],
          status,
        })
      }
    }
    const rank = { running: 0, quiet: 1, done: 2 }
    workers.sort((a, b) => rank[a.status] - rank[b.status] || b.startedAt - a.startedAt)
    return workers.slice(0, maxRows)
  }
}

// Sample data for previews, docs and the demo video. Nothing here is real.
export function demoWorkers(now = Date.now(), step = 0) {
  const pool = [
    ['WebSearch', { query: 'terminal dashboard libraries' }],
    ['Read', { file_path: '/src/app/router.ts' }],
    ['Grep', { pattern: 'useSession' }],
    ['Edit', { file_path: '/src/app/router.ts' }],
    ['Bash', { description: 'Run unit tests' }],
    ['Bash', { command: 'npm run build' }],
    ['WebFetch', { url: 'https://example.com/docs/api?key=abc' }],
    ['Write', { file_path: '/docs/CHANGELOG.md' }],
  ]
  const lines = (offset, n) => Array.from({ length: n }, (_, k) => activityLine(...pool[(offset + step + k) % pool.length]))
  return [
    { id: 'a', description: 'Research dashboard references', type: 'general-purpose', model: 'Sonnet', project: 'demo', startedAt: now - 72_000, endedAt: 0, tools: 9 + step, lastTool: 'WebSearch', lines: lines(0, 3), status: 'running' },
    { id: 'b', description: 'Fix flaky login test', type: 'general-purpose', model: 'Haiku', project: 'demo', startedAt: now - 31_000, endedAt: 0, tools: 4 + step, lastTool: 'Bash', lines: lines(3, 3), status: 'running' },
    { id: 'c', description: 'Refactor settings page', type: 'general-purpose', model: 'Opus', project: 'demo', startedAt: now - 190_000, endedAt: now - 64_000, tools: 23, lastTool: 'Edit', lines: ['Edit settings.tsx', 'Bash Run unit tests', 'Write CHANGELOG.md'], status: 'done' },
  ]
}
