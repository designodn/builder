#!/bin/bash
# verify-ruleref-integrity: проверяет, что все ruleRef внутри .rule.json
# указывают на существующие файлы rules/components/<slug>.rule.json.
#
# Поля, где встречается ruleRef:
#   - slots[*].preferred[*].nestedProps.ruleRef
#   - nestedInstances[*].ruleRef
#
# Битая ссылка — тихий провал Builder'а: он пытается открыть несуществующий
# файл правил и либо падает с ошибкой, либо молча пропускает nested-настройки.
#
# Usage: bash tools/verify-ruleref-integrity.sh
# Exit 0 — все ruleRef валидны. Exit 1 — найдены битые ссылки.

set -euo pipefail
cd "$(dirname "$0")/.."

# $1 переопределяет директорию (для smoke-тестов с фикстурами)
RULES_DIR="${1:-rules/components}"

python3 - "$RULES_DIR" <<'PYEOF'
import json, sys
from pathlib import Path

rules_dir = Path(sys.argv[1])
fail = 0
checked = 0

def find_rulerefs(obj, source_slug):
    global fail, checked
    if isinstance(obj, dict):
        if "ruleRef" in obj:
            ref = obj["ruleRef"]
            checked += 1
            target = rules_dir / f"{ref}.rule.json"
            if not target.exists():
                print(f"✗ {source_slug}: ruleRef «{ref}» → {target} не существует")
                fail += 1
        for v in obj.values():
            find_rulerefs(v, source_slug)
    elif isinstance(obj, list):
        for item in obj:
            find_rulerefs(item, source_slug)

files = sorted(rules_dir.glob("*.rule.json"))
if not files:
    print(f"✗ verify-ruleref-integrity: не найдено ни одного .rule.json в {rules_dir}")
    sys.exit(1)

for f in files:
    try:
        data = json.loads(f.read_text(encoding="utf-8"))
    except json.JSONDecodeError as e:
        print(f"✗ {f.name}: невалидный JSON — {e}")
        fail += 1
        continue
    find_rulerefs(data, f.stem)

if fail:
    sys.exit(1)
print(f"✓ verify-ruleref-integrity: {checked} ruleRef'ов в {len(files)} файлах — все валидны")
PYEOF
