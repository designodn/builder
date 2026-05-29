#!/usr/bin/env node
// smoke-mutation-pipeline: проверяет работоспособность /parseProps цепочки
// БЕЗ обращения к Figma MCP. Цель — ловить регрессии типа require-cycle
// leak (был в #141, BLOCKER 1: CLI switch в parseProps-utils.js выполнялся
// при require, ломал stub/apply-figma).
//
// Что прогоняется:
//   1. parseProps-stub.js --dry — проверяет require chain stub → utils.genIndex.
//   2. parseProps-preflight.js — проверяет чтение rule.json + decision tree.
//   3. parseProps-hypothesize.js — проверяет questions builder.
//   4. parseProps-microtest.js — проверяет codegen плагина (returns valid JS string).
//   5. parseProps-apply-figma.js с dummy result — проверяет require chain
//      apply-figma → utils.genIndex и что результат не падает на минимальном input.
//
// Берёт первый компонент из registry/index.json — детерминистично,
// не зависит от конкретного name.
//
// Usage: node tests/scripts/smoke-mutation-pipeline.js
// Exit 0 — всё ОК. Exit ≠ 0 — какая-то ступень упала, см. stderr.

const { execSync, spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const SCRIPTS = path.join(ROOT, 'tests/scripts');
const INDEX_PATH = path.join(ROOT, 'registry/index.json');

function fail(step, msg) {
  console.error(`✗ ${step}: ${msg}`);
  process.exit(1);
}

function run(script, args, opts = {}) {
  const res = spawnSync('node', [path.join(SCRIPTS, script), ...args], {
    cwd: ROOT,
    encoding: 'utf8',
    ...opts,
  });
  return { code: res.status, stdout: res.stdout || '', stderr: res.stderr || '' };
}

// ─── Pick test component ──────────────────────────────────────────────────────
if (!fs.existsSync(INDEX_PATH)) fail('setup', `${INDEX_PATH} not found — run gen-index first`);
const index = JSON.parse(fs.readFileSync(INDEX_PATH, 'utf8'));
const names = Object.keys(index.components || {});
if (names.length === 0) fail('setup', 'registry/index.json has no components');

// Берём header 1.1 — это reference-компонент (PR #142 явно его тестировал
// после #132). Если он по какой-то причине пропал — берём первый из index.
const TEST_NAME = names.includes('header 1.1') ? 'header 1.1' : names[0];

console.log(`smoke-pipeline: test component = "${TEST_NAME}"`);

// ─── Step 1: parseProps-stub --dry --force ────────────────────────────────────
// REGRESSION GUARD для #141 BLOCKER 1: если require-cycle между stub.js и
// parseProps-utils.js снова сломается, stderr начнётся с «Unknown command:».
// Прямой assert ловит этот класс регрессии артикулированно.
console.log('  [1/6] parseProps-stub --dry');
{
  const r = run('parseProps-stub.js', [TEST_NAME, '--dry', '--force']);
  if (/^Unknown command:/m.test(r.stderr) || /^Unknown command:/m.test(r.stdout)) {
    fail('stub:require-cycle', 'обнаружен «Unknown command:» — require-cycle регрессия (#141 BLOCKER 1). ' +
      'Проверь `if (require.main === module)` в parseProps-utils.js CLI switch.');
  }
  if (r.code !== 0) fail('stub', `exit ${r.code}\nstderr: ${r.stderr}\nstdout: ${r.stdout.slice(0, 500)}`);
  // Output должен быть валидным JSON rule.json
  let rule;
  try { rule = JSON.parse(r.stdout); }
  catch (e) { fail('stub', `output not valid JSON: ${e.message}\nstdout: ${r.stdout.slice(0, 500)}`); }
  if (rule.name !== TEST_NAME) fail('stub', `rule.name mismatch: expected "${TEST_NAME}", got "${rule.name}"`);
  if (!rule.doc || !rule.doc.whenToUse || rule.doc.whenToUse.length < 10) {
    fail('stub', `rule.doc.whenToUse missing or shorter than schema minLength: 10`);
  }
}

// ─── Step 2: parseProps-preflight ─────────────────────────────────────────────
console.log('  [2/6] parseProps-preflight');
{
  const r = run('parseProps-preflight.js', [TEST_NAME]);
  // Preflight может exit 3 (invalidApproval) — это валидный исход, не ошибка smoke.
  if (r.code !== 0 && r.code !== 3) fail('preflight', `exit ${r.code}\nstderr: ${r.stderr}`);
  let out;
  try { out = JSON.parse(r.stdout); }
  catch (e) { fail('preflight', `output not valid JSON: ${e.message}`); }
  if (!out.decision) fail('preflight', 'output missing .decision');
  // R-051 contract: явный вызов = full re-run; поля должны присутствовать.
  if (out.mode !== 'full-rerun') fail('preflight', `R-051: explicit call should be mode=full-rerun, got ${out.mode}`);
  if (out.reprobe !== true) fail('preflight', 'R-051: explicit call should set reprobe=true');
  if (typeof out.curatedConflict !== 'boolean') fail('preflight', 'R-051: output missing .curatedConflict');
  if (!out.existingCurated || !Array.isArray(out.existingCurated.fields)) fail('preflight', 'R-051: output missing .existingCurated.fields');
  // --cached путь: stage-gate, без re-probe.
  const rc = run('parseProps-preflight.js', [TEST_NAME, '--cached']);
  if (rc.code !== 0 && rc.code !== 3) fail('preflight --cached', `exit ${rc.code}`);
  let outc;
  try { outc = JSON.parse(rc.stdout); } catch (e) { fail('preflight --cached', `bad JSON: ${e.message}`); }
  if (outc.mode !== 'cached' || outc.reprobe !== false) fail('preflight --cached', `expected cached/no-reprobe, got mode=${outc.mode} reprobe=${outc.reprobe}`);
}

// ─── Step 3: parseProps-hypothesize (build questions) ─────────────────────────
console.log('  [3/6] parseProps-hypothesize (questions)');
{
  const r = run('parseProps-hypothesize.js', [TEST_NAME]);
  if (r.code !== 0) fail('hypothesize', `exit ${r.code}\nstderr: ${r.stderr}`);
  let out;
  try { out = JSON.parse(r.stdout); }
  catch (e) { fail('hypothesize', `output not valid JSON: ${e.message}`); }
  if (typeof out.total !== 'number') fail('hypothesize', 'output missing .total');
}

// ─── Step 4: parseProps-microtest (plugin codegen) ────────────────────────────
console.log('  [4/6] parseProps-microtest (plugin codegen)');
{
  const r = run('parseProps-microtest.js', [TEST_NAME]);
  if (r.code !== 0) fail('microtest', `exit ${r.code}\nstderr: ${r.stderr}`);
  let out;
  try { out = JSON.parse(r.stdout); }
  catch (e) { fail('microtest', `output not valid JSON: ${e.message}`); }
  if (typeof out.plugin !== 'string' || out.plugin.length < 100) {
    fail('microtest', `plugin code suspiciously short or missing (length: ${out.plugin?.length})`);
  }
  if (!out.meta || out.meta.hasRule !== true) fail('microtest', 'meta.hasRule !== true');
}

// ─── Step 5: parseProps-apply-figma with dummy result ─────────────────────────
// Side-effect: apply-figma всегда пишет <slug>.raw.json (даже если rule
// не изменился — обновляет lastMicrotest). Чтобы smoke не мутировал репо,
// backup'имся перед запуском и восстанавливаемся после.
console.log('  [5/6] parseProps-apply-figma (dummy result)');
{
  const slug = path.basename(
    fs.readdirSync(path.join(ROOT, 'rules/components'))
      .find(f => f.endsWith('.rule.json') &&
        JSON.parse(fs.readFileSync(path.join(ROOT, 'rules/components', f), 'utf8')).name === TEST_NAME)
    , '.rule.json'
  );
  const rulePath = path.join(ROOT, 'rules/components', `${slug}.rule.json`);
  const rawPath = path.join(ROOT, 'rules/components', `${slug}.raw.json`);
  const ruleBackup = fs.readFileSync(rulePath, 'utf8');
  const rawBackup = fs.existsSync(rawPath) ? fs.readFileSync(rawPath, 'utf8') : null;
  // apply-figma вызывает genIndex после writeJson(rule). Сейчас для dummy
  // result rule не меняется → genIndex выдаёт тот же index. Но если
  // apply-figma эволюционирует (например, добавит timestamp в rule даже
  // на no-op), index может разойтись с committed state. Bekup → restore
  // делает smoke устойчивым против таких изменений.
  const indexBackup = fs.readFileSync(INDEX_PATH, 'utf8');

  try {
    const dummyResult = JSON.stringify({
      autoPairs: {},
      bindings: [],
      booleanMatrix: [],
      results: [],
      visualCheck: {},
    });
    const r = run('parseProps-apply-figma.js', [TEST_NAME, `--result=${dummyResult}`]);
    if (r.code !== 0) fail('apply-figma', `exit ${r.code}\nstderr: ${r.stderr}\nstdout: ${r.stdout.slice(0, 500)}`);
    let out;
    try { out = JSON.parse(r.stdout); }
    catch (e) { fail('apply-figma', `output not valid JSON: ${e.message}`); }
    if (!out.ok) fail('apply-figma', `result.ok !== true: ${JSON.stringify(out)}`);
    // changedFields === 0 для dummy result — ок, ничего не поменялось в rule.
  } finally {
    // Restore — even if smoke failed, не оставляем мусор в working tree.
    fs.writeFileSync(rulePath, ruleBackup);
    fs.writeFileSync(INDEX_PATH, indexBackup);
    if (rawBackup !== null) fs.writeFileSync(rawPath, rawBackup);
    else if (fs.existsSync(rawPath)) fs.unlinkSync(rawPath);
  }
}

// Regression assert «Unknown command:» on apply-figma тоже — оно тоже
// делает require('./parseProps-utils.js'). Если выше step 5 прошёл exit 0
// без матча — значит require chain работает на обоих скриптах.

// ─── Step 6: parseProps-completeness --final (R-052 чеклист без microtest) ─────
console.log('  [6/6] parseProps-completeness --final');
{
  const slug = path.basename(
    fs.readdirSync(path.join(ROOT, 'rules/components'))
      .find(f => f.endsWith('.rule.json') &&
        JSON.parse(fs.readFileSync(path.join(ROOT, 'rules/components', f), 'utf8')).name === TEST_NAME)
    , '.rule.json'
  );
  const r = run('parseProps-completeness.js', ['--slug', slug, '--final']);
  if (r.code !== 0) fail('completeness --final', `exit ${r.code}\nstderr: ${r.stderr}`);
  // Чеклист — человекочитаемый (не JSON); проверяем ключевые строки R-052.
  if (!/✅ \/parseProps/.test(r.stdout)) fail('completeness --final', 'missing verdict header');
  if (!/usage coverage/.test(r.stdout) || !/Schema\/инварианты/.test(r.stdout)) {
    fail('completeness --final', 'missing R-052 checklist lines');
  }
}

console.log('✓ smoke-mutation-pipeline: all 6 steps passed');
