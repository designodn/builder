# /autoMerge — вечерний мердж auto-fix PR с 👍

> По расписанию routine (обычно раз в день вечером) мержит PR, открытые `/reshala` (label `auto-fix`) и `/autoFixTech` (label `auto-fix:technical`), на которые Настя поставила 👍 на body. Перед мержем — hard-precheck по соответствующему scope-файлу + code-review subagent на diff. Если ревью чистое — squash-merge. Иначе — коммент с проблемой, ждёт следующего прогона.

## Когда вызывать

- Routine из claude.ai/code/routines — расписание задаётся в самой routine (обычно реже, чем `/reshala`, т.к. ждёт ответных 👍).
- Вручную: Настя пишет `/autoMerge` в активной сессии — полезно если хочется проверить очередь, не дожидаясь следующего прогона.

## Шаг 0 — Identity-check

`mcp__github__get_me` → `login == "verygooddess"`. Иначе **тихий выход**.

> **Порядок Шаг 0 → Шаг 1 — намеренный.** Identity-check до kill-switch'а: `get_file_contents` уже не должен выполняться в Дизайнерской сессии.

## Шаг 1 — Kill-switch

Проверь `.claude/auto-merge-paused` через `mcp__github__get_file_contents`. Если есть — **тихий выход** с логом «paused, exiting».

> Раздельный kill-switch с `/reshala`/`/autoFixTech`: можно оставить открытие PR, но временно запретить автомердж.

