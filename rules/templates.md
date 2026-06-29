# Шаблоны пропов и своп-слоты

## Шаблоны пропов (`propTemplateId`)

### `label-text`
Текстовый лейбл. Глагол-действие. Если может быть длинным — `truncate`. `setProperties({ '<figmaPropName>': 'текст' })`.

### `label-visibility-boolean`
Видимость текстового лейбла. `true` = показан (default), `false` = скрыт.

### `counter-boolean`
Счётчик выбранных из списка. Для множественного выбора.

### `truncate-boolean`
Обрезка многоточием. Для динамических лейблов с фиксированной шириной.

### `onScroll-boolean`
Скролл-состояние. `true` = фоновый прямоугольник за компонентом (тень/blur). По дефолту `false`.

### `bottom-slot`
Доп. инфа под основным контентом. Boolean `bottom ↓` (в uniCell — `↓ bottom`) + INSTANCE_SWAP `✏️ bottom ↓`.
Используется в `uniCell 1.0`, `uniCard`.

| Компонент | Ключ | Когда |
|---|---|---|
| `avatarsView 1.1` (24, description: true) | `949ca380dbaedb2250e89e1524b1d83b8a6ea34d` | Общие друзья через аватарки |

### `buttons-slot`
Горизонтальный ряд кнопок. Boolean `buttons` + INSTANCE_SWAP `✏️ buttons`.
Используется в `uniCell 1.0` (size 36), `uniCard` (size 44).

| Компонент | Ключ | Когда |
|---|---|---|
| `buttonsView 1.0 ❖ view` | `f0b4db3dccdfe94ca6ab7431b28165daa9d59fa2` | Стандартный ряд |

## Своп-слоты (`swapSlotId`)

### `icon-glyph`
Иконка из Base. Размер варианта — по контексту (размер кнопки → размер иконки).

### `system-component`
Низ экрана `meshok ↓`: `tabbarPrimary ❖ view`, `tabbarInverse ❖ view`, `handle ❖ view`, `keyboardNumeric ❖ view`, `keyboardAlphabetic ❖ view`.

### `card-image-content`
Картинка в `uniCard`. Дефолт `media 1.1`.

| Компонент | Ключ | Когда |
|---|---|---|
| `media 1.1` | `07af48f5f2ff63ad62b6b379be4ea4f4358b54bd` | Дефолт |

### `card-text-content`
Текст в `uniCard`. Дефолт `15b-13-13 · contentsView`.

| Компонент | Ключ | Когда |
|---|---|---|
| `15b-13-13 · contentsView` | `b37bc8cef41a67e3c0ee9425e9dcd5211413cc94` | Дефолт |
| `contentsView 1.1 ❖ view` | `00f0bdc31c5563621a845168b5b52cddf566f160` | Кастомная сборка |
