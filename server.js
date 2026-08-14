#!/usr/bin/env node
// Quantum Trade Pro — native Pi CLI backend
//
// The platform intentionally has one AI path: the embedded Pi agent. Pi owns
// models, providers, authentication, settings, skills, extensions, sessions,
// and coding tools. QPRO only supplies its workspace and chart context.
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const PORT = Number(process.env.PORT) || 8080;
const HOST = process.env.QPRO_HOST || '127.0.0.1';
const FILE = path.join(__dirname, 'online_viewer_net (4).html');
const MAX_BODY_BYTES = Math.max(1024 * 1024, Number(process.env.QPRO_MAX_BODY_BYTES) || 12 * 1024 * 1024);
const QPRO_TOKEN = String(process.env.QPRO_TOKEN || '').trim();
const ALLOWED_ORIGIN = String(process.env.QPRO_ALLOWED_ORIGIN || '').trim();
// QPRO application state is server-owned, not browser-owned. Keep it beside
// the isolated Pi workspace so clearing browser storage cannot erase it.
const QPRO_STATE_DIR = path.join(__dirname, '.qpro');
const QPRO_STATE_FILE = path.join(QPRO_STATE_DIR, 'workspace-state.json');
const QPRO_STATE_BACKUP = QPRO_STATE_FILE+'.bak';
const QPRO_INDICATOR_DIR = path.join(__dirname,'.qpro','pi-workspace','indicators');
const QPRO_INDICATOR_MAX_BYTES = Math.max(64 * 1024, Number(process.env.QPRO_INDICATOR_MAX_BYTES) || 2 * 1024 * 1024);
const QPRO_VALIDATION_DIR = path.join(__dirname,'.qpro','indicator-validation');
const QPRO_VALIDATION_TIMEOUT_MS = Math.max(5000, Number(process.env.QPRO_VALIDATION_TIMEOUT_MS) || 30000);
const workspaceClients = new Set();
function broadcastWorkspaceSnapshot(snapshot,savedAt=Date.now()){
  const message='data: '+JSON.stringify({type:'workspace-sync',source:'server',revision:{time:savedAt,tab:'server'},data:snapshot})+'\n\n';
  for(const res of workspaceClients){try{res.write(message);}catch(_){workspaceClients.delete(res);}}
}
const piAgent = require('./pi-agent');
function safeIndicatorPath(value){
  const rel=String(value || '').replace(/\\/g,'/').replace(/^\/+/, '');
  if(!/^indicators\/[a-zA-Z0-9._-]+\.js$/i.test(rel)) throw new Error('indicator path must be indicators/<name>.js');
  const root=path.resolve(QPRO_INDICATOR_DIR);
  const absolute=path.resolve(path.join(__dirname,'.qpro','pi-workspace'),rel);
  if(absolute!==path.join(root,path.basename(absolute))) throw new Error('invalid indicator path');
  if(fs.existsSync(absolute) && fs.lstatSync(absolute).isSymbolicLink()) throw new Error('indicator symlinks are not allowed');
  return {rel,absolute};
}
function indicatorManifest(includeContent=false){
  fs.mkdirSync(QPRO_INDICATOR_DIR,{recursive:true});
  return fs.readdirSync(QPRO_INDICATOR_DIR,{withFileTypes:true}).filter(x=>x.isFile() && /\.js$/i.test(x.name)).map(entry=>{
    const rel='indicators/'+entry.name, absolute=path.join(QPRO_INDICATOR_DIR,entry.name), stat=fs.statSync(absolute), raw=fs.readFileSync(absolute);
    if(stat.size>QPRO_INDICATOR_MAX_BYTES) throw new Error(rel+' exceeds the indicator file size limit');
    const item={path:rel,size:stat.size,mtime:stat.mtimeMs,hash:require('crypto').createHash('sha256').update(raw).digest('hex')};
    if(includeContent)item.content=raw.toString('utf8');
    return item;
  });
}
function writeIndicatorFile(rel,content){
  const target=safeIndicatorPath(rel); const raw=Buffer.from(String(content || ''),'utf8');
  if(!raw.length) throw new Error('indicator file is empty');
  if(raw.length>QPRO_INDICATOR_MAX_BYTES) throw new Error('indicator file exceeds the size limit');
  fs.mkdirSync(QPRO_INDICATOR_DIR,{recursive:true});
  if(fs.existsSync(target.absolute)){
    const backupDir=path.join(__dirname,'.qpro','pi-workspace','.qpro-backups','indicators'); fs.mkdirSync(backupDir,{recursive:true,mode:0o700});
    const backup=path.join(backupDir,Date.now()+'-'+path.basename(target.absolute)+'.bak'); fs.copyFileSync(target.absolute,backup); try{fs.chmodSync(backup,0o600);}catch(_){ }
  }
  const temp=target.absolute+'.tmp-'+process.pid+'-'+Date.now(); fs.writeFileSync(temp,raw,{mode:0o600}); fs.renameSync(temp,target.absolute); try{fs.chmodSync(target.absolute,0o600);}catch(_){ }
  return {ok:true,path:target.rel,size:raw.length};
}
function readIndicatorFile(rel){
  const target=safeIndicatorPath(rel);
  if(!fs.existsSync(target.absolute)) throw new Error('indicator file not found');
  const stat=fs.statSync(target.absolute);
  if(!stat.isFile()) throw new Error('indicator path is not a file');
  if(stat.size>QPRO_INDICATOR_MAX_BYTES) throw new Error(rel+' exceeds the indicator file size limit');
  const raw=fs.readFileSync(target.absolute);
  return {path:target.rel,size:stat.size,mtime:stat.mtimeMs,hash:require('crypto').createHash('sha256').update(raw).digest('hex'),content:raw.toString('utf8')};
}
function deleteIndicatorFile(rel){
  const target=safeIndicatorPath(rel); if(fs.existsSync(target.absolute)) fs.unlinkSync(target.absolute); return {ok:true,path:target.rel,deleted:true};
}
function validationFile(id){
  const safe=String(id || '').replace(/[^a-zA-Z0-9_-]/g,'');
  if(!safe) throw new Error('validation request id required');
  return path.join(QPRO_VALIDATION_DIR,safe+'.json');
}
function writeValidationRecord(file,record){
  fs.mkdirSync(QPRO_VALIDATION_DIR,{recursive:true,mode:0o700});
  const temp=file+'.tmp-'+process.pid+'-'+Date.now(); fs.writeFileSync(temp,JSON.stringify(record),{encoding:'utf8',mode:0o600}); fs.renameSync(temp,file);
}
function createValidationRequest(rel,bars,warmup){
  const target=safeIndicatorPath(rel);
  if(!fs.existsSync(target.absolute)) throw new Error('indicator file not found');
  const requestedBars=Number.isFinite(Number(bars)) && Number(bars)>0 ? Math.floor(Number(bars)) : null;
  const requestedWarmup=Number.isFinite(Number(warmup)) && Number(warmup)>0 ? Math.floor(Number(warmup)) : 0;
  const id='v_'+Date.now().toString(36)+'_'+crypto.randomBytes(6).toString('hex');
  const file=validationFile(id);
  writeValidationRecord(file,{id,path:target.rel,status:'pending',bars:requestedBars,warmup:requestedWarmup,createdAt:Date.now()});
  return {id,path:target.rel,bars:requestedBars,warmup:requestedWarmup,file};
}
function claimValidationRequest(){
  fs.mkdirSync(QPRO_VALIDATION_DIR,{recursive:true,mode:0o700});
  const now=Date.now();
  for(const name of fs.readdirSync(QPRO_VALIDATION_DIR).filter(x=>x.endsWith('.json')).sort()){
    const file=path.join(QPRO_VALIDATION_DIR,name); let record;
    try{record=JSON.parse(fs.readFileSync(file,'utf8'));}catch(_){continue;}
    if(!record || record.status!=='pending') continue;
    if(now-Number(record.createdAt||0)>QPRO_VALIDATION_TIMEOUT_MS){try{fs.unlinkSync(file);}catch(_){} continue;}
    record.status='claimed'; record.claimedAt=now; writeValidationRecord(file,record);
    return record;
  }
  return null;
}

