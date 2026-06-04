#!/usr/bin/env bash
# smoke-stop-hook-builder-gates: meta-test для tools/stop-hook-builder-gates.sh.
#
# Покрытие:
#   1. Non-builder session (без /builder в transcript) → exit 0 (пропускает).
#   2. Builder session + use_figma в transcript → exit 0 (completion signal).
#   3. Builder session + session-telemetry в transcript → exit 0.
#   4. Builder session БЕЗ completion signals → exit 2 (блокирует).
#   5. stop_hook_active=true (рекурсия) → exit 0 (защита от петли).
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

# Кейс 1: не Builder сессия.
echo "Test 1: non-builder session"
run_case "no /builder in transcript" \
  "Привет, как дела? Расскажи про погоду." \
  "{\"transcript_path\": \"$TMP/transcript.txt\"}" \
  0

# Кейс 2: Builder + use_figma как tool_use (JSON-field совпадение).
echo "Test 2: builder + use_figma tool_use"
run_case "builder + use_figma tool_use" \
  "Пользователь: /builder помоги собрать макет
{\"type\":\"tool_use\",\"name\":\"use_figma\",\"input\":{...}}" \
  "{\"transcript_path\": \"$TMP/transcript.txt\"}" \
  0

# Кейс 2b: Builder + use_figma в прозе (НЕ как tool_use) — должен блокировать.
# После укрепления regex'а на JSON-field совпадение, mere mention не должен пропускать.
echo "Test 2b: builder + use_figma в прозе (не tool_use)"
run_case "builder + use_figma mention only" \
  "Пользователь: /builder
Builder: после G-V6 я вызову use_figma на каждом фрейме." \
  "{\"transcript_path\": \"$TMP/transcript.txt\"}" \
  2

# Кейс 3: Builder + session-telemetry label.
echo "Test 3: builder + session-telemetry label"
run_case "builder + session-telemetry" \
  "/builder
{\"labels\":[\"session-telemetry\",\"pulse:positive\"],\"title\":\"...\"}" \
  "{\"transcript_path\": \"$TMP/transcript.txt\"}" \
  0

# Кейс 4: Builder без completion (главная защита).
echo "Test 4: builder без completion → block"
run_case "builder without completion → block" \
  "Пользователь: /builder
Builder: ок, давай начнём. Какой флоу рисуем?
Пользователь: онбординг" \
  "{\"transcript_path\": \"$TMP/transcript.txt\"}" \
  2

# Кейс 5: stop_hook_active recursion guard.
echo "Test 5: recursion guard"
run_case "stop_hook_active recursion" \
  "/builder без use_figma" \
  "{\"transcript_path\": \"$TMP/transcript.txt\", \"stop_hook_active\": true}" \
  0

# Кейс 6: пустой/missing transcript path.
echo "Test 6: missing transcript path"
run_case "no transcript path" \
  "" \
  "{}" \
  0

if [ "$FAIL" = "1" ]; then
  echo ""
  echo "✗ smoke-stop-hook-builder-gates: один или несколько кейсов не прошли"
  exit 1
fi

# Кейс 7: SubagentStop event — должен пропускать (defensive guard).
echo "Test 7: SubagentStop event defensive skip"
run_case "SubagentStop event defensive skip" \
  "/builder без use_figma — sub-agent stopping" \
  "{\"transcript_path\": \"$TMP/transcript.txt\", \"hook_event_name\": \"SubagentStop\"}" \
  0

echo ""
echo "✓ smoke-stop-hook-builder-gates: все 7 кейсов прошли"
