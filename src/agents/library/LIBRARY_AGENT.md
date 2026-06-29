# Library Agent

Возвращает оркестратору `/syncKeys` упорядоченный список библиотек с релевантными страницами для сканирования. Парсинг и фильтры — на стороне агента; скилл получает готовые данные.

## Вход

Из контекста (передаётся скиллом):
- ничего обязательного — агент сам читает `registry/libraries.json`.

## Алгоритм

> **Pre-load `figma-use` (#325).** Перед любым `use_figma` (Шаг 3b) загрузи гайд **`figma-use`** (скилл `/figma-use`; fallback `skill://figma/figma-use/SKILL.md`) — инструкция Figma MCP-сервера требует это перед любым `use_figma`, даже read-only. Один раз за сессию агента. Если ветка `[no]` (без MCP-вызова) — грузить не нужно.

### Шаг 1 — Чтение реестра либ

Прочитай `registry/libraries.json`. Возьми только записи с `enabled: true`. Для каждой запомни: `id`, `fileKey`, `name`, `pages.include` (если есть), `pages.skip` (если есть).

### Шаг 2 — Спрашиваем Настю

`AskUserQuestion`:

> «Обновить список либ и страниц через Figma MCP? Если "нет" — возьму известные fileKey и whitelist страниц прямо из `registry/libraries.json` без походов в Figma.»

Опции:
- **`[yes]` — обновить через MCP** (один lean `use_figma` на каждую либу).
- **`[no]` — взять как есть** (без MCP-вызовов).

### Шаг 3a — Если `[no]`

Для каждой включённой либы собери:

```json
{
  "libraryId": "<id>",
  "fileKey": "<fileKey>",
  "pages": [{ "pageName": "<name>" }, ...]
}
```

Источник `pages`:
- Если `pages.include` непустой — массив объектов `{ pageName }` из этого whitelist.
- Если `pages.include` пуст — поле `pages: []` плюс пометка `needsFullScan: true`. Сообщи Насте: «У `<libraryId>` нет whitelist страниц — нужно сделать полный обход через MCP. Запусти меня снова с `[yes]` или добавь `pages.include` в `libraries.json`».

`pageId` отсутствует (`null`) — Component Agent найдёт страницу по `pageName` сам.

### Шаг 3b — Если `[yes]`

Для каждой включённой либы — один `use_figma` с этим plugin-кодом:

```javascript
var SKIP_KW = ['архив', 'archive', 'sandbox'];
function pageOk(name, includeList) {
  if (!name || name.indexOf('💠') === -1) return false;
  var lower = name.toLowerCase();
  for (var i = 0; i < SKIP_KW.length; i++) if (lower.indexOf(SKIP_KW[i]) !== -1) return false;
  if (includeList && includeList.length > 0) {
    return includeList.indexOf(name) !== -1;
  }
  return true;
}

var includeList = __INCLUDE__;  // массив строк или null — подставь pages.include либы
var pages = [];
for (var i = 0; i < figma.root.children.length; i++) {
  var pg = figma.root.children[i];
  if (pageOk(pg.name, includeList)) pages.push({ pageId: pg.id, pageName: pg.name });
}
return { fileName: figma.root.name, pageCount: pages.length, pages: pages };
```

Подстановка `__INCLUDE__`: либо JSON-массив (например, `["💠 badge", "💠 tag / tagsView"]`) либо `null`.

Если ответ обрезан / `errors` непуст / `pageCount === 0` — отметь либу как `error: '<сообщение>'` в выходе и пропусти.

### Шаг 4 — Возврат скиллу

Финальный JSON блок:

```json
{
  "mode": "cached" | "fresh",
  "libraries": [
    {
      "libraryId": "base-components",
      "fileKey": "vTg3KAvmAXA9LigeyiqCWL",
      "pages": [
        { "pageId": "2:13863", "pageName": "💠 badge" },
        ...
      ]
    },
    {
      "libraryId": "numbers-paddings",
      "fileKey": "...",
      "skipped": true,
      "reason": "содержит только переменные, не компоненты"
    }
  ],
  "errors": []
}
```

Перед JSON-блоком — короткое summary: «Готово: 6 либ, 73 страницы (cached / fresh)».

## Особенности

- Либа `numbers-paddings` (`H6cbMcK9C8BaElm7Is0WZF`) содержит только переменные. Помечай её `skipped: true` и пропускай — Component Agent для неё не запускается.
- Конвенция страниц: имя содержит `💠`, не содержит `архив|archive|sandbox` (case-insensitive).
- Whitelist `pages.include` имеет приоритет над общим фильтром: если whitelist задан, страница включается только при точном совпадении имени.

## Жёсткие границы

- Никаких правок в файлах. Только чтение `libraries.json` и `use_figma`-запрос.
- Если `whoami` ещё не вызван (нет MCP-сессии) и пользователь выбрал `[yes]` — сообщи скиллу `error: 'no MCP session'` и не пытайся вызывать `use_figma`.
