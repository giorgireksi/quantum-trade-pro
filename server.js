#!/usr/bin/env node
// Quantum Trade Pro — local backend
//
// Serves the app and proxies AI calls server-to-server, which eliminates the
// browser CORS problem entirely (the app talks to THIS server same-origin; THIS
// server talks to your AI provider directly). Your API key never leaves your
// machine.
//
// Usage:  node server.js          ->  http://localhost:8080
//         PORT=9000 node server.js
const http = require('http');
const fs = require('fs');
const path = require('path');
const PORT = Number(process.env.PORT) || 8080;
const FILE = path.join(__dirname, 'online_viewer_net (4).html');

const json = (res, code, obj) => { res.writeHead(code, {'Content-Type': 'application/json'}); res.end(JSON.stringify(obj)); };
const readBody = async (req) => { let b = ''; for await (const c of req) b += c; return b; };

// Call an OpenAI-compatible /chat/completions with per-key failover (401/403/429/5xx).
async function callProvider(baseUrl, model, apiKeys, messages, temperature){
  const keys = (Array.isArray(apiKeys) && apiKeys.length) ? apiKeys : [null];
  const base = String(baseUrl || '').replace(/\/+$/, '');
  if(!base) throw new Error('AI provider base URL is empty');
  if(!model) throw new Error('AI provider model is empty');
  let lastErr = null;
  for(const key of keys){
    const headers = { 'Content-Type': 'application/json' };
    if(key) headers['Authorization'] = 'Bearer ' + key;
    try{
      const r = await fetch(base + '/chat/completions', {
        method: 'POST', headers,
        body: JSON.stringify({ model, messages, temperature: temperature ?? 0.2 })
      });
      if(!r.ok){
        const txt = await r.text();
        const msg = 'HTTP ' + r.status + (txt ? ': ' + txt.slice(0, 300) : '');
        if(![401, 403, 429, 500, 502, 503, 504].includes(r.status)) throw new Error(msg);
        lastErr = new Error(msg);
        continue;
      }
      return await r.json();
    }catch(e){
      lastErr = e;
      if(!/HTTP (4|5)\d\d/.test(String(e && e.message))) break; // network error -> don't keep flipping keys
    }
  }
  throw lastErr || new Error('All API keys failed');
}

const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if(req.method === 'OPTIONS'){ res.writeHead(204); res.end(); return; }

  // Backend-mode detector used by the browser app.
  if(req.method === 'GET' && req.url === '/api/ping'){ json(res, 200, { ok: true, token: 'qpro' }); return; }

  // Proxy a chat-completions call (the main AI path).
  if(req.method === 'POST' && req.url === '/api/ai/chat'){
    let p; try{ p = JSON.parse(await readBody(req)); }catch(e){ return json(res, 400, { error: 'bad json' }); }
    try{
      const j = await callProvider(p.baseUrl, p.model, p.apiKeys, p.messages, p.temperature);
      console.log(new Date().toISOString(), 'ai/chat ok  model=' + p.model);
      json(res, 200, j);
    }catch(e){
      console.log(new Date().toISOString(), 'ai/chat err', e && e.message);
      json(res, 502, { error: String((e && e.message) || e) });
    }
    return;
  }

  // Test-connection helper (hits the provider's /models from the server side).
  if(req.method === 'POST' && req.url === '/api/ai/test'){
    let p; try{ p = JSON.parse(await readBody(req)); }catch(e){ return json(res, 400, { error: 'bad json' }); }
    try{
      const base = String(p.baseUrl || '').replace(/\/+$/, '');
      const headers = {};
      if(p.apiKey) headers['Authorization'] = 'Bearer ' + p.apiKey;
      const r = await fetch(base + '/models', { method: 'GET', headers });
      const txt = await r.text();
      json(res, 200, { status: r.status, ok: r.ok, body: txt.slice(0, 200) });
    }catch(e){
      json(res, 200, { ok: false, error: String((e && e.message) || e) });
    }
    return;
  }

  // Serve the app.
  if(req.method === 'GET' && (req.url === '/' || req.url === '/index.html')){
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(fs.readFileSync(FILE));
    return;
  }
  res.writeHead(404); res.end();
});

server.listen(PORT, () => console.log('Quantum Trade Pro running at http://localhost:' + PORT + '  (Ctrl+C to stop)'));