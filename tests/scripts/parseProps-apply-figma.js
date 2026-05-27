#!/usr/bin/env node
// parseProps-apply-figma: применяет результат microtest (autoPairs/bindings/booleans/slots)
// в .rule.json (и .raw.json для cold data). После успешного apply дёргает genIndex,
// чтобы registry/index.json оставался синхронным с rules (source of truth).
//
// Workflow:
//   1. agent запускает parseProps-microtest plugin через use_figma → получает JSON result
//   2. agent сохраняет result в файл (или передаёт через --result=)
//   3. node tests/scripts/parseProps-apply-figma.js "<componentName>" --result=<json>
//      → пишет slots / booleans / bindings в .rule.json + autoPairs/bindings в .raw.json
//      → авто-регенерит registry/index.json через genIndex()
//
// autoPairs — каноническая карта boolean→owned, из node.componentPropertyReferences.
// Заменяет ручное pairedProps/pairedGroups для новых компонентов.

const fs = require('fs');
const path = require('path');
const { genIndex, buildResolverCaches, findExpectedRuleRef } = require('./parseProps-utils.js');

const ROOT = path.resolve(__dirname, '..', '..');
const RULES_DIR = path.join(ROOT, 'rules/components');
const INSPECTED_PATH = path.join(ROOT, 'tests/scripts/inspected-props.json');
const INSPECTED_RESOLVED_PATH = path.join(ROOT, 'tests/scripts/inspected-props-resolved.json');

// Universal Figma placeholder key (12:6 marker) — НЕ валидный preferred.
const BROKEN_PLACEHOLDER_KEYS = new Set(['aa40b8b95980f6406a8604dbfebb660aa8ea1bbf']);

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

function readJson(p) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; }
}
function writeJson(p, obj) {
  fs.writeFileSync(p, JSON.stringify(obj, null, 2) + '\n');
}

