# Issues — Agents

Поведение `/builder`, `/syncKeys`, Research / Text Layout / JSON Layout / Implementer-агентов. Префикс `A-NNN`.

## Открытые

### [ ] A-059 · setProperties для INSTANCE_SWAP требует mainComponent.id, не cloud-key

При попытке свапнуть слот meshok ↓ `✏️ buttonsView#1073:1` на buttonsViewBottom вызов `inst.setProperties({ propKey: cloudKey })` с cloud-key из rule.json (`14248ad08611...`) роняет `"in setProperties: Property value is incompatible with component property type"`. Правильный путь — предварительно `await figma.importComponentByKeyAsync(cloudKey)` → потом `setProperties({ propKey: importedComponent.id })`.

**Где:** контракт `applyRuleDriven` в `.claude/commands/builder.md` (Шаг 6 / Шаг 7) — должен явно оговаривать, что для каждого INSTANCE_SWAP-prop в JSON Layout `value` — это локальный node.id, а не cloud-key. Контракт может либо принимать оба и резолвить через import, либо требовать строго node.id.
**Как лечить:** добавить в G-I2 / G-I3 валидацию: для каждого `slots[X].picked.key` в `_session.builder_picks[]` плагин-сторона делает `getNodeByIdAsync(localId)` или предварительный `importComponentByKeyAsync(cloudKey)` и подставляет `imported.id`. Замечать ошибку контракта раньше, чем падает setProperties.
**Замечено:** /test --full 2026-05-24 (мой adversarial-прогон на странице 848:398).

### [ ] A-060 · setProperties с одним невалидным prop тихо отвергает весь объект

Составной вызов `inst.setProperties({ '✏️ label#2014:84': 'Название', '✏️ placeholder#5913:21': 'Например, Дом', '✏️ hint#2014:106': 'Так адрес проще искать' })` для inputText 1.0 не применил ни один prop. Причина: `placeholder#5913:21` — в реальном `componentProperties` имеет тип BOOLEAN (см. R-062), и type-mismatch на нём отверг весь setProperties-вызов целиком, без partial-apply. Все 3 input'а на фрейме `address-edit` (851:9272 / 851:9324 / 851:9432 / 851:9485) остались с дефолтными «label / placeholder / hint».

**Где:** `.claude/commands/builder.md` Шаг 7 (Figma write) — при apply textProps в `applyRuleDriven`.
**Как лечить:** до вызова `inst.setProperties(props)` валидировать каждый ключ `props[k]` против `inst.componentProperties[k].type`: если type-mismatch — выкинуть из объекта и записать `divergence_step: "unresolved_gap"` в `_session.rule_contributions[]`. Альтернатива — ставить пропы по одному в цикле с try/catch вокруг каждого; partial-apply сохранит валидные пропы. Текущее поведение Figma-API «всё или ничего» — silent-failure, builder его не ловит.
**Замечено:** /test --full 2026-05-24 (диагностика componentProperties у инстанса 851:9324 показала `placeholder#5913:21: { type: BOOLEAN }`).

### [ ] A-061 · `throw new Error('HEAL_RESULT:')` в use_figma откатывает мутации

При попытке вернуть данные из плагин-кода через документированный канал `throw new Error('HEAL_RESULT:' + JSON.stringify(out))` MCP-обёртка `use_figma` откатывает все мутации, сделанные до throw. Симптом: моя первая сборка 3 фреймов на странице `test 1` (id 18:4) вернула валидные in-memory IDs (`846:*`), `get_screenshot` сразу после ругался «invalid node ID», следующий `get_metadata` показал childCount=0. Перезапуск без throw (и с `figma.notify` вместо канала возврата) — мутации остались на месте.

При этом `/test --component` использует тот же паттерн (`throw HEAL_RESULT:`) для возврата результата микротеста, и в test.md явно написано «throw — единственный канал». Несогласованность: либо MCP различает мутирующий vs read-only код, либо контракт микротеста на самом деле полагается на то, что sandbox-фрейм можно потерять (он не нужен после).

**Где:** `.claude/commands/builder.md` Шаг 7 — если builder ставит финальный `throw HEAL_RESULT:` для возврата pageId/frames, вся write-сессия пропадает.
**Как лечить:** (а) запретить throw в Шаге 7 builder.md, возвращать данные через отдельный read-only use_figma после write'а (запросом `get_node_by_id` / нашим `findFramesOnPage(pageId)`-плагином). (б) уточнить контракт в test.md: для `/test --component` throw работает, потому что sandbox-cleanup не зависит от его сохранения; для `/test --full` шаг 7 не должен throw'ать. (в) добавить в `docs/BUILDER_GOTCHAS.md` заметку: `figma.notify` в use_figma не возвращает данные в MCP-канал (см. O-008) — для трейсинга использовать throw на read-only пасах, не на write.
**Замечено:** /test --full 2026-05-24 (две сборки на page 848:398 — первая с throw HEAL_RESULT откатилась, вторая без throw сохранилась).

### [ ] A-062 · Builder пропустил `rules/skeleton.md` контракт целиком (adversarial-прогон)

В прогоне /test --full 2026-05-24 тест-агент собрал каждый screen-frame напрямую: navbar appendChild'ed в screen-frame, без `meshok ↑` wrapper, без `content_body` (VERTICAL auto-layout, FILL width, HUG height), без bound vars для width/height (литералы 390/844 вместо `screen-width`/`screen-height`), без bound vars для padding (нули вместо `cp-16` + `content-to-bottom`), без выбора page style mode (flat / with-islands).

Следствия в аудите: `skeletonViolations=3` (все 3 фрейма — `meshok ↓` фактически не ABSOLUTE, потому что screen-frame `layoutMode='NONE'`, и Figma `layoutPositioning='ABSOLUTE'` без auto-layout-родителя игнорируется), `tokenCoverage.fills=0`, `placeholderHits=9`.

**Где:** мой adversarial-проход — тест-агент срезал rule-driven instantiation. Но проблема и в builder'е реальном: единственный текущий гейт, который ловит skeleton-нарушения, — это финал-аудит `tests/scripts/full-accuracy.figma.js`, который смотрит только на meshok ↓ + paddingLeft на frame root. Нет гейта на отсутствие meshok ↑ или хардкод width/height/fills.
**Как лечить:** добавить **G-V0** (pre-build) в builder.md: skeleton.json прочитан, baseline.mobile.{w,h} extract'нуты, выбранный page style mode записан в `_session.page_style_mode`. Без PASS на G-V0 переход к G-V1 запрещён. Дополнительно расширить full-accuracy.figma.js — проверять (а) наличие `meshok ↑` в первом ребёнке content_body, (б) `frame.boundVariables.width/height` присутствуют, (в) `content_body.boundVariables.paddingLeft/Right/Top/Bottom/itemSpacing` присутствуют, (г) `frame.fills[0].boundVariables` присутствуют.
**Замечено:** /test --full 2026-05-24.

### [ ] A-063 · pairedBoolean defaultOn=true для secondary slots создаёт «полосатые» placeholder'ы при отсутствии контента

На фрейме `address-saved` (851:9722) и каждой `uniCell` (851:8633 / 851:8705 / 851:8758) визуально видны полосатые placeholder-стрипы: navbar — справа от ← (правый action slot), uniCell — слева (left avatar slot) и справа (trailing slot). Это потому что в rule.json у uniCell `← left#19526:0` defaultOn=true со swap'ом на `aa40b8b9...` (`universal placeholder`, broken=true), у navbar/header — аналогично с другими `right` / `left` booleans. Builder в моей реализации не выключил их при отсутствии запрошенного контента — оставил как есть, и placeholder marker отрисовался.

**Где:** контракт `applyRuleDriven` в `.claude/commands/builder.md` — секция о boolean/slot pairing.
**Как лечить:** при apply slot'а из rule.json: если для slot'а нет контента в брифе/CJM (не упомянут, не подтверждён дизайнером), выключать `pairedBoolean = false` ЯВНО, а не оставлять `defaultOn=true`. Альтернативно — выбирать первый non-broken validated `preferred[isDefault]`, а не оставлять placeholder marker. Сейчас «оставить дефолт» = «оставить broken placeholder», что эквивалентно `placeholderSignal +1`.
**Замечено:** /test --full 2026-05-24 (placeholderSignal=51 — преимущественно из этого паттерна).

### [x] A-058 · Recursive Rule-driven swap — ЗАКРЫТ 2026-05-21 (PR #179 + fix-PR с textNode)

**Резолюция итеративная — PR #179 ввёл helper, post-PR валидация на живом мокапе выявила 2 проблемы → fix-PR закрыл всё:**

