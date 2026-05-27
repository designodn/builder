# /fbAnalyzer — разбор и приоритизация входящих issues

Скилл-триаж. Читает все open issues с дизайнерскими метками, группирует, дедупит между сессиями, ставит приоритеты, обновляет pinned digest, пингует Настю на новых P0/P1, классифицирует issues на `typo` / `technical` / `architect` для агентов-решал (`/reshala`, `/autoFixTech`) и ручного разбора Настей.

**Уровень доступа:** только Настя. Скилл начинается с identity-check и тихо выходит для Дизайнера. **Никогда** не плодит шума при запуске под не-Настей.

**Идемпотентность:** запускается многократно (routine по расписанию из claude.ai/code/routines, SessionStart hook, ручной вызов). Каждый запуск даёт одинаковый результат на тех же данных. Не дублирует labels, не повторяет пинги.

**Не путать с `/fb`:** `/fb` **создаёт** issue от дизайнера. `/fbAnalyzer` **разбирает** их пачкой.

---

## Шаг 1 — Identity-check

Вызови `mcp__github__get_me`, возьми `login`.

- Если `login == "starkhoney"` → уровень Настя, продолжай.
- Иначе → **тихо выйди**. Не выводи ничего дизайнеру. Если вызвалось из SessionStart hook или routine — просто прекрати работу, не пиши «доступ запрещён». Этот скилл невидим для Дизайнера.

При получении уровня Настя — GLaDOS-реплика **одна** перед серией мутаций (см. CLAUDE.md, секция «Личность GLaDOS»).

---

## Шаг 2 — Собрать issues

Вызови `mcp__github__list_issues`:

```
owner: "kotik-botik"
repo: "kotik-botik"
state: "open"
perPage: 100
```

Из ответа отбери issues, у которых среди labels есть **хотя бы один** из наших меток:

- `session-telemetry`
- `designer-feedback`
- любая `auto:bug:*`
- любая `agent:*`
- любая `feedback:*` (`feedback:ux`, `feedback:component-request`)
- любая `bug:*` (`bug:rule-incorrect`, `bug:builder-error`, `bug:registry-stale`, `bug:missing-rule`, `bug:import-failed`)
- любая `pulse:*` (для контекста, но они не идут в приоритизацию)

Игнорируй issues с label `triage:reviewed` — они уже разобраны и в текущем прогоне трогать не нужно (кроме случая, когда у них появились новые комменты с момента ревью; см. Шаг 5).

Для каждой issue извлеки:
- `number`, `title`, `body`, `user.login` (кто открыл), `labels[]`, `created_at`, `comments` count
- Из body — `designer_login` (через regex по строкам `Дизайнер:` или `@<login>`), `component`, `session_id` (если есть JSON-блок — парси его)
- Категорию — по доминирующему label (`bug:*` > `feedback:*` > `agent:*`, и т.д.)

---

## Шаг 2.5 — Extract divergences из rule_contributions[] (issue #265)

Цель — конвертировать real-session diagnostics из `_session.rule_contributions[]` в actionable GitHub issues. Без этого Builder reasoning gaps оставались в body session-telemetry issues и не попадали в трекеры — только через `/test --full` adversarial-mode прогоны.

**Размещение:** после Шаг 2 (issues собраны), до Шаг 3 (группировка). К моменту Шага 3 child issues уже существуют и попадают в общий приоритет/дедуп pipeline.

**Алгоритм:**

```
batch_cap = 30                       # защита от burst при первом прогоне после merge
created_in_this_run = 0

for each issue in collected[]:
  if "session-telemetry" not in issue.labels: continue
  if "<!-- fbAnalyzer-divergences-extracted -->" in issue.comments: continue  # идемпотентно

  session = extract_session_json(issue.body)
  if not session: continue                                                    # legacy / malformed → skip

  candidates = python3 tools/aggregate-sessions.py --divergence-candidates <session-json-file>
  # candidates[] из compute_divergence_issues() — list of {
  #   dedup_key, session_id, slug, slotProp, path, type,
  #   divergence_step, label, hint, contrib
  # }

  created_children = []
  for c in candidates:
    if created_in_this_run >= batch_cap: break              # batch-cap, остальное в следующем routine-тике

    # Cross-session dedup через GitHub search (mcp__github__search_issues):
    #   query = `repo:kotik-botik/kotik-botik label:<c.label> is:issue
    #            "dedup-key: <c.dedup_key>" in:body`
    # Если хоть один hit — это уже создавалось, skip.
    existing = github_search(label=c.label, body_contains=f"dedup-key: {c.dedup_key}")
    if existing: continue

    child = github_create_issue(
      title=f"[auto] {c.type} в {c.slug}.{c.slotProp} ({c.divergence_step or 'structural-gap'})",
      labels=[c.label, "auto:bug:" + ("structural-gap" if c.type=="structural-gap" else c.type), "session-telemetry"],
      body=format_child_body(parent=issue.number, c=c)
    )
    created_children.append(child.number)
    created_in_this_run += 1

  if created_children:
    github_add_comment(issue.number, format_marker_comment(created_children))
