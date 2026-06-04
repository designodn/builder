#!/bin/bash
# verify-smoke-tests-wiring.sh — guard от тихого удаления тестовых шагов
# из CI smoke-tests workflow.
#
# Что проверяет: каждый тестовый файл из allow-list присутствует
# отдельным шагом в .github/workflows/smoke-tests.yml. Если кто-то
# случайно (или специально) удалит шаг — этот guard завалится и не даст
# регрессу прокрасться через PR.
#
# Known limitation: allow-list включает сам guard. Это сознательно —
# при удалении любого другого шага guard падает. Но если удалить
# ИМЕННО шаг guard'а (или удалить его одновременно с другими в одном
# PR) — он же и не прогонится. Защита работает только пока шаг guard'а
# в workflow присутствует.
#
# Использование: bash tools/verify-smoke-tests-wiring.sh
# Exit 0 — всё ок. Exit 1 — найдено расхождение.

set -eo pipefail
set -u
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$SCRIPT_DIR/.."
WORKFLOW="$REPO_ROOT/.github/workflows/smoke-tests.yml"
FAIL=0

if [ ! -f "$WORKFLOW" ]; then
  echo "✗ Не нашёл $WORKFLOW"
  exit 1
fi

# Allow-list: «тестовый артефакт → команда, которая должна быть в workflow».
# При добавлении нового теста — добавь сюда же.
declare -A EXPECTED=(
  ["tests/smoke-telegram.sh"]="bash tests/smoke-telegram.sh"
  ["tools/verify-closed-skills.sh"]="bash tools/verify-closed-skills.sh"
  ["tools/test-aggregate-sessions.py"]="python3 tools/test-aggregate-sessions.py"
  ["tools/verify-smoke-tests-wiring.sh"]="bash tools/verify-smoke-tests-wiring.sh"
  ["tools/verify-index-drift.sh"]="bash tools/verify-index-drift.sh"
  ["tests/scripts/smoke-mutation-pipeline.js"]="node tests/scripts/smoke-mutation-pipeline.js"
  ["tools/verify-no-legacy-refs.sh"]="bash tools/verify-no-legacy-refs.sh"
  ["tools/verify-skeleton-schema.sh"]="bash tools/verify-skeleton-schema.sh"
  ["tools/verify-trigger-completeness.sh"]="bash tools/verify-trigger-completeness.sh"
  ["tools/verify-approval-tokens.sh"]="bash tools/verify-approval-tokens.sh"
  ["tools/verify-no-gate-leak.sh"]="bash tools/verify-no-gate-leak.sh"
  ["tests/smoke-gate-leak.sh"]="bash tests/smoke-gate-leak.sh"
  ["tools/verify-gate-whitelist.sh"]="bash tools/verify-gate-whitelist.sh"
  ["tests/smoke-gate-whitelist.sh"]="bash tests/smoke-gate-whitelist.sh"
  ["tools/verify-depth-constant.sh"]="bash tools/verify-depth-constant.sh"
  ["tests/smoke-depth-constant.sh"]="bash tests/smoke-depth-constant.sh"
  ["tests/smoke-stop-hook-builder-gates.sh"]="bash tests/smoke-stop-hook-builder-gates.sh"
  ["tools/verify-session-telemetry-schema.sh"]="bash tools/verify-session-telemetry-schema.sh"
  ["tests/smoke-session-telemetry.sh"]="bash tests/smoke-session-telemetry.sh"
  ["tools/verify-ruleref-integrity.sh"]="bash tools/verify-ruleref-integrity.sh"
  ["tools/verify-slug-filename.sh"]="bash tools/verify-slug-filename.sh"
  ["tools/verify-approved-gate.sh"]="bash tools/verify-approved-gate.sh"
  ["tools/verify-placeholder-sync.sh"]="bash tools/verify-placeholder-sync.sh"
  ["tools/verify-all-rule-schemas.sh"]="bash tools/verify-all-rule-schemas.sh"
  ["tests/smoke-rule-integrity.sh"]="bash tests/smoke-rule-integrity.sh"
  ["tools/verify-builder-gates.sh"]="bash tools/verify-builder-gates.sh"
  ["tests/smoke-builder-gates.sh"]="bash tests/smoke-builder-gates.sh"
  ["tools/verify-skills-canon.sh"]="bash tools/verify-skills-canon.sh"
  ["tests/smoke-skills-canon.sh"]="bash tests/smoke-skills-canon.sh"
  ["tests/scripts/build-rule-bundle-tests.js"]="node tests/scripts/build-rule-bundle-tests.js"
  ["tests/scripts/applyRuleDriven-tests.js"]="node tests/scripts/applyRuleDriven-tests.js"
  ["tools/verify-helper-sync.sh"]="bash tools/verify-helper-sync.sh"
  ["tools/verify-forbidden-ops.sh"]="bash tools/verify-forbidden-ops.sh"
  ["tests/smoke-forbidden-ops.sh"]="bash tests/smoke-forbidden-ops.sh"
  ["tools/verify-agents-frontmatter.sh"]="bash tools/verify-agents-frontmatter.sh"
)

for artifact in "${!EXPECTED[@]}"; do
  cmd="${EXPECTED[$artifact]}"
  if [ ! -f "$REPO_ROOT/$artifact" ]; then
    echo "✗ Тестовый артефакт $artifact заявлен в allow-list, но файл не существует"
    FAIL=1
    continue
  fi
  if ! grep -qF "$cmd" "$WORKFLOW"; then
    echo "✗ Шаг '$cmd' отсутствует в $WORKFLOW"
    echo "  → артефакт $artifact в репо есть, но в CI не прогоняется."
    echo "  → добавь шаг в jobs.smoke.steps или удали из allow-list, если тест уже не нужен."
    FAIL=1
  fi
done

if [ $FAIL -eq 0 ]; then
  echo "✓ Все ${#EXPECTED[@]} тестовых артефактов подключены к smoke-tests workflow"
fi

exit $FAIL
