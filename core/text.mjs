// Plain-text renderer for terminals. Pure: returns a string.
const MODEL_COLOR = { Haiku: 32, Sonnet: 35, Opus: 33, Fable: 95 }
const SPIN = '⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏'

const fmt = ms => {
  const s = Math.max(0, Math.round(ms / 1000))
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, '0')}s`
}

export function renderText(workers, now, frame = 0, width = 100, color = false) {
  const paint = (code, s) => (color ? `\x1b[${code}m${s}\x1b[0m` : s)
  const cut = (s, n = width) => (s.length > n ? s.slice(0, n - 1) + '…' : s) // cut plain text before painting, never escape codes
  const running = workers.filter(w => w.status === 'running').length
  const out = [paint(1, `worker-parade  ${running} working · ${workers.length - running} idle/done`), '']
  if (!workers.length) out.push(paint(2, 'No background agents right now.'))
  for (const w of workers) {
    const mark = { running: paint(MODEL_COLOR[w.model] ?? 36, SPIN[frame % SPIN.length]), done: paint(32, '✓'), quiet: paint(2, '◌') }[w.status]
    const took = fmt((w.endedAt || now) - w.startedAt)
    const state = { running: 'working', done: 'done', quiet: 'quiet (no writes for 10m+)' }[w.status]
    out.push(`${mark} ${paint(1, cut(w.description, width - 40))}  ${paint(2, cut([w.model, w.type, w.project].filter(Boolean).join(' · '), 36))}`)
    out.push(`  ${paint(2, `${state} · ${took} · ${w.tools} tools`)}`)
    w.lines.forEach((l, i) => out.push(`    ${paint(i === w.lines.length - 1 ? 0 : 2, cut((i === w.lines.length - 1 ? '▸ ' : '  ') + l, width - 4))}`))
    out.push('')
  }
  return out.join('\n')
}
