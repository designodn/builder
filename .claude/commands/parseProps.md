# /parseProps — парсинг и автопочинка одного компонента

> Ранее назывался `/heal`. Скрипты pipeline-а в `tests/scripts/parseProps-*.js`.
> Лог-файл `tests/heal-log.jsonl` сохраняет старое имя как audit trail.
>
> **Sandbox Figma-файл для microtest:** `twL50t4GFELOKpEwFWSvwW` (Test MCP 1).
> Все `use_figma`-вызовы с тестовым кодом направляются в этот файл.

Прогоняет один компонент через диагностику и автопочинку. Цель — максимум информации за минимум токенов. Доступ — только Настя.

## Принципы оптимизации токенов

Каждый шаг проверяет «можно ли не звать Figma MCP?» **прежде** чем звать. Стоимости (порядок):
- 1 Read локального файла ≈ 200–2000 токенов
- 1 `grep` / `jq` ≈ 50 токенов
- 1 `get_design_context` / `use_figma` MCP ≈ 5000–30000 токенов

**Правила:**
1. **Кэш в сессии**. `registry/index.json` (derived cache из rules) и `rules/components/<slug>.rule.json` — читаются **один раз** в начале сессии. После apply `registry/index.json` авто-регенерируется из rules — никаких ручных шагов. **Исключение:** при явном `/parseProps X` (не `--cached`) Figma переснимается заново — механика правила перезаписывается (R-051, Шаг 0.5).
2. **Default-variant first**. Microtest гонит только дефолт-вариант. Полная матрица — только после прохождения дефолта.
3. **Stage gate**. Каждый sub-skill вызывается **только если** локальные данные отсутствуют. Pre-flight сам решает. **Только для `--cached` / closure / batch-прогонов.** При явном пользовательском вызове stage-gate НЕ пропускает re-probe — он лишь сообщает, чего не хватало (R-051).
4. **Template patches**. 80% починок — применение шаблона из классификатора. AI-генерация — только для гипотез.
5. **Single Figma MCP per heal**. Если для починки нужен Figma — батчим всё в один вызов.
6. **Hypothesize только при тупике**. Если template-patch закрыл проблему — гипотезы не нужны.
7. **Verifier на чекпойнтах**. V-CHECKPOINT каждые 10 итераций sweep'а, не после каждой.

Ожидаемый бюджет на один heal (компонент с данными, простой патч): **~3 000 токенов**. Сложный случай с Figma MCP и hypothesize: **~15 000**. Лимит — 25 000, иначе `verdict=overbudget`.

## Вызов

```
/parseProps <componentName>                # ПОЛНЫЙ ре-ран: re-probe Figma + overwrite механики
/parseProps <componentName> --cached       # дешёвый путь: stage-gate, не переснимать если данные есть
/parseProps <componentName> --hypothesize  # форсированно фаза гипотез (даже если данные есть)
/parseProps <componentName> --dry          # без коммитов, только отчёт
```

> **Семантика явного вызова (R-051).** Когда Настя набирает `/parseProps X` руками — это
> **запрос на полный прогон с нуля**, а не «догрузи чего не хватает». Pipeline ОБЯЗАН заново
> зондировать Figma и перезаписать **механические** поля: `key`, props, `name`, `preferredValues`,
> структуру `variants`/`booleans`. Stage-gate/кэш-оптимизация (Правила 1, 3) применяются ТОЛЬКО
> к внутренним/closure-прогонам (`--close-nested`, batch) или при явном `--cached`.
>
> **Curated-поля НЕ затираются молча.** Если `usage`, `doc.whenToUse`, `doc.edgeCases`,
> `isDefault`, `intent`, `builderRule` уже заполнены — перед перезаписью **спроси через
> `AskUserQuestion`**: «оставить текущую usage/описание или сгенерировать заново?» (см. Шаг 0.5).

## Алгоритм

### Шаг 0 — Identity + кэш сессии

```bash
echo "## /parseProps $1 · $(date -Iseconds)"
echo "registry: $(jq '.components | length' registry/index.json)"
```

Прочитай в память (один раз на сессию):
- `registry/index.json` — компонент → `[lib, key, type]`

**Tier-система:**

