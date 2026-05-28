# Стили, цвета, переменные паддингов

## Текстовые стили — только из Typography

Все стили текста берутся **исключительно** из библиотеки **📝 Typography**:

- fileKey: `cs2pw2X0raQVJwkjBq0dJU`

Не использовать стили из других библиотек. Не задавать шрифт, размер или начертание вручную.

## Цвета — только из Colors Palette

Все цвета берутся **исключительно** из библиотеки **🎨 Colors Palette**:

- fileKey: `bOJXsSkQici3zrKC3zJKpp`
- URL: https://www.figma.com/design/bOJXsSkQici3zrKC3zJKpp/%F0%9F%8E%A8-Colors-Palette
- Ключи переменных: `registry/libraries/colors-palette/variables.json`

Не использовать HEX-значения. Не использовать цвета из других библиотек.

### Семантические токены (Regular Dynamic Colors — 46 шт)

Использовать в первую очередь — это динамические токены, переключающиеся между light/dark.

| Группа | Токены | Когда |
|---|---|---|
| `text-and-icons/base/*` | `primary`, `secondary`, `tertiary`, `inverse/{primary,secondary,tertiary}` | Все базовые тексты и иконки |
| `text-and-icons/status/*` | `accent`, `positive`, `negative`, `info`, `attention` (+ `inverse/*`) | Статусы: ошибки, успех, информация |
| `surface/base/*` | `primary`, `secondary`, `tertiary`, `quaternary`, `inverse/*` | Фоны блоков (карточки, шторки, ячейки) |
| `surface/contrast/*` | `low`, `mid`, `high` (+ `inverse/*`, + `on-color/*`) | Контрастные подложки (бейджи поверх контента) |
| `surface/special/*` | `layer`, `nude`, `overlay` | Специальные подложки (модалки, оверлеи) |
| `stroke/contrast/*` | `low`, `mid`, `high` | Бордеры разделителей |
| `stroke/status/*` | `accent`, `positive`, `negative`, `info`, `attention` | Цветные бордеры (focus, error) |

**Применение в plugin-коде:**

```js
var primaryText = await figma.variables.importVariableByKeyAsync('82482524dcdb78fd9d9b0a3c175e31b377ad3566');
textNode.setBoundVariable('fills', primaryText);

var surface = await figma.variables.importVariableByKeyAsync('efb37ee7d1a0f7eea50d7f75b0e20240980336c1');
frame.setBoundVariable('fills', surface);
```

### Base Color Primitives (205 шт — палитра-источник)

Использовать **только** если семантического токена нет (например, специфический бренд-цвет в маркетинговом баннере). Доступны по группам: `base/{white,black,grey,sand,brown,orange,indigo,turquoise,blue,yellow,jungle,chikunya,green,ocean,pink,violet,purple,red}/*`. Полный список — в Figma-файле `bOJXsSkQici3zrKC3zJKpp`.

## Библиотеки (полный список — в `registry/index.json`)

| Библиотека | id | fileKey |
|---|---|---|
| 💠 Base Components | `base-components` | `vTg3KAvmAXA9LigeyiqCWL` |
| 🍑 Buttons & Tabs & Chips | `buttons-tabs-chips` | `LYZAXE33pUg2cSL5mmUHYq` |
| 🧩 Sheets & Modules & Wrappers | `sheets-modules-wrappers` | `SZCPsHnuqBIWlYSyfmq0j1` |
| 🍬 Cards & Cells & Views | `cards-cells-views` | `64y1aDfl0lSSpek3sq1Lrt` |
| ✏️ Inputs & Search | `inputs-search` | `qdqGHY32KlkrIwX3eppFUx` |
| 💻 System | `system` | `h7xnhEfEJmrYAR4uo7NC00` |
| 🔢 Numbers \| Paddings | `numbers-paddings` | `H6cbMcK9C8BaElm7Is0WZF` |

## Переменные паддингов и радиусов

Источник: библиотека `numbers-paddings`. Ключи переменных — `registry/libraries/numbers-paddings/variables.json`.

**Все отступы и радиусы — только через переменные. Никаких хардкодных px.**

```js
const v = await figma.variables.importVariableByKeyAsync('<key>');
frame.setBoundVariable('width', v);
frame.setBoundVariable('paddingLeft', v); // и т.д.
```

### Device Presets

| Переменная | Android | iOS | Mob | Web |
|---|---|---|---|---|
| `screen-width` | 360 | 375 | 360 | 1366 |
| `screen-height` | 800 | 812 | 800 | 768 |
| `component-width` | 360 | 375 | 360 | 560 |
| `screen-border-radius` | 16 | 24 | 16 | 24 |

Типовой фрейм: `width=screen-width`, `height=screen-height`, `padding=const/custom/cp-0`, `gap=const/custom/cp-16`.

### Const Paddings (Android/iOS/Mob одинаковые)

| Переменная | Mob | Web |
|---|---|---|
| `const/base/→gap←/between-simple-cells` | 24 | 24 |
| `const/base/→gap←/between-bottom-buttons-cells` | 24 | 24 |
| `const/base/→gap←/between-image-cells` | 16 | 16 |
| `const/base/→gap←/between-islands` | 8 | 12 |
| `const/base/→gap←/between-sections` | 32 | 32 |
| `const/base/→gap←/between-cards` | 12 | 12 |
| `const/base/↑vertical↓/text-to-navbar` | 24 | 24 |
| `const/base/↑vertical↓/wrapper-to-navbar` | 16 | 16 |
| `const/base/↑vertical↓/fixed-to-bottom` | 16 | 24 |
| `const/base/↑vertical↓/content-to-bottom` | 32 | 32 |
| `const/cell-view/→gap←/default` | 12 | 12 |
| `const/cell-view/←horizontal→/default` | 16 | 16 |
| `const/cell-view/↑vertical↓/default` | 12 | 12 |
| `const/wrapper/←horizontal→/default` | 16 | 16 |
| `const/wrapper/←horizontal→/layer` | 16 | 24 |
| `const/wrapper/←horizontal→/onboarding` | 24 | 40 |
| `const/wrapper/↑vertical↓/default` | 16 | 16 |
| `const/vibe/←horizontal→/default` | 32 | 32 |
| `const/custom/cp-0 … cp-64` | 0…64 | 0…64 |
| `const/custom/sub-zero/cp-2 🧊 … cp-64 🧊` | −2…−64 | −2…−64 |

### Corner Radius

| Переменная | Когда |
|---|---|
| `base/island` | Острова (карточки верхнего уровня) |
| `base/layer` | Вложенные слои внутри острова |
| `base/wrapper` | Обёртки |
| `custom/cr-0 … cr-999` | Произвольные значения (0, 2, 4, 8, 12, 16, 20, 32, 999) |
