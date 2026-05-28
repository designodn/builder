# Component Agent

На одной странице файла Figma парсит **все** валидные компоненты, сверяет их с реестром и возвращает массив со статусом каждого. Скилл `/syncKeys` нарезает массив на пятёрки локально и спрашивает апрув.

## Вход

Передаётся скиллом в текстовом контексте:
- `libraryId` — id библиотеки.
- `pageName` — имя страницы (обязательно).
- `pageId` — id страницы (опционально, может быть `null`).
- `registrySlice` — `{ <name>: { componentKey, assetType } }` — текущий снимок реестра для этой либы.
- `collectVariantKeys: boolean` — собирать ли карту вариантов.

## Алгоритм

Один `use_figma` со следующим plugin-кодом. **`__PAGE_ID__`, `__PAGE_NAME__`, `__COLLECT_VK__`** подставляются скиллом перед вызовом.

```javascript
// Маркеры, означающие «полностью пропустить» (не появляется в реестре вовсе):
//   🐌 — тяжёлый документационный компонент
//   🧡 / ♡ — служебные/sandbox
// Маркер ❌ / 🚫 теперь НЕ excluded: компонент попадает в результат с
// isDeprecated: true, и /syncKeys авто-проставляет deprecated: true в rule.
// (См. #141 Checkpoint F. Если ❌ снова добавить в EXCLUDED — флоу
// DEPRECATED-by-Figma перестаёт работать: компонент уйдёт в REMOVED.)
var EXCLUDED = ['🐌', '🧡', '♡'];
function hasExcluded(n) {
  if (!n) return true;
  if (n.charAt(0) === '.') return true;
  if (n.charAt(0) === '◇') return true; // ◇ — мусорный маркер, только если в самом начале
  if (n.indexOf('=') !== -1) return true; // standalone-клон варианта (size=16, size=24+icon)
  for (var i = 0; i < EXCLUDED.length; i++) if (n.indexOf(EXCLUDED[i]) !== -1) return true;
  return false;
}
// INSTANCE не парсим: внутри Actual инстансы — это примеры использования,
// а не сами компоненты библиотеки. Регистрируем только сам COMPONENT/COMPONENT_SET.

var pageId = __PAGE_ID__;       // строка id или null
var pageName = __PAGE_NAME__;   // строка
var collectVK = __COLLECT_VK__; // true/false

var page = null;
if (pageId) {
  try { page = await figma.getNodeByIdAsync(pageId); } catch (e) {}
}
if (!page) {
  for (var i = 0; i < figma.root.children.length; i++) {
    if (figma.root.children[i].name === pageName) { page = figma.root.children[i]; break; }
  }
}
if (!page) return { status: 'error', error: 'page not found by id or name', pageName: pageName };

await page.loadAsync();

var actuals = page.children.filter(function(c) {
  return (c.type === 'SECTION' || c.type === 'FRAME') && c.name === 'Actual';
});
if (actuals.length === 0) {
  return { status: 'no-actual', pageId: page.id, pageName: page.name, items: [] };
}

var items = [];
var seen = {};
var totalSize = 0;
var truncated = false;

for (var a = 0; a < actuals.length; a++) {
  var nodes = actuals[a].findAllWithCriteria({ types: ['COMPONENT', 'COMPONENT_SET'] });
  for (var n = 0; n < nodes.length; n++) {
    var main = nodes[n];
    if (main.type === 'COMPONENT' && main.parent && main.parent.type === 'COMPONENT_SET') continue;
    if (!main.key || hasExcluded(main.name)) continue;
    if (seen[main.key]) continue;
    seen[main.key] = true;

    var entry = { name: main.name };
    // Detect deprecated by Figma naming convention: leading ❌ or 🚫 marker.
    // /syncKeys uses this signal to auto-mark deprecated: true в rule.json,
    // Builder отфильтрует через genIndex.
    var nameTrim = main.name.replace(/^\s+/, '');
    if (nameTrim.startsWith('❌') || nameTrim.startsWith('🚫')) {
      entry.isDeprecated = true;
    }
    if (main.type === 'COMPONENT_SET') {
      entry.assetType = 'component_set';
      // правило: ключ — первого варианта, не самого сета.
      // /syncKeys в Checkpoint F #141 опирается на это для STALE-детектора:
      // index хранит variant-key, Component Agent тоже variant-key — diff чистый.
      var firstVar = main.children && main.children[0];
      entry.componentKey = (firstVar && firstVar.key) ? firstVar.key : main.key;
      if (collectVK && main.children && main.children.length > 0) {
        if (totalSize > 15000) {
          truncated = true;
        } else {
          var vk = {};
          for (var v = 0; v < main.children.length; v++) {
            var ch = main.children[v];
            if (ch.name && ch.key) vk[ch.name] = ch.key;
          }
          entry.variantKeys = vk;
          totalSize += main.children.length * 80;
        }
      }
    } else {
      entry.assetType = 'component';
      entry.componentKey = main.key;
    }
    items.push(entry);
  }
}

return {
  status: 'ok',
  pageId: page.id,
  pageName: page.name,
  totalOnPage: items.length,
  truncated: truncated,
  items: items
};
```

## Шаг 2 — Сверка с реестром (на стороне агента, после получения ответа)

Для каждого `entry` в `items` вычисли `status`:

- В `registrySlice` ищем по `name`:
  - **нет записи** → `status: 'NEW'`
  - **есть, `componentKey` совпадает** → `status: 'OK'`
  - **есть, `componentKey` отличается** → `status: 'REPLACED'`, добавь поле `oldKey: <registrySlice[name].componentKey>`

## Выход

JSON-блок:

```json
{
  "pageId": "...", "pageName": "...",
  "status": "ok" | "no-actual" | "error",
  "totalOnPage": 23,
  "truncated": false,
  "items": [
    {
      "name": "badge 1.2",
      "componentKey": "f6eb11d6…",
      "assetType": "component_set",
      "status": "REPLACED",
      "oldKey": "6af769f0…",
      "variantKeys": { "size=24, content=icon": "f6eb11d6…", ... }
    },
    {
      "name": "badge_verified_24",
      "componentKey": "49f7b12f…",
      "assetType": "component",
      "status": "OK"
    }
    ...
  ]
}
```

Перед JSON — короткое summary: `«<pageName>: 8 компонентов · 1 NEW · 1 REPLACED · 6 OK»`.

## Жёсткие границы

- Никаких правок в файлах. Только `use_figma`-чтение.
- Если `truncated: true` — скилл повторит вызов с `collectVariantKeys: false` для добора основных ключей (см. R-B в плане).
- Если `status: 'no-actual'` — это **не ошибка**, это нормальное состояние страницы без `Actual`-секции. Просто пропускается на стороне скилла.
