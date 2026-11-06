export type Worker = {
  id: string
  description: string
  type: string
  model: string
  startedAt: number
  tools: number
  lastTool: string
  lines: string[]
  status: 'running' | 'done' | 'failed'
  endedAt: number
}

declare module 'claude-code' {
  interface PluginState {
    'worker-parade': {
      workers: Shaped<Worker[]>
      frame: number
      isHidden: boolean
    }
  }
}
