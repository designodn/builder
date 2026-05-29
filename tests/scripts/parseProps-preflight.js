#!/usr/bin/env node
// parseProps-preflight: локальная диагностика одного компонента без вызова Figma MCP.
// Решает, какие sub-skill'ы должен вызвать /parseProps до microtest.
//
// После #141: source of truth = rules/components/<slug>.rule.json. Legacy
// fallback на _index.json и `<name>.md` удалён.
//
// Usage:
//   node tests/scripts/parseProps-preflight.js "<componentName>"            # full re-run (R-051)
//   node tests/scripts/parseProps-preflight.js "<componentName>" --cached   # stage-gate, без re-probe
//   node tests/scripts/parseProps-preflight.js --all
//
// Output: JSON { component, slug, mode, reprobe, existingCurated, curatedConflict, flags, decision, escalations }

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const REGISTRY_PATH = path.join(ROOT, 'registry/index.json');
const INSPECTED_PATH = path.join(ROOT, 'tests/scripts/inspected-props.json');
const RULES_DIR = path.join(ROOT, 'rules/components');

function readJson(p) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; }
}

const registry = readJson(REGISTRY_PATH);
const inspected = readJson(INSPECTED_PATH);

if (!registry) {
  console.error('Missing ground-truth file. Required: registry/index.json');
  process.exit(2);
}

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

function findPreferredInRegistry(keys) {
  if (!keys || !keys.length) return [];
  const all = JSON.stringify(registry.components);
  return keys.filter(k => all.includes(k));
}

// Читает .rule.json если он существует — возвращает rule или null.
// Разделяем "файл отсутствует" и "файл повреждён".
function readRuleJson(slug) {
  const p = path.join(RULES_DIR, `${slug}.rule.json`);
  if (!fs.existsSync(p)) return null;
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch (e) {
    process.stderr.write(`[preflight] WARN: .rule.json exists but failed to parse (${slug}): ${e.message}\n`);
    return null;
  }
}

// R-051: какие curated-поля уже заполнены в существующем правиле.
// Агент по этому списку решает, нужен ли AskUserQuestion «сохранить/перегенерировать»
// перед перезаписью при full re-run.
function detectCurated(ruleJson) {
  const out = { fields: [], hasUsage: false, hasWhenToUse: false, hasEdgeCases: false, hasIsDefault: false, hasIntent: false, hasBuilderRule: false, hasBooleanText: false, hasSampleTexts: false };
  if (!ruleJson) return out;
  const doc = ruleJson.doc || {};
  if (doc.whenToUse && doc.whenToUse.trim() && !doc.whenToUse.startsWith('TODO') && !doc.whenToUse.startsWith('Правило не заполнено')) { out.hasWhenToUse = true; out.fields.push('doc.whenToUse'); }
  if (Array.isArray(doc.edgeCases) && doc.edgeCases.length) { out.hasEdgeCases = true; out.fields.push('doc.edgeCases'); }
  const scanVariants = (obj) => obj && typeof obj === 'object' && Object.values(obj).some(v => v && v.builderRule && String(v.builderRule).trim());
  if (scanVariants(ruleJson.variants) || scanVariants(ruleJson.booleans) || scanVariants(ruleJson.textProps)) { out.hasBuilderRule = true; out.fields.push('builderRule'); }
  // booleans[].whenOn/whenOff — curated guidance, заполняется вручную.
  for (const b of Object.values(ruleJson.booleans || {})) {
    if ((b.whenOn && String(b.whenOn).trim()) || (b.whenOff && String(b.whenOff).trim())) {
      if (!out.hasBooleanText) { out.hasBooleanText = true; out.fields.push('booleans.whenOn/whenOff'); }
    }
  }
  // textProps[].sampleTexts — curated примеры, заполняется вручную.
  for (const t of Object.values(ruleJson.textProps || {})) {
    if (Array.isArray(t.sampleTexts) && t.sampleTexts.length) {
      if (!out.hasSampleTexts) { out.hasSampleTexts = true; out.fields.push('textProps.sampleTexts'); }
    }
  }
  for (const slot of Object.values(ruleJson.slots || {})) {
    if (slot.intent && String(slot.intent).trim()) { if (!out.hasIntent) { out.hasIntent = true; out.fields.push('intent'); } }
    if (slot.builderRule && String(slot.builderRule).trim()) { if (!out.hasBuilderRule) { out.hasBuilderRule = true; out.fields.push('builderRule'); } }
    for (const p of (slot.preferred || [])) {
      if (p.usage && String(p.usage).trim()) { if (!out.hasUsage) { out.hasUsage = true; out.fields.push('usage'); } }
      if (p.isDefault) { if (!out.hasIsDefault) { out.hasIsDefault = true; out.fields.push('isDefault'); } }
    }
  }
  return out;
}