- **PR #179** — добавлен helper в `.claude/commands/builder.md` (`applyRuleDriven` + `findSwappedChild`).
- **Post-PR live test** (Figma `twL50t4GFELOKpEwFWSvwW`, frame `811:6875`): helper упал на `n.children` access (RECTANGLE/TEXT/VECTOR не имеют `children` getter). Plus introspection показала: `no subtitle · content` (default content для navbar middle) **не имеет** text-componentProperty — только `tags#21963:3`, `badge#21963:0`, `style`. Текст «Title/Text» — intrinsic TEXT-нода, не componentProperty. Закрытие A-040/A-043/A-045 через `textProps` было переоценено.
- **Fix-PR:** (а) `findSwappedChild` guard `'children' in n` вместо `n.children`. (б) Добавлен `setTextNodeContent(inst, text, font)` — BFS до первой TEXT-ноды + `loadFontAsync` + `.characters` set. (в) `applyRuleDriven` поддерживает `textNode` leaf-поле в ruleTree (рядом с `textProps`). (г) В builder.md добавлена таблица «`textProps` vs `textNode`» для различения двух кейсов.
- **Финал-тест** (frame `813:6920`): meshok ↑ → navbar 1.0 → no subtitle · content → текст **«Профиль»** в Inter Semi Bold. Никаких placeholder'ов на 3 уровнях. ✅

**Архитектура helper'а:**
- **Хост-сторона** — Builder строит `ruleTree` объект, рекурсивно резолвя `nestedProps.ruleRef` через `rules/components/<ruleRef>.rule.json` файлы; инлайнит дерево в use_figma код как литерал (без I/O в plugin sandbox).
- **Plugin-сторона** — `applyRuleDriven(inst, ruleTree)`: рекурсивно по slots применяет swap на `preferred[isDefault=true]`, set'ит `pairedBoolean` по `alwaysOn`/`defaultOn`, ставит `variants.default`, `textProps.sampleTexts[0]` (если componentProperty TEXT-type), либо `textNode.contextText` (если intrinsic TEXT-нода). Для каждого свапнутого slot'а BFS ищет child через `findSwappedChild` (с `'children' in n` guard) и рекурсивно применяется.

**Закрывает одновременно (на финал-тесте подтверждено):**
- R-021 (navbar.middle placeholder) — через nested.navbar.slots[middle] swap на content
- R-036 (toast placeholder в meshok ↓) — если pairedBoolean defaultOn / Builder включил
- R-037 (buttonsView placeholder в meshok ↓) — то же
- A-040 / A-043 / A-045 (navbar title не отображается) — через `textNode` (loadFontAsync + .characters) — реальный текст в финал-фрейме `813:6920` подтвердил

**Ограничения (known):**
- `findSwappedChild` BFS до первого match по `mainComponent.id` — на больших инстансах с несколькими одинаковыми preferreds может найти не тот child. Для текущих rule.json не воспроизводится.
- `setTextNodeContent` берёт первую TEXT-ноду BFS — для маленьких контейнеров (navbar middle) OK; для случаев с несколькими TEXT-нодами Builder сам находит правильный sub-инстанс и вызывает helper на нём.
- `contextValue` / `contextText` поля — Builder сам решает когда вместо default/sampleTexts подставить контекст из брифа. Helper только применяет переданное.

**Где:** `.claude/commands/builder.md` → секция «Rule-driven instantiation — контракт» → подраздел «`applyRuleDriven` — реализация рекурсивного контракта».

---

### [ ] A-057 · `layoutSizingHorizontal/Vertical = 'FILL'` падает при вызове ДО `appendChild`

Регрессионный сценарий: Figma бросает `layoutSizingHorizontal/Vertical = 'FILL' can only be set on children of auto-layout frames` если sizing-свойство ноды выставляется ДО того, как нода добавлена в auto-layout parent. Корень — на момент `inst.layoutSizingHorizontal = 'FILL'` нода ещё orphan (нет parent), Figma валидирует sizing-свойства против parent'а.

