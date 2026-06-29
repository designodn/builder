#!/usr/bin/env node
// build-rule-bundle-tests — sub-MVP test для tools/build-rule-bundle.js (issue #205, Step 1).
//
// Sub-MVP scope: один smoke-тест на реальной фикстуре (meshok-up → navbar).
// Полный test pack (b/c/d/e/f) приедет вместе с PR-B (helper rewrite).
//
// Запуск: node tests/scripts/build-rule-bundle-tests.js

'use strict';

const assert = require('assert');
const fs = require('fs');
const { execFileSync, spawnSync } = require('child_process');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const BUNDLER = path.join(ROOT, 'tools', 'build-rule-bundle.js');
const RULES_DIR = path.join(ROOT, 'rules', 'components');

// ── Test (a): smoke — bundler собирает закрытие meshok-up корректно ─────
(function testMeshokUpClosure() {
  // meshok-up имеет nestedProps.ruleRef → navbar (в navbar#1491:0 → preferred[0]).
  // Это самый репрезентативный single-slug кейс: проверяем что BFS реально проходит
  // первый уровень рекурсии, а не останавливается на корне.
  const stdout = execFileSync('node', [BUNDLER, 'meshok-up'], { encoding: 'utf8' });

  // 1. Stdout — валидный JSON.
  let bundle;
  assert.doesNotThrow(() => { bundle = JSON.parse(stdout); }, 'stdout должен быть валидным JSON');

  // 2. Корневая структура.
  assert.ok(bundle.rulesBySlug, 'bundle.rulesBySlug отсутствует');
  assert.strictEqual(typeof bundle.rulesBySlug, 'object', 'rulesBySlug — объект');

  // 3. Top-level slug в bundle.
  assert.ok(bundle.rulesBySlug['meshok-up'], 'meshok-up отсутствует в rulesBySlug');
  assert.strictEqual(bundle.rulesBySlug['meshok-up'].slug, 'meshok-up', 'meshok-up.slug field mismatch');

  // 4. Транзитивная рекурсия: navbar должен быть подтянут через nestedProps.ruleRef.
  assert.ok(bundle.rulesBySlug['navbar'], 'navbar отсутствует — BFS не прошёл первый уровень');
  assert.strictEqual(bundle.rulesBySlug['navbar'].slug, 'navbar', 'navbar.slug field mismatch');

  // 5. Stdout без trailing newline (для безопасного embed в const bundle = JSON.parse('...')).
  assert.strictEqual(stdout[stdout.length - 1] !== '\n', true, 'stdout не должен иметь trailing newline');

  // 6. meta.depth self-describing — runtime читает оттуда, не из rules/builder-constants.json.
  const constantsPath = path.join(ROOT, 'rules', 'builder-constants.json');
  const constants = JSON.parse(fs.readFileSync(constantsPath, 'utf8'));
  assert.ok(bundle.meta, 'bundle.meta отсутствует — bundler не эмитит self-describing metadata');
  assert.strictEqual(bundle.meta.depth, constants.RULE_TREE_MAX_DEPTH,
    'bundle.meta.depth должен равняться rules/builder-constants.json RULE_TREE_MAX_DEPTH');

  console.log('ok 1 — meshok-up closure: BFS подтягивает navbar через nestedProps.ruleRef (+ meta.depth)');
})();

// ── Test (a.err.usage): empty args → exit 2 ────────────────────────────
(function testUsageError() {
  const result = spawnSync('node', [BUNDLER], { encoding: 'utf8' });
  assert.strictEqual(result.status, 2, 'empty args должны давать exit 2');
  assert.match(result.stderr, /usage:/, 'stderr должен содержать usage:');
  console.log('ok 2 — empty args → exit 2 с usage в stderr');
})();

// ── Test (a.err.missing): unknown slug → exit 1 ────────────────────────
(function testMissingRule() {
  const result = spawnSync('node', [BUNDLER, '__nonexistent_slug__'], { encoding: 'utf8' });
  assert.strictEqual(result.status, 1, 'missing rule file → exit 1');
  assert.match(result.stderr, /missing rule file/, 'stderr должен содержать "missing rule file"');
  console.log('ok 3 — missing slug → exit 1 с диагностикой в stderr');
})();

// ── Test (a.schema): bundle preserves source rule.json byte-for-byte ──
// Per architect review (PR #278): helper (builder.md:619+) читает slots[].preferred[].key,
// pairedBoolean, pairedBooleanOverride, booleans[].alwaysOn|defaultOn, variants, textProps,
// layoutRules, nestedInstances. Если bundler когда-нибудь начнёт стрипать поля —
// PR-B будет дебажить не тот файл. Этот тест ловит регрессию заранее.
(function testSchemaPreservation() {
  // Берём composite с богатым набором полей: slots, booleans, layoutRules, nestedProps.
  const slug = 'meshok-up';
  const stdout = execFileSync('node', [BUNDLER, slug], { encoding: 'utf8' });
  const bundle = JSON.parse(stdout);

  // Для каждого slug в bundle сравниваем deep-equal с исходным rule.json на диске.
  for (const [bundledSlug, bundledRule] of Object.entries(bundle.rulesBySlug)) {
    const srcPath = path.join(RULES_DIR, `${bundledSlug}.rule.json`);
    const sourceRule = JSON.parse(fs.readFileSync(srcPath, 'utf8'));
    assert.deepStrictEqual(
      bundledRule,
      sourceRule,
      `bundle.rulesBySlug["${bundledSlug}"] ≠ исходный ${bundledSlug}.rule.json — bundler стрипает или мутирует поля`
    );
  }
  console.log(`ok 4 — bundle deep-equal со source rule.json (closure ${slug} = ${Object.keys(bundle.rulesBySlug).length} правил)`);
})();

console.log('# all tests passed');
