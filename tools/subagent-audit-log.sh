#!/usr/bin/env bash
# subagent-audit-log: project-scoped SubagentStop hook.
#
# Логирует факт завершения каждого sub-agent диспатча в
# `.claude/_subagent_audit.log` (gitignored, локальный per-разработчик).
# Это observability для агентификации Builder'а — видно постфактум, какие
# агенты Builder реально диспатчил и в каком порядке. Полезно при
# отладке регрессий (вроде #357: «Builder делал use_figma сам, не
# диспатчил figma-implementer»).
#
# Триггер: SubagentStop event (Claude Code event, бросает JSON на stdin
# когда sub-agent завершает работу).
#
# Что пишется в лог:
#   <ISO timestamp> | <agent_type или "?"> | session=<short-id>
#
# Не блокирует, не модифицирует ответ. Всегда exit 0.

set -euo pipefail

LOG="${CLAUDE_PROJECT_DIR:-.}/.claude/_subagent_audit.log"
LOG_DIR="$(dirname "$LOG")"
mkdir -p "$LOG_DIR"

INPUT=$(cat || true)

# Извлекаем поля через jq если он есть, иначе fallback на grep.
TS=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

if command -v jq >/dev/null 2>&1; then
  AGENT_TYPE=$(printf '%s' "$INPUT" | jq -r '.agent_type // .subagent_type // .agent // .subagent_name // "?"' 2>/dev/null || echo "?")
  SESSION_ID=$(printf '%s' "$INPUT" | jq -r '.session_id // "?"' 2>/dev/null || echo "?")
else
  AGENT_TYPE=$(printf '%s' "$INPUT" | grep -oE '"(agent_type|subagent_type)"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | sed -E 's/.*"([^"]+)"$/\1/' || echo "?")
  SESSION_ID=$(printf '%s' "$INPUT" | grep -oE '"session_id"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | sed -E 's/.*"([^"]+)"$/\1/' || echo "?")
fi

# Короткий session id — первые 8 символов.
SHORT_ID="${SESSION_ID:0:8}"
[ -z "$SHORT_ID" ] && SHORT_ID="?"

printf '%s | %s | session=%s\n' "$TS" "$AGENT_TYPE" "$SHORT_ID" >> "$LOG"

exit 0
