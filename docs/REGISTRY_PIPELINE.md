# Registry Pipeline

Как данные попадают из Figma в каталог компонентов.

## Архитектура (#141)

```
rules/components/*.rule.json            ← SOURCE OF TRUTH
       │
       ▼
genIndex() (parseProps-utils.js)
       │
       ▼
registry/index.json                     ← DERIVED CACHE
       │  Builder читает только этот файл (~25KB, name → [lib, key, type, tier, approved])
       ▼
agents/builder/src/index.ts
```

**Принципы:**
- `rules/components/*.rule.json` — единственный источник правды. Содержит `name`, `slug`, `lib`, `key`, `type`, `tier`, `approved`, `deprecated?`, `variants`, `slots`, `booleans`, `textProps`, `doc`.
- `registry/index.json` — derived read-cache. Генерируется автоматически:
  - после `/parseProps apply` (через `parseProps-apply-figma.js` синхронно).
  - после `/syncKeys apply`.
  - вручную: `node tests/scripts/parseProps-utils.js gen-index`.
- `registry/libraries.json` — manifest библиотек (id, name, fileKey, pages.include/skip). Не выводится из rules; меняется только при добавлении новой Figma-библиотеки.
- `registry/libraries/numbers-paddings/variables.json` — переменные ДС (числа, паддинги, радиусы), не компоненты.

## Mutation pipelines

### `/parseProps "<name>"`

```
Figma MCP (search/import) → preflight (.rule.json existence)
        │
        ▼
parseProps-microtest.js (sandbox tests in Figma)
        │
        ▼
parseProps-apply-figma.js → writeJson(<slug>.rule.json) + genIndex()
        │
        ▼
git diff: один компонент → один rule + auto-regenerated index
```

### `/syncKeys`

```
Library Agent (libsPlan from registry/libraries.json)
        │
        ▼
For each lib, page: Component Agent → actual components from Figma
        │
        ▼
Diff vs expected (built from rules/components/*.rule.json):
    NEW → подсказка `/parseProps <name>`
    STALE → auto-fix rule.key
    DEPRECATED-by-Figma (❌/🚫 префикс) → auto-set rule.deprecated=true
    REMOVED → ask «mark deprecated / delete / keep»
        │
        ▼
Apply → правит rules → genIndex() → коммит (опционально)
```

## Структура registry/

```
registry/
├── libraries.json                    ← manifest (вход для /syncKeys)
├── index.json                        ← derived cache из rules
└── libraries/
    └── numbers-paddings/
        └── variables.json            ← переменные ДС (не компоненты)
```

## Особые библиотеки

**numbers-paddings** — библиотека переменных, не компонентов. Содержит только `variables.json` с коллекциями Device Presets и Const Paddings. В `index.libraries` не попадает (тип `variables-only` в `libraries.json`). Используется напрямую JSON Layout Agent через variables API.

## Где брать ключи компонентов

- **Bulk lookup в коде** (Builder, agents): `registry/index.json` → `components[<name>] = [lib, key, type, tier, approved]`.
- **Детали одного компонента** (Implementer, /parseProps): `rules/components/<slug>.rule.json`.
- **Live из Figma** (`/syncKeys`): через `mcp__figma__search_design_system` + Component Agent.

## Обновление ключей через Figma MCP

Если ключ устарел (компонент пересобрали в Figma): запустить `/syncKeys`. Скилл сам:
1. Соберёт actual из Figma через Library + Component Agents.
2. Покажет diff vs `rules/components/*.rule.json`.
3. По апруву — правит `rule.key` напрямую, дёргает `genIndex()`, коммитит.

Ручное обновление не нужно. Если очень надо — открой `rules/components/<slug>.rule.json`, поправь `key`, запусти `node tests/scripts/parseProps-utils.js gen-index`.
