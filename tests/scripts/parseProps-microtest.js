#!/usr/bin/env node
// parseProps-microtest: генерирует плагин-код для одного use_figma-вызова.
// Сам Figma MCP отсюда не зовётся — агент берёт строку и подаёт в use_figma.
//
// Фазы микротеста:
//   1. baseline         — createInstance, snapshot default state + PNG bytes
//   2. mutability       — попытаться оверрайдить text/swap/variant, проверить что применилось
//   3. visual diff      — PNG после mutation должен отличаться от baseline (мутации видны)
//   4. asserts          — собрать 9 ассертов из всех фаз
//   5. boolean-matrix   — fresh instance на КАЖДЫЙ BOOLEAN-проп с !default значением;
//                         регистрируем какие INSTANCE_SWAP-слоты теперь экспонируют 12:6.
//                         Все инстансы остаются в sandbox grid → один get_screenshot
//                         покрывает baseline + N booleans для визуального чека.
//
// Плагин возвращает результат через `return value` — use_figma капчурит return.
// ВАЖНО: НЕ использовать throw — Figma откатывает все изменения плагина при
// uncaught exception, sandbox исчезнет. Только return.
//
// Sandbox СОХРАНЯЕТСЯ после микротеста: instances остаются в `__heal_sandbox__ <NAME>`
// фрейме, чтобы агент мог сделать get_screenshot(sandbox.id) и провести визуальный
// sanity-check. Cleanup — отдельным вызовом heal-cleanup-sandbox.js (не переименован в Phase 1).
//
// Usage:
//   node tests/scripts/parseProps-microtest.js "<componentName>"           # default variant
//   node tests/scripts/parseProps-microtest.js "<componentName>" --matrix  # full matrix (max 12)

const fs = require('fs');
const path = require('path');

const { buildResolverCaches, findExpectedRuleRef } = require('./parseProps-utils.js');

const ROOT = path.resolve(__dirname, '..', '..');
const REGISTRY = JSON.parse(fs.readFileSync(path.join(ROOT, 'registry/index.json'), 'utf8'));
const INSPECTED = JSON.parse(fs.readFileSync(path.join(ROOT, 'tests/scripts/inspected-props.json'), 'utf8'));
const RULES_DIR = path.join(ROOT, 'rules/components');

// Nested-closure (--close-nested): кандидаты, у которых валидный preferred ссылается
// на компонент БЕЗ rule-файла. Возвращает [{slot, key, name}] для Figma-discovery.
// Переиспользует findExpectedRuleRef — если ref уже резолвится (rule есть), пропускаем.
function nestedDiscoveryTargets(rule) {
  if (!rule || !rule.slots) return [];
  const caches = buildResolverCaches();
  const out = [];
  for (const [slotKey, slot] of Object.entries(rule.slots)) {
    for (const p of (slot.preferred || [])) {
      if (!p || p.broken || !p.validated || !p.key || !p.name) continue;
      if (p.nestedProps && p.nestedProps.ruleRef) continue;        // уже залинкован
      if (findExpectedRuleRef(p, rule, caches)) continue;           // rule-файл уже резолвится
      out.push({ slot: slotKey, key: p.key, name: p.name });
    }
  }
  return out;
}

// Slugify inline (избегаем cycle import); должен совпадать с parseProps-utils.js
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

// Загружает rule.json по имени компонента. Возвращает {} если файла нет
// (компонент не описан правилом — microtest всё равно может прогнаться,
// но без curated preferred[] и layoutRules).
function loadRuleFor(name) {
  const rulePath = path.join(RULES_DIR, `${slugify(name)}.rule.json`);
  if (!fs.existsSync(rulePath)) return {};
  try { return JSON.parse(fs.readFileSync(rulePath, 'utf8')); } catch { return {}; }
}

// Загружает rule.json напрямую по slug (для nestedProps.ruleRef — ruleRef уже slug).
// Возвращает null если файла нет/невалиден — отличаем «нет правила» от пустого {}.
function loadRuleBySlug(slug) {
  if (!slug) return null;
  const rulePath = path.join(RULES_DIR, `${slug}.rule.json`);
  if (!fs.existsSync(rulePath)) return null;
  try { return JSON.parse(fs.readFileSync(rulePath, 'utf8')); } catch { return null; }
}

// slotKey -> ключ preferred-варианта (isDefault && validated && !broken),
// либо первый validated non-broken. СТРОГО из rule.slots, без inspected fallback.
function defaultKeysOf(r) {
  const out = {};
  for (const [slotKey, slot] of Object.entries((r && r.slots) || {})) {
    const prefs = slot.preferred || [];
    const pref = prefs.find(p => p && p.isDefault && p.validated && !p.broken && p.key && !BROKEN_PLACEHOLDER_KEYS.has(p.key));
    const chosen = pref || prefs.find(p => p && p.validated && !p.broken && p.key && !BROKEN_PLACEHOLDER_KEYS.has(p.key));
    if (chosen) out[slotKey] = { key: chosen.key, ruleRef: (chosen.nestedProps && chosen.nestedProps.ruleRef) || null };
  }
  return out;
}

// propName -> sampleTexts[0], только если есть. Дыра остаётся дырой.
function textSamplesOf(r) {
  const out = {};
  for (const [p, t] of Object.entries((r && r.textProps) || {})) {
    if (t && Array.isArray(t.sampleTexts) && t.sampleTexts.length) out[p] = t.sampleTexts[0];
  }
  return out;
}
function textNodeSampleOf(r) {
  const tn = r && r.textNode;
  if (!tn || !Array.isArray(tn.sampleTexts) || !tn.sampleTexts.length) return null;
  return { text: tn.sampleTexts[0], font: tn.font || null, name: tn.name || null, visibleBy: tn.visibleBy || null };
}

// Транзитивно собирает defaults вложенных правил по nestedProps.ruleRef.
// depth ≤ 3, anti-cycle по slug (seen). Возвращает
// { <slug>: { defaults, textProps, textNode } }.
function collectNestedRules(r, depth, seen) {
  if (depth > 3) return {};
  const out = {};
  for (const slot of Object.values((r && r.slots) || {})) {
    for (const pref of (slot.preferred || [])) {
      const ref = pref && pref.nestedProps && pref.nestedProps.ruleRef;
      if (!ref || seen.has(ref)) continue;
      seen.add(ref);
      const child = loadRuleBySlug(ref);
      if (!child) continue;
      out[ref] = {
        defaults: defaultKeysOf(child),
        textProps: textSamplesOf(child),
        textNode: textNodeSampleOf(child),
        sourceLib: sourceLibSamplesOf(child).keys   // {slotKey: {key, hint}} — для рекурсивного icon-swap
      };
      Object.assign(out, collectNestedRules(child, depth + 1, seen));
    }
  }
  return out;
}

