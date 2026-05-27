# Prop Collector Agent

Собирает `componentPropertyDefinitions` у компонентов Figma и пишет/обновляет секции `rules/components/*.md`. После каждого компонента дополняет собственный раздел `## Знания` внизу этого файла — так агент учится на ошибках и открытиях.

---

## Права

Запускает только Настя (identity-check как в `CLAUDE.md`).

---

## Вход

Агент принимает список имён компонентов точно как в `registry/index.json`:

```
navbar 1.0
17 · primary ◇ content
inputTextArea 1.0
```

Можно передать одно имя или список — агент обрабатывает по одному.

---

## Алгоритм (на каждый компонент)

### Шаг 0 — Anti-hallucination gate (ОБЯЗАТЕЛЕН)

Перед записью **любого** факта в `rules/components/*.md` каждый из этих фактов должен опираться на **конкретный кусок ответа `use_figma`** в этой же сессии. Если ты не пробил факт пробингом — не пиши его, даже если он «очевиден» или «уже есть в handwritten секции».

**Запрещено писать в правило:**

- ❌ Имя вложенного нода (`findOne(name='X')`) — пока не дампил дерево после `createInstance` и не убедился что нода с таким именем существует.
- ❌ Тип ключа (`COMPONENT` vs `COMPONENT_SET`) — пока не вызвал `importComponentByKeyAsync` И `importComponentSetByKeyAsync` (cascading try) и не зафиксировал, какой из них вернул узел.
- ❌ Дефолтное значение пропа — пока не прочитал `componentPropertyDefinitions[propName].defaultValue` или не свел дефолтные значения сета через `componentProperties` свежего инстанса. **Дизайнерский «дефолт» (что обычно ставят по умолчанию в работе) — это другое, его узнаёшь только у дизайнера, не пиши «дефолт» по интуиции.**
- ❌ TEXT-проп вложенного компонента — пока не нашёл соответствующую запись с `type: 'TEXT'` в `componentProperties` вложенного инстанса (см. Шаг 3.5/3.7).
- ❌ Семантика VARIANT-значения («когда `style=primary`» / «когда `size=small`») — пока дизайнер не подтвердил. API даёт только список значений, не «когда какое».

**Если вытащил факт из старой handwritten-секции — пробей пробингом.** Старые секции уже несколько раз ловились на устаревших данных:

- `findOne(name='size')` для uniCard — реальное имя `'unicard'` (lowercase).
- radio/checkbox ключи в selectionCell были перепутаны.
- `160 accent · uniCard` упоминался как preferred value, реально его в preferredValues нет.

Перед перезаписью handwritten — diff с probe-данными. Любое расхождение помечай как **bug в доке** (запиши в `## Знания → Переписанные правила`), а не «вариант формулировки».

**Если что-то не пробивается** (ключ возвращает «not found», нода не находится, prop отсутствует в API) — **запиши это явно** в правило как известное ограничение, не молчи: «ключ `XXX` есть в `preferredValues`, но `importComponent*` возвращает not found — игнорируй / спроси дизайнера».

**Anti-pattern checklist** (повторяй мысленно перед каждой записью):

- ☐ `prop name` (`size#6313:33`) — для `setProperties`/`setDeep` path.
- ☐ `node name` (`unicard`) — для `findOne(n => n.name === ...)`.
- ☐ Это **разные пространства имён**, никогда не предполагай эквивалентность.
- ☐ `createImageAsync(url)` **не существует** в Plugin API внутри `use_figma` — не предлагай в правилах.
- ☐ Boolean-toggle рядом со swap-слотом часто требуется для видимости (`bottom ↓#:N` + `✏️ bottom ↓#:N`, `right ->#:N` + `✎ right ->#:N`). Без булева swap — silent failure.
- ☐ Свапы кладут `.id` (строку), а не `ComponentNode`-объект. Для конкретного варианта SET'а: `setNode.defaultVariant.id` или `importComponentByKeyAsync(variantKey).id`.

### Шаг 1 — Поиск в реестре

Открой `registry/index.json`, найди запись по имени:

```json
"navbar 1.0": ["base-components", "8690a72a...", "s"]
```

Запомни: `lib`, `key`, `type` (`"c"` = COMPONENT, `"s"` = COMPONENT_SET).

Если компонента нет — записать в `## Знания` → раздел «Не найдено в реестре» и перейти к следующему.

### Шаг 2 — Сбор через use_figma

Выполни plugin-код:

```js
// Для type === "c":
var comp = await figma.importComponentByKeyAsync('<key>');
var defs = comp.componentPropertyDefinitions;
// defs — объект { "propName#nodeId": { type, defaultValue, variantOptions?, preferredValues? } }
console.log(JSON.stringify(defs, null, 2));

// Для type === "s" (COMPONENT_SET):
// Импортируем дефолтный вариант и идём к родителю
var comp = await figma.importComponentByKeyAsync('<key>');
var parent = comp.parent; // ComponentSetNode
var defs = parent.componentPropertyDefinitions;
// Варианты (VARIANT-пропы):
var variantDefs = {};
parent.children.forEach(function(child) {
  variantDefs[child.name] = child.key; // "size=20, content=icon" → key
});
console.log(JSON.stringify({ defs: defs, variants: variantDefs }, null, 2));
```

