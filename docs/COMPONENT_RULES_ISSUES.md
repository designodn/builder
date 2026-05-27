# Проблемы правил компонентов

Журнал проблем, связанных с `rules/components/`, `rules/templates.md`, `rules.md` и стыком правил с реестром. Пополняется после каждого `/test`.

> Источник правды о синтаксисе: `rules.md`, `rules/skeleton.md`, `rules/tokens.md`, `rules/templates.md`, `rules/components/*.rule.json` (Builder читает только их), `rules/components/ARCHITECTURE.md` (формат и slug-правила). Источник правды о ключах: `registry/`.

---

## Открытые проблемы

### [x] R-055..R-061 · Архитектурная миграция на `.rule.json` — ЗАКРЫТЫ 2026-05-15 (Phase 4)

Серия закрыта через миграцию с legacy `.md`-файлов на структурированный `.rule.json` формат + cleanup в Phase 4.

- **R-055** — drift между `_index.json`, `<X>.md` и `inspected-props.json`: три source-of-truth для одного компонента. **Закрыт:** один `.rule.json` per компонент содержит всё, что нужно Builder.
- **R-056** — `_raw` в hot-файле — гигантский расход токенов. **Закрыт:** split на `.rule.json` (hot, читает Builder) + `.raw.json` (cold, debug-only).
- **R-057** — `doc.skeleton` хранится в файле, но генерируется детерминированно. **Закрыт:** убран из `.rule.json`, генерится через `parseProps-utils.js gen-skeleton <slug>` (CLI-only).
- **R-058** — `nestedProps` на booleans без пути навигации к дочернему ноду. **Закрыт:** добавлено поле `nodeNameHint` — Builder использует `parent.findChild(n => n.name === hint)`.
- **R-059** — Инвариант 4 был некорректен (требовал `usage` у одного validated preferred). **Закрыт:** `usage` обязательно только при `validated.length ≥ 2`.
- **R-060** — Плагин делал один большой проход независимо от tier. **Закрыт:** split на Call A (lightweight, для атомов) + Call B (exhaustive, только при наличии slots/booleans).
- **R-061** — `validate --all` после каждого компонента — O(n²) стоимость. **Закрыт:** `validate <slug>` после каждого, `--all` только перед PR.

**Phase 4 cleanup (PR этой серии):**
- Удалены 56 legacy `.md` файлов компонентов в `rules/components/` (оставлены только `ARCHITECTURE.md` и `_TEMPLATE.md`).
- Обновлены `rules.md`, `.claude/commands/builder.md`, `CLAUDE.md` — ссылки на `<X>.md` заменены на `<slug>.rule.json`.
- Добавлена секция «Правила компонента — `.rule.json`» в `CLAUDE.md`.

---

## Открытые проблемы

### [ ] R-062 · `inputtext.rule.json` объявляет `✏️ placeholder#5913:21` в `textProps`, реально это BOOLEAN

Live-introspection через `instance.componentProperties` у инстанса 851:9324 (`inputText 1.0`, `approved=false`) показала:
- `placeholder#5913:21` — type: **BOOLEAN**, value: true (управляет видимостью placeholder-текста, не сам текст)
- `✏️ label#2014:84` — type: TEXT, value: "label" — корректный TEXT-проп
- `✏️ hint#2014:106` — type: TEXT, value: "hint" — корректный TEXT-проп

В `rules/components/inputtext.rule.json` поле `✏️ placeholder#5913:21` объявлено в `textProps` с `sampleTexts: ["Введите значение"]` — это враньё, текст placeholder'а нельзя выставить через `setProperties`. Скорее всего, реальный плейсхолдер — TEXT-нода внутри инстанса с `name === 'placeholder'`, доступ через `.characters` + `loadFontAsync`. Эта же ошибка ритуально каскадирует: см. A-060 — один невалидный prop в составном `setProperties` отвергает весь объект, ломая label/hint вместе.

**Где:** `rules/components/inputtext.rule.json` `textProps['✏️ placeholder#5913:21']`.
**Как лечить:** `/parseProps inputText 1.0 --rehypothesize` — заново прогнать инстроспекцию, перенести `placeholder#5913:21` из `textProps` в `booleans` (с whenOn/whenOff), добавить отдельную запись в `textNodes` (или новое поле schema) для TEXT-ноды `name='placeholder'` с инструкцией доступа через `.characters`. Поднять `approved` после fix'а.
**Замечено:** /test --full 2026-05-24.

### [x] R-054 · `heal-microtest.js` — `getMutabilityTargets` берёт `preferredKeys[0]` без проверки на broken-placeholder — ЗАКРЫТ 2026-05-12

После фикса R-053 запустили `/parseProps meshok ↓` живьём в Figma. Default-variant: 6/8 ассертов прошли, упали `swapMutable` и `visualDiff`. Корень: `getMutabilityTargets` берёт `preferredKeys[0]`, а у `meshok ↓.✏️ buttonsView#1073:1` нулевой preferred — универсальный placeholder `aa40b8b95980f6406a8604dbfebb660aa8ea1bbf` (помечен `broken: true` в `_index.json[X].slots[<slot>].preferredValues[0].broken`). Свап «на placeholder из placeholder» — `value: 2344:4354` до и после, → `swapMutable=false`, PNG bytes тоже идентичны → `visualDiff=false` как cascading effect.

**Эффект:** ложные fail'ы у любого композитного компонента, где `preferredValues[0]` = универсальный placeholder (большинство `composite`/`view` компонентов в проекте — `meshok ↓/↑`, `navbar`, `header`, `buttonsView`, `chipsView`, …). Microtest показывает `summary.passed=0` даже когда сам компонент здоров — Classifier триггерит ненужный patch-loop.

**Фикс (применено):** добавлен `pickValidPreferred(propName, preferredKeys, indexEntry)`:
1. Сперва ищет в `_index.json[X].slots[<prop>].preferredValues` запись с `validated:true && !broken` — это curated данные с usage.
2. Fallback на `preferredKeys[]` из `inspected-props.json`, skip'ая universal-placeholder ключ (hardcoded `aa40b89…`).
3. Если ни одного валидного — `swap = null`, ассерт `swapMutable='skip'`.

Hardcoded set `BROKEN_PLACEHOLDER_KEYS = new Set(['aa40b8b95980f6406a8604dbfebb660aa8ea1bbf'])` вынесен в верх файла.

**TODO:** долгосрочно — складывать список placeholder-ключей в `registry/libraries/<lib>/components-auxiliary.json` (как `_broken: true`) и читать оттуда, чтобы не хардкодить. Сейчас известен ровно один такой ключ — `aa40b89…` (универсальный 12:6 marker).

**Где:** `tests/scripts/heal-microtest.js` (новая функция `pickValidPreferred`, новая константа `BROKEN_PLACEHOLDER_KEYS`)
**Замечено:** живой прогон `/parseProps meshok ↓` 2026-05-12 после R-053 фикса

---

### [x] R-053 · `heal-microtest.js` — SyntaxError на старте: бэктики внутри template literal — ЗАКРЫТ 2026-05-12

**Корневой блокер скилла.** Скрипт `tests/scripts/heal-microtest.js` строит плагин-код через template literal (строка 117: `const code = \`…\`.trim();`). Внутри литерала, в комментариях phase-5a (строки 276–277), стояли **необезопасенные обратные кавычки** в русском комментарии: `` // Figma хранит binding'и `visible: <boolProp>`, ... ``. Эти бэктики JS-парсер трактует как закрытие внешнего template literal, после чего пытается парсить `visible: <boolProp>` как обычный код и падает:

```
SyntaxError: Unexpected identifier 'visible'
    at ...heal-microtest.js:276
```

**Эффект:** `node tests/scripts/heal-microtest.js "<X>"` падает на ANY компоненте, даже до создания плагин-кода. То есть весь шаг 2 `/parseProps` нерабочий с момента появления phase-5a комментариев. Это объясняет, почему ни один из заявленных пилотов (chipsView / navbar / meshok / switch) на самом деле не прогонялся — преалёт работает, microtest нет, классификатор не вызывается, гипотеза не вызывается. Скилл застрял на стадии «есть данные → начинаем microtest» → краш.

