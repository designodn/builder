#!/bin/bash
# smoke-builder-gates: meta-test для tools/verify-builder-gates.sh.
#
# Проверяет, что guard реально ловит отсутствие CJM gate-якоря.
# Без этого теста изменение паттерна в verify-builder-gates.sh может
# сломать guard — и он будет тихо писать «✓», не замечая пропавший хардстоп.
#
# Usage: bash tests/smoke-builder-gates.sh

set -euo pipefail
cd "$(dirname "$0")/.."

FIXTURE="tests/fixtures/builder-gates-bad/missing-cjm-gate.md"

if [ ! -f "$FIXTURE" ]; then
  echo "✗ smoke-builder-gates: fixture не найдена: $FIXTURE"
  exit 1
fi

set +e
bash tools/verify-builder-gates.sh "$FIXTURE" > /tmp/smoke-builder-gates-out 2>&1
RC=$?
set -e

if [ "$RC" = "1" ]; then
  echo "✓ smoke-builder-gates: guard корректно ловит отсутствие GATE_CJM в фикстуре"
  exit 0
elif [ "$RC" = "0" ]; then
  echo "✗ smoke-builder-gates: guard НЕ поймал отсутствие якоря — pattern regression?"
  echo "Output (вернул exit 0, должен был 1):"
  cat /tmp/smoke-builder-gates-out | sed 's/^/    /'
  exit 1
else
  echo "✗ smoke-builder-gates: runtime error (rc=$RC)"
  cat /tmp/smoke-builder-gates-out | sed 's/^/    /'
  exit "$RC"
fi
