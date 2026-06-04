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
# Источник правды о Builder mode: первое сообщение юзера в сессии
# содержит `/builder` команду (явный invocation).
#
# Сигнал completion (любой из):
#   - `use_figma` tool call (G-V6 → G-I3 пройден, build состоялся)
#   - `session-telemetry` issue созданы (Шаг 8 завершён)
#
# Не Builder сессия → пропускаем. Builder + completion signal → пропускаем.
# Builder без completion → exit 2 с сообщением.
#
# Recursion prevention: если stop_hook_active === true, пропускаем
# (хук фит'нул себя в transcript, не зацикливаемся).
#
# False-positive risk: дизайнер сознательно прервал /builder («сорян,
# не сегодня»). Это редко — обычно прерывают после показа CJM / макета,
# и в таком случае use_figma уже сработал. Если хук false-positive'нет —
# Настя выпиливает entry из settings.json или добавляет escape-hatch.

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

# Detect Builder mode: пользователь явно вызвал /builder в каком-то turn'е.
# Транскрипт может быть JSON Lines или single JSON — grep работает с любым.
# Pattern: строка "/builder" с word boundary (не /builderxyz).
if ! grep -qE '(^|[^a-zA-Z])/builder($|[^a-zA-Z])' "$transcript_path" 2>/dev/null; then
  exit 0  # Not a Builder session
fi

# Builder mode. Проверяем completion signals.
#
# Известное ограничение (документировано как heuristic enforcement):
# regex'ы ищут JSON-field-стиль совпадения (`"name":"use_figma"`,
# `"session-telemetry"` в массиве labels), а не голые подстроки. Это
# снижает false-negative от прозы («после G-V6 вызову use_figma»),
# но не исключает полностью — если Claude Code сериализует tool_use
# с другим ключом, паттерн пропустит.
#
# Источник правды НЕ этот хук, а spec-level G-P-skeleton (#348) + Builder
# self-check. Хук — backstop, observation window 2-4 недели.
# Если ловит false-positives/negatives систематически — выпиливаем
# или переводим на jq-структуру (но это требует знания актуального
# transcript JSON schema, который варьируется между версиями).
if grep -qE '"name"[[:space:]]*:[[:space:]]*"use_figma"|"session-telemetry"' "$transcript_path" 2>/dev/null; then
  exit 0  # Builder reached Figma build OR Шаг 8
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
