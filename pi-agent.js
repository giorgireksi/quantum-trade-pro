'use strict';

// Pi SDK adapter for Quantum Trade Pro. The browser remains the UI; Pi runs
// server-side so provider keys and read-only tools never enter browser code.
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const PI_ROOT = '/home/reksi/.npm-global/lib/node_modules/@earendil-works/pi-coding-agent';
const pi = require(PI_ROOT);

const sessions = new Map();
const tempRoot = path.join(os.tmpdir(), 'quantum-trade-pro-pi');
fs.mkdirSync(tempRoot, {recursive:true});

function protocolFor(baseUrl, requested){
  if(requested && requested !== 'auto') return requested;
  const value = String(baseUrl || '').toLowerCase();
  if(value.includes('anthropic.com')) return 'anthropic';
  if(value.includes('generativelanguage.googleapis.com') || value.includes('googleapis.com')) return 'gemini';
  if(/\/responses(?:$|\?)/.test(value)) return 'responses';
  return 'openai';
}
function apiFor(protocol){
  return protocol === 'anthropic' ? 'anthropic-messages'
    : protocol === 'gemini' ? 'google-generative-ai'
    : protocol === 'responses' ? 'openai-responses' : 'openai-completions';
}
function key(value){
  return String(value || '').trim().replace(/^Bearer\s+/i, '').replace(/^['"]|['"]$/g, '');
}
function sessionKey(payload){
  const profile = payload.profile || {};
  return crypto.createHash('sha256').update(JSON.stringify({
    chatId: payload.chatId || 'default', baseUrl: profile.baseUrl, model: profile.model,
    protocol: profile.protocol, systemPrompt: payload.systemPrompt || ''
  })).digest('hex').slice(0, 24);
}
function writeModelsConfig(id, profile, protocol){
  const dir = path.join(tempRoot, id);
  fs.mkdirSync(dir, {recursive:true});
  const model = String(profile.model || '').trim();
  const provider = {
    baseUrl: String(profile.baseUrl || '').replace(/\/+$/, ''),
    api: apiFor(protocol),
    apiKey: 'runtime-key',
    models: [{
      id: model, name: model, reasoning: false, input: ['text'],
      contextWindow: 200000, maxTokens: 16384,
      samplingParams: protocol === 'openai' && /integrate\.api\.nvidia\.com/i.test(String(profile.baseUrl))
        ? {top_p:0.95, max_tokens:16384, seed:42}
        : undefined,
      compat: protocol === 'openai' ? {supportsDeveloperRole:false} : undefined
    }]
  };
  const modelsPath = path.join(dir, 'models.json');
  fs.writeFileSync(modelsPath, JSON.stringify({providers:{qpro:provider}}));
  return {dir, modelsPath, authPath:path.join(dir, 'auth.json')};
}
function textBlock(content){
  if(typeof content === 'string') return content;
  if(!Array.isArray(content)) return content == null ? '' : JSON.stringify(content);
  return content.map(x => typeof x === 'string' ? x : (x && (x.text || x.content) || '')).join('');
}
function promptWithHistory(messages){
  const usable = (messages || []).filter(m => m && m.role !== 'system');
  if(!usable.length) return 'Please help with the current indicator workspace.';
  // The SDK owns the real agent session; this compact bridge keeps the browser
  // conversation available when a session is first created or resumed.
  return usable.map(m => (m.role === 'assistant' ? 'Assistant: ' : 'User: ') + textBlock(m.content)).join('\n\n');
}
async function createSession(payload){
  const profile = payload.profile || {};
  const protocol = protocolFor(profile.baseUrl, profile.protocol);
  const cfg = writeModelsConfig(sessionKey(payload), profile, protocol);
  const runtime = await pi.ModelRuntime.create({modelsPath:cfg.modelsPath, authPath:cfg.authPath});
  const token = (Array.isArray(profile.apiKeys) ? profile.apiKeys : [profile.apiKey]).map(key).find(Boolean);
  if(token) await runtime.setRuntimeApiKey('qpro', token);
  const model = runtime.getModel('qpro', String(profile.model || '').trim());
  if(!model) throw new Error('Pi could not load model ' + profile.model + ' for protocol ' + protocol);
  const loader = new pi.DefaultResourceLoader({
    cwd: path.dirname(__filename),
    agentDir: path.join(tempRoot, 'agent'),
    systemPromptOverride: () => String(payload.systemPrompt || 'You are a helpful indicator engineering assistant.')
  });
  await loader.reload();
  const {session} = await pi.createAgentSession({
    cwd: path.dirname(__filename), agentDir:path.join(tempRoot,'agent'), model, modelRuntime:runtime,
    resourceLoader:loader, sessionManager:pi.SessionManager.inMemory(),
    tools:['read','grep','find','ls'], noExtensions:true, noSkills:true, noPromptTemplates:true, noThemes:true,
    thinkingLevel:'medium'
  });
  return {session, runtime, model, protocol, initialized:false};
}
async function runPiAgent(payload){
  const id = sessionKey(payload);
  let entry = sessions.get(id);
  if(!entry){ entry = await createSession(payload); sessions.set(id,entry); }
  const events = [];
  const textParts = [];
  const unsubscribe = entry.session.subscribe(event => {
    if(event.type === 'tool_execution_start') events.push({type:'tool_start',tool:event.toolName});
    if(event.type === 'tool_execution_end') events.push({type:'tool_end',tool:event.toolName,error:!!event.isError});
    if(event.type === 'message_update' && event.assistantMessageEvent?.type === 'text_delta') textParts.push(event.assistantMessageEvent.delta || '');
  });
  try{
    const workspace = payload.workspaceContext ? '\n\nCURRENT TRADING WORKSPACE CONTEXT:\n' + payload.workspaceContext : '';
    const allMessages = (payload.messages || []).filter(m => m && m.role !== 'system');
    const latest = [...allMessages].reverse().find(m => m.role === 'user');
    const prompt = (entry.initialized ? textBlock(latest && latest.content) : promptWithHistory(payload.messages)) + workspace + '\n\nRespond to the latest user request. Preserve the platform indicator output protocol if code is requested.';
    await entry.session.prompt(prompt);
    entry.initialized = true;
    const messages = entry.session.messages || [];
    let answer = textParts.join('');
    if(!answer){
      for(let i=messages.length-1;i>=0;i--){
        if(messages[i] && messages[i].role === 'assistant'){
          answer = textBlock(messages[i].content);
          if(answer) break;
        }
      }
    }
    if(!answer) throw new Error('Pi completed without an assistant response');
    return {content:answer, agent:'pi', protocol:entry.protocol, tools:events};
  }finally{ unsubscribe(); }
}
function clearPiSession(chatId){
  for(const [id, entry] of sessions){
    if(!chatId || id.includes(String(chatId))){ try{entry.session.dispose();}catch(_){} sessions.delete(id); }
  }
}
module.exports = {runPiAgent, clearPiSession};
