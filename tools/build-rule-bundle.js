#!/usr/bin/env node
// tools/build-rule-bundle.js — детерминированный сборщик правил для Builder Шаг 7.
//
// Контракт зафиксирован issue #205, не менять signature без отдельного issue.
// Поведение проверяется tests/scripts/build-rule-bundle-tests.js.
//
// CLI:    node tools/build-rule-bundle.js <slug1> [<slug2> ...]
// Stdout: {"rulesBySlug": {"<slug>": <rule.json contents>, ...}} (без trailing newline,
//         для безопасного embed в const bundle = JSON.parse('...'); внутри use_figma).
//
// Алгоритм: BFS от каждого top-level slug; следуем по slots[].preferred[].nestedProps.ruleRef,
// nestedInstances[*].ruleRef, booleans[*].nestedProps.ruleRef. Per-branch seen Set
// (cloned на каждом recurse) — это **per-branch depth cap = RULE_TREE_MAX_DEPTH** на длину
// цепочки от root до текущего slug'а, НЕ ограничение размера closure'а. Closure может
// быть широким (много siblings, в реестре до 41 правил у unicard-view) без срабатывания
// cap'а — capped только глубина одной ветки. Sync readFileSync — никаких BOM-конверсий,
// никакой normalize (preserves unicode pencil byte-for-byte).
//
// Exit codes:
//   0  ok
//   1  missing rule file (диагностика пути в stderr)
//   2  usage error
//   3  depth cap exceeded (>RULE_TREE_MAX_DEPTH) — защита, при здоровом реестре не должно случаться

'use strict';

const fs = require('fs');
const path = require('path');

const RULE_TREE_MAX_DEPTH = 10;
const RULES_DIR = path.resolve(__dirname, '..', 'rules', 'components');

function main() {
  const slugs = process.argv.slice(2);
  if (slugs.length === 0) {
    process.stderr.write('usage: node tools/build-rule-bundle.js <slug1> [<slug2> ...]\n');
    process.exit(2);
  }

  const rulesBySlug = {};
  for (const slug of slugs) {
    walk(slug, 0, new Set(), rulesBySlug);
  }

  process.stdout.write(JSON.stringify({ rulesBySlug }));
}

function walk(slug, depth, seen, out) {
  if (depth > RULE_TREE_MAX_DEPTH) {
    process.stderr.write(`depth cap exceeded at "${slug}" (>${RULE_TREE_MAX_DEPTH})\n`);
    process.exit(3);
  }
  if (seen.has(slug)) return;
  if (Object.prototype.hasOwnProperty.call(out, slug)) return;

  const filePath = path.join(RULES_DIR, `${slug}.rule.json`);
  if (!fs.existsSync(filePath)) {
    process.stderr.write(`missing rule file: ${filePath}\n`);
    process.exit(1);
  }

  const rule = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  out[slug] = rule;

  const nextSeen = new Set(seen);
  nextSeen.add(slug);

  for (const slotInfo of Object.values(rule.slots || {})) {
    for (const pref of (slotInfo.preferred || [])) {
      const ref = pref && pref.nestedProps && pref.nestedProps.ruleRef;
      if (ref) walk(ref, depth + 1, nextSeen, out);
    }
  }

  for (const entry of Object.values(rule.nestedInstances || {})) {
    const ref = entry && entry.ruleRef;
    if (ref) walk(ref, depth + 1, nextSeen, out);
  }

  for (const boolInfo of Object.values(rule.booleans || {})) {
    const ref = boolInfo && boolInfo.nestedProps && boolInfo.nestedProps.ruleRef;
    if (ref) walk(ref, depth + 1, nextSeen, out);
  }
}

main();
