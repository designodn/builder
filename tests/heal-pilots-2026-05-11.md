# Heal pilots — first end-to-end run · 2026-05-11

Первый прогон всей цепочки `preflight → microtest (use_figma) → classify → patch → re-preflight` на 4 пилотах. Цель — проверить спеку `.claude/commands/heal.md` на реальных данных.

## Pre-flight на старте (153 компонента)

| Decision | Кол-во |
|---|---|
| fullBootstrap | 110 |
| resolveProps | 27 |
| patchIndex | 12 |
| scopedSync | 4 |

Все 153 классифицированы локально, **0 Figma MCP-вызовов**.

## Пилот 1: `meshok ↓` (layout)

**Pre-flight:** decision=`scopedSync` (свежеспаршенные preferred keys не в основном реестре)

**Microtest (1 use_figma):**
```json
{
  "asserts": {
    "instanceCreated": true, "variantApplied": true,
    "defaultsAcceptable": false, "swapsResolve": true,
    "textPathsResolve": true, "noPlaceholderText": true,
    "layoutSizingOk": false
  },
  "failedAsserts": {"defaultsAcceptable": 1, "layoutSizingOk": 1}
}
```

**Classify:** verdict=`autofix`, патчи=[`layoutMismatch`, `defaultPlaceholder`]

**Patch applied:** оба патча записались в `_index.json`:
- `layoutRules.layoutPositioning=ABSOLUTE`
- `requiredSwap.preferredKey=aa40b8b95980f6406a8604dbfebb660aa8ea1bbf` для `✏️ buttonsView#1073:1`

**Найденный баг в спеке microtest'а:** sandbox-фрейм сейчас создаётся с `layoutMode=VERTICAL` (AUTO). Внутри AUTO-родителя `layoutPositioning` ребёнка не может быть ABSOLUTE — это ограничение Figma. Поэтому assert `layoutSizingOk` для ABSOLUTE-компонентов **всегда** будет false в текущем sandbox. **Фикс:** для компонентов с `layoutRules.layoutPositioning=ABSOLUTE` создавать sandbox с `layoutMode='NONE'`. Записано как TODO в heal-microtest.js.

## Пилот 2: `navbar 1.0` (conditional + paired)

**Pre-flight:** decision=`scopedSync`

**Microtest:**
```json
{
  "asserts": {"defaultsAcceptable": false, ...rest_ok},
  "issues": ["placeholderDefaults:✎ · middle ·#1031:6,✎ right ->#1031:3"],
  "textSamples": ["label=Что сделать", "🤡=🤡", ...]
}
```

**Находки:**
- `✎ · middle ·#1031:6` (центральный слот навбара) и `✎ right ->#1031:3` (правый слот) имеют дефолт `'12:6'` (placeholder). Это и есть `registryGap`: preferred keys для middle описаны в правиле, но в основном реестре их нет → нужен `/syncKeys --scoped --page=navbar`.
- Текст `"Что сделать"` — реальное содержимое default-варианта, не placeholder. Список `PLACEHOLDERS` в microtest корректно отличил.

## Пилот 3: `chipsView 1.0 ❖ view` (registryGap)

**Pre-flight:** decision=`scopedSync`, 1 missing preferred (`swap#7472:0`)

Не запускал microtest — pre-flight уже сказал, что нужен scoped sync, и Figma MCP вызов на microtest без resolved preferred key даст predictable fail на `swapsResolve`. Стоимость экономлена.

## Пилот 4: `switch 1.0` (undocumented)

**Pre-flight (старт):** decision=`resolveProps` (noProps + noRule)

**Resolve via use_figma (один вызов):**
```
type: COMPONENT_SET (через main.parent)
setKey: 473ffceb8f0c2950a08e5613e72163fdea859bc4  ← отличается от registry key
variants: selected, size, style, state
booleans: interactArea#12628:66
INSTANCE_SWAP: нет
```

**Tier:** `simple-atom` — никаких swap-слотов, чистый атомарный toggle.

**Patches applied:**
- `inspected-props.json` ← полная запись для `switch 1.0`
- `_index.json` ← entry с variants, tier, setKey, `nastya_approved: false`

**Pre-flight (после):** decision=`stubRule` — пропы есть, но нет файла правил. Следующий шаг — `/rulesEnrich --stub 'switch 1.0'` + `--hypothesize` для гипотез по variants.

