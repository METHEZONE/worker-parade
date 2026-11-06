# worker-parade

**Is my background agent still working, stuck, or done?**

Background coding agents (Claude Code subagents) run for minutes and say nothing. worker-parade shows every one of them at a glance: what it is, how long it has run, how many tools it used, and the last three things it did, as a live ticker.

![demo](docs/demo.gif)

*Sample data. Left: any terminal. Right: the Orca panel.*

```
⠋ Research dashboard references  Sonnet · general-purpose · demo
  working · 1m 12s · 11 tools
      Grep useSession
      Edit router.ts
    ▸ Bash Run unit tests
```

- Working, quiet (no transcript writes for 10+ minutes) or done, per worker.
- Last 3 actions per worker: `Read router.ts`, `Bash Run unit tests`, `WebSearch query…`
- Secret-looking strings (`sk-…`, `ghp_…`, `xox…`, bearer tokens, long hex/base64) are redacted. File contents and tool results are never read into the output.

## Install

**Any terminal** (tmux pane, VS Code / Cursor integrated terminal, plain shell). Node 18+.

```bash
npx github:METHEZONE/worker-parade watch     # live view
npx github:METHEZONE/worker-parade once      # print once
npx github:METHEZONE/worker-parade --json    # for scripts
```

From a clone: `node bin/parade.mjs watch`. Add `--demo` to try it with sample data. Ctrl-C quits.

**Claude Code plugin** (walking characters above the prompt, `/workers` toggles them):

```
/plugin marketplace add METHEZONE/worker-parade
/plugin install worker-parade@worker-parade
```

**Orca panel.** Copy `orca/` into Orca's plugins folder as `worker-parade/`, then keep the writer running:

```bash
node ~/orca/plugins/worker-parade/parade.mjs   # rewrites panel.html every 1.5s when something changes
```

The writer imports `../core`, so copy `core/` next to `orca/` (same layout as this repo).

## Zero token cost, local only

worker-parade never calls a model and never touches the network. It tails the transcript files Claude Code already writes to `~/.claude/projects/*/*/subagents/*.jsonl`, reading only the bytes appended since the last check, and renders what it finds. No dependencies, Node stdlib only. Nothing is uploaded, logged, or stored.

## How it works

```
core/activity.mjs   one tool call -> one short redacted line (pure)
core/parade.mjs     transcript scanner -> worker records
core/text.mjs       terminal renderer          -> bin/parade.mjs
orca/parade.mjs     panel.html writer          -> Orca panel
hooks/register.tsx  Claude Code plugin band    (uses core/activity.mjs)
```

## Develop

```bash
npm test                          # parser, redaction, scanner, renderer
claude plugin test .              # the Claude Code plugin's own tests
node tools/make-demo.mjs          # regenerate docs/demo.* (needs playwright + ffmpeg)
```

## Next

- Codex CLI (`~/.codex/sessions`): its rollout logs record tool calls too, but not a clean per-task "finished" marker, so it is not wired in yet.
- Other agent hosts via the same `core/` record shape.

## License

MIT