// Применяет microtest result в .rule.json
function applyToRuleJson(name, slug, result) {
  const rulePath = path.join(RULES_DIR, `${slug}.rule.json`);
  const rawPath = path.join(RULES_DIR, `${slug}.raw.json`);

  const rule = readJson(rulePath);
  if (!rule) return { ok: false, reason: 'no .rule.json found' };

  // booleanMatrix lookup: prop → defaultValue (источник истины по дефолту)
  const boolDefaults = {};
  if (Array.isArray(result.booleanMatrix)) {
    for (const b of result.booleanMatrix) {
      if (b && b.prop && typeof b.defaultValue === 'boolean') {
        boolDefaults[b.prop] = b.defaultValue;
      }
    }
  }

  // preferredKeys по slot'у из inspected-props.json (если есть)
  const inspected = readJson(INSPECTED_PATH);
  const inspEntry = (inspected && inspected.components) ? inspected.components[name] : null;
  const preferredKeysBySlot = {};
  if (inspEntry && inspEntry.defs) {
    for (const [propName, def] of Object.entries(inspEntry.defs)) {
      if (def.type === 'INSTANCE_SWAP' && Array.isArray(def.preferredKeys)) {
        preferredKeysBySlot[propName] = def.preferredKeys;
      }
    }
  }

  // resolvedByKey: key → {name, kind} из inspected-props-resolved.json
  const resolvedData = readJson(INSPECTED_RESOLVED_PATH);
  const resolvedByKey = {};
  if (resolvedData && resolvedData.components) {
    for (const compEntry of Object.values(resolvedData.components)) {
      if (!compEntry || !compEntry.defs) continue;
      for (const def of Object.values(compEntry.defs)) {
        if (!def || !Array.isArray(def.preferredResolved)) continue;
        for (const r of def.preferredResolved) {
          if (r && r.key) resolvedByKey[r.key] = r;
        }
      }
    }
  }

  function buildPreferredEntry(key) {
    if (BROKEN_PLACEHOLDER_KEYS.has(key)) {
      return { key, broken: true, name: 'universal placeholder' };
    }
    const resolved = resolvedByKey[key];
    const entry = { key };
    if (resolved && resolved.name) entry.name = resolved.name;
    // Auto nestedProps.ruleRef: если resolved name соответствует существующему .rule.json
    if (resolved && resolved.name) {
      const candidateSlug = slugify(resolved.name);
      const candidateRule = path.join(RULES_DIR, `${candidateSlug}.rule.json`);
      if (fs.existsSync(candidateRule)) {
        entry.nestedProps = { policy: 'askDesigner', ruleRef: candidateSlug };
      }
    }
    // Не пишем validated:false — отсутствие поля означает "pending review"
    return entry;
  }

  let changed = 0;
  let pairedSlotFixed = false;
  let variantsWritten = 0;
  let textPropsWritten = 0;
  let textNodeWritten = false;
  let ruleRefsAdded = 0;
  let ownedFilledAdded = 0;
  const textNodesAmbiguous = [];

  // — booleans: структура + defaultOn из booleanMatrix
  if (result.autoPairs && typeof result.autoPairs === 'object') {
    rule.booleans = rule.booleans || {};
    for (const [boolProp, owned] of Object.entries(result.autoPairs)) {
      const existing = rule.booleans[boolProp] || {};
      const swaps = Array.isArray(owned.ownedSwap) ? owned.ownedSwap : [];
      // BUGFIX: pairedSlot писать только при swaps.length === 1.
      // При >=2 — НЕ писать pairedSlot (truncation было багом); все слоты
      // создаются в секции slots ниже через for-of по swaps.
      // N>1 case: boolean owns multiple swaps. pairedSlot left null (singular).
      // If pattern recurs (≥2 components), see docs/ARCHITECTURE_LESSONS.md frozen extensions
      // for potential pairedSlots[] axis расконсервации.
      const pairedSlot = swaps.length === 1 ? swaps[0] : null;
      if (swaps.length > 1) pairedSlotFixed = true;
      // defaultOn: приоритет — booleanMatrix; fallback — existing; null если нигде нет
      const defaultOn = (boolDefaults[boolProp] !== undefined)
        ? boolDefaults[boolProp]
        : (typeof existing.defaultOn === 'boolean' ? existing.defaultOn : null);
      const next = { ...existing };
      // defaultOn пишем только если есть валидный boolean (null не валиден per schema)
      if (typeof defaultOn === 'boolean') next.defaultOn = defaultOn;
      if (pairedSlot && !existing.pairedSlot) next.pairedSlot = pairedSlot;
      rule.booleans[boolProp] = next;
      changed++;
    }
  }

  // — slots: структура + preferred[] из inspected-props
  if (result.autoPairs && typeof result.autoPairs === 'object') {
    rule.slots = rule.slots || {};
    for (const [boolProp, owned] of Object.entries(result.autoPairs)) {
      const swaps = Array.isArray(owned.ownedSwap) ? owned.ownedSwap : [];
      for (const swapProp of swaps) {
        if (!rule.slots[swapProp]) {
          const keys = preferredKeysBySlot[swapProp] || [];
          rule.slots[swapProp] = {
            pairedBoolean: boolProp,
            preferred: keys.map(buildPreferredEntry)
          };
          changed++;
        } else {
          // существующий slot: ставим pairedBoolean если его не было, дописываем preferred-кандидатов
          let slotChanged = false;
          if (!rule.slots[swapProp].pairedBoolean) {
            rule.slots[swapProp].pairedBoolean = boolProp;
            slotChanged = true;
          }
          const existingKeys = new Set((rule.slots[swapProp].preferred || []).map(p => p.key));
          const inspKeys = preferredKeysBySlot[swapProp] || [];
          for (const k of inspKeys) {
            if (!existingKeys.has(k)) {
              rule.slots[swapProp].preferred = rule.slots[swapProp].preferred || [];
              rule.slots[swapProp].preferred.push(buildPreferredEntry(k));
              slotChanged = true;
            }
          }
          // Enrich existing entries with name/nestedProps if absent
          for (const pv of (rule.slots[swapProp].preferred || [])) {
            if (!pv.broken && !pv.name && resolvedByKey[pv.key]) {
              const r = resolvedByKey[pv.key];
              pv.name = r.name;
              if (!pv.nestedProps) {
                const candidateSlug = slugify(r.name);
                const candidateRule = path.join(RULES_DIR, `${candidateSlug}.rule.json`);
                if (fs.existsSync(candidateRule)) {
                  pv.nestedProps = { policy: 'askDesigner', ruleRef: candidateSlug };
                }
              }
              slotChanged = true;
            }
          }
          if (slotChanged) changed++;
        }
      }
    }
  }

  // — unpaired INSTANCE_SWAP slots: добавить из inspected-props те, что не привязаны к boolean
  // (apply через autoPairs выше покрывает только paired, но swap может быть и без boolean)
  rule.slots = rule.slots || {};
  for (const swapProp of Object.keys(preferredKeysBySlot)) {
    if (rule.slots[swapProp]) continue; // уже есть (paired or manual)
    const keys = preferredKeysBySlot[swapProp];
    rule.slots[swapProp] = {
      preferred: keys.map(buildPreferredEntry)
    };
    changed++;
  }

  // — Gap B: merge ownedFilled componentKeys из booleanMatrix в preferred[] как pending.
  // Когда boolean флипнут ON и его owned INSTANCE_SWAP слот получил реальный компонент
  // (не 12:6 placeholder), microtest резолвит его componentKey. Добавляем этот ключ в
  // preferred[] слота как validated:false (pending — без авто-валидации, нужен visual check).
  // only-if-null по ключу: существующие entries не трогаем, дубликаты не плодим.
  for (const boolEntry of (result.booleanMatrix || [])) {
    for (const filled of (boolEntry.ownedFilled || [])) {
      if (!filled || !filled.componentKey) continue;
      if (BROKEN_PLACEHOLDER_KEYS.has(filled.componentKey)) continue;
      // named placeholder: слот заполнен компонентом-заглушкой (name "placeholder"),
      // а не реальным контентом — это не валидный preferred-кандидат. Конвенция
      // проекта (см. full-accuracy.figma.js): сигнал по имени надёжнее ключа.
      if (filled.name && filled.name.trim().toLowerCase() === 'placeholder') continue;
      const slotProp = filled.slot;
      if (!slotProp || !rule.slots || !rule.slots[slotProp]) continue;
      const existing = rule.slots[slotProp].preferred || [];
      if (existing.some(p => p && p.key === filled.componentKey)) continue; // уже есть
      const resolved = resolvedByKey[filled.componentKey];
      const entry = { key: filled.componentKey, validated: false };
      if (resolved && resolved.name) entry.name = resolved.name;
      // nestedProps.ruleRef доавтоматически в секции findExpectedRuleRef ниже
      // (там обрабатываются все entry с nestedProps === undefined).
      rule.slots[slotProp].preferred = [...existing, entry];
      ownedFilledAdded++;
      changed++;
    }
  }

  // — variants: populate from VARIANT defs (only-if-null; resync только добавляет новые options)
  if (inspEntry && inspEntry.defs) {
    for (const [propName, def] of Object.entries(inspEntry.defs)) {
      if (def.type !== 'VARIANT') continue;
      const cleanProp = propName.split('#')[0]; // strip nodeId suffix if any
      if (!rule.variants) rule.variants = {};
      if (!rule.variants[cleanProp]) {
        rule.variants[cleanProp] = {
          options: Array.isArray(def.options) ? def.options.slice() : [],
          default: def.defaultValue ?? null
          // builderRule: NOT written — hypothesize territory
        };
        variantsWritten++;
        changed++;
      } else if (Array.isArray(rule.variants[cleanProp].options)) {
        // resync: add new options only (no deletions)
        const existingOpts = rule.variants[cleanProp].options;
        const newOpts = (def.options ?? []).filter(o => !existingOpts.includes(o));
        if (newOpts.length) {
          existingOpts.push(...newOpts);
          changed++;
        }
      }
    }
  }

  // — textProps: populate skeleton from TEXT defs (only-if-null)
  if (inspEntry && inspEntry.defs) {
    for (const [propName, def] of Object.entries(inspEntry.defs)) {
      if (def.type !== 'TEXT') continue;
      if (!rule.textProps) rule.textProps = {};
      if (!rule.textProps[propName]) {
        rule.textProps[propName] = {
          sampleTexts: [def.defaultValue].filter(Boolean)
          // builderRule: NOT written — hypothesize territory
        };
        textPropsWritten++;
        changed++;
      }
    }
  }

  // — textNode: auto-detect skeleton if exactly 1 intrinsic TEXT binding (only-if-null)
  const textBindings = Array.isArray(result.bindings)
    ? result.bindings.filter(b => b && b.textBy)
    : [];
  if (textBindings.length === 1 && !rule.textNode) {
    const b = textBindings[0];
    rule.textNode = {
      name: b.name,
      ...(b.visibleBy ? { visibleBy: b.visibleBy } : {}),
      sampleTexts: []
      // builderRule: NOT written — hypothesize territory
    };
    textNodeWritten = true;
    changed++;
  }
  // textBindings.length > 1: skip silently (textNodes[] axis not yet designed)
  if (textBindings.length > 1) {
    textNodesAmbiguous.push({ slug, count: textBindings.length });
  }

  // — nestedProps.ruleRef: auto-derive for preferred entries without nestedProps (only-if-null)
  // findExpectedRuleRef уже используется выше через slugify(resolved.name) match. Здесь
  // дополнительно покрываем случаи Stage 2 (name-based с homonym guard) для записей,
  // где slugify-based ветка выше не сработала.
  try {
    const caches = buildResolverCaches();
    const ownRuleForRef = { ...rule, slug };
    for (const slot of Object.values(rule.slots || {})) {
      for (const pEntry of (slot.preferred || [])) {
        if (!pEntry || pEntry.broken) continue;
        if (pEntry.nestedProps !== undefined) continue;
        const ref = findExpectedRuleRef(pEntry, ownRuleForRef, caches);
        if (ref && ref.slug) {
          pEntry.nestedProps = { policy: 'askDesigner', ruleRef: ref.slug };
          ruleRefsAdded++;
          changed++;
        }
      }
    }
  } catch (e) {
    console.error(`⚠ nestedProps.ruleRef auto-derive skipped: ${e.message}`);
  }

  // — tier: update from microtest verdict if provided
  if (result.tier && ['atom', 'composite', 'view'].includes(result.tier) && result.tier !== rule.tier) {
    rule.tier = result.tier;
    changed++;
  }

  let indexRegenerated = false;
  let indexStats = null;
  if (changed) {
    writeJson(rulePath, rule);
    // Авто-регенерация derived cache. Source of truth = rules, index = derived.
    // Synchronous; if genIndex throws (duplicate name, etc.), error пропагируется
    // наверх — пользователь видит, не silent drift.
    try {
      indexStats = genIndex();
      indexRegenerated = true;
    } catch (e) {
      // Rule сохранён, но index не обновился. Подсветим — пусть пользователь
      // починит руками. НЕ откатываем rule write — он валиден сам по себе.
      console.error(`⚠ rule.json saved, но genIndex упал: ${e.message}`);
      console.error('   Запусти руками: node tests/scripts/parseProps-utils.js gen-index');
    }
  }

  // — hasPlaceholders: 12:6 visible after default render OR boolean-flip
  const visiblePh = (result.results || []).flatMap(r => r.visiblePlaceholders || []);
  const matrixExposed = (result.booleanMatrix || []).filter(b => Array.isArray(b.ownedExposed) && b.ownedExposed.length > 0);
  const hasPlaceholders = visiblePh.length > 0 || matrixExposed.length > 0;

  // — Write cold data to .raw.json
  const raw = readJson(rawPath) || { slug };
  raw.slug = slug;
  if (result.autoPairs)  raw.autoPairs  = result.autoPairs;
  if (result.bindings)   raw.bindings   = result.bindings;
  if (Array.isArray(result.reactions) && result.reactions.length) raw.reactions = result.reactions;

  // Update lastMicrotest
  const vm = result.visualCheck || {};
  raw.lastMicrotest = {
    ranAt: new Date().toISOString(),
    ...(result.sandbox ? { sandboxFrameId: result.sandbox.id } : {}),
    totalAsserts: result.summary ? result.summary.total : null,
    passed:       result.summary ? result.summary.passed : null,
    failures: result.summary ? (result.summary.failedAsserts || []) : [],
    visualCheck: {
      hasErrors:       vm.hasErrors       ?? null,
      hasEmptyRenders: vm.hasEmptyRenders ?? null,
      gridComplete:    vm.gridComplete    ?? null,
      hasPlaceholders
    },
    visiblePlaceholders: visiblePh,
    matrixOwnedExposed: matrixExposed.map(b => ({ prop: b.prop, exposed: b.ownedExposed }))
  };

  writeJson(rawPath, raw);

  return {
    ok: true,
    target: 'rule.json',
    slug,
    changedFields: changed,
    autoPairsCount: result.autoPairs ? Object.keys(result.autoPairs).length : 0,
    booleansWritten: Object.keys(rule.booleans || {}).length,
    slotsWritten: Object.keys(rule.slots || {}).length,
    variantsWritten,
    textPropsWritten,
    textNodeWritten,
    ruleRefsAdded,
    ownedFilledAdded,
    pairedSlotFixed,
    textNodesAmbiguous,
    preferredKeysSource: Object.keys(preferredKeysBySlot).length ? 'inspected-props' : 'none',
    hasPlaceholders,
    rawWritten: true,
    indexRegenerated,
    indexEntries: indexStats?.components ?? null
  };
}

