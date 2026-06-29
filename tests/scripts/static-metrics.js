// Static metrics for /test quick mode.
// Usage: node tests/scripts/static-metrics.js
// Prints a single JSON object to stdout. /test command parses it for the report.

const fs = require("fs");
const path = require("path");

const idx = JSON.parse(fs.readFileSync("registry/index.json", "utf8"));
const componentNames = Object.keys(idx.components);
const componentsTotal = componentNames.length;

if (componentsTotal === 0) {
  console.error("static-metrics: registry/index.json пуст — нечего считать");
  process.exit(2);
}

const rulesDir = "rules/components";
const ruleFiles = fs.readdirSync(rulesDir).filter((f) => f.endsWith(".rule.json"));

const rulesByName = {};
for (const f of ruleFiles) {
  const rule = JSON.parse(fs.readFileSync(path.join(rulesDir, f), "utf8"));
  if (rule.name) rulesByName[rule.name] = rule;
}

// hasGuidance матчит CLAUDE.md определение «полная контекстная guidance»:
// непустое whenToUse ИЛИ непустые edgeCases ИЛИ хотя бы один usage
// в slots[].preferred[]. Все три пусты одновременно — guidance отсутствует.
function hasGuidance(rule) {
  const doc = rule.doc || {};
  if (doc.whenToUse && doc.whenToUse.trim()) return true;
  if (Array.isArray(doc.edgeCases) && doc.edgeCases.some((e) => e && e.trim())) return true;
  const slots = rule.slots || {};
  for (const slotKey of Object.keys(slots)) {
    const preferred = (slots[slotKey] || {}).preferred || [];
    if (preferred.some((p) => p && p.usage && p.usage.trim())) return true;
  }
  return false;
}

let rulesCovered = 0;
let propsDescribed = 0;
for (const name of componentNames) {
  const rule = rulesByName[name];
  if (!rule) continue;
  rulesCovered++;
  const hasProps =
    (rule.variants && Object.keys(rule.variants).length > 0) ||
    (rule.slots && Object.keys(rule.slots).length > 0) ||
    (Array.isArray(rule.booleans) && rule.booleans.length > 0) ||
    (rule.textProps && typeof rule.textProps === 'object' && Object.keys(rule.textProps).length > 0);
  if (hasGuidance(rule) && hasProps) propsDescribed++;
}

// Always-loaded tokens (rough estimate: bytes / 4).
// index.json excluded — since 2026-05-08 /builder greps it instead of reading whole (see O-007).
const staticContext = ["CLAUDE.md", "rules.md", "rules/skeleton.md", ".claude/commands/builder.md"];
let staticBytes = 0;
for (const p of staticContext) {
  if (fs.existsSync(p)) staticBytes += fs.statSync(p).size;
}

const out = {
  ts: new Date().toISOString(),
  mode: "quick",
  rulesCoveragePct: +((rulesCovered / componentsTotal) * 100).toFixed(1),
  propsDescribedCoveragePct: +((propsDescribed / componentsTotal) * 100).toFixed(1),
  alwaysLoadedTokensEst: Math.round(staticBytes / 4),
  buildSampleSeconds: null,
  buildSampleTokensIn: null,
  buildSampleTokensCacheRead: null,
  notes: "",
};

console.log(JSON.stringify(out, null, 2));
