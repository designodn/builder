# Builder gotchas — A-046, 053, 054, 057, 058, 059

Полный список known-failure паттернов при генерации plugin-кода для Figma в `/builder`. Нумерация — не непрерывный диапазон (A-040, A-030, A-024 описаны в других местах). Здесь — те, что ловят прицельно при генерации кода. Каждая готча подтверждена реальной сессией. Builder обязан учитывать их при написании любого `use_figma`-кода.

Этот документ — **внутренний**, в реплики Дизайнеру никогда не утекает (см. `.claude/commands/builder.md`, секция «Глобальные правила реплик Дизайнеру»).

## Sandbox contract — inline-substitution для JSON

**Figma plugin sandbox не имеет `require` / `import` / `fs.readFile` / `XMLHttpRequest`.** Plugin-код выполняется в изолированной среде с доступом только к `figma` глобалу. Это значит, что любые `.rule.json` / `rules/skeleton.json`, на которые ссылается plugin-логика, **Builder должен прочитать на этапе планирования** (через `Read` / `Bash grep`) и **встроить значения литералами** в `code`-параметр `use_figma`.

Конкретно:

```js
// ✅ Правильно — Builder читает skeleton.json и подставляет ключи DS-переменных
// (width/height — через bound variables, не литералами; FRAME_GAP — литерал):
const W_VAR_KEY = '66754fcd2e5bb785b25b1a5001e9048179390aa5';  // screen-width
const H_VAR_KEY = '5faab23943b2d6283f894f2587748b36bff0b267';  // screen-height
const FRAME_GAP = 200;                                          // canvas-only

const wVar = await figma.variables.importVariableByKeyAsync(W_VAR_KEY);
const hVar = await figma.variables.importVariableByKeyAsync(H_VAR_KEY);
const frame = figma.createFrame();
frame.setBoundVariable('width',  wVar);
frame.setBoundVariable('height', hVar);

// ❌ Неправильно — литералы вместо переменных ДС (нарушает R-028):
// const MOBILE_W = 375;
// const MOBILE_H = 812;
// frame.resize(MOBILE_W, MOBILE_H);

// ✅ Правильно — Builder читает rule.json и встраивает inline-объект:
const MESHOK_DOWN_RULE = {
  slots: {
    "✏️ buttonsView#1073:1": { /* структура из rule.json */ },
    "✏️ systemComponent#1073:2": { /* ... */ }
  },
  booleans: {
    "buttonsView#1074:0": { defaultOn: false }
  }
};

// ❌ Неправильно — упадёт runtime, нет require:
const SKELETON = require('rules/skeleton.json');
const RULE = require('../rules/components/meshok-down.rule.json');
```

Этот контракт распространяется на **все** JSON-файлы, на которые ссылается plugin-код. Если Builder упоминает `require()` / `import` в сгенерированном коде — это ошибка планирования, не sandbox-баг.

---

## A-046 — две ловушки импорта/setProperties

### Гoтча 1: единый API импорта

Реестр хранит **COMPONENT-ключи** (дефолтные варианты сетов, помеченные `type: "s"`). Импортируй ВСЁ через `figma.importComponentByKeyAsync(key)` — он работает и для `c`, и для `s`. **Не используй `importComponentSetByKeyAsync` на registry-ключах** — он падает с `"Component set with key X not found"`.

Исключения (где зарегистрированы реальные SET-ключи, не дефолтные варианты):
- `220 ◇ uniCard`, `320 ◇ uniCard`, `160 ◇ uniCard`, `custom ◇ uniCard` (см. `rules/components/unicard-view.rule.json`)
- middle-сеты navbar (`60d00e30...`, `2e675ccf...` — внутри setNavbarTitle helper)

Универсальный helper:

```js
async function importCompOrSet(key) {
  try { return await figma.importComponentByKeyAsync(key); }
  catch (e) {
    if (/not found/i.test(e.message)) {
      const s = await figma.importComponentSetByKeyAsync(key);
      return s.defaultVariant || s.children.find(c => c.type === 'COMPONENT');
    }
    throw e;
  }
}
```

### Гoтча 2: setProperties для INSTANCE_SWAP — `.id`, не registry-key

Передавай `.id` импортированного компонента, **НЕ** registry-key как строку.

```js
// ✅ Правильно:
const choiceComp = await figma.importComponentByKeyAsync('6b732de...');
chips.setProperties({ 'swap#7472:0': choiceComp.id });

// ❌ Неправильно — Figma вернёт "Property value is incompatible":
chips.setProperties({ 'swap#7472:0': '6b732de...' });
```

Это разные домены: registry-ключ — глобальный, `.id` — локальный node-id уже импортированного инстанса.

---

## A-053 — post-swap discovery идёт через `mainComponent.parent.name`

