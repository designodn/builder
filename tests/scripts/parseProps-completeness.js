#!/usr/bin/env node
// parseProps-completeness.js — read-only completeness checklist для /parseProps.
//
// Запускается ПОСЛЕ microtest-прогона (+ apply). Диагностирует, дошёл ли тест
// до глубины и нет ли дыр в правиле. НЕ мутирует файлы, НЕ блокирует approved —
// это runtime-репорт полноты теста, а не инвариант validate.
//
// 5 проверок:
//   1. nested linkage     — validated preferred, чей компонент имеет rule-файл,
//                           но без nestedProps.ruleRef (незалинкованный nested).
//                           Переиспользует findExpectedRuleRef (НЕ дублирует Inv9).
//   2. preferred coverage — INSTANCE_SWAP-слоты из inspected-props без хотя бы
//                           одного validated && !broken preferred (и без sourceLib).
//   3. depth reachability — union ownedExposed из booleanMatrix (дыры — placeholder
//                           после наполнения) + max reachedTextNodes + nested filled.
//   4. fill budget        — max fillBudgetUsed vs FILL_BUDGET (40).
//   5. sourceLib swap      — sourceLib-слоты (иконки): сколько получили sample-иконку
//                           в phase 5c. unsampled (нет sampleKey) — ⚠, failed (import
//                           провалился) — ✗. Только для компонентов с sourceLib.
//
// CLI:
//   node tests/scripts/parseProps-completeness.js --slug <slug> --result-file <path>
//   node tests/scripts/parseProps-completeness.js --slug <slug> --result='<json>'
//   ... --json
//
// Exit 0 всегда, кроме реальных ошибок (файл не найден / bad JSON / нет аргументов).

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { buildResolverCaches, findExpectedRuleRef } = require('./parseProps-utils.js');

const ROOT = path.resolve(__dirname, '..', '..');
const RULES_DIR = path.join(ROOT, 'rules/components');
const INSPECTED_PATH = path.join(ROOT, 'tests/scripts/inspected-props.json');

const FILL_BUDGET = 40;

function readJson(p) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; }
}

// ─── CLI parsing (паттерн из parseProps-apply-figma.js: --flag=val И --flag val) ──
function parseArgs(argv) {
  const out = { slug: null, resultFile: null, resultInline: null, json: false, final: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--json') { out.json = true; continue; }
    if (a === '--final') { out.final = true; continue; }
    if (a.startsWith('--slug=')) { out.slug = a.slice('--slug='.length); continue; }
    if (a === '--slug') { out.slug = argv[++i]; continue; }
    if (a.startsWith('--result-file=')) { out.resultFile = a.slice('--result-file='.length); continue; }
    if (a === '--result-file') { out.resultFile = argv[++i]; continue; }
    if (a.startsWith('--result=')) { out.resultInline = a.slice('--result='.length); continue; }
    if (a === '--result') { out.resultInline = argv[++i]; continue; }
  }
  return out;
}

function loadResult(args) {
  let raw;
  if (args.resultFile) {
    try { raw = fs.readFileSync(args.resultFile, 'utf8'); }
    catch (e) { console.error(`✗ не прочитать --result-file: ${e.message}`); process.exit(2); }
  } else if (args.resultInline != null) {
    raw = args.resultInline;
  } else {
    console.error('✗ нужен --result-file <path> или --result=<json>');
    process.exit(2);
  }
  try { return JSON.parse(raw); }
  catch (e) { console.error(`✗ bad JSON в result: ${e.message}`); process.exit(2); }
}

// ─── Checks ───────────────────────────────────────────────────────────────────

