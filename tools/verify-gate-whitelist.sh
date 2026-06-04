#!/bin/bash
# verify-gate-whitelist: guard от typo'd gate-имён в _session.gates_passed[]
# и от free-form расширения gate-таксономии без обновления schema enum.
#
# Зачем: rules/schema/session-telemetry.schema.json объявляет
# gates_passed[].id как whitelist через enum (single source of truth).
# Этот скрипт сверяет, что каждый G-токен, упомянутый в .claude/commands/*.md,
# присутствует в enum. Drift между spec и schema ловится до merge.
#
# Pattern: G-<UPPER>[<digit>][.<digit>][-<word>]
#   G-V1           — силент гейт
#   G-I1.5         — под-гейт
#   G-I2-guard     — квалифицированный гейт
#   G-P-skeleton   — будущий gate, зарезервирован под PR-3 (#338)
#
# Forward direction: токен в .md без записи в enum → FAIL.
# Reverse direction: enum entry без референса в .md → WARN (зарезервированный
# слот или устаревший — проверять вручную).
#
# Usage: bash tools/verify-gate-whitelist.sh [schema_path] [commands_dir]
# Exit 0 — синк, Exit 1 — drift.

set -euo pipefail
cd "$(dirname "$0")/.."

SCHEMA="${1:-rules/schema/session-telemetry.schema.json}"
COMMANDS_DIR="${2:-.claude/commands}"

if [ ! -f "$SCHEMA" ]; then
  echo "✗ verify-gate-whitelist: schema не найдена: $SCHEMA"
  exit 1
fi

if [ ! -d "$COMMANDS_DIR" ]; then
  echo "✗ verify-gate-whitelist: commands-каталог не найден: $COMMANDS_DIR"
  exit 1
fi

if ! command -v jq >/dev/null 2>&1; then
  echo "✗ verify-gate-whitelist: jq не установлен (нужен для парсинга enum)"
  exit 1
fi

WHITELIST=$(jq -r '
  .properties.gates_passed.items.properties.id.enum // []
  | .[]
' "$SCHEMA" 2>/dev/null | sort -u)

if [ -z "$WHITELIST" ]; then
  echo "✗ verify-gate-whitelist: gates_passed[].id.enum пуст или отсутствует в $SCHEMA"
  echo "  Ожидается массив строк в .properties.gates_passed.items.properties.id.enum"
  exit 1
fi

# Извлекаем все G-токены из .claude/commands/*.md.
# Два альтернативных формата:
#   <FAMILY><digit>[.digit][-word]   — G-V1, G-I1.5, G-I2-guard
#   <FAMILY>-<word>                  — G-P-skeleton
# Бар-формы вроде «G-V» / «G-I» (категория, не конкретный gate) не матчатся
# намеренно — они в прозе обозначают семейство, не gate-ID.
GATE_RE='G-[A-Z]+([0-9]+(\.[0-9]+)?(-[a-zA-Z]+)?|-[a-zA-Z]+)'
USED=$(grep -hoE "$GATE_RE" "$COMMANDS_DIR"/*.md 2>/dev/null | sort -u || true)

if [ -z "$USED" ]; then
  echo "✗ verify-gate-whitelist: ни одного G-токена не найдено в $COMMANDS_DIR/*.md — это странно"
  exit 1
fi

FAIL=0

while IFS= read -r gate; do
  [ -z "$gate" ] && continue
  if ! echo "$WHITELIST" | grep -qx "$gate"; then
    echo "✗ Gate '$gate' упомянут в $COMMANDS_DIR/*.md, но отсутствует в enum schema."
    echo "  Источник правды: $SCHEMA → properties.gates_passed.items.properties.id.enum"
    FAIL=1
  fi
done <<< "$USED"

ORPHANS=""
while IFS= read -r gate; do
  [ -z "$gate" ] && continue
  if ! echo "$USED" | grep -qx "$gate"; then
    ORPHANS+="$gate "
  fi
done <<< "$WHITELIST"

if [ -n "$ORPHANS" ]; then
  echo "⚠ Gates в enum, но без референса в $COMMANDS_DIR/*.md: $ORPHANS"
  echo "  (либо зарезервированы под будущий PR, либо устарели — проверь вручную)"
fi

if [ "$FAIL" = "1" ]; then
  echo ""
  echo "Drift: spec расходится с schema enum. Обнови enum в $SCHEMA или удали"
  echo "лишнее упоминание gate-кода из .claude/commands/*.md."
  exit 1
fi

USED_COUNT=$(echo "$USED" | grep -c '^' || echo 0)
ENUM_COUNT=$(echo "$WHITELIST" | grep -c '^' || echo 0)
echo "✓ verify-gate-whitelist: $USED_COUNT gate-кодов в .md синкнуты с $ENUM_COUNT entries в enum"
