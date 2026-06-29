#!/bin/bash
# verify-rule-schema: общий runner для AJV-валидации JSON-файлов против schema.
#
# Раньше каждая schema имела отдельный bash-скрипт (verify-skeleton-schema.sh,
# verify-approval-tokens.sh) с почти-идентичным кодом. Различие — только пути
# к data и schema. На третьей schema'е этот шаблон собирается в общий helper.
#
# Usage: bash tools/verify-rule-schema.sh <data.json> <schema.json> <label>
#   data.json   — путь к данным
#   schema.json — путь к schema
#   label       — короткое имя для лог-вывода («skeleton», «approval-tokens»)
#
# Опционально (через окружение):
#   NEG_FIXTURES_GLOB — glob для negative-фикстур, которые **обязаны** быть
#                      отвергнуты schema'ой. Если пуст или пуста выдача — guard
#                      («не нашли ни одной» → exit 1). Формат exit-code контракта
#                      (1 = correctly-rejected, 2 = permissive-fail, 3+ = runtime)
#                      — как в исходном verify-skeleton-schema.sh.
#
# Schema на draft 2020-12 (как rules/schema/*.schema.json — единый стиль).

set -euo pipefail
cd "$(dirname "$0")/.."

DATA="${1:-}"
SCHEMA="${2:-}"
LABEL="${3:-rule-schema}"

if [ -z "$DATA" ] || [ -z "$SCHEMA" ] || [ -z "$LABEL" ]; then
  echo "✗ verify-rule-schema: usage: bash $0 <data.json> <schema.json> <label>"
  exit 1
fi

if [ ! -f "$SCHEMA" ]; then
  echo "✗ verify-rule-schema ($LABEL): schema not found at $SCHEMA"
  exit 1
fi
if [ ! -f "$DATA" ]; then
  echo "✗ verify-rule-schema ($LABEL): data not found at $DATA"
  exit 1
fi

# Preflight: ajv с поддержкой Draft 2020-12 должен быть установлен. Иначе
# `require('ajv/dist/2020')` падает мусорным MODULE_NOT_FOUND. CI ставит deps
# через `npm ci`; локально дев мог не сделать `npm install` после клона.
if [ ! -f node_modules/ajv/dist/2020.js ]; then
  echo "✗ verify-rule-schema ($LABEL): не найден ajv с Draft 2020-12 (node_modules/ajv/dist/2020.js отсутствует)."
  echo "  Сделай 'npm install' в корне репо и запусти скрипт заново."
  exit 1
fi

# Positive-валидация: data должен соответствовать schema'е.
# Подаём пути через argv, не через shell-interpolation в node -e (hygiene).
node -e "
const Ajv2020 = require('ajv/dist/2020');
const fs = require('fs');
const [, , schemaPath, dataPath, label] = process.argv;
const ajv = new Ajv2020({ strict: false, allErrors: true });
const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
const validate = ajv.compile(schema);
if (!validate(data)) {
  console.error('✗ verify-rule-schema (' + label + '): ' + dataPath + ' не валиден');
  for (const err of validate.errors) {
    console.error('  ' + (err.instancePath || '/') + ' — ' + err.message);
  }
  process.exit(1);
}
console.log('✓ verify-rule-schema (' + label + '): ' + dataPath + ' валиден');
" - "$SCHEMA" "$DATA" "$LABEL"

# Negative-тесты, если указан glob: каждый файл glob'а должен быть отвергнут
# schema'ой. Без guard'а на пустой glob — silent passthrough.
if [ -n "${NEG_FIXTURES_GLOB:-}" ]; then
  NEG_FIXTURES=$(find $(dirname "$NEG_FIXTURES_GLOB") -maxdepth 1 -name "$(basename "$NEG_FIXTURES_GLOB")" 2>/dev/null | LC_ALL=C sort || true)
  NEG_COUNT=$(printf '%s\n' "$NEG_FIXTURES" | grep -c . || true)
  if [ "$NEG_COUNT" = "0" ]; then
    echo "✗ verify-rule-schema ($LABEL): не найдено ни одной negative-фикстуры по glob '$NEG_FIXTURES_GLOB'. Это сама по себе регрессия — без них верификатор не ловит permissive schema."
    exit 1
  fi

  NEG_FAIL=0
  while IFS= read -r INVALID_DATA; do
    [ -n "$INVALID_DATA" ] || continue
    set +e
    node -e "
      const Ajv2020 = require('ajv/dist/2020');
      const fs = require('fs');
      const [, , schemaPath, dataPath] = process.argv;
      const ajv = new Ajv2020({ strict: false, allErrors: true });
      const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
      const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
      const validate = ajv.compile(schema);
      process.exit(validate(data) ? 2 : 1);
    " - "$SCHEMA" "$INVALID_DATA"
    RC=$?
    set -e
    if [ "$RC" = "1" ]; then
      echo "✓ verify-rule-schema ($LABEL): $INVALID_DATA корректно отвергнут"
    elif [ "$RC" = "2" ]; then
      echo "✗ verify-rule-schema ($LABEL): $INVALID_DATA прошёл валидацию (схема слишком permissive)"
      NEG_FAIL=1
    else
      echo "✗ verify-rule-schema ($LABEL): runtime error на $INVALID_DATA (rc=$RC) — node не доехал до валидации, см. stderr выше"
      exit $RC
    fi
  done <<< "$NEG_FIXTURES"

  if [ "$NEG_FAIL" = "1" ]; then
    exit 1
  fi
  echo "✓ verify-rule-schema ($LABEL): negative-tests passed ($NEG_COUNT фикстур)"
fi
