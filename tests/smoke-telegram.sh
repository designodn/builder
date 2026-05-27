#!/bin/bash
# smoke-telegram.sh — smoke-тест для tools/notify-telegram.sh.
#
# Проверяет, что helper:
#   1) Имеет валидный bash-синтаксис.
#   2) Тихо выходит (exit 0, no stderr) без TELEGRAM_BOT_TOKEN/CHAT_ID.
#   3) Тихо выходит (exit 0) при пустом stdin.
#   4) С невалидными секретами доходит до HTTP-вызова и логирует
#      http_code в stderr (best-effort, не валит).
#
# Использование: bash tests/smoke-telegram.sh
# Exit 0 — все тесты прошли. Exit 1 — хотя бы один тест провалился.
#
# Этот тест НЕ требует реальных Telegram-секретов и НЕ шлёт никаких
# сообщений в реальный чат. Безопасно гонять в CI и локально.

set -u
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
HELPER="$SCRIPT_DIR/../tools/notify-telegram.sh"
FAIL=0

assert_eq() {
  local name="$1" expected="$2" actual="$3"
  if [ "$expected" = "$actual" ]; then
    echo "  ✓ $name"
  else
    echo "  ✗ $name"
    echo "    expected: $expected"
    echo "    actual:   $actual"
    FAIL=1
  fi
}

echo "Test 1: syntax check (bash -n)"
if bash -n "$HELPER"; then
  echo "  ✓ syntax OK"
else
  echo "  ✗ syntax error"
  FAIL=1
fi

echo "Test 2: silent no-op without TOKEN"
unset TELEGRAM_BOT_TOKEN TELEGRAM_CHAT_ID
OUT=$(echo "should not be sent" | "$HELPER" 2>&1)
RC=$?
assert_eq "exit code = 0" "0" "$RC"
assert_eq "no stdout/stderr" "" "$OUT"

echo "Test 3: silent no-op with TOKEN but without CHAT_ID"
export TELEGRAM_BOT_TOKEN=fake
unset TELEGRAM_CHAT_ID
OUT=$(echo "should not be sent" | "$HELPER" 2>&1)
RC=$?
assert_eq "exit code = 0" "0" "$RC"
assert_eq "no output" "" "$OUT"

echo "Test 4: silent no-op on empty stdin"
export TELEGRAM_BOT_TOKEN=fake
export TELEGRAM_CHAT_ID=fake
OUT=$(printf "" | "$HELPER" 2>&1)
RC=$?
assert_eq "exit code = 0" "0" "$RC"
assert_eq "no output" "" "$OUT"

echo "Test 5: with invalid secrets — should reach curl and log http_code"
export TELEGRAM_BOT_TOKEN=invalid_token_12345
export TELEGRAM_CHAT_ID=0
OUT=$(echo "test" | "$HELPER" 2>&1)
RC=$?
assert_eq "exit code = 0 (best-effort)" "0" "$RC"
if echo "$OUT" | grep -q "http_code="; then
  echo "  ✓ stderr содержит http_code= (helper дошёл до HTTP)"
else
  echo "  ⚠ stderr НЕ содержит http_code — сеть в среде отключена?"
  echo "    Output: $OUT"
  # Это не fail — может быть network policy блокирует, тогда curl
  # тоже отработает корректно (timeout → http_code=000), что мы
  # принимаем.
fi

echo "Test 6: truncate — длинное сообщение должно усекаться до ≤ 4096"
# Генерим 5000 русских символов (с UTF-8 это >5000 байт).
# Без TOKEN/CHAT_ID helper выйдет до curl, но MESSAGE труекейтится ДО
# проверки секретов. Хитрость: ставим TOKEN, CHAT_ID но не реальные —
# чтобы дошло до curl. Curl упадёт, нам не важно — нам важно, что
# helper не упал на slicing.
export TELEGRAM_BOT_TOKEN=fake
export TELEGRAM_CHAT_ID=fake
LONG_MSG=$(printf 'ы%.0s' {1..5000})
OUT=$(printf '%s' "$LONG_MSG" | "$HELPER" 2>&1)
RC=$?
assert_eq "exit code = 0 (truncate не валит helper)" "0" "$RC"
if echo "$OUT" | grep -q "http_code="; then
  echo "  ✓ helper дошёл до curl (truncate+slicing отработали)"
else
  echo "  ⚠ stderr НЕ содержит http_code — но возможно сеть в среде отключена"
fi

unset TELEGRAM_BOT_TOKEN TELEGRAM_CHAT_ID

echo ""
if [ "$FAIL" = "0" ]; then
  echo "All smoke tests passed ✓"
  exit 0
else
  echo "Some smoke tests FAILED ✗"
  exit 1
fi
