# Reshala scope — что разрешено auto-fix'у

> Единая точка правды для allowlist'а, blocklist'а и size-лимитов скиллов `/reshala` и `/autoMerge`. Если хочешь поменять — правь этот файл, оба скилла подтянут изменения. Раньше эти настройки дублировались в `.claude/commands/reshala.md` и `autoMerge.md`, что приводило к drift'у (issue #74).

## Allowlist путей

Целевой файл правки **должен** матчиться одному из паттернов (нормализуй путь: убери `./`, leading `/`, отвергни любой сегмент `..`):

- `docs/<file>.md`
- `.claude/commands/<file>.md`
- `journal/<file>.md`
- `CHANGELOG.md` (ровно этот путь)

Если путь содержит `..`, абсолютный (`/etc/...`), или не подпадает ни под один паттерн — **bailout**, не читай файл вообще.

## Blocklist (даже если в allowlist — НЕ ТРОГАТЬ)

- `CLAUDE.md` — правила безопасности
- `docs/SAFE_MODE.md` — модель безопасности
- `docs/RESHALA_SCOPE.md` — этот файл (защита от self-edit)
- `.github/**` — CI/CD, templates, labels.yml
- `registry/**` — генерируется `/syncKeys`
- `rules/**` — генерируется `/parseProps`
- `tests/**` — генерируется тестами
- Любой файл с расширением **не** `.md`

## Размер-лимиты

| Параметр | Значение | Где применяется |
|---|---|---|
| `maxDiffLines` | **10** | `/autoMerge` Шаг 2.2: суммарный diff (additions + deletions) ≤ 10. Иначе hard-precheck BLOCK без вызова code-reviewer. |
| `maxFiles` | **1** | `/autoMerge` Шаг 2.2: изменённых файлов **ровно 1**. Иначе BLOCK. |
| `maxMessageBytes` | (Telegram-уровень) | См. `tools/notify-telegram.sh` — 4000 codepoint'ов после truncate. Не связан с reshala. |

Изменение лимитов: правь значения в таблице выше. Скилл при следующем прогоне их прочитает.

## Почему именно эти ограничения

- **maxDiffLines=10**: typo-фикс в одном слове даёт diff ≤ 4 строк (минус-плюс пара). 10 — c запасом на rewording коротких фраз. Больше — это уже не «опечатка», нужен человек.
- **maxFiles=1**: cross-file правки требуют semantic understanding (имя переменной поменялось в 3 местах). Auto-fix safe только в одиночном файле.
- **allowlist только `.md`**: `.json`/`.yml` сломаются от лишней точки, `.ts`/`.tsx` требуют type-check. `.md` — самый безопасный класс правок.

## Связанные документы

- `/reshala` skill: `.claude/commands/reshala.md`
- `/autoMerge` skill: `.claude/commands/autoMerge.md`
- Общая doc Reshala: `docs/RESHALA.md`