function readQproState(){
  let lastError=null;
  for(const file of [QPRO_STATE_FILE,QPRO_STATE_BACKUP]) try{
    const stored=JSON.parse(fs.readFileSync(file,'utf8'));
    return {ok:true,exists:true,snapshot:stored && stored.snapshot ? stored.snapshot : stored,savedAt:stored?.savedAt,recovered:file===QPRO_STATE_BACKUP};
  }catch(error){lastError=error;if(error.code==='ENOENT')continue;}
  if(lastError?.code==='ENOENT')return {ok:true,exists:false,snapshot:null};
  throw lastError || new Error('workspace state unavailable');
}
function writeQproState(snapshot){
  fs.mkdirSync(QPRO_STATE_DIR,{recursive:true});
  const temp=QPRO_STATE_FILE+'.tmp-'+process.pid+'-'+Date.now();
  fs.writeFileSync(temp,JSON.stringify({version:1,savedAt:Date.now(),snapshot},null,2),{encoding:'utf8',mode:0o600});
  if(fs.existsSync(QPRO_STATE_FILE)) fs.copyFileSync(QPRO_STATE_FILE,QPRO_STATE_BACKUP);
  fs.renameSync(temp,QPRO_STATE_FILE);
  try{if(fs.existsSync(QPRO_STATE_BACKUP))fs.chmodSync(QPRO_STATE_BACKUP,0o600);}catch(_){ }
  try{fs.chmodSync(QPRO_STATE_FILE,0o600);}catch(_){ }
  return {ok:true,savedAt:Date.now(),file:'.qpro/workspace-state.json'};
}

