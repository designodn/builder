# Скелет мобильного фрейма

Каждый мобильный фрейм обязан иметь эту структуру. Отклонение — блокер.

**Структура зависит от выбранного `page style mode` (см. R-025 и `skeleton.json#pageStyleModes`).** Page bg различается по mode: flat = `surface/secondary` (**белый/чистый**, дефолт страницы), with-islands = `surface/primary` (**серый/тёплый** фоновый слой) с островами `surface/secondary` (белыми) поверх. Builder выбирает режим ДО сборки content_body: либо задаёт вопрос дизайнеру, либо авто-выбирает flat для случаев «≤1 смысловой блок на каждом экране» — точное правило в `.claude/commands/builder.md → Page style modes`.

```
фрейм page  (w=screen-width, h=screen-height, fill зависит от mode — см. ниже)
│
├─ content_body  (VERTICAL frame, FILL width, HUG height)
│     ┌─ Mode A: flat (pageFill = surface/secondary) ─────────────────────┐
│     │  padding cp-16 (l/r/t) + content-to-bottom (b), gap = cp-16          │
│     │  children:                                                            │
│     │    ├── meshok ↑           (in-flow, первый ребёнок)                   │
│     │    │     navbar-слот → [navbar 1.0], middle-слот свапается           │
│     │    ├── …контент           (cells / carousels / forms / компоненты)   │
│     │    │     заголовки секций — header 1.1 (size 27/21/17/15)            │
│     │    │     ячейки uniCell/buttonCell/selectionCell — внутри cellList   │
│     │    │     карточки uniCard — со свапом size при создании              │
│     │    │     vibe ❖ view — для ВСЕХ success/empty/error states           │
│     │    └── …                                                              │
│     └──────────────────────────────────────────────────────────────────────┘
│
│     ┌─ Mode B: with-islands (pageFill = surface/primary) ─────────────────┐
│     │  padding = 0 (острова edge-to-edge) + content-to-bottom (b)            │
│     │  gap = between-islands (8)                                              │
│     │  children:                                                              │
│     │    ├── island 1 (ПЕРВЫЙ, встраивает meshok ↑)                           │
│     │    │     fill = surface/secondary                                       │
│     │    │     topRadii = 0, bottomRadii = base/island                        │
│     │    │     ├── meshok ↑           (in-flow, edge-to-edge)                 │
│     │    │     └── inner-content-wrapper  (cp-16 l/r/b, paddingTop=0,         │
│     │    │           cp-12 gap)  ← top=0 чтобы meshok ↑ примыкал без зазора   │
│     │    │           заголовки секций / cellList / carousels / vibe           │
│     │    ├── island 2..N                                                      │
│     │    │     fill = surface/secondary, allRadii = base/island               │
│     │    │     padding = cp-16, gap = cp-12                                   │
│     │    │     заголовки секций / cellList / carousels / vibe                 │
│     │    └── …                                                                │
│     └────────────────────────────────────────────────────────────────────────┘
│
└─ meshok ↓  (ABSOLUTE, pinned [left, right, bottom])  — overlay над content_body
      systemComponent → handle (онбординг) | tabbarPrimary (основные экраны) | * ◇ keyboard (ввод)
      buttonsView     → true если есть primary-кнопка; компонент = buttonsViewBottom 1.0 ❖ view
      float/toast     → true если нужен тост; компонент = toast 1.0
```

## Четыре правила, которые нельзя нарушать

0. **`meshok ↑` И `meshok ↓` обязательны на каждом мобильном экране.** Без исключений. Это несущий элемент скелета, не «опциональное украшение». Любой экран без обоих меш́оков = `skeletonViolations` блокер (A-044).
   - Нет визуального навбара (welcome / done) — `meshok ↑` всё равно ставится, navbar slot скрывается через boolean / соответствующий вариант.
   - Нет CTA-кнопки (informational screen) — `meshok ↓` всё равно ставится (пустой tabbar / handle variant).

   **Positioning** (структурный инвариант — `skeleton.json#meshokPositioning`):
   - **`meshok ↓`** — ВСЕГДА `absolute`, pinned `[left, right, bottom]`. Висит overlay'ем над `content_body`, не отнимает у него вертикальный размер в auto-layout. Поэтому `content_body` имеет `paddingBottom = const/base/↑vertical↓/content-to-bottom` (32) — чтобы контент не лез под CTA.
   - **`meshok ↑`** — по умолчанию `in-flow`, первый ребёнок:
     - в **flat** mode — первый ребёнок `content_body`
     - в **with-islands** mode — первый ребёнок ПЕРВОГО ОСТРОВА (структурно сливается с верхом экрана; первый остров имеет `topRadii=0`)
     - **fallback:** для scroll-state demo `meshok ↑` переключается на `absolute` pinned `[top, left, right]`.
