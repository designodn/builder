#!/bin/bash
# smoke-gate-whitelist: meta-test для tools/verify-gate-whitelist.sh.
#
# Проверяет, что guard реально ловит unknown gate-ID. Без этого теста
# регрессия в regex GATE_RE или в jq-парсинге enum может тихо пропустить
# typo'd gate-имена в production-сессиях.
#
# Подход: запускаем guard на fixture-каталоге, в котором есть G-X-fake
# (отсутствует в enum). Ожидаем exit 1. Если exit 0 — guard сломан.
#
# Usage: bash tests/smoke-gate-whitelist.sh

set -euo pipefail
cd "$(dirname "$0")/.."

FIXTURE_DIR="tests/fixtures/gate-whitelist-bad"
SCHEMA="rules/schema/session-telemetry.schema.json"

if [ ! -d "$FIXTURE_DIR" ]; then
  echo "✗ smoke-gate-whitelist: fixture-каталог $FIXTURE_DIR не существует"
  exit 1
fi

set +e
bash tools/verify-gate-whitelist.sh "$SCHEMA" "$FIXTURE_DIR" > /tmp/smoke-gate-whitelist-out 2>&1
RC=$?
set -e

if [ "$RC" = "1" ]; then
  echo "✓ smoke-gate-whitelist: guard корректно ловит unknown gate в $FIXTURE_DIR"
  exit 0
elif [ "$RC" = "0" ]; then
  echo "✗ smoke-gate-whitelist: guard НЕ поймал unknown gate в $FIXTURE_DIR — regex regression?"
  echo "Output (вернул exit 0, должен был 1):"
  cat /tmp/smoke-gate-whitelist-out | sed 's/^/    /'
  exit 1
else
  echo "✗ smoke-gate-whitelist: guard runtime error (rc=$RC) на $FIXTURE_DIR — guard сам сломан"
  cat /tmp/smoke-gate-whitelist-out | sed 's/^/    /'
  exit $RC
fi
