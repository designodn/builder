# Правила использования компонентов дизайн-системы

Правила разделены на секции — **читай только то, что нужно для текущего экрана**, а не файл целиком.

## Что и где

| Уровень | Файлы | Когда читать |
|---|---|---|
| Скелет фрейма | `rules/skeleton.md` | **Всегда** перед генерацией — три обязательных правила. ~30 строк. |
| Токены | `rules/tokens.md` | Когда задаёшь размеры, отступы, цвета, типографику, или импортируешь переменные. |
| Шаблоны пропов | `rules/templates.md` | Когда нужны шаблоны (`bottom-slot`, `buttons-slot`, `icon-glyph`, `system-component`, `card-*`). |
| Правила компонента | `rules/components/<slug>.rule.json` | Когда на экране есть конкретный компонент. **Builder читает только `.rule.json`**, не `.raw.json` и не `.md`. |
| Архитектура правил | `rules/components/ARCHITECTURE.md` | Когда нужно понять формат `.rule.json`, slug-правила, `nestedProps`, `sourceLib`. |

## Поиск нужного `.rule.json`

`slug` определяется детерминированно из имени компонента (см. `rules/components/ARCHITECTURE.md`):

| Компонент в Figma | Файл правил |
|---|---|
| `meshok ↑` / `meshok ↓` | `rules/components/meshok-up.rule.json` / `meshok-down.rule.json` |
| `button 1.1` | `rules/components/button.rule.json` |
| `header 1.1` | `rules/components/header.rule.json` |
| `uniCell 1.0` | `rules/components/unicell.rule.json` |
| `uniCard 1.0 ❖ view` | `rules/components/unicard-view.rule.json` |
| `160 ◇ uniCard` / `220 ◇ uniCard` / `320 ◇ uniCard` / `custom ◇ uniCard` | `rules/components/160-unicard.rule.json` и т.д. |
| `contentsView 1.1 ❖ view` | `rules/components/contentsview-view.rule.json` |

Если компонент не нашёлся — `slug = slugify(name)`: символы → дефисы, `↓→down`, `↑→up`, lowercase ASCII, strip trailing `-1-0`/`-1-1` версии. Тогда файл — `rules/components/<slug>.rule.json`.

Структурные данные (componentKey, type, libraryId, tier, approved) — в `registry/index.json` (derived cache из rules, формат tuple `[lib, key, type, tier, approved]`). Детали по компоненту (variants, slots, booleans, doc) — в самом `<slug>.rule.json`.

## Главное правило

**В каждом мобильном фрейме внизу — `meshok ↓`. Кнопки только через `buttonsView`-слот, навбар только через `meshok ↑`, тост только через `float/toast`-слот.** Подробности в `rules/skeleton.md`.

## Что нельзя

- Хардкодить отступы, размеры и радиусы в px — только переменные из `numbers-paddings`.
- Брать цвета и текстовые стили из произвольных мест — только из 🎨 Colors Palette и 📝 Typography (см. `rules/tokens.md`).
- Использовать компонент, у которого `approved: false` в `.rule.json` — это незавершённое правило. Сначала спроси дизайнера.
- Менять `paddingLeft/Right/Top/Bottom`, `itemSpacing`, `layoutMode` у инстанса — только по явной просьбе дизайнера (см. `rules/components/ARCHITECTURE.md` секция «Padding rule»).
