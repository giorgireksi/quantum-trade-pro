'use strict';

// Quantum Trade Pro's embedded Pi IDE agent. Its resources, sessions, and
// working directory are deliberately app-local; the normal `pi` CLI and other
// projects continue using their own cwd, agent directory, and sessions.
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const PI_ROOT = '/home/reksi/.npm-global/lib/node_modules/@earendil-works/pi-coding-agent';
const pi = require(PI_ROOT);

const appRoot = __dirname;
const appData = path.join(appRoot, '.qpro');
const workspaceRoot = path.join(appData, 'pi-workspace');
const agentRoot = path.join(appData, 'pi-agent');
const sessionRoot = path.join(appData, 'pi-sessions');
const tempRoot = path.join(os.tmpdir(), 'quantum-trade-pro-pi-models');
for (const dir of [workspaceRoot, agentRoot, sessionRoot, tempRoot]) fs.mkdirSync(dir, {recursive:true});
const sessions = new Map();

const INDICATOR_CONTRACT = `# Quantum Trade Pro indicator workspace

This is an isolated coding workspace for custom indicators. Do not edit the
application HTML, server.js, or files outside this workspace.

## Indicator contract

An indicator is a JavaScript file under indicators/*.js. It must define:

    const SETTINGS = [{key, label, type, value, min, max, step, options}];
    function calculate(data, settings, MathTA) {
      return { lines: [{name, data:[{time, value}], color, width, pane, type}],
               markers: [{time, position, shape, color, text}],
               bands: [], levels: [], barColors: [] };
    }

Input data is an array of OHLCV bars: {time, open, high, low, close, volume}.
MathTA provides sma, ema, rsi, macd, atr, bb, stoch, stochrsi, cci, williams,
mfi, obv, vwap, adx, ichimoku, supertrend, keltner, parabolic, donchian,
series, change, roc, mom, tr, rma, highest, lowest, sum, mean, stdev, variance,
dev, median, percentile, wma, hma, linreg, crossover, crossunder, and cross.

Use only deterministic JavaScript. Return finite numeric values and preserve
bar times. A pane line uses pane:true. A main-chart line omits pane. Always
validate with the platform before applying a file to the chart.

When asked to create or modify an indicator, write a complete file in
indicators/<kebab-case-name>.js and explain what changed. When asked only a
question, answer normally. Keep private chain-of-thought hidden; provide a
short reasoning summary if useful.
`;
function cleanKey(value){ return String(value || '').trim().replace(/^Bearer\s+/i,'').replace(/^['"]|['"]$/g,''); }
function protocolFor(baseUrl, requested){
  if(requested && requested !== 'auto') return requested;
  const value = String(baseUrl || '').toLowerCase();
  if(value.includes('anthropic.com')) return 'anthropic';
  if(value.includes('generativelanguage.googleapis.com') || value.includes('googleapis.com')) return 'gemini';
  if(/\/responses(?:$|\?)/.test(value)) return 'responses';
  return 'openai';
}
function apiFor(protocol){
  return protocol === 'anthropic' ? 'anthropic-messages' : protocol === 'gemini' ? 'google-generative-ai' : protocol === 'responses' ? 'openai-responses' : 'openai-completions';
}
function sessionKey(payload){
  const p = payload.profile || {};
  return crypto.createHash('sha256').update(JSON.stringify({chatId:payload.chatId || 'default', baseUrl:p.baseUrl, model:p.model, protocol:p.protocol, systemPrompt:payload.systemPrompt || ''})).digest('hex').slice(0,24);
}
function safeChatDir(payload){ return path.join(sessionRoot, sessionKey(payload)); }
function modelConfig(id, profile, protocol){
  const dir = path.join(tempRoot, id); fs.mkdirSync(dir,{recursive:true});
  const model = String(profile.model || '').trim();
  const provider = {baseUrl:String(profile.baseUrl || '').replace(/\/+$/,''), api:apiFor(protocol), apiKey:'runtime-key', models:[{id:model,name:model,reasoning:true,input:['text'],contextWindow:200000,maxTokens:32768,compat:protocol === 'openai' ? {supportsDeveloperRole:false} : undefined}]};
  const modelsPath = path.join(dir,'models.json'); fs.writeFileSync(modelsPath,JSON.stringify({providers:{qpro:provider}}));
  return {modelsPath, authPath:path.join(dir,'auth.json')};
}
function ensureWorkspace(){
  fs.mkdirSync(path.join(workspaceRoot,'indicators'),{recursive:true});
  const contract = path.join(workspaceRoot,'INDICATOR_CONTRACT.md');
  if(!fs.existsSync(contract)) fs.writeFileSync(contract,INDICATOR_CONTRACT);
  const readme = path.join(workspaceRoot,'README.md');
  if(!fs.existsSync(readme)) fs.writeFileSync(readme,'# Pi Indicator Workspace\n\nEdit files in `indicators/`. The chart imports validated files from the Pi assistant.\n');
}
function textBlock(content){
  if(typeof content === 'string') return content;
  if(!Array.isArray(content)) return content == null ? '' : JSON.stringify(content);
  return content.map(x => typeof x === 'string' ? x : (x && (x.text || x.content) || '')).join('');
}
function promptWithHistory(messages){
  const usable=(messages || []).filter(m=>m && m.role !== 'system');
  return usable.length ? usable.map(m=>(m.role === 'assistant'?'Assistant: ':'User: ')+textBlock(m.content)).join('\n\n') : 'Open the indicator workspace and help me create or improve an indicator.';
}
function workspaceFiles(){
  ensureWorkspace(); const out=[];
  const walk=(dir)=>{ for(const ent of fs.readdirSync(dir,{withFileTypes:true})){ const p=path.join(dir,ent.name); if(ent.isDirectory()) walk(p); else if(/\.(js|md|json|txt)$/i.test(ent.name)){ const rel=path.relative(workspaceRoot,p); const stat=fs.statSync(p); out.push({path:rel,size:stat.size,mtime:stat.mtimeMs,content:fs.readFileSync(p,'utf8')}); } } };
  walk(workspaceRoot); return out;
}
async function createSession(payload){
  ensureWorkspace();
  const profile=payload.profile || {}; const protocol=protocolFor(profile.baseUrl,profile.protocol); const cfg=modelConfig(sessionKey(payload),profile,protocol);
  const runtime=await pi.ModelRuntime.create({modelsPath:cfg.modelsPath,authPath:cfg.authPath});
  const token=(Array.isArray(profile.apiKeys)?profile.apiKeys:[profile.apiKey]).map(cleanKey).find(Boolean); if(token) await runtime.setRuntimeApiKey('qpro',token);
  const model=runtime.getModel('qpro',String(profile.model || '').trim()); if(!model) throw new Error('Pi could not load model '+profile.model);
  const loader=new pi.DefaultResourceLoader({cwd:workspaceRoot,agentDir:agentRoot,systemPromptOverride:()=>String(payload.systemPrompt || 'You are a professional coding IDE agent.')+'\n\n'+INDICATOR_CONTRACT+'\n\nYou are operating inside the isolated QPRO indicator workspace. Use your coding tools normally, but never access or modify paths outside the workspace.'});
  await loader.reload();
  const sessionManager=pi.SessionManager.continueRecent(workspaceRoot,safeChatDir(payload));
  const {session}=await pi.createAgentSession({cwd:workspaceRoot,agentDir:agentRoot,model,modelRuntime:runtime,resourceLoader:loader,sessionManager,tools:['read','bash','edit','write','grep','find','ls'],noExtensions:true,noSkills:true,noPromptTemplates:true,noThemes:true,thinkingLevel:'medium'});
  return {session,runtime,model,protocol,initialized:session.messages && session.messages.length > 0};
}
async function runPiAgent(payload){
  const id=sessionKey(payload); let entry=sessions.get(id); if(!entry){entry=await createSession(payload);sessions.set(id,entry);}
  const events=[],textParts=[]; const unsubscribe=entry.session.subscribe(event=>{
    if(event.type==='tool_execution_start') events.push({type:'tool_start',tool:event.toolName});
    if(event.type==='tool_execution_end') events.push({type:'tool_end',tool:event.toolName,error:!!event.isError});
    if(event.type==='message_update' && event.assistantMessageEvent?.type==='text_delta') textParts.push(event.assistantMessageEvent.delta || '');
  });
  try{
    const workspace=payload.workspaceContext?'\n\nCURRENT TRADING CHART CONTEXT:\n'+payload.workspaceContext:'';
    const latest=[...(payload.messages || [])].reverse().find(m=>m && m.role==='user');
    const prompt=(entry.initialized?textBlock(latest && latest.content):promptWithHistory(payload.messages))+workspace+'\n\nUse the workspace tools when useful. If you create or modify an indicator, save it under indicators/ and report the relative path.';
    await entry.session.prompt(prompt); entry.initialized=true;
    let answer=textParts.join('');
    if(!answer){ for(let i=(entry.session.messages || []).length-1;i>=0;i--){ const m=entry.session.messages[i]; if(m && m.role==='assistant' && textBlock(m.content)){answer=textBlock(m.content);break;} } }
    if(!answer) throw new Error('Pi completed without an assistant response');
    return {content:answer,agent:'pi',protocol:entry.protocol,tools:events,files:workspaceFiles(),workspace:'isolated',sessionId:entry.session.sessionId};
  }finally{unsubscribe();}
}
function clearPiSession(chatId){ for(const [id,e] of sessions){ if(!chatId || id === chatId){try{e.session.dispose();}catch(_){} sessions.delete(id);} } }
module.exports={runPiAgent,clearPiSession,workspaceRoot,INDICATOR_CONTRACT};
