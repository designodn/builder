# Routines — автоматизации Котика-Ботика

> Документ для Насти. Все cron-style автоматизации проекта в одном месте. Расписание задаётся в самой routine на claude.ai/code/routines (не в этой доке — мы намеренно decoupled, см. PR #83).

## Список routines

| Routine | Skill | Назначение | Триггер |
|---|---|---|---|
| `fbAnalyzer worker` | `/fbAnalyzer` | Триаж входящих issues — приоритеты, дубли, digest, Telegram-пинг на новые P0/P1 | Schedule |
| `reshala worker` | `/reshala` | Open auto-fix PR for typos in `.md` files | Schedule |
| `autoFixTech worker` | `/autoFixTech` | Open auto-fix PR for technical bugs (broken links, CI, `tools/*`, workflows) | Schedule |
| `autoMerge worker` | `/autoMerge` | Merge `auto-fix` and `auto-fix:technical` PRs with 👍 reaction от @starkhoney | Schedule |

Кроме routines, в проекте есть **GitHub Actions workflow'ы** (другая инфраструктура, не routines):

| Workflow | Что | Триггер |
|---|---|---|
| `sync-labels.yml` | Синхронизирует лейблы из `.github/labels.yml` | push to main / workflow_dispatch |
| `aggregate-sessions.yml` | Собирает session-telemetry в `tests/sessions.jsonl` + `docs/LEADERBOARD.md` | schedule `0 22 * * *` UTC / workflow_dispatch |
| `changelog.yml` | Auto-generated CHANGELOG | schedule |
| `smoke-tests.yml` | Bash smoke-тесты helper'ов | PR / push |

## Общая инструкция по настройке routine (разово)

1. **Открой [claude.ai/code/routines](https://claude.ai/code/routines)** (прямая ссылка; в UI это отдельная страница).
2. **New routine**:
   - **Name** — любое, например `fbAnalyzer worker`
   - **Prompt** — имя скилла одной строкой, например `/fbAnalyzer`
   - **Repositories** — `kotik-botik/kotik-botik`
   - **Environment** — та, где лежат `TELEGRAM_BOT_TOKEN` / `TELEGRAM_CHAT_ID` (см. `docs/TRIAGE_SETUP.md` про environment-настройку)
   - **Select a trigger** → **Schedule** → preset (минимум — **Hourly**)
   - **Connectors** — оставь только нужные (GitHub MCP — да; Figma можно отключить для скиллов, которым она не нужна)
   - **Permissions** → **Allow unrestricted branch pushes** — включай только для скиллов, которые пушат в не-`claude/`-ветки (например, `/reshala` создаёт `auto-fix/*`)
3. **Create**.

## Ограничения

- **Минимум 1 час между прогонами.** Anthropic не даёт делать routines чаще hourly. Скиллы спроектированы идемпотентно — лишний прогон ничему не вредит.
- **Один routine ≠ один скилл.** Технически можно сделать routine с prompt'ом «запусти `/fbAnalyzer` и потом `/reshala`», но раздельные routines дают раздельные сессии-логи, проще диагностировать.
- **Расписание живёт в routine UI**, не в этой доке. Если хочешь поменять — Edit routine → Schedule trigger.

## Telegram-нотификации

Если в Environment Settings заданы `TELEGRAM_BOT_TOKEN` и `TELEGRAM_CHAT_ID`, скиллы отправляют через `tools/notify-telegram.sh`:

- `/fbAnalyzer` — один агрегированный пинг на новые P0/P1 в конце прогона + секция `🏗 Архитектурные` на новые `needs-architect`
- `/reshala` — «🔧 PR открыт» сразу после создания PR (typo)
- `/autoFixTech` — «🔧 PR открыт» сразу после создания PR (technical) с указанием типа фикса
- `/autoMerge` — вечерняя сводка «🌙 За день»

Подробности — `docs/TRIAGE_SETUP.md` секция Telegram.

## Kill-switches

В `main` можно положить файлы-флаги — соответствующая routine при следующем прогоне тихо выйдет:

| Файл | Что отключает |
|---|---|
| `.claude/reshala-paused` | `/reshala` |
| `.claude/auto-fix-tech-paused` | `/autoFixTech` |
| `.claude/auto-merge-paused` | `/autoMerge` |

Снять — удалить файл через GitHub UI. Подробности — `docs/RESHALA.md` секция Kill-switches.

## Identity-check

Все четыре скилла (`/fbAnalyzer`, `/reshala`, `/autoFixTech`, `/autoMerge`) первым шагом проверяют `mcp__github__get_me().login == "starkhoney"`. Если нет — тихий выход, никаких сообщений. Это защищает от случайного запуска под Дизайнерским аккаунтом (плюс GitHub Read-роль не пропустит сами мутации). Подробности — `docs/SAFE_MODE.md`.

## Связанные документы

- Скиллы: `.claude/commands/fbAnalyzer.md`, `reshala.md`, `autoFixTech.md`, `autoMerge.md`
- Триаж и Telegram-настройка: `docs/TRIAGE_SETUP.md`
- Reshala scope и kill-switches: `docs/RESHALA.md`
- Безопасность: `docs/SAFE_MODE.md`
- Aggregation workflow: `tools/aggregate-sessions.py`, `.github/workflows/aggregate-sessions.yml`