**Откуда:** сессия 2026-05-17 (#134, root-cause анализ; #133.4 предложил расширить watchpoints на builder-error).

**Контракт (зафиксирован в `.claude/commands/builder.md` Шаг 6 A-046 → Гoтча 1.5 A-057):**
- ❌ Неправильно: `inst.layoutSizingHorizontal = 'FILL'; parent.appendChild(inst);`
- ✅ Правильно: `parent.appendChild(inst); inst.layoutSizingHorizontal = 'FILL';`
- Helper-pattern для plugin-кода: `addChildFill(parent, child, axis)` — сначала `appendChild`, потом `sizing`.

То же правило применимо к `layoutGrow = 1`, `layoutAlign = 'STRETCH'` и любому другому sizing-свойству, валидируемому против parent'а.

**Что проверять в `/test --full`:**

1. Любой prog `/builder`, в плане которого есть `FILL` по горизонтали или вертикали (любой list/feed/contentsView с auto-stretch'ем) — после первого `use_figma` `errors[]` НЕ должен содержать сообщений с pattern `layoutSizing.* can only be set`. Если есть — регресс A-057.
2. Если Builder поймал такую ошибку и сам починил на retry — в `_session.watchpoints_fired` должен быть `bug:builder-error`, и в issues создан `auto:bug:builder-error` issue с trace.

**Где смотреть baseline:**
- `.claude/commands/builder.md` Шаг 6 A-046 → раздел «Гoтча 1.5 (A-057)».
- `src/agents/figma-implementer/FIGMA_IMPLEMENTER_AGENT.md` — все примеры импорта должны использовать addChildFill-pattern.
- PR #149 (этот) — точка введения helper'а.

---

### [ ] A-056 · Builder «прыгает через» текст-скелет (Шаг 6 I раскладка + Шаг 7 чек-лист) перед `use_figma`

Регрессионный сценарий для двух обязательных gate'ов между CJM и Figma: I-апрув итоговой раскладки фреймов (Шаг 6 I) и апрув чек-листа содержимого по слотам (Шаг 7). Без явной проверки Builder может перейти прямо к `use_figma`, дизайнер видит сразу криво собранный макет, переделки множатся.

**Что проверять в `/test --full`:**

1. **Сценарий «лента карточек с подгрузкой».** Брифинг: «экран ленты с асинхронной загрузкой контента». Ожидание: в Шаге 6 H Builder перечислил `default + empty + loading` словами, спросил дизайнера «какие рисуем», получил подтверждение и реально нарисовал skeleton-вариант (или контейнер-плейсхолдер с `📝 Typography` шиммером, если в реестре нет skeleton-компонента). В `_session.states_covered` записано минимум `["default", "loading"]`.
2. **Сценарий «форма с валидацией».** Брифинг: «форма логина с email + password». Ожидание: Builder включил `error` в перечень, спросил, и при подтверждении нарисовал error-вариант (минимум один: failed validation / network error / unauthorized).
3. **Сценарий «статичный onboarding без загрузки».** Брифинг: «3 экрана онбординга без асинхрона». Ожидание: Builder всё равно проговорил Шаг 6 I и чек-лист Шага 7, но дизайнер ответил «только default» → `_session.states_covered = ["default"]` — это **OK**, не баг.
4. **Текст-скелет — оба gate'а пройдены.** На каждом из трёх сценариев проверить, что Builder перед первым `use_figma`:
   - вывел итоговую раскладку (Шаг 6 I) и получил явный апрув → `_session.i_approval_received = true`;
   - вывел чек-лист построения из 4 пунктов (Иерархия / Auto-layout / Содержимое экранов по слотам скелета / Edge cases) и получил явный апрув → `_session.checklist_approved = true`.
   Любая сессия, в которой `stages.figma_build = true` при отсутствии хотя бы одного из этих апрувов, — пропущенный gate.

**Два слоя детекции:**

1. **Self-check в builder'е (Шаг 7, перед `stages.figma_build = true`).** Builder проверяет оба флага `i_approval_received` и `checklist_approved`; если хотя бы один не `true` — создаёт `auto:bug:gate-skipped` issue по стандартному watchpoint-алгоритму. `/fbAnalyzer` поднимает до P0/P1 (по политике для `auto:bug:*`) и пингует Telegram. Ловит честно-забывчивые сессии: модель прошла этапы, но забыла gate.

2. **Апостериорный детектор в агрегаторе.** `tools/aggregate-sessions.py` в секции «Пропущенные gate'ы перед Figma (A-056)» в `docs/LEADERBOARD.md` показывает счётчики `i_approval_received != true` и `checklist_approved != true` среди сессий с `figma_build = true`. Ловит сессии, где builder пропустил и сам self-check тоже (счётчик растёт без соответствующих watchpoint-issues → сигнал что self-check ненадёжен, нужно усиливать формулировки).

**Где смотреть baseline:**
- Issue #104 (закрытая, со ссылкой на этот PR) — оригинальный contract.
- `.claude/commands/builder.md` Шаг 6 H/I + Шаг 7 «Чек-лист построения».
- `docs/SESSION_TELEMETRY.md` — поля `states_covered`, `i_approval_received`, `checklist_approved`.
- `tools/aggregate-sessions.py` → `compute_leaderboard` → секция «Пропущенные gate'ы перед Figma (A-056)».

**Замечено:** добавлено заранее вместе с #104, до того как баг реально воспроизвёлся в `/test`. Telemetry-поля `i_approval_received`/`checklist_approved` добавлены отдельным PR; до их раскатки на все сессии секция в LEADERBOARD появляется только для новых записей.

### [ ] A-044 · Builder выкатил bare button absolute вместо meshok ↓ wrapper

Probe 2026-05-11 (test 17, onboarding 5 экранов): на каждом из 5 фреймов Builder поставил `button 1.1` напрямую с `x=16, y=parent.height-btn.height-24`, **не используя `meshok ↓` компонент**. Результат: `skeletonViolations=5` (по одной на экран).

Скелет требует: bottom-фиксированный блок = `meshok ↓` instance в layoutPositioning=ABSOLUTE, внутри него — buttonsView с реальной buttonsViewBottom-связкой.

**Где:** этот session, manual builder run. Подобное произойдёт каждый раз, пока `meshok ↓` рассматривается как «опциональное украшение».

**Как лечить:** в `.claude/commands/builder.md` фаза 7 — обязательная проверка «есть ли CTA-кнопка на экране? → должен быть meshok ↓». В `rules/skeleton.md` усилить формулировку «meshok ↓ ОБЯЗАТЕЛЕН для любого экрана с CTA-кнопкой».

**Замечено:** /test 2026-05-11 (visual 5/5 экранов)

### [ ] A-045 · placeNavbar/findOne(TEXT) не подставляет navbar middle title

Probe 2026-05-11: Builder вызвал `nb.findOne(n => n.type === 'TEXT')` и пытался присвоить `characters = title`. На всех 5 экранах title (например «Уведомления», «Интересы») **не отобразился** — навбар средняя зона всегда показывала дефолтный плейсхолдер (синюю штриховую полоску — это default middle slot).

Причина: navbar 1.0 в Эталоне использует **отдельный wrapper-компонент в middle slot** (например «navbar middle ◇ ...» с своим text-пропом), а не прямой TEXT-нод внутри navbar. Findone находит первый попавшийся TEXT (например, в скрытом left/right slot), не таргетит title.

**Как лечить:** Helper `setNavbarTitle(nb, title)` из `rules/components/navbar.md` уже описан, но Builder его не использовал — нужно вынести как обязательный путь установки title (без него — A-NNN flag).

**Замечено:** /test 2026-05-11

### [ ] A-041 · /syncKeys-инвариант нарушен: registry хранит COMPONENT_SET-ключи для radio/checkbox/switch/uniCard sizes

Probe 2026-05-09 (test 16, такси-флоу 15 экранов):

```
radio 1.0    8fbbb1ac... → asComponent: ERR not found / asSet: OK
checkbox 1.0 61c1fa11... → asComponent: ERR not found / asSet: OK
switch 1.0   473ffceb... → asComponent: ERR not found / asSet: OK
220 uniCard  0370cc32... → asComponent: ERR not found / asSet: OK
```

Это противоречит явной гарантии в `src/agents/figma-implementer/FIGMA_IMPLEMENTER_AGENT.md`:
> «Любой компонент → `figma.importComponentByKeyAsync(key)`. Для `s` `key` уже хранит ключ первого варианта (`/syncKeys` это гарантирует), поэтому импорт работает одинаково.»

Реально работает только `importComponentSetByKeyAsync(key).defaultVariant.id`. Builder ловит `not found` и должен был бы упасть, но в test 16 спасся через ручной workaround (использовал importComponentSetBy).

**Где:** `.claude/commands/syncKeys.md`, `registry/index.json`, `registry/libraries/*/components.json` (для всех `type='s'` записей).
**Как лечить:** /syncKeys должен после ресинка прогнать **probe-чек**: для каждого `type='s'` ключа попробовать `importComponentByKeyAsync` — если упало, сохранить `defaultVariant.key` вместо текущего. Либо: правило в реестре «для `type='s'` хранить SET key» + поправить FIGMA_IMPLEMENTER_AGENT.md (использовать importComponentSet).
**Замечено:** /test 2026-05-09T21:15

### [ ] A-042 · meshok ↓ — `✏️ buttonsView` не свапнут на CTA-пресет, handle-плейсхолдер виден

В test 16 на всех 15 экранах нижний meshok ↓ показывает оранжевую полоску (handle-плейсхолдер) вместо CTA-кнопок.

Builder не свапнул `✏️ buttonsView#1073:1` ни на одном экране — нет ни правила, ни helper'а. Программный детектор `meshokDownButtonsHidden` удалён в PR #25 (ловил только кейс «swap есть, toggle нет»), поэтому баг больше не отражается в метриках — виден только через скриншот-ревью.

**Где:** `src/agents/figma-implementer/FIGMA_IMPLEMENTER_AGENT.md` (нет helper'а для CTA-блока), `tests/scripts/full-accuracy.figma.js` (нет детектора на «оба false»).
**Как лечить:** добавить helper `setMeshokDownCTA(meshokDown, [labels])` который импортирует `buttonsViewBottom` пресет с N кнопками, свапает + setProperties + ставит boolean toggle. В full-accuracy добавить `screensWithoutCTA` в состав `placeholderSignal` — считать meshok ↓ без видимого CTA-блока.
**Замечено:** /test 2026-05-09T21:15

### [ ] A-043 · navbar middle title — на скрине пустой, хотя `placeholderHits` не рос

В test 16 на 14 из 15 экранов navbar middle через `setNavbarTitle(meshokUp, '...')` отработал без ошибки, но визуально на скрине заголовок не виден — синяя полоска без текста. `defaultTitleHits` (старый детектор, упомянут в test 16 как `=0`) был удалён/слит в `placeholderHits` в PR #25 — но `placeholderHits=8` в test 16 тоже не отражает empty-title кейс, потому что детектор проверяет дефолтный placeholder-строки, а не `characters === ''`.

Гипотеза: `t.characters = title` не сработал silent (font не загружен или nodeName не тот). Либо `setNavbarTitle` нашёл правильную ноду, но шрифт `Roboto Flex SemiBold` остался нелоадед в момент записи (хоть `loadFontAsync` был вызван в начале вызова).

**Где:** `src/agents/figma-implementer/FIGMA_IMPLEMENTER_AGENT.md` `setNavbarTitle` helper, `tests/scripts/full-accuracy.figma.js` (нет детектора `characters === ''`).
**Как лечить:** в `setNavbarTitle` после записи — `assert(t.characters === title)` и кинуть error. В full-accuracy добавить `emptyTitleHits` (TEXT-ноды с `characters === ''` внутри navbar middle) — либо объединить с `placeholderHits` как ещё один кейс.
**Замечено:** /test 2026-05-09T21:15

### [ ] A-040 · `navbar.middle` после swap content-варианта — `.characters` на TEXT не применяется (silent)

В test 15 (полигон meshok) сценарий 3 — собрана правильная цепочка:
1. swap `meshok ↑ → navbar` ✅
2. swap `navbar → ✎ · middle ·#1031:6` на content-set `60d00e30...` ✅
3. `middle.findOne(TEXT).characters = 'Заголовок экрана'` ← visually НЕ применилось (на скрине «Text»).

Свап и findOne сработали (errorsCount=0, TEXT-нод найден), но `.characters` присвоение не отрисовало новый текст. Аналогичная проблема воспроизведена в test 13 и test 14 — на всех 12 экранах navbar показывал «Text» вместо реальных заголовков.

**Гипотезы:**
- a) TEXT-нод внутри swapped instance защищён от прямой мутации; нужен setProperties по componentProperty внутреннего варианта (`text#9760:6` или похожий).
- b) Шрифт TEXT-нода не загружен (loadFontAsync не покрывает специфический шрифт content-варианта).
- c) Ошибка тихо проглотилась `try/catch`-ом в helper'е.

**TODO Настя:** определить точный путь к title-проп внутри content-варианта `60d00e30...` (no subtitle · content). Если это TEXT-проп типа `text#NNNN:N` на самом variant — нужно использовать setProperties, не findOne.

**Где:** `rules/components/navbar.md` (нет правила) + `src/agents/figma-implementer/FIGMA_IMPLEMENTER_AGENT.md` helper `setNavbarTitle`.
**Замечено:** /test 15 polygon, 2026-05-09T15:30

### [x] A-038 · `selectionCell` ['middle','title'] setDeep не отображает текст — весь контент остаётся стрипованным плейсхолдером — ЗАКРЫТ 2026-05-09

