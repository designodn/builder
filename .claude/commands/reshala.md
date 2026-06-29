# /reshala — агент-решала мелких задач

> Берёт **одну** safe-задачу с label `auto-fixable:typo`, чинит её сам, открывает PR, проставляет issue `reshala:done`. Финальный мердж — отдельный скилл `/autoMerge` (или Настя руками).

## Когда вызывать

- Routine из claude.ai/code/routines — основной канал, расписание задаётся в самой routine.
- Вручную: Настя пишет `/reshala` в активной сессии.
- НЕ через SessionStart hook — `/reshala` мутирует код, лишний раз дёргать не надо.

## Шаг 0 — Identity-check

Первым делом: `mcp__github__get_me`. Если `login != "starkhoney"` — **тихий выход** без действий и сообщений. Дизайнерская сессия.

> **Порядок Шаг 0 → Шаг 1 — намеренный.** Identity-check идёт раньше kill-switch'а: `get_file_contents` для проверки `.claude/reshala-paused` — это уже работа в репо, она не должна выполняться для Дизайнерской сессии (даже read-only).

## Шаг 1 — Kill-switch

Проверь существование файла `.claude/reshala-paused` через `mcp__github__get_file_contents`. Если файл есть — **тихий выход** с пометкой в логах «paused, exiting». Настя ставит этот файл одной правкой через GitHub UI, когда хочет временно отключить автономию.

## Шаг 2 — Найти кандидата

Через `mcp__github__list_issues`:

- `state: "open"`
- `labels: ["auto-fixable:typo"]`

GitHub API возвращает issues по `labels` через AND-фильтр и **не умеет «без label X»** одним вызовом. Поэтому **отфильтруй результат руками** после получения:

1. Получи список через `list_issues`.
2. Для каждой issue проверь массив `labels[].name`. **Пропусти**, если есть `reshala:done` (уже обработана).
3. Дополнительно: **проверь, нет ли уже открытого `auto-fix` PR**, ссылающегося на эту issue. Через `mcp__github__list_pull_requests` (`state: "open"`, `labels: ["auto-fix"]`) — если в `body` PR'а есть `Closes #<NNN>` или `resolves #<NNN>` — issue уже в работе, пропусти её.
4. Возьми **одну оставшуюся** issue (самую старую — FIFO). Если кандидатов нет — выйди с коротким отчётом «нечего чинить».

**Почему по одной.** Серия правок в одном прогоне увеличивает риск каскадного фейла. Один прогон — один PR. Routine запускается по расписанию — за день успеем разобрать всё.

**Почему двойная проверка идемпотентности.** Label `reshala:done` мог не успеть проставиться при прошлом прогоне (упало после `create_pull_request`). Проверка открытых PR — defense-in-depth.

## Шаг 3 — Извлечь scope из issue