const json = (res, code, obj) => {
  res.writeHead(code, {'Content-Type':'application/json','Cache-Control':'no-store'});
  res.end(JSON.stringify(obj));
};
const readBody = async req => {
  let body=''; let size=0;
  for await(const chunk of req){ size += Buffer.byteLength(chunk); if(size > MAX_BODY_BYTES) throw Object.assign(new Error('request body too large'),{statusCode:413}); body += chunk; }
  return body;
};
const wait = ms => new Promise(resolve => setTimeout(resolve,ms));
async function waitForValidation(record){
  const deadline=Date.now()+QPRO_VALIDATION_TIMEOUT_MS;
  while(Date.now()<deadline){
    try{
      const value=JSON.parse(fs.readFileSync(record.file,'utf8'));
      if(value.status==='complete' || value.status==='error'){
        try{fs.unlinkSync(record.file);}catch(_){ }
        return value;
      }
    }catch(error){if(error.code!=='ENOENT') throw error;}
    await wait(150);
  }
  try{fs.unlinkSync(record.file);}catch(_){ }
  throw Object.assign(new Error('browser validation timed out; open QPRO in a browser and try again'),{statusCode:504});
}
function authorized(req){
  if(!QPRO_TOKEN) return HOST === '127.0.0.1' || HOST === 'localhost' || HOST === '::1';
  const value=String(req.headers.authorization || ''); return value === 'Bearer '+QPRO_TOKEN || String(req.headers['x-qpro-token'] || '') === QPRO_TOKEN;
}
function corsOrigin(req){
  const origin=String(req.headers.origin || '');
  if(ALLOWED_ORIGIN && origin===ALLOWED_ORIGIN) return origin;
  if(!ALLOWED_ORIGIN && !origin) return '';
  if(!ALLOWED_ORIGIN && /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/i.test(origin)) return origin;
  return '';
}

