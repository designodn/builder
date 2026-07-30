# Safe Mode — как Builder защищён от случайных правок дизайнеров

Документ для Насти. Описывает, как устроен доступ дизайнеров и что **нельзя ломать**, чтобы защита продолжала работать.

## Архитектура защиты

Репозиторий `kotik-botik` живёт в organization `kotik-botik` на GitHub Free. Защита держится на одной простой идее:

> **Дизайнеры — Outside Collaborators с ролью Read.**

Read role означает: GitHub физически не пропускает push, edit, merge от этих пользователей. Никаких hooks, mirror'ов или дополнительных проверок не нужно — защита на уровне GitHub API.

## Как пригласить нового дизайнера

1. github.com/kotik-botik/kotik-botik → **Settings** → **Collaborators and teams** → **Add people**.
2. Ввести GitHub username → выбрать роль **Read**.
3. Отправить приглашение. Дизайнер примет из почты.
4. Отправить дизайнеру ссылку на `docs/DESIGNER_ACCESS.md`.

**Никогда не повышай роль до Triage, Write или выше.** Triage уже даёт право закрывать issues; Write даёт push. Защита сразу пропадает.

## Как удалить дизайнера

1. github.com/kotik-botik/kotik-botik → **Settings** → **Collaborators and teams** → рядом с именем — **Remove**.
2. Доступ пропадает мгновенно. Локальные клоны на машинах дизайнера остаются, но `git fetch/push` начнут возвращать 403.

## Где смотреть собранные баги

Все issues от дизайнеров с label `designer-feedback`:

https://github.com/kotik-botik/kotik-botik/issues?q=is%3Aissue+is%3Aopen+label%3Adesigner-feedback

Подкатегории:
- `bug:registry-stale`, `bug:missing-rule`, `bug:import-failed`, `bug:builder-error`, `bug:rule-incorrect` — баги.
- `feedback:ux`, `feedback:component-request` — обратная связь, не критично.