// ─── sourceLib sampleKey apply ────────────────────────────────────────────────
// Записывает sourceLib.sampleKey + sampleKeyResolvedAt (only-if-null) для
// указанных слотов. Вызывается агентом после discovery через search_design_system.
// Вход: { "<slotKey>": "<hex40>" }
function applySourceLibKeys(slug, sourceLibKeysMap) {
  const rulePath = path.join(RULES_DIR, `${slug}.rule.json`);
  const rule = readJson(rulePath);
  if (!rule) return { ok: false, reason: 'no .rule.json found' };

  let changed = 0;
  const ts = new Date().toISOString();
  for (const [slotKey, sampleKey] of Object.entries(sourceLibKeysMap)) {
    const slot = (rule.slots || {})[slotKey];
    if (!slot || !slot.sourceLib) continue;
    if (slot.sourceLib.sampleKey) continue; // only-if-null — не перезаписываем
    if (!/^[0-9a-f]{40}$/.test(sampleKey)) {
      console.error(`⚠ sampleKey для "${slotKey}" не 40-hex: ${sampleKey} — пропускаем`);
      continue;
    }
    slot.sourceLib.sampleKey = sampleKey;
    slot.sourceLib.sampleKeyResolvedAt = ts;
    changed++;
  }

  if (changed) {
    writeJson(rulePath, rule);
    let indexRegenerated = false;
    try { genIndex(); indexRegenerated = true; }
    catch (e) { console.error(`⚠ rule.json saved, но genIndex упал: ${e.message}`); }
    return { ok: true, slug, sampleKeysWritten: changed, indexRegenerated };
  }
  return { ok: true, slug, sampleKeysWritten: 0, note: 'all slots already had sampleKey or not found' };
}

