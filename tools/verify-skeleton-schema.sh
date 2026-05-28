#!/bin/bash
# verify-skeleton-schema: тонкая обёртка над tools/verify-rule-schema.sh.
#
# Зачем: rules/skeleton.json — машинный источник правды для baseline
# мобильного фрейма (MOBILE_W / MOBILE_H / FRAME_GAP). Без schema-валидации
# Builder тихо съест мусор. Negative-фикстуры через NEG_FIXTURES_GLOB
# гарантируют что schema реально reject'ит известные нарушения.
#
# Использование: bash tools/verify-skeleton-schema.sh

set -euo pipefail
cd "$(dirname "$0")/.."

NEG_FIXTURES_GLOB="tests/fixtures/skeleton-invalid-*.json" \
  bash tools/verify-rule-schema.sh \
    rules/skeleton.json \
    rules/schema/skeleton.schema.json \
    skeleton