1. **Кнопки никогда не вставляются напрямую во фрейм или в произвольный контейнер контента.** В `meshok ↓` живут **только кнопки уровня экрана** (`elementClass: screen-level-button`). Семантика, примеры и counter-examples — `rules/components/meshok-down.rule.json#slots[✏️ buttonsView].intent` (единственный источник правды). Структурный инвариант — `skeleton.json#composition.placement[rule=R-1]`. Сам `meshok ↓` — `absolute` overlay, см. R-0 / `skeleton.json#meshokPositioning.meshokDown`.
2. **Навбар (верхняя панель навигации экрана) никогда не вставляется напрямую во фрейм.** Он живёт **внутри `meshok ↑`** (`elementClass: screen-navbar`). Семантика — `rules/components/meshok-up.rule.json#slots[navbar].intent`. Заголовок страницы выставляется свапом middle-слота навбара — это часть навбара, не нарушение R-2. Заголовки секций внутри контента — другой компонент (`header 1.1`, см. R-024), они не идут в `meshok ↑`. Структурный инвариант — `skeleton.json#composition.placement[rule=R-2]`. Сам `meshok ↑` — `in-flow` первым ребёнком (content_body в flat, первого острова в with-islands), см. R-0 / `skeleton.json#meshokPositioning.meshokUp`.
3. **Screen-level toast (всплывающее уведомление снизу экрана поверх контента) никогда не вставляется напрямую во фрейм.** Он живёт **внутри `meshok ↓`** (`elementClass: screen-bottom-toast`). Семантика — `rules/components/meshok-down.rule.json#slots[✏️ float / toast].intent` (включая разделение со screen-top-banner / inline-toast). Структурный инвариант — `skeleton.json#composition.placement[rule=R-3]`. Поскольку сам `meshok ↓` — absolute overlay над content_body, toast внутри него тоже визуально парит поверх контента страницы.

## Обязательные паттерны (после фидбека на test 8)

### Фон страницы — зависит от page style mode (R-025)

Frame экрана: `fill` зависит от выбранного **page style mode** (см. `skeleton.json#pageStyleModes`):

- **flat** → `fill = surface/secondary`. Это «дефолтный фон страницы» — белый/чистый. Контент сидит напрямую в `content_body` с padding cp-16, без обёрток-островов.
- **with-islands** → `fill = surface/primary` (серый/тёплый, фоновый слой). Контент группируется в **острова** с fill `surface/secondary` (белый) и `base/island` скруглением; острова сидят в `content_body` с нулевыми боковыми паддингами (edge-to-edge со screen-width). Острова — белый приподнятый слой над серым page bg.

Семантика токенов:
- `surface/secondary` — **белый**, дефолт-фон страницы в flat **либо** заливка островов в with-islands
- `surface/primary` — **серый/тёплый**, фоновый слой под островами; используется только в with-islands как page bg

Подробнее — `skeleton.json#pageStyleModes` (источник правды) и `.claude/commands/builder.md → Page style modes`.

Builder выбирает режим **ДО** сборки content_body. По умолчанию задаёт дизайнеру вопрос; исключение — если на каждом экране ≤1 смысловой блок контента (типичная регистрация / линейный онбординг), тогда ставит `flat` без вопроса и сообщает дизайнеру одной строкой. Точное правило — `.claude/commands/builder.md → Page style modes`.

```js
// page bg в обоих режимах:
var surfacePrimary = await figma.variables.importVariableByKeyAsync('efb37ee7d1a0f7eea50d7f75b0e20240980336c1');
var paint = { type: 'SOLID', color: { r: 1, g: 1, b: 1 } };
frame.fills = [figma.variables.setBoundVariableForPaint(paint, 'color', surfacePrimary)];

// в with-islands у каждого острова fill = surface/secondary:
//   da9946fb28557beb884a56a98622e31e45ed56b8
```

### Заголовки секций — только через header 1.1 (R-024)

