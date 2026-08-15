# Quantum Trade Pro — run modes

## Backend mode

A tiny Node server that serves the chart app and owns workspace/indicator files.

```bash
./open_qpro.sh          # starts the server and opens the browser
./stop_qpro.sh          # stops the server
```

```bash
node server.js          # → http://localhost:8080
# or:  PORT=9000 node server.js
```

Requires Node 18+ (bundled `fetch`). Keep the browser tab open while coding CLIs act on the chart.

## Coding CLIs (Cursor, Claude Code, Codex, …)

There is no in-app agent. Use the repo from any coding CLI.

Live chart actions (draw, candles, symbol/timeframe, alerts) apply immediately:

```bash
node qpro-platform.js list_operations
node qpro-platform.js get_state
node qpro-platform.js get_data '{"bars":200}'
node qpro-platform.js create_drawing '{"type":"horizontal","role":"support","points":[{"time":1700000000,"price":65000}]}'
node qpro-platform.js move_drawing '{"id":"...","timeDelta":900,"priceDelta":100}'
node qpro-platform.js create_drawing '{"type":"vprofile","points":[{"time":1700000000,"price":65000},{"time":1700100000,"price":64000}],"settings":{"rows":30,"valueArea":70}}'
node qpro-platform.js create_drawing '{"type":"anchoredvwap","points":[{"time":1700000000,"price":65000}],"settings":{"source":"hlc3","bands":[1,2]}}'
```

Indicator files are the only import source. Validate, then Apply in the browser:

```bash
node qpro-indicator-check.js indicators/<name>.js
node qpro-indicator-check.js indicators/<name>.js --live --bars 200 --warmup 50
```

Read `AGENTS.md`, `QPRO_AGENT_WORKFLOW.md`, and `QPRO_INDICATOR_CONTRACT.md`.

Durable QPRO workspace state is server-owned at `.qpro/workspace-state.json`. Clearing browser cache does not remove settings, drawings, alerts, symbol/timeframe, or imported-symbol data. Indicator source stays in `.qpro/pi-workspace/indicators/`.