// 1. nested linkage — переиспользует findExpectedRuleRef (не дублирует Inv9).
function checkLinkage(rule, caches) {
  let total = 0, linked = 0, libraryLinked = 0;
  for (const slot of Object.values(rule.slots || {})) {
    // sourceLib слоты: контент из Figma-библиотеки (иконки, иллюстрации).
    // Линкованы через figmaFile+nodeId, а не через nestedProps.ruleRef —
    // считаем отдельно, не добавляем к total (не дыра в linkage).
    if (slot.sourceLib && slot.sourceLib.figmaFile && slot.sourceLib.nodeId) {
      libraryLinked++;
      continue;
    }
    for (const p of (slot.preferred || [])) {
      // Bugfix: был `!p.validated` — Gap B writes validated:false, такие entries пропускались.
      // Linkage должна быть консистентна с checkCoverage: считаем любой !broken с ключом.
      if (!p || p.broken || !p.key) continue;
      if (p.nestedProps === null) continue; // explicit opt-out (как в Inv9)
      const expected = findExpectedRuleRef(p, rule, caches);
      if (!expected) continue; // нет rule-файла для этого компонента — не считаем
      total++;
      const have = p.nestedProps && p.nestedProps.ruleRef;
      if (have === expected.slug) linked++;
    }
  }
  return { pass: linked === total, linked, total, libraryLinked };
}

// 2. preferred coverage — INSTANCE_SWAP-слоты из inspected-props.
function checkCoverage(rule, componentName) {
  const inspected = readJson(INSPECTED_PATH);
  const entry = inspected && inspected.components && inspected.components[componentName];
  const defs = (entry && entry.defs) || {};
  const swapSlots = Object.entries(defs)
    .filter(([, d]) => d && d.type === 'INSTANCE_SWAP')
    .map(([slotName]) => slotName);

  let covered = 0;
  const missing = [];
  for (const slotName of swapSlots) {
    const slot = (rule.slots || {})[slotName];
    if (slot && slot.sourceLib) { covered++; continue; }
    // Bugfix: был `p.validated && !p.broken` — Gap B writes validated:false, такие
    // entries всегда пропускались → slot навсегда считался missing. Правильнее:
    // любая не-broken запись с key считается "кандидатом"; validated — флаг ревью,
    // не критерий наличия. coverage.pass = «есть хоть один кандидат», а не «кандидат проверен».
    const hasValidated = !!(slot && (slot.preferred || []).some(p => p && !p.broken && p.key));
    if (hasValidated) covered++;
    else missing.push(slotName);
  }
  // total===0 даёт ложный «зелёный»: цикл не выполняется, missing пуст, pass=true.
  // Если в rule ЕСТЬ слоты, а inspected-props их не видит — это подозрительно
  // (устаревший/неполный inspect), помечаем видимым warning. Если и в rule слотов
  // нет — легитимный атом без слотов, pass:true ок.
  const ruleSlotCount = Object.keys(rule.slots || {}).length;
  const inspectedMissing = swapSlots.length === 0 && ruleSlotCount > 0;
  return { pass: missing.length === 0, covered, total: swapSlots.length, missing, inspectedMissing };
}

// 3. depth reachability — union ownedExposed + max reachedTextNodes + nested filled.
function checkDepth(result) {
  const matrix = Array.isArray(result.booleanMatrix) ? result.booleanMatrix : [];
  const exposedSet = new Set();
  let maxTextNodes = 0;
  let nestedFilled = 0;
  let textMutated = 0;
  const textUnfilled = new Set();
  for (const b of matrix) {
    if (!b) continue;
    for (const slot of (Array.isArray(b.ownedExposed) ? b.ownedExposed : [])) exposedSet.add(slot);
    if (typeof b.reachedTextNodes === 'number' && b.reachedTextNodes > maxTextNodes) {
      maxTextNodes = b.reachedTextNodes;
    }
    if (Array.isArray(b.ownedFilled)) nestedFilled += b.ownedFilled.length;
    const tr = b && b.textReport;
    if (!tr) continue;
    textMutated += (tr.textMutated || []).length;
    for (const u of (tr.textUnfilled || [])) textUnfilled.add(u);
  }
  const unfillable = [...exposedSet];
  // textUnfilled НЕ блокирует pass (warning, как fill budget) — pass только по unfillable.
  return {
    pass: unfillable.length === 0,
    reachedTextNodes: maxTextNodes,
    nestedFilled,
    unfillable,
    textMutated,
    textUnfilled: [...textUnfilled]
  };
}

