# Component Rules Architecture

## File format

Each component has two files:

| File | Purpose | Who reads |
|---|---|---|
| `<slug>.rule.json` | Hot data: props, slots, booleans, doc | Builder (every call) |
| `<slug>.raw.json` | Cold data: microtest results, bindings, audit | parseProps/debug only |

**Builder never reads `.raw.json`.** It is written by `parseProps-microtest.js` and `parseProps-apply-figma.js`.

## slug convention

`name → slug`:
1. Strip trailing version numbers (` 1.0`, ` 1.1`, ` 2.0`) — part of Figma naming, not identity
2. `↓→down`, `↑→up`
3. `❖`/`◇`/`·`/space/`.` → `-`, collapse consecutive `-`, lowercase ASCII

Semantic markers (direction, tier, variant) are NOT stripped — they are identity:
- `↓`/`↑` — direction (meshok-down vs meshok-up)
- `view` — tier marker (tabsview-view vs tabsview-scrollview)
- `scrollView` — functional variant

At rename time: only update `name` + `key` in the existing `<slug>.rule.json`. File is NOT renamed for minor version bumps (1.0→1.2). Rename the file only for breaking changes that alter slug identity.

Examples:
- `meshok ↓` → `meshok-down`
- `chipsView 1.0 ❖ view` → `chipsview-view`
- `button 1.1` → `button`
- `tabsView 1.1 ❖ view` → `tabsview-view`
- `tabsView scrollView` → `tabsview-scrollview`

## registry/index.json

DERIVED cache — генерируется `node tests/scripts/parseProps-utils.js gen-index` из `rules/components/*.rule.json`. Авто-регенерируется в каждом mutation pipeline (`/parseProps apply`, `/syncKeys apply`, `parseProps-stub.js`). **Никогда не редактировать руками.**

Структура tuple:
```json
{
  "components": { "<name>": ["<lib>", "<key>", "<type>", "<tier>", <approved>] },
  "libraries":  { "<lib>": ["<fileKey>", "<libName>"] }
}
```

Поле `generatedAt` было выпилено: производные кэши не несут build-time метаданных. Дата последней регенерации = `git log -1 --format=%cI registry/index.json`.

- `type`: `"c"` (component) | `"s"` (component_set). Импорт у обоих — `figma.importComponentByKeyAsync(key)`.
- `key`: для `s` — variant-key default'а. Set-keys импорт не принимает; genIndex это гарантирует через `rule.key` (контракт `/parseProps` write).
- `tier`: `"atom"` | `"composite"` | `"view"`. Builder фильтрует `excludeAssemblies` по `tier === "view"`.
- `approved`: boolean из `rule.approved`. Используется `preferApprovedOnly` фильтром.

Builder читает `registry/index.json` один раз на старте сессии; детали конкретного компонента — лениво из `rules/components/<slug>.rule.json`.

Rules с `deprecated: true` НЕ попадают в `index.json` — genIndex их исключает.

## nestedProps — vложенные пропы подкомпонентов

When a composite component has INSTANCE_SWAP slots or booleans that enable sub-instances with their own props, Builder must know which nested props to surface to the designer.

### Case 1: Slot swap with nested props

```json
"slots": {
  "✏️ buttonsView#1073:1": {
    "preferred": [{
      "key": "14248ad0...",
      "validated": true,
      "nestedProps": {
        "policy": "askDesigner",
        "ruleRef": "buttonsviewbottom-view",
        "exposed": {
          "propKey#1073:0": { "ask": true, "default": "value" }
        }
      }
    }]
  }
}
```

After swapping, Builder calls `swappedInstance.setProperties(resolvedExposed)`.

`ruleRef` points to the swapped component's own `.rule.json` slug. When that component gets its own `/parseProps` run, `nestedProps.exposed` is populated automatically.

### Case 2: Boolean enabling a sub-instance with props

Used when a boolean shows/hides a fixed child instance (not swappable) that has its own `componentProperties`.

```json
"booleans": {
  "toast#1868:0": {
    "nestedProps": {
      "policy": "askDesigner",
      "nodeNameHint": "toast",
      "exposed": {
        "preset#10412:0": { "ask": true, "default": "info" }
      }
    }
  }
}
```

Builder passes `nodeNameHint` to the plugin: `parent.findChild(n => n.name === nodeNameHint)` → `child.setProperties(resolvedExposed)`.