// ─── Main ─────────────────────────────────────────────────────────────────────

const arg = process.argv[2];
if (!arg) {
  console.error('Usage:');
  console.error('  parseProps-apply-figma.js "<componentName>" --result=<json>');
  console.error('  parseProps-apply-figma.js "<componentName>" --result-file=<path>');
  console.error('  parseProps-apply-figma.js "<componentName>" --sourcelib-keys=\'{"<slotKey>":"<hex40>"}\'');
  process.exit(1);
}

const slug = slugify(arg);
const rulePath = path.join(RULES_DIR, `${slug}.rule.json`);

if (!fs.existsSync(rulePath)) {
  console.error(`✗ ${slug}.rule.json не существует.`);
  console.error('  /parseProps требует, чтобы rule файл уже был — сначала создай его');
  console.error('  через preflight (Component Agent), затем вызывай apply.');
  process.exit(3);
}

// Режим --sourcelib-keys: standalone, без --result
const sourceLibKeysFlag = process.argv.find(a => a.startsWith('--sourcelib-keys='));
if (sourceLibKeysFlag) {
  const keysJson = sourceLibKeysFlag.slice('--sourcelib-keys='.length);
  let keysMap;
  try { keysMap = JSON.parse(keysJson); }
  catch (e) { console.error('Bad JSON in --sourcelib-keys:', e.message); process.exit(2); }
  const applyResult = applySourceLibKeys(slug, keysMap);
  console.log(JSON.stringify(applyResult, null, 2));
  process.exit(applyResult.ok ? 0 : 4);
}

