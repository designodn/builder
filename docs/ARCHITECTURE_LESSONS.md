# Architecture lessons

Накопительный single-source для архитектурных уроков, добытых дорогой ценой. Используется как **обязательный pre-read** перед началом любого schema-эпика — иначе урок забывается через 3-6 месяцев и повторяется.

Формат записи:
- **Урок** — одна короткая формулировка-правило.
- **Откуда:** какая ситуация привела к выводу (эпик, PR, контекст).
- **Тест/критерий:** конкретная проверка для будущего планировщика.
- **Дата:** когда зафиксировали.

---

## Правило N кейсов

**Урок:** Новая ось в schema (новое поле верхнего уровня в `rule.json`, новый namespace в `semantic-roles.json`, новый gate в `_session.gates_passed`) требует **≥2 независимых кейсов в реестре ДО начала эпика**. Один кейс — это **фича, не ось**. Discovery (grep по реестру, перебор кандидатов на slot-level / variant-level / boolean-level) — обязательный **Phase 0** любого schema-эпика.

**Откуда:** Эпик #215 P2 (semantic-roles). Активировали schema + namespace + gates на одном кейсе `meshok-down.systemComponent` (PR #1a → #223, #1b → #224, #1c → #225). PR #2 typography-atom стартовали с гипотезы «обобщаемость» — кейс нашли только в `custom-contentsview` (3 slot'а × 11 typography-preferred). Усомнились в семантической природе (см. ниже «Тест semantic vs visual»). Решение — закрыть P2 на одном кейсе, не натягивать второй ради симметрии. Это **провал планирования** (single-case axis), не провал реализации (инфраструктура дешёвая, additive schema, ноль миграции — расширим если появится 2-й кейс).

**Тест/критерий для будущего:**
1. **Phase 0 каждого schema-эпика:** grep по реестру правил `rules/components/*.rule.json` с конкретным паттерном (`INSTANCE_SWAP`, `variants[]`, `booleans[]`, и т.д.) — найти **≥2 кандидатов**. Если только 1 — стоп, axis не оправдан.
2. **Discovery документируется** в первом PR эпика (Phase 0 commit или PR description). Перечисление найденных кейсов + почему они независимы.
3. **Если 2-й кейс натягивается «ради симметрии» через 2 итерации pair-сессий** — это сигнал что 2-го кейса нет. Закрывать эпик честно лучше, чем додумывать.

**Дата:** 2026-05-22.

---

## Тест «semantic vs visual» для semantic-roles

**Урок:** Роль в `rules/semantic-roles.json` семантическая (валидна), если её **значение определяется контекстом использования**, а не свойствами самого элемента. Если роль — это просто другое имя визуального свойства — это **антипаттерн**, не semantic-role.

**Откуда:** Эпик #215 P2 (см. выше). При планировании namespace `typography/*` усомнились — `typography/h1` это размер шрифта или семантика? По критерию ARCHITECTURE.md «семантическая, не визуальная» — typography/h1 ближе к anti-pattern `small-text` (визуальный признак), чем к valid `form/error` (намерение).

**Тест/критерий для будущего:**

> **Можно ли поменять роль, не меняя элемент?**
> - **Если да — это семантика.** ✓ `form/error` (тот же визуальный hint может быть `form/warning` в другом контексте экрана — одна visual-форма, разные роли).
> - **Если нет — это визуал.** ✗ `typography/h1` (h1 это h1 везде, нельзя сменить роль не сменив элемент).
> - **Граница:** `typography/heading` теоретически проходит тест (heading в карточке ≠ heading в модалке выбора стиля). Но реального кейса в реестре нет (см. «правило N кейсов» выше) — поэтому axis не вводится. Если через ≥12 мес. появится ≥2 кейса с реальной context-dependent ролью heading — расширим через PR #1d. `typography/h1` тест **не** проходит — это визуальный размер.

**Применение к существующим axis'ам:**
- **`slot.role` + `preferred.semanticRoles[]`** — для semantic кейсов (контекст экрана → выбор preferred). Пример: `system/anonymous-bottom` ↔ `handle ❖ view`.
- **`variants[].builderRule`** — для visual axis (variant value внутри одного компонента). Пример: `header.size: ["27","21","17","15"]` через builderRule «27 — H1 страницы».
- **`booleans[].whenOn/defaultOn`** — для on/off-toggle axis.
- **`slot.usage` / `intent` свободный текст** — для нюансов которые не покрываются enum'ом (LLM-reasoning).

Если кейс не проходит «namespace test» — он принадлежит другой axis, не semantic-roles.

**Дата:** 2026-05-22.

---

## Эпик #215 P2 — итог и будущее