**GLaDOS-реплика — одна на весь прогон, перед первой мутацией.** «Первая мутация» — любой `merge_pull_request`, `pull_request_review_write`, `add_issue_comment` (включая error-комменты в Шаге 2 «оба label'а одновременно» и Шаге 3 BLOCK-bailout) или `create_or_update_file` (запись метрики). Если прогон тихий (нет кандидатов, или все без 👍 без комментариев) — реплика не нужна.

## Шаг 2 — Найти кандидатов

Через `mcp__github__list_pull_requests`:

- `state: "open"`
- Фильтр по label: **либо** `auto-fix` (PR от `/reshala`), **либо** `auto-fix:technical` (PR от `/autoFixTech`). GitHub API не умеет OR одним вызовом — получи все open PR с базой `main`, отфильтруй на клиенте по наличию одного из двух label'ов.
- Базовая ветка: `main`.

Для каждого PR определи **тип** по label:
- `auto-fix` → тип `typo`, scope-файл `docs/RESHALA_SCOPE.md`.
- `auto-fix:technical` → тип `technical`, scope-файл `docs/AUTOFIX_SCOPE.md`.

Если у PR оба label'а одновременно — ошибка классификации, **пропусти** и оставь коммент: «оба label'а одновременно, не пойму чей это PR. Проверь руками.»

Для каждого PR проверь все 4 условия. Если **любое** не выполнено — пропусти этот PR.

### 2.1. 👍 от @verygooddess на body PR — главная гарантия

Реакции на тело PR/issue получаются через `mcp__github__pull_request_read` (или эквивалент с возвратом `reactions`). Если этот tool не возвращает реакции — используй `mcp__github__list_issue_reactions` (PR — это issue по API, передавай `issue_number = pr.number`).

Проверка: среди реакций есть запись с `content: "+1"` (это код 👍 в API) и `user.login: "verygooddess"`. Без неё — **пропусти PR, ничего не делай, ничего не комментируй**. Это by-design: Настя сначала смотрит сама.

**Этот шаг — единственная гарантия, что мердж разрешён.** Если по какой-то причине ты не смогла прочитать реакции (API упал, tool недоступен) — **fail safe: пропусти PR**. Никогда не мержь «по умолчанию».

### 2.2. Hard-precheck diff'а (до code-reviewer)

Это дешёвая защита перед вызовом LLM-ревьюера. **Канонические значения allowlist/blocklist/лимитов** — в scope-файле, **выбранном по типу PR в Шаге 2**:

- `typo` → `docs/RESHALA_SCOPE.md` (`maxFiles=1`, `maxDiffLines=10`, только `.md` в allowlist).
- `technical` → `docs/AUTOFIX_SCOPE.md` (`maxFiles=2`, `maxDiffLines=30`, расширенный allowlist `.md`/`.sh`/`.py`/`.yml`).

Прочитай нужный scope-файл и применяй ровно те правила. Получи `pull_request_read` → `files[]`:

- Кол-во изменённых файлов ≤ `maxFiles`. Больше — BLOCK.
- Расширение файлов в allowlist scope-файла. Иначе — BLOCK.
- Путь файла в allowlist путей scope-файла. Иначе — BLOCK.
- Путь файла **не** в blocklist scope-файла. Иначе — BLOCK.
- Суммарный diff (additions + deletions) ≤ `maxDiffLines`. Больше — BLOCK.

Если любая проверка упала — BLOCK **без вызова `code-reviewer` subagent**. Оставь коммент с конкретной причиной (см. Шаг 3 формат), не мержь, переходи к следующему PR.

**Безопасность.** Hard-precheck — последний шанс остановить PR с залезшим в blocklist файлом до того, как code-reviewer пропустит правку как «семантически чистую». `/reshala` и `/autoFixTech` уже проверяют scope при открытии PR, но scope мог поменяться между open'ом и merge'м.

### 2.3. CI

Если есть запущенные workflow'ы и они failing — пропусти PR, оставь коммент «CI красный, не мержу».

### 2.4. Нет блокирующих review

Если на PR есть `request_changes` review — пропусти.

## Шаг 3 — Ревью каждого PR (третья линия защиты)

Hard-precheck в Шаге 2.2 уже отсеял PR'ы с подозрительной структурой. `code-reviewer` subagent — это **третья линия** для семантики (фактически опечатка или скрытая правка смысла).

Для каждого кандидата, прошедшего Шаги 2.1-2.4:

1. Получи diff через `mcp__github__pull_request_read`.
2. Запусти `code-reviewer` subagent через `Agent` tool с описанием PR и diff'ом. Промпт **зависит от типа** (см. Шаг 2):

   Для `typo` (PR от `/reshala`):

   ```
   Review this auto-fix PR opened by /reshala. It claims to be a typo fix in a .md file.

   Verify:
   1. Diff is minimal (1-3 lines changed).
   2. Only .md files touched.
   3. No file in blocklist (CLAUDE.md, docs/SAFE_MODE.md, .github/**, registry/**, rules/**).
   4. The fix matches the linked issue (#NNN).
   5. No content drift — only typo/grammar fix, no semantic changes.

   Report: APPROVE or BLOCK with specific reason. Under 100 words.
   ```

   Для `technical` (PR от `/autoFixTech`):

   ```
   Review this auto-fix PR opened by /autoFixTech. It claims to be a technical fix
   (broken link, CI fix, version pin, tools/* helper, или точечная правка workflow/тестов).

   Verify:
   1. Diff is точечный (≤ 30 lines, ≤ 2 files).
   2. Only allowed extensions touched (.md / .sh / .py / .yml / .yaml).
   3. No file in blocklist (CLAUDE.md, docs/SAFE_MODE.md, docs/RESHALA_SCOPE.md,
      docs/AUTOFIX_SCOPE.md, .github/labels.yml, .github/ISSUE_TEMPLATE/**,
      registry/**, rules/**, .claude/commands/**).
   4. The fix matches the linked issue (#NNN).
   5. No content drift — the fix is technical (matches one of: broken-link,
      version-pin, tool-flag, workflow-syntax, test-assertion). No new behavior,
      no refactoring, no semantic change to public contract.
   6. For .sh/.py/.yml: no introduction of new dependencies, no new external
      command calls, no removal of safety guards (set -e, set -u, quoting).

   Report: APPROVE or BLOCK with specific reason. Under 120 words.
   ```

3. Если subagent вернул `APPROVE`:
   - **GLaDOS-реплика** (одна на весь прогон — даже если мержишь N PR подряд. CLAUDE.md явно допускает «одна на серию однотипных правок»).
   - `mcp__github__pull_request_review_write` operation `create` event `APPROVE` (нужно для branch protection).
   - `mcp__github__merge_pull_request` method `squash`.

   **Если `pull_request_review_write` упал** (например, branch protection не позволяет approve от того же login, что и автор PR — а `/reshala` открывает PR от `verygooddess`): оставь коммент на PR «Approve упал — branch protection требует ревью от другого аккаунта. Мерджи руками, пожалуйста.» Не мержи, переходи к следующему.
   - На issue, связанной через `Closes #NNN` (GitHub закроет автоматически), мердж и так залейблит. Дополнительно ставить ничего не надо.

4. Если subagent вернул `BLOCK`:
   - Оставь коммент на PR через `mcp__github__add_issue_comment` (PR — это issue в API):

     ```
     <!-- autoMerge-bailout -->
     Не смержила автоматически. code-reviewer agent заметил: <reason>.
     Посмотри руками — если ок, мерджи кнопкой; если нет — коммент с правкой,
     `/reshala` попробует ещё раз.
     ```

   - Не закрывай PR. Не снимай label.

## Шаг 4 — Telegram-итог

В конце прогона (после всех попыток мерджа) отправь сводку через helper. **Только heredoc, не argv:**

```bash
./tools/notify-telegram.sh <<'EOF'
🌙 /autoMerge за день:
✓ Смержено: <N> (#<A>, #<B>, ...)
⏸ Отложено (нет 👍): <M>
⚠ Требует внимания: <K> (с BLOCK от ревью)
<если K > 0: список ссылок построчно — каждая на своей строке>
EOF
```

Подставь значения в heredoc — quoted-delimiter (`<<'EOF'`) защищает от подстановки переменных и RCE.

Если кандидатов было **0** (вообще пусто, не «все без 👍») — Telegram **не дёргай**. Тихий день не требует уведомления.

Если кандидаты были, но ни одного не смержено (все ждут 👍 или все BLOCK'нуты) — сводку всё равно отправь: Настя должна знать, что очередь не двигается.

Helper сам решает, отправлять ли (silent no-op если секреты не настроены, best-effort на сеть). Если helper вывел в stderr `http_code=<N>` где N ≠ 200 — упомяни в финальном отчёте.

## Шаг 5 — Отчёт

Короткий отчёт в обычное сообщение:

```
/autoMerge — <ISO timestamp>
Кандидатов: <N> PR
Смержено: <M>
Отложено (нет 👍): <K>
Заблокировано ревью: <L> (см. комментарии в PR'ах)
```

Если кандидатов 0 — отчёт всё равно полезен («ничего не делала, всё чисто»), но routine не должен слать пустые сообщения если **вообще** не было PR в очереди. По кейсу — если есть `auto-fix` PR'ы без 👍, пиши отчёт; если их нет совсем — тихий выход.

### 5.1. Метрика в `tests/metrics.jsonl` (issue #73)

**Только если кандидаты были** (хоть один auto-fix PR в очереди). Полностью пустой день — метрику не пишем.

Если кандидаты были:
1. `mcp__github__get_file_contents` для `tests/metrics.jsonl` (sha=null если файла нет).
2. Подготовь новую строку JSON:

   ```jsonc
   {
     "skill": "autoMerge",
     "timestamp": "<ISO>",
     "prs_evaluated": <N>,
     "prs_merged": <M>,
     "prs_blocked_precheck": <K_precheck>,
     "prs_blocked_reviewer": <K_reviewer>,
     "prs_skipped_no_thumbs": <K_no_thumbs>
   }
   ```

3. Аппенди строку + `\n` к old_content.
4. `mcp__github__create_or_update_file` (branch=main, message=`chore(metrics): autoMerge run`, sha из шага 1).

Падение записи метрики — не блокер. Лог + продолжай.

## Manual merge — всегда доступен

Это скилл-страховка, не единственный способ. Настя может:

- Нажать Merge на PR в GitHub mobile/desktop в любой момент.
- Сказать в активной сессии «смержи #M» — Claude мержит (с GLaDOS-репликой).

`/autoMerge` — для случая «вечером закрыть очередь, не отвлекаясь руками».

## Errors

- **Merge упал с 409 (конфликт)**: коммент на PR «merge conflict, нужна твоя помощь», без мержа.
- **Pull request review write упал**: возможно branch protection требует review от другого аккаунта. Лог + skip PR.
- **Code-reviewer subagent timeout**: пропусти этот PR, коммент «ревью не завершилось, попробую завтра».

## Что НЕ делает

- Не мержит без 👍 от Насти. Никогда. Даже если ревью чистое.
- Не мержит PR без label `auto-fix` или `auto-fix:technical` (т.е. не open-PR'ы от человека, только от `/reshala` / `/autoFixTech`).
- Не пересматривает уже смерженные PR.
- Не закрывает PR без мержа (только мерджит или оставляет открытым с комментом).

## Связанные документы

- Документация по typo-флоу: `docs/RESHALA.md`
- Создание auto-fix typo PR: `.claude/commands/reshala.md`
- Создание auto-fix-tech PR: `.claude/commands/autoFixTech.md`
- Scope для typo: `docs/RESHALA_SCOPE.md`
- Scope для technical: `docs/AUTOFIX_SCOPE.md`
- Триаж: `.claude/commands/fbAnalyzer.md`
- Настройка routine'ов: `docs/TRIAGE_SETUP.md`
