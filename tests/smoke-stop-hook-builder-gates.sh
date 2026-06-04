#!/usr/bin/env bash
# smoke-stop-hook-builder-gates: meta-test для tools/stop-hook-builder-gates.sh.
#
# Покрытие:
#   1. Non-builder session (без user-invoked /builder) → exit 0.
#   2. Builder session с реальным tool_use use_figma → exit 0.
#   3. Builder session с tool_use issue_write + session-telemetry label → exit 0.
#   4. Builder session БЕЗ completion signals → exit 2 (главная защита).
#   5. stop_hook_active=true (рекурсия) → exit 0.
#   6. Missing transcript path → exit 0.
#   7. SubagentStop event defensive skip → exit 0.
#   8. NEW: prose-mention `/builder` без slash-command invocation → exit 0
#      (защита от false-positive — bash output, CHANGELOG, PR body).
#   9. NEW: prose-mention use_figma в reasoning (без tool_use) → exit 2 при
#      Builder mode (false-negative защита).
#
# Каждая фикстура использует **реалистичный JSONL-формат** Claude Code
# transcript'а: один JSON-объект на строку, role/content поля как в проде.
#
# Usage: bash tests/smoke-stop-hook-builder-gates.sh

set -euo pipefail
cd "$(dirname "$0")/.."

HOOK="tools/stop-hook-builder-gates.sh"
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

FAIL=0

run_case() {
  local name="$1"
  local transcript="$2"
  local input_json="$3"
  local expected_rc="$4"

  echo "$transcript" > "$TMP/transcript.txt"
  set +e
  echo "$input_json" | bash "$HOOK" > "$TMP/stdout" 2> "$TMP/stderr"
  local rc=$?
  set -e

  if [ "$rc" = "$expected_rc" ]; then
    echo "  ✓ $name → rc=$rc (expected)"
  else
    echo "  ✗ $name → rc=$rc (expected $expected_rc)"
    echo "    stdout: $(cat "$TMP/stdout")"
    echo "    stderr: $(cat "$TMP/stderr")"
    FAIL=1
  fi
}

# Realistic JSONL fixtures (один JSON-объект на строку, экранирование как в Claude Code prod).
USER_BUILDER='{"type":"user","message":{"role":"user","content":"<command-name>/builder</command-name>\n            <command-message>builder</command-message>\n            <command-args>помоги собрать макет</command-args>"}}'
USER_NORMAL='{"type":"user","message":{"role":"user","content":"Привет, расскажи как дела?"}}'
ASSISTANT_USE_FIGMA='{"type":"assistant","message":{"role":"assistant","content":[{"type":"tool_use","id":"toolu_1","name":"use_figma","input":{"code":"..."}}]}}'
ASSISTANT_ISSUE_TELEMETRY='{"type":"assistant","message":{"role":"assistant","content":[{"type":"tool_use","id":"toolu_2","name":"mcp__github__issue_write","input":{"labels":["session-telemetry","pulse:positive"],"title":"..."}}]}}'

echo "Test 1: non-builder session"
run_case "no user-invoked /builder" \
  "$USER_NORMAL" \
  "{\"transcript_path\": \"$TMP/transcript.txt\"}" \
  0

echo "Test 2: builder + use_figma tool_use"
run_case "builder + use_figma tool_use" \
  "$USER_BUILDER
$ASSISTANT_USE_FIGMA" \
  "{\"transcript_path\": \"$TMP/transcript.txt\"}" \
  0

echo "Test 3: builder + session-telemetry label tool_use"
run_case "builder + session-telemetry label" \
  "$USER_BUILDER
$ASSISTANT_ISSUE_TELEMETRY" \
  "{\"transcript_path\": \"$TMP/transcript.txt\"}" \
  0

echo "Test 4: builder без completion → block"
run_case "builder without completion → block" \
  "$USER_BUILDER" \
  "{\"transcript_path\": \"$TMP/transcript.txt\"}" \
  2

echo "Test 5: recursion guard"
run_case "stop_hook_active recursion" \
  "$USER_BUILDER" \
  "{\"transcript_path\": \"$TMP/transcript.txt\", \"stop_hook_active\": true}" \
  0

echo "Test 6: missing transcript path"
run_case "no transcript path" \
  "" \
  "{}" \
  0

echo "Test 7: SubagentStop event defensive skip"
run_case "SubagentStop defensive skip" \
  "$USER_BUILDER" \
  "{\"transcript_path\": \"$TMP/transcript.txt\", \"hook_event_name\": \"SubagentStop\"}" \
  0

# REGRESSION (false-positive fix): /builder в прозе/output'е НЕ должен триггерить.
# Это ровно тот баг, на котором этот же хук поймал себя в dev-сессии: разработчик
# редактирует builder.md, transcript содержит грипы и edit'ы со строкой `/builder`,
# но slash-command не вызывался.
echo "Test 8: NEW prose mention /builder → no false-positive"
PROSE_BUILDER='{"type":"assistant","message":{"role":"assistant","content":[{"type":"text","text":"Я отредактировала .claude/commands/builder.md — теперь Шаг 6 E.0 диспатчит slot-reasoner. Запусти /builder ещё раз чтобы проверить."}]}}'
run_case "prose /builder mention without slash-command" \
  "$USER_NORMAL
$PROSE_BUILDER" \
  "{\"transcript_path\": \"$TMP/transcript.txt\"}" \
  0

# REGRESSION (false-negative fix): use_figma в прозе НЕ должен пропускать.
echo "Test 9: NEW prose mention use_figma → block (нет tool_use)"
PROSE_USE_FIGMA='{"type":"assistant","message":{"role":"assistant","content":[{"type":"text","text":"После G-V6 апрува я вызову use_figma на каждом фрейме."}]}}'
run_case "prose use_figma mention without tool_use" \
  "$USER_BUILDER
$PROSE_USE_FIGMA" \
  "{\"transcript_path\": \"$TMP/transcript.txt\"}" \
  2

if [ "$FAIL" = "1" ]; then
  echo ""
  echo "✗ smoke-stop-hook-builder-gates: один или несколько кейсов не прошли"
  exit 1
fi

echo ""
echo "✓ smoke-stop-hook-builder-gates: все 9 кейсов прошли"
