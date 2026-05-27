#!/bin/bash
# verify-index-drift: проверяет что registry/index.json синхронизирован
# с rules/components/*.rule.json. Запускается в CI на PR + перед коммитом.
#
# Логика:
#   1. Запоминаем текущий хэш registry/index.json.
#   2. Дёргаем `node tests/scripts/parseProps-utils.js gen-index` — оно
#      перезаписывает index.json из rules.
#   3. Сверяем git diff. Если есть diff → кто-то отредактировал
#      rule.json (или index.json напрямую) и не дёрнул genIndex.
#   4. На случай fail — откатываем index.json к исходному состоянию
#      (чтобы CI не оставил мусор), фейлим с понятным сообщением.
#
# Это превентивная защита: source of truth = rules; index = derived.
# Если drift попадёт в main, /builder и /syncKeys будут видеть стейл-кэш.
#
# Usage: bash tools/verify-index-drift.sh

set -euo pipefail
cd "$(dirname "$0")/.."

INDEX_PATH="registry/index.json"

if [ ! -f "$INDEX_PATH" ]; then
  echo "✗ verify-index-drift: $INDEX_PATH not found"
  exit 1
fi

# Backup pre-genIndex content для отката если что-то не так.
BACKUP="$(mktemp)"
cp "$INDEX_PATH" "$BACKUP"
trap 'rm -f "$BACKUP"' EXIT

# Регенерим index из rules.
node tests/scripts/parseProps-utils.js gen-index > /dev/null 2>&1 || {
  echo "✗ verify-index-drift: gen-index failed"
  cp "$BACKUP" "$INDEX_PATH"
  exit 2
}

# Сверяем с committed state.
if git diff --quiet --exit-code -- "$INDEX_PATH"; then
  echo "✓ verify-index-drift: $INDEX_PATH синхронизирован с rules"
  exit 0
fi

# DRIFT обнаружен.
echo "✗ verify-index-drift: $INDEX_PATH расходится с rules/components/*.rule.json"
echo ""
echo "Diff (первые 20 строк):"
git diff -- "$INDEX_PATH" | head -20
echo ""
echo "Что делать:"
echo "  1. Запусти локально: node tests/scripts/parseProps-utils.js gen-index"
echo "  2. git add registry/index.json && git commit --amend --no-edit"
echo "     (или новый коммит, если последний уже опубликован)"
echo ""
echo "Источник правды — rules/components/*.rule.json. registry/index.json"
echo "регенерится автоматически через /parseProps и /syncKeys apply."

# Откатываем чтобы CI не оставил мусор в working tree.
cp "$BACKUP" "$INDEX_PATH"
exit 3
