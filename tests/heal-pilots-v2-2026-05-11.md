# Heal pilots v2 — pair-aware + mutability + visual diff · 2026-05-11

Перепрогон после правок: throw-pattern, NONE sandbox для ABSOLUTE, pair-aware (с `pairedGroups`), rootName regex с обработкой ✏️/✎ + variation selectors, fix `setProperties` syntax для INSTANCE_SWAP (`target.id` напрямую, не `{type,value}`), мутабельность, PNG visual diff.

Все микротесты теперь идут через `/test --micro <X>` — единая реализация для Насти и оркестратора `/heal`.

## meshok ↓ (v2 retry)

**До фикса rootName regex:** все 3 placeholder INSTANCE_SWAP флагались как visible (`✏️ float / toast`, `✏️ systemComponent`, `✏️ buttonsView`) — pair-логика не сшила их с boolean-партнёрами из-за неотлавливаемых variation selectors.

**После фикса regex** (strip leading non-word chars):
```
✏️ float / toast#1868:1     INSTANCE_SWAP "12:6"  →  paired with float / toast#1868:0 = false  →  HIDDEN ✅
✏️ systemComponent#1073:2   INSTANCE_SWAP "12:6"  →  paired with systemComponent#2273:0 = true  →  VISIBLE ❌
✏️ buttonsView#1073:1       INSTANCE_SWAP "12:6"  →  paired with buttonsView#1074:0 = false   →  HIDDEN ✅
```

**Только 1 настоящий placeholder** (`✏️ systemComponent`). Pair-логика работает корректно.

**Stale data:** inspected-props для meshok ↓ имеет `systemComponent#7626:0`, реальное имя — `systemComponent#2273:0`. Сразу 7 пропов с разными ID. `dataStatus` помечен `stale`, нужно `/syncKeys --rescan --component='meshok ↓'`.

## switch 1.0 (mutability + visual diff)

```
bounds: 52×32 ✅
hasChildren: true ✅
selectedMutable: true → true ✅ (PNG 894 → 1314, visualDiff ✅)
sizeMutable: 32 → 32 ✅ (но visualDiff=false — registry хранит variant key с size уже =32!)
stateMutable: interactive → disabled ✅ (PNG 1314 → 1272, visualDiff ✅)
```

**Чистый pass.** Heal verdict: `pass`. Stub-правило `rules/components/switch.md` сгенерировано через `heal-rules-stub.js`. `nastya_approved: false` до апрува гипотез.

**Находка:** registry для `type='s'` хранит specific variant key, не canonical default. У switch это `selected=false, size=32, style=primary, state=interactive`. Это значит `inspected-props.defaultValue` (size=24) расходится с реальным стартовым состоянием инстанса (size=32). Не баг, но нужно учитывать в microtest при выборе target для variant flip.

## button 1.1 (pairedGroups)

**До добавления pairedGroups:** false-positive `defaultsAcceptable: false` (5 placeholders флагались, хотя все скрыты boolean'ом `addons=false`).

**После добавления `pairedGroups` в `_index.json`:**
```json
"pairedGroups": [
  { "master": "addons#3319:980", "slots": ["✎ addons [ 28 ]...", "✎ addons [ 36 ]...", "✎ addons [ 44 ]...", "✎ addons [ 56 ]..."] }
]
```

**Результат:**
```
defaultsAcceptable: true ✅  (0 visible, 5 hidden — все правильно идентифицированы)
hiddenPlaceholdersCount: 5
  - ✎ addons [28/36/44/56] → master addons=false → HIDDEN
  - ✎ float → master float=false → HIDDEN

textMutable: true ✅  (label: "Что сделать" → "HEAL_TEST_X")
bounds: 100×28 ✅
hasChildren: true ✅
visualDiff: true ✅  (PNG 631 → 715 после text override)
```

**Чистый pass на default variant.** Heal verdict: `pass`.

## Архитектурный вывод

`/test --micro <X>` — общая реализация, heal зовёт через sub-skill. Это решает:
- Один источник правды для микро-тестов (нет дублирования логики)
- Настя может вручную дебагать компонент: `/test --micro meshok ↓`
- `/healSweep` батчит вызовы `/test --micro` на каждом компоненте scope'а
- Стоимость одного микро-теста ≈ 3-5k токенов (в спеке heal: бюджет 25k/компонент)

## Сводка по 6 пилотам (включая v2 retry)

| Пилот | Дата | Verdict | Real find |
|---|---|---|---|
| meshok ↓ | v1 | autofix (false +) | Sandbox AUTO ломает layoutSizingOk; later: stale data |
| navbar 1.0 | v1 | scopedSync confirmed | middle slot имеет '12:6' default |
| chipsView | v1 | preflight skipped microtest | scopedSync без MCP |
| switch 1.0 | v1+v2 | pass | resolveProps → stubRule → md generated |
| button 1.1 | v1 (false+) | pass после fix | pairedGroups schema нужно |
| meshok ↓ | v2 | autofix (real) | только systemComponent placeholder, остальные hidden |

**Tokens:** 7 use_figma calls, ~26k токенов на 6 пилотов (бюджет 150k).

## Что ещё нашли по ходу

1. **throw-pattern** — `console.log` из use_figma не возвращается, throw — единственный канал
2. **NONE sandbox** для ABSOLUTE-компонентов — иначе AUTO-родитель ломает layoutPositioning ребёнка
3. **setProperties для INSTANCE_SWAP** — голый `target.id`, не объект `{type, value}` (объект — это формат READ из componentProperties)
4. **rootName regex** — `^[\W_]+` или класс non-word, иначе variation selectors после ✏️/✎ остаются
5. **pairedGroups** для one-to-many — `_index.json` теперь поддерживает
6. **dataStatus: stale** — реальные prop ID могут расходиться с inspected-props, нужен `/syncKeys --rescan --component=X`
7. **registry хранит variant key** для `type='s'`, не canonical default — `defaultValue` из inspected-props ≠ стартовое состояние инстанса
