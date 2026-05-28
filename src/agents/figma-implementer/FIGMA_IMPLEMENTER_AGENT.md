# Figma Implementer Agent

Получает апрувнутый CJM **+ план из шага 6 `/builder`** и реализует каждый экран в Figma через `use_figma`.

## Источник правды о пропах

**Перед использованием любого компонента-обёртки** (uniCard, selectionCell, navbar, inputText, meshok ↑/↓, buttonsView, header, featureBanner, …) — открой `rules/components/<slug>.rule.json` (slug → имя по правилам в `rules/components/ARCHITECTURE.md`; либо найди в `registry/index.json` по `name`, slugify сам). Читай:

- `variants` — VARIANT-пропы с `options`/`default`/`builderRule` (когда какой вариант выбрать).
- `slots` — INSTANCE_SWAP пропы с `preferred[]` (валидные кандидаты с `key`/`name`/`usage`) + `pairedBoolean` + `nestedProps.ruleRef`.
- `booleans` — BOOLEAN-пропы с `defaultOn`, `whenOn`, `whenOff`, `pairedSlot`.
- `textProps` — TEXT-пропы с `sampleTexts` и `builderRule`.
- `nestedInstances` — фиксированные дочерние инстансы с `policy` (`askDesigner`/`locked`/`useDefault`).
- `doc.whenToUse`, `doc.edgeCases` — высокоуровневая семантика.

Не угадывать пропы по имени и не использовать `findAll(TEXT)[0].characters = ...` — это приводит к silent failures (текст пишется не в тот нод). Если у компонента `approved: false` или `doc.whenToUse` короткий/неконкретный — задача дизайнера, не выкручивайся через эвристики, а спроси: «правило `<slug>.rule.json` неполное, как использовать?».

Cold data (`.raw.json`) — debug-only, **не открывай**. Microtest results там полезны только для `/parseProps` диагностики.

> **Правило может устареть.** Несколько раз ловили: имена node'ов поменялись, ключи preferred values переехали, дефолтные варианты переписали. Если **что-то странное** при `findOne` / `setProperties` (вернулся `null`, `Component not found`, или визуально остался placeholder) — **не доверяй файлу, запускай probe** (см. ниже) и cross-validate. После probe — если расхождение реальное, дизайнер запускает `/syncKeys` и/или `/parseProps <slug>`.

---

## Probe пропов незнакомого / сомнительного компонента

Запусти **один** `use_figma`-вызов с универсальным probe'ом до того, как писать в файл или редактировать пропы. Цель — за один заход вытащить:

1. `componentPropertyDefinitions` корня + всех вложенных вариантов
2. Для каждого `INSTANCE_SWAP` — список preferred values + имя каждого (`importComponentByKeyAsync`/`importComponentSetByKeyAsync` параллельно — preferred часто содержит **COMPONENT_SET-ключи**)
3. После `createInstance(+ дефолтный свап)` — дамп дерева (`name`, `type`, `mainComponent.name`)
4. Для каждого вложенного INSTANCE — `componentProperties` (типы и default-values) — нужно для TEXT-пропов
5. Все ноды с TEXT-пропом → `{nodeName, propKey, defaultValue}`

```js
// Шаблон probe — заполни KEY и DEFAULT_SWAPS под компонент
var ROOT = 'KEY';
var setNode = await figma.importComponentSetByKeyAsync(ROOT).catch(function(){ return null; });
var compNode = setNode || await figma.importComponentByKeyAsync(ROOT);
var defs = (setNode || compNode.parent?.type === 'COMPONENT_SET' ? compNode.parent : compNode).componentPropertyDefinitions || {};

// 1. Дамп defs
var slim = {};
for (var k in defs) if (Object.prototype.hasOwnProperty.call(defs, k)) {
  slim[k] = { type: defs[k].type, default: defs[k].defaultValue, preferred: defs[k].preferredValues || null, variants: defs[k].variantOptions || null };
}

// 2. Resolve preferred values names (try Component AND Set)
var prefNames = {};
for (var pk in slim) {
  if (slim[pk].type !== 'INSTANCE_SWAP' || !slim[pk].preferred) continue;
  for (var pi = 0; pi < slim[pk].preferred.length; pi++) {
    var pv = slim[pk].preferred[pi].key;
    if (prefNames[pv]) continue;
    var asC = null, asS = null;
    try { asC = await figma.importComponentByKeyAsync(pv); } catch(e) {}
    try { asS = await figma.importComponentSetByKeyAsync(pv); } catch(e) {}
    prefNames[pv] = asS ? ('SET ' + asS.name) : (asC ? ('COMP ' + asC.name) : 'UNREACHABLE');
  }
}

// 3. Создать probe-инстанс на временной странице, дамп дерева
var probePage = figma.createPage();
probePage.name = '_probe_' + Date.now();
await figma.setCurrentPageAsync(probePage);
var inst = (await figma.importComponentByKeyAsync(setNode ? setNode.defaultVariant.key : ROOT)).createInstance();
probePage.appendChild(inst);
// здесь — apply DEFAULT_SWAPS если знаешь их

var tree = [];
function walk(n, d) {
  if (d > 5) return;
  tree.push(new Array(d*2+1).join(' ') + n.type + ' "' + n.name + '"' + (n.type==='INSTANCE' && n.mainComponent ? (' → ' + n.mainComponent.name) : ''));
  if ('children' in n && n.children) for (var i = 0; i < n.children.length; i++) walk(n.children[i], d + 1);
}
walk(inst, 0);

// 4. nested INSTANCE props + TEXT-пропы по дереву
var nested = inst.findAll(function(n){return n.type === 'INSTANCE';});
var nestedProps = [];
var textProps = [];
nested.forEach(function(n){
  var p = n.componentProperties || {};
  var entry = { name: n.name, mainName: n.mainComponent ? n.mainComponent.name : '?', props: {} };
  for (var k in p) if (Object.prototype.hasOwnProperty.call(p, k)) {
    entry.props[k] = { type: p[k].type, value: p[k].value };
    if (p[k].type === 'TEXT') textProps.push({ nodeName: n.name, mainName: entry.mainName, propKey: k, defaultValue: p[k].value });
  }
  nestedProps.push(entry);
});

var result = { props: slim, prefNames: prefNames, tree: tree, nestedProps: nestedProps, textProps: textProps };

// Cleanup: переключаемся на главную страницу и удаляем probe-страницу.
// Удалить страницу нельзя пока она active — поэтому setCurrentPageAsync на любую другую перед remove.
var fallbackPage = figma.root.children.find(function(p){ return p.id !== probePage.id; });
if (fallbackPage) await figma.setCurrentPageAsync(fallbackPage);
try { probePage.remove(); } catch(e) { /* leave the page if remove is blocked, не критично */ }

return result;
```

