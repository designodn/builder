#!/bin/bash
# verify-session-telemetry-schema: валидирует каждую запись в sessions.jsonl
# против rules/schema/session-telemetry.schema.json.
#
# Защита: A-056-детектор gate-skip опирается на поля cjm_approved /
# i_approval_received / checklist_approved. Если builder запишет строку
# "true" вместо boolean true — aggregate-sessions.py тихо прочитает без
# ошибки, но логика детектора сломается. Schema ловит это как type error.
#
# Все поля опциональны — старые записи без новых полей проходят валидацию.
# Падает только на type-нарушениях: строка там где нужен boolean, unknown
# enum-значение в watchpoints_fired / states_covered и т.п.
#
# Usage: bash tools/verify-session-telemetry-schema.sh [jsonl_path]
# Default jsonl_path = tests/sessions.jsonl.
# Параметр нужен smoke-тесту (запускает guard на known-bad fixture).
#
# Exit 0 — ok (включая «нет sessions.jsonl» — это валидное начальное состояние).
# Exit 1 — найдено type-нарушение.

set -euo pipefail
cd "$(dirname "$0")/.."

JSONL="${1:-tests/sessions.jsonl}"
SCHEMA="rules/schema/session-telemetry.schema.json"

if [ ! -f "$JSONL" ]; then
  echo "✓ verify-session-telemetry-schema: $JSONL не существует — ok (нет сессий ещё)"
  exit 0
fi

if [ ! -f "$SCHEMA" ]; then
  echo "✗ verify-session-telemetry-schema: schema не найдена: $SCHEMA"
  exit 1
fi

# Preflight: ajv с поддержкой Draft 2020-12 должен быть установлен. Иначе
# `require('ajv/dist/2020')` падает мусорным MODULE_NOT_FOUND. CI ставит deps
# через `npm ci`; локально дев мог не сделать `npm install` после клона.
if [ ! -f node_modules/ajv/dist/2020.js ]; then
  echo "✗ verify-session-telemetry-schema: не найден ajv с Draft 2020-12 (node_modules/ajv/dist/2020.js отсутствует)."
  echo "  Сделай 'npm install' в корне репо и запусти скрипт заново."
  exit 1
fi

node -e "
const Ajv2020 = require('ajv/dist/2020');
const fs = require('fs');
const [, , schemaPath, dataPath] = process.argv;
const ajv = new Ajv2020({ strict: false, allErrors: true });
const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
const validate = ajv.compile(schema);
const lines = fs.readFileSync(dataPath, 'utf8').split('\n').filter(l => l.trim());
let fail = 0;
for (const [i, line] of lines.entries()) {
  let obj;
  try {
    obj = JSON.parse(line);
  } catch(e) {
    console.error('line ' + (i+1) + ': невалидный JSON — ' + e.message);
    fail++;
    continue;
  }
  if (!validate(obj)) {
    const sid = obj.session_id || '(no session_id)';
    console.error('line ' + (i+1) + ' [' + sid + ']: schema violation');
    for (const err of validate.errors) {
      console.error('  ' + (err.instancePath || '/') + ' — ' + err.message);
    }
    fail++;
  }
}
if (fail > 0) {
  console.error('');
  console.error('Это type-нарушение в session-telemetry. Типичная причина: builder записал');
  console.error('строку \"true\" вместо boolean, или неизвестное значение в enum-поле.');
  console.error('Исправить в issue body (builder.md Шаг 8) или через aggregate-sessions.py.');
  process.exit(1);
}
console.log('✓ verify-session-telemetry-schema: ' + lines.length + ' записей валидны в ' + dataPath);
" - "$SCHEMA" "$JSONL"
