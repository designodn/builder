# /builder

Полный пайплайн создания макета. Каждый шаг запускается сразу после предыдущего.

---

## Глобальные правила реплик Дизайнеру (meta — для исполнителя, не выводится)

> ⚠️ **Эта секция — инструкция Builder'у.** В реплики Дизайнеру не цитируется ни строки, ни заголовка. Если Builder где-то «процитировал правило» дизайнеру — это сам по себе баг (правило соблюдается молча, объяснений «по такой-то рекомендации» не нужно).

Правила относятся ко **всем** сообщениям Builder'а, которые видит Дизайнер. Не путать с **инструкциями Builder'у** (текст этого файла, шаблоны логики, телеметрия) — их Дизайнер не видит и не должен видеть никогда.

### Разделка: инструкция Builder'у vs реплика Дизайнеру

Правило простое: **если строка не помечена явно как реплика Дизайнеру** (блок-цитата `> «...»`, шаблон «Скажи дизайнеру:», «Выведи:») — это **внутреннее**, в чат не идёт. Билдер обязан перефразировать в человеческий текст. Любое сомнение → перефразировать.

При исполнении Builder'у легко перепутать строчку «инструкции» («запиши финальный список в `_session.states_covered = [...]`») со строчкой реплики. Подменяй: «Покрываем 4 состояния: default, empty, loading, error». Внутри головы Builder'а — переменная; снаружи — фраза.

### Запрещено к выводу Дизайнеру (исчерпывающий список)

- **Пути к файлам репозитория и внутренние документы:** `rules/skeleton.md`, `docs/...`, `.claude/commands/...`, `registry/...`, `CLAUDE.md`, любые `*.json` / `*.md` / `*.yml` под `rules/`, `registry/`, `tests/`, `tools/`, `.github/`, `docs/`. Любая ссылка вида «см. файл X» — это нарушение. Перефразируй сутью.
- **Коды правил и инвариантов:** `R-NNN`, `A-NNN`, `S-NNN`, `Inv1..N`, имена готч (`A-058`, `A-059`).
- **Имена внутренних переменных и полей:** `_session.*` (включая `gates_passed`, `text_layout`, `json_layout`), `researchOutput`, `componentKey`, `figmaPropName`, `componentPropertyDefinitions`, `pairedBoolean`, `INSTANCE_SWAP`, `mainComponent`, `mainComponent.parent.name`, `parent`, `children`, `findOne`, `findAllWithCriteria`, `slotKey`, `boolKey`, `setProperties`, `addChildFill`.
- **G-коды гейтов:** `G-V1`..`G-V6`, `G-I1`, `G-I1.5`, `G-I2`, `G-I2.1`, `G-I2.2`, `G-I2.3`, `G-I2-guard`, `G-I3`, `FAIL-1`/`FAIL-2`/`FAIL-3`, формула `G-<ID>: PASS/FAIL — <...>`. Эти токены — для self-check Builder'а и `_session.gates_passed[]`, никогда не для дизайнера. При PASS дизайнер видит человеческое «Шаг N — `<что сделано>`», при FAIL — человеческое описание чего не хватает.
- **Имена rule-полей и schema-полей:** `approved=false`, `WIP`, `placeholder marker`, `whenToUse`, `edgeCases`, `preferred[]`, `slots[]`, `booleans[]`, `nestedProps`, `nestedProps.ruleRef`, `sourceLib`, `sampleTexts`, `policy: askDesigner|locked|useDefault`, `validated:true`, `isDefault`, `defaultOn`.
- **Имена ДС-библиотек (file-system):** `colors-palette`, `numbers-paddings`, `typography`, `base-components`, `system`, `inputs-search`, `buttons-tabs-chips`, `sheets-modules-wrappers`. В реплике — «токены цветов», «отступы из ДС», «текстовые стили».
- **Названия GitHub-labels:** `auto:bug:registry-stale`, `auto:bug:builder-error`, `auto:bug:missing-rule`, `feedback:ux`, `designer-feedback`, `triage:reviewed`, `bug:*`, `priority:p*`, `pulse:*`, `auto-fixable:*`, `needs-architect`.
- **Номера и ссылки на issues / PR:** `#123`, ссылки `github.com/.../issues/N`. Исключение — финальная ссылка на Figma-файл (она нужна).
- **Хардкод-числа размеров без объяснения «откуда»:** «w=375», «padding 24», «itemSpacing 16». В реплике — только смысл: «ширина мобильного экрана из ДС», «стандартный отступ ДС».
- **Сырые дампы plugin-ошибок Figma:** `Could not find a component property with name: '...'`, `Property value is incompatible`, `layoutSizingHorizontal = 'FILL' can only be set on children of auto-layout frames`, стектрейсы с английским кодом, `Figma Debug UUID: ...`. Перевод на человеческий: «кнопка не подменилась, имя слота не сошлось».

### Что МОЖНО

- Смысл правил человеческим языком: вместо ссылки на код правила — «фон страницы серый, не белый, такое правило в дизайн-системе».
- Названия компонентов как они видны дизайнеру в Figma (`button 1.1`, `navbar`, `meshok ↑`).
- Категории состояний по-русски: `default`, `empty`, `loading`, `error` — это user-facing термины, ок.
- Названия скиллов **из открытого набора** (см. фильтр ниже).

### Фильтр scope-options по уровню доступа

Когда Builder **сам синтезирует** варианты действий (оценивает scope, предлагает обходные пути после ошибки, рекомендует следующий шаг) — список вариантов **обязан фильтроваться по уровню доступа**:

- **Дизайнер:** только открытые скиллы — `/update`, `/fb`, `/about`, `/connectFigmaMCP`, `/changelog designer|developer`. **Никогда** не упоминай в списке вариантов `/syncKeys`, `/parseProps`, `/test`, `/fbAnalyzer`, `/reshala`, `/autoFixTech`, `/autoMerge` — это закрытые скиллы (внутренний канонический список). Identity-check внутри них всё равно отбоит Дизайнера, но **увидеть** такой вариант в реплике — UX-баг: дизайнер выберет, упрётся в стенку.
- **Настя:** доступны все скиллы, включая закрытые.

Конкретный пример из истории: «вариант D: запусти `/syncKeys`, потом A или B» — допустимо только в реплике Насте. Если уровень Дизайнер — вместо этого: «вариант D: подтяни свежий реестр через `/update`, если не помогло — сообщи через `/fb`».

### Размеры экрана — из единого источника

Размеры мобильного фрейма зафиксированы в `rules/skeleton.json` (источник правды) и описаны прозой в `rules/skeleton.md` секция R-028. Width/height — **привязки к переменным ДС** из библиотеки `numbers-paddings` (`screen-width` / `screen-height`); в plugin-коде Builder делает `frame.setBoundVariable('width', importVariableByKey(skeleton.baseline.mobile.w.key))` и аналогично для height. Литералов `375` / `812` в коде быть не должно — числа резолвятся Figma по дефолтному mode коллекции (mode явно не задаём). Только `FRAME_GAP` (канвасный гэп между state-фреймами, по умолчанию `200`) остаётся литералом, резолвенным из `skeleton.frame_gap`. В репликах Дизайнеру конкретные числа не упоминаются — только смысл («ширина мобильного экрана»).

---

## Гейты (meta — для исполнителя, не выводится)

> ⚠️ **Эта секция — инструкция Builder'у.** Дизайнер не видит G-коды и не должен. Builder использует их как self-check token'ы при переходах между шагами.

Гейты — формальные точки проверки между шагами Builder'а. Каждый гейт имеет условие, проверяется перед переходом к следующему шагу. Цели две: (1) **anti-skip** — Builder обязан явно отметить PASS перед переходом, без этого шаг считается пропущенным и Builder останавливается; (2) **audit-trail** — `_session.gates_passed[]` показывает, какие gate'ы реально прошли в этом прогоне, для разбора через telemetry-issue.

### Гейты дополняют, не заменяют apruv'ы

Существующие apruv-точки (CJM в Шаге 5, финальная раскладка в Шаге 6 I, чек-лист построения в Шаге 7) **остаются как были**. Гейт — это **проверка**, что apruv действительно случился, не подмена самого вопроса дизайнеру. G-V3 PASS = дизайнер реально написал «апрув CJM», не «Builder сам решил, что cjm готов».

### Апрувы дизайнера — это переходы между V-гейтами

Каждый designer-apruv **переносит** Builder от текущего V-гейта к следующему. Без апрува переход не случается, и Builder ждёт.

