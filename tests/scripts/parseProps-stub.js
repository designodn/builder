#!/usr/bin/env node
// parseProps-stub: создаёт минимальный rules/components/<slug>.rule.json
// для компонента из registry. Все поля-пропы помечаются TODO — они заполняются
// через microtest + apply-figma + hypothesize.
//
// Usage:
//   node tests/scripts/parseProps-stub.js "<componentName>"           # создать .rule.json
//   node tests/scripts/parseProps-stub.js "<componentName>" --dry     # вывести в stdout
//   node tests/scripts/parseProps-stub.js "<componentName>" --force   # перезаписать если есть

const fs = require('fs');
const path = require('path');
const { genIndex } = require('./parseProps-utils.js');

const ROOT = path.resolve(__dirname, '..', '..');
const REGISTRY = JSON.parse(fs.readFileSync(path.join(ROOT, 'registry/index.json'), 'utf8'));
const RULES_DIR = path.join(ROOT, 'rules/components');

// ─── slugify (инлайн-копия из parseProps-utils.js) ────────────────────────────
function slugify(name) {
  return name
    .replace(/\s+\d+\.\d+(\.\d+)?(?=\s*$|\s+[^\w\d])/, '')
    .replace(/↓/g, 'down')
    .replace(/↑/g, 'up')
    .replace(/[❖◇·\s.]+/g, '-')
    .replace(/[^a-zA-Z0-9-]/g, '')
    .toLowerCase()
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

// Определяет tier по наличию INSTANCE_SWAP и структуре имени.
// Это эвристика — microtest + apply-figma могут исправить.
function guessTier(name, type) {
  const lower = name.toLowerCase();
  // view-контейнеры имеют характерные маркеры
  if (lower.includes('view') || lower.includes('card')) return 'composite';
  // bottomSheet, dropdown, modal, featureBanner — composite/view
  if (lower.includes('sheet') || lower.includes('banner') || lower.includes('dropdown')) return 'composite';
  // component_set без явных признаков — atom по умолчанию
  if (type === 'c') return 'atom';
  // component_set (type 's') — скорее всего composite (есть варианты)
  return 'composite';
}

function generateStub(name) {
  const regEntry = REGISTRY.components[name];
  if (!regEntry) throw new Error(`not in registry: ${name}`);

  const [lib, key, type] = regEntry;
  const slug = slugify(name);
  const tier = guessTier(name, type);

  const rule = {
    $schema: '../schema/component-rule.schema.json',
    name,
    slug,
    lib,
    key,
    type,
    tier,
    approved: false,
    doc: {
      // minLength: 10 в schema — нужно дать понятный плейсхолдер,
      // чтобы свежесозданный stub проходил `validate <slug>` (pre-commit
      // и CI). Заполнить осмысленно через `/parseProps --hypothesize`.
      whenToUse: `TODO: описание компонента «${name}»`
    },
    layoutRules: null,
    variants: null,
    slots: {},
    booleans: {},
    textProps: null
  };

  return { rule, slug };
}

const arg = process.argv[2];
if (!arg) { console.error('Usage: parseProps-stub.js "<componentName>" [--dry] [--force]'); process.exit(1); }

const dry = process.argv.includes('--dry');
const force = process.argv.includes('--force');

try {
  const { rule, slug } = generateStub(arg);
  const relPath = `rules/components/${slug}.rule.json`;
  const fullPath = path.join(ROOT, relPath);

  if (fs.existsSync(fullPath) && !force) {
    console.error(`File exists: ${relPath} (use --force to overwrite)`);
    process.exit(2);
  }

  if (dry) {
    console.log(JSON.stringify(rule, null, 2));
  } else {
    fs.writeFileSync(fullPath, JSON.stringify(rule, null, 2) + '\n');
    // Авто-регенерация registry/index.json — чтобы новый компонент сразу
    // появился в derived cache. Без этого Builder/microtest его не увидят
    // до ручного gen-index.
    let indexStats = null;
    try {
      indexStats = genIndex();
    } catch (e) {
      console.error(`⚠ rule.json создан, но genIndex упал: ${e.message}`);
      console.error('   Запусти руками: node tests/scripts/parseProps-utils.js gen-index');
    }
    console.log(JSON.stringify({ ok: true, file: relPath, slug, tier: rule.tier, indexEntries: indexStats?.components ?? null }, null, 2));
  }
} catch (e) {
  console.error('Error:', e.message);
  process.exit(2);
}