`header 1.1` (или Cancel/Schevron/ShowAll-варианты) — для заголовков **секций внутри контента**. **Не для заголовков страниц** — заголовок страницы выставляется свапом middle-слота навбара (см. R-2).

Размер `size` по уровню секции:
- Раздел — `size=21`
- Подраздел — `size=17`
- Самый мелкий — `size=15`

Вариант `size=27` существует в компоненте, но по умолчанию **не используется** для заголовка страницы — эта задача отдана navbar middle. `header 1.1 size=27` применяется только в специальных случаях — hero-секция, welcome-экран без навбара.

Серия `* · NN ◇ content` НЕ для заголовков. Только для inline-текста внутри ячеек/карточек.

**Placement** — заголовок секции сидит в **том же контейнере**, к которому относится:
- В **flat** mode — внутри той же группы (если есть VERTICAL wrapper над cells-list / carousel) или как сосед в `content_body` непосредственно над относящимся блоком.
- В **with-islands** mode — **внутри острова**, к которому относится (как первый ребёнок inner-content-wrapper'а острова, над cells-list / carousel / form).

### Empty/Success/Error states — только vibe (R-023)

Пустой экран, экран успеха, экран ошибки — НЕ собирать руками из illustration + content + button. Использовать `vibe ❖ view 1.0` со свапом `context#6353:1` на конкретный preferredValue (page ◇ vibe / noInternet ◇ vibe / somethingHappened ◇ vibe).

## Глобальные принципы

- Не использовать компоненты со статусом `needs_review` без явного указания дизайнера.
- Отступы между компонентами — переменные из `numbers-paddings`. Никаких хардкодных px.
- Цвета — только из Colors Palette (`registry/libraries/colors-palette/variables.json`).
- Тексты — только из Typography (через textStyleId).

## Мобильный baseline (R-028)

Размеры мобильного фрейма привязаны к **переменным ДС** из библиотеки `numbers-paddings`. Литералов `375` / `812` в коде Builder'а нет.

- **width** → переменная `screen-width` (mode iOS = 375, Android = 360, Mob = 360, Web = 1366)
- **height** → переменная `screen-height` (mode iOS = 812, Android = 800, Mob = 800, Web = 768)
- **frame_gap** — расстояние между соседними state-фреймами на канвасе Figma (служебная конвенция, **не** свойство макета): `200`. Остаётся литералом — переменной для канвасного гэпа в ДС нет и не нужно.

**Источник правды — `rules/skeleton.json`.** Этот `.md` цитирует значения и имена переменных для людей; Builder читает из JSON. Mode переменной на фрейме явно не задаётся — берётся дефолтный mode коллекции `numbers-paddings`.

**Механика.** Figma plugin sandbox не имеет `require` / `import` / `fs`. Builder читает `skeleton.json` на этапе планирования (через `Read`/`Bash`), достаёт ключи переменных и `frame_gap`, и встраивает их литералами в `code`-параметр `use_figma`. Дальше **width/height ставятся через `setBoundVariable`** (а не через `frame.resize(375, 812)`):

```js
// Builder подставляет из rules/skeleton.json:
//   const W_VAR_KEY = '<skeleton.baseline.mobile.w.key>';
//   const H_VAR_KEY = '<skeleton.baseline.mobile.h.key>';
//   const FRAME_GAP = <skeleton.frame_gap>;

const wVar = await figma.variables.importVariableByKeyAsync(W_VAR_KEY);
const hVar = await figma.variables.importVariableByKeyAsync(H_VAR_KEY);

const frame = figma.createFrame();
frame.setBoundVariable('width',  wVar);   // → screen-width
frame.setBoundVariable('height', hVar);   // → screen-height
// Mode не трогаем — Figma резолвит по дефолту коллекции.
```

При выкладке серии состояний рядом следующий фрейм позиционируется как `frame2.x = frame1.x + frame1.width + FRAME_GAP` — `FRAME_GAP` остаётся литералом (`200`).

Литералов `375` / `812` / `40` нигде в коде быть не должно. Если ДС сменит дефолтный mode (например, новый iPhone `393` станет дефолтом в `screen-width`) — `rules/skeleton.json` править не надо: значение придёт через переменную автоматически. Если меняется сам выбор переменной (например, на `component-width` для каких-то экранов) — правится `skeleton.json`, Builder при следующем прогоне подхватит новый ключ.