const fileFlag   = process.argv.find(a => a.startsWith('--result-file='));
const inlineFlag = process.argv.find(a => a.startsWith('--result='));
let raw;
if (fileFlag)   raw = fs.readFileSync(fileFlag.slice('--result-file='.length), 'utf8');
else if (inlineFlag) raw = inlineFlag.slice('--result='.length);
else { console.error('No result input. Use --result=, --result-file=, or --sourcelib-keys='); process.exit(2); }

let result;
try { result = JSON.parse(raw); } catch (e) { console.error('Bad JSON:', e.message); process.exit(2); }

// Microtest защитный fallback (#141 D): если key в rule был set-key, microtest
// резолвит variant-key через find-by-name. В rule НЕ пишем автоматически —
// предупреждаем, чтобы Настя осознанно запустила /syncKeys (или ручную правку).
if (result.keyResolvedFromSet && result.resolvedVariantKey) {
  console.error(`⚠ Microtest зарезолвил variant-key из ComponentSet: ${result.resolvedVariantKey}`);
  console.error('  Текущий rule.key — это set-key (не должен импортироваться).');
  console.error('  Запусти /syncKeys чтобы получить аудит и автофикс, либо обнови вручную.');
}

const applyResult = applyToRuleJson(arg, slug, result);
console.log(JSON.stringify(applyResult, null, 2));