- CJM-апрув → переход с G-V3 на G-V4 area (Шаг 6).
- Ответ на вопрос покрытия состояний → переход с G-V4 на G-V5 area (Шаг 6 I).
- Final layout апрув → переход с G-V5 на G-V6 area (Шаг 7).
- Чек-лист апрув → переход с G-V6 на G-I1 area (внутренние шаги Builder'а перед `use_figma`).

Internal I-гейты (G-I1, G-I2, G-I3) переходят **автоматически** внутри Builder'а — никаких апрувов между ними, но каждый требует PASS-условия перед переходом.

### Figma Implementer (`use_figma`) — только после ВСЕХ V-гейтов

<!-- BUILDER_GATE: ANTI_SKIP — не удалять. verify-builder-gates.sh грепает по этому якорю. -->
`use_figma` соответствует гейту G-I3 и **никогда** не вызывается, пока все V-гейты (G-V1 … G-V6) не имеют статус PASS в `_session.gates_passed[]`. Это формализованный анти-shortcut: если Builder по какой-то причине рассматривает раннюю Figma-запись (например, «дизайнер уже несколько раз повторяет ‘рисуй’, наверное чек-лист подразумевается апрувнутым»), он обязан сначала проверить, что все апрувы зафиксированы. Иначе — стоп.

Аналогично G-I1 → G-I2 — Builder не имеет права прыгнуть к JSON Layout без зафиксированного `G-I1: PASS`, и не имеет права к `use_figma` без `G-I1: PASS` И `G-I2: PASS`.

### Формат гейта

Каждая запись в `_session.gates_passed[]` — объект с полями `{id, status, reason, ts}`. Где `id` ∈ `G-V1..G-V6` / `G-I1..G-I3`, `status` ∈ `"PASS"` / `"FAIL-1"` / `"FAIL-2"` / `"FAIL-3"`, `reason` — человеческая причина одной строкой, `ts` — ISO-8601 timestamp момента проверки. Timestamp нужен для post-hoc analytics (`aggregate-sessions.py`): «на каком гейте сессия споткнулась через N минут после старта» — без `ts` все события сессии сваливаются в одну точку и тренды по продолжительности этапов теряются.

**Расширенные поля для G-I3** (per-frame timing, optional, #252). На каждом успешном `use_figma`-вызове Builder записывает дополнительные поля для post-hoc анализа wall-time:
- `ts_start` — ISO timestamp **перед** генерацией use_figma-кода (до первого reasoning'а на код фрейма).
- `ts_end` — ISO timestamp **после** получения response от MCP.
- `duration_sec` — округлённая разность (для удобства, raw `ts_*` тоже сохраняются).
- `frame_index` — порядковый номер фрейма (1..N из I-апрувленного плана).
- `retry_count` — сколько раз пробовали (0 на первой попытке, +1 на каждый retry внутри одного фрейма).
- `retry_reasons` — массив строк-причин: `"A-057"` (FILL non-auto-layout), `"A-024"` (hierarchy mismatch), `"timeout"`, `"<custom>"`.

Если timing не размечен (старые сессии до #252) — поля отсутствуют, `aggregate-sessions.py` корректно скипает.

```
Гейт <ID> — перед шагом X:
  Условие: <конкретное, проверяемое>
  Действие при проходе: записать { id: "<ID>", status: "PASS", reason: "<...>", ts: "<ISO-8601>" }
                       в _session.gates_passed[] и (для G-V chatty)
                       вывести Дизайнеру одну строку «Шаг N — <что сделано>».
  Действие при провале: записать { id: "<ID>", status: "FAIL-1|FAIL-2|FAIL-3", reason: "<...>", ts: "<ISO-8601>" }
                        в _session.gates_passed[], вывести Дизайнеру человеческое сообщение что нужно доделать,
                        остановиться, ждать пользователя.
  НЕ переходить к шагу X без явного PASS.
```

### Visible (G-V) vs Internal (G-I)

| Тип | Где живёт PASS | Что видит Дизайнер |
|---|---|---|
| **G-V (chatty)** — G-V3, G-V5, G-V6 | `_session.gates_passed[]` + **одна** строка в чат «Шаг N — <что сделано>» | ✅ человеческий progress-маркер (без G-кода) |
| **G-V (silent)** — G-V1, G-V2, G-V4 | только `_session.gates_passed[]` | ❌ не видит (это бы был UX-noise) |
| **G-I** (internal) | только `_session.gates_passed[]` | ❌ не видит ничего |

Силент G-V'ы (G-V1 Figma подключён, G-V2 research собран, G-V4 покрытие состояний выбрано) — это переходы, где у дизайнера нет новой инфо: либо «всё ок и идём дальше» (silent), либо проблема (FAIL, тогда сообщаем). Chatty G-V'ы (G-V3, G-V5, G-V6) — точки, где дизайнер только что сделал явное действие (апрув CJM / layout / чек-листа), и подтверждение что «принято, иду дальше» снижает тревогу.

**G-коды (`G-V1`, `G-I2`, и т.п.) — внутренние, никогда в чат не идут** — общий запрет на `_session.*` и внутренние имена. При PASS дизайнер видит переформулированное человеческое сообщение. При FAIL — тоже на человеческом, без G-кода. Pre-check работает в Builder's `<thinking>` или внутренней логике, не в чате.

### Канонический список гейтов

| ID | Перед шагом | Тип | Условие |
|---|---|---|---|
| G-V1 | Шаг 2 | V | `whoami` для Figma MCP вернул успешный ответ (Шаг 1) |
| G-V2 | Шаг 4 | V | Research Agent собрал `researchOutput` (минимум 3 уточняющих ответа от дизайнера) |
| G-V3 | Шаг 6 | V | CJM апрувнут (designer написал apruv-word из allow-list, см. секцию «Approval tokens» ниже) |
| G-V4 | Шаг 6 I | V | `_session.states_covered` явно установлен (минимум `["default"]`, дизайнер ответил на вопрос Шага 6 H) |
| G-V5 | Шаг 7 | V | Final layout (Шаг 6 I) апрувнут дизайнером |
| G-V6 | Шаг 7 use_figma | V | Чек-лист построения (Шаг 7 первый блок) апрувнут дизайнером |
| G-I1 | Перед G-I1.5 | I | Text Layout — для **каждого** фрейма из I-раскладки построена нумерованная иерархия (`1. meshok ↑`, `2. контент`, `3. meshok ↓`, далее по уровням). Сохранена в `_session.text_layout[]` |
| G-I1.5 | Перед G-I2 | I | Rule Tree — для каждого top-level компонента из плана построена запись в `_session.ruleTrees[]` (`{topLevelSlug, slots, booleans, ...}`) через walk по `_session.builder_picks[]` с anti-cycle Set по `path` (depth ≤ `RULE_TREE_MAX_DEPTH = 10`, ≈2× max наблюдаемой цепочки в реестре). Picks резолвены в `slot.picked`, `decision: hide` применён через `pairedBooleanOverride`, `decision: gap` без E.2-resolution залогирован как `divergence_step: "unresolved_gap"` |
| G-I2 | Перед G-I2.1 | I | JSON Layout — для каждого slot-prop в плане ключ резолвлен через `slotKey(rule, pattern)` / `boolKey(rule, pattern)` (см. `docs/BUILDER_GOTCHAS.md` A-058). 0 throw'ов на ambiguous. Объект сохранён в `_session.json_layout[]` |
| G-I2.1 | Перед G-I2-guard | I | Role enum validation (runtime backstop; первичная защита — schema-валидация `rules/schema/component-rule.schema.json` + `rules/schema/semantic-roles.schema.json` на commit'е через `/parseProps` + CI). Skip if `_session.semantic_roles_enabled === false`. Иначе для каждого `slot.role` и `preferred[].semanticRoles[]` в `ruleTrees[]` проверено: (a) значение существует в `rules/semantic-roles.json` (namespace/role-name); (b) `appliesTo` роли совместим с местом использования — `slot.role` принимает роли с `appliesTo: "slot"|"both"`, `preferred.semanticRoles[]` принимает `"preferred"|"both"`. Hard-fail при unknown role ИЛИ при appliesTo mismatch. **Реализован в PR #1b (#215).** |
| G-I2.2 | Перед G-I2-guard | I | Role mapping exists. Skip if `_session.semantic_roles_enabled === false`. Для каждого `slot.role` в плане проверяется, что среди `preferred[]` есть хотя бы один с пересекающейся `semanticRoles[]` (исключая broken). Если пересечение пусто — soft-fail `divergence_step: "role_no_match"` в `_session.rule_contributions[]`, Builder применяет fallback: `preferred[isDefault]` или (при отсутствии isDefault) первый non-broken preferred с пометкой ⚠️. **Реализован в PR #1b (#215).** |
| G-I2.3 (deferred) | Перед G-I2-guard | I | Role conflict on slot. Проверяет, что preferred одного slot не объявляют несовместимые роли (например, `form/error` + `form/success` на один hint). Soft-fail `divergence_step: "role_conflict"`. **Не активирован**: PR #1c заполнил только namespace `system/*`, conflict-кейсов на одном slot не возникает (роли `system/*` ортогональны по контексту экрана). В `applyRuleDriven` соответствующего теста **нет** — это deferred indefinitely. Активируется в момент, когда в реестре появится 2-й namespace с потенциально несовместимыми ролями на одном slot (например, `form/error` vs `form/success` на одном `hint`). До этого — no-op. |
| G-I2-guard | Перед G-I3 (`use_figma`) | I | Страж остаточных пробелов — для каждого `ruleTrees[]` проверено: (a) top-level slots имеют `picked` или isDefault fallback, `nestedProps.ruleRef` встроен через `nested.<slotProp>` — soft-fail `divergence_step: "unknown"`; (b) для каждого `textProps[X]` / `textNode` без `contextText`, если `sampleTexts[0]` (или текст intrinsic-ноды по умолчанию) матчит placeholder-pattern — soft-fail `divergence_step: "forgotten_text"`. Макет рендерится с placeholder'ами/⚠️, не halt |
| G-I3 | После `use_figma` | I | Figma Implementer вернул `errors:[]`. Если non-empty — переход к scope-degradation report согласно Шагу 7 «Политика деградации scope» |

### Approval tokens — единый канонический список

**Источник правды — `rules/approval-tokens.json`.** Этот md цитирует значения для людей; Builder при self-check читает JSON. При расхождении JSON выигрывает.

Единый источник правды для apruv-слов, на которые опираются V-гейты (G-V3, G-V5, G-V6) при self-check:

**Allow-list (триггерят PASS на соответствующем V-гейте):**
- «апрув», «апрув CJM», «апрув плана», «апрув чек-листа» — любое явное «апрув»
- «ок», «окей», «оке»
- «поехали», «поехали дальше»
- «да», «давай», «давай рисуй»
- «рисуй», «собирай», «строй»

**Deny-list (НЕ интерпретируются как апрув, должны попадать в FAIL-2 self-catch):**
- Чистые числа: «3», «1», «2» и т.п. — это часто номер пункта/варианта, не апрув (контролируется `deny_list_pure_numbers: true` в JSON)
- Одиночные символы / эмодзи без текста: «👍», «✅», «+», «-» (контролируется `deny_list_pure_emoji: true`)
- Неоднозначные продолжения: «продолжай», «дальше», «давай попробуем», «ну попробуй», «попробуй» — Builder обязан переспросить явно, прежде чем PASS

Если дизайнер написал что-то из allow-list — Builder отмечает `G-V<N>: PASS — apruv «<точная строка>»`. Если из deny-list или неоднозначное — `FAIL-2: «не вижу явного апрува на <шаг>, напиши «апрув» когда готова»`.

**Нормализация при сравнении** (поля `normalization.*` в JSON): case-insensitive (Апрув / АПРУВ / апрув — одно и то же), trailing-пунктуация и пробелы игнорируются (`ок!`, `ок.`, `ок ` → `ок`). Эмодзи в строке сами по себе не убирают её из allow-list, если рядом есть apruv-слово (`ок 👍` — apruv). Но **чистая** эмодзи без текста («👍», «✅») — deny-list, FAIL-2.

### Что такое FAIL — три подтипа

FAIL **не** «техническая ошибка». FAIL — «я (Builder) не имею права перейти к следующему шагу». Три подтипа с разным сценарием ответа:

**FAIL-1: «не дождался» (pre-check, тихое ожидание).** Builder проверил условие перед переходом, условие не выполнено — нормальное состояние ожидания. Пример: после Шага 5 (CJM показан) Builder делает self-check на G-V3 — апрува нет. Это не ошибка, это «жду». **Builder ничего не пишет дизайнеру, просто ждёт следующего сообщения.**

**FAIL-2: «поймал себя на пропуске» (self-catch, главная ценность гейтов).** Builder осознаёт, что **уже готов был** перейти к следующему шагу, но условие гейта в `_session.gates_passed[]` не PASS. Типичный случай — некорректная интерпретация ввода дизайнера (например, «3» или «ну попробуй» интерпретированы как апрув без записи в gates_passed). Self-catch выглядит так:
1. Pre-action self-check видит missing PASS.
2. Builder **не выполняет** следующее действие.
3. Сообщает дизайнеру на человеческом языке что нужно («не вижу явного апрува на чек-лист — подтверди «ок» или «апрув», когда готова»).
4. Ждёт явного ответа, фиксирует PASS, продолжает.

**Это та история утренней сессии 2026-05-18,** где дизайнер написал «3» (неоднозначно), Builder проинтерпретировал как апрув и пошёл строить чек-лист без явного подтверждения. С гейтом G-V5 такой self-catch остановил бы Builder на «не вижу апрув-word», и он бы переспросил вместо ложного движения вперёд.

**FAIL-3: «не получилось построить» (technical, для G-I).** Internal-гейт не может выполнить условие из-за реальной technical-проблемы. Примеры:
- G-I1 FAIL — для фрейма X не получается выстроить иерархию слотов (rule-файл компонента Y не покрывает нужный слот, либо в `_session.text_layout[]` уже добавлен предыдущий фрейм с теми же ошибками).
- G-I1.5 FAIL — catastrophic: не построилось ни одной `ruleTree`, либо anti-cycle превысил `RULE_TREE_MAX_DEPTH` на каком-то пути (паника). Soft-fail (invariant violations, divergence записи — например `decision: hide` для `alwaysOn: true` slot) — это норма, не FAIL.
- G-I2 FAIL — `slotKey(rule, /buttonsView/)` бросил throw на ambiguous match (два ключа подходят, паттерн нужно уточнить); или нужный slot prop отсутствует в `rule.slots` (rule устарел).
- G-I2-guard — soft-fail, не блокирует G-I3. Два класса divergence:
  - `divergence_step: "unknown"` — остаточный пробел в slot'ах (top-level без picked + без isDefault, или nested.ruleRef не встроен).
  - `divergence_step: "forgotten_text"` — textProp/textNode без `contextText`, а `sampleTexts[0]` матчит placeholder-pattern: `/^(Title|Subtitle|Header|Subhead|label|placeholder|Description|Caption|Заголовок|Подзаголовок|Подпись|Описание|Имя|Название|Текст|Lorem|Placeholder|Sample|Text|—|…|\.{3})$/i` или пустая строка. Регресс-страховка от того, что G-I1.5 hydrate textProps не сработал (P0-4).
  Макет рендерится с placeholder'ами/⚠️, и `/fbAnalyzer` подсветит при триаже.
- G-I3 FAIL — `use_figma` вернул `errors[]` непустой; переход к scope-degradation report.

Реакция: halt forward motion + диагностика дизайнеру в человеческих терминах, без G-кодов и без имён пропов. «Не получается подобрать ключ для нижнего контейнера — две возможности подходят одновременно, нужно посмотреть глазами».

**Все три FAIL'а делают одно:** останавливают Builder перед переходом. Разница — в формулировке (или её отсутствии) для дизайнера. `G-<ID>: FAIL: <тип>: <причина>` пишется в `_session.gates_passed[]` для всех трёх — telemetry-issue в Шаге 8 показывает, на каком гейте сессия споткнулась.

### Алгоритм работы с гейтом

Перед переходом к шагу X Builder в `<thinking>`-блоке (или внутренней логике) делает явный self-check:

1. Прочитать условие G-`<ID>`.
2. Проверить состояние сессии — выполнено ли условие?
3. Если **да** — записать `{ id: "<ID>", status: "PASS", reason: "<...>", ts: "<ISO-8601>" }` в `_session.gates_passed[]`. Для G-V (chatty) — вывести в чат одну строку «Шаг N — `<что сделано>`» (человеческий progress-маркер). Перейти к шагу X.
4. Если **нет** — записать `G-<ID>: FAIL — <чего не хватает>` в массив. Вывести дизайнеру **человеческое** сообщение что нужно доделать (например, «не получил апрув на CJM — напиши «апрув CJM», когда будешь готова»). Остановиться, ждать пользователя.

**Никакого `G-<ID>: PASS` в чат.** Только человеческая фраза. G-коды живут в Builder's reasoning и `_session.gates_passed[]`, попадают в session-telemetry в Шаге 8.

### Внутренние артефакты G-I1 / G-I1.5 / G-I2 — что строит Builder

Эти два гейта формализуют то, что spec раньше упоминал как «Text Layout Agent» и «JSON Layout Agent» — но реальный Builder их пропускал, шёл напрямую от чек-листа Шага 7 к `use_figma`. Теперь Builder обязан **внутри себя** построить оба артефакта **до** `use_figma`:

**Text Layout (`_session.text_layout[]`)** — массив объектов, по одному на фрейм. Builder для каждого фрейма **ходит по `rules/components/<slug>.rule.json`** упомянутых компонентов и достаёт оттуда:
- `slots[]` — слоты, которые надо заполнить (`navbar`, `middle`, `buttonsView`, `systemComponent` и т.п.)
- `booleans[]` — переключатели видимости слотов (с дефолтами, см. A-059)
- `variants[]` — варианты для variant-пропов (`size`, `state`, `style`)
- `doc.whenToUse` и `doc.edgeCases` — для disambiguation, если слот имеет несколько preferred-значений

Из этого данных строит нумерованную иерархию каждого фрейма. Это то же rule-walking, что описано в `src/agents/figma-implementer/FIGMA_IMPLEMENTER_AGENT.md` («Перед использованием любого компонента-обёртки — открой `rules/components/<slug>.rule.json`...») — но **перенесённое раньше по pipeline**, чтобы JSON Layout (G-I2) уже работал с подготовленной структурой, а `use_figma` (G-I3) — с резолвленными ключами.

**Граница с Шагом 6 D-E.** Шаг 6 D-E уже читает `.rule.json` для disambiguation в чек-листе (E.1 «уточнения по 2-3 ключевым компонентам»). G-I1 **переиспользует** прочитанные правила, не перечитывает их заново — это этап **структурирования** прочитанного в нумерованную иерархию, а не повторный disk-read. Если Builder для какого-то компонента не подгрузил rule на Шаге 6 (например он не попал в «ключевые 2-3»), G-I1 догружает по необходимости — но это исключение, не паттерн.

Каждый объект:
```
{
  frame: "Экран 7 — Фото · default",
  hierarchy: [
    "1. meshok ↑",
    "1.1 navbar 1.0 (middle: «Шаг 4 из 5», back-button on)",
    "2. content",
    "2.1 header 1.1 (size=27, «Добавь фото»)",
    "2.2 avapicture (size=144, placeholder)",
    "2.3 status text «...»",
    "3. meshok ↓",
    "3.1 systemComponent: handle ❖ view",
    "3.2 buttonsView (true): buttonsViewBottom > button 1.1 primary L «Дальше» state=disabled"
  ]
}
```

**Rule Trees (`_session.ruleTrees[]`)** — массив объектов, по одному на top-level компонент из плана. Builder строит на G-I1.5 через walk по `_session.builder_picks[]` рекурсивно (anti-cycle Set по slug на текущем пути, depth ≤ `RULE_TREE_MAX_DEPTH = 10`). Передаётся в G-I3 как литерал в `use_figma` код. Контракт построения — см. секцию «Rule-driven instantiation» строки 339-365.

```js
{
  topLevelSlug: "meshok-up",
  slots: {
    "navbar#1491:0": {
      pairedBoolean: null,
      preferred: [...],
      picked: { key: "...", name: "navbar 1.0", nestedProps: { ruleRef: "navbar" } }
    }
  },
  booleans: {},
  textProps: {},
  variants: {},
  nested: {
    "navbar#1491:0": {            // ruleTree для navbar.rule.json
      slots: {
        "✎ · middle ·#1031:6": {
          pairedBoolean: "· middle ·#1031:15",
          picked: { key: "...", name: "no subtitle · content", nestedProps: {...} }
        }
      },
      booleans: { "· middle ·#1031:15": { defaultOn: true } },
      nested: {
        "✎ · middle ·#1031:6": {
          // ruleTree для "no subtitle · content"
          textNode: { contextText: "Регистрация" }
        }
      }
    }
  }
}
```

В финальный issue body (Шаг 8) `ruleTrees` **не сохраняется** — деревья большие, и `builder_picks[]` + reasoning'и в `rule_contributions[]` уже дают audit-trail. Только для интроспекции в `/test --full`.

**JSON Layout (`_session.json_layout[]`)** — массив объектов с резолвленными ключами:
```
{
  frame: "Экран 7 — Фото · default",
  imports: [{ name: "meshok ↑", key: "..." }, ...],
  slots: {
    "meshok ↑": {
      "navbar#1491:0": "<ComponentNode of navbar 1.0>"  // pseudo-notation
    },
    "meshok ↓": {
      "✏️ buttonsView#1073:1": "<ComponentNode of buttonsViewBottom>",
      "buttonsView#1074:0": true,
      ...
    }
  }
}
```

**Псевдо-нотация в примере.** Стрелка / `<ComponentNode of ...>` — это **документация структуры**, не литерал для копирования в plugin-код. В реальном `code:` параметре `use_figma` slot-значения — это **фактические `ComponentNode` объекты** (или их `.id` строка — зависит от того, что принимает конкретный prop; см. готчу A-046 в `BUILDER_GOTCHAS.md`: для INSTANCE_SWAP передавай `.id`, не строку-ключ). JSON Layout — это **структурное планирование**, plugin-код — отдельная стадия эмиссии.

Оба артефакта **внутренние**, дизайнеру не показываются. Builder использует их как scratch для генерации `code:`-параметра в `use_figma`. **Цель G-I2 — резолвить slot prop names ДО `use_figma`, чтобы ловить A-058-class регрессии в дешёвой текстовой плоскости, не в дорогом Figma round-trip.**

### Порядок G-I1 → G-I2 — последовательный, без апрува между ними

Между G-I1 и G-I2 **нет апрува дизайнера** — оба internal scratchpad'ы. Дизайнер уже апрувил чек-лист Шага 7 (G-V6), и Text Layout / JSON Layout — это детализированные представления того же контента в форматах, удобных Builder'у. Лишний апрув добавил бы раунд-трип без content-выигрыша.

**Почему последовательно, а не параллельно:** JSON Layout зависит от Text Layout (берёт иерархию → резолвит каждый узел). Раздельные шаги дают двухстадийный санити-чек: G-I1 проверяет иерархию (структуру), G-I2 — резолв ключей. Каждый ловит свой класс ошибок. Параллельно одной LLM-итерацией было бы маргинально быстрее (~30s), но это ровно та проблема, что у нас сейчас (LLM делает всё разом, теряет префиксы).

Финальная последовательность Шага 7:

```
[Designer]  апрувит чек-лист построения        → G-V6: PASS
   ↓
[Builder]   строит Text Layout (internal)       → G-I1: PASS (или FAIL → halt)
   ↓
[Builder]   строит ruleTrees из builder_picks   → G-I1.5: PASS (catastrophic FAIL → halt)
            (рекурсивно, anti-cycle Set по path, depth ≤ 10)
   ↓
[Builder]   строит JSON Layout (internal)       → G-I2: PASS (или FAIL → halt)
            (резолвит ключи через slotKey/boolKey, ловит A-058-class)
   ↓
[Builder]   проверяет ruleTrees на пробелы      → G-I2-guard: PASS (soft-fail: warn + continue)
   ↓
[Builder]   use_figma(code: ...)                → G-I3: PASS (errors:[]) или scope-deg
   ↓
[Designer]  видит результат + Figma-ссылку
```

При FAIL на G-I1 — Builder сообщает дизайнеру на человеческом, без G-кода: «вижу, что для экрана X не получается выстроить иерархию по слотам — застрял на компоненте Y. Уточни Z». При FAIL на G-I2 — «не получается подобрать ключ слота `<имя слота>` у компонента X — паттерн неоднозначен, нужна правка `.rule.json` Настей».

---

## Rule-driven instantiation — контракт (meta — для Builder, не выводи дизайнеру)

**Builder не выдумывает дефолты — он ходит в rule.json.** При создании ЛЮБОГО инстанса компонента (`createInstance` или `importComponentByKeyAsync` + setProperties) Builder обязан:

1. **Знать список планируемых компонентов** из CJM/брифа. Формируется на Шаге 5/6 — до G-I1. Не «вспоминать» по ходу сборки, а заранее держать в плане.
2. **Узнать slug** через `registry/index.json` (формат `name → [lib, key, type, tier, validated]`). Это единственная разводная: имя компонента → slug → rule.json. Никаких других router'ов нет, не выдумывай.
3. **Прочитать `rules/components/<slug>.rule.json`** — узкий target, один файл на компонент.
   - Если файла нет → компонент не описан. На уровне Дизайнер — предложи `/fb bug:missing-rule`. На уровне Настя — запусти `/parseProps <имя>`.
   - Если `approved: false` → правило в WIP, используй что есть, но предупреди.
4. **Применить slot'ы из rule.json:**
   - Slot с `pairedBoolean.alwaysOn = true` или `defaultOn = true` → boolean остаётся включённым, **обязательный swap** на `slot.preferred[isDefault=true]`.
   - Slot без `pairedBoolean` (всегда видим) → **обязательный swap** на `slot.preferred[isDefault=true]`.
   - Slot с `pairedBoolean.defaultOn = false` (и не alwaysOn) → boolean = false, slot остаётся placeholder'ом (он скрыт, swap не нужен).
   - Если у slot **нет** isDefault, либо больше одного preferred с isDefault → это сигнал `askDesigner` (не выбирать произвольно).
5. **Применить variants:** взять `variants[].default`. Если есть `builderRule` с условием выбора (например, по контенту cells-list — `between-simple-cells` для текстовых, `between-image-cells` для с картинками) — применить по нему.
6. **Применить booleans:** `defaultOn` применяется явно, включая `false`. Только отсутствие поля (`undefined` / `null`) оставляет Figma default. Для standalone booleans (без `pairedSlot`) контекстный override через `_session.builder_picks` — отдельный issue в эпике #215 (пересечение с part 2 P0-1).
7. **Применить textProps:** если у slot/компонента есть `textProps` — установить осмысленный default (либо `sampleTexts[0]`, либо `askDesigner` для конкретного текста). Не оставлять placeholder-текст («Title», «Subtitle»).

### Контекст брифа имеет приоритет над isDefault

`isDefault` / `default` / `sampleTexts[0]` — это **fallback**, на случай если брифа нет (или он молчит про конкретный prop). При полноценной генерации макета по брифу/CJM Builder обязан **сразу** ставить значения, соответствующие контексту, а не дефолты-заглушки:

| Тип prop'а | Без контекста (структурный тест) | С контекстом (полный билдер по брифу) |
|---|---|---|
| **Slot swap** (INSTANCE_SWAP) | `preferred[isDefault=true]` | Тот `preferred`, чей `usage` соответствует кейсу (например, `navbar @ Lenta` для экрана Ленты, не `navbar 1.0`). isDefault — только если ни один preferred явно не подходит. |
| **Variant** (size/type) | `variants[].default` | Тот вариант, который подходит по контенту/контексту (например, для cards-carousel — size=160 если карточек много на экране, size=320 если 1-2). `builderRule` в rule.json — основной guide. |
| **Boolean** | `defaultOn` / `alwaysOn` | По контексту: если на экране нужен поиск → `search` boolean = true (даже если defaultOff). Если CTA не нужен → `buttonsView` boolean = false. |
| **textProp** | `sampleTexts[0]` | Реальный текст из брифа: «Профиль», «Настройки», «Сохранить». sampleTexts — только fallback для wireframe/skeleton-демо. |

**Когда применять что:**
- **Структурный тест** (Builder проверяет правила, нет конкретного брифа) → isDefault/sampleTexts. Результат — wireframe-макет с условным контентом.
- **Полноценный билдер** (Шаг 5/6 пройдены, есть CJM с описанием контента) → контекстные значения. Результат — макет с реальным контентом, никакие «Title/Subtitle» / «Заголовок» из sampleTexts не должны попасть в финал.

В обоих случаях **placeholder'ов не остаётся** — разница только в *что именно* подставить.

### Рекурсивность — главное правило

> **✅ Status: A-058 закрыт.** Helper `applyRuleDriven(inst, ruleSlug, ctx)` ниже (PR-B #205 Step 1) — реальная реализация рекурсивного контракта через bundle + overrides. Builder должен **обязательно** включать тело этой функции в каждый use_figma снэшот, где создаётся 1+ инстанс из rule-описываемого компонента, и вызывать её сразу после `createInstance()` + `appendChild()`.

Контракт **рекурсивный и полный — `applyRuleDriven` вызывается на каждом созданном инстансе целиком**. Если Builder сгенерировал `use_figma`-код, где какой-то обязательный slot композита не получил `.setProperties()` или swap — это баг кодогенерации, не оптимизация по контексту. После КАЖДОГО swap на свежий preferred-инстанс Builder обязан:

1. Открыть rule.json **того компонента**, на который только что свапнул (через `nestedProps.ruleRef`, либо resolve через `registry/index.json`)
2. Применить шаги 4-7 на этом уровне
3. Для каждого slot, который опять свапнут — повторить шаги 1-3 ещё раз
4. ...и так до листьев (компонентов без вложенных INSTANCE_SWAP, либо до настоящих text/icon-нодов)

**В итоге в макете не должно остаться ни одного placeholder'а** — ни на верхнем уровне (meshok ↑ navbar), ни на среднем (navbar middle slot), ни на нижнем (text «Заголовок»). Placeholder допустим **только** для slots с `pairedBoolean.defaultOn=false` (boolean выключен → slot скрыт → placeholder не виден).

**Обязательно:** каждое решение по slot имеет запись в `_session.builder_picks[]` с непустым `reason`, даже если `confidence: "high"`. Без записи решение не существует — оно не доедет до G-I1.5 и helper свапнет не то, что задумал reasoning.

**Запрещено:**
- `createInstance` без последующих рекурсивных setProperties по rule.json (компонент окажется с placeholder'ами — R-036/R-037).
- Свапнуть верхний slot и остановиться — внутри останутся placeholder'ы вложенных слоёв.
- Выбирать `isDefault` или `pairedBoolean=false` молча, без записи в `_session.builder_picks[]` с `reason`. Каждое решение по slot фиксируется: будь то контекст-match (`confidence: high`), компромисс (`medium`), голый fallback (`low-fallback`) или gap (`decision: gap`, `confidence: none`).
- Игнорировать `slots[].preferred[].usage` при reasoning'е. `usage`-поле — основной guide для выбора preferred, `isDefault` — fallback на случай отсутствия контекста (см. таблицу «Контекст брифа имеет приоритет над isDefault» выше).
- Угадывать pairedBoolean state — читать из rule.json и решать через E.0 reasoning.
- **Оставлять placeholder marker в slot, рассуждая что «этот элемент тут не нужен».**

  У каждого slot есть `preferred[]` — список валидных вариантов и один broken-вариант `placeholder marker`. Если Builder не свапает slot, в макете рендерится именно `placeholder marker` — оранжевая полосатая полоса.

  Решение по slot всегда одно из двух:

  1. **Выключить boolean** — slot невидим, swap не нужен. Применимо, если у slot есть `pairedBoolean` и у него **нет** `alwaysOn: true`. Пример: на экране нет CTA → `buttonsView` boolean = false.

  2. **Включить boolean (или оставить ON) и осознанно выбрать preferred по контексту** — пройтись по `slot.preferred[]`, прочитать поле `usage` у каждого и взять тот, чей `usage` соответствует кейсу. **Не** «лепить isDefault, потому что он помечен». `isDefault` — это fallback на случай отсутствия брифа (структурный тест), а не «умолчательный выбор для всех ситуаций» (см. таблицу «Контекст брифа имеет приоритет над isDefault» выше).

  Примеры пути 2:
  - Онбординг-экран без таббара → `systemComponent` свапнуть на `handle ❖ view` (по `usage: "ДЕФОЛТ для незалогиненной зоны"`). НЕ на `tabbarPrimary` (хоть он и isDefault).
  - Главный экран залогиненного пользователя → `systemComponent` на `tabbarPrimary` (по `usage: "ДЕФОЛТ для залогиненных пользователей"`).
  - Экран ввода PIN → `systemComponent` на `keyboardNumeric` (по `usage: "Экраны ввода цифр"`).

  Третьего пути — «не трогать slot, оставить placeholder» — не существует. Это всегда баг.

  В Шаге 6 E.0 этот бинарный выбор формализуется как `decision: swap | hide`. Промежуточное состояние `decision: gap` означает «Builder не может выбрать сам, спрашивает дизайнера в E.2», и после ответа всё равно резолвится в `swap` (или `hide`) к моменту G-I1.5.

  Как понять, что доступно для конкретного slot:
  - Slot без `pairedBoolean` → только путь 2. Скрыть нельзя.
  - `pairedBoolean.alwaysOn: true` → только путь 2. Boolean заблокирован в ON.
  - Иначе → доступны оба пути, выбор по контексту.

### `applyRuleDriven` — рекурсивный контракт (закрывает A-058)

**Хост-сторона (Builder, в обычной модели — Claude, до вызова `use_figma`):**

После PR-B (#205 Step 1) хост-сторона больше не строит `ruleTree` руками. Builder Шаг 7 / G-I1.5:

1. **Вызывает bundler через Bash** для каждого top-level компонента из плана:
   ```bash
   node tools/build-rule-bundle.js <slug1> [<slug2> ...]
   ```
   Stdout — одна JSON-строка `{"rulesBySlug":{"<slug>":<rule.json>, ...}}`. Bundler сам обходит транзитивное закрытие через `slots[].preferred[].nestedProps.ruleRef`, `nestedInstances[*].ruleRef`, `booleans[*].nestedProps.ruleRef` с per-branch seen Set и depth cap. Никакого ручного walk'а LLM'ом.

2. **Инлайнит bundle в use_figma код** как:
   ```js
   const bundle = JSON.parse('<doubly-encoded JSON string>');
   ```
   **Не упрощать до `${JSON.stringify(bundle)}`** — template-literal hazard: если в `usage` / `intent` / `sampleTexts` встретится `` ` `` или `${` или `\` — синтакс-ошибка или silent injection. `JSON.parse(<строка>)` безопасен в любом случае. Эта строка — load-bearing, не трогать в следующих сессиях без понимания (#205 soft-landmine #1).

3. **Строит `overrides[]` — детерминированную проекцию** из `_session.builder_picks[]` + `_session.text_picks[]`. Узкая проекция, не консолидация — переносим только то, что helper consume'ит. Каждая запись:
   ```js
   // Slot override (decision: swap/hide/gap)
   { kind:'slot', slug, slotProp, path, picked?, pairedBooleanOverride? }
   // Variant override (decision: variant)
   { kind:'variant', slug, variantProp, path, variantValue }
   // Text override (text_picks для componentProperty TEXT-type)
   { kind:'text', slug, slotProp:textProp, path, contextText }
   // TextNode override (text_picks для intrinsic TEXT-ноды)
   { kind:'textNode', slug, textNode:true, path, contextText }
   ```
   - `path` идентичен `_session.builder_picks[].path` (array of strings, slot prop names verbatim, ordered).
   - Helper лукапит через `findOverride()` с element-wise array equality (см. helper body ниже).
   - **`decision:"hide"`** → `pairedBooleanOverride: false` (для slot с pairedBoolean; иначе host-side фиксирует `divergence_step:"unresolvable_force"`).
   - **`decision:"gap"`** без E.2 resolution → host-side фиксирует `divergence_step:"unresolved_gap"`, override не пишется — helper применит `preferred[isDefault]` fallback.

4. **Host-side length-assert:** `overrides.length` ≥ `builder_picks.length + text_picks.length` (часть picks может не пройти в overrides — например, decision:"hide" без pairedBoolean). Резкое расхождение — projection-баг, остановиться. Builder в Шаге 7 эмитит assert ровно перед `const bundle = ...`. Helper тоже делает soft warn если overrides пуст при non-empty rule.slots.

5. **Вызывает helper одной строкой:**
   ```js
   await applyRuleDriven(rootInst, '<topLevelSlug>', {
     bundle, overrides, path: ['<topLevelSlug>'], visited: new Set()
   });
   ```

**Layout resize — обязательство хост-кода.** Сразу после `parent.appendChild(instance)` и **до** `applyRuleDriven`, если `bundle.rulesBySlug[topSlug].layoutRules?.layoutPositioning === 'ABSOLUTE'`:
```js
parent.appendChild(instance);
if (bundle.rulesBySlug[topSlug].layoutRules && bundle.rulesBySlug[topSlug].layoutRules.layoutPositioning === 'ABSOLUTE') {
  instance.resize(parent.width, instance.height);
}
await applyRuleDriven(instance, topSlug, { bundle, overrides, path:[topSlug], visited:new Set() });
```
Helper применит `layoutPositioning` / `constraints` сам (секция 0) — но только при `ctx.path.length === 1` (top-level only). Nested-инстансы layoutRules не получают, они живут в auto-layout родителе.

**«Без I/O в plugin sandbox».** Bundler выполняется на хост-стороне (Bash через инструмент Claude) ДО `use_figma` снэшота. Внутри `use_figma` plugin sandbox'а — никаких `fs`, никаких относительных путей. Bundle уже инлайнен как литерал.

**Эволюция контракта.** До PR-B: host строил nested `ruleTree` walk'ом через `nestedProps.ruleRef`, помещал как литерал в use_figma. После PR-B: bundler детерминированно строит **flat** `rulesBySlug` dict, host эмитит overrides проекцию из builder_picks + text_picks. Helper signature изменилась: `(inst, ruleSlug, ctx)` вместо `(inst, ruleTree)`. `_session.ruleTrees[]` остаётся параллельно как fallback и интроспекция (не убираем — additive only).

**Plugin-сторона (use_figma код):**

```js
// safeSetProps — обёртка над inst.setProperties с валидацией ключа против
// inst.componentProperties и unicode-нормализацией пенсила в начале имени
// (#267). Figma тихо игнорирует unknown prop key: например '✎ placeholder'
// (U+270E LOWER RIGHT PENCIL) визуально неотличим от реального
// '✏️ placeholder' (U+270F PENCIL + U+FE0F variation selector), но
// setProperties по такому ключу — no-op, инстанс остаётся с дефолтным
// placeholder-текстом, Builder не понимает что не сработало.
//
// Контракт:
//   - Если key ∈ inst.componentProperties — пропускаем как есть.
//   - Иначе пробуем normalizePencil(key) — авто-починка U+270E ↔ U+270F+FE0F.
//     Если нормализованный матчит — используем его, console.info с пометкой.
//   - Иначе console.warn и **пропускаем** этот ключ (setProperties без него,
//     но не падаем — остальные ключи применяются).
//   - Возвращаем число реально применённых ключей: нужно для slot-swap, где
//     при неудаче надо continue (не делать рекурсию в несуществующий child).
function safeSetProps(inst, props) {
  if (!inst || !props) return 0;
  const known = (inst.componentProperties && Object.keys(inst.componentProperties)) || [];
  const out = {};
  for (const k of Object.keys(props)) {
    let resolved = known.indexOf(k) !== -1 ? k : null;
    if (!resolved) {
      const norm = normalizePencil(k);
      if (norm !== k && known.indexOf(norm) !== -1) {
        try { console.info('[safeSetProps] pencil normalized:', JSON.stringify(k), '→', JSON.stringify(norm)); } catch (e) {}
        resolved = norm;
      }
    }
    if (resolved) {
      out[resolved] = props[k];
    } else {
      try { console.warn('[safeSetProps] unknown componentProperty key skipped:', JSON.stringify(k), 'on', inst && inst.name); } catch (e) {}
    }
  }
  const n = Object.keys(out).length;
  if (n > 0) {
    try { inst.setProperties(out); } catch (e) { return 0; }
  }
  return n;
}

// normalizePencil — двусторонняя нормализация пенсила в начале имени
// componentProperty. Figma экспозит prop'ы с эмодзи '✏️' (U+270F + U+FE0F),
// но визуально похожий '✎' (U+270E) часто проникает в rule.json /
// hand-written use_figma код. Замена работает в обе стороны (#267).
function normalizePencil(key) {
  if (typeof key !== 'string') return key;
  if (key.charCodeAt(0) === 0x270E) return '✏️' + key.slice(1);
  if (key.charCodeAt(0) === 0x270F && key.charCodeAt(1) === 0xFE0F) return '✎' + key.slice(2);
  return key;
}

// === HELPER_BODY:START applyRuleDriven ===
// applyRuleDriven — рекурсивный helper для R-021/R-036/R-037/A-058.
// Контракт PR-B (#205 Step 1): signature (inst, ruleSlug, ctx) где
//   ctx = { bundle, overrides, path, visited }.
//   - bundle — детерминированный output tools/build-rule-bundle.js. Helper
//     читает rule = ctx.bundle.rulesBySlug[ruleSlug]. Никакого file I/O.
//   - overrides — flat array проекции из _session.builder_picks[] + text_picks[].
//     Каждая запись: { slug, kind, slotProp|variantProp|textProp|textNode, path, ... }.
//     Лукап через findOverride() с element-wise array equality на path.
//   - path — массив slot prop names verbatim, ordered ["meshok-up", "navbar#1491:0", ...].
//   - visited — Set<string> slug'ов уже на текущей ветке. Branch-local, cloned
//     при каждом recurse через new Set([...ctx.visited, ruleSlug]).
//
// При правке между HELPER_BODY:START/END — обязательно прогнать
// `bash tools/verify-helper-sync.sh` до коммита (sync с
// tests/scripts/applyRuleDriven-tests.js literal copy).
function arrayEquals(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b)) return false;
  if (a.length !== b.length) return false;
  for (var i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

function findOverride(overrides, slug, kind, key, path) {
  if (!Array.isArray(overrides)) return null;
  for (var i = 0; i < overrides.length; i++) {
    var o = overrides[i];
    if (o.slug !== slug) continue;
    if (o.kind !== kind) continue;
    if (kind === 'slot' && o.slotProp !== key) continue;
    if (kind === 'variant' && o.variantProp !== key) continue;
    if (kind === 'text' && o.textProp !== key) continue;
    if (kind === 'textNode' && o.textNode !== true) continue;
    if (!arrayEquals(o.path, path)) continue;
    return o;
  }
  return null;
}

async function applyRuleDriven(inst, ruleSlug, ctx) {
  if (!inst) return;
  if (!ctx || !ctx.bundle || !ctx.path || !ctx.visited) {
    try { console.warn('[applyRuleDriven] missing ctx fields'); } catch (e) {}
    return;
  }
  // Cycle guard: per-branch visited Set. Возврат из nested-вызова, sibling
  // slots в parent loop продолжают (branch-local, не module-scoped).
  if (ctx.visited.has(ruleSlug)) {
    try { console.warn('[applyRuleDriven] cycle skipped:', ruleSlug, 'path=', ctx.path.join('/')); } catch (e) {}
    return;
  }
  var rule = ctx.bundle.rulesBySlug && ctx.bundle.rulesBySlug[ruleSlug];
  if (!rule) {
    try { console.warn('[applyRuleDriven] rule missing in bundle:', ruleSlug, 'path=', ctx.path.join('/')); } catch (e) {}
    return;
  }
  var overrides = ctx.overrides || [];
  // Soft warn для likely overrides-projection бага (resolution F из плана #205).
  // Если у top-level rule есть slots, но overrides пусто — Builder скорее всего
  // забыл спроецировать picks. Helper всё равно применит preferred[isDefault]
  // fallback, но это сигнал в логи для post-mortem.
  if (overrides.length === 0 && Object.keys(rule.slots || {}).length > 0 && ctx.path.length === 1) {
    try { console.warn('[applyRuleDriven] overrides empty but rule has slots — projection bug?', ruleSlug); } catch (e) {}
  }

  // --- 0. layoutRules: позиционирование инстанса в parent (top-level only) ---
  // Применяется ДО slots loop: это свойства самого инстанса, swap'ы их не трогают.
  // Контракт: parent у инстанса УЖЕ должен быть (parent.appendChild сделан
  // хост-кодом до вызова applyRuleDriven), иначе Figma отвергнет ABSOLUTE.
  // resize(parent.width, instance.height) helper НЕ делает — нет ссылки на parent
  // в helper-сигнатуре. Resize — ответственность хост-кода use_figma снэшота.
  //
  // Gate ctx.path.length === 1: только top-level (корень bundle'а), nested-инстансы
  // живут в auto-layout родителе, не относительно экрана. Без gate — каждый
  // вложенный инстанс пытался бы стать ABSOLUTE.
  //
  // Edge-case guard (ref #215, sparkle-bug): если parent — auto-layout container
  // (layoutMode !== 'NONE'), Figma примет ABSOLUTE тихо, но parent.width будет
  // content-width minus padding — инстанс не растянется. Helper здесь —
  // defense-in-depth, тихо пропускает.
  if (ctx.path.length === 1 && rule.layoutRules && rule.layoutRules.layoutPositioning === 'ABSOLUTE') {
    var parentLayoutMode = (inst.parent && inst.parent.layoutMode) || 'NONE';
    if (parentLayoutMode === 'NONE') {
      var lr = rule.layoutRules;
      try { inst.layoutPositioning = 'ABSOLUTE'; } catch (e) {}
      var anchored = lr.anchoredTo;
      if (anchored === 'bottom')      { try { inst.constraints = { horizontal: 'STRETCH', vertical: 'MAX' }; } catch (e) {} }
      else if (anchored === 'top')    { try { inst.constraints = { horizontal: 'STRETCH', vertical: 'MIN' }; } catch (e) {} }
      else if (anchored === 'left')   { try { inst.constraints = { horizontal: 'MIN', vertical: 'STRETCH' }; } catch (e) {} }
      else if (anchored === 'right')  { try { inst.constraints = { horizontal: 'MAX', vertical: 'STRETCH' }; } catch (e) {} }
      else if (anchored === 'center') { try { inst.constraints = { horizontal: 'CENTER', vertical: 'STRETCH' }; } catch (e) {} }
      // иначе — anchoredTo unknown → constraints не трогаем.
    }
    // else: auto-layout parent — silent skip (sparkle-guard).
  }

  // --- 1. Slots: swap или skip + рекурсивный вход в nested ---
  for (var slotProp in rule.slots || {}) {
    if (!Object.prototype.hasOwnProperty.call(rule.slots, slotProp)) continue;
    var slotInfo = rule.slots[slotProp];
    var pairedBool = slotInfo.pairedBoolean;
    var slotOv = findOverride(overrides, ruleSlug, 'slot', slotProp, ctx.path);
    var slotVisible = true;

    if (pairedBool) {
      var boolSpec = (rule.booleans && rule.booleans[pairedBool]) || {};
      // pairedBooleanOverride: alwaysOn precedence preserved — defense-in-depth.
      var override = slotOv && slotOv.pairedBooleanOverride;
      var shouldBeOn;
      if (boolSpec.alwaysOn === true) {
        shouldBeOn = true;  // alwaysOn не перебивается override
      } else if (typeof override === 'boolean') {
        shouldBeOn = override;
      } else {
        shouldBeOn = !!boolSpec.defaultOn;
      }
      safeSetProps(inst, { [pairedBool]: shouldBeOn });
      slotVisible = shouldBeOn;
    }

    if (!slotVisible) continue;

    // picked из override.picked (E.0 reasoning через builder_picks) или fallback
    // на preferred[isDefault]. override.picked может быть строкой (preferred.name)
    // или объектом — поддержим оба формата.
    var picked = null;
    if (slotOv && slotOv.picked) {
      if (typeof slotOv.picked === 'string') {
        picked = (slotInfo.preferred || []).find(function (p) { return p.name === slotOv.picked && !p.broken; });
      } else if (typeof slotOv.picked === 'object') {
        picked = slotOv.picked;
      }
    }
    if (!picked) {
      picked = (slotInfo.preferred || []).find(function (p) { return p.isDefault === true && !p.broken; });
    }
    if (!picked || !picked.key) continue;

    var comp;
    try { comp = await figma.importComponentByKeyAsync(picked.key); }
    catch (e) {
      try { console.warn('[applyRuleDriven] importComponentByKeyAsync failed:', picked.key, e && e.message, 'path=', ctx.path.join('/')); } catch (_) {}
      continue;
    }

    // Snapshot children IDs ДО setProperties (#205 Step 2 PR-C2 fix).
    // Figma при INSTANCE_SWAP создаёт новую ноду с новым ID — старая destroy'ится.
    // findSwappedChild ниже использует этот snapshot чтобы найти именно НОВОГО
    // child'а (mainComponent.id matches AND id not in beforeSet), а не первый
    // BFS-матч. Закрывает test (e) multi-instance same-slug different-path
    // (PR-B documented BFS-limitation).
    var childIdsBefore = ('children' in inst) ? inst.children.map(function (c) { return c.id; }) : [];

    if (!safeSetProps(inst, { [slotProp]: comp.id })) continue;

    // Рекурсия: для каждого свапа смотрим nestedProps.ruleRef → если есть,
    // находим child и применяем правило для nested-slug'а.
    var nestedRef = picked.nestedProps && picked.nestedProps.ruleRef;
    if (nestedRef) {
      var child = findSwappedChild(inst, comp, childIdsBefore);
      if (child) {
        await applyRuleDriven(child, nestedRef, {
          bundle: ctx.bundle,
          overrides: ctx.overrides,
          path: ctx.path.concat([slotProp]),
          visited: new Set([...ctx.visited, ruleSlug])
        });
      }
    }
  }

  // --- 2. textProps (componentProperty TEXT-type) ---
  // Приоритет: override.contextText > rule.default > rule.sampleTexts[0].
  for (var textProp in rule.textProps || {}) {
    if (!Object.prototype.hasOwnProperty.call(rule.textProps, textProp)) continue;
    var tp = rule.textProps[textProp];
    var textOv = findOverride(overrides, ruleSlug, 'text', textProp, ctx.path);
    var value = (textOv && textOv.contextText) || tp.default || (tp.sampleTexts && tp.sampleTexts[0]);
    if (value !== undefined && value !== null && value !== '') {
      safeSetProps(inst, { [textProp]: String(value) });
    }
  }

  // --- 3. textNode (intrinsic TEXT-нода) ---
  // Используется когда у компонента нет componentProperty TEXT-type
  // (классический случай: navbar middle "no subtitle · content").
  if (rule.textNode) {
    var tnOv = findOverride(overrides, ruleSlug, 'textNode', null, ctx.path);
    var text = (tnOv && tnOv.contextText) || rule.textNode.default;
    if (text) {
      await setTextNodeContent(inst, text, rule.textNode.font || { family: 'Inter', style: 'Regular' });
    }
  }

  // --- 4. Variants: override.variantValue > rule.default ---
  var variantUpdates = {};
  for (var vProp in rule.variants || {}) {
    if (!Object.prototype.hasOwnProperty.call(rule.variants, vProp)) continue;
    var v = rule.variants[vProp];
    var varOv = findOverride(overrides, ruleSlug, 'variant', vProp, ctx.path);
    var vvalue = (varOv && varOv.variantValue !== undefined) ? varOv.variantValue : v.default;
    if (vvalue !== undefined && vvalue !== null) variantUpdates[vProp] = vvalue;
  }
  if (Object.keys(variantUpdates).length > 0) {
    safeSetProps(inst, variantUpdates);
  }

  // --- 5. Standalone booleans (не paired с slot'ом) ---
  // alwaysOn / defaultOn применяются явно. Закрывает sparkle-баг в inputText.left.
  for (var boolProp in rule.booleans || {}) {
    if (!Object.prototype.hasOwnProperty.call(rule.booleans, boolProp)) continue;
    var b = rule.booleans[boolProp];
    if (b.pairedSlot) continue;  // paired — обработано в slots loop выше
    if (b.alwaysOn) {
      safeSetProps(inst, { [boolProp]: true });
    } else if (typeof b.defaultOn === 'boolean') {
      safeSetProps(inst, { [boolProp]: b.defaultOn });
    }
  }
}
// === HELPER_BODY:END applyRuleDriven ===

// Найти INSTANCE-child который только что свапнули (mainComponent === comp).
// Walk descendants BFS до первого матча.
//
// FIX (post-PR #179): RECTANGLE / TEXT / VECTOR ноды не имеют пропы
// `children` — обычный геттер `n.children` бросает TypeError. Используем
// `'children' in n` guard, чтобы пропускать листовые ноды.
//
// FIX (#205 Step 2 PR-C2): добавлен опциональный `childIdsBefore` snapshot
// массив. Figma при INSTANCE_SWAP создаёт новую ноду с новым ID; snapshot
// фиксирует children IDs ДО swap'а. Helper ищет FIRST match НЕ из snapshot —
// это и есть свежесозданная нода. Закрывает multi-instance same-mainComponent
// проблему: два slot'а с одинаковым preferred получают РАЗНЫХ child'ов
// (каждый swap создаёт уникальный ID). Если childIdsBefore не передан или
// no-new-match (Figma reused ID / уже swapped) — fallback на старое
// поведение (первый BFS-матч), backward-compat preserved.
function findSwappedChild(inst, comp, childIdsBefore) {
  childIdsBefore = childIdsBefore || [];
  var beforeSet = {};
  for (var i = 0; i < childIdsBefore.length; i++) beforeSet[childIdsBefore[i]] = true;
  var queue = [];
  if ('children' in inst) for (var ci = 0; ci < inst.children.length; ci++) queue.push(inst.children[ci]);
  var fallback = null;
  while (queue.length) {
    var n = queue.shift();
    if (n.type === 'INSTANCE' && n.mainComponent && n.mainComponent.id === comp.id) {
      if (!beforeSet[n.id]) return n;        // newly-created child (not in snapshot)
      if (!fallback) fallback = n;           // remember first old match as fallback
    }
    if ('children' in n) for (var cj = 0; cj < n.children.length; cj++) queue.push(n.children[cj]);
  }
  return fallback;
}

// Установить .characters на первую TEXT-ноду найденную BFS-обходом
// descendants инстанса. Загружает шрифт перед записью (иначе Figma
// бросает «cannot set characters: font not loaded»).
//
// Используется когда компонент НЕ exposeит text-componentProperty
// (например, navbar middle content "no subtitle · content" имеет только
// tags/badge/style propы, а текст intrinsic). Закрывает A-040/A-043/A-045
// — silent failure на .characters = text без loadFontAsync.
//
// Ограничение: берёт ПЕРВУЮ найденную TEXT-ноду. Подходит для маленьких
// контейнеров типа navbar middle где TEXT один. Для случаев с несколькими
// TEXT-нодами Builder вызывает setTextNodeContent на конкретный sub-инстанс.
async function setTextNodeContent(inst, text, font) {
  if (!inst || text === undefined || text === null || text === '') return;
  const targetFont = font || { family: 'Inter', style: 'Regular' };
  try { await figma.loadFontAsync(targetFont); } catch (e) { return; }

  const queue = [];
  if ('children' in inst) for (const c of inst.children) queue.push(c);
  while (queue.length) {
    const n = queue.shift();
    if (n.type === 'TEXT') {
      // figma.mixed — Symbol, появляется когда внутри TEXT-ноды inline-форматирование
      // несколькими шрифтами (например, "Привет, **мир**!"). Перезаписать fontName
      // одним шрифтом — потерять mixed-разметку. Skip с silent return: реальный
      // mixed-кейс редок (в navbar middle, simple cells всё одношрифтовое), а
      // когда возникнет — Builder сам обработает через специальный helper.
      if (typeof n.fontName === 'symbol') return;
      try {
        if (n.fontName && typeof n.fontName === 'object' && n.fontName.family !== targetFont.family) {
          await figma.loadFontAsync(n.fontName);
          n.characters = String(text);
        } else {
          n.fontName = targetFont;
          n.characters = String(text);
        }
      } catch (e) {}
      return;
    }
    if ('children' in n) for (const c of n.children) queue.push(c);
  }
}
```

**Пример использования (meshok ↑ с recursive resolution до navbar.middle.text):**

Сценарий: дизайнер собирает экран регистрации. Builder на Шаге 6 E.0 reasoning'е выбирает `navbar 1.0` (есть только этот preferred), `no subtitle · content` для middle slot (контекст «обычная welcome-страница без табов»). На G-I1.5 хост-сторона строит ниже-приведённый ruleTree через walk по `_session.builder_picks[]` рекурсивно.

```js
// 1. ДО открытия use_figma фенса Builder вызывает Bash:
//      node tools/build-rule-bundle.js meshok-up
//    Stdout — одна JSON-строка с rulesBySlug closure, capture в BUNDLE_JSON.
//
// 2. Builder инлайнит bundle через JSON.parse от doubly-encoded string.
//    НЕ упрощать до `${JSON.stringify(bundle)}` — template-literal hazard
//    через `` `, `${`, `\\` в usage/intent/sampleTexts. JSON.parse безопасен.
const bundle = JSON.parse('<BUNDLE_JSON, JSON.stringify(BUNDLE_JSON) ещё раз>');

// 3. Overrides — детерминированная проекция из _session.builder_picks[] +
//    _session.text_picks[]. Builder эмитит литерал. Запись на каждый pick
//    + length-assert: overrides.length >= builder_picks.length + text_picks.length.
const overrides = [
  // Уровень 1 — slot swap meshok-up.navbar#1491:0 → navbar 1.0
  // _session.builder_picks: { slug:"meshok-up", slotProp:"navbar#1491:0",
  //   path:["meshok-up"], decision:"swap", picked:"navbar 1.0" }
  { kind:'slot', slug:'meshok-up', slotProp:'navbar#1491:0',
    path:['meshok-up'], picked:'navbar 1.0' },

  // Уровень 2 — slot swap navbar.✎ · middle · → no subtitle · content
  // _session.builder_picks: { slug:"navbar", slotProp:"✎ · middle ·#1031:6",
  //   path:["meshok-up","navbar#1491:0"], decision:"swap", picked:"no subtitle · content" }
  { kind:'slot', slug:'navbar', slotProp:'✎ · middle ·#1031:6',
    path:['meshok-up','navbar#1491:0'], picked:'no subtitle · content' },

  // Уровень 3 — textNode hydration "Регистрация"
  // _session.text_picks: { slug:"no-subtitle-content", textNode:true,
  //   path:["meshok-up","navbar#1491:0","✎ · middle ·#1031:6"], text:"Регистрация" }
  { kind:'textNode', slug:'no-subtitle-content', textNode:true,
    path:['meshok-up','navbar#1491:0','✎ · middle ·#1031:6'],
    contextText:'Регистрация' }

  // tabs/search/float на welcome не нужны → decision:"hide" в builder_picks,
  // в overrides попадают как { kind:'slot', ..., pairedBooleanOverride:false }.
  // Для краткости здесь опущены, но в реальной use_figma каждый skipped slot
  // обязан иметь запись — отсутствие означает «забытый slot», не «отказ».
];

// 4. Импорт top-level + appendChild + resize (для ABSOLUTE) + helper call.
const meshokUp = await figma.importComponentByKeyAsync('bdebc04b...');
const inst = meshokUp.createInstance();
body.appendChild(inst);
const meshokRule = bundle.rulesBySlug['meshok-up'];
if (meshokRule.layoutRules && meshokRule.layoutRules.layoutPositioning === 'ABSOLUTE') {
  inst.resize(body.width, inst.height);
}

// Один вызов закрывает все 3 уровня — helper рекурсивно идёт по
// nestedProps.ruleRef из bundle, лукапит overrides по (slug, kind, key, path).
await applyRuleDriven(inst, 'meshok-up', {
  bundle, overrides, path: ['meshok-up'], visited: new Set()
});
```

**Что делает helper на каждом уровне (через `bundle.rulesBySlug[slug]` + `overrides`):**
- Уровень 1: `rule = bundle.rulesBySlug['meshok-up']`. Loop по `rule.slots`, для `navbar#1491:0` — `findOverride('slot','navbar#1491:0',['meshok-up'])` → picked = "navbar 1.0", `setProperties({'navbar#1491:0': comp.id})`. Recurse с `path=['meshok-up','navbar#1491:0']`, `visited={'meshok-up'}`, nestedRef='navbar'.
- Уровень 2: `rule = bundle.rulesBySlug['navbar']`. pairedBoolean `· middle ·#1031:15` → boolSpec.defaultOn=true → `setProperties({'· middle ·#1031:15': true})`. Slot `✎ · middle ·#1031:6` → `findOverride` → picked = "no subtitle · content" → swap. Recurse с `path=['meshok-up','navbar#1491:0','✎ · middle ·#1031:6']`, `visited={'meshok-up','navbar'}`, nestedRef='no-subtitle-content'.
- Уровень 3: `rule = bundle.rulesBySlug['no-subtitle-content']`. Нет slots. `rule.textNode` присутствует → `findOverride('textNode',null,...)` → contextText="Регистрация" → `setTextNodeContent`.

**Что закрывает A-058 (валидировано на живом мокапе после fix-PR):**
- **R-021** (navbar.middle placeholder) — закрыт через рекурсию helper'а: bundle содержит `rulesBySlug['navbar']` с описанием middle-slot, helper свапает его на `no subtitle · content` (или другой preferred через overrides), striped placeholder исчезает.
- **R-036** (toast placeholder) — закрыт для meshok ↓ когда `paired-boolean` defaultOn / Builder выставил по контексту (`✏️ float / toast#1868:1` → `toast 1.0`).
- **R-037** (buttonsView placeholder) — то же для meshok ↓ `buttonsView` slot.
- **A-040 / A-043 / A-045** (navbar title не отображается на скрине) — закрыты через `textNode` поле в leaf-rule (например `no-subtitle-content.rule.json`). Helper применяет override.contextText (из `_session.text_picks[]` через overrides projection) либо `rule.textNode.default` через `setTextNodeContent` (`loadFontAsync` + `.characters` set). Применимо когда у компонента **нет** text-componentProperty, а текст — intrinsic TEXT-нода. `textProps` (componentProperty TEXT-type) использовать только когда такая проперть реально expose'нута в `rule.json#textProps`.

**Различие `textProps` vs `textNode`:**

| Когда использовать | `textProps` | `textNode` |
|---|---|---|
| Сценарий | У компонента expose'нута text-componentProperty (видна в `componentProperties` после `createInstance()`, тип `TEXT`) | У компонента нет text-componentProperty, текст — intrinsic TEXT-нода внутри |
| Builder читает из | `rule.json#textProps.<propName>` (если есть) | hand-crafted в ruleTree если интроспекция показала отсутствие text-componentProperty |
| Внутри helper'а | `safeSetProps(inst, { '<propName>': text })` — обёртка над `setProperties` с валидацией ключа и unicode-нормализацией пенсила (#267) | BFS до первой TEXT-ноды + `loadFontAsync` + `.characters = text` |
| Пример | `'text#5615:30': { sampleTexts: [...] }` (`17 · primary ◇ content` имеет text-componentProperty) | `textNode: { contextText: 'Профиль', font: {...} }` (`no subtitle · content` не имеет) |
| Можно ли вместе? | **Нет** — поля mutually exclusive. На один leaf ruleTree используй ровно одно. Если оба заданы, текущий helper применит сначала `textProps` (через setProperties), потом `textNode` (перезапишет TEXT-ноду напрямую) — порядок implementation-defined, не закладывайся. |

**Ограничения (известны, future work):**
- `setTextNodeContent` skip'ает TEXT-ноды с `figma.mixed` шрифтами (Symbol guard) — там inline-форматирование несколькими шрифтами, перезапись одним фонтом потеряет разметку. Для navbar middle / simple cells (одношрифтовые) не воспроизводится.
- `findSwappedChild` использует BFS — на больших инстансах может найти не тот child, если несколько слотов имеют один и тот же mainComponent. Для текущих rule.json это не происходит; если станет проблемой — добавить slot-key match по componentProperties.
- `setTextNodeContent` берёт **первую** найденную TEXT-ноду в descendants. Для маленьких контейнеров (navbar middle, simple cells) работает. Для случаев с несколькими TEXT-нодами на одном уровне Builder должен сам найти правильный sub-инстанс и вызвать helper на нём.
- `contextValue` / `contextText` поля в variants/textProps/textNode — Builder должен сам решать когда вместо `default`/`sampleTexts[0]` подставить контекст из брифа. Helper не знает контекст, только применяет переданное.

### Forbidden API patterns — единственно правильные импорты

`registry/index.json` хранит `componentKey` (конкретный вариант, **не** setKey). Импорт **любого** компонента — через единый API. Generic Figma-API про сеты в нашем потоке не используется.

| ❌ Запрещено | ✅ Использовать | Почему |
|---|---|---|
| `figma.importComponentSetByKeyAsync(key)` | `figma.importComponentByKeyAsync(key)` | Registry хранит componentKey, не setKey. ComponentByKey работает для обоих типов (`c` и `s` — для set возвращает default-вариант, см. CLAUDE.md:198). SetByKey требует другой ключ, у нас его нет. |
| `figma.root.findOne(...)` через имя | `figma.root.children.find(p => p.id === '<id>')` для page, либо `figma.getNodeByIdAsync('<id>')` | findOne рекурсивно сканирует — медленно и непредсказуемо. Целевые lookup'ы по ID/детям быстрее и явные. |
| `frame.resize(375, 812)` | `frame.setBoundVariable('width', screenW); frame.setBoundVariable('height', screenH)` | Никаких литералов размеров — только DS-переменные (R-028). |
| `frame.cornerRadius = 20` | `frame.setBoundVariable('topLeftRadius', baseIslandVar)` и т.д. для каждого угла | Скругления — через DS-переменные. Для асимметричных углов (firstIsland topRadii=0) нужны отдельные ставки на каждый угол. |
| `instance.setProperties({ slotProp: '<key>' })` где `<key>` — registry key | `setProperties({ slotProp: importedComponent.id })` — id, а не key | INSTANCE_SWAP принимает Figma node id, не registry componentKey. Сначала `importComponentByKeyAsync`, потом `.id`. |
| `inst.setProperties({ '✎ placeholder#5913:21': '...' })` напрямую с hand-written ключом | `safeSetProps(inst, { '✏️ placeholder#5913:21': '...' })` — обёртка валидирует ключ против `inst.componentProperties` и нормализует пенсил `✎` (U+270E) ↔ `✏️` (U+270F + U+FE0F) | Figma тихо игнорирует unknown prop key — setProperties отрабатывает «успешно», но изменений нет (#267). Особенно опасно для emoji-пенсила: визуально одинаков, в коде — разные code points. Любой hand-written use_figma код вне applyRuleDriven обязан идти через safeSetProps. |

Если возникает соблазн использовать что-то «логично звучащее» из Figma Plugin API, не указанное в этом списке как ✅, — **остановись и сверься с CLAUDE.md / builder.md**. Generic API-память подведёт.

**Пример: рекурсивный swap для `meshok ↑` (до самого navbar.middle text)** — single-call через helper

```js
// До открытия use_figma фенса:
//   $ node tools/build-rule-bundle.js meshok-up
//   stdout → BUNDLE_JSON
const bundle = JSON.parse('<BUNDLE_JSON, doubly-encoded>');
const overrides = [
  // Уровень 1: meshok-up → navbar 1.0 (default preferred, но писать picked для явности)
  { kind:'slot', slug:'meshok-up', slotProp:'navbar#1491:0',
    path:['meshok-up'], picked:'navbar 1.0' },
  // Уровень 2: navbar → no subtitle · content (context-pick)
  { kind:'slot', slug:'navbar', slotProp:'✎ · middle ·#1031:6',
    path:['meshok-up','navbar#1491:0'], picked:'no subtitle · content' },
  // Уровень 3: textNode для middle text
  { kind:'textNode', slug:'no-subtitle-content', textNode:true,
    path:['meshok-up','navbar#1491:0','✎ · middle ·#1031:6'],
    contextText:'Заголовок' }
];

const cMU = await figma.importComponentByKeyAsync('bdebc04b3e4331a83c8d1d1ede9d78aecfb29a21');
const inst = cMU.createInstance();
body.appendChild(inst);
// layoutRules для meshok-up — ABSOLUTE/top, host-код делает resize до helper'а:
if (bundle.rulesBySlug['meshok-up'].layoutRules &&
    bundle.rulesBySlug['meshok-up'].layoutRules.layoutPositioning === 'ABSOLUTE') {
  inst.resize(body.width, inst.height);
}

// Один вызов закрывает все 3 уровня. Helper рекурсивно идёт по
// preferred.nestedProps.ruleRef из bundle, лукапит overrides по
// (slug, kind, key, path) — никаких ручных swap'ов вне helper'а.
await applyRuleDriven(inst, 'meshok-up', {
  bundle, overrides, path: ['meshok-up'], visited: new Set()
});
// Готово — ни одного placeholder'а вглубь до текста.
```

Этот контракт распространяется на ВСЕ компоненты, не только меш о́ки. Recipes ниже (cells-list / cards-carousel / island / form / content_body) описывают **layout** инстансов; **slot fill / boolean / text** значения внутри них берутся из bundle по той же рекурсивной схеме.

---

## Layout recipes — типовые паттерны (meta — для Builder, не выводи дизайнеру)

Когда дизайнер описывает контент экрана, **не придумывай структуру с нуля**. Сначала проверь, не подходит ли один из готовых паттернов — у них фиксированные recipe'ы Figma-фрейма, которые надо применять как есть.

### Page style modes — выбор перед сборкой content_body

У страницы есть **два взаимоисключающих режима**. Builder выбирает между ними **до того, как начинает собирать content_body**.

**Когда спрашивать дизайнера vs auto-flat.** Перед вопросом посчитай по плану из Шага 6 C: сколько смысловых блоков контента на самом многоблочном экране (без учёта `meshok ↑`/`meshok ↓`).

«Смысловой блок» — группа контента, которую дизайнер при ручной рисовке отделил бы заголовком секции или поместил бы в свой `island`. Не считай отдельным блоком:
- однотипный список ячеек любой длины (5 cell'ов или 50 cell'ов = 1 блок)
- заголовок секции, стоящий над одним списком (`header 1.1` + `cells-list` = 1 блок)
- input с подписью / caption (1 блок)
- иллюстрацию с текстом-описанием рядом (1 блок)

Считай отдельными блоками:
- разные по природе списки рядом (список друзей + лента постов = 2 блока)
- блок чисел/статистики + лента контента под ним (профиль: счётчики + лента = 2 блока)
- настройки с явными секциями-разделителями (каждая секция = 1 блок)

- **Если на каждом экране ≤1 смысловой блок** (например регистрация: телефон → код → имя → фото — на каждом шаге один input + подпись) — **не спрашивай**. Ставь `flat` и одной строкой сообщи дизайнеру:
  > «Сборка плоская, по одному блоку на экран — если нужно по-другому, скажи.»
- **Если хотя бы на одном экране ≥2 смысловых блока** (настройки с секциями, профиль с цифрами + лентой, лента с разными типами блоков) — задавай вопрос:

> «Страница плоская (весь контент на белом фоне, без выделенных блоков) или с островами (контент сгруппирован в белых блоках на сером фоне)?»

В зависимости от выбранного режима (от ответа дизайнера ИЛИ auto-flat) меняется:
- цвет фона страницы (flat → `surface/secondary`, with-islands → `surface/primary`)
- паддинги и gap у content_body
- структура содержимого (свободная в flat, обёрнутая в острова в with-islands)
- куда монтируется `meshok ↑` (см. ниже)

| Режим | Page bg | Контент | Когда выбирать |
|---|---|---|---|
| **flat** | `surface/secondary` (белый/чистый — дефолт страницы) | Cells / carousels / forms / отдельные компоненты — напрямую в content_body | «Плоско», «без выделенных блоков», «обычная страница», регистрации/онбординги/формы |
| **with-islands** | `surface/primary` (серый/тёплый — фоновый слой) | Каждая группа обёрнута в `island` с заливкой `surface/secondary` (белые острова на сером фоне) | «Островками», «сгруппировать контент», «выделенные блоки», настройки/профиль с несколькими секциями |

Cells-list и cards-carousel внутри обоих режимов выглядят одинаково — отличается только наличие обёртки `island` вокруг них и фон страницы.

### Структурные правила меш о́ков (для обоих режимов)

- **`meshok ↓`** — всегда **absolute positioning**, pinned `left + right + bottom`. Висит overlay'ем над content_body. НЕ занимает вертикальное пространство в auto-layout. Поэтому content_body имеет `paddingBottom = const/base/↑vertical↓/content-to-bottom` (32) — чтобы контент не лез под CTA.
- **`meshok ↑`** — по умолчанию **в auto-layout flow**, **первый ребёнок** контейнера, к которому относится:
  - В flat — первый ребёнок `content_body`
  - В with-islands — первый ребёнок **первого острова** (структурно сливается с ним, см. recipe первого острова ниже)
  - **Исключение:** только если дизайнер просит показать **scroll-state demo** (макет в проскролленном состоянии), `meshok ↑` переключается на **absolute** (pinned top/left/right) — чтобы остаться сверху при скролле контента под ним.

### Intent mapping — для дополнительных паттернов поверх page style

Page style выбран — теперь, если дизайнер описывает специфический паттерн контента, применяй соответствующий recipe:

| Дизайнер сказал что-то вроде… | Паттерн | Когда применять |
|---|---|---|
| «список настроек», «список переключателей», «лента простых пунктов», «таблица друзей» | **cells-list** | Вертикальный список однотипных ячеек |
| «горизонтальная подборка карточек», «карусель», «лента товаров/контента горизонтально» | **cards-carousel** | Горизонтальный скролл из uniCard |
| «форма регистрации / логина», «экран с полями ввода», «настройки с полями», «анкета» | **form** | Вертикальный стек полей ввода (inputtext / inputtextarea) с лейблами; обычно внутри island в with-islands режиме |
| «лента постов», «новостная лента», «пост / карточка поста», «фид» | **feed-post** | Вертикальный список карточек постов; **внизу каждой карточки — `buttonsViewFeed`** (бар реакций: лайк / шеринг / букмарк / комментарий). Это единственное место использования `buttonsViewFeed` |

`island` сам по себе **не intent**, а структурный элемент with-islands режима. Применяется автоматически в этом режиме на каждую группу контента.

Если интент **не маппится** ни на один из трёх (cells-list / cards-carousel / form) — собираешь содержимое free-form внутри content_body (flat) или внутри текущего острова (with-islands). Это нормально.

Если интент **маппится** — обязательно применяй recipe целиком (не сокращай свойства и не подменяй переменные). Иначе нарушается consistency между сессиями.

### Общие правила для всех recipes

**Ширина и высота — через DS-переменные и FILL-цепочку.** Никаких литералов `375` / `812` / любых других числовых размеров в коде. Цепочка наследования:

- **Page-frame** (mobile screen) — `width = screen-width`, `height = screen-height` — обе DS-переменные из библиотеки `numbers-paddings` (см. R-028 в `rules/skeleton.md`, источник правды `rules/skeleton.json`).
- **Все child-контейнеры** (`content_body`, `island`, `cells-list`, `cards-carousel`, `form`) — получают width через `layoutSizingHorizontal = 'FILL'` от своего родителя, в конечном итоге от page-frame's screen-width.
- **Высота** — в основном `primaryAxisSizingMode = 'AUTO'` (HUG content). Высоту фиксируют только page-frame (screen-height) и компоненты с фиксированным размером (карточки uniCard со свапом size).

Если в recipe ниже ширина/высота не названа явно через DS-переменную — это **всегда** означает FILL от родителя. Литералов в Builder-коде быть не должно.

**Gap-переменные — выбор по типу контента.** Полная карта:

| Когда | Переменная | Значение |
|---|---|---|
| Между группами контента в **flat** content_body | `const/custom/cp-16` | 16 |
| Между **островами** на page-уровне в with-islands | `const/base/→gap←/between-islands` | 8 (web: 12) |
| **Внутри острова** между его элементами | `const/custom/cp-12` | 12 |
| Между карточками в карусели | `const/base/→gap←/between-cards` | 12 |
| Между текстовыми ячейками на page-уровне | `const/base/→gap←/between-simple-cells` | 24 |
| Между ячейками с изображениями на page-уровне | `const/base/→gap←/between-image-cells` | 16 |
| Между ячейкой и кнопками снизу | `const/base/→gap←/between-bottom-buttons-cells` | 24 |

В каждом recipe ниже указана **default-gap для этого паттерна**. Альтернативы — только если явно нужно (нестандартная плотность).

### Recipe: `content_body` (всегда-присутствующий, top-level body страницы)

Top-level контейнер всего содержимого экрана. Один на страницу, обязательный. **Содержит `meshok ↑` как первого ребёнка** (если он не на абсолютке для scroll-demo). `meshok ↓` висит отдельно на абсолютке поверх content_body — поэтому ему `paddingBottom = content-to-bottom`.

**Ширина и высота (для обоих режимов):**
- Ширина наследуется через `layoutSizingHorizontal = 'FILL'` от page-frame, где `width = screen-width` (DS-переменная из `numbers-paddings`, R-028).
- Высота вычисляется по содержимому: `primaryAxisSizingMode = 'AUTO'`.

#### Mode A: flat (`surface/secondary` page bg — дефолт страницы)

Контент (cells, carousels, formы, отдельные компоненты) сидит **напрямую** в content_body, без обёрток.

```js
// Frame
{
  layoutMode: 'VERTICAL',
  primaryAxisSizingMode: 'AUTO',                              // высота — HUG content
  counterAxisSizingMode: 'FIXED',
  layoutSizingHorizontal: 'FILL',                             // = screen-width
  paddingLeft:   const/custom/cp-16,                          // 16
  paddingRight:  const/custom/cp-16,                          // 16
  paddingTop:    const/custom/cp-16,                          // 16
  paddingBottom: const/base/↑vertical↓/content-to-bottom,     // 32 — зазор под absolute meshok ↓
  itemSpacing:   const/custom/cp-16,                          // 16 — gap между группами контента
  fills:         []                                            // прозрачный — виден surface/secondary страницы
}

// Первый ребёнок content_body — meshok ↑ (если не на absolute)
// Остальные дети — cells-list / cards-carousel / form / отдельные компоненты
```

#### Mode B: with-islands (`surface/primary` page bg, острова с `surface/secondary`)

Контент сгруппирован в острова (см. recipe `island` ниже). Content_body не имеет паддингов — острова идут edge-to-edge со screen-width.

```js
// Frame
{
  layoutMode: 'VERTICAL',
  primaryAxisSizingMode: 'AUTO',                              // высота — HUG content
  counterAxisSizingMode: 'FIXED',
  layoutSizingHorizontal: 'FILL',                             // = screen-width
  paddingLeft:   0,
  paddingRight:  0,
  paddingTop:    0,
  paddingBottom: const/base/↑vertical↓/content-to-bottom,     // 32 — зазор под absolute meshok ↓
  itemSpacing:   const/base/→gap←/between-islands,            // 8 — между островами
  fills:         []                                            // прозрачный — виден surface/primary страницы
}

// Первый ребёнок content_body — первый остров (внутри него — meshok ↑)
// Остальные дети — последующие острова
```

Если страница вообще без content (например, full-screen welcome с illustration на фоне) — `content_body` всё равно ставится (пустой VERTICAL frame с теми же padding'ами в зависимости от режима).

### Recipe: `cells-list` (мигрировано из R-022)

Вертикальный контейнер для однотипных ячеек (`unicell`, `buttoncell`, `selectioncell` — могут смешиваться в любом порядке).

**Ширина и высота:**
- Ширина — `FILL` от родителя (обычно `content_body` или `island`), который в конечном итоге даёт screen-width.
- Высота — HUG по содержимому.

```js
// Frame
{
  layoutMode: 'VERTICAL',
  primaryAxisSizingMode: 'AUTO',            // высота — HUG content
  counterAxisSizingMode: 'FIXED',           // ширина — FIXED (через FILL ниже)
  layoutSizingHorizontal: 'FILL',           // ← наследует width от родителя
  paddingLeft:   const/cell-view/←horizontal→/default,
  paddingRight:  const/cell-view/←horizontal→/default,
  paddingTop:    const/cell-view/↑vertical↓/default,
  paddingBottom: const/cell-view/↑vertical↓/default,
  itemSpacing:   const/cell-view/→gap←/default
}

// Каждая ячейка-ребёнок
cell.layoutSizingHorizontal = 'FILL'
```

Все паддинги и gap — через `figma.variables.importVariableByKeyAsync(<key>)` и `setBoundVariable`. Ключи переменных — в `registry/libraries/numbers-paddings/variables.json`.

**Не клади** ячейки напрямую во фрейм или в контейнер контента без этой обёртки. Обёртка обязательна.

**Альтернативные gap'ы для сложных кейсов** (когда cells-list собирается не из однотипных, а из разнородных ячеек на page-уровне):
- `const/base/→gap←/between-simple-cells` (24) — текстовые ячейки без изображений
- `const/base/→gap←/between-image-cells` (16) — ячейки с изображениями (плотнее)
- `const/base/→gap←/between-bottom-buttons-cells` (24) — между ячейками и кнопками снизу

Для стандартного cells-list используй `const/cell-view/→gap←/default` (12). Альтернативы применяй только когда явно нужно (нестандартная плотность списка).

### Recipe: `cards-carousel`

Горизонтальный скролл из карточек `uniCard 1.0 ❖ view`. Сумма ширин карточек **больше** screen-width — поэтому нужен horizontal scroll.

**Ширина и высота:**
- Ширина — **`FIXED` = screen-width** (наследуется через `FILL` от родителя `content_body` / `island`). Это ключевое: контейнер карусели имеет ширину экрана, и контент внутри скроллится горизонтально, выходя за границы.
- Высота — HUG по карточкам (зависит от выбранного size: 160/220/320).

```js
// Frame
{
  layoutMode: 'HORIZONTAL',
  primaryAxisSizingMode: 'FIXED',           // ширина — FIXED (= screen-width через FILL)
  counterAxisSizingMode: 'AUTO',            // высота — HUG content (= высота карточек)
  layoutSizingHorizontal: 'FILL',           // ← наследует width = screen-width от родителя
  itemSpacing: const/base/→gap←/between-cards,    // 12 — стандарт между карточками
  overflowDirection: 'HORIZONTAL_SCROLLING'        // включает скролл, если контент шире
}

// Каждая карточка — со свапом size при создании (R-027).
// FIXME(#205 Step 4+): этот рецепт всё ещё использует прямой setProperties вместо
// applyRuleDriven. Корректнее: applyRuleDriven(card, 'unicard-view', { bundle,
// overrides:[{ kind:'slot', slug:'unicard-view', slotProp:'size#6313:33',
// path:['unicard-view'], picked:'card320|220|160' }], path:['unicard-view'],
// visited:new Set() }). Не переписан в Step 3 — оставлен как documented
// known-bypass (helper-call adds 6 LOC vs current 1 LOC; cost не оправдан до
// тех пор пока bundle не доезжает до этого callsite в реальных сессиях).
// verify-forbidden-ops пропускает через skip-marker ниже.
// <!-- verify-forbidden-ops:skip-start -->
card.setProperties({ 'size#6313:33': <card320|card220|card160>.id })
// <!-- verify-forbidden-ops:skip-end -->

// Каждая карточка сохраняет свою фиксированную ширину (НЕ FILL)
// — карточки не должны растягиваться, иначе нет скролла
```

Карточки **без свапа size остаются пустыми** — это R-027. Никогда не вставляй `unicard-view` без выбора варианта 320/220/160/custom.

**Gap между карточками — всегда `const/base/→gap←/between-cards` (12).** Других gap'ов для карточек не использовать. Если паттерн требует другой плотности — это отдельный кейс, обсуждай с дизайнером.

### Recipe: `island` (только в with-islands режиме)

Под-блок с собственным фоном `surface/secondary` (приподнятый слой) и скруглением, контрастирует с базовым фоном страницы `surface/primary`. Острова идут edge-to-edge со screen-width (content_body в with-islands не имеет горизонтальных паддингов).

**Внимание:** первый остров на странице ведёт себя **иначе**, чем остальные — он «склеивается» с верхом экрана и встраивает в себя `meshok ↑`. См. два под-recipe ниже.

**Ширина и высота (для обоих):**
- Ширина — `FILL` от content_body (= screen-width, без отступов).
- Высота — HUG по содержимому.

#### Первый остров (содержит `meshok ↑`)

Касается верха экрана, поэтому **верхние углы НЕ скруглены** (0), нижние — `base/island`. Первый ребёнок — `meshok ↑` (edge-to-edge, без зазоров). Поэтому у самого острова **нет paddingTop** — meshok ↑ идёт от самого верха. Контент острова под meshok'ом получает горизонтальный/нижний паддинг через **вложенный wrapper-фрейм** с `cp-16`.

```js
// Outer frame — island 1
{
  layoutMode: 'VERTICAL',
  primaryAxisSizingMode: 'AUTO',            // высота — HUG content
  counterAxisSizingMode: 'FIXED',
  layoutSizingHorizontal: 'FILL',           // = screen-width
  fills: [boundVariable: 'surface/secondary'],
  topLeftRadius:     0,                     // верх острова сливается с верхом экрана
  topRightRadius:    0,
  bottomLeftRadius:  base/island,
  bottomRightRadius: base/island,
  paddingLeft:   0,                         // meshok ↑ внутри идёт edge-to-edge
  paddingRight:  0,
  paddingTop:    0,
  paddingBottom: 0,                         // контент под meshok'ом получает свой паддинг через wrapper
  itemSpacing:   0
}

// children of island 1:
// 1) meshok ↑ (auto-layout, edge-to-edge, full width)
// 2) inner-content wrapper (VERTICAL, FILL width):
//      paddingLeft / Right / Bottom = const/custom/cp-16
//      paddingTop  = 0 (meshok ↑ сверху уже даёт визуальный зазор)
//      itemSpacing = const/custom/cp-12
//      содержимое — cells-list / carousel / form / компоненты
```

#### Последующие острова (island 2..N)

Не касаются краёв экрана, поэтому **все 4 угла скруглены** `base/island`. Без meshok'а внутри, паддинги одинаковые со всех сторон.

```js
// Frame
{
  layoutMode: 'VERTICAL',
  primaryAxisSizingMode: 'AUTO',            // высота — HUG content
  counterAxisSizingMode: 'FIXED',
  layoutSizingHorizontal: 'FILL',           // = screen-width
  fills: [boundVariable: 'surface/secondary'],
  topLeftRadius:     base/island,
  topRightRadius:    base/island,
  bottomLeftRadius:  base/island,
  bottomRightRadius: base/island,
  paddingLeft:   const/custom/cp-16,
  paddingRight:  const/custom/cp-16,
  paddingTop:    const/custom/cp-16,
  paddingBottom: const/custom/cp-16,
  itemSpacing:   const/custom/cp-12
}

// Содержимое — открытый список:
// - cards-carousel
// - cells-list
// - form
// - произвольные компоненты
```

Острова — это структура «контент с собственным контейнером». Внутри одного острова можно смешивать паттерны (heading + carousel, cells-list + form, и т.д.).

### Recipe: `form`

Вертикальный стек полей ввода с лейблами (`inputtext` / `inputtextarea`). Обычно form собирается **внутри `island`**, не как прямой ребёнок content.

**Ширина и высота:**
- Ширина — `FILL` от родителя (обычно `island`), который даёт screen-width минус island padding.
- Высота — HUG по содержимому.

```js
// Frame
{
  layoutMode: 'VERTICAL',
  primaryAxisSizingMode: 'AUTO',            // высота — HUG content
  counterAxisSizingMode: 'FIXED',           // ширина — FIXED (через FILL ниже)
  layoutSizingHorizontal: 'FILL',           // ← наследует width от island
  paddingLeft:   const/wrapper/←horizontal→/default,
  paddingRight:  const/wrapper/←horizontal→/default,
  paddingTop:    const/wrapper/↑vertical↓/default,
  paddingBottom: const/wrapper/↑vertical↓/default,
  itemSpacing:   const/base/→gap←/between-simple-cells    // 24 — между полями формы
}

// Каждое поле
inputField.layoutSizingHorizontal = 'FILL'
```

Допустимые компоненты внутри: `inputtext`, `inputtextarea`, и опционально подсказки/лейблы через `* · NN ◇ content` (см. R-024 про размеры — для form-лейблов обычно size 13 или 15).

**Закрепляющая кнопка** формы («Сохранить», «Зарегистрироваться», «Продолжить») — НЕ в form-фрейме. Она screen-level CTA и живёт в `meshok ↓` (R-1).

Если form содержит **много секций** (например, «Личные данные» + «Контакты» + «Безопасность»), каждая секция = свой `island`, заголовок секции — `header 1.1` (R-024).

---

## Шаг 0 — Сессия (внутреннее, не выводи дизайнеру)

В самом начале, **до** Шага 1, тихо инициализируй сессию. Это служебный шаг, дизайнер ничего не должен заметить.

1. **Сгенерируй `session_id`** — UUID-v4. Используй любой подходящий способ (например, через `Bash` команду `python3 -c "import uuid; print(uuid.uuid4())"` или просто сгенерируй похожую строку самостоятельно — главное, чтобы была уникальной для этой сессии).
2. **Запомни `ts_start`** — текущий ISO-8601 timestamp.
3. **Узнай `designer_login`** через `mcp__github__get_me` → `login`. Кэшируй на всю сессию. Если MCP недоступен или вернул ошибку — используй `"unknown"` и не падай.
4. **Инициализируй счётчики** в своей рабочей памяти на эту сессию:

   ```
   _session = {
     session_id, ts_start, designer_login,
     component: null,
     stages: { research: false, analytics: false, product: false, experience: false, cjm: false, figma_build: false },
     cjm_iterations: 0, figma_iterations: 0,
     import_success: null, components_imported: 0,
     watchpoints_fired: [],
     retries: { import: 0, cjm_redo: 0 },
     placeholder_pct: null, accuracy_pct: null,
     auto_bug_issues: {},   // type → issue_number, для дедупа в этой сессии
     gates_passed: [],      // [{id, status, reason, ts}, ...] анти-skip + audit с timestamp'ами
     text_layout: [],       // G-I1 артефакт: иерархия по фреймам (см. секцию «Гейты»)
     json_layout: [],       // G-I2 артефакт: дерево с резолвленными prop keys
     user_feedback_baseline: null,         // { n, m } из Шага 0.X, или null если не собралось
     user_feedback_baseline_source: null,  // "search" | "list" | null — какой путь сработал (для телеметрии)
     user_feedback_session_delta: 0,       // +1 на каждый /fb в этой сессии
     user_feedback_recent_titles: [],      // top-3 нормализованных title закрытых ≤14 дней
     user_feedback_shown_titles: [],       // уже показанные в этой сессии — не повторяемся
     personal_thanks_emitted: false,       // true если Под-шаг 8.X вывел default-ветку реплики
     target_platform: null,                // "android" | "ios" | "web" | "mob" — куда кладём фреймы (Шаг 0.Y)
     target_section_id: null,              // id Figma SECTION-ноды текущей платформы
     platform_sections: {},                // { android: id|null, ios: id|null, web: id|null, mob: id|null } — кэш на сессию
     section_created: false,               // true если секция была создана Builder'ом в Шаге 0.Y (фолбэк)
     semantic_roles_enabled: true,         // P2 (#215) feature flag. PR #1a — schema-infra (default false). PR #1b — bootstrap namespace `system` (default остался false). PR #1c активирует на true по умолчанию: E.0 reasoning применяет semantic-roles фильтр для slot.role/preferred.semanticRoles[]. При false (rollback override) — Builder работает по старому пути (preferred[isDefault]). Rollback path при regression — переключение на false через override в /builder сессии.
     propagation: null,                    // null | объект { source, destinations[], copied, errors } — итог Шага 7.5 (свободный выбор destination'ов)
     ios_propagated: null,                 // null | true | false — derived из propagation для обратной совместимости с aggregate-sessions.py
     passport_filled: null,                // null | объект { designer, product, featureName, shortDescription, jiraUrl } — итог Шага 7.6
     target_file_key: null,                // fileKey файла, в который Builder пишет (Шаг 0.W)
     target_page_id: null,                 // null = ветка 1 (новый файл из шаблона, дефолтная страница); строка типа "2:3" = ветка 2 (новая страница в существующем файле)
     builder_picks: [],                    // Решения Builder'а на Шаге 6 E.0 reasoning. Источник правды для G-I1.5 (построение ruleTree). Заполняется ДО E.1/E.2. Дискриминант по `decision`:
                                           //   slot:    { slug, slotProp, path, decision: "swap"|"hide"|"gap", picked, reason, confidence: "high"|"medium"|"low-fallback"|"none", ts, matched_roles?: string[] }
                                           //   variant: { slug, variantProp, path, decision: "variant", picked, reason, confidence: "high"|"medium"|"low-fallback", ts } — только для variants с непустым `builderRule` И `options.length > 1`; иначе default применяется молча.
                                           // matched_roles?: набор ролей, который E.0 reasoning сопоставил с контекстом экрана при выборе этого slot (только если у slot задан `role` И `semantic_roles_enabled === true`). Per-pick, не глобальное `_session.active_roles` — ad-hoc сопоставление LLM-judgment'ом не детерминировано, поэтому хранится как «что Builder увидел при этом конкретном решении». Используется Шагом 8 auto-snapshot для diff между сессиями без реверс-инжиниринга из reason'а. **Invariant:** при `semantic_roles_enabled === false` поле всегда `undefined` (semantic-фильтр не запускался — нечего фиксировать).
     ruleTrees: [],                        // [{ topLevelSlug, layoutRules?, slots: {...}, booleans, textProps, variants, nested }] — построен на G-I1.5 из builder_picks[] через walk с anti-cycle (depth ≤ RULE_TREE_MAX_DEPTH=10). layoutRules — top-level only (см. шаг 4.5 контракта построения), nested.* без layoutRules: nested-инстанс крепится к auto-layout родителю, не к экрану. Инлайнится в use_figma код на G-I3. В финальный issue body НЕ сохраняется (большие деревья); builder_picks + rule_contributions дают audit-trail. Только для интроспекции в /test --full.
     text_picks: [],                       // Тексты для textProps / textNode компонентов из плана, выбранные Builder'ом на Шаге 6 E.0.5. Источник правды для G-I1.5 hydration (ruleTree[*].textProps[X].contextText / ruleTree[*].textNode.contextText). Формат:
                                           //   { slug, path, textProp, textNode, text, source, ts }
                                           // path — полный путь до компонента-владельца text-target'а (идентичен path в соответствующей builder_picks записи). textProp заполнено для componentProperty TEXT-type (например, "✎ label#13004:2"); textNode: true для intrinsic TEXT-нод. Mutually exclusive.
                                           // source enum: "brief" (явно из брифа), "cjm" (из CJM), "text_layout" (из _session.text_layout иерархии), "designer_override" (E.1 / drill-down правка). rule_default не пишется — default применяется молча через helper fallback.
                                           // Дедуп: (slug, path, textProp|textNode). designer_override делает upsert по этому ключу + обновляет source и ts.
                                           // Сбрасывается в начале E.0.5 (симметрично reset builder_picks в E.0) — walk-back из Шага 7 H обнуляет тексты прошлого прохода, план мог измениться.
     rule_bundle: null,                    // null | { rulesBySlug: { <slug>: <rule.json contents>, ... } } — детерминированный output `tools/build-rule-bundle.js` (#205 Step 1, PR-B). Builder на G-I1.5 вызывает bundler через Bash, capture stdout, инлайнит в use_figma код как `const bundle = JSON.parse('<doubly-encoded>');`. Closure от каждого top-level slug через BFS по slots[].preferred[].nestedProps.ruleRef + nestedInstances[*].ruleRef + booleans[*].nestedProps.ruleRef, depth ≤ RULE_TREE_MAX_DEPTH=10, per-branch seen Set. Helper читает rule напрямую из `ctx.bundle.rulesBySlug[ruleSlug]` без file I/O. Поле additive — параллельно с `ruleTrees[]` (legacy, не убираем минимум 2 недели наблюдения). aggregate-sessions.py не требует расширения — root `additionalProperties: true`.
     rule_contributions: []                // [{ type, component, slug, hint, ts, ...type-specific }] — данные для эволюции правил. Три типа: "usage-hint" (free-text, компонент без контекстной guidance), "structural-gap" (enum + opt freetext, slot где reasoning не сошёлся), "divergence" (auto-record когда финальный выбор ≠ builder_picks[].picked). Обратная совместимость: записи без `type` трактуются как "usage-hint". Идут в issue body в Шаге 8; /fbAnalyzer агрегирует через `aggregate-sessions.py --rule-contributions`.
   }
   ```

5. Эти поля ты заполняешь по ходу сессии. В конце (Шаг 8) сохранишь всё в GitHub Issue.

### Шаг 0.W — Целевой файл

Дублирование Figma-файла через MCP/Plugin API **физически невозможно** (`figma.root.name` не writable, `duplicate`/`copy` API нет). Поэтому дизайнер заранее готовит место руками — новый файл или новую страницу в уже существующем — и присылает ссылку. Билдер только убеждается, что пишет в правильное место, не в эталон.

Один из самых первых шагов сессии (до сбора personal-thanks-baseline в 0.X и до целевой секции в 0.Y) — спроси у дизайнера, куда писать:

> «Прежде чем начнём — куда собираем макет?
>
> 1. **В новый файл из шаблона** (рекомендую для отдельной задачи): открой `https://www.figma.com/design/lLRNpfRxlgBLrPezcOKCME/` → `File → Duplicate` → переименуй на `<проект> | <твоё имя>` → скинь сюда ссылку на копию.
> 2. **В существующий файл** (где ты уже работаешь): добавь в нём новую страницу (`+` в панели страниц), назови по своей задаче, скинь сюда ссылку на эту страницу (правая кнопка на странице → `Copy link to page`).»

Жди ответ — это либо номер ветки + URL, либо просто URL (тогда определи ветку по содержанию URL: если есть `node-id=` — это ветка 2 с page-id; если нет — ветка 1, целый файл).

**Парсинг URL:**
1. `fileKey` — регексп `figma\.com/design/([A-Za-z0-9]+)/`. Не парсится → «не вижу fileKey, проверь ссылку». Жди.
2. `pageId` (опционально) — регексп `[?&]node-id=([0-9]+-[0-9]+)` → конвертируй `-` → `:` (т.е. `2-3` → `2:3`). Если найден → ветка 2 (existing file + new page). Иначе → ветка 1 (new file).

**Защита от писания в эталон.** Если `fileKey === "lLRNpfRxlgBLrPezcOKCME"` и нет `pageId` → это сам шаблон-исходник, отказ:

> «Это сам шаблон, в него писать нельзя — испорчу копии у всех. Либо дублируй файл (`File → Duplicate`), либо добавь страницу в свой существующий файл и пришли ссылку на неё.»

Жди новый ответ.

**Sanity-check через `get_metadata`.**
- Ветка 1 (новый файл): `mcp__...__get_metadata(fileKey)` без `nodeId` — получишь список страниц.
- Ветка 2 (existing + page): `mcp__...__get_metadata(fileKey, nodeId=pageId)` — должен вернуть узел с типом `canvas` (страница). Если тип другой (FRAME, COMPONENT и т.п.) — дизайнер скопировал ссылку не на page, а на какой-то слой внутри. Ниже в блоке «Различай тип ошибки» есть реплика для этого случая.

**Различай тип ошибки** при анализе фейла:
- **MCP вообще не отвечает** (connection refused, timeout, ошибка про отсутствие server'а / handshake) → это не «файл недоступен», это Figma MCP не подключён. Перепрыгни в `.claude/commands/connectFigmaMCP.md` и веди дизайнера по нему. После успешного подключения вернись в 0.W и переспроси URL.
- **MCP ответил, но 404 / 403 / «file not found» / «no access»** → файл/страница реально недоступны. Реплика: ветка 1 — «не могу открыть файл, проверь права доступа или ссылку»; ветка 2 — «эта ссылка не на страницу, попробуй ещё раз — правая кнопка на странице → `Copy link to page`». Жди новый URL.
- **MCP ответил, но узел не page (для ветки 2 тип не canvas)** → та же реплика что 404 для ветки 2.

**Сохранение в `_session`:**
- Ветка 1 → `target_file_key = fileKey`, `target_page_id = null` (используем первую страницу файла по умолчанию).
- Ветка 2 → `target_file_key = fileKey`, `target_page_id = pageId`.

**Поведение в зависимости от ветки:**
- Ветка 1 (новый файл из дубликата): на первой странице есть готовая структура шаблона (4 секции + паспорт + helpers). Шаги 0.Y / 7 / 7.5 / 7.6 работают как обычно.
- Ветка 2 (новая страница в существующем файле): страница пустая. Шаг 0.Y не найдёт секции и предложит создать. Паспорта на странице нет — Шаг 7.6 пропустится с одной строкой дизайнеру: «эта страница без паспорта, заведи руками если нужен».

**Все вызовы `use_figma`** в этом и последующих шагах передают `fileKey = _session.target_file_key`. Если `_session.target_page_id` не `null`, **первой строкой** в каждом `use_figma`-блоке делай `await figma.setCurrentPageAsync(await figma.getNodeByIdAsync(TARGET_PAGE_ID))` — без этого MCP работает с первой страницей, и в ветке 2 фреймы поедут не туда.

**Если дизайнер хочет работать прямо в эталонном шаблоне** (например, чинит сам шаблон): на «но мне в шаблон» Builder отвечает:

> «Тогда это не задача для `/builder` — открой Настей.»

И стоп сессии.

**Телеметрия:** `_session.target_file_key`, `_session.target_page_id` уходят в session-issue Шага 8.

### Шаг 0.X — Personal thanks baseline

Тихо собираем счётчик личного вклада дизайнера, чтобы в финале (Шаг 8) сказать тёплое спасибо с конкретикой. Никакого вывода дизайнеру здесь нет.

1. **Kill-switch:** если файл `.claude/personal-thanks-paused` существует — пропусти весь блок, оставь `_session.user_feedback_baseline = null`. Сразу к Шагу 1.

2. **Unknown login:** если `designer_login == "unknown"` или пустой — оставь `null`, сразу к Шагу 1.

3. **Sanity-check логина** перед инжектом в search query: `designer_login` должен матчить регексп `^[A-Za-z0-9](?:[A-Za-z0-9-]){0,38}$`. Если не матчит (содержит спецсимволы, `[bot]`-суффикс, пробелы, или длиннее 39 символов) → `_session.user_feedback_baseline = null`, сразу к Шагу 1. Защита от инжекта в search-синтаксис и от подменённого `get_me`. **Это weak-check, не строгая GitHub-спецификация:** регексп пропускает `foo--bar` и `foo-` (GitHub их запрещает), но для нашей цели хватает — такие логины просто вернут `total_count = 0` в search, что валидно. Цель — отсечь явный мусор, не реализовать полный валидатор.

4. Иначе сделай три read-only запроса через `mcp__github__search_issues`. Базовый query:

   ```
   repo:kotik-botik/kotik-botik is:issue label:designer-feedback -label:session-telemetry author:<designer_login>
   ```

   - **N (всего):** `state: "all"` → `_session.user_feedback_baseline.n = total_count`.
   - **M (закрыто):** `state: "closed"` → `_session.user_feedback_baseline.m = total_count`.
   - **Top-3 свежих:** `state: "closed"`, `sort: "updated"`, `direction: "desc"`, `perPage: 5`. Возьми те issue, у которых `closed_at` не старше 14 дней от `ts_start`. Нормализуй каждый title (см. ниже), отбрось пустые. Сохрани до трёх в `_session.user_feedback_recent_titles`.

   Если оба `total_count`-запроса вернулись успешно — `_session.user_feedback_baseline_source = "search"`.

5. **Если любой из запросов упал** (4xx, таймаут, 403 на права search'а) → переходи к fallback (п. 6). Не падай, не пиши дизайнеру.

6. **Fallback при 403 на search:** если у Дизайнера с Read-role `search_issues` не пропускает — попробуй `list_issues` c `labels: ["designer-feedback"]`, `state: "ALL"`, `perPage: 100`, и отфильтруй на клиенте по `user.login == designer_login`. Считай длину массива → `n`. Для `m` — пройди по `state == "CLOSED"`. Top-3 свежих — отсортируй по `closed_at desc`, возьми ≤14 дней. Если успешно — `_session.user_feedback_baseline_source = "list"`. Если и `list_issues` упал — `baseline = null`, `baseline_source = null`.

**Нормализация title:**

- Префикс `^\[[A-Za-z][A-Za-z-]*\]\s+` (любой `[xxx] `, регистронезависимо — ловит и `[designer]`, и `[BUG]`, и `[Designer]`) — убрать.
- Удалить все вхождения кавычек: `« » " ' „ " ' ”`.
- Схлопнуть подряд идущие пробелы в один, trim.
- Если результат пуст или короче 4 символов (отсекаем мусор типа «404», «n/a») — отбрось.
- Если длиннее 60 — обрежь по последнему пробелу до ≤60 и добавь `…`.

**Фильтр свежести (top-3):** для каждой issue из выдачи третьего запроса — если `closed_at` отсутствует, не парсится, или старше 14 дней от `ts_start` → пропусти. Берём только надёжно свежие.

### Инкремент session-delta

Везде, где builder через свою логику создаёт issue с лейблом `designer-feedback` (например, после ветки на pulse-negative-сигнал в Шаге 8 предлагает `/fb` и issue создаётся) — после успешного `issue_write`:

```
if _session.user_feedback_baseline is not None:
    _session.user_feedback_session_delta += 1
```

Это нужно, потому что search-индекс GitHub отстаёт на минуты, и свежесозданный репорт без инкремента не попадёт в `N` к финалу той же сессии.

**Auto-bug issues** (из watchpoints с label `auto:bug:*`) — **в delta не идут**: они помечены `auto:bug:*`, не `designer-feedback`. Дизайнер их «не репортил» руками — не его вклад в этой механике.

Сразу к Шагу 0.Y.

### Шаг 0.Y — Целевая секция платформы

Тихий пре-шаг, дизайнер ничего не видит на happy path. Билдер по умолчанию пишет фреймы **в платформенную секцию** шаблона-паспорта (`Android` / `iOS` / `Web` / `Mob`), а не «куда-нибудь на странице». Здесь мы её находим и запоминаем — до того как пойти в Шаг 1.

1. Через `use_figma` собери список секций целевой страницы и их id:

   ```js
   // Ветка 2 — переключимся на нужную страницу
   if (TARGET_PAGE_ID) {
     await figma.setCurrentPageAsync(await figma.getNodeByIdAsync(TARGET_PAGE_ID));
   }
   return figma.currentPage.children
     .filter(function(n){ return n.type === 'SECTION'; })
     .map(function(n){ return { id: n.id, name: n.name }; });
   ```

   Распарси ответ и заполни `_session.platform_sections`:
   - `android` → id секции с **точным** именем `Android` (или `null`)
   - `ios` → `iOS`
   - `web` → `Web`
   - `mob` → `Mob`

2. **Дефолт — Android.** Установи `_session.target_platform = "android"`, `_session.target_section_id = _session.platform_sections.android`.

3. **Если `target_section_id == null`** (Android-секции нет) — выведи дизайнеру:

   > «Не вижу на этой странице секции `Android` — обычно она есть в шаблоне-паспорте. Создать пустую и собирать туда? (`да` / `нет — другая платформа` / `нет — отмена`)»

   Ветки:
   - apruv-word → `use_figma` создаёт секцию: `var s = figma.createSection(); s.name = 'Android'; figma.currentPage.appendChild(s); return s.id;`. Запиши id в `target_section_id` и `platform_sections.android`, `_session.section_created = true`. К Шагу 1.
   - «нет — другая платформа» → переспроси какую (`iOS`/`Web`/`Mob`), проверь её id в `platform_sections`. Если её тоже нет — снова предложи создать (теперь с нужным именем).
   - «нет — отмена» → halt: «понятно, открой нужный файл и перезапусти `/builder`». Без issue, без шума.

4. **Если секция найдена** — продолжай молча, к Шагу 1.

**Переключение платформы в брифе (Шаг 3).** Если дизайнер в уточняющих вопросах сказал «это для iOS» / «делаем сразу веб», Research Agent передаёт это в `researchOutput`. После Шага 3 ты ловишь сигнал и перенастраиваешь `target_platform`/`target_section_id`. Если новой целевой секции нет в `platform_sections` — повторяешь алгоритм п. 3 для неё.

**Телеметрия:** `_session.target_platform`, `_session.section_created` уйдут в telemetry-issue Шага 8.

---

## Шаг 1 — Подключение к Figma

Вызови `whoami`. Если ок — переходи к шагу 2 без сообщений.
Если упало — открой `.claude/commands/connectFigmaMCP.md` и веди по нему.

---

## Шаг 2 — Анонс

> «Сейчас я соберу всё необходимое для макета — это займёт несколько минут.
>
> 1. Задам уточняющие вопросы по задаче
> 2. При желании подключим экспертов — аналитика, продакта или поищем похожий опыт других компаний
> 3. Покажу маршрут пользователя (CJM) — ты проверишь, всё ли правильно
> 4. После апрува нарисую макет в Figma
>
> Поехали!»

Сразу к шагу 3.

---

## Шаг 3 — Брифинг

Запусти Research Agent (`src/agents/research/RESEARCH_AGENT.md`). Он:
- просит описать задачу,
- задаёт 3–5 уточняющих вопросов,
- опционально просит референсы,
- формирует `researchOutput`.

**Эскалация «не знаю» → агент-эксперт.** Если на каком-то вопросе дизайнер ответил «не знаю» / «посмотри как у X» / «я не уверен», **не угадывай сам**. Сразу предложи конкретного эксперта под вопрос (без ожидания Шага 4):

- Метрики/CTR/конверсия/«как улучшить показатель» → **Аналитик** (`extensions/analytics.md`).
- Приоритеты, ограничения, MVP-скоуп → **Продакт-менеджер** (`extensions/product.md`).
- «Как у X», «как в продах», бенчмарки референсов → **Агент опыта** (`extensions/experience.md`).

Формат: одной репликой — «На этот вопрос лучше отвечает <агент>. Запускаю — или у тебя есть свой ответ?». Если дизайнер апрувит — открываешь `.claude/commands/extensions/<name>.md` и проводишь короткий вопрос-ответ на конкретно этот вопрос (не полный extension-флоу). После — возвращаешься к оставшимся уточняющим вопросам Research Agent.

В Шаге 4 расширения предлагаются на более широкий контекст всей задачи, не на отдельный вопрос — это разные сценарии.

Когда получены ответы на все вопросы — сразу к шагу 4. Явный апрув не нужен.

> _Если что-то непонятно или хочешь зафиксировать замечание о работе скилла — напиши прямо, я создам issue через `/fb`. Между шагами останавливаться можно в любой момент._

**Телеметрия:** установи `_session.stages.research = true` и `_session.component` (основной компонент задачи, в формате `Library/Component`).

---

## Шаг 4 — Расширения (опционально)

Спроси:

> «Хочешь подключить экспертов перед тем как я начну проектировать?
>
> - **Аналитик** — оценит задачу с точки зрения метрик и поведения пользователей
> - **Продакт-менеджер** — расставит приоритеты и выявит ограничения
> - **Агент опыта** — найдёт похожие кейсы зарубежных компаний с результатами в метриках
>
> Можно выбрать несколько. Или сразу строим маршрут?»

Для каждого выбранного — открой `.claude/commands/extensions/<name>.md` (`analytics.md`, `product.md`, `experience.md`).
Расширение использует `researchOutput` уже из контекста (не перечитывает файлы), при необходимости задаёт доп. вопросы и возвращает выводы.

После каждого — предложи следующего или дальше. Отказ → шаг 5.

> _Если экспертная реплика была мимо темы или подсветила баг в работе скилла — `/fb` (опишешь, я создам issue)._

**Телеметрия:** для каждого реально запущенного расширения установи соответствующий флаг в `_session.stages` (`analytics`, `product`, `experience`).

---

## Шаг 4.5 — Takeaway от расширений (gate)

**Срабатывает только если в Шаге 4 был запущен хотя бы один extension.** Если ни одного — пропусти и иди в Шаг 5.

Если был хотя бы один — **до Шага 5 (CJM)** выведи дизайнеру структурированный takeaway: «вот что я заберу в CJM от каждого эксперта». Это **gate** — ждёшь явный apruv-word (см. `rules/approval-tokens.json`).

Формат:

```
Прежде чем строить CJM — что я унесу от экспертов:

**Аналитик** (если запускался):
- <тезис 1, который пойдёт в макет>
- <тезис 2>

**Продакт** (если запускался):
- <тезис 1>
- <тезис 2>

**Агент опыта** (если запускался):
- <тезис 1>
- <тезис 2>

Всё это учитываю в CJM. Если что-то лишнее или не хватает — скажи; иначе апрув, и поехали к маршруту.
```

Правила:
- **Пункты — на языке макета**, не пересказ экспертной реплики дословно. «Аналитик сказал: метрика конверсии падает на phone-step» → takeaway: «отдельный фрейм error для невалидного номера + skeleton при отправке».
- **Жди явный apruv-word.** Без апрува CJM не строишь. «Продолжай» / «дальше» — **не** апрув (deny_list).
- **На правки** («это убери», «вот это добавь», «<эксперт> не учитываем») — обнови takeaway и выведи заново до апрува.
- **Не дублируй takeaway** в CJM — он уже зафиксирован тут. В Шаге 5 (CJM) используй принятые пункты как контекст, не пересказывай.

**Телеметрия:** при получении явного апрува установи `_session.takeaway_approved = true`. Если ни одного extension не было — флаг **не** устанавливается (gate не применим). Парсится `tools/aggregate-sessions.py` как опциональный сигнал (отсутствие при наличии extension flags — пропущенный gate, не A-056 critical).

---

## Шаг 5 — CJM

На основе `researchOutput` + выводов расширений построй CJM:

```
## CJM: [название флоу]

### Экран 1 — [название]
- Что видит пользователь: ...
- Что делает: ...
- Переход: → Экран 2
```

После CJM:

> «Вот маршрут пользователя, который я планирую нарисовать.
>
> Если всё верно — напиши "апрув CJM", и я покажу тебе примерные раскладки экранов прямо здесь в чате (ASCII-мокапы по слотам скелета). Посмотришь их и поправишь до того, как уйду в Figma — лучше переиграть на этапе чата, чем переделывать готовое.
> Если что-то не так в маршруте — скажи что изменить, я обновлю.
>
> _Замечание о работе скилла? Напиши, создам issue через `/fb`._»

<!-- BUILDER_GATE: GATE_CJM — не удалять. verify-builder-gates.sh грепает по этому якорю. -->
**Жди апрув.** Без апрува не идти к шагу 6.

**Телеметрия:**
- Установи `_session.stages.cjm = true` при первой версии CJM.
- На каждую правку CJM до апрува — `_session.cjm_iterations += 1`.
- При получении апрува — `_session.cjm_approved = true`.

---

## Шаг 6 — План генерации (gate)

После апрува CJM — **до любого `use_figma`** — собери план. Шаг 6 завершён **только когда выполнены все пункты A–I** (включая E.1, H, I) и ты переходишь к Шагу 7. Промежуточное «всё, готово» здесь не существует.

**A.** Прочитай `rules/skeleton.md` (~30 строк) — три обязательных правила.

**B.** Достань ключи компонентов из `registry/index.json` (формат: `name → [lib, key, type, tier, approved]`, `type: "c"`/`"s"`; для `s` `key` — variant-key default'а; импорт у обоих один — `figma.importComponentByKeyAsync(key)`):
   - **По умолчанию — грепай только нужные имена**, не читай файл целиком: `grep -F '"badge 1.2"' registry/index.json`. Так экономится ~4К токенов на каждый прогон.
   - **Читай целиком** только если в плане 10+ компонентов или нужно посмотреть полный список (например, искать «есть ли в реестре что-то подходящее под X» по фильтру).
   - **Если первый grep ничего не нашёл — не сдавайся сразу.** Имя компонента в реестре может отличаться от формулировки дизайнера / брифа: camelCase (`avaPicture` vs `ava picture`), английский vs русский, синонимы, отсутствие пробелов / спецсимволов. **До** того как сказать «компонента нет» / запросить `/fb feedback:component-request` / спланировать кастомный фрейм — попробуй **2-3 альтернативных паттерна**:
     - **Синонимы** на двух языках: «аватар» → `аватар`, `avatar`, `ava`, `photo`, `profile`, `picture`. «Кнопка» → `button`, `кнопка`, `cta`. «Поиск» → `search`, `поиск`, `find`.
     - **Формы написания**: `avapicture`, `ava-picture`, `ava_picture`, `avaPicture`, `AvaPicture`. Не привязывайся к word-boundaries (`\b`) и пробелам — реестр может хранить имя слитно или с спецсимволами (`◇`, `❖`, `·`).
     - **Tier-фильтр**: ищи `composite` / `view` отдельно от `atom`, если по контексту нужен сложный компонент (например, для «фото профиля» — `avaPicture 1.3` это `composite` с вариантами).
   - Если **после всех альтернатив** ключ всё равно не нашёлся — на уровне Настя попроси запустить `/syncKeys`. На уровне Дизайнер — предложи сначала `/update` (вдруг реестр устарел), а если ключ всё равно отсутствует — `/fb bug:registry-stale` (или `feedback:component-request`, если компонента действительно нет). Не угадывай ключ.

### 🚨 Готчи импорта/setProperties (A-046 … A-059)

Полный список с примерами кода и helper'ами — `docs/BUILDER_GOTCHAS.md`. Builder обязан их учесть **в каждом** `use_figma`-блоке. Краткий индекс:

- **A-046** — единый API импорта (`importComponentByKeyAsync` для COMPONENT и SET через try/catch fallback); `setProperties` для INSTANCE_SWAP принимает `.id`, не registry-key.
- **A-053** — post-swap discovery через `mainComponent.parent.name` (COMPONENT_SET), не `mainComponent.name` (это вариант с именем `preset=...`).
- **A-054** — regex для inner-button discovery с версионными именами `^button(\s+\d+(\.\d+)?)?$`; label-key выбирать строго `defs[k].type === 'TEXT'`.
- **A-057** — `layoutSizing` ТОЛЬКО после `appendChild` (FILL/STRETCH требуют auto-layout parent). Helper `addChildFill(parent, child, axis)`.
- **A-058** — slot prop names резолвить из rule-объекта через `slotKey(rule, pattern)` / `boolKey(rule, pattern)`, не литералом. Helper'ы фильтруют по типу пропа (slots vs booleans) и throw при ambiguous match. `setProperties` группами: booleans одним пакетом, INSTANCE_SWAP — точечно.
- **A-059** — wrapper-слот с `pairedBoolean` → флипай boolean ВМЕСТЕ со swap, иначе слот выключен (placeholder strip / пустота — частные случаи A-040, A-030).

При первой ошибке Figma plugin API во время сборки — открой `docs/BUILDER_GOTCHAS.md`, найди матчинг по сообщению/симптому, применяй и продолжай. Не выводи коды готч в реплики Дизайнеру (см. «Глобальные правила реплик»).

**C.** Для каждого экрана из CJM выпиши план:

```
Экран: [название]
  meshok ↑: navbar → [компонент]
  контент: [список компонентов]
  meshok ↓:
    systemComponent → [handle / tabbarPrimary / ...]
    buttonsView → [true/false] → [кнопка, style, label]
    float/toast → [true/false] → [тост если нужен]
```

**D.** Для каждого компонента в плане определи, какой файл правил подгрузить:
   - `meshok ↑/↓` → `rules/components/meshok-up.rule.json` / `meshok-down.rule.json`
   - `button 1.1` → `rules/components/button.rule.json`
   - `header 1.1` → `rules/components/header.rule.json`
   - `uniCell 1.0` → `rules/components/unicell.rule.json`
   - `uniCard 1.0 ❖ view` → `rules/components/unicard-view.rule.json` (+ `160`/`220`/`320`/`custom-unicard.rule.json` для конкретных размеров)
   - `contentsView 1.1 ❖ view` → `rules/components/contentsview-view.rule.json`
   - размеры/паддинги/цвета → `rules/tokens.md`
   - шаблоны (`bottom-slot`, `buttons-slot` и т.п.) → `rules/templates.md`

   Имя файла = `slugify(componentName)` (правила в `rules/components/ARCHITECTURE.md`). **Builder читает только `<slug>.rule.json`**, не `.raw.json` (cold data) и не legacy `.md` (удалены в Phase 4).

   **Gap-компоненты (`gapTextVertical` / `gapCustomVertical` / `gapCustomHorizontal`) — БЕЗ rule-файлов.** Это leaf-spacers, 36 шт.; их ключи и имена живут в `preferred[]` родителя (`custom · contentsView` сейчас). Правило подбора — секция «Gap family» в `rules/components/ARCHITECTURE.md`. Кратко: между content X и Y бери `X-Y ◇ | gapTextVertical`; если такой пары нет — fallback `N ◇ preset | gapCustomVertical` (0/2/4/8/12/16/20/24/32/40/48/64). Не пытайся открыть `gap-*.rule.json` — его нет.

**E.** Прочитай только нужные `.rule.json` файлы — по одному на пикнутый компонент, не массово. Каталог `name → [lib, key, type, tier, approved]` берётся из `registry/index.json` (derived cache из rules). **Не ходи в Figma за описанием компонента — всё, что нужно для `/builder`, лежит в `.rule.json`** (`doc.whenToUse`, `doc.edgeCases`, `slots[].preferred[]` с `usage`, `booleans` с `whenOn`/`whenOff`, `variants` с `builderRule`).

**E.0. Reasoning по каждому slot — выбор preferred / hide / gap.** ПЕРЕД диалогами E.1 / E.2 для каждого slot, который есть в плане (D), Builder проводит reasoning и фиксирует решение в `_session.builder_picks[]`. Это источник правды для всех последующих шагов — E.1/E.2 диалогов и финальной сборки G-I1.5.

**Reset `_session.builder_picks` в начале E.0.** При повторном входе в Шаг 6 (walk-back из Шага 7 H на edge cases) reasoning'и прошлого прохода неактуальны — план мог измениться.

При входе в E.0 первой строкой, ДО старта обхода компонентов из плана D: `_session.builder_picks = []`. Сбрасывается один раз на вход в E.0, не на каждый top-level компонент.

`_session.rule_contributions` НЕ сбрасываем — это накопительный лог обучения. Новые записи дописываются, дедуп в E.2 (см. ниже) пропускает уже-отвеченные `(type, slug, slotProp)`.

Остальные поля `_session.*` (`text_layout`, `screen_context`, и т.п.) при walk-back не сбрасываются — их пересчёт за пределами scope E.0.

**Контекст reasoning'а:**
- бриф / CJM / роль экрана (из `_session.text_layout` если уже собран, иначе текст из плана D)
- `slots[].preferred[].usage` — **основной guide** для выбора preferred
- `slots[].preferred[].name` (часто говорящее)
- `slots[].pairedBoolean` с `alwaysOn` / `defaultOn`
- наличие `isDefault=true` preferred — fallback на случай отсутствия контекста
- здравый смысл про компонент в целом

**Результат — одно из трёх решений:**

| `decision` | Когда | Что фиксируем |
|---|---|---|
| `swap` | Reasoning указывает на конкретный preferred (однозначно или почти) | `picked: <preferred.name>`, `reason: <короткое обоснование>` |
| `hide` | Reasoning приходит к выводу «slot на этом экране не нужен». Применимо ТОЛЬКО если у slot есть `pairedBoolean` без `alwaysOn: true`. | `picked: null`, `reason: <почему slot не нужен>` |
| `gap` | Правило WIP / контекст экрана не маппится ни на один preferred / несколько preferred одинаково подходят. Builder не может выбрать сам. | `picked: null`, `reason: <чего не хватило для reasoning'а>` |

**Semantic roles filter (если `_session.semantic_roles_enabled === true` И у slot задан `role`):** до основного reasoning'а Builder сужает `preferred[]` фильтром по семантическому матчу. Алгоритм:

1. Прочитай `slot.role` (например, `"system/bottom"`) и контекст экрана из CJM/брифа.
2. Сопоставь контекст с возможными ролями из `rules/semantic-roles.json` (например, «PIN-экран» → `system/numeric-input`, «welcome» → `system/anonymous-bottom`). Полученный набор ролей зафиксируй в `matched_roles` записи `builder_picks[]` для этого slot — это per-pick audit для Шага 8 snapshot diff (см. декларацию `builder_picks` в `_session`).
3. Отфильтруй `preferred[]`: оставь только те, у которых `semanticRoles[]` содержит хотя бы одну из релевантных контексту ролей.
4. **Fallback при пустом пересечении** (никакой preferred не подходит контексту):
   - Если у slot есть `preferred[isDefault=true]` → используй его + запиши `divergence_step: "role_no_match"` в `_session.rule_contributions[]`.
   - Иначе → первый non-broken preferred + ⚠️ маркер в имени слоя + `divergence_step: "role_no_match"`.
   - Этот fallback также срабатывает на G-I2.2 gate (страховка post-reasoning).
5. После фильтра — обычный reasoning per slot на сокращённом списке preferred[].

При `_session.semantic_roles_enabled === false` (rollback override; default с PR #1c — `true`) этот фильтр пропускается, Builder работает по старому пути (isDefault / preferred[0]).

**Каждое решение получает `confidence`:**

- `high` — однозначный match по usage / явный pairedBoolean-эскейп по контексту. → silent применяется, без вопросов дизайнеру (но запись в `builder_picks` всё равно обязательна).
- `medium` — reasoning сошёлся, но не однозначно (две хорошие кандидатуры, контекст частично двусмысленный, спорный hide). → попадает в E.2 Category A' (вопрос «я не уверена», предложение Builder подсвечено первым). См. коммит (b).
- `low-fallback` — взят `isDefault` без контекстного match (контекст слаб). → попадает в E.2 Category A' (тот же вопрос с маркером).
- `none` — для `decision: gap`. → попадает в E.2 Category A (enum без предложения Builder). См. коммит (b).

**Запись в `_session.builder_picks[]`:**

```js
_session.builder_picks.push({
  slug: "<top-level component slug>",      // например, "meshok-up"
  slotProp: "<slot prop name из rule.json>",  // например, "navbar#1491:0"
  path: ["<rootSlug>", "<slot1>", "<slot2>", ...],  // упорядоченный путь от top-level slug до текущего slot; для top-level slot — ["meshok-up"]
  decision: "swap" | "hide" | "gap",
  picked: "<preferred.name или null>",
  reason: "<обоснование, 1 предложение>",
  confidence: "high" | "medium" | "low-fallback" | "none",
  ts: "<ISO>"
})
```

`path` нужен для маркеров уровней в G-I1.5 ruleTree, для anti-cycle в recursive reasoning, и для группировки в `/fbAnalyzer` (когда несколько экранов триггерят один и тот же `slug+slotProp`).

**Recursive reasoning:** если выбранный preferred имеет `nestedProps.ruleRef` — Builder открывает соответствующий `rule.json` и применяет тот же reasoning для slot'ов на следующем уровне. Anti-cycle через Set посещённых slug'ов в **текущем пути**; depth ≤ `RULE_TREE_MAX_DEPTH = 10` (общий контракт с G-I1.5, см. строку 121 — ≈2× max наблюдаемой цепочки в реестре).

```js
// per top-level entry: visited = new Set([rootSlug])
// перед recursive call: if (visited.has(childSlug)) → decision="gap", reason="cycle in ruleRef"
// иначе: visited.add(childSlug); recurse; visited.delete(childSlug)  // backtrack по выходу
```

Цикл — это валидный кейс (компонент содержит сам себя через swap, например, recursive list-cell), но рекурсивно резолвить его нельзя. Производственный вариант — silent terminate с `decision: gap, reason: "cycle in ruleRef"`; в `/test --full` этот gap отдельно репортится для аудита.

**Reasoning по variants — выбор variant value через builderRule.** ПАРАЛЛЕЛЬНО с reasoning per slot Builder делает reasoning per variant — но **только для variants с непустым `builderRule`** в rule.json **И** `options.length > 1`. Variants без `builderRule` (большинство — `state`, `style`, `type`) или с единственным `options[0]` применяют `default` молча, без записи в `builder_picks[]` — иначе будет десятки шумных записей per screen.

**Где работает:**
- На каждом уровне ruleTree (top-level + nested), синхронно с recursive reasoning по slot'ам.
- Для каждого `variants[vProp]` с непустым `builderRule` и `options.length > 1`: Builder читает `builderRule` + контекст экрана, выбирает значение из `variants[vProp].options[]`, записывает в `builder_picks[]`.

**Запись для variant decision:**

```js
_session.builder_picks.push({
  slug: "<component slug>",                  // например, "header"
  variantProp: "<variant prop name>",        // например, "size", не slot prop
  path: ["<rootSlug>", "<slot1>", "<slot2>", ..., "<componentSlug>"],
  decision: "variant",
  picked: "<variant value>",                 // например, "27" (для header.size)
  reason: "<обоснование, 1 предложение>",
  confidence: "high" | "medium" | "low-fallback",
  ts: "<ISO>"
})
```

**Confidence для variants:**
- `high` — однозначный match по `builderRule` (например, «H1 страницы — welcome регистрации» → size=27).
- `medium` — `builderRule` оставляет два варианта одинаково подходящими. → попадает в E.2 Category A'.
- `low-fallback` — `builderRule` непонятен или не подходит под контекст, взят `default`. → попадает в E.2 Category A'.

(Для variants `decision: gap` не используется — default всегда доступен в rule.json. Если возникнет действительно безвыходная ситуация, она будет ловиться через G-I2-guard как divergence_step: unknown.)

**Дедуп в E.2:** по `(slug, variantProp, path)`. Path даёт уникальность per экран. Агрегирование одинаковых reasoning'ов между экранами делает `/fbAnalyzer` через `aggregate-sessions.py --rule-contributions`.

После E.0 → переходи к E.0.5 (сборка text_picks), затем E.1 (только для slot'ов с `confidence: high` показывается сверка; medium / low-fallback / gap идут в E.2).

**E.0.5. Сборка `_session.text_picks[]` — реальные тексты для textProps / textNode.** ПОСЛЕ E.0 reasoning (когда `builder_picks[]` готов) и ДО E.1 сверки. Builder собирает реальные тексты для каждого компонента, который попадёт в финальную сборку.

**Reset `_session.text_picks` в начале E.0.5** (симметрично reset `builder_picks` в E.0). При повторном входе в Шаг 6 (walk-back из Шага 7 H) план мог измениться — тексты прошлого прохода неактуальны.

При входе в E.0.5 первой строкой, ДО обхода `builder_picks[]`: `_session.text_picks = []`.

**Алгоритм:**

Обход — **рекурсивный по полному closure плана**, не плоский по `builder_picks[]`. Источник текстов охватывает top-level И **все nested компоненты через `nestedProps.ruleRef`** (без этого Builder пропускал text-targets nested-уровня — например, `button.label` внутри `meshok-down → buttonsView → buttonsViewBottom → button1`, см. #255 / #256 / #253-placeholder).

Для **каждого узла closure**:

- **Top-level узлы** — записи `builder_picks[i]` с `decision: "swap"` + leaf top-level компоненты без записи (которые попадают через план).
- **Nested узлы** — для каждого top-level узла рекурсивно: прочитай `rule.json` свапнутого preferred, для каждого его `slots[].preferred[]` с `nestedProps.ruleRef` обходи рекурсивно. Anti-cycle Set по slug на текущем пути + depth bound `RULE_TREE_MAX_DEPTH = 10` (тот же паттерн, что в E.0 recursive reasoning и G-I1.5 шаг 4). «Closure плана» = transitive closure через `nestedProps.ruleRef` начиная от top-level компонентов плана. Path — линейный список slot-prop'ов вдоль recursive walk; при переходе через `ruleRef` следующий элемент пути — slot-prop nested rule.

Для каждого узла:

1. Прочитай `rule.json` свапнутого preferred (для slot-decision) или top-level компонента.
2. Извлеки список **text-target'ов** компонента:
   - `textProps[]` — componentProperty типа `TEXT` (если в rule.json есть `textProps` секция).
   - `textNode` — intrinsic TEXT-ноды (если у компонента нет text-componentProperty, а текст ставится напрямую на TEXT-ноду — см. helper `setTextNodeContent`).
3. Для каждого text-target определи реальный текст из источников **в порядке приоритета**:
   - `_session.text_layout[]` — если этот фрейм/слот матчится в иерархии → `source: "text_layout"`.
   - Явный reference в брифе (например, «кнопка "Зарегистрироваться"», «заголовок "Заходи"») → `source: "brief"`.
   - CJM-описание (Шаг 5) → `source: "cjm"`.
4. Запиши:

```js
_session.text_picks.push({
  slug: "<component slug>",                   // например, "button"
  path: [...],                                // полный путь до компонента-владельца text-target,
                                              // идентичен path в соответствующей builder_picks записи
                                              // (для nested компонентов — путь до nested уровня).
  textProp: "<text-componentProperty>" | null,  // например, "✎ label#13004:2"
  textNode: true | false,                     // для intrinsic; mutually exclusive с textProp
  text: "<реальный текст>",
  source: "brief" | "cjm" | "text_layout" | "designer_override",
  ts: "<ISO>"
})
```

**Если текст не найден** ни в одном источнике — **запись НЕ создаётся**. Это «забытый текст», и G-I2-guard (Шаг 7) подсветит через `divergence_step: "forgotten_text"` (см. ниже).

**`designer_override`:** когда дизайнер на E.1 / drill-down (Шаг 6 I) явно меняет текст («label не "Зарегистрироваться", а "Войти"») — upsert по dedup key `(slug, path, textProp|textNode)` с обновлением `text`, `source: "designer_override"`, `ts`. Не создавай новую запись, перезаписывай существующую.

**Path для nested text-target'ов** — полный путь до компонента-владельца, не до родительского slot. Пример: для `button.label` внутри `meshok-down → buttonsView → buttonsViewBottom → button1` path будет `["meshok-down", "buttonsView", "buttonsViewBottom", "button1"]` — идентичный path в соответствующей `builder_picks` записи swap'нутого button.

После E.0.5 → переходи к E.1.

**E.1. Уточнения по ключевым компонентам.** Для 2-3 главных компонентов макета (CTA-кнопка, основной inputText / card / cell, навбар) выведи дизайнеру короткую сверку выбранных вариантов — он может переопределить. **Сверка показывается только для slot'ов с `confidence: "high"` из `_session.builder_picks[]` — `medium` / `low-fallback` / `gap` уходят в E.2 (коммит b). Если у компонента ни одного `high`-slot'а — пропусти его в этой сверке.**

```
По компонентам — нужны ли уточнения? Если всё ок — пиши "ок", идём дальше.

1. `button 1.1` (CTA) — `style=primary`, `size=L`, `state=enabled`, label «Зарегистрироваться».
   → переопределить style/size/label? Или ок?
2. `input 1.0` (email) — `state=default`, `size=M`, placeholder «email@example.com».
   → нужен другой size или placeholder? Или ок?
3. `meshok ↓` — одна кнопка primary. Рассматриваем secondary рядом? Или одной достаточно?
```

Правила:
- **Только 2-3 компонента**, не весь список. Главные — те, у которых много вариантов и реальный выбор по контексту (button styles, input states, navbar layout).
- **Если вариантов нет** (компонент имеет 1 variant default), не упоминай — нечего спрашивать.
- **Не блокирующий gate** — если дизайнер скажет «всё ок» или «давай как есть», идёшь дальше. Это просто опция вмешаться.
- **Решения по nested INSTANCE_SWAP** (что в buttonsView-слоте, что в overlay-слоте у avapicture) включай сюда если есть выбор; пустые слоты — пропускай.

После ответа — продолжай E.2.

**E.2. Учи меня — три категории.** После E.0 reasoning и E.1 high-confidence сверки, для каждого slot из `_session.builder_picks[]` определи категорию вопроса. Все три категории идут в ОДНОМ проходе диалога, дедуп ДО задавания.

**Сбор кандидатов:**

- **Category A — structural-gap.** Слоты с `decision: "gap", confidence: "none"`. Builder не смог выбрать сам — enum без подсказки.
- **Category A' — uncertain-pick.** Слоты с `decision: "swap"|"hide", confidence: "medium"|"low-fallback"`. Builder сделал выбор, но не уверен — enum, выбор подсвечен первым.
- **Category B — usage-hint.** Компоненты с пустой контекстной guidance: `doc.whenToUse` пустой или отсутствует, **И** `doc.edgeCases` пустой/`[]`/отсутствует, **И** во всех `slots[].preferred[]` поле `usage` пустое (либо нет `slots`). Свободный текст «расскажи про компонент». Критерий не зависит от `approved` — это содержательная неполнота, отдельный сигнал.

**Дедупликация:**

- A и A' — по `(slug, slotProp, path)`. `path` обязателен в ключе: один и тот же `(slug, slotProp)` через разные `path` — это разные вопросы, потому что контекст экрана/родителя другой (например, `navbar.middle` на Lenta vs на Profile, или `cell` внутри `meshok-up` vs внутри `cell-with-navbar`). После walk-back из Шага 7 H, если план изменился, разные `path` дают разные ключи — старый ответ из прошлого прохода для другого `path` не схлопнется.
- B — по `slug`. Один компонент = один вопрос за сессию.
- **A и A' дедуплицируются раздельно** — это разные вопросы про один slot (A спрашивает «что положить», A' — «подтверди мой выбор»). У них разные `type` в `rule_contributions[]`.
- **Пропуск уже-отвеченных:** перед задаванием каждого вопроса проверь `_session.rule_contributions[]` — если запись с тем же `(type, slug, slotProp, path)` (для A/A') или `(type, slug)` (для B) уже есть, вопрос НЕ задаётся, ответ берётся из существующей записи.

**Парсинг ответа дизайнера (для A и A'):**

Дизайнер видит нумерованный список preferred вариантов с описаниями. Маппинг ответа:

1. **Индекс-ответ** (`1`, `2`, `3`, ...) → `designer_choice = preferred[index - 1].name`. Самый частый и однозначный кейс.
2. **Exact name-ответ** (точная строка из `preferred[i].name`, без лишних слов) → `designer_choice = preferred[i].name`. Совпадение по `===` после `trim()`.
3. **Иначе** (свободный текст, частичное совпадение, описание своего кейса, «не знаю»/«сам выбери» — последние ниже обрабатываются как молчание) → `designer_choice = null`, `designer_freetext = <текст ответа>`.

Никаких fuzzy-матчей по подстроке (например, «навбар без табов» при наличии `no subtitle · content` — это `designer_freetext`, не `designer_choice`). Это намеренно: фуззи-матч непредсказуем между сессиями и портит сигнал для эволюции правил.

**Лимиты:**

- A — без лимита (блокер рендера).
- A' — без лимита (если правило WIP на N слотов, дизайнер увидит N точных вопросов — сигнал доводки правила). **Если A'-кандидатов >3**: открой реплику фразой «Перед сборкой уточню несколько мест — правило для `<componentName>` ещё доводится, нужны твои подсказки» (если все из одного компонента), либо «Перед сборкой уточню несколько мест — правила для нескольких компонентов ещё доводятся, нужны твои подсказки» (если из разных). Это явно ставит дизайнера в режим «учу систему», а не «отвечаю на вопросы про свой макет».
- B — лимит 2 (первые 2 кандидата в порядке появления в плане; остальные молча используешь best-effort).

**Порядок:** A → A' → B (от блокеров к обучающим). Один проход.

Если в плане ни одного кандидата ни в A, ни в A', ни в B — секция E.2 целиком пропускается, реплики нет.

### Category A — structural-gap (enum без подсказки)

Одно сообщение для всех A-кандидатов (если их несколько — нумерованным списком):

> Перед сборкой уточню — есть места, где я не знаю, что положить.
>
> **1. <человеческое имя slot из usage других preferred или из slotProp>** (компонент `<componentName>`):
>    1. **`<preferred[0].name>`** — <preferred[0].usage или короткое описание из name>
>    2. `<preferred[1].name>` — <preferred[1].usage>
>    3. `<preferred[2].name>` — <preferred[2].usage>
>    
>    Какой? Если ни один не подходит — опиши.
>
> **2. <следующий A-кандидат>** ...

Если у slot `preferred[]` пустой / все broken — enum невозможен, fallback на свободный текст:

> **<имя slot>** (компонент `<componentName>`): про этот элемент у меня правил пока нет. Что обычно туда кладёшь — пустое, текст, иконку, картинку, кнопку? Опиши.

**Молчание / «не знаю» / «сам выбери» — auto-pick по контексту.** Builder делает best-guess:

- Если `preferred[]` непустой → выбирает тот preferred, чьё `usage` или `name` ближе всего к `screen_context` (LLM-reasoning поверх контекста экрана + содержимого preferred). Если контекст не помогает — `preferred[0]` детерминированно.
- Если `preferred[]` пустой / все broken → text-node с лейблом slot + ⚠️ маркер. `auto_picked: "<text-node fallback>"`, `auto_pick_reason: "no preferred available"`.

Запись:

```js
_session.rule_contributions.push({
  type: "structural-gap",
  component: "<Figma-style name>",
  slug: "<slug>",
  slotProp: "<slotProp>",
  path: builder_picks[i].path,
  designer_choice: "<preferred.name>" | null,
  designer_freetext: "<текст>" | null,
  auto_picked: "<preferred.name или 'text-node fallback'>" | null,
  auto_pick_reason: "context-match" | "preferred-zero-index" | "no-preferred-available" | null,
  ts: "<ISO>"
})
```

`auto_pick_reason` — enum, для машинного парсинга в `/fbAnalyzer`:
- `"context-match"` — выбрал preferred с наиболее близким `usage`/`name` к `screen_context`.
- `"preferred-zero-index"` — контекст не помог, взял `preferred[0]` детерминированно.
- `"no-preferred-available"` — `preferred[]` пустой / все broken, поставил text-node.

Семантика комбинаций:
- `designer_choice` заполнен → дизайнер выбрал enum-вариант. `auto_picked` = null.
- `designer_freetext` заполнен → дизайнер описал свой кейс. `auto_picked` = null. После сборки — auto-issue (b2).
- `auto_picked` заполнен → дизайнер молчит, Builder выкручивается сам. `designer_*` = null. Сильный сигнал для auto-issue (b2).

**Обновление `_session.builder_picks[i]`:**
- Если `designer_choice` или `designer_freetext` заполнены (явный ответ) → `decision: "swap"|"hide"`, `picked: <финальный preferred>`, `confidence: "high"`.
- Если `auto_picked` заполнен (молчание) → `decision: "swap"`, `picked: <auto_picked>`, **`confidence: "none"` ОСТАЁТСЯ**. Auto-pick — вынужденный fallback, не успешное решение. При повторном входе в E.2 (walk-back) этот slot снова попадёт в Category A (тот же type), dedup сработает по `(slug, slotProp, path)` → вопрос второй раз не задаётся, действующий auto_picked применяется.

**Post-build реплика для `auto_picked` с `auto_pick_reason: "no-preferred-available"`.** После сборки в финальной реплике дизайнеру упомяни этот случай: «В **<человеческое имя slot>** у компонента `<componentName>` я поставила text-node-заглушку — у этого слота правил пока нет, поэтому отметила её ⚠️. Поправь руками, если нужно». Это единственный auto-pick кейс, который требует обратной связи (text-node визуально не похож на реальный компонент; для `context-match`/`preferred-zero-index` Builder поставил реальный preferred, реплика не нужна).

### Category A' — uncertain-pick (enum с подсказкой Builder)

> Перед сборкой уточню — пара мест, где я не уверена.
>
> **1. <имя slot>** (компонент `<componentName>`): я планирую **`<builder_picks[i].picked>`** (<builder_picks[i].reason>), но не на 100% уверена. Альтернативы:
>    1. **`<picked>`** — <usage> (мой выбор)
>    2. `<other preferred>` — <usage>
>    3. `<other preferred>` — <usage>
>    
>    Подтверди или поменяй.

**Silence-detection ДО записи (зеркало Category A).** Перед формированием записи проверь ответ дизайнера на silence-паттерн. Если ответ матчит whitelist (regex, case-insensitive): `^не знаю`, `^сам выбери`, `^молчание$`, `^skip$`, либо пустой ответ / таймаут — это **silence**, не override. В этом случае: `auto_confirmed_on_silence: true`, `designer_choice = null`, `designer_freetext = null`, `designer_overrode: false`. Builder идёт со своим `builder_proposed`, confidence в `builder_picks` остаётся `medium`/`low-fallback`.

Без этой проверки парсинг ответа (раздел «Парсинг ответа дизайнера») кладёт «не знаю» в `designer_freetext`, а семантика ниже трактует непустой freetext как override → ложный divergence-сигнал.

Запись:

```js
_session.rule_contributions.push({
  type: "uncertain-pick",
  component: "<Figma-style name>",
  slug: "<slug>",
  slotProp: "<slotProp>",
  path: builder_picks[i].path,
  builder_proposed: "<builder_picks[i].picked>",
  builder_confidence_was: "medium" | "low-fallback",
  designer_choice: "<preferred.name>" | null,
  designer_freetext: "<текст>" | null,
  designer_overrode: true | false,
  auto_confirmed_on_silence: true | false,
  ts: "<ISO>"
})
```

Семантика (`designer_overrode` вычисляется автоматически):
- `designer_choice === builder_proposed` → подтверждение medium/low-fallback. `builder_picks[i].confidence` → `high`. `designer_overrode: false`.
- `designer_choice !== builder_proposed` (и оба не null) **ИЛИ** `designer_freetext` непустой → дизайнер переопределил. `designer_overrode: true`. Это подтверждённый divergence, фиксируется в этой записи (отдельный `type: "divergence"` — для другого паттерна в b2). При freetext-override Builder также применяет fallback из контракта «Рекурсивность» (best-guess preferred с ⚠️ маркером) и доводит `builder_picks[i].picked` до реального preferred.
- `auto_confirmed_on_silence: true` → дизайнер молчит, Builder со своим выбором. Confidence в `builder_picks` остаётся `medium`/`low-fallback` (не повышается). `designer_*` = null, `designer_overrode: false`.

### Category B — usage-hint (свободный текст)

Для каждого компонента в плане, удовлетворяющего критерию «нет контекстной guidance» (см. сбор кандидатов выше), задай дизайнеру **один** точечный вопрос. Цель — превратить «warning без действия» в «дизайнер учит систему».

**Формулировка реплики:**

> Я планирую положить **`<componentName>`** (например, `tabsView ❖ scrollview`) — про него у меня пока ничего не описано. Не подскажешь, как его правильно использовать? Где он лучше всего подходит, какие у него типичные сценарии? Я запомню, и со временем буду пользоваться точнее (а Настя зафиксирует твой ответ в правиле).

Правила:
- **Имя компонента — Figma-style** (`tabsView ❖ scrollview`, `chipChoicePrimary ❖ chip`), не slug файла. Источник — `name` поле из `.rule.json` или `registry/index.json`.
- **Только компоненты из текущего плана**, не весь реестр недописанных правил. Если в плане их 0 — секция B пропускается.
- **Ответ записывай:**

  ```js
  _session.rule_contributions.push({
    type: "usage-hint",
    component: "<Figma-style name>",
    slug: "<slug.rule.json без .rule.json>",
    hint: "<полный ответ дизайнера>" | "<no contribution>",
    ts: "<ISO>"
  })
  ```

- **Используй ответ в этой сессии** для приоритезации preferred / выбора реальных текстов в I-раскладке. Например, дизайнер сказал «в скролле обычно карточки магазинов, не текст» → при выборе `preferred[]` для контент-слота приоритезируй card-кандидатов над text-кандидатами; в I-раскладке используй реальное содержание табов вместо placeholder'а «Tab 1 / Tab 2».
- **Не блокирующий gate.** Молчание / «не знаю» / «сам выбери» → `hint = "<no contribution>"`. Builder продолжает по обычной логике (preferred[isDefault] или usage-match). **Молчание в B = no-op для b2 divergence-detector** — это упущенная возможность обучения, не структурный gap, в auto-issue `bug:missing-rule` (коммит b2) не попадает.
- **Не упоминай в реплике** «approved», «WIP», «правило неполное», «schema», «usage», «preferred» — это внутренние термины.

### После всех вопросов

Продолжай F.

**F.** Проверь план: в каждом фрейме есть `meshok ↓`; кнопки только через `buttonsView`-слот; навбар только через `meshok ↑`; тост только через `float/toast`-слот.

**G.** **Если в задаче нужен паттерн, которого нет в реестре** (например, «звёздный рейтинг», «свайп-карты», «график»): не отказывайся, **собирай максимально близкий аналог из имеющихся компонентов ДС**. Если и аналога нет — рисуй кастомный фрейм, но **обязательно используй токены ДС**: цвета — только из 🎨 Colors Palette, отступы — переменные `numbers-paddings`, текстовые стили — только из 📝 Typography. Помечай такой блок именем `<role> ⚠️ кастом — нет компонента в ДС`. После сборки фиксируй gap в issues (`R-NNN` или `A-NNN`).

**H. Покрытие состояний — обязательный под-этап с явным чек-листом и gate.** Перед переходом к финальной раскладке (под-шаг I) построй **полный чек-лист edge cases** по каждому экрану CJM. Не общий вопрос «какие рисуем?», а конкретный список «вот что я выявила из брифа + расширений + типичных паттернов» — дизайнер сверяет, добавляет, выкидывает.

**Типы состояний (категории):**

- **Default** — happy path с реалистичными данными (всегда рисуется).
- **Empty state** — нет данных, пустой список, новый пользователь. Применим, если на экране есть список / лента / коллекция.
- **Loading / skeleton** — состояние асинхронной загрузки. Применим, если на экране есть подгружаемый контент (список с сервера, профиль, фид).
- **Error states** — failed validation / network error / unauthorized / permission denied / занятые данные. Применим, если на экране есть форма, сетевой запрос или auth-флоу.
- **Focus** (опционально, #261) — интерактивные состояния **полей ввода** (cursor + placeholder/text combo). Применим, если на экране есть компонент с focusable-input поведением И флоу предполагает демонстрацию интерактивных состояний. По умолчанию НЕ предлагай — опт-ин под UX-демо.

  **Обнаружение поддерживающих компонентов:** `grep "Focus on" rules/components/*.rule.json` в `doc.edgeCases` — компоненты которые задокументировали focus-state. Сейчас (на дату фиксации): `inputtext` (полное описание). `inputtextarea` имеет те же booleans (text/cursor/placeholder/mask), но focus в `doc.edgeCases` пока не описан — расширим при использовании. `search` — rule WIP. Список **расширяется естественно**: автор rule.json дописывает «Focus on ...» в edgeCases — компонент попадает в список без правки этого spec'а.

  **Реализация:** конкретные boolean combos живут в `<slug>.rule.json` `doc.edgeCases` + `booleans[].builderRule` соответствующих компонентов. Builder на Шаге 7 Implementer читает rule.json при рендере. **Не дублировать combos здесь** — single source of truth = rule.json (LESSONS «doc-drift hallucination vector»).

  Rendering ограничения для intrinsic TEXT-нод — см. `docs/ARCHITECTURE_LESSONS.md` Pending axes (#270 textNodes[] migration). Builder делает best-effort: boolean toggle применяет, intrinsic node-write зависит от schema.

**Чек-лист — формат вывода:**

```
Edge cases по экранам — сверь со мной, прежде чем зафиксируем покрытие:

• Экран 1 — Welcome:
  — состояний кроме default не вижу (стартовый экран, нет загрузки/формы)

• Экран 2 — Телефон:
  — error: невалидный формат номера
  — error: номер уже зарегистрирован
  — loading: при отправке SMS

• Экран 3 — OTP-код:
  — error: неверный код
  — error: истёкший код
  — empty: SMS не пришла (resend countdown)
  — focus (опц.): кадр интерактивного состояния поля — нужно для демо UX?

• Экран 4 — Имя:
  — error: слишком короткое имя
  — error (опц.): занятое имя — если применимо к флоу
  — focus (опц.): кадр интерактивного состояния поля — нужно для демо UX?

• Экран 5 — Фото:
  — empty: skip-path → дефолтный аватар на главном
  — error: permission denied (камера / галерея)

• Экран 6 — Главный:
  — loading: skeleton фида при первом заходе
  — empty: пустой фид нового пользователя

Если всё учли — апрув, фиксирую покрытие и иду составлять раскладку.
Если чего-то не хватает / лишнее — скажи, обновлю и покажу заново.
```

Правила:
- **Источник содержимого** — бриф + CJM + takeaway от расширений (если запускались) + типичные паттерны соцсетей/e-commerce/банкинга по контексту. Не «возможно нужно», а «вот что я **выявила**».
- **На каждый экран — отдельный пункт.** Если на экране кроме default ничего не требуется — пиши явно «состояний кроме default не вижу — <обоснование>». Не пропускай экран молча.
- **Focus предложение (#261).** Для каждого экрана с **focusable-input компонентом** (см. категорию Focus выше — список через `grep "Focus on" rules/components/*.rule.json`) добавь опциональный пункт `focus (опц.) — нужен кадр интерактивного состояния?`. Конкретные boolean combos **НЕ перечисляй** — они живут в `<slug>.rule.json doc.edgeCases` соответствующего компонента (single source of truth). Дизайнер отвечает «да»/«нет» — записываешь в `states_covered` один `"focus"` (или пропускаешь). Опт-ин под UX-демо, по умолчанию НЕ включай.
- **Жди явный apruv-word** (см. `rules/approval-tokens.json`). Это **gate**. Без апрува не уходишь в I.
- **На правки** («добавь error X», «empty убери», «<экран> вообще без состояний») — обнови чек-лист и **выведи заново** до апрува.

После апрува запиши финальный список в `_session.states_covered` — массив из `"default"`, `"empty"`, `"loading"`, `"error"`, `"focus"` (в любой комбинации, минимум `["default"]`). Это уйдёт в telemetry issue в Шаге 8.

Установи `_session.edge_cases_approved = true` — это парная пометка к `i_approval_received` и `checklist_approved`, сигнализирует «третий gate Шага 6 пройден». Парсится `tools/aggregate-sessions.py` как опциональный сигнал.

**Каждое не-default состояние — отдельный фрейм.** Если `_session.states_covered` содержит `"empty"`, `"loading"` или `"error"` — Figma Implementer в Шаге 7 рисует их **отдельными фреймами**, рядом с happy-вариантом, с именованием `<Экран N> — <состояние>` (например, `Экран 3 — loading`, `Экран 3 — error`). Не «прятать» состояния внутри одного экрана. Так удобнее ревьюить.

### I. Финальная раскладка — последний gate перед Figma

**Перед переходом к Шагу 7 выведи дизайнеру итоговую раскладку файла:**

```
Итоговая раскладка макета — N фреймов всего:

Default (M happy-фреймов):
  • Экран 1 — Welcome
  • Экран 2 — Регистрация · форма
  • Экран 3 — Регистрация · OTP
  • Экран 4 — Профиль

Состояния (K дополнительных фреймов):
  • Экран 2 — error (failed validation)
  • Экран 2 — loading
  • Экран 3 — error (network)

Итого: M + K = N фреймов в файле.

Апрувни — после этого выведу финальный чек-лист с ASCII-мокапами всех экранов прямо в чате, посмотришь содержимое каждого фрейма перед Figma. Хочешь поправить раскладку (убрать состояние, добавить экран, переименовать) — скажи.
```

<!-- BUILDER_GATE: GATE_LAYOUT — не удалять. verify-builder-gates.sh грепает по этому якорю. -->
**Жди явный апрув** — apruv-word из allow-list секции «Approval tokens» (например «апрув», «ок», «поехали», «да»). На правки возвращайся в Шаг 6 H / E.1 и пересчитай.

Это **обязательный** gate — последний шанс дизайнеру откорректировать scope до записи в Figma. До этого момента (CJM, план компонентов, состояния) обсуждалось по частям; здесь дизайнер видит ИТОГ.

> _Если на этой раскладке что-то «не то» — спокойно скажи. Лучше переиграть до Figma, чем переделывать после._

**Телеметрия:** при получении явного апрува установи `_session.i_approval_received = true`. Это уйдёт в session-telemetry issue и парсится `tools/aggregate-sessions.py` — секция «Пропущенные gate'ы перед Figma (A-056)» в `docs/LEADERBOARD.md` считает сессии, где `figma_build = true` при `i_approval_received = false` («прыгнули через раскладку»).

---

### J. Pre-build divergence detector (тихий, не gate)

После I-апрува, ДО старта Шага 7 — Builder сравнивает финальное состояние плана с `_session.builder_picks[]` и фиксирует расхождения. Это **не блокирующая проверка**, а накопление обучающего сигнала для эволюции правил.

**Источник «фактического состояния плана»** — текущий рабочий буфер `/builder` после применения всех E.1 сверок, E.2 ответов, H walk-back, I drilldown. На момент J этот буфер консистентен с тем, что Builder отдаст в G-I1.5 (коммит c).

**Алгоритм.** Для каждой записи `_session.builder_picks[i]`:

1. **Если `builder_picks[i].picked === null`** (decision был `hide` или `gap`) — пропускаем сравнение. `hide` и `gap` финализируются через свою механику (E.2 ответы для gap, явный hide для `decision: hide`).
2. Поищи в `_session.rule_contributions[]` запись с тем же `(slug, slotProp, path)` и `type ∈ {"structural-gap", "uncertain-pick"}`. Если найдена — изменение уже зафиксировано в E.2 (через `designer_choice` / `designer_freetext` / `designer_overrode`); **пропусти**.
3. Иначе сравни `builder_picks[i].picked` с фактическим состоянием плана для этого slot.
4. Если различается — записать `type: "divergence"`:

```js
_session.rule_contributions.push({
  type: "divergence",
  component: "<componentName>",
  slug: builder_picks[i].slug,
  slotProp: builder_picks[i].slotProp,
  path: builder_picks[i].path,
  builder_proposed: builder_picks[i].picked,
  builder_confidence_was: builder_picks[i].confidence,
  final_actual: "<реальный preferred name в финальном плане>",
  divergence_step: "H" | "I-drilldown" | "unknown",
  ts: "<ISO>"
})
```

**Семантика `divergence_step`:**
- `"H"` — изменение раскладки edge cases повлекло смену slot.
- `"I-drilldown"` — дизайнер изменил при детальном просмотре экрана.
- `"unknown"` — Builder сам отклонился молча от своего же reasoning (потенциальный баг — записываем, `/fbAnalyzer` подсветит).

(E.1 в `divergence_step` отсутствует намеренно: E.1 апрувает компонент целиком, а не slot.picked внутри. Замена компонента на E.1 даёт другой `slug`, поэтому match по `(slug, slotProp)` не находится — branch пропускается через шаг 2 алгоритма, divergence не пишется. Это корректное поведение, не дыра.)

**Чего НЕ делает J:**

- Не задаёт вопросов дизайнеру.
- Не блокирует переход в Шаг 7.
- Не сравнивает с реальным Figma-output (это post-build divergence — отдельный класс, не в этом PR).

После J — переход в Шаг 7.

---

### Конец Шага 6 — обязательный переход к Шагу 7

После A–J план готов: A–I прошли с дизайнером, J тихо зафиксировал расхождения между E.0 reasoning и финальным состоянием. Дальше — Шаг 7, начиная с **чек-листа построения** (второй gate, о нём — в самом Шаге 7). I-апрув покрывает scope: сколько фреймов и какие состояния. Содержимое каждого фрейма (что внутри `meshok ↑` / контент / `meshok ↓`) ещё подлежит подтверждению через чек-лист Шага 7 — это **не повторное согласование scope**, а уточнение на следующем уровне детализации.

Если ты дочитал(а) до этой строки и Шаг 7 ещё не начался — это и есть твой сигнал, что **сейчас нужно начать Шаг 7**, а не отвечать дизайнеру «план готов, что дальше». План передаётся дальше как контекст. Не пересчитывай его в Шаге 7, но **Шаг 7 начинается с чек-листа, не с `use_figma`**.

---

## Шаг 7 — Figma

### Якорь — обязательный вход

Ты **обязан** попасть сюда сразу после Шага 6. Если ты только что закончил Шаг 6 пунктом I (получил явный апрув итоговой раскладки фреймов) — следующая твоя реплика и **первое действие** — это **чек-лист построения** (Pt-3 структурный по слотам скелета), который сам по себе **gate** и ждёт второго явного апрува дизайнера. Не «план готов, продолжаем?», и не сразу `use_figma` — между I-апрувом и Figma строго один шаг: чек-лист.

Два апрува между концом Шага 5 и записью в Figma не случайны:
- **I-апрув** (конец Шага 6) — раскладка ФРЕЙМОВ: сколько экранов, какие состояния. «Что и в каком количестве собираем.»
- **Чек-лист-апрув** (начало Шага 7) — СОДЕРЖИМОЕ каждого фрейма: navbar / контент / meshok ↓ по слотам скелета. «Что внутри каждого фрейма.»

Раздельные апрувы — дизайнер видит сначала scope, потом детали; правит на правильном уровне. Без второго апрува сборка идёт без подтверждения содержимого, и переделки множатся ([#133.2 + дизайнерский фидбэк 2026-05-18 «время сборки в стратосферу»]).

Если по какой-то причине ты «забыл» вывести чек-лист в предыдущем ходу и дизайнер пишет тебе «а где макет?» / «продолжай» / «ну?» — это сигнал, что ты застрял на границе Шага 6→7 или на gate'е чек-листа. **Немедленно выведи чек-лист** (если ещё не выводил) или подожди апрува (если уже выводил), без извинений и переоткрытия плана. **Только на границе I→чек-лист или внутри gate'а чек-листа** «продолжай» от дизайнера означает «выведи чек-лист, я его жду», не «начинай рисовать сразу». На других этапах `/builder` (Шаги 3, 4, 5, 6 без I-апрува, 8) интерпретируй «продолжай» по контексту того шага — не таскай эту эвристику глобально.

---

### Чек-лист построения — обязательный gate перед первым `use_figma`

До первого вызова `use_figma` в этом шаге **обязательно** выведи дизайнеру чек-лист построения. **Это явный gate** — ждёшь апрува или правки, не переходишь к сборке самостоятельно. Это последний шанс дизайнеру увидеть **что внутри каждого экрана** и поправить до записи в Figma. Без этого этапа сборка идёт без подтверждения содержимого, дизайнер видит криво собранный макет, переделки множатся, время в стратосферу.

Формат — буквально маркдаун-список ниже, заполненный конкретикой по текущему макету. **High-level**: ASCII-мокап каждого default-фрейма (рамки в моноширине), состояния — однострочным diff'ом. Без пропов и текстов. Детали по конкретному экрану — drill-down по запросу дизайнера (см. правила ниже).

```
Сейчас строю макет. Сверяемся по чек-листу:

1. Иерархия — <одной фразой про вложенность скелета фреймов>
2. Auto-layout — <стандарт из rules/skeleton.md или особенности (vertical, padding, gap)>

3. Содержимое экранов (ASCII-мокапы, high-level):

   • Экран 1 — Welcome
       ┌─────────────────────────────────┐
       │                                 │  ← meshok ↑ скрыт
       ├─────────────────────────────────┤
       │                                 │
       │  ┌────────────────────────┐     │
       │  │   heroIllustration     │     │
       │  └────────────────────────┘     │
       │                                 │  ← контент
       │  Заголовок                      │  ← header 1.1
       │  ┌───────────────────────────┐  │
       │  │ inputText                 │  │
       │  └───────────────────────────┘  │
       │  ┌───────────────────────────┐  │
       │  │ inputText                 │  │
       │  └───────────────────────────┘  │
       │  ☐ checkbox                     │
       ├─────────────────────────────────┤
       │  ┌───────────────────────────┐  │
       │  │      CTA                  │  │  ← meshok ↓ (button primary)
       │  └───────────────────────────┘  │
       └─────────────────────────────────┘

   • Экран 2 — Регистрация · форма
       ┌─────────────────────────────────┐
       │ ←   Шаг 1 из 4                  │  ← meshok ↑ (navbar 1.0)
       ├─────────────────────────────────┤
       │                                 │
       │  Заголовок                      │  ← header 1.1
       │  ┌───────────────────────────┐  │
       │  │ inputText                 │  │  остров 1
       │  └───────────────────────────┘  │
       │  ┌───────────────────────────┐  │
       │  │ inputText                 │  │
       │  └───────────────────────────┘  │
       │                                 │
       │  ☐ checkbox                     │  остров 2
       │  caption                        │
       ├─────────────────────────────────┤
       │  ┌───────────────────────────┐  │
       │  │      CTA                  │  │  ← meshok ↓ (button primary)
       │  └───────────────────────────┘  │
       └─────────────────────────────────┘

   • Экран 2 — error: добавляется message «...» под inputText; button → state=disabled
   • Экран 2 — loading: button → state=loading
   • Экран 2 — empty: контент → илло + ссылка; meshok ↓ скрыт

   ...все default-фреймы по ASCII-формату, состояния — однострочным diff'ом...

4. Edge cases — <длинный текст / отсутствие данных / RTL, если применимы; иначе «не применимы»>

Если состав по экранам совпадает с тем, что задумывали — апрувни, и я иду собирать в Figma. Если хочется уточнить пропы / тексты / варианты конкретного экрана — напиши «расскажи подробнее про Экран N», покажу полную раскладку только по нему. Если что-то не так на уровне состава — скажи, обновлю и покажу заново (scope (количество фреймов) уже зафиксирован в I-апруве — здесь правим только содержимое).
```

Правила:
<!-- BUILDER_GATE: GATE_CHECKLIST — не удалять. verify-builder-gates.sh грепает по этому якорю. -->
- **Жди явный апрув** ("апрув", "ок", "поехали", "рисуй", "да") перед первым `use_figma`. Это **gate**, не сверка. Без апрува — не запускаешь Figma Implementer.
- Если дизайнер просит правку — обнови содержимое чек-листа и **выведи заново** до апрува. Не запускай Figma на промежуточной версии.
- Чек-лист **обязателен** на каждом запуске Шага 7. Если ты собираешься сразу импортировать компонент, не выведя его — это сигнал, что ты «прыгнул через». Остановись и сначала выведи.
- Каждый пункт — **компактный**, не лекция. Pt 3 — главный, занимает большую часть; остальные — одна-две строки.
- Чек-лист — **краткий пересказ уже принятых решений Шага 6 (A–I), а не повторное чтение `.rule.json` / `registry/` / `rules/skeleton.md`**. Если не помнишь решение из Шага 6 — возвращайся в Шаг 6 и поднимай оттуда, файлы заново не читай.
- **Pt 3 — ASCII-мокапы фреймов** в моноширине, рамки `┌─┐│└─┘├─┤`. Структура каждого мокапа повторяет слоты скелета (`meshok ↑` / контент / `meshok ↓`), разделённые `├──┤`. Внутри слотов — вложенные рамки для компонентов (`button`, `inputText`, `header`), с inline-меткой справа `← <имя компонента>` или внизу `остров N`. Цель — дизайнер **визуально** проверяет «что куда лежит», как мини-wireframe.
- **Символьный словарь:** `← back` для back-button в navbar, `☐ checkbox`, `▬▬▬` для keyboard area, `...` для повторений однотипных элементов, `│ heroIllustration │` или `│ illo │` для иллюстраций. Не выдумывай экзотические символы — используй только перечисленные. Ширина мокапа — ~33 символа (mobile-портрет ratio).
- **Острова в `контент`.** Если контентный слот разбит на острова (смысловые блоки) — внутри мокапа разделяй острова пустой строкой ` │                                 │ ` и помечай метку справа `остров 1`, `остров 2`. Один остров — без метки.
- **Pt 3 — high-level, без пропов и текстов.** Не пиши `style=primary`, `title="..."`, `state=disabled`, реальные строки кнопок и сообщений **внутри мокапа**. Метки справа от рамки — это **типы** компонентов (`button primary`, `header 1.1`), не их пропсы. Реальные тексты и пропы — в drill-down (см. ниже).
- **Drill-down по запросу.** Если дизайнер пишет «расскажи подробнее про Экран N» / «детали Экрана N» / «покажи пропы Экрана N» — выведи полную раскладку **только по этому экрану**: тот же ASCII-мокап **+ строка ниже** с пропами (`button primary state=disabled label="Зарегистрироваться"`) и реальными текстами. Источник деталей — бриф / CJM / Шаг 6 E.1. Длинные строки / локализационные ключи — кратко цитируй в drill-down + полностью клади в Pt 4 «Edge cases». После drill-down ждёшь правку по этому экрану или возврат к high-level апруву на остальные — это **тот же** gate, не отдельный.
- **Pt 3 ВКЛЮЧАЕТ ВСЕ ФРЕЙМЫ из I-апрува**, включая состояния (error/loading/empty).
- **Default-фреймы** — полный ASCII-мокап. **Не-default фреймы (состояния)** — строго **однострочный** diff: `• Экран N — <state>: <diff одной фразой>; остальное как в Экране N`. Не повторяй мокап для состояния — это шум; читатель уже видел happy-вариант выше.
- Если за сессию Builder перезапускается (дизайнер попросил перерисовать) — чек-лист выводится **заново** на каждый запуск.

---

**Телеметрия чек-листа:** при получении явного апрува на чек-лист установи `_session.checklist_approved = true`. Это парная пометка к `i_approval_received` — вместе они образуют «оба gate'а пройдены». Парсится `tools/aggregate-sessions.py` — в секции «Пропущенные gate'ы перед Figma (A-056)» в `docs/LEADERBOARD.md` сессии, где `figma_build = true` при `checklist_approved = false`, считаются как «прыгнули через содержимое».

**Self-check перед figma_build (A-056).** Прежде чем установить `_session.stages.figma_build = true`, проверь оба флага: `i_approval_received` и `checklist_approved`. Если хотя бы один **не** `true` — это пропущенный gate. Не ломай поток сессии (дизайнер уже в шаге, прерывать неуместно), но **сразу** создай `auto:bug:gate-skipped` watchpoint по обычному алгоритму (см. ниже «Watchpoints — авто-создание issues»), и продолжай. `/fbAnalyzer` поднимет issue до P0/P1 (по политике для `auto:bug:*`) и пингнёт в Telegram.

Self-check выполняется **на каждом проходе** через установку `stages.figma_build = true` (включая повторные сборки при `figma_iterations += 1`). Дедуп — стандартный по `_session.auto_bug_issues[type]`: первое срабатывание создаёт issue, последующие за ту же сессию — comment «Повторилось».

**Это не гарантия, а быстрый сигнал.** Тот же контекст, который мог пропустить установку флагов в Шагах 6 I и 7, может пропустить и сам self-check. Параллельный медленный детектор — `tools/aggregate-sessions.py` → секция «Пропущенные gate'ы перед Figma» в `docs/LEADERBOARD.md` — ловит сессии, где self-check тоже мимо (см. A-056 в `tests/issues/agents.md`).

<!-- BUILDER_PREFLIGHT: USE_FIGMA — не удалять. verify-builder-gates.sh грепает по этому якорю. -->
### 🛑 PREFLIGHT перед каждым `use_figma`

Это **не рекомендация и не сверка**. Это **pre-condition вызова**: синтаксически невозможно вызвать `use_figma`, не пройдя проверку ниже.

```
assert _session.gates_passed.find(g => g.id === 'G-V6' && g.status === 'PASS')
assert _session.gates_passed.find(g => g.id === 'G-V5' && g.status === 'PASS')
assert _session.checklist_approved === true
assert _session.i_approval_received === true
// G-V3 (CJM) / G-V4 (states coverage) транзитивно покрыты: G-V5 невозможен
// без CJM-апрува и без явного выбора покрытия состояний (Шаг 6 H).
```

Если **любая** из проверок не выполняется → твой следующий ход **НЕ `use_figma`**. Твой следующий ход — **вывести чек-лист построения** (см. `<!-- BUILDER_GATE: GATE_CHECKLIST -->` выше) и halt. Не «продолжай», не «начинаю рисовать», не «давай быстро» — буквально вывести мокапы и ждать apruv-word.

Любая попытка пропустить — это violation `auto:bug:gate-skipped` watchpoint и self-catch FAIL-2. Этот preflight перекрывает всех «уговорил себя что апрув был», все «дизайнер пишет рисуй второй раз», все «план готов же». До G-V6 PASS — `use_figma` не существует.

**Телеметрия:** запомни `ts_figma_start` (текущий ISO timestamp). Установи `_session.stages.figma_build = true`.

**Чек-лист уже выведен и апрувнут дизайнером.** Дальше — импорт, не повторный вывод чек-листа. Если Implementer упадёт (A-057 retry на FILL-ошибке, A-024 на иерархии и т.п.) — чини plugin-код и продолжай импорт, не выводи чек-лист заново.

По плану из шага 6 — последовательно:

1. Text Layout Agent (`src/agents/text-layout/TEXT_LAYOUT_AGENT.md`)
2. JSON Layout Agent (`src/agents/json-layout/JSON_LAYOUT_AGENT.md`)
3. Figma Implementer (`src/agents/figma-implementer/FIGMA_IMPLEMENTER_AGENT.md`)

Все три используют план и контекст уже собранные в шагах 5–6. Не перечитывают `rules.md`, `.rule.json` или `registry/` целиком повторно.

После Figma Implementer проверь возвращённый `errors[]` (см. `FIGMA_IMPLEMENTER_AGENT.md` → «Обработка ошибок»).

**Per-frame timing (#252).** На КАЖДЫЙ `use_figma`-вызов записывай G-I3 запись с расширенными timing-полями. Алгоритм:

```
1. Перед генерацией use_figma-кода для очередного фрейма:
   ts_start = <текущий ISO>
   retry_count = 0
   retry_reasons = []

2. Вызов use_figma. Если упало (errors[] непуст или throw в plugin-коде):
   retry_count += 1
   retry_reasons.push("<класс: A-057 / A-024 / timeout / ...>")
   почини код, повтори use_figma.

3. После успеха (errors[] пуст):
   ts_end = <текущий ISO>
   duration_sec = round((Date.parse(ts_end) - Date.parse(ts_start)) / 1000)
   _session.gates_passed.push({
     id: "G-I3",
     status: "PASS",
     reason: "frame N rendered",
     ts: ts_end,
     ts_start, ts_end, duration_sec,
     frame_index: N,    // порядковый номер фрейма из I-апрувленного плана (1..N).
                        // Стабильный per сборки; счётчик redo всей сессии — _session.figma_iterations
                        // (эти оси ортогональны).
     retry_count, retry_reasons,
   })
```

Это даёт `aggregate-sessions.py` распределение «время на фрейм + retry-rate» для оптимизационных решений (#252 + связанные follow-up'ы про bootstrap-import).

**Телеметрия успеха:**
- Если `errors[]` пустой → `_session.import_success = true`.
- Если непустой → `_session.import_success = false`, и для каждой ошибки увеличь соответствующий счётчик в `_session.retries`.
- Считай количество уникальных успешно импортированных компонентов → `_session.components_imported`.

### Watchpoints — авто-создание issues

При каждом срабатывании одного из типов ошибок builder **сам** создаёт `auto:bug:*` issue, не дёргая дизайнера. Триггеры:

| Что произошло | Тип watchpoint |
|---|---|
| Figma вернула `IMPORT_FAILED` / 404 при импорте | `auto:bug:import-failed` |
| Ключ из реестра не нашёлся в Figma (например, через `search_design_system` или при `importComponentByKeyAsync` с `"not found"`) | `auto:bug:registry-stale` |
| Для компонента нет файла `rules/components/<slug>.rule.json` | `auto:bug:missing-rule` |
| `use_figma` бросил exception в plugin-коде Builder'а (включая случаи, когда Builder сам починил на retry — A-057 FILL-ошибка, A-024 ошибки иерархии, и т.п.). Сюда же — любая необработанная `throw` внутри сгенерированного `code` параметра | `auto:bug:builder-error` |
| Self-check перед `stages.figma_build = true`: `i_approval_received != true` и/или `checklist_approved != true` (пропущен хотя бы один gate — Шаг 6 I и/или Шаг 7) | `auto:bug:gate-skipped` |

**Алгоритм создания (с дедупом в сессии):**

1. Добавь тип в `_session.watchpoints_fired` (если ещё не там).
2. Посмотри в `_session.auto_bug_issues[type]`:
   - **Если уже есть** (в этой сессии этот тип уже создавался) → не плоди новый issue. Вызови `mcp__github__add_issue_comment` с текстом «Повторилось: <компонент> · <ts>». Готово.
   - **Если нет** → создавай новый.
3. Вызови `mcp__github__issue_write`:
   ```
   operation: "create"
   owner: "kotik-botik"
   repo: "kotik-botik"
   title: "[auto-bug] <type> · <component> · <session_id-короткий>"
   labels: ["session-telemetry", "auto:bug:<type-suffix>"]
   body: см. ниже
   ```
4. **Если `issue_write` упал** (лейбла нет, MCP недоступен, нет прав): не падай. Запиши в `_session.watchpoints_fired` тип с пометкой `:write-failed`. Продолжай работу. Дизайнер ничего не заметит.
5. Если успешно — запиши `_session.auto_bug_issues[type] = issue_number`.
6. **Скажи дизайнеру одной строкой**, без стектрейсов:

   > «Зафиксировала техническую ошибку — Настя посмотрит. Хочешь, попробую обходными путями?»

**Body issue (markdown):**

```markdown
## Что случилось

- **Тип:** auto:bug:<type>
- **Компонент:** <component>
- **Session:** <session_id>
- **Дизайнер:** @<designer_login>
- **Время:** <ISO timestamp>

## Trace

\`\`\`
<error.message из errors[], одна-две строки. Без стектрейса.>
\`\`\`

## Контекст

- HEAD: <git rev-parse --short HEAD>
- В реестре: <да/нет>
- Правило: <slug.rule.json: есть и approved / есть WIP / нет>
```

**Вариант body для `auto:bug:gate-skipped`** (runtime-trace неприменим, нужен иной набор полей):

```markdown
## Что случилось

- **Тип:** auto:bug:gate-skipped
- **Session:** <session_id>
- **Дизайнер:** @<designer_login>
- **Время:** <ISO timestamp>

## Состояние gate'ов перед figma_build

- `i_approval_received`: <true / false / отсутствовал>
- `checklist_approved`: <true / false / отсутствовал>
- `figma_iterations`: <число на момент срабатывания, 0 если первый заход>

## Контекст

- HEAD: <git rev-parse --short HEAD>
- Скриптовые наблюдения: <Шаг 6 I был выведен? чек-лист Шага 7 был выведен? — одной строкой каждое; если builder сам не уверен, пиши «неизвестно»>
```

**Не оставляй дизайнеру** просьбу «запусти `/fb bug:import-failed`» — это устаревшее поведение. Builder теперь сам фиксирует тихие техсбои. Только субъективные баги (`bug:rule-incorrect`, `bug:builder-error`) и UX-замечания остаются через `/fb`.

### Сообщение об ошибках дизайнеру

Если в `errors[]` что-то есть — выведи список понятным языком (без MCP-стектрейсов, без сырых ключей):

> «Макет собрался, но с косяками:
> — `navbar` не импортировался (устаревший ключ; уже зафиксировала, Настя посмотрит)
> — `meshok ↑.title` не выставился (проп переименовали)
> Хочешь, попробую обходными путями, или сначала пофиксим?»

В конце — ссылка на файл в Figma. Жди финального апрува.

### Политика «деградации scope»

Если ты по ходу Шага 7 **сократил/а изначально согласованную раскладку** (в I-апруве было N фреймов, нарисовалось < N), это **не silent fail**. Дизайнер должен явно увидеть:
1. **Что планировалось** — список фреймов из I-апрува.
2. **Что собралось** — реально нарисованные фреймы.
3. **Почему** — короткая причина каждого пропущенного (auto:bug:registry-stale на компонент X, auto:bug:builder-error на FILL, исчерпан бюджет токенов, и т.п.).
4. **Что дальше** — варианты: «починить и пересобрать» / «оставить как есть proof-of-concept» / «отказаться от пропущенных экранов осознанно».

Формат сообщения:

```
⚠ Я собрала не всё что планировали. Сверка с апрувом:

✅ Собрано (3 из 7):
  • Экран 1 — Welcome
  • Экран 2 — Регистрация · форма (default)
  • Экран 3 — OTP (default)

❌ Не собрано:
  • Экран 4 — Профиль — упал импорт `navbar` (auto:bug:registry-stale, issue #N)
  • Экран 2 — error — Figma API ошибка на FILL-sizing (auto:bug:builder-error, issue #M)
  • Экран 3 — loading, Экран 4 — empty — не дошла, остановилась после двух подряд фейлов

Что делаем дальше?
  1. Подожди — починю обходными путями и пересоберу остаток.
  2. Оставим как proof-of-concept, ты посмотришь, дальше — другая сессия после фиксов.
  3. Удалить ✅собранное и попробовать заново.
```

Это **обязательное** сообщение. Не оставляй макет «частично готовым» без явной коммуникации, какая часть пропущена и почему. Дизайнер сам решит, продолжать ли. Деградация scope **без** этого сообщения = регресс UX (мы ловили в сессии 2026-05-17, см. #134).

**Телеметрия после успеха в Figma:**
- `_session.ts_figma_end` = текущий ISO timestamp.
- `_session.duration_figma_build_sec` = ts_figma_end − ts_figma_start (в секундах).
- На каждый redo/повтор рисования (если дизайнер просит пересобрать) — `_session.figma_iterations += 1`.

**Расчёт `placeholder_pct` и `accuracy_pct`:**

Когда макет принят (дизайнер сказал «ок / апрув» в конце Шага 7), быстро пройди по созданным фреймам через `get_design_context(fileKey, nodeId)`:

- **placeholder_pct** = доля INSTANCE_SWAP-слотов, в которых `mainComponent.name` совпадает с дефолтным (т.е. не свапнули, остался плейсхолдер) / общее число INSTANCE_SWAP-слотов в сборке. 0 если слотов вообще не было.
- **accuracy_pct** = доля инстансов, где variants/booleans/text из плана совпадают с фактически проставленными свойствами / общее число проверяемых инстансов. Логика — как в `/test --full` (см. `tests/scripts/`).

Запиши в `_session.placeholder_pct`, `_session.accuracy_pct`. Если расчёт сорвался (Figma недоступна, нет fileKey) — оставь `null` оба поля, не падай.

---

## Шаг 7.5 — Размножение по платформам

После того как макет собран в исходной платформенной секции и дизайнер апрувнул финальный результат — спроси, скопировать ли в другие платформы.

Условия запуска (если хоть одно не выполнено — Шаг 7.5 пропускается тихо):
- `_session.stages.figma_build == true` и `_session.import_success == true`.
- В `_session.platform_sections` есть хотя бы одна **другая** платформа кроме исходной (`_session.target_platform`) с непустым id.

Реплика дизайнеру:

> «<имя_платформы_source> готов. Скопировать в другие платформы? Variable mode у каждой секции автоматом переключит компоненты на нужный визуал.
>
> Доступные: <перечисли только те платформы из `platform_sections`, где id не null, исключая `target_platform`>. Можно через запятую или «все».
>
> Ответь «нет» — пропустим этот шаг.»

Парсинг ответа:
- «все» / «всё» / «всех» → массив всех доступных destinations.
- Список через запятую / пробел («ios, web», «iOS Web Mob») → парсь регистронезависимо, отфильтруй до известных платформ из `platform_sections`. **Source-платформу (`_session.target_platform`) ОБЯЗАТЕЛЬНО выкидывай из этого списка** — self-clone не имеет смысла и сломает раскладку.
- apruv-word без указания → если доступна **одна** other-платформа, используй её; если несколько, переспроси «какую именно?».
- «нет» / молчание / уход → `_session.ios_propagated = false` (исторический ключ, оставляем имя для обратной совместимости с aggregate-sessions), идём в Шаг 7.6 без шума.
- **Ничего не распарсилось** (дизайнер написал что-то непонятное / все токены отфильтрованы как unknown platforms / после source-фильтра list пустой) → переспроси один раз:
  > «Не поняла, в какие платформы копировать. Доступные: <список other-платформ>. Напиши их через запятую, или «все», или «нет» — иначе пропущу этот шаг.»
  Если и после переспроса парсинг пустой — трактуй как «нет», идём дальше без шума.

Для каждой выбранной destination-платформы запусти один `use_figma`-блок:

  ```js
  // Ветка 2: переключимся на нужную страницу
  if (TARGET_PAGE_ID) {
    await figma.setCurrentPageAsync(await figma.getNodeByIdAsync(TARGET_PAGE_ID));
  }
  var srcSection = await figma.getNodeByIdAsync(SOURCE_SECTION_ID); // _session.target_section_id
  var dstSection = await figma.getNodeByIdAsync(DEST_SECTION_ID);   // _session.platform_sections[<destination>]

  // фреймы исходной секции — отсортируем по x, исключим placeholder
  var srcFrames = srcSection.children.filter(function(n){ return n.type === 'FRAME' && n.name !== 'Экранчик'; });
  srcFrames.sort(function(a, b){ return a.x - b.x; });

  // Удалим placeholder Экранчик в destination, если есть
  var dstPlaceholder = dstSection.children.find(function(c){
    return c.type === 'FRAME' && c.name === 'Экранчик';
  });
  if (dstPlaceholder) dstPlaceholder.remove();

  var errors = [];
  for (var i = 0; i < srcFrames.length; i++) {
    try {
      var c = srcFrames[i].clone();
      dstSection.appendChild(c);
      c.x = srcFrames[i].x;
      c.y = srcFrames[i].y;
    } catch(e) {
      errors.push({ frame: srcFrames[i].name, msg: e.message });
    }
  }
  return { copied: srcFrames.length - errors.length, total: srcFrames.length, errors: errors };
  ```

  На успех — реплика «готово, скопировала N фреймов в `<destination>`». На частичный фейл — «скопировала M из N, у `<frame>` не получилось». На полный фейл — стандартный watchpoint `auto:bug:builder-error`.

После всех destination-копирований сохрани в `_session.propagation = { source: '<source platform>', destinations: ['<plat1>', '<plat2>', ...], copied: <N total>, errors: <K total> }`.

**Телеметрия (с обратной совместимостью):**
- `_session.propagation` — новый объект с полной картиной.
- `_session.ios_propagated` — boolean для обратной совместимости с `aggregate-sessions.py`: `true` если `'ios'` есть в `destinations`, `false` если шаг прошёл без iOS, `null` если шаг пропустили целиком.

---

## Шаг 7.6 — Заполнение паспорта фичи

После сборки макетов и (опционально) копирования в iOS — тихо заполни карточку-паспорт `Шаблон фичи 2.0` на текущей странице по данным из брифа + `whoami` Figma. Дизайнеру отдельно ничего не выводи, кроме финальной строки о результате.

Условия запуска (если хоть одно не выполнено — Шаг 7.6 пропускается тихо):
- `_session.stages.figma_build == true`.
- На целевой странице есть инстанс с `mainComponent.name == 'Шаблон фичи 2.0'` (паспорт). В ветке 2 (новая страница в существующем файле) паспорта на странице нет — Шаг 7.6 пропускается. Скажи дизайнеру одной строкой:
  > «На этой странице паспорта нет — заведи руками, если нужен.»
- В `researchOutput.passport` есть хотя бы одно непустое поле (иначе нечего заполнять).

### Данные для подстановки

**Обязательные / автозаполняемые:**
- **`featureName`** ← `researchOutput.passport.featureName`. Если `null` — оставь дефолтный текст `Название фичи`.
- **`shortDescription`** ← `researchOutput.passport.shortDescription`. Если `null` — оставь `Краткое описание`.
- **`jiraUrl`** ← `researchOutput.passport.jiraUrl`. Hyperlink на чип `Jira` в карточке.
- **`designerName`** ← из `whoami` Figma (`handle`). Маппинг на variant через **token-set match (order-independent)**:
  1. Токенизируй handle: `handle.toLowerCase().split(/\s+/).filter(Boolean)` → set слов.
  2. Для каждого `option` в `rules/components/designer-product.rule.json:variants.выбери.options` — токенизируй так же.
  3. Match: множества слов совпадают (без учёта порядка). `Анастасия Кащеева` ↔ `Кащеева Анастасия` — match. `Антон Андреев` ↔ `Антон Андреев` — match (тут оба source и option в порядке «имя фамилия» — token-set всё равно сходится).
  4. На один match → используй variant. На несколько — выведи дизайнеру выбор «нашла несколько кандидатов: <список>, кого ставим?». На 0 — fallback на дефолтный variant **и** скажи дизайнеру одной строкой: «не нашла тебя в библиотеке аватарок — поставила дефолтного, поправь руками если нужно». В session-telemetry — `passport_filled.designer = 'fallback-default'`.
- **`productName`** ← `researchOutput.passport.productLead`. Тот же token-set алгоритм против `rules/components/feature-product.rule.json:variants.выбери.options`. Отличие: дизайнер часто пишет только фамилию (один токен). Тогда match если token whoami-strings есть **подмножеством** option-токенов. На несколько кандидатов с одной фамилией → дизайнеру выбор. Не нашёлся → variant `плейсхолдер 👀`.

**Опциональные (если в `researchOutput.passport` `null` — пропусти поле, плейсхолдер останется как есть):**
- **`period`** ← `researchOutput.passport.period`. Подставляется в TEXT-ноду `01` (заглушка `разработка Q3`). Парную TEXT `2` (заглушка `релиз Q4`) очисти (`.characters = ''`), чтобы не висел старый текст.
- **`relatedTasks`** ← массив до 4 строк из `researchOutput.passport.relatedTasks`. Каждый элемент → TEXT-нода с `characters` `Задача 1..4`. Пустые слоты не трогаем (заглушки остаются).
- **Таблица** (`goals` / `problems` / `hypotheses` / `metrics` / `research` / `limitations` / `notes`) ← в паспорте каждая строка таблицы — Frame, в котором два TEXT с `name === 'componentName'`: первый — заголовок строки (`Цели` / `Проблемы` / ...), второй — значение-плейсхолдер (повторяет заголовок: `Цели`, `Проблемы`, ...). Алгоритм: найди frame по первому TEXT (label), возьми второй TEXT в том же родителе, замени `.characters`. Если у поля `null` — не трогай.

### Plugin-код (один `use_figma`-блок)

<!-- verify-forbidden-ops:skip-start -->
<!--
  Passport flow в Шаге 7.6 — special-purpose form introspection. Шаблон фичи
  (passport.rule.json не существует, это plain Figma instance с TEXT-полями).
  applyRuleDriven к нему не применим — нет rule-driven контракта. Прямые
  findOne / setProperties здесь легитимны: мы заполняем ad-hoc form fields,
  не свапаем rule-описываемые компоненты.
-->
```js
// Ветка 2: сначала переключаемся на целевую страницу
if (TARGET_PAGE_ID) {
  await figma.setCurrentPageAsync(await figma.getNodeByIdAsync(TARGET_PAGE_ID));
}
var passport = figma.currentPage.findOne(function(n){
  return n.type === 'INSTANCE' && n.mainComponent && n.mainComponent.name === 'Шаблон фичи 2.0';
});
if (!passport) return { skipped: 'no passport instance' };

var errors = [];
var filled = [];

// 1. Текстовые поля — findChild по текущему значению, замена .characters
async function setTextByCurrentValue(rootInst, currentValue, newValue, fieldLabel) {
  if (newValue == null) return;
  var node = rootInst.findOne(function(n){
    return n.type === 'TEXT' && n.characters === currentValue;
  });
  if (!node) { errors.push({ field: fieldLabel, msg: 'placeholder TEXT not found' }); return; }
  try {
    await figma.loadFontAsync(node.fontName);
    node.characters = newValue;
    filled.push(fieldLabel);
  } catch (e) {
    errors.push({ field: fieldLabel, msg: e.message });
  }
}

await setTextByCurrentValue(passport, 'Название фичи',   FEATURE_NAME,       'featureName');
await setTextByCurrentValue(passport, 'Краткое описание', SHORT_DESCRIPTION, 'shortDescription');

// 2. Jira-чип: hyperlink на родительский frame чипа
// (детали структуры — найди INSTANCE 'Link Icon / Jira', подмотай родительский Frame, поставь node.hyperlink)
if (JIRA_URL) {
  var jiraIcon = passport.findOne(function(n){
    return n.type === 'INSTANCE' && n.mainComponent && n.mainComponent.name === 'Link Icon / Jira';
  });
  if (jiraIcon && jiraIcon.parent) {
    try {
      jiraIcon.parent.hyperlink = { type: 'URL', value: JIRA_URL };
      filled.push('jiraUrl');
    } catch (e) { errors.push({ field: 'jiraUrl', msg: e.message }); }
  }
}

// 3. Дизайнер — variant swap
if (DESIGNER_VARIANT) {
  var designerInst = passport.findOne(function(n){
    return n.type === 'INSTANCE' && n.name === 'выбери дизайнера';
  });
  if (designerInst) {
    try {
      designerInst.setProperties({ 'выбери': DESIGNER_VARIANT });
      filled.push('designer:' + DESIGNER_VARIANT);
    } catch (e) { errors.push({ field: 'designer', msg: e.message }); }
  }
}

// 4. Продакт — variant swap
if (PRODUCT_VARIANT) {
  var productInst = passport.findOne(function(n){
    return n.type === 'INSTANCE' && n.name === 'выбери продакта';
  });
  if (productInst) {
    try {
      productInst.setProperties({ 'выбери': PRODUCT_VARIANT });
      filled.push('product:' + PRODUCT_VARIANT);
    } catch (e) { errors.push({ field: 'product', msg: e.message }); }
  }
}

// 5. Период — TEXT name='01' + опционально очистить TEXT name='2'
if (PERIOD) {
  var nodeA = passport.findOne(function(n){ return n.type === 'TEXT' && n.name === '01' && n.characters === 'разработка Q3'; });
  var nodeB = passport.findOne(function(n){ return n.type === 'TEXT' && n.name === '2' && n.characters === 'релиз Q4'; });
  if (nodeA) {
    try {
      await figma.loadFontAsync(nodeA.fontName);
      nodeA.characters = PERIOD;
      if (nodeB) {
        await figma.loadFontAsync(nodeB.fontName);
        nodeB.characters = '';
      }
      filled.push('period');
    } catch (e) { errors.push({ field: 'period', msg: e.message }); }
  }
}

// 6. Связанные задачи (до 4 строк)
if (RELATED_TASKS && RELATED_TASKS.length) {
  for (var i = 0; i < Math.min(RELATED_TASKS.length, 4); i++) {
    var taskLabel = 'Задача ' + (i + 1);
    var taskNode = passport.findOne(function(n){
      return n.type === 'TEXT' && n.characters === taskLabel;
    });
    if (!taskNode) { errors.push({ field: 'task' + (i+1), msg: 'placeholder not found' }); continue; }
    try {
      await figma.loadFontAsync(taskNode.fontName);
      taskNode.characters = RELATED_TASKS[i];
      filled.push('task' + (i + 1));
    } catch (e) { errors.push({ field: 'task' + (i+1), msg: e.message }); }
  }
}

// 7. Таблица — find frame by label, take 2nd TEXT child as value
async function setTableCell(label, value, fieldKey) {
  if (value == null) return;
  // Найди frame, чей первый TEXT-ребёнок === label
  var frames = passport.findAll(function(n){
    if (n.type !== 'FRAME') return false;
    var texts = (n.children || []).filter(function(c){ return c.type === 'TEXT'; });
    return texts.length >= 2 && texts[0].characters === label;
  });
  if (!frames.length) { errors.push({ field: fieldKey, msg: 'row frame not found' }); return; }
  var valueNode = frames[0].children.filter(function(c){ return c.type === 'TEXT'; })[1];
  try {
    await figma.loadFontAsync(valueNode.fontName);
    valueNode.characters = value;
    filled.push(fieldKey);
  } catch (e) { errors.push({ field: fieldKey, msg: e.message }); }
}

await setTableCell('Цели',         GOALS,       'goals');
await setTableCell('Проблемы',     PROBLEMS,    'problems');
await setTableCell('Гипотезы',     HYPOTHESES,  'hypotheses');
await setTableCell('Метрики',      METRICS,     'metrics');
await setTableCell('Исследования', RESEARCH,    'research');
await setTableCell('Ограничения',  LIMITATIONS, 'limitations');
await setTableCell('Примечание',   NOTES,       'notes');

return { filled: filled, errors: errors };
```

<!-- verify-forbidden-ops:skip-end -->

### Итог дизайнеру

Если хотя бы одно поле заполнилось — одна короткая строка:

> «Паспорт заполнила: название, описание, Jira, дизайнер (`<ФИО>`), продакт (`<ФИО>`).»

Если что-то не нашлось (например, `placeholder TEXT not found` — паспорт уже редактировался руками, плейсхолдер-текст изменён) — на каждую такую ошибку **watchpoint `auto:bug:builder-error`** (стандартный алгоритм), а дизайнеру:

> «Паспорт заполнила частично — `<список заполненного>`. Часть полей не нашла, Настя посмотрит.»

**Телеметрия:** `_session.passport_filled` = `{designer: bool, product: bool, featureName: bool, shortDescription: bool, jiraUrl: bool, period: bool, relatedTasks: <int 0-4>, goals: bool, problems: bool, hypotheses: bool, metrics: bool, research: bool, limitations: bool, notes: bool}` уходит в telemetry-issue Шага 8. По логам Настя видит, какие опциональные поля дизайнер заполняет на практике, какие игнорируют — это сигнал, какие из них вообще оставить в паспорте, а какие выпилить.

---

## Шаг 8 — Пульс и телеметрия

После финального апрува макета дизайнером (Шаг 7 закрыт), задай **два мягких вопроса** по одному. Не выводи их одновременно — жди ответа на первый, потом задавай второй.

### Вопрос 1

> «Мы закончили ✨ Хочешь рассказать, что было не так или не понравилось? Передам хозяйке.»

Подожди ответ до 60 секунд. Принимай:
- Любой свободный текст → запиши в `_session.pulse.negative_note`.
- `«—»`, `«нет»`, `«всё ок»`, `«ничего»` → `negative_note = null`, идём дальше.
- Молчание / уход → `negative_note = null`.

### Вопрос 2

> «Будет здорово, если расскажешь, что понравилось. Это важно для моего роста 🧡»

Аналогично — свободный текст → `_session.pulse.positive_note`, иначе `null`.

### Определение `mood`

Простая rule-based классификация по двум полям:

| `negative_note` | `positive_note` | → `mood` | Label |
|---|---|---|---|
| Непустое | Пустое | `negative` | `pulse:negative` |
| Пустое | Непустое | `positive` | `pulse:positive` |
| Непустое | Непустое | `mixed` | `pulse:mixed` |
| Пустое | Пустое (оба пропустили) | `null` (skipped) | `pulse:skipped` |

Если один из ответов состоит только из позитивных коротких слов («ок», «нормально», «отлично», «✓») — считай как пустой в негативной графе или непустой в позитивной (по контексту вопроса).

### Если в negative_note есть конкретный сигнал

Два кейса:

1. **Технический** — упоминание слота, импорта, текста, размера, цвета. Мягко предложи:

   > «Если хочешь, могу оформить это отдельным репортом через `/fb`, чтобы Настя точно увидела. Сказать `да` или `не надо`.»

2. **Про агента** — упоминание имени или роли (research, analytics, product, experience, implementer, «аналитик», «продакт», «исследователь»). Предложи фидбэк именно на агента:

   > «Заметила, что ты упомянула {role}. Хочешь отдельно сказать пару слов про его работу? Передам отдельным репортом. `да` / `не надо`.»

   На `да` → запусти `/fb agent:<role>`.

**После успешного создания issue через `/fb`** (любой вариант — `bug:*`, `feedback:*`, `agent:*`) — инкрементируй счётчик персонального вклада:

```
if _session.user_feedback_baseline is not None:
    _session.user_feedback_session_delta += 1
```

Это компенсирует задержку search-индекса GitHub: только что созданный репорт сразу учитывается в финальной фразе Шага 8.X, не дожидаясь индексации.

Не настаивай. На `не надо` или молчание — иди дальше. Можно предложить только одно из двух (не оба сразу), выбирай по доминирующему сигналу.

### Закрытие сессии — telemetry issue

Запомни `_session.ts_end` (текущий ISO). Вычисли `_session.duration_total_sec = ts_end − ts_start` в секундах.

Собери JSON по схеме из `docs/SESSION_TELEMETRY.md`. Создай issue через `mcp__github__issue_write`:

```
operation: "create"
owner: "kotik-botik"
repo: "kotik-botik"
title: "[session] <component> · <designer_login> · <date YYYY-MM-DD>"
labels: ["session-telemetry", "pulse:<mood>"]
body: markdown с JSON-блоком, см. ниже
```

**Body:**

```markdown
## Session

\`\`\`json
{
  "session_id": "...",
  "ts_start": "...",
  "ts_end": "...",
  "duration_total_sec": 0,
  "duration_figma_build_sec": 0,
  "designer_login": "...",
  "component": "...",
  "stages": { ... },
  "cjm_approved": true,
  "cjm_iterations": 0,
  "figma_iterations": 0,
  "import_success": true,
  "components_imported": 0,
  "watchpoints_fired": [...],
  "retries": { "import": 0, "cjm_redo": 0 },
  "placeholder_pct": 0.0,
  "accuracy_pct": 0.0,
  "states_covered": ["default"],
  "target_file_key": "...",
  "target_page_id": null,
  "target_platform": "android",
  "section_created": false,
  "propagation": null,
  "ios_propagated": null,
  "passport_filled": null,
  "user_feedback_baseline_source": "search",
  "personal_thanks_emitted": true,
  "auto_mode": false,
  "gates_passed": [],
  "text_layout": [],
  "json_layout": [],
  "pulse": {
    "mood": "...",
    "negative_note": "...",
    "positive_note": "..."
  },
  "agent_feedback": [],
  "builder_picks": [],
  "rule_contributions": []
}
\`\`\`

Поле `rule_contributions` — массив объектов с дискриминатором `type` (`usage-hint` | `structural-gap` | `uncertain-pick` | `divergence`). Каждый тип имеет свой набор полей (см. `_session` schema комментарий и описания E.2/J). Обратная совместимость: записи без `type` трактуются как `usage-hint`. Если за сессию ни E.2/J не сработали — массив остаётся `[]` (всегда эмить ключ).

Поле `builder_picks` — массив решений Builder'а на E.0 reasoning. Эмить всегда. Используется в auto-issue под-шага 8.bis (только на уровне Дизайнер) и в `/fbAnalyzer` для аудита.

Поле `auto_mode` — берётся из `_session.auto_mode`. В обычном `/builder` отсутствует или `false`. `true` ставит только `/test --full` (Шаг 0.5 test.md), маркируя adversarial-сессию. Литерал `false` в шаблоне выше — placeholder, не дефолт: при `_session.auto_mode === true` эмить `true`. `tools/aggregate-sessions.py` использует это поле для исключения synthetic-сессий из leaderboard/drift/rule-contributions.

## Связанные auto-bugs

<если _session.auto_bug_issues не пуст — перечисли ссылки на #N>
<иначе: «—»>

(`auto_bug_issues` собирается из watchpoint'ов в Шаге 6. Auto-issue из под-шага 8.bis сюда НЕ попадает — он создаётся после закрытия этой telemetry-issue.)

## Решения Builder'а (builder_picks)

<если _session.builder_picks не пуст — перечисли group by path[0] (это slug компонента top-level, например meshok-up; не имя экрана):>

### <component> (`<path[0]>`)

- `<slotProp>` → **<decision>** `<picked or "—">` (confidence: `<confidence>`) — <reason>

<иначе: «—»>

## Вклады в правила (rule contributions)

<если _session.rule_contributions не пуст — перечисли group by type, пропускай пустые секции:>

### Usage hints (`usage-hint`)

- **<component>** (`<slug>`): «<hint>»

### Structural gaps (`structural-gap`)

- **<component>.`<slotProp>`** (`<slug>`):
  - <если designer_choice> выбрал: `<designer_choice>`
  - <если designer_freetext> описал: «<designer_freetext>»
  - <если auto_picked> auto-picked: `<auto_picked>` — `<auto_pick_reason>`

### Uncertain picks (`uncertain-pick`)

- **<component>.`<slotProp>`** (`<slug>`): Builder → `<builder_proposed>` (`<builder_confidence_was>`); финал → `<designer_choice or builder_proposed>` <если designer_overrode: **(overrode)**> <если auto_confirmed_on_silence: **(auto-confirmed)**>

### Divergence

- **<component>.`<slotProp>`** (`<slug>`): Builder → `<builder_proposed>` (`<builder_confidence_was>`); финал → `<final_actual>` (при `<divergence_step>`)

<иначе для всего блока «Вклады в правила»: «—»>
```

**Если `issue_write` упал** — не падай и ничего не пиши дизайнеру. Запомни «телеметрия не записалась» и продолжай. На уровне Настя это будет видно в логах сессии Claude.

**Если успешно** — выполни **под-шаг 8.bis** (auto-issue) если уровень Дизайнер и есть actionable записи (см. ниже). Затем собери финальную реплику по правилам Под-шага 8.X ниже. Никаких упоминаний ни telemetry-issue, ни auto-issue.

### Под-шаг 8.bis — Auto-issue `bug:missing-rule` (только на уровне Дизайнер)

**Identity-check.** Уровень определяется явно в этой точке: `level = (_session.designer_login === "starkhoney") ? "nastya" : "designer"`. Identity-check механика — см. CLAUDE.md, секция «Identity-check». `designer_login` уже зафиксирован в `_session` к моменту Шага 8 (см. Шаг 0).

**На уровне Настя (`level === "nastya"`) — sub-шаг пропускается всегда.** Настя видит весь `rule_contributions[]` в telemetry-issue body и решает руками.

**Сбор actionable записей.** Из `_session.rule_contributions[]` выбери записи следующих категорий:

- `type: "structural-gap"` — все записи (Category A: дизайнер выбрал, описал, или Builder auto-picked).
- `type: "uncertain-pick"` c `designer_overrode: true` (Category A': Builder ошибся, дизайнер поправил).

**Если набор пуст — sub-шаг 8.bis пропускается.** Auto-issue не создаётся.

**Bundled mode — один issue на сессию, не N по числу записей.**

`title`: `[builder] Правила требуют доводки (session <id8>)` — где `<id8>` это первые 8 символов `_session.session_id` (если session_id пустой — используется дата `YYYY-MM-DD`).

`body` (markdown, секции с записями рендерятся только если в них есть данные):

```markdown
## Контекст

Сессия `/builder` зафиксировала места, где правила компонентов требуют доводки. Это автоматический сигнал — Настя посмотрит, дополнит правила, в следующий раз Builder сделает выбор сам. Данные частично дублируют telemetry-issue намеренно: эта auto-issue — actionable summary для Насти, telemetry — полный архив сессии.

- session_id: <полный session_id или «—»>
- telemetry-issue: #<NN>
- HEAD: <короткий хеш>

## Структурные пробелы (Category A — Builder не знал что положить)

<если в rule_contributions[type=structural-gap] есть записи, перечисли group by slug:>

### <slug>

- `<slotProp>` (компонент `<componentName>`):
  - <если designer_choice> Дизайнер выбрал: `<designer_choice>`
  - <если designer_freetext> Дизайнер описал: «<designer_freetext>»
  - <если auto_picked> Builder выбрал сам (дизайнер не ответил): `<auto_picked>` — `<auto_pick_reason>`

<если вся секция пустая — секция целиком не рендерится>

## Подтверждённые отклонения (Category A' — дизайнер переопределил мой выбор)

<если в rule_contributions[type=uncertain-pick, designer_overrode=true] есть записи, group by slug:>

### <slug>

- `<slotProp>` (компонент `<componentName>`):
  - Builder выбрал: `<builder_proposed>` (confidence: `<builder_confidence_was>`)
  - <если designer_choice> Дизайнер заменил на: `<designer_choice>`
  - <если designer_freetext> Дизайнер описал свой кейс: «<designer_freetext>»

<если вся секция пустая — секция целиком не рендерится>
```

Labels: `["designer-feedback", "bug:missing-rule"]`.

**Auto-issue НЕ попадает в `_session.auto_bug_issues`** — он создаётся после закрытия telemetry-issue, telemetry на момент записи не знает его номер. Связка двусторонняя: auto-issue ссылается на telemetry-issue (знает номер), telemetry-issue auto-issue не упоминает.

**При ошибке создания auto-issue** — Builder не падает, продолжает к финальной реплике как обычно. На уровне Настя это будет видно в логах.

**После создания auto-issue Builder молчит в финальной реплике** — не упоминает ни telemetry-issue, ни auto-issue. Дизайнер уже отвечал на эти вопросы вживую в E.2; ссылки на issues в финале — шум, не ценность.

### Под-шаг 8.X — Персональная благодарность

Все шаблоны реплик, pre-check ветки, правила выбора, нормализация title и запреты по тону — в **`docs/PERSONAL_THANKS.md`**. Открой этот файл и собирай реплику строго по нему.

**Safety-net fallback.** Если `PERSONAL_THANKS.md` по какой-то причине недоступен (контекст-лимит, файл удалён, сбой Read) — выведи единственную короткую фразу `«Готово! ✨ Спасибо за работу 🧡»`, поставь `_session.personal_thanks_emitted = false` и выходи. Никогда не выдумывай реплику по памяти.

**Алгоритм коротко** (полное описание — в `docs/PERSONAL_THANKS.md`):

1. **Pre-check 1:** если `_session.user_feedback_baseline == null` → короткая ветка «baseline не собрался». `personal_thanks_emitted = false`. Выходи.
2. **Pre-check 2:** если `_session.pulse.mood == "negative"` → короткая ветка «negative pulse». `personal_thanks_emitted = false`. Выходи.
3. **Default ветка:** считаем `N = baseline.n + session_delta`, `M = baseline.m` → выбираем шаблон из таблицы в `PERSONAL_THANKS.md` по `(N, M)`. После вывода — `personal_thanks_emitted = true`.
4. **Второй абзац** (опционально): если `M ≥ 1` И `_session.user_feedback_recent_titles` не пуст после фильтра по `_session.user_feedback_shown_titles` — выбери случайный title, добавь в `shown_titles`, выведи второй абзац.

**Не дублируй формулировки в этом файле.** Если меняется тон или появляется новая ветка — правится `docs/PERSONAL_THANKS.md`, а здесь только алгоритм.

### Под-шаг 8.snapshot — Auto-snapshot для P2 objective check (введён в PR #1a, #215)

После всех мутирующих под-шагов Шага 8 (telemetry-issue + 8.bis auto-issue + 8.X personal thanks) Builder пишет финальный snapshot сессии для будущего diff baseline'а.

**Что пишется:**

```
tests/baseline/builder-snapshots/<session_id>.json
{
  "session_id": "<полный session_id>",
  "commit_sha": "<git rev-parse HEAD на момент сессии>",
  "rules_digest": "<sha256 canonical-JSON всех rules/components/*.rule.json + rules/semantic-roles.json>",
  "ts": "<ISO timestamp окончания сессии>",
  "semantic_roles_enabled": <_session.semantic_roles_enabled>,
  "brief": {
    "platform": "<_session.target_platform>",
    "screens": [<краткий перечень CJM>],
    "designer_login": "<_session.designer_login>"
  },
  "builder_picks": [<_session.builder_picks>],
  "text_picks":    [<_session.text_picks>],
  "plan_targets":  [<_session.plan_targets>],
  "coverage_pct":   <_session.coverage_pct>,
  "rule_contributions": [<_session.rule_contributions>]
}
```

**`ruleTrees` НЕ сохраняется** — деревья большие, в snapshot не нужны (для diff достаточно picks/text/plan).

**`rules_digest` — детерминированный baseline.** sha256 от concat sorted всех `rules/components/*.rule.json` + `rules/semantic-roles.json` в **canonical-JSON** форме (`jq -cS .` — compact + sorted keys). Реализация — `tools/rules-digest.sh` (введён в PR #1c, P2 #215). Вызывается в самом конце сессии до `fs.writeFile`. Это нужно для воспроизводимости diff'а: между двумя сессиями rule.json'ы могли быть отредактированы Настей out-of-band; `rules_digest` показывает, изменились ли правила, и помогает отделить «эффект P2» от «эффект ручного редактирования rule.json».

**Микротесты Builder reasoning core** — `tests/scripts/applyRuleDriven-tests.js` (введён в PR #1c). 5 кейсов: anti-cycle, layoutRules top-level only, picked vs isDefault при flag toggle, PIN-фикстура (CJM «PIN-экран» → `keyboardNumeric`), G-I2.1 appliesTo mismatch. Запуск: `node tests/scripts/applyRuleDriven-tests.js`. Plain node + assert.

**Цель:** PR #1a (semantic-roles schema, flag=false) пишет snapshot'ы как baseline текущего поведения. После активации flag в PR #1b и серии PR #2-5 — diff между новыми snapshot'ами и baseline'ом покажет реальный effect P2 (см. objective check, шаг 7 эпика #215).

**Идемпотентность:** snapshot — pure write, без чтения существующих файлов. Если `session_id` повторяется (что не должно происходить) — overwrite. Если запись не удалась (нет прав, файловая система readonly) — Builder не падает, продолжает к концу сессии. На уровне Настя это видно в логах сессии Claude.

**Размер:** один snapshot ~5-30KB JSON. За месяц при 10 сессиях — ~300KB; не блокер для репо.

`tests/baseline/builder-snapshots/` **коммитится в репо** — нужна история сессий для diff'ов на шаге 7 эпика #215 (objective check). Не путать с `.raw.json` (debug-only artifact parseProps'а) — это другая директория и другая цель.

**Snapshot-write — только под Настей** (Bash write physically запрещён правами доступа Дизайнера, см. CLAUDE.md). На уровне Дизайнер snapshot write пропускается с silent warning в logs — это намеренно, baseline'ы для objective check копятся в Настиных сессиях.

---

## Тон

Только русский, дружелюбно. Не показывай дизайнеру JSON, `componentKey`, стектрейсы, номера issues, поля `_session`.