const server = http.createServer(async (req, res) => {
  const origin=corsOrigin(req); if(origin) { res.setHeader('Access-Control-Allow-Origin',origin); res.setHeader('Vary','Origin'); }
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-QPRO-Token');
  res.setHeader('Access-Control-Allow-Methods','GET,PUT,POST,OPTIONS');
  if(req.method === 'OPTIONS'){ if(!origin && req.headers.origin) return json(res,403,{ok:false,error:'origin not allowed'}); res.writeHead(204); res.end(); return; }
  if(req.url.startsWith('/api/') && !authorized(req)) return json(res,401,{ok:false,error:'QPRO authentication required'});

  if(req.method === 'GET' && req.url === '/api/ping'){
    return json(res, 200, {ok:true, token:'qpro', agent:'pi'});
  }
  if(req.method === 'GET' && req.url === '/api/qpro/workspace'){
    try{return json(res,200,readQproState());}
    catch(error){return json(res,500,{ok:false,error:String(error.message||error)});}
  }
  if(req.method === 'GET' && req.url === '/api/qpro/workspace-events'){
    res.writeHead(200,{'Content-Type':'text/event-stream; charset=utf-8','Cache-Control':'no-cache, no-transform','Connection':'keep-alive','X-Accel-Buffering':'no'});
    res.write(': qpro-workspace-events\n\n'); workspaceClients.add(res);
    const cleanup=()=>workspaceClients.delete(res); req.on('close',cleanup); req.on('error',cleanup); return;
  }
  if(req.method === 'GET' && req.url === '/api/qpro/indicators'){
    try{return json(res,200,{ok:true,indicators:indicatorManifest(false)});}
    catch(error){return json(res,500,{ok:false,error:String(error.message||error)});}
  }
  if(req.method === 'GET' && req.url.startsWith('/api/qpro/indicator-file')){
    try{const rel=new URL(req.url,'http://qpro.local').searchParams.get('path');return json(res,200,{ok:true,file:readIndicatorFile(rel)});}
    catch(error){return json(res,404,{ok:false,error:String(error.message||error)});}
  }
  if(req.method === 'POST' && req.url === '/api/qpro/indicator-file'){
    let payload; try{payload=JSON.parse(await readBody(req));}catch(error){return json(res,error?.statusCode||400,{ok:false,error:'bad json'});}
    try{return json(res,200,writeIndicatorFile(payload.path,payload.content));}
    catch(error){return json(res,400,{ok:false,error:String(error.message||error)});}
  }
  if(req.method === 'DELETE' && req.url.startsWith('/api/qpro/indicator-file')){
    try{const rel=new URL(req.url,'http://qpro.local').searchParams.get('path');return json(res,200,deleteIndicatorFile(rel));}
    catch(error){return json(res,400,{ok:false,error:String(error.message||error)});}
  }
  // A live browser owns chartData and the QPRO runtime. External coding agents
  // can request that browser to validate a saved file without gaining Apply
  // authority or needing Pi's extension protocol.
  if(req.method === 'GET' && req.url === '/api/qpro/indicator-validation-request'){
    try{return json(res,200,{ok:true,request:claimValidationRequest()});}
    catch(error){return json(res,500,{ok:false,error:String(error.message||error)});}
  }
  if(req.method === 'POST' && req.url === '/api/qpro/indicator-validation-result'){
    let payload; try{payload=JSON.parse(await readBody(req));}catch(error){return json(res,error?.statusCode||400,{ok:false,error:'bad json'});}
    try{
      const file=validationFile(payload.id); const current=JSON.parse(fs.readFileSync(file,'utf8'));
      if(current.status!=='claimed') throw new Error('validation request is not claimed');
      const target=safeIndicatorPath(current.path); if(payload.path && String(payload.path)!==current.path) throw new Error('validation path mismatch');
      writeValidationRecord(file,{...current,status:payload.error?'error':'complete',path:target.rel,hash:payload.hash||null,validation:payload.validation||null,window:payload.window||null,error:payload.error||null,completedAt:Date.now()});
      return json(res,200,{ok:true,id:current.id});
    }catch(error){return json(res,400,{ok:false,error:String(error.message||error)});}
  }
  if(req.method === 'POST' && req.url === '/api/qpro/indicator-validate'){
    let payload; try{payload=JSON.parse(await readBody(req));}catch(error){return json(res,error?.statusCode||400,{ok:false,error:'bad json'});}
    let record;
    try{record=createValidationRequest(payload.path,payload.bars,payload.warmup); const result=await waitForValidation(record); if(result.status==='error') return json(res,502,{ok:false,error:result.error||'browser validation failed',path:result.path,validation:result.validation||null,window:result.window||null}); return json(res,200,{ok:true,path:result.path,hash:result.hash||null,validation:result.validation||null,window:result.window||{requested:record.bars,warmup:record.warmup}});}
    catch(error){return json(res,error?.statusCode||504,{ok:false,error:String(error.message||error),path:payload.path||null});}
  }
  if(req.method === 'PUT' && req.url === '/api/qpro/workspace'){
    let payload;
    try{payload=JSON.parse(await readBody(req));}
    catch(error){return json(res,error?.statusCode || 400,{ok:false,error:error?.statusCode===413?'request body too large':'bad json'});}
    if(!payload || !payload.snapshot || typeof payload.snapshot!=='object') return json(res,400,{ok:false,error:'snapshot object required'});
    try{const result=writeQproState(payload.snapshot); broadcastWorkspaceSnapshot(payload.snapshot,result.savedAt); return json(res,200,result);}
    catch(error){return json(res,500,{ok:false,error:String(error.message||error)});}
  }

  if(req.method === 'GET' && req.url === '/api/pi/commands'){
    try{ return json(res, 200, {ok:true, commands:await piAgent.nativePiCommands({chatId:'command-catalog'})}); }
    catch(error){ return json(res, 502, {ok:false,error:String(error && error.message || error)}); }
  }
  if(req.method === 'GET' && req.url === '/api/pi/sessions'){
    try{ return json(res, 200, {ok:true, sessions:await piAgent.nativePiSessions()}); }
    catch(error){ return json(res, 502, {ok:false,error:String(error && error.message || error)}); }
  }
  if(req.method === 'GET' && req.url === '/api/pi/resources'){
    try{ const result=await piAgent.nativePiResourceAction({action:'list'}); return json(res, 200, result); }
    catch(error){ return json(res, 502, {ok:false,error:String(error && error.message || error)}); }
  }
  if(req.method === 'GET' && req.url === '/api/pi/status'){
    try{ return json(res, 200, await piAgent.nativePiStatus()); }
    catch(error){ return json(res, 502, {ok:false,error:String(error && error.message || error)}); }
  }
  if(req.method === 'GET' && req.url.startsWith('/api/pi/session-tree')){
    try{ const file=new URL(req.url,'http://qpro.local').searchParams.get('file'); return json(res, 200, {ok:true,tree:await piAgent.nativePiSessionTree(file)}); }
    catch(error){ return json(res, 400, {ok:false,error:String(error && error.message || error)}); }
  }

  if(req.method === 'GET' && req.url === '/api/pi/models'){
    try{
      return json(res, 200, {
        ok:true,
        models:await piAgent.nativePiModels(),
        settings:piAgent.nativePiSettings()
      });
    }catch(error){
      return json(res, 502, {ok:false,error:String(error && error.message || error)});
    }
  }

  if(req.method === 'POST' && req.url === '/api/pi/stream'){
    let payload;
    try{ payload = JSON.parse(await readBody(req)); }
    catch(error){ return json(res, error?.statusCode || 400, {error:error?.statusCode===413?'request body too large':'bad json'}); }
    try{
      res.writeHead(200, {'Content-Type':'text/event-stream; charset=utf-8','Cache-Control':'no-cache, no-transform','Connection':'keep-alive','X-Accel-Buffering':'no'});
      res.write(': pi-stream\n\n');
      await piAgent.streamPiAgent(payload || {}, res);
      console.log(new Date().toISOString(), 'pi/stream complete requestedModel=' + (payload.piModel || 'Pi CLI default'));

    }catch(error){
      console.log(new Date().toISOString(), 'pi/stream err', error && error.message, 'chatId=' + String(payload?.chatId || 'default'), 'requestedModel=' + String(payload?.piModel || 'Pi CLI default'));
      if(!res.headersSent) return json(res, 502, {error:String(error && error.message || error)});
      res.write('event: error\ndata: '+JSON.stringify({type:'error',error:String(error && error.message || error)})+'\n\n');
      res.end();
    }
    return;
  }

  if(req.method === 'POST' && req.url === '/api/pi/control'){
    let payload;
    try{ payload = JSON.parse(await readBody(req)); }
    catch(error){ return json(res, error?.statusCode || 400, {error:error?.statusCode===413?'request body too large':'bad json'}); }
    try{
      const action=String(payload?.action || '');
      if(['new','resume','fork','clone','tree','list'].includes(action)){
        return json(res, 200, await piAgent.nativeSessionOperation({...payload,sessionAction:action}));
      }
      if(action==='resourceToggle' || action==='resourceReload'){
        return json(res, 200, await piAgent.nativePiResourceAction({...payload,resourceAction:action==='resourceToggle'?'toggle':'reload'}));
      }
      if(action==='cancelSubagent') return json(res, 200, await piAgent.cancelPiSubagent(payload));
      if(action==='chartResult' || action==='chartError'){
        return json(res, 200, piAgent.resolveChartRequest(payload.requestId, payload.result, action==='chartError' ? payload.error : null));
      }
      return json(res, 200, await piAgent.controlPiAgent(payload || {}));
    }catch(error){ return json(res, 400, {ok:false,error:String(error && error.message || error)}); }
  }

  // Kept as a compatibility endpoint for local tests; the browser uses the
  // streaming endpoint above.
  if(req.method === 'POST' && req.url === '/api/pi/chat'){
    let payload;
    try{ payload = JSON.parse(await readBody(req)); }
    catch(error){ return json(res, error?.statusCode || 400, {error:error?.statusCode===413?'request body too large':'bad json'}); }
    try{ return json(res, 200, await piAgent.runPiAgent(payload || {})); }
    catch(error){ return json(res, 502, {error:String(error && error.message || error)}); }
  }

  if(req.method === 'GET' && (req.url === '/' || req.url === '/index.html')){
    res.writeHead(200, {'Content-Type':'text/html', 'Cache-Control':'no-store'});
    return res.end(fs.readFileSync(FILE));
  }
  res.writeHead(404); res.end();
});

server.listen(PORT, () => console.log('Quantum Trade Pro running at http://localhost:' + PORT + '  (Ctrl+C to stop)'));