**Фикс (применено):** все 4 бэктика в комментариях phase-5a экранированы (`\``). Скрипт компилируется, генерит плагин-код, выдаёт валидный JSON с полем `plugin` готовым к подаче в `use_figma`. Бэктики внутри runtime-комментариев плагина (`//`-строки) безопасны — там нет template literal'а.

**TODO:** добавить в CI самый простой smoke-тест: `node tests/scripts/heal-microtest.js <known-component> | jq .plugin | head` — чтобы любой следующий комментарий с бэктиком в комменте не пролез незаметно. Альтернатива: вынести плагин-код в отдельный файл `heal-microtest.plugin.template.js` и читать его через `fs.readFileSync` — тогда никакого template literal с подстановкой не нужно, а CFG передавать через `__CFG__`-placeholder + replace.

**Где:** `tests/scripts/heal-microtest.js` (4 экранирования бэктиков)
**Замечено:** попытка прогона `/parseProps meshok ↓` после фикса R-042..R-045, 2026-05-12

---

### [x] R-046 · `/parseProps` — спека зовёт `parseProps-*.js`, реальные скрипты `heal-*.js` — ЗАКРЫТ 2026-05-12

**Корневой баг скилла.** В `.claude/commands/parseProps.md` тело спецификации (шаги 2.1, 2.5, 5.1, 5.3, 6, таблица «Файлы, которые heal трогает») ссылается на `parseProps-microtest.js`, `parseProps-cleanup-sandbox.js`, `parseProps-hypothesize.js`, `parseProps-preflight.js`, `tests/parseProps-log.jsonl`, `tests/parsePropsth-baseline.json`. В `tests/scripts/` физически лежат `heal-microtest.js`, `heal-cleanup-sandbox.js`, `heal-hypothesize.js`, `heal-preflight.js`. Префикс `heal-` сохранён осознанно (см. преамбулу `parseProps.md` строка 3), но тело спеки не было обновлено при переименовании `/heal` → `/parseProps`.

**Эффект:** буквальное выполнение шагов скилла падает с `MODULE_NOT_FOUND` на первой же команде. Дизайнер/агент думает «не работает» и переходит к ручному заполнению `_index.json` (как и случилось с `meshok ↓`). Это **аффектит ВСЕ компоненты** — `/parseProps` нельзя прогнать ни на одном.

**Фикс (применено):** все 6 ссылок в `.claude/commands/parseProps.md` приведены к префиксу `heal-`. Спека теперь executable.

**TODO:** решить долгосрочно — либо переименовать скрипты `heal-*.js` → `parseProps-*.js` (единый префикс), либо явно зафиксировать в `CLAUDE.md`, что префикс `heal-` — name-of-implementation, а `/parseProps` — name-of-command, и они навсегда разные.

**Где:** `.claude/commands/parseProps.md` (6 строк)
**Замечено:** review `/parseProps` 2026-05-12

---

### [x] R-047 · `/parseProps` Phase 5a — bindings graph пишет только в `booleans.<prop>.ownedSwap`, не в `pairedProps` — ЗАКРЫТ 2026-05-12

**Системный.** `heal-apply-autopairs.js` (Phase 5a / bindings graph) при обнаружении пары `boolean → swap` пишет ссылку в `booleans.<prop>.ownedSwap`, но **не** добавляет (или не перезаписывает) запись в верхнеуровневый `pairedProps[]`. В результате на любом компоненте, прогнанном через скилл с уже существующим `pairedProps` (например, от ручной/прошлой версии), получается **два рассинхронизированных source-of-truth**: stale `pairedProps` + свежие `ownedSwap`. См. R-042 (meshok ↓): `pairedProps` имел `systemComponent#7626:0`, а реальный `ownedSwap` — `systemComponent#1073:2`.

**Фикс (применено):** в `heal-apply-autopairs.js` добавлена функция `derivePairedFromAutoPairs()` — пересобирает `pairedProps[]` и `pairedGroups[]` из канонического `autoPairs` (полученного от Figma Phase 5a). Если новый набор не совпадает с прежним — старый сохраняется в `_pairedPropsPrev` / `_pairedGroupsPrev` для аудита, новый записывается. 0 ownedSwap → не попадает в pairedProps (остаётся в `directVisibleNodes` / `ownedText`). 1 ownedSwap → `pairedProps`. ≥2 ownedSwap → `pairedGroups`.

**TODO (отдельная задача):** добавить в `heal-preflight.js` проверку «`pairedProps[].boolean` существует в текущем `componentProperties`», иначе `verdict=stalePairedProps` — это второй слой защиты от расхождения. Не критично после R-047 фикса, потому что apply-autopairs теперь перезаписывает pairedProps на каждом прогоне.

**Где:** `tests/scripts/heal-apply-autopairs.js` (derivePairedFromAutoPairs + pairedEqual)
**Замечено:** review `/parseProps` 2026-05-12 при разборе meshok ↓ / R-042

---

### [x] R-048 · `/parseProps` BEGIN-PROPS — комментарий маркера ссылается на устаревший источник правды — ЗАКРЫТ 2026-05-12

Маркер `<!-- BEGIN-PROPS (auto-generated from tests/scripts/inspected-props.json …) -->` в каждом сгенерённом правиле говорит: источник = `inspected-props.json`. На практике для большинства композитов `inspected-props.json` пуст или устарел, а реальный источник — `_index.json` (после Phase 5a). Дизайнер/агент, читающий маркер буквально, идёт смотреть `inspected-props.json`, не находит данных и заключает «скилл сломан».

**Эффект:** auto-блок генерится с TODO везде (как у meshok ↓ до R-045), потому что codegen берёт пустой исходник.

**Фикс (применено):**
1. Маркер обновлён во всех 15 уже сгенерённых правилах (`rules/components/*.md`) sed'ом: `auto-generated from tests/scripts/inspected-props.json` → `auto-generated from rules/components/_index.json (primary) + tests/scripts/inspected-props.json (fallback for noProps)`.
2. Генератор `tests/scripts/gen-component-rules.js` — обновлена константа `BEGIN`.
3. Парсер `tests/scripts/draft-component-rules.js` — теперь распознаёт оба формата маркера (новый primary, старый fallback) при поиске зоны для перезаписи. Это обеспечивает backward compatibility во время rollout'а.

**TODO (отдельная задача):** обновить `heal-rules-stub.js` / `gen-component-rules.js` чтобы при заполнении таблицы preferred values использовать `_index.json[X].slots[<slot>].preferredValues[].name + .usage` как primary source (сейчас они тянут только из `inspected-props.json`). Это закроет дубликат «auto-блок с TODO vs handwritten секция ниже». Без этого фикса auto-генерация продолжит давать TODO-стабы для всего, что есть в `_index.json` но отсутствует в `inspected-props.json`.

**Где:** `rules/components/*.md` (15 файлов), `tests/scripts/gen-component-rules.js`, `tests/scripts/draft-component-rules.js`
**Замечено:** review `/parseProps` 2026-05-12 при разборе R-045

---

### [x] R-049 · `/parseProps` гейт `nastya_approved` ↔ пустой `usage` — только репортит, не блокирует — ЗАКРЫТ 2026-05-12

`heal-preflight.js` правильно вычисляет `flags.missingPreferredUsage[]` (строка ~76 в скрипте), но **не блокирует** ручное `nastya_approved=true` в `_index.json`. То есть Настя/агент может (и сделал, см. meshok ↓ до R-043) выставить `nastya_approved: true` в обход проверки. Гейт декларативный.

**Эффект:** Builder при выборе preferred попадает в fallback на `preferredKey`, потому что `usage` пустой, а формальное «правило одобрено» внушает обманчивую уверенность. Это **молчаливая регрессия** — A-040, A-045 — оба про navbar.middle, та же категория ошибок.