```

**Формат `format_child_body(parent, c)`:**

```markdown
**Источник:** session-telemetry #<parent>
**Дизайнер:** @<login>
**Компонент:** <c.slug>
**Slot:** <c.slotProp> (path: <c.path>)
**Тип:** <c.divergence_step or "structural-gap">

**Запись из rule_contributions:**
\`\`\`json
{... весь c.contrib object ...}
\`\`\`

<!-- fbAnalyzer-child-of: #<parent> -->
<!-- dedup-key: <c.dedup_key> -->
```

**Формат `format_marker_comment(created_children)`:**

```
<!-- fbAnalyzer-divergences-extracted -->
Извлечено N divergence/structural-gap → #A, #B, #C.
```

**Что НЕ делает Шаг 2.5:**
- НЕ создаёт issue с `type: "usage-hint"` — только digest summary (см. Шаг 6).
- НЕ обрабатывает legacy session-telemetry без `_session` JSON-блока (skip + log).
- НЕ делает retroactive backfill всех старых issues — батч-cap 30 естественно throttle'ит первый прогон после merge, остальные подхватываются следующим routine-тиком.
- НЕ пингует Telegram per-child — child issues получают priority через Шаг 4, попадают в стандартный Telegram-сбор Шаг 7.2.

**Связь с другими шагами:**
- Создаваемые child issues имеют label `session-telemetry` + `auto:bug:divergence-*` / `auto:bug:structural-gap` — попадают в Шаг 3 группировки.
- Шаг 4 ставит priority по существующим правилам (`auto:bug:*` единичный → P1).
- Шаг 7.2 Telegram-ping подхватит автоматом в bucket `bug-manual`.

---

## Шаг 3 — Группировка и дедуп между сессиями

Внутри `/builder` дедуп уже работает на уровне одного `session_id`. Здесь — кросс-сессионный дедуп.

### auto:bug:*

Ключ группировки: `<watchpoint_type> + <component>`. Например:
- `auto:bug:import-failed` + `Button/Primary` — одна группа
- `auto:bug:import-failed` + `Header/Default` — другая

Внутри группы: считай уникальных `designer_login`, общее число issues, временной разброс.

### bug:rule-incorrect / bug:builder-error

Ключ: `component`. Объединяй issues, относящиеся к одному компоненту.

### feedback:component-request

Ключ: нормализованное имя запрошенного компонента (lowercase, trim, заменить пробелы на дефисы). «Звёздный рейтинг», «star rating», «звезды» — желательно слить вручную или хотя бы пометить как близких кандидатов. Если не уверен — оставь как есть.

### feedback:ux

В дедуп не идёт. Каждый — отдельный.

### agent:*

Ключ: `role` (research/analytics/product/experience/implementer). Считай распределение `tone` (negative/positive/mixed/neutral) по последним 30 дням. Если у одной роли > 50% negative — это сигнал, попадает в digest отдельной секцией.

### Что делать с дублями

Не закрывай дубли — это право Насти. Вместо этого:
- К дублю добавь label `dup-of:#NNN`, где `NNN` — номер первой (старшей) issue группы.
- Если label `dup-of:#NNN` уже есть на issue — не пересоздавай.
- В коммент к первой issue добавь ссылку на новый дубль, **только если** ссылки ещё нет в её комментах.

---

## Шаг 4 — Приоритизация

Каждая issue получает ровно один label из `priority:p0..p3`. Правила:

