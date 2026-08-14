# Quantum Trade Pro — run modes

## 1. Backend mode (recommended — fixes ALL AI/CORS problems)

A tiny Node server that serves the app and proxies AI calls server-to-server.
The browser talks to your own machine (same origin → no CORS at all), and your
machine talks to your AI provider directly. Your API key never leaves your
computer.

For separate open and close actions:

```bash
./open_qpro.sh          # starts the server and opens the browser
./stop_qpro.sh          # stops the server
```

The original `qpro.sh` toggle is also available if preferred.

```bash
node server.js          # → http://localhost:8080
# or:  PORT=9000 node server.js
```

Requires Node 18+ (bundled `fetch`). The app auto-detects backend mode
(`/api/ping`) and routes all AI calls through it — the chat header shows
"🖥 Backend". Everything else works identically; IndexedDB/clipboard also work
natively here.

## 2. Single-file mode (file://)

Always run QPRO through `./open_qpro.sh`; the browser UI connects to the local native Pi backend.

## AI setup

Open the AI Assistant and select ⚙ Pi settings:
- Choose a native Pi CLI model and thinking level.
- Native Pi owns providers, authentication, skills, extensions, prompts, and model discovery through `~/.pi/agent/`.
- QPRO adds only minimal task-scoped platform context and the lazy semantic platform gateway; Pi remains native by default.
- "Use CORS proxy": only relevant in single-file mode
- 🧪 Test connection: verifies the endpoint from whatever mode you're in
- The Model field has a searchable model picker. NVIDIA NIM's **↻ Models** button loads the live catalog securely through the local backend; if unavailable, a curated NVIDIA fallback list remains available.
- Multiple open tabs stay synchronized live with `BroadcastChannel`. Durable QPRO workspace state is server-owned and written atomically to `.qpro/workspace-state.json` through `/api/qpro/workspace`; clearing browser cache/storage does not remove settings, indicators, drawings, alerts, AI history/context, symbol/timeframe, or imported-symbol data. Legacy localStorage/IndexedDB data is read only once for migration.
- **Pi coding IDE agent** runs inside the AI assistant through the local backend using native Pi SDK sessions, providers, history, compaction, resources, skills, extensions, and the full coding tool set. QPRO adds only task-scoped indicator and chart instructions. Indicator work is isolated in `.qpro/pi-workspace/indicators/`; files are the only import source and still pass the platform validator before explicit Apply.
- Pi's QPRO workspace and persistent sessions live under `.qpro/` in this project. Models, providers, authentication, settings, skills, and extensions come directly from the native Pi CLI under `~/.pi/agent/`. QPRO sessions and indicator files do not mix with other projects.
- QPRO now has one AI path: native Pi CLI. The former custom provider/API-key/CORS adapter is no longer used or served by `server.js`. Indicator code blocks in chat are informational only; file-based import is the sole supported path.
- The Pi chat uses SSE streaming with live assistant deltas, tool activity, compaction/retry lifecycle events, and `/api/pi/control` actions for Stop, Steer, Follow-up, and Compact. The browser is a Pi-style client over the native SDK session rather than a blocking chatbot.
- A project-local `qpro-pi-extension.ts` adds the QPRO platform gateway, indicator validation, backups, and `/qpro-status`. It is copied into `.qpro/pi-workspace/.pi/extensions/`, so it affects only QPRO and not other Pi projects.
- The embedded UI exposes thinking-level selection, native model controls, session metadata, and the loaded Pi extension tools.
- Native session management is available through the slash palette: `/new`, `/resume`, `/fork`, `/clone`, `/tree`, and `/session`. `/resume` lists persisted QPRO Pi sessions; `/session` exposes entry IDs for branching/tree navigation; the backend uses Pi SessionManager APIs for replacement and branching.
- QPRO runs normal isolated workspace and platform actions directly. Indicator source files remain separate from chat output. `node qpro-indicator-check.js indicators/<name>.js` provides a fast local preflight; live browser validation plus explicit Apply remain required before reaching the chart.
- Added Pi resource inspection (`/api/pi/resources`) for skills, prompt templates, extensions, and load errors; a workspace Resources drawer exposes them.
- Added context/usage telemetry, optional chart screenshot vision input, and `qpro_get_chart_context`, which reads the latest structured symbol/timeframe/indicator context from `QPRO_CHART_CONTEXT.md`.