**Статус:** закрыт на одном кейсе. PR'ы #1a/#1b/#1c merged. PR #2 typography-atom **не открывался** (см. «Тест semantic vs visual»). Эпик считается **dormant feature** (не mistake) — инфраструктура existed, активирована, работает.

**Что закрыто:**
- `slot.role: string` + `preferred[].semanticRoles[]` schema в `rules/schema/component-rule.schema.json`.
- `rules/semantic-roles.json` с namespace `system/*` (6 ролей) и зарезервированными пустыми `form`, `loading`, `media` (все три — **slot-namespaces**: слот с подменяемым контентом). Namespace `typography` рассмотрен и **отклонён** как **leaf-axis, не slot-axis**: текст — leaf, не контейнер; размер/вес/leading кодируются через `variants[].builderRule`, не через `slot.role`. Не проходит «semantic vs visual» тест категориально (см. lesson выше).
- Gates G-I2.1 (role-enum-valid) + G-I2.2 (role-mapping-exists) + G-I2.3 (deferred).
- `_session.semantic_roles_enabled` flag (default true).
- `tools/rules-digest.sh` + микротесты `tests/scripts/applyRuleDriven-tests.js`.
- Один реальный slot-preferred кейс: `meshok-down.slots[systemComponent]` с 5 valid preferred под разные контексты экрана.

**Что осталось dormant:**
- Расширение semantic-roles на ≥2-й кейс. Если через 6 мес. появится — открывать PR #1d с предусмотренной инфраструктурой (cost: нулевой). Если через 12 мес. не появится — закрыть как formal dormant в `CHANGELOG.md`.
- 3 зарезервированных пустых namespace (`form`, `loading`, `media`) — slot-namespaces, оставить для возможного расширения. Не удалять до 12-месячного лимита. `typography` удалён как leaf-axis, не slot-axis (см. «Что закрыто» выше).

**Что переоткрыто:**
- **P1 backlog** (заполнение WIP-правил через `/parseProps --batch --hypothesize`) — следующая задача после ретроспективы. Не блокируется P2-результатами.

---

## Pending axes (накопление кейсов)

Список архитектурных изменений, которые **не легализуются сейчас** по правилу N кейсов, но **могут понадобиться** в будущем. Фиксируем триггер расконсервации и место в реестре — чтобы не забыть через 6-12 мес. и не пересоздать ось «с нуля».

### `textNodes[]` array (multi-intrinsic-TEXT per компонент)