### policy semantics

| Value | Builder behaviour |
|---|---|
| `askDesigner` | AskUserQuestion for each `exposed` prop with `ask: true` |
| `locked` | Use `default` only, no questions (protected internals) |
| `useDefault` | Silently set `default`, no questions |

CLI flags `--no-ask-nested` (→ useDefault) and `--lock-nested` (→ locked) are **runtime overrides** — they do not write to the file.

### omit rule

Omit `nestedProps` only when **both** `ruleRef` and `exposed` would be empty — i.e. when the swapped component is not yet in the registry and no exposed props are known. In that case Builder skips the nested-props step entirely.

`ruleRef`-only (without `exposed`) is a valid intermediate state: Builder uses it to navigate to the child rule for size/content/etc. configuration even before per-prop exposure is enumerated. Enforced by Invariant 9 in `tests/scripts/parseProps-utils.js` (approval-gated). After the referenced component gets its own `/parseProps` run, `exposed` is populated via `--refresh-nested`.

## nestedInstances — wrapper composites

Some components (e.g. `floatToNavbar ❖ buttonsView`, `navbar @ Lenta`) wrap a **fixed child instance** that is NOT exposed as an INSTANCE_SWAP slot. The child is hardcoded into the master frame. Without explicit guidance Builder cannot:

1. Discover the child by traversing instance properties (no slot key references it).
2. Know which `.rule.json` describes the child for further configuration.
3. Know what default variant/properties Figma applies on insert.

Top-level field `nestedInstances` solves this. Key = child node name (used by `parent.findChild(name)`); value = a `nestedInstance` block with `policy`, `componentKey` (the set or component key — `importComponentByKeyAsync` handles both), optional `ruleRef`, `defaultProps`, `exposed`, and `note`.

### componentKey semantics

`nestedInstances[*].componentKey` captures the key of the **child instance as it currently exists in the master frame** — typically `instance.mainComponent.key`. For a VARIANT child this is the **variant key** (e.g. `image · circle ◇ avaPicture 1.3`), NOT the set key from `registry/index.json` (which would be the set `avaPicture 1.3`). For a non-variant child component (standalone COMPONENT, not inside a COMPONENT_SET) variant key == component key, so the distinction collapses. The captured value identifies the snapshot state, useful for diff/regression.

**Builder should not rely on this key for fresh imports** — prefer `ruleRef` + the target rule's own `key` field, which points at the set and stays stable across variant renames. Builder navigates the nested child by `name` (via `parent.findChild`), reads `ruleRef` → `.rule.json` to discover authoritative keys/defaults, and applies `defaultProps` via `child.setProperties()`. Direct `importComponentByKeyAsync(componentKey)` works (variant keys resolve), but the imported snapshot may go stale after a Figma rename, whereas `ruleRef` is updated by `/syncKeys`.

`defaultProps` are applied via `child.setProperties(defaultProps)` after `findChild` — keys are Figma property IDs (variant names like `style`, instance-prop IDs like `✎ label#13004:2`).

Example (`floattonavbar-buttonsview.rule.json`):

```json
"nestedInstances": {
  "button 1.1": {
    "policy": "askDesigner",
    "componentKey": "f7677a74a4c3a3c881f934aacaf25e52b9ac4593",
    "ruleRef": "button",
    "defaultProps": {
      "style": "floating",
      "size": "36",
      "✎ label#13004:2": "Что сделать"
    }
  }
}
```

**When to populate:**
- The child is user-facing (label/copy/icon designer might want to change) → `policy: askDesigner`, list overridable props in `exposed`. See `floattonavbar-buttonsview.rule.json` for example with both `defaultProps` and (in follow-up) `exposed`.
- The child is fixed by design system (e.g. `navbar @ Lenta` always says "Опубликовать") → `policy: locked`, only `defaultProps`.
- The child is configurable but Builder should silently pick the default without asking → `policy: useDefault`. Builder applies `defaultProps` and doesn't prompt. Useful when a designer-facing prop exists but a default is always correct.
- The child is pure visual decoration (overlayState/overlayGradient — not user-configurable) → don't add `nestedInstances`. Builder treats absence as "leave child as Figma rendered it."

