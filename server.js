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

  if(req.method === 'POST' && req.url === '/api/pi/chat'){
    let payload;
    try{ payload = JSON.parse(await readBody(req)); }
    catch(_){ return json(res, 400, {error:'bad json'}); }
    try{
      const result = await piAgent.runPiAgent(payload || {});
      console.log(new Date().toISOString(), 'pi/chat ok model=' + (payload.piModel || 'Pi CLI default'));
      return json(res, 200, result);
    }catch(error){
      console.log(new Date().toISOString(), 'pi/chat err', error && error.message);
      return json(res, 502, {error:String(error && error.message || error)});
    }
  }

  if(req.method === 'GET' && (req.url === '/' || req.url === '/index.html')){
    res.writeHead(200, {'Content-Type':'text/html'});
    return res.end(fs.readFileSync(FILE));
  }
  res.writeHead(404); res.end();
});

server.listen(PORT, () => console.log('Quantum Trade Pro running at http://localhost:' + PORT + '  (Ctrl+C to stop)'));
