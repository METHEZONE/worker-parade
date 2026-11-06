// Orca plugin worker: scans Claude Code subagent transcripts and answers the panel.
// The panel polls 'parade.workers'; nothing on disk changes, so Orca never reloads the panel.
// Local files only, no network, no model calls.
import { createScanner } from '../core/parade.mjs'

export default function activate(orca) {
  const collect = createScanner({ maxRows: 10 })
  orca.panels.handle('parade.workers', async () => collect())
}