| Tier | Критерий | Примеры |
|---|---|---|
| `atom` | 0 INSTANCE_SWAP-пропов | `switch`, иконки, бейджи |
| `composite` | ≥1 INSTANCE_SWAP-проп | `button`, `uniCell`, `navbar`, `header` |
| `view` | Контейнер с requiredSwap под список | `chipsView`, `buttonsView`, `uniCard` |

### Шаг 0.5 — Режим прогона (R-051)

Определи режим **до** Шага 1:

- **Явный вызов** `/parseProps X` (без `--cached`) → **full re-run**. Цель — снять текущее состояние Figma как источник правды и перезаписать механику правила, даже если файл уже есть. Это защищает от тихого дрейфа (устаревшие ключи, переставленные имена, новые/удалённые пропы, пропущенные nested swaps).
- **`--cached` / closure / batch** → stage-gate как раньше (не переснимать, если данные есть).

**Перед перезаписью curated-инфы — спроси.** Если в существующем правиле уже заполнены `usage` / `doc.whenToUse` / `doc.edgeCases` / `isDefault` / `intent` / `builderRule`, и режим — full re-run, задай **один** `AskUserQuestion`:

> «У `<X>` уже есть заполненные описания (usage/doc/edgeCases). Что с ними при пере-прогоне?»
> - **Сохранить curated, обновить только механику** (рекомендую) — keys/props/names переснимаются, тексты остаются.
> - **Перегенерировать всё** — старые описания идут в hypothesize заново (старые показать как черновик в `options.description`).
> - **Отмена** — выйти, ничего не трогать.

Механические поля (`key`, props, `name`, `preferredValues`, структура `variants`/`booleans`) перезаписываются **всегда** при full re-run — про них не спрашиваем, источник правды = Figma.

`parseProps-preflight.js` (Шаг 1) отдаёт для этого готовые поля: `mode` (`full-rerun`/`cached`), `reprobe` (bool), `existingCurated.fields[]` (какие curated уже заполнены), `curatedConflict` (bool — если `true`, задай AskUserQuestion выше перед перезаписью). `--cached` переводит в `mode: cached` (старый stage-gate, без re-probe).

### Шаг 1 — Pre-flight (без Figma MCP)

```bash
node tests/scripts/parseProps-preflight.js "<X>"
```

Проверяет:
- `registry/index.json` — компонент зарегистрирован?
- `rules/components/<slug>.rule.json` — файл правил существует?
- `tests/scripts/inspected-props.json` — пропы известны? (legacy + новые компоненты)

Решение по флагам:

```
fullBootstrap      → noProps + noRule: сначала stub, потом microtest
resolveProps       → noProps: нужен /syncKeys чтобы заполнить inspected-props
stubRule           → нет .rule.json: запустить parseProps-stub
hypothesizeUsage   → missingPreferredUsage: нужны вопросы про preferred
hypothesizeDesc    → doc.whenToUse = TODO: нужно описание компонента
readyForMicrotest  → всё есть, идём в шаг 2
abort:notInRegistry
abort:invalidApproval (R-049)
```

После pre-flight всё необходимое для microtest гарантированно лежит локально.

### Шаг 2 — Microtest (Figma MCP → Test MCP 1)

Heal **не реализует microtest сам** — зовёт `/test --component <X>`. Под капотом:

1. `node tests/scripts/parseProps-microtest.js "<X>"` → codegen plugin-кода.
2. `use_figma` с этим кодом в файл **`twL50t4GFELOKpEwFWSvwW`** (Test MCP 1).
   - Sandbox-фрейм: `__heal_sandbox__ <NAME>` в Test MCP 1.
