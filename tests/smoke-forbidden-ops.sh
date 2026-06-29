#!/bin/bash
# smoke-forbidden-ops: meta-test для tools/verify-forbidden-ops.sh.
#
# Без meta-теста расширение FORBIDDEN_OPS / NEG_REGEX — гадание: при regex
# regression сам guard продолжает писать «✓ clean», даже если bypass-паттерны
# есть. Mirror tests/smoke-no-bad-apis.sh.
#
# Подход: запускаем guard на fixture-директории tests/fixtures/forbidden-ops-bad/,
# где каждый .md содержит ровно один запрещённый bypass-паттерн без NEG-маркера
# в ±5 строк. Ожидаем exit 1 + violations >= кол-во fixture-файлов.
#
# Использование: bash tests/smoke-forbidden-ops.sh

set -euo pipefail
cd "$(dirname "$0")/.."

FIXTURE_DIR="tests/fixtures/forbidden-ops-bad"

if [ ! -d "$FIXTURE_DIR" ]; then
  echo "✗ smoke-forbidden-ops: fixture-каталог $FIXTURE_DIR не существует"
  exit 1
fi

EXPECTED_VIOLATIONS=$(ls -1 "$FIXTURE_DIR"/*.md 2>/dev/null | wc -l | tr -d ' ')

if [ "$EXPECTED_VIOLATIONS" = "0" ]; then
  echo "✗ smoke-forbidden-ops: в $FIXTURE_DIR нет .md-фикстур"
  exit 1
fi

set +e
bash tools/verify-forbidden-ops.sh "$FIXTURE_DIR" > /tmp/smoke-forbidden-ops-out 2>&1
RC=$?
set -e

if [ "$RC" = "0" ]; then
  echo "✗ smoke-forbidden-ops: guard НЕ поймал плохие паттерны в $FIXTURE_DIR — regex regression?"
  cat /tmp/smoke-forbidden-ops-out | sed 's/^/    /'
  exit 1
elif [ "$RC" != "1" ]; then
  echo "✗ smoke-forbidden-ops: guard runtime error (rc=$RC) на $FIXTURE_DIR — guard сам сломан"
  cat /tmp/smoke-forbidden-ops-out | sed 's/^/    /'
  exit 1
fi

# Count только per-violation lines (с «helper-bypass pattern»), не summary.
# Summary имеет prefix `^✗ verify-forbidden-ops:` тоже, но без `helper-bypass pattern` —
# subtract-1 hack хрупкий (underflow на edge-cases). Filter regex'ом точнее.
FOUND_VIOLATIONS=$(grep -cE "^✗ verify-forbidden-ops:.+helper-bypass pattern" /tmp/smoke-forbidden-ops-out || echo "0")

if [ "$FOUND_VIOLATIONS" -lt "$EXPECTED_VIOLATIONS" ]; then
  echo "✗ smoke-forbidden-ops: guard поймал $FOUND_VIOLATIONS из $EXPECTED_VIOLATIONS — часть паттернов не ловится"
  cat /tmp/smoke-forbidden-ops-out | sed 's/^/    /'
  exit 1
fi

echo "✓ smoke-forbidden-ops: guard корректно ловит все $EXPECTED_VIOLATIONS плохих паттернов в $FIXTURE_DIR"