> **Важно:** каждый ключ в `defs` — это уже готовый `figmaPropName` формата `propName#nodeId`. Никогда не конструируй его вручную — берёт из API.

### Шаг 3 — Разбор ответа

Для каждого ключа `"propName#id"` определи тип и заполни таблицу:

| Тип API | Что в правиле |
|---|---|
| `TEXT` | `**\`✎ propName\`** (TEXT, \`propName#id\`) — назначение` |
| `BOOLEAN` | `**\`propName\`** (boolean, \`propName#id\`) — **когда включать** (правило, не default!) |
| `INSTANCE_SWAP` | `**\`✏️ propName\`** (INSTANCE_SWAP, \`propName#id\`)` + таблица вариантов |
| `VARIANT` | Раздел `## Вариант \`propName\`` с таблицей значений из `variantOptions` |

> **Не пиши `default: X` в правилах.** Дефолтное значение в Figma — просто состояние компонента, оно ничего не говорит Builder'у о том, **когда** включать проп. Builder принимает решение по контексту задачи. Вместо default — короткое правило: «**включай**, когда X», «**обычно выключено**, включай только если Y». Если правило неизвестно — пометить «уточни у дизайнера / TBD».

Для `INSTANCE_SWAP` — `preferredValues` содержит массив `[{ type, key }]`. Для каждого `key`:
1. Поищи имя в `registry/index.json` (перебором по key)
2. Если не нашёл — выполни `figma.importComponentByKeyAsync(key)` → `comp.name`
3. Запиши в таблицу `| имя | key | Когда |` — колонку «Когда» оставь пустой для ручного заполнения

### Шаг 4 — Проверка на известные ловушки

Перед записью проверь по разделу `## Знания` этого файла:
- Есть ли в именах пропов эмодзи или стрелки → всегда пиши `name#id`, не `name` (R-004)
- Есть ли пропы без `#id` в ключе → это аномалия, записать в «Аномалии» раздела Знаний
- Тип `INSTANCE_SWAP` без `preferredValues` → упомянуть в правиле как «allowed неизвестен, уточни у дизайнера»

### Шаг 5 — Запись в rules/components/

Определи целевой файл:
- Проверь раздел `## Знания` → «Маппинг имя → файл»
- Иначе: первое слово имени компонента в lower case → `rules/components/<word>.md`
  - `navbar 1.0` → `navbar.md`
  - `17 · primary ◇ content` → `content.md`
  - `inputTextArea 1.0` → `inputTextArea.md`

Если файл существует — найди секцию компонента и обнови только её. Если нет — создай файл.

**Шаблон секции:**

```markdown
# <name>

**id:** `<lib>--<slug>`

## Вариант `<variantProp>`      ← если есть VARIANT-пропы

| Значение | Когда |
|---|---|
| `val1` | ← заполни вручную |
| `val2` | |

## Пропы

**`✎ propName`** (TEXT) — `setProperties({ 'propName#id': 'текст' })`.

**`boolProp`** (boolean, default false, `boolProp#id`) — ← заполни описание вручную.

**`✏️ swapProp`** (INSTANCE_SWAP, `swapProp#id`):

| Компонент | Ключ | Когда |
|---|---|---|
| `name` | `key` | ← вручную |
```

### Шаг 6 — Самообучение

После записи каждого компонента дополни раздел `## Знания` этого файла:

1. **Маппинг имя → файл** — добавь строку `name → filename.md` если маппинг неочевиден
2. **Аномалии** — необычные типы пропов, пустые `preferredValues`, несовпадения с реестром
3. **Паттерны** — что работает хорошо (например, «у всех content-компонентов проп `✎ label` с одинаковым форматом»)
4. **Не найдено в реестре** — компоненты, которых нет в `index.json`
5. **Дочерние пропы после INSTANCE_SWAP** — если нашёл паттерн доступа к child props (A-025), записать сюда немедленно

---

## Шаг 3.5 — Сбор nested-пропов (A-025 — РЕШЕНО)

После сбора пропов корневого компонента нужно собрать пропы вложенных инстансов: `mask`, `pseudoMask`, swapped-компоненты в `← left`, `right →`, `bottom`, `navbar` и т.п. У них есть **свои собственные пропы**, которыми Builder тоже должен уметь управлять.

**Паттерн (работает, проверено на inputText 1.0 → mask):**

```js
var comp = await figma.importComponentByKeyAsync(KEY);
var inst = comp.createInstance();

// Включаем все boolean'ы, чтобы вложенные инстансы стали активны
inst.setProperties({
  'mask#5913:3': true,
  'text#5913:57': true,
  'placeholder#5913:21': true,
  // ... все boolean пропы корня
});

// Рекурсивный поиск вложенных инстансов
var nested = inst.findAllWithCriteria({ types: ['INSTANCE'] });

var nestedPropsMap = {};
nested.forEach(function(n) {
  if (Object.keys(n.componentProperties || {}).length > 0) {
    // ВАЖНО: nodeName и mainComponentName — РАЗНЫЕ. nodeName используется в findOne, mainName — это имя самого компонента / варианта сета.
    nestedPropsMap[n.id] = {
      nodeName: n.name,                              // ← для findOne(name=...) — это и есть «имя ноды»
      mainComponentName: n.mainComponent.name,       // ← может быть variant-string типа 'height=hug'
      mainComponentKey: n.mainComponent.key,
      parentSetKey: n.mainComponent.parent ? n.mainComponent.parent.key : null,
      props: n.componentProperties
    };
  }
});

// Удалить тестовый инстанс — он создавался только для интроспекции
inst.remove();
```