После INSTANCE_SWAP на ключ из preferred values mainComponent инстанса — это **конкретный variant** (имя вида `"preset=primarySecondary"` или `"style=primary, size=56, state=interactive"`), а его `parent` — это COMPONENT_SET с осмысленным именем (`"2 horizontal ◇ buttonsViewBottom"`, `"button 1.1"`).

```js
// ❌ Неправильно — вернёт null, потому что mainComponent.name = "preset=primarySecondary":
md.findOne(n => n.type === 'INSTANCE' && /buttonsViewBottom/.test(n.mainComponent.name));

// ✅ Правильно — ищем по имени SET через parent:
md.findOne(n => {
  if (n.type !== 'INSTANCE' || !n.mainComponent) return false;
  var setName = n.mainComponent.parent && n.mainComponent.parent.type === 'COMPONENT_SET'
    ? n.mainComponent.parent.name : n.mainComponent.name;
  return /buttonsViewBottom/.test(setName);
});
```

---

## A-054 — regex для inner-button discovery: версионные имена + строгий TEXT-тип для label

В одних preset'ах inner button назван `button 1`/`button 2` (BVB 2-horizontal), в других — `button 1.1` (BVB One).

```js
// Универсальный матч: button + опц. версия (1 / 1.1 / 2)
var buttons = bvb.findAll(n =>
  n.type === 'INSTANCE' &&
  /^button(\s+\d+(\.\d+)?)?$/.test(n.name) &&
  n.visible &&
  n.mainComponent && /style=/.test(n.mainComponent.name)  // variant из button 1.1 set
);

// Label-prop тоже надо выбирать строго TEXT-типа — есть ещё BOOLEAN с label-именем:
var main = btn.mainComponent;
var target = main.parent && main.parent.type === 'COMPONENT_SET' ? main.parent : main;
var defs = target.componentPropertyDefinitions || {};
var labelKey = Object.keys(defs).find(k => /label/i.test(k) && defs[k].type === 'TEXT');
btn.setProperties({ [labelKey]: 'Отправить' });
```

---

## A-057 — `layoutSizing` ТОЛЬКО после `appendChild`

Figma бросает `layoutSizingHorizontal/Vertical = 'FILL' can only be set on children of auto-layout frames` если sizing выставляется ДО того, как нода добавлена в auto-layout parent. Корень — нода ещё не имеет parent на момент вызова.

```js
// ❌ Неправильно — упадёт:
inst.layoutSizingHorizontal = 'FILL';  // нода ещё orphan
parent.appendChild(inst);

// ✅ Правильно — сначала append, потом sizing:
parent.appendChild(inst);
inst.layoutSizingHorizontal = 'FILL';

// ✅ Helper-pattern (используй для всех append'ов с FILL):
async function addChildFill(parent, child, axis = 'both') {
  parent.appendChild(child);
  if (axis === 'both' || axis === 'h') child.layoutSizingHorizontal = 'FILL';
  if (axis === 'both' || axis === 'v') child.layoutSizingVertical   = 'FILL';
}
```

Применяй при сборке: `createInstance → setProperties (variants) → addChildFill(parent, inst) → дальше`. Same for `layoutGrow = 1`, `layoutAlign = 'STRETCH'` — все sizing-свойства требуют auto-layout parent.

---

## A-058 — slot prop names резолвить из rule-объекта, никогда не печатать литералом

Реальные имена slot prop в этой ДС часто содержат значимый префикс `✏️ ` / `✎ ` (карандашик) — это часть имени, Figma API проверяет посимвольно. В одном и том же компоненте основной слот может быть БЕЗ префикса, а опциональные — С префиксом (`meshok ↑`: `navbar#1491:0` без, `✏️ tabs#2344:3` с). LLM при генерации plugin-кода стабильно теряет префикс, реконструируя имя «как обычно выглядит». Результат — `Could not find a component property with name: '...'`, и поскольку `setProperties` атомарный, **весь** словарь отвергается, не только кривой ключ.

### Helper'ы — резолв через rule-объект с фильтром по типу

**Критично:** regex `/buttonsView/` без anchors найдёт ОБА слота `meshok ↓` — INSTANCE_SWAP `✏️ buttonsView#1073:1` и BOOLEAN `buttonsView#1074:0`. Поэтому helper'ы **должны** фильтровать по типу пропа.

В `.rule.json` поля разнесены: INSTANCE_SWAP-слоты лежат в `rule.slots`, BOOLEAN — в `rule.booleans`. Используй парные helper'ы и не смешивай:

