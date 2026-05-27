#!/bin/bash
# smoke-no-bad-apis: meta-test для tools/verify-no-bad-apis.sh.
#
# Проверяет, что guard реально ловит известные запрещённые Figma Plugin
# API паттерны. Без этого теста расширение BAD_APIS / NEG_REGEX —
# гадание: при regex regression сам guard продолжает писать «✓ clean»,
# даже если плохие паттерны есть.
#
# Подход: запускаем guard на fixture-директории `tests/fixtures/bad-apis-bad/`,
# где каждый .md содержит ровно один запрещённый паттерн без negative-маркера
# в ±5 строк. Ожидаем exit 1 + ровно столько нарушений, сколько fixture-файлов.
#
# Использование: bash tests/smoke-no-bad-apis.sh

set -euo pipefail
cd "$(dirname "$0")/.."

FIXTURE_DIR="tests/fixtures/bad-apis-bad"

if [ ! -d "$FIXTURE_DIR" ]; then
  echo "✗ smoke-no-bad-apis: fixture-каталог $FIXTURE_DIR не существует"
  exit 1
fi

EXPECTED_VIOLATIONS=$(ls -1 "$FIXTURE_DIR"/*.md 2>/dev/null | wc -l | tr -d ' ')

if [ "$EXPECTED_VIOLATIONS" = "0" ]; then
  echo "✗ smoke-no-bad-apis: в $FIXTURE_DIR нет .md-фикстур"
  exit 1
fi

set +e
bash tools/verify-no-bad-apis.sh "$FIXTURE_DIR" > /tmp/smoke-no-bad-apis-out 2>&1
RC=$?
set -e

if [ "$RC" = "0" ]; then
  echo "✗ smoke-no-bad-apis: guard НЕ поймал плохие паттерны в $FIXTURE_DIR — regex regression?"
  cat /tmp/smoke-no-bad-apis-out | sed 's/^/    /'
  exit 1
elif [ "$RC" != "1" ]; then
  echo "✗ smoke-no-bad-apis: guard runtime error (rc=$RC) на $FIXTURE_DIR — guard сам сломан"
  cat /tmp/smoke-no-bad-apis-out | sed 's/^/    /'
  exit 1
fi

FOUND_VIOLATIONS=$(grep -c '^✗ verify-no-bad-apis:' /tmp/smoke-no-bad-apis-out || echo "0")
# одна строка "найдено N нарушение(й)" — это summary, не отдельное нарушение
FOUND_VIOLATIONS=$((FOUND_VIOLATIONS - 1))

if [ "$FOUND_VIOLATIONS" -lt "$EXPECTED_VIOLATIONS" ]; then
  echo "✗ smoke-no-bad-apis: guard поймал $FOUND_VIOLATIONS из $EXPECTED_VIOLATIONS — часть паттернов не ловится"
  cat /tmp/smoke-no-bad-apis-out | sed 's/^/    /'
  exit 1
fi

echo "✓ smoke-no-bad-apis: guard корректно ловит все $EXPECTED_VIOLATIONS плохих паттернов в $FIXTURE_DIR"
