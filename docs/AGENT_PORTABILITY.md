# Agent Portability — как читать скиллы Котика-Ботика не из Claude Code

> Скиллы в `.claude/commands/*.md` написаны для Claude Code и используют его MCP-биндинги (`mcp__github__*`, `mcp__3ed9b4d3-*`). Этот документ — карта соответствий, чтобы другой AI-агент (GPT, Gemini, локальная модель с tool-use) мог следовать тем же инструкциям, имея свой собственный набор инструментов.

## Концептуальная архитектура

Каждый скилл `.md` — это **операционная инструкция**: «что прочитать, что записать, в каком порядке». Инструкции абстрагируются от конкретных инструментов через три слоя:

1. **Read-операции** (получить данные) — нужен GitHub API, файловая система, Figma API
2. **Write-операции** (изменить состояние) — нужен GitHub API с auth, push в git, обновление Figma
3. **Identity-check** — нужно понимать кто запустил скилл (для разграничения прав)

## Таблица: MCP → generic API

### GitHub (используется во всех скиллах автоматизации)

| MCP-инструмент Claude Code | Generic операция | REST endpoint |
|---|---|---|
| `mcp__github__get_me` | Кто я (authenticated user) | `GET /user` |
| `mcp__github__get_file_contents` | Прочитать файл из репо на ветке | `GET /repos/{owner}/{repo}/contents/{path}?ref={branch}` |
| `mcp__github__create_or_update_file` | Записать/обновить файл (создаёт коммит) | `PUT /repos/{owner}/{repo}/contents/{path}` |
| `mcp__github__list_issues` | Список issues с фильтрами | `GET /repos/{owner}/{repo}/issues` (предпочтительно) или `GET /search/issues` |
| `mcp__github__issue_read` (method=`get`) | Прочитать issue | `GET /repos/{owner}/{repo}/issues/{issue_number}` |
| `mcp__github__issue_read` (method=`get_comments`) | Комментарии issue | `GET /repos/{owner}/{repo}/issues/{issue_number}/comments` |
| `mcp__github__issue_write` (method=`create`) | Создать issue | `POST /repos/{owner}/{repo}/issues` |
| `mcp__github__issue_write` (method=`update`) | Обновить issue (labels/body/state) | `PATCH /repos/{owner}/{repo}/issues/{issue_number}` |
| `mcp__github__add_issue_comment` | Добавить коммент | `POST /repos/{owner}/{repo}/issues/{issue_number}/comments` |
| `mcp__github__list_pull_requests` | Список PR'ов | `GET /repos/{owner}/{repo}/pulls` |
| `mcp__github__pull_request_read` (method=`get_files`) | Файлы PR'а | `GET /repos/{owner}/{repo}/pulls/{pull_number}/files` |
| `mcp__github__list_issue_reactions` | Реакции на issue/PR | `GET /repos/{owner}/{repo}/issues/{issue_number}/reactions` |
| `mcp__github__create_branch` | Создать ветку | `POST /repos/{owner}/{repo}/git/refs` |
| `mcp__github__create_pull_request` | Открыть PR | `POST /repos/{owner}/{repo}/pulls` |
| `mcp__github__pull_request_review_write` (event=`APPROVE`) | Approve review | `POST /repos/{owner}/{repo}/pulls/{pull_number}/reviews` |
| `mcp__github__merge_pull_request` | Замержить PR | `PUT /repos/{owner}/{repo}/pulls/{pull_number}/merge` |

**Аутентификация:** все вызовы — `Authorization: Bearer <GITHUB_TOKEN>`. Токен должен быть от `verygooddess` (или эквивалентного аккаунта с write-доступом к `kotik-botik/kotik-botik`).

> **Почему `/repos/.../issues`, а не `/search/issues`.** Search API имеет hard-cap 1000 результатов на запрос — даже с пагинацией. REST endpoint `/repos/{owner}/{repo}/issues` пагинируется без лимита через `gh api --paginate`. Подробности — комментарий в `tools/aggregate-sessions.py` (функция `fetch_issues`).

### Figma (используется в `/builder`, `/syncKeys`, `/parseProps`)