После probe'а — **обязательно скриншот** дефолтно-собранной карточки (`enableBase64Response: true`) до того как писать доку. Глазами видно: «media пустая → placeholder», «кнопка показывает "Что сделать" → label не переопределён», и т.п.

### Что обязательно проверить probe'ом

- **Имя ноды vs имя пропа.** Например в uniCard prop = `size#6313:33`, но реальная нода называется `unicard` (lowercase). `findOne(n => n.name === 'size')` вернёт `null`. Имена пропов и нод — **разные пространства**, никогда не предполагай эквивалентность.
- **Тип ключа в preferred values.** Часто это `COMPONENT_SET` — `importComponentByKeyAsync` упадёт с `Component not found`. Импорт сета: `importComponentSetByKeyAsync(key).defaultVariant.id`.
- **Какой вариант реально дефолтный.** `defaultValue` в `componentPropertyDefinitions` — это начальное значение, которое стоит в свежесозданном инстансе. Дизайнерский «дефолт» («что я хочу видеть в большинстве случаев») может отличаться — спрашивай.
- **Boolean-токглы рядом со swap-слотами.** Многие swap-слоты включаются булевым тогглом (`bottom ↓#:N` + `✏️ bottom ↓#:N`, `right ->#:N` + `✎ right ->#:N`). Без булева swap не виден визуально — silent failure.

### Анти-паттерны при probe / сборке

- **`createImageAsync(url)` — не существует** в Plugin API внутри `use_figma`. Подгружать картинки по URL нельзя. Заменить картинку = взять `imageHash` из существующего fill в файле и подставить в `node.fills`.
- **Не редактируй TEXT через `node.characters = ...` без `loadFontAsync`.** `Roboto Flex` в этом ДС используется в `Regular`, `SemiBold`, `Bold` — грузи нужный стиль до записи.
- **Не верь handwritten-секции, если probe её не подтвердил.** Уже ловили: `findOne(name='size')` (надо `'unicard'`), `radio` ↔ `checkbox` ключи переписаны, accent-варианты, которых нет в preferred values.

---

## Вход

К моменту запуска у тебя в контексте уже есть:
- `researchOutput`
- утверждённый CJM
- план шага 6 (скелет каждого экрана: `meshok ↑`, контент, `meshok ↓`)
- `rules/skeleton.md` и нужные секции `rules/components/*` (загружены в шаге 6)
- `registry/index.json` (загружен в шаге 6)
- `_session.target_file_key` — fileKey файла-копии шаблона, согласованный в Шаге 0.W `/builder`. **Каждый вызов `use_figma`** в этом агенте передаёт `fileKey: _session.target_file_key` параметром. Не используй неявный default — MCP попадёт в headless-sandbox и запись будет потеряна.
- `_session.target_section_id` — id целевой платформенной секции (Шаг 0.Y). `appendChild` собранных фреймов — в эту секцию, не на `currentPage`.

**Не перечитывай `rules.md` или `rules/components/*.rule.json` целиком.** Если нужны детальные пропы конкретного компонента — открой ровно `rules/components/<slug>.rule.json`. Slug → имя по правилам в `rules/components/ARCHITECTURE.md`; либо `name → [lib, key, type, ...]` в `registry/index.json`.

