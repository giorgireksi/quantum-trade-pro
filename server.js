#!/usr/bin/env node
// Quantum Trade Pro — native Pi CLI backend
//
// The platform intentionally has one AI path: the embedded Pi agent. Pi owns
// models, providers, authentication, settings, skills, extensions, sessions,
// and coding tools. QPRO only supplies its workspace and chart context.
const http = require('http');
const fs = require('fs');
const path = require('path');
const PORT = Number(process.env.PORT) || 8080;
const FILE = path.join(__dirname, 'online_viewer_net (4).html');
const piAgent = require('./pi-agent');

const json = (res, code, obj) => {
  res.writeHead(code, {'Content-Type':'application/json'});
  res.end(JSON.stringify(obj));
};
const readBody = async req => { let body=''; for await(const chunk of req) body += chunk; return body; };

const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if(req.method === 'OPTIONS'){ res.writeHead(204); res.end(); return; }

  if(req.method === 'GET' && req.url === '/api/ping'){
    return json(res, 200, {ok:true, token:'qpro', agent:'pi'});
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
    try{ return json(res, 200, {ok:true, resources:await piAgent.nativePiResources()}); }
    catch(error){ return json(res, 502, {ok:false,error:String(error && error.message || error)}); }
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
    catch(_){ return json(res, 400, {error:'bad json'}); }
    try{
      res.writeHead(200, {'Content-Type':'text/event-stream; charset=utf-8','Cache-Control':'no-cache, no-transform','Connection':'keep-alive','X-Accel-Buffering':'no'});
      res.write(': pi-stream\n\n');
      await piAgent.streamPiAgent(payload || {}, res);
      console.log(new Date().toISOString(), 'pi/stream complete model=' + (payload.piModel || 'Pi CLI default'));
    }catch(error){
      console.log(new Date().toISOString(), 'pi/stream err', error && error.message);
      if(!res.headersSent) return json(res, 502, {error:String(error && error.message || error)});
      res.write('event: error\\ndata: '+JSON.stringify({type:'error',error:String(error && error.message || error)})+'\\n\\n');
      res.end();
    }
    return;
  }

  if(req.method === 'POST' && req.url === '/api/pi/control'){
    let payload;
    try{ payload = JSON.parse(await readBody(req)); }
    catch(_){ return json(res, 400, {error:'bad json'}); }
    try{
      const action=String(payload?.action || '');
      if(['new','resume','fork','clone','tree','list'].includes(action)){
        return json(res, 200, await piAgent.nativeSessionOperation({...payload,sessionAction:action}));
      }
      if(action==='approve' || action==='reject' || action==='answer'){
        const value=action==='answer' ? payload.answer : action;
        return json(res, 200, piAgent.resolveApproval(payload.approvalId,value));
      }
      return json(res, 200, await piAgent.controlPiAgent(payload || {}));
    }catch(error){ return json(res, 400, {ok:false,error:String(error && error.message || error)}); }
  }

  // Kept as a compatibility endpoint for local tests; the browser uses the
  // streaming endpoint above.
  if(req.method === 'POST' && req.url === '/api/pi/chat'){
    let payload;
    try{ payload = JSON.parse(await readBody(req)); }
    catch(_){ return json(res, 400, {error:'bad json'}); }
    try{ return json(res, 200, await piAgent.runPiAgent(payload || {})); }
    catch(error){ return json(res, 502, {error:String(error && error.message || error)}); }
  }

  if(req.method === 'GET' && (req.url === '/' || req.url === '/index.html')){
    res.writeHead(200, {'Content-Type':'text/html'});
    return res.end(fs.readFileSync(FILE));
  }
  res.writeHead(404); res.end();
});

server.listen(PORT, () => console.log('Quantum Trade Pro running at http://localhost:' + PORT + '  (Ctrl+C to stop)'));
