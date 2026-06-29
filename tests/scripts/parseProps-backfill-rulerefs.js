#!/usr/bin/env node
/**
 * parseProps-backfill-rulerefs.js
 *
 * Adds nestedProps.ruleRef to every preferred[] entry where resolver finds
 * an expected ruleRef. Idempotent — safe to run repeatedly.
 *
 * После #243: использует findExpectedRuleRef из parseProps-utils.js
 * (двухступенчатый: direct key match + name-based с homonym guard).
 * Раньше работал только по key — пропускал variant-of-set кейсы.
 *
 * Usage:
 *   node parseProps-backfill-rulerefs.js [--dry-run] [--slug=<slug>]
 *
 * Respects explicit opt-out: `nestedProps: null` НЕ touch'ается.
 */

const fs = require('fs');
const path = require('path');
const { buildResolverCaches, findExpectedRuleRef } = require('./parseProps-utils');

const RULES_DIR = path.join(__dirname, '../../rules/components');

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const slugFilter = (args.find(a => a.startsWith('--slug=')) || '').slice(7) || null;

function loadJson(p) {
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function main() {
  const caches = buildResolverCaches();
  const files = fs.readdirSync(RULES_DIR).filter(f => f.endsWith('.rule.json'));

  const stats = {
    added: 0,
    alreadyRef: 0,
    brokenSkipped: 0,
    optOutSkipped: 0,
    noMatch: 0,
    filesChanged: 0,
    bySource: { key: 0, name: 0 },
  };
  const changes = [];

  for (const f of files) {
    const slug = f.replace(/\.rule\.json$/, '');
    if (slugFilter && slug !== slugFilter) continue;

    const filePath = path.join(RULES_DIR, f);
    const d = loadJson(filePath);
    let fileChanged = false;

    for (const [slotKey, slot] of Object.entries(d.slots || {})) {
      for (const p of (slot.preferred || [])) {
        if (p.broken) { stats.brokenSkipped++; continue; }
        if (p.nestedProps === null) { stats.optOutSkipped++; continue; } // explicit opt-out
        if (p.nestedProps && p.nestedProps.ruleRef) { stats.alreadyRef++; continue; }

        const expected = findExpectedRuleRef(p, d, caches);
        if (!expected) { stats.noMatch++; continue; }

        // Add nestedProps.ruleRef. Schema requires `policy`, default askDesigner;
        // preserve existing policy if уже задана.
        p.nestedProps = p.nestedProps || {};
        if (!p.nestedProps.policy) p.nestedProps.policy = 'askDesigner';
        p.nestedProps.ruleRef = expected.slug;

        stats.added++;
        stats.bySource[expected.source]++;
        fileChanged = true;
        changes.push(`${slug} / ${slotKey} → ${expected.slug} [source=${expected.source}]`);
      }
    }

    if (fileChanged) {
      stats.filesChanged++;
      if (!dryRun) {
        fs.writeFileSync(filePath, JSON.stringify(d, null, 2) + '\n');
      }
    }
  }

  console.log(`${dryRun ? '[DRY-RUN] ' : ''}Backfill summary:`);
  console.log(`  files changed: ${stats.filesChanged}`);
  console.log(`  ruleRef added: ${stats.added} (key=${stats.bySource.key}, name=${stats.bySource.name})`);
  console.log(`  already had ruleRef: ${stats.alreadyRef}`);
  console.log(`  broken (skipped): ${stats.brokenSkipped}`);
  console.log(`  opt-out nestedProps:null (skipped): ${stats.optOutSkipped}`);
  console.log(`  no resolver match (variant external/orphan): ${stats.noMatch}`);

  if (changes.length && changes.length <= 30) {
    console.log('\nChanges:');
    changes.forEach(c => console.log('  ' + c));
  } else if (changes.length) {
    console.log(`\nFirst 30 of ${changes.length} changes:`);
    changes.slice(0, 30).forEach(c => console.log('  ' + c));
  }
}

main();