// 5. sourceLib icon-swap (phase 5c) — сколько sourceLib-слотов получили sample-иконку.
// pass: нет sourceLib вообще (атом) ИЛИ все sampled И все swapped без ошибок.
// Два типа «неполноты»:
//   unsampled — sampleKey ещё не обнаружен (первый прогон): ⚠ не X
//   failed    — importComponentByKeyAsync провалился: ✗
function checkSourceLibSwap(rule, result) {
  let totalSourceLib = 0, withSampleKey = 0;
  // ruleUnsampledHints — hints слотов без sampleKey ИЗ ПРАВИЛА (источник истины
  // для hints, когда result.sourceLibUnsampled пуст/устарел).
  const ruleUnsampledHints = [];
  for (const [slotKey, slot] of Object.entries(rule.slots || {})) {
    if (!slot || !slot.sourceLib) continue;
    totalSourceLib++;
    if (slot.sourceLib.sampleKey) withSampleKey++;
    else ruleUnsampledHints.push(slot.sourceLib.hint || slotKey);
  }

  const probe = result && result.sourceLibProbe;
  const swapped = Array.isArray(probe && probe.swapped) ? probe.swapped.length : 0;
  const failed  = Array.isArray(probe && probe.failed)  ? probe.failed.length  : 0;
  // unsampled — источник истины ПРАВИЛО (withSampleKey vs total), не result:
  // result.sourceLibUnsampled может устареть (sampleKey добавили после прогона).
  // Hints берём из правила же — чтобы агент видел, какой слот discover'ить.
  const unsampled = totalSourceLib - withSampleKey;

  // pass: нет sourceLib (атом) ИЛИ все sampled и нет провалов.
  // Включается в top-level pass (см. main) — failed>0 не должен прятаться в зелёный.
  // Bugfix: был `swapped === withSampleKey` — ложный ✗ для boolean-gated слотов
  // (slot с sampleKey, но boolean OFF в пробе → swap не произошёл, swapped < withSampleKey).
  // swapped — функция видимости в пробе, не качества правила. Критерий: нет failed,
  // все slotKey самплированы (unsampled===0). Сколько реально свапнулось — info-only.
  const pass = totalSourceLib === 0 || (unsampled === 0 && failed === 0);
  return { pass, totalSourceLib, withSampleKey, unsampled, swapped, failed, unsampledHints: ruleUnsampledHints };
}

// 4. fill budget — max fillBudgetUsed vs FILL_BUDGET.
function checkFill(result) {
  const matrix = Array.isArray(result.booleanMatrix) ? result.booleanMatrix : [];
  let used = 0;
  for (const b of matrix) {
    if (b && typeof b.fillBudgetUsed === 'number' && b.fillBudgetUsed > used) used = b.fillBudgetUsed;
  }
  // pass:true даже при исчерпании — это warning, не fail. Маркер ⚠ в выводе.
  // Bugfix: was `pass: used < FILL_BUDGET` (false when exhausted) — противоречие
  // с комментарием; бюджет — индикатор сложности, не критерий качества правила.
  return { pass: true, used, budget: FILL_BUDGET };
}

// ─── Final checklist (R-052 / #293) — rule-derived, microtest-result необязателен ──