| MCP-инструмент Claude Code | Generic операция |
|---|---|
| `mcp__3ed9b4d3-*__use_figma` | Запуск JS-кода в Figma Plugin API |
| `mcp__3ed9b4d3-*__search_design_system` | Поиск компонента по имени в библиотеках |
| `mcp__3ed9b4d3-*__get_design_context` | Контекст конкретного node по fileKey + nodeId |
| `mcp__3ed9b4d3-*__get_metadata` | Метаданные файла |

> **Важно:** Figma операции в этом проекте идут **только** через MCP (Figma Plugin API). REST `api.figma.com` не используется. Для другого агента это значит: должен быть собственный bridge до Figma Plugin API (например, через свой плагин в Figma + WebSocket).

### Bash и файловые операции

Эти работают везде:

| Используется в | Что делает |
|---|---|
| `./tools/notify-telegram.sh` (через heredoc stdin) | Отправляет в Telegram |
| `bash tools/aggregate-sessions.py` | Агрегирует session-telemetry issues |
| `bash tools/verify-closed-skills.sh` | Проверка консистентности списка закрытых скиллов |
| `bash tests/smoke-telegram.sh` | Smoke-тесты |

Любой агент с shell-доступом и Python 3.11+ может их запускать.

## Identity-check (универсальная семантика)

Все закрытые скиллы (`/test`, `/syncKeys`, `/parseProps`, `/fbAnalyzer`, `/reshala`, `/autoMerge`, `/changelog` без аргумента) **первым шагом** проверяют:

```
authenticated_github_user == "verygooddess"
```

- В Claude Code это `mcp__github__get_me().login`
- В generic-агенте: `GET /user → response.login`

Если не совпадает — **тихий выход** (exit 0, ничего в stdout/stderr). Никаких сообщений пользователю.

## Что нужно generic-агенту, чтобы прогнать скилл

Минимальный набор:

1. **GitHub API** с токеном `verygooddess`-уровня (issue/PR/branch write)
2. **Bash** + **Python 3.11+** в окружении (для helper-скриптов)
3. **Figma Plugin API bridge** — только если запускать `/builder`/`/syncKeys`/`/parseProps`
4. **Telegram Bot Token + chat_id** в env-переменных (`TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`) — иначе helper тихо no-op'ит
5. **LLM с tool-use** который умеет читать markdown-инструкции и вызывать инструменты по описанию

## Что Claude Code добавляет сверху

Концепты, которых нет у generic-агентов:

| Концепт | Что это в Claude Code | Эквивалент для других |
|---|---|---|
| **Routine** | scheduled prompt в claude.ai/code/routines | cron + LLM API call |
| **SessionStart hook** | shell-команда в `.claude/settings.json` | startup-скрипт |
| **Skill `/builder`** | загружается из `.claude/commands/builder.md` | LLM читает .md как system prompt |
| **MCP-namespace** (`mcp__github__*`) | биндинг к GitHub-MCP server'у | прямой REST-вызов |

## Чего НЕ хватает для полной portability

Текущее состояние скиллов:
- ✅ Bash/Python helpers (`tools/`) — портабельны
- ✅ Identity-check логика — описана семантически
- ⚠️ MCP tool refs — указаны явно (`mcp__github__issue_write`), агент должен сам мапить
- ⚠️ Бизнес-логика — описана на русском, понятна любому LLM с RU-pretrain
- ❌ Routine/SessionStart — Claude-Code-specific, нужны эквиваленты

**Реалистичная оценка:** generic-агент с GitHub API tool и доступом к этому документу сможет выполнить **большинство** скиллов автоматизации (`/fbAnalyzer`, `/reshala`, `/autoMerge`, `/changelog`). `/builder`/`/syncKeys`/`/parseProps` требуют дополнительно Figma bridge.

## TODO для полной agent-agnostic версии

Если решим довести до конца — отдельная задача:
- Заменить все `mcp__github__*` в скиллах на ссылки на эту таблицу (или на generic-имена)
- Вынести Figma-specifics в отдельный слой
- Документировать schedule-абстракцию (Routine vs cron)

Issue для этой задачи будет заведён отдельно.