```js
// helper для INSTANCE_SWAP slot — смотрит в rule.slots
function slotKey(rule, pattern) {
  const keys = Object.keys(rule.slots || {}).filter(k => pattern.test(k));
  if (keys.length === 0) throw new Error(`slotKey: no match for ${pattern} in rule.slots`);
  if (keys.length > 1)  throw new Error(`slotKey: ambiguous ${pattern} → ${keys.join(', ')}`);
  return keys[0];
}

// helper для BOOLEAN — смотрит в rule.booleans
function boolKey(rule, pattern) {
  const keys = Object.keys(rule.booleans || {}).filter(k => pattern.test(k));
  if (keys.length === 0) throw new Error(`boolKey: no match for ${pattern} in rule.booleans`);
  if (keys.length > 1)  throw new Error(`boolKey: ambiguous ${pattern} → ${keys.join(', ')}`);
  return keys[0];
}
```

**Жёсткие правила использования:**
1. Паттерн должен быть **уникален** в соответствующем разделе rule-объекта. Если matches > 1 — helper кидает throw, переписывай regex (anchors, более специфичный текст). Default: используй конец имени со специфическим `#NNNN:N`-суффиксом, либо `^name$`-anchor.
2. В plugin-коде запрещены **литералы** вида `'<name>#\d+:\d+'` для slot prop names. Только resolve.
3. Variant prop names (`size#6313:33`) и `text#NNNN:N` допустимы литералом — у них исторически нет ✏️-префикса и нет коллизии типов в той же rule-секции. Но **рекомендуется** резолвить через `Object.keys(componentPropertyDefinitions)` с фильтром по `defs[k].type` (как в A-054 для label-key).

### setProperties — группами по типу, не пакетом «всё что нашёл»

```js
const MESHOK_DOWN_RULE = { /* копия rule.json как есть, slots + booleans */ };

const swapButtons = slotKey(MESHOK_DOWN_RULE, /buttonsView/);    // '✏️ buttonsView#1073:1'
const swapSystem  = slotKey(MESHOK_DOWN_RULE, /systemComponent/); // '✏️ systemComponent#1073:2'
const boolButtons = boolKey(MESHOK_DOWN_RULE, /buttonsView/);    // 'buttonsView#1074:0'

// ✅ Boolean'ы — одним пакетом (они не падают по «slot prop not found»):
mDown.setProperties({ [boolButtons]: true });

// ✅ INSTANCE_SWAP — точечно (failure одного не уронит остальные):
mDown.setProperties({ [swapSystem]: handleComp.id });
mDown.setProperties({ [swapButtons]: bvbComp.id });
```

Логика порядка: boolean'ы — широкий, безопасный пакет (slot prop not found никогда не сработает). INSTANCE_SWAP — каждый в свой вызов: атомарность даст нам частичный успех при одном кривом ключе, а не нулевой результат.

---

## A-059 — wrapper-слот с `pairedBoolean` → флипай boolean ВМЕСТЕ со swap

Слоты вида `navbar.middle`, `meshok-up.tabs`, `meshok-down.buttonsView` имеют **парный boolean**, который по умолчанию `defaultOn: false`. Если свапнуть слот без флипа boolean — внутри окажется правильный компонент, но слот **выключен**, визуально пусто (или placeholder strip — см. A-040). Алгоритм работы со слотом всегда:

```js
// rule-объект уже встроен inline. slotInfo — из rule.slots[key]
const swapName = slotKey(rule, /buttonsView/);   // '✏️ buttonsView#1073:1' (через helper)
const slotInfo = rule.slots[swapName];
const pairedBool = slotInfo.pairedBoolean;       // 'buttonsView#1074:0' или undefined

// Ментальная модель: «сначала ВКЛЮЧИ слот видимости, потом ПОЛОЖИ в него содержимое».
// Технически в одной транзакции плагина порядок не важен, но единый pattern читаем:
const props = {};
if (pairedBool) props[pairedBool] = true;
props[swapName] = targetComp.id;
node.setProperties(props);                       // одна группа OK: оба valid (anchor'ы guard'ят)
```

Это покрывает A-040 (синий заштрихованный стрип на navbar.middle), A-030 (wrapper swap без флипа boolean → placeholder) и общий случай. Если у слота `pairedBoolean` отсутствует — слот always-on, ничего флипать не нужно.

---

## Применение в plugin-коде

При написании любого `use_figma` блока:

1. Прочитай нужные `.rule.json` и `rules/skeleton.json` файлы. **Встрой их содержимое как литеральные JS-объекты / константы** в plugin-код (см. секцию «Sandbox contract» выше). `require` / `import` / `fs` — недоступны.
2. Импорт всех компонентов через `importCompOrSet` (A-046).
3. `createInstance → setProperties (variants) → addChildFill(parent, inst)` (A-057).
4. Для каждого wrapper-slot: `slotKey/boolKey` → флип boolean + swap (A-058 + A-059).
5. Discovery вложенных инстансов: через `mainComponent.parent.name` для COMPONENT_SET (A-053).
6. Discovery версионных button-инстансов: regex `^button(\s+\d+(\.\d+)?)?$` (A-054).
7. Label/title text props: фильтр по `defs[k].type === 'TEXT'` (A-054).
