# AutoFixTech scope — что разрешено технической авто-починке

> Единая точка правды для allowlist'а, blocklist'а и size-лимитов скиллов `/autoFixTech` и `/autoMerge` (для PR с label `auto-fix:technical`). Аналог `docs/RESHALA_SCOPE.md`, но для технических багов (CI-фейлы, broken links, фиксы в `tools/*`, точечные правки workflow'ов). Если хочешь поменять — правь этот файл, оба скилла подтянут изменения.

## Чем отличается от `RESHALA_SCOPE.md`

- `RESHALA_SCOPE` — только `.md` файлы, опечатки/грамматика, диф ≤ 10 строк.
- `AUTOFIX_SCOPE` — `.md` + helper-скрипты + workflows + тесты, технические фиксы, диф больше (но всё ещё точечный).

Разные scope-файлы — потому что blast radius разный: typo в `.md` ничего не сломает, ошибка в `tools/*.sh` или `.github/workflows/*.yml` может остановить CI или routine.

## Allowlist путей

Целевой файл правки **должен** матчиться одному из паттернов (нормализуй путь: убери `./`, leading `/`, отвергни любой сегмент `..`):

- `docs/<file>.md`
- `journal/<file>.md`
- `CHANGELOG.md` (ровно этот путь)
- `tools/<file>.sh`
- `tools/<file>.py`
- `tests/<file>.sh`
- `tests/<file>.py`
- `.github/workflows/<file>.yml`
- `.github/workflows/<file>.yaml`

Если путь содержит `..`, абсолютный (`/etc/...`), или не подпадает ни под один паттерн — **bailout**, не читай файл вообще.

## Blocklist (даже если в allowlist — НЕ ТРОГАТЬ)

> **Порядок проверки — fail-loud.** Сначала прогоняй blocklist (точный матч пути или glob-паттерн), и только если файл **не** заблокирован — проверяй allowlist. Не полагайся на «такой путь и так не в allowlist» — структура allowlist может расшириться, blocklist должен ловить explicit-но.

Security и self-protection:

- `CLAUDE.md` — правила безопасности
- `docs/SAFE_MODE.md` — модель безопасности
- `docs/RESHALA_SCOPE.md` — scope соседнего скилла
- `docs/AUTOFIX_SCOPE.md` — этот файл (защита от self-edit)

Архитектурные источники:

- `.github/labels.yml` — таксономия лейблов (трогать только через `needs-architect` ручную правку)
- `.github/ISSUE_TEMPLATE/**` — формат issues
- `registry/**` — генерируется `/syncKeys`
- `rules/**` — генерируется `/parseProps`

Логика агентов:

- `.claude/commands/**` — изменения архитектурные, идут через `needs-architect`. Допускается в `RESHALA_SCOPE` для typo в этих файлах, но в `AUTOFIX_SCOPE` — **запрещено** (technical fix в логике агента — это уже не «технический», это архитектурный).

Расширения вне allowlist: любые файлы вне явных паттернов выше.

## Размер-лимиты

| Параметр | Значение | Где применяется |
|---|---|---|
| `maxDiffLines` | **30** | `/autoMerge` Шаг 2.2: суммарный diff (additions + deletions) ≤ 30. Иначе hard-precheck BLOCK без вызова code-reviewer. |
| `maxFiles` | **2** | `/autoMerge` Шаг 2.2: изменённых файлов ≤ 2. Иначе BLOCK. |

Изменение лимитов: правь значения в таблице выше. Скилл при следующем прогоне их прочитает.

## Почему именно эти ограничения

- **maxDiffLines=30**: technical fix больше typo (broken-link replacement = 1 строка; устаревший version pin = 1-2 строки; bash-флаг в helper = 2-5 строк; рефакторинг логики ошибки = до 20-30). 30 — c запасом на полный re-write одной короткой функции, но не настолько большой, чтобы прятать архитектурное изменение.
- **maxFiles=2**: иногда technical fix требует синхронной правки в `tools/*.sh` + `tests/*.sh` (helper и его тест). Больше — это уже не точечная правка, нужен человек.
- **allowlist расширен относительно `RESHALA_SCOPE`**: `.sh`/`.py` нужны для helper-фиксов, `.yml` — для workflow-починки. `.ts`/`.tsx`/`.js` — **намеренно не входят**: type-check, требуют контекст, runtime-зависимости. Тоже как `RESHALA_SCOPE`.
- **Blocklist строже, чем `RESHALA_SCOPE`**: `.claude/commands/**` в blocklist для tech (логика агентов = архитектура). Зато tech разрешает `.github/workflows/*.yml`, что typo-flow запрещает.

## Связанные документы

- `/autoFixTech` skill: `.claude/commands/autoFixTech.md`
- `/autoMerge` skill (мержит и typo, и technical PR'ы): `.claude/commands/autoMerge.md`
- Соседний scope для typo: `docs/RESHALA_SCOPE.md`
- Классификация в триаже: `.claude/commands/fbAnalyzer.md` Шаг 5.2
