#!/bin/bash
# smoke-session-telemetry: meta-test для tools/verify-session-telemetry-schema.sh.
#
# Проверяет, что guard реально ловит записи с checklist_approved: "true"
# (строка вместо boolean). Без этого теста schema regression может тихо
# сломать A-056-детектор gate-skip.
#
# Важно: smoke вызывает guard как чёрный ящик с argv-путём к fixture.
# Дублирование AJV-логики внутри smoke бессмысленно — оно прячет
# регрессии в самой обёртке (пути, exit-коды, фильтрация строк).
#
# Usage: bash tests/smoke-session-telemetry.sh

set -euo pipefail
cd "$(dirname "$0")/.."

FIXTURE="tests/fixtures/telemetry-invalid/checklist-as-string.jsonl"

if [ ! -f "$FIXTURE" ]; then
  echo "✗ smoke-session-telemetry: fixture не найдена: $FIXTURE"
  exit 1
fi

set +e
bash tools/verify-session-telemetry-schema.sh "$FIXTURE" > /tmp/smoke-session-telemetry-out 2>&1
RC=$?
set -e

if [ "$RC" = "1" ]; then
  echo "✓ smoke-session-telemetry: guard корректно ловит checklist_approved как строку"
  exit 0
elif [ "$RC" = "0" ]; then
  echo "✗ smoke-session-telemetry: guard НЕ поймал нарушение (exit 0) — schema regression?"
  echo "  Fixture: $FIXTURE"
  sed 's/^/    /' /tmp/smoke-session-telemetry-out
  exit 1
else
  echo "✗ smoke-session-telemetry: runtime error (rc=$RC)"
  sed 's/^/    /' /tmp/smoke-session-telemetry-out
  exit "$RC"
fi
