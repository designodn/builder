#!/bin/bash
# verify-slug-filename: проверяет, что имя файла каждого .rule.json совпадает
# с полем `slug` внутри файла.
#
# Расхождение = Builder вычисляет slug из имени компонента, открывает файл
# по slug'у — а файл лежит под другим именем. Тихое «правило не найдено».
#
# Намеренное отклонение (файл переименован без обновления slug, или slug
# обновлён без переименования файла) — оба случая ловит этот guard.
#
# Usage: bash tools/verify-slug-filename.sh
# Exit 0 — все slug совпадают. Exit 1 — найдены расхождения.

set -euo pipefail
cd "$(dirname "$0")/.."

RULES_DIR="${1:-rules/components}"

python3 - "$RULES_DIR" <<'PYEOF'
import json, sys
from pathlib import Path

rules_dir = Path(sys.argv[1])
fail = 0

files = sorted(rules_dir.glob("*.rule.json"))
if not files:
    print(f"✗ verify-slug-filename: не найдено ни одного .rule.json в {rules_dir}")
    sys.exit(1)

for f in files:
    try:
        data = json.loads(f.read_text(encoding="utf-8"))
    except json.JSONDecodeError as e:
        # JSON-ошибка — это дело verify-all-rule-schemas
        continue

    slug = data.get("slug", "")
    if not slug:
        continue  # нет поля slug — schema validator это поймает

    actual_stem = f.name.removesuffix(".rule.json")
    if slug != actual_stem:
        print(f"✗ slug mismatch: {f.name}")
        print(f"    slug field = «{slug}»")
        print(f"    filename   = «{actual_stem}»")
        fail += 1

if fail:
    print(f"\n{fail} расхождений slug ↔ filename. Обнови slug в файле или переименуй файл.")
    sys.exit(1)
print(f"✓ verify-slug-filename: {len(files)} файлов — slug совпадают с именами файлов")
PYEOF
