#!/bin/bash
# smoke-depth-constant: meta-test для tools/verify-depth-constant.sh.
#
# Проверяет, что guard реально ловит хардкод `RULE_TREE_MAX_DEPTH = 10`
# вне `rules/builder-constants.json`. Без этого теста регрессия regex'а
# в verify-depth-constant.sh может тихо пропустить reintroduction.
#
# Подход: запускаем guard на fixture-каталоге с заведомо плохим текстом
# (имеется и js-form `= 10`, и прозы `≤ ... = 10`). Ожидаем exit 1.
#
# Usage: bash tests/smoke-depth-constant.sh

set -euo pipefail
cd "$(dirname "$0")/.."

FIXTURE_DIR="tests/fixtures/depth-constant-bad"

if [ ! -d "$FIXTURE_DIR" ]; then
  echo "✗ smoke-depth-constant: fixture-каталог $FIXTURE_DIR не существует"
  exit 1
fi

set +e
bash tools/verify-depth-constant.sh "$FIXTURE_DIR" > /tmp/smoke-depth-constant-out 2>&1
RC=$?
set -e

if [ "$RC" = "1" ]; then
  echo "✓ smoke-depth-constant: guard корректно ловит reintroduction в $FIXTURE_DIR"
  exit 0
elif [ "$RC" = "0" ]; then
  echo "✗ smoke-depth-constant: guard НЕ поймал reintroduction в $FIXTURE_DIR — regex regression?"
  echo "Output (вернул exit 0, должен был 1):"
  cat /tmp/smoke-depth-constant-out | sed 's/^/    /'
  exit 1
else
  echo "✗ smoke-depth-constant: guard runtime error (rc=$RC) на $FIXTURE_DIR — guard сам сломан"
  cat /tmp/smoke-depth-constant-out | sed 's/^/    /'
  exit $RC
fi
