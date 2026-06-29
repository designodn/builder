#!/usr/bin/env bash
# verify-forbidden-ops.sh
#
# Ловит «helper-bypass» паттерны в runtime-инструкциях: прямые мутации
# инстансов в обход `applyRuleDriven` helper'а (контракт #205 Step 1, PR-B).
#
# Контракт зафиксирован в .claude/commands/builder.md:
#   - lines 357-372: «Builder должен обязательно включать тело helper'а в
#     каждый use_figma снэшот, где создаётся 1+ инстанс из rule-описываемого
#     компонента, и вызывать его сразу после createInstance().»
#   - lines 879-892: «Forbidden API patterns» table.
#
# Этот guard ловит подмножество, надёжно детектируемое grep'ом:
#   1. inst.setProperties(...) напрямую вне helper'а — мутация инстанса в обход
#      applyRuleDriven (теряет _session.builder_picks tracking, recursion).
#   2. .findChild( / findOne( / findAll( на инстансе — манипуляция структурой
#      в обход bundle.rulesBySlug lookup.
#   3. .mainComponent.key — registry-key reflection в runtime (надо .id).
#   4. .swapComponent( — устарелый прямой swap (надо setProperties INSTANCE_SWAP
#      через applyRuleDriven).
#
# Distinct от verify-no-bad-apis.sh: тот guard ловит **wrong Figma API choice**
# (importComponentSetByKeyAsync, литералы размеров, findOne by name). Этот —
# ловит **helper bypass** на новом контракте PR-B. Sibling, не overlap.
#
# Exclusion logic:
#   - Sentinel-bounded helper body в builder.md (между HELPER_BODY:START/END)
#     — это and есть helper, его собственный setProperties легитимен.
#   - Контекст ±5 строк с negative-marker (❌, Forbidden, контр-пример) →
#     допускается как контр-пример.
#   - tests/scripts/figma-stub.js, tests/scripts/applyRuleDriven-tests.js —
#     whitelist'нуты по пути (test scaffolds, не runtime).
#
# CORPUS PIVOT (vs original #205 plan): Step 3 в плане архитектора был «grep
# over tests/sessions/*.jsonl», но (a) этот файл пуст, (b) use_figma код
# в текущем session-telemetry schema не captured. Pivot: scan .claude/commands/
# где живут patterns/recipes. Это catches doc-rot до того как pattern уйдёт
# в реальные сессии.
#
# Usage:
#   bash tools/verify-forbidden-ops.sh           # default scan: .claude/commands
#   bash tools/verify-forbidden-ops.sh <path>    # self-test fixture path
#
# Exit codes:
#   0  чисто
#   1  найдены нарушения
#   2  usage / missing file

set -euo pipefail

ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
cd "$ROOT"

# Forbidden patterns → grep -E (POSIX extended). Анкорим где можно.
FORBIDDEN_OPS=(
  # 1. Прямой setProperties на инстансе (любой идентификатор-точка-setProperties).
  #    safeSetProps на той же строке исключается отдельно через NEG_REGEX'у-line.
  '\b[a-zA-Z_][a-zA-Z0-9_]*\.setProperties\s*\('
  # 2. findChild/findOne/findAll на инстансе.
  '\.(findChild(ren)?|findOne|findAll(WithCriteria)?)\s*\('
  # 3. mainComponent.key — registry-key reflection.
  '\.mainComponent\.key\b'
  # 4. swapComponent direct call.
  '\.swapComponent\s*\('
)

# Default scan path: где Builder читает инструкции при работе.
if [ "${1:-}" != "" ]; then
  SCAN_PATHS=("$1")
else
  SCAN_PATHS=(
    ".claude/commands"
  )
fi

# Sentinel-bounded helper body живёт в .claude/commands/builder.md и
# tests/scripts/applyRuleDriven-tests.js (sync через verify-helper-sync.sh).
# Внутри sentinel'ов — собственный helper, его setProperties легитимный.
SENTINEL_START='=== HELPER_BODY:START applyRuleDriven ==='
SENTINEL_END='=== HELPER_BODY:END applyRuleDriven ==='

# Section-marker skip — для special-purpose sections (passport-flow в Шаге 7.6,
# /test --full adversarial scaffold) где прямая мутация инстансов легитимна:
# это не rule-driven компоненты, applyRuleDriven к ним не применим.
SKIP_START='<!-- verify-forbidden-ops:skip-start -->'
SKIP_END='<!-- verify-forbidden-ops:skip-end -->'

# Negative-context markers: ±5 строк, документация плохих паттернов.
NEG_REGEX="❌|[Ff]orbidden|FORBIDDEN|[Зз]апрещен|NEVER|никогда не|не использ|а не через|не через|контр-пример|counter[ -]?example|wrong|устарел|stale|safeSetProps"

# Whitelist: test scaffolds (mock'ают API, не runtime).
WHITELIST_PATHS=(
  "tests/scripts/figma-stub.js"
  "tests/scripts/applyRuleDriven-tests.js"
  "tests/scripts/parseProps-stub.js"
)

