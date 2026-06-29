# JSON Layout Agent

> ⚠ **Оркестрация изменилась.** Этот агент больше не stand-alone — он внутри `/builder` как **internal scratchpad-этап G-I2** (см. `.claude/commands/builder.md` секция «Гейты»). Запускается автоматически после G-I1 (Text Layout), без apruva дизайнера. Ключевая обязанность G-I2 — резолвить slot prop names через `slotKey(rule, pattern)` / `boolKey(rule, pattern)` (см. `docs/BUILDER_GOTCHAS.md` A-058), чтобы ловить A-058-class регрессии в дешёвой плоскости до `use_figma`. Описание ниже — корректный контракт данных, но «ждёт апрув от дизайнера» больше не относится.

Принимает утверждённый текстовый лейаут и превращает его в JSON-дерево, которое Figma Implementer реализует через MCP.

## Цель

- Вход: нумерованный список из Text Layout Agent (`1`, `1.1`, `1.1.1`, …).
- Выход: JSON-дерево экранов с meshok'ами, контейнерами, ячейками, карточками.
- Агент **описывает**, какие переменные/компоненты применить. Извлечение из Figma — Implementer.

## Главное правило: отступы только из переменных

Все `padding`, `gap`, `margin` — **только** из переменных Tokens (`numbers-paddings`).
Никаких хардкодов в px. Если нужной переменной нет — спроси Implementer'а.

```json
"padding": { "type": "variable", "value": "cp-16" }
```

---

## Типовой фрейм

Базовый контейнер экрана: autoLayout VERTICAL; padding/gap/width/height — переменные из `numbers-paddings`. Конкретные значения проставляет Implementer:

```json
"page": {
  "frame": { "type": "FRAME", "layoutMode": "VERTICAL", "inheritLayoutFromRef": true },
  "children": [ /* ... */ ]
}
```

---

## Meshok

**Стрелка вверх** — прямой ребёнок типового фрейма:

```json
{ "type": "meshok", "variant": "arrowUp", "insertedIn": "pageRoot" }
```

**Стрелка вниз** — абсолютная позиция, `top+bottom` и `left+right`:

```json
{
  "type": "meshok", "variant": "arrowDown", "position": "absolute",
  "constraints": { "horizontal": ["left","right"], "vertical": ["top","bottom"] }
}
```

---

## Контейнеры

Имена — `Container.N` (уникальные на странице, наследуются от номера в текстовом лейауте).

Два типа:

**Независимые** — самостоятельные блоки (баннер, одиночный CTA):
```json
{ "type": "container", "id": "Container.2", "dependencyType": "independent",
  "children": [{ "type": "banner", "variant": "promotional" }] }
```

**Созависимые** — несколько компонентов одного смысла (заголовок + список). autoLayout, padding `cp-0`, gap **на 4 px меньше родительского** (`cp-16 → cp-12 → cp-8 → cp-4 → cp-0`):

```json
{ "type": "container", "id": "Container.2.2", "dependencyType": "coDependent",
  "autoLayout": true, "layoutMode": "VERTICAL",
  "paddings": { "type": "variable", "collection": "custom", "value": "cp-0" },
  "gap": { "type": "variable", "collection": "custom", "value": "cp-12" },
  "children": [/*...*/] }
```

---

## Контейнер с ячейками/карточками

В контейнере, где лежат ячейки или карточки — **только** ячейки или **только** карточки. Header, подзаголовки, описания — sibling'ом, не внутри cellStack'а.

❌ Нельзя:
```
Container.2.2
├── header   ← внутри cellStack — НЕЛЬЗЯ
└── cellStack
    └── cell
```

✅ Правильно:
```
Container.2.2
├── header
└── cellStack
    ├── cell
    └── cell
```

---

## Ячейки

Всегда вертикальный стак. Gap — из `const/base/gap`, в зависимости от типа:

- `between-simple-cells` — у `unicell` отключён `bottom`, в `leftSlot` `iconGlyph`
- `between-bottom-cells` — у `unicell` включён `bottom`
- `between-image-cells` — в `leftSlot` `avaPicture`

```json
{ "type": "gap", "context": "betweenSimpleCells",
  "source": { "type": "variable", "collection": "const/base/gap", "value": "between-simple-cells" } }
```

---

## Карточки

`uniCard` — горизонтальный autoLayout, gap `between-cards`:

```json
{ "type": "cardStack", "layoutMode": "HORIZONTAL",
  "gap": { "type": "variable", "value": "between-cards" },
  "children": [{ "type": "uniCard", "variant": "..." }] }
```

Сетка Pinterest пока зарезервирована (`"layoutMode": "pinterestGrid", "status": "placeholder"`).