| Priority | Условие |
|---|---|
| `priority:p0` | `auto:bug:*` ИЛИ `bug:builder-error` повторился у **≥2 уникальных дизайнеров** за последние 7 дней (по группе). Builder сломан, нужно срочно. |
| `priority:p1` | Та же ошибка у **1 дизайнера ≥3 раз** за 7 дней (по группе) ИЛИ `auto:bug:*` единичный (1 раз, 1 дизайнер). Не блокер, но серьёзно. |
| `priority:p2` | Одиночный `bug:rule-incorrect`/`bug:builder-error`, `agent:<role>` с negative tone, `feedback:component-request` с ≥3 голосами/упоминаниями. |
| `priority:p3` | Всё остальное: одиночные `feedback:ux`, нейтральные agent-фидбэки, единичные component-requests. |

**Pulse-данные и agent-mood в формулу приоритета НЕ входят** — они только информационные для digest. Не повышай и не понижай приоритет по пульсу.

**Применение:**
- Для каждой не-`triage:reviewed` issue определи приоритет.
- Если у issue уже стоит **тот же** `priority:*` label — не трогай.
- Если стоит **другой** `priority:*` — **не перевыставляй автоматически**. Запомни конфликт, упомяни в digest секцией «Конфликты приоритетов: Настя проверь #N — было p2, перерасчёт даёт p1». Право финального решения у Насти.
- Если приоритета вообще нет — поставь рассчитанный через `mcp__github__issue_write` (operation `update`, поле `labels` — массив-объединение существующих лейблов + нового `priority:p<N>`). **Никогда не передавай labels списком только из новых** — это перетрёт все остальные. Всегда «текущие + дельта».
- Перед каждой записью проверяй, что нужного label-а ещё нет на issue (через `mcp__github__issue_read`), чтобы не плодить лишние write-операции.

---

## Шаг 5 — Классификация: typo / technical / architect

Каждая issue получает **не более одного** classification-label из трёх:

| Label | Что попадает | Кто решает |
|---|---|---|
| `auto-fixable:typo` | опечатки/грамматика в `.md` | `/reshala` |
| `auto-fixable:technical` | технические баги: CI-фейлы, broken links, устаревшие version refs, фиксы в `tools/*.sh`/`*.py`, простые правки `.github/workflows/*.yml`, точечные правки `tests/*.sh`/`*.py` | `/autoFixTech` |
| `needs-architect` | новые компоненты, изменения `registry/**`/`rules/**`, изменения label-taxonomy, новые скиллы, концептуальные/архитектурные вопросы | Настя (Telegram-пинг + reply-коммент) |

Если ни один критерий не сработал — **не вешай classification-label**. Issue остаётся в очереди на разбор Насти руками (приоритет уже выставлен в Шаге 4).

### Precedence — порядок проверки и резолюция конфликтов

Критерии пересекаются (например, broken link в `.md` подходит и под `typo`, и под `technical`; `bug:rule-incorrect` ссылается на `rules/`, что формально триггерит признак architect). Чтобы классификация была детерминированной, проверяй категории **строго в этом порядке** и останавливайся на первом совпадении:

1. **`auto-fixable:typo`** (5.1) — самый узкий и безопасный класс. Если все три критерия 5.1 выполнены — ставь label и стопай, к 5.2/5.3 не переходи.
2. **`auto-fixable:technical`** (5.2) — если 5.1 не сработал. Тоже все три критерия должны выполниться. Сработало — стоп.
3. **`needs-architect`** (5.3) — если 5.1 и 5.2 не сработали. Хотя бы один признак.

Если ни один из трёх блоков не сработал → label не ставится.

Идемпотентность: если у issue уже стоит один из трёх classification-label'ов — не пересчитывай, не перевешивай. Право финального решения у Насти. Конфликт типа «было `needs-architect`, перерасчёт даёт `auto-fixable:technical`» в digest не выносим (в отличие от приоритетов) — это слишком много шума.

### 5.1. `auto-fixable:typo` — критерии

Все три должны выполняться:

- Label `feedback:ux` ИЛИ `designer-feedback` без других bug-категорий.
- В body или title упомянуты ключевые слова: `опечатк`, `typo`, `грамматик`, `орфограф`, `точка`, `запятая`, `пропущен` + указан конкретный путь к `.md`-файлу из `docs/` или `.claude/commands/`.
- Целевой файл проходит scope-проверку `docs/RESHALA_SCOPE.md` (allowlist + blocklist).