**Резолюция:** инспекция `componentPropertyDefinitions` показала: у `selectionCell 1.1` middle — это INSTANCE_SWAP `· middle ·#5934:11` с дефолтом `aa40b8b9...placeholder`. Без свапа на одну из 6 preferred values (3 single + 3 SETs контент-вариантов) middle остаётся плейсхолдером. **Фикс в** `FIGMA_IMPLEMENTER_AGENT.md` (новая таблица real prop names + helper). **Детектор в** `full-accuracy.figma.js`: `unswappedSlots` поймал 214 таких placeholder-инстансов на test 13.

В test 13 на 9 из 12 экранов selectionCell-инстансы внутри `cellList` показывают радио-круг слева ✅, но всю правую часть — заштрихованный оранжевый прямоугольник (плейсхолдер). `setDeep(inst, ['middle','title'], {'text#9760:6': 'Эконом'})` возвращался без ошибки (errorsCount=0), но текст не появился.

Возможные причины: (a) `middle` slot нужно сначала свапнуть на title-variant через `setProperties({'middle#XXXX:X': '<variant>'})` — как у navbar.middle (R-021); (b) prop name `text#9760:6` корректен только для определённых вариантов middle.

**Эффект:** все списки опций (классы рейса, способы оплаты, доп.услуги, маршрут) выглядят как пустые стрипованные блоки. **Замечено визуально.**

**Где:** `src/agents/figma-implementer/FIGMA_IMPLEMENTER_AGENT.md` — нет правильного паттерна для selectionCell.middle. **Как лечить:** документировать обязательный middle-swap для selectionCell + правильный путь к title prop.
**Замечено:** /test 2026-05-09T13:50

### [x] A-037 · `meshok ↓ buttonsView` swap молча не сработал — все CTA-кнопки невидимы — ЗАКРЫТ 2026-05-09

**Root cause:** `meshok ↓` имеет **два** связанных пропа на buttonsView: `✏️ buttonsView#1073:1` (INSTANCE_SWAP) **и** `buttonsView#1074:0` (BOOLEAN, default=**false**). Без включения boolean-toggle visibility слот невидим — даже если swap прошёл. Проверено инспекцией `componentPropertyDefinitions`.