---

## Скелет каждого мобильного фрейма

```
фрейм
├── meshok ↑   ← навбар / хэдер / поиск / табы
├── [контент]  ← всё между мешками
└── meshok ↓   ← системный компонент + кнопки + тост
```

**Нарушение скелета — блокер.**

---

## Состояния — отдельными фреймами (#131.2)

Если в `_session.states_covered` от `/builder` Шага 6 H перечислены не только `"default"`, а ещё `"empty"`, `"loading"` или `"error"` — **каждое не-default состояние рисуется как отдельный фрейм рядом** с happy-вариантом. Не «прятать» состояния внутри одного экрана через переключение `visible` или скрытие layer'ов.

Расстановка:
- **Целевая страница.** Если `_session.target_page_id` не `null` (ветка 2 — новая страница в существующем файле), **первой строкой** каждого `use_figma`-блока ставь `await figma.setCurrentPageAsync(await figma.getNodeByIdAsync(_session.target_page_id))`. Без этого MCP работает с первой страницей файла и фреймы поедут не туда.
- **Parent — целевая платформенная секция** (`_session.target_section_id` из Шага 0.Y `/builder`). Не `figma.currentPage` напрямую. Каждый созданный фрейм добавляется в секцию через `(await figma.getNodeByIdAsync(SECTION_ID)).appendChild(frame)`. Поверх страницы вне секции фреймы не создаём — иначе iOS-копирование Шага 7.5 не найдёт их в секции.
- **На первой записи — удалить placeholder `Экранчик`.** В чистом дубликате (ветка 1) внутри каждой секции лежит декоративный пустой фрейм `Экранчик` с обвязкой `meshok ↑/↓`. Он мешает раскладке. Перед `appendChild` первого фрейма пройдись по `section.children`, найди первый фрейм с именем точно `Экранчик` — если есть, `placeholderFrame.remove()`. В ветке 2 (новая страница) секций изначально нет — Шаг 0.Y их создаст пустыми, удалять там нечего.
- Default-фреймы стартуют с `x = 0, y = 0` относительно секции. Чужой работы внутри секции не ожидаем: ветка 1 — паттерн «один файл = одна задача», ветка 2 — новая пустая страница.
- Default-фреймы — горизонтальный ряд внутри секции: `Экран 1 (Welcome)`, `Экран 2 (Регистрация)`, `Экран 3 (OTP)`, ...
- Под каждым default'ом — колонка его состояний (если есть): `Экран 2 — loading`, `Экран 2 — error`, `Экран 2 — empty`.
- Расстояние между фреймами: **80px по горизонтали** (между разными экранами), **40px по вертикали** (между состояниями одного экрана).

⚠ Эти 80/40 — это `x`/`y` координаты фреймов **внутри секции** (Figma SECTION — frame-like контейнер с относительными координатами, не auto-layout), а **не gap внутри фрейма**. **Внутри** фреймов (auto-layout, между компонентами) — только переменные `const/*` из `numbers-paddings`, никаких хардкодных px (правило R-024+ из `rules/skeleton.md`). Раскладка внутри секции — исключение, потому что секция не auto-layout.

Именование:
- Default: `Экран N — <name>` (где `<name>` — имя из CJM).
- Состояние: `Экран N — <state>` или `Экран N — <name> (<state>)`. Состояния lowercase: `loading`, `error`, `empty`.

Содержимое не-default фрейма:
- **loading** — копия default'а, но контентные блоки заменены на skeleton-компоненты ДС (если есть). Если skeleton-компонента нет — используй shimmer-loader из templates.
- **error** — копия default'а, но в зоне `meshok ↓` добавлен `featureBanner` или `systemBanner` с error-стилем и поясняющим текстом («Не удалось загрузить — попробуйте ещё раз»). Кнопка «Повторить» — primary `button 1.1`.
- **empty** — копия default'а, но контент-зона заменена на пустое состояние: илло из библиотеки илло + короткий текст + CTA-кнопка (если уместно).

Если у дизайнера была явная инструкция по дизайну конкретного состояния — следуй ей. Если нет — собирай по шаблону выше из имеющихся компонентов ДС.

---

## Правила

- **Каждый мобильный фрейм** содержит `meshok ↓`.
- **`meshok ↓` всегда на абсолютной позиции**, прибит к низу фрейма. После `frame.appendChild(meshokDownInst)`:
  ```js
  meshokDownInst.layoutPositioning = 'ABSOLUTE';
  meshokDownInst.constraints = { horizontal: 'STRETCH', vertical: 'MAX' }; // left+right + bottom
  meshokDownInst.resize(frame.width, meshokDownInst.height);               // 🔴 ОБЯЗАТЕЛЬНО — иначе ширина ≈360
  meshokDownInst.x = 0;
  meshokDownInst.y = frame.height - meshokDownInst.height;
  ```
  Если контент уходит под кнопки — поставь `meshok ↓.setProperties({ 'onScroll#1091:7': true })`.