// Карта owned-preferred верхнего уровня: slotKey -> validated non-broken key.
// СТРОГО из rule.slots, без inspected fallback — дыра в правиле остаётся дырой.
function ownedPreferredMap(rule) {
  const out = {};
  for (const [slotKey, slot] of Object.entries((rule && rule.slots) || {})) {
    const chosen = (slot.preferred || []).find(p => p && p.validated && !p.broken && p.key && !BROKEN_PLACEHOLDER_KEYS.has(p.key));
    if (chosen) out[slotKey] = { key: chosen.key, ruleRef: (chosen.nestedProps && chosen.nestedProps.ruleRef) || null };
  }
  return out;
}

// sourceLib слоты: собирает sample-ключи (phase 5c icon-swap probe).
// Возвращает:
//   keys      — {slotKey: {key, hint}} для слотов с sourceLib.sampleKey (свапаем в microtest)
//   unsampled — [{slotKey, hint}]      для слотов без sampleKey (ещё не обнаружены)
function sourceLibSamplesOf(rule) {
  const keys = {}, unsampled = [];
  for (const [slotKey, slot] of Object.entries((rule && rule.slots) || {})) {
    if (!slot || !slot.sourceLib) continue;
    if (slot.sourceLib.sampleKey) {
      keys[slotKey] = { key: slot.sourceLib.sampleKey, hint: slot.sourceLib.hint || '' };
    } else {
      unsampled.push({ slotKey, hint: slot.sourceLib.hint || '' });
    }
  }
  return { keys, unsampled };
}

// Convert rule.json shape → данные, нужные microtest'у.
// {
//   slots: { <prop>: { preferredValues: [...] } }   // shape compat с _index.json
//   layoutRules,
//   pairedProps: [{ boolean, swap }],
//   pairedGroups: [] (rule schema one-to-one only; one-to-many — legacy, не нужно)
// }
//
// КОНТРАКТ paired-данных (#141, после миграции с _index.json):
//
// Старый _index.json хранил pairedProps/pairedGroups как top-level cache —
// например, для navbar 1.0 (3 swap-пары), search 1.0 (2 text + 2 swap),
// button 1.1 (1 swap + 1 one-to-many группа `addons → 4 size-slots`).
//
// В rule.json есть только `booleans[].pairedSlot: string` (one-to-one). Часть
// cache'а сюда не помещается:
//   - boolean → text связки (search "label/hint") — нет pairedText в schema.
//   - one-to-many (button "addons → 4 size-conditional slots") — нет pairedSlots[].
//
// Эти случаи НЕ потеряны функционально: microtest:308-314 (boolean-matrix phase)
// строит per-instance map `eBoolsByRoot[rootName(propName)]` и для каждого
// INSTANCE_SWAP пропа находит owner-boolean через rootName-match. Это
// поведенческий фоллбек, который покрывает ВСЕ перечисленные случаи:
//
//   - search:  label#2014:8 → ✏️ label#2014:84   → rootName "label" совпадает ✅
//   - search:  right ->#2014:65 → ✏️ right#5911:75 → rootName "right" совпадает ✅
//   - navbar:  <- left#1031:9 → ✎ ← left#1031:0   → rootName "left" совпадает ✅
//   - button:  addons#3319:980 → ✎ addons [N]#... → rootName "addons" совпадает
//              (microtest:158 strip'ает ` [N]` суффикс) ✅
//
// pairedProps в ruleAsIndexEntry — это explicit-form через rule.booleans.pairedSlot
// (microtest предпочитает explicit над fallback). rootName-fallback покрывает
// тех, у кого explicit нет. После #141 это **единственный контракт**;
// precomputed cache отменён.
//
// Если когда-нибудь rootName начнёт промахиваться (новый компонент с
// несовпадающими именами boolean/slot) — расширить schema (pairedSlots[]
// для one-to-many, pairedText для TEXT) и заполнить руками через /parseProps.
function ruleAsIndexEntry(rule) {
  if (!rule) return {};
  const slots = {};
  if (rule.slots) {
    for (const [slotName, slot] of Object.entries(rule.slots)) {
      // rule.slots[X].preferred[] → indexEntry.slots[X].preferredValues
      // структура полей (key/name/validated/broken) совпадает
      slots[slotName] = { preferredValues: slot.preferred || [] };
    }
  }
  // pairedProps derive: для каждого boolean с pairedSlot → {boolean, swap}.
  // ВАЖНО: это subset of paired data — rootName-fallback в плагине покрывает
  // остальное (см. КОНТРАКТ выше). Не паниковать если pairedProps пустой
  // для navbar/search/button — boolean-matrix phase всё равно работает.
  const pairedProps = [];
  if (rule.booleans) {
    for (const [boolName, bool] of Object.entries(rule.booleans)) {
      if (bool && bool.pairedSlot) {
        pairedProps.push({ boolean: boolName, swap: bool.pairedSlot });
      }
    }
  }
  return {
    slots,
    layoutRules: rule.layoutRules || null,
    pairedProps,
    pairedGroups: [],  // rule schema one-to-one only — см. КОНТРАКТ
  };
}

const PLACEHOLDER_TEXTS = ['Title', 'Заголовок', 'text', 'Text', 'Описание', 'subtitle', 'label', 'Button', 'Кнопка'];

function getDefaultVariants(propsEntry) {
  if (!propsEntry || !propsEntry.defs) return {};
  const out = {};
  for (const [name, def] of Object.entries(propsEntry.defs)) {
    if (def.type === 'VARIANT' && def.defaultValue !== undefined) {
      out[name.split('#')[0]] = def.defaultValue;
    }
  }
  return out;
}

function getVariantMatrix(propsEntry, max = 12) {
  if (!propsEntry || !propsEntry.defs) return [{}];
  const variantDefs = Object.entries(propsEntry.defs).filter(([, d]) => d.type === 'VARIANT' && Array.isArray(d.options));
  if (!variantDefs.length) return [{}];
  let combos = [{}];
  for (const [name, def] of variantDefs) {
    const cleanName = name.split('#')[0];
    const next = [];
    for (const combo of combos) {
      for (const opt of def.options) {
        next.push({ ...combo, [cleanName]: opt });
        if (next.length >= max * 2) break;
      }
      if (next.length >= max * 2) break;
    }
    combos = next;
  }
  return combos.slice(0, max);
}

// Universal Figma placeholder key (12:6 marker). preferredKeys[0] часто == этот ключ —
// его НЕЛЬЗЯ использовать как mutability target, swap не даст visualDiff. См. R-054.
const BROKEN_PLACEHOLDER_KEYS = new Set(['aa40b8b95980f6406a8604dbfebb660aa8ea1bbf']);

