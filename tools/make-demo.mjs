// Renders docs/demo.gif + docs/demo.mp4 from SAMPLE data only (core/parade.mjs demoWorkers).
// Dev tool, not shipped: needs `playwright` (with chromium) and `ffmpeg` on PATH.
//   node tools/make-demo.mjs
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createRequire } from 'node:module'
import { demoWorkers } from '../core/parade.mjs'
import { renderText } from '../core/text.mjs'
import { render } from '../orca/parade.mjs'

const require = createRequire(import.meta.url)
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright')
const FPS = 10, STEP_MS = 1500, STEPS = 8
const now = 1_800_000_000_000
const ansi = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/\x1b\[(\d+)m([^\x1b]*)\x1b\[0m/g, (_, c, t) => (c === '1' ? `<b>${t}</b>` : c === '2' ? `<i>${t}</i>` : `<span class="c${c}">${t}</span>`))
const panelBody = html => html.replace(/^[\s\S]*?<body>/, '').replace(/<script>[\s\S]*$/, '')
const css = html => html.match(/<style>([\s\S]*?)<\/style>/)[1]

const base = render(demoWorkers(now, 0))
const page = `<!doctype html><meta charset="utf-8"><style>
body{margin:0;background:#16161a;color:#e8e8ea;display:flex;gap:28px;padding:28px;font-family:-apple-system,Helvetica,sans-serif;width:1144px;height:564px;box-sizing:border-box}
h2{margin:0 0 10px;font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#8b8b95;font-weight:600}
.term{flex:1.25;background:#0d0d10;border-radius:12px;padding:18px 20px;border:1px solid #2a2a30}
pre{margin:0;font:13px/1.45 ui-monospace,Menlo,monospace;white-space:pre}
i{color:#7d7d88;font-style:normal}.c32{color:#6fcf97}.c35{color:#a5a6ff}.c33{color:#f0935f}
.panel{flex:1;--fg:#e8e8ea;--mute:#8b8b95;--line:#2a2a30;--cardbg:#1d1d22}
${css(base).replace(/body\s*\{[^}]*\}/, '')}
.panel .w{margin-bottom:8px}
</style><div class="term"><h2>any terminal: npx worker-parade</h2><pre id="t"></pre></div>
<div class="panel"><h2>Orca panel</h2><div id="p"></div></div>`

const dir = mkdtempSync(join(tmpdir(), 'wp-demo-'))
const browser = await chromium.launch()
const pg = await browser.newPage({ viewport: { width: 1144, height: 564 } })
await pg.setContent(page)
await pg.evaluate(h => { document.getElementById('p').innerHTML = h }, panelBody(base).replace(/<header>[\s\S]*?<\/header>/, ''))
let n = 0
for (let step = 0; step < STEPS; step++) {
  const ws = demoWorkers(now + step * STEP_MS, step)
  await pg.evaluate(([t, feeds, tools, times]) => {
    document.getElementById('t').innerHTML = t
    document.querySelectorAll('#p li').forEach((li, i) => {
      li.querySelector('.feed').innerHTML = feeds[i].map(l => `<div>${l.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</div>`).join('')
      const sec = Math.round(times[i] / 1000)
      li.querySelector('.t').textContent = sec < 60 ? `${sec}s` : `${Math.floor(sec / 60)}m ${sec % 60}s`
      li.querySelector('.live').lastChild.textContent = ` · ${tools[i]} tools`
    })
  }, [ansi(renderText(ws, now + step * STEP_MS, step, 76, true)), ws.map(w => w.lines), ws.map(w => w.tools), ws.map(w => (w.endedAt || now + step * STEP_MS) - w.startedAt)])
  for (let f = 0; f < (STEP_MS / 1000) * FPS; f++) {
    await pg.screenshot({ path: join(dir, `f${String(n++).padStart(4, '0')}.png`) })
    await pg.waitForTimeout(1000 / FPS)
  }
}
await browser.close()
mkdirSync(new URL('../docs', import.meta.url).pathname, { recursive: true })
const out = new URL('../docs/', import.meta.url).pathname
const inp = ['-y', '-framerate', String(FPS), '-i', join(dir, 'f%04d.png')]
execFileSync('ffmpeg', [...inp, '-vf', 'scale=1144:-2,format=yuv420p', '-c:v', 'libx264', '-crf', '20', join(out, 'demo.mp4')], { stdio: 'ignore' })
execFileSync('ffmpeg', [...inp, '-vf', 'fps=10,scale=860:-1:flags=lanczos,split[a][b];[a]palettegen[p];[b][p]paletteuse', join(out, 'demo.gif')], { stdio: 'ignore' })
rmSync(dir, { recursive: true })
console.log('wrote docs/demo.mp4 and docs/demo.gif')
