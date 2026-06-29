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
git show HEAD:"$INDEX_PATH" > "$BACKUP" 2>/dev/null || cp "$INDEX_PATH" "$BACKUP"
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

# Диагностика (#315): отличаем безобидный «забыл gen-index» (расходится только
# approved-флаг, 5-й элемент tuple) от настоящего конфликта ключей (добавлены/
# удалены компоненты или изменились lib/key/type). BACKUP = committed state,
# $INDEX_PATH = свежерегенеренный.
python3 - "$BACKUP" "$INDEX_PATH" <<'PYEOF'
import json, sys
old = json.load(open(sys.argv[1], encoding="utf-8")).get("components", {})
new = json.load(open(sys.argv[2], encoding="utf-8")).get("components", {})
old_keys, new_keys = set(old), set(new)
added = new_keys - old_keys
removed = old_keys - new_keys
approved_only = []   # расходится только 5-й элемент (approved)
structural = []      # расходится lib/key/type/tier (0..3) — настоящий конфликт
for k in old_keys & new_keys:
    o, n = old[k], new[k]
    if o == n:
        continue
    head_diff = o[:4] != n[:4]                       # lib,key,type,tier
    approved_diff = (len(o) > 4 and len(n) > 4 and o[4] != n[4])
    if head_diff:
        structural.append(k)
    elif approved_diff:
        approved_only.append(k)
    else:
        structural.append(k)
total = len(added) + len(removed) + len(approved_only) + len(structural)
print(f"Расхождений: {total} (added: {len(added)}, removed: {len(removed)}, "
      f"approved-флаг: {len(approved_only)}, структурных: {len(structural)})")
if added:      print(f"  + новые: {', '.join(sorted(added)[:8])}{' …' if len(added) > 8 else ''}")
if removed:    print(f"  − удалённые: {', '.join(sorted(removed)[:8])}{' …' if len(removed) > 8 else ''}")
if not added and not removed and not structural and approved_only:
    print("  → Категория: ТОЛЬКО approved-флаги. Это «забыл gen-index» после approve-флипа — безопасно, просто перегенери.")
elif added or removed or structural:
    print("  → Категория: СТРУКТУРНЫЕ изменения (ключи/lib/type). Проверь, что это намеренно, а не конфликт.")
PYEOF
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
