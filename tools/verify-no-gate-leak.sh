#!/bin/bash
# verify-no-gate-leak: guard от утечки G-кодов и внутренних артефактов гейтов
# в шаблоны реплик дизайнеру во ВСЕХ `.claude/commands/*.md` файлах.
#
# Зачем: после #169 (formal gates) в builder.md появилось много упоминаний
# G-V*, G-I*, FAIL-1/2/3, _session.gates_passed[], _session.text_layout[],
# _session.json_layout[]. Эти токены — для self-check Builder'а, никогда
# не для дизайнера. Leak дать может только spec-drift: например, кто-то в
# шаблон реплики «Скажи дизайнеру: ...» вставит G-V3 PASS. CI этого не
# поймает обычным grep'ом (G-коды легитимно живут в meta-секциях того же
# файла).
#
# Подход: считаем «репликой дизайнеру» строки в `> «...»` / `> "..."` /
# `> _italic_` / `> *bold*` блоках цитат (стандартный формат шаблона
# реплики в spec'ах). Если внутри такого блока встретился запрещённый
# паттерн — leak.
#
# Скрипт скан'ит все `.claude/commands/*.md`, не только builder.md.
# Текущий single-skill с гейтами — /builder, но при появлении второго
# скилла с гейтами (/parseProps stage-gates, или новый /flow-builder) —
# защита уже на месте. Минимальная стоимость, future-proof.
#
# Использование: bash tools/verify-no-gate-leak.sh
# Exit 0 — чисто. Exit 1 — найден leak.

set -euo pipefail
cd "$(dirname "$0")/.."

# По умолчанию скан'им runtime-инструкции; для self-test'ов передавай путь
# к тестовой fixture-директории как $1 (см. tests/smoke-gate-leak.sh).
COMMANDS_DIR="${1:-.claude/commands}"

if [ ! -d "$COMMANDS_DIR" ]; then
  echo "✗ verify-no-gate-leak: $COMMANDS_DIR не существует"
  exit 1
fi

# Forbidden patterns в репликах дизайнеру.
FORBIDDEN_RE='(G-V[0-9]|G-I[0-9]|FAIL-[123]|gates_passed|text_layout|json_layout|_session\.)'

# Расширенный паттерн стартовой строки реплики:
#   > «...»     — ёлочки (русский стиль)
#   > "..."     — обычные кавычки
#   > _italic_  — italic-замечание дизайнеру (используется в Шаге 6 I)
#   > *bold*    — bold-замечание
#   > **...**   — strong-bold
# Конвенция: реплика дизайнеру всегда начинается с одного из этих маркеров
# сразу после `> `. Meta-блоки (`> ⚠️`, `> 💡`) — explicitly excluded
# (emoji не в whitelist начальных символов).
AWK_REPLY_START='/^> [«"_*]/'
AWK_NOT_REPLY='/^[^>]/'

FAIL=0
for f in "$COMMANDS_DIR"/*.md; do
  [ -f "$f" ] || continue
  LEAKED=$(awk "
    $AWK_REPLY_START { in_reply=1 }
    $AWK_NOT_REPLY { in_reply=0 }
    in_reply { print NR \": \" \$0 }
  " "$f" | grep -E "$FORBIDDEN_RE" || true)
  if [ -n "$LEAKED" ]; then
    echo "✗ verify-no-gate-leak: leak в $f:"
    echo "$LEAKED" | head -10 | sed 's/^/    /'
    FAIL=1
  fi
done

if [ "$FAIL" = "1" ]; then
  echo ""
  echo "Эти токены — для self-check Builder'а, не для чата с дизайнером."
  echo "См. CLAUDE.md «Глобальные правила реплик Дизайнеру»."
  exit 1
fi

echo "✓ verify-no-gate-leak: G-коды / внутренние артефакты не утекают в шаблоны реплик ни в одном из $(ls "$COMMANDS_DIR"/*.md | wc -l | tr -d ' ') .claude/commands/*.md"
