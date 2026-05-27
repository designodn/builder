#!/usr/bin/env bash
# bootstrap.sh — идемпотентный setup для cloud sandbox.
#
# Cloud Claude Code sandbox клонирует репо свежим, без node_modules. Скрипты
# `tests/scripts/parseProps-utils.js`, `tools/verify-*.sh` (использующие ajv)
# падают на отсутствующем `ajv/dist/2020`. На CI всё ставится через `npm ci`
# в smoke-tests.yml; локально дев делает `npm install` руками после клона.
#
# Этот скрипт — третий путь: tихая идемпотентная установка при старте
# сессии. Вызывается из `tools/session-start.sh` через SessionStart hook
# в `.claude/settings.json`.
#
# Контракт:
# - Если `node_modules` уже есть — exit 0 моментально (no-op на повторных сессиях).
# - Если есть `package-lock.json` — `npm ci` (детерминированно + быстро).
# - Иначе — fallback на `npm install` (corrupted lock или ручная очистка).
# - Если `npm` не найден — мягкий warning + exit 0 (не блокируем session start).
set -euo pipefail

cd "$(dirname "$0")/.."

# Уже установлено — выход
[ -d node_modules ] && exit 0

# npm недоступен — мягкая деградация (preflight'ы в скриптах сами выдадут подсказку)
command -v npm >/dev/null || {
  echo "bootstrap: npm не найден, пропускаю install" >&2
  exit 0
}

# Детерминированный install через npm ci (валидный lock) с fallback на npm install
if [ -f package-lock.json ]; then
  npm ci --silent --prefer-offline 2>/dev/null || npm install --silent --no-audit --no-fund
else
  npm install --silent --no-audit --no-fund
fi