3. Парсинг `HEAL_RESULT:` из thrown Error / return value.
4. **Скриншот-верификация** (обязательный шаг):
   - Из ответа берётся `sandbox.id`.
   - `get_screenshot(fileKey="twL50t4GFELOKpEwFWSvwW", nodeId=sandbox.id)` → видим результат.
   - Проверяем 4 бинарных флага:
     - `hasErrors` — красные плашки.
     - `hasEmptyRenders` — пустые / чёрные ноды.
     - `gridComplete` — все инстансы в сетке отрисованы (не для ABSOLUTE — там null).
     - `hasPlaceholders` — на дефолте остался `12:6` placeholder ИЛИ при флипе boolean'а его owned-slot не заполнился. Источник: `visiblePlaceholders` + `booleanMatrix[].ownedExposed`. Вычисляется в `parseProps-apply-figma.js`.
   - Если `hasErrors=true` или `hasEmptyRenders=true` → `verdict=visualFail`, идём в Classifier.
   - `hasPlaceholders=true` — не обязательно фейл: например meshok ↑ имеет always-on slot navbar, который дизайнер обязан заполнить. Но это сигнал hypothesize'у — обсудить с Настей политику (обязательный fill / alwaysOn для boolean / другой default).
   - **Completeness-чеклист** (после apply): `node tests/scripts/parseProps-completeness.js --slug <slug> --result-file <microtest json>` → выводит 5–6 строк: nested linkage, preferred coverage, depth reachability, text reachability, fill budget, и — для компонентов с sourceLib — **sourceLib swap** (фаза 5c). Это runtime-репорт полноты теста (дошёл ли он до глубины, нет ли дыр в правиле), **НЕ инвариант** — не блокирует `approved`, `pass:false` не роняет процесс. Linkage переиспользует `findExpectedRuleRef` (тот же резолвер, что Inv9), depth читает `ownedExposed`/`ownedFilled`/`reachedTextNodes` из `booleanMatrix`. Если `[⚠] sourceLib swap ... no sampleKey` → см. «sourceLib — self-filling sampleKey» ниже.
5. **Cleanup:** `heal-cleanup-sandbox.js` → `use_figma` → удаляет `__heal_sandbox__` фрейм.
6. Применяем результат: `node tests/scripts/parseProps-apply-figma.js "<X>" --result='<json>'`
   - Пишет `slots` / `booleans` в `<slug>.rule.json`
   - Пишет `autoPairs` / `bindings` / `lastMicrotest` в `<slug>.raw.json`
   - **autoPairs filter**: записываются только пары, чей boolean-ключ есть в `inspected-props.defs` — вложенные (nested) пропы из дерева не попадают в rule. Ожидаемый `booleansWritten` = число BOOLEAN-пропов в inspected-props.

Плагин-код внутри одного блока:
1. `importComponentByKeyAsync(key)` — один раз.
2. Для каждого варианта (1 для default, ≤12 для matrix):
   - `createInstance()` в sandbox-фрейме
   - `setProperties(variantSet)` для component_set
   - Собирает 9 ассертов: `instanceCreated`, `variantApplied`, `defaultsAcceptable`, `swapsResolve`, `noPlaceholderText`, `boundsNonZero`, `hasChildren`, `textMutable`, `swapMutable`, `variantMutable`, `visualDiff`
3. **Phase 5a — bindings graph**: walk дерева default-instance, читаем `node.componentPropertyReferences`. Возвращается в `out.autoPairs` и `out.bindings`.
4. **Phase 5b — boolean-matrix**: для каждого BOOLEAN — fresh instance с `!defaultValue`. Все instance остаются в sandbox grid → один `get_screenshot` покрывает baseline + N booleans.
5. Sandbox **не удаляется** — возвращается `{ sandbox: { id, name } }` для visual check.

Возвращает агрегат:
- `summary.passed === summary.total` **и** визуальный чек прошёл → шаг 4 (Full matrix)
- `failedAsserts` или `visualFail` → шаг 3 (Classifier)
- `error` → `verdict=stuck`

Стоимость — один MCP-вызов use_figma (≈3000 токенов default, ≈6000 matrix) + один get_screenshot (≈2–5к) + один cleanup use_figma (≈300 токенов).

### Шаг 3 — Classifier + template patch

| `fail:<class>` | Patch template | Файл |
|---|---|---|
| `swapNotResolved` | `requiredSwap` template + preferred[0] | `.rule.json` |
| `placeholderText` | `textPaths` template | `.rule.json` |
| `variantMissing` | Таблица variant через `search_design_system` + Plugin API (live Figma) | `.rule.json` |
| `preferredOutsideRegistry` | Запись через `/syncKeys --scoped` | aux registry |
| `propNameMismatch` | Нормализация `prop#id` → `prop` | `.rule.json` |
| `layoutAbsolute` | `layoutRules: { layoutPositioning, anchoredTo, resizePattern }` | `.rule.json` |

Если класс не в таблице → `verdict=needs_human`.

После патча:
1. **V-AFTER-EDIT**: проверить, что поле записалось в файл.
2. **Self-regression**: microtest на 5 случайных компонентах из кэша baseline.
3. Повторный microtest на `<X>`. Если `pass` → шаг 4. Если `fail` снова → следующая итерация (N=5).