**Текущий статус:** schema `component-rule.schema.json` имеет singular `textNode` (PR #271). Используется только `inputtext` для intrinsic placeholder. N=1 кейс.

**Что не закрыто:** у `inputtext` 2 intrinsic TEXT-нод (placeholder + text). Filled-state рендерится через ad-hoc `setTextNodeContent` в plugin-коде без rule.json контракта. Caveat зафиксирован в `inputtext.rule.json` `doc.whenToUse` + `text#5913:57.builderRule`.

**Триггер расконсервации:** появление 2-го компонента с ≥2 intrinsic TEXT-нод (нет componentProperty TEXT-binding). Phase 0 grep: `grep -l "setTextNodeContent\|textNode" rules/components/*.rule.json` → если N ≥ 2 — открывать PR.

**Связано:** issue #270, PR #271 (singular textNode legalize), #265 (auto-issue conversion ускорит накопление кейсов).

**Что НЕ делать сейчас:** не легализовывать `textNodes[]` оси на 1 кейсе. Не вводить `oneOf: [singular, array]` defensive паттерн — это provisioning без оснований.

**Дата фиксации:** 2026-05-25.

---

### Skeleton structure: meshok ↑ как sibling content_body

**Текущий статус:** `rules/skeleton.md` определяет `meshok ↑` как **первый ребёнок** `content_body` в flat-режиме. Дизайнер в одной сессии (#258) выразила эстетическое предпочтение «meshok ↑ должен быть сиблингом content_body» (3-слот page-frame: `meshok ↑` + content_body + `meshok ↓` как parallel siblings).

**Что не закрыто:** layout fundamentals не пересматриваются на 0 функциональных кейсов — только эстетика одной сессии. Менять fundamental layout pattern, затрагивающий **каждый фрейм в каждой сессии** — категорически нет без N ≥ 2.

**Триггер расконсервации:** **≥2 независимые сессии** где `meshok ↑ внутри content_body` вызывает **функциональный** сбой:
- Padding конфликт (content_body внешний padding ≠ meshok ↑ edge-to-edge — реальное визуальное расхождение в Figma).
- Scroll-behavior баг (meshok ↑ скроллится с контентом когда не должен).
- Auto-layout ошибки в Figma plugin API.

Эстетика «структурно красивее видеть 3 слота на одном уровне» — НЕ триггер.

**Связано:** issue #258, `docs/SPRINT_2026-05-11.md` (skeleton design), #265 (auto-issue ускорит накопление функциональных кейсов).

**Что НЕ делать сейчас:** не трогать `rules/skeleton.md` layout fundamentals на 0 кейсов.

**Дата фиксации:** 2026-05-25.

---

### Interactive-states sub-axis (states_covered)

**Текущий статус:** `states_covered` enum расширен на `"focus"` (PR #274) — опциональный кадр интерактивного состояния inputText'ов для UX-демо. Это **первый** «не-snapshot» state (предыдущие default/empty/loading/error — про **что показано**, focus — про **взаимодействие**).

**Что не закрыто:** есть потенциальные кандидаты hover / pressed / disabled / dragging — другие классы interactive-state'ов для разных компонентов (кнопки, чекбоксы, drag-handles). Сейчас не нужно — но если 2-3 запроса появятся от разных компонентов, имеет смысл обобщить в `interactive-states` sub-axis.

**Триггер расконсервации:** ≥2 разных компонента (не inputText-семейство) с запросами на interactive-state coverage. Phase 0 grep: `grep -l "hover\|pressed\|disabled\|dragging" rules/components/*.rule.json` или поиск в session-telemetry issues по этим словам. Если N ≥ 2 — открывать эпик «interactive-states sub-axis» с обобщением.

**Возможный future-state:** разделить `states_covered` enum на две измерения:
- `data-states[]`: default / empty / loading / error (про contents)
- `interactive-states[]`: focus / hover / pressed / disabled (про user-input)

Или оставить плоский enum, но с явной категоризацией в spec'е.

**Связано:** issue #261, PR #274 (focus extension), #270 (textNodes[] миграция — нужна для рендеринга focus-state).

**Что НЕ делать сейчас:** не разделять `states_covered` на data-states/interactive-states. Не вводить hover/pressed/disabled на 0 кейсов. Не пытаться «обобщить» focus на остальные категории «ради симметрии».

**Дата фиксации:** 2026-05-25.

---

### Boolean-level screen-context tags (`contextOn[]` / `contextOff[]`)

**Текущий статус:** идея из эпика #205 Step 4, не легализована. На slot-уровне screen-context уже выражается через `slot.role` + `preferred[].semanticRoles[]` (#215 P2 — `system/*` namespace). Ввод того же на boolean-уровне создаст две оси для одного знания → drift.

**Что не закрыто:** на boolean-уровне может быть legitimate context-зависимость:
- `inputtext.← left` — sparkle vs context-icon (search/phone/password/free-text)
- `meshok-up.tabs#2369:0` / `search#2373:14` / `float#2377:1` — page-level feature visibility
- `navbar.<- left#1031:9` — back-button hide on welcome/success screen

Все three — пограничные. Phase 0 строгого чтения показал что 3 из 4 найденных кейсов оказались **не** screen-context (component-internal UX, paired-slot visibility, slot-variant choice), а true boolean-level screen-context кейсов = 0-1. Это **anti-pattern натягивания 2-го кейса** из section «Правило N кейсов» выше.

**Триггер расконсервации:** ≥2 booleans в **разных** компонентах, для каждого накоплено ≥2 usage-hints от **разных** дизайнеров за 30 дней, где hint содержит:
- screen-level marker (welcome / success / form / error / login / etc), **НЕ** component-internal state (hover / focus / disabled / interactive)
- **НЕ** paired-slot visibility pattern (boolean ↔ slot — это data, не контекст)

Phase 0 grep при расконсервации:
```bash
python3 tools/aggregate-sessions.py --rule-contributions 30 | grep -iE 'экран|welcome|success|форм|ошибк|login'
```
(`aggregate-sessions.py` выдаёт markdown, не JSON — потому grep, не jq.)

**Связано:** #205 Step 4 (отложен), #205 Step 5 (отменён как bullshit-by-aspiration, см. CHANGELOG), #215 P2 (semantic-roles на slot-уровне, активирован на одном кейсе).

**Что НЕ делать сейчас:** не вводить `booleans[].contextOn/Off` schema. Не заводить closed dictionary screen-contexts. Не натягивать второй кейс из component-internal UX-логики или из paired-slot visibility. Если конкретный slot хочет «hide on screen X» — это **paired-boolean** (existing pattern), не новый axis.

**Дата фиксации:** 2026-05-26.

---

**Применение pending axes**: каждый раз когда видишь намерение «давайте просто расширим / поменяем X» — сверяйся с этой секцией. Если ось здесь — она waiting for N=2+ trigger. Не открывать эпик без триггера.