**Фикс в** `FIGMA_IMPLEMENTER_AGENT.md` (helper `makeMeshokDown` теперь обязательно ставит `'buttonsView#1074:0': true` параллельно swap'у). Также добавлены пути для `buttonsView → first INSTANCE child → row N → button 1`. **Детектор в** `full-accuracy.figma.js`: `meshokDownButtonsHidden` ловит mismatch swap+toggle. На test 13 = 10 (10 из 11 экранов), теперь видим в метриках.

**Validation:** probe в Figma — кнопка «Найти рейсы» отрендерилась после toggle.

В test 13 все 11 экранов с `buttons:[...]` показывают meshok ↓ как стрипованный оранжевый прямоугольник вместо реальных кнопок. Implementer-код делал `setProperties({'✏️ buttonsView#1073:1': C.buttonsView.id})` — возврат без ошибки (errorsCount=0), но визуально кнопки не появились. Silent failure — error-pipeline это не ловит.

Возможные причины: (a) prop name `'✏️ buttonsView#1073:1'` неверный — нужно проверить через `componentPropertyDefinitions`; (b) перед swap нужно включить boolean toggle, который показывает buttonsView slot; (c) прежде чем свап стал виден, нужно дать buttonsView его собственный `size`-variant.

**Эффект:** на каждом экране кнопки «Найти рейсы», «Продолжить», «Оплатить», «Подтвердить место», «Скачать билет» и т.п. — невидимы для пользователя. Это блокер для реальных макетов. **Замечено визуально.**

**Где:** `src/agents/figma-implementer/FIGMA_IMPLEMENTER_AGENT.md`, `tests/scripts/full-accuracy.figma.js` (программно не ловится). **Как лечить:** в Implementer добавить пост-проверку: после `setProperties` сделать `findOne(buttonsView внутри meshok ↓)` и проверить, что инстанс действительно своп. В rules — добавить точный prop name из реальных definitions + boolean toggle если нужен.
**Замечено:** /test 2026-05-09T13:50

### [x] A-036 · `uniCard ❖ view` без выбора `size` variant — карточки рендерятся как стрипованные плейсхолдеры — ЗАКРЫТ 2026-05-09

**Резолюция:** `uniCard 1.0 ❖ view` имеет prop `size#6313:33` (INSTANCE_SWAP). Default value `128:1460` — это `cardPlaceholder`. Preferred values: 1 single component (тоже `cardPlaceholder` — НЕ использовать!) + 4 SETs реальных размеров (`160 ◇ uniCard 1.0` и т.п.). Свап на `setProperties({'size#6313:33': sizeSet.defaultVariant.id})` дал реальный контент.

**Фикс в** `FIGMA_IMPLEMENTER_AGENT.md` (таблица + предупреждение «не выбирай 6031865f... — это тоже placeholder»). **Детектор:** `unswappedSlots` поймал 214 случаев на test 13.

В test 13 на 9 экранах все uniCard выглядят как заштрихованные оранжевые прямоугольники без контента. Builder создаёт инстанс через `createInstance()`, ищет `size`-инстанс внутри и пытается через `texts[0/1/2].characters = ...` поменять текст — но сначала нужен `setProperties({'size#XXXX': '<variant>'})` на самом uniCard, чтобы выбрать **какой именно** size-вариант показывается. Без этого внутри pre-default стрипованный размер без контентных text-нод.

Дублирует A-030 (wrapper-pattern), но конкретно для uniCard в коде Implementer — не закрыто. **Замечено визуально.**

**Где:** `src/agents/figma-implementer/FIGMA_IMPLEMENTER_AGENT.md` — нет шаблона `addUniCard(parent, {variant: '17b-15-13', title, subtitle, caption})`. **Как лечить:** обязательный первый шаг помощника uniCard — `setProperties({'size#NNNN:N': variantName})` ещё до того, как искать text-ноды.
**Замечено:** /test 2026-05-09T13:50

### [x] A-035 · `inputText` placeholder/hint остаются дефолтными — `setText` устанавливает только label — ЗАКРЫТ 2026-05-09

**Резолюция:** у `inputText 1.0` есть точные TEXT-пропы (валидировано инспекцией):
- label: `✏️ label#2014:84` (TEXT, default `label`) + visibility `label#2014:8` (BOOLEAN)
- hint: `✏️ hint#2014:106` (TEXT, default `hint`) + visibility `hint#2014:27`
- placeholder: BOOLEAN `placeholder#5913:21` (видимость), текст внутри nested instance — для замены нужно включать `mask#5913:3` и менять nested mask

**Фикс в** `FIGMA_IMPLEMENTER_AGENT.md` — таблица real prop names + helper `addInput(parent, label, hint)`. **Validation:** probe в Figma показал «Откуда / Москва SVO», «Куда / Париж CDG» правильно отрендерились.

В test 13 на экранах 1, 5, 7 inputText-инстансы показывают: label сверху ✅ установлен, но внутри поля плейсхолдер «placeholder» и подсказка «hint» — дефолтные. Implementer вызывает `setText(inputText, null, hint)`, который через `findOne(TEXT)` хватает label (первый text-нод сверху), а placeholder/hint остаются нетронутыми.

Нужен пакет: установка label, placeholder, hint — три разных пропа/path. **Замечено визуально.**

**Где:** `src/agents/figma-implementer/FIGMA_IMPLEMENTER_AGENT.md` — нет таблицы пропов inputText. **Как лечить:** документировать конкретные пропы для каждого слота (label, placeholder, hint, mask), либо помощник `addInput(parent, {label, placeholder, hint, mask})`.
**Замечено:** /test 2026-05-09T13:50

### [x] A-034 · Implementer не свапает `navbar.middle` на title-вариант перед установкой текста — ЗАКРЫТ 2026-05-09

**Резолюция:** у `navbar 1.0` middle — это INSTANCE_SWAP `✎ · middle ·#1031:6` с дефолтом-плейсхолдером. Preferred values включают content-set `60d00e30...` («no subtitle · content») с дефолтным variant'ом `style=primary` (id `84:1543`). Свап на этот id даёт реальный TEXT-нод, который меняется через `t.characters = '...'`.

**Фикс в** `FIGMA_IMPLEMENTER_AGENT.md` — async helper `setNavbarTitle(meshokUp, title)`. **Validation:** probe показал navbar с реальным контентом (без стрипованной полоски). **Детектор:** `unswappedSlots` ловит navbar без свапа middle.

В test 13 на всех 12 экранах navbar middle-slot отображается как декоративная синяя стрипованная полоска вместо текста заголовка. Builder вызывает `setDeep(meshokUp, ['navbar','middle','title'], {...})`, но default middle — не title-вариант, а другая декоративка. Без явного свапа `setProperties({'middle#XXXX:X': 'title'})` — путь к 'title'-инстансу внутри middle вообще не существует.

R-021 был закрыт ранее (правильный фикс в test 9 — свапать middle на content17). Но фикс не отражён в `FIGMA_IMPLEMENTER_AGENT.md` как обязательный шаг + не выявляется автоматически. **Замечено визуально.**

**Где:** `src/agents/figma-implementer/FIGMA_IMPLEMENTER_AGENT.md` (нет шаблона navbar) + `rules/components/navbar.md` (если есть). **Как лечить:** добавить шаблон `setNavbarTitle(meshokUp, title)` который:
1. Свапает navbar slot;
2. Свапает middle на title-variant (требует определения prop name);
3. setDeep на title.text.
Включить в Implementer как обязательный путь.
**Замечено:** /test 2026-05-09T13:50

### [ ] A-033 · Builder ставит хардкод paddingLeft/Right=16 в content-фреймах вместо bound vars

В test 10 content-фрейм между `meshok ↑` и `meshok ↓` создаётся с хардкодными `paddingLeft=16, paddingRight=16, itemSpacing=16` — без привязки к переменным `numbers-paddings`. tokenCoverage.paddings упал до 0.286 (4/14 bound).

**Эффект на test 10:** 10 хардкодных px вместо bound vars в 2 экранах.

**Где:** Figma Implementer code generation (`src/agents/figma-implementer/FIGMA_IMPLEMENTER_AGENT.md`), правила `rules/skeleton.md` (нет переменной для content-фрейма)
**Как лечить:** добавить шаблон content-фрейма в skeleton.md с явными bound vars (например, `const/page/horizontal/default`, `const/page/vertical/default`, `const/cell-view/→gap←/default`). Implementer должен использовать `setBoundVariable('paddingLeft', vPageH)` вместо `paddingLeft = 16`.
**Замечено:** /test 2026-05-09T10:50

### [ ] A-032 · `tests/scripts/full-accuracy.figma.js` падал на нодах без `.children`

При обходе дерева фрейма скрипт делал `node.children.forEach(...)` без guard'а — падал на `RECTANGLE` ноде с `TypeError: no such property 'children'`. Исправлено в этом же прогоне (`'children' in node && Array.isArray(node.children)`).

**Где:** `tests/scripts/full-accuracy.figma.js:62`
**Как лечить:** уже починено. Регресс предотвращать через тесты.
**Замечено:** /test 2026-05-09T10:50

### [ ] A-031 · Implementer не вызывает `loadFontAsync` перед `node.characters = ...`

При первой попытке test 10 — 4 ошибки `Cannot write to node with unloaded font "Inter Regular" / "Roboto Flex Regular"`. Build не падает (благодаря новому try/catch), но текст не выставляется.

**Где:** `src/agents/figma-implementer/FIGMA_IMPLEMENTER_AGENT.md` — нет раздела про обязательный `await figma.loadFontAsync({ family, style })` перед мутацией TEXT-нод.
**Как лечить:** в начало каждого билд-скрипта добавлять `await figma.loadFontAsync({ family: 'Inter', style: 'Regular' })` (и Semi Bold + Roboto Flex). Идеально — вынести в helper `setText(node, text)`, который сам читает `node.fontName` и грузит.
**Замечено:** /test 2026-05-09T10:50

### [ ] A-030 · Wrapper-компоненты нуждаются в обязательном свапе в правилах

`chipsView`, `uniCard`, `uniCell`, `tagsView ❖ view`, `buttonsCircleView` и аналогичные — это «обёрточные» компоненты с пропом `quantity#...` или `size#...` (INSTANCE_SWAP). По умолчанию подставляется placeholder с дефолтным контентом («label»/штриховка). Builder, вставляя такой компонент во фрейм, не делает обязательный свап → результат: пустые карточки.

**Эффект на test 8:** 33 placeholderHits на 8 экранов — большая часть из непосвапленных wrapper-инстансов (chipsView, uniCard, uniCell, selectionCell).

**Где:** правила всех wrapper-компонентов
**Как лечить:** в каждом таком правиле добавить раздел «При создании ОБЯЗАТЕЛЬНО свапни slot на конкретный preferredValue» с дефолтом по контексту (например, для `uniCard` — `320 ◇ uniCard` если ширина >= 280, иначе `220` или `160`). Для `chipsView` — выбор `quantity`-пресета по числу нужных чипсов.
**Замечено:** test 8 (medium e-commerce) 2026-05-09

---

### [x] A-029 · `tokenCoverage` метрика инфлирует через nested instance internals

В первой версии шага 7.6 счётчики paddings/fills/texts проходили по всем нодам, включая внутренности импортированных компонентов. Это давало занижение coverage 0.5–0.6 даже когда сам Builder делал всё правильно.

**Где:** `.claude/commands/test.md` шаг 7.6 (программная проверка точности)
**Как лечить:** добавить фильтр `isInsideInstance(node)` — пропускать ноды, у которых среди предков есть INSTANCE. Считать только то, что Builder создал сам.
**Закрыто:** 2026-05-08 — фильтр добавлен, проверено на test 7: paddings 1.0, texts 1.0, fills 0/2 (правильно показал 2 дефолтных fill, поставленных Builder'ом).

---

### [x] A-027 · Паттерн A-025 не работает на 2+ уровня глубины nested

A-025 (`findOne(name='slot')` → `setProperties`) работает только для **прямого** ребёнка. У `meshok ↑ → navbar` (1 уровень) — работает. У `navbar.middle → contentsView → text` (2 уровня) — нужно дважды `findOne`. У `buttonCell.middle → contentsView → text` (2 уровня) — то же.

В прогоне test 7:
- navbar в обеих экранах остался пустым (заголовок не установлен)
- buttonsCircleView × 3 → все 3 кнопки с default label «Действие»
- buttonCell × 5 → все с default «Что сделать»

**Где:** `src/agents/figma-implementer/FIGMA_IMPLEMENTER_AGENT.md`, `src/agents/prop-collector/PROP_COLLECTOR_AGENT.md`
**Как лечить:** добавить рекурсивный паттерн доступа — обход цепочки nested-инстансов. Пример:
```js
function setDeepProp(rootInst, path, props) {
  // path = ['middle', 'title'] — обход вложенных слотов
  var cur = rootInst;
  for (var i = 0; i < path.length; i++) {
    cur = cur.findOne(function(n){return n.type==='INSTANCE' && n.name===path[i];});
    if (!cur) return false;
  }
  cur.setProperties(props);
  return true;
}
```
Документировать в правилах для каждого «вложенного» компонента (navbar, buttonCell, buttonsCircleView), какой путь идти.
**Замечено:** Builder run #7 2026-05-08 (test 7, чат + профиль)
**Закрыто:** 2026-05-08 — добавлен паттерн `setDeep(rootInst, path, props)` в `FIGMA_IMPLEMENTER_AGENT.md` с таблицей известных путей для navbar/buttonCell/buttonsCircleView/uniCard/uniBox/bottomSheet.

---

### [x] A-028 · inputText в content-зоне утонул под клавиатурой

В тест-прогоне 7 (экран чата) поле ввода `inputText` стояло в content-зоне фрейма (под messages), а `meshok ↓` с alphabetic-клавиатурой стоит абсолютно. Клавиатура высокая (~280px), поле ввода у нижнего края — оказалось перекрыто.

**Где:** паттерн позиционирования inputBar в чат-экранах
**Как лечить:** для сценариев «поле ввода + клавиатура» — поле ввода тоже выставляется абсолютно над `meshok ↓` (не как обычный child auto-layout). Документировать как edge-case в `meshok.md` или новом `chatPattern.md`.
**Замечено:** Builder run #7 2026-05-08
**Закрыто:** 2026-05-08 — паттерн sticky-bottom описан в `FIGMA_IMPLEMENTER_AGENT.md` (раздел A-028).

---

### [x] A-026 · INSTANCE_SWAP в `setProperties` принимает `.id`, не ComponentNode

В `FIGMA_IMPLEMENTER_AGENT.md` и `PROP_COLLECTOR_AGENT.md` инструкция говорила «передавай сам ComponentNode для INSTANCE_SWAP-свапа». На практике это падает с `Expected boolean/string/number/VARIABLE_ALIAS, received object`.

**Правильно:** передавать `.id` импортированного компонента (строку):
```js
meshokUpInst.setProperties({ 'navbar#1491:0': navbar.id });
```

**Где:** `src/agents/figma-implementer/FIGMA_IMPLEMENTER_AGENT.md`, `src/agents/prop-collector/PROP_COLLECTOR_AGENT.md`
**Замечено:** Prop Collector test runs (test 5 + test 6) 2026-05-08
**Закрыто:** 2026-05-08 — обновлены инструкции в обоих агентах + раздел «Знания» Prop Collector с явным правилом.

---

### [x] A-018 · `/test --full` требует апрувов дизайнера — ЗАКРЫТ 2026-05-08

`.claude/commands/test.md` шаг 3a переписан: автономный режим с дефолтами Research/CJM, без `AskUserQuestion`, со сборкой Figma в `twL50t4GFELOKpEwFWSvwW` на странице `test N`.

**Замечено:** /test 2026-05-08T18:24Z

---

### [x] A-025 · Дочерние пропы свапаемых инстансов недоступны через `setProperties` родителя

При свапе `meshok ↑.navbar = navbar 1.0` или `meshok ↓.✏️ buttonsView = buttonsView 1.0 ❖ view` сама замена компонента работает (A-024 fix). Но **внутренние пропы свапаемого инстанса** недоступны:
- В `navbar 1.0` есть `✎ title` (заголовок), `← left` (шеврон/кнопка) — после свапа через `meshokUp.setProperties({...})` они остаются с дефолтами.
- В `buttonsView 1.0 ❖ view` есть слоты `← button1`, `→ button2` с собственными лейблами `Связаться` / `Оставить отзыв` — после свапа в meshok ↓ кнопок не видно: лейблы пустые или buttonsView показывается без button-инстансов.

Скриншот test 4 показал: navbar = пустая оранжевая полоска (без заголовка), buttonsView = вообще не отрисовался видимо.

**Где:** `src/agents/figma-implementer/FIGMA_IMPLEMENTER_AGENT.md` — нет паттерна, как достучаться до дочерних пропов после свапа.
**Как лечить:** найти и задокументировать паттерн. Варианты:
1. После свапа найти вложенный инстанс через `instance.children` или `findOne`, и на нём вызвать `setProperties`.
2. В Figma Plugin API есть `instance.componentProperties` — возможно overrides пробрасываются через расширенный объект.
3. Возможно нужно `instance.setProperties({ '✎ title (вложенного навбара)': 'value' })` с полным путём — нужно проверить.

Без этого Implementer не может задавать тексты в navbar/buttonsView/любом свапе → макет получается без лейблов.
**Замечено:** /test --full 2026-05-08 (test 4, визуальный ревью через get_screenshot)
**Закрыто:** 2026-05-08 — паттерн найден через Prop Collector на inputText.mask. После `createInstance` родителя — `findOne(n => n.type === 'INSTANCE' && n.name === '<slot>')` → `setProperties` на найденном вложенном. Задокументировано в `FIGMA_IMPLEMENTER_AGENT.md` (раздел «Доступ к пропам вложенных инстансов») и в `PROP_COLLECTOR_AGENT.md` (шаг 3.5).

---

### [ ] A-024 · INSTANCE_SWAP в `setProperties` принимает ComponentNode, а не инстанс

В plugin-коде Implementer (и в моих /test-прогонах) встречается паттерн:
```js
var nav = navbarComp.createInstance();
meshokUpInst.setProperties({ 'navbar#1491:0': nav });
```
Это **неправильно**. Для INSTANCE_SWAP `setProperties` ожидает сам `ComponentNode` (то, что вернул `importComponentByKeyAsync`), а не созданный через `createInstance()` инстанс. Побочный эффект: каждый `createInstance()` создаёт инстанс **на текущей странице**. Эти «лишние» навбары/buttonsView оседают на странице вне фреймов и засоряют макет.

Правильно:
```js
meshokUpInst.setProperties({ 'navbar#1491:0': navbarComp });
meshokDownInst.setProperties({
  '✏️ systemComponent#1073:2': handleComp,
  '✏️ buttonsView#1073:1': buttonsViewComp
});
```

**Где:** `src/agents/figma-implementer/FIGMA_IMPLEMENTER_AGENT.md`, `src/agents/figma-implementer/skeleton.example.js`
**Как лечить:** добавить явное правило: «для INSTANCE_SWAP передавай **импортированный компонент** (ComponentNode), а не результат `createInstance()`. Никогда не вызывай `createInstance()` для сваппинга». Обновить skeleton.example.js — в нём свапов нет, но подразумевается inst pattern.
**Замечено:** /test --full 2026-05-08 — на test 1, test 2, test 3 на каждой странице оказались «лишние» инстансы navbar'а и buttonsView вне фреймов.

---

### [ ] A-023 · Implementer игнорирует абсолютную позицию `meshok ↓`

В `rules/components/meshok.md` (секция meshok ↓ → onScroll) и в `JSON_LAYOUT_AGENT.md` явно сказано: `meshok ↓` ставится на абсолютную позицию, `constraints vertical: MAX` (прибит к низу фрейма). Это нужно чтобы:
1. Контент скроллился под `meshok ↓`, а не выше него.
2. `meshok ↓` всегда виден независимо от длины контента.

Implementer (мой plugin-код в `/test --full`) везде делает просто `frame.appendChild(meshokDownInst)` в VERTICAL auto-layout. Это значит:
- `meshok ↓` стоит после контента в потоке, а не прибит к низу.
- Если контент короткий — между ним и `meshok ↓` пустое пространство.
- Если контент длинный — `meshok ↓` уезжает за пределы экрана.

**Где:** `src/agents/figma-implementer/FIGMA_IMPLEMENTER_AGENT.md` — нет явной инструкции с plugin-кодом для абсолютной позиции; `src/agents/figma-implementer/skeleton.example.js` — пример строит frame через `appendChild` без абсолютки.
**Как лечить:** добавить в Implementer-агента и skeleton.example.js обязательный паттерн:
```js
frame.appendChild(meshokDownInst);
meshokDownInst.layoutPositioning = 'ABSOLUTE';
meshokDownInst.constraints = { horizontal: 'STRETCH', vertical: 'MAX' };
meshokDownInst.x = 0;
meshokDownInst.y = frame.height - meshokDownInst.height;
// + meshok ↓.setProperties({ 'onScroll#1091:7': true }) если контент уходит под кнопки
```
Также добавить в проверку плана шага 6 `/builder`: «meshok ↓ — абсолютная позиция, прибит к низу».
**Замечено:** /test --full 2026-05-08 — все три прогона строили meshok ↓ как обычного ребёнка auto-layout; ни один тест не словил это, потому что не проверяли итоговый макет в Figma визуально.

---

### [x] A-021 · Нет списка color variable keys в правилах

`FIGMA_IMPLEMENTER_AGENT.md` требует «цвета только из 🎨 Colors Palette» — но нигде в проекте нет списка ключей color variables (как `numbers-paddings/variables.json`). При сборке кастомного блока (например, swipe-зон с цветными overlay'ами) билдер не может сослаться на «brand red» или «neutral grey» и оставляет блок без fill.

**Где:** `rules/tokens.md` — нет таблицы color variable keys; `registry/` — нет аналога `variables.json` для colors.
**Как лечить:** добавить `registry/libraries/colors-palette/variables.json` с ключами по семантическим именам (`bg/primary`, `accent/red`, `text/secondary`...) и страницу-таблицу в `rules/tokens.md`.
**Замечено:** /test --full 2026-05-08 (лента уведомлений, swipe-зоны)
**Закрыто:** 2026-05-08 — собраны 46 семантических Dynamic Colors через MCP, записаны в `registry/libraries/colors-palette/variables.json`, в `rules/tokens.md` добавлена таблица групп токенов и пример plugin-кода.

---

### [ ] A-022 · Бэклог от human-дизайнеров (collaborators) автоматически в проект

Когда дизайнер-человек (collaborator из git) использует `/builder` или общается с агентами, проблемы и пожелания, которые он замечает в процессе сессии, должны автоматически складываться в одно место в проекте — тогда мы их не теряем и можем разбирать. Сейчас механизма нет: дизайнер пишет в чате, всё забывается между сессиями.

**Где:** TBD — возможно `tests/issues/sessions/<userId>.md` или `tests/issues/community.md`
**Как лечить:** придумать формат + триггер: например, в конце каждой `/builder`-сессии агент спрашивает «было что-то странное?» и автоматически дописывает в журнал; или явная команда `/fb`. Учитывать что это нужно только когда раскатим на других — пока в режиме разработки достаточно `/test --full`.
**Замечено:** /test --full 2026-05-08

---

### [x] A-020 · Нет fallback при отсутствии компонента в реестре — ЗАКРЫТ 2026-05-08

В `.claude/commands/builder.md` шаг 6 п.7 и `FIGMA_IMPLEMENTER_AGENT.md` секция «Чего нет в реестре» добавлено правило: **сначала собирай аналог из существующих компонентов ДС, если аналога нет — кастомный фрейм, но обязательно с токенами ДС (цвета/отступы/типографика). Помечай блок `⚠️ кастом — нет компонента в ДС`. Gap → issues.** Никогда не блокировать задачу из-за отсутствия компонента.

**Замечено:** /test --full 2026-05-08 (флоу отзыва, persona=зелёный — попросил звёздный рейтинг)

---

### [ ] A-019 · Устаревший ключ `buttonsView 1.0 ❖ view`

В `src/agents/figma-implementer/skeleton.example.js:33` указан ключ `f0b4db3dccdfe94ca6ab7431b28165daa9d59fa2` — Figma вернул `Component with key "..." not found`. Актуальный из реестра: `c971c74bee013ef77dad8a807357a4c0a52f4e7f`. То же касается `meshok ↓.componentProps['✏️ buttonsView'].allowedComponents` в `registry/libraries/system/components.json:65` — устаревший ключ.

**Где:** `src/agents/figma-implementer/skeleton.example.js:33`, `registry/libraries/system/components.json:65`
**Как лечить:** заменить ключи на актуальные из `registry/index.json`. В долгую — `/syncKeys` должен подтирать `allowedComponents` или они вообще не нужны (свопимые компоненты понятны из `swapSlotId`).
**Замечено:** /test 2026-05-08T18:51Z (Figma error при createInstance)

---

### [x] A-001 · `/syncKeys` safe-mode на пустые либы — ЗАКРЫТ 2026-05-08

**Фикс:** в `syncKeys.md` шаг 4 добавлен счётчик `pagesWithActuals`. Если по итогам всех страниц либы `pagesWithActuals === 0` — REMOVED не вычисляется, выводится предупреждение «проверь конвенцию».

Рекурсивный `findActuals` устранён ранее в шаге split-рефакторинга: `COMPONENT_AGENT.md` использует `page.children.filter(c => c.name === 'Actual' && ...)` (один уровень).

---

### [x] A-002 · `/syncKeys` не проверял identity — ЗАКРЫТ e7f4166

**Фикс:** в split-рефакторинге `syncKeys.md` шаг 1 содержит явный identity-check («ты Настя?»). Если не Настя — отказ с сообщением «Реестр обновляет только Настя».

---

### [ ] A-003 · Шаг 6 `/builder` не описывает, что делать с компонентом без секции правил

`.claude/commands/builder.md:102-108` — жёсткий маппинг на 5 файлов. Если в плане есть `tagsView` или `chip 1.0` — нечего загружать, поведение неопределённое. Билдер либо тихо ставит дефолты, либо галлюцинирует пропы.

**Лечение:** фолбэк: «нет секции — открой `registry/libraries/<lib>/components.json`, читай только пропы конкретного компонента; если их нет → спроси дизайнера».

---

### [ ] A-004 · Implementer не описывает, что делать при ошибке plugin-кода

`FIGMA_IMPLEMENTER_AGENT.md` зашит на «синтаксис: только var и function(){}». Но `setProperties` любит кидать на расхождении ключей пропов или невалидных значениях variant'а. Сейчас дизайнер увидит сырой стектрейс — это противоречит CLAUDE.md «без кодов и стектрейсов».

**Лечение:** добавить раздел «Если упало — что говорить дизайнеру»: 1) ключ устарел → `/syncKeys`; 2) пропы не подходят → проверь правила; 3) общее → «Не получилось импортировать X — детали в логе».

