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
// Accept either a raw token or a copied "Bearer <token>" value.
function cleanApiKey(value){
  return String(value || '').trim().replace(/^Bearer\s+/i, '').replace(/^['"]|['"]$/g, '');
}

// OpenAI-compatible providers commonly expose one of these roots. Users often
// paste the website root (for example https://openrouter.ai) instead of its API
// root (https://openrouter.ai/api/v1), so try the common paths automatically.
function apiRoots(baseUrl){
  const raw = String(baseUrl || '').trim().replace(/\/+$/, '');
  if(!raw) return [];
  if(/\/chat\/completions$/i.test(raw)) return [raw.replace(/\/chat\/completions$/i, '')];
  // An explicit API root must be used exactly as entered. In particular,
  // https://api.cline.bot/api/v1 must never become /api/v1/api/v1 or /api/v1/api.
  if(/\/(?:api\/)?v1$/i.test(raw) || /\/api$/i.test(raw)) return [raw];
  const roots = [raw, raw + '/v1', raw + '/api/v1', raw + '/api'];
  return [...new Set(roots)];
}

function compactProviderBody(text, contentType){
  const value = String(text || '').trim();
  if(/html/i.test(contentType || '') || /^<!doctype html|^<html/i.test(value)){
    return 'HTML page returned (this is probably a website URL, not the provider API URL)';
  }
  return value.replace(/\s+/g, ' ').slice(0, 240);
}

async function providerRequest(baseUrl, suffix, options){
  const roots = apiRoots(baseUrl);
  if(!roots.length) throw new Error('AI provider base URL is empty');
  let last = null;
  for(const root of roots){
    const url = root + suffix;
    try{
      const r = await fetch(url, options);
      const text = await r.text();
      if(r.ok) {
        let body;
        try { body = JSON.parse(text); } catch(e) {
          last = new Error('HTTP ' + r.status + ': provider returned non-JSON data at ' + url);
          continue;
        }
        return { response: r, body, url };
      }
      const msg = 'HTTP ' + r.status + (text ? ': ' + compactProviderBody(text, r.headers.get('content-type')) : '');
      last = new Error(msg + ' [' + url + ']');
      // 404 means the API path is wrong; try /v1 and /api/v1. Auth/rate/server
      // errors mean the endpoint was reached and should not be masked by another path.
      if(r.status !== 404) break;
    }catch(e){
      last = e;
      // A network error is not fixed by adding a path.
      break;
    }
  }
  throw last || new Error('Provider request failed');
}

// Call an OpenAI-compatible /chat/completions with per-key failover.
async function callProvider(baseUrl, model, apiKeys, messages, temperature){
  const keys = (Array.isArray(apiKeys) && apiKeys.length) ? apiKeys : [null];
  if(!model) throw new Error('AI provider model is empty');
  let lastErr = null;
  for(const key of keys){
    const headers = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'User-Agent': 'Quantum-Trade-Pro/1.0'
    };
    const token = cleanApiKey(key);
    if(token) headers['Authorization'] = 'Bearer ' + token;
    const payload = {
      model, messages, temperature: temperature ?? 0.2, stream: false
    };
    // NVIDIA DeepSeek V4 supports this OpenAI-compatible extension. Indicator
    // generation does not need hidden reasoning tokens, so disable them for a
    // fast, normal JSON completion.
    if(/^deepseek-ai\/deepseek-v4-/i.test(String(model))){
      payload.chat_template_kwargs = { enable_thinking: false };
    }
    try{
      const result = await providerRequest(baseUrl, '/chat/completions', {
        method: 'POST', headers,
        body: JSON.stringify(payload)
      });
      // Some OpenAI-compatible gateways wrap the completion in {data: ...}.
      // Normalize that here so the browser always receives choices at top level.
      const body = result.body && result.body.data && result.body.data.choices
        ? result.body.data : result.body;
      return body;
    }catch(e){
      lastErr = e;
      if(!/HTTP (401|403|429|500|502|503|504)/.test(String(e && e.message))) break;
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
      const headers = {};
      const token = cleanApiKey(p.apiKey);
      if(token) headers['Authorization'] = 'Bearer ' + token;
      const result = await providerRequest(p.baseUrl, '/models', { method: 'GET', headers });
      json(res, 200, { status: result.response.status, ok: true, url: result.url, body: result.body });
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