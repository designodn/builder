# Котик-Ботик

> AI-агент-помощник дизайнеров, живущий в этом репозитории. Помогает собирать макеты в Figma из компонентов дизайн-системы и автоматизирует триаж/мелкие фиксы.

## Что умеет

### Для дизайнера

- **Собирает макеты в Figma** из реальных компонентов дизайн-системы. Дизайнер описывает флоу на русском → Котик строит CJM → рисует макет с реальными инстансами компонентов.
- **Принимает фидбэк** через `/fb` — баги, замечания, пожелания. Создаёт GitHub issues, дальше Настя разбирает.
- **Объясняет себя** через `/about` и `/changelog designer` — что нового и как пользоваться.

### Для Насти (мейнтейнера)

- **Триажит входящие issues** — приоритеты, дубли, агрегированный pinned digest, мгновенные Telegram-пинги на новые P0/P1.
- **Чинит опечатки сам** — `/reshala` открывает auto-fix PR'ы на typo в `.md` файлах. Настя ставит 👍, `/autoMerge` сливает вечером.
- **Собирает телеметрию сессий** — что строилось, что упало, сколько успешно. Агрегирует в `tests/sessions.jsonl` + `docs/LEADERBOARD.md` ежедневно.

Сейчас в реестре **7 библиотек** ДС (Base, Buttons & Tabs & Chips, Sheets & Modules & Wrappers, Cards & Cells & Views, Inputs & Search, System, Numbers · Paddings · Corner Radius). Реестр обновляется через `/syncKeys`.

---

## Как открыть

Котик-Ботик живёт прямо в этом репозитории. Чтобы начать работать:

