# /autoFixTech — агент-решала технических багов

> Берёт **одну** safe-задачу с label `auto-fixable:technical`, чинит её сам, открывает PR с label `auto-fix:technical`. Финальный мердж — `/autoMerge` (или Настя руками). Параллельный родственник `/reshala`: тот чинит typo в `.md`, этот — технические баги (CI-фейлы, broken links, фиксы в `tools/*`, точечные правки workflow'ов и тестов).

## Когда вызывать

- Routine из claude.ai/code/routines — основной канал, расписание в самой routine (offset разный от `/reshala`/`/fbAnalyzer`).
- Вручную: Настя пишет `/autoFixTech` в активной сессии.
- НЕ через SessionStart hook — `/autoFixTech` мутирует код.

## Шаг 0 — Identity-check

Первым делом: `mcp__github__get_me`. Если `login != "verygooddess"` — **тихий выход** без действий и сообщений.

> Порядок Шаг 0 → Шаг 1 — намеренный. Identity-check до kill-switch'а: `get_file_contents` не должен выполняться в Дизайнерской сессии.

## Шаг 1 — Kill-switch

Проверь существование файла `.claude/auto-fix-tech-paused` через `mcp__github__get_file_contents`. Если файл есть — **тихий выход** с пометкой в логах «paused, exiting». Раздельный kill-switch с `/reshala` и `/autoMerge`: можно временно остановить только tech-флоу, не трогая typo-флоу.

## Шаг 2 — Найти кандидата

Через `mcp__github__list_issues`:

- `state: "open"`
- `labels: ["auto-fixable:technical"]`

GitHub API возвращает issues по `labels` через AND-фильтр и **не умеет «без label X»** одним вызовом. Поэтому отфильтруй руками:

1. Получи список через `list_issues`.
2. Для каждой issue проверь `labels[].name`. **Пропусти**, если есть `reshala:done` или `auto-fix:technical-done` (на будущее, для идемпотентности — `/autoFixTech` ставит этот label сам, см. Шаг 6).
3. Дополнительно: **проверь, нет ли уже открытого `auto-fix:technical` PR**, ссылающегося на эту issue. Через `mcp__github__list_pull_requests` (`state: "open"`, `labels: ["auto-fix:technical"]`) — если в `body` PR'а есть `Closes #<NNN>` или `resolves #<NNN>` — issue уже в работе, пропусти.
4. Возьми **одну оставшуюся** issue (самую старую — FIFO). Если кандидатов нет — выйди с коротким отчётом «нечего чинить».

**Почему по одной.** Технический фикс рискованнее typo, серия в одном прогоне множит риск. Routine запускается по расписанию — за день успеем разобрать всё.

**Почему двойная проверка идемпотентности.** Label мог не успеть проставиться при прошлом прогоне. Проверка открытых PR — defense-in-depth.

## Шаг 3 — Извлечь scope из issue

Сначала ищи структурированный блок в body:

```markdown
<!-- autofixtech-scope -->
path: <путь>
replace: "<строка-до>"
with: "<строка-после>"
<!-- /autofixtech-scope -->
```

Этот блок добавляется `/fbAnalyzer`'ом при проставлении `auto-fixable:technical` (см. fbAnalyzer.md Шаг 5.4). Если блок есть и валиден (`path` и `replace` непустые) — используй значения **напрямую**, никаких regex'ов.

### Bailout

Если structured-блок отсутствует или невалиден — **выйди без действий**, оставь коммент на issue:

```
<!-- autofixtech-bailout -->
Не смогла однозначно распарсить технический fix из описания (нет блока <!-- autofixtech-scope -->, или поля невалидны). Уточни путь к файлу и конкретные `replace`/`with` через /fb (или попроси Настю добавить блок), и я попробую ещё раз. Или сделай руками.
```

И сними label `auto-fixable:technical`.

В отличие от `/reshala`, у `/autoFixTech` **нет regex-fallback'а** — technical fix без явных `replace`/`with` слишком рискованный для угадывания.

## Шаг 4 — Allowlist + blocklist (КРИТИЧНО)

**Канонический список** allowlist'а, blocklist'а и лимитов — в `docs/AUTOFIX_SCOPE.md`. Прочитай этот файл через `mcp__github__get_file_contents` и применяй ровно те правила. Это единая точка правды — оба скилла (`/autoFixTech` и `/autoMerge`) читают одно и то же, drift невозможен.

**Короткое резюме (полное — в `AUTOFIX_SCOPE.md`):**
- Целевой путь обязан попадать в allowlist (`docs/*.md`, `tools/*.sh`/`*.py`, `tests/*.sh`/`*.py`, `.github/workflows/*.yml`/`*.yaml`, `journal/*.md`, `CHANGELOG.md`) **и НЕ попадать** в blocklist (`CLAUDE.md`, `docs/SAFE_MODE.md`, `docs/RESHALA_SCOPE.md`, `docs/AUTOFIX_SCOPE.md`, `.github/labels.yml`, `.github/ISSUE_TEMPLATE/**`, `registry/**`, `rules/**`, `.claude/commands/**`).
- Нормализация пути: убери `./` и leading `/`, отвергни любой `..` сегмент или абсолютный путь.

### Bailout

Если правила scope не пройдены — оставь коммент на issue:

```
<!-- autofixtech-out-of-scope -->
Этот файл не в моём auto-fix-tech scope (path: <X>). Передаю Насте — она поправит руками или классифицирует как needs-architect.
```

Сними label `auto-fixable:technical`. Выйди без дальнейших действий.

## Шаг 5 — Применить правку

**GLaDOS-реплика** обязательна перед серией мутаций (одна на весь прогон).

1. Прочитай файл через `mcp__github__get_file_contents`.
2. Найди точку правки. Если `replace`-строка не находится в файле точно — bailout как в Шаге 3 («строка не найдена, файл изменился с момента триажа»).
3. Подготовь новое содержимое (замена `replace` → `with`, минимальный diff).
4. Создай ветку через `mcp__github__create_branch`:
   - name: `auto-fix-tech/<issue-NNN>`
   - from: `main`
5. Запиши файл через `mcp__github__create_or_update_file`:
   - branch: только что созданная
   - message: `fix(tech): <одна строка про правку> (resolves #NNN)`
   - content: новое содержимое
   - sha: текущий sha файла (из `get_file_contents`)

Текущий формат `<!-- autofixtech-scope -->` поддерживает ровно один файл (`path` — единственное значение). Если для починки нужно поправить два файла (например, helper в `tools/*.sh` плюс его тест в `tests/*.sh`) — `/fbAnalyzer` сейчас не сможет однозначно классифицировать такой кейс, он уедет либо в `needs-architect`, либо потребует ручной разметки. `maxFiles=2` в `AUTOFIX_SCOPE.md` — это лимит для `/autoMerge` hard-precheck'а (на случай, если PR соберётся вручную), не для `/autoFixTech` open-флоу.

## Шаг 6 — Открыть PR

Через `mcp__github__create_pull_request`:

```
title: [auto-fix-tech] <тип> · resolves #NNN
head: auto-fix-tech/<issue-NNN>
base: main
body:
```

`<тип>` — короткое слово: `broken-link`, `ci-fix`, `version-pin`, `tools-helper`, `workflow`. Если не определяется — `tech`.

Тело PR:

```markdown
## Что чинит

Closes #NNN.

## Diff

**Файл:** `<path>`

**Было:**

```text
<старая строка>
```

**Стало:**

```text
<новая строка>
```

## Почему safe

- Путь в allowlist `docs/AUTOFIX_SCOPE.md` (не в blocklist).
- Минимальный diff — точечный technical fix.
- Issue была помечена `auto-fixable:technical` после ревью `/fbAnalyzer`.
- Hard-precheck в `/autoMerge` повторит scope-проверку перед мерджем, code-reviewer subagent проверит семантику.

## Что дальше

- 👍 на body → попадёт в очередь `/autoMerge` в его следующий прогон.
- Коммент с правкой → я попробую ещё раз (откомментируй и сними `auto-fix:technical-done` с issue).
- Merge руками — всегда доступно.

---

_Открыт автоматически скиллом `/autoFixTech`. Не сам мерджу — жду 👍._
```

После создания:
- Поставь на PR label `auto-fix:technical`.
- На issue (#NNN) поставь label `auto-fix:technical-done` (аналог `reshala:done` для tech-флоу).
- Не закрывай issue сам — закрытие произойдёт автоматически при мерже PR через `Closes #NNN`.

## Шаг 7 — Telegram-нотификация

Сразу после успешного создания PR — heredoc с **quoted** delimiter:

```bash
./tools/notify-telegram.sh <<'EOF'
🔧 /autoFixTech открыла PR #<M> на твой апрув:
https://github.com/kotik-botik/kotik-botik/pull/<M>
Issue: #<NNN>
Файл: <path>
Тип: <broken-link/ci-fix/...>
EOF
```

Quoted-delimiter защищает от RCE через имена файлов/типов. Если в title/пути встречается `EOF` отдельной строкой — замени делимитер на `EOF_TG`.

Если helper упал — основной флоу скилла **не блокируется**. Если в stderr `notify-telegram: http_code=<N>` где N ≠ 200 — упомяни в финальном отчёте.

## Шаг 8 — Отчёт + метрика

### 8.1. Отчёт в сессии

```
Прогон /autoFixTech — <ISO timestamp>
Issue: #NNN «<title>»
PR: #M — <ссылка>
Файл: <path>
Тип: <broken-link/ci-fix/...>
Статус: открыт, ждёт 👍
```

Если был тихий выход на одном из шагов — отчёт не нужен.

### 8.2. Метрика в `tests/metrics.jsonl`

**Только при нетривиальной активности** (открыла PR, бейлилась, или приняла решение). Тихий выход «нечего чинить» — метрику НЕ пишем.

1. `get_file_contents` для `tests/metrics.jsonl` (sha=null если файла нет).
2. Подготовь строку:

   ```jsonc
   {
     "skill": "autoFixTech",
     "timestamp": "<ISO>",
     "outcome": "pr_opened" | "bailout_out_of_scope" | "bailout_parse_failed" | "bailout_branch_exists",
     "issue": <NNN или null>,
     "pr": <M или null>,
     "path": "<path или null>",
     "fix_type": "<broken-link/ci-fix/... или null>"
   }
   ```

3. `new_content = old_content + json_line + "\n"`.
4. `create_or_update_file` (branch=main, message=`chore(metrics): autoFixTech <outcome>`, sha из шага 1).

Падение записи метрики — не блокер. Лог + продолжай.

## Errors / partial failures

- **Ветка уже существует**: не пересоздавай, прочитай PR; если `closed` без мержа → удали ветку, открой заново; если `open` → ставь `auto-fix:technical-done` на issue и выйди.
- **`create_or_update_file` упал** (404, sha conflict): попробуй ещё раз через `get_file_contents` за свежим sha. Не больше 2 ретраев.
- **`create_pull_request` упал**: оставь branch как есть, оставь коммент на issue «не смогла открыть PR, проверь руками», выйди.
- **`replace`-строка не найдена в файле**: bailout как в Шаге 3 («файл изменился с момента триажа»).

## Что НЕ делает

- Не редактирует файлы из blocklist (`CLAUDE.md`, `.github/labels.yml`, `registry/**`, `rules/**`, `.claude/commands/**`, и др. — см. `AUTOFIX_SCOPE.md`).
- Не закрывает issues руками (только через PR merge).
- Не мержит PR — это работа `/autoMerge`.
- Не вызывает себя рекурсивно — один прогон = один PR.
- Не правит `.ts`/`.tsx`/`.js` — runtime-зависимости, требуют контекст.
- Не угадывает правку без `<!-- autofixtech-scope -->` блока — regex-fallback'а нет.

## Связанные документы

- Scope: `docs/AUTOFIX_SCOPE.md`
- Триаж, после которого назначается `auto-fixable:technical`: `.claude/commands/fbAnalyzer.md` Шаг 5.2
- Авто-мердж: `.claude/commands/autoMerge.md`
- Соседний скилл для typo: `.claude/commands/reshala.md`
- Настройка routine'ов: `docs/TRIAGE_SETUP.md`