### Шаг 4 — Full matrix (только при pass на дефолте)

Гоняет microtest на всех вариантах (потолок 12). Один MCP-вызов, батч.

### Шаг 4.5 — Preferred discovery (только если `preferred[]` пустой или кандидаты не найдены)

После microtest apply — для каждого INSTANCE_SWAP слота, у которого `preferred[]` пустой или кандидаты не найдены:

1. **Найти дефолтный компонент** из `booleanMatrix[].ownedFilled` (componentId) или из `result.autoPairs` ownedSwap. Это даёт NODE ID, не component key.

2. **Обнаружить семейство через use_figma**: создать инстанс компонента, включить boolean слота, прочитать тип дефолтного компонента в слоте. Или использовать `search_design_system(query="<слово из имени слота>")` → фильтровать по lib компонента.

3. **Записать кандидатов** в `rule.slots[slot].preferred[]`:
   ```json
   { "name": "delete @ buttonInline", "key": "bf06c000...", "validated": true, "usage": "" }
   ```
   `isDefault: true` — у компонента, чей ключ совпадает с дефолтным значением из Figma.

4. **Спросить Настю usage** через `AskUserQuestion`:
   - Вопрос: "Когда ставить [A] vs [B] vs [C] в слот `<slot name>`?"
   - Options: каждый кандидат — отдельный вариант
   - Если только 1 кандидат → `usage` не нужен, пропустить вопрос

**Правило autoPairs filter:** `apply-figma` теперь записывает в rule ТОЛЬКО те autoPairs, чей boolean-ключ присутствует в `inspected-props.defs` компонента. Вложенные пропы (← iconLeft, float, addons из внутренних компонентов) автоматически отфильтровываются. Проверяй результат apply: `booleansWritten` должен равняться числу BOOLEAN-пропов в inspected-props.

### Шаг 4.6 — Nested queue (ОБЯЗАТЕЛЬНЫЙ, независимо от Шага 4.5)

Выполняется **всегда** после apply — даже если Шаг 4.5 не запускался (preferred[] уже был заполнен до прогона). Именно это был корень #317: вложенные компоненты имели ключи в preferred[], но Шаг 4.5 пропускался как «ненужный», а с ним и вопрос про вложенные.