function pickValidPreferred(propName, preferredKeys, indexEntry) {
  // 1) предпочтительно — curated preferred из rule.slots[X].preferred[]
  //    (читается через ruleAsIndexEntry, формат сохранён под старое имя
  //    indexEntry.slots[<prop>].preferredValues для совместимости).
  const slot = indexEntry && indexEntry.slots && indexEntry.slots[propName];
  if (slot && Array.isArray(slot.preferredValues)) {
    const valid = slot.preferredValues.find(v => v && v.validated && !v.broken && v.key && !BROKEN_PLACEHOLDER_KEYS.has(v.key));
    if (valid) return valid.key;
  }
  // 2) fallback — первый ключ из inspected-props.preferredKeys, который не в списке broken
  if (Array.isArray(preferredKeys)) {
    const k = preferredKeys.find(k => k && !BROKEN_PLACEHOLDER_KEYS.has(k));
    if (k) return k;
  }
  return null;
}

function getMutabilityTargets(propsEntry, indexEntry) {
  // выбираем по одному пропу каждого типа для теста мутабельности
  if (!propsEntry || !propsEntry.defs) return { text: null, swap: null, variant: null };
  let text = null, swap = null, variantFlip = null;
  for (const [n, d] of Object.entries(propsEntry.defs)) {
    if (!text && d.type === 'TEXT') text = { prop: n, value: 'котик' };
    if (!swap && d.type === 'INSTANCE_SWAP' && Array.isArray(d.preferredKeys) && d.preferredKeys.length) {
      const validKey = pickValidPreferred(n, d.preferredKeys, indexEntry);
      if (validKey) swap = { prop: n, preferredKey: validKey };
    }
    if (!variantFlip && d.type === 'VARIANT' && Array.isArray(d.options) && d.options.length > 1) {
      const cleanName = n.split('#')[0];
      const nonDefault = d.options.find(o => o !== d.defaultValue);
      if (nonDefault) variantFlip = { prop: cleanName, value: nonDefault, defaultValue: d.defaultValue };
    }
  }
  return { text, swap, variantFlip };
}

