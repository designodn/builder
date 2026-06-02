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
const { genIndex, buildResolverCaches, findExpectedRuleRef, clearResolverCaches } = require('./parseProps-utils.js');

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

function trailingToken(name) {
  const t = String(name).trim().split(/[\s·❖◇.]+/).filter(Boolean);
  return (t[t.length - 1] || '').toLowerCase();
}

// Один проход по всем правилам: {trailingToken -> Set(lib)} + {slug -> key}.
// Используется для lib-эвристики и для guard'а slug-коллизий (без readdir на кандидата).
function scanRulesIndex() {
  const libByToken = {};   // token -> Set(lib)
  const keyBySlug = {};    // slug -> rule.key
  for (const f of fs.readdirSync(RULES_DIR)) {
    if (!f.endsWith('.rule.json')) continue;
    const r = readJson(path.join(RULES_DIR, f));
    if (!r) continue;
    const slug = f.replace(/\.rule\.json$/, '');
    if (r.key) keyBySlug[slug] = r.key;
    if (r.name && r.lib) {
      const tok = trailingToken(r.name);
      if (tok) (libByToken[tok] = libByToken[tok] || new Set()).add(r.lib);
    }
  }
  return { libByToken, keyBySlug };
}

// nested-closure: lib для стаба. Эвристика — соседи того же name-семейства
// (trailing-token). Единодушный lib → verified; иначе parent lib + verified:false
// (пометка для /syncKeys). importComponentByKeyAsync использует KEY, не lib — безопасно.
function resolveLibForStub(name, parentRule, libByToken) {
  const tok = trailingToken(name);
  const libs = tok && libByToken[tok];
  if (libs && libs.size === 1) return { lib: [...libs][0], verified: true };
  return { lib: (parentRule && parentRule.lib) || 'base-components', verified: false };
}

// nested-closure: создаёт WIP-стабы для discovery-кандидатов без rule-файла.
// 1 уровень за прогон (стабы approved:false подхватятся своим /parseProps).
// Идемпотентно: если файл уже есть — skip. Возвращает {created[], libUnverified[]}.
function createNestedStubs(parentRule, nestedDiscovery) {
  const created = [], libUnverified = [], mislinkGuarded = [];
  const seenKeys = new Set();      // дедуп файлов: варианты одного сета → один stub
  const keyToSlug = {};            // parent preferred key → stub slug (для прямой линковки)
  const { libByToken, keyBySlug } = scanRulesIndex();   // один проход
  for (const d of (nestedDiscovery || [])) {
    if (!d || d.error || !d.ruleKey || !d.type) continue;
    // для варианта сета slug/имя берём по СЕТУ (setName), не по варианту (d.name);
    // для standalone компонента — по d.name.
    const effName = (d.type === 's' && d.setName) ? d.setName : d.name;
    if (!effName) continue;
    const cslug = slugify(effName);
    if (!cslug) continue;
    const cpath = path.join(RULES_DIR, `${cslug}.rule.json`);
    const existingKey = keyBySlug[cslug];
    if (existingKey !== undefined) {
      // slug уже занят. Линкуем ТОЛЬКО если это тот же компонент (key совпал) —
      // иначе омонимичная коллизия с чужим curated-правилом: не линкуем, фиксируем.
      if (existingKey === d.ruleKey) keyToSlug[d.key] = cslug;
      else mislinkGuarded.push({ key: d.key, name: effName, slug: cslug, existingKey });
      continue;                                         // файл не трогаем (idempotency)
    }
    keyToSlug[d.key] = cslug;       // безопасно: slug создаём мы под этот key
    if (seenKeys.has(d.ruleKey)) continue;              // дедуп вариантов одного сета
    seenKeys.add(d.ruleKey);
    const { lib, verified } = resolveLibForStub(effName, parentRule, libByToken);
    const tier = d.type === 's' ? 'composite' : 'atom'; // грубо; microtest уточнит
    const stub = {
      $schema: '../schema/component-rule.schema.json',
      name: effName,
      slug: cslug,
      lib,
      key: d.ruleKey,
      type: d.type,
      tier,
      approved: false,
      doc: {
        whenToUse: verified
          ? 'TODO — заполнить через /parseProps + hypothesize (создан авто-closure как nested компонент).'
          : 'TODO — заполнить через /parseProps. [lib не подтверждён авто-closure — сверить через /syncKeys].'
      },
      layoutRules: null,
      variants: null,
      slots: null,
      booleans: null,
      textProps: null
    };
    writeJson(cpath, stub);
    keyBySlug[cslug] = d.ruleKey;   // guard intra-run: повторный slug с другим key упрётся в existingKey
    created.push(cslug);
    if (!verified) libUnverified.push(cslug);
  }
  // Прямая линковка: parent preferred.key → stub slug (детерминированно, ловит
  // вариант-именованные preferred, которые findExpectedRuleRef по имени не свяжет).
  let linked = 0;
  for (const slot of Object.values(parentRule.slots || {})) {
    for (const p of (slot.preferred || [])) {
      if (!p || p.broken || !p.key || !keyToSlug[p.key]) continue;
      if (p.nestedProps === null) continue;          // explicit opt-out (Inv9) — уважаем
      if (p.nestedProps && p.nestedProps.ruleRef) continue;
      p.nestedProps = p.nestedProps || {};
      if (!p.nestedProps.policy) p.nestedProps.policy = 'askDesigner';
      p.nestedProps.ruleRef = keyToSlug[p.key];
      linked++;
    }
  }
  return { created, libUnverified, linked, mislinkGuarded };
}

