#!/usr/bin/env node
'use strict';

// Fast local preflight for assistant-driven indicator edits. This deliberately
// does not replace browser validation: only QPRO's live chart runtime can dry
// run an indicator against the current chart data and Apply boundary.
const fs = require('node:fs');
const path = require('node:path');

const workspaceRoot = path.join(__dirname, '.qpro', 'pi-workspace');
const maxBytes = 2 * 1024 * 1024;
const requested = process.argv[2];
const jsonOutput = process.argv.includes('--json');

function fail(error, details = {}) {
  const result = { valid: false, error, ...details };
  if (jsonOutput) console.log(JSON.stringify(result));
  else console.error(`✗ ${error}`);
  process.exitCode = 1;
}
function pass(result) {
  if (jsonOutput) console.log(JSON.stringify({ valid: true, ...result }));
  else console.log(`✓ ${result.path} · syntax and QPRO file preflight passed`);
}
if (!requested || requested === '--json') fail('usage: node qpro-indicator-check.js indicators/<name>.js [--json]');
else {
  const rel = String(requested).replace(/\\/g, '/').replace(/^\.\//, '');
  if (!/^indicators\/[a-zA-Z0-9._-]+\.js$/i.test(rel)) fail('path must be indicators/<name>.js');
  else {
    const absolute = path.resolve(workspaceRoot, rel);
    const workspacePrefix = workspaceRoot + path.sep;
    if (!absolute.startsWith(workspacePrefix)) fail('path escapes the QPRO indicator workspace');
    else if (!fs.existsSync(absolute)) fail(`indicator file not found: ${rel}`);
    else {
      const stat = fs.statSync(absolute);
      if (!stat.isFile()) fail(`indicator path is not a file: ${rel}`);
      else if (stat.size > maxBytes) fail(`indicator file exceeds ${maxBytes} byte limit`, { path: rel, size: stat.size });
      else {
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
        if (issues.length) fail(issues.join('; '), { path: rel, size: stat.size });
        else pass({ path: rel, size: stat.size });
      }
    }
  }
}
