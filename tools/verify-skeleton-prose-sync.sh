#!/usr/bin/env bash
# verify-skeleton-prose-sync.sh
#
# Drift detector между тремя источниками правды по pageStyleModes:
#
#   1. rules/skeleton.json (source of truth — machine-checkable JSON)
#   2. rules/skeleton.md (human prose с ASCII-схемой)
#   3. .claude/commands/builder.md (runtime instructions для агента,
#      содержит layout recipes content_body / island)
#
# История: 3 итерации token swap (PR #177) показали что синонимизация
# токенов через 3 файла легко рассинхронизируется. Этот guard ловит
# случай когда skeleton.json (источник правды) обновили, а prose не
# догнал.
#
# Подход: вытаскиваем из skeleton.json все используемые токены
# (varRef-имена + pageFill) и проверяем что каждый из них присутствует
# в обоих prose-файлах — либо в полной форме (`const/custom/cp-16`),
# либо в короткой (`cp-16`). Prose может использовать любую из форм;
# главное — упоминание не пропало. Не полная семантическая валидация,
# но ловит:
#   - rename переменной (cp-16 → cp-20) без обновления prose
#   - удаление токена из источника правды
#   - добавление нового pageStyleMode token, упомянутого только в JSON
#
# Что НЕ скан'ит: `_doc` поля (описательные комментарии в JSON, в prose
# не дублируются по дизайну).
#
# Возвращает 0 если все токены упомянуты в обоих prose-файлах, 1 иначе.
#
# Использование: bash tools/verify-skeleton-prose-sync.sh

set -euo pipefail

ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
cd "$ROOT"

SKELETON_JSON="rules/skeleton.json"
SKELETON_MD="rules/skeleton.md"
BUILDER_MD=".claude/commands/builder.md"

for f in "$SKELETON_JSON" "$SKELETON_MD" "$BUILDER_MD"; do
  if [ ! -f "$f" ]; then
    echo "✗ verify-skeleton-prose-sync: $f не существует"
    exit 1
  fi
done

# Извлекаем все строковые токены из pageStyleModes, исключая _doc-поля.
# Токены имеют формат "<namespace>/<...>" (содержат хотя бы один '/').
# Long-form: "const/custom/cp-16", "surface/secondary", "const/base/↑vertical↓/content-to-bottom".
EXPECTED_TOKENS=$(jq -r '
  .pageStyleModes
  | [ paths(type == "string") as $p
      | select($p[-1] | tostring | test("^_") | not)
      | getpath($p) ]
  | map(select(type == "string"))
  | map(select(test("^[^/]+/[^/]+"))) # хотя бы один разделитель `/` — это varRef-формат
  | unique[]
' "$SKELETON_JSON")

if [ -z "$EXPECTED_TOKENS" ]; then
  echo "✗ verify-skeleton-prose-sync: не удалось извлечь токены из $SKELETON_JSON (jq вернул пусто)"
  exit 1
fi

VIOLATIONS=0
TOKEN_COUNT=0

# Для каждого токена — проверяем что он (или его short-form) присутствует
# в обоих prose-файлах. Short-form = последний компонент после '/'.
while IFS= read -r tok; do
  [ -z "$tok" ] && continue
  TOKEN_COUNT=$((TOKEN_COUNT + 1))
  short="${tok##*/}"

  for prose_file in "$SKELETON_MD" "$BUILDER_MD"; do
    if grep -qF "$tok" "$prose_file"; then
      continue
    fi
    if grep -qF "$short" "$prose_file"; then
      continue
    fi
    echo "✗ verify-skeleton-prose-sync: '$tok' (или short-form '$short') есть в $SKELETON_JSON, но НЕ в $prose_file"
    VIOLATIONS=$((VIOLATIONS + 1))
  done
done <<< "$EXPECTED_TOKENS"

if [ "$VIOLATIONS" -gt 0 ]; then
  echo ""
  echo "✗ verify-skeleton-prose-sync: $VIOLATIONS missing-references."
  echo "  Источник правды — $SKELETON_JSON. Прозу обнови (full-form или short-form), чтобы каждый токен упоминался хотя бы один раз."
  exit 1
fi

echo "✓ verify-skeleton-prose-sync: все $TOKEN_COUNT токенов из $SKELETON_JSON упомянуты в $SKELETON_MD и $BUILDER_MD"
