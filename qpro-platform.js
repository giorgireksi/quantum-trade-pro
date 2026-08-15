#!/usr/bin/env node
'use strict';

// Harness-neutral live chart actions. Requires an open QPRO browser tab.
const operation = process.argv[2];
const rawParams = process.argv[3];
const baseUrl = String(process.env.QPRO_URL || 'http://127.0.0.1:8080').replace(/\/$/, '');
if (!operation || operation === '--help' || operation === '-h') {
  console.log(`usage: node qpro-platform.js <operation> [json-params]

examples:
  node qpro-platform.js list_operations
  node qpro-platform.js get_state
  node qpro-platform.js get_data '{"bars":200}'
  node qpro-platform.js create_drawing '{"type":"trendline","points":[{"time":1700000000,"price":100},{"time":1700100000,"price":110}]}'
  node qpro-platform.js move_drawing '{"id":"...","timeDelta":900,"priceDelta":100}'`);
  process.exit(operation ? 0 : 1);
}
let params = {};
if (rawParams) {
  try { params = JSON.parse(rawParams); }
  catch (error) { console.error(JSON.stringify({ok:false,error:'params must be JSON: '+error.message})); process.exit(1); }
}
fetch(`${baseUrl}/api/qpro/platform`, {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({operation,params})})
  .then(async response => {
    const body = await response.json().catch(() => ({}));
    console.log(JSON.stringify(body, null, 2));
    if (!response.ok || body.ok === false) process.exitCode = 1;
  })
  .catch(error => {
    console.error(JSON.stringify({ok:false,error:error.message,hint:'open QPRO in a browser (./open_qpro.sh) and retry'}));
    process.exitCode = 1;
  });
