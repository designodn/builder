#!/usr/bin/env bash
# verify-helper-sync.sh — drift detector для applyRuleDriven helper body.
#
# Контракт зафиксирован issue #205, не менять semantics без отдельного issue.
#
# Тело async function applyRuleDriven в .claude/commands/builder.md между
# sentinel'ами `=== HELPER_BODY:START applyRuleDriven ===` / `END` должно
# совпадать byte-for-byte с literal-копией в tests/scripts/applyRuleDriven-tests.js
# между идентичными sentinel'ами. Если расходится — драйф между prose-контрактом
# и тест-scaffold'ом, исправить руками.
#
# Bootstrap-tolerance (per #205 plan resolution gap-#6): если sentinels отсутствуют
# в одном из файлов — pass с WARN. Это разрешает первый commit добавить sentinel'ы
# в builder.md, потом второй commit добавить literal-копию в test-scaffold, без
# красного CI между ними.
#
# Usage: bash tools/verify-helper-sync.sh
# Exit codes:
#   0  ok (bodies match) OR bootstrap-mode (sentinels missing)
#   1  bodies differ — diagnostic diff в stderr
#   2  usage / file missing

set -euo pipefail

ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
cd "$ROOT"

BUILDER=".claude/commands/builder.md"
TESTS="tests/scripts/applyRuleDriven-tests.js"
START='=== HELPER_BODY:START applyRuleDriven ==='
END='=== HELPER_BODY:END applyRuleDriven ==='

if [ ! -f "$BUILDER" ]; then echo "missing $BUILDER" >&2; exit 2; fi
if [ ! -f "$TESTS"   ]; then echo "missing $TESTS"   >&2; exit 2; fi

extract() {
  awk -v s="$1" -v e="$2" '
    index($0, s) { take=1; next }
    index($0, e) { take=0 }
    take { print }
  ' "$3"
}

BUILDER_BODY=$(extract "$START" "$END" "$BUILDER")
TESTS_BODY=$(extract "$START" "$END" "$TESTS")

if [ -z "$BUILDER_BODY" ] || [ -z "$TESTS_BODY" ]; then
  echo "WARN verify-helper-sync: sentinels not present yet in one or both files (bootstrap mode) — pass"
  exit 0
fi

if diff -u <(printf '%s\n' "$BUILDER_BODY") <(printf '%s\n' "$TESTS_BODY") > /tmp/helper-sync.diff 2>&1; then
  echo "ok verify-helper-sync: helper bodies match"
  exit 0
else
  echo "✗ verify-helper-sync: builder.md helper body vs tests/scripts/applyRuleDriven-tests.js — drift detected" >&2
  echo "--- diff ---" >&2
  cat /tmp/helper-sync.diff >&2
  exit 1
fi
