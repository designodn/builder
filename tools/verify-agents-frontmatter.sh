#!/bin/bash
# verify-agents-frontmatter.sh — проверяет YAML frontmatter в .claude/agents/*.md
# на соответствие спеке Claude Code «Supported frontmatter fields»:
#   https://code.claude.com/docs/en/sub-agents#supported-frontmatter-fields
#
# Что проверяет:
#   1) Каждый .claude/agents/*.md открывается `---` и закрывает frontmatter.
#   2) В frontmatter присутствуют обязательные поля `name:` и `description:`.
#   3) Если указаны опциональные `model:` / `color:` / `effort:` — значения
#      из допустимых списков спеки. Опечатки `Sonnet` / `pinkk` ловятся.
#   4) Если `tools:` не указан — WARN (агент наследует всё, что может быть
#      намеренно, но стоит документировать это в теле).
#
# Использование: bash tools/verify-agents-frontmatter.sh
# Exit 0 — все проверки прошли. Exit 1 — найден drift.

set -eo pipefail
set -u
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$SCRIPT_DIR/.."
AGENTS_DIR="$REPO_ROOT/.claude/agents"
FAIL=0

if [ ! -d "$AGENTS_DIR" ]; then
  echo "✗ Не нашёл $AGENTS_DIR"
  exit 1
fi

# Допустимые значения по спеке. Полный model-ID (типа claude-opus-4-8)
# валидируется отдельно через префикс.
ALLOWED_MODELS_ALIAS='inherit sonnet opus haiku'
ALLOWED_COLORS='red blue green yellow purple orange pink cyan'
ALLOWED_EFFORTS='low medium high xhigh max'

# Извлечь значение поля из frontmatter одной .md.
# Берёт первое вхождение `<field>:` в первых 30 строках (frontmatter
# гарантированно короче). Возвращает trimmed значение, либо пусто.
extract_field() {
  local file="$1" field="$2"
  awk -v f="$field" '
    NR==1 && $0 != "---" { exit }
    NR>1 && /^---$/ { exit }
    NR>1 && $0 ~ "^" f ":" {
      sub("^" f ":[[:space:]]*", "")
      print
      exit
    }
  ' "$file"
}

# Проверить значение в списке допустимых. $1 — значение, $2 — список.
in_list() {
  local needle="$1" haystack="$2"
  for item in $haystack; do
    [ "$needle" = "$item" ] && return 0
  done
  return 1
}

shopt -s nullglob
AGENTS=("$AGENTS_DIR"/*.md)

if [ ${#AGENTS[@]} -eq 0 ]; then
  echo "⚠ В $AGENTS_DIR нет .md файлов — sub-agent'ов не объявлено"
  exit 0
fi

echo "Sub-agents в $AGENTS_DIR:"
for agent_file in "${AGENTS[@]}"; do
  echo "  - $(basename "$agent_file")"
done
echo ""

# Test 1: frontmatter открыт и закрыт.
echo "Test 1: каждый sub-agent имеет YAML frontmatter"
for agent_file in "${AGENTS[@]}"; do
  name=$(basename "$agent_file" .md)
  first_line=$(head -n 1 "$agent_file")
  if [ "$first_line" != "---" ]; then
    echo "  ✗ $name: первая строка ≠ '---' (нет frontmatter)"
    FAIL=1
    continue
  fi
  # Ищем закрывающий ---, начиная со второй строки.
  closed=$(awk 'NR>1 && /^---$/ { print NR; exit }' "$agent_file")
  if [ -z "$closed" ]; then
    echo "  ✗ $name: frontmatter не закрыт (нет второго '---')"
    FAIL=1
  fi
done

# Test 2: обязательные поля name и description.
echo ""
echo "Test 2: обязательные поля name + description"
for agent_file in "${AGENTS[@]}"; do
  name=$(basename "$agent_file" .md)
  fm_name=$(extract_field "$agent_file" name)
  fm_desc=$(extract_field "$agent_file" description)
  if [ -z "$fm_name" ]; then
    echo "  ✗ $name: нет поля 'name:' в frontmatter"
    FAIL=1
  fi
  if [ -z "$fm_desc" ]; then
    echo "  ✗ $name: нет поля 'description:' в frontmatter"
    FAIL=1
  fi
done

# Test 3: значения model / color / effort из допустимых списков.
echo ""
echo "Test 3: model / color / effort — значения из спеки"
for agent_file in "${AGENTS[@]}"; do
  name=$(basename "$agent_file" .md)

  fm_model=$(extract_field "$agent_file" model)
  if [ -n "$fm_model" ]; then
    if in_list "$fm_model" "$ALLOWED_MODELS_ALIAS"; then
      :
    elif [[ "$fm_model" =~ ^claude- ]]; then
      :  # полный model ID типа claude-opus-4-8
    else
      echo "  ✗ $name: model='$fm_model' — не алиас (inherit/sonnet/opus/haiku) и не claude-* ID"
      FAIL=1
    fi
  fi

  fm_color=$(extract_field "$agent_file" color)
  if [ -n "$fm_color" ] && ! in_list "$fm_color" "$ALLOWED_COLORS"; then
    echo "  ✗ $name: color='$fm_color' — допустимы: $ALLOWED_COLORS"
    FAIL=1
  fi

  fm_effort=$(extract_field "$agent_file" effort)
  if [ -n "$fm_effort" ] && ! in_list "$fm_effort" "$ALLOWED_EFFORTS"; then
    echo "  ✗ $name: effort='$fm_effort' — допустимы: $ALLOWED_EFFORTS"
    FAIL=1
  fi
done

# Test 4: если tools: не указан — WARN.
# По спеке: «If omitted, the subagent inherits all tools». Это валидно,
# но для прозрачности хочется чтобы автор это документировал в теле.
echo ""
echo "Test 4: tools — указан явно или есть пояснение про inherit в теле"
for agent_file in "${AGENTS[@]}"; do
  name=$(basename "$agent_file" .md)
  fm_tools=$(extract_field "$agent_file" tools)
  if [ -z "$fm_tools" ]; then
    # Грепаем в теле упоминание про inherit/наследование tools.
    if grep -qiE 'tools.*(inherit|наследу|опущен|omitted)' "$agent_file"; then
      echo "  ✓ $name: tools опущен, есть пояснение в теле"
    else
      echo "  ⚠ $name: tools опущен, нет пояснения в теле — добавь строку про inherit"
    fi
  fi
done

if [ "$FAIL" = "0" ]; then
  echo ""
  echo "All verification checks passed ✓"
  exit 0
else
  echo ""
  echo "Drift detected ✗ — поправь frontmatter под спеку Supported frontmatter fields."
  exit 1
fi