**`defaultProps` policy:** include the full set of variant/property values Figma renders by default (variant axes + visible exposed props). Builder uses this set as the authoritative initial state, especially when migrating across Figma file edits. Don't try to diff from Figma defaults — be explicit.

**Not for:** badge/tagsView size variants (12-badgeview, 20-tagsview etc). Their wrapped child is the parent component itself with size locked; nested props are handled via the parent's own slots/booleans.

## Runtime decisions vs static layout properties

Rule.json содержит два класса полей с разной семантикой:

- **Static layout properties** (compile-time, копируются как есть в ruleTree):
  - `layoutRules` — `{ layoutPositioning, anchoredTo, resizePattern }` для anchored-композитов (meshok ↑/↓, float/toast). Только top-level, не nested.
  - `nestedProps` — fixed defaults для INSTANCE_SWAP child или boolean-controlled sub-instance.
  - `nestedInstances` — wrapper composite hardcoded children.

- **Runtime decisions** (Builder делает reasoning на Шаге 6, пишет в `_session.builder_picks[]` / `_session.text_picks[]`):
  - `slots[].preferred[]` — Builder выбирает один через `picked` по контексту экрана.
  - `variants[].builderRule` + `options[]` — Builder выбирает value по контексту.
  - `textProps[].sampleTexts` — Builder подставляет реальный текст из брифа через `text_picks` → `contextText`.

**Не смешивать слои.** Static properties — это контракт компонента (как он устроен). Runtime decisions — это выбор Builder'а per-screen (как он используется). Через 6 месяцев соблазн положить `layoutRules` в `builder_picks` (по аналогии с variants) сломает контракт: layoutRules одинаков для всех экранов, runtime decisions per-screen.

## Axis fixation — три оси описания slot/preferred/component

