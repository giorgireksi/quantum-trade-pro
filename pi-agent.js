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
// Pi CLI's native catalog, credentials, settings, skills, and extensions.
// QPRO keeps only workspace and sessions local to this application.
const agentRoot = pi.getAgentDir();
const sessionRoot = path.join(appData, 'pi-sessions');
const tempRoot = path.join(os.tmpdir(), 'quantum-trade-pro-pi-models');
for (const dir of [workspaceRoot, agentRoot, sessionRoot, tempRoot]) fs.mkdirSync(dir, {recursive:true});
const sessions = new Map();
const activeChats = new Map();
const resourceStateFile = path.join(appData,'pi-resource-state.json');
function readResourceState(){ try{return JSON.parse(fs.readFileSync(resourceStateFile,'utf8'));}catch(_){return {disabled:{}};} }
function resourceKey(kind,name){ const value=String(name || ''); return kind==='extension' && /qpro-tools(?:\.ts)?$/i.test(value) ? 'qpro-tools' : value; }
function resourceIsEnabled(kind,name){ return readResourceState().disabled?.[kind]?.[resourceKey(kind,name)] !== true; }

const INDICATOR_CONTRACT = `# Quantum Trade Pro indicator engineering contract

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
  const settings=nativePiSettings();
  const modelKey=payload.piModel || ((settings.defaultProvider || '') + '/' + (settings.defaultModel || ''));
  // One browser conversation maps to one native Pi session. Model changes must
  // call setModel on that session, not silently select another recent session.
  return crypto.createHash('sha256').update(String(payload.chatId || 'default')).digest('hex').slice(0,24);
}
function safeChatDir(payload){ return path.join(sessionRoot, sessionKey(payload)); }
function nativePiSettings(){
  try{return JSON.parse(fs.readFileSync(path.join(agentRoot,'settings.json'),'utf8'));}catch(_){return {};}
}
function resolveNativeModel(runtime, requested){
  const settings=nativePiSettings();
  const wanted=String(requested || '').trim();
  if(wanted){
    const resolved=pi.resolveCliModel({cliModel:wanted,modelRuntime:runtime});
    if(resolved.model) return resolved.model;
    throw new Error(resolved.error || ('Pi model not found: ' + wanted));
  }
  const provider=String(settings.defaultProvider || '').trim();
  const modelId=String(settings.defaultModel || '').trim();
  if(provider && modelId){ const configured=runtime.getModel(provider,modelId); if(configured) return configured; }
  const available=runtime.getAvailableSnapshot ? runtime.getAvailableSnapshot() : [];
  if(available.length) return available[0];
  throw new Error('Pi CLI has no authenticated models. Configure a provider with `pi /login` or in ~/.pi/agent/auth.json.');
}
async function nativePiModels(){
  const runtime=await pi.ModelRuntime.create();
  return (await runtime.getAvailable()).map(m=>({provider:m.provider,id:m.id,name:m.name,reasoning:!!m.reasoning,input:m.input}));
}
const QPRO_ARCHITECTURE = `# QPRO architecture for indicator work

Quantum Trade Pro is a single-file browser trading platform served by server.js.
The browser owns chart state and rendering; Pi owns coding assistance. The
browser sends symbol, timeframe, selected indicator notes/code, and chat to
/api/pi/stream. The Node backend creates a native Pi SDK AgentSession and
streams response, tool activity, compaction, retry, and lifecycle events. The
/api/pi/control endpoint handles stop, steer, follow-up, and compaction.

