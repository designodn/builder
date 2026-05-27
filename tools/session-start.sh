#!/usr/bin/env bash
# session-start.sh — единый entrypoint для SessionStart hook'а.
#
# Вызывается из .claude/settings.json при `matcher: startup|resume`.
# Делает две вещи:
#   1. Bootstrap (npm ci/install если node_modules отсутствует) — для
#      cloud sandbox, который клонирует репо свежим. Stdout bootstrap'а
#      под /dev/null чтобы не загрязнять agent context подробностями install.
#   2. printf инструкции про /fbAnalyzer — это сообщение попадает в agent
#      context как user-tip и триггерит автономный triage-прогон.
#
# Bootstrap failure НЕ блокирует session start — но **видим в обоих
# каналах**: при провале warning печатается в STDOUT (чтобы агент узнал
# и не запускал parseProps/syncKeys/validate-скрипты до фикса) И в STDERR
# (чтобы попал в session log для дизайнера). SessionStart hook'и
# собирают stdout как user-tip в agent context — без stdout агент не
# узнает о failed bootstrap и упадёт глубоко в /builder Шаг 6.
#
# Coverage warning'а:
#   ✓ corrupted package-lock (npm ci падает, npm install тоже)
#   ✓ network down (npm не дотягивается до registry)
#   ✓ peer-deps real conflict
#   ✗ partial success (npm install exit 0, но ajv не подтянулся) —
#     by-design ловится preflight'ами в скриптах, не bootstrap'ом.
#
# Silent fallback (`|| true` без warning'а) явно отклонён в #230 — он бы
# спрятал Inv-нарушения за MODULE_NOT_FOUND глубоко в /builder.
#
# `set -u` БЕЗ `-e`: namespace-pollution мы хотим ловить, но bootstrap
# failure не должен остановить printf — иначе session start «зависнет»
# без приветствия. НЕ упрощать обратно к `|| true` — см. #230.
set -u

if ! bash "$(dirname "$0")/bootstrap.sh" >/dev/null; then
  WARNING='⚠ session-start: не удалось подготовить окружение (npm install упал). Некоторые служебные проверки сейчас не работают. Выполни `npm install` руками или открой /fb. Сессия продолжается.'
  printf '%s\n' "$WARNING"        # stdout → попадает в agent context, чтобы агент не запускал ajv-скрипты
  printf '%s\n' "$WARNING" >&2    # stderr → session log для дизайнера
fi

printf '%s\n' 'При старте сессии тихо запусти /fbAnalyzer. Он сам сделает identity-check через mcp__github__get_me: если login != "starkhoney" — мгновенно выйдет без сообщений (это обычная дизайнерская сессия). Если уровень Настя — разберёт свежие issues, обновит pinned digest, пингнёт по новым P0/P1 и выведет короткий отчёт. Никаких подтверждений не запрашивай, действуй автономно.'