function preflight(name, opts = {}) {
  const slug = slugify(name);
  const cached = !!opts.cached;

  const flags = {
    notInRegistry: false,
    noRule: false,
    noProps: false,
    missingPreferred: [],
    missingPreferredUsage: [], // ≥2 valid preferreds, но usage не описан хотя бы у одного
    missingComponentDescription: false,
    approved: null,            // из rule.approved
    invalidApproval: false     // R-049: approved=true ПРИ непустых missingPreferredUsage
  };

  const regEntry = registry.components[name];
  if (!regEntry) { flags.notInRegistry = true; }

  const ruleJson = readRuleJson(slug);
  if (ruleJson) {
    flags.approved = !!ruleJson.approved;
  } else {
    flags.noRule = true;
  }

  const propsEntry = (inspected && inspected.components) ? inspected.components[name] : null;
  if (!propsEntry) { flags.noProps = true; }

  // missingPreferredUsage: для каждого slot'а с ≥2 валидными preferred — нужен usage
  if (ruleJson && ruleJson.slots) {
    for (const [slotName, slotInfo] of Object.entries(ruleJson.slots)) {
      const validated = (slotInfo.preferred || []).filter(v => v.validated && !v.broken);
      if (validated.length < 2) continue;
      const missing = validated.filter(v => !v.usage || !v.usage.trim());
      if (missing.length) {
        flags.missingPreferredUsage.push({
          slot: slotName,
          totalValid: validated.length,
          missingCount: missing.length,
          missingKeys: missing.map(m => m.key)
        });
      }
    }
    // componentDescription: doc.whenToUse — TODO или пустой
    const whenToUse = ruleJson.doc && ruleJson.doc.whenToUse;
    if (!whenToUse || whenToUse === 'TODO' || whenToUse.startsWith('TODO')) {
      flags.missingComponentDescription = true;
    }
  }

  // missing preferred — только если rule отсутствует (новые компоненты)
  if (!ruleJson && propsEntry && propsEntry.defs) {
    for (const [propName, def] of Object.entries(propsEntry.defs)) {
      if (def.type === 'INSTANCE_SWAP' && Array.isArray(def.preferredKeys) && def.preferredKeys.length) {
        const found = findPreferredInRegistry(def.preferredKeys);
        if (!found.length) {
          flags.missingPreferred.push({ prop: propName, candidates: def.preferredKeys });
        }
      }
    }
  }

  // R-049: gate. approved=true несовместим с непустым missingPreferredUsage.
  if (flags.approved === true && flags.missingPreferredUsage.length > 0) {
    flags.invalidApproval = true;
  }

  // R-051: режим прогона. Явный вызов (без --cached) = full re-run: re-probe Figma,
  // overwrite механики. --cached = старый stage-gate (не переснимать, если данные есть).
  const mode = cached ? 'cached' : 'full-rerun';
  const reprobe = mode === 'full-rerun';
  const existingCurated = detectCurated(ruleJson);
  // Если предстоит re-probe И в правиле уже есть curated-тексты — агент ОБЯЗАН
  // переспросить (сохранить/перегенерировать) перед перезаписью.
  const curatedConflict = reprobe && existingCurated.fields.length > 0;

  return { component: name, slug, mode, reprobe, existingCurated, curatedConflict, flags, decision: decide(flags), escalations: escalations(flags, name, slug) };
}

function decide(flags) {
  if (flags.notInRegistry) return 'needsRegistry'; // recoverable: auto-sync via search_design_system
  if (flags.invalidApproval) return 'abort:invalidApproval'; // R-049: hard-fail
  if (flags.noProps && flags.noRule) return 'fullBootstrap';
  if (flags.noProps) return 'resolveProps';
  if (flags.noRule) return 'stubRule';
  if (flags.missingPreferred.length) return 'scopedSync';
  if (flags.missingPreferredUsage.length) return 'hypothesizePreferredUsage';
  if (flags.missingComponentDescription) return 'hypothesizeDescription';
  return 'readyForMicrotest';
}

function escalations(flags, name, slug) {
  const out = [];
  if (flags.notInRegistry) {
    // Auto-sync path: agent uses search_design_system → подтверждает (name, lib, key, type)
    // → parseProps-stub.js создаёт rule.json + дёргает genIndex автоматически.
    out.push({
      skill: 'inline',
      args: `search_design_system(query='${name}') чтобы получить (lib, key, type); затем node tests/scripts/parseProps-stub.js "${name}" — создаст rule.json и обновит registry/index.json`
    });
    return out;
  }
  if (flags.invalidApproval) {
    out.push({
      skill: 'manual',
      args: `set approved=false в rules/components/${slug}.rule.json (или /parseProps --hypothesize для ${flags.missingPreferredUsage.length} slot(s), потом поднять approved заново)`
    });
    return out;
  }
  if (flags.noProps) out.push({ skill: '/syncKeys', args: `--rescan --component='${name}'` });
  if (flags.noProps || flags.noRule) out.push({ skill: 'parseProps-stub', args: `--create-rule-json '${name}'` });
  if (flags.missingPreferred.length && !flags.noProps) {
    const regEntry = registry.components[name];
    const lib = regEntry ? regEntry[0] : '?';
    out.push({ skill: '/syncKeys', args: `--scoped --page='${name.split(/\s/)[0]}' --lib=${lib}` });
  }
  if (flags.missingPreferredUsage.length) {
    out.push({ skill: '/parseProps --hypothesize', args: name + ' (per-preferred usage required for ' + flags.missingPreferredUsage.length + ' slot(s))' });
  }
  if (flags.missingComponentDescription) {
    out.push({ skill: '/parseProps --hypothesize', args: name + ' (doc.whenToUse is TODO)' });
  }
  return out;
}

const argv = process.argv.slice(2);
const cached = argv.includes('--cached');
const positional = argv.filter(a => !a.startsWith('--'));
const arg = argv.includes('--all') ? '--all' : positional[0];

if (!arg) {
  console.error('Usage: node parseProps-preflight.js "<componentName>" [--cached] | --all');
  process.exit(1);
}

if (arg === '--all') {
  // --all — это bulk-survey (read-only), всегда cached: re-probe не подразумевается.
  const all = Object.keys(registry.components).map(n => preflight(n, { cached: true }));
  const summary = all.reduce((acc, r) => { acc[r.decision] = (acc[r.decision] || 0) + 1; return acc; }, {});
  console.log(JSON.stringify({ total: all.length, summary, results: all }, null, 2));
} else {
  const result = preflight(arg, { cached });
  console.log(JSON.stringify(result, null, 2));
  // R-049: при invalidApproval вернуть exit 3
  if (result.decision === 'abort:invalidApproval') process.exit(3);
}
