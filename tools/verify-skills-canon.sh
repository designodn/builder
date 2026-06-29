#!/bin/bash
# verify-skills-canon: проверяет, что каждый .claude/commands/*.md
# упомянут в таблице «## Скиллы» CLAUDE.md.
#
# Закрывает дырку «добавил скилл — забыл обновить таблицу».
# Направление identity-check → канон закрытых скиллов уже покрывает
# verify-closed-skills.sh; этот скрипт — только прямой маппинг файл → строка таблицы.
#
# Allow-list (файлы без строки в таблице — по дизайну):
#   verifier  — внутренняя процедура, не самостоятельный скилл для пользователей
#
# Usage: bash tools/verify-skills-canon.sh [commands_dir] [claude_md_path]
# Exit 0 — всё в таблице. Exit 1 — что-то не нашлось.

set -euo pipefail
cd "$(dirname "$0")/.."

COMMANDS_DIR="${1:-.claude/commands}"
CLAUDE_MD="${2:-CLAUDE.md}"

# Внутренние инструменты, не являющиеся пользовательскими скиллами.
# Bash-массив (не string + word-splitting) — устойчиво к multi-word entries
# при росте списка.
ALLOWLIST=(verifier)

if [ ! -d "$COMMANDS_DIR" ]; then
  echo "✗ verify-skills-canon: директория не найдена: $COMMANDS_DIR"
  exit 1
fi

if [ ! -f "$CLAUDE_MD" ]; then
  echo "✗ verify-skills-canon: файл не найден: $CLAUDE_MD"
  exit 1
fi

FAIL=0

for skill_file in "$COMMANDS_DIR"/*.md; do
  [ -f "$skill_file" ] || continue
  skill_name="$(basename "$skill_file" .md)"

  # Пропускаем allow-listed инструменты
  skip=0
  for allowed in "${ALLOWLIST[@]}"; do
    if [ "$skill_name" = "$allowed" ]; then
      skip=1
      break
    fi
  done
  [ "$skip" = "1" ] && continue

  # Проверяем, что /skill упомянут именно в markdown-таблице:
  # строка начинается с `| /skill ` и за ним хотя бы один whitespace + следующий `|`.
  # Это отсекает bullet-листы и прозу с упоминанием скилла (см. ревью PR #174).
  if grep -qE "^\| \`/${skill_name}\`[[:space:]]*\|" "$CLAUDE_MD"; then
    echo "✓ verify-skills-canon: /$skill_name — присутствует в таблице Скиллы"
  else
    echo "✗ verify-skills-canon: /$skill_name — НЕ НАЙДЕН в таблице Скиллы в $CLAUDE_MD"
    echo "  Добавь строку в секцию «## Скиллы» или занеси в ALLOWLIST этого скрипта."
    FAIL=$((FAIL + 1))
  fi
done

if [ "$FAIL" -gt 0 ]; then
  echo ""
  echo "✗ verify-skills-canon: $FAIL скилл(а/ов) отсутствуют в таблице Скиллы."
  echo "  Каждый .claude/commands/*.md должен быть упомянут в CLAUDE.md ## Скиллы."
  exit 1
fi

echo "✓ verify-skills-canon: все скиллы присутствуют в таблице Скиллы"
