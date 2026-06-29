#!/usr/bin/env node
// applyRuleDriven-tests — host-side reasoning core (E.0 semantic-roles)
// + plugin-side runtime helper (PR-B #205 Step 1).
//
// Контракт зафиксирован issue #205, не менять signature без отдельного issue.
//
// Покрытие:
//   1) anti-cycle:           seen-Set режется по visited, не SO.
//   2) layoutRules:          top-level only — nested не получает.
//   3) picked-vs-isDefault:  semantic match выигрывает у isDefault.
//   4) PIN-фикстура:         CJM «PIN-экран» → keyboardNumeric.
//   5) appliesTo mismatch:   slot.role в preferred.semanticRoles[] → G-I2.1 hard-fail.
//   b) bundle closure recurse meshok-up → navbar.
//   c) cycle hit — sibling slot still applied.
//   d) missing slug in bundle + missing component key (silent skip).
//   e) multi-instance same-slug different-path — TWO children orders.
//   f) alwaysOn:true + decision:'hide' override — slot stays ON.
//
// Запуск: node tests/scripts/applyRuleDriven-tests.js

'use strict';

const assert = require('assert');
const path = require('path');
const fs = require('fs');
const { makeStubFigma } = require('./figma-stub');

const ROOT = path.resolve(__dirname, '..', '..');
const RULES_DIR = path.join(ROOT, 'rules/components');
const SEMANTIC_ROLES_PATH = path.join(ROOT, 'rules/semantic-roles.json');
const BUILDER_CONSTANTS = JSON.parse(
  fs.readFileSync(path.join(ROOT, 'rules/builder-constants.json'), 'utf8')
);

const RULE_TREE_MAX_DEPTH = BUILDER_CONSTANTS.RULE_TREE_MAX_DEPTH;