function buildPlugin(name, opts = {}) {
  const regEntry = REGISTRY.components[name];
  if (!regEntry) throw new Error(`not in registry: ${name}`);
  // 5-tuple после #141: [lib, key, type, tier, approved]
  const [lib, key, type] = regEntry;
  const propsEntry = INSPECTED.components ? INSPECTED.components[name] : null;
  const rule = loadRuleFor(name);
  const indexEntry = ruleAsIndexEntry(rule);

  const variants = opts.matrix ? getVariantMatrix(propsEntry) : [getDefaultVariants(propsEntry)];
  const mutability = getMutabilityTargets(propsEntry, indexEntry);
  const layoutRules = indexEntry.layoutRules || null;
  const isAbsolute = layoutRules && layoutRules.layoutPositioning === 'ABSOLUTE';

  // booleans (для phase-5 boolean-matrix): все BOOLEAN-пропы с дефолтами
  const booleans = propsEntry && propsEntry.defs
    ? Object.entries(propsEntry.defs).filter(([, d]) => d.type === 'BOOLEAN').map(([n, d]) => ({ prop: n, defaultValue: d.defaultValue }))
    : [];
  const defaultVariantSet = getDefaultVariants(propsEntry);

  // sourceLib icon-swap: глобальная merged-карта (собственные слоты ∪ вложенные).
  // Forwarded icon-слоты делят slotKey с iconGlyph — мердж ловит свап на любом уровне.
  const nestedRules = collectNestedRules(rule, 0, new Set());
  const ownSourceLib = sourceLibSamplesOf(rule);
  const sourceLibMerged = { ...ownSourceLib.keys };
  for (const nr of Object.values(nestedRules)) {
    for (const [slotKey, entry] of Object.entries(nr.sourceLib || {})) {
      if (!(slotKey in sourceLibMerged)) sourceLibMerged[slotKey] = entry;
    }
  }

  const cfg = {
    KEY: key, NAME: name, TYPE: type, VARIANTS: variants,
    DEFAULT_VARIANT_SET: defaultVariantSet,
    PLACEHOLDERS: PLACEHOLDER_TEXTS,
    // REQUIRED_SWAP не используется в новой rule.json schema (legacy _index.json
    // поле для chip/button addons). Если когда-то восстановим — добавить
    // rule.layoutRules.requiredSwap или отдельное поле в schema.
    REQUIRED_SWAP: null,
    PAIRED: indexEntry.pairedProps || [],
    PAIRED_GROUPS: indexEntry.pairedGroups || [],
    LAYOUT: layoutRules,
    SANDBOX_LAYOUT: isAbsolute ? 'NONE' : 'VERTICAL',
    MUTABILITY: mutability,
    BOOLEANS: booleans,
    // Наполнение owned-слотов СТРОГО из rule (PR-1 test validity):
    NESTED_RULES: nestedRules,
    OWNED_PREFERRED: ownedPreferredMap(rule),
    OWNED_TEXT: textSamplesOf(rule),
    OWNED_TEXTNODE: textNodeSampleOf(rule),
    FILL_BUDGET: 40,
    // sourceLib icon-swap:
    // SOURCELIB_KEYS — ГЛОБАЛЬНАЯ merged-карта slotKey → {key, hint}: собственные
    //   sourceLib-слоты компонента ∪ sourceLib всех вложенных правил. Слоты-иконки
    //   форвардятся вверх с тем же id (напр. `✎ icon [ 24+ ]#15407:24` есть и в
    //   iconGlyph, и в inputText) — поэтому матч по slotKey ловит свап на любом уровне.
    //   sampleKey хранится только в iconGlyph (single-source), microtest мерджит.
    // SOURCELIB_UNSAMPLED — собственные слоты компонента без sampleKey (для completeness).
    SOURCELIB_KEYS: sourceLibMerged,
    SOURCELIB_UNSAMPLED: ownSourceLib.unsampled,
    // nested-closure (--close-nested): кандидаты без rule-файла → Figma-discovery type/setKey.
    NESTED_DISCOVERY: opts.closeNested ? nestedDiscoveryTargets(rule) : []
  };

  const code = `
(async () => {
  const CFG = ${JSON.stringify(cfg)};
  const out = { component: CFG.NAME, results: [] };

  let main;
  try { main = await figma.importComponentByKeyAsync(CFG.KEY); }
  catch (e) {
    // Гарантия variant-key: если key оказался set-key (importComponentByKey
    // их не принимает — см. issue #132), пробуем найти ComponentSet с тем же
    // именем на текущей странице и взять ключ первого варианта.
    let resolved = null;
    try {
      const pages = figma.root.children;
      for (const p of pages) {
        try { await p.loadAsync(); } catch (_) {}
        const sets = p.findAllWithCriteria({ types: ["COMPONENT_SET"] });
        const match = sets.find(s => s.name === CFG.NAME);
        if (match && match.children.length) {
          resolved = match.children[0];
          break;
        }
      }
    } catch (_) {}
    if (resolved) {
      main = resolved;
      out.keyResolvedFromSet = true;
      out.resolvedVariantKey = resolved.key;
    } else {
      out.error = 'importFailed:' + (e && e.message);
      return out;
    }
  }
  out.mainType = main.type;

  const sandbox = figma.createFrame();
  sandbox.name = '__heal_sandbox__ ' + CFG.NAME;
  sandbox.resize(400, 800);
  if (CFG.SANDBOX_LAYOUT === 'VERTICAL') {
    sandbox.layoutMode = 'VERTICAL';
    sandbox.primaryAxisSizingMode = 'AUTO';
    sandbox.counterAxisSizingMode = 'FIXED';
  }

  function rootName(n) {
    // 1) drop id suffix after #
    // 2) drop trailing "[ N ]" qualifier с trailing-space (button addons → addons,
    //    "icon [ 20 ] " (trailing space перед #) → "icon")
    // 3) strip leading + trailing non-word chars (icons, ✏️ ✎ ← → ↓ ↑, variation selectors, spaces)
    let s = n.split('#')[0];
    s = s.replace(/\\s*\\[\\s*\\d+\\s*\\]\\s*$/, '');
    s = s.replace(/^[^a-zA-Zа-яА-Я0-9]+/, '');
    s = s.replace(/[^a-zA-Zа-яА-Я0-9]+$/, '');
    return s.trim();
  }

  async function snapshotPNG(node) {
    try {
      const bytes = await node.exportAsync({ format: 'PNG', constraint: { type: 'SCALE', value: 0.5 } });
      return bytes.length;
    } catch (e) { return 0; }
  }

  // Кэш загруженных шрифтов (family|style) — чтобы не грузить повторно.
  const loadedFonts = new Set();
  async function loadFontCached(f) {
    if (!f || typeof f !== 'object') return;
    const k = f.family + '|' + f.style;
    if (loadedFonts.has(k)) return;
    await figma.loadFontAsync(f);
    loadedFonts.add(k);
  }
  // Копия setTextNodeContent из applyRuleDriven-tests.js (microtest self-contained,
  // импортов нет). Грузит target font, ловит cross-family через loadFontAsync(n.fontName),
  // skip'ает mixed font (symbol) БЕЗ throw. report — опциональный аккумулятор для
  // mixed-font записи. Никаких throw — Figma откатывает sandbox при uncaught exception.
  // Возвращает true, если реально мутировала ноду; false иначе (ранний выход,
  // font fail, mixed-font skip, BFS дошёл до конца без матча). Вызывающий код по
  // этому флагу решает: textMutated (true) или textUnfilled (false) — чтобы
  // несматченная нода не пряталась из отчёта о дырах.
  async function setTextNodeContent(inst, text, font, report, targetRef) {
    if (!inst || text === undefined || text === null || text === '') return false;
    const targetFont = font || { family: 'Inter', style: 'Regular' };
    try { await loadFontCached(targetFont); } catch (e) { return false; }
    const queue = [];
    if ('children' in inst) for (const c of inst.children) queue.push(c);
    while (queue.length) {
      const n = queue.shift();
      if (n.type === 'TEXT') {
        // targeted-режим: ищем КОНКРЕТНУЮ ноду по visibleBy binding (надёжно),
        // fallback на name. На не-матче — НЕ return, а продолжаем BFS (push children).
        // targetRef === undefined → legacy first-TEXT поведение (backward-compat).
        if (targetRef) {
          const refs = n.componentPropertyReferences || {};
          const visMatch = targetRef.visibleBy && refs.visible === targetRef.visibleBy;
          const nameMatch = !targetRef.visibleBy && targetRef.name && n.name === targetRef.name;
          if (!visMatch && !nameMatch) {
            if ('children' in n) for (const c of n.children) queue.push(c);
            continue;
          }
        }
        if (typeof n.fontName === 'symbol') {
          if (report && Array.isArray(report.fontMixed)) report.fontMixed.push({ node: n.name });
          return false;
        }
        try {
          if (n.fontName && typeof n.fontName === 'object' && n.fontName.family !== targetFont.family) {
            await loadFontCached(n.fontName);
            n.characters = String(text);
          } else {
            n.fontName = targetFont;
            n.characters = String(text);
          }
        } catch (e) { return false; }
        // фиксируем ID мутированной ноды (не имя): одноимённый placeholder-сосед
        // не должен считаться покрытым — иначе дыра маскируется (см. инвариант).
        if (report && Array.isArray(report.mutatedTextIds)) report.mutatedTextIds.push(n.id);
        return true;
      }
      if ('children' in n) for (const c of n.children) queue.push(c);
    }
    return false;
  }

  // Наполняет INSTANCE_SWAP-слоты ТОЛЬКО из переданных карт (keyMap = OWNED_PREFERRED
  // на верхнем уровне, NESTED_RULES[slug].defaults — глубже). Слот без валидного
  // preferred в rule НЕ наполняется (остаётся placeholder → виден как дыра в правиле).
  // Уже реальный контент не трогаем. Рекурсия по nested rule до depth 3.
  // sourceLib icon-swap: обходит ВСЁ поддерево инстанса и свапает иконки-глифы.
  // Слот-иконки (напр. icon 24+ id 15407:24) не форвардятся на верхний уровень —
  // они живут как componentProperties вложенных iconGlyph-инстансов. Поэтому матч по
  // slotKey идёт по КАЖДОМУ INSTANCE в дереве, а не только по top-level props.
  // БЕЗ isPlaceholder-гейта: sourceLib-слот держит дефолтную иконку (sparkle), а не
  // 12:6 — мы намеренно заменяем дефолт на sample. Import кэшируется (один на key).
  async function swapSourceLibIcons(rootInst, sourceLibMap, budget, report) {
    if (!rootInst || !sourceLibMap) return;
    const keys = Object.keys(sourceLibMap);
    if (!keys.length) return;
    const importCache = {};
    const stack = [rootInst];
    while (stack.length) {
      if (budget.n <= 0) break;
      const node = stack.pop();
      const cprops = (node === rootInst || node.type === 'INSTANCE') ? (node.componentProperties || {}) : null;
      if (cprops) {
        for (const slk of keys) {
          if (budget.n <= 0) break;
          if (!cprops[slk] || cprops[slk].type !== 'INSTANCE_SWAP') continue;
          const slEntry = sourceLibMap[slk];
          if (!slEntry || !slEntry.key) continue;
          try {
            let tid = importCache[slEntry.key];
            if (!tid) { const t = await figma.importComponentByKeyAsync(slEntry.key); tid = t.id; importCache[slEntry.key] = tid; budget.n--; }
            node.setProperties({ [slk]: tid });
            if (report.sourceLibSwapped) report.sourceLibSwapped.push({ slot: slk, key: slEntry.key, hint: slEntry.hint });
          } catch (e) {
            if (report.sourceLibFailed) report.sourceLibFailed.push({ slot: slk, err: (e && e.message) || 'import failed' });
          }
        }
      }
      if ('children' in node) for (const c of node.children) stack.push(c);
    }
  }

  async function fillSlotsRecursive(inst, nestedRulesBySlug, keyMap, textMap, textNode, depth, seen, budget, report) {
    if (depth > 3 || budget.n <= 0) return;
    var props = inst.componentProperties || {};
    // === Мутация текста ИЗ RULE (sampleTexts[0]) — до обхода слотов. ===
    // textProps текущего инстанса
    for (var tp in (textMap || {})) {
      if (props[tp] && props[tp].type === 'TEXT') {
        var from = props[tp].value;
        try { inst.setProperties({ [tp]: textMap[tp] }); report.textMutated.push({ prop: tp, from: from, to: textMap[tp], depth: depth }); }
        catch (e) { report.textFailed.push({ prop: tp, err: e && e.message }); }
      }
    }
    // intrinsic textNode
    if (textNode && textNode.text) {
      try {
        const mutated = await setTextNodeContent(inst, textNode.text, textNode.font, report, { visibleBy: textNode.visibleBy || null, name: textNode.name || null });
        if (mutated) report.textMutated.push({ node: textNode.name, to: textNode.text, depth: depth, intrinsic: true });
        else report.textUnfilled.push(textNode.name || '(intrinsic)');
      } catch (e) { report.textFailed.push({ node: textNode.name, err: e && e.message }); }
    }
    for (var pn in props) {
      var pv = props[pn];
      if (!pv || pv.type !== 'INSTANCE_SWAP') continue;
      var entry = keyMap[pn];
      if (!entry || !entry.key) continue;        // нет валидного preferred в rule — НЕ наполняем
      var wantKey = entry.key;
      var cur = pv.value;
      var isPlaceholder = cur === '12:6';
      if (!isPlaceholder && cur) {
        var node = figma.getNodeById(cur);
        if (node && node.name && node.name.toLowerCase() === 'placeholder') isPlaceholder = true;
      }
      if (!isPlaceholder) continue;              // уже реальный контент — не трогаем
      var target;
      try {
        target = await figma.importComponentByKeyAsync(wantKey);
        budget.n--;
        inst.setProperties({ [pn]: target.id });
      } catch (e) { continue; }
      // рекурсия во вложенный инстанс.
      // ВАЖНО: pv.value у INSTANCE_SWAP указывает на ГЛАВНЫЙ компонент (COMPONENT),
      // а не на размещённый дочерний INSTANCE. У COMPONENT нет componentProperties.
      // Размещённый инстанс — это child-нода внутри inst, чей
      // componentPropertyReferences.mainComponent === pn (имя свап-пропа).
      var nestedInst = (typeof inst.findOne === 'function')
        ? inst.findOne(function (n) { return n.type === 'INSTANCE' && n.componentPropertyReferences && n.componentPropertyReferences.mainComponent === pn; })
        : null;
      if (nestedInst && depth < 3 && entry.ruleRef) {
        var childRule = nestedRulesBySlug[entry.ruleRef];
        // anti-cycle PER-BRANCH: клонируем seen на рекурсию (как ctx.visited в builder).
        // Глобальный мутируемый seen ломал sibling-слоты с одним ruleRef (форма с
        // двумя inputText): второй слот тихо пропускался. Клон блокирует только
        // ИСТИННЫЕ циклы (A→B→A в одной ветке), siblings заполняются независимо.
        if (childRule && !seen[entry.ruleRef]) {
          await fillSlotsRecursive(nestedInst, nestedRulesBySlug, childRule.defaults, childRule.textProps, childRule.textNode, depth + 1, Object.assign({}, seen, { [entry.ruleRef]: true }), budget, report);
        }
      }
    }
  }

  for (const variantSet of CFG.VARIANTS) {
    const r = {
      variant: variantSet,
      asserts: {
        instanceCreated: false, variantApplied: false,
        defaultsAcceptable: true, swapsResolve: true,
        noPlaceholderText: true,
        boundsNonZero: false, hasChildren: false,
        textMutable: 'skip', swapMutable: 'skip', variantMutable: 'skip',
        visualDiff: 'skip'
      },
      issues: [],
      visiblePlaceholders: [],
      pngBaseline: 0, pngMutated: 0
    };

    let inst;
    try { inst = main.createInstance(); sandbox.appendChild(inst); r.asserts.instanceCreated = true; }
    catch (e) { r.issues.push('createInstance:' + (e && e.message)); out.results.push(r); continue; }

    if (CFG.TYPE === 's' && Object.keys(variantSet).length) {
      try { inst.setProperties(variantSet); r.asserts.variantApplied = true; }
      catch (e) { r.issues.push('setProperties:' + (e && e.message)); }
    } else { r.asserts.variantApplied = true; }

    // requiredSwap
    if (CFG.REQUIRED_SWAP && CFG.REQUIRED_SWAP.preferredKey) {
      try {
        const target = await figma.importComponentByKeyAsync(CFG.REQUIRED_SWAP.preferredKey);
        inst.setProperties({ [CFG.REQUIRED_SWAP.prop]: target.id });
      } catch (e) { r.issues.push('requiredSwap:' + (e && e.message)); r.asserts.swapsResolve = false; }
    } else if (CFG.REQUIRED_SWAP && Array.isArray(CFG.REQUIRED_SWAP.preferredKeyCandidates)) {
      r.issues.push('preferredKey=null, candidates exist → scopedSync needed');
      r.asserts.swapsResolve = false;
    }

    // === ФАЗА 1: baseline state + bounds + children + PNG ===
    r.asserts.boundsNonZero = inst.width > 0 && inst.height > 0;
    if (!r.asserts.boundsNonZero) r.issues.push('zeroBounds:' + inst.width + 'x' + inst.height);
    r.asserts.hasChildren = (inst.children || []).length > 0;
    if (!r.asserts.hasChildren) r.issues.push('noChildren');
    r.pngBaseline = await snapshotPNG(inst);

    // === ФАЗА 2: pair-aware placeholder check ===
    const props = inst.componentProperties || {};
    const pairLookup = {};
    for (const p of CFG.PAIRED) { pairLookup[p.swap] = p.boolean; }
    for (const g of CFG.PAIRED_GROUPS) { for (const s of (g.slots || [])) pairLookup[s] = g.master; }
    const boolsByRoot = {};
    for (const [pn, pv] of Object.entries(props)) {
      if (pv.type === 'BOOLEAN') boolsByRoot[rootName(pn)] = pn;
    }
    for (const [pn, pv] of Object.entries(props)) {
      if (pv.type !== 'INSTANCE_SWAP' || pv.value !== '12:6') continue;
      const masterName = pairLookup[pn] || boolsByRoot[rootName(pn)];
      const masterVal = masterName ? props[masterName] && props[masterName].value : undefined;
      const isVisible = !masterName || masterVal === true;
      if (isVisible) {
        r.asserts.defaultsAcceptable = false;
        r.visiblePlaceholders.push({ prop: pn, master: masterName || null });
      }
    }

    // placeholder text walk — только видимые TEXT-ноды (visible:false = скрыт булином).
    // Bugfix: без проверки visible walker находил скрытые тексты с дефолтным контентом
    // ("label", "text" и т.д.) и ложно роняла noPlaceholderText.
    const allText = inst.findAll(n => n.type === 'TEXT' && n.visible !== false);
    for (const t of allText) {
      const chars = (t.characters || '').trim();
      if (CFG.PLACEHOLDERS.includes(chars)) {
        r.asserts.noPlaceholderText = false;
        r.issues.push('placeholderText:' + chars + ' @ ' + t.name);
      }
    }

    // === ФАЗА 3: mutability validation ===
    const mut = CFG.MUTABILITY;
    // text mutability
    if (mut.text) {
      try {
        const before = props[mut.text.prop] && props[mut.text.prop].value;
        inst.setProperties({ [mut.text.prop]: mut.text.value });
        const after = inst.componentProperties[mut.text.prop] && inst.componentProperties[mut.text.prop].value;
        r.asserts.textMutable = (after === mut.text.value) ? true : false;
        if (!r.asserts.textMutable) r.issues.push('textMutable failed: ' + mut.text.prop + ' before=' + before + ' after=' + after);
      } catch (e) { r.asserts.textMutable = false; r.issues.push('textMutable:' + (e && e.message)); }
    }
    // swap mutability
    if (mut.swap) {
      try {
        const target = await figma.importComponentByKeyAsync(mut.swap.preferredKey);
        const before = inst.componentProperties[mut.swap.prop] && inst.componentProperties[mut.swap.prop].value;
        inst.setProperties({ [mut.swap.prop]: target.id });
        const after = inst.componentProperties[mut.swap.prop] && inst.componentProperties[mut.swap.prop].value;
        r.asserts.swapMutable = (after !== before) ? true : false;
        if (!r.asserts.swapMutable) r.issues.push('swapMutable failed: ' + mut.swap.prop + ' before=' + before + ' after=' + after);
      } catch (e) { r.asserts.swapMutable = false; r.issues.push('swapMutable:' + (e && e.message)); }
    }
    // variant flip
    if (mut.variantFlip) {
      try {
        const before = inst.componentProperties[mut.variantFlip.prop] && inst.componentProperties[mut.variantFlip.prop].value;
        inst.setProperties({ [mut.variantFlip.prop]: mut.variantFlip.value });
        const after = inst.componentProperties[mut.variantFlip.prop] && inst.componentProperties[mut.variantFlip.prop].value;
        r.asserts.variantMutable = (after === mut.variantFlip.value) ? true : false;
        if (!r.asserts.variantMutable) r.issues.push('variantMutable failed: ' + mut.variantFlip.prop + ' want=' + mut.variantFlip.value + ' got=' + after);
      } catch (e) { r.asserts.variantMutable = false; r.issues.push('variantMutable:' + (e && e.message)); }
    }

    // === ФАЗА 4: visual diff PNG ===
    r.pngMutated = await snapshotPNG(inst);
    if (r.pngBaseline > 100 && r.pngMutated > 100) {
      r.asserts.visualDiff = (r.pngBaseline !== r.pngMutated) ? true : false;
      if (r.asserts.visualDiff === false && (mut.text || mut.swap || mut.variantFlip)) {
        r.issues.push('visualDiff: PNG bytes identical despite mutations (baseline=' + r.pngBaseline + ')');
      }
    }

    r.sandboxNodeId = inst.id;
    out.results.push(r);
    // NB: instance NOT removed — agent will get_screenshot(sandbox.id) for visual check
  }

  // === ФАЗА 5a: bindings graph (pre-flip, через componentPropertyReferences) ===
  // Figma хранит binding'и \`visible: <boolProp>\`, \`mainComponent: <swapProp>\`,
  // \`characters: <textProp>\` прямо на nodes. Walk дерева default-instance даёт
  // полный граф связей без необходимости что-то флипать.
  out.bindings = [];
  {
    const probeInst = main.createInstance();
    sandbox.appendChild(probeInst);
    if (CFG.TYPE === 's' && Object.keys(CFG.DEFAULT_VARIANT_SET).length) {
      try { probeInst.setProperties(CFG.DEFAULT_VARIANT_SET); } catch (e) {}
    }
    out.reactions = [];
    // walk с ancestor-context: каждому node присваивается «ближайший ancestor visibleBy»
    const walk = (node, depth, ancestorBool) => {
      if (depth > 12) return;
      const refs = node.componentPropertyReferences;
      const myBool = (refs && refs.visible) || null;
      const effectiveBool = myBool || ancestorBool;
      if (refs && (refs.visible || refs.mainComponent || refs.characters)) {
        out.bindings.push({
          name: node.name, type: node.type,
          visibleBy: myBool,
          ownedByBool: effectiveBool,
          swapBy: refs.mainComponent || null,
          textBy: refs.characters || null
        });
      }
      // reactions — для popover/tooltip/dropdown триггеров (float-style booleans)
      if (Array.isArray(node.reactions) && node.reactions.length) {
        for (const r of node.reactions) {
          const action = r.action || (r.actions && r.actions[0]);
          const trigger = r.trigger;
          if (!action) continue;
          out.reactions.push({
            sourceNode: node.name,
            sourceType: node.type,
            ownedByBool: effectiveBool,
            triggerType: trigger && trigger.type,
            actionType: action.type,
            destinationId: action.destinationId || null,
            overlayRelativePosition: action.overlayRelativePosition || null,
            navigation: action.navigation || null
          });
        }
      }
      if ('children' in node) for (const c of node.children) walk(c, depth + 1, effectiveBool);
    };
    walk(probeInst, 0, null);
    // layoutProbe: фиксируем layoutPositioning инстанса (AUTO / ABSOLUTE / NONE / null).
    // Нужно hypothesize'у — определять ABSOLUTE-компоненты при первой записи rule.
    out.layoutProbe = (probeInst && probeInst.layoutPositioning) ? probeInst.layoutPositioning : null;
    probeInst.remove();
  }
  // Auto-derive: boolean → owned slots / texts (с учётом ancestor-chain)
  out.autoPairs = {};
  for (const b of out.bindings) {
    const owner = b.ownedByBool;
    if (!owner) continue;
    out.autoPairs[owner] = out.autoPairs[owner] || { ownedSwap: [], ownedText: [], directVisibleNodes: [] };
    if (b.visibleBy === owner) out.autoPairs[owner].directVisibleNodes.push(b.name);
    if (b.swapBy) out.autoPairs[owner].ownedSwap.push(b.swapBy);
    if (b.textBy) out.autoPairs[owner].ownedText.push(b.textBy);
  }

  // === ФАЗА 5b: boolean-matrix exercise ===
  // Для каждого BOOLEAN-пропа: fresh instance, флипаем boolean на !default,
  // регистрируем owned slots через autoPairs (если есть) или fallback pairLookup.
  out.booleanMatrix = [];
  const fullPairLookup = {};
  for (const p of CFG.PAIRED) { fullPairLookup[p.swap] = p.boolean; }
  for (const g of CFG.PAIRED_GROUPS) { for (const s of (g.slots || [])) fullPairLookup[s] = g.master; }
  for (const b of CFG.BOOLEANS) {
    const flipTo = !b.defaultValue;
    let einst;
    try { einst = main.createInstance(); sandbox.appendChild(einst); }
    catch (e) { out.booleanMatrix.push({ prop: b.prop, err: 'createInstance:' + (e && e.message) }); continue; }
    if (CFG.TYPE === 's' && Object.keys(CFG.DEFAULT_VARIANT_SET).length) {
      try { einst.setProperties(CFG.DEFAULT_VARIANT_SET); } catch (e) {}
    }
    let setOk = true, setErr = null;
    try { einst.setProperties({ [b.prop]: flipTo }); }
    catch (e) { setOk = false; setErr = e && e.message; }

    // Наполняем owned-слоты валидным preferred ИЗ RULE (не выдумываем).
    // Слот без валидного preferred остаётся placeholder → виден как ошибка.
    // textReport — per-boolean (своя выборка состояний на каждый флип).
    const fillBudget = { n: CFG.FILL_BUDGET };
    const textReport = { textMutated: [], textUnfilled: [], textFailed: [], fontMixed: [], sourceLibSwapped: [], sourceLibFailed: [], mutatedTextIds: [] };
    // Bugfix Gap B: ownedFilled должен сообщать ОРИГИНАЛЬНЫЙ дефолт слота, а не
    // post-fill значение (которое уже rule-preferred key и так есть в preferred[]).
    // Захватываем INSTANCE_SWAP значения ДО fillSlotsRecursive.
    const prefillInstSwap = {};
    {
      const pp = einst.componentProperties || {};
      for (const [pn, pv] of Object.entries(pp)) {
        if (pv.type === 'INSTANCE_SWAP') prefillInstSwap[pn] = pv.value;
      }
    }
    await fillSlotsRecursive(einst, CFG.NESTED_RULES, CFG.OWNED_PREFERRED, CFG.OWNED_TEXT, CFG.OWNED_TEXTNODE, 0, {}, fillBudget, textReport);
    await swapSourceLibIcons(einst, CFG.SOURCELIB_KEYS, fillBudget, textReport);
    const allTextNow = einst.findAll(n => n.type === 'TEXT');
    // unfilled-скан по ID мутированных нод (не по имени): одноимённый placeholder
    // не маскируется мутацией соседа. Нода с реальным текстом не попадёт в PLACEHOLDERS.
    const mutatedIds = new Set(textReport.mutatedTextIds);
    for (const t of allTextNow) {
      if (!mutatedIds.has(t.id) && CFG.PLACEHOLDERS.includes((t.characters || '').trim())) textReport.textUnfilled.push(t.name);
    }

    // Сбор диагностики — ПОСЛЕ наполнения, чтобы отчёт отражал реальное состояние.
    const eprops = einst.componentProperties || {};
    // build per-instance bool→prop map for rootName fallback
    const eBoolsByRoot = {};
    for (const [pn, pv] of Object.entries(eprops)) { if (pv.type === 'BOOLEAN') eBoolsByRoot[rootName(pn)] = pn; }
    const ownedExposed = [];
    const ownedFilled = [];
    for (const [pn, pv] of Object.entries(eprops)) {
      if (pv.type !== 'INSTANCE_SWAP') continue;
      const owner = fullPairLookup[pn] || eBoolsByRoot[rootName(pn)];
      if (owner !== b.prop) continue; // slot не принадлежит этому boolean
      // named-placeholder ИЛИ 12:6 ПОСЛЕ наполнения = unfillable-сигнал (дыра в правиле)
      let stillPlaceholder = pv.value === '12:6';
      if (!stillPlaceholder && pv.value) {
        const sn = figma.getNodeById(pv.value);
        if (sn && sn.name && sn.name.toLowerCase() === 'placeholder') stillPlaceholder = true;
      }
      if (stillPlaceholder) { ownedExposed.push(pn); continue; }
      // Gap B: resolve INSTANCE_SWAP value → componentKey via Plugin API.
      // Bugfix: используем pre-fill значение (prefillInstSwap[pn]) — оригинальный
      // дефолт до того, как fillSlotsRecursive подставил rule-preferred key.
      // Post-fill pv.value = уже известный preferred → Gap B ничего не открывает.
      // Pre-fill value = реальный компонент из дизайна → новый кандидат для правила.
      // pv.value у INSTANCE_SWAP указывает на ГЛАВНЫЙ компонент (COMPONENT/COMPONENT_SET),
      // а не на INSTANCE. Для variant внутри сета пишем variant-key.
      // Bugfix: || pv.value fallthrough при truthy pre-fill placeholder ('12:6' — truthy строка).
      // Если pre-fill = '12:6', слот по дизайну заглушка → gap B не нужен; fallback на post-fill
      // (rule-preferred, уже в preferred[]) — apply-figma сам отфильтрует дубли.
      // Используем !== undefined вместо ||, чтобы не ломаться на любых falsy node-id строках.
      const gapBValue = (prefillInstSwap[pn] !== undefined && prefillInstSwap[pn] !== '12:6')
        ? prefillInstSwap[pn] : pv.value;
      const filledNode = figma.getNodeById(gapBValue);
      let componentKey = null;
      if (filledNode) {
        if (filledNode.type === 'COMPONENT') componentKey = filledNode.key;
        else if (filledNode.type === 'COMPONENT_SET') componentKey = (filledNode.defaultVariant && filledNode.defaultVariant.key) || null;
        else if (filledNode.type === 'INSTANCE' && filledNode.mainComponent) componentKey = filledNode.mainComponent.key;
      }
      const name = filledNode ? filledNode.name : null;
      ownedFilled.push({ slot: pn, value: gapBValue, componentKey, name });
    }
    const reachedTextNodes = einst.findAll(n => n.type === 'TEXT').length;
    const pngBytes = await snapshotPNG(einst);
    out.booleanMatrix.push({
      prop: b.prop,
      defaultValue: b.defaultValue,
      flippedTo: flipTo,
      setOk, setErr,
      ownedExposed,       // slots ВЛАДЕЕМЫЕ этим boolean'ом, остались placeholder ПОСЛЕ наполнения (unfillable)
      ownedFilled,        // slots ВЛАДЕЕМЫЕ этим boolean'ом, заполнены реальным компонентом из rule
      reachedTextNodes,   // TEXT-нод в дереве после наполнения (глубина наполнения)
      textReport,         // мутация текста из rule sampleTexts: mutated/unfilled/failed/fontMixed
      fillBudgetUsed: CFG.FILL_BUDGET - fillBudget.n,
      pngBytes,
      instanceId: einst.id
    });
  }

  // === ФАЗА 5c: sourceLib icon-swap probe (унифицирована через fillSlotsRecursive) ===
  // Один dedicated probe-инстанс: наполняем owned-слоты + свапаем все sourceLib-слоги
  // (merged-карта, матч по slotKey на любом уровне — forwarded иконки ловятся на верхнем).
  // SOURCELIB_UNSAMPLED — собственные слоты компонента без sampleKey: completeness ⚠.
  // Свап без isPlaceholder-гейта живёт внутри fillSlotsRecursive.
  out.sourceLibProbe = null;
  out.sourceLibUnsampled = CFG.SOURCELIB_UNSAMPLED || [];
  if (Object.keys(CFG.SOURCELIB_KEYS || {}).length > 0) {
    try {
      const slInst = main.createInstance();
      sandbox.appendChild(slInst);
      if (CFG.TYPE === 's' && Object.keys(CFG.DEFAULT_VARIANT_SET).length) {
        try { slInst.setProperties(CFG.DEFAULT_VARIANT_SET); } catch (e) {}
      }
      const slBudget = { n: CFG.FILL_BUDGET };
      const slReport = { textMutated: [], textUnfilled: [], textFailed: [], fontMixed: [], sourceLibSwapped: [], sourceLibFailed: [], mutatedTextIds: [] };
      await fillSlotsRecursive(slInst, CFG.NESTED_RULES, CFG.OWNED_PREFERRED, CFG.OWNED_TEXT, CFG.OWNED_TEXTNODE, 0, {}, slBudget, slReport);
      await swapSourceLibIcons(slInst, CFG.SOURCELIB_KEYS, slBudget, slReport);
      out.sourceLibProbe = {
        swapped: slReport.sourceLibSwapped,
        failed: slReport.sourceLibFailed,
        budgetUsed: CFG.FILL_BUDGET - slBudget.n,
        instanceId: slInst.id
      };
    } catch (e) {
      out.sourceLibProbe = { err: 'probe:' + ((e && e.message) || 'unknown'), swapped: [], failed: [] };
    }
  }

  // === ФАЗА 6: nested-closure discovery (--close-nested) ===
  // Для каждого кандидата без rule-файла импортируем ключ и определяем type/setKey/ruleKey.
  // type надёжен из Figma (COMPONENT→c, вариант COMPONENT_SET→s). lib Figma НЕ отдаёт —
  // его резолвит apply-сторона (эвристика name-семейства) или /syncKeys. Cap 20.
  out.nestedDiscovery = [];
  {
    let cap = 20;
    for (const tgt of (CFG.NESTED_DISCOVERY || [])) {
      if (cap-- <= 0) break;
      try {
        const comp = await figma.importComponentByKeyAsync(tgt.key);
        const set = (comp.parent && comp.parent.type === 'COMPONENT_SET') ? comp.parent : null;
        const ruleKey = set ? ((set.defaultVariant && set.defaultVariant.key) || tgt.key) : (comp.key || tgt.key);
        out.nestedDiscovery.push({
          slot: tgt.slot, key: tgt.key, name: tgt.name,
          type: set ? 's' : 'c',
          setKey: set ? set.key : null,
          // setName — имя СЕТА (а не варианта): варианты одного сета («2 ◇ tabsViewBase»,
          // «3 ◇...») имеют разные tgt.name, но один setName → один rule, дедуп по ruleKey.
          setName: set ? set.name : null,
          ruleKey: ruleKey
        });
      } catch (e) {
        out.nestedDiscovery.push({ slot: tgt.slot, key: tgt.key, name: tgt.name, error: (e && e.message) || 'import failed' });
      }
    }
  }


  out.sandbox = { id: sandbox.id, name: sandbox.name };
  out.summary = {
    total: out.results.length,
    passed: out.results.filter(r => Object.values(r.asserts).every(v => v === true || v === 'skip')).length,
    failedAsserts: {}
  };
  for (const r of out.results) {
    for (const [a, v] of Object.entries(r.asserts)) {
      if (v === false) out.summary.failedAsserts[a] = (out.summary.failedAsserts[a] || 0) + 1;
    }
  }

  return out;
})();
`.trim();

  return {
    plugin: code,
    expected: { shape: 'use_figma return value (object)', variants: variants.length, booleansExercised: booleans.length, mutabilityChecks: { text: !!mutability.text, swap: !!mutability.swap, variantFlip: !!mutability.variantFlip } },
    meta: { name, lib, key, type, hasRule: !!rule && !!rule.name, hasProps: !!propsEntry, isAbsolute, pairedGroupsCount: (indexEntry.pairedGroups || []).length, booleansCount: booleans.length }
  };
}

const arg = process.argv[2];
const matrix = process.argv.includes('--matrix');
const closeNested = process.argv.includes('--close-nested');
if (!arg) { console.error('Usage: parseProps-microtest.js "<componentName>" [--matrix] [--close-nested]'); process.exit(1); }
try { console.log(JSON.stringify(buildPlugin(arg, { matrix, closeNested }), null, 2)); }
catch (e) { console.error('Error:', e.message); process.exit(2); }
