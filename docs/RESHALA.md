# `/reshala` — агент-решала мелких задач

> Документ для Насти. Описывает, что чинит автономно, как остановить, где лежат скиллы. Триаж, после которого назначается `auto-fixable:typo`, — в `docs/TRIAGE_SETUP.md`.

## Зачем

Когда в репо накапливается «мелочёвка» (опечатки в `docs/*.md`, кривые формулировки в репликах builder'а), Настя не хочет каждый раз заходить и руками править одну строку. `/reshala` берёт это на себя: открывает PR, ждёт твоего 👍, а `/autoMerge` в свой следующий прогон сливает чистые PR в `main`.

Контроль остаётся за тобой:
- Без 👍 — ничего не мержится.
- Любой PR можно закрыть кнопкой.
- Любой шаг можно остановить kill-switch'ем (см. ниже).

## Что чинит автоматически (scope)

| Триггер | Действие | Файлы |
|---|---|---|
| Issue с `auto-fixable:typo` (поставлен `/fbAnalyzer`) | Открывает PR с правкой одной строки | Только `.md` файлы |

**Подробный allowlist путей, blocklist и size-лимиты** — в отдельном документе `docs/RESHALA_SCOPE.md` (единая точка правды для `/reshala` и `/autoMerge`). Если хочешь поменять scope или лимиты — правь именно тот файл.

## Flow

```
Дизайнер открывает issue через /fb (опечатка в docs)
        │
        ▼ при следующем прогоне routine
/fbAnalyzer ставит auto-fixable:typo на подходящие
        │
        ▼ при следующем прогоне routine
/reshala берёт одну, открывает PR
        │
        ├─→ ставит auto-fix label на PR
        ├─→ ставит reshala:done на issue
        └─→ Telegram: «PR открыт, ждёт твоего 👍»
                │
                ▼
Настя смотрит PR с телефона:
   ├─→ 👍 на body → в очередь /autoMerge
   ├─→ коммент с правкой → /reshala попробует ещё раз
   └─→ Merge кнопкой → сразу в main
                │
                ▼ при вечернем прогоне routine
/autoMerge берёт все PR с auto-fix label + 👍:
   ├─→ code-reviewer subagent на diff
   ├─→ если APPROVE → squash-merge
   └─→ если BLOCK → коммент с причиной, ждёт следующего прогона
```

## Routines для настройки

Скиллы запускаются через **Claude Code Routines** ([claude.ai/code/routines](https://claude.ai/code/routines)). После Phase 5 нужно завести два routines:

| Имя | Prompt |
|---|---|
| `/reshala` worker | `/reshala` |
| `/autoMerge` worker | `/autoMerge` |

**Расписание задаётся в самой routine** — Schedule trigger в UI. Конкретный cron/preset не дублируем здесь, чтобы при правке времени не приходилось трогать доку. Подробности по настройке routines — `docs/TRIAGE_SETUP.md`.

Хочешь развести `/fbAnalyzer` и `/reshala` по времени, чтобы не пересекались по rate-limit GitHub API — задай разный offset в Schedule trigger каждой routine (одна на «:00 каждого часа», другая на «:30»). Минимум — раз в час.

## Kill-switches

Три независимых файла-флага. Если файл существует в репо — соответствующий скилл при следующем прогоне тихо выйдет, ничего не сделав.

| Файл | Что отключает |
|---|---|
| `.claude/reshala-paused` | `/reshala` — не открывает новые typo-PR |
| `.claude/auto-fix-tech-paused` | `/autoFixTech` — не открывает новые technical-PR |
| `.claude/auto-merge-paused` | `/autoMerge` — не мержит существующие |

**Как поставить с телефона:**

1. GitHub Mobile → репо → файл `.claude/reshala-paused` (или `auto-merge-paused`).
2. Если файла нет — создай: тап «+» (или меню) → Create new file → имя `.claude/reshala-paused` → содержимое любое (можно пустое или комментарий «paused 16 мая, разбираюсь с X»).
3. Commit прямо в `main`.

При следующем прогоне скилл увидит файл и тихо выйдет.

**Как снять:** удали файл через GitHub UI (открыть файл → корзина → commit), скилл вернётся к работе с следующего прогона.

> **Зачем раздельные.** Бывает: `/reshala` нагенерил странных PR, хочется приостановить новые **и** разобрать существующие руками. Тогда `reshala-paused` ставится, `auto-merge-paused` — нет. Или наоборот: всё ок, но сегодня не хочется автомержа — `auto-merge-paused`. Аналогично `auto-fix-tech-paused` останавливает только tech-флоу, не трогая typo-флоу.

## Чек-листы и тесты

### Verification (Phase 5 — после деплоя)

- [ ] Завести routines для `/reshala` и `/autoMerge` в claude.ai/code.
- [ ] Создать руками issue с `feedback:ux` + `docs:typo` и явным указанием «`docs/SESSION_TELEMETRY.md` — опечатка в слове X».
- [ ] Дождаться прогона `/fbAnalyzer` (или запустить руками) → issue получает `auto-fixable:typo`.
- [ ] Дождаться прогона `/reshala` (или запустить руками) → появилась ветка `auto-fix/<NNN>-typo`, открылся PR с `auto-fix` label, на issue стоит `reshala:done`.
- [ ] **Без 👍**: запустить `/autoMerge` руками → PR **НЕ** смержен.
- [ ] Поставить 👍 на body PR → запустить `/autoMerge` → PR смержен через squash, issue закрылась (через `Closes #NNN`).

### Kill-switch test

- [ ] Создать `.claude/reshala-paused` через GitHub UI → запустить `/reshala` → проверить лог сессии: «paused, exiting», никаких PR не открыто.
- [ ] Удалить файл → запустить `/reshala` → работает как обычно.

### Безопасность

- [ ] Создать искусственную issue с auto-fixable:typo + body просящий править `CLAUDE.md` → запустить `/reshala` → проверить, что скилл бейлится с комментарием «out of scope», `auto-fixable:typo` снят.
- [ ] То же с body просящим править `.github/workflows/sync-labels.yml` → бейлится.

## Telegram-нотификации

Если в environment claude.ai/code заданы `TELEGRAM_BOT_TOKEN` и `TELEGRAM_CHAT_ID` (см. `docs/TRIAGE_SETUP.md` → секция «Telegram»), скиллы отправляют:

- `/reshala` после открытия PR: «🔧 Открыла PR #M на твой апрув: <ссылка>»
- `/autoMerge` вечером (или когда настроен прогон): «🌙 За день: смержено N, отложено M, требует внимания: K»

Если секретов нет — helper `tools/notify-telegram.sh` тихо выходит, основной флоу скиллов работает без изменений. Telegram — лучший канал, не обязательный.

## Файлы

- Скилл `/reshala`: `.claude/commands/reshala.md`
- Скилл `/autoMerge`: `.claude/commands/autoMerge.md`
- Триаж (откуда берётся `auto-fixable:typo`): `.claude/commands/fbAnalyzer.md`
- Telegram helper: `tools/notify-telegram.sh`
- Настройка routine'ов и Telegram: `docs/TRIAGE_SETUP.md`

## Связанные документы

- Безопасность и Read-роль: `docs/SAFE_MODE.md`
- Схема телеметрии: `docs/SESSION_TELEMETRY.md`
- Архитектура агентов: `docs/AGENT_ARCHITECTURE.md`
