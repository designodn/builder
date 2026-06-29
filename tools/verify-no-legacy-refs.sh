#!/bin/bash
# verify-no-legacy-refs.sh — guard от случайных stale-ссылок на удалённые
# legacy-файлы и поля после рефактора #141.
#
# Мотивация: #141 удалил `_index.json`, `parseProps-patch.js`, поле
# `nastya_approved`, файлы `<lib>/components.json`, `<lib>/meta.json`,
# `<lib>/variants.json`. Но первый merge оставил stale-ссылки в test.md
# и verifier.md — #144 пришлось чинить отдельным PR. Этот guard ловит
# такую забывчивость на PR-этапе.
#
# Что проверяет: grep по runtime-инструкциям (.claude/commands/*.md,
# tests/scripts/*.js, agents/, src/) на pattern'ы удалённых ссылок.
# Исторические doc'и (docs/SPRINT_*.md, docs/COMPONENT_RULES_ISSUES.md,
# docs/NEXT_SESSION.md, CHANGELOG.md, tests/heal-pilots-*.md,
# rules/**/*.raw.json) — НЕ проверяет (это исторический контекст).
#
# Usage: bash tools/verify-no-legacy-refs.sh
# Exit 0 — чисто. Exit 1 — найдены stale-refs.

set -euo pipefail
cd "$(dirname "$0")/.."

FAIL=0

# Patterns: какой текст ищем + краткое объяснение.
#
# Bash ассоциативные массивы не сохраняют порядок ключей при итерации,
# но комментарии-секции в исходнике служат документацией для редактора:
# добавляя новый pattern, кладём его в соответствующую категорию.
declare -A PATTERNS=(
  # ── Удалённые файлы (после рефактора #141) ──
  ["_index\\.json"]="удалён в #141; используй registry/index.json (derived cache из rules)"
  ["_index\\.v2\\.json"]="orphan, удалён в #141"
  ["parseProps-patch\\.js"]="удалён в #141 — handler'ы писали в _index.json"
  ["registry/libraries/[a-z-]+/(components|meta|variants)\\.json"]="удалены в #141 (кроме numbers-paddings/variables.json)"

  # ── Переименованные / выпиленные поля ──
  ["nastya_approved"]="поле переименовано в rule.approved (rule.json) / 5-й tuple элемент (index.json)"
  ["index\\.generatedAt"]="поле выпилено из registry/index.json — derived cache не несёт build-метаданных; дата регенерации = git log -1 --format=%cI registry/index.json"

  # ── Legacy-маркеры в коде/контенте ──
  ["<!-- BEGIN-PROPS -->"]="legacy маркер из rules/components/*.md; пропы теперь в rule.json"
)

# Где ищем runtime-инструкции.
RUNTIME_PATHS=(
  ".claude/commands"
  ".claude/agents"
  "agents"
  "src"
  "tests/scripts"
  "tools"
)
# rules.md и CLAUDE.md — root-уровневые runtime.
RUNTIME_ROOT_FILES=(
  "CLAUDE.md"
  "rules.md"
)

# Исключения из runtime — исторические doc'и и raw.json миграционные комментарии.
EXCLUDE_PATTERNS=(
  "docs/SPRINT_"
  "docs/NEXT_SESSION"
  "docs/COMPONENT_RULES_ISSUES"
  "docs/SAFE_MODE"
  "tests/heal-pilots-"
  "tests/issues/"
  "CHANGELOG"
  ".raw.json"
  "verify-no-legacy-refs.sh"  # сам guard
  "tools/verify-no-legacy-refs.sh"
)

build_exclude_args() {
  local args=""
  for ex in "${EXCLUDE_PATTERNS[@]}"; do
    args+="--exclude-dir=node_modules --exclude=*${ex}* "
  done
  echo "$args"
}

for pattern in "${!PATTERNS[@]}"; do
  reason="${PATTERNS[$pattern]}"
  # grep -E для regex, -r recursive, -n line numbers, -l пути; gather matches вручную.
  matches=""
  # Allow-list: line classified как комментарий, объясняющий миграцию.
  # Любая строка, содержащая один из этих маркеров вместе с pattern — это
  # explanation, не runtime-инструкция. Пропускаем.
  ALLOW_RE='(#141|#143|#144|legacy|удалён|удалил|удалить|migration|миграц|after migration|до миграц|после миграц|Старый|устарел|compat|deprecated)'

  for p in "${RUNTIME_PATHS[@]}"; do
    [ -d "$p" ] || continue
    found=$(grep -rEn --include='*.md' --include='*.js' --include='*.ts' --include='*.json' --include='*.sh' "$pattern" "$p" 2>/dev/null \
      | grep -vE "\.raw\.json|verify-no-legacy-refs" \
      | grep -vE "$ALLOW_RE" \
      || true)
    if [ -n "$found" ]; then
      matches+="$found"$'\n'
    fi
  done
  for f in "${RUNTIME_ROOT_FILES[@]}"; do
    [ -f "$f" ] || continue
    found=$(grep -En "$pattern" "$f" 2>/dev/null \
      | sed "s|^|$f:|" \
      | grep -vE "verify-no-legacy-refs" \
      | grep -vE "$ALLOW_RE" \
      || true)
    if [ -n "$found" ]; then
      matches+="$found"$'\n'
    fi
  done

  if [ -n "$matches" ]; then
    echo "✗ Найдены ссылки на legacy: '$pattern'"
    echo "  Причина: $reason"
    echo "  Места:"
    echo "$matches" | head -10 | sed 's/^/    /'
    echo ""
    FAIL=1
  fi
done

if [ $FAIL -eq 0 ]; then
  echo "✓ Никаких stale legacy-ссылок в runtime-инструкциях не найдено"
fi
exit $FAIL
