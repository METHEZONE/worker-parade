import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import { activityLine } from '../core/activity.mjs'
import type { Worker } from '../types'

const PANE = 'worker-parade'
// Bump the tag when Worker's fields change: older stored lists then read as empty.
const workers = atom({ plugin: 'worker-parade', key: 'workers' } as const, [], { shape: 'workers-2' })
const frame = atom({ plugin: 'worker-parade', key: 'frame' } as const, 0)
const isHidden = atom({ plugin: 'worker-parade', key: 'isHidden' } as const, false)

const TICK_MS = 450
const KEEP_DONE_MS = 90_000
const MAX_ROWS = 6

const FACES: Record<string, string> = { Haiku: '•ᴗ•', Sonnet: 'ᵔᴥᵔ', Opus: '◕ᴗ◕', Fable: '✧ᴗ✧' }

function modelName(model: string): string {
  const m = model.toLowerCase()
  if (m.includes('haiku')) return 'Haiku'
  if (m.includes('sonnet')) return 'Sonnet'
  if (m.includes('opus')) return 'Opus'
  if (m.includes('fable')) return 'Fable'
  return model || '?'
}

function since(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000))
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`
}

// One worker walking a track: footprints behind, legs swapping each frame.
function walk(w: Worker, i: number, f: number, width: number): string {
  const face = FACES[w.model] ?? '•ᴗ•'
  if (w.status === 'failed') return ' '.repeat(width - 6) + '(×_×)'
  if (w.status === 'done') return '·'.repeat(width - 6) + `(${face})✓`
  const sprite = f % 2 ? `ᕕ(${face})ᕗ` : `ᕙ(${face})ᕗ`
  const room = Math.max(1, width - 7)
  const pos = (f + i * 4) % room
  return '·'.repeat(pos) + sprite + ' '.repeat(room - pos)
}

async function setStatus($: EngineInterface) {
  const n = (await read($, workers)).filter(w => w.status === 'running').length
  $.ui.status(n ? `🐾 ${n} ${n === 1 ? 'worker' : 'workers'} running` : undefined)
}

async function finish($: EngineInterface, id: string, status: Worker['status']) {
  const now = await $.clock.now()
  let ended: Worker | undefined
  await update($, workers, list =>
    list.map(w => {
      if (w.id !== id || w.status !== 'running') return w
      ended = { ...w, status, endedAt: now }
      return ended
    }),
  )
  if (ended) {
    $.ui.toast(`${status === 'done' ? '✓' : '✗'} ${ended.description} · ${since(now - ended.startedAt)}`)
    await setStatus($)
  }
}

// Picks up agents this mod did not see start (spawned before it loaded) and
// ones that ended without a turn.complete (killed).
async function reconcile($: EngineInterface) {
  const live = await $.agent.list()
  const now = await $.clock.now()
  const known = new Set((await read($, workers)).map(w => w.id))
  const fresh = live
    .filter(a => !known.has(a.id) && ['pending', 'running', 'waiting'].includes(a.status))
    .map<Worker>(a => ({
      id: a.id, description: a.description || a.type, type: a.type, model: '',
      startedAt: now, tools: 0, lastTool: '', lines: [], status: 'running', endedAt: 0,
    }))
  if (fresh.length) await update($, workers, list => [...list, ...fresh])
  for (const a of live) {
    if (a.status === 'killed' || a.status === 'failed') await finish($, a.id, 'failed')
    if (a.status === 'completed') await finish($, a.id, 'done')
  }
  await update($, workers, list => list.filter(w => w.status === 'running' || now - w.endedAt < KEEP_DONE_MS))
  await setStatus($)
}

async function draw($: EngineInterface, e: Parameters<EngineInterface['ui']['resolve']>[0], columns: number, rows: number) {
  const list = await read($, workers)
  const f = await read($, frame)
  const now = await $.clock.now()
  const { Box, Text } = $.ui.resolve(e)
  const width = Math.max(10, Math.min(18, columns - 44))
  const shown = list.slice(-Math.max(1, Math.min(MAX_ROWS, rows)))

  return (
    <Box flexDirection="column">
      {shown.map((w, i) => {
        const isRunning = w.status === 'running'
        const took = since((isRunning ? now : w.endedAt) - w.startedAt)
        const detail = isRunning
          ? `${took} · tools ${w.tools}${w.lines.at(-1) ? ` · ${w.lines.at(-1)}` : w.lastTool ? ` · ${w.lastTool}` : ''}`
          : `${w.status === 'done' ? 'done' : 'stopped'} · ${took}`
        return (
          <Text dimColor={!isRunning} wrap="truncate-end">
            <Text color={isRunning ? 'claude' : undefined}>{walk(w, i, f, width)}</Text>
            {'  '}
            <Text bold={isRunning}>{w.description}</Text>
            {w.model ? ` (${w.model})` : ''}
            {'  '}
            <Text dimColor>{detail}</Text>
          </Text>
        )
      })}
    </Box>
  )
}

export const register: Register = on => {
  let ticker: { cancel: () => void } | undefined

  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'workers', description: 'Worker Parade: toggle the band above the prompt; /workers pane opens it as a pane' })
    ticker?.cancel()
    let n = 0
    ticker = $.clock.every(TICK_MS, () => {
      void (async () => {
        n += 1
        const list = await read($, workers)
        if (list.some(w => w.status === 'running')) await update($, frame, f => f + 1)
        if (n % 5 === 0 && list.length) await reconcile($)
      })()
    })
    await reconcile($)

    return next(e)
  })

  on('agent.spawn', async ($, e, next) => {
    const started = await next(e)
    if (started.agentId) {
      const w: Worker = {
        id: started.agentId, description: e.description || e.subagentType, type: e.subagentType,
        model: modelName(started.model), startedAt: await $.clock.now(), tools: 0, lastTool: '', lines: [],
        status: 'running', endedAt: 0,
      }
      // A resumed agent reuses its id: keep the original start time and tool count.
      await update($, workers, list => {
        const old = list.find(x => x.id === w.id)

        return [...list.filter(x => x.id !== w.id), old ? { ...w, startedAt: old.startedAt, tools: old.tools, lines: old.lines } : w]
      })
      await setStatus($)
    }

    return started
  })

  on('tool.call', async ($, e, next) => {
    const id = e.agentId
    if (id) {
      await update($, workers, list =>
        list.map(w => (w.id === id ? { ...w, tools: w.tools + 1, lastTool: String(e.tool), lines: [...w.lines, activityLine(String(e.tool), e)].slice(-3) } : w)),
      )
    }

    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    if (e.agentId) await finish($, e.agentId, e.reason === 'answer' ? 'done' : 'failed')

    return next(e)
  })

  on('command.run', { command: 'workers' }, async ($, e) => {
    if (e.args.trim() === 'pane') {
      await $.ui.open({ id: PANE, title: 'Worker Parade' })
      return { text: 'Opened the workers pane.' }
    }
    let hidden = false
    await update($, isHidden, v => (hidden = !v))

    return { text: hidden ? 'Worker band hidden. Run /workers to show it again.' : 'Worker band shown.' }
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const list = await read($, workers)
    if (e.props.hasSurvey || list.length === 0 || (await read($, isHidden))) return next(e)

    return draw($, e, e.props.bodyColumns, e.props.maxRows)
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const list = await read($, workers)
    if (list.length === 0) {
      const { Text } = $.ui.resolve(e)
      return <Text dimColor>No workers running.</Text>
    }

    return draw($, e, e.props.bodyColumns, (e.viewport?.rows ?? 24) - 4)
  })
}
