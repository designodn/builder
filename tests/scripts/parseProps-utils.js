#!/usr/bin/env node
/**
 * parseProps-utils.js — CLI utilities for component rule management
 *
 * Commands:
 *   slugify "<name>"          → prints slug
 *   validate <slug>           → validate single .rule.json (schema via Ajv 2020-12 + 8 invariants)
 *   validate --all            → validate all .rule.json files (use before PR only)
 *   gen-index                 → rebuild registry/index.json from all .rule.json files
 *   gen-skeleton <slug>       → print Figma plugin skeleton code (not stored in JSON)
 */

const fs = require('fs');
const path = require('path');

// AJV-зависимость лениво подгружается через requireAjv() — модуль импортируется
// также из parseProps-hypothesize.js, которому ajv не нужен. Preflight остаётся
// эталонным (см. tools/verify-rule-schema.sh:46-50), но не на import-уровне.
const AJV_PATH = path.join(__dirname, '../../node_modules/ajv/dist/2020.js');
let _Ajv2020 = null;
function requireAjv() {
  if (_Ajv2020) return _Ajv2020;
  if (!fs.existsSync(AJV_PATH)) {
    console.error("✗ parseProps-utils: не найден ajv с Draft 2020-12 (node_modules/ajv/dist/2020.js отсутствует).");
    console.error("  Сделай 'npm install' в корне репо и запусти скрипт заново.");
    process.exit(1);
  }
  _Ajv2020 = require('ajv/dist/2020');
  return _Ajv2020;
}

const RULES_DIR = path.join(__dirname, '../../rules/components');
const SCHEMA_PATH = path.join(__dirname, '../../rules/schema/component-rule.schema.json');
const REGISTRY_PATH = path.join(__dirname, '../../registry/index.json');

const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

function assertValidSlug(slug) {
  if (typeof slug !== 'string' || !SLUG_RE.test(slug)) {
    console.error(`Invalid slug: "${slug}". Must match ${SLUG_RE} (lowercase letters/digits + hyphens).`);
    process.exit(1);
  }
}

// ─── slugify ──────────────────────────────────────────────────────────────────

function slugify(name) {
  // Strip Figma-style version " X.Y" or " X.Y.Z" when followed by end-of-name
  // OR a tier marker (❖, ◇, etc — any whitespace+non-word). Words after the
  // version (e.g. "Form 3.5 thing") keep their digits intact.
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

// ─── Validate ─────────────────────────────────────────────────────────────────

function loadJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (e) {
    return null;
  }
}

let _ajvValidator = null;
function getAjvValidator() {
  if (_ajvValidator) return _ajvValidator;
  const schema = loadJson(SCHEMA_PATH);
  if (!schema) {
    console.error(`✗ schema not loadable at ${SCHEMA_PATH} (missing or malformed JSON)`);
    process.exit(1);
  }
  const Ajv2020 = requireAjv();
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  _ajvValidator = ajv.compile(schema);
  return _ajvValidator;
}

function validateSchema(rule) {
  const validate = getAjvValidator();
  if (validate(rule)) return [];
  return (validate.errors || []).map(err => {
    const at = err.instancePath || '(root)';
    const extra = err.params?.additionalProperty
      ? ` (got "${err.params.additionalProperty}")`
      : err.params?.allowedValues
      ? ` (allowed: ${err.params.allowedValues.join('|')})`
      : '';
    return `schema ${at}: ${err.message}${extra}`;
  });
}

