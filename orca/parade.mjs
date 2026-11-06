// Worker Parade: scans Claude Code subagent transcripts and rewrites panel.html,
// which Orca's dev-plugin watcher reloads into the side panel.
//   node parade.mjs           loop (launchd keeps it running)
//   node parade.mjs --once    write panel.html once and exit
//   node parade.mjs --demo    write a sample panel.html (for previews)
// ponytail: polls every 1.5s; switch to fs.watch if the scan ever shows up in Activity Monitor.
import { renameSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createScanner, demoWorkers } from '../core/parade.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const OUT = join(HERE, 'panel.html')
const TMP = join(dirname(HERE), '.worker-parade-panel.tmp') // outside the watched folder
const TICK_MS = 1500
const collect = createScanner({ maxRows: 10 })
let lastSig = ''

const esc = s => String(s).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch])

export function render(workers) {
  const running = workers.filter(w => w.status === 'running').length
  const done = workers.filter(w => w.status === 'done').length
  const rows = workers
    .map((w, i) => {
      const meta = [w.model, w.type, w.project].filter(Boolean).map(esc).join(' · ')
      const feed = w.lines.length ? `<div class="feed">${w.lines.map(l => `<div>${esc(l)}</div>`).join('')}</div>` : ''
      const label = { running: '', done: 'done · ', quiet: 'quiet · ' }[w.status]
      return `
  <li class="w ${w.status} m-${(w.model || 'x').toLowerCase()}">
    <div class="track"><div class="trail"></div>
      <div class="walker" style="animation-delay:-${(i * 1.7).toFixed(1)}s">
        <div class="buddy"><i class="eye l"></i><i class="eye r"></i><i class="foot l"></i><i class="foot r"></i></div>
        ${w.status === 'done' ? '<span class="spark">✓</span>' : ''}
      </div>
    </div>
    <div class="txt">
      <div class="desc">${esc(w.description)}</div>
      <div class="sub">${meta}</div>
      <div class="live">${label}<span class="t" data-start="${w.startedAt}" data-end="${w.endedAt}"></span> · ${w.tools} tools</div>
      ${feed}
    </div>
  </li>`
    })
    .join('')
  const empty = `
  <div class="empty"><div class="buddy sleep"><i class="eye l"></i><i class="eye r"></i></div><p>No background agents right now</p><small>They will walk around here when they start</small></div>`
  return `<!doctype html>
<html><head><meta charset="utf-8"><title>Worker Parade</title>
<style>
  :root { --fg: var(--foreground, #222); --mute: var(--muted-foreground, #888); --line: var(--border, #e5e5e5); --cardbg: var(--card, transparent); }
  body { margin: 0; padding: 12px 12px 16px; font: 13px/1.45 -apple-system, "Pretendard Variable", Pretendard, sans-serif; color: var(--fg); background: transparent; }
  header { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 10px; }
  header b { font-size: 13px; } header span { color: var(--mute); font-size: 11px; }
  ul { list-style: none; margin: 0; padding: 0; display: grid; gap: 8px; }
  .w { border: 1px solid var(--line); border-radius: 10px; padding: 8px 10px 9px; background: var(--cardbg); }
  .track { position: relative; height: 32px; margin-bottom: 4px; overflow: hidden; }
  .trail { position: absolute; left: 0; right: 0; bottom: 3px; height: 2px; background-image: radial-gradient(circle, var(--mute) 1px, transparent 1.5px); background-size: 8px 2px; opacity: .45; }
  .walker { position: absolute; bottom: 4px; left: 0; width: 100%; animation: stroll 7s linear infinite alternate; }
  .walker .buddy { animation: flip 14s steps(1) infinite; }
  .running .walker { animation-play-state: running; }
  .done .walker, .quiet .walker { animation: none; left: auto; right: 6px; width: auto; }
  @keyframes stroll { from { transform: translateX(0); } to { transform: translateX(calc(100% - 30px)); } }
  @keyframes flip { 0% { transform: scaleX(1); } 50% { transform: scaleX(-1); } }
  .buddy { position: relative; width: 26px; height: 20px; border-radius: 12px 12px 8px 8px; background: var(--c, #d97757); box-shadow: inset 0 -3px 0 rgba(0,0,0,.12); }
  .running .buddy { animation: bob .5s ease-in-out infinite; }
  .walker .buddy { display: inline-block; }
  @keyframes bob { 50% { margin-bottom: 3px; } }
  .eye { position: absolute; top: 6px; width: 3px; height: 5px; border-radius: 2px; background: #1a1a1a; animation: blink 4s infinite; }
  .eye.l { left: 7px; } .eye.r { right: 7px; }
  @keyframes blink { 0%, 92%, 100% { transform: scaleY(1); } 95% { transform: scaleY(.1); } }
  .foot { position: absolute; bottom: -3px; width: 7px; height: 4px; border-radius: 3px; background: var(--c, #d97757); filter: brightness(.8); }
  .foot.l { left: 4px; } .foot.r { right: 4px; }
  .running .foot.l { animation: step .5s ease-in-out infinite; } .running .foot.r { animation: step .5s ease-in-out infinite reverse; }
  @keyframes step { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-3px); } }
  .done .eye { height: 3px; top: 7px; border-radius: 3px 3px 0 0; background: none; border: 2px solid #1a1a1a; border-bottom: 0; width: 4px; animation: none; }
  .quiet .buddy { filter: grayscale(1) opacity(.6); } .quiet .eye { animation: none; height: 1.5px; top: 8px; }
  .spark { position: absolute; top: -2px; right: 30px; font-size: 11px; color: #3a9d5d; }
  .m-haiku { --c: #7cc79a; } .m-sonnet { --c: #8b8cf0; } .m-opus { --c: #d97757; } .m-fable { --c: #e58fb6; }
  .desc { font-weight: 600; } .sub, .live { color: var(--mute); font-size: 11.5px; } .live b { color: var(--fg); font-weight: 500; }
  .done .desc, .quiet .desc { color: var(--mute); font-weight: 500; }
  .empty { text-align: center; padding: 28px 0 12px; color: var(--mute); }
  .empty .buddy { margin: 0 auto 12px; --c: #c9c9c9; } .empty .eye { height: 1.5px; top: 8px; animation: none; }
  .empty .buddy::after { content: "z z"; position: absolute; top: -14px; right: -14px; font-size: 10px; color: var(--mute); animation: zz 2.4s ease-in-out infinite; }
  @keyframes zz { 50% { transform: translateY(-4px); opacity: .5; } }
  .empty p { margin: 0; color: var(--fg); } .empty small { font-size: 11px; }
  .feed { margin-top: 3px; font: 11px/1.35 ui-monospace, SFMono-Regular, Menlo, monospace; color: var(--mute); }
  .feed div { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; opacity: .55; }
  .feed div:last-child { opacity: 1; color: var(--fg); }
  .feed div:last-child::before { content: '▸ '; }
</style></head>
<body>
  <header><b>🐾 ${running} working${done ? ` · ${done} done` : ''}</b><span id="now"></span></header>
  ${workers.length ? `<ul>${rows}\n  </ul>` : empty}
<script>
  function fmt(ms) { var s = Math.max(0, Math.round(ms / 1000)); return s < 60 ? s + 's' : Math.floor(s / 60) + 'm ' + (s % 60) + 's'; }
  function tick() {
    var now = Date.now();
    document.querySelectorAll('.t').forEach(function (el) {
      var start = +el.dataset.start, end = +el.dataset.end;
      el.textContent = fmt((end || now) - start);
    });
    document.getElementById('now').textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  tick(); setInterval(tick, 1000);
</script>
</body></html>
`
}

function write(html) {
  writeFileSync(TMP, html)
  renameSync(TMP, OUT)
}

function once() {
  const workers = collect()
  // Elapsed time ticks in the page itself, so only a change in who/what rewrites the file.
  const sig = JSON.stringify(workers.map(w => [w.id, w.status, w.tools, w.lines.at(-1), w.model]))
  if (sig !== lastSig) {
    lastSig = sig
    write(render(workers))
  }
  return workers
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (process.argv.includes('--demo')) {
    const out = process.argv[process.argv.indexOf('--demo') + 1]
    const html = render(demoWorkers())
    out && !out.startsWith('--') ? writeFileSync(out, html) : write(html)
  } else if (process.argv.includes('--once')) {
    console.log(`${once().length} workers`)
  } else {
    once()
    setInterval(() => {
      try {
        once()
      } catch (e) {
        console.error(new Date().toISOString(), e)
      }
    }, TICK_MS)
  }
}
