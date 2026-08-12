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