**Фикс (применено):** в `heal-preflight.js`:
1. Новый флаг `invalidApproval` (boolean) — выставляется в `true`, когда `nastya_approved === true && missingPreferredUsage.length > 0`.
2. `decide()` теперь возвращает `abort:invalidApproval` **в приоритете перед остальными ветками** (кроме `abort:notInRegistry`).
3. `escalations()` при `invalidApproval` возвращает только одну рекомендацию: либо снять `nastya_approved=false` руками, либо прогнать `/parseProps --hypothesize` и одобрить заново. Остальные шаги не предлагаются — нет смысла идти дальше, пока некорректное одобрение не снято.
4. CLI exit code 3 при `abort:invalidApproval` — CI/orchestrator могут детектить через exit status, не парся JSON.

**TODO (отдельная задача):** новая команда `/parseProps <X> --approve` — пайплайн «после hypothesize → когда `missingPreferredUsage=[]` → можно поднять `nastya_approved` на true». Сейчас approve — ручная правка `_index.json`. Не критично — гейт в R-049 уже блокирует некорректные комбинации.

**Где:** `tests/scripts/heal-preflight.js` (flag `invalidApproval`, новая ветка в `decide()`, exit code 3)
**Замечено:** review `/parseProps` 2026-05-12 при разборе R-043

---

### [x] R-050 · `/parseProps` Classifier — нет класса `layoutAbsolute` (ABSOLUTE-positioning кейсы) — ЗАКРЫТ 2026-05-12 (спека)

Таблица в шаге 3 Classifier имела пять классов (`swapNotResolved`, `placeholderText`, `variantMissing`, `preferredOutsideRegistry`, `propNameMismatch`). Компоненты с `layoutPositioning: ABSOLUTE` (meshok ↓, meshok ↑, navbarHeader, потенциально `floatToNavbar`) при default-вставке схлопываются или вылетают за фрейм — это **отдельный класс fail**, не покрытый ни одним из пяти. Реальная починка ушла в handwritten helper'ы (`addMeshokDown`), а не в скилл.

**Фикс (применено в спеке):** в таблицу Classifier добавлен класс `layoutAbsolute` с patch template'ом «запись `layoutRules{…}` в `_index.json` + handwritten helper `addX(frame, opts)` в `<X>.md`».

**TODO (реализация):** в `heal-microtest.js` добавить ассерты `boundsZero` / `outsideFrame` (проверять `instance.absoluteBoundingBox` после createInstance в sandbox). В `heal-classify.js` маппить эти fail'ы на класс `layoutAbsolute`. В `heal-patch.js` — template, который пишет `layoutRules` секцию и предупреждает «требуется ручной helper в `<X>.md`».

**Где:** `.claude/commands/parseProps.md` (спека — done); `tests/scripts/heal-microtest.js`, `heal-classify.js`, `heal-patch.js` (реализация — TODO)
**Замечено:** review `/parseProps` 2026-05-12 при разборе meshok ↓

---

### [x] R-051 · `/parseProps` hypothesize — booleans без paired-структуры пропускаются — ЗАКРЫТ 2026-05-12 (спека)

Скилл шаг 5.1 (`heal-hypothesize.js`) генерил вопросы только двух типов: `preferredUsage` и `booleanSemantics` (только для paired-booleans). Standalone-booleans (например, `onScroll#1091:7` у meshok ↓, который owns RECTANGLE-ноды, без paired SWAP-слота) — пропускались. В результате `whenOn`/`whenOff` оставались пустыми, и Builder не знал, когда включать.

**Фикс (применено в спеке):** в шаг 5.1 добавлен третий тип `alwaysOnBoolean` (для R-052) и расширено описание `booleanSemantics` — теперь покрывает и paired, и standalone (ownedNodes-кейс).

**TODO (реализация):** в `heal-hypothesize.js` добавить branch «for each BOOLEAN in `booleans`, если `whenOn || whenOff` пуст — пушить вопрос». Сейчас скрипт обходит только пары через `pairedProps`.

**Где:** `.claude/commands/parseProps.md` (спека — done); `tests/scripts/heal-hypothesize.js` (реализация — TODO)
**Замечено:** review `/parseProps` 2026-05-12 при разборе R-044 (3 boolean meshok ↓ без semantics)

---

### [x] R-052 · `/parseProps` apply-contract — поля `alwaysOn`/`builderRule` вне схемы — ЗАКРЫТ 2026-05-12 (спека)

`systemComponent#2273:0` у meshok ↓ имеет полезные поля `alwaysOn: true` и `builderRule: "Не передавай false…"`. Это паттерн «BOOLEAN, который нельзя выключать, потому что false оставляет placeholder вместо скрытия». В спеке шага 5.3 (`--apply` контракт) этих полей не было — то есть они написаны вне скилла, и `heal-hypothesize.js --apply` не умеет их записывать.

**Фикс (применено в спеке):** в apply-контракт добавлен ключ `alwaysOnBoolean` с полями `alwaysOn`, `builderRule`. Запись теперь декларативно описана.

**TODO (реализация):** в `heal-hypothesize.js` добавить обработчик `alwaysOnBoolean` apply-блока. Триггер для генерации вопроса — Phase 5b microtest показывает «boolean выключен → swap остался placeholder, а не скрылся».

**Где:** `.claude/commands/parseProps.md` (спека — done); `tests/scripts/heal-hypothesize.js` (реализация — TODO)
**Замечено:** review `/parseProps` 2026-05-12 при разборе meshok ↓.booleans.systemComponent

---

### [x] R-042 · `meshok ↓` — `pairedProps` неполные и со stale `#id` — ЗАКРЫТ 2026-05-12

В `rules/components/_index.json` для `meshok ↓` поле `pairedProps` содержало **одну** пару со стейл-именами (`systemComponent#7626:0` ↔ `✎ systemComponent#7626:1`), при том что реальные имена пропов — `#2273:0` и `#1073:2`. Реальных paired-пар три: `systemComponent`, `buttonsView`, `float / toast`. Информация частично жила в `booleans.<prop>.ownedSwap` — два source of truth на одно отношение.

Корень: ручной snapshot во время предыдущего парсинга, потом ребренд `#id` в Figma, потом `/parseProps` не дотянул bindings graph (Phase 5a) до перезаписи `pairedProps` — записал в `ownedSwap`, оставил `pairedProps` грязным. `dataStatusNote: "Re-resolve required"` висел как пометка.

**Фикс (применено):** перезаписан `pairedProps` всеми 3 парами с корректными именами; удалён `dataStatusNote`; `dataStatus` поднят до `"validated"`. `ownedSwap` оставлен в `booleans.*` как cross-reference (один из двух source-of-truth остаётся, но теперь они согласованы).

**TODO для скилла:** в `/parseProps` Phase 5a гарантировать, что bindings graph пишет в `pairedProps`, а не только в `ownedSwap` — единый source of truth.

**Где:** `rules/components/_index.json` (meshok ↓.pairedProps, dataStatus, dataStatusNote)
**Замечено:** review `/parseProps` 2026-05-12

---

### [x] R-043 · `meshok ↓` — `nastya_approved: true` при пустых `usage` у валидированных preferred — ЗАКРЫТ 2026-05-12

В слоте `✏️ systemComponent#1073:2` три preferred (`tabbarInverse`, `keyboardNumeric`, `keyboardAlphabetic`) имели `validated: true`, но `usage: ""`. При этом `nastya_approved: true`. По шагу 5 `/parseProps`:

> «`nastya_approved` не может стать `true`, пока `usage` пуст хотя бы у одного валидированного entry с ≥ 2 candidates»

Гейт не сработал. Knowledge для всех трёх preferred был в handwritten секции `meshok.md` (строки 220–222) — просто не синхронизирован в `_index.json`. Эффект: Builder при выборе попадает в fallback на `preferredKey` (handle) и выбирает не то для dark-фона / клавиатурных экранов.

**Фикс (применено):** заполнены `usage` для `tabbarInverse`, `keyboardNumeric`, `keyboardAlphabetic` — текст портирован из handwritten секции `meshok.md`.