Дополнительно ставь label `docs:typo`, если правка касается именно `docs/*.md`. Если правки касаются `.claude/commands/*.md` — только `auto-fixable:typo`.

### 5.2. `auto-fixable:technical` — критерии

Все три должны выполняться:

- Label `bug:*` ИЛИ `auto:bug:*` ИЛИ `feedback:ux` с явным техническим характером (CI-фейл, broken link, устаревший version ref, поломанный helper-скрипт).
- В body или title явно указан **тип проблемы и целевой файл**: `tools/<file>.sh`, `tools/<file>.py`, `.github/workflows/<file>.yml`, `tests/<file>.sh`, `tests/<file>.py`, либо broken link на конкретную страницу в `.md`. Без явного пути → не классифицируем (попадает к Насте).
- Целевой файл проходит scope-проверку `docs/AUTOFIX_SCOPE.md` (если файла нет — `/autoFixTech` ещё не задеплоен, пропусти классификацию; PR с этим файлом приедет вместе с самим скиллом).

Дополнительно: scope-блок `<!-- autofixtech-scope -->` в body (см. 5.4) — обязателен для `/autoFixTech`, иначе он бейлится. Без однозначных `replace`/`with` (или `apply`-инструкции для не-текстовой правки) **не пиши блок** — пусть Настя посмотрит сама.

### 5.3. `needs-architect` — критерии и reply-коммент

Хотя бы один признак:

- Label `feedback:component-request` (запрос нового компонента в библиотеку).
- В body / title явно формулируется **структурное изменение** одного из защищённых файлов / директорий: добавить новый файл в `registry/**`, `rules/**`, `.claude/commands/**`, изменить таксономию в `.github/labels.yml`, новый скилл / новая роль, правки в `CLAUDE.md`, `docs/SAFE_MODE.md`, `docs/RESHALA_SCOPE.md`, `docs/AUTOFIX_SCOPE.md`. Просто **упоминание** пути (например, `bug:rule-incorrect` со ссылкой на `rules/components/button.rule.json`) — **не** триггер; нужна явная просьба поменять структуру, а не починить существующий контент.
- В body / title явно сформулирован концептуальный вопрос («как лучше», «стоит ли», «как разделить») без конкретного файла и однозначного fix-а.

Если хотя бы один признак сработал — поставь `needs-architect`. **Параллельно** оставь reply-коммент на issue с маркером `<!-- fbAnalyzer-architect-summary -->`, в котором за **1–2 предложения** опиши «о чём проблема». Цель — Настя в Telegram-сводке увидит ссылку и сразу поймёт суть, не открывая issue:

```
<!-- fbAnalyzer-architect-summary -->
@starkhoney — needs-architect. Суть: <1–2 предложения, что именно требует архитектурного решения>.
```

Идемпотентность: если в комментах уже есть `<!-- fbAnalyzer-architect-summary -->` — не дублируй и **не добавляй issue в in-memory список** (см. ниже). Если label `needs-architect` уже стоит, но коммента нет (старая issue с ручной разметкой Настей) — допиши коммент для консистентности, но **в in-memory список новизны не клади**: это backfill миграции, не сигнал для Telegram. Различай: «коммент добавил только что для свежеклассифицированной issue» vs «коммент добавил как backfill старой ручной разметке».

**Tracking новизны для Telegram (Шаг 7.2):** держи in-memory список `_architect_new[]` — туда добавляй **только** те issues, для которых в **этом прогоне** одновременно: (а) ты только что навесил label `needs-architect` через `issue_write`, **и** (б) ты только что добавил коммент с маркером `<!-- fbAnalyzer-architect-summary -->`. Если хотя бы одно из двух — backfill (label или коммент уже стояли) — в список **не клади**. Telegram в 7.2 итерируется именно по этому списку, не по маркеру в комментах.

### 5.4. Дописать structured scope-блок в body (для `/reshala` и `/autoFixTech`)

