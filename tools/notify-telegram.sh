#!/bin/bash
# notify-telegram.sh — отправить сообщение в Telegram-чат Насти.
#
# Usage (через stdin, единственный безопасный способ — НЕ argv):
#
#   ./tools/notify-telegram.sh <<'EOF'
#   🔧 /reshala открыла PR #42 на твой апрув: https://github.com/...
#   Файл: docs/SESSION_TELEMETRY.md
#   EOF
#
# Почему stdin, а не аргумент.
#   Если передавать сообщение через `"$1"`, динамические значения (title issue,
#   путь, имя дизайнера) могут содержать `` ` ``, `$()`, кавычки. В Bash tool
#   Claude'а это превращается в RCE. Heredoc с `<<'EOF'` (quoted!) такого не
#   допускает — содержимое читается как литерал.
#
# Поведение:
#   - Если TELEGRAM_BOT_TOKEN или TELEGRAM_CHAT_ID не заданы — silent no-op (exit 0).
#     Скиллы безопасно зовут helper до настройки секретов.
#   - Сетевой таймаут — 10 сек. Curl errors silenced — best-effort, никогда не
#     блокирует основной флоу скилла.
#   - Plain text (без `parse_mode`). Telegram-Markdown V1 ломается на `_` в
#     путях/slug'ах ("docs/SESSION_TELEMETRY.md"). Скиллы шлют как есть.
#   - HTTP-код пишется в stderr, если != 200. Claude видит в выводе Bash-tool
#     и упоминает в отчёте — наблюдаемость без файлов.
#
# Exit code: всегда 0 (best-effort).

set -u  # без -e: ошибки сети не должны валить helper

# UTF-8 locale нужен для корректного string-slicing по codepoint'ам
# (а не по байтам). Telegram считает 4096 codepoints — если бы slicing
# был байтовый, split-multibyte ломал бы кириллицу.
export LC_ALL=C.UTF-8

# Silent no-op если секреты не настроены.
if [ -z "${TELEGRAM_BOT_TOKEN:-}" ] || [ -z "${TELEGRAM_CHAT_ID:-}" ]; then
  exit 0
fi

# Читаем сообщение из stdin. Если ничего не прилетело — выходим без шума.
MESSAGE="$(cat)"
if [ -z "$MESSAGE" ]; then
  exit 0
fi

# Telegram API режет на 4096 символов; усекаем на 3900 + маркер для
# предсказуемого поведения (issue #77).
if [ "${#MESSAGE}" -gt 4000 ]; then
  MESSAGE="${MESSAGE:0:3900}

… [truncated by notify-telegram, полные данные в GitHub]"
fi

# --write-out даёт HTTP-код, чтобы понять «дошло ли». --output /dev/null
# отбрасывает body. --silent выключает прогресс-бар. БЕЗ --show-error, чтобы
# никакая часть URL (включая токен) не могла попасть в stderr при ошибке.
HTTP_CODE="$(
  curl --silent --max-time 10 \
    --output /dev/null \
    --write-out '%{http_code}' \
    -X POST "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" \
    --data-urlencode "chat_id=${TELEGRAM_CHAT_ID}" \
    --data-urlencode "text=${MESSAGE}" \
    --data-urlencode "disable_web_page_preview=true" \
    2>/dev/null || echo "000"
)"

# Только код в stderr, никаких URL/токенов. Claude увидит и сможет упомянуть
# в отчёте сессии, если что-то пошло не так.
if [ "$HTTP_CODE" != "200" ]; then
  echo "notify-telegram: http_code=${HTTP_CODE}" >&2
fi

exit 0
