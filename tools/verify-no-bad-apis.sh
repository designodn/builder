#!/usr/bin/env bash
# verify-no-bad-apis.sh
#
# Ловит запрещённые Figma Plugin API паттерны в runtime-инструкциях:
# .claude/commands/*.md (то, что Builder читает при работе) и rules/*.md
# (skeleton/архитектурные правила). НЕ сканирует rules/components/*.raw.json
# (cold debug data, не используется Builder'ом в проде).
#
# Запрещённые паттерны — подмножество таблицы «Forbidden API patterns» из
# .claude/commands/builder.md → Rule-driven instantiation. Скрипт ловит
# только те паттерны, которые надёжно детектируются grep-regex'ом без
# семантического анализа:
#
# Покрыто (CI-enforce):
#   1. importComponentSetByKeyAsync — registry хранит componentKey, не setKey
#   2. frame.resize(N, N) — литералы размеров вместо setBoundVariable
#   3. cornerRadius = N — литералы скруглений вместо setBoundVariable
#   4. findOne(...name...) — медленный рекурсивный lookup по имени;
#      правильный путь — getNodeByIdAsync / children.find. Regex
#      ловит любой вызов findOne, в скобках которого упомянуто слово
#      "name" (синтаксис не важен: === / !== / .name / by name).
#
# НЕ покрыто (только дисциплина чтения таблицы):
#   - setProperties({slot: '<registry-key>'}) вместо setProperties({slot:
#     imported.id}) — невозможно различить registry-key от node-id по
#     синтаксису, нужна семантика. Сохраняется как документ-only правило.
#
# Контекст-проверка ±5 строк: если рядом ❌ / Forbidden / Запрещено / NEVER /
# никогда не / не используй / а не через / контр-пример / wrong / устарел /
# stale — допускается как контр-пример.
#
# Возвращает 0 если чисто, 1 если найдено хотя бы одно нарушение.

set -euo pipefail

ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
cd "$ROOT"

# Список плохих API → паттерн grep -E
BAD_APIS=(
  "importComponentSetByKeyAsync"
  "frame\.resize\(\s*[0-9]+\s*,\s*[0-9]+\s*\)"
  "\.cornerRadius\s*=\s*[0-9]+"
  "findOne\s*\([^)]*name"
)

# Где сканируем — только runtime-инструкции (.md в этих путях).
# Для self-test'ов передавай путь к тестовой fixture-директории как $1
# (см. tests/smoke-no-bad-apis.sh).
if [ "${1:-}" != "" ]; then
  SCAN_PATHS=("$1")
else
  SCAN_PATHS=(
    ".claude/commands"
    "rules"
  )
fi

# Negative-маркеры в контексте ±5 строк → плохой паттерн допустим (контр-пример)
NEG_REGEX="❌|[Ff]orbidden|FORBIDDEN|[Зз]апрещен|NEVER|никогда не|не использ|а не через|не через|контр-пример|counter[ -]?example|wrong|устарел|stale"

VIOLATIONS=0

for pattern in "${BAD_APIS[@]}"; do
  for path in "${SCAN_PATHS[@]}"; do
    # сканируем только .md в указанных путях
    while IFS=: read -r file lineno line; do
      [ -z "$file" ] && continue
      # пропускаем .raw.json и любые .json (не runtime инструкции; cold debug data)
      case "$file" in
        *.raw.json|*.json) continue ;;
      esac
      # контекст ±5 строк вокруг находки
      start=$((lineno-5)); [ "$start" -lt 1 ] && start=1
      end=$((lineno+5))
      ctx=$(sed -n "${start},${end}p" "$file" 2>/dev/null || true)
      if echo "$ctx" | grep -qE "$NEG_REGEX"; then
        continue
      fi
      echo "✗ verify-no-bad-apis: $file:$lineno — запрещённый паттерн '$pattern'"
      echo "  >>> $line"
      VIOLATIONS=$((VIOLATIONS+1))
    done < <(grep -rnE "$pattern" "$path" 2>/dev/null --include="*.md" || true)
  done
done

if [ "$VIOLATIONS" -gt 0 ]; then
  echo ""
  echo "✗ verify-no-bad-apis: найдено $VIOLATIONS нарушение(й)."
  echo "  См. секцию 'Forbidden API patterns' в .claude/commands/builder.md."
  exit 1
fi

echo "✓ verify-no-bad-apis: запрещённых Figma Plugin API паттернов не найдено в runtime-инструкциях"
