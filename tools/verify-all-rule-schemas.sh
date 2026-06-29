#!/bin/bash
# verify-all-rule-schemas: массовая AJV-валидация всех rules/components/*.rule.json
# против rules/schema/component-rule.schema.json.
#
# Переиспользует verify-rule-schema.sh — generic AJV runner.
# Запускает по одному файлу за раз; при первой ошибке НЕ прерывается —
# собирает все нарушения разом, чтобы не гонять CI по одному.
#
# Usage: bash tools/verify-all-rule-schemas.sh
# Exit 0 — все файлы валидны. Exit 1 — найдены нарушения.

set -euo pipefail
cd "$(dirname "$0")/.."

SCHEMA="rules/schema/component-rule.schema.json"
RULES_DIR="rules/components"

if [ ! -f "$SCHEMA" ]; then
  echo "✗ verify-all-rule-schemas: schema не найдена: $SCHEMA"
  exit 1
fi

FILES=$(find "$RULES_DIR" -maxdepth 1 -name '*.rule.json' | LC_ALL=C sort)
if [ -z "$FILES" ]; then
  echo "✗ verify-all-rule-schemas: не найдено ни одного .rule.json в $RULES_DIR"
  exit 1
fi

TOTAL=0
FAIL=0
while IFS= read -r f; do
  TOTAL=$((TOTAL + 1))
  LABEL="$(basename "$f" .rule.json)"
  set +e
  bash tools/verify-rule-schema.sh "$f" "$SCHEMA" "$LABEL" 2>&1
  RC=$?
  set -e
  [ "$RC" != "0" ] && FAIL=$((FAIL + 1))
done <<< "$FILES"

if [ "$FAIL" -gt 0 ]; then
  echo ""
  echo "✗ verify-all-rule-schemas: $FAIL из $TOTAL файлов не прошли валидацию"
  exit 1
fi
echo "✓ verify-all-rule-schemas: все $TOTAL .rule.json валидны против $SCHEMA"