**Собери полный список nested-кандидатов:**
- validated preferred у каждого INSTANCE_SWAP-слота (включая уже заполненные);
- дочерние компоненты intermediate-пресетов (`28 ◇ buttonsView`, `2 ◇ buttonsCircleView` и т.п. — их `quantity/row/swap`-пропы, #297);
- BOOLEAN-управляемые nested instances (#292) и статические дети (`01..0N`, #300).

Для каждого кандидата: есть ли `rules/components/<slug>.rule.json`? Если нет → помечай «без rule-файла» в списке опций.

`AskUserQuestion`, multiSelect: «Какие из этих вложенных надо парсить глубже (у них есть свои пропы/слоты), а какие оставить как есть (атом — менять нечего)?». Опции: каждый нестед-кандидат (с пометкой «⚠ нет rule» если нет файла) + «Все — атомы, глубже не идём».

**Никогда не решай за Настю «это атом» молча** — даже если у нестеда на первый взгляд нет пропов, спроси (ровно этот пропуск породил #292/#297).

**Формируем очередь (`_nestedQueue[]`):**
1. Для выбранных «парсить глубже» → создай stub через `--close-nested` (если нет rule-файла), добавь в in-memory FIFO `_nestedQueue[]`.
2. Зафиксируй ответ в `nestedProps.policy` родительского правила — не переспрашивать на повторных прогонах.

Авто-переход к следующему из очереди происходит из **Шага 7** (после финального чеклиста) — не здесь. Сейчас продолжай Шаги 5–7 для **текущего** компонента.

### Шаг 5 — Hypothesize (ОБЯЗАТЕЛЬНЫЙ)

Заполняет TODO в правилах. Запускается после прохождения microtest.

> 🔴 **Этот шаг нельзя пропускать.** Каждый INSTANCE_SWAP-slot с ≥ 2 валидных preferred
> **обязан** иметь `usage` на КАЖДОМ preferred entry. Без `usage` Builder выбирает первый preferred.
>
> **Гейт:** `approved` не может стать `true`, пока `slots.<slot>.preferred[i].usage` пуст
> хотя бы у одного валидированного entry. Скрипт `parseProps-preflight.js` проверяет
> `flags.missingPreferredUsage` и `flags.missingComponentDescription`.

> 🚫 **Агент НИКОГДА не записывает ответы единолично.** Черновик AI готовится как подсказка
> в `options.description`, но **обязательно** подтверждается Настей через `AskUserQuestion`.

**Шаг 5.1 — Сгенерировать вопросы:**

```bash
node tests/scripts/parseProps-hypothesize.js "<X>"
```

Выводит JSON со списком вопросов **пяти** типов:
- `kind: "componentDescription"` — всегда для новых правил с `doc.whenToUse = "TODO"`. Спрашивает о роли компонента в дизайн-системе, типичных экранах.
- `kind: "preferredUsage"` — для slot'а с ≥ 1 non-broken preferred без `usage`. Содержит `candidates[]`. Ответ-`usage` → `validated:true`; пустой → `broken:true`. **Если после применения ровно 1 validated в слоте → auto-set `isDefault:true`** (детерминированно, без отдельного вопроса).
- `kind: "preferredDefault"` — для slot'а с ≥ 2 validated preferred без `isDefault`. Настя выбирает один как дефолт.
- `kind: "booleanSemantics"` — для BOOLEAN без `whenOn`/`whenOff`. Содержит `pairedSlot`, `defaultOn`.
- `kind: "alwaysOnBoolean"` — для BOOLEAN с `defaultOn=true` когда microtest показал `value=false` оставляет slot placeholder'ом. Подсказывает `alwaysOn=true` + `builderRule`.

**Шаг 5.2 — Спросить Настю через AskUserQuestion:**

Для `componentDescription` — одна реплика с options:
- "Сгенерировать черновик" (AI предлагает 1-2 предложения на основе имени + tier)
- "Пропустить" (заполнить вручную позже)

Для `preferredUsage` — multi-select по кандидатам.
Для `booleanSemantics` — два options: `whenOn`-вариант и `whenOff`-вариант (+ `Other`).

**Шаг 5.3 — Применить ответы:**

```bash
node tests/scripts/parseProps-hypothesize.js "<X>" --apply='{
  "componentDescription": "Контейнер нижней части экрана...",
  "preferredUsage": { "<slot>": { "<key>": "когда используется ..." } },
  "booleanSemantics": { "<prop>": { "whenOn": "...", "whenOff": "..." } },
  "alwaysOnBoolean": { "<prop>": { "alwaysOn": true, "builderRule": "Не передавай false. Если ..." } }
}'
```

Запись в `.rule.json`:
- `doc.whenToUse` — описание компонента
- `slots.<slot>.preferred[i].usage` — описание варианта
- `booleans.<prop>.whenOn` / `whenOff`
- `booleans.<prop>.alwaysOn` (bool) + `builderRule` (string)
- `_hypothesizeAppliedAt` — timestamp

После apply: `approved` остаётся `false`. Поднимается на `true` отдельной командой Насти.

> ⚠️ **Любой флип `approved` (одиночный или batch) ОБЯЗАН сопровождаться регенерацией индекса** (#315).
> `registry/index.json` хранит `approved` 5-м элементом tuple — после ручного флипа он устаревает,
> и `verify-index-drift.sh` валит CI. `/parseProps apply` делает это сам, но **ручной batch-approve
> (правка `approved` напрямую в N файлах) — нет**. После такого флипа всегда:
> ```bash
> npm run reindex          # = node tests/scripts/parseProps-utils.js gen-index
> git add rules/components/ registry/index.json && git commit
> ```
> Проверить перед пушем: `bash tools/verify-index-drift.sh` (exit 0). Гард печатает категорию
> расхождения — «только approved-флаги» значит ровно этот пропущенный шаг.

### Шаг 6 — Validate + лог + коммит

```bash
node tests/scripts/parseProps-utils.js validate <slug>
```

**Инварианты (schema + 12 проверок):**

| # | Что | Уровень |
|---|---|---|
| 1 | `slots[X].pairedBoolean === Y` ⟺ `booleans[Y].pairedSlot === X` | error |
| 2 | Все `key` есть в `registry/index.json` | error |
| 3 | `nestedProps.ruleRef` указывает на существующий `.rule.json` | warning (forward-refs OK) |
| 4 | Каждый non-broken preferred в каждом слоте имеет непустой `usage` (зеркало R-049, тот же scope/placeholder-набор) | error при approved=true, stderr-warning при WIP |
| 5 | `alwaysOn=true` ⟹ `builderRule` непустой | error |
| 6 | `layoutRules.padding*/itemSpacing` без `paddingOverrideReason` | error |
| 7 | `sourceLib` и `preferred[]` — взаимоисключающие | error |
| 8 | Слот с `validated≥1` имеет ровно 1 `isDefault: true` | error при approved, warning при WIP |
| 9 | validated preferred с `name` соответствующим существующему rule slug имеет `nestedProps.ruleRef` | error при approved, warning при WIP |
| 10 | broken-key c одинаковым `key` имеет одинаковый `name` во всех файлах | error при approved, warning при WIP |
| 11 | sibling-trio/pair consistency (`<size>-{custom,primary,primaryOnColor}-content`, `*-tag`, `chipchoice*`) — идентичная структура | warning только (DS drifts существуют) |
| 12 | gap-family sync между `custom-contentsview.preferred[]` (источник) и `ARCHITECTURE.md` / `builder.md` (зеркала) | warning только |

Inv8 — гарантия что Builder при свапе выберет конкретный preferred, а не упадёт на placeholder. Auto-set в hypothesize (для =1) + `preferredDefault` вопрос (для ≥2).

Inv11 — ловит структурные drift'ы между siblings (например, `27b-primary-content` ↔ `27b-custom-content`). Сейчас warning-only: некоторые drift'ы реально живут в Figma DS (см. issue #119 для chipChoice variant naming). После очистки DS — апгрейд до error при approved.

Inv12 — single-source-of-truth для канонического списка `gapTextVertical X-Y` пар: `custom-contentsview.rule.json`. ARCHITECTURE.md и builder.md — зеркала; sync-check ловит drift на CI. Для отдельного смока нужно сначала добавить валидный 40-символьный hex key (иначе schema-error блокирует валидацию до выполнения инварианта).

Append в `tests/heal-log.jsonl`:
```json
{"ts":"...","component":"X","slug":"x","iterations":3,"verdict":"fixed","patchClass":"swapNotResolved","tokens":4200}
```

В `--dry` коммита нет. Иначе:
```bash
git add rules/components/<slug>.rule.json rules/components/<slug>.raw.json
git commit -m "parseProps: <slug> · <verdict>"
git push -u origin claude/review-parseprops-generation-AhYbs
```

### Шаг 7 — Финальный чеклист (ОБЯЗАТЕЛЬНЫЙ вывод, R-052 / #293)

После validate+commit **всегда** выведи Насте короткий человекочитаемый чеклист итога прогона — это deliverable, не опциональный лог. Команда:

```bash
node tests/scripts/parseProps-completeness.js --slug <slug> --final
# если был microtest — добавь --result-file <path>: тогда сверху ляжет depth-репорт, снизу чеклист
```

`--final` работает и без microtest-результата (rule-derived: verdict, isDefault, usage coverage, ruleRef closure, schema-статус через `validate`, approved, next-step). Формат (6–9 строк):

```
✅ /parseProps <X> — <verdict>
• Механика: <N> preferred, <M> variants, <K> booleans (переснято из Figma)
• isDefault: <slot → preset> | ⚠️ нет (если inv8)
• ruleRef closure: <N>/<N> nested слинковано | ⚠️ <список несвязанных>
• Nested queue: <N> в очереди → <имена> | пустая (все атомы)
• usage coverage: <N>/<N> validated preferred заполнены
• Schema/инварианты: ✅ чисто | ❌ <список>
• approved: false (поднимет Настя) | true
• Следующий шаг: <что осталось — закрыть nested X, заполнить usage Y, или ничего>
```

Если чего-то не хватает (незалинкованный nested, пустой usage, нет isDefault) — строка с ⚠️ и явным «что доделать». Чеклист выводится и при `--dry`. Не подменяй его фразой «готово» — Настя должна видеть состояние закрытия компонента по пунктам.

**Авто-переход из `_nestedQueue[]` (если очередь не пуста):**

После вывода чеклиста — **немедленно** бери следующий из `_nestedQueue[]` и запускай Шаг 0 для него. Не ждать новой команды.

**Когда стопать:** очередь пуста | Настя написала «стоп» / «потом» / «достаточно» | встречен компонент уже обработанный в сессии (цикл) | оставшийся бюджет < 25k токенов (минимум на один прогон — не путать с суммарным лимитом 100k) | дочерний компонент завершился с `verdict=stuck` или `overbudget` → стоп с предупреждением, не продолжать молча.

`_nestedQueue[]` не персистируется: очередь живёт только в текущей сессии. При перезапуске — запускай `/parseProps <child>` вручную для каждого из ⚠-строк в чеклисте.

## Nested-closure — авто-создание правил вложенных компонентов (`--close-nested`)

Когда у компонента есть validated preferred, чей компонент **не имеет rule-файла** (вариант внутри сета, не зарегистрированный в реестре), `/parseProps` может сам создать стаб и слинковать ruleRef — чтобы компонент стал полностью закрытым со всеми нестедами. По умолчанию **выключено** (создание N файлов — мутация многих файлов); включается флагом `--close-nested`.

**Зачем:** Phase 0-практика показала 137 незалинкованных нестед-кандидатов в DS. Раньше каждый закрывался вручную (создать rule → genIndex → слинковать). Теперь — авто.

**Как работает (microtest → apply):**
1. **Селектор** (`nestedDiscoveryTargets`, Node-сторона microtest): validated non-broken preferred без `ruleRef` И без резолва через `findExpectedRuleRef` → кандидат. Только при `--close-nested`, иначе `NESTED_DISCOVERY: []`.
2. **Phase 6** (Figma, microtest): импортит ключ кандидата → определяет `type` (COMPONENT→`c`, вариант COMPONENT_SET→`s`), `setKey`, `setName`, `ruleKey` (для сета — ключ дефолт-варианта). `type` надёжен из Figma. Cap 20 за прогон. Возвращает `out.nestedDiscovery[]`.
3. **createNestedStubs** (apply, при `--close-nested`): для каждого кандидата без файла создаёт WIP-стаб (`approved:false`). **Дедуп по `ruleKey`**: варианты одного сета («2 ◇ tabsViewBase», «3 ◇...») → ОДИН стаб (slug по `setName`). **lib-эвристика** (`resolveLibForStub`): соседи того же name-семейства (trailing-token: `*content` → их lib); единодушны → `verified`, иначе parent lib + пометка `[lib не подтверждён — /syncKeys]`. `importComponentByKeyAsync` использует **key**, не lib → best-effort lib безопасен.
4. **Прямая линковка**: `parent preferred.key → stub slug` детерминированно (ловит вариант-именованные preferred, которые `findExpectedRuleRef` по имени не свяжет). Затем `genIndex` регистрирует новые стабы.

**Гарантии:**
- **1 уровень за прогон.** Стабы `approved:false` подхватятся СВОИМ `/parseProps <child> --close-nested` — транзитивное замыкание между вызовами, не внутри (bounded, reviewable).
- **Идемпотентно:** селектор пропускает залинкованные; createNestedStubs пропускает существующие файлы; линковка only-if-`undefined`.
- **Не блокирует родителя:** незаполненный нестед (`approved:false`) не флипает `approved` родителя; Inv4/8/9 — approval-gated (warning при WIP).

**Вывод apply:** `nestedStubsCreated[]`, `nestedLibUnverified[]` (требуют /syncKeys-сверки lib), `ruleRefsAdded`.

**Вызов:**
```bash
node tests/scripts/parseProps-microtest.js "<X>" --close-nested   # codegen с Phase 6
# (use_figma → result)
node tests/scripts/parseProps-apply-figma.js "<X>" --result-file=<json> --close-nested
```

## Бюджеты и watchdog

- На один heal: лимит 25 000 токенов. При превышении → `verdict=overbudget`, никаких коммитов.
- Если `noProps` + `noRule` + `missingPreferred` все сразу → бюджет 40 000.
- Лимит итераций (default 5) — если все 5 не дали `pass` → `verdict=stuck`.

## Файлы, которые parseProps трогает

| Файл | Когда |
|---|---|
| `rules/components/<slug>.rule.json` | stub, microtest apply, hypothesize, patches |
| `rules/components/<slug>.raw.json` | после каждого microtest (bindings, autoPairs, visualCheck) |
| `tests/heal-log.jsonl` | append одна строка |

Не трогает: `registry/index.json` (только чтение), `tests/metrics.jsonl` (только `/test` пишет).

## sourceLib — слоты с библиотечным контентом

Когда INSTANCE_SWAP-слот тянет контент из библиотечного фрейма Figma (иконки, иллюстрации — 50–200+ компонентов), используется поле `sourceLib` вместо заполнения `preferred[]`.

```json
"slots": {
  "✎ icon [ 24+ ]#15407:24": {
    "sourceLib": {
      "figmaFile": "DZgo2qYfDc27VWIJ2gcz1Sap",
      "nodeId": "18043:3043",
      "hint": "icon"
    },
    "preferred": []
  }
}
```

**Builder при наличии `sourceLib`:** вызывает `get_design_context(figmaFile, nodeId)` или `search_design_system(hint)` вместо перебора preferred[].

**preferred[] при sourceLib:** намеренно пустой — не заполнять ключами.

**Когда ставить:** >15 preferred-кандидатов из одного библиотечного фрейма, регулярно пополняется.

**Текущие компоненты с sourceLib:** `iconglyph` (3 слота), `badge` (4 слота).

### sourceLib — self-filling sampleKey (icon-discovery workflow)

`parseProps` автоматически обнаруживает sample-ключ для каждого sourceLib-слота при первом прогоне и кэширует его в `slot.sourceLib.sampleKey`. Последующие прогоны используют кэш.

**Алгоритм (агент выполняет один раз на каждый unsampled слот):**

1. Completeness показывает `[⚠] sourceLib swap N/N no sampleKey (hints: icon _24, ...)`.
2. Для каждого hint из списка: вызови `search_design_system("<hint>")`.
3. Из результатов отфильтруй по size-суффиксу из hint: `_12` / `_16_20` / `_24` (или аналог).
4. Возьми первое имя по алфавиту → скопируй его ключ (40-hex).
5. Запиши ключ в rule:
   ```bash
   node tests/scripts/parseProps-apply-figma.js "<X>" --sourcelib-keys='{"<slotKey>": "<hex40>"}'
   ```
   Повтори для каждого неsampled слота. `--sourcelib-keys` принимает объект с несколькими ключами.
6. Повторно запусти `/parseProps <X>` — фаза 5c свапнет sample-иконку в probe-инстанс.
7. Completeness покажет `[✓] sourceLib swap N/N swapped`.

**Гарантии (only-if-null):** `--sourcelib-keys` не перезаписывает уже установленный `sampleKey` — курированные ключи защищены.

**Структура `sampleKey` в rule:**
```json
"✎ icon [ 24+ ]#15407:24": {
  "sourceLib": {
    "figmaFile": "DZgo2qYfDc27VWIJ2gcz1Sap",
    "nodeId": "34303:84177",
    "hint": "icon _24",
    "sampleKey": "24456ddc7363ddd525fac2cfe39682406bafff3f",
    "sampleKeyResolvedAt": "2026-05-27T10:00:00.000Z"
  },
  "preferred": []
}
```

**Microtest icon-swap** работает на двух уровнях:
- **Собственные sourceLib-слоты** компонента (как у iconGlyph) — свапаются напрямую.
- **Вложенные/forwarded** иконки (iconGlyph внутри inputText, search, кнопок) — `microtest` строит ГЛОБАЛЬНУЮ merged-карту `SOURCELIB_KEYS` (собственные слоты ∪ sourceLib всех вложенных правил по `collectNestedRules`). `sampleKey` хранится только в iconGlyph (single-source). Функция `swapSourceLibIcons` обходит ВСЁ поддерево инстанса и свапает иконку на том вложенном INSTANCE, который реально владеет слотом (слот-иконки не форвардятся на верхний уровень — живут как `componentProperties` вложенных iconGlyph). Свап без isPlaceholder-гейта (sourceLib держит дефолтную иконку, не 12:6). Вызывается в boolean-matrix (каждый инстанс) и в probe-инстансе. Результат — `result.sourceLibProbe.swapped[]` / `.failed[]` + per-boolean `textReport.sourceLibSwapped[]`.

Чтобы вложенные иконки свапались, у inputText/search и т.п. достаточно, чтобы `collectNestedRules` дошёл до iconGlyph (через любой `nestedProps.ruleRef: "iconglyph"` в preferred — даже `validated:false`). Сам ключ дублировать в родительские правила НЕ нужно.
