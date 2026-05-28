# /syncKeys

Сверяет ключи компонентов в `rules/components/*.rule.json` с тем, что лежит в Figma в секциях `Actual`. Скилл — **оркестратор**: парсинг и сверка делают агенты Library и Component. Скилл сам `use_figma` не вызывает.

**Source of truth** — `rules/components/*.rule.json`. `registry/index.json` — derived cache, регенерируется после apply через `genIndex()`.

## Жёсткие границы

1. Запускать может **только Настя** (identity-check). Если ответ «нет» — стоп: «Реестр обновляет только Настя».
2. Запись в `rules/components/` — **только после явного апрува** Насти на финальном шаге. До этого — всё в памяти.
3. Атомарность: если хоть один батч упал — rules не трогаем.

## Предусловие

`whoami` через Figma MCP должен отвечать. Если упало — открой `/connectFigmaMCP`.

---

## Алгоритм

### Шаг 1 — Identity + whoami

Identity-check как в `CLAUDE.md` шаге 1. Затем `whoami`.

### Шаг 2 — Запустить Library Agent

Открой `src/agents/library/LIBRARY_AGENT.md` и следуй его инструкциям. Получишь финальный JSON-блок:

```json
{
  "mode": "cached" | "fresh",
  "libraries": [
    { "libraryId": "base-components", "fileKey": "...", "pages": [...] },
    { "libraryId": "numbers-paddings", "skipped": true, "reason": "..." }
  ],
  "errors": []
}
```

Сохрани как `libsPlan`.

### Шаг 3 — Построить expected-snapshot из rules

В памяти:

```
expectedByLib = {}  // libId → { <name>: { key, type, slug, isDeprecated, rulePath } }
```

Для каждого `<slug>.rule.json` в `rules/components/`:
- `rule = readJson(path)`
- `expectedByLib[rule.lib] = expectedByLib[rule.lib] || {}`
- `expectedByLib[rule.lib][rule.name] = { key: rule.key, type: rule.type, slug: rule.slug, isDeprecated: rule.deprecated === true, rulePath: path }`

### Шаг 4 — Прогон по либам и страницам

Инициализируй накопители: `pendingByLib = {}`, `seenNamesByLib = {}`, `deprecatedReport = []`.

**Для каждой `lib` из `libsPlan.libraries`:**

- Если `lib.skipped === true` или `lib.error` — пропусти, выведи лог.
- `expectedSlice = expectedByLib[lib.libraryId] || {}` — current rules для этой либы.
- `seenNamesByLib[lib.libraryId] = new Set()`.
- `libAborted = false`.
- `pagesWithActuals = 0`.
- `pagesUnchanged = 0`.

**Для каждой `page` из `lib.pages`:**

  - Если `libAborted` — выйти.
  - **Запусти Component Agent.** Открой `src/agents/component/COMPONENT_AGENT.md` и подставь:
    - `pageId`, `pageName` — из `page`.
    - `collectVariantKeys = false` — в новой архитектуре variants резолвятся через `instance.setProperties()`, отдельный файл не нужен.
    - `registrySlice = expectedSlice` (передаётся как `{ <name>: { componentKey: <key> } }` — формат совместим со старым агентом).
    - `libraryId = lib.libraryId`.
  - Получи `componentResult: { status, items, totalOnPage }`.
  - Если `status === 'no-actual'` — лог, к следующей странице.
  - Если `status === 'error'` — `libAborted = true`, сохрани причину → к следующей либе.
  - Инкрементируй `pagesWithActuals++`.
  - Запиши все `items[].name` в `seenNamesByLib[lib.libraryId]`.
  - **Локально нарежь `items` на пятёрки.**

  **Для каждого `chunk` (пятёрка):**

  - Для каждой `entry` в chunk построй diagnostic:
    - `expected = expectedSlice[entry.name]`.
    - Cases:
      - `!expected && !entry.isDeprecated` → **NEW** (нет rule, надо завести через `/parseProps`).
      - `!expected && entry.isDeprecated` → **NEW-DEPRECATED** (предложить `/parseProps` с флагом, или skip).
      - `expected && entry.componentKey !== expected.key && !entry.isDeprecated` → **STALE** (key mismatch, auto-fix).
      - `expected && entry.isDeprecated && !expected.isDeprecated` → **DEPRECATED-by-Figma** (auto-set `deprecated: true`).
      - `expected && entry.componentKey === expected.key` → **OK**.
  - Покажи дизайнеру таблицу:
    ```
    <pageName> · батч k/n
    | name | status | old key → new key |
    |---|---|---|
    | badge 1.2 | STALE | 6af769f0… → f6eb11d6… |
    | ❌ оld-thing | DEPRECATED | — |
    | new-thing | NEW | — |
    | header 1.1 | OK | 3975006…  |
    ```
  - **Если есть NEW**: подсказка `/parseProps "<name>"` (но автоматически НЕ создаём rule — это явное действие Насти).
  - **Если есть STALE или DEPRECATED-by-Figma** — `AskUserQuestion`:
    > «Применить эти изменения в rule-файлы?»
    Опции:
    - `[apply]` → накопи в `pendingByLib[lib.libraryId]`:
      ```
      {
        staleFixes: [{ slug, rulePath, oldKey, newKey, name }],
        deprecatedFixes: [{ slug, rulePath, name }]
      }
      ```
    - `[skip batch]` → пропусти.
    - `[abort lib]` → `libAborted = true`.
  - **Если все OK** — лог `✓ batch all OK`, дальше.

  **Early-abort страницы.** Если 3 страницы подряд без diff → спроси «пропустить остальные?» Один раз на либу.