Сначала ищи структурированный блок (issue #72) в body:

```markdown
<!-- reshala-scope -->
path: <путь>
replace: "<строка-до>"
with: "<строка-после>"
<!-- /reshala-scope -->
```

Этот блок добавляется `/fbAnalyzer`'ом при проставлении `auto-fixable:typo` (см. fbAnalyzer.md Шаг 5.1). Если блок есть и валиден (все три поля присутствуют, `path` и `replace` непустые) — используй значения **напрямую**, никаких regex'ов.

### Fallback: regex (для legacy issues)

Если блока нет (старые issues, созданные до Phase 8) или поля невалидны — попробуй распарсить из текста:

- Путь: regex `docs/[^\s]+\.md`, `.claude/commands/[^\s]+\.md`, или в обратных кавычках.
- Что менять: паттерн `"<word>" → "<word>"`, «опечатка в слове X», прямая цитата.

### Bailout

Если ни structured-блок, ни regex не дали однозначной правки — **выйди без действий**, оставь коммент на issue:

```
<!-- reshala-bailout -->
Не смогла однозначно распарсить правку из описания. Уточни путь к файлу и что именно править (либо попроси Настю добавить блок <!-- reshala-scope --> через /fbAnalyzer), и я попробую ещё раз. Или сделай руками.
```

И сними label `auto-fixable:typo`.

## Шаг 4 — Allowlist + blocklist (КРИТИЧНО)

**Канонический список** allowlist'а, blocklist'а и лимитов — в `docs/RESHALA_SCOPE.md`. Прочитай этот файл через `mcp__github__get_file_contents` и применяй ровно те правила, что там описаны. Это единая точка правды — оба скилла (`/reshala` и `/autoMerge`) читают одно и то же, drift невозможен.

**Короткое резюме (полное — в `RESHALA_SCOPE.md`):**
- Целевой путь обязан попадать в allowlist (`docs/*.md`, `.claude/commands/*.md`, `journal/*.md`, `CHANGELOG.md`) **и НЕ попадать** в blocklist (`CLAUDE.md`, `docs/SAFE_MODE.md`, `.github/**`, `registry/**`, `rules/**`, `tests/**`).
- Нормализация пути: убери `./` и leading `/`, отвергни любой `..` сегмент или абсолютный путь.
- Allowlist по расширению: только `.md`.

### Bailout

Если правила scope не пройдены — оставь коммент на issue:

```
<!-- reshala-out-of-scope -->
Этот файл не в моём auto-fix scope (path: <X>). Передаю Насте — она поправит руками.
```

Сними label `auto-fixable:typo` через `mcp__github__issue_write` (operation `update`, labels = текущие минус `auto-fixable:typo`). Выйди без дальнейших действий.

## Шаг 5 — Применить правку

**GLaDOS-реплика** обязательна перед серией мутаций (одна на весь прогон).

1. Прочитай файл через `mcp__github__get_file_contents`.
2. Найди точку правки. Если не находится — баут как в Шаге 3.
3. Подготовь новое содержимое (одна правка, минимальный diff).
4. Создай ветку через `mcp__github__create_branch`:
   - name: `auto-fix/<issue-NNN>-typo`
   - from: `main`
5. Запиши файл через `mcp__github__create_or_update_file`:
   - branch: только что созданная
   - message: `fix(typo): <одна строка про правку> (resolves #NNN)`
   - content: новое содержимое
   - sha: текущий sha файла (из `get_file_contents`)

## Шаг 6 — Открыть PR

Через `mcp__github__create_pull_request`:

```
title: [auto-fix] typo · resolves #NNN
head: auto-fix/<issue-NNN>-typo
base: main
body:
```

Тело PR (template):

```markdown
## Что чинит

Closes #NNN.

## Diff

**Файл:** `<path>`

**Было:**
> <старая строка>

**Стало:**
> <новая строка>

## Почему safe

- Путь в allowlist (.md, не в blocklist).
- Минимальный diff — одна строка.
- Issue была помечена `auto-fixable:typo` после ревью `/fbAnalyzer`.

## Что дальше

- 👍 на body → попадёт в очередь `/autoMerge` в его следующий прогон.
- Коммент с правкой → я попробую ещё раз (откомментируй и сними `reshala:done` с issue).
- Merge руками — всегда доступно.

---

_Открыт автоматически скиллом `/reshala`. Не сам мерджу — жду 👍._
```

После создания:
- Поставь на PR label `auto-fix`.
- На issue (#NNN) поставь label `reshala:done`.
- Не закрывай issue сам — закрытие произойдёт автоматически при мерже PR через `Closes #NNN`.

## Шаг 7 — Telegram-нотификация

Сразу после успешного создания PR и проставления labels — отправь сообщение через helper. **Только heredoc, никогда argv** (динамические значения с `` ` ``/`$()` в title/пути привели бы к RCE в Bash):

```bash
./tools/notify-telegram.sh <<'EOF'
🔧 /reshala открыла PR #<M> на твой апрув:
https://github.com/kotik-botik/kotik-botik/pull/<M>
Issue: #<NNN>
Файл: <path>
EOF
```

Подставь конкретные значения в текст между `<<'EOF'` и `EOF` (heredoc с **quoted** delimiter не раскрывает переменные — это защита от RCE). Если в title/пути встречается строка `EOF` отдельной строкой — замени делимитер на `EOF_TG`.

Helper сам решает, отправлять ли (silent no-op если `TELEGRAM_BOT_TOKEN`/`TELEGRAM_CHAT_ID` не настроены, best-effort на сетевые ошибки). Если упал — основной флоу скилла **не блокируется**, GitHub-уведомление от mention в PR подхватит мобильное приложение. Если helper написал в stderr `notify-telegram: http_code=<N>` где N ≠ 200 — упомяни в финальном отчёте, чтобы Настя проверила токен.

## Шаг 8 — Отчёт + метрика

### 8.1. Отчёт в сессии

В конце прогона выведи короткий отчёт в обычное сообщение:

```
Прогон /reshala — <ISO timestamp>
Issue: #NNN «<title>»
PR: #M — <ссылка>
Файл: <path>
Статус: открыт, ждёт 👍
```

Если был тихий выход на одном из шагов — отчёт не нужен (routine не должен слать пустые сообщения).

### 8.2. Метрика в `tests/metrics.jsonl` (issue #73)

**Только при нетривиальной активности** (открыла PR, бейлилась, или приняла решение). Тихий выход «нечего чинить» — метрику НЕ пишем (иначе hourly routine плодит 24 шум-коммита в день).

Если активность была:
1. `mcp__github__get_file_contents` для `tests/metrics.jsonl` — получи текущее содержимое и sha. Если файл не существует (404) — sha=null, content=""
2. Подготовь новую строку JSON:

   ```jsonc
   {
     "skill": "reshala",
     "timestamp": "<ISO>",
     "outcome": "pr_opened" | "bailout_out_of_scope" | "bailout_parse_failed" | "bailout_branch_exists" | "no_candidates",
     "issue": <NNN или null>,
     "pr": <M или null>,
     "path": "<path или null>"
   }
   ```

3. `new_content = old_content + json_line + "\n"`
4. `mcp__github__create_or_update_file`:
   - branch: `main`
   - message: `chore(metrics): reshala <outcome>` (`[skip ci]` префикс **не нужен** — workflow'ы триггерятся только на свои paths)
   - content: новый
   - sha: текущий (или null если файла не было)

Если запись метрики упала — это **не блокер**, скилл уже сделал основную работу. Лог в отчёт «metrics write failed: <error>» и продолжай.

## Errors / partial failures

- **Ветка уже существует** (PR пытались открыть ранее, но что-то упало): не пересоздавай, прочитай существующий PR, проверь — если `closed` без мержа → удали ветку, открой заново; если `open` → ставь `reshala:done` на issue и выйди (PR уже в работе).
- **`create_or_update_file` упал** (404, sha conflict): попробуй ещё раз через `get_file_contents` за свежим sha. Не больше 2 ретраев.
- **`create_pull_request` упал**: оставь branch как есть, оставь коммент на issue «не смогла открыть PR, проверь руками», выйди.

## Что НЕ делает (важно)

- Не редактирует `CLAUDE.md`, `docs/SAFE_MODE.md`, workflows, registry, rules.
- Не закрывает issues руками (только через PR merge).
- Не мержит PR — это работа `/autoMerge`.
- Не вызывает себя рекурсивно — один прогон = один PR.
- Не правит код (`.ts`, `.tsx`, `.js`) — только `.md`.

## Связанные документы

- Документация: `docs/RESHALA.md`
- Триаж, после которого назначается `auto-fixable:typo`: `.claude/commands/fbAnalyzer.md`
- Авто-мердж: `.claude/commands/autoMerge.md`
- Настройка routine'ов: `docs/TRIAGE_SETUP.md`
