#!/bin/bash
# verify-closed-skills.sh — проверяет согласованность Настя-only списка
# скиллов между CLAUDE.md и реальностью в .claude/commands/*.md.
#
# Что проверяет:
#   1) Каждый скилл из канонического списка в CLAUDE.md существует
#      как .claude/commands/<name>.md.
#   2) Каждый такой скилл содержит identity-check
#      (`mcp__github__get_me` или явное упоминание `verygooddess`).
#   3) Inverse: если в .claude/commands/*.md есть identity-check,
#      этот скилл должен быть в каноническом списке.
#
# Использование: bash tools/verify-closed-skills.sh
# Exit 0 — все проверки прошли. Exit 1 — найден drift.

set -eo pipefail
set -u
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$SCRIPT_DIR/.."
CLAUDE_MD="$REPO_ROOT/CLAUDE.md"
COMMANDS_DIR="$REPO_ROOT/.claude/commands"
FAIL=0

# Извлечь блок между маркером canonical-closed-skills и СЛЕДУЮЩИМ H2
# (не считая H2 самой канонической секции). State machine на awk:
# включаемся после `<a id=`, считаем H2 (первый — наш заголовок, второй —
# следующая секция), выключаемся на втором H2.
SECTION=$(awk '
  /<a id="canonical-closed-skills"/ { in_section=1; h2=0; next }
  in_section && /^## / {
    h2++
    if (h2 > 1) { in_section=0; next }
  }
  in_section { print }
' "$CLAUDE_MD")

if [ -z "$SECTION" ]; then
  echo "✗ Не нашёл секцию canonical-closed-skills в $CLAUDE_MD"
  exit 1
fi

# В строках вида "- `/name` ..." вытащить name через grep -oP.
CANONICAL=$(printf '%s\n' "$SECTION" | grep -oP '^- `/[a-zA-Z][a-zA-Z0-9_-]*`' | sed -E 's|^- `/||; s|`$||')

if [ -z "$CANONICAL" ]; then
  echo "✗ Не нашёл bullets вида '- \`/skill\`' в canonical секции"
  exit 1
fi

echo "Канонический список из CLAUDE.md:"
for skill in $CANONICAL; do echo "  - /$skill"; done
echo ""

# Pattern для in-skill identity-check: явное сравнение login с
# "verygooddess". Это надёжнее, чем bare `verygooddess` (был бы false-positive
# на комментарий «not for verygooddess» или telemetry-payload) и точнее, чем
# `mcp__github__get_me` (используется и для не-restriction целей, напр.
# designer_login в /builder).
IDENTITY_PATTERN='login[[:space:]]*(==|!=)[[:space:]]*"?verygooddess"?'

# Проверка 1: каждый канонический скилл существует как файл.
echo "Test 1: каждый канонический скилл существует как файл"
for skill in $CANONICAL; do
  skill_file="$COMMANDS_DIR/$skill.md"
  if [ ! -f "$skill_file" ]; then
    echo "  ✗ /$skill: файл $skill_file не существует"
    FAIL=1
    continue
  fi
  if grep -qE "$IDENTITY_PATTERN" "$skill_file"; then
    echo "  ✓ /$skill: файл есть, in-skill identity-check присутствует (defense-in-depth)"
  else
    echo "  ⚠ /$skill: файл есть, in-skill identity-check ОТСУТСТВУЕТ — полагается на CLAUDE.md + GitHub Read-роль"
  fi
done

# Проверка 2: нет скиллов с identity-check'ом вне канонического списка.
echo ""
echo "Test 2: каждый скилл с упоминанием verygooddess → в каноническом списке"
shopt -s nullglob
for skill_file in "$COMMANDS_DIR"/*.md; do
  name=$(basename "$skill_file" .md)
  if grep -qE "$IDENTITY_PATTERN" "$skill_file"; then
    if echo "$CANONICAL" | grep -qx "$name"; then
      :
    else
      echo "  ✗ /$name: упоминает verygooddess, но НЕ в каноническом списке CLAUDE.md"
      FAIL=1
    fi
  fi
done

# Проверка 3: markdown-ссылки на канонический якорь действительно резолвятся.
echo ""
echo "Test 3: markdown-ссылки (#canonical-closed-skills) → существующий якорь"
LINKS=$(grep -oE '\(#canonical-closed-skills\)' "$CLAUDE_MD" | wc -l)
ANCHORS=$(grep -cE '<a id="canonical-closed-skills"' "$CLAUDE_MD" || true)
if [ "$ANCHORS" = "0" ]; then
  echo "  ✗ ссылок $LINKS, но якоря <a id=\"canonical-closed-skills\"> в CLAUDE.md НЕТ"
  FAIL=1
elif [ "$LINKS" = "0" ]; then
  echo "  ⚠ якорь есть, но ни одной ссылки на него — каноническая секция не используется"
else
  echo "  ✓ ссылок: $LINKS, якорь существует"
fi

# Test 4: `/feedback` переименован в `/fb` из-за коллизии с нативной
# командой Claude Code (см. коммит 35a4a74). Защита от случайного
# восстановления старого файла при merge/rebase-конфликтах.
echo ""
echo "Test 4: старый файл feedback.md не должен возвращаться"
if [ -f "$COMMANDS_DIR/feedback.md" ]; then
  echo "  ✗ .claude/commands/feedback.md существует — конфликт с нативным /feedback в Claude Code. Должен быть fb.md"
  FAIL=1
else
  echo "  ✓ feedback.md удалён, /fb актуален"
fi

if [ "$FAIL" = "0" ]; then
  echo ""
  echo "All verification checks passed ✓"
  exit 0
else
  echo ""
  echo "Drift detected ✗ — обнови CLAUDE.md или скилл, чтобы синхронизировать."
  exit 1
fi
