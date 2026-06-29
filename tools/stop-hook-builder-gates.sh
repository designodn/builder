#!/usr/bin/env bash
# stop-hook-builder-gates: project-scoped Stop-hook для enforce'инга
# builder-флоу. Блокирует «преждевременный stop» когда /builder был
# запущен, но не дошёл до use_figma (Шаг 7) или session-telemetry (Шаг 8).
#
# Это поверх spec-level G-P-skeleton + Builder self-check: даже если
# Builder в reasoning'е решил «всё, дальше не пойду» без honor'инга
# гейтов, хук остановит exit и попросит вернуться.
#
# Триггер: Stop event (Claude закончил ответ).
#
# Источник правды о Builder mode: USER явно вызвал /builder как
# slash-command. В transcript JSONL это видно по pattern'у:
#   "role":"user","content":"<command-name>/builder</command-name>...
# Только user-message c content-as-string (не tool_result, не assistant
# tool_use). Это критично: иначе хук false-positive'ит на любой сессии,
# где `/builder` упомянут в прозе (docs, CHANGELOG, PR-описания,
# bash-команды в transcript содержат свои же grep-паттерны и т.п.).
#
# Сигнал completion (любой из):
#   - `"name":"use_figma"` в transcript — реальный tool_use call,
#     не prose-упоминание (regex анкорится на структуру tool_use блока).
#   - mcp__github__issue_write с label "session-telemetry" в labels-массиве
#     — `\"session-telemetry\"` в JSON-escape'нутой строке tool input'а.
#
# Не Builder сессия → пропускаем. Builder + completion signal → пропускаем.
# Builder без completion → exit 2 с сообщением.
#
# Recursion prevention: если stop_hook_active === true, пропускаем.
#
# Defensive: только Stop event, не SubagentStop.
#
# Observation window: re-evaluate by 2026-09-04 OR после первой
# session-telemetry issue без сопровождающего use_figma tool_use в
# transcript (это сигнал «хук молча пропустил Builder'а» — false-negative,
# вероятно из-за изменения serialization-формата Claude Code) — что
# наступит раньше. Если паттерны transcript'а изменятся (другая версия
# Claude Code, другой serialization) — обновлять regex'ы синхронно с
# примерами в smoke-tests.
#
# Known fragility: regex `"name":"use_figma"` чувствителен к точному
# порядку полей в JSON-сериализации tool_use блока. Если Claude когда-нибудь
# сменит порядок ключей (например, `{"name" : "use_figma"}` с пробелом или
# `{"input":{...},"name":"use_figma"}` другим порядком) — pattern сломается.
# Smoke-тест 9 проверяет prose-mention false-negative, но не покрывает
# alternate serialization tool_use'а.

set -euo pipefail

input=$(cat)

# Recursion prevention
stop_hook_active=$(echo "$input" | jq -r '.stop_hook_active // false' 2>/dev/null || echo "false")
if [ "$stop_hook_active" = "true" ]; then
  exit 0
fi

# Defensive: только Stop event, не SubagentStop. По доке Claude Code хук
# регистрируется отдельно под Stop и SubagentStop, но settings.json matcher=""
# не разделяет. Проверка по hook_event_name страхует от случайной активации
# при выходе sub-agent'а (architect / cjm / etc.) — у них может ещё не быть
# use_figma в transcript, и блокирование stop'а sub-agent'а — не задача
# этого хука.
hook_event=$(echo "$input" | jq -r '.hook_event_name // empty' 2>/dev/null || echo "")
if [ -n "$hook_event" ] && [ "$hook_event" != "Stop" ]; then
  exit 0
fi

transcript_path=$(echo "$input" | jq -r '.transcript_path // empty' 2>/dev/null || echo "")
if [ -z "$transcript_path" ] || [ ! -f "$transcript_path" ]; then
  exit 0
fi

# Detect Builder mode: USER явно вызвал /builder как slash-command.
# Pattern анкорится на JSONL-структуру user-сообщения с content-as-string
# (slash-команды), исключая tool_result (содержание bash output'а) и
# assistant tool_use (что Claude цитирует в commands). Без этого якоря
# любое прозаическое упоминание `/builder` (в CHANGELOG, docs, PR body,
# bash grep команде) даёт false-positive — этот хук поймал самого себя
# на сессии разработки, где обсуждается /builder, но не запускается.
if ! grep -qE '"role":"user","content":"<command-name>/builder</command-name>' "$transcript_path" 2>/dev/null; then
  exit 0  # Not a real Builder session (no explicit slash-command invocation)
fi

# Builder mode. Проверяем completion signals.
#
# `"name":"use_figma"` — анкорится на tool_use блок в assistant content,
# не на голое упоминание use_figma в прозе. Подтверждено grep'ом по
# реальному transcript'у в smoke-фикстурах.
#
# `"session-telemetry"` — литерал в `labels` массиве tool_input'а
# (mcp__github__issue_write при создании session-telemetry issue в Шаге 8).
# В реальном Claude Code transcript JSONL это unescaped (nested JSON живёт
# в content-array, не stringified) — подтверждено grep'ом по prod-transcript'у.
# Pattern может false-positive'нуть в prose, если кто-то напишет `"session-telemetry"`
# в кавычках в reasoning — но это редкий и сознательный кейс; цена ниже,
# чем требовать `\\"session-telemetry\\"` (escape'нутый), который не матчит
# реальный prod-формат.
#
# Хук — backstop поверх spec-level G-P-skeleton (#348). Если паттерны
# transcript'а меняются между версиями Claude Code — обновлять regex'ы
# одновременно со smoke-фикстурами.
if grep -qE '"name":"use_figma"|"session-telemetry"' "$transcript_path" 2>/dev/null; then
  exit 0  # Builder reached Figma build OR Шаг 8 telemetry creation
fi

# Builder вызван, но completion signals отсутствуют. Block stop.
cat >&2 <<'MSG'
Сессия /builder не завершена: ни use_figma не вызвался (Шаг 7), ни session-telemetry issue не создан (Шаг 8).

Если работа реально не завершена — продолжай флоу до конца:
  • получи апрув дизайнера на CJM (G-V3), раскладку (G-V5), чек-лист (G-V6)
  • вызови use_figma на каждом фрейме (G-I3)
  • создай session-telemetry issue в Шаге 8

Если дизайнер сознательно прервал сессию — явно скажи ему почему, и предложи возобновить позже. Не молчи.
MSG
exit 2
