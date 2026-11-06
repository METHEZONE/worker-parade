#!/usr/bin/env node
// worker-parade: live view of background coding agents. Works in any terminal.
//   worker-parade watch   live view (default)
//   worker-parade once    print once and exit
//   worker-parade --json  print workers as JSON and exit
//   worker-parade --demo  use sample data
import { createScanner, demoWorkers } from '../core/parade.mjs'
import { renderText } from '../core/text.mjs'

const args = process.argv.slice(2)
const cmd = args.find(a => !a.startsWith('-')) ?? 'watch'
if (args.includes('-h') || args.includes('--help')) {
  console.log('usage: worker-parade [watch|once] [--json] [--demo]')
  process.exit(0)
}

const color = process.stdout.isTTY && !process.env.NO_COLOR
const collect = args.includes('--demo') ? () => demoWorkers(Date.now(), Math.floor(Date.now() / 2500) % 8) : createScanner()

if (args.includes('--json')) {
  console.log(JSON.stringify(collect(), null, 2))
} else if (cmd === 'once') {
  console.log(renderText(collect(), Date.now(), 0, process.stdout.columns || 100, color))
} else {
  let frame = 0
  process.stdout.write('\x1b[?25l')
  const quit = () => (process.stdout.write('\x1b[?25h\n'), process.exit(0))
  process.on('SIGINT', quit)
  process.on('SIGTERM', quit)
  const draw = () => {
    process.stdout.write('\x1b[H\x1b[J' + renderText(collect(), Date.now(), frame++, process.stdout.columns || 100, color) + '\n')
  }
  draw()
  setInterval(draw, 500)
}
