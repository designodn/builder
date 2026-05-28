#!/bin/bash
# verify-approval-tokens: тонкая обёртка над tools/verify-rule-schema.sh
# плюс cite-contract grep — проверка что allow_list / deny_list_phrases
# из JSON упомянуты в md (защита от drift).
#
# Зачем: approval-tokens.json — машинный источник правды для apruv-словаря
# V-гейтов /builder. builder.md секция «Approval tokens» цитирует значения
# для людей; cite-contract grep гарантирует, что они не разойдутся.
#
# Использование: bash tools/verify-approval-tokens.sh

set -euo pipefail
cd "$(dirname "$0")/.."

# Schema валидация (через shared runner — единый стиль с verify-skeleton-schema.sh)
bash tools/verify-rule-schema.sh \
  rules/approval-tokens.json \
  rules/schema/approval-tokens.schema.json \
  approval-tokens

# Cite-contract: каждое слово из allow_list и deny_list_phrases должно
# присутствовать в builder.md секции «Approval tokens». Без этого JSON и md
# дрейфят — md остаётся со старыми словами, Builder уже читает новые.
DATA="rules/approval-tokens.json"
MD=".claude/commands/builder.md"

if [ ! -f "$MD" ]; then
  echo "✗ verify-approval-tokens: $MD не найден"
  exit 1
fi

# Извлекаем allow_list и deny_list_phrases как строки.
TOKENS=$(node -e "
const fs = require('fs');
const data = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const lists = [...(data.allow_list || []), ...(data.deny_list_phrases || [])];
for (const t of lists) console.log(t);
" - "$DATA")

MISSING=""
while IFS= read -r token; do
  [ -n "$token" ] || continue
  # Случай-нечувствительный grep по builder.md. Точные кавычки игнорируем
  # (md может цитировать в «ёлочках», JSON хранит plain).
  if ! grep -iFq "$token" "$MD"; then
    MISSING+="$token"$'\n'
  fi
done <<< "$TOKENS"

if [ -n "$MISSING" ]; then
  echo "✗ verify-approval-tokens: cite-contract drift — следующие токены из $DATA не упомянуты в $MD:"
  echo "$MISSING" | sed 's/^/    /'
  echo ""
  echo "Каждое слово из allow_list/deny_list_phrases должно быть процитировано в секции «Approval tokens» builder.md (для человеческого чтения). Если значение действительно удалили — убери из JSON."
  exit 1
fi

echo "✓ verify-approval-tokens: cite-contract OK — все токены процитированы в $MD"
