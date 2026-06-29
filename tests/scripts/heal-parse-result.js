#!/usr/bin/env node
// heal-parse-result: извлекает JSON из use_figma error message с префиксом HEAL_RESULT:.
//
// Usage:
//   echo "<error message>" | node tests/scripts/heal-parse-result.js
//   node tests/scripts/heal-parse-result.js --text "<error message>"
//
// Output: чистый JSON-объект или JSON {"error": "<reason>"} при провале парсинга.

const fs = require('fs');

function parse(text) {
  if (!text) return { error: 'empty input' };
  const m = text.match(/HEAL_RESULT:([\s\S]*?)(?=\n\s*at\s|$)/);
  if (!m) return { error: 'no HEAL_RESULT marker', sample: text.slice(0, 200) };
  let raw = m[1].trim();
  // tail-trim non-JSON suffix if any
  const lastBrace = raw.lastIndexOf('}');
  if (lastBrace !== -1) raw = raw.slice(0, lastBrace + 1);
  try { return JSON.parse(raw); }
  catch (e) { return { error: 'JSON parse failed: ' + e.message, raw: raw.slice(0, 300) }; }
}

const textFlag = process.argv.find(a => a.startsWith('--text='));
let input;
if (textFlag) input = textFlag.slice('--text='.length);
else if (!process.stdin.isTTY) input = fs.readFileSync(0, 'utf8');
else { console.error('Pipe error text or pass --text=...'); process.exit(1); }

console.log(JSON.stringify(parse(input), null, 2));