- **`meshok ↑`** — обычный child VERTICAL-фрейма (не абсолют).
- **Кнопки** — только через `buttonsView`-слот в `meshok ↓`.
- **Навбар** — только через `navbar`-слот в `meshok ↑`.
- **Тост** — только через `float/toast`-слот в `meshok ↓`.
- **Размеры фрейма** — переменные `screen-width`, `screen-height` из `numbers-paddings`.
- **Все отступы и gap** — переменные `const/*`. Никаких хардкодных px.
- **Цвета** — только из 🎨 Colors Palette (`bOJXsSkQici3zrKC3zJKpp`). Никаких HEX.
- **Текстовые стили** — только из 📝 Typography (`cs2pw2X0raQVJwkjBq0dJU`).

### Чего нет в реестре

Если по задаче нужен компонент/паттерн, которого нет в ДС:

1. **Сначала** — собирай максимально близкий аналог из существующих компонентов реестра. Например: «звёздный рейтинг» → ряд `button 1.1` с iconLeft=star; «свайп-карты» → стек `uniCard`; «прогресс-бар по шагам» → ряд узких divider'ов разного цвета.
2. **Если аналога нет** — рисуй кастомный фрейм/text/rectangle. Но даже тогда:
   - цвета — только из 🎨 Colors Palette,
   - отступы — переменные `numbers-paddings`,
   - текстовые стили — только из 📝 Typography.
3. Назови такой блок `<role> ⚠️ кастом — нет компонента в ДС`, чтобы дизайнер сразу видел gap.
4. После сборки запиши gap в issues (`R-NNN` или `A-NNN`).

Никогда не блокируй задачу полностью из-за отсутствия компонента. Никогда не используй HEX/хардкоды даже в кастомных блоках.

### `meshok ↓ → systemComponent`

| Когда | Что |
|---|---|
| Регистрация, онбординг, авторизация | `handle ❖ view` |
| Основные экраны (светлый фон) | `tabbarPrimary ❖ view` |
| Основные экраны (тёмный фон) | `tabbarInverse ❖ view` |
| Ввод цифр | `keyboardNumeric ❖ view` |
| Ввод букв | `keyboardAlphabetic ❖ view` |

---

## Импорт компонентов

`registry/index.json`: `name → [lib, key, type, tier, approved]`. `type: "c"=component, "s"=component_set`. Импорт — единым путём:

- **Любой компонент** → `figma.importComponentByKeyAsync(key)`. Для `s` `key` хранит variant-key default'а (genIndex берёт это из `rule.key`, который контрактно variant-key), поэтому импорт всегда возвращает COMPONENT (один из вариантов сета).
- Если нужен **не дефолтный вариант** сета — `instance.setProperties({ <axis>: '<value>', ... })` переключит инстанс. Список доступных axes/values — в `rules/components/<slug>.rule.json:variants`. Карты «всех вариантов с ключами» больше нет — Figma Plugin API ходит по сету через инстанс, не через отдельный файл.

После импорта — `instance.setProperties({ ... })` (для пропов уровня компонента и variant axes).

### INSTANCE_SWAP

Для пропов типа INSTANCE_SWAP (свапы вложенных компонентов: `navbar` в `meshok ↑`, `systemComponent`/`buttonsView` в `meshok ↓` и т.п.) — передавай **`.id` импортированного `ComponentNode`** (строку), а не сам объект и не созданный через `createInstance()` инстанс:

```js
// ✅ правильно — .id (строка)
var navbarComp = await figma.importComponentByKeyAsync('b652cf46...');
meshokUpInst.setProperties({ 'navbar#1491:0': navbarComp.id });

// ❌ неправильно — сам ComponentNode не принимается
meshokUpInst.setProperties({ 'navbar#1491:0': navbarComp });
// → Error: Expected boolean/string/number/VARIABLE_ALIAS, received object

// ❌ неправильно — createInstance() создаёт лишний инстанс на странице
var nav = navbarComp.createInstance();
meshokUpInst.setProperties({ 'navbar#1491:0': nav });
```

Никогда не вызывай `createInstance()` для свапа — Figma сама создаст вложенный инстанс при сваппинге.

Пример plugin-кода — `src/agents/figma-implementer/skeleton.example.js`.

### Доступ к пропам вложенных инстансов