Indicator lifecycle:
1. Pi reads AGENTS.md and INDICATOR_CONTRACT.md.
2. Pi creates or edits indicators/*.js in this workspace using normal coding tools.
3. The browser receives changed indicator files and sends them through the QPRO review/import boundary.
4. The browser validates with buildIndicatorRuntime(), performs a dry run against
   chartData, and only then offers Import or updates an existing indicator.
5. executeCustomIndicator() renders lines, panes, bands, levels, markers, and
   bar colors. State.customIndicators and workspace persistence retain the result.

Important browser functions:
- buildIndicatorRuntime / validateImportedCode: syntax and contract validation
- executeCustomIndicator: calculation and Lightweight Charts rendering
- aiImportMessage: validated import/update boundary
- State.customIndicators: saved custom indicator definitions
- buildMathTA: available technical-analysis helpers
- buildPiSystemPrompt: optional user instructions sent to Pi

Before consequential actions, use qpro_request_approval and wait for the user's decision. Use qpro_ask_user when an implementation choice is genuinely ambiguous. Do not bypass the browser validator or claim that a file is applied until the user imports it or the platform explicitly confirms the update.
`;
function writeChartContext(payload){
  const file=path.join(workspaceRoot,'QPRO_CHART_CONTEXT.md');
  const context=String(payload.workspaceContext || '').trim();
  if(context){
    const next='# Current chart context\n\n'+context+'\n';
    let previous=''; try{previous=fs.readFileSync(file,'utf8');}catch(error){if(error.code !== 'ENOENT') throw error;}
    if(previous !== next) fs.writeFileSync(file,next);
  } else try{fs.unlinkSync(file);}catch(error){if(error.code !== 'ENOENT') throw error;}
}
function latestPayloadText(payload){
  const latest=[...(payload?.messages || [])].reverse().find(m=>m && m.role==='user');
  return textBlock(latest?.content).trim();
}
function configureSessionTools(session,payload={}){
  const text=latestPayloadText(payload).toLowerCase();
  const explicitIndicator=payload.indicatorTask === true;
  const indicatorContract=explicitIndicator ? ' Read INDICATOR_CONTRACT.md before implementing an indicator, validate it, and save it under indicators/.' : '';
  const platformIntent=payload.needsPlatformContext === true || /\b(chart|symbol|timeframe|candle|ohlc|watchlist|alert|drawing|replay|layout|quote|price|market data|price data|indicator on (the )?chart|turn on|turn off|toggle|enable|disable|set .*timeframe)\b/i.test(text);
  const researchIntent=/\b(web search|search the web|research|sources?|citations?|latest news|news|website|url|youtube|github)\b/i.test(text);
  const sourceIntent=/\b(source|sources|citation|citations|verify|fact[- ]check|claim)\b/i.test(text);
  const fetchIntent=/\b(url|website|youtube|video|github|repository)\b/i.test(text);
  const codingAction=explicitIndicator || /\b(create|implement|modify|edit|fix|debug|refactor|write|build|code|javascript|typescript|pine ?script|file)\b/i.test(text);
  const workspaceRead=/\b(workspace|codebase|repository|repo|project files?|inspect files?|read files?)\b/i.test(text);
  const complex=/\b(subagent|sub-agent|delegate|parallel|team|multi[- ]step|complex)\b/i.test(text);
  const available=new Set(session.getAllTools().map(tool=>tool.name));
  const names=new Set();
  const add=(...items)=>items.forEach(name=>{if(available.has(name)) names.add(name);});
  if(codingAction || workspaceRead) add('read','grep','find','ls');
  if(codingAction) add('edit','write','bash');
  if(platformIntent) add('qpro_platform','qpro_ask_user');
  if(explicitIndicator) add('qpro_indicator_list','qpro_indicator_validate','qpro_indicator_import');
  if(researchIntent){
    if(fetchIntent) add('fetch_content','get_search_content');
    else if(sourceIntent) add('source_check','get_search_content');
    else add('web_search');
  }
  if(complex) add('subagent');
  // Keep ordinary conversation tool-free. This is intentional: tool schemas are
  // part of every model request and are unnecessary for greetings/explanations.
  session.setActiveToolsByName([...names]);
  return {tools:[...names],profile:{codingAction,platformIntent,researchIntent,sourceIntent,fetchIntent,explicitIndicator,complex},indicatorContract};
}
function ensureWorkspace(){
  fs.mkdirSync(path.join(workspaceRoot,'indicators'),{recursive:true});
  const extensionDir = path.join(workspaceRoot,'.pi','extensions');
  fs.mkdirSync(extensionDir,{recursive:true});
  const extensionSource = path.join(appRoot,'qpro-pi-extension.ts');
  const extensionTarget = path.join(extensionDir,'qpro-tools.ts');
  if(fs.existsSync(extensionSource) && resourceIsEnabled('extension','qpro-tools')) fs.copyFileSync(extensionSource,extensionTarget);
  else if(fs.existsSync(extensionTarget)) try{fs.unlinkSync(extensionTarget);}catch(_){}
  const agents = path.join(workspaceRoot,'AGENTS.md');
  if(!fs.existsSync(agents)) fs.writeFileSync(agents, [
    '# QPRO Pi Indicator Project', '',
    'You are the adaptive Pi platform assistant for Quantum Trade Pro. Work naturally across conversation, chart analysis, workspace inspection, platform control, and indicator engineering.', '',
    '## Scope',
    '- Do not assume every request is about indicators.',
    '- Use the smallest necessary QPRO platform capability only when needed or explicitly requested.',
    '- Work primarily inside this workspace and its indicators/ directory.',
    '- Do not modify the QPRO application HTML or backend unless the user explicitly asks for platform engineering.',
    '- For indicator changes, write complete JavaScript files under indicators/.',
    '- Explain changes briefly and mention files changed.', '',
    '## Indicator workflow',
    '1. Read INDICATOR_CONTRACT.md before creating or changing an indicator.',
    '2. Answer general questions and greetings normally; inspect or change the platform only when useful.',
    '3. Inspect related indicator files and use the coding tools normally.',
    '4. Validate the code against the platform contract before recommending import.',
    '5. Before consequential platform or file actions, use qpro_request_approval and wait for the user decision.',
    '6. Use qpro_ask_user when a meaningful design choice is ambiguous.',
    '7. Keep private chain-of-thought hidden; provide concise reasoning summaries only.', ''
  ].join('\\n'));
  const architecture = path.join(workspaceRoot,'QPRO_ARCHITECTURE.md');
  if(!fs.existsSync(architecture)) fs.writeFileSync(architecture,QPRO_ARCHITECTURE);
  const contract = path.join(workspaceRoot,'INDICATOR_CONTRACT.md');
  if(!fs.existsSync(contract)) fs.writeFileSync(contract,INDICATOR_CONTRACT);
  const readme = path.join(workspaceRoot,'README.md');
  if(!fs.existsSync(readme)) fs.writeFileSync(readme,'# QPRO Pi Platform Workspace\n\nThis workspace supports general conversation, chart analysis, platform control, workspace inspection, and indicator engineering. Use `indicators/` for validated custom indicators.\n');
}
ensureWorkspace();
function textBlock(content){
  if(typeof content === 'string') return content;
  if(!Array.isArray(content)) return content == null ? '' : JSON.stringify(content);
  return content.map(x => typeof x === 'string' ? x : (x && (x.text || x.content) || '')).join('');
}
function promptWithHistory(messages, maxChars=24000){
  const usable=(messages || []).filter(m=>m && m.role !== 'system' && (m.role === 'user' || m.role === 'assistant'));
  if(!usable.length) return 'You are starting a new QPRO conversation. Greet the user naturally and ask what they would like help with across the trading platform; do not assume they want an indicator.';
  const selected=[]; let chars=0;
  for(let i=usable.length-1;i>=0;i--){
    const m=usable[i]; const content=textBlock(m.content).trim();
    if(!content) continue;
    const line=(m.role === 'assistant'?'Assistant: ':'User: ')+content;
    if(selected.length && chars+line.length > maxChars) break;
    selected.unshift(line); chars += line.length;
  }
  const omitted=usable.length-selected.length;
  return (omitted ? `[Earlier conversation omitted for context efficiency: ${omitted} message(s)]\n\n` : '')+selected.join('\n\n');
}
function workspaceFiles(options={}){
  ensureWorkspace(); const out=[]; const includeContent=options.includeContent !== false; const maxContent=Number(options.maxContent || 120000);
  const walk=(dir)=>{ for(const ent of fs.readdirSync(dir,{withFileTypes:true})){ const p=path.join(dir,ent.name); if(ent.isDirectory()) walk(p); else if(/\.(js|md|json|txt)$/i.test(ent.name)){ const rel=path.relative(workspaceRoot,p); const stat=fs.statSync(p); const item={path:rel,size:stat.size,mtime:stat.mtimeMs}; if(includeContent && stat.size<=maxContent) item.content=fs.readFileSync(p,'utf8'); out.push(item); } } };
  walk(workspaceRoot); return out;
}
function changedWorkspaceFiles(before){
  const current=workspaceFiles({includeContent:true}); const map=new Map((before || []).map(f=>[f.path,Number(f.mtime||0)]));
  return current.filter(f=>!map.has(f.path)||Number(f.mtime||0)>map.get(f.path)+1);
}
async function createSession(payload){
  ensureWorkspace();
  writeChartContext(payload);
  const runtime=await pi.ModelRuntime.create();
  const model=resolveNativeModel(runtime,payload.piModel);
  const protocol=model.api;
  const settingsManager=pi.SettingsManager.create(workspaceRoot,agentRoot);
  const loader=new pi.DefaultResourceLoader({
    cwd:workspaceRoot,
    agentDir:agentRoot,
    settingsManager,
    // Preserve Pi CLI's native system prompt; QPRO is an appended project
    // instruction layer, not a replacement for Pi's tool/compaction prompt.
    appendSystemPromptOverride:(base)=>[...base, String(payload.systemPrompt || 'You are a professional coding IDE agent.')+'\n\nYou are operating inside the QPRO indicator workspace. Read AGENTS.md, INDICATOR_CONTRACT.md, and QPRO_ARCHITECTURE.md when relevant. Use your Pi coding tools normally. Do not claim a chart change is applied until the platform validator/import boundary confirms it.']
  });
  await loader.reload();
  const state=readResourceState();
  if(Array.isArray(loader.skills)) loader.skills=loader.skills.filter(x=>resourceIsEnabled('skill',x.name));
  if(Array.isArray(loader.prompts)) loader.prompts=loader.prompts.filter(x=>resourceIsEnabled('prompt',x.name));
  const sessionDir=safeChatDir(payload);
  let sessionManager;
  if(payload.sessionFile) sessionManager=pi.SessionManager.open(payload.sessionFile,sessionDir,workspaceRoot);
  else if(payload.forceNew) sessionManager=pi.SessionManager.create(workspaceRoot,sessionDir);
  else sessionManager=pi.SessionManager.continueRecent(workspaceRoot,sessionDir);
  const {session,extensionsResult}=await pi.createAgentSession({cwd:workspaceRoot,agentDir:agentRoot,model,modelRuntime:runtime,resourceLoader:loader,settingsManager,sessionManager,thinkingLevel:payload.piThinking || nativePiSettings().defaultThinkingLevel || 'medium'});
  configureSessionTools(session,payload);
  const commands=(extensionsResult.runtime.getCommands ? extensionsResult.runtime.getCommands() : []).map(command => ({name:command.name,description:command.description || '',source:command.source || 'extension',sourceInfo:command.sourceInfo ? {path:command.sourceInfo.path,scope:command.sourceInfo.scope,origin:command.sourceInfo.origin} : undefined}));
  return {session,runtime,model,protocol,commands,sessionManager,initialized:session.messages && session.messages.length > 0,telemetry:{startedAt:Date.now(),compactions:[],retries:[],subagents:new Map()}};
}
async function nativePiCommands(payload={}){ const entry=await sessionForPayload(payload); return entry.commands || []; }
function sessionStats(entry){
  let stats={}; try{stats=entry.session.getSessionStats() || {};}catch(_){}
  let contextUsage=null; try{contextUsage=entry.session.getContextUsage() || null;}catch(_){}
  const entries=entry.sessionManager.getEntries();
  const compactions=entries.filter(x=>x.type==='compaction').map(x=>({id:x.id,timestamp:x.timestamp,summary:String(x.summary || '').slice(0,240),tokensBefore:x.tokensBefore || null,usage:x.usage || null}));
  const branchSummaries=entries.filter(x=>x.type==='branch_summary').map(x=>({id:x.id,timestamp:x.timestamp,summary:String(x.summary || '').slice(0,240),usage:x.usage || null}));
  return {sessionFile:entry.session.sessionFile,sessionId:entry.session.sessionId,userMessages:stats.userMessages ?? entries.filter(x=>x.type==='message'&&x.message?.role==='user').length,assistantMessages:stats.assistantMessages ?? entries.filter(x=>x.type==='message'&&x.message?.role==='assistant').length,toolCalls:stats.toolCalls ?? 0,toolResults:stats.toolResults ?? 0,totalMessages:stats.totalMessages ?? entry.session.messages.length,tokens:stats.tokens || {},cost:stats.cost ?? 0,contextUsage:contextUsage || stats.contextUsage || null,compactions,branchSummaries,retries:entry.telemetry?.retries || [],subagents:[...(entry.telemetry?.subagents?.values?.() || [])]};
}
function createSubagentCancellationController(entry,id){
  return {cancel:()=>{const sub=entry.telemetry.subagents.get(id);if(sub)sub.status='cancel_requested';return false;}};
}
async function cancelPiSubagent(payload){
  const entry=sessions.get(sessionKey(payload)); if(!entry) return {ok:false,error:'No active Pi session'};
  const id=String(payload.subagentId || payload.toolCallId || ''); const sub=entry.telemetry.subagents.get(id); if(!sub) return {ok:false,error:'Subagent not found or already finished'};
  if(!sub.asyncDir) return {ok:false,error:'This foreground subagent has no independent public cancellation channel; async subagents can be cancelled independently.'};
  sub.status='cancel_requested';
  const control=path.join(sub.asyncDir,'control'); fs.mkdirSync(control,{recursive:true}); fs.writeFileSync(path.join(control,'stop.json'),JSON.stringify({type:'stop',ts:Date.now(),source:'qpro-dashboard',reason:payload.reason || 'Cancelled from QPRO dashboard'}));
  return {ok:true,subagentId:id,status:'cancel_requested',asyncId:sub.asyncId,parentContinues:true};
}
async function nativePiStatus(){
  const runs=[];
  for(const [chatId,item] of activeChats){
    const subagents=[...(item.entry.telemetry?.subagents?.values?.() || [])];
    runs.push({chatId,sessionId:item.entry.session.sessionId,model:item.entry.model.provider+'/'+item.entry.model.id,startedAt:item.startedAt,stopRequested:!!item.stopRequested,isStreaming:item.entry.session.isStreaming,isCompacting:item.entry.session.isCompacting,retryAttempt:item.entry.session.retryAttempt || 0,subagents,stats:sessionStats(item.entry)});
  }
  return {ok:true,runs,activeCount:runs.length};
}
async function nativePiResourceAction(payload={}){
  const action=String(payload.resourceAction || payload.action || ''); const kind=String(payload.kind || ''); const name=String(payload.name || '');
  const state=readResourceState(); state.disabled ||= {};
  if(action==='toggle' && kind && name){ state.disabled[kind] ||= {}; state.disabled[kind][resourceKey(kind,name)]=payload.enabled===false; fs.writeFileSync(resourceStateFile,JSON.stringify(state,null,2)); ensureWorkspace(); for(const item of sessions.values()){try{await item.session.reload();}catch(_){} } }
  if(action==='reload'){ ensureWorkspace(); for(const item of sessions.values()){try{await item.session.reload();}catch(_){} } }
  const resources=await nativePiResources(); for(const key of ['extensions','skills','prompts']) resources[key]=(resources[key]||[]).map(x=>({...x,kind:key.slice(0,-1),enabled:state.disabled[key.slice(0,-1)]?.[resourceKey(key.slice(0,-1),x.name)] !== true}));
  return {ok:true,resources,state,reloaded:action==='reload'||action==='toggle'};
}
async function nativePiResources(){
  const loader=new pi.DefaultResourceLoader({cwd:workspaceRoot,agentDir:agentRoot}); await loader.reload();
  const ext=loader.getExtensions();
  return {skills:(loader.getSkills()?.skills || []).map(x=>({name:x.name,description:x.description,path:x.filePath})),prompts:(loader.getPrompts()?.prompts || []).map(x=>({name:x.name,description:x.description,source:x.source})),extensions:(ext.extensions || []).map(x=>({name:x.name || x.path || 'extension'})),errors:(ext.errors || []).map(x=>String(x.error || x))};
}
async function nativePiSessionTree(file){
  const resolved=path.resolve(String(file || '')); if(!resolved.startsWith(path.resolve(sessionRoot)+path.sep)) throw new Error('Session path outside QPRO sessions');
  const manager=pi.SessionManager.open(resolved,path.dirname(resolved),workspaceRoot);
  const flat=[]; const visit=(node,parentId=null)=>{ if(!node) return; const x=node.entry || node; flat.push({id:x.id,parentId:x.parentId ?? parentId,type:x.type,role:x.message?.role || '',text:textBlock(x.message?.content).slice(0,180),label:node.label || '',children:(node.children || []).map(c=>(c.entry || c).id)}); for(const child of (node.children || [])) visit(child,x.id); }; for(const node of manager.getTree()) visit(node,null); return flat;
}
async function nativePiSessions(){
  const dirs=[sessionRoot];
  for(const entry of fs.readdirSync(sessionRoot,{withFileTypes:true})) if(entry.isDirectory()) dirs.push(path.join(sessionRoot,entry.name));
  const found=[];
  for(const dir of dirs){ try{ found.push(...await pi.SessionManager.list(workspaceRoot,dir)); }catch(_){} }
  found.sort((a,b)=>b.modified.getTime()-a.modified.getTime());
  return found.map((item,index)=>({index,file:item.file || item.path,id:item.id,name:item.name || '',cwd:item.cwd,modified:item.modified?.toISOString?.() || String(item.modified || ''),messageCount:item.messageCount || item.messages?.length || 0,firstMessage:item.firstMessage || ''}));
}
function sessionForPayload(payload){
  const id=sessionKey(payload); let entry=sessions.get(id);
  return entry ? Promise.resolve(entry) : createSession(payload).then(created=>{sessions.set(id,created);return created;});
}
function makePrompt(entry,payload){
  const workspace=payload.workspaceContext?'\n\nCURRENT TRADING CHART CONTEXT:\n'+String(payload.workspaceContext).slice(0,18000):'';
  const latest=[...(payload.messages || [])].reverse().find(m=>m && m.role==='user');
  const latestText=textBlock(latest && latest.content).trim();
  // Preserve slash commands exactly. Pi's AgentSession expands extension
  // commands, prompt templates, and skills when prompt() receives raw /… text.
  if(/^\/\S+/.test(latestText)) return latestText;
  const indicatorDirective=payload.indicatorTask ? '\n\nExplicit indicator task: read INDICATOR_CONTRACT.md, inspect only relevant indicator files, validate before proposing import, and never claim application until QPRO confirms it.' : '';
  return (entry.initialized ? latestText : promptWithHistory(payload.messages)) + workspace + indicatorDirective;
}
function summarizeToolValue(value){
  if(value == null) return null;
  if(typeof value === 'string') return value.slice(0,4000);
  if(Array.isArray(value)) return value.map(item=>summarizeToolValue(item)).slice(0,20);
  if(typeof value === 'object'){
    const out={}; for(const [key,item] of Object.entries(value).slice(0,30)){ if(/key|token|secret|authorization|password/i.test(key)) out[key]='[redacted]'; else out[key]=typeof item==='string'?item.slice(0,2000):summarizeToolValue(item); } return out;
  }
  return value;
}
function summarizeAgentMessage(message){
  return {stopReason:message.stopReason,usage:message.usage || null,content:(Array.isArray(message.content)?message.content:[]).map(item=>item.type==='text'?{type:'text',text:String(item.text || '').slice(0,6000)}:item.type==='thinking'?{type:'thinking',text:'[hidden]'}:item.type==='toolCall'?{type:'toolCall',name:item.name,id:item.id,arguments:summarizeToolValue(item.arguments)}:{type:item.type}).slice(0,30)};
}
function finalAssistantText(session, streamed){
  // Tool loops can contain several assistant messages. Native Pi renders those
  // as separate transcript entries; QPRO should return only the final answer,
  // not concatenate pre-tool narration with the settled response.
  for(let i=(session.messages || []).length-1;i>=0;i--){ const m=session.messages[i]; if(m && m.role==='assistant' && textBlock(m.content)) return textBlock(m.content); }
  return streamed || '';
}
async function streamPiAgent(payload, res){
  const chatId=String(payload.chatId || 'default');
  if(activeChats.has(chatId)) throw new Error('This Pi conversation is already running. Use Stop or follow-up.');
  const entry=await sessionForPayload(payload);
  writeChartContext(payload);
  configureSessionTools(entry.session,payload);
  const beforeWorkspaceFiles=workspaceFiles({includeContent:false});
  const textParts=[]; const toolEvents=[]; const transcript=[]; let closed=false; let latestUsage=null; const childControllers=new Map(); let turnIndex=-1; let messageIndex=0; let currentMessageId=null; let currentTranscript=null;
  const send=(type,data={})=>{ if(closed || res.destroyed) return; res.write('event: '+type+'\ndata: '+JSON.stringify({type,...data})+'\n\n'); };
  const unsubscribe=entry.session.subscribe(event=>{
    if(event.type==='turn_start'){ turnIndex=event.turnIndex ?? (turnIndex+1); send('turn_start',{turnIndex,timestamp:event.timestamp || Date.now()}); }
    else if(event.type==='message_start'){ currentMessageId='m_'+(++messageIndex); currentTranscript=event.message?.role==='assistant'?{messageId:currentMessageId,turnIndex,text:''}:null; if(currentTranscript) transcript.push(currentTranscript); send('message_start',{messageId:currentMessageId,role:event.message?.role || 'unknown',turnIndex}); }
    else if(event.type==='message_update'){
      const ae=event.assistantMessageEvent; const common={messageId:currentMessageId,turnIndex,contentIndex:ae?.contentIndex};
      if(ae?.type==='text_delta'){ const delta=ae.delta || ''; textParts.push(delta); if(currentTranscript) currentTranscript.text += delta; send('text_delta',{...common,delta}); }
      else if(ae?.type==='text_start') send('text_start',common);
      else if(ae?.type==='text_end') send('text_end',{...common,content:ae.content || ''});
      else if(ae?.type==='thinking_start') send('thinking_start',common);
      // Private chain-of-thought is intentionally not forwarded to the browser.
      // Native-style visibility is represented by thinking_start/end activity only.
      else if(ae?.type==='thinking_end') send('thinking_end',common);
      else if(ae?.type==='toolcall_start') send('toolcall_start',common);
      else if(ae?.type==='toolcall_delta') send('toolcall_delta',{...common,delta:ae.delta || ''});
      else if(ae?.type==='toolcall_end') send('toolcall_end',{...common,toolCall:ae.toolCall || null});
    }else if(event.type==='message_end'){
      send('message_end',{messageId:currentMessageId,turnIndex,role:event.message?.role || 'unknown'});
      if(event.message?.role==='assistant'){ latestUsage=event.message.usage || null; send('usage',{usage:latestUsage,stats:sessionStats(entry)}); }
    }else if(event.type==='tool_execution_start'){ const item={type:'tool_start',tool:event.toolName || 'tool',toolCallId:event.toolCallId,input:event.args || event.input || {},turnIndex}; toolEvents.push(item); if(item.tool==='subagent'){ entry.telemetry.subagents.set(item.toolCallId,{id:item.toolCallId,status:'running',startedAt:Date.now(),input:item.input}); childControllers.set(item.toolCallId,createSubagentCancellationController(entry,item.toolCallId)); send('subagent_start',{id:item.toolCallId,input:item.input}); } send('tool_start',item); }
    else if(event.type==='tool_execution_update') send('tool_update',{tool:event.toolName || 'tool',toolCallId:event.toolCallId,partial:summarizeToolValue(event.partialResult),turnIndex});
    else if(event.type==='tool_execution_end'){ const item={type:'tool_end',tool:event.toolName || 'tool',toolCallId:event.toolCallId,error:!!event.isError,result:summarizeToolValue(event.result),turnIndex}; toolEvents.push(item); if(item.tool==='subagent' && entry.telemetry.subagents.has(event.toolCallId)){const sub=entry.telemetry.subagents.get(event.toolCallId);const details=event.result?.details || event.result?.data?.details || {};if(details.asyncId)sub.asyncId=details.asyncId;if(details.asyncDir)sub.asyncDir=details.asyncDir;sub.status=item.error?(sub.status==='cancel_requested'?'cancelled':'error'):'complete';sub.finishedAt=Date.now();sub.error=item.error;childControllers.delete(event.toolCallId);send('subagent_end',{id:event.toolCallId,status:sub.status,asyncId:sub.asyncId});} send('tool_end',item); }
    else if(event.type==='agent_start') send('agent_start');
    else if(event.type==='agent_end') send('agent_end',{willRetry:event.willRetry !== false});
    else if(event.type==='agent_settled') send('agent_settled');
    else if(event.type==='turn_end') send('turn_end',{turnIndex,toolResults:(event.toolResults || []).map(summarizeToolValue)});
    else if(event.type==='compaction_start'){entry.telemetry.compactions.push({startedAt:Date.now(),reason:event.reason || 'automatic'});send('compaction_start',{message:'Pi is compacting context…',reason:event.reason});}
    else if(event.type==='compaction_end') send('compaction_end',{message:event.errorMessage || (event.aborted?'Context compaction aborted':'Context compaction complete'),reason:event.reason,result:event.result ? {summary:String(event.result.summary || '').slice(0,1000),tokensBefore:event.result.tokensBefore || null,estimatedTokensAfter:event.result.estimatedTokensAfter || null} : null,aborted:!!event.aborted,willRetry:!!event.willRetry,errorMessage:event.errorMessage});
    else if(event.type==='auto_retry_start'){entry.telemetry.retries.push({startedAt:Date.now(),attempt:event.attempt || entry.session.retryAttempt || 1,source:event.source || 'provider',error:event.errorMessage || ''});send('retry_start',{message:'Pi is retrying the provider request…',attempt:event.attempt || entry.session.retryAttempt || 1,maxAttempts:event.maxAttempts,delayMs:event.delayMs,errorMessage:event.errorMessage});}
    else if(event.type==='auto_retry_end') send('retry_end',{success:event.success,attempt:event.attempt,finalError:event.finalError});
    else if(event.type==='queue_update') send('queue_update',{steering:Array.isArray(event.steering)?event.steering.length:(event.steering || 0),followUp:Array.isArray(event.followUp)?event.followUp.length:(event.followUp || 0)});
  });
  activeChats.set(chatId,{entry,payload,send,stopRequested:false,startedAt:Date.now()});
  res.on('close',()=>{ const active=activeChats.get(chatId); if(active && !closed){ active.stopRequested=true; entry.session.abort().catch(()=>{}); } });
  send('session_start',{sessionId:entry.session.sessionId,sessionFile:entry.session.sessionFile,model:entry.model && (entry.model.provider+'/'+entry.model.id),activeTools:entry.session.getActiveToolNames()});
  try{
    await entry.session.prompt(makePrompt(entry,payload), payload.images?.length ? {images:payload.images} : undefined); entry.initialized=true;
    const content=finalAssistantText(entry.session,textParts.join(''));
    if(!content) throw new Error('Pi completed without an assistant response');
    const changedFiles=changedWorkspaceFiles(beforeWorkspaceFiles);
    send('done',{content,agent:'pi',protocol:entry.protocol,tools:toolEvents,transcript:transcript.filter(item=>item.text),activeTools:entry.session.getActiveToolNames(),files:workspaceFiles({includeContent:false}),changedFiles,workspace:'isolated',sessionId:entry.session.sessionId,sessionFile:entry.session.sessionFile,compaction:entry.session.isCompacting || false,usage:latestUsage});
  }catch(error){
    const active=activeChats.get(chatId);
    if(active?.stopRequested) send('aborted',{message:'Pi stopped'});
    else send('error',{error:String(error && error.message || error)});
  }finally{
    unsubscribe(); activeChats.delete(chatId); closed=true;
    if(!res.destroyed) res.end();
  }
}
async function runPiAgent(payload){
  let result;
  const fake={write(){},destroyed:false,end(){}};
  // Compatibility helper for non-stream callers/tests; the browser uses SSE.
  const entry=await sessionForPayload(payload); writeChartContext(payload); configureSessionTools(entry.session,payload); const beforeWorkspaceFiles=workspaceFiles({includeContent:false}); const textParts=[]; const unsubscribe=entry.session.subscribe(e=>{if(e.type==='message_update'&&e.assistantMessageEvent?.type==='text_delta')textParts.push(e.assistantMessageEvent.delta||'');});
  try{await entry.session.prompt(makePrompt(entry,payload),payload.images?.length ? {images:payload.images} : undefined);entry.initialized=true;const content=finalAssistantText(entry.session,textParts.join(''));return {content,agent:'pi',protocol:entry.protocol,activeTools:entry.session.getActiveToolNames(),changedFiles:changedWorkspaceFiles(beforeWorkspaceFiles),workspace:'isolated',sessionId:entry.session.sessionId};}finally{unsubscribe();}
}
async function replaceSession(chatId, payload){
  const id=sessionKey(payload); const old=sessions.get(id);
  if(old){ try{old.session.dispose();}catch(_){} sessions.delete(id); }
  const entry=await createSession(payload); sessions.set(id,entry);
  return {ok:true,action:payload.sessionAction,sessionId:entry.session.sessionId,sessionFile:entry.session.sessionFile,model:entry.model.provider+'/'+entry.model.id,thinking:entry.session.thinkingLevel,activeTools:entry.session.getActiveToolNames()};
}
async function nativeSessionOperation(payload){
  const chatId=String(payload.chatId || 'default');
  const entry=sessions.get(sessionKey(payload));
  const action=String(payload.sessionAction || payload.action || '');
  if(action==='new') return replaceSession(chatId,{...payload,forceNew:true});
  if(action==='resume') return replaceSession(chatId,{...payload,sessionFile:payload.sessionFile});
  if(!entry) return {ok:false,error:'No active Pi session'};
  if(action==='tree'){ const result=await entry.session.navigateTree(String(payload.entryId),{summarize:!!payload.summarize,customInstructions:payload.instructions || undefined}); return {ok:true,action,sessionId:entry.session.sessionId,cancelled:!!result.cancelled}; }
  if(action==='fork' || action==='clone'){
    const source=pi.SessionManager.open(entry.session.sessionFile,safeChatDir(payload),workspaceRoot);
    source.createBranchedSession(String(payload.entryId));
    const file=source.getSessionFile();
    return replaceSession(chatId,{...payload,sessionFile:file});
  }
  if(action==='list') return {ok:true,action,sessions:await nativePiSessions()};
  throw new Error('Unknown session action: '+action);
}
async function controlPiAgent(payload){
  const chatId=String(payload.chatId || 'default');
  const active=activeChats.get(chatId);
  const action=String(payload.action || '');
  if(!active && action==='compact'){
    const entry=await sessionForPayload(payload);
    await entry.session.compact(String(payload.text || '') || undefined);
    return {ok:true,action,sessionId:entry.session.sessionId};
  }
  if(!active && ['setModel','setThinking','sessionInfo'].includes(action)){
    const entry=await sessionForPayload(payload);
    if(action==='setModel'){ const model=resolveNativeModel(entry.runtime,payload.model); await entry.session.setModel(model); entry.model=model; entry.protocol=model.api; return {ok:true,action,model:model.provider+'/'+model.id}; }
    if(action==='setThinking'){ entry.session.setThinkingLevel(String(payload.level || 'medium')); return {ok:true,action,thinking:entry.session.thinkingLevel}; }
    return {ok:true,action,sessionId:entry.session.sessionId,sessionFile:entry.session.sessionFile,model:entry.model && entry.model.provider+'/'+entry.model.id,thinking:entry.session.thinkingLevel,messages:entry.session.messages.length,activeTools:entry.session.getActiveToolNames(),autoCompaction:entry.session.autoCompactionEnabled !== false,stats:sessionStats(entry),leafId:entry.sessionManager.getLeafId(),entries:entry.sessionManager.getEntries().map(x=>({id:x.id,type:x.type,role:x.message?.role || '',text:textBlock(x.message?.content).slice(0,100)}))};
  }
  if(!active) return {ok:false,error:'No active Pi run for this conversation'};
  if(action==='abort'){active.stopRequested=true;await active.entry.session.abort();return {ok:true,action};}
  if(action==='steer'){await active.entry.session.steer(String(payload.text || ''));return {ok:true,action};}
  if(action==='followUp'){await active.entry.session.followUp(String(payload.text || ''));return {ok:true,action};}
  if(action==='compact'){await active.entry.session.compact(String(payload.text || '') || undefined);return {ok:true,action};}
  if(action==='setModel'){ const model=resolveNativeModel(active.entry.runtime,payload.model); await active.entry.session.setModel(model); active.entry.model=model; active.entry.protocol=model.api; return {ok:true,action,model:model.provider+'/'+model.id}; }
  if(action==='setThinking'){ active.entry.session.setThinkingLevel(String(payload.level || 'medium')); return {ok:true,action,thinking:active.entry.session.thinkingLevel}; }
  if(action==='sessionInfo'){ return {ok:true,action,sessionId:active.entry.session.sessionId,sessionFile:active.entry.session.sessionFile,model:active.entry.model && active.entry.model.provider+'/'+active.entry.model.id,thinking:active.entry.session.thinkingLevel,messages:active.entry.session.messages.length,activeTools:active.entry.session.getActiveToolNames(),autoCompaction:active.entry.session.autoCompactionEnabled !== false,stats:sessionStats(active.entry),leafId:active.entry.sessionManager.getLeafId(),entries:active.entry.sessionManager.getEntries().map(x=>({id:x.id,type:x.type,role:x.message?.role || '',text:textBlock(x.message?.content).slice(0,100)}))}; }
  throw new Error('Unknown Pi control action: '+action);
}
function resolveChartRequest(requestId, result, error){
  const safe=String(requestId || '').replace(/[^a-zA-Z0-9_-]/g,'_'); if(!safe) throw new Error('requestId is required');
  const file=path.join(workspaceRoot,'.qpro-chart-request-'+safe+'.json'); if(!fs.existsSync(file)) throw new Error('Chart request is no longer pending');
  let current={}; try{current=JSON.parse(fs.readFileSync(file,'utf8'));}catch(_){}
  if(error) current.error=String(error); else current.result=result;
  fs.writeFileSync(file,JSON.stringify(current,null,2)); return {ok:true,requestId:safe};
}
function resolveApproval(approvalId, value){
  const safe=String(approvalId || '').replace(/[^a-zA-Z0-9_-]/g,'_');
  if(!safe) throw new Error('approvalId is required');
  const file=path.join(workspaceRoot,'.qpro-approval-'+safe+'.json');
  if(!fs.existsSync(file)) throw new Error('Approval request is no longer pending');
  let current={}; try{current=JSON.parse(fs.readFileSync(file,'utf8'));}catch(_){}
  if(current.type==='question') current.answer=value;
  else current.decision=value === 'approve' ? 'approve' : 'reject';
  fs.writeFileSync(file,JSON.stringify(current,null,2));
  return {ok:true,approvalId:safe};
}
function clearPiSession(chatId){ for(const [id,e] of sessions){ if(!chatId || id === chatId){try{e.session.dispose();}catch(_){} sessions.delete(id);} } }
module.exports={runPiAgent,streamPiAgent,controlPiAgent,clearPiSession,workspaceRoot,INDICATOR_CONTRACT,nativePiModels,nativePiSettings,nativePiCommands,nativePiSessions,nativePiSessionTree,nativePiResources,nativePiStatus,nativePiResourceAction,nativeSessionOperation,cancelPiSubagent,resolveApproval,resolveChartRequest};
