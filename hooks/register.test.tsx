import { expect, mock, test } from 'claude-code/testing'

const BAND = {
  plugin: 'worker-parade',
  component: 'AbovePrompt',
  props: {
    hasSurvey: false,
    isWorking: true,
    maxRows: 8,
    bodyColumns: 100,
    scroll: { offset: 0, bodyRows: 8 },
    view: {},
  },
} as const

test('a spawned worker walks above the prompt, then shows done', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000 })
  on('command.register', () => ({ value: { command: 'workers' } }))
  on('agent.list', () => ({ value: [] }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('agent.spawn', () => ({ model: 'claude-sonnet-5-5', agentId: 'a1' }))
  on('tool.call', () => ({ result: {} }))
  on('turn.complete', () => ({ text: '' }))

  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await $.agent.spawn({ prompt: 'look', description: 'Research X references', subagentType: 'general-purpose', tool_use_id: 't1' } as never)
  await $.tool.call({ tool: 'Bash', command: 'ls', agentId: 'a1' })
  await clock.advance(5_000)

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...BAND, surface })
    const row = await ui.find({ type: 'Text', text: /Research X references/ })
    expect(row?.text).toMatch(/ᕗ/)
    expect(row?.text).toMatch(/Sonnet/)
    expect(row?.text).toMatch(/tools 1 · Bash/)
    await ui.unmount()
  }

  await $.turn.complete({ agentId: 'a1', reason: 'answer', answer: 'ok' } as never)
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  const row = await ui.find({ type: 'Text', text: /Research X references/ })
  expect(row?.text).toMatch(/done/)
  await ui.unmount()
})

test('nothing is drawn when no worker ran', async ($, on) => {
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>engine</Text>
  })
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect((await ui.find({ type: 'Text', text: /engine/ }))?.text).toBe('engine')
  await ui.unmount()
})