1. Зайди на [**claude.ai/code**](https://claude.ai/code) и открой репу `kotik-botik/kotik-botik`.
2. Котик сам поздоровается, расскажет про свои скиллы и предложит запустить `/builder`.

Всё работает в браузере — ничего скачивать, клонировать или ставить на компьютер не надо. Claude Code сам подтягивает проект в свою сессию и ходит по нему: читает компоненты дизайн-системы, правила, скиллы. Так удобнее — проект всегда свежий, не занимает место на диске, и нет риска забыть, где лежит локальная копия.

> Обычный веб-чат claude.ai не подходит — там нет инструментов для работы с Figma. Нужен именно **claude.ai/code**.

---

## Как это работает (для дизайнера)

```
Дизайнер описывает флоу
        ↓
Research Agent — задаёт уточняющие вопросы
        ↓ апрув
Эксперты по запросу — Analytics / Product / Experience (если нужно)
        ↓ апрув
CJM — текстовый маршрут пользователя
        ↓ апрув
Figma Implementer — рисует через подключение к Figma с реальными инстансами компонентов
        ↓
Готовый макет
```

Каждый шаг требует явного апрува дизайнера перед переходом к следующему. В конце — короткий pulse-опрос (понравилось / не понравилось / средне), результат уходит в session-telemetry для статистики.

Внутри Figma Implementer Котик автоматически проходит две internal-стадии (text-layout → json-layout) перед записью в Figma — это технические детали, дизайнер их не видит. Все роли — диалоговые (analytics / product / experience / cjm на шагах 4-5) и internal-стадии (text-layout / json-layout / figma-implementer на G-I1/G-I2/G-I3) — оформлены как Claude Code sub-agents в `.claude/agents/`. Также там живут вспомогательные `code-reviewer` (вызывается из `/autoMerge`) и `debugger` (на падающих тестах). Спека: https://code.claude.com/docs/en/sub-agents

---

## Архитектура автоматизаций

После `/builder` (или ручного `/fb`) в репо появляются issues — Котик их разбирает автоматически:

```
Дизайнер /builder или /fb
        │
        ├─→ session-telemetry issue (метрики сессии)
        └─→ auto:bug:* issue (если упал watchpoint)
                │
                │ каждый час
                ▼
        /fbAnalyzer routine
                ├─→ ставит priority:p0..p3, dup-of, triage:reviewed
                ├─→ обновляет pinned [triage] Digest
                ├─→ метит мелкие правки auto-fixable:typo
                └─→ на новых P0/P1 → агрегированный пинг в Telegram
                        │
                        ▼ каждый час (смещение)
                /reshala routine
                        ├─→ берёт одну auto-fixable:typo issue
                        ├─→ открывает auto-fix PR с минимальным diff'ом
                        ├─→ ставит на issue reshala:done
                        └─→ Telegram: «PR открыт, ждёт твоего 👍»
                                │
                                ▼ Настя ставит 👍 на body PR
                                │
                                ▼ раз в день в 21:00
                        /autoMerge routine
                                ├─→ hard-precheck (count, .md, allowlist, ≤10 строк)
                                ├─→ code-reviewer subagent на семантику
                                ├─→ при APPROVE → squash-merge
                                └─→ Telegram: вечерняя сводка
                                        │
                                        ▼ ежесуточно в 22:00 UTC
                                aggregate-sessions.yml workflow
                                        ├─→ tests/sessions.jsonl
                                        └─→ docs/LEADERBOARD.md
```

---

## Скиллы

### Для всех

| Скилл | Что делает |
|---|---|
| `/builder` | Полный пайплайн: бриф → CJM → макет в Figma |
| `/about` | Описание проекта: скиллы, агенты, реестр |
| `/connectFigmaMCP` | Проверка подключения к Figma |
| `/fb` | Зафиксировать баг/замечание → GitHub issue |
| `/update` | Подтянуть свежий main (fetch + reset) |
| `/changelog designer` | Что нового в инструменте — простым языком |
| `/changelog developer` | То же для разработчика |

### Только для Насти (Настя-only)

| Скилл | Что делает |
|---|---|
| `/test` | Quick / full прогон, метрики, баги |
| `/syncKeys` | Обновить реестр компонентов из Figma |
| `/parseProps` | Распарсить пропы и сгенерировать `.rule.json` |
| `/fbAnalyzer` | Триаж входящих issues (запускается routine'ом) |
| `/reshala` | Auto-fix PR для опечаток в `.md` |
| `/autoFixTech` | Auto-fix PR для технических багов (broken links, CI, `tools/*`, workflows) |
| `/autoMerge` | Вечерний мердж 👍-PR'ов |
| `/changelog` (без аргумента) | Записать новый блок в `CHANGELOG.md` |

> Подробности про доступы и identity-check — `CLAUDE.md` секция «[Канонический список закрытых скиллов](CLAUDE.md#canonical-closed-skills)». Drift-check: `tools/verify-closed-skills.sh`.

---

## Структура проекта

```
kotik-botik/
├── .claude/commands/                # Скиллы (.md инструкции)
│   ├── builder.md                   # /builder — пайплайн макета
│   ├── fb.md                        # /fb — баг-репорт от дизайнера
│   ├── fbAnalyzer.md                # /fbAnalyzer — триаж issues
│   ├── reshala.md                   # /reshala — auto-fix typo PRs
│   ├── autoMerge.md                 # /autoMerge — вечерний мердж
│   ├── changelog.md                 # /changelog — CHANGELOG
│   ├── ...                          # syncKeys, parseProps, test, ...
│   └── extensions/                  # Эксперты для /builder
│       ├── analytics.md
│       ├── product.md
│       └── experience.md
│
├── .github/
│   ├── workflows/
│   │   ├── aggregate-sessions.yml   # Ежедневный сбор телеметрии
│   │   ├── sync-labels.yml          # Лейблы из labels.yml
│   │   ├── smoke-tests.yml          # bash smoke + verify-closed-skills
│   │   ├── actionlint.yml           # Линтер workflow'ов
│   │   ├── changelog.yml            # Авто-CHANGELOG
│   │   └── journal.yml              # Дневной журнал коммитов
│   ├── labels.yml                   # Канонические лейблы
│   └── ISSUE_TEMPLATE/              # Шаблоны issues
│
├── registry/                        # Реестр компонентов ДС
│   ├── index.json                   # derived cache: name → [lib, key, type, tier, approved]
│   ├── libraries.json               # Manifest библиотек (id, fileKey, pages)
│   └── libraries/numbers-paddings/  # Переменные ДС (числа, паддинги, радиусы)
│
├── rules/components/
│   ├── ARCHITECTURE.md              # Семантика nestedProps + инварианты
│   ├── <slug>.rule.json             # Hot: Builder читает
│   └── <slug>.raw.json              # Cold: debug
│
├── tools/
│   ├── notify-telegram.sh           # Helper для Telegram (stdin → API)
│   ├── aggregate-sessions.py        # Daily aggregator
│   └── verify-closed-skills.sh      # Drift-check Настя-only списка
│
├── tests/
│   ├── sessions.jsonl               # Append-only история сессий (создаётся первым прогоном aggregate-sessions.yml)
│   ├── metrics.jsonl                # Метрики reshala/autoMerge
│   └── smoke-telegram.sh            # Smoke-тесты helper'а
│
├── docs/
│   ├── ROUTINES.md                  # Все cron-style автоматизации
│   ├── TRIAGE_SETUP.md              # Настройка triage + Telegram
│   ├── RESHALA.md                   # /reshala и /autoMerge
│   ├── RESHALA_SCOPE.md             # Allowlist/blocklist/limits
│   ├── SESSION_TELEMETRY.md         # Схема телеметрии
│   ├── LEADERBOARD.md               # Авто-обновляется
│   ├── AGENT_PORTABILITY.md         # MCP → REST translation
│   └── SAFE_MODE.md                 # Модель безопасности
│
└── CLAUDE.md                        # Инструкции для Claude Code
```

---

## Метрики и наблюдаемость

Откуда что собирается:

| Что | Где живёт | Чем агрегируется |
|---|---|---|
| Метрики сессии `/builder` | session-telemetry issue (JSON в body) | `tools/aggregate-sessions.py` → `tests/sessions.jsonl` + `docs/LEADERBOARD.md` (ежесуточно) |
| Auto-bugs от builder'а | auto:bug:* issue | `/fbAnalyzer` группирует и приоритизирует |
| Фидбэк дизайнера | designer-feedback issue (с категорией) | `/fbAnalyzer` триажит |
| Прогоны `/reshala` и `/autoMerge` | `tests/metrics.jsonl` (только при нетривиальной активности) | Видно прямо в файле `tests/metrics.jsonl` (по строке на прогон) |

Видимое тебе:

- **`docs/LEADERBOARD.md`** — счётчики по сессиям и компонентам (авто-обновляется `aggregate-sessions.yml`)
- **pinned `[triage] Digest`** issue — сводка триажа, обновляется `/fbAnalyzer`'ом
- **Telegram** — реал-тайм: P0/P1, открытые PR'ы, вечерние сводки

---

## Routines и расписание

3 routines в claude.ai/code/routines + 5 GitHub Actions workflow'ов. Список и инструкция настройки — **`docs/ROUTINES.md`**.

Минимальный интервал routine — 1 час (ограничение Anthropic). Расписание живёт в настройках самой routine на claude.ai/code, а не в коде репозитория — так его можно менять без коммитов.

---

## Права доступа

Identity-check автоматический по GitHub-аккаунту:

- **`starkhoney`** — полный доступ (Настя): редактирование, закрытые скиллы, мутирующие операции
- **Любой другой login** — Дизайнер, read-only: только генерация макетов, никаких правок репо

Защита трёхслойная:
1. GitHub Read-роль для Дизайнеров (push физически не пройдёт)
2. Identity-check внутри каждого закрытого скилла (тихий выход)
3. Правила в `CLAUDE.md` для UX в Claude Code сессии

Подробности — **`docs/SAFE_MODE.md`** и `CLAUDE.md`.

---

## Запустить как другой агент (не Claude Code)

Скиллы написаны для Claude Code и используют его MCP-биндинги. Перевод на generic-агент (GPT, Gemini, локальная модель с tool-use) — через translation-таблицу:

**`docs/AGENT_PORTABILITY.md`** — карта `mcp__github__*` → REST endpoint, identity-check семантика, что нужно подготовить generic-агенту.

Большинство автоматизаций (`/fbAnalyzer`, `/reshala`, `/autoMerge`, `/changelog`) переносимы при наличии GitHub API + Python/Bash. Скиллы с Figma (`/builder`, `/syncKeys`, `/parseProps`) требуют Figma Plugin API bridge.

---

## config.json

Используется только `/builder`-пайплайном для опциональных параметров.

```jsonc
{
  "claudeApiKey": "",       // не нужен в Claude Code, нужен для headless
  "figmaPlanKey": "organization::..."
}
```

`figmaToken` НЕ нужен — Figma идёт через MCP, не REST. Список fileKey библиотек берётся из `registry/libraries.json`.

`config.json` не коммитится в git — только `config.example.json`.

---

## Документация — куда смотреть

| Вопрос | Документ |
|---|---|
| Что делает каждый скилл | `.claude/commands/*.md` |
| Как настроить routines и Telegram | `docs/TRIAGE_SETUP.md`, `docs/ROUTINES.md` |
| Что чинит `/reshala` (scope) | `docs/RESHALA.md`, `docs/RESHALA_SCOPE.md` |
| Схема телеметрии сессий | `docs/SESSION_TELEMETRY.md` |
| Архитектура компонентов и `.rule.json` | `rules/components/ARCHITECTURE.md` |
| Как `/builder` ведёт себя в нестандартных случаях | `docs/BUILDER_GOTCHAS.md` |
| Как обновляется реестр и что в нём лежит | `docs/REGISTRY_PIPELINE.md` |
| Как устроены агенты внутри `/builder` | `docs/AGENT_ARCHITECTURE.md`, `docs/AGENT_ROLES.md`, `docs/AGENT_CONTRACTS.md` |
| Доступ дизайнера и identity-check | `docs/DESIGNER_ACCESS.md`, `docs/SAFE_MODE.md` |
| Перенос на другой агент (не Claude Code) | `docs/AGENT_PORTABILITY.md` |
| Экономия токенов в `/builder` | `docs/TOKEN_OPTIMIZATION.md` |
| Правила работы Котика | `CLAUDE.md` |
