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
const sessionPromises = new Map();
let modelRuntimePromise = null;
function sharedModelRuntime(){
  if(!modelRuntimePromise) modelRuntimePromise=pi.ModelRuntime.create().catch(error=>{modelRuntimePromise=null;throw error;});
  return modelRuntimePromise;
}
const activeChats = new Map();
const streamLocks = new Set();
const modelChangeLocks = new Map();
async function withModelChangeLock(chatId, fn){
  const key=String(chatId || 'default');
  const previous=modelChangeLocks.get(key) || Promise.resolve();
  const current=previous.catch(()=>{}).then(fn);
  modelChangeLocks.set(key,current);
  try{return await current;}finally{if(modelChangeLocks.get(key)===current)modelChangeLocks.delete(key);}
}
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
function modelSelection(payload={}){
  const requested=String(payload.piModel || '').trim();
  const explicit=payload.modelSelection==='explicit' || payload.piModelExplicit===true || (payload.modelSelection===undefined && requested.length>0);
  if(explicit && !requested) throw new Error('Explicit model selection is empty');
  return {mode:explicit?'explicit':'native-default',requested:explicit?requested:''};
}
function modelLabel(model){return model ? String(model.provider||'')+'/'+String(model.id||'') : '';}
function thinkingSelection(payload={}){
  const requested=String(payload.piThinking || '').trim();
  const explicit=payload.thinkingSelection==='explicit' || payload.piThinkingExplicit===true || (payload.thinkingSelection===undefined && requested.length>0);
  if(explicit && !requested) throw new Error('Explicit thinking selection is empty');
  return {mode:explicit?'explicit':'native-default',requested:explicit?requested:''};
}
function nativeThinkingLevel(){return String(nativePiSettings().defaultThinkingLevel || 'medium');}
function sessionKey(payload){
  // One browser conversation maps directly to one native Pi session. QPRO does
  // not create a separate translation lane or parallel hidden conversation.
  return crypto.createHash('sha256').update(String(payload.chatId || 'default')).digest('hex').slice(0,24);
}
function safeChatDir(payload){ return path.join(sessionRoot, sessionKey(payload)); }
function safeSessionFile(file){
  const resolved=path.resolve(String(file || ''));
  const root=path.resolve(sessionRoot)+path.sep;
  if(!resolved.startsWith(root) || !/\.jsonl$/i.test(resolved)) throw new Error('Session path outside QPRO sessions');
  return resolved;
}
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
  const runtime=await sharedModelRuntime();
  return (await runtime.getAvailable()).map(m=>({provider:m.provider,id:m.id,name:m.name,reasoning:!!m.reasoning,input:m.input}));
}
const QPRO_ARCHITECTURE = `# QPRO architecture for indicator work

Quantum Trade Pro is a single-file browser trading platform served by server.js.
The browser owns chart state and rendering; Pi owns coding assistance. The
browser sends symbol, timeframe, selected indicator file references/notes, and chat to
/api/pi/stream. The Node backend creates a native Pi SDK AgentSession and
streams response, tool activity, compaction, retry, and lifecycle events. The
/api/pi/control endpoint handles stop, steer, follow-up, and compaction.

Indicator lifecycle:
1. Pi reads AGENTS.md and INDICATOR_CONTRACT.md.
2. Pi creates or edits indicators/*.js in this workspace using normal coding tools.
3. The browser receives changed indicator files and exposes them through the Indicator Files panel. Saved files are the only import source and pass through the QPRO validation/Apply boundary.
4. The browser validates with buildIndicatorRuntime(), performs a dry run against
   chartData, and only then offers explicit Apply or updates an existing registration.
5. executeCustomIndicator() renders lines, panes, bands, levels, markers, and
   bar colors. State.customIndicators and workspace persistence retain the result.

Important browser functions:
- buildIndicatorRuntime / validatePiIndicatorCode: syntax and contract validation
- executeCustomIndicator: calculation and Lightweight Charts rendering
- Indicator Files panel: saved-file validation and explicit Apply boundary
- State.customIndicators: saved custom indicator definitions
- buildMathTA: available technical-analysis helpers
- buildPiSystemPrompt: optional user instructions sent to Pi

Execute normal workspace and platform actions directly in the isolated QPRO environment. Do not pause for interactive approval. Do not bypass the browser validator or claim that a file is applied until the user explicitly applies it or the platform confirms the update.
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
function containsPineSource(value){
  const text=String(value || '').trim();
  return /\/\/\s*@version\s*=|\b(?:indicator|strategy|study|plot|plotshape|plotchar|barcolor|hline|bgcolor)\s*\(|\b(?:ta|math|input)\.[A-Za-z_]\w*\s*\(|\b(?:open|high|low|close|volume)\s*=>/i.test(text)
    && !/^(?:please|can you|could you|what|how|why)\b/i.test(text);
}
function shouldUseDirectPineLane(payload={}){
  const latest=latestPayloadText(payload);
  const users=(payload.messages || []).filter(m=>m?.role==='user');
  const hasSource=containsPineSource(latest);
  const asksTranslate=/\b(?:translate|translation|convert|port|rewrite)\b[\s\S]{0,300}\b(?:pine|tradingview|pinescript|pine\s*script)\b|\b(?:pine|tradingview|pinescript|pine\s*script)\b[\s\S]{0,300}\b(?:translate|translation|convert|port|rewrite)\b/i.test(latest);
  const followUp=/\b(?:translate|convert|port|rewrite)\b/i.test(latest) && users.some(m=>m!==users.at(-1) && containsPineSource(m.content));
  return hasSource || asksTranslate || followUp;
}
function normalizePiPayload(input={}){
  const payload={...input};
  // The browser sends the selected model and selection mode explicitly.
  // Never inherit a stale chat model or provider fallback silently.
  if(!Object.prototype.hasOwnProperty.call(payload,'piModel')) payload.piModel='';
  if(!Object.prototype.hasOwnProperty.call(payload,'modelSelection')) payload.modelSelection=String(payload.piModel||'').trim()?'explicit':'native-default';
  if(payload.forceNew) delete payload.sessionFile;
  delete payload.indicatorFastLane;
  delete payload.indicatorRequestId;
  if(shouldUseDirectPineLane(payload)){
    // Pine translation is file-first: Pi writes the translated indicator in
    // indicators/*.js so the browser can validate and apply that file.
    payload.indicatorOutputOnly=false;
    payload.indicatorTask=true;
    payload.workspaceIndicatorEdit=true;
    payload.indicatorFileOnly=true;
    payload.intentText='create an indicator file from the supplied Pine source';
    payload.needsPlatformContext=false;
    payload.workspaceContext='';
  }
  return payload;
}
function capabilityProfile(payload={}, text=''){
  const value=String(payload.intentText || text || '').trim().toLowerCase();
  const explicitIndicator=payload.indicatorTask === true;
  const indicatorEditIntent=explicitIndicator && (payload.workspaceIndicatorEdit===true || (/(?:indicator|pine|script|calculate|mathta|settings|code|file)/i.test(value) && /\b(?:create|implement|modify|edit|fix|debug|refactor|change|update|save|write|add|remove|delete|rewrite|repair)\b/i.test(value)));
  const indicatorDiagnosticIntent=explicitIndicator && (payload.workspaceIndicatorDiagnostic===true || (/(?:indicator|pine|script|calculate|mathta|settings|code|file)/i.test(value) && /\b(?:error|bug|broken|invalid|fail(?:s|ed|ure)?|issue|problem|wrong|diagnos)/i.test(value)));
  const translationIntent=/\b(?:translate|translation|convert)\b[\s\S]{0,100}\b(?:pine|tradingview|pinescript|pine\s*script)\b|\b(?:pine|tradingview|pinescript|pine\s*script)\b[\s\S]{0,100}\b(?:translate|translation|convert)\b/i.test(value);
  const selected=payload.selectedIndicatorContext === true;
  // Pine translation is a deterministic no-tool lane. Never let a
  // translation request drift into chart probing, web research, or workspace
  // inspection. If source code is missing, the model should simply ask for it.
  if(translationIntent && !payload.needsPlatformContext && !payload.indicatorFileOnly) return {mode:'output-only',explicitIndicator:true,translationIntent};
  const platformIntent=payload.needsPlatformContext === true || /\b(chart|symbol|timeframe|candle|ohlc|watchlist|alert|drawing|replay|layout|quote|price|market data|price data|indicator on (the )?chart|turn on|turn off|toggle|enable|disable|set .*timeframe)\b/i.test(value);
  const researchIntent=/\b(web search|search the web|research|sources?|citations?|latest news|news|website|url|youtube|github)\b/i.test(value);
  const sourceIntent=/\b(source|sources|citation|citations|verify|fact[- ]check|claim)\b/i.test(value);
  const fetchIntent=/\b(url|website|youtube|video|github|repository)\b/i.test(value);
  const analysisIntent=/\b(explain|compare|contrast|analy[sz]e|review|describe|summari[sz]e|understand|difference|how does)\b/i.test(value);
  const outputIntent=/\b(return|show|give|generate|write|rewrite|fix|combine|merge|compose|convert|translate|improve|optimi[sz]e|refactor|create|build)\b/i.test(value);
  const fileIntent=/\b(file|workspace|folder|directory|save|write to|create .*\.js|under indicators|inspect files?|read files?|codebase|repository|repo)\b/i.test(value);
  const shellIntent=/\b(run|execute)\b[^\n]{0,30}\b(command|shell|terminal|bash|npm|node|script)\b|\b(shell|terminal|bash|npm|node)\b/i.test(value);
  const writeIntent=/\b(create|implement|modify|edit|fix|debug|refactor|write|build|change|update|save|remove|delete)\b/i.test(value);
  const validationIntent=/\b(validate|validation|test|dry[- ]?run|check the code|import|apply)\b/i.test(value);
  const workspaceRead=/\b(workspace|codebase|repository|repo|project files?|inspect files?|read files?)\b/i.test(value);
  const complex=/\b(subagent|sub-agent|delegate|parallel|team|multi[- ]step|complex)\b/i.test(value);
  // Inline selected code and image input need no tools. A request to explain,
  // compare, or return revised code stays a normal model turn unless the user
  // explicitly asks Pi to inspect/save files or operate the chart.
  const inlineOnly=(selected || analysisIntent || (explicitIndicator && outputIntent && !fileIntent)) && !indicatorEditIntent && !indicatorDiagnosticIntent && !platformIntent && !researchIntent && !shellIntent && !validationIntent && !fileIntent;
  if(inlineOnly) return {mode:'output-only',explicitIndicator,selected,analysisIntent,outputIntent};
  return {mode:'automatic',explicitIndicator,selected,platformIntent,researchIntent,sourceIntent,fetchIntent,analysisIntent,outputIntent,fileIntent: fileIntent || indicatorEditIntent || indicatorDiagnosticIntent,shellIntent,writeIntent,validationIntent: validationIntent || indicatorDiagnosticIntent,workspaceRead,indicatorEditIntent,indicatorDiagnosticIntent,complex};
}
function configureSessionTools(session,payload={}){
  const text=latestPayloadText(payload).toLowerCase();
  const profile=capabilityProfile(payload,text);
  const available=new Set(session.getAllTools().map(tool=>tool.name));
  // Native Pi remains authoritative for tool selection. QPRO only adds the
  // isolated workspace and indicator validation boundary; it does not hide
  // native tools based on a local intent classifier.
  session.setActiveToolsByName([...available]);
  return {tools:[...available],profile,indicatorContract:profile.explicitIndicator ? ' Use the QPRO indicator file and validation boundary.' : ''};
}
function ensureWorkspace(options={}){
  fs.mkdirSync(path.join(workspaceRoot,'indicators'),{recursive:true});
  if(options.minimal === true) return;
  const extensionDir = path.join(workspaceRoot,'.pi','extensions');
  fs.mkdirSync(extensionDir,{recursive:true});
  const extensionSource = path.join(appRoot,'qpro-pi-extension.ts');
  const extensionTarget = path.join(extensionDir,'qpro-tools.ts');
  if(fs.existsSync(extensionSource) && resourceIsEnabled('extension','qpro-tools')) fs.copyFileSync(extensionSource,extensionTarget);
  else if(fs.existsSync(extensionTarget)) try{fs.unlinkSync(extensionTarget);}catch(_){}
  const agents = path.join(workspaceRoot,'AGENTS.md');
  if(!fs.existsSync(agents)) fs.writeFileSync(agents, [
    '# QPRO Pi Workspace', '',
    'This is a normal isolated Pi project. Use native Pi behavior, session history, tools, resources, skills, extensions, compaction, and model settings.', '',
    '## QPRO boundaries',
    '- Work in this workspace; do not modify the QPRO application or backend unless the user explicitly asks for platform engineering.',
    '- Indicator source files under indicators/*.js are the only importable indicator artifacts.',
    '- For indicator work, read INDICATOR_CONTRACT.md, save complete JavaScript under indicators/, and validate the saved file before recommending it.',
    '- Pasted JavaScript in chat is informational only and must not be treated as an import artifact.',
    '- The browser owns the final validation/import boundary. Never claim an indicator is applied until QPRO confirms validation and the user explicitly uses Apply.',
    '- Execute requested workspace and platform actions directly; do not pause for an approval workflow invented by QPRO.',
    '- Ask concise questions only when required information is genuinely missing, and summarize files or state changes afterward.', ''

  ].join('\\n'));
  const architecture = path.join(workspaceRoot,'QPRO_ARCHITECTURE.md');
  if(!fs.existsSync(architecture)) fs.writeFileSync(architecture,QPRO_ARCHITECTURE);
  const contract = path.join(workspaceRoot,'INDICATOR_CONTRACT.md');
  if(!fs.existsSync(contract)) fs.writeFileSync(contract,INDICATOR_CONTRACT);
  const readme = path.join(workspaceRoot,'README.md');
  if(!fs.existsSync(readme)) fs.writeFileSync(readme,'# QPRO Pi Workspace\n\nThis is an isolated, normal Pi project. QPRO supplies only its workspace and indicator/import boundaries; Pi owns conversation history, tools, resources, skills, extensions, compaction, and model behavior.\n\nIndicator source files under `indicators/*.js` are the only import source. QPRO validates saved files against the platform contract, and the user must explicitly Apply a validated file before it reaches the chart. Pasted JavaScript in chat is informational only.\n');
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
  const out=[]; const includeContent=options.includeContent !== false; const maxContent=Number(options.maxContent || 512000);
  const walk=(dir)=>{ for(const ent of fs.readdirSync(dir,{withFileTypes:true})){ const p=path.join(dir,ent.name); if(ent.isDirectory()) walk(p); else if(/\.(js|md|json|txt)$/i.test(ent.name)){
    const rel=path.relative(workspaceRoot,p); const stat=fs.statSync(p); const raw=fs.readFileSync(p); const item={path:rel,size:stat.size,mtime:stat.mtimeMs,hash:crypto.createHash('sha256').update(raw).digest('hex')};
    if(includeContent && stat.size<=maxContent) item.content=raw.toString('utf8'); else if(includeContent) item.contentTruncated=true;
    out.push(item);
  } } };
  walk(workspaceRoot); return out;
}
function lineDiff(beforeText,afterText,limit=24000){
  const before=String(beforeText ?? '').replace(/\r\n/g,'\n').split('\n');
  const after=String(afterText ?? '').replace(/\r\n/g,'\n').split('\n');
  if(before.length*after.length>4000000) return {diff:'[diff omitted: file is too large for an inline line diff]',addedLines:null,removedLines:null,truncated:true};
  const table=Array.from({length:before.length+1},()=>new Uint32Array(after.length+1));
  for(let i=before.length-1;i>=0;i--) for(let j=after.length-1;j>=0;j--) table[i][j]=before[i]===after[j]?table[i+1][j+1]+1:Math.max(table[i+1][j],table[i][j+1]);
  const ops=[]; let i=0,j=0;
  while(i<before.length || j<after.length){
    if(i<before.length && j<after.length && before[i]===after[j]){ops.push({type:' ',text:before[i]});i++;j++;}
    else if(j<after.length && (i>=before.length || table[i][j+1]>=table[i+1][j])){ops.push({type:'+',text:after[j++]});}
    else ops.push({type:'-',text:before[i++]});
  }
  const changed=ops.map((x,n)=>x.type===' '?-1:n).filter(n=>n>=0); const keep=new Set();
  changed.forEach(n=>{for(let k=Math.max(0,n-3);k<=Math.min(ops.length-1,n+3);k++)keep.add(k);});
  const selected=ops.map((x,n)=>({x,n})).filter(({n})=>keep.has(n));
  let addedLines=0,removedLines=0; ops.forEach(x=>{if(x.type==='+')addedLines++;if(x.type==='-')removedLines++;});
  let text=''; let previous=-2;
  selected.forEach(({x,n})=>{if(n!==previous+1) text+=(text?'\n':'')+'@@ context @@\n'; text+=x.type+x.text+'\n'; previous=n;});
  if(text.length>limit) return {diff:text.slice(0,limit)+'\n[… diff truncated …]',addedLines,removedLines,truncated:true};
  return {diff:text.trimEnd(),addedLines,removedLines,truncated:false};
}
function changedWorkspaceFiles(before){
  const current=workspaceFiles({includeContent:true,maxContent:512000});
  const oldMap=new Map((before || []).map(f=>[f.path,f])); const newMap=new Map(current.map(f=>[f.path,f]));
  const paths=[...new Set([...oldMap.keys(),...newMap.keys()])].sort(); const changes=[];
  for(const file of paths){
    const oldFile=oldMap.get(file), newFile=newMap.get(file); if(oldFile?.hash===newFile?.hash) continue;
    const status=!oldFile?'added':!newFile?'removed':'modified';
    const oldContent=oldFile?.contentTruncated?'':(oldFile?.content ?? ''); const newContent=newFile?.contentTruncated?'':(newFile?.content ?? '');
    const d=lineDiff(oldContent,newContent);
    changes.push({path:file,status,beforeHash:oldFile?.hash||null,afterHash:newFile?.hash||null,beforeSize:oldFile?.size||0,afterSize:newFile?.size||0,content:newFile?.content,previousContent:status==='removed'?oldFile?.content:undefined,diff:d.diff,addedLines:d.addedLines,removedLines:d.removedLines,diffTruncated:d.truncated,contentTruncated:!!(newFile?.contentTruncated||oldFile?.contentTruncated)});
  }
  return changes;
}
async function createSession(input){
  const payload=normalizePiPayload(input || {});
  const requestProfile=capabilityProfile(payload,latestPayloadText(payload));
  // Native Pi owns the session, resources, and tool catalog. QPRO adds only
  // the isolated workspace and its indicator boundary.
  ensureWorkspace();
  writeChartContext(payload);
  const runtime=await sharedModelRuntime();
  const requestedModel=String(payload.piModel || '').trim();
  // Leave model/thinking undefined when the caller did not explicitly choose
  // them so native Pi can restore the values recorded in a resumed session.
  const model=requestedModel ? resolveNativeModel(runtime,requestedModel) : undefined;
  const protocol=model?.api;
  const settingsManager=pi.SettingsManager.create(workspaceRoot,agentRoot);
  const loader=new pi.DefaultResourceLoader({
    cwd:workspaceRoot,
    agentDir:agentRoot,
    settingsManager,
    noExtensions:false,
    noSkills:false,
    noPromptTemplates:false,
    noContextFiles:false,
    // Preserve Pi CLI's native system prompt; QPRO adds only its workspace
    // and explicit indicator validation boundary.
    appendSystemPromptOverride:(base)=>[...base, String(payload.systemPrompt || 'You are a professional coding IDE agent.')+'\n\nYou are operating inside the isolated QPRO workspace. Use native Pi behavior and tools normally. Indicator source files live under indicators/*.js and must follow the QPRO contract. Do not claim an indicator is applied until QPRO validation and explicit user Apply confirm it.']
  });
  await loader.reload();
  const state=readResourceState();
  if(Array.isArray(loader.skills)) loader.skills=loader.skills.filter(x=>resourceIsEnabled('skill',x.name));
  if(Array.isArray(loader.prompts)) loader.prompts=loader.prompts.filter(x=>resourceIsEnabled('prompt',x.name));
  const sessionDir=safeChatDir(payload);
  fs.mkdirSync(sessionDir,{recursive:true});
  let sessionManager;
  if(payload.forceNew) sessionManager=pi.SessionManager.create(workspaceRoot,sessionDir);
  else if(payload.sessionFile) sessionManager=pi.SessionManager.open(safeSessionFile(payload.sessionFile),sessionDir,workspaceRoot);
  else sessionManager=pi.SessionManager.continueRecent(workspaceRoot,sessionDir);
  const thinking=thinkingSelection(payload);
  const requestedThinking=thinking.mode==='explicit' ? thinking.requested : nativeThinkingLevel();
  const {session,extensionsResult}=await pi.createAgentSession({cwd:workspaceRoot,agentDir:agentRoot,model,modelRuntime:runtime,resourceLoader:loader,settingsManager,sessionManager,thinkingLevel:requestedThinking});
  const activeModel=session.model || model;
  if(!activeModel) throw new Error('Pi CLI has no active model. Configure a provider with `pi /login` or in ~/.pi/agent/auth.json.');
  if(model && (activeModel.provider!==model.provider || activeModel.id!==model.id)){
    try{await session.setModel(model);}catch(error){throw new Error('Pi model mismatch before request: requested '+modelLabel(model)+' but session selected '+modelLabel(activeModel)+': '+error.message);}
  }
  const effectiveModel=session.model || model || activeModel;
  if(model && (effectiveModel.provider!==model.provider || effectiveModel.id!==model.id)) throw new Error('Pi model mismatch before request: requested '+modelLabel(model)+' but session selected '+modelLabel(effectiveModel));
  const activeProtocol=effectiveModel.api;
  configureSessionTools(session,payload);
  const commands=(extensionsResult.runtime.getCommands ? extensionsResult.runtime.getCommands() : []).map(command => ({name:command.name,description:command.description || '',source:command.source || 'extension',sourceInfo:command.sourceInfo ? {path:command.sourceInfo.path,scope:command.sourceInfo.scope,origin:command.sourceInfo.origin} : undefined}));
  return {session,runtime,model:effectiveModel,protocol:activeProtocol,commands,sessionManager,initialized:session.messages && session.messages.length > 0,telemetry:{startedAt:Date.now(),compactions:[],retries:[],subagents:new Map()}};
}
async function nativePiCommands(payload={}){ const entry=await sessionForPayload(payload); return entry.commands || []; }
async function applyRequestedModel(entry,payload={}){
  const selection=modelSelection(payload);
  return withModelChangeLock(payload.chatId,async()=>{
    const model=resolveNativeModel(entry.runtime,selection.requested);
    const current=entry.session.model;
    if(!current || current.provider!==model.provider || current.id!==model.id){
      await entry.session.setModel(model);
      entry.model=model; entry.protocol=model.api;
    }
    return model;
  });
}
async function applyRequestedThinking(entry,payload={}){
  const selection=thinkingSelection(payload);
  const level=selection.mode==='explicit' ? selection.requested : nativeThinkingLevel();
  if(String(entry.session.thinkingLevel || '')!==level) entry.session.setThinkingLevel(level);
  return level;
}
function requestedModelInfo(payload,entry){
  const selection=modelSelection(payload);
  const effective=entry?.session?.model || entry?.model;
  const thinking=thinkingSelection(payload);
  return {selectionMode:selection.mode,requestedModel:selection.requested || null,effectiveModel:modelLabel(effective)||null,nativeDefaultModel:selection.mode==='native-default'?modelLabel(effective)||null:null,thinkingSelection:thinking.mode,requestedThinking:thinking.requested || null,effectiveThinking:entry?.session?.thinkingLevel || null,nativeDefaultThinking:thinking.mode==='native-default'?nativeThinkingLevel():null};
}
function isPermanentProviderQuotaError(errorMessage){
  return /(?:daily|monthly)\s+(?:free\s+)?limit|inference_cap_error|quota exceeded|insufficient quota/i.test(String(errorMessage || ''));
}
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
function sessionForPayload(input){
  const payload=normalizePiPayload(input || {});
  const id=sessionKey(payload);
  if(payload.forceNew){
    const existing=sessions.get(id);
    if(existing){try{existing.session.dispose();}catch(_){} sessions.delete(id);}
    sessionPromises.delete(id);
  }
  const entry=sessions.get(id);
  if(entry) return Promise.resolve(entry);
  if(sessionPromises.has(id)) return sessionPromises.get(id);
  const pending=createSession(payload).then(created=>{sessions.set(id,created);return created;}).finally(()=>sessionPromises.delete(id));
  sessionPromises.set(id,pending);
  return pending;
}
function makePrompt(entry,payload){
  const profile=capabilityProfile(payload,latestPayloadText(payload));
  const workspace=profile.platformIntent && payload.workspaceContext?'\n\nCURRENT TRADING CHART CONTEXT:\n'+String(payload.workspaceContext):'';
  const latest=[...(payload.messages || [])].reverse().find(m=>m && m.role==='user');
  const latestText=textBlock(latest && latest.content).trim();
  if(payload.indicatorFileOnly){
    return latestText+'\n\nThis is a file-only indicator request. Translate or implement the indicator and write the complete result to indicators/<kebab-case-name>.js using the coding tools. Validate the saved file when possible. Return a concise summary and the exact saved path; do not paste the full source into the response and do not claim the chart was changed.';
  }
  if(profile.translationIntent && !payload.indicatorFileOnly) return latestText+'\n\nThis is a direct Pine translation request. Translate the Pine source already present in this turn or immediately preceding user turn. Do not read workspace files, inspect chart state, use tools, ask for approval, or invent missing source. If no Pine source is available, ask the user to paste or attach it.';
  // Preserve slash commands exactly. Pi's AgentSession expands extension
  // commands, prompt templates, and skills when prompt() receives raw /… text.
  if(/^\/\S+/.test(latestText)) return latestText;
  const indicatorDirective=payload.indicatorTask ? '\n\nExplicit indicator task: read INDICATOR_CONTRACT.md only when needed, inspect only the relevant indicator file, edit an existing indicators/*.js file in place when present, preserve unrelated code, validate the saved result, and never claim application until QPRO confirms it. Indicator source is file-only: save complete JavaScript under indicators/<kebab-case-name>.js and refer to the path in your response; do not return a paste-only import artifact. Do not request interactive approval.' : '';
  // Native Pi persists the conversation after the first turn. For a fresh
  // plain question, the current turn is sufficient; all other workflows keep
  // the normal full bounded history used by Pi/QPRO.
  const prompt=!payload.forceNew && (entry.initialized || profile.mode==='output-only' || (!profile.platformIntent && !profile.researchIntent && !profile.fileIntent && !profile.writeIntent && !profile.explicitIndicator))
    ? latestText
    : promptWithHistory(payload.messages);
  return prompt + workspace + indicatorDirective;
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
  return {stopReason:message.stopReason,usage:message.usage || null,content:(Array.isArray(message.content)?message.content:[]).map(item=>item.type==='text'?{type:'text',text:String(item.text || '').slice(0,6000)}:item.type==='thinking'?{type:'thinking',text:'[model thinking omitted from transcript]'}:item.type==='toolCall'?{type:'toolCall',name:item.name,id:item.id,arguments:summarizeToolValue(item.arguments)}:{type:item.type}).slice(0,30)};
}
function finalAssistantText(session, streamed, beforeCount=0){
  // Select only assistant content created by this turn. Looking through the
  // entire session can return an older answer when the provider ends a turn
  // after tool calls or with an empty assistant segment.
  for(let i=(session.messages || []).length-1;i>=beforeCount;i--){
    const m=session.messages[i];
    if(m && m.role==='assistant' && textBlock(m.content)) return textBlock(m.content);
  }
  return String(streamed || '');
}
function latestStopReason(session, beforeCount=0){
  for(let i=(session.messages || []).length-1;i>=beforeCount;i--){const m=session.messages[i];if(m?.role==='assistant' && m.stopReason)return String(m.stopReason);}
  return '';
}
function latestAssistantError(session,beforeCount=0){
  for(let i=(session.messages || []).length-1;i>=beforeCount;i--){const m=session.messages[i];if(m?.role==='assistant' && (m.errorMessage || m.stopReason==='error')) return {errorMessage:m.errorMessage || '',stopReason:m.stopReason || 'error'};}
  return null;
}
async function streamPiAgent(input, res){
  const payload=normalizePiPayload(input || {});
  const chatId=String(payload.chatId || 'default');
  if(activeChats.has(chatId) || streamLocks.has(chatId)) throw new Error('This Pi conversation is already running. Use Stop or follow-up.');
  streamLocks.add(chatId);
  let entry;
  try { entry=await sessionForPayload(payload); }
  catch(error){ streamLocks.delete(chatId); throw error; }
  writeChartContext(payload);
  try{ await applyRequestedModel(entry,payload); await applyRequestedThinking(entry,payload); }
  catch(error){ streamLocks.delete(chatId); throw error; }
  configureSessionTools(entry.session,payload);
  const beforeWorkspaceFiles=workspaceFiles({includeContent:true,maxContent:512000});
  const beforeMessageCount=entry.session.messages.length;
  const textParts=[]; const toolEvents=[]; const transcript=[]; const thinkingSpans=[]; const lifecycle=[]; let closed=false; let latestUsage=null; let thinkingStartedAt=null; const childControllers=new Map(); let turnIndex=-1; let messageIndex=0; let currentMessageId=null; let currentTranscript=null;
  const send=(type,data={})=>{ if(closed || res.destroyed) return; if(['turn_start','message_start','message_end','agent_start','agent_end','agent_settled','turn_end','tool_start','tool_end','compaction_start','compaction_end','retry_start','retry_end','queue_update','activity'].includes(type)) lifecycle.push({type,timestamp:Date.now(),...(type==='tool_start'||type==='tool_end'?{tool:data.tool,toolCallId:data.toolCallId,error:!!data.error}:{}),...(type==='activity'?{message:String(data.message||'')}:{}),...(type==='retry_start'?{message:String(data.message||''),attempt:data.attempt,maxAttempts:data.maxAttempts}:{}),...(type==='compaction_start'||type==='compaction_end'?{message:String(data.message||'')}: {})}); res.write('event: '+type+'\ndata: '+JSON.stringify({type,...data})+'\n\n'); };
  const unsubscribe=entry.session.subscribe(event=>{
    if(event.type==='turn_start'){ turnIndex=event.turnIndex ?? (turnIndex+1); send('turn_start',{turnIndex,timestamp:event.timestamp || Date.now()}); }
    else if(event.type==='message_start'){ currentMessageId='m_'+(++messageIndex); currentTranscript=event.message?.role==='assistant'?{messageId:currentMessageId,turnIndex,text:''}:null; if(currentTranscript) transcript.push(currentTranscript); send('message_start',{messageId:currentMessageId,role:event.message?.role || 'unknown',turnIndex}); }
    else if(event.type==='message_update'){
      const ae=event.assistantMessageEvent; const common={messageId:currentMessageId,turnIndex,contentIndex:ae?.contentIndex};
      if(ae?.type==='text_delta'){ const delta=ae.delta || ''; textParts.push(delta); if(currentTranscript) currentTranscript.text += delta; send('text_delta',{...common,delta}); }
      else if(ae?.type==='text_start') send('text_start',common);
      else if(ae?.type==='text_end') send('text_end',{...common,content:ae.content || ''});
      else if(ae?.type==='thinking_start'){ thinkingStartedAt=Date.now(); send('thinking_start',{...common,timestamp:thinkingStartedAt}); }
      // Pi-style thinking visibility without exposing private chain-of-thought.
      // The browser receives lifecycle and duration only; thinking content is
      // never forwarded or rendered.
      else if(ae?.type==='thinking_end'){ const endedAt=Date.now(); const durationMs=thinkingStartedAt ? endedAt-thinkingStartedAt : null; if(durationMs!==null) thinkingSpans.push({turnIndex,messageId:currentMessageId,durationMs}); send('thinking_end',{...common,timestamp:endedAt,durationMs}); thinkingStartedAt=null; }
      else if(ae?.type==='toolcall_start') send('toolcall_start',common);
      else if(ae?.type==='toolcall_delta') send('toolcall_delta',{...common,delta:ae.delta || ''});
      else if(ae?.type==='toolcall_end') send('toolcall_end',{...common,toolCall:ae.toolCall ? {name:ae.toolCall.name,id:ae.toolCall.id,arguments:summarizeToolValue(ae.toolCall.arguments)} : null});
    }else if(event.type==='message_end'){
      send('message_end',{messageId:currentMessageId,turnIndex,role:event.message?.role || 'unknown'});
      if(event.message?.role==='assistant'){ latestUsage=event.message.usage || null; send('usage',{usage:latestUsage,stats:sessionStats(entry)}); }
    }else if(event.type==='tool_execution_start'){ const item={type:'tool_start',tool:event.toolName || 'tool',toolCallId:event.toolCallId,input:summarizeToolValue(event.args || event.input || {}),turnIndex}; toolEvents.push(item); if(item.tool==='subagent'){ entry.telemetry.subagents.set(item.toolCallId,{id:item.toolCallId,status:'running',startedAt:Date.now(),input:item.input}); childControllers.set(item.toolCallId,createSubagentCancellationController(entry,item.toolCallId)); send('subagent_start',{id:item.toolCallId,input:item.input}); } send('tool_start',item); }
    else if(event.type==='tool_execution_update') send('tool_update',{tool:event.toolName || 'tool',toolCallId:event.toolCallId,partial:summarizeToolValue(event.partialResult),turnIndex});
    else if(event.type==='tool_execution_end'){ const item={type:'tool_end',tool:event.toolName || 'tool',toolCallId:event.toolCallId,error:!!event.isError,result:summarizeToolValue(event.result),turnIndex}; toolEvents.push(item); if(item.tool==='subagent' && entry.telemetry.subagents.has(event.toolCallId)){const sub=entry.telemetry.subagents.get(event.toolCallId);const details=event.result?.details || event.result?.data?.details || {};if(details.asyncId)sub.asyncId=details.asyncId;if(details.asyncDir)sub.asyncDir=details.asyncDir;sub.status=item.error?(sub.status==='cancel_requested'?'cancelled':'error'):'complete';sub.finishedAt=Date.now();sub.error=item.error;childControllers.delete(event.toolCallId);send('subagent_end',{id:event.toolCallId,status:sub.status,asyncId:sub.asyncId});} send('tool_end',item); }
    else if(event.type==='agent_start') send('agent_start');
    else if(event.type==='agent_end') send('agent_end',{willRetry:event.willRetry !== false});
    else if(event.type==='agent_settled') send('agent_settled');
    else if(event.type==='turn_end') send('turn_end',{turnIndex,toolResults:(event.toolResults || []).map(summarizeToolValue)});
    else if(event.type==='compaction_start'){entry.telemetry.compactions.push({startedAt:Date.now(),reason:event.reason || 'automatic'});send('compaction_start',{message:'Pi is compacting context…',reason:event.reason});}
    else if(event.type==='compaction_end') send('compaction_end',{message:event.errorMessage || (event.aborted?'Context compaction aborted':'Context compaction complete'),reason:event.reason,result:event.result ? {summary:String(event.result.summary || '').slice(0,1000),tokensBefore:event.result.tokensBefore || null,estimatedTokensAfter:event.result.estimatedTokensAfter || null} : null,aborted:!!event.aborted,willRetry:!!event.willRetry,errorMessage:event.errorMessage});
    else if(event.type==='auto_retry_start'){
      const errorMessage=event.errorMessage || 'transient provider failure';
      const permanent=isPermanentProviderQuotaError(errorMessage);
      entry.telemetry.retries.push({startedAt:Date.now(),attempt:event.attempt || entry.session.retryAttempt || 1,source:event.source || 'provider',error:errorMessage});
      if(permanent) entry.session.abortRetry();
      send('retry_start',{message:permanent?'Pi stopped retrying because this model quota is exhausted':'Pi is retrying the provider request…',attempt:event.attempt || entry.session.retryAttempt || 1,maxAttempts:event.maxAttempts,delayMs:event.delayMs,errorMessage,model:entry.session.model && modelLabel(entry.session.model),...requestedModelInfo(payload,entry),permanent});
    }
    else if(event.type==='auto_retry_end') send('retry_end',{success:event.success,attempt:event.attempt,finalError:event.finalError});
    else if(event.type==='queue_update') send('queue_update',{steering:Array.isArray(event.steering)?event.steering.length:(event.steering || 0),followUp:Array.isArray(event.followUp)?event.followUp.length:(event.followUp || 0)});
  });
  activeChats.set(chatId,{entry,payload,send,stopRequested:false,startedAt:Date.now()});
  res.on('close',()=>{
    const active=activeChats.get(chatId);
    // A normal SSE close after the response has settled must not abort or
    // leave the conversation marked busy. Only abort an actually running turn.
    if(active && !closed && entry.session.isStreaming){ active.stopRequested=true; entry.session.abort().catch(()=>{}); }
  });
  send('session_start',{sessionId:entry.session.sessionId,sessionFile:entry.session.sessionFile,chatId,...requestedModelInfo(payload,entry),model:entry.model && modelLabel(entry.model),thinkingLevel:entry.session.thinkingLevel,activeTools:entry.session.getActiveToolNames()});
  send('activity',{message:'Pi session ready · '+(entry.session.getActiveToolNames().length||0)+' focused tools'});
  try{
    await entry.session.prompt(makePrompt(entry,payload), payload.images?.length ? {images:payload.images} : undefined); entry.initialized=true;
    const content=finalAssistantText(entry.session,textParts.join(''),beforeMessageCount);
    const stopReason=latestStopReason(entry.session,beforeMessageCount);
    const assistantError=latestAssistantError(entry.session,beforeMessageCount);
    if(assistantError) throw new Error(assistantError.errorMessage || 'Pi provider stopped: '+assistantError.stopReason);
    if(stopReason==='length' || stopReason==='max_tokens') send('incomplete',{reason:stopReason,message:'Pi reached the provider output limit; ask for continuation to continue.'});
    if(!content){
      const recent=entry.session.messages.slice(beforeMessageCount).map(m=>({role:m.role,stopReason:m.stopReason,error:m.errorMessage,content:textBlock(m.content).slice(0,240)}));
      throw new Error('Pi completed without an assistant response'+(recent.length?' (recent messages: '+JSON.stringify(recent)+')':''));
    }
    const changedFiles=changedWorkspaceFiles(beforeWorkspaceFiles);
    send('done',{content,agent:'pi',protocol:entry.protocol,chatId,stopReason,complete:!['length','max_tokens'].includes(stopReason),...requestedModelInfo(payload,entry),tools:toolEvents,transcript:transcript.filter(item=>item.text),lifecycle,thinking:thinkingSpans,thinkingLevel:entry.session.thinkingLevel,activeTools:entry.session.getActiveToolNames(),files:workspaceFiles({includeContent:false}),changedFiles,workspace:'isolated',sessionId:entry.session.sessionId,sessionFile:entry.session.sessionFile,compaction:entry.session.isCompacting || false,usage:latestUsage});
    send('activity',{message:changedFiles.length ? 'Pi finished · '+changedFiles.length+' workspace change(s) detected' : 'Pi finished · no workspace files changed'});
  }catch(error){
    const active=activeChats.get(chatId);
    if(active?.stopRequested) send('aborted',{message:'Pi stopped'});
    else send('error',{error:String(error && error.message || error),chatId,...requestedModelInfo(payload,entry)});
  }finally{
    unsubscribe(); activeChats.delete(chatId); streamLocks.delete(chatId); closed=true;
    if(!res.destroyed) res.end();
  }
}
async function runPiAgent(input){
  const payload=normalizePiPayload(input || {});
  let result;
  const fake={write(){},destroyed:false,end(){}};
  // Compatibility helper for non-stream callers/tests; the browser uses SSE.
  const entry=await sessionForPayload(payload); await applyRequestedModel(entry,payload); await applyRequestedThinking(entry,payload); writeChartContext(payload); configureSessionTools(entry.session,payload); const beforeMessageCount=entry.session.messages.length; const beforeWorkspaceFiles=workspaceFiles({includeContent:true}); const textParts=[]; const unsubscribe=entry.session.subscribe(e=>{if(e.type==='message_update'&&e.assistantMessageEvent?.type==='text_delta')textParts.push(e.assistantMessageEvent.delta||'');});
  try{await entry.session.prompt(makePrompt(entry,payload),payload.images?.length ? {images:payload.images} : undefined);entry.initialized=true;const content=finalAssistantText(entry.session,textParts.join(''),beforeMessageCount);return {content,agent:'pi',protocol:entry.protocol,stopReason:latestStopReason(entry.session,beforeMessageCount),activeTools:entry.session.getActiveToolNames(),changedFiles:changedWorkspaceFiles(beforeWorkspaceFiles),workspace:'isolated',sessionId:entry.session.sessionId};}finally{unsubscribe();}
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
    const source=pi.SessionManager.open(safeSessionFile(entry.session.sessionFile),safeChatDir(payload),workspaceRoot);
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
    if(action==='setModel'){ const model=await withModelChangeLock(chatId,async()=>{const next=resolveNativeModel(entry.runtime,payload.model);await entry.session.setModel(next);entry.model=next;entry.protocol=next.api;return next;}); return {ok:true,action,model:model.provider+'/'+model.id,sessionId:entry.session.sessionId}; }
    if(action==='setThinking'){ const level=String(payload.thinkingSelection==='native-default'?'':(payload.level || '')); if(level) entry.session.setThinkingLevel(level); else entry.session.setThinkingLevel(String(nativePiSettings().defaultThinkingLevel || 'medium')); return {ok:true,action,thinking:entry.session.thinkingLevel}; }
    return {ok:true,action,sessionId:entry.session.sessionId,sessionFile:entry.session.sessionFile,model:entry.model && entry.model.provider+'/'+entry.model.id,thinking:entry.session.thinkingLevel,messages:entry.session.messages.length,activeTools:entry.session.getActiveToolNames(),autoCompaction:entry.session.autoCompactionEnabled !== false,stats:sessionStats(entry),leafId:entry.sessionManager.getLeafId(),entries:entry.sessionManager.getEntries().map(x=>({id:x.id,type:x.type,role:x.message?.role || '',text:textBlock(x.message?.content).slice(0,100)}))};
  }
  if(!active) return {ok:false,error:'No active Pi run for this conversation'};
  if(action==='abort'){active.stopRequested=true;await active.entry.session.abort();return {ok:true,action};}
  if(action==='steer' || action==='followUp'){
    const text=String(payload.text || '').trim(); if(!text) throw new Error('Control text is required');
    const nextPayload={...active.payload,messages:[{role:'user',content:text}],intentText:text};
    configureSessionTools(active.entry.session,nextPayload); active.payload=nextPayload;
    if(action==='steer') await active.entry.session.steer(text);
    else await active.entry.session.followUp(text);
    return {ok:true,action,activeTools:active.entry.session.getActiveToolNames()};
  }
  if(action==='compact'){await active.entry.session.compact(String(payload.text || '') || undefined);return {ok:true,action};}
  if(action==='setModel'){
    if(active.entry.session.isStreaming) throw new Error('Choose the model after the current Pi turn finishes');
    const model=await withModelChangeLock(chatId,async()=>{const next=resolveNativeModel(active.entry.runtime,payload.model);await active.entry.session.setModel(next);active.entry.model=next;active.entry.protocol=next.api;return next;});
    return {ok:true,action,model:model.provider+'/'+model.id,sessionId:active.entry.session.sessionId};
  }
  if(action==='setThinking'){ const level=String(payload.thinkingSelection==='native-default'?'':(payload.level || '')); active.entry.session.setThinkingLevel(level || String(nativePiSettings().defaultThinkingLevel || 'medium')); return {ok:true,action,thinking:active.entry.session.thinkingLevel}; }
  if(action==='sessionInfo'){ return {ok:true,action,sessionId:active.entry.session.sessionId,sessionFile:active.entry.session.sessionFile,model:active.entry.model && active.entry.model.provider+'/'+active.entry.model.id,thinking:active.entry.session.thinkingLevel,messages:active.entry.session.messages.length,activeTools:active.entry.session.getActiveToolNames(),autoCompaction:active.entry.session.autoCompactionEnabled !== false,stats:sessionStats(active.entry),leafId:active.entry.sessionManager.getLeafId(),entries:active.entry.sessionManager.getEntries().map(x=>({id:x.id,type:x.type,role:x.message?.role || '',text:textBlock(x.message?.content).slice(0,100)}))}; }
  throw new Error('Unknown Pi control action: '+action);
}
function resolveChartRequest(requestId, result, error){
  const safe=String(requestId || '').replace(/[^a-zA-Z0-9_-]/g,'_'); if(!safe) throw new Error('requestId is required');
  const file=path.join(workspaceRoot,'.qpro-chart-request-'+safe+'.json');
  // The browser can receive tool_start before the extension creates its
  // request file. Preserve an early response instead of losing it to a race.
  let current={type:'chart_request',requestId:safe,decision:'pending',createdAt:Date.now()};
  if(fs.existsSync(file)) try{current=JSON.parse(fs.readFileSync(file,'utf8'));}catch(_){ }
  if(error) current.error=String(error); else current.result=result;
  fs.writeFileSync(file,JSON.stringify(current,null,2)); return {ok:true,requestId:safe};
}
function clearPiSession(chatId){ for(const [id,e] of sessions){ if(!chatId || id === chatId){try{e.session.dispose();}catch(_){} sessions.delete(id);} } for(const id of sessionPromises.keys()){if(!chatId || id===chatId)sessionPromises.delete(id);} }
module.exports={runPiAgent,streamPiAgent,controlPiAgent,clearPiSession,workspaceRoot,INDICATOR_CONTRACT,nativePiModels,nativePiSettings,nativePiCommands,nativePiSessions,nativePiSessionTree,nativePiResources,nativePiStatus,nativePiResourceAction,nativeSessionOperation,cancelPiSubagent,resolveChartRequest};
