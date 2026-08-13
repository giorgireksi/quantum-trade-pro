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

Open `online_viewer_net (4).html` directly. AI calls then hit the provider
from the browser, so the provider must allow browser requests (CORS). The app
tries direct first, then automatically falls back to a CORS proxy when blocked
and saves the working config. Endpoints that block ALL browser origins will
only work reliably in Backend mode (or with CORS enabled server-side).

## AI setup

⚙ Settings → AI Providers:
- Profile = name + protocol + base URL + model + API keys (one per line, failover order)
- Choose **Auto-detect** for most services. The backend supports OpenAI-compatible Chat Completions, OpenAI Responses, Anthropic Messages, and Google Gemini GenerateContent APIs.
- OpenAI-compatible covers OpenAI, NVIDIA NIM, OpenRouter, Groq, DeepSeek, Together, Mistral, xAI, Cline, Ollama, LM Studio, and other compatible gateways.
- Use the provider's **API base URL**, not its website URL. Examples:
  - OpenAI: `https://api.openai.com/v1`
  - OpenRouter: `https://openrouter.ai/api/v1`
  - Groq: `https://api.groq.com/openai/v1`
  - Ollama: `http://localhost:11434/v1`
  - LM Studio: `http://localhost:1234/v1`
- The backend automatically tries common `/v1`, `/api/v1`, and `/api` paths if the pasted root returns a 404.
- "Use CORS proxy": only relevant in single-file mode
- 🧪 Test connection: verifies the endpoint from whatever mode you're in
- The Model field has a searchable model picker. NVIDIA NIM's **↻ Models** button loads the live catalog securely through the local backend; if unavailable, a curated NVIDIA fallback list remains available.
- Multiple open tabs stay synchronized live with `BroadcastChannel`. Durable QPRO workspace state is server-owned and written atomically to `.qpro/workspace-state.json` through `/api/qpro/workspace`; clearing browser cache/storage does not remove settings, indicators, drawings, alerts, AI history/context, symbol/timeframe, or imported-symbol data. Legacy localStorage/IndexedDB data is read only once for migration.
- **Pi coding IDE agent** can run inside the AI assistant through the local backend. It uses Pi SDK sessions, the selected provider/model, editable system prompt, selected indicator notes/code, and the full coding tool set (`read`, `bash`, `edit`, `write`, `grep`, `find`, `ls`). Indicator work is isolated in `.qpro/pi-workspace/indicators/`; files are returned to the UI and still pass the platform validator before import.
- Pi's QPRO workspace and persistent sessions live under `.qpro/` in this project. Models, providers, authentication, settings, skills, and extensions come directly from the native Pi CLI under `~/.pi/agent/`. QPRO sessions and indicator files do not mix with other projects.
- QPRO now has one AI path: native Pi CLI. The former custom provider/API-key/CORS adapter is no longer used or served by `server.js`.
- The Pi chat uses SSE streaming with live assistant deltas, tool activity, compaction/retry lifecycle events, and `/api/pi/control` actions for Stop, Steer, Follow-up, and Compact. The browser is a Pi-style client over the native SDK session rather than a blocking chatbot.
- A project-local `qpro-pi-extension.ts` adds QPRO plan/checkpoint tools and `/qpro-status`/`/qpro-plan` commands. It is copied into `.qpro/pi-workspace/.pi/extensions/`, so it affects only QPRO and not other Pi projects.
- The embedded UI exposes thinking-level selection, native model controls, plan progress, session metadata, and the loaded Pi extension tools.
- Native session management is available through the slash palette: `/new`, `/resume`, `/fork`, `/clone`, `/tree`, and `/session`. `/resume` lists persisted QPRO Pi sessions; `/session` exposes entry IDs for branching/tree navigation; the backend uses Pi SessionManager APIs for replacement and branching.
- Risky built-in operations are automatically intercepted by the QPRO extension and require browser approval, while safe indicator edits remain frictionless.
- Added Pi resource inspection (`/api/pi/resources`) for skills, prompt templates, extensions, and load errors; a workspace Resources drawer exposes them.
- Added context/usage telemetry, optional chart screenshot vision input, and `qpro_get_chart_context`, which reads the latest structured symbol/timeframe/indicator context from `QPRO_CHART_CONTEXT.md`.
