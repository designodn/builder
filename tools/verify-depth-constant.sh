#!/bin/bash
# verify-depth-constant: guard от reintroduction хардкода RULE_TREE_MAX_DEPTH.
#
# Зачем: до PR-1 серии #338 число `10` повторялось в 6+ местах (bundler,
# тестовый scaffold, builder.md prose 5 раз). PR-1 свёл в single source —
# rules/builder-constants.json. Этот guard ловит, если кто-то снова
# впишет литерал в код или прозу.
#
# Pattern: `RULE_TREE_MAX_DEPTH\s*[=:]\s*10` — прямое присваивание / JSON
# key:value пара. Допустимо только в rules/builder-constants.json (источник
# правды). Везде ещё — reintroduction.
#
# Ссылки по имени (без литерала) — ОК и встречаются в builder.md как часть
# контракта.
#
# Usage: bash tools/verify-depth-constant.sh
# Exit 0 — чисто. Exit 1 — найден reintroduction.

set -euo pipefail
cd "$(dirname "$0")/.."

# Опциональный override (для smoke-тестов): передай каталог как $1, чтобы
# guard сканировал только его вместо production-путей.
SCAN_OVERRIDE="${1:-}"
CONSTANTS_FILE="rules/builder-constants.json"

if [ ! -f "$CONSTANTS_FILE" ]; then
  echo "✗ verify-depth-constant: $CONSTANTS_FILE не найден — single source куда-то пропал"
  exit 1
fi

# Sanity: убедимся, что в source-файле число всё ещё на месте. Без него guard
# проверяет contract-vacuum.
if ! grep -qE '"RULE_TREE_MAX_DEPTH"\s*:\s*[0-9]+' "$CONSTANTS_FILE"; then
  echo "✗ verify-depth-constant: в $CONSTANTS_FILE нет RULE_TREE_MAX_DEPTH с числовым значением"
  exit 1
fi

# Forward: ищем хардкод за пределами constants-файла.
if [ -n "$SCAN_OVERRIDE" ]; then
  SCAN_PATHS=("$SCAN_OVERRIDE")
else
  SCAN_PATHS=(
    ".claude/commands"
    ".claude/agents"
    "tools"
    "tests/scripts"
    "docs"
  )
fi

FAIL=0
for p in "${SCAN_PATHS[@]}"; do
  [ -d "$p" ] || continue
  found=$(grep -rEn 'RULE_TREE_MAX_DEPTH\s*[=:]\s*[0-9]+' "$p" 2>/dev/null \
    | grep -v "verify-depth-constant.sh" \
    || true)
  if [ -n "$found" ]; then
    echo "✗ Reintroduction RULE_TREE_MAX_DEPTH = <число> в $p:"
    echo "$found" | head -10 | sed 's/^/    /'
    FAIL=1
  fi
done

if [ "$FAIL" = "1" ]; then
  echo ""
  echo "Single source: $CONSTANTS_FILE. Прочитай оттуда вместо хардкода."
  echo "В builder.md упоминай только по имени: \`RULE_TREE_MAX_DEPTH\` без \`= 10\`."
  exit 1
fi

VALUE=$(grep -oE '"RULE_TREE_MAX_DEPTH"\s*:\s*[0-9]+' "$CONSTANTS_FILE" | grep -oE '[0-9]+')
echo "✓ verify-depth-constant: единственное место хардкода — $CONSTANTS_FILE (RULE_TREE_MAX_DEPTH = $VALUE)"
