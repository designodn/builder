# Настройка триажа `/fbAnalyzer`

> Документ для Насти. Описывает разовую настройку авто-запуска `/fbAnalyzer` через routine в claude.ai/code и через SessionStart hook. Связан с `.claude/commands/fbAnalyzer.md` и `docs/SESSION_TELEMETRY.md`.

## Что такое триаж и зачем

`/fbAnalyzer` — это автоматический разборщик входящих issues от дизайнеров. Раз в полчаса (или при открытии репо в Claude Code) он:

- Группирует и дедупит issues с одинаковой ошибкой между сессиями.
- Ставит `priority:p0..p3` по правилам.
- Обновляет pinned digest issue со сводкой.
- Пингует `@starkhoney` на новых P0/P1 — это единственный момент, когда тебе нужно реально посмотреть.
- Классифицирует issues на три категории (см. `.claude/commands/fbAnalyzer.md` Шаг 5):
  - `auto-fixable:typo` — опечатки в `.md`, для агента-решалы `/reshala`.
  - `auto-fixable:technical` — технические баги (broken links, CI, `tools/*`, workflows), для `/autoFixTech`.
  - `needs-architect` — структурные/концептуальные изменения, Telegram-пинг Насте.

Без триажа ты бы видела поток сырых issues и сама разбирала. С триажем — только pinned digest и реальные мобильные пинги на P0/P1.

## Что подготовить (разово)

1. **Создать 21 лейбл** из `.github/labels.yml` (9 Phase 1 + 5 Phase 3 + 5 Phase 4 + 4 Phase 5). Самый быстрый путь — workflow `sync-labels.yml`:
   - GitHub Mobile / Web → репо → **Actions** → workflow **Sync labels** → **Run workflow** → ветка `main` → Run.
   - Через ~10 секунд все лейблы заведены. Идемпотентно — можно запускать сколько угодно.
   - Если правишь `labels.yml` и пушишь в `main` — workflow срабатывает автоматически.

2. **(Опционально) Завести Telegram-бота** для мгновенных пингов:
   - В Telegram написать `@BotFather` → `/newbot` → wizard → получить `TELEGRAM_BOT_TOKEN`.
   - Написать `@userinfobot` `/start` → получить свой `chat_id` (число).
   - **Положить токены в Environment Settings claude.ai/code** (НЕ в GitHub Secrets — routine сессии живут в Anthropic-сэндбоксе, не в Actions):
     - Открыть https://claude.ai/code → кликнуть на cloud icon (имя environment) → шестерёнка справа → диалог редактирования.
     - В поле **Environment variables** добавить две строки в `.env`-формате (без кавычек):
       ```
       TELEGRAM_BOT_TOKEN=<токен>
       TELEGRAM_CHAT_ID=<chat_id>
       ```
     - В поле **Network access** → **Allowed domains** добавить `api.telegram.org` (по умолчанию его в default allowlist нет).
     - Save.
   - Helper-скрипт `tools/notify-telegram.sh` сам проверяет наличие переменных — без них скиллы тихо работают без Telegram.

   > **Безопасность.** Отдельного secrets-store в claude.ai/code пока нет — токен виден всем с edit-доступом к environment. Если протечёт — `@BotFather` → `/revoke` → новый токен → обновить переменную.

3. **Создать Routines** — общая инструкция в `docs/ROUTINES.md`. Для триажа нужна routine:
   - **Prompt**: `/fbAnalyzer`
   - **Environment**: та, где лежат Telegram-секреты (см. шаг 2)
   - **Schedule**: любой preset, минимум Hourly

   То же самое сделай для `/reshala` и `/autoMerge` (см. `docs/ROUTINES.md` секцию «Список routines»).

4. **(Опционально) SessionStart hook** — страховка на случай, когда routine пропустит цикл:
   - Уже добавлен в `.claude/settings.json` этой репы (см. ниже).
   - Открывая Claude Code в репо, ты автоматически запустишь свежий разбор. Никаких лишних действий не нужно.

## Как это всё работает вместе

```
Дизайнер делает /builder
        │
        ├─→ session-telemetry issue (с pulse)
        └─→ auto:bug:* issue (если был watchpoint)
                │
                │ при следующем прогоне routine
                ▼
        routine запускает /fbAnalyzer
                │
                ├─→ ставит priority:p<N>, dup-of:#NNN, triage:reviewed
                ├─→ обновляет pinned digest
                └─→ на новых P0/P1 → @starkhoney mention + (Phase 6) Telegram
                        │
                        ▼
                Настя в GitHub Mobile / Telegram видит пинг, решает
```

## Идемпотентность и безопасность

- **Идемпотентность.** `/fbAnalyzer` можно запускать сколько угодно — он не плодит дубли labels, не повторяет пинги. На новых данных делает работу, на старых — no-op.
- **Identity-check.** Скилл сначала вызывает `mcp__github__get_me`. Если `login != "starkhoney"` — тихо выходит. Дизайнерская сессия с SessionStart hook не получит ни ошибки, ни шума.
- **GLaDOS-режим.** Перед серией мутаций (labels, комменты, digest update) — одна реплика в стиле GLaDOS, как описано в CLAUDE.md.

## Чекпоинты — что должно появиться после первой настройки

После первого запуска `/fbAnalyzer`:

1. В репозитории появился новый issue с title `[triage] Digest`, прикреплён сверху как pinned.
2. Существующие open issues получили `priority:*` и `triage:reviewed` labels.
3. На свежих P0/P1 (если такие были) появился коммент `@starkhoney — зафиксирован priority:p0...`.
4. На опечатки в docs — label `auto-fixable:typo`.

Если ничего не появилось — посмотри в claude.ai/code историю последней сессии `/fbAnalyzer`. Скорее всего, отчёт «list_issues failed» или «labels отсутствуют, создай через sync-labels.yml».

## Альтернативы

- **Ручной запуск.** Просто скажи Claude'у `/fbAnalyzer` в любой момент — то же самое, что routine, но синхронно.
- **GitHub Actions.** Отвергли в пользу routine — Actions требует `ANTHROPIC_API_KEY` (платно) и не использует твой Claude Code seat.

## Связанные документы

- Все routines проекта: `docs/ROUTINES.md`
- Скилл: `.claude/commands/fbAnalyzer.md`
- Схема телеметрии: `docs/SESSION_TELEMETRY.md`
- Агент-решала: `docs/RESHALA.md`
- Безопасность: `docs/SAFE_MODE.md`