// Статус validate (schema + инварианты) через дочерний процесс — без exit-побочек.
function getValidateStatus(slug) {
  try {
    execFileSync('node', [path.join(__dirname, 'parseProps-utils.js'), 'validate', slug], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    return { clean: true, errors: [] };
  } catch (e) {
    const out = `${e.stdout || ''}${e.stderr || ''}`;
    const errors = out.split('\n').filter(l => /·|error|inv\d|schema/i.test(l)).map(l => l.trim()).filter(Boolean);
    return { clean: false, errors };
  }
}

function countMechanics(rule) {
  let preferred = 0;
  for (const slot of Object.values(rule.slots || {})) {
    preferred += (slot.preferred || []).filter(p => p && !p.broken && p.key).length;
  }
  return {
    preferred,
    variants: rule.variants ? Object.keys(rule.variants).length : 0,
    booleans: rule.booleans ? Object.keys(rule.booleans).length : 0,
    slots: rule.slots ? Object.keys(rule.slots).length : 0
  };
}

// usage coverage по R-049: usage нужен на КАЖДОМ validated preferred (не только при ≥2).
function computeUsageCoverage(rule) {
  let filled = 0, total = 0;
  for (const slot of Object.values(rule.slots || {})) {
    for (const p of (slot.preferred || [])) {
      if (!p || p.broken || !p.validated) continue;
      total++;
      if (p.usage && String(p.usage).trim()) filled++;
    }
  }
  return { filled, total };
}

// isDefault на каждый слот с ≥1 validated: ожидается ровно один.
function computeIsDefault(rule) {
  const rows = [];
  for (const [slotName, slot] of Object.entries(rule.slots || {})) {
    const validated = (slot.preferred || []).filter(p => p && p.validated && !p.broken);
    if (!validated.length) continue;
    const defaults = validated.filter(p => p.isDefault);
    rows.push({ slot: slotName, defaultName: defaults[0] ? defaults[0].name : null, count: defaults.length, validated: validated.length });
  }
  return rows;
}

function printFinalChecklist(rule, slug, linkage, coverage, vstatus, opts = {}) {
  const mech = countMechanics(rule);
  const usage = computeUsageCoverage(rule);
  const defaults = computeIsDefault(rule);
  const verdict = opts.verdict || (vstatus.clean ? 'ok' : 'needs-fix');

  const defWarn = defaults.filter(d => d.count !== 1);
  const next = [];
  if (linkage.total - linkage.linked > 0) next.push(`слинковать nested (${linkage.total - linkage.linked})`);
  if (usage.total - usage.filled > 0) next.push(`заполнить usage (${usage.total - usage.filled})`);
  if (defWarn.length) next.push(`проставить isDefault (${defWarn.map(d => d.slot).join(', ')})`);
  if (!coverage.pass) next.push(`preferred-кандидаты для слотов: ${coverage.missing.join(', ')}`);
  if (!vstatus.clean) next.push('починить schema/инварианты');

  console.log(`\n✅ /parseProps ${rule.name || slug} — ${verdict}`);
  console.log(`• Механика: ${mech.preferred} preferred, ${mech.variants} variants, ${mech.booleans} booleans, ${mech.slots} slots`);
  if (defaults.length) {
    const ds = defaults.map(d => d.count === 1 ? `${d.slot.split('#')[0]}→${d.defaultName}` : `⚠️ ${d.slot.split('#')[0]}:${d.count}`).join(' | ');
    console.log(`• isDefault: ${ds}`);
  } else {
    console.log(`• isDefault: — (нет слотов с validated preferred)`);
  }
  const linkMark = linkage.linked === linkage.total ? '' : ' ⚠️';
  const libNote = linkage.libraryLinked > 0 ? ` (+${linkage.libraryLinked} sourceLib)` : '';
  console.log(`• ruleRef closure: ${linkage.linked}/${linkage.total} nested слинковано${libNote}${linkMark}`);
  console.log(`• usage coverage: ${usage.filled}/${usage.total} validated preferred заполнены${usage.filled === usage.total ? '' : ' ⚠️'}`);
  console.log(`• Schema/инварианты: ${vstatus.clean ? '✅ чисто' : '❌ ' + (vstatus.errors.slice(0, 3).join(' | ') || 'есть ошибки')}`);
  console.log(`• approved: ${rule.approved === true ? 'true' : 'false (поднимет Настя)'}`);
  console.log(`• Nested-вопрос: подтверди, что про каждый вложенный спрошено «парсить глубже / атом» (R-051 Шаг 4.5.5)`);
  console.log(`• Следующий шаг: ${next.length ? next.join('; ') : 'ничего — компонент закрыт'}`);
}

// ─── Main ───────────────────────────────────────────────────────────────────

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.slug) { console.error('✗ нужен --slug <slug>'); process.exit(2); }

  const rulePath = path.join(RULES_DIR, `${args.slug}.rule.json`);
  const rule = readJson(rulePath);
  if (!rule) { console.error(`✗ не прочитать rule: ${rulePath}`); process.exit(3); }

  const caches = buildResolverCaches();
  const linkage = checkLinkage(rule, caches);
  const coverage = checkCoverage(rule, rule.name);

  // --final: финальный чеклист R-052. Microtest-result НЕ обязателен —
  // если его нет, печатаем rule-derived чеклист (verdict/isDefault/usage/closure/schema).
  const hasResult = args.resultFile || args.resultInline != null;
  if (args.final && !hasResult) {
    const vstatus = getValidateStatus(args.slug);
    printFinalChecklist(rule, args.slug, linkage, coverage, vstatus);
    return;
  }

  const result = loadResult(args);
  const depth = checkDepth(result);
  const fill = checkFill(result);
  const sourceLibSwap = checkSourceLibSwap(rule, result);

  // fill.pass всегда true (budget exhaustion — warning, не fail; см. checkFill)
  const pass = linkage.pass && coverage.pass && depth.pass && sourceLibSwap.pass;

  if (args.json) {
    console.log(JSON.stringify({
      slug: args.slug,
      checks: { linkage, coverage, depth, fill, sourceLibSwap },
      pass
    }, null, 2));
    return;
  }

  const mark = ok => (ok ? '✓' : '✗');
  const missingStr = coverage.missing.length ? coverage.missing.join(', ') : 'none';
  const unfillStr = depth.unfillable.length ? depth.unfillable.join(', ') : 'none';
  const textOk = depth.textMutated > 0 && depth.textUnfilled.length === 0;
  const libNote = linkage.libraryLinked > 0 ? ` + ${linkage.libraryLinked} library-linked (sourceLib)` : '';
  console.log(`## Completeness: ${args.slug}`);
  console.log(`[${mark(linkage.pass)}] nested linkage      ${linkage.linked}/${linkage.total} preferred linked to rule files${libNote}`);
  const coverageNote = coverage.inspectedMissing ? ' ⚠ (inspected-props пуст для компонента)' : '';
  console.log(`[${mark(coverage.pass)}] preferred coverage  ${coverage.covered}/${coverage.total} slots have preferred candidates (missing: ${missingStr})${coverageNote}`);
  console.log(`[${mark(depth.pass)}] depth reachability  reached ${depth.reachedTextNodes} TEXT nodes, ${depth.nestedFilled} nested filled, ${depth.unfillable.length} unfillable (${unfillStr})`);
  console.log(`[${textOk ? '✓' : '⚠'}] text reachability   mutated ${depth.textMutated} text nodes, ${depth.textUnfilled.length} unfilled (no sampleText in rule)`);
  // Bugfix display: fill.pass всегда true (warning, не fail); mark по фактическому budget.
  console.log(`[${fill.used < fill.budget ? '✓' : '⚠'}] fill budget         ${fill.used}/${fill.budget} imports used`);
  if (sourceLibSwap.totalSourceLib > 0) {
    const hasProblems = sourceLibSwap.unsampled > 0 || sourceLibSwap.failed > 0;
    const swapMark = !hasProblems ? '✓' : (sourceLibSwap.failed > 0 ? '✗' : '⚠');
    let swapNote = `${sourceLibSwap.swapped}/${sourceLibSwap.withSampleKey} swapped`;
    if (sourceLibSwap.unsampled > 0) {
      const hints = sourceLibSwap.unsampledHints.join(', ');
      swapNote += ` ⚠ ${sourceLibSwap.unsampled} no sampleKey (hints: ${hints || '?'}) — run /parseProps again after discovery`;
    }
    if (sourceLibSwap.failed > 0) swapNote += ` ✗ ${sourceLibSwap.failed} import failed`;
    console.log(`[${swapMark}] sourceLib swap      ${swapNote}`);
  }

  // R-052: финальный чеклист закрытия — печатается и при наличии microtest-результата.
  if (args.final) {
    const vstatus = getValidateStatus(args.slug);
    const verdict = pass ? 'pass' : 'incomplete';
    printFinalChecklist(rule, args.slug, linkage, coverage, vstatus, { verdict });
  }
}

main();