---

### [ ] A-005 · Прерывание `/builder` посередине не описано

Если дизайнер на CJM передумала и сказала «начнём заново» — нет официального flow. Скилл всегда ждёт «апрув CJM» или правки.

**Лечение:** добавить «если дизайнер хочет начать заново → возврат к шагу 3 без потери `whoami`».

---

### [ ] A-006 · Дизайнер не понимает, какой вариант navbar выбран

Дубль R-007 в `docs/COMPONENT_RULES_ISSUES.md` — частично проблема правил, частично — поведения builder'а. Builder выбирает `navbar 1.0` дефолтно, не уточняя «у тебя лента?».

**Лечение:** в шаге 6 builder'а, если в правилах есть несколько вариантов с колонкой «Когда» — спросить дизайнера до плана генерации.

---

### [ ] A-007 · `/builder` не проверяет identity и наличие `config.json`

CLAUDE.md описывает Шаг 0 (перехват первого сообщения) и Шаг 1 (identity check), но `/builder` начинается сразу с `whoami` — minds его. Если первое действие дизайнера — `/builder`, identity-проверка не выполняется. Если `config.json` отсутствует, ошибка вылетит где-то на середине пайплайна (шаг 6 при чтении `dsFiles` или Implementer при импорте).

**Лечение:** в `/builder` шаг 0: проверить identity + наличие `config.json`. Если конфига нет — для Насти создать из примера, не-Насте отказать с дружелюбным сообщением.

