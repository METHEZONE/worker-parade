import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { activityLine, createScanner, parseTranscript, redact } from '../core/parade.mjs'

const fixture = readFileSync(new URL('./fixtures/subagent.jsonl', import.meta.url), 'utf8')

test('activityLine: file tools show basename only', () => {
  assert.equal(activityLine('Read', { file_path: '/a/b/c/router.ts' }), 'Read router.ts')
  assert.equal(activityLine('Edit', { file_path: 'C:\\x\\y\\z.tsx', old_string: 'secret body' }), 'Edit z.tsx')
})

test('activityLine: Bash prefers description, else truncated command', () => {
  assert.equal(activityLine('Bash', { description: 'Run tests', command: 'npm t' }), 'Bash Run tests')
  const long = activityLine('Bash', { command: 'x'.repeat(200).replace(/(.{8})/g, '$1 ') })
  assert.ok(long.length <= 60 && long.endsWith('…'))
})

test('activityLine: web and agent tools', () => {
  assert.equal(activityLine('WebSearch', { query: 'node test' }), 'WebSearch node test')
  assert.equal(activityLine('WebFetch', { url: 'https://e.com/p?token=abc#x' }), 'WebFetch https://e.com/p')
  assert.equal(activityLine('Task', { description: 'Check docs' }), 'Task Check docs')
  assert.equal(activityLine('Mystery', { anything: 1 }), 'Mystery')
})

test('redact: strips secret-shaped strings', () => {
  for (const s of ['sk-abcdef1234567890', 'ghp_abcdefghijklmnop12', 'xoxb-1234-abcdef', 'Bearer abcdefgh12345678', 'a'.repeat(40), 'deadbeef'.repeat(5), 'API_KEY=hunter2hunter2']) {
    assert.ok(!redact(`x ${s} y`).includes(s.split('=').at(-1)), s)
  }
  assert.equal(redact('plain words only'), 'plain words only')
})

test('parseTranscript: counts tools, keeps last 3 lines, never leaks results or secrets', () => {
  const c = parseTranscript(fixture)
  assert.equal(c.tools, 5)
  assert.equal(c.model, 'claude-sonnet-5-5')
  assert.equal(c.startedAt, Date.parse('2026-01-01T10:00:00.000Z'))
  assert.equal(c.lines.length, 3)
  assert.equal(c.lines.at(-1), 'Agent Check the docs')
  const all = JSON.stringify(c)
  for (const leak of ['SECRET FILE CONTENTS', 'ghp_abc', 'abcdefghijklmnop1234', 'long secret prompt']) assert.ok(!all.includes(leak), leak)
})

test('scanner: finds a running and a finished worker in a fake projects dir', () => {
  const root = mkdtempSync(join(tmpdir(), 'wp-'))
  const sub = join(root, '-home-dev-app', 'session1', 'subagents')
  mkdirSync(sub, { recursive: true })
  for (const [id, finished] of [['agent-run', false], ['agent-done', true]]) {
    writeFileSync(join(sub, `${id}.jsonl`), fixture)
    writeFileSync(join(sub, `${id}.meta.json`), JSON.stringify({ description: id, agentType: 'general-purpose', finished }))
  }
  const ws = createScanner({ root })(Date.now())
  assert.deepEqual(ws.map(w => [w.id, w.status, w.tools, w.model, w.project]), [
    ['agent-run', 'running', 5, 'Sonnet', 'app'],
    ['agent-done', 'done', 5, 'Sonnet', 'app'],
  ])
  assert.equal(ws[0].lines.length, 3)
  // a transcript untouched for 11 minutes reads as quiet, not running
  const old = new Date(Date.now() - 11 * 60_000)
  utimesSync(join(sub, 'agent-run.jsonl'), old, old)
  assert.equal(createScanner({ root })(Date.now()).find(w => w.id === 'agent-run').status, 'quiet')
})

test('renderText: shows the ticker, marks the newest line, no color when disabled', async () => {
  const { renderText } = await import('../core/text.mjs')
  const out = renderText(parseTranscript(fixture) && [{ description: 'Sample task', type: 'general-purpose', model: 'Sonnet', project: 'demo', startedAt: 0, endedAt: 0, tools: 5, lines: ['Read a.ts', 'Bash Run tests', 'Agent Check docs'], status: 'running' }], 5000, 0, 80)
  assert.match(out, /Sample task/)
  assert.match(out, /▸ Agent Check docs/)
  assert.ok(!out.includes('\x1b['))
})