**Записывай в правило `nodeName`, не `mainComponentName`.** Реальный пример: у uniCard вложенный инстанс имеет `nodeName='unicard'` (lowercase), но `mainComponentName='height=hug'` (это variant-string сета). `findOne(name='height=hug')` вернёт `null` — нода в дереве называется иначе.

**Как Builder применяет nested-пропы (паттерн A-025):**

```js
var input = (await figma.importComponentByKeyAsync(KEY)).createInstance();
input.setProperties({ 'mask#5913:3': true });

// Найти вложенный инстанс по имени
var maskInst = input.findOne(function(n) {
  return n.type === 'INSTANCE' && n.name === 'mask';
});
if (maskInst) {
  maskInst.setProperties({ 'mask': '+7 (000) 000-00-00' });
}
```

### Что собирать в правило для nested

В md-файле компонента — отдельный раздел «Вложенный компонент `<name>`»:
- имя инстанса (по нему находится через `findOne`)
- ключ COMPONENT_SET вложенного (для документации / отладки)
- варианты VARIANT-пропа с колонкой «Когда»
- любые TEXT/BOOLEAN пропы вложенного

### Глубина обхода

**Только 1 уровень.** Не уходить рекурсивно глубже — иначе токены правил взрываются. Если у вложенного компонента есть свои nested — это уже отдельная запись в `rules/components/<nested-name>.md` (или TBD).

### Когда вложенных пропов нет

Если у вложенного инстанса `componentProperties` пустой — пропусти, не пиши в правило. Например, `placeholder` (компонент-заглушка `aa40b8b9...`) не имеет пропов, описывать нечего.

---

## Шаг 3.6 — Сбор пропов компонентов из `preferredValues` (одно погружение)

«Уровень -1» (шаг 3.5) — это `nested`, что **уже стоит** в дефолтном инстансе. «Уровень -2» — компоненты, которые **можно подставить** в INSTANCE_SWAP-слот через свап (массив `preferredValues`). У них тоже бывают свои пропы — критично знать.

Пример: `uniCard 1.0 ❖ view` имеет всего 1 проп (`size`), но в `preferredValues` лежат 4 разные карточки (`160 ◇ uniCard`, `220`, `320`, `custom`), у каждой по 8 пропов с **разными `#id`**. Без сбора этих пропов Builder не знает как обращаться к содержимому карточки.

### Алгоритм

Для каждого `INSTANCE_SWAP`-пропа корня (или nested) — для каждого элемента `preferredValues`:

```js
for (var pv of preferredValues) {
  if (visitedKeys.has(pv.key)) continue;  // кэш по сессии
  visitedKeys.add(pv.key);

  var imp = pv.type === 'COMPONENT_SET'
    ? await figma.importComponentSetByKeyAsync(pv.key)
    : await figma.importComponentByKeyAsync(pv.key);

  var defs = imp.componentPropertyDefinitions || {};
  if (Object.keys(defs).length === 0) continue;  // заглушки типа placeholder/cardPlaceholder

  // записать defs + variants в результат
}
```

### Ограничения (чтобы не было взрыва)

- **Не идти глубже одного уровня preferredValues.** Не заходить рекурсивно в preferredValues самих preferredValues.
- **Кэш по сессии.** Один и тот же `key` обрабатывается один раз — preferredValues часто содержат `placeholder`/`iconGlyph 1.1` и т.п.
- **Пропускать пустые `componentPropertyDefinitions`** (заглушки без пропов).
- **Только для INSTANCE_SWAP-слотов с >1 preferredValue.** Если в слоте только 1 кандидат — он часто либо placeholder, либо очевидный (как `iconGlyph 1.1`).
- **СТОП, если компонент уже описан в `rules/components/`.** Перед погружением в `preferredValue` проверь:
  1. Резолвни ключ через `registry/index.json` (или `figma.importComponentByKeyAsync` → `comp.name`).
  2. Если имя соответствует уже существующему файлу `rules/components/<name>.md` (по конвенции «первое слово имени» или явному маппингу из раздела «Знания → Маппинг имя → файл»):
     - **Сравни:** число и состав пропов в правиле vs то, что сейчас отдаёт Figma (`componentPropertyDefinitions`).
     - **Если совпадает или правило полнее** — не трогай файл, в текущем правиле поставь ссылку: «слот может принимать `<name>` — пропы см. `rules/components/<name>.md`».
     - **Если правило устарело** (в Figma пропов больше, или пропали, или поменялись `#id`) — **перепиши файл целиком** по свежим данным. Старый файл удали и сгенерируй новый по тому же шаблону, что используешь для новых компонентов. Сохрани заголовок «когда использовать» и колонки «Когда» — они отражают семантику, которую API не даёт. Если такие колонки в старом файле были — перенеси их по соответствию имён.
  3. Это поддерживает single source of truth: одно правило на компонент, всегда актуальное.
  4. После переписывания запиши в `## Знания → Переписанные правила` строку: имя файла + кратко что изменилось (например, «inputText.md: +2 пропа, поменялся `#id` у `right ->`»).