Rule.json имеет **три ортогональные axis** описания контента слота. Не смешивать, не дублировать. Введено в P2 (#215).

| Axis | Где живёт | Что описывает | Кто читает |
|---|---|---|---|
| **`slot.role`** | `slots[<X>].role` (string) | Семантическая роль слота — **«зачем здесь этот слот»** (намерение родителя). Машинный enum из `rules/semantic-roles.json` (namespace/role-name). | Builder Шаг 6 E.0 reasoning через семантический матч с `preferred[].semanticRoles[]` (G-I2.1+). |
| **`preferred[].semanticRoles[]`** | `slots[<X>].preferred[i].semanticRoles` (string[]) | Семантические роли, которые этот preferred подходит покрывать — **«что я подходит»** (декларация кандидата). Значения из `rules/semantic-roles.json`. | Builder фильтрует кандидатов по `slot.role ∈ preferred.semanticRoles`. |
| **`variants[].builderRule`** | `variants[<vProp>].builderRule` (string) | Текст-инструкция как выбрать значение **внутри** компонента — **«какой я»** (например, "H1=27, H2=21"). Свободный текст, LLM-ом интерпретируется. | Builder Шаг 6 E.0 reasoning при decision: "variant". |

**Ключевое различие.** Roles описывают **slot-уровневую семантику** (родитель → ребёнок), `builderRule` — **component-internal выбор** (внутри одного preferred). Если кейс описывается через `role`/`semanticRoles` — нельзя дублировать в `builderRule` (получится drift между источниками). Если через `builderRule` — нельзя выносить в roles (раздуем enum).

**Пример: `error→hint` в inputText.**
- Slot `inputText.slots[hint]` → `role: "form/feedback"` (намерение — обратная связь от формы).
- Preferred `inputText hint with style=destructive` → `semanticRoles: ["form/error"]` (этот вариант покрывает error).
- НЕ через `variants[style].builderRule` — слот сам не знает, error это или success, это решает родитель через `role`.

**Контр-пример: `header.size=27 для H1`** — `variants[size].builderRule: "27 — H1, 21 — H2"`. НЕ `role` — это **внутренний** выбор header'а, не slot-уровневая семантика родителя.

**Migration path (backlog).** Текущий контракт — `slot.role` single string. Если через 6-12 месяцев встретится кейс «slot покрывает 2 роли одновременно» (`form/feedback` + `form/inline-error`) — миграция через minor schema bump на `oneOf: [string, string[]]`. Single string остаётся валидным, backward-safe.

См. также: `.claude/commands/builder.md` секция «Rule-driven instantiation», gate G-I2.1 (role-enum-valid).

## Axis classification — что в semantic-roles vs другие механизмы

Не каждый кейс P2 укладывается на slot-preferred selection. Чтобы будущий планировщик не повторял мой fault — явная классификация по типу проблемы:

| Тип задачи | Механизм | Пример (✓) и негативный пример (✗) |
|---|---|---|
| **slot-preferred selection** (выбор preferred под контекст) | `slot.role` + `preferred.semanticRoles[]` | ✓ `meshok-down.systemComponent` — `handle` / `tabbarPrimary` / `keyboardNumeric` под контекст экрана. <br/> ✗ `inputText.style="destructive"` — НЕ semantic-roles, это variant, а не выбор preferred в slot. |
| **variant selection** (выбор variant value внутри одного компонента) | `variants[].builderRule` (P0-2) | ✓ `inputText.style="destructive"` под error; `header.size=27` для H1. <br/> ✗ `meshok-down.systemComponent` выбор — НЕ variant, это другой компонент целиком в slot. |
| **boolean toggle** (включение/выключение slot или внутреннего state) | `booleans[].whenOn` / `defaultOn` (P0-3) | ✓ `inputText.hint` (boolean) включается при ошибке. <br/> ✗ Выбор какой именно hint показать — НЕ boolean, это либо variant.style либо composite rule. |
| **composite rule на компоненте** (несколько props связно: `style` + boolean + textProp) | НЕТ единого механизма сейчас. Каждый prop через свой механизм. Если паттерн повторяется — отдельный эпик «cross-prop rules». | ✓ Полный error-state inputText: style=destructive + hint=on + hint-text=`<error>` + (опц.) icon. <br/> ✗ Один prop под контекст — НЕ composite, это его axis (variant / boolean / textProp). |
| **screen-level component addition** (новый компонент на экране в ответ на контекст) | `rules/skeleton.md` + CJM-планирование, НЕ `.rule.json` | ✓ `loader 1.1` на loading-state экранах; banner-toast на success. <br/> ✗ Замена preferred внутри существующего slot — НЕ screen-level, это slot-preferred selection. |
| **nested inner-control** (компонент внутри другого через nestedInstances / nestedProps) | `nestedInstances` (см. секцию выше) | ✓ `mediaSelect` внутри `media.addons.topRight` (галочка multi-select). <br/> ✗ Самостоятельный компонент в slot — НЕ nested, это slot-preferred. |
| **text content selection** (выбор реального текста для textProp / textNode) | `slots[].preferred[].usage` для контекста + `text_picks` (P0-4) для конкретного текста из брифа/CJM. НЕ semantic-roles. | ✓ Подстановка реального текста в `button1.label` из брифа через `text_picks`. <br/> ✗ «Роль `cta/primary`» на текстовый prop — НЕ semantic-roles, текстовый axis не использует enum ролей. |

**Правило при планировании нового кейса.** Перед добавлением роли в `semantic-roles.json`:
0. **Pre-read обязательный:** [`docs/ARCHITECTURE_LESSONS.md`](../../docs/ARCHITECTURE_LESSONS.md) — накопительный single-source архитектурных уроков (правило N кейсов, тест «semantic vs visual», leaf-axis vs slot-axis). Без этого pre-read планировщик повторит ошибки P2 эпика #215 через 3-6 месяцев.
1. Проверить, это **slot-preferred selection** или другой тип?
2. Если slot-preferred — semantic-roles ✓.
3. Иначе — выбрать механизм из таблицы выше.

Без этого правила namespace будет раздуваться кейсами, которые механически принадлежат другим axis (anti-pattern из P2 первого витка планирования — `error→hint` через roles вместо composite-prop rule).

## Variants и builderRule

Поле `variants[vProp].builderRule` (свободный текст) обязательно ТОЛЬКО для variants, у которых выбор зависит от контекста экрана:
- `size` (H1/H2/H3 → 27/21/17 — зависит от уровня заголовка)
- `style` у CTA (`primary` / `secondary` / `destructive` — зависит от роли действия)
- `size` у `image · circle ◇ avapicture` (16/20/24/36/44/56/72+ — зависит от плотности экрана)

Для variants, где выбор не зависит от контекста дизайна (например, `state` у input — это runtime-состояние, `style` у статичного компонента), `builderRule` оставляется **пустым/отсутствующим**. Builder применяет `default` молча, без записи в `_session.builder_picks[]`.

То же касается variants с `options.length === 1` — нечего выбирать, reasoning бессмыслен.

Это правило поддерживает Шаг 6 E.0 reasoning Builder'а (см. `.claude/commands/builder.md`): variants без `builderRule` или с одним option не триггерят variant-picks, чтобы избежать шума на десятки записей per screen.

## Padding rule — CRITICAL

**Never set padding/itemSpacing on an inserted instance** unless the designer explicitly asks.

### DO NOT touch:
- `paddingLeft`, `paddingRight`, `paddingTop`, `paddingBottom`
- `itemSpacing`
- `layoutMode`

These are part of the design system and must not be overridden.

### CAN change:
- `x`, `y` — position
- `resize(w, h)` — if component is STRETCH or designer requests size
- `setProperties({...})` — component's own declared props
- `layoutPositioning`, `constraints` — only when `layoutRules` specifies. Applied by `applyRuleDriven(inst, ruleSlug, ctx)` helper (top-level instances only — gated by `ctx.path.length === 1`; nested instances inside auto-layout parents must stay relative). Host code (`use_figma` snapshot) is responsible for `instance.resize(parent.width, instance.height)` immediately after `parent.appendChild` and before `applyRuleDriven` when `layoutRules.layoutPositioning === 'ABSOLUTE'`. Helper does not resize — it has no parent reference. Signature changed in PR-B (#205 Step 1): helper now reads rule via `ctx.bundle.rulesBySlug[ruleSlug]` instead of pre-built nested ruleTree. See `.claude/commands/builder.md` helper body (под sentinel'ами) и Шаг 7 example.
- `layoutSizingHorizontal/Vertical = 'FILL'` — inside auto-layout parent

### In .rule.json

`layoutRules` must not contain padding/itemSpacing fields unless `paddingOverrideReason` is also set (invariant 6). This prevents accidentally storing a design-system override.

## invariants (enforced by parseProps-utils.js validate)

1. **Paired reciprocity** (error) — `slots[X].pairedBoolean === Y` ⟺ `booleans[Y].pairedSlot === X`
2. **Key in registry** (error) — `rule.key` exists in `registry/index.json`
3. **ruleRef resolvability** (warning, not error) — if `slots[X].preferred[Y].nestedProps.ruleRef` is set, the referenced `<slug>.rule.json` should exist. Warning only — `ruleRef` may legitimately point at a component not yet processed during Phase 3.
   - Why not "preferred keys in registry": preferred `key` values are Figma component-variant keys from `inspected-props.json.preferredKeys`. They are not the same as the top-level `componentKey`s catalogued in `registry/index.json` — variant keys do not appear there. Actual key validity is enforced by Phase 5c swap test in microtest, not by registry lookup.
4. **usage when multiple** (error) — `approved=true` AND `validated.length ≥ 2` → all validated preferred have `usage`. WIP rules (`approved=false`) are exempt.
5. **alwaysOn needs builderRule** (error) — `alwaysOn=true` → non-empty `builderRule`
6. **No silent padding override** (error) — `layoutRules` with padding fields → requires `paddingOverrideReason`
7. **sourceLib excludes preferred[]** (error) — a slot with `sourceLib` must have `preferred: []`. Mixing library-sourced contract with enumerated whitelist is ambiguous; Builder must use one mechanism or the other.

## sourceLib slots — слоты с библиотечным контентом

Когда INSTANCE_SWAP-слот берёт контент из библиотеки с частыми обновлениями (иконки, иллюстрации — 50–200+ компонентов), перечислять все `preferred` ключи нецелесообразно:
- каждое обновление библиотеки ломает `preferred[]` (ключи меняются)
- Builder не может выбрать из 200+ непрозрачных ключей без контекста

**Решение:** поле `sourceLib` на слоте. Builder использует его вместо `preferred[]`.

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

### Когда применять

- Слот ссылается на библиотечный фрейм (иконки, эмодзи-бейджи, иллюстрации)
- preferred-кандидатов >15 и библиотека регулярно пополняется
- Нет конкретного «по умолчанию» — выбор полностью на дизайнере

### Как Builder обрабатывает

1. Видит `sourceLib` → не читает `preferred[]`
2. Вызывает `get_design_context(figmaFile, nodeId)` — получает доступный контент библиотечного фрейма
3. Или `search_design_system(hint)` как fallback
4. Дизайнер выбирает → Builder делает `swap`

### preferred[] при sourceLib

Поле `preferred` намеренно пустое `[]` — не «pending», а «не применимо». Не заполнять preferred ключами при наличии `sourceLib`.

### Текущие sourceLib-слоты

| Компонент | Слот | figmaFile | nodeId | Библиотека |
|---|---|---|---|---|
| `iconglyph` | все 3 размера | `DZgo2qYfDc27VWIJ2gcz1Sap` | `18043:3043` | 🎲 Icons |
| `badge` | все 4 размера | `DZgo2qYfDc27VWIJ2gcz1Sap` | `31483:2` | 🎲 Icons / Actual |
| `illustration` | оба слота | — | — | бэклог (Настя уберётся) |

## Gap family — leaf spacers без rule-файлов

Семейство `gap` (36 компонентов в библиотеке base-components) — leaf-spacers: вертикальные/горизонтальные распорки фиксированного размера. **Своих rule-файлов у них НЕТ** и не должно появляться: компоненты пустые (нет slots/booleans/variants), отдельные правила были бы 36 «пустыми» Read-ами в бюджете Builder'а.

**Три подсемейства:**

| Семейство | Назначение | Пример имени | Количество |
|---|---|---|---|
| `gapTextVertical` | Расстояние между двумя content-строками; имя содержит обе размерности (`X-Y`) | `13-13 ◇ \| gapTextVertical`, `17-15 ◇ \| gapTextVertical`, `27-17-compensate ◇ \| gapTextVertical` | 11 |
| `gapCustomVertical` | Универсальный вертикальный отступ заданного размера в px | `0 ◇ preset \| gapCustomVertical`, `20 ◇ preset \| gapCustomVertical`, `64 ◇ preset \| gapCustomVertical` | 12 |
| `gapCustomHorizontal` | То же, но горизонтальный | `16 ◇ preset \| gapCustomHorizontal`, `64 ◇ preset \| gapCustomHorizontal` | 12 |

**Где они появляются:** в slot'е с именем `—— gap ——` (или `—- gap ——`) внутри composite-компонентов. Сейчас канонический пример — `custom · contentsView` (2 gap-слота между line-1/2/3).

**Правило подбора для Builder:**

1. **Сначала ищи `gapTextVertical X-Y`**, где X = размер content в строке выше, Y = размер ниже. Имена строго детерминированы: `13-13`, `15-13`, `15-15`, `17-13`, `17-15`, `17-56`, `21-13`, `21-15`, `21-17`, `24-15`, `27-17`, `27-17-compensate`.
2. **Если точной пары нет** — fallback на `gapCustomVertical Npx`, где N — целевой отступ из макета. Пресеты: 0, 2, 4, 8, 12, 16, 20, 24, 32, 40, 48, 64.
3. **`gapCustomHorizontal` в вертикальном контейнере НЕ использовать** — в preferred родительского слота они помечены `broken: true`.

**Откуда брать ключи:** из `preferred[]` родительского слота. Match по `name` (см. таблицу выше). НЕ хардкодить в Builder — список может расшириться при добавлении новых текстовых размеров (тогда обновляется `custom · contentsView.rule.json` через `/parseProps`, не этот документ).

**Никаких `nestedProps.ruleRef` на gap-preferred entries:** ruleRef ведёт на rule-файл, которого нет и не будет.

## Universal placeholder marker

Key `aa40b8b95980f6406a8604dbfebb660aa8ea1bbf` is the universal Figma placeholder component (`12:6`). It appears as the first `preferred[0]` entry in many INSTANCE_SWAP slots with `broken: true` — it is the default Figma puts there before any swap. Builder must always swap it out; rendering it leaves a silent-failure grey strip on screen.

## Phase 3 processing order

Process components tier-by-tier so that `nestedProps.ruleRef` resolves correctly:

1. Atoms (no slots) → Call A only, fast
2. Atoms with VARIANT
3. Simple composite (button, tag, chip, toast)
4. Composite + conditional (navbar, header)
5. View-tier (chipsView, buttonsView) — nested composites already have `.rule.json`
6. ABSOLUTE / complex (meshok ↑, featureBanner)