После свапа (или включения boolean'а, который показывает nested компонент) внутренние пропы вложенного инстанса **недоступны через `setProperties` родителя**. Нужно идти по дереву инстансов вглубь.

#### Уровень 1 (прямой child)

Подходит для `mask` в inputText, и в простых обёртках:

```js
var input = (await figma.importComponentByKeyAsync(KEY)).createInstance();
input.setProperties({ 'mask#5913:3': true });

var maskInst = input.findOne(function(n) {
  return n.type === 'INSTANCE' && n.name === 'mask';
});
maskInst.setProperties({ 'mask': '+7 (000) 000-00-00' });
```

#### Уровень 2+ (deep-nested) — паттерн `setDeep`

Для navbar/buttonCell/contentsView/buttonsCircleView и т.п. — текст-проп лежит ещё глубже. Используй **рекурсивный обход по path**:

```js
function setDeep(rootInst, path, props) {
  var cur = rootInst;
  for (var i = 0; i < path.length; i++) {
    cur = cur.findOne(function(n) {
      return n.type === 'INSTANCE' && n.name === path[i];
    });
    if (!cur) return false;
  }
  try { cur.setProperties(props); return true; } catch(e) { return false; }
}
```

#### Известные пути для частых компонентов

| Slot/компонент | Путь | Пример пропа |
|---|---|---|
| `meshok ↑.navbar.title` | ❌ `setDeep` не работает — `title` внутри middle это FRAME, не INSTANCE. Используй хелпер `setNavbarTitle(meshokUp, text)` | middle → findAll(FRAME 'title') → direct children → TEXT name='text' |
| `meshok ↑.navbar.middle` (если middle = contentsView) | `['navbar', 'middle']` | первый text-проп |
| `meshok ↓.buttonsView.button-N.label` | `['buttonsView', 'size']` затем у каждой кнопки `['buttonsView', 'size', '<button-name>']` | `✎ label#13004:2` |
| `buttonCell.middle.title` | `['middle', 'title']` | `text#9760:6` |
| `selectionCell.left` (selection control) | `['left']` | `selected` |
| `uniCard.size` (внутренняя карточка) | ⚠️ `setDeep` тут не работает — `setDeep` матчит по `n.name`, а внутренний инстанс называется `'unicard'` (lowercase), не `'size'` (это имя пропа). Используй `findOne(n => n.name === 'unicard')`. title/subtitle/desc — отдельные INSTANCE-дети с TEXT-пропами `text#9760:6` (title), `text#9760:4` (subtitle, desc) | `🅃 text#9038:39` (320), `imageContent #9038:40` (320) |
| `uniBox.mainContentGroup` (приватная) | `['mainContentGroup']` | aдоны центр/края |
| `bottomSheet.top.title` | `['top', 'middle', 'title']` (если short) | `text#9760:6` |
| `buttonsCircleView.buttons` | `findAllWithCriteria` → найти каждую `buttonCircle` и поштучно `setProperties` | `✎ label#3503:0` |

### 🔴 Wrapper-компоненты: обязательно свапать default placeholder (A-034..A-038, валидировано в test 13)

Многие компоненты-обёртки рендерятся как **стрипованный плейсхолдер**, пока ты не свапнул их внутренний slot. Это **silent failure** — `setProperties` возвращается без ошибки, error-pipeline молчит, `errorsCount=0`, но визуально на экране — пустые заштрихованные блоки.

**Признаки в скриншоте:** заштрихованный диагональными линиями оранжевый/синий прямоугольник там, где должен быть контент. Это и есть default `aa40b8b9...` placeholder.

**Правило:** для каждого wrapper'а из таблицы ниже — сначала свап inner-slot'а на реальный variant-set (через `importComponentSetByKeyAsync` + `.defaultVariant.id`), и только потом setText/setDeep на текстовые пропы.

#### Real prop names — валидированы инспекцией `componentPropertyDefinitions`

| Компонент | Что свапнуть/задать | Prop name (точное имя) | Тип | Примечание |
|---|---|---|---|---|
| `meshok ↓` | **сделать buttonsView видимым** | `buttonsView#1074:0` | BOOLEAN | **default=false** — без этого все кнопки невидимы (A-037) |
| `meshok ↓` | свап CTA-секции | `✏️ buttonsView#1073:1` | INSTANCE_SWAP | передавать `.id` |
| `meshok ↓` | свап systemComponent (tabbar/handle/keyboard) | `✏️ systemComponent#1073:2` | INSTANCE_SWAP | toggle `systemComponent#2273:0` (default=true) |
| `meshok ↓` | hide system если только кнопки | `systemComponent#2273:0` | BOOLEAN | поставить `false` |
| `meshok ↑` | свап navbar | `navbar#1491:0` | INSTANCE_SWAP | по дефолту = универсальный placeholder |
| `navbar 1.0` | **свап middle на content** | `✎ · middle ·#1031:6` | INSTANCE_SWAP | default=placeholder; preferred values — content variant sets |
| `navbar 1.0` | toggle middle visibility | `· middle ·#1031:15` | BOOLEAN | default=true (видим) |
| `navbar 1.0` | left/right swap | `✎ ← left#1031:0`, `✎ right ->#1031:3` | INSTANCE_SWAP | + boolean toggles `<- left#1031:9`, `right ->#1031:12` |
| `inputText 1.0` | **label поверх инпута** | `✏️ label#2014:84` | TEXT | default=`label`; visibility — `label#2014:8` |
| `inputText 1.0` | **hint под инпутом** | `✏️ hint#2014:106` | TEXT | default=`hint`; visibility — `hint#2014:27` |
| `inputText 1.0` | mask внутри (вместо placeholder) | `mask#5913:3` (BOOLEAN) + nested `mask` instance | BOOLEAN+INSTANCE | toggle on, потом `findOne(name='mask').setProperties({mask:'+7 ...'})` |
| `selectionCell 1.1` | **свап middle (контент ячейки)** | `· middle ·#5934:11` | INSTANCE_SWAP | default=placeholder. Preferred: 3 single + 3 SETs (content variants). Без свапа — пустой стрип (A-038) |
| `selectionCell 1.1` | свап selection control (radio/check) | `selection#5934:0` | INSTANCE_SWAP | preferred: 3 SETs (radio/checkbox/toggle) |
| `featureBanner 2.0` | **title** | `🅃 title#9189:0` | TEXT | default=`Title` (R-031) |
| `featureBanner 2.0` | **subtitle** | `🅃 subtitle#9189:5` | TEXT | + visibility `subtitle#8817:0` |
| `featureBanner 2.0` | CTA (внутренний buttonsView) | через nested `buttonsView` → `size` → `button-1` → label | INSTANCE_SWAP+setDeep | дефолт «Что сделать» |
| `header 1.1` | **title** | `✎ title#13537:10` | TEXT | default=`Title` (R-032) |
| `header 1.1` | subtitle | `✎ subtitle#13537:15` (TEXT) + `subtitle#9948:3` (BOOLEAN) | TEXT+BOOLEAN | по дефолту скрыт |
| `header 1.1` | counter | `✎ counter#13537:20` (TEXT) + `counter#9948:2` (BOOLEAN) | TEXT+BOOLEAN | для "5 уведомлений" и т.п. |
| `header 1.1` | размер шрифта | `size` (VARIANT) | VARIANT | `'17'` / `'21'` / `'27'` / `'15'` |
| `uniCard 1.0 ❖ view` | **свап size на content-set** | `size#6313:33` | INSTANCE_SWAP | default=`cardPlaceholder`. Preferred — 4 SETs (220/320/160/custom) + placeholder. **Стандарт — 220** (`0370cc32...`). Импорт через `importComponentSetByKeyAsync` → `.defaultVariant.id`. Без свапа — пустой стрип (A-036). Внутренний инстанс называется `'unicard'` (lowercase), см. `rules/components/uniCard.md` |
| `chipsView 1.0 ❖ view` | свап template-чипа | `swap#7472:0` | INSTANCE_SWAP | **только один slot** — для нескольких разных чипов используй `addChild(chip-instance)` вручную (R-033 — нужна доп. инвестигация) |
| `buttonsView 1.0 ❖ view` | свап size (button-row) | `size#12637:13` | INSTANCE_SWAP | preferred — 4 single components (28/40/52/etc размеры рядов) |

#### Boilerplate-helpers (валидированы в test 13 probe)

```js
// Helper: meshok ↓ с системой и кнопками
function makeMeshokDown(frame, opts) {
  var m = meshokDownC.createInstance();
  frame.appendChild(m);
  m.layoutPositioning = 'ABSOLUTE';
  m.constraints = { horizontal: 'STRETCH', vertical: 'MAX' }; // left+right + bottom
  m.resize(frame.width, m.height);                            // 🔴 без этого ширина останется ≈360px

  var props = {};
  if (opts.system) {
    props['✏️ systemComponent#1073:2'] = opts.system.id;          // tabbar/handle/keyboard
    props['systemComponent#2273:0'] = true;
  } else {
    props['systemComponent#2273:0'] = false;                       // если нет — скрыть placeholder
  }
  if (opts.buttons && opts.buttons.length) {
    props['✏️ buttonsView#1073:1'] = buttonsViewC.id;
    props['buttonsView#1074:0'] = true;                            // 🔴 ОБЯЗАТЕЛЬНО — иначе кнопки невидимы (A-037)
  }
  m.setProperties(props);

  // ставим label на каждую кнопку — путь buttonsView → first INSTANCE child → row N → button 1
  if (opts.buttons && opts.buttons.length && buttonsSizeC) {
    var bv = m.findOne(function(n){return n.type==='INSTANCE' && n.name==='buttonsView';});
    if (bv) {
      bv.setProperties({ 'size#12637:13': buttonsSizeC.id });
      var sizeContainer = null;
      for (var i = 0; i < bv.children.length; i++) if (bv.children[i].type === 'INSTANCE') { sizeContainer = bv.children[i]; break; }
      if (sizeContainer) {
        for (var bi = 0; bi < opts.buttons.length; bi++) {
          var rowName = 'row ' + (bi + 1);
          var row = sizeContainer.findOne(function(n){return n.type==='INSTANCE' && n.name === rowName;});
          if (!row) continue;
          var btn = row.findOne(function(n){return n.type==='INSTANCE' && n.name === 'button 1';});
          if (btn) try { btn.setProperties({ '✎ label#13004:2': opts.buttons[bi] }); } catch(e) {}
        }
      }
    }
  }
  m.x = 0; m.y = frame.height - m.height;
  return m;
}

// Helper: navbar с заголовком (no subtitle) — свап middle-set + setText
// 🔴 НЕ используй findOne/findAll(TEXT) внутри middle — это рекурсивно и попадает в скрытый
//    TEXT name='🤡' внутри addon 0 раньше, чем в видимый TEXT name='text' (A-178).
//    Путь: INSTANCE 'middle' → children[0] FRAME → прямые children → TEXT name='text'.
// 🔴 Перед вызовом: await figma.loadFontAsync({ family:'Roboto Flex', style:'SemiBold' })
//    (шрифт navbar middle title, validated mini-test-2026-05-09)
async function setNavbarTitle(meshokUp, title) {
  meshokUp.setProperties({ 'navbar#1491:0': navbarC.id });
  var nav = meshokUp.findOne(function(n){return n.type==='INSTANCE' && n.name === 'navbar';});
  if (!nav) return;
  // Свап middle на "no subtitle · content" SET (defaultVariant = size=default)
  var navMiddleSet = await figma.importComponentSetByKeyAsync('60d00e30176b68d1920f6122c8b493e838448562');
  nav.setProperties({ '✎ · middle ·#1031:6': navMiddleSet.defaultVariant.id, '· middle ·#1031:15': true, alignMiddle: 'true' });
  // middle — имя инстанса внутри навбара (не '· middle ·', это имя пропа)
  var middle = nav.findOne(function(n){return n.type==='INSTANCE' && n.name === 'middle';});
  if (!middle) return;
  // FRAME 'title' — прямой ребёнок middle; TEXT 'text' — прямой ребёнок FRAME
  var titleFrame = middle.children.length > 0 ? middle.children[0] : null;
  if (!titleFrame || titleFrame.type !== 'FRAME') return;
  for (var ti = 0; ti < titleFrame.children.length; ti++) {
    var tc = titleFrame.children[ti];
    if (tc.type === 'TEXT' && tc.name === 'text') { try { tc.characters = title; } catch(e) {} break; }
  }
}

// Helper: navbar с заголовком + подзаголовком
async function setNavbarTitleSub(meshokUp, title, sub) {
  meshokUp.setProperties({ 'navbar#1491:0': navbarC.id });
  var nav = meshokUp.findOne(function(n){return n.type==='INSTANCE' && n.name === 'navbar';});
  if (!nav) return;
  // Свап middle на "has subtitle · contentsView" SET
  var navSubSet = await figma.importComponentSetByKeyAsync('2e675ccf9da7a9e498c90fb37c3c8aa56823e56c');
  nav.setProperties({ '✎ · middle ·#1031:6': navSubSet.defaultVariant.id, '· middle ·#1031:15': true, alignMiddle: 'true' });
  var middle = nav.findOne(function(n){return n.type==='INSTANCE' && n.name === 'middle';});
  if (!middle) return;
  // middle.children[0] — FRAME 'title +subtitle' (single direct child)
  var subFrame = (middle.children.length > 0 && middle.children[0].type === 'FRAME') ? middle.children[0] : null;
  if (!subFrame) return;
  for (var ti = 0; ti < subFrame.children.length; ti++) {
    var tc = subFrame.children[ti];
    if (tc.type === 'TEXT' && tc.name === 'text') { try { tc.characters = title; } catch(e) {} }
    // subtitle TEXT может называться 'subtitle' или 'text 2' — пробуем оба
    if (tc.type === 'TEXT' && (tc.name === 'subtitle' || tc.name === 'text 2')) {
      try { tc.characters = sub; } catch(e) {}
    }
  }
}

// Helper: navbar middle = search 1.0 size=small
// Правило Насти: в navbar middle поиск вставляется ТОЛЬКО size=small (не дефолтный size=default).
// Используем ключ конкретного варианта (не SET-ключ, не importComponentSetByKeyAsync).
async function swapNavbarMiddleToSearch(meshokUp) {
  meshokUp.setProperties({ 'navbar#1491:0': navbarC.id });
  var nav = meshokUp.findOne(function(n){return n.type==='INSTANCE' && n.name === 'navbar';});
  if (!nav) return;
  var searchSmall = await figma.importComponentByKeyAsync('170399581aae801ccf796c5a90b93a9dd65bf62a');
  nav.setProperties({ '· middle ·#1031:15': true, '✎ · middle ·#1031:6': searchSmall.id, alignMiddle: 'true' });
}

// Self-check: после tc.characters = val убедись, что запись прошла (silent no-op детект)
function assertText(node, expected) {
  if (!node) { figma.notify('assertText: node is null'); return false; }
  if (node.characters !== expected) {
    figma.notify('assertText FAIL: «' + node.characters + '» ≠ «' + expected + '» на ' + node.name);
    return false;
  }
  return true;
}

// Self-check: после setProperties убедись, что INSTANCE_SWAP не остался '12:6' (placeholder)
function assertSwapApplied(inst, propName) {
  if (!inst || !inst.componentProperties) return false;
  var p = inst.componentProperties[propName];
  if (!p || p.value === '12:6') {
    figma.notify('assertSwapApplied FAIL: ' + propName + ' still placeholder на ' + inst.name);
    return false;
  }
  return true;
}

// Helper: inputText с label/hint
function addInput(parent, label, hint) {
  var inp = inputTextC.createInstance();
  parent.appendChild(inp);
  inp.layoutSizingHorizontal = 'FILL';
  inp.setProperties({
    '✏️ label#2014:84': label,
    '✏️ hint#2014:106': hint,
  });
  return inp;
}

// Helper: featureBanner с title/subtitle
function addBanner(parent, title, subtitle) {
  var b = featureBannerC.createInstance();
  parent.appendChild(b);
  b.layoutSizingHorizontal = 'FILL';
  b.setProperties({
    '🅃 title#9189:0': title,
    '🅃 subtitle#9189:5': subtitle,
  });
  return b;
}

// Helper: header
function addHeader(parent, title) {
  var h = headerC.createInstance();
  parent.appendChild(h);
  h.layoutSizingHorizontal = 'FILL';
  h.setProperties({ '✎ title#13537:10': title });
  return h;
}
```

**Главный анти-паттерн:** не используй `findOne(TEXT)[0].characters = '...'` или `findAll(TEXT)` для wrapper-компонентов — это бьёт в первый попавшийся текст-нод, обычно в label или иконку, а не в title/CTA. Всегда сначала проверь `componentPropertyDefinitions` и используй точное имя пропа.

**A-178 — navbar middle findDeep bug:** внутри `· middle ·` INSTANCE за FRAME `title` скрыт `addon 0` (INSTANCE) → `replaceGroup` (FRAME) → TEXT name=`'🤡'`. При рекурсивном обходе (`findOne`, `findAll`, `findDeep`) по типу TEXT этот узел встречается **раньше**, чем видимый TEXT name=`'text'`, и `.characters` пишется не туда — макет выглядит правильно (ошибок нет), но заголовок не меняется. Единственный правильный путь: `findAll(FRAME 'title')[0]` → прямые `children` → `TEXT name='text'`. Используй хелпер `setNavbarTitle`. Регрессия ловится через `placeholderHits` в `full-accuracy.figma.js` — скан включает navbar middle TEXT 'text' и TEXT named '🤡'.

#### Sticky-bottom для inputText над клавиатурой (A-028)

В чат-сценариях поле ввода не должно «утонуть» под клавиатурой. Решение — поле тоже абсолютное, прибито к низу прямо над `meshok ↓`:

```js
chat.appendChild(inputBar);
inputBar.layoutPositioning = 'ABSOLUTE';
inputBar.constraints = { horizontal: 'STRETCH', vertical: 'MAX' };
inputBar.x = 0;
inputBar.y = chat.height - chatDown.height - inputBar.height;
```

Тот же паттерн — для любого «фиксированного поверх клавиатуры» элемента (toolbar, эмодзи-пикер).

---

## Синтаксис plugin-кода

- Только `var` и `function(){}` — не `const`/`let`/стрелочные функции.
- Без ES6+: код должен работать в среде Figma plugin.
- Проверь синтаксис до передачи в `use_figma`.

---

## Обработка ошибок (A-004)

`figma.importComponentByKeyAsync()` и `setProperties()` могут упасть тихо: ключ устарел, проп переименовали, swap не принимает тип. Без явных try/catch билд завершается «✓ готово», а на странице — дыры.

### Правила

1. **Каждый `importComponentByKeyAsync` оборачивай в try/catch.** При падении — собирай ошибку в локальный массив `errors`, не бросай дальше:
   ```js
   var navbar;
   try {
     navbar = await figma.importComponentByKeyAsync(KEY);
   } catch (e) {
     errors.push({ where: 'navbar', key: KEY, msg: e.message });
   }
   if (!navbar) { /* skip swap, продолжай скелет без него */ }
   ```

2. **Каждый `setProperties` — тоже try/catch.** Логируй имя пропа и инстанса:
   ```js
   try {
     meshokUpInst.setProperties({ 'navbar#1491:0': navbar.id });
   } catch (e) {
     errors.push({ where: 'meshok↑.navbar', prop: 'navbar#1491:0', msg: e.message });
   }
   ```

3. **`setDeep` уже возвращает `false` при промахе** — собирай эти промахи в `errors` тоже, не игнорируй возвращаемое значение.

4. **В конце прогона** — если `errors.length > 0`, верни их в результате (не глотай). Скилл `/builder` шага 7 показывает список дизайнеру: «частичный успех — N ошибок: ...» с конкретными ключами и пропами. Без этого дизайнер не поймёт, почему макет неполный.

5. **Не падай целиком из-за одной ошибки.** Если упал импорт `navbar`, остальной скелет всё равно должен собраться. Лучше частичный макет с пометкой, чем пустая страница.

### Что НЕ делать

- ❌ `await figma.importComponentByKeyAsync(KEY)` без try/catch в основной цепочке.
- ❌ Глотать ошибки в `try { ... } catch(e) {}` без записи в errors.
- ❌ Возвращать «✓ готово», если `errors.length > 0`.
