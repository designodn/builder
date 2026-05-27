#!/bin/bash
# smoke-gate-leak: meta-test для tools/verify-no-gate-leak.sh.
#
# Проверяет, что guard реально ловит известные leak'и. Без этого
# теста расширение FORBIDDEN_RE / AWK_REPLY_START — гадание: при
# regex regression сам guard продолжает писать «✓ clean», даже
# если leak'и есть.
#
# Подход: запускаем guard на fixture-директории с заведомо плохими
# шаблонами реплик. Ожидаем exit 1. Если exit 0 — guard сломан,
# fail smoke.
#
# Использование: bash tests/smoke-gate-leak.sh

set -euo pipefail
cd "$(dirname "$0")/.."

FIXTURE_DIR="tests/fixtures/gate-leak-bad-commands"

if [ ! -d "$FIXTURE_DIR" ]; then
  echo "✗ smoke-gate-leak: fixture-каталог $FIXTURE_DIR не существует"
  exit 1
fi

# Positive smoke: запускаем guard на bad-fixture, ожидаем exit 1.
set +e
bash tools/verify-no-gate-leak.sh "$FIXTURE_DIR" > /tmp/smoke-gate-leak-out 2>&1
RC=$?
set -e

if [ "$RC" = "1" ]; then
  echo "✓ smoke-gate-leak: guard корректно ловит leak в $FIXTURE_DIR"
  exit 0
elif [ "$RC" = "0" ]; then
  echo "✗ smoke-gate-leak: guard НЕ поймал leak в $FIXTURE_DIR — regex regression?"
  echo "Output (вернул exit 0, должен был 1):"
  cat /tmp/smoke-gate-leak-out | sed 's/^/    /'
  exit 1
else
  echo "✗ smoke-gate-leak: guard runtime error (rc=$RC) на $FIXTURE_DIR — guard сам сломан"
  cat /tmp/smoke-gate-leak-out | sed 's/^/    /'
  exit $RC
fi