is_whitelisted() {
  local file="$1"
  for w in "${WHITELIST_PATHS[@]}"; do
    if [ "$file" = "$w" ]; then return 0; fi
  done
  return 1
}

# Извлекаем [start_line, end_line] sentinel-bounded helper body для файла.
# Echo'ит "start end" если sentinel найдены, иначе пусто.
sentinel_range() {
  local file="$1"
  awk -v s="$SENTINEL_START" -v e="$SENTINEL_END" '
    index($0, s) { start = NR; next }
    index($0, e) { end = NR; exit }
    END { if (start && end) print start " " end }
  ' "$file"
}

# Извлекаем все [start, end] skip-bounded sections для файла (multiple возможны).
# Echo'ит "start end" по парам, по одной паре на строку.
skip_ranges() {
  local file="$1"
  awk -v s="$SKIP_START" -v e="$SKIP_END" '
    index($0, s) { start = NR; next }
    index($0, e) { if (start) { print start " " NR; start = 0 } }
  ' "$file"
}

is_in_skip_range() {
  local file="$1"
  local lineno="$2"
  while IFS= read -r range; do
    [ -z "$range" ] && continue
    local s_start=$(echo "$range" | awk '{print $1}')
    local s_end=$(echo "$range" | awk '{print $2}')
    if [ "$lineno" -ge "$s_start" ] && [ "$lineno" -le "$s_end" ]; then
      return 0
    fi
  done < <(skip_ranges "$file")
  return 1
}

# Проверяет, что match'нувшийся pattern на строке существует ТОЛЬКО внутри
# backtick-bounded inline-code (markdown `inline`-кавычки). Strip backtick-сегменты,
# затем re-check forbidden patterns на stripped версии:
#   - если pattern всё ещё есть → real violation outside backticks → return 1 (НЕ inline)
#   - если pattern исчез после strip → match был только в backticks → return 0 (inline, skip)
# Previous heuristic (just check if backticks exist on line) ловил theoretical
# false-negative: `a.setProperties() and \`b.setProperties()\`` — был бы skip'нут
# хотя `a.setProperties()` outside backticks реален.
is_backtick_inline() {
  local line="$1"
  local stripped
  stripped=$(echo "$line" | sed 's/`[^`]*`//g')
  # Re-check тот же набор forbidden patterns. Если хоть один matches stripped →
  # real violation существует outside backticks.
  if echo "$stripped" | grep -qE '\b[a-zA-Z_][a-zA-Z0-9_]*\.(setProperties|findChild(ren)?|findOne|findAll(WithCriteria)?|swapComponent)\s*\('; then
    return 1
  fi
  if echo "$stripped" | grep -qE '\.mainComponent\.key\b'; then
    return 1
  fi
  return 0
}

VIOLATIONS=0

for pattern in "${FORBIDDEN_OPS[@]}"; do
  for path in "${SCAN_PATHS[@]}"; do
    while IFS=: read -r file lineno line; do
      [ -z "$file" ] && continue
      # Skip non-.md/.js
      case "$file" in
        *.md|*.js) ;;
        *) continue ;;
      esac
      # Skip whitelisted test scaffolds entirely
      if is_whitelisted "$file"; then continue; fi
      # Skip if line falls inside HELPER_BODY sentinel range
      range=$(sentinel_range "$file" 2>/dev/null || true)
      if [ -n "$range" ]; then
        s_start=$(echo "$range" | awk '{print $1}')
        s_end=$(echo "$range" | awk '{print $2}')
        if [ "$lineno" -gt "$s_start" ] && [ "$lineno" -lt "$s_end" ]; then
          continue
        fi
      fi
      # Skip if line falls inside any skip-section marker range
      if is_in_skip_range "$file" "$lineno"; then continue; fi
      # Skip if matched pattern is inside backtick-inline markdown (`xxx.setProperties()`)
      if is_backtick_inline "$line"; then continue; fi
      # Context ±5 строк — negative marker допускает как контр-пример
      start=$((lineno-5)); [ "$start" -lt 1 ] && start=1
      end=$((lineno+5))
      ctx=$(sed -n "${start},${end}p" "$file" 2>/dev/null || true)
      if echo "$ctx" | grep -qE "$NEG_REGEX"; then
        continue
      fi
      echo "✗ verify-forbidden-ops: $file:$lineno — helper-bypass pattern '$pattern'"
      echo "  >>> $line"
      VIOLATIONS=$((VIOLATIONS+1))
    done < <(grep -rnE "$pattern" "$path" 2>/dev/null --include="*.md" --include="*.js" || true)
  done
done

if [ "$VIOLATIONS" -gt 0 ]; then
  echo ""
  echo "✗ verify-forbidden-ops: найдено $VIOLATIONS нарушение(й)."
  echo "  Использовать applyRuleDriven(inst, ruleSlug, ctx) helper вместо прямой мутации."
  echo "  См. секции 'Rule-driven instantiation' и 'Forbidden API patterns' в .claude/commands/builder.md."
  exit 1
fi

echo "✓ verify-forbidden-ops: helper-bypass паттернов не найдено"