**Обнаруженное расхождение:** в `registry/index.json` ключ для `switch 1.0` — это ключ одного variant'а (`fb7bd9e851ac...`), а реальный setKey совсем другой (`473ffceb8f0c...`). Builder через `importComponentByKeyAsync(variantKey)` получит COMPONENT, не COMPONENT_SET. Это нужно отдельно расследовать (видимо общая проблема для всех `type=s` в реестре).

## Pre-flight после прогона

```
total: 153
summary: { fullBootstrap: 110, resolveProps: 26, patchIndex: 12, scopedSync: 4, stubRule: 1 }
```

Switch перешёл `resolveProps → stubRule`. Метрика отслеживает реальный прогресс.

## Затраты токенов

| Шаг | MCP-вызовов | Оценка токенов |
|---|---|---|
| Pre-flight x 4 | 0 | ~0 (локальные jq) |
| Microtest meshok | 1 | ~3 500 |
| Microtest navbar | 1 | ~3 500 |
| Resolve switch | 1 | ~4 000 |
| Classify x 4 | 0 | ~0 |
| Patch x 4 | 0 | ~0 |
| **Итого** | **3** | **~11 000** |

Бюджет спеки: 25k на компонент, **уложились в 11k на 4 пилота** (≈ 2 750 / компонент).

## Что зафиксировано

1. **End-to-end цепочка работает**: preflight → use_figma → classify → patch → re-preflight.
2. **Throw-pattern** для получения данных из use_figma надёжен (console.log не возвращается). Это нужно закодить в `heal-microtest.js` codegen.
3. **layoutSizingOk assert** ложно срабатывает в AUTO-sandbox — фикс описан выше.
4. **Расхождение setKey vs registry key** для component_set'ов — требует отдельного PR.
5. **heal-log.jsonl** работает, append корректный.

## Пилот 5: `button 1.1` (patchIndex → paired groups)

**Pre-flight:** decision=`patchIndex`, noIndex=true, остальное ок.

**Microtest (1 use_figma, default style=primary,size=28,state=interactive):**
- `defaultsAcceptable: false` — 5 INSTANCE_SWAP'ов с дефолтом `'12:6'`
- Все остальные ассерты ✅
- mainType=`COMPONENT` (подтверждение: registry хранит variant key, не setKey)

**Реальные тексты:** `label="Что сделать"`, `quantity="3"`, никаких placeholder-строк.

**Smart pair-aware retry:** проверка с группировкой по rootName.
- `float` paired корректно: `✎ float#8555:413` ↔ `float#8555:292` → boolean=false → **скрыт, не проблема** ✅
- `addons [ N ]` — НЕ paired эвристикой: один master boolean `addons#3319:980` управляет **четырьмя** slot'ами по размерам (28/36/44/56). Root-name матчинг не сшил их.

**Это новое поле для `_index.json`:** `pairedGroups` для one-to-many паттернов:

```json
"button 1.1": {
  "tier": "multistep",
  "pairedGroups": [
    {
      "master": "addons#3319:980",
      "slots": ["✎ addons [ 28 ]#8612:483", "✎ addons [ 36 ]#8612:604", "✎ addons [ 44 ]#8612:725", "✎ addons [ 56 ]#8612:846"],
      "activeWhen": { "var": "size", "matches": "{N}" }
    },
    { "boolean": "float#8555:292", "swap": "✎ float#8555:413" }
  ]
}
```

Микротест должен использовать `pairedGroups` чтобы:
1. Отметить placeholder невидимым, если master=false
2. Если master=true — проверять только slot, соответствующий текущему variant'у `size` (например `✎ addons [ 28 ]` при `size=28`)

**Vердикт без smart pairing:** `autofix` с `defaultPlaceholder` → ложное срабатывание, патч записал бы requiredSwap, которого здесь быть не должно.

**Pилот 5 показал**: `pairedProps` в спеке покрывает только one-to-one. Для one-to-many нужно расширение схемы. Запишем в TODO до правки `_index.json`.

## Следующие шаги (вне этого PR)

- Фикс `heal-microtest.js` codegen: throw-pattern, NONE-sandbox для ABSOLUTE компонентов.
- **`pairedGroups` в _index.json** (one-to-many паттерны как `button 1.1` addons).
- **Smart placeholder check** в microtest: использовать `pairedProps`/`pairedGroups` для отсева невидимых placeholder'ов.
- `/rulesEnrich --stub` + `--hypothesize` для switch 1.0.
- Расследование setKey vs componentKey в registry.
- Прогон heal на остальных 12 `patchIndex`-компонентах (полностью локально).
