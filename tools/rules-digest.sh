#!/usr/bin/env bash
# rules-digest.sh — canonical SHA-256 over all component rules + semantic-roles.
# Used by /builder Шаг 8 auto-snapshot для drift detection: если digest
# поменялся между двумя сессиями — правила обновлялись out-of-band, видно
# в diff baseline (P2 #215 objective check).
#
# SCOPE: только rules/components/*.rule.json + rules/semantic-roles.json.
# Намеренно НЕ покрывает tooling (этот скрипт, applyRuleDriven-tests.js)
# и .raw.json — digest о правилах, не о коде. Не «починять» расширением.
#
# Canonical-JSON: compact + sorted keys (jq -cS). Per-file: "<relpath>\0<canonical>\n".
# Output: single line — 64 hex chars + newline.
# Exit codes: 0 ok; 2 jq/sha256sum missing; 3 no rule files found.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
RULES_DIR="$ROOT/rules/components"
SEMANTIC_ROLES="$ROOT/rules/semantic-roles.json"

command -v jq >/dev/null        || { echo "rules-digest: jq not found" >&2; exit 2; }
command -v sha256sum >/dev/null || { echo "rules-digest: sha256sum not found" >&2; exit 2; }

# Stable file list: sorted by relative path, .rule.json only (no .raw.json).
mapfile -t FILES < <(cd "$ROOT" && find rules/components -maxdepth 1 -type f -name '*.rule.json' | LC_ALL=C sort)
[ "${#FILES[@]}" -gt 0 ] || { echo "rules-digest: no .rule.json files found" >&2; exit 3; }

[ -f "$SEMANTIC_ROLES" ] && FILES+=("rules/semantic-roles.json")

# Per-file: "<relpath>\0<canonical-json>\n" → один сводный stream → sha256.
{
  for rel in "${FILES[@]}"; do
    printf '%s\0' "$rel"
    jq -cS . "$ROOT/$rel"
  done
} | sha256sum | awk '{print $1}'
