#!/bin/bash
# verify-approved-gate: R-049 enforcer.
#
# Для каждого .rule.json с approved:true проверяет, что во всех
# slots[*].preferred[] записях поле `usage` непусто (кроме записей
# с broken:true — они намеренно пустые плейсхолдеры).
#
# Нарушение: Builder при выборе preferred-кандидата читает `usage` для
# подсказки контекста. Пустое usage при approved:true = нарушение R-049
# («apruv декларативный — реализации нет»), Builder выбирает слот наугад.
#
# WIP-правила (approved:false) пропускаются — там usage может быть
# в разработке.
#
# Scope: только slots[*].preferred[*].usage. Поля nestedInstances[*],
# textProps[*].sampleTexts намеренно вне этого guard'а — у них своя
# семантика (nestedInstances фиксируются policy: locked|askDesigner|useDefault,
# textProps управляются sampleTexts + builderRule).
#
# Usage: bash tools/verify-approved-gate.sh
# Exit 0 — ok. Exit 1 — найдены approved:true правила с пустым usage.

set -euo pipefail
cd "$(dirname "$0")/.."

RULES_DIR="${1:-rules/components}"

python3 - "$RULES_DIR" <<'PYEOF'
import json, sys
from pathlib import Path

rules_dir = Path(sys.argv[1])
PLACEHOLDER_VALUES = {"", "TODO", "—", "–", "-"}
fail = 0

files = sorted(rules_dir.glob("*.rule.json"))
if not files:
    print(f"✗ verify-approved-gate: не найдено ни одного .rule.json в {rules_dir}")
    sys.exit(1)

for f in files:
    try:
        data = json.loads(f.read_text(encoding="utf-8"))
    except json.JSONDecodeError as e:
        # JSON-ошибка — это дело verify-all-rule-schemas
        continue

    if not data.get("approved", False):
        continue  # WIP — пропускаем

    slots = data.get("slots", {})
    if not slots:
        continue

    for slot_key, slot_val in slots.items():
        if not isinstance(slot_val, dict):
            continue
        preferred = slot_val.get("preferred", [])
        for entry in preferred:
            if not isinstance(entry, dict):
                continue
            if entry.get("broken", False):
                continue  # намеренный плейсхолдер — пропускаем
            usage = entry.get("usage", None)
            if usage is None or str(usage).strip() in PLACEHOLDER_VALUES:
                name = entry.get("name", "(no name)")
                print(f"✗ R-049: {f.name} → slot «{slot_key}» → preferred «{name}»: usage пустой при approved:true")
                fail += 1

if fail:
    print(f"\nR-049: {fail} нарушений. Заполни usage в .rule.json или установи approved:false пока WIP.")
    sys.exit(1)
print(f"✓ verify-approved-gate: R-049 ok — все approved:true правила имеют usage в preferred[]")
PYEOF
