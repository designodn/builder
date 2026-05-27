#!/bin/bash
# verify-trigger-completeness — guard от тихого gap в CI-триггерах.
#
# Каждый `tools/verify-*.sh` должен присутствовать в `pull_request.paths` И
# в `push.paths` секциях `.github/workflows/smoke-tests.yml`. Иначе при
# правке логики этого верификатора CI не будет feedback'а, и регресс
# пройдёт незамеченным.
#
# Этот guard нашёл сам себя при добавлении в #165: `verify-no-legacy-refs.sh`
# существовал как шаг workflow, но НЕ был в trigger-list — изменения этого
# скрипта проходили без CI.
#
# Allow-list исключений ниже — для скриптов, которые сами в smoke не
# вызываются (например утилиты-генераторы, dev-only). Сейчас пуст.
#
# Usage: bash tools/verify-trigger-completeness.sh
# Exit 0 — все verify-*.sh покрыты. Exit 1 — найден gap.

set -euo pipefail
cd "$(dirname "$0")/.."

WORKFLOW=".github/workflows/smoke-tests.yml"
TOOLS_DIR="tools"

if [ ! -f "$WORKFLOW" ]; then
  echo "✗ verify-trigger-completeness: $WORKFLOW не найден"
  exit 1
fi

# Allow-list — скрипты, которые не должны быть в smoke-триггерах (нет в smoke).
declare -A ALLOW=(
  # пусто; добавляй сюда verify-*.sh который НЕ должен триггерить smoke.
)

# Найди все verify-*.sh в tools/.
mapfile -t SCRIPTS < <(find "$TOOLS_DIR" -maxdepth 1 -name 'verify-*.sh' | LC_ALL=C sort)

if [ "${#SCRIPTS[@]}" -eq 0 ]; then
  echo "✗ verify-trigger-completeness: не нашёл ни одного tools/verify-*.sh — это само по себе странно"
  exit 1
fi

# Извлекаем trigger-paths из workflow. Учитываем pull_request.paths и push.paths
# по отдельности — оба должны содержать скрипт.
extract_paths_section() {
  local section_re="$1"  # e.g. 'pull_request:' или 'push:'
  awk -v section="$section_re" '
    $0 ~ section { in_section=1; next }
    in_section && /^  [^ ]/ { in_section=0 }
    in_section && /^      - / { sub(/^      - /, ""); print }
  ' "$WORKFLOW"
}

PR_PATHS=$(extract_paths_section 'pull_request:')
PUSH_PATHS=$(extract_paths_section 'push:')

# Sanity-assert: парсер хрупок к YAML-вариациям (хардкод 6-space indent,
# не учитывает paths-ignore, зависит от порядка branches:/paths: внутри push:).
# Если awk вернул пустой список — это, скорее всего, рефакторинг YAML
# сломал парсер, а не «в workflow не осталось triggers». Fail rather than
# tихо «всё ок, скриптов 0».
if [ -z "$PR_PATHS" ]; then
  echo "✗ verify-trigger-completeness: пустой pull_request.paths — скорее всего, awk-парсер не справился с текущим форматом $WORKFLOW. Проверь indent (ожидается 6 пробелов перед '- ') и структуру секции."
  exit 1
fi
if [ -z "$PUSH_PATHS" ]; then
  echo "✗ verify-trigger-completeness: пустой push.paths — см. диагностику выше, та же причина."
  exit 1
fi

FAIL=0
for script in "${SCRIPTS[@]}"; do
  rel="${script#./}"
  if [ -n "${ALLOW[$rel]+set}" ]; then
    continue
  fi
  in_pr=0; in_push=0
  printf '%s\n' "$PR_PATHS"   | grep -Fxq "$rel" && in_pr=1   || true
  printf '%s\n' "$PUSH_PATHS" | grep -Fxq "$rel" && in_push=1 || true
  if [ "$in_pr" = "1" ] && [ "$in_push" = "1" ]; then
    continue
  fi
  echo "✗ verify-trigger-completeness: $rel"
  [ "$in_pr" = "0" ]   && echo "    не в pull_request.paths"
  [ "$in_push" = "0" ] && echo "    не в push.paths"
  FAIL=1
done

if [ "$FAIL" = "0" ]; then
  echo "✓ verify-trigger-completeness: все ${#SCRIPTS[@]} verify-*.sh в обоих trigger-list'ах smoke-tests.yml"
fi
exit $FAIL