function validateInvariants(rule, registry) {
  const errors = [];
  const components = registry?.components || {};

  // Invariant 1: Paired reciprocity
  if (rule.slots) {
    for (const [slotKey, slot] of Object.entries(rule.slots)) {
      if (slot.pairedBoolean) {
        const bool = rule.booleans?.[slot.pairedBoolean];
        if (!bool) {
          errors.push(`inv1: slots["${slotKey}"].pairedBoolean="${slot.pairedBoolean}" but booleans has no such key`);
        } else if (bool.pairedSlot !== slotKey) {
          errors.push(`inv1: booleans["${slot.pairedBoolean}"].pairedSlot="${bool.pairedSlot}" ≠ "${slotKey}"`);
        }
      }
    }
    if (rule.booleans) {
      for (const [boolKey, bool] of Object.entries(rule.booleans)) {
        if (bool.pairedSlot) {
          const slot = rule.slots?.[bool.pairedSlot];
          if (!slot) {
            errors.push(`inv1: booleans["${boolKey}"].pairedSlot="${bool.pairedSlot}" but slots has no such key`);
          } else if (slot.pairedBoolean !== boolKey) {
            errors.push(`inv1: slots["${bool.pairedSlot}"].pairedBoolean="${slot.pairedBoolean}" ≠ "${boolKey}"`);
          }
        }
      }
    }
  }

  // Invariant 2: Component key exists in registry
  if (rule.key && !Object.values(components).some(([, k]) => k === rule.key)) {
    errors.push(`inv2: key "${rule.key.slice(0, 8)}..." not found in registry/index.json`);
  }

  // Invariant 3: if preferred has ruleRef, that slug must have a .rule.json.
  // Promoted from warning to hard error in #205 Step 2 (Inv 15 in plan).
  // Old behavior: warn only. New: hard error. Symmetric with tools/verify-ruleref-integrity.sh
  // (shell-based CI check) — Inv 3 catches it per-file in dev loop.
  if (rule.slots) {
    for (const [slotKey, slot] of Object.entries(rule.slots)) {
      for (const pref of slot.preferred || []) {
        const ref = pref.nestedProps?.ruleRef;
        if (ref) {
          const refPath = path.join(RULES_DIR, `${ref}.rule.json`);
          if (!fs.existsSync(refPath)) {
            errors.push(`inv3: slots["${slotKey}"] preferred[].nestedProps.ruleRef="${ref}" — target rules/components/${ref}.rule.json does not exist`);
          }
        }
      }
    }
  }

  // Invariant 4: approved=true ⟹ every non-broken preferred in every slot has a
  // non-placeholder `usage`. Mirrors R-049 (tools/verify-approved-gate.sh) EXACTLY:
  // same scope (skip broken:true only — NOT gated on `validated` or on a ≥2 count),
  // same placeholder set. The two are one criterion in two invocation contexts —
  // per-component `validate` here vs repo-wide CI gate there. Keep them byte-aligned
  // or they drift (the bug behind #314). Canonical wording: verify-approved-gate.sh header.
  //
  // Approval-gated like Inv8: hard error when approved=true; stderr warning when WIP.
  // The WIP warning is deliberate — it surfaces empty usage BEFORE the approved flip,
  // which is exactly what was missing when 28/36/44/56-buttonsview slipped through a
  // green per-slug validate at approved=false and only failed after batch-flip (#313).
  if (rule.slots) {
    const USAGE_PLACEHOLDERS = new Set(['', 'TODO', '—', '–', '-']);
    // Dedup WIP warnings within one validate call: the same slotKey+name pair can
    // recur across preferred entries; printing each repeat just adds stderr noise
    // that erodes the signal (raised in #318 review).
    const seenWip = new Set();
    for (const [slotKey, slot] of Object.entries(rule.slots)) {
      if (!slot || typeof slot !== 'object') continue;
      const candidates = (slot.preferred || []).filter(p => p && typeof p === 'object' && !p.broken);
      for (const pref of candidates) {
        const usage = pref.usage == null ? '' : String(pref.usage).trim();
        if (USAGE_PLACEHOLDERS.has(usage)) {
          const name = pref.name || '(no name)';
          const msg = `slots["${slotKey}"] → preferred "${name}": usage empty/placeholder`;
          if (rule.approved) {
            errors.push(`inv4: ${msg} (required when approved=true — R-049)`);
          } else if (!seenWip.has(msg)) {
            seenWip.add(msg);
            process.stderr.write(`  ℹ inv4 warning: ${msg} (will block approved=true)\n`);
          }
        }
      }
    }
  }

  // Invariant 5: alwaysOn=true → builderRule required
  if (rule.booleans) {
    for (const [boolKey, bool] of Object.entries(rule.booleans)) {
      if (bool.alwaysOn && !bool.builderRule) {
        errors.push(`inv5: booleans["${boolKey}"].alwaysOn=true but builderRule is empty`);
      }
    }
  }

  // Invariant 6: no padding override without paddingOverrideReason
  if (rule.layoutRules && typeof rule.layoutRules === 'object') {
    const paddingFields = ['paddingLeft', 'paddingRight', 'paddingTop', 'paddingBottom', 'itemSpacing'];
    const hasPadding = paddingFields.some(f => rule.layoutRules[f] != null);
    if (hasPadding && !rule.layoutRules.paddingOverrideReason) {
      errors.push(`inv6: layoutRules sets padding/itemSpacing without paddingOverrideReason`);
    }
  }

  // Invariant 7: sourceLib and non-empty preferred[] are mutually exclusive.
  // sourceLib means "content from library frame, Builder uses get_design_context";
  // preferred[] means "enumerated whitelisted keys". Mixing them is ambiguous.
  if (rule.slots) {
    for (const [slotKey, slot] of Object.entries(rule.slots)) {
      if (slot.sourceLib && (slot.preferred || []).length > 0) {
        errors.push(`inv7: slots["${slotKey}"] has sourceLib AND non-empty preferred[] — mutually exclusive`);
      }
    }
  }

  // Invariant 8: slot с validated >= 1 ⟹ exactly 1 preferred с isDefault: true.
  // Approval-gated (как Inv4): hard error на approved=true; warning на approved=false.
  // Builder без isDefault фолбэчит на placeholder → дыры в макетах.
  if (rule.slots) {
    for (const [slotKey, slot] of Object.entries(rule.slots)) {
      const validated = (slot.preferred || []).filter(p => p.validated && !p.broken);
      if (validated.length >= 1) {
        const withDefault = validated.filter(p => p.isDefault);
        if (withDefault.length !== 1) {
          const msg = `slots["${slotKey}"] has ${validated.length} validated preferred but ${withDefault.length} with isDefault=true (need exactly 1)`;
          if (rule.approved) {
            errors.push(`inv8: ${msg}`);
          } else {
            process.stderr.write(`  ℹ inv8 warning: ${msg}\n`);
          }
        }
      }
    }
  }

  // Invariant 9: validated preferred whose name/key points to another rule file
  // must carry nestedProps.ruleRef pointing at that rule's slug. Через
  // findExpectedRuleRef (Stage 1: key match; Stage 2: name-based с homonym guard).
  // Approval-gated (как Inv4/Inv8): hard error на approved=true; warning при WIP.
  // Explicit opt-out: `nestedProps: null` (not auto-fill, not Inv9 violation).
  if (rule.slots) {
    const caches = buildResolverCaches();
    for (const [slotKey, slot] of Object.entries(rule.slots)) {
      for (const p of (slot.preferred || [])) {
        if (p.broken) continue;
        // Explicit opt-out: nestedProps === null (legitimate "don't walk").
        if (p.nestedProps === null) continue;
        const expected = findExpectedRuleRef(p, rule, caches);
        if (!expected) continue;
        const have = p.nestedProps && p.nestedProps.ruleRef;
        if (have !== expected.slug) {
          const msg = `slots["${slotKey}"] preferred key=${p.key.substring(0,12)} (${p.name||'?'}) should have nestedProps.ruleRef="${expected.slug}" [source=${expected.source}] (got ${have ? '"'+have+'"' : 'missing'})`;
          if (rule.approved) {
            errors.push(`inv9: ${msg}`);
          } else {
            process.stderr.write(`  ℹ inv9 warning: ${msg}\n`);
          }
        }
      }
    }
  }

  // Invariant 10: cross-file name consistency for broken keys.
  // If the same key appears as broken across multiple files, all occurrences must
  // share the same `name` (Builder displays this label; divergence confuses users).
  // Approval-gated. Placeholder key (aa40b8b9...) excluded — it's universally placeholder.
  if (rule.slots && _brokenNameCache) {
    for (const [slotKey, slot] of Object.entries(rule.slots)) {
      for (const p of (slot.preferred || [])) {
        if (!p.broken || !p.key || !p.name) continue;
        if (p.key === 'aa40b8b95980f6406a8604dbfebb660aa8ea1bbf') continue;
        const canonical = _brokenNameCache[p.key];
        if (canonical && canonical.name !== p.name) {
          const msg = `slots["${slotKey}"] broken key=${p.key.substring(0,12)} has name="${p.name}", but other files use name="${canonical.name}" (in ${canonical.firstFile})`;
          if (rule.approved) {
            errors.push(`inv10: ${msg}`);
          } else {
            process.stderr.write(`  ℹ inv10 warning: ${msg}\n`);
          }
        }
      }
    }
  }

  // Invariant 11: sibling-trio/pair consistency.
  // Components that share a base pattern except for a token marker (custom/primary/primaryOnColor)
  // OR (Primary/Custom suffix) must have identical structure — same slots, booleans, textProps,
  // nestedInstances, variants. Only name/slug/key/doc/approved/lib are allowed to differ.
  // WARNING-only (even on approved). Some real Figma DS drifts exist (see GitHub #119);
  // upgrade to error after DS drifts are cleaned up.
  if (_siblingGroupsCache) {
    const groupKey = computeSiblingGroupKey(rule.slug);
    if (groupKey && _siblingGroupsCache[groupKey]) {
      const myStruct = canonicalStructure(rule);
      for (const [siblingSlug, siblingStruct] of Object.entries(_siblingGroupsCache[groupKey])) {
        if (siblingSlug === rule.slug) continue;
        if (siblingStruct !== myStruct) {
          process.stderr.write(`  ℹ inv11 warning: structure differs from sibling "${siblingSlug}" (group=${groupKey})\n`);
          break; // one drift report is enough
        }
      }
    }
  }

  // Invariant 12 (warning-only): gap-family sync.
  // custom-contentsview is the canonical owner of gapTextVertical pair list.
  // ARCHITECTURE.md (Gap family section) and builder.md (Шаг 6 D) mirror that list.
  // If they drift — Builder may operate on stale docs while Figma has new pairs.
  if (rule.slug === 'custom-contentsview') {
    const gapWarnings = validateGapSync(rule);
    for (const w of gapWarnings) {
      process.stderr.write(`  ℹ inv12 warning: ${w}\n`);
    }
  }

  // Invariant 13: composite-preferred requires nestedProps.ruleRef (#205 Step 2).
  // Approval-independent (unlike Inv 9): even WIP rules MUST link composite preferreds.
  // «Composite» predicate: target rule has non-empty controllable surface
  // (slots/booleans/textProps/textNode). Atoms exempt — Builder doesn't recurse into them.
  // Explicit opt-out via nestedProps:null (same as Inv 9).
  if (rule.slots) {
    const caches = buildResolverCaches();
    for (const [slotKey, slot] of Object.entries(rule.slots)) {
      for (const p of (slot.preferred || [])) {
        if (p.broken) continue;
        if (p.nestedProps === null) continue; // explicit opt-out
        const expected = findExpectedRuleRef(p, rule, caches);
        if (!expected) continue;
        const targetPath = path.join(RULES_DIR, `${expected.slug}.rule.json`);
        if (!fs.existsSync(targetPath)) continue; // Inv 3 catches missing target
        const target = loadJson(targetPath);
        const isComposite = !!(
          (target.slots && Object.keys(target.slots).length > 0) ||
          (target.booleans && Object.keys(target.booleans).length > 0) ||
          (target.textProps && Object.keys(target.textProps).length > 0) ||
          target.textNode
        );
        if (!isComposite) continue;
        const have = p.nestedProps && p.nestedProps.ruleRef;
        if (have !== expected.slug) {
          errors.push(`inv13: slots["${slotKey}"] preferred key=${p.key.substring(0,12)} (${p.name||'?'}) targets composite "${expected.slug}" — nestedProps.ruleRef="${expected.slug}" required (got ${have ? '"'+have+'"' : 'missing'})`);
        }
      }
    }
  }

  // Invariant 14: rule completeness vs inspected-props.json. For each
  // componentPropertyDefinition в inspected[name].defs проверяем что key appears
  // in matching rule section:
  //   VARIANT → rule.variants[key]
  //   INSTANCE_SWAP → rule.slots[key]
  //   BOOLEAN → rule.booleans[key]
  //   TEXT → rule.textProps[key]
  // Skip silently if inspected lacks entry for rule.name (component not yet inspected).
  // Hard error since 2026-06-01 (#205 PR-1): промоция из warn-only после того как
  // 12 реальных coverage-gap'ов были закрыты (PR-2), а не подавлены. Прежняя
  // baseline-машинерия удалена — hard error самодостаточен.
  if (rule.name) {
    const inspected = loadInspectedProps();
    const compEntry = inspected && inspected.components && inspected.components[rule.name];
    if (compEntry && compEntry.defs) {
      const FIELD_BY_TYPE = { VARIANT: 'variants', INSTANCE_SWAP: 'slots', BOOLEAN: 'booleans', TEXT: 'textProps' };
      for (const [propKey, def] of Object.entries(compEntry.defs)) {
        const field = FIELD_BY_TYPE[def.type];
        if (!field) continue; // unknown type — skip
        const inRule = !!(rule[field] && rule[field][propKey]);
        if (!inRule) {
          errors.push(`[Inv14] prop "${propKey}" (type=${def.type}) — в inspected-props.json[${rule.name}].defs, но отсутствует в rule.${field}. Добавь секцию через /parseProps.`);
        }
      }
    }
  }

  // Invariant 15 (WARN-ONLY): builderRule must not appear on slots or preferred entries.
  // builderRule is valid only on variants[], booleans[], and textProps[].
  // On a slot object or preferred[] entry it has no effect and confuses schema validation
  // (additionalProperties: false emits a cryptic error). Catch early with a human-readable message.
  // Слот → текст переносится в intent; preferred → в usage (там нет intent).
  if (rule.slots) {
    for (const [slotName, slot] of Object.entries(rule.slots)) {
      if (slot.builderRule !== undefined) {
        process.stderr.write(`  ℹ inv15 warning: [Inv15] builderRule на слоте «${slotName}» → перенеси текст в slot.intent (builderRule разрешён только на variants/booleans/textProps)\n`);
      }
      for (const pref of (slot.preferred || [])) {
        if (pref.builderRule !== undefined) {
          const tag = pref.key ? pref.key.substring(0, 12) : (pref.name || '?');
          process.stderr.write(`  ℹ inv15 warning: [Inv15] builderRule на preferred «${tag}» в слоте «${slotName}» → перенеси текст в preferred.usage (builderRule разрешён только на variants/booleans/textProps)\n`);
        }
      }
    }
  }

  return errors;
}

