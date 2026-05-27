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
1. **Кэш в сессии**. `registry/index.json` (derived cache из rules) и `rules/components/<slug>.rule.json` — читаются **один раз** в начале сессии. После apply `registry/index.json` авто-регенерируется из rules — никаких ручных шагов.
2. **Default-variant first**. Microtest гонит только дефолт-вариант. Полная матрица — только после прохождения дефолта.
3. **Stage gate**. Каждый sub-skill вызывается **только если** локальные данные отсутствуют. Pre-flight сам решает.
4. **Template patches**. 80% починок — применение шаблона из классификатора. AI-генерация — только для гипотез.
5. **Single Figma MCP per heal**. Если для починки нужен Figma — батчим всё в один вызов.
6. **Hypothesize только при тупике**. Если template-patch закрыл проблему — гипотезы не нужны.
7. **Verifier на чекпойнтах**. V-CHECKPOINT каждые 10 итераций sweep'а, не после каждой.

Ожидаемый бюджет на один heal (компонент с данными, простой патч): **~3 000 токенов**. Сложный случай с Figma MCP и hypothesize: **~15 000**. Лимит — 25 000, иначе `verdict=overbudget`.

## Вызов

```
/parseProps <componentName>                # одна петля по одному компоненту
/parseProps <componentName> --hypothesize  # форсированно фаза гипотез (даже если данные есть)
/parseProps <componentName> --dry          # без коммитов, только отчёт
```

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
| 4 | `approved=true` ⟹ всем validated при `validated≥2` нужен `usage` | error при approved |
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