// Применяет microtest result в .rule.json
function applyToRuleJson(name, slug, result, opts = {}) {
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

  // directDefs: множество прямых prop-ключей из inspected-props для данного компонента.
  // autoPairs walk обходит ВСЁ дерево (вложенные компоненты тоже), поэтому filtruem:
  // пишем в rule только те autoPairs, чей boolean-ключ ИЛИ swap-ключ является прямым
  // componentProperty этого компонента (присутствует в inspEntry.defs).
  // Вложенные пропы (← iconLeft#13003:0, float#8520:0, addons#19194:0, …) игнорируем.
  const directDefs = inspEntry && inspEntry.defs ? new Set(Object.keys(inspEntry.defs)) : null;
  function isDirectProp(propKey) {
    if (!directDefs) return true; // нет inspected-props — пишем всё (legacy)
    return directDefs.has(propKey);
  }

  // — booleans: структура + defaultOn из booleanMatrix
  if (result.autoPairs && typeof result.autoPairs === 'object') {
    rule.booleans = rule.booleans || {};
    for (const [boolProp, owned] of Object.entries(result.autoPairs)) {
      // Фильтр: пропускаем не-прямые пропы (вложенные из nested-компонентов)
      if (!isDirectProp(boolProp)) continue;
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
      // Фильтр: пропускаем не-прямые пропы (вложенные из nested-компонентов)
      if (!isDirectProp(boolProp)) continue;
      const swaps = Array.isArray(owned.ownedSwap) ? owned.ownedSwap : [];
      for (const swapProp of swaps) {
        // autoPairs.ownedSwap содержит NODE NAMES (не prop names) → их нет в directDefs.
        // Пропускаем: slots создаются через inspected-props (ниже по коду), не из node names.
        if (!isDirectProp(swapProp)) continue;
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
      // Bugfix: TEXT props хранят полный ключ с #nodeId суффиксом — как BOOLEAN и SLOT.
      // VARIANT props суффикса не имеют от природы (inspected-props не пишет его).
      // Для backward-compat проверяем и stripped-вариант: если старая rule уже имеет
      // cleanProp без суффикса — не создаём дубль под полным ключом.
      const strippedKey = propName.split('#')[0];
      if (!rule.textProps) rule.textProps = {};
      if (!rule.textProps[propName] && !rule.textProps[strippedKey]) {
        rule.textProps[propName] = {
          sampleTexts: [def.defaultValue].filter(Boolean)
          // builderRule: NOT written — hypothesize territory
        };
        textPropsWritten++;
        changed++;
      }
    }
  }

  // — textNode: auto-detect убран (bugfix).
  // result.bindings содержит ноды с componentPropertyReferences (b.textBy = refs.characters
  // = TEXT-prop binding). Это ровно те ноды, что уже попали в textProps выше.
  // Настоящие intrinsic-текстовые ноды (без componentPropertyReferences) в bindings
  // никогда не появляются — auto-detect никогда не срабатывал по назначению,
  // но мог записать дубль из textProps в textNode. textNode выставляется через
  // hypothesize (/parseProps Шаг 4) где агент спрашивает дизайнера.

  // — nested-closure (--close-nested): создаём стабы для нестедов без rule-файла
  // ДО loop'а линковки ниже — тогда findExpectedRuleRef подхватит их по ключу/имени.
  let nestedStubsCreated = [];
  let nestedLibUnverified = [];
  let nestedMislinkGuarded = [];
  if (opts.closeNested && Array.isArray(result.nestedDiscovery) && result.nestedDiscovery.length) {
    const r = createNestedStubs(rule, result.nestedDiscovery);
    nestedStubsCreated = r.created;
    nestedLibUnverified = r.libUnverified;
    nestedMislinkGuarded = r.mislinkGuarded;
    ruleRefsAdded += r.linked;
    if (r.created.length || r.linked) changed++;
  }

  // — nestedProps.ruleRef: auto-derive for preferred entries without nestedProps (only-if-null)
  // findExpectedRuleRef уже используется выше через slugify(resolved.name) match. Здесь
  // дополнительно покрываем случаи Stage 2 (name-based с homonym guard) для записей,
  // где slugify-based ветка выше не сработала.
  // Bugfix: buildResolverCaches — module-level singleton; после createNestedStubs
  // (выше) новые .rule.json на диске, но кэш стал stale — сбрасываем перед вызовом.
  if (nestedStubsCreated.length) clearResolverCaches();
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

  // — isDefault normalization: для каждого slot'а с ≥1 validated&&!broken preferred
  // и без единого isDefault — помечаем первый validated дефолтом. Идемпотентно
  // (existing isDefault не трогаем). Это закрывает inv8-omission в её настоящем
  // месте: isDefault осмысленен только когда preferred validated, а валидируются
  // они здесь (через microtest), не в stub. Если default определён иначе —
  // человек переставит флаг вручную, повторный прогон его не перезатрёт.
  let isDefaultsSet = 0;
  for (const slot of Object.values(rule.slots || {})) {
    const validated = (slot.preferred || []).filter(p => p.validated && !p.broken);
    if (validated.length >= 1 && !validated.some(p => p.isDefault)) {
      validated[0].isDefault = true;
      isDefaultsSet++;
      changed++;
    }
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
    failures: result.summary ? (result.summary.failedAsserts || {}) : {},
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
    isDefaultsSet,
    pairedSlotFixed,
    textNodesAmbiguous,
    nestedStubsCreated,
    nestedLibUnverified,
    nestedMislinkGuarded,
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

// Режим --mark-nested-asked: standalone. Штампует rule.nestedAsked = <ISO now>.
// Вызывается агентом ПОСЛЕ AskUserQuestion Шага 4.6 — в ОБЕИХ ветках ответа
// («парсить глубже» И «все атомы»). Это единственный честный сигнал «спросили»;
// nestedProps.policy для этого не годится (required-дефолт схемы, не диалог).
if (process.argv.includes('--mark-nested-asked')) {
  const rule = readJson(rulePath);
  if (!rule) { console.error(`✗ не прочитать rule: ${rulePath}`); process.exit(3); }
  rule.nestedAsked = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
  writeJson(rulePath, rule);
  console.log(JSON.stringify({ ok: true, slug, nestedAsked: rule.nestedAsked }, null, 2));
  process.exit(0);
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

const closeNested = process.argv.includes('--close-nested');
const applyResult = applyToRuleJson(arg, slug, result, { closeNested });

// ВАЖНО: --close-nested НЕ штампует nestedAsked. Этот флаг создаёт стабы для
// незарегистрированных nested (в т.ч. в batch/closure-прогонах БЕЗ диалога с
// Настей) — он доказывает «есть глубже-кандидаты», а не «про них спросили».
// Связывать эти события — ложный сигнал (ревью #328 HIGH). nestedAsked пишется
// ТОЛЬКО явной командой --mark-nested-asked, которую агент зовёт сразу после
// AskUserQuestion Шага 4.6 (обе ветки ответа).

console.log(JSON.stringify(applyResult, null, 2));