---

### [x] A-008 · `pages.include`/`pages.skip` игнорировались — ЗАКРЫТ e7f4166

**Фикс:** `LIBRARY_AGENT.md` шаги 3a/3b передают `pages.include` в переменную `includeList` plugin-кода. Страница включается только при точном совпадении с whitelist (если он непуст).

---

### [x] A-009 · `get_metadata` без `lastModified` — ЗАКРЫТ ac547dd

**Подтверждено:** `lastModified` в MCP недоступен by design. В `syncKeys.md` раздел «Чего здесь нет» явно фиксирует: инкрементальность через `lastModified` невозможна. Замена — `keysHash` в `meta.json` (шаг 6.3), позволяет атомарно решать, переписывать ли `components.json`.

---

### [ ] A-010 · Первый запуск `/syncKeys` с десятками NEW не имеет batch-flow

При первом синке всё = NEW. Если в реестре 100+ компонентов и стандартная heuristic классификации помечает половину как `needs_review`, дизайнер получит 50+ `AskUserQuestion`. Скилл говорит «если расхождений много, сначала покажи сводку», но без чёткого batched-flow («принять все как component / отметить все как needs_review / пройти каждое»).

**Лечение:** при >10 needs_review предложить групповые действия, не поэлементный опрос.

---

### [ ] A-011 · Figma node-link на другую страницу может не открыть узел

В `/syncKeys` мы формируем `https://figma.com/design/<fileKey>/?node-id=<nodeId>` для подсветки удалённых компонентов. Для узла на другой странице этого недостаточно — Figma открывает первую страницу. Нужен ещё `&t=...` или page-id.

**Лечение:** уточнить формат ссылки или ограничиться текстовым описанием «на странице X».

---

### [x] A-012 · 60s timeout на целой либе — ЗАКРЫТ e7f4166 (структурный)

**Фикс:** split-рефакторинг переработал архитектуру: скилл вызывает Component Agent **отдельно на каждую страницу** (один `use_figma` ≈ 3.3s). Таймаут на весь файл невозможен.

**Перф-оптимизация** (батч 5–7 страниц/вызов для ускорения синка) остаётся желательной — см. A-017.

---

### [x] A-013 · `/syncKeys` зависел от `config.json` — ЗАКРЫТ e7f4166

**Фикс:** `syncKeys.md` раздел «Чего здесь нет» явно указывает: `config.json` не используется. Library Agent читает fileKey и enabled прямо из `registry/libraries.json`.

---

### [x] A-014 · MCP 20KB truncate — ЗАКРЫТ ac547dd

**Фикс:** `variantKeys` вынесены в отдельный проход. Основной скан `COMPONENT_AGENT.md` — lean-выдача (`name`, `componentKey`, `assetType`). `totalSize`-watchdog на 15KB обеспечивает `truncated: true` до обрезки, скилл повторяет вызов с `collectVariantKeys: false`.

---

### [x] A-015 · Standalone-клоны вариантов попадали в выдачу — ЗАКРЫТ 2026-05-08

**Фикс:** `COMPONENT_AGENT.md:23` — фильтр изменён с `indexOf('=') !== -1 && indexOf(',') !== -1` на `indexOf('=') !== -1`. Теперь отсекаются и single-prop клоны (`size=16`, `state=enabled`), не только `size=24, content=icon`.

---

### [x] A-016 · `pages.include`/`pages.skip` не учитывались (дубль A-008) — ЗАКРЫТ e7f4166

Дубль A-008. Закрыт тем же фиксом в `LIBRARY_AGENT.md`.

---

### [ ] A-017 · Перф: батчинг 5–7 страниц/вызов в Component Agent

Каждая страница = отдельный `use_figma`. Для `base-components` (23 страницы) = 23 вызова ≈ ~75s total. Не блокер — работает, но медленно.

**Желаемое лечение:** Component Agent принимает массив страниц, plugin обходит несколько страниц в одном `use_figma` за раз (5–7). Сокращает общее время синка в 5× при лимите 60s/вызов.

---

## Закрытые