### Запись в правило

Если все варианты в preferredValues имеют **одинаковую структуру пропов с разными `#id`** (как 160/220/320 uniCard) — оформи как **таблицу-сетку** с колонками по вариантам:

```markdown
| Проп (смысл) | `#id` для 160 | `#id` для 220 | `#id` для 320 |
|---|---|---|---|
| `buttons` (boolean) | `9038:22` | `9038:29` | `9038:36` |
```

Если структуры разные — описывай каждый вариант отдельной секцией.

---

## Шаг 3.7 — Визуальная валидация (skeleton + screenshot)

Перед финальной записью правила собери **тестовую карточку с дефолтами** на временной странице и сделай скриншот через `get_screenshot` с `enableBase64Response: true`. Это ловит то, что API не покажет:

- placeholder-стрипы вместо реального контента (silent failure при незаполненном swap)
- криво применённый VARIANT (например `roundCorners=false` когда дизайнерский дефолт = `true`)
- невидимый CTA-блок при `buttons=true` + не-свапнутом `✏️ buttons`
- TEXT-поле, которое не получило кастом-значение (показывает `Text` / `Title` / placeholder)

```js
// Пример: probe-карточка с применёнными дефолтами + скриншот
var probePage = figma.createPage();
probePage.name = '_probe_' + Date.now();
await figma.setCurrentPageAsync(probePage);

var inst = comp.createInstance();
probePage.appendChild(inst);
// apply все DEFAULT swaps + boolean toggles + sample texts

return { pageId: probePage.id, instId: inst.id };
// → потом get_screenshot(nodeId=instId, enableBase64Response=true)
```

Если на скриншоте видны заштрихованные диагонали, generic-«Title»/«Text», стрипованный CTA — **возвращайся к Шагу 3.6** и добей дефолты. Не записывай правило, пока визуально оно не выглядит «правдоподобно собранным».

**При негативном результате скриншота** (что-то пустое, placeholder, generic-текст) — добавь явную запись в `## Знания → Аномалии` или в само правило в раздел «Известные ограничения / нужный default-swap». Не делай вид, что «всё ок»: если для дефолтного отображения нужны 3 swap'а — так и пиши, не оставляй пустые слоты на самотёк.

> Важно: **в текущем sandbox `createImageAsync(url)` не работает** — Plugin API его не предоставляет. Если надо подменить картинку для probe — найди существующий `imageHash` в файле и переиспользуй, не пытайся загрузить с URL.

---

## Дедуп-анализ (триггер: rulesCoveragePct ≥ 30%)

Когда покрытие правилами достигает 30% (~46 компонентов из 153), перед записью очередного компонента запусти дедуп-анализ. Цель — найти повторяющиеся блоки пропов и вынести их в `rules/templates/<base-name>.md`, чтобы:
- избежать дрейфа (правка ключа в одном месте)
- сократить токены при загрузке нескольких связанных правил вместе

### Когда запускать

В начале сессии прочитай последнюю строку `tests/metrics.jsonl`:
- Если `rulesCoveragePct < 30%` — пропусти анализ, работай как обычно
- Если `rulesCoveragePct ≥ 30%` — запусти шаги 1-4 ниже **до** обработки следующего компонента

### Шаги анализа

**1. Сбор сигнатур.** Для каждого `rules/components/*.md` извлеки множество `figmaPropName` (ключи вида `propName#nodeId`). Получи карту `file → Set<figmaPropName>`.

**2. Поиск кластеров.** Сгруппируй файлы, у которых пересечение по ключам ≥ 5 пропов. Например:
- `inputText.md`, `inputTextArea.md`, `search.md` шарят `label#2014:8`, `hint#2014:27`, `right ->#2014:65`, `✏️ label#2014:84`, `✏️ hint#2014:106`, `✏️ bottom #2238:0`, `bottom ↓#2238:49` (7 пропов)

Каждый такой кластер — кандидат на shared template.

**3. Решение «выделять или нет».** Кластер выделяется если **все** условия выполнены:
- Размер кластера ≥ 3 файла
- Общих пропов ≥ 5
- Builder в реальных прогонах (по `tests/metrics.jsonl` поле `notes`) использует ≥ 2 файлов из кластера в одном экране хотя бы изредка
- Имена общих пропов семантически связаны (один master в Figma, не случайное совпадение `#id`)
- **Совпадают `defaultValue` у пропов**, не только ключи. Если у компонентов один и тот же `<- left#5911:34`, но у одного `default=true`, у другого `default=false` — проп остаётся в специфическом файле, не в shared.

Если хоть одно условие не выполнено — не выделять, оставить inline.

**4. Если решено выделить.** Создай `rules/templates/<base-name>.md` (имя по семантике: `text-field-base.md`, `card-slots-base.md`, ...). Туда — общая таблица пропов. В каждом исходном `rules/components/*.md` замени блок на ссылку:

```markdown
### Базовые пропы

См. `rules/templates/text-field-base.md` — `label`, `hint`, `bottom`, `right` слоты идентичны для inputText/inputTextArea/search.

### Отличия

(только специфические пропы этого компонента)
```

**5. Запись в `## Знания`.** Зафиксируй:
- какие файлы попали в кластер
- какой template создан
- решение и обоснование (или почему отказались выделять)

### Что НЕ выносить

- Отдельные совпадения `#id` без семантической общности (например, у `chip 1.0` и `tooltip 1.0` случайно один `label#NNNN:N` — это совпадение, не общая база)
- Кластеры из 2 файлов (overhead перевешивает экономию)
- Пропы, которые уже описаны в `rules/templates.md` (там слоты карточек: `bottom-slot`, `buttons-slot` и т.п.)

---

## Формат вывода агента

После обработки каждого компонента выводи краткий лог:

```
✅ navbar 1.0 → rules/components/navbar.md
   TEXT:         ✎ title#1234:0
   BOOLEAN:      ← left#5678:1, right →#5678:2, counter#9012:3
   INSTANCE_SWAP: ✏️ addon#3456:4 (3 preferredValues)
   VARIANT:      style (5), size (3)
   Аномалий:     нет

⚠️ inputTextArea 1.0 → rules/components/inputTextArea.md
   BOOLEAN:      counter#... — preferredValues пуст, уточнить у дизайнера
```

---

## Приоритет компонентов (старт)

Обрабатывай в этом порядке — самые критичные для Builder первые:

1. `navbar 1.0` (R-012)
2. `17 · primary ◇ content` + серия `11/13/15 · primary/custom/primaryOnColor ◇ content` (R-015)
3. `inputTextArea 1.0` (R-011)
4. `tagsView` (O-006)
5. `chip 1.0` (O-006)
6. `badge 1.2` (O-006)
7. `tab 1.0` (O-006)
8. `toast 1.0` (O-006)
9. `bottomSheet` (O-006)
10. `avaPicture 1.3` (O-006)

---

## Знания

_Раздел пополняется агентом автоматически после каждого компонента._

### Маппинг имя → файл

| Паттерн имени | Файл |
|---|---|
| `* ◇ content` | `content.md` |
| `navbar *` | `navbar.md` |
| `inputText*` | `inputText.md` |
| `chip *` | `chip.md` |
| `badge *` | `badge.md` |
| `tab *` | `tab.md` |
| `toast *` | `toast.md` |
| `avaPicture *` | `avaPicture.md` |
| `tagsView` | `tagsView.md` |
| `bottomSheet` | `bottomSheet.md` |
| `dropdown *` | `dropdown.md` |
| `featureBanner *` | `featureBanner.md` |
| `featureCustomBanner *` | `featureCustomBanner.md` |
| `systemBanner *` | `systemBanner.md` |
| `vibe *` | `vibe.md` |
| `buttonCell *` | `buttonCell.md` |
| `selectionCell *` | `selectionCell.md` |
| `uniBox *` | `uniBox.md` |

### Паттерны

