#!/bin/bash
# smoke-rule-integrity: meta-tests для трёх rule-integrity guard'ов:
#   - tools/verify-ruleref-integrity.sh
#   - tools/verify-slug-filename.sh
#   - tools/verify-approved-gate.sh
#
# Запускает каждый guard на заведомо плохой фикстуре, ожидает exit 1.
# Если guard вернул exit 0 — он сломан (regex или logic regression).
#
# Usage: bash tests/smoke-rule-integrity.sh

set -euo pipefail
cd "$(dirname "$0")/.."

PASS=0
FAIL=0

check_guard() {
  local label="$1"
  local script="$2"
  local fixture="$3"

  set +e
  bash "$script" "$fixture" > /tmp/smoke-rule-integrity-out 2>&1
  RC=$?
  set -e

  if [ "$RC" = "1" ]; then
    echo "✓ smoke-rule-integrity: $label — guard корректно ловит нарушение в $fixture"
    PASS=$((PASS + 1))
  elif [ "$RC" = "0" ]; then
    echo "✗ smoke-rule-integrity: $label — guard НЕ поймал нарушение (вернул exit 0)"
    echo "  fixture: $fixture"
    cat /tmp/smoke-rule-integrity-out | sed 's/^/    /'
    FAIL=$((FAIL + 1))
  else
    echo "✗ smoke-rule-integrity: $label — runtime error (rc=$RC)"
    cat /tmp/smoke-rule-integrity-out | sed 's/^/    /'
    FAIL=$((FAIL + 1))
  fi
}

check_guard "verify-ruleref-integrity" \
  "tools/verify-ruleref-integrity.sh" \
  "tests/fixtures/ruleref-bad"

check_guard "verify-slug-filename" \
  "tools/verify-slug-filename.sh" \
  "tests/fixtures/slug-bad"

check_guard "verify-approved-gate (R-049)" \
  "tools/verify-approved-gate.sh" \
  "tests/fixtures/approved-gate-bad"

if [ "$FAIL" -gt 0 ]; then
  echo ""
  echo "✗ smoke-rule-integrity: $FAIL из $((PASS + FAIL)) guard'ов не работают"
  exit 1
fi
echo "✓ smoke-rule-integrity: все $PASS guard'а корректно ловят нарушения"