function loadRule(slug) {
  const p = path.join(RULES_DIR, `${slug}.rule.json`);
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

// ── HOST-SIDE SIMULATION (для тестов 1-5) ────────────────────────────────
function buildTree(slug, ctx, depth, seen) {
  if (depth > RULE_TREE_MAX_DEPTH) return { slug, truncated: true };
  if (seen.has(slug)) return { slug, cycle: true };
  seen = new Set(seen); seen.add(slug);
  const rule = loadRule(slug);
  const node = { slug, slots: {}, depth };
  if (depth === 0 && rule.layoutRules) node.layoutRules = rule.layoutRules;
  for (const [slotProp, slotInfo] of Object.entries(rule.slots || {})) {
    const picked = pickPreferred(slotInfo, ctx);
    node.slots[slotProp] = {
      picked: picked ? picked.name : null,
      reason: picked ? picked._reason : 'no-match'
    };
    if (picked && picked.nestedProps && picked.nestedProps.ruleRef) {
      node.slots[slotProp].nested = buildTree(picked.nestedProps.ruleRef, ctx, depth + 1, seen);
    }
  }
  return node;
}

function pickPreferred(slotInfo, ctx) {
  const preferred = (slotInfo.preferred || []).filter(p => !p.broken);
  if (preferred.length === 0) return null;
  if (ctx.semanticRolesEnabled && slotInfo.role && ctx.activeRoles) {
    const semMatches = preferred.filter(p =>
      Array.isArray(p.semanticRoles) && p.semanticRoles.some(r => ctx.activeRoles.includes(r))
    );
    if (semMatches.length) { semMatches[0]._reason = 'semantic-match'; return semMatches[0]; }
  }
  const def = preferred.find(p => p.isDefault);
  if (def) { def._reason = 'isDefault'; return def; }
  preferred[0]._reason = 'first-non-broken';
  return preferred[0];
}

// ── PLUGIN-SIDE HELPERS (literal copy from .claude/commands/builder.md) ──
// safeSetProps / normalizePencil / findSwappedChild / setTextNodeContent —
// стабильны в PR-B, копируются без sentinel'ов. applyRuleDriven body — под
// sentinel'ом, sync проверяется через `bash tools/verify-helper-sync.sh`.

function safeSetProps(inst, props) {
  if (!inst || !props) return 0;
  const known = (inst.componentProperties && Object.keys(inst.componentProperties)) || [];
  const out = {};
  for (const k of Object.keys(props)) {
    let resolved = known.indexOf(k) !== -1 ? k : null;
    if (!resolved) {
      const norm = normalizePencil(k);
      if (norm !== k && known.indexOf(norm) !== -1) {
        try { console.info('[safeSetProps] pencil normalized:', JSON.stringify(k), '→', JSON.stringify(norm)); } catch (e) {}
        resolved = norm;
      }
    }
    if (resolved) {
      out[resolved] = props[k];
    } else {
      try { console.warn('[safeSetProps] unknown componentProperty key skipped:', JSON.stringify(k), 'on', inst && inst.name); } catch (e) {}
    }
  }
  const n = Object.keys(out).length;
  if (n > 0) {
    try { inst.setProperties(out); } catch (e) { return 0; }
  }
  return n;
}

function normalizePencil(key) {
  if (typeof key !== 'string') return key;
  if (key.charCodeAt(0) === 0x270E) return '✏️' + key.slice(1);
  if (key.charCodeAt(0) === 0x270F && key.charCodeAt(1) === 0xFE0F) return '✎' + key.slice(2);
  return key;
}

function findSwappedChild(inst, comp, childIdsBefore) {
  childIdsBefore = childIdsBefore || [];
  var beforeSet = {};
  for (var i = 0; i < childIdsBefore.length; i++) beforeSet[childIdsBefore[i]] = true;
  var queue = [];
  if ('children' in inst) for (var ci = 0; ci < inst.children.length; ci++) queue.push(inst.children[ci]);
  var fallback = null;
  while (queue.length) {
    var n = queue.shift();
    if (n.type === 'INSTANCE' && n.mainComponent && n.mainComponent.id === comp.id) {
      if (!beforeSet[n.id]) return n;
      if (!fallback) fallback = n;
    }
    if ('children' in n) for (var cj = 0; cj < n.children.length; cj++) queue.push(n.children[cj]);
  }
  return fallback;
}

async function setTextNodeContent(inst, text, font) {
  if (!inst || text === undefined || text === null || text === '') return;
  const targetFont = font || { family: 'Inter', style: 'Regular' };
  try { await figma.loadFontAsync(targetFont); } catch (e) { return; }
  const queue = [];
  if ('children' in inst) for (const c of inst.children) queue.push(c);
  while (queue.length) {
    const n = queue.shift();
    if (n.type === 'TEXT') {
      if (typeof n.fontName === 'symbol') return;
      try {
        if (n.fontName && typeof n.fontName === 'object' && n.fontName.family !== targetFont.family) {
          await figma.loadFontAsync(n.fontName);
          n.characters = String(text);
        } else {
          n.fontName = targetFont;
          n.characters = String(text);
        }
      } catch (e) {}
      return;
    }
    if ('children' in n) for (const c of n.children) queue.push(c);
  }
}

// === HELPER_BODY:START applyRuleDriven ===
// applyRuleDriven — рекурсивный helper для R-021/R-036/R-037/A-058.
// Контракт PR-B (#205 Step 1): signature (inst, ruleSlug, ctx) где
//   ctx = { bundle, overrides, path, visited }.
//   - bundle — детерминированный output tools/build-rule-bundle.js. Helper
//     читает rule = ctx.bundle.rulesBySlug[ruleSlug]. Никакого file I/O.
//   - overrides — flat array проекции из _session.builder_picks[] + text_picks[].
//     Каждая запись: { slug, kind, slotProp|variantProp|textProp|textNode, path, ... }.
//     Лукап через findOverride() с element-wise array equality на path.
//   - path — массив slot prop names verbatim, ordered ["meshok-up", "navbar#1491:0", ...].
//   - visited — Set<string> slug'ов уже на текущей ветке. Branch-local, cloned
//     при каждом recurse через new Set([...ctx.visited, ruleSlug]).
//
// При правке между HELPER_BODY:START/END — обязательно прогнать
// `bash tools/verify-helper-sync.sh` до коммита (sync с
// tests/scripts/applyRuleDriven-tests.js literal copy).
function arrayEquals(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b)) return false;
  if (a.length !== b.length) return false;
  for (var i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

function findOverride(overrides, slug, kind, key, path) {
  if (!Array.isArray(overrides)) return null;
  for (var i = 0; i < overrides.length; i++) {
    var o = overrides[i];
    if (o.slug !== slug) continue;
    if (o.kind !== kind) continue;
    if (kind === 'slot' && o.slotProp !== key) continue;
    if (kind === 'variant' && o.variantProp !== key) continue;
    if (kind === 'text' && o.textProp !== key) continue;
    if (kind === 'textNode' && o.textNode !== true) continue;
    if (!arrayEquals(o.path, path)) continue;
    return o;
  }
  return null;
}

async function applyRuleDriven(inst, ruleSlug, ctx) {
  if (!inst) return;
  if (!ctx || !ctx.bundle || !ctx.path || !ctx.visited) {
    try { console.warn('[applyRuleDriven] missing ctx fields'); } catch (e) {}
    return;
  }
  // Cycle guard: per-branch visited Set. Возврат из nested-вызова, sibling
  // slots в parent loop продолжают (branch-local, не module-scoped).
  if (ctx.visited.has(ruleSlug)) {
    try { console.warn('[applyRuleDriven] cycle skipped:', ruleSlug, 'path=', ctx.path.join('/')); } catch (e) {}
    return;
  }
  var rule = ctx.bundle.rulesBySlug && ctx.bundle.rulesBySlug[ruleSlug];
  if (!rule) {
    try { console.warn('[applyRuleDriven] rule missing in bundle:', ruleSlug, 'path=', ctx.path.join('/')); } catch (e) {}
    return;
  }
  var overrides = ctx.overrides || [];
  // Soft warn для likely overrides-projection бага (resolution F из плана #205).
  // Если у top-level rule есть slots, но overrides пусто — Builder скорее всего
  // забыл спроецировать picks. Helper всё равно применит preferred[isDefault]
  // fallback, но это сигнал в логи для post-mortem.
  if (overrides.length === 0 && Object.keys(rule.slots || {}).length > 0 && ctx.path.length === 1) {
    try { console.warn('[applyRuleDriven] overrides empty but rule has slots — projection bug?', ruleSlug); } catch (e) {}
  }

  // --- 0. layoutRules: позиционирование инстанса в parent (top-level only) ---
  // Применяется ДО slots loop: это свойства самого инстанса, swap'ы их не трогают.
  // Контракт: parent у инстанса УЖЕ должен быть (parent.appendChild сделан
  // хост-кодом до вызова applyRuleDriven), иначе Figma отвергнет ABSOLUTE.
  // resize(parent.width, instance.height) helper НЕ делает — нет ссылки на parent
  // в helper-сигнатуре. Resize — ответственность хост-кода use_figma снэшота.
  //
  // Gate ctx.path.length === 1: только top-level (корень bundle'а), nested-инстансы
  // живут в auto-layout родителе, не относительно экрана. Без gate — каждый
  // вложенный инстанс пытался бы стать ABSOLUTE.
  //
  // Edge-case guard (ref #215, sparkle-bug): если parent — auto-layout container
  // (layoutMode !== 'NONE'), Figma примет ABSOLUTE тихо, но parent.width будет
  // content-width minus padding — инстанс не растянется. Helper здесь —
  // defense-in-depth, тихо пропускает.
  if (ctx.path.length === 1 && rule.layoutRules && rule.layoutRules.layoutPositioning === 'ABSOLUTE') {
    var parentLayoutMode = (inst.parent && inst.parent.layoutMode) || 'NONE';
    if (parentLayoutMode === 'NONE') {
      var lr = rule.layoutRules;
      try { inst.layoutPositioning = 'ABSOLUTE'; } catch (e) {}
      var anchored = lr.anchoredTo;
      if (anchored === 'bottom')      { try { inst.constraints = { horizontal: 'STRETCH', vertical: 'MAX' }; } catch (e) {} }
      else if (anchored === 'top')    { try { inst.constraints = { horizontal: 'STRETCH', vertical: 'MIN' }; } catch (e) {} }
      else if (anchored === 'left')   { try { inst.constraints = { horizontal: 'MIN', vertical: 'STRETCH' }; } catch (e) {} }
      else if (anchored === 'right')  { try { inst.constraints = { horizontal: 'MAX', vertical: 'STRETCH' }; } catch (e) {} }
      else if (anchored === 'center') { try { inst.constraints = { horizontal: 'CENTER', vertical: 'STRETCH' }; } catch (e) {} }
      // иначе — anchoredTo unknown → constraints не трогаем.
    }
    // else: auto-layout parent — silent skip (sparkle-guard).
  }

  // --- 1. Slots: swap или skip + рекурсивный вход в nested ---
  for (var slotProp in rule.slots || {}) {
    if (!Object.prototype.hasOwnProperty.call(rule.slots, slotProp)) continue;
    var slotInfo = rule.slots[slotProp];
    var pairedBool = slotInfo.pairedBoolean;
    var slotOv = findOverride(overrides, ruleSlug, 'slot', slotProp, ctx.path);
    var slotVisible = true;

    if (pairedBool) {
      var boolSpec = (rule.booleans && rule.booleans[pairedBool]) || {};
      // pairedBooleanOverride: alwaysOn precedence preserved — defense-in-depth.
      var override = slotOv && slotOv.pairedBooleanOverride;
      var shouldBeOn;
      if (boolSpec.alwaysOn === true) {
        shouldBeOn = true;  // alwaysOn не перебивается override
      } else if (typeof override === 'boolean') {
        shouldBeOn = override;
      } else {
        shouldBeOn = !!boolSpec.defaultOn;
      }
      safeSetProps(inst, { [pairedBool]: shouldBeOn });
      slotVisible = shouldBeOn;
    }

    if (!slotVisible) continue;

    // picked из override.picked (E.0 reasoning через builder_picks) или fallback
    // на preferred[isDefault]. override.picked может быть строкой (preferred.name)
    // или объектом — поддержим оба формата.
    var picked = null;
    if (slotOv && slotOv.picked) {
      if (typeof slotOv.picked === 'string') {
        picked = (slotInfo.preferred || []).find(function (p) { return p.name === slotOv.picked && !p.broken; });
      } else if (typeof slotOv.picked === 'object') {
        picked = slotOv.picked;
      }
    }
    if (!picked) {
      picked = (slotInfo.preferred || []).find(function (p) { return p.isDefault === true && !p.broken; });
    }
    if (!picked || !picked.key) continue;

    var comp;
    try { comp = await figma.importComponentByKeyAsync(picked.key); }
    catch (e) {
      try { console.warn('[applyRuleDriven] importComponentByKeyAsync failed:', picked.key, e && e.message, 'path=', ctx.path.join('/')); } catch (_) {}
      continue;
    }

    // Snapshot children IDs ДО setProperties (#205 Step 2 PR-C2 fix).
    // Figma при INSTANCE_SWAP создаёт новую ноду с новым ID — старая destroy'ится.
    // findSwappedChild ниже использует этот snapshot чтобы найти именно НОВОГО
    // child'а (mainComponent.id matches AND id not in beforeSet), а не первый
    // BFS-матч. Закрывает test (e) multi-instance same-slug different-path
    // (PR-B documented BFS-limitation).
    var childIdsBefore = ('children' in inst) ? inst.children.map(function (c) { return c.id; }) : [];

    if (!safeSetProps(inst, { [slotProp]: comp.id })) continue;

    // Рекурсия: для каждого свапа смотрим nestedProps.ruleRef → если есть,
    // находим child и применяем правило для nested-slug'а.
    var nestedRef = picked.nestedProps && picked.nestedProps.ruleRef;
    if (nestedRef) {
      var child = findSwappedChild(inst, comp, childIdsBefore);
      if (child) {
        await applyRuleDriven(child, nestedRef, {
          bundle: ctx.bundle,
          overrides: ctx.overrides,
          path: ctx.path.concat([slotProp]),
          visited: new Set([...ctx.visited, ruleSlug])
        });
      }
    }
  }

  // --- 2. textProps (componentProperty TEXT-type) ---
  // Приоритет: override.contextText > rule.default > rule.sampleTexts[0].
  for (var textProp in rule.textProps || {}) {
    if (!Object.prototype.hasOwnProperty.call(rule.textProps, textProp)) continue;
    var tp = rule.textProps[textProp];
    var textOv = findOverride(overrides, ruleSlug, 'text', textProp, ctx.path);
    var value = (textOv && textOv.contextText) || tp.default || (tp.sampleTexts && tp.sampleTexts[0]);
    if (value !== undefined && value !== null && value !== '') {
      safeSetProps(inst, { [textProp]: String(value) });
    }
  }

  // --- 3. textNode (intrinsic TEXT-нода) ---
  // Используется когда у компонента нет componentProperty TEXT-type
  // (классический случай: navbar middle "no subtitle · content").
  if (rule.textNode) {
    var tnOv = findOverride(overrides, ruleSlug, 'textNode', null, ctx.path);
    var text = (tnOv && tnOv.contextText) || rule.textNode.default;
    if (text) {
      await setTextNodeContent(inst, text, rule.textNode.font || { family: 'Inter', style: 'Regular' });
    }
  }

  // --- 4. Variants: override.variantValue > rule.default ---
  var variantUpdates = {};
  for (var vProp in rule.variants || {}) {
    if (!Object.prototype.hasOwnProperty.call(rule.variants, vProp)) continue;
    var v = rule.variants[vProp];
    var varOv = findOverride(overrides, ruleSlug, 'variant', vProp, ctx.path);
    var vvalue = (varOv && varOv.variantValue !== undefined) ? varOv.variantValue : v.default;
    if (vvalue !== undefined && vvalue !== null) variantUpdates[vProp] = vvalue;
  }
  if (Object.keys(variantUpdates).length > 0) {
    safeSetProps(inst, variantUpdates);
  }

  // --- 5. Standalone booleans (не paired с slot'ом) ---
  // alwaysOn / defaultOn применяются явно. Закрывает sparkle-баг в inputText.left.
  for (var boolProp in rule.booleans || {}) {
    if (!Object.prototype.hasOwnProperty.call(rule.booleans, boolProp)) continue;
    var b = rule.booleans[boolProp];
    if (b.pairedSlot) continue;  // paired — обработано в slots loop выше
    if (b.alwaysOn) {
      safeSetProps(inst, { [boolProp]: true });
    } else if (typeof b.defaultOn === 'boolean') {
      safeSetProps(inst, { [boolProp]: b.defaultOn });
    }
  }
}
// === HELPER_BODY:END applyRuleDriven ===

// ── Existing tests 1-5 (host-side reasoning, sync) ──────────────────────

(function testAntiCycle() {
  const tree = buildTree('meshok-down', { semanticRolesEnabled: false }, 0, new Set(['meshok-down']));
  assert.strictEqual(tree.cycle, true, 'anti-cycle: ожидался cycle:true при повторном входе в slug');
  console.log('ok 1 — anti-cycle режется через visited Set (seed-based)');
})();

(function testLayoutRules() {
  const top = buildTree('meshok-down', { semanticRolesEnabled: false }, 0, new Set());
  const rule = loadRule('meshok-down');
  if (rule.layoutRules) {
    assert.deepStrictEqual(top.layoutRules, rule.layoutRules, 'layoutRules должны быть на top-level (depth=0)');
  }
  const nested = buildTree('meshok-down', { semanticRolesEnabled: false }, 1, new Set());
  assert.ok(!('layoutRules' in nested), 'layoutRules НЕ должны попадать в nested-узел (depth>0)');
  console.log('ok 2 — layoutRules только на top-level');
})();

(function testPickedVsDefault() {
  const slotInfo = {
    role: 'system/bottom',
    preferred: [
      { name: 'tabbarPrimary',  isDefault: true, semanticRoles: ['system/authenticated-main'] },
      { name: 'keyboardNumeric',                 semanticRoles: ['system/numeric-input'] }
    ]
  };
  const off = pickPreferred(slotInfo, { semanticRolesEnabled: false });
  assert.strictEqual(off.name, 'tabbarPrimary', 'flag=false → isDefault выигрывает');
  assert.strictEqual(off._reason, 'isDefault');
  const on = pickPreferred(slotInfo, { semanticRolesEnabled: true, activeRoles: ['system/numeric-input'] });
  assert.strictEqual(on.name, 'keyboardNumeric', 'flag=true → semantic match бьёт isDefault');
  assert.strictEqual(on._reason, 'semantic-match');
  console.log('ok 3 — semantic match > isDefault при flag=on');
})();

(function testPinFixture() {
  const ctx = { semanticRolesEnabled: true, activeRoles: ['system/numeric-input'] };
  const tree = buildTree('meshok-down', ctx, 0, new Set());
  const sysEntry = Object.entries(tree.slots).find(([k]) => k.startsWith('✏️ systemComponent') || k.startsWith('systemComponent'));
  assert.ok(sysEntry, 'systemComponent slot должен присутствовать в tree');
  const [_, sys] = sysEntry;
  const meshokRule = loadRule('meshok-down');
  const sysSlotInfo = Object.values(meshokRule.slots).find(s => s.role === 'system/bottom');
  const hasKeyboardNumeric = (sysSlotInfo.preferred || []).some(p => p.name && p.name.includes('keyboardNumeric'));
  assert.ok(hasKeyboardNumeric, 'fixture pre-check: keyboardNumeric отсутствует в meshok-down.preferred — переименование?');
  assert.strictEqual(sys.picked, 'keyboardNumeric ❖ view', 'PIN-контекст → keyboardNumeric');
  assert.strictEqual(sys.reason, 'semantic-match');
  console.log('ok 4 — PIN-фикстура: CJM "PIN-экран" → keyboardNumeric через semantic match');
})();

(function testAppliesToMismatch() {
  const semanticRoles = JSON.parse(fs.readFileSync(SEMANTIC_ROLES_PATH, 'utf8'));
  function validateGI21(slug, slot) {
    const usages = [];
    if (slot.role) usages.push({ where: 'slot', role: slot.role });
    for (const p of (slot.preferred || [])) {
      for (const r of (p.semanticRoles || [])) usages.push({ where: 'preferred', role: r, name: p.name });
    }
    for (const u of usages) {
      const [ns, key] = u.role.split('/');
      const def = semanticRoles.namespaces[ns] && semanticRoles.namespaces[ns].roles[key];
      if (!def) throw new Error(`G-I2.1: unknown role "${u.role}" in ${slug}`);
      const ok = def.appliesTo === 'both' || def.appliesTo === u.where || !def.appliesTo;
      if (!ok) {
        throw new Error(`G-I2.1: appliesTo mismatch — role "${u.role}" (appliesTo:${def.appliesTo}) used in ${u.where}${u.name ? ` (preferred "${u.name}")` : ''}`);
      }
    }
  }
  const bad = {
    role: 'system/bottom',
    preferred: [{ name: 'bad-candidate', semanticRoles: ['system/bottom'] }]
  };
  assert.throws(
    () => validateGI21('test-rule', bad),
    /G-I2\.1: appliesTo mismatch/,
    'system/bottom в preferred → hard-fail (appliesTo:"slot")'
  );
  const meshok = loadRule('meshok-down');
  for (const [slotProp, slotInfo] of Object.entries(meshok.slots || {})) {
    validateGI21(`meshok-down.${slotProp}`, slotInfo);
  }
  console.log('ok 5 — G-I2.1: appliesTo mismatch ловит, meshok-down проходит');
})();

// ── New tests b-f (plugin-side runtime, async, использует stub-Figma) ────

function captureWarns() {
  const orig = console.warn;
  const warns = [];
  console.warn = function (...args) { warns.push(args.join(' ')); };
  return {
    warns,
    restore() { console.warn = orig; }
  };
}

async function testB_recurse() {
  const stub = makeStubFigma();
  global.figma = stub.figma;
  // После PR-C2 stub upgrade: registerComponent с componentPropertyDefinitions
  // — новые swap-child'ы наследуют эти props (как в реальной Figma).
  stub.registerComponent('NAVBAR_KEY', {
    id: 'comp_navbar',
    componentPropertyDefinitions: { 'title#9:0': { type: 'TEXT' } },
  });

  const bundle = { rulesBySlug: {
    'meshok-up': {
      slots: { 'navbar#1491:0': { preferred: [
        { key: 'NAVBAR_KEY', name: 'navbar 1.0', isDefault: true,
          nestedProps: { ruleRef: 'navbar' } }
      ] } }
    },
    'navbar': {
      slots: {},
      textProps: { 'title#9:0': { default: 'Заголовок' } }
    }
  }};

  const navbarChild = stub.makeInstance({
    id: 'child_navbar', mainComponent: { id: 'comp_navbar' },
    componentProperties: { 'title#9:0': { type: 'TEXT' } }
  });
  const inst = stub.makeInstance({
    id: 'root_meshok', children: [navbarChild],
    componentProperties: { 'navbar#1491:0': { type: 'INSTANCE_SWAP' } }
  });

  await applyRuleDriven(inst, 'meshok-up', {
    bundle, overrides: [], path: ['meshok-up'], visited: new Set()
  });

  // Top-level slot swap recorded
  const topSwap = stub.recorder.find(e => e.type === 'setProperties' && e.instId === 'root_meshok' && e.payload['navbar#1491:0']);
  assert.ok(topSwap, 'top-level swap navbar#1491:0 not recorded');

  // Sanity: stub INSTANCE_SWAP simulation создал свежий swap-child. Без этого
  // event'а тест (b) failure-mode crypti: «nested textProp не применён», но
  // реальная причина — stub regression в figma-stub.js setProperties. Architect
  // PR-C2 review pushback: localize failure mode явным sanity-ассертом.
  const swapEvt = stub.recorder.find(e => e.type === 'instanceSwap' && e.instId === 'root_meshok');
  assert.ok(swapEvt, 'stub INSTANCE_SWAP simulation сломан — no swap-child created');

  // Recurse hit: nested textProp применён. После PR-C2 helper находит
  // newly-swap-created child (НЕ pre-existing child_navbar — он в snapshot),
  // поэтому instId — это id нового свапнутого child'а.
  const nestedText = stub.recorder.find(e => e.type === 'setProperties' && e.instId !== 'root_meshok' && e.payload['title#9:0'] === 'Заголовок');
  assert.ok(nestedText, 'nested textProp применён — рекурсия не дошла до уровня 2');

  console.log('ok b — meshok-up → navbar recurse: BFS реально входит в nested');
}

async function testC_cycle() {
  const stub = makeStubFigma();
  global.figma = stub.figma;
  // Регистрируем components с componentPropertyDefinitions чтобы новые swap-child'ы
  // получали правильные слоты для nested setProperties (PR-C2 stub upgrade).
  stub.registerComponent('A_KEY', {
    id: 'comp_a',
    componentPropertyDefinitions: { sA: { type: 'INSTANCE_SWAP' }, sSibling: { type: 'INSTANCE_SWAP' } },
  });
  stub.registerComponent('B_KEY', {
    id: 'comp_b',
    componentPropertyDefinitions: { sB: { type: 'INSTANCE_SWAP' } },
  });
  stub.registerComponent('X_KEY', { id: 'comp_x' });

  const bundle = { rulesBySlug: {
    'a': {
      slots: {
        'sA': { preferred: [{ key: 'B_KEY', name: 'goB', isDefault: true,
                              nestedProps: { ruleRef: 'b' } }] },
        'sSibling': { preferred: [{ key: 'X_KEY', name: 'goX', isDefault: true }] }
      }
    },
    'b': {
      slots: {
        'sB': { preferred: [{ key: 'A_KEY', name: 'backToA', isDefault: true,
                              nestedProps: { ruleRef: 'a' } }] }
      }
    }
  }};

  const childB = stub.makeInstance({
    id: 'child_b', mainComponent: { id: 'comp_b' },
    componentProperties: { 'sB': { type: 'INSTANCE_SWAP' } },
    children: [stub.makeInstance({ id: 'child_a_in_b', mainComponent: { id: 'comp_a' } })]
  });
  const childX = stub.makeInstance({
    id: 'child_x', mainComponent: { id: 'comp_x' }
  });
  const root = stub.makeInstance({
    id: 'root_a', children: [childB, childX],
    componentProperties: { 'sA': { type: 'INSTANCE_SWAP' }, 'sSibling': { type: 'INSTANCE_SWAP' } }
  });

  const cap = captureWarns();
  try {
    await applyRuleDriven(root, 'a', { bundle, overrides: [], path: ['a'], visited: new Set() });
  } finally { cap.restore(); }

  // Sibling slot still applied — это критический ассерт
  const siblingSwap = stub.recorder.find(e => e.type === 'setProperties' && e.instId === 'root_a' && e.payload['sSibling']);
  assert.ok(siblingSwap, 'sibling slot не применён — cycle сломал весь loop вместо return из nested');

  // Cycle warning fired
  const cycleWarn = cap.warns.find(w => w.includes('cycle') && w.includes('a'));
  assert.ok(cycleWarn, 'cycle warning не записан');

  console.log('ok c — cycle hit: sibling slot всё равно применился (return из nested, не из всего helper)');
}

async function testD_missing() {
  // (d.1) ruleRef в bundle отсутствует
  {
    const stub = makeStubFigma();
    global.figma = stub.figma;
    stub.registerComponent('B_KEY', { id: 'comp_b' });
    stub.registerComponent('OK_KEY', { id: 'comp_ok' });

    const bundle = { rulesBySlug: {
      'a': {
        slots: {
          'sBad': { preferred: [{ key: 'B_KEY', name: 'goNowhere', isDefault: true,
                                  nestedProps: { ruleRef: 'nonexistent' } }] },
          'sGood': { preferred: [{ key: 'OK_KEY', name: 'goGood', isDefault: true }] }
        }
      }
      // 'nonexistent' missing!
    }};

    const childBad = stub.makeInstance({ id: 'child_bad', mainComponent: { id: 'comp_b' } });
    const childGood = stub.makeInstance({ id: 'child_good', mainComponent: { id: 'comp_ok' } });
    const root = stub.makeInstance({
      id: 'root_d1', children: [childBad, childGood],
      componentProperties: { 'sBad': { type: 'INSTANCE_SWAP' }, 'sGood': { type: 'INSTANCE_SWAP' } }
    });

    const cap = captureWarns();
    try {
      await applyRuleDriven(root, 'a', { bundle, overrides: [], path: ['a'], visited: new Set() });
    } finally { cap.restore(); }

    const goodSwap = stub.recorder.find(e => e.type === 'setProperties' && e.instId === 'root_d1' && e.payload['sGood']);
    assert.ok(goodSwap, 'sGood должен примениться даже когда sBad recurse fails');
    const missingWarn = cap.warns.find(w => w.includes('rule missing') && w.includes('nonexistent'));
    assert.ok(missingWarn, 'missing slug warning не записан');
  }

  // (d.2) preferred.key — sentinel MISSING_KEY
  {
    const stub = makeStubFigma();
    global.figma = stub.figma;
    stub.registerComponent('OK_KEY', { id: 'comp_ok' });

    const bundle = { rulesBySlug: {
      'a': {
        slots: {
          'sBad': { preferred: [{ key: 'MISSING_KEY', name: 'noimport', isDefault: true }] },
          'sGood': { preferred: [{ key: 'OK_KEY', name: 'goGood', isDefault: true }] }
        }
      }
    }};

    const childGood = stub.makeInstance({ id: 'child_good_d2', mainComponent: { id: 'comp_ok' } });
    const root = stub.makeInstance({
      id: 'root_d2', children: [childGood],
      componentProperties: { 'sBad': { type: 'INSTANCE_SWAP' }, 'sGood': { type: 'INSTANCE_SWAP' } }
    });

    await applyRuleDriven(root, 'a', { bundle, overrides: [], path: ['a'], visited: new Set() });

    const goodSwap = stub.recorder.find(e => e.type === 'setProperties' && e.instId === 'root_d2' && e.payload['sGood']);
    assert.ok(goodSwap, 'sGood должен примениться когда sBad importComponentByKeyAsync rejects');

    const badSetProps = stub.recorder.find(e => e.type === 'setProperties' && e.instId === 'root_d2' && 'sBad' in e.payload);
    assert.ok(!badSetProps, 'sBad НЕ должен был получить setProperties — import упал на MISSING_KEY');
  }

  console.log('ok d — missing slug + MISSING_KEY: graceful skip, sibling continues');
}

async function testE_multiInstance(childOrder) {
  const stub = makeStubFigma();
  global.figma = stub.figma;
  // INPUT_KEY представляет input-text компонент с placeholder TEXT-componentProperty.
  // Stub copies definitions в новый swap-child (PR-C2 upgrade).
  stub.registerComponent('INPUT_KEY', {
    id: 'comp_input',
    componentPropertyDefinitions: { 'placeholder#1:1': { type: 'TEXT' } },
  });

  const bundle = { rulesBySlug: {
    'form': {
      slots: {
        'sLeft': { preferred: [{ key: 'INPUT_KEY', name: 'input', isDefault: true,
                                 nestedProps: { ruleRef: 'input-text' } }] },
        'sRight': { preferred: [{ key: 'INPUT_KEY', name: 'input', isDefault: true,
                                  nestedProps: { ruleRef: 'input-text' } }] }
      }
    },
    'input-text': {
      textProps: { 'placeholder#1:1': { default: '?' } }
    }
  }};

  const childA = stub.makeInstance({
    id: 'childA', mainComponent: { id: 'comp_input' },
    componentProperties: { 'placeholder#1:1': { type: 'TEXT' } }
  });
  const childB = stub.makeInstance({
    id: 'childB', mainComponent: { id: 'comp_input' },
    componentProperties: { 'placeholder#1:1': { type: 'TEXT' } }
  });
  const kids = childOrder === 'AB' ? [childA, childB] : [childB, childA];
  const root = stub.makeInstance({
    id: 'root_e', children: kids,
    componentProperties: { 'sLeft': { type: 'INSTANCE_SWAP' }, 'sRight': { type: 'INSTANCE_SWAP' } }
  });

  const overrides = [
    { kind: 'text', slug: 'input-text', textProp: 'placeholder#1:1',
      path: ['form', 'sLeft'], contextText: 'Имя' },
    { kind: 'text', slug: 'input-text', textProp: 'placeholder#1:1',
      path: ['form', 'sRight'], contextText: 'Фамилия' }
  ];

  await applyRuleDriven(root, 'form', { bundle, overrides, path: ['form'], visited: new Set() });

  // Hard-assert 1: оба override применены через setProperties (recorder событие записано).
  const imya = stub.recorder.filter(e => e.type === 'setProperties' && e.payload['placeholder#1:1'] === 'Имя');
  const familiya = stub.recorder.filter(e => e.type === 'setProperties' && e.payload['placeholder#1:1'] === 'Фамилия');
  assert.strictEqual(imya.length, 1, `order ${childOrder}: ожидался ровно один setProperties с 'Имя'`);
  assert.strictEqual(familiya.length, 1, `order ${childOrder}: ожидался ровно один setProperties с 'Фамилия'`);

  // Hard-assert 2: после #205 Step 2 PR-C2 (findSwappedChild snapshot-diff fix)
  // multi-instance same-slug different-path должны попадать на РАЗНЫЕ child
  // instances. Snapshot children IDs ДО swap'а позволяет helper'у различить
  // newly-created child от старых. Если этот ассерт упал — regression к
  // pre-PR-C2 BFS-first-match (предыдущее known-limitation поведение).
  assert.notStrictEqual(imya[0].instId, familiya[0].instId,
    `order ${childOrder}: Имя и Фамилия ДОЛЖНЫ попадать на разные child instances ` +
    `(PR-C2 fix). Если strictEqual — findSwappedChild snapshot-diff сломан, ` +
    `multi-instance form misroute regressed.`);
  return { order: childOrder, differentChildren: imya[0].instId !== familiya[0].instId, imyaInst: imya[0].instId };
}

async function testF_alwaysOn() {
  const stub = makeStubFigma();
  global.figma = stub.figma;
  stub.registerComponent('X_KEY', { id: 'comp_x' });

  const bundle = { rulesBySlug: {
    'c': {
      slots: {
        'sX': { pairedBoolean: 'bX', preferred: [{ key: 'X_KEY', name: 'x', isDefault: true }] }
      },
      booleans: {
        'bX': { alwaysOn: true, pairedSlot: 'sX' }
      }
    }
  }};

  const childX = stub.makeInstance({ id: 'child_x_f', mainComponent: { id: 'comp_x' } });
  const root = stub.makeInstance({
    id: 'root_f', children: [childX],
    componentProperties: { 'sX': { type: 'INSTANCE_SWAP' }, 'bX': { type: 'BOOLEAN' } }
  });

  const overrides = [
    { kind: 'slot', slug: 'c', slotProp: 'sX', path: ['c'],
      decision: 'hide', pairedBooleanOverride: false }
  ];

  await applyRuleDriven(root, 'c', { bundle, overrides, path: ['c'], visited: new Set() });

  // bX должен быть true (alwaysOn precedence — defense-in-depth)
  const boolSet = stub.recorder.find(e => e.type === 'setProperties' && e.payload['bX'] === true);
  assert.ok(boolSet, 'alwaysOn precedence нарушен — bX должен быть true даже при override=false');

  // Slot всё равно свапнулся
  const slotSwap = stub.recorder.find(e => e.type === 'setProperties' && 'sX' in e.payload && e.payload['sX'] === 'comp_x');
  assert.ok(slotSwap, 'sX swap не произошёл — alwaysOn guard должен был сохранить slotVisible=true');
}

async function runAsyncTests() {
  await testB_recurse();
  await testC_cycle();
  await testD_missing();
  // Test (e) после #205 Step 2 PR-C2: snapshot-diff fix в findSwappedChild
  // disambiguates multi-instance same-slug. Оба порядка children (AB/BA)
  // должны давать different child instances для Имя/Фамилия.
  await testE_multiInstance('AB');
  console.log('ok e1 — multi-instance [A,B]: snapshot-diff disambiguates → разные child instances');
  await testE_multiInstance('BA');
  console.log('ok e2 — multi-instance [B,A]: snapshot-diff disambiguates → разные child instances');
  await testF_alwaysOn();          console.log('ok f — alwaysOn:true + decision:hide: helper выбирает true (defense-in-depth)');
}

runAsyncTests()
  .then(() => console.log('# all tests passed'))
  .catch((e) => { console.error(e); process.exit(1); });