- **VARIANT-пропы не имеют `#nodeId` в ключе.** `🎨 style`, `size`, `🏁 interactivity` — передаются в `setProperties` как `{ 'size': 'default' }`, без `#id`. Все остальные типы (TEXT, BOOLEAN, INSTANCE_SWAP) — с `#id`. Это критично: если передать VARIANT без `#id` — сработает. Если передать с `#id` — упадёт.
- **`preferredValues` в INSTANCE_SWAP содержит ключи конкретных вариантов (COMPONENT), а не ключи COMPONENT_SET.** Например, `shown @ buttonInline` — это один вариант из набора `buttonInline 1.1`. Нельзя использовать эти ключи для resolving через `registry/index.json` напрямую — нужен отдельный резолв через `figma.importComponentByKeyAsync`.
- **Не описывать «наследников» через ссылку — перечислять все пропы.** Был соблазн описать `inputTextArea 1.0` как «всё как `inputText`, плюс `symbolCounter`». Оказалось плохой идеей: defaultValue у `<- left#5911:34` отличается (`true` у inputText, `false` у inputTextArea). При сжатой записи такая разница теряется. Правило: даже если 99% пропов совпадают — выписывать каждое правило целиком. Объединение в `rules/templates/*.md` делает только дедуп-анализ (см. секцию ниже), и только когда совпадение не только по ключам, но и по defaultValue.
- **Все три компонента (inputText, inputTextArea, search) используют один базовый набор пропов** с одинаковыми `#id`: `label#2014:8`, `hint#2014:27`, `right ->#2014:65`, `✏️ label#2014:84`, `✏️ hint#2014:106`, `✏️ bottom #2238:0`, `bottom ↓#2238:49`. Это указывает на общий базовый компонент — может быть полезно для будущей оптимизации правил.
- **`overlayState` — служебный nested-инстанс**, повторяется в `buttonCell`, `selectionCell`, `uniCell` (и наверняка в других интерактивных ячейках). Хранит состояние pressed/hover/focus. **В правила не выносить, в свапах не упоминать** — это техническая деталь Figma, дизайнеру не релевантна.
- **slotName в API ≠ имя инстанса в дереве.** Слот в `componentPropertyDefinitions` называется `<- left#6240:7`, но после раскрытия в дереве инстанс может зваться `<- iconLeft` (а не `left`). Для `findOne` использовать **имя из дерева** (`findAllWithCriteria` показывает реальные имена), не имя ключа пропа.
- **Имена с точкой в начале (`.mainContentGroup`, `.additionalContentGroup`) — приватные компоненты ДС.** Не использовать через `importComponentByKeyAsync`, не упоминать в реестре. Доступ только через `findOne` после раскрытия родителя. У `uniBox 1.0` вся логика именно в этих приватных группах.
- **«Обёрточный» паттерн uniCard.** Компонент имеет всего 1 INSTANCE_SWAP-проп, но в его `preferredValues` лежат 4-5 разных вариантов с собственными пропами (160/220/320/custom uniCard). Это значит: смотри не только на корень, но и на «уровень -2» (preferredValues). См. шаг 3.6.
- **Один и тот же набор пропов с разными `#id`.** У 160/220/320/custom uniCard все 8 пропов смыслово одинаковые, но `#id` пляшет: `9038:22 / :29 / :36 / :43`. Builder обязан использовать правильный `#id` для конкретной карточки — иначе `setProperties` молча проигнорирует. В правилах оформлять таблицей-сеткой по вариантам.
- **Эмодзи в значениях VARIANT (не только в ключах).** У `featureCustomBanner.style` есть значение `✏️ custom` — с эмодзи в имени. В `setProperties` передавать ровно как есть (`'style': '✏️ custom'`). Не пытаться очищать строку.
- **`importComponentSetByKeyAsync` иногда падает на компоненте-варианте.** Ошибка: `Can only get component property definitions of a component set or non-variant component`. Это значит, что в `preferredValues` стоит ключ конкретного варианта (а не COMPONENT_SET и не самостоятельный COMPONENT). Ловить ошибку и в правило записывать ключ + имя без пропов, помечая «вариант сета — пропы как у родительского сета».
- **Семейные компоненты с почти идентичной структурой.** `featureBanner 2.0` и `systemBanner 2.0` шарят 6+ пропов с разными `#id` (`8817:0` vs `8817:0`, `8932:2` vs `8817:12` для buttonsView). Это сигнал что когда покрытие правил вырастет — пара кандидат на shared-template. Сейчас оставлять inline.
- **«Обёрточный» паттерн повторяется**: `uniCard 1.0 ❖ view`, `vibe ❖ view 1.0` — один INSTANCE_SWAP-проп в корне, вся логика в preferredValues. Признак: имя оканчивается на `❖ view`. Заранее ожидать что 0 nested и весь смысл в level -2.
- **🚨 INSTANCE_SWAP в `setProperties` принимает `.id` (строку), а не ComponentNode.** Передача самого `ComponentNode` падает с `Expected boolean/string/number/VARIABLE_ALIAS, received object`. В правилах писать `setProperties({ 'navbar#1491:0': navbar.id })` — обязательно `.id`. Это противоречит тому, что было в старой версии `FIGMA_IMPLEMENTER_AGENT.md` — теперь исправлено.
- **`text#NNNN:N` РАЗНЫЙ для разных размеров серии content.** В content-серии `#id` пляшет: `11→:3`, `13→:4`, `15→:5`, `17/11b/13b/15b/17b→:6`, `21b→:7`, `27b→:9`, `56b→#10026:106` (другой namespace). Опасный сюрприз: «общий ID для всей серии» — миф. **Всегда** проверяй конкретный компонент через `componentPropertyDefinitions`, не предполагай ID по аналогии с соседом по серии.
- **Boolean'ы у meshok ↓ не следуют общей нумерации.** В meshok ↓ есть `buttonsView#1074:0` (BOOLEAN — видимость) и `✏️ buttonsView#1073:1` (INSTANCE_SWAP — что подставить). Имена с одинаковой основой, но `#id` префиксы разные (`#1074` vs `#1073`). Не угадывать — сверять с API.
- **COMPONENT без componentPropertyDefinitions = «жёстко свёрстанный».** `navbar @ Lenta` (`03a47d8142d31d2e923daf1c9ef019a8e7983ca7`) — type `c`, без пропов. Содержимое прибито на этапе создания компонента в Figma. В правилах указывать «без пропов, использовать как есть».
- **«Близнецы» с одинаковым набором VARIANT-пропов** — кандидаты на объединение в одно правило. `primary ◇ tabbar` и `inverse ◇ tabbar` имеют только `platform`, идентичный набор. `numeric ◇ keyboard` и `alphabetic ◇ keyboard` — пара, оба с `platform` + `topbar`. Объединять в один файл (`tabbar.md`, `keyboard.md`).
- **«Bottom-sheet специализированные компоненты».** Серия `* · bS ◇ meshok` — это header'ы только для bottomSheet'а, не путать с обычным header'ом. Имеют почти идентичные пропы между собой (short/long), но разные `#id`. Выноси в один файл `bSHeader.md`.
- **`nodeName ≠ propName ≠ mainComponentName`.** Три разных пространства имён, не путать (валидировано на uniCard mini-test 2026-05-09):
  - `propName` (`size#6313:33`) — ключ в `componentPropertyDefinitions` / `setProperties`. Используется в `setDeep` path как идентификатор слота.
  - `nodeName` (`unicard`) — `n.name` в дереве после `createInstance`. Используется в `findOne(n => n.name === ...)`.
  - `mainComponentName` (`height=hug`) — `n.mainComponent.name`, может быть variant-string. **Не пригоден для findOne**.

  Пример: для uniCard slot `size#6313:33` после свапа создаёт INSTANCE с `nodeName='unicard'` и `mainComponentName='height=hug'`. `findOne(name='size')` или `findOne(name='height=hug')` вернут `null` — единственное правильное имя `'unicard'`.
