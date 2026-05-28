#!/bin/bash
# smoke-skills-canon: meta-test для tools/verify-skills-canon.sh.
#
# Проверяет, что guard реально ловит скилл-файл без строки в таблице Скиллы.
# Без этого теста изменение паттерна в verify-skills-canon.sh может
# сломать guard — он будет тихо писать «✓», не замечая нераскрытый скилл.
#
# Usage: bash tests/smoke-skills-canon.sh

set -euo pipefail
cd "$(dirname "$0")/.."

FIXTURE_DIR="tests/fixtures/skills-canon-bad"

if [ ! -d "$FIXTURE_DIR" ]; then
  echo "✗ smoke-skills-canon: директория фикстур не найдена: $FIXTURE_DIR"
  exit 1
fi

set +e
bash tools/verify-skills-canon.sh "$FIXTURE_DIR" CLAUDE.md > /tmp/smoke-skills-canon-out 2>&1
RC=$?
set -e

if [ "$RC" = "1" ]; then
  echo "✓ smoke-skills-canon: guard корректно ловит скилл без строки в таблице"
  exit 0
elif [ "$RC" = "0" ]; then
  echo "✗ smoke-skills-canon: guard НЕ поймал нарушение — pattern regression?"
  echo "Output (вернул exit 0, должен был 1):"
  sed 's/^/    /' /tmp/smoke-skills-canon-out
  exit 1
else
  echo "✗ smoke-skills-canon: runtime error (rc=$RC)"
  sed 's/^/    /' /tmp/smoke-skills-canon-out
  exit "$RC"
fi