**После всех страниц либы:**

- Если `libAborted` или `pagesWithActuals === 0` — не считай REMOVED.
- Иначе вычисли REMOVED:
  - `removedNames = [name for name in expectedSlice if name not in seenNamesByLib[lib.libraryId] && !expectedSlice[name].isDeprecated]`
  - (deprecated rules не считаем REMOVED — их и не должно быть в Figma)
  - Если непуст — `AskUserQuestion`:
    > «Эти компоненты есть в rules, но не нашлись в Figma `<libraryId>`. Что делать?»
    - `[mark deprecated]` → накопи в `pendingByLib[lib].markDeprecated = removedNames`.
    - `[delete rules]` → накопи в `pendingByLib[lib].deletes = removedNames`.
    - `[keep]` → ничего.

### Шаг 5 — Финал

Если `pendingByLib` пуст и `deprecatedReport` пуст — выведи `«Все ключи актуальны, изменений нет»` и завершись.

Иначе:
- Сводка:
  ```
  Изменения:
    base-components:    ~3 stale → variant-keys  · 1 deprecated · 0 removed
    buttons-tabs-chips: ~0       · 0 deprecated · 2 removed (rule keep)
  Всего: ~3 stale · 1 deprecated · 2 removed
  ```
- `AskUserQuestion`:
  > «Применить изменения в rules?»
  - `[apply]` → шаг 6.
  - `[abort]` → выход без записи.

### Шаг 6 — Apply (только после `[apply]`)

Для каждой либы из `pendingByLib`:

1. **STALE fixes:** для каждого `staleFix`:
   - Прочитать `rulePath`, заменить `rule.key = newKey`, сохранить через `JSON.stringify(rule, null, 2) + '\n'`.

2. **DEPRECATED fixes:** для каждого `deprecatedFix`:
   - Прочитать rule, добавить/обновить `rule.deprecated = true`, сохранить.
   - Добавить в `deprecatedReport` для финального вывода.

3. **markDeprecated:** для каждого `name` в `markDeprecated[]`:
   - Прочитать rule по slug, `rule.deprecated = true`, сохранить.

4. **deletes:** для каждого `name`:
   - Удалить файл `rules/components/<slug>.rule.json` и `<slug>.raw.json` (если есть).

После всех изменений по всем либам:
- Вызвать `genIndex()` через `node tests/scripts/parseProps-utils.js gen-index` — `registry/index.json` пересоздаётся из rules.
- `git status` для проверки.

### Шаг 7 — Финальный отчёт + коммит

Лог:
```
✓ Готово.
  base-components:    3 stale fixes, 1 deprecated auto-set
  buttons-tabs-chips: 2 rules marked deprecated (REMOVED from Figma)
```

**Блок DEPRECATED (если непуст):**
```
🟠 DEPRECATED, проставлено автоматически:
  - X (Figma имя с ❌-префиксом)
  - Y
  - Z
Если случайно — `git revert <sha>` после коммита.
```

`AskUserQuestion`:
> «Закоммитить?»
- `[commit]` →
  ```bash
  git add rules/components/ registry/index.json
  git commit -m "chore(registry): sync from Figma (~<N> stale · <M> deprecated)"
  ```
- `[hold]` → ничего не коммитим.

**Push — никогда без отдельного запроса.**

Опционально (если настроен Telegram): `bash tools/notify-telegram.sh "syncKeys: ~<N> stale, <M> deprecated"`.

---

## Чего здесь нет (намеренно)

- **`use_figma` в скилле** — все Figma-вызовы внутри агентов.
- **REST API** — только MCP.
- **`config.json`** — fileKeys из `registry/libraries.json`.
- **Карта всех variants** (`variants.json`) — variant-axes резолвятся через `instance.setProperties()`. В rule хранится только variant-key default'а.
- **`keysHash`** — derived cache на месте, hash не нужен.
- **Регенерация index руками** — `genIndex()` делается автоматически в Шаге 6.

## Когда запускать

- При ошибках «componentKey not found» в `/builder` — компонент пересобрали, или появился `❌`-префикс.
- Когда Настя сказала «я переделала X в дизайн-системе» — синкаемся прицельно.
- Раз в неделю на всякий случай.