- **preferredValues часто содержит COMPONENT_SET-ключи.** При резолве имени preferred значения **обязательно** пробуй оба: `importComponentByKeyAsync` И `importComponentSetByKeyAsync` параллельно, и фиксируй какой из них вернул узел. Это нужно для правильного импорт-сниппета в правиле (`.id` vs `.defaultVariant.id`). uniCard `size#6313:33` — пять SET-ключей, ни один не импортируется как COMPONENT.
- **VARIANT-проп `roundCorners` в media 1.1.** Default сета `false`, но дизайнерский дефолт — `true` (без скруглённых углов карточки выглядят жёстко). Это пример где API-default ≠ designer-default. **Всегда уточняй у дизайнера, какой вариант ставить по умолчанию** — не пиши API-default как «дефолт» в правило без подтверждения.
- **`createImageAsync(url)` не работает в use_figma sandbox.** Ошибка: `"createImageAsync" is not a supported API`. Нельзя загружать картинки по URL. В правилах не предлагать. Замена картинки в media-инстансе делается через переиспользование чужого `imageHash` из существующих fill'ов файла (find IMAGE-fill на другой странице, скопируй `imageHash`, подставь в `node.fills`).
- **Внутри media-инстанса 2 RECTANGLE с `name='image'`** — основной + дублёр для backgroundBlur. Меняешь fill — меняй на обоих, иначе фон-блюр останется со старой картинкой.
- **Кнопочные инстансы в `✏️ buttons`-слоте имеют numeric-имена (`01`, `02`, …).** TEXT-проп подписи у каждого — `✎ label#13004:2`. Доступ — через `findAll`-фильтр по наличию этого пропа, не по имени:
  ```js
  var btnNodes = inner.findAll(function(n){
    if (n.type !== 'INSTANCE' || !n.componentProperties) return false;
    var p = n.componentProperties;
    return p['✎ label#13004:2'] && p['✎ label#13004:2'].type === 'TEXT';
  });
  ```
- **`avatarsView 1.1` имеет `✏️ description#19477:9` TEXT-проп** для подписи под аватарами («15 общих друзей»). По умолчанию description присутствует, но дизайнер может его скрыть отдельным булевым (проверь componentPropertyDefinitions).

### Аномалии