Триаж: раз в неделю (или после каждого pizza-test'а) пробегаешь свежие issues, важное переносишь во внутренние `tests/issues/agents.md` (A-NNN) или фиксишь сразу.

## Labels — как создать, если ещё нет

GitHub CLI (один раз):

```bash
gh label create designer-feedback --color FBCA04 --description "От дизайнера-тестировщика"
gh label create "bug:registry-stale" --color D93F0B --description "Реестр устарел"
gh label create "bug:missing-rule" --color D93F0B --description "Нет .rule.json"
gh label create "bug:import-failed" --color D93F0B --description "Figma вернула ошибку"
gh label create "bug:builder-error" --color D93F0B --description "Странное поведение Builder"
gh label create "bug:rule-incorrect" --color D93F0B --description "Правило плохое"
gh label create "feedback:ux" --color 0E8A16 --description "Обратная связь по флоу"
gh label create "feedback:component-request" --color 0E8A16 --description "Нужен новый компонент"
```

Или через UI: Issues → Labels → New label.

## Что НЕ делать

- ❌ Не повышать дизайнерам роль выше Read.
- ❌ Не добавлять дизайнеров как members организации (только Outside Collaborator). Members имеют дополнительные права на уровне org.
- ❌ Не выдавать дизайнерам доступ к Настиному GitHub-аккаунту (это и есть identity-check). На уровне Дизайнер защита от прямых правок репо двойная: GitHub Read + правила в CLAUDE.md. Уровень Настя получается автоматически по GitHub-логину `verygooddess` — см. раздел «Identity-check» ниже.
- ❌ Не убирать `/fb` или `/update` из разрешённого списка в CLAUDE.md — без них дизайнер не сможет сообщить о проблеме и не сможет подтянуть свежий main.

## Troubleshooting

### Дизайнер пишет: «Claude не может создать issue»

Проверь:
1. Дизайнер авторизован в Claude Code GitHub App (Settings → Integrations).
2. GitHub App видит репо `kotik-botik/kotik-botik` (Configure → выбрать репо).
3. Owner/repo в `.claude/commands/fb.md` хардкожен правильно (`kotik-botik`/`kotik-botik`).

### Дизайнер пишет: «git fetch не работает»

Проверь:
1. У дизайнера принято приглашение в репо (github.com → Notifications → Pending invitations).
2. SSH key или token дизайнера добавлен в его GitHub-аккаунт.
3. Remote URL правильный: `git remote -v` должен показывать `kotik-botik/kotik-botik`.

### Кто-то из дизайнеров получил Write по ошибке

Если случайно повысила роль:
1. Settings → Collaborators → Manage → понизить обратно на Read.
2. Проверь историю коммитов на main за период повышенной роли: `git log --since="<дата>" --author="<их email>"`.
3. Если есть нежелательные коммиты — revert или reset (на свежей ветке, не на main; PR; merge).

## Известные ограничения

- **На free organization нет Branch Protection для private repos.** Если когда-нибудь захочешь требовать code review на merge в main — это $4/user/month (GitHub Team plan). Сейчас защита держится только на Read role, и этого достаточно.
- **Дизайнер видит весь репо.** Включая `CLAUDE.md` с описанием identity-check. Но identity-check теперь — это просто проверка GitHub-логина (`verygooddess`), никаких секретных данных в репо нет, и хранить нечего. См. раздел «Identity-check» ниже.
- **На free organization лимит 2000 минут GitHub Actions / месяц.** Текущие workflow (`changelog.yml`, `journal.yml`) тратят минуты. Если упрёшься — Settings → Billing.

## Identity-check

Identity-check — это автоматическое определение уровня пользователя в Котике-Ботике. Никакого пароля, файла или env-переменной настраивать не нужно — хватает GitHub-аккаунта.

### Как работает

При первой попытке защищённого действия (Edit/Write/мутирующий git/закрытые скиллы) Котик-Ботик вызывает `mcp__github__get_me` и смотрит `login`:

- `login == "verygooddess"` → уровень = Настя, действие выполняется.
- Что-либо ещё или ошибка вызова → уровень = Дизайнер, действие отклоняется.

Результат кэшируется на сессию. На обратное переключение «Настя → Дизайнер» можно попросить вручную, для тестирования дизайнерского флоу. Подробнее — `CLAUDE.md`, раздел «Identity-check — как определяется уровень».

### Что делать, если уровень определился неправильно

1. **Меня определили как Дизайнера, а я Настя.** Проверь, что в Claude Code ты залогинена в GitHub под `verygooddess` (Settings → Integrations → GitHub). Перезапусти сессию, чтобы кэш сбросился.
2. **MCP не настроен / GitHub App нет доступа к репо.** Открой Claude Code → Settings → Integrations → GitHub → дай App доступ к `kotik-botik/kotik-botik`. Перезапусти сессию.
3. **Сменился GitHub username** (теоретически возможно). Поправь хардкод `verygooddess` в `CLAUDE.md` (раздел «Уровень 2 — Настя» и раздел «Identity-check») на новое имя, закоммить, обнови сессию. **Курицу-яйцо** обойди так: правку CLAUDE.md делай **в обход Claude Code** — обычным текстовым редактором, потом коммить из терминала. Если попробуешь редактировать через Claude Code, identity-check как раз и упрётся в старый хардкод и тебя не пустит. Дополнительно поправь хардкод в этом файле (`docs/SAFE_MODE.md`) — он встречается ещё в нескольких местах, грепни `verygooddess` по репо.

### Что осталось в git history

В коммитах до миграции на github-username `registry/libraries/numbers-paddings/meta.json` содержал поле `_buildStampHash` с хешем старого пароля, а ранние версии этого файла — упоминание старого пароля плайнтекстом. Эти артефакты больше ни от чего не защищают (механика identity-check сменилась — теперь это вообще не про пароль), но историю не переписываем: это сломало бы клоны коллабораторов. Если когда-нибудь захочется зачистить — отдельной задачей через `git filter-repo` с предупреждением.

## Откат всего этого

Если решишь, что эксперимент не пошёл, и хочешь вернуться к личному репо без дизайнеров:

1. Удалить всех Collaborators (Settings → Collaborators → Remove each).
2. Перенести репо обратно в личный аккаунт: Settings → Transfer ownership → `verygooddess`.
3. Удалить organization (если она не использовалась больше нигде): Organization settings → Delete this organization.

Все ссылки и история сохраняются.