**TODO для скилла:** `parseProps-preflight.js` (которого пока нет в `tests/scripts/`) должен проверять пустые `usage` у validated entries и выдавать `verdict=missingPreferredUsage`. Сейчас гейт декларативный — реализации нет.

**Где:** `rules/components/_index.json` (meshok ↓.slots.✏️ systemComponent#1073:2.preferredValues[])
**Замечено:** review `/parseProps` 2026-05-12

---

### [x] R-044 · `meshok ↓` — три boolean без `whenOn` / `whenOff` — ЗАКРЫТ 2026-05-12

`buttonsView#1074:0`, `float / toast#1868:0`, `onScroll#1091:7` — все три с пустыми `whenOn` / `whenOff` в `_index.json`. При этом `parsePropsAppliedAt` стоит — то есть шаг 5 hypothesize формально применялся, но не дописал semantics для booleans без paired-структурного описания (или этот шаг для них не выполнялся вовсе). Семантика существует в handwritten секции `meshok.md` (правила 2, 5 + раздел meshok ↓).

**Фикс (применено):** заполнены `whenOn` / `whenOff` для всех трёх booleans с привязкой к парному swap (где применимо) и контексту использования.

**TODO для скилла:** шаг 5.1 (`parseProps-hypothesize.js`) должен генерить вопросы и для booleans с пустыми `whenOn`/`whenOff`, а не только для preferred. Сейчас контракт описан, реализации нет.

**Где:** `rules/components/_index.json` (meshok ↓.booleans.{buttonsView,float / toast,onScroll}.{whenOn,whenOff})
**Замечено:** review `/parseProps` 2026-05-12

---

### [x] R-045 · `meshok.md` BEGIN-PROPS блок — все ячейки TODO, дублируется handwritten секцией — ЗАКРЫТ 2026-05-12

Между маркерами `<!-- BEGIN-PROPS -->` и `<!-- END-PROPS -->` (строки 48–161 до фикса) все колонки «когда использовать» = `TODO`, preferred values подписаны `· TODO`. Ниже (строки 164–236) — handwritten секция с полной таблицей пресетов, paired-парами и осмысленными «когда». Дизайнер читает дубликат, причём auto-блок — пустой.

Корень: BEGIN-PROPS должен генериться из `tests/scripts/inspected-props.json` (по комментарию в маркере), но для meshok в этом файле сейчас пусто (`jq 'keys | map(select(test("meshok")))' → []`). Значит, исходный auto-block был сгенерён в более раннем прогоне и заморожен в TODO-состоянии. Сейчас источник правды для пропов — `_index.json`, не `inspected-props.json`.

**Фикс (применено):** BEGIN-PROPS блок секции `meshok ↓` перезаписан backfill'ом из `_index.json`: имена preferred взяты из `slots[].preferredValues[].name`, тексты «когда использовать» — из `usage`, для booleans — из `whenOn`/`whenOff`. Секция `meshok ↑` внутри BEGIN-PROPS оставлена как есть (не аудировалась — отдельная задача).

**TODO для скилла:** комментарий маркера BEGIN-PROPS («auto-generated from tests/scripts/inspected-props.json») устарел — реальный источник теперь `_index.json`. Обновить комментарий и codegen-логику.

**Где:** `rules/components/meshok.md` (BEGIN-PROPS секция meshok ↓)
**Замечено:** review `/parseProps` 2026-05-12

---

### [ ] R-038 · `inputText 1.0` — нет правила setProperties для label/placeholder/hint

Probe 2026-05-11 (test 17, экран 4 Profile): Builder вставил 2 `inputText 1.0` без `setProperties`, все три text-пропа (label, placeholder, hint) остались дефолтными словами «label / placeholder / hint». Слева — декоративная sparkle-иконка из preferred default.

**TODO:** Дополнить `rules/components/inputText.md`:
- Точные prop-имена для `✎ label`, `✎ placeholder`, `✎ hint` (через `componentPropertyDefinitions` или autoPairs из phase-5a).
- Когда `label / placeholder / hint` boolean'ы on/off.
- INSTANCE_SWAP для left-decoration — preferredKey + когда скрывать.

**Замечено:** /test 2026-05-11

### [ ] R-039 · `chipsView 1.0 ❖ view` — нет правила для populate чипсов реальными лейблами

Probe 2026-05-11 (test 17, экран 3 Interests): Builder вставил `chipsView` без override содержимого. По умолчанию контейнер показал 3 чипса с лейблом «label».

**TODO:** Создать `rules/components/chipsView.md`:
- requiredSwap → preferredKey для chip-варианта.
- Как менять количество чипсов (вариант `quantity#...` если есть).
- Per-chip TEXT prop (вероятно `✏️ label#...`).

**Замечено:** /test 2026-05-11

### [x] R-041 · `meshok ↓` — `systemComponent` boolean всегда true, не выключать

Замечено Настей на test 20 2026-05-11: Builder пытался выключить `systemComponent#2273:0=false`, но boolean не отключает slot корректно — он остаётся placeholder с оранжевой полосой. systemComponent — обязательная нижняя плашка (handle / tabbarPrimary / tabbarInverse / keyboard).

**Правило (применено):** `systemComponent#2273:0` всегда `true`. Если визуально таббар не нужен — свапнуть `✏️ systemComponent#1073:2` на `handle ❖ view` (минимальный индикатор).

**Где:** `rules/components/meshok.md` (правило 3 + строка под `### Пропы`), `rules/components/_index.json` (booleans.systemComponent#2273:0.alwaysOn=true + builderRule).

**Замечено:** /test 2026-05-11 test 20

### [ ] R-040 · `featureBanner 2.0` — нет правила setProperties для title/subtitle/button-label

Probe 2026-05-11 (test 17, экран 2 Notifications): Builder вставил `featureBanner` без переопределения текстов — «Title», «Subtitle», кнопка «Что сделать» все placeholder.

**TODO:** Создать `rules/components/featureBanner.md`:
- TEXT props (точные имена через autoPairs phase-5a).
- INSTANCE_SWAP для CTA-кнопки внутри + её текст.
- Декоративный slot справа (иконка/illustration).

**Замечено:** /test 2026-05-11

### [ ] R-037 · `base ◇ tabsView` — пропы не описаны в правилах

Probe v2 (2026-05-09): инспекция `componentPropertyDefinitions` у `base ◇ tabsView` (`e23b54da...`) показала:
- `quantity#7405:0` (INSTANCE_SWAP, default `158:1554`) — выбор количества табов; preferred — 9 ключей (1-9 табов?). Имена не зарезолвлены.
- Каждый таб (внутри `tabsRow → tabsWrapper → tab N`) имеет TEXT-проп `'✏️ label#15552:0'` — текст работает через `setProperties`. Подтверждено: «Эконом / Бизнес / Первый» поставились с первого раза.
- Каждый таб также: VARIANT `selected=true|false`, INSTANCE_SWAP `counterInline 1.0` со счётчиком и его TEXT-пропом `'✏️ quantity#3692:1'` (default '1'), `iconGlyph 1.1`, `dropdown`, `placeholder`.

**TODO:**
1. Создать `rules/components/tabsView.md` с описанием:
   - выбор количества (`quantity#7405:0` swap) — резолвнуть имена 9 preferred (1 ◇ tabsViewBase, 2 ◇, … 9 ◇?)
   - паттерн установки текстов на N табов: `tab 1`, `tab 2`, …, `tab N` через TEXT-проп
   - управление selected-состоянием через VARIANT (только один таб может быть selected=true)
   - опциональные счётчики, иконки, dropdown
2. Также рассмотреть `oblakoSecondary ◇ tabsView` (`d4bdd22a...`) — отдельные правила или общий файл?
3. Добавить мапинг в `tests/scripts/gen-component-rules.js` (`'base ◇ tabsView': 'tabsView'`).

**Где:** правил нет; нужна секция в новом `rules/components/tabsView.md`.
**Замечено:** probe v2 (meshok-probe-v2-2026-05-09), при сборке meshok ↑ с tabs.

---

### [ ] R-036 · `toast 1.0` — preset не описан, swap отображается как оранжевый стрип

Probe v2 (2026-05-09): задан правильный swap `'✏️ float / toast#1868:1': toast 1.0` + `'float / toast#1868:0': true`. Тост вставился, но визуально — оранжевый заштрихованный стрип. Инспекция показала: у `toast 1.0` (`921ec8e6...`) есть проп `preset#10412:0` (INSTANCE_SWAP, default `12:6` = placeholder), 5 preferred:
- `aa40b8b9...` — universal placeholder
- `02803939...`, `19884e0c...`, `8fa9f607...`, `54b1f2f3...` — 4 неизвестных компонента (имена не зарезолвлены)

Без свапа `preset#10412:0` тост остаётся placeholder-ом. Это **silent failure №2** аналогично buttonsView (A-037).

**TODO:**
1. Резолвнуть имена 4 preferred (probably default / positive / negative / system или похожие preset-варианты)
2. Описать в `rules/components/meshok.md` раздел meshok ↓: при включении тоста обязательно `toastInst.setProperties({'preset#10412:0': preset.id})`
3. Опционально создать отдельный `rules/components/toast.md`
4. Обновить шаблон `makeMeshokDown` в FIGMA_IMPLEMENTER_AGENT.md — если задан тост, требовать второй параметр `toastPreset`

**Где:** `rules/components/meshok.md`, возможно новый `rules/components/toast.md`, `FIGMA_IMPLEMENTER_AGENT.md`.
**Замечено:** probe v2, frame 5 «toast + 2 vertical».

---

### [ ] R-035 · `meshok ↑` высота не описана — растёт при включении опциональных слотов

В test 15 polygon (сценарии 1, 4, 5): высота меняется в зависимости от включённых tabs/search/float:
- default (только navbar): 104px
- + tabs#2369:0=true: 196px (+92px)
- + search#2373:14=true: 208px (+104px)

**TODO Настя:** добавить в `rules/components/meshok.md` таблицу «при каких toggles какая высота meshok ↑», чтобы при overlap (когда верхний мешок занимает > 30% экрана) можно было быстро понять, что лишнее включено.

**Где:** `rules/components/meshok.md` (раздел про meshok ↑).
**Замечено:** /test 15 polygon, 2026-05-09T15:30

### [ ] R-034 · `meshok ↓ float / toast` — нет правила, где и как рендерится toast

В test 15 polygon сценарий 14: задал `'✏️ float / toast#1868:1': notificationToast.id` + `'float / toast#1868:0': true`. systemComponent off. Визуально на скриншоте — пусто (только тонкая тень сверху).

**Гипотезы:**
- toast рендерится **поверх** meshok ↓ (выше его границы) — не попал в фрейм 360x240 потому что вышел за верхнюю границу
- нужны дополнительные пропы для позиционирования
- preferred values в инспекции: `aa40b8b9...`, `921ec8e6e488e5f385e46def0c7ed807fe56178d`, `8a009dbc54fee4171e22b788233d6e68023b3520` — может, я не тот свапнул

**TODO Настя:** описать паттерн float/toast в meshok ↓:
1. Какие компоненты допустимы (notificationToast / default ◇ toast / positive/negative ◇ toast)?
2. Где визуально появляется toast — над кнопками или над всем фреймом?
3. Нужна ли absolute positioning для самого meshok ↓ при включённом toast?

**Где:** `rules/components/meshok.md` (раздел meshok ↓).
**Замечено:** /test 15 polygon, 2026-05-09T15:30

### [ ] R-033 · `chipsView ❖ view`: нет правила, как добавить кастомные chip-инстансы — все чипы рендерятся как «label»

В test 13 на экранах 2 (Results — фильтры) и 4 (Seat — легенда мест) `chipsView`-инстанс показывает 3 default-чипса с текстом «label». Builder создаёт инстанс через `createInstance()` и не делает ничего больше. Нет ни шаблона, ни правила, как (а) добавить N chip-инстансов, (б) задать им текст, (в) задать варианты (active/default), (г) установить иконки.

**Где:** правил для `chipsView 1.0 ❖ view` нет вообще; нужна секция в `rules/components/chipsView.md`. **Как лечить:** документировать паттерн «chipsView contains chip-instances; populate via swap or addChild + setText».
**Замечено:** /test 2026-05-09T13:50

### [x] R-032 · `header 1.1`: setText не работает — заголовок остаётся «Title» — ЗАКРЫТ 2026-05-09

**Резолюция:** у `header 1.1` title — это TEXT-проп `✎ title#13537:10` (default «Title»). Subtitle/counter — `✎ subtitle#13537:15` + boolean `subtitle#9948:3`, `✎ counter#13537:20` + boolean `counter#9948:2`. Размер — VARIANT `size` (`'17'/'21'/'27'/'15'`). Установка через `setProperties` работает; `findOne(TEXT)` бил мимо.

**Фикс в** `FIGMA_IMPLEMENTER_AGENT.md` — таблица real prop names + helper `addHeader(parent, title)`.

В test 13 на экранах 4, 7, 8, 11, 12 header показан с дефолтным текстом «Title». Builder делает `setText(header, null, 'Эконом · ряды 14–32')` — `findOne(TEXT)` находит первый text-нод, но изменение characters не работает (видимо не тот нод или text-prop требует `setProperties` через `componentPropertyDefinitions`).

**Где:** `rules/components/header.md` (если есть); нужно явно описать prop name для title (по паттерну `text#NNNN:N`) и опциональные subtitle/showAll. **Как лечить:** документировать: `header.setProperties({'text#XXXX:X': 'Заголовок'})` — а не findAll(TEXT).
**Замечено:** /test 2026-05-09T13:50

### [x] R-031 · `featureBanner 2.0`: title и CTA-button показывают «Title» / «Что сделать» по дефолту — ЗАКРЫТ 2026-05-09

**Резолюция:** у `featureBanner 2.0` title/subtitle — TEXT-пропы `🅃 title#9189:0` (default «Title») и `🅃 subtitle#9189:5` (default «Subtitle») + boolean `subtitle#8817:0`. Установка через `setProperties` работает; `findAll(TEXT)[0]` бил мимо.

CTA-кнопка — это nested `buttonsView` (boolean toggle `buttonsView#8932:2`, default=true). Текст CTA меняется через тот же путь что и meshok ↓.buttonsView: nested `size → row 1 → button 1` + setProperties `'✎ label#13004:2'`.

**Фикс в** `FIGMA_IMPLEMENTER_AGENT.md` — таблица real prop names + helper `addBanner(parent, title, subtitle)`. CTA-label требует доп. setDeep (отдельная инвестигация по точному прехождению до nested buttonsView внутри banner).

В test 13 на экранах 1, 3, 10, 11 banner: subtitle установлен корректно (через findAll[1]), но title = «Title» (дефолт), CTA-кнопка внутри = «Что сделать» (дефолт). Builder использует `texts[0].characters = title` — но findAll вернул title не первым, а где-то дальше; CTA-кнопка вообще nested INSTANCE с собственным label-пропом, не TEXT.

**Где:** `rules/components/featureBanner.md` (если есть). **Как лечить:** документировать пути:
- `title` → setProperties prop name (например `text#NNNN:N`)
- `subtitle` → boolean toggle + prop name
- CTA → INSTANCE_SWAP / setDeep на nested button с label-пропом
**Замечено:** /test 2026-05-09T13:50

### [ ] R-030 · `contentsView`-набор: `desc#21816:0` — не TEXT-проп, нельзя задать строкой

`17-15-13 · contentsView` имеет `componentPropertyDefinitions = ['desc#21816:0', 'subtitle#21816:4', 'style']`, но при `setProperties({ 'desc#21816:0': 'Войти' })` Figma возвращает `Property value is incompatible with component property type`. По имени выглядит как TEXT, но тип — другой (видимо, BOOLEAN видимости или INSTANCE_SWAP).

**Где:** `rules/components/contentsView.md` (нет такого файла). Пример swap'а text через `text#9760:6` для другого компонента — `rules/components/navbar.rule.json` (slot middle, `no subtitle · content`).
**Как лечить:** инспектировать тип каждого пропа в правилах (`text#... → TEXT`, `desc#... → ?`). Текст внутри `contentsView` после свапа задаётся не через `setProperties`, а через `findOne(TEXT) → characters` (с loadFontAsync).
**Замечено:** /test 2026-05-09T10:50

### [ ] R-029 · `buttonsView 1.0 ❖ view`: variant prop = `size#12637:13`, не `size`

В старых заметках встречалось `setProperties({ 'size': '1' })`, но реальный variant prop сета `buttonsView 1.0 ❖ view` называется `size#12637:13`. Также «1» не является валидным значением — нужны конкретные variant values из сета.

**Где:** `rules/components/buttonsview-view.rule.json` (или buttonsview-related rule'ы).
**Как лечить:** в правилах wrapper-компонентов перечислять реальное имя variant пропа (`size#12637:13`) и список допустимых значений. Прокидывать через `/syncKeys` сборку списка вариантов в `registry/libraries/.../variants.json`.
**Замечено:** /test 2026-05-09T10:50

### [ ] R-028 · `meshok ↓` SWAP-слоты — `✏️ ...#1073:N`, не `#2273:8` / `#1074:7`

В `src/agents/figma-implementer/skeleton.example.js` показаны только boolean-toggles `systemComponent#2273:0`, `buttonsView#1074:0`. Имена SWAP-слотов отсутствуют. Реальные:

| Слот | SWAP prop |
|---|---|
| systemComponent (handle/tabbar/keyboard) | `✏️ systemComponent#1073:2` |
| buttonsView | `✏️ buttonsView#1073:1` |
| float / toast | `✏️ float / toast#1868:1` |

**Где:** `rules/components/meshok.md`, `src/agents/figma-implementer/skeleton.example.js`.
**Как лечить:** в `meshok.md` добавить таблицу «boolean toggle vs SWAP» — указать оба имени с примерами. В `skeleton.example.js` показать оба паттерна (включить + свапнуть).
**Замечено:** /test 2026-05-09T10:50

### [ ] 🔴 R-001 · Покрытие правилами — низкое (на 2026-05-09: 38 из 153 ≈ 24.8%, цель 80%)

`rules/components/` содержит секции только для `button`, `header`, `meshok`, `uniCard`, `uniCell`. Остальные ~99 компонентов в реестре (`badge 1.2`, `tagsView`, `tooltip`, `navbarHeader`, `chip 1.0`, и т.д.) пропов не имеют — модель ставит их «на глаз».

**Где болит:** Шаг 6 `/builder` (`.claude/commands/builder.md:102-108`) хардкодит маппинг: незнакомый компонент → нет секции для подгрузки. Поведение не описано.

**Как лечить:** либо генерировать заглушки секций из `componentProps` в `components.json` (когда заполнятся), либо в шаге 6 фолбэк: «нет секции — открой `registry/libraries/<lib>/components.json`, читай только пропы конкретного компонента; если пропов в реестре нет — спроси дизайнера».

---

### [ ] 🔴 R-002 · Один `componentKey` для разных вариантов сета без указания `setProperties`

Пример (`rules/components/uniCell.md`):

| Компонент | Ключ | Когда |
|---|---|---|
| `avaPicture 1.3 ❖ view` (circle) | `7be949bd…` | Живой объект |
| `avaPicture 1.3 ❖ view` (squircle) | `7be949bd…` | Картинка |
| `avaPicture 1.3 ❖ view` (squircle, 56) | `7be949bd…` | Метафора |

Это COMPONENT_SET, ключ один. Чтобы получить нужный вариант, нужен `setProperties({ shape: 'circle', size: '24' })`. В правилах этого нет — Implementer вставляет default и делает «не ту аватарку».

**Как лечить:** в табличках для INSTANCE_SWAP-слотов добавить колонку `variantProps`: явный объект, который Implementer применяет после импорта. Без него — не вставлять.

---

### [ ] 🔴 R-003 · Нет таблицы соответствия «компонент → секция правил»

Маппинг зашит в `.claude/commands/builder.md:102-108` в виде литералов. При добавлении секции `tagsView.md` нужно править builder.md. Это путь к рассинхрону.

**Как лечить:** перенести маппинг в `rules/components/_index.json` — `{ "tagsView": "tagsView.md", "navbar 1.0": "navbar.md", ... }` или просто конвенция «имя файла = первое слово в `name`». Builder.md читает индекс/применяет конвенцию.

---

### [ ] 🔴 R-004 · Эмодзи и спецсимволы в именах токенов

`const/cell-view/→gap←/default`, `const/custom/cp-2 🧊`, `↑vertical↓` — рабочие имена в Figma, но в plugin-коде любое сравнение по имени или логирование разваливается. Пропы вроде `↓ bottom`, `← left`, `✎ <- left` (`uniCell.md`) — то же самое.

**Как лечить:** `setProperties` принимает `figmaPropName` с `#id` — в правилах уже хранятся (`↓ bottom#2216:0`). Зафиксировать: «обращение по чистому имени с эмодзи запрещено, всегда через `name#id`». Это уже подразумевается, но не зафиксировано.

---

### [ ] R-005 · `numbers-paddings/variables.json` не пересобирается

Файл с ключами переменных отступов и радиусов пишется руками. `/syncKeys` его не трогает. Если в Figma добавят `cp-72` или новый `const/wrapper/...`, никто не узнает, кроме как вручную.

**Как лечить:** расширить plugin-код в `/syncKeys` — для библиотеки `numbers-paddings` обходить `figma.variables.getLocalVariableCollectionsAsync()` и писать `variables.json`. Это отдельный путь — компонентов в этой либе нет, а переменные нужны.

**Дополнение (`/test` 2026-05-07T15:26Z):** у `numbers-paddings` также отсутствует `meta.json` — поэтому `libsWithMeta` стабильно показывает 6/7 вместо 7/7. Когда расширим `/syncKeys` под переменные, заодно надо писать и `meta.json` для этой либы (с тем же `lastModified`-механизмом).

---

### [ ] 🔴 R-006 · `rules.md` не отражает текущий формат `index.json`

`rules.md:16` говорит «структурные данные — в `registry/index.json`», но не упоминает, что формат tuple, а не объект. Если кто-то читает только `rules.md` без `CLAUDE.md`, ставит формат неправильно.

**Как лечить:** добавить в `rules.md` короткую вырезку про формат tuple `[lib, key, type, defaultVariantKey?]`. Один абзац.

---

### [ ] R-007 · Дизайнер не понимает, какой вариант navbar выбран

`rules/components/meshok.md` для слота `navbar` имеет три варианта (`navbar 1.0`, `navbar @ Lenta`, `headerSchevron`) с колонкой «Когда». Решение принимает модель — обычно молча. Нет интерактива «у тебя лента или обычный экран?».

**Как лечить:** в `meshok.md` или builder-шаге 6 добавить «если на экране лента/feed — спроси про navbar @ Lenta явно».

---

### [ ] R-008 · Регресс между `rules/components/*.md` и `registry/libraries/*/components.json`

Два источника правды. Переименование компонента в Figma → `/syncKeys` обновит `components.json`, но `meshok.md` останется со старым именем и ключом. Разъезд неизбежен.

**Как лечить:** либо `/test` метрика «сверка ключей в правилах с реестром», либо генерация скелета правила автоматически из реестра + ручная разметка только смысла («когда применять»).

---

### [ ] 🔴 R-009 · `rules/templates.md` упоминает шаблоны без таблицы покрытия

`bottom-slot`, `buttons-slot`, `card-image-content`, `card-text-content` — есть в `templates.md`, ссылаются на `uniCell.md`/`uniCard.md`, но нет обратного индекса «какие компоненты используют этот шаблон». При обновлении шаблона неизвестно, что ломается.

---

### [ ] 🔴 R-010 · `rules/skeleton.md` не описывает desktop/web

«Каждый мобильный фрейм…» — а если задача про web? Скилл `/builder` не различает платформы на уровне скелета. Десктопного скелета нет вообще.

**Как лечить:** добавить вариант `rules/skeleton-web.md` или явно ограничить scope: «builder работает только с мобильными экранами; для web — отдельный флоу (TBD)».

---

### [x] R-011 · Нет правила для `inputTextArea 1.0` — счётчик символов неизвестен

В реестре есть `inputTextArea 1.0` (`0062573010817c6314324778a3210c5cf6290ae4`), но в `rules/components/` для него правил нет. Из-за этого билдер не знает, есть ли встроенный counter-проп (типа `127/500`) или нужно ставить отдельный компонент. Дизайнер просил счётчик в форме отзыва — пришлось отказать.

**Где:** `rules/components/` — отсутствует файл `inputTextArea.md`
**Как лечить:** написать правило: размеры, варианты, пропы (включая `counter` если есть), placeholder/helper text, error state.
**Замечено:** /test --full 2026-05-08 (флоу отзыва, persona=зелёный)

---

### [x] R-012 · Нет правила для `navbar 1.0`

Нет файла `rules/components/navbar.md`. Не описаны слоты (`← left`, `right →`), counter, addons, варианты (стандарт/Lenta/transparent). При запросе «counter с непрочитанными в navbar» билдер не смог сделать без дальнейшей инспекции.

**Где:** `rules/components/` — отсутствует файл `navbar.md`
**Как лечить:** написать правило: варианты, слоты left/right, counter, иконки, search-режим.
**Замечено:** /test --full 2026-05-08 (лента уведомлений, persona=опытный)

---

### [ ] R-013 · Имя `tabbarPrimary ❖ view` vs реестр `primary ◇ tabbar`

В `rules/components/meshok.md` (секция «meshok ↓ → systemComponent») перечислены варианты: `tabbarPrimary ❖ view`, `tabbarInverse ❖ view`, `handle ❖ view`, `keyboardNumeric/Alphabetic ❖ view`. В реестре после `/syncKeys` имена другие: `primary ◇ tabbar`, `inverse ◇ tabbar`, `handle`, `numeric ◇ keyboard`, `alphabetic ◇ keyboard`. Билдер ищет по старым именам — не находит.

**Где:** `rules/components/meshok.md`, `src/agents/figma-implementer/FIGMA_IMPLEMENTER_AGENT.md` (таблица systemComponent)
**Как лечить:** обновить таблицу под реальные имена реестра. Возможно стоит сделать /test-проверку «имена в правилах ↔ имена в реестре» (regress-тест).
**Замечено:** /test --full 2026-05-08 (лента уведомлений)

---

### [x] R-015 · Нет правила для `17 · primary ◇ content` (и других content-компонентов)

Серия компонентов `11/13/15/17 · primary/custom/primaryOnColor ◇ content` — основной текстовый блок ДС, используется в каждом флоу. В `rules/components/` для них правил нет. Билдер не знает figmaPropName для текста, выставляет инстанс с дефолтным «Text» плейсхолдером. Скриншот test 4 показал: на экране «О приложении» вместо описания приложения торчит «Text».

**Где:** `rules/components/` — отсутствует файл `content.md`.
**Как лечить:** написать общее правило для серии content-компонентов: размеры (11/13/15/17), стили (primary/custom/primaryOnColor), figmaPropName для текста, выравнивание, multi-line.
**Замечено:** /test --full 2026-05-08 (визуальный ревью test 4)
**Закрыто:** 2026-05-08 — создан общий `content.md` для всей серии 11/13/15/17/21b/27b/56b × primary/custom/primaryOnColor (33 компонента, единая структура пропов)

---

### [ ] R-014 · В `header.md` не указан figmaPropName для boolean `subtitle`

`rules/components/header.md` описывает текст subtitle как `✎ subtitle#13537:15`, но boolean-toggle `subtitle` дан без ключа. Реальный ключ — `subtitle#9948:3` (не очевидно похожий на `#13537:14` который часто угадывается). Без ключа дизайнерская правка «покажи subtitle» проваливается с changed=0.

**Где:** `rules/components/header.md`
**Как лечить:** добавить figmaPropName для всех boolean-пропов: `subtitle#9948:3`, `counter#9948:2`, `← left#13537:0`, `right →#10534:7`, `tag#20385:10`. Можно автогенерить из `registry/libraries/<lib>/components.json`.
**Замечено:** /test --full 2026-05-08 (правка subtitle сначала упала)

---

### [x] R-017 · `text#NNNN:N` разный для разных размеров content

В первой версии `content.md` было ошибочно указано «все 33 компонента шарят `text#9760:6`». На практике `#id` пляшет: `11→:3`, `13→:4`, `15→:5`, `17/11b/13b/15b/17b→:6`, `21b→:7`, `27b→:9`, `56b→#10026:106` (другой namespace).

Эффект: Builder ставил `text#9760:6` для всех — у `27b` и `13`/`15` это игнорировалось без ошибки, оставался дефолтный плейсхолдер.

**Где:** `rules/components/content.md`
**Замечено:** Prop Collector test runs (test 5 + test 6) 2026-05-08
**Закрыто:** 2026-05-08 — `content.md` переписан полной таблицей-сеткой `#id` для всех 11 размеров.

---

### [x] 🔴 R-021 · navbar.middle по умолчанию = `placeholder`, нужен явный свап

**Разведка:** в реальном дереве `meshok ↑.navbar.middle` это инстанс компонента `placeholder` (`aa40b8b9...`) с **нулём пропов**. Поэтому `setDeep(['navbar','middle','title'])` молча падает — title не существует, пока не сделан свап.

**Правильный путь установки заголовка navbar:**
1. `meshokUp.setProperties({ 'navbar#1491:0': navbar.id })`
2. Внутри импортированного `navbar`: `setProperties({ '✎ · middle ·#1031:6': contentsViewComp.id })` — свапнуть middle с placeholder на нужный content/contentsView
3. После этого `findOne(name='middle')` найдёт инстанс `contentsView` со своими TEXT-пропами
4. На нём `setProperties({ 'text#9760:6': 'Заголовок' })` (или какой нужен `text#NNNN:N` для конкретного content-варианта)

Альтернатива: navbar может уже включать boolean `· middle ·#1031:15` для управления видимостью — проверить, нужно ли явно `true`.

**Где:** `rules/components/navbar.md` — добавить раздел «Установка заголовка» с готовым plugin-кодом + `setDeep`-альтернатива.
**Замечено:** test 7, test 8 (везде navbar пустой) 2026-05-09

---

### [x] 🔴 R-022 · uniCell — нет FILL + не описана обёртка `cellList`

В test 8 ячейки uniCell внутри корзины и статуса остались узкими (не растянулись на ширину контента) и не были обёрнуты в правильный `cellList`-контейнер с собственными правилами отступов.

**Правило (упущено в `uniCell.md`):**
1. `uniCellInst.layoutSizingHorizontal = 'FILL'` — обязательно
2. **Обёртка** — отдельный VERTICAL-фрейм с:
   - `paddingLeft/paddingRight` = `const/cell-view/←horizontal→/default` (16)
   - `paddingTop/paddingBottom` = `const/cell-view/↑vertical↓/default` (12)
   - `itemSpacing` = `const/cell-view/→gap←/default` (12)
3. Несколько uniCell всегда живут внутри одного такого контейнера (визуально читается как «островок»)

**Где:** `rules/components/uniCell.md` — добавить раздел «Размещение в cellList-контейнере»
**Замечено:** замечание дизайнера к test 8 2026-05-09

---

### [x] 🔴 R-023 · `vibe` для successState/emptyState — не описано в правилах

В test 8 на экране подтверждения заказа я использовал illustration + content17b + content27b напрямую. Дизайнер указал: «для successState / emptyState берём компонент `vibe`».

**Правило (упущено):**
- Любое **пустое состояние** (нет данных, нет результатов, ничего не найдено) → `vibe ❖ view 1.0` со свапом `context` на нужный preferredValue (`noInternet ◇ vibe`, `somethingHappened ◇ vibe`, специфические `page ◇ vibe`)
- Любой **success-state** после действия (заказ оформлен, отзыв отправлен) → тоже `vibe ❖ view 1.0` с подходящим `page ◇ vibe`-вариантом
- Не собирать руками из illustration + content + button

**Где:** `rules/components/vibe.md` — добавить раздел «Когда использовать vibe» (sucess/empty/error). В `rules/skeleton.md` или новом `rules/patterns.md` зафиксировать как обязательный паттерн «не собирать success/empty руками».
**Замечено:** замечание дизайнера к test 8 2026-05-09

---

### [x] 🔴 R-024 · Заголовки секций — только через `header`, размер по уровню

В test 8 я использовал `content27b/21b/17b` напрямую как заголовки страниц. Дизайнер: «Заголовки только через `header`, в зависимости от уровня — `size=27/21/17/15`».

**Правило (упущено):**
- Заголовок страницы (главный) → `header 1.1` с `size=27`
- Заголовок раздела → `header 1.1` с `size=21`
- Заголовок подраздела → `header 1.1` с `size=17`
- Самый мелкий → `header 1.1` с `size=15`
- Серия `* · NN ◇ content` НЕ для заголовков. Только для inline-текста внутри ячеек/карточек.

**Где:** `rules/components/header.md` — секция «Когда использовать header vs content». В `rules/skeleton.md` — общее правило «заголовки = только header».
**Замечено:** замечание дизайнера к test 8 2026-05-09

---

### [ ] 🔴 R-025 · Стандартный фон страницы — `surface/secondary`, не primary

В test 8 я ставил frame.fill = `surface/primary` (efb37e...). Дизайнер: «стандартный цвет страницы — `surface/secondary`».

**Правило (упущено):**
- **Фон фрейма экрана** — `surface/secondary` (`da9946fb28557beb884a56a98622e31e45ed56b8`)
- `surface/primary` — для блоков-«островков» поверх фона страницы (карточки, ячейки)
- `surface/tertiary` — для глубже вложенных подложек

**Где:** `rules/skeleton.md` — добавить «Фон страницы» в обязательные шаги. `rules/tokens.md` — таблица «когда какой surface».
**Замечено:** замечание дизайнера к test 8 2026-05-09

---

### [x] 🔴 R-026 · inputText.placeholder — текст не на componentProperty уровне

Разведка показала: внутри inputText есть TEXT-нода с именем `placeholder` и character `placeholder` — но это просто TEXT-нода без componentProperty (TEXT prop). На уровне inputText доступны только `placeholder#5913:21` (boolean — видимость) и `'✏️ label#2014:84'`/`'✏️ hint#2014:106'` (тексты лейбла и хинта).

**Эффект:** в test 8 поля ввода адреса остались с дефолтным «placeholder» вместо «Введите город» / «Введите улицу».

**Как лечить:**
- Зафиксировать в `inputText.md` что **placeholder-текст не настраивается через `setProperties`** — это часть мастера компонента в Figma
- Альтернатива: после createInstance найти TEXT-ноду `placeholder` через findAll и `node.characters = '...'` (override). Проверить работает ли.

**Где:** `rules/components/inputText.md` — добавить предупреждение и паттерн override.
**Замечено:** замечание дизайнера к test 8 2026-05-09

---

### [x] 🔴 R-027 · uniCard — wrapper, нужен обязательный свап `size`

В test 8 uniCard вставлен пустой (placeholder внутри) — Builder не сделал свап `size#6313:33` на конкретный `320 ◇ uniCard` / `220 ◇ uniCard`.

**Правило (упущено):**
- При создании `uniCard 1.0 ❖ view` ОБЯЗАТЕЛЬНО сразу свапнуть `size#6313:33` на конкретный размер по контексту:
  - 1 карточка в ряд / горизонтальная лента → `320 ◇ uniCard` (`0db95fb8...`)
  - 2 в ряд → `220 ◇ uniCard` (`0370cc32...`)
  - 3 в ряд / плотные сетки → `160 ◇ uniCard 1.0` (`e7eee61e...`)
- После свапа — установить пропы внутренней карточки через `findOne(name='size')` → `setProperties` (с правильным `#id` для конкретного размера, см. матрицу в `uniCard.md`)
- `layoutSizingHorizontal = 'FILL'` для самой uniCard-обёртки

**Где:** `rules/components/uniCard.md` — раздел «Обязательный свап при создании»
**Замечено:** замечание дизайнера к test 8 2026-05-09

---

### [x] R-019 · buttonCell.middle — text-проп через 2 уровня nested

---

### [x] R-019 · buttonCell.middle — text-проп через 2 уровня nested

В `buttonCell` слот `middle` (после раскрытия) — это inst `contentsView 1.1 ❖ view`. В нём ещё один inst `title` с `text#9760:6`. Прямой `findOne(name='middle').setProperties({'text#9760:6': 'X'})` не срабатывает — свойство стоит на ещё более глубоком вложенном `title`-инстансе.

**Эффект:** в test 7 все 5 buttonCell остались с default «Что сделать».

**Где:** `rules/components/buttonCell.md`
**Как лечить:** в правиле явно прописать путь — сначала `findOne(name='middle')` → внутри ещё `findOne(name='title')` → `setProperties({'text#9760:6': ...})`. Зафиксировать паттерн «двухуровневый nested» для всех cell-семейств.
**Замечено:** Builder run #7 2026-05-08

---

### [x] R-020 · buttonsCircleView — labels 3 кнопок через nested

В `buttonsCircleView 1.0 ❖ view` после `quantity`-свапа на ряд из N кнопок — каждая кнопка `buttonCircle` вложена. Их `✎ label` не достаются через прямой findOne.

**Эффект:** в test 7 все 3 круглые кнопки в профиле остались с default «Действие».

**Где:** `rules/components/buttonsView.md` (раздел buttonsCircleView)
**Как лечить:** уточнить паттерн доступа к каждой из N кнопок: `findAllWithCriteria` → отфильтровать по имени → setProperties у каждой.
**Замечено:** Builder run #7 2026-05-08

---

### [x] R-018 · meshok ↓ — boolean'ы используют другой `#id`-префикс чем INSTANCE_SWAP

В meshok ↓ `buttonsView` (BOOLEAN-видимость) имеет ключ `#1074:0`, а INSTANCE_SWAP `✏️ buttonsView` — `#1073:1`. Разные префиксы у пары пропов с одинаковой основой имени. По аналогии с другими компонентами легко угадать `#1073:0`, что неправильно.

**Где:** `rules/components/meshok.md`
**Как лечить:** уже исправлено в meshok.md. Запомнить как паттерн (boolean и swap у одного слота могут иметь разные `#id`-префиксы).
**Замечено:** Prop Collector test runs 2026-05-08
**Закрыто:** 2026-05-08 — в `meshok.md` добавлено явное предупреждение о разных префиксах; в `PROP_COLLECTOR_AGENT.md` зафиксировано как паттерн «не угадывать».

---

### [ ] R-016 · Опечатка `platofrm` в `numeric ◇ keyboard`

VARIANT-проп `numeric ◇ keyboard` назван **`platofrm`** вместо `platform`. У соседнего `alphabetic ◇ keyboard` имя корректное.

Эффект: Builder по аналогии передаёт `'platform': 'iOS'` — Figma молча игнорирует, остаётся дефолт `android`.

**Где:** Figma — `numeric ◇ keyboard` (`a58c169e9...`)
**Как лечить:** в Figma переименовать `platofrm` → `platform`, прогнать `/syncKeys`, убрать предупреждение из `keyboard.md`.
**Замечено:** Prop Collector 2026-05-08 (system sweep)

---

## Закрытые проблемы

_(пусто)_