- **Ключ `6ab9bb165ae2bcce4cc744b92027a408310d4f72` не найден в Figma** — присутствует в `preferredValues` слота `✏️ bottom` у inputText и inputTextArea как COMPONENT_SET, но при попытке импорта возвращает «not found». Вероятно, удалённый компонент. Игнорировать, не включать в правила.
- **Ключ `0677b92bce7e497590d980b9baea51c1eb744770` тоже unreachable** — присутствует во **всех 4 размерах** uniCard в `preferredValues` слота `✏️ bottom ↓` (320/220/160/custom), но `importComponent*` оба возвращают «not found». Вероятно archived/private компонент. В правиле явно пометить «недоступен по ключу — игнорируй, бери `avatarsView 1.1`».
- **`placeholder` (COMPONENT, `aa40b8b95980f6406a8604dbfebb660aa8ea1bbf`) есть в preferredValues, но не в реестре.** Это технический компонент-заглушка (placeholder для пустого слота), не предназначен для использования в `setProperties`. В правила не включать.
- **Варианты `shown/hidden/delete @ buttonInline` — это именованные варианты внутри набора**, а не самостоятельные компоненты. Они доступны по индивидуальному ключу, но в реестре числятся под именем родительского набора (`buttonInline 1.1`). При документировании нужно указывать оба: имя варианта и его ключ.
- **Заброшенные VARIANT-значения в Figma:** `style3`/`style4` у `buttonCell.style`, `↩︎ switchSide3`/`↩︎ switchSide4` у `selectionCell.↩︎ switchSide`. Это «недоразработанные» варианты. В правила писать только реально используемые (`primary`/`destructive` для buttonCell, `true`/`false` для switchSide), остальные — пометить «не используй» и записать сюда.
- **Опечатки в именах VARIANT-пропов.** У `numeric ◇ keyboard` проп называется `platofrm` (вместо `platform`). У соседнего `alphabetic ◇ keyboard` имя корректное. В правилах фиксировать ровно как в Figma и предупреждать Builder, что передавать нужно опечатанное имя. Заводить как issue (`R-NNN`) для дизайнера — поправить в Figma.
- **Несогласованные значения VARIANT в семействах.** У `chipChoicePrimary.size` варианты `default (44)` / `large (56)` (с пробелом и скобками!), а у `chipChoiceCustom.size` — `default-44` / `large-56` (с дефисом). Семантически одно и то же, но строки разные. В правилах фиксировать обе вариации с явным предупреждением.
- **Пробелы и спецсимволы в именах boolean-пропов.** `tabBase`: `← iconLeft #3854:0` (пробел перед `#`), `tag #7348:21`, `iconRight → #7348:28`, `dropdown ↓ #3629:0`. Это рабочие имена, передавай ровно как есть. У `tabOblako` встречается **двойной пробел**: `✏️ counter↗️  #7348:101`. Не очищать строку — Figma чувствительна к точному совпадению.
- **Заброшенные значения VARIANT с самореференцией.** У `label ◇ buttonCircle.style` среди обычных значений есть `buttonCircle 1.1` — это, видимо, ошибочно сохранённый вариант (имя другого компонента в качестве value). Записывать в раздел «не используй».
- **Серии с одинаковыми `#id` для всего семейства.** `header 1.1`, `headerCancel`, `headerSchevron`, `headerShowAll` — все 4 компонента имеют **идентичный набор пропов с одинаковыми `#id`** (`✎ title#13537:10`, `subtitle#9948:3` и т.д.). Аналогично серия `* · NN ◇ content` (33 компонента) — все шарят `text#9760:6`, `addon 1#9461:31`, etc. Это идеально для одного групповым md-файлом — выделять без оговорок при обнаружении такого паттерна.
- **Серии аватарок и иконок: ID-маппинг по размеру.** `avaPicture` имеет 8 проп-ключей `✎ addons [ N ]` с разными `#id` для каждого `size` (16/20/24/36/44/56/72/96/120/144). Это аналог паттерна `uniCard` (один смысл — разные `#id`). Рендерить таблицу size→#id.
- **Кириллические буквы в латинских словах.** `illustration 1.0.✎ ill [ сommunication ]#2677:3` — в начале слова `сommunication` стоит **русская `с`** вместо латинской `c`. Видимо, дизайнер набирал на русской раскладке. Передавать ровно как есть, не «исправлять».
- **Дубликат пропов с разной формой стрелок.** У `primary ◇ tag 1.2` есть два пропа: `right →#10249:9` (юникод-стрелка) и `right ->#16583:7` (ASCII-стрелка). Это разные пропы, а не опечатка. Описывать оба в правиле явно.
- **Имена пропов с ведущим пробелом.** `divider 1.0` имеет boolean ` label#18884:1` — имя начинается с пробела. Передавать ровно `' label#18884:1'` (с пробелом). Без пробела не сработает.
- **Заголовки `*◇ content` без VARIANT-пропов.** Компоненты типа `c` (не COMPONENT_SET) не имеют variant'ов — все различия (size, цвет) уже зашиты в имени самого компонента, а пропы (text, addons) общие. Это иной паттерн чем VARIANT-сеты.
- **`uniCard 1.0 ❖ view` имеет всего 1 проп** (`size#6313:33` INSTANCE_SWAP) и 0 nested при создании пустого инстанса. Это «обёртка вокруг одного слота». Не переписывать существующий `uniCard.md` — там описаны варианты размеров, что и составляет основную ценность правила.

### Переписанные правила

Сюда записываются файлы `rules/components/*.md`, которые агент переписал в текущем прогоне (потому что число/состав пропов в Figma не совпадал с правилом). Каждая строка — имя файла + кратко что изменилось.

_пусто — заполняется агентом_

### Не найдено в реестре

- `placeholder` (COMPONENT, `aa40b8b95980f6406a8604dbfebb660aa8ea1bbf`) — технический, не нужен
- `iconGlyph 1.1` (`2fc7ebc24d27602a439ae26600cc7d8eeae1fdf8`) — есть в правилах `uniCell.md`, но в `registry/index.json` отсутствует как самостоятельная запись. Нужно добавить в реестр при следующем `/syncKeys`
- `shown @ buttonInline`, `hidden @ buttonInline` и другие именованные варианты — не в реестре по дизайну: реестр хранит ключ дефолтного варианта набора, а не всех вариантов

### Дочерние пропы после INSTANCE_SWAP (A-025)

Статус: **РЕШЕНО** 2026-05-08.

Паттерн: после `createInstance()` родителя и включения нужных boolean'ов — найти вложенный инстанс через `findOne(n => n.type === 'INSTANCE' && n.name === '<имя>')` и вызвать `setProperties` уже на нём. Доступ к `componentProperties` через `findAllWithCriteria` после `createInstance` работает.

Проверено на: `inputText 1.0 → mask` (вложенный COMPONENT_SET `maskSmall @ inputText` с VARIANT-пропом `mask`: `random` / `+7 (000) 000-00-00` / `ДД.ММ.ГГГГ` / `https://`).

То же должно работать для `meshok ↑ → navbar.✎ title`, `meshok ↓ → buttonsView.← button1` и т.п. — тестировать при следующей сборке.