**Параллельно с label `auto-fixable:typo`** — допиши в **конец body issue** структурированный блок, который `/reshala` потом прочитает детерминированно (без regex'ов):

```markdown
<!-- reshala-scope -->
path: <docs/SESSION_TELEMETRY.md или другой путь, ровно как указан дизайнером>
replace: "<строка-до>"
with: "<строка-после>"
<!-- /reshala-scope -->
```

- `path` — нормализованный путь (см. `RESHALA_SCOPE.md`)
- `replace` — точная строка, которую надо заменить (в одинарных кавычках, экранируй `"` → `\"`)
- `with` — точная строка, на которую заменить

Если ты сама не можешь однозначно извлечь `replace`/`with` из описания дизайнера — **не пиши блок**. `/reshala` без блока бейлится с просьбой уточнить — это OK. Лучше не догадаться, чем подсунуть неверный auto-fix.

**Негативный пример** (не пиши блок):
> «где-то в SESSION_TELEMETRY опечатка в слове трафика»

— непонятно, где именно «где-то», и каким должно быть верное написание. Bailout.

**Позитивный пример** (пиши блок):
> «`docs/SESSION_TELEMETRY.md` строка 42, «трафика» → «телеметрии»»

— `path`, `replace`, `with` все явные. OK.

Запись body — **прочитай body заново** через `mcp__github__issue_read` (не используй кэш из Шага 2 — мог быть отредактирован дизайнером за время прогона), затем `issue_write` operation `update`, body = `<свежий existing> + "\n\n<scope-block>"`.

Идемпотентность: если блок `<!-- reshala-scope -->` уже есть в body — не дублируй.

**Параллельно с label `auto-fixable:technical`** — допиши аналогичный блок с маркером `<!-- autofixtech-scope -->`. Формат тот же (`path`, `replace`, `with`), плюс опциональная альтернатива для не-текстовых правок (например, замена version pin в `.yml`):

```markdown
<!-- autofixtech-scope -->
path: <tools/foo.sh или .github/workflows/bar.yml>
replace: "<строка-до>"
with: "<строка-после>"
<!-- /autofixtech-scope -->
```

Если правка не однозначна (нет явного `replace`/`with`) — блок не пиши, `/autoFixTech` сам бейлится с просьбой уточнить. Идемпотентность: если блок `<!-- autofixtech-scope -->` уже есть — не дублируй.

---

## Шаг 6 — Pinned digest

Найди существующий pinned issue с label `triage:digest`. Если нет — выполни **миграцию для legacy digest'ов**: ищи issue, у которой одновременно (1) title **ровно** `[triage] Digest` И (2) label `session-telemetry`. Только при совпадении **обоих условий** замени label на `triage:digest`. Title-only без `session-telemetry` — не трогай (это чужой issue).

Если и legacy digest не нашёлся — создай новый через `mcp__github__issue_write`:

```
operation: "create"
title: "[triage] Digest"
labels: ["triage:digest"]
body: <см. шаблон ниже>
```

После создания запомни номер. Для следующих прогонов — ищи по label `triage:digest` (один на репо).

### Шаблон body digest

```markdown
# Triage digest

_Обновлено: <ISO timestamp> · /fbAnalyzer_

## Сводка

| Priority | Count | Топ-категория |
|---|---|---|
| P0 | <N> | <type> |
| P1 | <N> | <type> |
| P2 | <N> | <type> |
| P3 | <N> | <type> |

## Новое с прошлого прогона

- #NNN · P0 · auto:bug:import-failed · Button/Primary · 3 дизайнера за 2ч
- #MMM · P1 · feedback:ux · «непонятный пульс»
- ...

## Auto-fixable / Typo (для /reshala)

- #PPP · docs:typo · `docs/REGISTRY_PIPELINE.md` — опечатка
- ...

## Auto-fixable / Technical (для /autoFixTech)

- #QQQ · `tools/notify-telegram.sh` — broken curl-флаг
- ...
<если категория пуста: «—»>

## Архитектурные (требуют тебя)

- #RRR · «суть за 1-2 предложения» · <ссылка на reply-коммент с summary>
- ...
<если категория пуста: «—»>

## Pulse за последние 7 дней

- positive: <N> · negative: <N> · mixed: <N> · neutral: <N> · skipped: <N>
- Negative-сигналы (топ-3 по упоминанию): «слот не свапнулся», «текст не влез», ...

## Agent feedback за 7 дней

- research: positive <N> / negative <N>
- analytics: positive <N> / negative <N>
- product: positive <N> / negative <N>
- experience: positive <N> / negative <N>
- implementer: positive <N> / negative <N>

## Personal thanks drift (7 дней)

<вывод `python3 tools/aggregate-sessions.py --drift-summary 7`>

## Вклады дизайнеров в правила (7 дней)

<вывод `python3 tools/aggregate-sessions.py --rule-contributions 7`>

## Конфликты приоритетов

<если есть — список «#N было p2, пересчёт даёт p1, проверь»>
<иначе: «—»>
```

**Personal thanks drift** — выполни через `Bash`-tool команду `python3 tools/aggregate-sessions.py --drift-summary 7`, скопируй stdout как есть в секцию. 3-4 строки в стиле списка. Запомни, есть ли в выводе `⚠️` — пригодится в Шаге 7.2.

Fallback: если `tests/sessions.jsonl` не существует, `python3` недоступен, или команда падает — в секцию **«Personal thanks drift»** выведи строку `_За последние 7 дней сессий нет._` и продолжай. Не блокер.

**Rule contributions** — выполни через `Bash`-tool команду `python3 tools/aggregate-sessions.py --rule-contributions 7`, скопируй stdout как есть в секцию. Helper сам читает `tests/sessions.jsonl`, группирует по slug, фильтрует `hint="<no contribution>"`, помечает компоненты с ≥2 разными дизайнерами как 🔥-кандидаты приоритизации.

Fallback: если за 7 дней вкладов не было — helper сам выведет `«—»`. Если `tests/sessions.jsonl` не существует, `python3` недоступен или команда падает — в секцию **«Вклады дизайнеров в правила»** выведи `«—»` руками и продолжай. Не блокер.

Если digest уже существует — обнови **body** через MCP (update operation). Старое содержимое не сохраняется — каждый прогон полностью пересоздаёт body. Это нормально, история комментов остаётся.

---

## Шаг 7 — Пинг на новые P0/P1

«Новый» = appears in this run for the first time. Чтобы это отследить идемпотентно:

### 7.1. Per-issue mention (как было)

- Для каждой P0/P1 issue: посмотри её **комменты** через `mcp__github__issue_read` (или соответствующий read-tool).
- Если в комментах **уже есть** HTML-маркер `<!-- fbAnalyzer-ping -->` (мы его сами вставляем в коммент-пинг) — значит, пинг уже отправлен. **Не пингуй повторно**. Маркер невидим в UI, но надёжен: реплики Насти его не содержат, а опираться на текст «priority:p0» хрупко — Настя может его сама упомянуть в ответе.
- Если нет — добавь коммент через `mcp__github__add_issue_comment`:

  ```
  <!-- fbAnalyzer-ping -->
  @starkhoney — зафиксирован priority:<p0|p1>, повторов в группе: <N>, дизайнеров: <M>. Триаж: /fbAnalyzer.
  ```

  Этот mention остаётся per-issue, чтобы каждая issue имела свой trail в GitHub.

### 7.2. Telegram — один агрегированный пинг на весь прогон

**Не шли** Telegram per-issue — это UX-шум. Шли **одно** сообщение в конце прогона с разделением по приоритетам и подсекциям по типу.

**Сбор новизны в памяти в течение прогона** — для каждого приоритета (P0/P1/P2/P3) держи список новых issues, классифицированных по подтипу:
- **`bug-manual`** — issue с priority p0/p1/p2/p3, у которой в этом прогоне поставили priority, но **не** навесили ни `needs-architect`, ни `auto-fixable:*`. Это «требует ручного разбора Насти». **Собирается для всех P0–P3 намеренно** — Telegram даёт полную картину очереди, в отличие от Шага 7.1 (per-issue ping), который ограничен только P0/P1.
- **`arch-code`** — issue с новым лейблом `needs-architect` (см. 5.3), у которой основная работа — правки кода: скиллы в `.claude/commands/`, агенты в `agents/`, скрипты в `tools/*`, `tests/scripts/*`, документация `docs/*` (если не затрагивает rule-файлы).
- **`arch-rules`** — issue с новым лейблом `needs-architect`, у которой основная работа — правки в `rules/components/*.rule.json`, `rules/schema/*`, либо запрос нового компонента (см. 5.3). Если затрагивает и код, и rules — клади туда, где больший объём работы (примеры: schema-change + миграция 12 rule-файлов → `arch-rules`; рефакторинг Builder с попутной правкой одного schema-поля → `arch-code`; schema-only без миграции rule-файлов → `arch-rules`, поскольку источник изменения — rule-схема).
- **`autofix-reshala`** — issue с новым `auto-fixable:typo` в этом прогоне.
- **`autofix-tech`** — issue с новым `auto-fixable:technical` в этом прогоне.

В **самом конце прогона**, после Шагов 6 и 8, собери одно сообщение и отправь через helper.

**Формат — приоритет сверху, внутри подсекции:**

```bash
./tools/notify-telegram.sh <<'EOF'
📊 /fbAnalyzer · триаж завершён
Digest: https://github.com/kotik-botik/kotik-botik/issues/<digest-NNN>

🔴 P0 (<N>)
  🐛 Баги — нужно починить:
  - #<NNN> — <что не работает для дизайнера> (×<count>)
  🛠 Доработки в инструментах (Builder, скиллы):
  - #<NNN> — <что улучшится для дизайнера>
  📐 Доработки в библиотеке компонентов:
  - #<NNN> — <чего не хватает в правилах/компонентах>
  🤖 Закрою сама:
  - /autoFixTech: #<NNN> — <путь + суть правки>
  - /reshala: #<NNN> — <путь + суть правки>

🟡 P1 (<M>)
  ... те же подсекции ...

🟢 P2 (<K>)
  ... те же подсекции ...

⚪ P3 (<L>)
  ... те же подсекции ...
EOF
```

**Правила вывода:**

- **Приоритет печатается, только если в нём есть хотя бы один новый item в этом прогоне.** Пустые приоритеты не показываются.
- **Подсекция внутри приоритета печатается, только если в ней есть хотя бы один item.** Пустые подсекции не показываются.
- **Порядок подсекций фиксированный:** `🐛 Баги — нужно починить` → `🛠 Доработки в инструментах` → `📐 Доработки в библиотеке компонентов` → `🤖 Закрою сама`. Сначала то, что сломано, потом доработки, в конце — то, что бот возьмёт сам.
- **Иконки приоритетов:** 🔴 P0, 🟡 P1, 🟢 P2, ⚪ P3.

**Описание — на языке дизайнера, без техжаргона.** Это **не** копипаст из issue body (там Настя пишет техническим языком — `doc.tags`, `schema`, `AJV`, `intersection-фильтр`, `404`, `INSTANCE_SWAP`). Описание должно одной короткой фразой сказать **что меняется/ломается для дизайнера** при работе с Builder. Запрещены: имена полей schema, названия инструментов внутри `tools/*`, коды ошибок, MCP-термины, имена npm-пакетов, **имена rule-файлов** (`button.rule.json`, `skeleton-view.rule.json` — называй компонент по-человечески: «кнопка», «скелетон»), **Figma Plugin API имена** (`importComponentByKeyAsync`, `setProperties`, `findChild`, `findAllWithCriteria`), **CSS/layout-термины** (`auto-layout`, `constraints`, `padding`, `flex` — переформулируй: «вертикальный список», «отступы вокруг», «выравнивание»).

Хорошие примеры:
- 🐛 «#201 — Builder не может вставить кнопку «Primary» в макет, Figma не отдаёт компонент.»
- 🛠 «#147 — Builder выбирает много лишних компонентов под твой промт. Нужно научить выбирать точнее.»
- 📐 «#157 — Для скелетонов есть только базовые формы. Не хватает готовых ячеек/карточек из библиотеки.»
- 📐 «#146 — Avapicture (12 шт.): сейчас бейджи нельзя описать в правилах. Нужно расширить формат правил.»
- 🤖 «/reshala: #211 — опечатка в `docs/SESSION_TELEMETRY.md` — «трафика» → «телеметрии».»

Плохие примеры (так **не** писать):
- ❌ «#147 — рефакторинг поиска компонентов в Builder: новое поле `doc.tags`, intersection-фильтр.»
- ❌ «#146 — schema: decorator slot — INSTANCE_SWAP с фиксированным internal-helper.»
- ❌ «#201 — Builder валится на импорте Button/Primary: Figma отдаёт 404 на ключ.»
- ❌ «#157 — расширить preferred[] в `skeleton-view.rule.json`.» (имя rule-файла)
- ❌ «#X — `importComponentByKeyAsync` падает на устаревшем ключе.» (Figma API)
- ❌ «#X — у Builder сломан auto-layout в карточке.» (CSS-термин)

**Как формировать описание:**
1. Прочитай title и первый абзац body issue.
2. Сформулируй своими словами: «что не работает / чего не хватает / что улучшится» — с точки зрения дизайнера, который собирает макет.
3. Если нужно упомянуть компонент — называй его как в Figma («кнопка Primary», «скелетон»), а не по slug-у файла.
4. Длина — одно предложение, до ~120 символов.

Для `🤖 Закрою сама` правило другое — там описание техническое, но конкретное: указывай **префикс агента** (`/reshala:` или `/autoFixTech:`) и **что именно чиним** (путь к файлу + суть правки). Эта секция — для тебя, а не для дизайнера.

Частоту повторов добавляй как `(×<N>)` в конец строки, без слов «дизайнеров/повторов».

**Молчание (skip Telegram целиком)** — если ни одна из пяти корзин не получила новых items за прогон. Тихий прогон без новизны не требует нотификации.

**Исключение из молчания:** если в выводе `--drift-summary` (Шаг 6) есть `⚠️ Дрейф` — Telegram дёргается даже на тихом прогоне. В этом случае выводи **только** шапку и строку дрейфа, без подсекций приоритетов (даже если корзины частично заполнены — drift-сигнал отдельный режим):

```
📊 /fbAnalyzer · drift-сигнал
Digest: https://github.com/kotik-botik/kotik-botik/issues/<digest-NNN>

⚠️ Дрейф user_feedback_baseline_source: <значения>. Проверь builder.md / aggregate-sessions.py.
```

**Технические требования:**
- Heredoc с **quoted** delimiter (`<<'EOF'`) — защита от RCE через component/title-имена.
- Если helper вывел в stderr `notify-telegram: http_code=<N>` где N ≠ 200 — упомяни это в финальном отчёте Шага 9.
- Helper сам режет на 4096 символов (issue #77); если корзины большие — сообщение усечётся с маркером `[truncated]`, полные данные остаются в digest.

---

## Шаг 8 — Mark triage:reviewed

Каждой issue, которую сейчас разобрал (поставил priority, добавил dup-of, отметил auto-fixable, пингнул) — добавь label `triage:reviewed`.

В следующем прогоне `triage:reviewed` issues не трогаются (см. Шаг 2), кроме случая «появились новые комменты после ревью» — это покрывается тем, что pulse-данные и agent-feedback всегда берутся свежими в Шаге 6. Если Настя сама снимет `triage:reviewed` с какой-то issue — она опять попадёт в следующий разбор.

---

## Шаг 9 — Финальное сообщение

В ручном вызове (Настя сама запустила `/fbAnalyzer`) — короткий отчёт:

> «Разобрано N issues. P0: <count>, P1: <count>. Digest обновлён в #<digest-number>. Новых пингов: <count>.»

В авто-вызове (routine / SessionStart hook) — то же сообщение, оно попадёт в логи сессии в claude.ai/code. Настя при желании заглянет.

---

## Что НЕ делает скилл

- Не закрывает issues — это право Насти.
- Не редактирует body чужих issues (кроме pinned digest, который агент сам и создаёт).
- Не отвечает дизайнерам в их issues. Если ответ нужен — Настя ответит руками.
- Не правит код. Это работа агентов-решал (`/reshala` для опечаток, `/autoFixTech` для технических багов).
- Не запускает `/syncKeys`/`/parseProps`/`/test`. Эти — отдельные решения Насти.

---

## Заметки об ошибках

- Если `mcp__github__list_issues` упал — попробуй ещё раз через 30 секунд (один retry). Дальше — оставь сообщение «list_issues failed: <error>, пропускаю прогон» и выйди.
- Если у конкретной issue не получается выставить label — пропусти её, упомяни в digest «не удалось обновить #N: <error>». Не падай на остальные.
- Если pinned digest не находится / не создаётся — выведи отчёт в обычное сообщение и продолжай работу без digest. Это деградация, но не блокер.

---

## Связанные документы

- Схема телеметрии: `docs/SESSION_TELEMETRY.md`
- Настройка авто-запуска (routine + hook): `docs/TRIAGE_SETUP.md`
- Агент-решала: `docs/RESHALA.md`, `.claude/commands/reshala.md`
