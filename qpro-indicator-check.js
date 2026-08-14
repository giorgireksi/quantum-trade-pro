#!/usr/bin/env node
'use strict';

// Fast local preflight plus optional live browser validation for assistant and
// other CLI workflows. Live validation never applies an indicator.
const fs = require('node:fs');
const path = require('node:path');

const workspaceRoot = path.join(__dirname, '.qpro', 'pi-workspace');
const maxBytes = 2 * 1024 * 1024;
const requested = process.argv.slice(2).find(arg => !arg.startsWith('--'));
const jsonOutput = process.argv.includes('--json');
const live = process.argv.includes('--live');
const baseUrl = String(process.env.QPRO_URL || 'http://127.0.0.1:8080').replace(/\/$/, '');

function result(valid, error, details = {}) { return { valid, ...(error ? {error} : {}), ...details }; }
function print(value) { if (jsonOutput) console.log(JSON.stringify(value)); else console.log(value.valid ? `✓ ${value.path} · ${live ? 'live browser validation' : 'syntax and QPRO file preflight'} passed` : `✗ ${value.error}`); }
function localCheck(rel) {
  if (!/^indicators\/[a-zA-Z0-9._-]+\.js$/i.test(rel)) return result(false, 'path must be indicators/<name>.js');
  const absolute = path.resolve(workspaceRoot, rel);
  if (!absolute.startsWith(workspaceRoot + path.sep)) return result(false, 'path escapes the QPRO indicator workspace');
  if (!fs.existsSync(absolute)) return result(false, `indicator file not found: ${rel}`);
  const stat = fs.statSync(absolute);
  if (!stat.isFile()) return result(false, `indicator path is not a file: ${rel}`);
  if (stat.size > maxBytes) return result(false, `indicator file exceeds ${maxBytes} byte limit`, {path: rel, size: stat.size});
  const source = fs.readFileSync(absolute, 'utf8');
  const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const issues = [];
  if (/\b(?:import|export)\s/.test(code)) issues.push('import/export syntax is not supported by QPRO runtime loading');
  if (/\b(?:require|module\.exports)\b/.test(code)) issues.push('CommonJS/module loading is not supported');
  if (/\b(?:document|window|localStorage|fetch|XMLHttpRequest)\b/.test(code)) issues.push('browser/network globals are not allowed in indicators');
  if (!/\b(?:const|let|var)\s+SETTINGS\b/.test(code)) issues.push('missing top-level SETTINGS declaration');
  if (!/\bfunction\s+calculate\s*\(/.test(code) && !/\b(?:const|let|var)\s+calculate\s*=/.test(code)) issues.push('missing calculate(data, settings, MathTA) function');
  try { new Function('data', 'settings', 'MathTA', `${source}\n;return {SETTINGS: typeof SETTINGS !== 'undefined' ? SETTINGS : undefined, calculate: typeof calculate === 'function' ? calculate : undefined};`); }
  catch (error) { issues.push(`syntax error: ${error.message}`); }
  return issues.length ? result(false, issues.join('; '), {path: rel, size: stat.size}) : result(true, null, {path: rel, size: stat.size});
}
async function liveCheck(rel) {
  const response = await fetch(`${baseUrl}/api/qpro/indicator-validate`, {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({path:rel})});
  const body = await response.json().catch(() => ({}));
  if (!response.ok || !body.ok) return result(false, body.error || `live validation HTTP ${response.status}`, {path:rel, validation:body.validation || null});
  return result(true, null, {path:rel, validation:body.validation || null, hash:body.hash || null});
}
async function main() {
  if (!requested) { print(result(false, 'usage: node qpro-indicator-check.js indicators/<name>.js [--live] [--json]')); process.exitCode=1; return; }
  const rel=String(requested).replace(/\\/g,'/').replace(/^\.\//,'');
  const local=localCheck(rel);
  if (!local.valid) { print(local); process.exitCode=1; return; }
  if (!live) { print(local); return; }
  try { const checked=await liveCheck(rel); print(checked); if (!checked.valid) process.exitCode=1; }
  catch(error) { print(result(false, `live validation unavailable: ${error.message}`, {path:rel})); process.exitCode=1; }
}
main();
