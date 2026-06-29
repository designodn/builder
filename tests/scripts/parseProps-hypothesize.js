#!/usr/bin/env node
// parseProps-hypothesize: генерирует payload вопросов для AskUserQuestion и
// применяет ответы Насти в .rule.json.
//
// После #141: source of truth = rules/components/<slug>.rule.json. Legacy
// fallback на _index.json удалён — если .rule.json отсутствует, скрипт
// падает с понятной ошибкой.
//
// Цель — закрыть TODO в правилах:
//   - doc.whenToUse — краткое описание компонента (componentDescription)
//   - "когда использовать каждый preferred вариант" для INSTANCE_SWAP slots
//   - "когда вкл / выкл" для BOOLEAN props
//
// Workflow:
//   1. node parseProps-hypothesize.js "<X>"
//      → выводит JSON со списком вопросов (агент передаёт в AskUserQuestion)
//   2. После ответа Насти:
//      node parseProps-hypothesize.js "<X>" --apply='<answers JSON>'
//      → пишет ответы в .rule.json
//
// Скрипт ничего не угадывает — только собирает вопросы и записывает ответы.
// AI-гипотезы формулирует агент (короткая подсказка в options.description).

const fs = require('fs');
const path = require('path');
// Shared slugify + resolver из parseProps-utils.js (single source of truth, #243).
// Inv9 в utils и auto-ruleRef здесь должны давать **одинаковый** ответ —
// иначе drift между «validate ругается» и «hypothesize не лечит».
const { slugify, buildResolverCaches, findExpectedRuleRef } = require('./parseProps-utils');

const ROOT = path.resolve(__dirname, '..', '..');
const RULES_DIR = path.join(ROOT, 'rules/components');
const INSPECTED_PATH = path.join(ROOT, 'tests/scripts/inspected-props.json');

function readJson(p) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; }
}
function writeJson(p, o) { fs.writeFileSync(p, JSON.stringify(o, null, 2) + '\n'); }

function shortKey(k) { return k ? k.slice(0, 12) : '—'; }

// ─── Read source — rule.json только ────────────────────────────────────────────
function loadSource(name) {
  const slug = slugify(name);
  const rulePath = path.join(RULES_DIR, `${slug}.rule.json`);
  const ruleJson = readJson(rulePath);
  if (!ruleJson) {
    throw new Error(`rule.json не найдено для "${name}" (ожидался ${rulePath}). Сначала запусти /parseProps для bootstrap rule.`);
  }
  return { format: 'rule.json', slug, rulePath, data: ruleJson };
}

// ─── Build questions ──────────────────────────────────────────────────────────
function buildQuestions(name) {
  const src = loadSource(name);
  const { data } = src;
  const questions = [];

  // 1) componentDescription — doc.whenToUse пуст или TODO
  const whenToUse = data.doc && data.doc.whenToUse;
  const needsDescription = !whenToUse || whenToUse === 'TODO' || whenToUse.startsWith('TODO');
  if (needsDescription) {
    questions.push({
      kind: 'componentDescription',
      header: 'Когда использовать',
      prompt: `Для чего нужен компонент «${name}»? Когда дизайнер должен его брать?`,
      currentValue: whenToUse || null
    });
  }

  // 2) INSTANCE_SWAP slots — preferred без usage (pending review или уже validated без usage)
  const slots = data.slots || {};
  for (const [slotName, slotInfo] of Object.entries(slots)) {
    // Кандидаты: non-broken + без usage (независимо от validated)
    const candidates = (slotInfo.preferred || []).filter(v => !v.broken && !v.usage);
    if (candidates.length === 0) continue;
    questions.push({
      kind: 'preferredUsage',
      slot: slotName,
      candidates: candidates.map(v => ({
        key: v.key,
        name: v.name || shortKey(v.key),
        alreadyValidated: !!v.validated,
        isDefault: !!v.isDefault
      })),
      header: `Slot ${slotName.split('#')[0].trim()}`,
      prompt: `Какие из этих компонентов подходят для slot \`${slotName}\`? Для валидных — когда использовать (≤ 100 символов). Пропущенные → broken.`
    });
  }

  // 2b) preferredDefault — slot с ≥2 validated:true preferred без isDefault
  for (const [slotName, slotInfo] of Object.entries(slots)) {
    const validated = (slotInfo.preferred || []).filter(v => v.validated && !v.broken);
    if (validated.length < 2) continue;
    if (validated.some(v => v.isDefault)) continue;
    questions.push({
      kind: 'preferredDefault',
      slot: slotName,
      candidates: validated.map(v => ({ key: v.key, name: v.name || shortKey(v.key), usage: v.usage || null })),
      header: `Default ${slotName.split('#')[0].trim()}`,
      prompt: `У slot \`${slotName}\` ≥2 validated preferred. Какой дефолт для Builder?`
    });
  }

  // 2c) preferredRuleRef — validated preferred без nestedProps (ни ruleRef, ни exposed)
  // Builder без ruleRef не знает, какие nested props выставлять. Спрашиваем Настю.
  for (const [slotName, slotInfo] of Object.entries(slots)) {
    for (const pv of (slotInfo.preferred || [])) {
      if (!pv.validated || pv.broken) continue;
      if ('nestedProps' in pv) continue; // null = явно ответили "нет nested props"; объект = есть ruleRef/exposed
      questions.push({
        kind: 'preferredRuleRef',
        slot: slotName,
        key: pv.key,
        name: pv.name || shortKey(pv.key),
        header: `ruleRef for ${pv.name || shortKey(pv.key)}`,
        prompt: `Какой .rule.json описывает nested props у "${pv.name || pv.key}"? (forward refs OK)`
      });
    }
  }

  // 3) BOOLEAN props — без whenOn/whenOff
  const booleans = data.booleans || {};
  for (const [propName, boolInfo] of Object.entries(booleans)) {
    if (boolInfo.whenOn && boolInfo.whenOff) continue;
    questions.push({
      kind: 'booleanSemantics',
      prop: propName,
      pairedSlot: boolInfo.pairedSlot || null,
      defaultOn: boolInfo.defaultOn ?? null,
      header: `Toggle ${propName.split('#')[0].trim()}`,
      prompt: `Когда \`${propName}\` включается, а когда выключается?`
        + (boolInfo.pairedSlot ? ` (Связан со слотом \`${boolInfo.pairedSlot}\`.)` : '')
    });
  }

  return { component: name, format: 'rule.json', slug: src.slug, total: questions.length, questions };
}