| ID | Кратко | Фикс |
|---|---|---|
| A-001 | safe-mode на либы без Actual | `syncKeys.md` шаг 4, `pagesWithActuals` счётчик — 2026-05-08 |
| A-002 | identity-check | `syncKeys.md` шаг 1 — `e7f4166` |
| A-008 | `pages.include`/`pages.skip` игнорировались | `LIBRARY_AGENT.md` — `e7f4166` |
| A-009 | `lastModified` недоступен | Зафиксировано: инкрементальность через MCP невозможна; `keysHash` — `ac547dd` |
| A-012 | 60s timeout на целой либе | Per-page архитектура — `e7f4166` |
| A-013 | `config.json` обязателен | `libraries.json` — источник правды, `syncKeys.md` — `e7f4166` |
| A-014 | 20KB truncate | lean-scan + `totalSize` watchdog — `ac547dd` |
| A-015 | standalone-клоны с `=` не фильтровались | `COMPONENT_AGENT.md:23` — 2026-05-08 |
| A-016 | дубль A-008 | закрыт с A-008 — `e7f4166` |

### [ ] A-046 · Builder использует `importComponentSetByKeyAsync` на registry-ключах

Реестр хранит COMPONENT-ключи (для `type:"s"` — ключ дефолтного варианта сета). Builder в test 18 (первый прогон) вызвал `importComponentSetByKeyAsync` на ключах header / uniCell / btnView / inputText / tabbar → все упали с `"Component set with key X not found"`. На 8 из 8 `importComponentSetByKeyAsync`-вызовов.

**Где:** `agents/builder/src/*` (generated logic), `.claude/commands/builder.md`
**Как лечить:** Зафиксировано в `.claude/commands/builder.md` (секция «A-046 — две ловушки импорта/setProperties») + universal helper `importCompOrSet(key)`. Builder должен использовать его всегда.
**Замечено:** /test 2026-05-11 (test 18 first attempt)

### [ ] A-047 · INSTANCE_SWAP setProperties — registry-key вместо `.id`

Builder передал registry-key (string) в `setProperties` для INSTANCE_SWAP пропов (chipsView swap, vibe context). Figma: `"Property value is incompatible with component property type"`. Правильно — `.id` импортированного компонента.

**Где:** `.claude/commands/builder.md`, helper `setNavbarTitle`
**Как лечить:** Зафиксировано в `builder.md` (вместе с A-046). Все helpers (setNavbarTitle, addUniCard, etc) уже используют `.id`. Нужен lint в `tests/scripts/full-accuracy.figma.js`: ловить INSTANCE_SWAP-значения, выглядящие как 40-hex-character ключи вместо node-id'ов.
**Замечено:** /test 2026-05-11

### [ ] A-048 · header 1.1 использует Inter, не Roboto Flex — Builder не загружает Inter

`header 1.1` имеет TEXT-ноды на шрифте Inter Regular. Builder загружает только Roboto Flex — `header.characters = '...'` падает с `"Cannot write to node with unloaded font Inter Regular"`. Все 2 header'а в test 18 не получили заголовков.

**Где:** `rules/components/header.md`, builder font-preload
**Как лечить:** В builder.md в фазу 7 добавить preload пар Inter/Regular, Inter/Bold, Inter/Medium ВДОБАВОК к Roboto Flex. ИЛИ — определять fonts по `findAll(TEXT)` после createInstance и грузить динамически.
**Замечено:** /test 2026-05-11

### [ ] A-049 · buttonsView внутри meshok ↓ — appendChild на INSTANCE падает

Builder сделал `meshokDownInst.appendChild(btnViewInst)` — Figma: `"Cannot move node. New parent is an instance or is inside of an instance"`. Нельзя добавлять детей в импортированный INSTANCE напрямую. Нужно свапнуть слот `✏️ buttonsView#1073:1` через `meshokDownInst.setProperties({ '✏️ buttonsView#1073:1': btnViewComp.id, 'buttonsView#1074:0': true })`.

**Где:** `rules/components/meshok.md`, addMeshokDn helper
**Как лечить:** Переписать addMeshokDn helper: вместо appendChild → setProperties slot. Затем findOne(name='buttonsView') и работать с label через nested instance setProperties.
**Замечено:** /test 2026-05-11

### [ ] A-050 · chipsView inner quantity prop — wrong setProperties target

`chipsView 1.0 ❖ view`.setProperties({'quantity#7405:0': ...}) — Figma: `"Could not find a component property with name quantity#7405:0"`. quantity-проп живёт на **внутреннем** chipsRow-instance (внутри swap-target choicePrimary), не на outer chipsView.

Builder делал `chipsRow.setProperties({...})` — но chipsRow тоже не имеет этого propa напрямую: prop на родителе swap-target. Нужно: после `chips.setProperties({'swap#7472:0': choiceComp.id})` найти внутренний chipsRow-instance И установить quantity на нём или на swap-родителе.

**Где:** `rules/components/chipsView.md` (нет), `_index.json['chipsView 1.0 ❖ view']`
**Как лечить:** Создать `rules/components/chipsView.md` с явным двухступенчатым setProperties-паттерном. innerSlot.builderUsage в `_index.json` уже описывает паттерн, но Builder его не выполняет корректно. Нужен `addChipsView(parent, {type, count})` helper.
**Замечено:** /test 2026-05-11

### [ ] A-051 · setNavbarTitle helper v2 — runtime prop discovery fail на nested navbar

Helper v2 в navbar.md (этот сеанс): `findPropKey(nb, RE_MIDDLE_SWAP)` возвращает null. Причина: nested navbar instance внутри meshok ↑ доступен через findOne, но его `componentProperties` пустой/недоступен для prop-discovery через regex'ы. Либо `findOne(navbar)` находит wrong INSTANCE.

**Где:** `rules/components/navbar.md:185+` (setNavbarTitle v2)
**Как лечить:** Дальше копать — может быть нужен `Object.keys(nb.mainComponent.componentPropertyDefinitions)` вместо `nb.componentProperties`. ИЛИ — навбар внутри meshok ↑ требует переключения через outer meshok.setProperties вместо inner navbar.setProperties.
**Замечено:** /test 2026-05-11 (6-я итерация бага)

### [x] A-053 · Builder regex `/buttonsViewBottom/` не матчит swapped variant  
**Closed:** 2026-05-11 — добавлена Гoтча 3 в `.claude/commands/builder.md` с правильным паттерном через `mainComponent.parent.name` (имя SET, не variant).

После `meshokDown.setProperties({'✏️ buttonsView#1073:1': bvbVariantComp.id})` instance внутри становится со своим `mainComponent.name = "preset=primarySecondary"` (variant-name), а **не** `"buttonsViewBottom 1.0 ❖ view"` (set-name). Поиск через `md.findOne(n => /buttonsViewBottom/.test(n.mainComponent.name))` возвращает null.

**Где:** test 20 builder script (screen 1) → bvbInst1=null → labels не выставлены.
**Как лечить:** Проверять `n.mainComponent.parent && n.mainComponent.parent.name` (имя SET), а не `n.mainComponent.name` (имя варианта). Альтернатива: `n.name === 'buttonsView'` (имя слота), но тогда нужно убедиться, что это не placeholder.
**Замечено:** /test 2026-05-11 test 20

### [x] A-054 · Button-label regex не матчит `button 1.1` в BVB One preset  
**Closed:** 2026-05-11 — добавлена Гoтча 4 в `.claude/commands/builder.md`: regex `/^button(\s+\d+(\.\d+)?)?$/` + выбор TEXT-prop через `defs[k].type === 'TEXT'` (отсекает BOOLEAN-label).

Regex `/^button\s*\d+$/` ловит `button 1`, `button 2` (BVB 2-horiz), но не `button 1.1` (имя инстанса button 1.1 внутри BVB One preset).

**Где:** test 20 builder script (screen 2 BVB One) → btnLabels не выставлены.
**Как лечить:** Расширить regex: `/^button(\s+\d+(\.\d+)?)?$/`. ИЛИ искать через `mainComponent.name` начинается с `style=` (variant из button 1.1 set).
**Замечено:** /test 2026-05-11 test 20

### [x] A-055 · meshok ↓ не ABSOLUTE — забывается в helper  
**Closed:** 2026-05-11 — добавлен полноценный `addMeshokDown(frame, opts)` helper в `rules/components/meshok.md` правило 6, с обязательным ABSOLUTE + constraints + resize + y. Помечен как «единственный путь» для Builder.

Builder helper `addMeshokDown` не выставляет `layoutPositioning='ABSOLUTE'` + `resize(parent.width, h)` + `y=parent.height-h`. На test 20 это +3 к skeletonViolations.

**Где:** test 20 builder script (`addMeshokDown`).
**Как лечить:** Вынести stable helper `addMeshokDownAbsolute(frame, opts)` который применяет ABSOLUTE + constraints + resize + y, см. `rules/components/meshok.md` правило 6.
**Замечено:** /test 2026-05-11 test 20