// Sibling-group computation for Inv11.
// Token-trio: `<size>-(custom|primary|primaryoncolor)-content` → group `content/<size>`
// Tag pair: `(custom|primary)-tag` → group `tag`
// chipChoice pair: `chipchoice(primary|custom)` → group `chipchoice`
function computeSiblingGroupKey(slug) {
  if (!slug) return null;
  let m;
  if ((m = slug.match(/^(.+)-(custom|primary|primaryoncolor)-content$/))) {
    return `content/${m[1]}`;
  }
  if ((m = slug.match(/^(custom|primary)-tag$/))) {
    return 'tag';
  }
  if ((m = slug.match(/^chipchoice(primary|custom)$/))) {
    return 'chipchoice';
  }
  return null;
}

// Canonical JSON of structural fields only (no identifiers, no docs).
function canonicalStructure(rule) {
  const stripped = {
    tier: rule.tier,
    layoutRules: rule.layoutRules ?? null,
    variants: rule.variants ?? null,
    slots: rule.slots ?? null,
    booleans: rule.booleans ?? null,
    textProps: rule.textProps ?? null,
    nestedInstances: rule.nestedInstances ?? null,
  };
  return JSON.stringify(stripped, normalizeKeysReplacer);
}

// Replacer for canonicalStructure: drops descriptive text (whenOn/whenOff/usage/sampleTexts/
// builderRule/note) and SHA-style component keys, normalizes Figma node-ID suffixes
// (`#NNNN:NN` → `#`), and emits keys in sorted order so JSON-string compare is deterministic.
function normalizeKeysReplacer(key, value) {
  if (typeof value !== 'object' || value === null) return value;
  if (Array.isArray(value)) return value;
  const pairs = [];
  for (const [k, v] of Object.entries(value)) {
    if (k === 'whenOn' || k === 'whenOff' || k === 'usage' || k === 'sampleTexts' ||
        k === 'builderRule' || k === 'note') continue;
    if (k === 'key' && typeof v === 'string' && /^[a-f0-9]{40}$/.test(v)) continue;
    const normalized = k.replace(/#\d+:\d+$/, '#').replace(/\s+/g, ' ').trim();
    pairs.push([normalized, v]);
  }
  pairs.sort(([a],[b]) => a < b ? -1 : a > b ? 1 : 0);
  const out = {};
  for (const [k, v] of pairs) out[k] = v;
  return out;
}

// Lazy cache: { groupKey → { siblingSlug → canonicalStructure } }
let _siblingGroupsCache = null;
function buildSiblingGroupsCache() {
  if (_siblingGroupsCache) return _siblingGroupsCache;
  _siblingGroupsCache = {};
  const files = fs.readdirSync(RULES_DIR).filter(f => f.endsWith('.rule.json'));
  for (const f of files) {
    const d = loadJson(path.join(RULES_DIR, f));
    if (!d || !d.slug) continue;
    const gk = computeSiblingGroupKey(d.slug);
    if (!gk) continue;
    if (!_siblingGroupsCache[gk]) _siblingGroupsCache[gk] = {};
    _siblingGroupsCache[gk][d.slug] = canonicalStructure(d);
  }
  return _siblingGroupsCache;
}

// Inv12 helper: parse gapTextVertical pair names from custom-contentsview preferred[]
// and verify they appear in ARCHITECTURE.md and builder.md. Returns array of warning strings.
function validateGapSync(rule) {
  const warnings = [];
  // 1. Source-of-truth: extract pair tokens (e.g. "13-13", "17-15") from preferred names
  const sourcePairs = new Set();
  if (rule.slots) {
    for (const slot of Object.values(rule.slots)) {
      for (const p of (slot.preferred || [])) {
        if (!p.name) continue;
        const m = p.name.match(/^(\S+)\s*◇\s*\|\s*gapTextVertical$/);
        if (m) sourcePairs.add(m[1]);
      }
    }
  }
  if (sourcePairs.size === 0) return warnings;

  // 2. Read mirror docs
  const archPath = path.join(RULES_DIR, 'ARCHITECTURE.md');
  const builderPath = path.join(__dirname, '../../.claude/commands/builder.md');
  if (!fs.existsSync(archPath)) {
    warnings.push('ARCHITECTURE.md not found — gap family docs cannot be synced');
    return warnings;
  }
  if (!fs.existsSync(builderPath)) {
    warnings.push('builder.md not found — gap family pointer cannot be verified');
  }
  const archText = fs.readFileSync(archPath, 'utf8');
  const builderText = fs.existsSync(builderPath) ? fs.readFileSync(builderPath, 'utf8') : '';

  // 3. Extract pair list from ARCHITECTURE.md (canonical line: "Имена строго детерминированы: `X-Y`, `...`, ...")
  const archMatch = archText.match(/Имена строго детерминированы:\s*([^\n]+)/);
  const archPairs = new Set();
  if (archMatch) {
    for (const m of archMatch[1].matchAll(/`([^`]+)`/g)) archPairs.add(m[1]);
  }
  // Self-check: anchor present? If anchor missing OR pattern returns empty while source has pairs,
  // emit a single targeted warning instead of N false "missing" alerts.
  if (archPairs.size === 0) {
    warnings.push('ARCHITECTURE.md anchor "Имена строго детерминированы: ..." not found or empty — sync-check cannot run against ARCHITECTURE');
  } else {
    const inSourceNotInArch = [...sourcePairs].filter(p => !archPairs.has(p));
    const inArchNotInSource = [...archPairs].filter(p => !sourcePairs.has(p));
    if (inSourceNotInArch.length) {
      warnings.push(`gap pairs in custom-contentsview but missing from ARCHITECTURE.md: ${inSourceNotInArch.join(', ')}`);
    }
    if (inArchNotInSource.length) {
      warnings.push(`gap pairs in ARCHITECTURE.md but missing from custom-contentsview preferred: ${inArchNotInSource.join(', ')}`);
    }
  }

  // 4. builder.md sanity (substring presence)
  if (builderText && !builderText.includes('gapTextVertical')) {
    warnings.push('builder.md is missing "gapTextVertical" reference');
  }
  if (builderText && !builderText.includes('rules/components/ARCHITECTURE.md')) {
    warnings.push('builder.md does not point to ARCHITECTURE.md for gap family');
  }

  return warnings;
}

// Lazy cache of key → slug for Inv9. Built once per process when first needed.
let _keyToSlugCache = null;
function buildKeyToSlugCache() {
  if (_keyToSlugCache) return _keyToSlugCache;
  _keyToSlugCache = {};
  const files = fs.readdirSync(RULES_DIR).filter(f => f.endsWith('.rule.json'));
  for (const f of files) {
    const d = loadJson(path.join(RULES_DIR, f));
    if (d && d.key && d.slug) _keyToSlugCache[d.key] = d.slug;
  }
  return _keyToSlugCache;
}

// ─── Resolver: preferred → expected ruleRef slug ──────────────────────────────
// Single source of truth для Inv9 (validate) и auto-ruleRef (hypothesize).
// Двухступенчатый lookup:
//   Stage 1 — direct key match: preferred.key есть в registry как default-key
//             правила (текущая логика Inv9; работает для type:"c" + default'ов type:"s").
//   Stage 2 — name-based с homonym-guard: preferred.key это variant внутри
//             component_set; matching через registry[preferred.name].key, со
//             сверкой slugify(name) == candidate.slug (защита от homonym'ов).
// См. issue #243 для подробностей.

let _resolverCaches = null;
function buildResolverCaches() {
  if (_resolverCaches) return _resolverCaches;
  const keyToSlug = buildKeyToSlugCache();
  const registry = loadJson(REGISTRY_PATH) || { components: {} };
  const nameToKey = {};
  for (const [name, info] of Object.entries(registry.components || {})) {
    // registry формат: [lib, key, type, tier, approved]. key = index 1.
    const key = Array.isArray(info) ? info[1] : info.key;
    if (key) nameToKey[name] = key;
  }
  const allSlugs = new Set(
    fs.readdirSync(RULES_DIR)
      .filter(f => f.endsWith('.rule.json'))
      .map(f => f.replace(/\.rule\.json$/, ''))
  );
  _resolverCaches = { keyToSlug, nameToKey, allSlugs };
  return _resolverCaches;
}

function findExpectedRuleRef(preferred, ownRule, caches) {
  if (!preferred || preferred.broken || !preferred.key) return null;
  const { keyToSlug, nameToKey, allSlugs } = caches;

  // Stage 1 — direct key match (default variant or single component).
  const directSlug = keyToSlug[preferred.key];
  if (directSlug) {
    if (directSlug === ownRule.slug) return null; // self-ref
    return { slug: directSlug, source: 'key' };
  }

  // Stage 2 — name-based с homonym guard.
  if (!preferred.name) return null;
  const setKey = nameToKey[preferred.name];
  if (!setKey) return null;
  const setSlug = keyToSlug[setKey];
  if (!setSlug) return null;
  if (!allSlugs.has(setSlug)) return null;
  // Двойная проверка: slugify(name) должен совпадать со slug правила через
  // registry. Это режет homonym'ы где имя матчится через registry, но в файловой
  // системе rule имеет другой slug (rename / manual filename).
  if (slugify(preferred.name) !== setSlug) return null;
  if (setSlug === ownRule.slug) return null;
  return { slug: setSlug, source: 'name' };
}

// Lazy cache of inspected-props.json (canonical Figma snapshot — required by Inv 14).
const INSPECTED_PROPS_PATH = path.join(__dirname, 'inspected-props.json');
let _inspectedPropsCache = null;
function loadInspectedProps() {
  if (_inspectedPropsCache !== null) return _inspectedPropsCache;
  if (!fs.existsSync(INSPECTED_PROPS_PATH)) {
    _inspectedPropsCache = false; // sentinel for "missing"
    return _inspectedPropsCache;
  }
  try {
    _inspectedPropsCache = JSON.parse(fs.readFileSync(INSPECTED_PROPS_PATH, 'utf8'));
  } catch (e) {
    process.stderr.write(`  ⚠ loadInspectedProps: failed to parse ${INSPECTED_PROPS_PATH}: ${e.message}\n`);
    _inspectedPropsCache = false;
  }
  return _inspectedPropsCache;
}

// Lazy cache of broken-key → { name, firstFile } for Inv10. First-seen wins.
let _brokenNameCache = null;
function buildBrokenNameCache() {
  if (_brokenNameCache) return _brokenNameCache;
  _brokenNameCache = {};
  const files = fs.readdirSync(RULES_DIR).filter(f => f.endsWith('.rule.json'));
  for (const f of files) {
    const d = loadJson(path.join(RULES_DIR, f));
    if (!d || !d.slots) continue;
    for (const slot of Object.values(d.slots)) {
      for (const p of (slot.preferred || [])) {
        if (!p.broken || !p.key || !p.name) continue;
        if (p.key === 'aa40b8b95980f6406a8604dbfebb660aa8ea1bbf') continue;
        if (!_brokenNameCache[p.key]) {
          _brokenNameCache[p.key] = { name: p.name, firstFile: f.replace('.rule.json', '') };
        }
      }
    }
  }
  return _brokenNameCache;
}

function validateOne(slug) {
  assertValidSlug(slug);
  buildKeyToSlugCache();
  buildBrokenNameCache();
  buildSiblingGroupsCache();
  const rulePath = path.join(RULES_DIR, `${slug}.rule.json`);
  if (!fs.existsSync(rulePath)) {
    console.error(`✗ ${slug}: file not found at ${rulePath}`);
    process.exit(3);
  }

  const rule = loadJson(rulePath);
  const registry = loadJson(REGISTRY_PATH);

  if (!rule) { console.error(`✗ ${slug}: JSON parse error`); process.exit(1); }

  const schemaErrors = validateSchema(rule);
  const invariantErrors = validateInvariants(rule, registry);
  const allErrors = [...schemaErrors, ...invariantErrors];

  if (allErrors.length === 0) {
    console.log(`✓ ${slug}: schema valid, 15 invariants pass`);
    return true;
  } else {
    console.error(`✗ ${slug}: ${allErrors.length} error(s)`);
    allErrors.forEach(e => console.error(`  · ${e}`));
    return false;
  }
}

function validateAll() {
  const files = fs.readdirSync(RULES_DIR).filter(f => f.endsWith('.rule.json'));
  if (files.length === 0) {
    console.log('No .rule.json files found.');
    process.exit(0);
  }

  let passed = 0;
  for (const file of files) {
    const slug = file.replace('.rule.json', '');
    if (validateOne(slug)) passed++;
  }

  console.log(`\n${passed}/${files.length} valid`);

  // Inv 14 (rule completeness) — hard error per-file начиная с 2026-06-01
  // (#205 PR-1). Прежняя baseline-машинерия (.inv14-baseline.txt + diff) удалена:
  // после промоции в hard error любой новый uncovered prop блокирует validateOne
  // напрямую, baseline-diff лишь дублировал то же сообщение вторым exit(2).

  if (passed < files.length) process.exit(2);
}

// ─── gen-index ────────────────────────────────────────────────────────────────

// Regenerates `registry/index.json` as a derived cache from rules/components/*.rule.json.
// Source of truth = rules. Index = read-only cache, regenerated automatically by
// `/parseProps` apply and `/syncKeys` apply (atomic in mutation pipelines).
//
// Output schema:
//   {
//     "components": { "<name>": [lib, key, type, tier, approved], ... },
//     "libraries":  { "<lib>": [fileKey, name], ... }
//   }
//
// Note: no `generatedAt` field — derived caches don't carry build-time
// metadata. «When was index regenerated» is git history's job
// (`git log -1 --format=%cI registry/index.json`).
//
// Rules with `deprecated: true` are excluded — Builder simply doesn't see them.
// Sort by name for stable diffs. Throws on duplicate names (orphan rules).
function genIndex(options = {}) {
  const { force = false } = options;
  const LIBRARIES_PATH = path.join(__dirname, '../../registry/libraries.json');

  const files = fs.readdirSync(RULES_DIR).filter(f => f.endsWith('.rule.json')).sort();
  const components = {};
  const seenNames = new Map();  // name → file (for dup detection)
  let deprecatedCount = 0;

  for (const file of files) {
    const rule = loadJson(path.join(RULES_DIR, file));
    if (!rule) {
      console.warn(`ℹ gen-index: skipped ${file} (JSON parse failed)`);
      continue;
    }
    if (!rule.name) {
      console.warn(`ℹ gen-index: skipped ${file} (missing required field "name")`);
      continue;
    }
    if (rule.deprecated === true) {
      deprecatedCount++;
      continue;
    }

    if (seenNames.has(rule.name)) {
      throw new Error(
        `gen-index: duplicate component name "${rule.name}" in ` +
        `${seenNames.get(rule.name)} and ${file}. ` +
        `Rename one of them or mark as deprecated.`
      );
    }
    seenNames.set(rule.name, file);

    components[rule.name] = [
      rule.lib,
      rule.key,
      rule.type,
      rule.tier ?? null,
      rule.approved === true,
    ];
  }

  // Sort components by NAME (не filename — slug может расходиться с именем,
  // e.g. "header-1-1.rule.json" vs name "header 1.1"). Sort нужен для
  // детерминистичного diff на разных файловых системах (некоторые FS
  // не гарантируют порядок readdir).
  const sortedComponents = {};
  for (const name of Object.keys(components).sort()) {
    sortedComponents[name] = components[name];
  }

  // Sorted libraries map from manifest. Only enabled non-variables-only libs.
  const libraries = {};
  const manifest = loadJson(LIBRARIES_PATH);
  if (Array.isArray(manifest)) {
    const sorted = [...manifest].sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
    for (const lib of sorted) {
      if (!lib.enabled) continue;
      if (lib.type === 'variables-only') continue;
      libraries[lib.id] = [lib.fileKey, lib.name];
    }
  }

  // Safety guard: refuse to write if entries drop by >5% without --force.
  // Catches accidental mass-deletion (e.g. rules dir got wiped).
  const existingRegistry = loadJson(REGISTRY_PATH);
  if (existingRegistry?.components && !force) {
    const oldCount = Object.keys(existingRegistry.components).length;
    const newCount = Object.keys(components).length;
    if (oldCount > 0 && (oldCount - newCount) / oldCount > 0.05) {
      const dropPct = ((oldCount - newCount) / oldCount * 100).toFixed(1);
      throw new Error(
        `gen-index: refusing to write — entry count dropped ${dropPct}% ` +
        `(${oldCount} → ${newCount}). Use --force to override.`
      );
    }
  }

  const index = {
    components: sortedComponents,
    libraries,
  };

  fs.writeFileSync(REGISTRY_PATH, JSON.stringify(index, null, 2) + '\n', 'utf8');
  const msg = `✓ registry/index.json rebuilt (${Object.keys(components).length} components, ${Object.keys(libraries).length} libraries)` +
    (deprecatedCount > 0 ? ` — ${deprecatedCount} deprecated rules excluded` : '');
  console.log(msg);

  return { components: Object.keys(components).length, libraries: Object.keys(libraries).length, deprecated: deprecatedCount };
}

// ─── gen-skeleton ─────────────────────────────────────────────────────────────

function genSkeleton(slug) {
  assertValidSlug(slug);
  const rulePath = path.join(RULES_DIR, `${slug}.rule.json`);
  if (!fs.existsSync(rulePath)) {
    console.error(`✗ ${slug}: rule file not found`);
    process.exit(3);
  }

  const rule = loadJson(rulePath);
  const key = rule.key;
  const lr = rule.layoutRules;
  const isAbsolute = lr?.layoutPositioning === 'ABSOLUTE';

  // Plugin code must use var / function only (Figma plugin context — no const/let/arrow).
  const lines = [
    `// AUTO-GENERATED skeleton for ${rule.name} (${slug})`,
    `// Do not store this — generate fresh via: node parseProps-utils.js gen-skeleton ${slug}`,
    ``,
    `var component = await figma.importComponentByKeyAsync('${key}');`,
    `var instance = component.createInstance();`,
  ];

  if (isAbsolute) {
    lines.push(``, `// ABSOLUTE positioning — required for this component`);
    lines.push(`parent.appendChild(instance);`);
    lines.push(`instance.layoutPositioning = 'ABSOLUTE';`);
    if (lr.anchoredTo === 'bottom') {
      lines.push(`instance.constraints = { horizontal: 'STRETCH', vertical: 'MAX' };`);
    } else if (lr.anchoredTo === 'top') {
      lines.push(`instance.constraints = { horizontal: 'STRETCH', vertical: 'MIN' };`);
    }
    if (lr.resizePattern) {
      lines.push(`// ${lr.resizePattern}`);
      lines.push(`instance.resize(parent.width, instance.height);`);
    }
    if (lr.violation) {
      lines.push(`// ⚠ ${lr.violation}`);
    }
  } else {
    lines.push(``, `parent.appendChild(instance);`);
    lines.push(`instance.layoutSizingHorizontal = 'FILL';`);
  }

  lines.push(``, `// Set component properties (example — use actual prop keys from rule):`);
  lines.push(`// instance.setProperties({ ... });`);

  console.log(lines.join('\n'));
}

// Exported for in-process use. parseProps-apply-figma.js / parseProps-stub.js
// call genIndex() после writeJson rule.json — registry/index.json
// синхронизируется атомарно.
// Сброс memoized кэшей (используется в apply-figma после createNestedStubs,
// чтобы findExpectedRuleRef видел свежесозданные stub-файлы).
// Bugfix: clearResolverCaches должен сбрасывать и _keyToSlugCache —
// buildResolverCaches() вызывает buildKeyToSlugCache() при перестройке,
// а та возвращает кешированный _keyToSlugCache если он не null (stale).
function clearResolverCaches() { _resolverCaches = null; _keyToSlugCache = null; }

module.exports = { genIndex, slugify, buildResolverCaches, findExpectedRuleRef, clearResolverCaches, validateInvariants };

// ─── CLI entry ────────────────────────────────────────────────────────────────
// Guard: switch выполняется ТОЛЬКО когда файл запущен напрямую (`node ...js`).
// При require() из других скриптов process.argv shared между ними — без guard'а
// этот switch попадал в default-ветку, exit 1 → весь pipeline сломан.

if (require.main === module) {
  const [,, cmd, ...rest] = process.argv;
  const arg = rest[0];

  switch (cmd) {
    case 'slugify':
      if (!arg) { console.error('Usage: parseProps-utils.js slugify "<name>"'); process.exit(1); }
      console.log(slugify(arg));
      break;

    case 'validate':
      if (arg === '--all') {
        validateAll();
      } else if (arg) {
        if (!validateOne(arg)) process.exit(2);
      } else {
        console.error('Usage: parseProps-utils.js validate <slug> | --all');
        process.exit(1);
      }
      break;

    case 'gen-index':
      genIndex({ force: rest.includes('--force') });
      break;

    case 'gen-skeleton':
      if (!arg) { console.error('Usage: parseProps-utils.js gen-skeleton <slug>'); process.exit(1); }
      genSkeleton(arg);
      break;

    case 'add-registry-entry':
      console.error('add-registry-entry удалён в #141. Используй вместо этого:');
      console.error('  node tests/scripts/parseProps-stub.js "<componentName>"');
      console.error('Это создаст rule.json и автоматически дёрнет genIndex.');
      process.exit(1);
      break;

    default:
      console.error(`Unknown command: ${cmd}`);
      console.error('Commands: slugify, validate, gen-index, gen-skeleton');
      process.exit(1);
  }
}
