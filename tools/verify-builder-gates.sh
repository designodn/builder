#!/bin/bash
# verify-builder-gates: проверяет, что четыре критических gate-якоря не были
# случайно удалены из .claude/commands/builder.md.
#
# Защита: четыре хардстопа builder'а существуют только как текст.
# Если якорь исчезает (например, при рефакторинге шага), A-056-детектор
# gate-skip продолжает работать только постфактум (по telemetry). Этот
# guard блокирует PR, где якорь удалён, — до того, как он дойдёт до main.
#
# Контракт: каждый gate помечен HTML-комментарием-якорем вида
#   <!-- BUILDER_GATE: <NAME> -->
# рядом с самой строкой gate'а. Якорь — стабильный invariant (не зависит от
# формулировки на русском), грепаем по нему. Текстовая строка рядом — для
# человека.
#
# Проверяемые якоря:
#   GATE_CJM         — «Без апрува не идти к шагу 6.»          (Step 5 → Step 6)
#   GATE_LAYOUT      — «Жди явный апрув» у раскладки фреймов   (Step 6 I)
#   GATE_CHECKLIST   — «Жди явный апрув» + use_figma           (Step 7 checklist)
#   ANTI_SKIP        — «никогда не вызывается, пока все V-гейты» (формальный запрет)
#   USE_FIGMA        — hard pre-condition прямо перед use_figma  (Single Hard Gate, #211)
#
# Usage: bash tools/verify-builder-gates.sh [builder_md_path]
# Exit 0 — все якоря на месте. Exit 1 — что-то удалено.

set -euo pipefail
cd "$(dirname "$0")/.."

BUILDER="${1:-.claude/commands/builder.md}"

if [ ! -f "$BUILDER" ]; then
  echo "✗ verify-builder-gates: файл не найден: $BUILDER"
  exit 1
fi

FAIL=0

check_anchor() {
  local prefix="$1"
  local label="$2"
  # Матчим обе формы: `<!-- <PREFIX>: NAME -->` (компактная)
  # и `<!-- <PREFIX>: NAME — комментарий -->` (с пояснением).
  if grep -qE "<!-- ${prefix}: ${label}( |-->)" "$BUILDER"; then
    echo "✓ builder-gates: $label — якорь присутствует"
  else
    echo "✗ builder-gates: $label — якорь <!-- ${prefix}: $label --> НЕ НАЙДЕН в $BUILDER"
    echo "  Добавь HTML-комментарий-якорь над строкой gate'а:"
    echo "  <!-- ${prefix}: $label — не удалять. verify-builder-gates.sh грепает по этому якорю. -->"
    FAIL=$((FAIL + 1))
  fi
}

check_anchor "BUILDER_GATE"      "GATE_CJM"
check_anchor "BUILDER_GATE"      "GATE_LAYOUT"
check_anchor "BUILDER_GATE"      "GATE_CHECKLIST"
check_anchor "BUILDER_GATE"      "ANTI_SKIP"
check_anchor "BUILDER_PREFLIGHT" "USE_FIGMA"

if [ "$FAIL" -gt 0 ]; then
  echo ""
  echo "✗ verify-builder-gates: $FAIL gate-якор(я/ей) удалены из $BUILDER."
  echo "  Эти якоря — invariant'ы для Builder'а. Без них gate'ы держатся только"
  echo "  на A-056 telemetry (постфактум). Верни якоря или обнови этот скрипт."
  exit 1
fi

echo "✓ verify-builder-gates: все 5 gate-якорей на месте в $BUILDER"