// ─── Apply answers ────────────────────────────────────────────────────────────
function applyAnswers(name, answers) {
  const src = loadSource(name);
  const { slug, rulePath } = src;
  const applied = [];

  const rule = readJson(rulePath);
  if (!rule) throw new Error(`Cannot read ${rulePath}`);

    // componentDescription
    if (answers.componentDescription) {
      const desc = String(answers.componentDescription).trim();
      if (desc && desc !== 'TODO') {
        rule.doc = rule.doc || {};
        rule.doc.whenToUse = desc;
        applied.push({ kind: 'componentDescription', ok: true });
      } else {
        applied.push({ kind: 'componentDescription', ok: false, reason: 'empty or TODO value skipped' });
      }
    }

    // preferredUsage: { "<slot>": { "<key>": "usage text" | null } }
    // usage непустая → validated:true + usage; null/пустая → broken:true
    if (answers.preferredUsage) {
      rule.slots = rule.slots || {};
      for (const [slot, perKey] of Object.entries(answers.preferredUsage)) {
        const slotInfo = rule.slots[slot];
        if (!slotInfo) { applied.push({ kind: 'preferredUsage', slot, ok: false, reason: 'slot not in rule.json' }); continue; }
        for (const [key, usage] of Object.entries(perKey)) {
          const pv = (slotInfo.preferred || []).find(v => v.key === key);
          if (!pv) { applied.push({ kind: 'preferredUsage', slot, key, ok: false, reason: 'key not in preferred' }); continue; }
          if (usage && String(usage).trim()) {
            pv.validated = true;
            pv.usage = String(usage).trim();
            delete pv.broken;
          } else {
            pv.broken = true;
            delete pv.validated;
            delete pv.usage;
            delete pv.nestedProps;
            delete pv.isDefault;
          }
          applied.push({ kind: 'preferredUsage', slot, key, ok: true, verdict: pv.validated ? 'validated' : 'broken' });
        }
      }

      // Auto-set isDefault: true для слотов с ровно 1 validated после preferredUsage.
      // Детерминированно — не требует вопроса (preferredDefault задаётся только при validated >= 2).
      for (const slot of Object.keys(answers.preferredUsage)) {
        const slotInfo = rule.slots[slot];
        if (!slotInfo) continue;
        const validated = (slotInfo.preferred || []).filter(v => v.validated && !v.broken);
        if (validated.length === 1 && !validated[0].isDefault) {
          validated[0].isDefault = true;
          applied.push({ kind: 'autoDefault', slot, key: validated[0].key, ok: true });
        }
      }
    }

    // preferredDefault: { "<slot>": "<key>" }
    if (answers.preferredDefault) {
      rule.slots = rule.slots || {};
      for (const [slot, defaultKey] of Object.entries(answers.preferredDefault)) {
        const slotInfo = rule.slots[slot];
        if (!slotInfo) { applied.push({ kind: 'preferredDefault', slot, ok: false, reason: 'slot not in rule.json' }); continue; }
        for (const pv of (slotInfo.preferred || [])) {
          if (pv.key === defaultKey) pv.isDefault = true;
          else delete pv.isDefault;
        }
        applied.push({ kind: 'preferredDefault', slot, key: defaultKey, ok: true });
      }
    }

    // preferredRuleRef: { "<slot>": { "<key>": "<slug>" | null } }
    // непустая → nestedProps.ruleRef=slug; null/пустая → skip (Builder не делает nested setup)
    if (answers.preferredRuleRef) {
      rule.slots = rule.slots || {};
      for (const [slot, perKey] of Object.entries(answers.preferredRuleRef)) {
        const slotInfo = rule.slots[slot];
        if (!slotInfo) { applied.push({ kind: 'preferredRuleRef', slot, ok: false, reason: 'slot not in rule.json' }); continue; }
        for (const [key, slug] of Object.entries(perKey)) {
          const pv = (slotInfo.preferred || []).find(v => v.key === key);
          if (!pv) { applied.push({ kind: 'preferredRuleRef', slot, key, ok: false, reason: 'key not in preferred' }); continue; }
          if (slug && String(slug).trim()) {
            pv.nestedProps = { policy: 'askDesigner', ruleRef: String(slug).trim() };
          } else {
            pv.nestedProps = null; // явно: без nested props
          }
          applied.push({ kind: 'preferredRuleRef', slot, key, ok: true, ruleRef: slug || null });
        }
      }
    }

    // booleanSemantics: { "<prop>": { whenOn: "...", whenOff: "..." } }
    if (answers.booleanSemantics) {
      rule.booleans = rule.booleans || {};
      for (const [prop, sem] of Object.entries(answers.booleanSemantics)) {
        rule.booleans[prop] = { ...(rule.booleans[prop] || {}), ...sem };
        applied.push({ kind: 'booleanSemantics', prop, ok: true });
      }
    }

    // alwaysOnBoolean: { "<prop>": { alwaysOn: true, builderRule: "..." } }
    if (answers.alwaysOnBoolean) {
      rule.booleans = rule.booleans || {};
      for (const [prop, opts] of Object.entries(answers.alwaysOnBoolean)) {
        rule.booleans[prop] = { ...(rule.booleans[prop] || {}), ...opts };
        applied.push({ kind: 'alwaysOnBoolean', prop, ok: true });
      }
    }

  // Auto-ruleRef sweep (#243): после ручных ответов сканируем preferred'ы и
  // проставляем nestedProps.ruleRef там, где resolver уверен. Тот же resolver,
  // что использует Inv9 — single source of truth. Не overwrite explicit opt-out
  // (nestedProps === null) и не overwrite уже стоящий ruleRef.
  const resolverCaches = buildResolverCaches();
  for (const [slotKey, slot] of Object.entries(rule.slots || {})) {
    for (const p of (slot.preferred || [])) {
      if (p.broken) continue;
      if (p.nestedProps === null) continue;                // explicit opt-out
      if (p.nestedProps && p.nestedProps.ruleRef) continue; // already set
      const expected = findExpectedRuleRef(p, rule, resolverCaches);
      if (!expected) continue;
      p.nestedProps = p.nestedProps || {};
      if (!p.nestedProps.policy) p.nestedProps.policy = 'askDesigner';
      p.nestedProps.ruleRef = expected.slug;
      applied.push({
        kind: 'autoRuleRef',
        slot: slotKey,
        key: p.key,
        name: p.name,
        ruleRef: expected.slug,
        source: expected.source,
        ok: true,
      });
    }
  }

  // Зафиксировать timestamp если что-то реально применилось (ok: true есть).
  // Контракт декларирован в .claude/commands/parseProps.md Шаг 5.3; до фикса #233
  // поле в spec'е было, но скрипт не писал — triple drift (spec/code/schema).
  if (applied.some(a => a.ok === true)) {
    rule._hypothesizeAppliedAt = new Date().toISOString();
  }

  writeJson(rulePath, rule);

  return { component: name, format: 'rule.json', slug, applied };
}

// ─── CLI ──────────────────────────────────────────────────────────────────────
const arg = process.argv[2];
if (!arg) { console.error('Usage: parseProps-hypothesize.js "<name>" [--apply=<json>]'); process.exit(1); }

const applyFlag = process.argv.find(a => a.startsWith('--apply='));
try {
  if (applyFlag) {
    const raw = applyFlag.slice('--apply='.length);
    const answers = JSON.parse(raw);
    const res = applyAnswers(arg, answers);
    console.log(JSON.stringify(res, null, 2));
  } else {
    const res = buildQuestions(arg);
    console.log(JSON.stringify(res, null, 2));
  }
} catch (e) {
  console.error('Error:', e.message);
  process.exit(2);
}
